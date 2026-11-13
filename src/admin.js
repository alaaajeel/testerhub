import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,getIdTokenResult} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import * as firestore from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
const {getFirestore,doc,getDoc,collection,query,where,orderBy,documentId,limit,startAfter,getDocs,getCountFromServer,writeBatch,serverTimestamp,deleteField,addDoc,Timestamp}=firestore;

const $=id=>document.getElementById(id);
const PAGE_SIZE=25;
const PERMISSIONS=[
 ['viewUsers','عرض المستخدمين','يرى الأسماء والإيميلات'],
 ['suspendUsers','إيقاف الحسابات وتنشيطها','يتضمن عرض المستخدمين'],
 ['archiveProjects','أرشفة التطبيقات وإرجاعها',''],
 ['deleteProjects','حذف التطبيقات نهائياً','يتيح قراءة تقارير ورسائل كل التطبيقات، فامنحه لمن تثق به فقط'],
 ['viewReports','عرض بلاغات المشاكل',''],
 ['processDeletions','معالجة طلبات حذف الحسابات','يرى إيميلات أصحاب الطلبات'],
 ['viewAudit','عرض سجل الإدارة',''],
 ['sendAnnouncements','إرسال إعلانات الإدارة','لكل المستخدمين أو المطورين أو المختبرين، أو لمستخدم محدد']
];
const TABS={
 projects:{title:'التطبيقات',order:()=>documentId(),search:'اسم التطبيق'},
 assignments:{title:'المشاركات',ownerOnly:true,order:()=>documentId(),note:'كل مشاركة هي دعوة مختبر واحد إلى تطبيق واحد، وفيها حالة الدعوة وأيام الاختبار وعدد التقارير. فإذا دعا مطور 12 مختبراً فهذه 12 مشاركة.'},
 reportsAll:{title:'كل التقارير',ownerOnly:true,collection:'reports',order:()=>'date',desc:true,note:'التقارير اليومية التي يرسلها المختبرون، الأحدث أولاً.'},
 messages:{title:'رسائل المستخدمين فيما بينهم',ownerOnly:true,order:()=>'createdAt',desc:true,note:'المحادثات بين المطورين والمختبرين داخل كل اختبار، الأحدث أولاً.'},
 support:{title:'رسائل الإدارة',ownerOnly:true,note:'محادثات خاصة بينك وبين كل مستخدم. يصله الإشعار ويرد من داخل التطبيق.'},
 users:{title:'المستخدمون',perm:'viewUsers',order:()=>documentId(),search:'البريد الكامل'},
 issues:{title:'بلاغات المشاكل',perm:'viewReports',collection:'reports',order:()=>'date',desc:true,filter:()=>where('outcome','in',['issue','blocked'])},
 deletionRequests:{title:'طلبات حذف الحسابات',perm:'processDeletions',order:()=>'createdAt',desc:true},
 staffRoles:{title:'المشرفون',ownerOnly:true,order:()=>'grantedAt',desc:true},
 adminAuditLogs:{title:'سجل إجراءات الإدارة',perm:'viewAudit',order:()=>'createdAt',desc:true},
 help:{title:'مركز المساعدة',ownerOnly:true,note:'الشروحات الأساسية تأتي مع التطبيق. تگدر تعدّلها أو تخفيها أو تضيف شروحات جديدة بنص وصور وفيديو (روابط https فقط، بدون رفع ملفات على الخطة المجانية). المسودة ما تظهر للمستخدمين، وكل حفظ أو حذف ينسجل بسجل الإدارة.'},
 activity:{title:'مراقبة النشاط',perm:'viewUsers',note:'الحالة تقديرية وليست لحظية: «متصل الآن» = ظهر خلال آخر دقيقتين، «نشط اليوم» = خلال 24 ساعة. التطبيق يسجّل الظهور فقط وهو مفتوح على الشاشة ومتصل بالإنترنت. المستخدم الذي لم يفتح التطبيق بعد هذا التحديث يظهر غير نشط.'},
 features:{title:'الميزات قيد التجربة',ownerOnly:true,note:'كل ميزة هنا معطّلة افتراضياً. تفعيلها يظهرها لكل المستخدمين فوراً، وإيقافها يخفيها بدون حذف أي بيانات. كل تغيير ينحفظ بسجل الإدارة.'},
 announcements:{title:'مركز إشعارات الإدارة',perm:'sendAnnouncements',order:()=>'createdAt',desc:true}
};
const STATUS={draft:['مسودة',''],recruiting:['يستقبل المختبرين','good'],paused:['متوقف','warn'],completed:['مكتمل',''],archived:['مؤرشف','warn'],deleting:['حذف غير مكتمل','bad']};
const state={thread:null,threadMessages:[],tab:'projects',rows:[],cursor:null,hasMore:false,filter:'',details:{},busy:false,account:null,db:null,owner:false,perms:{},staffIds:new Set()};
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
// Owner views name the people and apps behind every record. Names are read once and kept.
const PEOPLE=new Map(),APPS=new Map();
async function nameUsers(uids){
 const missing=[...new Set(uids.filter(u=>u&&!PEOPLE.has(u)))];
 await Promise.all(missing.map(async uid=>{try{const s=await getDoc(doc(state.db,'users',uid));PEOPLE.set(uid,s.exists()?s.data():null)}catch{}}));
}
async function nameApps(ids){
 const missing=[...new Set(ids.filter(i=>i&&!APPS.has(i)))];
 await Promise.all(missing.map(async id=>{try{const s=await getDoc(doc(state.db,'projects',id));APPS.set(id,s.exists()?s.data():null)}catch{}}));
}
const person=uid=>{if(!PEOPLE.has(uid))return 'مستخدم';const p=PEOPLE.get(uid);return p?(p.name||p.email||'مستخدم'):'حساب محذوف'};
const personEmail=uid=>PEOPLE.get(uid)?.email||'';
const appName=(id,fallback)=>{if(!APPS.has(id))return fallback||'تطبيق';const a=APPS.get(id);return a?(a.name||fallback||'تطبيق'):(fallback?fallback+' (محذوف)':'تطبيق محذوف')};
const timeOf=m=>m.createdAt?.toMillis?.()??(Date.parse(m.at||'')||0);
async function enrich(rows){
 if(!['assignments','reportsAll','messages','issues'].includes(state.tab))return;
 const people=state.owner||allowed('viewUsers')?rows.flatMap(r=>[r.testerUid,r.ownerUid,r.senderUid]):[];
 await Promise.all([nameUsers(people),nameApps(rows.map(r=>r.projectId))]);
}
function participationState(a){
 if(a.leftAt)return ['انسحب','bad'];
 if(a.joinedDay){
  const day=Math.floor((Date.now()-Date.parse(a.joinedDay+'T00:00:00Z'))/86400000)+1,count=(a.checkins||[]).length;
  return day>14?['أكمل المدة · '+count+' تقرير','']:['اليوم '+day+' من 14 · '+count+' تقرير','good'];
 }
 if(a.invitationStatus==='declined')return ['رفض الدعوة','warn'];
 if(a.invitationStatus==='pending')return ['لم يرد على الدعوة',''];
 return ['قبل ولم يبدأ بعد',''];
}
function assignmentRow(a){
 const [label,tone]=participationState(a);
 return '<article class="item"><div class="info"><strong>'+esc(appName(a.projectId,a.name))+'</strong><small>المختبر: '+esc(person(a.testerUid))+(personEmail(a.testerUid)?' · <span dir="ltr">'+esc(personEmail(a.testerUid))+'</span>':'')+'</small><small>المطور: '+esc(person(a.ownerUid))+'</small></div><div class="actions"><span class="tag '+tone+'">'+esc(label)+'</span>'+button('message-user',a.testerUid,'مراسلة المختبر')+'</div></article>';
}
function reportRow(r){
 const issue=r.outcome==='issue',tag=!issue?['نجح','good']:r.status==='fixed'?['مشكلة أُصلحت','good']:['مشكلة مفتوحة','warn'];
 return '<article class="item"><div class="info"><strong>'+esc(r.notes||'تقرير بلا ملاحظة')+'</strong><small>'+esc(appName(r.projectId))+' · '+esc(person(r.testerUid))+' · '+esc(r.date||'')+'</small>'+(r.tested?'<small>المهمة: '+esc(r.tested)+'</small>':'')+'</div><span class="tag '+tag[1]+'">'+tag[0]+'</span></article>';
}
function messageRow(m){
 const from=m.sender==='developer'?'المطور':'المختبر',to=m.sender==='developer'?m.testerUid:m.ownerUid;
 return '<article class="item"><div class="info"><strong>'+esc(m.text||'')+'</strong><small>'+esc(appName(m.projectId))+' · من '+from+' '+esc(person(m.senderUid))+' إلى '+esc(person(to))+'</small><small>'+esc(stamped(m.createdAt))+'</small></div></article>';
}
function detailLists(l){
 if(!l)return '';
 const sec=(title,items)=>'<div class="sub">'+title+' · '+number(items.length)+'</div>'+(items.length?items.join(''):'<div class="line"><small>لا يوجد</small></div>');
 return sec('المشاركون',l.assignments.map(a=>'<div class="line"><b>'+esc(person(a.testerUid))+'</b> · '+esc(participationState(a)[0])+'</div>'))
  +sec('التقارير',l.reports.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(r=>'<div class="line">'+esc(r.date||'')+' · '+esc(person(r.testerUid))+' · '+(r.outcome==='issue'?'مشكلة':'نجح')+(r.notes?'<br>'+esc(r.notes):'')+'</div>'))
  +sec('الرسائل',l.messages.slice().sort((a,b)=>timeOf(a)-timeOf(b)).map(m=>'<div class="line"><b>'+esc(person(m.senderUid))+'</b>: '+esc(m.text||'')+' <small>'+esc(stamped(m.createdAt))+'</small></div>'));
}
/* Support: one private thread per user. */
// Activity: counts are aggregation queries (one read per thousand records); the list reads one page.
const ACTIVITY_PAGE=50;
async function loadActivity(){
 const now=Date.now(),since=ms=>Timestamp.fromMillis(now-ms),ref=collection(state.db,'presence');
 const count=q=>getCountFromServer(q).then(x=>x.data().count).catch(()=>null);
 const [total,online,day,week,testers,devs]=await Promise.all([
  count(collection(state.db,'users')),
  count(query(ref,where('lastSeenAt','>=',since(2*60000)))),
  count(query(ref,where('lastSeenAt','>=',since(86400000)))),
  count(query(ref,where('lastSeenAt','>=',since(7*86400000)))),
  count(query(ref,where('role','==','tester'),where('lastSeenAt','>=',since(86400000)))),
  count(query(ref,where('role','==','developer'),where('lastSeenAt','>=',since(86400000))))
 ]);
 state.activity={now,total,online,day,week,testers,devs,inactive:total===null||day===null?null:Math.max(0,total-day)};
 const snap=await getDocs(query(ref,orderBy('lastSeenAt','desc'),limit(ACTIVITY_PAGE)));
 state.rows=snap.docs.map(x=>({id:x.id,...x.data()}));
 await nameUsers(state.rows.map(r=>r.id));
 const side=r=>r.role==='developer'?'ownerUid':'testerUid';
 await Promise.all(state.rows.map(async r=>{
  const [a,rep]=await Promise.all([count(query(collection(state.db,'assignments'),where(side(r),'==',r.id))),count(query(collection(state.db,'reports'),where(side(r),'==',r.id)))]);
  r.assignments=a;r.reports=rep;
 }));
 state.hasMore=false;renderList();
}
function activityLabel(ms,now){if(!ms)return ['لم يظهر بعد',''];const age=now-ms;return age<=2*60000?['متصل الآن','ok']:age<=86400000?['نشط اليوم','ok']:['غير نشط','warn']}
function renderActivity(){
 const s=state.activity||{},n=v=>v===null||v===undefined?'—':number(v);
 const tiles=[['إجمالي المستخدمين',s.total],['متصلون الآن (تقديري)',s.online],['نشطون خلال 24 ساعة',s.day],['نشطون خلال 7 أيام',s.week],['غير نشطين (24 ساعة+)',s.inactive],['مختبرون نشطون اليوم',s.testers],['مطورون نشطون اليوم',s.devs]];
 const head='<div class="activity-grid">'+tiles.map(([l,v])=>'<div class="metric"><small>'+esc(l)+'</small><strong>'+n(v)+'</strong></div>').join('')+'</div>';
 if(!state.rows.length)return head+'<p class="none">ما ظهر أي مستخدم بعد تفعيل هذا التحديث.</p>';
 return head+state.rows.map(r=>{
  const seen=r.lastSeenAt?.toMillis?.(),[label,tone]=activityLabel(seen,s.now||Date.now());
  return '<article class="item"><div class="info"><strong>'+esc(person(r.id))+'</strong><small>'+(r.role==='developer'?'مطور':'مختبر')+' · آخر ظهور: '+esc(stamped(r.lastSeenAt))+' · آخر تفاعل: '+esc(stamped(r.lastActionAt))+'</small><small>'+(r.role==='developer'?'مشاركات بتطبيقاته':'مشاركات')+': '+n(r.assignments)+' · تقارير: '+n(r.reports)+'</small></div><div class="actions"><span class="pill '+tone+'">'+label+'</span></div></article>';
 }).join('');
}
// ---- Help center articles ----
const HELP_STATUS={published:['منشور','ok'],draft:['مسودة',''],hidden:['مخفي','warn']};
async function loadHelpAdmin(){
 const [snap,settings]=await Promise.all([getDocs(collection(state.db,'helpArticles')),getDoc(doc(state.db,'helpSettings','public'))]);
 state.helpStored=snap.docs.map(x=>({...x.data(),slug:x.id}));
 state.helpHidden=settings.exists()&&Array.isArray(settings.data().hiddenDefaults)?settings.data().hiddenDefaults:[];
 state.rows=[];state.hasMore=false;renderList();
}
function helpRows(){
 const H=globalThis.TesterHubHelp,stored=new Map((state.helpStored||[]).map(a=>[a.slug,a])),rows=[];
 const off=new Set(state.helpHidden||[]);
 for(const d of H.DEFAULTS){const s=stored.get(d.slug);rows.push({...(s||d),slug:d.slug,builtIn:true,stored:s||null,status:off.has(d.slug)?'hidden':s?s.status:'published'})}
 for(const s of stored.values())if(!H.DEFAULTS.some(d=>d.slug===s.slug))rows.push({...s,builtIn:false,stored:s});
 return rows.sort((a,b)=>(a.order??0)-(b.order??0)||a.slug.localeCompare(b.slug));
}
function helpEditor(a){
 const H=globalThis.TesterHubHelp,isNew=!a;a=a||{slug:'',cat:'faq',title:'',summary:'',steps:[{title:'',text:''}],notice:'',imageUrl:'',videoUrl:'',order:500,status:'draft'};
 const steps=(a.steps||[]).map(s=>s.title+' | '+s.text).join('\n');
 const opt=(v,l,cur)=>'<option value="'+esc(v)+'"'+(v===cur?' selected':'')+'>'+esc(l)+'</option>';
 return '<form id="help-form" class="help-form" data-new="'+(isNew?'1':'')+'"><h3 style="margin:0">'+(isNew?'شرح جديد':'تعديل: '+esc(a.title))+'</h3>'
  +'<div class="row2"><label>المعرّف (بالإنجليزي)<input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,59}" maxlength="60" value="'+esc(a.slug)+'"'+(isNew?'':' readonly')+' dir="ltr"><span class="hint">يظهر بالرابط: #help/article/المعرّف</span></label>'
  +'<label>القسم<select name="cat">'+Object.entries(H.CATEGORIES).map(([k,c])=>opt(k,c.title,a.cat)).join('')+'</select></label>'
  +'<label>الحالة<select name="status">'+opt('published','منشور',a.status)+opt('draft','مسودة (ما تظهر)',a.status)+'</select></label>'
  +'<label>الترتيب<input name="order" type="number" min="0" max="9999" value="'+esc(a.order??500)+'"></label></div>'
  +'<label>العنوان<input name="title" required minlength="3" maxlength="120" value="'+esc(a.title)+'"></label>'
  +'<label>وصف مختصر<input name="summary" maxlength="200" value="'+esc(a.summary||'')+'"></label>'
  +'<label>الخطوات<textarea class="steps" name="steps" required>'+esc(steps)+'</textarea><span class="hint">كل خطوة بسطر: عنوان الخطوة | شرحها. حتى 12 خطوة.</span></label>'
  +'<label>ملاحظة مهمة (اختياري)<textarea name="notice" maxlength="300">'+esc(a.notice||'')+'</textarea></label>'
  +'<div class="row2"><label>رابط صورة (https)<input name="imageUrl" type="url" maxlength="500" value="'+esc(a.imageUrl||'')+'" dir="ltr" placeholder="https://..."></label>'
  +'<label>رابط فيديو (YouTube أو Vimeo أو Google Drive)<input name="videoUrl" type="url" maxlength="500" value="'+esc(a.videoUrl||'')+'" dir="ltr" placeholder="https://youtu.be/..."></label></div>'
  +'<p class="help-errors" id="help-errors" role="alert"></p>'
  +'<div class="actions"><button class="btn" type="submit">حفظ</button><button class="btn soft" type="button" data-action="help-cancel">إلغاء</button></div></form>';
}
function renderHelpAdmin(){
 if(state.helpEdit!==undefined&&state.helpEdit!==null)return helpEditor(state.helpEdit===''?null:helpRows().find(r=>r.slug===state.helpEdit));
 const H=globalThis.TesterHubHelp;
 return '<div class="actions" style="margin-bottom:12px"><button class="btn" type="button" data-action="help-new">+ شرح جديد</button></div>'+helpRows().map(r=>{
  const [label,tone]=HELP_STATUS[r.status]||[r.status,''],src=r.builtIn?(r.stored?'أساسي معدّل':'أساسي'):'جديد';
  const btns=['<button class="btn soft" type="button" data-action="help-edit" data-id="'+esc(r.slug)+'">تعديل</button>'];
  if(r.builtIn&&r.status!=='hidden')btns.push('<button class="btn soft" type="button" data-action="help-hide" data-id="'+esc(r.slug)+'">إخفاء</button>');
  if(r.builtIn&&r.status==='hidden')btns.push('<button class="btn soft" type="button" data-action="help-show" data-id="'+esc(r.slug)+'">إظهار</button>');
  if(r.builtIn&&r.stored&&r.status!=='hidden')btns.push('<button class="btn soft" type="button" data-action="help-reset" data-id="'+esc(r.slug)+'">استرجاع الأصلي</button>');
  if(!r.builtIn)btns.push('<button class="btn danger" type="button" data-action="help-delete" data-id="'+esc(r.slug)+'">حذف</button>');
  return '<article class="item"><div class="info"><strong>'+esc(r.title)+'</strong><small>'+esc(H.CATEGORIES[r.cat]?.title||r.cat)+' · '+src+' · <span dir="ltr">'+esc(r.slug)+'</span>'+(r.imageUrl?' · صورة':'')+(r.videoUrl?' · فيديو':'')+'</small></div><div class="actions"><span class="pill '+tone+'">'+label+'</span>'+btns.join('')+'</div></article>';
 }).join('');
}
function helpFromForm(form){
 const f=new FormData(form),get=k=>String(f.get(k)||'').trim();
 const steps=get('steps').split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{const i=l.indexOf('|');return i<0?{title:l.slice(0,80),text:''}:{title:l.slice(0,i).trim(),text:l.slice(i+1).trim()}});
 return {slug:get('slug').toLowerCase(),cat:get('cat'),title:get('title'),summary:get('summary'),steps,notice:get('notice'),imageUrl:get('imageUrl'),videoUrl:get('videoUrl'),order:Number.parseInt(get('order'),10),status:get('status')};
}
async function saveHelp(a,{isNew=false}={}){
 const errors=globalThis.TesterHubHelp.validate(a);
 if(isNew&&helpRows().some(r=>r.slug===a.slug))errors.push('هذا المعرّف مستخدم');
 if(errors.length)throw Error(errors.join('، '));
 const batch=writeBatch(state.db),{slug,...data}=a;
 batch.set(doc(state.db,'helpArticles',slug),{...data,updatedAt:serverTimestamp(),updatedBy:state.account.uid});
 batchAudit(batch,'save_help_article',slug,a.title);
 await batch.commit();
}
async function setHidden(slug,title,hide){
 const list=new Set(state.helpHidden||[]);
 if(hide)list.add(slug);else list.delete(slug);
 const batch=writeBatch(state.db);
 batch.set(doc(state.db,'helpSettings','public'),{hiddenDefaults:[...list].filter(s=>globalThis.TesterHubHelp.DEFAULTS.some(d=>d.slug===s)),updatedAt:serverTimestamp(),updatedBy:state.account.uid});
 batchAudit(batch,'save_help_article',slug,(hide?'إخفاء: ':'إظهار: ')+title);
 await batch.commit();
}
async function removeHelp(slug,title){
 const batch=writeBatch(state.db);
 batch.delete(doc(state.db,'helpArticles',slug));
 batchAudit(batch,'delete_help_article',slug,title);
 await batch.commit();
}
async function helpAction(name,slug){
 const row=helpRows().find(r=>r.slug===slug);
 if(name==='help-new'){state.helpEdit='';renderList();return}
 if(name==='help-edit'){state.helpEdit=slug;renderList();return}
 if(name==='help-cancel'){state.helpEdit=null;renderList();return}
 if(!row)return;
 if(name==='help-hide'){
  if(!await confirmDialog({title:'إخفاء «'+row.title+'»؟',body:'يختفي من مركز المساعدة، وتگدر ترجعه بأي وقت.',action:'إخفاء'}))return;
  await setHidden(slug,row.title,true);toast('انخفى الشرح.');
 }else if(name==='help-show'){
  await setHidden(slug,row.title,false);toast('رجع الشرح يظهر.');
 }else if(name==='help-reset'||name==='help-delete'){
  const del=name==='help-delete';
  if(!await confirmDialog({title:del?'حذف «'+row.title+'» نهائياً؟':'استرجاع النسخة الأصلية؟',body:del?'ينحذف هذا الشرح من مركز المساعدة.':'تنحذف تعديلاتك ويرجع الشرح الأساسي كما هو.',action:del?'حذف':'استرجاع',danger:del}))return;
  await removeHelp(slug,row.title);toast(del?'انحذف الشرح.':'رجع الشرح الأساسي.');
 }
 await loadHelpAdmin();
}
async function loadFeatures(){
 const snap=await getDoc(doc(state.db,'appConfig','features'));
 state.featureFlags={officialGroup:snap.exists()&&snap.data().officialGroup===true,packs:snap.exists()&&snap.data().packs===true};
 state.rows=[];state.hasMore=false;renderList();
}
function renderFeatures(){
 const on=!!state.featureFlags?.officialGroup;
 const packsOn=!!state.featureFlags?.packs;
 return '<article class="item"><div class="info"><strong>مجموعة TesterHubIQ الرسمية وطلبات المشاركة الذاتية</strong><small>يظهر للمختبر زر الانضمام لـ testerhubiq@googlegroups.com وفرص الاختبار المفتوحة، ويختار المطور «مجموعة Google» أو «الدعوات الفردية» لكل تطبيق، مع قائمة انتظار ومختبرين احتياطيين. الدعوات الحالية ما تتأثر.</small><small>الحالة: '+(on?'مفعّلة':'معطّلة')+'</small></div><div class="actions"><button class="btn '+(on?'soft':'')+'" type="button" data-action="toggle-feature" data-id="officialGroup">'+(on?'إيقاف':'تفعيل')+'</button></div></article>'+'<article class="item"><div class="info"><strong>مجموعات التبادل (Pack)</strong><small>16 عضو يختبرون تطبيقات بعض 16 يوم، مجموعة وحدة مفتوحة بالوقت، وإنذارات تلقائية من مهمة يومية (تحتاج سر FIREBASE_SERVICE_ACCOUNT). الإيقاف يخفي القسم ويوقف الانضمام والتأكيد، وما ينحذف شي.</small><small>الحالة: '+(packsOn?'مفعّلة':'معطّلة')+'</small></div><div class="actions"><button class="btn '+(packsOn?'soft':'')+'" type="button" data-action="toggle-feature" data-id="packs">'+(packsOn?'إيقاف':'تفعيل')+'</button></div></article>';
}
async function toggleFeature(name){
 const next=!state.featureFlags?.[name];
 const batch=writeBatch(state.db);
 batch.set(doc(state.db,'appConfig','features'),{[name]:next,updatedAt:serverTimestamp()},{merge:true});
 batchAudit(batch,'toggle_feature',name,(next?'تفعيل ':'إيقاف ')+name);
 await batch.commit();
 toast(next?'تم تفعيل الميزة لكل المستخدمين.':'تم إيقاف الميزة. ما انحذفت أي بيانات.');
 await loadFeatures();
}
async function loadSupport(){
 const ref=collection(state.db,'supportMessages');
 if(state.thread){
  const snap=await getDocs(query(ref,where('uid','==',state.thread)));
  state.threadMessages=snap.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>timeOf(a)-timeOf(b));
  await nameUsers([state.thread]);
 }else{
  const snap=await getDocs(query(ref,orderBy('createdAt','desc'),limit(300)));
  const threads=new Map();
  for(const x of snap.docs){const m=x.data();if(!threads.has(m.uid))threads.set(m.uid,{id:m.uid,last:m,count:0});threads.get(m.uid).count++}
  state.rows=[...threads.values()];
  await nameUsers(state.rows.map(r=>r.id));
 }
 state.hasMore=false;
 renderList();
}
function renderSupport(){
 if(state.thread){
  const uid=state.thread;
  return '<button class="btn soft" type="button" data-action="back-threads">‹ كل المحادثات</button><p class="who" style="margin-top:10px">'+esc(person(uid))+(personEmail(uid)?' · <span dir="ltr">'+esc(personEmail(uid))+'</span>':'')+'</p>'
   +(state.threadMessages.length?state.threadMessages.map(m=>'<div class="bubble '+(m.sender==='admin'?'admin':'')+'"><b>'+(m.sender==='admin'?'إدارة TesterHub':esc(person(uid)))+'</b>'+esc(m.text)+'<small>'+esc(stamped(m.createdAt))+'</small></div>').join(''):'<p class="none">لا توجد رسائل بعد. اكتب أول رسالة.</p>')
   +'<form id="support-form"><textarea id="support-text" maxlength="1000" minlength="2" required placeholder="اكتب رسالتك باسم إدارة TesterHub"></textarea><button class="btn" type="submit">إرسال</button></form>';
 }
 if(!state.rows.length)return '<p class="none">لا توجد محادثات بعد. من قسم المستخدمين أو المشاركات اضغط «مراسلة» لبدء محادثة.</p>';
 return state.rows.map(t=>'<article class="item"><div class="info"><strong>'+esc(person(t.id))+'</strong><small>'+(t.last.sender==='admin'?'أنت: ':'')+esc(String(t.last.text||'').slice(0,120))+'</small><small>'+esc(stamped(t.last.createdAt))+'</small></div><div class="actions">'+(t.last.sender==='user'?'<span class="tag warn">بانتظار ردك</span>':'')+button('open-thread',t.id,'فتح')+'</div></article>').join('');
}
async function overview(){
 const all=[['users','المستخدمون',allowed('viewUsers')],['projects','التطبيقات',true],['assignments','المشاركات (مختبر × تطبيق)',allowed('deleteProjects')],['reports','التقارير',allowed('deleteProjects')||allowed('viewReports')],['messages','الرسائل',allowed('deleteProjects')]].filter(x=>x[2]);
 const counts=await Promise.all(all.map(x=>getCountFromServer(collection(state.db,x[0]))));
 $('metrics').innerHTML=all.map((x,i)=>'<div class="metric"><small>'+esc(x[1])+'</small><strong>'+number(counts[i].data().count)+'</strong></div>').join('');
}
const button=(action,id,label,tone='soft')=>'<button class="btn '+tone+'" type="button" data-action="'+action+'" data-id="'+esc(id)+'">'+label+'</button>';
function projectRow(item){
 const status=item.status||'recruiting',[label,tone]=STATUS[status]||[status,''],d=state.details[item.id];
 const archived=status==='archived',deleting=status==='deleting';
 return '<article class="item"><div class="info"><strong>'+esc(item.name||'تطبيق')+'</strong><small>المطور: '+esc(item.ownerName||'—')+'</small></div><div class="actions"><span class="tag '+tone+'">'+esc(label)+'</span>'+(allowed('deleteProjects')?button('details',item.id,d?'إخفاء':'تفاصيل'):'')+(deleting||!allowed('archiveProjects')?'':button('archive',item.id,archived?'إلغاء الأرشفة':'أرشفة','warn'))+(allowed('deleteProjects')?button('delete',item.id,deleting?'إكمال الحذف':'حذف','danger'):'')+'</div>'+(d?'<div class="detail">'+(item.link?'<div dir="ltr">'+esc(item.link)+'</div>':'')+'المعرّف: <span dir="ltr">'+esc(item.id)+'</span><br>المشاركات: '+number(d.assignments)+' · التقارير: '+number(d.reports)+' · الرسائل: '+number(d.messages)+detailLists(d.lists)+'</div>':'')+'</article>';
}
function userRow(item){
 const self=item.id===state.account.uid;
 const isStaff=state.staffIds.has(item.id);
 const tag=(isStaff?'<span class="tag">مشرف</span>':'')+(item.suspended?'<span class="tag bad">موقوف</span>':item.available?'<span class="tag good">متاح للاختبار</span>':'<span class="tag">مسجّل</span>');
 return '<article class="item"><div class="info"><strong>'+esc(item.name||'مستخدم')+'</strong><small dir="ltr" style="text-align:right">'+esc(item.email||'')+'</small><small>'+(item.role==='developer'?'مطور':'مختبر')+'</small></div><div class="actions">'+tag+(self?'<span class="tag">حسابك</span>':(state.owner?button('message-user',item.id,'مراسلة'):'')+(state.owner&&!isStaff?button('promote',item.id,'ترقية إلى مشرف'):'')+(allowed('suspendUsers')&&(state.owner||!isStaff)?button('suspend',item.id,item.suspended?'إعادة التنشيط':'إيقاف الحساب',item.suspended?'soft':'danger'):''))+'</div></article>';
}
function issueRow(item){
 const fixed=item.status==='fixed';
 return '<article class="item"><div class="info"><strong>'+esc(item.notes||'بلاغ')+'</strong><small>'+esc(appName(item.projectId))+'</small><small>'+esc(item.tested||'')+'</small><small>'+esc(item.date||'')+'</small></div><span class="tag '+(fixed?'good':'warn')+'">'+(fixed?'تم الإصلاح':'مفتوح')+'</span></article>';
}
function auditRow(item){
 const names={send_announcement:'إرسال إعلان',withdraw_announcement:'سحب إعلان',suspend_user:'إيقاف حساب',unsuspend_user:'إعادة تنشيط حساب',archive_project:'أرشفة تطبيق',restore_project:'إلغاء أرشفة تطبيق',delete_project:'حذف تطبيق نهائياً',process_deletion:'معالجة طلب حذف حساب',grant_staff:'ترقية مشرف',update_staff:'تعديل صلاحيات مشرف',revoke_staff:'سحب صلاحيات مشرف'};
 return '<article class="item"><div class="info"><strong>'+esc(names[item.action]||item.action||'إجراء')+'</strong><small>'+esc(item.targetName||item.targetId||'')+'</small></div><small>'+esc(stamped(item.createdAt))+'</small></article>';
}
function staffRow(item){
 const list=PERMISSIONS.filter(p=>item.permissions?.[p[0]]===true).map(p=>p[1]).join('، ')||'بلا صلاحيات';
 return '<article class="item"><div class="info"><strong>'+esc(item.name||'مشرف')+'</strong><small dir="ltr" style="text-align:right">'+esc(item.email||item.id)+'</small><small>'+esc(list)+'</small></div><div class="actions">'+button('edit-staff',item.id,'تعديل الصلاحيات')+button('revoke-staff',item.id,'سحب الصلاحيات','danger')+'</div></article>';
}
function deletionRow(item){
 return '<article class="item"><div class="info"><strong dir="ltr" style="text-align:right">'+esc(item.email||item.id)+'</strong><small>'+esc(stamped(item.createdAt))+'</small></div>'+(item.status==='open'?button('process-deletion',item.id,'تمت المعالجة'):'<span class="tag good">تمت المعالجة</span>')+'</article>';
}
const NOTICE_KINDS={announcement:'إعلان',update:'تحديث للمنصة',instruction:'تعليمات مهمة'};
const NOTICE_AUDIENCE={all:'كل المستخدمين',developers:'المطورون',testers:'المختبرون',user:'مستخدم محدد'};
function announcementRow(item){
 const on=item.active!==false,when=item.createdAt?.toDate?.();
 return '<article class="item"><div class="info"><strong>'+esc(item.title)+'</strong><small class="notice-body">'+esc(item.body)+'</small><small>'+esc(NOTICE_KINDS[item.kind]||item.kind)+' · '+esc(NOTICE_AUDIENCE[item.audience]||item.audience)+(item.targetEmail?' · '+esc(item.targetEmail):'')+(when?' · '+esc(when.toLocaleString('ar-IQ')):'')+'</small></div><div class="actions"><span class="tag '+(on?'good':'')+'">'+(on?'ظاهر':'مسحوب')+'</span>'+button('toggle-notice',item.id,on?'سحب':'إظهار',on?'warn':'soft')+'</div></article>';
}
// Sends one notice and records it in the audit log in the same batch.
async function sendAnnouncement(form){
 const f=new FormData(form),kind=String(f.get('kind')),audience=String(f.get('audience'));
 const title=String(f.get('title')||'').trim(),body=String(f.get('body')||'').trim();
 if(title.length<2||title.length>80)throw Error('العنوان من 2 إلى 80 حرف');
 if(body.length<2||body.length>1000)throw Error('النص من 2 إلى 1000 حرف');
 let targetUid='',targetName='';
 if(audience==='user'){
  const email=String(f.get('email')||'').trim().toLowerCase();
  if(!email)throw Error('اكتب بريد المستخدم');
  if(!allowed('viewUsers'))throw Error('الإرسال لمستخدم محدد يحتاج صلاحية عرض المستخدمين');
  const found=await getDocs(query(collection(state.db,'users'),where('email','==',email),limit(1)));
  if(found.empty)throw Error('ما لگينا مستخدم بهذا البريد');
  targetUid=found.docs[0].id;targetName=email;
 }
 busy(false);
 const ok=await confirmDialog({title:'إرسال «'+title+'»؟',body:'إلى: '+(audience==='user'?targetName:NOTICE_AUDIENCE[audience])+'\nيظهر فوراً بجرس الإشعارات ولا يمكن تعديل نصه بعد الإرسال (يمكن سحبه).',action:'إرسال'});
 busy(true);
 if(!ok)return false;
 const batch=writeBatch(state.db),ref=doc(collection(state.db,'announcements'));
 batch.set(ref,{kind,audience,broadcast:audience!=='user',targetUid,title,body,active:true,createdBy:state.account.uid,createdAt:serverTimestamp()});
 batchAudit(batch,'send_announcement',ref.id,title);
 await batch.commit();
 form.reset();syncComposer();
 toast('تم إرسال الإعلان.');
 return true;
}
async function toggleNotice(item){
 const next=item.active===false;
 const batch=writeBatch(state.db);
 batch.update(doc(state.db,'announcements',item.id),{active:next});
 if(!next)batchAudit(batch,'withdraw_announcement',item.id,item.title);
 else batchAudit(batch,'send_announcement',item.id,item.title);
 await batch.commit();
 item.active=next;
 toast(next?'رجع الإعلان يظهر.':'تم سحب الإعلان، وما انحذف.');
}
function syncComposer(){const form=$('composer');if(!form)return;form.querySelector('[data-for="user"]').hidden=form.audience.value!=='user'}
const ROWS={projects:projectRow,users:userRow,issues:issueRow,staffRoles:staffRow,deletionRequests:deletionRow,adminAuditLogs:auditRow,announcements:announcementRow,assignments:assignmentRow,reportsAll:reportRow,messages:messageRow};
function renderList(){
 const type=state.tab,source=TABS[type];
 const needle=state.filter.trim().toLowerCase();
 const rows=type==='projects'&&needle?state.rows.filter(x=>String(x.name||'').toLowerCase().includes(needle)):state.rows;
 $('listTitle').textContent=source.title;
 $('listNote').hidden=!source.note;$('listNote').textContent=source.note||'';
 $('search').hidden=!source.search;
 $('searchInput').placeholder=source.search||'';
 // App names filter as you type; only the email lookup needs a button.
 $('searchButton').hidden=type!=='users';
 $('composer').hidden=type!=='announcements';
 $('items').innerHTML=type==='help'?renderHelpAdmin():type==='activity'?renderActivity():type==='features'?renderFeatures():type==='support'?renderSupport():rows.length?rows.map(ROWS[type]).join(''):'<p class="none">'+(type==='announcements'?'ما انرسل أي إعلان بعد.':'لا توجد سجلات هنا.')+'</p>';
 $('more').hidden=!state.hasMore;
 for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===type);
}
async function page(reset=false){
 if(state.tab==='support')return loadSupport();
 if(state.tab==='features')return loadFeatures();
 if(state.tab==='activity')return loadActivity();
 if(state.tab==='help'){state.helpEdit=null;return loadHelpAdmin()}
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
 await enrich(state.rows);
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
 const counts=await TesterHubDeletion.countRelated({db:state.db,f:firestore,projectId:project.id});
 const names=['assignments','reports','messages'],snaps=await Promise.all(names.map(n=>getDocs(query(collection(state.db,n),where('projectId','==',project.id),limit(100)))));
 const lists=Object.fromEntries(names.map((n,i)=>[n,snaps[i].docs.map(x=>({id:x.id,...x.data()}))]));
 await nameUsers(Object.values(lists).flat().flatMap(r=>[r.testerUid,r.ownerUid,r.senderUid]));
 state.details[project.id]={...counts,lists};
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
 'toggle-notice':item=>(item.active===false?null:{title:'سحب «'+(item.title||'')+'»؟',body:'يختفي من جرس المستخدمين، ويبقى محفوظاً بالسجل.',action:'سحب'}),
 'process-deletion':item=>({title:'هل نفّذت الحذف فعلاً؟',body:'نفّذ الحذف أولاً من Firebase Console: احذف حساب '+(item.email||item.id)+' من Authentication، ومستند users الخاص به من Firestore (ومستند publicProfiles إن وُجد)، ثم أكد هنا.',action:'نعم، نُفّذ'}),
 suspend:item=>({title:(item.suspended?'إعادة تنشيط ':'إيقاف ')+(item.email||item.name||item.id)+'؟',body:item.suspended?'':'الإيقاف يمنع استخدام البيانات فوراً وتبقى بياناته محفوظة. حساب الدخول نفسه يُعطَّل من Firebase Console.',danger:!item.suspended}),
 archive:item=>({title:(item.status==='archived'?'إلغاء أرشفة ':'أرشفة ')+item.name+'؟',body:item.status==='archived'?'':'تتوقف التقارير والرسائل الجديدة، ولا تُحذف البيانات القديمة.'})
};
const ACTIONS={'toggle-notice':toggleNotice,promote:promoteUser,'edit-staff':editStaff,'revoke-staff':revokeStaff,'process-deletion':processDeletion,suspend:setSuspension,archive:archiveProject,details:loadDetails,delete:removeProject};
document.addEventListener('click',event=>{
 const tab=event.target.closest('[data-tab]');
 if(tab){state.tab=tab.dataset.tab;state.thread=null;state.filter='';$('searchInput').value='';guarded(()=>page(true));return}
 const trigger=event.target.closest('[data-action]');
 if(!trigger||state.busy)return;
 if(trigger.dataset.action==='message-user'){state.tab='support';state.thread=trigger.dataset.id;state.filter='';guarded(()=>page(true));return}
 if(trigger.dataset.action==='open-thread'){state.thread=trigger.dataset.id;guarded(()=>page(true));return}
 if(trigger.dataset.action?.startsWith('help-')){const name=trigger.dataset.action,slug=trigger.dataset.id;guarded(async()=>{if(['help-hide','help-reset','help-delete'].includes(name))busy(false);await helpAction(name,slug)});return}
 if(trigger.dataset.action==='toggle-feature'){
  const name=trigger.dataset.id,on=!!state.featureFlags?.[name];
  confirmDialog({title:on?'إيقاف الميزة؟':'تفعيل الميزة لكل المستخدمين؟',body:'يمكن التراجع في أي وقت، وما تنحذف أي بيانات.',action:on?'إيقاف':'تفعيل'}).then(ok=>{if(ok)guarded(()=>toggleFeature(name))});
  return;
 }
 if(trigger.dataset.action==='back-threads'){state.thread=null;guarded(()=>page(true));return}
 const item=state.rows.find(x=>x.id===trigger.dataset.id),name=trigger.dataset.action;
 if(!item)return;
 guarded(async()=>{
  const prompt=PROMPTS[name]?.(item);
  if(prompt){busy(false);const ok=await confirmDialog(prompt);busy(true);if(!ok)return}
  const done=await ACTIONS[name](item);
  renderList();
  if(!['details','promote','edit-staff','revoke-staff'].includes(name)&&done!==false)await overview();
 });
});
document.addEventListener('submit',event=>{
 if(event.target.id!=='help-form')return;
 event.preventDefault();
 const form=event.target,article=helpFromForm(form);
 guarded(async()=>{
  try{await saveHelp(article,{isNew:form.dataset.new==='1'})}
  catch(err){const box=document.getElementById('help-errors');if(box)box.textContent=err.message;throw err}
  state.helpEdit=null;toast(article.status==='published'?'انحفظ ونُشر الشرح.':'انحفظ كمسودة.');await loadHelpAdmin();
 });
});
document.addEventListener('submit',event=>{
 if(event.target.id!=='support-form')return;
 event.preventDefault();
 const text=$('support-text').value.trim();
 if(text.length<2)return toast('اكتب رسالة من حرفين على الأقل.',true);
 guarded(async()=>{
  await addDoc(collection(state.db,'supportMessages'),{uid:state.thread,sender:'admin',senderUid:state.account.uid,text,createdAt:serverTimestamp()});
  toast('أُرسلت الرسالة باسم إدارة TesterHub.');
  await loadSupport();
 });
});
$('composer').addEventListener('change',syncComposer);
$('composer').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;guarded(async()=>{if(await sendAnnouncement(form)!==false)await page(true)})});
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
