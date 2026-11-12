import {test,expect} from '@playwright/test';
import {grantPublishInDemo} from './demo-helpers.mjs';
// V2 phase 2 (fairness) in the demo store. The same limits are enforced by firestore.rules
// (tests/emulator/fairness.rules.test.mjs); here we check what people see and that nothing is lost.

const utcDaysAgo=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
async function open(page){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(()=>{resetDemo();navigator.clipboard.writeText=async()=>{}});
}
async function asDeveloper(page,where='new'){await page.evaluate(async where=>{user=await api.switchDemo('developer');await refresh();tab=where;render()},where)}
async function fillApp(page,name){
 await page.locator('#project-name').fill(name);
 await page.locator('#project-tasks').fill('جرّب تسجيل الدخول');
 await page.locator('#project-link').fill('https://play.google.com/apps/testing/com.example.fair');
 await page.locator('#project-form [data-action="copy-emails"]').click();
 await page.locator('[name="confirmed"]').check();
}
const projectNamed=(page,name)=>page.evaluate(name=>demoState().projects.find(p=>p.name===name)||null,name);

test('a developer with a live app sees why, cannot publish a second, and can still save a draft',async({page})=>{
 await open(page);await asDeveloper(page);
 const card=page.locator('.gate-card');
 await expect(card).toContainText('تطبيق نشط واحد لكل مطور');
 await expect(card).toContainText('تگدر تحفظ التطبيق الجديد كمسودة');
 await fillApp(page,'Second App');
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('#toast')).toContainText('نسمح بتطبيق نشط واحد');
 expect(await projectNamed(page,'Second App')).toBeNull();
 await page.locator('#project-form button[value="draft"]').click();
 await expect(page.locator('#toast')).toContainText('تم حفظ المسودة');
 expect((await projectNamed(page,'Second App')).status).toBe('draft');
 // Nothing about the live apps changed.
 expect(await page.evaluate(()=>demoState().projects.filter(p=>!p.status).length)).toBe(3);
});

test('test before you publish: the card counts accepted reports and publishing waits for 3',async({page})=>{
 await open(page);
 await page.evaluate(()=>{const d=demoState();for(const p of d.projects)p.status='completed';d.xp={totals:{d1:{reports:1,bugs:0}}};save(d)});
 await asDeveloper(page);
 const card=page.locator('.gate-card');
 await expect(card).toContainText('اختبر قبل ما تنشر');
 await expect(card).toContainText('باقي ٢');
 await expect(card).toContainText('١ / ٣');
 await fillApp(page,'Early App');
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('#toast')).toContainText('تحتاج 2 تقرير مقبول بعد');
 expect(await projectNamed(page,'Early App')).toBeNull();
});

test('with 3 accepted reports it publishes, and the next app waits for this one to end',async({page})=>{
 await open(page);await page.evaluate(grantPublishInDemo);await asDeveloper(page);
 await expect(page.locator('.gate-card')).toHaveCount(0);
 await fillApp(page,'Fair App');
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('.lead',{hasText:'Fair App'})).toBeVisible();
 const slot=await page.evaluate(()=>demoState().publishSlot);
 expect(slot.acceptedAtPublish).toBe(3);
 expect(slot.projectId).toBe((await projectNamed(page,'Fair App')).id);
 // Ending is offered only after 14 days.
 await expect(page.locator('[data-action="complete-project"]')).toHaveCount(0);
 await expect(page.getByText('تگدر تنهي الاختبار وتنشر تطبيقك الجاي بعد ١٤ يوم')).toBeVisible();
 await page.evaluate(async()=>{tab='new';render()});
 await expect(page.locator('.gate-card')).toContainText('«Fair App» بعده نشط');
});

test('after 14 days the owner ends the test; started testers keep their work',async({page})=>{
 await open(page);await page.evaluate(grantPublishInDemo);
 await page.evaluate(()=>{const d=demoState(),p=d.projects.find(p=>p.id==='media');p.status='recruiting';p.created=new Date(Date.now()-15*86400000).toISOString().slice(0,10);d.xp.totals.d1.reports=6;save(d)});
 await asDeveloper(page,'apps');
 await page.evaluate(()=>{selectedProjectId='media';tab='details';render()});
 page.once('dialog',d=>d.accept());
 await page.locator('[data-action="complete-project"]').click();
 await expect(page.locator('#toast')).toContainText('انتهى الاختبار');
 await expect(page.getByText('انتهى اختبار هذا التطبيق. التقارير والمحادثات محفوظة.')).toBeVisible();
 const after=await page.evaluate(()=>{const d=demoState();return {status:d.projects.find(p=>p.id==='media').status,assignments:d.assignments.filter(a=>a.projectId==='media').length}});
 expect(after).toEqual({status:'completed',assignments:20});
 await page.evaluate(()=>{tab='new';render()});
 await expect(page.locator('.gate-card')).toHaveCount(0);
});

test('«غير نشطة» marks testers with 3 full days without a report, without removing them',async({page})=>{
 await open(page);
 await page.evaluate(({two,three,four})=>{
  const d=demoState();
  d.projects=[{id:'q',name:'Quiet App',link:'https://play.google.com/apps/testing/com.example.q',ownerUid:'d1',ownerName:'مطور تجريبي',created:four,tasks:['جرّب تسجيل الدخول']}];
  const a=(t,checkins)=>({id:'q_'+t,projectId:'q',testerUid:t,ownerUid:'d1',name:'Quiet App',link:'https://play.google.com/apps/testing/com.example.q',invitationStatus:'accepted',joinedDay:four,checkins});
  d.assignments=[a('t1',[four,three]),a('t2',[four,two]),a('t3',[four])];
  save(d);
 },{two:utcDaysAgo(3),three:utcDaysAgo(4),four:utcDaysAgo(5)});
 await asDeveloper(page,'apps');
 await page.evaluate(()=>{selectedProjectId='q';tab='details';render()});
 // t1 last reported 4 days ago and t3 5 days ago (3+ full quiet days); t2 reported 3 days ago (2 full days).
 await expect(page.locator('.tester-list')).toContainText('غير نشطة: 3 أيام بدون تقرير');
 await expect(page.locator('.tester-list').getByText(/غير نشطة: 3 أيام/)).toHaveCount(2);
 await expect(page.locator('.pstats-card')).toContainText('غير نشطة (3 أيام+)');
 expect(await page.evaluate(()=>demoState().assignments.length)).toBe(3);
});

test('today\'s report in 3 taps: open the app, «اشتغل بدون مشاكل», send',async({page})=>{
 await open(page);
 await page.evaluate(async joined=>{
  const d=demoState();
  d.projects.push({id:'tap',name:'Tap App',link:'https://play.google.com/apps/testing/com.example.tap',ownerUid:'d1',ownerName:'مطور تجريبي',created:joined,tasks:['جرّب تسجيل الدخول']});
  d.assignments=d.assignments.filter(a=>a.testerUid!=='t1');
  d.assignments.unshift({id:'tap_t1',projectId:'tap',testerUid:'t1',ownerUid:'d1',name:'Tap App',link:'https://play.google.com/apps/testing/com.example.tap',tasks:['جرّب تسجيل الدخول'],invitationStatus:'accepted',joinedDay:joined,checkins:[]});
  save(d);user=await api.switchDemo('tester');tab='home';await refresh();
  window.open=()=>{};
 },utcDaysAgo(1));
 const card=page.locator('.daily-test');
 await card.locator('[data-action="open-app"]').click();          // 1
 await card.locator('label.ok').click();                          // 2
 await expect(card.locator('#test-note')).toHaveValue(/«جرّب تسجيل الدخول»/);
 await card.locator('button[type="submit"]').click();             // 3
 await expect(page.locator('#toast')).toContainText('تم إرسال تقريرك');
 const r=await page.evaluate(()=>demoState().reports.find(r=>r.assignmentId==='tap_t1'));
 expect(r.outcome).toBe('ok');expect(r.notes).toContain('جرّب تسجيل الدخول');
});

test('the suggested note never overwrites what the tester typed, and a problem needs their words',async({page})=>{
 await open(page);
 await page.evaluate(async joined=>{
  const d=demoState();
  d.projects.push({id:'tap',name:'Tap App',link:'https://play.google.com/apps/testing/com.example.tap',ownerUid:'d1',ownerName:'مطور تجريبي',created:joined,tasks:['جرّب تسجيل الدخول']});
  d.assignments=d.assignments.filter(a=>a.testerUid!=='t1');
  d.assignments.unshift({id:'tap_t1',projectId:'tap',testerUid:'t1',ownerUid:'d1',name:'Tap App',link:'https://play.google.com/apps/testing/com.example.tap',tasks:['جرّب تسجيل الدخول'],invitationStatus:'accepted',joinedDay:joined,checkins:[]});
  save(d);user=await api.switchDemo('tester');tab='home';await refresh();
 },utcDaysAgo(1));
 const card=page.locator('.daily-test'),note=card.locator('#test-note');
 await card.locator('label.ok').click();
 await card.locator('label.issue').click();
 await expect(note).toHaveValue('');
 await expect(note).toBeFocused();
 await note.fill('زر الدخول ما يستجيب أول مرة');
 await card.locator('label.ok').click();
 await expect(note).toHaveValue('زر الدخول ما يستجيب أول مرة');
});

test('an app name with HTML stays text in the gate card and the refusal',async({page})=>{
 await open(page);
 await page.evaluate(()=>{const d=demoState();d.projects=[{id:'x',name:'<img src=x onerror="window.pwned=1">',link:'https://play.google.com/apps/testing/com.example.x',ownerUid:'d1',ownerName:'مطور تجريبي',created:new Date().toISOString().slice(0,10)}];d.assignments=[];save(d)});
 await asDeveloper(page);
 await expect(page.locator('.gate-card')).toContainText('<img src=x');
 await expect(page.locator('.gate-card img')).toHaveCount(0);
 await fillApp(page,'Other');
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('#toast')).toContainText('<img src=x');
 expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
});
