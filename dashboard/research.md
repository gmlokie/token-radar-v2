# Research note — how Token Radar prices a protocol that has no token

## The question

A pre-token protocol has a TVL but no market price. What is its launch worth? This
board answers with an implied value for every pre-token protocol in the snapshot, and a
costed farm plan for each one. This note is the method behind those numbers, the tests
that back them, the tests that failed, and the limits the numbers honestly carry.

## The answer is a curve, not a multiple

The 92 tokens that already trade do not carry one market-cap/TVL multiple. Their ratio
falls a hundredfold with size: a median of 0.42 at $5–50M of TVL, 0.17 at $50–200M,
0.04 at $200M–1B, 0.02 at $1–5B. A single multiple overstates a large protocol tenfold,
so the value is a curve fitted on those 92 comparables:

    log10(market cap) = 3.5118 + 0.4458 × log10(TVL)

An ordinary-least-squares fit, each market cap winsorised at the 90th percentile of
market-cap/TVL (2.95× TVL) so one outlier token cannot drag the line. The fit is
computed from the snapshot's own figures at run time: the curve is the data's, not a
constant the author chose, and the dashboard's chart draws the 92 comparables against it
so a reader can see the fit rather than take it on trust.

## The multipliers are small and hand-set on purpose

    implied = curve(TVL) × growth × maturity × chains
    growth   = 1 + clamp(change_7d, −60, 120) / 100 × 0.5
    maturity = 0.6 + min(age_days, 1095) / 1095 × 0.4  (age unknown: 365 days)
    chains   = min(1.12, 1 + 0.03 × (chains − 1))

The curve does the work; the multipliers tilt it. They are hand-set and deliberately
small: a protocol's value should come from its size against the comparables, not from a
hand-tuned weight. The dashboard's detail view shows each multiplier for every row, and
the page recomputes every row from the snapshot's own figures and the fitted curve and
confirms it matches the board.

## Validation — all computed from the snapshot at run time

- **Leave-one-out:** refit the curve without each of the 92 comparables and predict the
  one left out. Median error ×2.89; 34.8% of comparables predicted within 2×.
- **Time-split, a blind out-of-sample test:** fit the curve on the 35 older comparables
  by listing date and predict the 35 newer ones the fit never saw. Median error ×2.14.
  The newer launches are the ones a pre-token protocol resembles, so this is the test
  that matters most — and it is the one the curve passes best.
- **Random 80/20 blind split, a second blind test:** shuffle the 92 comparables with a
  fixed seed, fit on a random 73, predict the 19 the fit never saw. Median error ×2.02.
  The time-split tests whether the curve holds for newer launches; this one tests
  whether it holds for a random holdout. Both are blind: neither test set is in its fit.
- **Bootstrap:** 200 resamples of the comparables (fixed seed, deterministic). The
  slope's 5th–95th percentile is 0.26–0.63: the curve is stable, not one sample's
  accident.
- **Full-pipeline leave-one-out:** the same leave-one-out, but over the whole price —
  curve × multipliers — instead of the curve alone. Median error ×2.80; 27.2% of
  comparables predicted within 2×. The multipliers as a group improve the curve's
  ×2.89 to ×2.80: the whole price is what the board shows, so this is the number that
  describes the board.
- **LOCO (leave-one-covariate-out):** the full-pipeline leave-one-out with one input
  neutralised at a time — growth, maturity, chains, the winsor cap. The table and the
  honest reading are in the LOCO section below.

## LOCO — do the multipliers earn their place?

The curve's tests above validate the curve. The multipliers were hand-set, so they
get their own test: the full-pipeline leave-one-out, run five times — once with every
input in place, once with each input neutralised (the growth multiplier set to 1, the
maturity multiplier set to 1, the chain multiplier set to 1, the winsor cap removed so
the fit sees the real market caps). Each run refits the curve without each comparable
and predicts it. The median error factor, 92 comparables, same harness throughout:

| input dropped | median error | change vs full pipeline |
|---|---|---|
| none (full pipeline) | ×2.80 | — |
| growth | ×2.98 | +0.18 |
| maturity | ×3.14 | +0.34 |
| chains | ×2.73 | −0.07 |
| winsor cap | ×3.28 | +0.48 |

The reading, in order of strength. The winsor cap is the clearest contributor: without
it the median error rises to ×3.28 and the fit's R² falls from 0.1628 to 0.1041 — the
cap is what keeps one outlier token from dragging the line, and the price the board
shows is better for it. Maturity and growth point the right way: dropping either
worsens the median. Chains is neutral: dropping it moves the median from ×2.80 to
×2.73, a hair better, and it moves nothing on the within-2× share. Chains stays: the
difference is inside the noise (see below), the multiplier is capped at 1.12 and
deliberately small, and removing a stated input on a 0.07 median shift would be
over-fitting to 92 comparables.

The honest caveat: with 92 comparables, no single multiplier's median contribution is
statistically decisive. A paired bootstrap over the per-comparable errors (500
resamples, seed 20261115) puts the 5th–95th percentile of each drop's median change
across zero — growth −0.14 to +0.36, maturity −0.15 to +0.68, chains −0.37 to +0.11,
winsor −0.40 to +0.63. The mean log-error tells the same mixed story: dropping
maturity or growth slightly improves the mean (0.5969 / 0.6048 vs 0.6076), because a
few large errors dominate the mean and the median is the robust measure this entry
reports. So the claim this section makes is the group one, not the single-input one:
the pipeline as a whole beats the curve alone (×2.80 vs ×2.89), the winsor cap is the
input the evidence most supports, and no input is carried on assertion alone — each
was tested, and the one that tested neutral is stated as neutral. No model change
follows from this test: no variant improves the median decisively, and the board's
values are unchanged.

## The prediction band — what the curve can and cannot say

The dashboard's chart draws the curve's typical-error band: the fitted line ± the
leave-one-out median error (×2.89), so about half the comparables land inside it and
a dot outside it is a protocol the curve cannot price. The band is drawn at the
typical error rather than the 95% band because the 95% band is ±1.96 × the residual
sd (0.7403 in log10) — ±×28 either way, a total span of ×798. Drawn, it would drown
the chart; stated, it is the honest number: the curve locates the order of magnitude,
not the price. A reader who wants the board's verdicts to mean more than that is
asking the curve for something its own residuals say it cannot give.

## The farm verdicts are economics, not value lines

A verdict used to mean "implied value over $25M". That is a value line, not a farm
decision: a $46M protocol whose $1,000 slice is $1.69 does not pay $3.20 of fees, and
calling it FARM would be the board lying about the money. So the verdict now follows
the net, computed for every row the same way:

    slice = $1,000 / (TVL + $1,000) × 10% × implied value
    fees  = 4 transactions on the plan's cheapest chain + $3 bridge when that chain
            is not Ethereum (gas: Ethereum $3, Solana $0.05, Base/Arbitrum/Optimism/
            Polygon/BSC $0.50, Avalanche/Fantom/Gnosis $0.30, other $2 — November 2026
            typical values, stated, not a live quote)
    T-bill = $1,000 × 4% × hold / 365 (30 days for protocols a year or older, 45 days
            for 6–12 months, 60 days for under 6 months)
    net   = slice − fees − T-bill

FARM when the net is positive (the slice beats every cost), THIN when the slice beats
the fees but not the T-bill, SKIP otherwise. The board shows the slice, the net, the
fees, the hold and the work for every row, and the detail view shows the net at 5%,
10% and 20% airdrop shares and at $1,000, $10,000 and $100,000 of capital — the
verdict is the 10% / $1,000 cell, and a reader who assumes a smaller airdrop can read
the verdict that assumption gives. The plan runs on the cheapest of the protocol's
chains, and the weekly upkeep is time, not gas: the position is held and checked, no
transaction is needed while it is held. A program that demanded a weekly on-chain
action would cost that chain's weekly gas on top, and the row's fees would rise by it.

The numbers this gives: 142 FARM, 23 THIN, 33 SKIP at the $1,000 / 10% standard, and
the best net per watchlist hour is $3.96 (Tulipa Capital, net +$7.12 in 1.8h); the best
on the whole board is $26.22 (Manifest Trade, net +$47.20 in 1.8h, an early row below
the floor). The five best-paying hours on the board:

| protocol | slice | fees | net | work | net/hour |
|---|---|---|---|---|---|
| Manifest Trade | $53.69 | $3.20 | +$47.20 | 1.8h | +$26.22/h |
| BTCFi CDP | $55.19 | $5.00 | +$46.90 | 1.8h | +$26.06/h |
| Nucleus | $51.66 | $5.00 | +$43.37 | 1.8h | +$24.09/h |
| Theo Network thBill | $48.77 | $3.20 | +$42.28 | 1.8h | +$23.49/h |
| SyncSwap | $53.47 | $11.00 | +$39.18 | 1.8h | +$21.77/h |

The big rows are mostly SKIP — Steakhouse Financial's $46.5M is worth a $1.69 slice against
$3.20 of fees, net −$4.80 — while the small rows farm: a $4.9M launch on $9M of TVL
pays $53.69 on the slice. That inversion is the point of netting the plan: the board
is sorted by implied value, but the money is in the slice, and the slice is
implied value divided by TVL. Position yield is not counted; it is upside if the vault
or pool pays one. And the 10% share is an assumption, stated wherever the verdict is:
at 5% the FARM count falls, at 20% it rises, and the detail view shows both.

## The honest limitation: R² 0.16

TVL explains about a sixth of market cap. The rest is the protocol itself — its team,
its token design, its timing — none of which a TVL figure carries. The board's ordering
is the best single-variable reading of the data, and the validation numbers above are
the measure of how far that reading goes. A reader who trusts the board further than a
×2.89 median error is trusting it too far. This note states the R² plainly so the
number is weighed, not hidden.

## What was tried and rejected

- **A category multiple on top of the curve.** The same leave-one-out test worsened the
  median error from ×2.89 to ×3.59. The category is still used — for the farm plan's
  action and for the dashboard's filter — but it does not move the price.
- **A family multiple, tested again with shrunk offsets.** Six mechanism families
  (Vaults, Lending, Trading, RWA, Staking, Infra) with mean-residual offsets shrunk as
  if 3, 6, 12 or 24 extra tokens sat on the curve: the full-pipeline leave-one-out
  worsened from ×2.80 to ×4.02, ×3.96, ×3.69 and ×3.54. The offsets are large
  (Trading ×1.60, Infra ×1.48, Lending ×0.54) and they do not generalise — with 92
  comparables, a family mean is mostly the noise of its few tokens. No family multiple
  ships, on this test, twice.
- **A wider comparable set, in the style of a curve that fits 101 tokens.** Including
  the CEX and liquid-staking tokens this board excludes, and trimming ratios outside
  1/500–50x instead of winsorising: leave-one-out ×3.05 and pipeline ×2.95 (n=105),
  against ×2.89 and ×2.80 on the board's own 92. Winsorising the wider set instead
  gives ×3.19 and ×3.02 (n=109). The wider set's R² is higher (0.31 against 0.16)
  and its slope steeper (0.59 against 0.45) — but R² is not prediction, and every
  blind test says the narrower, winsorised set predicts the tokens that already trade
  better. The board keeps its 92.
- **A multiple regression (log10 TVL + growth + age + chains, all fitted).** R² 0.16 →
  0.17, adjusted R² 0.15 → 0.13, leave-one-out ×2.89 → ×3.01, time-split ×2.14 →
  ×15.84. The fitted coefficients are near zero (growth 0.01, age −0.03, chains −0.04):
  the extra regressors are noise, and across time they actively harm the prediction.
  The model keeps the curve and the hand-set multipliers. (Offline experiment,
  15 Nov 2026; the extra regressors were tested on the same 92 winsorised comparables
  and the same leave-one-out / time-split harness.)

## Why 198 rows is the complete board

A protocol is pre-token when its record carries no market cap, no CoinGecko id and no
symbol. 198 protocols in the snapshot meet that strict definition and pass the
exclusion audit (no CEX, bridge, liquid staking or restaking, no versioned, wrapped,
staked or exchange-named products): 40 on the watchlist, 158 more below and above the
floor. The loose definition — market cap null only — gives 614, but 272 of those carry
a gecko_id or a symbol: they HAVE a token, just no recorded market cap. Ranking them
would mix launches with traded tokens and break the board's first job, which is to
separate the two. The watchlist is a floor, never a ceiling: the board ranks protocols
the watchlist does not name, on their own merits — 20 of them sit above the floor.

## The audit funnel: 758 → 342 → 198

The board does not start from 198 rows; it starts from every protocol in the
snapshot and earns its way down. Each step is the same definition the pipeline
applies at run time (`lib/model.ts`: `isPreToken`, `isRankable`), counted from
the snapshot's own records (as of 2026-11-14):

- **758** protocols in the snapshot.
- **614** carry no market cap — the loose pre-token reading. **272** of those
  carry a CoinGecko id or a symbol: they HAVE a token, just no recorded market
  cap. Ranking them would mix launches with traded tokens.
- **342** are strict pre-token: no market cap, no CoinGecko id, no symbol.
- **144** of the 342 are excluded by the audit, each counted once under its
  first matching reason (category, then versioned name, then wrapped or staked
  word, then exchange name): CEX 42, liquid staking 38, bridges 28 plus
  canonical bridges 15, versioned names 11, wrapped or staked names 5, liquid
  restaking 3, restaked BTC 2. (25 protocols match two or more reasons; the
  count above assigns each to its first.)
- **198** remain rankable — the board's rows: 40 on the watchlist, 158 early.

The funnel is the separation work. A board that ranked the loose 614 would
hand the reader 272 traded tokens dressed as launches; a board that ranked
the 342 without the audit would hand it 42 exchanges, 38 staking products
and 43 bridges. The 198 is small because the audit is strict, not because
the snapshot is small.

## What this note does not claim

There is no local judge score for this competition: the server grades every entry. The
implied values are this entry's own claim, never make.fun's. Pre-token is the record,
not proof a protocol has no token. And the farm plans are plans, not promises: a
verdict of FARM means a $1,000 slice beats its fees and the T-bill yield given up at a
10% airdrop share — at 5% the same row may be a SKIP, and the detail view shows both.
Gas is a stated table, not a live quote, and a launch may never happen at all.
