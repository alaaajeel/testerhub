'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue,FieldPath}=require('firebase-admin/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {processChunk,publicJob,requireDocId}=require('./deletion.cjs');
initializeApp();
const db=getFirestore(),adminAuth=getAuth();
const REGION='us-central1';
// Defense in depth: ONLY the verified owner account with a server-issued claim.
const ADMIN_EMAIL='dhi98886@gmail.com';
async function audit(uid,action,details){
 await db.collection('adminAuditLogs').add({actorUid:uid,action,...details,createdAt:FieldValue.serverTimestamp()});
}
function requireAdmin(request){
 const auth=request.auth;
 if(!auth||auth.token.testerhubAdmin!==true||
    String(auth.token.email||'').toLowerCase()!==ADMIN_EMAIL||
    auth.token.email_verified!==true)
  throw new HttpsError('permission-denied','Admin authorization required');
 return auth.uid;
}
function checkId(id){
 try{return requireDocId(id)}catch{throw new HttpsError('invalid-argument','Invalid project identifier')}
}
function toISO(value){return value&&typeof value.toDate==='function'?value.toDate().toISOString():null}
const callable={region:REGION,maxInstances:5,timeoutSeconds:120};
exports.adminOverview=onCall(callable,async request=>{
 requireAdmin(request);
 const names=['users','projects','assignments','reports','messages','adminDeleteJobs'];
 const counts=await Promise.all(names.map(name=>db.collection(name).count().get()));
 return {counts:Object.fromEntries(names.map((name,i)=>[name,counts[i].data().count]))};
});
exports.adminList=onCall(callable,async request=>{
 requireAdmin(request);
 const type=request.data?.type;
 if(type!=='users'&&type!=='projects')throw new HttpsError('invalid-argument','Invalid list type');
 const cursor=request.data?.cursor||null;
 if(cursor!==null&&(typeof cursor!=='string'||cursor.length>150||cursor.includes('/')))
  throw new HttpsError('invalid-argument','Invalid cursor');
 let q=db.collection(type).orderBy(FieldPath.documentId()).limit(30);
 if(cursor)q=q.startAfter(cursor);
 const snap=await q.get();
 const entries=snap.docs.map(d=>{
  const x=d.data();
  return type==='users'
   ?{id:d.id,name:x.name||'',email:x.email||'',role:x.role||'',available:x.available===true,suspended:x.suspended===true}
   :{id:d.id,name:x.name||'',status:x.status||'recruiting',ownerUid:x.ownerUid||'',testersCount:x.testersCount||0,createdAt:toISO(x.createdAt)};
 });
 return {items:entries,nextCursor:snap.size===30?snap.docs[snap.size-1].id:null};
});
exports.adminStartProjectDeletion=onCall(callable,async request=>{
 const uid=requireAdmin(request),id=checkId(request.data?.projectId);
 const typed=String(request.data?.confirmName||'');
 if(request.data?.confirmPermanent!==true||typed.length<2||typed.length>100)
  throw new HttpsError('failed-precondition','Confirm permanent deletion using the exact project name');
 const projectRef=db.collection('projects').doc(id);
 const jobRef=db.collection('adminDeleteJobs').doc(id);
 await db.runTransaction(async tx=>{
  const [project,job]=await Promise.all([tx.get(projectRef),tx.get(jobRef)]);
  if(job.exists){
   if(job.get('status')==='complete')throw new HttpsError('already-exists','This project was deleted');
   return;
  }
  if(!project.exists)throw new HttpsError('not-found','Project does not exist');
  const p=project.data();
  if(p.name!==typed)throw new HttpsError('failed-precondition','The confirmation name does not match');
  if(p.status==='deleting')throw new HttpsError('failed-precondition','Deletion already in progress');
  tx.update(projectRef,{status:'deleting',deletionStartedAt:FieldValue.serverTimestamp()});
  tx.set(jobRef,{projectId:id,projectName:p.name,ownerUid:p.ownerUid||'',
    requestedBy:uid,status:'queued',progress:{},createdAt:FieldValue.serverTimestamp(),
    leaseUntil:null,leaseOwner:null,lastError:null});
 });
 // A scheduled worker will resume even if the user's connection closes.
 return {job:publicJob(await jobRef.get())};
});

exports.adminSetUserSuspension=onCall(callable,async request=>{
 const uid=requireAdmin(request),userUid=String(request.data?.userUid||'');
 const suspend=request.data?.suspend;
 if(!/^[A-Za-z0-9]{6,128}$/.test(userUid)||typeof suspend!=='boolean')
  throw new HttpsError('invalid-argument','Invalid suspension request');
 if(userUid===uid)throw new HttpsError('failed-precondition','Cannot suspend current admin');
 const person=await adminAuth.getUser(userUid);
 if(String(person.email||'').toLowerCase()===ADMIN_EMAIL||person.customClaims?.testerhubAdmin===true)
  throw new HttpsError('permission-denied','Cannot suspend an administrator');
 const ref=db.collection('users').doc(userUid);
 const profile=await ref.get();
 if(!profile.exists)throw new HttpsError('not-found','User profile not found');
 if(suspend){
  await ref.update({suspended:true});
  await adminAuth.updateUser(userUid,{disabled:true});
 }else{
  await adminAuth.updateUser(userUid,{disabled:false});
  await ref.update({suspended:false});
 }
 await adminAuth.revokeRefreshTokens(userUid);
 await audit(uid,suspend?'suspend_user':'unsuspend_user',{userUid});
 return {userUid,suspended:suspend};
});
exports.adminSetProjectArchive=onCall(callable,async request=>{
 const uid=requireAdmin(request),id=checkId(request.data?.projectId);
 const archive=request.data?.archive;
 const confirmName=String(request.data?.confirmName||'');
 if(typeof archive!=='boolean'||confirmName.length<2||confirmName.length>100)
  throw new HttpsError('invalid-argument','Invalid project archive request');
 const ref=db.collection('projects').doc(id);
 const result=await db.runTransaction(async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists)throw new HttpsError('not-found','Project does not exist');
  const data=snap.data();
  if(data.name!==confirmName)throw new HttpsError('failed-precondition','Project name mismatch');
  if(data.status==='deleting')throw new HttpsError('failed-precondition','Project is being deleted');
  if(archive){
   if(data.status==='archived')return 'archived';
   tx.update(ref,{status:'archived',statusBeforeArchive:data.status||'recruiting',archivedAt:FieldValue.serverTimestamp()});
   return 'archived';
  }
  if(data.status!=='archived')return data.status||'recruiting';
  const restoreTo=data.statusBeforeArchive==='draft'?'draft':'recruiting';
  tx.update(ref,{status:restoreTo,statusBeforeArchive:FieldValue.delete(),archivedAt:FieldValue.delete()});
  return restoreTo;
 });
 await audit(uid,archive?'archive_project':'restore_project',{projectId:id,status:result});
 return {projectId:id,status:result};
});

exports.adminDeletionStatus=onCall(callable,async request=>{
 requireAdmin(request);const id=checkId(request.data?.projectId);
 return {job:publicJob(await db.collection('adminDeleteJobs').doc(id).get())};
});
exports.adminContinueDeletion=onCall(callable,async request=>{
 requireAdmin(request);const id=checkId(request.data?.projectId);
 try{return {job:await processChunk(db,id)}}catch(err){
  console.error('Deletion chunk failed',id,err);
  throw new HttpsError('internal','Deletion paused; it will retry automatically');
 }
});
// Scheduler needs Blaze billing and deployment; without it the UI must not claim auto-resume is live.
exports.adminDeletionWorker=onSchedule({schedule:'every 5 minutes',timeZone:'Etc/UTC',region:REGION,
 timeoutSeconds:540,memory:'256MiB',maxInstances:1},async()=>{
 const jobs=await db.collection('adminDeleteJobs').where('status','in',['queued','running']).limit(15).get();
 for(const job of jobs.docs){
  try{await processChunk(db,job.id)}catch(err){console.error('Failed deletion job',job.id,err)}
 }
});
