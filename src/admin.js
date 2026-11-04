import {onAuthStateChanged, getIdTokenResult} from 'firebase/auth';
import {doc, getDoc, collection, query, where, orderBy, documentId, limit, startAfter, getDocs, getCountFromServer, writeBatch, serverTimestamp, deleteField} from 'firebase/firestore';
import {auth, db} from './firebase.js';
import {esc, num, dialog, toast} from './ui.js';
import {projectStatusLabel, statusLabel, severityLabel} from './domain.js';

const $ = id => document.getElementById(id);
const PAGE = 25;
const SOURCES = {
  flags: {title: 'بلاغات الإساءة', order: 'createdAt'},
  deletionRequests: {title: 'طلبات حذف الحسابات', order: 'createdAt'},
  users: {title: 'المستخدمون', order: documentId(), search: true},
  projects: {title: 'التطبيقات', order: documentId()},
  issues: {title: 'مشكلات الاختبار المبلغ عنها', collection: 'reports', order: 'date', filter: where('outcome', '==', 'issue')},
  adminAuditLogs: {title: 'سجل إجراءات الإدارة', order: 'createdAt'},
};
const state = {tab: 'flags', rows: [], cursor: null, more: false, details: {}, account: null};
const stamp = v => v?.toDate?.().toLocaleString('ar-IQ-u-nu-latn') || '—';
const errorText = err => String(err?.code || '').includes('permission-denied') ? 'رُفضت العملية. تأكد من صلاحية الإدارة.' : (err?.message || 'تعذر تنفيذ العملية.');
const gate = html => { $('gate').hidden = false; $('console').hidden = true; $('gate').innerHTML = html; };
const audit = (batch, action, targetId, targetName) => batch.set(doc(collection(db, 'adminAuditLogs')), {actorUid: state.account.uid, action, targetId, targetName: String(targetName || targetId).slice(0, 100), createdAt: serverTimestamp()});
const button = (action, id, label, tone = 'ghost') => `<button class="btn ${tone} small" data-action="${action}" data-id="${esc(id)}">${label}</button>`;

async function authorized(account) {
  const token = await getIdTokenResult(account, true);
  if (token.claims.email_verified !== true) return false;
  const role = await getDoc(doc(db, 'adminRoles', account.uid));
  return role.exists() && role.data().active === true;
}

async function overview() {
  const metrics = [['users', 'مستخدم'], ['projects', 'تطبيق'], ['applications', 'طلب'], ['assignments', 'مشاركة'], ['reports', 'تقرير']];
  const open = [['flags', 'بلاغ مفتوح'], ['deletionRequests', 'طلب حذف مفتوح']];
  const counts = await Promise.all([
    ...metrics.map(([n]) => getCountFromServer(collection(db, n))),
    ...open.map(([n]) => getCountFromServer(query(collection(db, n), where('status', '==', 'open')))),
  ]);
  $('metrics').innerHTML = [...metrics, ...open].map(([, label], i) => `<div class="stat"><strong>${num(counts[i].data().count)}</strong><span>${label}</span></div>`).join('');
}

const ROWS = {
  flags: x => `<div class="admin-item"><div><strong>${esc(x.targetName || x.targetId)}</strong><small>${x.targetType === 'project' ? 'تطبيق' : 'مستخدم'} · ${esc(stamp(x.createdAt))}</small><p class="small">${esc(x.reason)}</p></div>${x.status === 'open' ? button('close-flag', x.id, 'إغلاق البلاغ') : '<span class="tag">مغلق</span>'}</div>`,
  deletionRequests: x => `<div class="admin-item"><div><strong dir="ltr">${esc(x.email)}</strong><small>${esc(stamp(x.createdAt))}</small></div>${x.status === 'open' ? button('process-deletion', x.id, 'تمت المعالجة') : '<span class="tag">تمت المعالجة</span>'}</div>`,
  users: x => {
    const self = x.id === state.account.uid;
    return `<div class="admin-item"><div><strong>${esc(x.name || 'مستخدم')}</strong><small dir="ltr">${esc(x.email || '')}</small><small>${x.role === 'developer' ? 'مطور' : 'مختبر'}</small></div><div class="row">${x.suspended ? '<span class="tag bad">موقوف</span>' : ''}${self ? '<span class="tag">حسابك</span>' : button('suspend', x.id, x.suspended ? 'إعادة التنشيط' : 'إيقاف', x.suspended ? 'ghost' : 'danger-ghost')}</div></div>`;
  },
  projects: x => {
    const d = state.details[x.id];
    return `<div class="admin-item"><div><strong>${esc(x.name || 'تطبيق')}</strong><small>من ${esc(x.ownerName || '—')} · ${esc(projectStatusLabel(x.status))}</small></div><div class="row">${button('details', x.id, 'تفاصيل')}${button('archive', x.id, x.status === 'archived' ? 'إلغاء الأرشفة' : 'أرشفة', x.status === 'archived' ? 'ghost' : 'danger-ghost')}</div>${d ? `<div class="admin-detail">${esc(x.description || 'بلا وصف')}<br><span dir="ltr">${esc(x.link || '')}</span><br>طلبات: ${num(d.applications)} · مشاركون: ${num(d.assignments)} · تقارير: ${num(d.reports)} · رسائل: ${num(d.messages)}</div>` : ''}</div>`;
  },
  issues: x => `<div class="admin-item"><div><strong>${esc(x.notes || '')}</strong><small>${esc(x.date || '')} · ${esc(severityLabel(x.severity))} · ${esc(statusLabel(x.status))}</small></div></div>`,
  adminAuditLogs: x => {
    const names = {suspend_user: 'إيقاف حساب', unsuspend_user: 'إعادة تنشيط حساب', archive_project: 'أرشفة تطبيق', restore_project: 'إلغاء أرشفة تطبيق', close_flag: 'إغلاق بلاغ', process_deletion: 'معالجة طلب حذف'};
    return `<div class="admin-item"><div><strong>${esc(names[x.action] || x.action)}</strong><small>${esc(x.targetName || x.targetId)} · ${esc(stamp(x.createdAt))}</small></div></div>`;
  },
};

function render() {
  const source = SOURCES[state.tab];
  $('listTitle').textContent = source.title;
  $('search').hidden = !source.search;
  $('items').innerHTML = state.rows.length ? state.rows.map(ROWS[state.tab]).join('') : '<p class="muted">لا توجد سجلات هنا.</p>';
  $('loadMore').hidden = !state.more;
  for (const b of document.querySelectorAll('[data-tab]')) b.classList.toggle('on', b.dataset.tab === state.tab);
}

async function page(reset = false) {
  const source = SOURCES[state.tab];
  if (reset) { state.rows = []; state.cursor = null; state.details = {}; }
  const parts = [collection(db, source.collection || state.tab)];
  if (source.filter) parts.push(source.filter);
  parts.push(orderBy(source.order, source.order === 'createdAt' || source.order === 'date' ? 'desc' : 'asc'));
  if (state.cursor) parts.push(startAfter(state.cursor));
  parts.push(limit(PAGE));
  const snap = await getDocs(query(...parts));
  state.rows.push(...snap.docs.map(x => ({id: x.id, ...x.data()})));
  state.cursor = snap.docs.at(-1) || null;
  state.more = snap.size === PAGE;
  render();
}

async function guarded(work) {
  try { await work(); } catch (err) { console.warn(err); toast(errorText(err), 'error'); }
}

const ACTIONS = {
  async suspend(item) {
    const suspending = !item.suspended;
    if (!await dialog({title: (suspending ? 'إيقاف ' : 'إعادة تنشيط ') + (item.email || item.name), body: suspending ? 'يفقد المستخدم الوصول إلى البيانات فوراً وتبقى بياناته محفوظة.' : '', confirm: 'تأكيد', danger: suspending})) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', item.id), suspending ? {suspended: true, available: false} : {suspended: false});
    audit(batch, suspending ? 'suspend_user' : 'unsuspend_user', item.id, item.email || item.name);
    await batch.commit();
    item.suspended = suspending;
  },
  async archive(item) {
    const archived = item.status === 'archived';
    if (!await dialog({title: (archived ? 'إلغاء أرشفة ' : 'أرشفة ') + item.name, body: archived ? '' : 'تتوقف التقارير والرسائل الجديدة، وتبقى البيانات القديمة.', confirm: 'تأكيد', danger: !archived})) return;
    const batch = writeBatch(db), ref = doc(db, 'projects', item.id);
    if (archived) {
      batch.update(ref, {status: item.statusBeforeArchive, statusBeforeArchive: deleteField(), archivedAt: deleteField()});
      item.status = item.statusBeforeArchive;
    } else {
      const current = item.status || 'recruiting';
      batch.update(ref, {status: 'archived', statusBeforeArchive: current, archivedAt: serverTimestamp()});
      item.statusBeforeArchive = current;
      item.status = 'archived';
    }
    audit(batch, archived ? 'restore_project' : 'archive_project', item.id, item.name);
    await batch.commit();
  },
  async details(item) {
    const names = ['applications', 'assignments', 'reports', 'messages'];
    const counts = await Promise.all(names.map(n => getCountFromServer(query(collection(db, n), where('projectId', '==', item.id)))));
    state.details[item.id] = Object.fromEntries(names.map((n, i) => [n, counts[i].data().count]));
  },
  async 'close-flag'(item) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'flags', item.id), {status: 'closed', closedAt: serverTimestamp()});
    audit(batch, 'close_flag', item.id, item.targetName);
    await batch.commit();
    item.status = 'closed';
  },
  async 'process-deletion'(item) {
    if (!await dialog({title: 'هل نفّذت الحذف فعلاً؟', body: 'نفّذ خطوات دليل الإدارة في Firebase Console أولاً، ثم أكد هنا.', confirm: 'نعم، نُفّذ'})) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'deletionRequests', item.id), {status: 'processed', processedAt: serverTimestamp()});
    audit(batch, 'process_deletion', item.id, item.email);
    await batch.commit();
    item.status = 'processed';
  },
};

document.addEventListener('click', event => {
  const tab = event.target.closest('[data-tab]');
  if (tab) { state.tab = tab.dataset.tab; guarded(() => page(true)); return; }
  const action = event.target.closest('[data-action]');
  if (!action) return;
  const item = state.rows.find(x => x.id === action.dataset.id);
  if (item) {
    action.setAttribute('aria-busy', 'true');
    guarded(async () => { await ACTIONS[action.dataset.action](item); render(); if (action.dataset.action !== 'details') await overview(); }).finally(() => action.removeAttribute('aria-busy'));
  }
});
$('refresh').addEventListener('click', () => guarded(() => Promise.all([overview(), page(true)])));
$('loadMore').addEventListener('click', () => guarded(() => page()));
$('search').addEventListener('submit', event => {
  event.preventDefault();
  const email = new FormData(event.target).get('email').trim().toLowerCase();
  guarded(async () => {
    if (!email) return page(true);
    const snap = await getDocs(query(collection(db, 'users'), where('email', '==', email), limit(5)));
    state.rows = snap.docs.map(x => ({id: x.id, ...x.data()}));
    state.more = false;
    render();
  });
});

onAuthStateChanged(auth, async account => {
  state.account = null;
  if (!account) { gate('هذه الصفحة لإدارة المنصة. <a href="./index.html#/login">سجّل الدخول</a> بحساب الإدارة ثم ارجع إليها.'); return; }
  try {
    if (!await authorized(account)) { gate('هذا الحساب لا يملك صلاحية الإدارة. <a href="./index.html">العودة للتطبيق</a>'); return; }
    state.account = account;
    $('gate').hidden = true;
    $('console').hidden = false;
    $('identity').textContent = 'الحساب: ' + account.email;
    await Promise.all([overview(), page(true)]);
  } catch (err) {
    gate('تعذر التحقق من الصلاحية: ' + esc(errorText(err)));
  }
});
