import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
// Phase 1 daily testing: pure helpers run in isolation, plus structural checks of the form and rules.
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('const REPORT_OUTCOMES='),html.indexOf('async function submitDailyReport('));
const h=vm.runInContext(helpers+';({REPORT_OUTCOMES,REPORT_REVIEWS,needsFollowUp,messagePrefix,validateDailyReport,reportDayNumber})',vm.createContext({}));
const section=(from,to)=>html.slice(html.indexOf(from),html.indexOf(to,html.indexOf(from)));

test('three outcomes keep the original stored values and add blocked',()=>{
 assert.deepEqual(Object.keys(h.REPORT_OUTCOMES),['ok','issue','blocked']);
 assert.equal(h.REPORT_OUTCOMES.ok,'اشتغل بدون مشاكل');
 assert.equal(h.REPORT_OUTCOMES.issue,'واجهت مشكلة');
 assert.equal(h.REPORT_OUTCOMES.blocked,'ما گدرت أكمل');
 assert.equal(h.needsFollowUp({outcome:'issue'}),true);
 assert.equal(h.needsFollowUp({outcome:'blocked'}),true);
 assert.equal(h.needsFollowUp({outcome:'ok'}),false);
 assert.equal(h.needsFollowUp(undefined),false);
});
test('report validation needs an outcome and one short meaningful sentence',()=>{
 assert.throws(()=>h.validateDailyReport({notes:'جرّبت تسجيل الدخول'}),/اختر شلون كانت التجربة/);
 assert.throws(()=>h.validateDailyReport({outcome:'skipped',notes:'جرّبت تسجيل الدخول'}),/اختر/);
 assert.throws(()=>h.validateDailyReport({outcome:'toString',notes:'جرّبت تسجيل الدخول'}),/اختر/);
 assert.throws(()=>h.validateDailyReport({outcome:'ok',notes:'   تمام   '}),/10 أحرف/);
 assert.throws(()=>h.validateDailyReport({outcome:'ok',notes:'x'.repeat(801)}),/800/);
 assert.deepEqual({...h.validateDailyReport({outcome:'blocked',notes:'  التطبيق ما ينفتح أبداً  '})},{outcome:'blocked',notes:'التطبيق ما ينفتح أبداً'});
});
test('report day number follows the existing UTC join-date counting',()=>{
 assert.equal(h.reportDayNumber({date:'2026-11-01'},{joinedDay:'2026-11-01'}),1);
 assert.equal(h.reportDayNumber({date:'2026-11-03'},{joinedDay:'2026-11-01'}),3);
 assert.equal(h.reportDayNumber({date:'2026-03-01'},{joinedDay:'2026-02-27'}),3);
 assert.equal(h.reportDayNumber({date:'2026-11-14'},{joinedDay:'2026-11-01'}),14);
 assert.equal(h.reportDayNumber({date:'2026-11-01'},{joinedDay:null}),null);
 assert.equal(h.reportDayNumber({date:''},{joinedDay:'2026-11-01'}),null);
 assert.equal(h.reportDayNumber({date:'2026-10-30'},{joinedDay:'2026-11-01'}),1);
});
test('messages to the developer name the outcome',()=>{
 assert.match(h.messagePrefix('issue'),/بلاغ مشكلة/);
 assert.match(h.messagePrefix('blocked'),/ما گدرت أكمل/);
 assert.match(h.messagePrefix('ok'),/ملاحظة/);
});
test('submission is one atomic batch with the same document id and duplicate protection',()=>{
 const submit=section('async function submitDailyReport(','async function reviewReport(');
 assert.match(submit,/writeBatch\(db\)/);
 assert.doesNotMatch(submit,/runTransaction/);
 assert.match(submit,/err\?\.code!=='unavailable'\|\|attempt>=3/);
 assert.match(submit,/reports',`\$\{assignmentId\}_\$\{date\}`/);
 assert.match(submit,/checkins:storeFns\.arrayUnion\(date\)/);
 assert.match(submit,/submittedAt:storeFns\.serverTimestamp\(\)/);
 assert.match(submit,/const prior=await alreadySaved\(\);if\(prior\)return prior;\r?\n   throw err;/);
 assert.match(submit,/alreadySaved:true/);
 assert.doesNotMatch(submit,/opened|feature/);
});
test('compact form has one choice group, one text field and one submit button',()=>{
 const card=section('function todayTestCard(a){','function dailyReport(){');
 assert.match(card,/اختبار اليوم/);
 assert.match(card,/فتح التطبيق/);
 assert.match(card,/شلون كانت التجربة؟/);
 assert.match(card,/شنو جرّبت؟/);
 assert.match(card,/مثلاً: جرّبت تسجيل الدخول واشتغل بصورة طبيعية\./);
 assert.match(card,/إرسال التقرير/);
 assert.equal((card.match(/<textarea/g)||[]).length,1);
 assert.equal((card.match(/type="submit"/g)||[]).length,1);
 assert.doesNotMatch(card,/type="checkbox"|type="file"|نسخ التقرير|تنزيل التقرير|download/);
});
test('developer review never rewrites tester fields and asks clarification by message',()=>{
 const review=section('async function reviewReport(','const messageRetryIds');
 assert.match(review,/reviewStatus:decision,reviewedAt:storeFns\.serverTimestamp\(\),reviewerUid:active\.uid/);
 assert.doesNotMatch(review,/notes:|outcome:|tested:/);
 assert.match(review,/decision==='clarify'/);
 const record=section('function reportRecord(','function projectDetails(');
 for(const label of ['قبول التقرير','طلب توضيح','رفض التقرير'])assert.match(record,new RegExp(label));
});
test('rules accept blocked as an open problem and limit review to review fields',()=>{
 assert.match(rules,/outcome in \['ok','issue','blocked'\]/);
 assert.match(rules,/outcome in \['issue','blocked'\] \? 'new' : 'ok'/);
 assert.match(rules,/affectedKeys\(\)\.hasOnly\(\['reviewStatus','reviewedAt','reviewerUid'\]\)/);
 assert.match(rules,/reviewStatus in \['accepted','clarify','rejected'\]/);
 assert.match(rules,/reviewedAt == request\.time/);
 // The create allowlist must not let a tester submit a review.
 const create=rules.slice(rules.indexOf('match /reports/{reportId}'),rules.indexOf('allow update',rules.indexOf('match /reports/{reportId}')));
 assert.doesNotMatch(create,/reviewStatus/);
});
test('live refresh does not discard a half-written report',()=>{
 const guard=section('function canRerenderLive(){','function queueLiveSync(');
 assert.match(guard,/daily-report-form/);
});
