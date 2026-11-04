import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/services/accounts.js';
const {createAccounts, humanError}=globalThis.TesterHubAccounts;
function fixture({profile, failWrite=false}={}) {
 const auth={currentUser:{uid:'u1',email:'tester@example.com',emailVerified:false}};
 let data=profile, writes=0, creates=0, refreshed=false;
 const snap=()=>({exists:()=>!!data,data:()=>data});
 const service=createAccounts({auth,db:{},authFns:{
  createUserWithEmailAndPassword:async()=>{creates++},
  signInWithEmailAndPassword:async()=>{},sendEmailVerification:async()=>{},
  reload:async u=>{u.emailVerified=true},getIdToken:async(_,force)=>{refreshed=force},
  sendPasswordResetEmail:async()=>{throw Object.assign(Error(),{code:'auth/user-not-found'})}
 },storeFns:{doc:(_,c,id)=>id,getDocFromServer:async()=>snap(),serverTimestamp:()=>123,
  runTransaction:async(_,fn)=>fn({get:async()=>snap(),set:(_,v)=>{if(failWrite)throw Error('write failed');data=v;writes++}}),
  updateDoc:async(_,v)=>{if(failWrite)throw Error('write failed');data={...data,...v};writes++}
 }});
 return {service,auth,get data(){return data},get writes(){return writes},get creates(){return creates},get refreshed(){return refreshed}};
}
test('missing profile exposes recovery with original Auth identity',async()=>{const x=fixture();const u=await x.service.currentUser();assert.equal(u.profileMissing,true);assert.equal(u.uid,'u1')});
test('invalid name or admin role never creates an Auth account',async()=>{const x=fixture();for(const input of [{name:'x',role:'tester'},{name:'Valid',role:'admin'}])await assert.rejects(x.service.signup(input));assert.equal(x.creates,0)});
test('profile recovery cannot overwrite an existing role or name',async()=>{const x=fixture({profile:{name:'Old',role:'tester'}});await x.service.completeProfile({name:'New',role:'developer'});assert.equal(x.data.name,'Old');assert.equal(x.writes,0)});
test('failed signup profile write keeps original UID and provides recovery',async()=>{const x=fixture({failWrite:true});await assert.rejects(x.service.signup({name:'Tester',role:'tester',email:'test@example.com',password:'123456'}));assert.equal(x.auth.currentUser.uid,'u1');assert.equal((await x.service.currentUser()).profileMissing,true)});
test('UID email and verification state cannot be overridden by profile data',async()=>{const x=fixture({profile:{role:'tester',uid:'attacker',email:'fake',emailVerified:true}});const u=await x.service.currentUser();assert.equal(u.uid,'u1');assert.equal(u.email,'tester@example.com');assert.equal(u.emailVerified,false)});
test('verification reload refreshes ID token before reading profile',async()=>{const x=fixture({profile:{role:'tester'}});assert.equal((await x.service.checkVerification()).emailVerified,true);assert.equal(x.refreshed,true)});
test('signup records terms acceptance and never lists the tester publicly',async()=>{const x=fixture();await x.service.completeProfile({name:'Tester',role:'tester'});assert.equal(x.data.available,false);assert.equal(x.data.termsAcceptedAt,123)});
test('mode switch accepts only tester or developer',async()=>{const x=fixture({profile:{role:'tester'}});await x.service.updateProfile({role:'developer'});assert.equal(x.data.role,'developer');await assert.rejects(x.service.updateProfile({role:'admin'}),{code:'profile/invalid-role'})});
test('editing a legacy profile removes it from the retired directory',async()=>{const x=fixture({profile:{role:'tester',name:'Old',available:true}});await x.service.updateProfile({name:'New Name'});assert.equal(x.data.available,false);assert.equal(x.data.name,'New Name')});
test('failed profile writes reject rather than returning success',async()=>{const x=fixture({profile:{role:'tester'},failWrite:true});await assert.rejects(x.service.updateProfile({name:'New Name'}));assert.equal(x.writes,0)});
test('password reset does not reveal whether account exists',async()=>{await fixture().service.resetPassword('unknown@example.com')});
test('missing session rejects verification request',async()=>{const x=fixture();x.auth.currentUser=null;await assert.rejects(x.service.sendVerification(),{code:'auth/session-expired'})});
test('Arabic error messages cover session credentials network and denied persistence',()=>{for(const code of ['auth/email-already-in-use','auth/wrong-password','auth/network-request-failed','auth/session-expired','permission-denied','unavailable'])assert.match(humanError({code}),/[\u0600-\u06ff]/)});

function googleFixture({popup, link = async () => {}, password = async () => {}}) {
 const auth = {currentUser: null}, calls = {link: 0, reload: 0};
 const signedIn = {uid: 'u1', email: 'a@b.example', emailVerified: true, displayName: 'G', providerData: [{providerId: 'google.com'}]};
 class GoogleAuthProvider { setCustomParameters(p) { this.params = p; } static credentialFromError = err => err.credential; }
 const service = createAccounts({auth, db: {}, authFns: {
  GoogleAuthProvider,
  signInWithPopup: async (_, provider) => { assert.equal(provider.params.prompt, 'select_account'); await popup(); auth.currentUser = signedIn; },
  signInWithEmailAndPassword: async () => { await password(); auth.currentUser = signedIn; },
  linkWithCredential: async () => { calls.link++; await link(); },
  linkWithPopup: async () => { await popup(); },
  reload: async () => { calls.reload++; }, getIdToken: async () => {},
 }, storeFns: {doc: () => 'ref', getDocFromServer: async () => ({exists: () => true, data: () => ({role: 'tester', name: 'Old'})})}});
 return {service, auth, calls};
}
const refused = (email = 'A@B.example') => Object.assign(new Error(), {code: 'auth/account-exists-with-different-credential', credential: {pending: true}, customData: {email}});
test('closing the Google popup is not an error', async () => {
 for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request']) {
  const x = googleFixture({popup: async () => { throw Object.assign(new Error(), {code}); }});
  assert.equal(await x.service.loginWithGoogle(), null);
 }
});
test('other Google failures reach the user in Arabic', async () => {
 for (const code of ['auth/popup-blocked', 'auth/operation-not-allowed', 'auth/unauthorized-domain']) {
  const x = googleFixture({popup: async () => { throw Object.assign(new Error(), {code}); }});
  await assert.rejects(x.service.loginWithGoogle(), {code});
  assert.match(humanError({code}), /[\u0600-\u06ff]/);
 }
});
test('a refused Google sign-in asks for the password, and only that password links it', async () => {
 const x = googleFixture({popup: async () => { throw refused(); }});
 await assert.rejects(x.service.loginWithGoogle(), err => err.code === 'auth/link-required' && err.email === 'a@b.example');
 assert.equal(x.calls.link, 0, 'nothing links before the password proves ownership');
 const user = await x.service.login(' a@b.example ', 'secret');
 assert.equal(user.linkedGoogle, true);
 assert.equal(x.calls.link, 1);
 assert.equal((await x.service.login('a@b.example', 'secret')).linkedGoogle, false, 'the credential is used once');
});
test('signing in to a different email does not link the waiting Google account', async () => {
 const x = googleFixture({popup: async () => { throw refused(); }});
 await assert.rejects(x.service.loginWithGoogle());
 assert.equal((await x.service.login('someone@else.example', 'secret')).linkedGoogle, false);
 assert.equal(x.calls.link, 0);
});
test('a failed link keeps the password sign-in that already succeeded', async () => {
 const x = googleFixture({popup: async () => { throw refused(); }, link: async () => { throw Object.assign(new Error(), {code: 'auth/credential-already-in-use'}); }});
 await assert.rejects(x.service.loginWithGoogle());
 const user = await x.service.login('a@b.example', 'secret');
 assert.equal(user.linkedGoogle, false);
 assert.equal(user.uid, 'u1');
});
test('a successful Google sign-in exposes the Google name and provider', async () => {
 const user = await googleFixture({popup: async () => {}}).service.loginWithGoogle();
 assert.equal(user.hasGoogle, true);
 assert.equal(user.displayName, 'G');
 assert.equal(user.name, 'Old', 'an existing profile name is not replaced');
});

test('the sign-in screen leads with Google and explains a pending link', async () => {
 const {authScreen, authDraft} = await import('../src/views/public.js');
 for (const mode of ['login', 'signup']) {
  Object.assign(authDraft, {mode, linking: false});
  const page = authScreen();
  assert.ok(page.indexOf('data-action="google"') > 0 && page.indexOf('data-action="google"') < page.indexOf('id="auth-form"'));
  assert.doesNotMatch(page, /class="notice"/);
 }
 Object.assign(authDraft, {mode: 'login', linking: true, email: 'a@b.example'});
 const linking = authScreen();
 assert.match(linking, /class="notice"/);
 assert.match(linking, /value="a@b\.example"/);
 Object.assign(authDraft, {linking: false, email: ''});
});
