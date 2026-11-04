// Reminders: daily push on devices that allow it, plus a calendar file and notifications while the app is open.
import {calendarFile, reminderUtcHour} from './domain.js';
import {app, emulator} from './firebase.js';
import {state, savePushDevice, deletePushDevice} from './store.js';
import {toast} from './ui.js';

const KEY = 'testerhub_reminder_hour', FIRED = 'testerhub_reminder_fired';
const DEVICE = 'testerhub_push_device', SYNCED = 'testerhub_push_synced', OFF = 'testerhub_push_off';
const RESYNC_MS = 7 * 86400000;
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const forget = key => { try { localStorage.removeItem(key); } catch {} };

export function getReminderHour() {
  const hour = Number(read(KEY) ?? 20);
  return Number.isInteger(hour) && hour >= 0 && hour < 24 ? hour : 20;
}
export const setReminderHour = hour => write(KEY, String(hour));

export function exportCalendar() {
  const url = URL.createObjectURL(new Blob([calendarFile(getReminderHour())], {type: 'text/calendar;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'TesterHub-reminder.ics';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('افتح الملف الذي نُزّل وأضفه إلى تقويم هاتفك.');
}

export async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  if (typeof registration?.showNotification !== 'function') return false;
  await registration.showNotification(title, {body, icon: './assets/icon-192.png', badge: './assets/icon-192.png', tag});
  return true;
}

const pushPossible = () => !emulator && !!window.TESTERHUB_VAPID_KEY && location.protocol === 'https:'
  && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;

export function reminderStatus() {
  if (!pushPossible()) return 'unavailable';
  if (Notification.permission === 'denied') return 'blocked';
  return Notification.permission === 'granted' && read(DEVICE) && !read(OFF) ? 'on' : 'off';
}

// Offered on the Today screen; someone who turned reminders off is not asked again.
export const shouldOfferReminder = () => reminderStatus() === 'off' && !read(OFF);

// The SDK loads only when push is really in use, so the first screen stays light.
async function withMessaging(work) {
  const messaging = await import('firebase/messaging');
  if (!await messaging.isSupported()) return null;
  await navigator.serviceWorker.register('./sw.js');
  return work(messaging, messaging.getMessaging(app), await navigator.serviceWorker.ready);
}

const hashHex = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');

// Saves this device for the signed-in account. Runs on every app open but writes only on a change
// or once a week, which keeps Spark writes low and the job's stale-device cleanup honest.
export async function syncPush() {
  if (!pushPossible() || Notification.permission !== 'granted' || read(OFF) || !state.user) return false;
  const token = await withMessaging((m, messaging, serviceWorkerRegistration) => m.getToken(messaging, {vapidKey: window.TESTERHUB_VAPID_KEY, serviceWorkerRegistration}));
  if (!token) return false;
  const id = await hashHex(token), hour = reminderUtcHour(getReminderHour());
  const signature = [state.user.uid, id, hour].join('|');
  const [lastSignature, lastAt] = (read(SYNCED) || '').split('@');
  if (lastSignature === signature && Date.now() - Number(lastAt) < RESYNC_MS) return false;
  await savePushDevice(id, token, hour);
  write(DEVICE, id);
  write(SYNCED, signature + '@' + Date.now());
  return true;
}

export async function enableNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('هذا المتصفح لا يدعم التنبيهات. جرّب Chrome.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { toast('لم تسمح بالتنبيهات.'); return; }
  if (!pushPossible()) {
    await notify('TesterHub', 'ستصلك التنبيهات ما دام التطبيق مفتوحاً.', 'testerhub-test');
    toast('فُعّلت التنبيهات أثناء فتح التطبيق.');
    return;
  }
  forget(OFF);
  forget(SYNCED);
  if (!await syncPush()) throw new Error('هذا المتصفح لا يستقبل التذكير والتطبيق مغلق. أضف موعداً إلى تقويم هاتفك.');
  toast('فُعّل التذكير اليومي على هذا الجهاز.');
}

async function removeDevice() {
  const id = read(DEVICE);
  if (id) await deletePushDevice(id);
  forget(DEVICE);
  forget(SYNCED);
}

export async function disablePush() {
  write(OFF, '1');
  await removeDevice();
  await withMessaging((m, messaging) => m.deleteToken(messaging));
}

// Sign-out must stop this device receiving the account's reminders, but a slow network must not hold it up.
export async function forgetDevice() {
  await Promise.race([removeDevice(), new Promise(done => setTimeout(done, 3000))]).catch(err => console.warn('push', err.code || err.message));
}

// While the app is focused the service worker hands the reminder here instead of showing a notification.
export function listenForReminders() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'testerhub-reminder') toast(event.data.body || event.data.title);
  });
}

export function dailyReminder(dueCount, today) {
  if (!dueCount || new Date().getHours() < getReminderHour()) return;
  if (read(FIRED) === today) return;
  notify('حان وقت اختبار اليوم', 'لديك تطبيق بانتظار تقريرك اليوم.', 'testerhub-daily').then(sent => { if (sent) write(FIRED, today); }).catch(() => {});
}
