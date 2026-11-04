import {before, after, beforeEach, test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDoc, getDocs, deleteDoc, collection, serverTimestamp, Timestamp} from 'firebase/firestore';
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: verified}).firestore();
const TOKEN = 'fcm-token-of-this-browser-0123456789', ID = createHash('sha256').update(TOKEN).digest('hex');
const device = (uid, extra = {}) => ({uid, token: TOKEN, reminderUtcHour: 17, updatedAt: serverTimestamp(), ...extra});
const seed = data => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'pushDevices', ID), data));
beforeEach(async () => {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c => {
  for (const uid of ['t1', 't2']) await setDoc(doc(c.firestore(), 'users', uid), {name: 'User', email: uid + '@example.com', role: 'tester', available: false});
  await setDoc(doc(c.firestore(), 'users', 'gone'), {name: 'User', email: 'gone@example.com', role: 'tester', available: false, suspended: true});
  await setDoc(doc(c.firestore(), 'users', 'boss'), {name: 'Boss', email: 'boss@example.com', role: 'tester', available: false});
  await setDoc(doc(c.firestore(), 'adminRoles', 'boss'), {active: true});
 });
});
test('a verified user registers their own device', async () => { await assertSucceeds(setDoc(doc(db('t1'), 'pushDevices', ID), device('t1'))); });
test('unverified, suspended and anonymous users cannot register', async () => {
 await assertFails(setDoc(doc(db('new', false), 'pushDevices', ID), device('new')));
 await assertFails(setDoc(doc(db('gone'), 'pushDevices', ID), device('gone')));
 await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'pushDevices', ID), device('t1')));
});
test('a device cannot be registered for someone else', async () => { await assertFails(setDoc(doc(db('t1'), 'pushDevices', ID), device('t2'))); });
test('the id must be the hash of the token', async () => {
 await assertFails(setDoc(doc(db('t1'), 'pushDevices', 'chosen-id'), device('t1')));
 await assertFails(setDoc(doc(db('t1'), 'pushDevices', ID), device('t1', {token: 'another-token-another-token-another'})));
});
test('hour, timestamp and extra fields are validated', async () => {
 const ref = doc(db('t1'), 'pushDevices', ID);
 await assertFails(setDoc(ref, device('t1', {reminderUtcHour: 24})));
 await assertFails(setDoc(ref, device('t1', {reminderUtcHour: '17'})));
 await assertFails(setDoc(ref, device('t1', {updatedAt: Timestamp.now()})));
 await assertFails(setDoc(ref, device('t1', {lastReminderAt: serverTimestamp()})));
});
test('only the job can record a sent reminder, and saving again keeps it', async () => {
 const stamp = Timestamp.now();
 await seed({uid: 't1', token: TOKEN, reminderUtcHour: 17, updatedAt: stamp, lastReminderAt: stamp});
 const ref = doc(db('t1'), 'pushDevices', ID);
 await assertFails(setDoc(ref, {lastReminderAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp()}, {merge: true}));
 await assertSucceeds(setDoc(ref, {uid: 't1', token: TOKEN, reminderUtcHour: 5, updatedAt: serverTimestamp()}, {merge: true}));
});
test('the next account on the same browser takes the device over', async () => {
 await seed({uid: 't1', token: TOKEN, reminderUtcHour: 17, updatedAt: Timestamp.now()});
 await assertSucceeds(setDoc(doc(db('t2'), 'pushDevices', ID), device('t2'), {merge: true}));
});
test('tokens stay private from other users and from admins', async () => {
 await seed({uid: 't1', token: TOKEN, reminderUtcHour: 17, updatedAt: Timestamp.now()});
 await assertSucceeds(getDoc(doc(db('t1'), 'pushDevices', ID)));
 await assertFails(getDoc(doc(db('t2'), 'pushDevices', ID)));
 await assertFails(getDoc(doc(db('boss'), 'pushDevices', ID)));
 await assertFails(getDocs(collection(db('boss'), 'pushDevices')));
 await assertFails(getDocs(collection(db('t1'), 'pushDevices')));
});
test('only the owner removes a device, even while suspended', async () => {
 await seed({uid: 'gone', token: TOKEN, reminderUtcHour: 17, updatedAt: Timestamp.now()});
 await assertFails(deleteDoc(doc(db('t1'), 'pushDevices', ID)));
 await assertSucceeds(deleteDoc(doc(db('gone'), 'pushDevices', ID)));
});
