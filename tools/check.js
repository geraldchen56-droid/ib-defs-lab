// Validate data.json and diagrams.json. Run from the repo root: node tools/check.js
const path = require('path');
const root = path.join(__dirname, '..');
const d = require(path.join(root, 'data.json'));
const dg = require(path.join(root, 'diagrams.json'));
const R = require(path.join(root, 'diagrams.js'));
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

if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
const ec = d.terms.filter((t) => t.subject === 'Economics');
console.log(`OK — ${d.terms.length} terms (${ec.length} Economics), ${dg.diagrams.length} diagrams`);
