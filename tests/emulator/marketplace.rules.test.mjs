import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,updateDoc,deleteDoc,collection,query,where,getDocs,serverTimestamp,writeBatch} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
const db=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:verified}).firestore();
const LINK='https://play.google.com/apps/testing/com.audit.app';
const listing={name:'App',link:LINK,tasks:['Test login screen'],description:'A delivery app',listed:true,testersWanted:15,status:'recruiting',ownerUid:'d1',ownerName:'Dev One'};
const application=(uid='t1',over={})=>({projectId:'p1',projectName:'App',ownerUid:'d1',testerUid:uid,testerName:'Tester',testerEmail:uid+'@gmail.com',device:'Pixel 7',note:'',status:'pending',createdAt:serverTimestamp(),...over});
const assignmentDoc=(uid='t1',over={})=>({projectId:'p1',testerUid:uid,ownerUid:'d1',name:'App',link:LINK,tasks:listing.tasks,source:'application',invitationStatus:'accepted',testerName:'Tester',testerEmail:uid+'@gmail.com',joinedDay:null,checkins:[],createdAt:serverTimestamp(),...over});
const approve=(d,uid='t1')=>{const b=writeBatch(d);b.update(doc(d,'applications','p1_'+uid),{status:'approved',decidedAt:serverTimestamp()});b.set(doc(d,'assignments','p1_'+uid),assignmentDoc(uid));return b.commit()};
const today=()=>new Date().toISOString().slice(0,10);
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async ctx=>{const d=ctx.firestore();
 for(const [uid,role,name] of [['t1','tester','Tester'],['t2','tester','Tester'],['d1','developer','Dev One'],['d2','developer','Dev Two']])await setDoc(doc(d,'users',uid),{name,email:uid+'@example.com',role,available:false,createdAt:serverTimestamp()});
 await setDoc(doc(d,'projects','p1'),listing);
 await setDoc(doc(d,'projects','hidden'),{...listing,listed:false});
 await setDoc(doc(d,'projects','draft'),{...listing,status:'draft'});
})});
test('no developer can browse tester emails any more',async()=>{
 await assertFails(getDocs(query(collection(db('d1'),'users'),where('role','==','tester'),where('available','==',true))));
 await assertFails(getDoc(doc(db('d1'),'users','t1')));
});
test('verified users see only open listings',async()=>{
 const q=d=>query(collection(d,'projects'),where('status','==','recruiting'),where('listed','==',true));
 await assertSucceeds(getDocs(q(db('t1'))));
 await assertFails(getDocs(q(db('t1',false))));
 await assertSucceeds(getDoc(doc(db('t1'),'projects','p1')));
 await assertFails(getDoc(doc(db('t1'),'projects','hidden')));
 await assertFails(getDoc(doc(db('t1'),'projects','draft')));
 await assertFails(getDocs(collection(db('t1'),'projects')));
});
test('a tester applies only for themself to an open listing',async()=>{
 const t=db('t1');
 await assertFails(setDoc(doc(db('t1',false),'applications','p1_t1'),application()));
 await assertFails(setDoc(doc(t,'applications','p1_t2'),application('t2')));
 await assertFails(setDoc(doc(t,'applications','hidden_t1'),application('t1',{projectId:'hidden'})));
 await assertFails(setDoc(doc(t,'applications','p1_t1'),application('t1',{status:'approved'})));
 await assertFails(setDoc(doc(t,'applications','p1_t1'),application('t1',{ownerUid:'d2'})));
 await assertFails(setDoc(doc(t,'applications','p1_t1'),application('t1',{testerEmail:'not-an-email'})));
 await assertFails(setDoc(doc(db('d2'),'applications','p1_d2'),application('d2')));
 await assertSucceeds(setDoc(doc(t,'applications','p1_t1'),application()));
});
test('application email reaches the owning developer only',async()=>{
 await assertSucceeds(setDoc(doc(db('t1'),'applications','p1_t1'),application()));
 await assertSucceeds(getDoc(doc(db('d1'),'applications','p1_t1')));
 await assertSucceeds(getDoc(doc(db('t1'),'applications','p1_t1')));
 await assertFails(getDoc(doc(db('d2'),'applications','p1_t1')));
 await assertFails(getDoc(doc(db('t2'),'applications','p1_t1')));
});
test('assignment exists only through an approval in the same batch',async()=>{
 await setDoc(doc(db('t1'),'applications','p1_t1'),application());
 const d=db('d1');
 await assertFails(setDoc(doc(d,'assignments','p1_t1'),assignmentDoc()));
 await assertFails(setDoc(doc(d,'assignments','p1_t2'),assignmentDoc('t2')));
 await assertFails(approve(db('d2')));
 await assertFails(updateDoc(doc(db('t1'),'applications','p1_t1'),{status:'approved'}));
 await assertSucceeds(approve(d));
 await assertFails(updateDoc(doc(d,'applications','p1_t1'),{status:'rejected',decidedAt:serverTimestamp()}));
});
test('tester cannot start before the developer records the Play Console addition',async()=>{
 await setDoc(doc(db('t1'),'applications','p1_t1'),application());
 await approve(db('d1'));
 const t=doc(db('t1'),'assignments','p1_t1'),start={joinedDay:today(),joinedAt:serverTimestamp()};
 await assertFails(updateDoc(t,start));
 await assertFails(updateDoc(t,{addedToPlayAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(db('d2'),'assignments','p1_t1'),{addedToPlayAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(doc(db('d1'),'assignments','p1_t1'),{addedToPlayAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(t,start));
});
test('a tester who left can no longer report',async()=>{
 const d=db('t1'),ref=doc(d,'assignments','p1_t1'),day=today();
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'assignments','p1_t1'),{...assignmentDoc(),joinedDay:day,joinedAt:new Date(),addedToPlayAt:new Date()}));
 await assertSucceeds(updateDoc(ref,{leftAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{leftAt:serverTimestamp()}));
 const b=writeBatch(d);b.set(doc(d,'reports','p1_t1_'+day),{assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',date:day,tested:listing.tasks[0],outcome:'ok',notes:'',status:'ok',createdAt:new Date().toISOString(),submittedAt:serverTimestamp()});b.update(ref,{checkins:[day],lastCheckinAt:serverTimestamp()});
 await assertFails(b.commit());
});
test('structured issue reports are enforced; a clean report may have no note',async()=>{
 const day=today();
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'assignments','p1_t1'),{...assignmentDoc(),joinedDay:day,joinedAt:new Date(),addedToPlayAt:new Date()}));
 const d=db('t1'),base={assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',date:day,tested:listing.tasks[0],createdAt:new Date().toISOString(),submittedAt:serverTimestamp()};
 const send=r=>{const b=writeBatch(d);b.set(doc(d,'reports','p1_t1_'+day),{...base,...r});b.update(doc(d,'assignments','p1_t1'),{checkins:[day],lastCheckinAt:serverTimestamp()});return b.commit()};
 await assertFails(send({outcome:'issue',status:'new',notes:'short'}));
 await assertFails(send({outcome:'issue',status:'new',notes:'The app crashes on login',steps:'tap login',severity:'fatal'}));
 await assertFails(send({outcome:'issue',status:'new',notes:'The app crashes on login'}));
 await assertSucceeds(send({outcome:'issue',status:'new',notes:'The app crashes on login',steps:'Open app, tap login',expected:'Home screen',severity:'high',device:'Pixel 7'}));
});
test('bug lifecycle: developer resolves, tester confirms or reopens',async()=>{
 await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'reports','r1'),{outcome:'issue',status:'new',ownerUid:'d1',testerUid:'t1',projectId:'p1',assignmentId:'p1_t1'}));
 const dev=doc(db('d1'),'reports','r1'),tester=doc(db('t1'),'reports','r1'),set=status=>({status,statusAt:serverTimestamp()});
 await assertFails(updateDoc(tester,set('verified')));
 await assertFails(updateDoc(dev,set('verified')));
 await assertFails(updateDoc(doc(db('d2'),'reports','r1'),set('fixed')));
 await assertSucceeds(updateDoc(dev,set('fixed')));
 await assertFails(updateDoc(dev,set('wontfix')));
 await assertSucceeds(updateDoc(tester,set('reopened')));
 await assertSucceeds(updateDoc(dev,set('fixed')));
 await assertSucceeds(updateDoc(tester,set('verified')));
 await assertFails(updateDoc(tester,set('reopened')));
});
test('developer manages recruiting after publishing with valid transitions only',async()=>{
 const d=doc(db('d1'),'projects','p1');
 await assertFails(updateDoc(doc(db('d2'),'projects','p1'),{status:'paused'}));
 await assertFails(updateDoc(d,{ownerUid:'d2'}));
 await assertFails(updateDoc(d,{status:'archived'}));
 await assertFails(updateDoc(d,{link:'https://example.com/x'}));
 await assertSucceeds(updateDoc(d,{status:'paused'}));
 await assertSucceeds(updateDoc(d,{status:'recruiting',testersWanted:20,description:'Updated'}));
 await assertSucceeds(updateDoc(d,{status:'completed'}));
 await assertFails(updateDoc(d,{status:'paused'}));
});
test('only unpublished drafts can be discarded',async()=>{
 await assertFails(deleteDoc(doc(db('d2'),'projects','draft')));
 await assertFails(deleteDoc(doc(db('d1'),'projects','p1')));
 await assertSucceeds(deleteDoc(doc(db('d1'),'projects','draft')));
});
test('publishing requires a Play link and at least one task',async()=>{
 const d=db('d1'),base={...listing,ownerUid:'d1',ownerName:'Dev One',createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(d,'projects','a'),{...base,link:'https://evil.example/x'}));
 await assertFails(setDoc(doc(d,'projects','b'),{...base,tasks:[]}));
 await assertFails(setDoc(doc(d,'projects','c'),{...base,ownerName:'Someone else'}));
 await assertFails(setDoc(doc(db('t1'),'projects','e'),{...base,ownerUid:'t1'}));
 await assertSucceeds(setDoc(doc(d,'projects','f'),base));
 await assertSucceeds(setDoc(doc(d,'projects','g'),{...base,status:'draft',link:'',tasks:[]}));
});
test('role is a mode switch and can never become a privilege',async()=>{
 const t=doc(db('t1'),'users','t1');
 await assertFails(updateDoc(t,{role:'admin'}));
 await assertFails(updateDoc(t,{available:true}));
 await assertFails(updateDoc(t,{suspended:false}));
 await assertSucceeds(updateDoc(t,{role:'developer'}));
 await assertSucceeds(updateDoc(t,{role:'tester'}));
});
test('suspended user reads own profile only, and cannot lift the suspension',async()=>{
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'users','t1'),{suspended:true}));
 await assertSucceeds(getDoc(doc(db('t1'),'users','t1')));
 await assertFails(updateDoc(doc(db('t1'),'users','t1'),{name:'New Name'}));
 await assertFails(getDoc(doc(db('t1'),'projects','p1')));
 await assertFails(setDoc(doc(db('t1'),'applications','p1_t1'),application()));
});
test('abuse flags go to the admin queue only and cannot be forged',async()=>{
 const flag={reporterUid:'t1',targetType:'project',targetId:'p1',targetName:'App',reason:'Spam listing',status:'open',createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(db('t1'),'flags','x'),{...flag,reporterUid:'t2'}));
 await assertFails(setDoc(doc(db('t1'),'flags','x'),{...flag,reason:'no'}));
 await assertFails(setDoc(doc(db('t1',false),'flags','x'),flag));
 await assertSucceeds(setDoc(doc(db('t1'),'flags','x'),flag));
 await assertFails(getDoc(doc(db('t1'),'flags','x')));
 await assertFails(getDoc(doc(db('d1'),'flags','x')));
});
test('deletion request is self-service and admin-readable',async()=>{
 const request={email:'t1@example.com',status:'open',createdAt:serverTimestamp()};
 await assertFails(setDoc(doc(db('t2'),'deletionRequests','t1'),request));
 await assertFails(setDoc(doc(db('t1'),'deletionRequests','t1'),{...request,email:'x@example.com'}));
 await assertSucceeds(setDoc(doc(db('t1'),'deletionRequests','t1'),request));
 await assertSucceeds(getDoc(doc(db('t1'),'deletionRequests','t1')));
 await assertFails(getDoc(doc(db('t2'),'deletionRequests','t1')));
 await assertFails(updateDoc(doc(db('t1'),'deletionRequests','t1'),{status:'processed',processedAt:serverTimestamp()}));
});
