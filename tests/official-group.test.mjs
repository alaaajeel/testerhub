import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Official Google Group and self-join: off by default, honest about what TesterHub can and cannot know.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const from=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));

test('the feature is off unless the platform owner turns it on',()=>{
 assert.match(html,/let features=\{officialGroup:false\}/);
 assert.match(from('async function loadFeatures(','async function groupData('),/officialGroup===true/);
 assert.match(from('function testModeSection(','function officialGroupCard('),/if\(!features\.officialGroup/);
 assert.match(from('function officialGroupCard(','function projectDetails('),/if\(!features\.officialGroup\)return ''/);
 assert.match(rules,/function featureOn\(name\)/);
});
test('the official group address and link are exact',()=>{
 assert.match(html,/url:'https:\/\/groups\.google\.com\/g\/testerhubiq',email:'testerhubiq@googlegroups\.com'/);
});
test('joining the group is never presented as enrolment in a Google Play test',()=>{
 const tester=from('function officialGroupCard(','function projectDetails(');
 assert.match(tester,/الانضمام للمجموعة ما يسجّلك تلقائياً باختبار أي تطبيق/);
 assert.match(tester,/TesterHub ما يگدر يتحقق من عضويتك بالمجموعة/);
 const developer=from('function testModeSection(','function officialGroupCard(');
 assert.match(developer,/عضوية المجموعة ما تعني اشتراك المختبر بالاختبار/);
 assert.match(developer,/opt-in/);
});
test('approval sends a fresh invitation and never starts the 14 days',()=>{
 const approve=from('function invitationFields(','async function getDashboard(');
 assert.match(approve,/invitationStatus:'pending',joinedDay:null,checkins:\[\]/);
 assert.doesNotMatch(approve,/joinedDay:dayKey|joinedDay:api\.dayKey|joinedAt/);
});
test('the waiting list is first come, first served, and stable',()=>{
 const ctx=vm.createContext({dashboard:{joinRequests:[
  {id:'p1_b',projectId:'p1',status:'waiting',updatedAt:'2026-11-07T10:00:00Z'},
  {id:'p1_a',projectId:'p1',status:'waiting',updatedAt:'2026-11-07T09:00:00Z'},
  {id:'p1_c',projectId:'p1',status:'approved',updatedAt:'2026-11-07T08:00:00Z'},
  {id:'p2_a',projectId:'p2',status:'waiting',updatedAt:'2026-11-07T07:00:00Z'}]}});
 const queue=vm.runInContext(from('const stamp=','async function setProjectTestMode(')+';waitingQueue',ctx);
 assert.deepEqual(queue('p1').map(r=>r.id),['p1_a','p1_b']);
});
test('old invitations keep working: the email list path is unchanged and still first',()=>{
 assert.match(rules,/profile\(request\.resource\.data\.testerUid\)\.data\.available == true\n?\r?\n? *\|\| \(exists\(\/databases\/\$\(database\)\/documents\/joinRequests/);
 assert.match(html,/const OFFICIAL_GROUP=/);
});
