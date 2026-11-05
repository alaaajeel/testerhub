import {before, after, beforeEach, test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, updateDoc, serverTimestamp} from 'firebase/firestore';
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = uid => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: true}).firestore();
const LINK = 'https://play.google.com/apps/testing/com.audit.app', GROUP = 'https://groups.google.com/g/testerhub-app';
const project = (extra = {}) => ({name: 'App', link: LINK, tasks: ['Test login screen'], ownerUid: 'd1', ownerName: 'User d1', createdAt: serverTimestamp(), testersCount: 1, selectedTesterUids: ['t1'], ...extra});
const invite = (pid, extra = {}) => ({projectId: pid, testerUid: 't1', ownerUid: 'd1', name: 'App', link: LINK, tasks: ['Test login screen'], invitationStatus: 'pending', joinedDay: null, checkins: [], createdAt: serverTimestamp(), ...extra});
beforeEach(async () => {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  for (const [uid, role, available] of [['t1', 'tester', true], ['d1', 'developer', false], ['d2', 'developer', false]]) await setDoc(doc(d, 'users', uid), {name: 'User ' + uid, email: uid + '@example.com', role, available, createdAt: serverTimestamp()});
 });
});
test('the group link stays optional', async () => {
 await assertSucceeds(setDoc(doc(db('d1'), 'projects', 'plain'), project()));
 await assertSucceeds(setDoc(doc(db('d1'), 'assignments', 'plain_t1'), invite('plain')));
});
test('a Google Groups link is accepted and reaches the invitation', async () => {
 await assertSucceeds(setDoc(doc(db('d1'), 'projects', 'p'), project({groupLink: GROUP})));
 await assertSucceeds(setDoc(doc(db('d1'), 'assignments', 'p_t1'), invite('p', {groupLink: GROUP})));
});
test('only Google Groups can be linked', async () => {
 const bad = ['https://evil.example/g/x', 'http://groups.google.com/g/x', 'https://groups.google.com.evil.io/g/x', 'https://evil.example/https://groups.google.com/x', 'javascript:alert(1)', 'https://groups.google.com/', 'https://groups.google.com/g/a b', 42];
 for (const [i, groupLink] of bad.entries()) await assertFails(setDoc(doc(db('d1'), 'projects', 'bad' + i), project({groupLink})), String(groupLink));
});
test('an invitation cannot carry a link other than the app\'s own', async () => {
 await setDoc(doc(db('d1'), 'projects', 'p'), project({groupLink: GROUP}));
 await assertFails(setDoc(doc(db('d1'), 'assignments', 'p_t1'), invite('p', {groupLink: 'https://groups.google.com/g/other'})));
 await assertFails(setDoc(doc(db('d1'), 'assignments', 'p_t1'), invite('p')), 'dropping the link is refused too');
 await setDoc(doc(db('d1'), 'projects', 'plain'), project());
 await assertFails(setDoc(doc(db('d1'), 'assignments', 'plain_t1'), invite('plain', {groupLink: GROUP})));
});
test('the owner can set, change and clear it on a live app, and nothing else that way', async () => {
 const ref = doc(db('d1'), 'projects', 'p');
 await setDoc(ref, project());
 await assertSucceeds(updateDoc(ref, {groupLink: GROUP}));
 await assertSucceeds(updateDoc(ref, {groupLink: ''}));
 await assertFails(updateDoc(ref, {groupLink: 'https://evil.example/x'}));
 await assertFails(updateDoc(ref, {groupLink: GROUP, link: 'https://play.google.com/apps/testing/other'}));
});
test('nobody else can change it', async () => {
 await setDoc(doc(db('d1'), 'projects', 'p'), project());
 await assertFails(updateDoc(doc(db('d2'), 'projects', 'p'), {groupLink: GROUP}));
 await assertFails(updateDoc(doc(db('t1'), 'projects', 'p'), {groupLink: GROUP}));
});
test('drafts can hold it and an archived app cannot change it', async () => {
 const draft = doc(db('d1'), 'projects', 'draft');
 await assertSucceeds(setDoc(draft, project({status: 'draft', link: '', tasks: [], testersCount: 0, selectedTesterUids: [], groupLink: GROUP})));
 await assertSucceeds(updateDoc(draft, {groupLink: ''}));
 await assertFails(updateDoc(draft, {groupLink: 'https://evil.example/x'}));
 await setDoc(doc(db('d1'), 'projects', 'old'), project());
 await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'projects', 'old'), {status: 'archived'}));
 await assertFails(updateDoc(doc(db('d1'), 'projects', 'old'), {groupLink: GROUP}));
});
