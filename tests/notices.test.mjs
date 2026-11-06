import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Phase 5: which admin notices a member sees, and how the admin panel and app are wired.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const admin=readFileSync(new URL('../src/admin.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const indexes=JSON.parse(readFileSync(new URL('../firestore.indexes.json',import.meta.url),'utf8'));
const from=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const n=vm.runInContext(from('const NOTICE_KINDS=','async function loadAdminNotices(')+';({noticesFor,NOTICE_KINDS})',vm.createContext({}));
const at=iso=>({toMillis:()=>Date.parse(iso)});
const list=[
 {id:'all',audience:'all',active:true,createdAt:at('2026-11-01T10:00:00Z')},
 {id:'dev',audience:'developers',active:true,createdAt:at('2026-11-03T10:00:00Z')},
 {id:'test',audience:'testers',active:true,createdAt:at('2026-11-02T10:00:00Z')},
 {id:'gone',audience:'all',active:false,createdAt:at('2026-11-04T10:00:00Z')},
 {id:'mine',audience:'user',targetUid:'t1',active:true,createdAt:at('2026-11-05T10:00:00Z')}
];
test('members see broadcasts for their current side plus their own notices, newest first, never withdrawn ones',()=>{
 assert.deepEqual(n.noticesFor(list,'tester').map(x=>x.id),['mine','test','all']);
 assert.deepEqual(n.noticesFor(list,'developer').map(x=>x.id),['mine','dev','all']);
 assert.deepEqual(Object.keys(n.NOTICE_KINDS),['announcement','update','instruction']);
});
test('the app reads broadcasts and its own notices with separate, rule-provable queries',()=>{
 const load=from('async function loadAdminNotices(','async function markAdminNoticesRead(');
 assert.match(load,/where\('broadcast','==',true\),orderBy\('createdAt','desc'\),limit\(NOTICE_LIMIT\)/);
 assert.match(load,/where\('targetUid','==',active\.uid\),orderBy\('createdAt','desc'\),limit\(NOTICE_LIMIT\)/);
 for(const f of ['broadcast','targetUid'])assert.ok(indexes.indexes.some(i=>i.collectionGroup==='announcements'&&i.fields.map(x=>x.fieldPath+':'+x.order).join()===f+':ASCENDING,createdAt:DESCENDING'));
 assert.match(from('async function markAdminNoticesRead(','const messageRetryIds'),/readAt:storeFns\.serverTimestamp\(\)/);
});
test('unread admin notices count on the bell and reads are throttled for Spark',()=>{
 assert.match(html,/\.\.\.unreadAdminNotices\(\)\.map\(n=>'admin:'\+n\.id\)/);
 assert.match(html,/return noticeKeys\(\)\.filter\(k=>!seen\.has\(k\)\)\.length/);
 assert.match(html,/Date\.now\(\)-adminNotices\.loadedAt<600000/);
});
test('admin panel: new tab, permission, composer and audit on every send or withdrawal',()=>{
 assert.match(page,/data-tab="announcements">مركز الإشعارات</);
 assert.match(page,/<form id="composer"/);
 assert.match(admin,/\['sendAnnouncements','إرسال إعلانات الإدارة'/);
 assert.match(admin,/announcements:\{title:'مركز إشعارات الإدارة',perm:'sendAnnouncements'/);
 const send=admin.slice(admin.indexOf('async function sendAnnouncement('),admin.indexOf('async function toggleNotice('));
 assert.match(send,/batchAudit\(batch,'send_announcement'/);
 assert.match(send,/broadcast:audience!=='user'/);
 assert.match(send,/confirmDialog/);
 const toggle=admin.slice(admin.indexOf('async function toggleNotice('),admin.indexOf('function syncComposer('));
 assert.match(toggle,/withdraw_announcement/);
 assert.doesNotMatch(toggle,/delete/);
});
