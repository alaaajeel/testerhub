// Pure product logic: no DOM, no Firebase. Everything here is unit tested.
export const TEST_DAYS = 14;
export const PLAY_MIN_TESTERS = 12;
export const DEFAULT_WANTED = 15;
const DAY_MS = 86400000;

export const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

export function daysSince(key, now = new Date()) {
  if (!key) return 0;
  const [y, m, d] = key.split('-').map(Number);
  if (!y) return 0;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(1, Math.floor((today - Date.UTC(y, m - 1, d)) / DAY_MS) + 1);
}

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

// Keep opt-in separate from the store destination; neither proves installation.
export function playLinks(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.hostname !== 'play.google.com' || url.username || url.password || url.port) return {join: null, store: null};
    const match = url.pathname.match(/^\/apps\/(?:internaltest|testing)\/([^/]+)\/?$/);
    const id = match?.[1] || (url.pathname === '/store/apps/details' ? url.searchParams.get('id') : null);
    return {join: url.href, store: id && PACKAGE.test(id) ? 'https://play.google.com/store/apps/details?id=' + encodeURIComponent(id) : null};
  } catch {
    return {join: null, store: null};
  }
}

export function parseTasks(raw) {
  const tasks = String(raw || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);
  if (tasks.length > TEST_DAYS || tasks.some(t => t.length < 5 || t.length > 120) || tasks.join('|').length > 1680) {
    throw new Error('أضف من مهمة إلى 14 مهمة، وكل مهمة بين 5 و120 حرفاً.');
  }
  return tasks;
}

export function validateListing({name, link, tasks, description}, publish) {
  if (String(name || '').trim().length < 2 || String(name).trim().length > 70) throw new Error('اسم التطبيق يجب أن يكون بين حرفين و70 حرفاً.');
  if (link && !playLinks(link).join) throw new Error('أدخل رابطاً صحيحاً من play.google.com.');
  if (String(description || '').length > 600) throw new Error('الوصف طويل؛ الحد الأقصى 600 حرف.');
  if (!publish) return;
  if (!playLinks(link).join) throw new Error('رابط الاختبار المغلق مطلوب قبل النشر.');
  if (!tasks.length) throw new Error('أضف مهمة واحدة على الأقل حتى يعرف المختبر ماذا يجرب.');
  if (String(description || '').trim().length < 10) throw new Error('اكتب وصفاً قصيراً للتطبيق، 10 أحرف على الأقل.');
}

export function validateReport({outcome, notes, steps, severity}) {
  if (!['ok', 'issue'].includes(outcome)) throw new Error('حدد نتيجة التجربة.');
  const text = String(notes || '').trim();
  if (text.length > 800) throw new Error('الملاحظة طويلة؛ الحد الأقصى 800 حرف.');
  if (outcome !== 'issue') return;
  if (text.length < 10) throw new Error('صف المشكلة بوضوح، 10 أحرف على الأقل.');
  if (String(steps || '').trim().length < 5) throw new Error('اكتب خطوات إعادة المشكلة حتى يستطيع المطور إصلاحها.');
  if (!['low', 'medium', 'high'].includes(severity)) throw new Error('حدد مدى خطورة المشكلة.');
}

export function taskForDay(assignment, now = new Date()) {
  const tasks = assignment.tasks;
  if (!Array.isArray(tasks) || !tasks.length) return 'فتح التطبيق وتجربة وظيفة أساسية';
  return tasks[Math.max(0, daysSince(assignment.joinedDay, now) - 1) % tasks.length];
}

const millis = stamp => typeof stamp?.toMillis === 'function' ? stamp.toMillis()
  : typeof stamp?.seconds === 'number' ? stamp.seconds * 1000
  : typeof stamp === 'string' ? Date.parse(stamp)
  : stamp instanceof Date ? stamp.getTime() : NaN;
export {millis};

export const inviteExpired = (a, now = Date.now()) => a.invitationStatus === 'pending' && Number.isFinite(millis(a.createdAt)) && now >= millis(a.createdAt) + 7 * DAY_MS;

// What this tester must do next on this assignment. One state, one action.
export function testerStage(a, now = new Date()) {
  if (a.leftAt) return 'left';
  if (!a.joinedDay) {
    if (a.invitationStatus === 'declined') return 'declined';
    if (inviteExpired(a, now.getTime())) return 'expired';
    if (a.invitationStatus === 'pending') return 'invited';
    if (a.source === 'application' && !a.addedToPlayAt) return 'awaiting-play';
    return 'setup';
  }
  if (daysSince(a.joinedDay, now) > TEST_DAYS) return 'finished';
  if ((a.checkins || []).includes(dayKey(now))) return 'reported';
  const last = millis(a.lastCheckinAt);
  if (Number.isFinite(last) && now.getTime() - last < 14 * 3600000) return 'cooldown';
  return 'due';
}

export const hoursUntilNextReport = (a, now = new Date()) => {
  const last = millis(a.lastCheckinAt);
  return Number.isFinite(last) ? Math.max(1, Math.ceil((last + 14 * 3600000 - now.getTime()) / 3600000)) : 0;
};

export function groupTesterWork(assignments, now = new Date()) {
  const groups = {due: [], setup: [], waiting: [], done: [], past: []};
  for (const a of assignments) {
    const stage = testerStage(a, now);
    if (stage === 'due') groups.due.push(a);
    else if (stage === 'invited' || stage === 'setup') groups.setup.push(a);
    else if (stage === 'awaiting-play' || stage === 'cooldown') groups.waiting.push(a);
    else if (stage === 'reported') groups.done.push(a);
    else groups.past.push(a);
  }
  return groups;
}

// The signature strip: one cell per test day, for testers and developers alike.
export function dayStrip(a, now = new Date()) {
  const cells = [];
  const today = a.joinedDay ? daysSince(a.joinedDay, now) : 0;
  const start = a.joinedDay ? Date.parse(a.joinedDay + 'T00:00:00Z') : 0;
  const done = new Set(a.checkins || []);
  for (let i = 1; i <= TEST_DAYS; i++) {
    const key = a.joinedDay ? new Date(start + (i - 1) * DAY_MS).toISOString().slice(0, 10) : '';
    const state = done.has(key) ? 'done' : i === today && !a.leftAt ? 'today' : i < today || a.leftAt && i <= today ? 'missed' : 'future';
    cells.push({day: i, state});
  }
  return cells;
}

// A participant counts as active while opted in and reporting within the last three days.
export function participantHealth(a, now = new Date()) {
  if (a.leftAt) return 'left';
  if (!a.joinedDay) return 'pending';
  const elapsed = daysSince(a.joinedDay, now);
  if (elapsed > TEST_DAYS) return 'finished';
  const checkins = [...(a.checkins || [])].sort();
  const last = checkins.at(-1) || a.joinedDay;
  return daysSince(last, now) - 1 >= 3 ? 'at-risk' : 'active';
}

export function projectStats(project, {assignments = [], applications = [], reports = []}, now = new Date()) {
  const own = assignments.filter(a => a.projectId === project.id);
  const ownReports = reports.filter(r => r.projectId === project.id);
  const health = own.map(a => participantHealth(a, now));
  const count = name => health.filter(h => h === name).length;
  const issues = ownReports.filter(r => r.outcome === 'issue');
  const engaged = count('active') + count('at-risk') + count('finished');
  return {
    wanted: project.testersWanted || DEFAULT_WANTED,
    participants: own.length,
    engaged,
    active: count('active'),
    atRisk: count('at-risk'),
    left: count('left'),
    finished: count('finished'),
    longestDays: own.reduce((max, a) => a.joinedDay && !a.leftAt ? Math.max(max, Math.min(TEST_DAYS, daysSince(a.joinedDay, now))) : max, 0),
    pendingApplications: applications.filter(x => x.projectId === project.id && x.status === 'pending').length,
    awaitingPlay: own.filter(a => a.source === 'application' && !a.addedToPlayAt && !a.leftAt).length,
    reports: ownReports.length,
    issues: issues.length,
    openIssues: issues.filter(r => ['new', 'reopened'].includes(r.status)).length,
    fixedIssues: issues.filter(r => ['fixed', 'verified'].includes(r.status)).length,
    verifiedIssues: issues.filter(r => r.status === 'verified').length,
  };
}

// An honest draft built only from recorded data; the developer must review and edit it.
export function summaryText(project, stats, reports, now = new Date()) {
  const issues = reports.filter(r => r.projectId === project.id && r.outcome === 'issue');
  const tasks = (project.tasks || []).map(t => '- ' + t).join('\n');
  const bugs = issues.slice(0, 15).map(r => `- [${statusLabel(r.status)}] ${String(r.notes || '').slice(0, 120)}`).join('\n');
  return [
    `ملخص اختبار تطبيق ${project.name}`,
    `تاريخ الملخص: ${dayKey(now)}`,
    '',
    `المشاركون في الاختبار: ${stats.participants}، منهم ${stats.engaged} بدأوا فعلياً و${stats.left} انسحبوا.`,
    `أطول مدة مشاركة مسجلة: ${stats.longestDays} يوماً.`,
    `التقارير اليومية: ${stats.reports}.`,
    `المشكلات المبلغ عنها: ${stats.issues}، أُصلح منها ${stats.fixedIssues}، وأكد المختبرون إصلاح ${stats.verifiedIssues}.`,
    '',
    'ما طُلب من المختبرين تجربته:',
    tasks || '- لا توجد مهام مسجلة',
    '',
    'المشكلات وحالتها:',
    bugs || '- لم يُبلغ عن مشكلات',
    '',
    'ملاحظة: هذه الأرقام مسجلة في TesterHub من إقرارات المختبرين، وليست تحققاً من Google Play.',
  ].join('\n');
}

export const statusLabel = status => ({
  ok: 'يعمل', new: 'جديد', reopened: 'أعيد فتحه', fixed: 'أُصلح، بانتظار التأكيد', verified: 'تأكد الإصلاح', wontfix: 'لن يُصلح',
}[status] || status || '');

export const severityLabel = s => ({low: 'بسيطة', medium: 'متوسطة', high: 'تمنع الاستخدام'}[s] || '');

export const projectStatusLabel = s => ({
  draft: 'مسودة', recruiting: 'يستقبل المختبرين', paused: 'الاستقبال متوقف', completed: 'مكتمل', archived: 'مؤرشف',
}[s || 'recruiting'] || s);

export function testerRecord(assignments, reports, now = new Date()) {
  const finished = assignments.filter(a => testerStage(a, now) === 'finished');
  return {
    tests: assignments.filter(a => a.joinedDay).length,
    finished: finished.length,
    completed: finished.filter(a => (a.checkins || []).length >= TEST_DAYS - 2).length,
    reports: reports.length,
    bugs: reports.filter(r => r.outcome === 'issue').length,
    fixed: reports.filter(r => ['fixed', 'verified'].includes(r.status)).length,
  };
}

export function calendarFile(hour, now = new Date()) {
  const start = new Date(now);
  start.setHours(hour, 0, 0, 0);
  if (start <= now) start.setDate(start.getDate() + 1);
  const end = new Date(start.getTime() + 5 * 60000);
  const pad = n => String(n).padStart(2, '0');
  const local = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TesterHub//Daily Test Reminder//AR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:testerhub-${now.getTime()}@reminder.local`, `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${local(start)}`, `DTEND:${local(end)}`, `RRULE:FREQ=DAILY;COUNT=${TEST_DAYS}`,
    'SUMMARY:TesterHub - اختبار التطبيق اليومي', 'DESCRIPTION:جرّب التطبيق ثم سجّل تقرير اليوم في TesterHub.',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:حان وقت اختبار اليوم - TesterHub', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
