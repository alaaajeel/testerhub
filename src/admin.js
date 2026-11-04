import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,getIdTokenResult} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,query,orderBy,documentId,limit,startAfter,getDocs,getCountFromServer,writeBatch,serverTimestamp,deleteField} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const $=id=>document.getElementById(id);
const ADMIN_EMAIL='dhi98886@gmail.com';
const PAGE_SIZE=25;
const state={tab:'projects',rows:{projects:[],users:[],adminAuditLogs:[]},cursors:{projects:null,users:null,adminAuditLogs:null},hasMore:{projects:true,users:true,adminAuditLogs:true},busy:false,account:null,db:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msg=err=>String(err?.code||'').includes('permission-denied')?'رفضت قاعدة البيانات العملية. تحقق من صلاحية الإدارة وأن قواعد Firestore المنشورة حديثة.':String(err?.message||err||'تعذر تنفيذ العملية.');

function gate(text){$('gate').hidden=false;$('console').hidden=true;$('gate').textContent=text}
function flash(text,error=false){$('flash').textContent=text;$('flash').className='message'+(error?' error':'')}
function busy(value){state.busy=value;for(const b of document.querySelectorAll('button'))b.disabled=value}
function stamped(v){const d=v?.toDate?.();return d?d.toLocaleString('ar-IQ'):'—'}
function batchAudit(batch,action,targetId,targetName){
 batch.set(doc(collection(state.db,'adminAuditLogs')),{actorUid:state.account.uid,action,targetId,targetName,createdAt:serverTimestamp()});
}
async function authorized(account){
 const token=await getIdTokenResult(account,true);
 if(token.claims.email_verified!==true||String(account.email||'').toLowerCase()!==ADMIN_EMAIL)return false;
 const role=await getDoc(doc(state.db,'adminRoles',account.uid));
 return role.exists()&&role.data().active===true;
}
async function overview(){
 const names=['users','projects','assignments','reports','messages'];
 const titles=['المستخدمون','التطبيقات','المشاركات','التقارير','الرسائل'];
 const counts=await Promise.all(names.map(n=>getCountFromServer(collection(state.db,n))));
 $('metrics').innerHTML=names.map((name,i)=>'<div class="card metric"><small>'+esc(titles[i])+'</small><strong>'+Number(counts[i].data().count).toLocaleString('ar-IQ')+'</strong></div>').join('');
}
function renderList(){
 const type=state.tab,items=state.rows[type];
 $('listTitle').textContent=type==='projects'?'إدارة التطبيقات':type==='users'?'إدارة المستخدمين':'سجل إجراءات الإدارة';
 $('items').innerHTML=items.length?items.map(item=>{
  if(type==='users'){
   const protectedUser=item.id===state.account.uid||String(item.email||'').toLowerCase()===ADMIN_EMAIL;
   return '<article class="item"><div><strong>'+esc(item.name||'مستخدم')+'</strong><small>'+esc(item.email||'')+' • '+esc(item.role||'')+'</small></div><div class="actions"><span class="tag'+(item.suspended?' warn':'')+'">'+(item.suspended?'موقوف':item.available?'متاح للاختبار':'مسجّل')+'</span>'+(protectedUser?'':'<button class="btn secondary small" data-action="suspend" data-id="'+esc(item.id)+'">'+(item.suspended?'إعادة التنشيط':'إيقاف الحساب')+'</button>')+'</div></article>';
  }
  if(type==='projects'){
   const archived=item.status==='archived',deleting=item.status==='deleting';
   return '<article class="item"><div><strong>'+esc(item.name||'تطبيق')+'</strong><small>المعرف: '+esc(item.id)+' • المختبرون: '+Number(item.testersCount||0)+'</small><small>الحالة: '+esc(item.status||'recruiting')+'</small></div><div class="actions">'+(deleting?'<span class="tag warn">الحذف متوقف لحين تفعيل الخادم</span>':'<button class="btn secondary small" data-action="archive" data-id="'+esc(item.id)+'">'+(archived?'إلغاء الأرشفة':'أرشفة')+'</button>')+'</div></article>';
  }
  const names={suspend_user:'إيقاف حساب',unsuspend_user:'إعادة تنشيط حساب',archive_project:'أرشفة تطبيق',restore_project:'إلغاء أرشفة تطبيق'};
  return '<article class="item"><div><strong>'+esc(names[item.action]||item.action||'إجراء')+'</strong><small>'+esc(item.targetName||item.targetId||'')+'</small><small>'+esc(stamped(item.createdAt))+'</small></div></article>';
 }).join(''):'<p class="hint">ماكو سجلات بهذا القسم.</p>';
 $('loadMore').hidden=!state.hasMore[type];
 for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===type);
}
async function page(reset=false){
 const type=state.tab;
 if(reset){state.rows[type]=[];state.cursors[type]=null;state.hasMore[type]=true}
 if(!state.hasMore[type]){renderList();return}
 let q=query(collection(state.db,type),orderBy(type==='adminAuditLogs'?'createdAt':documentId(),type==='adminAuditLogs'?'desc':'asc'),limit(PAGE_SIZE));
 if(state.cursors[type])q=query(collection(state.db,type),orderBy(type==='adminAuditLogs'?'createdAt':documentId(),type==='adminAuditLogs'?'desc':'asc'),startAfter(state.cursors[type]),limit(PAGE_SIZE));
 const snap=await getDocs(q);
 state.rows[type].push(...snap.docs.map(x=>({id:x.id,...x.data()})));
 state.cursors[type]=snap.docs.at(-1)||null;
 state.hasMore[type]=snap.size===PAGE_SIZE;
 renderList();
}
async function reload(){
 try{busy(true);flash('');await Promise.all([overview(),page(true)])}
 catch(err){flash(msg(err),true)}finally{busy(false)}
}
async function setSuspension(id){
 const person=state.rows.users.find(x=>x.id===id);
 if(!person||state.busy||id===state.account.uid||String(person.email||'').toLowerCase()===ADMIN_EMAIL)return;
 const change=!person.suspended;
 if(!confirm((change?'إيقاف حساب ':'إعادة تنشيط حساب ')+(person.email||person.name||id)+'؟\n'+(change?'الإيقاف يمنع استخدام Firestore، لكنه لا يلغي حساب تسجيل الدخول.':'')))return;
 try{
  busy(true);
  const batch=writeBatch(state.db);
  const changeData=change?{suspended:true,available:false}:{suspended:false};
  batch.update(doc(state.db,'users',id),changeData);
  batchAudit(batch,change?'suspend_user':'unsuspend_user',id,String(person.email||person.name||id).slice(0,100));
  await batch.commit();
  flash(change?'تم إيقاف حساب المستخدم في Firestore.':'تمت إعادة تنشيط حساب المستخدم.');
  await page(true);
 }catch(err){flash(msg(err),true)}finally{busy(false)}
}
async function archiveProject(id){
 const project=state.rows.projects.find(x=>x.id===id);
 if(!project||state.busy||project.status==='deleting')return;
 const archived=project.status==='archived';
 const name=String(project.name||'');
 if(!name||name.length>100)return flash('اسم التطبيق غير صالح لإجراء الإدارة',true);
 if(!confirm((archived?'إلغاء أرشفة ':'أرشفة ')+name+'؟\n'+(archived?'سيرجع التطبيق لحالته السابقة.':'تتوقف التقارير والرسائل الجديدة المرتبطة بالتطبيق. ولن تُحذف البيانات القديمة.')))return;
 try{
  busy(true);
  const batch=writeBatch(state.db);
  const ref=doc(state.db,'projects',id);
  if(archived){
   const back=String(project.statusBeforeArchive||'');
   if(!['draft','recruiting','completed','paused'].includes(back))throw Error('الحالة السابقة غير معروفة؛ يلزم مراجعة المشروع');
   batch.update(ref,{status:back,statusBeforeArchive:deleteField(),archivedAt:deleteField()});
  }else{
   const current=String(project.status||'recruiting');
   if(!['draft','recruiting','completed','paused'].includes(current))throw Error('حالة المشروع الحالية غير قابلة للأرشفة');
   batch.update(ref,{status:'archived',statusBeforeArchive:current,archivedAt:serverTimestamp()});
  }
  batchAudit(batch,archived?'restore_project':'archive_project',id,name);
  await batch.commit();
  flash(archived?'تمت إعادة التطبيق للحالة السابقة.':'تمت أرشفة التطبيق دون حذف تقاريره ومحادثاته.');
  await Promise.all([overview(),page(true)]);
 }catch(err){flash(msg(err),true)}finally{busy(false)}
}
document.addEventListener('click',async event=>{
 const tab=event.target.closest('[data-tab]');
 if(tab&&!state.busy){
  state.tab=tab.dataset.tab;
  try{busy(true);flash('');await page(true)}catch(err){flash(msg(err),true)}finally{busy(false)}
  return;
 }
 const suspend=event.target.closest('[data-action="suspend"]');
 if(suspend){await setSuspension(suspend.dataset.id);return}
 const archive=event.target.closest('[data-action="archive"]');
 if(archive){await archiveProject(archive.dataset.id);return}
});
$('refresh').addEventListener('click',reload);
$('loadMore').addEventListener('click',async()=>{
 if(state.busy)return;
 try{busy(true);await page()}catch(err){flash(msg(err),true)}finally{busy(false)}
});
if(!window.TESTERHUB_FIREBASE_CONFIG){
 gate('تعذر العثور على إعدادات Firebase. افتح TesterHub من الرابط الرسمي.');
}else{
 const app=initializeApp(window.TESTERHUB_FIREBASE_CONFIG),auth=getAuth(app);
 state.db=getFirestore(app);
 onAuthStateChanged(auth,async account=>{
  state.account=null;
  if(!account){gate('سجّل الدخول إلى TesterHub بحساب المدير المؤكَّد، ثم افتح رابط الإدارة.');return}
  try{
   if(!await authorized(account)){gate('هذا الحساب غير مخوّل للإدارة. يجب تأكيد البريد وإنشاء سجل صلاحية Admin آمن من Firebase Console.');return}
   state.account=account;
   $('gate').hidden=true;$('console').hidden=false;
   $('identity').textContent='حساب المشرف: '+account.email+' • خطة Spark المجانية';
   await reload();
  }catch(err){gate('تعذر التحقق من الصلاحية: '+msg(err))}
 });
}
