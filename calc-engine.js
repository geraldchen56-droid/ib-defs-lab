/* IB Definitions Lab — calculation engine.
   Turns a calculation spec (calculations.json) into a concrete question with random numbers,
   worked steps and checkable answers. No dependencies; also loads in Node for checks.

   Spec of a question:
     vars:    { name: [min, max, step] | { pick: [values] } | value }
     derived: { name: "expression" }          evaluated in order, may use earlier names
     where:   "expression"                    regenerate until true
     question, steps[]: text with {{expression}} placeholders
     parts[]: { label, answer: "expression", unit, dp, tol } or { label, choices: [..], answer: "expression → choice" }
   Helpers available in expressions: f(x, dp) number, m(x) money, lin(k, s, v) "k + sP", abs, round, min, max, sqrt. */
(function (root) {
  'use strict';

  const MINUS = '−';
  function f(x, dp = 2) {
    if (typeof x !== 'number' || !isFinite(x)) return String(x);
    const r = Math.round(x * 10 ** dp) / 10 ** dp;
    const s = Math.abs(r).toLocaleString('en-GB', { maximumFractionDigits: dp });
    return (r < 0 && s !== '0' ? MINUS : '') + s;
  }
  function m(x) {
    const r = Math.round(x * 100) / 100;
    const s = Number.isInteger(r) ? Math.abs(r).toLocaleString('en-GB')
      : Math.abs(r).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (r < 0 ? MINUS : '') + '$' + s;
  }
  // "k + sP" with tidy signs, e.g. lin(500, -20) → "500 − 20P", lin(-40, 10) → "−40 + 10P"
  function lin(k, s, v = 'P') {
    const t = (Math.abs(s) === 1 ? '' : f(Math.abs(s))) + v;
    if (k === 0) return (s < 0 ? MINUS : '') + t;
    return f(k) + (s < 0 ? ` ${MINUS} ` : ' + ') + t;
  }
  const fd = (x, dp = 2) => (x < 0 ? MINUS : '') + Math.abs(x).toFixed(dp); // fixed decimals, e.g. exchange rates
  const H = { f, m, lin, fd, abs: Math.abs, round: Math.round, min: Math.min, max: Math.max, sqrt: Math.sqrt };

  const cache = new Map();
  function ev(expr, scope) {
    const names = Object.keys(scope);
    const key = names.join(',') + '|' + expr;
    let fn = cache.get(key);
    if (!fn) { fn = new Function(...names, `"use strict"; return (${expr});`); cache.set(key, fn); }
    return fn(...names.map((n) => scope[n]));
  }
  const tpl = (str, scope) => String(str).replace(/\{\{(.+?)\}\}/g, (_, e) => { const v = ev(e, scope); return typeof v === 'number' ? f(v) : String(v); });

  function pickVar(spec, rnd) {
    if (Array.isArray(spec)) {
      const [a, b, st = 1] = spec;
      const n = Math.floor((b - a) / st + 1e-9) + 1;
      return +(a + st * Math.floor(rnd() * n)).toFixed(10);
    }
    if (spec && spec.pick) return spec.pick[Math.floor(rnd() * spec.pick.length)];
    return spec;
  }

  function generate(q, rnd = Math.random, fixed = null) {
    for (let attempt = 0; attempt < 2000; attempt++) {
      const vals = {};
      for (const [k, s] of Object.entries(q.vars || {})) vals[k] = fixed && k in fixed ? fixed[k] : pickVar(s, rnd);
      let scope = { ...H, ...vals };
      for (const [k, e] of Object.entries(q.derived || {})) { vals[k] = ev(e, scope); scope = { ...H, ...vals }; }
      if (!q.where || ev(q.where, scope)) {
        return {
          vals,
          question: tpl(q.question, scope),
          parts: q.parts.map((p) => ({
            label: tpl(p.label, scope), unit: p.unit || '', dp: p.dp ?? 2, tol: p.tol,
            choices: p.choices ? p.choices.map((c) => tpl(c, scope)) : null,
            answer: ev(p.answer, scope),
          })),
          steps: (q.steps || []).map((s) => tpl(s, scope)),
        };
      }
      if (fixed) throw new Error('example values do not satisfy "where"');
    }
    throw new Error('could not generate values satisfying "where"');
  }

  function parseNum(s) {
    const t = String(s).trim().replace(/[−–]/g, '-').replace(/[$£€%,\s]/g, '').replace(/(bn|billion|m|million|units?)$/i, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return parseFloat(t);
  }
  // true / false, or null when the input isn't a number
  function check(part, input) {
    if (part.choices) return input === part.answer;
    const u = parseNum(input);
    if (Number.isNaN(u)) return null;
    const a = part.answer;
    const tol = part.tol ?? Math.max(0.011, Math.abs(a) * 0.01);
    return Math.abs(u - a) <= tol + 1e-9;
  }
  function show(part) {
    if (part.choices) return part.answer;
    const u = part.unit || '';
    if (u.startsWith('$')) return m(part.answer) + u.slice(1);
    if (u === '%') return f(part.answer, part.dp) + '%';
    if (u === '€') return '€' + fd(part.answer);
    return f(part.answer, part.dp) + (u ? ' ' + u : '');
  }

  const api = { generate, check, show, parseNum, f, m, lin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CalcEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
