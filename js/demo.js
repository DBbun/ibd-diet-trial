// Demo data for the video: one simulated person, clearly labeled as simulated in the UI.
// Places "today" on day 1 of the dairy test so the reintroduction prompt and a live entry can be filmed,
// with baseline, elimination, maintenance and four completed food tests already logged.
import { CONFIG } from './config.js';
import { addDays } from './dates.js';
import { simulateParticipant } from './simulate.js';

export function buildDemo(condition, today, cfg = CONFIG) {
  const pre = 7 + 42 + 35; // baseline + elimination + maintenance
  const trialDayToday = pre + 9; // reintroduction day 9 = dairy test, day 1
  const startDate = addDays(today, -(trialDayToday - 1));
  const { data } = simulateParticipant({
    seed: condition === 'CD' ? 20260918 : 20260919,
    condition,
    startDate,
    asOf: addDays(today, -1), // today is left open for a live entry
    baseline: condition === 'CD' ? 8.5 : 8,
    responder: true,
    responseFraction: 0.35,
    noise: 0.7,
    adherence: 0.9,
    normalStools: 2,
    // One true trigger among the completed tests, so the summary shows a flag next to three clear results.
    triggers: { nightshades: condition === 'CD' ? 4 : 5 },
    // Make sure every reintroduction test window and the comparison windows are logged.
    alwaysLogDays: Array.from({ length: 8 }, (_, i) => pre + 1 + i),
    medChanges: [{ day: 24, change: 'dose', drug: condition === 'CD' ? 'Budesonide, tapering' : 'Mesalamine, dose lowered' }],
    factorDays: [
      { day: 3, factor: 'poorSleep' }, { day: 5, factor: 'stress' }, { day: 12, factor: 'exercise' },
      { day: 19, factor: 'exercise' }, { day: 33, factor: 'poorSleep' }, { day: 47, factor: 'exercise' },
      { day: 61, factor: 'travel' }, { day: 62, factor: 'travel' }, { day: 70, factor: 'exercise' },
      { day: 78, factor: 'exercise' }, { day: 85, factor: 'exercise' },
    ],
    slips: [{ day: 17, food: 'coffee' }, { day: 30, food: 'sugar' }],
    notes: { 1: 'Starting today. Bad week with cramping.', 24: 'GI lowered my dose at today\'s visit.', 91: 'Tomato sauce and roasted peppers at dinner.', 92: 'Cramping overnight, tired today.' },
    labs: [
      { day: 2, type: 'calprotectin', value: 410 },
      { day: 2, type: 'crp', value: 8.9 },
      { day: 83, type: 'calprotectin', value: 145 },
      { day: 83, type: 'crp', value: 3.6 },
    ],
    weeklyChecks: condition === 'CD'
      ? [{ day: 1, items: ['arthralgia'] }, { day: 8, items: ['arthralgia'] }, { day: 15, items: [] }, { day: 22, items: [] },
        { day: 29, items: [] }, { day: 36, items: [] }, { day: 43, items: [] }, { day: 50, items: [] },
        { day: 57, items: [] }, { day: 64, items: [] }, { day: 71, items: [] }, { day: 78, items: [] }, { day: 85, items: [] },
        { day: 92, items: [] }]
      : [],
  }, cfg);
  data.settings.demo = true;
  return data;
}
