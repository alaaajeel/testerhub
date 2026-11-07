import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,deleteDoc,collection,query,where,orderBy,limit,documentId,getCountFromServer,serverTimestamp,Timestamp} from 'firebase/firestore';

// Phase 3 league: members read the ranking; names appear only by their owner's choice.
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
const db=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:verified}).firestore();
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  for(const [uid,role] of [['t1','tester'],['t2','tester'],['d1','developer']])
   await setDoc(doc(d,'users',uid),{name:'Name '+uid,email:uid+'@example.com',role,available:false});
  for(const [uid,points] of [['t1',30],['t2',50],['d1',10]]){
   const row={uid,points,reports:points/10,bugs:0,retests:0,cycles:0,lastEventId:'seed',updatedAt:Timestamp.now()};
   await setDoc(doc(d,'xpPeriods','W1_'+uid),{...row,period:'W1'});
   await setDoc(doc(d,'xpTotals',uid),{...row,apps:1});
  }
 });
});
test('members can read the weekly ranking, its count and totals; guests and unverified cannot',async()=>{
 const q=query(collection(db('t1'),'xpPeriods'),where('period','==','W1'),orderBy('points','desc'),limit(20));
 const top=await assertSucceeds(getDocs(q));
 assert.deepEqual(top.docs.map(x=>x.data().uid),['t2','t1','d1']);
 const ahead=await assertSucceeds(getCountFromServer(query(collection(db('t1'),'xpPeriods'),where('period','==','W1'),where('points','>',30))));
 assert.equal(ahead.data().count,1);
 await assertSucceeds(getDocs(query(collection(db('t1'),'xpTotals'),where(documentId(),'in',['t1','t2']))));
 await assertFails(getDocs(query(collection(env.unauthenticatedContext().firestore(),'xpPeriods'),where('period','==','W1'))));
 await assertFails(getDocs(query(collection(db('t1',false),'xpPeriods'),where('period','==','W1'))));
});
test('a member may publish only their own current profile name',async()=>{
 await assertSucceeds(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Someone Famous',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1'),'publicProfiles','t2'),{name:'Name t2',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',email:'t1@example.com',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1',false),'publicProfiles','t1'),{name:'Name t1',updatedAt:serverTimestamp()}));
});
test('names are readable by members and removable only by their owner',async()=>{
 await assertSucceeds(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',updatedAt:serverTimestamp()}));
 assert.equal((await assertSucceeds(getDoc(doc(db('t2'),'publicProfiles','t1')))).data().name,'Name t1');
 await assertFails(deleteDoc(doc(db('t2'),'publicProfiles','t1')));
 await assertSucceeds(deleteDoc(doc(db('t1'),'publicProfiles','t1')));
});
test('nobody can write ranking rows directly',async()=>{
 await assertFails(setDoc(doc(db('t1'),'xpPeriods','W1_t1'),{uid:'t1',period:'W1',points:9999,reports:0,bugs:0,retests:0,cycles:0,lastEventId:'seed',updatedAt:serverTimestamp()}));
 await assertFails(deleteDoc(doc(db('t1'),'xpPeriods','W1_t2')));
 await assertFails(deleteDoc(doc(db('t1'),'xpTotals','t1')));
});

test('a member may add a small photo and hide or show themselves; nothing else fits',async()=>{
 const photo='data:image/webp;base64,'+'A'.repeat(2000);
 await assertSucceeds(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',photo,hidden:false,updatedAt:serverTimestamp()}));
 await assertSucceeds(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',photo,hidden:true,updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',photo:'https://evil.example/x.png',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',photo:'data:image/svg+xml;base64,AAAA',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',photo:'data:image/jpeg;base64,'+'A'.repeat(40000),updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',hidden:'no',updatedAt:serverTimestamp()}));
 await assertSucceeds(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',photo,consent:true,updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1'),'publicProfiles','t1'),{name:'Name t1',consent:'yes',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t2'),'publicProfiles','t1'),{name:'Name t1',photo,updatedAt:serverTimestamp()}));
});
