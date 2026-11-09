// "Your personal pattern": simple before/after comparisons and reintroduction flags.
// Deliberately simple, transparent rules - not statistical inference. Every pattern is shown next to the
// competing explanations the person recorded (medication changes, sleep, stress, illness, travel).
// Pure module: used by the app and by tools/simulate-trials.mjs.
import { CONFIG } from './config.js';
import { addDays, rangeISO } from './dates.js';
import { phaseBounds, phaseOf, allTests } from './protocol.js';
import { dailyScore, isActive } from './scoring.js';

const maxDate = (a, b) => (a > b ? a : b);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
// Every context option except the two that are not competing explanations (exercise, good sleep).
const CONTEXT_FACTORS = Object.keys(CONFIG.factors).filter((f) => !['exercise', 'goodSleep'].includes(f));

function dayRecords(data, days, cfg) {
  const { settings, entries = {}, weekly = [] } = data;
  return days.map((date) => {
    const e = entries[date];
    const s = dailyScore(e, settings, weekly, cfg);
    return { date, entry: e, score: s ? s.score : null, fatigue: e?.fatigue ?? null };
  });
}

function windowStats(data, id, label, start, end, asOf, cfg, earliest = start) {
  const last = end < asOf ? end : asOf;
  // Widen an end-of-phase window (up to compareWindowMaxDays) when too few of its days were logged.
  if (earliest < start && asOf >= end) {
    let s = start;
    const scoredIn = (from) => rangeISO(from, last).filter((d) => dailyScore(data.entries?.[d], data.settings, data.weekly, cfg)).length;
    while (scoredIn(s) < cfg.analysis.minLoggedDays && s > earliest) s = addDays(s, -1);
    start = s;
  }
  // On the window's last day, the result stays in progress until that day is logged.
  const status = asOf < start ? 'upcoming' : asOf < end || (asOf === end && !data.entries?.[end]) ? 'inProgress' : 'done';
  const days = status === 'upcoming' ? [] : rangeISO(start, last);
  const recs = dayRecords(data, days, cfg);
  const scored = recs.filter((r) => r.score != null);
  const fat = recs.filter((r) => r.fatigue != null).map((r) => r.fatigue);
  const factors = {};
  for (const f of CONTEXT_FACTORS.concat(['exercise'])) {
    factors[f] = recs.filter((r) => r.entry?.factors?.includes(f)).length;
  }
  const cond = data.settings.condition;
  // "Rough day" taps have no item scores but are counted as active days, so flare days are never invisible.
  const roughOnly = recs.filter((r) => r.entry?.rough && r.score == null).length;
  const activeScored = scored.filter((r) => isActive(r.score, cond, cfg)).length;
  return {
    id, label, start, end, status, roughOnly,
    roughDays: recs.filter((r) => r.entry?.rough).length,
    offPlanDays: recs.filter((r) => r.entry?.onPlan === false || r.entry?.offFoods?.length).length,
    onPlanDays: recs.filter((r) => r.entry?.onPlan === true && !r.entry?.offFoods?.length).length,
    daysInWindow: days.length,
    n: scored.length,
    meanScore: mean(scored.map((r) => r.score)),
    meanFatigue: mean(fat),
    activePct: scored.length + roughOnly ? (activeScored + roughOnly) / (scored.length + roughOnly) : null,
    reliable: scored.length >= cfg.analysis.minLoggedDays,
    factors,
  };
}

export function medChanges(data) {
  return Object.values(data.entries || {})
    .filter((e) => e.med && e.med.change && e.med.change !== 'none')
    .map((e) => ({ date: e.date, change: e.med.change, drug: e.med.drug || '' }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function factorNotes(data, days) {
  const notes = [];
  for (const d of days) {
    const e = data.entries?.[d];
    for (const f of CONTEXT_FACTORS) {
      if (e?.factors?.includes(f)) notes.push({ date: d, factor: f });
    }
  }
  return notes;
}

// Off-protocol food groups eaten on these days, other than the group being tested.
function offFoodNotes(data, days, testedGroup) {
  const notes = [];
  for (const d of days) {
    for (const f of data.entries?.[d]?.offFoods || []) {
      if (f !== testedGroup) notes.push({ date: d, food: f });
    }
  }
  return notes;
}

export function summarize(data, asOf, cfg = CONFIG) {
  const { settings } = data;
  const cond = settings.condition;
  const bounds = phaseBounds(settings, cfg);
  const B = Object.fromEntries(bounds.map((b) => [b.id, b]));
  const w = cfg.analysis.compareWindowDays;

  const windows = [
    windowStats(data, 'baseline', 'Baseline', B.baseline.start, B.baseline.end, asOf, cfg),
    windowStats(data, 'endElim', 'End of elimination', addDays(B.elimination.end, -(w - 1)), B.elimination.end, asOf, cfg,
      maxDate(B.elimination.start, addDays(B.elimination.end, -(cfg.analysis.compareWindowMaxDays - 1)))),
    windowStats(data, 'endMaint', 'End of maintenance', addDays(B.maintenance.end, -(w - 1)), B.maintenance.end, asOf, cfg,
      maxDate(B.maintenance.start, addDays(B.maintenance.end, -(cfg.analysis.compareWindowMaxDays - 1)))),
  ];

  const base = windows[0];
  const maint = windows[2];
  let change = null;
  if (base.status === 'done' && maint.status !== 'upcoming' && base.reliable && maint.reliable) {
    const delta = maint.meanScore - base.meanScore;
    change = {
      delta,
      fatigueDelta: base.meanFatigue != null && maint.meanFatigue != null ? maint.meanFatigue - base.meanFatigue : null,
      improved: -delta >= cfg.analysis.improvedMinDelta[cond],
      worsened: delta >= cfg.analysis.improvedMinDelta[cond],
      final: maint.status === 'done',
    };
  }

  const meds = medChanges(data);
  const medsInTrial = meds.filter((m) => m.date >= B.baseline.start && m.date <= B.maintenance.end && m.date <= asOf);

  // Reintroduction flags: 2-day test window vs. the maintenance-phase mean.
  const maintDays = asOf >= B.maintenance.start ? rangeISO(B.maintenance.start, B.maintenance.end < asOf ? B.maintenance.end : asOf) : [];
  const maintScores = dayRecords(data, maintDays, cfg).filter((r) => r.score != null).map((r) => r.score);
  const ref = { n: maintScores.length, mean: mean(maintScores), reliable: maintScores.length >= cfg.analysis.minLoggedDays };

  const tests = allTests(settings, cfg).map((t) => {
    const out = { ...t, status: 'upcoming', context: [] };
    if (asOf < t.start) return out;
    const days = rangeISO(t.start, t.end < asOf ? t.end : asOf);
    const recs = dayRecords(data, days, cfg);
    const skipped = recs.some((r) => r.entry && r.entry.tested === false) && !recs.some((r) => r.entry?.tested === true);
    if (skipped) return { ...out, status: 'skipped' };
    const scored = recs.filter((r) => r.score != null);
    out.n = scored.length;
    out.windowMean = cfg.analysis.flagStat === 'max' && scored.length
      ? Math.max(...scored.map((r) => r.score)) : mean(scored.map((r) => r.score));
    out.windowFatigue = mean(recs.filter((r) => r.fatigue != null).map((r) => r.fatigue));
    if (asOf < t.end || (asOf === t.end && !data.entries?.[t.end])) out.status = 'inProgress';
    else if (!scored.length || !ref.reliable) out.status = 'insufficient';
    else {
      out.delta = out.windowMean - ref.mean;
      out.status = out.delta >= cfg.analysis.flagMinDelta[cond] ? 'flag' : 'ok';
    }
    out.rough = recs.filter((r) => r.entry?.rough).length;
    // A rough day during a test could be the food or an unrelated flare. Simulation showed that treating it as a flag
    // caused many false flags, so the result is "unclear" (re-test later) unless the scored days already show a rise.
    if (out.status !== 'inProgress' && out.rough > 0 && out.status !== 'flag') out.status = 'unclear';
    const ctxFrom = addDays(t.start, -cfg.analysis.medContextDays);
    out.context = [
      ...meds.filter((m) => m.date >= ctxFrom && m.date <= t.end).map((m) => ({ type: 'med', ...m })),
      ...factorNotes(data, days).map((f) => ({ type: 'factor', ...f })),
      ...offFoodNotes(data, days, t.food.group).map((f) => ({ type: 'offFood', ...f })),
      ...days.filter((d) => data.entries?.[d]?.testPortion === 'small').map((d) => ({ type: 'portion', date: d })),
    ];
    return out;
  });

  const loggedDays = Object.keys(data.entries || {}).filter((d) => d >= settings.startDate && d <= asOf).length;

  return {
    condition: cond,
    bounds,
    windows,
    change,
    ref,
    tests,
    meds,
    medsInTrial,
    labs: [...(data.labs || [])].sort((a, b) => (a.date < b.date ? -1 : 1)),
    maintenanceComplete: asOf >= B.maintenance.end,
    loggedDays,
  };
}

export const FACTOR_KEYS = CONTEXT_FACTORS;

// Reasons to suggest pausing the diet and checking in with the care team (never blocks logging).
export function pauseSignals(data, asOf, cfg = CONFIG) {
  const { settings } = data;
  const P = cfg.analysis.pause;
  const reasons = [];
  const ph = phaseOf(settings, asOf, cfg);
  if (!['elimination', 'maintenance', 'reintroduction'].includes(ph.id)) return reasons;

  const w = [...(data.weights || [])].filter((x) => x.date <= asOf).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (w.length >= 2) {
    const drop = (w[0].value - w[w.length - 1].value) / w[0].value;
    if (drop >= P.weightLossPct) reasons.push({ type: 'weight', drop, from: w[0], to: w[w.length - 1] });
  }

  const days = rangeISO(addDays(asOf, -(P.windowDays - 1)), asOf);
  const recs = dayRecords(data, days, cfg);
  const scored = recs.filter((r) => r.score != null);
  const B = phaseBounds(settings, cfg);
  const baseDays = rangeISO(B[0].start, B[0].end);
  const base = dayRecords(data, baseDays, cfg).filter((r) => r.score != null);
  // Only while foods are out: during reintroduction a rise after a test food is expected and is judged by the food test.
  if (ph.id !== 'reintroduction' && scored.length >= P.minLoggedDays && base.length >= cfg.analysis.minLoggedDays) {
    const now = mean(scored.map((r) => r.score));
    // Compared with the lower of the baseline week and the two weeks before this one, so a relapse after
    // improving counts even if it is still below the starting level.
    const prior = dayRecords(data, rangeISO(addDays(asOf, -(P.windowDays + 13)), addDays(asOf, -P.windowDays)), cfg)
      .filter((r) => r.score != null);
    const refs = [mean(base.map((r) => r.score))];
    if (prior.length >= P.minLoggedDays) refs.push(mean(prior.map((r) => r.score)));
    const before = Math.min(...refs);
    if (now - before >= P.worseDelta[settings.condition]) reasons.push({ type: 'worse', now, before });
  }
  const rough = recs.filter((r) => r.entry?.rough).length;
  if (rough >= P.roughDays) reasons.push({ type: 'rough', rough });
  return reasons;
}
