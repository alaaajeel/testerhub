import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('admin dashboard uses verified Firebase Authentication and a server controlled role document',()=>{
 const js=file('src/admin.js');
 assert.match(js,/getIdTokenResult\(account,true\)/);
 assert.match(js,/token\.claims\.email_verified!==true/);
 assert.match(js,/getDoc\(doc\(state\.db,'adminRoles',account\.uid\)\)/);
 assert.match(js,/getDocs\(q\)/);
 assert.match(js,/getCountFromServer/);
 assert.doesNotMatch(js,/getFunctions|httpsCallable|firebase-functions/);
});
test('admin HTML is available on phone and the site build contains it',()=>{
 assert.match(file('admin.html'),/<html lang="ar" dir="rtl">/);
 assert.match(file('admin.html'),/<meta name="robots" content="noindex,nofollow">/);
 assert.ok(existsSync(new URL('../src/admin.js',import.meta.url)));
 assert.match(file('scripts/build-site.mjs'),/'admin\.html'/);
});
