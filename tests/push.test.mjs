import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

// Runs the real service worker source against a fake browser.
function worker({windows = []} = {}) {
  const handlers = {}, shown = [], opened = [];
  const self = {
    addEventListener: (name, fn) => { handlers[name] = fn; },
    location: {origin: 'https://testiqx.web.app'},
    registration: {scope: 'https://testiqx.web.app/', showNotification: async (title, options) => { shown.push({title, ...options}); }},
    clients: {matchAll: async () => windows, openWindow: async url => { opened.push(url); }, claim() {}},
    skipWaiting() {},
  };
  vm.runInNewContext(read('sw.js').replace('__VERSION__', 'test').replace('__SHELL__', '[]'), {self, URL, caches: {}, fetch() {}, Response: {}, Promise});
  const fire = async (name, event) => { let work; handlers[name]({...event, waitUntil: p => { work = p; }}); await work; };
  return {fire, shown, opened};
}
const push = data => ({data: {json: () => ({data, from: '776338360189'})}});

test('a background push shows the reminder with its link', async () => {
 const sw = worker();
 await sw.fire('push', push({title: 'حان وقت اختبار اليوم', body: 'تطبيق: مهمة', url: './#/report/p_t'}));
 assert.equal(sw.shown.length, 1);
 assert.equal(sw.shown[0].title, 'حان وقت اختبار اليوم');
 assert.equal(sw.shown[0].tag, 'testerhub-daily', 'shares a tag with the in-app reminder so they never stack');
 assert.equal(sw.shown[0].data.url, './#/report/p_t');
});
test('a focused app gets the reminder as a message rather than a notification', async () => {
 const posted = [], sw = worker({windows: [{focused: true, postMessage: m => posted.push(m)}]});
 await sw.fire('push', push({title: 'T', body: 'B', url: './#/home'}));
 assert.equal(sw.shown.length, 0);
 assert.equal(posted[0].type, 'testerhub-reminder');
 assert.equal(posted[0].body, 'B');
});
test('an unreadable push still shows something, as browsers require', async () => {
 const sw = worker();
 await sw.fire('push', {data: {json: () => { throw new Error('bad'); }}});
 assert.equal(sw.shown[0].title, 'TesterHub');
});
test('clicking a reminder opens its screen, in an open window if there is one', async () => {
 const notification = {close() {}, data: {url: './#/report/p_t'}};
 const closed = worker();
 await closed.fire('notificationclick', {notification});
 assert.deepEqual(closed.opened, ['https://testiqx.web.app/#/report/p_t']);
 const visited = [], focused = [], client = {navigate: async url => { visited.push(url); return client; }, focus: async () => { focused.push(1); }};
 const open = worker({windows: [client]});
 await open.fire('notificationclick', {notification});
 assert.deepEqual(visited, ['https://testiqx.web.app/#/report/p_t']);
 assert.equal(focused.length, 1);
});
test('a notification link can never leave the site', async () => {
 const sw = worker();
 await sw.fire('notificationclick', {notification: {close() {}, data: {url: 'https://evil.example/x'}}});
 assert.deepEqual(sw.opened, []);
});
test('the schedule uses only a secret, runs hourly and installs no dev tools', () => {
 const flow = read('.github/workflows/reminders.yml');
 assert.match(flow, /cron: '17 \* \* \* \*'/);
 assert.match(flow, /FIREBASE_SERVICE_ACCOUNT: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT \}\}/);
 assert.match(flow, /permissions:\n {2}contents: read/);
 assert.match(flow, /npm ci --omit=dev/);
});
test('the Admin SDK never reaches the website and service account files are ignored', () => {
 const pkg = JSON.parse(read('package.json'));
 assert.ok(pkg.dependencies['firebase-admin'], 'the job installs with --omit=dev');
 for (const path of ['src/main.js', 'src/store.js', 'src/reminders.js', 'src/firebase.js', 'sw.js']) assert.doesNotMatch(read(path), /firebase-admin|FIREBASE_SERVICE_ACCOUNT/);
 assert.match(read('.gitignore'), /\*service-account\*\.json/);
 assert.match(read('.gitignore'), /\*firebase-adminsdk\*\.json/);
});
test('the hosting policy still allows Google sign-in and token registration', () => {
 const headers = JSON.parse(read('firebase.json')).hosting.headers.find(h => h.source === '**').headers;
 const csp = headers.find(h => h.key === 'Content-Security-Policy').value;
 assert.match(csp, /script-src[^;]*https:\/\/apis\.google\.com/);
 assert.match(csp, /frame-src[^;]*https:\/\/testhubiq-c7711\.firebaseapp\.com/);
 assert.match(csp, /connect-src[^;]*https:\/\/\*\.googleapis\.com/, 'fcmregistrations and firebaseinstallations');
 assert.match(csp, /worker-src 'self'/);
});
