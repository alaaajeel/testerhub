import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const firebase=JSON.parse(read('firebase.json'));
const project=JSON.parse(read('.firebaserc'));
const workflow=read('.github/workflows/pages.yml');
test('Firebase Hosting uses the existing TestHubiq Firebase project, not a new database',()=>{
 assert.equal(project.projects.default,'testhubiq-c7711');
 assert.equal(firebase.hosting.public,'dist');
 assert.equal(firebase.hosting.target,'testiqx');
 assert.deepEqual(project.targets['testhubiq-c7711'].hosting.testiqx,['testiqx']);
 assert.equal(firebase.firestore.rules,'firestore.rules');
});
test('Hosting deploys only the built public site',()=>{
 assert.ok(firebase.hosting.ignore.includes('**/node_modules/**'));
 assert.match(workflow,/npm run build/);
 assert.match(read('scripts/build-site.mjs'),/cpSync\(path,'dist\/'\+path/);
});
test('GitHub Firebase deploy is opt-in and requires an encrypted credential',()=>{
 assert.match(workflow,/ENABLE_FIREBASE_HOSTING_DEPLOY == 'true'/);
 assert.match(workflow,/secrets\.FIREBASE_SERVICE_ACCOUNT_TESTHUBIQ_C7711/);
 assert.match(workflow,/FirebaseExtended\/action-hosting-deploy@v0/);
 assert.match(workflow,/channelId: live/);
 assert.match(workflow,/target: testiqx/);
});
test('Firebase Hosting deployment does not automatically push Firestore rules',()=>{
 assert.match(workflow,/needs: deploy/);
 assert.doesNotMatch(workflow,/firebase deploy --only firestore/);
 assert.doesNotMatch(workflow,/firebase deploy --only database/);
 assert.match(workflow,/Deploy Hosting only/);
});
test('Prevent stale PWA files after switching to Firebase',()=>{
 const noCache=['/index.html','/sw.js','/manifest.webmanifest','/firebase-config.js'];
 for (const path of noCache) {
  const entry=firebase.hosting.headers.find(x=>x.source===path);
  assert.ok(entry,'Missing no-cache policy for '+path);
  assert.match(entry.headers[0].value,/no-cache/);
 }
});
