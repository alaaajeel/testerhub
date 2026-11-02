import {test,expect} from '@playwright/test';
// Browser integration doubles. Actual Firebase behavior is tested separately with emulators.
async function setup(page,{profile=null,loggedIn=false}={}) {
 await page.addInitScript(({profile,loggedIn})=>{
  window.fixture={profile,verified:false,failSave:false};
  window.fakeAuth={currentUser:loggedIn?{uid:'u1',email:'test@example.com',emailVerified:false}:null,authStateReady:async()=>{}};
 },{profile,loggedIn});
 const app=`export const initializeApp=()=>({});`;
 const auth=`const a=window.fakeAuth;export const getAuth=()=>a;
 export const onAuthStateChanged=(_,cb)=>{window.authCallback=cb;return ()=>{}};
 export const createUserWithEmailAndPassword=async(_,email)=>{a.currentUser={uid:'u1',email,emailVerified:false};return {user:a.currentUser}};
 export const signInWithEmailAndPassword=createUserWithEmailAndPassword;
 export const signOut=async()=>{a.currentUser=null;window.authCallback?.(null)};
 export const sendEmailVerification=async()=>{};
 export const sendPasswordResetEmail=async()=>{};
 export const reload=async u=>{u.emailVerified=window.fixture.verified};
 export const getIdToken=async()=>'';`;
 const store=`export const getFirestore=()=>({});export const doc=(_,c,id)=>({c,id});
 const snap=()=>({exists:()=>!!window.fixture.profile,data:()=>window.fixture.profile});
 export const getDocFromServer=async()=>snap();
 export const runTransaction=async(_,fn)=>fn({get:async()=>snap(),set:(_,value)=>{if(window.fixture.failSave)throw Object.assign(Error(),{code:'permission-denied'});window.fixture.profile=value}});
 export const serverTimestamp=()=>1;
 export const updateDoc=async(_,v)=>{if(window.fixture.failSave)throw Object.assign(Error(),{code:'permission-denied'});Object.assign(window.fixture.profile,v)};
 export const collection=()=>({});export const query=()=>({});export const where=()=>({});
 export const getDocs=async()=>({docs:[]});export const getDocsFromServer=getDocs;
 export const onSnapshot=()=>()=>{};`;
 await page.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'application/javascript',body:route.request().url().endsWith('firebase-app.js')?app:route.request().url().endsWith('firebase-auth.js')?auth:store}));
 await page.goto('/');
 await expect(page.locator('#launch-splash')).toHaveCount(0);
}
test('signup consent is opt-in and verification gate blocks dashboards',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await setup(page);await page.locator('[data-auth="signup"]').first().click();
 await expect(page.locator('[name="available"]')).not.toBeChecked();
 await page.locator('#auth-name').fill('مختبر جديد');await page.locator('#auth-email').fill('test@example.com');await page.locator('#auth-password').fill('password123');
 await page.locator('#auth-form button[type="submit"]').click();
 await expect(page.locator('[data-action="send-verification"]')).toBeVisible();
 await expect(page.locator('.nav')).toHaveCount(0);
 await page.locator('[data-action="send-verification"]').click();
 await expect(page.locator('#toast')).toContainText('تم إرسال');
 await page.evaluate(()=>window.fixture.verified=true);
 await page.locator('[data-action="check-verification"]').click();await expect(page.locator('.nav')).toBeVisible();
 expect(errors).toEqual([]);
});
test('orphan account recovers same UID then requires verification',async({page})=>{
 await setup(page,{loggedIn:true});await expect(page.locator('#complete-profile-form')).toBeVisible();
 await page.locator('#recover-name').fill('مطور جديد');await page.locator('#recover-role').selectOption('developer');
 await page.locator('#complete-profile-form button').click();await expect(page.locator('[data-action="check-verification"]')).toBeVisible();
 expect(await page.evaluate(()=>window.fakeAuth.currentUser.uid)).toBe('u1');
});
test('reset password uses neutral confirmation',async({page})=>{
 await setup(page);await page.locator('#auth-email').fill('unknown@example.com');await page.locator('[data-action="reset-password"]').click();await expect(page.locator('#toast')).toContainText('إذا كان البريد مسجلاً');
});
test('profile writes confirm success only after accepted save; logout removes private UI',async({page})=>{
 await setup(page,{loggedIn:true,profile:{name:'Old Name',role:'tester',available:true}});
 await page.evaluate(()=>window.fixture.verified=true);await page.locator('[data-action="check-verification"]').click();
 await page.locator('.nav [data-tab="profile"]').click();
 await page.locator('#profile-name').fill('اسم جديد');await page.locator('[name="paused"]').check();await page.locator('#profile-form button').click();
 await expect(page.locator('#toast')).toContainText('تم حفظ');expect(await page.evaluate(()=>window.fixture.profile.available)).toBe(false);
 await page.evaluate(()=>window.fixture.failSave=true);await page.locator('#profile-name').fill('اسم مرفوض');await page.locator('#profile-form button').click();await expect(page.locator('#toast')).toContainText('رفضت قاعدة البيانات');
 await page.locator('[data-action="logout"]').click();await expect(page.locator('#auth-form')).toBeVisible();await expect(page.locator('#profile-form')).toHaveCount(0);
});
