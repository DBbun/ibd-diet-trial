import { CONFIG, CONDITIONS } from '../config.js';

// What each condition card says it will ask about.
const CONDITION_BLURB = {
  CD: 'Tracks well-being, abdominal pain and loose stools (Harvey-Bradshaw Index items).',
  UC: 'Tracks stool frequency and rectal bleeding (partial Mayo score items).',
  IBDU: "Including indeterminate colitis, or if you have been told you have IBD but not which kind. Asks the same questions as the Crohn's option.",
};
import { phaseBounds } from '../protocol.js';
import { formatShort } from '../dates.js';
import { esc } from '../ui.js';

export const FAIRNESS_LINE = "The evidence for this diet in IBD comes from one small study of 15 adults, with no comparison group. 73% were women, and race was not reported. Your results may differ.";

// Suspected foods typed at setup, as reintroduction tests.
export function ownTests(s) {
  return (s.customTests || []).map((t, i) => ({ id: `own${i + 1}`, label: (t || '').trim() })).filter((t) => t.label);
}

export function renderSetup(ctx) {
  const s = ctx.setup;
  const steps = ['Condition', 'Details', 'Your health', 'Safety', 'Your plan'];
  const h = s.health || { conditions: [], treatments: [], dxYear: '' };
  const has = (c) => h.conditions.includes(c);
  const progress = `<ol class="steps" aria-label="Setup steps">${steps.map((label, i) =>
    `<li class="${i === s.step ? 'is-current' : i < s.step ? 'is-done' : ''}">${esc(label)}</li>`).join('')}</ol>`;

  let body = '';
  if (s.step === 0) {
    body = `
      <h1>A personal diet trial for IBD</h1>
      <p class="lead">This app guides you through a structured Autoimmune Protocol (AIP) diet trial, one step at a time,
      and shows what changed for you. Logging takes about 15 seconds a day. Your entries never leave this phone.
      It is free, there is nothing to buy, and there are no ads.</p>
      <p class="fairness">This app is not a medical device and does not give medical advice. It helps you run a
      structured test and record what you notice. Decisions about your treatment stay with you and your care team.</p>
      <h2 class="h3">Which condition do you have?</h2>
      <div class="cards">
        ${['CD', 'UC', 'IBDU'].map((id) => `
          <button type="button" class="card-choice${s.condition === id ? ' is-on' : ''}" aria-pressed="${s.condition === id}"
            data-action="setup-condition" data-value="${id}">
            <strong>${esc(CONDITIONS[id].label)}</strong>
            <span>${esc(CONDITION_BLURB[id])}</span>
          </button>`).join('')}
      </div>
      ${s.condition === 'IBDU' ? `
        <p class="hint">You will be asked about your general well-being, belly pain and how many loose stools you
        have had. Those questions come from the Harvey-Bradshaw Index, which was written for Crohn's disease, and
        they are the ones that work whatever kind of IBD you have. The number the app shows you is there to track
        whether things changed for you over the twelve weeks. It is not a diagnosis and it does not decide which
        condition you have.</p>` : ''}
      <div class="actions">
        <button type="button" class="btn primary" data-action="setup-next" ${s.condition ? '' : 'disabled'}>Continue</button>
      </div>
      <p class="small muted center">Just looking? <button type="button" class="linklike" data-action="demo-load" data-value="CD">Explore with simulated demo data</button></p>`;
  } else if (s.step === 1) {
    body = `
      <h1>A few details</h1>
      ${s.condition === 'UC' ? `
        <fieldset class="field">
          <legend>How many bowel movements a day are normal for you when you're well?</legend>
          <p class="hint">Used to score stool frequency: the partial Mayo score counts stools above your normal.</p>
          <div class="stepper">
            <button type="button" class="btn round" data-action="setup-stools" data-delta="-1" aria-label="Fewer stools per day">−</button>
            <output class="stepper-value" aria-live="polite">${s.normalStools}</output>
            <button type="button" class="btn round" data-action="setup-stools" data-delta="1" aria-label="More stools per day">+</button>
          </div>
        </fieldset>` : ''}
      <fieldset class="field">
        <legend>Any food you suspect bothers you? <span class="muted">(optional)</span></legend>
        <p class="hint">It gets tested at the end, like the other foods, even if it is not one of the diet's food groups.
        For example "spicy food" or "fried food".</p>
        <input type="text" class="text" list="suspect-foods" data-input="setup-own-0" value="${esc(s.customTests?.[0] || '')}" placeholder="e.g. spicy food" aria-label="A food you suspect">
        <datalist id="suspect-foods">${CONFIG.suggestedTriggers.map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
        <p class="hint">Others often name: ${esc(CONFIG.suggestedTriggers.slice(0, 6).join(', ').toLowerCase())}.</p>
        ${(s.customTests?.[0] || '').trim() ? `<input type="text" class="text" list="suspect-foods" data-input="setup-own-1" value="${esc(s.customTests?.[1] || '')}" placeholder="Another one (optional)" aria-label="Another food you suspect">` : ''}
      </fieldset>
      <label class="field block">
        <span class="legend">Start date</span>
        <span class="hint">Day 1 of your baseline week. Usually today.</span>
        <input type="date" id="setup-start" value="${esc(s.startDate)}" data-input="setup-start">
      </label>
      <div class="actions">
        <button type="button" class="btn" data-action="setup-back">Back</button>
        <button type="button" class="btn primary" data-action="setup-next">Continue</button>
      </div>`;
  } else if (s.step === 2) {
    const chip = (action, key, label, on) =>
      `<button type="button" class="chip${on ? ' is-on' : ''}" aria-pressed="${on}" data-action="${action}" data-value="${key}">${esc(label)}</button>`;
    body = `
      <h1>Your health</h1>
      <p class="lead">These answers change your plan and your safety tips. They stay on this phone.</p>
      <fieldset class="field">
        <legend>Do any of these apply to you?</legend>
        <p class="hint">Tap all that apply, or none.</p>
        <div class="chips">${Object.entries(CONFIG.healthConditions).map(([k, label]) => chip('setup-health', k, label, has(k))).join('')}</div>
      </fieldset>
      <label class="field block">
        <span class="legend">Year you were diagnosed <span class="muted">(optional)</span></span>
        <input type="number" inputmode="numeric" min="1940" max="2100" data-input="setup-dxyear" value="${esc(h.dxYear || '')}" placeholder="e.g. 2015">
      </label>
      <fieldset class="field">
        <legend>Current IBD treatment <span class="muted">(optional)</span></legend>
        <p class="hint">Tap all that apply. It is shown on your summary for your care team.</p>
        <div class="chips">${Object.entries(CONFIG.treatments).map(([k, label]) => chip('setup-tx', k, label, h.treatments.includes(k))).join('')}</div>
      </fieldset>
      <div class="actions">
        <button type="button" class="btn" data-action="setup-back">Back</button>
        <button type="button" class="btn primary" data-action="setup-next">Continue</button>
      </div>`;
  } else if (s.step === 3) {
    body = `
      <h1>Before you start</h1>
      <ul class="safety">
        <li><strong>This app is for adults</strong> (18 or older).</li>
        <li><strong>Not a medical device.</strong> This app does not diagnose or treat anything and does not give
        medical advice. It records what you log and shows what changed.</li>
        ${has('celiac') ? '<li><strong>Celiac disease:</strong> keep gluten out for good. Your plan skips the gluten test.</li>' : ''}
        ${has('diabetes') ? '<li><strong>Diabetes:</strong> talk to your care team before you start. Cutting grains and sugar can change your blood sugar.</li>' : ''}
        ${has('ostomy') ? '<li><strong>Ostomy or colectomy:</strong> stool counts may not show your disease activity the same way. Read your results with your care team.</li>' : ''}
        <li><strong>Don't change your medications</strong> without your care team. This trial is done alongside your usual treatment.</li>
        <li><strong>If you have a known stricture</strong> (narrowing), talk to your GI team first. In the study, one person with a stricture had a blockage after eating a lot of raw vegetables.</li>
        <li><strong>Taking steroids now or recently, or told your bones are thin?</strong> Ask your care team about calcium and vitamin D before dairy comes out in week 2.</li>
        <li><strong>If your diet is already limited, or you've lost weight,</strong> talk to a dietitian before starting.</li>
        <li><strong>Pregnant, planning a pregnancy, or breastfeeding?</strong> Talk to your care team and a dietitian before you start.</li>
        <li><strong>Seek care right away</strong> for heavy bleeding, fever, or severe pain with vomiting.</li>
      </ul>
      <p class="fairness">${esc(FAIRNESS_LINE)}</p>
      <label class="check">
        <input type="checkbox" data-input="setup-ack" ${s.ack ? 'checked' : ''}>
        <span>I've read this and will involve my care team.</span>
      </label>
      <div class="actions">
        <button type="button" class="btn" data-action="setup-back">Back</button>
        <button type="button" class="btn primary" data-action="setup-next" ${s.ack ? '' : 'disabled'}>Continue</button>
      </div>`;
  } else {
    const bounds = phaseBounds({ startDate: s.startDate, health: h, customTests: ownTests(s) }, CONFIG);
    body = `
      <h1>Your plan</h1>
      <p class="lead">${esc(CONDITIONS[s.condition].label)} · starts ${esc(formatShort(s.startDate))}</p>
      <ol class="plan">
        ${bounds.map((b) => `
          <li class="plan-${b.id}">
            <div class="plan-head"><strong>${esc(b.label)}</strong><span>${b.days} days · ${esc(formatShort(b.start))} – ${esc(formatShort(b.end))}</span></div>
            <p>${esc(b.blurb)}</p>
          </li>`).join('')}
      </ol>
      <p class="small muted">Baseline, elimination and maintenance follow Konijeti et al. 2017 (6-week staged elimination, 5-week maintenance), with a baseline week added so you have a "before".</p>
      <div class="actions">
        <button type="button" class="btn" data-action="setup-back">Back</button>
        <button type="button" class="btn primary" data-action="setup-finish">Start my trial</button>
      </div>`;
  }
  return `<section class="setup">${progress}${body}</section>`;
}
