import {before, after, beforeEach, test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDoc, getDocs, updateDoc, collection, serverTimestamp} from 'firebase/firestore';
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: verified}).firestore();
const LINK = 'https://play.google.com/apps/testing/com.audit.app';
const invite = (uid, extra = {}) => ({projectId: 'p1', testerUid: uid, ownerUid: 'd1', name: 'App', link: LINK, tasks: ['Test login screen'], invitationStatus: 'pending', joinedDay: null, checkins: [], createdAt: serverTimestamp(), ...extra});
beforeEach(async () => {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  for (const [uid, role, available] of [['t1', 'tester', true], ['t2', 'tester', true], ['t3', 'tester', false], ['d1', 'developer', false], ['d2', 'developer', false], ['boss', 'tester', false]]) await setDoc(doc(d, 'users', uid), {name: uid, email: uid + '@example.com', role, available, createdAt: serverTimestamp()});
  await setDoc(doc(d, 'adminRoles', 'boss'), {active: true});
  await setDoc(doc(d, 'projects', 'p1'), {name: 'App', link: LINK, tasks: ['Test login screen'], ownerUid: 'd1', ownerName: 'd1', status: 'recruiting', testersCount: 1, selectedTesterUids: ['t1']});
 });
});
test('the owner can invite a replacement tester after publishing', async () => {
 const d = db('d1');
 await assertFails(setDoc(doc(d, 'assignments', 'p1_t2'), invite('t2')), 'not selected yet');
 await assertSucceeds(updateDoc(doc(d, 'projects', 'p1'), {selectedTesterUids: ['t1', 't2'], testersCount: 2}));
 await assertSucceeds(setDoc(doc(d, 'assignments', 'p1_t2'), invite('t2')));
});
test('the selection can only grow, without duplicates or a false count', async () => {
 const ref = doc(db('d1'), 'projects', 'p1');
 await assertFails(updateDoc(ref, {selectedTesterUids: ['t2'], testersCount: 1}));
 await assertFails(updateDoc(ref, {selectedTesterUids: ['t1', 't1'], testersCount: 2}));
 await assertFails(updateDoc(ref, {selectedTesterUids: ['t1', 't2'], testersCount: 5}));
 await assertFails(updateDoc(ref, {selectedTesterUids: ['t1', 't2'], testersCount: 2, name: 'Renamed'}));
});
test('another developer or a tester cannot add testers', async () => {
 for (const ctx of [db('d2'), db('t1'), db('d1', false)]) await assertFails(updateDoc(doc(ctx, 'projects', 'p1'), {selectedTesterUids: ['t1', 't2'], testersCount: 2}));
});
test('a tester who hid their email cannot be invited even if selected', async () => {
 const d = db('d1');
 await updateDoc(doc(d, 'projects', 'p1'), {selectedTesterUids: ['t1', 't3'], testersCount: 2});
 await assertFails(setDoc(doc(d, 'assignments', 'p1_t3'), invite('t3')));
});
test('archived or draft apps do not take new testers this way', async () => {
 await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'projects', 'p1'), {status: 'archived'}));
 await assertFails(updateDoc(doc(db('d1'), 'projects', 'p1'), {selectedTesterUids: ['t1', 't2'], testersCount: 2}));
});
test('a suspended user reads only their own profile, to learn why they are blocked', async () => {
 await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users', 't1'), {suspended: true}));
 await assertSucceeds(getDoc(doc(db('t1'), 'users', 't1')));
 await assertFails(updateDoc(doc(db('t1'), 'users', 't1'), {suspended: false}));
 await assertFails(getDoc(doc(db('t1'), 'projects', 'p1')));
});
test('deletion requests are self-service and only the admin processes them', async () => {
 const request = {email: 't1@example.com', status: 'open', createdAt: serverTimestamp()};
 await assertFails(setDoc(doc(db('t2'), 'deletionRequests', 't1'), request));
 await assertFails(setDoc(doc(db('t1'), 'deletionRequests', 't1'), {...request, email: 'other@example.com'}));
 await assertFails(setDoc(doc(db('t1'), 'deletionRequests', 't1'), {...request, status: 'processed'}));
 await assertSucceeds(setDoc(doc(db('t1'), 'deletionRequests', 't1'), request));
 await assertFails(getDoc(doc(db('t2'), 'deletionRequests', 't1')));
 await assertFails(getDocs(collection(db('d1'), 'deletionRequests')));
 await assertFails(updateDoc(doc(db('t1'), 'deletionRequests', 't1'), {status: 'processed', processedAt: serverTimestamp()}));
 await assertSucceeds(getDocs(collection(db('boss'), 'deletionRequests')));
 await assertSucceeds(updateDoc(doc(db('boss'), 'deletionRequests', 't1'), {status: 'processed', processedAt: serverTimestamp()}));
});
