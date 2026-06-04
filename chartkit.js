/* e156 capsule chart-kit — offline, dependency-free SVG primitives.
 * Exposes window.ChartKit. See docs/capsule-visual-standard.md §3 / §5.
 * First primitive: renderForest (the reference exemplar). More to follow.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function tokGetter() {
    var T = getComputedStyle(document.documentElement);
    return function (n, f) { return (T.getPropertyValue(n).trim() || f); };
  }

  function fmt(v) {
    if (v == null || !isFinite(v)) return '';
    var a = Math.abs(v);
    return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
  }

  // Nice ticks: log-aware (ratio scales) or linear.
  function niceForestTicks(min, max, log) {
    var out = [], v, p;
    if (log) {
      // candidate ratio ticks spanning the range
      var cands = [0.1,0.125,0.2,0.25,0.33,0.5,0.67,0.8,1,1.25,1.5,2,2.5,3,4,5,8,10];
      for (var i = 0; i < cands.length; i++) {
        v = cands[i];
        if (v >= min * 0.97 && v <= max * 1.03) out.push(v);
      }
      if (out.indexOf(1) === -1 && min <= 1 && max >= 1) out.push(1);
      // thin to ~6
      while (out.length > 7) { out = out.filter(function (_, k) { return k % 2 === 0; }); }
      return out.sort(function (a, b) { return a - b; });
    }
    var span = max - min;
    if (span <= 0) return [min];
    var target = 6, step = Math.pow(10, Math.floor(Math.log10(span / target)));
    var err = span / target / step;
    if (err >= 7.5) step *= 10; else if (err >= 3) step *= 5; else if (err >= 1.5) step *= 2;
    for (v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(+v.toFixed(6));
    return out;
  }

  // Shared tooltip (one element, reused)
  var _tip;
  function showTip(e, html) {
    if (!_tip) {
      _tip = document.createElement('div');
      _tip.className = 'ck-tip';
      document.body.appendChild(_tip);
    }
    _tip.style.cssText = 'position:fixed;pointer-events:none;background:#1a1a1a;color:#fff;' +
      'font:11px/1.4 Georgia,serif;padding:6px 9px;border-radius:4px;z-index:9999;max-width:260px;' +
      'box-shadow:0 2px 8px rgba(0,0,0,.25)';
    _tip.innerHTML = html; _tip.style.display = 'block'; moveTip(e);
  }
  function moveTip(e) { if (_tip) { _tip.style.left = (e.clientX + 13) + 'px'; _tip.style.top = (e.clientY + 13) + 'px'; } }
  function hideTip() { if (_tip) _tip.style.display = 'none'; }

  /**
   * renderForest(svgEl, studies, opts)
   * studies: [{ label, est, lo, hi, weight }]  (natural scale; ratio measures pass opts.log=true)
   * opts: { measure, pooled:{est,lo,hi,pi_lo,pi_hi}, log, null, claim, estimand,
   *         favoursLow, favoursHigh, flag:{label,note} }
   */
  function renderForest(svgEl, studies, opts) {
    opts = opts || {};
    var o = Object.assign({ log: false, null: 1, measure: 'effect', width: 900,
      rowH: 28, padL: 205, padR: 134, padT: 62, padB: 54 }, opts);
    var tok = tokGetter();
    // numeric token: CSS values carry units ("6px") so unary + gives NaN — parse it.
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = {
      ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'),
      annot: tok('--c-annot', '#7a8086'), grid: tok('--c-grid', '#e7e9ec'),
      axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'),
      est: tok('--c-estimate', '#1a1a1a'), pi: tok('--c-pi', '#b9c2cb')
    };
    var n = studies.length;
    var W = o.width, x0 = o.padL, x1 = W - o.padR, yTop = o.padT;
    var gap = o.pooled ? 16 : 0;                 // separation before the overall row
    var studyBot = yTop + n * o.rowH;
    var pooledCy = studyBot + gap + o.rowH / 2;
    var yBot = o.pooled ? (studyBot + gap + o.rowH) : studyBot;
    var H = yBot + o.padB;

    var tx = function (v) { return o.log ? Math.log(v) : v; };
    var all = [];
    studies.forEach(function (s) { all.push(s.lo, s.hi); });
    if (o.pooled) all.push(o.pooled.lo, o.pooled.hi, o.pooled.pi_lo, o.pooled.pi_hi);
    if (o.refLine && o.refLine.x != null) all.push(o.refLine.x);
    all.push(o.null);
    all = all.filter(function (v) { return v != null && isFinite(v) && (!o.log || v > 0); }).map(tx);
    var dmin = Math.min.apply(null, all), dmax = Math.max.apply(null, all);
    var pad = (dmax - dmin) * 0.06 || 0.1; dmin -= pad; dmax += pad;
    var sx = function (v) { return x0 + (tx(v) - dmin) / (dmax - dmin) * (x1 - x0); };
    var wmax = Math.max.apply(null, studies.map(function (s) { return s.weight || 1; }));
    var wsum = studies.reduce(function (t, s) { return t + (s.weight || 0); }, 0);
    var bmin = ntok('--box-min', 6), bmax = ntok('--box-max', 22);
    var boxSide = function (w) { return bmin + Math.sqrt((w || 1) / wmax) * (bmax - bmin); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';   // fill container; viewBox sets text scale
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Forest plot, ' + o.measure + '. ' + (o.claim || '') + ' ' + n + ' studies.');

    function el(t, a, p) {
      var e = document.createElementNS(NS, t); a = a || {};
      for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e;
    }
    function txt(x, y, s, a, p) {
      var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e;
    }
    function pct(w) { return wsum ? Math.round((w / wsum) * 100) + '%' : '—'; }
    function addAnnot(x, y, s, anchor, leaderTo, p) {
      if (leaderTo) el('line', { x1: leaderTo.x, y1: leaderTo.y, x2: x, y2: y + 3, stroke: C.annot, 'stroke-width': '0.75' }, p);
      var t = txt(x, y, s, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot }, p);
      if (anchor) t.setAttribute('text-anchor', anchor);
    }
    function addTip(g, html) {
      g.addEventListener('mouseenter', function (e) { showTip(e, html); });
      g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', hideTip);
      g.addEventListener('focus', function (e) { showTip(e, html); });
      g.addEventListener('blur', hideTip);
    }

    // title (assertion) + subtitle (estimand)
    txt(x0, 24, o.claim || ('Forest plot of ' + o.measure),
      { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(x0, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // gridlines + ticks
    var ticks = niceForestTicks(o.log ? Math.exp(dmin) : dmin, o.log ? Math.exp(dmax) : dmax, o.log);
    ticks.forEach(function (v) {
      var x = sx(v);
      el('line', { x1: x, x2: x, y1: yTop, y2: yBot, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(x, yBot + 16, fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' });
    });
    // null reference (dashed, eye-distinct) — pass opts.null=null to suppress
    // (e.g. single-proportion / single-mean forests have no meaningful null)
    if (o.null != null && isFinite(o.null)) {
      var xn = sx(o.null);
      el('line', { x1: xn, x2: xn, y1: yTop, y2: yBot, stroke: C.nul, 'stroke-width': ntok('--hair-null', 1.25), 'stroke-dasharray': '4 3' });
    }
    // optional secondary reference line (e.g. overall pooled, for LOO / cumulative)
    if (o.refLine && o.refLine.x != null) {
      var rx = sx(o.refLine.x);
      el('line', { x1: rx, x2: rx, y1: yTop, y2: yBot, stroke: C.est, 'stroke-width': '1', 'stroke-dasharray': '2 3', opacity: '0.5' });
      if (o.refLine.label) {
        var rl = txt(rx, yTop - 5, o.refLine.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot, 'text-anchor': 'middle' });
        rl.setAttribute('font-style', 'italic');
      }
    }

    // study rows. Interactive mode: pass opts.onToggle(index, study) and each
    // study's `included` flag — excluded studies render muted and rows become
    // toggle buttons (click / Enter / Space), a superset of a display forest.
    var interactive = typeof o.onToggle === 'function';
    studies.forEach(function (s, i) {
      var cy = yTop + i * o.rowH + o.rowH / 2;
      var inc = s.included !== false;
      var ga = { tabindex: '0', 'data-i': String(i) };
      if (interactive) {
        ga.role = 'button'; ga['aria-pressed'] = String(inc);
        ga['aria-label'] = s.label + ': ' + o.measure + ' ' + fmt(s.est) + ' (' + fmt(s.lo) + ' to ' + fmt(s.hi) + '). ' +
          (inc ? 'Included — activate to exclude.' : 'Excluded — activate to include.');
      } else {
        ga.role = 'listitem';
        ga['aria-label'] = s.label + ': ' + o.measure + ' ' + fmt(s.est) + ' (' + fmt(s.lo) + ' to ' + fmt(s.hi) + '), weight ' + pct(s.weight);
      }
      var g = el('g', ga);
      if (!inc) g.setAttribute('opacity', '0.36');
      if (interactive) {
        g.style.cursor = 'pointer';
        g.addEventListener('click', function () { o.onToggle(i, s); });
        g.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); o.onToggle(i, s); }
        });
      }
      addTip(g, '<b>' + s.label + '</b><br>' + o.measure + ' ' + fmt(s.est) + ' (' + fmt(s.lo) + '–' + fmt(s.hi) + ')<br>weight ' + pct(s.weight) + (interactive ? '<br><i>' + (inc ? 'click to exclude' : 'click to include') + '</i>' : ''));
      txt(x0 - 10, cy + 3.5, s.label, { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink, 'text-anchor': 'end' }, g);
      el('line', { x1: sx(s.lo), x2: sx(s.hi), y1: cy, y2: cy, stroke: C.ink, 'stroke-width': ntok('--whisker-w', 1.25) }, g);
      var sd = boxSide(s.weight);
      el('rect', { x: sx(s.est) - sd / 2, y: cy - sd / 2, width: sd, height: sd, fill: C.est }, g);
      txt(x1 + 12, cy + 3.5, fmt(s.est) + ' (' + fmt(s.lo) + '–' + fmt(s.hi) + ')',
        { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2 }, g);
    });

    // pooled: a clean labeled "Overall" row (PI band behind diamond + readout)
    if (o.pooled) {
      var p = o.pooled, cy2 = pooledCy;
      el('line', { x1: x0, x2: x1, y1: studyBot + gap / 2, y2: studyBot + gap / 2, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      if (p.pi_lo != null && p.pi_hi != null)
        el('line', { x1: sx(p.pi_lo), x2: sx(p.pi_hi), y1: cy2, y2: cy2, stroke: C.pi, 'stroke-width': '7', 'stroke-linecap': 'round' });
      var dh = ntok('--diamond-h', 16) / 2, xe = sx(p.est);
      el('polygon', { points: sx(p.lo) + ',' + cy2 + ' ' + xe + ',' + (cy2 - dh) + ' ' + sx(p.hi) + ',' + cy2 + ' ' + xe + ',' + (cy2 + dh), fill: C.est });
      txt(x0 - 10, cy2 + 3.5, o.pooledLabel || 'Overall · random-effects',
        { 'font-size': tok('--t-fs-axis', '12px'), 'font-weight': '600', fill: C.ink, 'text-anchor': 'end' });
      txt(x1 + 12, cy2 + 3.5, fmt(p.est) + ' (' + fmt(p.lo) + '–' + fmt(p.hi) + ')',
        { 'font-size': tok('--t-fs-tick', '10.5px'), 'font-weight': '600', fill: C.ink });
      if (p.pi_lo != null)                       // PI numbers under the readout (band shows it too)
        txt(x1 + 12, cy2 + 16, 'PI ' + fmt(p.pi_lo) + '–' + fmt(p.pi_hi),
          { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot });
    }

    // directional cues (below the axis ticks)
    if (o.favoursLow) txt(xn - 8, yBot + 34, '◂ ' + o.favoursLow, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot, 'text-anchor': 'end' });
    if (o.favoursHigh) txt(xn + 8, yBot + 34, o.favoursHigh + ' ▸', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot });

    // leverage flag — short italic note tucked under the flagged row (no clip, no overlap)
    if (o.flag) {
      var idx = studies.findIndex(function (s) { return s.label === o.flag.label; });
      if (idx >= 0) {
        var fy = yTop + idx * o.rowH + o.rowH / 2;
        var fn = txt(x0, fy + 13, o.flag.note, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot });
        fn.setAttribute('font-style', 'italic');
      }
    }

    // axis spine
    el('line', { x1: x0, x2: x1, y1: yBot, y2: yBot, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderFunnel(svgEl, points, opts) — contour-enhanced funnel plot.
   * points: [{ label, x, se }]  (x = effect; log scale for ratios via opts.log)
   * opts: { measure, log, pooled (effect, same scale as x), egger:{p, intercept},
   *         width, height }
   */
  function renderFunnel(svgEl, points, opts) {
    opts = opts || {};
    var o = Object.assign({ log: false, measure: 'effect', width: 560, height: 360,
      padL: 70, padR: 134, padT: 56, padB: 50 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'),
      est: tok('--c-estimate', '#1a1a1a'), s1: tok('--seq-1', '#f0f4f8'), s2: tok('--seq-2', '#cfe0ec') };
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB;
    var pooled = (o.pooled != null) ? o.pooled : 0, NULLE = 0;
    var imputed = o.imputed || [];                 // trim-and-fill imputed studies [{x,se}]
    var seVals = points.map(function (p) { return p.se; }).concat(imputed.map(function (p) { return p.se; }));
    var maxSE = Math.max.apply(null, seVals) * 1.14 || 1;
    var effs = points.map(function (p) { return p.x; }).concat(imputed.map(function (p) { return p.x; }))
      .concat([pooled - 1.96 * maxSE, pooled + 1.96 * maxSE, NULLE]);
    if (o.adjusted != null) effs.push(o.adjusted);
    var dmin = Math.min.apply(null, effs) - 0.04, dmax = Math.max.apply(null, effs) + 0.04;
    var sx = function (e) { return x0 + (e - dmin) / (dmax - dmin) * (x1 - x0); };
    var sy = function (se) { return yT + (se / maxSE) * (yB - yT); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';   // fill container; viewBox sets text scale
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Contour-enhanced funnel plot. ' + (o.claim || '') + ' ' + points.length + ' studies.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    function addTip(g, html) {
      g.addEventListener('mouseenter', function (e) { showTip(e, html); });
      g.addEventListener('mousemove', moveTip); g.addEventListener('mouseleave', hideTip);
      g.addEventListener('focus', function (e) { showTip(e, html); }); g.addEventListener('blur', hideTip);
    }
    // clip everything inside the plot rect (contours/funnel/points never overflow)
    var defs = el('defs'); var cid = 'ck-fc-' + (svgEl.id || 'x');
    var cp = el('clipPath', { id: cid }, defs);
    el('rect', { x: x0, y: yT, width: (x1 - x0), height: (yB - yT) }, cp);
    var plot = el('g', { 'clip-path': 'url(#' + cid + ')' });
    function tri(z, fill) {
      el('polygon', { points: sx(NULLE) + ',' + yT + ' ' + sx(NULLE - z * maxSE) + ',' + yB + ' ' + sx(NULLE + z * maxSE) + ',' + yB, fill: fill, 'fill-opacity': '0.55' }, plot);
    }

    // title + subtitle
    txt(x0, 24, o.claim || ('Funnel plot · ' + o.measure),
      { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(x0, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // significance contours, centred on the null (nested: p<.01 band, then p>.05 core)
    tri(2.58, C.s1); tri(1.96, C.s2);
    txt(sx(NULLE), yB - 6, 'p > .05', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ink2, 'text-anchor': 'middle' }, plot);

    // y-axis (SE) gridlines + ticks + rotated title
    var seTicks = niceForestTicks(0, maxSE, false).filter(function (v) { return v >= 0 && v <= maxSE; });
    seTicks.forEach(function (se) {
      var y = sy(se);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(x0 - 8, y + 3.5, se.toFixed(2), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' });
    });
    var yTitle = txt(16, (yT + yB) / 2, 'Standard error', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    yTitle.setAttribute('transform', 'rotate(-90 16 ' + ((yT + yB) / 2) + ')');

    // pseudo-95% CI funnel, centred on the pooled estimate (dashed guides)
    el('line', { x1: sx(pooled), y1: yT, x2: sx(pooled - 1.96 * maxSE), y2: yB, stroke: C.nul, 'stroke-width': '1', 'stroke-dasharray': '4 3' }, plot);
    el('line', { x1: sx(pooled), y1: yT, x2: sx(pooled + 1.96 * maxSE), y2: yB, stroke: C.nul, 'stroke-width': '1', 'stroke-dasharray': '4 3' }, plot);
    // null vertical
    el('line', { x1: sx(NULLE), x2: sx(NULLE), y1: yT, y2: yB, stroke: C.nul, 'stroke-width': ntok('--hair-null', 1.25), 'stroke-dasharray': '4 3' }, plot);

    // x-axis (effect) ticks — back-transformed for ratio measures
    var xt = niceForestTicks(o.log ? Math.exp(dmin) : dmin, o.log ? Math.exp(dmax) : dmax, o.log);
    xt.forEach(function (v) {
      var e = o.log ? Math.log(v) : v, x = sx(e);
      if (x < x0 - 1 || x > x1 + 1) return;
      txt(x, yB + 16, fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' });
    });
    txt((x0 + x1) / 2, yB + 36, o.measure + (o.log ? ' (log scale)' : ''), { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });

    // trim-and-fill adjusted estimate (distinct dashed line, drawn behind points)
    if (o.adjusted != null) {
      el('line', { x1: sx(o.adjusted), x2: sx(o.adjusted), y1: yT, y2: yB, stroke: tok('--c-against', '#D55E00'), 'stroke-width': '1.5', 'stroke-dasharray': '5 3' }, plot);
    }

    // study points (flag the least-precise / highest-leverage one)
    var flagIdx = points.reduce(function (m, p, i, a) { return p.se > a[m].se ? i : m; }, 0);
    points.forEach(function (p, i) {
      var cx = sx(p.x), cy = sy(p.se);
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': p.label + ': ' + o.measure + ' ' + fmt(o.log ? Math.exp(p.x) : p.x) + ', SE ' + p.se.toFixed(2) }, plot);
      addTip(g, '<b>' + p.label + '</b><br>' + o.measure + ' ' + fmt(o.log ? Math.exp(p.x) : p.x) + '<br>SE ' + p.se.toFixed(3));
      el('circle', { cx: cx, cy: cy, r: i === flagIdx ? 5 : 4, fill: i === flagIdx ? C.est : C.ink2, stroke: '#fff', 'stroke-width': '1' }, g);
    });
    if (points.length) {
      var fp = points[flagIdx];
      txt(sx(fp.x) + 9, sy(fp.se) + 3.5, 'least precise', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot }, plot).setAttribute('font-style', 'italic');
    }

    // trim-and-fill imputed studies (hollow circles — "what symmetry would require")
    imputed.forEach(function (p) {
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': 'imputed (trim-and-fill): ' + o.measure + ' ' + fmt(o.log ? Math.exp(p.x) : p.x) + ', SE ' + p.se.toFixed(2) }, plot);
      addTip(g, '<b>imputed (trim-and-fill)</b><br>' + o.measure + ' ' + fmt(o.log ? Math.exp(p.x) : p.x) + '<br>SE ' + p.se.toFixed(3));
      el('circle', { cx: sx(p.x), cy: sy(p.se), r: 4, fill: 'none', stroke: tok('--c-against', '#D55E00'), 'stroke-width': '1.25' }, g);
    });
    if (imputed.length) {
      txt(x1 - 6, yB - 6, imputed.length + ' imputed', { 'font-size': tok('--t-fs-annot', '11px'), fill: tok('--c-against', '#D55E00'), 'text-anchor': 'end' }, plot);
    }

    // Egger annotation — inside the plot, top-right (never collides with the title)
    if (o.egger && o.egger.p != null) {
      var eg = 'Egger p = ' + (o.egger.p < 0.001 ? '<.001' : o.egger.p.toFixed(3));
      var note = o.egger.p < 0.05 ? ' · asymmetry' : ' · no clear asymmetry';
      txt(x1 - 6, yT + 15, eg + note, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: o.egger.p < 0.05 ? tok('--c-verdict-warn', '#E69F00') : C.ink2, 'text-anchor': 'end' });
      if (points.length < 10) txt(x1 - 6, yT + 30, '(low power, k<10)', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot, 'text-anchor': 'end' });
    }

    el('line', { x1: x0, x2: x1, y1: yB, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    el('line', { x1: x0, x2: x0, y1: yT, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderLOO(svgEl, rows, opts) — leave-one-out (or cumulative) stability forest.
   * rows: [{ label, est, lo, hi }] ; opts: { measure, log, null, overall:{x,label}, claim, estimand }
   * A thin specialisation of renderForest: uniform markers, a null line, and a
   * secondary reference line at the overall pooled estimate.
   */
  function renderLOO(svgEl, rows, opts) {
    opts = opts || {};
    var studies = rows.map(function (r) { return { label: r.label, est: r.est, lo: r.lo, hi: r.hi, weight: 1, included: true }; });
    return renderForest(svgEl, studies, Object.assign({ measure: 'effect', rowH: 24 }, opts, {
      pooled: null, refLine: opts.overall
    }));
  }

  // Cumulative meta-analysis is structurally identical to LOO: a forest of
  // sequential pooled rows with a null line and a reference at the final estimate.
  function renderCumulative(svgEl, rows, opts) { return renderLOO(svgEl, rows, opts); }

  /**
   * renderSubgroup(svgEl, groups, opts) — subgroup summary forest.
   * groups: [{ label, k, est, lo, hi, weight }] (one pooled estimate per subgroup)
   * opts: { measure, log, null, overall:{est,lo,hi[,pi_lo,pi_hi]}, claim, estimand }
   */
  function renderSubgroup(svgEl, groups, opts) {
    opts = opts || {};
    var studies = groups.map(function (g) {
      return { label: g.label + (g.k != null ? ' (k=' + g.k + ')' : ''), est: g.est, lo: g.lo, hi: g.hi, weight: g.weight || 1, included: true };
    });
    return renderForest(svgEl, studies, Object.assign({ measure: 'effect', rowH: 27 }, opts, {
      pooled: opts.overall, pooledLabel: opts.overallLabel || 'Overall'
    }));
  }

  /**
   * renderBubble(svgEl, points, opts) — meta-regression bubble plot.
   * points: [{ label, x (moderator), y (effect, natural scale), weight }]
   * opts: { measure, log, null, xlabel, claim, estimand,
   *         fit:{ b0, b1, xm, v00, v01, v11, slope, p } }  (coeffs on log/effect scale)
   */
  function renderBubble(svgEl, points, opts) {
    opts = opts || {};
    var o = Object.assign({ log: false, measure: 'effect', null: 1, xlabel: 'moderator',
      width: 640, height: 392, padL: 64, padR: 26, padT: 58, padB: 50 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'),
      est: tok('--c-estimate', '#1a1a1a'), line: tok('--cat-1', '#0072B2'), band: tok('--seq-2', '#cfe0ec') };
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB;
    var ly = function (e) { return o.log ? Math.log(e) : e; };
    var fit = o.fit;
    function pred(xv) { var c = xv - (fit.xm || 0), mu = fit.b0 + fit.b1 * c,
      vp = Math.max(0, (fit.v00 || 0) + 2 * c * (fit.v01 || 0) + c * c * (fit.v11 || 0)), se = Math.sqrt(vp);
      return { mu: mu, lo: mu - 1.96 * se, hi: mu + 1.96 * se }; }

    var xs = points.map(function (p) { return p.x; });
    var xmin = Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var xpad = (xmax - xmin) * 0.08 || 1; xmin -= xpad; xmax += xpad;
    var evals = points.map(function (p) { return ly(p.y); }).concat([ly(o.null)]);
    if (fit) { var e0 = pred(xmin), e1 = pred(xmax); evals.push(e0.lo, e0.hi, e1.lo, e1.hi); }
    var ymin = Math.min.apply(null, evals), ymax = Math.max.apply(null, evals);
    var yp = (ymax - ymin) * 0.08 || 0.1; ymin -= yp; ymax += yp;
    var sx = function (x) { return x0 + (x - xmin) / (xmax - xmin) * (x1 - x0); };
    var sy = function (e) { return yT + (1 - (e - ymin) / (ymax - ymin)) * (yB - yT); };
    var wmax = Math.max.apply(null, points.map(function (p) { return p.weight || 1; }));

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';   // fill container; viewBox sets text scale
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Meta-regression bubble plot. ' + (o.claim || '') + ' ' + points.length + ' studies.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    function addTip(g, html) {
      g.addEventListener('mouseenter', function (e) { showTip(e, html); }); g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', hideTip); g.addEventListener('focus', function (e) { showTip(e, html); }); g.addEventListener('blur', hideTip);
    }

    // title + subtitle
    txt(x0, 24, o.claim || ('Meta-regression · ' + o.measure), { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(x0, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    var cid = 'ck-bb-' + (svgEl.id || 'x');
    var defs = el('defs'); var cp = el('clipPath', { id: cid }, defs); el('rect', { x: x0, y: yT, width: (x1 - x0), height: (yB - yT) }, cp);
    var plot = el('g', { 'clip-path': 'url(#' + cid + ')' });

    // y gridlines + ticks (effect, back-transformed for ratios)
    var yt = niceForestTicks(o.log ? Math.exp(ymin) : ymin, o.log ? Math.exp(ymax) : ymax, o.log);
    yt.forEach(function (v) { var e = ly(v), y = sy(e); if (y < yT - 1 || y > yB + 1) return;
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) }, plot);
      txt(x0 - 8, y + 3.5, fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' });
    });
    // null reference (horizontal, dashed)
    var yn = sy(ly(o.null));
    el('line', { x1: x0, x2: x1, y1: yn, y2: yn, stroke: C.nul, 'stroke-width': ntok('--hair-null', 1.25), 'stroke-dasharray': '4 3' }, plot);

    // fitted line + 95% CI band
    if (fit) {
      var N = 28, up = [], dn = [], mid = [];
      for (var i = 0; i <= N; i++) { var xv = xmin + (xmax - xmin) * i / N, pr = pred(xv);
        up.push(sx(xv) + ',' + sy(pr.hi)); dn.push(sx(xv) + ',' + sy(pr.lo)); mid.push(sx(xv) + ',' + sy(pr.mu)); }
      el('polygon', { points: up.concat(dn.reverse()).join(' '), fill: C.band, 'fill-opacity': '0.5' }, plot);
      el('polyline', { points: mid.join(' '), fill: 'none', stroke: C.line, 'stroke-width': '2' }, plot);
    }

    // bubbles (area proportional to weight)
    points.forEach(function (p) {
      var r = 4 + Math.sqrt((p.weight || 1) / wmax) * 11;
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': p.label + ': ' + o.xlabel + ' ' + p.x + ', ' + o.measure + ' ' + fmt(p.y) }, plot);
      addTip(g, '<b>' + p.label + '</b><br>' + o.xlabel + ': ' + p.x + '<br>' + o.measure + ' ' + fmt(p.y));
      el('circle', { cx: sx(p.x), cy: sy(ly(p.y)), r: r, fill: C.line, 'fill-opacity': '0.5', stroke: C.line, 'stroke-width': '1' }, g);
    });

    // x ticks + label (integer-aware for integer moderators like year — avoids
    // half-step ticks that round to duplicate labels)
    var span = xmax - xmin, allInt = points.every(function (p) { return p.x === Math.round(p.x); });
    var xt, xv;
    if (allInt && span <= 14) { xt = []; for (xv = Math.ceil(xmin); xv <= xmax; xv++) xt.push(xv); }
    else xt = niceForestTicks(xmin, xmax, false).filter(function (v) { return v >= xmin && v <= xmax; });
    xt.forEach(function (v) { txt(sx(v), yB + 16, allInt ? String(Math.round(v)) : fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    txt((x0 + x1) / 2, yB + 36, o.xlabel, { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    var yTitle = txt(15, (yT + yB) / 2, o.measure + (o.log ? ' (log)' : ''), { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    yTitle.setAttribute('transform', 'rotate(-90 15 ' + ((yT + yB) / 2) + ')');

    // slope + p annotation (in situ, top-right)
    if (fit && fit.slope != null) {
      var sl = 'slope ' + fit.slope.toFixed(3) + (fit.p != null ? ' · p ' + (fit.p < 0.001 ? '<.001' : fit.p.toFixed(3)) : '');
      txt(x1, 24, sl, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: (fit.p != null && fit.p < 0.05) ? tok('--c-verdict-warn', '#E69F00') : C.ink2, 'text-anchor': 'end' });
      if (points.length < 10) txt(x1, 40, '(exploratory, k<10)', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot, 'text-anchor': 'end' });
    }

    el('line', { x1: x0, x2: x1, y1: yB, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    el('line', { x1: x0, x2: x0, y1: yT, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderGOSH(svgEl, points, opts) — GOSH subset cloud (effect x vs I^2 y).
   * points: [{ x (effect, natural scale), i2 (0-100) }]
   * opts: { measure, log, null, overall:{x,label}, claim, estimand }
   */
  function renderGOSH(svgEl, points, opts) {
    opts = opts || {};
    var o = Object.assign({ log: false, measure: 'effect', null: 1, width: 460, height: 300,
      padL: 60, padR: 22, padT: 56, padB: 48 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'),
      est: tok('--c-estimate', '#1a1a1a'), pt: tok('--cat-1', '#0072B2') };
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB;
    var ly = function (e) { return o.log ? Math.log(e) : e; };
    var xs = points.map(function (p) { return ly(p.x); }).concat([ly(o.null)]);
    if (o.overall && o.overall.x != null) xs.push(ly(o.overall.x));
    var dmin = Math.min.apply(null, xs), dmax = Math.max.apply(null, xs);
    var xp = (dmax - dmin) * 0.06 || 0.1; dmin -= xp; dmax += xp;
    var sx = function (e) { return x0 + (e - dmin) / (dmax - dmin) * (x1 - x0); };
    var sy = function (i2) { return yT + (1 - i2 / 100) * (yB - yT); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'GOSH subset plot. ' + (o.claim || '') + ' ' + points.length + ' subsets.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }

    txt(x0, 24, o.claim || ('GOSH · ' + o.measure), { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(x0, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    var cid = 'ck-go-' + (svgEl.id || 'x');
    var defs = el('defs'); var cp = el('clipPath', { id: cid }, defs); el('rect', { x: x0, y: yT, width: (x1 - x0), height: (yB - yT) }, cp);
    var plot = el('g', { 'clip-path': 'url(#' + cid + ')' });

    // y gridlines + I^2 ticks + rotated title
    [0, 25, 50, 75, 100].forEach(function (i2) { var y = sy(i2);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) }, plot);
      txt(x0 - 8, y + 3.5, i2 + '%', { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' });
    });
    var yTitle = txt(15, (yT + yB) / 2, 'I² (heterogeneity)', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    yTitle.setAttribute('transform', 'rotate(-90 15 ' + ((yT + yB) / 2) + ')');

    // null vertical + overall (full-set) reference
    var xn = sx(ly(o.null));
    el('line', { x1: xn, x2: xn, y1: yT, y2: yB, stroke: C.nul, 'stroke-width': ntok('--hair-null', 1.25), 'stroke-dasharray': '4 3' }, plot);
    if (o.overall && o.overall.x != null) { var xo = sx(ly(o.overall.x));
      el('line', { x1: xo, x2: xo, y1: yT, y2: yB, stroke: C.est, 'stroke-width': '1', 'stroke-dasharray': '2 3', opacity: '0.55' }, plot);
      if (o.overall.label) { var ol = txt(xo, yT - 5, o.overall.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot, 'text-anchor': 'middle' }); ol.setAttribute('font-style', 'italic'); }
    }

    // subset cloud
    points.forEach(function (p) { el('circle', { cx: sx(ly(p.x)), cy: sy(p.i2), r: 2.6, fill: C.pt, 'fill-opacity': '0.32' }, plot); });

    // x ticks + label
    var xt = niceForestTicks(o.log ? Math.exp(dmin) : dmin, o.log ? Math.exp(dmax) : dmax, o.log);
    xt.forEach(function (v) { var x = sx(ly(v)); if (x < x0 - 1 || x > x1 + 1) return;
      txt(x, yB + 16, fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    txt((x0 + x1) / 2, yB + 36, o.measure + (o.log ? ' (log scale)' : ''), { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    txt(x1, 24, points.length + ' subsets', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot, 'text-anchor': 'end' });

    el('line', { x1: x0, x2: x1, y1: yB, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    el('line', { x1: x0, x2: x0, y1: yT, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderNetwork(svgEl, nodes, edges, opts) — NMA evidence network.
   * nodes: [{ id, label, n, isRef }] ; edges: [{ a, b, n }] (a/b = node ids)
   * opts: { claim, estimand }. Circular layout; node radius proportional to n,
   * edge width proportional to #trials; direct node labels.
   */
  function renderNetwork(svgEl, nodes, edges, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 480, height: 400, padT: 56, margin: 64 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      edge: tok('--c-axis', '#c2c6cb'), node: tok('--seq-2', '#cfe0ec'), nodeStroke: tok('--cat-1', '#0072B2'), ref: tok('--c-estimate', '#1a1a1a') };
    var W = o.width, H = o.height;
    var cx = W / 2, cy = o.padT + (H - o.padT) / 2, R = Math.min(W, H - o.padT) / 2 - o.margin;
    var T = nodes.length, pos = {};
    nodes.forEach(function (nd, i) { var a = -Math.PI / 2 + i * 2 * Math.PI / T; pos[nd.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; });
    var maxN = Math.max.apply(null, nodes.map(function (n) { return n.n || 1; })) || 1;
    var maxE = Math.max.apply(null, edges.map(function (e) { return e.n || 1; })) || 1;

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Evidence network. ' + (o.claim || '') + ' ' + T + ' treatments, ' + edges.length + ' direct comparisons.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    function addTip(g, html) { g.addEventListener('mouseenter', function (e) { showTip(e, html); }); g.addEventListener('mousemove', moveTip); g.addEventListener('mouseleave', hideTip); g.addEventListener('focus', function (e) { showTip(e, html); }); g.addEventListener('blur', hideTip); }

    txt(20, 24, o.claim || 'Evidence network', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // edges (width = #trials), drawn first (behind nodes)
    edges.forEach(function (e) { var A = pos[e.a], B = pos[e.b]; if (!A || !B) return;
      var ln = el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, stroke: C.edge, 'stroke-width': (1 + (e.n || 1) / maxE * 6).toFixed(1), 'stroke-linecap': 'round' });
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': e.a + ' vs ' + e.b + ': ' + (e.n || 0) + ' trials' });
      g.appendChild(ln); addTip(g, '<b>' + e.a + ' vs ' + e.b + '</b><br>' + (e.n || 0) + ' direct trial' + ((e.n || 0) === 1 ? '' : 's'));
    });

    // nodes (radius = study count), direct labels
    nodes.forEach(function (nd) { var p = pos[nd.id]; var r = 13 + Math.sqrt((nd.n || 0) / maxN) * 15;
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': nd.label + (nd.isRef ? ' (reference)' : '') + ': ' + (nd.n || 0) + ' studies' });
      addTip(g, '<b>' + nd.label + '</b>' + (nd.isRef ? ' (reference)' : '') + '<br>' + (nd.n || 0) + ' studies');
      el('circle', { cx: p.x, cy: p.y, r: r, fill: C.node, stroke: nd.isRef ? C.ref : C.nodeStroke, 'stroke-width': nd.isRef ? '2.5' : '1.5' }, g);
      var below = p.y > cy;
      txt(p.x, p.y < o.padT + 40 || !below ? p.y - r - 6 : p.y + r + 14, nd.label + (nd.isRef ? ' (ref)' : ''),
        { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink, 'text-anchor': 'middle' }, g);
    });
    return svgEl;
  }

  /**
   * renderRanking(svgEl, items, opts) — NMA treatment ranking (forest + SUCRA).
   * items: [{ label, est, lo, hi, sucra }] (effect vs reference); opts: { measure, log, null, claim, estimand }
   */
  function renderRanking(svgEl, items, opts) {
    opts = opts || {};
    var studies = items.map(function (it) {
      return { label: it.label + (it.sucra != null ? ' · SUCRA ' + Math.round(it.sucra * 100) + '%' : ''), est: it.est, lo: it.lo, hi: it.hi, weight: 1, included: true };
    });
    return renderForest(svgEl, studies, Object.assign({ measure: 'effect', rowH: 30 }, opts, { pooled: null }));
  }

  /**
   * renderRankogram(svgEl, items, opts) — NMA rank-probability matrix.
   * items: [{ label, prob:[P(rank1)..P(rankT)], pBest, sucra }] (sorted best-first)
   * opts: { claim, estimand }. Height-ONLY encoding (no opacity doubling).
   */
  function renderRankogram(svgEl, items, opts) {
    opts = opts || {};
    var T = items.length ? items[0].prob.length : 0;
    var o = Object.assign({ width: 720, padL: 130, padR: 116, padT: 58, padB: 30, rowH: 36 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), bar: tok('--cat-1', '#0072B2') };
    var W = o.width, x0 = o.padL, x1 = W - o.padR, yT = o.padT;
    var H = yT + items.length * o.rowH + o.padB;
    var cellW = (x1 - x0) / Math.max(1, T);
    var barMax = o.rowH - 13;

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Rankogram. ' + (o.claim || '') + ' ' + items.length + ' treatments.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }

    txt(20, 24, o.claim || 'Rank probabilities', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    txt(20, 43, o.estimand || 'P(rank) per treatment · rank 1 = best (left)', { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // rank column headers + faint separators
    for (var r = 0; r < T; r++) {
      var cxh = x0 + r * cellW + cellW / 2;
      txt(cxh, yT - 6, String(r + 1), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' });
      if (r > 0) el('line', { x1: x0 + r * cellW, x2: x0 + r * cellW, y1: yT, y2: yT + items.length * o.rowH, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
    }

    items.forEach(function (it, i) {
      var yBase = yT + i * o.rowH + o.rowH - 6;
      txt(16, yT + i * o.rowH + o.rowH / 2 + 4, it.label, { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink });
      el('line', { x1: x0, x2: x1, y1: yBase, y2: yBase, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      it.prob.forEach(function (pr, r) {
        var hgt = Math.max(0.4, pr * barMax), bx = x0 + r * cellW + 1.5;
        var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': it.label + ' rank ' + (r + 1) + ': ' + (pr * 100).toFixed(1) + '%' });
        g.addEventListener('mouseenter', function (e) { showTip(e, '<b>' + it.label + '</b><br>rank ' + (r + 1) + ': ' + (pr * 100).toFixed(1) + '%'); });
        g.addEventListener('mousemove', moveTip); g.addEventListener('mouseleave', hideTip);
        el('rect', { x: bx.toFixed(1), y: (yBase - hgt).toFixed(1), width: (cellW - 3).toFixed(1), height: hgt.toFixed(1), fill: C.bar, 'fill-opacity': '0.62' }, g);
      });
      if (it.pBest != null) txt(W - 6, yT + i * o.rowH + o.rowH / 2 + 4, 'P(best) ' + Math.round(it.pBest * 100) + '%', { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' });
    });
    el('line', { x1: x0, x2: x1, y1: yT, y2: yT, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderSROC(svgEl, data, opts) — summary ROC for diagnostic test accuracy.
   * data: { studies:[{fpr,se,N}], curve:[{fpr,tpr}], confEllipse:[{fpr,se}]|null,
   *         predEllipse:[{fpr,se}]|null, summary:{se,sp},
   *         marginalCI:{seLo,seHi,spLo,spHi}|null }
   * opts: { claim, estimand }
   */
  function renderSROC(svgEl, data, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 400, height: 400, padL: 52, padR: 18, padT: 58, padB: 46 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), curve: tok('--cat-1', '#0072B2'),
      conf: tok('--c-estimate', '#1a1a1a'), pred: tok('--c-annot', '#7a8086'), pt: tok('--cat-1', '#0072B2'), sum: tok('--c-estimate', '#1a1a1a') };
    var W = o.width, H = o.height, x0 = o.padL, yB = H - o.padB;
    var plot = Math.min(W - o.padR - x0, yB - o.padT);
    var x1 = x0 + plot, yT = yB - plot;
    var X = function (fpr) { return x0 + fpr * plot; }, Y = function (se) { return yB - se * plot; };
    var path = function (pts, mapy) { return pts.map(function (p) { return X(p.fpr).toFixed(1) + ',' + Y(mapy ? p[mapy] : p.se).toFixed(1); }).join(' '); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Summary ROC. ' + (o.claim || '') + ' ' + data.studies.length + ' studies.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }

    txt(20, 24, o.claim || 'Summary ROC', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // grid + ticks + diagonal + axis box
    [0, 0.25, 0.5, 0.75, 1].forEach(function (g) {
      el('line', { x1: X(g), x2: X(g), y1: yT, y2: yB, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      el('line', { x1: x0, x2: x1, y1: Y(g), y2: Y(g), stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(X(g), yB + 15, g.toFixed(2), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' });
      txt(x0 - 7, Y(g) + 3, g.toFixed(2), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' });
    });
    el('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: C.grid, 'stroke-width': '1', 'stroke-dasharray': '3 3' });
    txt((x0 + x1) / 2, yB + 34, '1 − specificity (FPR)', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    var yt = txt(15, (yT + yB) / 2, 'sensitivity', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' }); yt.setAttribute('transform', 'rotate(-90 15 ' + ((yT + yB) / 2) + ')');

    // prediction ellipse (dashed) BEHIND, confidence ellipse (solid)
    if (data.predEllipse) el('polygon', { points: path(data.predEllipse), fill: 'none', stroke: C.pred, 'stroke-width': '1.25', 'stroke-dasharray': '4 3' });
    if (data.confEllipse) el('polygon', { points: path(data.confEllipse), fill: 'none', stroke: C.conf, 'stroke-width': '1.5' });

    // SROC curve
    if (data.curve) el('polyline', { points: path(data.curve, 'tpr'), fill: 'none', stroke: C.curve, 'stroke-width': '2' });

    // study points (sized by N)
    var maxN = Math.max.apply(null, data.studies.map(function (s) { return s.N || 1; })) || 1;
    data.studies.forEach(function (st) { var r = 3 + Math.sqrt((st.N || 1) / maxN) * 7;
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': 'study: Se ' + (st.se * 100).toFixed(0) + '%, Sp ' + ((1 - st.fpr) * 100).toFixed(0) + '%, n=' + (st.N || 0) });
      g.addEventListener('mouseenter', function (e) { showTip(e, 'Se ' + (st.se * 100).toFixed(0) + '% · Sp ' + ((1 - st.fpr) * 100).toFixed(0) + '%<br>n=' + (st.N || 0)); });
      g.addEventListener('mousemove', moveTip); g.addEventListener('mouseleave', hideTip);
      el('circle', { cx: X(st.fpr), cy: Y(st.se), r: r, fill: C.pt, 'fill-opacity': '0.5', stroke: C.pt, 'stroke-width': '1' }, g);
    });
    // marginal CI cross (only when no ellipse)
    if (data.marginalCI && !data.confEllipse) { var m = data.marginalCI, sx = X(1 - data.summary.sp), sy = Y(data.summary.se);
      el('line', { x1: X(1 - m.spHi), x2: X(1 - m.spLo), y1: sy, y2: sy, stroke: C.sum, 'stroke-width': '1.25' });
      el('line', { x1: sx, x2: sx, y1: Y(m.seLo), y2: Y(m.seHi), stroke: C.sum, 'stroke-width': '1.25' });
    }
    // summary operating point (diamond)
    var ssx = X(1 - data.summary.sp), ssy = Y(data.summary.se), dh = 6;
    el('polygon', { points: (ssx - dh) + ',' + ssy + ' ' + ssx + ',' + (ssy - dh) + ' ' + (ssx + dh) + ',' + ssy + ' ' + ssx + ',' + (ssy + dh), fill: C.sum });

    // in-plot legend (bottom-right inside the unit square)
    var lx = x1 - 96, lyy = yB - 30;
    if (data.confEllipse) { el('line', { x1: lx, x2: lx + 18, y1: lyy, y2: lyy, stroke: C.conf, 'stroke-width': '1.5' }); txt(lx + 23, lyy + 3.5, '95% CI', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ink2 }); }
    if (data.predEllipse) { el('line', { x1: lx, x2: lx + 18, y1: lyy + 14, y2: lyy + 14, stroke: C.pred, 'stroke-width': '1.25', 'stroke-dasharray': '4 3' }); txt(lx + 23, lyy + 17.5, '95% PI', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ink2 }); }

    el('rect', { x: x0, y: yT, width: plot, height: plot, fill: 'none', stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderDensity(svgEl, data, opts) — posterior/prior density.
   * data: { grid:[x..], density:[y..], cri:{lo,hi}|null, median:number|null,
   *         prior:[{x,y}]|null }
   * opts: { measure, log, null, xlabel, claim, estimand }
   */
  function renderDensity(svgEl, data, opts) {
    opts = opts || {};
    var o = Object.assign({ log: false, measure: 'value', width: 460, height: 250, padL: 26, padR: 18, padT: 56, padB: 42 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'),
      fill: tok('--seq-2', '#cfe0ec'), cri: tok('--cat-1', '#0072B2'), line: tok('--cat-1', '#0072B2'), prior: tok('--c-annot', '#7a8086'), med: tok('--c-estimate', '#1a1a1a') };
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB;
    var g = data.grid, dn = data.density, n = g.length;
    var maxD = Math.max.apply(null, dn) || 1;
    // trim x-domain to where density is non-negligible (+ pad)
    var lo = g[0], hi = g[n - 1];
    for (var i = 0; i < n; i++) { if (dn[i] > maxD * 1e-3) { lo = g[i]; break; } }
    for (var j = n - 1; j >= 0; j--) { if (dn[j] > maxD * 1e-3) { hi = g[j]; break; } }
    var pad = (hi - lo) * 0.12 || 0.3; lo -= pad; hi += pad;
    if (opts.null != null && opts.null < lo) lo = opts.null - pad * 0.5;
    if (opts.null != null && opts.null > hi) hi = opts.null + pad * 0.5;
    var X = function (v) { return x0 + (v - lo) / (hi - lo) * (x1 - x0); }, Y = function (d) { return yB - d / maxD * (yB - yT); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Density. ' + (o.claim || ''));
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    var clipId = 'ck-de-' + (svgEl.id || 'x');
    var defs = el('defs'); var cp = el('clipPath', { id: clipId }, defs); el('rect', { x: x0, y: yT - 6, width: (x1 - x0), height: (yB - yT + 6) }, cp);
    var plot = el('g', { 'clip-path': 'url(#' + clipId + ')' });

    txt(20, 24, o.claim || 'Posterior density', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // density area (light) + 95% CrI region (darker) + outline
    var areaPts = 'M ' + X(g[0]).toFixed(1) + ' ' + yB.toFixed(1) + ' ';
    var linePts = '';
    g.forEach(function (v, k) { areaPts += 'L ' + X(v).toFixed(1) + ' ' + Y(dn[k]).toFixed(1) + ' '; linePts += (k === 0 ? 'M ' : 'L ') + X(v).toFixed(1) + ' ' + Y(dn[k]).toFixed(1) + ' '; });
    areaPts += 'L ' + X(g[n - 1]).toFixed(1) + ' ' + yB.toFixed(1) + ' Z';
    el('path', { d: areaPts, fill: C.fill, 'fill-opacity': '0.55' }, plot);
    if (data.cri) {
      var cf = 'M ' + X(data.cri.lo).toFixed(1) + ' ' + yB.toFixed(1) + ' ';
      g.forEach(function (v, k) { if (v >= data.cri.lo && v <= data.cri.hi) cf += 'L ' + X(v).toFixed(1) + ' ' + Y(dn[k]).toFixed(1) + ' '; });
      cf += 'L ' + X(data.cri.hi).toFixed(1) + ' ' + yB.toFixed(1) + ' Z';
      el('path', { d: cf, fill: C.cri, 'fill-opacity': '0.28' }, plot);
    }
    el('path', { d: linePts, fill: 'none', stroke: C.line, 'stroke-width': '2' }, plot);

    // prior overlay (dashed), normalised to its own peak
    if (data.prior && data.prior.length) {
      var pmax = Math.max.apply(null, data.prior.map(function (p) { return p.y; })) || 1;
      var pp = data.prior.map(function (p) { return X(p.x).toFixed(1) + ',' + (yB - p.y / pmax * (yB - yT)).toFixed(1); }).join(' ');
      el('polyline', { points: pp, fill: 'none', stroke: C.prior, 'stroke-width': '1.5', 'stroke-dasharray': '4 3' }, plot);
    }
    // null + median verticals
    if (opts.null != null) { el('line', { x1: X(opts.null), x2: X(opts.null), y1: yT - 4, y2: yB, stroke: C.nul, 'stroke-width': ntok('--hair-null', 1.25), 'stroke-dasharray': '4 3' }, plot);
      txt(X(opts.null) + 4, yT + 6, o.log ? (o.measure + '=1') : (o.measure + '=0'), { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot }); }
    if (data.median != null) el('line', { x1: X(data.median), x2: X(data.median), y1: Y(maxD) - 2, y2: yB, stroke: C.med, 'stroke-width': '1.25' }, plot);

    // x ticks (back-transformed for ratio measures) + label
    var ticks = o.log ? [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2].map(function (v) { return { v: Math.log(v), lab: String(v) }; })
      : niceForestTicks(lo, hi, false).map(function (v) { return { v: v, lab: fmt(v) }; });
    ticks.forEach(function (t) { var x = X(t.v); if (x < x0 - 1 || x > x1 + 1) return; txt(x, yB + 15, t.lab, { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    txt((x0 + x1) / 2, yB + 33, o.xlabel || o.measure, { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });

    // legend (posterior solid / prior dashed) when a prior is overlaid
    if (data.prior && data.prior.length) {
      var lx = x1 - 92, lyy = yT + 6;
      el('line', { x1: lx, x2: lx + 16, y1: lyy, y2: lyy, stroke: C.line, 'stroke-width': '2' }); txt(lx + 21, lyy + 3.5, 'posterior', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ink2 });
      el('line', { x1: lx, x2: lx + 16, y1: lyy + 14, y2: lyy + 14, stroke: C.prior, 'stroke-width': '1.5', 'stroke-dasharray': '4 3' }); txt(lx + 21, lyy + 17.5, 'prior', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ink2 });
    }
    el('line', { x1: x0, x2: x1, y1: yB, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderKM(svgEl, data, opts) — survival curves (RMST schematic or real KM).
   * data: { control:[{t,s}], treatment:[{t,s}], tau, rmst:{control,treatment,diff}|null,
   *         censored:{control:[{t,s}],treatment:[{t,s}]}|null, median:{control,treatment}|null }
   * opts: { claim, estimand, timeLabel, step (true = KM step function),
   *         area (false = suppress RMST fill), annotation (top-right text, e.g. HR + p) }
   */
  function renderKM(svgEl, data, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 460, height: 264, padL: 42, padR: 86, padT: 56, padB: 44 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), control: tok('--c-ink-2', '#555a5f'), treatment: tok('--cat-1', '#0072B2'), area: tok('--seq-2', '#cfe0ec') };
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB, tau = data.tau || 1;
    var X = function (t) { return x0 + t / tau * (x1 - x0); }, Y = function (s) { return yB - s * (yB - yT); };
    var pts = function (arr) { return arr.map(function (p) { return X(p.t).toFixed(1) + ',' + Y(p.s).toFixed(1); }).join(' '); };
    // path 'd' for a curve — true step function (KM) when opts.step, else straight segments (schematic)
    var curveD = function (arr) {
      return arr.map(function (p, i) {
        if (i === 0) return 'M ' + X(p.t).toFixed(1) + ' ' + Y(p.s).toFixed(1);
        if (o.step) return 'L ' + X(p.t).toFixed(1) + ' ' + Y(arr[i - 1].s).toFixed(1) + ' L ' + X(p.t).toFixed(1) + ' ' + Y(p.s).toFixed(1);
        return 'L ' + X(p.t).toFixed(1) + ' ' + Y(p.s).toFixed(1);
      }).join(' ');
    };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Survival curves. ' + (o.claim || ''));
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }

    txt(20, 24, o.claim || 'Survival to τ*', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // grid + ticks
    [0, 0.25, 0.5, 0.75, 1].forEach(function (sv) { var y = Y(sv);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(x0 - 6, y + 3, sv.toFixed(2), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' }); });
    [0, tau / 2, tau].forEach(function (t) { txt(X(t), yB + 15, String(Math.round(t)), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    txt((x0 + x1) / 2, yB + 33, o.timeLabel || 'time (to τ*)', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    var yt = txt(15, (yT + yB) / 2, 'survival', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' }); yt.setAttribute('transform', 'rotate(-90 15 ' + ((yT + yB) / 2) + ')');

    if (data.control && data.treatment) {
      // RMST area (between treatment[top] and control[bottom]) — opts.area=false suppresses it
      if (o.area !== false) {
        var area = pts(data.treatment).split(' ').map(function (p, i) { return (i === 0 ? 'M ' : 'L ') + p; }).join(' ');
        var rev = data.control.slice().reverse();
        area += ' ' + rev.map(function (p) { return 'L ' + X(p.t).toFixed(1) + ',' + Y(p.s).toFixed(1); }).join(' ') + ' Z';
        el('path', { d: area, fill: C.area, 'fill-opacity': '0.6' });
      }
      el('path', { d: curveD(data.control), fill: 'none', stroke: C.control, 'stroke-width': '1.75' });
      el('path', { d: curveD(data.treatment), fill: 'none', stroke: C.treatment, 'stroke-width': '2' });
      // median guide lines (vertical, from S=0.5 down) when provided
      if (data.median) {
        [['control', C.control], ['treatment', C.treatment]].forEach(function (pr) {
          var mt = data.median[pr[0]];
          if (mt != null && isFinite(mt)) el('line', { x1: X(mt), x2: X(mt), y1: Y(0.5), y2: Y(0), stroke: pr[1], 'stroke-width': '1', 'stroke-dasharray': '2 3', opacity: '0.6' });
        });
      }
      // censoring ticks when provided
      if (data.censored) {
        (data.censored.control || []).forEach(function (c) { el('line', { x1: X(c.t), x2: X(c.t), y1: Y(c.s) - 3, y2: Y(c.s) + 3, stroke: C.control, 'stroke-width': '1' }); });
        (data.censored.treatment || []).forEach(function (c) { el('line', { x1: X(c.t), x2: X(c.t), y1: Y(c.s) - 3, y2: Y(c.s) + 3, stroke: C.treatment, 'stroke-width': '1' }); });
      }
      // direct end labels
      var te = data.treatment[data.treatment.length - 1], ce = data.control[data.control.length - 1];
      txt(X(te.t) + 6, Y(te.s) + 3, 'treatment', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.treatment });
      txt(X(ce.t) + 6, Y(ce.s) + 3, 'control', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.control });
    }
    // top-right annotation: custom (opts.annotation, e.g. HR + logrank p) else ΔRMST
    if (o.annotation) txt(x1 - 4, yT + 14, o.annotation, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.treatment, 'text-anchor': 'end' });
    else if (data.rmst) txt(x1 - 4, yT + 14, 'ΔRMST ' + data.rmst.diff.toFixed(1), { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.treatment, 'text-anchor': 'end' });

    el('rect', { x: x0, y: yT, width: (x1 - x0), height: (yB - yT), fill: 'none', stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderCEplane(svgEl, data, opts) — cost-effectiveness plane.
   * data: { point:{dE,dC}, wtp, psa:[{dE,dC}]|null }
   * opts: { claim, estimand, effectLabel, costLabel }
   */
  function renderCEplane(svgEl, data, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 400, height: 384, padL: 54, padR: 18, padT: 58, padB: 46 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), zero: tok('--c-null', '#9aa0a6'),
      wtp: tok('--c-verdict-warn', '#E69F00'), pt: tok('--c-estimate', '#1a1a1a'), psa: tok('--cat-1', '#0072B2') };
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB;
    var plot = Math.min(x1 - x0, yB - yT); x1 = x0 + plot; yT = yB - plot;
    var cx = (x0 + x1) / 2, cy = (yT + yB) / 2;
    var pt = data.point, wtp = data.wtp, psa = data.psa || [];
    var es = [Math.abs(pt.dE)].concat(psa.map(function (p) { return Math.abs(p.dE); }));
    var cs = [Math.abs(pt.dC)].concat(psa.map(function (p) { return Math.abs(p.dC); }));
    var eMax = Math.max.apply(null, es.concat([0.5])) * 1.55;
    var cMax = Math.max.apply(null, cs.concat([wtp * eMax * 0.6, 1000])) * 1.4;
    var X = function (e) { return cx + e / eMax * (plot / 2); }, Y = function (c) { return cy - c / cMax * (plot / 2); };
    var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Cost-effectiveness plane. ' + (o.claim || ''));
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    var clipId = 'ck-ce-' + (svgEl.id || 'x');
    var defs = el('defs'); var cp = el('clipPath', { id: clipId }, defs); el('rect', { x: x0, y: yT, width: plot, height: plot }, cp);
    var pl = el('g', { 'clip-path': 'url(#' + clipId + ')' });

    txt(20, 24, o.claim || 'Cost-effectiveness plane', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // WTP line through origin (slope = wtp), clipped to plot
    el('line', { x1: X(-eMax), y1: Y(clamp(wtp * -eMax, -cMax, cMax)), x2: X(eMax), y2: Y(clamp(wtp * eMax, -cMax, cMax)), stroke: C.wtp, 'stroke-width': '1.5', 'stroke-dasharray': '5 3' }, pl);
    // zero axes through origin
    el('line', { x1: x0, x2: x1, y1: cy, y2: cy, stroke: C.zero, 'stroke-width': '1' }, pl);
    el('line', { x1: cx, x2: cx, y1: yT, y2: yB, stroke: C.zero, 'stroke-width': '1' }, pl);

    // PSA cloud
    psa.forEach(function (p) { el('circle', { cx: X(p.dE), cy: Y(clamp(p.dC, -cMax, cMax)), r: 2, fill: C.psa, 'fill-opacity': '0.28' }, pl); });

    // ICER point + ray from origin
    var px = X(pt.dE), py = Y(clamp(pt.dC, -cMax, cMax));
    el('line', { x1: cx, y1: cy, x2: px, y2: py, stroke: C.pt, 'stroke-width': '1', opacity: '0.5' }, pl);
    el('circle', { cx: px, cy: py, r: 6, fill: C.pt }, pl);

    // quadrant + axis labels
    txt(x1 - 4, yT + 12, 'more costly', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot, 'text-anchor': 'end' });
    txt(x1 - 4, yB - 5, 'more effective →', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot, 'text-anchor': 'end' });
    txt((x0 + x1) / 2, yB + 30, o.effectLabel || 'Δ effect', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    var yt = txt(15, (yT + yB) / 2, o.costLabel || 'Δ cost', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' }); yt.setAttribute('transform', 'rotate(-90 15 ' + ((yT + yB) / 2) + ')');
    txt(X(eMax * 0.5), Y(clamp(wtp * eMax * 0.5, -cMax, cMax)) - 4, 'λ', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.wtp });

    el('rect', { x: x0, y: yT, width: plot, height: plot, fill: 'none', stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderScatter(svgEl, points, opts) — scatter with fitted lines (e.g. MR).
   * points: [{ label, x, y, ySE, weight }]
   * opts: { xLabel, yLabel, claim, estimand, xFrom0,
   *         lines:[{ slope, intercept, label, dash }] }  (lines drawn in order; first 4 get a palette colour)
   */
  function renderScatter(svgEl, points, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 520, height: 384, padL: 60, padR: 124, padT: 58, padB: 50, xFrom0: false, lines: [] }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'), pt: tok('--cat-1', '#0072B2') };
    var palette = [tok('--cat-1', '#0072B2'), tok('--c-against', '#D55E00'), tok('--cat-3', '#009E73'), tok('--cat-4', '#CC79A7')];
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB;

    var xs = points.map(function (p) { return p.x; });
    var xmin = o.xFrom0 ? 0 : Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var xpad = (xmax - xmin) * 0.08 || 1; if (!o.xFrom0) xmin -= xpad; xmax += xpad;
    var yv = [0];
    points.forEach(function (p) { var e = p.ySE || 0; yv.push(p.y - 1.96 * e, p.y + 1.96 * e); });
    o.lines.forEach(function (L) { var b = L.intercept || 0; yv.push(b + L.slope * xmin, b + L.slope * xmax); });
    var ymin = Math.min.apply(null, yv), ymax = Math.max.apply(null, yv);
    var ypad = (ymax - ymin) * 0.08 || 0.1; ymin -= ypad; ymax += ypad;
    var sx = function (x) { return x0 + (x - xmin) / (xmax - xmin) * (x1 - x0); };
    var sy = function (y) { return yT + (1 - (y - ymin) / (ymax - ymin)) * (yB - yT); };
    var wmax = Math.max.apply(null, points.map(function (p) { return p.weight || 1; }));

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Scatter plot with fitted lines. ' + (o.claim || '') + ' ' + points.length + ' points.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    function addTip(g, html) {
      g.addEventListener('mouseenter', function (e) { showTip(e, html); }); g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', hideTip); g.addEventListener('focus', function (e) { showTip(e, html); }); g.addEventListener('blur', hideTip);
    }

    txt(20, 24, o.claim || 'Scatter', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    var cid = 'ck-sc-' + (svgEl.id || 'x');
    var defs = el('defs'); var cp = el('clipPath', { id: cid }, defs); el('rect', { x: x0, y: yT, width: (x1 - x0), height: (yB - yT) }, cp);
    var plot = el('g', { 'clip-path': 'url(#' + cid + ')' });

    // gridlines + ticks
    niceForestTicks(ymin, ymax, false).forEach(function (v) { if (v < ymin || v > ymax) return; var y = sy(v);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(x0 - 7, y + 3.5, fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' }); });
    niceForestTicks(xmin, xmax, false).forEach(function (v) { if (v < xmin || v > xmax) return;
      txt(sx(v), yB + 16, fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    // zero reference (y=0) when in range
    if (ymin <= 0 && ymax >= 0) el('line', { x1: x0, x2: x1, y1: sy(0), y2: sy(0), stroke: C.nul, 'stroke-width': ntok('--hair-null', 1.25), 'stroke-dasharray': '4 3' }, plot);

    // fitted lines + direct labels
    o.lines.forEach(function (L, i) {
      var col = L.color || palette[i % palette.length], b = L.intercept || 0;
      var a = { x1: sx(xmin), y1: sy(b + L.slope * xmin), x2: sx(xmax), y2: sy(b + L.slope * xmax), stroke: col, 'stroke-width': '2' };
      if (L.dash) a['stroke-dasharray'] = '6 4';
      el('line', a, plot);
      if (L.label) txt(x1 + 6, sy(b + L.slope * xmax) + 3.5, L.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: col });
    });

    // points with y-error whiskers, weight-scaled radius
    points.forEach(function (p) {
      var cx = sx(p.x), cy = sy(p.y), r = 3 + Math.sqrt((p.weight || 1) / wmax) * 7;
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': (p.label || '') + ': x ' + fmt(p.x) + ', y ' + fmt(p.y) }, plot);
      addTip(g, '<b>' + (p.label || '') + '</b><br>x ' + fmt(p.x) + '<br>y ' + fmt(p.y));
      if (p.ySE) el('line', { x1: cx, x2: cx, y1: sy(p.y - 1.96 * p.ySE), y2: sy(p.y + 1.96 * p.ySE), stroke: C.nul, 'stroke-width': '1' }, g);
      el('circle', { cx: cx, cy: cy, r: r, fill: C.pt, 'fill-opacity': '0.6', stroke: C.pt, 'stroke-width': '1' }, g);
    });

    // axis labels
    txt((x0 + x1) / 2, yB + 36, o.xLabel || 'x', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    var yt = txt(15, (yT + yB) / 2, o.yLabel || 'y', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' }); yt.setAttribute('transform', 'rotate(-90 15 ' + ((yT + yB) / 2) + ')');

    el('line', { x1: x0, x2: x1, y1: yB, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    el('line', { x1: x0, x2: x0, y1: yT, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderBars(svgEl, bars, opts) — categorical bar chart with optional reference overlay.
   * bars: [{ label, value, color }]
   * opts: { yLabel, claim, estimand, percent (format y as %), valueLabels (default true),
   *         overlay:[{label,value}] (reference line+dots, same categories), overlayLabel }
   */
  function renderBars(svgEl, bars, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 480, height: 300, padL: 50, padR: 22, padT: 56, padB: 46, percent: false, valueLabels: true }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), bar: tok('--cat-1', '#0072B2'), ref: tok('--c-against', '#D55E00') };
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB;
    var overlay = o.overlay || [];
    var vals = bars.map(function (b) { return b.value; }).concat(overlay.map(function (r) { return r.value; })).concat([0]);
    var vmax = Math.max.apply(null, vals); if (!(vmax > 0)) vmax = 1; vmax *= 1.12;
    var n = bars.length, slot = (x1 - x0) / n, bw = slot * 0.62;
    var cx = function (i) { return x0 + i * slot + slot / 2; };
    var sy = function (v) { return yB - (v / vmax) * (yB - yT); };
    var fmtV = function (v) { return o.percent ? (v * 100).toFixed(1) + '%' : (v % 1 === 0 ? String(v) : v.toFixed(1)); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Bar chart. ' + (o.claim || '') + ' ' + n + ' categories.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    function addTip(g, html) {
      g.addEventListener('mouseenter', function (e) { showTip(e, html); }); g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', hideTip); g.addEventListener('focus', function (e) { showTip(e, html); }); g.addEventListener('blur', hideTip);
    }

    txt(20, 24, o.claim || 'Bar chart', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // y gridlines + ticks
    var yt = niceForestTicks(0, vmax, false).filter(function (v) { return v >= 0 && v <= vmax; });
    yt.forEach(function (v) { var y = sy(v);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(x0 - 6, y + 3.5, o.percent ? (v * 100).toFixed(0) + '%' : fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' }); });

    // bars + category labels + value labels
    bars.forEach(function (b, i) {
      var x = cx(i), y = sy(b.value);
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': b.label + ': ' + fmtV(b.value) });
      addTip(g, '<b>' + b.label + '</b><br>' + fmtV(b.value));
      el('rect', { x: x - bw / 2, y: y, width: bw, height: Math.max(0, yB - y), fill: b.color || C.bar, 'fill-opacity': '0.85' }, g);
      txt(x, yB + 16, b.label, { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' });
      if (o.valueLabels) txt(x, y - 5, fmtV(b.value), { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ink2, 'text-anchor': 'middle' });
    });

    // reference overlay (line + dots), e.g. Benford expected
    if (overlay.length) {
      var d = overlay.map(function (r, i) { return (i === 0 ? 'M ' : 'L ') + cx(i).toFixed(1) + ' ' + sy(r.value).toFixed(1); }).join(' ');
      el('path', { d: d, fill: 'none', stroke: C.ref, 'stroke-width': '2' });
      overlay.forEach(function (r, i) { el('circle', { cx: cx(i), cy: sy(r.value), r: 3.2, fill: C.ref }); });
      if (o.overlayLabel) txt(x1, yT + 12, o.overlayLabel, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ref, 'text-anchor': 'end' });
    }

    if (o.yLabel) { var ytl = txt(15, (yT + yB) / 2, o.yLabel, { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' }); ytl.setAttribute('transform', 'rotate(-90 15 ' + ((yT + yB) / 2) + ')'); }
    if (o.xLabel) txt((x0 + x1) / 2, yB + 36, o.xLabel, { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });

    el('line', { x1: x0, x2: x1, y1: yB, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderLovePlot(svgEl, rows, opts) — covariate-balance love plot.
   * rows: [{ label, before, after }] (SMDs; plotted as |value| when opts.abs)
   * opts: { threshold (default 0.1), abs (default true), xLabel, claim, estimand }
   */
  function renderLovePlot(svgEl, rows, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 520, padL: 150, padR: 96, padT: 58, padB: 42, rowH: 30, threshold: 0.1, abs: true }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'),
      before: tok('--c-ink-2', '#555a5f'), after: tok('--cat-1', '#0072B2'), bad: tok('--c-against', '#D55E00'), warn: tok('--c-verdict-warn', '#E69F00') };
    var n = rows.length, W = o.width, x0 = o.padL, x1 = W - o.padR, yT = o.padT;
    var plotH = n * o.rowH, yB = yT + plotH, H = yB + o.padB;
    var th = o.threshold;
    var V = function (v) { return o.abs ? Math.abs(v) : v; };
    var hasBefore = rows.some(function (r) { return r.before != null; });   // single-series when no before
    var allv = []; rows.forEach(function (r) { if (r.before != null) allv.push(V(r.before)); allv.push(V(r.after)); }); allv.push(th, o.abs ? 0 : -th);
    var dmax = Math.max.apply(null, allv) * 1.12 || 1, dmin = o.abs ? 0 : -dmax;
    var sx = function (v) { return x0 + (v - dmin) / (dmax - dmin) * (x1 - x0); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Covariate balance love plot. ' + (o.claim || '') + ' ' + n + ' covariates.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    function addTip(g, html) {
      g.addEventListener('mouseenter', function (e) { showTip(e, html); }); g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', hideTip); g.addEventListener('focus', function (e) { showTip(e, html); }); g.addEventListener('blur', hideTip);
    }

    txt(x0 - 120 < 0 ? 8 : x0 - 120, 24, o.claim || 'Covariate balance', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(x0 - 120 < 0 ? 8 : x0 - 120, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // x gridlines + ticks
    niceForestTicks(dmin, dmax, false).forEach(function (v) { if (v < dmin || v > dmax) return; var x = sx(v);
      el('line', { x1: x, x2: x, y1: yT, y2: yB, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(x, yB + 16, fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    // threshold line(s)
    [th].concat(o.abs ? [] : [-th]).forEach(function (t) {
      el('line', { x1: sx(t), x2: sx(t), y1: yT, y2: yB, stroke: C.warn, 'stroke-width': '1.25', 'stroke-dasharray': '4 3' });
    });
    txt(sx(th), yT - 4, '|SMD| ' + th, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.warn, 'text-anchor': 'middle' });

    rows.forEach(function (r, i) {
      var y = yT + i * o.rowH + o.rowH / 2, hasB = r.before != null, xb = hasB ? sx(V(r.before)) : null, xa = sx(V(r.after)), bad = Math.abs(r.after) > th;
      var lab = hasB ? ('before ' + fmt(r.before) + ', after ' + fmt(r.after)) : fmt(r.after);
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': r.label + ': ' + lab });
      addTip(g, '<b>' + r.label + '</b><br>' + (hasB ? 'before ' + fmt(r.before) + '<br>after ' + fmt(r.after) : fmt(r.after)));
      txt(x0 - 10, y + 3.5, r.label, { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink, 'text-anchor': 'end' }, g);
      if (hasB) {
        el('line', { x1: Math.min(xb, xa), x2: Math.max(xb, xa), y1: y, y2: y, stroke: C.grid, 'stroke-width': '1.5' }, g);
        el('circle', { cx: xb, cy: y, r: 4.5, fill: 'none', stroke: C.before, 'stroke-width': '1.5' }, g);    // before = hollow
      }
      el('circle', { cx: xa, cy: y, r: 4.5, fill: bad ? C.bad : C.after }, g);                              // after = filled (red if > threshold)
    });

    // legend (only meaningful with a before/after pair) + axis label
    if (hasBefore) txt(x1, yT - 4, '○ before  ● after', { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ink2, 'text-anchor': 'end' });
    txt((x0 + x1) / 2, yB + 34, o.xLabel || (o.abs ? '|standardized mean difference|' : 'standardized mean difference'), { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    el('line', { x1: x0, x2: x1, y1: yB, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    el('line', { x1: x0, x2: x0, y1: yT, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderCurve(svgEl, series, opts) — multi-line x–y chart (CEAC, DCA, EVPI, PV-vs-prevalence, ITS).
   * series: [{ label, points:[{x,y}], color, dash }]
   * opts: { xLabel, yLabel, claim, estimand, xFrom0, yFrom0,
   *         xTickFmt(v), yTickFmt(v), xMarker:{x,label}, yRef:[{y,label}], scatter:[{x,y}] }
   */
  function renderCurve(svgEl, series, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 600, height: 380, padL: 66, padR: 120, padT: 58, padB: 48, xFrom0: false, yFrom0: false, yRef: [], scatter: [] }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'), warn: tok('--c-verdict-warn', '#E69F00') };
    var palette = [tok('--cat-1', '#0072B2'), tok('--c-against', '#D55E00'), tok('--cat-3', '#009E73'), tok('--cat-4', '#CC79A7'), tok('--cat-5', '#56B4E9')];
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB;
    var xf = o.xTickFmt || fmt, yf = o.yTickFmt || fmt;

    var xs = [], ys = [];
    series.forEach(function (s) { s.points.forEach(function (p) { xs.push(p.x); ys.push(p.y); }); });
    o.scatter.forEach(function (p) { xs.push(p.x); ys.push(p.y); });
    if (o.xMarker) xs.push(o.xMarker.x);
    o.yRef.forEach(function (r) { ys.push(r.y); });
    var xmin = o.xFrom0 ? 0 : Math.min.apply(null, xs), xmax = Math.max.apply(null, xs);
    var ymin = o.yFrom0 ? 0 : Math.min.apply(null, ys), ymax = Math.max.apply(null, ys);
    var xp = (xmax - xmin) * 0.04 || 1; if (!o.xFrom0) xmin -= xp; xmax += xp;
    var yp = (ymax - ymin) * 0.06 || 0.1; if (!o.yFrom0) ymin -= yp; ymax += yp;
    var sx = function (x) { return x0 + (x - xmin) / (xmax - xmin) * (x1 - x0); };
    var sy = function (y) { return yT + (1 - (y - ymin) / (ymax - ymin)) * (yB - yT); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img');
    svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Line chart. ' + (o.claim || '') + ' ' + series.length + ' series.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }

    txt(20, 24, o.claim || 'Curve', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    var cid = 'ck-cv-' + (svgEl.id || 'x');
    var defs = el('defs'); var cp = el('clipPath', { id: cid }, defs); el('rect', { x: x0, y: yT, width: (x1 - x0), height: (yB - yT) }, cp);
    var plot = el('g', { 'clip-path': 'url(#' + cid + ')' });

    // gridlines + ticks
    niceForestTicks(ymin, ymax, false).forEach(function (v) { if (v < ymin || v > ymax) return; var y = sy(v);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(x0 - 7, y + 3.5, yf(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' }); });
    niceForestTicks(xmin, xmax, false).forEach(function (v) { if (v < xmin || v > xmax) return;
      txt(sx(v), yB + 16, xf(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });

    // y reference lines (e.g. net-benefit 0)
    o.yRef.forEach(function (r) { var y = sy(r.y);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.nul, 'stroke-width': ntok('--hair-null', 1.25), 'stroke-dasharray': '4 3' }, plot);
      if (r.label) txt(x0 + 4, y - 4, r.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot }); });
    // x marker (e.g. WTP threshold, intervention time)
    if (o.xMarker) { var xm = sx(o.xMarker.x);
      el('line', { x1: xm, x2: xm, y1: yT, y2: yB, stroke: C.warn, 'stroke-width': '1.25', 'stroke-dasharray': '4 3' }, plot);
      if (o.xMarker.label) txt(xm, yT - 4, o.xMarker.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.warn, 'text-anchor': 'middle' }); }

    // scatter overlay (e.g. ITS observed points)
    o.scatter.forEach(function (p) { el('circle', { cx: sx(p.x), cy: sy(p.y), r: 2.6, fill: C.ink2, 'fill-opacity': '0.55' }, plot); });

    // series lines + direct end labels
    series.forEach(function (s, i) {
      var col = s.color || palette[i % palette.length];
      var d = s.points.map(function (p, j) { return (j === 0 ? 'M ' : 'L ') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1); }).join(' ');
      var a = { d: d, fill: 'none', stroke: col, 'stroke-width': '2' }; if (s.dash) a['stroke-dasharray'] = '6 4';
      el('path', a, plot);
      if (s.label) { var lp = s.points[s.points.length - 1]; txt(x1 + 6, sy(lp.y) + 3.5, s.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: col }); }
    });

    txt((x0 + x1) / 2, yB + 36, o.xLabel || 'x', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    var ytl = txt(15, (yT + yB) / 2, o.yLabel || 'y', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' }); ytl.setAttribute('transform', 'rotate(-90 15 ' + ((yT + yB) / 2) + ')');
    el('line', { x1: x0, x2: x1, y1: yB, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    el('line', { x1: x0, x2: x0, y1: yT, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  // shared unit-square shell for ROC / calibration (axes 0..1 + diagonal reference)
  function unitSquare(svgEl, o) {
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'), accent: tok('--cat-1', '#0072B2') };
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB;
    var X = function (v) { return x0 + v * (x1 - x0); }, Y = function (v) { return yB - v * (yB - yT); };
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', (o.aria || 'Unit-square plot') + '. ' + (o.claim || ''));
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    txt(20, 24, o.claim || '', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });
    [0, 0.5, 1].forEach(function (v) {
      el('line', { x1: X(v), x2: X(v), y1: yT, y2: yB, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      el('line', { x1: x0, x2: x1, y1: Y(v), y2: Y(v), stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(X(v), yB + 15, String(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' });
      txt(x0 - 6, Y(v) + 3, String(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' });
    });
    el('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: C.nul, 'stroke-width': '1.25', 'stroke-dasharray': '4 3' });
    txt((x0 + x1) / 2, yB + 34, o.xLabel || 'x', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    var yl = txt(14, (yT + yB) / 2, o.yLabel || 'y', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' }); yl.setAttribute('transform', 'rotate(-90 14 ' + ((yT + yB) / 2) + ')');
    el('rect', { x: x0, y: yT, width: (x1 - x0), height: (yB - yT), fill: 'none', stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return { el: el, txt: txt, X: X, Y: Y, C: C, tok: tok, x0: x0, x1: x1, yT: yT, yB: yB };
  }

  /**
   * renderROC(svgEl, roc, opts) — ROC curve. roc:[{f,t}] (FPR, TPR). opts:{auc, claim, estimand}.
   */
  function renderROC(svgEl, roc, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 300, height: 300, padL: 44, padR: 18, padT: 56, padB: 42,
      xLabel: '1 − specificity', yLabel: 'sensitivity', aria: 'ROC curve',
      claim: opts.auc != null ? 'AUC ' + opts.auc.toFixed(3) : 'ROC curve' }, opts);
    var u = unitSquare(svgEl, o);
    var pts = roc.map(function (p) { return u.X(p.f).toFixed(1) + ' ' + u.Y(p.t).toFixed(1); });
    var fill = 'M ' + u.X(0) + ' ' + u.Y(0) + ' ' + pts.map(function (p) { return 'L ' + p; }).join(' ') + ' L ' + u.X(1) + ' ' + u.Y(0) + ' Z';
    u.el('path', { d: fill, fill: u.C.accent, 'fill-opacity': '0.12' });
    u.el('path', { d: 'M ' + pts.join(' L '), fill: 'none', stroke: u.C.accent, 'stroke-width': '2' });
    if (o.auc != null) u.txt(u.X(0.6), u.Y(0.28), 'AUC ' + o.auc.toFixed(3), { 'font-size': tok2('--t-fs-fig-sub', '14px'), fill: u.C.accent });
    return svgEl;
  }

  /**
   * renderCalibration(svgEl, bins, opts) — calibration plot. bins:[{pred,obs,n}].
   * opts:{ slope, brier, claim, estimand }
   */
  function renderCalibration(svgEl, bins, opts) {
    opts = opts || {};
    var note = (opts.slope != null ? 'slope ' + opts.slope.toFixed(2) : '') + (opts.brier != null ? (opts.slope != null ? ' · ' : '') + 'Brier ' + opts.brier.toFixed(3) : '');
    var o = Object.assign({ width: 300, height: 300, padL: 44, padR: 18, padT: 56, padB: 42,
      xLabel: 'predicted', yLabel: 'observed', aria: 'Calibration plot',
      claim: opts.claim || (note || 'Calibration') }, opts);
    var u = unitSquare(svgEl, o);
    var nmax = Math.max.apply(null, bins.map(function (b) { return b.n || 1; }));
    u.el('path', { d: 'M ' + bins.map(function (b) { return u.X(b.pred).toFixed(1) + ' ' + u.Y(b.obs).toFixed(1); }).join(' L '), fill: 'none', stroke: u.C.accent, 'stroke-width': '2' });
    bins.forEach(function (b) {
      var g = u.el('g', { tabindex: '0', role: 'listitem', 'aria-label': 'predicted ' + (b.pred * 100).toFixed(0) + '%, observed ' + (b.obs * 100).toFixed(0) + '%, n ' + (b.n || 0) });
      g.addEventListener('mouseenter', function (e) { showTip(e, '<b>bin</b><br>pred ' + (b.pred * 100).toFixed(0) + '%<br>obs ' + (b.obs * 100).toFixed(0) + '%<br>n ' + (b.n || 0)); });
      g.addEventListener('mousemove', moveTip); g.addEventListener('mouseleave', hideTip);
      u.el('circle', { cx: u.X(b.pred), cy: u.Y(b.obs), r: 3 + Math.sqrt((b.n || 1) / nmax) * 4, fill: u.C.accent }, g);
    });
    if (note) u.txt(u.x1 - 4, u.yT + 14, note, { 'font-size': tok2('--t-fs-fig-sub', '14px'), fill: u.C.ink2, 'text-anchor': 'end' });
    return svgEl;
  }

  function tok2(n, f) { return tokGetter()(n, f); }

  /**
   * renderTrafficLight(svgEl, data, opts) — ordinal-judgment matrix (RoB2, ROBINS, QUADAS).
   * data: { rows:[{label, cells:[lvlKey,...]}], cols:[colLabel,...],
   *         levels:{ lvlKey:{ color, symbol, dark } } }
   * opts: { claim, estimand, separatorBeforeLast }
   */
  function renderTrafficLight(svgEl, data, opts) {
    opts = opts || {};
    var o = Object.assign({ padL: 156, padR: 18, padT: 56, headerH: 26, rowH: 34, cw: 80, R: 12, padB: 14, separatorBeforeLast: false }, opts);
    var tok = tokGetter();
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb') };
    var rows = data.rows, cols = data.cols, lv = data.levels;
    var x0 = o.padL, gridTop = o.padT + o.headerH, n = rows.length;
    var W = x0 + cols.length * o.cw + 20, H = gridTop + n * o.rowH + o.padB;
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Risk-of-bias traffic-light matrix. ' + (o.claim || '') + ' ' + n + ' studies.');
    txt(14, 24, o.claim || 'Risk-of-bias judgments', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(14, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });
    var cx = function (j) { return x0 + j * o.cw + o.cw / 2; };
    cols.forEach(function (c, j) { txt(cx(j), gridTop - 8, c, { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    if (o.separatorBeforeLast && cols.length > 1) { var sxp = x0 + (cols.length - 1) * o.cw; el('line', { x1: sxp, x2: sxp, y1: gridTop - 22, y2: gridTop + n * o.rowH, stroke: C.axis, 'stroke-width': '1' }); }
    rows.forEach(function (r, i) {
      var cy = gridTop + i * o.rowH + o.rowH / 2;
      txt(14, cy + 4, r.label, { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink });
      r.cells.forEach(function (lvlKey, j) {
        var L = lv[lvlKey] || { color: '#ccc', symbol: '?' };
        var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': r.label + ' ' + cols[j] + ': ' + (L.label || lvlKey) });
        g.addEventListener('mouseenter', function (e) { showTip(e, '<b>' + r.label + '</b><br>' + cols[j] + ': ' + (L.label || lvlKey)); });
        g.addEventListener('mousemove', moveTip); g.addEventListener('mouseleave', hideTip);
        el('circle', { cx: cx(j), cy: cy, r: o.R, fill: L.color }, g);
        txt(cx(j), cy + 4, L.symbol, { 'font-size': '13px', 'font-weight': '700', fill: L.dark ? C.ink : '#fff', 'text-anchor': 'middle' }, g);
      });
    });
    return svgEl;
  }

  /**
   * renderStackedBar(svgEl, rows, opts) — horizontal stacked bars (e.g. RoB summary %).
   * rows: [{ label, segments:[{ value, color, key }] }]  (values share opts.total)
   * opts: { claim, estimand, total (default 100), percent (default true), minLabelPct, legend:[{label,color}] }
   */
  function renderStackedBar(svgEl, rows, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 520, padL: 130, padR: 46, padT: 56, padB: 30, bh: 26, gap: 9, total: 100, percent: true, minLabelPct: 13, legend: [] }, opts);
    var tok = tokGetter();
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f') };
    var W = o.width, x0 = o.padL, x1 = W - o.padR, plotW = x1 - x0;
    var top = o.padT, n = rows.length, H = top + n * (o.bh + o.gap) + (o.legend.length ? 24 : 0) + o.padB;
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Stacked bar summary. ' + (o.claim || '') + ' ' + n + ' rows.');
    txt(14, 24, o.claim || 'Summary', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(14, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });
    rows.forEach(function (r, i) {
      var y = top + i * (o.bh + o.gap);
      txt(x0 - 8, y + o.bh / 2 + 4, r.label, { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' });
      var x = x0;
      r.segments.forEach(function (seg) {
        var w = (seg.value / o.total) * plotW;
        if (w > 0.5) {
          var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': r.label + ' ' + (seg.key || '') + ' ' + seg.value.toFixed(0) + (o.percent ? '%' : '') });
          g.addEventListener('mouseenter', function (e) { showTip(e, '<b>' + r.label + '</b><br>' + (seg.key || '') + ': ' + seg.value.toFixed(0) + (o.percent ? '%' : '')); });
          g.addEventListener('mousemove', moveTip); g.addEventListener('mouseleave', hideTip);
          el('rect', { x: x.toFixed(1), y: y, width: w.toFixed(1), height: o.bh, fill: seg.color }, g);
          var pctv = (seg.value / o.total) * 100;
          if (pctv >= o.minLabelPct) txt(x + w / 2, y + o.bh / 2 + 4, seg.value.toFixed(0) + (o.percent ? '%' : ''), { 'font-size': '11px', fill: seg.dark ? C.ink : '#fff', 'text-anchor': 'middle' });
        }
        x += w;
      });
    });
    if (o.legend.length) {
      var ly = H - 10, lx = x0;
      o.legend.forEach(function (g) { el('rect', { x: lx, y: ly - 10, width: 11, height: 11, fill: g.color }); txt(lx + 16, ly, g.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ink2 }); lx += 30 + g.label.length * 6.6; });
    }
    return svgEl;
  }

  /**
   * renderStackedArea(svgEl, series, opts) — stacked-area trace (e.g. Markov cohort).
   * series: [{ label, values:[...], color }]  (bands stack bottom->top in array order)
   * opts: { xLabel, yLabel, claim, estimand, yMax, xValues:[...] (else index) }
   */
  function renderStackedArea(svgEl, series, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 560, height: 300, padL: 48, padR: 120, padT: 56, padB: 44 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb') };
    var W = o.width, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = o.height - o.padB, H = o.height;
    var n = series.length ? series[0].values.length : 0;
    var xv = o.xValues || null;
    var xmin = xv ? xv[0] : 0, xmax = xv ? xv[n - 1] : (n - 1);
    var totals = []; for (var i = 0; i < n; i++) { var s = 0; series.forEach(function (se) { s += se.values[i] || 0; }); totals.push(s); }
    var yMax = o.yMax || (Math.max.apply(null, totals) || 1);
    var X = function (i) { return x0 + (xmax === xmin ? 0 : ((xv ? xv[i] : i) - xmin) / (xmax - xmin)) * (x1 - x0); };
    var Y = function (v) { return yB - v / yMax * (yB - yT); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Stacked-area trace. ' + (o.claim || '') + ' ' + series.length + ' states.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    txt(20, 24, o.claim || 'Cohort trace', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // y gridlines + ticks
    niceForestTicks(0, yMax, false).forEach(function (v) { if (v < 0 || v > yMax) return; var y = Y(v);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(x0 - 6, y + 3, fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'end' }); });

    // stacked bands (cumulative bottom->top)
    var cum = []; for (i = 0; i < n; i++) cum.push(0);
    series.forEach(function (se, si) {
      var upper = cum.map(function (c, i) { return c + (se.values[i] || 0); });
      var top = []; for (i = 0; i < n; i++) top.push(X(i).toFixed(1) + ' ' + Y(upper[i]).toFixed(1));
      var bot = []; for (i = n - 1; i >= 0; i--) bot.push(X(i).toFixed(1) + ' ' + Y(cum[i]).toFixed(1));
      el('path', { d: 'M ' + top.join(' L ') + ' L ' + bot.join(' L ') + ' Z', fill: se.color || '#888', 'fill-opacity': '0.85' });
      // direct end label at the band's right-edge midpoint
      var midY = (Y(upper[n - 1]) + Y(cum[n - 1])) / 2;
      if (se.label && (Y(cum[n - 1]) - Y(upper[n - 1])) > 8) txt(x1 + 6, midY + 3.5, se.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: se.color || C.ink2 });
      cum = upper;
    });

    // x ticks
    var step = Math.max(1, Math.ceil((n - 1) / 6));
    for (i = 0; i < n; i += step) txt(X(i), yB + 16, String(xv ? xv[i] : i), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' });
    txt((x0 + x1) / 2, yB + 34, o.xLabel || 'step', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });
    var yl = txt(14, (yT + yB) / 2, o.yLabel || 'proportion', { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' }); yl.setAttribute('transform', 'rotate(-90 14 ' + ((yT + yB) / 2) + ')');
    el('line', { x1: x0, x2: x1, y1: yB, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    el('line', { x1: x0, x2: x0, y1: yT, y2: yB, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderGauge(svgEl, opts) — semicircular value gauge (e.g. CCA overlap %).
   * opts: { value, max, color, label (big center), sublabel, ticks:[...], valueFmt(v), tickFmt(v) }
   */
  function renderGauge(svgEl, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 260, height: 168, value: 0, max: 1, padT: 40, ticks: [] }, opts);
    var tok = tokGetter();
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), grid: tok('--c-grid', '#e7e9ec'), accent: tok('--cat-1', '#0072B2') };
    var W = o.width, H = o.height, cx = W / 2, cy = o.padT + 80, rad = 80, a0 = Math.PI, a1 = 2 * Math.PI;
    var col = o.color || C.accent;
    var frac = Math.max(0, Math.min(1, o.value / (o.max || 1)));
    function arc(r, b0, b1) { var p = function (a) { return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; }; var s = p(b0), e = p(b1); var lg = (b1 - b0) > Math.PI ? 1 : 0; return 'M ' + s[0].toFixed(1) + ' ' + s[1].toFixed(1) + ' A ' + r + ' ' + r + ' 0 ' + lg + ' 1 ' + e[0].toFixed(1) + ' ' + e[1].toFixed(1); }
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Gauge. ' + (o.label || '') + (o.sublabel ? ' — ' + o.sublabel : ''));
    if (o.claim) txt(20, 24, o.claim, { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    el('path', { d: arc(rad, a0, a1), fill: 'none', stroke: C.grid, 'stroke-width': '14', 'stroke-linecap': 'round' });
    el('path', { d: arc(rad, a0, a0 + frac * (a1 - a0)), fill: 'none', stroke: col, 'stroke-width': '14', 'stroke-linecap': 'round' });
    txt(cx, cy - 4, o.label != null ? o.label : (o.valueFmt ? o.valueFmt(o.value) : String(o.value)), { 'font-size': '30px', 'font-weight': '600', fill: C.ink, 'text-anchor': 'middle' });
    if (o.sublabel) txt(cx, cy + 18, o.sublabel, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: col, 'text-anchor': 'middle' });
    o.ticks.forEach(function (v) { var a = a0 + Math.max(0, Math.min(1, v / (o.max || 1))) * (a1 - a0), x = cx + (rad + 15) * Math.cos(a), y = cy + (rad + 15) * Math.sin(a);
      txt(x, y, o.tickFmt ? o.tickFmt(v) : String(v), { 'font-size': '9px', fill: C.ink2, 'text-anchor': 'middle' }); });
    return svgEl;
  }

  /**
   * renderGroupedForest(svgEl, groups, opts) — forest with group headers + nested rows.
   * groups: [{ label, rows:[{ label, est, lo, hi, weight }] }]
   * opts: { measure, log, null, pooled:{est,lo,hi,pi_lo,pi_hi}, pooledLabel, claim, estimand }
   */
  function renderGroupedForest(svgEl, groups, opts) {
    opts = opts || {};
    var o = Object.assign({ log: false, null: 0, measure: 'effect', width: 760, padL: 180, padR: 120, padT: 62, padB: 52, rowH: 25, headerH: 24 }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'),
      grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'), est: tok('--c-estimate', '#1a1a1a'), pi: tok('--c-pi', '#b9c2cb') };
    var allRows = []; groups.forEach(function (g) { g.rows.forEach(function (r) { allRows.push(r); }); });
    var tx = function (v) { return o.log ? Math.log(v) : v; };
    var all = []; allRows.forEach(function (r) { all.push(r.lo, r.hi); });
    if (o.pooled) all.push(o.pooled.lo, o.pooled.hi, o.pooled.pi_lo, o.pooled.pi_hi);
    all.push(o.null);
    all = all.filter(function (v) { return v != null && isFinite(v) && (!o.log || v > 0); }).map(tx);
    var dmin = Math.min.apply(null, all), dmax = Math.max.apply(null, all), pad = (dmax - dmin) * 0.06 || 0.1; dmin -= pad; dmax += pad;
    var W = o.width, x0 = o.padL, x1 = W - o.padR;
    var sx = function (v) { return x0 + (tx(v) - dmin) / (dmax - dmin) * (x1 - x0); };
    var wmax = Math.max.apply(null, allRows.map(function (r) { return r.weight || 1; }));
    var bmin = ntok('--box-min', 6), bmax = ntok('--box-max', 22);
    // layout: each group = header + its rows
    var yTop = o.padT, y = yTop, layout = [];
    groups.forEach(function (g) { layout.push({ type: 'h', label: g.label, y: y + o.headerH / 2 }); y += o.headerH;
      g.rows.forEach(function (r) { layout.push({ type: 'e', r: r, y: y + o.rowH / 2 }); y += o.rowH; }); });
    var gridBot = y, pooledCy = gridBot + 22, H = pooledCy + (o.pooled ? 22 : 0) + o.padB;

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Grouped forest plot, ' + o.measure + '. ' + (o.claim || '') + ' ' + groups.length + ' groups.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, yy, s, a, p) { var e = el('text', Object.assign({ x: x, y: yy }, a || {}), p); e.textContent = s; return e; }

    txt(x0, 24, o.claim || ('Forest of ' + o.measure), { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(x0, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    var ticks = niceForestTicks(o.log ? Math.exp(dmin) : dmin, o.log ? Math.exp(dmax) : dmax, o.log);
    ticks.forEach(function (v) { var x = sx(v);
      el('line', { x1: x, x2: x, y1: yTop, y2: gridBot, stroke: C.grid, 'stroke-width': ntok('--hair-grid', 1) });
      txt(x, gridBot + 15, fmt(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    if (o.null != null && isFinite(o.null)) { var xn = sx(o.null); el('line', { x1: xn, x2: xn, y1: yTop, y2: gridBot, stroke: C.nul, 'stroke-width': ntok('--hair-null', 1.25), 'stroke-dasharray': '4 3' }); }

    layout.forEach(function (it) {
      if (it.type === 'h') { txt(14, it.y + 4, it.label, { 'font-size': tok('--t-fs-axis', '12px'), 'font-weight': '600', fill: C.ink }); return; }
      var r = it.r, cy = it.y, sd = bmin + Math.sqrt((r.weight || 1) / wmax) * (bmax - bmin);
      var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': (r.label || 'effect') + ': ' + o.measure + ' ' + fmt(r.est) + ' (' + fmt(r.lo) + ' to ' + fmt(r.hi) + ')' });
      if (r.label) txt(28, cy + 3.5, r.label, { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2 }, g);
      el('line', { x1: sx(r.lo), x2: sx(r.hi), y1: cy, y2: cy, stroke: C.ink, 'stroke-width': ntok('--whisker-w', 1.25) }, g);
      el('rect', { x: sx(r.est) - sd / 2, y: cy - sd / 2, width: sd, height: sd, fill: C.est }, g);
      txt(x1 + 12, cy + 3.5, fmt(r.est) + ' (' + fmt(r.lo) + '–' + fmt(r.hi) + ')', { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2 }, g);
    });

    if (o.pooled) {
      var p = o.pooled, dh = ntok('--diamond-h', 16) / 2, xe = sx(p.est);
      if (p.pi_lo != null && p.pi_hi != null) el('line', { x1: sx(p.pi_lo), x2: sx(p.pi_hi), y1: pooledCy, y2: pooledCy, stroke: C.pi, 'stroke-width': '7', 'stroke-linecap': 'round' });
      el('polygon', { points: sx(p.lo) + ',' + pooledCy + ' ' + xe + ',' + (pooledCy - dh) + ' ' + sx(p.hi) + ',' + pooledCy + ' ' + xe + ',' + (pooledCy + dh), fill: C.est });
      txt(14, pooledCy + 4, o.pooledLabel || 'Overall', { 'font-size': tok('--t-fs-axis', '12px'), 'font-weight': '600', fill: C.ink });
      txt(x1 + 12, pooledCy + 4, fmt(p.est) + ' (' + fmt(p.lo) + '–' + fmt(p.hi) + ')', { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2 });
    }
    el('line', { x1: x0, x2: x1, y1: gridBot, y2: gridBot, stroke: C.axis, 'stroke-width': ntok('--hair-axis', 1) });
    return svgEl;
  }

  /**
   * renderInterval(svgEl, opts) — single estimate + CI on a zoned axis (non-inferiority / equivalence / MID).
   * opts: { est, lo, hi, min, max, zones:[{from,to,fill,label}], refs:[{x,label}],
   *         xLabel, claim, estimand, valueFmt(v) }
   */
  function renderInterval(svgEl, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 640, height: 200, padL: 34, padR: 34, padT: 58, padB: 46, zones: [], refs: [] }, opts);
    var tok = tokGetter();
    var ntok = function (n, f) { var v = parseFloat(tok(n, '')); return isFinite(v) ? v : f; };
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'), annot: tok('--c-annot', '#7a8086'), grid: tok('--c-grid', '#e7e9ec'), axis: tok('--c-axis', '#c2c6cb'), nul: tok('--c-null', '#9aa0a6'), est: tok('--c-estimate', '#1a1a1a') };
    var W = o.width, H = o.height, x0 = o.padL, x1 = W - o.padR, yT = o.padT, yB = H - o.padB, midY = (yT + yB) / 2;
    var min = o.min, max = o.max, vf = o.valueFmt || fmt;
    var sx = function (v) { return x0 + (Math.max(min, Math.min(max, v)) - min) / (max - min) * (x1 - x0); };

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Interval estimate on a zoned axis. ' + (o.claim || ''));
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var k in a) e.setAttribute(k, a[k]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }

    txt(x0, 24, o.claim || 'Interval estimate', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(x0, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });

    // shaded zones (background) + their labels
    o.zones.forEach(function (z) { var xa = sx(z.from), xb = sx(z.to);
      el('rect', { x: Math.min(xa, xb), y: yT, width: Math.abs(xb - xa), height: yB - yT, fill: z.fill, 'fill-opacity': '0.13' });
      if (z.label) txt((xa + xb) / 2, yB - 6, z.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    // reference lines (null, margin) + labels
    o.refs.forEach(function (r) { var x = sx(r.x);
      el('line', { x1: x, x2: x, y1: yT - 8, y2: yB + 6, stroke: C.nul, 'stroke-width': ntok('--hair-null', 1.25), 'stroke-dasharray': '4 3' });
      if (r.label) txt(x, yT - 11, r.label, { 'font-size': tok('--t-fs-annot', '11px'), fill: C.annot, 'text-anchor': 'middle' }); });
    // x ticks
    niceForestTicks(min, max, false).forEach(function (v) { if (v < min || v > max) return; txt(sx(v), yB + 18, vf(v), { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }); });
    if (o.xLabel) txt((x0 + x1) / 2, H - 6, o.xLabel, { 'font-size': tok('--t-fs-axis', '12px'), fill: C.ink2, 'text-anchor': 'middle' });

    // estimate + CI
    el('line', { x1: sx(o.lo), x2: sx(o.hi), y1: midY, y2: midY, stroke: C.est, 'stroke-width': ntok('--whisker-w', 1.25) });
    el('line', { x1: sx(o.lo), x2: sx(o.lo), y1: midY - 6, y2: midY + 6, stroke: C.est, 'stroke-width': ntok('--whisker-w', 1.25) });
    el('line', { x1: sx(o.hi), x2: sx(o.hi), y1: midY - 6, y2: midY + 6, stroke: C.est, 'stroke-width': ntok('--whisker-w', 1.25) });
    el('circle', { cx: sx(o.est), cy: midY, r: 5, fill: C.est });
    txt(sx(o.hi) + 8, midY + 3.5, vf(o.est) + ' (' + vf(o.lo) + '–' + vf(o.hi) + ')', { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2 });
    return svgEl;
  }

  /**
   * renderSankey(svgEl, stages, opts) — attrition flow ribbon (proportional Sankey).
   * stages: [{ label, n, exits? }] — stages[0].n is the entry cohort; each later stage's
   *   n is the count retained into it. exits (optional): [{ label, n }] losses leaving the
   *   PREVIOUS stage; if omitted, a single derived loss (prev.n − n) is drawn unlabeled.
   *   A stage with ≥2 POSITIVE exits FANS them out horizontally — side-by-side proportional
   *   sinks, each with a count + rotated reason label; the SVG auto-grows tall enough for the
   *   longest label. The fan font shrinks with the per-exit slot, and once slots would be too
   *   tight to read (very many reasons) the stage aggregates to a single "N reasons" arm with
   *   the breakdown in its tooltip. 1 exit is the classic single downward arm (unchanged;
   *   sub-0.5px losses skipped as before). Zero-count exits are dropped. Use the fan for
   *   itemised loss breakdowns (e.g. PRISMA exclusion reasons, CONSORT loss categories).
   * Retained-flow and exit-ribbon widths are ∝ count (relative to the entry cohort).
   * Deterministic — no RNG. opts: { width, height, unit, claim, estimand,
   *   retainColor, finalColor, exitColor }
   */
  function renderSankey(svgEl, stages, opts) {
    opts = opts || {};
    var o = Object.assign({ width: 520, height: 340, padL: 30, padR: 30, padB: 18, unit: '' }, opts);
    var tok = tokGetter();
    var C = { ink: tok('--c-ink', '#1a1a1a'), ink2: tok('--c-ink-2', '#555a5f'),
      retain: o.retainColor || tok('--cat-1', '#0072B2'),
      fin: o.finalColor || '#1f9d57',
      exit: o.exitColor || tok('--c-annot', '#7a8086') };
    var k = stages.length;
    var fmtN = function (v) { return Math.round(v).toLocaleString(); };
    // a stage "fans" only when it has >=2 POSITIVE exits (zero-count reasons are dropped below)
    var fanStages = stages.filter(function (s) { return s.exits && s.exits.filter(function (e) { return e.n > 0; }).length >= 2; });
    var fanActive = fanStages.length > 0;
    // grow H to fit the fan's rotated reason labels (length-aware, NOT a fixed floor) so long
    // reason names never clip below the viewBox. bandH caps at 96 once the canvas is this tall,
    // so sinkBase/labelY are stable constants here; 6px/char is a generous upper bound at 10.5px.
    var fanH = 0;
    if (fanActive && k >= 2) {
      var nMaxE = stages[0].n > 0 ? stages[0].n : 1, bandHE = 96, sinkBaseE = 84 + bandHE + 30, maxThkE = 0, maxCharsE = 0;
      fanStages.forEach(function (s) { s.exits.forEach(function (e) { if (!(e.n > 0)) return;
        maxThkE = Math.max(maxThkE, Math.max(3, e.n / nMaxE * bandHE));
        maxCharsE = Math.max(maxCharsE, ('−' + fmtN(e.n) + '  ' + String(e.label)).length); }); });
      fanH = Math.ceil(sinkBaseE + maxThkE + 10 + maxCharsE * 6.0 + (o.padB || 18));
    }
    var W = o.width, H = fanActive ? Math.max(o.height, 392, fanH) : o.height, x0 = o.padL, x1 = W - o.padR, yTop = 84;

    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!svgEl.style.width) svgEl.style.width = '100%';
    svgEl.setAttribute('role', 'img'); svgEl.setAttribute('font-family', tok('--t-font-serif', 'Georgia,serif'));
    svgEl.setAttribute('aria-label', 'Attrition flow. ' + (o.claim || '') + ' ' + k + ' stages.');
    function el(t, a, p) { var e = document.createElementNS(NS, t); a = a || {}; for (var kk in a) e.setAttribute(kk, a[kk]); (p || svgEl).appendChild(e); return e; }
    function txt(x, y, s, a, p) { var e = el('text', Object.assign({ x: x, y: y }, a || {}), p); e.textContent = s; return e; }
    function addTip(g, html) {
      g.addEventListener('mouseenter', function (e) { showTip(e, html); }); g.addEventListener('mousemove', moveTip);
      g.addEventListener('mouseleave', hideTip); g.addEventListener('focus', function (e) { showTip(e, html); }); g.addEventListener('blur', hideTip);
    }

    txt(20, 24, o.claim || 'Attrition flow', { 'font-size': tok('--t-fs-fig-title', '19px'), 'font-weight': tok('--t-fw-title', '600'), fill: C.ink });
    if (o.estimand) txt(20, 43, o.estimand, { 'font-size': tok('--t-fs-fig-sub', '14px'), fill: C.ink2 });
    if (k < 2) { txt(20, yTop, 'need ≥2 stages', { 'font-size': '12px', fill: C.ink2 }); return svgEl; }

    var nMax = stages[0].n; if (!(nMax > 0)) nMax = 1;
    var usable = H - yTop - o.padB;
    var bandH = Math.min(96, usable * 0.42);
    var t = function (n) { return (Math.max(0, n) / nMax) * bandH; };
    var nodeW = 9;
    var span = (x1 - x0 - nodeW) / (k - 1);
    var nodeX = function (i) { return x0 + i * span; };
    var sinkBase = yTop + bandH + 30;
    var i;

    // retained-flow links between consecutive nodes — constant thickness = t(n[i+1])
    for (i = 0; i < k - 1; i++) {
      var xa = nodeX(i) + nodeW, xb = nodeX(i + 1), th = t(stages[i + 1].n);
      el('path', { d: 'M ' + xa + ' ' + yTop + ' L ' + xb + ' ' + yTop +
        ' L ' + xb + ' ' + (yTop + th) + ' L ' + xa + ' ' + (yTop + th) + ' Z',
        fill: C.retain, 'fill-opacity': '0.30' });
    }

    // exit ribbons (losses leaving each stage) — peel from the bottom wedge down to a sink.
    // 1 exit  → a single ribbon to one labelled sink (the classic attrition arm).
    // ≥2 exits → the sinks FAN OUT horizontally, side by side, each a proportional band
    //            ending in a crisp magnitude cap with a count + rotated reason label, so a
    //            stage's loss breakdown (e.g. PRISMA exclusion reasons) reads at a glance.
    var fmtExit = function (g, e) { addTip(g, '<b>' + e.label + '</b><br>−' + fmtN(e.n) + (o.unit ? ' ' + o.unit : '')); };
    var ribbon = function (xSrc, srcTop, srcBot, xSink, sTop, sBot, op, p) {
      var cx = (xSrc + xSink) / 2;
      el('path', { d: 'M ' + xSrc + ' ' + srcTop +
        ' C ' + cx + ' ' + srcTop + ' ' + cx + ' ' + sTop + ' ' + xSink + ' ' + sTop +
        ' L ' + xSink + ' ' + sBot +
        ' C ' + cx + ' ' + sBot + ' ' + cx + ' ' + srcBot + ' ' + xSrc + ' ' + srcBot + ' Z',
        fill: C.exit, 'fill-opacity': op }, p);
    };
    for (i = 0; i < k - 1; i++) {
      var lossTotal = Math.max(0, stages[i].n - stages[i + 1].n);
      var exits = (stages[i + 1].exits && stages[i + 1].exits.length) ? stages[i + 1].exits
        : (lossTotal > 0 ? [{ label: 'removed', n: lossTotal }] : []);
      exits = exits.filter(function (e) { return e.n > 0; });   // drop zero-count reasons (no "−0" caps)
      if (!exits.length) continue;
      var wedgeTop = yTop + t(stages[i + 1].n);
      var xSrc = nodeX(i) + nodeW, m = exits.length;
      var fanL = xSrc + span * 0.16, fanR = nodeX(i + 1) - 5, slot = (fanR - fanL) / m;
      var canFan = m >= 2 && slot >= 7;   // below ~7px/slot the rotated labels would overlap — aggregate instead
      if (!canFan) {
        // single arm — OR, when there are too many exits to fan legibly, ONE aggregated arm
        // ("m reasons") whose per-reason breakdown stays in the tooltip. Sub-0.5px losses are
        // skipped exactly as the legacy single-exit path did (so existing diagrams are unchanged).
        var aggN = exits.reduce(function (a, e) { return a + e.n; }, 0);
        var single = (m < 2) ? exits[0] : { label: m + ' reasons', n: aggN };
        var eThk0 = t(single.n); if (eThk0 < 0.5) continue;
        var xSink0 = xSrc + span * 0.46;
        var g0 = el('g', { tabindex: '0', role: 'listitem', 'aria-label': single.label + ': ' + fmtN(single.n) });
        addTip(g0, (m < 2) ? ('<b>' + single.label + '</b><br>−' + fmtN(single.n) + (o.unit ? ' ' + o.unit : ''))
          : ('<b>' + m + ' loss reasons</b><br>' + exits.map(function (e) { return e.label + ' −' + fmtN(e.n); }).join('<br>')));
        ribbon(xSrc, wedgeTop, wedgeTop + eThk0, xSink0, sinkBase, sinkBase + eThk0, '0.34', g0);
        txt(xSink0, sinkBase + eThk0 + 13, '−' + fmtN(single.n), { 'font-size': tok('--t-fs-annot', '11px'), fill: C.exit, 'text-anchor': 'middle' }, g0);
        continue;
      }
      // ≥2 positive exits WITH room → fan out horizontally. Count+reason fold into ONE rotated
      // label so the two parts never collide with EACH OTHER; adjacent-label overlap is avoided
      // by shrinking the font with the slot and aggregating (above) once slots get too tight.
      var capMin = 3, cum = 0;
      var fontPx = Math.max(7, Math.min(10.5, slot * 0.85));
      var capW = Math.min(3.2, Math.max(1.4, slot * 0.4));
      var maxThk = Math.max.apply(null, exits.map(function (e) { return Math.max(t(e.n), capMin); }));
      var labelY = sinkBase + maxThk + 8;   // shared baseline below the tallest cap → labels read as a neat row
      exits.forEach(function (e, idx) {
        var eThk = t(e.n); if (eThk < 0.6) eThk = 0.6;
        var srcTop = wedgeTop + cum, srcBot = srcTop + eThk; cum += eThk;
        var xC = fanL + slot * (idx + 0.5);
        var g = el('g', { tabindex: '0', role: 'listitem', 'aria-label': e.label + ': ' + fmtN(e.n) });
        fmtExit(g, e);
        ribbon(xSrc, srcTop, srcBot, xC, sinkBase, sinkBase + eThk, '0.30', g);
        el('rect', { x: xC - capW / 2, y: sinkBase, width: capW, height: Math.max(capMin, eThk), fill: C.exit, 'fill-opacity': '0.85' }, g);
        var rl = txt(xC, labelY, '−' + fmtN(e.n) + '  ' + e.label, { 'font-size': fontPx.toFixed(1) + 'px', fill: C.exit, 'text-anchor': 'end' }, g);
        rl.setAttribute('transform', 'rotate(-90 ' + xC + ' ' + labelY + ')');
      });
    }

    // nodes (vertical bars) + stage labels + retained counts
    for (i = 0; i < k; i++) {
      var thn = t(stages[i].n), x = nodeX(i), col = (i === k - 1) ? C.fin : C.retain;
      var g2 = el('g', { tabindex: '0', role: 'listitem', 'aria-label': stages[i].label + ': ' + fmtN(stages[i].n) + (o.unit ? ' ' + o.unit : '') });
      addTip(g2, '<b>' + stages[i].label + '</b><br>' + fmtN(stages[i].n) + (o.unit ? ' ' + o.unit : ''));
      el('rect', { x: x, y: yTop, width: nodeW, height: Math.max(1, thn), fill: col, 'fill-opacity': '0.92' }, g2);
      txt(x + nodeW / 2, yTop - 20, stages[i].label, { 'font-size': tok('--t-fs-tick', '10.5px'), fill: C.ink2, 'text-anchor': 'middle' }, g2);
      txt(x + nodeW / 2, yTop - 7, fmtN(stages[i].n), { 'font-size': tok('--t-fs-annot', '11px'), 'font-weight': '600', fill: C.ink, 'text-anchor': 'middle' }, g2);
    }

    return svgEl;
  }

  global.ChartKit = global.ChartKit || {};
  global.ChartKit.renderForest = renderForest;
  global.ChartKit.renderSankey = renderSankey;
  global.ChartKit.renderNetwork = renderNetwork;
  global.ChartKit.renderRanking = renderRanking;
  global.ChartKit.renderRankogram = renderRankogram;
  global.ChartKit.renderSROC = renderSROC;
  global.ChartKit.renderDensity = renderDensity;
  global.ChartKit.renderKM = renderKM;
  global.ChartKit.renderCEplane = renderCEplane;
  global.ChartKit.renderScatter = renderScatter;
  global.ChartKit.renderBars = renderBars;
  global.ChartKit.renderLovePlot = renderLovePlot;
  global.ChartKit.renderCurve = renderCurve;
  global.ChartKit.renderROC = renderROC;
  global.ChartKit.renderCalibration = renderCalibration;
  global.ChartKit.renderTrafficLight = renderTrafficLight;
  global.ChartKit.renderStackedBar = renderStackedBar;
  global.ChartKit.renderStackedArea = renderStackedArea;
  global.ChartKit.renderGauge = renderGauge;
  global.ChartKit.renderGroupedForest = renderGroupedForest;
  global.ChartKit.renderInterval = renderInterval;
  global.ChartKit.renderGOSH = renderGOSH;
  global.ChartKit.renderFunnel = renderFunnel;
  global.ChartKit.renderLOO = renderLOO;
  global.ChartKit.renderCumulative = renderCumulative;
  global.ChartKit.renderSubgroup = renderSubgroup;
  global.ChartKit.renderBubble = renderBubble;
  global.ChartKit.niceForestTicks = niceForestTicks;
})(window);
