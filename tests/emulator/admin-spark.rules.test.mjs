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
   await setDoc(doc(d,'users',uid),{name:uid,email,role,available:false,createdAt:serverTimestamp()});
  }
  await setDoc(doc(d,'adminRoles',ADMIN_ID),{active:true});
  await setDoc(doc(d,'projects','p1'),{ownerUid:'developer1',name:'Alpha',status:'recruiting'});
  await setDoc(doc(d,'assignments','p1_tester1'),{ownerUid:'developer1',testerUid:'tester1',projectId:'p1',joinedDay:null,checkins:[],invitationStatus:'pending'});
  await setDoc(doc(d,'reports','rep1'),{ownerUid:'developer1',testerUid:'tester1',projectId:'p1',assignmentId:'p1_tester1',outcome:'issue',status:'new'});
  await setDoc(doc(d,'messages','msg1'),{ownerUid:'developer1',testerUid:'tester1',projectId:'p1',assignmentId:'p1_tester1',sender:'tester'});
  await setDoc(doc(d,'flags','f1'),{reporterUid:'tester1',targetType:'project',targetId:'p1',targetName:'Alpha',reason:'Spam listing',status:'open'});
  await setDoc(doc(d,'deletionRequests','tester2'),{email:'tester2@example.com',status:'open'});
 });
});
test('admin with a manual role may read every operational collection',async()=>{
 const a=adminCtx();
 await assertSucceeds(getDoc(doc(a,'adminRoles',ADMIN_ID)));
 for(const name of ['users','projects','assignments','applications','reports','messages','flags','deletionRequests','adminAuditLogs'])await assertSucceeds(getDocs(collection(a,name)));
});
test('normal developer/tester cannot browse admin data',async()=>{
 for(const ctx of [db('developer1'),db('tester1')])for(const name of ['users','projects','reports','messages','flags','deletionRequests','adminAuditLogs'])await assertFails(getDocs(collection(ctx,name)));
});
test('no Firebase client can create, alter or delete adminRoles including the admin',async()=>{
 for(const ctx of [adminCtx(),db('developer1')]){
  await assertFails(setDoc(doc(ctx,'adminRoles','evil'),{active:true}));
  await assertFails(updateDoc(doc(ctx,'adminRoles',ADMIN_ID),{active:false}));
  await assertFails(deleteDoc(doc(ctx,'adminRoles',ADMIN_ID)));
 }
});
test('no role document means no privileges, whatever the email is',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>deleteDoc(doc(ctx.firestore(),'adminRoles',ADMIN_ID)));
 await assertFails(getDocs(collection(adminCtx(),'users')));
});
test('inactive role grants nothing',async()=>{
 await env.withSecurityRulesDisabled(async ctx=>updateDoc(doc(ctx.firestore(),'adminRoles',ADMIN_ID),{active:false}));
 await assertFails(getDocs(collection(adminCtx(),'users')));
});
test('unverified email with a role cannot use privileges',async()=>{
 const a=adminCtx({email_verified:false});
 await assertFails(getDocs(collection(a,'projects')));
 await assertFails(getDoc(doc(a,'adminRoles',ADMIN_ID)));
});
test('admin can suspend a tester with an audit entry; tester immediately loses data access',async()=>{
 const a=adminCtx(),batch=writeBatch(a);
 batch.update(doc(a,'users','tester1'),{suspended:true,available:false});
 batch.set(doc(a,'adminAuditLogs','s1'),{actorUid:ADMIN_ID,action:'suspend_user',targetId:'tester1',targetName:'tester1@example.com',createdAt:serverTimestamp()});
 await assertSucceeds(batch.commit());
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
 await assertSucceeds(getDoc(doc(db('tester1'),'assignments','p1_tester1')));
});
test('admin cannot suspend an admin or alter user name, email, role',async()=>{
 const a=adminCtx();
 await assertFails(updateDoc(doc(a,'users',ADMIN_ID),{suspended:true,available:false}));
 await assertFails(updateDoc(doc(a,'users','tester1'),{role:'admin'}));
 await assertFails(updateDoc(doc(a,'users','tester1'),{email:'evil@example.com'}));
});
test('admin may archive a project with recorded previous status; bug updates stop',async()=>{
 const a=adminCtx(),batch=writeBatch(a);
 batch.update(doc(a,'projects','p1'),{status:'archived',statusBeforeArchive:'recruiting',archivedAt:serverTimestamp()});
 batch.set(doc(a,'adminAuditLogs','a1'),{actorUid:ADMIN_ID,action:'archive_project',targetId:'p1',targetName:'Alpha',createdAt:serverTimestamp()});
 await assertSucceeds(batch.commit());
 await assertFails(updateDoc(doc(db('developer1'),'reports','rep1'),{status:'fixed'}));
 await assertFails(updateDoc(doc(db('developer1'),'projects','p1'),{status:'recruiting'}));
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
test('admin closes flags and deletion requests with an audit trail',async()=>{
 const a=adminCtx(),batch=writeBatch(a);
 batch.update(doc(a,'flags','f1'),{status:'closed',closedAt:serverTimestamp()});
 batch.update(doc(a,'deletionRequests','tester2'),{status:'processed',processedAt:serverTimestamp()});
 batch.set(doc(a,'adminAuditLogs','a3'),{actorUid:ADMIN_ID,action:'close_flag',targetId:'f1',targetName:'Alpha',createdAt:serverTimestamp()});
 await assertSucceeds(batch.commit());
});
test('admin cannot permanently delete users/projects/messages or edit an audit entry',async()=>{
 const a=adminCtx();
 await assertFails(deleteDoc(doc(a,'users','tester1')));
 await assertFails(deleteDoc(doc(a,'projects','p1')));
 await assertFails(deleteDoc(doc(a,'messages','msg1')));
 await assertFails(updateDoc(doc(a,'adminAuditLogs','auditMissing'),{action:'changed'}));
});
test('unprivileged user cannot forge audit records',async()=>{
 await assertFails(setDoc(doc(db('developer1'),'adminAuditLogs','fake'),{actorUid:'developer1',action:'suspend_user',targetId:'tester1',targetName:'Tester',createdAt:serverTimestamp()}));
});
