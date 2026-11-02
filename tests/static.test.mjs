import * as vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const base=join(dirname(fileURLToPath(import.meta.url)),'..');
const load=n=>readFileSync(join(base,n),'utf8');
const html=load('index.html'),rules=load('firestore.rules');
test('HTML and RTL UI',()=>{assert.match(html,/<html lang="ar" dir="rtl">/);assert.match(html,/IBM Plex Sans Arabic/);});
test('PWA manifest and icons',()=>{const m=JSON.parse(load('manifest.webmanifest'));assert.equal(m.display,'standalone');for(const ic of m.icons)assert.ok(existsSync(join(base,ic.src.split('?')[0])));});
test('service worker registered',()=>{assert.match(html,/serviceWorker\.register/);assert.match(load('sw.js'),/install/)});
test('Firebase config linked to TestHubiq',()=>{assert.match(html,/window\.TESTERHUB_FIREBASE_CONFIG/);assert.match(load('firebase-config.js'),/testhubiq-c7711/);});
test('real Firebase Auth and role-based dashboards',()=>{assert.match(html,/createUserWithEmailAndPassword/);assert.match(html,/where\('ownerUid','==',user.uid\)/);assert.match(html,/where\('testerUid','==',user.uid\)/);});
test('daily reports and chat use Firebase reads and writes',()=>{assert.match(html,/runTransaction\(db/);assert.match(html,/collection\(db,'reports'\)/);assert.match(html,/collection\(db,'messages'\)/);});
test('daily report is bound to checkins atomically by rules',()=>{assert.match(rules,/getAfter\(/);assert.match(rules,/match \/reports\//);assert.match(rules,/match \/messages\//);});
test('no service credentials packaged',()=>{assert.doesNotMatch(html,/BEGIN PRIVATE KEY/);assert.doesNotMatch(load('firebase-config.js'),/BEGIN PRIVATE KEY/);});

test('Firebase initialization waits for Auth instance (not SDK namespace)',()=>{
 assert.match(html,/await auth\.authStateReady\(\)/);
 assert.doesNotMatch(html,/a\.authStateReady\(auth\)/);
});

test('tester IDs are populated from Firestore users document IDs',()=>{
 assert.match(html,/const testerProfile=\(doc\)=>\(\{uid:doc\.id,\.\.\.doc\.data\(\)\}\)/);
 assert.match(html,/testers:t\.docs\.map\(testerProfile\)/);
 const expression=html.match(/const testerProfile=(.*);/)[1];
 const {runInNewContext}=vm;
 const tester=runInNewContext('('+expression+')')({id:'test-uid-42',data:()=>({name:'مختبر',role:'tester',email:'tester@example.org',available:true})});
 assert.equal(tester.uid,'test-uid-42');
 assert.equal(tester.role,'tester');
 assert.equal(tester.available,true);
});
test('project creation rejects missing tester IDs before writing project data',()=>{
 const start=html.indexOf('async function createProject(');
 const validation=html.indexOf('seenTesterUids=new Set()',start);
 const write=html.indexOf('await storeFns.setDoc(projectRef',start);
 assert.ok(start>=0 && validation>start && write>validation);
 assert.match(html,/typeof tester\.uid!=='string'/);
 assert.match(html,/seenTesterUids\.has\(tester\.uid\)/);
});
test('Android notifications use ServiceWorkerRegistration, never unsupported Notification constructor',()=>{
 assert.match(html,/registration\.showNotification\(title/);
 assert.match(html,/showPwaNotification\('TesterHub/);
 assert.doesNotMatch(html,/new Notification\(/);
 assert.match(html,/if\(await showPwaNotification/);
});

test('repair missing assignments without resetting progress',()=>{
 assert.match(html,/async function syncProjectAssignments\(projectId\)/);
 assert.match(html,/const missing=eligible\.filter\(t=>!existing\.has\(t\.uid\)\)/);
 assert.match(html,/if\(eligible\.some\(t=>!finalUids\.has\(t\.uid\)\)\)/);
 assert.match(html,/for\(let i=0;i<missing\.length;i\+=8\)/);
 assert.match(html,/data-action="sync-project"/);
 assert.match(html,/data-action="refresh-tests"/);
});
test('new project explicitly attempts and verifies invitations',()=>{
 const start=html.indexOf("async function createProject(");
 const syncCall=html.indexOf("await syncProjectAssignments(projectRef.id)",start);
 const projectWrite=html.indexOf("await storeFns.setDoc(projectRef",start);
 assert.ok(start>=0&&projectWrite>start&&syncCall>projectWrite);
 assert.match(html,/التطبيق انحفظ لكن الدعوات ما وصلت بالكامل/);
});

test('daily check-in does not perform forbidden nonexistent report reads',()=>{
 const start=html.indexOf('async function submitDailyReport(');
 const end=html.indexOf('async function sendMessage(',start);
 const section=html.slice(start,end);
 assert.match(section,/runTransaction\(db/);
 assert.match(section,/txn\.get\(ref\)/);
 assert.doesNotMatch(section,/txn\.get\(reportRef\)/);
 assert.match(section,/txn\.set\(reportRef/);
 assert.match(section,/txn\.update\(ref/);
 assert.match(rules,/match \/reports\//);
 assert.match(rules,/allow create: if signedIn\(\)/);
});

test('mobile native-style drawer has navigation controls',()=>{
 assert.match(html,/function appMenu\(\)/);
 assert.match(html,/data-action="open-menu"/);
 assert.match(html,/data-action="menu-tab"/);
 assert.match(html,/data-action="close-menu"/);
 assert.match(html,/drawerOpen=false;tab=button\.dataset\.target/);
 assert.match(html,/margin-top:0!important/);
 assert.match(html,/\.drawer-overlay\{/);
});

test('animated application splash is integrated with startup',()=>{
 assert.match(html,/id="launch-splash"/);
 assert.match(html,/class="splash-logo"/);
 assert.match(html,/class="splash-check"/);
 assert.match(html,/function finishLaunchSplash\(\)/);
 assert.match(html,/finally\{finishLaunchSplash\(\)\}/);
 assert.match(html,/href="\.\/splash\.css"/);
 assert.match(load('splash.css'),/prefers-reduced-motion/);
 assert.match(load('splash.css'),/@keyframes splashPop/);
 assert.match(load('sw.js'),/splash\.css/);
});
test('application script syntax remains valid',()=>{
 const match=html.match(/<script>\s*([\s\S]*?)<\/script>/);
 assert.ok(match);
 assert.doesNotThrow(()=>new Function(match[1]));
});

test('mobile notifications do not obscure the bottom navigation and auto-dismiss',()=>{
 assert.match(html,/#toast\{top:calc\(153px/);
 assert.match(html,/bottom:auto!important/);
 assert.match(html,/#toast\.show\{opacity:1/);
 assert.match(html,/toastTimer=setTimeout/);
 assert.match(html,/toastEl\.classList\.remove\('show'\)/);
 assert.match(html,/toastEl\.textContent=''/);
});

test('bell verifies actual cloud state before claiming no tests',()=>{
 assert.match(html,/getDocsFromServer/);
 assert.match(html,/api\.getDashboard\(\{fromServer:!api\.isDemo\}\)/);
 assert.match(html,/classifyTesterWork\(primaryAssignments\(\)\)/);
 assert.match(html,/noticeState==='error'/);
 assert.match(html,/ما نكدر نأكد أنه ما عندك مهام اليوم/);
 assert.match(html,/noticeState==='stale'/);
});
test('day status distinguishes invitations, due tests, cool-down and completed reports',()=>{
 const start=html.indexOf('function classifyTesterWork(');
 const end=html.indexOf('function messageIsIncoming(',start);
 assert.ok(start>0 && end>start);
 const source=html.slice(start,end);
 const scope={api:{dayKey:()=> '2026-11-03',daysSince:()=>2},Date};
 const {runInNewContext}=vm;
 const fn=runInNewContext('('+source.trim()+')',scope);
 const arr=[
  {name:'New',joinedDay:null,checkins:[]},
  {name:'Due',joinedDay:'2026-11-02',checkins:[]},
  {name:'Done',joinedDay:'2026-11-02',checkins:['2026-11-03']},
  {name:'Wait',joinedDay:'2026-11-02',checkins:[],lastCheckinAt:{seconds:1793635200}}
 ];
 const output=fn(arr,'2026-11-03',1793635200000+3600000);
 assert.equal(output.invites.length,1);
 assert.equal(output.due.length,1);
 assert.equal(output.completed.length,1);
 assert.equal(output.cooldown.length,1);
});
test('live Firestore listeners update invitations, reports and messages',()=>{
 assert.match(html,/storeFns\.onSnapshot/);
 assert.match(html,/\['assignments','testerUid'\]/);
 assert.match(html,/\['messages','testerUid'\]/);
 assert.match(html,/\['reports','ownerUid'\]/);
 assert.match(html,/stopLiveSync\(\);await api\.logout/);
 assert.match(html,/queueLiveSync\(\)/);
});

test('notification center can be dismissed while cloud verification is loading',()=>{
 const start=html.indexOf("app.addEventListener('click'");
 const finish=html.indexOf("app.addEventListener('change'",start);
 const handlers=html.slice(start,finish);
 const close=handlers.indexOf("if(action==='close-notices')");
 const pending=handlers.indexOf("pending(async()=>");
 assert.ok(close>0 && pending>close);
 assert.match(handlers,/if\(action==='notice'\|\|action==='sync-notices'\)/);
});

test('updated brand covers home icon, browser favicon, login, desktop wordmark and splash',()=>{
 assert.match(html,/assets\/brand-icon\.svg/);
 assert.match(html,/assets\/brand-lockup\.svg/);
 assert.match(html,/identity-2/);
 assert.match(html,/class="splash-check"/);
 assert.match(load('manifest.webmanifest'),/icon-maskable-512/);
 assert.match(load('sw.js'),/brand-lockup\.svg/);
});
