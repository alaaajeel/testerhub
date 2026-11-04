import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,serverTimestamp,writeBatch,Timestamp} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
const db=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:verified}).firestore();
const profile=(uid,role='tester')=>({name:'Test User',email:uid+'@example.com',role,available:false,createdAt:serverTimestamp(),termsAcceptedAt:serverTimestamp()});
const utcDay=()=>new Date().toISOString().slice(0,10);
// p1_t1 is an existing pre-marketplace invitation record: production data must keep working.
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();for(const [uid,role] of [['t1','tester'],['t2','tester'],['d1','developer'],['d2','developer']])await setDoc(doc(d,'users',uid),profile(uid,role));await setDoc(doc(d,'projects','p1'),{ownerUid:'d1',name:'App',link:'https://play.google.com/apps/testing/x'});await setDoc(doc(d,'assignments','p1_t1'),{ownerUid:'d1',testerUid:'t1',projectId:'p1',joinedDay:null,checkins:[]});})});
test('anonymous access denied',async()=>assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'users','t1'))));
test('unverified user can create and recover their own profile',async()=>assertSucceeds(setDoc(doc(db('new',false),'users','new'),profile('new'))));
test('profile requires recorded terms acceptance',async()=>{const {termsAcceptedAt,...withoutTerms}=profile('new');await assertFails(setDoc(doc(db('new'),'users','new'),withoutTerms))});
test('cannot create admin profile or forge email',async()=>{await assertFails(setDoc(doc(db('new'),'users','new'),profile('new','admin')));await assertFails(setDoc(doc(db('new'),'users','new'),{...profile('new'),email:'other@example.com'}))});
test('profile fields cannot grant admin or change UID identity',async()=>{await assertFails(updateDoc(doc(db('t1'),'users','t1'),{role:'admin'}));await assertFails(updateDoc(doc(db('t1'),'users','t1'),{uid:'t2'}));await assertFails(updateDoc(doc(db('t1'),'users','t1'),{email:'other@example.com'}))});
test('both roles can rename their own profile',async()=>{for(const uid of ['t1','d1'])await assertSucceeds(updateDoc(doc(db(uid),'users',uid),{name:'Updated Name'}))});
test('cannot rename other users or erase existing profiles',async()=>{await assertFails(updateDoc(doc(db('t1'),'users','t2'),{name:'Changed'}));await assertFails(deleteDoc(doc(db('t1'),'users','t1')))});
test('developers remain isolated and testers cannot read peers',async()=>{await assertFails(getDoc(doc(db('d2'),'projects','p1')));await assertFails(getDoc(doc(db('t2'),'assignments','p1_t1')));await assertFails(getDoc(doc(db('t1'),'users','t2')))});
test('unverified tester cannot start assignment',async()=>assertFails(updateDoc(doc(db('t1',false),'assignments','p1_t1'),{joinedDay:utcDay(),joinedAt:serverTimestamp()})));
test('verified tester can start own legacy assignment on server UTC day',async()=>assertSucceeds(updateDoc(doc(db('t1'),'assignments','p1_t1'),{joinedDay:utcDay(),joinedAt:serverTimestamp()})));
test('tester cannot forge start date from another day',async()=>assertFails(updateDoc(doc(db('t1'),'assignments','p1_t1'),{joinedDay:'2000-01-01',joinedAt:serverTimestamp()})));
test('daily report binds one UTC day to an atomic assignment checkin',async()=>{
 const d=db('t1'),assignmentRef=doc(d,'assignments','p1_t1'),day=utcDay();
 await assertSucceeds(updateDoc(assignmentRef,{joinedDay:day,joinedAt:serverTimestamp()}));
 const report={assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',tested:'فتح التطبيق وتجربة وظيفة أساسية',outcome:'ok',notes:'Worked as expected',status:'ok',createdAt:new Date().toISOString(),submittedAt:serverTimestamp()};
 const write=(date)=>{const batch=writeBatch(d);batch.set(doc(d,'reports',`p1_t1_${date}`),{...report,date});batch.update(assignmentRef,{checkins:[date],lastCheckinAt:serverTimestamp()});return batch.commit()};
 await assertFails(write('2000-01-01'));
 await assertSucceeds(write(day));
 await assertFails(write(day));
 await assertFails(setDoc(doc(d,'reports','p1_t1_other'),{...report,date:day}));
});
test('fake tasks are rejected: a report must name an assigned task',async()=>{
 const t=db('t1'),day=utcDay();
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'assignments','taskp_t1'),{projectId:'p1',testerUid:'t1',ownerUid:'d1',tasks:['Test search'],invitationStatus:'accepted',joinedDay:day,joinedAt:new Date(),checkins:[]}));
 const ref=doc(t,'assignments','taskp_t1'),report={assignmentId:'taskp_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',date:day,tested:'Fake task',outcome:'ok',notes:'Tried this flow',status:'ok',createdAt:new Date().toISOString(),submittedAt:serverTimestamp()};
 const send=r=>{const b=writeBatch(t);b.set(doc(t,'reports','taskp_t1_'+day),r);b.update(ref,{checkins:[day],lastCheckinAt:serverTimestamp()});return b.commit()};
 await assertFails(send(report));
 await assertSucceeds(send({...report,tested:'Test search'}));
});
test('declining a legacy invitation blocks participation and preserves the assignment',async()=>{
 await env.withSecurityRulesDisabled(async c=>setDoc(doc(c.firestore(),'assignments','invite_t1'),{projectId:'p1',testerUid:'t1',ownerUid:'d1',invitationStatus:'pending',joinedDay:null,checkins:[],createdAt:Timestamp.now()}));
 const ref=doc(db('t1'),'assignments','invite_t1');
 await assertSucceeds(updateDoc(ref,{invitationStatus:'declined',respondedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{invitationStatus:'accepted',respondedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{joinedDay:utcDay(),joinedAt:serverTimestamp()}));
 await assertFails(deleteDoc(ref));
});
test('expired invitation cannot be accepted after seven server days',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>setDoc(doc(ctx.firestore(),'assignments','old_t1'),{projectId:'p1',testerUid:'t1',ownerUid:'d1',invitationStatus:'pending',joinedDay:null,checkins:[],createdAt:Timestamp.fromDate(new Date(Date.now()-8*86400000))}));
 await assertFails(updateDoc(doc(db('t1'),'assignments','old_t1'),{invitationStatus:'accepted',respondedAt:serverTimestamp()}));
});
test('message document is create-only and scoped to assignment participants',async()=>{
 const sender=db('t1'),owner=db('d1'),other=db('d2'),ref=doc(sender,'messages','stable-retry-id');
 const message={assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',sender:'tester',senderUid:'t1',text:'اختبرت التطبيق اليوم',at:new Date().toISOString(),createdAt:serverTimestamp()};
 await assertSucceeds(setDoc(ref,message));
 await assertFails(setDoc(ref,message));
 await assertSucceeds(getDoc(doc(owner,'messages','stable-retry-id')));
 await assertFails(getDoc(doc(other,'messages','stable-retry-id')));
 await assertFails(setDoc(doc(other,'messages','forged'),{...message,sender:'developer',senderUid:'d2'}));
});
