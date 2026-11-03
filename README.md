# IB Definitions Lab

AO1 definitions for **IB HL Economics** and **IB HL Business Management**, plus every IB Economics diagram and calculation, in one static site with five modes:

| Mode | What it does |
| --- | --- |
| **Dictionary** | Live search across terms, definitions and topics. Filter by subject, unit and topic (and hide HL-only terms). Pick a term to see its exam-ready definition, a "why it's tested" note where relevant, clickable related terms — including links across the two subjects — and thumbnails of every diagram the term appears on. |
| **Flashcards** | Tick whole units or open them to pick individual topics, then start a deck. Click the card (or press <kbd>Space</kbd>) to flip it, then mark **Know it** (<kbd>→</kbd>) or **Still learning** (<kbd>←</kbd>). Progress is saved in your browser's `localStorage`, shown per unit, and you can build a deck of only "still learning" + unseen cards. |
| **Diagrams** | All the SL and HL Economics diagrams (74), grouped by unit and topic. Each one builds step by step — use **Prev / Next** or <kbd>←</kbd> <kbd>→</kbd> — with an explanation for every step, exam tips, links to the terms on the diagram, and **Download SVG**. |
| **Calculations** | Every IB Economics calculation (35) — elasticities, linear demand/supply, taxes and subsidies, price controls, costs and profit, GDP, CPI, the multiplier, tax rates, comparative advantage, tariffs and quotas, exchange rates, balance of payments, terms of trade. Each has the formula, what it means, a memory tip, a worked example, and unlimited practice with new numbers every time: type your answers, **Check**, or **Show working**. Questions you solve are tracked in `localStorage`. |
| **Graph** | A force-directed concept web (d3-force). Nodes are coloured by unit and clustered by unit; edges come from each term's `relatedTerms` (dashed edges cross between Economics and Business Management). Scroll to zoom, drag to pan, click a node to highlight its neighbours and read its definition, search to jump to a term, or filter to a single subject/unit (click a legend row as a shortcut). |

The **Economics · Business · Both** switch in the top bar applies to every mode and is remembered between visits. "Both" splits the dictionary list into a section per subject. Opening a term from the other subject (e.g. a cross-subject related term) switches the subject with it.

The Economics glossary covers the full guide (SL and HL), with HL-only terms flagged. Policy debates are framed only as **Monetarist/New Classical (non-interventionist) vs Keynesian (interventionist)**, matching the IB guide.

## Files

```
index.html      page shell and the four mode panels
styles.css      all styling (light + dark theme)
app.js            app logic — loads the three JSON files, no build step
diagrams.js       diagram renderer (spec → SVG), no dependencies
calc-engine.js    calculation engine (random questions, worked steps, answer checking)
data.json         the term dataset
diagrams.json     the diagram dataset
calculations.json the calculation dataset
tools/check.js    validates all three datasets: node tools/check.js
```

## Run locally

The JSON files are loaded with `fetch`, so open the site through a local server rather than double-clicking `index.html`:

```bash
cd ib-defs-lab
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static server works, e.g. `npx serve`.)

## Deploy

It's a plain static site with no build step: import the repo into Vercel (framework preset **Other**, no build command, output directory `.`) or enable GitHub Pages on the main branch.

## Term format (`data.json`)

`data.json` has a `subjects` map (subject → ordered list of units, which drives the filters, deck builder and graph legend) and a `terms` array:

```json
{
  "id": "ec-ped",
  "term": "Price elasticity of demand (PED)",
  "subject": "Economics",
  "unit": "Microeconomics",
  "topic": "Elasticity",
  "definition": "A measure of the responsiveness of quantity demanded …",
  "relatedTerms": ["ec-demand", "ec-pes", "bm-price-elasticity-bm"],
  "whyTested": "Formula + 'responsiveness' are both required for full marks.",
  "hl": false
}
```

- `id` — unique, kebab-case, prefixed `ec-` (Economics) or `bm-` (Business Management)
- `relatedTerms` — ids of other terms; keep links two-way so every node in the graph is connected
- `whyTested` and `hl` are optional

The app ignores (and logs a console warning for) any `relatedTerms` id that doesn't exist, so a typo won't break the page.

## Diagram format (`diagrams.json`)

Each diagram is a declarative spec; `diagrams.js` draws it. Plot coordinates run **0–100 on both axes** (y up).

```json
{
  "id": "dg-specific-tax",
  "title": "Specific (per-unit) indirect tax",
  "unit": "Microeconomics",
  "topic": "Government intervention",
  "hl": false,
  "summary": "One-line description shown under the title.",
  "axes": { "x": "Quantity", "y": "Price" },
  "elements": [
    { "type": "line", "id": "d", "pts": [[5, 92], [92, 8]], "label": "D", "style": "d" },
    { "type": "line", "id": "s", "pts": [[5, 10], [92, 80]], "label": "S", "style": "s" },
    { "type": "point", "id": "e1", "on": ["d", "s"], "label": "e₁", "xLabel": "Q₁", "yLabel": "P₁" },
    { "type": "line", "id": "st", "pts": [[5, 32], [85, 96]], "label": "S + tax", "style": "s", "dash": true, "step": 1 }
  ],
  "steps": ["Explanation shown at step 1", "Explanation shown at step 2"],
  "examTips": ["Optional tips"],
  "relatedTerms": ["ec-specific-tax", "ec-tax-incidence"]
}
```

- **Steps** — every element has an optional `step` (default 0): it appears when the viewer reaches that step, and `until` hides it after that step. `steps[i]` is the explanation for step *i*.
- **Element types** — `line` (straight segments), `curve` (smooth through its points), `hyperbola` (`k`, `from`, `to`), `point`, `area` (shaded polygon), `arrow` (`from` → `to`), `span` (double-headed measurement along an `axis` between two values, drawn `at` a level), `text`.
- **References** — anywhere a coordinate is expected you can use a point id: `"e1"` is the whole point, `"e1.x"` / `"e1.y"` one coordinate, and `[0, "e1"]` takes the y of `e1`. A `point` can be the intersection of two lines (`"on": ["d", "s"]`, with `nth` to pick among several crossings, `-1` = last), on a line at an x or y (`"on": "d", "x": 30`), or fixed (`"at": [x, y]`). An area vertex `{ "along": "lineId", "from": x0, "to": x1 }` follows a line between two x values.
- **Styles** — `d` (demand), `s` (supply), `social` (MSB/MSC), `cost`, `rev`, `agg` (AD), `policy`, `neutral`, `muted`; area fills `cs`, `ps`, `loss`, `tax`, `gain`, `rev`, `social`, `neutral`.
- **Other layouts** — `panels` (side-by-side plots, e.g. industry and firm, each with `title`, `axes`, `elements`), `"kind": "flow"` (`nodes`, `edges`, `notes` — e.g. the circular flow) and `"kind": "matrix"` (a game-theory payoff matrix).

Run `node tools/check.js` after editing either file: it checks ids, units, topics, two-way term links, diagram term links and step numbering, and renders every diagram at every step.

## Calculation format (`calculations.json`)

```json
{
  "id": "calc-ped",
  "title": "Price elasticity of demand (PED)",
  "unit": "Microeconomics",
  "topic": "Elasticity",
  "hl": false,
  "formulas": ["PED = %ΔQd ÷ %ΔP"],
  "meaning": "What the result tells you.",
  "tip": "A short memory hook.",
  "practice": {
    "vars": { "p1": [2, 20, 1], "dp": { "pick": [10, 20, 25] }, "s": { "pick": [-1, 1] }, "q1": [200, 1000, 100], "dqp": [4, 90, 2] },
    "derived": { "p2": "p1 * (1 + s*dp/100)", "q2": "q1 * (1 - s*dqp/100)", "ped": "dqp / dp" },
    "where": "dqp !== dp && q2 > 0",
    "question": "Price changes from {{m(p1)}} to {{m(p2)}} …",
    "parts": [
      { "label": "PED (absolute value)", "answer": "ped" },
      { "label": "Demand is", "choices": ["price elastic", "price inelastic"], "answer": "ped > 1 ? \"price elastic\" : \"price inelastic\"" }
    ],
    "steps": ["%ΔP = … = {{f(s*dp)}}%", "…"]
  },
  "example": { "p1": 5, "dp": 20, "s": 1, "q1": 200, "dqp": 15 },
  "relatedTerms": ["ec-ped"],
  "diagrams": ["dg-ped-tr-elastic"]
}
```

- **vars** — `[min, max, step]` picks a random value on that grid; `{ "pick": [...] }` picks from a list. **derived** values are computed in order; the generator retries until **where** is true.
- **question**, **steps** and part **labels** use `{{expression}}` placeholders. Helpers: `f(x, dp)` number, `m(x)` money, `fd(x, dp)` fixed decimals, `lin(k, s)` → "k − sP", plus `abs`, `round`, `min`, `max`, `sqrt`.
- **parts** — numeric (`answer` expression, optional `unit`: `$`, `$bn`, `€`, `%`, `units`; `dp`; `tol`) or multiple choice (`choices` plus an `answer` expression returning one of them). Numeric answers within about 1% are accepted.
- **example** fixes every var to produce the worked example.
