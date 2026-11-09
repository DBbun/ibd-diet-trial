import { CONFIG } from '../config.js';
import { SIM_RESULTS } from '../sim-results.js';
import { esc } from '../ui.js';
import { FAIRNESS_LINE } from './setup.js';

export function simSection() {
  if (!SIM_RESULTS) {
    return '<p class="muted">The simulation has not been run yet.</p>';
  }
  const r = SIM_RESULTS;
  const pctS = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const rows = r.subgroups.map((g) => `<tr>
    <th scope="row">${esc(g.label)}</th>
    <td class="num">${pctS(g.tpr)}</td><td class="num">${pctS(g.tnr)}</td>
    <td class="num">${pctS(g.insufficient)}</td><td class="num">${pctS(g.improvedAgreement)}</td></tr>`).join('');
  return `
    <p>The app makes two judgments for you: whether a food test is flagged, and whether your score improved between the
    baseline week and the end of maintenance. Both rules were tested on <strong>${r.participants.toLocaleString()} simulated trials</strong>
    where the true answer is known, and compared how well they work across groups. The app should work just as well for
    people who can't log every day, for example in tiring weeks.</p>
    <div class="table-wrap"><table class="compare sim">
      <thead><tr><th>Simulated group</th><th class="num">Real trigger flagged</th><th class="num">Safe food cleared</th><th class="num">Food test: not enough data</th><th class="num">Change shown correctly</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="small muted">Simulated results, not evidence about real people. Run ${esc(r.runDate)}; seed ${esc(r.seed)}.
    Goals set in advance: ${Math.round(r.thresholds.minRate * 100)}% or better for each group, and no gap between groups above
    ${Math.round(r.thresholds.maxGap * 100)} points. ${r.meetsThresholds ? 'All groups met these goals.' : `<strong>Not met:</strong> ${esc(r.gaps.join('; '))}.`}
    Method adapted from Kartoun, Khurshid et al., Sci Rep 2022 (fairness heterogeneity in risk models).</p>
    <p class="small"><strong>What changed because of this test:</strong> People who logged about half of their days often had too few
    entries in their first week. Because of that, ${esc(r.withoutExtension)} of them got no before/after comparison. The app now offers
    one more week to log a baseline, and that dropped to ${esc(r.withExtension)}. For colitis, the 2-question score is less sensitive to
    food reactions than the Crohn's score. A fuller colitis score is planned.</p>`;
}

export function renderAbout(state, ctx = {}) {
  return `
    <h1>About</h1>

    <section class="panel">
      <h2 class="h3">About this protocol</h2>
      <p>The Autoimmune Protocol (AIP) diet takes out some food groups for a while. Then you add them back one at a time
      to see how each one affects you.</p>
      <p>The main study in IBD was published in 2017 (Konijeti et al., <em>Inflammatory Bowel Diseases</em>). It included 15 adults
      with active Crohn's disease or ulcerative colitis. They removed foods in stages for 6 weeks, then stayed on the diet for
      5 more weeks, with a coach. By week 6, 11 of the 15 (73%) had their symptoms calm down (remission). The study was small
      and had no comparison group.</p>
      <p class="fairness">${esc(FAIRNESS_LINE)}</p>
      <p class="small muted">This app adds a baseline week at the start and a food-testing phase at the end. The order of foods
      is a common AIP default. It is not a medical rule.</p>
    </section>

    <section class="panel">
      <h2 class="h3">How the app's rules were tested</h2>
      ${simSection()}
    </section>

    <section class="panel feedback">
      <h2 class="h3">Help improve this app</h2>
      <p>What's missing, confusing, or not right for you? Your feedback is saved on this phone. Tap Share to send it yourself.</p>
      <textarea rows="3" data-input="feedback" placeholder="Your feedback" aria-label="Your feedback">${esc(ctx.feedbackDraft || '')}</textarea>
      <div class="actions left">
        <button type="button" class="btn" data-action="feedback-save">Save</button>
        <button type="button" class="btn primary" data-action="feedback-share">Share feedback</button>
      </div>
      ${(state.feedback || []).length ? `<p class="small muted">${state.feedback.length} saved note${state.feedback.length === 1 ? '' : 's'} will be included when you share.</p>` : ''}
    </section>

    <section class="panel">
      <h2 class="h3">Your privacy</h2>
      <p><strong>Your entries never leave this phone.</strong> They are stored only in this browser. The app sends nothing anywhere,
      uses no analytics, and has no account. It works offline.</p>
      <p>If you choose to share, export your data and send the file yourself.</p>
      <div class="actions left">
        <button type="button" class="btn" data-action="export-csv">Export CSV</button>
        <button type="button" class="btn" data-action="export-json">Export JSON</button>
        <button type="button" class="btn" data-action="export-fhir">Export for health records (FHIR)</button>
      </div>
      <p class="small muted">The FHIR file uses a standard format that health record and research systems can read. Lab results
      use standard lab codes (LOINC). Your symptom answers use this app's own labeled codes, because standard codes don't exist for them.</p>
      <div class="danger-zone">
        <button type="button" class="btn danger" data-action="delete-all">Delete all my data</button>
        <p class="small muted">Removes every entry from this phone. This can't be undone.</p>
      </div>
    </section>

    <details class="panel demo-tools">
      <summary>Demo tools</summary>
      <p class="small muted">For demonstrations only. Simulated data is clearly labeled on every screen.</p>
      <div class="actions left wrap">
        <button type="button" class="btn" data-action="demo-load" data-value="CD">Load demo: Crohn's</button>
        <button type="button" class="btn" data-action="demo-load" data-value="UC">Load demo: ulcerative colitis</button>
        <button type="button" class="btn" data-action="clock" data-value="1">Jump ahead 1 day</button>
        <button type="button" class="btn" data-action="clock" data-value="7">Jump ahead 7 days</button>
        <button type="button" class="btn" data-action="clock" data-value="0">Reset date to today</button>
      </div>
      ${state.clockOffsetDays ? `<p class="small">Date shifted by ${state.clockOffsetDays} day(s).</p>` : ''}
    </details>

    <p class="small muted center">${esc(CONFIG.appName)} · Phase 1 prototype by Uri Kartoun, PhD (DBbun) for the NOURISH Autoimmunity
    Digital Health Challenge. Not a medical device and not medical advice.</p>`;
}
