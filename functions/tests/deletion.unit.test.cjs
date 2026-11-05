'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {processChunk,requireDocId}=require('../deletion.cjs');
class MemoryDB{
 constructor(seed){this.store=new Map(Object.entries(seed));}
 snapshot(path){
  const value=this.store.get(path);
  return {id:path.split('/').at(-1),ref:this.ref(path),exists:value!==undefined,
   data:()=>value,get:key=>value?.[key]};
 }
 ref(path){return {path,get:async()=>this.snapshot(path)};}
 collection(name){
  const self=this;
  return {
   doc(id){return self.ref(name+'/'+id)},
   where(field,operator,value){
    assert.equal(operator,'==');
    return {limit(n){return {get:async()=>{
     const docs=[...self.store.keys()].filter(k=>k.startsWith(name+'/')&&self.store.get(k)?.[field]===value).slice(0,n).map(k=>self.snapshot(k));
     return {docs,size:docs.length,empty:docs.length===0};
    }}}}
   }
  };
 }
 apply(ops){
  for(const [action,path,changes] of ops){
   if(action==='delete')this.store.delete(path);
   else if(action==='set')this.store.set(path,{...(this.store.get(path)||{}),...changes});
   else if(action==='update')this.store.set(path,{...(this.store.get(path)||{}),...changes});
  }
 }
 tx(){
  const ops=[],db=this;
  return {get:async ref=>db.snapshot(ref.path),
   update:(ref,obj)=>ops.push(['update',ref.path,obj]),
   set:(ref,obj)=>ops.push(['set',ref.path,obj]),
   delete:ref=>ops.push(['delete',ref.path]),
   commit:async()=>db.apply(ops)};
 }
 async runTransaction(fn){const tx=this.tx();const result=await fn(tx);await tx.commit();return result}
 batch(){return this.tx()}
}
test('resumable deletion clears >200 project messages without deleting users or other apps',async()=>{
 const seed={
  'projects/main-project':{name:'Main',status:'deleting',ownerUid:'owner'},
  'projects/other':{name:'Other',status:'recruiting',ownerUid:'owner'},
  'users/owner':{name:'Owner',email:'owner@example.com'},
  'users/tester':{name:'Tester',email:'tester@example.com'},
  'adminDeleteJobs/main-project':{status:'queued',projectId:'main-project',projectName:'Main',ownerUid:'owner',requestedBy:'admin',progress:{}},
  'reports/report1':{projectId:'main-project',testerUid:'tester'},
  'assignments/assignment1':{projectId:'main-project',testerUid:'tester'},
  'messages/other-one':{projectId:'other',text:'keep me'}
 };
 for(let i=0;i<251;i++)seed['messages/msg'+i]={projectId:'main-project',text:'message '+i};
 const db=new MemoryDB(seed);
 let finished=false;
 for(let n=0;n<15;n++){
  const result=await processChunk(db,'main-project');
  if(result?.status==='complete'){finished=true;break}
 }
 assert.equal(finished,true,'deletion must complete over multiple batches');
 assert.equal(db.store.has('projects/main-project'),false);
 assert.equal(db.store.has('reports/report1'),false);
 assert.equal(db.store.has('assignments/assignment1'),false);
 assert.equal([...db.store.keys()].some(x=>x.startsWith('messages/msg')),false);
 assert.equal(db.store.has('projects/other'),true);
 assert.equal(db.store.has('messages/other-one'),true);
 assert.equal(db.store.has('users/owner'),true);
 assert.equal(db.store.has('users/tester'),true);
 assert.equal(db.store.get('adminDeleteJobs/main-project').status,'complete');
 assert.equal(db.store.has('adminAuditLogs/delete_main-project'),true);
 const again=await processChunk(db,'main-project');
 assert.equal(again.status,'complete','retries after completion must be idempotent');
});
test('untrusted project identifiers are rejected before any database access',()=>{
 for(const id of ['../users','',null,'x/y','a '.repeat(70),'app%2Fbad'])
  assert.throws(()=>requireDocId(id));
 assert.equal(requireDocId('p_valid-18'),'p_valid-18');
});
