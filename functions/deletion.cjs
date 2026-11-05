'use strict';
const {randomUUID}=require('node:crypto');
const {Timestamp,FieldValue}=require('firebase-admin/firestore');

// This queue survives process restarts and handles datasets larger than a Firestore batch.
// Only explicitly project-scoped documents are deleted. User profiles are NEVER touched.
const CHILD_COLLECTIONS=['messages','reports','assignments','bugs','bugReports'];
const CHUNK_SIZE=150,LEASE_MS=180000;
function publicJob(doc){
 if(!doc?.exists)return null;
 const d=doc.data();
 const t=v=>v&&typeof v.toDate==='function'?v.toDate().toISOString():null;
 return {id:doc.id,status:d.status||'queued',projectName:d.projectName||'',projectId:d.projectId||doc.id,
  progress:d.progress||{},lastCollection:d.lastCollection||null,error:d.lastError||null,
  createdAt:t(d.createdAt),completedAt:t(d.completedAt)};
}
function requireDocId(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new Error('Invalid project identifier');
 return value;
}
async function processChunk(db,id){
 id=requireDocId(id);
 const jobRef=db.collection('adminDeleteJobs').doc(id);
 const token=randomUUID(),now=Date.now();
 const acquired=await db.runTransaction(async tx=>{
  const snap=await tx.get(jobRef);
  if(!snap.exists||snap.get('status')==='complete')return false;
  const lease=snap.get('leaseUntil')?.toMillis?.()||0;
  if(lease>now)return false;
  tx.update(jobRef,{status:'running',leaseUntil:Timestamp.fromMillis(now+LEASE_MS),leaseOwner:token,updatedAt:FieldValue.serverTimestamp()});
  return true;
 });
 if(!acquired)return publicJob(await jobRef.get());
 try{
  for(const name of CHILD_COLLECTIONS){
   const snap=await db.collection(name).where('projectId','==',id).limit(CHUNK_SIZE).get();
   if(snap.empty)continue;
   const batch=db.batch();
   snap.docs.forEach(d=>batch.delete(d.ref));
   batch.update(jobRef,{['progress.'+name]:FieldValue.increment(snap.size),lastCollection:name,updatedAt:FieldValue.serverTimestamp()});
   await batch.commit();
   await db.runTransaction(async tx=>{
    const current=await tx.get(jobRef);
    if(current.exists&&current.get('leaseOwner')===token)
     tx.update(jobRef,{status:'queued',leaseUntil:null,leaseOwner:null});
   });
   return publicJob(await jobRef.get());
  }
  const projectRef=db.collection('projects').doc(id);
  const auditRef=db.collection('adminAuditLogs').doc('delete_'+id);
  await db.runTransaction(async tx=>{
   const [job,project]=await Promise.all([tx.get(jobRef),tx.get(projectRef)]);
   if(!job.exists||job.get('leaseOwner')!==token||job.get('status')==='complete')return;
   if(project.exists){
    if(project.get('status')!=='deleting')throw new Error('Deletion lock missing; refuse to remove project');
    tx.delete(projectRef);
   }
   tx.set(auditRef,{action:'permanent_project_delete',projectId:id,projectName:job.get('projectName'),
    ownerUid:job.get('ownerUid'),requestedBy:job.get('requestedBy'),
    progress:job.get('progress')||{},completedAt:FieldValue.serverTimestamp()},{merge:true});
   tx.update(jobRef,{status:'complete',completedAt:FieldValue.serverTimestamp(),leaseUntil:null,leaseOwner:null,lastError:null});
  });
  return publicJob(await jobRef.get());
 }catch(err){
  await db.runTransaction(async tx=>{
   const current=await tx.get(jobRef);
   if(current.exists&&current.get('leaseOwner')===token)
    tx.update(jobRef,{status:'queued',leaseUntil:null,leaseOwner:null,lastError:String(err?.message||err).slice(0,300)});
  });
  throw err;
 }
}
module.exports={CHILD_COLLECTIONS,CHUNK_SIZE,publicJob,requireDocId,processChunk};
