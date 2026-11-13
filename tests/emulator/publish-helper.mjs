import {doc,setDoc,deleteDoc,writeBatch,serverTimestamp} from 'firebase/firestore';
// Fairness (V2 phase 2): an app goes live only together with its owner's publish slot, in one write,
// and only after the owner has 3 more accepted reports than their last publish used.
// Tests about other rules use these to publish the way index.html does.

// Gives `uid` enough accepted reports for one more app and clears their previous slot.
export async function allowPublish(env,uid,reports=3){
 await env.withSecurityRulesDisabled(async c=>{
  const d=c.firestore();
  await setDoc(doc(d,'xpTotals',uid),{uid,points:reports*10,reports,bugs:0,retests:0,cycles:0,apps:1});
  await deleteDoc(doc(d,'publishSlots',uid));
 });
}
// Mirrors createProject(): the project and the slot in one batch.
export function publishBatch(firestore,uid,id,data,acceptedAtPublish=3){
 const b=writeBatch(firestore);
 b.set(doc(firestore,'projects',id),data);
 b.set(doc(firestore,'publishSlots',uid),{projectId:id,acceptedAtPublish,updatedAt:serverTimestamp()});
 return b;
}
// Mirrors publishProjectDraft(): the draft update and the slot in one batch.
export function publishDraftBatch(firestore,uid,id,changes,acceptedAtPublish=3){
 const b=writeBatch(firestore);
 b.update(doc(firestore,'projects',id),changes);
 b.set(doc(firestore,'publishSlots',uid),{projectId:id,acceptedAtPublish,updatedAt:serverTimestamp()});
 return b;
}
// For tests that only need a live app to exist: allow, then publish as the owner.
export async function publish(env,firestore,uid,id,data){
 await allowPublish(env,uid);
 return publishBatch(firestore,uid,id,data).commit();
}
