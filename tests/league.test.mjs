import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Phase 3 league: badges, ranking order, opt-in names, and the rules/index it depends on.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const indexes=JSON.parse(readFileSync(new URL('../firestore.indexes.json',import.meta.url),'utf8'));
const from=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const l=vm.runInContext(from('const XP_BADGES=','async function getLeague(')+';({xpBadges,rankLeague,LEAGUE_SIZE})',vm.createContext({}));
const plain=v=>JSON.parse(JSON.stringify(v));

test('badges come only from verified totals',()=>{
 assert.deepEqual(plain(l.xpBadges({})),[]);
 assert.deepEqual(plain(l.xpBadges({reports:1})),['أول تقرير مقبول']);
 assert.deepEqual(plain(l.xpBadges({reports:20,bugs:10,retests:1,cycles:1,apps:5})),['أول تقرير مقبول','صائد الأخطاء','مُعيد الاختبار','دورة كاملة','داعم 5 تطبيقات','مساهم ثابت']);
});
test('ranking is by points with a stable order for ties',()=>{
 const ranked=plain(l.rankLeague([{uid:'b',points:10},{uid:'c',points:30},{uid:'a',points:10}]));
 assert.deepEqual(ranked.map(r=>[r.uid,r.rank]),[['c',1],['a',2],['b',3]]);
 assert.equal(l.LEAGUE_SIZE,20);
});
test('league reads only verified period totals and is ordered by the server',()=>{
 const get=from('async function getLeague(','async function setLeagueName(');
 assert.match(get,/collection\(db,'xpPeriods'\),where\('period','==',period\),orderBy\('points','desc'\),limit\(LEAGUE_SIZE\)/);
 assert.match(get,/getCountFromServer/);
 assert.doesNotMatch(get,/collection\(db,'(users|reports|contributions)'\)/);
 assert.ok(indexes.indexes.some(i=>i.collectionGroup==='xpPeriods'&&i.fields.map(f=>f.fieldPath+':'+f.order).join()==='period:ASCENDING,points:DESCENDING'));
});
test('public names are opt-in, limited to the profile name, and removable by their owner',()=>{
 const block=rules.slice(rules.indexOf('match /publicProfiles/{uid}'),rules.indexOf('}',rules.indexOf('allow delete',rules.indexOf('match /publicProfiles/{uid}'))));
 assert.match(block,/hasOnly\(\['name','photo','hidden','updatedAt'\]\)/);
 assert.match(block,/request\.resource\.data\.name == me\(\)\.data\.name/);
 assert.match(block,/allow delete: if request\.auth != null && request\.auth\.uid == uid/);
 assert.match(html,/data-change="league-name" \$\{show\?'checked':''\}/);
 assert.doesNotMatch(from('function leagueRow(','function leagueSection('),/email/);
});
test('both roles reach the league; no money or prize wording',()=>{
 assert.match(html,/\['rewards','دوري المساهمين'\],\['profile','حسابي'\]\]:\[\['home'/);
 assert.match(html,/chat:chatPage,support:supportPage,rewards,announcements:announcementsPage,profile\}/);
 const page=from('function leagueSection(','function rewards(');
 assert.doesNotMatch(page,/دينار|دولار|USD|جائزة مالية|سحب/);
});
test('the daily league is the first tab; warm-up rows compete marked «تجريبي» and fade by day and by real members',()=>{
 assert.match(html,/leagueKind='day'/);
 assert.match(html,/\['day','اليوم'\],\['week','هذا الأسبوع'\],\['month','هذا الشهر'\]/);
 const ctx=vm.createContext({window:{TESTERHUB_LEAGUE_WARMUP_UNTIL:'2026-11-13T00:00:00Z'}});
 const w=vm.runInContext(from('const LEAGUE_WARMUP_UNTIL=','function leagueSection(')+';({warmupRows,withWarmup})',ctx);
 const start=Date.parse('2026-11-06T09:00:00Z'),day=86400000;
 assert.equal(w.warmupRows(0,'day',start).length,5);
 assert.equal(w.warmupRows(2,'day',start).length,3);
 assert.equal(w.warmupRows(5,'day',start).length,0);
 assert.ok(w.warmupRows(0,'day',start+4*day).length<5);
 assert.equal(w.warmupRows(0,'day',Date.parse('2026-11-13T00:00:00Z')).length,0);
 const list=plain(w.withWarmup([{uid:'a',points:35},{uid:'b',points:20}],'day',start));
 assert.deepEqual(list.map(r=>[r.uid,r.rank]),[['sample-0',1],['a',2],['sample-1',3],['b',4],['sample-2',5]]);
 assert.ok(list.filter(r=>r.sample).every(r=>r.uid.startsWith('sample-')));
 assert.match(from('function leagueRow(','function leagueSection('),/sample-tag">تجريبي/);
});
test('names show by default from the profile, photos are optional, and hiding removes both',()=>{
 const pub=vm.runInContext(from('const publicOf=','async function getLeague(')+';publicOf',vm.createContext({}));
 const photo='data:image/webp;base64,AAAA';
 assert.deepEqual(plain(pub({name:'سارة',photo})),{name:'سارة',photo});
 assert.deepEqual(plain(pub({name:'سارة',photo,hidden:true})),{name:null,photo:null});
 assert.deepEqual(plain(pub({name:'سارة',photo:'javascript:alert(1)'})),{name:'سارة',photo:null});
 assert.deepEqual(plain(pub(null)),{name:null,photo:null});
 const refresh=from('async function refreshLeagueName(','async function photoDataUrl(');
 assert.match(refresh,/if\(!myPublicProfile\)return writePublicProfile\(\{hidden:false\}\)/);
 assert.match(from('async function photoDataUrl(','const XP_BADGES='),/c\.width=c\.height=128/);
});
