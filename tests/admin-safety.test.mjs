import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const get=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const rules=get('firestore.rules'),html=get('index.html'),admin=get('src/admin.js'),config=JSON.parse(get('firebase.json'));
test('Spark Admin uses Firestore without Cloud Functions or Blaze',()=>{
 assert.equal(config.functions,undefined);
 assert.match(admin,/firebase-firestore\.js/);
 assert.match(admin,/getCountFromServer/);
 assert.match(admin,/getDoc\(doc\(state\.db,'adminRoles',account\.uid\)\)/);
 assert.doesNotMatch(admin,/httpsCallable|firebase-functions|adminStartProjectDeletion/);
 assert.doesNotMatch(admin,/deleteDoc|batch\.delete\(/);
 assert.doesNotMatch(admin,/adminAuth\.updateUser/);
});
test('admin access requires BOTH a verified fixed email AND an immutable allowlisted UID',()=>{
 assert.match(rules,/function adminEmail\(\)/);
 assert.match(rules,/request\.auth\.token\.email == 'dhi98886@gmail\.com'/);
 assert.match(rules,/request\.auth\.token\.email_verified == true/);
 assert.match(rules,/function adminAllowed\(\)/);
 assert.match(rules,/exists\(\/databases\/\$\(database\)\/documents\/adminRoles\/\$\(request\.auth\.uid\)\)/);
 assert.match(rules,/match \/adminRoles\/\{uid\}/);
 assert.match(rules,/allow list, create, update, delete: if false/);
 assert.match(admin,/role\.exists\(\)&&role\.data\(\)\.active===true/);
});
test('admin controls cannot delete or erase projects, histories or accounts from browser',()=>{
 assert.doesNotMatch(admin,/deleteProject|continueJob|deleteUser|permanentDelete/);
 assert.doesNotMatch(get('admin.html'),/id="deleteDialog"|id="executeDelete"/);
 assert.match(get('admin.html'),/الحذف النهائي متوقف/);
 assert.match(rules,/match \/adminDeleteJobs\/\{jobId\} \{ allow read, write: if false; \}/);
 assert.match(rules,/allow delete: if false/);
});
test('suspensions and reversible archives write an append-only audit atomically',()=>{
 assert.match(admin,/batchAudit\(batch,change\?'suspend_user':'unsuspend_user'/);
 assert.match(admin,/batchAudit\(batch,archived\?'restore_project':'archive_project'/);
 assert.match(admin,/batch\.commit\(\)/);
 assert.match(admin,/deleteField\(\)/);
 assert.match(rules,/match \/adminAuditLogs\/\{auditId\}/);
 assert.match(rules,/allow update, delete: if false/);
 assert.match(rules,/request\.resource\.data\.createdAt == request\.time/);
});
test('suspended users are rejected across reads and writes without Auth backend',()=>{
 assert.match(rules,/function signedIn\(\)/);
 assert.match(rules,/data\.get\('suspended', false\) != true/);
 assert.match(admin,/suspended:true,available:false/);
 assert.match(admin,/suspended:false/);
 assert.doesNotMatch(admin,/revokeRefreshTokens/);
});
test('existing routes and mobile admin page stay in deployable PWA build',()=>{
 assert.match(html,/checkAdminClaim\(\)/);
 assert.match(html,/getDoc\(storeFns\.doc\(db,'adminRoles',active\.uid\)\)/);
 assert.match(html,/\.\/admin\.html/);
 assert.match(get('admin.html'),/<html lang="ar" dir="rtl">/);
 assert.match(get('admin.html'),/data-tab="adminAuditLogs"/);
 assert.match(get('scripts/build-site.mjs'),/'admin\.html'/);
 assert.ok(existsSync(new URL('../src/admin.js',import.meta.url)));
});
