import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,updateDoc,deleteDoc,collection,query,where,orderBy,limit,writeBatch,serverTimestamp,Timestamp} from 'firebase/firestore';

// Phase 5: admin notification center. Only trusted admins write; private notices stay private.
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
const db=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:verified}).firestore();
const notice=(by,extra={})=>({kind:'announcement',audience:'all',broadcast:true,targetUid:'',title:'تحديث مهم',body:'نص الإعلان',active:true,createdBy:by,createdAt:serverTimestamp(),...extra});
const audit=(by,action='send_announcement')=>({actorUid:by,action,targetId:'n',targetName:'تحديث مهم',createdAt:serverTimestamp()});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();
  for(const [uid,role] of [['owner','developer'],['sup','tester'],['other','tester'],['t1','tester'],['t2','tester'],['d1','developer']])
   await setDoc(doc(d,'users',uid),{name:uid,email:uid+'@example.com',role,available:false});
  await setDoc(doc(d,'adminRoles','owner'),{active:true});
  await setDoc(doc(d,'staffRoles','sup'),{active:true,permissions:{sendAnnouncements:true},email:'sup@example.com',name:'sup',grantedBy:'owner'});
  await setDoc(doc(d,'staffRoles','other'),{active:true,permissions:{viewUsers:true},email:'other@example.com',name:'other',grantedBy:'owner'});
  await setDoc(doc(d,'announcements','b1'),{...notice('owner'),createdAt:Timestamp.now()});
  await setDoc(doc(d,'announcements','u1'),{...notice('owner',{audience:'user',broadcast:false,targetUid:'t1',title:'لك فقط'}),createdAt:Timestamp.now()});
 });
});

test('the owner and a staff member with sendAnnouncements can send, with an audit entry',async()=>{
 for(const by of ['owner','sup']){
  const d=db(by),batch=writeBatch(d),ref=doc(collection(d,'announcements'));
  batch.set(ref,notice(by,{kind:'update',audience:'developers'}));
  batch.set(doc(collection(d,'adminAuditLogs')),audit(by));
  await assertSucceeds(batch.commit());
 }
 await assertSucceeds(setDoc(doc(collection(db('owner'),'announcements')),notice('owner',{audience:'user',broadcast:false,targetUid:'t2',kind:'instruction'})));
});
test('ordinary members, other staff and unverified admins cannot send',async()=>{
 for(const by of ['t1','d1','other'])await assertFails(setDoc(doc(collection(db(by),'announcements')),notice(by)));
 await assertFails(setDoc(doc(collection(db('owner',false),'announcements')),notice('owner')));
 await assertFails(setDoc(doc(db('other'),'adminAuditLogs','a1'),audit('other')));
});
test('notices must be well formed and signed by their sender with server time',async()=>{
 const o=db('owner'),add=extra=>setDoc(doc(collection(o,'announcements')),notice('owner',extra));
 await assertFails(add({createdBy:'sup'}));
 await assertFails(add({createdAt:new Date('2020-01-01')}));
 await assertFails(add({kind:'promo'}));
 await assertFails(add({audience:'everyone'}));
 await assertFails(add({title:'x'}));
 await assertFails(add({body:'y'.repeat(1001)}));
 await assertFails(add({active:false}));
 await assertFails(add({extra:'field'}));
 // Broadcast flag and target must agree.
 await assertFails(add({audience:'user',broadcast:true,targetUid:'t1'}));
 await assertFails(add({audience:'all',broadcast:false,targetUid:''}));
 await assertFails(add({audience:'all',broadcast:true,targetUid:'t1'}));
 await assertFails(add({audience:'user',broadcast:false,targetUid:''}));
 await assertFails(add({audience:'user',broadcast:false,targetUid:'nobody'}));
});
test('members read broadcasts; a private notice is readable only by its target',async()=>{
 const t1=db('t1'),t2=db('t2');
 const b=await assertSucceeds(getDocs(query(collection(t2,'announcements'),where('broadcast','==',true),orderBy('createdAt','desc'),limit(15))));
 assert.deepEqual(b.docs.map(x=>x.id),['b1']);
 const mine=await assertSucceeds(getDocs(query(collection(t1,'announcements'),where('targetUid','==','t1'),orderBy('createdAt','desc'),limit(15))));
 assert.deepEqual(mine.docs.map(x=>x.id),['u1']);
 await assertFails(getDoc(doc(t2,'announcements','u1')));
 await assertFails(getDocs(query(collection(t2,'announcements'),where('targetUid','==','t1'))));
 await assertFails(getDocs(collection(t2,'announcements')));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'announcements','b1')));
 await assertFails(getDoc(doc(db('t1',false),'announcements','b1')));
 // The sender's history can list everything.
 await assertSucceeds(getDocs(query(collection(db('sup'),'announcements'),orderBy('createdAt','desc'),limit(25))));
});
test('a notice can be withdrawn and shown again, never rewritten or deleted',async()=>{
 await assertSucceeds(updateDoc(doc(db('sup'),'announcements','b1'),{active:false}));
 await assertSucceeds(updateDoc(doc(db('owner'),'announcements','b1'),{active:true}));
 await assertFails(updateDoc(doc(db('owner'),'announcements','b1'),{title:'نص معدّل'}));
 await assertFails(updateDoc(doc(db('t1'),'announcements','b1'),{active:false}));
 await assertFails(deleteDoc(doc(db('owner'),'announcements','b1')));
 await assertSucceeds(setDoc(doc(db('sup'),'adminAuditLogs','w1'),audit('sup','withdraw_announcement')));
});
test('read state is private to its owner and uses server time',async()=>{
 await assertSucceeds(setDoc(doc(db('t1'),'noticeReads','t1'),{readAt:serverTimestamp()}));
 await assertSucceeds(getDoc(doc(db('t1'),'noticeReads','t1')));
 await assertFails(getDoc(doc(db('t2'),'noticeReads','t1')));
 await assertFails(setDoc(doc(db('t2'),'noticeReads','t1'),{readAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db('t1'),'noticeReads','t1'),{readAt:new Date('2099-01-01')}));
 await assertFails(setDoc(doc(db('t1'),'noticeReads','t1'),{readAt:serverTimestamp(),other:1}));
});
test('staff permission list accepts the new permission and nothing unknown',async()=>{
 const o=db('owner'),b=writeBatch(o);
 b.set(doc(o,'staffRoles','t2'),{active:true,permissions:{sendAnnouncements:true},email:'t2@example.com',name:'t2',grantedBy:'owner',grantedAt:serverTimestamp()});
 b.set(doc(collection(o,'adminAuditLogs')),{actorUid:'owner',action:'grant_staff',targetId:'t2',targetName:'t2',createdAt:serverTimestamp()});
 await assertSucceeds(b.commit());
 await assertFails(updateDoc(doc(o,'staffRoles','t2'),{permissions:{sendEverything:true},grantedBy:'owner',grantedAt:serverTimestamp()}));
});
