import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('PWA manifest is installable with real icon files', () => {
 const m = JSON.parse(read('manifest.webmanifest'));
 assert.equal(m.display, 'standalone');
 assert.equal(m.dir, 'rtl');
 for (const icon of m.icons) assert.ok(existsSync(new URL('../' + icon.src.split('?')[0], import.meta.url)));
 assert.ok(m.icons.some(i => i.purpose === 'maskable'));
});
test('deployment stays on the agreed project and site', () => {
 const rc = JSON.parse(read('.firebaserc')), fb = JSON.parse(read('firebase.json'));
 assert.equal(rc.projects.default, 'testhubiq-c7711');
 assert.equal(fb.hosting.target, 'testiqx');
 assert.equal(fb.functions, undefined, 'Spark has no Cloud Functions');
 assert.equal(fb.storage, undefined, 'Cloud Storage requires a paid plan');
});
test('hosting sends security headers and never caches entry pages', () => {
 const headers = JSON.parse(read('firebase.json')).hosting.headers.find(h => h.source === '**').headers;
 const get = key => headers.find(h => h.key === key)?.value;
 assert.equal(get('X-Content-Type-Options'), 'nosniff');
 assert.equal(get('X-Frame-Options'), 'DENY');
 assert.match(get('Cache-Control'), /no-cache/);
 assert.match(get('Content-Security-Policy'), /frame-ancestors 'none'/);
 assert.doesNotMatch(get('Content-Security-Policy').match(/script-src[^;]*/)[0], /unsafe/);
});
test('admin authority is not tied to any address published in the repository', () => {
 for (const path of ['firestore.rules', 'src/admin.js', 'src/store.js', 'src/main.js']) assert.doesNotMatch(read(path), /@gmail\.com/);
 assert.match(read('firestore.rules'), /match \/adminRoles\/\{uid\}[\s\S]*?allow list, create, update, delete: if false;/);
});
test('no developer rule exposes the tester directory', () => {
 const users = read('firestore.rules').match(/match \/users\/\{uid\} \{[\s\S]*?allow delete: if false;/)[0];
 assert.match(users, /allow list: if adminAllowed\(\);/);
 assert.doesNotMatch(users, /developer\(\)/);
});
test('legal pages exist and state the Play Store limitation', () => {
 assert.match(read('terms.html'), /لا نضمن قبول/);
 assert.match(read('privacy.html'), /حذف حسابك/);
});
test('no secret material or demo data ships in source', () => {
 for (const path of ['firebase-config.js', 'src/main.js', 'src/store.js', 'index.html']) {
  assert.doesNotMatch(read(path), /BEGIN PRIVATE KEY|private_key/);
  assert.doesNotMatch(read(path), /demoSeed|isDemo/);
 }
});
