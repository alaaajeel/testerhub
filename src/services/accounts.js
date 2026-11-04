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
      return {...profile, uid: u.uid, email: u.email, emailVerified: u.emailVerified};
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
    return {currentUser, completeProfile, signup, login, sendVerification, checkVerification, resetPassword, updateProfile};
  }
  function humanError(err = {}) {
    const messages = {
      'auth/email-already-in-use': 'هذا البريد مسجل مسبقاً. سجّل الدخول أو استرجع كلمة المرور.',
      'auth/invalid-credential': 'البريد أو كلمة المرور غير صحيحة.',
      'auth/wrong-password': 'البريد أو كلمة المرور غير صحيحة.',
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
