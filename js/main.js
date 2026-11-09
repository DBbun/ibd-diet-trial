import { CONFIG } from './config.js';
import { addDays } from './dates.js';
import * as store from './store.js';
import { buildDemo } from './demo.js';
import { esc, download, shareText, labName, labUnit } from './ui.js';
import { renderSetup, ownTests } from './views/setup.js';
import { renderToday, blankEntry } from './views/today.js';
import { renderTimeline } from './views/timeline.js';
import { renderSummary, toCSV } from './views/summary.js';
import { renderAbout } from './views/about.js';
import { toFHIR } from './fhir.js';

let state = store.load();
const ctx = freshCtx();

function freshCtx() {
  const t = store.today(state);
  return {
    setup: { step: 0, condition: null, normalStools: 2, startDate: t, ack: false, customTests: ['', ''], health: { conditions: [], treatments: [], dxYear: '' } },
    viewDate: t,
    drafts: {},
    weeklyDraft: { items: [] },
    weeklyOpen: false,
    labsOpen: false,
    labDraft: { type: 'calprotectin', value: '', date: '' },
    expDraft: { food: '', pattern: null, since: '', note: '' },
    expOpen: false,
    feedbackDraft: '',
    weightDraft: '',
  };
}

const ROUTES = ['today', 'timeline', 'summary', 'about'];
const route = () => {
  const r = location.hash.replace('#', '');
  return ROUTES.includes(r) ? r : 'today';
};

function draftFor(date) {
  if (!ctx.drafts[date]) {
    const saved = state.entries[date];
    ctx.drafts[date] = saved ? { ...blankEntry(date), ...structuredClone(saved) } : blankEntry(date);
  }
  return ctx.drafts[date];
}

function commit() {
  if (!store.save(state)) toast('Could not save on this device (storage is full or blocked).');
}

// ---------- rendering ----------

function nav(active) {
  const items = [['today', 'Today'], ['timeline', 'Timeline'], ['summary', 'Summary'], ['about', 'About']];
  return `<nav class="tabs no-print" aria-label="Main">${items.map(([id, label]) =>
    `<a href="#${id}" class="tab${active === id ? ' is-active' : ''}" ${active === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function render() {
  const root = document.getElementById('app');
  const focusKey = focusSignature(document.activeElement);
  const todayISO = store.today(state);
  let main;
  if (!state.settings) {
    main = renderSetup(ctx);
    root.innerHTML = `${header()}<main id="main" class="container">${main}</main>`;
  } else {
    const r = route();
    if (r === 'today') {
      if (ctx.viewDate > todayISO) ctx.viewDate = todayISO;
      if (ctx.viewDate < state.settings.startDate) ctx.viewDate = todayISO < state.settings.startDate ? todayISO : state.settings.startDate;
      ctx.draft = draftFor(ctx.viewDate);
      main = renderToday(state, ctx, todayISO);
    } else if (r === 'timeline') main = renderTimeline(state, todayISO);
    else if (r === 'summary') main = renderSummary(state, todayISO);
    else main = renderAbout(state, ctx);
    root.innerHTML = `${header()}<main id="main" class="container route-${r}">${main}</main>${nav(r)}`;
  }
  restoreFocus(focusKey);
}

function header() {
  return `<header class="topbar no-print"><div class="container">
    <span class="brand">${esc(CONFIG.appName)}</span>
    <span class="private-badge" title="Stored only on this phone">🔒 On this phone only</span>
  </div></header>`;
}

function focusSignature(el) {
  if (!el || !el.dataset || !el.dataset.action) return null;
  return { action: el.dataset.action, field: el.dataset.field, value: el.dataset.value };
}

function restoreFocus(sig) {
  if (!sig) return;
  const sel = `[data-action="${sig.action}"]${sig.field ? `[data-field="${sig.field}"]` : ''}${sig.value != null ? `[data-value="${CSS.escape(sig.value)}"]` : ''}`;
  const el = document.querySelector(sel);
  if (el) el.focus({ preventScroll: true });
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

// ---------- actions ----------

function parseValue(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !Number.isNaN(Number(v))) return Number(v);
  return v;
}

const actions = {
  'setup-condition': (v) => { ctx.setup.condition = v; },
  'setup-next': () => { ctx.setup.step = Math.min(4, ctx.setup.step + 1); window.scrollTo(0, 0); },
  'setup-health': (v) => { const a = ctx.setup.health.conditions; const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); },
  'setup-tx': (v) => { const a = ctx.setup.health.treatments; const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); },
  'setup-back': () => { ctx.setup.step = Math.max(0, ctx.setup.step - 1); window.scrollTo(0, 0); },
  'setup-stools': (_, el) => { ctx.setup.normalStools = Math.max(0, ctx.setup.normalStools + Number(el.dataset.delta)); },
  'setup-finish': () => {
    const s = ctx.setup;
    const settings = { condition: s.condition, normalStools: s.normalStools, startDate: s.startDate, createdAt: new Date().toISOString() };
    const year = Number(s.health.dxYear);
    const health = { conditions: [...s.health.conditions], treatments: [...s.health.treatments] };
    if (Number.isInteger(year) && year >= 1940 && year <= Number(s.startDate.slice(0, 4))) health.dxYear = year;
    if (health.conditions.length || health.treatments.length || health.dxYear) settings.health = health;
    const own = ownTests(s);
    if (own.length) settings.customTests = own;
    state = { ...store.emptyState(), settings };
    commit();
    Object.assign(ctx, freshCtx());
    location.hash = '#today';
    toast('Your trial is set up.');
  },
  'reset-all': () => {
    const demo = !!state.settings?.demo;
    const msg = demo
      ? 'Clear the simulated demo data and start your own 12 weeks? Nothing of yours is lost: the demo is not real.'
      : 'Delete everything you have logged on this phone and start again? This cannot be undone.';
    if (!confirm(msg)) return;
    state = store.emptyState();
    commit();
    Object.assign(ctx, freshCtx());
    location.hash = '#today';
    toast(demo ? 'Demo data cleared.' : 'Everything cleared.');
  },
  'demo-load': (v) => {
    if (state.settings && !state.settings.demo && Object.keys(state.entries).length &&
      !confirm('Loading demo data replaces your entries on this phone. Continue?')) return;
    state = { ...store.emptyState(), ...buildDemo(v, store.today({ clockOffsetDays: 0 })) };
    commit();
    Object.assign(ctx, freshCtx());
    location.hash = '#today';
    toast('Simulated demo data loaded.');
  },
  set: (v, el) => {
    const f = el.dataset.field;
    const val = parseValue(v);
    ctx.draft[f] = ctx.draft[f] === val ? null : val; // tapping the selected answer clears it
    if (f === 'onPlan' && ctx.draft.onPlan === true) ctx.draft.offFoods = [];
    if (f === 'tested' && ctx.draft.tested !== true) ctx.draft.testPortion = null;
  },
  toggle: (v, el) => {
    const f = el.dataset.field;
    const arr = ctx.draft[f] || (ctx.draft[f] = []);
    const i = arr.indexOf(v);
    if (i >= 0) { arr.splice(i, 1); return; }
    arr.push(v);
    if (f === 'offFoods') ctx.draft.onPlan = false;
    if (f === 'factors') {
      for (const group of CONFIG.exclusiveFactors) {
        if (group.includes(v)) ctx.draft[f] = ctx.draft[f].filter((x) => x === v || !group.includes(x));
      }
    }
  },
  step: (_, el) => {
    const f = el.dataset.field;
    const d = Number(el.dataset.delta);
    const cur = ctx.draft[f];
    ctx.draft[f] = cur == null ? (d < 0 ? 0 : 1) : Math.max(0, cur + d);
  },
  'set-med': (v) => {
    ctx.draft.med.change = v;
    if (v === 'none') ctx.draft.med.drug = '';
  },
  'same-as-yesterday': () => {
    const y = state.entries[addDays(ctx.viewDate, -1)];
    if (!y) return;
    const keep = ['wellbeing', 'pain', 'stools', 'bleeding', 'fatigue', 'onPlan', 'offFoods', 'factors'];
    for (const k of keep) ctx.draft[k] = structuredClone(y[k]);
    toast("Copied yesterday's answers. Check them, then save.");
  },
  'save-entry': () => {
    const d = ctx.draft;
    const answered = d.rough || ['wellbeing', 'pain', 'stools', 'bleeding', 'fatigue', 'tested', 'testPortion', 'onPlan'].some((k) => d[k] != null) ||
      d.offFoods.length || d.factors.length || d.note.trim() || d.med.change !== 'none';
    if (!answered) { toast('Nothing to save yet.'); return; }
    state.entries[ctx.viewDate] = { ...structuredClone(d), note: d.note.trim(), savedAt: new Date().toISOString() };
    delete ctx.drafts[ctx.viewDate];
    commit();
    toast('Saved.');
    if (ctx.viewDate === store.today(state)) setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  },
  'rough-day': () => {
    const d = ctx.viewDate;
    state.entries[d] = { ...structuredClone(ctx.draft), rough: true, savedAt: new Date().toISOString() };
    delete ctx.drafts[d];
    commit();
    toast('Marked as a rough day. Take care of yourself.');
  },
  'catchup-log': () => { ctx.viewDate = addDays(store.today(state), -1); window.scrollTo(0, 0); },
  'catchup-rough': () => {
    const y = addDays(store.today(state), -1);
    state.entries[y] = { ...blankEntry(y), ...(state.entries[y] || {}), rough: true, savedAt: new Date().toISOString() };
    delete ctx.drafts[y];
    commit();
    toast('Yesterday marked as a rough day.');
  },
  'unmark-rough': () => {
    const d = ctx.viewDate;
    if (!state.entries[d]) return;
    state.entries[d] = { ...state.entries[d], rough: false };
    delete ctx.drafts[d];
    commit();
  },
  'catchup-skip': () => {
    state.catchupSkipped = [...(state.catchupSkipped || []), addDays(store.today(state), -1)];
    commit();
  },
  'extend-baseline': () => {
    state.settings.baselineDays = CONFIG.analysis.baselineMaxDays;
    commit();
    toast('Baseline extended by one week.');
  },
  'dismiss-extend': () => {
    state.settings.baselineExtendDismissed = true;
    commit();
  },
  'date-shift': (_, el) => { ctx.viewDate = addDays(ctx.viewDate, Number(el.dataset.delta)); ctx.weeklyDraft = { items: [] }; },
  'open-day': (v) => { ctx.viewDate = v; location.hash = '#today'; },
  'weekly-toggle': (v) => {
    const a = ctx.weeklyDraft.items;
    const i = a.indexOf(v);
    if (i >= 0) a.splice(i, 1); else a.push(v);
  },
  'weight-unit': (v) => { state.settings.weightUnit = v; commit(); },
  'weight-save': () => {
    const value = Number(ctx.weightDraft);
    if (!ctx.weightDraft || Number.isNaN(value) || value <= 0) { toast('Enter your weight first.'); return; }
    state.weights = (state.weights || []).filter((w) => w.date !== ctx.viewDate);
    state.weights.push({ date: ctx.viewDate, value });
    ctx.weightDraft = '';
    commit();
    toast('Weight saved.');
  },
  'pause-ack': () => {
    state.settings.pauseAckUntil = addDays(store.today(state), CONFIG.analysis.pause.snoozeDays);
    commit();
    toast('Thanks. The app will check again in a week.');
  },
  'weekly-save': () => {
    state.weekly = state.weekly.filter((w) => w.date !== ctx.viewDate);
    state.weekly.push({ date: ctx.viewDate, items: [...ctx.weeklyDraft.items] });
    ctx.weeklyDraft = { items: [] };
    commit();
    toast('Weekly check saved.');
  },
  'lab-add': () => {
    const l = ctx.labDraft;
    const value = Number(l.value);
    if (l.value === '' || Number.isNaN(value) || value < 0) { toast('Enter a result first.'); return; }
    if (l.type === 'custom' && !(l.name || '').trim()) { toast('Enter the test name.'); return; }
    const lab = { date: l.date || ctx.viewDate, type: l.type, value };
    if (l.type === 'custom') { lab.name = l.name.trim(); lab.unit = (l.unit || '').trim(); }
    state.labs.push(lab);
    ctx.labDraft = { ...l, value: '', date: '' };
    commit();
    toast('Lab result added.');
  },
  'lab-delete': (v) => {
    const i = Number(v);
    const l = state.labs[i];
    if (!l || !confirm(`Delete this result (${labName(l)} ${l.value} ${labUnit(l)})?`)) return;
    state.labs.splice(i, 1);
    commit();
    toast('Lab result deleted.');
  },
  'exp-pattern': (v) => { ctx.expDraft.pattern = ctx.expDraft.pattern === v ? null : v; },
  'exp-save': () => {
    const x = ctx.expDraft;
    if (!x.food.trim() || !x.pattern) { toast('Add a food and what you noticed.'); return; }
    state.experiences = state.experiences || [];
    state.experiences.push({ id: `${Date.now()}`, date: store.today(state), food: x.food.trim(), pattern: x.pattern,
      since: x.since.trim(), note: x.note.trim() });
    ctx.expDraft = { food: '', pattern: null, since: '', note: '' };
    commit();
    toast('Experience saved.');
  },
  'exp-delete': (v) => {
    state.experiences = (state.experiences || []).filter((e) => e.id !== v);
    commit();
  },
  'exp-share': async () => {
    const lines = (state.experiences || []).map((e) => `- ${e.food}: ${CONFIG.experiencePatterns[e.pattern]}${e.since ? ` (${e.since})` : ''}${e.note ? `. ${e.note}` : ''}`);
    const r = await shareText('My food experiences', `My food experiences (from ${CONFIG.appName}):\n${lines.join('\n')}`);
    if (r === 'copied') toast('Copied. Paste it into a message or email.');
  },
  'feedback-save': () => {
    const t = ctx.feedbackDraft.trim();
    if (!t) { toast('Write something first.'); return; }
    state.feedback = state.feedback || [];
    state.feedback.push({ date: store.today(state), text: t });
    ctx.feedbackDraft = '';
    commit();
    toast('Saved on this phone.');
  },
  'feedback-share': async () => {
    const all = (state.feedback || []).map((f) => `- ${f.date}: ${f.text}`).join('\n');
    const text = [ctx.feedbackDraft.trim(), all].filter(Boolean).join('\n');
    if (!text) { toast('Write something first.'); return; }
    const r = await shareText(`Feedback on ${CONFIG.appName}`, `Feedback on ${CONFIG.appName}:\n${text}`);
    if (r === 'copied') toast('Copied. Paste it into a message or email.');
  },
  print: () => window.print(),
  'export-csv': () => download(`ibd-food-pattern-${store.today(state)}.csv`, toCSV(state), 'text/csv'),
  'export-json': () => download(`ibd-food-pattern-${store.today(state)}.json`,
    JSON.stringify({ exportedAt: new Date().toISOString(), app: CONFIG.appName, format: 1, ...state }, null, 2), 'application/json'),
  'export-fhir': () => download(`ibd-food-pattern-fhir-${store.today(state)}.json`,
    JSON.stringify(toFHIR(state), null, 2), 'application/fhir+json'),
  'delete-all': () => {
    if (!confirm('Delete all your data from this phone? This cannot be undone.')) return;
    state = store.clearAll();
    Object.assign(ctx, freshCtx());
    location.hash = '';
    toast('All data deleted.');
  },
  clock: (v) => {
    state.clockOffsetDays = Number(v) === 0 ? 0 : (state.clockOffsetDays || 0) + Number(v);
    commit();
    ctx.viewDate = store.today(state);
    ctx.drafts = {};
    toast(Number(v) === 0 ? 'Date reset to today.' : `Moved ahead ${v} day${Number(v) === 1 ? '' : 's'}.`);
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  const out = fn(el.dataset.value, el);
  if (out && typeof out.then === 'function') out.then(render); else render();
});

document.addEventListener('input', (e) => {
  const el = e.target;
  const key = el.dataset && el.dataset.input;
  if (!key) return;
  if (key === 'setup-start') { ctx.setup.startDate = el.value || store.today(state); return; }
  if (key === 'setup-ack') { ctx.setup.ack = el.checked; render(); return; }
  if (key === 'setup-dxyear') { ctx.setup.health.dxYear = el.value; return; }
  if (key === 'setup-own-0' || key === 'setup-own-1') {
    const i = Number(key.slice(-1));
    const had = (ctx.setup.customTests[0] || '').trim();
    ctx.setup.customTests[i] = el.value;
    if (i === 0 && !had !== !el.value.trim()) render(); // show or hide the second box
    return;
  }
  if (key === 'med-drug') { ctx.draft.med.drug = el.value; return; }
  if (key === 'note') { ctx.draft.note = el.value; return; }
  if (key === 'lab-type') {
    if (el.value.startsWith('custom:')) {
      const s = el.value.slice(7);
      const cut = s.lastIndexOf('|');
      const [name, unit] = cut < 0 ? [s, ''] : [s.slice(0, cut), s.slice(cut + 1)];
      ctx.labDraft = { ...ctx.labDraft, type: 'custom', name, unit };
    } else ctx.labDraft = { ...ctx.labDraft, type: el.value, name: '', unit: '' };
    render();
    return;
  }
  if (key === 'lab-name') ctx.labDraft.name = el.value;
  if (key === 'lab-unit') ctx.labDraft.unit = el.value;
  if (key === 'exp-food') ctx.expDraft.food = el.value;
  if (key === 'exp-since') ctx.expDraft.since = el.value;
  if (key === 'exp-note') ctx.expDraft.note = el.value;
  if (key === 'feedback') ctx.feedbackDraft = el.value;
  if (key === 'weight-value') ctx.weightDraft = el.value;
  if (key === 'lab-value') ctx.labDraft.value = el.value;
  if (key === 'lab-date') ctx.labDraft.date = el.value;
});

// <details> "toggle" does not bubble; listen in the capture phase.
document.addEventListener('toggle', (e) => {
  if (e.target.matches && e.target.matches('details.labs')) ctx.labsOpen = e.target.open;
  if (e.target.matches && e.target.matches('details.experiences')) ctx.expOpen = e.target.open;
}, true);

// Shortcut links: #demo (Crohn's) or #demo-uc load the simulated demo data, then open Today.
function handleShortcut() {
  const m = location.hash.match(/^#demo(?:-(cd|uc))?(?:\/(today|timeline|summary|about))?$/i);
  if (!m) return false;
  const view = (m[2] || 'today').toLowerCase();
  const cond = (m[1] || 'cd').toUpperCase();
  const hasRealData = state.settings && !state.settings.demo && Object.keys(state.entries).length;
  if (hasRealData && !confirm('Loading demo data replaces your entries on this phone. Continue?')) {
    history.replaceState(null, '', `#${view}`);
    return false;
  }
  state = { ...store.emptyState(), ...buildDemo(cond, store.today({ clockOffsetDays: 0 })) };
  commit();
  Object.assign(ctx, freshCtx());
  history.replaceState(null, '', `#${view}`);
  render();
  toast('Simulated demo data loaded.');
  return true;
}

// The skip link moves focus to the content instead of changing the route.
document.addEventListener('click', (e) => {
  const skip = e.target.closest && e.target.closest('a.skip');
  if (!skip) return;
  e.preventDefault();
  const m = document.getElementById('main');
  if (m) { m.setAttribute('tabindex', '-1'); m.focus(); }
});

window.addEventListener('hashchange', () => {
  if (handleShortcut()) return;
  render();
  window.scrollTo(0, 0);
});

if (!handleShortcut()) render();

// Offline support is only for the deployed https site. On local http (this computer or Wi-Fi testing) remove any
// earlier worker so the newest files always load.
if ('serviceWorker' in navigator && location.protocol !== 'https:') {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (!regs.length) return;
    Promise.all(regs.map((r) => r.unregister()))
      .then(() => (window.caches ? caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))) : null))
      .then(() => location.reload());
  });
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // When an updated version takes over, reload once so people never keep seeing the old app.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
  navigator.serviceWorker.register('sw-offline.js').then((reg) => reg.update()).catch(() => { /* offline support is optional */ });
}
