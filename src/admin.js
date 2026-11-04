import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,getIdTokenResult} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js';
const $=id=>document.getElementById(id);
const state={tab:'projects',projects:[],users:[],projectsCursor:null,usersCursor:null,busy:false,project:null,jobId:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[c]));
function gate(text){$('gate').hidden=false;$('console').hidden=true;$('gate').textContent=text}
function flash(text,error=false){$('flash').textContent=text;$('flash').className='message'+(error?' error':'')}
function showError(err){const code=String(err?.code||'');flash(code.includes('permission-denied')?'لا توجد صلاحية لهذه العملية. تحقق من حساب المشرف وصلاحيات Firebase.':String(err?.message||err||'حدث خطأ أثناء الاتصال.'),true)}
function buttonBusy(value){state.busy=value;for(const el of document.querySelectorAll('button')){if(el.id!=='cancelDelete')el.disabled=value}if(!value)refreshConfirm()}
function refreshConfirm(){$('executeDelete').disabled=state.busy||!state.project||$('confirmName').value!==state.project.name}
async function call(name,data={}){return (await httpsCallable(state.functions,name)(data)).data}
async function overview(){const result=await call('adminOverview');const labels={users:'المستخدمون',projects:'التطبيقات',assignments:'المشاركات',reports:'التقارير',messages:'الرسائل',adminDeleteJobs:'عمليات الحذف'};$('metrics').innerHTML=Object.entries(labels).map(([k,label])=>'<div class="card metric"><small>'+esc(label)+'</small><strong>'+Number(result.counts[k]||0).toLocaleString('ar-IQ')+'</strong></div>').join('')}
function renderList(){
 const type=state.tab,arr=state[type];
 $('listTitle').textContent=type==='projects'?'إدارة التطبيقات':'إدارة المستخدمين';
 $('items').innerHTML=arr.length?arr.map(item=>{
  if(type==='users')return '<article class="item"><div><strong>'+esc(item.name||'مستخدم')+'</strong><small>'+esc(item.email)+' — '+esc(item.role)+'</small></div><div class="actions"><span class="tag'+(item.suspended?' warn':'')+'">'+esc(item.suspended?'موقوف':item.available?'متاح للاختبار':'حساب مسجل')+'</span><button class="btn secondary small" data-action="suspend-user" data-id="'+esc(item.id)+'">'+(item.suspended?'إعادة تنشيط':'إيقاف الحساب')+'</button></div></article>';
  const deleting=item.status==='deleting',archived=item.status==='archived';
  return '<article class="item"><div><strong>'+esc(item.name||'تطبيق')+'</strong><small>المعرف: '+esc(item.id)+' · المختبرون: '+Number(item.testersCount||0)+'</small><small>الحالة: '+esc(item.status||'recruiting')+'</small></div><div class="actions">'+(deleting?'<button class="btn secondary small" data-action="status" data-id="'+esc(item.id)+'">متابعة الحذف</button>':'<button class="btn secondary small" data-action="archive" data-id="'+esc(item.id)+'">'+(archived?'إلغاء الأرشفة':'أرشفة')+'</button><button class="btn danger small" data-action="delete" data-id="'+esc(item.id)+'">حذف نهائي</button>')+'</div></article>';
 }).join(''):'<p class="hint">ماكو سجلات بهذا القسم.</p>';
 $('loadMore').hidden=!state[type+'Cursor'];
 for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===type);
}
async function loadPage(reset=false){
 const type=state.tab;
 if(reset){state[type]=[];state[type+'Cursor']=null}
 const {items,nextCursor}=await call('adminList',{type,cursor:state[type+'Cursor']});
 state[type].push(...items);state[type+'Cursor']=nextCursor;
 renderList();
}
async function reload(){try{buttonBusy(true);flash('');await Promise.all([overview(),loadPage(true)])}catch(err){showError(err)}finally{buttonBusy(false)}}
async function monitor(id){
 state.jobId=id;
 const {job}=await call('adminDeletionStatus',{projectId:id});
 $('jobPanel').hidden=false;
 if(!job){$('jobState').textContent='لم توجد عملية حذف لهذا التطبيق.';return}
 const progress=Object.entries(job.progress||{}).map(([k,n])=>k+': '+n).join(' • ');
 $('jobState').textContent='الحالة: '+job.status+(progress?' | '+progress:'')+(job.error?' | '+job.error:'');
 $('continueJob').disabled=job.status==='complete';
}
async function deleteProject(){
 if(!state.project||state.busy||$('confirmName').value!==state.project.name)return;
 const project=state.project;
 try{
  buttonBusy(true);
  await call('adminStartProjectDeletion',{projectId:project.id,confirmName:project.name,confirmPermanent:true});
  $('deleteDialog').close();
  state.project=null;
  const result=await call('adminContinueDeletion',{projectId:project.id});
  state.jobId=project.id;
  flash('بدأ الحذف الآمن. سيتم الاستكمال تلقائياً بعد نشر المجدول الخلفي.');
  await Promise.all([overview(),loadPage(true),monitor(project.id)]);
  if(result?.job?.status==='complete')flash('اكتمل الحذف النهائي للتطبيق.');
 }catch(err){showError(err)}
 finally{buttonBusy(false)}
}
document.addEventListener('click',async event=>{
 const tab=event.target.closest('[data-tab]');
 if(tab&&!state.busy){state.tab=tab.dataset.tab;try{buttonBusy(true);await loadPage(true)}catch(e){showError(e)}finally{buttonBusy(false)}return}
 const del=event.target.closest('[data-action="delete"]');
 if(del&&!state.busy){state.project=state.projects.find(x=>x.id===del.dataset.id)||null;if(!state.project)return;$('targetName').textContent=state.project.name;$('confirmName').value='';refreshConfirm();$('deleteDialog').showModal();return}
 const suspension=event.target.closest('[data-action="suspend-user"]');
 if(suspension&&!state.busy){
  const user=state.users.find(x=>x.id===suspension.dataset.id);
  if(!user)return;
  if(!confirm((user.suspended?'إعادة تنشيط الحساب':'إيقاف الحساب')+' — '+user.email+'؟'))return;
  try{buttonBusy(true);await call('adminSetUserSuspension',{userUid:user.id,suspend:!user.suspended});flash(user.suspended?'تمت إعادة تنشيط الحساب':'تم إيقاف الحساب');await loadPage(true)}
  catch(err){showError(err)}finally{buttonBusy(false)}
  return;
 }
 const archiveButton=event.target.closest('[data-action="archive"]');
 if(archiveButton&&!state.busy){
  const project=state.projects.find(x=>x.id===archiveButton.dataset.id);
  if(!project)return;
  const isArchived=project.status==='archived';
  if(!confirm((isArchived?'إلغاء أرشفة':'أرشفة')+' تطبيق '+project.name+'؟'))return;
  try{buttonBusy(true);await call('adminSetProjectArchive',{projectId:project.id,confirmName:project.name,archive:!isArchived});flash(isArchived?'تمت إعادة التطبيق إلى وضعه السابق':'تمت أرشفة التطبيق دون حذف بياناته');await loadPage(true)}
  catch(err){showError(err)}finally{buttonBusy(false)}
  return;
 }
 const stat=event.target.closest('[data-action="status"]');
 if(stat&&!state.busy){try{await monitor(stat.dataset.id)}catch(e){showError(e)}return}
});
$('confirmName').addEventListener('input',refreshConfirm);
$('cancelDelete').addEventListener('click',()=>$('deleteDialog').close());
$('executeDelete').addEventListener('click',deleteProject);
$('refresh').addEventListener('click',reload);
$('loadMore').addEventListener('click',async()=>{if(state.busy)return;try{buttonBusy(true);await loadPage()}catch(e){showError(e)}finally{buttonBusy(false)}});
$('continueJob').addEventListener('click',async()=>{if(!state.jobId||state.busy)return;try{buttonBusy(true);await call('adminContinueDeletion',{projectId:state.jobId});await Promise.all([loadPage(true),overview(),monitor(state.jobId)])}catch(e){showError(e)}finally{buttonBusy(false)}});
if(!window.TESTERHUB_FIREBASE_CONFIG){gate('إعدادات Firebase غير متاحة. يرجى الرجوع إلى التطبيق الأساسي.')}else{
 const app=initializeApp(window.TESTERHUB_FIREBASE_CONFIG),auth=getAuth(app);
 state.functions=getFunctions(app,'us-central1');
 onAuthStateChanged(auth,async account=>{
  if(!account){gate('سجّل الدخول إلى TesterHub بحساب المشرف أولاً، ثم افتح صفحة الإدارة.');return}
  try{
   const result=await getIdTokenResult(account,true),claims=result.claims;
   if(claims.testerhubAdmin!==true||claims.email_verified!==true||String(account.email||'').toLowerCase()!=='dhi98886@gmail.com'){
    gate('هذا الحساب لا يمتلك صلاحية إدارة TesterHub. يجب تفعيل Custom Claim من جهة Firebase بعد تأكيد البريد.');return
   }
   $('gate').hidden=true;$('console').hidden=false;$('identity').textContent='حساب الإدارة: '+String(account.email);
   await reload();
  }catch(err){gate('تعذّر التحقق من صلاحية المشرف: '+String(err?.message||err))}
 });
}
