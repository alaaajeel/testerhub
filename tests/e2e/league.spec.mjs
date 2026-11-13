import {test,expect} from '@playwright/test';
// Phase 3 league in Chromium, using the on-device demo store. Read and write permissions are proven in
// tests/emulator/league.rules.test.mjs.

const utcDaysAgo=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
async function openPreview(page){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
}
// Others' weekly and monthly rows; t1 (the tester) is set by `mine`.
async function seedLeague(page,{others=3,mine=null,names={}}={}){
 await page.evaluate(({others,mine,names})=>{
  resetDemo();const d=demoState(),day=xpDayKey(),week=xpWeekKey(),month=xpMonthKey();
  d.xp={events:{},totals:{},periods:{},ledgers:{}};
  const put=(uid,points,apps=1)=>{
   const row={uid,points,reports:points/10,bugs:0,retests:0,cycles:0};
   d.xp.periods[day+'_'+uid]={...row,period:day};
   d.xp.periods[week+'_'+uid]={...row,period:week};
   d.xp.periods[month+'_'+uid]={...row,period:month,points:points*2};
   d.xp.totals[uid]={...row,apps,points:points*3};
  };
  for(let i=0;i<others;i++)put('o'+i,100-i*10,i+1);
  if(mine!==null)put('t1',mine,2);
  d.publicProfiles=names;save(d);
 },{others,mine,names});
 await page.evaluate(async()=>{user=await api.switchDemo('tester');tab='home';await refresh()});
 await page.locator('.nav [data-tab="profile"]').click();await page.locator('.shortcuts [data-tab="rewards"]').click();
 await expect(page.locator('.league-list')).not.toContainText('جاري تحميل');
}

test('today\'s ranking lists contributors by verified points, with names only by consent',async({page})=>{
 await openPreview(page);await seedLeague(page,{mine:85,names:{o0:{name:'سارة',consent:true},o1:{name:'بلا موافقة',hidden:false}}});
 const rows=page.locator('.league-row');
 await expect(rows).toHaveCount(4);
 // 100, 90, mine 85, 80.
 await expect(rows.locator('strong')).toHaveText(['سارة','مساهم','أنت','مساهم']);
 await expect(rows.nth(2)).toHaveClass(/mine/);
 await expect(rows.nth(2)).toContainText('٨٥ XP');
 await expect(rows.nth(2).locator('.league-rank')).toHaveText('٣');
 await expect(rows.nth(0).locator('.league-rank')).toHaveText('١');
 await expect(rows.nth(0)).toContainText('محترف');
 await expect(page.locator('.league')).not.toContainText('@');
});

test('monthly view switches periods',async({page})=>{
 await openPreview(page);await seedLeague(page,{mine:20});
 await page.locator('[data-action="league-kind"][data-id="month"]').click();
 await expect(page.locator('[data-action="league-kind"][data-id="month"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.league-row.mine')).toContainText('٤٠ XP');
 await page.locator('[data-action="league-kind"][data-id="week"]').click();
 await expect(page.locator('.league-row.mine')).toContainText('٢٠ XP');
});

test('a contributor below the top 20 still sees their own rank',async({page})=>{
 await openPreview(page);await seedLeague(page,{others:0});
 await page.evaluate(async()=>{const d=demoState(),week=xpWeekKey();for(let i=0;i<25;i++)d.xp.periods[week+'_o'+i]={uid:'o'+i,period:week,points:500-i};d.xp.periods[week+'_t1']={uid:'t1',period:week,points:10};save(d);await loadLeague('week')});
 await expect(page.locator('.league-row')).toHaveCount(21);
 await expect(page.locator('.league-gap')).toBeVisible();
 await expect(page.locator('.league-row.mine .league-rank')).toHaveText('٢٦');
});

test('showing my name and photo is my choice, off until I turn it on',async({page})=>{
 await openPreview(page);await seedLeague(page,{mine:30});
 const box=page.locator('[data-change="league-name"]');
 await expect(box).not.toBeChecked();
 expect(await page.evaluate(()=>demoState().publicProfiles.t1)).toBeUndefined();
 await box.check();
 await expect(page.locator('#toast')).toContainText('صار اسمك يظهر');
 expect(await page.evaluate(()=>demoState().publicProfiles.t1)).toEqual({name:'مختبر 1',consent:true});
 await expect(page.locator('.league-row.mine strong')).toHaveText('مختبر 1 (أنت)');
 await page.locator('[data-change="league-name"]').uncheck();
 await expect(page.locator('#toast')).toContainText('مخفي');
 expect(await page.evaluate(()=>demoState().publicProfiles.t1.consent)).toBe(false);
 await expect(page.locator('.league-row.mine strong')).toHaveText('أنت');
});

test('equal points share a rank in the list',async({page})=>{
 await openPreview(page);await seedLeague(page,{others:2,mine:90});
 // o0 100, o1 90, mine 90.
 await expect(page.locator('.league-row .league-rank')).toHaveText(['١','٢','٢']);
 await expect(page.locator('.league-row .sample-tag')).toHaveCount(0);
});

test('an empty day invites the first accepted report',async({page})=>{
 await openPreview(page);await seedLeague(page,{others:0});
 await expect(page.locator('.league .empty')).toContainText('ماكو نقاط موثّقة اليوم');
 await page.locator('[data-action="league-kind"][data-id="week"]').click();
 await expect(page.locator('.league .empty')).toContainText('ماكو نقاط موثّقة هذا الأسبوع');
});

test('a volunteer with no app of their own joins the league after an accepted report',async({page})=>{
 await openPreview(page);
 await page.evaluate(async joined=>{
  resetDemo();const d=demoState();
  d.projects.push({id:'lg',name:'League App',link:'https://play.google.com/apps/testing/com.example.lg',ownerUid:'d1',ownerName:'مطور تجريبي',created:joined});
  d.assignments=d.assignments.filter(a=>a.testerUid!=='t1');
  d.assignments.unshift({id:'lg_t1',projectId:'lg',testerUid:'t1',ownerUid:'d1',name:'League App',link:'https://play.google.com/apps/testing/com.example.lg',invitationStatus:'accepted',joinedDay:joined,checkins:[]});
  save(d);user=await api.switchDemo('tester');tab='home';await refresh();
 },utcDaysAgo(1));
 expect(await page.evaluate(()=>demoState().projects.some(p=>p.ownerUid==='t1'))).toBe(false);
 await page.locator('#daily-report-form label.ok').click();
 await page.locator('#daily-report-form textarea').fill('جرّبت التسجيل وفتح الحساب واشتغل');
 await page.locator('#daily-report-form button[type="submit"]').click();
 await expect(page.locator('.daily-test.saved')).toBeVisible();
 await page.evaluate(async()=>{user=await api.switchDemo('developer');await refresh();selectedProjectId='lg';tab='details';render()});
 await page.locator('.report-record').first().locator('[data-decision="accepted"]').click();
 await expect(page.locator('#toast')).toContainText('XP');
 await page.evaluate(async()=>{user=await api.switchDemo('tester');tab='home';await refresh()});
 await page.locator('.nav [data-tab="profile"]').click();await page.locator('.shortcuts [data-tab="rewards"]').click();
 await expect(page.locator('.league-row.mine')).toContainText('١٠ XP');
 await expect(page.locator('.badge-row')).toContainText('أول تقرير مقبول');
});

test('developers reach the same league from the menu',async({page})=>{
 await openPreview(page);await seedLeague(page,{mine:10});
 await page.evaluate(async()=>{user=await api.switchDemo('developer');tab='home';await refresh()});
 await page.locator('[data-action="open-menu"]').click();
 await page.locator('[data-action="menu-tab"][data-target="rewards"]').click();
 await expect(page.locator('.league')).toContainText('دوري المساهمين');
 await expect(page.locator('.league-row').first()).toBeVisible();
});

test('league fits a phone screen and the last control is above the bottom bar',async({page})=>{
 await openPreview(page);await seedLeague(page,{others:20,mine:5,names:Object.fromEntries(Array.from({length:20},(_,i)=>['o'+i,{name:'اسم طويل جداً للمساهم رقم '+i}]))});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
 const last=page.locator('.league-name');await last.scrollIntoViewIfNeeded();
 const [box,nav]=await Promise.all([last.boundingBox(),page.locator('.nav').boundingBox()]);
 if(nav)expect(box.y+box.height).toBeLessThanOrEqual(nav.y+1);
 for(const b of await page.locator('.segmented button').all())expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(38);
});
