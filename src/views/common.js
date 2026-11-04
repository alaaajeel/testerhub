// Screens shared by both modes: conversation, account.
import {state} from '../store.js';
import {millis} from '../domain.js';
import {esc, icon, empty, when} from '../ui.js';
import {getReminderHour, reminderStatus} from '../reminders.js';

export const messageTime = m => { const t = millis(m.createdAt); return Number.isFinite(t) ? t : Date.parse(m.at || ''); };

export const threadOf = id => state.data.messages.filter(m => m.assignmentId === id).sort((a, b) => messageTime(a) - messageTime(b));

export const backLink = (href, label) => `<a class="back" href="${href}">${icon('back', 18)} ${esc(label)}</a>`;

export function chat(id) {
  const a = state.data.assignments.find(x => x.id === id);
  if (!a) return empty('المحادثة غير متاحة', 'قد تكون البيانات قيد التحميل.');
  const mine = state.user.role;
  const other = mine === 'developer' ? (a.testerName || 'المختبر') : 'المطور';
  const messages = threadOf(id);
  const back = mine === 'developer' ? `#/app/${esc(a.projectId)}` : '#/tests';
  return `${backLink(back, 'رجوع')}<header class="page-head"><h1>${esc(other)}</h1><p class="muted">${esc(a.name)}</p></header>
  <section class="thread" id="thread" aria-label="الرسائل" aria-live="polite">${messages.length ? messages.map(m => `<div class="bubble ${m.sender === mine ? 'mine' : ''}"><div>${esc(m.text)}</div><time>${esc(when(messageTime(m)))}</time></div>`).join('') : empty('لا توجد رسائل بعد', 'اكتب أول رسالة لتبدأ المحادثة.')}</section>
  <form id="chat-form" class="composer" data-id="${esc(id)}"><label class="sr" for="message-body">رسالتك</label><textarea id="message-body" name="message" rows="2" maxlength="600" required placeholder="اكتب رسالتك"></textarea><button class="btn primary" type="submit">إرسال</button></form>
  ${mine === 'tester' ? `<button class="link danger" data-action="flag" data-type="user" data-id="${esc(a.ownerUid)}" data-name="${esc(a.name)}">${icon('flag', 16)} الإبلاغ عن إساءة</button>` : `<button class="link danger" data-action="flag" data-type="user" data-id="${esc(a.testerUid)}" data-name="${esc(a.testerName || '')}">${icon('flag', 16)} الإبلاغ عن إساءة</button>`}`;
}

const REMINDER_COPY = {
  on: ['يصلك تذكير على هذا الجهاز في الوقت الذي تختاره، حتى والتطبيق مغلق، في الأيام التي ينتظر فيها اختبارك تقريراً فقط.', 'disable-push', 'إيقاف التذكير', 'ghost'],
  off: ['فعّل التذكير ليصلك على هذا الجهاز حتى والتطبيق مغلق، في الأيام التي ينتظر فيها اختبارك تقريراً فقط.', 'enable-notifications', 'تفعيل التذكير اليومي', 'primary'],
  blocked: ['منعت التنبيهات لهذا الموقع. اسمح بها من إعدادات المتصفح ثم ارجع إلى هنا. وحتى ذلك الحين أضف موعداً إلى تقويم هاتفك.', '', '', ''],
  unavailable: ['هذا المتصفح لا يستقبل التذكير والتطبيق مغلق، فأضف موعداً يومياً إلى تقويم هاتفك. على iPhone ثبّت TesterHub على الشاشة الرئيسية أولاً.', 'enable-notifications', 'تنبيهات أثناء فتح التطبيق', 'ghost'],
};

export function profile({admin, installAvailable, deletionRequested}) {
  const u = state.user, tester = u.role === 'tester';
  const hour = getReminderHour();
  const [copy, action, label, tone] = REMINDER_COPY[reminderStatus()];
  return `<header class="page-head"><h1>حسابي</h1><p class="muted"><bdi dir="ltr">${esc(u.email)}</bdi></p></header>
  ${admin ? `<a class="card row-link" href="./admin.html">${icon('shield')}<span>لوحة الإدارة</span></a>` : ''}
  <form id="profile-form" class="card"><label class="field"><span>الاسم</span><input name="name" minlength="2" maxlength="80" required value="${esc(u.name)}"></label><button class="btn primary" type="submit">حفظ</button></form>
  <section class="card"><h2>طريقة الاستخدام</h2><p class="muted">تستخدم TesterHub الآن ${tester ? 'لاختبار التطبيقات' : 'لاختبار تطبيقك'}. اختباراتك وتطبيقاتك محفوظة عند التبديل.</p><button class="btn ghost" data-action="switch-role">${icon('swap', 18)} ${tester ? 'التبديل إلى مطور' : 'التبديل إلى مختبر'}</button></section>
  <section class="card"><h2>الدخول عبر Google</h2>${u.hasGoogle ? '<p class="muted">حسابك مرتبط بـ Google، ويمكنك الدخول بزر Google مباشرة.</p>' : `<p class="muted">اربط حساب Google لتدخل بزر واحد بدل كلمة المرور. تبقى بياناتك واختباراتك كما هي.</p><button class="btn ghost" data-action="link-google">ربط حساب Google</button>`}</section>
  ${tester ? `<section class="card"><h2>التذكير اليومي</h2><p class="muted">${copy}</p>
    <label class="field"><span>وقت التذكير</span><select id="reminder-hour">${Array.from({length: 24}, (_, i) => `<option value="${i}" ${i === hour ? 'selected' : ''}>${(i % 12) || 12}:00 ${i < 12 ? 'صباحاً' : 'مساءً'}</option>`).join('')}</select></label>
    <div class="row wrap">${action ? `<button class="btn ${tone}" data-action="${action}">${icon('bell', 18)} ${label}</button>` : ''}<button class="btn ghost" data-action="calendar">${icon('calendar', 18)} إضافة إلى التقويم</button></div></section>` : ''}
  <section class="card"><h2>التطبيق</h2>
   ${installAvailable ? `<button class="row-link plain" data-action="install">${icon('download')}<span>تثبيت TesterHub على الهاتف</span></button>` : ''}
   <a class="row-link plain" href="./privacy.html">${icon('shield')}<span>سياسة الخصوصية</span></a>
   <a class="row-link plain" href="./terms.html">${icon('record')}<span>الشروط</span></a>
   <button class="row-link plain" data-action="logout">${icon('power')}<span>تسجيل الخروج</span></button></section>
  <section class="card"><h2>حذف الحساب</h2><p class="muted">نراجع الطلب خلال 14 يوماً. تقاريرك في اختبارات شاركت بها قد تبقى بلا اسمك حتى لا يفقد المطور سجله، كما توضح سياسة الخصوصية.</p>
   ${deletionRequested ? '<span class="tag">طلبك قيد المراجعة</span>' : '<button class="btn danger-ghost" data-action="request-deletion">طلب حذف حسابي</button>'}</section>`;
}
