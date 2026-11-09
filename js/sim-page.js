// Simulation lab (sim.html): browse the 4,000 simulated patients from spec 6b, see what the app concluded for
// each one next to the known truth, and open any of them in the app.
import { CONFIG, CONDITIONS } from './config.js';
import { makeSpecs, simulateSpec, REVIEW_DATE, POPULATION_SIZE, SCENARIO_DEFAULTS, makeScenarioSpecs, scenarioConfig } from './population.js';
import { simulateParticipant } from './simulate.js';
import { summarize } from './analysis.js';
import { patientOutcome, summarizeOutcomes } from './evaluate.js';
import { SIM_RESULTS } from './sim-results.js';
import { esc, shareText } from './ui.js';
import { simSection } from './views/about.js';
import { renderSummary } from './views/summary.js';
import { renderTimeline } from './views/timeline.js';

const STORE_KEY = 'ibd-diet-trial.v1';
const PAGE = 25;
const FOOD = Object.fromEntries(CONFIG.reintroOrder.map((f) => [f.id, f.label]));
const foods = (ids) => (ids.length ? ids.map((id) => FOOD[id]).join(', ') : 'none');

let patients = [];

// ---------- Custom scenarios ----------
const SCEN_KEY = 'sim-lab-scenarios';
const PRESETS = {
  faded: { name: 'Triggers that fade (cherry tomatoes)', fadedShare: 0.3 },
  lateMeals: { name: 'Late meals or poor sleep on some days', confRate: 0.15, confMarkRate: 0.5 },
  remission: { name: 'In remission on a biologic', baseline: [1, 3], responderShare: 0.3 },
  medStart: { name: 'Steroid started mid-trial', medShare: 0.5, responderShare: 0.4 },
  delayed: { name: 'Delayed reactions (2-3 days later)', delayedShare: 0.5 },
  lowLogging: { name: 'Low logging (40-60% of days)', adherence: [0.4, 0.6] },
  flareMissing: { name: 'Flares cause missed days', flareRate: 0.04, mnar: 0.8 },
  flareFixed: { name: 'Flares + rough-day button + catch-up', flareRate: 0.04, mnar: 0.8, roughUse: 0.6, catchUp: 0.4 },
};
const scen = { params: structuredClone(SCENARIO_DEFAULTS), running: false, progress: 0, result: null, rows: [], data: new Map() };
const loadSaved = () => { try { return JSON.parse(localStorage.getItem(SCEN_KEY) || '[]'); } catch { return []; } };
const saveSaved = (list) => { try { localStorage.setItem(SCEN_KEY, JSON.stringify(list)); } catch { /* ignore */ } };
const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);


// The simulation's main assumptions, in plain words.
function assumptionsText(a) {
  if (!a) return '';
  const pc = (x) => `${Math.round(x * 100)}%`;
  const range = (r, f) => (Array.isArray(r) ? `${f(r[0])} to ${f(r[1])}` : f(r));
  return `Main assumptions: the diet truly helps ${pc(a.responderShare)} of the simulated people, lowering their symptom score by
    ${range(a.responseFraction, pc)}; each food group has a ${pc(a.triggerShare)} chance of being a true trigger; and a trigger
    raises the symptom score by ${range(a.triggerEffect, String)} points on the days it is eaten.`;
}

function numField(label, key, value, { min = 0, max = 100, step = 1, suffix = '%', scale = 100, hint = '' } = {}) {
  return `<label class="sp-field">${esc(label)}
    <span class="sp-input"><input type="number" data-sp="${key}" data-scale="${scale}" min="${min}" max="${max}" step="${step}" value="${Math.round(value * scale * 100) / 100}"><span class="muted small">${suffix}</span></span>
    ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>`;
}

function rangeSelect(label, key, value, options) {
  const cur = JSON.stringify(value);
  return `<label class="sp-field">${esc(label)}
    <select data-sp-range="${key}">${options.map(([l, v]) => `<option value='${JSON.stringify(v)}' ${JSON.stringify(v) === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}
    ${options.some(([, v]) => JSON.stringify(v) === cur) ? '' : `<option value='${esc(cur)}' selected>Custom ${esc(cur)}</option>`}</select></label>`;
}

function scenarioSection() {
  const P = scen.params;
  const saved = loadSaved();
  const R = scen.result;
  const results = R ? `
    <h3>Results: ${esc(R.name)} <span class="muted small">${R.n} simulated patients</span></h3>
    <div class="table-wrap"><table class="compare sim">
      <thead><tr><th>Group</th><th class="num">Real trigger flagged</th><th class="num">Safe food cleared</th><th class="num">Food test: not enough data</th><th class="num">Change shown correctly</th><th class="num">No before/after</th></tr></thead>
      <tbody>${R.groups.map((g) => `<tr><th scope="row">${esc(g.label)}</th><td class="num">${pct(g.tpr)}</td><td class="num">${pct(g.tnr)}</td><td class="num">${pct(g.insufficient)}</td><td class="num">${pct(g.improvedAgreement)}</td><td class="num">${pct(g.improvedInsufficient)}</td></tr>`).join('')}</tbody>
    </table></div>
    <ul class="scen-extra">
      ${R.all.pastN ? `<li><strong>${pct(R.all.pastCleared)}</strong> of foods that <em>used to</em> be triggers were correctly not flagged (${R.all.pastN} tests).</li>` : ''}
      ${R.all.delayedN ? `<li><strong>${pct(R.all.delayedCaught)}</strong> of delayed reactions were caught at their own test (${R.all.delayedN} tests). Missed ones can show up as a false flag on the next food.</li>` : ''}
      ${R.all.falseFlagN ? `<li><strong>${pct(R.all.falseFlagsWithNote)}</strong> of false flags came with an "Also consider" note (${R.all.falseFlagN} false flags).</li>` : ''}
      ${R.all.flareN ? `<li><strong>${pct(R.all.flareVisible)}</strong> of flare days are visible to the app (logged, marked rough, or filled in the next day), out of ${R.all.flareN} flare days.</li>` : ''}
      ${R.all.medN ? `<li><strong>${pct(R.all.medNonResponderShownImproved)}</strong> of people the diet did <em>not</em> help, but who started a medication, were shown as improved (${R.all.medN} people); for ${pct(R.all.medCaveatShown)} of those, the summary also showed the medication caveat (the change had been logged).</li>` : ''}
    </ul>
    ${scen.rows.length ? `<h3>Where the app's answer differed from the truth <span class="muted small">first ${Math.min(20, scen.rows.length)} of ${scen.rows.length}</span></h3>
      <p class="small">Not a bug. Each simulated patient has hidden true answers. These are the patients where the app's
      conclusion did not match them, the expected errors that the percentages above count.
      <strong>Missed</strong>: a real trigger the app did not flag. <strong>Wrongly flagged</strong>: a safe food the app flagged. Tap a number to see why.</p>
      <ul class="scen-cases">${scen.rows.slice(0, 20).map((o) => `<li><button type="button" class="linklike" data-scen-open="${o.id}">#${o.id}</button> ${o.c === 'CD' ? "Crohn's" : 'colitis'}: ${[
        o.missed.length ? `missed ${esc(o.missed.map((f) => FOOD[f]).join(', '))}` : '',
        o.falseFlags.length ? `wrongly flagged ${esc(o.falseFlags.map((f) => FOOD[f]).join(', '))}` : '',
        o.imp !== null && o.imp !== o.r ? 'before/after comparison wrong' : '',
      ].filter(Boolean).join('; ')}</li>`).join('')}</ul>` : ''}
    <p class="small muted">Simulated results under the assumptions you set, not evidence about real people.</p>` : '';
  return `<section class="panel scenario" id="scenario-panel">
    <h2 class="h3">Try your own scenario</h2>
    <p class="small">This creates a <strong>new, separate group</strong> of simulated patients under conditions you choose,
    then checks the app's rules on them. It does not change the ${POPULATION_SIZE.toLocaleString()} patients in the main test.
    The group has 300 patients by default, so it runs in a few seconds. Examples: a food that stopped being a trigger,
    a late meal on a test day, or starting a medication mid-trial. Runs entirely in this browser.</p>
    <div class="chips">${Object.entries(PRESETS).map(([k, v]) => `<button type="button" class="chip" data-preset="${k}">${esc(v.name)}</button>`).join('')}
      <button type="button" class="chip" data-preset="reset">Reset to defaults</button></div>
    <div class="sp-grid">
      <label class="sp-field">Scenario name <input type="text" data-sp-text="name" value="${esc(P.name)}"></label>
      ${numField('Group size (patients)', 'n', P.n, { min: 50, max: 2000, step: 50, suffix: '', scale: 1 })}
      ${numField('Ulcerative colitis share', 'ucShare', P.ucShare)}
      ${rangeSelect('Days logged', 'adherence', P.adherence, [['Most days (85–95%)', [0.85, 0.95]], ['About half (45–60%)', [0.45, 0.6]], ['Few (25–40%)', [0.25, 0.4]], ['Mixed (45–95%)', [0.45, 0.95]]])}
      ${rangeSelect('Day-to-day symptoms', 'noise', P.noise, [['Mixed', [0.5, 1.6]], ['Steady', [0.5, 0.9]], ['Variable', [1.2, 1.6]]])}
      ${rangeSelect('Symptom level at baseline', 'baseline', P.baseline, [['Mixed (5–12)', [5, 12]], ['Mild (5–8)', [5, 8]], ['Severe (9–12)', [9, 12]], ['Remission (1–3)', [1, 3]]])}
      ${numField('Diet truly helps', 'responderShare', P.responderShare)}
      ${numField('Each food is a trigger for', 'triggerShare', P.triggerShare)}
      ${numField('Foods that used to be triggers', 'fadedShare', P.fadedShare, { hint: 'Share of non-trigger foods that bothered the person in the past but no longer do.' })}
      ${numField('Delayed reactions', 'delayedShare', P.delayedShare, { hint: 'Share of triggers that react 2–3 days later, during the next test.' })}
      ${numField('Days with a late meal or poor sleep', 'confRate', P.confRate, { hint: 'Unrelated bad days that raise symptoms.' })}
      ${numField('…and the person marks it', 'confMarkRate', P.confMarkRate)}
      ${numField('Start a medication mid-trial', 'medShare', P.medShare, { hint: 'Lowers symptoms from that day on; logged only if that day is logged.' })}
      ${numField('Flares start on', 'flareRate', P.flareRate, { hint: 'Chance per day that a 2–4 day flare starts.' })}
      ${numField('Less likely to log during a flare', 'mnar', P.mnar, { hint: 'People are least able to log on their worst days.' })}
      ${numField('Missed flare days marked "Rough day"', 'roughUse', P.roughUse)}
      ${numField('Missed days filled in next day', 'catchUp', P.catchUp)}
      ${numField("Flag threshold, Crohn's (HBI points)", 'flagCD', P.flagCD ?? CONFIG.analysis.flagMinDelta.CD, { min: 0.5, max: 5, step: 0.5, suffix: '', scale: 1 })}
      ${numField('Flag threshold, colitis (points)', 'flagUC', P.flagUC ?? CONFIG.analysis.flagMinDelta.UC, { min: 0.5, max: 4, step: 0.5, suffix: '', scale: 1 })}
    </div>
    <div class="actions left wrap">
      <button type="button" class="btn primary" data-scen-run ${scen.running ? 'disabled' : ''}>${scen.running ? `Running… ${Math.round(scen.progress * 100)}%` : 'Run scenario'}</button>
      <button type="button" class="btn" data-scen-save>Save scenario</button>
      <button type="button" class="btn" data-scen-share>Share scenario</button>
    </div>
    ${saved.length ? `<p class="small"><strong>Saved:</strong> ${saved.map((x, i) => `<span class="saved-scen"><button type="button" class="linklike" data-scen-load="${i}">${esc(x.name)}</button> <button type="button" class="linklike muted" data-scen-del="${i}" aria-label="Delete ${esc(x.name)}">✕</button></span>`).join(' · ')}</p>` : ''}
    ${results}
  </section>`;
}

async function runScenario() {
  const P = { ...scen.params };
  const cfg = scenarioConfig(P);
  const specs = makeScenarioSpecs(P, cfg);
  scen.running = true; scen.progress = 0; scen.data = new Map(); render();
  const outcomes = [];
  for (let i = 0; i < specs.length; i++) {
    const { data, truth } = simulateParticipant({ ...specs[i].sim, extendBaseline: true }, cfg);
    const s = summarize(data, REVIEW_DATE, cfg);
    const logged = Object.keys(data.entries).length;
    const total = s.bounds.reduce((n, b) => n + b.days, 0);
    outcomes.push(patientOutcome(specs[i].p, s, truth, {
      lg: Math.round((logged / total) * 100), ext: +!!data.settings.baselineDays,
      bh: +specs[i].p.baselineHigh, nh: +specs[i].p.noiseHigh, al: +specs[i].p.adherenceLow,
      flareN: truth.flareDays.length, flareSeen: truth.flareDays.filter((d) => data.entries[d]).length,
    }));
    data.settings.demo = true;
    data.settings.simPatient = `${P.name} #${i + 1}`;
    scen.data.set(i + 1, { data, cfg });
    if (i % 25 === 24) { scen.progress = (i + 1) / specs.length; render(); await new Promise((r) => setTimeout(r, 0)); }
  }
  const groups = [['Everyone', () => true], ["Crohn's disease", (o) => o.c === 'CD'], ['Ulcerative colitis', (o) => o.c === 'UC']]
    .map(([label, f]) => ({ label, ...summarizeOutcomes(outcomes.filter(f), CONFIG.reintroOrder.length) }));
  scen.result = { name: P.name, n: specs.length, groups, all: groups[0] };
  scen.rows = outcomes.filter((o) => o.missed.length || o.falseFlags.length || (o.imp !== null && o.imp !== o.r));
  scen.outcomes = new Map(outcomes.map((o) => [o.id, o]));
  scen.running = false;
  view.openId = null;
  render();
  document.getElementById('scenario-panel')?.scrollIntoView({ behavior: 'smooth' });
}
let specs = null; // generated on first detail view
const view = { tab: 'overview', condition: 'all', logging: 'all', outcome: 'all', page: 0, openId: null };
const TABS = [['overview', 'Overview'], ['results', 'Results'], ['patients', 'Patients'], ['scenario', 'Your scenario']];

// URL hash -> tab (and patient): #results, #patients, #scenario, #patient-12.
function readHash() {
  const h = location.hash.slice(1);
  const m = h.match(/^patient-(\d+)$/);
  if (m) { view.tab = 'patients'; view.openId = Number(m[1]); return; }
  view.tab = TABS.some(([k]) => k === h) ? h : 'overview';
  if (view.tab !== 'patients' && typeof view.openId === 'number') view.openId = null;
}

function tabsNav() {
  return `<nav class="sim-tabs" aria-label="Simulation lab sections">${TABS.map(([k, label]) =>
    `<a href="#${k}" class="sim-tab${view.tab === k ? ' is-active' : ''}" ${view.tab === k ? 'aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function verdict(p) {
  const caught = p.trig.filter((f) => p.flag.includes(f));
  const missed = p.trig.filter((f) => !p.flag.includes(f) && !p.ins.includes(f));
  const falseFlags = p.flag.filter((f) => !p.trig.includes(f));
  const improvement = p.imp === null ? 'none' : p.imp === p.r ? 'right' : 'wrong';
  const allRight = !missed.length && !falseFlags.length && improvement === 'right';
  return { caught, missed, falseFlags, improvement, allRight };
}

const OUTCOMES = {
  all: ['All patients', () => true],
  right: ['App right on everything', (p, v) => v.allRight && !p.ins.length],
  missed: ['Missed a real trigger', (p, v) => v.missed.length > 0],
  falseFlag: ['Flagged a safe food', (p, v) => v.falseFlags.length > 0],
  noData: ['"Not enough data" somewhere', (p, v) => p.ins.length > 0 || v.improvement === 'none'],
  wrongChange: ['Before/after comparison wrong', (p, v) => v.improvement === 'wrong'],
};

function filtered() {
  return patients.filter((p) => {
    if (view.condition !== 'all' && p.c !== view.condition) return false;
    if (view.logging === 'most' && p.al) return false;
    if (view.logging === 'half' && !p.al) return false;
    return OUTCOMES[view.outcome][1](p, verdict(p));
  });
}

function badge(text, kind) {
  return `<span class="badge badge-${kind}">${esc(text)}</span>`;
}

function rowBadges(p, v) {
  const out = [];
  if (v.allRight && !p.ins.length) out.push(badge('all right', 'good'));
  if (v.missed.length) out.push(badge(`missed ${v.missed.length}`, 'bad'));
  if (v.falseFlags.length) out.push(badge(`false flag ${v.falseFlags.length}`, 'bad'));
  if (v.improvement === 'wrong') out.push(badge('before/after wrong', 'bad'));
  if (p.ins.length || v.improvement === 'none') out.push(badge('not enough data', 'muted'));
  if (p.ext) out.push(badge('baseline extended', 'muted'));
  return out.join(' ');
}

function listSection() {
  const rows = filtered();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  view.page = Math.min(view.page, pages - 1);
  const slice = rows.slice(view.page * PAGE, (view.page + 1) * PAGE);
  const sel = (name, value, options) => `<label class="filter">${esc(name)}
    <select data-filter="${value}">${options.map(([v, l]) => `<option value="${v}" ${view[value] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<section class="panel" id="browse">
    <h2 class="h3">Browse the ${POPULATION_SIZE.toLocaleString()} simulated patients</h2>
    <div class="filters">
      ${sel('Condition', 'condition', [['all', 'Both'], ['CD', "Crohn's disease"], ['UC', 'Ulcerative colitis']])}
      ${sel('Logging', 'logging', [['all', 'Everyone'], ['most', 'Logs most days'], ['half', 'Logs about half of days']])}
      ${sel('Outcome', 'outcome', Object.entries(OUTCOMES).map(([k, [l]]) => [k, l]))}
    </div>
    <p class="small muted">${rows.length.toLocaleString()} of ${patients.length.toLocaleString()} patients match.</p>
    <div class="table-wrap"><table class="patients">
      <thead><tr><th>Patient</th><th>Truly improved?</th><th>True trigger foods</th><th>App flagged</th><th>Result</th></tr></thead>
      <tbody>${slice.map((p) => {
        const v = verdict(p);
        return `<tr>
          <td><button type="button" class="linklike" data-open="${p.id}">#${p.id}</button><span class="small muted block">${p.c} · logged ${p.lg}%</span></td>
          <td>${p.r ? 'Yes' : 'No'}</td>
          <td class="small">${esc(foods(p.trig))}</td>
          <td class="small">${esc(foods(p.flag))}</td>
          <td>${rowBadges(p, v)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="5" class="muted">No patients match these filters.</td></tr>'}</tbody>
    </table></div>
    <div class="pager">
      <button type="button" class="btn small" data-page="-1" ${view.page === 0 ? 'disabled' : ''}>‹ Previous</button>
      <span class="small">Page ${view.page + 1} of ${pages}</span>
      <button type="button" class="btn small" data-page="1" ${view.page >= pages - 1 ? 'disabled' : ''}>Next ›</button>
    </div>
  </section>`;
}

function patientData(id) {
  if (!specs) specs = makeSpecs(POPULATION_SIZE);
  const { data } = simulateSpec(specs[id - 1]);
  data.settings.demo = true;
  data.settings.simPatient = id;
  return data;
}

function detailSection(id) {
  const fromScenario = typeof id === 'string' && id.startsWith('s');
  const p = fromScenario ? scen.outcomes?.get(Number(id.slice(1))) : patients.find((x) => x.id === id);
  if (!p) return '';
  const v = verdict(p);
  const data = fromScenario ? scen.data.get(p.id).data : patientData(id);
  const state = { ...data, clockOffsetDays: 0 };
  const truthRows = [
    ['Truly improved on the diet?', p.r ? 'Yes' : 'No',
      v.improvement === 'none' ? 'Not enough data to compare' : `App said ${p.imp ? 'improved' : 'not clearly improved'}`,
      v.improvement === 'right' ? 'good' : v.improvement === 'wrong' ? 'bad' : 'muted'],
    ['Trigger foods', foods(p.trig), `App flagged: ${foods(p.flag)}`, v.missed.length || v.falseFlags.length ? 'bad' : 'good'],
  ];
  return `<section class="panel detail" id="detail" aria-label="Simulated patient ${id}">
    <div class="detail-head">
      <h2 class="h3">${fromScenario ? `Scenario "${esc(scen.result.name)}", patient #${p.id}` : `Simulated patient #${id}`}</h2>
      <button type="button" class="btn small" data-close>Close</button>
    </div>
    <p class="small muted">${esc(CONDITIONS[p.c].label)} · ${p.bh ? 'more severe' : 'milder'} baseline · ${p.nh ? 'variable' : 'steady'} day-to-day symptoms ·
      logged ${p.lg}% of days${p.ext ? ' · accepted the baseline extension' : ''}</p>
    <table class="truth"><thead><tr><th></th><th>Truth (known only in simulation)</th><th>What the app concluded</th></tr></thead>
      <tbody>${truthRows.map(([k, t, a, kind]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(t)}</td><td class="verdict-${kind}">${esc(a)}</td></tr>`).join('')}</tbody>
    </table>
    ${v.missed.length ? `<p class="small">Missed: ${esc(foods(v.missed))}.</p>` : ''}
    ${v.falseFlags.length ? `<p class="small">Flagged but not a real trigger: ${esc(foods(v.falseFlags))}.</p>` : ''}
    ${p.ins.length ? `<p class="small">Not enough logged days to judge: ${esc(foods(p.ins))}.</p>` : ''}
    ${p.past?.length ? `<p class="small">Used to be triggers, no longer: ${esc(foods(p.past))}${p.past.some((f) => p.flag.includes(f)) ? ' (the app flagged at least one of these)' : ' (correctly not flagged)'}.</p>` : ''}
    ${p.delayed?.length ? `<p class="small">Delayed reactions (2–3 days later): ${esc(foods(p.delayed))}.</p>` : ''}
    ${p.medEvent ? '<p class="small">Started a medication during elimination.</p>' : ''}
    ${fromScenario ? '' : `<div class="actions left"><button type="button" class="btn primary" data-open-app="${id}">Open this patient in the app</button></div>`}
    <div class="embedded">${renderSummary(state, REVIEW_DATE)}</div>
    <div class="embedded">${renderTimeline(state, REVIEW_DATE)}</div>
  </section>`;
}

function render() {
  const root = document.getElementById('app');
  root.innerHTML = `
    <header class="topbar"><div class="container">
      <span class="brand">Simulation lab</span>
      <a class="private-badge" href="./">Open the app ›</a>
    </div></header>
    <main id="main" class="container wide">
      <h1>Simulation lab</h1>
      ${tabsNav()}
      ${tabContent()}
    </main>`;
}

function tabContent() {
  const n = POPULATION_SIZE.toLocaleString();
  if (view.tab === 'results') {
    return `<section class="panel"><h2 class="h3">Main test: results for all ${n} simulated patients, by group</h2>${simSection()}</section>`;
  }
  if (view.tab === 'patients') {
    return `${listSection()}${typeof view.openId === 'number' ? detailSection(view.openId) : ''}`;
  }
  if (view.tab === 'scenario') {
    return `${scenarioSection()}${view.openId && String(view.openId).startsWith('s') ? detailSection(view.openId) : ''}`;
  }
  return `<section class="panel">
      <p class="lead">Before any real patient uses the app, its rules were tested on simulated people whose true answers are known:
      whether the diet truly helped them, and which foods truly trigger their symptoms. Each one went through the full
      protocol, logging on some days and not others, exactly as the app would see it.</p>
      <ul>
        <li><a href="#results"><strong>Results</strong></a>: the main test, a fixed group of ${n} simulated patients.
          These are the results reported for the app, by group.</li>
        <li><a href="#patients"><strong>Patients</strong></a>: browse the same ${n} patients and open any one to compare
          the app's conclusions with the truth.</li>
        <li><a href="#scenario"><strong>Your scenario</strong></a>: create a new, separate, smaller group under conditions
          you choose (for example, a trigger that faded over time) and see how the app's rules do.</li>
      </ul>
      <p class="small muted">Simulated patients, not real people. They are generated the same way every time, so patient #12 is always the same simulated person.
      ${assumptionsText(SIM_RESULTS?.assumptions)}</p>
    </section>`;
}

function openInApp(id) {
  let existing = null;
  try { existing = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { /* ignore */ }
  if (existing?.settings && !existing.settings.demo && Object.keys(existing.entries || {}).length &&
    !confirm('Opening a simulated patient replaces your own entries in the app on this device. Continue?')) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...patientData(id), clockOffsetDays: 0 }));
  } catch {
    alert('Could not save to this browser.');
    return;
  }
  location.href = './#summary';
}

document.addEventListener('change', (e) => {
  const d = e.target.dataset || {};
  if (d.sp) {
    const v = Number(e.target.value) / Number(d.scale || 1);
    scen.params[d.sp] = d.sp === 'n' ? Math.max(50, Math.min(2000, Math.round(v))) : v;
    return;
  }
  if (d.spRange) { scen.params[d.spRange] = JSON.parse(e.target.value); return; }
  if (d.spText) { scen.params[d.spText] = e.target.value; return; }
  const f = d.filter;
  if (!f) return;
  view[f] = e.target.value;
  view.page = 0;
  render();
});

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-open],[data-page],[data-close],[data-open-app],[data-preset],[data-scen-run],[data-scen-save],[data-scen-share],[data-scen-load],[data-scen-del],[data-scen-open]');
  if (!t) return;
  const ds = t.dataset;
  if (ds.preset) {
    scen.params = ds.preset === 'reset' ? structuredClone(SCENARIO_DEFAULTS) : { ...structuredClone(SCENARIO_DEFAULTS), ...structuredClone(PRESETS[ds.preset]) };
    render();
    return;
  }
  if (t.hasAttribute('data-scen-run')) { runScenario(); return; }
  if (t.hasAttribute('data-scen-save')) {
    const list = loadSaved().filter((x) => x.name !== scen.params.name);
    list.push(structuredClone(scen.params));
    saveSaved(list);
    render();
    return;
  }
  if (t.hasAttribute('data-scen-share')) {
    shareText(`Simulation scenario: ${scen.params.name}`, JSON.stringify(scen.params, null, 2));
    return;
  }
  if (ds.scenLoad) { scen.params = { ...structuredClone(SCENARIO_DEFAULTS), ...loadSaved()[Number(ds.scenLoad)] }; render(); return; }
  if (ds.scenDel) { const list = loadSaved(); list.splice(Number(ds.scenDel), 1); saveSaved(list); render(); return; }
  if (ds.scenOpen) {
    view.openId = `s${ds.scenOpen}`;
    render();
    document.getElementById('detail')?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  if (t.dataset.open) {
    location.hash = `#patient-${Number(t.dataset.open)}`;
  } else if (t.dataset.page) {
    view.page += Number(t.dataset.page);
    render();
    document.getElementById('browse')?.scrollIntoView();
  } else if (t.hasAttribute('data-close')) {
    const fromScenario = String(view.openId).startsWith('s');
    view.openId = null;
    if (!fromScenario && location.hash.startsWith('#patient-')) { location.hash = '#patients'; return; }
    render();
    document.getElementById(fromScenario ? 'scenario-panel' : 'browse')?.scrollIntoView();
  } else if (t.dataset.openApp) {
    openInApp(Number(t.dataset.openApp));
  }
});

fetch('sim-patients.json')
  .then((r) => r.json())
  .then((rows) => {
    patients = rows;
    readHash();
    render();
    if (view.openId) document.getElementById('detail')?.scrollIntoView();
    window.addEventListener('hashchange', () => {
      readHash();
      render();
      if (view.tab === 'patients' && view.openId) document.getElementById('detail')?.scrollIntoView({ behavior: 'smooth' });
      else window.scrollTo(0, 0);
    });
  })
  .catch(() => {
    document.getElementById('app').innerHTML = '<p style="padding:24px">Could not load the simulated patients. Run node tools/simulate-trials.mjs.</p>';
  });
