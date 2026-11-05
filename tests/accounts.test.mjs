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
test('pause hides directory entry without modifying assignment progress',async()=>{const x=fixture({profile:{role:'tester',available:true}});await x.service.updateProfile({participationPaused:true});assert.equal(x.data.available,false);assert.equal(x.data.participationPaused,true);assert.equal(x.writes,1)});
test('failed profile writes reject rather than returning success',async()=>{const x=fixture({profile:{role:'tester'},failWrite:true});await assert.rejects(x.service.updateProfile({name:'New Name'}));assert.equal(x.writes,0)});
test('password reset does not reveal whether account exists',async()=>{await fixture().service.resetPassword('unknown@example.com')});
test('missing session rejects verification request',async()=>{const x=fixture();x.auth.currentUser=null;await assert.rejects(x.service.sendVerification(),{code:'auth/session-expired'})});
test('Arabic error messages cover session credentials network and denied persistence',()=>{for(const code of ['auth/email-already-in-use','auth/wrong-password','auth/network-request-failed','auth/session-expired','permission-denied','unavailable'])assert.match(humanError({code}),/[\u0600-\u06ff]/)});
