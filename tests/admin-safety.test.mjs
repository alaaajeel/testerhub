import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const rules=get('firestore.rules'),html=get('index.html'),api=get('functions/index.cjs'),worker=get('functions/deletion.cjs'),cfg=JSON.parse(get('firebase.json'));
test('admin UI is separate, role gated and present in the PWA build',()=>{
 assert.match(html,/checkAdminClaim/);
 assert.match(html,/token\.claims\.testerhubAdmin===true/);
 assert.match(html,/adminAuthorized\?'/);
 assert.match(html,/\.\/admin\.html/);
 assert.match(get('scripts/build-site.mjs'),/'admin\.html'/);
 assert.equal(cfg.functions.source,'functions');
});
test('callable endpoints require a verified server-admin token',()=>{
 assert.match(api,/const ADMIN_EMAIL='dhi98886@gmail\.com'/);
 assert.match(api,/auth\.token\.testerhubAdmin!==true/);
 assert.match(api,/auth\.token\.email_verified!==true/);
 for(const name of ['adminOverview','adminList','adminStartProjectDeletion','adminDeletionStatus','adminContinueDeletion','adminSetUserSuspension','adminSetProjectArchive'])
  assert.match(api,new RegExp('exports\\.'+name+'=onCall'));
});
test('permanent deletion is scoped and resumable',()=>{
 assert.match(worker,/CHUNK_SIZE=150/);
 assert.match(worker,/where\('projectId','==',id\)/);
 assert.match(worker,/adminDeleteJobs/);
 assert.match(worker,/adminAuditLogs/);
 assert.match(worker,/tx\.delete\(projectRef\)/);
 assert.match(api,/adminDeletionWorker=onSchedule/);
 assert.doesNotMatch(worker,/collection\('users'\).*delete/);
});
test('client Firestore rules lock all writes during project deletion',()=>{
 assert.match(rules,/match \/adminDeleteJobs\/\{jobId\} \{ allow read, write: if false; \}/);
 assert.match(rules,/match \/adminAuditLogs\/\{auditId\} \{ allow read, write: if false; \}/);
 assert.match(rules,/&& !\(project\(resource\.data\.projectId\)\.data\.get\('status','recruiting'\) in \['deleting','archived'\]\)/);
 assert.equal((rules.match(/project\(request\.resource\.data\.projectId\)\.data\.get\('status','recruiting'\) in \['deleting','archived'\]/g)||[]).length,2);
 assert.match(rules,/allow delete: if false/);
});
test('admin grant requires a verified owner and explicit local confirmation',()=>{
 const grant=get('functions/grant-admin.cjs');
 assert.match(grant,/--confirm-grant/);
 assert.match(grant,/getUserByEmail\(EMAIL\)/);
 assert.match(grant,/account\.emailVerified/);
 assert.match(grant,/setCustomUserClaims/);
 assert.doesNotMatch(get('index.html'),/setCustomUserClaims/);
});

test('suspension and archive controls are server verified and never browser Firestore writes',()=>{
 assert.match(get('functions/index.cjs'),/adminSetUserSuspension=onCall/);
 assert.match(get('functions/index.cjs'),/adminSetProjectArchive=onCall/);
 assert.match(get('functions/index.cjs'),/revokeRefreshTokens/);
 assert.match(get('src/admin.js'),/suspend-user/);
 assert.match(get('src/admin.js'),/data-action="archive"/);
 assert.match(get('firestore.rules'),/me\(\)\.data\.get\('suspended',false\) != true/);
});
