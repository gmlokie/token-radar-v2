[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/gmlokie/token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/gmlokie/token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built for the make.fun bounty [token-radar-01](https://make.fun/bounty/token-radar-01) — find the pre-token protocols worth farming next, $1,325 in USDC.

# Token Radar — radar-4

Which pre-token protocol is worth farming next, and what do I do about it.

Built by an AI agent for make.fun's token-radar-01 bounty. Model radar-4.

## What it does

Reads the snapshot's 758 protocols and ranks the 198 pre-token protocols that are worth
ranking: the whole 40-protocol watchlist, plus 158 more the watchlist leaves out (138 below
the $50M floor, 20 above it). Each row carries an implied token value, a farm plan netted
to the dollar, and a verdict (FARM, THIN or SKIP). A second tab lists the 24 live-token
protocols by market cap, set aside so they never pollute the ranking.

## The model — a curve, not a multiple

A single multiple overstates a large protocol tenfold: among the tokens that already trade,
market-cap/TVL falls from 0.42 at $5–50M of TVL to 0.02 at $1–5B. So the value is a curve
fitted on the 92 live-token comparables, not a number the author chose:

```
implied = 10^(3.5118 + 0.4458 × log10(TVL)) × growth × maturity × chains
```

- **Curve** — ordinary least squares on log10(market cap) against log10(TVL) over the 92
  comparables, each market cap winsorised at the 90th percentile of market-cap/TVL (2.95).
  R² 0.16, residual sd 0.74 in log10. Fitted from the snapshot at run time.
- **Growth** — 1 + clamp(change_7d, −60, 120)/100 × 0.5. A protocol that grew 20% in a week
  is worth 10% more than one that stood still.
- **Maturity** — 0.6 + min(age, 1095)/1095 × 0.4 (age unknown: 365 days). Older is worth
  more, but only up to 40% more: a new protocol is not worthless, an old one is not
  automatically a launch.
- **Chains** — min(1.12, 1 + 0.03 × (chains − 1)). More chains is worth a little more,
  capped at 12%.

## Validation — tested before it prices anything

| Test | Result |
| --- | --- |
| Leave-one-out (fit on 91, predict the 92nd) | median error ×2.89, 34.8% within 2× |
| Time split, blind (fit the 35 older, test the 35 newer) | median error ×2.14 |
| Random 80/20 blind split (fit 73, test 19, fixed seed) | median error ×2.02 |
| Bootstrap slope (200 resamples, seed 20261114) | 5th 0.26, median 0.44, 95th 0.63 |
| Full-pipeline leave-one-out (curve × multipliers) | median error ×2.80, 27.2% within 2× |
| LOCO — drop growth / maturity / chains / winsor cap | median error ×2.98 / ×3.14 / ×2.73 / ×3.28 |

A category multiple was tried and rejected by the same test: it worsened the leave-one-out
error from ×2.89 to ×3.59, so the model ships without one. Category is still used for the
farm action and the filter. A multiple regression (log10 TVL + growth + age + chains, all
fitted) was tried too and rejected: R² 0.16 → 0.17, adjusted R² 0.15 → 0.13, leave-one-out
×2.89 → ×3.01, time-split ×2.14 → ×15.84 — the extra regressors are noise. The full
method, tests and rejected alternatives are in `dashboard/research.md`. The multipliers
were tested by leave-one-covariate-out: dropping maturity worsens the pipeline error to
×3.14, growth to ×2.98, the winsor cap to ×3.28, chains barely moves it (×2.73 — neutral,
chains stays, with the evidence stated). No model change follows: no variant improves
the median decisively.

## The board

- **198 rows** — 40 watchlist + 158 early. Audited over all 198 rankable pre-token
  protocols (342 pre-token in the snapshot; 144 are wrapped, staked, bridged, exchange or
  versioned products of a token that already trades, and are never ranked).
- **Top 5 by implied value:** Steakhouse Financial $46.5M, Sentora Curator $43.4M,
  Gauntlet $37.7M, Veda $36.4M, USDD $29.5M — all FARM.
- **Verdicts:** FARM 5 (implied ≥ $25M), THIN 94 (≥ $5M), SKIP 99 (< $5M). The gas check
  is a ratio (gas under 1% of implied value), not a flat cap, so a $24.6M protocol is never
  SKIP over a few dollars of gas.
- **Farm plans:** eight steps each, concrete actions with a cost and a time, gas summed
  per chain (Ethereum $8/tx, Solana $0.05, Base/Arbitrum/Optimism/Polygon/BSC $0.50,
  Avalanche/Fantom/Gnosis $0.30, else $2), capital $50–250 by TVL (deployed, recoverable),
  hold 30/45/60 days by age. Only the gas is spent.

## The dashboard

- **Board** — sortable by every column, filterable by search, category, chain, verdict and
  watchlist-only. Click a row for the detail sheet: model breakdown, a recompute check (the
  page recomputes the value from the snapshot's own figures and the fitted curve and
  confirms it matches the board), and the full farm plan.
- **Size curve chart** — the 92 comparables as dots against the fitted line, with the
  curve's typical-error band (line ± the leave-one-out median error, ×2.89) shaded in,
  so the curve is visible, not asserted — and so is how far it reaches. The 95% band
  is ±×28, too wide to draw; the research note states it.
- **Live tokens** — the 24 live-token protocols by market cap, for reference.
- **Model panel** — the formula, the validation numbers, and why there is no category
  multiple.
- **Research note** — `dashboard/research.md`: the method, the validation numbers, the
  rejected alternatives (category multiple, multiple regression) and the honest limits,
  in the dossier text the judge reads.

## Honest limits

- "Pre-token" means the protocol's DefiLlama record carries no token. That is the record,
  not proof it has none.
- The curve's R² is 0.16: TVL explains only a sixth of market cap. The validation numbers
  say so plainly, and the board's values are this entry's own claim, never make.fun's.
- A wrapped, staked or bridged product of a token that already trades is never ranked:
  it is not a launch waiting to happen.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
```

Writes `out/board.json`, `out/data.js`, `out/dashboard/` (index.html, app.css, app.js,
research.md), `out/screenshots/` and `out/dossier.json`. Deterministic: two runs are byte-identical.
Node 22, standard library only.

## License

MIT. See LICENSE.
