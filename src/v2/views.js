// TesterHub V2 — one account (publish and test with the same account) in the four sections of the
// approved preview: التطبيقات، المجموعات، اختباراتي، حسابي. Each task is a three-step sheet.
// Classic script: it only defines functions; they run at render time and use the app's globals
// (user, dashboard, tab, api, features, clean, ico, formatNum, ...) defined in index.html.
const V2={filter:'all',q:'',groupView:'mine',testsView:'testing',sheet:null};
const V2_COLORS=['#0551CF','#0CAA79','#7A4CE0','#E07A1F','#D23B6B','#0E8FB8','#5B6B8C','#2F9E44'];
const v2n=n=>new Intl.NumberFormat('en-US').format(Number(n)||0);
const V2_NEED=12; // Google Play asks for 12 testers who stay 14 days.
function v2Color(key){let h=0;for(const c of String(key||''))h=(h*31+c.charCodeAt(0))>>>0;return V2_COLORS[h%V2_COLORS.length]}
function v2Icon(name,key,size=56){
 const letter=clean(String(name||'').trim().charAt(0)||'؟');
 return `<span class="v2-appicon" style="background:${v2Color(key||name)};width:${size}px;height:${size}px;flex-basis:${size}px;font-size:${Math.round(size*.4)}px;border-radius:${Math.round(size*.29)}px" aria-hidden="true">${letter}</span>`;
}
const v2Tag=(cls,text)=>`<span class="v2-tag ${cls}">${clean(text)}</span>`;
const v2Bar=pct=>`<div class="v2-bar"><span style="width:${Math.max(0,Math.min(100,pct))}%"></span></div>`;
const v2Ms=x=>x?.toMillis?.()??(typeof x?.seconds==='number'?x.seconds*1000:Date.parse(x||''));
function v2FirstName(){return clean(String(user?.name||'').trim().split(/\s+/)[0]||'')}
function v2Expired(a){return !!a.joinedDay&&api.daysSince(a.joinedDay)>14}
function v2DoneToday(a){return (a.checkins||[]).includes(api.dayKey())}

// ---------- Header, hero, FAB ----------
function v2Hero(){
 const work=classifyTesterWork(primaryAssignments()),n=work.due.length;
 return `<section class="v2-card v2-hero"><p class="v2-muted v2-small">هلا ${v2FirstName()}</p><h3>${n?`باقيلك ${v2n(n)} ${n===1?'اختبار':'اختبارات'} اليوم`:'خلصت اختبارات اليوم، عاشت إيدك'}</h3><div class="v2-row">${n?`<button type="button" class="v2-btn v2-btn-white" data-v2="go-testing">كمّلها هسه</button>`:''}<span class="v2-small v2-muted">كل اختبار يومي = ‎+10 XP</span></div></section>`;
}
function v2Fab(){return tab==='home'&&!V2.sheet?`<button type="button" class="v2-btn v2-btn-primary v2-fab" data-v2="add-open">${ico('add',20)} أضف تطبيقك</button>`:''}

// ---------- التطبيقات ----------
// What the account can see: its own apps, the apps it tests, and apps that accept testers (open cards).
function v2Catalog(){
 const items=[],seen=new Set();
 for(const p of mineProjects()){
  const members=myProjectAssignments(p.id),joined=members.filter(a=>a.joinedDay),first=joined.map(a=>a.joinedDay).sort()[0];
  const day=first?Math.min(14,trDays(api.daysSince(first))):0;
  items.push({kind:'mine',id:p.id,name:p.name,dev:user.name,testers:joined.length,need:V2_NEED,day,status:p.status||'recruiting',isNew:false});seen.add(p.id);
 }
 for(const a of primaryAssignments()){
  if(a.invitationStatus==='declined'||seen.has(a.projectId))continue;seen.add(a.projectId);
  items.push({kind:'test',id:a.id,name:a.name,dev:a.ownerName||'',day:a.joinedDay?currentDay(a):0,a,isNew:false});
 }
 const requests=new Map((dashboard.joinRequests||[]).map(r=>[r.projectId,r]));
 for(const o of dashboard.openings||[]){
  if(o.status!=='open'||o.ownerUid===user.uid||seen.has(o.id))continue;seen.add(o.id);
  const age=Date.now()-v2Ms(o.updatedAt);
  items.push({kind:'open',id:o.id,name:o.name,dev:o.ownerName||'',slots:Math.max(1,Number(o.slots)||V2_NEED),request:requests.get(o.id)||null,isNew:Number.isFinite(age)&&age<3*86400000});
 }
 return items;
}
function v2Needs(x){return x.kind==='open'||(x.kind==='mine'&&x.status==='recruiting'&&x.testers<x.need)}
function v2Home(){
 const q=V2.q.trim(),all=v2Catalog();
 const list=all.filter(x=>{
  if(q&&!(String(x.name)+' '+String(x.dev)).includes(q))return false;
  if(V2.filter==='need')return v2Needs(x);
  if(V2.filter==='new')return x.isNew||x.kind==='mine'&&x.status==='draft';
  if(V2.filter==='mine')return x.kind==='test';
  return true;
 });
 const chips=[['all','الكل'],['need','يحتاج مختبرين'],['new','جديد'],['mine','أختبرها']];
 const empty=all.length?'ماكو تطبيقات بهذا البحث':`ماكو تطبيقات بعد.<br>أضف تطبيقك، أو انتظر دعوة اختبار من مطور.${features.officialGroup?'':'<br><span class="v2-small">التطبيقات المفتوحة للكل تظهر هنا من تتفعّل مجموعة TesterHub.</span>'}`;
 return `${groupGate()}${v2Hero()}
 <div class="v2-search"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7894" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><label class="sr-only" for="v2-q">ابحث عن تطبيق</label><input id="v2-q" type="search" placeholder="ابحث عن تطبيق أو مطور" value="${clean(V2.q)}" autocomplete="off"></div>
 <div class="v2-chips" role="tablist" aria-label="تصفية التطبيقات">${chips.map(([k,l])=>`<button type="button" class="v2-chip ${V2.filter===k?'on':''}" data-v2="filter" data-k="${k}" role="tab" aria-selected="${V2.filter===k}">${l}</button>`).join('')}</div>
 <div class="v2-list">${list.length?list.map(v2AppCard).join(''):`<div class="v2-empty">${empty}</div>`}</div>`;
}
function v2AppCard(x){
 let status='',line='',pct=0,right='';
 if(x.kind==='mine'){
  status=x.status==='draft'?v2Tag('t-amber','مسودة'):x.status==='completed'?v2Tag('t-green','انتهى'):x.testers>=x.need?v2Tag('t-green','اكتمل العدد'):v2Tag('t-blue','تطبيقك');
  line=`<span><b>${v2n(x.testers)}</b> من ${v2n(x.need)} مختبر</span>`;pct=x.testers/x.need*100;right=x.day?`اليوم ${v2n(x.day)} من 14`:'ما بدأ بعد';
 }else if(x.kind==='test'){
  const a=x.a,done=v2DoneToday(a);
  status=a.invitationStatus==='pending'?v2Tag('t-blue','دعوة جديدة'):!a.joinedDay?v2Tag('t-amber','كمّل الانضمام'):v2Expired(a)?v2Tag('t-green','انتهى'):done?v2Tag('t-green','تم اليوم'):v2Tag('t-amber','مطلوب اليوم');
  line=`<span>${v2n((a.checkins||[]).length)} تقرير يومي</span>`;pct=Math.min(100,x.day/14*100);right=a.joinedDay?`اليوم ${v2n(x.day)} من 14`:'ما بدأ بعد';
 }else{
  const r=x.request;
  status=r?.status==='waiting'?v2Tag('t-amber','بالانتظار'):r?.status==='approved'?v2Tag('t-green','انقبلت'):x.isNew?v2Tag('t-blue','جديد'):v2Tag('t-blue','يحتاج مختبرين');
  line=`<span>يحتاج <b>${v2n(x.slots)}</b> مختبر</span>`;pct=0;right='مفتوح هسه';
 }
 return `<button type="button" class="v2-card v2-appcard" data-v2="open-item" data-kind="${x.kind}" data-id="${clean(x.id)}" aria-label="${clean(x.name)} — تفاصيل">
  <span class="v2-row">${v2Icon(x.name,x.id)}<span class="v2-grow"><span class="v2-row v2-between"><b class="v2-h3">${clean(x.name)}</b>${status}</span><span class="v2-meta">${clean(x.dev||'')}${x.dev?' · ':''}اختبار مغلق</span></span></span>
  <span><span class="v2-row v2-between v2-small" style="margin-bottom:6px">${line}<span class="v2-muted">${right}</span></span>${v2Bar(pct)}</span>
 </button>`;
}

// ---------- المجموعات ----------
function v2Groups(){
 return `<div class="v2-seg" role="tablist"><button type="button" class="${V2.groupView==='mine'?'on':''}" data-v2="gview" data-k="mine" role="tab" aria-selected="${V2.groupView==='mine'}">مجموعتي</button><button type="button" class="${V2.groupView==='open'?'on':''}" data-v2="gview" data-k="open" role="tab" aria-selected="${V2.groupView==='open'}">المجموعة المفتوحة</button></div>
 ${V2.groupView==='mine'?v2MyGroup():v2OpenGroup()}`;
}
// «مجموعتي» and «المجموعة المفتوحة» are the exchange packs: see src/v2/packs.js.

// ---------- اختباراتي ----------
function v2Tests(){
 return `<div class="v2-seg" role="tablist"><button type="button" class="${V2.testsView==='testing'?'on':''}" data-v2="tview" data-k="testing" role="tab" aria-selected="${V2.testsView==='testing'}">أختبرها</button><button type="button" class="${V2.testsView==='mine'?'on':''}" data-v2="tview" data-k="mine" role="tab" aria-selected="${V2.testsView==='mine'}">تطبيقاتي</button></div>
 ${V2.testsView==='testing'?v2Testing():v2MyApps()}`;
}
function v2Testing(){
 // Only tests the account accepted or started; new invitations wait on «التطبيقات».
 const list=primaryAssignments().filter(a=>!!a.joinedDay||a.invitationStatus==='accepted');
 const invites=primaryAssignments().filter(a=>a.invitationStatus==='pending').length;
 if(!list.length)return `<div class="v2-empty">ما وافقت على أي اختبار بعد.${invites?`<br>عندك ${v2n(invites)} ${invites===1?'دعوة':'دعوات'} بالتطبيقات.`:''}<br><button type="button" class="v2-btn v2-btn-primary" data-tab="home" style="margin-top:12px">شوف التطبيقات</button></div>`;
 const rank=a=>v2Expired(a)?4:!a.joinedDay?1:v2DoneToday(a)?3:classifyTesterWork([a]).cooldown.length?2:0;
 return `<div class="v2-list">${list.slice().sort((x,y)=>rank(x)-rank(y)).map(a=>{
  const d=a.joinedDay?currentDay(a):0,done=v2DoneToday(a),expired=v2Expired(a),cooldown=classifyTesterWork([a]).cooldown.length>0;
  const tag=a.invitationStatus==='pending'?v2Tag('t-blue','دعوة جديدة'):!a.joinedDay?v2Tag('t-amber','كمّل الانضمام'):expired?v2Tag('t-green','انتهى'):done?v2Tag('t-green','تم اليوم'):v2Tag('t-amber','مطلوب اليوم');
  const btn=!a.joinedDay?`<button type="button" class="v2-btn v2-btn-primary v2-btn-block" data-v2="open-item" data-kind="test" data-id="${clean(a.id)}">كمّل الانضمام (3 خطوات)</button>`
   :expired?`<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" disabled>انتهت فترة الاختبار</button>`
   :done?`<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" disabled>أرسلت تقرير اليوم</button>`
   :cooldown?`<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" disabled>انتظر موعد التقرير الجاي</button>`
   :`<button type="button" class="v2-btn v2-btn-primary v2-btn-block" data-v2="report-open" data-id="${clean(a.id)}">تقرير اليوم (3 نقرات)</button>`;
  const saved=done?reportForToday(a):null;
  return `<div class="v2-card v2-test" data-test-id="${clean(a.id)}">
   <div class="v2-row">${v2Icon(a.name,a.projectId)}<div class="v2-grow"><div class="v2-row v2-between"><b class="v2-h3">${clean(a.name)}</b>${tag}</div><div class="v2-small v2-muted">${a.joinedDay?`اليوم ${v2n(d)} من 14 · ${v2n((a.checkins||[]).length)} تقرير`:'ما بدأ بعد'}</div></div></div>
   <div style="margin:12px 0">${v2Bar(d/14*100)}</div>
   ${a.joinedDay&&!expired?`<p class="v2-small" style="margin:0 0 12px"><b>مهمة اليوم:</b> ${clean(taskForDay(a))}</p>`:''}
   ${saved?`<div class="v2-saved"><span class="v2-small"><b>تقرير اليوم:</b> ${clean(REPORT_OUTCOMES[saved.outcome]||'')}</span>${saved.reviewStatus==='accepted'?`<span class="xp-earned v2-tag t-green">+${v2n(XP_POINTS[xpKindForReport(saved)]+(saved.retestOf?XP_POINTS.retest:0))} XP</span>`:''}${reviewChip(saved)}</div>${saved.reviewStatus==='clarify'?'<div class="v2-notice n-amber" style="margin-bottom:10px">المطور طلب توضيحاً. اكتب له التفاصيل بالمحادثة.</div>':''}`:''}
   ${btn}${a.joinedDay?`<div class="v2-row" style="margin-top:8px"><button type="button" class="v2-btn v2-btn-ghost v2-grow" data-action="open-app" data-id="${clean(a.id)}">فتح التطبيق</button><button type="button" class="v2-btn v2-btn-ghost v2-grow" data-action="open-chat" data-id="${clean(a.id)}">مراسلة المطور</button></div>`:''}
  </div>`}).join('')}</div>`;
}
function v2MyApps(){
 const projects=mineProjects();
 const today=api.dayKey(),reports=(dashboard.reports||[]).filter(r=>r.ownerUid===user.uid);
 return `<div class="v2-list">${projects.map(p=>{
  const members=myProjectAssignments(p.id),joined=members.filter(a=>a.joinedDay),first=joined.map(a=>a.joinedDay).sort()[0];
  const day=first?Math.min(14,trDays(api.daysSince(first))):0,mine=reports.filter(r=>r.projectId===p.id);
  const start=first?Date.UTC(+first.slice(0,4),+first.slice(5,7)-1,+first.slice(8,10)):null;
  const perDay=Array.from({length:14},(_,i)=>start===null?0:mine.filter(r=>r.date===new Date(start+i*86400000).toISOString().slice(0,10)).length);
  const top=Math.max(1,...perDay),issues=mine.filter(r=>needsFollowUp(r)&&r.status!=='fixed').length;
  return `<div class="v2-card">
   <div class="v2-row">${v2Icon(p.name,p.id)}<div class="v2-grow"><div class="v2-row v2-between"><b class="v2-h3">${clean(p.name)}</b>${p.status==='draft'?v2Tag('t-amber','مسودة'):p.status==='completed'?v2Tag('t-green','انتهى'):issues?v2Tag('t-red',v2n(issues)+' بلاغ'):''}</div><div class="v2-small v2-muted">${p.status==='draft'?'ما انرسلت دعوات بعد':day?`اليوم ${v2n(day)} من 14 بالاختبار المغلق`:'بانتظار أول مختبر يبدي'}</div></div></div>
   <div class="v2-row" style="margin-top:14px"><div class="v2-stat"><b>${v2n(joined.length)}/${v2n(V2_NEED)}</b><span class="v2-small v2-muted">مختبر</span></div><div class="v2-stat"><b>${v2n(mine.filter(r=>r.date===today).length)}</b><span class="v2-small v2-muted">تقرير اليوم</span></div><div class="v2-stat"><b>${v2n(day?14-day:14)}</b><span class="v2-small v2-muted">يوم باقي</span></div></div>
   <div class="v2-mini-bars" role="img" aria-label="التقارير اليومية خلال 14 يوم">${perDay.map((n,i)=>`<span class="${i<day?'t':''}" style="height:${Math.max(8,n/top*100)}%"></span>`).join('')}</div>
   <button type="button" class="v2-btn v2-btn-soft v2-btn-block" style="margin-top:12px" data-action="project-details" data-id="${clean(p.id)}">${p.status==='draft'?'كمّل المسودة':'التقارير والبلاغات'}</button>
  </div>`}).join('')}
  ${projects.length?'':'<div class="v2-empty">ما أضفت تطبيق بعد.</div>'}
  <button type="button" class="v2-btn v2-btn-primary v2-btn-block" data-v2="add-open">أضف تطبيق جديد</button></div>`;
}

// ---------- حسابي ----------
function v2Account(){
 const m=user,photo=myPublicProfile?.photo,xp=verifiedXp(),level=1+Math.floor(xp/100);
 const sw=(key,on,label)=>`<button type="button" class="v2-switch ${on?'on':''}" data-v2="${key}" role="switch" aria-checked="${!!on}" aria-label="${label}"></button>`;
 const links=[['rewards','دوري المساهمين'],['announcements','مركز الإشعارات'],['help','مركز المساعدة'],...(api.isDemo?[]:[['support','رسائل الإدارة'+(unreadSupport().length?' ('+v2n(unreadSupport().length)+')':'')]]),...(mineProjects().length?[['testers','المختبرون المتاحون']]:[])];
 return `<section class="v2-card" style="margin-top:6px">
  <div class="v2-row">${photo?`<img class="v2-avatar" src="${clean(photo)}" alt="" width="56" height="56">`:`<span class="v2-appicon v2-avatar" aria-hidden="true">${clean(String(m.name||'؟').trim().charAt(0)||'؟')}</span>`}<div class="v2-grow"><b class="v2-h3">${clean(m.name)}</b><div class="v2-small v2-muted email-ltr" style="text-align:right">${clean(m.email||'')}</div></div><span class="v2-tag t-blue">المستوى ${v2n(level)}</span></div>
  <div class="v2-row" style="margin-top:14px"><div class="v2-stat"><b>${v2n(xp)}</b><span class="v2-small v2-muted">XP</span></div><div class="v2-stat"><b>${v2n(primaryAssignments().length)}</b><span class="v2-small v2-muted">أختبرها</span></div><div class="v2-stat"><b>${v2n(mineProjects().length)}</b><span class="v2-small v2-muted">تطبيقاتي</span></div></div>
 </section>
 ${adminAuthorized?`<a class="v2-btn v2-btn-primary v2-btn-block" style="margin-top:12px" href="./admin.html">${ico('shield',18)} لوحة إدارة المنصة</a>`:''}
 <h2 class="v2-h2">الإعدادات</h2>
 <div class="v2-card">
  <div class="v2-setting"><div><b>إظهار إيميلي للمطورين</b><div class="v2-small v2-muted">حتى يضيفوك لاختباراتهم المغلقة</div></div>${sw('toggle-available',m.available,'إظهار إيميلي للمطورين')}</div>
  <div class="v2-setting"><div><b>تذكير يومي</b><div class="v2-small v2-muted">إذا عندك اختبارات ما خلصتها</div></div><button type="button" class="v2-btn v2-btn-soft v2-btn-sm" data-action="enable-reminder">تفعيل</button></div>
  <div class="v2-setting"><div><b>وقت التذكير</b></div><select id="reminder-hour" class="v2-select" aria-label="وقت التذكير">${Array.from({length:24},(_,i)=>`<option value="${i}" ${i===api.getReminderHour()?'selected':''}>${(i%12)||12}:00 ${i<12?'ص':'م'}</option>`).join('')}</select></div>
 </div>
 <h2 class="v2-h2">أكثر</h2>
 <div class="v2-card">${links.map(([t,l])=>`<button type="button" class="v2-linkrow" data-tab="${t}"><span>${l}</span><span class="v2-muted" aria-hidden="true">‹</span></button>`).join('')}
  <button type="button" class="v2-linkrow" data-action="install"><span>تثبيت على الشاشة الرئيسية</span><span class="v2-muted" aria-hidden="true">‹</span></button>
  <a class="v2-linkrow" href="./privacy.html"><span>الخصوصية والشروط</span><span class="v2-muted" aria-hidden="true">‹</span></a>
  ${api.isDemo?`<button type="button" class="v2-linkrow" data-action="switch-demo"><span>تبديل الحساب التجريبي</span><span class="v2-muted">‹</span></button><button type="button" class="v2-linkrow" data-action="reset-demo"><span>إعادة بيانات المعاينة</span><span class="v2-muted">‹</span></button>`:`<button type="button" class="v2-linkrow v2-danger" data-action="request-deletion"><span>حذف الحساب</span><span class="v2-muted" aria-hidden="true">‹</span></button>`}
 </div>
 ${api.isDemo?'':`<h2 class="v2-h2">ملفك</h2>${profileEditor()}<div class="v2-card"><div class="v2-row"><label class="v2-btn v2-btn-soft v2-grow">${ico('camera',16)} ${photo?'تغيير صورتك':'إضافة صورة شخصية'}<input type="file" accept="image/*" data-change="profile-photo" hidden></label>${photo?'<button type="button" class="v2-btn v2-btn-ghost" data-action="remove-photo">إزالة</button>':''}</div><p class="v2-small v2-muted" style="margin:8px 0 0">صورتك واسمك يظهرون بالدوري بس إذا فعّلتها بصفحة الدوري. البريد ما يظهر أبداً.</p></div>`}
 ${api.isDemo?'':`<button type="button" class="v2-btn v2-btn-ghost v2-btn-block v2-danger" style="margin-top:14px" data-action="logout">تسجيل الخروج</button>`}`;
}

// ---------- Sheets (three steps each) ----------
const v2Dots=step=>`<div class="v2-dots">${[1,2,3].map(i=>`<span class="${i<=step?'on':''}"></span>`).join('')}</div>`;
const v2StepRow=(n,t,d,st)=>`<div class="v2-step ${st}"><span class="v2-num">${st==='done'?'✓':v2n(n)}</span><div><b>${t}</b><p>${d}</p></div></div>`;
function v2Sheet(){
 const s=V2.sheet;if(!s||!user)return '';
 let body='';
 try{body=s.kind==='test'?v2TestSheet(s):s.kind==='open'?v2OpenSheet(s):s.kind==='report'?v2ReportSheet(s):s.kind==='add'?v2AddSheet(s):s.kind==='pack'?packSheet(s):''}catch(err){console.warn('Sheet:',err);body=''}
 if(!body){V2.sheet=null;return ''}
 // Slides up once when it opens; the next steps re-render in place without replaying it.
 const first=!s.shown;s.shown=true;
 return `<div class="v2-sheet-wrap" role="dialog" aria-modal="true" aria-label="${clean(s.title||'تفاصيل')}"><button type="button" class="v2-sheet-backdrop" data-v2="close" aria-label="إغلاق"></button><div class="v2-sheet${first?' v2-sheet-in':''}"><div class="v2-grab"></div>${body}</div></div>`;
}
function v2TestSheet(s){
 const a=primaryAssignments().find(x=>x.id===s.id);if(!a)return '';
 s.title=a.name;
 const step=a.invitationStatus==='pending'?0:!a.joinedDay?1:3,links=playLinks(a.link);
 const btn=step===0?`<button type="button" class="v2-btn v2-btn-primary v2-btn-block" data-action="accept-invite" data-id="${clean(a.id)}">١. اقبل الدعوة</button><button type="button" class="v2-btn v2-btn-ghost v2-btn-block" style="margin-top:8px" data-action="decline-invite" data-id="${clean(a.id)}">ما أگدر أختبره</button>`
  :step===1?`<button type="button" class="v2-btn v2-btn-primary v2-btn-block" data-action="open-link" data-id="${clean(a.id)}" ${links.join?'':'disabled'}>٢. انضم ونزّل من Google Play</button><button type="button" class="v2-btn v2-btn-green v2-btn-block" style="margin-top:8px" data-action="confirm-join" data-id="${clean(a.id)}">٣. أؤكد إني انضميت وثبّتّه</button>`
  :v2DoneToday(a)||v2Expired(a)?`<button type="button" class="v2-btn v2-btn-soft v2-btn-block" data-v2="go-testing">انتقل لاختباراتي</button>`
  :`<button type="button" class="v2-btn v2-btn-primary v2-btn-block" data-v2="report-open" data-id="${clean(a.id)}">تقرير اليوم (3 نقرات)</button>`;
 return `<div class="v2-row">${v2Icon(a.name,a.projectId)}<div><b class="v2-h3" style="font-size:19px">${clean(a.name)}</b><div class="v2-small v2-muted">اختبار مغلق · Google Play</div></div></div>
  <div class="v2-row" style="margin:14px 0"><div class="v2-stat"><b>${a.joinedDay?v2n(currentDay(a)):'—'}</b><span class="v2-small v2-muted">يوم الاختبار</span></div><div class="v2-stat"><b>${v2n((a.checkins||[]).length)}</b><span class="v2-small v2-muted">تقرير يومي</span></div><div class="v2-stat"><b>${v2n(assignmentXp(a))}</b><span class="v2-small v2-muted">XP</span></div></div>
  ${a.joinedDay?`<div class="v2-notice n-blue"><b>مهمة اليوم:</b> ${clean(taskForDay(a))}</div>`:''}
  <div class="v2-steps">${v2StepRow(1,'اقبل الدعوة','من المطور، بدون ما تلتزم بشي بعد',step>0?'done':'cur')}${v2StepRow(2,'انضم ونزّل التطبيق','من رابط Google Play الرسمي',step>1?'done':step===1?'cur':'')}${v2StepRow(3,'أكّد','ويبدي عداد 14 يوم واختباراتك اليومية',step>2?'done':'')}</div>
  ${btn}<div class="v2-small v2-muted" style="text-align:center;margin-top:10px">تأكيدك إقرار منك. Google Play هو اللي يثبت اشتراكك رسمياً.</div>
  <button type="button" class="v2-btn v2-btn-ghost v2-btn-block" style="margin-top:8px" data-v2="close">رجوع</button>`;
}
function v2OpenSheet(s){
 const o=(dashboard.openings||[]).find(x=>x.id===s.id);if(!o)return '';
 s.title=o.name;
 const r=(dashboard.joinRequests||[]).find(x=>x.projectId===o.id&&x.testerUid===user.uid),st=r?.status;
 const step=st==='approved'?2:st==='waiting'?1:0;
 const btn=st==='waiting'?`<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" data-action="cancel-join" data-id="${clean(o.id)}">إلغاء الطلب</button>`
  :st==='approved'?`<button type="button" class="v2-btn v2-btn-soft v2-btn-block" data-v2="go-testing">الدعوة بـ «اختباراتي»</button>`
  :st==='declined'?`<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" disabled>ما انقبل الطلب</button>`
  :`<button type="button" class="v2-btn v2-btn-primary v2-btn-block" data-action="join-request" data-id="${clean(o.id)}">١. اطلب تختبره</button>`;
 return `<div class="v2-row">${v2Icon(o.name,o.id)}<div><b class="v2-h3" style="font-size:19px">${clean(o.name)}</b><div class="v2-small v2-muted">${clean(o.ownerName||'مطور')} · اختبار مغلق</div></div></div>
  <div class="v2-row" style="margin:14px 0"><div class="v2-stat"><b>${v2n(Math.max(1,Number(o.slots)||V2_NEED))}</b><span class="v2-small v2-muted">مختبر مطلوب</span></div><div class="v2-stat"><b>14</b><span class="v2-small v2-muted">يوم</span></div></div>
  <div class="v2-notice n-blue">لازم تكون منضم لمجموعة TesterHub بنفس حساب Google Play حتى تگدر تفتح رابط الاختبار.</div>
  <div class="v2-steps">${v2StepRow(1,'اطلب تختبره','تدخل قائمة الانتظار',step>0?'done':'cur')}${v2StepRow(2,'المطور يقبلك','وتوصلك دعوة باختباراتي',step>1?'done':step===1?'cur':'')}${v2StepRow(3,'انضم وأكّد','من رابط Google Play، ويبدي العداد',step===2?'cur':'')}</div>
  ${btn}<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" style="margin-top:8px" data-v2="close">رجوع</button>`;
}
function v2ReportSheet(s){
 const a=primaryAssignments().find(x=>x.id===s.id);if(!a)return '';
 s.title=a.name+' · تقرير اليوم';
 const task=taskForDay(a),retest=typeof retestTarget==='function'?retestTarget(a):null;
 let body='';
 if(s.step===1)body=`<b class="v2-h3" style="font-size:19px">جربت مهمة اليوم؟</b><p class="v2-small v2-muted">${clean(task)}</p>${retest?`<div class="v2-notice n-amber">المطور صلّح المشكلة اللي بلّغت عنها: «${clean(String(retest.notes||'').slice(0,90))}». جرّبها اليوم واكتب النتيجة.</div>`:''}<button type="button" class="v2-opt" data-v2="rep-tried">نعم، جربتها</button><button type="button" class="v2-opt" data-v2="rep-cant">ما گدرت أفتح التطبيق</button><button type="button" class="v2-btn v2-btn-ghost v2-btn-block" style="margin-top:10px" data-action="open-app" data-id="${clean(a.id)}">فتح التطبيق هسه</button>`;
 if(s.step===2)body=`<b class="v2-h3" style="font-size:19px">شنو النتيجة؟</b>${[['ok','تشتغل تمام'],['issue','لگيت مشكلة'],['blocked','ما گدرت أكمل']].map(([k,l])=>`<button type="button" class="v2-opt ${s.outcome===k?'on':''}" data-v2="rep-res" data-k="${k}">${l}</button>`).join('')}`;
 if(s.step===3){
  const hint=s.outcome==='ok'?'أي شي تحب تگوله':s.outcome==='issue'?'شنو صار؟ شلون نعيد المشكلة؟':'شنو اللي منعك تكمل؟';
  // «تشتغل تمام» suggests a note naming today's task; it never replaces what the tester typed.
  if(s.notes==null&&s.outcome==='ok'){s.auto=quickOkNote(task);s.notes=s.auto}
  body=`<b class="v2-h3" style="font-size:19px">ملاحظة للمطور</b><p class="v2-small v2-muted">${REPORT_OUTCOMES[s.outcome]||''} · 10 أحرف على الأقل</p><label class="sr-only" for="v2-note">ملاحظة</label><textarea id="v2-note" class="v2-input" rows="4" maxlength="800" placeholder="${hint}">${clean(s.notes??'')}</textarea><div class="v2-err" id="v2-err" role="alert"></div><button type="button" class="v2-btn v2-btn-primary v2-btn-block" style="margin-top:12px" data-v2="rep-send">إرسال التقرير</button>`;
 }
 return `<div class="v2-row v2-between"><b>${clean(a.name)} · تقرير اليوم</b><span class="v2-small v2-muted">${v2n(s.step)}/3</span></div>${v2Dots(s.step)}${body}<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" style="margin-top:8px" data-v2="${s.step>1?'rep-back':'close'}">${s.step>1?'رجوع':'إلغاء'}</button>`;
}
function v2AddSheet(s){
 s.title='أضف تطبيقك';
 const gate=publishGate({totals:dashboard.publish?.totals,slot:dashboard.publish?.slot,projects:mineProjects()});
 let body='';
 if(s.step===1)body=`<b class="v2-h3" style="font-size:19px">تطبيقك</b>${gate.ok?'':`<div class="v2-notice n-amber" style="margin-top:10px">${gate.live?`عندك تطبيق نشط («${clean(gate.live.name)}»). تگدر تحفظه مسودة وتنشره بعد ما ينتهي.`:`حتى تنشر تحتاج ${v2n(gate.need)} تقرير مقبول إضافي من اختبار تطبيقات غيرك. تگدر تحفظه مسودة هسه.`}</div>`}<label class="v2-label" for="v2-an">اسم التطبيق</label><input id="v2-an" class="v2-input" maxlength="70" value="${clean(s.name||'')}"><label class="v2-label" for="v2-au">رابط الاختبار المغلق</label><input id="v2-au" class="v2-input email-ltr" inputmode="url" placeholder="https://play.google.com/apps/testing/..." value="${clean(s.link||'')}"><div class="v2-err" id="v2-err" role="alert"></div><button type="button" class="v2-btn v2-btn-primary v2-btn-block" data-v2="add-next">التالي</button>`;
 if(s.step===2)body=`<b class="v2-h3" style="font-size:19px">شنو يختبرون كل يوم؟</b><p class="v2-small v2-muted">جملة وحدة واضحة لكل يوم (سطر لكل مهمة، لحد 14). المختبر يشوفها بتقرير اليوم.</p><label class="sr-only" for="v2-at">مهام الاختبار</label><textarea id="v2-at" class="v2-input" rows="4" maxlength="1680" placeholder="مثلاً: سجّل حساب وجرب البحث">${clean(s.tasks||'')}</textarea><div class="v2-err" id="v2-err" role="alert"></div><button type="button" class="v2-btn v2-btn-primary v2-btn-block" data-v2="add-next">التالي</button>`;
 if(s.step===3){
  const testers=eligibleTesters();
  body=`<b class="v2-h3" style="font-size:19px">راجع وانشر</b><div class="v2-card" style="box-shadow:none;margin-top:10px"><div class="v2-row">${v2Icon(s.name,s.name,44)}<div class="v2-grow"><b>${clean(s.name)}</b><div class="v2-small v2-muted email-ltr" style="text-align:right;word-break:break-all">${clean(s.link)}</div></div></div><p class="v2-small" style="margin:12px 0 0"><b>المهام:</b> ${clean(String(s.tasks).split(/\r?\n/).filter(Boolean).join(' · '))}</p></div>
  <div class="v2-notice n-amber" style="margin-top:12px">قبل النشر: ضيف بريد مجموعة TesterHub بقائمة المختبرين بـ Play Console (أو إيميلات المختبرين).<div class="v2-row" style="margin-top:8px"><span class="v2-code email-ltr v2-grow">${OFFICIAL_GROUP.email}</span><button type="button" class="v2-btn v2-btn-white v2-btn-sm" data-action="copy-group-email">نسخ</button></div>${testers.length?`<button type="button" class="v2-btn v2-btn-white v2-btn-sm" style="margin-top:8px" data-v2="add-copy-emails">نسخ إيميلات ${v2n(testers.length)} مختبر</button>`:''}</div>
  <button type="button" class="v2-opt ${s.confirmed?'on':''}" data-v2="add-confirm" aria-pressed="${!!s.confirmed}"><span class="v2-cbox ${s.confirmed?'on':''}">${s.confirmed?'✓':''}</span>أضفت المجموعة أو الإيميلات بـ Play Console</button>
  <div class="v2-small v2-muted" style="margin-top:8px">تنرسل دعوة متابعة لـ ${v2n(testers.length)} مختبر متاح داخل TesterHub.</div>
  ${gate.ok?'':`<div class="v2-notice n-amber" style="margin-top:10px">${gate.live?`النشر يفتح بعد ما ينتهي تطبيقك النشط «${clean(gate.live.name)}».`:`النشر يحتاج ${v2n(gate.need)} تقرير مقبول إضافي من اختبار تطبيقات غيرك. احفظه مسودة هسه.`}</div>`}
  <div class="v2-err" id="v2-err" role="alert"></div>
  <button type="button" class="v2-btn v2-btn-green v2-btn-block" style="margin-top:12px" data-v2="add-publish" ${s.confirmed&&testers.length&&gate.ok?'':'disabled'}>نشر التطبيق</button>
  <button type="button" class="v2-btn v2-btn-soft v2-btn-block" style="margin-top:8px" data-v2="add-draft">حفظ مسودة</button>`;
 }
 return `<div class="v2-row v2-between"><b>أضف تطبيقك</b><span class="v2-small v2-muted">${v2n(s.step)}/3</span></div>${v2Dots(s.step)}${body}<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" style="margin-top:8px" data-v2="${s.step>1?'add-back':'close'}">${s.step>1?'رجوع':'إلغاء'}</button>`;
}
function v2SheetFocus(){setTimeout(()=>document.querySelector('.v2-sheet input,.v2-sheet textarea,.v2-sheet button:not([disabled])')?.focus({preventScroll:true}),40)}
function v2Err(text){const e=document.getElementById('v2-err');if(e)e.textContent=text}
async function v2EnsureTesters(){
 if(dashboard.testersLoaded)return;
 const list=await api.loadTesters();dashboard={...dashboard,testers:list,testersLoaded:true};
}
// Re-rendering the open sheet must never wipe what is being typed in it.
function v2KeepTyped(){
 const s=V2.sheet;if(!s)return;
 const val=id=>document.getElementById(id)?.value;
 if(s.kind==='add'){if(val('v2-an')!=null)s.name=val('v2-an');if(val('v2-au')!=null)s.link=val('v2-au');if(val('v2-at')!=null)s.tasks=val('v2-at')}
 if(s.kind==='report'&&val('v2-note')!=null)s.notes=val('v2-note');
}

// ---------- Events. Returns true when the click was handled here. ----------
function v2Click(button){
 const k=button.dataset.v2;
 if(button.dataset.tab==='new'&&!k){V2.sheet={kind:'add',step:1};render();v2SheetFocus();pending(async()=>{await v2EnsureTesters();v2KeepTyped();render()});return true}
 if(!k)return false;
 if(k.startsWith('pack-'))return packClick(button);
 const s=V2.sheet;
 if(k==='close'){V2.sheet=null;render();return true}
 if(k==='filter'){V2.filter=button.dataset.k;render();return true}
 if(k==='gview'){V2.groupView=button.dataset.k;render();return true}
 if(k==='tview'){V2.testsView=button.dataset.k;render();return true}
 if(k==='go-testing'){V2.sheet=null;V2.testsView='testing';tab='tests';render();return true}
 if(k==='open-item'){
  const kind=button.dataset.kind,id=button.dataset.id;
  if(kind==='mine'){selectedProjectId=id;tab='details';render();return true}
  V2.sheet={kind,id};render();v2SheetFocus();return true;
 }
 if(k==='report-open'){V2.sheet={kind:'report',id:button.dataset.id,step:1,outcome:null,notes:null};render();v2SheetFocus();return true}
 if(k==='rep-tried'&&s){s.skipped=false;s.step=2;render();return true}
 if(k==='rep-cant'&&s){s.skipped=true;s.outcome='blocked';if(s.notes===s.auto)s.notes=null;s.step=3;render();v2SheetFocus();return true}
 if(k==='rep-res'&&s){if(s.notes===s.auto)s.notes=null;s.outcome=button.dataset.k;s.step=3;render();v2SheetFocus();return true}
 if(k==='rep-back'&&s){const typed=document.getElementById('v2-note');if(typed)s.notes=typed.value.trim()?typed.value:null;s.step=s.step===3&&s.skipped?1:s.step-1;render();return true}
 if(k==='rep-send'&&s){
  const notes=String(document.getElementById('v2-note')?.value||'').trim();s.notes=notes;
  if(notes.length<10){v2Err('اكتب جملة قصيرة عن تجربتك، 10 أحرف على الأقل');return true}
  const a=primaryAssignments().find(x=>x.id===s.id),retest=a&&typeof retestTarget==='function'?retestTarget(a):null;
  pending(async()=>{const result=await api.submitDailyReport(s.id,{outcome:s.outcome,notes,retestOf:retest?.id||''});V2.sheet=null;selectedAssignmentId=s.id;await refresh();toast(result?.alreadySaved?'تقرير اليوم محفوظ من قبل':'انرسل التقرير · ‎+10 XP بعد قبوله')});
  return true;
 }
 if(k==='add-open'){V2.sheet={kind:'add',step:1};render();v2SheetFocus();pending(async()=>{await v2EnsureTesters();v2KeepTyped();render()});return true}
 if(k==='add-back'&&s){if(s.step===2)s.tasks=document.getElementById('v2-at')?.value??s.tasks;s.step--;render();return true}
 if(k==='add-next'&&s){
  if(s.step===1){
   s.name=String(document.getElementById('v2-an')?.value||'').trim();s.link=String(document.getElementById('v2-au')?.value||'').trim();
   if(s.name.length<2){v2Err('اكتب اسم التطبيق');return true}
   let ok=false;try{const u=new URL(s.link);ok=u.protocol==='https:'&&u.hostname==='play.google.com'}catch{}
   if(!ok){v2Err('الرابط لازم يكون من play.google.com');return true}
  }else if(s.step===2){
   s.tasks=String(document.getElementById('v2-at')?.value||'');
   try{projectTasks(s.tasks)}catch(err){v2Err(err.message);return true}
  }
  s.step++;render();v2SheetFocus();return true;
 }
 if(k==='add-confirm'&&s){s.confirmed=!s.confirmed;render();return true}
 if(k==='add-copy-emails'){pending(async()=>{const list=prepareTesters();await copy(list.map(t=>t.email).join(', '))});return true}
 if(k==='add-publish'&&s){
  pending(async()=>{
   const testers=eligibleTesters();if(!testers.length)throw Error('لا يوجد مختبرون متاحون حالياً');
   if(!s.confirmed)throw Error('أكد إنك أضفت المجموعة أو الإيميلات بـ Play Console');
   const id=await api.createProject({name:s.name,link:s.link,tasks:s.tasks,group:OFFICIAL_GROUP.url},testers);
   V2.sheet=null;V2.testsView='mine';await refresh();tab='tests';render();toast('انتشر تطبيقك وانرسلت '+v2n(testers.length)+' دعوة');
   if(id)selectedProjectId=id;
  });
  return true;
 }
 if(k==='add-draft'&&s){pending(async()=>{const id=await api.saveProjectDraft({name:s.name,link:s.link,tasks:s.tasks,group:OFFICIAL_GROUP.url},null);V2.sheet=null;V2.testsView='mine';await refresh();tab='tests';render();toast('انحفظت المسودة');if(id)selectedProjectId=id});return true}
 if(k==='toggle-available'){pending(async()=>{try{await api.setAvailability(!user.available);user=await api.currentUser();toast(user.available?'صار إيميلك يظهر للمطورين':'انخفى إيميلك من القائمة')}finally{render()}});return true}
 return false;
}
// Search keeps the caret where it was while the list filters.
document.addEventListener('input',e=>{
 if(e.target?.id!=='v2-q')return;
 V2.q=e.target.value;const pos=e.target.selectionStart;render();
 const q=document.getElementById('v2-q');if(q){q.focus({preventScroll:true});try{q.setSelectionRange(pos,pos)}catch{}}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&V2.sheet){V2.sheet=null;render()}});
