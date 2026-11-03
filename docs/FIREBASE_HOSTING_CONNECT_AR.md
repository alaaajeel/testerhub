# ربط TesterHub بـ Firebase Hosting دون فقد البيانات

## الحالة الحالية (إعداد جاهز — النشر على Firebase **غير مفعّل**)
- المشروع الحالي `testhubiq-c7711` محفوظ كما هو.
- الاستضافة الحالية على GitHub Pages تبقى فعّالة.
- `firebase.json` يجهّز Hosting لرفع **`dist` فقط**.
- GitHub Action يشغّل اختبارات Firestore Emulator والكود أولاً وينشر GitHub Pages، ثم يمكنه نشر نفس النسخة إلى Firebase **فقط عند إعطاء تفويض صريح**.
- لا تغير هذه الإعدادات قاعدة Firestore أو Auth أو المستخدمين ولا تنشر Firestore rules.
- الرابط المتوقع بعد إنشاء Hosting ونشره هو `https://testhubiq-c7711.web.app/` (غير مؤكد أنه نشط قبل النشر).
- **تحذير:** النشر `channelId: live` سيحل محل أي موقع منشور حالياً على **موقع Hosting الافتراضي لهذا المشروع**. تأكد أن هذا الموقع غير مستخدم لتطبيق مختلف قبل التفعيل.

## ما يلزم لمرة واحدة (مالك Firebase/GitHub)
1. افتح [Firebase Console](https://console.firebase.google.com/project/testhubiq-c7711/hosting) وتأكد من أن موقع Hosting الافتراضي `testhubiq-c7711` لا يخدم موقعاً آخر؛ فعّل Firebase Hosting إن لم يكن مفعّلاً.
2. وفّر حساب خدمة يمنح **صلاحية نشر Firebase Hosting** فقط قدر الإمكان. الطريقة الرسمية لإعداد حساب GitHub هي `firebase init hosting:github` على حاسوب مصادق له، أو إنشاء Service Account مخصص باتباع [وثائق Firebase](https://github.com/FirebaseExtended/action-hosting-deploy/blob/main/docs/service-account.md).
3. في GitHub للمستودع `alaaajeel/testerhub`: Settings → Secrets and variables → Actions → **Secrets**؛ أنشئ سر المستودع `FIREBASE_SERVICE_ACCOUNT_TESTHUBIQ_C7711` وأودع JSON لحساب الخدمة هناك **فقط**. لا تضعه في الكود أو الدردشة.
4. في نفس الصفحة: **Variables**؛ أضف `ENABLE_FIREBASE_HOSTING_DEPLOY` بالقيمة `true`. هذا مفتاح فتح النشر بعد التأكد من الموقع وبيانات الاعتماد.
5. شغّل GitHub Actions → Deploy TesterHub to GitHub Pages → Run workflow، ثم تأكد من نجاح مهمة **Firebase Hosting**. إذا فشلت، حافظ على GitHub Pages وأصلح السبب دون المساس بالبيانات.
6. في Firebase Console → Authentication → Settings → Authorized domains، أضف `testhubiq-c7711.web.app`، وتأكد من إعدادات روابط رسائل تأكيد البريد واسترجاع كلمة المرور على الدومين الجديد.
7. جرّب حساب مطور ومختبر على الدومين الجديد، وأضف تطبيقاً تجريبياً وتقريراً ومحادثة. بعد النجاح فقط انشر رابط Firebase للفريق.

## روابط المشروع
- GitHub Pages الحالي: https://alaaajeel.github.io/testerhub/
- Firebase Hosting المتوقع عند التفعيل: https://testhubiq-c7711.web.app/
- GitHub Actions: https://github.com/alaaajeel/testerhub/actions

## ملاحظات
- تطبيق PWA المثبّت من GitHub Pages يختلف عن التطبيق المثبّت من Firebase Hosting؛ ثبّت النسخة الجديدة من دومين Firebase بعد التحقق.
- GitHub Pages يبقى شغالاً كعنوان احتياطي إلى أن يتم التأكد من الحسابات والدعوات والتقارير والمزامنة.
- إذا موقع Hosting الافتراضي مستخدم، أنشئ موقع Hosting إضافياً من Console ثم غيّر Target في `firebase.json` وGitHub Action قبل تفعيل النشر؛ لا تستبدل موقعاً موجوداً.
- لا يوجد أي سر خاص في هذا المستودع. إعداد Firebase Web Config العلني ليس مفتاحاً لإدارة Hosting.
