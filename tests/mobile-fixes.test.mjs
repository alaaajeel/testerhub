import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Phone fixes: bottom bar, back button, «اختباراتي» filter, bell count.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const approvedTest=vm.runInContext(html.slice(html.indexOf('const approvedTest='),html.indexOf(';',html.indexOf('const approvedTest=')))+';approvedTest',vm.createContext({}));

test('the bottom bar is never hidden because of focus alone',()=>{
 assert.doesNotMatch(html,/:focus-within\) \.nav\{display:none\}/);
 assert.match(html,/html\.keyboard-open \.nav\{display:none\}/);
 assert.match(html,/function watchKeyboard\(\)/);
 assert.match(html,/\['checkbox','radio','button','submit'/);
});
test('the back button is handled inside the app with a two-press exit',()=>{
 assert.match(html,/window\.addEventListener\('popstate',handleBack\)/);
 assert.match(html,/toast\('اضغط رجوع مرة ثانية للخروج'\)/);
 assert.match(html,/backNav\.exitUntil=Date\.now\(\)\+2000/);
 assert.match(html,/function render\(\)\{renderView\(\);trackScreen\(\)(;syncHelpHash\(\))?\}/);
});
test('«اختباراتي» keeps accepted or started tests only',()=>{
 assert.equal(approvedTest({invitationStatus:'pending'}),false);
 assert.equal(approvedTest({invitationStatus:'declined'}),false);
 assert.equal(approvedTest({}),false);
 assert.equal(approvedTest({invitationStatus:'accepted'}),true);
 assert.equal(approvedTest({joinedDay:'2026-11-01'}),true);
 assert.match(html,/const all=primaryAssignments\(\)\.filter\(approvedTest\)/);
 assert.match(html,/function testerHome\(\)\{const assignments=primaryAssignments\(\),/);
});
test('the bell counts only what has not been seen',()=>{
 assert.match(html,/return noticeKeys\(\)\.filter\(k=>!seen\.has\(k\)\)\.length/);
 assert.match(html,/markNoticesSeen\(\);/);
 assert.match(html,/'due:'\+a\.id\+':'\+day/);
});
