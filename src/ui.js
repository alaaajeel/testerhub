// Small presentation helpers shared by every screen.
import {dayStrip} from './domain.js';

export const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));

const paths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  tests: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 3v3M16 3v3M8 13l2.5 2.5L16 10"/>',
  record: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  apps: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  back: '<path d="m9 18 6-6-6-6"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-1L3 21l1.5-5A9 9 0 1 1 21 11.5z"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  flag: '<path d="M5 21V4h12l-2 4 2 4H5"/>',
  shield: '<path d="M12 2 4 5v6c0 5 4 9 8 11 4-2 8-6 8-11V5z"/>',
  warn: '<path d="M12 3 2 20h20zM12 10v4M12 17h.01"/>',
  power: '<path d="M12 2v10M6.5 4.8a9 9 0 1 0 11 0"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>',
};
export const icon = (name, size = 20) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;

// One numeral style everywhere: Play Console, dates and copy all use the same digits.
export const num = n => new Intl.NumberFormat('en-US').format(n);
export const when = ms => Number.isFinite(ms) ? new Date(ms).toLocaleString('ar-IQ-u-nu-latn', {dateStyle: 'short', timeStyle: 'short'}) : '';

export function strip(a) {
  const labels = {done: 'تقرير مسجل', today: 'اليوم', missed: 'بلا تقرير', future: 'لم يأت بعد'};
  const cells = dayStrip(a);
  const done = cells.filter(c => c.state === 'done').length;
  return `<div class="strip" role="img" aria-label="${done} تقارير من 14 يوماً">${cells.map(c => `<i class="${c.state}" title="اليوم ${c.day}: ${labels[c.state]}"></i>`).join('')}</div>`;
}

export const meter = (value, max, tone = '') => `<div class="meter ${tone}" role="progressbar" aria-valuenow="${value}" aria-valuemin="0" aria-valuemax="${max}"><i style="width:${Math.min(100, max ? value / max * 100 : 0)}%"></i></div>`;

export const empty = (title, body, action = '') => `<div class="empty"><strong>${title}</strong><p>${body}</p>${action}</div>`;

const toastEl = () => document.getElementById('toast');
let toastTimer;
export function toast(message, tone = '') {
  const el = toastEl();
  clearTimeout(toastTimer);
  el.textContent = String(message);
  el.className = 'show ' + tone;
  toastTimer = setTimeout(() => { el.className = ''; }, tone === 'error' ? 6000 : 3200);
}

// Native dialogs are unstyled and block the PWA; this keeps one accessible modal.
export function dialog({title, body = '', confirm = 'تأكيد', cancel = 'إلغاء', danger = false, input = null}) {
  return new Promise(resolve => {
    const el = document.createElement('dialog');
    el.className = 'modal';
    el.innerHTML = `<form method="dialog"><h3>${esc(title)}</h3>${body ? `<p>${esc(body)}</p>` : ''}${input ? `<label class="field"><span>${esc(input.label)}</span><textarea name="value" rows="3" maxlength="${input.max || 500}" required></textarea></label>` : ''}<div class="row end"><button class="btn ghost" value="cancel" formnovalidate>${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(confirm)}</button></div></form>`;
    document.body.append(el);
    el.addEventListener('close', () => {
      const ok = el.returnValue === 'ok';
      const value = el.querySelector('textarea')?.value;
      el.remove();
      resolve(ok ? (input ? value : true) : (input ? null : false));
    });
    el.showModal();
  });
}

export async function copyText(text, done = 'تم النسخ') {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    toast(ok ? done : 'تعذر النسخ؛ حدد النص وانسخه يدوياً.', ok ? '' : 'error');
  }
}
