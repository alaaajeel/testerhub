import {state} from '../store.js';
import {projectStats, participantHealth, statusLabel, severityLabel, projectStatusLabel, summaryText, daysSince, PLAY_MIN_TESTERS, DEFAULT_WANTED, TEST_DAYS} from '../domain.js';
import {esc, icon, strip, meter, empty, num} from '../ui.js';
import {backLink, threadOf} from './common.js';

const stats = p => projectStats(p, state.data);
const projects = () => [...state.data.projects].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
const statusTone = s => ({recruiting: 'good', draft: '', paused: 'warn', completed: '', archived: 'warn'}[s || 'recruiting']);

function projectCard(p) {
  const s = stats(p), draft = p.status === 'draft';
  return `<a class="card project-card" href="#/app/${esc(p.id)}"><div class="row between"><h3>${esc(p.name)}</h3><span class="tag ${statusTone(p.status)}">${esc(projectStatusLabel(p.status))}</span></div>
   ${draft ? '<p class="muted small">لم يُنشر بعد. أكمله لتستقبل المختبرين.</p>' : `<div class="row between small"><span>${num(s.engaged)} بدأوا الاختبار من ${num(s.wanted)} مطلوباً</span><span class="muted">${num(s.reports)} تقرير</span></div>${meter(s.engaged, s.wanted)}
   <div class="row wrap chips">${s.pendingApplications ? `<span class="tag warn">${num(s.pendingApplications)} طلب جديد</span>` : ''}${s.awaitingPlay ? `<span class="tag warn">${num(s.awaitingPlay)} بانتظار إضافتهم</span>` : ''}${s.openIssues ? `<span class="tag bad">${num(s.openIssues)} مشكلة مفتوحة</span>` : ''}${s.atRisk ? `<span class="tag warn">${num(s.atRisk)} متوقفون عن التقارير</span>` : ''}</div>`}</a>`;
}

export function home() {
  const list = projects();
  if (!list.length) return `<header class="page-head"><h1>أهلاً ${esc(state.user.name.split(' ')[0])}</h1></header>${empty('أضف تطبيقك الأول', 'جهّز رابط الاختبار المغلق من Play Console ومهام قصيرة للمختبرين. يأخذ الأمر دقيقتين.', '<a class="btn primary" href="#/new">إضافة تطبيق</a>')}`;
  const totals = list.map(stats).reduce((t, s) => ({applications: t.applications + s.pendingApplications, play: t.play + s.awaitingPlay, issues: t.issues + s.openIssues, risk: t.risk + s.atRisk}), {applications: 0, play: 0, issues: 0, risk: 0});
  const todo = [];
  for (const p of list) {
    const s = stats(p), link = `#/app/${esc(p.id)}`;
    if (s.pendingApplications) todo.push(`<a class="todo" href="${link}">${icon('user', 18)}<span>${num(s.pendingApplications)} طلب جديد على <b>${esc(p.name)}</b></span></a>`);
    if (s.awaitingPlay) todo.push(`<a class="todo" href="${link}">${icon('copy', 18)}<span>أضف ${num(s.awaitingPlay)} مختبر في Play Console لتطبيق <b>${esc(p.name)}</b></span></a>`);
    if (s.openIssues) todo.push(`<a class="todo" href="${link}">${icon('warn', 18)}<span>${num(s.openIssues)} مشكلة تنتظر مراجعتك في <b>${esc(p.name)}</b></span></a>`);
    if (s.atRisk) todo.push(`<a class="todo" href="${link}">${icon('message', 18)}<span>${num(s.atRisk)} مختبر توقف عن التقارير في <b>${esc(p.name)}</b></span></a>`);
  }
  return `<header class="page-head row between"><div><h1>تطبيقاتي</h1><p class="muted">${todo.length ? 'هذا ما يحتاجك الآن.' : 'لا شيء يحتاجك الآن.'}</p></div><a class="btn primary" href="#/new">${icon('add', 18)} تطبيق</a></header>
  ${todo.length ? `<section class="card todos">${todo.join('')}</section>` : ''}${list.map(projectCard).join('')}`;
}

export function projectForm(id) {
  const p = id ? state.data.projects.find(x => x.id === id) : null;
  if (id && !p) return empty('التطبيق غير موجود', 'ربما ما زال يُحمّل.');
  const draft = !p || p.status === 'draft';
  return `${backLink(p ? `#/app/${esc(p.id)}` : '#/home', 'رجوع')}<header class="page-head"><h1>${p ? 'تعديل التطبيق' : 'إضافة تطبيق'}</h1></header>
  <form id="project-form" class="card" data-id="${esc(id || '')}">
   <label class="field"><span>اسم التطبيق</span><input name="name" minlength="2" maxlength="70" required value="${esc(p?.name || '')}"></label>
   <label class="field"><span>رابط الاختبار المغلق</span><input name="link" type="url" dir="ltr" value="${esc(p?.link || '')}" placeholder="https://play.google.com/apps/testing/com.example.app"><small class="muted">تجده في Play Console ضمن الاختبار المغلق، باسم «انضمام عبر الويب».</small></label>
   <label class="field"><span>ما هذا التطبيق؟</span><textarea name="description" rows="3" maxlength="600" placeholder="جملتان توضحان فكرته ولمن هو">${esc(p?.description || '')}</textarea></label>
   <label class="field"><span>مهام الاختبار، كل مهمة في سطر</span><textarea name="tasks" rows="5" placeholder="سجّل الدخول بحسابك&#10;ابحث عن منتج وافتح تفاصيله&#10;أكمل عملية شراء تجريبية">${esc((p?.tasks || []).join('\n'))}</textarea><small class="muted">تظهر مهمة مختلفة كل يوم، وتتكرر إن كانت أقل من 14. التعديل لا يغيّر مهام من قُبلوا سابقاً.</small></label>
   <label class="field"><span>كم مختبراً تريد؟</span><input name="testersWanted" type="number" min="1" max="100" value="${esc(p?.testersWanted || DEFAULT_WANTED)}"><small class="muted">Google تشترط للحسابات الشخصية الجديدة ${num(PLAY_MIN_TESTERS)} مختبراً لمدة 14 يوماً متواصلة. اطلب أكثر قليلاً لأن بعضهم قد ينسحب.</small></label>
   <div class="row wrap">${draft ? '<button class="btn primary" type="submit" name="intent" value="publish">نشر واستقبال المختبرين</button><button class="btn ghost" type="submit" name="intent" value="draft">حفظ كمسودة</button>' : '<button class="btn primary" type="submit" name="intent" value="save">حفظ التعديلات</button>'}</div>
  </form>`;
}

function applicationsSection(p) {
  const list = state.data.applications.filter(x => x.projectId === p.id && x.status === 'pending');
  if (!list.length) return '';
  return `<section class="card"><h2>طلبات جديدة · ${num(list.length)}</h2>${list.map(x => `<div class="person"><div><strong>${esc(x.testerName)}</strong>${x.device ? `<small class="muted">${esc(x.device)}</small>` : ''}${x.note ? `<p class="small">${esc(x.note)}</p>` : ''}</div><div class="row"><button class="btn primary small" data-action="decide" data-value="approve" data-id="${esc(x.id)}">قبول</button><button class="btn ghost small" data-action="decide" data-value="reject" data-id="${esc(x.id)}">رفض</button></div></div>`).join('')}</section>`;
}

function playSection(p) {
  const list = state.data.assignments.filter(a => a.projectId === p.id && a.source === 'application' && !a.addedToPlayAt && !a.leftAt);
  if (!list.length) return '';
  return `<section class="card highlight"><h2>أضفهم في Play Console · ${num(list.length)}</h2><p class="small">لن يتمكن المختبر من الانضمام قبل إضافة بريده إلى قائمة الاختبار المغلق.</p><pre class="emails" dir="ltr">${list.map(a => esc(a.testerEmail)).join(', ')}</pre><div class="row wrap"><button class="btn ghost" data-action="copy-play" data-id="${esc(p.id)}">${icon('copy', 18)} نسخ الإيميلات</button><button class="btn primary" data-action="mark-play" data-id="${esc(p.id)}">${icon('check', 18)} أضفتهم في Play Console</button></div></section>`;
}

const HEALTH = {active: ['good', 'نشط'], 'at-risk': ['warn', 'توقف عن التقارير'], finished: ['good', 'أكمل المدة'], left: ['bad', 'انسحب'], pending: ['', 'لم يبدأ بعد']};

function participants(p) {
  const list = state.data.assignments.filter(a => a.projectId === p.id).sort((a, b) => (b.checkins?.length || 0) - (a.checkins?.length || 0));
  return `<section class="card"><h2>المشاركون · ${num(list.length)}</h2>${list.length ? list.map((a, i) => {
    const health = participantHealth(a), [tone, label] = HEALTH[health], count = threadOf(a.id).length;
    return `<div class="person column"><div class="row between"><div><strong>${esc(a.testerName || 'مختبر ' + (i + 1))}</strong>${a.testerEmail ? `<small class="muted" dir="ltr">${esc(a.testerEmail)}</small>` : ''}</div><span class="tag ${tone}">${label}</span></div>${a.joinedDay ? strip(a) : ''}<div class="row between small"><span class="muted">${a.joinedDay ? `اليوم ${Math.min(TEST_DAYS, daysSince(a.joinedDay))} · ${num(a.checkins?.length || 0)} تقرير` : a.invitationStatus === 'declined' ? 'رفض الدعوة' : a.addedToPlayAt ? 'لم يؤكد الانضمام بعد' : 'بانتظار الإضافة'}</span><a class="btn text small" href="#/chat/${esc(a.id)}">${icon('message', 16)} مراسلة${count ? ` (${num(count)})` : ''}</a></div></div>`;
  }).join('') : '<p class="muted">لم يُقبل أحد بعد. عند وصول الطلبات ستظهر في الأعلى.</p>'}</section>`;
}

const testerOf = r => state.data.assignments.find(a => a.id === r.assignmentId)?.testerName || 'مختبر';
const SEV = {high: 'bad', medium: 'warn', low: ''};

function issuesSection(p) {
  const issues = state.data.reports.filter(r => r.projectId === p.id && r.outcome === 'issue');
  const order = {new: 0, reopened: 0, fixed: 1, wontfix: 2, verified: 3};
  issues.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  return `<section class="card"><h2>المشكلات · ${num(issues.length)}</h2>${issues.length ? issues.map(r => `<div class="issue"><div class="row between"><span class="tag ${['fixed', 'verified'].includes(r.status) ? 'good' : 'warn'}">${esc(statusLabel(r.status))}</span>${r.severity ? `<span class="tag ${SEV[r.severity]}">${esc(severityLabel(r.severity))}</span>` : ''}</div><p>${esc(r.notes)}</p>${r.steps ? `<div class="small"><b>الخطوات:</b><div class="pre">${esc(r.steps)}</div></div>` : ''}${r.expected ? `<div class="small"><b>المتوقع:</b> ${esc(r.expected)}</div>` : ''}<small class="muted">${esc(testerOf(r))} · ${esc(r.date)}${r.device ? ' · ' + esc(r.device) : ''}</small>
    ${['new', 'reopened'].includes(r.status) ? `<div class="row wrap"><button class="btn primary small" data-action="issue-status" data-id="${esc(r.id)}" data-value="fixed">أصلحتها</button><button class="btn ghost small" data-action="issue-status" data-id="${esc(r.id)}" data-value="wontfix">لن أصلحها</button><a class="btn text small" href="#/chat/${esc(r.assignmentId)}">${icon('message', 16)} استفسار</a></div>` : ''}</div>`).join('') : '<p class="muted">لم يبلغ أحد عن مشكلة حتى الآن.</p>'}</section>`;
}

function reportsSection(p) {
  const list = state.data.reports.filter(r => r.projectId === p.id && r.outcome !== 'issue').slice(0, 10);
  if (!list.length) return '';
  return `<section class="card"><h2>آخر التقارير</h2>${list.map(r => `<div class="report-line"><div class="row between small"><b>${esc(testerOf(r))}</b><span class="muted">${esc(r.date)}</span></div><p class="small">${esc(r.tested || '')}</p>${r.notes ? `<p class="small muted">${esc(r.notes)}</p>` : ''}</div>`).join('')}</section>`;
}

function statusControls(p) {
  const buttons = {
    recruiting: [['paused', 'إيقاف استقبال المختبرين'], ['completed', 'إنهاء الاختبار']],
    paused: [['recruiting', 'إعادة فتح الاستقبال'], ['completed', 'إنهاء الاختبار']],
    completed: [['recruiting', 'إعادة فتح الاختبار']],
  }[p.status || 'recruiting'] || [];
  return buttons.map(([value, label]) => `<button class="btn ghost small" data-action="project-status" data-id="${esc(p.id)}" data-value="${value}">${label}</button>`).join('');
}

export function project(id) {
  const p = state.data.projects.find(x => x.id === id);
  if (!p) return backLink('#/home', 'تطبيقاتي') + empty('التطبيق غير موجود', 'ربما ما زال يُحمّل.');
  const s = stats(p);
  if (p.status === 'draft') return `${backLink('#/home', 'تطبيقاتي')}<header class="page-head"><h1>${esc(p.name)}</h1><span class="tag">مسودة</span></header><section class="card"><p>هذه المسودة لا يراها أحد. أكملها وانشرها لتصل إلى المختبرين.</p><div class="row wrap"><a class="btn primary" href="#/edit/${esc(p.id)}">إكمال ونشر</a><button class="btn danger-ghost" data-action="discard" data-id="${esc(p.id)}">حذف المسودة</button></div></section>`;
  const archived = p.status === 'archived';
  return `${backLink('#/home', 'تطبيقاتي')}<header class="page-head"><div class="row between"><h1>${esc(p.name)}</h1><span class="tag ${statusTone(p.status)}">${esc(projectStatusLabel(p.status))}</span></div></header>
  <section class="card"><div class="row between small"><b>${num(s.engaged)} بدأوا من ${num(s.wanted)} مطلوباً</b><span class="muted">أطول مشاركة: ${num(s.longestDays)} يوماً</span></div>${meter(s.engaged, s.wanted)}
   <p class="small muted">${s.engaged >= PLAY_MIN_TESTERS ? `لديك ${num(s.engaged)} مشاركاً. تأكد بنفسك في Play Console أن ${num(PLAY_MIN_TESTERS)} منهم على الأقل منضمون منذ 14 يوماً متواصلة.` : `تحتاج ${num(PLAY_MIN_TESTERS - s.engaged)} مشاركين إضافيين للوصول إلى ${num(PLAY_MIN_TESTERS)}. المرجع الرسمي للعدد هو Play Console وليس هذه الصفحة.`}</p>
   <div class="row wrap">${archived ? '' : `<a class="btn ghost small" href="#/edit/${esc(p.id)}">تعديل</a>${statusControls(p)}`}<a class="btn ghost small" href="#/summary/${esc(p.id)}">${icon('record', 16)} ملخص الاختبار</a><button class="btn ghost small" data-action="open-project" data-id="${esc(p.id)}">${icon('link', 16)} رابط الاختبار</button></div></section>
  ${archived ? '<p class="notice">أرشفت الإدارة هذا التطبيق. بياناته محفوظة، ولا تُستقبل عليه تقارير جديدة.</p>' : ''}
  ${applicationsSection(p)}${playSection(p)}${issuesSection(p)}${participants(p)}${reportsSection(p)}`;
}

export function summary(id) {
  const p = state.data.projects.find(x => x.id === id);
  if (!p) return empty('التطبيق غير موجود', '');
  const s = stats(p), text = summaryText(p, s, state.data.reports);
  const stat = (n, label) => `<div class="stat"><strong>${num(n)}</strong><span>${label}</span></div>`;
  return `<div class="no-print">${backLink(`#/app/${esc(p.id)}`, esc(p.name))}</div><header class="page-head"><h1>ملخص اختبار ${esc(p.name)}</h1><p class="muted">بيانات مسجلة من التقارير الفعلية، تفيدك عند مراجعة ما جرى والإجابة عن أسئلة طلب الوصول إلى الإنتاج في Play Console.</p></header>
  <section class="stats">${stat(s.participants, 'مشارك')}${stat(s.engaged, 'بدأوا فعلياً')}${stat(s.left, 'انسحبوا')}${stat(s.reports, 'تقرير يومي')}${stat(s.issues, 'مشكلة')}${stat(s.fixedIssues, 'أُصلحت')}</section>
  <section class="card"><h2>نص قابل للنسخ</h2><pre class="summary-text" id="summary-text">${esc(text)}</pre><div class="row wrap no-print"><button class="btn primary" data-action="copy-summary">${icon('copy', 18)} نسخ النص</button><button class="btn ghost" data-action="print">طباعة</button></div></section>
  <p class="notice">راجع النص وعدّله قبل استخدامه، واكتب ما حدث فعلاً. هذا الملخص لا يثبت شيئاً أمام Google ولا يضمن الموافقة.</p>`;
}

export const emailsFor = id => state.data.assignments.filter(a => a.projectId === id && a.source === 'application' && !a.addedToPlayAt && !a.leftAt);
