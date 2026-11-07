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
test('ranking is by points; equal points share a rank and keep a steady order',()=>{
 const ranked=plain(l.rankLeague([{uid:'b',points:10},{uid:'c',points:30},{uid:'a',points:10},{uid:'d',points:5}]));
 assert.deepEqual(ranked.map(r=>[r.uid,r.rank]),[['c',1],['a',2],['b',2],['d',4]]);
 // The same rank a member outside the list gets from the server: 1 + members with more points.
 assert.deepEqual(plain(l.rankLeague([{uid:'x',points:7},{uid:'y',points:7}])).map(r=>r.rank),[1,1]);
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
 assert.match(block,/hasOnly\(\['name','photo','hidden','consent','updatedAt'\]\)/);
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
test('the daily league is the first tab and lists real members only',()=>{
 assert.match(html,/leagueKind='day'/);
 assert.match(html,/\['day','اليوم'\],\['week','هذا الأسبوع'\],\['month','هذا الشهر'\]/);
 assert.doesNotMatch(html,/warmup|WARMUP|sample-tag|LEAGUE_SAMPLES/i);
 assert.match(from('function leagueSection(','function rewards('),/const rows=league\.rows\.map\(/);
});
test('names and photos show only with the member\'s consent',()=>{
 const pub=vm.runInContext(from('const leagueConsent=','async function getLeague(')+';publicOf',vm.createContext({}));
 const photo='data:image/webp;base64,AAAA';
 assert.deepEqual(plain(pub({name:'سارة',photo,consent:true})),{name:'سارة',photo});
 // The original opt-in stored only the name: that was a choice, so it still counts.
 assert.deepEqual(plain(pub({name:'سارة'})),{name:'سارة',photo:null});
 // Entries the app made by itself, or that carry the old toggle, are not consent.
 assert.deepEqual(plain(pub({name:'سارة',photo,hidden:false})),{name:null,photo:null});
 assert.deepEqual(plain(pub({name:'سارة',photo,hidden:true})),{name:null,photo:null});
 assert.deepEqual(plain(pub({name:'سارة',photo,consent:false})),{name:null,photo:null});
 assert.deepEqual(plain(pub({name:'سارة',photo:'javascript:alert(1)',consent:true})),{name:'سارة',photo:null});
 assert.deepEqual(plain(pub(null)),{name:null,photo:null});
 const refresh=from('async function refreshLeagueName(','async function photoDataUrl(');
 assert.doesNotMatch(refresh,/hidden:false|consent:true/);
 assert.match(from('async function setLeagueName(','async function setProfilePhoto('),/consent:!!show,hidden:null/);
 assert.match(from('async function photoDataUrl(','const XP_BADGES='),/c\.width=c\.height=128/);
});
test('period keys roll over exactly where the rules do: UTC midnight, Monday, the first of the month',()=>{
 const k=vm.runInContext(from('const xpWeekKey=','const xpKindForReport=')+';({xpWeekKey,xpMonthKey,xpDayKey})',vm.createContext({}));
 const t=x=>Date.parse(x);
 assert.equal(k.xpDayKey(t('2026-11-06T23:59:59.999Z')),'D20261106');
 assert.equal(k.xpDayKey(t('2026-11-07T00:00:00.000Z')),'D20261107');
 // Sunday 23:59 UTC and Monday 00:00 UTC fall in different weeks; Monday to Sunday share one.
 assert.notEqual(k.xpWeekKey(t('2026-11-08T23:59:59Z')),k.xpWeekKey(t('2026-11-09T00:00:00Z')));
 assert.equal(k.xpWeekKey(t('2026-11-09T00:00:00Z')),k.xpWeekKey(t('2026-11-15T23:59:59Z')));
 assert.equal(k.xpMonthKey(t('2026-11-30T23:59:59Z')),'M202611');
 assert.equal(k.xpMonthKey(t('2026-12-01T00:00:00Z')),'M202612');
 assert.equal(k.xpMonthKey(t('2026-12-31T23:59:59Z')),'M202612');
 assert.equal(k.xpMonthKey(t('2027-01-01T00:00:00Z')),'M202701');
 // The rules use the same formulas.
 assert.match(rules,/'W' \+ string\(int\(\(t\.toMillis\(\) \+ 259200000\) \/ 604800000\)\)/);
 assert.match(rules,/'D' \+ string\(t\.year\(\) \* 10000 \+ t\.month\(\) \* 100 \+ t\.day\(\)\)/);
});
