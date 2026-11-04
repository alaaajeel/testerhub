# تفعيل التذكير اليومي والدخول عبر Google

هذه خطوات مالك المشروع. لا تحتاج أي منها إلى خطة مدفوعة أو بطاقة، ويبقى المشروع على Spark. إذا طلبت منك شاشة ترقية الخطة فتوقف، فهذا يعني أن شيئاً غير مطلوب قد اختير.

## أولاً: الدخول عبر Google

1. Firebase Console ← المشروع `testhubiq-c7711` ← Authentication ← Sign-in method ← Add new provider ← Google ← Enable. اختر بريد الدعم ثم Save.
2. Authentication ← Settings ← Authorized domains: تأكد من وجود `testiqx.web.app`، وإلا فأضفه بـ Add domain. هذا الموقع ليس الموقع الافتراضي للمشروع، فقد لا يكون مضافاً.
3. Authentication ← Settings ← User account linking: يجب أن يبقى الخيار «Link accounts that use the same email» محدداً. هذا ما يبقي الحسابات القديمة على المعرّف نفسه.

## ثانياً: التذكير اليومي

4. Firebase Console ← Project settings ← Cloud Messaging: تأكد أن «Firebase Cloud Messaging API (V1)» يظهر Enabled.
5. في الصفحة نفسها ← Web configuration ← Web Push certificates ← Generate key pair. انسخ المفتاح العام وضعه في `firebase-config.js` داخل `window.TESTERHUB_VAPID_KEY = "";` ثم احفظ التغيير في المستودع. هذا المفتاح عام وليس سراً. ما دام فارغاً يعمل الموقع بالتقويم والتنبيهات أثناء الفتح فقط.
6. Google Cloud Console ← المشروع `testhubiq-c7711` ← IAM & Admin ← Service Accounts ← Create service account. الاسم `testerhub-reminders`، والدوران `Cloud Datastore User` و`Firebase Cloud Messaging API Admin` فقط. ثم افتحه ← Keys ← Add key ← Create new key ← JSON، فينزل ملف.
7. GitHub ← `alaaajeel/testerhub` ← Settings ← Secrets and variables ← Actions ← New repository secret. الاسم `FIREBASE_SERVICE_ACCOUNT` والقيمة محتوى الملف كاملاً. احذف الملف من جهازك بعدها، ولا تضعه في المستودع أبداً؛ المستودع عام.
8. ادمج هذا التغيير حتى يصل إلى `main`: أولاً إلى `release/v1-beta` ثم طلب الدمج #14 إلى `main`. لا يشغّل GitHub الجدولة إلا من الفرع الافتراضي.
9. انشر القواعد والموقع:

```bash
npm run deploy
```

## ثالثاً: التأكد أنه يعمل

10. على هاتف Android في Chrome، ادخل بحساب مختبر لديه اختبار ينتظر تقرير اليوم. من «حسابي» اضغط «تفعيل التذكير اليومي» ثم اسمح بالتنبيهات. اختر في «وقت التذكير» الساعة الحالية، وأغلق التطبيق.
11. GitHub ← Actions ← Daily reminders ← Run workflow. يجب أن يكتب السجل سطراً مثل `{"checked":1,"sent":1,"failed":0,"removed":0}` وأن يصل التنبيه، ويفتح الضغط عليه صفحة التقرير.
12. سجّل خروجك، ثم اضغط «المتابعة بحساب Google» بالبريد نفسه الذي له حساب قديم: يجب أن تظهر اختباراتك نفسها.

## ما يجب أن تعرفه

- قد يتأخر تشغيل GitHub المجدول أو يُهمل وقت الزحام. لذلك يغطي كل تشغيل الساعة السابقة أيضاً، لكن التذكير قد يتأخر عن موعده.
- يوقف GitHub الجدولة في المستودعات العامة بعد 60 يوماً بلا نشاط، ويرسل تنبيهاً بذلك. أعد تفعيلها من صفحة Actions.
- إذا كان حساب البريد وكلمة المرور القديم غير مؤكد، فإن الدخول بـ Google بالبريد نفسه يبقي الحساب وبياناته ويحذف كلمة المرور القديمة، وهذا سلوك Firebase لمنع من سجّل بريد غيره مسبقاً من دخول الحساب. يمكن استرجاع كلمة مرور جديدة لاحقاً.
- على iPhone لا يصل التنبيه إلا بعد تثبيت الموقع على الشاشة الرئيسية.
