import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// V2: one account publishes and tests; the approved preview's four sections and three-step sheets.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const views=readFileSync(new URL('../src/v2/views.js',import.meta.url),'utf8');
const from=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));

test('rules: any verified member may own apps; the stored role is no longer a gate',()=>{
 assert.match(rules,/function developer\(\) \{ return verified\(\); \}/);
 // Ownership is still checked on every app document.
 assert.match(rules,/allow update: if developer\(\) && resource\.data\.ownerUid == request\.auth\.uid/);
});
test('the app never refuses an action because of the stored role',()=>{
 const api=html.slice(html.indexOf('async function initialize('),html.indexOf('const api={'));
 assert.doesNotMatch(api,/role!=='developer'|role!=='tester'|active\.role!==sender/);
 assert.doesNotMatch(html,/const screens=user\.role/);
});
test('one dashboard holds both sides, merged without duplicates',()=>{
 const unionById=vm.runInNewContext(from('function unionById(','async function loadTesters(')+';unionById');
 assert.equal(unionById([{id:'a',v:1}],[{id:'b'},{id:'a',v:2}]).map(x=>x.id+(x.v||'')).join(),'a1,b');
 assert.equal(unionById(undefined,[{id:'x'}]).map(x=>x.id).join(),'x');
 const dash=from('async function getDashboard(','function unionById(');
 assert.doesNotMatch(dash,/user\.role==='developer'/);
 // The available-testers list costs reads; it loads only for owners or when adding an app.
 assert.match(dash,/const testers=projects\.length\|\|directoryCache\.docs\?await loadTesters\(user,read,fromServer\):\[\]/);
});
test('chat side comes from the assignment, which the rules check too',()=>{
 const sideOf=vm.runInNewContext(from('function sideOf(','function ownerIssues(')+';sideOf',{user:{uid:'u1'},dashboard:{assignments:[{id:'mine',ownerUid:'u1',testerUid:'u2'},{id:'theirs',ownerUid:'u3',testerUid:'u1'}]}});
 assert.equal(sideOf('mine'),'developer');
 assert.equal(sideOf('theirs'),'tester');
 assert.match(html,/api\.sendMessage\(selectedAssignmentId,String\(f\.get\('message'\)\|\|''\),sideOf\(selectedAssignmentId\)\)/);
});
test('home lists my apps, apps I test and open apps once each, and the filters work',()=>{
 const ctx=vm.createContext({console,Date,Intl,Math,Number,String,Set,Map,
  user:{uid:'u1',name:'علاء'},features:{officialGroup:true},
  dashboard:{assignments:[{id:'p1_u2',projectId:'p1',ownerUid:'u1',testerUid:'u2',joinedDay:'2026-11-01'},{id:'p2_u1',projectId:'p2',ownerUid:'u3',testerUid:'u1',name:'قرآني',joinedDay:null,invitationStatus:'pending'}],
   projects:[{id:'p1',name:'دفتر',ownerUid:'u1',status:'recruiting'}],
   openings:[{id:'p3',name:'سوق',ownerUid:'u4',status:'open',slots:12,updatedAt:new Date().toISOString()},{id:'p1',name:'دفتر',ownerUid:'u1',status:'open'},{id:'p2',name:'قرآني',ownerUid:'u3',status:'open'}],
   joinRequests:[]},
  mineProjects:()=>ctx.dashboard.projects.filter(p=>p.ownerUid==='u1'),
  primaryAssignments:()=>ctx.dashboard.assignments.filter(a=>a.testerUid==='u1'),
  myProjectAssignments:id=>ctx.dashboard.assignments.filter(a=>a.projectId===id),
  trDays:d=>Math.min(14,Math.max(0,d)),currentDay:()=>1,api:{daysSince:()=>3,dayKey:()=>'2026-11-13'},
  clean:s=>String(s??''),ico:()=>'',groupGate:()=>'',classifyTesterWork:()=>({due:[]}),
  document:{addEventListener(){}}});
 vm.runInContext(views,ctx);
 const items=vm.runInContext('v2Catalog()',ctx);
 assert.equal(items.map(x=>x.kind+':'+x.id).join(),'mine:p1,test:p2_u1,open:p3');
 assert.equal(items[0].testers,1);
 const count=f=>vm.runInContext(`V2.filter='${f}';(v2Home().match(/data-v2="open-item"/g)||[]).length`,ctx);
 assert.equal(count('all'),3);
 assert.equal(count('need'),2); // my app under 12 testers + the open app
 assert.equal(count('new'),1);
 assert.equal(count('mine'),1);
});
test('every V2 sheet is three steps and uses the existing checked APIs',()=>{
 assert.match(views,/api\.submitDailyReport\(s\.id,\{outcome:s\.outcome,notes,retestOf:/);
 assert.match(views,/api\.createProject\(\{name:s\.name,link:s\.link,tasks:s\.tasks,group:OFFICIAL_GROUP\.url\},testers\)/);
 assert.match(views,/data-action="accept-invite"/);
 assert.match(views,/data-action="confirm-join"/);
 assert.match(views,/data-action="join-request"/);
 for(const fn of ['v2ReportSheet','v2AddSheet'])assert.match(views,new RegExp('function '+fn+'\\(s\\)\\{[\\s\\S]*?\\$\\{v2n\\(s\\.step\\)\\}/3'));
 // Publishing still respects «اختبر قبل ما تنشر» and one live app.
 assert.match(views,/s\.confirmed&&testers\.length&&gate\.ok\?'':'disabled'/);
});
test('V2 files are shipped and cached for offline use',()=>{
 const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
 assert.match(html,/<script src="\.\/src\/v2\/views\.js"><\/script>/);
 assert.match(html,/<link rel="stylesheet" href="\.\/src\/v2\/theme\.css" \/>/);
 assert.match(sw,/'\.\/src\/v2\/views\.js','\.\/src\/v2\/packs\.js','\.\/src\/v2\/theme\.css'/);
});
