import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,getIdTokenResult} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import * as firestore from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const {getFirestore,doc,getDoc,collection,query,where,orderBy,documentId,limit,startAfter,getDocs,getCountFromServer,writeBatch,serverTimestamp,deleteField}=firestore;

const $=id=>document.getElementById(id);
const PAGE_SIZE=25;
const PERMISSIONS=[
 ['viewUsers','عرض المستخدمين','يرى الأسماء والإيميلات'],
 ['suspendUsers','إيقاف الحسابات وتنشيطها','يتضمن عرض المستخدمين'],
 ['archiveProjects','أرشفة التطبيقات وإرجاعها',''],
 ['deleteProjects','حذف التطبيقات نهائياً','يتيح قراءة تقارير ورسائل كل التطبيقات، فامنحه لمن تثق به فقط'],
 ['viewReports','عرض بلاغات المشاكل',''],
 ['processDeletions','معالجة طلبات حذف الحسابات','يرى إيميلات أصحاب الطلبات'],
 ['viewAudit','عرض سجل الإدارة','']
];
const TABS={
 projects:{title:'التطبيقات',order:()=>documentId(),search:'اسم التطبيق'},
 users:{title:'المستخدمون',perm:'viewUsers',order:()=>documentId(),search:'البريد الكامل'},
 issues:{title:'بلاغات المشاكل',perm:'viewReports',collection:'reports',order:()=>'date',desc:true,filter:()=>where('outcome','==','issue')},
 deletionRequests:{title:'طلبات حذف الحسابات',perm:'processDeletions',order:()=>'createdAt',desc:true},
 staffRoles:{title:'المشرفون',ownerOnly:true,order:()=>'grantedAt',desc:true},
 adminAuditLogs:{title:'سجل إجراءات الإدارة',perm:'viewAudit',order:()=>'createdAt',desc:true}
};
const STATUS={draft:['مسودة',''],recruiting:['يستقبل المختبرين','good'],paused:['متوقف','warn'],completed:['مكتمل',''],archived:['مؤرشف','warn'],deleting:['حذف غير مكتمل','bad']};
const state={tab:'projects',rows:[],cursor:null,hasMore:false,filter:'',details:{},busy:false,account:null,db:null,owner:false,perms:{},staffIds:new Set()};
// Hides what this account cannot use; the security rules are what actually enforce it.
const allowed=permission=>state.owner||state.perms[permission]===true;
const tabAllowed=name=>TABS[name].ownerOnly?state.owner:!TABS[name].perm||allowed(TABS[name].perm);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const msg=err=>String(err?.code||'').includes('permission-denied')?'رُفضت العملية. تأكد من صلاحية الإدارة.':String(err?.message||err||'تعذر تنفيذ العملية.');
// The Arabic-Indic zero looks like a dot, which is misleading in a metrics panel.
const stamped=v=>v?.toDate?.().toLocaleString('ar-IQ-u-nu-latn')||'—';
const number=n=>Number(n).toLocaleString('en-US');

let toastTimer;
function toast(text,error=false){
 const el=$('toast');el.textContent=text;el.className='show'+(error?' error':'');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.className=''},error?6000:3200);
}
function gate(html){$('gate').hidden=false;$('console').hidden=true;$('tabs').hidden=true;$('gate').innerHTML=html}
function busy(value){state.busy=value;for(const b of document.querySelectorAll('main button,#tabs button'))b.disabled=value}
function batchAudit(batch,action,targetId,targetName){
 batch.set(doc(collection(state.db,'adminAuditLogs')),{actorUid:state.account.uid,action,targetId,targetName:String(targetName||targetId).slice(0,100),createdAt:serverTimestamp()});
}
// When `typed` is set, the confirm button stays disabled until that exact text is entered.
function confirmDialog({title,body='',action='تأكيد',danger=false,typed=null}){
 return new Promise(resolve=>{
  const el=document.createElement('dialog');
  el.innerHTML='<form method="dialog"><h2>'+esc(title)+'</h2>'+(body?'<p>'+esc(body)+'</p>':'')+(typed?'<label for="typed">اكتب اسم التطبيق للتأكيد: '+esc(typed)+'</label><input id="typed" autocomplete="off">':'')+'<footer><button class="btn soft" value="cancel" formnovalidate>إلغاء</button><button class="btn '+(danger?'solid-danger':'')+'" value="ok" id="ok"'+(typed?' disabled':'')+'>'+esc(action)+'</button></footer></form>';
  document.body.append(el);
  if(typed)el.querySelector('#typed').addEventListener('input',e=>{el.querySelector('#ok').disabled=e.target.value.trim()!==String(typed).trim()});
  el.addEventListener('close',()=>{const ok=el.returnValue==='ok';el.remove();resolve(ok)});
  el.showModal();
 });
}
// Returns the ticked permissions, or null if cancelled. Suspending needs seeing users, so it brings that along.
function permissionsDialog({title,current={},action}){
 return new Promise(resolve=>{
  const el=document.createElement('dialog');
  el.innerHTML='<form method="dialog"><h2>'+esc(title)+'</h2><p>اختر ما يستطيع هذا المشرف فعله فقط. يرى قائمة التطبيقات دائماً، ويجب أن يكون بريده مؤكداً.</p>'+PERMISSIONS.map(p=>'<label class="perm"><input type="checkbox" name="'+p[0]+'"'+(current[p[0]]===true?' checked':'')+'><span>'+esc(p[1])+(p[2]?'<small>'+esc(p[2])+'</small>':'')+'</span></label>').join('')+'<footer><button class="btn soft" value="cancel" formnovalidate>إلغاء</button><button class="btn" value="ok" id="ok">'+esc(action)+'</button></footer></form>';
  document.body.append(el);
  const box=name=>el.querySelector('input[name="'+name+'"]');
  const sync=()=>{if(box('suspendUsers').checked)box('viewUsers').checked=true;el.querySelector('#ok').disabled=!PERMISSIONS.some(p=>box(p[0]).checked)};
  el.addEventListener('change',sync);sync();
  el.addEventListener('close',()=>{const ok=el.returnValue==='ok',result=Object.fromEntries(PERMISSIONS.map(p=>[p[0],box(p[0]).checked]));el.remove();resolve(ok?result:null)});
  el.showModal();
 });
}
async function loadStaffIds(){
 if(!state.owner)return;
 const snap=await getDocs(query(collection(state.db,'staffRoles'),limit(100)));
 state.staffIds=new Set(snap.docs.map(x=>x.id));
}
async function promoteUser(person){
 busy(false);
 const permissions=await permissionsDialog({title:'ترقية '+(person.email||person.name)+' إلى مشرف',action:'ترقية'});
 busy(true);
 if(!permissions)return false;
 const batch=writeBatch(state.db);
 batch.set(doc(state.db,'staffRoles',person.id),{active:true,permissions,email:String(person.email||'').slice(0,200),name:String(person.name||'').slice(0,100),grantedBy:state.account.uid,grantedAt:serverTimestamp()});
 batchAudit(batch,'grant_staff',person.id,person.email||person.name);
 await batch.commit();
 state.staffIds.add(person.id);
 toast('أصبح هذا الحساب مشرفاً، ويرى لوحة الإدارة بعد إعادة فتحها.');
}
async function editStaff(member){
 busy(false);
 const permissions=await permissionsDialog({title:'صلاحيات '+(member.email||member.name),current:member.permissions,action:'حفظ'});
 busy(true);
 if(!permissions)return false;
 const batch=writeBatch(state.db);
 batch.update(doc(state.db,'staffRoles',member.id),{permissions,grantedBy:state.account.uid,grantedAt:serverTimestamp()});
 batchAudit(batch,'update_staff',member.id,member.email||member.name);
 await batch.commit();
 member.permissions=permissions;
 toast('حُفظت الصلاحيات.');
}
async function revokeStaff(member){
 const batch=writeBatch(state.db);
 batch.delete(doc(state.db,'staffRoles',member.id));
 batchAudit(batch,'revoke_staff',member.id,member.email||member.name);
 await batch.commit();
 state.staffIds.delete(member.id);
 state.rows=state.rows.filter(x=>x.id!==member.id);
 toast('سُحبت الصلاحيات، وبقي حسابه العادي كما هو.');
}
async function authorized(account){
 const token=await getIdTokenResult(account,true);
 if(token.claims.email_verified!==true)return false;
 const role=await getDoc(doc(state.db,'adminRoles',account.uid));
 if(role.exists()&&role.data().active===true){state.owner=true;return true}
 const staff=await getDoc(doc(state.db,'staffRoles',account.uid));
 if(!staff.exists()||staff.data().active!==true)return false;
 state.owner=false;state.perms=staff.data().permissions||{};
 return true;
}
async function overview(){
 const all=[['users','المستخدمون',allowed('viewUsers')],['projects','التطبيقات',true],['assignments','المشاركات',allowed('deleteProjects')],['reports','التقارير',allowed('deleteProjects')||allowed('viewReports')],['messages','الرسائل',allowed('deleteProjects')]].filter(x=>x[2]);
 const counts=await Promise.all(all.map(x=>getCountFromServer(collection(state.db,x[0]))));
 $('metrics').innerHTML=all.map((x,i)=>'<div class="metric"><small>'+esc(x[1])+'</small><strong>'+number(counts[i].data().count)+'</strong></div>').join('');
}
const button=(action,id,label,tone='soft')=>'<button class="btn '+tone+'" type="button" data-action="'+action+'" data-id="'+esc(id)+'">'+label+'</button>';
function projectRow(item){
 const status=item.status||'recruiting',[label,tone]=STATUS[status]||[status,''],d=state.details[item.id];
 const archived=status==='archived',deleting=status==='deleting';
 return '<article class="item"><div class="info"><strong>'+esc(item.name||'تطبيق')+'</strong><small>المطور: '+esc(item.ownerName||'—')+'</small></div><div class="actions"><span class="tag '+tone+'">'+esc(label)+'</span>'+(allowed('deleteProjects')?button('details',item.id,d?'إخفاء':'تفاصيل'):'')+(deleting||!allowed('archiveProjects')?'':button('archive',item.id,archived?'إلغاء الأرشفة':'أرشفة','warn'))+(allowed('deleteProjects')?button('delete',item.id,deleting?'إكمال الحذف':'حذف','danger'):'')+'</div>'+(d?'<div class="detail">'+(item.link?'<div dir="ltr">'+esc(item.link)+'</div>':'')+'المعرّف: <span dir="ltr">'+esc(item.id)+'</span><br>المشاركات: '+number(d.assignments)+' · التقارير: '+number(d.reports)+' · الرسائل: '+number(d.messages)+'</div>':'')+'</article>';
}
function userRow(item){
 const self=item.id===state.account.uid;
 const isStaff=state.staffIds.has(item.id);
 const tag=(isStaff?'<span class="tag">مشرف</span>':'')+(item.suspended?'<span class="tag bad">موقوف</span>':item.available?'<span class="tag good">متاح للاختبار</span>':'<span class="tag">مسجّل</span>');
 return '<article class="item"><div class="info"><strong>'+esc(item.name||'مستخدم')+'</strong><small dir="ltr" style="text-align:right">'+esc(item.email||'')+'</small><small>'+(item.role==='developer'?'مطور':'مختبر')+'</small></div><div class="actions">'+tag+(self?'<span class="tag">حسابك</span>':(state.owner&&!isStaff?button('promote',item.id,'ترقية إلى مشرف'):'')+(allowed('suspendUsers')&&(state.owner||!isStaff)?button('suspend',item.id,item.suspended?'إعادة التنشيط':'إيقاف الحساب',item.suspended?'soft':'danger'):''))+'</div></article>';
}
function issueRow(item){
 const fixed=item.status==='fixed';
 return '<article class="item"><div class="info"><strong>'+esc(item.notes||'بلاغ')+'</strong><small>'+esc(item.tested||'')+'</small><small>'+esc(item.date||'')+'</small></div><span class="tag '+(fixed?'good':'warn')+'">'+(fixed?'تم الإصلاح':'مفتوح')+'</span></article>';
}
function auditRow(item){
 const names={suspend_user:'إيقاف حساب',unsuspend_user:'إعادة تنشيط حساب',archive_project:'أرشفة تطبيق',restore_project:'إلغاء أرشفة تطبيق',delete_project:'حذف تطبيق نهائياً',process_deletion:'معالجة طلب حذف حساب',grant_staff:'ترقية مشرف',update_staff:'تعديل صلاحيات مشرف',revoke_staff:'سحب صلاحيات مشرف'};
 return '<article class="item"><div class="info"><strong>'+esc(names[item.action]||item.action||'إجراء')+'</strong><small>'+esc(item.targetName||item.targetId||'')+'</small></div><small>'+esc(stamped(item.createdAt))+'</small></article>';
}
function staffRow(item){
 const list=PERMISSIONS.filter(p=>item.permissions?.[p[0]]===true).map(p=>p[1]).join('، ')||'بلا صلاحيات';
 return '<article class="item"><div class="info"><strong>'+esc(item.name||'مشرف')+'</strong><small dir="ltr" style="text-align:right">'+esc(item.email||item.id)+'</small><small>'+esc(list)+'</small></div><div class="actions">'+button('edit-staff',item.id,'تعديل الصلاحيات')+button('revoke-staff',item.id,'سحب الصلاحيات','danger')+'</div></article>';
}
function deletionRow(item){
 return '<article class="item"><div class="info"><strong dir="ltr" style="text-align:right">'+esc(item.email||item.id)+'</strong><small>'+esc(stamped(item.createdAt))+'</small></div>'+(item.status==='open'?button('process-deletion',item.id,'تمت المعالجة'):'<span class="tag good">تمت المعالجة</span>')+'</article>';
}
const ROWS={projects:projectRow,users:userRow,issues:issueRow,staffRoles:staffRow,deletionRequests:deletionRow,adminAuditLogs:auditRow};
function renderList(){
 const type=state.tab,source=TABS[type];
 const needle=state.filter.trim().toLowerCase();
 const rows=type==='projects'&&needle?state.rows.filter(x=>String(x.name||'').toLowerCase().includes(needle)):state.rows;
 $('listTitle').textContent=source.title;
 $('search').hidden=!source.search;
 $('searchInput').placeholder=source.search||'';
 // App names filter as you type; only the email lookup needs a button.
 $('searchButton').hidden=type!=='users';
 $('items').innerHTML=rows.length?rows.map(ROWS[type]).join(''):'<p class="none">لا توجد سجلات هنا.</p>';
 $('more').hidden=!state.hasMore;
 for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===type);
}
async function page(reset=false){
 const source=TABS[state.tab];
 if(reset){state.rows=[];state.cursor=null;state.hasMore=false;state.details={}}
 const parts=[collection(state.db,source.collection||state.tab)];
 if(source.filter)parts.push(source.filter());
 parts.push(orderBy(source.order(),source.desc?'desc':'asc'));
 if(state.cursor)parts.push(startAfter(state.cursor));
 parts.push(limit(PAGE_SIZE));
 const q=query(...parts);
 const snap=await getDocs(q);
 state.rows.push(...snap.docs.map(x=>({id:x.id,...x.data()})));
 state.cursor=snap.docs.at(-1)||null;
 state.hasMore=snap.size===PAGE_SIZE;
 renderList();
}
async function guarded(work){
 if(state.busy)return;
 try{busy(true);await work()}catch(err){console.warn(err);toast(msg(err),true)}finally{busy(false)}
}
async function setSuspension(person){
 const change=!person.suspended;
 const batch=writeBatch(state.db);
 batch.update(doc(state.db,'users',person.id),change?{suspended:true,available:false}:{suspended:false});
 batchAudit(batch,change?'suspend_user':'unsuspend_user',person.id,person.email||person.name);
 await batch.commit();
 person.suspended=change;if(change)person.available=false;
 toast(change?'تم إيقاف الحساب.':'تمت إعادة تنشيط الحساب.');
}
async function archiveProject(project){
 const archived=project.status==='archived';
 const batch=writeBatch(state.db),ref=doc(state.db,'projects',project.id);
 if(archived){
  const back=String(project.statusBeforeArchive||'');
  if(!['draft','recruiting','completed','paused'].includes(back))throw Error('الحالة السابقة غير معروفة؛ يلزم مراجعة المشروع');
  batch.update(ref,{status:back,statusBeforeArchive:deleteField(),archivedAt:deleteField()});
  project.status=back;delete project.statusBeforeArchive;
 }else{
  const current=String(project.status||'recruiting');
  batch.update(ref,{status:'archived',statusBeforeArchive:current,archivedAt:serverTimestamp()});
  project.status='archived';project.statusBeforeArchive=current;
 }
 batchAudit(batch,archived?'restore_project':'archive_project',project.id,project.name);
 await batch.commit();
 toast(archived?'تمت إعادة التطبيق لحالته السابقة.':'تمت أرشفة التطبيق دون حذف بياناته.');
}
async function loadDetails(project){
 if(state.details[project.id]){delete state.details[project.id];return}
 state.details[project.id]=await TesterHubDeletion.countRelated({db:state.db,f:firestore,projectId:project.id});
}
async function removeProject(project){
 const counts=await TesterHubDeletion.countRelated({db:state.db,f:firestore,projectId:project.id});
 busy(false);
 const ok=await confirmDialog({title:'حذف '+(project.name||'التطبيق')+' نهائياً؟',body:'لا يمكن التراجع عن هذا الحذف.\nسيُحذف مع '+number(counts.assignments)+' مشاركة و'+number(counts.reports)+' تقرير و'+number(counts.messages)+' رسالة، وتختفي من حسابات المطور والمختبرين.',action:'حذف نهائي',danger:true,typed:project.name||project.id});
 busy(true);
 if(!ok)return false;
 await TesterHubDeletion.deleteProject({db:state.db,f:firestore,projectId:project.id,audit:batch=>batchAudit(batch,'delete_project',project.id,project.name)});
 state.rows=state.rows.filter(x=>x.id!==project.id);
 toast('تم حذف التطبيق وكل بياناته.');
}
async function processDeletion(item){
 const batch=writeBatch(state.db);
 batch.update(doc(state.db,'deletionRequests',item.id),{status:'processed',processedAt:serverTimestamp()});
 batchAudit(batch,'process_deletion',item.id,item.email);
 await batch.commit();
 item.status='processed';
 toast('سُجّل الطلب كمعالَج.');
}
const PROMPTS={
 'revoke-staff':item=>({title:'سحب صلاحيات '+(item.email||item.name)+'؟',body:'يفقد الوصول إلى لوحة الإدارة فوراً، ويبقى حسابه العادي كما هو.',danger:true}),
 'process-deletion':item=>({title:'هل نفّذت الحذف فعلاً؟',body:'نفّذ الحذف أولاً من Firebase Console: احذف حساب '+(item.email||item.id)+' من Authentication، ومستند users الخاص به من Firestore، ثم أكد هنا.',action:'نعم، نُفّذ'}),
 suspend:item=>({title:(item.suspended?'إعادة تنشيط ':'إيقاف ')+(item.email||item.name||item.id)+'؟',body:item.suspended?'':'الإيقاف يمنع استخدام البيانات فوراً وتبقى بياناته محفوظة. حساب الدخول نفسه يُعطَّل من Firebase Console.',danger:!item.suspended}),
 archive:item=>({title:(item.status==='archived'?'إلغاء أرشفة ':'أرشفة ')+item.name+'؟',body:item.status==='archived'?'':'تتوقف التقارير والرسائل الجديدة، ولا تُحذف البيانات القديمة.'})
};
const ACTIONS={promote:promoteUser,'edit-staff':editStaff,'revoke-staff':revokeStaff,'process-deletion':processDeletion,suspend:setSuspension,archive:archiveProject,details:loadDetails,delete:removeProject};
document.addEventListener('click',event=>{
 const tab=event.target.closest('[data-tab]');
 if(tab){state.tab=tab.dataset.tab;state.filter='';$('searchInput').value='';guarded(()=>page(true));return}
 const trigger=event.target.closest('[data-action]');
 if(!trigger||state.busy)return;
 const item=state.rows.find(x=>x.id===trigger.dataset.id),name=trigger.dataset.action;
 if(!item)return;
 guarded(async()=>{
  if(PROMPTS[name]){busy(false);const ok=await confirmDialog(PROMPTS[name](item));busy(true);if(!ok)return}
  const done=await ACTIONS[name](item);
  renderList();
  if(!['details','promote','edit-staff','revoke-staff'].includes(name)&&done!==false)await overview();
 });
});
$('refresh').addEventListener('click',()=>guarded(()=>Promise.all([overview(),page(true)])));
$('more').addEventListener('click',()=>guarded(()=>page()));
$('searchInput').addEventListener('input',event=>{if(state.tab==='projects'){state.filter=event.target.value;renderList()}});
$('search').addEventListener('submit',event=>{
 event.preventDefault();
 const value=$('searchInput').value.trim().toLowerCase();
 if(state.tab!=='users')return;
 guarded(async()=>{
  if(!value)return page(true);
  const snap=await getDocs(query(collection(state.db,'users'),where('email','==',value),limit(5)));
  state.rows=snap.docs.map(x=>({id:x.id,...x.data()}));state.hasMore=false;
  renderList();
 });
});
if(!window.TESTERHUB_FIREBASE_CONFIG){
 gate('تعذر تحميل الإعدادات. افتح TesterHub من الرابط الرسمي.');
}else{
 const app=initializeApp(window.TESTERHUB_FIREBASE_CONFIG),auth=getAuth(app);
 state.db=getFirestore(app);
 onAuthStateChanged(auth,async account=>{
  state.account=null;
  if(!account){gate('هذه الصفحة لإدارة المنصة. <a href="./index.html">سجّل الدخول إلى TesterHub</a> بحساب الإدارة ثم ارجع إليها.');return}
  try{
   if(!await authorized(account)){gate('هذا الحساب لا يملك صلاحية الإدارة. <a href="./index.html">العودة للتطبيق</a>');return}
   state.account=account;
   $('gate').hidden=true;$('console').hidden=false;$('tabs').hidden=false;
   $('identity').textContent=(state.owner?'مالك المشروع: ':'حساب المشرف: ')+account.email;
   for(const b of document.querySelectorAll('[data-tab]'))b.hidden=!tabAllowed(b.dataset.tab);
   await guarded(()=>Promise.all([overview(),loadStaffIds(),page(true)]));
  }catch(err){gate('تعذر التحقق من الصلاحية: '+esc(msg(err)))}
 });
}
