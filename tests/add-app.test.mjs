import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Phase 4: who is eligible, the prepared snapshot, and the CSV Play Console imports.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const from=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const ctx=vm.createContext({dashboard:{testers:[]},user:{uid:'d1'}});
const x=vm.runInContext(from('const MAX_INVITES=','function downloadTestersCsv(')+';({MAX_INVITES,eligibleTesters,prepareTesters,preparedList,testersCsv,reset:()=>{preparedTesters=null}})',ctx);
const t=(uid,extra={})=>({uid,name:'N '+uid,email:uid+'@example.com',available:true,...extra});

test('eligible means consented, has an email, is not the developer, and fits the 400 cap',()=>{
 ctx.dashboard.testers=[t('a'),t('b',{available:false}),t('c',{email:''}),t('d1'),...Array.from({length:450},(_,i)=>t('x'+i))];
 const list=x.eligibleTesters();
 assert.equal(list.length,x.MAX_INVITES);
 assert.equal(list[0].uid,'a');
 assert.ok(!list.some(r=>['b','c','d1'].includes(r.uid)));
});
test('the prepared list is a snapshot: later arrivals are excluded, people who left are dropped',()=>{
 x.reset();ctx.dashboard.testers=[t('a'),t('b')];
 assert.equal(x.preparedList().length,0);
 x.prepareTesters();
 ctx.dashboard.testers.push(t('late'));
 ctx.dashboard.testers[1].available=false;
 assert.deepEqual(x.preparedList().map(r=>r.uid),['a']);
 ctx.dashboard.testers=[];assert.throws(()=>x.prepareTesters(),/لا يوجد مختبرون/);
});
test('CSV: one trimmed address per line, no header, no names, junk skipped',()=>{
 const csv=x.testersCsv([t('a'),{email:' b@example.com '},{email:'bad email'},{email:'x,y@z.com'},{email:'"q"@z.com'}]);
 assert.equal(csv,'a@example.com\r\nb@example.com\r\n');
 assert.doesNotMatch(csv,/N a|name/);
});
test('the form itself never renders tester names or emails',()=>{
 const form=from('function newProject(){','\nfunction ');
 assert.doesNotMatch(form,/t\.email|t\.name|testerUid/);
 assert.match(form,/prepareCard\(\)/);
 assert.match(form,/أؤكد أني أضفت بريد مجموعة Google أو إيميلات المختبرين في Play Console/);
 assert.match(form,/OFFICIAL_GROUP\.email/);
 assert.match(form,/OFFICIAL_GROUP\.url/);
 const rows=from('function testerRow(','function prepareCard(');
 assert.doesNotMatch(rows,/email/);
});
