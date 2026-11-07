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
test('with the feature off, old opening records are neither read nor shown',async()=>{
 const reads=[];
 const ctx=vm.createContext({isDemo:false,features:{officialGroup:false},storeFns:{collection:()=>reads.push('collection'),query:()=>reads.push('query'),where:()=>({}),limit:()=>({})},db:{},console});
 const groupData=vm.runInContext(from('async function groupData(','const stamp=')+';groupData',ctx);
 const data=await groupData({uid:'t1',role:'tester'},async()=>{reads.push('read');return {docs:[]}});
 assert.equal(JSON.stringify(data),'{"openings":[],"joinRequests":[]}');
 assert.equal(reads.length,0);
 // Even if old cards were already loaded, the tester sees nothing and the developer sees no group controls.
 const ui=vm.createContext({features:{officialGroup:false},user:{uid:'t1'},dashboard:{assignments:[],openings:[{id:'p1',status:'open',ownerUid:'d1',name:'App'}],joinRequests:[]}});
 const card=vm.runInContext(from('function officialGroupCard(','function projectDetails(')+';officialGroupCard',ui);
 assert.equal(card(),'');
 const mode=vm.runInContext(from('function testModeSection(','function officialGroupCard(')+';testModeSection',ui);
 assert.equal(mode({id:'p1',status:'recruiting',testMode:'group'}),'');
});
test('with the feature off, the app refuses to send a request or change the test mode',()=>{
 assert.match(from('async function requestToJoin(','async function cancelJoinRequest('),/if\(!features\.officialGroup\)throw Error/);
 assert.match(from('async function setProjectTestMode(','async function requestToJoin('),/if\(!features\.officialGroup\)throw Error/);
});
