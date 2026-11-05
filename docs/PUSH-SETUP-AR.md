# تفعيل الإشعارات والهاتف مغلق

هذه خطوات مالك المشروع، ولا تحتاج خطة مدفوعة أو بطاقة. إذا طلبت منك شاشة ترقية الخطة فتوقف، فهذا يعني أن شيئاً غير مطلوب قد اختير.

## ما الذي يصل

- تذكير يومي للمختبر الذي لديه تقرير مطلوب، في الوقت الذي يختاره.
- الرسائل والدعوات الجديدة، بتأخير يقارب 15 إلى 30 دقيقة، وقد يزيد وقت زحام GitHub.

## الخطوات

1. Firebase Console ← المشروع `testhubiq-c7711` ← Project settings ← Cloud Messaging: تأكد أن **Firebase Cloud Messaging API (V1)** يظهر Enabled.
2. في الصفحة نفسها ← Web configuration ← Web Push certificates ← **Generate key pair**. انسخ المفتاح وأرسله إليّ، أو ضعه في `firebase-config.js` داخل `window.TESTERHUB_VAPID_KEY = "";`. هذا المفتاح عام وليس سراً.
3. Google Cloud Console ← المشروع `testhubiq-c7711` ← IAM & Admin ← Service Accounts ← **Create service account**. الاسم `testerhub-push`، والدوران `Cloud Datastore User` و`Firebase Cloud Messaging API Admin` فقط. ثم افتحه ← Keys ← Add key ← Create new key ← JSON، فينزل ملف.
4. GitHub ← `alaaajeel/testerhub` ← Settings ← Secrets and variables ← Actions ← **New repository secret**. الاسم `FIREBASE_SERVICE_ACCOUNT`، والقيمة محتوى الملف كاملاً. احذف الملف من جهازك بعدها. **لا ترسله في المحادثة ولا تضعه في المستودع**؛ المستودع عام.
5. ادمج طلبات الدمج في `main`، لأن GitHub لا يشغّل الجدولة إلا من الفرع الافتراضي.
6. انشر الموقع بعد وضع المفتاح.

## التأكد أنه يعمل

7. على هاتف Android في Chrome، سجّل الدخول، ومن «حسابي» اضغط زر السماح بالإشعارات ووافق.
8. أغلق التطبيق تماماً، واطلب من حساب آخر أن يرسل لك رسالة.
9. GitHub ← Actions ← Push notifications ← **Run workflow**. يجب أن يكتب السجل سطراً فيه `"sent":1` وأن يصل الإشعار.

## ما يجب أن تعرفه

- قد يتأخر تشغيل GitHub المجدول أو يُهمل وقت الزحام، فالإشعار ليس فورياً.
- يوقف GitHub الجدولة في المستودعات العامة بعد 60 يوماً بلا نشاط، ويرسل تنبيهاً بذلك. أعد تفعيلها من صفحة Actions.
- قد توقف بعض هواتف Android الإشعارات لتوفير البطارية، فراجع إعدادات البطارية لـ Chrome إذا لم تصل.
- على iPhone لا يصل الإشعار إلا بعد تثبيت الموقع على الشاشة الرئيسية.
- كل تشغيل يستهلك قراءات قليلة من حصة Firestore المجانية، وعددها يزيد مع عدد الأجهزة والرسائل.
