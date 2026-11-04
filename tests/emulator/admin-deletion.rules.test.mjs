import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,updateDoc,getDoc,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
let env;
const projectId='project-to-delete';
const nowDay=()=>new Date().toISOString().slice(0,10);
const db=(uid,verified=true,extra={})=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:verified,...extra}).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  for(const [uid,role,available] of [['t1','tester',true],['d1','developer',false]]){
   await setDoc(doc(d,'users',uid),{name:uid,email:uid+'@example.com',role,available,createdAt:serverTimestamp()});
  }
  await setDoc(doc(d,'projects',projectId),{name:'Temporary Test',ownerUid:'d1',status:'deleting',link:'https://play.google.com/apps/testing/com.test.a',testersCount:1});
  await setDoc(doc(d,'assignments',projectId+'_t1'),{projectId,ownerUid:'d1',testerUid:'t1',name:'Temporary Test',link:'https://play.google.com/apps/testing/com.test.a',joinedDay:nowDay(),joinedAt:Timestamp.fromDate(new Date(Date.now()-86400000)),checkins:[]});
  await setDoc(doc(d,'reports','legacy-issue'),{projectId,ownerUid:'d1',testerUid:'t1',assignmentId:projectId+'_t1',status:'new',outcome:'issue'});
  await setDoc(doc(d,'adminDeleteJobs',projectId),{projectId,status:'queued'});
 });
});
test('a locked project keeps existing reports readable to its owner',async()=>{
 await assertSucceeds(getDoc(doc(db('d1'),'reports','legacy-issue')));
 await assertSucceeds(getDoc(doc(db('t1'),'assignments',projectId+'_t1')));
});
test('no tester may create a new report after an admin locks the project',async()=>{
 const d=db('t1'),day=nowDay(),ref=doc(d,'assignments',projectId+'_t1');
 const batch=writeBatch(d);
 batch.set(doc(d,'reports',projectId+'_t1_'+day),{projectId,assignmentId:projectId+'_t1',testerUid:'t1',ownerUid:'d1',date:day,tested:'فتح التطبيق وتجربة وظيفة أساسية',outcome:'ok',notes:'Tested on a real device',status:'ok',createdAt:new Date().toISOString(),submittedAt:serverTimestamp()});
 batch.update(ref,{checkins:[day],lastCheckinAt:serverTimestamp()});
 await assertFails(batch.commit());
});
test('no tester may start, accept or modify assignment while project is deleting',async()=>{
 await assertFails(updateDoc(doc(db('t1'),'assignments',projectId+'_t1'),{joinedDay:nowDay(),joinedAt:serverTimestamp()}));
});
test('new chat messages are blocked once the project deletion starts',async()=>{
 await assertFails(setDoc(doc(db('t1'),'messages','test-msg'),{projectId,assignmentId:projectId+'_t1',testerUid:'t1',ownerUid:'d1',senderUid:'t1',sender:'tester',text:'It is still running',at:new Date().toISOString(),createdAt:serverTimestamp()}));
});
test('developer cannot modify issue reports during deletion',async()=>{
 await assertFails(updateDoc(doc(db('d1'),'reports','legacy-issue'),{status:'fixed'}));
});
test('private deletion jobs cannot be read or changed from browser, even with a forged admin token',async()=>{
 const d=db('d1',true,{testerhubAdmin:true,email:'dhi98886@gmail.com'});
 await assertFails(getDoc(doc(d,'adminDeleteJobs',projectId)));
 await assertFails(setDoc(doc(d,'adminDeleteJobs','forged'),{status:'complete'}));
});
test('project documents cannot be permanently deleted from client SDK',async()=>{
 const {deleteDoc}=await import('firebase/firestore');
 await assertFails(deleteDoc(doc(db('d1'),'projects',projectId)));
});

test('suspended tester cannot submit reports or messages, and cannot reactivate their own profile',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>{
  await updateDoc(doc(ctx.firestore(),'users','t1'),{suspended:true});
  await updateDoc(doc(ctx.firestore(),'projects',projectId),{status:'recruiting'});
 });
 await assertFails(updateDoc(doc(db('t1'),'users','t1'),{name:'Forged User'}));
 await assertFails(setDoc(doc(db('t1'),'messages','new-msg'),{projectId,assignmentId:projectId+'_t1',testerUid:'t1',ownerUid:'d1',senderUid:'t1',sender:'tester',text:'Message from suspended account',at:new Date().toISOString(),createdAt:serverTimestamp()}));
 await env.withSecurityRulesDisabled(async ctx=>updateDoc(doc(ctx.firestore(),'users','t1'),{suspended:false}));
 await assertSucceeds(updateDoc(doc(db('t1'),'users','t1'),{name:'Enabled User'}));
});
test('archived projects reject new protected messages and existing report updates',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>updateDoc(doc(ctx.firestore(),'projects',projectId),{status:'archived'}));
 await assertFails(setDoc(doc(db('t1'),'messages','archive-msg'),{projectId,assignmentId:projectId+'_t1',testerUid:'t1',ownerUid:'d1',senderUid:'t1',sender:'tester',text:'This app is archived',at:new Date().toISOString(),createdAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db('d1'),'reports','legacy-issue'),{status:'fixed'}));
});
