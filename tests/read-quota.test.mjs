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
  api:{loadTesterXp:async()=>{xpLoads++;return {totals:{xp:5}}}},userScrolling:()=>false,tab:'home',document:{getElementById:()=>null}});
 vm.runInContext(from('let liveSubscriptions=','function stopLiveSync(').replace(/^let /,'var ')+from('async function flushLiveSync(','let leagueNameChecked=')+from('function unionById(','async function loadTesters('),ctx);
 // One account: each list is the union of the owner's listener and the tester's listener.
 vm.runInContext("liveCache.data={'assignments:ownerUid':[{id:'a1'}],'assignments:testerUid':[{id:'a2'},{id:'a1'}],'messages:testerUid':[{id:'m1'}]};livePending={assignments:true,messages:true}",ctx);
 await vm.runInContext('flushLiveSync()',ctx);
 const d=vm.runInContext('dashboard',ctx);
 assert.equal(JSON.stringify(d.assignments),'[{"id":"a1"},{"id":"a2"}]');
 assert.equal(JSON.stringify(d.messages),'[{"id":"m1"}]');
 assert.equal(JSON.stringify(d.testers),'["kept"]');
 assert.equal(xpLoads,0);assert.equal(rendered,1);
 // A reviewed report can change a tester's XP: only that is read again.
 vm.runInContext("liveCache.data['reports:testerUid']=[{id:'r1'}];liveCache.data.supportMessages=[{id:'s1'}];livePending={reports:true,supportMessages:true}",ctx);
 await vm.runInContext('flushLiveSync()',ctx);
 const e=vm.runInContext('dashboard',ctx);
 assert.equal(xpLoads,1);assert.equal(e.xp.totals.xp,5);assert.equal(JSON.stringify(e.support),'[{"id":"s1"}]');
});
test('every listener feeds the pending lists with the same shape as the dashboard',()=>{
 const sync=from('function startLiveSync(','function canRerenderLive(');
 assert.match(sync,/const list=snap\.docs\.map\(tidy\);/);
 assert.match(sync,/liveCache\.data\[name\]=list/);
 assert.match(sync,/livePending\[collectionName\]=true/);
 // One account listens to both sides.
 for(const spec of ["['projects','ownerUid']","['assignments','ownerUid']","['assignments','testerUid']","['reports','testerUid']","['messages','testerUid']"])assert.ok(sync.includes(spec),spec);
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
test('the dashboard takes the listened collections from the live listeners instead of reading them again',()=>{
 const dash=from('async function getDashboard(','async function supportThread(');
 assert.match(dash,/const pick=\(field,name\)=>from\(name\+':'\+field,query\(collection\(db,name\),where\(field,'==',user\.uid\)\)\)/);
 for(const name of ['projects','assignments','reports','messages'])assert.ok(dash.includes("pick('ownerUid','"+name+"')"),name);
 for(const name of ['assignments','reports','messages'])assert.ok(dash.includes("pick('testerUid','"+name+"')"),name);
 assert.doesNotMatch(dash,/ read\(query\(collection\(db,'(projects|assignments|reports|messages)'\)/);
 assert.match(dash,/support:liveList\(user,'supportMessages',fromServer\)\?\?await supportThread/);
 // Start and refresh connect the listeners first and wait for them, briefly.
 assert.match(html,/if\(user\)\{startLiveSync\(\);await waitLive\(\);dashboard=await api\.getDashboard\(\)\}/);
 assert.match(html,/startLiveSync\(\);await waitLive\(\);const \[fresh\]=await Promise\.all\(\[api\.getDashboard\(\)/);
});
test('live data is used only for the same account, and never when fresh data is asked for',()=>{
 const ctx=vm.createContext({liveCache:{key:'u1|one',ready:new Set(['assignments:testerUid']),data:{'assignments:testerUid':[{id:'a'}]}}});
 const liveList=vm.runInContext(from('function liveList(','const liveSnap=')+';liveList',ctx);
 assert.equal(liveList({uid:'u1',role:'tester'},'assignments:testerUid',false).length,1);
 // The stored role no longer matters: the same account sees the same data in both.
 assert.equal(liveList({uid:'u1',role:'developer'},'assignments:testerUid',false).length,1);
 assert.equal(liveList({uid:'u2',role:'tester'},'assignments:testerUid',false),null);
 assert.equal(liveList({uid:'u1',role:'tester'},'assignments:ownerUid',false),null);
 assert.equal(liveList({uid:'u1',role:'tester'},'assignments:testerUid',true),null);
});
test('waiting for the listeners never blocks: it ends when all answered, when none run, or after a short time',async()=>{
 const ctx=vm.createContext({setTimeout,clearTimeout,Promise});
 vm.runInContext(from('var liveCache=','function stopLiveSync(').replace(/^var /,'var '),ctx);
 await vm.runInContext('waitLive(50)',ctx);
 vm.runInContext("liveCache={key:'u|t',data:{},ready:new Set(),expected:2,waiters:[]}",ctx);
 const t0=Date.now();await vm.runInContext('waitLive(120)',ctx);assert.ok(Date.now()-t0>=100);
 const p=vm.runInContext('waitLive(5000)',ctx);
 vm.runInContext("liveCache.ready.add('a');liveCache.ready.add('b');liveSettled()",ctx);
 const t1=Date.now();await p;assert.ok(Date.now()-t1<100);
});
test('a running action shows progress and is released if it never answers',()=>{
 const p=from('let pressedControl=','function canRerenderLive(')||html.slice(html.indexOf('let pressedControl='),html.indexOf('async function pending(')+1600);
 assert.match(html,/const ACTION_PATIENCE=25000;/);
 const pend=html.slice(html.indexOf('async function pending('),html.indexOf('async function pending(')+1400);
 assert.match(pend,/busyBar\(true\)/);assert.match(pend,/classList\.add\('is-loading'\)/);
 assert.match(pend,/Promise\.race\(\[run\.then\(\(\)=>false\),new Promise\(done=>\{timer=setTimeout\(\(\)=>done\(true\),ACTION_PATIENCE\)\}\)\]\)/);
 assert.match(pend,/finally\{clearTimeout\(timer\);busy=false;busyBar\(false\)/);
 assert.match(html,/#busy-bar\{display:none;position:fixed;top:0/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.ok(p.length>0);
});
test('a live redraw waits while the finger moves and keeps the scroll position',()=>{
 const flush=from('async function flushLiveSync(','let leagueNameChecked=');
 assert.match(flush,/if\(liveSyncDeferred&&user&&userScrolling\(\)\)\{liveSyncTimer=setTimeout\(flushLiveSync,800\);return\}/);
 assert.match(flush,/y=page\?\.scrollTop\|\|0/);
 assert.match(flush,/if\(again&&tab===was\)again\.scrollTop=y/);
 assert.match(html,/const userScrolling=\(\)=>touchActive\|\|Date\.now\(\)-lastScrollAt<700;/);
});
test('the keyboard check runs again after every redraw, so the bottom bar never stays hidden',()=>{
 assert.match(html,/window\.dispatchEvent\(new Event\('app-rendered'\)\)/);
 assert.match(html,/window\.addEventListener\('app-rendered',\(\)=>setTimeout\(update,80\)\)/);
 assert.match(html,/const typing=el=>!!el&&el\.isConnected&&/);
});
