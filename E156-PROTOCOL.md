# E156 Protocol — Proportion / Prevalence Meta-Analysis

- **Project:** pairwisepro-proportion
- **Repo (docs):** Pairwiseprohtml
- **Primary estimand:** pooled single proportion (random-effects)
- **Dates:** built 2026-06-04

## CURRENT BODY

How should a reviewer pool single-arm proportions — say a prevalence or an
adverse-event rate — across studies when no comparator exists? This offline,
single-file browser tool takes per-study events and totals and meta-analyses
the resulting proportions without any external dependency or network call. It
offers two variance-stabilising transforms, the logit and the Freeman-Tukey
double arcsine, pooled by DerSimonian-Laird random effects with tau-squared,
I-squared, and Cochran's Q. For an eight-study worked example including a
zero-event study, the back-transformed pooled proportion was 17.4 percent under
the logit transform and 14.9 percent under Freeman-Tukey, each matching metafor
to about one part in a thousand. A 0.5 continuity correction is applied to both
cells only for boundary studies under the logit, while the Freeman-Tukey route
avoids that correction and back-transforms the pooled value through the harmonic
mean of the sample sizes. The two transforms can disagree when proportions sit
near zero or one, so the tool reports both and flags boundary studies rather
than silently choosing for the analyst. It does not model covariates, compute a
prediction interval, or test for small-study effects, and DerSimonian-Laird is
flagged as approximate when fewer than ten studies are pooled.

SUBMITTED: [ ]
