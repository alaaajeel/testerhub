import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Activity: estimated states, a bounded number of writes, and the developer's follow-up list.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const admin=readFileSync(new URL('../src/admin.js',import.meta.url),'utf8');
const from=(a,b,s=html)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
const a=vm.runInContext(from('const ONLINE_MS=','const presence=')+';({activityState,presenceDue,ONLINE_MS,DAY_MS})',vm.createContext({}));
const MIN=60000,HOUR=60*MIN;

test('online means seen in the last two minutes; today means 24 hours; the rest is inactive',()=>{
 const now=Date.parse('2026-11-07T12:00:00Z');
 assert.equal(a.activityState(null,now),'never');
 assert.equal(a.activityState(now-2*MIN,now),'online');
 assert.equal(a.activityState(now-2*MIN-1,now),'today');
 assert.equal(a.activityState(now-24*HOUR,now),'today');
 assert.equal(a.activityState(now-24*HOUR-1,now),'inactive');
});
// Simulates an hour with the 30-second timer the app uses and counts the writes.
function writesPerHour({interacting,visible=true,online=true}){
 let lastWrite=0,lastInteraction=interacting?0:-HOUR,writes=0,actions=0;
 for(let t=0;t<HOUR;t+=30000){
  if(interacting)lastInteraction=t;
  const due=a.presenceDue({now:t+1,lastWrite,lastInteraction:interacting?t+1:lastInteraction,visible,online});
  if(due){writes++;if(due.action)actions++;lastWrite=t+1}
 }
 return {writes,actions};
}
test('writes stay bounded: about one a minute in use, one per five minutes idle, none hidden or offline',()=>{
 const busy=writesPerHour({interacting:true});
 assert.ok(busy.writes>=59&&busy.writes<=61,'busy '+busy.writes);
 assert.equal(busy.actions,busy.writes);
 const idle=writesPerHour({interacting:false});
 assert.ok(idle.writes<=13,'idle '+idle.writes);
 assert.equal(writesPerHour({interacting:true,visible:false}).writes,0);
 assert.equal(writesPerHour({interacting:true,online:false}).writes,0);
});
test('a fresh tab writes at once, then waits for the interval',()=>{
 assert.deepEqual({...a.presenceDue({now:10,lastWrite:0,lastInteraction:5,visible:true,online:true})},{action:true});
 assert.equal(a.presenceDue({now:30*1000,lastWrite:10,lastInteraction:20000,visible:true,online:true}),null);
});
test('no real-time listener is used for activity, and the console reads counts, not every record',()=>{
 const appPart=from('const ONLINE_MS=','async function getDashboard(');
 assert.doesNotMatch(appPart,/onSnapshot/);
 assert.match(appPart,/serverTimestamp\(\)/);
 const consolePart=from('const ACTIVITY_PAGE=','async function loadFeatures(',admin);
 assert.match(consolePart,/getCountFromServer/);
 assert.match(consolePart,/limit\(ACTIVITY_PAGE\)/);
 assert.doesNotMatch(consolePart,/onSnapshot/);
 assert.match(admin,/الحالة تقديرية وليست لحظية/);
});
test('the developer follow-up flags testers quiet for two days or more and says what it cannot know',()=>{
 const today=new Date(),key=n=>new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-n)).toISOString().slice(0,10);
 const daysSince=eval(html.match(/const daysSince=(\(dateKey\)=>\{[^\n]*?\});/)[1]);
 const ctx=vm.createContext({api:{daysSince},DAY_MS:86400000});
 const rows=vm.runInContext(from('const INACTIVE_AFTER_DAYS=','function participationPanel(')+from('const stamp=','async function setProjectTestMode(')+from('const FOLLOW_UP_DAYS=','function followUpSection(')+';followUpRows',ctx);
 const now=Date.now();
 const list=rows([
  {id:'fresh',joinedDay:key(3),checkins:[key(3),key(0)]},
  {id:'quiet',joinedDay:key(5),checkins:[key(5),key(4)]},
  {id:'quietButSeen',joinedDay:key(5),checkins:[key(5)],testerSeenAt:new Date(now-3*3600000).toISOString()},
  {id:'done',joinedDay:key(20),checkins:Array.from({length:14},(_,i)=>key(20-i))},
  {id:'notStarted',joinedDay:null,checkins:[]}
 ],now);
 assert.deepEqual(list.map(r=>[r.a.id,r.flagged]),[['quiet',true],['quietButSeen',false],['fresh',false]]);
 assert.match(from('function followUpSection(','function testModeSection('),/فتح TesterHub ما يثبت إن المختبر جرّب تطبيقك، وعدم فتحه ما يعني إنه ما يستخدمه/);
});
test('activity code never writes check-ins, start days, report times or XP',()=>{
 const code=from('const ONLINE_MS=','async function getDashboard(');
 assert.doesNotMatch(code,/checkins\s*:|joinedDay\s*:|lastCheckinAt|xpTotals|xpAssignments|collection\(db,'reports'\)/);
 // The developer follow-up only reads; its buttons send a message or invite a backup.
 const follow=from('const FOLLOW_UP_DAYS=','function testModeSection(');
 assert.doesNotMatch(follow,/updateDoc|setDoc|writeBatch/);
});
test('the developer follow-up only covers this app and only for its owner',()=>{
 const today=new Date(),key=n=>new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-n)).toISOString().slice(0,10);
 const daysSince=eval(html.match(/const daysSince=(\(dateKey\)=>\{[^\n]*?\});/)[1]);
 const ctx=vm.createContext({api:{daysSince},DAY_MS:86400000,user:{uid:'d1'},clean:String,formatNum:String,ico:()=>'',testerLabel:uid=>uid});
 const section=vm.runInContext(from('const INACTIVE_AFTER_DAYS=','function participationPanel(')+from('const stamp=','async function setProjectTestMode(')+from('function agoText(','function testModeSection(')+';followUpSection',ctx);
 const quiet=(id,projectId,ownerUid)=>({id,projectId,ownerUid,testerUid:'tester-'+id,joinedDay:key(5),checkins:[key(5)]});
 const out=section({id:'p1',ownerUid:'d1'},[quiet('a','p1','d1'),quiet('b','p2','d1'),quiet('c','p1','d2')]);
 assert.match(out,/tester-a/);
 assert.doesNotMatch(out,/tester-b|tester-c/);
 assert.equal(section({id:'p9',ownerUid:'d2'},[quiet('d','p9','d2')]),'');
 assert.match(out,/فتح TesterHub ما يثبت إن المختبر جرّب تطبيقك/);
});
test('testers are told what the developer sees, in the app and the privacy page',()=>{
 assert.match(html,/class="tiny seen-note">خلال فترة اختبار أي تطبيق، يشوف مطوره متى فتحت TesterHub آخر مرة/);
 assert.match(html,/ما يشوف نشاطك بتطبيقات غيره، ولا يُعتبر فتح TesterHub دليلاً على أنك جرّبت التطبيق/);
 const privacy=readFileSync(new URL('../privacy.html',import.meta.url),'utf8');
 assert.match(privacy,/خلال فترة ذلك الاختبار فقط. لا يرى نشاطك في تطبيقات غيره/);
});
