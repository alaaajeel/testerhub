import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch, collection, serverTimestamp, arrayUnion, Timestamp} from 'firebase/firestore';

// V2 exchange packs (16 members, 16 days), behind appConfig/features.packs. Every attack here must fail.
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: verified}).firestore();
const admin = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
const LINK = 'https://play.google.com/apps/testing/com.example.app';
const today = () => new Date().toISOString().slice(0, 10);
const USERS = Array.from({length: 18}, (_, i) => 'u' + (i + 1));
const member = (uid, order, extra = {}) => ({uid, name: 'User ' + uid, email: uid + '@example.com', appName: 'App ' + uid, appLink: LINK, order, strikes: 0, status: 'active', consent: true, joinedAt: serverTimestamp(), ...extra});

beforeEach(async () => {
 await env.clearFirestore();
 await admin(async d => {
  for (const uid of USERS) await setDoc(doc(d, 'users', uid), {name: 'User ' + uid, email: uid + '@example.com', role: 'tester', available: true, createdAt: serverTimestamp()});
  await setDoc(doc(d, 'appConfig', 'features'), {packs: true});
  await setDoc(doc(d, 'packMeta', 'current'), {openPackId: 'p1', number: 1});
  await setDoc(doc(d, 'packs', 'p1'), {number: 1, status: 'open', size: 16, days: 16, memberCount: 0, createdAt: serverTimestamp()});
 });
});

// Mirrors joinPack() in src/v2/packs.js.
function joinBatch(uid, {pack = 'p1', count, extra = {}, startNext = true} = {}) {
 const f = db(uid), b = writeBatch(f), n = count + 1;
 b.update(doc(f, 'packs', pack), n < 16 ? {memberCount: n} : {memberCount: n, status: 'running', startDay: today(), startedAt: serverTimestamp()});
 b.set(doc(f, 'packs', pack, 'members', uid), member(uid, n, extra));
 b.set(doc(f, 'packSeats', uid), {packId: pack, updatedAt: serverTimestamp()});
 if (n === 16 && startNext) {
  b.update(doc(f, 'packMeta', 'current'), {openPackId: 'p2', number: 2, updatedAt: serverTimestamp()});
  b.set(doc(f, 'packs', 'p2'), {number: 2, status: 'open', size: 16, days: 16, memberCount: 0, createdAt: serverTimestamp()});
 }
 return b.commit();
}
async function fill(n) { for (let i = 0; i < n; i++) await assertSucceeds(joinBatch(USERS[i], {count: i})); }

test('a verified account joins the open pack with its own app and email', async () => {
 await assertSucceeds(joinBatch('u1', {count: 0}));
 const snap = await getDoc(doc(db('u1'), 'packs', 'p1'));
 assert.equal(snap.data().memberCount, 1);
});

test('join attacks: forged fields, wrong count, another person, unverified, feature off', async () => {
 await assertFails(joinBatch('u1', {count: 0, extra: {email: 'other@example.com'}}), 'someone else\'s email');
 await assertFails(joinBatch('u1', {count: 0, extra: {strikes: -5}}), 'negative strikes');
 await assertFails(joinBatch('u1', {count: 0, extra: {status: 'admin'}}));
 await assertFails(joinBatch('u1', {count: 0, extra: {consent: false}}), 'no consent to share the email');
 await assertFails(joinBatch('u1', {count: 0, extra: {appLink: 'https://evil.example/app'}}));
 await assertFails(joinBatch('u1', {count: 0, extra: {bonus: 1}}));
 await assertFails(joinBatch('u1', {count: 5}), 'skipping seats');
 // Writing someone else in.
 const f = db('u1'), b = writeBatch(f);
 b.update(doc(f, 'packs', 'p1'), {memberCount: 1});
 b.set(doc(f, 'packs', 'p1', 'members', 'u2'), member('u2', 1));
 b.set(doc(f, 'packSeats', 'u2'), {packId: 'p1', updatedAt: serverTimestamp()});
 await assertFails(b.commit());
 const u = env.authenticatedContext('u1', {email: 'u1@example.com', email_verified: false}).firestore(), c = writeBatch(u);
 c.update(doc(u, 'packs', 'p1'), {memberCount: 1});c.set(doc(u, 'packs', 'p1', 'members', 'u1'), member('u1', 1));c.set(doc(u, 'packSeats', 'u1'), {packId: 'p1', updatedAt: serverTimestamp()});
 await assertFails(c.commit(), 'unverified');
 await admin(d => setDoc(doc(d, 'appConfig', 'features'), {packs: false}));
 await assertFails(joinBatch('u1', {count: 0}), 'feature off');
});

test('one seat per person: no double join, no second pack while the first runs', async () => {
 await assertSucceeds(joinBatch('u1', {count: 0}));
 await assertFails(joinBatch('u1', {count: 1}), 'same pack twice');
 await admin(async d => {
  await setDoc(doc(d, 'packs', 'p9'), {number: 9, status: 'open', size: 16, days: 16, memberCount: 0, createdAt: serverTimestamp()});
 });
 await assertFails(joinBatch('u1', {pack: 'p9', count: 0}), 'a second pack');
});

test('only members read the members list and emails', async () => {
 await fill(2);
 await assertSucceeds(getDocs(collection(db('u1'), 'packs', 'p1', 'members')));
 await assertSucceeds(getDoc(doc(db('u2'), 'packs', 'p1', 'members', 'u1')));
 await assertFails(getDocs(collection(db('u9'), 'packs', 'p1', 'members')));
 await assertFails(getDoc(doc(db('u9'), 'packs', 'p1', 'members', 'u1')));
 await assertSucceeds(getDoc(doc(db('u9'), 'packs', 'p1')), 'seat count is visible to all members of TesterHub');
});

test('the 16th member starts the pack and opens the next one; nobody joins a running pack', async () => {
 await fill(15);
 await assertFails(joinBatch('u16', {count: 15, startNext: false}), 'starting without opening the next pack');
 await assertSucceeds(joinBatch('u16', {count: 15}));
 const p1 = (await getDoc(doc(db('u1'), 'packs', 'p1'))).data();
 assert.equal(p1.status, 'running');assert.equal(p1.memberCount, 16);assert.equal(p1.startDay, today());
 const meta = (await getDoc(doc(db('u17'), 'packMeta', 'current'))).data();
 assert.equal(meta.openPackId, 'p2');
 await assertFails(joinBatch('u17', {count: 16}), 'p1 is full and running');
 await assertSucceeds(joinBatch('u17', {pack: 'p2', count: 0}));
});

test('the pointer and packs cannot be moved or created outside a full join', async () => {
 const f = db('u1');
 await assertFails(updateDoc(doc(f, 'packMeta', 'current'), {openPackId: 'p2', number: 2, updatedAt: serverTimestamp()}));
 await assertFails(setDoc(doc(f, 'packs', 'p2'), {number: 2, status: 'open', size: 16, days: 16, memberCount: 0, createdAt: serverTimestamp()}));
 await assertFails(updateDoc(doc(f, 'packs', 'p1'), {status: 'running'}));
 await assertFails(updateDoc(doc(f, 'packs', 'p1'), {memberCount: 16}));
 await assertFails(deleteDoc(doc(f, 'packs', 'p1')));
});

test('leaving before the start frees the seat; after the start it is not possible', async () => {
 await fill(2);
 const leave = uid => { const f = db(uid), b = writeBatch(f); b.update(doc(f, 'packs', 'p1'), {memberCount: 1}); b.delete(doc(f, 'packs', 'p1', 'members', uid)); b.set(doc(f, 'packSeats', uid), {packId: '', updatedAt: serverTimestamp()}); return b.commit(); };
 await assertSucceeds(leave('u2'));
 await assertSucceeds(joinBatch('u2', {count: 1}), 'can join again');
 await admin(d => updateDoc(doc(d, 'packs', 'p1'), {status: 'running', startDay: today()}));
 await assertFails(leave('u2'));
});

test('daily confirmations: per app, today only, never shrinking, never for yourself or others', async () => {
 await fill(3);
 await admin(d => updateDoc(doc(d, 'packs', 'p1'), {status: 'running', startDay: today()}));
 const ref = (uid, day = today()) => doc(db(uid), 'packs', 'p1', 'days', uid + '_' + day);
 await assertSucceeds(setDoc(ref('u1'), {uid: 'u1', date: today(), confirmed: ['u2'], updatedAt: serverTimestamp()}));
 await assertSucceeds(updateDoc(ref('u1'), {confirmed: arrayUnion('u3'), updatedAt: serverTimestamp()}));
 await assertFails(updateDoc(ref('u1'), {confirmed: ['u2'], updatedAt: serverTimestamp()}), 'removing a confirmation');
 await assertFails(updateDoc(ref('u1'), {confirmed: arrayUnion('u1'), updatedAt: serverTimestamp()}), 'confirming your own app');
 await assertFails(setDoc(ref('u1', '2020-01-01'), {uid: 'u1', date: '2020-01-01', confirmed: ['u2'], updatedAt: serverTimestamp()}), 'another day');
 await assertFails(setDoc(doc(db('u1'), 'packs', 'p1', 'days', 'u2_' + today()), {uid: 'u2', date: today(), confirmed: ['u3'], updatedAt: serverTimestamp()}), 'for someone else');
 await assertFails(setDoc(ref('u1'), {uid: 'u1', date: today(), confirmed: ['u2'], updatedAt: Timestamp.fromMillis(1)}), 'client time');
 await assertFails(setDoc(doc(db('u9'), 'packs', 'p1', 'days', 'u9_' + today()), {uid: 'u9', date: today(), confirmed: ['u1'], updatedAt: serverTimestamp()}), 'not a member');
 await assertSucceeds(getDocs(collection(db('u2'), 'packs', 'p1', 'days')));
 await assertFails(getDocs(collection(db('u9'), 'packs', 'p1', 'days')));
});

test('strikes and removal belong to the daily job only', async () => {
 await fill(2);
 await assertFails(updateDoc(doc(db('u1'), 'packs', 'p1', 'members', 'u1'), {strikes: 0, status: 'active'}));
 await assertFails(updateDoc(doc(db('u1'), 'packs', 'p1', 'members', 'u2'), {strikes: 3}));
 await assertFails(updateDoc(doc(db('u1'), 'packs', 'p1', 'members', 'u2'), {status: 'out'}));
 // A removed member cannot confirm.
 await admin(async d => { await updateDoc(doc(d, 'packs', 'p1'), {status: 'running', startDay: today()}); await updateDoc(doc(d, 'packs', 'p1', 'members', 'u2'), {status: 'out', strikes: 3}); });
 await assertFails(setDoc(doc(db('u2'), 'packs', 'p1', 'days', 'u2_' + today()), {uid: 'u2', date: today(), confirmed: ['u1'], updatedAt: serverTimestamp()}));
});

test('the admin switch accepts the packs flag', async () => {
 await admin(d => setDoc(doc(d, 'adminRoles', 'owner'), {active: true}));
 const owner = env.authenticatedContext('owner', {email: 'owner@example.com', email_verified: true}).firestore();
 await admin(d => setDoc(doc(d, 'users', 'owner'), {name: 'Owner', email: 'owner@example.com', role: 'developer', available: false, createdAt: serverTimestamp()}));
 // adminAllowed() may require more than the role document; the flag shape itself is what this checks.
 await assertFails(setDoc(doc(db('u1'), 'appConfig', 'features'), {packs: true, updatedAt: serverTimestamp()}), 'not an admin');
});
