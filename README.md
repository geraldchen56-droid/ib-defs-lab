# IB Definitions Lab

AO1 definitions for **IB HL Economics** and **IB HL Business Management**, in one static site with three modes:

| Mode | What it does |
| --- | --- |
| **Dictionary** | Live search across terms, definitions and topics. Filter by subject, unit and topic (and hide HL-only terms). Pick a term to see its exam-ready definition, a "why it's tested" note where relevant, and clickable related terms — including links across the two subjects. |
| **Flashcards** | Tick whole units or open them to pick individual topics, then start a deck. Click the card (or press <kbd>Space</kbd>) to flip it, then mark **Know it** (<kbd>→</kbd>) or **Still learning** (<kbd>←</kbd>). Progress is saved in your browser's `localStorage`, shown per unit, and you can build a deck of only "still learning" + unseen cards. |
| **Graph** | A force-directed concept web (d3-force). Nodes are coloured by unit and clustered by unit; edges come from each term's `relatedTerms` (dashed edges cross between Economics and Business Management). Scroll to zoom, drag to pan, click a node to highlight its neighbours and read its definition, search to jump to a term, or filter to a single subject/unit (click a legend row as a shortcut). |

The **Economics · Business · Both** switch in the top bar applies to all three modes and is remembered between visits. "Both" splits the dictionary list into a section per subject. Opening a term from the other subject (e.g. a cross-subject related term) switches the subject with it.

Economics policy debates are framed only as **Monetarist/New Classical (non-interventionist) vs Keynesian (interventionist)**, matching the IB guide.

## Files

```
index.html   page shell and the three mode panels
styles.css   all styling (light + dark theme)
app.js       app logic — loads data.json, no build step
data.json    the term dataset
```

## Run locally

`data.json` is loaded with `fetch`, so open the site through a local server rather than double-clicking `index.html`:

```bash
cd ib-defs-lab
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static server works, e.g. `npx serve`.)

## Deploy

It's a plain static site with no build step: import the repo into Vercel (framework preset **Other**, no build command, output directory `.`) or enable GitHub Pages on the main branch.

## Data format

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
