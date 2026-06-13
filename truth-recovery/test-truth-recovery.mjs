// node truth-recovery/test-truth-recovery.mjs  — measured invariants, exits non-zero on failure.
import { runCell, runGrid } from './harness.mjs';

let pass = 0, fail = 0;
const ok = (n, c, e = '') => c ? pass++ : (console.log('FAIL ' + n + ' ' + e), fail++);

// 1. Both DL transforms under-cover the true proportion under heterogeneity.
{
  const grid = runGrid({ reps: 1500, pis: [0.2], taus: [0.3, 0.6], ks: [5, 15] });
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const covL = mean(grid.map(c => c.results.logit.coverage));
  ok('DL logit under-covers (<0.93)', covL < 0.93, `cov=${covL.toFixed(3)}`);
}
// 2. The HKSJ interval improves coverage of the true proportion over DL logit.
{
  const grid = runGrid({ reps: 1500, pis: [0.2, 0.5], taus: [0.3, 0.6], ks: [5, 15] });
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const covL = mean(grid.map(c => c.results.logit.coverage));
  const covH = mean(grid.map(c => c.results.logit_hksj.coverage));
  ok('HKSJ coverage > DL logit coverage', covH > covL + 0.02, `hksj=${covH.toFixed(3)} dl=${covL.toFixed(3)}`);
  ok('HKSJ coverage closer to nominal', Math.abs(covH - 0.95) < Math.abs(covL - 0.95));
}
// 3. Determinism.
{
  const a = runCell(0.2, 0.5, 10, 400, (() => { let s = 42 >>> 0; return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })());
  const b = runCell(0.2, 0.5, 10, 400, (() => { let s = 42 >>> 0; return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })());
  ok('deterministic', a.logit.coverage === b.logit.coverage && a.logit_hksj.coverage === b.logit_hksj.coverage);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
