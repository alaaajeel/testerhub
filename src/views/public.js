// Screens seen before the app opens: landing, sign in, verification, suspension.
import {esc, icon} from '../ui.js';

export const authDraft = {mode: 'login', role: 'tester', name: '', email: '', linking: false};

const GOOGLE_MARK = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.700 1.200 9.200 3.600l6.900-6.900C35.900 2.400 30.400 0 24 0 14.600 0 6.500 5.400 2.600 13.200l8 6.200C12.500 13.700 17.800 9.500 24 9.500z"/><path fill="#4285F4" d="M46.900 24.500c0-1.600-.1-3.100-.4-4.500H24v9h12.900c-.6 3-2.200 5.500-4.700 7.200l7.700 6c4.500-4.200 7-10.300 7-17.700z"/><path fill="#FBBC05" d="M10.600 28.600a14.500 14.500 0 0 1 0-9.200l-8-6.200a24 24 0 0 0 0 21.600l8-6.200z"/><path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.400-4.900 2.300-8.200 2.300-6.200 0-11.500-4.200-13.400-9.900l-8 6.200C6.500 42.600 14.600 48 24 48z"/></svg>';

export function landing() {
  return `<div class="public">
  <header class="public-bar"><a class="brand" href="#/"><img src="./assets/brand-icon.svg" alt="" width="34" height="34"><span dir="ltr">TesterHub</span></a><a class="btn ghost small" href="#/login">تسجيل الدخول</a></header>
  <section class="intro">
    <div class="intro-copy">
      <h1>اختبار حقيقي لتطبيقك، من أشخاص حقيقيين، يوماً بعد يوم.</h1>
      <p>منصة عربية تجمع مطوري Android والمختبرين حول الاختبار المغلق: المختبر يختار التطبيق الذي يهمه ويجرّبه 14 يوماً، والمطور يرى ما حدث فعلاً ويصلح ما انكسر.</p>
      <div class="row wrap"><a class="btn primary large" href="#/signup/tester">أريد اختبار التطبيقات</a><a class="btn ghost large" href="#/signup/developer">عندي تطبيق أختبره</a></div>
    </div>
    <div class="intro-card" aria-hidden="true">
      <div class="row between"><strong>تطبيق التوصيل</strong><span class="tag good">اليوم 9 من 14</span></div>
      <div class="strip"><i class="done"></i><i class="done"></i><i class="done"></i><i class="missed"></i><i class="done"></i><i class="done"></i><i class="done"></i><i class="done"></i><i class="today"></i><i></i><i></i><i></i><i></i><i></i></div>
      <p class="muted small">كل مربع يوم من الاختبار. الأخضر يوم سُجّل فيه تقرير فعلي.</p>
    </div>
  </section>
  <section class="how">
    <div><h2>إذا كنت مختبراً</h2><ol><li>تصفح التطبيقات التي تطلب مختبرين، وقدّم على ما يهمك.</li><li>بعد موافقة المطور انضم من Google Play ونزّل التطبيق.</li><li>جرّب مهمة قصيرة كل يوم وسجّل ما حدث، وأبلغ عن أي مشكلة تجدها.</li></ol></div>
    <div><h2>إذا كنت مطوراً</h2><ol><li>أضف تطبيقك ورابط الاختبار المغلق ومهام واضحة.</li><li>راجع الطلبات، وأضف بريد من تقبله في Play Console.</li><li>تابع المشاركين يومياً، وأصلح البلاغات، واحصل على ملخص بما جرى.</li></ol></div>
  </section>
  <section class="promises">
    <h2>ما نعد به، وما لا نعد به</h2>
    <ul>
      <li>${icon('shield')}<span>بريدك يصل فقط إلى مطور التطبيق الذي قدّمت عليه بنفسك. لا توجد قائمة إيميلات عامة.</span></li>
      <li>${icon('check')}<span>الأرقام هنا تأتي من تقارير المختبرين كما سجّلوها، ولا نحوّلها إلى ما ليس فيها.</span></li>
      <li>${icon('warn')}<span>TesterHub ليست تابعة لـ Google، ولا تضمن قبول أي تطبيق في المتجر. هدفها تحسين تطبيقك باختبار حقيقي.</span></li>
    </ul>
  </section>
  <footer class="public-foot"><a href="./privacy.html">الخصوصية</a><a href="./terms.html">الشروط</a></footer>
 </div>`;
}

export function authScreen() {
  const d = authDraft, signup = d.mode === 'signup';
  return `<div class="auth-page"><a class="brand" href="#/"><img src="./assets/brand-icon.svg" alt="" width="38" height="38"><span dir="ltr">TesterHub</span></a>
  <main class="card auth-card">
   <h1>${signup ? 'إنشاء حساب' : 'تسجيل الدخول'}</h1>
   ${d.linking ? '<p class="notice" role="status">هذا البريد له حساب بكلمة مرور. أدخلها مرة واحدة لنربطه بحساب Google، وبعدها تدخل بزر Google مباشرة.</p>' : ''}
   <button class="btn google wide" type="button" data-action="google">${GOOGLE_MARK}<span>المتابعة بحساب Google</span></button>
   <div class="or"><span>أو بالبريد الإلكتروني</span></div>
   <form id="auth-form" novalidate>
    ${signup ? `<fieldset class="choice"><legend>كيف ستستخدم TesterHub؟</legend><div class="segmented">
      <button type="button" data-signup-role="tester" class="${d.role === 'tester' ? 'on' : ''}" aria-pressed="${d.role === 'tester'}">أختبر التطبيقات</button>
      <button type="button" data-signup-role="developer" class="${d.role === 'developer' ? 'on' : ''}" aria-pressed="${d.role === 'developer'}">عندي تطبيق</button></div>
      <small class="muted">يمكنك التبديل بينهما لاحقاً من حسابك.</small></fieldset>
     <label class="field"><span>الاسم</span><input id="auth-name" name="name" autocomplete="name" minlength="2" maxlength="80" required value="${esc(d.name)}"></label>` : ''}
    <label class="field"><span>البريد الإلكتروني</span><input id="auth-email" name="email" type="email" dir="ltr" autocomplete="email" inputmode="email" required value="${esc(d.email)}"></label>
    <label class="field"><span>كلمة المرور</span><input id="auth-password" name="password" type="password" dir="ltr" minlength="${signup ? 8 : 6}" autocomplete="${signup ? 'new-password' : 'current-password'}" required>${signup ? '<small class="muted">8 أحرف على الأقل.</small>' : ''}</label>
    ${signup ? `<label class="check"><input type="checkbox" name="terms" required><span>قرأت <a href="./terms.html" target="_blank" rel="noopener">الشروط</a> و<a href="./privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a> وأوافق عليهما.</span></label>` : ''}
    <button class="btn primary wide" type="submit">${signup ? 'إنشاء الحساب' : 'دخول'}</button>
   </form>
   ${signup ? '' : '<button class="link" type="button" data-action="reset-password">نسيت كلمة المرور؟</button>'}
   <p class="switch-mode">${signup ? 'لديك حساب؟ <a href="#/login">سجّل الدخول</a>' : 'ليس لديك حساب؟ <a href="#/signup">أنشئ حساباً</a>'}</p>
  </main></div>`;
}

export function verifyScreen(user) {
  return `<div class="auth-page"><main class="card auth-card"><h1>تأكيد البريد الإلكتروني</h1>
   <p>أرسلنا رابط التأكيد إلى <bdi dir="ltr" class="strong">${esc(user.email)}</bdi>. افتحه ثم ارجع إلى هنا. إذا لم تجده فابحث في الرسائل غير المرغوب فيها.</p>
   <button class="btn primary wide" data-action="check-verification">أكدت بريدي</button>
   <button class="btn ghost wide" data-action="send-verification">إعادة إرسال الرابط</button>
   <button class="link" data-action="logout">تسجيل الخروج</button></main></div>`;
}

export function profileRecovery(user) {
  const role = authDraft.role;
  return `<div class="auth-page"><main class="card auth-card"><h1>أكمل بيانات حسابك</h1><p class="muted">حساب الدخول موجود بالبريد <bdi dir="ltr">${esc(user.email)}</bdi>، وتبقى خطوة واحدة.</p>${user.hasGoogle ? '<p class="muted small">إذا كان لك حساب TesterHub ببريد آخر فسجّل الخروج وادخل به، ثم اربط Google من صفحة حسابي.</p>' : ''}
   <form id="complete-profile-form"><label class="field"><span>الاسم</span><input name="name" minlength="2" maxlength="80" required value="${esc(user.displayName || authDraft.name)}"></label>
   <label class="field"><span>كيف ستستخدم TesterHub؟</span><select name="role"><option value="tester">أختبر التطبيقات</option><option value="developer" ${role === 'developer' ? 'selected' : ''}>عندي تطبيق</option></select></label>
   <label class="check"><input type="checkbox" name="terms" required><span>أوافق على <a href="./terms.html" target="_blank" rel="noopener">الشروط</a> و<a href="./privacy.html" target="_blank" rel="noopener">سياسة الخصوصية</a>.</span></label>
   <button class="btn primary wide" type="submit">متابعة</button></form><button class="link" data-action="logout">تسجيل الخروج</button></main></div>`;
}

export function suspendedScreen(user) {
  return `<div class="auth-page"><main class="card auth-card"><h1>هذا الحساب موقوف</h1><p>أوقفت إدارة TesterHub حساب <bdi dir="ltr">${esc(user.email)}</bdi>، ولا يمكن استخدامه حالياً. بياناتك محفوظة ولم تُحذف.</p><p class="muted">إذا كنت ترى أن هذا خطأ فراسل الإدارة من البريد نفسه.</p><button class="btn ghost wide" data-action="logout">تسجيل الخروج</button></main></div>`;
}

export function failureScreen(message) {
  return `<div class="auth-page"><main class="card auth-card"><h1>تعذر فتح TesterHub</h1><p>${esc(message)}</p><button class="btn primary wide" data-action="retry">إعادة المحاولة</button><button class="link" data-action="logout">تسجيل الخروج</button></main></div>`;
}
