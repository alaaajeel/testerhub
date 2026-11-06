import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDoc, getDocs, updateDoc, collection, query, where, getCountFromServer, serverTimestamp, Timestamp} from 'firebase/firestore';

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
