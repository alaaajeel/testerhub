import {before, after, beforeEach, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import * as f from 'firebase/firestore';
import '../../src/services/deletion.js';
const {doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch, serverTimestamp} = f;
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-testerhub', firestore: {rules: readFileSync('firestore.rules', 'utf8')}}); });
after(async () => { await env?.cleanup(); });
const db = (uid, verified = true) => env.authenticatedContext(uid, {email: uid + '@example.com', email_verified: verified}).firestore();
const grant = (permissions, extra = {}) => ({active: true, permissions, email: 'x@example.com', name: 'X', grantedBy: 'owner', grantedAt: serverTimestamp(), ...extra});
const setStaff = (uid, permissions) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'staffRoles', uid), {active: true, permissions, email: uid + '@example.com', name: uid, grantedBy: 'owner'}));
const audit = (actorUid, action) => ({actorUid, action, targetId: 'x', targetName: 'x', createdAt: serverTimestamp()});
beforeEach(async () => {
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  for (const [uid, role] of [['owner', 'developer'], ['sup', 'tester'], ['sup2', 'tester'], ['t1', 'tester'], ['d1', 'developer']]) await setDoc(doc(d, 'users', uid), {name: uid, email: uid + '@example.com', role, available: role === 'tester', createdAt: serverTimestamp()});
  await setDoc(doc(d, 'adminRoles', 'owner'), {active: true});
  await setDoc(doc(d, 'projects', 'p1'), {name: 'App', ownerUid: 'd1', status: 'recruiting'});
  await setDoc(doc(d, 'assignments', 'p1_t1'), {projectId: 'p1', ownerUid: 'd1', testerUid: 't1', checkins: []});
  await setDoc(doc(d, 'reports', 'r1'), {projectId: 'p1', ownerUid: 'd1', testerUid: 't1', outcome: 'issue', status: 'new', date: '2026-11-01'});
  await setDoc(doc(d, 'messages', 'm1'), {projectId: 'p1', ownerUid: 'd1', testerUid: 't1', text: 'private'});
  await setDoc(doc(d, 'deletionRequests', 't1'), {email: 't1@example.com', status: 'open'});
 });
});

/* Only the owner grants */
test('the owner promotes, edits and revokes with an audit entry', async () => {
 const o = db('owner');
 const b = writeBatch(o);
 b.set(doc(o, 'staffRoles', 'sup'), grant({viewUsers: true}));
 b.set(doc(o, 'adminAuditLogs', 'a1'), audit('owner', 'grant_staff'));
 await assertSucceeds(b.commit());
 await assertSucceeds(updateDoc(doc(o, 'staffRoles', 'sup'), {permissions: {viewUsers: false, viewAudit: true}, grantedBy: 'owner', grantedAt: serverTimestamp()}));
 await assertSucceeds(getDocs(collection(o, 'staffRoles')));
 await assertSucceeds(deleteDoc(doc(o, 'staffRoles', 'sup')));
});
test('nobody but the owner can grant, including a supervisor to themself', async () => {
 await setStaff('sup', {viewUsers: true, suspendUsers: true, deleteProjects: true, viewAudit: true});
 for (const [ctx, target] of [[db('sup'), 'sup2'], [db('sup'), 'sup'], [db('t1'), 't1'], [db('d1'), 't1']]) await assertFails(setDoc(doc(ctx, 'staffRoles', target), grant({viewUsers: true})));
 await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'staffRoles', 't1'), grant({viewUsers: true})));
});
test('a supervisor cannot widen, keep or read other roles', async () => {
 await setStaff('sup', {viewUsers: true});
 await setStaff('sup2', {viewUsers: true});
 const s = db('sup');
 await assertFails(updateDoc(doc(s, 'staffRoles', 'sup'), {permissions: {viewUsers: true, deleteProjects: true}, grantedBy: 'sup', grantedAt: serverTimestamp()}));
 await assertFails(deleteDoc(doc(s, 'staffRoles', 'sup2')));
 await assertSucceeds(getDoc(doc(s, 'staffRoles', 'sup')));
 await assertFails(getDoc(doc(s, 'staffRoles', 'sup2')));
 await assertFails(getDocs(collection(s, 'staffRoles')));
});
test('a supervisor can never become or touch the owner', async () => {
 await setStaff('sup', {viewUsers: true, suspendUsers: true});
 const s = db('sup');
 await assertFails(setDoc(doc(s, 'adminRoles', 'sup'), {active: true}));
 await assertFails(updateDoc(doc(s, 'users', 'owner'), {suspended: true, available: false}));
 await assertFails(getDoc(doc(s, 'adminRoles', 'owner')));
});
test('grants are validated: unknown permissions, the owner, and missing users are refused', async () => {
 const o = db('owner');
 await assertFails(setDoc(doc(o, 'staffRoles', 'sup'), grant({isOwner: true})));
 await assertFails(setDoc(doc(o, 'staffRoles', 'sup'), grant({viewUsers: 'yes'})));
 await assertFails(setDoc(doc(o, 'staffRoles', 'sup'), grant({})));
 await assertFails(setDoc(doc(o, 'staffRoles', 'sup'), grant({viewUsers: true}, {grantedBy: 'someone'})));
 await assertFails(setDoc(doc(o, 'staffRoles', 'owner'), grant({viewUsers: true})));
 await assertFails(setDoc(doc(o, 'staffRoles', 'ghost'), grant({viewUsers: true})));
});

/* Each permission opens exactly its own door */
test('with no relevant permission a supervisor sees apps and nothing else', async () => {
 await setStaff('sup', {viewAudit: false, viewReports: false, viewUsers: false});
 const s = db('sup');
 await assertSucceeds(getDocs(collection(s, 'projects')));
 for (const name of ['users', 'reports', 'messages', 'assignments', 'deletionRequests', 'adminAuditLogs']) await assertFails(getDocs(collection(s, name)));
 await assertFails(updateDoc(doc(s, 'users', 't1'), {suspended: true, available: false}));
 await assertFails(updateDoc(doc(s, 'projects', 'p1'), {status: 'archived', statusBeforeArchive: 'recruiting', archivedAt: serverTimestamp()}));
 await assertFails(updateDoc(doc(s, 'projects', 'p1'), {status: 'deleting'}));
 await assertFails(deleteDoc(doc(s, 'projects', 'p1')));
});
test('viewUsers reads users but cannot suspend', async () => {
 await setStaff('sup', {viewUsers: true});
 const s = db('sup');
 await assertSucceeds(getDocs(collection(s, 'users')));
 await assertFails(updateDoc(doc(s, 'users', 't1'), {suspended: true, available: false}));
});
test('suspendUsers acts on ordinary users, with an audit under their own id only', async () => {
 await setStaff('sup', {viewUsers: true, suspendUsers: true});
 await setStaff('sup2', {viewUsers: true});
 const s = db('sup'), b = writeBatch(s);
 b.update(doc(s, 'users', 't1'), {suspended: true, available: false});
 b.set(doc(s, 'adminAuditLogs', 'a'), audit('sup', 'suspend_user'));
 await assertSucceeds(b.commit());
 await assertFails(updateDoc(doc(s, 'users', 'sup2'), {suspended: true, available: false}));
 await assertFails(updateDoc(doc(s, 'users', 'sup'), {suspended: true, available: false}));
 await assertFails(updateDoc(doc(s, 'users', 'owner'), {suspended: true, available: false}));
 await assertFails(setDoc(doc(s, 'adminAuditLogs', 'b'), audit('owner', 'suspend_user')));
 await assertFails(setDoc(doc(s, 'adminAuditLogs', 'c'), audit('sup', 'delete_project')));
 await assertFails(setDoc(doc(s, 'adminAuditLogs', 'd'), audit('sup', 'grant_staff')));
});
test('archiveProjects archives and restores but cannot delete', async () => {
 await setStaff('sup', {archiveProjects: true});
 const ref = doc(db('sup'), 'projects', 'p1');
 await assertSucceeds(updateDoc(ref, {status: 'archived', statusBeforeArchive: 'recruiting', archivedAt: serverTimestamp()}));
 await assertFails(deleteDoc(ref));
 await assertFails(getDoc(doc(db('sup'), 'messages', 'm1')));
});
test('deleteProjects runs the real deletion with an audit entry', async () => {
 await setStaff('sup', {deleteProjects: true});
 const s = db('sup');
 await globalThis.TesterHubDeletion.deleteProject({db: s, f, projectId: 'p1', audit: batch => batch.set(doc(s, 'adminAuditLogs', 'del'), audit('sup', 'delete_project'))});
 await env.withSecurityRulesDisabled(async c => {
  const d = c.firestore();
  for (const name of ['projects', 'assignments', 'reports', 'messages']) assert.equal((await getDocs(collection(d, name))).size, 0, name);
  assert.ok((await getDoc(doc(d, 'adminAuditLogs', 'del'))).exists());
 });
});
test('viewReports reads reports but not private messages', async () => {
 await setStaff('sup', {viewReports: true});
 await assertSucceeds(getDocs(collection(db('sup'), 'reports')));
 await assertFails(getDocs(collection(db('sup'), 'messages')));
 await assertFails(updateDoc(doc(db('sup'), 'reports', 'r1'), {status: 'fixed'}));
});
test('processDeletions handles requests only', async () => {
 await setStaff('sup', {processDeletions: true});
 const s = db('sup'), b = writeBatch(s);
 await assertSucceeds(getDocs(collection(s, 'deletionRequests')));
 b.update(doc(s, 'deletionRequests', 't1'), {status: 'processed', processedAt: serverTimestamp()});
 b.set(doc(s, 'adminAuditLogs', 'a'), audit('sup', 'process_deletion'));
 await assertSucceeds(b.commit());
 await assertFails(getDocs(collection(s, 'users')));
});
test('viewAudit reads the log and can write nothing to it', async () => {
 await setStaff('sup', {viewAudit: true});
 await assertSucceeds(getDocs(collection(db('sup'), 'adminAuditLogs')));
 await assertFails(setDoc(doc(db('sup'), 'adminAuditLogs', 'x'), audit('sup', 'suspend_user')));
});

/* Losing access */
test('revoking, an unverified email or a suspension each end access at once', async () => {
 await setStaff('sup', {viewUsers: true});
 await assertSucceeds(getDocs(collection(db('sup'), 'users')));
 await assertFails(getDocs(collection(db('sup', false), 'users')));
 await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users', 'sup'), {suspended: true}));
 await assertFails(getDocs(collection(db('sup'), 'users')));
 await env.withSecurityRulesDisabled(c => updateDoc(doc(c.firestore(), 'users', 'sup'), {suspended: false}));
 await assertSucceeds(getDocs(collection(db('sup'), 'users')));
 await assertSucceeds(deleteDoc(doc(db('owner'), 'staffRoles', 'sup')));
 await assertFails(getDocs(collection(db('sup'), 'users')));
 await assertFails(getDocs(collection(db('sup'), 'projects')));
});
test('a role document marked inactive grants nothing', async () => {
 await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'staffRoles', 'sup'), {active: false, permissions: {viewUsers: true}}));
 await assertFails(getDocs(collection(db('sup'), 'users')));
 await assertFails(getDocs(collection(db('sup'), 'projects')));
});
test('the owner can suspend a supervisor, and ordinary users gain nothing', async () => {
 await setStaff('sup', {viewUsers: true});
 await assertSucceeds(updateDoc(doc(db('owner'), 'users', 'sup'), {suspended: true, available: false}));
 for (const name of ['users', 'reports', 'messages', 'deletionRequests', 'adminAuditLogs', 'staffRoles']) await assertFails(getDocs(collection(db('t1'), name)));
});
