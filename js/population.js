// The simulated population used for the fairness evaluation (spec 6b). Deterministic: patient i is always the same
// person, so tools/simulate-trials.mjs and the simulation lab page (sim.html) show identical results.
import { CONFIG } from './config.js';
import { trialEnd } from './protocol.js';
import { addDays } from './dates.js';
import { simulateParticipant, rng } from './simulate.js';

export const SEED = 20260918;
export const POPULATION_SIZE = 4000;
export const START = '2026-01-05';
// Long enough for anyone whose baseline was extended to finish the trial.
export const END = trialEnd({ startDate: START, baselineDays: CONFIG.analysis.baselineMaxDays });
// Results are read the day after the trial ends, as a real person would (so a test's last day counts as finished).
export const REVIEW_DATE = addDays(END, 1);

// Population assumptions (stated so results can be read in context):
export const ASSUME = {
  responderShare: 0.7,          // share who truly improve on elimination
  responseFraction: [0.3, 0.5], // activity falls to 30-50% of baseline in responders
  triggerShare: 0.2,            // each food group is a true trigger for 20% of people
  triggerEffect: [3, 5],        // latent activity rise on the second test day (about +2.5 to +4.5 HBI points)
};

export function makeSpecs(n = POPULATION_SIZE, cfg = CONFIG) {
  const r = rng(SEED);
  const uni = (a, b) => a + (b - a) * r.next();
  const specs = [];
  for (let i = 0; i < n; i++) {
    const p = {
      id: i + 1,
      condition: r.next() < 0.5 ? 'CD' : 'UC',
      baselineHigh: r.next() < 0.5,
      noiseHigh: r.next() < 0.5,
      adherenceLow: r.next() < 0.5,
      responder: r.next() < ASSUME.responderShare,
    };
    const triggers = {};
    for (const f of cfg.reintroOrder) if (r.next() < ASSUME.triggerShare) triggers[f.id] = uni(...ASSUME.triggerEffect);
    specs.push({
      p,
      sim: {
        seed: SEED + i + 1,
        condition: p.condition,
        startDate: START,
        asOf: END,
        baseline: p.baselineHigh ? uni(9, 12) : uni(5, 8),
        responder: p.responder,
        responseFraction: uni(...ASSUME.responseFraction),
        noise: p.noiseHigh ? uni(1.2, 1.6) : uni(0.5, 0.9),
        adherence: p.adherenceLow ? uni(0.45, 0.6) : uni(0.85, 0.95),
        normalStools: 2,
        triggers,
      },
    });
  }
  return specs;
}

// Simulated people accept the in-app offer to extend a thinly logged baseline week unless extendBaseline is false.
export function simulateSpec(spec, extendBaseline = true, cfg = CONFIG) {
  return simulateParticipant({ ...spec.sim, extendBaseline }, cfg);
}

// Custom scenarios for the simulation lab. Defaults reproduce the main population's assumptions.
export const SCENARIO_DEFAULTS = {
  name: 'My scenario',
  n: 300,
  seed: 1,
  ucShare: 0.5,
  adherence: [0.85, 0.95],
  noise: [0.5, 1.6],
  baseline: [5, 12],
  responderShare: ASSUME.responderShare,
  triggerShare: ASSUME.triggerShare,
  triggerEffect: ASSUME.triggerEffect,
  fadedShare: 0,      // share of non-trigger foods that USED to be triggers (e.g. cherry tomatoes that stopped bothering)
  delayedShare: 0,    // share of triggers whose reaction shows up 2-3 days later
  confRate: 0,        // chance per day of an unrelated bad day (late heavy meal, poor sleep)
  confEffect: 3,
  confMarkRate: 0.5,  // chance the person marks that day's cause with a chip
  medShare: 0,        // share of people who start a medication during elimination
  medEffect: 3,
  flareRate: 0,       // chance per day that a flare starts (lasts 2-4 days)
  flareEffect: 4,
  mnar: 0,            // how much less likely people are to log on flare days
  roughUse: 0,        // share of missed flare days recorded with the one-tap "Rough day" button
  catchUp: 0,         // share of missed days filled in the next day via the catch-up prompt
  flagCD: null,       // rule overrides (null = app default)
  flagUC: null,
};

export function makeScenarioSpecs(params, cfg = CONFIG) {
  const P = { ...SCENARIO_DEFAULTS, ...params };
  const r = rng(P.seed);
  const uni = ([a, b]) => a + (b - a) * r.next();
  const specs = [];
  for (let i = 0; i < P.n; i++) {
    const condition = r.next() < P.ucShare ? 'UC' : 'CD';
    const responder = r.next() < P.responderShare;
    const triggers = {};
    const delayedTriggers = {};
    const pastTriggers = [];
    for (const f of cfg.reintroOrder) {
      if (r.next() < P.triggerShare) {
        if (r.next() < P.delayedShare) delayedTriggers[f.id] = uni(P.triggerEffect);
        else triggers[f.id] = uni(P.triggerEffect);
      } else if (r.next() < P.fadedShare) pastTriggers.push(f.id);
    }
    const adherence = uni(P.adherence);
    const noise = uni(P.noise);
    const baseline = uni(P.baseline);
    const medEvent = r.next() < P.medShare ? { day: 8 + Math.floor(r.next() * 35), effect: P.medEffect, drug: 'Prednisone (simulated)' } : null;
    specs.push({
      p: { id: i + 1, condition, responder, adherence, noise, baseline, adherenceLow: adherence < 0.7, noiseHigh: noise > 1.1, baselineHigh: baseline > 8.5 },
      sim: {
        seed: P.seed * 100000 + i + 1, condition, startDate: START, asOf: END, baseline, responder,
        responseFraction: uni(ASSUME.responseFraction), noise, adherence, normalStools: 2, triggers,
        delayedTriggers, pastTriggers, medEvent,
        confounder: P.confRate > 0 ? { rate: P.confRate, effect: P.confEffect, markRate: P.confMarkRate } : null,
        flares: P.flareRate > 0 ? { rate: P.flareRate, effect: P.flareEffect, len: [2, 4] } : null,
        mnar: P.mnar, roughUse: P.roughUse, catchUp: P.catchUp,
      },
    });
  }
  return specs;
}

export function scenarioConfig(params, cfg = CONFIG) {
  const c = structuredClone(cfg);
  if (params.flagCD != null) c.analysis.flagMinDelta.CD = params.flagCD;
  if (params.flagUC != null) c.analysis.flagMinDelta.UC = params.flagUC;
  return c;
}
