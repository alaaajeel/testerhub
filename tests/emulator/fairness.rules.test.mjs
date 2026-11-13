import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,updateDoc,deleteDoc,collection,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';
import {allowPublish,publishBatch,publishDraftBatch} from './publish-helper.mjs';

// V2 phase 2 (fairness), attacked from the browser:
//  - test before you publish: each new live app needs 3 more accepted reports than the last publish used
//  - one live app per developer; it can be ended 14 days after it went live
//  - apps that were live before this change keep working untouched
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
const db=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:verified}).firestore();
const LINK='https://play.google.com/apps/testing/com.fair.app',TASK='Test login screen';
const DAY=86400000,ago=n=>Timestamp.fromMillis(Date.now()-n*DAY);
const app=(ownerUid='d1',extra={})=>({name:'App',link:LINK,tasks:[TASK],ownerUid,ownerName:'User '+ownerUid,createdAt:serverTimestamp(),testersCount:1,selectedTesterUids:['t1'],...extra});
const admin=fn=>env.withSecurityRulesDisabled(c=>fn(c.firestore()));
const read=async(...path)=>{let data;await admin(async d=>{data=(await getDoc(doc(d,...path))).data()});return data};
const setTotals=(uid,reports,bugs=0)=>admin(d=>setDoc(doc(d,'xpTotals',uid),{uid,points:reports*10+bugs*20,reports,bugs,retests:0,cycles:0,apps:1}));

beforeEach(async()=>{
 await env.clearFirestore();
 await admin(async d=>{
  for(const [uid,role,available] of [['t1','tester',true],['d1','developer',false],['d2','developer',false]])
   await setDoc(doc(d,'users',uid),{name:'User '+uid,email:uid+'@example.com',role,available,createdAt:serverTimestamp()});
 });
});

test('no accepted reports, no live app; a draft is always fine',async()=>{
 const d=db('d1');
 await assertFails(publishBatch(d,'d1','a1',app()).commit());
 await setTotals('d1',2);
 await assertFails(publishBatch(d,'d1','a1',app()).commit(),'2 of 3 is not enough');
 await assertSucceeds(setDoc(doc(d,'projects','draft'),app('d1',{status:'draft',link:'',tasks:[],testersCount:0,selectedTesterUids:[]})));
});
test('3 accepted reports (problem reports count) publish exactly one app together with the slot',async()=>{
 const d=db('d1');
 await setTotals('d1',1,2);
 await assertFails(setDoc(doc(d,'projects','a1'),app()),'the app alone, without its slot');
 await assertSucceeds(publishBatch(d,'d1','a1',app()).commit());
 const slot=await read('publishSlots','d1');
 assert.equal(slot.projectId,'a1');assert.equal(slot.acceptedAtPublish,3);
});
test('the slot cannot claim a different cost, and the next app needs 3 more',async()=>{
 const d=db('d1');
 await setTotals('d1',9);
 for(const cost of [0,1,2,4,6])await assertFails(publishBatch(d,'d1','a1',app(),cost).commit(),'cost '+cost);
 await assertSucceeds(publishBatch(d,'d1','a1',app(),3).commit());
 await admin(d=>updateDoc(doc(d,'projects','a1'),{status:'completed'}));
 await assertFails(publishBatch(d,'d1','a2',app(),3).commit(),'reusing the same 3 reports');
 await assertSucceeds(publishBatch(d,'d1','a2',app(),6).commit());
 await admin(d=>updateDoc(doc(d,'projects','a2'),{status:'completed'}));
 await setTotals('d1',8);
 await assertFails(publishBatch(d,'d1','a3',app(),9).commit(),'8 accepted reports cannot pay for the third app');
});
test('one live app: a second is refused until the first is no longer live',async()=>{
 const d=db('d1');
 await setTotals('d1',30);
 await assertSucceeds(publishBatch(d,'d1','a1',app()).commit());
 await assertFails(publishBatch(d,'d1','a2',app(),6).commit());
 // Two apps in one write with one slot: the slot names only one of them.
 const two=writeBatch(d);
 two.set(doc(d,'projects','x1'),app());two.set(doc(d,'projects','x2'),app());
 two.set(doc(d,'publishSlots','d1'),{projectId:'x1',acceptedAtPublish:6,updatedAt:serverTimestamp()});
 await assertFails(two.commit());
 // Deleting the live app frees the slot (its testers lose that app, so it is a real cost).
 await assertSucceeds(updateDoc(doc(d,'projects','a1'),{status:'deleting'}));
 await assertSucceeds(publishBatch(d,'d1','a2',app(),6).commit());
});
test('a draft goes live only with the slot',async()=>{
 const d=db('d1');
 await setTotals('d1',3);
 await setDoc(doc(d,'projects','dr'),app('d1',{status:'draft',link:'',tasks:[],testersCount:0,selectedTesterUids:[]}));
 const live={status:'recruiting',link:LINK,tasks:[TASK],testersCount:1,selectedTesterUids:['t1']};
 await assertFails(updateDoc(doc(d,'projects','dr'),live));
 await assertSucceeds(publishDraftBatch(d,'d1','dr',live).commit());
});
test('the slot is private and only its owner moves it, to their own live app',async()=>{
 await setTotals('d1',3);await setTotals('d2',3);
 await assertSucceeds(publishBatch(db('d1'),'d1','a1',app()).commit());
 await assertSucceeds(getDoc(doc(db('d1'),'publishSlots','d1')));
 for(const uid of ['d2','t1'])await assertFails(getDoc(doc(db(uid),'publishSlots','d1')));
 await assertFails(getDocs(collection(db('d1'),'publishSlots')));
 await assertFails(deleteDoc(doc(db('d1'),'publishSlots','d1')),'deleting would reset the count');
 // Pointing your slot at someone else's live app, or writing someone else's slot.
 await assertFails(setDoc(doc(db('d2'),'publishSlots','d2'),{projectId:'a1',acceptedAtPublish:3,updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('d2'),'publishSlots','d1'),{projectId:'a1',acceptedAtPublish:6,updatedAt:serverTimestamp()}));
 // Extra fields, a client time, or the tester view.
 await allowPublish(env,'d2');
 const slotWith=fields=>{const x=db('d2'),b=writeBatch(x);b.set(doc(x,'projects','b1'),app('d2'));b.set(doc(x,'publishSlots','d2'),{projectId:'b1',acceptedAtPublish:3,updatedAt:serverTimestamp(),...fields});return b.commit()};
 await assertFails(slotWith({updatedAt:Timestamp.fromMillis(Date.now()-20*DAY)}),'a back-dated slot would allow ending at once');
 await assertFails(slotWith({bonus:true}),'extra fields');
 // V2 one account: the stored role is not a gate; the fairness limits still apply to every account.
 await admin(d=>updateDoc(doc(d,'users','d2'),{role:'tester'}));
 await assertSucceeds(publishBatch(db('d2'),'d2','b2',app('d2')).commit());
 await assertFails(publishBatch(db('d2'),'d2','b3',app('d2')).commit(),'a second live app, or the same reports used twice');
});
test('accepted reports cannot be typed in',async()=>{
 await assertFails(setDoc(doc(db('d1'),'xpTotals','d1'),{uid:'d1',points:30,reports:3,bugs:0,retests:0,cycles:0,apps:1,lastEventId:'x',updatedAt:serverTimestamp()}));
 await assertFails(publishBatch(db('d1'),'d1','a1',app()).commit());
});
test('ending a live app: owner only, status only, not before 14 days from going live',async()=>{
 const d=db('d1'),ref=doc(d,'projects','a1');
 await setTotals('d1',3);
 await assertSucceeds(publishBatch(d,'d1','a1',app()).commit());
 await assertFails(updateDoc(ref,{status:'completed'}),'day 0');
 await admin(x=>updateDoc(doc(x,'publishSlots','d1'),{updatedAt:ago(13)}));
 await assertFails(updateDoc(ref,{status:'completed'}),'day 13');
 await admin(x=>updateDoc(doc(x,'publishSlots','d1'),{updatedAt:ago(14.1)}));
 await assertFails(updateDoc(doc(db('d2'),'projects','a1'),{status:'completed'}),'another developer');
 await assertFails(updateDoc(ref,{status:'completed',name:'Renamed'}),'with another field');
 await assertFails(updateDoc(ref,{status:'paused'}),'any other status');
 await assertSucceeds(updateDoc(ref,{status:'completed'}));
 await assertFails(updateDoc(ref,{status:'recruiting'}),'cannot come back to life');
 await setTotals('d1',6);
 await assertSucceeds(publishBatch(d,'d1','a2',app(),6).commit());
});
test('an old live app with no slot keeps working and can be ended 14 days after creation',async()=>{
 await admin(async x=>{
  await setDoc(doc(x,'projects','old'),{name:'Old',link:LINK,tasks:[TASK],ownerUid:'d1',ownerName:'User d1',createdAt:ago(30),testersCount:1,selectedTesterUids:['t1']});
  await setDoc(doc(x,'projects','young'),{name:'Young',link:LINK,tasks:[TASK],ownerUid:'d1',ownerName:'User d1',createdAt:ago(2),testersCount:1,selectedTesterUids:['t1']});
 });
 const d=db('d1');
 await assertSucceeds(updateDoc(doc(d,'projects','old'),{groupLink:'https://groups.google.com/g/old-app'}));
 await assertSucceeds(setDoc(doc(d,'assignments','old_t1'),{projectId:'old',testerUid:'t1',ownerUid:'d1',name:'Old',link:LINK,tasks:[TASK],groupLink:'https://groups.google.com/g/old-app',invitationStatus:'pending',joinedDay:null,checkins:[],createdAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(d,'projects','young'),{status:'completed'}));
 await assertSucceeds(updateDoc(doc(d,'projects','old'),{status:'completed'}));
});
test('after ending, started testers keep reporting but nobody new is invited',async()=>{
 const day=new Date().toISOString().slice(0,10);
 await admin(async x=>{
  await setDoc(doc(x,'users','t2'),{name:'User t2',email:'t2@example.com',role:'tester',available:true,createdAt:serverTimestamp()});
  await setDoc(doc(x,'projects','done'),{name:'Done',link:LINK,tasks:[TASK],ownerUid:'d1',ownerName:'User d1',createdAt:ago(20),testersCount:2,selectedTesterUids:['t1','t2'],status:'completed'});
  await setDoc(doc(x,'assignments','done_t1'),{projectId:'done',testerUid:'t1',ownerUid:'d1',name:'Done',link:LINK,tasks:[TASK],invitationStatus:'accepted',joinedDay:day,joinedAt:Timestamp.now(),checkins:[],createdAt:ago(3)});
 });
 const t=db('t1'),aRef=doc(t,'assignments','done_t1'),b=writeBatch(t);
 b.set(doc(t,'reports','done_t1_'+day),{assignmentId:'done_t1',projectId:'done',testerUid:'t1',ownerUid:'d1',date:day,tested:TASK,outcome:'ok',notes:'Logged in and it worked',status:'ok',createdAt:new Date().toISOString(),submittedAt:serverTimestamp()});
 b.update(aRef,{checkins:[day],lastCheckinAt:serverTimestamp()});
 await assertSucceeds(b.commit());
 await assertFails(setDoc(doc(db('d1'),'assignments','done_t2'),{projectId:'done',testerUid:'t2',ownerUid:'d1',name:'Done',link:LINK,tasks:[TASK],invitationStatus:'pending',joinedDay:null,checkins:[],createdAt:serverTimestamp()}));
});
