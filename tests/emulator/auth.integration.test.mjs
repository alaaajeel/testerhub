import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import * as a from 'firebase/auth';
import * as f from 'firebase/firestore';
import '../../src/services/accounts.js';
// No live Firebase access: both SDK clients explicitly point at local emulators.
test('real Auth + Firestore emulator account lifecycle for both roles',async()=>{
 for(const role of ['tester','developer']) {
  const app=initializeApp({projectId:'demo-testerhub',apiKey:'demo-key'},'auth-'+role);
  const auth=a.getAuth(app),db=f.getFirestore(app);
  a.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  f.connectFirestoreEmulator(db,'127.0.0.1',8080);
  const service=globalThis.TesterHubAccounts.createAccounts({auth,authFns:a,db,storeFns:f});
  const email=role+'-'+Date.now()+'@example.com';
  try {
   const created=await service.signup({name:'Test Account',email,password:'Safe-password-123',role,available:role==='tester'});
   const uid=created.uid;
   assert.equal(created.role,role);assert.equal(created.emailVerified,false);
   await service.sendVerification();
   const response=await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-testerhub/oobCodes');
   const {oobCodes}=await response.json();
   const code=oobCodes.find(x=>x.email===email&&x.requestType==='VERIFY_EMAIL');
   assert.ok(code);await a.applyActionCode(auth,code.oobCode);
   assert.equal((await service.checkVerification()).emailVerified,true);
   await service.updateProfile({name:'Updated Account'});
   await a.signOut(auth);assert.equal(await service.currentUser(),null);
   assert.equal((await service.login(email,'Safe-password-123')).uid,uid);
   await service.resetPassword(email);
   const codes=await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-testerhub/oobCodes')).json();
   const reset=codes.oobCodes.find(x=>x.email===email&&x.requestType==='PASSWORD_RESET');
   assert.ok(reset);await a.confirmPasswordReset(auth,reset.oobCode,'New-password-123');
   await a.signOut(auth);
   await assert.rejects(service.login(email,'Safe-password-123'));
   assert.equal((await service.login(email,'New-password-123')).name,'Updated Account');
  } finally {await f.terminate(db);await deleteApp(app)}
 }
});
