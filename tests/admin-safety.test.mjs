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
 assert.doesNotMatch(admin,/adminAuth\.updateUser/);
});
test('admin access requires a verified account AND an immutable allowlisted UID, with no address in the code',()=>{
 assert.doesNotMatch(rules+admin+html,/dhi\d+@/);
 assert.match(rules,/request\.auth\.token\.email_verified == true/);
 assert.match(rules,/function adminAllowed\(\)/);
 assert.match(rules,/exists\(\/databases\/\$\(database\)\/documents\/adminRoles\/\$\(request\.auth\.uid\)\)/);
 assert.match(rules,/match \/adminRoles\/\{uid\}/);
 assert.match(rules,/allow list, create, update, delete: if false/);
 assert.match(admin,/role\.exists\(\)&&role\.data\(\)\.active===true/);
});
test('project deletion locks first, removes the project last, and needs the typed name',()=>{
 const service=get('src/services/deletion.js');
 const lock=service.indexOf("f.updateDoc(ref, {status: 'deleting'})"),records=service.indexOf('batch.delete(item.ref)');
 assert.ok(lock>=0&&lock<records);
 assert.ok(service.indexOf('finish.delete(ref)')>records);
 assert.match(admin,/batchAudit\(batch,'delete_project'/);
 assert.match(admin,/typed:project\.name/);
 assert.match(html,/typed\.trim\(\)!==String\(p\.name\)\.trim\(\)/);
 assert.doesNotMatch(admin,/deleteUser/);
 assert.match(rules,/match \/users\/\{uid\}[\s\S]*?allow delete: if false;/);
 assert.match(rules,/match \/adminDeleteJobs\/\{jobId\} \{ allow read, write: if false; \}/);
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
