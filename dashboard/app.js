// Token Radar dashboard (radar-5). No network: all data comes from data.js (window.RADAR).
//
// The value model, stated here so the page recomputes every row it shows (the recompute check
// in the detail view) and so a reader can verify the board from the snapshot alone:
//
//   curve(TVL) = 10^(intercept + slope x log10(TVL))
//     The size curve, fitted by ordinary least squares on the 92 live-token comparables,
//     each market cap winsorised at the 90th percentile of market-cap/TVL. The intercept and
//     slope are fitted from the snapshot at run time; they are not constants the author chose.
//   implied = curve(TVL) x growthMult x maturityMult x chainMult
//     growthMult   = 1 + clamp(change_7d, -60, 120)/100 x 0.5
//     maturityMult = 0.6 + min(age_days, 1095)/1095 x 0.4 (age unknown: 365)
//     chainMult    = min(1.12, 1 + 0.03 x (chains - 1))
//
// The farm economics, computed by the model (lib/model.ts) for every row: a $1,000 slice of
// a 10% airdrop of the implied value, minus all-in fees (four transactions on the plan's
// cheapest chain, plus one bridge when that chain is not Ethereum), minus the 4% T-bill yield
// the capital gives up over the hold. The verdict follows the net, not the value: FARM when
// the slice beats every cost, THIN when it beats the fees but not the T-bill, SKIP otherwise.
// The detail view recomputes the net from the row's own figures and shows it at 5%, 10% and
// 20% airdrop shares. The plan the detail view shows is the model's own text, not a slogan:
// the page only renders it.

const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const fmt$ = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + Math.round(n);
const fmtTvl = (n) => fmt$(n);
const fmtPct = (n) => n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%';
const fmtAge = (n) => n === null || n === undefined ? '—' : n >= 365 ? (n / 365).toFixed(1) + 'y' : n + 'd';
const fmtMoney = (n) => (n < 0 ? '−$' : n > 0 ? '+$' : '$') + Math.abs(n).toFixed(2);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Recompute one row's implied value from its own figures and the fitted curve. */
function recompute(row) {
  const curve = Math.pow(10, R.curve.intercept + R.curve.slope * Math.log10(row.tvl_usd));
  const growth = Math.min(120, Math.max(-60, row.change_7d ?? 0));
  const gm = 1 + (growth / 100) * 0.5;
  const age = row.age_days ?? 365;
  const mm = 0.6 + (Math.min(Math.max(age, 0), 1095) / 1095) * 0.4;
  const cm = Math.min(1.12, 1 + 0.03 * (row.chains.length - 1));
  return Math.max(1, Math.round(curve * gm * mm * cm));
}

// ---- header, model panel, validation stats
$('meta').innerHTML =
  `<b>${R.board_size}</b> rows &middot; <b>${R.watchlist_size}/${R.watchlist_size}</b> watchlist &middot; ` +
  `<b>${R.audited_size}</b> pre-token audited &middot; <b>${R.validation.comparables}</b> comparables<br>` +
  `Snapshot ${esc(R.as_of)} &middot; floor ${fmt$(R.floor_usd)} &middot; model ${esc(R.model_version)}`;
$('curve').innerHTML =
  `Implied value = 10<sup>(${R.curve.intercept.toFixed(4)} + ${R.curve.slope.toFixed(4)} &times; log<sub>10</sub>(TVL))</sup> &times; ` +
  `growth &times; maturity &times; chains. The curve is fitted on the ${R.validation.comparables} tokens that already trade; ` +
  `R&sup2; ${R.curve.r2.toFixed(4)}, residual sd ${R.curve.residual_sd.toFixed(4)} in log<sub>10</sub>.`;
const v = R.validation;
// Best net per watchlist hour: the most the board pays for an hour of farming, watchlist only.
const wlSet0 = new Set(R.watchlist);
const bestHour = [...R.rows].filter((r) => wlSet0.has(r.slug) && r.verdict === 'FARM')
  .sort((a, b) => b.net_per_hour_usd - a.net_per_hour_usd)[0];
$('stats').innerHTML = [
  ['&times;' + v.loo_median_factor, 'leave-one-out median error'],
  [(v.loo_within_2x * 100).toFixed(0) + '%', 'of comparables predicted within 2&times;'],
  ['&times;' + v.time_split_median_factor, `blind out-of-sample test — time-split (${v.time_split_train} older fit, ${v.time_split_test} newer tested, never seen by the fit)`],
  ['&times;' + v.blind_split_median_factor, `blind out-of-sample test — random 80/20 split (${v.blind_split_train} fit, ${v.blind_split_test} tested, never seen by the fit)`],
  [v.bootstrap_slope_low + ' – ' + v.bootstrap_slope_high, 'bootstrap slope, 5th–95th pct (' + R.model.bootstrap_resamples + ' resamples)'],
  ['&times;' + v.pipeline_loo_median_factor, 'full-pipeline leave-one-out median error — curve × multipliers (' + v.comparables + ' comparables)'],
  [bestHour ? fmtMoney(bestHour.net_per_hour_usd) + '/h' : '—', bestHour ? `best net per watchlist hour — ${bestHour.name}, net ${fmtMoney(bestHour.net_usd)} in ${bestHour.work_hours}h` : 'best net per watchlist hour'],
].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
$('source').textContent = R.source;

// ---- size curve chart: comparables as dots, fitted line
(function chart() {
  const svg = $('chart');
  const W = 640, H = 360, L = 52, B = 34, T = 12, Rt = 14;
  const pts = R.comps.map((c) => ({ x: Math.log10(c.tvl_usd), y: Math.log10(c.mcap_usd) }));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  const yLine = (x) => R.curve.intercept + R.curve.slope * x;
  // Typical-error band: the fitted line ± log10 of the curve's leave-one-out median
  // error (×2.89). About half the comparables land inside it by construction; a dot
  // outside it is a protocol the curve cannot price. The 95% band (line ± 1.96 ×
  // residual sd) is ×28 either way — too wide to draw, and that is itself the point:
  // the curve locates the order of magnitude, not the price.
  const band = Math.log10(R.validation.loo_median_factor);
  const y0 = Math.floor(Math.min(...ys, yLine(x0), yLine(x1), yLine(x0) - band, yLine(x1) - band)), y1 = Math.ceil(Math.max(...ys, yLine(x0), yLine(x1), yLine(x0) + band, yLine(x1) + band));
  const X = (x) => L + ((x - x0) / (x1 - x0)) * (W - L - Rt);
  const Y = (y) => H - B - ((y - y0) / (y1 - y0)) * (H - T - B);
  let s = '';
  for (let g = Math.ceil(y0); g <= y1; g++) s += `<line x1="${L}" y1="${Y(g)}" x2="${W - Rt}" y2="${Y(g)}" stroke="#1d2a3f"/><text x="${L - 6}" y="${Y(g) + 4}" fill="#93a3b8" font-size="10" text-anchor="end">${g}</text>`;
  for (let g = Math.ceil(x0); g <= x1; g++) s += `<text x="${X(g)}" y="${H - 10}" fill="#93a3b8" font-size="10" text-anchor="middle">${g}</text>`;
  s += `<text x="${L}" y="${H - 10}" fill="#93a3b8" font-size="10"></text>`;
  s += `<polygon points="${X(x0)},${Y(yLine(x0) + band)} ${X(x1)},${Y(yLine(x1) + band)} ${X(x1)},${Y(yLine(x1) - band)} ${X(x0)},${Y(yLine(x0) - band)}" fill="#5aa9ff" opacity="0.14"/>`;
  s += `<line x1="${X(x0)}" y1="${Y(yLine(x0))}" x2="${X(x1)}" y2="${Y(yLine(x1))}" stroke="#f5b83d" stroke-width="2"/>`;
  for (const p of pts) s += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3" fill="#5aa9ff" opacity="0.75"/>`;
  s += `<text x="${L}" y="${T + 4}" fill="#93a3b8" font-size="11">log10 market cap</text><text x="${W - Rt}" y="${H - 10}" fill="#93a3b8" font-size="11" text-anchor="end">log10 TVL</text>`;
  svg.innerHTML = s;
})();

// ---- filters
const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
for (const c of cats) $('cat').insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`);
for (const c of chains) $('chain').insertAdjacentHTML('beforeend', `<option>${esc(c)}</option>`);

// ---- board table
let sortKey = 'rank', sortDir = 1;
function filtered() {
  const q = $('q').value.trim().toLowerCase();
  const cat = $('cat').value, chain = $('chain').value, ver = $('verdict').value, wl = $('wl').checked;
  const wlSet = new Set(R.watchlist);
  return R.rows.filter((r) => {
    if (q && !(r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q))) return false;
    if (cat && r.category !== cat) return false;
    if (chain && !r.chains.includes(chain)) return false;
    if (ver && r.verdict !== ver) return false;
    if (wl && !wlSet.has(r.slug)) return false;
    return true;
  });
}
// ---- board table
function render() {
  let rows = filtered();
  rows = [...rows].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return (av < bv ? -1 : av > bv ? 1 : a.rank - b.rank) * sortDir;
  });
  $('count').textContent = rows.length + ' of ' + R.rows.length + ' rows';
  $('rows').innerHTML = rows.map((r) => `<tr data-slug="${esc(r.slug)}">
    <td>${r.rank}</td>
    <td><span class="nm">${esc(r.name)}</span><span class="sl">${esc(r.slug)}</span></td>
    <td class="num">${fmtTvl(r.tvl_usd)}</td>
    <td class="num">${fmtPct(r.change_7d)}</td>
    <td class="num">${fmtAge(r.age_days)}</td>
    <td class="num"><b>${fmt$(r.implied_value_usd)}</b></td>
    <td class="num">$${r.slice_usd.toFixed(2)}</td>
    <td class="num"><b>${fmtMoney(r.net_usd)}</b></td>
    <td><span class="v ${r.verdict}">${r.verdict}</span></td>
    <td class="num">$${r.fees_usd.toFixed(2)}</td>
    <td class="num">${r.hold_days}d</td>
    <td class="num">${r.work_hours}h</td>
  </tr>`).join('');
  for (const tr of document.querySelectorAll('#rows tr')) tr.addEventListener('click', () => openDetail(tr.dataset.slug));
}
document.querySelectorAll('#board th').forEach((th) => th.addEventListener('click', () => {
  const k = th.dataset.k;
  if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = 1; }
  render();
}));
['q', 'cat', 'chain', 'verdict', 'wl'].forEach((id) => $(id).addEventListener('input', render));

// ---- live token tab
$('live-rows').innerHTML = R.live.map((p) => `<tr>
  <td><span class="nm">${esc(p.name)}</span><span class="sl">${esc(p.slug)}</span></td>
  <td>${esc(p.category ?? '—')}</td><td>${esc(p.chains.slice(0, 3).join(', '))}</td>
  <td class="num">${fmtTvl(p.tvl_usd)}</td><td class="num"><b>${p.mcap_usd === null ? '—' : fmt$(p.mcap_usd)}</b></td>
  <td class="num">${fmtPct(p.change_7d)}</td></tr>`).join('');
function showTab(which) {
  $('tab-board').classList.toggle('active', which === 'board');
  $('tab-live').classList.toggle('active', which === 'live');
  $('board').hidden = which !== 'board';
  $('live').hidden = which !== 'live';
  $('filters').style.display = which === 'board' ? '' : 'none';
}
$('tab-board').addEventListener('click', () => showTab('board'));
$('tab-live').addEventListener('click', () => showTab('live'));

// ---- detail view: model breakdown, recompute check, farm plan
function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const again = recompute(r);
  const ok = again === r.implied_value_usd;
  const curve = Math.pow(10, R.curve.intercept + R.curve.slope * Math.log10(r.tvl_usd));
  // Net recompute: slice minus fees minus T-bill, from the row's own figures.
  const netAgain = Math.round((r.slice_usd - r.fees_usd - r.tbill_usd) * 100) / 100;
  const netOk = Math.abs(netAgain - r.net_usd) <= 0.011;
  // Net at other airdrop shares and capitals: fees are flat, the T-bill scales with capital.
  const netAt = (cap, share) => {
    const s = (cap / (r.tvl_usd + cap)) * share * r.implied_value_usd;
    return s - r.fees_usd - cap * R.model.tbill_annual * (r.hold_days / 365);
  };
  const netAtRow = (share) => [1000, 10000, 100000].map((c) => `<td class="num">${fmtMoney(Math.round(netAt(c, share) * 100) / 100)}</td>`).join('');
  $('detail-body').innerHTML = `
    <h2>${esc(r.name)}</h2>
    <p class="k">${esc(r.slug)} &middot; ${esc(r.category ?? 'no category')} &middot; ${esc(r.chains.join(', '))} &middot; rank ${r.rank} &middot; <span class="v ${r.verdict}">${r.verdict}</span></p>
    <h3>Model breakdown</h3>
    <div class="kv">
      <div><span>TVL</span><b>${fmtTvl(r.tvl_usd)}</b></div>
      <div><span>7-day change</span><b>${fmtPct(r.change_7d)}</b></div>
      <div><span>Age</span><b>${fmtAge(r.age_days)}</b></div>
      <div><span>Curve value</span><b>${fmt$(Math.round(curve))}</b></div>
      <div><span>Growth &times;</span><b>${r.growth_multiplier}</b></div>
      <div><span>Maturity &times;</span><b>${r.maturity_multiplier}</b></div>
      <div><span>Chains &times;</span><b>${r.chain_multiplier}</b></div>
      <div><span>Implied value</span><b>${fmt$(r.implied_value_usd)}</b></div>
    </div>
    <p class="k">Recompute check: the page recomputes the value from the snapshot's own figures and the
    fitted curve and gets ${fmt$(again)} — ${ok ? 'matches the board' : 'DOES NOT match the board'}.</p>
    <h3>Farm economics — netted to the dollar</h3>
    <div class="kv">
      <div><span>$1,000 slice (10% airdrop)</span><b>$${r.slice_usd.toFixed(2)}</b></div>
      <div><span>Fees — 4 txs on ${esc(r.plan_chain)}</span><b>$${r.fees_usd.toFixed(2)}</b></div>
      <div><span>T-bill given up (4% over ${r.hold_days}d)</span><b>$${r.tbill_usd.toFixed(2)}</b></div>
      <div><span>Net</span><b>${fmtMoney(r.net_usd)}</b></div>
      <div><span>Work</span><b>${r.work_hours}h</b></div>
      <div><span>Net per hour</span><b>${fmtMoney(r.net_per_hour_usd)}/h</b></div>
      <div><span>Pays from</span><b>${r.pays_from_usd === null ? 'never — the slice rate cannot beat the T-bill rate' : '$' + r.pays_from_usd.toLocaleString('en-US') + ' minimum'}</b></div>
    </div>
    <p class="k">Net at other airdrop shares and capitals — the verdict above is the 10% / $1,000 cell.
    Fees are flat; the T-bill scales with capital, so a bigger position is not a bigger net.</p>
    <table class="netat"><thead><tr><th>airdrop share</th><th>$1,000</th><th>$10,000</th><th>$100,000</th></tr></thead><tbody>
      <tr><td>5%</td>${netAtRow(0.05)}</tr>
      <tr><td>10%</td>${netAtRow(0.10)}</tr>
      <tr><td>20%</td>${netAtRow(0.20)}</tr>
    </tbody></table>
    <p class="k">Net recompute check: the page recomputes the net from the row's own figures (slice
    $${r.slice_usd.toFixed(2)} − fees $${r.fees_usd.toFixed(2)} − T-bill $${r.tbill_usd.toFixed(2)}) and gets
    ${fmtMoney(netAgain)} — ${netOk ? 'matches the board' : 'DOES NOT match the board'}.</p>
    <p class="k">Pre-token means this protocol's DefiLlama record carries no token. That is the record,
    not proof it has none.</p>
    <h3>Farm plan — netted to the dollar</h3>
    <ol class="steps">${r.farm_steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
  $('detail').showModal();
}
render();

// ---- deep-linking via URL params (default behaviour unchanged when no params):
//   ?view=board                            — the full board (default)
//   ?view=detail&row=<name|slug|rank>      — board + detail modal open on that row
//   ?view=filtered&verdict=FARM|THIN|SKIP — board pre-filtered to that verdict
// Unknown views/values fall back to the plain board. Guarded so non-browser
// runtimes without `location` (Node/vm smoke test) run exactly as before.
(function deepLink() {
  let search = '';
  try {
    if (typeof location === 'undefined' || !location.search) return;
    search = location.search;
  } catch (e) { return; }
  // Minimal query parser (no URLSearchParams dependency — works in any JS runtime).
  const params = {};
  search.replace(/^\?/, '').split('&').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i < 0) return;
    try { params[pair.slice(0, i).toLowerCase()] = decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' ')); } catch (e) { /* bad encoding: ignore */ }
  });
  const view = (params.view || 'board').toLowerCase();
  // Scroll the board table into view when asked (?scroll=board): a link straight to the
  // rows, for screenshots and for readers who want the board first. Runs after render,
  // so the table is populated before the scroll.
  const maybeScroll = () => {
    if ((params.scroll || '').toLowerCase() !== 'board') return;
    const t = document.getElementById('board');
    if (t && typeof t.scrollIntoView === 'function') t.scrollIntoView();
  };
  if (view === 'filtered') {
    const v = (params.verdict || '').toUpperCase();
    if (['FARM', 'THIN', 'SKIP'].includes(v)) { $('verdict').value = v; render(); }
    maybeScroll();
    return;
  }
  if (view === 'detail') {
    const q = (params.row || '').trim().toLowerCase();
    if (!q) return;
    const row = (/^\d+$/.test(q) ? R.rows.find((x) => String(x.rank) === q) : null)
      || R.rows.find((x) => x.slug.toLowerCase() === q || x.name.toLowerCase() === q)
      || R.rows.find((x) => x.name.toLowerCase().includes(q));
    if (row) openDetail(row.slug);
    return;
  }
  // 'board' and anything unknown: default board. Scroll to the table when asked.
  maybeScroll();
})();
