// Fails the release when the built site could leak private material or point at the wrong project.
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
const walk = dir => readdirSync(dir).flatMap(name => { const path = join(dir, name); return statSync(path).isDirectory() ? walk(path) : [path]; });
const problems = [];
const config = readFileSync('firebase-config.js', 'utf8');
if (!config.includes('"projectId": "testhubiq-c7711"')) problems.push('firebase-config.js does not target testhubiq-c7711');
if (JSON.parse(readFileSync('.firebaserc', 'utf8')).targets['testhubiq-c7711'].hosting.testiqx[0] !== 'testiqx') problems.push('hosting target changed');
for (const path of walk('dist')) {
  if (!/\.(js|html|css|json|webmanifest)$/.test(path)) continue;
  const text = readFileSync(path, 'utf8');
  if (/BEGIN (RSA )?PRIVATE KEY|"private_key"|FIREBASE_SERVICE_ACCOUNT/.test(text)) problems.push(path + ' contains a private key');
  if (/\{\{(CSS|MAIN|ADMIN)\}\}|__VERSION__|__SHELL__/.test(text)) problems.push(path + ' has an unresolved placeholder');
}
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
if (/TESTERHUB_VAPID_KEY = ""/.test(config)) console.warn('Note: TESTERHUB_VAPID_KEY is empty, so daily push stays off in this release.');
console.log('Preflight passed for testhubiq-c7711 / testiqx.');
