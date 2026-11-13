import {test,expect} from '@playwright/test';
import {grantPublishInDemo} from './demo-helpers.mjs';
// V2 phase 3: four sections in both views, app cards, and every operation shown as at most three steps.

async function open(page,role='tester'){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async role=>{resetDemo();navigator.clipboard.writeText=async()=>{};user=await api.switchDemo(role);await refresh();tab='home';render()},role);
}
const SECTIONS=['التطبيقات','المجموعات','اختباراتي','حسابي'];
const stepState=list=>list.locator('li').evaluateAll(lis=>lis.map(li=>li.className||'-'));

test('both views have the same four sections, in order',async({page})=>{
 await open(page,'tester');
 await expect(page.locator('.nav button')).toHaveText(SECTIONS);
 await page.evaluate(async()=>{user=await api.switchDemo('developer');await refresh();tab='home';render()});
 await expect(page.locator('.nav button')).toHaveText(SECTIONS);
 await expect(page.locator('.nav [data-tab="home"]')).toHaveClass(/active/);
});

test('inner screens light up their section',async({page})=>{
 await open(page,'developer');
 await page.locator('.home-add').click();
 await expect(page.locator('.nav [data-tab="home"]')).toHaveClass(/active/);
 await page.evaluate(()=>{tab='testers';render()});
 await expect(page.locator('.nav [data-tab="profile"]')).toHaveClass(/active/);
});

test('developer: every app is one card, and the card opens its testers and reports',async({page})=>{
 await open(page,'developer');
 const rows=page.locator('.app-rows .app-row');
 await expect(rows).toHaveCount(3);
 await expect(rows.first()).toContainText('MediaPro');
 await expect(rows.first()).toContainText('٢٠ مختبر');
 await expect(rows.first().locator('.flag')).toHaveText('نشط');
 await rows.first().click();
 await expect(page.locator('.lead',{hasText:'MediaPro'})).toBeVisible();
 await expect(page.locator('.section-title',{hasText:'المختبرون المشاركون'})).toBeVisible();
});

test('adding an app shows three steps that follow what is filled in',async({page})=>{
 await open(page,'developer');await page.evaluate(grantPublishInDemo);
 await page.evaluate(async()=>{await refresh();tab='new';render()});
 const steps=page.locator('#add-steps .steps3');
 await expect(steps.locator('li')).toHaveText(['1التطبيق','2المختبرين','3المهام والنشر'].map(t=>t.replace(/\d/,d=>'٠١٢٣'[d])));
 expect(await stepState(steps)).toEqual(['now','-','-']);
 await page.locator('#project-name').fill('Steps App');
 await page.locator('#project-link').fill('https://play.google.com/apps/testing/com.example.steps');
 expect(await stepState(steps)).toEqual(['done','now','-']);
 await page.locator('#project-form [data-action="copy-emails"]').click();
 await page.locator('[name="confirmed"]').check();
 expect(await stepState(steps)).toEqual(['done','done','now']);
 await page.locator('#project-tasks').fill('جرّب تسجيل الدخول');
 expect(await stepState(steps)).toEqual(['done','done','done']);
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('.lead',{hasText:'Steps App'})).toBeVisible();
});

test('tester: each invitation card shows where they are in the three steps',async({page})=>{
 await open(page,'tester');
 const today=new Date().toISOString().slice(0,10);
 await page.evaluate(async today=>{
  const d=demoState(),base={ownerUid:'d1',link:'https://play.google.com/apps/testing/com.example.s',tasks:['جرّب تسجيل الدخول'],checkins:[]};
  d.assignments=d.assignments.filter(a=>a.testerUid!=='t1');
  d.assignments.push({...base,id:'s1_t1',projectId:'s1',testerUid:'t1',name:'Step Pending',invitationStatus:'pending',joinedDay:null},
   {...base,id:'s2_t1',projectId:'s2',testerUid:'t1',name:'Step Accepted',invitationStatus:'accepted',joinedDay:null},
   {...base,id:'s3_t1',projectId:'s3',testerUid:'t1',name:'Step Done',invitationStatus:'accepted',joinedDay:today,checkins:[today]},
   {...base,id:'s4_t1',projectId:'s4',testerUid:'t1',name:'Step Declined',invitationStatus:'declined',joinedDay:null});
  save(d);await refresh();tab='home';render();
 },today);
 const card=name=>page.locator('.app-card',{hasText:name});
 expect(await stepState(card('Step Pending').locator('.steps3'))).toEqual(['now','-','-']);
 expect(await stepState(card('Step Accepted').locator('.steps3'))).toEqual(['done','now','-']);
 expect(await stepState(card('Step Done').locator('.steps3'))).toEqual(['done','done','done']);
 await expect(card('Step Declined').locator('.steps3')).toHaveCount(0);
});

test('«المجموعات» is honest: exchange groups are marked as coming, with nothing to press',async({page})=>{
 for(const role of ['tester','developer']){
  await open(page,role);
  await page.locator('.nav [data-tab="groups"]').click();
  const soon=page.locator('.exchange-soon');
  await expect(soon).toContainText('مجموعات التبادل');
  await expect(soon.locator('.chip')).toHaveText('قريباً');
  await expect(soon.locator('button, a')).toHaveCount(0);
 }
});

test('developer «اختباراتي» moves to the tester view in one tap',async({page})=>{
 await open(page,'developer');
 await page.locator('.nav [data-tab="tests"]').click();
 await page.locator('[data-action="open-my-tests"]').click();
 await expect(page.locator('#toast')).toContainText('واجهة المختبر');
 await expect(page.locator('.nav [data-tab="tests"]')).toHaveClass(/active/);
 await expect(page.locator('.lead',{hasText:'اختباراتي'})).toBeVisible();
});

test('what left the bottom bar is one tap away from «حسابي»',async({page})=>{
 await open(page,'developer');
 await page.locator('.nav [data-tab="profile"]').click();
 await expect(page.locator('.shortcuts .item-link')).toContainText(['دوري المساهمين و XP','المختبرون المتاحون','كل تطبيقاتي','مركز الإشعارات','مركز المساعدة','الدعم']);
 await page.locator('.shortcuts [data-tab="testers"]').click();
 await expect(page.locator('.nav [data-tab="profile"]')).toHaveClass(/active/);
});

test('the new screens fit a phone without sideways scrolling',async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await open(page,'developer');
 for(const t of ['home','groups','tests','profile','new']){
  await page.evaluate(t=>{tab=t;render()},t);
  const overflow=await page.evaluate(()=>{const p=document.getElementById('page');return p.scrollWidth-p.clientWidth});
  expect(overflow,t).toBeLessThanOrEqual(1);
 }
 const nav=await page.locator('.nav button').evaluateAll(b=>b.map(x=>x.getBoundingClientRect().width));
 for(const w of nav)expect(w).toBeGreaterThan(60);
});

test('an app name with HTML stays text on the new cards',async({page})=>{
 await open(page,'developer');
 await page.evaluate(async()=>{const d=demoState();d.projects[0].name='<img src=x onerror="window.pwned=1">';save(d);await refresh();tab='home';render()});
 await expect(page.locator('.app-rows .app-row').first()).toContainText('<img src=x');
 await expect(page.locator('.app-rows img')).toHaveCount(0);
 expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
});
