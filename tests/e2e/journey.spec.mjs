// Two people, one real test cycle: real UI, real Firebase SDK, real rules, local emulators only.
import {test, expect, devices} from '@playwright/test';
import {mkdirSync} from 'node:fs';

const PROJECT = 'demo-testerhub', REST = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = {Authorization: 'Bearer owner', 'content-type': 'application/json'};
const SHOTS = process.env.SHOTS || 'test-results/screens';
mkdirSync(SHOTS, {recursive: true});
const stamp = Date.now();
const mail = name => `${name}${stamp}@audit.test`;
const PASSWORD = 'Audit-pass-123';
const phone = {...devices['Pixel 7']};
delete phone.defaultBrowserType;

async function open(browser, options = phone) {
 const context = await browser.newContext({...options, serviceWorkers: 'block', locale: 'ar'});
 const page = await context.newPage();
 page.problems = [];
 page.on('pageerror', e => page.problems.push(e.message));
 page.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) page.problems.push(m.text()); });
 return page;
}
const shot = async (page, name) => {
 await page.locator('#launch-splash').waitFor({state: 'detached'});
 await page.screenshot({path: `${SHOTS}/${name}.png`, fullPage: true});
};

async function verifyEmail(page, email) {
 await expect(page.locator('[data-action=check-verification]')).toBeVisible();
 const {oobCodes} = await (await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/oobCodes`)).json();
 const code = oobCodes.filter(x => x.email === email && x.requestType === 'VERIFY_EMAIL').pop();
 expect(code, 'signup sends the verification email automatically').toBeTruthy();
 await fetch(code.oobLink);
 await page.click('[data-action=check-verification]');
}

async function signup(page, {name, email, role}) {
 await page.goto('/?emulator=1#/signup/' + role);
 await page.fill('#auth-name', name);
 await page.fill('#auth-email', email);
 const other = role === 'developer' ? 'tester' : 'developer';
 await page.click(`[data-signup-role=${other}]`);
 await expect(page.locator('#auth-name'), 'typed values survive switching the account type').toHaveValue(name);
 await expect(page.locator('#auth-email')).toHaveValue(email);
 await page.click(`[data-signup-role=${role}]`);
 await page.fill('#auth-password', PASSWORD);
 await page.check('input[name=terms]');
 await page.click('#auth-form button[type=submit]');
 await verifyEmail(page, email);
 await expect(page.locator('.nav')).toBeVisible();
}

async function write(path, fields) {
 const mask = Object.keys(fields).map(k => 'updateMask.fieldPaths=' + k).join('&');
 const res = await fetch(`http://127.0.0.1:8080/v1/${path}?${mask}`, {method: 'PATCH', headers: owner, body: JSON.stringify({fields})});
 expect(res.ok).toBeTruthy();
}
async function findDoc(collection, field, value) {
 const {documents = []} = await (await fetch(`${REST}/${collection}?pageSize=200`, {headers: owner})).json();
 return documents.find(d => d.fields[field]?.stringValue === value);
}
test('landing explains the product and sets honest limits on phone and desktop', async ({browser}) => {
 for (const [name, options] of [['phone', phone], ['desktop', {viewport: {width: 1366, height: 800}}]]) {
  const page = await open(browser, options);
  await page.goto('/?emulator=1');
  await expect(page.locator('h1').first()).toContainText('اختبار حقيقي');
  await expect(page.locator('body')).toContainText('ولا تضمن قبول أي تطبيق');
  await expect(page.locator('body')).not.toContainText('وضع المعاينة');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await shot(page, `01-landing-${name}`);
  expect(page.problems).toEqual([]);
 }
});

test('full cycle between a developer and two testers', async ({browser}) => {
 const dev = await open(browser), t1 = await open(browser), t2 = await open(browser), t3 = await open(browser);
 const devEmail = mail('dev'), t1Email = mail('sara'), t2Email = mail('ali'), t3Email = mail('layla');

 await test.step('accounts', async () => {
  await signup(t1, {name: 'سارة أحمد', email: t1Email, role: 'tester'});
  await signup(t2, {name: 'علي حسن', email: t2Email, role: 'tester'});
  await signup(t3, {name: 'ليلى كريم', email: t3Email, role: 'tester'});
  await signup(dev, {name: 'مطور التوصيل', email: devEmail, role: 'developer'});
  await shot(t1, '02-tester-empty');
  await shot(dev, '03-dev-empty');
 });

 await test.step('developer drafts, cannot publish incomplete, then publishes', async () => {
  await dev.click('.nav a[href="#/new"]');
  await dev.fill('#project-form [name=name]', 'تطبيق التوصيل');
  await dev.click('button[value=draft]');
  await expect(dev.locator('body')).toContainText('هذه المسودة لا يراها أحد');
  await dev.click('a:has-text("إكمال ونشر")');
  await dev.click('button[value=publish]');
  await expect(dev.locator('#toast')).toContainText('رابط الاختبار المغلق مطلوب');
  await dev.fill('#project-form [name=link]', 'https://play.google.com/apps/testing/com.audit.delivery');
  await dev.fill('#project-form [name=description]', 'تطبيق لطلب الطعام من مطاعم المدينة');
  await dev.fill('#project-form [name=tasks]', 'سجّل الدخول بحسابك\nابحث عن مطعم واطلب وجبة');
  await shot(dev, '04-dev-project-form');
  await dev.click('button[value=publish]');
  await expect(dev.locator('h1')).toContainText('تطبيق التوصيل');
  await expect(dev.locator('body')).toContainText('يستقبل المختبرين');
 });

 await test.step('testers discover the app and apply; email goes only to this developer', async () => {
  for (const [page, email, device] of [[t1, t1Email, 'Samsung A54'], [t2, t2Email, ''], [t3, t3Email, '']]) {
   await page.click('.nav a[href="#/explore"]');
   await expect(page.locator('.listing')).toContainText('تطبيق التوصيل');
   await page.click('.listing a');
   await expect(page.locator('#apply-form')).toBeVisible();
   await expect(page.locator('[name=email]')).toHaveValue(email);
   if (device) await page.fill('[name=device]', device);
   await page.check('[name=consent]');
   if (page === t1) await shot(page, '05-tester-apply');
   await page.click('#apply-form button[type=submit]');
   await expect(page.locator('body')).toContainText('طلبك قيد المراجعة');
  }
 });

 await test.step('developer reviews live, rejects one, approves one', async () => {
  await expect(dev.locator('body')).toContainText('طلبات جديدة', {timeout: 15000});
  await expect(dev.locator('body')).not.toContainText(t1Email);
  await shot(dev, '06-dev-applications');
  await dev.locator('.person', {hasText: 'علي حسن'}).locator('[data-value=reject]').click();
  await dev.locator('.person', {hasText: 'سارة أحمد'}).locator('[data-value=approve]').click();
  await expect(dev.locator('.emails')).toContainText(t1Email);
  await dev.locator('.person', {hasText: 'ليلى كريم'}).locator('[data-value=approve]').click();
  await expect(dev.locator('.emails')).toContainText(t3Email);
  await expect(dev.locator('.emails')).not.toContainText(t2Email);
 });

 await test.step('tester waits until the developer confirms the Play Console addition', async () => {
  await t1.click('.nav a[href="#/home"]');
  await expect(t1.locator('body')).toContainText('يضيف بريدك في Play Console', {timeout: 15000});
  await expect(t1.locator('[data-action=start-test]')).toHaveCount(0);
  await dev.click('[data-action=mark-play]');
  await dev.click('dialog button[value=ok]');
  await expect(dev.locator('.emails')).toHaveCount(0);
  await expect(t1.locator('[data-action=start-test]')).toBeVisible({timeout: 15000});
  await shot(t1, '07-tester-setup');
 });

 const id = (await findDoc('assignments', 'testerName', 'سارة أحمد')).name.split('/').pop();

 await test.step('a clean report needs no invented text and cannot repeat the same day', async () => {
  await t3.click('.nav a[href="#/home"]');
  await t3.click('[data-action=start-test]', {timeout: 15000});
  await t3.click('dialog button[value=ok]');
  await t3.click('a:has-text("جرّبت التطبيق")');
  await t3.check('[name=honest]');
  await shot(t3, '09-report-form');
  await t3.click('#report-form button[type=submit]');
  await expect(t3.locator('body')).toContainText('سجّلت تقرير اليوم');
  await expect(t3.locator('a:has-text("جرّبت التطبيق")')).toHaveCount(0);
  await t3.goto('/?emulator=1#/report/' + id.split('_')[0] + '_' + 'nope');
  await expect(t3.locator('body')).toContainText('الاختبار غير موجود');
 });

 await test.step('tester files a structured bug: vague reports are refused', async () => {
  await t1.click('[data-action=start-test]');
  await t1.click('dialog button[value=ok]');
  await expect(t1.locator('.strip')).toBeVisible();
  await expect(t1.locator('body')).toContainText('سجّل الدخول بحسابك');
  await shot(t1, '08-tester-due');
  await t1.click('a:has-text("جرّبت التطبيق")');
  await t1.locator('.outcomes label', {hasText: 'وجدت مشكلة'}).click();
  await t1.check('[name=honest]');
  await t1.fill('#issue-notes', 'تظهر شاشة بيضاء بعد الضغط على الطلب');
  await t1.click('#report-form button[type=submit]');
  await expect(t1.locator('#toast')).toContainText('خطوات إعادة المشكلة');
  await t1.fill('[name=steps]', 'افتح مطعماً ثم اضغط اطلب الآن');
  await t1.locator('.outcomes label', {hasText: 'تمنع الاستخدام'}).click();
  await shot(t1, '09b-bug-form');
  await t1.click('#report-form button[type=submit]');
  await expect(t1.locator('body')).toContainText('سجّلت تقرير اليوم');
 });

 await test.step('bug lifecycle: developer fixes, the finder confirms', async () => {
  const issue = dev.locator('.issue', {hasText: 'شاشة بيضاء'});
  await expect(issue).toContainText('افتح مطعماً', {timeout: 15000});
  await expect(issue).toContainText('تمنع الاستخدام');
  await expect(dev.locator('.issue')).toHaveCount(1);
  await issue.locator('[data-value=fixed]').click();
  await expect(issue).toContainText('بانتظار التأكيد');
  await expect(t1.locator('.retest')).toContainText('شاشة بيضاء', {timeout: 15000});
  await shot(t1, '10b-retest');
  await t1.locator('.retest [data-value=verified]').click();
  await expect(t1.locator('.retest')).toHaveCount(0);
  await expect(issue).toContainText('تأكد الإصلاح', {timeout: 15000});
 });

 await test.step('developer sees named participants, never a raw identifier', async () => {
  await expect(dev.locator('body')).toContainText('سارة أحمد', {timeout: 15000});
  await expect(dev.locator('body')).not.toContainText(id.split('_').pop());
  await shot(dev, '10-dev-project');
 });

 await test.step('chat works both ways, live', async () => {
  await dev.locator('.person', {hasText: 'سارة أحمد'}).locator('a:has-text("مراسلة")').click();
  await dev.fill('#message-body', 'شكراً لمشاركتك، هل التطبيق بطيء عندك؟');
  await dev.click('#chat-form button[type=submit]');
  await expect(dev.locator('.thread')).toContainText('شكراً لمشاركتك');
  await t1.goto('/?emulator=1#/chat/' + id);
  await expect(t1.locator('.thread')).toContainText('شكراً لمشاركتك', {timeout: 15000});
  await t1.fill('#message-body', 'لا، يعمل بسرعة جيدة');
  await t1.click('#chat-form button[type=submit]');
  await expect(dev.locator('.thread')).toContainText('يعمل بسرعة جيدة', {timeout: 15000});
  await shot(dev, '11-chat');
 });

 await test.step('summary is built from recorded data and states its limits', async () => {
  await dev.goBack();
  await dev.click('a:has-text("ملخص الاختبار")');
  await expect(dev.locator('#summary-text')).toContainText('تطبيق التوصيل');
  await expect(dev.locator('#summary-text')).toContainText('ليست تحققاً من Google Play');
  await shot(dev, '12-summary');
 });

 await test.step('tester record and mode switch', async () => {
  await t1.click('.nav a[href="#/record"]');
  await expect(t1.locator('.stats')).toBeVisible();
  await shot(t1, '13-tester-record');
  await t2.click('.nav a[href="#/profile"]');
  await t2.click('[data-action=switch-role]');
  await t2.click('dialog button[value=ok]');
  await expect(t2.locator('.nav a[href="#/new"]')).toBeVisible();
  await shot(t2, '14-mode-switched');
 });

 await test.step('suspension is explained, not disguised as a network error', async () => {
  const user = await findDoc('users', 'email', t2Email);
  await write(user.name, {suspended: {booleanValue: true}});
  await t2.reload();
  await expect(t2.locator('body')).toContainText('هذا الحساب موقوف', {timeout: 15000});
  await expect(t2.locator('body')).not.toContainText('تحقق من الإنترنت');
  await shot(t2, '15-suspended');
 });

 await test.step('offline: nothing is claimed as saved', async () => {
  await t1.goto('/?emulator=1#/profile');
  await expect(t1.locator('#profile-form')).toBeVisible();
  await t1.context().setOffline(true);
  await t1.evaluate(() => dispatchEvent(new Event('offline')));
  await expect(t1.locator('#offline')).toBeVisible();
  await t1.fill('[name=name]', 'اسم جديد');
  await t1.click('#profile-form button[type=submit]');
  await expect(t1.locator('#toast')).not.toContainText('حُفظ', {timeout: 3000});
  await t1.context().setOffline(false);
 });

 for (const page of [dev, t1]) expect(page.problems.filter(p => !/offline|unavailable|network/i.test(p))).toEqual([]);
});

test('desktop app uses a real layout instead of a phone frame', async ({browser}) => {
 const page = await open(browser, {viewport: {width: 1366, height: 800}});
 const email = mail('desktop');
 await signup(page, {name: 'مطور الحاسوب', email, role: 'developer'});
 await expect(page.locator('.device')).toHaveCount(0);
 // Live updates re-render the shell, so measure in one step inside the page.
 await expect.poll(() => page.evaluate(() => document.querySelector('.nav')?.getBoundingClientRect().width)).toBeLessThan(260);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await shot(page, '16-desktop-dev');
});

test('admin console: gate, moderation, audit trail', async ({browser}) => {
 const admin = await open(browser, {viewport: {width: 1280, height: 860}}), user = await open(browser);
 const adminEmail = mail('boss'), userEmail = mail('member');
 await signup(user, {name: 'عضو عادي', email: userEmail, role: 'tester'});
 await user.goto('/admin.html?emulator=1');
 await expect(user.locator('#gate')).toContainText('لا يملك صلاحية', {timeout: 15000});
 await signup(admin, {name: 'مدير المنصة', email: adminEmail, role: 'developer'});
 const adminDoc = await findDoc('users', 'email', adminEmail);
 const adminUid = adminDoc.name.split('/').pop();
 await write(`projects/${PROJECT}/databases/(default)/documents/adminRoles/${adminUid}`, {active: {booleanValue: true}});
 await admin.goto('/admin.html?emulator=1');
 await expect(admin.locator('#metrics .stat').first()).toBeVisible({timeout: 15000});
 await shot(admin, '17-admin-overview');
 await admin.click('[data-tab=users]');
 await admin.fill('#search [name=email]', userEmail);
 await admin.click('#search button');
 await expect(admin.locator('.admin-item')).toHaveCount(1, {timeout: 10000});
 await admin.click('[data-action=suspend]');
 await admin.click('dialog button[value=ok]');
 await expect(admin.locator('.admin-item')).toContainText('موقوف', {timeout: 10000});
 await admin.click('[data-tab=adminAuditLogs]');
 await expect(admin.locator('#items')).toContainText('إيقاف حساب', {timeout: 10000});
 await shot(admin, '18-admin-audit');
 await admin.click('[data-tab=flags]');
 await admin.click('[data-tab=deletionRequests]');
 await admin.click('[data-tab=projects]');
 await admin.click('[data-tab=issues]');
 await expect(admin.locator('#listTitle')).toContainText('مشكلات');
 expect(admin.problems).toEqual([]);
});

// The Auth emulator's own sign-in page stands in for Google's; the app's popup code is the real one.
async function googlePopup(page, email, name = 'Google Tester') {
 const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('[data-action=google]')]);
 await popup.waitForLoadState();
 await popup.click('#add-account-button');
 await popup.fill('#email-input', email);
 await popup.fill('#display-name-input', name);
 await popup.click('#sign-in');
}

test('Google is the first choice and a new Google user only finishes a profile', async ({browser}) => {
 const page = await open(browser);
 await page.goto('/?emulator=1#/signup/developer');
 await expect(page.locator('[data-action=google]')).toBeVisible();
 await shot(page, 'google-signup');
 await googlePopup(page, mail('googlenew') + '.gmail.com');
 await expect(page.locator('#complete-profile-form')).toBeVisible();
 await expect(page.locator('#complete-profile-form input[name=name]'), 'the name comes from Google').toHaveValue('Google Tester');
 await expect(page.locator('#complete-profile-form select[name=role]'), 'the chosen account type carries over').toHaveValue('developer');
 await shot(page, 'google-complete-profile');
 await page.check('#complete-profile-form input[name=terms]');
 await page.click('#complete-profile-form button[type=submit]');
 await expect(page.locator('.nav'), 'no email verification step after Google').toBeVisible();
 await page.goto('/?emulator=1#/profile');
 await expect(page.getByText('حسابك مرتبط بـ Google')).toBeVisible();
 expect(page.problems).toEqual([]);
});

test('an existing password account signs in with Google and keeps its data', async ({browser}) => {
 const page = await open(browser), email = mail('googleold');
 await signup(page, {name: 'Old Tester', email, role: 'tester'});
 await page.goto('/?emulator=1#/profile');
 await expect(page.locator('[data-action=link-google]')).toBeVisible();
 await shot(page, 'profile-reminders');
 await page.click('[data-action=logout]');
 await expect(page.locator('.intro')).toBeVisible();
 await page.click('a[href="#/login"]');
 await googlePopup(page, email);
 // Firebase either merges the account by itself or asks for the password once.
 const notice = page.locator('.notice');
 await expect(notice.or(page.locator('.nav')).first()).toBeVisible();
 if (await notice.isVisible()) {
  await shot(page, 'google-link-password');
  await expect(page.locator('#auth-email')).toHaveValue(email);
  await page.fill('#auth-password', PASSWORD);
  await page.click('#auth-form button[type=submit]');
 }
 await expect(page.locator('.nav')).toBeVisible();
 await expect(page.getByRole('heading', {name: 'أهلاً Old'}), 'the old profile, not a new one').toBeVisible();
 expect(page.problems).toEqual([]);
});
