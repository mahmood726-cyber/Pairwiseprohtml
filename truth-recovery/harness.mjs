// ============================================================
// harness.mjs — Truth-recovery yardstick for single-proportion meta-analysis.
//
// Pairwiseprohtml validates its POINT outputs against metafor. It does not tell
// you which transform — logit vs Freeman-Tukey double-arcsine (FT) — actually
// RECOVERS the true proportion pi once there is real between-study heterogeneity
// and varying study sizes. That choice matters: the FT back-transformation is
// known to mis-estimate a pooled proportion when the n_i vary a lot
// (Schwarzer 2019; Barendregt 2013), because the back-transform needs a single
// "harmonic-mean n" that no longer matches any study.
//
// This injects a known pi and logit-scale heterogeneity tau, simulates binomial
// counts, and measures coverage of the TRUE pi and bias of the pooled estimate
// for each transform.
//
// Truth-first: seeded, reproducible. node truth-recovery/harness.mjs --reps 3000
// ============================================================

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('../engine.js');

const BASE_SEED = 20260613;

// mulberry32 seeded PRNG
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(rng) { let u = rng(); if (u < 1e-12) u = 1e-12; return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()); }
function rbinom(rng, n, p) { let x = 0; for (let i = 0; i < n; i++) if (rng() < p) x++; return x; }
const logit = (p) => Math.log(p / (1 - p));
const invlogit = (x) => 1 / (1 + Math.exp(-x));

// study sizes: log-uniform in [nLo, nHi] -> deliberately VARYING n (FT's weak spot)
function drawN(rng, nLo, nHi) {
  return Math.max(5, Math.round(Math.exp(Math.log(nLo) + (Math.log(nHi) - Math.log(nLo)) * rng())));
}

const TRANSFORMS = ['logit', 'ft'];

// Cornish-Fisher t-quantile from a normal quantile (accurate for df>=3); used to
// build a candidate HKSJ interval the engine does not currently offer.
function tCrit975(df) {
  const z = M.qnorm(0.975);
  const z3 = z ** 3, z5 = z ** 5, z7 = z ** 7;
  return z + (z3 + z) / (4 * df)
    + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df)
    + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3);
}

// Candidate HKSJ proportion interval (t_{k-1} + variance inflation, floored),
// reconstructed from the engine's exported per-study transform + DL tau^2.
function hksjProp(studies, transform) {
  const fn = transform === 'ft' ? M.ftStudy : M.logitStudy;
  const yi = [], vi = [], ni = [];
  for (const s of studies) { const e = fn(s.xi, s.ni); yi.push(e.yi); vi.push(e.vi); ni.push(s.ni); }
  const k = yi.length;
  const tau2 = M.tau2_DL(yi, vi);
  const w = vi.map(v => 1 / (v + tau2));
  const sw = w.reduce((a, b) => a + b, 0);
  const mu = yi.reduce((a, y, i) => a + w[i] * y, 0) / sw;
  const seRE = Math.sqrt(1 / sw);
  let qHK = 0; for (let i = 0; i < k; i++) qHK += w[i] * (yi[i] - mu) ** 2;
  qHK /= (k - 1);
  const seHK = seRE * Math.sqrt(Math.max(1, qHK));   // floor (advanced-stats HKSJ rule)
  const t = tCrit975(k - 1);
  const lo = mu - t * seHK, hi = mu + t * seHK;
  // back-transform: logit is monotone; FT uses harmonic-mean n (ipftHm)
  const back = transform === 'ft'
    ? (x) => M.ipftHm(x, ni)
    : (x) => 1 / (1 + Math.exp(-x));
  let bl = back(lo), bh = back(hi), be = back(mu);
  if (bl > bh) { const tmp = bl; bl = bh; bh = tmp; }
  return { est: be, lo: bl, hi: bh };
}

// methods scored: each transform with the engine's z-based DL CI, plus the
// candidate HKSJ interval (logit only — FT+HKSJ shares the back-transform issues).
const METHODS = ['logit', 'ft', 'logit_hksj'];

export function runCell(pi, tau, k, reps, rng, { nLo = 15, nHi = 400 } = {}) {
  const acc = {};
  for (const m of METHODS) acc[m] = { cov: 0, n: 0, biasSum: 0, sqSum: 0, wSum: 0 };
  const lp = logit(pi);
  for (let r = 0; r < reps; r++) {
    const studies = [];
    for (let i = 0; i < k; i++) {
      const ni = drawN(rng, nLo, nHi);
      const pii = invlogit(lp + tau * randn(rng));
      studies.push({ xi: rbinom(rng, ni, pii), ni });
    }
    const score = (m, est, lo, hi) => {
      if (!isFinite(est)) return;
      const a = acc[m]; a.n++; a.biasSum += est - pi; a.sqSum += (est - pi) ** 2;
      a.wSum += hi - lo; if (lo <= pi && pi <= hi) a.cov++;
    };
    for (const t of TRANSFORMS) {
      let res;
      try { res = M.metaProp(studies, { transform: t, level: 0.95 }); } catch { continue; }
      if (!res || res.error) continue;
      score(t, res.pooled.est, res.pooled.lo, res.pooled.hi);
    }
    try { const h = hksjProp(studies, 'logit'); score('logit_hksj', h.est, h.lo, h.hi); } catch { /* skip */ }
  }
  const out = {};
  for (const m of METHODS) {
    const a = acc[m];
    out[m] = {
      n: a.n,
      coverage: a.n ? +(a.cov / a.n).toFixed(3) : null,
      bias: a.n ? +(a.biasSum / a.n).toFixed(4) : null,
      rmse: a.n ? +Math.sqrt(a.sqSum / a.n).toFixed(4) : null,
      meanWidth: a.n ? +(a.wSum / a.n).toFixed(4) : null,
    };
  }
  return out;
}

export function runGrid({ reps = 3000, pis = [0.05, 0.20, 0.50], taus = [0.3, 0.6],
                          ks = [5, 15] } = {}) {
  const rng = makeRng(BASE_SEED);
  const grid = [];
  for (const pi of pis)
    for (const tau of taus)
      for (const k of ks)
        grid.push({ pi, tau, k, results: runCell(pi, tau, k, reps, rng) });
  return grid;
}

const isMain = process.argv[1]?.endsWith('harness.mjs');
if (isMain) {
  const arg = (f, d) => { const i = process.argv.indexOf(f); return i >= 0 ? Number(process.argv[i + 1]) : d; };
  const reps = arg('--reps', 3000);
  const t0 = Date.now();
  const grid = runGrid({ reps });
  console.log(`\n# Pairwiseprohtml truth-recovery: logit vs Freeman-Tukey (reps=${reps}/cell, seed=${BASE_SEED})\n`);
  console.log('Coverage of the TRUE proportion pi (nominal 0.95):\n');
  console.log(' pi   tau   k | cov_logit  cov_ft  cov_logit_hksj');
  for (const c of grid) {
    const L = c.results.logit, F = c.results.ft, H = c.results.logit_hksj;
    console.log(`${c.pi.toFixed(2)}  ${c.tau.toFixed(1)}  ${String(c.k).padStart(2)} | `
      + `${String(L.coverage).padStart(8)} ${String(F.coverage).padStart(7)} `
      + `${String(H.coverage).padStart(14)}`);
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  console.log(`\nMean coverage  -> logit ${mean(grid.map(c => c.results.logit.coverage)).toFixed(3)}  `
    + `ft ${mean(grid.map(c => c.results.ft.coverage)).toFixed(3)}  `
    + `logit_hksj ${mean(grid.map(c => c.results.logit_hksj.coverage)).toFixed(3)}  (nominal 0.95)`);
  console.log(`Mean |bias|    -> logit ${mean(grid.map(c => Math.abs(c.results.logit.bias))).toFixed(4)}  `
    + `ft ${mean(grid.map(c => Math.abs(c.results.ft.bias))).toFixed(4)}`);
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
