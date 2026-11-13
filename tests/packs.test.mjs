import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {judgeDay, coinsForDay, PASS, MAX_STRIKES} from '../scripts/packs-job.mjs';
// V2 exchange packs: the daily verdict, and how the app and the rules agree with it.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const packs=readFileSync(new URL('../src/v2/packs.js',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const members=n=>Array.from({length:n},(_,i)=>({uid:'u'+(i+1),status:'active',strikes:0}));

test('under 70% of the other active members\' apps is one warning; 70% or more is none',()=>{
 const m=members(16),others=m.slice(1).map(x=>x.uid);
 assert.equal(PASS,0.7);
 const need=Math.ceil(15*0.7); // 11
 assert.deepEqual(judgeDay(m,{u1:others.slice(0,need)}).filter(v=>v.uid==='u1'),[]);
 const v=judgeDay(m,{u1:others.slice(0,need-1)}).find(x=>x.uid==='u1');
 assert.deepEqual(v,{uid:'u1',got:need-1,need,strikes:1,out:false});
});
test('own app, unknown or removed members, and duplicates never count',()=>{
 const m=members(4);m[3].status='out';
 // u1 needs ceil(2*0.7)=2 of u2,u3.
 const v=judgeDay(m,{u1:['u1','u4','zz','u2','u2']}).find(x=>x.uid==='u1');
 assert.equal(v.got,1);assert.equal(v.need,2);
 assert.equal(judgeDay(m,{u1:['u2','u3']}).some(x=>x.uid==='u1'),false);
 // Removed members are not judged.
 assert.equal(judgeDay(m,{}).some(x=>x.uid==='u4'),false);
});
test('the third warning removes the member',()=>{
 const m=members(3);m[0].strikes=MAX_STRIKES-1;
 assert.deepEqual(judgeDay(m,{}).find(x=>x.uid==='u1'),{uid:'u1',got:0,need:2,strikes:3,out:true});
});
test('the app: per-app confirmation after opening and 30 seconds away, no «confirm all»',()=>{
 assert.match(packs,/PACK_AWAY_MS=30000/);
 assert.match(packs,/if\(!packCanConfirm\(memberUid\)\)throw Error/);
 assert.doesNotMatch(packs,/أكدت الكل"|confirm-all|all-done/);
 assert.match(packs,/arrayUnion\(memberUid\)/);
 assert.match(html,/<script src="\.\/src\/v2\/packs\.js"><\/script>/);
 assert.match(html,/packs:!!\(s\.exists\(\)&&s\.data\(\)\.packs===true\)/);
});
test('the rules: behind the switch, strikes only by the job, today only, list only grows',()=>{
 const part=rules.slice(rules.indexOf('// ---- V2 exchange packs'),rules.indexOf('match /appConfig/'));
 assert.match(part,/featureOn\('packs'\)/);
 assert.match(part,/\/\/ Strikes and removal are written only by the daily job \(Admin SDK\)\.\n\s+allow update: if false;/);
 assert.match(part,/currentUtcDay\(request\.resource\.data\.date\)/);
 assert.match(part,/request\.resource\.data\.confirmed\.hasAll\(resource\.data\.confirmed\)/);
 assert.match(part,/!request\.resource\.data\.confirmed\.hasAny\(\[request\.auth\.uid\]\)/);
 assert.match(part,/request\.resource\.data\.memberCount <= 16/);
});
test('coins: one per confirmed app of another active member, never for your own or a removed one',()=>{
 const m=members(4);m[3].status='out';
 assert.equal(JSON.stringify(coinsForDay(m,{u1:['u2','u3','u1','u4','u2'],u2:[],u4:['u1']})),'{"u1":2}');
});
