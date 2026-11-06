import {test,expect} from '@playwright/test';
// Phase 1 daily testing in Chromium. The preview tests use the on-device demo store; the Firestore test
// uses in-browser Firebase doubles. Real security behavior is covered by tests/emulator/daily-report.rules.test.mjs.

const utcDaysAgo=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);

async function openPreview(page){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
}
// One active assignment on day 3 with a known task; other seeded testers stay untouched.
async function seedActiveTest(page,{checkins=[],lastCheckinAt}={}){
 await page.evaluate(async({joined,checkins,lastCheckinAt})=>{
  resetDemo();const d=demoState();
  d.projects.push({id:'daily',name:'Daily App',link:'https://play.google.com/apps/testing/com.example.daily',ownerUid:'d1',ownerName:'مطور تجريبي',created:joined,tasks:['جرّب تسجيل الدخول','افتح صفحة الإعدادات','ابحث عن منتج']});
  d.assignments=d.assignments.filter(a=>a.testerUid!=='t1');
  d.assignments.unshift({id:'daily_t1',projectId:'daily',testerUid:'t1',ownerUid:'d1',name:'Daily App',link:'https://play.google.com/apps/testing/com.example.daily',tasks:['جرّب تسجيل الدخول','افتح صفحة الإعدادات','ابحث عن منتج'],invitationStatus:'accepted',joinedDay:joined,checkins,...(lastCheckinAt?{lastCheckinAt}:{})});
  save(d);user=await api.switchDemo('tester');tab='home';await refresh();
 },{joined:utcDaysAgo(2),checkins,lastCheckinAt});
}

test('tester sees today\'s test on home with the right app, day and task',async({page})=>{
 await openPreview(page);await seedActiveTest(page);
 const card=page.locator('.daily-test');
 await expect(card).toHaveCount(1);
 await expect(card).toContainText('اختبار اليوم');
 await expect(card).toContainText('Daily App');
 await expect(card).toContainText('اليوم 3 من 14');
 await expect(card.locator('.daily-task')).toContainText('ابحث عن منتج');
 await expect(card.locator('[name="outcome"]')).toHaveCount(3);
 await expect(card.locator('textarea')).toHaveCount(1);
 await expect(card.locator('input[type="checkbox"]')).toHaveCount(0);
 await expect(card.locator('button[type="submit"]')).toHaveText(/إرسال التقرير/);
 await page.evaluate(()=>{window.openedLinks=[];window.open=url=>window.openedLinks.push(url)});
 await card.locator('[data-action="open-app"]').click();
 expect(await page.evaluate(()=>window.openedLinks)).toEqual(['https://play.google.com/store/apps/details?id=com.example.daily']);
 // Opening the app is not a report.
 expect(await page.evaluate(()=>demoState().reports.length)).toBe(0);
});

test('clear Arabic errors and nothing saved for an incomplete report',async({page})=>{
 await openPreview(page);await seedActiveTest(page);
 const form=page.locator('#daily-report-form');
 await form.locator('button[type="submit"]').click();
 await expect(page.locator('#toast')).toContainText('اختر شلون كانت التجربة');
 await form.locator('label.ok').click();
 await form.locator('textarea').fill('تمام');
 await form.locator('button[type="submit"]').click();
 await expect(page.locator('#toast')).toContainText('10 أحرف');
 expect(await page.evaluate(()=>demoState().reports.length)).toBe(0);
 expect(await page.evaluate(()=>demoState().assignments.find(a=>a.id==='daily_t1').checkins)).toEqual([]);
});

test('report saves once, shows the saved state and blocks a duplicate for the same day',async({page})=>{
 await openPreview(page);await seedActiveTest(page);
 const form=page.locator('#daily-report-form');
 await form.locator('label.ok').click();
 await form.locator('textarea').fill('جرّبت البحث عن منتج واشتغل بصورة طبيعية');
 await form.locator('button[type="submit"]').click();
 await expect(page.locator('#toast')).toContainText('تم إرسال تقريرك إلى المطور');
 const card=page.locator('.daily-test.saved');
 await expect(card).toContainText('تم حفظ تقرير اليوم');
 await expect(card).toContainText('اشتغل بدون مشاكل');
 await expect(card).toContainText('بانتظار المراجعة');
 await expect(page.locator('#daily-report-form')).toHaveCount(0);
 const saved=await page.evaluate(()=>demoState().reports);
 expect(saved).toHaveLength(1);
 expect(saved[0]).toMatchObject({assignmentId:'daily_t1',testerUid:'t1',ownerUid:'d1',outcome:'ok',status:'ok',tested:'ابحث عن منتج',notes:'جرّبت البحث عن منتج واشتغل بصورة طبيعية'});
 // A second submission for the same day returns the saved report instead of a new one.
 const again=await page.evaluate(()=>api.submitDailyReport('daily_t1',{outcome:'issue',notes:'محاولة تقرير ثاني لنفس اليوم'}));
 expect(again.alreadySaved).toBe(true);
 expect(await page.evaluate(()=>demoState().reports.length)).toBe(1);
 expect(await page.evaluate(()=>demoState().assignments.find(a=>a.id==='daily_t1').checkins.length)).toBe(1);
 // The saved state survives a reload, and the existing test list shows the day as done.
 await page.reload();await expect(page.locator('#launch-splash')).toHaveCount(0);
 await expect(page.locator('.daily-test.saved')).toContainText('تم حفظ تقرير اليوم');
 await page.locator('.nav [data-tab="tests"]').click();
 await expect(page.locator('.app-card',{hasText:'Daily App'}).locator('[data-action="write-report"]')).toBeDisabled();
});

test('a tester cannot report on another tester\'s assignment',async({page})=>{
 await openPreview(page);await seedActiveTest(page);
 const id=await page.evaluate(()=>demoState().assignments.find(a=>a.testerUid!=='t1'&&a.joinedDay).id);
 await expect(page.evaluate(id=>api.submitDailyReport(id,{outcome:'ok',notes:'تقرير على حساب شخص ثاني'}),id)).rejects.toThrow(/غير متاح/);
});

test('report screen explains cooldown instead of offering a second form',async({page})=>{
 await openPreview(page);await seedActiveTest(page,{checkins:[utcDaysAgo(1)],lastCheckinAt:new Date(Date.now()-3600000).toISOString()});
 await expect(page.locator('.daily-test')).toHaveCount(0);
 await page.evaluate(()=>{selectedAssignmentId='daily_t1';tab='report';render()});
 await expect(page.locator('#daily-report-form')).toHaveCount(0);
 await expect(page.locator('.notice')).toContainText('أقل من 14 ساعة');
});

test('developer sees the blocked report, reviews it, and the tester text stays unchanged',async({page})=>{
 await openPreview(page);await seedActiveTest(page);
 const form=page.locator('#daily-report-form');
 await form.locator('label.blocked').click();
 await expect(page.locator('#test-note-label')).toHaveText('شنو جرّبت؟ وليش ما گدرت تكمل؟');
 await form.locator('textarea').fill('جرّبت أفتح البحث بس التطبيق يطلع خطأ بالتحميل');
 await form.locator('button[type="submit"]').click();
 await expect(page.locator('.daily-test.saved')).toContainText('ما گدرت أكمل');

 await page.evaluate(async()=>{user=await api.switchDemo('developer');await refresh();selectedProjectId='daily';tab='details';render()});
 const record=page.locator('.report-record').first();
 await expect(record).toContainText('مختبر 1');
 await expect(record).toContainText('Daily App');
 await expect(record).toContainText('اليوم 3 من 14');
 await expect(record).toContainText('المهمة: ابحث عن منتج');
 await expect(record).toContainText('ما گدرت أكمل');
 await expect(record).toContainText('جرّبت أفتح البحث بس التطبيق يطلع خطأ بالتحميل');
 await expect(record).toContainText('بانتظار المراجعة');
 await expect(record.locator('[data-action="review-report"]')).toHaveText(['قبول التقرير','طلب توضيح','رفض التقرير']);
 // The new outcome is counted as an open problem for the developer.
 await expect(page.locator('.chip',{hasText:'مشكلة مُبلّغ عنها'})).toContainText('1');

 await record.locator('[data-decision="clarify"]').click();
 await expect(page.locator('#toast')).toContainText('تم طلب التوضيح');
 await expect(page.locator('.report-record').first().locator('.review-chip')).toHaveText('مطلوب توضيح');
 await expect(page.locator('.report-record').first().locator('[data-decision="clarify"]')).toBeDisabled();
 expect(await page.evaluate(()=>demoState().messages.some(m=>m.assignmentId==='daily_t1'&&m.sender==='developer'&&m.text.includes('توضيح')))).toBe(true);

 await page.evaluate(async()=>{user=await api.switchDemo('tester');tab='home';await refresh()});
 await expect(page.locator('.daily-test.saved')).toContainText('مطلوب توضيح');
 await expect(page.locator('.daily-test.saved .notice')).toContainText('المطور طلب توضيحاً');

 await page.evaluate(async()=>{user=await api.switchDemo('developer');await refresh();selectedProjectId='daily';tab='details';render()});
 await page.locator('.report-record').first().locator('[data-decision="accepted"]').click();
 await expect(page.locator('.report-record').first().locator('.review-chip')).toHaveText('مقبول');
 const report=await page.evaluate(()=>demoState().reports[0]);
 expect(report).toMatchObject({outcome:'blocked',status:'new',notes:'جرّبت أفتح البحث بس التطبيق يطلع خطأ بالتحميل',tested:'ابحث عن منتج',reviewStatus:'accepted',reviewerUid:'d1'});
});

test('historical reports without review fields still render for the developer',async({page})=>{
 await openPreview(page);await seedActiveTest(page);
 await page.evaluate(async()=>{
  const d=demoState();
  d.reports.push({id:'daily_t1_old',assignmentId:'daily_t1',projectId:'daily',testerUid:'t1',ownerUid:'d1',date:d.assignments.find(a=>a.id==='daily_t1').joinedDay,tested:'فتح التطبيق وتجربة وظيفة أساسية',outcome:'issue',notes:'تقرير قديم من النسخة السابقة',status:'fixed',createdAt:'2026-01-01T00:00:00.000Z'});
  save(d);user=await api.switchDemo('developer');await refresh();selectedProjectId='daily';tab='details';render();
 });
 const record=page.locator('.report-record',{hasText:'تقرير قديم'});
 await expect(record).toContainText('تم الإصلاح');
 await expect(record).toContainText('اليوم 1 من 14');
 await expect(record).toContainText('بانتظار المراجعة');
});

test('mobile: no horizontal overflow and the submit button is not hidden by the bottom bar',async({page})=>{
 await openPreview(page);await seedActiveTest(page);
 expect(await page.evaluate(()=>document.documentElement.dir||document.dir)).toBe('rtl');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 expect(overflow).toBeLessThanOrEqual(0);
 const submit=page.locator('#daily-report-form button[type="submit"]');
 await submit.scrollIntoViewIfNeeded();
 const [box,nav]=await Promise.all([submit.boundingBox(),page.locator('.nav').boundingBox()]);
 expect(box.height).toBeGreaterThanOrEqual(44);
 if(nav)expect(box.y+box.height).toBeLessThanOrEqual(nav.y+1);
 for(const label of await page.locator('.outcome-choices label').all())expect((await label.boundingBox()).height).toBeGreaterThanOrEqual(44);
 // Developer review list must also fit without sideways scrolling.
 await page.locator('label.ok').click();await page.locator('#daily-report-form textarea').fill('جرّبت البحث واشتغل بصورة طبيعية');
 await submit.click();await expect(page.locator('.daily-test.saved')).toBeVisible();
 await page.evaluate(async()=>{user=await api.switchDemo('developer');await refresh();selectedProjectId='daily';tab='details';render()});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
 const actions=page.locator('.report-record').first().locator('.review-actions');
 await actions.scrollIntoViewIfNeeded();
 const [actionsBox,navBox]=await Promise.all([actions.boundingBox(),page.locator('.nav').boundingBox()]);
 if(navBox)expect(actionsBox.y+actionsBox.height).toBeLessThanOrEqual(navBox.y+1);
});

test('typing the report hides the bottom bar so the keyboard cannot push it over the form',async({page})=>{
 await openPreview(page);await seedActiveTest(page);
 await expect(page.locator('.nav')).toBeVisible();
 await page.locator('#daily-report-form textarea').focus();
 await expect(page.locator('.nav')).toBeHidden();
 await page.locator('#daily-report-form label.ok').click();
 await expect(page.locator('.nav')).toBeHidden();
 await page.locator('.daily-test .lead').click();
 await expect(page.locator('.nav')).toBeVisible();
 // «فتح التطبيق» is secondary; «إرسال التقرير» stays the one primary action.
 await expect(page.locator('[data-action="open-app"]')).toHaveClass(/outline/);
 await expect(page.locator('#daily-report-form button[type="submit"]')).not.toHaveClass(/outline/);
});

// Firestore path with in-browser doubles: the written documents and the retry-safe duplicate handling.
async function openWithFirestoreDoubles(page){
 const today=new Date().toISOString().slice(0,10),joined=utcDaysAgo(4);
 await page.addInitScript(({today,joined})=>{
  window.fakeAuth={currentUser:{uid:'t1',email:'t1@example.com',emailVerified:true,getIdTokenResult:async()=>({claims:{email_verified:true}})},authStateReady:async()=>{}};
  window.fs={n:0,writes:[],docs:{
   'users/t1':{name:'مختبر واحد',role:'tester',available:true},
   'projects/p1':{ownerUid:'d1',name:'Store App'},
   'assignments/p1_t1':{projectId:'p1',testerUid:'t1',ownerUid:'d1',name:'Store App',link:'https://play.google.com/apps/testing/com.example.store',tasks:['Open the cart'],invitationStatus:'accepted',joinedDay:joined,checkins:[]},
   'assignments/p1_t2':{projectId:'p1',testerUid:'t2',ownerUid:'d1',name:'Store App',link:'https://play.google.com/apps/testing/com.example.store',joinedDay:joined,checkins:[]}
  }};
  window.fs.today=today;
 },{today,joined});
 const app=`export const initializeApp=()=>({});`;
 const auth=`const a=window.fakeAuth;export const getAuth=()=>a;export const onAuthStateChanged=()=>()=>{};export const signOut=async()=>{};export const reload=async()=>{};export const getIdToken=async()=>'';`;
 const store=`const F=window.fs;
 export const getFirestore=()=>({});
 export const collection=(_,name)=>({__col:true,name});
 export const doc=(a,c,id)=>a&&a.__col?{c:a.name,id:'auto'+(++F.n)}:{c,id};
 const key=r=>r.c+'/'+r.id;
 const snap=r=>{const data=F.docs[key(r)];return {id:r.id,exists:()=>!!data,data:()=>data&&structuredClone(data)}};
 export const getDoc=async r=>snap(r);export const getDocFromServer=getDoc;
 export const where=(f,op,v)=>({f,v});export const query=(col,...w)=>({col:col.name,w});
 export const getDocs=async q=>{const docs=Object.entries(F.docs).filter(([k,v])=>k.startsWith(q.col+'/')&&q.w.every(x=>v[x.f]===x.v)).map(([k])=>snap({c:q.col,id:k.slice(q.col.length+1)}));return {docs,size:docs.length}};
 export const getDocsFromServer=getDocs;export const onSnapshot=()=>()=>{};
 export const serverTimestamp=()=>({server:true});export const arrayUnion=v=>({union:v});
 const apply=([op,r,v])=>{const k=key(r);F.writes.push({op,path:k,value:v});if(op==='set')F.docs[k]=structuredClone(v);else{const cur=F.docs[k];for(const [f,x] of Object.entries(v))cur[f]=x&&x.union!==undefined?[...(cur[f]||[]),x.union]:x;}};
 export const runTransaction=async(_,fn)=>{
  const run=async()=>{const ops=[];await fn({get:async r=>snap(r),set:(r,v)=>ops.push(['set',r,v]),update:(r,v)=>ops.push(['update',r,v])});ops.forEach(apply)};
  await run();
  // The SDK may run the function again after its commit was applied but not acknowledged.
  if(F.rerunAfterCommit){F.rerunAfterCommit=false;await run()}
 };
 export const writeBatch=()=>{const ops=[];return {set:(r,v)=>ops.push(['set',r,v]),update:(r,v)=>ops.push(['update',r,v]),commit:async()=>ops.forEach(apply)}};
 export const updateDoc=async(r,v)=>apply(['update',r,v]);export const setDoc=async(r,v)=>apply(['set',r,v]);`;
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {apiKey:"test",projectId:"demo-testerhub"};'}));
 await page.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().endsWith('firebase-app.js')?app:route.request().url().endsWith('firebase-auth.js')?auth:store}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 return today;
}

test('Firestore: report, checkin and message are written together with the trusted fields',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const today=await openWithFirestoreDoubles(page);
 const card=page.locator('.daily-test');
 await expect(card).toContainText('Store App');
 await expect(card).toContainText('اليوم 5 من 14');
 await card.locator('label.issue').click();
 await card.locator('textarea').fill('فتحت السلة وطلع خطأ عند إضافة منتج');
 await card.locator('button[type="submit"]').click();
 await expect(page.locator('.daily-test.saved')).toContainText('واجهت مشكلة');
 const fs=await page.evaluate(()=>window.fs);
 const report=fs.docs[`reports/p1_t1_${today}`];
 expect(report).toMatchObject({assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',date:today,tested:'Open the cart',outcome:'issue',status:'new',notes:'فتحت السلة وطلع خطأ عند إضافة منتج',submittedAt:{server:true}});
 expect(Object.keys(report)).not.toContain('reviewStatus');
 expect(fs.docs['assignments/p1_t1'].checkins).toEqual([today]);
 expect(fs.docs['assignments/p1_t1'].lastCheckinAt).toEqual({server:true});
 const message=Object.entries(fs.docs).find(([k])=>k.startsWith('messages/'))?.[1];
 expect(message).toMatchObject({sender:'tester',senderUid:'t1',testerUid:'t1',ownerUid:'d1',text:'بلاغ مشكلة: فتحت السلة وطلع خطأ عند إضافة منتج'});
 expect(errors).toEqual([]);
});

test('Firestore: a re-run after an unacknowledged commit shows the saved report, not an error or a duplicate',async({page})=>{
 const today=await openWithFirestoreDoubles(page);
 await page.evaluate(()=>{window.fs.rerunAfterCommit=true});
 const card=page.locator('.daily-test');
 await card.locator('label.ok').click();
 await card.locator('textarea').fill('فتحت السلة وأضفت منتج بدون مشاكل');
 await card.locator('button[type="submit"]').click();
 await expect(page.locator('#toast')).toContainText('محفوظ مسبقاً');
 await expect(page.locator('.daily-test.saved')).toContainText('اشتغل بدون مشاكل');
 const fs=await page.evaluate(()=>window.fs);
 expect(fs.writes.filter(w=>w.path===`reports/p1_t1_${today}`)).toHaveLength(1);
 expect(fs.docs['assignments/p1_t1'].checkins).toEqual([today]);
});

test('Firestore: the client refuses another tester\'s assignment before writing',async({page})=>{
 await openWithFirestoreDoubles(page);
 await expect(page.evaluate(()=>api.submitDailyReport('p1_t2',{outcome:'ok',notes:'تقرير على حساب شخص ثاني'}))).rejects.toThrow(/غير متاح/);
 expect(await page.evaluate(()=>window.fs.writes.length)).toBe(0);
});
