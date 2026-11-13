// The real job against the Firestore emulator. FCM has no emulator, so only the send call is faked.
import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';
import {runActivity, runReminders} from '../../scripts/push-job.mjs';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const now = new Date('2026-11-10T17:17:00Z');
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const at = ms => Timestamp.fromMillis(now.getTime() - ms);
let app, db;
before(() => { app = initializeApp({projectId: 'demo-testerhub'}, 'push-job'); db = getFirestore(app); });
after(() => deleteApp(app));

const messaging = (answer = () => ({success: true})) => {
 const calls = [];
 return {calls, sendEach: async list => { calls.push(...list); return {responses: list.map(answer)}; }};
};
const device = (id, uid, extra = {}) => db.doc('pushDevices/' + id).set({uid, token: 'token-' + id, reminderUtcHour: 17, updatedAt: at(DAY), ...extra});
const assignment = (id, testerUid, extra = {}) => db.doc('assignments/' + id).set({testerUid, ownerUid: 'd1', projectId: 'open', name: 'تطبيق ' + id, tasks: ['مهمة اليوم'], joinedDay: '2026-11-05', checkins: [], createdAt: at(DAY), ...extra});
const message = (id, sender, ago, extra = {}) => db.doc('messages/' + id).set({sender, testerUid: 't1', ownerUid: 'd1', text: 'نص ' + id, createdAt: at(ago), ...extra});
const cursor = ago => db.doc('pushState/activity').set({lastRunAt: at(ago)});
const sentTo = m => m.calls.map(c => c.token).sort();

beforeEach(async () => {
 await fetch('http://' + process.env.FIRESTORE_EMULATOR_HOST + '/emulator/v1/projects/demo-testerhub/databases/(default)/documents', {method: 'DELETE'});
 for (const uid of ['t1', 't2', 'd1']) await db.doc('users/' + uid).set({name: 'User', role: uid === 'd1' ? 'developer' : 'tester'});
 await db.doc('projects/open').set({status: 'recruiting'});
 await db.doc('projects/archived').set({status: 'archived'});
});

/* Daily reminder */
test('reminds a tester whose report is due and records it', async () => {
 await device('a', 't1');
 await assignment('x', 't1');
 const m = messaging();
 assert.deepEqual(await runReminders({db, messaging: m, now}), {sent: 1, failed: 0, removed: 0});
 assert.equal(m.calls[0].token, 'token-a');
 assert.match(m.calls[0].data.body, /تطبيق x: مهمة اليوم/);
 assert.ok(Object.values(m.calls[0].data).every(v => typeof v === 'string'), 'FCM data values must be strings');
 assert.equal((await db.doc('pushDevices/a').get()).get('lastReminderAt').toMillis(), now.getTime());
});
test('every state other than due stays silent', async () => {
 const silent = {
  reported: {checkins: ['2026-11-10']},
  cooldown: {lastCheckinAt: at(5 * HOUR)},
  finished: {joinedDay: '2026-10-01'},
  left: {leftAt: at(DAY)},
  notStarted: {joinedDay: null},
  declined: {joinedDay: null, invitationStatus: 'declined'},
 };
 for (const [id, extra] of Object.entries(silent)) await assignment(id, 't1', extra);
 await device('a', 't1');
 const m = messaging();
 assert.equal((await runReminders({db, messaging: m, now})).sent, 0);
 assert.equal(m.calls.length, 0);
});
test('day 14 is reminded and day 15 is not', async () => {
 await device('a', 't1');
 await assignment('last', 't1', {joinedDay: '2026-10-28'});
 const m = messaging();
 assert.equal((await runReminders({db, messaging: m, now})).sent, 1);
 await db.doc('assignments/last').update({joinedDay: '2026-10-27'});
 await db.doc('pushDevices/a').update({lastReminderAt: at(2 * DAY)});
 assert.equal((await runReminders({db, messaging: m, now})).sent, 0);
});
test('two due tests become one message, on every device of that tester', async () => {
 await device('phone', 't1'); await device('tablet', 't1');
 await assignment('x', 't1'); await assignment('y', 't1');
 const m = messaging();
 await runReminders({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-phone', 'token-tablet']);
 assert.match(m.calls[0].data.body, /2 تطبيقات/);
});
test('a run up to 5 hours late still reminds; future and older hours are left alone', async () => {
 // GitHub runs the schedule only a few times a day, so a run must catch up the last 6 hours.
 await device('now', 't1'); await device('late', 't1', {reminderUtcHour: 16}); await device('fiveLate', 't1', {reminderUtcHour: 12});
 await device('sixLate', 't1', {reminderUtcHour: 11}); await device('later', 't1', {reminderUtcHour: 18}); await device('early', 't1', {reminderUtcHour: 3});
 await assignment('x', 't1');
 const m = messaging();
 await runReminders({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-fiveLate', 'token-late', 'token-now']);
});
test('the catch-up window wraps across midnight UTC', async () => {
 await device('lateNight', 't1', {reminderUtcHour: 22});
 await assignment('x', 't1');
 const m = messaging();
 await runReminders({db, messaging: m, now: new Date('2026-11-11T01:30:00Z')});
 assert.deepEqual(sentTo(m), ['token-lateNight']);
});
test('running every 15 minutes still reminds once a day', async () => {
 await device('a', 't1');
 await assignment('x', 't1');
 const m = messaging();
 for (const offset of [0, 15, 30, 45, 60]) await runReminders({db, messaging: m, now: new Date(now.getTime() + offset * MIN)});
 assert.equal(m.calls.length, 1);
 await runReminders({db, messaging: m, now: new Date(now.getTime() + DAY)});
 assert.equal(m.calls.length, 2, 'the next day it is due again');
});
test('suspended testers and archived projects get nothing, and suspension keeps the device', async () => {
 await db.doc('users/t2').set({name: 'User', role: 'tester', suspended: true});
 await device('susp', 't2'); await assignment('s', 't2');
 await device('arch', 't1'); await assignment('z', 't1', {projectId: 'archived'});
 const m = messaging();
 const result = await runReminders({db, messaging: m, now});
 assert.equal(m.calls.length, 0);
 assert.equal(result.removed, 0);
});
test('dead tokens, stale devices and deleted accounts are cleaned up', async () => {
 await device('dead', 't1'); await device('invalid', 't1'); await device('fine', 't1');
 await device('stale', 't1', {updatedAt: at(61 * DAY)}); await device('orphan', 'deleted-user');
 await assignment('x', 't1');
 const codes = {'token-dead': 'messaging/registration-token-not-registered', 'token-invalid': 'messaging/invalid-registration-token'};
 const m = messaging(c => codes[c.token] ? {success: false, error: {code: codes[c.token]}} : {success: true});
 assert.deepEqual(await runReminders({db, messaging: m, now}), {sent: 1, failed: 0, removed: 4});
 assert.deepEqual((await db.collection('pushDevices').get()).docs.map(d => d.id), ['fine']);
});
test('a failure that is not about the token keeps the device and allows a retry', async () => {
 await device('a', 't1');
 await assignment('x', 't1');
 const failing = messaging(() => ({success: false, error: {code: 'messaging/internal-error'}}));
 assert.deepEqual(await runReminders({db, messaging: failing, now}), {sent: 0, failed: 1, removed: 0});
 const retry = messaging();
 assert.equal((await runReminders({db, messaging: retry, now: new Date(now.getTime() + HOUR)})).sent, 1);
});

/* Messages and invitations */
test('a new message reaches the other side only, with its text', async () => {
 await cursor(15 * MIN);
 await device('tester', 't1'); await device('dev', 'd1');
 await message('fromDev', 'developer', 5 * MIN);
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-tester']);
 assert.equal(m.calls[0].data.body, 'نص fromDev');
 assert.equal(m.calls[0].data.title, 'TesterHub — رسالة جديدة');
});
test('a tester message reaches the developer', async () => {
 await cursor(15 * MIN);
 await device('dev', 'd1');
 await message('fromTester', 'tester', 5 * MIN);
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-dev']);
});
test('a new invitation reaches the tester; other new assignment states do not', async () => {
 await cursor(15 * MIN);
 await device('tester', 't1');
 await assignment('fresh', 't1', {joinedDay: null, invitationStatus: 'pending', createdAt: at(5 * MIN)});
 await assignment('oldStyle', 't1', {joinedDay: null, invitationStatus: 'declined', createdAt: at(5 * MIN)});
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.equal(m.calls.length, 1);
 assert.match(m.calls[0].data.body, /تطبيق fresh/);
});
test('several events become one summary per person', async () => {
 await cursor(15 * MIN);
 await device('tester', 't1');
 await message('a', 'developer', 5 * MIN); await message('b', 'developer', 4 * MIN);
 await assignment('fresh', 't1', {joinedDay: null, invitationStatus: 'pending', createdAt: at(3 * MIN)});
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.equal(m.calls.length, 1);
 assert.equal(m.calls[0].data.body, 'لديك 1 دعوة و2 رسالة');
});
test('each event is announced once, across runs', async () => {
 await cursor(15 * MIN);
 await device('tester', 't1');
 await message('a', 'developer', 5 * MIN);
 const m = messaging();
 await runActivity({db, messaging: m, now});
 await runActivity({db, messaging: m, now: new Date(now.getTime() + 15 * MIN)});
 assert.equal(m.calls.length, 1);
 assert.equal((await db.doc('pushState/activity').get()).get('lastRunAt').toMillis(), now.getTime() + 15 * MIN);
});
test('the first ever run does not replay history', async () => {
 await device('tester', 't1');
 await message('old', 'developer', 2 * HOUR);
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.equal(m.calls.length, 0);
});
test('a long outage does not bury people in old news', async () => {
 await cursor(3 * DAY);
 await device('tester', 't1');
 await message('ancient', 'developer', 2 * DAY); await message('recent', 'developer', HOUR);
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.equal(m.calls[0].data.body, 'نص recent');
});
test('a messaging outage keeps the news for the next run', async () => {
 await cursor(15 * MIN);
 await device('tester', 't1');
 await message('a', 'developer', 5 * MIN);
 const failing = messaging(() => ({success: false, error: {code: 'messaging/internal-error'}}));
 assert.equal((await runActivity({db, messaging: failing, now})).failed, 1);
 const retry = messaging();
 assert.equal((await runActivity({db, messaging: retry, now: new Date(now.getTime() + 15 * MIN)})).sent, 1);
});
test('suspended recipients get nothing and a dead token is removed', async () => {
 await cursor(15 * MIN);
 await db.doc('users/t1').set({name: 'User', role: 'tester', suspended: true});
 await device('susp', 't1'); await device('dead', 'd1');
 await message('a', 'developer', 5 * MIN); await message('b', 'tester', 5 * MIN);
 const m = messaging(() => ({success: false, error: {code: 'messaging/registration-token-not-registered'}}));
 const result = await runActivity({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-dead']);
 assert.equal(result.removed, 1);
 assert.ok((await db.doc('pushDevices/susp').get()).exists);
});
test('nothing new means no sends', async () => {
 await cursor(15 * MIN);
 await device('tester', 't1');
 const m = messaging();
 assert.equal((await runActivity({db, messaging: m, now})).events, 0);
 assert.equal(m.calls.length, 0);
});

/* Messages with the platform team */
test('a message from the team reaches the user with its own title', async () => {
 await cursor(15 * MIN);
 await device('tester', 't1');
 await db.doc('supportMessages/s1').set({uid: 't1', sender: 'admin', senderUid: 'owner', text: 'مرحباً من الإدارة', createdAt: at(5 * MIN)});
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.equal(m.calls.length, 1);
 assert.equal(m.calls[0].data.title, 'TesterHub — رسالة من الإدارة');
 assert.equal(m.calls[0].data.body, 'مرحباً من الإدارة');
});
test('a user reply reaches every active owner and nobody else', async () => {
 await cursor(15 * MIN);
 await db.doc('adminRoles/owner').set({active: true});
 await db.doc('adminRoles/old').set({active: false});
 for (const uid of ['owner', 'old']) await db.doc('users/' + uid).set({name: 'Admin', role: 'tester'});
 await device('ownerPhone', 'owner'); await device('oldPhone', 'old'); await device('tester', 't1');
 await db.doc('supportMessages/r1').set({uid: 't1', sender: 'user', senderUid: 't1', text: 'شكراً، فهمت', createdAt: at(5 * MIN)});
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-ownerPhone']);
 assert.equal(m.calls[0].data.title, 'TesterHub — رد من مستخدم');
 assert.equal(m.calls[0].data.url, './admin.html');
});

/* Admin announcements */
const notice = (id, ago, extra = {}) => db.doc('announcements/' + id).set({kind: 'update', audience: 'all', broadcast: true, targetUid: '', title: 'تحديث جديد', body: 'نزل تحديث المجموعات', active: true, createdAt: at(ago), ...extra});
test('an announcement to all reaches every device of every active user, once', async () => {
 await cursor(15 * MIN);
 await device('a', 't1'); await device('b', 't2'); await device('c', 'd1');
 await db.doc('users/t2').set({name: 'User', suspended: true});
 await notice('n1', 5 * MIN);
 const m = messaging();
 const r = await runActivity({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-a', 'token-c']);
 assert.equal(m.calls[0].data.title, 'TesterHub — تحديث جديد');
 assert.equal(m.calls[0].data.body, 'نزل تحديث المجموعات');
 assert.equal(r.broadcasts, 1);
 const again = messaging();
 await runActivity({db, messaging: again, now: new Date(now.getTime() + 15 * MIN)});
 assert.equal(again.calls.length, 0);
});
test('an announcement to one person reaches only them; a withdrawn one reaches nobody', async () => {
 await cursor(15 * MIN);
 await device('a', 't1'); await device('b', 't2');
 await notice('n2', 5 * MIN, {audience: 'user', broadcast: false, targetUid: 't2', title: 'رسالة لك', body: 'مرحبا'});
 await notice('n3', 4 * MIN, {active: false});
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-b']);
 assert.equal(m.calls[0].data.title, 'TesterHub — رسالة لك');
});
test('a broadcast and personal news arrive as one message', async () => {
 await cursor(15 * MIN);
 await device('tester', 't1');
 await message('fromDev', 'developer', 5 * MIN);
 await notice('n4', 5 * MIN);
 const m = messaging();
 await runActivity({db, messaging: m, now});
 assert.equal(m.calls.length, 1);
 assert.match(m.calls[0].data.body, /ولديك 1 جديد/);
});
