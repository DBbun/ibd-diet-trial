// Scoring the app's conclusions against simulated truth (used by the simulation lab's custom scenarios).
const rate = (a, b) => (b ? a / b : null);

export function patientOutcome(p, s, truth, extra = {}) {
  const tests = s.tests;
  const ids = (st) => tests.filter((t) => t.status === st).map((t) => t.food.id);
  const flag = ids('flag');
  const ins = [...ids('insufficient'), ...ids('unclear')]; // not judged either way
  const trig = truth.triggers;
  const caught = trig.filter((f) => flag.includes(f));
  const missed = trig.filter((f) => !flag.includes(f) && !ins.includes(f));
  const falseFlags = flag.filter((f) => !trig.includes(f));
  const noteFor = (f) => (tests.find((t) => t.food.id === f)?.context || []).length > 0;
  return {
    id: p.id, c: p.condition, r: +p.responder, trig, flag, ins, caught, missed, falseFlags,
    falseNoted: falseFlags.filter(noteFor),
    past: truth.past || [], delayed: truth.delayed || [], medEvent: !!truth.medEvent,
    imp: s.change ? +s.change.improved : null,
    medLogged: s.medsInTrial.length > 0,
    ...extra,
  };
}

export function summarizeOutcomes(rows, foods = 9) {
  let tp = 0, fn = 0, tn = 0, fp = 0, ins = 0, tests = 0, impN = 0, impOk = 0;
  let past = 0, pastCleared = 0, delayed = 0, delayedCaught = 0, fpNoted = 0, medN = 0, medImp = 0, medImpNoted = 0;
  let flareN = 0, flareSeen = 0;
  for (const o of rows) {
    tests += foods;
    ins += o.ins.length;
    for (const f of o.trig) { if (o.ins.includes(f)) continue; if (o.flag.includes(f)) tp++; else fn++; }
    const judgedSafe = foods - o.trig.length - o.ins.filter((f) => !o.trig.includes(f)).length;
    fp += o.falseFlags.length;
    tn += judgedSafe - o.falseFlags.length;
    fpNoted += o.falseNoted.length;
    if (o.imp !== null) { impN++; if (o.imp === o.r) impOk++; }
    for (const f of o.past) { if (o.ins.includes(f)) continue; past++; if (!o.flag.includes(f)) pastCleared++; }
    for (const f of o.delayed) { if (o.ins.includes(f)) continue; delayed++; if (o.flag.includes(f)) delayedCaught++; }
    flareN += o.flareN || 0; flareSeen += o.flareSeen || 0;
    if (o.medEvent && !o.r && o.imp !== null) { medN++; if (o.imp) { medImp++; if (o.medLogged) medImpNoted++; } }
  }
  return {
    n: rows.length,
    tpr: rate(tp, tp + fn), tnr: rate(tn, tn + fp), insufficient: rate(ins, tests),
    improvedAgreement: rate(impOk, impN), improvedInsufficient: rows.length ? 1 - impN / rows.length : null,
    pastCleared: rate(pastCleared, past), pastN: past,
    delayedCaught: rate(delayedCaught, delayed), delayedN: delayed,
    falseFlagsWithNote: rate(fpNoted, fp), falseFlagN: fp,
    medNonResponderShownImproved: rate(medImp, medN), medN,
    medCaveatShown: rate(medImpNoted, medImp),
    flareVisible: rate(flareSeen, flareN), flareN,
  };
}
