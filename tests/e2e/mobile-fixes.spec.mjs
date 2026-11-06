import {test,expect} from '@playwright/test';
// Reported on a phone: the bottom bar vanished while browsing, back closed the whole app, «اختباراتي» listed
// invitations not yet accepted, and the bell number never went away.

const utcDaysAgo=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
async function open(page,role='tester',setup=null){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async({role,setup})=>{
  resetDemo();const d=demoState();
  if(setup){
   d.assignments=d.assignments.filter(a=>a.testerUid!=='t1');
   const base={testerUid:'t1',ownerUid:'d1',link:'https://play.google.com/apps/testing/com.example.app'};
   const rows={pending:{invitationStatus:'pending',joinedDay:null},accepted:{invitationStatus:'accepted',joinedDay:null},active:{invitationStatus:'accepted',joinedDay:setup.joined},legacy:{joinedDay:setup.joined},declined:{invitationStatus:'declined',joinedDay:null}};
   for(const [id,extra] of Object.entries(rows)){d.projects.push({id,name:'App '+id,link:base.link,ownerUid:'d1',ownerName:'مطور',created:setup.joined});d.assignments.push({id:id+'_t1',projectId:id,name:'App '+id,checkins:[],...base,...extra})}
  }
  save(d);user=await api.switchDemo(role);tab='home';await refresh();
 },{role,setup});
}
const navShown=page=>page.locator('.nav').isVisible();

test('tapping a report choice and scrolling keeps the bottom bar',async({page})=>{
 await open(page);
 await expect(page.locator('#daily-report-form')).toBeVisible();
 await page.locator('#daily-report-form label').first().click();
 expect(await navShown(page)).toBe(true);
 await page.mouse.wheel(0,800);await page.waitForTimeout(200);
 expect(await navShown(page)).toBe(true);
 // Focus in the text field without a keyboard taking space (desktop, hardware keyboard): bar stays.
 await page.locator('#daily-report-form textarea').focus();await page.waitForTimeout(450);
 expect(await navShown(page)).toBe(true);
});

test('the bar steps aside only while the on-screen keyboard takes space, and comes back after',async({page})=>{
 await open(page);
 const size=page.viewportSize();
 await page.locator('#daily-report-form textarea').focus();
 await page.setViewportSize({width:size.width,height:size.height-300});await page.waitForTimeout(450);
 expect(await navShown(page)).toBe(false);
 await page.locator('#daily-report-form textarea').blur();
 await page.setViewportSize(size);await page.waitForTimeout(800);
 expect(await navShown(page)).toBe(true);
});

test('back returns to the previous screen, closes panels, then asks for a second press to leave',async({page})=>{
 await page.goto('about:blank');
 await open(page);
 await page.locator('.nav [data-tab="tests"]').click();
 await page.locator('.nav [data-tab="rewards"]').click();
 await expect(page.locator('.nav [data-tab="rewards"]')).toHaveClass(/active/);
 // The bell is a panel: back closes it first.
 await page.locator('[data-action="notice"]').click();
 await expect(page.locator('.notices-sheet')).toBeVisible();
 await page.evaluate(()=>history.back());
 await expect(page.locator('.notices-sheet')).toHaveCount(0);
 await page.evaluate(()=>history.back());
 await expect(page.locator('.nav [data-tab="tests"]')).toHaveClass(/active/);
 await page.evaluate(()=>history.back());
 await expect(page.locator('.nav [data-tab="home"]')).toHaveClass(/active/);
 // On the home screen the first press only warns.
 await page.evaluate(()=>history.back());
 await expect(page.locator('#toast')).toContainText('اضغط رجوع مرة ثانية للخروج');
 expect(page.url()).toContain('127.0.0.1');
 // A second press within two seconds leaves the app (scheduled, because leaving ends this page's scripts).
 await page.evaluate(()=>{setTimeout(()=>history.back(),0)});
 await page.waitForURL('about:blank');
});

test('a single back press after the hint expires warns again instead of leaving',async({page})=>{
 await page.goto('about:blank');
 await open(page);
 await page.locator('.nav [data-tab="tests"]').click();
 await page.locator('.nav [data-tab="home"]').click();
 await page.evaluate(()=>history.back());
 await expect(page.locator('#toast')).toContainText('اضغط رجوع مرة ثانية');
 await page.waitForTimeout(2300);
 await page.evaluate(()=>history.back());
 await page.waitForTimeout(300);
 expect(page.url()).toContain('127.0.0.1');
 await expect(page.locator('#toast')).toContainText('اضغط رجوع مرة ثانية');
});

test('developer: back from a tester\'s details returns to the app, then to the apps list',async({page})=>{
 await open(page,'developer');
 await page.locator('.nav [data-tab="apps"]').click();
 await page.evaluate(()=>{selectedProjectId=dashboard.projects.find(p=>p.ownerUid==='d1'&&p.status!=='draft').id;tab='details';render()});
 await page.locator('.tester-row').first().click();
 await expect(page.locator('.tester-head')).toBeVisible();
 await page.evaluate(()=>history.back());
 await expect(page.locator('.section-title',{hasText:'المختبرون المشاركون'})).toBeVisible();
 await page.evaluate(()=>history.back());
 await expect(page.locator('.nav [data-tab="apps"]')).toHaveClass(/active/);
});

test('«اختباراتي» lists only accepted or started tests; home still lists every app',async({page})=>{
 await open(page,'tester',{joined:utcDaysAgo(2)});
 const homeNames=await page.locator('.app-card').allTextContents();
 for(const id of ['pending','accepted','active','legacy'])expect(homeNames.join(' ')).toContain('App '+id);
 await page.locator('.nav [data-tab="tests"]').click();
 const cards=page.locator('.page .app-card');
 const names=(await cards.allTextContents()).join(' ');
 for(const id of ['accepted','active','legacy'])expect(names).toContain('App '+id);
 for(const id of ['pending','declined'])expect(names).not.toContain('App '+id);
 await expect(page.locator('.page')).toContainText('قبلت الدعوة · أكمل الانضمام');
});

test('«اختباراتي» with nothing accepted points back to home',async({page})=>{
 await open(page,'tester',{joined:utcDaysAgo(2)});
 await page.evaluate(async()=>{const d=demoState();d.assignments=d.assignments.filter(a=>a.testerUid!=='t1'||a.invitationStatus==='pending');save(d);await refresh();tab='tests';render()});
 await expect(page.locator('.tab-empty')).toContainText('ما وافقت على أي اختبار بعد');
 await page.locator('.tab-empty [data-tab="home"]').click();
 await expect(page.locator('.nav [data-tab="home"]')).toHaveClass(/active/);
});

test('opening the bell clears its number; something new brings it back',async({page})=>{
 await open(page,'tester',{joined:utcDaysAgo(2)});
 const count=()=>page.evaluate(()=>noticeBadgeCount());
 expect(await count()).toBeGreaterThan(0);
 await expect(page.locator('.bell-count')).toBeVisible();
 await page.locator('[data-action="notice"]').click();
 await expect(page.locator('.notices-sheet')).toBeVisible();
 await page.locator('.notices-header [data-action="close-notices"]').click();
 expect(await count()).toBe(0);
 await expect(page.locator('.bell-count')).toHaveCount(0);
 // Still cleared after a reload: what was seen is remembered on the device.
 await page.reload();await expect(page.locator('#launch-splash')).toHaveCount(0);
 expect(await count()).toBe(0);
 // A new invitation is new.
 await page.evaluate(async()=>{const d=demoState();d.projects.push({id:'fresh',name:'App fresh',link:'https://play.google.com/apps/testing/com.example.fresh',ownerUid:'d1',ownerName:'مطور',created:api.dayKey()});d.assignments.push({id:'fresh_t1',projectId:'fresh',testerUid:'t1',ownerUid:'d1',name:'App fresh',link:'https://play.google.com/apps/testing/com.example.fresh',invitationStatus:'pending',joinedDay:null,checkins:[]});save(d);await refresh()});
 expect(await count()).toBe(1);
 await expect(page.locator('.bell-count')).toBeVisible();
});

test('developer bell clears too',async({page})=>{
 await open(page,'developer');
 await page.evaluate(async()=>{const d=demoState();d.projects.push({id:'empty',name:'No testers yet',link:'https://play.google.com/apps/testing/com.example.empty',ownerUid:'d1',ownerName:'مطور',created:api.dayKey()});save(d);await refresh()});
 expect(await page.evaluate(()=>noticeBadgeCount())).toBeGreaterThan(0);
 await page.locator('[data-action="notice"]').click();
 await page.locator('.notices-header [data-action="close-notices"]').click();
 expect(await page.evaluate(()=>noticeBadgeCount())).toBe(0);
});
