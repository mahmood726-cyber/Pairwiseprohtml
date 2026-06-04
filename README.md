# Proportion / Prevalence Meta-Analysis

A single-file, fully-offline browser tool for **random-effects meta-analysis of
single proportions / prevalences** — events out of a total, pooled across
studies. This fills a gap the portfolio's comparative (two-arm) meta-analysis
tools do not cover: there is no second arm, so the estimand is one proportion.

Two variance-stabilising transforms are offered:

- **Logit** — `yi = log(p/(1-p))`, `vi = 1/xi + 1/(ni-xi)`. A 0.5 continuity
  correction is added to **both** cells **only** when `xi == 0` or `xi == ni`
  (the zero-cell rule; matches metafor `add=1/2, to="only0"`). The pooled logit
  is back-transformed with the inverse logit.
- **Freeman-Tukey double arcsine** —
  `yi = 0.5*( asin(sqrt(xi/(ni+1))) + asin(sqrt((xi+1)/(ni+1))) )`,
  `vi = 1/(4*ni+2)`. The pooled value is back-transformed with **Miller's
  harmonic-mean inverse** (metafor `transf.ipft.hm`), using the harmonic mean
  of the sample sizes — the classic gotcha that distinguishes a correct FT
  implementation from a wrong one.

Pooling is **DerSimonian-Laird** random effects: `tau^2`, Higgins-Thompson
`I^2`, Cochran's `Q`, and the back-transformed pooled proportion with its CI.

## Provenance

| Component | Source / formula | Note |
|---|---|---|
| Logit `yi`, `vi` | `log(p/(1-p))`, `1/xi + 1/(ni-xi)` | metafor `measure="PLO"` |
| Zero-cell correction | add 0.5 to xi and (ni-xi) | only when `xi==0` or `xi==ni` |
| Freeman-Tukey `yi`, `vi` | double arcsine, `1/(4ni+2)` | metafor `measure="PFT"` |
| FT back-transform | Miller harmonic-mean inverse | metafor `transf.ipft.hm` |
| `tau^2` | DerSimonian-Laird | flagged unreliable for k<10 |
| `I^2` | Higgins-Thompson typical-variance | `100*tau2/(tau2+s2)` |
| Forest plot | e156 chart-kit `renderForest` | copied verbatim, see below |
| Inverse-normal CDF | Acklam rational approximation | for CI z-multipliers |

`p` is clamped to `[1e-10, 1-1e-10]` before any logit. Numeric fallbacks use
`??` so a legitimate `0` is never dropped.

### metafor validation (R 4.6.0)

`validate.R` reproduces the reference numbers for an 8-study dataset (one
zero-cell study). The tool's per-study `yi`/`vi` and the back-transformed pooled
proportion agree with metafor to ~1e-3:

| Transform | metafor pooled proportion | this engine |
|---|---|---|
| Logit (PLO) | 0.17397694 | 0.173977 |
| Freeman-Tukey (PFT) | 0.14884037 | 0.148840 |

The exact metafor reference arrays are embedded as comments in `tests.js`.

## Layout

```
engine.js         pure logic (no DOM); Node + browser via the IIFE pattern
tests.js          Node test harness (require('./engine.js'))
index.html        single-file UI: chartkit.js -> engine.js -> inline script
chartkit.js       e156 chart-kit, copied verbatim (renderForest etc.)
validate.R        metafor reference-value generator
README.md         this file
E156-PROTOCOL.md  E156 micro-paper body + submission flag
LICENSE           MIT
.gitignore .nojekyll
```

## Tests

```
$ node tests.js
63 passed, 0 failed
```

Coverage includes: logit & FT per-study `yi`/`vi` vs metafor (16 array
assertions), the zero-cell `xi=0` study (correction applied to both cells),
pooled proportion + CI vs metafor for **both** transforms, `I^2` sanity,
weight normalisation, raw-proportion exposure, and input validation.

## Reuse vs net-new

**Reused.** The DerSimonian-Laird `tau2_DL` / `genQ` / `typicalVar` / `Isq`
pattern and the Acklam `qnorm` follow `htmlpairwise-repro/engine.js` and
`html1-effectsize/engine.js`. The IIFE module pattern, the single-file UI
shell / CSS, and the forest-drawing wiring follow `html1-effectsize/index.html`.
The forest plot is the e156 chart-kit `renderForest` (copied verbatim, no fork).

**Net-new.** Single-proportion effect sizes (logit and Freeman-Tukey double
arcsine), the conditional zero-cell correction, and the harmonic-mean
double-arcsine back-transform (`ipftHm`, Miller's inverse) are specific to this
tool — the portfolio's other meta-analysis tools work on two-arm contrasts and
do not implement single-proportion pooling.
