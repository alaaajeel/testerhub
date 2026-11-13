import {test,expect} from '@playwright/test';
import {grantPublishInDemo} from './demo-helpers.mjs';
// V2 (approved preview): one account, four sections, app cards with search and filters, and three-step sheets.

async function open(page,role='tester'){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async role=>{resetDemo();navigator.clipboard.writeText=async()=>{};user=await api.switchDemo(role);await refresh();tab='home';render()},role);
}
const SECTIONS=['التطبيقات','المجموعات','اختباراتي','حسابي'];

test('every account has the same four sections, in order, and no role switch',async({page})=>{
 await open(page,'tester');
 await expect(page.locator('.nav button')).toHaveText(SECTIONS);
 await expect(page.locator('[data-action="switch-role"]')).toHaveCount(0);
 await expect(page.locator('[data-action="open-menu"]')).toHaveCount(0);
 await page.evaluate(async()=>{user=await api.switchDemo('developer');await refresh();tab='home';render()});
 await expect(page.locator('.nav button')).toHaveText(SECTIONS);
 await expect(page.locator('.nav [data-tab="home"]')).toHaveClass(/active/);
});

test('home: hero with today\'s work, search, four filters and one card per app',async({page})=>{
 await open(page,'tester');
 await expect(page.locator('.v2-hero')).toContainText('هلا مختبر');
 await expect(page.locator('.v2-chip')).toHaveText(['الكل','يحتاج مختبرين','جديد','أختبرها']);
 await expect(page.locator('.v2-appcard')).toHaveCount(3);
 await page.locator('#v2-q').fill('Fit');
 await expect(page.locator('.v2-appcard')).toHaveCount(1);
 await expect(page.locator('#v2-q')).toBeFocused();
 await page.locator('#v2-q').fill('لا يوجد');
 await expect(page.locator('.v2-empty')).toContainText('ماكو تطبيقات بهذا البحث');
 await page.locator('#v2-q').fill('');
 await page.locator('.v2-chip[data-k="mine"]').click();
 await expect(page.locator('.v2-chip[data-k="mine"]')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.v2-appcard')).toHaveCount(3);
 await expect(page.locator('.v2-fab')).toBeVisible();
});

test('one account: my apps and the apps I test sit together',async({page})=>{
 await open(page,'developer');
 const cards=page.locator('.v2-appcard');
 await expect(cards).toHaveCount(3);
 await expect(cards.first()).toContainText('MediaPro');
 await expect(cards.first()).toContainText('20 من 12 مختبر');
 await cards.first().click();
 await expect(page.locator('.lead',{hasText:'MediaPro'})).toBeVisible();
 await expect(page.locator('.section-title',{hasText:'المختبرون المشاركون'})).toBeVisible();
 await expect(page.locator('.nav [data-tab="home"]')).toHaveClass(/active/);
});

test('adding an app is a three-step sheet that checks each step',async({page})=>{
 await open(page,'developer');await page.evaluate(grantPublishInDemo);
 await page.evaluate(async()=>{await refresh();tab='home';render()});
 await page.locator('.v2-fab').click();
 const sheet=page.locator('.v2-sheet');
 await expect(sheet).toContainText('1/3');
 await sheet.locator('#v2-an').fill('Steps App');
 await sheet.locator('#v2-au').fill('https://example.com/app');
 await sheet.locator('[data-v2="add-next"]').click();
 await expect(sheet.locator('#v2-err')).toContainText('play.google.com');
 await sheet.locator('#v2-au').fill('https://play.google.com/apps/testing/com.example.steps');
 await sheet.locator('[data-v2="add-next"]').click();
 await expect(sheet).toContainText('2/3');
 await sheet.locator('#v2-at').fill('قصير');
 await sheet.locator('[data-v2="add-next"]').click();
 await expect(sheet.locator('#v2-err')).toContainText('5');
 await sheet.locator('#v2-at').fill('جرّب تسجيل الدخول');
 await sheet.locator('[data-v2="add-next"]').click();
 await expect(sheet).toContainText('3/3');
 await expect(sheet).toContainText('testerhubiq@googlegroups.com');
 await expect(sheet.locator('[data-v2="add-publish"]')).toBeDisabled();
 await sheet.locator('[data-v2="add-confirm"]').click();
 await expect(sheet.locator('[data-v2="add-publish"]')).toBeEnabled();
 await sheet.locator('[data-v2="add-publish"]').click();
 await expect(page.locator('#toast')).toContainText('انتشر تطبيقك');
 await expect(page.locator('.nav [data-tab="tests"]')).toHaveClass(/active/);
 await expect(page.locator('.v2-seg button.on')).toHaveText('تطبيقاتي');
 await expect(page.locator('.v2-card',{hasText:'Steps App'})).toBeVisible();
 const p=JSON.parse(await page.evaluate(()=>JSON.stringify(demoState().projects.find(x=>x.name==='Steps App')??demoState().projects.map(x=>x.name))));
 expect(p).toMatchObject({ownerUid:'d1',status:'recruiting',tasks:['جرّب تسجيل الدخول']});
});

test('the add sheet explains when publishing is not open yet, and still saves a draft',async({page})=>{
 await open(page,'developer');
 await page.locator('.v2-fab').click();
 const sheet=page.locator('.v2-sheet');
 await expect(sheet.locator('.v2-notice')).toContainText('تطبيق نشط');
 await sheet.locator('#v2-an').fill('Later App');
 await sheet.locator('#v2-au').fill('https://play.google.com/apps/testing/com.example.later');
 await sheet.locator('[data-v2="add-next"]').click();
 await sheet.locator('#v2-at').fill('جرّب تسجيل الدخول');
 await sheet.locator('[data-v2="add-next"]').click();
 await sheet.locator('[data-v2="add-confirm"]').click();
 await expect(sheet.locator('[data-v2="add-publish"]')).toBeDisabled();
 await sheet.locator('[data-v2="add-draft"]').click();
 await expect(page.locator('#toast')).toContainText('انحفظت المسودة');
 expect(await page.evaluate(()=>demoState().projects.find(p=>p.name==='Later App')?.status)).toBe('draft');
});

test('tester: an invitation sheet shows where they are in the three steps',async({page})=>{
 await open(page,'tester');
 await page.evaluate(async()=>{
  const d=demoState(),base={ownerUid:'d1',link:'https://play.google.com/apps/testing/com.example.s',tasks:['جرّب تسجيل الدخول'],checkins:[]};
  d.assignments=d.assignments.filter(a=>a.testerUid!=='t1');
  d.assignments.push({...base,id:'s1_t1',projectId:'s1',testerUid:'t1',name:'Step Pending',invitationStatus:'pending',joinedDay:null},
   {...base,id:'s4_t1',projectId:'s4',testerUid:'t1',name:'Step Declined',invitationStatus:'declined',joinedDay:null});
  save(d);await refresh();tab='home';render();
 });
 await expect(page.locator('.v2-appcard',{hasText:'Step Declined'})).toHaveCount(0);
 await page.locator('.v2-appcard',{hasText:'Step Pending'}).click();
 const steps=page.locator('.v2-sheet .v2-step');
 await expect(steps).toHaveCount(3);
 const state=()=>steps.evaluateAll(s=>s.map(x=>x.classList.contains('done')?'done':x.classList.contains('cur')?'cur':'-'));
 expect(await state()).toEqual(['cur','-','-']);
 await page.locator('.v2-sheet [data-action="accept-invite"]').click();
 await expect.poll(state).toEqual(['done','cur','-']);
 await page.locator('.v2-sheet [data-action="confirm-join"]').click();
 await expect.poll(state).toEqual(['done','done','done']);
 await expect(page.locator('.v2-sheet [data-v2="report-open"]')).toBeVisible();
});

test('«المجموعات» is the exchange packs: «مجموعتي» and «المجموعة المفتوحة»',async({page})=>{
 await open(page,'tester');
 await page.locator('.nav [data-tab="groups"]').click();
 await expect(page.locator('.v2-seg button')).toHaveText(['مجموعتي','المجموعة المفتوحة']);
 await expect(page.locator('.v2-hero')).toContainText('مجموعة #1');
 await page.locator('.v2-seg [data-k="open"]').click();
 await expect(page.locator('.v2-hero')).toContainText('من 16 مقعد');
 await expect(page.locator('.v2-seats i')).toHaveCount(16);
});

test('«اختباراتي» has both sides: what I test and my own apps',async({page})=>{
 await open(page,'developer');
 await page.locator('.nav [data-tab="tests"]').click();
 await expect(page.locator('.v2-seg button')).toHaveText(['أختبرها','تطبيقاتي']);
 await page.locator('.v2-seg [data-k="mine"]').click();
 const app=page.locator('.v2-card',{hasText:'MediaPro'});
 await expect(app.locator('.v2-stat').first()).toContainText('20/12');
 await expect(app.locator('.v2-mini-bars span')).toHaveCount(14);
 await app.locator('[data-action="project-details"]').click();
 await expect(page.locator('.lead',{hasText:'MediaPro'})).toBeVisible();
});

test('«حسابي»: profile card, settings and everything that left the bottom bar',async({page})=>{
 await open(page,'developer');
 await page.locator('.nav [data-tab="profile"]').click();
 await expect(page.locator('.v2-stat')).toHaveCount(3);
 await expect(page.locator('.v2-switch')).toHaveCount(1);
 await expect(page.locator('.v2-linkrow')).toContainText(['دوري المساهمين','مركز الإشعارات','مركز المساعدة','المختبرون المتاحون']);
 await page.locator('.v2-linkrow[data-tab="testers"]').click();
 await expect(page.locator('.nav [data-tab="profile"]')).toHaveClass(/active/);
});

test('the new screens and sheets fit a phone without sideways scrolling',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await open(page,'developer');
 for(const t of ['home','groups','tests','profile']){
  await page.evaluate(t=>{tab=t;render()},t);
  const overflow=await page.evaluate(()=>{const p=document.getElementById('page');return p.scrollWidth-p.clientWidth});
  expect(overflow,t).toBeLessThanOrEqual(1);
 }
 await page.evaluate(()=>{tab='home';render()});
 await page.locator('.v2-fab').click();
 expect(await page.evaluate(()=>{const s=document.querySelector('.v2-sheet');return s.scrollWidth-s.clientWidth})).toBeLessThanOrEqual(1);
 const nav=await page.locator('.nav button').evaluateAll(b=>b.map(x=>x.getBoundingClientRect().width));
 for(const w of nav)expect(w).toBeGreaterThan(60);
});

test('an app name with HTML stays text on the new cards and sheets',async({page})=>{
 await open(page,'tester');
 await page.evaluate(async()=>{const d=demoState();d.assignments.find(a=>a.testerUid==='t1').name='<img src=x onerror="window.pwned=1">';save(d);await refresh();tab='home';render()});
 await expect(page.locator('.v2-appcard').first()).toContainText('<img src=x');
 await page.locator('.v2-appcard').first().click();
 await expect(page.locator('.v2-sheet')).toContainText('<img src=x');
 await expect(page.locator('.page img, .v2-sheet img')).toHaveCount(0);
 expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
});
