import { CONFIG } from '../config.js';
import { phaseBounds, phaseOf, trialEnd, testOf } from '../protocol.js';
import { rangeISO, formatShort, addDays, diffDays } from '../dates.js';
import { dailyScore, indexName, usesHBI } from '../scoring.js';
import { esc, demoBanner, labName, labUnit } from '../ui.js';

export function renderTimeline(state, todayISO) {
  const { settings } = state;
  const cond = settings.condition;
  const end0 = todayISO < trialEnd(settings) ? todayISO : trialEnd(settings);
  const end = diffDays(settings.startDate, end0) < 13 ? addDays(settings.startDate, 13) : end0;
  if (todayISO < settings.startDate) {
    return `<h1>Timeline</h1><p class="panel">Your 12 weeks start ${esc(formatShort(settings.startDate))}. Entries will appear here.</p>`;
  }
  const days = rangeISO(settings.startDate, end);
  const recs = days.map((date) => {
    const e = state.entries[date];
    const s = dailyScore(e, settings, state.weekly, CONFIG);
    return { date, e, score: s ? s.score : null, fatigue: e?.fatigue ?? null };
  });

  const W = 360, H = 220, L = 24, R = 24, T = 24, B = 22;
  const n = days.length;
  const x = (i) => L + (n === 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const maxScore = usesHBI(cond) ? Math.max(12, ...recs.map((r) => r.score ?? 0)) : 6;
  const y = (v) => T + (1 - v / maxScore) * (H - T - B);
  const yf = (v) => T + (1 - v / 10) * (H - T - B);
  const idx = (date) => diffDays(settings.startDate, date);

  const bands = phaseBounds(settings, CONFIG).map((b) => {
    if (b.start > end) return '';
    const i0 = idx(b.start);
    const i1 = Math.min(idx(b.end), n - 1);
    const x0 = x(i0) - (i0 === 0 ? 0 : (W - L - R) / (2 * (n - 1)));
    const x1 = x(i1) + (i1 === n - 1 ? 0 : (W - L - R) / (2 * (n - 1)));
    const wBand = Math.max(0, x1 - x0);
    const label = wBand < 44 ? b.label.slice(0, 4) : wBand < 70 ? b.label.slice(0, 7) : b.label;
    return `<rect class="band band-${b.id}" x="${x0}" y="${T}" width="${wBand}" height="${H - T - B}"><title>${esc(b.label)}</title></rect>
      <text class="band-label" x="${x0 + 2}" y="${T - 6}">${esc(label)}</text>`;
  }).join('');

  const segs = (key, yfn) => {
    const out = [];
    let cur = [];
    recs.forEach((r, i) => {
      if (r[key] == null) { if (cur.length) out.push(cur); cur = []; return; }
      cur.push(`${x(i).toFixed(1)},${yfn(r[key]).toFixed(1)}`);
    });
    if (cur.length) out.push(cur);
    return out;
  };

  const scoreLines = segs('score', y).map((s) => `<polyline class="line-score" points="${s.join(' ')}"></polyline>`).join('');
  const fatigueLines = segs('fatigue', yf).map((s) => `<polyline class="line-fatigue" points="${s.join(' ')}"></polyline>`).join('');
  const dots = recs.map((r, i) => (r.score == null ? '' : `<circle class="dot-score" cx="${x(i).toFixed(1)}" cy="${y(r.score).toFixed(1)}" r="1.6"><title>${esc(formatShort(r.date))}: ${r.score}</title></circle>`)).join('');
  const thr = CONFIG.activeThreshold[cond];
  const threshold = `<line class="threshold" x1="${L}" x2="${W - R}" y1="${y(thr)}" y2="${y(thr)}"></line>
    <text class="axis-note" x="${L + 3}" y="${y(thr) - 3}">high ≥ ${thr}</text>`;

  const meds = recs.map((r, i) => (r.e?.med?.change && r.e.med.change !== 'none'
    ? `<g class="mark-med"><line x1="${x(i)}" x2="${x(i)}" y1="${T}" y2="${H - B}"></line><text x="${x(i) + 3}" y="${H - B - 6}">Rx</text><title>${esc(formatShort(r.date))}: medication ${esc(r.e.med.change)} ${esc(r.e.med.drug)}</title></g>` : '')).join('');
  const rough = recs.map((r, i) => (r.e?.rough
    ? `<g class="mark-rough"><path d="M${x(i)} ${H - B - 2} l3.5 -6 l3.5 6 z" transform="translate(-3.5 0)"></path><title>${esc(formatShort(r.date))}: rough day</title></g>` : '')).join('');
  const labs = state.labs.filter((l) => l.date >= settings.startDate && l.date <= end).map((l) => {
    const i = idx(l.date);
    return `<g class="mark-lab"><path d="M${x(i)} ${T + 4} l4 5 l-4 5 l-4 -5 z"></path><title>${esc(formatShort(l.date))}: ${esc(labName(l))} ${esc(l.value)} ${esc(labUnit(l))}</title></g>`;
  }).join('');
  const tests = recs.map((r, i) => {
    const t = testOf(settings, r.date, CONFIG);
    return t && t.cycleDay === 1 ? `<g class="test-mark"><line x1="${x(i)}" x2="${x(i)}" y1="${H - B}" y2="${H - B + 4}"></line><title>Test: ${esc(t.food.label)}</title></g>` : '';
  }).join('');

  const yTicks = (usesHBI(cond) ? [0, 4, 8, 12] : [0, 2, 4, 6]).filter((v) => v <= maxScore)
    .map((v) => `<text class="tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join('');
  const fTicks = [0, 5, 10].map((v) => `<text class="tick tick-f" x="${W - R + 6}" y="${yf(v) + 4}">${v}</text>`).join('');
  const xTicks = [[0, 'start'], [n - 1, 'end']].map(([i, anchor]) => `<text class="tick" x="${x(i)}" y="${H - B + 14}" text-anchor="${anchor}">${esc(formatShort(days[i]))}</text>`).join('');

  const svg = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(indexName(cond))} and fatigue over the 12 weeks">
    ${bands}${threshold}${yTicks}${fTicks}${xTicks}${fatigueLines}${scoreLines}${dots}${meds}${labs}${tests}${rough}
  </svg>`;

  const logged = recs.filter((r) => r.e).reverse().slice(0, 21);
  const rows = logged.map((r) => {
    const bits = [];
    if (r.e.rough) bits.push('rough day');
    if (r.e.tested) { const t = testOf(settings, r.date, CONFIG); if (t) bits.push(`tested ${t.food.label.toLowerCase()}`); }
    if (r.e.offFoods?.length) bits.push(`off-protocol: ${r.e.offFoods.map((f) => (CONFIG.foods[f]?.label || f).toLowerCase()).join(', ')}`);
    if (r.e.med?.change && r.e.med.change !== 'none') bits.push(`medication ${r.e.med.change}${r.e.med.drug ? `: ${r.e.med.drug}` : ''}`);
    if (r.e.factors?.length) bits.push(r.e.factors.map((f) => (CONFIG.factors[f] || f).toLowerCase()).join(', '));
    if (r.e.note) bits.push(`“${r.e.note}”`);
    return `<tr><td><button type="button" class="linklike" data-action="open-day" data-value="${r.date}">${esc(formatShort(r.date))}</button></td>
<td class="num">${r.score ?? '–'}</td><td class="num">${r.fatigue ?? '–'}</td><td class="small">${esc(bits.join(' · '))}</td></tr>`;
  }).join('');

  const loggedCount = recs.filter((r) => r.e).length;
  return `
    ${demoBanner(settings)}
    <h1>Timeline</h1>
    <p class="muted">${loggedCount} of ${Math.min(n, idx(todayISO) + 1)} ${Math.min(n, idx(todayISO) + 1) === 1 ? 'day' : 'days'} logged. Gaps are days not logged; nothing is filled in.</p>
    <div class="panel chart-wrap">${svg}
      <ul class="legend">
        <li><span class="key key-score"></span>${esc(indexName(cond))} (left axis)</li>
        <li><span class="key key-fatigue"></span>Fatigue 0–10 (right axis)</li>
        <li><span class="key key-lab"></span>Lab result</li>
        <li><span class="key key-med"></span>Medication change</li>
        <li><span class="key key-rough"></span>Rough day</li>
      </ul>
    </div>
    <h2 class="h3">Recent entries</h2>
    <div class="table-wrap"><table class="entries">
      <thead><tr><th>Date</th><th class="num">Score</th><th class="num">Fatigue</th><th>Details</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">No entries yet.</td></tr>'}</tbody>
    </table></div>`;
}
