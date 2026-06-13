# Truth-Recovery Yardstick for Pairwiseprohtml (single-proportion MA)

Pairwiseprohtml validates its point outputs against metafor. This adds the
missing evidence: under known truth (injected proportion π + logit-scale
heterogeneity τ + varying study sizes), **which transform and which interval
actually recover π?**

> Truth-first: seeded, reproducible. `node truth-recovery/harness.mjs --reps 3000`
> (3000 reps/cell, π∈{0.05,0.2,0.5}, τ∈{0.3,0.6}, k∈{5,15}, n_i log-uniform 15–400).

## Two measured findings

### 1. The DL z-interval under-covers the true proportion (both transforms)

| transform | mean coverage of true π | mean \|bias\| |
|---|---|---|
| logit (DL, z) | **0.875** | 0.0051 |
| Freeman-Tukey (DL, z) | **0.891** | 0.0022 |
| nominal | 0.95 | — |

Under realistic heterogeneity the engine's z-based DerSimonian-Laird interval
covers π only ~0.88 of the time, not 0.95 — the well-known DL undercoverage, now
quantified for proportions. Worst at small k and high τ (down to 0.80).

### 2. Adding an HKSJ interval restores coverage — a measured improvement

| interval | mean coverage |
|---|---|
| logit DL (z) | 0.875 |
| **logit HKSJ (t_{k-1} + variance-inflation floor)** | **0.934** |

The HKSJ interval (`hksjProp`, built from the engine's own exported
`logitStudy`/`tau2_DL`) lifts coverage by **+6 points** to near-nominal, and is
better in 11 of 12 cells — most at k=5 (0.85–0.90 → 0.94–0.97), exactly where the
t-correction and Q/(k−1) variance inflation matter (advanced-stats HKSJ rule).
The only residual gap is π=0.05, τ=0.6, k=15 (rare events + high heterogeneity),
which is hard for every plug-in interval.

**Recommendation:** add an `transform:'logit', ci:'hksj'` option to `metaProp`.
This branch demonstrates it (with a t_{k-1} Cornish–Fisher critical value and the
floored variance inflation) and measures the gain; the engine's audited code is
left untouched.

## An honest correction to a common warning

The folklore is that Freeman-Tukey is dangerous because its back-transform
mis-estimates pooled proportions. In **these** regimes that did **not** show up:
FT had *lower* bias (0.0022 vs 0.0051) and comparable-or-better coverage than
logit. FT's pathology needs more extreme conditions (π very near 0/1 with extreme
n-variation). So the engine's real weakness here is the **CI method (z→HKSJ)**,
not the transform — a more useful and honestly-measured conclusion than repeating
the FT warning.

## What transferred from the allmeta estimator work

- **Transferred:** the known-truth coverage yardstick and the HKSJ-floor rule
  (the same correction validated for continuous outcomes in meta-stats-core /
  htmlpairwise), here ported to the proportion scale with a measured gain.
- **Did not transfer:** selection/NPE machinery — publication selection is less
  central for single-proportion prevalence synthesis, so the relevant learning
  was the coverage yardstick + HKSJ, which delivered.

## Files
`harness.mjs` (seeded binomial DGP; logit/FT/HKSJ scoring) ·
`test-truth-recovery.mjs` (4 measured invariants).
