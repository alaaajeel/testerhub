import {before, after, beforeEach, test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {allowPublish, publish, publishBatch} from './publish-helper.mjs';
import {doc, setDoc, getDoc, getDocs, updateDoc, collection, query, where, serverTimestamp} from 'firebase/firestore';
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: verified}).firestore();
const LINK = 'https://play.google.com/apps/testing/com.audit.app';
const project = (ownerUid, testers) => ({name: 'App', link: LINK, tasks: ['Test login screen'], ownerUid, ownerName: 'User ' + ownerUid, createdAt: serverTimestamp(), testersCount: testers.length, selectedTesterUids: testers});
const invite = (pid, ownerUid, testerUid) => ({projectId: pid, testerUid, ownerUid, name: 'App', link: LINK, tasks: ['Test login screen'], invitationStatus: 'pending', joinedDay: null, checkins: [], createdAt: serverTimestamp()});
beforeEach(async () => {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  for (const [uid, role, available] of [['a', 'tester', true], ['b', 'developer', true], ['c', 'developer', false], ['hidden', 'tester', false]]) await setDoc(doc(d, 'users', uid), {name: 'User ' + uid, email: uid + '@example.com', role, available, createdAt: serverTimestamp()});
 });
});
test('one account switches both ways and keeps its consent', async () => {
 const ref = doc(db('a'), 'users', 'a');
 await assertSucceeds(updateDoc(ref, {role: 'developer'}));
 await assertSucceeds(updateDoc(ref, {role: 'tester'}));
 await assertSucceeds(updateDoc(ref, {role: 'developer', available: true}));
});
test('switching can never become a privilege or touch someone else', async () => {
 const ref = doc(db('a'), 'users', 'a');
 for (const role of ['admin', 'owner', 'staff', '']) await assertFails(updateDoc(ref, {role}));
 await assertFails(updateDoc(ref, {role: 'developer', suspended: false}));
 await assertFails(updateDoc(doc(db('a'), 'users', 'b'), {role: 'tester'}));
});
test('a suspended account cannot switch', async () => {
 await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users', 'a'), {suspended: true}));
 await assertFails(updateDoc(doc(db('a'), 'users', 'a'), {role: 'developer'}));
});
test('consent, not the current view, decides who appears to developers', async () => {
 const d = db('b');
 await assertSucceeds(getDocs(query(collection(d, 'users'), where('available', '==', true))));
 await assertSucceeds(getDoc(doc(d, 'users', 'a')));
 await assertFails(getDoc(doc(d, 'users', 'hidden')));
 await assertFails(getDoc(doc(d, 'users', 'c')));
 await assertFails(getDocs(collection(d, 'users')));
 // V2: one account. Any verified member may list who consented; hidden and unconsented stay out (above).
 await assertSucceeds(getDocs(query(collection(db('a'), 'users'), where('available', '==', true))));
});
test('two people can exchange tests, whichever view the other is in', async () => {
 await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users', 'a'), {role: 'developer'}));
 await assertSucceeds(publish(env, db('a'), 'a', 'pa', project('a', ['b'])));
 await assertSucceeds(setDoc(doc(db('a'), 'assignments', 'pa_b'), invite('pa', 'a', 'b')));
 await assertSucceeds(publish(env, db('b'), 'b', 'pb', project('b', ['a'])));
 await assertSucceeds(setDoc(doc(db('b'), 'assignments', 'pb_a'), invite('pb', 'b', 'a')));
});
test('nobody can invite themself to their own test', async () => {
 await assertSucceeds(publish(env, db('b'), 'b', 'self', project('b', ['b'])));
 await assertFails(setDoc(doc(db('b'), 'assignments', 'self_b'), invite('self', 'b', 'b')));
});
test('someone who hid their email cannot be invited', async () => {
 await publish(env, db('b'), 'b', 'p', project('b', ['hidden']));
 await assertFails(setDoc(doc(db('b'), 'assignments', 'p_hidden'), invite('p', 'b', 'hidden')));
});
test('an unverified account may switch view but gains nothing from it', async () => {
 await assertSucceeds(updateDoc(doc(db('a', false), 'users', 'a'), {role: 'developer'}));
 await allowPublish(env, 'a');
 await assertFails(publishBatch(db('a', false), 'a', 'nope', project('a', ['b'])).commit());
 await assertFails(getDocs(query(collection(db('a', false), 'users'), where('available', '==', true))));
});
test('V2: the stored role is not a gate; ownership is', async () => {
 // 'a' is stored as a tester and may still publish its own app.
 await allowPublish(env, 'a');
 await assertSucceeds(publishBatch(db('a'), 'a', 'mine', project('a', ['b'])).commit());
 // Nobody may publish in someone else's name or touch their app.
 await assertFails(publishBatch(db('a'), 'b', 'forged', project('b', ['a'])).commit());
 await publish(env, db('b'), 'b', 'keep', project('b', ['a']));
 await updateDoc(doc(db('b'), 'users', 'b'), {role: 'tester'});
 await assertSucceeds(getDoc(doc(db('b'), 'projects', 'keep')));
 await assertFails(updateDoc(doc(db('a'), 'projects', 'keep'), {name: 'Stolen'}));
 await assertFails(getDoc(doc(db('a'), 'projects', 'keep')));
});
test('the other view can be counted for the home reminder', async () => {
 await assertSucceeds(getDocs(query(collection(db('a'), 'assignments'), where('testerUid', '==', 'a'))));
 await assertSucceeds(getDocs(query(collection(db('a'), 'reports'), where('ownerUid', '==', 'a'), where('outcome', '==', 'issue'), where('status', '==', 'new'))));
});
test('V2 attack: a suspended or unverified account gains nothing from developer() = verified()', async () => {
 await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users', 'a'), {suspended: true, available: false}));
 await allowPublish(env, 'a');
 await assertFails(publishBatch(db('a'), 'a', 'susp', project('a', ['b'])).commit());
 await assertFails(getDocs(query(collection(db('a'), 'users'), where('available', '==', true))));
 await allowPublish(env, 'c');
 await assertFails(publishBatch(db('c', false), 'c', 'unv', project('c', ['b'])).commit());
 // Listing everyone (not only those who consented) stays closed to every member.
 await assertFails(getDocs(collection(db('b'), 'users')));
});
