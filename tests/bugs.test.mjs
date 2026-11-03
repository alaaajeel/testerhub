import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const context=vm.createContext({});
vm.runInContext(html.slice(html.indexOf('function validateBug('),html.indexOf('async function submitDailyReport(')),context);
const bug={title:'Search error',steps:'Open search and submit a word',expected:'Show results',actual:'App closes',severity:'high'};
test('issue details are trimmed and incomplete or invalid details rejected',()=>{
 assert.equal(context.validateBug('issue',{...bug,title:' Search error '}).title,'Search error');
 for(const b of [undefined,{...bug,steps:''},{...bug,severity:'admin'},{...bug,title:'a'.repeat(121)}])assert.throws(()=>context.validateBug('issue',b));
});
test('normal reports never retain stale hidden bug details',()=>assert.equal(context.validateBug('ok',bug),null));
