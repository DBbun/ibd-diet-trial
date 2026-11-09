import { CONFIG, CONDITIONS } from '../config.js';
import { phaseOf, avoidList, testOf, phaseBounds } from '../protocol.js';
import { addDays, formatLong, formatShort, rangeISO } from '../dates.js';
import { pauseSignals } from '../analysis.js';
import { complicationsFor, dailyScore, indexName, usesHBI } from '../scoring.js';
import { esc, fmt, demoBanner, choiceRow, chipGroup, labName, labUnit } from '../ui.js';

const WELLBEING = ['Very well', 'Slightly below par', 'Poor', 'Very poor', 'Terrible'];
const PAIN = ['None', 'Mild', 'Moderate', 'Severe'];
const BLEEDING = [
  { label: 'None', title: 'No blood seen' },
  { label: 'Streaks', title: 'Streaks of blood with stool less than half the time' },
  { label: 'Obvious', title: 'Obvious blood with stool most of the time' },
  { label: 'Blood only', title: 'Blood alone passed' },
];
const MED = [
  { value: 'none', label: 'No change' },
  { value: 'started', label: 'Started' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'dose', label: 'Dose changed' },
];

// Logged (scorable) days in the baseline window. Used to offer a baseline extension: the simulation in
// tools/simulate-trials.mjs showed people who log about half of days often lacked a usable "before" (spec 6b).
export function baselineLogged(state) {
  const b = phaseBounds(state.settings, CONFIG)[0];
  return rangeISO(b.start, b.end).filter((d) => dailyScore(state.entries[d], state.settings, state.weekly, CONFIG)).length;
}

function extendCard(state, date) {
  const s = state.settings;
  if (s.baselineDays || s.baselineExtendDismissed) return '';
  const ph = phaseOf(s, date, CONFIG);
  if (ph.id !== 'elimination' || ph.dayInPhase > 7) return '';
  const n = baselineLogged(state);
  const need = CONFIG.analysis.minLoggedDays;
  if (n >= need) return '';
  const newStart = phaseBounds({ ...s, baselineDays: CONFIG.analysis.baselineMaxDays }, CONFIG)[1].start;
  return `<section class="panel extend" aria-label="Extend baseline">
    <h2 class="h3">Extend your baseline week?</h2>
    <p>You logged ${n} baseline day${n === 1 ? '' : 's'}. A fair before/after comparison needs at least ${need}.
    If you haven't changed your diet yet, you can keep eating as usual for one more week and start elimination on ${esc(formatShort(newStart))}.</p>
    <div class="actions left wrap">
      <button type="button" class="btn primary" data-action="extend-baseline">Extend baseline</button>
      <button type="button" class="btn" data-action="dismiss-extend">Continue without</button>
    </div>
  </section>`;
}

// Shown at the top of Today once today's entry is saved: confirms the day is done and says what comes next.
function doneCard(state, todayISO) {
  const s = state.settings;
  const ph = phaseOf(s, todayISO, CONFIG);
  const bounds = phaseBounds(s, CONFIG);
  const logged = Object.keys(state.entries).filter((d) => d >= s.startDate && d <= todayISO).length;
  const sinceStart = Math.max(1, Math.round((Date.parse(todayISO) - Date.parse(s.startDate)) / 86400000) + 1);
  let next = '';
  const tomorrow = addDays(todayISO, 1);
  const phTomorrow = phaseOf(s, tomorrow, CONFIG);
  if (ph.id === 'reintroduction') {
    const tNow = testOf(s, todayISO, CONFIG);
    const tNext = testOf(s, tomorrow, CONFIG);
    next = tNext && tNext.index !== tNow.index ? `Tomorrow you start testing <strong>${esc(tNext.food.label.toLowerCase())}</strong>.`
      : tNext ? `Tomorrow is day 2 of the ${esc(tNow.food.label.toLowerCase())} test.` : 'Tomorrow your trial is complete. See your summary.';
  } else if (phTomorrow.id !== ph.id && phTomorrow.id !== 'complete') {
    next = `Tomorrow <strong>${esc(phTomorrow.label.toLowerCase())}</strong> begins.`;
  } else if (ph.id === 'elimination' && phTomorrow.dayInPhase % 7 === 1) {
    const { added } = avoidList(s, tomorrow, CONFIG);
    next = `Tomorrow's new stage: also remove ${added.map((g) => esc(CONFIG.foods[g].label.toLowerCase())).join(', ')}.`;
  } else if (ph.id !== 'complete') {
    const b = bounds.find((x) => x.id === ph.id);
    const nb = bounds[bounds.indexOf(b) + 1];
    next = nb ? `${esc(nb.label)} starts ${esc(formatShort(nb.start))}.` : '';
  }
  return `<section class="panel done" aria-label="Today is logged">
    <p class="done-title">✓ Today is logged</p>
    <p>That's all for today. Come back tomorrow. ${next}</p>
    <p class="small muted">${logged} of ${Math.min(sinceStart, 999)} ${sinceStart === 1 ? 'day' : 'days'} logged so far.</p>
    <div class="actions left wrap">
      <a class="btn small" href="#timeline">See timeline</a>
      <a class="btn small" href="#summary">See summary</a>
    </div>
  </section>`;
}

// Next-day catch-up: people often miss their worst days (engagement log A2), so offer a quick way to fill yesterday.
function catchUpCard(state, todayISO) {
  const y = addDays(todayISO, -1);
  if (y < state.settings.startDate || state.entries[y] || (state.catchupSkipped || []).includes(y)) return '';
  return `<section class="panel catchup" aria-label="Yesterday">
    <p><strong>No entry for yesterday.</strong> How was it?</p>
    <div class="actions left wrap">
      <button type="button" class="btn small primary" data-action="catchup-log">Log yesterday</button>
      <button type="button" class="btn small" data-action="catchup-rough">It was a rough day</button>
      <button type="button" class="btn small ghost" data-action="catchup-skip">Skip</button>
    </div>
  </section>`;
}

function phaseCard(state, date) {
  const trial = state.settings;
  const { startDate } = trial;
  const ph = phaseOf(trial, date, CONFIG);
  const foods = CONFIG.foods;
  if (ph.id === 'before') {
    return `<div class="phase-card"><p class="phase-name">Starts in ${ph.daysUntilStart} day${ph.daysUntilStart === 1 ? '' : 's'}</p><p>Your baseline week begins ${esc(formatShort(startDate))}.</p></div>`;
  }
  if (ph.id === 'complete') {
    return `<div class="phase-card phase-complete"><p class="phase-name">Trial complete</p><p>See your <a href="#summary">summary</a>. You can keep logging if you like.</p></div>`;
  }
  let detail = '';
  if (ph.id === 'baseline') {
    const n = baselineLogged(state);
    const need = CONFIG.analysis.minLoggedDays;
    detail = `<p>Eat as you usually do. Just log each day; this week is your "before".</p>
      <p class="small"><strong>${n} of ${need}</strong> baseline days logged${n >= need ? ' ✓' : `. At least ${need} are needed for a fair comparison.`}</p>`;
  } else if (ph.id === 'elimination') {
    const { avoid, added, week } = avoidList(trial, date, CONFIG);
    detail = `<p><strong>Stage ${week} of ${CONFIG.eliminationSchedule.length}.</strong> ${ph.dayInPhase % 7 === 1 ? 'New this week' : 'Added this week'}:
      ${added.map((g) => `<span class="tag new" title="${esc(foods[g].examples)}">${esc(foods[g].label)}</span>`).join(' ')}</p>
      <details><summary>Avoiding now (${avoid.length} groups)</summary>
        <ul class="foods">${avoid.map((g) => `<li><strong>${esc(foods[g].label)}</strong> <span class="muted">${esc(foods[g].examples)}</span></li>`).join('')}</ul>
      </details>`;
  } else if (ph.id === 'maintenance') {
    detail = `<p>Stay on the full protocol: all ${CONFIG.eliminationSchedule.flat().length} food groups out. No reintroductions yet.</p>`;
  } else if (ph.id === 'reintroduction') {
    const t = testOf(trial, date, CONFIG);
    const ex = foods[t.food.group]?.examples;
    detail = `<div class="test-food">
        <p class="test-label">Test food</p>
        <p class="test-name">${esc(t.food.label)} <span class="muted">· day ${t.cycleDay} of ${t.per}</span></p>
        <p>${t.cycleDay === 1
          ? `Have a normal portion of ${esc(t.food.label.toLowerCase())} today${ex ? ` (for example ${esc(ex)})` : ''}. Keep everything else the same.`
          : `Have ${esc(t.food.label.toLowerCase())} again if yesterday went fine. Keep everything else the same and notice how you feel.`}</p>
      </div>
      <p class="small muted">Reintroduction goes beyond the published trial. Discuss it with your care team.</p>`;
  }
  // Calcium while dairy is out (from week 2 of elimination through maintenance).
  const dairyOut = (ph.id === 'elimination' && avoidList(trial, date, CONFIG).avoid.includes('dairy')) || ph.id === 'maintenance';
  if (dairyOut) {
    const c = CONFIG.calcium;
    detail += `<details class="calcium"><summary>Dairy is out: getting enough calcium</summary>
      <p class="small">Dairy is most people's main source of calcium. ${esc(c.target)} Foods allowed on this diet that have calcium:</p>
      <ul class="small">${c.sources.map(([f, mg]) => `<li>${esc(f)}: ${mg} mg</li>`).join('')}</ul>
      <p class="small">Ask your care team or a dietitian whether you need a supplement. Source: NIH Office of Dietary Supplements.</p>
    </details>`;
  }
  if (['maintenance', 'reintroduction'].includes(ph.id) && state.settings.health?.conditions?.includes('celiac')) {
    detail += '<p class="small"><strong>Celiac disease:</strong> gluten stays out for good. Your plan skips the gluten test.</p>';
  }
  const total = ph.days;
  return `<div class="phase-card phase-${ph.id}">
    <p class="phase-name">${esc(ph.label)} <span class="muted">· day ${ph.dayInPhase} of ${total}</span></p>
    <div class="phase-bar" role="progressbar" aria-label="Progress in this phase" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${ph.dayInPhase}"><span style="width:${(ph.dayInPhase / total) * 100}%"></span></div>
    ${detail}
  </div>`;
}

function weeklyCard(state, ctx, date) {
  // Crohn's: these are Harvey-Bradshaw complications and count towards the score. Colitis: recorded for the summary
  // only, because the 2-item colitis score has no complications item (engagement: a UC patient asking about joint pain).
  if (complicationsFor(date, state.weekly, CONFIG) != null && !ctx.weeklyOpen) return '';
  const w = ctx.weeklyDraft;
  return `<section class="panel weekly">
    <h2 class="h3">Weekly check <span class="muted small">about 20 seconds</span></h2>
    <p class="hint">In the past week, have you had any of these? ${usesHBI(state.settings.condition)
      ? '(Harvey-Bradshaw Index complications, 1 point each.)'
      : 'They are not part of the colitis score, but they are kept for your summary and your care team.'}</p>
    <div class="chips">
      ${Object.entries(CONFIG.hbiComplications).map(([k, label]) => {
        const on = w.items.includes(k);
        return `<button type="button" class="chip${on ? ' is-on' : ''}" aria-pressed="${on}" data-action="weekly-toggle" data-value="${k}">${esc(label)}</button>`;
      }).join('')}
    </div>
    <div class="actions">
      <button type="button" class="btn primary" data-action="weekly-save">${w.items.length ? `Save (${w.items.length} selected)` : 'None of these'}</button>
    </div>
  </section>`;
}

function labsCard(state, ctx, date) {
  const recent = state.labs.map((l, i) => ({ l, i })).sort((a, b) => (a.l.date < b.l.date ? 1 : -1));
  const knownCustom = [...new Set(state.labs.filter((l) => l.type === 'custom').map((l) => `${l.name}|${l.unit || ''}`))];
  const ld = ctx.labDraft;
  return `<details class="panel labs" ${ctx.labsOpen ? 'open' : ''}>
    <summary>Add a lab result <span class="muted small">optional</span></summary>
    <div class="lab-form">
      <label>Test
        <select data-input="lab-type">
          ${Object.entries(CONFIG.labTypes).map(([k, t]) => `<option value="${k}" ${ld.type === k ? 'selected' : ''}>${esc(t.label)} (${esc(t.unit)})</option>`).join('')}
          ${knownCustom.map((kc) => { const cut = kc.lastIndexOf('|'); const n = cut < 0 ? kc : kc.slice(0, cut); const u = cut < 0 ? '' : kc.slice(cut + 1); return `<option value="custom:${esc(kc)}" ${ld.type === 'custom' && ld.name === n ? 'selected' : ''}>${esc(n)}${u ? ` (${esc(u)})` : ''}</option>`; }).join('')}
          <option value="custom:" ${ld.type === 'custom' && !ld.name ? 'selected' : ''}>Other test…</option>
        </select>
      </label>
      ${ld.type === 'custom' ? `
        <label>Test name <input type="text" data-input="lab-name" value="${esc(ld.name || '')}" placeholder="e.g. Vitamin D"></label>
        <label>Unit <input type="text" data-input="lab-unit" value="${esc(ld.unit || '')}" placeholder="e.g. ng/mL"></label>` : ''}
      <label>Result <input type="number" inputmode="decimal" min="0" step="any" data-input="lab-value" value="${esc(ld.value)}"></label>
      <label>Date <input type="date" data-input="lab-date" value="${esc(ld.date || date)}"></label>
      <button type="button" class="btn" data-action="lab-add">Add result</button>
    </div>
    ${recent.length ? `<ul class="exp-list">${recent.map(({ l, i }) => `<li><span>${esc(formatShort(l.date))}: ${esc(labName(l))} ${esc(l.value)} ${esc(labUnit(l))}</span>
      <button type="button" class="btn small ghost" data-action="lab-delete" data-value="${i}" aria-label="Delete ${esc(labName(l))} result from ${esc(formatShort(l.date))}">✕</button></li>`).join('')}</ul>` : ''}
  </details>`;
}

// "My food experiences": personal patterns, including edge cases (a trigger that faded, one that depends on timing).
function experiencesCard(state, ctx) {
  const x = ctx.expDraft;
  const list = state.experiences || [];
  const foodOptions = [...new Set([...Object.values(CONFIG.foods).map((f) => f.label), ...CONFIG.suggestedTriggers,
    ...CONFIG.suggestedHelpers, ...list.map((e) => e.food)])];
  return `<details class="panel experiences" ${ctx.expOpen ? 'open' : ''}>
    <summary>My food experiences <span class="muted small">${list.length ? `${list.length} saved` : 'optional'}</span></summary>
    <p class="hint">Foods that bother you and foods that help, including ones that changed over time. For example:
    "Cherry tomatoes used to bother me, not anymore" or "Kiwi every day helps me."</p>
    <label class="field block"><span class="legend">Food</span>
      <input type="text" list="exp-foods" data-input="exp-food" value="${esc(x.food)}" placeholder="e.g. cherry tomatoes, kiwi">
      <datalist id="exp-foods">${foodOptions.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
    </label>
    ${Object.values(CONFIG.experienceGroups).map((g) => `<fieldset class="field"><legend>${esc(g.label)}</legend>
      <div class="chips">${g.patterns.map((k) =>
        `<button type="button" class="chip${x.pattern === k ? ' is-on' : ''}" aria-pressed="${x.pattern === k}" data-action="exp-pattern" data-value="${k}">${esc(CONFIG.experiencePatterns[k])}</button>`).join('')}</div>
    </fieldset>`).join('')}
    ${['faded', 'new', 'helpedFaded'].includes(x.pattern) ? `<label class="field block"><span class="legend">Roughly when did it change?</span>
      <input type="text" data-input="exp-since" value="${esc(x.since)}" placeholder="e.g. 2023, or after starting a biologic"></label>` : ''}
    <label class="field block"><span class="legend">Details (optional)</span>
      <textarea rows="2" data-input="exp-note" placeholder="Amount, timing, how it affects you">${esc(x.note)}</textarea></label>
    <div class="actions left"><button type="button" class="btn primary" data-action="exp-save">Save experience</button></div>
    ${list.length ? `<ul class="exp-list">${list.map((e) => `<li>
      <span><strong>${esc(e.food)}</strong>: ${esc(CONFIG.experiencePatterns[e.pattern] || '')}${e.since ? ` (${esc(e.since)})` : ''}${e.note ? `<span class="small muted block">${esc(e.note)}</span>` : ''}</span>
      <button type="button" class="btn small ghost" data-action="exp-delete" data-value="${esc(e.id)}" aria-label="Delete ${esc(e.food)}">✕</button></li>`).join('')}</ul>
      <div class="actions left"><button type="button" class="btn small" data-action="exp-share">Share my experiences</button></div>` : ''}
  </details>`;
}

function pauseCard(state, todayISO) {
  if (state.settings.pauseAckUntil && todayISO <= state.settings.pauseAckUntil) return '';
  const reasons = pauseSignals(state, todayISO, CONFIG);
  if (!reasons.length) return '';
  const unit = state.settings.weightUnit || 'kg';
  const lines = reasons.map((r) => (r.type === 'weight'
    ? `Your weight is down ${Math.round(r.drop * 100)}% (${fmt(r.from.value)} to ${fmt(r.to.value)} ${esc(unit)}).`
    : r.type === 'worse'
      ? `Your symptoms have been worse than in your first week for the past ${CONFIG.analysis.pause.windowDays} days.`
      : `You marked ${r.rough} rough days in the past week.`));
  return `<section class="panel pause" role="alert">
    <h2 class="h3">Time to pause and check in</h2>
    <ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul>
    <p><strong>Pause the diet:</strong> go back to your usual eating and contact your care team or a dietitian before you go on.
    Seek care right away for heavy bleeding, fever, or severe pain with vomiting.</p>
    <button type="button" class="btn small" data-action="pause-ack">I have checked in with my care team</button>
  </section>`;
}

// Optional weekly weight, for both conditions, from the baseline week on.
function weightCard(state, ctx, date) {
  const recent = (state.weights || []).some((w) => w.date <= date && w.date > addDays(date, -7));
  if (recent) return '';
  const unit = state.settings.weightUnit || 'kg';
  return `<section class="panel weight">
    <h2 class="h3">Weekly weight <span class="muted small">optional</span></h2>
    <p class="hint">A strict diet can make you lose weight without meaning to. The app tells you to pause if it drops 5% or more.</p>
    <div class="lab-form">
      <label>Weight <input type="number" inputmode="decimal" min="0" step="any" data-input="weight-value" value="${esc(ctx.weightDraft || '')}"></label>
      <div class="choices" role="group" aria-label="Unit">${['kg', 'lb'].map((u) =>
        `<button type="button" class="choice${unit === u ? ' is-on' : ''}" aria-pressed="${unit === u}" data-action="weight-unit" data-value="${u}">${u}</button>`).join('')}</div>
      <button type="button" class="btn" data-action="weight-save">Save weight</button>
    </div>
  </section>`;
}

export function renderToday(state, ctx, todayISO) {
  const date = ctx.viewDate;
  const d = ctx.draft;
  const cond = state.settings.condition;
  const ph = phaseOf(state.settings, date, CONFIG);
  const test = testOf(state.settings, date, CONFIG);
  const saved = state.entries[date];
  const score = dailyScore(d, state.settings, state.weekly, CONFIG);
  const yesterday = state.entries[addDays(date, -1)];

  const dateNav = `<div class="date-nav">
    <button type="button" class="btn round ghost" data-action="date-shift" data-delta="-1" aria-label="Previous day" ${date <= state.settings.startDate ? 'disabled' : ''}>‹</button>
    <div class="date-label"><strong>${date === todayISO ? 'Today' : esc(formatLong(date))}</strong>${date === todayISO ? `<span class="muted"> · ${esc(formatShort(date))}</span>` : ''}
      ${saved ? '<span class="saved-dot" title="Logged">Logged</span>' : ''}</div>
    <button type="button" class="btn round ghost" data-action="date-shift" data-delta="1" aria-label="Next day" ${date >= todayISO ? 'disabled' : ''}>›</button>
  </div>`;

  const symptoms = usesHBI(cond)
    ? [
      choiceRow({ field: 'wellbeing', legend: 'General well-being', options: WELLBEING.map((label, value) => ({ label, value })), value: d.wellbeing }),
      choiceRow({ field: 'pain', legend: 'Abdominal pain', options: PAIN.map((label, value) => ({ label, value })), value: d.pain }),
      stepper('stools', 'Liquid or very soft stools today', d.stools, "Watery or mushy bowel movements (diarrhea). Normal, formed stools don't count, so on a good day this is often 0."),
    ]
    : [
      stepper('stools', 'Bowel movements today', d.stools, `All bowel movements today. Your normal is ${state.settings.normalStools} a day.`),
      choiceRow({ field: 'bleeding', legend: 'Rectal bleeding', options: BLEEDING.map((b, value) => ({ ...b, value })), value: d.bleeding }),
      choiceRow({ field: 'pain', legend: 'Abdominal pain', options: PAIN.map((label, value) => ({ label, value })), value: d.pain }),
      choiceRow({ field: 'wellbeing', legend: 'General well-being', options: WELLBEING.map((label, value) => ({ label, value })), value: d.wellbeing }),
    ];

  const fatigue = choiceRow({
    field: 'fatigue', legend: 'Fatigue (0 none – 10 worst)',
    options: Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) })), value: d.fatigue,
  });

  const testedRow = test ? choiceRow({
    field: 'tested', legend: `Did you have ${test.food.label.toLowerCase()} today?`,
    options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], value: d.tested,
  }) : '';

  // Adherence is asked every day of the diet, so "on plan" is a recorded answer, not an assumption.
  const planPhase = ['elimination', 'maintenance', 'reintroduction'].includes(ph.id);
  const planRow = planPhase ? choiceRow({
    field: 'onPlan', legend: ph.id === 'reintroduction' ? 'Apart from the test food, did you stay on plan today?' : 'Did you stay on plan today?',
    options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], value: d.onPlan,
  }) : '';
  const portionRow = test && d.tested === true ? choiceRow({
    field: 'testPortion', legend: `How much ${test.food.label.toLowerCase()} did you have?`,
    options: [{ value: 'small', label: 'A little' }, { value: 'normal', label: 'A normal portion' }, { value: 'large', label: 'A lot' }], value: d.testPortion,
  }) : '';
  const offFoods = planPhase && (d.onPlan === false || d.offFoods.length) ? chipGroup({
    field: 'offFoods', legend: 'What did you have? (tap all that apply)',
    options: CONFIG.chips.map((k) => ({ value: k, label: CONFIG.foods[k].label, title: CONFIG.foods[k].examples })), values: d.offFoods,
  }) : '';

  const med = `<fieldset class="field">
    <legend>Medication change today</legend>
    <div class="choices" role="group">${MED.map((m) => {
      const on = d.med.change === m.value;
      return `<button type="button" class="choice wide${on ? ' is-on' : ''}" aria-pressed="${on}" data-action="set-med" data-value="${m.value}">${esc(m.label)}</button>`;
    }).join('')}</div>
    ${d.med.change !== 'none' ? `<input type="text" class="text" placeholder="Which medication? e.g. prednisone" aria-label="Which medication" data-input="med-drug" value="${esc(d.med.drug)}">` : ''}
  </fieldset>`;

  const factors = chipGroup({
    field: 'factors', legend: 'Anything else today? (optional)',
    options: Object.entries(CONFIG.factors).map(([value, label]) => ({ value, label })), values: d.factors,
  });

  const note = `<label class="field block">
    <span class="legend">Note (optional)</span>
    <span class="hint">Tip: you can dictate with your keyboard's microphone.</span>
    <textarea rows="2" data-input="note" placeholder="Anything worth remembering">${esc(d.note)}</textarea>
  </label>`;

  return `
    <h1 class="sr-only">Today</h1>
    ${demoBanner(state.settings)}
    ${extendCard(state, date)}
    ${saved && date === todayISO ? doneCard(state, todayISO) : ''}
    ${date === todayISO ? pauseCard(state, todayISO) : ''}
    ${date === todayISO ? catchUpCard(state, todayISO) : ''}
    ${phaseCard(state, date)}
    ${dateNav}
    <section class="panel log" aria-label="Daily log">
      <div class="log-head">
        <h2 class="h3">${saved ? 'Edit this day' : 'Log this day'}</h2>
        ${yesterday && !saved ? '<button type="button" class="btn small" data-action="same-as-yesterday">Same as yesterday</button>' : ''}
      </div>
      ${saved?.rough
        ? '<p class="rough-note">Marked as a rough day. If you feel up to it later, add details below. <button type="button" class="linklike" data-action="unmark-rough">Undo</button></p>'
        : '<button type="button" class="btn small rough-btn" data-action="rough-day">Too rough to log? Mark a rough day with one tap</button>'}
      ${symptoms.join('')}
      ${fatigue}
      ${testedRow}
      ${portionRow}
      ${planRow}
      ${offFoods}
      ${med}
      ${factors}
      ${note}
    </section>
    ${weeklyCard(state, ctx, date)}
    ${weightCard(state, ctx, date)}
    ${labsCard(state, ctx, date)}
    ${experiencesCard(state, ctx)}
    <div class="save-bar">
      <div class="save-score">${score ? `${esc(indexName(cond))}: <strong>${score.score}</strong>` : '<span class="muted">Answer the symptom questions to see your score</span>'}</div>
      <button type="button" class="btn primary" data-action="save-entry">${saved ? 'Update' : 'Save'}</button>
    </div>`;
}

function stepper(field, legend, value, hint) {
  return `<fieldset class="field">
    <legend>${esc(legend)}${value == null ? ' <span class="unanswered">not answered</span>' : ''}</legend>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
    <div class="stepper">
      <button type="button" class="btn round" data-action="step" data-field="${field}" data-delta="-1" aria-label="Fewer: ${esc(legend)}">−</button>
      <output class="stepper-value${value == null ? ' is-empty' : ''}" aria-live="polite">${value == null ? '?' : value}</output>
      <button type="button" class="btn round" data-action="step" data-field="${field}" data-delta="1" aria-label="More: ${esc(legend)}">+</button>
      ${value == null ? '<button type="button" class="btn small" data-action="set" data-field="' + field + '" data-value="0">None today (0)</button>' : ''}
    </div>
  </fieldset>`;
}

export function blankEntry(date) {
  return {
    date, wellbeing: null, pain: null, stools: null, bleeding: null, fatigue: null,
    tested: null, testPortion: null, onPlan: null, offFoods: [], factors: [], med: { change: 'none', drug: '' }, note: '',
  };
}

export { CONDITIONS };
