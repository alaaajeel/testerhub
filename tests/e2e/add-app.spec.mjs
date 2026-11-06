import {test,expect} from '@playwright/test';
// Phase 4: simpler Add Application form and compact tester lists (demo store, 20 seeded testers).

async function openAsDeveloper(page,where='new'){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async where=>{resetDemo();user=await api.switchDemo('developer');await refresh();tab=where;render();window.copied=[];navigator.clipboard.writeText=async t=>{window.copied.push(t)}},where);
}

test('form order: name, prepare card, confirmation, closed link, group link, then the rest',async({page})=>{
 await openAsDeveloper(page);
 const order=await page.evaluate(()=>[...document.querySelectorAll('#project-form > *')].map(n=>n.querySelector('label')?.textContent?.trim()||n.querySelector('strong')?.textContent?.trim()||n.textContent.trim()));
 const at=label=>order.findIndex(x=>x.startsWith(label));
 expect(at('اسم التطبيق')).toBe(0);
 expect(at('تجهيز المختبرين')).toBe(1);
 expect(at('أؤكد أني أضفت الإيميلات إلى Google Play Console')).toBeGreaterThan(1);
 expect(at('رابط الاختبار المغلق')).toBeGreaterThan(at('أؤكد أني'));
 expect(at('رابط مجموعة المختبرين (اختياري)')).toBe(at('رابط الاختبار المغلق')+1);
 expect(at('مهام الاختبار')).toBeGreaterThan(at('رابط مجموعة المختبرين'));
 await expect(page.locator('.prepare-card')).toContainText('انسخ إيميلات المختبرين المتاحين وأضفها إلى Google Play Console.');
 await expect(page.locator('.prepare-card button')).toHaveText([/نسخ جميع الإيميلات/,/تنزيل CSV/]);
 // No names, no emails, no individual selection inside the form.
 await expect(page.locator('#project-form [name="testerUid"]')).toHaveCount(0);
 await expect(page.locator('#project-form')).not.toContainText('@example.com');
 await expect(page.locator('#project-form')).not.toContainText('مختبر 3');
});

test('copy all emails copies every eligible tester in one tap and keeps what was typed',async({page})=>{
 await openAsDeveloper(page);
 await page.locator('#project-name').fill('Typed Name');await page.locator('#project-link').fill('https://play.google.com/apps/testing/com.example.typed');
 await page.locator('[data-action="copy-emails"]').click();
 const [text]=await page.evaluate(()=>window.copied);
 expect(text.split(', ')).toHaveLength(20);
 expect(text).toContain('tester01@example.com');
 await expect(page.locator('.prepared')).toContainText('٢٠');
 await expect(page.locator('#project-name')).toHaveValue('Typed Name');
 await expect(page.locator('#project-link')).toHaveValue('https://play.google.com/apps/testing/com.example.typed');
});

test('CSV is one address per line with nothing else, ready for Play Console',async({page})=>{
 await openAsDeveloper(page);
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="download-csv"]').click()]);
 expect(download.suggestedFilename()).toBe('testerhub-testers.csv');
 const text=await (await download.createReadStream()).toArray().then(chunks=>Buffer.concat(chunks).toString('utf8'));
 const lines=text.trim().split(/\r\n/);
 expect(lines).toHaveLength(20);
 for(const line of lines)expect(line).toMatch(/^tester\d{2}@example\.com$/);
 expect(text).not.toMatch(/مختبر|name|email,/);
 await expect(page.locator('.prepared')).toContainText('٢٠');
});

test('publishing invites exactly the copied list, not testers who became available later',async({page})=>{
 await openAsDeveloper(page);
 await page.locator('#project-name').fill('Prepared App');
 await page.locator('#project-tasks').fill('جرّب تسجيل الدخول');
 await page.locator('#project-link').fill('https://play.google.com/apps/testing/com.example.prepared');
 await page.locator('[data-action="copy-emails"]').click();
 await page.evaluate(()=>{dashboard.testers.push({uid:'late',name:'متأخر',email:'late@example.com',available:true,role:'tester'})});
 await page.locator('[name="confirmed"]').check();
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('#toast')).toContainText('٢٠ دعوة');
 const invited=await page.evaluate(()=>dashboard.assignments.filter(a=>a.projectId===selectedProjectId).map(a=>a.testerUid));
 expect(invited).toHaveLength(20);
 expect(invited).not.toContain('late');
});

test('publishing needs the list prepared (or a group link) and the Play Console confirmation',async({page})=>{
 await openAsDeveloper(page);
 await page.locator('#project-name').fill('Guarded App');
 await page.locator('#project-tasks').fill('جرّب تسجيل الدخول');
 await page.locator('#project-link').fill('https://play.google.com/apps/testing/com.example.guarded');
 await page.locator('[name="confirmed"]').check();
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('#toast')).toContainText('انسخ الإيميلات أو نزّل ملف CSV');
 await page.locator('[data-action="copy-emails"]').click();
 await page.locator('[name="confirmed"]').uncheck();
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('#toast')).toContainText('أكد أنك أضفت الإيميلات');
 expect(await page.evaluate(()=>dashboard.projects.some(p=>p.name==='Guarded App'))).toBe(false);
 // A Google Group link replaces the email list.
 await page.locator('#project-group').fill('https://groups.google.com/g/guarded-testers');
 await page.evaluate(()=>{preparedTesters=null;render()});
 await page.locator('#project-name').fill('Guarded App');await page.locator('#project-tasks').fill('جرّب تسجيل الدخول');
 await page.locator('#project-link').fill('https://play.google.com/apps/testing/com.example.guarded');
 await page.locator('#project-group').fill('https://groups.google.com/g/guarded-testers');
 await page.locator('[name="confirmed"]').check();
 await page.locator('#project-form button[value="publish"]').click();
 await expect(page.locator('.lead',{hasText:'Guarded App'})).toBeVisible();
});

test('a draft saves without testers or confirmation',async({page})=>{
 await openAsDeveloper(page);
 await page.locator('#project-name').fill('Only A Draft');
 await page.locator('#project-form button[value="draft"]').click();
 await expect(page.locator('#toast')).toContainText('تم حفظ المسودة');
 expect(await page.evaluate(()=>dashboard.assignments.filter(a=>a.projectId===selectedProjectId).length)).toBe(0);
});

test('tester directory: compact rows without emails, details open with chat and copy',async({page})=>{
 await openAsDeveloper(page,'testers');
 const rows=page.locator('.tester-list .tester-row');
 await expect(rows).toHaveCount(20);
 await expect(page.locator('.tester-list')).not.toContainText('@example.com');
 await expect(rows.first().locator('.avatar')).toBeVisible();
 const box=await rows.first().boundingBox();expect(box.height).toBeLessThan(80);expect(box.height).toBeGreaterThanOrEqual(44);
 // t1 tests the developer's demo app, so its details offer the conversation.
 await page.locator('.tester-row[data-id="t1"]').click();
 await expect(page.locator('.tester-head')).toContainText('مختبر 1');
 await expect(page.locator('[data-action="open-chat"]').first()).toBeVisible();
 await page.locator('[data-action="copy-tester-email"]').click();
 expect(await page.evaluate(()=>window.copied.at(-1))).toBe('tester01@example.com');
 await page.locator('.top-link').click();
 await expect(page.locator('.tester-list')).toBeVisible();
});

test('app participants are compact rows with progress, opening the tester details',async({page})=>{
 await openAsDeveloper(page,'home');
 await page.evaluate(()=>{selectedProjectId=dashboard.projects.find(p=>p.ownerUid==='d1'&&p.status!=='draft').id;tab='details';render()});
 const rows=page.locator('.tester-list .tester-row');
 expect(await rows.count()).toBeGreaterThan(0);
 await expect(rows.first().locator('.mini-progress')).toBeVisible();
 await expect(page.locator('.tester-list')).not.toContainText('@');
 await rows.first().click();
 await expect(page.locator('.tester-head')).toBeVisible();
 await expect(page.locator('[data-action="open-chat"]').first()).toBeVisible();
 await page.locator('.top-link').click();
 await expect(page.locator('.section-title',{hasText:'المختبرون المشاركون'})).toBeVisible();
});

test('phone layout: no sideways scroll and buttons stay touch-friendly',async({page})=>{
 for(const where of ['new','testers']){
  await openAsDeveloper(page,where);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
 }
 await openAsDeveloper(page,'new');
 for(const b of await page.locator('.prepare-actions .cta').all())expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
 const publish=page.locator('#project-form button[value="publish"]');await publish.scrollIntoViewIfNeeded();
 const [p,nav]=await Promise.all([publish.boundingBox(),page.locator('.nav').boundingBox()]);
 if(nav)expect(p.y+p.height).toBeLessThanOrEqual(nav.y+1);
});
