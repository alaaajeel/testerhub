import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, getDoc, getDocs, deleteDoc, writeBatch, collection, query, where, serverTimestamp} from 'firebase/firestore';

// Help center articles: anyone reads what the app shows; only the platform owner writes, within limits.
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: verified}).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const admin = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
const article = (uid, extra = {}) => ({cat: 'faq', title: 'شلون أبدأ؟', summary: 'شرح قصير', steps: [{title: 'افتح التطبيق', text: 'من الشاشة الرئيسية'}], notice: '', imageUrl: '', videoUrl: '', order: 10, status: 'published', updatedAt: serverTimestamp(), updatedBy: uid, ...extra});
const seeded = status => ({cat: 'faq', title: 'Title ' + status, summary: '', steps: [{title: 'a', text: 'b'}], notice: '', imageUrl: '', videoUrl: '', order: 1, status, updatedBy: 'boss'});
const published = q => query(collection(q, 'helpArticles'), where('status', '==', 'published'));

beforeEach(async () => {
 await env.clearFirestore();
 await admin(async d => {
  for (const uid of ['boss', 'sup', 't1']) await setDoc(doc(d, 'users', uid), {name: 'User ' + uid, email: uid + '@example.com', role: 'tester', available: false});
  await setDoc(doc(d, 'adminRoles', 'boss'), {active: true});
  await setDoc(doc(d, 'staffRoles', 'sup'), {active: true, permissions: {viewUsers: true, viewReports: true, deleteProjects: true, sendAnnouncements: true, viewAudit: true}});
  await setDoc(doc(d, 'helpArticles', 'pub-one'), seeded('published'));
  await setDoc(doc(d, 'helpArticles', 'hid-one'), seeded('hidden'));
  await setDoc(doc(d, 'helpArticles', 'draft-one'), seeded('draft'));
 });
});

test('anyone, even signed out, reads published articles only; drafts and hidden ones stay with the owner', async () => {
 for (const q of [anon(), db('t1'), db('t1', false), db('sup')]) {
  assert.equal((await assertSucceeds(getDocs(published(q)))).size, 1);
  await assertSucceeds(getDoc(doc(q, 'helpArticles', 'pub-one')));
  await assertFails(getDoc(doc(q, 'helpArticles', 'draft-one')));
  await assertFails(getDoc(doc(q, 'helpArticles', 'hid-one')));
  await assertFails(getDocs(query(collection(q, 'helpArticles'), where('status', 'in', ['published', 'hidden']))));
  await assertFails(getDocs(collection(q, 'helpArticles')));
 }
 await assertSucceeds(getDoc(doc(db('boss'), 'helpArticles', 'hid-one')));
 assert.equal((await assertSucceeds(getDocs(collection(db('boss'), 'helpArticles')))).size, 3);
});

test('only the platform owner writes; staff and users cannot', async () => {
 await assertSucceeds(setDoc(doc(db('boss'), 'helpArticles', 'new-one'), article('boss')));
 for (const uid of ['sup', 't1']) await assertFails(setDoc(doc(db(uid), 'helpArticles', 'x-' + uid), article(uid)));
 await assertFails(setDoc(doc(anon(), 'helpArticles', 'anon-one'), article('nobody')));
 await assertFails(deleteDoc(doc(db('t1'), 'helpArticles', 'pub-one')));
 await assertFails(deleteDoc(doc(db('sup'), 'helpArticles', 'pub-one')));
 await assertSucceeds(deleteDoc(doc(db('boss'), 'helpArticles', 'pub-one')));
});

test('content is checked: fields, sizes, steps, links and server time', async () => {
 const b = db('boss'), put = (id, extra) => setDoc(doc(b, 'helpArticles', id), article('boss', extra));
 await assertSucceeds(put('with-media', {imageUrl: 'https://example.com/a.png', videoUrl: 'https://youtu.be/dQw4w9WgXcQ'}));
 await assertSucceeds(put('with-vimeo', {videoUrl: 'https://vimeo.com/123'}));
 await assertFails(put('bad-image', {imageUrl: 'http://example.com/a.png'}));
 await assertFails(put('bad-image2', {imageUrl: 'javascript:alert(1)'}));
 await assertFails(put('bad-video', {videoUrl: 'https://evil.example/video'}));
 await assertFails(put('bad-cat', {cat: 'secret'}));
 await assertFails(put('bad-status', {status: 'live'}));
 await assertFails(put('short', {title: 'ab'}));
 await assertFails(put('long', {title: 'x'.repeat(121)}));
 await assertFails(put('no-steps', {steps: []}));
 await assertFails(put('many-steps', {steps: Array.from({length: 13}, () => ({title: 'a', text: 'b'}))}));
 await assertFails(put('bad-step', {steps: [{title: 'a', text: 'b'}, {title: 'a', text: 'x'.repeat(601)}]}));
 await assertFails(put('step-extra', {steps: [{title: 'a', text: 'b', html: '<b>'}]}));
 await assertFails(put('extra', {html: '<script>'}));
 await assertFails(put('client-time', {updatedAt: new Date()}));
 await assertFails(put('other-author', {updatedBy: 'sup'}));
 await assertFails(put('Bad_Slug', {}));
});

test('saving and deleting are recorded in the audit log', async () => {
 const b = db('boss'), batch = writeBatch(b);
 batch.set(doc(b, 'helpArticles', 'audited'), article('boss'));
 batch.set(doc(collection(b, 'adminAuditLogs')), {actorUid: 'boss', action: 'save_help_article', targetId: 'audited', targetName: 'شلون أبدأ؟', createdAt: serverTimestamp()});
 await assertSucceeds(batch.commit());
 const del = writeBatch(b);
 del.delete(doc(b, 'helpArticles', 'audited'));
 del.set(doc(collection(b, 'adminAuditLogs')), {actorUid: 'boss', action: 'delete_help_article', targetId: 'audited', targetName: 'شلون أبدأ؟', createdAt: serverTimestamp()});
 await assertSucceeds(del.commit());
 await assertFails(setDoc(doc(db('sup'), 'adminAuditLogs', 'x'), {actorUid: 'sup', action: 'save_help_article', targetId: 'a', targetName: 'a', createdAt: serverTimestamp()}));
});

test('the list of switched-off built-in articles holds slugs only and only the owner changes it', async () => {
 const put = (q, data) => setDoc(doc(q, 'helpSettings', 'public'), {hiddenDefaults: ['install-pwa'], updatedAt: serverTimestamp(), updatedBy: 'boss', ...data});
 await assertSucceeds(put(db('boss'), {}));
 for (const q of [anon(), db('t1'), db('t1', false)]) {
  assert.deepEqual((await assertSucceeds(getDoc(doc(q, 'helpSettings', 'public')))).data().hiddenDefaults, ['install-pwa']);
  await assertFails(getDocs(collection(q, 'helpSettings')));
 }
 await assertFails(put(db('sup'), {updatedBy: 'sup'}));
 await assertFails(put(db('t1'), {updatedBy: 't1'}));
 await assertFails(put(db('boss'), {hiddenDefaults: ['<b>bad</b>']}));
 await assertFails(put(db('boss'), {hiddenDefaults: Array.from({length: 17}, (_, i) => 'slug-' + i)}));
 await assertFails(put(db('boss'), {hiddenDefaults: ['xp'], note: 'extra'}));
 await assertFails(put(db('boss'), {updatedAt: new Date()}));
 await assertFails(setDoc(doc(db('boss'), 'helpSettings', 'other'), {hiddenDefaults: [], updatedAt: serverTimestamp(), updatedBy: 'boss'}));
 await assertFails(deleteDoc(doc(db('boss'), 'helpSettings', 'public')));
});
