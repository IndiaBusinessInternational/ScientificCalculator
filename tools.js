/* IBI Scientific Calculator v1.2 — the tool tabs: Equations, Graph, Statistics, Matrix, Vector,
   Calculus, Base-N, Units and Constants. Uses window.ISC from app.js. */
(function () {
  'use strict';
  const I = window.ISC;
  const { M, $, $$, esc, LS } = I;

  // ---------- shared helpers ----------
  const helpBtn = (tab) => `<button type="button" class="iconbtn sm" data-help="${tab}" aria-label="How to use" title="How to use"><svg class="i"><use href="#i-help"/></svg></button>`;
  const head = (title, tab) => `<div class="row" style="margin-bottom:8px"><h2 style="margin:0" class="grow">${title}</h2>${tab ? helpBtn(tab) : ''}</div>`;
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-help]'); if (b) I.openHelp(b.dataset.help); });
  function realOf(v) {
    const t = M.typeOf(v);
    if (t === 'number') return v;
    if (t === 'BigNumber' || t === 'Fraction') return Number(v.valueOf());
    if (t === 'Complex' && Math.abs(v.im) < 1e-12) return v.re;
    throw new I.CalcError('Please enter a real number.');
  }
  function numIn(str, dflt = 0) {
    const s = String(str == null ? '' : str).trim();
    if (!s) return dflt;
    if (/^[-+]?inf(inity)?$|^[-+]?∞$/i.test(s)) return s.startsWith('-') || s.startsWith('−') ? -Infinity : Infinity;
    const r = I.evaluateExpr(s, { dry: true });
    return realOf(r.value);
  }
  function compileFx(src, vname = 'x') {
    let s = String(src).trim().replace(/^\s*(y|f\s*\(\s*\w\s*\))\s*=\s*/i, '');
    if (!s) throw new I.CalcError('Type a function first.');
    const code = I.normalise(s);
    let node;
    try { node = M.parse(code); } catch (e) { throw new I.CalcError(I.friendlyError(e, code)); }
    const c = node.compile();
    const sc = new Map(); for (const [k, v] of I.scope) sc.set(k, v);
    const f = (x) => { sc.set(vname, x); const v = c.evaluate(sc); return typeof v === 'number' ? v : (M.typeOf(v) === 'Complex' && Math.abs(v.im) < 1e-12 ? v.re : NaN); };
    f(1.2345);
    return { f, node, code };
  }
  const html = (x) => I.fmtNum(I.clean(x)).html;
  function exactHtml(x) {
    const c = I.clean(x);
    const ex = I.exactOf(c);
    return ex ? `${ex.html} <span class="muted">≈ ${I.fmtNum(c).html}</span>` : I.fmtNum(c).html;
  }
  function cplxHtml(z) { return z.im === 0 ? exactHtml(z.re) : I.fmtValue(M.complex(z.re, z.im), { polar: false }).html; }
  function tex(el, t, fallback) { if (!I.renderTex(el, t)) el.textContent = fallback || ''; }
  function msg(text, err) { return `<div class="msg${err ? ' err' : ''}">${text}</div>`; }
  const store = (k, v) => LS.set('t:' + k, v);
  const load = (k, d) => LS.get('t:' + k, d);
  function subtabs(id, items, cur) { return `<div class="subtabs" id="${id}">${items.map(([k, l]) => `<button type="button" class="pill ${k === cur ? 'on' : ''}" data-k="${k}">${l}</button>`).join('')}</div>`; }
  function bindSubtabs(el, fn) { el.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (!b) return; $$('[data-k]', el).forEach((x) => x.classList.toggle('on', x === b)); fn(b.dataset.k); }); }
  const PALETTE = ['#e5484d', '#3e8ef7', '#2fb36d', '#f5a524', '#a35cff', '#14b8c4'];
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function niceStep(range, target) {
    const raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  const tick = (v, step) => { const d = Math.max(0, -Math.floor(Math.log10(step)) + (step / Math.pow(10, Math.floor(Math.log10(step))) === 5 ? 0 : 0)); const s = Math.abs(v) < step / 1e6 ? '0' : Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(1) : v.toFixed(Math.min(10, d)); return s.replace('-', '−'); };
  // Reduced row echelon form, rank and vector helpers for the Matrix and Vector tabs.
  function rrefArr(A) {
    const a = A.map((r) => r.map((v) => realOf(v)));
    const rows = a.length, cols = rows ? a[0].length : 0;
    let lead = 0;
    for (let r = 0; r < rows && lead < cols; r++) {
      let i = r;
      let best = r; for (let k = r; k < rows; k++) if (Math.abs(a[k][lead]) > Math.abs(a[best][lead])) best = k;
      i = best;
      if (Math.abs(a[i][lead]) < 1e-12) { lead++; r--; continue; }
      [a[i], a[r]] = [a[r], a[i]];
      const lv = a[r][lead]; a[r] = a[r].map((v) => v / lv);
      for (let k = 0; k < rows; k++) if (k !== r) { const f = a[k][lead]; a[k] = a[k].map((v, j) => v - f * a[r][j]); }
      lead++;
    }
    return a.map((r) => r.map((v) => (Math.abs(v) < 1e-12 ? 0 : I.clean(v))));
  }
  const toArr = (A) => (M.typeOf(A) === 'DenseMatrix' ? A.toArray() : A);
  const rankOf = (A) => rrefArr(toArr(A)).filter((r) => r.some((v) => v !== 0)).length;
  const vecLen = (v) => Math.sqrt(toArr(v).reduce((s, x) => s + realOf(x) ** 2, 0));
  M.import({
    rref: M.typed('rref', { 'Array | Matrix': (A) => M.matrix(rrefArr(toArr(A))) }),
    rank: M.typed('rank', { 'Array | Matrix': (A) => rankOf(A) }),
    unitv: M.typed('unitv', { 'Array | Matrix': (v) => { const n = vecLen(v); if (!n) throw new I.CalcError('Math ERROR: the zero vector has no direction.'); return M.divide(v, n); } }),
    angle: M.typed('angle', { 'Array | Matrix, Array | Matrix': (a, b) => { const na = vecLen(a), nb = vecLen(b); if (!na || !nb) throw new I.CalcError('Math ERROR: angle with a zero vector.'); const c = Math.max(-1, Math.min(1, realOf(M.dot(a, b)) / (na * nb))); return M.acos(c); } }),
    proj: M.typed('proj', { 'Array | Matrix, Array | Matrix': (a, b) => { const nb = vecLen(b); if (!nb) throw new I.CalcError('Math ERROR: cannot project onto the zero vector.'); return M.multiply(b, realOf(M.dot(a, b)) / (nb * nb)); } })
  }, { override: true });

  // =====================================================================
  // EQUATIONS
  // =====================================================================
  I.registerTab('eqn', {
    init(view) {
      const st = Object.assign({ mode: 'lin', n: 2, deg: 2, rel: '=', lin: {}, poly: {}, any: 'x^3 - 2x = 5', from: '-100', to: '100', ang: 'rad' }, load('eqn', {}));
      view.innerHTML = `<div class="col col-in"><div class="card">${head('Equation solver', 'eqn')}
        ${subtabs('eqModes', [['lin', 'Simultaneous'], ['poly', 'Polynomial'], ['any', 'Any equation']], st.mode)}
        <div id="eqIn"></div>
        <div class="row" style="margin-top:12px"><button type="button" class="btn" id="eqGo">Solve</button><button type="button" class="btn ghost" id="eqClear">Clear</button></div>
      </div></div>
      <div class="col col-out"><div class="card"><h2>Answer</h2><div id="eqOut"><div class="empty">Your answers appear here. Fill the boxes and tap Solve.</div></div></div></div>`;
      const inEl = $('#eqIn', view), out = $('#eqOut', view);
      const VARS = ['x', 'y', 'z', 'w'];
      const save = () => store('eqn', st);
      const box = (key, ph, grp) => `<input class="inp mono" data-${grp}="${key}" value="${esc((st[grp] || {})[key] || '')}" placeholder="${ph}" autocomplete="off" aria-label="${ph}" style="text-align:center;padding:0 4px">`;
      function paint() {
        if (st.mode === 'lin') {
          const n = st.n;
          let rows = '';
          for (let i = 0; i < n; i++) {
            let cells = '';
            for (let j = 0; j < n; j++) cells += box(`${n}:${i}_${j}`, String.fromCharCode(97 + j) + (i + 1), 'lin') + `<span class="eqlab">${VARS[j]}${j < n - 1 ? ' +' : ''}</span>`;
            rows += cells + `<span class="eqlab">=</span>` + box(`${n}:${i}_${n}`, 'd' + (i + 1), 'lin');
          }
          inEl.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="lbl">Unknowns</span>${[2, 3, 4].map((k) => `<button type="button" class="pill ${st.n === k ? 'on' : ''}" data-n="${k}">${k}</button>`).join('')}</div>
            <div class="cgrid" style="grid-template-columns:repeat(${n},minmax(0,1fr) auto) auto minmax(0,1fr);gap:4px 3px">${rows}</div>
            <p class="hint">Example: 2x + 3y = 8 and x − y = −1 → type 2, 3, 8 then 1, −1, −1. Fractions such as 1/2 are fine.</p>`;
        } else if (st.mode === 'poly') {
          const d = st.deg, names = ['a', 'b', 'c', 'd', 'e'].slice(0, d + 1);
          const pw = (k) => (k === 0 ? '' : k === 1 ? 'x' : `x${['', '', '²', '³', '⁴'][k]}`);
          inEl.innerHTML = `<div class="row" style="margin-bottom:10px"><span class="lbl">Degree</span>${[2, 3, 4].map((k) => `<button type="button" class="pill ${st.deg === k ? 'on' : ''}" data-deg="${k}">${['', '', 'Quadratic', 'Cubic', 'Quartic'][k]}</button>`).join('')}</div>
            <div class="cgrid" style="grid-template-columns:repeat(${d + 1},minmax(0,1fr) auto);gap:4px 3px">${names.map((nm, i) => box(nm, nm, 'poly') + `<span class="eqlab">${pw(d - i)}${i < d ? ' +' : ''}</span>`).join('')}</div>
            <div class="row" style="margin-top:10px"><span class="lbl">Sign</span>${['=', '>', '≥', '<', '≤'].map((r) => `<button type="button" class="pill ${st.rel === r ? 'on' : ''}" data-rel="${r}">${r} 0</button>`).join('')}</div>
            <div class="natural" id="polyTex" style="margin-top:8px"></div>`;
          paintPolyTex();
        } else {
          inEl.innerHTML = `<label class="field"><span>Equation in x</span><input class="inp mono" id="anyEq" value="${esc(st.any)}" placeholder="e.g. x³ − 2x = 5 or cos(x) = x" autocomplete="off"></label>
            <div class="grid3" style="margin-top:8px"><label class="field"><span>Search from</span><input class="inp mono" id="anyFrom" value="${esc(st.from)}"></label><label class="field"><span>to</span><input class="inp mono" id="anyTo" value="${esc(st.to)}"></label>
            <label class="field"><span>Angles</span><select class="inp" id="anyAng"><option value="rad" ${st.ang === 'rad' ? 'selected' : ''}>Radians</option><option value="deg" ${st.ang === 'deg' ? 'selected' : ''}>Degrees</option></select></label></div>
            <p class="hint">Finds every real solution in the range. Widen the range if you expect more.</p>`;
        }
      }
      function paintPolyTex() {
        const el = $('#polyTex', view); if (!el) return;
        const d = st.deg, names = ['a', 'b', 'c', 'd', 'e'].slice(0, d + 1);
        const t = names.map((nm, i) => { const p = d - i; const v = (st.poly[nm] || nm).trim() || nm; return `(${v})${p ? (p === 1 ? 'x' : `x^{${p}}`) : ''}`; }).join(' + ') + ' ' + ({ '=': '=', '>': '>', '≥': '\\ge', '<': '<', '≤': '\\le' })[st.rel] + ' 0';
        tex(el, t.replace(/\(([a-e])\)/g, '$1'), '');
      }
      bindSubtabs($('#eqModes', view), (k) => { st.mode = k; save(); paint(); out.innerHTML = '<div class="empty">Fill the boxes and tap Solve.</div>'; });
      inEl.addEventListener('click', (e) => {
        const b = e.target.closest('[data-n],[data-deg],[data-rel]'); if (!b) return;
        if (b.dataset.n) st.n = +b.dataset.n; if (b.dataset.deg) st.deg = +b.dataset.deg; if (b.dataset.rel) st.rel = b.dataset.rel;
        save(); paint();
      });
      inEl.addEventListener('input', (e) => {
        const t = e.target;
        if (t.dataset.lin) st.lin[t.dataset.lin] = t.value;
        if (t.dataset.poly) { st.poly[t.dataset.poly] = t.value; paintPolyTex(); }
        if (t.id === 'anyEq') st.any = t.value; if (t.id === 'anyFrom') st.from = t.value; if (t.id === 'anyTo') st.to = t.value;
        t.classList.remove('bad'); save();
      });
      inEl.addEventListener('change', (e) => { if (e.target.id === 'anyAng') { st.ang = e.target.value; save(); } });
      inEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); solve(); } });
      $('#eqClear', view).addEventListener('click', () => { if (st.mode === 'lin') st.lin = {}; else if (st.mode === 'poly') st.poly = {}; else st.any = ''; save(); paint(); out.innerHTML = '<div class="empty">Cleared.</div>'; });
      $('#eqGo', view).addEventListener('click', solve);
      function readBox(grp, key) {
        const el = inEl.querySelector(`[data-${grp}="${key}"]`);
        try { return numIn(el ? el.value : '', 0); } catch (e) { if (el) el.classList.add('bad'); throw e; }
      }
      function solve() {
        try {
          if (st.mode === 'lin') solveLin(); else if (st.mode === 'poly') solvePoly(); else solveAny();
          if (matchMedia('(max-width: 999px)').matches) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) { out.innerHTML = msg(esc(e.message), true); }
      }
      function solveLin() {
        const n = st.n, A = [], b = [];
        for (let i = 0; i < n; i++) { A.push([]); for (let j = 0; j < n; j++) A[i].push(readBox('lin', `${n}:${i}_${j}`)); b.push(readBox('lin', `${n}:${i}_${n}`)); }
        const det = M.det(A);
        if (Math.abs(det) < 1e-12) {
          const rA = rankOf(A), rAb = rankOf(A.map((r, i) => r.concat([b[i]])));
          out.innerHTML = msg(rA === rAb ? '<b>Infinitely many solutions.</b> The equations depend on each other (the determinant is 0).' : '<b>No solution.</b> The equations contradict each other (the determinant is 0).') + `<div class="kv" style="margin-top:8px"><div><b>Determinant</b><span>0</span></div><div><b>Rank of A</b><span>${rA}</span></div><div><b>Rank of [A | d]</b><span>${rAb}</span></div></div>`;
          return;
        }
        const x = M.lusolve(A, b).map((r) => I.clean(r[0]));
        out.innerHTML = `<div class="roots">${x.map((v, i) => `<div><b>${VARS[i]} =</b><span class="v">${exactHtml(v)}</span></div>`).join('')}</div>
          <div class="kv" style="margin-top:10px"><div><b>Determinant</b><span>${exactHtml(det)}</span></div></div>
          <p class="hint">Check: put the answers back into each equation; both sides match.</p>`;
      }
      function solvePoly() {
        const d = st.deg, names = ['a', 'b', 'c', 'd', 'e'].slice(0, d + 1);
        const c = names.map((nm) => readBox('poly', nm));
        if (c[0] === 0) throw new I.CalcError(`a cannot be 0 for a ${['', '', 'quadratic', 'cubic', 'quartic'][d]}. Pick a lower degree instead.`);
        const roots = I.num.polyRoots(c);
        const p = (x) => c.reduce((s, k) => s * x + k, 0);
        let h = '';
        if (st.rel === '=') {
          h += `<div class="roots">${roots.map((r, i) => `<div><b>x${['₁', '₂', '₃', '₄'][i]} =</b><span class="v">${cplxHtml(r)}</span></div>`).join('')}</div>`;
        } else {
          const real = [...new Set(roots.filter((r) => r.im === 0).map((r) => r.re))].sort((a1, b1) => a1 - b1);
          const strict = st.rel === '>' || st.rel === '<', want = st.rel === '>' || st.rel === '≥' ? 1 : -1;
          const pts = [-Infinity, ...real, Infinity];
          const parts = [];
          for (let i = 0; i < pts.length - 1; i++) {
            const lo = pts[i], hi = pts[i + 1];
            const mid = !isFinite(lo) && !isFinite(hi) ? 0 : !isFinite(lo) ? hi - 1 : !isFinite(hi) ? lo + 1 : (lo + hi) / 2;
            if (Math.sign(p(mid)) === want) parts.push([lo, hi]);
          }
          const merged = [];
          for (const pr of parts) { const lastP = merged[merged.length - 1]; if (lastP && !strict && lastP[1] === pr[0]) lastP[1] = pr[1]; else merged.push(pr.slice()); }
          const le = strict ? '<' : '≤';
          const txt = merged.map(([lo, hi]) => (!isFinite(lo) && !isFinite(hi)) ? 'every real x' : !isFinite(lo) ? `x ${le} ${html(hi)}` : !isFinite(hi) ? `x ${strict ? '>' : '≥'} ${html(lo)}` : `${html(lo)} ${le} x ${le} ${html(hi)}`);
          if (!strict) real.forEach((r) => { if (!merged.some(([lo, hi]) => r >= lo && r <= hi)) txt.push(`x = ${html(r)}`); });
          h += `<div class="out-big">${txt.length ? txt.join('&nbsp; or &nbsp;') : 'No real x works.'}</div><p class="hint">Real roots used for the sign chart: ${real.length ? real.map(html).join(', ') : 'none'}.</p>`;
        }
        const kv = [];
        if (d === 2) {
          const [a, b2, cc] = c, D = b2 * b2 - 4 * a * cc, vx = -b2 / (2 * a);
          kv.push(['Discriminant Δ = b² − 4ac', exactHtml(D)], [D > 0 ? 'Roots' : D === 0 ? 'Roots' : 'Roots', D > 0 ? 'two real, different' : D === 0 ? 'one repeated real root' : 'two complex (no real roots)'], [a > 0 ? 'Minimum point (vertex)' : 'Maximum point (vertex)', `(${exactHtml(vx)}, ${exactHtml(p(vx))})`], ['Sum of roots −b/a', exactHtml(-b2 / a)], ['Product of roots c/a', exactHtml(cc / a)]);
        } else {
          const dc = c.slice(0, -1).map((v, i) => v * (d - i));
          const tp = I.num.polyRoots(dc).filter((r) => r.im === 0).map((r) => r.re);
          if (tp.length) kv.push(['Turning points', tp.map((x) => `(${html(x)}, ${html(p(x))})`).join('<br>')]);
        }
        kv.push(['y-intercept', exactHtml(c[c.length - 1])]);
        h += `<div class="kv" style="margin-top:10px">${kv.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('')}</div>`;
        out.innerHTML = h;
      }
      function solveAny() {
        const src = st.any.trim(); if (!src) throw new I.CalcError('Type an equation, for example x³ − 2x = 5.');
        const sides = src.replace(/==/g, '=').split('=');
        if (sides.length > 2) throw new I.CalcError('Use one = sign.');
        const expr = sides.length === 2 ? `(${sides[0]}) - (${sides[1]})` : sides[0];
        const a = numIn(st.from, -100), b = numIn(st.to, 100);
        if (!(a < b)) throw new I.CalcError('“Search from” must be smaller than “to”.');
        I.setAngleForTool(st.ang);
        let roots, f;
        try { f = compileFx(expr).f; roots = I.num.findRoots(f, a, b, 20000); } finally { I.restoreAngle(); }
        if (!roots.length) { out.innerHTML = msg(`No real solution between ${html(a)} and ${html(b)}. Try a wider range, or check the equation.`); return; }
        const shown = roots.slice(0, 60);
        out.innerHTML = `<div class="roots">${shown.map((r, i) => `<div><b>x${roots.length > 1 ? (i + 1) : ''} =</b><span class="v">${exactHtml(r)}</span></div>`).join('')}</div>
          <p class="hint">${roots.length} solution${roots.length > 1 ? 's' : ''} between ${html(a)} and ${html(b)}${roots.length > 60 ? ' (first 60 shown)' : ''}. Angles in ${st.ang === 'rad' ? 'radians' : 'degrees'}.</p>`;
      }
      paint();
      I.registerData('eqn', () => load('eqn', {}), (v) => store('eqn', v));
    }
  });

  // =====================================================================
  // GRAPH
  // =====================================================================
  const graphTab = {
    init(view) {
      const st = Object.assign({ fns: [{ s: 'x^2 - 2', on: true }, { s: 'sin(x)', on: true }, { s: '', on: true }], view: null, ang: 'rad', tFrom: '-5', tTo: '5', tStep: '1' }, load('graph', {}));
      while (st.fns.length < 6 && st.fns.every((f) => f.s.trim())) st.fns.push({ s: '', on: true });
      view.innerHTML = `<div class="col col-in"><div class="card">${head('Functions', 'graph')}<div id="gFns"></div>
          <div class="row"><button type="button" class="btn ghost" id="gAdd"><svg class="i"><use href="#i-plus"/></svg>Add function</button>
          <label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>Angles</span><select class="inp" id="gAng" style="width:auto"><option value="rad" ${st.ang === 'rad' ? 'selected' : ''}>Radians</option><option value="deg" ${st.ang === 'deg' ? 'selected' : ''}>Degrees</option></select></label></div>
          <p class="hint">Type y = … in terms of x, e.g. <code>x² − 2</code>, <code>2sin(x)</code>, <code>1/x</code>, <code>√(x)</code>, <code>abs(x − 1)</code>.</p></div>
        <div class="card"><h3>Key points in view</h3><div class="feature-list" id="gFeat"><div class="empty">Roots, turning points and crossings appear here.</div></div></div>
        <div class="card"><h3>Table of values</h3><div class="grid3"><label class="field"><span>x from</span><input class="inp mono" id="tFrom" value="${esc(st.tFrom)}"></label><label class="field"><span>to</span><input class="inp mono" id="tTo" value="${esc(st.tTo)}"></label><label class="field"><span>step</span><input class="inp mono" id="tStep" value="${esc(st.tStep)}"></label></div><div style="margin-top:8px" id="gTable"></div></div>
      </div>
      <div class="col col-out graph-col"><div class="card"><div class="graph-box" id="gBox"><canvas id="gCan" aria-label="Graph of the functions"></canvas>
        <div class="graph-tools"><button type="button" id="gIn" aria-label="Zoom in" title="Zoom in">+</button><button type="button" id="gOut" aria-label="Zoom out" title="Zoom out">−</button><button type="button" id="gHome" aria-label="Reset view" title="Reset view"><svg class="i"><use href="#i-home"/></svg></button><button type="button" id="gPng" aria-label="Save as image" title="Save as image"><svg class="i"><use href="#i-img"/></svg></button></div>
        <div class="graph-read" id="gRead"></div></div>
        <p class="hint">Drag to move · pinch or scroll to zoom · tap a curve to read a point.</p></div></div>`;
      const style = document.createElement('style');
      style.textContent = '@media (max-width: 999px) { #view-graph .graph-col { order: -1; } }';
      view.appendChild(style);
      const can = $('#gCan', view), box = $('#gBox', view), ctx = can.getContext('2d');
      let V = st.view || { cx: 0, cy: 0, s: 40 };   // centre and pixels per unit
      let compiled = [], trace = null, features = [];
      const save = () => { st.view = V; store('graph', st); };
      function paintFns() {
        $('#gFns', view).innerHTML = st.fns.map((f, i) => `<div class="fn-row"><button type="button" class="sw ${f.on ? '' : 'off'}" data-tog="${i}" style="border-color:${PALETTE[i]};color:${PALETTE[i]}" title="Show or hide" aria-label="Show or hide f${i + 1}">f${i + 1}</button>
          <input class="inp mono" data-fn="${i}" value="${esc(f.s)}" placeholder="y = …" autocomplete="off" aria-label="Function ${i + 1}">
          <button type="button" class="iconbtn" data-del="${i}" aria-label="Remove f${i + 1}" title="Remove"><svg class="i"><use href="#i-x"/></svg></button></div><div class="hint" data-err="${i}" style="margin:-4px 0 6px 40px;color:var(--bad)" hidden></div>`).join('');
        $('#gAdd', view).hidden = st.fns.length >= 6;
      }
      function compileAll() {
        compiled = st.fns.map((f, i) => {
          const errEl = view.querySelector(`[data-err="${i}"]`);
          if (errEl) errEl.hidden = true;
          if (!f.s.trim() || !f.on) return null;
          try { return compileFx(f.s).f; } catch (e) { if (errEl) { errEl.hidden = false; errEl.textContent = e.message; } return null; }
        });
      }
      const W = () => can.width / devicePixelRatio, H = () => can.height / devicePixelRatio;
      const sx = (x) => W() / 2 + (x - V.cx) * V.s, sy = (y) => H() / 2 - (y - V.cy) * V.s;
      const wx = (px) => V.cx + (px - W() / 2) / V.s, wy = (py) => V.cy - (py - H() / 2) / V.s;
      const evalF = (f, x) => { I.setAngleForTool(st.ang); try { const y = f(x); return typeof y === 'number' ? y : NaN; } catch (e) { return NaN; } finally { I.restoreAngle(); } };
      function resize() {
        const r = box.getBoundingClientRect();
        can.width = Math.max(1, Math.round(r.width * devicePixelRatio)); can.height = Math.max(1, Math.round(r.height * devicePixelRatio));
        draw();
      }
      function draw() {
        const w = W(), h = H(), dpr = devicePixelRatio;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = css('--surface'); ctx.fillRect(0, 0, w, h);
        const step = niceStep(w / V.s, Math.max(4, w / 90));
        const x0 = wx(0), x1 = wx(w), y0 = wy(h), y1 = wy(0);
        ctx.lineWidth = 1;
        ctx.strokeStyle = css('--line'); ctx.globalAlpha = 0.45; ctx.beginPath();
        for (let x = Math.ceil(x0 / (step / 5)) * (step / 5); x <= x1; x += step / 5) { const p = Math.round(sx(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, h); }
        for (let y = Math.ceil(y0 / (step / 5)) * (step / 5); y <= y1; y += step / 5) { const p = Math.round(sy(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(w, p); }
        ctx.stroke(); ctx.globalAlpha = 1;
        ctx.strokeStyle = css('--line'); ctx.beginPath();
        for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { const p = Math.round(sx(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, h); }
        for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { const p = Math.round(sy(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(w, p); }
        ctx.stroke();
        ctx.strokeStyle = css('--muted'); ctx.lineWidth = 1.5; ctx.beginPath();
        const ax = Math.min(Math.max(sx(0), 0), w), ay = Math.min(Math.max(sy(0), 0), h);
        ctx.moveTo(0, ay); ctx.lineTo(w, ay); ctx.moveTo(ax, 0); ctx.lineTo(ax, h); ctx.stroke();
        ctx.fillStyle = css('--muted'); ctx.font = '12px Roboto, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        const ly = Math.min(Math.max(ay + 4, 2), h - 16);
        for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) { if (Math.abs(x) < step / 2) continue; ctx.fillText(tick(x, step), sx(x), ly); }
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const lx = Math.min(Math.max(ax - 4, 30), w - 4);
        for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { if (Math.abs(y) < step / 2) continue; ctx.fillText(tick(y, step), lx, sy(y)); }
        compiled.forEach((f, i) => {
          if (!f) return;
          ctx.strokeStyle = PALETTE[i]; ctx.lineWidth = 2.5; ctx.beginPath();
          let pen = false, prevY = NaN;
          const N = Math.ceil(w * 2);
          for (let k = 0; k <= N; k++) {
            const px = k / 2, y = evalF(f, wx(px)), py = sy(y);
            if (!isFinite(y) || Math.abs(py) > 1e5) { pen = false; prevY = NaN; continue; }
            if (pen && Math.abs(py - prevY) > h * 1.5) pen = false;
            if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
            prevY = py;
          }
          ctx.stroke();
        });
        features.forEach((p) => { ctx.fillStyle = css('--surface'); ctx.strokeStyle = p.c; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), 4.5, 0, 7); ctx.fill(); ctx.stroke(); });
        if (trace) { ctx.fillStyle = trace.c; ctx.beginPath(); ctx.arc(sx(trace.x), sy(trace.y), 6, 0, 7); ctx.fill(); }
      }
      function findFeatures() {
        features = [];
        const w = W(), a = wx(0), b = wx(w), n = Math.max(200, Math.round(w));
        const list = [];
        compiled.forEach((f, i) => {
          if (!f) return;
          const g = (x) => evalF(f, x);
          I.num.findRoots(g, a, b, n).forEach((x) => list.push({ x, y: 0, c: PALETTE[i], t: `f${i + 1} root` }));
          const d = (x) => { const hh = 1e-5 * Math.max(1, Math.abs(x)); return (g(x + hh) - g(x - hh)) / (2 * hh); };
          I.num.findRoots(d, a, b, n).forEach((x) => { const y = g(x); if (!isFinite(y)) return; const s = g(x - 1e-3 * Math.max(1, Math.abs(x))) - y; if (Math.abs(s) < 1e-12) return; list.push({ x, y, c: PALETTE[i], t: `f${i + 1} ${s > 0 ? 'minimum' : 'maximum'}` }); });
          if (a <= 0 && b >= 0) { const y = g(0); if (isFinite(y)) list.push({ x: 0, y, c: PALETTE[i], t: `f${i + 1} y-intercept` }); }
          for (let j = i + 1; j < compiled.length; j++) {
            const f2 = compiled[j]; if (!f2) continue;
            I.num.findRoots((x) => g(x) - evalF(f2, x), a, b, n).forEach((x) => list.push({ x, y: g(x), c: PALETTE[j], t: `f${i + 1} = f${j + 1}` }));
          }
        });
        const h = H();
        features = list.filter((p) => isFinite(p.y) && sy(p.y) >= -10 && sy(p.y) <= h + 10).slice(0, 80);
        $('#gFeat', view).innerHTML = features.length ? features.map((p, k) => `<button type="button" data-feat="${k}"><span style="color:${p.c}">●</span> ${esc(p.t)}: (${I.fmtNum(I.clean(p.x)).html}, ${I.fmtNum(I.clean(p.y)).html})</button>`).join('') : '<div class="empty">No roots or turning points in view. Move or zoom the graph.</div>';
      }
      let featT = 0;
      const redraw = (full) => { if (full) compileAll(); draw(); clearTimeout(featT); featT = setTimeout(() => { findFeatures(); draw(); }, full ? 30 : 250); };
      graphTab.redraw = () => redraw(false);
      function paintTable() {
        const out = $('#gTable', view);
        try {
          const a = numIn(st.tFrom), b = numIn(st.tTo), s = numIn(st.tStep);
          if (!(s > 0)) throw new I.CalcError('Step must be more than 0.');
          const n = Math.floor((b - a) / s + 1e-9) + 1;
          if (n < 1) throw new I.CalcError('“to” must be at least “x from”.');
          if (n > 500) throw new I.CalcError('That is more than 500 rows. Use a bigger step.');
          const act = compiled.map((f, i) => [f, i]).filter(([f]) => f);
          if (!act.length) { out.innerHTML = '<div class="empty">Type a function above.</div>'; return; }
          let rows = '';
          for (let k = 0; k < n; k++) { const x = I.clean(a + k * s); rows += `<tr><td>${I.fmtNum(x).html}</td>${act.map(([f]) => { const y = evalF(f, x); return `<td>${isFinite(y) ? I.fmtNum(I.clean(y)).html : '—'}</td>`; }).join('')}</tr>`; }
          out.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>x</th>${act.map(([, i]) => `<th style="color:${PALETTE[i]}">f${i + 1}(x)</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
        } catch (e) { out.innerHTML = msg(esc(e.message), true); }
      }
      // interactions
      const pts = new Map(); let drag = null, pinch = null, moved = false;
      box.addEventListener('pointerdown', (e) => { if (e.target.closest('.graph-tools')) return; try { box.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ } pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY }); moved = false; if (pts.size === 1) drag = { x: e.offsetX, y: e.offsetY, cx: V.cx, cy: V.cy }; else if (pts.size === 2) { const [p, q] = [...pts.values()]; pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), s: V.s, cx: V.cx, cy: V.cy, mx: (p.x + q.x) / 2, my: (p.y + q.y) / 2 }; drag = null; } });
      box.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') hoverRead(e.offsetX, e.offsetY); return; }
        pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        if (pinch && pts.size === 2) {
          const [p, q] = [...pts.values()]; const d = Math.hypot(p.x - q.x, p.y - q.y);
          const ns = Math.min(1e7, Math.max(1e-6, pinch.s * d / pinch.d));
          const wxm = pinch.cx + (pinch.mx - W() / 2) / pinch.s, wym = pinch.cy - (pinch.my - H() / 2) / pinch.s;
          V.s = ns; V.cx = wxm - (pinch.mx - W() / 2) / ns; V.cy = wym + (pinch.my - H() / 2) / ns; moved = true; redraw(false);
        } else if (drag) {
          const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
          V.cx = drag.cx - dx / V.s; V.cy = drag.cy + dy / V.s; redraw(false);
        }
      });
      const end = (e) => { if (pts.has(e.pointerId) && !moved && pts.size === 1) tapRead(e.offsetX, e.offsetY); pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { drag = null; save(); } };
      box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
      box.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
      function zoomAt(px, py, k) { const x = wx(px), y = wy(py); V.s = Math.min(1e7, Math.max(1e-6, V.s * k)); V.cx = x - (px - W() / 2) / V.s; V.cy = y + (py - H() / 2) / V.s; redraw(false); save(); }
      function nearest(px, py) {
        const x = wx(px); let best = null;
        compiled.forEach((f, i) => { if (!f) return; const y = evalF(f, x); if (!isFinite(y)) return; const d = Math.abs(sy(y) - py); if (!best || d < best.d) best = { d, x, y, c: PALETTE[i], i }; });
        return best;
      }
      function showRead(p) { $('#gRead', view).innerHTML = p ? `<span style="color:${p.c}">●</span> ${p.t ? esc(p.t) + ': ' : `f${p.i + 1}: `}x = ${I.fmtNum(I.clean(p.x)).html}, y = ${I.fmtNum(I.clean(p.y)).html}` : ''; }
      function tapRead(px, py) { const b = nearest(px, py); if (b && b.d < 40) { trace = b; showRead(b); } else { trace = null; showRead(null); } draw(); }
      function hoverRead(px, py) { const b = nearest(px, py); if (b && b.d < 24) { trace = b; showRead(b); draw(); } }
      $('#gIn', view).addEventListener('click', () => zoomAt(W() / 2, H() / 2, 1.5));
      $('#gOut', view).addEventListener('click', () => zoomAt(W() / 2, H() / 2, 1 / 1.5));
      $('#gHome', view).addEventListener('click', () => { V = { cx: 0, cy: 0, s: Math.min(W(), H()) / 12 }; trace = null; showRead(null); redraw(false); save(); });
      $('#gPng', view).addEventListener('click', () => { const a = document.createElement('a'); a.download = 'IBI-graph.png'; a.href = can.toDataURL('image/png'); document.body.appendChild(a); a.click(); a.remove(); I.toast('Graph saved as an image.'); });
      $('#gFeat', view).addEventListener('click', (e) => { const b = e.target.closest('[data-feat]'); if (!b) return; const p = features[+b.dataset.feat]; V.cx = p.x; V.cy = p.y; trace = p; showRead(p); redraw(false); save(); if (matchMedia('(max-width: 999px)').matches) box.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      const fnsEl = $('#gFns', view);
      let typeT = 0;
      fnsEl.addEventListener('input', (e) => { const i = e.target.dataset.fn; if (i == null) return; st.fns[+i].s = e.target.value; store('graph', st); clearTimeout(typeT); typeT = setTimeout(() => { redraw(true); paintTable(); }, 250); });
      fnsEl.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tog],[data-del]'); if (!t) return;
        if (t.dataset.tog) { const f = st.fns[+t.dataset.tog]; f.on = !f.on; }
        else { st.fns.splice(+t.dataset.del, 1); if (!st.fns.length) st.fns.push({ s: '', on: true }); }
        store('graph', st); paintFns(); redraw(true); paintTable();
      });
      $('#gAdd', view).addEventListener('click', () => { if (st.fns.length < 6) { st.fns.push({ s: '', on: true }); store('graph', st); paintFns(); const ins = $$('[data-fn]', view); ins[ins.length - 1].focus(); } });
      $('#gAng', view).addEventListener('change', (e) => { st.ang = e.target.value; store('graph', st); redraw(true); paintTable(); });
      ['tFrom', 'tTo', 'tStep'].forEach((id) => $('#' + id, view).addEventListener('input', (e) => { st[id] = e.target.value; store('graph', st); paintTable(); }));
      new ResizeObserver(() => { if (view.classList.contains('on')) resize(); }).observe(box);
      paintFns(); compileAll(); paintTable();
      if (!st.view) requestAnimationFrame(() => { const r = box.getBoundingClientRect(); V = { cx: 0, cy: 0, s: Math.max(10, Math.min(r.width, r.height) / 12) }; resize(); findFeatures(); draw(); });
      graphTab.show = () => requestAnimationFrame(() => { resize(); findFeatures(); draw(); });
      I.registerData('graph', () => load('graph', {}), (v) => store('graph', v));
    }
  };
  I.registerTab('graph', graphTab);

  // =====================================================================
  // STATISTICS
  // =====================================================================
  I.registerTab('stat', {
    init(view) {
      const st = Object.assign({ two: false, freq: false, rows: [], model: 'lin' }, load('stat', {}));
      if (!st.rows.length) st.rows = Array.from({ length: 5 }, () => ({ x: '', y: '', f: '' }));
      view.innerHTML = `<div class="col col-in"><div class="card">${head('Statistics', 'stat')}
        <div class="row" style="margin-bottom:8px"><div class="seg"><button type="button" data-two="0" class="${st.two ? '' : 'on'}">1-variable (x)</button><button type="button" data-two="1" class="${st.two ? 'on' : ''}">2-variable (x, y)</button></div>
        <label class="row" style="gap:6px;min-height:44px"><input type="checkbox" id="sFreq" ${st.freq ? 'checked' : ''} style="width:20px;height:20px"> Frequency column</label></div>
        <div class="tbl-wrap"><table class="tbl" id="sTbl"></table></div>
        <div class="row" style="margin-top:8px"><button type="button" class="btn ghost" id="sAdd"><svg class="i"><use href="#i-plus"/></svg>Add row</button><button type="button" class="btn ghost" id="sPaste">Paste a list</button><button type="button" class="btn ghost" id="sEx">Example</button><button type="button" class="btn danger" id="sClr">Clear</button></div>
      </div></div>
      <div class="col col-out"><div class="card"><h2>Results</h2><div id="sOut"></div></div><div class="card" id="sRegCard" hidden><h2>Regression</h2><div id="sReg"></div></div><div class="card"><h3 id="sChartT">Chart</h3><canvas id="sChart" style="width:100%;height:260px;display:block"></canvas></div></div>`;
      const tbl = $('#sTbl', view), out = $('#sOut', view);
      const save = () => store('stat', st);
      function paintTable() {
        const cols = ['x'].concat(st.two ? ['y'] : []).concat(st.freq ? ['f'] : []);
        tbl.innerHTML = `<thead><tr><th>#</th>${cols.map((c) => `<th>${c === 'f' ? 'Freq' : c}</th>`).join('')}<th></th></tr></thead><tbody>${st.rows.map((r, i) => `<tr><td class="muted">${i + 1}</td>${cols.map((c) => `<td><input data-r="${i}" data-c="${c}" value="${esc(r[c] || '')}" placeholder="${c === 'f' ? '1' : ''}" inputmode="decimal" autocomplete="off" aria-label="Row ${i + 1} ${c}"></td>`).join('')}<td class="act"><button type="button" class="iconbtn sm" data-delrow="${i}" aria-label="Delete row ${i + 1}"><svg class="i"><use href="#i-x"/></svg></button></td></tr>`).join('')}</tbody>`;
      }
      function data() {
        const xs = [], ys = [], fs = [], bad = [];
        st.rows.forEach((r, i) => {
          const sx = (r.x || '').trim(), sy = (r.y || '').trim();
          if (!sx && (!st.two || !sy)) return;
          try {
            const x = numIn(sx, NaN), y = st.two ? numIn(sy, NaN) : 0, f = st.freq ? numIn((r.f || '').trim() || '1', 1) : 1;
            if (!isFinite(x) || (st.two && !isFinite(y))) { bad.push(i + 1); return; }
            if (f < 0) { bad.push(i + 1); return; }
            xs.push(x); ys.push(y); fs.push(f);
          } catch (e) { bad.push(i + 1); }
        });
        return { xs, ys, fs, bad };
      }
      const kv = (pairs) => `<div class="kv">${pairs.map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('')}</div>`;
      function median(sorted) { const n = sorted.length; if (!n) return NaN; return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2; }
      function compute() {
        const { xs, ys, fs, bad } = data();
        const n = fs.reduce((a, b) => a + b, 0);
        const badMsg = bad.length ? msg(`Rows ${bad.join(', ')} are skipped: not a number.`, true) : '';
        $('#sRegCard', view).hidden = !st.two;
        if (n < 1 || !xs.length) { out.innerHTML = badMsg + '<div class="empty">Type some numbers in the table (or tap Example).</div>'; $('#sReg', view).innerHTML = ''; chart(null); return; }
        const sum = (arr) => arr.reduce((a, v, i) => a + v * fs[i], 0);
        const Sx = sum(xs), Sx2 = sum(xs.map((v) => v * v)), mx = Sx / n;
        const ssx = xs.reduce((a, v, i) => a + fs[i] * (v - mx) ** 2, 0);
        const popVar = ssx / n, sampVar = n > 1 ? ssx / (n - 1) : NaN;
        const f = (v) => (isFinite(v) ? I.fmtNum(I.clean(v)).html : '—');
        if (!st.two) {
          const intF = fs.every((v) => Number.isInteger(v)) && n <= 1e5;
          let q = {};
          if (intF) {
            const all = []; xs.forEach((v, i) => { for (let k = 0; k < fs[i]; k++) all.push(v); }); all.sort((a, b) => a - b);
            const half = Math.floor(all.length / 2);
            const lower = all.slice(0, half), upper = all.slice(all.length % 2 ? half + 1 : half);
            q = { min: all[0], max: all[all.length - 1], med: median(all), q1: all.length > 1 ? median(lower) : all[0], q3: all.length > 1 ? median(upper) : all[0] };
            const cnt = new Map(); all.forEach((v) => cnt.set(v, (cnt.get(v) || 0) + 1));
            const top = Math.max(...cnt.values());
            const modes = [...cnt].filter(([, c]) => c === top).map(([v]) => v);
            q.mode = top === 1 && cnt.size > 1 ? 'none (all appear once)' : modes.length > 6 ? `${modes.length} values tie` : modes.map(f).join(', ');
          }
          out.innerHTML = badMsg + kv([
            ['n (count)', f(n)], ['Mean x̄', f(mx)], ['Σx', f(Sx)], ['Σx²', f(Sx2)],
            ['σx (population SD)', f(Math.sqrt(popVar))], ['sx (sample SD)', f(Math.sqrt(sampVar))], ['σ² (population variance)', f(popVar)], ['s² (sample variance)', f(sampVar)],
            ['Minimum', f(q.min)], ['Q1', f(q.q1)], ['Median', f(q.med)], ['Q3', f(q.q3)], ['Maximum', f(q.max)],
            ['Range', f(q.max - q.min)], ['IQR (Q3 − Q1)', f(q.q3 - q.q1)], ['Mode', q.mode || '—'],
            ['Coefficient of variation', isFinite(mx) && mx !== 0 ? f(Math.sqrt(popVar) / Math.abs(mx) * 100) + ' %' : '—'], ['Standard error', f(Math.sqrt(sampVar / n))]
          ]) + `<p class="hint">Q1 and Q3 are the medians of the lower and upper halves (as on Casio and TI calculators).${intF ? '' : ' Quartiles need whole-number frequencies.'}</p>`;
          chart({ kind: 'hist', xs, fs });
          return;
        }
        const Sy = sum(ys), Sy2 = sum(ys.map((v) => v * v)), Sxy = xs.reduce((a, v, i) => a + fs[i] * v * ys[i], 0), my = Sy / n;
        const ssy = ys.reduce((a, v, i) => a + fs[i] * (v - my) ** 2, 0), sxy = xs.reduce((a, v, i) => a + fs[i] * (v - mx) * (ys[i] - my), 0);
        out.innerHTML = badMsg + kv([
          ['n', f(n)], ['x̄', f(mx)], ['ȳ', f(my)], ['Σx', f(Sx)], ['Σy', f(Sy)], ['Σx²', f(Sx2)], ['Σy²', f(Sy2)], ['Σxy', f(Sxy)],
          ['σx', f(Math.sqrt(ssx / n))], ['sx', f(Math.sqrt(ssx / (n - 1)))], ['σy', f(Math.sqrt(ssy / n))], ['sy', f(Math.sqrt(ssy / (n - 1)))],
          ['Covariance (sample)', f(sxy / (n - 1))], ['Correlation r', f(sxy / Math.sqrt(ssx * ssy))]
        ]);
        regress(xs, ys, fs, n);
      }
      function linFit(X, Y, W) {
        const n = W.reduce((a, b) => a + b, 0), mx = X.reduce((a, v, i) => a + W[i] * v, 0) / n, my = Y.reduce((a, v, i) => a + W[i] * v, 0) / n;
        let sxx = 0, syy = 0, sxy = 0; X.forEach((v, i) => { sxx += W[i] * (v - mx) ** 2; syy += W[i] * (Y[i] - my) ** 2; sxy += W[i] * (v - mx) * (Y[i] - my); });
        if (sxx === 0) return null;
        const b = sxy / sxx; return { a: my - b * mx, b, r: syy === 0 ? 1 : sxy / Math.sqrt(sxx * syy) };
      }
      function regress(xs, ys, fs, n) {
        const models = [];
        const add = (key, name, fit, fn, eq, inv) => { if (fit) models.push({ key, name, fit, fn, eq: eq.replace(/\+ −/g, '− ').replace(/\^\(−/g, '^(−'), inv }); };
        const L = linFit(xs, ys, fs);
        if (L) add('lin', 'Linear', L, (x) => L.a + L.b * x, `y = ${h(L.a)} + ${h(L.b)}x`, (y) => [(y - L.a) / L.b]);
        if (xs.length >= 3) {
          const S = (p, q) => xs.reduce((a, v, i) => a + fs[i] * v ** p * ys[i] ** q, 0);
          try {
            const A = [[n, S(1, 0), S(2, 0)], [S(1, 0), S(2, 0), S(3, 0)], [S(2, 0), S(3, 0), S(4, 0)]];
            if (Math.abs(M.det(A)) > 1e-12) {
              const [a, b, c] = M.lusolve(A, [S(0, 1), S(1, 1), S(2, 1)]).map((r) => r[0]);
              const fn = (x) => a + b * x + c * x * x;
              const my = S(0, 1) / n, sst = ys.reduce((s, y, i) => s + fs[i] * (y - my) ** 2, 0), sse = ys.reduce((s, y, i) => s + fs[i] * (y - fn(xs[i])) ** 2, 0);
              add('quad', 'Quadratic', { a, b, c, r2: sst ? 1 - sse / sst : 1 }, fn, `y = ${h(a)} + ${h(b)}x + ${h(c)}x²`, (y) => I.num.polyRoots([c, b, a - y]).filter((z) => z.im === 0).map((z) => z.re));
            }
          } catch (e) { /* singular */ }
        }
        if (xs.every((x) => x > 0)) { const F = linFit(xs.map(Math.log), ys, fs); if (F) add('log', 'Logarithmic', F, (x) => F.a + F.b * Math.log(x), `y = ${h(F.a)} + ${h(F.b)} ln x`, (y) => [Math.exp((y - F.a) / F.b)]); }
        if (ys.every((y) => y > 0)) {
          const F = linFit(xs, ys.map(Math.log), fs);
          if (F) {
            const A = Math.exp(F.a);
            add('exp', 'Exponential (a·eᵇˣ)', F, (x) => A * Math.exp(F.b * x), `y = ${h(A)} · e^(${h(F.b)}x)`, (y) => [Math.log(y / A) / F.b]);
            add('abx', 'Exponential (a·bˣ)', F, (x) => A * Math.exp(F.b * x), `y = ${h(A)} · ${h(Math.exp(F.b))}ˣ`, (y) => [Math.log(y / A) / F.b]);
          }
        }
        if (xs.every((x) => x > 0) && ys.every((y) => y > 0)) { const F = linFit(xs.map(Math.log), ys.map(Math.log), fs); if (F) { const A = Math.exp(F.a); add('pow', 'Power (a·xᵇ)', F, (x) => A * Math.pow(x, F.b), `y = ${h(A)} · x^${h(F.b)}`, (y) => [Math.pow(y / A, 1 / F.b)]); } }
        if (xs.every((x) => x !== 0)) { const F = linFit(xs.map((x) => 1 / x), ys, fs); if (F) add('inv', 'Inverse (a + b/x)', F, (x) => F.a + F.b / x, `y = ${h(F.a)} + ${h(F.b)}/x`, (y) => [F.b / (y - F.a)]); }
        const r2 = (m) => (m.fit.r2 != null ? m.fit.r2 : m.fit.r * m.fit.r);
        if (!models.length) { $('#sReg', view).innerHTML = '<div class="empty">Need at least two different x values.</div>'; chart({ kind: 'scatter', xs, ys }); return; }
        const best = models.reduce((p, q) => (r2(q) > r2(p) ? q : p));
        let cur = models.find((m) => m.key === st.model) || models[0];
        const paint = () => {
          $('#sReg', view).innerHTML = `<div class="list">${models.map((m) => `<button type="button" class="list-item" data-model="${m.key}" style="text-align:left;background:${m === cur ? 'var(--surface2)' : 'transparent'};border:0;border-bottom:1px solid var(--line);width:100%"><div class="t">${m === cur ? '● ' : ''}${m.name}${m === best ? ' <span class="muted">(best fit)</span>' : ''}</div><div class="s">${m.eq}${m.fit.r != null && m.key !== 'quad' ? ` · r = ${h(m.fit.r)}` : ''} · r² = ${h(r2(m))}</div></button>`).join('')}</div>
            <div class="grid2" style="margin-top:10px"><label class="field"><span>Estimate ŷ for x =</span><input class="inp mono" id="eX" autocomplete="off"></label><label class="field"><span>Estimate x̂ for y =</span><input class="inp mono" id="eY" autocomplete="off"></label></div>
            <div class="out-big" id="eOut" style="margin-top:8px"></div>`;
          const est = () => {
            const ex = $('#eX', view).value, ey = $('#eY', view).value; const parts = [];
            try { if (ex.trim()) parts.push(`ŷ = ${h(cur.fn(numIn(ex)))}`); if (ey.trim()) { const r = cur.inv(numIn(ey)).filter(isFinite); parts.push(r.length ? `x̂ = ${r.map(h).join(' or ')}` : 'x̂: no real value'); } } catch (e) { parts.push(esc(e.message)); }
            $('#eOut', view).innerHTML = parts.join('<br>');
          };
          $('#eX', view).addEventListener('input', est); $('#eY', view).addEventListener('input', est);
          chart({ kind: 'scatter', xs, ys, fn: cur.fn });
        };
        $('#sReg', view).onclick = (e) => { const b = e.target.closest('[data-model]'); if (!b) return; cur = models.find((m) => m.key === b.dataset.model); st.model = cur.key; save(); paint(); };
        paint();
      }
      const h = (v) => I.fmtNum(I.clean(v)).text.replace(/^-/, '−');
      function chart(d) {
        const c = $('#sChart', view), r = c.getBoundingClientRect();
        if (!r.width) return;
        const dpr = devicePixelRatio; c.width = r.width * dpr; c.height = r.height * dpr;
        const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const w = r.width, hh = r.height, P = 34;
        g.fillStyle = css('--surface'); g.fillRect(0, 0, w, hh);
        $('#sChartT', view).textContent = !d ? 'Chart' : d.kind === 'hist' ? 'Histogram' : 'Scatter plot' + (d.fn ? ' with the chosen fit' : '');
        if (!d || !d.xs.length) return;
        g.strokeStyle = css('--muted'); g.fillStyle = css('--muted'); g.font = '12px Roboto, sans-serif'; g.lineWidth = 1;
        if (d.kind === 'hist') {
          const all = d.xs, mn = Math.min(...all), mx = Math.max(...all);
          const total = d.fs.reduce((a, b) => a + b, 0);
          const k = Math.max(1, Math.min(20, Math.ceil(Math.log2(total) + 1)));
          const bw = (mx - mn) / k || 1, bins = new Array(k).fill(0);
          all.forEach((v, i) => { let b = Math.floor((v - mn) / bw); if (b >= k) b = k - 1; bins[b] += d.fs[i]; });
          const top = Math.max(...bins);
          const bwPx = (w - 2 * P) / k;
          g.fillStyle = PALETTE[4];
          bins.forEach((v, i) => { const bh = (hh - 2 * P) * v / top; g.globalAlpha = 0.8; g.fillRect(P + i * bwPx + 1, hh - P - bh, bwPx - 2, bh); });
          g.globalAlpha = 1; g.fillStyle = css('--muted'); g.textAlign = 'center';
          g.fillText(tick(mn, bw), P, hh - P + 14); g.fillText(tick(mx, bw), w - P, hh - P + 14);
          g.textAlign = 'right'; g.fillText(String(top), P - 4, P);
          g.beginPath(); g.moveTo(P, hh - P); g.lineTo(w - P, hh - P); g.moveTo(P, P); g.lineTo(P, hh - P); g.stroke();
          return;
        }
        let x0 = Math.min(...d.xs), x1 = Math.max(...d.xs), y0 = Math.min(...d.ys), y1 = Math.max(...d.ys);
        const px = (x1 - x0) * 0.08 || 1, py = (y1 - y0) * 0.1 || 1; x0 -= px; x1 += px; y0 -= py; y1 += py;
        const X = (x) => P + (x - x0) / (x1 - x0) * (w - 2 * P), Y = (y) => hh - P - (y - y0) / (y1 - y0) * (hh - 2 * P);
        g.beginPath(); g.moveTo(P, hh - P); g.lineTo(w - P, hh - P); g.moveTo(P, P); g.lineTo(P, hh - P); g.stroke();
        g.textAlign = 'center'; g.fillText(tick(x0 + px, (x1 - x0) / 10), X(x0 + px), hh - P + 14); g.fillText(tick(x1 - px, (x1 - x0) / 10), X(x1 - px), hh - P + 14);
        g.textAlign = 'right'; g.fillText(tick(y1 - py, (y1 - y0) / 10), P - 4, Y(y1 - py)); g.fillText(tick(y0 + py, (y1 - y0) / 10), P - 4, Y(y0 + py));
        if (d.fn) { g.strokeStyle = PALETTE[0]; g.lineWidth = 2; g.beginPath(); let pen = false; for (let i = 0; i <= 200; i++) { const x = x0 + (x1 - x0) * i / 200, y = d.fn(x); if (!isFinite(y) || y < y0 - 10 * (y1 - y0) || y > y1 + 10 * (y1 - y0)) { pen = false; continue; } if (!pen) { g.moveTo(X(x), Y(y)); pen = true; } else g.lineTo(X(x), Y(y)); } g.stroke(); }
        g.fillStyle = PALETTE[1]; d.xs.forEach((x, i) => { g.beginPath(); g.arc(X(x), Y(d.ys[i]), 4, 0, 7); g.fill(); });
      }
      let t = 0;
      const later = () => { clearTimeout(t); t = setTimeout(compute, 200); };
      tbl.addEventListener('input', (e) => { const i = e.target.dataset.r; if (i == null) return; st.rows[+i][e.target.dataset.c] = e.target.value; save(); later(); });
      tbl.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || !e.target.dataset.r) return;
        e.preventDefault();
        const ins = $$('input', tbl), k = ins.indexOf(e.target);
        if (k === ins.length - 1) { st.rows.push({ x: '', y: '', f: '' }); save(); paintTable(); $$('input', tbl)[k + 1].focus(); } else ins[k + 1].focus();
      });
      tbl.addEventListener('click', (e) => { const b = e.target.closest('[data-delrow]'); if (!b) return; st.rows.splice(+b.dataset.delrow, 1); if (!st.rows.length) st.rows.push({ x: '', y: '', f: '' }); save(); paintTable(); compute(); });
      $$('[data-two]', view).forEach((b) => b.addEventListener('click', () => { st.two = b.dataset.two === '1'; $$('[data-two]', view).forEach((x) => x.classList.toggle('on', x === b)); save(); paintTable(); compute(); }));
      $('#sFreq', view).addEventListener('change', (e) => { st.freq = e.target.checked; save(); paintTable(); compute(); });
      $('#sAdd', view).addEventListener('click', () => { st.rows.push({ x: '', y: '', f: '' }); save(); paintTable(); const ins = $$(`input[data-r="${st.rows.length - 1}"]`, tbl); if (ins[0]) ins[0].focus(); });
      $('#sEx', view).addEventListener('click', () => {
        st.rows = st.two ? [[1, 2.1], [2, 3.9], [3, 6.2], [4, 7.8], [5, 10.1], [6, 12.2]].map(([x, y]) => ({ x: String(x), y: String(y), f: '' })) : [12, 15, 11, 18, 15, 20, 14, 15, 17, 13].map((x) => ({ x: String(x), y: '', f: '' }));
        st.freq = false; $('#sFreq', view).checked = false; save(); paintTable(); compute();
      });
      $('#sClr', view).addEventListener('click', async () => { if (!(await I.confirmBox('Clear the data?', 'Every row in the table will be emptied.', 'Clear', true))) return; st.rows = Array.from({ length: 5 }, () => ({ x: '', y: '', f: '' })); save(); paintTable(); compute(); });
      $('#sPaste', view).addEventListener('click', () => {
        const el = I.openLayer(`<div class="sheet">${I.sheetHead('Paste a list')}<div class="sheet-b"><p class="hint" style="margin-top:0">${st.two ? 'One pair per line: x and y separated by a space, comma or tab (you can paste two columns from Excel).' : 'Numbers separated by spaces, commas or new lines (you can paste a column from Excel).'}</p><textarea class="inp" id="pasteBox" rows="8" autofocus></textarea><label class="row" style="margin-top:8px;gap:6px"><input type="checkbox" id="pasteAdd"> Add to the existing rows</label></div><div class="sheet-f"><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn" id="pasteOk">Use these numbers</button></div></div>`);
        el.querySelector('#pasteOk').addEventListener('click', () => {
          const txt = el.querySelector('#pasteBox').value.trim();
          let rows;
          if (st.two) rows = txt.split(/\r?\n/).map((l) => l.trim().split(/[\s,;\t]+/)).filter((p) => p.length >= 2 && p[0]).map((p) => ({ x: p[0], y: p[1], f: p[2] || '' }));
          else rows = txt.split(/[\s,;\t]+/).filter(Boolean).map((x) => ({ x, y: '', f: '' }));
          if (!rows.length) { I.toast('No numbers found.'); return; }
          if (rows.length > 5000) rows = rows.slice(0, 5000);
          st.rows = el.querySelector('#pasteAdd').checked ? st.rows.filter((r) => (r.x || '').trim()).concat(rows) : rows;
          save(); I.closeTop().then(() => { paintTable(); compute(); I.toast(`${rows.length} ${st.two ? 'pairs' : 'values'} added.`); });
        });
      });
      paintTable(); compute();
      this.show = () => requestAnimationFrame(compute);
      I.registerData('stat', () => load('stat', {}), (v) => store('stat', v));
    }
  });

  // =====================================================================
  // MATRIX and VECTOR (one editor component)
  // =====================================================================
  function linalgTab(kind) {
    const isVec = kind === 'vector';
    const NAMES = isVec ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
    return {
      init(view) {
        const st = Object.assign(isVec ? { dim: 3, cur: 'A', data: {}, expr: 'dot(A, B)' } : { cur: 'A', size: { A: [2, 2], B: [2, 2], C: [2, 2], D: [2, 2] }, data: {}, expr: 'inv(A)', frac: true }, load(kind, {}));
        const OPS = isVec
          ? [['A + B', 'A + B'], ['A − B', 'A - B'], ['A · B (dot)', 'dot(A, B)'], ['A × B (cross)', 'cross(A, B)'], ['|A|', 'norm(A)'], ['|B|', 'norm(B)'], ['Angle A, B', 'angle(A, B)'], ['Unit A', 'unitv(A)'], ['Project A on B', 'proj(A, B)'], ['Area |A × B|', 'norm(cross(A, B))'], ['Triangle ½|A × B|', 'norm(cross(A, B)) / 2'], ['A · (B × C)', 'dot(A, cross(B, C))'], ['3A', '3 * A']]
          : [['A + B', 'A + B'], ['A − B', 'A - B'], ['A × B', 'A * B'], ['B × A', 'B * A'], ['A⁻¹', 'inv(A)'], ['Aᵀ', 'transpose(A)'], ['det A', 'det(A)'], ['A²', 'A^2'], ['Rank A', 'rank(A)'], ['RREF A', 'rref(A)'], ['Trace A', 'trace(A)'], ['Eigenvalues A', 'eigs(A).values'], ['Solve A·X = B', 'inv(A) * B'], ['2A', '2 * A']];
        view.innerHTML = `<div class="col col-in"><div class="card">${head(isVec ? 'Vectors' : 'Matrices', kind)}
          <div class="row" style="margin-bottom:8px"><span class="lbl">Edit</span><div class="seg" id="laPick">${NAMES.map((n) => `<button type="button" data-m="${n}" class="${st.cur === n ? 'on' : ''}">${isVec ? 'Vct' : 'Mat'} ${n}</button>`).join('')}</div></div>
          <div class="row" id="laSize" style="margin-bottom:8px"></div>
          <div class="mat-wrap"><div class="cgrid" id="laGrid"></div></div>
          <div class="row" style="margin-top:8px"><button type="button" class="btn ghost" id="laZero">Clear ${isVec ? 'vector' : 'matrix'}</button>${isVec ? '' : '<button type="button" class="btn ghost" id="laId">Identity</button>'}</div>
          <div class="hint" id="laSummary"></div>
        </div></div>
        <div class="col col-out"><div class="card"><h2>Calculate</h2>
          <div class="row" style="gap:6px;margin-bottom:8px">${OPS.map(([l, e]) => `<button type="button" class="pill" data-op="${esc(e)}">${l}</button>`).join('')}</div>
          <label class="field"><span>Or type an expression using ${NAMES.join(', ')}</span><input class="inp mono" id="laExpr" value="${esc(st.expr)}" autocomplete="off"></label>
          <div class="row" style="margin-top:8px"><button type="button" class="btn" id="laGo">Calculate</button>${isVec ? '' : `<label class="row" style="gap:6px;min-height:44px"><input type="checkbox" id="laFrac" ${st.frac ? 'checked' : ''} style="width:20px;height:20px"> Show fractions</label>`}</div>
          <div id="laOut" style="margin-top:10px"><div class="empty">The answer appears here.</div></div></div></div>`;
        const grid = $('#laGrid', view);
        const save = () => store(kind, st);
        const dims = (n) => (isVec ? [1, st.dim] : st.size[n]);
        function cell(n, i, j) { return ((st.data[n] || {})[`${i}_${j}`]) || ''; }
        function paintGrid() {
          const [r, c] = dims(st.cur);
          $('#laSize', view).innerHTML = isVec
            ? `<span class="lbl">Dimension</span>${[2, 3].map((d) => `<button type="button" class="pill ${st.dim === d ? 'on' : ''}" data-dim="${d}">${d}D</button>`).join('')}`
            : `<label class="field" style="flex-direction:row;align-items:center;gap:6px"><span>Rows</span><select class="inp" data-sz="0" style="width:auto">${[1, 2, 3, 4, 5, 6].map((k) => `<option ${k === r ? 'selected' : ''}>${k}</option>`).join('')}</select></label><label class="field" style="flex-direction:row;align-items:center;gap:6px"><span>Columns</span><select class="inp" data-sz="1" style="width:auto">${[1, 2, 3, 4, 5, 6].map((k) => `<option ${k === c ? 'selected' : ''}>${k}</option>`).join('')}</select></label>`;
          grid.style.gridTemplateColumns = `repeat(${c}, minmax(${c > 4 ? 48 : 56}px, 1fr))`;
          let hh = '';
          for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) hh += `<input data-ij="${i}_${j}" value="${esc(cell(st.cur, i, j))}" placeholder="0" autocomplete="off" aria-label="${st.cur} row ${i + 1} column ${j + 1}">`;
          grid.innerHTML = hh;
          $('#laSummary', view).textContent = NAMES.map((n) => { const [a, b] = dims(n); return `${n}: ${isVec ? b + 'D' : a + '×' + b}`; }).join(' · ');
        }
        function valueOf(n) {
          const [r, c] = dims(n), rows = [];
          for (let i = 0; i < r; i++) { const row = []; for (let j = 0; j < c; j++) { const s = cell(n, i, j).trim(); let v = 0; if (s) { const res = I.evaluateExpr(s, { dry: true }); v = res.value; } row.push(v); } rows.push(row); }
          return isVec ? M.matrix(rows[0]) : M.matrix(rows);
        }
        function show(v) {
          const t = M.typeOf(v), out = $('#laOut', view);
          const cellHtml = (x) => { if (typeof x === 'number') { const c = I.clean(x); if (!isVec && st.frac) { const ex = I.exactOf(c); if (ex && ex.kind === 'frac') return ex.html; } return I.fmtNum(c).html; } return I.fmtValue(x).html; };
          let hh;
          if (t === 'DenseMatrix' || t === 'Array') {
            const a = t === 'DenseMatrix' ? v.toArray() : v;
            hh = `<div class="mat-wrap">${(() => { const rows = Array.isArray(a[0]) ? a : (isVec ? [a] : a.map((x) => [x])); return `<span class="res-mat" style="grid-template-columns:repeat(${rows[0].length},auto)">${rows.map((rr) => rr.map((x) => `<span>${cellHtml(I.cleanDeep(x))}</span>`).join('')).join('')}</span>`; })()}</div>`;
            const okStore = isVec ? (Array.isArray(a[0]) ? false : a.length >= 2 && a.length <= 3) : true;
            if (okStore) hh += `<div class="row" style="margin-top:8px"><span class="lbl">Store in</span>${NAMES.map((n) => `<button type="button" class="pill" data-store="${n}">${n}</button>`).join('')}</div>`;
            last = a;
          } else if (typeof v === 'number') {
            const c = I.clean(v);
            const ex = I.exactOf(c);
            hh = `<div class="out-big">${ex ? ex.html + ' <span class="muted">≈ ' + I.fmtNum(c).html + '</span>' : I.fmtNum(c).html}${/angle\(/.test(st.expr) ? ' ' + ({ deg: '°', rad: 'rad', grad: 'grad' })[I.angle] : ''}</div>`;
            last = null;
          } else { hh = `<div class="out-big">${I.fmtValue(v).html}</div>`; last = null; }
          out.innerHTML = hh;
        }
        let last = null;
        function run() {
          const out = $('#laOut', view);
          try {
            const sc = new Map(); for (const [k, v] of I.scope) sc.set(k, v);
            NAMES.forEach((n) => sc.set(n, valueOf(n)));
            const code = I.normalise(st.expr);
            let v;
            try { v = M.evaluate(code, sc); } catch (e) { throw new I.CalcError(I.friendlyError(e, code)); }
            if (M.typeOf(v) === 'Object' && v.values) v = v.values;
            show(I.cleanDeep(v));
          } catch (e) { out.innerHTML = msg(esc(e.message), true); }
        }
        $('#laPick', view).addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; st.cur = b.dataset.m; $$('#laPick [data-m]', view).forEach((x) => x.classList.toggle('on', x === b)); save(); paintGrid(); });
        $('#laSize', view).addEventListener('change', (e) => { const s = e.target.dataset.sz; if (s == null) return; st.size[st.cur][+s] = +e.target.value; save(); paintGrid(); });
        $('#laSize', view).addEventListener('click', (e) => { const b = e.target.closest('[data-dim]'); if (!b) return; st.dim = +b.dataset.dim; save(); paintGrid(); });
        grid.addEventListener('input', (e) => { const k = e.target.dataset.ij; if (!k) return; (st.data[st.cur] = st.data[st.cur] || {})[k] = e.target.value; save(); });
        grid.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const ins = $$('input', grid), k = ins.indexOf(e.target); if (k < ins.length - 1) ins[k + 1].focus(); else run(); } });
        $('#laZero', view).addEventListener('click', () => { st.data[st.cur] = {}; save(); paintGrid(); });
        if (!isVec) $('#laId', view).addEventListener('click', () => { const [r, c] = st.size[st.cur]; if (r !== c) { st.size[st.cur] = [r, r]; } const d = {}; const n = st.size[st.cur][0]; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) d[`${i}_${j}`] = i === j ? '1' : '0'; st.data[st.cur] = d; save(); paintGrid(); });
        view.addEventListener('click', (e) => {
          const op = e.target.closest('[data-op]'); if (op) { st.expr = op.dataset.op; $('#laExpr', view).value = st.expr; save(); run(); if (matchMedia('(max-width: 999px)').matches) $('#laOut', view).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
          const sb = e.target.closest('[data-store]');
          if (sb && last) {
            const n = sb.dataset.store, d = {};
            if (isVec) { st.dim = last.length; last.forEach((x, j) => { d[`0_${j}`] = I.fmtValue(I.cleanDeep(x)).text; }); }
            else { const rows = Array.isArray(last[0]) ? last : last.map((x) => [x]); st.size[n] = [rows.length, rows[0].length]; rows.forEach((r, i) => r.forEach((x, j) => { d[`${i}_${j}`] = I.fmtValue(I.cleanDeep(x)).text; })); }
            st.data[n] = d; st.cur = n; save(); $$('#laPick [data-m]', view).forEach((x) => x.classList.toggle('on', x.dataset.m === n)); paintGrid(); I.toast(`Stored in ${n}.`);
          }
        });
        $('#laExpr', view).addEventListener('input', (e) => { st.expr = e.target.value; save(); });
        $('#laExpr', view).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } });
        $('#laGo', view).addEventListener('click', run);
        if (!isVec) $('#laFrac', view).addEventListener('change', (e) => { st.frac = e.target.checked; save(); run(); });
        if (!Object.keys(st.data).length) {
          st.data = isVec ? { A: { '0_0': '1', '0_1': '2', '0_2': '3' }, B: { '0_0': '4', '0_1': '5', '0_2': '6' } } : { A: { '0_0': '2', '0_1': '1', '1_0': '5', '1_1': '3' }, B: { '0_0': '1', '0_1': '0', '1_0': '4', '1_1': '2' } };
          save();
        }
        paintGrid();
        I.registerData(kind, () => load(kind, {}), (v) => store(kind, v));
      }
    };
  }
  I.registerTab('matrix', linalgTab('matrix'));
  I.registerTab('vector', linalgTab('vector'));

  // =====================================================================
  // CALCULUS
  // =====================================================================
  I.registerTab('calculus', {
    init(view) {
      const st = Object.assign({ mode: 'deriv', d: { f: 'x^3 sin(x)', at: '1', n: 1 }, i: { f: 'x^2', a: '0', b: '3' }, s: { f: 'k^2', a: '1', b: '10', prod: false }, l: { f: 'sin(x)/x', a: '0', side: 'both' } }, load('calculus', {}));
      view.innerHTML = `<div class="col col-in"><div class="card">${head('Calculus', 'calculus')}
        ${subtabs('cMode', [['deriv', 'Derivative d/dx'], ['integ', 'Integral ∫'], ['sum', 'Sum Σ / Product Π'], ['lim', 'Limit']], st.mode)}
        <div id="cIn"></div><div class="row" style="margin-top:12px"><button type="button" class="btn" id="cGo">Work it out</button></div>
        <p class="hint">Calculus uses radians. Type x as the variable (k for sums).</p></div></div>
        <div class="col col-out"><div class="card"><h2>Answer</h2><div class="natural" id="cTex" style="font-size:20px;margin-bottom:6px"></div><div id="cOut"><div class="empty">The answer appears here.</div></div></div></div>`;
      const inEl = $('#cIn', view), out = $('#cOut', view), texEl = $('#cTex', view);
      const save = () => store('calculus', st);
      const fld = (grp, k, label, ph) => `<label class="field"><span>${label}</span><input class="inp mono" data-g="${grp}" data-k2="${k}" value="${esc(st[grp][k])}" placeholder="${ph || ''}" autocomplete="off"></label>`;
      function paint() {
        if (st.mode === 'deriv') inEl.innerHTML = fld('d', 'f', 'f(x) =', 'x^3 sin(x)') + `<div class="grid2" style="margin-top:8px">${fld('d', 'at', 'Value at x =', 'optional')}<label class="field"><span>Order</span><select class="inp" data-g="d" data-k2="n">${[1, 2, 3].map((k) => `<option value="${k}" ${+st.d.n === k ? 'selected' : ''}>${['', 'First', 'Second', 'Third'][k]} derivative</option>`).join('')}</select></label></div>`;
        else if (st.mode === 'integ') inEl.innerHTML = fld('i', 'f', 'f(x) =', 'x^2') + `<div class="grid2" style="margin-top:8px">${fld('i', 'a', 'From (lower limit)', '0, −inf')}${fld('i', 'b', 'To (upper limit)', '3, inf')}</div>`;
        else if (st.mode === 'sum') inEl.innerHTML = fld('s', 'f', 'Term in k', 'k^2') + `<div class="grid2" style="margin-top:8px">${fld('s', 'a', 'k from', '1')}${fld('s', 'b', 'k to', '10')}</div><div class="row" style="margin-top:8px"><button type="button" class="pill ${!st.s.prod ? 'on' : ''}" data-prod="0">Σ Sum</button><button type="button" class="pill ${st.s.prod ? 'on' : ''}" data-prod="1">Π Product</button></div>`;
        else inEl.innerHTML = fld('l', 'f', 'f(x) =', 'sin(x)/x') + `<div class="grid2" style="margin-top:8px">${fld('l', 'a', 'x approaches', '0, inf')}<label class="field"><span>From</span><select class="inp" data-g="l" data-k2="side">${[['both', 'Both sides'], ['left', 'The left (x → a⁻)'], ['right', 'The right (x → a⁺)']].map(([k, l]) => `<option value="${k}" ${st.l.side === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
      }
      bindSubtabs($('#cMode', view), (k) => { st.mode = k; save(); paint(); out.innerHTML = '<div class="empty">Tap Work it out.</div>'; texEl.textContent = ''; });
      inEl.addEventListener('input', (e) => { const g = e.target.dataset.g; if (g) { st[g][e.target.dataset.k2] = e.target.value; save(); } });
      inEl.addEventListener('change', (e) => { const g = e.target.dataset.g; if (g) { st[g][e.target.dataset.k2] = e.target.value; save(); } });
      inEl.addEventListener('click', (e) => { const b = e.target.closest('[data-prod]'); if (b) { st.s.prod = b.dataset.prod === '1'; save(); paint(); } });
      inEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      $('#cGo', view).addEventListener('click', go);
      const fx = (v) => { const c = I.clean(v); const ex = I.exactOf(c); return ex ? `${ex.html} <span class="muted">≈ ${I.fmtNum(c).html}</span>` : I.fmtNum(c).html; };
      function go() {
        I.setAngleForTool('rad');
        try {
          texEl.textContent = '';
          if (st.mode === 'deriv') {
            const { f, node } = compileFx(st.d.f);
            const n = +st.d.n || 1;
            let sym = null;
            try { let d = node; for (let k = 0; k < n; k++) d = M.derivative(d, 'x'); sym = M.simplify(d); } catch (e) { sym = null; }
            const lab = ["f'(x)", "f''(x)", "f'''(x)"][n - 1];
            let h = '';
            if (sym) { h += `<div class="lbl">${lab} =</div><div class="out-big">${esc(sym.toString({ implicit: 'hide' }).replace(/ \* /g, '·').replace(/ \^ 2/g, '²').replace(/ \^ 3/g, '³').replace(/ \^ /g, '^'))}</div>`; tex(texEl, `\\frac{d${n > 1 ? '^' + n : ''}}{dx${n > 1 ? '^' + n : ''}}\\left(${I.texOf(compileFx(st.d.f).code)}\\right) = ${sym.toTex({ implicit: 'hide' })}`, ''); }
            else h += msg('No formula for this one, so only the value is worked out (numerically).');
            if (String(st.d.at).trim()) {
              const a = numIn(st.d.at);
              let v = NaN;
              if (sym) { try { const sc = new Map(); for (const [k, vv] of I.scope) sc.set(k, vv); sc.set('x', a); v = sym.evaluate(sc); if (typeof v !== 'number') v = NaN; } catch (e) { v = NaN; } }
              if (!isFinite(v)) v = I.num.derivN(f, a, n);
              h += `<div class="kv" style="margin-top:10px"><div><b>${lab.replace('(x)', `(${I.fmtNum(a).text})`)}</b><span>${fx(v)}</span></div><div><b>f(${I.fmtNum(a).text})</b><span>${fx(f(a))}</span></div>${n === 1 ? `<div><b>Tangent line at x = ${I.fmtNum(a).text}</b><span>y = ${I.fmtNum(I.clean(v)).html}(x − ${I.fmtNum(a).html}) + ${I.fmtNum(I.clean(f(a))).html}</span></div>` : ''}</div>`;
            }
            out.innerHTML = h;
          } else if (st.mode === 'integ') {
            const { f, code } = compileFx(st.i.f);
            const a = numIn(st.i.a), b = numIn(st.i.b);
            const r = I.num.integrate(f, a, b);
            tex(texEl, `\\int_{${isFinite(a) ? I.fmtNum(a).text : (a < 0 ? '-\\infty' : '\\infty')}}^{${isFinite(b) ? I.fmtNum(b).text : (b < 0 ? '-\\infty' : '\\infty')}} ${I.texOf(code)}\\,dx`, '');
            out.innerHTML = `<div class="out-big">= ${fx(r.value)}</div><p class="hint">Worked out numerically (adaptive Gauss–Kronrod). Estimated error ±${I.fmtNum(Math.max(r.error, 1e-15)).html}.</p>`;
          } else if (st.mode === 'sum') {
            const { f, code } = compileFx(st.s.f, 'k');
            const a = numIn(st.s.a), b = numIn(st.s.b);
            if (!Number.isInteger(a) || !Number.isInteger(b)) throw new I.CalcError('k from and k to must be whole numbers.');
            if (b - a > 1e6) throw new I.CalcError('Too many terms (more than 1,000,000).');
            let acc = st.s.prod ? 1 : 0; for (let k = a; k <= b; k++) acc = st.s.prod ? acc * f(k) : acc + f(k);
            tex(texEl, `\\${st.s.prod ? 'prod' : 'sum'}_{k=${a}}^{${b}} ${I.texOf(code)}`, '');
            out.innerHTML = `<div class="out-big">= ${fx(acc)}</div><p class="hint">${b - a + 1} terms.</p>`;
          } else {
            const { f, code } = compileFx(st.l.f);
            const raw = String(st.l.a).trim(); const a = numIn(raw);
            const side = (dir) => { let lastV = NaN; for (let k = 2; k <= 9; k++) { const x = isFinite(a) ? a + dir * Math.pow(10, -k) * Math.max(1, Math.abs(a)) : (a > 0 ? 1 : -1) * Math.pow(10, k); const v = f(x); if (isFinite(v)) lastV = v; else if (Math.abs(v) === Infinity) return v; } return lastV; };
            const inf = (v) => (isFinite(v) && Math.abs(v) > 1e7 ? Math.sign(v) * Infinity : v);
            const L = inf(isFinite(a) ? side(-1) : side(1)), R = inf(side(1));
            tex(texEl, `\\lim_{x \\to ${isFinite(a) ? I.fmtNum(a).text : (a > 0 ? '\\infty' : '-\\infty')}${st.l.side === 'left' ? '^-' : st.l.side === 'right' ? '^+' : ''}} ${I.texOf(code)}`, '');
            const pretty = (v) => (Math.abs(v) === Infinity ? (v > 0 ? '∞' : '−∞') : !isFinite(v) ? 'does not exist' : fx(parseFloat(v.toPrecision(10))));
            let h;
            if (st.l.side === 'left') h = `= ${pretty(L)}`;
            else if (st.l.side === 'right') h = `= ${pretty(R)}`;
            else if (L === R && !isFinite(L)) h = `= ${pretty(L)}`;
            else if (!isFinite(L) || !isFinite(R) || Math.abs(L - R) > 1e-5 * Math.max(1, Math.abs(L))) h = `does not exist <span class="muted">(from the left ${pretty(L)}, from the right ${pretty(R)})</span>`;
            else h = `= ${pretty(isFinite(L) && isFinite(R) ? (L + R) / 2 : isFinite(L) ? L : R)}`;
            out.innerHTML = `<div class="out-big">${h}</div><p class="hint">Estimated numerically by moving x closer and closer to the value.</p>`;
          }
        } catch (e) { out.innerHTML = msg(esc(e.message), true); }
        finally { I.restoreAngle(); }
        if (matchMedia('(max-width: 999px)').matches) out.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      paint();
      I.registerData('calculus', () => load('calculus', {}), (v) => store('calculus', v));
    }
  });

  // =====================================================================
  // BASE-N
  // =====================================================================
  I.registerTab('base', {
    init(view) {
      const st = Object.assign({ bits: 32, signed: true, base: 10, expr: '', val: '0' }, load('base', {}));
      const BASES = [[16, 'HEX'], [10, 'DEC'], [8, 'OCT'], [2, 'BIN']];
      view.innerHTML = `<div class="col col-in"><div class="card">${head('Base-N (programmer)', 'base')}
        <div class="row" style="margin-bottom:8px"><label class="field" style="flex-direction:row;align-items:center;gap:6px"><span>Word size</span><select class="inp" id="bBits" style="width:auto">${[8, 16, 32, 64].map((b) => `<option value="${b}" ${st.bits === b ? 'selected' : ''}>${b}-bit</option>`).join('')}</select></label>
        <div class="seg"><button type="button" data-sg="1" class="${st.signed ? 'on' : ''}">Signed</button><button type="button" data-sg="0" class="${st.signed ? '' : 'on'}">Unsigned</button></div></div>
        <div class="row" style="margin-bottom:8px"><span class="lbl">Type in</span><div class="seg" id="bBase">${BASES.map(([b, n]) => `<button type="button" data-b="${b}" class="${st.base === b ? 'on' : ''}">${n}</button>`).join('')}</div></div>
        <input class="inp mono" id="bExpr" value="${esc(st.expr)}" placeholder="e.g. FF AND 0F" autocomplete="off" aria-label="Base-N expression" style="font-size:20px;height:52px">
        <div class="out-big" id="bRes" style="text-align:right;min-height:34px;margin:6px 0"></div>
        <div class="pad base" id="bPad"></div>
      </div></div>
      <div class="col col-out"><div class="card"><h2>Value in every base</h2><div class="basefields" id="bFields">${BASES.map(([b, n]) => `<label data-fb="${b}"><b>${n}</b><input data-in="${b}" autocomplete="off" spellcheck="false" aria-label="${n} value"></label>`).join('')}</div>
        <h3 style="margin-top:12px">Bits <span class="muted" style="font-weight:400;font-size:14px">(tap to flip)</span></h3><div class="bits" id="bBitsGrid"></div></div></div>`;
      const exprEl = $('#bExpr', view), resEl = $('#bRes', view);
      const save = () => store('base', st);
      const mask = () => (1n << BigInt(st.bits)) - 1n;
      const wrap = (v) => { v &= mask(); if (st.signed && v >= (1n << BigInt(st.bits - 1))) v -= (1n << BigInt(st.bits)); return v; };
      let val = (() => { try { return wrap(BigInt(st.val)); } catch (e) { return 0n; } })();
      const toBase = (v, b) => { const u = v & mask(); return b === 10 ? (st.signed ? v.toString(10) : u.toString(10)) : u.toString(b).toUpperCase(); };
      const group = (s, b) => (b === 2 ? s.padStart(Math.ceil(s.length / 4) * 4, '0').replace(/(\d{4})(?=\d)/g, '$1 ') : b === 16 ? s.replace(/\B(?=([0-9A-F]{4})+$)/g, ' ') : s);
      function paint(skip) {
        st.val = val.toString(); save();
        BASES.forEach(([b]) => { const inp = view.querySelector(`[data-in="${b}"]`); if (inp !== skip) inp.value = group(toBase(val, b), b); });
        $$('[data-fb]', view).forEach((l) => l.classList.toggle('active', +l.dataset.fb === st.base));
        const u = val & mask(); let hh = '';
        for (let i = st.bits - 1; i >= 0; i--) { const on = (u >> BigInt(i)) & 1n; hh += `<button type="button" class="bit ${on ? 'on' : ''}" data-bit="${i}" aria-label="Bit ${i}">${on}<small>${i % 4 === 0 ? i : ''}</small></button>`; }
        $('#bBitsGrid', view).innerHTML = hh;
      }
      const OPS = { OR: [1, (a, b) => a | b], NOR: [1, (a, b) => ~(a | b)], XOR: [2, (a, b) => a ^ b], XNOR: [2, (a, b) => ~(a ^ b)], AND: [3, (a, b) => a & b], NAND: [3, (a, b) => ~(a & b)], '<<': [4, (a, b) => a << b], '>>': [4, (a, b) => a >> b], '+': [5, (a, b) => a + b], '-': [5, (a, b) => a - b], '*': [6, (a, b) => a * b], '/': [6, (a, b) => { if (b === 0n) throw new I.CalcError('Math ERROR: division by zero.'); return a / b; }], MOD: [6, (a, b) => { if (b === 0n) throw new I.CalcError('Math ERROR: division by zero.'); return a % b; }] };
      function evalBase(src) {
        const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').toUpperCase();
        const toks = []; let i = 0;
        const digitRe = { 2: /[01]/, 8: /[0-7]/, 10: /[0-9]/, 16: /[0-9A-F]/ }[st.base];
        while (i < s.length) {
          const ch = s[i];
          if (/\s/.test(ch)) { i++; continue; }
          if (s.startsWith('<<', i) || s.startsWith('>>', i)) { toks.push({ op: s.slice(i, i + 2) }); i += 2; continue; }
          const w = s.slice(i).match(/^(XNOR|NAND|NOR|AND|XOR|OR|NOT|MOD)\b/);
          if (w) { toks.push(w[1] === 'NOT' ? { un: 'NOT' } : { op: w[1] }); i += w[1].length; continue; }
          if ('+-*/'.includes(ch)) { const prev = toks[toks.length - 1]; if ((ch === '-' || ch === '+') && (!prev || prev.op || prev.un || prev.p === '(')) toks.push({ un: ch }); else toks.push({ op: ch }); i++; continue; }
          if (ch === '(' || ch === ')') { toks.push({ p: ch }); i++; continue; }
          if (digitRe.test(ch)) { let j = i; while (j < s.length && digitRe.test(s[j])) j++; const lit = s.slice(i, j); toks.push({ n: st.base === 10 ? BigInt(lit) : BigInt((st.base === 16 ? '0x' : st.base === 8 ? '0o' : '0b') + lit) }); i = j; continue; }
          throw new I.CalcError(`Syntax ERROR: “${ch}” is not a ${({ 2: 'binary', 8: 'octal', 10: 'decimal', 16: 'hex' })[st.base]} digit or operator.`);
        }
        let p = 0;
        const peek = () => toks[p];
        function primary() {
          const t = toks[p++];
          if (!t) throw new I.CalcError('Syntax ERROR: the sum ends too early.');
          if (t.n != null) return t.n;
          if (t.un) { const v = primary(); return wrap(t.un === 'NOT' ? ~v : t.un === '-' ? -v : v); }
          if (t.p === '(') { const v = expr(0); const c = toks[p++]; if (!c || c.p !== ')') throw new I.CalcError('Syntax ERROR: a bracket is not closed.'); return v; }
          throw new I.CalcError('Syntax ERROR: an operator is out of place.');
        }
        function expr(minP) {
          let lhs = primary();
          while (peek() && peek().op && OPS[peek().op][0] >= minP) {
            const op = toks[p++].op, [pr, fn] = OPS[op];
            const rhs = expr(pr + 1);
            lhs = wrap(fn(lhs, rhs));
          }
          return lhs;
        }
        const v = expr(0);
        if (p < toks.length) throw new I.CalcError('Syntax ERROR: check the brackets and operators.');
        return wrap(v);
      }
      function calc(final) {
        const src = exprEl.value.trim(); st.expr = exprEl.value; save();
        if (!src) { resEl.textContent = ''; return; }
        try { val = evalBase(src); resEl.innerHTML = group(toBase(val, st.base), st.base); resEl.style.color = ''; paint(); if (final) { exprEl.value = toBase(val, st.base); st.expr = exprEl.value; save(); } }
        catch (e) { if (final) { resEl.textContent = e.message; resEl.style.color = 'var(--bad)'; } }
      }
      function paintPad() {
        const keys = ['D', 'E', 'F', 'AND', 'OR', 'XOR', 'A', 'B', 'C', 'NOT', 'NAND', 'NOR', '7', '8', '9', '<<', '>>', 'MOD', '4', '5', '6', '×', '÷', '(', '1', '2', '3', '+', '−', ')', '0', '±', '⌫', 'AC', '=', ''];
        const ok = (k) => (/^[0-9A-F]$/.test(k) ? parseInt(k, 16) < st.base : true);
        $('#bPad', view).innerHTML = keys.filter(Boolean).map((k) => `<button type="button" class="k ${/^[0-9A-F]$/.test(k) ? '' : k === '=' ? 'eq' : k === 'AC' ? 'ac' : /[×÷+−]/.test(k) ? 'op' : 'fn'}" data-bk="${k}" ${ok(k) ? '' : 'disabled'}>${k}</button>`).join('');
      }
      $('#bPad', view).addEventListener('click', (e) => {
        const b = e.target.closest('[data-bk]'); if (!b || b.disabled) return;
        const k = b.dataset.bk, s = exprEl.value;
        if (k === '=') return calc(true);
        if (k === 'AC') { exprEl.value = ''; val = 0n; resEl.textContent = ''; paint(); st.expr = ''; save(); return; }
        if (k === '⌫') { exprEl.value = s.replace(/\s*(AND|OR|XOR|NOT|NAND|NOR|MOD|<<|>>)\s*$|.$/, ''); return calc(false); }
        if (k === '±') { exprEl.value = '−(' + (s || '0') + ')'; return calc(false); }
        exprEl.value = s + (/^(AND|OR|XOR|NOT|NAND|NOR|MOD|<<|>>)$/.test(k) ? ` ${k} ` : k);
        calc(false);
      });
      exprEl.addEventListener('input', () => calc(false));
      exprEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); calc(true); } });
      $('#bFields', view).addEventListener('input', (e) => {
        const b = +e.target.dataset.in; if (!b) return;
        const s = e.target.value.replace(/[\s,_]/g, '').toUpperCase();
        if (!s) return;
        try {
          const neg = s.startsWith('-');
          const body = neg ? s.slice(1) : s;
          if (!({ 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9A-F]+$/ })[b].test(body)) throw new Error('bad');
          let v = b === 10 ? BigInt(body) : BigInt((b === 16 ? '0x' : b === 8 ? '0o' : '0b') + body);
          if (neg) v = -v;
          val = wrap(v); e.target.classList.remove('bad'); paint(e.target);
        } catch (err) { e.target.classList.add('bad'); }
      });
      $('#bFields', view).addEventListener('focusout', () => paint());
      $('#bBitsGrid', view).addEventListener('click', (e) => { const b = e.target.closest('[data-bit]'); if (!b) return; val = wrap((val & mask()) ^ (1n << BigInt(+b.dataset.bit))); paint(); });
      $('#bBits', view).addEventListener('change', (e) => { st.bits = +e.target.value; val = wrap(val); paint(); });
      $$('[data-sg]', view).forEach((b) => b.addEventListener('click', () => { st.signed = b.dataset.sg === '1'; $$('[data-sg]', view).forEach((x) => x.classList.toggle('on', x === b)); val = wrap(val & mask()); paint(); }));
      $('#bBase', view).addEventListener('click', (e) => {
        const b = e.target.closest('[data-b]'); if (!b) return;
        st.base = +b.dataset.b; $$('#bBase [data-b]', view).forEach((x) => x.classList.toggle('on', x === b));
        exprEl.value = toBase(val, st.base); st.expr = exprEl.value; resEl.textContent = ''; paintPad(); paint();
      });
      paintPad(); paint();
      if (st.expr) calc(false);
      I.registerData('base', () => load('base', {}), (v) => store('base', v));
    }
  });

  // =====================================================================
  // UNITS
  // =====================================================================
  const UNITS = {
    Length: [['m', 'metre (m)'], ['km', 'kilometre (km)'], ['cm', 'centimetre (cm)'], ['mm', 'millimetre (mm)'], ['um', 'micrometre (µm)'], ['nm', 'nanometre (nm)'], ['mi', 'mile'], ['yd', 'yard'], ['ft', 'foot (ft)'], ['in', 'inch (in)'], ['nmi', 'nautical mile'], ['au', 'astronomical unit'], ['lightyear', 'light year']],
    Mass: [['kg', 'kilogram (kg)'], ['g', 'gram (g)'], ['mg', 'milligram (mg)'], ['tonne', 'tonne (t)'], ['lbm', 'pound (lb)'], ['oz', 'ounce (oz)'], ['stone', 'stone'], ['tola', 'tola (India, gold)'], ['carat', 'carat (gem)']],
    Temperature: [['degC', 'Celsius (°C)'], ['degF', 'Fahrenheit (°F)'], ['K', 'kelvin (K)'], ['degR', 'Rankine (°R)']],
    Area: [['m^2', 'square metre (m²)'], ['km^2', 'square kilometre'], ['cm^2', 'square centimetre'], ['hectare', 'hectare (ha)'], ['acre', 'acre'], ['cent', 'cent (TN/Kerala)'], ['ground', 'ground (TN, 2400 sq ft)'], ['guntha', 'guntha'], ['ft^2', 'square foot (sq ft)'], ['yd^2', 'square yard'], ['in^2', 'square inch'], ['mi^2', 'square mile']],
    Volume: [['L', 'litre (L)'], ['mL', 'millilitre (mL)'], ['m^3', 'cubic metre (m³)'], ['cm^3', 'cubic centimetre (cc)'], ['gal', 'US gallon'], ['qt', 'US quart'], ['pint', 'US pint'], ['cup', 'US cup'], ['floz', 'US fluid ounce'], ['tablespoon', 'tablespoon'], ['teaspoon', 'teaspoon'], ['ft^3', 'cubic foot']],
    Speed: [['km/h', 'km per hour'], ['m/s', 'metre per second'], ['mi/h', 'mile per hour (mph)'], ['ft/s', 'foot per second'], ['knot', 'knot']],
    Time: [['s', 'second'], ['ms', 'millisecond'], ['us', 'microsecond'], ['min', 'minute'], ['h', 'hour'], ['day', 'day'], ['week', 'week'], ['month', 'month (average)'], ['year', 'year (365.25 days)']],
    Energy: [['J', 'joule (J)'], ['kJ', 'kilojoule'], ['cal', 'calorie'], ['kcal', 'kilocalorie (food Calorie)'], ['Wh', 'watt hour'], ['kWh', 'kilowatt hour (unit of electricity)'], ['eV', 'electronvolt'], ['BTU', 'BTU']],
    Power: [['W', 'watt (W)'], ['kW', 'kilowatt'], ['MW', 'megawatt'], ['hp', 'horsepower']],
    Pressure: [['Pa', 'pascal (Pa)'], ['kPa', 'kilopascal'], ['MPa', 'megapascal'], ['bar', 'bar'], ['mbar', 'millibar'], ['atm', 'atmosphere'], ['psi', 'psi'], ['mmHg', 'mm of mercury'], ['torr', 'torr']],
    Force: [['N', 'newton (N)'], ['kN', 'kilonewton'], ['lbf', 'pound-force'], ['kgf', 'kilogram-force'], ['dyn', 'dyne']],
    'Data storage': [['b', 'bit'], ['B', 'byte'], ['kB', 'kilobyte (1000 B)'], ['MB', 'megabyte'], ['GB', 'gigabyte'], ['TB', 'terabyte'], ['KiB', 'kibibyte (1024 B)'], ['MiB', 'mebibyte'], ['GiB', 'gibibyte']],
    Angle: [['deg', 'degree (°)'], ['rad', 'radian'], ['grad', 'gradian'], ['arcmin', 'minute of arc (′)'], ['arcsec', 'second of arc (″)'], ['cycle', 'full turn']],
    Frequency: [['Hz', 'hertz (Hz)'], ['kHz', 'kilohertz'], ['MHz', 'megahertz'], ['GHz', 'gigahertz'], ['rpm', 'revolutions per minute']],
    'Fuel economy': [['km/L', 'km per litre'], ['mi/gal', 'miles per US gallon']]
  };
  I.registerTab('units', {
    init(view) {
      const st = Object.assign({ cat: 'Length', v: '1', from: 'km', to: 'mi' }, load('units', {}));
      view.innerHTML = `<div class="col col-in"><div class="card">${head('Unit converter', 'units')}
        <label class="field"><span>Type of unit</span><select class="inp" id="uCat">${Object.keys(UNITS).map((c) => `<option ${c === st.cat ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field" style="margin-top:8px"><span>Value</span><input class="inp mono" id="uVal" value="${esc(st.v)}" autocomplete="off" inputmode="decimal"></label>
        <div style="display:grid;grid-template-columns:minmax(0,1fr) 44px minmax(0,1fr);gap:6px;align-items:end;margin-top:8px"><label class="field"><span>From</span><select class="inp" id="uFrom"></select></label><button type="button" class="iconbtn" id="uSwap" aria-label="Swap units" title="Swap" style="border:1px solid var(--line);border-radius:10px;width:44px;height:44px"><svg class="i"><use href="#i-swap"/></svg></button><label class="field"><span>To</span><select class="inp" id="uTo"></select></label></div>
        <div class="out-big" id="uOut" style="margin-top:12px"></div>
        <div class="row" style="margin-top:8px"><button type="button" class="pill" id="uCopy"><svg class="i"><use href="#i-copy"/></svg>Copy</button><button type="button" class="pill" id="uIns">Use in calculator</button></div>
      </div></div>
      <div class="col col-out"><div class="card"><h2 id="uAllT">All units</h2><div class="tbl-wrap"><table class="tbl" id="uAll"></table></div></div></div>`;
      const save = () => store('units', st);
      let lastText = '';
      function fill() {
        const list = UNITS[st.cat];
        if (!list.some(([k]) => k === st.from)) st.from = list[0][0];
        if (!list.some(([k]) => k === st.to)) st.to = (list[1] || list[0])[0];
        const opts = (sel) => list.map(([k, l]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(l)}</option>`).join('');
        $('#uFrom', view).innerHTML = opts(st.from); $('#uTo', view).innerHTML = opts(st.to);
        conv();
      }
      function conv() {
        save();
        const out = $('#uOut', view), all = $('#uAll', view);
        let v;
        try { v = numIn(st.v, 0); } catch (e) { out.innerHTML = msg(esc(e.message), true); return; }
        try {
          const u = M.unit(v, st.from);
          const r = I.clean(u.toNumber(st.to));
          const lab = (k) => UNITS[st.cat].find((x) => x[0] === k)[1];
          out.innerHTML = `${I.fmtNum(I.clean(v)).html} ${esc(lab(st.from))} =<br><b style="color:var(--cyan)">${I.fmtNum(r).html}</b> ${esc(lab(st.to))}`;
          lastText = I.fmtNum(r).text;
          $('#uAllT', view).textContent = `${I.fmtNum(I.clean(v)).text} ${lab(st.from)} in every unit`;
          all.innerHTML = `<thead><tr><th>Unit</th><th>Value</th></tr></thead><tbody>${UNITS[st.cat].map(([k, l]) => `<tr><td style="font-family:var(--font)">${esc(l)}</td><td>${I.fmtNum(I.clean(u.toNumber(k))).html}</td></tr>`).join('')}</tbody>`;
        } catch (e) { out.innerHTML = msg(esc(I.friendlyError(e, '')), true); }
      }
      $('#uCat', view).addEventListener('change', (e) => { st.cat = e.target.value; fill(); });
      $('#uVal', view).addEventListener('input', (e) => { st.v = e.target.value; conv(); });
      $('#uFrom', view).addEventListener('change', (e) => { st.from = e.target.value; conv(); });
      $('#uTo', view).addEventListener('change', (e) => { st.to = e.target.value; conv(); });
      $('#uSwap', view).addEventListener('click', () => { [st.from, st.to] = [st.to, st.from]; fill(); });
      $('#uCopy', view).addEventListener('click', () => lastText && I.copyText(lastText));
      $('#uIns', view).addEventListener('click', () => lastText && I.insertToCalc(lastText));
      fill();
      I.registerData('units', () => load('units', {}), (v) => store('units', v));
    }
  });

  // =====================================================================
  // CONSTANTS (CODATA 2018 and IAU values)
  // =====================================================================
  const CONSTS = [
    ['Mathematics', [['Pi', 'π', 3.141592653589793, ''], ['Euler’s number', 'e', 2.718281828459045, ''], ['Golden ratio', 'φ', 1.618033988749895, ''], ['Euler–Mascheroni constant', 'γ', 0.5772156649015329, ''], ['Square root of 2', '√2', 1.4142135623730951, '']]],
    ['Universal', [['Speed of light in vacuum', 'c', 299792458, 'm s⁻¹ (exact)'], ['Planck constant', 'h', 6.62607015e-34, 'J s (exact)'], ['Reduced Planck constant', 'ħ', 1.054571817e-34, 'J s'], ['Newtonian constant of gravitation', 'G', 6.6743e-11, 'm³ kg⁻¹ s⁻²'], ['Standard acceleration of gravity', 'g', 9.80665, 'm s⁻² (exact)']]],
    ['Electromagnetic', [['Elementary charge', 'e', 1.602176634e-19, 'C (exact)'], ['Vacuum permittivity', 'ε₀', 8.8541878128e-12, 'F m⁻¹'], ['Vacuum permeability', 'μ₀', 1.25663706212e-6, 'N A⁻²'], ['Coulomb constant', 'kₑ', 8.9875517923e9, 'N m² C⁻²']]],
    ['Atomic & nuclear', [['Electron mass', 'mₑ', 9.1093837015e-31, 'kg'], ['Proton mass', 'mₚ', 1.67262192369e-27, 'kg'], ['Neutron mass', 'mₙ', 1.67492749804e-27, 'kg'], ['Atomic mass constant', 'u', 1.6605390666e-27, 'kg'], ['Bohr radius', 'a₀', 5.29177210903e-11, 'm'], ['Rydberg constant', 'R∞', 10973731.56816, 'm⁻¹'], ['Fine-structure constant', 'α', 7.2973525693e-3, ''], ['Electronvolt', 'eV', 1.602176634e-19, 'J (exact)']]],
    ['Physico-chemical', [['Avogadro constant', 'Nᴀ', 6.02214076e23, 'mol⁻¹ (exact)'], ['Boltzmann constant', 'k', 1.380649e-23, 'J K⁻¹ (exact)'], ['Molar gas constant', 'R', 8.314462618, 'J mol⁻¹ K⁻¹'], ['Faraday constant', 'F', 96485.33212, 'C mol⁻¹'], ['Stefan–Boltzmann constant', 'σ', 5.670374419e-8, 'W m⁻² K⁻⁴'], ['Molar volume of ideal gas (0 °C, 1 atm)', 'Vₘ', 22.41396954e-3, 'm³ mol⁻¹'], ['Standard atmosphere', 'atm', 101325, 'Pa (exact)']]],
    ['Astronomy', [['Astronomical unit', 'au', 149597870700, 'm (exact)'], ['Light year', 'ly', 9460730472580800, 'm (exact)'], ['Parsec', 'pc', 3.0856775814913673e16, 'm'], ['Earth mass', 'M⊕', 5.9722e24, 'kg'], ['Earth mean radius', 'R⊕', 6.371e6, 'm'], ['Sun mass', 'M☉', 1.98847e30, 'kg'], ['Moon mass', 'M☾', 7.342e22, 'kg']]]
  ];
  I.registerTab('const', {
    init(view) {
      view.innerHTML = `<div class="col col-in" style="grid-column:1 / -1"><div class="card">${head('Constants', 'const')}<input class="inp" id="kSearch" placeholder="Search, e.g. Planck, gravity, avogadro" autocomplete="off" aria-label="Search constants"><div id="kList"></div></div></div>`;
      const lit = (v) => { const s = I.fmtNum(v, { mode: 'norm' }).text; return s.includes('e') ? s.replace(/e(-?\d+)/, '×10^$1') : s; };
      const paint = (q) => {
        q = (q || '').toLowerCase().trim();
        $('#kList', view).innerHTML = CONSTS.map(([g, items]) => {
          const its = items.filter(([n, s, , u]) => !q || `${n} ${s} ${u} ${g}`.toLowerCase().includes(q));
          if (!its.length) return '';
          return `<div class="grp-h">${esc(g)}</div><div class="list">${its.map(([n, s, v, u]) => `<div class="list-item"><div class="t">${esc(n)} <span style="color:var(--cyan)">${esc(s)}</span></div><div class="s">${I.fmtNum(v, { mode: 'norm' }).html} ${esc(u)}</div><div class="acts"><button type="button" class="pill" data-kins="${esc(lit(v))}">Insert</button><button type="button" class="pill" data-kcopy="${esc(I.fmtNum(v, { mode: 'norm' }).text)}" aria-label="Copy ${esc(n)}"><svg class="i"><use href="#i-copy"/></svg></button></div></div>`).join('')}</div>`;
        }).join('') || '<div class="empty">No constant matches. Try another word.</div>';
      };
      paint('');
      $('#kSearch', view).addEventListener('input', (e) => paint(e.target.value));
      $('#kList', view).addEventListener('click', (e) => {
        const a = e.target.closest('[data-kins]'); if (a) { I.insertToCalc(`(${a.dataset.kins})`); I.toast('Inserted into the calculator.'); return; }
        const c = e.target.closest('[data-kcopy]'); if (c) I.copyText(c.dataset.kcopy);
      });
    }
  });
})();
