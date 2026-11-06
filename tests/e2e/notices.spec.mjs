import {test,expect} from '@playwright/test';
// Phase 5: admin notices in the app bell (demo store) and the admin composer (in-browser Firebase doubles).
// Who may read and write is proven in tests/emulator/announcements.rules.test.mjs.

const ago=h=>new Date(Date.now()-h*3600000).toISOString();
async function openApp(page,role='tester',notices=[]){
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {};'}));
 await page.goto('/');await expect(page.locator('#launch-splash')).toHaveCount(0);
 await page.evaluate(async({role,notices})=>{resetDemo();const d=demoState();d.announcements=notices;save(d);adminNotices={items:[],readAt:0,loadedAt:0,uid:null};user=await api.switchDemo(role);tab='home';await refresh()},{role,notices});
}
const n=(id,extra={})=>({id,kind:'announcement',audience:'all',broadcast:true,targetUid:'',title:'عنوان '+id,body:'نص '+id,active:true,createdAt:ago(1),...extra});

test('a tester sees unread admin notices on the bell, and opening it marks them read',async({page})=>{
 await openApp(page,'tester',[n('a1',{kind:'update',title:'تحديث جديد للمنصة'}),n('a2',{audience:'testers',kind:'instruction',title:'تعليمات للمختبرين'}),n('a3',{audience:'developers',title:'للمطورين فقط'})]);
 const before=await page.evaluate(()=>noticeBadgeCount());
 expect(await page.evaluate(()=>unreadAdminNotices().length)).toBe(2);
 await page.locator('[data-action="notice"]').click();
 const sheet=page.locator('.notices-sheet');
 await expect(sheet.locator('.notice-section-title',{hasText:'إعلانات الإدارة'})).toBeVisible();
 await expect(sheet.locator('.admin-notice')).toHaveCount(2);
 await expect(sheet.locator('.admin-notice.unread')).toHaveCount(2);
 await expect(sheet).toContainText('تحديث جديد للمنصة');
 await expect(sheet).toContainText('تعليمات مهمة');
 await expect(sheet).not.toContainText('للمطورين فقط');
 expect(await page.evaluate(()=>demoState().noticeReadAt.t1)).toBeGreaterThan(0);
 await page.locator('.notices-header [data-action="close-notices"]').click();
 expect(await page.evaluate(()=>unreadAdminNotices().length)).toBe(0);
 expect(await page.evaluate(()=>noticeBadgeCount())).toBe(before-2);
});

test('the history page lists all notices and withdrawn ones never show',async({page})=>{
 await openApp(page,'tester',[n('h1'),n('h2',{active:false,title:'مسحوب'}),n('h3',{createdAt:ago(30)}),n('h4',{createdAt:ago(50)})]);
 await page.locator('[data-action="notice"]').click();
 await page.locator('[data-action="notice-go-announcements"]').click();
 await expect(page.locator('.lead',{hasText:'إعلانات الإدارة'})).toBeVisible();
 await expect(page.locator('#page .admin-notice, main .admin-notice, .admin-notice')).toHaveCount(3);
 await expect(page.locator('body')).not.toContainText('مسحوب');
});

test('a private notice reaches only its target',async({page})=>{
 const notices=[n('p1',{audience:'user',broadcast:false,targetUid:'t1',title:'رسالة خاصة لك'})];
 await openApp(page,'tester',notices);
 await page.locator('[data-action="notice"]').click();
 await expect(page.locator('.notices-sheet')).toContainText('رسالة خاصة لك');
 await expect(page.locator('.notices-sheet .notice-kind')).toContainText('لك');
 await openApp(page,'developer',notices);
 await page.locator('[data-action="notice"]').click();
 await expect(page.locator('.notices-sheet')).not.toContainText('رسالة خاصة لك');
});

test('developers see developer and all-user notices',async({page})=>{
 await openApp(page,'developer',[n('d1',{audience:'developers',title:'تحديث للمطورين'}),n('d2',{audience:'testers',title:'للمختبرين'})]);
 await page.locator('[data-action="notice"]').click();
 await expect(page.locator('.notices-sheet')).toContainText('تحديث للمطورين');
 await expect(page.locator('.notices-sheet')).not.toContainText('للمختبرين');
});

test('notices fit a phone screen',async({page})=>{
 await openApp(page,'tester',[n('m1',{title:'عنوان طويل جداً '.repeat(4),body:'نص طويل جداً بدون مسافات_'.repeat(20)})]);
 await page.evaluate(()=>{tab='announcements';render()});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

// Admin panel with in-browser Firebase doubles.
async function openAdmin(page){
 await page.addInitScript(()=>{
  window.fs={n:0,batches:[],docs:{
   'adminRoles/owner':{active:true},
   'users/t7':{name:'Seven',email:'seven@example.com',role:'tester'},
   'announcements/old':{kind:'announcement',audience:'all',broadcast:true,targetUid:'',title:'إعلان قديم',body:'نص قديم',active:true,createdBy:'owner',createdAt:{toDate:()=>new Date('2026-11-01T10:00:00Z')}}
  }};
 });
 const store=`const F=window.fs;
 export const getFirestore=()=>({});export const collection=(_,name)=>({__col:true,name});
 export const doc=(a,c,id)=>a&&a.__col?{c:a.name,id:'auto'+(++F.n)}:{c,id};
 const key=r=>r.c+'/'+r.id;const snap=(c,id)=>{const data=F.docs[c+'/'+id];return {id,exists:()=>!!data,data:()=>data}};
 export const getDoc=async r=>snap(r.c,r.id);
 export const where=(f,op,v)=>({where:[f,v]});export const orderBy=()=>({});export const limit=()=>({});export const startAfter=()=>({});export const documentId=()=>'__id';
 export const query=(col,...parts)=>({col:col.name,w:parts.filter(p=>p.where).map(p=>p.where)});
 export const getDocs=async q=>{const col=q.col||q.name,w=q.w||[];const docs=Object.keys(F.docs).filter(k=>k.startsWith(col+'/')&&w.every(([f,v])=>F.docs[k][f]===v)).map(k=>snap(col,k.slice(col.length+1)));return {docs,size:docs.length,empty:!docs.length}};
 export const getCountFromServer=async()=>({data:()=>({count:0})});
 export const serverTimestamp=()=>({server:true});export const deleteField=()=>({deleted:true});
 export const writeBatch=()=>{const ops=[];return {set:(r,v)=>ops.push({op:'set',path:key(r),value:v}),update:(r,v)=>ops.push({op:'update',path:key(r),value:v}),delete:r=>ops.push({op:'delete',path:key(r)}),commit:async()=>{F.batches.push(ops);for(const o of ops){if(o.op==='set')F.docs[o.path]={...o.value};if(o.op==='update')Object.assign(F.docs[o.path],o.value)}}}};`;
 const auth=`const account={uid:'owner',email:'owner@example.com'};export const getAuth=()=>({});export const onAuthStateChanged=(_,cb)=>{setTimeout(()=>cb(account),0);return()=>{}};export const getIdTokenResult=async()=>({claims:{email_verified:true}});`;
 await page.route('**/firebase-config.js',route=>route.fulfill({contentType:'application/javascript',body:'window.TESTERHUB_FIREBASE_CONFIG = {apiKey:"test",projectId:"demo-testerhub"};'}));
 await page.route('https://www.gstatic.com/firebasejs/**',route=>{const u=route.request().url();route.fulfill({contentType:'application/javascript',body:u.endsWith('firebase-app.js')?'export const initializeApp=()=>({});':u.endsWith('firebase-auth.js')?auth:store})});
 await page.goto('/admin.html');
 await expect(page.locator('#console')).toBeVisible();
 await page.locator('[data-tab="announcements"]').click();
 await expect(page.locator('#composer')).toBeVisible();
}

test('admin sends an announcement to developers with an audit entry in the same batch',async({page})=>{
 await openAdmin(page);
 await expect(page.locator('#items')).toContainText('إعلان قديم');
 await page.locator('#composer [name="kind"]').selectOption('update');
 await page.locator('#composer [name="audience"]').selectOption('developers');
 await page.locator('#composer [name="title"]').fill('تحديث مهم');
 await page.locator('#composer [name="body"]').fill('نزلنا تحسين جديد على تقارير الاختبار.');
 await page.locator('#composer button[type="submit"]').click();
 await page.locator('dialog #ok').click();
 await expect(page.locator('#toast')).toContainText('تم إرسال الإعلان');
 const batch=await page.evaluate(()=>window.fs.batches.at(-1));
 expect(batch).toHaveLength(2);
 expect(batch[0].path).toMatch(/^announcements\//);
 expect(batch[0].value).toEqual({kind:'update',audience:'developers',broadcast:true,targetUid:'',title:'تحديث مهم',body:'نزلنا تحسين جديد على تقارير الاختبار.',active:true,createdBy:'owner',createdAt:{server:true}});
 expect(batch[1]).toMatchObject({path:expect.stringMatching(/^adminAuditLogs\//),value:{actorUid:'owner',action:'send_announcement',targetName:'تحديث مهم'}});
 await expect(page.locator('#composer [name="title"]')).toHaveValue('');
});

test('admin messages one user by email, and an unknown email is refused',async({page})=>{
 await openAdmin(page);
 await page.locator('#composer [name="audience"]').selectOption('user');
 await expect(page.locator('#composer [data-for="user"]')).toBeVisible();
 await page.locator('#composer [name="email"]').fill('nobody@example.com');
 await page.locator('#composer [name="title"]').fill('رسالة لك');
 await page.locator('#composer [name="body"]').fill('نحتاج تأكيد بريدك');
 await page.locator('#composer button[type="submit"]').click();
 await expect(page.locator('#toast')).toContainText('ما لگينا مستخدم');
 await page.locator('#composer [name="email"]').fill('Seven@Example.com');
 await page.locator('#composer button[type="submit"]').click();
 await page.locator('dialog #ok').click();
 await expect(page.locator('#toast')).toContainText('تم إرسال الإعلان');
 const [sent]=await page.evaluate(()=>window.fs.batches.at(-1));
 expect(sent.value).toMatchObject({audience:'user',broadcast:false,targetUid:'t7'});
});

test('cancelling the confirmation sends nothing; withdrawing keeps the notice',async({page})=>{
 await openAdmin(page);
 await page.locator('#composer [name="title"]').fill('مسودة');
 await page.locator('#composer [name="body"]').fill('ما راح ينرسل');
 await page.locator('#composer button[type="submit"]').click();
 await page.locator('dialog button[value="cancel"]').click();
 expect(await page.evaluate(()=>window.fs.batches.length)).toBe(0);
 await page.locator('[data-action="toggle-notice"][data-id="old"]').click();
 await page.locator('dialog #ok').click();
 await expect(page.locator('#toast')).toContainText('تم سحب الإعلان');
 const ops=await page.evaluate(()=>window.fs.batches.at(-1));
 expect(ops[0]).toEqual({op:'update',path:'announcements/old',value:{active:false}});
 expect(ops[1].value.action).toBe('withdraw_announcement');
 expect(await page.evaluate(()=>!!window.fs.docs['announcements/old'])).toBe(true);
});
