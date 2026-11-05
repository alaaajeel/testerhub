import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../src/services/push.js';
const {createPush, utcHour, hashHex} = globalThis.TesterHubPush;
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function fixture({available = true, token = 'token-abc', hour = 20} = {}) {
 const store = new Map(), writes = [], deletes = [];
 const storage = {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k)};
 const f = {doc: (_, c, id) => c + '/' + id, serverTimestamp: () => 'now', setDoc: async (ref, data, options) => { writes.push({ref, data, options}); }, deleteDoc: async ref => { deletes.push(ref); }};
 const state = {hour};
 return {writes, deletes, state, service: createPush({db: {}, f, storage, available: () => available, getToken: async () => token, getHour: () => state.hour})};
}
test('saves the device under the hash of its token', async () => {
 const x = fixture();
 assert.equal(await x.service.sync('u1'), true);
 assert.equal(x.writes[0].ref, 'pushDevices/' + await hashHex('token-abc'));
 assert.equal(x.writes[0].data.uid, 'u1');
 assert.equal(x.writes[0].data.reminderUtcHour, utcHour(20));
 assert.deepEqual(x.writes[0].options, {merge: true});
});
test('opening the app again does not write again', async () => {
 const x = fixture();
 await x.service.sync('u1'); await x.service.sync('u1');
 assert.equal(x.writes.length, 1);
});
test('a new reminder hour or a new account writes, and the button always does', async () => {
 const x = fixture();
 await x.service.sync('u1');
 x.state.hour = 9; await x.service.sync('u1');
 await x.service.sync('u2');
 await x.service.sync('u2', {force: true});
 assert.equal(x.writes.length, 4);
});
test('without a key or browser support nothing happens', async () => {
 const x = fixture({available: false});
 assert.equal(await x.service.sync('u1'), false);
 assert.equal(x.writes.length, 0);
});
test('no token means not registered, not a false success', async () => {
 const x = fixture({token: null});
 assert.equal(await x.service.sync('u1'), false);
});
test('signing out removes this device and a later sign-in saves it again', async () => {
 const x = fixture();
 await x.service.sync('u1');
 await x.service.remove();
 assert.equal(x.deletes.length, 1);
 await x.service.remove();
 assert.equal(x.deletes.length, 1, 'nothing left to remove');
 await x.service.sync('u1');
 assert.equal(x.writes.length, 2);
});
test('local reminder hour converts to UTC', () => {
 const hour = utcHour(20), expected = new Date(); expected.setHours(20, 0, 0, 0);
 assert.equal(hour, expected.getUTCHours());
});
test('the service worker shows data-only pushes unless the app is on screen', () => {
 const sw = read('sw.js');
 assert.match(sw, /addEventListener\('push'/);
 assert.match(sw, /visibilityState==='visible'/);
 assert.match(sw, /showNotification/);
});
test('no credential ships with the site or the repository', () => {
 for (const name of ['firebase-config.js', 'src/services/push.js', 'scripts/send-push.mjs', '.github/workflows/push.yml']) assert.doesNotMatch(read(name), /BEGIN PRIVATE KEY|"private_key"/);
 assert.match(read('.github/workflows/push.yml'), /secrets\.FIREBASE_SERVICE_ACCOUNT/);
 assert.match(read('.gitignore'), /service-account/);
});
test('the public job log carries counts only', () => {
 assert.match(read('scripts/send-push.mjs'), /console\.log\(JSON\.stringify\(\{activity, reminders\}\)\)/);
 assert.doesNotMatch(read('scripts/send-push.mjs').replace(/\/\/.*/g, ''), /token|\.text/);
});
test('users never see the name of the hosting provider', () => {
 const arabicNextToIt = /[؀-ۿ][^'"`<>\n]*Firebase|Firebase[^'"`<>\n]*[؀-ۿ]/;
 for (const name of ['index.html', 'src/services/accounts.js']) assert.doesNotMatch(read(name), arabicNextToIt);
});
