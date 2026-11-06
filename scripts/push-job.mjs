// One run of the scheduled push job. The database and messaging clients are passed in so tests use the emulator.
import {Timestamp} from 'firebase-admin/firestore';

const TEST_DAYS = 14, DAY_MS = 86400000, HOUR_MS = 3600000;
const RESEND_GAP_MS = 20 * HOUR_MS, STALE_MS = 60 * DAY_MS, FIRST_RUN_MS = 30 * 60000, MAX_CATCH_UP_MS = 6 * HOUR_MS;
const FCM_BATCH = 500, WRITE_BATCH = 400, IN_LIMIT = 30, READ_LIMIT = 500;
// Only answers that are about the token itself; anything else could be our own fault and must not lose devices.
const DEAD_TOKEN = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
const CLOSED_PROJECT = new Set(['archived', 'deleting']);
const APP_URL = './index.html';

const chunks = (list, size) => Array.from({length: Math.ceil(list.length / size)}, (_, i) => list.slice(i * size, (i + 1) * size));
const dayKey = date => date.toISOString().slice(0, 10);
function daysSince(key, now) {
  const [y, m, d] = String(key).split('-').map(Number);
  return Math.max(1, Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(y, m - 1, d)) / DAY_MS) + 1);
}
// Mirrors classifyTesterWork in index.html: the same assignment must not be "due" here and "done" in the app.
function isDue(a, now) {
  if (!a.joinedDay || a.leftAt || a.invitationStatus === 'declined') return false;
  if (daysSince(a.joinedDay, now) > TEST_DAYS) return false;
  if ((a.checkins || []).includes(dayKey(now))) return false;
  const last = a.lastCheckinAt?.toMillis?.();
  return !(Number.isFinite(last) && now.getTime() - last < 14 * HOUR_MS);
}
function taskFor(a, now) {
  const tasks = a.tasks;
  if (!Array.isArray(tasks) || !tasks.length) return 'فتح التطبيق وتجربة وظيفة أساسية';
  return tasks[Math.max(0, daysSince(a.joinedDay, now) - 1) % tasks.length];
}
function reminderFor(due, now) {
  if (!due.length) return null;
  const body = due.length === 1 ? `${due[0].name || 'تطبيقك'}: ${taskFor(due[0], now)}` : `لديك ${due.length} تطبيقات بانتظار تقريرك اليوم`;
  return {title: 'حان وقت اختبار اليوم', body: body.slice(0, 180), url: APP_URL, tag: 'testerhub-daily'};
}
function activityFor(events) {
  if (events.length === 1) {
    const e = events[0];
    const titles = {message: 'TesterHub — رسالة جديدة', support: 'TesterHub — رسالة من الإدارة', supportReply: 'TesterHub — رد من مستخدم'};
    if (e.kind === 'invite') return {title: 'TesterHub — اختبار جديد', body: 'وصلك رابط اختبار ' + String(e.name || 'تطبيق جديد').slice(0, 80), url: APP_URL, tag: 'testerhub-activity'};
    return {title: titles[e.kind], body: String(e.text || 'وصلتك رسالة').slice(0, 110), url: e.kind === 'supportReply' ? './admin.html' : APP_URL, tag: 'testerhub-activity'};
  }
  const invites = events.filter(e => e.kind === 'invite').length, notes = events.length - invites;
  const parts = [];
  if (invites) parts.push(`${invites} دعوة`);
  if (notes) parts.push(`${notes} رسالة`);
  return {title: 'TesterHub — جديد لك', body: 'لديك ' + parts.join(' و'), url: APP_URL, tag: 'testerhub-activity'};
}

async function commitAll(db, refs, write) {
  for (const part of chunks(refs, WRITE_BATCH)) {
    const batch = db.batch();
    for (const ref of part) write(batch, ref);
    await batch.commit();
  }
}
// Sends one message per device; `messageFor` returns the payload for a device, or nothing to skip it.
async function deliver(messaging, devices, messageFor, ttl) {
  const targets = devices.filter(doc => messageFor(doc));
  const delivered = [], dead = [];
  let failed = 0;
  for (const part of chunks(targets, FCM_BATCH)) {
    const result = await messaging.sendEach(part.map(doc => ({
      token: doc.get('token'),
      // FCM data values must be strings, and all of these are.
      data: messageFor(doc),
      webpush: {headers: {TTL: String(ttl), Urgency: 'high'}},
    })));
    result.responses.forEach((response, i) => {
      if (response.success) delivered.push(part[i].ref);
      else if (DEAD_TOKEN.has(response.error?.code)) dead.push(part[i].ref);
      else failed++;
    });
  }
  return {delivered, dead, failed};
}
async function activeUsers(db, uids) {
  const missing = new Set(), active = new Set();
  if (uids.length) {
    const users = await db.getAll(...uids.map(uid => db.collection('users').doc(uid)));
    for (const snap of users) {
      if (!snap.exists) missing.add(snap.id);
      else if (snap.get('suspended') !== true) active.add(snap.id);
    }
  }
  return {missing, active};
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
  const {missing, active} = await activeUsers(db, [...new Set(devices.map(doc => doc.get('uid')))]);
  const lists = new Map(await Promise.all([...active].map(async uid => {
    const list = await db.collection('assignments').where('testerUid', '==', uid).get();
    return [uid, list.docs.map(doc => ({id: doc.id, ...doc.data()})).filter(a => isDue(a, now))];
  })));
  const projectIds = [...new Set([...lists.values()].flat().map(a => a.projectId))];
  const open = new Set();
  if (projectIds.length) {
    const projects = await db.getAll(...projectIds.map(id => db.collection('projects').doc(id)));
    for (const doc of projects) if (doc.exists && !CLOSED_PROJECT.has(doc.get('status'))) open.add(doc.id);
  }
  const messages = new Map();
  for (const [uid, due] of lists) {
    const message = reminderFor(due.filter(a => open.has(a.projectId)), now);
    if (message) messages.set(uid, message);
  }
  const {delivered, dead, failed} = await deliver(messaging, devices, doc => messages.get(doc.get('uid')), 8 * 3600);
  dead.push(...stale, ...devices.filter(doc => missing.has(doc.get('uid'))).map(doc => doc.ref));
  const stamp = Timestamp.fromDate(now);
  await commitAll(db, delivered, (batch, ref) => batch.update(ref, {lastReminderAt: stamp}));
  await commitAll(db, dead, (batch, ref) => batch.delete(ref));
  return {sent: delivered.length, failed, removed: dead.length};
}

export async function runActivity({db, messaging, now = new Date()}) {
  const cursorRef = db.collection('pushState').doc('activity');
  const saved = (await cursorRef.get()).get('lastRunAt')?.toMillis();
  // A long outage must not bury people in old news, and the first run must not replay history.
  const since = Math.max(saved ?? now.getTime() - FIRST_RUN_MS, now.getTime() - MAX_CATCH_UP_MS);
  const range = name => db.collection(name).where('createdAt', '>', Timestamp.fromMillis(since)).where('createdAt', '<=', Timestamp.fromDate(now)).orderBy('createdAt').limit(READ_LIMIT).get();
  const [messageDocs, inviteDocs, supportDocs] = await Promise.all([range('messages'), range('assignments'), range('supportMessages')]);
  const events = new Map();
  const add = (uid, event) => { if (uid) events.set(uid, [...(events.get(uid) || []), event]); };
  for (const doc of messageDocs.docs) {
    const m = doc.data();
    add(m.sender === 'tester' ? m.ownerUid : m.testerUid, {kind: 'message', text: m.text});
  }
  for (const doc of inviteDocs.docs) {
    const a = doc.data();
    if (a.invitationStatus === 'pending') add(a.testerUid, {kind: 'invite', name: a.name});
  }
  // A user writing to the platform team reaches every active owner account.
  const admins = supportDocs.docs.some(d => d.get('sender') === 'user')
    ? (await db.collection('adminRoles').where('active', '==', true).get()).docs.map(d => d.id) : [];
  for (const doc of supportDocs.docs) {
    const m = doc.data();
    if (m.sender === 'admin') add(m.uid, {kind: 'support', text: m.text});
    else for (const uid of admins) add(uid, {kind: 'supportReply', text: m.text});
  }
  const uids = [...events.keys()];
  const {missing, active} = await activeUsers(db, uids);
  const devices = [];
  for (const part of chunks(uids.filter(uid => active.has(uid)), IN_LIMIT)) {
    const snap = await db.collection('pushDevices').where('uid', 'in', part).get();
    devices.push(...snap.docs);
  }
  const {delivered, dead, failed} = await deliver(messaging, devices, doc => activityFor(events.get(doc.get('uid'))), 24 * 3600);
  await commitAll(db, dead, (batch, ref) => batch.delete(ref));
  // Keep the cursor when nothing got through, so a messaging outage delays news instead of losing it.
  const fellOver = failed > 0 && delivered.length === 0;
  if (!fellOver) await cursorRef.set({lastRunAt: Timestamp.fromDate(now)});
  return {events: uids.length, skippedMissing: missing.size, sent: delivered.length, failed, removed: dead.length};
}
