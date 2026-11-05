import {before, after, beforeEach, test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDocs, updateDoc, deleteDoc, collection, query, where, orderBy, serverTimestamp} from 'firebase/firestore';
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: verified}).firestore();
const msg = (uid, sender, senderUid, extra = {}) => ({uid, sender, senderUid, text: 'مرحباً بك', createdAt: serverTimestamp(), ...extra});
beforeEach(async () => {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  for (const uid of ['owner', 'u1', 'u2', 'sup']) await setDoc(doc(d, 'users', uid), {name: 'User ' + uid, email: uid + '@example.com', role: 'tester', available: false});
  await setDoc(doc(d, 'adminRoles', 'owner'), {active: true});
  await setDoc(doc(d, 'staffRoles', 'sup'), {active: true, permissions: {viewUsers: true, deleteProjects: true, viewAudit: true}});
  await setDoc(doc(d, 'supportMessages', 'm1'), {uid: 'u1', sender: 'admin', senderUid: 'owner', text: 'رسالة لك'});
  await setDoc(doc(d, 'supportMessages', 'm2'), {uid: 'u2', sender: 'admin', senderUid: 'owner', text: 'رسالة لغيرك'});
 });
});
test('the owner writes to any existing user as the platform team', async () => {
 await assertSucceeds(setDoc(doc(db('owner'), 'supportMessages', 'a'), msg('u1', 'admin', 'owner')));
 await assertFails(setDoc(doc(db('owner'), 'supportMessages', 'b'), msg('ghost', 'admin', 'owner')));
});
test('nobody else can write as the platform team', async () => {
 for (const uid of ['u1', 'sup']) {
  await assertFails(setDoc(doc(db(uid), 'supportMessages', 'x' + uid), msg('u2', 'admin', uid)));
  await assertFails(setDoc(doc(db(uid), 'supportMessages', 'y' + uid), msg(uid, 'admin', uid)));
 }
 await assertFails(setDoc(doc(db('u1'), 'supportMessages', 'z'), msg('u1', 'admin', 'owner')));
});
test('a user replies only in their own thread and under their own name', async () => {
 await assertSucceeds(setDoc(doc(db('u1'), 'supportMessages', 'r'), msg('u1', 'user', 'u1')));
 await assertFails(setDoc(doc(db('u1'), 'supportMessages', 's'), msg('u2', 'user', 'u1')));
 await assertFails(setDoc(doc(db('u1'), 'supportMessages', 't'), msg('u1', 'user', 'u2')));
 await assertFails(setDoc(doc(db('u1', false), 'supportMessages', 'v'), msg('u1', 'user', 'u1')));
});
test('a suspended user can still write to appeal', async () => {
 await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users', 'u1'), {suspended: true}));
 await assertSucceeds(setDoc(doc(db('u1'), 'supportMessages', 'appeal'), msg('u1', 'user', 'u1')));
 await assertSucceeds(getDocs(query(collection(db('u1'), 'supportMessages'), where('uid', '==', 'u1'))));
});
test('threads are private: the user sees only theirs, the owner sees all, supervisors none', async () => {
 await assertSucceeds(getDocs(query(collection(db('u1'), 'supportMessages'), where('uid', '==', 'u1'))));
 await assertFails(getDocs(query(collection(db('u1'), 'supportMessages'), where('uid', '==', 'u2'))));
 await assertFails(getDocs(collection(db('u1'), 'supportMessages')));
 await assertSucceeds(getDocs(query(collection(db('owner'), 'supportMessages'), orderBy('createdAt', 'desc'))));
 await assertFails(getDocs(collection(db('sup'), 'supportMessages')));
 await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'supportMessages')));
});
test('messages cannot be edited, deleted, empty, too long or carry extra fields', async () => {
 await assertFails(updateDoc(doc(db('owner'), 'supportMessages', 'm1'), {text: 'changed'}));
 await assertFails(deleteDoc(doc(db('owner'), 'supportMessages', 'm1')));
 await assertFails(deleteDoc(doc(db('u1'), 'supportMessages', 'm1')));
 await assertFails(setDoc(doc(db('u1'), 'supportMessages', 'e'), msg('u1', 'user', 'u1', {text: 'x'})));
 await assertFails(setDoc(doc(db('u1'), 'supportMessages', 'f'), msg('u1', 'user', 'u1', {text: 'x'.repeat(1001)})));
 await assertFails(setDoc(doc(db('u1'), 'supportMessages', 'g'), msg('u1', 'user', 'u1', {sender: 'admin'})));
 await assertFails(setDoc(doc(db('u1'), 'supportMessages', 'h'), msg('u1', 'user', 'u1', {important: true})));
});
test('the owner reads every participation, report and message, and a normal user does not', async () => {
 for (const name of ['assignments', 'reports', 'messages', 'projects', 'users']) {
  await assertSucceeds(getDocs(collection(db('owner'), name)));
  await assertFails(getDocs(collection(db('u1'), name)));
 }
});
