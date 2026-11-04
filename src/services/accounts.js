/* Firebase account boundary. No UI, production credentials, or destructive recovery. */
(function (root) {
  const fail = code => Object.assign(new Error(code), {code});
  function nameValue(name) {
    const value = String(name || '').trim();
    if (value.length < 2 || value.length > 80) throw fail('profile/invalid-name');
    return value;
  }
  function createAccounts({auth, authFns: a, db, storeFns: f}) {
    const session = () => { if (!auth.currentUser) throw fail('auth/session-expired'); return auth.currentUser; };
    const ref = uid => f.doc(db, 'users', uid);
    async function currentUser() {
      const u = auth.currentUser;
      if (!u) return null;
      const snap = await f.getDocFromServer(ref(u.uid));
      if (auth.currentUser?.uid !== u.uid) throw fail('auth/session-expired');
      const profile = snap.exists() ? snap.data() : {profileMissing: true};
      if (snap.exists() && !['tester', 'developer'].includes(profile.role)) throw fail('profile/invalid-role');
      return {...profile, uid: u.uid, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName || '', hasGoogle: !!u.providerData?.some(p => p.providerId === 'google.com')};
    }
    async function completeProfile({name, role}) {
      name = nameValue(name);
      if (!['tester', 'developer'].includes(role)) throw fail('profile/invalid-role');
      const u = session();
      // A transaction prevents a recovery form in another tab overwriting a profile.
      await f.runTransaction(db, async tx => {
        const target = ref(u.uid), existing = await tx.get(target);
        if (existing.exists()) return;
        const now = f.serverTimestamp();
        tx.set(target, {name, role, email: u.email, available: false, createdAt: now, termsAcceptedAt: now});
      });
      return currentUser();
    }
    async function signup(input) {
      nameValue(input.name);
      if (!['tester', 'developer'].includes(input.role)) throw fail('profile/invalid-role');
      const created = await a.createUserWithEmailAndPassword(auth, input.email.trim().toLowerCase(), input.password);
      // If the profile write fails, keep the Auth user: recovery resumes with the same UID.
      const profile = await completeProfile(input);
      // A failed first send is recoverable from the verification screen.
      if (created?.user) await a.sendEmailVerification(created.user).catch(() => {});
      return profile;
    }
    async function login(email, password) {
      await a.signInWithEmailAndPassword(auth, email.trim(), password);
      const linkedGoogle = await finishGoogleLink(email);
      return {...await currentUser(), linkedGoogle};
    }
    // Closing the popup is a choice, not a failure.
    const CANCELLED = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'];
    const googleProvider = () => {
      const provider = new a.GoogleAuthProvider();
      provider.setCustomParameters({prompt: 'select_account'});
      return provider;
    };
    let pendingGoogle = null;
    // Firebase keeps the UID when it merges the same email by itself, so an existing profile and its tests stay.
    // When it refuses, the password must prove ownership first; only then are the two sign-in methods linked.
    async function loginWithGoogle() {
      pendingGoogle = null;
      try { await a.signInWithPopup(auth, googleProvider()); }
      catch (err) {
        if (CANCELLED.includes(err.code)) return null;
        const credential = err.code === 'auth/account-exists-with-different-credential' && a.GoogleAuthProvider.credentialFromError(err);
        if (!credential) throw err;
        const email = String(err.customData?.email || '').toLowerCase();
        pendingGoogle = {credential, email};
        throw Object.assign(fail('auth/link-required'), {email});
      }
      return currentUser();
    }
    async function finishGoogleLink(email) {
      const pending = pendingGoogle;
      pendingGoogle = null;
      if (!pending || (pending.email && pending.email !== email.trim().toLowerCase())) return false;
      // The password sign-in already succeeded; a failed link must not undo it.
      try {
        await a.linkWithCredential(session(), pending.credential);
        await a.reload(session());
        await a.getIdToken(session(), true);
        return true;
      } catch (err) { console.warn('google link', err.code); return false; }
    }
    // For a password account whose Google address is a different one.
    async function linkGoogle() {
      const u = session();
      try { await a.linkWithPopup(u, googleProvider()); }
      catch (err) { if (CANCELLED.includes(err.code)) return null; throw err; }
      await a.getIdToken(u, true);
      return currentUser();
    }
    async function sendVerification() { await a.sendEmailVerification(session()); }
    async function checkVerification() {
      const u = session();
      await a.reload(u);
      await a.getIdToken(u, true);
      return currentUser();
    }
    async function resetPassword(email) {
      if (!String(email).trim()) throw fail('auth/invalid-email');
      try { await a.sendPasswordResetEmail(auth, email.trim()); }
      catch (err) { if (err.code !== 'auth/user-not-found') throw err; }
    }
    async function updateProfile({name, role}) {
      // Older profiles may still carry available:true from the retired public directory.
      const u = session(), changes = {available: false};
      if (name !== undefined) changes.name = nameValue(name);
      if (role !== undefined) {
        if (!['tester', 'developer'].includes(role)) throw fail('profile/invalid-role');
        changes.role = role;
      }
      await f.updateDoc(ref(u.uid), changes);
      return currentUser();
    }
    return {currentUser, completeProfile, signup, login, loginWithGoogle, linkGoogle, sendVerification, checkVerification, resetPassword, updateProfile};
  }
  function humanError(err = {}) {
    const messages = {
      'auth/email-already-in-use': 'هذا البريد مسجل مسبقاً. ادخل بزر Google أو بكلمة المرور، أو استرجعها.',
      'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة. إذا أنشأت حسابك عبر Google فادخل بزر Google.',
      'auth/popup-blocked': 'منع المتصفح نافذة Google. اسمح بالنوافذ المنبثقة لهذا الموقع وحاول مرة أخرى.',
      'auth/operation-not-allowed': 'الدخول عبر Google غير متاح الآن. استخدم البريد وكلمة المرور.',
      'auth/unauthorized-domain': 'الدخول عبر Google غير متاح من هذا العنوان. استخدم البريد وكلمة المرور.',
      'auth/credential-already-in-use': 'حساب Google هذا مرتبط بحساب TesterHub آخر.',
      'auth/provider-already-linked': 'حسابك مرتبط بـ Google من قبل.',
      'auth/link-required': 'هذا البريد له حساب بكلمة مرور. أدخلها مرة واحدة لنربطه بحساب Google.',
      'auth/wrong-password': 'البريد أو كلمة المرور غير صحيحة. إذا أنشأت حسابك عبر Google فادخل بزر Google.',
      'auth/user-not-found': 'البريد أو كلمة المرور غير صحيحة.',
      'auth/invalid-email': 'أدخل بريداً إلكترونياً صحيحاً.',
      'auth/weak-password': 'كلمة المرور ضعيفة؛ استخدم 6 أحرف على الأقل.',
      'auth/network-request-failed': 'الاتصال بالإنترنت منقطع. حاول مرة أخرى.',
      'auth/too-many-requests': 'محاولات كثيرة. انتظر قليلاً ثم حاول.',
      'auth/user-disabled': 'هذا الحساب موقوف. تواصل مع إدارة المنصة.',
      'auth/user-token-expired': 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
      'auth/session-expired': 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
      'auth/requires-recent-login': 'سجّل الدخول من جديد لإكمال العملية.',
      'auth/email-not-verified': 'أكد ملكية بريدك ثم اضغط «تحققت من بريدي».',
      'permission-denied': 'لا تملك صلاحية هذه العملية، ولم يُحفظ شيء. حدّث الصفحة وحاول مرة أخرى.',
      'unavailable': 'تعذر الاتصال بالخادم، ولم يُحفظ شيء. تحقق من الإنترنت وحاول مرة أخرى.',
      'app/offline': 'لا يوجد اتصال بالإنترنت، ولم يُحفظ شيء. حاول بعد عودة الاتصال.',
      'app/timeout': 'تأخر الخادم في الرد ولم نتأكد من الحفظ. تحقق من الإنترنت ثم حدّث الصفحة.',
      'profile/invalid-name': 'الاسم يجب أن يكون بين حرفين و80 حرفاً.',
      'profile/invalid-role': 'نوع الحساب غير مدعوم. تواصل مع إدارة المنصة.'
    };
    return messages[err.code] || (err.code ? 'تعذر إكمال العملية أو تأكيد حفظ البيانات. حاول مرة أخرى.' : err.message) || 'تعذر إكمال العملية.';
  }
  root.TesterHubAccounts = {createAccounts, humanError, nameValue};
})(globalThis);
