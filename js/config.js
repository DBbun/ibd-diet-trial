// All protocol and scoring parameters live here so they can be adjusted without touching logic.
// Clinical defaults follow Konijeti et al. 2017 (Inflamm Bowel Dis 23:2054) where the paper specifies them;
// everything marked "default" is adjustable and not clinically fixed.

export const CONFIG = {
  appName: 'My IBD Food Pattern',

  // Konijeti 2017: 6-week staged elimination, then 5-week maintenance. Baseline week and reintroduction are
  // additions (baseline gives a real "before"; reintroduction goes beyond the trial and is labeled as such).
  phases: [
    { id: 'baseline', label: 'Baseline', days: 7, blurb: 'Eat as usual and log each day. This week is your "before".' },
    { id: 'elimination', label: 'Elimination', days: 42, blurb: 'Remove food groups step by step, one stage per week.' },
    { id: 'maintenance', label: 'Maintenance', days: 35, blurb: 'Stay on the full protocol. No reintroductions yet.' },
    { id: 'reintroduction', label: 'Reintroduction', daysPerFood: 2, blurb: 'Test one food group at a time. Goes beyond the published trial; discuss with your care team.' },
  ],

  foods: {
    grains: { label: 'Grains & gluten', examples: 'wheat, rice, oats, corn, bread, pasta' },
    legumes: { label: 'Legumes', examples: 'beans, lentils, peanuts, soy' },
    dairy: { label: 'Dairy', examples: 'milk, cheese, yogurt, butter' },
    eggs: { label: 'Eggs', examples: 'eggs, foods made with eggs' },
    nightshades: { label: 'Nightshades', examples: 'tomatoes, potatoes, peppers, eggplant' },
    nuts: { label: 'Nuts & seeds', examples: 'almonds, walnuts, sesame, chia' },
    spices: { label: 'Seed spices', examples: 'cumin, coriander seed, mustard, fennel seed' },
    sugar: { label: 'Refined sugar', examples: 'sweets, soda, added sugar' },
    coffee: { label: 'Coffee', examples: 'coffee, espresso' },
    alcohol: { label: 'Alcohol', examples: 'beer, wine, spirits' },
    oils: { label: 'Seed oils', examples: 'canola, soybean, corn, sunflower oil' },
    processed: { label: 'Processed foods', examples: 'additives, emulsifiers, packaged snacks' },
  },

  // Chips shown in the daily log for "off-protocol foods eaten".
  chips: ['grains', 'legumes', 'dairy', 'eggs', 'nightshades', 'nuts', 'sugar', 'coffee', 'alcohol', 'processed'],

  // Default staged order (the trial paper says elimination was staged but does not publish the order).
  eliminationSchedule: [
    ['grains', 'sugar', 'oils', 'processed'],
    ['dairy', 'alcohol'],
    ['legumes', 'coffee'],
    ['eggs'],
    ['nuts', 'spices'],
    ['nightshades'],
  ],

  // Default reintroduction order from common AIP guidance; adjustable.
  reintroOrder: [
    { id: 'eggs', label: 'Eggs', group: 'eggs' },
    { id: 'spices', label: 'Seed spices', group: 'spices' },
    { id: 'nuts', label: 'Nuts & seeds', group: 'nuts' },
    { id: 'nightshades', label: 'Nightshades', group: 'nightshades' },
    { id: 'dairy', label: 'Dairy', group: 'dairy' },
    { id: 'gfgrains', label: 'Gluten-free grains', group: 'grains' },
    { id: 'legumes', label: 'Legumes', group: 'legumes' },
    { id: 'gluten', label: 'Gluten grains', group: 'grains' },
    { id: 'alcohol', label: 'Alcohol', group: 'alcohol' },
  ],

  factors: {
    exercise: 'Exercise',
    poorSleep: 'Poor sleep',
    goodSleep: 'Good sleep',
    stress: 'Stress',
    illness: 'Illness / infection',
    travel: 'Travel',
    lateMeal: 'Late or heavy meal', // added from engagement log A2 (meal timing mattered, not just food group)
    spicy: 'Spicy food', // engagement log A3: spicy and fatty foods, which are not AIP groups, were his main triggers
    fatty: 'Fatty or fried food',
    ateOut: 'Ate out or someone else cooked', // published patient stories: hidden ingredients and social meals are where strict diets break
    hormonal: 'Hormonal change (period, pregnancy)', // engagement log A2: disease changed after pregnancy
    // Many people on biologics notice symptoms returning before the next dose, so a routine dose day is a competing explanation.
    dose: 'Regular injection or infusion today',
  },
  // Chips that cannot both be true on the same day; selecting one clears the other.
  exclusiveFactors: [['poorSleep', 'goodSleep']],

  // "My food experiences": personal patterns people report, including edge cases such as a trigger that faded
  // (engagement log A2: cherry tomatoes bothered a friend with Crohn's for years, then stopped).
  // Foods that help are asked about too (engagement log A4: a person with Crohn's eats kiwi daily because it helps).
  experiencePatterns: {
    always: 'Always bothers me',
    faded: 'Used to bother me, not anymore',
    new: 'Started bothering me recently',
    depends: 'Depends (amount, timing, preparation)',
    helps: 'Helps me now',
    helpedFaded: 'Used to help me, not anymore',
  },
  experienceGroups: {
    bothers: { label: 'Bothers me', patterns: ['always', 'faded', 'new', 'depends'] },
    helps: { label: 'Helps me', patterns: ['helps', 'helpedFaded'] },
  },

  // Built-in lab tests; people can also add their own (name + unit).
  // Foods people with IBD most often report as worsening or improving symptoms (Cohen et al., Dig Dis Sci 2013,
  // CCFA Partners survey), keeping only those that are not already AIP food groups. Offered as suggestions, never automatic.
  suggestedTriggers: ['Spicy food', 'Fried or fatty food', 'Raw vegetables', 'Leafy greens or salad', 'High-fiber foods',
    'Popcorn', 'Fizzy drinks', 'Red meat', 'Processed meat', 'Fruit'],
  suggestedHelpers: ['Yogurt', 'Rice', 'Bananas'],

  // Dairy is out from week 2 and is most people's main calcium source. AIP-compatible sources and the daily target,
  // from the NIH Office of Dietary Supplements calcium fact sheet (Tables 1 and 2).
  calcium: {
    target: 'Most adults need 1,000 mg a day; women over 50 and everyone over 70 need 1,200 mg.',
    sources: [
      ['Sardines, canned with bones, 3 oz', 325], ['Salmon, canned with bones, 3 oz', 181], ['Spinach, cooked, ½ cup', 123],
      ['Turnip greens, cooked, ½ cup', 99], ['Kale, cooked, 1 cup', 94], ['Bok choy, raw, 1 cup', 74],
    ],
  },

  // "Your health" setup step: answers adjust the plan and the warnings, and appear on the summary.
  healthConditions: {
    celiac: 'Celiac disease',
    ostomy: 'Ostomy, or colon removed (colectomy)',
    diabetes: 'Diabetes',
  },
  treatments: {
    asa: 'Mesalamine (5-ASA)',
    steroid: 'Steroids (e.g. prednisone, budesonide)',
    immuno: 'Immunomodulator (e.g. azathioprine, methotrexate)',
    biologic: 'Biologic or small-molecule drug',
    other: 'Other',
  },

  labTypes: {
    calprotectin: { label: 'Fecal calprotectin', unit: 'µg/g' },
    crp: { label: 'CRP', unit: 'mg/L' },
  },

  // Crohn's: Harvey-Bradshaw Index complications (patient-reportable).
  hbiComplications: {
    arthralgia: 'Joint pain',
    uveitis: 'Eye inflammation (uveitis)',
    erythemaNodosum: 'Painful red skin lumps (erythema nodosum)',
    aphthous: 'Mouth ulcers',
    pyoderma: 'Skin ulcer (pyoderma gangrenosum)',
    fissure: 'Anal fissure',
    fistula: 'New fistula',
    abscess: 'Abscess',
  },

  // Activity thresholds used by the trial: HBI >= 5 (CD), partial Mayo >= 3 (UC).
  // Note: the app's UC score is the 2-item patient-reported version (no physician global assessment).
  // IBD-unclassified uses the HBI item set and therefore the HBI threshold.
  activeThreshold: { CD: 5, UC: 3, IBDU: 5 },

  analysis: {
    compareWindowDays: 7,       // last N days of each phase are compared
    compareWindowMaxDays: 14,   // if too few of those are logged, widen back up to N days (never before the phase start)
    minLoggedDays: 4,           // fewer logged days than this => "not enough data" instead of a comparison
    baselineMaxDays: 14,        // if the 7-day baseline has too few logged days, the app offers to extend it (spec 6b)
    medContextDays: 7,          // medication change within N days of a food test is shown next to it
    complicationsValidDays: 7,  // a weekly HBI complications check applies to the 7 days that follow it
    // Food flag: mean index over the 2-day test window minus the maintenance mean must reach this.
    // Values are provisional; tools/simulate-trials.mjs evaluates them (spec section 6b).
    flagMinDelta: { CD: 1.5, UC: 1, IBDU: 1.5 },
    flagStat: 'mean',           // 'mean' or 'max' of the test-window days (chosen by simulation, spec 6b)
    improvedMinDelta: { CD: 2, UC: 1, IBDU: 2 },
    // "Time to pause and check in": weight down 5% or more from the first recorded weight (GLIM malnutrition
    // threshold, Cederholm et al. 2019), or a week of symptoms above baseline, or several rough days in a week.
    // The last two are this app's own conservative rules, not published cutoffs.
    // Symptoms: the week's average must rise by a clinically meaningful margin (3 HBI points, the usual threshold for a
    // meaningful change in Crohn's disease; 2 points on the 0-6 colitis score). Smaller margins fired on normal noise in simulation.
    pause: { weightLossPct: 0.05, windowDays: 7, minLoggedDays: 4, roughDays: 3, snoozeDays: 7, worseDelta: { CD: 3, UC: 2, IBDU: 3 } },
  },
};

export const CONDITIONS = {
  CD: { id: 'CD', label: "Crohn's disease", index: 'HBI', indexLong: "Harvey-Bradshaw Index (patient-reported items)" },
  UC: { id: 'UC', label: 'Ulcerative colitis', index: 'pMayo', indexLong: 'Partial Mayo score (patient-reported items)' },
  // IBD-unclassified / indeterminate colitis, and anyone who has not been given a settled label.
  // The Mayo items presume colonic disease (stools above your normal, rectal bleeding); the HBI items
  // (well-being, abdominal pain, liquid stools) are answerable by anyone with IBD, so this maps to HBI.
  IBDU: { id: 'IBDU', label: 'IBD, not yet classified', index: 'HBI', indexLong: "Harvey-Bradshaw Index (patient-reported items)" },
};
