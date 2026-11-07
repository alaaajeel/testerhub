import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Help center: built-in content, merging owner edits, search, safe media and the support hand-off.
const ctx=vm.createContext({URL});
vm.runInContext(readFileSync(new URL('../src/help/content.js',import.meta.url),'utf8'),ctx);
const H=vm.runInContext('globalThis.TesterHubHelp',ctx);
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const admin=readFileSync(new URL('../src/admin.js',import.meta.url),'utf8');

test('every built-in article from the draft is present and valid',()=>{
 assert.equal(H.DEFAULTS.length,16);
 for(const a of H.DEFAULTS)assert.equal(H.validate({...a,status:'published'}).length,0,a.slug);
 for(const s of H.POPULAR)assert.ok(H.DEFAULTS.some(a=>a.slug===s),s);
 assert.equal(Object.keys(H.CATEGORIES).join(),'start,tester,developer,faq');
});
test('owner edits override, hidden removes, drafts and broken entries never show',()=>{
 const edit={slug:'xp',cat:'faq',title:'متى تنضاف النقاط؟',summary:'',steps:[{title:'أرسل',text:'تقرير'}],notice:'',imageUrl:'',videoUrl:'',order:1,status:'published'};
 const list=H.merge([edit,{slug:'account',status:'hidden'},{...edit,slug:'draft-new',status:'draft'},{...edit,slug:'broken',title:''},{...edit,slug:'new-one',order:2}]);
 assert.equal(list.find(a=>a.slug==='xp').title,'متى تنضاف النقاط؟');
 assert.equal(list[0].slug,'xp');
 assert.ok(!list.some(a=>a.slug==='account'));
 assert.ok(!list.some(a=>a.slug==='draft-new'||a.slug==='broken'));
 assert.ok(list.some(a=>a.slug==='new-one'));
 assert.equal(list.length,16);
});
test('Arabic search ignores hamza and taa marbuta forms and needs every word',()=>{
 const list=H.merge();
 assert.deepEqual([...H.search(list,'كلمة المرور')].map(a=>a.slug),['account']);
 assert.ok(H.search(list,'مجموعه').some(a=>a.slug==='tester-group'));
 assert.ok(H.search(list,'اضيف تطبيقي').some(a=>a.slug==='add-app'));
 assert.equal(H.search(list,'   ').length,0);
});
test('media: https only; videos only from known hosts; YouTube plays without cookies',()=>{
 assert.equal(H.safeHttps('http://x.com/a.png'),'');
 assert.equal(H.safeHttps('javascript:alert(1)'),'');
 assert.equal(H.video('https://www.youtube.com/watch?v=dQw4w9WgXcQ').embed,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(H.video('https://youtube.com/shorts/dQw4w9WgXcQ').embed,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(H.video('https://vimeo.com/123').embed,undefined);
 assert.equal(H.video('https://evil.example/v'),null);
 assert.ok(H.validate({...H.DEFAULTS[0],status:'published',videoUrl:'https://evil.example/v'}).length);
});
test('the app escapes article text and sends support to the existing admin messages',()=>{
 const page=html.slice(html.indexOf('function helpLink('),html.indexOf('function helpShell('));
 assert.doesNotMatch(page,/\$\{a\.(title|summary|notice)\}|\$\{s\.(title|text)\}/);
 assert.match(html,/if\(action==='help-support'\)[\s\S]{0,500}tab='support'/);
 assert.doesNotMatch(html,/تم إرسال تذكرة|التذكرة انرسلت/);
 assert.match(html,/<script src="\.\/src\/help\/content\.js"><\/script>/);
});
test('the console escapes everything it shows and records each change',()=>{
 const part=admin.slice(admin.indexOf('const HELP_STATUS='),admin.indexOf('async function loadFeatures('));
 assert.doesNotMatch(part,/'\+(r|a)\.(title|summary|notice|slug)\+'/);
 assert.match(part,/batchAudit\(batch,'save_help_article'/);
 assert.match(part,/batchAudit\(batch,'delete_help_article'/);
});
test('both the tester and the developer views include the help page',()=>{
 const line=html.match(/const screens=([^\n]*);/)[1];
 assert.equal((line.match(/help:helpPage/g)||[]).length,2);
});
