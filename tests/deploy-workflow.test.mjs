import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// The production deploy workflow: manual, main only, tested first, rules before the site, nothing deleted.
const wf=readFileSync(new URL('../.github/workflows/deploy-firebase.yml',import.meta.url),'utf8');
const firebase=JSON.parse(readFileSync(new URL('../firebase.json',import.meta.url),'utf8'));
const rc=JSON.parse(readFileSync(new URL('../.firebaserc',import.meta.url),'utf8'));
const at=s=>{const i=wf.indexOf(s);assert.ok(i>=0,'missing: '+s);return i};

test('runs only by hand, from main, after typing the confirmation',()=>{
 assert.match(wf,/on:\n  workflow_dispatch:/);
 assert.doesNotMatch(wf,/\n  push:|\n  pull_request:|\n  schedule:/);
 assert.match(wf,/github\.ref == 'refs\/heads\/main'/);
 assert.match(wf,/CONFIRM: \$\{\{ inputs\.confirm \}\}/);
 assert.doesNotMatch(wf,/run: \|?\s*[^\n]*\$\{\{ inputs\./);
});
test('tests gate the deploy, then rules and indexes, then index wait, then the site',()=>{
 const order=[at('run: npm test'),at('run: npm run test:rules'),at('--only firestore:rules,firestore:indexes'),at('Wait for indexes'),at('run: npm run build'),at('--only hosting:testiqx')];
 assert.deepEqual(order,[...order].sort((a,b)=>a-b));
});
test('never deletes indexes or data and targets the live site',()=>{
 assert.doesNotMatch(wf,/--force|firestore:delete|auth:import/);
 assert.equal(firebase.hosting.target,'testiqx');
 assert.deepEqual(rc.targets['testhubiq-c7711'].hosting.testiqx,['testiqx']);
 assert.match(wf,/PROJECT: testhubiq-c7711/);
 assert.match(wf,/rm -f "\$RUNNER_TEMP\/firebase-key\.json"/);
});
test('the verified XP start date is set',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/LEGACY_XP_CUTOFF=String\(window\.TESTERHUB_XP_START\|\|'2026-11-06'\)/);
});
