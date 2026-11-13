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

test('joining: the Google Group first, a new app (name, developer, icon, link, description), then adding the group to it',async({page})=>{
 await open(page,'developer');
 await page.locator('.v2-seg [data-k="open"]').click();
 const hero=page.locator('.v2-hero');
 await expect(hero).toContainText('11 من 16 مقعد');
 await expect(hero.locator('.v2-seats i.f')).toHaveCount(11);
 await expect(hero.locator('[data-v2="pack-join-open"]')).toContainText('مجاناً');
 await hero.locator('[data-v2="pack-join-open"]').click();
 const sheet=page.locator('.v2-sheet');
 // 1: the Google Group.
 await expect(sheet.locator('a[href="https://groups.google.com/g/testerhubiq"]')).toBeVisible();
 await expect(sheet.locator('[data-v2="pack-next"]')).toBeDisabled();
 await sheet.locator('[data-v2="pack-group-joined"]').click();
 await sheet.locator('[data-v2="pack-next"]').click();
 // 2: a new app, not one of the account's apps.
 await expect(sheet.locator('#pk-dev')).toHaveValue('مطور تجريبي');
 await sheet.locator('#pk-name').fill('تطبيقي');
 await sheet.locator('#pk-link').fill('https://example.com/app');
 await sheet.locator('[data-v2="pack-next"]').click();
 await expect(sheet.locator('#v2-err')).toContainText('play.google.com');
 await sheet.locator('#pk-link').fill('https://play.google.com/apps/testing/com.example.mine');
 await sheet.locator('#pk-desc').fill('تطبيق تجريبي للمجموعة');
 await page.evaluate(()=>{V2.sheet.icon='data:image/png;base64,iVBORw0KGgo='});
 await sheet.locator('[data-v2="pack-next"]').click();
 // 3: add the group to the app in Play Console, commit, and take the seat.
 await expect(sheet).toContainText('testerhubiq@googlegroups.com');
 await expect(sheet).toContainText('مقعدك رقم 12 من 16');
 await expect(sheet).toContainText('دخولك الأول مجاني');
 await expect(sheet.locator('[data-v2="pack-join"]')).toBeDisabled();
 await sheet.locator('[data-v2="pack-group-added"]').click();
 await expect(sheet.locator('[data-v2="pack-join"]')).toBeDisabled();
 await sheet.locator('[data-v2="pack-consent"]').click();
 await sheet.locator('[data-v2="pack-join"]').click();
 await expect(page.locator('#toast')).toContainText('انضميت');
 await expect(page.locator('.v2-hero')).toContainText('12 من 16 مقعد');
 const me=JSON.parse(await page.evaluate(()=>JSON.stringify(demoState().packs.members.p2.find(m=>m.uid==='d1'))));
 expect(me).toMatchObject({appName:'تطبيقي',devName:'مطور تجريبي',appLink:'https://play.google.com/apps/testing/com.example.mine',description:'تطبيق تجريبي للمجموعة',groupAdded:true,paid:0});
 // The app is public on «التطبيقات» for every member of the Google Group.
 await page.locator('.nav [data-tab="home"]').click();
 await expect(page.locator('.v2-appcard[data-id="p2_d1"]')).toContainText('تطبيقي');
 // Leaving before the start gives back the free entry.
 await page.locator('.nav [data-tab="groups"]').click();
 await page.locator('[data-v2="pack-leave"]').click();
 await expect(page.locator('#toast')).toContainText('طلعت');
 expect(await page.evaluate(()=>demoState().packs.coins.d1.freeUsed)).toBe(false);
 // Who left cannot come back to the same pack.
 await page.locator('.v2-seg [data-k="open"]').click();
 await expect(page.locator('.v2-hero button')).toContainText('طلعت من هاي المجموعة');
 await expect(page.locator('.v2-hero button')).toBeDisabled();
 await expect(page.evaluate(()=>packJoin({appName:'رجعة',devName:'مطور',appLink:'https://play.google.com/apps/testing/com.back',groupAdded:true}))).rejects.toThrow(/ما تگدر ترجعلها/);
});

test('coins: the next entry costs 150 and the join button says what is missing',async({page})=>{
 await open(page,'developer');
 await page.evaluate(async()=>{const d=demoState();d.packs.coins.d1={earned:120,spent:0,freeUsed:true};save(d);await refresh();V2.groupView='open';render()});
 await expect(page.locator('.v2-coins')).toContainText('120');
 await page.locator('[data-v2="pack-join-open"]').click();
 const sheet=page.locator('.v2-sheet');
 await sheet.locator('[data-v2="pack-group-joined"]').click();await sheet.locator('[data-v2="pack-next"]').click();
 await sheet.locator('#pk-name').fill('تطبيقي');await sheet.locator('#pk-link').fill('https://play.google.com/apps/testing/com.x');await sheet.locator('[data-v2="pack-next"]').click();
 await sheet.locator('[data-v2="pack-group-added"]').click();await sheet.locator('[data-v2="pack-consent"]').click();
 await expect(sheet).toContainText('تحتاج 30 عملة إضافية');
 await expect(sheet.locator('[data-v2="pack-join"]')).toBeDisabled();
 await expect(page.evaluate(()=>packJoin({appName:'x1',devName:'مطور',appLink:'https://play.google.com/apps/testing/com.x',groupAdded:true}))).rejects.toThrow(/150/);
 await page.evaluate(async()=>{const d=demoState();d.packs.coins.d1.earned=200;save(d);await refresh();render()});
 await expect(sheet.locator('[data-v2="pack-join"]')).toBeEnabled();
 await sheet.locator('[data-v2="pack-join"]').click();
 await expect(page.locator('#toast')).toContainText('انضميت');
 expect(await page.evaluate(()=>demoState().packs.coins.d1.spent)).toBe(150);
});

test('boost: 30 coins puts the app first on «التطبيقات» for 3 days, never twice at once',async({page})=>{
 await open(page);
 await expect(page.locator('.v2-coins').first()).toContainText('64');
 await page.locator('[data-v2="pack-boost"]').click();
 await expect(page.locator('#toast')).toContainText('بأعلى «التطبيقات»');
 await expect(page.locator('.v2-my-card')).toContainText('مميّز');
 expect(await page.evaluate(()=>dashboard.packs.coins.balance)).toBe(34);
 await expect(page.evaluate(()=>packBoost())).rejects.toThrow(/مميّز هسه/);
 await page.locator('.nav [data-tab="home"]').click();
 const first=page.locator('.v2-appcard').first();
 await expect(first).toContainText('مميّز');
 const names=await page.locator('.v2-appcard[data-kind="packapp"]').evaluateAll(n=>n.slice(0,2).map(x=>x.textContent));
 expect(names.join(' ')).toContain('تطبيقي التجريبي');
});

test('the 16th member starts the pack and the next one opens',async({page})=>{
 await open(page,'developer');
 await page.evaluate(()=>{const d=demoState();const P=d.packs;for(let i=0;i<4;i++){P.list.p2.memberCount++;P.members.p2.push({uid:'x'+i,name:'x',email:'x@e.com',appName:'X'+i,appLink:'https://play.google.com/apps/testing/x',order:P.list.p2.memberCount,strikes:0,status:'active'})}save(d)});
 await page.evaluate(async()=>{await packJoin({appName:'الأخير',devName:'مطور',appLink:'https://play.google.com/apps/testing/com.last',groupAdded:true});await packRefresh()});
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

test('taken seats show the members\' app icons',async({page})=>{
 await open(page,'developer');
 await page.evaluate(async()=>{const d=demoState();d.packs.apps.find(c=>c.packId==='p2').icon='data:image/png;base64,iVBORw0KGgo=';save(d);await refresh();V2.groupView='open';render()});
 const seats=page.locator('.v2-hero .v2-seats i');
 await expect(seats).toHaveCount(16);
 await expect(page.locator('.v2-hero .v2-seats i.v2-seat-icon img')).toHaveCount(1);
 await expect(page.locator('.v2-hero .v2-seats i.f')).toHaveCount(11);
 await expect(page.locator('.v2-hero .v2-seats i.v2-seat-letter')).toHaveCount(10);
});
