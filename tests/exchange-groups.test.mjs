import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const page=readFileSync('exchange.html','utf8');
const script=readFileSync('src/exchange-groups.js','utf8');
const rules=readFileSync('firestore.rules','utf8');
const index=readFileSync('index.html','utf8');
const build=readFileSync('scripts/build-site.mjs','utf8');

test('exchange page and JavaScript module parse, ship, and stay separate from existing pages',()=>{
 assert.equal(spawnSync(process.execPath,['--check','src/exchange-groups.js'],{encoding:'utf8'}).status,0);
 assert.match(page,/src\/exchange-groups\.js/);
 assert.match(page,/firebase-config\.js/);
 assert.match(index,/href="\.\/exchange\.html"/);
 assert.match(build,/'exchange\.html'/);
 assert.match(page,/لا تعني تلقائياً الانضمام لاختبار Google Play/);
});
test('groups have 15 slots, one app per member and explicit email sharing consent',()=>{
 assert.match(script,/const CAPACITY=15/);
 assert.match(script,/memberUids:\[user\.uid\]/);
 assert.match(script,/createGroup\(/);
 assert.match(script,/joinGroup\(/);
 assert.match(script,/navigator\.clipboard\.writeText/);
 assert.match(script,/id="consent"/);
 assert.match(rules,/match \/exchangeGroups\/\{gid\}/);
 assert.match(rules,/allow get, list: if exchangeMember\(gid\)/);
});
test('daily confirmations are self-attested and reminders cannot be silently overwritten',()=>{
 assert.match(script,/checkRef\(id,TODAY\(\),user\.uid\)/);
 assert.match(script,/getDocs\(query\(remindersRef\(id\),where\('day','==',TODAY\(\)\)/);
 assert.match(rules,/currentUtcDay\(day\)/);
 assert.match(rules,/match \/reminders\/\{reminderId\}/);
 assert.match(rules,/allow update, delete: if false/);
 assert.doesNotMatch(script,/deleteDoc\(/);
});
