import test from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../src/domain.js';

const now = new Date('2026-11-10T12:00:00Z');
const base = {source: 'application', invitationStatus: 'accepted', addedToPlayAt: 1, joinedDay: null, checkins: []};

test('playLinks separates opt-in from store and rejects lookalike hosts',() => {
 assert.deepEqual(d.playLinks('https://play.google.com/apps/testing/com.a.b'), {join: 'https://play.google.com/apps/testing/com.a.b', store: 'https://play.google.com/store/apps/details?id=com.a.b'});
 assert.equal(d.playLinks('https://play.google.com/store/apps/details?id=com.a.b').store, 'https://play.google.com/store/apps/details?id=com.a.b');
 for (const bad of ['https://play.google.com.evil.io/apps/testing/com.a.b', 'http://play.google.com/apps/testing/com.a.b', 'https://user@play.google.com/x', 'javascript:alert(1)', '', undefined]) assert.equal(d.playLinks(bad).join, null);
 assert.equal(d.playLinks('https://play.google.com/apps/testing/not_a_package').store, null);
});
test('stage: one clear next step for each assignment state',() => {
 assert.equal(d.testerStage({...base, addedToPlayAt: undefined}, now), 'awaiting-play');
 assert.equal(d.testerStage(base, now), 'setup');
 assert.equal(d.testerStage({...base, source: undefined, addedToPlayAt: undefined}, now), 'setup', 'legacy assignments need no Play confirmation');
 assert.equal(d.testerStage({...base, invitationStatus: 'pending'}, now), 'invited');
 assert.equal(d.testerStage({...base, invitationStatus: 'declined'}, now), 'declined');
 assert.equal(d.testerStage({...base, invitationStatus: 'pending', createdAt: new Date(now.getTime() - 8 * 86400000)}, now), 'expired');
 assert.equal(d.testerStage({...base, joinedDay: '2026-11-09'}, now), 'due');
 assert.equal(d.testerStage({...base, joinedDay: '2026-11-09', checkins: ['2026-11-10']}, now), 'reported');
 assert.equal(d.testerStage({...base, joinedDay: '2026-11-09', checkins: ['2026-11-09'], lastCheckinAt: new Date(now.getTime() - 3600000)}, now), 'cooldown');
 assert.equal(d.testerStage({...base, joinedDay: '2026-10-20'}, now), 'finished');
 assert.equal(d.testerStage({...base, joinedDay: '2026-11-09', leftAt: new Date()}, now), 'left');
});
test('day 14 is still inside the test and day 15 is not',() => {
 assert.equal(d.testerStage({...base, joinedDay: '2026-10-28'}, now), 'due');
 assert.equal(d.testerStage({...base, joinedDay: '2026-10-27'}, now), 'finished');
});
test('strip shows done, missed, today and future honestly',() => {
 const cells = d.dayStrip({joinedDay: '2026-11-07', checkins: ['2026-11-07', '2026-11-09']}, now);
 assert.equal(cells.length, 14);
 assert.deepEqual(cells.slice(0, 5).map(c => c.state), ['done', 'missed', 'done', 'today', 'future']);
});
test('health: three silent days puts a tester at risk',() => {
 assert.equal(d.participantHealth({joinedDay: '2026-11-08', checkins: ['2026-11-09']}, now), 'active');
 assert.equal(d.participantHealth({joinedDay: '2026-11-01', checkins: ['2026-11-06']}, now), 'at-risk');
 assert.equal(d.participantHealth({joinedDay: null}, now), 'pending');
 assert.equal(d.participantHealth({joinedDay: '2026-11-08', leftAt: 1}, now), 'left');
 assert.equal(d.participantHealth({joinedDay: '2026-10-01', checkins: []}, now), 'finished');
});
test('project stats never count pending or departed testers as engaged',() => {
 const project = {id: 'p', testersWanted: 15};
 const stats = d.projectStats(project, {
  assignments: [{projectId: 'p', joinedDay: '2026-11-09', checkins: ['2026-11-10']}, {projectId: 'p', joinedDay: null, source: 'application'}, {projectId: 'p', joinedDay: '2026-11-08', leftAt: 1}, {projectId: 'other', joinedDay: '2026-11-08'}],
  applications: [{projectId: 'p', status: 'pending'}, {projectId: 'p', status: 'rejected'}],
  reports: [{projectId: 'p', outcome: 'ok'}, {projectId: 'p', outcome: 'issue', status: 'new'}, {projectId: 'p', outcome: 'issue', status: 'verified'}],
 }, now);
 assert.equal(stats.participants, 3);
 assert.equal(stats.engaged, 1);
 assert.equal(stats.left, 1);
 assert.equal(stats.awaitingPlay, 1);
 assert.equal(stats.pendingApplications, 1);
 assert.equal(stats.openIssues, 1);
 assert.equal(stats.fixedIssues, 1);
 assert.equal(stats.verifiedIssues, 1);
});
test('summary states the limits of its evidence',() => {
 const text = d.summaryText({id: 'p', name: 'App', tasks: ['Login']}, {participants: 1, engaged: 1, left: 0, longestDays: 2, reports: 2, issues: 0, fixedIssues: 0, verifiedIssues: 0}, [], now);
 assert.match(text, /ليست تحققاً من Google Play/);
 assert.match(text, /Login/);
});
test('tasks and listing validation',() => {
 assert.deepEqual(d.parseTasks('افتح التطبيق\n\n  جرّب البحث  '), ['افتح التطبيق', 'جرّب البحث']);
 assert.throws(() => d.parseTasks('قصر'));
 assert.throws(() => d.parseTasks(Array(15).fill('مهمة طويلة').join('\n')));
 assert.doesNotThrow(() => d.validateListing({name: 'App', link: '', tasks: [], description: ''}, false));
 assert.throws(() => d.validateListing({name: 'App', link: '', tasks: ['x'], description: 'وصف كاف للتطبيق'}, true));
 assert.throws(() => d.validateListing({name: 'App', link: 'https://evil.example/x', tasks: [], description: ''}, false));
});
test('issue reports must be actionable; clean reports need no invented text',() => {
 assert.doesNotThrow(() => d.validateReport({outcome: 'ok', notes: ''}));
 assert.throws(() => d.validateReport({outcome: 'issue', notes: 'قصير', steps: 'خطوات واضحة', severity: 'high'}));
 assert.throws(() => d.validateReport({outcome: 'issue', notes: 'مشكلة واضحة جداً هنا', steps: '', severity: 'high'}));
 assert.throws(() => d.validateReport({outcome: 'issue', notes: 'مشكلة واضحة جداً هنا', steps: 'خطوات واضحة'}));
 assert.doesNotThrow(() => d.validateReport({outcome: 'issue', notes: 'مشكلة واضحة جداً هنا', steps: 'خطوات واضحة', severity: 'low'}));
});
test('daily task rotates by test day',() => {
 const a = {tasks: ['one', 'two'], joinedDay: '2026-11-09'};
 assert.equal(d.taskForDay(a, now), 'two');
 assert.equal(d.taskForDay({...a, joinedDay: '2026-11-08'}, now), 'one');
 assert.equal(d.taskForDay({tasks: [], joinedDay: '2026-11-08'}, now), 'فتح التطبيق وتجربة وظيفة أساسية');
});
test('calendar reminder covers exactly fourteen days',() => {
 const ics = d.calendarFile(20, now);
 assert.match(ics, /RRULE:FREQ=DAILY;COUNT=14/);
 assert.match(ics, /BEGIN:VALARM/);
});

test('reminderUtcHour converts a local hour and stays in range', () => {
 const hour = d.reminderUtcHour(20, now);
 const at = new Date(now); at.setHours(20, 0, 0, 0);
 assert.equal(hour, at.getUTCHours());
 for (let h = 0; h < 24; h++) assert.ok(d.reminderUtcHour(h, now) >= 0 && d.reminderUtcHour(h, now) < 24);
});
test('reminderMessage exists only while a test is due', () => {
 const due = {...base, id: 'p_t', name: 'تطبيق', tasks: ['مهمة'], joinedDay: '2026-11-05'};
 assert.deepEqual(d.reminderMessage([due], now), {title: 'حان وقت اختبار اليوم', body: 'تطبيق: مهمة', url: './#/report/p_t'});
 assert.equal(d.reminderMessage([], now), null);
 assert.equal(d.reminderMessage([{...due, checkins: ['2026-11-10']}], now), null, 'reported');
 assert.equal(d.reminderMessage([{...due, lastCheckinAt: '2026-11-10T08:00:00Z'}], now), null, 'cooldown');
 assert.equal(d.reminderMessage([{...due, joinedDay: '2026-10-01'}], now), null, 'finished');
 assert.equal(d.reminderMessage([{...due, leftAt: '2026-11-09T08:00:00Z'}], now), null, 'left');
 assert.equal(d.reminderMessage([{...due, joinedDay: null}], now), null, 'not started');
 const two = d.reminderMessage([due, {...due, id: 'q_t'}], now);
 assert.equal(two.url, './#/home');
 assert.match(two.body, /: 2$/);
});
test('reminderMessage keeps a long task inside a notification and escapes the route', () => {
 const m = d.reminderMessage([{...base, id: 'a/b', name: 'x'.repeat(70), tasks: ['y'.repeat(120)], joinedDay: '2026-11-05'}], now);
 assert.ok(m.body.length <= 180);
 assert.equal(m.url, './#/report/a%2Fb');
});
