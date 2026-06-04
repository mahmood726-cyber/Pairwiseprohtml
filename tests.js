/* Node tests for the proportion meta-analysis engine.
 *
 * Reference values from metafor 4.x (R 4.6.0), dataset (8 studies, one zero-cell):
 *   xi <- c(0, 3, 12, 5, 20,  8, 15,  2)
 *   ni <- c(20,25,60,40,100, 50, 80, 18)
 *
 * Logit (PLO, escalc default add=1/2 to="only0", rma method="DL",
 *        predict transf=transf.ilogit):
 *   yi: -3.71357207 -1.99243016 -1.38629436 -1.94591015 -1.38629436
 *       -1.65822808 -1.46633707 -2.07944154
 *   vi:  2.04878049  0.37878788  0.10416667  0.22857143  0.0625
 *        0.14880952  0.08205128  0.5625
 *   mu(logit) = -1.55769994   tau2 = 0   I2 = 0   QE = 4.832544
 *   pooled prop = 0.17397694  (ci.lb 0.138842, ci.ub 0.21577522)
 *
 * Freeman-Tukey (PFT, rma method="DL",
 *        predict transf=transf.ipft.hm, targ=list(ni=ni)):
 *   yi: 0.10999399 0.37481851 0.46969181 0.37464187 0.46732226
 *       0.4203794  0.45270698 0.36953025
 *   vi: 0.01219512 0.00980392 0.00413223 0.00617284 0.00248756
 *       0.0049505  0.00310559 0.01351351
 *   mu(ft) = 0.40932045   tau2 = 0.00260063   I2 = 33.031091   QE = 10.452612
 *   pooled prop = 0.14884037  (ci.lb 0.10474088, ci.ub 0.19850281)
 *
 * Run: node tests.js
 */
var M = require('./engine.js');
var pass = 0, fail = 0;
function approx(name, got, want, tol) {
  tol = tol == null ? 1e-3 : tol;
  if (got == null || !isFinite(got)) { console.log('FAIL ' + name + ': got ' + got); fail++; return; }
  if (Math.abs(got - want) <= tol) pass++;
  else { console.log('FAIL ' + name + ': got ' + got + ' want ' + want + ' (tol ' + tol + ')'); fail++; }
}
function ok(name, c) { if (c) pass++; else { console.log('FAIL ' + name); fail++; } }

var labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
var xi = [0, 3, 12, 5, 20, 8, 15, 2];
var ni = [20, 25, 60, 40, 100, 50, 80, 18];
var studies = labels.map(function (L, i) { return { label: L, xi: xi[i], ni: ni[i] }; });

// metafor reference arrays
var refLogitYi = [-3.71357207, -1.99243016, -1.38629436, -1.94591015, -1.38629436, -1.65822808, -1.46633707, -2.07944154];
var refLogitVi = [2.04878049, 0.37878788, 0.10416667, 0.22857143, 0.0625, 0.14880952, 0.08205128, 0.5625];
var refFtYi = [0.10999399, 0.37481851, 0.46969181, 0.37464187, 0.46732226, 0.4203794, 0.45270698, 0.36953025];
var refFtVi = [0.01219512, 0.00980392, 0.00413223, 0.00617284, 0.00248756, 0.0049505, 0.00310559, 0.01351351];

// ===== logit per-study yi/vi vs metafor =====
var rLo = M.metaProp(studies, { transform: 'logit', level: 0.95 });
for (var i = 0; i < 8; i++) {
  approx('logit yi[' + i + ']', rLo.studies[i].yi, refLogitYi[i], 1e-3);
  approx('logit vi[' + i + ']', rLo.studies[i].vi, refLogitVi[i], 1e-3);
}

// ===== zero-cell handling (study A: xi=0) =====
ok('zero-cell study flagged corrected', rLo.studies[0].corrected === true);
ok('non-zero-cell study NOT corrected', rLo.studies[2].corrected === false);
// add 0.5 to both: yi = log(0.5/20.5), vi = 1/0.5 + 1/20.5
approx('zero-cell yi = log(0.5/20.5)', rLo.studies[0].yi, Math.log(0.5 / 20.5), 1e-9);
approx('zero-cell vi = 1/0.5 + 1/20.5', rLo.studies[0].vi, 1 / 0.5 + 1 / 20.5, 1e-9);

// ===== logit pooled vs metafor =====
approx('logit pooled mu (logit scale)', rLo.pooled.mu, -1.55769994, 1e-3);
approx('logit tau2 (DL)', rLo.tau2, 0, 1e-6);
approx('logit Q', rLo.Q, 4.832544, 1e-3);
approx('logit pooled proportion', rLo.pooled.est, 0.17397694, 1e-3);
approx('logit pooled CI lower', rLo.pooled.lo, 0.138842, 1e-3);
approx('logit pooled CI upper', rLo.pooled.hi, 0.21577522, 1e-3);

// ===== FT per-study yi/vi vs metafor =====
var rFt = M.metaProp(studies, { transform: 'ft', level: 0.95 });
for (var j = 0; j < 8; j++) {
  approx('FT yi[' + j + ']', rFt.studies[j].yi, refFtYi[j], 1e-3);
  approx('FT vi[' + j + ']', rFt.studies[j].vi, refFtVi[j], 1e-5);
}

// ===== FT pooled vs metafor (harmonic-mean back-transform) =====
approx('FT pooled mu (ft scale)', rFt.pooled.mu, 0.40932045, 1e-3);
approx('FT tau2 (DL)', rFt.tau2, 0.00260063, 1e-4);
approx('FT I2', rFt.I2, 33.031091, 1e-1);
approx('FT Q', rFt.Q, 10.452612, 1e-3);
approx('FT pooled proportion (ipft.hm)', rFt.pooled.est, 0.14884037, 1e-3);
approx('FT pooled CI lower', rFt.pooled.lo, 0.10474088, 1e-3);
approx('FT pooled CI upper', rFt.pooled.hi, 0.19850281, 1e-3);

// ===== I^2 sanity =====
ok('logit I2 == 0 (homogeneous here)', Math.abs(rLo.I2 - 0) < 1e-6);
ok('FT I2 in [0,100]', rFt.I2 >= 0 && rFt.I2 <= 100);
ok('FT I2 > 0 (some heterogeneity)', rFt.I2 > 0);

// ===== pooled proportion is a valid proportion =====
ok('logit pooled in (0,1)', rLo.pooled.est > 0 && rLo.pooled.est < 1);
ok('FT pooled in (0,1)', rFt.pooled.est > 0 && rFt.pooled.est < 1);
ok('logit CI ordered & brackets est', rLo.pooled.lo < rLo.pooled.est && rLo.pooled.est < rLo.pooled.hi);
ok('FT CI ordered & brackets est', rFt.pooled.lo < rFt.pooled.est && rFt.pooled.est < rFt.pooled.hi);

// ===== per-study weights sum to ~100% =====
(function () {
  var s = rLo.studies.reduce(function (a, r) { return a + r.weightPct; }, 0);
  approx('logit weights sum to 100%', s, 100, 1e-6);
})();

// ===== raw observed proportion exposed =====
approx('raw prop study C = 12/60', rLo.studies[2].prop, 12 / 60, 1e-12);

// ===== input validation =====
ok('rejects xi>ni', M.metaProp([{ label: 'x', xi: 5, ni: 3 }, { label: 'y', xi: 1, ni: 4 }]).error != null);
ok('rejects k<2', M.metaProp([{ label: 'x', xi: 1, ni: 4 }]).error != null);
ok('rejects non-integer xi', M.metaProp([{ label: 'x', xi: 1.5, ni: 4 }, { label: 'y', xi: 1, ni: 4 }]).error != null);

// ===== ipftHm single-study round-trip sanity (no heterogeneity) =====
(function () {
  // a study with p=0.5: ft = 0.5*(asin(sqrt(0.5/(n+1)))+asin(sqrt(1.5/(n+1)))) ... just
  // check the inverse maps a known pooled value back into [0,1]
  var p = M.ipftHm(0.7227, [50]); // ~ p around 0.43 for n=50
  ok('ipftHm returns valid proportion', p >= 0 && p <= 1);
})();

// ===== DL warns for k<10 =====
ok('DL warns for k<10', rLo.warnings.some(function (w) { return /DerSimonian/.test(w); }));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
