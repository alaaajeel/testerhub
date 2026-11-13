import {test,expect} from '@playwright/test';
// V2 exchange packs in the on-device demo store. Real permissions are proven in tests/emulator/packs.rules.test.mjs.

async function open(page,role='tester'){
 await page.clock.install();
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await page.clock.runFor(3000);await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async role=>{resetDemo();try{localStorage.removeItem('th-pack-away')}catch{}navigator.clipboard.writeText=async t=>{window.copied=t};user=await api.switchDemo(role);await refresh();tab='groups';V2.groupView='mine';render()},role);
}
const setHidden=(page,hidden)=>page.evaluate(h=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>h});document.dispatchEvent(new Event('visibilitychange'))},hidden);

test('«مجموعتي» like the preview: day, progress, warnings and the 15 apps of the others',async({page})=>{
 await open(page);
 const hero=page.locator('.v2-hero');
 await expect(hero).toContainText('مجموعة #1 · 16 عضو');
 await expect(hero).toContainText('اليوم 6 من 16');
 await expect(hero).toContainText('اختبرت 0 من 15 تطبيق اليوم');
 await expect(hero).toContainText('وأكد 11 من 15 أعضاء اختبار تطبيقك اليوم');
 await expect(page.locator('.v2-strikes span')).toHaveCount(3);
 await expect(page.locator('.v2-pack-app')).toHaveCount(15);
 await expect(page.locator('body')).not.toContainText('أكدت إني اختبرت الكل');
 await page.locator('[data-v2="pack-emails"]').click();
 expect((await page.evaluate(()=>window.copied)).split(', ')).toHaveLength(15);
});

test('an app is confirmed only after it was opened from here and the page was away 30 seconds',async({page})=>{
 await open(page);
 await page.evaluate(()=>{window.open=()=>{}});
 const row=page.locator('.v2-pack-app').first(),box=row.locator('[data-v2="pack-confirm"]');
 await expect(box).toBeDisabled();
 await expect(page.evaluate(()=>packConfirm(dashboard.packs.mine.others[0].uid))).rejects.toThrow(/30 ثانية/);
 await row.locator('[data-v2="pack-open"]').click();
 // Back too soon: still locked.
 await setHidden(page,true);await page.clock.runFor(10000);await setHidden(page,false);
 await expect(box).toBeDisabled();
 await row.locator('[data-v2="pack-open"]').click();
 await setHidden(page,true);await page.clock.runFor(31000);await setHidden(page,false);
 await expect(box).toBeEnabled();
 await box.click();
 await expect(page.locator('.v2-hero')).toContainText('اختبرت 1 من 15 تطبيق اليوم');
 await expect(page.locator('.v2-pack-app').first().locator('.v2-cbox.on')).toHaveCount(1);
 // Only that app: the others stay locked.
 await expect(page.locator('.v2-pack-app').nth(1).locator('[data-v2="pack-confirm"]')).toBeDisabled();
});

test('joining the open pack takes three steps and takes the next seat; leaving before the start frees it',async({page})=>{
 await open(page,'developer');
 await page.locator('.v2-seg [data-k="open"]').click();
 const hero=page.locator('.v2-hero');
 await expect(hero).toContainText('11 من 16 مقعد');
 await expect(hero.locator('.v2-seats i.f')).toHaveCount(11);
 await hero.locator('[data-v2="pack-join-open"]').click();
 const sheet=page.locator('.v2-sheet');
 await expect(sheet.locator('[data-v2="pack-next"]')).toBeDisabled();
 await sheet.locator('[data-v2="pack-pick"][data-id="other"]').click();
 await sheet.locator('#pk-name').fill('تطبيقي');
 await sheet.locator('#pk-link').fill('https://example.com/app');
 await sheet.locator('[data-v2="pack-next"]').click();
 await expect(sheet.locator('#v2-err')).toContainText('play.google.com');
 await sheet.locator('#pk-link').fill('https://play.google.com/apps/testing/com.example.mine');
 await sheet.locator('[data-v2="pack-next"]').click();
 await expect(sheet.locator('[data-v2="pack-next"]')).toBeDisabled();
 await sheet.locator('[data-v2="pack-consent"]').click();
 await sheet.locator('[data-v2="pack-next"]').click();
 await expect(sheet).toContainText('رقم 12 من 16');
 await sheet.locator('[data-v2="pack-join"]').click();
 await expect(page.locator('#toast')).toContainText('انضميت');
 await expect(page.locator('.v2-hero')).toContainText('12 من 16 مقعد');
 await expect(page.locator('.v2-hero')).toContainText('ترتيبك 12');
 await page.locator('[data-v2="pack-leave"]').click();
 await expect(page.locator('#toast')).toContainText('طلعت');
 await page.locator('.v2-seg [data-k="open"]').click();
 await expect(page.locator('.v2-hero')).toContainText('11 من 16 مقعد');
});

test('the 16th member starts the pack and the next one opens',async({page})=>{
 await open(page,'developer');
 await page.evaluate(()=>{const d=demoState();const P=d.packs;for(let i=0;i<4;i++){P.list.p2.memberCount++;P.members.p2.push({uid:'x'+i,name:'x',email:'x@e.com',appName:'X'+i,appLink:'https://play.google.com/apps/testing/x',order:P.list.p2.memberCount,strikes:0,status:'active'})}save(d)});
 await page.evaluate(async()=>{await packJoin({appName:'الأخير',appLink:'https://play.google.com/apps/testing/com.last'});await packRefresh()});
 const P=await page.evaluate(()=>JSON.stringify({p2:demoState().packs.list.p2,meta:demoState().packs.meta}));
 const {p2,meta}=JSON.parse(P);
 expect(p2.status).toBe('running');expect(p2.memberCount).toBe(16);
 expect(meta.openPackId).toBe('p3');
 await page.locator('.v2-seg [data-k="open"]').click();
 await expect(page.locator('.v2-hero')).toContainText('مجموعة #3');
 await expect(page.locator('.v2-hero')).toContainText('0 من 16 مقعد');
 await expect(page.locator('.v2-hero [data-v2="pack-join-open"]')).toHaveCount(0);
});

test('an app name with HTML stays text in the pack',async({page})=>{
 await open(page);
 await page.evaluate(async()=>{const d=demoState();d.packs.members.p1[1].appName='<img src=x onerror="window.pwned=1">';save(d);await refresh();render()});
 await expect(page.locator('.v2-pack-app').first()).toContainText('<img src=x');
 await expect(page.locator('.v2-pack-app img')).toHaveCount(0);
 expect(await page.evaluate(()=>window.pwned)).toBeUndefined();
});
