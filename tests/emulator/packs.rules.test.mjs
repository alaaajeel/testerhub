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
const member = (uid, order, extra = {}) => ({uid, name: 'User ' + uid, email: uid + '@example.com', appName: 'App ' + uid, devName: 'Dev ' + uid, description: 'وصف قصير', appLink: LINK, groupAdded: true, order, strikes: 0, status: 'active', consent: true, paid: 0, joinedAt: serverTimestamp(), ...extra});
const card = (pack, uid, extra = {}) => ({packId: pack, ownerUid: uid, appName: 'App ' + uid, devName: 'Dev ' + uid, description: 'وصف قصير', appLink: LINK, active: true, boosted: false, boostedAt: serverTimestamp(), createdAt: serverTimestamp(), ...extra});

beforeEach(async () => {
 await env.clearFirestore();
 await admin(async d => {
  for (const uid of USERS) await setDoc(doc(d, 'users', uid), {name: 'User ' + uid, email: uid + '@example.com', role: 'tester', available: true, createdAt: serverTimestamp()});
  await setDoc(doc(d, 'appConfig', 'features'), {packs: true});
  await setDoc(doc(d, 'packMeta', 'current'), {openPackId: 'p1', number: 1});
  await setDoc(doc(d, 'packs', 'p1'), {number: 1, status: 'open', size: 16, days: 16, memberCount: 0, createdAt: serverTimestamp()});
 });
});

// Mirrors packJoin() in src/v2/packs.js. coins: undefined = first entry (free), or the coins doc before joining.
function joinBatch(uid, {pack = 'p1', count, extra = {}, startNext = true, coins, pay} = {}) {
 const f = db(uid), b = writeBatch(f), n = count + 1;
 const paid = pay ?? (coins === undefined || !coins.freeUsed ? 0 : 150);
 b.update(doc(f, 'packs', pack), n < 16 ? {memberCount: n} : {memberCount: n, status: 'running', startDay: today(), startedAt: serverTimestamp()});
 b.set(doc(f, 'packs', pack, 'members', uid), member(uid, n, {paid, ...extra}));
 b.set(doc(f, 'packSeats', uid), {packId: pack, updatedAt: serverTimestamp()});
 if (coins === undefined) b.set(doc(f, 'coins', uid), {earned: 0, spent: 0, freeUsed: true, updatedAt: serverTimestamp()});
 else b.update(doc(f, 'coins', uid), {spent: (coins.spent || 0) + paid, freeUsed: true, updatedAt: serverTimestamp()});
 const mirror = Object.fromEntries(['appName', 'devName', 'icon', 'description', 'appLink'].filter(k => k in extra).map(k => [k, extra[k]]));
 b.set(doc(f, 'packApps', pack + '_' + uid), card(pack, uid, mirror));
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
 await assertFails(joinBatch('u1', {count: 0, extra: {groupAdded: false}}), 'the Google Group was not added to the app');
 await assertFails(joinBatch('u1', {count: 0, extra: {devName: 'x'}}));
 await assertFails(joinBatch('u1', {count: 0, extra: {icon: 'https://evil.example/x.png'}}), 'icon must be an inline image');
 await assertFails(joinBatch('u1', {count: 0, extra: {description: 'x'.repeat(301)}}));
 await assertSucceeds(joinBatch('u1', {count: 0, extra: {icon: 'data:image/png;base64,iVBORw0KGgo='}}));
 await assertFails(joinBatch('u1', {count: 5}), 'skipping seats');
 // Writing someone else in.
 const f = db('u1'), b = writeBatch(f);
 b.update(doc(f, 'packs', 'p1'), {memberCount: 1});
 b.set(doc(f, 'packs', 'p1', 'members', 'u2'), member('u2', 1));
 b.set(doc(f, 'packSeats', 'u2'), {packId: 'p1', updatedAt: serverTimestamp()});
 b.set(doc(f, 'coins', 'u2'), {earned: 0, spent: 0, freeUsed: true, updatedAt: serverTimestamp()});
 await assertFails(b.commit());
 const u = env.authenticatedContext('u1', {email: 'u1@example.com', email_verified: false}).firestore(), c = writeBatch(u);
 c.update(doc(u, 'packs', 'p1'), {memberCount: 1});c.set(doc(u, 'packs', 'p1', 'members', 'u1'), member('u1', 1));c.set(doc(u, 'packSeats', 'u1'), {packId: 'p1', updatedAt: serverTimestamp()});c.set(doc(u, 'coins', 'u1'), {earned: 0, spent: 0, freeUsed: true, updatedAt: serverTimestamp()});
 await assertFails(c.commit(), 'unverified');
 await admin(d => setDoc(doc(d, 'appConfig', 'features'), {packs: false}));
 await assertFails(joinBatch('u1', {count: 0}), 'feature off');
});

test('one seat per person: no double join, no second pack while the first runs', async () => {
 await assertSucceeds(joinBatch('u1', {count: 0}));
 await assertFails(joinBatch('u1', {count: 1, coins: {spent: 0, freeUsed: true}}), 'same pack twice');
 await admin(async d => {
  await setDoc(doc(d, 'packs', 'p9'), {number: 9, status: 'open', size: 16, days: 16, memberCount: 0, createdAt: serverTimestamp()});
 });
 await assertFails(joinBatch('u1', {pack: 'p9', count: 0, coins: {spent: 0, freeUsed: true}}), 'a second pack');
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
 const leave = (uid, left = ['p1']) => { const f = db(uid), b = writeBatch(f); b.update(doc(f, 'packs', 'p1'), {memberCount: 1}); b.delete(doc(f, 'packs', 'p1', 'members', uid)); b.set(doc(f, 'packSeats', uid), {packId: '', left, updatedAt: serverTimestamp()}); b.update(doc(f, 'coins', uid), {spent: 0, freeUsed: false, updatedAt: serverTimestamp()}); b.delete(doc(f, 'packApps', 'p1_' + uid)); return b.commit(); };
 await assertFails(leave('u2', []), 'leaving without recording it');
 await assertSucceeds(leave('u2'));
 // Who left a pack cannot come back to it, even with the seat free and the free entry back.
 const back = () => { const f = db('u2'), b = writeBatch(f); b.update(doc(f, 'packs', 'p1'), {memberCount: 2}); b.set(doc(f, 'packs', 'p1', 'members', 'u2'), member('u2', 2)); b.set(doc(f, 'packSeats', 'u2'), {packId: 'p1', left: [], updatedAt: serverTimestamp()}); b.update(doc(f, 'coins', 'u2'), {spent: 0, freeUsed: true, updatedAt: serverTimestamp()}); b.set(doc(f, 'packApps', 'p1_u2'), card('p1', 'u2')); return b.commit(); };
 await assertFails(back(), 'erasing the record to come back');
 const again = () => { const f = db('u2'), b = writeBatch(f); b.update(doc(f, 'packs', 'p1'), {memberCount: 2}); b.set(doc(f, 'packs', 'p1', 'members', 'u2'), member('u2', 2)); b.set(doc(f, 'packSeats', 'u2'), {packId: 'p1', left: ['p1'], updatedAt: serverTimestamp()}); b.update(doc(f, 'coins', 'u2'), {spent: 0, freeUsed: true, updatedAt: serverTimestamp()}); b.set(doc(f, 'packApps', 'p1_u2'), card('p1', 'u2')); return b.commit(); };
 await assertFails(again(), 'the same pack again');
 // Another pack is fine, and the entry is still free.
 await admin(d => setDoc(doc(d, 'packs', 'p9'), {number: 9, status: 'open', size: 16, days: 16, memberCount: 0, createdAt: serverTimestamp()}));
 const other = () => { const f = db('u2'), b = writeBatch(f); b.update(doc(f, 'packs', 'p9'), {memberCount: 1}); b.set(doc(f, 'packs', 'p9', 'members', 'u2'), member('u2', 1)); b.set(doc(f, 'packSeats', 'u2'), {packId: 'p9', left: ['p1'], updatedAt: serverTimestamp()}); b.update(doc(f, 'coins', 'u2'), {spent: 0, freeUsed: true, updatedAt: serverTimestamp()}); b.set(doc(f, 'packApps', 'p9_u2'), card('p9', 'u2')); return b.commit(); };
 await assertSucceeds(other());
 await admin(d => updateDoc(doc(d, 'packs', 'p1'), {status: 'running', startDay: today()}));
 await assertFails(leave('u1')); // after the start nobody leaves
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

// ---------- Coins ----------
const setCoins = (uid, data) => admin(d => setDoc(doc(d, 'coins', uid), data));
async function finishPack1() { await admin(d => updateDoc(doc(d, 'packs', 'p1'), {status: 'done'})); }

test('the first entry is free once; the next costs 150 coins, paid in the same batch', async () => {
 await assertSucceeds(joinBatch('u1', {count: 0}));
 await finishPack1();
 await admin(d => setDoc(doc(d, 'packs', 'p9'), {number: 9, status: 'open', size: 16, days: 16, memberCount: 0, createdAt: serverTimestamp()}));
 await assertFails(joinBatch('u1', {pack: 'p9', count: 0, coins: {spent: 0, freeUsed: true}, pay: 0}), 'free twice');
 await assertFails(joinBatch('u1', {pack: 'p9', count: 0, coins: {spent: 0, freeUsed: true}}), 'no coins yet');
 await setCoins('u1', {earned: 149, spent: 0, freeUsed: true});
 await assertFails(joinBatch('u1', {pack: 'p9', count: 0, coins: {spent: 0, freeUsed: true}}), '149 is not enough');
 await setCoins('u1', {earned: 200, spent: 0, freeUsed: true});
 await assertFails(joinBatch('u1', {pack: 'p9', count: 0, coins: {spent: 0, freeUsed: true}, pay: 100}), 'paying less');
 await assertSucceeds(joinBatch('u1', {pack: 'p9', count: 0, coins: {spent: 0, freeUsed: true}}));
 const c = (await getDoc(doc(db('u1'), 'coins', 'u1'))).data();
 assert.equal(c.spent, 150);
});

test('coins attacks: no typing in earned, no lowering spent, no second free entry, nobody else\'s coins', async () => {
 await setCoins('u1', {earned: 10, spent: 5, freeUsed: true});
 const ref = doc(db('u1'), 'coins', 'u1');
 await assertFails(updateDoc(ref, {earned: 1000, updatedAt: serverTimestamp()}));
 await assertFails(updateDoc(ref, {spent: 0, updatedAt: serverTimestamp()}));
 await assertFails(updateDoc(ref, {freeUsed: false, updatedAt: serverTimestamp()}));
 await assertFails(updateDoc(ref, {spent: 11, updatedAt: serverTimestamp()}), 'spending more than you have');
 await assertFails(setDoc(doc(db('u2'), 'coins', 'u1'), {earned: 0, spent: 0, freeUsed: true, updatedAt: serverTimestamp()}));
 await assertFails(getDoc(doc(db('u2'), 'coins', 'u1')));
 await assertFails(setDoc(doc(db('u3'), 'coins', 'u3'), {earned: 500, spent: 0, freeUsed: true, updatedAt: serverTimestamp()}), 'starting rich');
});

test('leaving before the start gives back exactly what the entry cost', async () => {
 await setCoins('u1', {earned: 300, spent: 0, freeUsed: true});
 await assertSucceeds(joinBatch('u1', {count: 0, coins: {spent: 0, freeUsed: true}}));
 const leave = spent => { const f = db('u1'), b = writeBatch(f); b.update(doc(f, 'packs', 'p1'), {memberCount: 0}); b.delete(doc(f, 'packs', 'p1', 'members', 'u1')); b.set(doc(f, 'packSeats', 'u1'), {packId: '', left: ['p1'], updatedAt: serverTimestamp()}); b.update(doc(f, 'coins', 'u1'), {spent, freeUsed: true, updatedAt: serverTimestamp()}); b.delete(doc(f, 'packApps', 'p1_u1')); return b.commit(); };
 await assertFails(leave(-150), 'a refund bigger than the cost');
 await assertSucceeds(leave(0));
});

test('the public app card mirrors the member record, and boosting costs 30 for 3 days', async () => {
 await setCoins('u1', {earned: 100, spent: 0, freeUsed: true});
 await assertFails(joinBatch('u1', {count: 0, coins: {spent: 0, freeUsed: true}, pay: 0, extra: {}}));
 await setCoins('u1', {earned: 100, spent: 0, freeUsed: false});
 await assertSucceeds(joinBatch('u1', {count: 0, coins: {spent: 0, freeUsed: false}}));
 await assertSucceeds(getDocs(collection(db('u9'), 'packApps')), 'every member of TesterHub sees the cards');
 const ref = doc(db('u1'), 'packApps', 'p1_u1');
 await assertFails(updateDoc(ref, {appName: 'Another'}));
 await assertFails(updateDoc(doc(db('u2'), 'packApps', 'p1_u1'), {boosted: true, boostedAt: serverTimestamp()}));
 // Boost: pays 30 with the server time, once per 3 days.
 const boost = (spent, at = serverTimestamp()) => { const f = db('u1'), b = writeBatch(f); b.update(doc(f, 'packApps', 'p1_u1'), {boosted: true, boostedAt: at}); b.update(doc(f, 'coins', 'u1'), {spent, updatedAt: serverTimestamp()}); return b.commit(); };
 await assertFails(boost(0), 'without paying');
 await assertFails(boost(30, Timestamp.fromMillis(Date.now() + 30 * 86400000)), 'a client time in the future');
 await assertSucceeds(boost(30));
 await assertFails(boost(60), 'stacking a second boost while the first runs');
 assert.equal((await getDoc(doc(db('u1'), 'coins', 'u1'))).data().spent, 30);
 // A card whose name differs from the member record is refused at join.
 await assertFails(joinBatch('u2', {count: 1, extra: {}}).then(() => null).catch(e => { throw e; }).then(async () => {
  const f = db('u3'), b = writeBatch(f);
  b.update(doc(f, 'packs', 'p1'), {memberCount: 3});
  b.set(doc(f, 'packs', 'p1', 'members', 'u3'), member('u3', 3));
  b.set(doc(f, 'packSeats', 'u3'), {packId: 'p1', updatedAt: serverTimestamp()});
  b.set(doc(f, 'coins', 'u3'), {earned: 0, spent: 0, freeUsed: true, updatedAt: serverTimestamp()});
  b.set(doc(f, 'packApps', 'p1_u3'), card('p1', 'u3', {appName: 'Not my app'}));
  return b.commit();
 }));
});
