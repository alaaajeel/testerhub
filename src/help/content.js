/* Help center content and helpers, shared by the app and the admin console.
   Built-in articles come from the help center draft (PR #37). The platform owner can override, add, hide or
   restore articles from the console; those live in Firestore (helpArticles) and are merged here. */
(function (root) {
  const CATEGORIES = {
 "start": {
  "title": "ابدأ من هنا",
  "sub": "تعرف على TesterHub من الصفر",
  "icon": "✦"
 },
 "tester": {
  "title": "دليل المختبر",
  "sub": "الانضمام والاختبار والتقارير",
  "icon": "✓"
 },
 "developer": {
  "title": "دليل المطور",
  "sub": "إضافة التطبيقات ومتابعة المختبرين",
  "icon": "▣"
 },
 "faq": {
  "title": "الأسئلة الشائعة",
  "sub": "حلول لأكثر الاستفسارات",
  "icon": "؟"
 }
};
  const POPULAR = ["ready-email", "missing-invites", "tester-first", "developer-ready", "add-app", "tester-group"];
  const DEFAULTS = [
 {
  "slug": "ready-email",
  "cat": "tester",
  "title": "شلون أفعّل الظهور وأشارك بريدي بأمان؟",
  "summary": "فرق ظهور حسابك عن مشاركة البريد للمطور",
  "steps": [
   {
    "title": "فعّل التوفّر",
    "text": "من إعدادات حسابك، خلي حالتك متاح للاختبار حتى المطورين يگدرون يختاروك للدعوات."
   },
   {
    "title": "راجع مشاركة البريد",
    "text": "وافق على مشاركة عنوان بريد Google مع المطور المعني عند الحاجة للاختبارات بقائمة الإيميلات، ولا تخليه ظاهراً للعامة."
   },
   {
    "title": "استخدم الحساب الصحيح",
    "text": "البريد المستخدم للاختبار لازم يطابق حساب Google المؤهّل في Play Console أو عضوية Google Group."
   },
   {
    "title": "تگدر تغيّر قرارك",
    "text": "توفّرك للدعوات مو نفس موافقتك على كشف بريدك. راجع خيارات الخصوصية متى ما تريد."
   }
  ],
  "notice": "لا يوجد شرط أن يكون بريدك الإلكتروني معروضاً بشكل عام ودائم. معلوماتك تُشارك بحدود الحاجة وبموافقتك.",
  "imageUrl": "",
  "videoUrl": "",
  "order": 10
 },
 {
  "slug": "missing-invites",
  "cat": "faq",
  "title": "ليش ما توصلني دعوات للاختبار؟",
  "summary": "خطوات حل مشكلة عدم وصول الدعوات",
  "steps": [
   {
    "title": "تأكد من حسابك",
    "text": "سجّل الدخول وتحقق من تأكيد البريد وتفعيل توفرك للاختبار."
   },
   {
    "title": "تحقق من الدعوات",
    "text": "افتح اختباراتك والإشعارات، لأن الدعوة ممكن تكون بانتظار القبول."
   },
   {
    "title": "انضم إلى مجموعة Google",
    "text": "إذا التطبيق يعتمد Google Groups، انضم إلى المجموعة بحساب Play نفسه وانتظر قبول العضوية عند الحاجة."
   },
   {
    "title": "افتح رابط التطبيق",
    "text": "عضوية المجموعة ما تعني الاشتراك تلقائياً؛ لازم تفتح opt-in لكل تطبيق."
   },
   {
    "title": "تواصل مع الدعم",
    "text": "إذا أكملت الخطوات وباقي ما ظهرت الفرصة، راسل الدعم مع اسم التطبيق بدون نشر بريدك علناً."
   }
  ],
  "notice": "عدد التطبيقات والدعوات المتاحة يعتمد على المطورين وليس مضموناً لكل حساب.",
  "imageUrl": "",
  "videoUrl": "",
  "order": 20
 },
 {
  "slug": "developer-ready",
  "cat": "developer",
  "title": "قائمة جاهزية نشر اختبار مغلق",
  "summary": "راجع إعداد التطبيق قبل إرسال الدعوات",
  "steps": [
   {
    "title": "جهز الاختبار بـ Play Console",
    "text": "راجع حالة مسار الاختبار المغلق وأهلية الاختبار وطريقة الوصول المعتمدة."
   },
   {
    "title": "حدد طريقة الوصول",
    "text": "استخدم مجموعة Google أو قائمة إيميلات بحسب إعداد المسار الفعلي، ولا تغيّر اختباراً جارياً دون فحص الأثر."
   },
   {
    "title": "أضف رابط opt-in",
    "text": "تأكد من أن الرابط تابع لتطبيقك الصحيح ويعمل بحساب مختبر مؤهل."
   },
   {
    "title": "اكتب المهام",
    "text": "جهز تعليمات تجربة واضحة للمختبر ومواعيد المتابعة."
   },
   {
    "title": "راجع الإحصائيات",
    "text": "الدعوة أو التقرير في TesterHub ليست إثبات اشتراك رسمي على Google Play."
   }
  ],
  "notice": "هذه قائمة فحص داخل مركز المساعدة وليست فحصاً آلياً لحساب Google Play Console.",
  "imageUrl": "",
  "videoUrl": "",
  "order": 30
 },
 {
  "slug": "what-is",
  "cat": "start",
  "title": "شنو هي منصة TesterHub؟",
  "summary": "فكرة المنصة وطريقة الاستفادة منها",
  "steps": [
   {
    "title": "الفكرة",
    "text": "TesterHub منصة تساعد المطورين ينظمون اختبار تطبيقاتهم، والمختبرين يشاركون ويرسلون ملاحظات مفيدة."
   },
   {
    "title": "اختار دورك",
    "text": "تگدر تستخدم واجهة المختبر للمشاركة، وواجهة المطور لعرض تطبيقاتك وإدارة التقارير."
   },
   {
    "title": "تذكير مهم",
    "text": "TesterHub خدمة مستقلة، مو تابعة لشركة Google، ولا تضمن وحدها قبول طلب نشر التطبيق."
   }
  ],
  "notice": "",
  "imageUrl": "",
  "videoUrl": "",
  "order": 40
 },
 {
  "slug": "register",
  "cat": "start",
  "title": "شلون أسجّل حساب جديد؟",
  "summary": "التسجيل وتأكيد البريد الإلكتروني",
  "steps": [
   {
    "title": "افتح المنصة",
    "text": "افتح TesterHub من المتصفح على هاتفك."
   },
   {
    "title": "أنشئ حساب",
    "text": "اختار التسجيل وأدخل بياناتك الصحيحة وحدّد دورك."
   },
   {
    "title": "أكد البريد",
    "text": "افتح رسالة التأكيد في بريدك وارجع سجّل الدخول."
   }
  ],
  "notice": "",
  "imageUrl": "",
  "videoUrl": "",
  "order": 50
 },
 {
  "slug": "tester-first",
  "cat": "tester",
  "title": "شلون أبدأ أول اختبار؟",
  "summary": "من الدعوة إلى تثبيت التطبيق",
  "steps": [
   {
    "title": "افتح واجهة المختبر",
    "text": "سجّل الدخول واختار واجهة المختبر، وشوف التطبيقات والدعوات المتاحة."
   },
   {
    "title": "اقبل الدعوة أو اطلب المشاركة",
    "text": "اتبع الطريقة المتاحة لذلك التطبيق داخل TesterHub."
   },
   {
    "title": "اشترك من Google Play",
    "text": "افتح رابط الانضمام للاختبار الخاص بالتطبيق، ووافق باستخدام حساب Google المؤهّل."
   },
   {
    "title": "نزّل التطبيق",
    "text": "ثبّته من Google Play، ثم أكد بدء المشاركة داخل TesterHub."
   },
   {
    "title": "جرّب وأرسل تقريرك",
    "text": "نفّذ مهمة اليوم وارفع ملاحظتك من نموذج التقرير."
   }
  ],
  "notice": "قبول الدعوة أو تسجيل تقرير داخل TesterHub مو دليل رسمي على اشتراكك في اختبار Google Play.",
  "imageUrl": "",
  "videoUrl": "",
  "order": 60
 },
 {
  "slug": "tester-group",
  "cat": "tester",
  "title": "شلون أنضم لمجموعة المختبرين؟",
  "summary": "Google Groups ورابط اختبار كل تطبيق",
  "steps": [
   {
    "title": "افتح رابط المجموعة",
    "text": "ادخل على groups.google.com/g/testerhubiq بحساب Google المستخدم في Play."
   },
   {
    "title": "اطلب الانضمام",
    "text": "كمّل طلب العضوية حسب إعدادات المجموعة وانتظر الموافقة إن لزمت."
   },
   {
    "title": "اشترك بكل تطبيق",
    "text": "عضوية المجموعة وحدها ما تشتركك تلقائياً بكل التطبيقات؛ افتح رابط opt-in لكل تطبيق بشكل منفصل."
   }
  ],
  "notice": "لا تغيّر حساب Google بين المجموعة وGoogle Play إذا كانت أهلية الاختبار مرتبطة به.",
  "imageUrl": "",
  "videoUrl": "",
  "order": 70
 },
 {
  "slug": "daily-report",
  "cat": "tester",
  "title": "شلون أرسل تقرير الاختبار اليومي؟",
  "summary": "التجربة الفعلية وحفظ الملاحظات",
  "steps": [
   {
    "title": "جرّب التطبيق",
    "text": "افتح التطبيق على جهازك وجرّب المهمة المطلوبة فعلياً."
   },
   {
    "title": "ارجع إلى TesterHub",
    "text": "افتح اختبار اليوم وحدد نتيجة التجربة."
   },
   {
    "title": "دوّن ملاحظتك",
    "text": "اكتب وصفاً واضحاً لما نجح أو لم ينجح."
   },
   {
    "title": "ارسل وتأكد من الحفظ",
    "text": "انتظر رسالة نجاح حفظ التقرير. لا تفترض أنه انحفظ إذا انقطع الإنترنت."
   }
  ],
  "notice": "المدة والنقاط داخل TesterHub منفصلة عن تحقق Google Play من الاشتراك والاختبار.",
  "imageUrl": "",
  "videoUrl": "",
  "order": 80
 },
 {
  "slug": "tester-progress",
  "cat": "tester",
  "title": "شلون أعرف تقدمي خلال 14 يوم؟",
  "summary": "الأيام والتقارير والاشتراك الرسمي",
  "steps": [
   {
    "title": "افتح اختباراتي",
    "text": "شوف التطبيق وتقدم الأيام وعدد التقارير المحفوظة."
   },
   {
    "title": "راجع المهام اليومية",
    "text": "التقرير المحفوظ ينحسب داخل المنصة حسب قواعدها، أما مرور يوم وحده ما يعني وصول التقرير."
   },
   {
    "title": "راجع Play Console عند الحاجة",
    "text": "المطور هو اللي يقدر يتابع الأهلية الرسمية للاختبار من Play Console."
   }
  ],
  "notice": "",
  "imageUrl": "",
  "videoUrl": "",
  "order": 90
 },
 {
  "slug": "add-app",
  "cat": "developer",
  "title": "شلون أضيف تطبيقي إلى TesterHub؟",
  "summary": "إنشاء التطبيق وإرسال الدعوات",
  "steps": [
   {
    "title": "جهز رابط الاختبار",
    "text": "من Google Play Console جهز الاختبار المغلق ورابط الانضمام المناسب."
   },
   {
    "title": "افتح إضافة تطبيق",
    "text": "من واجهة المطور، اضغط إضافة تطبيق جديد."
   },
   {
    "title": "عبّئ التفاصيل",
    "text": "اكتب الاسم والرابط والمهام المطلوبة."
   },
   {
    "title": "اختار المختبرين",
    "text": "أكمل اختيار طريقة المشاركة المتاحة بالإصدار الحالي، ثم ارسل الدعوات."
   },
   {
    "title": "راجع النتائج",
    "text": "تابع الردود والتقارير من تفاصيل التطبيق."
   }
  ],
  "notice": "إذا كانت مجموعة TesterHubIQ الرسمية مفعّلة، تگدر تختار لكل تطبيق «مجموعة Google الرسمية» أو «الدعوات الفردية» من تفاصيل التطبيق. الاختبارات الجارية تبقى على طريقتها.",
  "imageUrl": "",
  "videoUrl": "",
  "order": 100
 },
 {
  "slug": "console-group",
  "cat": "developer",
  "title": "شلون أستخدم مجموعة Google للاختبار؟",
  "summary": "بريد المجموعة وإعداد Play Console",
  "steps": [
   {
    "title": "جهز اختباراً مغلقاً",
    "text": "افتح Google Play Console ووصل لقسم المختبرين في مسار الاختبار المناسب."
   },
   {
    "title": "استخدم المجموعة",
    "text": "إذا كان هذا المسار مضبوطاً على Google Groups، استخدم testerhubiq@googlegroups.com وفق إعداداته."
   },
   {
    "title": "وفّر رابط الاشتراك",
    "text": "انشر رابط opt-in الصحيح لذلك التطبيق في TesterHub."
   },
   {
    "title": "لا تغيّر اختبارات جارية بلا تجربة",
    "text": "إذا تطبيقك الحالي يعتمد قائمة إيميلات، لا تغيّر المسار أثناء فترة الاختبار بدون التأكد من أثره."
   }
  ],
  "notice": "وجود المجموعة لا يثبت أن المستخدم اشترك في اختبار تطبيقك؛ عليه الانضمام من رابط التطبيق.",
  "imageUrl": "",
  "videoUrl": "",
  "order": 110
 },
 {
  "slug": "developer-reports",
  "cat": "developer",
  "title": "شلون أتابع المختبرين والتقارير؟",
  "summary": "مراجعة الملاحظات ونشاط المشاركين",
  "steps": [
   {
    "title": "افتح تطبيقاتي",
    "text": "اختار التطبيق وافتح تفاصيله."
   },
   {
    "title": "راجع المشاركات",
    "text": "ميّز بين الدعوة، والقبول، وتأكيد الانضمام، والتقارير اليومية."
   },
   {
    "title": "راجع التقرير",
    "text": "اقرأ ملاحظات المختبر وقرر قبوله أو طلب توضيح إذا متاح."
   },
   {
    "title": "تواصل عند الحاجة",
    "text": "استخدم مراسلة المختبر حتى توضّح المطلوب."
   }
  ],
  "notice": "آخر دخول إلى TesterHub مو إثبات أن المختبر فتح التطبيق المختبَر فعلياً.",
  "imageUrl": "",
  "videoUrl": "",
  "order": 120
 },
 {
  "slug": "install-pwa",
  "cat": "faq",
  "title": "شلون أثبّت TesterHub على أندرويد؟",
  "summary": "إضافة المنصة إلى الشاشة الرئيسية",
  "steps": [
   {
    "title": "افتح الموقع في Chrome",
    "text": "ادخل لرابط TesterHub من متصفح أندرويد."
   },
   {
    "title": "افتح قائمة المتصفح",
    "text": "اضغط النقاط الثلاث في الأعلى."
   },
   {
    "title": "اختار تثبيت التطبيق",
    "text": "إذا ظهر خيار «تثبيت التطبيق» استخدمه، أو خيار «إضافة إلى الشاشة الرئيسية» حسب المتصفح."
   }
  ],
  "notice": "",
  "imageUrl": "",
  "videoUrl": "",
  "order": 130
 },
 {
  "slug": "not-showing",
  "cat": "faq",
  "title": "ليش التطبيق ما يظهر عندي؟",
  "summary": "الحساب والدعوات وروابط الاختبار",
  "steps": [
   {
    "title": "تأكد من الحساب",
    "text": "تحقق أنك داخل بواجهة المختبر وبالحساب الصحيح."
   },
   {
    "title": "راجع الدعوات",
    "text": "بعض التطبيقات تظهر فقط للمختبرين المختارين أو عند توفر المشاركة."
   },
   {
    "title": "تحقق من Google Play",
    "text": "إذا ظهر في TesterHub وما انفتح بالمتجر، راجع رابط opt-in وأهلية حساب Google."
   },
   {
    "title": "راسل المطور",
    "text": "إذا استمرت المشكلة استخدم المحادثة أو الدعم."
   }
  ],
  "notice": "",
  "imageUrl": "",
  "videoUrl": "",
  "order": 140
 },
 {
  "slug": "xp",
  "cat": "faq",
  "title": "متى تنضاف نقاط XP؟",
  "summary": "النقاط بعد مراجعة التقرير",
  "steps": [
   {
    "title": "ارسل التقرير",
    "text": "اكتب تقريراً مفيداً بعد تجربة التطبيق."
   },
   {
    "title": "انتظر المراجعة",
    "text": "النقاط الموثقة ما تنضاف إلا بعد قبول المطور للتقرير وفق نظام المكافآت الحالي."
   },
   {
    "title": "راجع نقاطك",
    "text": "افتح دوري المساهمين والنقاط حتى تشوف المستوى والأوسمة."
   }
  ],
  "notice": "",
  "imageUrl": "",
  "videoUrl": "",
  "order": 150
 },
 {
  "slug": "account",
  "cat": "faq",
  "title": "نسيت كلمة المرور أو ما وصل التأكيد؟",
  "summary": "استعادة الوصول للحساب",
  "steps": [
   {
    "title": "راجع البريد",
    "text": "افحص الرسائل الواردة ومجلد الرسائل غير المرغوب بها."
   },
   {
    "title": "استخدم استعادة كلمة المرور",
    "text": "من صفحة تسجيل الدخول اضغط «نسيت كلمة المرور» إذا متاح."
   },
   {
    "title": "اطلب المساعدة",
    "text": "إذا ما انحلّت المشكلة، تواصل مع دعم المنصة من داخل الحساب."
   }
  ],
  "notice": "",
  "imageUrl": "",
  "videoUrl": "",
  "order": 160
 }
];
  const LIMITS = {slug: 60, title: 120, summary: 200, steps: 12, stepTitle: 80, stepText: 600, notice: 300, url: 500};
  const SLUG = /^[a-z0-9][a-z0-9-]{1,59}$/;
  // Images and videos stay external links on the free plan; only https, and video only from known hosts.
  function safeHttps(url) {
    try { const u = new URL(String(url || "")); return u.protocol === "https:" && String(url).length <= LIMITS.url ? u.href : ""; } catch { return ""; }
  }
  function video(url) {
    const href = safeHttps(url);
    if (!href) return null;
    const u = new URL(href), host = u.hostname.replace(/^www\.|^m\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host === "youtube.com" || host === "youtube-nocookie.com") id = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/) || [])[1] || "";
    if (/^[A-Za-z0-9_-]{6,20}$/.test(id)) return {embed: "https://www.youtube-nocookie.com/embed/" + id, href};
    if (["vimeo.com", "drive.google.com", "youtube.com", "youtu.be"].includes(host)) return {href};
    return null;
  }
  function validate(a) {
    const errors = [];
    const text = (v, max) => typeof v === "string" && v.trim().length <= max;
    if (!SLUG.test(String(a.slug || ""))) errors.push("المعرّف: حروف إنجليزية صغيرة وأرقام وشرطات فقط");
    if (!CATEGORIES[a.cat]) errors.push("القسم غير معروف");
    if (!text(a.title, LIMITS.title) || a.title.trim().length < 3) errors.push("العنوان بين 3 و" + LIMITS.title + " حرف");
    if (!text(a.summary || "", LIMITS.summary)) errors.push("الوصف المختصر أطول من " + LIMITS.summary + " حرف");
    if (!Array.isArray(a.steps) || !a.steps.length || a.steps.length > LIMITS.steps) errors.push("الخطوات من 1 إلى " + LIMITS.steps);
    else if (a.steps.some(s => !text(s.title, LIMITS.stepTitle) || !s.title.trim() || !text(s.text, LIMITS.stepText))) errors.push("عنوان كل خطوة حتى " + LIMITS.stepTitle + " حرف وشرحها حتى " + LIMITS.stepText);
    if (!text(a.notice || "", LIMITS.notice)) errors.push("الملاحظة أطول من " + LIMITS.notice + " حرف");
    if (a.imageUrl && !safeHttps(a.imageUrl)) errors.push("رابط الصورة لازم يبدأ بـ https");
    if (a.videoUrl && !video(a.videoUrl)) errors.push("رابط الفيديو: YouTube أو Vimeo أو Google Drive بـ https");
    if (!Number.isInteger(a.order) || a.order < 0 || a.order > 9999) errors.push("الترتيب رقم من 0 إلى 9999");
    if (!["published", "draft", "hidden"].includes(a.status)) errors.push("الحالة غير معروفة");
    return errors;
  }
  // Stored articles replace built-in ones with the same slug; "hidden" removes it; drafts never show.
  function merge(stored = []) {
    const map = new Map(DEFAULTS.map(a => [a.slug, {...a, builtIn: true}]));
    for (const s of stored) {
      if (!s || !SLUG.test(String(s.slug || s.id || ""))) continue;
      const slug = s.slug || s.id;
      if (s.status === "hidden") { map.delete(slug); continue; }
      if (s.status !== "published" || validate({...s, slug}).length) continue;
      map.set(slug, {...s, slug, builtIn: false});
    }
    return [...map.values()].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  }
  const norm = s => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
  function search(list, term) {
    const words = norm(term).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return list.filter(a => {
      const hay = norm([a.title, a.summary, a.notice, CATEGORIES[a.cat]?.title, ...a.steps.flatMap(s => [s.title, s.text])].join(" "));
      return words.every(w => hay.includes(w));
    });
  }
  root.TesterHubHelp = {CATEGORIES, POPULAR, DEFAULTS, LIMITS, SLUG, safeHttps, video, validate, merge, search};
})(globalThis);
