// One run of the daily push job. The database and messaging clients are passed in so tests use the emulator.
import {Timestamp} from 'firebase-admin/firestore';
import {reminderMessage} from '../src/domain.js';

const RESEND_GAP_MS = 20 * 3600000, STALE_MS = 60 * 86400000, FCM_BATCH = 500, WRITE_BATCH = 400;
// Only answers that are about the token itself; anything else could be our own fault and must not lose devices.
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
const CLOSED_PROJECT = new Set(['archived', 'deleting']);

const chunks = (list, size) => Array.from({length: Math.ceil(list.length / size)}, (_, i) => list.slice(i * size, (i + 1) * size));

async function commitAll(db, refs, write) {
  for (const part of chunks(refs, WRITE_BATCH)) {
    const batch = db.batch();
    for (const ref of part) write(batch, ref);
    await batch.commit();
  }
}

// The message for each account that should hear from us now, read once per account to protect the Spark quota.
async function plan(db, uids, now) {
  const missing = new Set(), messages = new Map();
  if (!uids.length) return {missing, messages};
  const users = await db.getAll(...uids.map(uid => db.collection('users').doc(uid)));
  const active = users.filter(snap => {
    if (!snap.exists) missing.add(snap.id);
    return snap.exists && snap.get('suspended') !== true;
  }).map(snap => snap.id);
  const lists = new Map(await Promise.all(active.map(async uid => {
    const snap = await db.collection('assignments').where('testerUid', '==', uid).get();
    return [uid, snap.docs.map(doc => ({id: doc.id, ...doc.data()})).filter(a => reminderMessage([a], now))];
  })));
  const projectIds = [...new Set([...lists.values()].flat().map(a => a.projectId))];
  const open = new Set();
  if (projectIds.length) {
    const projects = await db.getAll(...projectIds.map(id => db.collection('projects').doc(id)));
    for (const snap of projects) if (snap.exists && !CLOSED_PROJECT.has(snap.get('status'))) open.add(snap.id);
  }
  for (const [uid, due] of lists) {
    const message = reminderMessage(due.filter(a => open.has(a.projectId)), now);
    if (message) messages.set(uid, message);
  }
  return {missing, messages};
}

export async function runReminders({db, messaging, now = new Date()}) {
  // Scheduled runs can be late or skipped, so each run also covers the previous hour; lastReminderAt stops repeats.
  const hour = now.getUTCHours();
  const snap = await db.collection('pushDevices').where('reminderUtcHour', 'in', [hour, (hour + 23) % 24]).get();
  const stale = [], devices = [];
  for (const doc of snap.docs) {
    const {updatedAt, lastReminderAt} = doc.data();
    if (now - (updatedAt?.toMillis() ?? 0) > STALE_MS) stale.push(doc.ref);
    else if (now - (lastReminderAt?.toMillis() ?? 0) >= RESEND_GAP_MS) devices.push(doc);
  }
  const {missing, messages} = await plan(db, [...new Set(devices.map(doc => doc.get('uid')))], now);
  const dead = [...stale, ...devices.filter(doc => missing.has(doc.get('uid'))).map(doc => doc.ref)];
  const targets = devices.filter(doc => messages.has(doc.get('uid')));
  const delivered = [];
  let failed = 0;
  for (const part of chunks(targets, FCM_BATCH)) {
    const result = await messaging.sendEach(part.map(doc => ({
      token: doc.get('token'),
      // FCM data values must be strings, and all three are.
      data: messages.get(doc.get('uid')),
      webpush: {headers: {TTL: '28800', Urgency: 'high'}},
    })));
    result.responses.forEach((response, i) => {
      if (response.success) delivered.push(part[i].ref);
      else if (DEAD_TOKEN.has(response.error?.code)) dead.push(part[i].ref);
      else failed++;
    });
  }
  const stamp = Timestamp.fromDate(now);
  await commitAll(db, delivered, (batch, ref) => batch.update(ref, {lastReminderAt: stamp}));
  await commitAll(db, dead, (batch, ref) => batch.delete(ref));
  return {checked: snap.size, sent: delivered.length, failed, removed: dead.length};
}
