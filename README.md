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

## تطوير المشروع الحالي

المستودع قائم والموقع الحالي: https://alaaajeel.github.io/testerhub/ . Firebase الحالي هو `testhubiq-c7711`؛ لا تنشئ مشروعاً جديداً.

تغييرات المرحلة الأولى وحالة النشر والمتطلبات: [تقرير المرحلة الأولى](docs/PHASE-1-AR.md). قائمة الاستكمال: [حالة التنفيذ](docs/IMPLEMENTATION-STATUS.md).

بعد موافقة ومراجعة القواعد ونشرها، ينشر Pages ملفات dist عند الدمج إلى main. لا يُنشر Firebase تلقائياً.

## تشغيل المعاينة محلياً
`python -m http.server 8000` ثم افتح `http://localhost:8000`. مع `firebase-config.js` = null تكون المعاينة تجريبية ومحلية، وليست مزامنة حقيقية.

## الاختبارات
شغّل `npm ci` ثم `npm test` و`npm run test:rules` (Java 21 موصى به). للمتصفح: `npx playwright install chromium` ثم `npm run test:e2e`. للبناء: `npm run build`.

هذه الاختبارات تفصل بين سلوك الخدمة، قواعد Emulator، وواجهة Chromium مع Firebase doubles. لا تغني عن تجربة إنتاج بين حسابين على أجهزة فعلية.

## حدود الأمان والنشاط
- التطبيق يتلقى إقراراً من المختبر بأنه جرّب التطبيق، لكنه لا يستطيع التحقق المستقل من استعمال التطبيق على Google Play.
- التقييد اليومي يعتمد على تحقق العميل وقواعد Firestore وتحديث ذرّي، وقد يحتاج تقوية إضافية بخادم موثوق لمنع التلاعب بزمن الجهاز أو تعدد الحسابات.
- الملفات عامة عند استخدام GitHub Pages؛ لا تضف أي أسرار أو كلمات مرور إلى المستودع.
- جرى ضبط Firebase Web Config لمشروع `testhubiq-c7711` داخل الملفات فقط؛ لم يتم إثبات نجاح تسجيل دخول حقيقي أو نشر قواعد Firestore، ولم يُنشر الموقع.

## GitHub Pages deployment

Site publishing uses the committed `.github/workflows/pages.yml` workflow on pushes to `main`. In repository Settings → Pages, set Source to **GitHub Actions**. Check Actions → Deploy TesterHub to GitHub Pages for the deployment status. Firebase Authentication and Firestore must be configured and verified separately.
