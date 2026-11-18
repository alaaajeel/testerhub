import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// V2 fairness: one live app without prior reports; inactive indicator and 3-tap daily report.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const from=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const today=new Date(),key=n=>new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-n)).toISOString().slice(0,10);
const daysSince=eval(html.match(/const daysSince=(\(dateKey\)=>\{[^\n]*?\});/)[1]);
const ctx=vm.createContext({api:{daysSince},Date});
vm.runInContext(from('const stamp=','\n')+'\n'+from('const LIVE_DAYS=','function publishBlockedReason(')+from('function publishBlockedReason(','async function loadPublishState(')+from('const INACTIVE_AFTER_DAYS=','function participationStats(')+from('function quickOkNote(','\n'),ctx);
const run=src=>vm.runInContext(src,ctx);
const gate=args=>JSON.parse(JSON.stringify(run('publishGate')(args)));

test('publish one app without accepted reports or an exemption',()=>{
 assert.deepEqual(gate({totals:null,slot:null,projects:[]}),{accepted:0,next:0,need:0,live:null,ok:true});
 assert.equal(gate({totals:{reports:0,bugs:0},projects:[]}).ok,true);
 assert.equal(gate({totals:{reports:0},projects:[{id:'draft',status:'draft'},{id:'c',status:'completed'}]}).ok,true);
});
test('old publish counters remain intact without charging more report credits',()=>{
 const g=gate({totals:null,slot:{projectId:'old',acceptedAtPublish:9},projects:[{id:'old',status:'completed'}]});
 assert.equal(g.next,9);assert.equal(g.need,0);assert.equal(g.ok,true);
});
test('one live app per developer, including apps that were live before this change',()=>{
 const legacy={id:'legacy',name:'قديم'};// no status field: an app published before statuses existed is live
 const g=gate({totals:{reports:30},projects:[legacy]});
 assert.equal(g.ok,false);assert.equal(g.live.id,'legacy');
 assert.match(run('publishBlockedReason')(g),/تطبيق نشط واحد/);
 // Publishing the draft being edited does not count the draft itself.
 assert.equal(gate({totals:{reports:3},projects:[{id:'me',status:'recruiting'}],ignoreId:'me'}).ok,true);
});
test('the only refusal concerns a live app',()=>{
 assert.equal(run('publishBlockedReason')(gate({totals:{reports:0},projects:[]})),'');
 assert.match(run('publishBlockedReason')(gate({projects:[{id:'x',name:'Current',status:'recruiting'}]})),/تطبيق نشط واحد/);
});
test('a live app can be ended 14 days after it went live (slot time), or after creation for older apps',()=>{
 const ends=run('liveEndsAt'),DAY=86400000,t0=Date.UTC(2026,10,1);
 assert.equal(ends({id:'a',createdAt:new Date(t0-30*DAY).toISOString()},{projectId:'a',updatedAt:new Date(t0).toISOString()}),t0+14*DAY);
 assert.equal(ends({id:'b',createdAt:new Date(t0).toISOString()},{projectId:'a',updatedAt:new Date(t0+5*DAY).toISOString()}),t0+14*DAY);
 assert.equal(ends({id:'c',created:'2026-11-01'},null),Date.parse('2026-11-01')+14*DAY);
});
test('«غير نشطة» starts after 3 full days without a report and never removes anything',()=>{
 const inactive=run('isInactiveAssignment'),quiet=run('assignmentQuietDays');
 assert.equal(run('INACTIVE_AFTER_DAYS'),3);
 // Last report 3 days ago: 2 full quiet days (today is not over), still active. 4 days ago: 3 full quiet days.
 assert.equal(inactive({joinedDay:key(6),checkins:[key(6),key(3)]}),false);
 assert.equal(inactive({joinedDay:key(6),checkins:[key(6),key(4)]}),true);
 // Started but never reported: the same count from the start day.
 assert.equal(inactive({joinedDay:key(2),checkins:[]}),false);
 assert.equal(inactive({joinedDay:key(3),checkins:[]}),true);
 // Not started, finished 14 reports, or past the 14-day window: not shown as inactive.
 assert.equal(quiet({joinedDay:null,checkins:[]}),null);
 assert.equal(inactive({joinedDay:key(20),checkins:Array.from({length:14},(_,i)=>key(20-i))}),false);
 assert.equal(inactive({joinedDay:key(16),checkins:[key(16)]}),false);
 assert.doesNotMatch(from('const INACTIVE_AFTER_DAYS=','function participationPanel('),/delete|remove|updateDoc|setDoc/);
});
test('«اشتغل بدون مشاكل» fills a note about today\'s task that passes the 10-letter minimum',()=>{
 const note=run('quickOkNote');
 assert.match(note('جرّب تسجيل الدخول'),/«جرّب تسجيل الدخول»/);
 assert.ok(note('').length>=10);
 assert.ok(note('x'.repeat(500)).length<=800);
 // Only «اشتغل» fills text; a problem still needs the tester's own words.
 assert.match(html,/node\.value==='ok'\?quickOkNote\(node\.form\?\.dataset\.task\):''/);
 assert.match(html,/data-task="\$\{clean\(taskForDay\(a\)\)\}"/);
});
test('rules: no reports or waivers are consulted at publish time; one live app is enforced',()=>{
 const slot=rules.slice(rules.indexOf('match /publishSlots/{uid}'),rules.indexOf('match /applications/'));
 assert.match(slot,/allow list, delete: if false;/);
 assert.match(slot,/acceptedAtPublish == \(resource == null \? 0 : resource\.data\.get\('acceptedAtPublish', 0\)\)/);
 assert.doesNotMatch(slot,/acceptedReports|hasPublishExemption|\+ 3/);
 const projects=rules.slice(rules.indexOf('match /projects/{projectId}'),rules.indexOf('match /publishSlots/{uid}'));
 assert.equal((projects.match(/canGoLive\(projectId\)/g)||[]).length,2);
 assert.match(projects,/request\.time >= liveSince\(projectId\) \+ duration\.value\(14, 'd'\)/);
});
