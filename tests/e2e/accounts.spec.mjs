import {test,expect} from '@playwright/test';
// Browser integration doubles. Actual Firebase behavior is tested separately with emulators.
async function setup(page,{profile=null,loggedIn=false}={}) {
 await page.addInitScript(({profile,loggedIn})=>{
  window.fixture={profile,verified:false,failSave:false};
  window.fakeAuth={currentUser:loggedIn?{uid:'u1',email:'test@example.com',emailVerified:false}:null,authStateReady:async()=>{}};
 },{profile,loggedIn});
 const app=`export const initializeApp=()=>({});`;
 const auth=`const a=window.fakeAuth;export const getAuth=()=>a;
 export const onAuthStateChanged=(_,cb)=>{window.authCallback=cb;return ()=>{}};
 export const createUserWithEmailAndPassword=async(_,email)=>{a.currentUser={uid:'u1',email,emailVerified:false};return {user:a.currentUser}};
 export const signInWithEmailAndPassword=createUserWithEmailAndPassword;
 export const signOut=async()=>{a.currentUser=null;window.authCallback?.(null)};
 export const sendEmailVerification=async()=>{};
 export const sendPasswordResetEmail=async()=>{};
 export const reload=async u=>{u.emailVerified=window.fixture.verified};
 export const getIdToken=async()=>'';`;
 const store=`export const getFirestore=()=>({});export const doc=(_,c,id)=>({c,id});
 const snap=ref=>{const data=ref?.c==='messages'?window.fixture.messages?.[ref.id]:ref?.c==='assignments'?window.fixture.assignment:window.fixture.profile;return {exists:()=>!!data,data:()=>data}};
 export const getDocFromServer=async ref=>{if(ref?.c==='messages'&&window.fixture.failMessageReadOnce){window.fixture.failMessageReadOnce=false;throw Error('network unavailable')}return snap(ref)};
 export const getDoc=async ref=>snap(ref);
 export const setDoc=async(ref,data)=>{window.fixture.messages??={};if(window.fixture.messages[ref.id])throw Object.assign(Error(),{code:'permission-denied'});window.fixture.messages[ref.id]=data;window.fixture.messageWriteCount=(window.fixture.messageWriteCount||0)+1;if(window.fixture.loseMessageAckOnce){window.fixture.loseMessageAckOnce=false;throw Error('network unavailable')}};
 export const runTransaction=async(_,fn)=>fn({get:async()=>snap(),set:(_,value)=>{if(window.fixture.failSave)throw Object.assign(Error(),{code:'permission-denied'});window.fixture.profile=value}});
 export const serverTimestamp=()=>1;
 export const updateDoc=async(_,v)=>{if(window.fixture.failSave)throw Object.assign(Error(),{code:'permission-denied'});Object.assign(window.fixture.profile,v)};
 export const collection=()=>({});export const query=()=>({});export const where=()=>({});
 export const getDocs=async()=>({docs:[]});export const getDocsFromServer=getDocs;
 export const onSnapshot=()=>()=>{};`;
 await page.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().endsWith('firebase-app.js')?app:route.request().url().endsWith('firebase-auth.js')?auth:store}));
 await page.goto('/');
 await expect(page.locator('#launch-splash')).toHaveCount(0);
}
test('signup consent is opt-in and verification gate blocks dashboards',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await setup(page);await page.locator('[data-auth="signup"]').first().click();
 await expect(page.locator('[name="available"]')).not.toBeChecked();
 await page.locator('#auth-name').fill('مختبر جديد');await page.locator('#auth-email').fill('test@example.com');await page.locator('#auth-password').fill('password123');
 await page.locator('#auth-form button[type="submit"]').click();
 await expect(page.locator('[data-action="send-verification"]')).toBeVisible();
 await expect(page.locator('.nav')).toHaveCount(0);
 await page.locator('[data-action="send-verification"]').click();
 await expect(page.locator('#toast')).toContainText('تم إرسال');
 await page.evaluate(()=>window.fixture.verified=true);
 await page.locator('[data-action="check-verification"]').click();await expect(page.locator('.nav')).toBeVisible();
 expect(errors).toEqual([]);
});
test('orphan account recovers same UID then requires verification',async({page})=>{
 await setup(page,{loggedIn:true});await expect(page.locator('#complete-profile-form')).toBeVisible();
 await page.locator('#recover-name').fill('مطور جديد');await expect(page.locator('#recover-role')).toHaveCount(0);
 await page.locator('#complete-profile-form button').click();await expect(page.locator('[data-action="check-verification"]')).toBeVisible();
 expect(await page.evaluate(()=>window.fakeAuth.currentUser.uid)).toBe('u1');
});
test('reset password uses neutral confirmation',async({page})=>{
 await setup(page);await page.locator('#auth-email').fill('unknown@example.com');await page.locator('[data-action="reset-password"]').click();await expect(page.locator('#toast')).toContainText('إذا كان البريد مسجلاً');
});
test('profile writes confirm success only after accepted save; logout removes private UI',async({page})=>{
 await setup(page,{loggedIn:true,profile:{name:'Old Name',role:'tester',available:true}});
 await page.evaluate(()=>window.fixture.verified=true);await page.locator('[data-action="check-verification"]').click();
 await page.locator('.nav [data-tab="profile"]').click();
 await page.locator('#profile-name').fill('اسم جديد');await page.locator('[name="paused"]').check();await page.locator('#profile-form button').click();
 await expect(page.locator('#toast')).toContainText('تم حفظ');expect(await page.evaluate(()=>window.fixture.profile.available)).toBe(false);
 await page.evaluate(()=>window.fixture.failSave=true);await page.locator('#profile-name').fill('اسم مرفوض');await page.locator('#profile-form button').click();await expect(page.locator('#toast')).toContainText('رفضت قاعدة البيانات');
 await page.locator('[data-action="logout"]').click();await expect(page.locator('#auth-form')).toBeVisible();await expect(page.locator('#profile-form')).toHaveCount(0);
});
test('add-app form shows no tester names or emails and copies the whole eligible list',async({page})=>{
 await setup(page,{loggedIn:true,profile:{name:'Developer',role:'developer',available:false}});
 await page.evaluate(()=>window.fixture.verified=true);await page.locator('[data-action="check-verification"]').click();
 await page.evaluate(()=>{dashboard.testers=[{uid:'t1',name:'Tester One',email:'one@example.com',available:true,role:'tester'},{uid:'t2',name:'Tester Two',email:'two@example.com',available:true,role:'tester'}];tab='new';render()});
 await expect(page.locator('#project-form [name="testerUid"]')).toHaveCount(0);
 await expect(page.locator('#project-form')).not.toContainText('one@example.com');
 await expect(page.locator('#project-form')).not.toContainText('Tester One');
 await page.evaluate(()=>{window.copied=[];navigator.clipboard.writeText=async t=>{window.copied.push(t)}});
 await page.locator('#project-form [data-action="copy-emails"]').click();
 expect(await page.evaluate(()=>window.copied)).toEqual(['one@example.com, two@example.com']);
 await expect(page.locator('.prepared')).toContainText('٢');
});
test('developer saves draft, edits it, then invites exactly the prepared list',async({page})=>{
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async()=>{user=await api.switchDemo('developer');await refresh();tab='new';render()});
 await page.locator('#project-name').fill('Draft Test');
 await page.locator('#project-form button[value="draft"]').click();
 await expect(page.locator('.lead', {hasText:'Draft Test'})).toBeVisible();
 expect(await page.evaluate(()=>dashboard.assignments.filter(a=>a.projectId===selectedProjectId).length)).toBe(0);
 await page.locator('[data-action="edit-draft"]').click();
 await page.locator('#project-name').fill('Published Test');
 await page.locator('#project-tasks').fill('جرّب تسجيل الدخول بحسابك');
 await page.locator('#project-link').fill('https://play.google.com/apps/testing/test');
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{}});
 await page.locator('#project-form [data-action="copy-emails"]').click();
 const prepared=await page.evaluate(()=>preparedList().map(t=>t.uid));
 expect(prepared.length).toBeGreaterThan(0);
 await page.locator('[name="confirmed"]').check();
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('.lead',{hasText:'Published Test'})).toBeVisible();
 expect(await page.evaluate(()=>dashboard.assignments.filter(a=>a.projectId===selectedProjectId).map(a=>a.testerUid).sort())).toEqual(prepared.sort());
});
test('assigned task appears in daily report and saved report keeps its snapshot',async({page})=>{
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async()=>{user=await api.switchDemo('developer');await refresh();tab='new';render()});
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{}});
 await page.locator('#project-form [data-action="copy-emails"]').click();
 await page.locator('#project-name').fill('Search Test');
 await page.locator('#project-tasks').fill('ابحث عن منتج وافتح تفاصيله');
 await page.locator('#project-link').fill('https://play.google.com/apps/testing/test');
 await page.locator('[name="confirmed"]').check();
 await page.locator('#project-form button[value="publish"]').click();
 await page.evaluate(async()=>{user=await api.switchDemo('tester');await refresh();tab='tests';render()});
 const card=page.locator('.app-card',{hasText:'Search Test'});
 await card.locator('[data-action="accept-invite"]').click();
 await card.locator('[data-action="confirm-join"]').click();
 await card.locator('[data-action="write-report"]').click();
 await expect(page.locator('.daily-test .daily-task')).toContainText('ابحث عن منتج وافتح تفاصيله');
 await page.locator('#daily-report-form label.ok').click();
 await page.locator('#test-note').fill('بحثت عن منتج وفتحت صفحة التفاصيل بنجاح');
 await page.locator('#daily-report-form button[type="submit"]').click();
 expect(await page.evaluate(()=>dashboard.reports.find(r=>r.tested==='ابحث عن منتج وافتح تفاصيله')?.notes)).toContain('بحثت عن منتج');

});
test('retry after lost message acknowledgement reuses document id',async({page})=>{
 await setup(page,{loggedIn:true,profile:{name:'Developer',role:'developer',available:false}});
 await page.evaluate(()=>window.fixture.verified=true);await page.locator('[data-action="check-verification"]').click();
 await page.evaluate(()=>{window.fixture.assignment={ownerUid:'u1',testerUid:'t1',projectId:'p1'};window.fixture.loseMessageAckOnce=true;window.fixture.failMessageReadOnce=true});
 await expect(page.evaluate(()=>api.sendMessage('a1','اختبرت التطبيق وأحتاج توضيحاً','developer'))).rejects.toThrow();
 await page.evaluate(()=>api.sendMessage('a1','اختبرت التطبيق وأحتاج توضيحاً','developer'));
 expect(await page.evaluate(()=>window.fixture.messageWriteCount)).toBe(1);
});

test('tester setup separates opt-in and store; confirmed setup stays collapsed after reload',async({page})=>{
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async()=>{
  user=await api.switchDemo('developer');await refresh();
  await api.createProject({name:'Journey App',link:'https://play.google.com/apps/testing/com.example.journey',tasks:'جرّب تسجيل الدخول بحسابك'},[{uid:'t1',role:'tester',available:true,email:'tester01@example.com'}]);
  user=await api.switchDemo('tester');await refresh();tab='tests';render();
  window.openedLinks=[];window.open=url=>window.openedLinks.push(url);
 });
 const card=page.locator('.app-card',{hasText:'Journey App'});
 await card.locator('[data-action="accept-invite"]').click();
 await card.locator('[data-action="open-link"]').click();
 await card.locator('[data-action="open-store"]').click();
 expect(await page.evaluate(()=>window.openedLinks)).toEqual(['https://play.google.com/apps/testing/com.example.journey','https://play.google.com/store/apps/details?id=com.example.journey']);
 expect(await page.evaluate(()=>primaryAssignments().find(a=>a.name==='Journey App').joinedDay)).toBeNull();
 await card.locator('[data-action="confirm-join"]').click();
 await expect(card.locator('[data-action="confirm-join"]')).toHaveCount(0);
 await expect(card.locator('details [data-action="open-link"]')).not.toBeVisible();
 await expect(card.locator('[data-action="write-report"]')).toBeVisible();
 await page.reload();await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(()=>{tab='tests';render()});
 await expect(card.locator('[data-action="confirm-join"]')).toHaveCount(0);
 await expect(card).toContainText('صفحة التطبيق بالمتجر');
 await expect(card.locator('details [data-action="open-link"]')).not.toBeVisible();
 await card.locator('summary').click();await expect(card.locator('details [data-action="open-link"]')).toBeVisible();
});

test('test queue puts daily work before history and disables cooldown reports',async({page})=>{
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async()=>{
  user=await api.switchDemo('tester');await refresh();
  dashboard.assignments=[
   {id:'old',testerUid:user.uid,name:'Old Test',joinedDay:'2020-01-01',checkins:[]},
   {id:'wait',testerUid:user.uid,name:'Cooldown Test',joinedDay:api.dayKey(),checkins:[],lastCheckinAt:{seconds:Date.now()/1000}},
   {id:'due',testerUid:user.uid,name:'Due Test',joinedDay:api.dayKey(),checkins:[]}
  ];tab='tests';render();
 });
 await expect(page.locator('.app-card h4')).toHaveText(['Due Test','Cooldown Test','Old Test']);
 await expect(page.locator('.app-card',{hasText:'Cooldown Test'}).locator('[data-action="write-report"]')).toBeDisabled();
 await expect(page.locator('.app-card',{hasText:'Due Test'}).locator('[data-action="write-report"]')).toBeEnabled();
});
