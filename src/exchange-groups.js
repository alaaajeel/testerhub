// Optional exchange pilot. It never changes existing projects, assignments or XP.
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,query,where,limit,runTransaction,writeBatch,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const CAPACITY=15;
const TODAY=()=>new Date().toISOString().slice(0,10); // UTC, matching Firestore security rules
const YESTERDAY=()=>new Date(Date.now()-86400000).toISOString().slice(0,10);
const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const $=selector=>document.querySelector(selector);
const groupRef=id=>doc(db,'exchangeGroups',id);
const membersRef=id=>collection(db,'exchangeGroups',id,'members');
const memberRef=(id,uid)=>doc(db,'exchangeGroups',id,'members',uid);
const checkRef=(id,day,uid)=>doc(db,'exchangeGroups',id,'days',day,'checkins',uid);
const remindersRef=id=>collection(db,'exchangeGroups',id,'reminders');
const warningsRef=id=>collection(db,'exchangeGroups',id,'warnings');
const status=(message,bad=false)=>{const el=$('#status');el.textContent=message;el.classList.toggle('error',bad)};
const app= getApps().length?getApp():initializeApp(window.TESTERHUB_FIREBASE_CONFIG);
const auth=getAuth(app),db=getFirestore(app);
let user=null, profile=null, groups=[],selectedId=null,detail=null,busy=false;
const playUrl=x=>{try{const u=new URL(x);return u.protocol==='https:'&&u.hostname==='play.google.com'&&u.username===''&&u.password===''&&u.port===''&&u.href.length<=500}catch{return false}};
const validateApp=(name,url)=>{if(name.length<2||name.length>100)throw Error('اسم التطبيق يجب أن يكون بين 2 و100 حرف');if(!playUrl(url))throw Error('استخدم رابط تطبيق أو اختبار من play.google.com فقط')};
function relativeDay(when){if(!when?.toDate)return '—';const d=when.toDate();return d.toLocaleString('ar-IQ')}
function groupCard(g){
 const mine=g.memberUids.includes(user.uid),open=g.status==='open',running=!!g.startedAt;
 return '<article class="panel"><div class="row"><strong>'+esc(g.title)+'</strong><span class="tag">'+g.memberUids.length+'/'+CAPACITY+'</span></div><p class="muted">'+(open?(running?'مقعد بديل متاح — الاختبارات مستمرة':'مفتوحة لاستقبال الأعضاء'):'مكتملة — تبادل نشط')+'</p><div class="progress"><span style="width:'+(g.memberUids.length/CAPACITY*100)+'%"></span></div><div class="actions">'+
 (mine?'<button data-open="'+esc(g.id)+'">إدارة مجموعتي</button>':open?'<button data-join="'+esc(g.id)+'">الانضمام</button>':'<span class="muted">المجموعة مكتملة</span>')+'</div></article>';
}
const userFields=()=>{
 const name=String($('#person-name')?.value||profile?.name||'').trim();
 const appName=String($('#app-name')?.value||'').trim();
 const appUrl=String($('#app-url')?.value||'').trim();
 validateApp(appName,appUrl);
 if(name.length<2||name.length>80)throw Error('الاسم يجب أن يكون بين 2 و80 حرفاً');
 if(!$('#consent')?.checked)throw Error('وافق على إظهار بريدك لأعضاء المجموعة قبل الانضمام');
 return {uid:user.uid,name,email:user.email,appName,appUrl,joinedAt:serverTimestamp()};
};
function joinForm(id){
 return '<div class="panel"><h2>'+(id?'الانضمام إلى مجموعة':'إنشاء مجموعة جديدة')+'</h2><form id="membership-form" data-group="'+esc(id||'')+'">'+
 (!id?'<label>اسم المجموعة (يظهر للأعضاء المسجلين)</label><input id="group-title" maxlength="80" minlength="3" required placeholder="مثلاً: مجموعة بغداد الأولى">':'')+
 '<label>اسمك داخل المجموعة</label><input id="person-name" maxlength="80" minlength="2" required value="'+esc(profile?.name||'')+'">'+
 '<label>اسم تطبيقك</label><input id="app-name" maxlength="100" minlength="2" required placeholder="اسم التطبيق في Google Play">'+
 '<label>رابط تطبيقك أو رابط اختبار Google Play</label><input id="app-url" type="url" maxlength="500" required placeholder="https://play.google.com/...">'+
 '<label><input id="consent" type="checkbox" required> أوافق على مشاركة بريدي '+esc(user.email)+' مع الأعضاء الحاليين واللاحقين في مجموعتي فقط لتنسيق الاختبار.</label>'+
 '<div class="actions"><button type="submit">'+(id?'تأكيد الانضمام':'إنشاء المجموعة وإدراج تطبيقي')+'</button><button type="button" class="ghost" id="cancel-form">إلغاء</button></div></form></div>';
}
function groupList(){
 $('#content').innerHTML='<div class="panel"><h2>مجموعات التبادل الاختيارية</h2><p class="muted">كل مجموعة تستقبل 15 عضواً وتغلق تلقائياً عند اكتمالهم. كل شخص يختبر تطبيقات الـ14 الآخرين، وليس مجموعة تطبيقات جديدة كل يوم.</p><button id="create-group">＋ إنشاء مجموعة</button></div>'+
 '<div class="grid">'+(groups.length?groups.map(groupCard).join(''):'<div class="panel">لا توجد مجموعات ظاهرة حالياً. يمكنك إنشاء أول مجموعة.</div>')+'</div>';
}
async function refreshList(){
 if(!user)return;
 const [open,joined]=await Promise.all([
 getDocs(query(collection(db,'exchangeGroups'),where('status','==','open'),limit(25))),
 getDocs(query(collection(db,'exchangeGroups'),where('memberUids','array-contains',user.uid),limit(25)))
 ]);
 const map=new Map([...joined.docs,...open.docs].map(s=>[s.id,{id:s.id,...s.data()}]));
 groups=[...map.values()].sort((a,b)=>Number(b.memberUids.includes(user.uid))-Number(a.memberUids.includes(user.uid)));
 groupList();
 status('تم تحديث قائمة المجموعات');
}
async function createGroup(){
 const member=userFields(),title=String($('#group-title').value||'').trim();
 if(title.length<3||title.length>80)throw Error('عنوان المجموعة بين 3 و80 حرفاً');
 const ref=doc(collection(db,'exchangeGroups')),batch=writeBatch(db);
 batch.set(ref,{title,ownerUid:user.uid,createdAt:serverTimestamp(),memberUids:[user.uid],removedUids:[],status:'open'});
 batch.set(memberRef(ref.id,user.uid),member);
 await batch.commit();selectedId=ref.id;
 await openGroup(ref.id);
}
async function joinGroup(id){
 const member=userFields(),ref=groupRef(id);
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists())throw Error('المجموعة غير موجودة');
  const g=snap.data();
  if(g.status!=='open'||g.memberUids.length>=CAPACITY)throw Error('المجموعة اكتملت أو أُغلقت');
  if(g.memberUids.includes(user.uid))throw Error('أنت عضو في هذه المجموعة مسبقاً');
  if((g.removedUids||[]).includes(user.uid))throw Error('هذا الحساب مستبعد سابقاً من المجموعة');
  const next=[...g.memberUids,user.uid],activation=next.length===CAPACITY;
  tx.update(ref,{memberUids:next,...(activation?{status:'active',...(!g.startedAt?{startedAt:serverTimestamp()}:{} )}:{})});
  tx.set(memberRef(id,user.uid),member);
 });
 selectedId=id;await openGroup(id);
}
function checkCount(c,members){
 return (c?.testedUids||[]).filter(uid=>members.some(m=>m.uid===uid)).length;
}
function participantRow(m,members,checks,ownUid,active,warnings,reminders){
 const own=m.uid===ownUid,c=checks.find(x=>x.uid===m.uid);
 const testedMine=(c?.testedUids||[]).includes(ownUid);
 const iTested=(checks.find(x=>x.uid===ownUid)?.testedUids||[]).includes(m.uid);
 const n=warnings.filter(x=>x.uid===m.uid).length;
 const hasReminder=reminders.some(r=>r.fromUid===ownUid&&r.toUid===m.uid&&r.day===TODAY());
 return '<div class="item"><div class="row"><strong>'+esc(m.name)+(own?' (أنت)':'')+'</strong><span class="tag">'+checkCount(c,members)+' / '+(members.length-1)+' تأكيد اليوم</span></div>'+
 '<div>'+esc(m.appName)+' — <a href="'+esc(m.appUrl)+'" target="_blank" rel="noopener noreferrer">فتح التطبيق</a></div>'+
 '<div class="muted ltr">'+esc(m.email)+'</div>'+
 '<div class="muted">إنذارات المجموعة: '+n+(own?'':' · '+(testedMine?'أكّد اختبار تطبيقك اليوم':'لم يؤكد اختبار تطبيقك اليوم'))+'</div>'+
 (!own&&active?'<div class="actions"><button '+(iTested?'disabled':'')+' data-test="'+esc(m.uid)+'">'+(iTested?'تم تأكيد اختباري اليوم':'أؤكد أني اختبرت اليوم')+'</button>'+
 '<button class="ghost" '+(hasReminder?'disabled':'')+' data-remind="'+esc(m.uid)+'">'+(hasReminder?'تم إرسال التذكير':'تذكير العضو')+'</button>'+
 (detail.group.ownerUid===ownUid&&n>=3?'<button data-exclude="'+esc(m.uid)+'">استبعاد بعد 3 إنذارات</button>':'')+'</div>':'')+
 '</div>';
}
function groupDetails(){
 const {group:g,members,checks,reminders,warnings}=detail;
 const active=!!g.startedAt,mine=members.some(x=>x.uid===user.uid);
 if(!mine){groupList();return}
 const list=members.map(m=>m.email).join('\n');
 const checkedMine=checks.find(x=>x.uid===user.uid);
 const testingCount=checkCount(checkedMine,members);
 const checkingMe=checks.filter(c=>c.uid!==user.uid&&(c.testedUids||[]).includes(user.uid)).length;
 const startMillis=Math.max(g.startedAt?.toMillis?.()||Date.now(),members.find(m=>m.uid===user.uid)?.joinedAt?.toMillis?.()||Date.now());
 const startDay=new Date(startMillis).toISOString().slice(0,10),followupDay=Math.max(1,Math.floor((Date.parse(TODAY())-Date.parse(startDay))/86400000)+1);

 const myReminders=reminders.filter(x=>x.toUid===user.uid);
 const yesterday=YESTERDAY();
 $('#content').innerHTML='<div class="panel"><div class="row"><h2>'+esc(g.title)+'</h2><button class="ghost" id="back-groups">المجموعات</button></div>'+
 '<div class="row"><strong>'+members.length+'/'+CAPACITY+' عضواً</strong><span class="tag">'+(active?(g.status==='open'?'جارية — مقعد بديل متاح':'مكتملة — التبادل نشط'):'قيد التجميع')+'</span></div>'+
 '<p class="muted">آخر تحديث: '+esc(TODAY())+' (UTC). الإقرارات شخصية ولا تثبت فتح تطبيق خارجي.</p>'+ '\n'+(active?'<p class="tag">يوم متابعة مجموعتك: '+followupDay+' (منه 14 يوماً مستهدفة، وليس إثباتاً لمدة Google Play)</p>':'')+
 '<div class="actions"><button id="copy-emails">نسخ إيميلات أعضاء المجموعة ('+members.length+')</button><button class="ghost" id="reload-group">تحديث الحالات</button></div>'+
 (active?'<p class="muted">أكّدت اليوم اختبار '+testingCount+' من '+(members.length-1)+' تطبيقاً. وأكّد '+checkingMe+' من '+(members.length-1)+' أعضاء اختبار تطبيقك اليوم.</p>':'<p class="warn">تبدأ المتابعة اليومية بعد اكتمال 15 عضواً. لا يتم احتساب أي اختبار قبل اكتمال المجموعة.</p>')+
 (myReminders.length?'<p class="warn">عندك '+myReminders.length+' تذكير اليوم من أعضاء المجموعة. يرجى إكمال الاختبارات وتأكيد كل تطبيق.</p>':'')+
 '</div><section class="panel"><h2>تطبيقات الأعضاء</h2><p class="muted">كل شخص يضيف إيميلات المجموعة إلى قائمته في Play Console وفق طريقة الاختبار المعتمدة، ويتابع الاختبار بنفسه.</p>'+
 members.map(m=>participantRow(m,members,checks,user.uid,active,warnings,reminders)).join('')+
 '</section>'+(active&&g.ownerUid===user.uid?'<section class="panel"><h2>إدارة الالتزام والإنذارات</h2><p class="muted">إنذار عن اليوم السابق فقط عند نقص تأكيدات الاختبار. ثلاث إنذارات لأيام مختلفة تسمح للمشرف باستبعاد المتأخر وفتح مقعد بديل. هذا إجراء داخل المجموعة فقط، ولا يحذف سجلات الحساب ولا يغيّر حالة Play Console.</p>'+
 members.filter(m=>m.uid!==user.uid).map(m=>{
 const previous=detail.previousChecks.find(c=>c.uid===m.uid);
 const warningsYesterday=warnings.some(w=>w.uid===m.uid&&w.day===yesterday);
 return '<div class="item"><div class="row"><span>'+esc(m.name)+' · أمس: '+checkCount(previous,members)+' / '+(members.length-1)+'</span>'+
 '<button class="ghost" data-warn="'+esc(m.uid)+'" '+(warningsYesterday||checkCount(previous,members)===members.length-1?'disabled':'')+'>'+(warningsYesterday?'تم الإنذار':'إنذار عن أمس')+'</button></div></div>';
 }).join('')+'</section>':'');
 $('#copy-emails').dataset.emails=list;
}
async function openGroup(id){
 selectedId=id;
 const s=await getDoc(groupRef(id));
 if(!s.exists())throw Error('المجموعة غير موجودة');
 const group={id:s.id,...s.data()};
 if(!group.memberUids.includes(user.uid))throw Error('هذه المجموعة مخصصة لأعضائها');
 const [m,c,r,w,p]=await Promise.all([
 getDocs(membersRef(id)),
 group.startedAt?getDocs(collection(db,'exchangeGroups',id,'days',TODAY(),'checkins')):Promise.resolve({docs:[]}),
 getDocs(remindersRef(id)),
 getDocs(warningsRef(id)),
 group.status==='active'?getDocs(collection(db,'exchangeGroups',id,'days',YESTERDAY(),'checkins')):Promise.resolve({docs:[]})
 ]);
 detail={group,members:m.docs.map(s=>s.data()).filter(v=>group.memberUids.includes(v.uid)),checks:c.docs.map(s=>s.data()),reminders:r.docs.map(s=>s.data()),warnings:w.docs.map(s=>s.data()),previousChecks:p.docs.map(s=>s.data())};
 groupDetails();status('مجموعة التبادل: البيانات المحدثة متاحة');
}
async function confirmTest(target){
 const id=selectedId,g=detail.group;
 if(!g.startedAt||!g.memberUids.includes(target)||target===user.uid)throw Error('التأكيد متاح للأعضاء الآخرين بعد اكتمال المجموعة');
 const ref=checkRef(id,TODAY(),user.uid);
 await runTransaction(db,async tx=>{
  const old=await tx.get(ref);
  const prior=old.exists()?old.data().testedUids||[]:[];
  const value={uid:user.uid,day:TODAY(),testedUids:[...new Set([...prior,target])],updatedAt:serverTimestamp()};
  tx.set(ref,value);
 });
 await openGroup(id);
}
async function sendReminder(toUid){
 if(toUid===user.uid||!detail.group.memberUids.includes(toUid))throw Error('عضو غير صالح');
 const day=TODAY(),id=user.uid+'_'+toUid+'_'+day;
 await setDoc(doc(db,'exchangeGroups',selectedId,'reminders',id),{fromUid:user.uid,toUid,day,createdAt:serverTimestamp()});
 await openGroup(selectedId);
}
async function warn(uid){
 if(detail.group.ownerUid!==user.uid)throw Error('التنبيه الرسمي لصاحب المجموعة فقط');
 const day=YESTERDAY(),id=uid+'_'+day;
 await setDoc(doc(db,'exchangeGroups',selectedId,'warnings',id),{uid,day,byUid:user.uid,createdAt:serverTimestamp()});
 await openGroup(selectedId);
}
async function exclude(uid){
 const g=detail.group;
 if(g.ownerUid!==user.uid||uid===g.ownerUid||!g.memberUids.includes(uid))throw Error('لا يمكن استبعاد هذا العضو');
 const days=[...new Set(detail.warnings.filter(x=>x.uid===uid).map(x=>x.day))].sort().slice(-3);
 if(days.length!==3)throw Error('الاستبعاد يتطلب ثلاثة إنذارات مختلفة');
 if(!confirm('استبعاد العضو من تبادل المجموعة وفتح مكان بديل؟ سجلاته السابقة لن تُحذف.'))return;
 await runTransaction(db,async tx=>{
  const ref=groupRef(selectedId),snap=await tx.get(ref),now=snap.data();
  if(now.ownerUid!==user.uid||!now.memberUids.includes(uid)||now.status!=='active')throw Error('تغيرت حالة المجموعة');
  tx.update(ref,{memberUids:now.memberUids.filter(x=>x!==uid),removedUids:[...(now.removedUids||[]),uid],status:'open',lastRemoval:{uid,days,at:serverTimestamp()}});
 });
 await openGroup(selectedId);
}
async function withBusy(task){
 if(busy)return;busy=true;
 document.querySelectorAll('button').forEach(b=>b.disabled=true);
 try{await task()}catch(e){console.error(e);status(e.message||'فشلت العملية، راجع تسجيل الدخول أو الصلاحيات',true)}
 finally{busy=false;document.querySelectorAll('button').forEach(b=>{if(!b.hasAttribute('data-test')&&!b.hasAttribute('data-remind')&&!b.hasAttribute('data-warn'))b.disabled=false})}
}
document.addEventListener('click',e=>{
 const button=e.target.closest('button');if(!button||busy)return;
 const {open,join,test,remind,warn:warnUid,exclude:excludeUid}=button.dataset;
 if(open)withBusy(()=>openGroup(open));
 else if(join){$('#content').insertAdjacentHTML('afterbegin',joinForm(join));$('#membership-form').scrollIntoView({behavior:'smooth'})}
 else if(button.id==='create-group'){$('#content').insertAdjacentHTML('afterbegin',joinForm(''))}
 else if(button.id==='cancel-form'){$('#membership-form')?.parentElement.remove()}
 else if(button.id==='back-groups')withBusy(()=>refreshList());
 else if(button.id==='reload-group')withBusy(()=>openGroup(selectedId));
 else if(button.id==='copy-emails')withBusy(async()=>{await navigator.clipboard.writeText(button.dataset.emails);status('تم نسخ '+detail.members.length+' إيميلاً')});
 else if(test)withBusy(()=>confirmTest(test));
 else if(remind)withBusy(()=>sendReminder(remind));
 else if(warnUid)withBusy(()=>warn(warnUid));
 else if(excludeUid)withBusy(()=>exclude(excludeUid));
});
document.addEventListener('submit',e=>{
 if(e.target.id!=='membership-form')return;
 e.preventDefault();const id=e.target.dataset.group;
 withBusy(()=>id?joinGroup(id):createGroup());
});
onAuthStateChanged(auth,async u=>{
 user=u;detail=null;
 if(!u){status('سجّل الدخول أولاً من TesterHub IQ');$('#content').innerHTML='<div class="panel"><a href="./index.html">الذهاب لتسجيل الدخول</a></div>';return}
 try{
  await u.getIdToken(true);
  if(!u.emailVerified){status('أكد بريدك الإلكتروني من داخل المنصة قبل استخدام مجموعات التبادل',true);return}
  const snap=await getDoc(doc(db,'users',u.uid));profile=snap.exists()?snap.data():null;
  if(!profile||profile.suspended){status('يلزم حساب نشط مكتمل على TesterHub IQ',true);return}
  await refreshList();
 }catch(err){status('تعذّر فتح مجموعات التبادل: '+(err.message||'خطأ غير معروف'),true)}
});
