// TesterHub V2 — exchange packs, the way Testers Community runs them, built on the TesterHub Google Group:
// every member joins testerhubiq@googlegroups.com once, and adds that one address to their app's closed test.
// 16 members test each other's apps for 16 days. One pack is open at a time; the 16th member starts it and the
// next one opens. Each app is confirmed on its own, only after it was opened from here and the page was away
// 30 seconds. Warnings (under 70% → one, 3 → out) and earned coins (1 per confirmed app) come only from the daily job.
// Coins: the first entry is free once; another entry costs 150; 30 shows your app at the top of «التطبيقات» for 3 days.
// Classic script: it only defines functions that run at render time, using the app's globals.
const PACK_SIZE=16,PACK_DAYS=16,PACK_PASS=0.7,PACK_AWAY_MS=30000,PACK_STRIKES=3;
const PACK_COST=150,BOOST_COST=30,BOOST_DAYS=3;
const packDay=()=>new Date().toISOString().slice(0,10);
function packDayNumber(startDay){if(!startDay)return 0;const s=Date.parse(startDay+'T00:00:00Z'),t=Date.parse(packDay()+'T00:00:00Z');return Math.max(1,Math.min(PACK_DAYS,Math.floor((t-s)/86400000)+1))}
function packNeeded(others){return Math.ceil(others*PACK_PASS)}
const packMs=x=>x?.toMillis?.()??(typeof x?.seconds==='number'?x.seconds*1000:Date.parse(x||''));
const packBoosted=c=>!!c?.boosted&&Date.now()-packMs(c.boostedAt)<BOOST_DAYS*86400000;
const packIconOk=s=>typeof s==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
// An app icon: the uploaded image when there is one, otherwise the coloured letter.
function packIcon(app,key,size=56){
 if(packIconOk(app?.icon))return `<img class="v2-appicon" src="${clean(app.icon)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px;flex-basis:${size}px;border-radius:${Math.round(size*.29)}px;object-fit:cover">`;
 return v2Icon(app?.appName,key,size);
}

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
  const names=['أحمد','رسل','كرار','هدى','ياسر','مريم','عمر','بنين','حسن','دعاء','مهدي','رنا','سجاد','آية','باقر','زينب','علي','نور','حيدر','سارة','مصطفى','فاطمة','يوسف','تبارك','محمد','ليث','زهراء'];
  const apps=['بغداد تاكسي','حاسبة الزكاة','مكتبتي','متجر هدى','ألوان للأطفال','صيدليتي','دليل الموصل','ساعة الصلاة','نكت عراقية','خطاط','مواعيدي','كورة لايف','مترجم سريع','ريسيبي','ذكرني','قرآني','دفتر الديون','سوق الكمالية','ميزانيتي','تمارين البيت','كويز العراق','أذكاري','طقس العراق','حجوزات','خريطة النجف','باص','حاسبتي'];
  const descs=['حجز تكسي داخل بغداد بسعر ثابت','احسب زكاتك بخطوة وحدة','كتب PDF عربية بدون إنترنت','متجر ملابس بالتوصيل','تلوين للأطفال بدون إعلانات'];
  const start=new Date(Date.now()-5*86400000).toISOString().slice(0,10);
  const mk=(i,uid,extra={})=>({uid,name:names[i]||('عضو '+i),email:uid+'@example.com',appName:apps[i]||'تطبيق '+i,devName:names[i]||'مطور',description:descs[i%descs.length],appLink:'https://play.google.com/apps/testing/com.example.p'+i,groupAdded:true,order:0,strikes:0,status:'active',consent:true,paid:0,...extra});
  const p1=[mk(0,'t1',{name:'مختبر 1',devName:'مختبر 1',appName:'تطبيقي التجريبي'}),...Array.from({length:15},(_,i)=>mk(i+1,'m'+(i+1)))].map((m,i)=>({...m,order:i+1}));
  p1[4].strikes=1;
  const p2=Array.from({length:11},(_,i)=>({...mk(i+16,'n'+(i+1)),order:i+1}));
  const done=['m1','m2','m3','m4','m5','m6','m7','m8','m9','m10','m11'];
  const now=Date.now(),card=(pack,m,boost=false)=>({id:pack+'_'+m.uid,packId:pack,ownerUid:m.uid,appName:m.appName,devName:m.devName,description:m.description,appLink:m.appLink,active:true,boosted:boost,boostedAt:new Date(now-(boost?3600000:86400000*(1+m.order/10))).toISOString()});
  d.packs={meta:{openPackId:'p2',number:2},
   list:{p1:{id:'p1',number:1,status:'running',size:16,days:16,memberCount:16,startDay:start},p2:{id:'p2',number:2,status:'open',size:16,days:16,memberCount:11}},
   members:{p1,p2},seats:{t1:'p1'},
   coins:{t1:{earned:64,spent:0,freeUsed:true},d1:{earned:0,spent:0,freeUsed:false}},
   apps:[...p1.map((m,i)=>card('p1',m,i===3)),...p2.map(m=>card('p2',m))],
   days:{p1:Object.fromEntries(done.map(uid=>[uid+'_'+packDay(),{uid,date:packDay(),confirmed:['t1']}]))}};
  save(d);
 }
 return d;
}
const packCoins=c=>{const earned=Number(c?.earned)||0,spent=Number(c?.spent)||0;return {earned,spent,balance:Math.max(0,earned-spent),freeUsed:c?.freeUsed===true}};
function packSortApps(list){return list.filter(c=>c.active!==false).sort((a,b)=>Number(packBoosted(b))-Number(packBoosted(a))||packMs(b.boostedAt)-packMs(a.boostedAt))}

// ---------- Data ----------
async function loadPacks(active){
 const empty={enabled:false,open:null,mine:null,coins:packCoins(null),apps:[]};
 if(!active)return empty;
 if(isDemo){
  const d=packDemo(),P=d.packs,open=P.list[P.meta.openPackId],seat=P.seats[active.uid]||'';
  const pack=seat?P.list[seat]:null,members=pack?P.members[seat]:[],days=pack?Object.values(P.days[seat]||{}).filter(x=>x.date===packDay()):[];
  return {enabled:true,open,mine:pack?packView(pack,members,days,active.uid):null,coins:packCoins(P.coins[active.uid]),apps:packSortApps(P.apps),left:P.left?.[active.uid]||[]};
 }
 if(!features.packs)return empty;
 const {doc,getDoc,getDocs,collection,query,where,orderBy,limit}=storeFns;
 try{
  const [meta,seat,coins,cards]=await Promise.all([
   getDoc(doc(db,'packMeta','current')),
   getDoc(doc(db,'packSeats',active.uid)).catch(()=>null),
   getDoc(doc(db,'coins',active.uid)).catch(()=>null),
   getDocs(query(collection(db,'packApps'),where('active','==',true),orderBy('boostedAt','desc'),limit(60))).catch(err=>{console.warn('Pack apps:',err);return {docs:[]}})
  ]);
  const base={enabled:true,coins:packCoins(coins?.exists?.()?coins.data():null),apps:packSortApps(cards.docs.map(x=>({id:x.id,...x.data()})))};
  const openId=meta.exists()?meta.data().openPackId:'';
  const open=openId?await getDoc(doc(db,'packs',openId)).then(s=>s.exists()?{id:s.id,...s.data()}:null):null;
  const seatId=seat?.exists?.()?seat.data().packId:'';base.left=seat?.exists?.()?seat.data().left||[]:[];
  if(!seatId)return {...base,open,mine:null};
  const pack=seatId===openId?open:await getDoc(doc(db,'packs',seatId)).then(s=>s.exists()?{id:s.id,...s.data()}:null);
  if(!pack)return {...base,open,mine:null};
  const [m,dd]=await Promise.all([getDocs(collection(db,'packs',pack.id,'members')),pack.status==='running'?getDocs(query(collection(db,'packs',pack.id,'days'),where('date','==',packDay()))):Promise.resolve({docs:[]})]);
  return {...base,open,mine:packView(pack,m.docs.map(x=>({uid:x.id,...x.data()})),dd.docs.map(x=>x.data()),active.uid)};
 }catch(err){console.warn('Packs:',err);return {...empty,enabled:true,error:true}}
}
function packView(pack,members,days,uid){
 const me=members.find(m=>m.uid===uid)||null;
 const others=members.filter(m=>m.uid!==uid&&m.status==='active').sort((a,b)=>(a.order||0)-(b.order||0));
 const mineToday=days.find(x=>x.uid===uid)?.confirmed||[];
 const confirmedMe=days.filter(x=>x.uid!==uid&&(x.confirmed||[]).includes(uid)).length;
 return {pack,me,members:members.slice().sort((a,b)=>(a.order||0)-(b.order||0)),others,confirmed:new Set(mineToday),confirmedMe,day:packDayNumber(pack.startDay)};
}
// The new app as typed in the join sheet, checked the same way the rules check it.
function packAppInput(a){
 const app={appName:String(a.appName||'').trim(),devName:String(a.devName||'').trim(),appLink:String(a.appLink||'').trim(),description:String(a.description||'').trim(),icon:a.icon||''};
 if(app.appName.length<2||app.appName.length>70)throw Error('اكتب اسم التطبيق');
 if(app.devName.length<2||app.devName.length>60)throw Error('اكتب اسم المطور');
 let ok=false;try{const u=new URL(app.appLink);ok=u.protocol==='https:'&&u.hostname==='play.google.com'&&app.appLink.length<=300}catch{}
 if(!ok)throw Error('رابط الاختبار لازم يكون من play.google.com');
 if(app.description.length>300)throw Error('الوصف طويل، اختصره إلى 300 حرف');
 if(app.icon&&!packIconOk(app.icon))throw Error('الأيقونة لازم تكون صورة');
 return app;
}
const packEntryCost=c=>c.freeUsed?PACK_COST:0;
async function packJoin(input){
 const app=packAppInput(input);
 if(!input.groupAdded)throw Error('أضف مجموعة TesterHub لتطبيقك بـ Play Console أولاً');
 const active=await currentUser();if(!active)throw Error('سجّل الدخول أولاً');
 if(isDemo){
  const d=packDemo(),P=d.packs,id=P.meta.openPackId,pack=P.list[id],c=(P.coins[active.uid]??={earned:0,spent:0,freeUsed:false}),cost=c.freeUsed?PACK_COST:0;
  if(P.seats[active.uid]&&P.list[P.seats[active.uid]]?.status!=='done')throw Error('انت عضو بمجموعة أصلاً');
  if((P.left?.[active.uid]||[]).includes(id))throw Error('طلعت من هاي المجموعة، فما تگدر ترجعلها. انتظر المجموعة الجاية');
  if((c.earned||0)-(c.spent||0)<cost)throw Error('رصيدك ما يكفي: الدخول يكلف '+PACK_COST+' عملة');
  c.spent=(c.spent||0)+cost;c.freeUsed=true;
  pack.memberCount++;const m={uid:active.uid,name:active.name,email:active.email,...app,groupAdded:true,order:pack.memberCount,strikes:0,status:'active',consent:true,paid:cost};
  P.members[id].push(m);P.seats[active.uid]=id;
  P.apps.push({id:id+'_'+active.uid,packId:id,ownerUid:active.uid,appName:app.appName,devName:app.devName,description:app.description,icon:app.icon,appLink:app.appLink,active:true,boosted:false,boostedAt:new Date().toISOString()});
  if(pack.memberCount>=PACK_SIZE){pack.status='running';pack.startDay=packDay();const n=P.meta.number+1,nid='p'+n;P.list[nid]={id:nid,number:n,status:'open',size:16,days:16,memberCount:0};P.members[nid]=[];P.meta={openPackId:nid,number:n}}
  save(d);return pack.memberCount;
 }
 const {doc,getDoc,writeBatch,serverTimestamp}=storeFns;
 // Two people may take the same seat at once; the rules refuse the second, which then reads again once.
 for(let attempt=0;;attempt++){
  try{
   const [meta,coinSnap]=await Promise.all([getDoc(doc(db,'packMeta','current')),getDoc(doc(db,'coins',active.uid))]);
   if(!meta.exists())throw Error('ماكو مجموعة مفتوحة هسه');
   const c=coinSnap.exists()?coinSnap.data():null,cost=c?.freeUsed===true?PACK_COST:0;
   if((Number(c?.earned)||0)-(Number(c?.spent)||0)<cost)throw Error('رصيدك ما يكفي: الدخول يكلف '+PACK_COST+' عملة');
   const {openPackId:id,number}=meta.data(),snap=await getDoc(doc(db,'packs',id));
   if(!snap.exists()||snap.data().status!=='open')throw Error('المجموعة اكتملت، حدّث الصفحة');
   if((dashboard.packs?.left||[]).includes(id))throw Error('طلعت من هاي المجموعة، فما تگدر ترجعلها. انتظر المجموعة الجاية');
   const n=(snap.data().memberCount||0)+1,b=writeBatch(db),extra={...(app.icon?{icon:app.icon}:{}),...(app.description?{description:app.description}:{})};
   b.update(doc(db,'packs',id),n<PACK_SIZE?{memberCount:n}:{memberCount:n,status:'running',startDay:packDay(),startedAt:serverTimestamp()});
   b.set(doc(db,'packs',id,'members',active.uid),{uid:active.uid,name:active.name,email:active.email,appName:app.appName,devName:app.devName,appLink:app.appLink,...extra,groupAdded:true,order:n,strikes:0,status:'active',consent:true,paid:cost,joinedAt:serverTimestamp()});
   b.set(doc(db,'packSeats',active.uid),{packId:id,updatedAt:serverTimestamp()},{merge:true});
   if(!c)b.set(doc(db,'coins',active.uid),{earned:0,spent:0,freeUsed:true,updatedAt:serverTimestamp()});
   else b.update(doc(db,'coins',active.uid),{spent:(Number(c.spent)||0)+cost,freeUsed:true,updatedAt:serverTimestamp()});
   b.set(doc(db,'packApps',id+'_'+active.uid),{packId:id,ownerUid:active.uid,appName:app.appName,devName:app.devName,appLink:app.appLink,...extra,active:true,boosted:false,boostedAt:serverTimestamp(),createdAt:serverTimestamp()});
   if(n===PACK_SIZE){const next='p'+(number+1);b.update(doc(db,'packMeta','current'),{openPackId:next,number:number+1,updatedAt:serverTimestamp()});b.set(doc(db,'packs',next),{number:number+1,status:'open',size:PACK_SIZE,days:PACK_DAYS,memberCount:0,createdAt:serverTimestamp()})}
   await b.commit();return n;
  }catch(err){if(attempt>=1||err?.code!=='permission-denied')throw err}
 }
}
// Leaving before the start gives back the seat and exactly what the entry cost.
async function packLeave(){
 const active=await currentUser(),mine=dashboard.packs?.mine;
 if(!mine||mine.pack.status!=='open')throw Error('تگدر تطلع بس قبل ما تبدي المجموعة');
 const paid=Number(mine.me?.paid)||0;
 if(isDemo){const d=packDemo(),P=d.packs,id=mine.pack.id,c=P.coins[active.uid];P.members[id]=P.members[id].filter(m=>m.uid!==active.uid);P.list[id].memberCount--;P.seats[active.uid]='';((P.left??={})[active.uid]??=[]).push(id);if(c){c.spent-=paid;if(!paid)c.freeUsed=false}P.apps=P.apps.filter(x=>x.id!==id+'_'+active.uid);save(d);return}
 const {doc,getDoc,writeBatch,serverTimestamp}=storeFns,id=mine.pack.id;
 const [snap,coinSnap]=await Promise.all([getDoc(doc(db,'packs',id)),getDoc(doc(db,'coins',active.uid))]),c=coinSnap.data()||{},b=writeBatch(db);
 b.update(doc(db,'packs',id),{memberCount:snap.data().memberCount-1});
 b.delete(doc(db,'packs',id,'members',active.uid));
 b.set(doc(db,'packSeats',active.uid),{packId:'',left:storeFns.arrayUnion(id),updatedAt:serverTimestamp()},{merge:true});
 b.update(doc(db,'coins',active.uid),{spent:(Number(c.spent)||0)-paid,freeUsed:paid?c.freeUsed===true:false,updatedAt:serverTimestamp()});
 b.delete(doc(db,'packApps',id+'_'+active.uid));
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
// 30 coins: the app's card shows first on «التطبيقات» for 3 days.
async function packBoost(){
 const active=await currentUser(),P=dashboard.packs,card=P?.apps.find(c=>c.ownerUid===active?.uid&&c.active!==false);
 if(!card)throw Error('ماكو تطبيق إلك بالمجموعات');
 if(packBoosted(card))throw Error('تطبيقك مميّز هسه');
 if(P.coins.balance<BOOST_COST)throw Error('التمييز يحتاج '+BOOST_COST+' عملة');
 if(isDemo){const d=packDemo(),c=d.packs.coins[active.uid],x=d.packs.apps.find(a=>a.id===card.id);c.spent=(c.spent||0)+BOOST_COST;x.boosted=true;x.boostedAt=new Date().toISOString();save(d);return}
 const {doc,getDoc,writeBatch,serverTimestamp}=storeFns,coinSnap=await getDoc(doc(db,'coins',active.uid)),b=writeBatch(db);
 b.update(doc(db,'packApps',card.id),{boosted:true,boostedAt:serverTimestamp()});
 b.update(doc(db,'coins',active.uid),{spent:(Number(coinSnap.data()?.spent)||0)+BOOST_COST,updatedAt:serverTimestamp()});
 await b.commit();
}
function packOpen(memberUid){
 const m=dashboard.packs?.mine?.others.find(x=>x.uid===memberUid);if(!m)return;
 const st=packAwayState();st.opened[memberUid]=Date.now();packSaveAway();
 try{window.open(m.appLink,'_blank','noopener,noreferrer')}catch{}
 toast('جرّب التطبيق 30 ثانية على الأقل، وارجع أكّد');
}

// ---------- Screens ----------
const packCoinChip=()=>{const c=dashboard.packs?.coins;return c?`<span class="v2-tag t-amber v2-coins" title="عملات المجموعات">🪙 ${v2n(c.balance)} عملة</span>`:''};
const packHow=()=>`<h2 class="v2-h2">شلون تشتغل المجموعة</h2><div class="v2-card">${[['انضم لمجموعة Google مرة وحدة','testerhubiq — بنفس حساب Google Play اللي تختبر بيه. هي اللي توصلك لكل التطبيقات.'],['ضيف المجموعة لتطبيقك','بـ Play Console تضيف بريد المجموعة مرة وحدة، بدل ما تنسخ إيميلات.'],['16 عضو، 16 يوم','كل عضو يختبر تطبيقات الـ 15 الباقين يومياً، وهم يختبرون تطبيقه.'],['عملات وإنذارات تلقائية','كل تطبيق تأكده = عملة. أقل من 70% باليوم = إنذار، و3 إنذارات = تطلع.'],['أول دخول مجاني','بعدها كل دخول بـ '+PACK_COST+' عملة، وتمييز تطبيقك بأعلى «التطبيقات» بـ '+BOOST_COST+' عملة لـ '+BOOST_DAYS+' أيام.']].map(([t,d],i)=>`<div class="v2-check-item"><span class="v2-num">${v2n(i+1)}</span><div><b>${t}</b><p class="v2-small v2-muted" style="margin:2px 0 0">${d}</p></div></div>`).join('')}</div>`;
// Seats: each taken seat shows that member's app icon (from the public cards), the rest stay empty.
function packSeats(filled,packId,size=PACK_SIZE){
 const cards=(dashboard.packs?.apps||[]).filter(c=>c.packId===packId).sort((a,b)=>packMs(a.createdAt||a.boostedAt)-packMs(b.createdAt||b.boostedAt));
 return `<div class="v2-seats" aria-hidden="true">${Array.from({length:size},(_,i)=>{const c=cards[i];
  if(i>=filled)return '<i></i>';
  if(c&&packIconOk(c.icon))return `<i class="f v2-seat-icon"><img src="${clean(c.icon)}" alt=""></i>`;
  if(c)return `<i class="f v2-seat-letter" style="background:${v2Color(c.ownerUid)}">${clean(String(c.appName||'؟').trim().charAt(0))}</i>`;
  return '<i class="f"></i>'}).join('')}</div>`;
}
function packOff(){return `<section class="v2-card v2-hero"><span class="v2-tag v2-tag-glass">مجموعات التبادل</span><h3 style="margin:12px 0 4px">تنتظر التفعيل</h3><p class="v2-muted v2-small" style="margin:0">تنفتح أول ما تتفعّل من لوحة الإدارة. تگدر هسه تنضم لمجموعة Google وتجهّز.</p><a class="v2-btn v2-btn-white" style="margin-top:12px" href="${OFFICIAL_GROUP.url}" target="_blank" rel="noopener noreferrer">انضم لمجموعة Google</a></section>${packHow()}`}
// My app in the pack: its public card on «التطبيقات», and the boost.
function packMyCard(){
 const card=dashboard.packs?.apps.find(c=>c.ownerUid===user.uid);if(!card)return '';
 const on=packBoosted(card),left=on?Math.ceil((packMs(card.boostedAt)+BOOST_DAYS*86400000-Date.now())/86400000):0;
 return `<div class="v2-card v2-my-card" style="margin-top:12px"><div class="v2-row">${packIcon(card,card.ownerUid,44)}<div class="v2-grow"><b>${clean(card.appName)}</b><div class="v2-small v2-muted">${on?`مميّز بأعلى «التطبيقات» · باقي ${v2n(left)} ${left===1?'يوم':'أيام'}`:'ظاهر لكل أعضاء TesterHub بـ «التطبيقات»'}</div></div>${on?v2Tag('t-amber','مميّز'):`<button type="button" class="v2-btn v2-btn-soft v2-btn-sm" data-v2="pack-boost">ميّزه · ${v2n(BOOST_COST)} عملة</button>`}</div></div>`;
}
function v2MyGroup(){
 const P=dashboard.packs;
 if(!P?.enabled)return packOff();
 const mine=P.mine,coins=`<div class="v2-row v2-between" style="margin:2px 2px 10px"><span class="v2-small v2-muted">${P.coins.freeUsed?`الدخول الجاي بـ ${v2n(PACK_COST)} عملة`:'دخولك الأول مجاني'}</span>${packCoinChip()}</div>`;
 if(!mine)return `${coins}<div class="v2-card v2-empty-card"><b>ما عندك مجموعة بعد</b><p class="v2-small v2-muted">${P.open?`المجموعة #${v2n(P.open.number)} مفتوحة هسه: ${v2n(P.open.memberCount)} من ${v2n(PACK_SIZE)} مقعد.`:'ماكو مجموعة مفتوحة هسه.'}</p><button type="button" class="v2-btn v2-btn-primary" data-v2="gview" data-k="open">شوف المجموعة المفتوحة</button></div>${packHow()}`;
 const {pack,me,others}=mine;
 if(me?.status==='out')return `${coins}<div class="v2-notice n-amber">طلعت من المجموعة #${v2n(pack.number)} بعد ${v2n(PACK_STRIKES)} إنذارات. تگدر تدخل المجموعة المفتوحة الجاية بـ ${v2n(PACK_COST)} عملة.</div><button type="button" class="v2-btn v2-btn-primary v2-btn-block" style="margin-top:12px" data-v2="gview" data-k="open">المجموعة المفتوحة</button>`;
 if(pack.status==='done')return `${coins}<div class="v2-card v2-empty-card"><b>خلصت المجموعة #${v2n(pack.number)} ✓</b><p class="v2-small v2-muted">16 يوم كاملة. تگدر تدخل مجموعة جديدة بتطبيق ثاني بـ ${v2n(PACK_COST)} عملة.</p><button type="button" class="v2-btn v2-btn-primary" data-v2="gview" data-k="open">المجموعة المفتوحة</button></div>`;
 if(pack.status==='open')return `${coins}<section class="v2-card v2-hero"><div class="v2-row v2-between"><span class="v2-tag v2-tag-glass">مجموعة #${v2n(pack.number)}</span><span class="v2-small v2-muted">بانتظار الاكتمال</span></div><h3 style="margin:12px 0 2px">${v2n(pack.memberCount)} من ${v2n(PACK_SIZE)} مقعد</h3><p class="v2-muted v2-small" style="margin:0">ترتيبك ${v2n(me?.order||0)}. تبدي أول ما تكتمل، ونبلغك.</p>${packSeats(pack.memberCount,pack.id)}</section>
  ${packMyCard()}
  <h2 class="v2-h2">تطبيقات المجموعة</h2><div class="v2-card">${mine.members.map(m=>`<div class="v2-check-item">${packIcon(m,m.uid,40)}<div class="v2-grow"><b>${clean(m.appName)}</b><div class="v2-small v2-muted">${clean(m.uid===user.uid?'تطبيقك':m.devName||m.name)}</div></div></div>`).join('')}</div>
  <button type="button" class="v2-btn v2-btn-ghost v2-btn-block v2-danger" style="margin-top:12px" data-v2="pack-leave">أطلع من المجموعة${me?.paid?` (ترجعلك ${v2n(me.paid)} عملة)`:' (يرجعلك الدخول المجاني)'}</button><p class="v2-small v2-muted" style="text-align:center;margin:8px 0 0">إذا طلعت ما تگدر ترجع لهاي المجموعة؛ تدخل الجاية.</p>`;
 const total=others.length,done=others.filter(m=>mine.confirmed.has(m.uid)).length,need=packNeeded(total),strikes=me?.strikes||0;
 return `${coins}<section class="v2-card v2-hero"><div class="v2-row v2-between"><span class="v2-tag v2-tag-glass">مجموعة #${v2n(pack.number)} · ${v2n(mine.members.length)} عضو</span><span class="v2-small v2-muted">اليوم ${v2n(mine.day)} من ${v2n(PACK_DAYS)}</span></div>
  <h3 style="margin:12px 0 4px">اختبرت ${v2n(done)} من ${v2n(total)} تطبيق اليوم</h3>
  <p class="v2-muted v2-small" style="margin:0 0 12px">وأكد ${v2n(mine.confirmedMe)} من ${v2n(total)} أعضاء اختبار تطبيقك اليوم</p>
  <div class="v2-bar" style="background:rgba(255,255,255,.2)"><span style="width:${total?done/total*100:0}%;background:#fff"></span></div></section>
 <div class="v2-card" style="margin-top:12px"><div class="v2-row v2-between"><div><b class="v2-h3">الإنذارات</b><p class="v2-small v2-muted" style="margin:4px 0 0">النظام يحسبها تلقائياً كل يوم: أقل من ${v2n(need)} تأكيد (70%) = إنذار</p></div><div class="v2-strikes" aria-label="${v2n(strikes)} من ${v2n(PACK_STRIKES)} إنذارات">${[0,1,2].map(i=>`<span class="${i<strikes?'on':''}"></span>`).join('')}</div></div></div>
 ${packMyCard()}
 <h2 class="v2-h2">تطبيقات اليوم</h2>
 <div class="v2-notice n-blue" style="margin-bottom:10px">كل التطبيقات توصلك عن طريق مجموعة Google (testerhubiq) بنفس حساب Google Play. اضغط «فتح» ← «Become a tester» ← نزّل التطبيق.</div>
 <div class="v2-card">${others.map(m=>{const ok=mine.confirmed.has(m.uid),can=packCanConfirm(m.uid);
  return `<div class="v2-check-item v2-pack-app" data-uid="${clean(m.uid)}"><button type="button" class="v2-cbox ${ok?'on':''}" data-v2="pack-confirm" data-uid="${clean(m.uid)}" aria-pressed="${ok}" ${ok||!can?'disabled':''} aria-label="أكدت اختبار ${clean(m.appName)} اليوم">${ok?'✓':''}</button>${packIcon(m,m.uid,40)}<div class="v2-grow"><b>${clean(m.appName)}</b><div class="v2-small v2-muted">${clean(m.devName||m.name)}${ok?' · تم اليوم +1 عملة':can?' · جاهز للتأكيد':''}</div></div><button type="button" class="v2-btn v2-btn-ghost v2-btn-sm" data-v2="pack-open" data-uid="${clean(m.uid)}">فتح</button></div>`}).join('')}</div>
 <p class="v2-small v2-muted" style="text-align:center;margin:10px 0 0">افتح كل تطبيق من زر «فتح» وجرّبه 30 ثانية، بعدها يتفعّل التأكيد. ماكو زر «أكدت الكل».</p>
 <button type="button" class="v2-btn v2-btn-ghost v2-btn-block v2-btn-sm" style="margin-top:10px" data-v2="pack-emails">نسخ إيميلات الأعضاء (احتياط إذا ما تستخدم المجموعة)</button>`;
}
function v2OpenGroup(){
 const P=dashboard.packs;
 if(!P?.enabled)return packOff();
 const o=P.open;
 if(!o)return `<div class="v2-empty">ماكو مجموعة مفتوحة هسه.</div>${packHow()}`;
 const mine=P.mine,inThis=mine&&mine.pack.id===o.id,busy=mine&&!inThis&&['running','open'].includes(mine.pack.status)&&mine.me?.status==='active';
 const free=PACK_SIZE-o.memberCount,cost=packEntryCost(P.coins);
 return `<div class="v2-row v2-between" style="margin:2px 2px 10px"><span class="v2-small v2-muted">${cost?`الدخول بـ ${v2n(cost)} عملة`:'دخولك الأول مجاني'}</span>${packCoinChip()}</div>
 <section class="v2-card v2-hero"><div class="v2-row v2-between"><span class="v2-tag v2-tag-glass">مجموعة #${v2n(o.number)}</span><span class="v2-small v2-muted">مفتوحة هسه</span></div>
  <h3 style="margin:12px 0 2px">${v2n(o.memberCount)} من ${v2n(PACK_SIZE)} مقعد</h3>
  <p class="v2-muted v2-small" style="margin:0">${free?`باقي ${v2n(free)} ${free===1?'مقعد':'مقاعد'}. تبدي أول ما تكتمل.`:'اكتملت. تنفتح الجاية تلقائياً.'}</p>
  ${packSeats(o.memberCount,o.id)}
  ${inThis?`<span class="v2-tag" style="background:#fff;color:var(--green)">انضميت — ترتيبك ${v2n(mine.me?.order||0)}</span>`:(P.left||[]).includes(o.id)?`<button type="button" class="v2-btn v2-btn-white v2-btn-block" disabled>طلعت من هاي المجموعة — انتظر الجاية</button>`:busy?`<button type="button" class="v2-btn v2-btn-white v2-btn-block" disabled>انت بمجموعة أصلاً</button>`:`<button type="button" class="v2-btn v2-btn-white v2-btn-block" data-v2="pack-join-open">انضم بـ 3 خطوات${cost?` · ${v2n(cost)} عملة`:' · مجاناً'}</button>`}</section>
 ${packHow()}`;
}
// Three steps: the Google Group, the new app, then adding the group to the app and the seat.
function packSheet(s){
 const P=dashboard.packs,o=P?.open;if(!o)return '';
 s.title='الانضمام لمجموعة #'+o.number;
 const cost=packEntryCost(P.coins),short=P.coins.balance<cost;
 let body='';
 if(s.step===1)body=`<b class="v2-h3" style="font-size:19px">أولاً: انضم لمجموعة Google</b>
  <p class="v2-small v2-muted">كل تطبيقات المجموعات توصلك عن طريقها، وتطبيقك يوصل للأعضاء عن طريقها.</p>
  <div class="v2-steps">${v2StepRow(1,'افتح المجموعة','بنفس حساب Google اللي تستخدمه بـ Google Play','cur')}${v2StepRow(2,'اضغط «الانضمام إلى المجموعة»','Join group — ينقبل فوراً','')}${v2StepRow(3,'ارجع هنا وأكّد','',s.groupJoined?'done':'')}</div>
  <a class="v2-btn v2-btn-primary v2-btn-block" href="${OFFICIAL_GROUP.url}" target="_blank" rel="noopener noreferrer">فتح مجموعة testerhubiq</a>
  <button type="button" class="v2-opt ${s.groupJoined?'on':''}" data-v2="pack-group-joined" aria-pressed="${!!s.groupJoined}"><span class="v2-cbox ${s.groupJoined?'on':''}">${s.groupJoined?'✓':''}</span>انضميت للمجموعة بحساب Google Play مالتي</button>
  <button type="button" class="v2-btn v2-btn-primary v2-btn-block" style="margin-top:12px" data-v2="pack-next" ${s.groupJoined?'':'disabled'}>التالي</button>`;
 if(s.step===2)body=`<b class="v2-h3" style="font-size:19px">تطبيقك الجديد</b>
  <div class="v2-row" style="margin-top:12px">${s.icon?`<img class="v2-appicon" src="${clean(s.icon)}" alt="" width="56" height="56" style="object-fit:cover">`:v2Icon(s.appName||'؟','new')}<label class="v2-btn v2-btn-soft v2-grow">${s.icon?'تغيير الأيقونة':'أيقونة التطبيق (اختياري)'}<input type="file" accept="image/*" data-change="pack-icon" hidden></label></div>
  <label class="v2-label" for="pk-name">اسم التطبيق</label><input id="pk-name" class="v2-input" maxlength="70" value="${clean(s.appName||'')}">
  <label class="v2-label" for="pk-dev">اسم المطور</label><input id="pk-dev" class="v2-input" maxlength="60" value="${clean(s.devName??user.name??'')}">
  <label class="v2-label" for="pk-link">رابط الاختبار المغلق</label><input id="pk-link" class="v2-input email-ltr" inputmode="url" placeholder="https://play.google.com/apps/testing/..." value="${clean(s.appLink||'')}">
  <label class="v2-label" for="pk-desc">وصف التطبيق (اختياري)</label><textarea id="pk-desc" class="v2-input" rows="3" maxlength="300" placeholder="شنو يسوي تطبيقك بجملة أو جملتين">${clean(s.description||'')}</textarea>
  <div class="v2-err" id="v2-err" role="alert"></div><button type="button" class="v2-btn v2-btn-primary v2-btn-block" style="margin-top:12px" data-v2="pack-next">التالي</button>`;
 if(s.step===3)body=`<b class="v2-h3" style="font-size:19px">ضيف المجموعة لتطبيقك</b>
  <div class="v2-steps">${v2StepRow(1,'Play Console ← تطبيقك','الاختبار ← اختبار مغلق (Closed testing) ← المختبرون (Testers)','')}${v2StepRow(2,'مجموعات Google ← الصق البريد','testerhubiq@googlegroups.com ← حفظ','')}${v2StepRow(3,'انسخ «رابط الانضمام»','هو نفسه رابط الاختبار اللي كتبته بالخطوة السابقة','')}</div>
  <div class="v2-row"><span class="v2-code email-ltr v2-grow" style="margin:0">${OFFICIAL_GROUP.email}</span><button type="button" class="v2-btn v2-btn-soft v2-btn-sm" data-action="copy-group-email">نسخ</button></div>
  <button type="button" class="v2-opt ${s.groupAdded?'on':''}" data-v2="pack-group-added" aria-pressed="${!!s.groupAdded}"><span class="v2-cbox ${s.groupAdded?'on':''}">${s.groupAdded?'✓':''}</span>أضفت المجموعة لتطبيقي بـ Play Console</button>
  <button type="button" class="v2-opt ${s.consent?'on':''}" data-v2="pack-consent" aria-pressed="${!!s.consent}"><span class="v2-cbox ${s.consent?'on':''}">${s.consent?'✓':''}</span>ألتزم 16 يوم (أقل من 70% باليوم = إنذار، 3 = خروج)، وأوافق إيميلي يوصل لأعضاء مجموعتي بس</button>
  <div class="v2-notice ${short?'n-amber':'n-blue'}" style="margin-top:10px">مقعدك رقم ${v2n(o.memberCount+1)} من ${v2n(PACK_SIZE)} · ${cost?`الدخول ${v2n(cost)} عملة (رصيدك ${v2n(P.coins.balance)})`:'دخولك الأول مجاني'}${short?`<br>تحتاج ${v2n(cost-P.coins.balance)} عملة إضافية: كل تطبيق تأكده بمجموعتك = عملة.`:''}</div>
  <div class="v2-err" id="v2-err" role="alert"></div>
  <button type="button" class="v2-btn v2-btn-green v2-btn-block" style="margin-top:12px" data-v2="pack-join" ${s.groupAdded&&s.consent&&!short?'':'disabled'}>انضم للمجموعة</button>`;
 return `<div class="v2-row v2-between"><b>الانضمام لمجموعة #${v2n(o.number)}</b><span class="v2-small v2-muted">${v2n(s.step)}/3</span></div>${v2Dots(s.step)}${body}<button type="button" class="v2-btn v2-btn-ghost v2-btn-block" style="margin-top:8px" data-v2="${s.step>1?'pack-back':'close'}">${s.step>1?'رجوع':'إلغاء'}</button>`;
}
function packKeepTyped(s){
 const v=id=>document.getElementById(id)?.value;
 if(v('pk-name')!=null){s.appName=v('pk-name');s.devName=v('pk-dev');s.appLink=v('pk-link');s.description=v('pk-desc')}
}
async function packRefresh(){dashboard={...dashboard,packs:await loadPacks(user)};render()}
function packClick(button){
 const k=button.dataset.v2,s=V2.sheet;
 if(k==='pack-join-open'){V2.sheet={kind:'pack',step:1,groupJoined:typeof groupJoined==='function'&&groupJoined(),groupAdded:false,consent:false};render();v2SheetFocus();return true}
 if(k==='pack-group-joined'&&s){s.groupJoined=!s.groupJoined;if(s.groupJoined){try{localStorage.setItem(groupJoinedKey(),'1')}catch{}}render();return true}
 if(k==='pack-group-added'&&s){s.groupAdded=!s.groupAdded;render();return true}
 if(k==='pack-consent'&&s){s.consent=!s.consent;render();return true}
 if(k==='pack-back'&&s){packKeepTyped(s);s.step--;render();return true}
 if(k==='pack-next'&&s){
  if(s.step===2){packKeepTyped(s);try{packAppInput(s)}catch(err){v2Err(err.message);return true}}
  s.step++;render();v2SheetFocus();return true;
 }
 if(k==='pack-join'&&s){pending(async()=>{const n=await packJoin(s);V2.sheet=null;V2.groupView='mine';await packRefresh();toast(n>=PACK_SIZE?'اكتملت المجموعة وبدت! ابدي اختبار تطبيقات اليوم':'انضميت. نبلغك أول ما تكتمل المجموعة')});return true}
 if(k==='pack-leave'){pending(async()=>{await packLeave();await packRefresh();toast('طلعت من المجموعة ومقعدك انفتح')});return true}
 if(k==='pack-open'){packOpen(button.dataset.uid);render();return true}
 if(k==='pack-confirm'){const uid=button.dataset.uid;pending(async()=>{await packConfirm(uid);await packRefresh();toast('انحفظ تأكيد اليوم · العملة تنضاف بعد نهاية اليوم')});return true}
 if(k==='pack-boost'){pending(async()=>{await packBoost();await packRefresh();toast('تطبيقك صار بأعلى «التطبيقات» لـ '+BOOST_DAYS+' أيام')});return true}
 if(k==='pack-emails'){const list=(dashboard.packs?.mine?.others||[]).map(m=>m.email).filter(Boolean);pending(async()=>{await copy(list.join(', '));toast('انسخت '+v2n(list.length)+' إيميل')});return true}
 if(k==='pack-app-open'){const c=dashboard.packs?.apps.find(x=>x.id===button.dataset.id);if(c){try{window.open(c.appLink,'_blank','noopener,noreferrer')}catch{}}return true}
 return false;
}
// The app icon picked in the join sheet: made small and square, like the profile photo.
document.addEventListener('change',e=>{
 const node=e.target;if(node?.dataset?.change!=='pack-icon'||V2.sheet?.kind!=='pack')return;
 const file=node.files?.[0];node.value='';if(!file)return;
 packKeepTyped(V2.sheet);
 pending(async()=>{V2.sheet.icon=await photoDataUrl(file);render()});
});
// A public pack app on «التطبيقات»: any member of the TesterHub Google Group can test it.
function packAppSheet(s){
 const c=dashboard.packs?.apps.find(x=>x.id===s.id);if(!c)return '';
 s.title=c.appName;
 return `<div class="v2-row">${packIcon(c,c.ownerUid)}<div class="v2-grow"><b class="v2-h3" style="font-size:19px">${clean(c.appName)}</b><div class="v2-small v2-muted">${clean(c.devName||'')} · اختبار مغلق</div></div>${packBoosted(c)?v2Tag('t-amber','مميّز'):''}</div>
  ${c.description?`<p class="v2-small" style="margin:14px 0">${clean(c.description)}</p>`:''}
  <div class="v2-steps">${v2StepRow(1,'انضم لمجموعة Google','testerhubiq بنفس حساب Google Play — مرة وحدة',typeof groupJoined==='function'&&groupJoined()?'done':'cur')}${v2StepRow(2,'افتح رابط الاختبار','اضغط «Become a tester» ثم نزّل التطبيق','')}${v2StepRow(3,'جرّبه','ساعد صاحبه يوصل لـ 12 مختبر','')}</div>
  <a class="v2-btn v2-btn-soft v2-btn-block" href="${OFFICIAL_GROUP.url}" target="_blank" rel="noopener noreferrer">مجموعة Google</a>
  <button type="button" class="v2-btn v2-btn-primary v2-btn-block" style="margin-top:8px" data-v2="pack-app-open" data-id="${clean(c.id)}">افتح رابط الاختبار</button>
  <button type="button" class="v2-btn v2-btn-ghost v2-btn-block" style="margin-top:8px" data-v2="close">رجوع</button>`;
}
