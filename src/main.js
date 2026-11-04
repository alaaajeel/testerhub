// App shell: routing, rendering and event handling. Screens live in ./views.
import {onAuthStateChanged} from 'firebase/auth';
import {auth} from './firebase.js';
import * as store from './store.js';
import {state, accounts, humanError} from './store.js';
import {esc, icon, toast, dialog, copyText} from './ui.js';
import {playLinks, dayKey, groupTesterWork} from './domain.js';
import * as pub from './views/public.js';
import * as common from './views/common.js';
import * as tester from './views/tester.js';
import * as dev from './views/developer.js';
import {setReminderHour, exportCalendar, enableNotifications, notify, dailyReminder} from './reminders.js';

const root = document.getElementById('app');
const ui = {admin: false, deletionRequested: false, installPrompt: null, ready: false, failure: '', listingFailed: false, applyProject: undefined, applyFailed: false, dirty: false};
const splashStart = performance.now();

const route = () => {
  const [name = 'home', param = ''] = location.hash.replace(/^#\/?/, '').split('/');
  return {name: name || 'home', param: decodeURIComponent(param)};
};
const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };

const NAV = {
  tester: [['home', 'home', 'اليوم'], ['explore', 'search', 'التطبيقات'], ['tests', 'tests', 'اختباراتي'], ['record', 'record', 'سجلي'], ['profile', 'user', 'حسابي']],
  developer: [['home', 'apps', 'تطبيقاتي'], ['new', 'add', 'إضافة'], ['profile', 'user', 'حسابي']],
};

function badge(key) {
  if (state.user.role === 'tester') {
    const work = groupTesterWork(state.data.assignments);
    if (key === 'home') return work.due.length + work.setup.length;
    return 0;
  }
  if (key !== 'home') return 0;
  const open = state.data.reports.filter(r => r.outcome === 'issue' && ['new', 'reopened'].includes(r.status)).length;
  return open + state.data.applications.filter(x => x.status === 'pending').length;
}

function navigation(current) {
  const items = NAV[state.user.role];
  const links = items.map(([key, ic, label]) => {
    const n = badge(key);
    return `<a href="#/${key}" class="${current === key ? 'on' : ''}" ${current === key ? 'aria-current="page"' : ''}>${icon(ic, 22)}<span>${label}</span>${n ? `<b class="count">${Math.min(n, 99)}</b>` : ''}</a>`;
  }).join('');
  const adminLink = ui.admin ? `<a href="./admin.html">${icon('shield', 22)}<span>الإدارة</span></a>` : '';
  return `<nav class="nav" aria-label="التنقل الرئيسي"><div class="nav-brand"><img src="./assets/brand-icon.svg" alt="" width="32" height="32"><span dir="ltr">TesterHub</span></div>${links}${adminLink}</nav>`;
}

function screen({name, param}) {
  const isDev = state.user.role === 'developer';
  if (name === 'chat') return common.chat(param);
  if (name === 'profile') return common.profile({admin: ui.admin, installAvailable: !!ui.installPrompt, deletionRequested: ui.deletionRequested});
  if (isDev) {
    const map = {home: dev.home, new: () => dev.projectForm(), edit: () => dev.projectForm(param), app: () => dev.project(param), summary: () => dev.summary(param)};
    return (map[name] || dev.home)();
  }
  const map = {home: tester.home, tests: tester.tests, record: tester.record, explore: () => tester.explore(state.listings, ui.listingFailed), apply: () => tester.apply(ui.applyProject, ui.applyFailed), report: () => tester.report(param)};
  return (map[name] || tester.home)();
}

// Data for a screen is fetched by the screen's route, never polled.
async function loadRouteData({name, param}) {
  if (state.user?.role !== 'tester') return;
  if (name === 'explore' && !state.listings) {
    try { ui.listingFailed = false; await store.loadListings(); } catch { ui.listingFailed = true; }
    render();
  }
  if (name === 'apply') {
    ui.applyProject = undefined; ui.applyFailed = false;
    render();
    try { ui.applyProject = await store.getListing(param); } catch { ui.applyFailed = true; }
    render();
  }
}

const FORM_ROUTES = new Set(['new', 'edit', 'report', 'apply']);

function render({live = false} = {}) {
  const r = route();
  if (!ui.ready) return;
  if (ui.failure) { root.innerHTML = pub.failureScreen(ui.failure); return; }
  const u = state.user;
  if (!u) {
    if (r.name === 'login') { pub.authDraft.mode = 'login'; root.innerHTML = pub.authScreen(); }
    else if (r.name === 'signup') { pub.authDraft.mode = 'signup'; if (r.param) pub.authDraft.role = r.param === 'developer' ? 'developer' : 'tester'; root.innerHTML = pub.authScreen(); }
    else root.innerHTML = pub.landing();
    return;
  }
  if (u.profileMissing) { root.innerHTML = pub.profileRecovery(u); return; }
  if (u.suspended) { root.innerHTML = pub.suspendedScreen(u); return; }
  if (!u.emailVerified) { root.innerHTML = pub.verifyScreen(u); return; }
  // A live update must never wipe what someone is typing or move them on the page.
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (live && !ui.skeleton && (typing || ui.dirty || FORM_ROUTES.has(r.name))) { updateBadges(r.name); return; }
  const main = document.getElementById('main');
  const keepScroll = live && main ? scrollHost().scrollTop : null;
  ui.skeleton = !state.synced && !live;
  const body = ui.skeleton ? '<div class="skeleton"></div><div class="skeleton"></div>' : screen(r);
  root.innerHTML = `<div class="shell">${navigation(r.name)}<div class="content"><div class="offline" id="offline" ${navigator.onLine ? 'hidden' : ''}>لا يوجد اتصال بالإنترنت. تعرض الصفحة آخر بيانات محفوظة، ولن يُحفظ شيء حتى يعود الاتصال.</div>${state.loadFailed ? '<div class="offline" role="alert">تعذر تحميل بعض بياناتك، فقد تكون القوائم هنا ناقصة. حدّث الصفحة بعد قليل.</div>' : ''}<main id="main" tabindex="-1">${body}</main></div></div>`;
  if (keepScroll !== null) scrollHost().scrollTop = keepScroll;
  const thread = document.getElementById('thread');
  if (thread) thread.scrollIntoView({block: 'end'});
}
const scrollHost = () => document.scrollingElement;

function updateBadges(current) {
  const nav = document.querySelector('.nav');
  if (nav) nav.outerHTML = navigation(current);
}

function onLive(name) {
  if (!state.user) return;
  render({live: state.synced});
  if (state.user.role === 'tester' && state.synced) dailyReminder(groupTesterWork(state.data.assignments).due.length, dayKey());
  if (name === 'assignments') ui.dirty = ui.dirty && FORM_ROUTES.has(route().name);
}

function onArrival(name, docs) {
  const uid = state.user?.uid;
  for (const doc of docs.slice(0, 2)) {
    if (name === 'messages' && doc.senderUid !== uid) notify('رسالة جديدة', String(doc.text || '').slice(0, 110), 'testerhub-msg-' + doc.id).catch(() => {});
    if (name === 'applications' && state.user.role === 'developer') notify('طلب اختبار جديد', `${doc.testerName} يريد اختبار ${doc.projectName}`, 'testerhub-app-' + doc.id).catch(() => {});
    if (name === 'assignments' && state.user.role === 'tester') notify('قُبل طلبك', `قبلك مطور ${doc.name}`, 'testerhub-acc-' + doc.id).catch(() => {});
  }
}

async function enter(user) {
  state.user = user;
  store.stopLive();
  ui.admin = false;
  if (user && !user.profileMissing && !user.suspended && user.emailVerified) {
    store.startLive({onChange: onLive, onArrival});
    store.isAdmin().then(v => { ui.admin = v; updateBadges(route().name); if (route().name === 'profile') render({live: true}); });
    store.deletionRequested().then(v => { ui.deletionRequested = v; if (route().name === 'profile') render({live: true}); });
  }
  render();
  loadRouteData(route());
}

/* ---------- actions ---------- */
async function busy(el, work) {
  if (el?.getAttribute('aria-busy') === 'true') return;
  el?.setAttribute('aria-busy', 'true');
  if (el) el.disabled = true;
  try { await work(); }
  catch (err) { console.warn(err); toast(humanError(err), 'error'); }
  finally { if (el?.isConnected) { el.removeAttribute('aria-busy'); el.disabled = false; } }
}

const assignmentById = id => state.data.assignments.find(a => a.id === id);
const openExternal = url => { if (url) window.open(url, '_blank', 'noopener,noreferrer'); else toast('هذا الرابط غير متاح؛ اطلبه من الطرف الآخر عبر المحادثة.', 'error'); };

const ACTIONS = {
  'reset-password': async () => {
    const email = document.getElementById('auth-email')?.value;
    await accounts.resetPassword(email || '');
    toast('إذا كان البريد مسجلاً فستصلك رسالة لاستعادة كلمة المرور.');
  },
  'send-verification': async () => { await accounts.sendVerification(); toast('أرسلنا الرابط. افحص بريدك والرسائل غير المرغوب فيها.'); },
  'check-verification': async () => {
    const user = await accounts.checkVerification();
    if (!user.emailVerified) throw Object.assign(new Error(), {code: 'auth/email-not-verified'});
    await enter(user);
  },
  logout: async () => { store.stopLive(); await store.signOut(); state.user = null; ui.failure = ''; location.hash = '#/'; render(); },
  retry: async () => { ui.failure = ''; await boot(); },
  'switch-role': async () => {
    const next = state.user.role === 'tester' ? 'developer' : 'tester';
    if (!await dialog({title: next === 'developer' ? 'التبديل إلى مطور؟' : 'التبديل إلى مختبر؟', body: 'بياناتك محفوظة، ويمكنك الرجوع في أي وقت.', confirm: 'تبديل'})) return;
    const user = await accounts.updateProfile({role: next});
    location.hash = '#/home';
    await enter(user);
  },
  calendar: async () => exportCalendar(),
  'enable-notifications': enableNotifications,
  install: async () => { ui.installPrompt?.prompt(); await ui.installPrompt?.userChoice; ui.installPrompt = null; render(); },
  'request-deletion': async () => {
    if (!await dialog({title: 'طلب حذف الحساب؟', body: 'ستراجع الإدارة طلبك خلال 14 يوماً، ويمكنك متابعة استخدام حسابك حتى ذلك الحين.', confirm: 'إرسال الطلب', danger: true})) return;
    await store.requestDeletion(); ui.deletionRequested = true; render(); toast('وصل طلبك إلى الإدارة.');
  },
  flag: async btn => {
    const reason = await dialog({title: 'الإبلاغ عن إساءة', input: {label: 'ما الذي حدث؟'}, confirm: 'إرسال البلاغ', danger: true});
    if (reason === null) return;
    await store.flag(btn.dataset.type, btn.dataset.id, btn.dataset.name, reason);
    toast('وصل بلاغك إلى الإدارة. شكراً لك.');
  },
  'open-play': async btn => { const a = assignmentById(btn.dataset.id); if (a) openExternal(playLinks(a.link)[btn.dataset.kind]); },
  'open-project': async btn => openExternal(playLinks(state.data.projects.find(p => p.id === btn.dataset.id)?.link).join),
  'start-test': async btn => {
    if (!await dialog({title: 'هل انضممت وثبّتّ التطبيق؟', body: 'يبدأ عد الأيام الأربعة عشر من الآن، وتصبح أول مهمة متاحة.', confirm: 'نعم، ابدأ'})) return;
    await store.startTest(btn.dataset.id); toast('بدأ اختبارك. جرّب مهمة اليوم ثم سجّل تقريرك.');
  },
  invite: async btn => { await store.respondInvite(btn.dataset.id, btn.dataset.value); },
  leave: async btn => {
    if (!await dialog({title: 'الانسحاب من هذا الاختبار؟', body: 'سيرى المطور أنك انسحبت، ولا يمكن التراجع. أخبره بالسبب إن أمكن.', confirm: 'انسحاب', danger: true})) return;
    await store.leaveTest(btn.dataset.id);
  },
  withdraw: async btn => { await store.withdrawApplication(btn.dataset.id); toast('سحبت طلبك.'); },
  'reload-listings': async () => { state.listings = null; await loadRouteData(route()); },
  'issue-status': async btn => {
    const report = state.data.reports.find(r => r.id === btn.dataset.id);
    if (report) await store.setIssueStatus(report, btn.dataset.value);
  },
  decide: async btn => {
    const application = state.data.applications.find(x => x.id === btn.dataset.id);
    if (application) await store.decideApplication(application, btn.dataset.value === 'approve');
  },
  'copy-play': async btn => copyText(dev.emailsFor(btn.dataset.id).map(a => a.testerEmail).join(', '), 'نُسخت الإيميلات. ألصقها في قائمة المختبرين في Play Console.'),
  'mark-play': async btn => {
    const list = dev.emailsFor(btn.dataset.id);
    if (!await dialog({title: 'هل أضفت هذه الإيميلات فعلاً؟', body: 'سيُطلب من المختبرين الانضمام الآن، وسيفشل انضمامهم إذا لم تكن أضفتهم.', confirm: 'نعم، أضفتهم'})) return;
    await store.markAddedToPlay(list); toast('يمكن للمختبرين الانضمام الآن.');
  },
  'project-status': async btn => {
    const labels = {paused: 'إيقاف استقبال المختبرين؟', completed: 'إنهاء هذا الاختبار؟', recruiting: 'فتح الاستقبال من جديد؟'};
    if (!await dialog({title: labels[btn.dataset.value], confirm: 'تأكيد'})) return;
    await store.setProjectStatus(btn.dataset.id, btn.dataset.value);
  },
  discard: async btn => {
    if (!await dialog({title: 'حذف هذه المسودة؟', confirm: 'حذف', danger: true})) return;
    await store.discardDraft(btn.dataset.id); location.hash = '#/home';
  },
  'copy-summary': async () => copyText(document.getElementById('summary-text').textContent),
  print: async () => window.print(),
};

root.addEventListener('click', event => {
  const roleBtn = event.target.closest('[data-signup-role]');
  if (roleBtn) {
    captureAuthDraft();
    pub.authDraft.role = roleBtn.dataset.signupRole;
    render();
    return;
  }
  const btn = event.target.closest('button[data-action]');
  if (btn && ACTIONS[btn.dataset.action]) busy(btn, () => ACTIONS[btn.dataset.action](btn));
});

function captureAuthDraft() {
  const name = document.getElementById('auth-name'), email = document.getElementById('auth-email');
  if (name) pub.authDraft.name = name.value;
  if (email) pub.authDraft.email = email.value;
}

const FORMS = {
  'auth-form': async (data, form) => {
    if (!form.reportValidity()) return;
    const email = String(data.get('email')).trim(), password = String(data.get('password'));
    captureAuthDraft();
    const user = pub.authDraft.mode === 'login' ? await accounts.login(email, password)
      : await accounts.signup({name: String(data.get('name')), email, password, role: pub.authDraft.role});
    pub.authDraft.name = '';
    location.hash = '#/home';
    await enter(user);
  },
  'complete-profile-form': async (data, form) => {
    if (!form.reportValidity()) return;
    await enter(await accounts.completeProfile({name: data.get('name'), role: data.get('role')}));
  },
  'profile-form': async data => {
    state.user = await accounts.updateProfile({name: data.get('name')});
    toast('حُفظ اسمك.');
  },
  'chat-form': async (data, form) => {
    await store.sendMessage(assignmentById(form.dataset.id), data.get('message'));
    form.reset();
    ui.dirty = false;
    render();
  },
  'project-form': async (data, form, submitter) => {
    if (!form.reportValidity()) return;
    const intent = submitter?.value || 'save';
    const current = form.dataset.id ? state.data.projects.find(p => p.id === form.dataset.id) : null;
    const publish = intent === 'publish' || (intent === 'save' && current?.status !== 'draft');
    const id = await store.saveProject(Object.fromEntries(data), {projectId: form.dataset.id || null, publish});
    ui.dirty = false;
    toast(intent === 'draft' ? 'حُفظت المسودة.' : intent === 'publish' ? 'نُشر تطبيقك، ويراه المختبرون الآن.' : 'حُفظت التعديلات.');
    go('#/app/' + id);
  },
  'apply-form': async (data, form) => {
    if (!form.reportValidity()) return;
    await store.applyToProject(ui.applyProject, {email: data.get('email'), device: data.get('device'), note: data.get('note')});
    ui.dirty = false;
    state.listings = null;
    toast('وصل طلبك إلى المطور. سنعرض لك قراره هنا.');
    go('#/tests');
  },
  'report-form': async (data, form) => {
    if (!form.reportValidity()) return;
    const outcome = data.get('outcome');
    await store.submitReport(form.dataset.id, {outcome, notes: outcome === 'issue' ? data.get('issue-notes') : data.get('ok-notes'), steps: data.get('steps'), expected: data.get('expected'), severity: data.get('severity'), device: data.get('device')});
    ui.dirty = false;
    toast(outcome === 'issue' ? 'وصل بلاغك إلى المطور. شكراً لك.' : 'سُجّل تقرير اليوم. شكراً لك.');
    go('#/home');
  },
};

root.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.target, handler = FORMS[form.id];
  if (!handler) return;
  const submit = event.submitter || form.querySelector('[type=submit]');
  busy(submit, () => handler(new FormData(form), form, event.submitter));
});

root.addEventListener('input', event => { if (event.target.closest('form') && event.target.closest('form').id !== 'auth-form') ui.dirty = true; });

root.addEventListener('change', event => {
  const node = event.target;
  if (node.id === 'reminder-hour') { setReminderHour(Number(node.value)); toast('حُفظ وقت التذكير.'); return; }
  if (node.name === 'outcome') {
    const issue = node.value === 'issue';
    document.getElementById('issue-fields').hidden = !issue;
    document.getElementById('ok-fields').hidden = issue;
    document.getElementById('issue-notes').required = issue;
  }
});

window.addEventListener('hashchange', () => {
  ui.dirty = false;
  render();
  scrollTo(0, 0);
  document.getElementById('main')?.focus({preventScroll: true});
  loadRouteData(route());
});
window.addEventListener('online', () => { document.getElementById('offline')?.setAttribute('hidden', ''); });
window.addEventListener('offline', () => { document.getElementById('offline')?.removeAttribute('hidden'); });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); ui.installPrompt = event; });
window.addEventListener('appinstalled', () => { ui.installPrompt = null; toast('ثُبّت TesterHub على جهازك.'); });

function finishSplash() {
  const splash = document.getElementById('launch-splash');
  if (!splash) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    splash.classList.add('splash-done');
    setTimeout(() => { splash.remove(); document.body.classList.remove('splash-boot'); }, reduced ? 0 : 300);
  }, Math.max(0, (reduced ? 0 : 500) - (performance.now() - splashStart)));
}

async function boot() {
  try {
    await auth.authStateReady();
    ui.ready = true;
    await enter(auth.currentUser ? await accounts.currentUser() : null);
  } catch (err) {
    console.error(err);
    ui.ready = true;
    ui.failure = humanError(err);
    render();
  } finally { finishSplash(); }
}

// Another tab signing out or in must not leave stale data on screen.
onAuthStateChanged(auth, async active => {
  if (!ui.ready || active?.uid === state.user?.uid) return;
  try { await enter(active ? await accounts.currentUser() : null); } catch (err) { toast(humanError(err), 'error'); }
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
}
boot();
