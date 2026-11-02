# TesterHub v0.3.2 — نسخة Firebase Config لمشروع TestHubiq

تطبيق ويب عربي PWA بواجهات المختبر والمطور، تقارير يومية، بلاغات، محادثة، ونقاط تحفيزية.

## ما هو جاهز
- واجهة قابلة للتثبيت عبر Chrome بعد نشرها على HTTPS.
- إنشاء حسابات Firebase Auth (بريد + كلمة مرور) بعد تفعيل Firebase.
- قوائم المختبرين الموافقين على إظهار البريد، وإضافة التطبيق، وحجز المختبرين.
- تأكيد الانضمام إلى اختبار Google Play (إقرار شخصي، لا تحقق مباشر من Google).
- تقرير يومي: تأكيد تجربة ميزة، نتيجتها، ملاحظة اختيارية أو بلاغ مفصل.
- محادثات وتحديث حالة البلاغ بين المطور والمختبر، مخزنة في Firestore إذا فعّلت الخدمة.
- حفظ نقاط XP بناءً على تقارير الأيام، وليس حقلاً قابلاً للكتابة.
- تنبيه داخل التطبيق أو تصدير تقويم ICS. **الإشعارات بالخلفية والهاتف مغلق غير مفعّلة**.

## إعداد GitHub Pages
**تضم هذه النسخة ملف نشر تلقائي** `.github/workflows/pages.yml` لنشر الموقع عند كل رفع إلى فرع `main` بعد إنشاء المستودع واختيار GitHub Actions من إعدادات Pages.

مهم: لم يُنشأ المستودع ولم يُنشر الموقع لأن موصل GitHub المتصل لا يتيح إنشاء مستودعات جديدة.

1. أنشئ مستودع GitHub باسم `testerhub` في حساب `alaaajeel` واجعله Public، ولا تضع به بيانات سرية.
2. ارفع **محتويات هذا المجلد** إلى جذر المستودع على فرع `main` (لا ترفع ملف ZIP كملف واحد).
3. من Settings → Pages → Build and deployment اختر **GitHub Actions**. يبدأ النشر تلقائياً بواسطة `.github/workflows/pages.yml` عند الرفع إلى `main`.
4. بعد نشر GitHub Pages يجب أن يعمل الرابط `https://alaaajeel.github.io/testerhub/` إن كان اسم المستودع كما هو.
5. افتح الرابط على Android Chrome → القائمة ⋮ → تثبيت التطبيق.

## إعداد Firebase يدوياً (لا يحتاج ربط إضافة ChatGPT)
1. افتح https://console.firebase.google.com/ وأنشئ مشروع Firebase خاص بـTesterHub.
2. من Project settings → Your apps أضف Web app، وخذ كائن Firebase Config العلني فقط (apiKey/authDomain/projectId/appId/messagingSenderId).
3. **تم:** ربط إعدادات تطبيق الويب `testhubiq-c7711` في `firebase-config.js`، ولا حاجة لإعادة نسخها.
4. من Build → Authentication → Sign-in method فعّل Email/Password.
5. من Build → Firestore Database أنشئ قاعدة Firestore (Production mode) ثم انشر محتوى `firestore.rules` في Rules.
6. من Authentication → Settings → Authorized domains أضف `alaaajeel.github.io` إن لم يكن مسموحاً.
7. أنشئ الفهرس المركب المحدد في `firestore.indexes.json` عند الحاجة من Firestore → Indexes؛ الاستعلامات الأخرى ذات شرط واحد تستخدم فهارس افتراضية.
8. جرّب الحسابات على جهازين بعد نشر الإعدادات والقواعد. لا تبدأ الاختبار الفعلي قبل اختبار السماح والحجب من حسابين مختلفين.

## تشغيل المعاينة محلياً
`python -m http.server 8000` ثم افتح `http://localhost:8000`. مع `firebase-config.js` = null تكون المعاينة تجريبية ومحلية، وليست مزامنة حقيقية.

## الاختبارات
`node --test tests/static.test.mjs` يفحص الملفات ومسارات المنطق، **ولا يغني عن اختبار قواعد Firestore عملياً بواسطة Firebase Emulator أو جهازين**.

## حدود الأمان والنشاط
- التطبيق يتلقى إقراراً من المختبر بأنه جرّب التطبيق، لكنه لا يستطيع التحقق المستقل من استعمال التطبيق على Google Play.
- التقييد اليومي يعتمد على تحقق العميل وقواعد Firestore وتحديث ذرّي، وقد يحتاج تقوية إضافية بخادم موثوق لمنع التلاعب بزمن الجهاز أو تعدد الحسابات.
- الملفات عامة عند استخدام GitHub Pages؛ لا تضف أي أسرار أو كلمات مرور إلى المستودع.
- جرى ضبط Firebase Web Config لمشروع `testhubiq-c7711` داخل الملفات فقط؛ لم يتم إثبات نجاح تسجيل دخول حقيقي أو نشر قواعد Firestore، ولم يُنشر الموقع.

## إعداد مشروع TestHubiq الجديد
تمت إضافة إعدادات تطبيق Firebase Web الخاص بـ `testhubiq-c7711`. يجب تفعيل Email/Password، وإنشاء Firestore، ونشر قواعد `firestore.rules` في Firebase Console قبل التسجيل الحقيقي. لا تعتمد التطبيق قبل اختبار حسابين من جهازين مختلفين.

## GitHub Pages deployment

Site publishing uses the committed `.github/workflows/pages.yml` workflow on pushes to `main`. In repository Settings → Pages, set Source to **GitHub Actions**. Check Actions → Deploy TesterHub to GitHub Pages for the deployment status. Firebase Authentication and Firestore must be configured and verified separately.
