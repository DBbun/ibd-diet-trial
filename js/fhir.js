// HL7 FHIR R4 export: every entry as standard health-record resources, so data can move into electronic health
// records and research platforms without re-entry. Pure module (also used by tools/check.mjs).
//
// Codes: lab tests use LOINC (verified via the NLM Clinical Tables LOINC service, 2026-09-18):
//   38445-3 Calprotectin [Mass/mass] in Stool; 1988-5 C reactive protein [Mass/volume] in Serum or Plasma.
// The condition uses ICD-10 (K50 Crohn disease, K51 ulcerative colitis). LOINC has no codes for the
// patient-reported HBI / partial Mayo items used here, so those use this app's own code system, labeled as such.
import { CONFIG, CONDITIONS } from './config.js';
import { dailyScore, indexName, usesHBI } from './scoring.js';

export const APP_CODES = 'urn:dbbun:ibd-diet-trial:codes';
const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10';
// K52.3 is the ICD-10 code for indeterminate colitis, which is where IBD-unclassified maps.
const ICD10_FOR = {
  CD: { code: 'K50', display: 'Crohn disease [regional enteritis]' },
  UC: { code: 'K51', display: 'Ulcerative colitis' },
  IBDU: { code: 'K52.3', display: 'Indeterminate colitis' },
};
const CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';

const LAB_CODES = {
  calprotectin: { system: LOINC, code: '38445-3', display: 'Calprotectin [Mass/mass] in Stool', ucum: 'ug/g' },
  crp: { system: LOINC, code: '1988-5', display: 'C reactive protein [Mass/volume] in Serum or Plasma', ucum: 'mg/L' },
};

const ITEMS = {
  wellbeing: 'General well-being (0 very well to 4 terrible)',
  pain: 'Abdominal pain (0 none to 3 severe)',
  stools: 'Number of stools today',
  liquidStools: 'Number of liquid or very soft stools today',
  bleeding: 'Rectal bleeding (0 none to 3 blood alone passed)',
  fatigue: 'Fatigue (0 none to 10 worst)',
  roughDay: 'Rough day marked with one tap',
  testedFood: 'Reintroduction test food eaten today',
  offProtocolFood: 'Off-protocol food eaten',
  onPlan: 'Stayed on the diet plan today (patient-reported)',
  testPortion: 'Amount of reintroduction test food eaten (small, normal, large)',
  medicationChange: 'Medication change reported by the patient',
  contextFactor: 'Other factor marked for the day',
  hbiComplications: 'Harvey-Bradshaw Index complications in the past week (count)',
  otherSymptoms: 'Extraintestinal or complication symptoms in the past week (count), not part of the score',
  foodExperience: 'Food experience reported by the patient',
  patientNote: 'Patient note',
  phbi: 'Symptom score from patient-reported Harvey-Bradshaw Index items (excludes abdominal mass; not the full index)',
  pmayo: 'Symptom score from Mayo stool-frequency and rectal-bleeding subscores (not the full partial Mayo score)',
};

const cc = (code, display = ITEMS[code]) => ({ coding: [{ system: APP_CODES, code, display }], text: display });
const CAT_DISPLAY = { laboratory: 'Laboratory', survey: 'Survey', 'vital-signs': 'Vital Signs' };
const cat = (code) => [{ coding: [{ system: CATEGORY, code, display: CAT_DISPLAY[code] || 'Survey' }] }];

export function toFHIR(state, { exportedAt = new Date().toISOString() } = {}) {
  const s = state.settings;
  const entries = [];
  let n = 0;
  const add = (resource) => {
    const id = `${resource.resourceType.toLowerCase()}-${++n}`;
    entries.push({ fullUrl: `urn:uuid:${uuidLike(`${exportedAt}|${id}`)}`, resource: { id, ...resource } });
    return entries[entries.length - 1].fullUrl;
  };

  // The person is anonymous: no name, birth date or identifiers are stored or exported.
  const patient = add(s.demo
    ? { resourceType: 'Patient', meta: { tag: [{ system: APP_CODES, code: 'simulated', display: 'Simulated demo data' }] } }
    : { resourceType: 'Patient' });
  const subject = { reference: patient };

  add({
    resourceType: 'Condition',
    subject,
    clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
    code: {
      coding: [ICD10_FOR[s.condition] ? { system: ICD10, ...ICD10_FOR[s.condition] } : { system: ICD10, code: 'K51', display: 'Ulcerative colitis' }],
      text: CONDITIONS[s.condition].label,
    },
    ...(s.health?.dxYear ? { onsetDateTime: String(s.health.dxYear) } : {}),
    note: [{ text: 'Reported by the patient at setup of a personal AIP diet trial.' }],
  });

  const obs = (date, code, value, category = 'survey', extra = {}) => add({
    resourceType: 'Observation', status: 'final', category: cat(category), code, subject, effectiveDateTime: date, ...value, ...extra,
  });

  for (const date of Object.keys(state.entries || {}).sort()) {
    const e = state.entries[date];
    if (e.wellbeing != null) obs(date, cc('wellbeing'), { valueInteger: e.wellbeing });
    if (e.pain != null) obs(date, cc('pain'), { valueInteger: e.pain });
    if (e.stools != null) obs(date, cc(usesHBI(s.condition) ? 'liquidStools' : 'stools'), { valueInteger: e.stools });
    if (e.bleeding != null) obs(date, cc('bleeding'), { valueInteger: e.bleeding });
    if (e.fatigue != null) obs(date, cc('fatigue'), { valueInteger: e.fatigue });
    if (e.rough) obs(date, cc('roughDay'), { valueBoolean: true });
    const score = dailyScore(e, s, state.weekly, CONFIG);
    if (score) {
      const code = usesHBI(s.condition) ? 'phbi' : 'pmayo';
      obs(date, cc(code), { valueInteger: score.score }, 'survey', {
        note: [{ text: `${indexName(s.condition)} computed by the app from the patient's answers; not a clinician-assessed index.` }],
      });
    }
    if (e.tested != null) obs(date, cc('testedFood'), { valueBoolean: !!e.tested });
    if (e.testPortion) obs(date, cc('testPortion'), { valueString: e.testPortion });
    if (e.onPlan != null) obs(date, cc('onPlan'), { valueBoolean: !!e.onPlan });
    for (const f of e.offFoods || []) obs(date, cc('offProtocolFood'), { valueString: CONFIG.foods[f]?.label || f });
    if (e.med && e.med.change && e.med.change !== 'none') {
      obs(date, cc('medicationChange'), { valueString: `${e.med.change}${e.med.drug ? `: ${e.med.drug}` : ''}` });
    }
    for (const f of e.factors || []) obs(date, cc('contextFactor'), { valueString: CONFIG.factors[f] || f });
    if (e.note) obs(date, cc('patientNote'), { valueString: e.note });
  }

  for (const w of state.weekly || []) obs(w.date, cc(usesHBI(s.condition) ? 'hbiComplications' : 'otherSymptoms'), { valueInteger: w.items.length }, 'survey',
    w.items.length ? { component: w.items.map((k) => ({ code: { text: CONFIG.hbiComplications[k] || k }, valueBoolean: true })) } : {});

  for (const l of state.labs || []) {
    const known = LAB_CODES[l.type];
    const code = known
      ? { coding: [{ system: known.system, code: known.code, display: known.display }], text: known.display }
      : { text: l.name || 'Laboratory test' };
    const unit = known ? known.ucum : (l.unit || '').trim();
    // FHIR does not allow empty strings, so the unit is left out when the person did not give one.
    const q = { value: l.value, ...(unit ? { unit } : {}), ...(known ? { system: UCUM, code: known.ucum } : {}) };
    obs(l.date, code, { valueQuantity: q }, 'laboratory', {
      note: [{ text: 'Entered by the patient from a lab report.' }],
    });
  }

  // Body weight, LOINC 29463-7, in kg or pounds as the person entered it.
  const lb = s.weightUnit === 'lb';
  for (const w of state.weights || []) obs(w.date,
    { coding: [{ system: LOINC, code: '29463-7', display: 'Body weight' }], text: 'Body weight' },
    { valueQuantity: { value: w.value, unit: lb ? 'lb' : 'kg', system: UCUM, code: lb ? '[lb_av]' : 'kg' } }, 'vital-signs');

  for (const x of state.experiences || []) obs(x.date, cc('foodExperience'), {
    valueString: `${x.food}: ${CONFIG.experiencePatterns[x.pattern] || x.pattern}${x.since ? ` (${x.since})` : ''}${x.note ? `. ${x.note}` : ''}`,
  });

  return {
    resourceType: 'Bundle',
    type: 'collection',
    timestamp: exportedAt,
    meta: { tag: [{ system: APP_CODES, code: 'patient-generated', display: `Exported by ${CONFIG.appName}` }] },
    entry: entries,
  };
}

// Deterministic UUID-shaped identifier from a string (FHIR fullUrl needs a URN). Seeded with the export time, so ids differ between exports.
function uuidLike(str) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) { h1 = Math.imul(h1 ^ str.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 + str.charCodeAt(i), 2246822519) >>> 0; }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
