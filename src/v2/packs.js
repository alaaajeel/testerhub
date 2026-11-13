// TesterHub V2 — exchange packs, the way Testers Community runs them: 16 members test each other's apps
// for 16 days. One pack is open at a time; the 16th member starts it and the next one opens.
// Each app is confirmed on its own, only after it was opened from here and the page was away 30 seconds.
// Warnings (under 70% of the day's apps → one warning, 3 → out) are written only by the daily job.
// Classic script: it only defines functions that run at render time, using the app's globals.
const PACK_SIZE=16,PACK_DAYS=16,PACK_PASS=0.7,PACK_AWAY_MS=30000,PACK_STRIKES=3;
const packDay=()=>new Date().toISOString().slice(0,10);
function packDayNumber(startDay){if(!startDay)return 0;const s=Date.parse(startDay+'T00:00:00Z'),t=Date.parse(packDay()+'T00:00:00Z');return Math.max(1,Math.min(PACK_DAYS,Math.floor((t-s)/86400000)+1))}
// The share of today's apps a member must confirm: 70% of the other active members, rounded up.
function packNeeded(others){return Math.ceil(others*PACK_PASS)}

// ---------- Opened from here and away 30 seconds (per device, per day) ----------
let packAway={day:'',opened:{},ok:{}},packHiddenAt=0;
function packAwayState(){
 if(packAway.day!==packDay()){packAway={day:packDay(),opened:{},ok:{}};try{const s=JSON.parse(localStorage.getItem('th-pack-away')||'null');if(s?.day===packAway.day)packAway=s}catch{}}
 return packAway;
}
function packSaveAway(){try{localStorage.setItem('th-pack-away',JSON.stringify(packAway))}catch{}}
document.addEventListener('visibilitychange',()=>{
 const st=packAwayState();
 if(document.hidden){packHiddenAt=Date.now();return}
 if(!packHiddenAt)return;
 const away=Date.now()-packHiddenAt;packHiddenAt=0;
 let changed=false;
 for(const [uid,at] of Object.entries(st.opened))if(!st.ok[uid]&&Date.now()-at>=PACK_AWAY_MS&&away>=PACK_AWAY_MS){st.ok[uid]=true;changed=true}
 if(changed){packSaveAway();if(typeof render==='function'&&tab==='groups')render()}
});
const packCanConfirm=uid=>!!packAwayState().ok[uid];

// ---------- Demo store (preview only, on this device) ----------
function packDemo(){
 const d=demoState();
 if(!d.packs){
  const names=['أحمد','رسل','كرار','هدى','ياسر','مريم','عمر','بنين','حسن','دعاء','مهدي','رنا','سجاد','آية','باقر','زينب','علي','نور','حيدر','سارة','مصطفى','فاطمة','يوسف','تبارك','محمد','ليث'];
  const apps=['بغداد تاكسي','حاسبة الزكاة','مكتبتي','متجر هدى','ألوان للأطفال','صيدليتي','دليل الموصل','ساعة الصلاة','نكت عراقية','خطاط','مواعيدي','كورة لايف','مترجم سريع','ريسيبي','ذكرني','قرآني','دفتر الديون','سوق الكمالية','ميزانيتي','تمارين البيت','كويز العراق','أذكاري','طقس العراق','حجوزات','خريطة النجف','باص'];
  const start=new Date(Date.now()-5*86400000).toISOString().slice(0,10);
  const mk=(pack,i,uid,extra={})=>({uid,name:names[i]||('عضو '+i),email:uid+'@example.com',appName:apps[i]||'تطبيق '+i,appLink:'https://play.google.com/apps/testing/com.example.p'+i,order:0,strikes:0,status:'active',consent:true,...extra});
  const p1=[mk('p1',0,'t1',{name:'مختبر 1',appName:'تطبيقي التجريبي'}),...Array.from({length:15},(_,i)=>mk('p1',i+1,'m'+(i+1)))].map((m,i)=>({...m,order:i+1}));
  p1[4].strikes=1;
  const p2=Array.from({length:11},(_,i)=>({...mk('p2',i+16-0,'n'+(i+1)),order:i+1}));
  const done=new Set(['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11']);
  d.packs={meta:{openPackId:'p2',number:2},
   list:{p1:{id:'p1',number:1,status:'running',size:16,days:16,memberCount:16,startDay:start},p2:{id:'p2',number:2,status:'open',size:16,days:16,memberCount:11}},
   members:{p1,p2},seats:{t1:'p1'},
   days:{p1:Object.fromEntries([...done].map(uid=>[uid+'_'+packDay(),{uid,date:packDay(),confirmed:['t1']}]))}};
  save(d);
 }
 return d;
}

// ---------- Data ----------
async function loadPacks(active){
 const empty={enabled:false,open:null,mine:null};
 if(!active)return empty;
 if(isDemo){
  const d=packDemo(),P=d.packs,open=P.list[P.meta.openPackId],seat=P.seats[active.uid]||'';
  const pack=seat?P.list[seat]:null,members=pack?P.members[seat]:[],days=pack?Object.values(P.days[seat]||{}).filter(x=>x.date===packDay()):[];
  return {enabled:true,open,mine:pack?packView(pack,members,days,active.uid):null};
 }
 if(!features.packs)return empty;
 const {doc,getDoc,getDocs,collection,query,where}=storeFns;
 try{
  const [meta,seat]=await Promise.all([getDoc(doc(db,'packMeta','current')),getDoc(doc(db,'packSeats',active.uid)).catch(()=>null)]);
  const openId=meta.exists()?meta.data().openPackId:'';
  const open=openId?await getDoc(doc(db,'packs',openId)).then(s=>s.exists()?{id:s.id,...s.data()}:null):null;
  const seatId=seat?.exists?.()?seat.data().packId:'';
  if(!seatId)return {enabled:true,open,mine:null};
  const pack=seatId===openId?open:await getDoc(doc(db,'packs',seatId)).then(s=>s.exists()?{id:s.id,...s.data()}:null);
  if(!pack)return {enabled:true,open,mine:null};
  const [m,dd]=await Promise.all([getDocs(collection(db,'packs',pack.id,'members')),pack.status==='running'?getDocs(query(collection(db,'packs',pack.id,'days'),where('date','==',packDay()))):Promise.resolve({docs:[]})]);
  return {enabled:true,open,mine:packView(pack,m.docs.map(x=>({uid:x.id,...x.data()})),dd.docs.map(x=>x.data()),active.uid)};
 }catch(err){console.warn('Packs:',err);return {enabled:true,open:null,mine:null,error:true}}
}
// What the account needs to see about its pack today.
function packView(pack,members,days,uid){
 const me=members.find(m=>m.uid===uid)||null;
 const others=members.filter(m=>m.uid!==uid&&m.status==='active').sort((a,b)=>(a.order||0)-(b.order||0));
 const mineToday=days.find(x=>x.uid===uid)?.confirmed||[];
 const confirmedMe=days.filter(x=>x.uid!==uid&&(x.confirmed||[]).includes(uid)).length;
 return {pack,me,members:members.slice().sort((a,b)=>(a.order||0)-(b.order||0)),others,confirmed:new Set(mineToday),confirmedMe,day:packDayNumber(pack.startDay)};
}
async function packJoin({appName,appLink}){
 appName=String(appName||'').trim();appLink=String(appLink||'').trim();
 if(appName.length<2||appName.length>70)throw Error('اكتب اسم التطبيق');
 let ok=false;try{const u=new URL(appLink);ok=u.protocol==='https:'&&u.hostname==='play.google.com'&&appLink.length<=300}catch{}
 if(!ok)throw Error('رابط الاختبار لازم يكون من play.google.com');
 const active=await currentUser();if(!active)throw Error('سجّل الدخول أولاً');
 if(isDemo){
  const d=packDemo(),P=d.packs,id=P.meta.openPackId,pack=P.list[id];
  if(P.seats[active.uid]&&P.list[P.seats[active.uid]]?.status!=='done')throw Error('انت عضو بمجموعة أصلاً');
  pack.memberCount++;P.members[id].push({uid:active.uid,name:active.name,email:active.email,appName,appLink,order:pack.memberCount,strikes:0,status:'active',consent:true});P.seats[active.uid]=id;
  if(pack.memberCount>=PACK_SIZE){pack.status='running';pack.startDay=packDay();const n=P.meta.number+1,nid='p'+n;P.list[nid]={id:nid,number:n,status:'open',size:16,days:16,memberCount:0};P.members[nid]=[];P.meta={openPackId:nid,number:n}}
  save(d);return pack.memberCount;
 }
 const {doc,getDoc,writeBatch,serverTimestamp}=storeFns;
 // Two people may take the same seat at once; the rules refuse the second, which then reads again once.
 for(let attempt=0;;attempt++){
  try{
   const meta=await getDoc(doc(db,'packMeta','current'));if(!meta.exists())throw Error('ماكو مجموعة مفتوحة هسه');
   const {openPackId:id,number}=meta.data(),snap=await getDoc(doc(db,'packs',id));
   if(!snap.exists()||snap.data().status!=='open')throw Error('المجموعة اكتملت، حدّث الصفحة');
   const n=(snap.data().memberCount||0)+1,b=writeBatch(db);
   b.update(doc(db,'packs',id),n<PACK_SIZE?{memberCount:n}:{memberCount:n,status:'running',startDay:packDay(),startedAt:serverTimestamp()});
   b.set(doc(db,'packs',id,'members',active.uid),{uid:active.uid,name:active.name,email:active.email,appName,appLink,order:n,strikes:0,status:'active',consent:true,joinedAt:serverTimestamp()});
   b.set(doc(db,'packSeats',active.uid),{packId:id,updatedAt:serverTimestamp()});
   if(n===PACK_SIZE){const next='p'+(number+1);b.update(doc(db,'packMeta','current'),{openPackId:next,number:number+1,updatedAt:serverTimestamp()});b.set(doc(db,'packs',next),{number:number+1,status:'open',size:PACK_SIZE,days:PACK_DAYS,memberCount:0,createdAt:serverTimestamp()})}
   await b.commit();return n;
  }catch(err){if(attempt>=1||err?.code!=='permission-denied')throw err}
 }
}
async function packLeave(){
 const active=await currentUser(),mine=dashboard.packs?.mine;
 if(!mine||mine.pack.status!=='open')throw Error('تگدر تطلع بس قبل ما تبدي المجموعة');
 if(isDemo){const d=packDemo(),P=d.packs,id=mine.pack.id;P.members[id]=P.members[id].filter(m=>m.uid!==active.uid);P.list[id].memberCount--;P.seats[active.uid]='';save(d);return}
 const {doc,getDoc,writeBatch,serverTimestamp}=storeFns,id=mine.pack.id,snap=await getDoc(doc(db,'packs',id)),b=writeBatch(db);
 b.update(doc(db,'packs',id),{memberCount:snap.data().memberCount-1});
 b.delete(doc(db,'packs',id,'members',active.uid));
 b.set(doc(db,'packSeats',active.uid),{packId:'',updatedAt:serverTimestamp()});
 await b.commit();
}
async function packConfirm(memberUid){
 const active=await currentUser(),mine=dashboard.packs?.mine;
 if(!mine||mine.pack.status!=='running')throw Error('المجموعة ما بدت بعد');
 if(!mine.others.some(m=>m.uid===memberUid))throw Error('هذا التطبيق مو بمجموعتك');
 if(!packCanConfirm(memberUid))throw Error('افتح التطبيق من زر «فتح» وجرّبه 30 ثانية على الأقل، بعدها أكّد');
 const date=packDay(),id=active.uid+'_'+date;
 if(isDemo){const d=packDemo(),P=d.packs,days=(P.days[mine.pack.id]??={}),rec=(days[id]??={uid:active.uid,date,confirmed:[]});if(!rec.confirmed.includes(memberUid))rec.confirmed.push(memberUid);save(d);return}
 const {doc,setDoc,arrayUnion,serverTimestamp}=storeFns;
 await setDoc(doc(db,'packs',mine.pack.id,'days',id),{uid:active.uid,date,confirmed:arrayUnion(memberUid),updatedAt:serverTimestamp()},{merge:true});
}
function packOpen(memberUid){
 const m=dashboard.packs?.mine?.others.find(x=>x.uid===memberUid);if(!m)return;
 const st=packAwayState();st.opened[memberUid]=Date.now();packSaveAway();
 try{window.open(m.appLink,'_blank','noopener,noreferrer')}catch{}
 toast('جرّب التطبيق 30 ثانية على الأقل، وارجع أكّد');
}

// ---------- Screens ----------
const packHow=()=>`<h2 class="v2-h2">شلون تشتغل المجموعة</h2><div class="v2-card">${[['16 عضو، 16 يوم','كل عضو يختبر تطبيقات الـ 15 الباقين يومياً، وهم يختبرون تطبيقه.'],['مجموعة وحدة مفتوحة بالوقت','لما تكتمل تبدي، وتنفتح الجاية. الأولوية لأول الداخلين.'],['إنذار تلقائي','إذا أكدت أقل من 70% من تطبيقات اليوم ينحسب إنذار. 3 إنذارات = تطلع.'],['إيميلك للأعضاء بس','وبموافقتك، حتى يضيفوك للاختبار المغلق.']].map(([t,d],i)=>`<div class="v2-check-item"><span class="v2-num">${v2n(i+1)}</span><div><b>${t}</b><p class="v2-small v2-muted" style="margin:2px 0 0">${d}</p></div></div>`).join('')}</div>`;
const packSeats=(filled,size=PACK_SIZE)=>`<div class="v2-seats" aria-hidden="true">${Array.from({length:size},(_,i)=>`<i class="${i<filled?'f':''}"></i>`).join('')}</div>`;
function packOff(){return `<section class="v2-card v2-hero"><span class="v2-tag v2-tag-glass">مجموعات التبادل</span><h3 style="margin:12px 0 4px">تنتظر التفعيل</h3><p class="v2-muted v2-small" style="margin:0">تنفتح أول ما تتفعّل من لوحة الإدارة.</p></section>${packHow()}`}
function v2MyGroup(){
 const P=dashboard.packs;
 if(!P?.enabled)return packOff();
 const mine=P.mine;
 if(!mine)return `<div class="v2-card v2-empty-card"><b>ما عندك مجموعة بعد</b><p class="v2-small v2-muted">${P.open?`المجموعة #${v2n(P.open.number)} مفتوحة هسه: ${v2n(P.open.memberCount)} من ${v2n(PACK_SIZE)} مقعد.`:'ماكو مجموعة مفتوحة هسه.'}</p><button type="button" class="v2-btn v2-btn-primary" data-v2="gview" data-k="open">شوف المجموعة المفتوحة</button></div>${packHow()}`;
 const {pack,me,others}=mine;
 if(me?.status==='out')return `<div class="v2-notice n-amber">طلعت من المجموعة #${v2n(pack.number)} بعد ${v2n(PACK_STRIKES)} إنذارات. تگدر تدخل المجموعة المفتوحة الجاية.</div><button type="button" class="v2-btn v2-btn-primary v2-btn-block" style="margin-top:12px" data-v2="gview" data-k="open">المجموعة المفتوحة</button>`;
 if(pack.status==='done')return `<div class="v2-card v2-empty-card"><b>خلصت المجموعة #${v2n(pack.number)} ✓</b><p class="v2-small v2-muted">16 يوم كاملة. تگدر تدخل مجموعة جديدة بتطبيق ثاني.</p><button type="button" class="v2-btn v2-btn-primary" data-v2="gview" data-k="open">المجموعة المفتوحة</button></div>`;
 if(pack.status==='open')return `<section class="v2-card v2-hero"><div class="v2-row v2-between"><span class="v2-tag v2-tag-glass">مجموعة #${v2n(pack.number)}</span><span class="v2-small v2-muted">بانتظار الاكتمال</span></div><h3 style="margin:12px 0 2px">${v2n(pack.memberCount)} من ${v2n(PACK_SIZE)} مقعد</h3><p class="v2-muted v2-small" style="margin:0">ترتيبك ${v2n(me?.order||0)}. تبدي أول ما تكتمل، ونبلغك.</p>${packSeats(pack.memberCount)}</section>
  <h2 class="v2-h2">تطبيقات المجموعة</h2><div class="v2-card">${mine.members.map(m=>`<div class="v2-check-item">${v2Icon(m.appName,m.uid,40)}<div class="v2-grow"><b>${clean(m.appName)}</b><div class="v2-small v2-muted">${clean(m.uid===user.uid?'تطبيقك':m.name)}</div></div></div>`).join('')}</div>
  <button type="button" class="v2-btn v2-btn-ghost v2-btn-block v2-danger" style="margin-top:12px" data-v2="pack-leave">أطلع من المجموعة</button>`;
 const total=others.length,done=others.filter(m=>mine.confirmed.has(m.uid)).length,need=packNeeded(total),strikes=me?.strikes||0;
 return `<section class="v2-card v2-hero"><div class="v2-row v2-between"><span class="v2-tag v2-tag-glass">مجموعة #${v2n(pack.number)} · ${v2n(mine.members.length)} عضو</span><span class="v2-small v2-muted">اليوم ${v2n(mine.day)} من ${v2n(PACK_DAYS)}</span></div>
  <h3 style="margin:12px 0 4px">اختبرت ${v2n(done)} من ${v2n(total)} تطبيق اليوم</h3>
  <p class="v2-muted v2-small" style="margin:0 0 12px">وأكد ${v2n(mine.confirmedMe)} من ${v2n(total)} أعضاء اختبار تطبيقك اليوم</p>
  <div class="v2-bar" style="background:rgba(255,255,255,.2)"><span style="width:${total?done/total*100:0}%;background:#fff"></span></div></section>
 <div class="v2-card" style="margin-top:12px"><div class="v2-row v2-between"><div><b class="v2-h3">الإنذارات</b><p class="v2-small v2-muted" style="margin:4px 0 0">النظام يحسبها تلقائياً كل يوم: أقل من ${v2n(need)} تأكيد (70%) = إنذار</p></div><div class="v2-strikes" aria-label="${v2n(strikes)} من ${v2n(PACK_STRIKES)} إنذارات">${[0,1,2].map(i=>`<span class="${i<strikes?'on':''}"></span>`).join('')}</div></div></div>
 <div class="v2-row v2-between" style="margin:18px 2px 8px"><h2 class="v2-h2" style="margin:0">تطبيقات اليوم</h2><button type="button" class="v2-btn v2-btn-soft v2-btn-sm" data-v2="pack-emails">نسخ الإيميلات</button></div>
 <div class="v2-card">${others.map(m=>{const ok=mine.confirmed.has(m.uid),can=packCanConfirm(m.uid);
  return `<div class="v2-check-item v2-pack-app" data-uid="${clean(m.uid)}"><button type="button" class="v2-cbox ${ok?'on':''}" data-v2="pack-confirm" data-uid="${clean(m.uid)}" aria-pressed="${ok}" ${ok||!can?'disabled':''} aria-label="أكدت اختبار ${clean(m.appName)} اليوم">${ok?'✓':''}</button>${v2Icon(m.appName,m.uid,40)}<div class="v2-grow"><b>${clean(m.appName)}</b><div class="v2-small v2-muted">${clean(m.name)}${ok?' · تم اليوم':can?' · جاهز للتأكيد':''}</div></div><button type="button" class="v2-btn v2-btn-ghost v2-btn-sm" data-v2="pack-open" data-uid="${clean(m.uid)}">فتح</button></div>`}).join('')}</div>
 <p class="v2-small v2-muted" style="text-align:center;margin:10px 0 0">افتح كل تطبيق من زر «فتح» وجرّبه 30 ثانية، بعدها يتفعّل التأكيد. ماكو زر «أكدت الكل».</p>`;
}
function v2OpenGroup(){
 const P=dashboard.packs;
 if(!P?.enabled)return packOff();
 const o=P.open;
 if(!o)return `<div class="v2-empty">ماكو مجموعة مفتوحة هسه.</div>${packHow()}`;
 const mine=P.mine,inThis=mine&&mine.pack.id===o.id,busy=mine&&!inThis&&mine.pack.status==='running'&&mine.me?.status==='active';
 const free=PACK_SIZE-o.memberCount;
 return `<section class="v2-card v2-hero"><div class="v2-row v2-between"><span class="v2-tag v2-tag-glass">مجموعة #${v2n(o.number)}</span><span class="v2-small v2-muted">مفتوحة هسه</span></div>
  <h3 style="margin:12px 0 2px">${v2n(o.memberCount)} من ${v2n(PACK_SIZE)} مقعد</h3>
  <p class="v2-muted v2-small" style="margin:0">${free?`باقي ${v2n(free)} ${free===1?'مقعد':'مقاعد'}. تبدي أول ما تكتمل.`:'اكتملت. تنفتح الجاية تلقائياً.'}</p>
  ${packSeats(o.memberCount)}
  ${inThis?`<span class="v2-tag" style="background:#fff;color:var(--green)">انضميت — ترتيبك ${v2n(mine.me?.order||0)}</span>`:busy?`<button type="button" class="v2-btn v2-btn-white v2-btn-block" disabled>انت بمجموعة شغالة</button>`:`<button type="button" class="v2-btn v2-btn-white v2-btn-block" data-v2="pack-join-open">انضم بـ 3 خطوات</button>`}</section>
 ${packHow()}`;
}
function packSheet(s){
 const o=dashboard.packs?.open;if(!o)return '';
 s.title='الانضمام لمجموعة #'+o.number;
 const apps=mineProjects().filter(p=>p.link&&(p.status||'recruiting')==='recruiting');
 let body='';
 if(s.step===1)body=`<b class="v2-h3" style="font-size:19px">أي تطبيق تدخل بيه؟</b>${apps.map(p=>`<button type="button" class="v2-opt ${s.pick===p.id?'on':''}" data-v2="pack-pick" data-id="${clean(p.id)}">${v2Icon(p.name,p.id,40)}${clean(p.name)}</button>`).join('')}<button type="button" class="v2-opt ${s.pick==='other'?'on':''}" data-v2="pack-pick" data-id="other">تطبيق ثاني</button>${s.pick==='other'?`<label class="v2-label" for="pk-name">اسم التطبيق</label><input id="pk-name" class="v2-input" maxlength="70" value="${clean(s.appName||'')}"><label class="v2-label" for="pk-link">رابط الاختبار المغلق</label><input id="pk-link" class="v2-input email-ltr" inputmode="url" placeholder="https://play.google.com/apps/testing/..." value="${clean(s.appLink||'')}">`:''}<div class="v2-err" id="v2-err" role="alert"></div><button type="button" class="v2-btn v2-btn-primary v2-btn-block" style="margin-top:12px" data-v2="pack-next" ${s.pick?'':'disabled'}>التالي</button>`;
 if(s.step===2)body=`<b class="v2-h3" style="font-size:19px">الالتزام</b><div class="v2-notice n-blue" style="margin-top:10px">16 يوم، كل يوم تفتح تطبيقات الـ 15 الباقين وتأكد كل واحد. إذا أكدت أقل من 70% باليوم ينحسب إنذار تلقائي، و3 إنذارات = تطلع من المجموعة.</div><button type="button" class="v2-opt ${s.consent?'on':''}" data-v2="pack-consent" aria-pressed="${!!s.consent}"><span class="v2-cbox ${s.consent?'on':''}">${s.consent?'✓':''}</span>أوافق، وأوافق على مشاركة إيميلي مع أعضاء مجموعتي بس</button><button type="button" class="v2-btn v2-btn-primary v2-btn-block" style="margin-top:12px" data-v2="pack-next" ${s.consent?'':'disabled'}>التالي</button>`;
 if(s.step===3)body=`<b class="v2-h3" style="font-size:19px">تأكيد</b><div class="v2-steps">${v2StepRow(1,'التطبيق',clean(s.appName),'done')}${v2StepRow(2,'الالتزام والموافقة','16 يوم · إنذار تلقائي','done')}${v2StepRow(3,'مقعدك',`رقم ${v2n(o.memberCount+1)} من ${v2n(PACK_SIZE)}`,'cur')}</div><div class="v2-notice n-amber">بعد ما تبدي المجموعة: ضيف إيميلات الأعضاء بقائمة مختبري تطبيقك بـ Play Console (زر «نسخ الإيميلات» بمجموعتي).</div><button type="button" class="v2-btn v2-btn-green v2-btn-block" style="margin-top:12px" data-v2="pack-join">انضم للمجموعة</button>`;
 return `<div class="v2-row v2-between"><b>الانضمام لمجموعة #${v2n(o.number)}</b><span class="v2-small v2-muted">${v2n(s.step)}/3</span></div>${v2Dots(s.step)}${body}<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" style="margin-top:8px" data-v2="${s.step>1?'pack-back':'close'}">${s.step>1?'رجوع':'إلغاء'}</button>`;
}
async function packRefresh(){dashboard={...dashboard,packs:await loadPacks(user)};render()}
function packClick(button){
 const k=button.dataset.v2,s=V2.sheet;
 if(k==='pack-join-open'){V2.sheet={kind:'pack',step:1,pick:null,consent:false};render();v2SheetFocus();return true}
 if(k==='pack-pick'&&s){s.pick=button.dataset.id;if(s.pick!=='other'){const p=mineProjects().find(x=>x.id===s.pick);s.appName=p?.name;s.appLink=p?.link}else{s.appName='';s.appLink=''}render();return true}
 if(k==='pack-consent'&&s){s.consent=!s.consent;render();return true}
 if(k==='pack-back'&&s){s.step--;render();return true}
 if(k==='pack-next'&&s){
  if(s.step===1&&s.pick==='other'){s.appName=String(document.getElementById('pk-name')?.value||'').trim();s.appLink=String(document.getElementById('pk-link')?.value||'').trim();
   if(s.appName.length<2){v2Err('اكتب اسم التطبيق');return true}
   let ok=false;try{const u=new URL(s.appLink);ok=u.protocol==='https:'&&u.hostname==='play.google.com'}catch{}
   if(!ok){v2Err('الرابط لازم يكون من play.google.com');return true}}
  s.step++;render();return true;
 }
 if(k==='pack-join'&&s){pending(async()=>{const n=await packJoin({appName:s.appName,appLink:s.appLink});V2.sheet=null;V2.groupView='mine';await packRefresh();toast(n>=PACK_SIZE?'اكتملت المجموعة وبدت! ابدي اختبار تطبيقات اليوم':'انضميت. نبلغك أول ما تكتمل المجموعة')});return true}
 if(k==='pack-leave'){pending(async()=>{await packLeave();await packRefresh();toast('طلعت من المجموعة ومقعدك انفتح')});return true}
 if(k==='pack-open'){packOpen(button.dataset.uid);render();return true}
 if(k==='pack-confirm'){const uid=button.dataset.uid;pending(async()=>{await packConfirm(uid);await packRefresh();toast('انحفظ تأكيد اليوم')});return true}
 if(k==='pack-emails'){const list=(dashboard.packs?.mine?.others||[]).map(m=>m.email).filter(Boolean);pending(async()=>{await copy(list.join(', '));toast('انسخت '+v2n(list.length)+' إيميل. الصقها بقائمة مختبري تطبيقك بـ Play Console')});return true}
 return false;
}
