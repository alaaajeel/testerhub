import fs from 'node:fs';
import vm from 'node:vm';
const raw = fs.readFileSync(new URL('../firebase-config.js',import.meta.url),'utf8');
const sandbox={window:{}};
try { vm.runInNewContext(raw,sandbox,{timeout:250}); }
catch(e){console.error('Firebase config syntax error:',e.message);process.exit(1)}
const cfg=sandbox.window.TESTERHUB_FIREBASE_CONFIG;
if (!cfg) {console.error('Firebase Web Config not added.');process.exit(2)}
for(const key of ['apiKey','authDomain','projectId','appId','messagingSenderId']){
 if(typeof cfg[key]!=='string'||!cfg[key].trim()){console.error('Missing Firebase Config:',key);process.exit(3)}
}
if(/YOUR_|PROJECT|EXAMPLE|\.\.\./.test(Object.values(cfg).join(' '))){console.error('Firebase config contains placeholders.');process.exit(4)}
console.log('Firebase Config ready:',cfg.projectId);
console.log('Auth, Firestore rules and real account testing require separate verification.');
