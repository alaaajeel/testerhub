import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const base=join(dirname(fileURLToPath(import.meta.url)),'..');
const load=n=>readFileSync(join(base,n),'utf8');
const html=load('index.html'),rules=load('firestore.rules');
test('HTML and RTL UI',()=>{assert.match(html,/<html lang="ar" dir="rtl">/);assert.match(html,/IBM Plex Sans Arabic/);});
test('PWA manifest and icons',()=>{const m=JSON.parse(load('manifest.webmanifest'));assert.equal(m.display,'standalone');for(const ic of m.icons)assert.ok(existsSync(join(base,ic.src)));});
test('service worker registered',()=>{assert.match(html,/serviceWorker\.register/);assert.match(load('sw.js'),/install/)});
test('Firebase config linked to TestHubiq',()=>{assert.match(html,/window\.TESTERHUB_FIREBASE_CONFIG/);assert.match(load('firebase-config.js'),/testhubiq-c7711/);});
test('real Firebase Auth and role-based dashboards',()=>{assert.match(html,/createUserWithEmailAndPassword/);assert.match(html,/where\('ownerUid','==',user.uid\)/);assert.match(html,/where\('testerUid','==',user.uid\)/);});
test('daily reports and chat use Firebase reads and writes',()=>{assert.match(html,/runTransaction\(db/);assert.match(html,/collection\(db,'reports'\)/);assert.match(html,/collection\(db,'messages'\)/);});
test('daily report is bound to checkins atomically by rules',()=>{assert.match(rules,/getAfter\(/);assert.match(rules,/match \/reports\//);assert.match(rules,/match \/messages\//);});
test('no service credentials packaged',()=>{assert.doesNotMatch(html,/BEGIN PRIVATE KEY/);assert.doesNotMatch(load('firebase-config.js'),/BEGIN PRIVATE KEY/);});

test('Firebase initialization waits for Auth instance (not SDK namespace)',()=>{
 assert.match(html,/await auth\.authStateReady\(\)/);
 assert.doesNotMatch(html,/a\.authStateReady\(auth\)/);
});
