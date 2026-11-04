// All Firestore access for the app. Live listeners are the only source of dashboard data:
// polling and refetching on every change would burn the Spark read quota.
import * as a from 'firebase/auth';
import * as f from 'firebase/firestore';
import {auth, db} from './firebase.js';
import './services/accounts.js';
import {dayKey, daysSince, TEST_DAYS, taskForDay, testerStage, validateReport, validateListing, parseTasks, DEFAULT_WANTED} from './domain.js';

export const accounts = globalThis.TesterHubAccounts.createAccounts({auth, authFns: a, db, storeFns: f});
export const humanError = err => globalThis.TesterHubAccounts.humanError(err);

const emptyData = () => ({projects: [], assignments: [], applications: [], reports: [], messages: []});
export const state = {user: null, data: emptyData(), listings: null, listingsAt: 0, synced: false, loadFailed: false};

const tidy = doc => ({id: doc.id, ...doc.data()});
const code = name => Object.assign(new Error(name), {code: name});

// With a persistent cache, offline writes queue silently. Saying "saved" would be a lie,
// so writes run only online and must be acknowledged by the server in time.
async function commit(write) {
  if (navigator.onLine === false) throw code('app/offline');
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(code('app/timeout')), 20000); });
  try { return await Promise.race([write(), timeout]); } finally { clearTimeout(timer); }
}

let unsubscribers = [], onChange = () => {}, onArrival = () => {};
export function stopLive() {
  for (const stop of unsubscribers) { try { stop(); } catch {} }
  unsubscribers = [];
  state.data = emptyData();
  state.listings = null;
  state.synced = false;
  state.loadFailed = false;
}

export function startLive(handlers) {
  stopLive();
  onChange = handlers.onChange;
  onArrival = handlers.onArrival;
  const {uid, role} = state.user;
  const owner = role === 'developer';
  const field = owner ? 'ownerUid' : 'testerUid';
  const specs = [
    ['assignments', f.query(f.collection(db, 'assignments'), f.where(field, '==', uid))],
    ['applications', f.query(f.collection(db, 'applications'), f.where(field, '==', uid))],
    ['reports', f.query(f.collection(db, 'reports'), f.where(field, '==', uid), f.orderBy('date', 'desc'), f.limit(400))],
    ['messages', f.query(f.collection(db, 'messages'), f.where(field, '==', uid), f.orderBy('createdAt', 'desc'), f.limit(300))],
  ];
  if (owner) specs.push(['projects', f.query(f.collection(db, 'projects'), f.where('ownerUid', '==', uid))]);
  let pending = new Set(specs.map(s => s[0]));
  for (const [name, q] of specs) {
    let first = true;
    unsubscribers.push(f.onSnapshot(q, snap => {
      state.data[name] = snap.docs.map(tidy);
      const arrivals = first ? [] : snap.docChanges().filter(c => c.type === 'added' && !c.doc.metadata.hasPendingWrites).map(c => tidy(c.doc));
      if (!snap.metadata.fromCache) first = false;
      pending.delete(name);
      state.synced = pending.size === 0;
      onChange(name);
      if (arrivals.length) onArrival(name, arrivals);
    }, err => {
      console.warn('listener', name, err.code);
      // Empty lists after a failed load would read as "you have nothing", which is false.
      state.loadFailed = true;
      pending.delete(name);
      state.synced = pending.size === 0;
      onChange(name);
    }));
  }
}

// Listings are fetched on demand and reused for five minutes.
export async function loadListings(force = false) {
  if (!force && state.listings && Date.now() - state.listingsAt < 300000) return state.listings;
  const q = f.query(f.collection(db, 'projects'), f.where('status', '==', 'recruiting'), f.where('listed', '==', true), f.orderBy('createdAt', 'desc'), f.limit(40));
  const snap = await f.getDocs(q);
  state.listings = snap.docs.map(tidy);
  state.listingsAt = Date.now();
  return state.listings;
}

export async function getListing(id) {
  const known = state.listings?.find(p => p.id === id);
  if (known) return known;
  const snap = await f.getDoc(f.doc(db, 'projects', id));
  return snap.exists() ? tidy(snap) : null;
}

/* ---------- developer ---------- */
export async function saveProject(input, {projectId, publish}) {
  const name = String(input.name || '').trim(), link = String(input.link || '').trim(), description = String(input.description || '').trim();
  const tasks = parseTasks(input.tasks);
  validateListing({name, link, tasks, description}, publish);
  const wanted = Math.min(100, Math.max(1, Number(input.testersWanted) || DEFAULT_WANTED));
  const fields = {name, link, tasks, description, testersWanted: wanted, listed: true};
  const owner = state.user;
  if (projectId) {
    const current = state.data.projects.find(p => p.id === projectId);
    const status = publish && current?.status === 'draft' ? 'recruiting' : current?.status || 'recruiting';
    await commit(() => f.updateDoc(f.doc(db, 'projects', projectId), {...fields, status}));
    return projectId;
  }
  const ref = f.doc(f.collection(db, 'projects'));
  await commit(() => f.setDoc(ref, {...fields, status: publish ? 'recruiting' : 'draft', ownerUid: owner.uid, ownerName: owner.name, createdAt: f.serverTimestamp()}));
  return ref.id;
}

export const setProjectStatus = (id, status) => commit(() => f.updateDoc(f.doc(db, 'projects', id), {status}));
export const discardDraft = id => commit(() => f.deleteDoc(f.doc(db, 'projects', id)));

export async function decideApplication(application, approved) {
  const batch = f.writeBatch(db);
  batch.update(f.doc(db, 'applications', application.id), {status: approved ? 'approved' : 'rejected', decidedAt: f.serverTimestamp()});
  if (approved) {
    const project = state.data.projects.find(p => p.id === application.projectId);
    if (!project || project.status !== 'recruiting') throw new Error('أعد فتح استقبال المختبرين أولاً حتى تقبل طلبات جديدة.');
    batch.set(f.doc(db, 'assignments', application.id), {
      projectId: project.id, testerUid: application.testerUid, ownerUid: state.user.uid,
      name: project.name, link: project.link, tasks: project.tasks || [],
      source: 'application', invitationStatus: 'accepted', testerName: application.testerName, testerEmail: application.testerEmail,
      joinedDay: null, checkins: [], createdAt: f.serverTimestamp(),
    });
  }
  await commit(() => batch.commit());
}

export async function markAddedToPlay(assignments) {
  // Rules evaluate each write with document lookups, so batches stay small.
  for (let i = 0; i < assignments.length; i += 8) {
    const batch = f.writeBatch(db);
    for (const x of assignments.slice(i, i + 8)) batch.update(f.doc(db, 'assignments', x.id), {addedToPlayAt: f.serverTimestamp()});
    await commit(() => batch.commit());
  }
}

const SYSTEM_TEXT = {
  fixed: 'أصلحت المشكلة التي أبلغت عنها. جرّبها بعد التحديث وأكد لي النتيجة من تقاريرك.',
  wontfix: 'راجعت المشكلة التي أبلغت عنها، وقررت عدم إصلاحها حالياً.',
  verified: 'جرّبت الإصلاح وتأكدت أن المشكلة انتهت.',
  reopened: 'جرّبت الإصلاح وما زالت المشكلة موجودة.',
};

export async function setIssueStatus(report, status) {
  const batch = f.writeBatch(db);
  batch.update(f.doc(db, 'reports', report.id), {status, statusAt: f.serverTimestamp()});
  const sender = state.user.role;
  batch.set(f.doc(f.collection(db, 'messages')), {
    assignmentId: report.assignmentId, projectId: report.projectId, testerUid: report.testerUid, ownerUid: report.ownerUid,
    sender, senderUid: state.user.uid, text: SYSTEM_TEXT[status], at: new Date().toISOString(), createdAt: f.serverTimestamp(),
  });
  await commit(() => batch.commit());
}

/* ---------- tester ---------- */
export async function applyToProject(project, {email, device, note}) {
  const clean = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error('أدخل بريد Google الصحيح.');
  const me = state.user, id = project.id + '_' + me.uid;
  const previous = state.data.applications.find(x => x.id === id);
  if (previous?.status === 'withdrawn') {
    await commit(() => f.updateDoc(f.doc(db, 'applications', id), {status: 'pending'}));
    return;
  }
  if (previous) throw new Error('قدّمت على هذا الاختبار من قبل.');
  await commit(() => f.setDoc(f.doc(db, 'applications', id), {
    projectId: project.id, projectName: project.name, ownerUid: project.ownerUid, testerUid: me.uid, testerName: me.name,
    testerEmail: clean, device: String(device || '').trim().slice(0, 80), note: String(note || '').trim().slice(0, 300),
    status: 'pending', createdAt: f.serverTimestamp(),
  }));
}

export const withdrawApplication = id => commit(() => f.updateDoc(f.doc(db, 'applications', id), {status: 'withdrawn'}));

export function respondInvite(id, status) {
  return commit(() => f.updateDoc(f.doc(db, 'assignments', id), {invitationStatus: status, respondedAt: f.serverTimestamp()}));
}

export function startTest(id) {
  return commit(() => f.updateDoc(f.doc(db, 'assignments', id), {joinedDay: dayKey(), joinedAt: f.serverTimestamp()}));
}

export const leaveTest = id => commit(() => f.updateDoc(f.doc(db, 'assignments', id), {leftAt: f.serverTimestamp()}));

export async function submitReport(assignmentId, input) {
  validateReport(input);
  const me = state.user, ref = f.doc(db, 'assignments', assignmentId), date = dayKey();
  const notes = String(input.notes || '').trim();
  await commit(() => f.runTransaction(db, async txn => {
    const current = await txn.get(ref);
    if (!current.exists() || current.data().testerUid !== me.uid) throw new Error('هذا الاختبار غير متاح لك.');
    const x = current.data();
    if (!x.joinedDay || daysSince(x.joinedDay) > TEST_DAYS) throw new Error('انتهت فترة هذا الاختبار.');
    if (x.checkins?.includes(date)) throw new Error('سجّلت تقرير اليوم من قبل.');
    if (testerStage(x) === 'cooldown') throw new Error('سجّلت تقريراً قبل قليل؛ التقرير التالي يفتح لاحقاً.');
    const at = new Date().toISOString();
    const report = {assignmentId, projectId: x.projectId, testerUid: me.uid, ownerUid: x.ownerUid, date, tested: taskForDay(x), outcome: input.outcome, notes,
      status: input.outcome === 'issue' ? 'new' : 'ok', createdAt: at, submittedAt: f.serverTimestamp()};
    if (input.device) report.device = String(input.device).trim().slice(0, 80);
    if (input.outcome === 'issue') Object.assign(report, {steps: String(input.steps).trim(), expected: String(input.expected || '').trim(), severity: input.severity});
    // Do not read a nonexistent report: participant-only rules deny that read.
    txn.set(f.doc(db, 'reports', `${assignmentId}_${date}`), report);
    txn.update(ref, {checkins: f.arrayUnion(date), lastCheckinAt: f.serverTimestamp()});
    if (input.outcome === 'issue') {
      txn.set(f.doc(f.collection(db, 'messages')), {assignmentId, projectId: x.projectId, testerUid: me.uid, ownerUid: x.ownerUid, sender: 'tester', senderUid: me.uid,
        text: 'بلاغ مشكلة: ' + notes, at, createdAt: f.serverTimestamp()});
    }
  }));
}

/* ---------- shared ---------- */
const retryIds = new Map();
export async function sendMessage(assignment, body) {
  const text = String(body || '').trim();
  if (text.length < 2 || text.length > 600) throw new Error('الرسالة يجب أن تكون بين حرفين و600 حرف.');
  const me = state.user, key = assignment.id + '|' + text;
  // A stable id per pending text makes a retry after a lost acknowledgement idempotent.
  if (!retryIds.has(key)) retryIds.set(key, crypto.randomUUID());
  const ref = f.doc(db, 'messages', retryIds.get(key));
  const data = {assignmentId: assignment.id, projectId: assignment.projectId, testerUid: assignment.testerUid, ownerUid: assignment.ownerUid,
    sender: me.role, senderUid: me.uid, text, at: new Date().toISOString(), createdAt: f.serverTimestamp()};
  try {
    await commit(() => f.setDoc(ref, data));
  } catch (err) {
    const saved = await f.getDocFromServer(ref).catch(() => null);
    if (!saved?.exists() || saved.data().text !== text) throw err;
  }
  retryIds.delete(key);
}

// merge keeps lastReminderAt, which only the reminder job writes.
export const savePushDevice = (id, token, reminderUtcHour) => commit(() => f.setDoc(f.doc(db, 'pushDevices', id), {uid: state.user.uid, token, reminderUtcHour, updatedAt: f.serverTimestamp()}, {merge: true}));
export const deletePushDevice = id => commit(() => f.deleteDoc(f.doc(db, 'pushDevices', id)));

export function flag(targetType, targetId, targetName, reason) {
  const text = String(reason || '').trim();
  if (text.length < 5) throw new Error('اكتب سبب البلاغ، 5 أحرف على الأقل.');
  return commit(() => f.addDoc(f.collection(db, 'flags'), {reporterUid: state.user.uid, targetType, targetId, targetName: String(targetName || '').slice(0, 100), reason: text.slice(0, 500), status: 'open', createdAt: f.serverTimestamp()}));
}

export function requestDeletion() {
  return commit(() => f.setDoc(f.doc(db, 'deletionRequests', state.user.uid), {email: auth.currentUser.email, status: 'open', createdAt: f.serverTimestamp()}));
}

export async function deletionRequested() {
  try {
    const request = await f.getDoc(f.doc(db, 'deletionRequests', state.user.uid));
    return request.exists() && request.data().status === 'open';
  } catch { return false; }
}

export async function isAdmin() {
  try {
    if (!auth.currentUser?.emailVerified) return false;
    const role = await f.getDoc(f.doc(db, 'adminRoles', auth.currentUser.uid));
    return role.exists() && role.data().active === true;
  } catch { return false; }
}

export const signOut = () => a.signOut(auth);
