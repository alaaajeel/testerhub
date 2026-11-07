import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Phase 2 XP: which rewards are owed, the separate legacy history, levels, and the client/rules period keys.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const from=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const code=from('const REPORT_OUTCOMES=','function validateDailyReport(')+from('// ---- Contribution XP ----','// Writes one event and every total');
const x=vm.runInContext(code+';({XP_POINTS,XP_CYCLE_MIN_ACCEPTED,LEGACY_XP_CUTOFF,xpWeekKey,xpMonthKey,pendingXpEvents,legacyXp,xpLevel})',vm.createContext({window:{}}));
const plain=v=>JSON.parse(JSON.stringify(v));
const a={id:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1',checkins:[]};
const r=(day,extra={})=>({id:`p1_t1_2026-01-${day}`,assignmentId:'p1_t1',outcome:'ok',...extra});

test('points are fixed per kind',()=>{assert.deepEqual({...x.XP_POINTS},{report:10,bug:20,retest:10,cycle:50});assert.equal(x.XP_CYCLE_MIN_ACCEPTED,7)});
test('only accepted reports earn, problems count as bugs',()=>{
 const out=x.pendingXpEvents({reports:[r('01',{reviewStatus:'accepted'}),r('02',{outcome:'issue',reviewStatus:'accepted'}),r('03',{outcome:'blocked',reviewStatus:'accepted'}),r('04'),r('05',{reviewStatus:'rejected'}),r('06',{reviewStatus:'clarify'})],assignments:[a]});
 assert.deepEqual(plain(out.map(e=>[e.id,e.kind,e.points])),[['p1_t1_2026-01-01_review','report',10],['p1_t1_2026-01-02_review','bug',20],['p1_t1_2026-01-03_review','bug',20]]);
 assert.deepEqual({...out[0]},{id:'p1_t1_2026-01-01_review',kind:'report',points:10,reportId:'p1_t1_2026-01-01',assignmentId:'p1_t1',projectId:'p1',testerUid:'t1',ownerUid:'d1'});
});
test('already recorded events are never owed again',()=>{
 const out=x.pendingXpEvents({reports:[r('01',{reviewStatus:'accepted'})],assignments:[a],eventIds:new Set(['p1_t1_2026-01-01_review'])});
 assert.equal(out.length,0);
});
test('a fixed problem pays one retest even if retested twice',()=>{
 const out=x.pendingXpEvents({reports:[r('04',{reviewStatus:'accepted',retestOf:'p1_t1_2026-01-02'}),r('05',{reviewStatus:'accepted',retestOf:'p1_t1_2026-01-02'})],assignments:[a]});
 assert.deepEqual(plain(out.filter(e=>e.kind==='retest').map(e=>[e.id,e.reportId])),[['p1_t1_2026-01-02_retest','p1_t1_2026-01-04']]);
 assert.equal(x.pendingXpEvents({reports:[r('04',{retestOf:'p1_t1_2026-01-02'})],assignments:[a]}).length,0);
});
test('cycle needs 14 reported days and 7 accepted, counting ones being awarded now',()=>{
 const full={...a,checkins:Array.from({length:14},(_,i)=>`2026-01-${String(i+1).padStart(2,'0')}`)};
 const accepted=n=>Array.from({length:n},(_,i)=>r(String(i+1).padStart(2,'0'),{reviewStatus:'accepted'}));
 assert.ok(!x.pendingXpEvents({reports:accepted(6),assignments:[full]}).some(e=>e.kind==='cycle'));
 assert.ok(x.pendingXpEvents({reports:accepted(7),assignments:[full]}).some(e=>e.id==='p1_t1_cycle'&&e.points===50));
 assert.ok(x.pendingXpEvents({reports:[],assignments:[full],ledgers:new Map([['p1_t1',{reports:5,bugs:2}]])}).some(e=>e.kind==='cycle'));
 assert.ok(!x.pendingXpEvents({reports:accepted(7),assignments:[{...full,checkins:full.checkins.slice(1)}]}).some(e=>e.kind==='cycle'));
 assert.ok(!x.pendingXpEvents({reports:[],assignments:[full],ledgers:new Map([['p1_t1',{reports:9}]]),eventIds:new Set(['p1_t1_cycle'])}).length);
});
test('reports of unknown assignments are ignored',()=>{assert.equal(x.pendingXpEvents({reports:[r('01',{reviewStatus:'accepted',assignmentId:'other'})],assignments:[a]}).length,0)});
test('legacy XP keeps the old formula for days before the cutoff only',()=>{
 const days=n=>Array.from({length:n},(_,i)=>new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10));
 assert.equal(x.legacyXp([{checkins:days(3)}],'2026-11-01'),30);
 assert.equal(x.legacyXp([{checkins:days(14)}],'2026-11-01'),160);
 assert.equal(x.legacyXp([{checkins:['2026-10-30','2026-11-01','2026-11-02']}],'2026-11-01'),10);
 assert.equal(x.legacyXp([{checkins:[]},{}],'2026-11-01'),0);
 assert.match(x.LEGACY_XP_CUTOFF,/^\d{4}-\d{2}-\d{2}$/);
});
test('levels follow the planned five steps',()=>{
 assert.deepEqual([0,99,100,299,300,700,1499,1500,9999].map(p=>x.xpLevel(p).name),['مبتدئ','مبتدئ','نشط','نشط','محترف','خبير','خبير','أسطوري','أسطوري']);
 assert.equal(x.xpLevel(150).next,300);assert.equal(x.xpLevel(2000).next,null);
});
test('client period keys match the rules formula',()=>{
 // Monday 00:00 UTC starts a new week; Sunday 23:59 is still the previous one.
 assert.notEqual(x.xpWeekKey(Date.UTC(2026,10,9,0,0)),x.xpWeekKey(Date.UTC(2026,10,8,23,59)));
 assert.equal(x.xpWeekKey(Date.UTC(2026,10,9,0,0)),x.xpWeekKey(Date.UTC(2026,10,15,23,59)));
 assert.equal(new Date(Date.UTC(2026,10,9)).getUTCDay(),1);
 assert.equal(x.xpMonthKey(Date.UTC(2026,10,30,23,59)),'M202611');
 assert.equal(x.xpMonthKey(Date.UTC(2026,0,1)),'M202601');
 assert.match(rules,/'W' \+ string\(int\(\(t\.toMillis\(\) \+ 259200000\) \/ 604800000\)\)/);
 assert.match(rules,/'M' \+ string\(t\.year\(\) \* 100 \+ t\.month\(\)\)/);
 assert.match(html,/'W'\+Math\.floor\(\(ms\+259200000\)\/604800000\)/);
});
test('XP is never a client-writable field and the old formula is gone from the UI',()=>{
 assert.doesNotMatch(html,/function sumXp/);
 assert.match(rules,/match \/xpTotals\/\{uid\}[\s\S]*?allow delete: if false;/);
 assert.match(rules,/match \/contributions\/\{eventId\}[\s\S]*?allow update, delete: if false;/);
 const users=rules.slice(rules.indexOf('match /users/{uid}'),rules.indexOf('match /projects/{projectId}'));
 assert.doesNotMatch(users,/points|xp/i);
 assert.match(rules,/resource\.data\.get\('reviewStatus',''\) != 'accepted'/);
});

test('one refused award does not hold back other apps, and the same app waits for the next sync',async()=>{
 const src=from('function settleWithin(','\n',0)+'\n'+from('async function awardPending(','// Tester side:');
 const calls=[];
 const ctx=vm.createContext({console:{warn(){}},calls,awardXp:async(ev,first)=>{calls.push([ev.id,first]);if(ev.id==='bad')throw Object.assign(Error('denied'),{code:'permission-denied'});return true}});
 const awardPending=vm.runInContext(src+';awardPending',ctx);
 const ev=(id,assignmentId,points=10)=>({id,assignmentId,kind:'report',points});
 const ledgers=new Map();
 const points=await awardPending([ev('bad','a1'),ev('later','a1'),ev('ok','a2',20)],ledgers);
 assert.equal(points,20);
 assert.deepEqual(plain(calls),[['bad',true],['ok',true]]);
 assert.equal(ledgers.has('a1'),false);
 await assert.rejects(awardPending([ev('bad','a3')],new Map()),/denied/);
});
test('a write that waits on the network is released after a bounded wait',async()=>{
 const settleWithin=vm.runInContext(from('function settleWithin(','\n',0)+';settleWithin',vm.createContext({setTimeout,clearTimeout,Promise}));
 assert.deepEqual(plain(await settleWithin(Promise.resolve(5),50)),{done:true,value:5});
 assert.deepEqual(plain(await settleWithin(new Promise(()=>{}),20)),{done:false});
 assert.match(html,/const XP_WRITE_WAIT=12000;/);
});
