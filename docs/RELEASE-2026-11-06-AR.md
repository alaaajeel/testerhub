# إصدار 2026-11-06: المراحل 1–5

هذا الإصدار يجمع #24 إلى #28 بـ PR واحد على `main`. بيه: تقرير اليوم ومراجعة المطور، نقاط XP الموثّقة، دوري المساهمين، تبسيط إضافة التطبيق وقوائم المختبرين، ومركز إشعارات الإدارة.

- تاريخ بدء النقاط الموثّقة: **2026-11-06**. أيام التأكيد قبله تنعرض كنقاط سابقة غير موثّقة.
- لا Migration، ولا حذف بيانات، ولا تغيير بعدادات الاختبار.

## ليش ما انشر تلقائياً

مفتاح Firebase المحفوظ بأسرار GitHub (`FIREBASE_SERVICE_ACCOUNT`) **مرفوض من Google** (`ACCOUNT_STATE_INVALID`): المفتاح محذوف أو الحساب معطّل. لنفس السبب إشعارات Push فاشلة من 5 نوفمبر.

## خطوات النشر من الهاتف

1. **مفتاح جديد:** Firebase Console ← ⚙️ Project settings ← Service accounts ← **Generate new private key**. ينزل ملف JSON.
2. **صلاحية النشر:** Google Cloud Console ← IAM ← الحساب `firebase-adminsdk-…@testhubiq-c7711.iam.gserviceaccount.com` ← Edit ← أضف دور **Firebase Admin**.
3. **السر:** GitHub ← المستودع ← Settings ← Secrets and variables ← Actions ← `FIREBASE_SERVICE_ACCOUNT` ← Update، والصق محتوى ملف JSON كاملاً. هذا يصلّح الإشعارات أيضاً.
4. **الدمج:** ادمج PR الإصدار على `main`.
5. **النشر:** GitHub ← Actions ← **Deploy to Firebase (production)** ← Run workflow ← اكتب `نشر` ← Run.
   - يشغّل الاختبارات أول (ومنها قواعد Firestore على المحاكي).
   - ينشر القواعد والفهارس، ولا يحذف أي فهرس موجود.
   - ينتظر لحد ما تجهز الفهارس (لحد 20 دقيقة).
   - ينشر الموقع على `testiqx.web.app`.
6. **احذف ملف JSON** من الهاتف بعد اللصق.

## إذا عندك كمبيوتر بدل ذلك

```
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes --project testhubiq-c7711
# انتظر جاهزية الفهارس في Console ← Firestore ← Indexes
npm run build
npx firebase-tools deploy --only hosting:testiqx --project testhubiq-c7711
```

## بعد النشر: تجربة سريعة (10 دقائق)

1. بحساب مختبر: أرسل «اختبار اليوم».
2. بحساب المطور: اقبل التقرير، ولازم يطلع «+10 XP».
3. بحساب المختبر: افتح «الدوري» وتأكد من النقاط والترتيب.
4. من `admin.html` ← مركز الإشعارات: أرسل إعلان تجريبي للكل وتأكد أنه يطلع بالجرس.
5. أضف تطبيق تجريبي: انسخ الإيميلات، أو نزّل CSV، وتأكد من الدعوات.

## التراجع

- **الموقع:** Firebase Console ← Hosting ← النسخة السابقة ← Rollback.
- **القواعد:** Firestore ← Rules ← History ← النسخة السابقة ← Publish.

البيانات الجديدة إضافية فقط، فالتراجع ما يمس البيانات القديمة.
