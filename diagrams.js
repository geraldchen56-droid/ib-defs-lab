/* IB Definitions Lab — diagram renderer.
   Turns a declarative diagram spec (diagrams.json) into an SVG string.
   Plot coordinates run 0–100 on both axes (y up). A spec may have one plot (`elements`)
   or side-by-side `panels`, a flow chart (`kind: "flow"`) or a payoff matrix (`kind: "matrix"`).
   No dependencies; also loads in Node for checks. */
(function (root) {
  'use strict';

  const H = 450, T = 30, B = 54, SW = 640;
  // marker ids must be unique per SVG: a marker inside a hidden (display:none) SVG does not render elsewhere
  let uid = 0, U = 'dgm0';
  const f = (n) => Math.round(n * 10) / 10;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- geometry ---------- */
  function catmull(pts, n = 24) {
    if (pts.length < 3) return pts.slice();
    const out = [];
    const p = [pts[0], ...pts, pts[pts.length - 1]];
    for (let i = 1; i < p.length - 2; i++) {
      const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  function hyperbola(k, x0, x1, n = 60) {
    const out = [];
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * (i / n); out.push([x, k / x]); }
    return out;
  }
  function segX(a, b, c, d) {
    const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])) / den;
    const u = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
  }
  function intersect(P, Q, nth = 0) {
    const hits = [];
    for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < Q.length - 1; j++) {
      const h = segX(P[i], P[i + 1], Q[j], Q[j + 1]);
      if (h && !hits.some((o) => Math.abs(o[0] - h[0]) < 0.05 && Math.abs(o[1] - h[1]) < 0.05)) hits.push(h);
    }
    hits.sort((a, b) => a[0] - b[0]);
    return hits[nth < 0 ? hits.length + nth : nth] || null;
  }
  function atX(P, x) {
    for (let i = 0; i < P.length - 1; i++) {
      const [a, b] = [P[i], P[i + 1]];
      if ((x - a[0]) * (x - b[0]) <= 0 && a[0] !== b[0]) return [x, a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0])];
    }
    return null;
  }
  function atY(P, y) {
    for (let i = 0; i < P.length - 1; i++) {
      const [a, b] = [P[i], P[i + 1]];
      if ((y - a[1]) * (y - b[1]) <= 0 && a[1] !== b[1]) return [a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]), y];
    }
    return null;
  }

  /* ---------- reference resolution ---------- */
  // P: point id -> [x, y]; Ls: line id -> polyline. Shared across panels so ids can be reused.
  function build(id, elements, P = {}, Ls = {}) {
    const coord = (v, axis) => {
      if (typeof v === 'number') return v;
      const [ref, ax] = String(v).split('.');
      const p = P[ref];
      if (!p) throw new Error(`${id}: unknown point "${ref}"`);
      return p[(ax || axis) === 'x' ? 0 : 1];
    };
    const vtx = (v) => {
      if (typeof v === 'string') { const p = P[v]; if (!p) throw new Error(`${id}: unknown point "${v}"`); return [p.slice()]; }
      if (Array.isArray(v)) return [[coord(v[0], 'x'), coord(v[1], 'y')]];
      if (v && v.along) {
        const line = Ls[v.along]; if (!line) throw new Error(`${id}: unknown line "${v.along}"`);
        const x0 = coord(v.from, 'x'), x1 = coord(v.to, 'x');
        const mid = line.filter((p) => (p[0] - x0) * (p[0] - x1) < 0).sort((p, q) => (x1 > x0 ? p[0] - q[0] : q[0] - p[0]));
        return [atX(line, x0), ...mid, atX(line, x1)].filter(Boolean);
      }
      throw new Error(`${id}: bad vertex ${JSON.stringify(v)}`);
    };
    const out = [];
    for (const el of elements || []) {
      const e = { ...el, step: el.step || 0 };
      if (e.type === 'line' || e.type === 'curve') {
        let pts = e.pts.flatMap(vtx);
        if (e.type === 'curve') pts = catmull(pts);
        e.P = pts;
        if (e.id) Ls[e.id] = pts;
      } else if (e.type === 'hyperbola') {
        e.P = hyperbola(e.k, e.from, e.to);
        if (e.id) Ls[e.id] = e.P;
      } else if (e.type === 'point') {
        let p;
        if (Array.isArray(e.on)) {
          const [a, b] = e.on.map((r) => Ls[r]);
          if (!a || !b) throw new Error(`${id}: point ${e.id} references unknown line in ${e.on}`);
          p = intersect(a, b, e.nth || 0);
        } else if (e.on) {
          const line = Ls[e.on]; if (!line) throw new Error(`${id}: unknown line ${e.on}`);
          p = e.x !== undefined ? atX(line, coord(e.x, 'x')) : atY(line, coord(e.y, 'y'));
        } else p = vtx(e.at)[0];
        if (!p) throw new Error(`${id}: point ${e.id || '?'} could not be located`);
        e.p = p;
        if (e.id) P[e.id] = p;
      } else if (e.type === 'area') {
        e.P = e.pts.flatMap(vtx);
        if (e.labelAt) e.labelAt = [coord(e.labelAt[0], 'x'), coord(e.labelAt[1], 'y')];
      } else if (e.type === 'arrow') {
        e.a = vtx(e.from)[0]; e.b = vtx(e.to)[0];
      } else if (e.type === 'span') {
        e.v0 = coord(e.from, e.axis); e.v1 = coord(e.to, e.axis); e.lv = coord(e.at, e.axis === 'x' ? 'y' : 'x');
      } else if (e.type === 'text') {
        e.p = vtx(e.at)[0];
      }
      out.push(e);
    }
    return out;
  }

  /* ---------- drawing ---------- */
  const OFF = { n: [0, -12], ne: [9, -9], e: [11, 4], se: [9, 15], s: [0, 19], sw: [-9, 15], w: [-11, 4], nw: [-9, -9] };
  const ANCH = { n: 'middle', s: 'middle', ne: 'start', e: 'start', se: 'start', nw: 'end', w: 'end', sw: 'end' };

  function cls(e, step) {
    if (e.step > step || (e.until !== undefined && step > e.until)) return 'dg-hidden';
    if (e.step === step && step > 0 && step !== Infinity) return 'dg-fresh';
    return '';
  }

  function frame(x0, width, R = 34, top = T) {
    const L = 62;
    const PW = width - L - R, PH = H - top - B;
    const X = (x) => x0 + L + (x / 100) * PW;
    const Y = (y) => top + ((100 - y) / 100) * PH;
    return { X, Y, x0, width, L, R, T: top };
  }

  function drawPanel(els, ax, fr, step, title) {
    const { X, Y } = fr;
    const path = (P) => 'M' + P.map((p) => `${f(X(p[0]))},${f(Y(p[1]))}`).join('L');
    const lineLabel = (e) => {
      if (!e.label) return '';
      const P = e.P, at = e.labelAt === 'start' ? P[0] : P[P.length - 1];
      const prev = e.labelAt === 'start' ? P[1] : P[P.length - 2];
      let dx = X(at[0]) - X(prev[0]), dy = Y(at[1]) - Y(prev[1]);
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const [ox, oy] = e.labelOffset || [0, 0];
      const x = X(at[0]) + dx * 10 + ox, y = Y(at[1]) + dy * 10 + oy + 4;
      const anchor = dx > 0.35 ? 'start' : dx < -0.35 ? 'end' : 'middle';
      return `<text class="dg-lbl dg-c-${e.style || 'neutral'}" x="${f(x)}" y="${f(y)}" text-anchor="${anchor}">${esc(e.label)}</text>`;
    };
    const layers = { area: [], guide: [], line: [], arrow: [], point: [], text: [] };
    for (const e of els) {
      const c = cls(e, step);
      if (e.type === 'area') {
        const lx = e.labelAt ? X(e.labelAt[0]) : e.P.reduce((s, p) => s + X(p[0]), 0) / e.P.length;
        const ly = e.labelAt ? Y(e.labelAt[1]) : e.P.reduce((s, p) => s + Y(p[1]), 0) / e.P.length;
        layers.area.push(`<g class="${c}"><path class="dg-area dg-fill-${e.fill || 'neutral'}" d="${path(e.P)}Z"/>` +
          (e.label ? `<text class="dg-area-lbl" x="${f(lx)}" y="${f(ly + 4)}" text-anchor="middle">${esc(e.label)}</text>` : '') + '</g>');
      } else if (e.type === 'line' || e.type === 'curve' || e.type === 'hyperbola') {
        layers.line.push(`<g class="${c}${e.faded ? ' dg-faded' : ''}"><path class="dg-line dg-c-${e.style || 'neutral'}${e.dash ? ' dg-dash' : ''}${e.thin ? ' dg-thin' : ''}" d="${path(e.P)}"/>${lineLabel(e)}</g>`);
      } else if (e.type === 'point') {
        const [x, y] = e.p, px = X(x), py = Y(y);
        let g = '';
        if (e.xLabel !== undefined || e.dropX) g += `<path class="dg-guide" d="M${f(px)},${f(py)}V${f(Y(0))}"/>`;
        if (e.yLabel !== undefined || e.dropY) g += `<path class="dg-guide" d="M${f(px)},${f(py)}H${f(X(0))}"/>`;
        if (e.xLabel) g += `<text class="dg-tick" x="${f(px)}" y="${f(Y(0) + 18)}" text-anchor="middle">${esc(e.xLabel)}</text>`;
        if (e.yLabel) g += `<text class="dg-tick" x="${f(X(0) - 7)}" y="${f(py + 4)}" text-anchor="end">${esc(e.yLabel)}</text>`;
        layers.guide.push(`<g class="${c}">${g}</g>`);
        const pos = e.labelPos || 'ne', [ox, oy] = OFF[pos];
        layers.point.push(`<g class="${c}">${e.dot === false ? '' : `<circle class="dg-dot" cx="${f(px)}" cy="${f(py)}" r="3.6"/>`}` +
          (e.label ? `<text class="dg-pt-lbl" x="${f(px + ox)}" y="${f(py + oy + 4)}" text-anchor="${ANCH[pos]}">${esc(e.label)}</text>` : '') + '</g>');
      } else if (e.type === 'arrow') {
        layers.arrow.push(`<g class="${c}"><path class="dg-arrow" d="M${f(X(e.a[0]))},${f(Y(e.a[1]))}L${f(X(e.b[0]))},${f(Y(e.b[1]))}" marker-end="url(#${U}h)"/></g>`);
      } else if (e.type === 'span') {
        const hz = e.axis === 'x';
        const [x0, y0, x1, y1] = hz ? [X(e.v0), Y(e.lv), X(e.v1), Y(e.lv)] : [X(e.lv), Y(e.v0), X(e.lv), Y(e.v1)];
        const below = e.labelPos !== 'above';
        const lx = (x0 + x1) / 2 + (hz ? 0 : 8), ly = (y0 + y1) / 2 + (hz ? (below ? 16 : -8) : 4);
        layers.arrow.push(`<g class="${c}"><path class="dg-span" d="M${f(x0)},${f(y0)}L${f(x1)},${f(y1)}" marker-start="url(#${U}s)" marker-end="url(#${U}h)"/>` +
          (e.label ? `<text class="dg-span-lbl" x="${f(lx)}" y="${f(ly)}" text-anchor="${hz ? 'middle' : 'start'}">${esc(e.label)}</text>` : '') + '</g>');
      } else if (e.type === 'text') {
        layers.text.push(`<g class="${c}"><text class="dg-note${e.strong ? ' dg-strong' : ''}" x="${f(X(e.p[0]))}" y="${f(Y(e.p[1]))}" text-anchor="${e.anchor || 'middle'}">${esc(e.text)}</text></g>`);
      }
    }
    const top = fr.T - 10, right = fr.x0 + fr.width - fr.R + 12;
    let axes = '';
    if (ax.zeroLine !== undefined) {
      // y axis crosses below zero (e.g. current account balance): draw x axis at the zero line
      axes += `<path class="dg-axis" d="M${X(0)},${top}V${Y(0)}" marker-start="url(#${U}u)"/>` +
        `<path class="dg-axis" d="M${X(0)},${f(Y(ax.zeroLine))}H${right}" marker-end="url(#${U}a)"/>` +
        `<text class="dg-tick" x="${X(0) - 8}" y="${f(Y(ax.zeroLine) + 4)}" text-anchor="end">0</text>` +
        `<text class="dg-axis-lbl" x="${right}" y="${f(Y(ax.zeroLine) + 22)}" text-anchor="end">${esc(ax.x)}</text>`;
    } else {
      axes += `<path class="dg-axis" d="M${X(0)},${top}V${Y(0)}H${right}" marker-start="url(#${U}u)" marker-end="url(#${U}a)"/>` +
        `<text class="dg-axis-lbl" x="${right}" y="${Y(0) + 38}" text-anchor="end">${esc(ax.x)}</text>` +
        (ax.origin === false ? '' : `<text class="dg-tick" x="${X(0) - 8}" y="${Y(0) + 17}" text-anchor="end">0</text>`);
    }
    axes += `<text class="dg-axis-lbl" x="${X(0) - 8}" y="${top - 6}" text-anchor="start">${esc(ax.y)}</text>`;
    if (title) axes += `<text class="dg-panel-title" x="${f((X(0) + right) / 2)}" y="${top - 26}" text-anchor="middle">${esc(title)}</text>`;
    return axes + layers.area.join('') + layers.guide.join('') + layers.line.join('') + layers.arrow.join('') + layers.point.join('') + layers.text.join('');
  }

  function renderGraph(spec, step) {
    if (spec.panels) {
      const P = {}, Ls = {}, pw = 480;
      const body = spec.panels.map((pn, i) => {
        const els = build(spec.id, pn.elements, P, Ls);
        return drawPanel(els, pn.axes || { x: 'Quantity', y: 'Price' }, frame(i * pw, pw, 74, 54), step, pn.title);
      }).join('');
      return wrap(spec, body, pw * spec.panels.length);
    }
    const els = build(spec.id, spec.elements);
    return wrap(spec, drawPanel(els, spec.axes || { x: 'Quantity', y: 'Price' }, frame(0, SW, 78), step), SW);
  }

  function renderFlow(spec, step) {
    const fr = frame(0, SW), { X, Y } = fr, PW = SW - fr.L - fr.R, PH = H - T - B;
    const nodes = {};
    let edges = '', boxes = '';
    for (const n of spec.nodes) nodes[n.id] = n;
    const box = (n) => ({ cx: X(n.at[0]), cy: Y(n.at[1]), w: (n.w || 22) / 100 * PW, h: (n.h || 11) / 100 * PH });
    const edgePt = (b, tx, ty) => {
      const dx = tx - b.cx, dy = ty - b.cy;
      const s = Math.min(Math.abs((b.w / 2 + 3) / (dx || 1e-9)), Math.abs((b.h / 2 + 3) / (dy || 1e-9)));
      return [b.cx + dx * s, b.cy + dy * s];
    };
    for (const e of spec.edges || []) {
      if (!nodes[e.from] || !nodes[e.to]) throw new Error(`${spec.id}: edge ${e.from}→${e.to} has an unknown node`);
      const a = box(nodes[e.from]), b = box(nodes[e.to]);
      const bend = e.bend || 0;
      const mx = (a.cx + b.cx) / 2, my = (a.cy + b.cy) / 2;
      const nx = -(b.cy - a.cy), ny = b.cx - a.cx, nl = Math.hypot(nx, ny) || 1;
      const cx = mx + (nx / nl) * bend * 2, cy = my + (ny / nl) * bend * 2;
      const [sx, sy] = edgePt(a, cx, cy), [ex, ey] = edgePt(b, cx, cy);
      const c = cls({ step: e.step || 0 }, step);
      const [lox, loy] = e.labelOffset || [0, 0];
      edges += `<g class="${c}"><path class="dg-flow-edge${e.style ? ' dg-c-' + e.style : ''}${e.dash ? ' dg-dash' : ''}" d="M${f(sx)},${f(sy)}Q${f(cx)},${f(cy)} ${f(ex)},${f(ey)}" marker-end="url(#${U}h)"/>` +
        (e.label ? `<text class="dg-flow-lbl" x="${f((sx + 2 * cx + ex) / 4 + lox)}" y="${f((sy + 2 * cy + ey) / 4 + loy + 4)}" text-anchor="middle">${esc(e.label)}</text>` : '') + '</g>';
    }
    for (const n of spec.nodes) {
      const b = box(n), c = cls({ step: n.step || 0 }, step);
      const lines = String(n.text).split('\n');
      boxes += `<g class="${c}"><rect class="dg-node${n.style ? ' dg-node-' + n.style : ''}" x="${f(b.cx - b.w / 2)}" y="${f(b.cy - b.h / 2)}" width="${f(b.w)}" height="${f(b.h)}" rx="8"/>` +
        lines.map((t, i) => `<text class="dg-node-lbl" x="${f(b.cx)}" y="${f(b.cy + 4.5 + (i - (lines.length - 1) / 2) * 15)}" text-anchor="middle">${esc(t)}</text>`).join('') + '</g>';
    }
    let notes = '';
    for (const t of spec.notes || []) notes += `<g class="${cls({ step: t.step || 0 }, step)}"><text class="dg-note${t.strong ? ' dg-strong' : ''}" x="${f(X(t.at[0]))}" y="${f(Y(t.at[1]))}" text-anchor="middle">${esc(t.text)}</text></g>`;
    return wrap(spec, edges + boxes + notes, SW);
  }

  function renderMatrix(spec, step) {
    const m = spec.matrix;
    const x0 = 210, y0 = 104, cw = 180, ch = 104;
    let s = `<text class="dg-axis-lbl" x="${x0 + cw}" y="${y0 - 44}" text-anchor="middle">${esc(m.colPlayer)}</text>`;
    s += `<text class="dg-axis-lbl" x="${x0 - 128}" y="${y0 + ch}" text-anchor="middle" transform="rotate(-90 ${x0 - 128} ${y0 + ch})">${esc(m.rowPlayer)}</text>`;
    m.cols.forEach((c, j) => { s += `<text class="dg-tick dg-strong" x="${x0 + cw * j + cw / 2}" y="${y0 - 14}" text-anchor="middle">${esc(c)}</text>`; });
    m.rows.forEach((r, i) => { s += `<text class="dg-tick dg-strong" x="${x0 - 14}" y="${y0 + ch * i + ch / 2 + 4}" text-anchor="end">${esc(r)}</text>`; });
    m.cells.forEach((row, i) => row.forEach((cell, j) => {
      s += `<rect class="dg-cell" x="${x0 + cw * j}" y="${y0 + ch * i}" width="${cw}" height="${ch}"/>`;
      for (const hi of (m.highlight || []).filter((h) => h.cell[0] === i && h.cell[1] === j)) {
        s += `<g class="${cls({ step: hi.step || 0 }, step)}"><rect class="dg-cell-hi dg-fill-${hi.fill || 'gain'}" x="${x0 + cw * j + 4}" y="${y0 + ch * i + 4}" width="${cw - 8}" height="${ch - 8}" rx="6"/>` +
          `<text class="dg-note dg-strong" x="${x0 + cw * j + cw / 2}" y="${y0 + ch * i + ch - 14}" text-anchor="middle">${esc(hi.label || '')}</text></g>`;
      }
      s += `<text class="dg-payoff" x="${x0 + cw * j + cw / 2}" y="${y0 + ch * i + ch / 2 + 4}" text-anchor="middle"><tspan class="dg-c-d">${esc(cell[0])}</tspan><tspan class="dg-c-neutral">, </tspan><tspan class="dg-c-s">${esc(cell[1])}</tspan></text>`;
    }));
    s += `<text class="dg-note" x="${x0 + cw}" y="${y0 + 2 * ch + 26}" text-anchor="middle">Payoffs: <tspan class="dg-c-d">${esc(m.rowPlayer)}</tspan>, <tspan class="dg-c-s">${esc(m.colPlayer)}</tspan>${m.unit ? ' — ' + esc(m.unit) : ''}</text>`;
    (m.notes || []).forEach((n) => { s += `<g class="${cls({ step: n.step || 0 }, step)}"><text class="dg-note dg-strong" x="${x0 + cw}" y="${n.y}" text-anchor="middle">${esc(n.text)}</text></g>`; });
    return wrap(spec, s, SW);
  }

  function wrap(spec, inner, width) {
    return `<svg class="dg-svg" viewBox="0 0 ${width} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(spec.title)}">` +
      '<defs>' +
      `<marker id="${U}h" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L10,5L0,10z" class="dg-head"/></marker>` +
      `<marker id="${U}s" viewBox="0 0 10 10" refX="1.5" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0L0,5L10,10z" class="dg-head"/></marker>` +
      `<marker id="${U}a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,1L10,5L0,9z" class="dg-axis-head"/></marker>` +
      `<marker id="${U}u" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M10,1L0,5L10,9z" class="dg-axis-head"/></marker>` +
      '</defs>' + inner + '</svg>';
  }

  function render(spec, step = Infinity) {
    U = `dgm${++uid}`;
    if (spec.kind === 'flow') return renderFlow(spec, step);
    if (spec.kind === 'matrix') return renderMatrix(spec, step);
    return renderGraph(spec, step);
  }
  const stepCount = (spec) => Math.max(1, (spec.steps || []).length);

  const api = { render, stepCount, build };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DiagramRenderer = api;
})(typeof window !== 'undefined' ? window : globalThis);
