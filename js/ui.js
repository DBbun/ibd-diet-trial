// Small rendering helpers shared by the views.

import { CONFIG } from './config.js';

export function labName(l) {
  return l.type === 'custom' ? l.name : CONFIG.labTypes[l.type]?.label ?? l.type;
}

export function labUnit(l) {
  return l.type === 'custom' ? l.unit || '' : CONFIG.labTypes[l.type]?.unit ?? '';
}

// Share through the phone's own share sheet (the user chooses where it goes); fall back to copying.
export async function shareText(title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; } catch { return 'cancelled'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}

// Open the person's own mail app with a draft. Nothing is sent until they tap send, and the app
// itself still sends nothing: this hands the text to the mail client and stops there.
export function mailTo(to, subject, body) {
  window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fmt(x, digits = 1) {
  return x == null || Number.isNaN(x) ? '—' : x.toFixed(digits);
}

export function pct(x) {
  return x == null ? '—' : `${Math.round(x * 100)}%`;
}

// A row of single-choice tap buttons. `value` null means "not answered".
export function choiceRow({ field, legend, options, value, hint = '' }) {
  const buttons = options.map((o) => {
    const pressed = value === o.value;
    return `<button type="button" class="choice${pressed ? ' is-on' : ''}" aria-pressed="${pressed}"
      data-action="set" data-field="${field}" data-value="${o.value}" title="${esc(o.title || o.label)}">${esc(o.label)}</button>`;
  }).join('');
  return `<fieldset class="field">
    <legend>${esc(legend)}${value == null ? ' <span class="unanswered">not answered</span>' : ''}</legend>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
    <div class="choices" role="group">${buttons}</div>
  </fieldset>`;
}

export function chipGroup({ field, legend, options, values = [], hint = '' }) {
  const chips = options.map((o) => {
    const on = values.includes(o.value);
    return `<button type="button" class="chip${on ? ' is-on' : ''}" aria-pressed="${on}"
      data-action="toggle" data-field="${field}" data-value="${o.value}" title="${esc(o.title || '')}">${esc(o.label)}</button>`;
  }).join('');
  return `<fieldset class="field">
    <legend>${esc(legend)}</legend>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
    <div class="chips" role="group">${chips}</div>
  </fieldset>`;
}

export function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function demoBanner(settings, extraClass = '') {
  if (!settings?.demo) return '';
  const id = Number(settings.simPatient);
  const text = Number.isInteger(id) && id > 0
    ? `Simulated patient #${id} from the <a href="sim.html#patient-${id}">simulation lab</a>. Not a real person.`
    : 'Simulated demo data. Not a real person.';
  return `<p class="demo-banner ${extraClass}">${text}
    <button type="button" class="linklike" data-action="reset-all">Clear it and start my own</button></p>`;
}
