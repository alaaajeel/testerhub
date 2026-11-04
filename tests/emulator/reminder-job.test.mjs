// The real job against the Firestore emulator. FCM has no emulator, so only the send call is faked.
import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore, Timestamp} from 'firebase-admin/firestore';
import {runReminders} from '../../scripts/reminder-job.mjs';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
const now = new Date('2026-11-10T17:17:00Z');
const HOUR = 3600000, DAY = 24 * HOUR;
const at = ms => Timestamp.fromMillis(now.getTime() - ms);
let app, db;
before(() => { app = initializeApp({projectId: 'demo-testerhub'}, 'reminder-job'); db = getFirestore(app); });
after(() => deleteApp(app));

const messaging = (answer = () => ({success: true})) => {
 const calls = [];
 return {calls, sendEach: async list => { calls.push(...list); return {responses: list.map(answer)}; }};
};
const device = (id, uid, extra = {}) => db.doc('pushDevices/' + id).set({uid, token: 'token-' + id, reminderUtcHour: 17, updatedAt: at(DAY), ...extra});
const assignment = (id, testerUid, extra = {}) => db.doc('assignments/' + id).set({testerUid, projectId: 'open', name: 'تطبيق ' + id, tasks: ['مهمة اليوم'], joinedDay: '2026-11-05', checkins: [], ...extra});
const sentTo = m => m.calls.map(c => c.token).sort();

beforeEach(async () => {
 await fetch('http://' + process.env.FIRESTORE_EMULATOR_HOST + '/emulator/v1/projects/demo-testerhub/databases/(default)/documents', {method: 'DELETE'});
 for (const uid of ['t1', 't2']) await db.doc('users/' + uid).set({name: 'User', role: 'tester'});
 await db.doc('projects/open').set({status: 'recruiting'});
 await db.doc('projects/archived').set({status: 'archived'});
});

test('reminds a tester whose stage is due and records it', async () => {
 await device('a', 't1');
 await assignment('x', 't1');
 const m = messaging();
 assert.deepEqual(await runReminders({db, messaging: m, now}), {checked: 1, sent: 1, failed: 0, removed: 0});
 assert.equal(m.calls[0].token, 'token-a');
 assert.equal(m.calls[0].data.url, './#/report/x');
 assert.match(m.calls[0].data.body, /تطبيق x: مهمة اليوم/);
 assert.ok(Object.values(m.calls[0].data).every(v => typeof v === 'string'), 'FCM data values must be strings');
 assert.equal((await db.doc('pushDevices/a').get()).get('lastReminderAt').toMillis(), now.getTime());
});
test('every stage other than due stays silent', async () => {
 const silent = {
  reported: {checkins: ['2026-11-10']},
  cooldown: {lastCheckinAt: at(5 * HOUR)},
  finished: {joinedDay: '2026-10-01'},
  left: {leftAt: at(DAY)},
  notStarted: {joinedDay: null},
 };
 for (const [id, extra] of Object.entries(silent)) await assignment(id, 't1', extra);
 await device('a', 't1');
 const m = messaging();
 assert.equal((await runReminders({db, messaging: m, now})).sent, 0);
 assert.equal(m.calls.length, 0);
 assert.equal((await db.doc('pushDevices/a').get()).get('lastReminderAt'), undefined);
});
test('two due tests become one message, on every device of that tester', async () => {
 await device('phone', 't1'); await device('tablet', 't1');
 await assignment('x', 't1'); await assignment('y', 't1');
 const m = messaging();
 await runReminders({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-phone', 'token-tablet']);
 assert.equal(m.calls[0].data.url, './#/home');
 assert.match(m.calls[0].data.body, /: 2$/);
});
test('other hours are left alone but a skipped previous hour is caught up', async () => {
 await device('now', 't1'); await device('late', 't1', {reminderUtcHour: 16}); await device('later', 't1', {reminderUtcHour: 18}); await device('early', 't1', {reminderUtcHour: 3});
 await assignment('x', 't1');
 const m = messaging();
 await runReminders({db, messaging: m, now});
 assert.deepEqual(sentTo(m), ['token-late', 'token-now']);
});
test('the previous hour wraps around midnight', async () => {
 await device('late', 't1', {reminderUtcHour: 23});
 await assignment('x', 't1');
 const m = messaging();
 await runReminders({db, messaging: m, now: new Date('2026-11-10T00:17:00Z')});
 assert.deepEqual(sentTo(m), ['token-late']);
});
test('running twice, or again the next hour, sends once', async () => {
 await device('a', 't1');
 await assignment('x', 't1');
 const m = messaging();
 await runReminders({db, messaging: m, now});
 await runReminders({db, messaging: m, now});
 await runReminders({db, messaging: m, now: new Date(now.getTime() + HOUR)});
 assert.equal(m.calls.length, 1);
 await runReminders({db, messaging: m, now: new Date(now.getTime() + DAY)});
 assert.equal(m.calls.length, 2, 'the next day it is due again');
});
test('a late hour crossing midnight does not repeat as a new day', async () => {
 await device('a', 't1', {reminderUtcHour: 23});
 await assignment('x', 't1', {joinedDay: '2026-11-05'});
 const m = messaging();
 await runReminders({db, messaging: m, now: new Date('2026-11-10T23:17:00Z')});
 await runReminders({db, messaging: m, now: new Date('2026-11-11T00:17:00Z')});
 assert.equal(m.calls.length, 1);
});
test('suspended testers and archived projects get nothing', async () => {
 await db.doc('users/t2').set({name: 'User', role: 'tester', suspended: true});
 await device('susp', 't2'); await assignment('s', 't2');
 await device('arch', 't1'); await assignment('z', 't1', {projectId: 'archived'});
 const m = messaging();
 const result = await runReminders({db, messaging: m, now});
 assert.equal(m.calls.length, 0);
 assert.equal(result.removed, 0, 'a suspension can be lifted, so the device stays');
});
test('an archived project does not hide another due test', async () => {
 await device('a', 't1');
 await assignment('z', 't1', {projectId: 'archived'}); await assignment('x', 't1');
 const m = messaging();
 await runReminders({db, messaging: m, now});
 assert.equal(m.calls[0].data.url, './#/report/x');
});
test('dead tokens, stale devices and deleted accounts are cleaned up', async () => {
 await device('dead', 't1'); await device('invalid', 't1'); await device('fine', 't1');
 await device('stale', 't1', {updatedAt: at(61 * DAY)}); await device('orphan', 'deleted-user');
 await assignment('x', 't1');
 const codes = {'token-dead': 'messaging/registration-token-not-registered', 'token-invalid': 'messaging/invalid-registration-token'};
 const m = messaging(c => codes[c.token] ? {success: false, error: {code: codes[c.token]}} : {success: true});
 assert.deepEqual(await runReminders({db, messaging: m, now}), {checked: 5, sent: 1, failed: 0, removed: 4});
 assert.deepEqual((await db.collection('pushDevices').get()).docs.map(d => d.id), ['fine']);
});
test('a failure that is not about the token keeps the device and allows a retry', async () => {
 await device('a', 't1');
 await assignment('x', 't1');
 const failing = messaging(() => ({success: false, error: {code: 'messaging/internal-error'}}));
 assert.deepEqual(await runReminders({db, messaging: failing, now}), {checked: 1, sent: 0, failed: 1, removed: 0});
 assert.ok((await db.doc('pushDevices/a').get()).exists);
 const retry = messaging();
 assert.equal((await runReminders({db, messaging: retry, now: new Date(now.getTime() + HOUR)})).sent, 1);
});
test('nothing registered this hour means nothing to do', async () => {
 const m = messaging();
 assert.deepEqual(await runReminders({db, messaging: m, now}), {checked: 0, sent: 0, failed: 0, removed: 0});
});
