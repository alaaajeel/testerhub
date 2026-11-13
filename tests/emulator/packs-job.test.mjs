// The real daily packs job against the Firestore emulator.
import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {runPacks} from '../../scripts/packs-job.mjs';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
let app, db;
before(() => { app = initializeApp({projectId: 'demo-testerhub'}, 'packs-job'); db = getFirestore(app); });
after(() => deleteApp(app));
const now = new Date('2026-11-20T03:00:00Z');
const UIDS = ['a', 'b', 'c', 'd'];
beforeEach(async () => {
 for (const col of ['packs', 'packMeta', 'appConfig', 'coins', 'packApps']) {
  const snap = await db.collection(col).get();
  for (const d of snap.docs) await db.recursiveDelete(d.ref);
 }
});
async function seedRunning(startDay, extra = {}) {
 await db.doc('appConfig/features').set({packs: true});
 await db.doc('packMeta/current').set({openPackId: 'p2', number: 2});
 await db.doc('packs/p1').set({number: 1, status: 'running', size: 16, days: 16, memberCount: 4, startDay, ...extra});
 for (const uid of UIDS) await db.doc('packs/p1/members/' + uid).set({uid, status: 'active', strikes: 0});
}
const confirm = (uid, date, list) => db.doc(`packs/p1/days/${uid}_${date}`).set({uid, date, confirmed: list});

test('off unless the admin turned packs on', async () => {
 assert.deepEqual(await runPacks({db, now}), {enabled: false});
});
test('opens the first pack once', async () => {
 await db.doc('appConfig/features').set({packs: true});
 await runPacks({db, now});await runPacks({db, now});
 assert.equal((await db.doc('packMeta/current').get()).data().openPackId, 'p1');
 assert.equal((await db.doc('packs/p1').get()).data().status, 'open');
});
test('day 1 is for installing; later days warn whoever confirmed under 70%, once per day; every confirmed app earns a coin', async () => {
 // Started 2026-11-17: days 1 (11-17), 2 (11-18) and 3 (11-19) are finished by 11-20.
 await seedRunning('2026-11-17');
 await confirm('d', '2026-11-17', ['a']);   // day 1: a coin, never a warning
 for (const d of ['2026-11-18', '2026-11-19']) {
  await confirm('a', d, ['b', 'c', 'd']);
  await confirm('b', d, ['a', 'c']);       // 2 of 3 = 67% < 70% → warning
  await confirm('c', d, ['a', 'b', 'd']);
 }                                          // d confirms nothing → warning
 const s = await runPacks({db, now});
 assert.equal(s.judged, 3);assert.equal(s.warnings, 4);
 const coins = async uid => (await db.doc('coins/' + uid).get()).data()?.earned || 0;
 assert.deepEqual([await coins('a'), await coins('b'), await coins('c'), await coins('d')], [6, 4, 6, 1]);
 const strikes = async uid => (await db.doc('packs/p1/members/' + uid).get()).data().strikes;
 assert.deepEqual([await strikes('a'), await strikes('b'), await strikes('c'), await strikes('d')], [0, 2, 0, 2]);
 // Running again the same day judges nothing twice.
 const again = await runPacks({db, now});
 assert.equal(again.judged, 0);
 assert.equal(await strikes('b'), 2);
});
test('the third warning removes the member, and the pack ends after day 16', async () => {
 await seedRunning('2026-11-01', {checkedThrough: '2026-11-15'});
 await db.doc('packs/p1/members/d').update({strikes: 2});
 for (const uid of ['a', 'b', 'c']) await confirm(uid, '2026-11-16', UIDS.filter(x => x !== uid));
 const s = await runPacks({db, now});
 assert.equal(s.removed, 1);assert.equal(s.finished, 1);
 const d = (await db.doc('packs/p1/members/d').get()).data();
 assert.equal(d.status, 'out');assert.equal(d.strikes, 3);
 assert.equal((await db.doc('packApps/p1_a').get()).data().active, false, 'a finished pack leaves «التطبيقات»');
 const p = (await db.doc('packs/p1').get()).data();
 assert.equal(p.status, 'done');assert.equal(p.endedDay, '2026-11-16');
});
