"use strict";
/* Android-specific, read-only session projection; the V2 preview remains isolated. */
(() => {
  const escapeHTML = s => String(s ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
  const originalAccount = renderAccount;
  const originalTests = renderTests;
  function cards(items, header) {
    if (!Array.isArray(items) || items.length === 0) return "";
    return '<div class="profile-section-label">' + escapeHTML(header) + '</div><div class="panel">' +
      items.map(a => '<div class="profile-row"><div><strong>' +
        escapeHTML(a.name || "تطبيق") + '</strong><div class="small muted">' +
        escapeHTML(a.status || "") + '</div></div><span class="badge">من Firebase</span></div>').join("") +
      '</div>';
  }
  renderAccount = function () {
    const original = originalAccount();
    const native = window.__testerhubNative;
    if (!native || !native.user) return original;
    const u = native.user;
    const role = u.legacyRole === "developer" ? "مطور" : u.legacyRole === "tester" ? "مختبر" : "غير محدد";
    const section = '<div class="profile-section-label">بيانات حسابك الحقيقي</div>' +
      '<div class="panel"><div class="profile-row"><span>البريد الإلكتروني</span><strong class="small">' +
      escapeHTML(u.email) + '</strong></div><div class="profile-row"><span>الدور المسجل حالياً</span>' +
      '<strong>' + role + '</strong></div><div class="profile-row"><span>تجربة V2</span>' +
      '<strong>واجهة مختبر + مطور</strong></div></div>' +
      '<div class="pane-note" style="margin-bottom:12px">تم تسجيل الدخول بنفس UID في Firebase. ' +
      'البيانات أدناه للقراءة فقط، وصلاحيات النشر الحالية ما زالت محكومة بقواعد Firestore القديمة.</div>' +
      cards(native.ownedProjects, "تطبيقاتك الموجودة فعلياً") +
      cards(native.assignedTests, "اختباراتك المكلف بها فعلياً");
    return section + original;
  };
  renderTests = function () {
    const native = window.__testerhubNative;
    return (native && Array.isArray(native.assignedTests) && native.assignedTests.length
      ? '<div class="panel"><h3>اختبارات Firebase المرتبطة بحسابك</h3>' +
        native.assignedTests.map(a => '<div class="profile-row"><strong>' +
          escapeHTML(a.name || "تطبيق") + '</strong><span class="badge">قراءة فقط</span></div>').join("") +
        '</div>'
      : '') + originalTests();
  };
  window.testerhubNativeSession = function (session) {
    if (!session || !session.user || typeof session.user.uid !== "string") return;
    window.__testerhubNative = session;
    state.profile.name = session.user.name || state.profile.name;
    // An Auth login is not proof of joining a Google Group. Keep separate gate intact.
    render();
  };
  if (window.TesterHubAndroid) {
    window.open = function (url) { window.TesterHubAndroid.open(String(url)); return null; };
    document.addEventListener("click", event => {
      const anchor = event.target.closest && event.target.closest("a[href]");
      if (anchor && /^https:\/\/(play\.google\.com|groups\.google\.com)\//.test(anchor.href)) {
        event.preventDefault(); window.TesterHubAndroid.open(anchor.href);
      }
    }, true);
  }
})();
