// Reminders that work without a server: a calendar file and notifications while the app is open.
import {calendarFile} from './domain.js';
import {toast} from './ui.js';

const KEY = 'testerhub_reminder_hour', FIRED = 'testerhub_reminder_fired';
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

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

export async function enableNotifications() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('هذا المتصفح لا يدعم التنبيهات. جرّب Chrome.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { toast('لم تسمح بالتنبيهات.'); return; }
  await notify('TesterHub', 'ستصلك التنبيهات ما دام التطبيق مفتوحاً.', 'testerhub-test');
  toast('فُعّلت التنبيهات أثناء فتح التطبيق.');
}

export function dailyReminder(dueCount, today) {
  if (!dueCount || new Date().getHours() < getReminderHour()) return;
  if (read(FIRED) === today) return;
  notify('حان وقت اختبار اليوم', 'لديك تطبيق بانتظار تقريرك اليوم.', 'testerhub-daily').then(sent => { if (sent) write(FIRED, today); }).catch(() => {});
}
