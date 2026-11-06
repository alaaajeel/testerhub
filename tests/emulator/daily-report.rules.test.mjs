import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,collection,serverTimestamp,writeBatch} from 'firebase/firestore';

// Phase 1 daily testing: the third outcome, review decisions, and what neither side may rewrite.
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
const db=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:verified}).firestore();
const day=()=>new Date().toISOString().slice(0,10);
const TASK='فتح التطبيق وتجربة وظيفة أساسية';
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  for(const [uid,role] of [['t1','tester'],['t2','tester'],['d1','developer'],['d2','developer']])
   await setDoc(doc(d,'users',uid),{name:'Test User',email:uid+'@example.com',role,available:role==='tester'});
  await setDoc(doc(d,'projects','p1'),{ownerUid:'d1',name:'App',link:'https://play.google.com/apps/testing/com.example.app'});
  await setDoc(doc(d,'assignments','p1_t1'),{ownerUid:'d1',testerUid:'t1',projectId:'p1',joinedDay:null,checkins:[]});
  // A historical report written by the original flow, without any review fields.
  await setDoc(doc(d,'reports','p1_t1_2026-01-01'),{assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',date:'2026-01-01',tested:TASK,outcome:'ok',notes:'Old report kept as is',status:'ok',createdAt:'2026-01-01T10:00:00.000Z'});
  await setDoc(doc(d,'reports','p1_t1_2026-01-02'),{assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',date:'2026-01-02',tested:TASK,outcome:'blocked',notes:'Could not open the app',status:'new',createdAt:'2026-01-02T10:00:00.000Z'});
 });
});
async function startAssignment(){
 await assertSucceeds(updateDoc(doc(db('t1'),'assignments','p1_t1'),{joinedDay:day(),joinedAt:serverTimestamp()}));
}
function reportBatch(uid,{outcome='blocked',status='new',assignmentId='p1_t1',testerUid=uid,extra={}}={}){
 const d=db(uid),date=day(),batch=writeBatch(d);
 batch.set(doc(d,'reports',`${assignmentId}_${date}`),{assignmentId,projectId:'p1',testerUid,ownerUid:'d1',date,tested:TASK,outcome,notes:'ما گدرت أفتح الشاشة الرئيسية',status,createdAt:new Date().toISOString(),submittedAt:serverTimestamp(),...extra});
 batch.update(doc(d,'assignments',assignmentId),{checkins:[date],lastCheckinAt:serverTimestamp()});
 return batch;
}

test('tester can submit the new "could not finish" outcome as an open problem',async()=>{
 await startAssignment();
 await assertSucceeds(reportBatch('t1').commit());
 const saved=await getDoc(doc(db('d1'),'reports',`p1_t1_${day()}`));
 if(saved.data().outcome!=='blocked'||saved.data().status!=='new')throw Error('saved report does not match');
});
test('blocked outcome must be marked new and unknown outcomes are rejected',async()=>{
 await startAssignment();
 await assertFails(reportBatch('t1',{outcome:'blocked',status:'ok'}).commit());
 await assertFails(reportBatch('t1',{outcome:'skipped',status:'ok'}).commit());
});
test('a second report for the same day is rejected',async()=>{
 await startAssignment();
 await assertSucceeds(reportBatch('t1',{outcome:'ok',status:'ok'}).commit());
 await assertFails(reportBatch('t1',{outcome:'ok',status:'ok'}).commit());
});
test('tester cannot approve their own report while creating it',async()=>{
 await startAssignment();
 await assertFails(reportBatch('t1',{extra:{reviewStatus:'accepted'}}).commit());
});
test('another tester cannot submit a report on someone else\'s assignment',async()=>{
 await startAssignment();
 await assertFails(reportBatch('t2',{testerUid:'t1'}).commit());
 await assertFails(reportBatch('t2').commit());
});
test('owner can accept, ask for clarification and reject a report',async()=>{
 const ref=doc(db('d1'),'reports','p1_t1_2026-01-01');
 for(const reviewStatus of ['accepted','clarify','rejected','accepted'])
  await assertSucceeds(updateDoc(ref,{reviewStatus,reviewedAt:serverTimestamp(),reviewerUid:'d1'}));
});
test('clarification request can travel with a message in one batch',async()=>{
 const d=db('d1'),batch=writeBatch(d);
 batch.update(doc(d,'reports','p1_t1_2026-01-01'),{reviewStatus:'clarify',reviewedAt:serverTimestamp(),reviewerUid:'d1'});
 batch.set(doc(collection(d,'messages')),{assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',sender:'developer',senderUid:'d1',text:'طلب المطور توضيحاً حول تقرير 2026-01-01',at:new Date().toISOString(),createdAt:serverTimestamp()});
 await assertSucceeds(batch.commit());
});
test('review cannot rewrite what the tester reported',async()=>{
 const ref=doc(db('d1'),'reports','p1_t1_2026-01-01'),review={reviewStatus:'accepted',reviewedAt:serverTimestamp(),reviewerUid:'d1'};
 await assertFails(updateDoc(ref,{...review,notes:'Changed by developer'}));
 await assertFails(updateDoc(ref,{...review,outcome:'issue'}));
 await assertFails(updateDoc(ref,{...review,tested:'Other task'}));
 await assertFails(updateDoc(ref,{...review,date:'2026-01-03'}));
 await assertFails(updateDoc(ref,{notes:'Silent edit'}));
});
test('review must use server time, the reviewer identity and a known decision',async()=>{
 const ref=doc(db('d1'),'reports','p1_t1_2026-01-01');
 await assertFails(updateDoc(ref,{reviewStatus:'approved',reviewedAt:serverTimestamp(),reviewerUid:'d1'}));
 await assertFails(updateDoc(ref,{reviewStatus:'accepted',reviewedAt:new Date('2020-01-01'),reviewerUid:'d1'}));
 await assertFails(updateDoc(ref,{reviewStatus:'accepted',reviewedAt:serverTimestamp(),reviewerUid:'d2'}));
});
test('another developer cannot read or review private reports',async()=>{
 await assertFails(getDoc(doc(db('d2'),'reports','p1_t1_2026-01-01')));
 await assertFails(updateDoc(doc(db('d2'),'reports','p1_t1_2026-01-01'),{reviewStatus:'rejected',reviewedAt:serverTimestamp(),reviewerUid:'d2'}));
});
test('tester cannot review or forge a review of their own report',async()=>{
 await assertFails(updateDoc(doc(db('t1'),'reports','p1_t1_2026-01-01'),{reviewStatus:'accepted',reviewedAt:serverTimestamp(),reviewerUid:'t1'}));
 await assertFails(updateDoc(doc(db('t1'),'reports','p1_t1_2026-01-01'),{reviewStatus:'accepted',reviewedAt:serverTimestamp(),reviewerUid:'d1'}));
});
test('unverified owner cannot review',async()=>{
 await assertFails(updateDoc(doc(db('d1',false),'reports','p1_t1_2026-01-01'),{reviewStatus:'accepted',reviewedAt:serverTimestamp(),reviewerUid:'d1'}));
});
test('archived projects reject review updates',async()=>{
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'projects','p1'),{status:'archived'}));
 await assertFails(updateDoc(doc(db('d1'),'reports','p1_t1_2026-01-01'),{reviewStatus:'accepted',reviewedAt:serverTimestamp(),reviewerUid:'d1'}));
});
test('owner can still mark a blocked report fixed, and historical reports stay readable',async()=>{
 await assertSucceeds(updateDoc(doc(db('d1'),'reports','p1_t1_2026-01-02'),{status:'fixed'}));
 await assertSucceeds(getDoc(doc(db('t1'),'reports','p1_t1_2026-01-01')));
 await assertSucceeds(getDoc(doc(db('d1'),'reports','p1_t1_2026-01-01')));
});
