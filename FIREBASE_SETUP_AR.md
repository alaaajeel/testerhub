# تم ربط Firebase Web Config بمشروع TestHubiq (testhubiq-c7711)

**منجز:** أضفنا إعدادات تطبيق الويب إلى `firebase-config.js`، ولا حاجة لإرسالها مجدداً.

**غير منجز:** لا توجد صلاحية Firebase مباشرة هنا لإنشاء Firestore أو تفعيل Email/Password أو نشر قواعد الأمان. يجب تشغيل هذه الخدمات ثم اختبار حسابين مختلفين قبل الاعتماد على التطبيق.

# ربط TesterHub بمشروع Firebase المسمى TestHubiq

هذه النسخة تحتوي بالفعل على **إعدادات Firebase Web** لمشروع `testhubiq-c7711`. الاتصال في الكود مهيأ، لكن خدمات Firebase تحتاج تفعيلًا وقواعد حماية.

## 1) إنشاء تطبيق الويب ضمن المشروع (لا تعيد إنشاء المشروع)

1. افتح https://console.firebase.google.com/ واختر مشروع **TestHubiq** (ID: `testhubiq-c7711`).
2. من ⚙️ **Project settings** > **General** > **Your apps** اضغط رمز **</>** لإنشاء تطبيق ويب، إذا لم تسجل تطبيق ويب سابقاً.
3. اسم التطبيق: `TesterHub Web`. لا تحتاج تفعيل Firebase Hosting؛ الاستضافة ستكون GitHub Pages.
4. **مكتمل بالفعل**: تم إدراج Config في ملفات الموقع. لا تحتاج نسخه مجدداً.

مثال توضيحي *ليس حقيقياً*:
```js
window.TESTERHUB_FIREBASE_CONFIG = {
  apiKey: 'AIza...PUBLIC_WEB_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: '1:123456789:web:abc...',
  messagingSenderId: '123456789'
};
```

**اسم المشروع المعروض TestHubiq قد يختلف عن `projectId` الحقيقي.** استخدم القيم من إعدادات Firebase ولا تخمنها.

## 2) تفعيل خدمات Firebase

1. **Authentication** > **Sign-in method** > Email/Password > Enable > Save.
2. **Firestore Database** > Create database > اختر المنطقة المناسبة ثم **Start in production mode**.
3. إذا كان المشروع جديداً وفارغاً تماماً، انشر القواعد من `firestore.rules` داخل Firestore > Rules.
4. إذا كان المشروع مستخدماً لتطبيق آخر، **لا تستبدل القواعد الحالية**؛ دمج القواعد يحتاج فحصاً حتى لا ينقطع التطبيق الآخر.
5. من Firestore > Indexes أضف الفهرس المركب لـ`users` حسب `role` و`available` الموجود في `firestore.indexes.json` إذا ظهر خطأ يستلزم ذلك.
6. من Authentication > Settings > Authorized domains أضف `alaaajeel.github.io` عند نشر الموقع عليه.

## 3) النشر على GitHub

1. أنشئ مستودعاً عاماً جديداً باسم `testerhub` داخل GitHub `alaaajeel` إن لم يكن موجوداً.
2. ارفع **المحتويات** المفكوكة، وليس ملف ZIP فقط.
3. في Settings > Pages اختر Deploy from a branch / main / root.
4. عنوان الموقع المستهدف بعد نجاح النشر: `https://alaaajeel.github.io/testerhub/`. هذا العنوان ليس فعّالاً قبل إنشاء المستودع والنشر.
5. على Chrome Android: القائمة ⋮ > Install app أو Add to Home screen.

## 4) قبل دعوة المختبرين

- أنشئ حساب مطور وحساب مختبر على هاتفين منفصلين، وجرّب تسجيل الدخول والخروج.
- اختبر نسخ بريد المختبر (بموافقته)، وإضافة رابط Google Play، وتأكيد الانضمام والتقرير اليومي والمراسلة والرد.
- جرّب محاولات الدخول إلى مشاريع الغير، والتأكد من منعها بالقواعد.
- تذكير التقويم متوفر. إرسال Push والهاتف مغلق **غير مفعل** بعد.
- ضغط المختبر على «انضممت» لا يعني أن Google Play تحققت تلقائياً من الانضمام، ولا يضمن قبول التطبيق في الإنتاج.