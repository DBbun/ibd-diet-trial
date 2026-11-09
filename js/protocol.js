// Protocol state machine: which phase a date falls in, what to avoid, which food to test.
import { CONFIG } from './config.js';
import { addDays, diffDays } from './dates.js';

// `trial` is the settings object ({ startDate, baselineDays? }) or just a start date string.
// baselineDays can be extended (up to 14) when too few baseline days were logged; see views/today.js.
const T = (trial) => (typeof trial === 'string' ? { startDate: trial } : trial);

// Reintroduction tests for this person. People with celiac disease never test gluten.
export function reintroOrderFor(trial, cfg = CONFIG) {
  const t = T(trial);
  const base = t.health?.conditions?.includes('celiac') ? cfg.reintroOrder.filter((f) => f.id !== 'gluten') : cfg.reintroOrder;
  // Foods the person named at setup (engagement log A3: real triggers are often outside the AIP groups).
  const own = (t.customTests || []).filter((f) => f && f.label)
    .map((f, i) => ({ id: f.id || `own${i + 1}`, label: f.label, group: null, own: true }));
  return own.length ? [...base, ...own] : base;
}

export function phaseBounds(trial, cfg = CONFIG) {
  const { startDate, baselineDays } = T(trial);
  const bounds = [];
  let cursor = startDate;
  for (const p of cfg.phases) {
    const days = p.id === 'baseline' && baselineDays ? baselineDays : p.days ?? p.daysPerFood * reintroOrderFor(trial, cfg).length;
    const end = addDays(cursor, days - 1);
    bounds.push({ id: p.id, label: p.label, blurb: p.blurb, start: cursor, end, days });
    cursor = addDays(end, 1);
  }
  return bounds;
}

export function trialEnd(trial, cfg = CONFIG) {
  const b = phaseBounds(trial, cfg);
  return b[b.length - 1].end;
}

export function phaseOf(trial, date, cfg = CONFIG) {
  const { startDate } = T(trial);
  const bounds = phaseBounds(trial, cfg);
  if (date < startDate) return { id: 'before', label: 'Not started', daysUntilStart: diffDays(date, startDate) };
  for (const b of bounds) {
    if (date >= b.start && date <= b.end) {
      const dayInPhase = diffDays(b.start, date) + 1;
      return { ...b, dayInPhase, trialDay: diffDays(startDate, date) + 1 };
    }
  }
  return { id: 'complete', label: 'Trial complete', trialDay: diffDays(startDate, date) + 1 };
}

// Food groups to avoid on a given date, plus the ones newly added this week (elimination is staged weekly).
export function avoidList(trial, date, cfg = CONFIG) {
  const ph = phaseOf(trial, date, cfg);
  const all = cfg.eliminationSchedule.flat();
  if (ph.id === 'elimination') {
    const week = Math.floor((ph.dayInPhase - 1) / 7);
    const stages = cfg.eliminationSchedule.slice(0, Math.min(week + 1, cfg.eliminationSchedule.length));
    return { avoid: stages.flat(), added: stages[stages.length - 1], week: week + 1 };
  }
  if (ph.id === 'maintenance') return { avoid: all, added: [], week: null };
  if (ph.id === 'reintroduction') {
    const test = testOf(trial, date, cfg);
    const testedGroups = reintroOrderFor(trial, cfg).slice(0, test.index).map((f) => f.group);
    // Groups already tested stay allowed only if they caused no reaction; the app leaves that to the person.
    return { avoid: all.filter((g) => !testedGroups.includes(g) && g !== test.food.group), added: [], week: null };
  }
  return { avoid: [], added: [], week: null };
}

// Reintroduction test for a date: which food, and which day of its cycle.
export function testOf(trial, date, cfg = CONFIG) {
  const ph = phaseOf(trial, date, cfg);
  if (ph.id !== 'reintroduction') return null;
  const per = cfg.phases.find((p) => p.id === 'reintroduction').daysPerFood;
  const index = Math.floor((ph.dayInPhase - 1) / per);
  const cycleDay = ((ph.dayInPhase - 1) % per) + 1;
  const start = addDays(ph.start, index * per);
  return { index, cycleDay, per, food: reintroOrderFor(trial, cfg)[index], start, end: addDays(start, per - 1) };
}

export function allTests(trial, cfg = CONFIG) {
  const b = phaseBounds(trial, cfg).find((x) => x.id === 'reintroduction');
  const per = cfg.phases.find((p) => p.id === 'reintroduction').daysPerFood;
  return reintroOrderFor(trial, cfg).map((food, index) => {
    const start = addDays(b.start, index * per);
    return { index, food, start, end: addDays(start, per - 1) };
  });
}
