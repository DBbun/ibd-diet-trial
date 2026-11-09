// Patient-reported disease-activity scores.
// Crohn's: Harvey-Bradshaw Index items a patient can report: general well-being (0-4), abdominal pain (0-3),
//   number of liquid/soft stools, and complications (1 point each). The abdominal-mass item needs a physical exam
//   and is excluded, so this is labeled "patient-reported HBI", not the full clinical index.
// Ulcerative colitis: partial Mayo stool-frequency and rectal-bleeding subscores (0-3 each). The physician global
//   assessment is excluded, so the range is 0-6.
import { CONFIG, CONDITIONS } from './config.js';
import { addDays } from './dates.js';

// Which item set a condition scores on. IBD-unclassified scores on the HBI items, like Crohn's.
export function usesHBI(condition) {
  return CONDITIONS[condition]?.index === 'HBI';
}

export function stoolFrequencySubscore(stools, normal) {
  const over = stools - normal;
  if (over <= 0) return 0;
  if (over <= 2) return 1;
  if (over <= 4) return 2;
  return 3;
}

// Most recent complications check within the validity window before (or on) the date.
export function complicationsFor(date, weekly = [], cfg = CONFIG) {
  const from = addDays(date, -(cfg.analysis.complicationsValidDays - 1));
  const candidates = weekly.filter((w) => w.date >= from && w.date <= date);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (a.date < b.date ? 1 : -1));
  return candidates[0].items.length;
}

// Returns { score, parts } or null if a required item was not answered (missing is never treated as zero).
export function dailyScore(entry, settings, weekly = [], cfg = CONFIG) {
  if (!entry) return null;
  if (usesHBI(settings.condition)) {
    const { wellbeing, pain, stools } = entry;
    if (wellbeing == null || pain == null || stools == null) return null;
    const compl = complicationsFor(entry.date, weekly, cfg);
    return {
      // With no recent weekly check, complications add 0; parts.complications stays null so it shows as missing.
      score: wellbeing + pain + stools + (compl ?? 0),
      parts: { wellbeing, pain, stools, complications: compl },
    };
  }
  const { stools, bleeding } = entry;
  if (stools == null || bleeding == null) return null;
  const sf = stoolFrequencySubscore(stools, settings.normalStools ?? 1);
  return { score: sf + bleeding, parts: { stoolFrequency: sf, bleeding } };
}

export function isActive(score, condition, cfg = CONFIG) {
  return score >= cfg.activeThreshold[condition];
}

export function indexName(condition) {
  // Not the full clinical indices: the clinician-assessed items are left out.
  return usesHBI(condition) ? 'Symptom score (HBI items)' : 'Symptom score (Mayo items)';
}

export function indexMax(condition) {
  return usesHBI(condition) ? 20 : 6;
}
