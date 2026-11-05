import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const firebase=JSON.parse(read('firebase.json'));
const project=JSON.parse(read('.firebaserc'));
test('Firebase Hosting uses the existing TestHubiq Firebase project, not a new database',()=>{
 assert.equal(project.projects.default,'testhubiq-c7711');
 assert.equal(firebase.hosting.public,'dist');
 assert.equal(firebase.hosting.target,'testiqx');
 assert.deepEqual(project.targets['testhubiq-c7711'].hosting.testiqx,['testiqx']);
 assert.equal(firebase.firestore.rules,'firestore.rules');
});
test('Hosting deploys only the built public site',()=>{
 assert.ok(firebase.hosting.ignore.includes('**/node_modules/**'));
 assert.match(read('scripts/build-site.mjs'),/cpSync\(path,'dist\/'\+path/);
});
test('Prevent stale PWA files after switching to Firebase',()=>{
 const noCache=['/','/admin.html','/src/**','/index.html','/sw.js','/manifest.webmanifest','/firebase-config.js'];
 for (const path of noCache) {
  const entry=firebase.hosting.headers.find(x=>x.source===path);
  assert.ok(entry,'Missing no-cache policy for '+path);
  assert.match(entry.headers[0].value,/no-cache/);
 }
});
