import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import * as f from 'firebase/firestore';
import '../../src/services/deletion.js';
const {doc,setDoc,getDoc,updateDoc,deleteDoc,getDocs,collection,serverTimestamp}=f;
const {deleteProject,countRelated}=globalThis.TesterHubDeletion;
let env;
const db=(uid,verified=true)=>env.authenticatedContext(uid,{email:uid+'@example.com',email_verified:verified}).firestore();
const seed=async(id,ownerUid,status='recruiting',reports=2)=>env.withSecurityRulesDisabled(async ctx=>{
 const d=ctx.firestore();
 await setDoc(doc(d,'projects',id),{name:'App '+id,ownerUid,status,link:'https://play.google.com/apps/testing/com.a.b'});
 await setDoc(doc(d,'assignments',id+'_t1'),{projectId:id,ownerUid,testerUid:'t1',joinedDay:null,checkins:[]});
 for(let i=0;i<reports;i++)await setDoc(doc(d,'reports',id+'_r'+i),{projectId:id,ownerUid,testerUid:'t1',assignmentId:id+'_t1',outcome:'ok',status:'ok'});
 await setDoc(doc(d,'messages',id+'_m'),{projectId:id,ownerUid,testerUid:'t1',assignmentId:id+'_t1',sender:'tester'});
 await setDoc(doc(d,'applications',id+'_t1'),{projectId:id,ownerUid,testerUid:'t1',status:'pending'});
});
const remaining=async()=>{
 const out={};
 await env.withSecurityRulesDisabled(async ctx=>{for(const name of ['projects','assignments','reports','messages','applications'])out[name]=(await getDocs(collection(ctx.firestore(),name))).docs.map(x=>x.id)});
 return out;
};
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-testerhub',firestore:{rules:readFileSync('firestore.rules','utf8')}})});
after(async()=>{await env?.cleanup()});
beforeEach(async()=>{
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async ctx=>{
  const d=ctx.firestore();
  for(const [uid,role] of [['boss','tester'],['d1','developer'],['d2','developer'],['t1','tester']])await setDoc(doc(d,'users',uid),{name:uid,email:uid+'@example.com',role,available:false,createdAt:serverTimestamp()});
  await setDoc(doc(d,'adminRoles','boss'),{active:true});
 });
 await seed('p1','d1');
 await seed('other','d2');
});
test('developer deletes their app with all its records and leaves other apps alone',async()=>{
 const d=db('d1');
 const counts=await countRelated({db:d,f,projectId:'p1',ownerUid:'d1'});
 assert.deepEqual(counts,{messages:1,reports:2,joinRequests:0,assignments:1,applications:1});
 assert.equal(await deleteProject({db:d,f,projectId:'p1',ownerUid:'d1'}),true);
 const left=await remaining();
 assert.deepEqual(left.projects,['other']);
 assert.deepEqual(left.assignments,['other_t1']);
 assert.deepEqual(left.reports,['other_r0','other_r1']);
 assert.deepEqual(left.messages,['other_m']);
 assert.deepEqual(left.applications,['other_t1']);
});
test('drafts can be deleted too',async()=>{
 await seed('draft','d1','draft',0);
 assert.equal(await deleteProject({db:db('d1'),f,projectId:'draft',ownerUid:'d1'}),true);
 assert.ok(!(await remaining()).projects.includes('draft'));
});
test('admin deletes any app with an audit entry in the final step',async()=>{
 const a=db('boss');
 await deleteProject({db:a,f,projectId:'p1',audit:batch=>batch.set(doc(a,'adminAuditLogs','x'),{actorUid:'boss',action:'delete_project',targetId:'p1',targetName:'App p1',createdAt:serverTimestamp()})});
 const left=await remaining();
 assert.deepEqual(left.projects,['other']);
 assert.deepEqual(left.reports,['other_r0','other_r1']);
 await assertSucceeds(getDoc(doc(a,'adminAuditLogs','x')));
});
test('deletion handles more records than one batch holds',async()=>{
 await seed('big','d1','recruiting',230);
 await deleteProject({db:db('d1'),f,projectId:'big',ownerUid:'d1'});
 assert.ok(!(await remaining()).reports.some(id=>id.startsWith('big_')));
});
test('an interrupted deletion can be resumed',async()=>{
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'projects','p1'),{status:'deleting'}));
 await env.withSecurityRulesDisabled(c=>deleteDoc(doc(c.firestore(),'reports','p1_r0')));
 assert.equal(await deleteProject({db:db('d1'),f,projectId:'p1',ownerUid:'d1'}),true);
 assert.ok(!(await remaining()).projects.includes('p1'));
});
test('nobody else can delete or lock an app',async()=>{
 for(const ctx of [db('d2'),db('t1'),db('d1',false)]){
  await assertFails(updateDoc(doc(ctx,'projects','p1'),{status:'deleting'}));
  await assertFails(deleteDoc(doc(ctx,'projects','p1')));
 }
 await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(),'projects','p1'),{status:'deleting'}));
});
test('records survive until the app is locked, and only the owner can then remove them',async()=>{
 const owner=db('d1');
 await assertFails(deleteDoc(doc(owner,'reports','p1_r0')));
 await assertFails(deleteDoc(doc(owner,'projects','p1')));
 await assertSucceeds(updateDoc(doc(owner,'projects','p1'),{status:'deleting'}));
 for(const ctx of [db('d2'),db('t1')]){
  await assertFails(deleteDoc(doc(ctx,'reports','p1_r0')));
  await assertFails(deleteDoc(doc(ctx,'messages','p1_m')));
  await assertFails(deleteDoc(doc(ctx,'assignments','p1_t1')));
 }
 await assertSucceeds(deleteDoc(doc(owner,'reports','p1_r0')));
});
test('a locked app cannot take new tester writes or return to service by its owner',async()=>{
 const owner=db('d1');
 await updateDoc(doc(owner,'projects','p1'),{status:'deleting'});
 await assertFails(updateDoc(doc(owner,'projects','p1'),{status:'recruiting'}));
 await assertFails(setDoc(doc(db('t1'),'messages','late'),{projectId:'p1',assignmentId:'p1_t1',testerUid:'t1',ownerUid:'d1',senderUid:'t1',sender:'tester',text:'late message',at:new Date().toISOString(),createdAt:serverTimestamp()}));
});
test('an owner cannot use deletion to escape an admin archive',async()=>{
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'projects','p1'),{status:'archived',statusBeforeArchive:'recruiting'}));
 await assertFails(updateDoc(doc(db('d1'),'projects','p1'),{status:'deleting'}));
 await assertSucceeds(updateDoc(doc(db('boss'),'projects','p1'),{status:'deleting'}));
});
test('admin deletion powers stop at projects: users and audit entries stay protected',async()=>{
 const a=db('boss');
 await assertFails(deleteDoc(doc(a,'users','t1')));
 await assertFails(deleteDoc(doc(a,'adminRoles','boss')));
 await setDoc(doc(a,'adminAuditLogs','y'),{actorUid:'boss',action:'delete_project',targetId:'p1',targetName:'x',createdAt:serverTimestamp()});
 await assertFails(deleteDoc(doc(a,'adminAuditLogs','y')));
});
test('a role document alone is enough, whatever the email; without it nothing is granted',async()=>{
 await assertSucceeds(getDocs(collection(db('boss'),'users')));
 await assertFails(getDocs(collection(db('d1'),'users')));
 await assertFails(getDocs(collection(db('boss',false),'users')));
});
