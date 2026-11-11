import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';

let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
const db=uid=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:true}).firestore();
const admin=fn=>env.withSecurityRulesDisabled(c=>fn(c.firestore()));
const owner='u0', ids=Array.from({length:17},(_,i)=>'u'+i),gid='g1';
const gref=d=>doc(d,'exchangeGroups',gid);
const mem=(d,u)=>doc(d,'exchangeGroups',gid,'members',u);
const day=()=>new Date().toISOString().slice(0,10);
const past=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
const member=u=>({uid:u,name:'Name '+u,email:u+'@example.com',appName:'App '+u,appUrl:'https://play.google.com/apps/testing/com.'+u,joinedAt:serverTimestamp()});
const group=(uids=[owner],extras={})=>({title:'Test group',ownerUid:owner,createdAt:serverTimestamp(),memberUids:uids,removedUids:[],status:uids.length===15?'active':'open',...(uids.length===15?{startedAt:Timestamp.fromDate(new Date(Date.now()-6*86400000))}:{}),...extras});
beforeEach(async()=>{
 await env.clearFirestore();
 await admin(async d=>{for(const u of ids)await setDoc(doc(d,'users',u),{name:'Name '+u,email:u+'@example.com',role:'developer',available:false})});
});
async function create(){
 const d=db(owner),b=writeBatch(d);
 b.set(gref(d),group());
 b.set(mem(d,owner),member(owner));
 return b.commit();
}
async function seedFull(){
 await admin(async d=>{
  await setDoc(gref(d),group(ids.slice(0,15)));
  for(const u of ids.slice(0,15))await setDoc(mem(d,u),{...member(u),joinedAt:Timestamp.fromDate(new Date(Date.now()-7*86400000))});
 });
}
test('creator must atomically create own member and cannot create a phantom group',async()=>{
 const d=db(owner);
 await assertFails(setDoc(gref(d),group()));
 await assertSucceeds(create());
 const snap=await assertSucceeds(getDoc(gref(d)));
 assert.deepEqual(snap.data().memberUids,[owner]);
});
test('members-only emails and safe atomic self-join',async()=>{
 await create();
 const other=db('u1'),b=writeBatch(other);
 await assertFails(getDocs(collection(other,'exchangeGroups',gid,'members')));
 b.update(gref(other),{memberUids:[owner,'u1']});
 b.set(mem(other,'u1'),member('u1'));
 await assertSucceeds(b.commit());
 const list=await assertSucceeds(getDocs(collection(other,'exchangeGroups',gid,'members')));
 assert.equal(list.size,2);
 await assertFails(getDocs(collection(db('u2'),'exchangeGroups',gid,'members')));
 await assertFails(updateDoc(gref(db('u2')),{status:'active'}));
 await assertFails(setDoc(mem(db('u2'),'u1'),member('u1')));
});
test('full group is closed: no 16th member and no impersonation',async()=>{
 await seedFull();
 const d=db('u15'),b=writeBatch(d);
 b.update(gref(d),{memberUids:ids.slice(0,16)});
 b.set(mem(d,'u15'),member('u15'));
 await assertFails(b.commit());
 await assertFails(updateDoc(gref(db('u1')),{memberUids:ids.slice(1,15)}));
});
test('only same-day member self-reporting, targets must be other active members',async()=>{
 await seedFull();
 const d=db('u1'),ref=doc(d,'exchangeGroups',gid,'days',day(),'checkins','u1');
 await assertSucceeds(setDoc(ref,{uid:'u1',day:day(),testedUids:['u0'],updatedAt:serverTimestamp()}));
 await assertSucceeds(updateDoc(ref,{testedUids:['u0','u2'],updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{testedUids:['u2'],updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{testedUids:['u0','u2','u15'],updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('u2'),'exchangeGroups',gid,'days',day(),'checkins','u1'),{uid:'u1',day:day(),testedUids:['u2'],updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('u2'),'exchangeGroups',gid,'days',past(1),'checkins','u2'),{uid:'u2',day:past(1),testedUids:['u1'],updatedAt:serverTimestamp()}));
});
test('once-per-day reminders; owner warnings only after missed test days',async()=>{
 await seedFull();
 const r=doc(db('u0'),'exchangeGroups',gid,'reminders','u0_u1_'+day());
 const payload={fromUid:'u0',toUid:'u1',day:day(),createdAt:serverTimestamp()};
 await assertSucceeds(setDoc(r,payload));
 await assertFails(setDoc(r,payload));
 await assertFails(setDoc(doc(db('u2'),'exchangeGroups',gid,'reminders','u2_u15_'+day()),{fromUid:'u2',toUid:'u15',day:day(),createdAt:serverTimestamp()}));
 const w=doc(db(owner),'exchangeGroups',gid,'warnings','u1_'+past(1));
 await assertSucceeds(setDoc(w,{uid:'u1',day:past(1),byUid:owner,createdAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('u2'),'exchangeGroups',gid,'warnings','u3_'+past(1)),{uid:'u3',day:past(1),byUid:'u2',createdAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db(owner),'exchangeGroups',gid,'warnings','u1_'+day()),{uid:'u1',day:day(),byUid:owner,createdAt:serverTimestamp()}));
});
test('owner can refill seat after three different logged warnings, not before',async()=>{
 await seedFull();
 const d=db(owner);
 const removal=days=>({memberUids:ids.slice(0,15).filter(x=>x!=='u1'),removedUids:['u1'],status:'open',lastRemoval:{uid:'u1',days,at:serverTimestamp()}});
 await assertFails(updateDoc(gref(d),removal([past(1),past(2),past(3)])));
 await admin(async a=>{for(const dayValue of [past(1),past(2),past(3)])await setDoc(doc(a,'exchangeGroups',gid,'warnings','u1_'+dayValue),{uid:'u1',day:dayValue,byUid:owner})});
 await assertSucceeds(updateDoc(gref(d),removal([past(1),past(2),past(3)])));
 const newbie=db('u15'),b=writeBatch(newbie);
 b.update(gref(newbie),{memberUids:ids.slice(0,15).filter(x=>x!=='u1').concat('u15'),status:'active'});
 b.set(mem(newbie,'u15'),member('u15'));
 await assertSucceeds(b.commit());
 assert.equal((await getDoc(gref(d))).data().memberUids.length,15);
});
