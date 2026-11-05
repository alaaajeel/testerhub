import {before,after,beforeEach,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,writeBatch,serverTimestamp,deleteField} from 'firebase/firestore';

let env;
const ADMIN_ID='sparkadmin';
const adminCtx=(options={})=>env.authenticatedContext(ADMIN_ID,{email:'owner@example.com',email_verified:true,...options}).firestore();
const db=(uid,options={})=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:true,...options}).firestore();
before(async()=>env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}}));
after(async()=>await env?.cleanup());
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  for(const [uid,email,role] of [[ADMIN_ID,'owner@example.com','developer'],['developer1','developer1@example.com','developer'],['tester1','tester1@example.com','tester'],['tester2','tester2@example.com','tester']]){
   await setDoc(doc(d,'users',uid),{name:uid,email,role,available:role==='tester',createdAt:serverTimestamp()});
  }
  await setDoc(doc(d,'adminRoles',ADMIN_ID),{active:true});
  await setDoc(doc(d,'projects','p1'),{ownerUid:'developer1',name:'Alpha',status:'recruiting',testersCount:2,selectedTesterUids:['tester1','tester2']});
  await setDoc(doc(d,'assignments','p1_tester1'),{ownerUid:'developer1',testerUid:'tester1',projectId:'p1',joinedDay:null,checkins:[],invitationStatus:'pending'});
  await setDoc(doc(d,'reports','rep1'),{ownerUid:'developer1',testerUid:'tester1',projectId:'p1',assignmentId:'p1_tester1',outcome:'issue',status:'new'});
  await setDoc(doc(d,'messages','msg1'),{ownerUid:'developer1',testerUid:'tester1',projectId:'p1',assignmentId:'p1_tester1',sender:'tester'});
 });
});
test('correct admin with manual role may list projects and users and read reports/messages',async()=>{
 const a=adminCtx();
 await assertSucceeds(getDoc(doc(a,'adminRoles',ADMIN_ID)));
 await assertSucceeds(getDocs(collection(a,'users')));
 await assertSucceeds(getDocs(collection(a,'projects')));
 await assertSucceeds(getDocs(collection(a,'reports')));
 await assertSucceeds(getDocs(collection(a,'messages')));
});
test('normal developer/tester cannot browse all users or all projects',async()=>{
 await assertFails(getDocs(collection(db('developer1'),'users')));
 await assertFails(getDocs(collection(db('tester1'),'users')));
 await assertFails(getDocs(collection(db('developer1'),'projects')));
});
test('no Firebase client can create, alter or delete adminRoles including verified admin',async()=>{
 for(const ctx of [adminCtx(),db('developer1')]){
  await assertFails(setDoc(doc(ctx,'adminRoles','evil'),{active:true}));
  await assertFails(updateDoc(doc(ctx,'adminRoles',ADMIN_ID),{active:false}));
  await assertFails(deleteDoc(doc(ctx,'adminRoles',ADMIN_ID)));
 }
});
test('matching admin email with no manually created role has no privileges',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>deleteDoc(doc(ctx.firestore(),'adminRoles',ADMIN_ID)));
 await assertFails(getDocs(collection(adminCtx(),'users')));
 await assertSucceeds(getDoc(doc(adminCtx(),'adminRoles',ADMIN_ID)));
});
test('nonverified admin email with role cannot use privileges',async()=>{
 const a=adminCtx({email_verified:false});
 await assertFails(getDocs(collection(a,'projects')));
 await assertFails(getDoc(doc(a,'adminRoles',ADMIN_ID)));
});
test('admin can suspend a tester with an audit entry; tester immediately loses Firestore access',async()=>{
 const a=adminCtx(),batch=writeBatch(a);
 batch.update(doc(a,'users','tester1'),{suspended:true,available:false});
 batch.set(doc(a,'adminAuditLogs','s1'),{actorUid:ADMIN_ID,action:'suspend_user',targetId:'tester1',targetName:'tester1@example.com',createdAt:serverTimestamp()});
 await assertSucceeds(batch.commit());
 await assertFails(getDoc(doc(db('tester1'),'projects','p1')));
 await assertFails(getDoc(doc(db('tester1'),'assignments','p1_tester1')));
 await assertSucceeds(getDoc(doc(a,'adminAuditLogs','s1')));
});
test('admin can reverse suspension with audit; tester is allowed again',async()=>{
 const a=adminCtx();
 await env.withSecurityRulesDisabled(async ctx=>updateDoc(doc(ctx.firestore(),'users','tester1'),{suspended:true,available:false}));
 const batch=writeBatch(a);
 batch.update(doc(a,'users','tester1'),{suspended:false});
 batch.set(doc(a,'adminAuditLogs','s2'),{actorUid:ADMIN_ID,action:'unsuspend_user',targetId:'tester1',targetName:'tester1@example.com',createdAt:serverTimestamp()});
 await assertSucceeds(batch.commit());
 await assertSucceeds(getDoc(doc(db('tester1'),'users','tester1')));
});
test('admin cannot suspend their own account or alter user name, email, role',async()=>{
 const a=adminCtx();
 await assertFails(updateDoc(doc(a,'users',ADMIN_ID),{suspended:true,available:false}));
 await assertFails(updateDoc(doc(a,'users','tester1'),{role:'admin'}));
 await assertFails(updateDoc(doc(a,'users','tester1'),{email:'evil@example.com'}));
});
test('admin may archive a project with recorded previous status and an audit trail',async()=>{
 const a=adminCtx(),batch=writeBatch(a);
 batch.update(doc(a,'projects','p1'),{status:'archived',statusBeforeArchive:'recruiting',archivedAt:serverTimestamp()});
 batch.set(doc(a,'adminAuditLogs','a1'),{actorUid:ADMIN_ID,action:'archive_project',targetId:'p1',targetName:'Alpha',createdAt:serverTimestamp()});
 await assertSucceeds(batch.commit());
 await assertFails(updateDoc(doc(db('developer1'),'reports','rep1'),{status:'fixed'}));
});
test('admin can restore archived project without deleting historical messages',async()=>{
 const a=adminCtx();
 await env.withSecurityRulesDisabled(async ctx=>updateDoc(doc(ctx.firestore(),'projects','p1'),{status:'archived',statusBeforeArchive:'recruiting',archivedAt:serverTimestamp()}));
 const batch=writeBatch(a);
 batch.update(doc(a,'projects','p1'),{status:'recruiting',statusBeforeArchive:deleteField(),archivedAt:deleteField()});
 batch.set(doc(a,'adminAuditLogs','a2'),{actorUid:ADMIN_ID,action:'restore_project',targetId:'p1',targetName:'Alpha',createdAt:serverTimestamp()});
 await assertSucceeds(batch.commit());
 await assertSucceeds(getDoc(doc(db('developer1'),'messages','msg1')));
});
test('admin cannot permanently delete users or edit an audit entry',async()=>{
 const a=adminCtx();
 await assertFails(deleteDoc(doc(a,'users','tester1')));
 await assertFails(updateDoc(doc(a,'adminAuditLogs','auditMissing'),{action:'changed'}));
});
test('unprivileged authenticated user cannot create audit records to forge moderator actions',async()=>{
 await assertFails(setDoc(doc(db('developer1'),'adminAuditLogs','fake'),{actorUid:'developer1',action:'suspend_user',targetId:'tester1',targetName:'Tester',createdAt:serverTimestamp()}));
});
