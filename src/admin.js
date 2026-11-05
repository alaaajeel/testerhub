import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,getIdTokenResult} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import * as firestore from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const {getFirestore,doc,getDoc,collection,query,where,orderBy,documentId,limit,startAfter,getDocs,getCountFromServer,writeBatch,serverTimestamp,deleteField}=firestore;

const $=id=>document.getElementById(id);
const PAGE_SIZE=25;
const TABS={
 projects:{title:'التطبيقات',order:()=>documentId(),search:'اسم التطبيق'},
 users:{title:'المستخدمون',order:()=>documentId(),search:'البريد الكامل'},
 issues:{title:'بلاغات المشاكل',collection:'reports',order:()=>'date',desc:true,filter:()=>where('outcome','==','issue')},
 adminAuditLogs:{title:'سجل إجراءات الإدارة',order:()=>'createdAt',desc:true}
};
const STATUS={draft:['مسودة',''],recruiting:['يستقبل المختبرين','good'],paused:['متوقف','warn'],completed:['مكتمل',''],archived:['مؤرشف','warn'],deleting:['حذف غير مكتمل','bad']};
const state={tab:'projects',rows:[],cursor:null,hasMore:false,filter:'',details:{},busy:false,account:null,db:null};
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
async function authorized(account){
 const token=await getIdTokenResult(account,true);
 if(token.claims.email_verified!==true)return false;
 const role=await getDoc(doc(state.db,'adminRoles',account.uid));
 return role.exists()&&role.data().active===true;
}
async function overview(){
 const names=['users','projects','assignments','reports','messages'];
 const titles=['المستخدمون','التطبيقات','المشاركات','التقارير','الرسائل'];
 const counts=await Promise.all(names.map(n=>getCountFromServer(collection(state.db,n))));
 $('metrics').innerHTML=names.map((name,i)=>'<div class="metric"><small>'+esc(titles[i])+'</small><strong>'+number(counts[i].data().count)+'</strong></div>').join('');
}
const button=(action,id,label,tone='soft')=>'<button class="btn '+tone+'" type="button" data-action="'+action+'" data-id="'+esc(id)+'">'+label+'</button>';
function projectRow(item){
 const status=item.status||'recruiting',[label,tone]=STATUS[status]||[status,''],d=state.details[item.id];
 const archived=status==='archived',deleting=status==='deleting';
 return '<article class="item"><div class="info"><strong>'+esc(item.name||'تطبيق')+'</strong><small>المطور: '+esc(item.ownerName||'—')+'</small></div><div class="actions"><span class="tag '+tone+'">'+esc(label)+'</span>'+button('details',item.id,d?'إخفاء':'تفاصيل')+(deleting?'':button('archive',item.id,archived?'إلغاء الأرشفة':'أرشفة','warn'))+button('delete',item.id,deleting?'إكمال الحذف':'حذف','danger')+'</div>'+(d?'<div class="detail">'+(item.link?'<div dir="ltr">'+esc(item.link)+'</div>':'')+'المعرّف: <span dir="ltr">'+esc(item.id)+'</span><br>المشاركات: '+number(d.assignments)+' · التقارير: '+number(d.reports)+' · الرسائل: '+number(d.messages)+'</div>':'')+'</article>';
}
function userRow(item){
 const self=item.id===state.account.uid;
 const tag=item.suspended?'<span class="tag bad">موقوف</span>':item.available?'<span class="tag good">متاح للاختبار</span>':'<span class="tag">مسجّل</span>';
 return '<article class="item"><div class="info"><strong>'+esc(item.name||'مستخدم')+'</strong><small dir="ltr" style="text-align:right">'+esc(item.email||'')+'</small><small>'+(item.role==='developer'?'مطور':'مختبر')+'</small></div><div class="actions">'+tag+(self?'<span class="tag">حسابك</span>':button('suspend',item.id,item.suspended?'إعادة التنشيط':'إيقاف الحساب',item.suspended?'soft':'danger'))+'</div></article>';
}
function issueRow(item){
 const fixed=item.status==='fixed';
 return '<article class="item"><div class="info"><strong>'+esc(item.notes||'بلاغ')+'</strong><small>'+esc(item.tested||'')+'</small><small>'+esc(item.date||'')+'</small></div><span class="tag '+(fixed?'good':'warn')+'">'+(fixed?'تم الإصلاح':'مفتوح')+'</span></article>';
}
function auditRow(item){
 const names={suspend_user:'إيقاف حساب',unsuspend_user:'إعادة تنشيط حساب',archive_project:'أرشفة تطبيق',restore_project:'إلغاء أرشفة تطبيق',delete_project:'حذف تطبيق نهائياً'};
 return '<article class="item"><div class="info"><strong>'+esc(names[item.action]||item.action||'إجراء')+'</strong><small>'+esc(item.targetName||item.targetId||'')+'</small></div><small>'+esc(stamped(item.createdAt))+'</small></article>';
}
const ROWS={projects:projectRow,users:userRow,issues:issueRow,adminAuditLogs:auditRow};
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
const PROMPTS={
 suspend:item=>({title:(item.suspended?'إعادة تنشيط ':'إيقاف ')+(item.email||item.name||item.id)+'؟',body:item.suspended?'':'الإيقاف يمنع استخدام البيانات فوراً وتبقى بياناته محفوظة. حساب الدخول نفسه يُعطَّل من Firebase Console.',danger:!item.suspended}),
 archive:item=>({title:(item.status==='archived'?'إلغاء أرشفة ':'أرشفة ')+item.name+'؟',body:item.status==='archived'?'':'تتوقف التقارير والرسائل الجديدة، ولا تُحذف البيانات القديمة.'})
};
const ACTIONS={suspend:setSuspension,archive:archiveProject,details:loadDetails,delete:removeProject};
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
  if(name!=='details'&&done!==false)await overview();
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
 gate('تعذر العثور على إعدادات Firebase. افتح TesterHub من الرابط الرسمي.');
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
   $('identity').textContent='حساب المشرف: '+account.email;
   await guarded(()=>Promise.all([overview(),page(true)]));
  }catch(err){gate('تعذر التحقق من الصلاحية: '+esc(msg(err)))}
 });
}
