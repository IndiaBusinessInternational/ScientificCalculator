/* IBI Scientific Calculator v1.0 — core: maths engine (math.js 15.2.0), number formatting,
   the Calculate tab, history, memory and variables, settings, overlays, install and backup.
   The other tabs live in tools.js and use window.ISC. */
(function () {
  'use strict';
  const VERSION = '1.0';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('isc:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('isc:' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
    del(k) { try { localStorage.removeItem('isc:' + k); } catch (e) { /* blocked */ } }
  };

  // ---------- settings ----------
  const DEFAULTS = { angle: 'deg', fmt: 'norm', digits: 4, group: 'intl', exactFirst: true, cplx: 'real', pad: 'sci', haptic: true };
  const S = Object.assign({}, DEFAULTS, LS.get('settings', {}));
  const saveSettings = () => LS.set('settings', S);

  // ---------- maths engine ----------
  const M = math.create(math.all);
  M.config({ number: 'number', predictable: false });
  const orig = {};
  ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'asec', 'acsc', 'acot', 'atan2', 'log', 'arg'].forEach((n) => { orig[n] = M[n]; });
  let ANG = S.angle;
  const withAngle = (a, fn) => { const keep = ANG; ANG = a; try { return fn(); } finally { ANG = keep; } };
  const angRad = (x) => ANG === 'deg' ? (x % 360) * Math.PI / 180 : ANG === 'grad' ? (x % 400) * Math.PI / 200 : x;
  const fromRad = (x) => ANG === 'deg' ? x * 180 / Math.PI : ANG === 'grad' ? x * 200 / Math.PI : x;
  const snap = (v, r) => (Math.abs(v) < 1e-13 && Math.abs(r) > 1e-6) ? 0 : v;
  class CalcError extends Error {}
  const mathErr = (m) => { throw new CalcError(m); };

  function trigTyped(name, numFn) {
    const self = M.typed(name, {
      number: numFn,
      BigNumber: (x) => numFn(x.toNumber()),
      Fraction: (x) => numFn(x.valueOf()),
      Complex: (x) => orig[name](x),
      Unit: (x) => orig[name](x),
      'Array | Matrix': (x) => M.map(x, (v) => self(v))
    });
    return self;
  }
  function invTyped(name, numFn) {
    const self = M.typed(name, {
      number: numFn,
      BigNumber: (x) => numFn(x.toNumber()),
      Fraction: (x) => numFn(x.valueOf()),
      Complex: (x) => M.multiply(orig[name](x), fromRad(1)),
      'Array | Matrix': (x) => M.map(x, (v) => self(v))
    });
    return self;
  }
  const sinN = (x) => { const r = angRad(x); return snap(Math.sin(r), r); };
  const cosN = (x) => { const r = angRad(x); return snap(Math.cos(r), r); };
  const inRange = (x, name, f) => (Math.abs(x) <= 1 ? fromRad(f(x)) : M.multiply(orig[name](M.complex(x, 0)), fromRad(1)));

  // Rounding: answers keep 15 significant digits, like a Casio, so 0.1 + 0.2 = 0.3 and tan 45° = 1.
  const round12 = (v) => (isFinite(v) && v !== 0 ? parseFloat(v.toPrecision(Math.abs(v) < 1e-300 ? 1 : 12)) : v);
  const clean = (v) => (typeof v === 'number' && isFinite(v) && v !== 0) ? parseFloat(v.toPrecision(15)) : v;
  function cleanDeep(v) {
    const t = M.typeOf(v);
    if (t === 'number') return clean(v);
    if (t === 'Complex') {
      let re = clean(v.re), im = clean(v.im);
      const big = Math.max(Math.abs(re), Math.abs(im));
      if (Math.abs(im) <= 1e-14 * Math.max(1, big)) im = 0;
      if (Math.abs(re) <= 1e-14 * Math.max(1, big)) re = 0;
      return im === 0 ? re : M.complex(re, im);
    }
    if (t === 'DenseMatrix' || t === 'Array') return M.map(v, (x) => cleanDeep(x));
    return v;
  }

  // ---------- numeric methods (shared with tools.js) ----------
  const GK = {
    x: [0.991455371120813, 0.949107912342759, 0.864864423359769, 0.741531185599394, 0.586087235467691, 0.405845151377397, 0.207784955007898, 0],
    wk: [0.022935322010529, 0.063092092629979, 0.104790010322250, 0.140653259715525, 0.169004726639267, 0.190350578064785, 0.204432940075298, 0.209482141084728],
    wg: [0, 0.129484966168870, 0, 0.279705391489277, 0, 0.381830050505119, 0, 0.417959183673469]
  };
  function gk15(f, a, b) {
    const c = (a + b) / 2, h = (b - a) / 2;
    let k = 0, g = 0;
    for (let i = 0; i < 8; i++) {
      if (i === 7) { const fc = f(c); k += GK.wk[7] * fc; g += GK.wg[7] * fc; continue; }
      const dx = h * GK.x[i];
      const s = f(c - dx) + f(c + dx);
      k += GK.wk[i] * s; g += GK.wg[i] * s;
    }
    return [k * h, Math.abs((k - g) * h)];
  }
  function integrate(f, a, b, tol = 1e-11) {
    if (a === b) return { value: 0, error: 0 };
    if (a > b) { const r = integrate(f, b, a, tol); return { value: -r.value, error: r.error }; }
    let g = f;
    if (!isFinite(a) && !isFinite(b)) { g = (t) => { const d = 1 - t * t; return f(t / d) * (1 + t * t) / (d * d); }; a = -1; b = 1; }
    else if (!isFinite(b)) { const a0 = a; g = (t) => f(a0 + t / (1 - t)) / ((1 - t) * (1 - t)); a = 0; b = 1; }
    else if (!isFinite(a)) { const b0 = b; g = (t) => f(b0 - (1 - t) / t) / (t * t); a = 0; b = 1; }
    let calls = 0;
    const rec = (lo, hi, whole, depth) => {
      const m = (lo + hi) / 2;
      const L = gk15(g, lo, m), R = gk15(g, m, hi);
      calls++;
      const sum = L[0] + R[0], err = L[1] + R[1];
      if (depth > 40 || calls > 4000 || err <= Math.max(tol * Math.abs(sum), 1e-15) || Math.abs(sum - whole) <= tol * Math.abs(sum)) return [sum, err];
      const l = rec(lo, m, L[0], depth + 1), r = rec(m, hi, R[0], depth + 1);
      return [l[0] + r[0], l[1] + r[1]];
    };
    const first = gk15(g, a, b);
    const r = rec(a, b, first[0], 0);
    if (!isFinite(r[0]) || r[1] > 1e-4 * Math.max(1, Math.abs(r[0]))) mathErr('Math ERROR: the integral does not converge (the function goes to infinity in this range).');
    return { value: r[0], error: r[1] };
  }
  // Ridders' method: central differences with Richardson extrapolation.
  function deriv1(f, x, h0) {
    let h = h0 || Math.max(1e-2, Math.abs(x) * 1e-2);
    const NT = 10, CON = 1.4, CON2 = CON * CON;
    const a = [];
    let best = NaN, err = Infinity;
    a[0] = [(f(x + h) - f(x - h)) / (2 * h)];
    for (let i = 1; i < NT; i++) {
      h /= CON;
      a[i] = [(f(x + h) - f(x - h)) / (2 * h)];
      let fac = CON2;
      for (let j = 1; j <= i; j++) {
        a[i][j] = (a[i][j - 1] * fac - a[i - 1][j - 1]) / (fac - 1);
        fac *= CON2;
        const e = Math.max(Math.abs(a[i][j] - a[i][j - 1]), Math.abs(a[i][j] - a[i - 1][j - 1]));
        if (e <= err) { err = e; best = a[i][j]; }
      }
      if (Math.abs(a[i][i] - a[i - 1][i - 1]) >= 2 * err) break;
    }
    return best;
  }
  function derivN(f, x, n = 1) {
    if (n <= 1) return deriv1(f, x);
    return deriv1((t) => derivN(f, t, n - 1), x, Math.max(5e-2, Math.abs(x) * 5e-2));
  }
  function brent(f, a, b, fa, fb) {
    fa = fa === undefined ? f(a) : fa; fb = fb === undefined ? f(b) : fb;
    if (fa === 0) return a; if (fb === 0) return b;
    let c = a, fc = fa, d = b - a, e = d;
    for (let i = 0; i < 200; i++) {
      if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
      if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
      const tol = 2e-16 * Math.abs(b) + 1e-300, m = (c - b) / 2;
      if (Math.abs(m) <= tol || fb === 0) return b;
      if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
        let p, q, r; const s = fb / fa;
        if (a === c) { p = 2 * m * s; q = 1 - s; }
        else { q = fa / fc; r = fb / fc; p = s * (2 * m * q * (q - r) - (b - a) * (r - 1)); q = (q - 1) * (r - 1) * (s - 1); }
        if (p > 0) q = -q; else p = -p;
        if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) { e = d; d = p / q; } else { d = m; e = d; }
      } else { d = m; e = d; }
      a = b; fa = fb;
      b += Math.abs(d) > tol ? d : (m > 0 ? tol : -tol);
      fb = f(b);
    }
    return b;
  }
  // All real roots of f in [a, b]: sign changes refined by Brent, plus touching roots (local minimum of |f| that reaches 0).
  function findRoots(f, a, b, n = 4000) {
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; xs.push(x); let y; try { y = f(x); } catch (e) { y = NaN; } ys.push(y); }
    const roots = [];
    const scale = Math.max(1e-300, ...ys.filter(isFinite).map(Math.abs).slice(0, 1e5));
    for (let i = 0; i < n; i++) {
      const y0 = ys[i], y1 = ys[i + 1];
      if (!isFinite(y0) || !isFinite(y1)) continue;
      if (y0 === 0) { roots.push(xs[i]); continue; }
      if (y0 * y1 < 0) {
        const r = brent(f, xs[i], xs[i + 1], y0, y1);
        const fr = Math.abs(f(r));
        if (isFinite(fr) && fr < 1e-6 * Math.max(1, Math.abs(y0), Math.abs(y1))) roots.push(r);
      } else if (i > 0 && isFinite(ys[i - 1]) && Math.abs(y0) < Math.abs(ys[i - 1]) && Math.abs(y0) <= Math.abs(y1) && Math.abs(y0) < 1e-3 * scale) {
        let lo = xs[i - 1], hi = xs[i + 1];
        for (let k = 0; k < 100; k++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3; if (Math.abs(f(m1)) < Math.abs(f(m2))) hi = m2; else lo = m1; }
        const r = (lo + hi) / 2;
        if (Math.abs(f(r)) < 1e-10 * Math.max(1, scale)) roots.push(r);
      }
    }
    if (isFinite(ys[n]) && ys[n] === 0) roots.push(xs[n]);
    roots.sort((p, q) => p - q);
    const out = [];
    for (const r of roots) { const c = clean(Math.abs(r) < 1e-12 ? 0 : r); if (!out.length || Math.abs(c - out[out.length - 1]) > 1e-9 * Math.max(1, Math.abs(c))) out.push(c); }
    return out;
  }
  // Polynomial roots (coefficients highest power first), complex roots as {re, im}.
  function polyRoots(coef) {
    let c = coef.slice();
    while (c.length && c[0] === 0) c.shift();
    const n = c.length - 1;
    if (n < 1) return [];
    if (n === 1) return [{ re: -c[1] / c[0], im: 0 }];
    if (n === 2) {
      const [a, b, cc] = c, D = b * b - 4 * a * cc;
      if (D >= 0) { const s = Math.sqrt(D), q = -0.5 * (b + (b >= 0 ? s : -s)); const r1 = q / a, r2 = q !== 0 ? cc / q : -b / (2 * a) ; return [{ re: r1, im: 0 }, { re: r2, im: 0 }].sort((p, q2) => p.re - q2.re); }
      const s = Math.sqrt(-D) / (2 * Math.abs(a)); return [{ re: -b / (2 * a), im: s }, { re: -b / (2 * a), im: -s }];
    }
    const a0 = c[0]; c = c.map((v) => v / a0);
    const R = 1 + Math.max(...c.slice(1).map(Math.abs));
    let z = [];
    for (let k = 0; k < n; k++) { const t = 2 * Math.PI * k / n + 0.4; z.push({ re: R * 0.9 * Math.cos(t), im: R * 0.9 * Math.sin(t) }); }
    const mul = (p, q) => ({ re: p.re * q.re - p.im * q.im, im: p.re * q.im + p.im * q.re });
    const div = (p, q) => { const d = q.re * q.re + q.im * q.im; return { re: (p.re * q.re + p.im * q.im) / d, im: (p.im * q.re - p.re * q.im) / d }; };
    const sub = (p, q) => ({ re: p.re - q.re, im: p.im - q.im });
    const evalP = (x, cs) => { let r = { re: cs[0], im: 0 }; for (let i = 1; i < cs.length; i++) r = { re: r.re * x.re - r.im * x.im + cs[i], im: r.re * x.im + r.im * x.re }; return r; };
    for (let it = 0; it < 2000; it++) {
      let delta = 0;
      z = z.map((zi, i) => {
        let den = { re: 1, im: 0 };
        z.forEach((zj, j) => { if (i !== j) den = mul(den, sub(zi, zj)); });
        const step = div(evalP(zi, c), den);
        delta = Math.max(delta, Math.hypot(step.re, step.im));
        return sub(zi, step);
      });
      if (delta < 1e-15 * R) break;
    }
    const dc = c.slice(0, -1).map((v, i) => v * (n - i));
    z = z.map((zi) => { for (let k = 0; k < 3; k++) { const d = evalP(zi, dc); if (Math.hypot(d.re, d.im) < 1e-300) break; zi = sub(zi, div(evalP(zi, c), d)); } return zi; });
    z = z.map((zi) => { const m = Math.max(1, Math.hypot(zi.re, zi.im)); return { re: Math.abs(zi.re) < 1e-12 * m ? 0 : clean(zi.re), im: Math.abs(zi.im) < 1e-9 * m ? 0 : clean(zi.im) }; });
    return z.sort((p, q) => (p.im === 0 && q.im !== 0) ? -1 : (q.im === 0 && p.im !== 0) ? 1 : (p.re - q.re) || (q.im - p.im));
  }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a; }
  function ratApprox(x, maxDen = 10000, tol = 1e-12) {
    if (!isFinite(x)) return null;
    const sign = x < 0 ? -1 : 1; x = Math.abs(x);
    let h0 = 0, h1 = 1, k0 = 1, k1 = 0, b = x;
    for (let i = 0; i < 64; i++) {
      const a = Math.floor(b);
      const h2 = a * h1 + h0, k2 = a * k1 + k0;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(x - h1 / k1) <= tol * Math.max(1, x)) return [sign * h1, k1];
      const fr = b - a; if (fr < 1e-15) break;
      b = 1 / fr;
    }
    return null;
  }

  // ---------- custom functions ----------
  function childScope(scope) {
    const s = new Map();
    if (scope && typeof scope.keys === 'function') { for (const k of scope.keys()) s.set(k, scope.get(k)); }
    return s;
  }
  function realOf(v, what) {
    const t = M.typeOf(v);
    if (t === 'number') return v;
    if (t === 'BigNumber' || t === 'Fraction') return Number(v.valueOf());
    if (t === 'Complex' && Math.abs(v.im) < 1e-12) return v.re;
    if (t === 'boolean') return v ? 1 : 0;
    throw new CalcError('Math ERROR: ' + (what || 'this needs a real number') + '.');
  }
  function varFn(args, scope, label) {
    const node = args[0];
    const v = args[1];
    if (!v || !v.isSymbolNode) mathErr(`Syntax ERROR: write ${label}(expression, variable, …), for example ${label === 'deriv' ? 'd/dx(x², x, 3)' : label === 'integrate' ? '∫(x², x, 0, 3)' : 'Σ(k², k, 1, 10)'}.`);
    const code = node.compile();
    const s = childScope(scope);
    const name = v.name;
    const rad = label === 'integrate' || label === 'deriv' || label === 'limit';
    return (x) => { s.set(name, x); return realOf(rad ? withAngle('rad', () => code.evaluate(s)) : code.evaluate(s), 'the expression must give a real number'); };
  }
  const evalArg = (n, scope) => realOf(n.compile().evaluate(childScope(scope)));
  const fns = {
    ln: M.typed('ln', { any: (x) => orig.log(x) }),
    log: M.typed('log', { any: (x) => M.log10(x), 'any, any': (x, b) => orig.log(x, b) }),
    sin: trigTyped('sin', sinN),
    cos: trigTyped('cos', cosN),
    tan: trigTyped('tan', (x) => { const r = angRad(x), s = snap(Math.sin(r), r), c = snap(Math.cos(r), r); if (c === 0) mathErr('Math ERROR: tan is undefined at this angle (cos = 0).'); return s / c; }),
    sec: trigTyped('sec', (x) => { const c = cosN(x); if (c === 0) mathErr('Math ERROR: sec is undefined here (cos = 0).'); return 1 / c; }),
    csc: trigTyped('csc', (x) => { const s = sinN(x); if (s === 0) mathErr('Math ERROR: cosec is undefined here (sin = 0).'); return 1 / s; }),
    cot: trigTyped('cot', (x) => { const r = angRad(x), s = snap(Math.sin(r), r), c = snap(Math.cos(r), r); if (s === 0) mathErr('Math ERROR: cot is undefined here (sin = 0).'); return c / s; }),
    asin: invTyped('asin', (x) => inRange(x, 'asin', Math.asin)),
    acos: invTyped('acos', (x) => inRange(x, 'acos', Math.acos)),
    atan: invTyped('atan', (x) => fromRad(Math.atan(x))),
    asec: invTyped('asec', (x) => Math.abs(x) >= 1 ? fromRad(Math.acos(1 / x)) : M.multiply(orig.asec(M.complex(x, 0)), fromRad(1))),
    acsc: invTyped('acsc', (x) => Math.abs(x) >= 1 ? fromRad(Math.asin(1 / x)) : M.multiply(orig.acsc(M.complex(x, 0)), fromRad(1))),
    acot: invTyped('acot', (x) => fromRad(x === 0 ? Math.PI / 2 : Math.atan(1 / x))),
    atan2: M.typed('atan2', { 'number, number': (y, x) => fromRad(Math.atan2(y, x)) }),
    arg: M.typed('arg', { Complex: (z) => fromRad(orig.arg(z)), number: (x) => fromRad(orig.arg(x)) }),
    nPr: M.typed('nPr', { 'number, number': (n, r) => { if (r > n || n < 0 || r < 0 || !Number.isInteger(n) || !Number.isInteger(r)) mathErr('Math ERROR: nPr needs whole numbers with 0 ≤ r ≤ n.'); return M.permutations(n, r); } }),
    nCr: M.typed('nCr', { 'number, number': (n, r) => { if (r > n || n < 0 || r < 0 || !Number.isInteger(n) || !Number.isInteger(r)) mathErr('Math ERROR: nCr needs whole numbers with 0 ≤ r ≤ n.'); return M.combinations(n, r); } }),
    hcf: M.typed('hcf', { '...number': (a) => M.gcd(...a) }),
    ranInt: M.typed('ranInt', { 'number, number': (a, b) => M.randomInt(Math.ceil(a), Math.floor(b) + 1) }),
    ran: M.typed('ran', { '': () => Math.floor(Math.random() * 1000) / 1000 }),
    pol: M.typed('pol', { 'number, number': (x, y) => M.matrix([clean(Math.hypot(x, y)), clean(fromRad(Math.atan2(y, x)))]) }),
    rec: M.typed('rec', { 'number, number': (r, t) => M.matrix([clean(r * cosN(t)), clean(r * sinN(t))]) }),
    dms: M.typed('dms', { 'number, number, number': (d, m, s) => d + Math.sign(d || 1) * (m / 60 + s / 3600), 'number, number': (d, m) => d + Math.sign(d || 1) * m / 60 }),
    torad: M.typed('torad', { number: (x) => x * Math.PI / 180 }),
    todeg: M.typed('todeg', { number: (x) => x * 180 / Math.PI }),
    factors: M.typed('factors', { number: (n) => primeFactorText(n) })
  };
  function primeFactorText(n) {
    if (!Number.isInteger(n) || n < 2 || n > 9007199254740991) mathErr('Math ERROR: prime factors need a whole number from 2 up.');
    const out = []; let x = n;
    for (let p = 2; p * p <= x; p += (p === 2 ? 1 : 2)) { let k = 0; while (x % p === 0) { x /= p; k++; } if (k) out.push(k > 1 ? `${p}^${k}` : String(p)); }
    if (x > 1) out.push(String(x));
    return out.join(' × ');
  }
  function integrateRaw(args, _m, scope) {
    if (args.length !== 4) mathErr('Syntax ERROR: write ∫(expression, x, from, to), for example ∫(x², x, 0, 3).');
    const f = varFn(args, scope, 'integrate');
    return round12(integrate(f, evalArg(args[2], scope), evalArg(args[3], scope)).value);
  }
  integrateRaw.rawArgs = true;
  function derivRaw(args, _m, scope) {
    if (args.length < 3) mathErr('Syntax ERROR: write d/dx(expression, x, at), for example d/dx(x², x, 3).');
    const f = varFn(args, scope, 'deriv');
    const n = args[3] ? evalArg(args[3], scope) : 1;
    return round12(derivN(f, evalArg(args[2], scope), n));
  }
  derivRaw.rawArgs = true;
  function seriesRaw(kind) {
    const fn = function (args, _m, scope) {
      if (args.length !== 4) mathErr(`Syntax ERROR: write ${kind === 'sum' ? 'Σ' : 'Π'}(expression, k, from, to), for example ${kind === 'sum' ? 'Σ(k², k, 1, 10)' : 'Π(k, k, 1, 5)'}.`);
      const f = varFn(args, scope, kind === 'sum' ? 'sigma' : 'product');
      const a = evalArg(args[2], scope), b = evalArg(args[3], scope);
      if (!Number.isInteger(a) || !Number.isInteger(b)) mathErr('Math ERROR: the limits must be whole numbers.');
      if (b - a > 1e6) mathErr('Math ERROR: too many terms (more than 1,000,000).');
      let acc = kind === 'sum' ? 0 : 1;
      for (let k = a; k <= b; k++) acc = kind === 'sum' ? acc + f(k) : acc * f(k);
      return clean(acc);
    };
    fn.rawArgs = true;
    return fn;
  }
  function solveRaw(args, _m, scope) {
    if (args.length < 2) mathErr('Syntax ERROR: write solve(expression, x, guess), for example solve(x³ − 2x − 5, x, 2).');
    const f = varFn(args, scope, 'solve');
    const g = args[2] ? evalArg(args[2], scope) : 1;
    for (let w = 1; w <= 1e6; w *= 4) {
      const rs = findRoots(f, g - w, g + w, 800);
      if (rs.length) return round12(rs.reduce((p, q) => Math.abs(q - g) < Math.abs(p - g) ? q : p));
    }
    mathErr('Math ERROR: no answer found near that guess. Try another guess, or use the Equations tab.');
  }
  solveRaw.rawArgs = true;
  function limitRaw(args, _m, scope) {
    if (args.length !== 3) mathErr('Syntax ERROR: write limit(expression, x, a).');
    const f = varFn(args, scope, 'limit');
    const a = evalArg(args[2], scope);
    const side = (dir) => { let last = NaN; for (let k = 3; k <= 9; k++) { const h = Math.pow(10, -k) * Math.max(1, Math.abs(a)); const v = f(a + dir * h); if (isFinite(v)) last = v; } return last; };
    const l = side(-1), r = side(1);
    if (!isFinite(l) && !isFinite(r)) mathErr('Math ERROR: the limit does not exist (the function blows up).');
    if (Math.abs(l - r) > 1e-5 * Math.max(1, Math.abs(l))) mathErr(`Math ERROR: the left limit (≈ ${clean(l)}) and right limit (≈ ${clean(r)}) are different.`);
    return parseFloat(((l + r) / 2).toPrecision(10));
  }
  limitRaw.rawArgs = true;
  fns.integrate = integrateRaw; fns.deriv = derivRaw; fns.sigma = seriesRaw('sum'); fns.product = seriesRaw('prod'); fns.solve = solveRaw; fns.limit = limitRaw;
  M.import(fns, { override: true });
  // Indian land and gold units (cent and ground as used in Tamil Nadu and Kerala).
  M.createUnit({ acre: { definition: '4046.8564224 m^2', aliases: ['acres'] } }, { override: true });
  [['nmi', '1852 m'], ['lightyear', '9460730472580800 m'], ['au', '149597870700 m'], ['carat', '0.2 g'], ['knot', '1852 m/h'],
    ['cal', '4.184 J'], ['kcal', '4184 J'], ['rpm', '0.0166666666666666667 Hz'], ['cent', '40.468564224 m^2'], ['ground', '2400 ft^2'],
    ['guntha', '1089 ft^2'], ['tola', '11.6638038 g']].forEach(([n, d]) => {
    try { M.createUnit(n, d); } catch (e) { /* already defined */ }
  });

  // ---------- expression normalising (keypad glyphs → math.js) ----------
  const REPL = [
    ['sinh⁻¹(', 'asinh('], ['cosh⁻¹(', 'acosh('], ['tanh⁻¹(', 'atanh('],
    ['sin⁻¹(', 'asin('], ['cos⁻¹(', 'acos('], ['tan⁻¹(', 'atan('],
    ['×10^', '*10^'], ['×', '*'], ['÷', '/'], ['−', '-'], ['–', '-'], ['·', '*'],
    ['π', 'pi'], ['∛(', 'cbrt('], ['√(', 'sqrt('], ['∫(', 'integrate('], ['d/dx(', 'deriv('], ['Σ(', 'sigma('], ['Π(', 'product('],
    ['²', '^2'], ['³', '^3'], ['⁻¹', '^(-1)'], ['ℯ', 'e'], ['，', ','], ['≤', '<='], ['≥', '>='], ['≠', '!=']
  ];
  function normalise(src) {
    let s = String(src);
    s = s.replace(/(\d+(?:\.\d+)?)°(?:\s*(\d+(?:\.\d+)?)[′'])?(?:\s*(\d+(?:\.\d+)?)[″"])?/g, (_m, d, mi, se) => (mi || se) ? `((${d}+${mi || 0}/60+${se || 0}/3600) deg)` : `(${d} deg)`);
    s = s.replace(/°/g, ' deg');
    s = s.replace(/√(\d+(?:\.\d+)?|[A-Za-zπ]\w*)/g, 'sqrt($1)').replace(/∛(\d+(?:\.\d+)?|[A-Za-zπ]\w*)/g, 'cbrt($1)');
    for (const [a, b] of REPL) s = s.split(a).join(b);
    return s;
  }
  function friendlyError(e, code) {
    const m = String(e && e.message || e);
    if (e instanceof CalcError) return m;
    if (/Parenthesis \) expected|Unexpected end of expression/i.test(m)) return 'Syntax ERROR: a bracket is not closed, or the sum ends too early.';
    if (/Unexpected operator|Value expected|Unexpected type of argument|Unexpected/i.test(m) && /char/.test(m)) return 'Syntax ERROR: ' + m.replace(/\(char (\d+)\)/, (_x, n) => `near “${code.slice(Math.max(0, n - 4), +n + 3)}”`);
    if (/Undefined symbol (\w+)/.test(m)) { const n = m.match(/Undefined symbol (\w+)/)[1]; return `Unknown name “${n}”. Store a value first (STO or ${n} = 5), or check the spelling.`; }
    if (/Undefined function (\w+)/.test(m)) return `Unknown function “${m.match(/Undefined function (\w+)/)[1]}”. Open Functions to see every function.`;
    if (/Too few arguments|Too many arguments/.test(m)) return 'Syntax ERROR: wrong number of values in a function. ' + m.replace(/\(.*\)$/, '');
    if (/Units do not match|cannot be converted/i.test(m)) return 'Unit ERROR: these units do not match. ' + m;
    if (/Dimension mismatch|dimensions/i.test(m)) return 'Dimension ERROR: the matrix or vector sizes do not match. ' + m;
    if (/Vectors with length 3 expected/i.test(m)) return 'Math ERROR: the cross product needs 3D vectors. Switch to 3D.';
    if (/singular|determinant is zero/i.test(m)) return 'Math ERROR: the matrix is singular (determinant 0), so it has no inverse.';
    return 'ERROR: ' + m;
  }

  // ---------- number formatting ----------
  function groupInt(s) {
    if (S.group === 'none') return s;
    const neg = s[0] === '-'; let t = neg ? s.slice(1) : s;
    if (t.length <= 3) return s;
    if (S.group === 'indian') { const last = t.slice(-3); t = t.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last; }
    else t = t.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-' : '') + t;
  }
  function numParts(x, mode, digits) {
    mode = mode || S.fmt; digits = digits == null ? S.digits : digits;
    let str;
    if (mode === 'fix' && Math.abs(x) < 1e21) str = x.toFixed(digits);
    else if (mode === 'sci') str = x.toExponential(Math.max(0, digits - 1));
    else if (mode === 'eng') {
      if (x === 0) return { m: '0', e: null };
      let e = Math.floor(Math.log10(Math.abs(x)) / 3) * 3;
      let m = parseFloat((x / Math.pow(10, e)).toPrecision(10));
      if (Math.abs(m) >= 1000) { e += 3; m = parseFloat((m / 1000).toPrecision(10)); }
      return { m: String(m), e: e === 0 ? null : e };
    } else str = M.format(x, { precision: 12, lowerExp: -9, upperExp: 12 });
    const k = str.indexOf('e');
    if (k < 0) return { m: str, e: null };
    return { m: str.slice(0, k), e: parseInt(str.slice(k + 1), 10) };
  }
  function fmtNum(x, opt = {}) {
    if (Number.isNaN(x)) return { text: 'NaN', html: 'undefined' };
    if (x === Infinity || x === -Infinity) return { text: x > 0 ? 'Infinity' : '-Infinity', html: x > 0 ? '∞' : '−∞' };
    const p = numParts(x, opt.mode, opt.digits);
    const [ip, fp] = p.m.split('.');
    const g = groupInt(ip) + (fp != null ? '.' + fp : '');
    const html = g.replace(/-/g, '−') + (p.e != null ? `×10<sup>${String(p.e).replace('-', '−')}</sup>` : '');
    const text = p.m + (p.e != null ? 'e' + p.e : '');
    return { text, html };
  }
  const fracHtml = (n, d) => `<span class="frac"><span>${n}</span><span>${d}</span></span>`;
  function exactOf(x) {
    if (typeof x !== 'number' || !isFinite(x) || Number.isInteger(x) || Math.abs(x) > 1e9 || Math.abs(x) < 1e-9) return null;
    const sg = x < 0 ? '−' : '', sgT = x < 0 ? '-' : '';
    let r = ratApprox(x, 10000);
    if (r && r[1] === 1) return null;
    if (r && String(Math.abs(r[0])).length + String(r[1]).length > 10) return null;
    if (r) {
      const n = Math.abs(r[0]), d = r[1];
      const out = { kind: 'frac', html: sg + fracHtml(n, d), text: `${sgT}${n}/${d}`, tex: `${sgT}\\frac{${n}}{${d}}` };
      if (n > d) { const w = Math.floor(n / d), rem = n % d; out.mixed = { html: `${sg}${w}${fracHtml(rem, d)}`, text: `${sgT}${w} ${rem}/${d}` }; }
      return out;
    }
    r = ratApprox(x / Math.PI, 1000);
    if (r && Math.abs(r[0]) <= 10000) {
      const n = Math.abs(r[0]), d = r[1], num = (n === 1 ? '' : n) + 'π';
      return { kind: 'pi', html: sg + (d === 1 ? num : fracHtml(num, d)), text: `${sgT}${n === 1 ? '' : n + '*'}pi${d === 1 ? '' : '/' + d}`, tex: `${sgT}\\frac{${n === 1 ? '' : n}\\pi}{${d}}` };
    }
    r = ratApprox(x * x, 10000);
    if (r && r[0] > 0) {
      let nn = r[0] * r[1];
      if (nn > 1e8) return null;
      let k = 1;
      for (let f = 2; f * f <= nn; f++) while (nn % (f * f) === 0) { nn /= f * f; k *= f; }
      if (nn === 1) return null;
      let q = r[1]; const g = gcd(k, q); k /= g; q /= g;
      const num = (k === 1 ? '' : k) + '√' + nn;
      return { kind: 'sqrt', html: sg + (q === 1 ? num : fracHtml(num, q)), text: `${sgT}${k === 1 ? '' : k + '*'}sqrt(${nn})${q === 1 ? '' : '/' + q}`, tex: `${sgT}\\frac{${k === 1 ? '' : k}\\sqrt{${nn}}}{${q}}` };
    }
    return null;
  }
  function fmtComplex(z, opt = {}) {
    const polar = opt.polar != null ? opt.polar : S.cplx === 'polar';
    if (polar) {
      const r = clean(Math.hypot(z.re, z.im)), t = clean(fromRad(Math.atan2(z.im, z.re)));
      const a = fmtNum(r), b = fmtNum(t);
      const u = ANG === 'deg' ? '°' : ANG === 'grad' ? 'ᵍ' : '';
      return { text: `${a.text}*(cos(${b.text}${ANG === 'deg' ? ' deg' : ''})+i*sin(${b.text}${ANG === 'deg' ? ' deg' : ''}))`, html: `${a.html} ∠ ${b.html}${u}` };
    }
    const re = fmtNum(z.re), im = fmtNum(Math.abs(z.im));
    const imH = Math.abs(z.im) === 1 ? 'i' : im.html + 'i', imT = Math.abs(z.im) === 1 ? 'i' : im.text + 'i';
    if (z.re === 0) return { text: (z.im < 0 ? '-' : '') + imT, html: (z.im < 0 ? '−' : '') + imH };
    return { text: `${re.text}${z.im < 0 ? '-' : '+'}${imT}`, html: `${re.html} ${z.im < 0 ? '−' : '+'} ${imH}` };
  }
  function matrixHtml(arr, cell) {
    const rows = Array.isArray(arr[0]) ? arr : [arr];
    const cols = rows[0] ? rows[0].length : 0;
    return `<span class="res-mat" style="grid-template-columns:repeat(${cols},auto)">${rows.map((r) => r.map((v) => `<span>${cell(v)}</span>`).join('')).join('')}</span>`;
  }
  function fmtValue(v, opt = {}) {
    const t = M.typeOf(v);
    if (t === 'number') return fmtNum(v, opt);
    if (t === 'Complex') return fmtComplex(v, opt);
    if (t === 'BigNumber') return fmtNum(v.toNumber(), opt);
    if (t === 'Fraction') { const n = Number(v.s) * Number(v.n), d = Number(v.d); return { text: `${n}/${d}`, html: d === 1 ? String(n) : (n < 0 ? '−' : '') + fracHtml(Math.abs(n), d) }; }
    if (t === 'DenseMatrix' || t === 'Array') {
      const a = t === 'DenseMatrix' ? v.toArray() : v;
      return { text: M.format(a, { precision: 14 }), html: matrixHtml(a, (x) => fmtValue(x, opt).html), matrix: true };
    }
    if (t === 'Unit') { const s = M.format(v, { precision: 12, lowerExp: -9, upperExp: 12 }); return { text: s, html: esc(s).replace(/e\+?(-?\d+)/, (_m, e) => `×10<sup>${e.replace('-', '−')}</sup>`) }; }
    if (t === 'boolean') return { text: String(v), html: v ? 'true' : 'false' };
    if (t === 'string') return { text: JSON.stringify(v), html: esc(v) };
    if (t === 'function') return { text: '', html: `<span class="muted">Function ${esc(v.syntax || '')} saved</span>` };
    if (t === 'null' || t === 'undefined') return { text: '', html: '' };
    if (t === 'Object' && v.values) return fmtValue(v.values, opt);
    const s = M.format(v, { precision: 12 });
    return { text: s, html: esc(s) };
  }

  // ---------- evaluation ----------
  const scope = new Map();
  const VAR_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'x', 'y', 'z', 'M'];
  function loadScope() {
    const vars = LS.get('vars', {});
    for (const k in vars) { try { scope.set(k, JSON.parse(JSON.stringify(vars[k]), M.reviver)); } catch (e) { /* skip */ } }
    if (!scope.has('M')) scope.set('M', 0);
    scope.set('Ans', LS.get('ans', 0) != null ? JSON.parse(JSON.stringify(LS.get('ans', 0)), M.reviver) : 0);
    scope.set('PreAns', 0);
    for (const def of LS.get('fns', [])) { try { M.evaluate(normalise(def), scope); } catch (e) { /* skip broken */ } }
  }
  function saveScope() {
    const vars = {};
    for (const [k, v] of scope) {
      if (k === 'Ans' || k === 'PreAns' || typeof v === 'function') continue;
      try { vars[k] = JSON.parse(JSON.stringify(v)); } catch (e) { /* skip */ }
    }
    LS.set('vars', vars);
    try { LS.set('ans', JSON.parse(JSON.stringify(scope.get('Ans')))); } catch (e) { /* skip */ }
  }
  function checkResult(v) {
    const t = M.typeOf(v);
    if (t === 'number' && !isFinite(v)) mathErr(Number.isNaN(v) ? 'Math ERROR: the answer is undefined (for example 0 ÷ 0).' : 'Math ERROR: the answer is too large or undefined (for example 1 ÷ 0 or 171!).');
    if (t === 'Complex') {
      if (!isFinite(v.re) || !isFinite(v.im)) mathErr('Math ERROR: the answer is too large or undefined.');
      if (S.cplx === 'real' && Math.abs(v.im) > 1e-14 * Math.max(1, Math.abs(v.re))) mathErr('No real answer. Tap ℝ in the display (it turns to a+bi) to see the complex answer.');
    }
  }
  function evaluateExpr(src, opt = {}) {
    const code = normalise(src).trim();
    if (!code) return null;
    const sc = opt.dry ? childScope(scope) : scope;
    let v;
    try { v = M.evaluate(code, sc); }
    catch (e) { throw new CalcError(friendlyError(e, code)); }
    if (M.typeOf(v) === 'ResultSet') { const ents = v.entries; v = ents.length ? ents[ents.length - 1] : undefined; }
    if (M.typeOf(v) !== 'function') checkResult(v);
    v = cleanDeep(v);
    if (M.typeOf(v) === 'Complex' && S.cplx === 'real') v = v.re;
    return { value: v, code };
  }

  // ---------- KaTeX natural display (lazy, optional) ----------
  let katexState = 'idle';
  function loadKatex() {
    if (katexState !== 'idle') return;
    katexState = 'loading';
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = 'https://cdn.jsdelivr.net/npm/katex@0.19.0/dist/katex.min.css';
    document.head.appendChild(l);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/katex@0.19.0/dist/katex.min.js';
    s.onload = () => { katexState = 'ready'; renderNatural(); };
    s.onerror = () => { katexState = 'failed'; };
    document.head.appendChild(s);
  }
  function texOf(code) {
    try { return M.parse(code).toTex({ parenthesis: 'auto', implicit: 'hide' }).replace(/\\mathrm\{(deg)\}/g, '^{\\circ}'); } catch (e) { return null; }
  }
  function renderTex(el, tex) {
    if (katexState !== 'ready' || !tex) { el.textContent = ''; return false; }
    try { window.katex.render(tex, el, { throwOnError: false, displayMode: false }); return true; } catch (e) { el.textContent = ''; return false; }
  }

  // ---------- UI helpers ----------
  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms);
  }
  function fmtDate(ts) {
    const d = new Date(ts);
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }).formatToParts(d);
    const g = (k) => (parts.find((p) => p.type === k) || {}).value || '';
    return `${g('day')} ${g('month')} ${g('year')}, ${g('weekday')}, ${g('hour')}:${g('minute')}:${g('second')} ${g('dayPeriod').toUpperCase()}`;
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('Copied: ' + t); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied: ' + t); } catch (e2) { toast('Could not copy. Select the text and copy it.'); }
      ta.remove();
    }
  }
  const buzz = () => { if (S.haptic && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* not allowed */ } } };

  // ---------- overlays: ✕, Esc, tap outside and the phone Back button all close the top layer ----------
  const layers = [];
  let popWaiters = [];
  function sheetHead(title) { return `<div class="sheet-h"><h2>${title}</h2><button type="button" class="iconbtn" data-close aria-label="Close"><svg class="i"><use href="#i-x"/></svg></button></div>`; }
  function openLayer(html, opt = {}) {
    const el = document.createElement('div');
    el.className = 'layer' + (opt.drawer ? ' drawer' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = html;
    $('#layerRoot').appendChild(el);
    layers.push({ el, opt });
    document.body.classList.add('layer-open');
    history.pushState({ iscLayer: layers.length }, '');
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) closeTop(); });
    setTimeout(() => { const f = el.querySelector('[autofocus]') || el.querySelector('[data-close]'); if (f) f.focus({ preventScroll: true }); }, 30);
    return el;
  }
  function removeTop() {
    const l = layers.pop(); if (!l) return;
    l.el.remove();
    if (l.opt.onClose) l.opt.onClose();
    if (!layers.length) document.body.classList.remove('layer-open');
  }
  function closeTop() {
    if (!layers.length) return Promise.resolve();
    return new Promise((res) => { popWaiters.push(res); history.back(); });
  }
  window.addEventListener('popstate', () => {
    if (layers.length) removeTop();
    const w = popWaiters; popWaiters = []; w.forEach((f) => f());
  });
  function confirmBox(title, text, okLabel = 'OK', danger = false) {
    return new Promise((res) => {
      let answered = false;
      const el = openLayer(`<div class="sheet" style="max-width:520px">${sheetHead(title)}<div class="sheet-b"><p style="margin:4px 0">${text}</p></div><div class="sheet-f"><button type="button" class="btn ghost" data-close>Cancel</button><button type="button" class="btn ${danger ? 'danger' : ''}" id="cfOk">${okLabel}</button></div></div>`, { onClose: () => { if (!answered) res(false); } });
      el.querySelector('#cfOk').addEventListener('click', () => { answered = true; closeTop().then(() => res(true)); });
    });
  }

  // ---------- tabs ----------
  const tabs = {};
  let currentTab = null;
  function registerTab(name, def) { tabs[name] = Object.assign({ ready: false }, def); }
  function goTab(name, push) {
    if (!$('#view-' + name)) name = 'calc';
    $$('.view').forEach((v) => v.classList.toggle('on', v.dataset.view === name));
    $$('#tabs button').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('on', on); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); });
    const t = tabs[name];
    if (t && !t.ready) { t.ready = true; try { t.init($('#view-' + name)); } catch (e) { console.error(e); $('#view-' + name).innerHTML = `<div class="card"><div class="msg err">This part could not start: ${esc(e.message)}. <button class="btn ghost" onclick="location.reload()">Try again</button></div></div>`; } }
    if (t && t.show) t.show();
    currentTab = name;
    LS.set('tab', name);
    const h = '#tab=' + name;
    if (location.hash !== h) history.replaceState(history.state, '', h);
    if (push !== false) window.scrollTo({ top: 0 });
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) goTab(b.dataset.tab); });
  window.addEventListener('hashchange', () => { const m = location.hash.match(/tab=(\w+)/); if (m && m[1] !== currentTab) goTab(m[1]); });

  // ---------- Calculate tab ----------
  const exprEl = $('#expr');
  const resEl = $('#result');
  const subEl = $('#resultSub');
  let last = null;           // { src, value, fmt, exact }
  let justEvaluated = false;
  let sdState = 0;           // 0 = default view, 1 = the other form, 2 = mixed number
  let shift = false, hyp = false;
  let history_ = LS.get('history', []);

  const autoSize = () => { exprEl.style.height = 'auto'; exprEl.style.height = exprEl.scrollHeight + 2 + 'px'; };
  function setExpr(s, caret) { exprEl.value = s; const c = caret == null ? s.length : caret; exprEl.setSelectionRange(c, c); autoSize(); onExprChange(); }
  function insertAtCaret(text, back = 0) {
    if (justEvaluated) {
      justEvaluated = false;
      if (/^[+×÷−\-*/^%²³⁻!]|^mod\b|^×10\^/.test(text) && last) { setExpr('Ans'); }
      else setExpr('');
    }
    const s = exprEl.value, a = exprEl.selectionStart ?? s.length, b = exprEl.selectionEnd ?? s.length;
    const ns = s.slice(0, a) + text + s.slice(b);
    setExpr(ns, a + text.length - back);
  }
  const TOKENS = ['sinh⁻¹(', 'cosh⁻¹(', 'tanh⁻¹(', 'sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'sinh(', 'cosh(', 'tanh(', 'sin(', 'cos(', 'tan(', 'log(', 'ln(', 'abs(', 'nthRoot(', 'nPr(', 'nCr(', 'round(', '√(', '∛(', '∫(', 'd/dx(', 'Σ(', 'Π(', '×10^', 'Ans', 'PreAns', 'mod', '⁻¹'];
  function backspace() {
    justEvaluated = false;
    const s = exprEl.value, a = exprEl.selectionStart, b = exprEl.selectionEnd;
    if (a !== b) { setExpr(s.slice(0, a) + s.slice(b), a); return; }
    if (a === 0) return;
    const before = s.slice(0, a);
    const tok = TOKENS.find((t) => before.endsWith(t));
    const n = tok ? tok.length : (/[\uD800-\uDBFF]/.test(before[a - 2] || '') ? 2 : 1);
    setExpr(s.slice(0, a - n) + s.slice(a), a - n);
  }
  function clearAll() { justEvaluated = false; last = null; setExpr(''); paintResult(null); }
  function negate() {
    if (justEvaluated) { justEvaluated = false; setExpr('−(Ans)'); return; }
    const s = exprEl.value, a = exprEl.selectionStart;
    let i = a; while (i > 0 && /[\d.]/.test(s[i - 1])) i--;
    if (i === a) { insertAtCaret('−'); return; }
    const prev = s[i - 1], prev2 = s[i - 2];
    if (prev === '−' && (i - 1 === 0 || /[(+×÷−*/^,]/.test(prev2 || ''))) setExpr(s.slice(0, i - 1) + s.slice(i), a - 1);
    else setExpr(s.slice(0, i) + '−' + s.slice(i), a + 1);
  }
  function onExprChange() {
    renderNatural();
    clearTimeout(onExprChange._t);
    onExprChange._t = setTimeout(livePreview, 120);
  }
  function renderNatural() {
    const el = $('#natural');
    const src = exprEl.value.trim();
    if (!src || src.length > 400) { el.textContent = ''; return; }
    const code = normalise(src);
    if (/[=]/.test(code.replace(/[<>!=]=/g, ''))) { el.textContent = ''; return; }
    renderTex(el, texOf(code));
  }
  function livePreview() {
    if (justEvaluated) return;
    const src = exprEl.value.trim();
    if (!src) { if (!last) paintResult(null); return; }
    const code = normalise(src);
    if (/ran|random|pickRandom|\b\w+\s*\(.*\)\s*=|(^|[^<>!=])=([^=]|$)/.test(code)) return;
    try {
      const r = evaluateExpr(src, { dry: true });
      if (r && M.typeOf(r.value) !== 'function') {
        const f = fmtValue(r.value);
        resEl.className = 'result preview'; resEl.innerHTML = f.html; subEl.textContent = '';
      }
    } catch (e) { /* silent while typing */ }
  }
  function paintResult(st) {
    if (!st) { resEl.className = 'result'; resEl.innerHTML = '<span class="muted">0</span>'; subEl.innerHTML = ''; return; }
    if (st.error) { resEl.className = 'result err'; resEl.textContent = st.error; subEl.innerHTML = ''; return; }
    resEl.className = 'result';
    const v = st.value, f = st.fmt, ex = st.exact;
    if (ex) {
      const exactMain = S.exactFirst && !/\d\.\d|\.\d/.test(st.src);
      const forms = [{ html: f.html, label: 'decimal' }, { html: ex.html, label: 'exact' }];
      if (ex.mixed) forms.push({ html: ex.mixed.html, label: 'mixed number' });
      let mainIdx = exactMain ? 1 : 0;
      if (sdState === 1) mainIdx = exactMain ? 0 : 1;
      if (sdState === 2 && ex.mixed) mainIdx = 2;
      resEl.innerHTML = forms[mainIdx].html;
      subEl.innerHTML = forms.filter((_x, i) => i !== mainIdx).map((x) => `<span title="${x.label}">${x.label === 'decimal' ? '≈ ' : '= '}${x.html}</span>`).join('&nbsp;&nbsp;&nbsp;');
    } else {
      resEl.innerHTML = f.html;
      subEl.innerHTML = '';
      if (typeof v === 'number' && S.fmt !== 'norm' && isFinite(v)) subEl.innerHTML = '= ' + fmtNum(v, { mode: 'norm' }).html;
    }
  }
  function equals() {
    const src = exprEl.value.trim();
    if (!src) { if (last) { setExpr(last.src); return equals(); } return; }
    let r;
    try { r = evaluateExpr(src); }
    catch (e) { justEvaluated = false; paintResult({ error: e.message }); buzz(); return; }
    if (!r) return;
    const t = M.typeOf(r.value);
    if (t === 'function') {
      const fnsList = LS.get('fns', []).filter((d) => !d.startsWith(src.split('=')[0].trim()));
      fnsList.push(src); LS.set('fns', fnsList.slice(-30));
      paintResult({ value: null, fmt: { html: `<span class="muted">Saved ${esc(src.split('=')[0].trim())}. Now type, for example, ${esc(src.split('(')[0].trim())}(2)</span>`, text: '' } });
      justEvaluated = true;
      addHistory(src, '', 'saved');
      saveScope();
      return;
    }
    const isAssign = /^\s*[A-Za-z]\w*\s*=(?!=)/.test(r.code);
    scope.set('PreAns', scope.get('Ans'));
    if (t !== 'undefined' && t !== 'null' && t !== 'string') scope.set('Ans', r.value);
    const f = fmtValue(r.value);
    const ex = typeof r.value === 'number' ? exactOf(r.value) : null;
    last = { src, value: r.value, fmt: f, exact: ex };
    sdState = 0;
    paintResult(last);
    justEvaluated = true;
    addHistory(src, f.text, f.html, ex);
    if (isAssign) toast(`Stored ${r.code.split('=')[0].trim()} = ${f.text}`);
    saveScope();
    paintMem();
    renderVars();
  }
  function addHistory(e, text, html, ex) {
    history_.unshift({ e, r: text, h: html, x: ex ? ex.html : null, t: Date.now() });
    history_ = history_.slice(0, 200);
    LS.set('history', history_);
    renderHistory();
  }
  function renderHistory(target) {
    const box = target || $('#histList');
    if (!history_.length) { box.innerHTML = '<div class="empty">Nothing here yet. Your sums and answers appear here, newest first. Tap one to use it again.</div>'; return; }
    box.innerHTML = history_.map((h, i) => `<div class="hist-item" data-i="${i}">
      <button type="button" class="lnk he" data-act="expr" title="Put this sum back in the display">${esc(h.e)}</button>
      <button type="button" class="lnk hr" data-act="ans" title="Insert this answer">${h.h === 'saved' ? '<span class="muted">function saved</span>' : '= ' + (h.x ? h.x + ' <span class="muted">≈ ' + h.h + '</span>' : h.h)}</button>
      <span class="ht">${fmtDate(h.t)}</span>
      <span class="acts"><button type="button" class="iconbtn sm" data-act="del" aria-label="Delete this line" title="Delete"><svg class="i"><use href="#i-x"/></svg></button></span>
    </div>`).join('');
  }
  function histClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const it = b.closest('.hist-item'); const h = history_[+it.dataset.i]; if (!h) return;
    const act = b.dataset.act;
    if (act === 'del') { history_.splice(+it.dataset.i, 1); LS.set('history', history_); renderHistory(); const sb = b.closest('.sheet-b'); if (sb) renderHistory(sb); return; }
    const inSheet = !!b.closest('.layer');
    const go = () => {
      goTab('calc');
      if (act === 'expr') { justEvaluated = false; setExpr(h.e); }
      else if (h.r) insertAtCaret(h.r.includes('e') || /[+-]/.test(h.r.slice(1)) ? `(${h.r})` : h.r);
      exprEl.focus({ preventScroll: true });
    };
    if (inSheet) closeTop().then(go); else go();
  }
  async function clearHistory() {
    if (!history_.length) { toast('History is already empty.'); return; }
    if (!(await confirmBox('Clear all history?', `This deletes all ${history_.length} saved sums and answers on this device. It cannot be undone.`, 'Clear history', true))) return;
    history_ = []; LS.set('history', history_); renderHistory(); toast('History cleared.');
  }
  function openHistorySheet() {
    const el = openLayer(`<div class="sheet">${sheetHead('History')}<div class="sheet-b" id="histSheet"></div><div class="sheet-f"><button type="button" class="btn danger" id="hsClear"><svg class="i"><use href="#i-trash"/></svg>Clear all</button><button type="button" class="btn ghost" data-close>Close</button></div></div>`);
    const b = el.querySelector('#histSheet'); renderHistory(b);
    b.addEventListener('click', histClick);
    el.querySelector('#hsClear').addEventListener('click', async () => { await clearHistory(); renderHistory(b); });
  }

  // memory and variables
  function paintMem() { const m = scope.get('M'); $('#memChip').hidden = !m || (typeof m === 'number' && m === 0); }
  function currentValue() {
    if (justEvaluated && last) return last.value;
    const src = exprEl.value.trim();
    if (!src) return last ? last.value : scope.get('Ans');
    const r = evaluateExpr(src, { dry: true });
    return r ? r.value : 0;
  }
  function memOp(k) {
    try {
      if (k === 'MC') { scope.set('M', 0); toast('Memory cleared.'); }
      else if (k === 'MR') { insertAtCaret('M'); }
      else if (k === 'Ans') { insertAtCaret('Ans'); }
      else {
        const v = currentValue();
        scope.set('M', cleanDeep(k === 'M+' ? M.add(scope.get('M') || 0, v) : M.subtract(scope.get('M') || 0, v)));
        toast(`M = ${fmtValue(scope.get('M')).text}`);
        if (!justEvaluated && exprEl.value.trim()) equals();
      }
    } catch (e) { paintResult({ error: e.message }); }
    saveScope(); paintMem(); renderVars();
  }
  function renderVars(target) {
    const box = target || $('#varList');
    const cells = VAR_NAMES.map((n) => { const v = scope.has(n) ? scope.get(n) : null; return `<button type="button" class="var-cell" data-var="${n}"><b>${n === 'M' ? 'M (memory)' : n}</b><span>${v == null ? '<span class="muted">empty</span>' : fmtValue(v).html}</span></button>`; }).join('');
    const extra = [];
    for (const [k, v] of scope) if (!VAR_NAMES.includes(k) && k !== 'Ans' && k !== 'PreAns') extra.push(`<button type="button" class="var-cell" data-var="${esc(k)}"><b>${esc(k)}</b><span>${typeof v === 'function' ? esc(v.syntax || 'function') : fmtValue(v).html}</span></button>`);
    box.innerHTML = `<p class="hint" style="margin:0 0 8px">Tap a name to use it in a sum. To store the answer, tap <b>STO →</b>. You can also type <code>A = 5</code> or <code>f(x) = x² + 1</code>.</p>
      <div class="var-grid">${cells}${extra.join('')}<button type="button" class="var-cell" data-var="Ans"><b>Ans</b><span>${fmtValue(scope.get('Ans')).html}</span></button></div>
      <div class="row" style="margin-top:10px"><button type="button" class="btn danger" data-clearvars>Clear all variables</button></div>`;
  }
  async function varsClick(e) {
    if (e.target.closest('[data-clearvars]')) {
      if (!(await confirmBox('Clear all variables?', 'A–F, x, y, z, M and your saved functions will be emptied.', 'Clear', true))) return;
      for (const k of [...scope.keys()]) if (k !== 'Ans' && k !== 'PreAns') scope.delete(k);
      scope.set('M', 0); LS.set('fns', []); saveScope(); paintMem(); renderVars();
      const sb = $('#varSheet'); if (sb) renderVars(sb);
      return;
    }
    const b = e.target.closest('[data-var]'); if (!b) return;
    const inSheet = !!b.closest('.layer');
    const go = () => { goTab('calc'); insertAtCaret(b.dataset.var); };
    if (inSheet) closeTop().then(go); else go();
  }
  function openVarsSheet() {
    const el = openLayer(`<div class="sheet">${sheetHead('Memory &amp; variables')}<div class="sheet-b" id="varSheet"></div></div>`);
    const b = el.querySelector('#varSheet'); renderVars(b); b.addEventListener('click', varsClick);
  }
  function openStoSheet() {
    let v;
    try { v = currentValue(); } catch (e) { paintResult({ error: e.message }); return; }
    if (v == null) { toast('Work out an answer first.'); return; }
    const f = fmtValue(v);
    const el = openLayer(`<div class="sheet">${sheetHead('Store the answer in…')}<div class="sheet-b"><p style="margin:0 0 10px">Answer: <b class="mono">${f.html}</b></p><div class="var-grid">${VAR_NAMES.map((n) => `<button type="button" class="var-cell" data-sto="${n}"><b>${n}</b><span>${scope.has(n) ? fmtValue(scope.get(n)).html : '<span class="muted">empty</span>'}</span></button>`).join('')}</div></div></div>`);
    el.querySelector('.sheet-b').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sto]'); if (!b) return;
      scope.set(b.dataset.sto, v); saveScope(); paintMem(); renderVars();
      closeTop().then(() => toast(`Stored ${b.dataset.sto} = ${f.text}`));
    });
  }

  // keypads
  const BASIC = [
    { l: '%', i: '%', c: 'fn' }, { l: '√', i: '√(', c: 'fn' }, { l: 'x<sup>2</sup>', i: '²', c: 'fn' }, { l: '±', a: 'neg', c: 'fn' },
    { l: 'AC', a: 'clear', c: 'ac' }, { l: '(', i: '(', c: 'fn' }, { l: ')', i: ')', c: 'fn' }, { l: '÷', i: '÷', c: 'op' },
    { l: '7', i: '7' }, { l: '8', i: '8' }, { l: '9', i: '9' }, { l: '×', i: '×', c: 'op' },
    { l: '4', i: '4' }, { l: '5', i: '5' }, { l: '6', i: '6' }, { l: '−', i: '−', c: 'op' },
    { l: '1', i: '1' }, { l: '2', i: '2' }, { l: '3', i: '3' }, { l: '+', i: '+', c: 'op' },
    { l: '0', i: '0' }, { l: '.', i: '.' }, { l: '⌫', a: 'back', c: 'fn', t: 'Delete' }, { l: '=', a: 'eq', c: 'eq' }
  ];
  const SCI = [
    { l: '2nd', a: 'shift', c: 'fn shift', t: 'Second functions (yellow labels)' }, { l: 'hyp', a: 'hyp', c: 'fn', t: 'Hyperbolic: sinh, cosh, tanh' },
    { l: 'π', i: 'π', c: 'fn', l2: 'e', i2: 'e' }, { l: 'n!', i: '!', c: 'fn', l2: 'x⁻¹', i2: '⁻¹' }, { l: 'nPr', i: 'nPr(', c: 'fn', l2: 'nCr', i2: 'nCr(' },
    { l: 'sin', i: 'sin(', c: 'fn', l2: 'sin⁻¹', i2: 'sin⁻¹(', h: 'sinh(', h2: 'sinh⁻¹(' },
    { l: 'cos', i: 'cos(', c: 'fn', l2: 'cos⁻¹', i2: 'cos⁻¹(', h: 'cosh(', h2: 'cosh⁻¹(' },
    { l: 'tan', i: 'tan(', c: 'fn', l2: 'tan⁻¹', i2: 'tan⁻¹(', h: 'tanh(', h2: 'tanh⁻¹(' },
    { l: 'ln', i: 'ln(', c: 'fn', l2: 'eˣ', i2: 'e^(' }, { l: 'log', i: 'log(', c: 'fn', l2: '10ˣ', i2: '10^(' },
    { l: 'x<sup>2</sup>', i: '²', c: 'fn', l2: 'x³', i2: '³' }, { l: 'x<sup>y</sup>', i: '^', c: 'fn', l2: 'ʸ√x', i2: 'nthRoot(', t: 'Power' },
    { l: '√', i: '√(', c: 'fn', l2: '∛', i2: '∛(' }, { l: '(', i: '(', c: 'fn' }, { l: ')', i: ')', c: 'fn' },
    { l: ',', i: ', ', c: 'fn', l2: 'x', i2: 'x', t: 'Comma between values' }, { l: '%', i: '%', c: 'fn', l2: 'mod', i2: ' mod ' },
    { l: '|x|', i: 'abs(', c: 'fn', l2: 'Rnd', i2: 'round(' }, { l: '°', i: '°', c: 'fn', l2: 'i', i2: 'i', t: 'Degrees' },
    { l: '×10<sup>x</sup>', i: '×10^', c: 'fn', l2: 'Ran#', i2: 'ran()' },
    { l: '7', i: '7' }, { l: '8', i: '8' }, { l: '9', i: '9' }, { l: '⌫', a: 'back', c: 'fn', t: 'Delete' }, { l: 'AC', a: 'clear', c: 'ac' },
    { l: '4', i: '4' }, { l: '5', i: '5' }, { l: '6', i: '6' }, { l: '×', i: '×', c: 'op' }, { l: '÷', i: '÷', c: 'op' },
    { l: '1', i: '1' }, { l: '2', i: '2' }, { l: '3', i: '3' }, { l: '+', i: '+', c: 'op' }, { l: '−', i: '−', c: 'op' },
    { l: '0', i: '0' }, { l: '.', i: '.' }, { l: '±', a: 'neg', c: 'fn', l2: 'S⇔D', a2: 'sd' }, { l: 'Ans', i: 'Ans', c: 'fn', l2: 'PreAns', i2: 'PreAns' }, { l: '=', a: 'eq', c: 'eq' }
  ];
  function renderPad() {
    const pad = $('#pad');
    const keys = S.pad === 'basic' ? BASIC : SCI;
    pad.className = 'pad ' + (S.pad === 'basic' ? 'basic' : 'sci');
    pad.innerHTML = keys.map((k, idx) => `<button type="button" class="k ${k.c || ''}" data-idx="${idx}"${k.l2 ? ' data-k2="1"' : ''} title="${esc(k.t || (k.l2 ? k.l.replace(/<[^>]+>/g, '') + ' · 2nd: ' + k.l2 : k.l.replace(/<[^>]+>/g, '')))}">${k.l2 ? `<span class="alt">${k.l2}</span>` : ''}<span class="main">${k.l}</span></button>`).join('');
    $$('.seg [data-pad]').forEach((b) => b.classList.toggle('on', b.dataset.pad === S.pad));
    setShift(false); setHyp(false);
  }
  function setShift(on) { shift = on; document.body.classList.toggle('shift-on', on); $('#shiftChip').hidden = !on && !hyp; $('#shiftChip').textContent = [on ? '2nd' : '', hyp ? 'hyp' : ''].filter(Boolean).join(' · '); const b = $('#pad .shift'); if (b) b.classList.toggle('on', on); }
  function setHyp(on) { hyp = on; const b = $$('#pad .k').find((x) => x.textContent === 'hyp'); if (b) b.classList.toggle('pill', false); if (b) b.style.outline = on ? '2px solid var(--key-shift)' : ''; setShift(shift); }
  function pressKey(k) {
    buzz();
    if (k.a === 'shift') { setShift(!shift); return; }
    if (k.a === 'hyp') { setHyp(!hyp); return; }
    const useShift = shift && (k.l2 != null);
    let ins = useShift ? k.i2 : k.i, act = useShift ? k.a2 : k.a;
    if (hyp && k.h) ins = shift ? k.h2 : k.h;
    if (k.a && !useShift) act = k.a;
    setShift(false); if (k.h || k.a === 'eq') setHyp(false);
    if (act === 'eq') equals();
    else if (act === 'clear') clearAll();
    else if (act === 'back') backspace();
    else if (act === 'neg') negate();
    else if (act === 'sd') toggleSD();
    else if (ins != null) insertAtCaret(ins);
    if (!matchMedia('(pointer: coarse)').matches || exprEl.inputMode !== 'none') exprEl.focus({ preventScroll: true });
  }
  $('#pad').addEventListener('click', (e) => {
    const b = e.target.closest('.k'); if (!b) return;
    const keys = S.pad === 'basic' ? BASIC : SCI;
    pressKey(keys[+b.dataset.idx]);
  });
  $('.memrow').addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { buzz(); memOp(b.dataset.k); } });
  $$('.seg [data-pad]').forEach((b) => b.addEventListener('click', () => { S.pad = b.dataset.pad; saveSettings(); renderPad(); }));

  function toggleSD() {
    if (!last || !last.exact) { toast(last ? 'This answer has no simpler exact form.' : 'Work out an answer first.'); return; }
    sdState = (sdState + 1) % (last.exact.mixed ? 3 : 2);
    paintResult(last);
  }
  function showAlt(kind) {
    if (!last || typeof last.value !== 'number') { toast('Work out a number first.'); return; }
    const v = last.value;
    if (kind === 'eng') { subEl.innerHTML = '= ' + fmtNum(v, { mode: 'eng' }).html; return; }
    const neg = v < 0; let a = Math.abs(v);
    let d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf + 1e-9), s = (mf - m) * 60;
    s = Math.round(s * 100) / 100; if (s >= 60) { s -= 60; m++; } if (m >= 60) { m -= 60; d++; }
    subEl.innerHTML = `= ${neg ? '−' : ''}${d}° ${m}′ ${s}″`;
  }

  // display chips
  const ANGLES = ['deg', 'rad', 'grad'];
  function paintChips() {
    $('#angleChip').textContent = S.angle.toUpperCase();
    $('#fmtChip').textContent = S.fmt === 'norm' ? 'Norm' : S.fmt === 'eng' ? 'Eng' : `${S.fmt === 'fix' ? 'Fix' : 'Sci'} ${S.digits}`;
    $('#cplxChip').textContent = S.cplx === 'real' ? 'ℝ' : S.cplx === 'polar' ? 'r∠θ' : 'a+bi';
    $('#cplxChip').title = S.cplx === 'real' ? 'Real numbers only: tap for complex numbers' : 'Complex numbers on: tap to change';
  }
  function repaintLast() { if (last && last.value != null) { last.fmt = fmtValue(last.value); paintResult(last); } renderHistory(); renderVars(); }
  $('#angleChip').addEventListener('click', () => { S.angle = ANGLES[(ANGLES.indexOf(S.angle) + 1) % 3]; ANG = S.angle; saveSettings(); paintChips(); toast('Angles in ' + ({ deg: 'degrees', rad: 'radians', grad: 'gradians' })[S.angle]); if (exprEl.value.trim()) { justEvaluated = false; livePreview(); } });
  $('#cplxChip').addEventListener('click', () => { S.cplx = S.cplx === 'real' ? 'rect' : S.cplx === 'rect' ? 'polar' : 'real'; saveSettings(); paintChips(); toast(S.cplx === 'real' ? 'Real numbers only' : S.cplx === 'rect' ? 'Complex numbers on (a + bi). Type i with 2nd + °.' : 'Complex answers in polar form (r ∠ θ)'); repaintLast(); });
  $('#fmtChip').addEventListener('click', openFormatSheet);
  function openFormatSheet() {
    const el = openLayer(`<div class="sheet">${sheetHead('Number format')}<div class="sheet-b">
      <div class="subtabs" id="fmtModes">${[['norm', 'Normal'], ['fix', 'Fix (decimal places)'], ['sci', 'Sci (significant digits)'], ['eng', 'Engineering']].map(([k, l]) => `<button type="button" class="pill ${S.fmt === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <label class="field" id="digRow" ${S.fmt === 'fix' || S.fmt === 'sci' ? '' : 'hidden'}><span>Digits</span><select class="inp" id="digSel">${Array.from({ length: 11 }, (_x, i) => i).map((i) => `<option value="${i}" ${S.digits === i ? 'selected' : ''}>${i}</option>`).join('')}</select></label>
      <p class="hint">Normal shows up to 12 significant digits. Fix rounds to a number of decimal places, Sci shows a×10ⁿ, Engineering uses powers of 10 in steps of 3 (kilo, mega, milli…).</p>
      <h3 style="margin-top:14px">Digit grouping</h3>
      <div class="subtabs" id="grpModes">${[['intl', '1,234,567'], ['indian', '12,34,567 (Indian)'], ['none', '1234567']].map(([k, l]) => `<button type="button" class="pill ${S.group === k ? 'on' : ''}" data-g="${k}">${l}</button>`).join('')}</div>
    </div><div class="sheet-f"><button type="button" class="btn" data-close>Done</button></div></div>`, { onClose: () => { paintChips(); repaintLast(); } });
    el.querySelector('#fmtModes').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; S.fmt = b.dataset.f; if (S.fmt === 'sci' && S.digits === 0) S.digits = 4; saveSettings(); $$('#fmtModes .pill', el).forEach((x) => x.classList.toggle('on', x === b)); el.querySelector('#digRow').hidden = !(S.fmt === 'fix' || S.fmt === 'sci'); });
    el.querySelector('#digSel').addEventListener('change', (e) => { S.digits = +e.target.value; saveSettings(); });
    el.querySelector('#grpModes').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; S.group = b.dataset.g; saveSettings(); $$('#grpModes .pill', el).forEach((x) => x.classList.toggle('on', x === b)); });
  }

  // function catalogue
  const CATALOG = [
    ['Basics', [['Square root', '√(', '√(16) = 4'], ['Cube root', '∛(', '∛(27) = 3'], ['n-th root', 'nthRoot(', 'nthRoot(32, 5) = 2'], ['Power', '^', '2^10 = 1024'], ['Square', '²', '5² = 25'], ['Reciprocal', '⁻¹', '4⁻¹ = 0.25'], ['Percent', '%', '80 × 15% = 12;  200 + 10% = 220'], ['Absolute value', 'abs(', 'abs(−7) = 7'], ['Remainder (mod)', ' mod ', '17 mod 5 = 2'], ['Factorial', '!', '5! = 120'], ['Scientific notation ×10ⁿ', '×10^', '3×10^8']]],
    ['Rounding & numbers', [['Round', 'round(', 'round(3.14159, 2) = 3.14'], ['Round down (floor)', 'floor(', 'floor(2.7) = 2'], ['Round up (ceil)', 'ceil(', 'ceil(2.1) = 3'], ['Integer part', 'fix(', 'fix(−2.7) = −2'], ['HCF / GCD', 'hcf(', 'hcf(84, 36) = 12'], ['LCM', 'lcm(', 'lcm(4, 6) = 12'], ['Prime factors', 'factors(', 'factors(360) = 2^3 × 3^2 × 5'], ['Is prime?', 'isPrime(', 'isPrime(97) = true'], ['Sign', 'sign(', 'sign(−3) = −1']]],
    ['Trigonometry (uses DEG / RAD / GRAD)', [['sin', 'sin(', 'sin(30) = 0.5 in DEG'], ['cos', 'cos(', 'cos(60) = 0.5'], ['tan', 'tan(', 'tan(45) = 1'], ['sin⁻¹', 'sin⁻¹(', 'sin⁻¹(0.5) = 30'], ['cos⁻¹', 'cos⁻¹(', ''], ['tan⁻¹', 'tan⁻¹(', ''], ['sec', 'sec(', 'sec(60) = 2'], ['cosec', 'csc(', 'csc(30) = 2'], ['cot', 'cot(', 'cot(45) = 1'], ['Degrees symbol', '°', 'sin(30°) works in any mode'], ['Degrees, minutes, seconds', 'dms(', 'dms(30, 15, 0) = 30.25'], ['Polar from x, y', 'pol(', 'pol(3, 4) = [5, 53.13]'], ['Rectangular from r, θ', 'rec(', 'rec(2, 60) = [1, 1.732]'], ['Degrees → radians', 'torad(', 'torad(180) = π'], ['Radians → degrees', 'todeg(', 'todeg(π) = 180']]],
    ['Hyperbolic', [['sinh', 'sinh(', ''], ['cosh', 'cosh(', ''], ['tanh', 'tanh(', ''], ['sinh⁻¹', 'sinh⁻¹(', ''], ['cosh⁻¹', 'cosh⁻¹(', ''], ['tanh⁻¹', 'tanh⁻¹(', '']]],
    ['Logs & exponentials', [['log base 10', 'log(', 'log(1000) = 3'], ['Natural log', 'ln(', 'ln(e) = 1'], ['log any base', 'log(', 'log(8, 2) = 3'], ['e to the power', 'e^(', 'e^(1) = 2.718…'], ['10 to the power', '10^(', '10^(3) = 1000'], ['log base 2', 'log2(', 'log2(8) = 3']]],
    ['Probability', [['Permutations nPr', 'nPr(', 'nPr(5, 2) = 20'], ['Combinations nCr', 'nCr(', 'nCr(5, 2) = 10'], ['Random 0–1', 'ran()', 'Ran#'], ['Random whole number', 'ranInt(', 'ranInt(1, 6) — a dice'], ['Gamma', 'gamma(', 'gamma(5) = 24']]],
    ['Complex numbers (switch ℝ → a+bi)', [['i', 'i', '(2 + 3i)(1 − i) = 5 + i'], ['Real part', 're(', ''], ['Imaginary part', 'im(', ''], ['Argument (angle)', 'arg(', ''], ['Conjugate', 'conj(', ''], ['Modulus', 'abs(', 'abs(3 + 4i) = 5']]],
    ['Lists & statistics', [['Mean', 'mean(', 'mean(2, 4, 9) = 5'], ['Median', 'median(', ''], ['Mode', 'mode(', ''], ['Std deviation (sample)', 'std(', ''], ['Variance (sample)', 'variance(', ''], ['Sum', 'sum(', 'sum(1, 2, 3) = 6'], ['Minimum', 'min(', ''], ['Maximum', 'max(', '']]],
    ['Calculus', [['Integral ∫', '∫(', '∫(x², x, 0, 3) = 9'], ['Derivative at a point', 'd/dx(', 'd/dx(x³, x, 2) = 12'], ['Summation Σ', 'Σ(', 'Σ(k², k, 1, 10) = 385'], ['Product Π', 'Π(', 'Π(k, k, 1, 5) = 120'], ['Limit', 'limit(', 'limit(sin(x)/x, x, 0) = 1 (RAD)'], ['Solve near a guess', 'solve(', 'solve(x³ − 2x − 5, x, 2) = 2.0946']]],
    ['Matrices & vectors (type [ ])', [['Matrix', '[[1, 2], [3, 4]]', 'det([[1,2],[3,4]]) = −2'], ['Determinant', 'det(', ''], ['Inverse', 'inv(', ''], ['Transpose', 'transpose(', ''], ['Dot product', 'dot(', 'dot([1,2,3],[4,5,6]) = 32'], ['Cross product', 'cross(', ''], ['Length of a vector', 'norm(', 'norm([3, 4]) = 5']]],
    ['Units (type “to”)', [['Convert units', ' to ', '10 inch to cm = 25.4 cm'], ['Kilometre', ' km', ''], ['Mile', ' mile', ''], ['Kilogram', ' kg', ''], ['Degrees Celsius', ' degC', '100 degC to degF'], ['Cent (land)', ' cent', '1 acre to cent = 100']]]
  ];
  function openFnSheet() {
    const el = openLayer(`<div class="sheet">${sheetHead('Functions')}<div class="sheet-b"><input class="inp" id="fnSearch" placeholder="Search, e.g. root, log, nCr" autocomplete="off" aria-label="Search functions"><div id="fnList"></div></div></div>`);
    const list = el.querySelector('#fnList');
    const paint = (q) => {
      q = (q || '').toLowerCase().trim();
      list.innerHTML = CATALOG.map(([g, items]) => {
        const its = items.filter(([n, ins, ex]) => !q || (n + ' ' + ins + ' ' + ex + ' ' + g).toLowerCase().includes(q));
        if (!its.length) return '';
        return `<div class="grp-h">${esc(g)}</div><div class="list">${its.map(([n, ins, ex]) => `<div class="list-item"><div class="t">${esc(n)} <span class="mono muted">${esc(ins.trim())}</span></div><div class="s">${esc(ex)}</div><div class="acts"><button type="button" class="pill" data-ins="${esc(ins)}">Insert</button></div></div>`).join('')}</div>`;
      }).join('') || '<div class="empty">No function matches. Try another word.</div>';
    };
    paint('');
    el.querySelector('#fnSearch').addEventListener('input', (e) => paint(e.target.value));
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-ins]'); if (!b) return; const ins = b.dataset.ins; closeTop().then(() => { goTab('calc'); insertAtCaret(ins); exprEl.focus({ preventScroll: true }); }); });
  }

  // examples
  const EXAMPLES = ['2(3+4)²', '1/3 + 1/4', 'sin(30) + cos(60)', '80 × 15%', '√(50)', '5! ÷ nCr(5, 2)', 'log(1000) + ln(e²)', '∫(x², x, 0, 3)', 'Σ(k², k, 1, 10)', 'hcf(84, 36)', 'factors(360)', '10 inch to cm', 'f(x) = x² + 1', 'det([[2, 1], [5, 3]])'];
  $('#examples').innerHTML = EXAMPLES.map((x) => `<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join('');
  $('#examples').addEventListener('click', (e) => { const b = e.target.closest('[data-ex]'); if (!b) return; justEvaluated = false; setExpr(b.dataset.ex); equals(); });

  // side panel
  $$('.side-head [data-side]').forEach((b) => b.addEventListener('click', () => {
    $$('.side-head [data-side]').forEach((x) => x.classList.toggle('on', x === b));
    $('#histList').hidden = b.dataset.side !== 'hist'; $('#varList').hidden = b.dataset.side !== 'vars'; $('#histClear').hidden = b.dataset.side !== 'hist';
  }));
  $('#histList').addEventListener('click', histClick);
  $('#varList').addEventListener('click', varsClick);
  $('#histClear').addEventListener('click', clearHistory);
  $('#histBtn').addEventListener('click', openHistorySheet);
  $('#varsBtn').addEventListener('click', () => (matchMedia('(min-width: 1000px)').matches ? $('.side-head [data-side="vars"]').click() : openVarsSheet()));
  $('#fnBtn').addEventListener('click', openFnSheet);
  $('#stoBtn').addEventListener('click', openStoSheet);
  $('#sdBtn').addEventListener('click', toggleSD);
  $('#engBtn').addEventListener('click', () => showAlt('eng'));
  $('#dmsBtn').addEventListener('click', () => showAlt('dms'));
  $('#copyBtn').addEventListener('click', () => { if (!last || !last.fmt.text) { toast('Nothing to copy yet.'); return; } copyText(last.fmt.text); });
  $('#kbdBtn').addEventListener('click', () => {
    const on = exprEl.inputMode !== 'none';
    exprEl.inputMode = on ? 'none' : 'text';
    $('#kbdBtn').classList.toggle('on', !on);
    exprEl.blur(); setTimeout(() => exprEl.focus(), 50);
    toast(on ? 'Calculator keypad' : 'Phone keyboard on. Tap ⌨ again to hide it.');
  });
  if (!matchMedia('(pointer: coarse)').matches) exprEl.inputMode = 'text';
  exprEl.addEventListener('input', () => { justEvaluated = false; autoSize(); onExprChange(); });
  exprEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); equals(); }
    else if (justEvaluated && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); insertAtCaret(e.key === '*' ? '×' : e.key === '/' ? '÷' : e.key);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (layers.length) { e.preventDefault(); closeTop(); return; }
      if (currentTab === 'calc') { clearAll(); }
      return;
    }
    if (layers.length || currentTab !== 'calc' || e.ctrlKey || e.metaKey || e.altKey || e.target === exprEl) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    if (e.key.length === 1 && /[\d.+\-*/^()%!,a-zA-Z]/.test(e.key)) { e.preventDefault(); insertAtCaret(e.key === '*' ? '×' : e.key === '/' ? '÷' : e.key === '-' ? '−' : e.key); exprEl.focus({ preventScroll: true }); }
    else if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); }
    else if (e.key === 'Backspace') { e.preventDefault(); backspace(); }
  });

  // ---------- theme ----------
  function isDark() { const t = document.documentElement.getAttribute('data-theme'); return t ? t === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches; }
  function paintTheme() {
    const d = isDark();
    $('#themeTop').setAttribute('aria-checked', String(d));
    $('#themeTop').setAttribute('aria-label', d ? 'Dark theme on' : 'Light theme on');
    document.querySelector('meta[name="theme-color"]').content = d ? '#000000' : '#eef0f5';
    if (tabs.graph && tabs.graph.ready && tabs.graph.redraw) tabs.graph.redraw();
  }
  function toggleTheme() { const d = !isDark(); document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light'); LS.set('theme', null); try { localStorage.setItem('isc:theme', d ? 'dark' : 'light'); } catch (e) { /* blocked */ } paintTheme(); }
  $('#themeTop').addEventListener('click', toggleTheme);
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', paintTheme);

  // ---------- install ----------
  let deferredPrompt = null;
  const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function paintInstall() {
    const can = !isInstalled() && (deferredPrompt || isIOS());
    $('#installTop').hidden = !can;
    const dismissed = LS.get('installDismissed', 0);
    $('#installBanner').hidden = !can || (Date.now() - dismissed < 24 * 3600 * 1000);
    if (isIOS()) $('#installBannerText').textContent = 'Tap Share, then “Add to Home Screen”.';
  }
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; paintInstall(); });
  window.addEventListener('appinstalled', () => { deferredPrompt = null; paintInstall(); toast('Installed. Open IBI Scientific Calculator from your home screen.'); });
  async function doInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) { /* dismissed */ }
      deferredPrompt = null; paintInstall();
    } else if (isIOS()) {
      openLayer(`<div class="sheet">${sheetHead('Install on iPhone or iPad')}<div class="sheet-b"><ol class="help-list"><li>Tap the <b>Share</b> button in Safari (the square with an arrow).</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol></div></div>`);
    } else if (isInstalled()) toast('Already installed.');
    else toast('Open your browser menu (⋮) and choose “Install app” or “Add to Home screen”.');
  }
  $('#installTop').addEventListener('click', doInstall);
  $('#installBannerBtn').addEventListener('click', doInstall);
  $('#installBannerX').addEventListener('click', () => { LS.set('installDismissed', Date.now()); $('#installBanner').hidden = true; });

  // ---------- backup & restore ----------
  const dataProviders = {};
  function registerData(key, get, set) { dataProviders[key] = { get, set }; }
  function backupObj() {
    const data = { settings: S, history: history_, vars: LS.get('vars', {}), fns: LS.get('fns', []), ans: LS.get('ans', 0) };
    for (const k in dataProviders) { try { data[k] = dataProviders[k].get(); } catch (e) { /* skip */ } }
    return { app: 'ibi-scientific-calculator', version: VERSION, savedAt: new Date().toISOString(), data };
  }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify(backupObj(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `IBI-Scientific-Calculator-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup downloaded.');
  }
  function restoreBackup() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      let obj;
      try { obj = JSON.parse(await file.text()); } catch (e) { toast('That file is not a backup (not valid JSON).'); return; }
      if (!obj || obj.app !== 'ibi-scientific-calculator' || !obj.data) { toast('That file is not an IBI Scientific Calculator backup.'); return; }
      const d = obj.data;
      const ok = await confirmBox('Restore this backup?', `Backup from ${esc(fmtDate(obj.savedAt || Date.now()))} with ${(d.history || []).length} history lines. It replaces your current history, variables, settings and saved data in every tab.`, 'Restore', true);
      if (!ok) return;
      if (d.settings) LS.set('settings', d.settings);
      LS.set('history', Array.isArray(d.history) ? d.history.slice(0, 200) : []);
      LS.set('vars', d.vars || {}); LS.set('fns', d.fns || []); LS.set('ans', d.ans || 0);
      for (const k in dataProviders) if (d[k] != null) { try { dataProviders[k].set(d[k]); } catch (e) { /* skip */ } }
      toast('Restored. Reloading…');
      setTimeout(() => location.reload(), 700);
    };
    inp.click();
  }

  // ---------- menu / settings / help ----------
  function openMenu() {
    const el = openLayer(`<div class="sheet">${sheetHead('Menu')}<div class="sheet-b">
      <div class="set-sec"><h3>Angle unit</h3><div class="subtabs" data-set="angle">${ANGLES.map((a) => `<button type="button" class="pill ${S.angle === a ? 'on' : ''}" data-v="${a}">${({ deg: 'Degrees', rad: 'Radians', grad: 'Gradians' })[a]}</button>`).join('')}</div></div>
      <div class="set-sec"><h3>Answers</h3>
        <div class="subtabs" data-set="exactFirst"><button type="button" class="pill ${S.exactFirst ? 'on' : ''}" data-v="1">Exact first (½, √2, π)</button><button type="button" class="pill ${!S.exactFirst ? 'on' : ''}" data-v="0">Decimal first</button></div>
        <div class="subtabs" data-set="cplx"><button type="button" class="pill ${S.cplx === 'real' ? 'on' : ''}" data-v="real">Real only</button><button type="button" class="pill ${S.cplx === 'rect' ? 'on' : ''}" data-v="rect">Complex a+bi</button><button type="button" class="pill ${S.cplx === 'polar' ? 'on' : ''}" data-v="polar">Complex r∠θ</button></div>
        <button type="button" class="menu-btn" id="mFmt">Number format and digit grouping…</button>
      </div>
      <div class="set-sec"><h3>Keypad</h3>
        <div class="subtabs" data-set="pad"><button type="button" class="pill ${S.pad === 'basic' ? 'on' : ''}" data-v="basic">Basic (school)</button><button type="button" class="pill ${S.pad === 'sci' ? 'on' : ''}" data-v="sci">Scientific</button></div>
        <div class="subtabs" data-set="haptic"><button type="button" class="pill ${S.haptic ? 'on' : ''}" data-v="1">Vibrate on key press</button><button type="button" class="pill ${!S.haptic ? 'on' : ''}" data-v="0">No vibration</button></div>
      </div>
      <div class="set-sec"><h3>App</h3>
        <div class="switch-row menu-btn" style="cursor:default"><span class="grow">Dark theme</span><button type="button" class="switch" id="mTheme" role="switch" aria-checked="${isDark()}" aria-label="Dark theme"><span class="track"><span class="knob"></span></span></button></div>
        <button type="button" class="menu-btn" id="mInstall"><svg class="i"><use href="#i-install"/></svg>Install app</button>
        <button type="button" class="menu-btn" id="mShare"><svg class="i"><use href="#i-dl"/></svg>Share this app</button>
        <button type="button" class="menu-btn" id="mHelp"><svg class="i"><use href="#i-help"/></svg>How to use</button>
      </div>
      <div class="set-sec"><h3>Your data (this device)</h3>
        <button type="button" class="menu-btn" id="mBackup"><svg class="i"><use href="#i-dl"/></svg>Download backup</button>
        <button type="button" class="menu-btn" id="mRestore"><svg class="i"><use href="#i-ul"/></svg>Restore from backup</button>
        <button type="button" class="menu-btn" id="mReset" style="color:var(--bad)"><svg class="i"><use href="#i-trash"/></svg>Reset everything</button>
      </div>
      <div class="set-sec"><p class="hint" style="margin:0">IBI Scientific Calculator v${VERSION} · India Business International. Maths engine: math.js 15.2.0 (Apache-2.0). Textbook display: KaTeX 0.19.0 (MIT). Everything is worked out on your device; nothing is sent anywhere.</p></div>
    </div></div>`, { drawer: true, onClose: () => { paintChips(); renderPad(); repaintLast(); } });
    el.querySelectorAll('[data-set]').forEach((grp) => grp.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      const k = grp.dataset.set; let v = b.dataset.v;
      if (k === 'exactFirst' || k === 'haptic') v = v === '1';
      S[k] = v; if (k === 'angle') ANG = v;
      saveSettings();
      grp.querySelectorAll('.pill').forEach((x) => x.classList.toggle('on', x === b));
    }));
    el.querySelector('#mTheme').addEventListener('click', (e) => { toggleTheme(); e.currentTarget.setAttribute('aria-checked', String(isDark())); });
    el.querySelector('#mFmt').addEventListener('click', openFormatSheet);
    el.querySelector('#mInstall').addEventListener('click', () => closeTop().then(doInstall));
    el.querySelector('#mShare').addEventListener('click', () => closeTop().then(() => { if (window.IBIShare) window.IBIShare.open(); else copyText(location.origin + location.pathname); }));
    el.querySelector('#mHelp').addEventListener('click', () => closeTop().then(() => openHelp(currentTab)));
    el.querySelector('#mBackup').addEventListener('click', downloadBackup);
    el.querySelector('#mRestore').addEventListener('click', restoreBackup);
    el.querySelector('#mReset').addEventListener('click', async () => {
      if (!(await confirmBox('Reset everything?', 'History, variables, settings and the data in every tab will be deleted from this device. Download a backup first if you may need it.', 'Delete everything', true))) return;
      try { Object.keys(localStorage).filter((k) => k.startsWith('isc:')).forEach((k) => localStorage.removeItem(k)); } catch (e) { /* blocked */ }
      location.reload();
    });
  }
  $('#menuBtn').addEventListener('click', openMenu);

  const HELP = {
    calc: ['Tap keys or type with a keyboard. <b>=</b> (or Enter) works it out. The grey answer under the sum is a live preview.', '<b>2nd</b> gives the yellow function on a key (sin⁻¹, eˣ, 10ˣ, x³, nCr…). <b>hyp</b> turns sin/cos/tan into sinh/cosh/tanh.', 'Tap <b>DEG</b> to switch degrees, radians and gradians. <b>Norm</b> sets Fix, Sci or Engineering format and Indian digit grouping (12,34,567).', '<b>S⇔D</b> switches the answer between decimal, fraction, mixed number, π form and √ form.', 'Tap <b>ℝ</b> to allow complex numbers (a+bi or r∠θ); type <b>i</b> with 2nd + °.', 'Memory: <b>M+</b> adds the answer to M, <b>M−</b> subtracts, <b>MR</b> recalls, <b>MC</b> clears. <b>STO →</b> stores the answer in A–F, x, y or z. You can type <code>A = 5</code> or define <code>f(x) = x² + 1</code>.', '<b>Functions</b> lists every function with an example: roots, logs, HCF/LCM, prime factors, nPr/nCr, ∫, d/dx, Σ, limits, solve, matrices and units (<code>10 inch to cm</code>).', '<code>log</code> is base 10 and <code>ln</code> is base e, as on school calculators. <code>200 + 10%</code> = 220.'],
    eqn: ['Pick <b>Simultaneous</b> for 2, 3 or 4 linear equations, <b>Polynomial</b> for degree 2, 3 or 4 (with inequalities), or <b>Any equation</b> to solve something like <code>x³ − 2x = 5</code> or <code>cos(x) = x</code>.', 'Boxes accept sums and fractions such as <code>1/2</code> or <code>√(3)</code>.', 'Complex roots are shown when there are no real ones.'],
    graph: ['Type up to six functions of x. Drag to move, pinch or scroll to zoom, or use + and −.', 'Tap a curve to read off points. Roots, turning points and crossings are marked and listed; tap one to jump to it.', 'Use the table to list values, and the image button to save the graph.'],
    stat: ['Choose 1-variable (x only) or 2-variable (x and y). Add a frequency column if values repeat.', 'Type values in the table or paste a list (spaces, commas or new lines). Results update straight away.', '2-variable mode fits linear, quadratic, logarithmic, exponential, power and inverse regressions and shows r and r².'],
    matrix: ['Set each matrix size (up to 6 × 6) and fill the boxes. Pick an operation, or type your own expression such as <code>inv(A) * B</code>.', 'Store a result back into A–D to keep working with it.'],
    vector: ['Pick 2D or 3D, fill the vectors, then choose an operation: dot, cross, length, angle, unit vector or projection. Or type an expression such as <code>cross(A, B)</code>.'],
    calculus: ['Calculus uses radians, like every textbook.', 'Derivative: shows the formula (symbolic) and its value at a point. Integral: definite integrals, including limits of ∞ (type <code>inf</code>).', 'Σ adds terms; Π multiplies them. Limits are estimated numerically from both sides.'],
    base: ['Type a number in HEX, DEC, OCT or BIN and the others follow. Tap bits to flip them.', 'Use the keypad for sums in the chosen base, with AND, OR, XOR, NOT, NAND, NOR and shifts. Results wrap to the word size (8–64 bits, signed or unsigned).'],
    units: ['Choose a type, the unit you have and the unit you want. The table below shows every unit at once.', 'Includes Indian units: cent, ground, guntha (land) and tola (gold).'],
    const: ['Tap Insert to put a constant into the calculator, or Copy for its value. Values are CODATA 2018 SI values.']
  };
  function openHelp(tab) {
    const t = tab && HELP[tab] ? tab : 'calc';
    const names = { calc: 'Calculate', eqn: 'Equations', graph: 'Graph', stat: 'Statistics', matrix: 'Matrix', vector: 'Vector', calculus: 'Calculus', base: 'Base-N', units: 'Units', const: 'Constants' };
    openLayer(`<div class="sheet">${sheetHead('How to use: ' + names[t])}<div class="sheet-b"><ul class="help-list">${HELP[t].map((x) => `<li>${x}</li>`).join('')}</ul>
      ${t !== 'calc' ? `<h3 style="margin-top:12px">Calculate tab</h3><ul class="help-list">${HELP.calc.map((x) => `<li>${x}</li>`).join('')}</ul>` : ''}
      <p class="hint">Keyboard: digits and operators type straight in, Enter works it out, Backspace deletes, Esc clears (or closes a window).</p></div></div>`);
  }

  // ---------- public API for tools.js ----------
  window.ISC = {
    VERSION, M, S, LS, $, $$, esc, scope, clean, cleanDeep, fmtNum, fmtValue, exactOf, ratApprox, normalise, friendlyError, CalcError,
    evaluateExpr, withAngle, num: { integrate, derivN, findRoots, polyRoots, brent, gcd },
    openLayer, closeTop, sheetHead, confirmBox, toast, copyText, fmtDate, registerTab, goTab, registerData, openHelp, texOf, renderTex, loadKatex,
    katexReady: () => katexState === 'ready',
    insertToCalc(text) { goTab('calc'); justEvaluated = false; insertAtCaret(text); exprEl.focus({ preventScroll: true }); },
    setAngleForTool: (a) => { ANG = a; }, restoreAngle: () => { ANG = S.angle; },
    get angle() { return ANG; }
  };

  // ---------- boot ----------
  loadScope();
  paintChips(); paintMem(); renderPad(); renderHistory(); renderVars(); paintTheme(); paintInstall(); autoSize();
  $('#versionBadge').textContent = 'v' + VERSION; $('#footVer').textContent = 'v' + VERSION;
  window.addEventListener('load', () => {
    const m = location.hash.match(/tab=(\w+)/);
    goTab(m ? m[1] : 'calc', false);
    if ('requestIdleCallback' in window) requestIdleCallback(loadKatex, { timeout: 2500 }); else setTimeout(loadKatex, 1200);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { /* offline install not available */ });
  });
  window.addEventListener('online', () => toast('Back online.'));
  window.addEventListener('offline', () => toast('Offline. The calculator still works.'));
})();
