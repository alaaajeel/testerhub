import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Developer participation numbers: TesterHub records only, never shown as Google Play data.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const from=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const today=new Date(),key=n=>new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-n)).toISOString().slice(0,10);
const daysSince=eval(html.match(/const daysSince=(\(dateKey\)=>\{[^\n]*?\});/)[1]);
const ctx=vm.createContext({api:{daysSince}});
const stats=vm.runInContext(from('const INACTIVE_AFTER_DAYS=','function participationPanel(')+';participationStats',ctx);
const plain=v=>JSON.parse(JSON.stringify(v));
const days=(start,n)=>Array.from({length:n},(_,i)=>key(start-i));

test('counts invitations, acceptance, confirmed starts, activity and reports from TesterHub records',()=>{
 const assignments=[
  {invitationStatus:'pending',checkins:[]},                                   // sent, not answered
  {invitationStatus:'declined',checkins:[]},                                  // sent, declined
  {invitationStatus:'accepted',joinedDay:null,checkins:[]},                   // accepted, not started
  {invitationStatus:'accepted',joinedDay:key(3),checkins:[key(3),key(2),key(0)]}, // active: reported today
  {invitationStatus:'accepted',joinedDay:key(5),checkins:[key(5),key(4)]},    // quiet for 3 days: inactive
  {joinedDay:key(1),checkins:[]},                                             // legacy, started yesterday: active
  {invitationStatus:'accepted',joinedDay:key(16),checkins:days(16,14)},       // completed 14 days
  {invitationStatus:'accepted',joinedDay:key(20),checkins:days(20,3)}         // window over, not completed
 ];
 const reports=[{reviewStatus:'accepted'},{reviewStatus:'rejected'},{},{reviewStatus:'accepted'}];
 const st=plain(stats(assignments,reports));
 assert.equal(st.invited,8);
 assert.equal(st.accepted,6);
 assert.equal(st.started,5);
 assert.equal(st.completed,1);
 assert.equal(st.running,3);
 assert.equal(st.active,2);
 assert.equal(st.inactive,1);
 assert.equal(st.reports,4);
 assert.equal(st.acceptedReports,2);
 assert.equal(st.progress,Math.round((3+2+0+14+3)/(5*14)*100));
});
test('an empty app shows zeros, not invented numbers',()=>{
 assert.deepEqual(plain(stats([],[])),{invited:0,accepted:0,started:0,running:0,active:0,inactive:0,completed:0,reports:0,acceptedReports:0,days:0,progress:0});
});
test('the panel says the numbers are TesterHub records, not Google Play data',()=>{
 const panel=from('function participationPanel(','function lastActive(');
 assert.match(panel,/من سجلات TesterHub/);
 assert.match(panel,/وليست بيانات اشتراك مؤكدة من Google Play/);
 assert.match(html,/participationPanel\(participationStats\(assignments,reports\),'مؤشرات المشاركة'\)/);
});
