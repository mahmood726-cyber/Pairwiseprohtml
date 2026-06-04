/* proportion / prevalence meta-analysis engine — pure JS, Node + browser.
 *
 * Random-effects pooling of single proportions via two user-selectable
 * variance-stabilising transforms, with DerSimonian-Laird tau^2, I^2 and CI,
 * back-transformed to the proportion scale.
 *
 * Transforms:
 *  (a) Logit (metafor measure="PLO"):
 *        yi = log(p/(1-p)),  vi = 1/xi + 1/(ni-xi)
 *      Zero-cell rule: add 0.5 to BOTH xi and (ni-xi) ONLY when xi==0 or xi==ni
 *      (matches metafor add=1/2, to="only0"). Back-transform pooled logit with
 *      the inverse logit.
 *  (b) Freeman-Tukey double arcsine (metafor measure="PFT", method="DL"):
 *        yi = 0.5*( asin(sqrt(xi/(ni+1))) + asin(sqrt((xi+1)/(ni+1))) )
 *        vi = 1/(4*ni+2)
 *      Back-transform the POOLED FT value with Miller's inverse using the
 *      HARMONIC MEAN of the ni (metafor transf.ipft.hm). This harmonic-mean
 *      step is the classic gotcha and is implemented in ipftHm() below.
 *
 * Pooling: DerSimonian-Laird random effects. tau2_DL / genQ pattern follows
 * htmlpairwise-repro/engine.js. DL is flagged unreliable for k<10.
 *
 * Gotchas baked in (see README "Provenance"):
 *  - p clamped to [1e-10, 1-1e-10] before logit (avoids +-Inf).
 *  - Zero-cell 0.5 correction is conditional, never unconditional.
 *  - FT back-transform uses harmonic mean of ni, not a single n.
 *  - Numeric fallbacks use ?? so a legitimate 0 is never dropped.
 */
(function (root) {
  'use strict';

  // ===== numeric helpers ===================================================
  var EPS = 1e-10;
  function clampP(p) { return p < EPS ? EPS : (p > 1 - EPS ? 1 - EPS : p); }

  // inverse normal CDF (Acklam, |err| < 1.15e-9) — for z multipliers / CIs.
  function qnorm(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
      3.754408661907416e+00];
    var plow = 0.02425, phigh = 1 - plow, q, r;
    if (p < plow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= phigh) {
      q = p - 0.5; r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  function zCrit(conf) { return qnorm(1 - (1 - (conf ?? 0.95)) / 2); }

  // ===== per-study effect sizes ============================================
  // Logit transform of one study.  add0.5 only when xi==0 or xi==ni.
  function logitStudy(xi, ni) {
    var x = xi, m = ni - xi, corrected = false;
    if (xi === 0 || xi === ni) { x = xi + 0.5; m = (ni - xi) + 0.5; corrected = true; }
    var yi = Math.log(x / m);
    var vi = 1 / x + 1 / m;
    return { yi: yi, vi: vi, corrected: corrected };
  }
  // Freeman-Tukey double arcsine of one study (no zero-cell correction needed).
  function ftStudy(xi, ni) {
    var yi = 0.5 * (Math.asin(Math.sqrt(xi / (ni + 1))) +
      Math.asin(Math.sqrt((xi + 1) / (ni + 1))));
    var vi = 1 / (4 * ni + 2);
    return { yi: yi, vi: vi, corrected: false };
  }

  // Miller's harmonic-mean inverse double-arcsine (metafor transf.ipft.hm).
  // p_hat = 0.5 * ( 1 - sign(cos(2t)) * sqrt( 1 - (sin(2t) + (sin(2t) - 1/sin(2t))/nhm)^2 ) )
  // where t is the pooled FT value and nhm is the harmonic mean of the ni.
  // Clamped to [0,1].
  function ipftHm(t, ni) {
    var k = ni.length, denom = 0;
    for (var i = 0; i < k; i++) denom += 1 / ni[i];
    var nhm = k / denom;                       // harmonic mean of sample sizes
    var s2 = Math.sin(2 * t);                  // sin(2t)
    var c2 = Math.cos(2 * t);                  // cos(2t)
    var inner = s2 + (s2 - 1 / s2) / nhm;
    var rad = 1 - inner * inner;
    if (rad < 0) rad = 0;                       // guard tiny negative from rounding
    var sign = c2 === 0 ? 0 : (c2 > 0 ? 1 : -1);
    var p = 0.5 * (1 - sign * Math.sqrt(rad));
    return p < 0 ? 0 : (p > 1 ? 1 : p);
  }

  // ===== DerSimonian-Laird random-effects pooling ==========================
  function weightedMean(yi, wi) {
    var sw = 0, swy = 0;
    for (var i = 0; i < yi.length; i++) { sw += wi[i]; swy += wi[i] * yi[i]; }
    return { mean: swy / sw, sumW: sw };
  }
  // generalized Q at a given tau^2 (sum of standardized residuals).
  function genQ(yi, vi, tau2) {
    var wi = vi.map(function (v) { return 1 / (v + tau2); });
    var wm = weightedMean(yi, wi);
    var Q = 0;
    for (var i = 0; i < yi.length; i++) Q += wi[i] * Math.pow(yi[i] - wm.mean, 2);
    return { Q: Q, mean: wm.mean, sumW: wm.sumW, wi: wi };
  }
  function tau2_DL(yi, vi) {
    var k = yi.length, wi = vi.map(function (v) { return 1 / v; });
    var sw = wi.reduce(function (a, b) { return a + b; }, 0);
    var sw2 = wi.reduce(function (a, b) { return a + b * b; }, 0);
    var Q = genQ(yi, vi, 0).Q;
    var C = sw - sw2 / sw;
    return Math.max(0, (Q - (k - 1)) / C);
  }
  // Higgins-Thompson typical within-study variance for I^2.
  function typicalVar(vi) {
    var k = vi.length, wi = vi.map(function (v) { return 1 / v; });
    var sw = wi.reduce(function (a, b) { return a + b; }, 0);
    var sw2 = wi.reduce(function (a, b) { return a + b * b; }, 0);
    return (k - 1) * sw / (sw * sw - sw2);
  }
  function Isq(tau2, vi) { var s2 = typicalVar(vi); return 100 * tau2 / (tau2 + s2); }

  /* metaProp(studies, opts) — RE meta-analysis of single proportions.
   * studies: [{ label, xi, ni }]
   * opts: { transform:'logit'|'ft', level:0.95 }
   * Returns per-study effects (on the analysis scale AND back as proportions)
   * plus the pooled proportion with CI, tau^2, I^2, Q.
   */
  function metaProp(studies, opts) {
    opts = opts || {};
    var transform = opts.transform || 'logit';
    var level = opts.level ?? 0.95;
    var k = studies.length, warnings = [];
    if (k < 2) return { error: 'Need at least 2 studies.' };

    // validate inputs
    for (var i = 0; i < k; i++) {
      var s = studies[i];
      if (!(s.ni > 0) || s.xi < 0 || s.xi > s.ni || s.xi !== Math.round(s.xi) || s.ni !== Math.round(s.ni)) {
        return { error: 'Study "' + (s.label ?? i) + '": need integer 0 <= xi <= ni and ni > 0.' };
      }
    }

    var ni = studies.map(function (s) { return s.ni; });
    var fn = transform === 'ft' ? ftStudy : logitStudy;
    var yi = [], vi = [], rows = [];
    var anyCorrected = false;
    for (var j = 0; j < k; j++) {
      var sj = studies[j];
      var e = fn(sj.xi, sj.ni);
      yi.push(e.yi); vi.push(e.vi);
      if (e.corrected) anyCorrected = true;
      rows.push({
        label: sj.label ?? ('Study ' + (j + 1)),
        xi: sj.xi, ni: sj.ni,
        prop: sj.xi / sj.ni,                       // raw observed proportion
        yi: e.yi, vi: e.vi, corrected: e.corrected
      });
    }
    if (anyCorrected && transform === 'logit') {
      warnings.push('A 0.5 continuity correction was applied to study rows with 0 or ni events (logit only).');
    }
    if (transform === 'logit') {
      var nzero = studies.filter(function (s) { return s.xi === 0 || s.xi === s.ni; }).length;
      if (nzero > 0) {
        warnings.push('With boundary proportions present, the Freeman-Tukey transform avoids the continuity correction; consider comparing both.');
      }
    }

    var tau2 = tau2_DL(yi, vi);
    if (k < 10) warnings.push('DerSimonian-Laird is unreliable for k<10; treat tau^2 / I^2 as approximate.');

    var g = genQ(yi, vi, tau2);
    var mu = g.mean, seMu = Math.sqrt(1 / g.sumW);
    var QFE = genQ(yi, vi, 0).Q, df = k - 1;
    var I2 = Isq(tau2, vi);
    var z = zCrit(level);
    var muLo = mu - z * seMu, muHi = mu + z * seMu;

    // per-study CIs on the analysis scale, then back to proportion.
    var back = transform === 'ft'
      ? function (t) { return ipftHm(t, ni); }
      : function (t) { return 1 / (1 + Math.exp(-t)); };           // inverse logit

    // For per-study display, back-transform each yi (+/- z*sqrt(vi)). FT single
    // study uses its own ni harmonic mean (= ni itself), i.e. ipftHm(yi,[ni]).
    rows.forEach(function (r) {
      var slo = r.yi - z * Math.sqrt(r.vi), shi = r.yi + z * Math.sqrt(r.vi);
      if (transform === 'ft') {
        r.est = ipftHm(r.yi, [r.ni]);
        r.lo = ipftHm(slo, [r.ni]);
        r.hi = ipftHm(shi, [r.ni]);
      } else {
        r.est = back(r.yi); r.lo = back(slo); r.hi = back(shi);
      }
      // weight = inverse RE variance, normalised later
      r.weight = 1 / (r.vi + tau2);
    });
    var wsum = rows.reduce(function (a, r) { return a + r.weight; }, 0);
    rows.forEach(function (r) { r.weightPct = 100 * r.weight / wsum; });

    var pooled = {
      mu: mu, seMu: seMu, muLo: muLo, muHi: muHi,         // on analysis scale
      est: back(mu), lo: back(muLo), hi: back(muHi)        // back-transformed proportion
    };
    // logit CI is monotone (lo<hi); FT inverse can be non-monotone near the
    // boundary, so order the back-transformed endpoints defensively.
    if (pooled.lo > pooled.hi) { var t = pooled.lo; pooled.lo = pooled.hi; pooled.hi = t; }

    return {
      transform: transform, level: level, k: k,
      studies: rows, pooled: pooled,
      tau2: tau2, I2: I2, Q: QFE, Qdf: df,
      nhm: (function () { var d2 = 0; for (var q = 0; q < k; q++) d2 += 1 / ni[q]; return k / d2; })(),
      warnings: warnings
    };
  }

  var api = {
    clampP: clampP, qnorm: qnorm, zCrit: zCrit,
    logitStudy: logitStudy, ftStudy: ftStudy, ipftHm: ipftHm,
    genQ: genQ, tau2_DL: tau2_DL, typicalVar: typicalVar, Isq: Isq,
    metaProp: metaProp,
    constants: { EPS: EPS }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PropMeta = api;
})(typeof window !== 'undefined' ? window : this);
