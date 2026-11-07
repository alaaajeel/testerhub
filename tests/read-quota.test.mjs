import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Spark allows 50,000 document reads a day; live changes must not re-read the whole dashboard.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const from=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));

test('a live change uses the listener data and never reloads the dashboard',async()=>{
 const flush=from('async function flushLiveSync(','let leagueNameChecked=');
 assert.doesNotMatch(flush,/getDashboard/);
 let xpLoads=0,rendered=0;
 const ctx=vm.createContext({console,user:{uid:'u1',role:'tester'},dashboard:{assignments:[{id:'old'}],reports:[],messages:[],support:[],xp:null,testers:['kept']},
  liveSyncTimer:null,liveFetchInProgress:false,liveSyncDeferred:true,canRerenderLive:()=>true,render:()=>{rendered++},
  api:{loadTesterXp:async()=>{xpLoads++;return {totals:{xp:5}}}}});
 vm.runInContext(from('let liveSubscriptions=','function stopLiveSync(').replace(/^let /,'var ')+from('async function flushLiveSync(','let leagueNameChecked='),ctx);
 vm.runInContext("livePending={assignments:[{id:'a1'}],messages:[{id:'m1'}]}",ctx);
 await vm.runInContext('flushLiveSync()',ctx);
 const d=vm.runInContext('dashboard',ctx);
 assert.equal(JSON.stringify(d.assignments),'[{"id":"a1"}]');
 assert.equal(JSON.stringify(d.messages),'[{"id":"m1"}]');
 assert.equal(JSON.stringify(d.testers),'["kept"]');
 assert.equal(xpLoads,0);assert.equal(rendered,1);
 // A reviewed report can change a tester's XP: only that is read again.
 vm.runInContext("livePending={reports:[{id:'r1'}],supportMessages:[{id:'s1'}]}",ctx);
 await vm.runInContext('flushLiveSync()',ctx);
 const e=vm.runInContext('dashboard',ctx);
 assert.equal(xpLoads,1);assert.equal(e.xp.totals.xp,5);assert.equal(JSON.stringify(e.support),'[{"id":"s1"}]');
});
test('every listener feeds the pending lists with the same shape as the dashboard',()=>{
 const sync=from('function startLiveSync(','function canRerenderLive(');
 assert.match(sync,/livePending\[collectionName\]=snap\.docs\.map\(tidy\)/);
 assert.match(html,/LIVE_KEYS=\{projects:'projects',assignments:'assignments',reports:'reports',messages:'messages',supportMessages:'support'\}/);
});
test('the tester directory is read at most every 15 minutes unless fresh data is asked for',async()=>{
 let reads=0;
 const ctx=vm.createContext({Date,storeFns:{collection:()=>0,query:()=>0,where:()=>0},db:{}});
 const load=vm.runInContext(from('const DIRECTORY_TTL=','// A tester\'s XP').replace(/^const /,'var ').replace('let directoryCache','var directoryCache')+';loadTesterDirectory',ctx);
 const read=async()=>{reads++;return {docs:['t1']}};
 await load('d1',read,false);await load('d1',read,false);
 assert.equal(reads,1);
 await load('d1',read,true);assert.equal(reads,2);
 await load('d2',read,false);assert.equal(reads,3);
 vm.runInContext('directoryCache.at-=16*60000',ctx);await load('d2',read,false);assert.equal(reads,4);
});
test('coming back to the app reloads everything at most every 30 minutes',()=>{
 assert.match(html,/Date\.now\(\)-lastFullRefresh>1800000/);
});
