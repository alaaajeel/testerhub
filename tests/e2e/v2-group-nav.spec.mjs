import {test,expect} from '@playwright/test';

async function openAs(page,role='tester'){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');
 await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async r=>{resetDemo();user=await api.switchDemo(r);await refresh();tab='home';render()},role);
}

test('Google Group is available to developer and tester without relying on individual email lists',async({page})=>{
 for(const role of ['tester','developer']){
  await openAs(page,role);
  await page.locator('.nav [data-tab="groups"]').click();
  const guide=page.locator('.official-google-group').first();
  await expect(guide).toBeVisible();
  await expect(guide.locator('a[href="https://groups.google.com/g/testerhubiq"]')).toBeVisible();
  if(role==='developer'){
   await expect(guide).toContainText('testerhubiq@googlegroups.com');
   await expect(guide.locator('[data-action="copy-group-email"]')).toBeVisible();
  }else{
   await expect(guide).toContainText('المجموعة وحدها ما تكفي');
  }
 }
});

test('developer app form defaults to Google Group but still preserves actual tester invitation flow',async({page})=>{
 await openAs(page,'developer');
 await page.locator('.nav [data-tab="home"]').click();
 await page.locator('.home-add').click();
 await expect(page.locator('#project-group')).toHaveValue('https://groups.google.com/g/testerhubiq');
 await expect(page.locator('#project-form [data-action="copy-group-email"]')).toContainText('نسخ');
 await expect(page.locator('#project-form [name="confirmed"]')).toBeVisible();
 await expect(page.locator('#project-form [data-action="copy-emails"]')).toBeVisible();
});

test('bottom navigation remains anchored when inner content scrolls on a small phone',async({page})=>{
 await page.setViewportSize({width:360,height:640});
 await openAs(page,'tester');
 await page.locator('.nav [data-tab="profile"]').click();
 const before=await page.evaluate(()=>{
  const app=document.querySelector('.device #app'),nav=app.querySelector('nav.nav'),main=app.querySelector('main.page');
  const rect=nav.getBoundingClientRect(),outer=app.getBoundingClientRect();
  return {navTop:rect.top,navBottom:rect.bottom,appBottom:outer.bottom,clientHeight:main.clientHeight};
 });
 const after=await page.evaluate(()=>{
  const app=document.querySelector('.device #app'),nav=app.querySelector('nav.nav'),main=app.querySelector('main.page');
  const tall=document.createElement('div');tall.style.height='1500px';tall.setAttribute('data-testid','scroll-probe');main.append(tall);
  main.scrollTop=main.scrollHeight;
  const rect=nav.getBoundingClientRect(),outer=app.getBoundingClientRect();
  return {navTop:rect.top,navBottom:rect.bottom,appBottom:outer.bottom,scrollTop:main.scrollTop};
 });
 expect(after.scrollTop).toBeGreaterThan(200);
 expect(Math.abs(after.navTop-before.navTop)).toBeLessThan(2);
 expect(Math.abs(after.navBottom-after.appBottom)).toBeLessThan(3);
});
