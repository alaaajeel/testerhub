import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('admin dashboard only calls protected Cloud Functions',()=>{
 const js=file('src/admin.js');
 assert.match(js,/getIdTokenResult\(account,true\)/);
 assert.match(js,/claims\.testerhubAdmin!==true/);
 assert.match(js,/getFunctions\(app,'us-central1'\)/);
 assert.match(js,/adminStartProjectDeletion/);
 assert.match(js,/adminContinueDeletion/);
 assert.doesNotMatch(js,/getFirestore|setDoc|deleteDoc|writeBatch/);
});
test('admin HTML is available at root of built site with proper metadata',()=>{
 assert.match(file('admin.html'),/<html lang="ar" dir="rtl">/);
 assert.match(file('admin.html'),/<meta name="robots" content="noindex,nofollow">/);
 assert.ok(existsSync(new URL('../src/admin.js',import.meta.url)));
 assert.match(file('scripts/build-site.mjs'),/'admin\.html'/);
});
