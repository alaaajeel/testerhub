// Google sign-in against the Auth emulator, which accepts a plain JSON id token in place of Google's popup.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp, deleteApp} from 'firebase/app';
import * as a from 'firebase/auth';
import * as f from 'firebase/firestore';
import '../../src/services/accounts.js';

let counter = 0;
const stamp = Date.now();
const googleCredential = (email, sub = 'g' + stamp + counter++) => a.GoogleAuthProvider.credential(JSON.stringify({sub, email, email_verified: true, name: 'Google Name'}));
async function fixture(run) {
 const app = initializeApp({projectId: 'demo-testerhub', apiKey: 'demo-key'}, 'google-' + counter++);
 const auth = a.getAuth(app), db = f.getFirestore(app);
 a.connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings: true});
 f.connectFirestoreEmulator(db, '127.0.0.1', 8080);
 // The popup is the only stand-in: everything after it is the real SDK and emulator.
 const google = {credential: null};
 let refusedEmail = null;
 const refuse = email => { refusedEmail = email; };
 class GoogleAuthProvider extends a.GoogleAuthProvider { static credentialFromError = () => google.credential; }
 const authFns = {...a, GoogleAuthProvider,
  signInWithPopup: (authInstance) => {
   if (refusedEmail) throw Object.assign(new Error(), {code: 'auth/account-exists-with-different-credential', customData: {email: refusedEmail}});
   return a.signInWithCredential(authInstance, google.credential);
  },
  linkWithPopup: (user) => a.linkWithCredential(user, google.credential),
 };
 const service = globalThis.TesterHubAccounts.createAccounts({auth, authFns, db, storeFns: f});
 try { await run({auth, db, service, google, refuse}); } finally { await f.terminate(db); await deleteApp(app); }
}
const verify = async (auth, email) => {
 const {oobCodes} = await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-testerhub/oobCodes')).json();
 await a.applyActionCode(auth, oobCodes.filter(x => x.email === email && x.requestType === 'VERIFY_EMAIL').pop().oobCode);
};
const providers = auth => auth.currentUser.providerData.map(p => p.providerId).sort();

test('a new Google user is verified, completes a profile the rules accept, and returns to it', async () => {
 await fixture(async ({auth, service, google}) => {
  const email = `new${stamp}@gmail.com`, sub = 'new' + stamp;
  google.credential = googleCredential(email, sub);
  const first = await service.loginWithGoogle();
  assert.equal(first.profileMissing, true);
  assert.equal(first.emailVerified, true);
  assert.equal(first.hasGoogle, true);
  assert.equal(first.displayName, 'Google Name');
  const done = await service.completeProfile({name: first.displayName, role: 'developer'});
  assert.equal(done.role, 'developer');
  await a.signOut(auth);
  google.credential = googleCredential(email, sub);
  const again = await service.loginWithGoogle();
  assert.equal(again.uid, first.uid);
  assert.equal(again.role, 'developer');
 });
});

// When Firebase merges the same email itself. Production may refuse some addresses instead; that path is tested below.
for (const [label, mail, verified] of [
 ['verified gmail', `old-v${stamp}@gmail.com`, true],
 ['unverified gmail', `old-u${stamp}@gmail.com`, false],
]) {
 test(`an existing password account keeps its UID and profile: ${label}`, async () => {
  await fixture(async ({auth, service, google}) => {
   const password = 'Safe-password-123';
   const created = await service.signup({name: 'Old Tester', email: mail, password, role: 'tester'});
   if (verified) { await verify(auth, mail); await service.checkVerification(); }
   await a.signOut(auth);
   google.credential = googleCredential(mail);
   const user = await service.loginWithGoogle();
   assert.equal(user.uid, created.uid, 'same UID, so assignments and reports stay attached');
   assert.equal(user.name, 'Old Tester');
   assert.equal(user.role, 'tester');
   assert.equal(user.hasGoogle, true);
   assert.equal(user.emailVerified, true, 'Google proved the address');
   assert.ok(providers(auth).includes('google.com'));
   await a.signOut(auth);
   // An unproven password could belong to someone who pre-registered this address, so Firebase drops it.
   if (verified) assert.equal((await service.login(mail, password)).uid, created.uid);
   else await assert.rejects(service.login(mail, password), err => /^auth\/(invalid-credential|wrong-password)$/.test(err.code) && /Google/.test(globalThis.TesterHubAccounts.humanError(err)));
  });
 });
}

test('when Firebase refuses, only the right password links Google to the same account', async () => {
 await fixture(async ({auth, service, google, refuse}) => {
  const mail = `guard${stamp}@company.example`, password = 'Safe-password-123';
  const created = await service.signup({name: 'Guarded', email: mail, password, role: 'tester'});
  await verify(auth, mail); await service.checkVerification();
  await a.signOut(auth);
  google.credential = googleCredential(mail);
  refuse(mail);
  await assert.rejects(service.loginWithGoogle(), err => err.code === 'auth/link-required' && err.email === mail);
  assert.equal(auth.currentUser, null);
  await assert.rejects(service.login(mail, 'Wrong-password-1'));
  assert.equal(auth.currentUser, null);
  const user = await service.login(mail, password);
  assert.equal(user.linkedGoogle, true);
  assert.equal(user.uid, created.uid);
  assert.equal(user.hasGoogle, true);
  assert.deepEqual(providers(auth), ['google.com', 'password']);
  await a.signOut(auth);
  refuse(null);
  assert.equal((await service.loginWithGoogle()).uid, created.uid, 'Google alone now opens the old account');
 });
});

test('a signed-in password account links a Google account with a different email', async () => {
 await fixture(async ({auth, service, google}) => {
  const mail = `pw${stamp}@example.com`, password = 'Safe-password-123';
  const created = await service.signup({name: 'Password User', email: mail, password, role: 'tester'});
  await verify(auth, mail); await service.checkVerification();
  google.credential = googleCredential(`other${stamp}@gmail.com`);
  const user = await service.linkGoogle();
  assert.equal(user.uid, created.uid);
  assert.equal(user.email, mail, 'the account email does not change');
  assert.deepEqual(providers(auth), ['google.com', 'password']);
  await a.signOut(auth);
  assert.equal((await service.login(mail, password)).uid, created.uid, 'the password keeps working');
 });
});

test('a Google account already used elsewhere cannot be linked twice', async () => {
 await fixture(async ({auth, service, google}) => {
  const mail = `twice${stamp}@gmail.com`, sub = 'twice' + stamp;
  google.credential = googleCredential(mail, sub);
  await service.loginWithGoogle();
  await a.signOut(auth);
  const other = `second${stamp}@example.com`;
  await service.signup({name: 'Second', email: other, password: 'Safe-password-123', role: 'tester'});
  await verify(auth, other); await service.checkVerification();
  google.credential = googleCredential(mail, sub);
  await assert.rejects(service.linkGoogle(), {code: 'auth/credential-already-in-use'});
 });
});
