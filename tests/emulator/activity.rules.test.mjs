import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDoc, getDocs, updateDoc, writeBatch, collection, query, where, getCountFromServer, serverTimestamp, Timestamp} from 'firebase/firestore';

// Activity monitoring: each user writes only their own estimated last-seen; only the platform team reads it.
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: verified}).firestore();
const admin = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
const read = async (...path) => { let data; await admin(async d => { data = (await getDoc(doc(d, ...path))).data(); }); return data; };
const beat = (role, extra = {}) => ({role, lastSeenAt: serverTimestamp(), ...extra});
const minutesAgo = m => Timestamp.fromMillis(Date.now() - m * 60000);

beforeEach(async () => {
 await env.clearFirestore();
 await admin(async d => {
  for (const [uid, role] of [['t1', 'tester'], ['t2', 'tester'], ['d1', 'developer'], ['boss', 'tester'], ['sup', 'tester'], ['sup2', 'tester']])
   await setDoc(doc(d, 'users', uid), {name: 'User ' + uid, email: uid + '@example.com', role, available: true});
  await setDoc(doc(d, 'adminRoles', 'boss'), {active: true});
  await setDoc(doc(d, 'staffRoles', 'sup'), {active: true, permissions: {viewUsers: true}});
  await setDoc(doc(d, 'staffRoles', 'sup2'), {active: true, permissions: {viewReports: true}});
  await setDoc(doc(d, 'projects', 'p1'), {ownerUid: 'd1', name: 'App', status: 'recruiting'});
  await setDoc(doc(d, 'assignments', 'p1_t1'), {projectId: 'p1', testerUid: 't1', ownerUid: 'd1', joinedDay: '2026-11-05', checkins: ['2026-11-05']});
  await setDoc(doc(d, 'assignments', 'p1_t2'), {projectId: 'p1', testerUid: 't2', ownerUid: 'd1', joinedDay: null, checkins: [], invitationStatus: 'pending'});
 });
});

test('a user records their own last-seen with server time and their real role', async () => {
 await assertSucceeds(setDoc(doc(db('t1'), 'presence', 't1'), beat('tester', {lastActionAt: serverTimestamp()})));
 const p = await read('presence', 't1');
 assert.ok(p.lastSeenAt instanceof Timestamp); assert.ok(p.lastActionAt instanceof Timestamp);
 await assertFails(setDoc(doc(db('t2'), 'presence', 't2'), beat('developer')));                     // not their role
 await assertFails(setDoc(doc(db('t2'), 'presence', 't2'), {role: 'tester', lastSeenAt: minutesAgo(1)})); // client time
 await assertFails(setDoc(doc(db('t2'), 'presence', 't2'), beat('tester', {email: 'x'})));          // extra field
 await assertFails(setDoc(doc(db('t2', false), 'presence', 't2'), beat('tester')));                  // unverified
});

test('nobody writes another user\'s activity', async () => {
 await assertFails(setDoc(doc(db('t1'), 'presence', 't2'), beat('tester')));
 await assertFails(setDoc(doc(db('boss'), 'presence', 't2'), beat('tester')));
});

test('writes are rate-limited on the server and keep the last action unless it is new', async () => {
 await admin(d => setDoc(doc(d, 'presence', 't1'), {role: 'tester', lastSeenAt: minutesAgo(0.1), lastActionAt: minutesAgo(5)}));
 await assertFails(setDoc(doc(db('t1'), 'presence', 't1'), beat('tester'), {merge: true}));         // under 20 s
 await admin(d => setDoc(doc(d, 'presence', 't1'), {role: 'tester', lastSeenAt: minutesAgo(1), lastActionAt: minutesAgo(5)}));
 await assertFails(setDoc(doc(db('t1'), 'presence', 't1'), beat('tester', {lastActionAt: minutesAgo(1)}), {merge: true}));
 await assertSucceeds(setDoc(doc(db('t1'), 'presence', 't1'), beat('tester'), {merge: true}));
 assert.equal((await read('presence', 't1')).lastActionAt.toMillis() < Date.now() - 4 * 60000, true);
});

test('only the platform owner and staff allowed to see users read activity', async () => {
 await admin(d => setDoc(doc(d, 'presence', 't1'), {role: 'tester', lastSeenAt: minutesAgo(1)}));
 await assertSucceeds(getDoc(doc(db('boss'), 'presence', 't1')));
 await assertSucceeds(getDocs(collection(db('sup'), 'presence')));
 await assertFails(getDocs(collection(db('sup2'), 'presence')));
 await assertFails(getDoc(doc(db('t1'), 'presence', 't1')));                                         // not even their own
 await assertFails(getDoc(doc(db('d1'), 'presence', 't1')));                                         // nor app owners
 const c = await assertSucceeds(getCountFromServer(query(collection(db('boss'), 'presence'), where('role', '==', 'tester'), where('lastSeenAt', '>=', minutesAgo(1440)))));
 assert.equal(c.data().count, 1);
});

test('a tester stamps "seen" on their running participation, at most hourly; only its owner reads it', async () => {
 await assertSucceeds(updateDoc(doc(db('t1'), 'assignments', 'p1_t1'), {testerSeenAt: serverTimestamp()}));
 await assertFails(updateDoc(doc(db('t1'), 'assignments', 'p1_t1'), {testerSeenAt: serverTimestamp()}));     // within the hour
 await admin(d => updateDoc(doc(d, 'assignments', 'p1_t1'), {testerSeenAt: minutesAgo(61)}));
 await assertSucceeds(updateDoc(doc(db('t1'), 'assignments', 'p1_t1'), {testerSeenAt: serverTimestamp()}));
 await admin(d => updateDoc(doc(d, 'assignments', 'p1_t1'), {testerSeenAt: minutesAgo(61)}));
 await assertFails(updateDoc(doc(db('t1'), 'assignments', 'p1_t1'), {testerSeenAt: serverTimestamp(), checkins: []})); // nothing else
 await assertFails(updateDoc(doc(db('t1'), 'assignments', 'p1_t1'), {testerSeenAt: minutesAgo(0)}));                  // client time
 await assertFails(updateDoc(doc(db('d1'), 'assignments', 'p1_t1'), {testerSeenAt: serverTimestamp()}));            // not the tester
 await assertFails(updateDoc(doc(db('t2'), 'assignments', 'p1_t2'), {testerSeenAt: serverTimestamp()}));            // not started
 await assertSucceeds(getDoc(doc(db('d1'), 'assignments', 'p1_t1')));
 await assertFails(getDoc(doc(db('t2'), 'assignments', 'p1_t1')));
});

test('activity never changes reports, the 14-day counter or XP', async () => {
 const day = new Date().toISOString().slice(0, 10), t1 = db('t1'), ref = doc(t1, 'assignments', 'p3_t1');
 await admin(async d => {
  await setDoc(doc(d, 'projects', 'p3'), {ownerUid: 'd1', name: 'App', link: 'https://play.google.com/apps/testing/x'});
  await setDoc(doc(d, 'assignments', 'p3_t1'), {ownerUid: 'd1', testerUid: 't1', projectId: 'p3', joinedDay: null, checkins: []});
 });
 await assertSucceeds(updateDoc(ref, {joinedDay: day, joinedAt: serverTimestamp()}));
 // Stamping "seen" and presence before the report.
 await assertSucceeds(updateDoc(ref, {testerSeenAt: serverTimestamp()}));
 await assertSucceeds(setDoc(doc(t1, 'presence', 't1'), beat('tester', {lastActionAt: serverTimestamp()})));
 const before = await read('assignments', 'p3_t1');
 assert.equal(before.joinedDay, day); assert.deepEqual(before.checkins, []); assert.equal('lastCheckinAt' in before, false);
 // The seen stamp cannot carry a check-in, a start day or a report time.
 await admin(d => updateDoc(doc(d, 'assignments', 'p3_t1'), {testerSeenAt: minutesAgo(61)}));
 for (const extra of [{checkins: [day]}, {joinedDay: '2000-01-01'}, {lastCheckinAt: serverTimestamp()}])
  await assertFails(updateDoc(ref, {testerSeenAt: serverTimestamp(), ...extra}));
 // The daily report still works exactly as before, once per day.
 const report = {assignmentId: 'p3_t1', projectId: 'p3', testerUid: 't1', ownerUid: 'd1', tested: 'فتح التطبيق وتجربة وظيفة أساسية', outcome: 'ok', notes: 'Worked as expected', status: 'ok', createdAt: new Date().toISOString(), submittedAt: serverTimestamp(), date: day};
 const send = () => { const b = writeBatch(t1); b.set(doc(t1, 'reports', 'p3_t1_' + day), report); b.update(ref, {checkins: [day], lastCheckinAt: serverTimestamp()}); return b.commit(); };
 await assertSucceeds(send());
 await assertFails(send());
 const after = await read('assignments', 'p3_t1');
 assert.deepEqual(after.checkins, [day]); assert.equal(after.joinedDay, day);
 // Activity writes never create XP records.
 let xp = 0; await admin(async d => { xp = (await getDocs(collection(d, 'xpTotals'))).size + (await getDocs(collection(d, 'xpAssignments'))).size; });
 assert.equal(xp, 0);
});

test('another developer sees nothing of a tester\'s activity, here or in their own app', async () => {
 await admin(async d => {
  await setDoc(doc(d, 'users', 'd2'), {name: 'User d2', email: 'd2@example.com', role: 'developer', available: false});
  await setDoc(doc(d, 'assignments', 'p2_t1'), {projectId: 'p2', testerUid: 't1', ownerUid: 'd2', joinedDay: '2026-11-05', checkins: []});
 });
 await assertSucceeds(updateDoc(doc(db('t1'), 'assignments', 'p1_t1'), {testerSeenAt: serverTimestamp()}));
 await assertFails(getDoc(doc(db('d2'), 'assignments', 'p1_t1')));
 await assertFails(getDocs(query(collection(db('d2'), 'assignments'), where('testerUid', '==', 't1'))));
 await assertFails(getDoc(doc(db('d2'), 'presence', 't1')));
 // Their own record of the same tester never carries the other app's stamp.
 const own = (await assertSucceeds(getDoc(doc(db('d2'), 'assignments', 'p2_t1')))).data();
 assert.equal('testerSeenAt' in own, false);
});
