# ربط TesterHub بـ Firebase Hosting دون فقد البيانات

## الحالة الحالية (إعداد جاهز — النشر على Firebase **غير مفعّل**)
- المشروع الحالي `testhubiq-c7711` محفوظ كما هو.
- الاستضافة الحالية على GitHub Pages تبقى فعّالة.
- `firebase.json` يجهّز Hosting لرفع **`dist` فقط**.
- GitHub Action يشغّل اختبارات Firestore Emulator والكود أولاً وينشر GitHub Pages، ثم يمكنه نشر نفس النسخة إلى Firebase **فقط عند إعطاء تفويض صريح**.
- لا تغير هذه الإعدادات قاعدة Firestore أو Auth أو المستخدمين ولا تنشر Firestore rules.
- الرابط المطلوب هو `https://testerhubiq.web.app/`، بعد إنشاء Hosting Site جديد باسم `testerhubiq` في المشروع الحالي إذا كان الاسم متاحاً. لم نثبت حجزه أو تشغيله بعد.
- إعداد `target: testerhubiq` يحصر النشر بالموقع الإضافي `testerhubiq` فقط، ولا يستبدل موقع Hosting الافتراضي. **إن كان `testerhubiq` مستخدماً عالمياً، يجب اختيار اسم مختلف بعد موافقة المالك، ولا تنفذ النشر بالاسم المتوقع.**

## ما يلزم لمرة واحدة (مالك Firebase/GitHub)
1. افتح [Firebase Console](https://console.firebase.google.com/project/testhubiq-c7711/hosting)، وضمن Hosting اضغط **Add another site** ثم أدخل **`testerhubiq`** كـSite ID (ليس `testerhubiq.web.app`). يجب أن يكون الاسم متاحاً عالمياً ويُنشأ فعلياً داخل مشروع `testhubiq-c7711`. إذا لم يظهر زر الإضافة، اتبع إعداد Hosting الأولي ثم أنشئ الموقع الإضافي. لا تنشر على الموقع الافتراضي بالخطأ.
2. وفّر حساب خدمة يمنح **صلاحية نشر Firebase Hosting** فقط قدر الإمكان. الطريقة الرسمية لإعداد حساب GitHub هي `firebase init hosting:github` على حاسوب مصادق له، أو إنشاء Service Account مخصص باتباع [وثائق Firebase](https://github.com/FirebaseExtended/action-hosting-deploy/blob/main/docs/service-account.md).
3. في GitHub للمستودع `alaaajeel/testerhub`: Settings → Secrets and variables → Actions → **Secrets**؛ أنشئ سر المستودع `FIREBASE_SERVICE_ACCOUNT_TESTHUBIQ_C7711` وأودع JSON لحساب الخدمة هناك **فقط**. لا تضعه في الكود أو الدردشة.
4. في نفس الصفحة: **Variables**؛ أضف `ENABLE_FIREBASE_HOSTING_DEPLOY` بالقيمة `true`. هذا مفتاح فتح النشر بعد التأكد من الموقع وبيانات الاعتماد.
5. شغّل GitHub Actions → Deploy TesterHub to GitHub Pages → Run workflow، ثم تأكد من نجاح مهمة **Firebase Hosting**. إذا فشلت، حافظ على GitHub Pages وأصلح السبب دون المساس بالبيانات.
6. في Firebase Console → Authentication → Settings → Authorized domains، أضف `testerhubiq.web.app`، وتأكد من إعدادات روابط رسائل تأكيد البريد واسترجاع كلمة المرور على الدومين الجديد.
7. جرّب حساب مطور ومختبر على الدومين الجديد، وأضف تطبيقاً تجريبياً وتقريراً ومحادثة. بعد النجاح فقط انشر رابط Firebase للفريق.

## روابط المشروع
- GitHub Pages الحالي: https://alaaajeel.github.io/testerhub/
- Firebase Hosting المتوقع عند التفعيل: https://testerhubiq.web.app/
- GitHub Actions: https://github.com/alaaajeel/testerhub/actions

## ملاحظات
- تطبيق PWA المثبّت من GitHub Pages يختلف عن التطبيق المثبّت من Firebase Hosting؛ ثبّت النسخة الجديدة من دومين Firebase بعد التحقق.
- GitHub Pages يبقى شغالاً كعنوان احتياطي إلى أن يتم التأكد من الحسابات والدعوات والتقارير والمزامنة.
- استهداف الموقع الإضافي صار مضبوطاً مسبقاً في `.firebaserc` و`firebase.json` وGitHub Action. إنشاء الموقع نفسه وتفويض نشره ما زالا مطلوبين من حساب المالك.
- لا يوجد أي سر خاص في هذا المستودع. إعداد Firebase Web Config العلني ليس مفتاحاً لإدارة Hosting.
