import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,writeBatch,serverTimestamp,increment,Timestamp} from 'firebase/firestore';

// Phase 2 contribution XP: points only for accepted work, once, and never editable from a browser.
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
const db=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:verified}).firestore();
const POINTS={report:10,bug:20,retest:10,cycle:50};
const week=()=>'W'+Math.floor((Date.now()+259200000)/604800000);
const month=()=>{const d=new Date();return 'M'+(d.getUTCFullYear()*100+d.getUTCMonth()+1)};
const days=n=>Array.from({length:n},(_,i)=>`2026-01-${String(i+1).padStart(2,'0')}`);
const TASK='فتح التطبيق وتجربة وظيفة أساسية';
const base={assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',tested:TASK,createdAt:'2026-01-01T00:00:00.000Z'};

beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  for(const [uid,role] of [['t1','tester'],['t2','tester'],['d1','developer'],['d2','developer']])
   await setDoc(doc(d,'users',uid),{name:'User '+uid,email:uid+'@example.com',role,available:role==='tester'});
  await setDoc(doc(d,'projects','p1'),{ownerUid:'d1',name:'App',link:'https://play.google.com/apps/testing/com.example.app'});
  await setDoc(doc(d,'assignments','p1_t1'),{ownerUid:'d1',testerUid:'t1',projectId:'p1',joinedDay:'2026-01-01',checkins:days(14)});
  await setDoc(doc(d,'reports','p1_t1_2026-01-01'),{...base,date:'2026-01-01',outcome:'ok',notes:'Accepted ok report',status:'ok',reviewStatus:'accepted'});
  await setDoc(doc(d,'reports','p1_t1_2026-01-02'),{...base,date:'2026-01-02',outcome:'issue',notes:'Accepted problem',status:'fixed',reviewStatus:'accepted'});
  await setDoc(doc(d,'reports','p1_t1_2026-01-03'),{...base,date:'2026-01-03',outcome:'ok',notes:'Not reviewed yet',status:'ok'});
  await setDoc(doc(d,'reports','p1_t1_2026-01-04'),{...base,date:'2026-01-04',outcome:'ok',notes:'Retested the fix',status:'ok',retestOf:'p1_t1_2026-01-02',reviewStatus:'accepted'});
  await setDoc(doc(d,'reports','p1_t1_2026-01-05'),{...base,date:'2026-01-05',outcome:'ok',notes:'Rejected report',status:'ok',reviewStatus:'rejected'});
  await setDoc(doc(d,'reports','p1_t1_2026-01-06'),{...base,date:'2026-01-06',outcome:'ok',notes:'Needs detail',status:'ok',reviewStatus:'clarify'});
 });
});
// Mirrors awardXp() in index.html: one event plus every total it changes, in one batch.
function awardBatch(uid,{id,kind,reportId='',points=POINTS[kind],first=true,assignmentId='p1_t1',testerUid='t1',ownerUid='d1',projectId='p1',eventWeek=week(),eventMonth=month(),bump=points,skip=[]}){
 const d=db(uid),batch=writeBatch(d);
 const counters={points:increment(bump),reports:increment(kind==='report'?1:0),bugs:increment(kind==='bug'?1:0),retests:increment(kind==='retest'?1:0),cycles:increment(kind==='cycle'?1:0),lastEventId:id,updatedAt:serverTimestamp()};
 batch.set(doc(d,'contributions',id),{kind,points,testerUid,ownerUid,projectId,assignmentId,reportId,awardedBy:uid,week:eventWeek,month:eventMonth,createdAt:serverTimestamp()});
 if(!skip.includes('totals'))batch.set(doc(d,'xpTotals',testerUid),{uid:testerUid,...counters,apps:increment(first?1:0)},{merge:true});
 if(!skip.includes('week'))batch.set(doc(d,'xpPeriods',week()+'_'+testerUid),{uid:testerUid,period:week(),...counters},{merge:true});
 if(!skip.includes('month'))batch.set(doc(d,'xpPeriods',month()+'_'+testerUid),{uid:testerUid,period:month(),...counters},{merge:true});
 if(!skip.includes('ledger'))batch.set(doc(d,'xpAssignments',assignmentId),{testerUid,ownerUid,projectId,...counters},{merge:true});
 return batch;
}
const reviewEvent=(day,kind='report')=>({id:`p1_t1_${day}_review`,kind,reportId:`p1_t1_${day}`});
const totals=async()=>(await env.withSecurityRulesDisabled(async c=>(await getDoc(doc(c.firestore(),'xpTotals','t1'))).data()));

test('developer awards 10 XP for an accepted daily report and every total moves together',async()=>{
 await assertSucceeds(awardBatch('d1',reviewEvent('2026-01-01')).commit());
 const t=await totals();
 assert.equal(t.points,10);assert.equal(t.reports,1);assert.equal(t.apps,1);assert.equal(t.bugs,0);
 const w=await env.withSecurityRulesDisabled(async c=>(await getDoc(doc(c.firestore(),'xpPeriods',week()+'_t1'))).data());
 assert.equal(w.points,10);
});
test('the tester can record the same proven reward, so a failed developer write is recovered',async()=>{
 await assertSucceeds(awardBatch('t1',reviewEvent('2026-01-01')).commit());
});
test('the same reward cannot be paid twice',async()=>{
 await assertSucceeds(awardBatch('d1',reviewEvent('2026-01-01')).commit());
 await assertFails(awardBatch('d1',{...reviewEvent('2026-01-01'),first:false}).commit());
 await assertFails(awardBatch('t1',{...reviewEvent('2026-01-01'),first:false}).commit());
 assert.equal((await totals()).points,10);
});
test('no points for unreviewed, rejected or clarification-requested reports',async()=>{
 for(const day of ['2026-01-03','2026-01-05','2026-01-06'])await assertFails(awardBatch('d1',reviewEvent(day)).commit());
});
test('an accepted problem report is worth 20 as a bug, and kinds cannot be swapped',async()=>{
 await assertFails(awardBatch('d1',reviewEvent('2026-01-02','report')).commit());
 await assertFails(awardBatch('d1',reviewEvent('2026-01-01','bug')).commit());
 await assertSucceeds(awardBatch('d1',reviewEvent('2026-01-02','bug')).commit());
 assert.equal((await totals()).points,20);
});
test('points per kind are fixed',async()=>{
 await assertFails(awardBatch('d1',{...reviewEvent('2026-01-01'),points:100,bump:100}).commit());
 await assertFails(awardBatch('d1',{...reviewEvent('2026-01-01'),bump:20}).commit());
});
test('a retest is rewarded once per fixed problem and only under its own id',async()=>{
 await assertFails(awardBatch('d1',{id:'p1_t1_2026-01-04_retest',kind:'retest',reportId:'p1_t1_2026-01-04'}).commit());
 await assertFails(awardBatch('d1',{id:'p1_t1_2026-01-02_retest',kind:'retest',reportId:'p1_t1_2026-01-01'}).commit());
 await assertSucceeds(awardBatch('d1',{id:'p1_t1_2026-01-02_retest',kind:'retest',reportId:'p1_t1_2026-01-04'}).commit());
 await assertFails(awardBatch('t1',{id:'p1_t1_2026-01-02_retest',kind:'retest',reportId:'p1_t1_2026-01-04',first:false}).commit());
});
test('outsiders cannot award points on someone else\'s assignment',async()=>{
 await assertFails(awardBatch('t2',reviewEvent('2026-01-01')).commit());
 await assertFails(awardBatch('d2',reviewEvent('2026-01-01')).commit());
 await assertFails(awardBatch('d1',{...reviewEvent('2026-01-01'),testerUid:'t2'}).commit());
});
test('unverified accounts cannot award',async()=>{
 const d=db('t1',false),batch=writeBatch(d);
 batch.set(doc(d,'contributions','p1_t1_2026-01-01_review'),{kind:'report',points:10,testerUid:'t1',ownerUid:'d1',projectId:'p1',assignmentId:'p1_t1',reportId:'p1_t1_2026-01-01',awardedBy:'t1',week:week(),month:month(),createdAt:serverTimestamp()});
 await assertFails(batch.commit());
});
test('totals cannot be edited, created or bumped without a new event',async()=>{
 await assertFails(setDoc(doc(db('t1'),'xpTotals','t1'),{uid:'t1',points:1000,reports:0,bugs:0,retests:0,cycles:0,apps:0,lastEventId:'x',updatedAt:serverTimestamp()}));
 await assertSucceeds(awardBatch('d1',reviewEvent('2026-01-01')).commit());
 await assertFails(updateDoc(doc(db('t1'),'xpTotals','t1'),{points:increment(500)}));
 await assertFails(updateDoc(doc(db('t1'),'xpTotals','t1'),{points:increment(10),reports:increment(1),lastEventId:'p1_t1_2026-01-01_review',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db('d1'),'xpPeriods',week()+'_t1'),{points:increment(10)}));
 await assertFails(updateDoc(doc(db('t1'),'xpAssignments','p1_t1'),{points:increment(10)}));
 assert.equal((await totals()).points,10);
});
test('an app helped is counted once per assignment',async()=>{
 await assertSucceeds(awardBatch('d1',reviewEvent('2026-01-01')).commit());
 await assertFails(awardBatch('d1',{...reviewEvent('2026-01-02','bug'),first:true}).commit());
 await assertSucceeds(awardBatch('d1',{...reviewEvent('2026-01-02','bug'),first:false}).commit());
 const t=await totals();assert.equal(t.apps,1);assert.equal(t.points,30);
});
test('event period keys must be the server week and month',async()=>{
 await assertFails(awardBatch('d1',{...reviewEvent('2026-01-01'),eventWeek:'W1'}).commit());
 await assertFails(awardBatch('d1',{...reviewEvent('2026-01-01'),eventMonth:'M190001'}).commit());
});
test('cycle bonus needs 14 reported days and at least 7 accepted reports',async()=>{
 const seedLedger=n=>env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'xpAssignments','p1_t1'),{testerUid:'t1',ownerUid:'d1',projectId:'p1',points:n*10,reports:n,bugs:0,retests:0,cycles:0,lastEventId:'seed',updatedAt:Timestamp.now()}));
 const cycle={id:'p1_t1_cycle',kind:'cycle',first:false};
 await assertFails(awardBatch('t1',{...cycle,first:true}).commit());
 await seedLedger(6);
 await assertFails(awardBatch('t1',cycle).commit());
 await seedLedger(7);
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'assignments','p1_t1'),{checkins:days(13)}));
 await assertFails(awardBatch('t1',cycle).commit());
 await env.withSecurityRulesDisabled(async c=>updateDoc(doc(c.firestore(),'assignments','p1_t1'),{checkins:days(14)}));
 await assertFails(awardBatch('t1',{...cycle,id:'other_cycle'}).commit());
 await assertSucceeds(awardBatch('t1',cycle).commit());
 await assertFails(awardBatch('d1',cycle).commit());
});
test('an accepted review is final, a clarification can still be accepted',async()=>{
 await assertFails(updateDoc(doc(db('d1'),'reports','p1_t1_2026-01-01'),{reviewStatus:'rejected',reviewedAt:serverTimestamp(),reviewerUid:'d1'}));
 await assertSucceeds(updateDoc(doc(db('d1'),'reports','p1_t1_2026-01-06'),{reviewStatus:'accepted',reviewedAt:serverTimestamp(),reviewerUid:'d1'}));
 await assertSucceeds(updateDoc(doc(db('d1'),'reports','p1_t1_2026-01-05'),{reviewStatus:'accepted',reviewedAt:serverTimestamp(),reviewerUid:'d1'}));
});
test('totals are readable by signed-in members, events stay private to the two parties',async()=>{
 await assertSucceeds(awardBatch('d1',reviewEvent('2026-01-01')).commit());
 await assertSucceeds(getDoc(doc(db('t2'),'xpTotals','t1')));
 await assertSucceeds(getDoc(doc(db('t2'),'xpPeriods',week()+'_t1')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'xpTotals','t1')));
 await assertSucceeds(getDoc(doc(db('t1'),'contributions','p1_t1_2026-01-01_review')));
 await assertFails(getDoc(doc(db('d2'),'contributions','p1_t1_2026-01-01_review')));
 await assertFails(getDoc(doc(db('t2'),'xpAssignments','p1_t1')));
 // Checking whether an event exists yet is allowed, so a client can avoid a failing duplicate write.
 await assertSucceeds(getDoc(doc(db('d1'),'contributions','p1_t1_2026-01-03_review')));
});

// Retest links on new reports.
async function seedActive(){
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();
  await setDoc(doc(d,'projects','p2'),{ownerUid:'d1',name:'App 2',link:'https://play.google.com/apps/testing/com.example.two'});
  await setDoc(doc(d,'assignments','p2_t1'),{ownerUid:'d1',testerUid:'t1',projectId:'p2',joinedDay:new Date().toISOString().slice(0,10),joinedAt:Timestamp.now(),checkins:[]});
  await setDoc(doc(d,'reports','p2_t1_2026-01-01'),{...base,assignmentId:'p2_t1',projectId:'p2',date:'2026-01-01',outcome:'issue',notes:'Fixed problem',status:'fixed'});
  await setDoc(doc(d,'reports','p2_t1_2026-01-02'),{...base,assignmentId:'p2_t1',projectId:'p2',date:'2026-01-02',outcome:'issue',notes:'Still open',status:'new'});
 });
}
function retestBatch(retestOf){
 const d=db('t1'),day=new Date().toISOString().slice(0,10),batch=writeBatch(d);
 batch.set(doc(d,'reports',`p2_t1_${day}`),{...base,assignmentId:'p2_t1',projectId:'p2',date:day,outcome:'ok',notes:'Retested the fixed problem',status:'ok',createdAt:new Date().toISOString(),submittedAt:serverTimestamp(),retestOf});
 batch.update(doc(d,'assignments','p2_t1'),{checkins:[day],lastCheckinAt:serverTimestamp()});
 return batch;
}
test('a report may retest only a fixed problem of the same assignment',async()=>{
 await seedActive();
 await assertFails(retestBatch('p2_t1_2026-01-02').commit());
 await assertFails(retestBatch('p1_t1_2026-01-02').commit());
 await assertSucceeds(retestBatch('p2_t1_2026-01-01').commit());
});
