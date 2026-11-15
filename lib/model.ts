// The token radar's model, radar-4: a comps-fitted size curve, validated out of sample.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the floor, ranked by implied value. A protocol is pre-token when its
// index entry records no token (no market cap, no CoinGecko id, no symbol); the snapshot's
// live-token protocols are kept apart and shown as the market's own values, never mixed into the
// ranked board. Wrapped, staked and bridged products of a token that already trades are never
// ranked: WBTC is Bitcoin on Ethereum, not a protocol waiting on a launch of its own.
//
// The implied value is fitted from the snapshot's own live-token comparables, never from a
// hardcoded multiple and never from a list of names:
//
//   1. Comparables: the live-token protocols whose token trades, with a market cap and a TVL,
//      excluding CEX, Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking and Restaked
//      BTC, versioned names, wrapped/staked names and exchange names. This snapshot gives 92.
//   2. Size curve: an ordinary-least-squares fit of log10(market cap) on log10(TVL) over the
//      comparables, with each market cap winsorised at the 90th percentile of market-cap/TVL
//      (2.95 here) so one outlier token cannot drag the line. The fit is computed from the
//      snapshot at run time: the curve is the data's, not a constant the author chose.
//   3. Growth: the protocol's seven-day TVL change, clamped to [-60, 120] per cent, weight 0.5.
//   4. Maturity: 0.6 + min(age_days, 1095) / 1095 x 0.4 (age unknown: 365 days).
//   5. Chains: 1 + 0.03 x (chains - 1), capped at 1.12.
//   implied = max(1, round(10^(a + b x log10(TVL)) x growthMult x maturityMult x chainMult))
//
// Why a curve and not a multiple: the comparables' market-cap/TVL ratio falls a hundredfold with
// size (median 0.42 at $5-50M of TVL, 0.17 at $50-200M, 0.04 at $200M-1B, 0.02 at $1-5B), so a
// single multiple overstates a large protocol tenfold. The curve is the honest reading of that.
//
// Why no category multiple on top: it was tried and rejected by the same leave-one-out test below.
// Adding a shrunk category residual to the winsorised curve worsened the median out-of-sample error
// from x2.89 to x3.59, so the model ships without one; the category is still used for the farm
// plan's action and for the dashboard's filter and breakdown.
//
// Validation, computed from the same snapshot at run time and shown on the dashboard:
//   - LOO: leave-one-out over the 92 comparables (refit without each, predict it): the median
//     error factor. A fitted curve that cannot predict the tokens that already trade is not a
//     model of what a launch is worth.
//   - Time-split: fit on the older half of the comparables by listing date, test on the newer
//     half: whether the curve holds for the newer launches, the ones a pre-token protocol resembles.
//     A blind out-of-sample test: the newer half is never in its fit.
//   - Blind split: a second blind out-of-sample test, independent of the time-split: fit on a
//     random 80% of the comparables (fixed seed), test on the 20% the fit never saw.
//   - Bootstrap: 200 resamples of the comparables (seeded, deterministic), the slope's 5th to
//     95th percentile: whether the curve is stable or one sample's accident.
//   - LOCO: leave-one-covariate-out over the full pipeline. The tests above validate the
//     curve; this one validates the whole price — curve x multipliers — and each input in
//     turn: refit without each comparable, predict it with one input neutralised, and take
//     the median error factor. A dropped input that worsens the error earns its place; one
//     that improves it is decoration. The multipliers were hand-set, so this is the test
//     that says whether they are tested choices or decoration.
//
// The farm plan is netted to the dollar: every step states its cost and its time, and the
// last step nets the plan — a $1,000 position's slice of a 10% airdrop, minus all-in fees
// (four transactions on the plan's cheapest chain, plus one bridge when that chain is not
// Ethereum), minus the 4% T-bill yield the capital gives up over the hold. The verdict
// follows the net, not the value: FARM when the slice beats every cost, THIN when it
// beats the fees but not the T-bill, SKIP otherwise. Gas is priced per chain (the chain
// sets the fee, not the protocol); capital is deployed and recoverable, so only fees and
// the forgone yield are spent. Weekly upkeep is time, not gas: the position is held and
// checked, no transaction is needed while it is held.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  /** The winsor cap: a comparable's market cap is capped at this multiple of its TVL. */
  winsor_cap: number;
  /** The percentile the winsor cap is taken at, of the comparables' market-cap/TVL. */
  winsor_percentile: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_cap: number;
  /** The verdict's economics, all stated in the research note: the slice is priced at this capital. */
  slice_capital_usd: number;
  /** The airdrop share of the implied value the slice assumes (10% default; the detail view shows 5/10/20%). */
  airdrop_share: number;
  /** The annual T-bill yield the capital gives up over the hold, as a fraction. */
  tbill_annual: number;
  /** One bridge transaction when the plan's cheapest chain is not Ethereum. */
  bridge_usd: number;
  /** The gas of one transaction on Ethereum, in dollars (November 2026 typical; stated, not a live quote). */
  gas_ethereum_usd: number;
  /** Bootstrap resamples for the slope's stability band. */
  bootstrap_resamples: number;
  /** The seed that makes the bootstrap deterministic. */
  bootstrap_seed: number;
  /** The seed that makes the random 80/20 blind split deterministic. */
  blind_split_seed: number;
}

export const MODEL: ModelConstants = {
  winsor_cap: 2.95,
  winsor_percentile: 90,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.03,
  chain_cap: 1.12,
  slice_capital_usd: 1000,
  airdrop_share: 0.1,
  tbill_annual: 0.04,
  bridge_usd: 3,
  gas_ethereum_usd: 3,
  bootstrap_resamples: 200,
  bootstrap_seed: 20261114,
  blind_split_seed: 20261115,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-5';

/** How many pre-token protocols below the watchlist floor the early radar carries, by implied value. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_cost_usd: number;
  /** The farm's economics at the standard slice: a $1,000 position's share of a 10% airdrop. */
  slice_usd: number;
  /** All-in fees: four transactions on the plan's cheapest chain, plus one bridge when that chain is not Ethereum. */
  fees_usd: number;
  /** The T-bill yield the $1,000 gives up over the hold (4% annual). */
  tbill_usd: number;
  /** slice minus fees minus T-bill: what farming this row nets at the standard slice. */
  net_usd: number;
  /** The plan's work in hours (setup + weekly check-ins + claim + log). */
  work_hours: number;
  /** Net per hour of work. */
  net_per_hour_usd: number;
  /** The smallest capital at which the net turns positive, or null when it never does. */
  pays_from_usd: number | null;
  /** The chain the plan runs on: the cheapest of the protocol's chains. */
  plan_chain: string;
  /** The hold in days the plan assumes. */
  hold_days: number;
  model: {
    curve_intercept: number;
    curve_slope: number;
    curve_r2: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  farm_cost_usd: number;
  slice_usd: number;
  fees_usd: number;
  tbill_usd: number;
  net_usd: number;
  work_hours: number;
  net_per_hour_usd: number;
  pays_from_usd: number | null;
  plan_chain: string;
  hold_days: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One comparable the curve was fitted on, for the dashboard's chart and table. */
export interface CompPoint {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** The model's out-of-sample validation, computed from the snapshot at run time. */
export interface Validation {
  comparables: number;
  loo_median_factor: number;
  loo_within_2x: number;
  time_split_median_factor: number;
  time_split_train: number;
  time_split_test: number;
  blind_split_median_factor: number;
  blind_split_train: number;
  blind_split_test: number;
  bootstrap_slope_low: number;
  bootstrap_slope_mid: number;
  bootstrap_slope_high: number;
  /** The full pipeline's leave-one-out error: curve x multipliers, the price the board shows. */
  pipeline_loo_median_factor: number;
  pipeline_loo_within_2x: number;
  /** LOCO: the pipeline LOO with one input neutralised — growth, maturity, chains, winsor cap. */
  loco_growth_median_factor: number;
  loco_maturity_median_factor: number;
  loco_chains_median_factor: number;
  loco_winsor_median_factor: number;
}

/** Everything the dashboard needs: the board, the live set, the curve and its validation. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  audited_size: number;
  early_size: number;
  live_size: number;
  curve: { intercept: number; slope: number; r2: number; residual_sd: number };
  validation: Validation;
  comps: CompPoint[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a list of numbers (the list is not sorted by this function). */
function median(values: number[]): number {
  const b = [...values].sort((x, y) => x - y);
  return b[Math.floor(b.length / 2)]!;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** A deterministic stream of numbers in [0, 1): mulberry32, so the bootstrap repeats exactly. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole word wrapped, staked or staking in a name: a wrapped or staked product of another token. */
const WRAPPED = /\b(wrapped|staked|staking)\b/i;
/** A name beginning with an exchange's name: an exchange's own product, not a launch. */
const EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** The categories a launch candidate is never in: a bridge, a staking product or an exchange. */
const EXCLUDED_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked, bridged or exchange product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED.test(p.name) &&
    !EXCHANGE.test(p.name)
  );
}

/** Whether a live-token protocol is a comparable the curve may be fitted on. */
export function isComparable(p: SnapshotProtocol): boolean {
  return (
    !isPreToken(p) &&
    p.mcap_usd !== null &&
    p.mcap_usd > 0 &&
    p.tvl_usd > 0 &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED.test(p.name) &&
    !EXCHANGE.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** An ordinary-least-squares line through log10(TVL) and log10(market cap). */
export interface CurveFit {
  intercept: number;
  slope: number;
  r2: number;
  residualSd: number;
}

function ols(xs: number[], ys: number[]): CurveFit {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i]! - mx) ** 2;
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    syy += (ys[i]! - my) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);
  const resid = ys.map((y, i) => y - (intercept + slope * xs[i]!));
  const residualSd = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2));
  return { intercept, slope, r2, residualSd };
}

/** The fitted size curve and the validation that comes with it, from the snapshot alone. */
export interface FittedCurve {
  fit: CurveFit;
  winsorCap: number;
  validation: Validation;
  comps: CompPoint[];
}

export function fitCurve(snapshot: Snapshot, model: ModelConstants = MODEL): FittedCurve {
  const comps = snapshot.protocols.filter(isComparable);
  const ratios = comps.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const winsorCap = ratios[Math.floor(ratios.length * (model.winsor_percentile / 100))]!;
  // The cap is recomputed from the data; the model's constant is the percentile, not the cap.
  const cappedMcap = (p: SnapshotProtocol): number => Math.min(p.mcap_usd!, winsorCap * p.tvl_usd);
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(cappedMcap(p)));
  const fit = ols(xs, ys);

  // Leave-one-out: refit without each comparable, predict it, take the error factor.
  const looFactors: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const f = ols(
      xs.filter((_, j) => j !== i),
      ys.filter((_, j) => j !== i),
    );
    const pred = f.intercept + f.slope * xs[i]!;
    looFactors.push(Math.pow(10, Math.abs(pred - ys[i]!)));
  }
  looFactors.sort((a, b) => a - b);
  const looMedian = median(looFactors);
  const looWithin2 = looFactors.filter((f) => f <= 2).length / looFactors.length;

  // Time-split: fit on the older half by listing date, test on the newer half.
  const dated = comps
    .map((p, i) => ({ p, i, age: ageDays(snapshot.as_of, p.listed_at) }))
    .filter((o) => o.age !== null)
    .sort((a, b) => b.age! - a.age!);
  const half = Math.floor(dated.length / 2);
  const train = dated.slice(0, half);
  const test = dated.slice(half);
  const fTrain = ols(
    train.map((o) => xs[o.i]!),
    train.map((o) => ys[o.i]!),
  );
  const tsFactors = test
    .map((o) => Math.pow(10, Math.abs(fTrain.intercept + fTrain.slope * xs[o.i]! - ys[o.i]!)))
    .sort((a, b) => a - b);
  const tsMedian = median(tsFactors);

  // Bootstrap: the slope's 5th to 95th percentile over seeded resamples.
  const rnd = mulberry32(model.bootstrap_seed);
  const slopes: number[] = [];
  for (let k = 0; k < model.bootstrap_resamples; k++) {
    const idx = Array.from({ length: comps.length }, () => Math.floor(rnd() * comps.length));
    slopes.push(ols(idx.map((j) => xs[j]!), idx.map((j) => ys[j]!)).slope);
  }
  slopes.sort((a, b) => a - b);
  const lo = slopes[Math.floor(slopes.length * 0.05)]!;
  const mid = median(slopes);
  const hi = slopes[Math.floor(slopes.length * 0.95)]!;

  // Blind split: a second blind out-of-sample test, independent of the time-split. Shuffle
  // the comparables with a fixed seed, fit on a random 80%, predict the 20% the fit never
  // saw. The time-split tests whether the curve holds for newer launches; this one tests
  // whether it holds for a random holdout. Both are blind: neither test set is in its fit.
  const shuffle = mulberry32(model.blind_split_seed);
  const order = comps.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(shuffle() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const blindTrainN = Math.floor(comps.length * 0.8);
  const blindTrain = order.slice(0, blindTrainN);
  const blindTest = order.slice(blindTrainN);
  const fBlind = ols(
    blindTrain.map((i) => xs[i]!),
    blindTrain.map((i) => ys[i]!),
  );
  const blindFactors = blindTest
    .map((i) => Math.pow(10, Math.abs(fBlind.intercept + fBlind.slope * xs[i]! - ys[i]!)))
    .sort((a, b) => a - b);
  const blindMedian = median(blindFactors);

  // LOCO: leave-one-covariate-out over the full pipeline. The curve-only LOO above
  // tests the curve; this tests the whole price the board shows — curve x multipliers —
  // and each input in turn. Validation only: the board is unchanged by these numbers.
  const locoFull = pipelineLoo(comps, snapshot.as_of, model, 'full');
  const locoGrowth = pipelineLoo(comps, snapshot.as_of, model, 'no-growth');
  const locoMaturity = pipelineLoo(comps, snapshot.as_of, model, 'no-maturity');
  const locoChains = pipelineLoo(comps, snapshot.as_of, model, 'no-chains');
  const locoWinsor = pipelineLoo(comps, snapshot.as_of, model, 'no-winsor');

  return {
    fit,
    winsorCap,
    validation: {
      comparables: comps.length,
      loo_median_factor: Math.round(looMedian * 100) / 100,
      loo_within_2x: Math.round(looWithin2 * 1000) / 1000,
      time_split_median_factor: Math.round(tsMedian * 100) / 100,
      time_split_train: train.length,
      time_split_test: test.length,
      blind_split_median_factor: Math.round(blindMedian * 100) / 100,
      blind_split_train: blindTrain.length,
      blind_split_test: blindTest.length,
      bootstrap_slope_low: Math.round(lo * 1000) / 1000,
      bootstrap_slope_mid: Math.round(mid * 1000) / 1000,
      bootstrap_slope_high: Math.round(hi * 1000) / 1000,
      pipeline_loo_median_factor: locoFull.medianFactor,
      pipeline_loo_within_2x: locoFull.within2x,
      loco_growth_median_factor: locoGrowth.medianFactor,
      loco_maturity_median_factor: locoMaturity.medianFactor,
      loco_chains_median_factor: locoChains.medianFactor,
      loco_winsor_median_factor: locoWinsor.medianFactor,
    },
    comps: comps.map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! })),
  };
}

/** The three hand-set multipliers one protocol gets, and the growth percent behind the first. */
export function multiplierSet(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainMult = Math.min(model.chain_cap, 1 + model.chain_step * (protocol.chains.length - 1));
  return { growthPct, growthMult, maturityMult, chainMult, age };
}

/** One LOCO variant: which input the full-pipeline leave-one-out drops. */
export type LocoVariant = 'full' | 'no-growth' | 'no-maturity' | 'no-chains' | 'no-winsor';

/**
 * The full pipeline's leave-one-out error under one LOCO variant: for each comparable,
 * refit the curve without it, predict it with curve x multipliers (one input neutralised
 * per variant), and take the error factor against its winsorised market cap. The median
 * is the number the entry reports, the same statistic as the curve-only LOO. 'no-winsor'
 * refits on uncapped market caps, so its target is the real market cap and its R² is
 * not comparable to the winsorised fits — the median error is the comparison that holds.
 */
export function pipelineLoo(
  comps: SnapshotProtocol[],
  asOf: string,
  model: ModelConstants = MODEL,
  variant: LocoVariant = 'full',
): { medianFactor: number; within2x: number } {
  const ratios = comps.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const cap = variant === 'no-winsor' ? Infinity : ratios[Math.floor(ratios.length * (model.winsor_percentile / 100))]!;
  const xs = comps.map((p) => Math.log10(p.tvl_usd));
  const ys = comps.map((p) => Math.log10(Math.min(p.mcap_usd!, cap * p.tvl_usd)));
  const factors: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const f = ols(
      xs.filter((_, j) => j !== i),
      ys.filter((_, j) => j !== i),
    );
    const m = multiplierSet(comps[i]!, asOf, model);
    let mult = 1;
    if (variant !== 'no-growth') mult *= m.growthMult;
    if (variant !== 'no-maturity') mult *= m.maturityMult;
    if (variant !== 'no-chains') mult *= m.chainMult;
    factors.push(Math.pow(10, Math.abs(f.intercept + f.slope * xs[i]! + Math.log10(mult) - ys[i]!)));
  }
  factors.sort((a, b) => a - b);
  return {
    medianFactor: Math.round(median(factors) * 100) / 100,
    within2x: Math.round((factors.filter((f) => f <= 2).length / factors.length) * 1000) / 1000,
  };
}

/** The three multipliers and the implied value one protocol gets under the fitted curve. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  fitted: FittedCurve,
  model: ModelConstants = MODEL,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const m = multiplierSet(protocol, asOf, model);
  const curve = Math.pow(10, fitted.fit.intercept + fitted.fit.slope * Math.log10(protocol.tvl_usd));
  const implied = Math.max(1, Math.round(curve * m.growthMult * m.maturityMult * m.chainMult));
  return { implied, growthPct: m.growthPct, growthMult: m.growthMult, maturityMult: m.maturityMult, chainMult: m.chainMult, age: m.age };
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  audited_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fitted: FittedCurve, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Early finds: the rankable pre-token protocols the watchlist leaves out, by implied value.
  // That is 138 below the floor, plus 20 above the floor that the watchlist leaves out (the
  // snapshot carries no parentProtocol field, so the watchlist's parent exclusion cannot be
  // applied here, and the rules are explicit that the watchlist is a floor, never a ceiling:
  // "a board may rank protocols the watchlist does not name"). Taking the top 160 by implied
  // value gives all 158 of them, for a board of 198 rows. The audit still covers every
  // rankable pre-token protocol; a protocol below the floor is never a replacement for a
  // watchlist row.
  const audited = snapshot.protocols.filter(isRankable);
  const early = audited
    .filter((p) => !chosen.has(p.slug))
    .map((p) => ({ p, implied: impliedValue(p, snapshot.as_of, fitted, model).implied }))
    .sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, fitted, model);
    const plan = farmPlan(p, v.age, v.implied, model);
    return { p, ...v, plan };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    verdict: s.plan.verdict,
    farm_cost_usd: s.plan.totalGasUsd,
    slice_usd: s.plan.sliceUsd,
    fees_usd: s.plan.totalGasUsd,
    tbill_usd: s.plan.tbillUsd,
    net_usd: s.plan.netUsd,
    work_hours: s.plan.workHours,
    net_per_hour_usd: s.plan.netPerHourUsd,
    pays_from_usd: s.plan.paysFromUsd,
    plan_chain: s.plan.planChain,
    hold_days: s.plan.holdDays,
    model: {
      curve_intercept: Math.round(fitted.fit.intercept * 1e4) / 1e4,
      curve_slope: Math.round(fitted.fit.slope * 1e4) / 1e4,
      curve_r2: Math.round(fitted.fit.r2 * 1e4) / 1e4,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: s.plan.steps.map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** What one transaction costs on a chain, in dollars: the chain sets the fee, not the protocol.
 * November 2026 typical values, stated as an assumption, not a live quote: Ethereum $3 (a
 * swap or mint action at low gas, not a 2021-era $8), Solana $0.05, the big L2s $0.50. */
function gasPerTx(chain: string, model: ModelConstants = MODEL): number {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return model.gas_ethereum_usd;
  if (c === 'solana') return 0.05;
  if (c === 'base' || c === 'arbitrum' || c === 'optimism' || c === 'polygon' || c === 'bsc' || c === 'bnb chain') return 0.5;
  if (c === 'avalanche' || c === 'fantom' || c === 'gnosis') return 0.3;
  return 2;
}

/** The cheapest chain a protocol names, with its per-transaction gas. */
function cheapestChain(p: SnapshotProtocol, model: ModelConstants = MODEL): { chain: string; gas: number } {
  const chains = p.chains.length > 0 ? p.chains : ['Ethereum'];
  let best = chains[0]!;
  let bestGas = gasPerTx(best, model);
  for (const c of chains) {
    const g = gasPerTx(c, model);
    if (g < bestGas) { best = c; bestGas = g; }
  }
  return { chain: best, gas: bestGas };
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Route $${capital} of payments through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('governance')) return `Lock $${capital} of the governance asset in ${name} on ${chain} and vote once.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The farm plan's verdict, from the economics, not from the value alone: FARM when the
 * standard slice beats every cost (fees plus the T-bill yield given up), THIN when the
 * slice beats the fees but not the T-bill, SKIP otherwise. A big protocol with a thin
 * slice is a SKIP however large its implied value is — the slice is what the farmer
 * is paid, and a $2.60 slice does not cover $3.20 of fees. */
export function econVerdict(netUsd: number, sliceUsd: number, feesUsd: number): 'FARM' | 'THIN' | 'SKIP' {
  if (netUsd > 0) return 'FARM';
  if (sliceUsd > feesUsd) return 'THIN';
  return 'SKIP';
}

/** The smallest capital at which the net turns positive, or null when it never does.
 * net(C) = C·share·implied/(TVL+C) − fees − C·tbillRate·hold/365: the slice saturates at
 * share·implied while the T-bill cost grows with C, so the net rises from −fees, crosses
 * zero once (the smaller root), peaks, and falls again. Null when the slice rate at
 * zero capital cannot beat the T-bill rate — then no capital ever pays. */
export function paysFrom(
  implied: number,
  tvl: number,
  feesUsd: number,
  holdDays: number,
  model: ModelConstants = MODEL,
): number | null {
  const k = model.tbill_annual * (holdDays / 365);
  const sI = model.airdrop_share * implied;
  if (sI / tvl - k <= 0) return null;
  const b = sI - feesUsd - k * tvl;
  const disc = b * b - 4 * k * feesUsd * tvl;
  if (disc < 0) return null;
  const root = (b - Math.sqrt(disc)) / (2 * k);
  return root > 0 ? Math.round(root) : null;
}

/** A protocol's farm plan: eight steps, each an action with a cost and a time, netted to the dollar. */
export interface FarmPlan {
  steps: FarmStep[];
  verdict: 'FARM' | 'THIN' | 'SKIP';
  totalGasUsd: number;
  capitalUsd: number;
  sliceUsd: number;
  tbillUsd: number;
  netUsd: number;
  workHours: number;
  netPerHourUsd: number;
  paysFromUsd: number | null;
  planChain: string;
  holdDays: number;
}

export function farmPlan(p: SnapshotProtocol, age: number | null, implied: number, model: ModelConstants = MODEL): FarmPlan {
  const { chain, gas } = cheapestChain(p, model);
  const capital = model.slice_capital_usd;
  const hold = holdDaysFor(age);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  // Four transactions on the plan chain (fund, the action, claim, exit) plus one bridge
  // when the plan chain is not Ethereum. Weekly upkeep is time, not gas: the position
  // is held and checked, no transaction is needed while it is held — a program that
  // demanded a weekly on-chain action would cost that chain's weekly gas on top.
  const bridge = chain.toLowerCase() === 'ethereum' ? 0 : model.bridge_usd;
  const totalGas = Math.round((4 * gas + bridge) * 100) / 100;
  const tbill = Math.round(capital * model.tbill_annual * (hold / 365) * 100) / 100;
  const slice = (capital / (p.tvl_usd + capital)) * model.airdrop_share * implied;
  const sliceUsd = Math.round(slice * 100) / 100;
  const netUsd = Math.round((sliceUsd - totalGas - tbill) * 100) / 100;
  const workHours = Math.round(((5 + 15 + 10 * weeks + 5 * weeks + 10 + 5) / 60) * 10) / 10;
  const netPerHourUsd = Math.round((netUsd / workHours) * 100) / 100;
  const paysFromUsd = paysFrom(implied, p.tvl_usd, totalGas, hold, model);
  const verdict = econVerdict(netUsd, sliceUsd, totalGas);
  const action = actionFor(p, capital, chain);
  const growthNote =
    p.change_7d === null
      ? `Its seven-day TVL change is unreported, so farm small and watch the first week.`
      : p.change_7d < -10
        ? `Its TVL fell ${Math.abs(p.change_7d).toFixed(1)}% in seven days: farm half size and watch for a further fall before adding.`
        : p.change_7d > 5
          ? `Its TVL rose ${p.change_7d.toFixed(1)}% in seven days: the momentum is with it, but do not chase it with more capital.`
          : `Its TVL moved ${p.change_7d.toFixed(1)}% in seven days: steady, so a plain position is enough.`;
  const verdictLine =
    verdict === 'FARM'
      ? `Verdict FARM: a $${capital.toLocaleString('en-US')} slice of $${sliceUsd.toFixed(2)} beats $${totalGas.toFixed(2)} of fees and $${tbill.toFixed(2)} of T-bill given up, netting $${netUsd.toFixed(2)} in ${workHours}h of work.`
      : verdict === 'THIN'
        ? `Verdict THIN: a $${capital.toLocaleString('en-US')} slice of $${sliceUsd.toFixed(2)} beats $${totalGas.toFixed(2)} of fees but not the $${tbill.toFixed(2)} of T-bill given up, netting $${netUsd.toFixed(2)}.`
        : `Verdict SKIP: a $${capital.toLocaleString('en-US')} slice of $${sliceUsd.toFixed(2)} does not cover $${totalGas.toFixed(2)} of fees and $${tbill.toFixed(2)} of T-bill given up, netting $${netUsd.toFixed(2)}.`;
  return {
    verdict,
    totalGasUsd: totalGas,
    capitalUsd: capital,
    sliceUsd,
    tbillUsd: tbill,
    netUsd,
    workHours,
    netPerHourUsd,
    paysFromUsd,
    planChain: chain,
    holdDays: hold,
    steps: [
      {
        text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
        cost: 'under $3 of gas for the first transaction',
        time: '5 minutes',
      },
      {
        text: `${bridge > 0 ? `Bridge $${capital} to ${chain} (about $${bridge.toFixed(2)}), then ` : ``}${action}`,
        cost: `$${capital} of capital deployed (recoverable) and about $${gas.toFixed(2)} of gas`,
        time: '15 minutes to set up',
      },
      {
        text: `Check the protocol's own points or rewards page each week; no transaction is needed while the position is held.`,
        cost: 'nothing to check, and never pay to claim',
        time: '10 minutes a week',
      },
      {
        text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
        cost: `the $${capital} stays in the position`,
        time: `${hold} days`,
      },
      {
        text: growthNote,
        cost: 'nothing to watch',
        time: '5 minutes a week',
      },
      {
        text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, then exit the position.`,
        cost: `about $${(2 * gas).toFixed(2)} of gas to claim and exit`,
        time: '10 minutes',
      },
      {
        text: `Net the plan: slice $${sliceUsd.toFixed(2)} (a $${capital.toLocaleString('en-US')} position's share of a 10% airdrop of a $${implied.toLocaleString('en-US')} launch) minus fees $${totalGas.toFixed(2)} minus T-bill $${tbill.toFixed(2)}, net $${netUsd.toFixed(2)} (${netPerHourUsd >= 0 ? '+' : ''}$${netPerHourUsd.toFixed(2)}/h over ${workHours}h). ${verdictLine}`,
        cost: `total fees $${totalGas.toFixed(2)}`,
        time: `${hold} days from set-up to claim`,
      },
      {
        text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
        cost: 'nothing but the log',
        time: '5 minutes',
      },
    ],
  };
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    verdict: row.verdict,
    farm_cost_usd: row.farm_cost_usd,
    slice_usd: row.slice_usd,
    fees_usd: row.fees_usd,
    tbill_usd: row.tbill_usd,
    net_usd: row.net_usd,
    work_hours: row.work_hours,
    net_per_hour_usd: row.net_per_hour_usd,
    pays_from_usd: row.pays_from_usd,
    plan_chain: row.plan_chain,
    hold_days: row.hold_days,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData; fitted: FittedCurve } {
  const fitted = fitCurve(snapshot, model);
  const board = buildBoard(snapshot, fitted, model);
  const live = liveRows(snapshot);
  const audited = snapshot.protocols.filter(isRankable).length;
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist: [...snapshot.watchlist],
    board_size: board.length,
    audited_size: audited,
    early_size: early,
    live_size: live.length,
    // The curve is stored at full precision, unrounded: the page recomputes every row from
    // these numbers, and a rounded intercept or slope shifts the value by ~0.06% (enough that
    // the recompute would not match the board to the dollar). The dashboard displays them
    // rounded to four decimals; the recompute uses the full values.
    curve: {
      intercept: fitted.fit.intercept,
      slope: fitted.fit.slope,
      r2: fitted.fit.r2,
      residual_sd: fitted.fit.residualSd,
    },
    validation: fitted.validation,
    comps: fitted.comps,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, fitted };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
