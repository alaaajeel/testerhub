import {state} from '../store.js';
import {groupTesterWork, testerStage, taskForDay, daysSince, playLinks, testerRecord, statusLabel, severityLabel, hoursUntilNextReport, TEST_DAYS, dayKey} from '../domain.js';
import {esc, icon, strip, empty, num} from '../ui.js';
import {backLink} from './common.js';
import {shouldOfferReminder} from '../reminders.js';

const mine = () => state.data.assignments;

function setupSteps(a) {
  const links = playLinks(a.link);
  return `<ol class="steps">
   <li><span>انضم إلى الاختبار من Google Play بالبريد الذي قدّمت به.</span><button class="btn ghost small" data-action="open-play" data-kind="join" data-id="${esc(a.id)}">${icon('link', 16)} رابط الانضمام</button></li>
   <li><span>نزّل التطبيق وثبّته على هاتفك.</span>${links.store ? `<button class="btn ghost small" data-action="open-play" data-kind="store" data-id="${esc(a.id)}">${icon('download', 16)} صفحة التنزيل</button>` : '<small class="muted">ستجد رابط التنزيل في صفحة الانضمام.</small>'}</li>
   <li><span>عندما يصبح التطبيق على هاتفك، ابدأ العد.</span><button class="btn primary small" data-action="start-test" data-id="${esc(a.id)}">انضممت وثبّتّه</button></li></ol>`;
}

function card(a) {
  const stage = testerStage(a), head = `<div class="row between"><h3>${esc(a.name)}</h3>${tag(a, stage)}</div>`;
  const joined = !!a.joinedDay;
  const actions = {
    due: `<p class="task"><small>مهمة اليوم</small>${esc(taskForDay(a))}</p><a class="btn primary wide" href="#/report/${esc(a.id)}">جرّبت التطبيق، سجّل التقرير</a>`,
    reported: `<p class="muted small">${icon('check', 16)} سجّلت تقرير اليوم. نراك غداً.</p>`,
    cooldown: `<p class="muted small">التقرير التالي يفتح بعد نحو ${hoursUntilNextReport(a)} ساعة.</p>`,
    setup: setupSteps(a),
    'awaiting-play': '<p class="muted small">وافق المطور على طلبك، وننتظر أن يضيف بريدك في Play Console. ستظهر خطوات الانضمام هنا بعدها.</p>',
    invited: `<p class="muted small">دعاك المطور إلى هذا الاختبار.</p><div class="row"><button class="btn primary" data-action="invite" data-value="accepted" data-id="${esc(a.id)}">قبول</button><button class="btn ghost" data-action="invite" data-value="declined" data-id="${esc(a.id)}">رفض</button></div>`,
    finished: `<p class="muted small">انتهت الأيام الأربعة عشر، وسجّلت ${(a.checkins || []).length} تقريراً. شكراً لك.</p>`,
    left: '<p class="muted small">انسحبت من هذا الاختبار.</p>',
    declined: '<p class="muted small">رفضت هذه الدعوة.</p>',
    expired: '<p class="muted small">انتهت مهلة هذه الدعوة.</p>',
  }[stage] || '';
  const live = ['due', 'reported', 'cooldown'].includes(stage);
  return `<article class="card test-card">${head}${joined ? strip(a) : ''}${actions}
   ${joined || stage === 'awaiting-play' ? `<div class="row wrap foot"><a class="btn text small" href="#/chat/${esc(a.id)}">${icon('message', 16)} مراسلة المطور</a>${live ? `<button class="btn text small" data-action="open-play" data-kind="store" data-id="${esc(a.id)}">${icon('link', 16)} صفحة التطبيق</button><button class="btn text small muted-btn" data-action="leave" data-id="${esc(a.id)}">انسحاب</button>` : ''}</div>` : ''}
   ${fixedIssues(a)}</article>`;
}

function tag(a, stage) {
  if (a.joinedDay && stage !== 'finished' && stage !== 'left') return `<span class="tag ${stage === 'due' ? 'warn' : 'good'}">اليوم ${Math.min(TEST_DAYS, daysSince(a.joinedDay))} من 14</span>`;
  return {finished: '<span class="tag">مكتمل</span>', left: '<span class="tag">منسحب</span>', setup: '<span class="tag warn">جاهز للبدء</span>', 'awaiting-play': '<span class="tag">بانتظار المطور</span>', invited: '<span class="tag warn">دعوة</span>'}[stage] || '';
}

// A developer's fix is only closed when the person who found the bug confirms it.
function fixedIssues(a) {
  const waiting = state.data.reports.filter(r => r.assignmentId === a.id && r.status === 'fixed');
  return waiting.map(r => `<div class="retest"><strong>المطور يقول إنه أصلح هذه المشكلة:</strong><p>${esc(r.notes)}</p><div class="row"><button class="btn primary small" data-action="issue-status" data-id="${esc(r.id)}" data-value="verified">تأكدت، انحلّت</button><button class="btn ghost small" data-action="issue-status" data-id="${esc(r.id)}" data-value="reopened">ما زالت موجودة</button></div></div>`).join('');
}

function pendingApplications() {
  return state.data.applications.filter(x => x.status === 'pending').map(x => `<article class="card test-card"><div class="row between"><h3>${esc(x.projectName)}</h3><span class="tag">طلبك قيد المراجعة</span></div><p class="muted small">ينتظر قرار المطور. لا شيء مطلوب منك الآن.</p><button class="btn text small muted-btn" data-action="withdraw" data-id="${esc(x.id)}">سحب الطلب</button></article>`).join('');
}

export function home() {
  const work = groupTesterWork(mine());
  const name = esc(state.user.name.split(' ')[0]);
  const summary = work.due.length ? `لديك ${num(work.due.length)} ${work.due.length === 1 ? 'تطبيق ينتظر' : 'تطبيقات تنتظر'} تقريرك اليوم.`
    : work.setup.length ? 'أكمل خطوات الانضمام حتى يبدأ اختبارك.'
    : work.done.length ? 'أنهيت كل تقارير اليوم. أحسنت.'
    : 'لا يوجد ما تفعله الآن. اختر تطبيقاً تجرّبه.';
  const nothing = !mine().length && !state.data.applications.some(x => x.status === 'pending');
  return `<header class="page-head"><h1>أهلاً ${name}</h1><p class="muted">${summary}</p></header>
   ${shouldOfferReminder() && (work.due.length || work.done.length || work.waiting.length) ? `<section class="card"><p>لا تفوّت يوماً من اختبارك: نذكّرك على هذا الجهاز حتى والتطبيق مغلق، في الأيام التي ينتظر فيها تقريرك فقط.</p><button class="btn primary wide" data-action="enable-notifications">${icon('bell', 18)} تفعيل التذكير اليومي</button></section>` : ''}
   ${[...work.due, ...work.setup].map(card).join('')}
   ${pendingApplications()}
   ${[...work.waiting, ...work.done].map(card).join('')}
   ${nothing ? empty('ابدأ أول اختبار لك', 'اختر تطبيقاً يهمك وقدّم عليه. يصل بريدك إلى مطور هذا التطبيق فقط.', '<a class="btn primary" href="#/explore">تصفح التطبيقات</a>') : '<a class="btn ghost wide" href="#/explore">' + icon('search', 18) + ' تصفح تطبيقات أخرى</a>'}`;
}

export function tests() {
  const work = groupTesterWork(mine());
  const group = (title, items) => items.length ? `<h2 class="group">${title}</h2>${items.map(card).join('')}` : '';
  return `<header class="page-head"><h1>اختباراتي</h1></header>${group('مطلوب اليوم', work.due)}${group('خطوات الانضمام', work.setup)}${state.data.applications.some(x => x.status === 'pending') ? `<h2 class="group">طلبات قيد المراجعة</h2>${pendingApplications()}` : ''}${group('بانتظار', work.waiting)}${group('أنجزت اليوم', work.done)}${group('السابقة', work.past)}
  ${!mine().length && !state.data.applications.length ? empty('لا توجد اختبارات بعد', 'التطبيقات التي تُقبل فيها تظهر هنا.', '<a class="btn primary" href="#/explore">تصفح التطبيقات</a>') : ''}`;
}

export function explore(listings, failed) {
  if (failed) return `<header class="page-head"><h1>تطبيقات تطلب مختبرين</h1></header>${empty('تعذر تحميل التطبيقات', 'تحقق من الإنترنت وحاول مرة أخرى.', '<button class="btn primary" data-action="reload-listings">إعادة المحاولة</button>')}`;
  if (!listings) return '<header class="page-head"><h1>تطبيقات تطلب مختبرين</h1></header><div class="skeleton"></div><div class="skeleton"></div>';
  const taken = new Set([...state.data.assignments.map(a => a.projectId), ...state.data.applications.filter(x => x.status !== 'withdrawn').map(x => x.projectId)]);
  const open = listings.filter(p => !taken.has(p.id) && p.ownerUid !== state.user.uid);
  return `<header class="page-head"><h1>تطبيقات تطلب مختبرين</h1><p class="muted">اختر ما يهمك فعلاً. الاختبار 14 يوماً، ومهمة قصيرة كل يوم.</p></header>
  ${open.length ? open.map(p => `<article class="card listing"><div class="row between"><h3>${esc(p.name)}</h3><span class="tag">${num((p.tasks || []).length)} ${(p.tasks || []).length === 1 ? 'مهمة' : 'مهام'}</span></div><p class="muted small">من ${esc(p.ownerName || 'مطور')}</p><p>${esc(p.description || '')}</p><a class="btn primary" href="#/apply/${esc(p.id)}">عرض وتقديم</a></article>`).join('') : empty('لا توجد تطبيقات جديدة الآن', 'راجع هذه الصفحة لاحقاً؛ تُضاف التطبيقات مع انضمام المطورين.')}`;
}

export function apply(project, failed) {
  if (failed || project === null) return backLink('#/explore', 'التطبيقات') + empty('هذا التطبيق غير متاح', 'ربما أغلق المطور استقبال المختبرين.');
  if (!project) return '<div class="skeleton"></div>';
  const u = state.user;
  return `${backLink('#/explore', 'التطبيقات')}<header class="page-head"><h1>${esc(project.name)}</h1><p class="muted">من ${esc(project.ownerName || 'مطور')}</p></header>
  <section class="card"><p>${esc(project.description || '')}</p><h2>ما ستجرّبه</h2><ol class="task-list">${(project.tasks || []).map(t => `<li>${esc(t)}</li>`).join('')}</ol></section>
  <form id="apply-form" class="card" data-id="${esc(project.id)}"><h2>طلب المشاركة</h2>
   <label class="field"><span>بريد Google الموجود على هاتفك</span><input name="email" type="email" dir="ltr" required value="${esc(u.email)}"><small class="muted">يضيفه المطور إلى Google Play، ويجب أن يطابق الحساب على هاتفك.</small></label>
   <label class="field"><span>نوع هاتفك (اختياري)</span><input name="device" maxlength="80" placeholder="مثل: Samsung A54، أندرويد 14"></label>
   <label class="field"><span>رسالة قصيرة للمطور (اختياري)</span><textarea name="note" rows="2" maxlength="300"></textarea></label>
   <label class="check"><input type="checkbox" name="consent" required><span>أوافق على مشاركة اسمي وهذا البريد مع مطور هذا التطبيق، وسأجرّبه فعلاً لمدة 14 يوماً.</span></label>
   <button class="btn primary wide" type="submit">إرسال الطلب</button></form>
  <button class="link danger" data-action="flag" data-type="project" data-id="${esc(project.id)}" data-name="${esc(project.name)}">${icon('flag', 16)} الإبلاغ عن هذا التطبيق</button>`;
}

export function report(id) {
  const a = mine().find(x => x.id === id);
  if (!a) return empty('الاختبار غير موجود', 'ارجع إلى اختباراتك.', '<a class="btn primary" href="#/tests">اختباراتي</a>');
  const stage = testerStage(a);
  if (stage !== 'due') return backLink('#/tests', 'اختباراتي') + empty(stage === 'reported' ? 'سجّلت تقرير اليوم' : 'لا يوجد تقرير مطلوب الآن', 'نراك في موعد التقرير التالي.');
  const device = state.data.reports.find(r => r.assignmentId === id && r.device)?.device || '';
  return `${backLink('#/tests', 'اختباراتي')}<header class="page-head"><h1>تقرير اليوم</h1><p class="muted">${esc(a.name)} · اليوم ${Math.min(TEST_DAYS, daysSince(a.joinedDay))} من 14</p></header>
  <form id="report-form" class="card" data-id="${esc(id)}">
   <p class="task"><small>مهمة اليوم</small>${esc(taskForDay(a))}</p>
   <fieldset class="choice"><legend>ماذا حدث عندما جرّبتها؟</legend><div class="outcomes">
    <label><input type="radio" name="outcome" value="ok" checked><span>${icon('check', 18)} عمل كما يجب</span></label>
    <label><input type="radio" name="outcome" value="issue"><span>${icon('warn', 18)} وجدت مشكلة</span></label></div></fieldset>
   <div id="issue-fields" hidden>
    <label class="field"><span>ما المشكلة؟</span><textarea name="issue-notes" id="issue-notes" rows="3" maxlength="800" placeholder="مثل: تظهر شاشة بيضاء بعد الضغط على تسجيل الدخول"></textarea></label>
    <label class="field"><span>كيف نعيد حدوثها؟</span><textarea name="steps" rows="3" maxlength="800" placeholder="1. افتح التطبيق&#10;2. اضغط تسجيل الدخول"></textarea></label>
    <label class="field"><span>ماذا توقعت أن يحدث؟ (اختياري)</span><input name="expected" maxlength="400"></label>
    <fieldset class="choice"><legend>مدى الخطورة</legend><div class="outcomes three">
      ${[['low', 'بسيطة'], ['medium', 'متوسطة'], ['high', 'تمنع الاستخدام']].map(([v, l]) => `<label><input type="radio" name="severity" value="${v}"><span>${l}</span></label>`).join('')}</div></fieldset>
    <label class="field"><span>نوع الهاتف (اختياري)</span><input name="device" maxlength="80" value="${esc(device)}"></label>
   </div>
   <div id="ok-fields"><label class="field"><span>ملاحظة للمطور (اختياري)</span><textarea name="ok-notes" rows="2" maxlength="800" placeholder="أي شيء أعجبك أو يمكن تحسينه"></textarea></label></div>
   <label class="check"><input type="checkbox" name="honest" required><span>جرّبت التطبيق فعلاً اليوم على هاتفي.</span></label>
   <button class="btn primary wide" type="submit">إرسال التقرير</button>
  </form>`;
}

export function record() {
  const reports = state.data.reports, r = testerRecord(mine(), reports);
  const issues = reports.filter(x => x.outcome === 'issue');
  const stat = (n, label) => `<div class="stat"><strong>${num(n)}</strong><span>${label}</span></div>`;
  return `<header class="page-head"><h1>سجلي</h1><p class="muted">كل ما أنجزته كمختبر، كما سجّلته بنفسك.</p></header>
  <section class="stats">${stat(r.tests, 'اختبار بدأته')}${stat(r.finished, 'اختبار أكملته')}${stat(r.reports, 'تقرير يومي')}${stat(r.bugs, 'مشكلة وجدتها')}${stat(r.fixed, 'مشكلة أُصلحت')}</section>
  <section class="card"><h2>المشكلات التي أبلغت عنها</h2>${issues.length ? issues.map(x => `<div class="issue"><div class="row between"><span class="tag ${['fixed', 'verified'].includes(x.status) ? 'good' : 'warn'}">${esc(statusLabel(x.status))}</span><small class="muted">${esc(x.date)}</small></div><p>${esc(x.notes)}</p>${x.severity ? `<small class="muted">الخطورة: ${esc(severityLabel(x.severity))}</small>` : ''}</div>`).join('') : '<p class="muted">لم تبلغ عن مشكلات بعد. لا تختلق مشكلة إن كان التطبيق يعمل؛ التقرير الصادق هو المفيد.</p>'}</section>`;
}

export const dueCount = () => groupTesterWork(mine()).due.length;
export const today = () => dayKey();
