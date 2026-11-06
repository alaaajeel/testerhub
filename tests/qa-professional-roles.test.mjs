import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const html=read('index.html')+read('src/services/accounts.js'),rules=read('firestore.rules'),sw=read('sw.js');
const manifest=JSON.parse(read('manifest.webmanifest'));

describe('QA-01 | Android PWA and branding',()=>{
 it('installs as an RTL standalone app with the appropriate icon choices',()=>{
  assert.match(html,/<html lang="ar" dir="rtl">/);
  assert.equal(manifest.display,'standalone');
  assert.ok(manifest.icons.some(x=>x.sizes==='192x192'));
  assert.ok(manifest.icons.some(x=>x.sizes==='512x512'));
  assert.ok(manifest.icons.some(x=>x.purpose==='maskable'));
 });
 it('uses real PNGs whose headers agree with their dimensions',()=>{
  for(const [name,size] of [['icon-180.png',180],['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512]]){
   const path='assets/'+name;
   assert.ok(existsSync(new URL('../'+path,import.meta.url)));
   const data=readFileSync(new URL('../'+path,import.meta.url));
   assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   assert.equal(data.readUInt32BE(16),size);
   assert.equal(data.readUInt32BE(20),size);
  }
 });
 it('shares branding across launcher, favicon, entry screen, header and splash',()=>{
  assert.match(html,/brand-icon\.svg/);
  assert.match(html,/brand-lockup\.svg/);
  assert.match(html,/class="splash-logo"/);
  assert.match(html,/link rel="icon"/);
  assert.match(html,/link rel="apple-touch-icon"/);
 });
 it('caches its complete local app shell for repeat launches',()=>{
  for(const asset of ['./index.html','./firebase-config.js','./manifest.webmanifest','./splash.css','./assets/brand-icon.svg','./assets/brand-lockup.svg'])
   assert.ok(sw.includes("'"+asset+"'"),'Missing cache entry '+asset);
  assert.match(sw,/self\.addEventListener\('fetch'/);
 });
});

describe('QA-02 | Mobile UX and accessibility',()=>{
 it('has screen-size layouts and Android minimum touch target sizing',()=>{
  assert.match(html,/@media ?\(max-width:830px\)/);
  assert.match(html,/min-height:44px/);
  assert.match(html,/viewport-fit=cover/);
 });
 it('has safe-area bottom navigation and visible focused controls',()=>{
  assert.match(html,/safe-area-inset-bottom/);
  assert.match(html,/:focus-visible/);
  assert.match(html,/aria-label="التنقل الرئيسي"/);
 });
 it('handles reduced motion and closes navigation and notification overlays',()=>{
  assert.match(read('splash.css'),/prefers-reduced-motion/);
  assert.match(html,/data-action="close-menu"/);
  assert.match(html,/data-action="close-notices"/);
  assert.match(html,/event\.key==='Escape'/);
 });
 it('keeps snackbar messages out of the fixed bottom navigation',()=>{
  assert.match(html,/#toast\{top:calc\(153px/);
  assert.match(html,/bottom:auto!important/);
  assert.match(html,/toastEl\.classList\.remove\('show'\)/);
 });
});

describe('QA-03 | Registration, accounts, authorization',()=>{
 it('contains role-specific Firebase Authentication flows',()=>{
  assert.match(html,/createUserWithEmailAndPassword/);
  assert.match(html,/signInWithEmailAndPassword/);
  assert.match(html,/auth\.authStateReady\(\)/);
 });
 it('restricts profiles and projects to their owners or authorized developers',()=>{
  assert.match(rules,/function self\(uid\)/);
  assert.match(rules,/match \/users\/\{uid\}/);
  assert.match(rules,/resource\.data\.ownerUid == request\.auth\.uid/);
  assert.doesNotMatch(rules,/allow read, write: if true/);
 });
 it('rejects missing tester user IDs before creating assignments',()=>{
  assert.match(html,/typeof tester\.uid!=='string'/);
  assert.match(html,/seenTesterUids\.has\(tester\.uid\)/);
  assert.match(rules,/request\.resource\.data\.testerUid/);
 });
 it('prevents anonymous mutation of reports and messages',()=>{
  assert.match(rules,/match \/reports\/\{reportId\}/);
  assert.match(rules,/match \/messages\/\{messageId\}/);
  assert.match(rules,/request\.resource\.data\.senderUid == request\.auth\.uid/);
  assert.match(rules,/allow update, delete: if false/);
 });
});

describe('QA-04 | Closed test and daily feedback',()=>{
 it('has a controlled join flow and respects the 14-day review period',()=>{
  assert.match(html,/async function confirmJoin/);
  assert.match(rules,/checkins\.size\(\) <= 14/);
  assert.match(html,/daysSince\(a\.joinedDay\)>14/);
 });
 it('requires a meaningful test report with problem details when needed',()=>{
  assert.match(html,/function validateDailyReport\(/);
  assert.match(html,/validateDailyReport\(input\|\|\{\}\)/);
  assert.match(html,/notes\.length<10/);
  assert.match(html,/taskForDay\(a\)/);
  assert.match(html,/notes\.length>800/);
 });
 it('updates the assignment and creates a report in one Firestore transaction',()=>{
  assert.match(html,/runTransaction\(db/);
  assert.match(html,/txn\.set\(reportRef/);
  assert.match(html,/txn\.update\(ref/);
  assert.match(rules,/getAfter\(/);
  assert.doesNotMatch(html,/txn\.get\(reportRef\)/);
 });
 it('never automatically marks a daily report as completed on launching the link',()=>{
  assert.match(html,/function joinLink\(a,destination=/);
  assert.match(html,/url\.hostname!=='play\.google\.com'/);
  assert.match(html,/data-action="write-report"/);
 });
});

describe('QA-05 | Real-time messaging and truthful reminders',()=>{
 it('gets authoritative server data before claiming there is no test today',()=>{
  assert.match(html,/getDocsFromServer/);
  assert.match(html,/getDashboard\(\{fromServer:!api\.isDemo\}\)/);
  assert.match(html,/ما نكدر نأكد أنه ما عندك مهام اليوم/);
 });
 it('distinguishes new assignments, due tests, completed tests and cooldown',()=>{
  assert.match(html,/function classifyTesterWork\(/);
  for(const key of ['invites','due','completed','cooldown','expired'])assert.ok(html.includes('state.'+key));
  assert.match(html,/14\*3600000/);
 });
 it('subscribes to Firestore changes and cleans up listeners when signing out',()=>{
  assert.match(html,/storeFns\.onSnapshot\(/);
  assert.match(html,/\['messages','testerUid'\]/);
  assert.match(html,/\['assignments','testerUid'\]/);
  assert.match(html,/stopLiveSync\(\);await api\.logout/);
 });
 it('uses Android Service Worker notifications while the PWA is running',()=>{
  assert.match(html,/registration\.showNotification/);
  assert.doesNotMatch(html,/new Notification\(/);
  assert.match(sw,/notificationclick/);
  assert.match(html,/Notification\.permission==='granted'/);
 });
});
