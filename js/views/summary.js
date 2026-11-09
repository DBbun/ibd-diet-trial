import { CONFIG, CONDITIONS } from '../config.js';
import { summarize, FACTOR_KEYS } from '../analysis.js';
import { formatShort, formatLong } from '../dates.js';
import { indexName, usesHBI } from '../scoring.js';
import { esc, demoBanner, fmt, pct, labName, labUnit } from '../ui.js';
import { FAIRNESS_LINE } from './setup.js';

const MED_WORD = { started: 'started', stopped: 'stopped', dose: 'dose changed' };

function contextText(c) {
  if (c.type === 'med') return `Medication ${MED_WORD[c.change] || c.change}${c.drug ? ` (${c.drug})` : ''} on ${formatShort(c.date)}`;
  if (c.type === 'portion') return `Only a little eaten on ${formatShort(c.date)} (may not be a full test)`;
  if (c.type === 'offFood') return `${CONFIG.foods[c.food]?.label || c.food} eaten on ${formatShort(c.date)} (off plan)`;
  return `${CONFIG.factors[c.factor]} marked on ${formatShort(c.date)}`;
}

// Diagnosis year, current treatment and relevant conditions, as the person reported them at setup.
function healthLine(h) {
  if (!h) return '';
  const bits = [];
  if (h.dxYear) bits.push(`Diagnosed ${h.dxYear}`);
  if (h.treatments?.length) bits.push(`Treatment: ${h.treatments.map((t) => CONFIG.treatments[t] || t).join(', ')}`);
  if (h.conditions?.length) bits.push(`Also: ${h.conditions.map((c) => CONFIG.healthConditions[c] || c).join(', ')}`);
  const ostomy = h.conditions?.includes('ostomy')
    ? '<p class="small">Ostomy or colectomy: stool-based items may not reflect disease activity the same way. Read these results with your care team.</p>' : '';
  return (bits.length ? `<p class="meta">${esc(bits.join(' · '))}</p>` : '') + ostomy;
}

// Joint pain, eye, skin and mouth symptoms reported in the weekly check. Shown for both conditions.
function otherSymptoms(state) {
  const weeks = (state.weekly || []).filter((w) => w.items?.length).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!weeks.length) return '';
  const counts = {};
  for (const w of weeks) for (const k of w.items) counts[k] = (counts[k] || 0) + 1;
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `<li>${esc(CONFIG.hbiComplications[k] || k)}: reported in ${n} ${n === 1 ? 'week' : 'weeks'}</li>`);
  return `<h3>Other symptoms reported</h3><ul>${rows.join('')}</ul>
    <p class="small muted">From the weekly check${usesHBI(state.settings.condition) ? '' : '. These are not part of the colitis score'}.</p>`;
}

function weightLine(state) {
  const w = [...(state.weights || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!w.length) return '';
  const unit = state.settings.weightUnit || 'kg';
  const first = w[0], last = w[w.length - 1];
  const pctChange = w.length > 1 ? ` (${last.value >= first.value ? '+' : ''}${fmt(((last.value - first.value) / first.value) * 100)}%)` : '';
  return `<h3>Weight</h3><p>${esc(formatShort(first.date))}: ${fmt(first.value)} ${esc(unit)}${w.length > 1 ? ` · ${esc(formatShort(last.date))}: ${fmt(last.value)} ${esc(unit)}${pctChange}` : ''}</p>`;
}

export function renderSummary(state, todayISO) {
  const s = summarize(state, todayISO, CONFIG);
  const cond = state.settings.condition;
  const idxLabel = indexName(cond);
  const [base, elim, maint] = s.windows;

  const cell = (w, v) => (w.status === 'upcoming' ? '<td class="num muted">later</td>' : !w.reliable ? `<td class="num muted" title="Fewer than ${CONFIG.analysis.minLoggedDays} logged days">too few days</td>` : `<td class="num">${v}</td>`);
  const rows = [
    [`${idxLabel} (average)`, (w) => fmt(w.meanScore)],
    [`High-symptom days (score ${CONFIG.activeThreshold[cond]} or more)`, (w) => pct(w.activePct)],
    ['Fatigue (average, 0–10)', (w) => fmt(w.meanFatigue)],
  ].map(([label, fn]) => `<tr><th scope="row">${esc(label)}</th>${s.windows.map((w) => cell(w, fn(w))).join('')}</tr>`).join('');
  const roughRow = s.windows.some((w) => w.roughDays) ? `<tr><th scope="row">Rough days (one-tap)</th>${s.windows.map((w) => `<td class="num">${w.status === 'upcoming' ? '–' : w.roughDays}</td>`).join('')}</tr>` : '';
  // Baseline has no plan to follow, so off-plan days start with elimination.
  const planCell = (w, i) => (w.status === 'upcoming' || i === 0 || !(w.onPlanDays + w.offPlanDays) ? '–' : `${w.onPlanDays} of ${w.onPlanDays + w.offPlanDays}`);
  const offPlanRow = s.windows.some((w, i) => i > 0 && w.onPlanDays + w.offPlanDays) ? `<tr><th scope="row">Days on plan (of days answered)</th>${s.windows.map((w, i) => `<td class="num">${planCell(w, i)}</td>`).join('')}</tr>` : '';
  const loggedRow = `<tr class="muted"><th scope="row">Days logged</th>${s.windows.map((w) => `<td class="num">${w.status === 'upcoming' ? '–' : `${w.n} of ${w.daysInWindow}`}</td>`).join('')}</tr>`;
  const factorRows = FACTOR_KEYS.filter((f) => s.windows.some((w) => w.factors[f]))
    .map((f) => `<tr class="muted"><th scope="row">${esc(CONFIG.factors[f])} marked</th>${s.windows.map((w) => `<td class="num">${w.status === 'upcoming' ? '–' : `${w.factors[f]} day${w.factors[f] === 1 ? '' : 's'}`}</td>`).join('')}</tr>`).join('');

  let headline = '';
  if (s.change) {
    const dir = s.change.improved ? 'improved' : s.change.worsened ? 'got worse' : 'changed little';
    headline = `<p class="headline ${s.change.improved ? 'good' : s.change.worsened ? 'bad' : ''}">
      Your ${esc(idxLabel.charAt(0).toLowerCase() + idxLabel.slice(1))} went from <strong>${fmt(base.meanScore)}</strong> at baseline to <strong>${fmt(maint.meanScore)}</strong>
      ${s.change.final ? 'at the end of maintenance' : 'so far in maintenance'}: it ${dir}.
      ${s.change.fatigueDelta != null ? `Fatigue went from ${fmt(base.meanFatigue)} to ${fmt(maint.meanFatigue)}.` : ''}</p>`;
    if (s.medsInTrial.length) {
      headline += `<p class="context">Also consider: ${s.medsInTrial.map((m) => esc(contextText({ type: 'med', ...m }))).join('; ')}. A medication change may also explain part of this.</p>`;
    }
  } else {
    headline = '<p class="headline">Comparisons appear once the baseline week and maintenance have enough logged days.</p>';
  }

  const labs = s.labs.length ? `<h3>Lab results</h3><ul class="lab-list">${s.labs.map((l) => `<li>${esc(formatShort(l.date))}: ${esc(labName(l))} <strong>${esc(l.value)}</strong> ${esc(labUnit(l))}</li>`).join('')}</ul>` : '';
  const exps = (state.experiences || []);
  const expItem = (e) => `<li><span><strong>${esc(e.food)}</strong>: ${esc(CONFIG.experiencePatterns[e.pattern] || '')}${e.since ? ` (${esc(e.since)})` : ''}${e.note ? `<span class="small muted block">${esc(e.note)}</span>` : ''}</span></li>`;
  const expGroups = Object.values(CONFIG.experienceGroups)
    .map((g) => ({ label: g.label, items: exps.filter((e) => g.patterns.includes(e.pattern)) }))
    .filter((g) => g.items.length);
  const experiences = exps.length ? `<h3>My own observations</h3>
    <p class="small muted">Patterns I've noticed over time, in my own words (not measured by the app).</p>
    ${expGroups.map((g) => `<p class="exp-group">${esc(g.label)}</p><ul class="exp-list">${g.items.map(expItem).join('')}</ul>`).join('')}` : '';

  const started = s.tests.filter((t) => t.status !== 'upcoming');
  const upcoming = s.tests.filter((t) => t.status === 'upcoming');
  const statusText = {
    flag: (t) => `Symptoms rose after this test: ${esc(idxLabel)} ${fmt(t.windowMean)} vs. ${fmt(s.ref.mean)} maintenance average (+${fmt(t.delta)}).${t.rough ? ' You also marked a rough day.' : ''}`,
    unclear: () => 'Unclear: you marked a rough day during this test, which could be this food or an unrelated flare. Consider testing it again later.',
    ok: (t) => `No clear change (${fmt(t.windowMean)} vs. ${fmt(s.ref.mean)} maintenance average).`,
    insufficient: () => 'Not enough logged days to tell.',
    inProgress: () => 'Test in progress.',
    skipped: () => 'Not tested (marked "No").',
  };
  const tests = started.length ? `<h3>Food reintroduction</h3>
    <p class="small muted">Beyond the published trial. Each food is tested for ${CONFIG.phases[3].daysPerFood} days and compared with your maintenance-phase average.</p>
    <ul class="tests">${started.map((t) => `<li class="test test-${t.status}">
      <span class="test-food-name">${esc(t.food.label)}</span>
      <span class="test-status">${statusText[t.status](t)}</span>
      ${t.context.length ? `<span class="context">Also consider: ${t.context.map((c) => esc(contextText(c))).join('; ')}.</span>` : ''}
    </li>`).join('')}</ul>
    ${started.some((t) => t.status === 'flag') ? '<p class="small">Triggers can change over time. A flagged food is a result for now, not forever. You can test it again later with your care team.</p>' : ''}
    ${upcoming.length ? `<p class="small muted">Still to test: ${upcoming.map((t) => esc(t.food.label)).join(', ')}.</p>` : ''}` : '';

  return `
    ${demoBanner(state.settings, 'no-print')}
    <div class="summary-actions no-print">
      <button type="button" class="btn primary" data-action="print">Save as PDF / Print</button>
      <button type="button" class="btn" data-action="export-csv">Export CSV</button>
      <button type="button" class="btn" data-action="export-json">Export JSON</button>
      <button type="button" class="btn" data-action="export-fhir" title="HL7 FHIR R4 format for health records and research systems">Export for health records (FHIR)</button>
    </div>
    <article class="summary-card" aria-label="Diet summary">
      <header>
        <p class="eyebrow">Your personal pattern</p>
        <h1>AIP elimination diet summary</h1>
        <p class="meta">${esc(CONDITIONS[cond].label)} · started ${esc(formatShort(state.settings.startDate))} · as of ${esc(formatLong(todayISO))} · ${s.loggedDays} ${s.loggedDays === 1 ? 'day' : 'days'} logged
        ${state.settings.demo ? ' · <strong>simulated demo data</strong>' : ''}</p>
        ${healthLine(state.settings.health)}
      </header>
      ${!s.maintenanceComplete ? '<p class="notice">Trial in progress: comparisons fill in as each phase finishes.</p>' : ''}
      ${headline}
      <div class="table-wrap"><table class="compare">
        <thead><tr><th></th>${s.windows.map((w) => `<th scope="col">${esc(w.label)}<span class="th-dates">${esc(formatShort(w.start))}–${esc(formatShort(w.end))}</span></th>`).join('')}</tr></thead>
        <tbody>${rows}${roughRow}${offPlanRow}${loggedRow}${factorRows}</tbody>
      </table></div>
      ${otherSymptoms(state)}
      ${weightLine(state)}
      ${labs}
      ${tests}
      ${experiences}
      <footer>
        <p><strong>This is your personal pattern. It is not a diagnosis.</strong> Talk with your care team before you change your diet or treatment.</p>
        <p class="small">${esc(idxLabel)}: ${usesHBI(cond)
          ? 'well-being, belly pain, loose stools and complications, from the Harvey-Bradshaw Index. It leaves out one item (abdominal mass) that needs a doctor\'s exam, so it is not the full index. In weeks without a weekly check, complications count as 0.'
          : 'how often you go and any bleeding, from the Mayo score. It leaves out the doctor\'s items, so it is not the full score. It runs from 0 to 6.'}
          Averages use only the days you logged. Missing days are never filled in. Comparisons need at least ${CONFIG.analysis.minLoggedDays} logged days.</p>
        <p class="small">Protocol based on Konijeti et al., Inflamm Bowel Dis 2017. ${esc(FAIRNESS_LINE)}</p>
      </footer>
    </article>`;
}

export function toCSV(state) {
  const cols = ['date', 'condition', 'rough_day', 'wellbeing', 'pain', 'stools', 'bleeding', 'fatigue', 'tested', 'test_portion', 'on_plan', 'off_protocol_foods', 'med_change', 'med_drug', 'factors', 'note'];
  const q = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const d of Object.keys(state.entries).sort()) {
    const e = state.entries[d];
    lines.push([d, state.settings.condition, e.rough ? 'yes' : '', e.wellbeing, e.pain, e.stools, e.bleeding, e.fatigue, e.tested, e.testPortion, e.onPlan,
      (e.offFoods || []).join(';'), e.med?.change, e.med?.drug, (e.factors || []).join(';'), e.note].map(q).join(','));
  }
  return lines.join('\n');
}
