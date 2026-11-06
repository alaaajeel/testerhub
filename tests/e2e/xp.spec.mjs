import {test,expect} from '@playwright/test';
// Phase 2 XP in Chromium. Preview tests use the on-device demo store; the last test checks the exact Firestore
// batch with in-browser doubles. Security is proven separately in tests/emulator/xp.rules.test.mjs.

const utcDaysAgo=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
async function openPreview(page){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
}
async function seed(page,{checkins=[],reports=[],joined=utcDaysAgo(2)}={}){
 await page.evaluate(async({joined,checkins,reports})=>{
  resetDemo();const d=demoState();
  d.projects.push({id:'xp',name:'XP App',link:'https://play.google.com/apps/testing/com.example.xp',ownerUid:'d1',ownerName:'مطور تجريبي',created:joined});
  d.assignments=d.assignments.filter(a=>a.testerUid!=='t1');
  d.assignments.unshift({id:'xp_t1',projectId:'xp',testerUid:'t1',ownerUid:'d1',name:'XP App',link:'https://play.google.com/apps/testing/com.example.xp',invitationStatus:'accepted',joinedDay:joined,checkins});
  d.reports.push(...reports);save(d);user=await api.switchDemo('tester');tab='home';await refresh();
 },{joined,checkins,reports});
}
const asDeveloper=page=>page.evaluate(async()=>{user=await api.switchDemo('developer');await refresh();selectedProjectId='xp';tab='details';render()});
const asTester=(page,where='home')=>page.evaluate(async where=>{user=await api.switchDemo('tester');tab=where;await refresh()},where);
async function submitToday(page,outcome='ok',notes='جرّبت الشاشة الرئيسية واشتغلت تمام'){
 await page.locator(`#daily-report-form label.${outcome}`).click();
 await page.locator('#daily-report-form textarea').fill(notes);
 await page.locator('#daily-report-form button[type="submit"]').click();
 await expect(page.locator('.daily-test.saved')).toBeVisible();
}

test('no XP for a submitted report until the developer accepts it, then 10 XP once',async({page})=>{
 await openPreview(page);await seed(page);
 await submitToday(page);
 await page.locator('.nav [data-tab="rewards"]').click();
 await expect(page.locator('.xp-card .coins')).toHaveText(/^0 XP$|^٠ XP$/);
 await expect(page.locator('.xp-card')).toContainText('بانتظار مراجعة المطور');

 await asDeveloper(page);
 await page.locator('.report-record').first().locator('[data-decision="accepted"]').click();
 await expect(page.locator('#toast')).toContainText('+١٠ XP');
 // An accepted decision is final: every review button is now disabled.
 for(const b of await page.locator('.report-record').first().locator('[data-action="review-report"]').all())await expect(b).toBeDisabled();
 await expect(page.evaluate(()=>api.reviewReport(dashboard.reports[0].id,'rejected'))).rejects.toThrow(/مقبول مسبقاً/);

 await asTester(page);
 await expect(page.locator('.daily-test.saved .xp-earned')).toContainText('+10 XP');
 await expect(page.locator('.feature .badge')).toContainText('١٠ XP');
 await page.locator('.nav [data-tab="rewards"]').click();
 await expect(page.locator('.xp-card .coins')).toHaveText('١٠ XP');
 await expect(page.locator('.xp-stat',{hasText:'تقارير مقبولة'})).toContainText('١');
 await expect(page.locator('.xp-stat',{hasText:'تطبيقات ساعدت بيها'})).toContainText('١');
 await expect(page.locator('.level-chip')).toHaveText('مبتدئ');
 // Opening the page again or syncing again never pays twice.
 await page.evaluate(()=>api.syncMyXp());await page.locator('.nav [data-tab="home"]').click();await page.locator('.nav [data-tab="rewards"]').click();
 await expect(page.locator('.xp-card .coins')).toHaveText('١٠ XP');
 expect(await page.evaluate(()=>Object.keys(demoState().xp.events))).toEqual([expect.stringMatching(/^xp_t1_\d{4}-\d{2}-\d{2}_review$/)]);
});

test('a confirmed problem report earns 20 XP as a bug',async({page})=>{
 await openPreview(page);await seed(page);
 await submitToday(page,'issue','زر الدفع ما يستجيب بعد إضافة المنتج');
 await asDeveloper(page);
 await page.locator('.report-record').first().locator('[data-decision="accepted"]').click();
 await expect(page.locator('#toast')).toContainText('+٢٠ XP');
 await asTester(page,'rewards');await page.evaluate(()=>openRewards());
 await expect(page.locator('.xp-card .coins')).toHaveText('٢٠ XP');
 await expect(page.locator('.xp-stat',{hasText:'بلاغات مؤكدة'})).toContainText('١');
});

test('rejected and clarification reports earn nothing',async({page})=>{
 await openPreview(page);await seed(page);
 await submitToday(page);
 await asDeveloper(page);
 await page.locator('.report-record').first().locator('[data-decision="clarify"]').click();
 await page.locator('.report-record').first().locator('[data-decision="rejected"]').click();
 await expect(page.locator('#toast')).toContainText('تم رفض التقرير');
 await asTester(page,'rewards');await page.evaluate(()=>openRewards());
 await expect(page.locator('.xp-card .coins')).toHaveText(/^(0|٠) XP$/);
 expect(await page.evaluate(()=>Object.keys(demoState().xp?.events||{}).length)).toBe(0);
});

test('retesting a fixed problem is linked to it and earns 10 extra XP when accepted',async({page})=>{
 await openPreview(page);
 const fixedId='xp_t1_'+utcDaysAgo(1);
 await seed(page,{checkins:[utcDaysAgo(1)],reports:[{id:fixedId,assignmentId:'xp_t1',projectId:'xp',testerUid:'t1',ownerUid:'d1',date:utcDaysAgo(1),tested:'فتح التطبيق وتجربة وظيفة أساسية',outcome:'issue',notes:'التطبيق يعلق عند فتح الإعدادات',status:'fixed',createdAt:new Date(Date.now()-86400000).toISOString()}]});
 const card=page.locator('.daily-test');
 await expect(card.locator('.retest-notice')).toContainText('التطبيق يعلق عند فتح الإعدادات');
 await submitToday(page,'ok','فتحت الإعدادات وصارت تشتغل بعد التحديث');
 expect(await page.evaluate(()=>demoState().reports.find(r=>r.date===api.dayKey()).retestOf)).toBe(fixedId);
 await asDeveloper(page);
 const record=page.locator('.report-record',{hasText:'صارت تشتغل'});
 await expect(record).toContainText('إعادة اختبار');
 await record.locator('[data-decision="accepted"]').click();
 await expect(page.locator('#toast')).toContainText('+٢٠ XP');
 await asTester(page,'rewards');await page.evaluate(()=>openRewards());
 await expect(page.locator('.xp-stat',{hasText:'إعادات اختبار'})).toContainText('١');
 await expect(page.locator('.xp-card .coins')).toHaveText('٢٠ XP');
});

test('the tester recovers accepted work that has no reward yet, once',async({page})=>{
 await openPreview(page);
 const accepted=i=>({id:'xp_t1_2026-10-0'+i,assignmentId:'xp_t1',projectId:'xp',testerUid:'t1',ownerUid:'d1',date:'2026-10-0'+i,tested:'فتح التطبيق وتجربة وظيفة أساسية',outcome:'ok',notes:'تقرير مقبول قبل تفعيل النقاط',status:'ok',reviewStatus:'accepted',createdAt:'2026-10-0'+i+'T10:00:00.000Z'});
 await seed(page,{reports:[accepted(1),accepted(2)]});
 await page.locator('.nav [data-tab="rewards"]').click();
 await expect(page.locator('#toast')).toContainText('انضافت');
 await expect(page.locator('.xp-card .coins')).toHaveText('٢٠ XP');
 await page.locator('.nav [data-tab="home"]').click();await page.locator('.nav [data-tab="rewards"]').click();
 await expect(page.locator('.xp-card .coins')).toHaveText('٢٠ XP');
});

test('old check-in points stay visible but separate and unverified',async({page})=>{
 await openPreview(page);
 const old=Array.from({length:14},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`);
 await seed(page,{joined:'2026-10-01',checkins:old});
 await page.locator('.nav [data-tab="rewards"]').click();
 await expect(page.locator('.legacy-xp')).toContainText('نقاط سابقة غير موثّقة');
 await expect(page.locator('.legacy-xp .chip')).toContainText('١٦٠ XP');
 await expect(page.locator('.xp-card .coins')).toHaveText(/^(0|٠) XP$/);
});

test('rewards page fits a phone screen',async({page})=>{
 await openPreview(page);await seed(page);
 await page.locator('.nav [data-tab="rewards"]').click();
 await expect(page.locator('.xp-card')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
 await page.locator('.xp-rules summary').click();
 await expect(page.locator('.xp-rules')).toContainText('ما تنحسب نقاط لفتح الرابط');
 const rules=page.locator('.xp-rules');await rules.scrollIntoViewIfNeeded();
 const [box,nav]=await Promise.all([rules.boundingBox(),page.locator('.nav').boundingBox()]);
 if(nav)expect(box.y+box.height).toBeLessThanOrEqual(nav.y+1);
});

test('Firestore: the developer award is one batch of an event and the four totals',async({page})=>{
 const day=new Date().toISOString().slice(0,10);
 await page.addInitScript(({day})=>{
  window.fakeAuth={currentUser:{uid:'d1',email:'d1@example.com',emailVerified:true,getIdTokenResult:async()=>({claims:{email_verified:true}})},authStateReady:async()=>{}};
  window.fs={n:0,batches:[],docs:{
   'users/d1':{name:'مطور',role:'developer',available:false},
   'projects/p1':{ownerUid:'d1',name:'Store App',link:'https://play.google.com/apps/testing/com.example.store'},
   'assignments/p1_t1':{projectId:'p1',testerUid:'t1',ownerUid:'d1',name:'Store App',link:'https://play.google.com/apps/testing/com.example.store',joinedDay:day,checkins:[day]},
   [`reports/p1_t1_${day}`]:{assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',date:day,tested:'فتح التطبيق وتجربة وظيفة أساسية',outcome:'issue',notes:'خطأ عند الدفع بالبطاقة',status:'new',createdAt:new Date().toISOString()}
  }};
 },{day});
 const store=`const F=window.fs;
 export const getFirestore=()=>({});export const collection=(_,name)=>({__col:true,name});
 export const doc=(a,c,id)=>a&&a.__col?{c:a.name,id:'auto'+(++F.n)}:{c,id};
 const key=r=>r.c+'/'+r.id;const snap=r=>{const data=F.docs[key(r)];return {id:r.id,exists:()=>!!data,data:()=>data&&structuredClone(data)}};
 export const getDoc=async r=>snap(r);export const getDocFromServer=getDoc;
 export const where=(f,op,v)=>({f,v});export const query=(col,...w)=>({col:col.name,w});
 export const getDocs=async q=>{const docs=Object.entries(F.docs).filter(([k,v])=>k.startsWith(q.col+'/')&&q.w.every(x=>v[x.f]===x.v)).map(([k])=>snap({c:q.col,id:k.slice(q.col.length+1)}));return {docs,size:docs.length}};
 export const getDocsFromServer=getDocs;export const onSnapshot=()=>()=>{};
 export const serverTimestamp=()=>({server:true});export const increment=n=>({inc:n});export const arrayUnion=v=>({union:v});
 export const writeBatch=()=>{const ops=[];return {set:(r,v,o)=>ops.push({op:'set',path:key(r),value:v,merge:!!o?.merge}),update:(r,v)=>ops.push({op:'update',path:key(r),value:v}),commit:async()=>{F.batches.push(ops);for(const o of ops){const cur=F.docs[o.path]||{};F.docs[o.path]=o.op==='set'&&!o.merge?structuredClone(o.value):{...cur,...Object.fromEntries(Object.entries(o.value).map(([k,x])=>[k,x&&x.inc!==undefined?(cur[k]||0)+x.inc:x]))}}}}};
 export const runTransaction=async()=>{};export const updateDoc=async()=>{};export const setDoc=async()=>{};`;
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {apiKey:"test",projectId:"demo-testerhub"};'}));
 await page.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().endsWith('firebase-app.js')?'export const initializeApp=()=>({});':route.request().url().endsWith('firebase-auth.js')?'const a=window.fakeAuth;export const getAuth=()=>a;export const onAuthStateChanged=()=>()=>{};export const signOut=async()=>{};':store}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 const result=await page.evaluate(day=>api.reviewReport('p1_t1_'+day,'accepted'),day);
 expect(result.awarded).toBe(20);
 const [review,award]=await page.evaluate(()=>window.fs.batches);
 expect(review.map(o=>o.path)).toEqual([`reports/p1_t1_${day}`]);
 expect(review[0].value).toEqual({reviewStatus:'accepted',reviewedAt:{server:true},reviewerUid:'d1'});
 const now=Date.now(),week='W'+Math.floor((now+259200000)/604800000),d=new Date(now),month='M'+(d.getUTCFullYear()*100+d.getUTCMonth()+1);
 expect(award.map(o=>o.path)).toEqual([`contributions/p1_t1_${day}_review`,'xpTotals/t1',`xpPeriods/${week}_t1`,`xpPeriods/${month}_t1`,'xpAssignments/p1_t1']);
 expect(award[0].value).toEqual({kind:'bug',points:20,testerUid:'t1',ownerUid:'d1',projectId:'p1',assignmentId:'p1_t1',reportId:`p1_t1_${day}`,awardedBy:'d1',week,month,createdAt:{server:true}});
 const counters={points:{inc:20},reports:{inc:0},bugs:{inc:1},retests:{inc:0},cycles:{inc:0},lastEventId:`p1_t1_${day}_review`,updatedAt:{server:true}};
 expect(award[1]).toMatchObject({merge:true,value:{uid:'t1',...counters,apps:{inc:1}}});
 expect(award[2]).toMatchObject({merge:true,value:{uid:'t1',period:week,...counters}});
 expect(award[4]).toMatchObject({merge:true,value:{testerUid:'t1',ownerUid:'d1',projectId:'p1',...counters}});
 // The tester's text is untouched by the review.
 expect(await page.evaluate(day=>window.fs.docs['reports/p1_t1_'+day].notes,day)).toBe('خطأ عند الدفع بالبطاقة');
});
