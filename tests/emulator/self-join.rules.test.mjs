import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch, collection, query, where, serverTimestamp} from 'firebase/firestore';

// Official Google Group and self-join requests, behind appConfig/features.officialGroup.
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: verified}).firestore();
const LINK = 'https://play.google.com/apps/testing/com.example.app';
const admin = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
const read = async (...path) => { let data; await admin(async d => { data = (await getDoc(doc(d, ...path))).data(); }); return data; };
const flag = on => admin(d => setDoc(doc(d, 'appConfig', 'features'), {officialGroup: on}));
const card = (extra = {}) => ({projectId: 'p1', ownerUid: 'd1', ownerName: 'Dev d1', name: 'App', link: LINK, slots: 5, status: 'open', updatedAt: serverTimestamp(), ...extra});
const ask = (uid, extra = {}) => ({projectId: 'p1', ownerUid: 'd1', testerUid: uid, testerName: 'Tester ' + uid, status: 'waiting', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra});
const invite = uid => ({projectId: 'p1', testerUid: uid, ownerUid: 'd1', name: 'App', link: LINK, tasks: ['فتح التطبيق'], invitationStatus: 'pending', joinedDay: null, checkins: [], createdAt: serverTimestamp()});

beforeEach(async () => {
 await env.clearFirestore();
 await admin(async d => {
  await setDoc(doc(d, 'users', 'd1'), {name: 'Dev d1', email: 'd1@example.com', role: 'developer', available: false});
  await setDoc(doc(d, 'users', 'd2'), {name: 'Dev d2', email: 'd2@example.com', role: 'developer', available: false});
  // Self-join testers are not in the shared email list (available:false) and still may join by request.
  for (const uid of ['t1', 't2', 't3']) await setDoc(doc(d, 'users', uid), {name: 'Tester ' + uid, email: uid + '@example.com', role: 'tester', available: false});
  await setDoc(doc(d, 'adminRoles', 'boss'), {active: true});
  await setDoc(doc(d, 'users', 'boss'), {name: 'Boss', email: 'boss@example.com', role: 'tester', available: false});
  await setDoc(doc(d, 'projects', 'p1'), {ownerUid: 'd1', ownerName: 'Dev d1', name: 'App', link: LINK, tasks: ['فتح التطبيق'], status: 'recruiting', selectedTesterUids: ['old'], testersCount: 1});
  // An existing invitation from the old flow stays exactly as it is.
  await setDoc(doc(d, 'assignments', 'p1_t3'), {projectId: 'p1', testerUid: 't3', ownerUid: 'd1', name: 'App', link: LINK, invitationStatus: 'accepted', joinedDay: '2026-11-01', checkins: ['2026-11-01']});
 });
});
async function openGroupMode() {
 await flag(true);
 const d1 = db('d1'), b = writeBatch(d1);
 b.update(doc(d1, 'projects', 'p1'), {testMode: 'group'});
 b.set(doc(d1, 'openings', 'p1'), card());
 await assertSucceeds(b.commit());
}
async function approve(uid) {
 const d1 = db('d1'), b = writeBatch(d1);
 b.update(doc(d1, 'projects', 'p1'), {selectedTesterUids: ['old', uid], testersCount: 2});
 b.update(doc(d1, 'joinRequests', 'p1_' + uid), {status: 'approved', updatedAt: serverTimestamp()});
 await assertSucceeds(b.commit());
}

test('only the platform owner turns the feature on or off; members can read it', async () => {
 await assertFails(setDoc(doc(db('d1'), 'appConfig', 'features'), {officialGroup: true, updatedAt: serverTimestamp()}));
 await assertSucceeds(setDoc(doc(db('boss'), 'appConfig', 'features'), {officialGroup: true, updatedAt: serverTimestamp()}));
 await assertFails(setDoc(doc(db('boss'), 'appConfig', 'features'), {officialGroup: 'yes', updatedAt: serverTimestamp()}));
 await assertFails(setDoc(doc(db('boss'), 'appConfig', 'other'), {officialGroup: true, updatedAt: serverTimestamp()}));
 assert.equal((await assertSucceeds(getDoc(doc(db('t1'), 'appConfig', 'features')))).data().officialGroup, true);
 await assertFails(getDoc(doc(db('t1', false), 'appConfig', 'features')));
});

test('switching the feature is recorded in the audit log by the owner only', async () => {
 const entry = uid => ({actorUid: uid, action: 'toggle_feature', targetId: 'officialGroup', targetName: 'تفعيل officialGroup', createdAt: serverTimestamp()});
 await assertSucceeds(setDoc(doc(db('boss'), 'adminAuditLogs', 'a1'), entry('boss')));
 await admin(d => setDoc(doc(d, 'staffRoles', 't1'), {active: true, permissions: {sendAnnouncements: true, suspendUsers: true}}));
 await assertFails(setDoc(doc(db('t1'), 'adminAuditLogs', 'a2'), entry('t1')));
});

test('while the feature is off nothing new can start', async () => {
 await assertFails(updateDoc(doc(db('d1'), 'projects', 'p1'), {testMode: 'group'}));
 await assertFails(setDoc(doc(db('d1'), 'openings', 'p1'), card()));
 await openGroupMode();
 await flag(false);
 await assertFails(setDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), ask('t1')));
 // An owner can always stop taking requests.
 await assertSucceeds(setDoc(doc(db('d1'), 'openings', 'p1'), card({status: 'closed'})));
});

test('an opening is written only by the app owner and copies the app name and opt-in link', async () => {
 await flag(true);
 await assertFails(setDoc(doc(db('d1'), 'openings', 'p1'), card()));                       // project still in invite mode
 await assertSucceeds(updateDoc(doc(db('d1'), 'projects', 'p1'), {testMode: 'group'}));
 await assertFails(setDoc(doc(db('d2'), 'openings', 'p1'), card({ownerUid: 'd2', ownerName: 'Dev d2'})));
 await assertFails(setDoc(doc(db('d1'), 'openings', 'p1'), card({name: 'Another name'})));
 await assertFails(setDoc(doc(db('d1'), 'openings', 'p1'), card({link: 'https://evil.example/'})));
 await assertFails(setDoc(doc(db('d1'), 'openings', 'p1'), card({slots: 0})));
 await assertFails(setDoc(doc(db('d1'), 'openings', 'p1'), card({extra: 1})));
 await assertSucceeds(setDoc(doc(db('d1'), 'openings', 'p1'), card()));
 assert.equal((await assertSucceeds(getDocs(query(collection(db('t1'), 'openings'), where('status', '==', 'open'))))).size, 1);
 await assertFails(updateDoc(doc(db('d1'), 'projects', 'p1'), {testMode: 'everyone'}));
});

test('a tester asks once per app; no duplicates, no own app, no second participation', async () => {
 await openGroupMode();
 await assertFails(setDoc(doc(db('t1'), 'joinRequests', 'p1_t2'), ask('t2')));             // for someone else
 await assertFails(setDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), ask('t1', {testerName: 'Fake'})));
 await assertFails(setDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), ask('t1', {status: 'approved'})));
 await assertFails(setDoc(doc(db('t1', false), 'joinRequests', 'p1_t1'), ask('t1')));
 await assertSucceeds(setDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), ask('t1')));
 await assertFails(setDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), ask('t1')));             // the same request again
 await assertFails(setDoc(doc(db('t3'), 'joinRequests', 'p1_t3'), ask('t3')));             // already in this test
 await admin(d => setDoc(doc(d, 'users', 'd1'), {name: 'Dev d1', email: 'd1@example.com', role: 'tester', available: false}));
 await assertFails(setDoc(doc(db('d1'), 'joinRequests', 'p1_d1'), ask('d1', {testerName: 'Dev d1'})));
});

test('requests are private to the tester, the app owner and the platform owner', async () => {
 await openGroupMode();
 await assertSucceeds(setDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), ask('t1')));
 await assertSucceeds(getDoc(doc(db('t1'), 'joinRequests', 'p1_t1')));
 await assertSucceeds(getDocs(query(collection(db('d1'), 'joinRequests'), where('ownerUid', '==', 'd1'))));
 await assertSucceeds(getDoc(doc(db('boss'), 'joinRequests', 'p1_t1')));
 await assertFails(getDoc(doc(db('t2'), 'joinRequests', 'p1_t1')));
 await assertFails(getDocs(collection(db('t2'), 'joinRequests')));
});

test('only the owner approves or declines; the tester can only cancel and ask again', async () => {
 await openGroupMode();
 await assertSucceeds(setDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), ask('t1')));
 await assertFails(updateDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), {status: 'approved', updatedAt: serverTimestamp()}));
 await assertFails(updateDoc(doc(db('d2'), 'joinRequests', 'p1_t1'), {status: 'approved', updatedAt: serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), {status: 'cancelled', updatedAt: serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), {status: 'waiting', updatedAt: serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(db('d1'), 'joinRequests', 'p1_t1'), {status: 'declined', updatedAt: serverTimestamp()}));
 // A declined request cannot be put back in the queue by the tester.
 await assertFails(updateDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), {status: 'waiting', updatedAt: serverTimestamp()}));
});

test('approval lets the owner send the usual invitation; the 14 days have not started', async () => {
 await openGroupMode();
 await assertSucceeds(setDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), ask('t1')));
 // Without approval an unlisted tester cannot be invited.
 await assertFails(setDoc(doc(db('d1'), 'assignments', 'p1_t2'), invite('t2')));
 await approve('t1');
 // The invitation must start empty: no day counted, no inherited check-ins.
 await assertFails(setDoc(doc(db('d1'), 'assignments', 'p1_t1'), {...invite('t1'), joinedDay: '2026-11-07'}));
 await assertFails(setDoc(doc(db('d1'), 'assignments', 'p1_t1'), {...invite('t1'), checkins: ['2026-11-01']}));
 await assertSucceeds(setDoc(doc(db('d1'), 'assignments', 'p1_t1'), invite('t1')));
 const a = await read('assignments', 'p1_t1');
 assert.equal(a.joinedDay, null); assert.deepEqual(a.checkins, []); assert.equal(a.invitationStatus, 'pending');
 // The old participant is untouched.
 assert.deepEqual((await read('assignments', 'p1_t3')).checkins, ['2026-11-01']);
});

test('a backup tester gets a new invitation of their own and inherits nothing', async () => {
 await openGroupMode();
 await assertSucceeds(setDoc(doc(db('t2'), 'joinRequests', 'p1_t2'), ask('t2')));
 await approve('t2');
 // Taking over the inactive tester's record is impossible: the owner cannot rewrite it.
 await assertFails(updateDoc(doc(db('d1'), 'assignments', 'p1_t3'), {testerUid: 't2'}));
 await assertSucceeds(setDoc(doc(db('d1'), 'assignments', 'p1_t2'), invite('t2')));
 assert.deepEqual((await read('assignments', 'p1_t2')).checkins, []);
});

test('deleting an app also removes its requests and public card', async () => {
 await openGroupMode();
 await assertSucceeds(setDoc(doc(db('t1'), 'joinRequests', 'p1_t1'), ask('t1')));
 await assertFails(deleteDoc(doc(db('d1'), 'joinRequests', 'p1_t1')));
 await assertFails(deleteDoc(doc(db('d1'), 'openings', 'p1')));
 await assertSucceeds(updateDoc(doc(db('d1'), 'projects', 'p1'), {status: 'deleting'}));
 await assertSucceeds(deleteDoc(doc(db('d1'), 'joinRequests', 'p1_t1')));
 await assertSucceeds(deleteDoc(doc(db('d1'), 'openings', 'p1')));
 await assertFails(deleteDoc(doc(db('t1'), 'joinRequests', 'p1_t1')));
});
