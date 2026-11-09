// Synthetic participants with known ground truth. Used for (1) clearly-labeled demo data and
// (2) tools/simulate-trials.mjs, which tests the app's rules by subgroup (spec section 6b).
// Pure module, deterministic for a given seed.
import { CONFIG } from './config.js';
import { addDays, diffDays, rangeISO } from './dates.js';
import { phaseOf, testOf } from './protocol.js';

export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = (sd = 1) => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next()) * sd;
  };
  return { next, normal };
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Latent disease activity in roughly HBI units, then mapped to the items a patient reports.
export function simulateParticipant(o, cfg = CONFIG) {
  const r = rng(o.seed ?? 1);
  const {
    condition = 'CD', startDate, asOf, baseline = 8, responder = true, responseFraction = 0.4,
    noise = 0.8, adherence = 0.9, triggers = {}, normalStools = 2,
    medChanges = [], factorDays = [], labs = [], weeklyChecks = [], slips = [], notes = {},
    alwaysLogDays = [], skipDays = [], extendBaseline = false,
    // Scenario options for the simulation lab (all off by default):
    pastTriggers = [],        // foods that used to be triggers but no longer are (truth only; no effect)
    delayedTriggers = {},     // reaction appears 2-3 days after the test, i.e. during the next food's test
    confounder = null,        // { rate, effect, markRate }: random bad days (late meal, poor sleep); sometimes marked
    medEvent = null,          // { day, effect, drug }: medication started mid-trial that lowers activity from that day
    flares = null,            // { rate, effect, len: [min, max] }: flares that raise activity for a few days
    mnar = 0,                 // 0-1: how much less likely a person is to log on a flare day (engagement log A2)
    roughUse = 0,             // 0-1: share of missed flare days recorded with the one-tap "Rough day" button
    catchUp = 0,              // 0-1: share of missed days filled in the next day via the catch-up prompt
  } = o;
  // `trial` is mutable: if extendBaseline is on and the baseline week ends with too few logged days, the
  // simulated person accepts the app's offer to extend it (models the in-app prompt, spec 6b).
  const trial = { startDate, baselineDays: null };
  const entries = {};
  const days = rangeISO(startDate, asOf);
  const target = responder ? baseline * responseFraction : baseline;
  let flareLeft = 0;
  const flareDays = [];

  for (const date of days) {
    const trialDay = diffDays(startDate, date) + 1;
    let ph = phaseOf(trial, date, cfg);
    if (extendBaseline && ph.id === 'elimination' && ph.dayInPhase === 1 && !trial.baselineDays) {
      const loggedBaseline = Object.keys(entries).length;
      if (loggedBaseline < cfg.analysis.minLoggedDays) {
        trial.baselineDays = cfg.analysis.baselineMaxDays;
        ph = phaseOf(trial, date, cfg);
      }
    }
    let a = baseline;
    if (ph.id === 'elimination') a = baseline - (baseline - target) * Math.min(1, ph.dayInPhase / 28);
    else if (ph.id === 'maintenance' || ph.id === 'reintroduction' || ph.id === 'complete') a = target;
    let test = null;
    if (ph.id === 'reintroduction') {
      test = testOf(trial, date, cfg);
      const eff = triggers[test.food.id] || 0;
      a += eff * (test.cycleDay === 1 ? 0.6 : 1.0);
      const prev = test.index > 0 ? cfg.reintroOrder[test.index - 1] : null;
      if (prev && delayedTriggers[prev.id]) a += delayedTriggers[prev.id] * (test.cycleDay === 1 ? 0.6 : 1.0);
    }
    if (medEvent && trialDay >= medEvent.day) a = Math.max(0, a - medEvent.effect);
    let confounded = false;
    if (confounder && r.next() < confounder.rate) { a += confounder.effect; confounded = true; }
    let inFlare = false;
    if (flares) {
      if (flareLeft === 0 && r.next() < flares.rate) flareLeft = flares.len[0] + Math.floor(r.next() * (flares.len[1] - flares.len[0] + 1));
      if (flareLeft > 0) { a += flares.effect; flareLeft--; inFlare = true; flareDays.push(date); }
    }
    a = Math.max(0, a + r.normal(noise));

    let logged = alwaysLogDays.includes(trialDay) || (!skipDays.includes(trialDay) && r.next() < adherence * (inFlare ? 1 - mnar : 1));
    let caughtUp = false;
    if (!logged && date !== o.leaveOpen) {
      if (inFlare && roughUse > 0 && r.next() < roughUse) {
        entries[date] = { date, rough: true, wellbeing: null, pain: null, stools: null, bleeding: null, fatigue: null,
          tested: null, offFoods: [], factors: [], note: '', med: { change: 'none', drug: '' }, savedAt: `${date}T21:00:00.000Z` };
        continue;
      }
      if (catchUp > 0 && r.next() < catchUp) { logged = true; caughtUp = true; a = Math.max(0, a + r.normal(0.5)); } // recalled a day later
    }
    if (!logged || date === o.leaveOpen) continue;

    const e = { date, offFoods: [], factors: [], note: '', med: { change: 'none', drug: '' }, tested: null };
    if (condition === 'CD') {
      e.stools = Math.max(0, Math.round(0.45 * a + r.normal(0.4)));
      e.pain = clamp(Math.round(0.2 * a + r.normal(0.35)), 0, 3);
      e.wellbeing = clamp(Math.round(0.25 * a + r.normal(0.35)), 0, 4);
      e.bleeding = null;
    } else {
      e.stools = normalStools + Math.max(0, Math.round(0.5 * a + r.normal(0.5)));
      e.bleeding = clamp(Math.round(0.22 * a + r.normal(0.35)), 0, 3);
      e.pain = clamp(Math.round(0.18 * a + r.normal(0.35)), 0, 3);
      e.wellbeing = clamp(Math.round(0.25 * a + r.normal(0.35)), 0, 4);
    }
    e.fatigue = clamp(Math.round(1.5 + 0.55 * a + r.normal(1)), 0, 10);
    if (test) { e.tested = true; e.testPortion = 'normal'; }
    for (const f of factorDays.filter((x) => x.day === trialDay)) e.factors.push(f.factor);
    if (confounded && r.next() < confounder.markRate) e.factors.push(r.next() < 0.5 ? 'lateMeal' : 'poorSleep');
    if (medEvent && medEvent.day === trialDay) e.med = { change: 'started', drug: medEvent.drug || 'new medication' };
    for (const s of slips.filter((x) => x.day === trialDay)) e.offFoods.push(s.food);
    if (['elimination', 'maintenance', 'reintroduction'].includes(ph.id)) e.onPlan = e.offFoods.length === 0;
    const mc = medChanges.find((m) => m.day === trialDay);
    if (mc) e.med = { change: mc.change, drug: mc.drug };
    if (notes[trialDay]) e.note = notes[trialDay];
    if (inFlare) e.rough = r.next() < roughUse; // on logged flare days some people also tap "Rough day"
    if (caughtUp) e.catchUp = true;
    e.savedAt = `${date}T20:00:00.000Z`;
    entries[date] = e;
  }

  const settings = { condition, normalStools, startDate, createdAt: `${startDate}T09:00:00.000Z` };
  if (trial.baselineDays) settings.baselineDays = trial.baselineDays;
  return {
    data: {
      settings,
      entries,
      weekly: weeklyChecks.map((w) => ({ date: addDays(startDate, w.day - 1), items: w.items })),
      labs: labs.map((l) => ({ date: addDays(startDate, l.day - 1), type: l.type, value: l.value })),
    },
    truth: {
      responder,
      triggers: [...Object.keys(triggers).filter((k) => triggers[k] > 0), ...Object.keys(delayedTriggers).filter((k) => delayedTriggers[k] > 0)],
      delayed: Object.keys(delayedTriggers).filter((k) => delayedTriggers[k] > 0),
      past: pastTriggers,
      medEvent: !!medEvent,
      flareDays,
    },
  };
}
