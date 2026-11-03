// Validate data.json, diagrams.json and calculations.json. Run from the repo root: node tools/check.js
const path = require('path');
const root = path.join(__dirname, '..');
const d = require(path.join(root, 'data.json'));
const dg = require(path.join(root, 'diagrams.json'));
const R = require(path.join(root, 'diagrams.js'));
const calc = require(path.join(root, 'calculations.json'));
const E = require(path.join(root, 'calc-engine.js'));
const errs = [];

// ---- terms ----
const ids = new Map(d.terms.map((t) => [t.id, t])), seen = new Set();
for (const t of d.terms) {
  if (seen.has(t.id)) errs.push(`duplicate id ${t.id}`); seen.add(t.id);
  if (!/^(ec|bm)-[a-z0-9-]+$/.test(t.id)) errs.push(`bad id ${t.id}`);
  if ((t.subject === 'Economics') !== t.id.startsWith('ec-')) errs.push(`prefix/subject mismatch ${t.id}`);
  if (!(d.subjects[t.subject] || []).includes(t.unit)) errs.push(`unknown unit "${t.unit}" on ${t.id}`);
  if (!t.relatedTerms?.length) errs.push(`orphan ${t.id}`);
  if (new Set(t.relatedTerms).size !== t.relatedTerms.length) errs.push(`duplicate links on ${t.id}`);
  for (const r of t.relatedTerms || []) {
    if (r === t.id) errs.push(`self-link ${t.id}`);
    else if (!ids.has(r)) errs.push(`${t.id} -> missing ${r}`);
    else if (!ids.get(r).relatedTerms.includes(t.id)) errs.push(`not reciprocal: ${t.id} -> ${r}`);
  }
}

// ---- diagrams ----
const dgSeen = new Set();
for (const g of dg.diagrams) {
  if (dgSeen.has(g.id)) errs.push(`duplicate diagram ${g.id}`); dgSeen.add(g.id);
  if (!/^dg-[a-z0-9-]+$/.test(g.id)) errs.push(`bad diagram id ${g.id}`);
  if (!d.subjects.Economics.includes(g.unit)) errs.push(`${g.id}: unknown unit ${g.unit}`);
  if (!d.terms.some((t) => t.unit === g.unit && t.topic === g.topic)) errs.push(`${g.id}: topic "${g.topic}" is not used by any term`);
  if (!g.relatedTerms?.length) errs.push(`${g.id}: no relatedTerms`);
  for (const r of g.relatedTerms || []) if (!ids.has(r)) errs.push(`${g.id}: missing term ${r}`);
  const used = new Set(), scan = (a) => (a || []).forEach((e) => used.add(e.step || 0));
  scan(g.elements); (g.panels || []).forEach((p) => scan(p.elements)); scan(g.nodes); scan(g.edges); scan(g.notes);
  if (g.matrix) { scan(g.matrix.highlight); scan(g.matrix.notes); }
  const n = (g.steps || []).length;
  for (const s of used) if (s >= n) errs.push(`${g.id}: something appears on step ${s} but there are only ${n} step texts`);
  try { for (let s = 0; s < Math.max(1, n); s++) R.render(g, s); } catch (e) { errs.push(e.message); }
}

// ---- calculations ----
const dgIds = new Set(dg.diagrams.map((g) => g.id)), cSeen = new Set();
for (const c of calc.calculations) {
  if (cSeen.has(c.id)) errs.push(`duplicate calculation ${c.id}`); cSeen.add(c.id);
  if (!d.subjects.Economics.includes(c.unit)) errs.push(`${c.id}: unknown unit ${c.unit}`);
  if (!d.terms.some((t) => t.unit === c.unit && t.topic === c.topic)) errs.push(`${c.id}: topic "${c.topic}" is not used by any term`);
  for (const r of c.relatedTerms || []) if (!ids.has(r)) errs.push(`${c.id}: missing term ${r}`);
  for (const r of c.diagrams || []) if (!dgIds.has(r)) errs.push(`${c.id}: missing diagram ${r}`);
  try {
    const runs = [E.generate(c.practice, Math.random, c.example)];
    for (let i = 0; i < 200; i++) runs.push(E.generate(c.practice));
    for (const q of runs) for (const p of q.parts) {
      if (p.choices ? !p.choices.includes(p.answer) : !isFinite(p.answer)) errs.push(`${c.id}: bad answer for "${p.label}"`);
      if (/NaN|undefined|Infinity|\{\{/.test(q.question + q.steps.join(' '))) errs.push(`${c.id}: broken text in a generated question`);
    }
  } catch (e) { errs.push(`${c.id}: ${e.message}`); }
}

if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
const ec = d.terms.filter((t) => t.subject === 'Economics');
console.log(`OK — ${d.terms.length} terms (${ec.length} Economics), ${dg.diagrams.length} diagrams, ${calc.calculations.length} calculations`);
