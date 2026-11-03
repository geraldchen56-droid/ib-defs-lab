/* IB Definitions Lab — dictionary, flashcards, diagrams, calculations and concept graph.
   Plain JS, no build step. Data lives in data.json. */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const subjClass = (s) => (s === 'Economics' ? 'econ' : 'bm');
  const subjShort = (s) => (s === 'Economics' ? 'Econ' : 'BM');

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  let DATA, TERMS = [], BY_ID = new Map(), SUBJECTS = {};
  let DIAGRAMS = [], DG_BY_ID = new Map(), CALCS = [], CALC_BY_ID = new Map();
  let progress = store.get('ibdefs.progress', {}); // id -> 'known' | 'learning'
  let SUBJECT = store.get('ibdefs.subject', ''); // '' = both subjects

  /* ---------------- boot ---------------- */
  const getJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: ${r.status}`); return r.json(); });
  const optional = (u, empty) => getJSON(u).catch((e) => { console.warn(`[${u}]`, e.message); return empty; });
  Promise.all([getJSON('data.json'), optional('diagrams.json', { diagrams: [] }), optional('calculations.json', { calculations: [] })])
    .then(([data, dg, calc]) => init(data, dg, calc))
    .catch((err) => {
      const box = $('#loadError');
      box.hidden = false;
      box.innerHTML = `<b>Couldn't load data.json.</b> If you opened index.html directly from your files, run a local server instead
        (e.g. <code>python3 -m http.server</code> in this folder, then open <code>http://localhost:8000</code>). <span class="muted">(${esc(err.message)})</span>`;
    });

  function init(data, dg, calc) {
    DATA = data;
    SUBJECTS = data.subjects;
    // Keep only links that point to real terms (guards against hand-edit mistakes).
    const ids = new Set(data.terms.map((t) => t.id));
    TERMS = data.terms.map((t) => {
      const bad = (t.relatedTerms || []).filter((r) => !ids.has(r));
      if (bad.length) console.warn(`[data] ${t.id} links to missing ids:`, bad);
      return { ...t, relatedTerms: (t.relatedTerms || []).filter((r) => ids.has(r) && r !== t.id) };
    });
    // Make links symmetric for display.
    TERMS.forEach((t) => BY_ID.set(t.id, t));
    TERMS.forEach((t) => t.relatedTerms.forEach((r) => {
      const o = BY_ID.get(r);
      if (!o.relatedTerms.includes(t.id)) o.relatedTerms.push(t.id);
    }));
    TERMS.sort((a, b) => a.term.localeCompare(b.term));
    DIAGRAMS = (dg.diagrams || []).map((d) => ({ ...d, relatedTerms: (d.relatedTerms || []).filter((r) => {
      if (!BY_ID.has(r)) console.warn(`[diagrams] ${d.id} links to missing term ${r}`);
      return BY_ID.has(r);
    }) }));
    DIAGRAMS.forEach((d) => DG_BY_ID.set(d.id, d));
    CALCS = (calc.calculations || []).map((c) => ({ ...c, relatedTerms: (c.relatedTerms || []).filter((r) => BY_ID.has(r)) }));
    CALCS.forEach((c) => CALC_BY_ID.set(c.id, c));

    if (SUBJECT && !SUBJECTS[SUBJECT]) SUBJECT = '';
    setupTheme();
    setupTabs();
    setupSubjectToggle();
    Dict.init();
    Cards.init();
    Graph.init();
    Diagrams.init();
    Calcs.init();
    route();
    window.addEventListener('hashchange', route);
  }

  /* ---------------- routing / tabs ---------------- */
  function setupTabs() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => {
      const mode = b.dataset.mode;
      const cur = parseHash();
      location.hash = mode === 'dict' && cur.term ? `dict/${cur.term}`
        : mode === 'diagrams' && Diagrams.current ? `diagrams/${Diagrams.current}`
        : mode === 'calc' && Calcs.current ? `calc/${Calcs.current}` : mode;
    }));
  }
  function parseHash() {
    const [mode, term] = location.hash.replace(/^#/, '').split('/');
    const m = ['dict', 'cards', 'diagrams', 'calc', 'graph'].includes(mode) ? mode : 'dict';
    if (m === 'diagrams') return { mode: m, term: null, diagram: term && DG_BY_ID.has(term) ? term : null };
    if (m === 'calc') return { mode: m, term: null, calc: term && CALC_BY_ID.has(term) ? term : null };
    return { mode: m, term: term && BY_ID.has(term) ? term : null };
  }
  function route() {
    const { mode, term } = parseHash();
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    $$('.mode').forEach((m) => { m.hidden = m.id !== `mode-${mode}`; });
    if (mode === 'dict') {
      // opening a term from the other subject (e.g. a cross-subject chip) switches the subject with it
      if (term && SUBJECT && BY_ID.get(term).subject !== SUBJECT) { Dict.current = term; setSubject(BY_ID.get(term).subject); }
      Dict.show(term);
    }
    if (mode === 'graph') Graph.activate(term);
    if (mode === 'diagrams') Diagrams.show(parseHash().diagram);
    if (mode === 'calc' && parseHash().calc !== Calcs.current) Calcs.show(parseHash().calc);
    if (mode === 'calc' && !parseHash().calc) Calcs.show(null);
  }
  function goTerm(id) { location.hash = `dict/${id}`; }
  function goGraph(id) { location.hash = `graph/${id}`; }
  function goDiagram(id) { location.hash = `diagrams/${id}`; }
  function goCalc(id) { location.hash = `calc/${id}`; }

  /* ---------------- subject switch (applies to every mode) ---------------- */
  function paintSubjectToggle() {
    $$('.subject-toggle button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.subject === SUBJECT)));
    document.body.dataset.subject = SUBJECT ? subjClass(SUBJECT) : 'both';
  }
  function setupSubjectToggle() {
    paintSubjectToggle();
    $('.subject-toggle').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setSubject(b.dataset.subject);
    });
  }
  function setSubject(s) {
    if (s === SUBJECT) return;
    SUBJECT = s;
    store.set('ibdefs.subject', s);
    paintSubjectToggle();
    Dict.onSubject();
    Cards.renderBuilder();
    Graph.onSubject();
    Diagrams.onSubject();
    Calcs.onSubject();
  }

  function setupTheme() {
    $('#themeToggle').addEventListener('click', () => {
      const root = document.documentElement;
      const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('ibdefs.theme', root.dataset.theme); } catch (e) {}
    });
  }

  function fillSelect(sel, options, allLabel) {
    sel.innerHTML = `<option value="">${esc(allLabel)}</option>` + options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  }
  const unitsFor = (subject) => (subject ? SUBJECTS[subject] : Object.values(SUBJECTS).flat());
  const topicsFor = (subject, unit) => [...new Set(TERMS.filter((t) => (!subject || t.subject === subject) && (!unit || t.unit === unit)).map((t) => t.topic))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  function chip(t) {
    return `<button class="chip" data-id="${t.id}"><span class="dot ${subjClass(t.subject)}"></span>${esc(t.term)}</button>`;
  }
  function relatedChips(t) {
    const rel = t.relatedTerms.map((r) => BY_ID.get(r));
    const same = rel.filter((r) => r.subject === t.subject).sort((a, b) => a.term.localeCompare(b.term));
    const cross = rel.filter((r) => r.subject !== t.subject);
    return { same, cross };
  }

  /* ================= DICTIONARY ================= */
  const Dict = {
    current: null,
    init() {
      const unit = $('#dictUnit'), topic = $('#dictTopic');
      fillSelect(unit, unitsFor(SUBJECT), 'All units');
      fillSelect(topic, topicsFor(SUBJECT, ''), 'All topics');
      unit.addEventListener('change', () => { fillSelect(topic, topicsFor(SUBJECT, unit.value), 'All topics'); this.render(); });
      topic.addEventListener('change', () => this.render());
      $('#dictHL').addEventListener('change', () => this.render());
      $('#dictSearch').addEventListener('input', () => this.render());
      $('#dictSearch').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const first = $('#dictList li[data-id]'); if (first) goTerm(first.dataset.id); }
      });
      $('#dictList').addEventListener('click', (e) => { const li = e.target.closest('li[data-id]'); if (li) goTerm(li.dataset.id); });
      $('#dictDetail').addEventListener('click', (e) => {
        const cc0 = e.target.closest('[data-calc]'); if (cc0) return goCalc(cc0.dataset.calc);
        const c = e.target.closest('.chip'); if (c) return goTerm(c.dataset.id);
        const g = e.target.closest('[data-graph]'); if (g) return goGraph(g.dataset.graph);
        const dg = e.target.closest('[data-diagram]'); if (dg) return goDiagram(dg.dataset.diagram);
        const cc = e.target.closest('[data-calc]'); if (cc) return goCalc(cc.dataset.calc);
      });
      this.render();
    },
    filtered() {
      const q = $('#dictSearch').value.trim().toLowerCase();
      const s = SUBJECT, u = $('#dictUnit').value, tp = $('#dictTopic').value, hl = $('#dictHL').checked;
      let list = TERMS.filter((t) => (!s || t.subject === s) && (!u || t.unit === u) && (!tp || t.topic === tp) && (hl || !t.hl));
      if (q) {
        list = list.map((t) => {
          const name = t.term.toLowerCase();
          let score = 0;
          if (name.startsWith(q)) score = 3;
          else if (name.includes(q)) score = 2;
          else if (t.definition.toLowerCase().includes(q) || t.topic.toLowerCase().includes(q)) score = 1;
          return { t, score };
        }).filter((x) => x.score).sort((a, b) => b.score - a.score || a.t.term.localeCompare(b.t.term)).map((x) => x.t);
      }
      return { list, q };
    },
    render() {
      const { list, q } = this.filtered();
      const hi = (s) => {
        if (!q) return esc(s);
        const i = s.toLowerCase().indexOf(q);
        return i < 0 ? esc(s) : esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
      };
      $('#dictCount').textContent = `${list.length} term${list.length === 1 ? '' : 's'}`;
      const item = (t) => `
        <li role="option" data-id="${t.id}" aria-selected="${t.id === this.current}">
          <span class="dot ${subjClass(t.subject)}"></span>
          <span><span class="t-name">${hi(t.term)}</span><span class="t-topic">${esc(t.topic)}</span></span>
        </li>`;
      if (SUBJECT) {
        $('#dictList').innerHTML = list.map(item).join('');
      } else {
        // "Both": keep the two subjects visibly separate
        $('#dictList').innerHTML = Object.keys(SUBJECTS).map((s) => {
          const part = list.filter((t) => t.subject === s);
          if (!part.length) return '';
          return `<li class="list-head ${subjClass(s)}" role="presentation"><span>${esc(s)}</span><span>${part.length}</span></li>` + part.map(item).join('');
        }).join('');
      }
    },
    onSubject() {
      fillSelect($('#dictUnit'), unitsFor(SUBJECT), 'All units');
      fillSelect($('#dictTopic'), topicsFor(SUBJECT, ''), 'All topics');
      this.render();
      $('#dictList').scrollTop = 0;
      const cur = this.current && BY_ID.get(this.current);
      if (cur && SUBJECT && cur.subject !== SUBJECT) {
        this.current = null;
        if (parseHash().mode === 'dict') location.hash = 'dict';
        else this.show(null);
      } else {
        $$('#dictList li[data-id]').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.id === this.current)));
      }
    },
    show(id) {
      this.current = id;
      $$('#dictList li[data-id]').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.id === id)));
      const box = $('#dictDetail');
      if (!id) {
        box.innerHTML = `<div class="detail-inner"><p class="empty">Pick a term from the list, or start typing to search ${TERMS.length} definitions.</p></div>`;
        return;
      }
      const t = BY_ID.get(id);
      const { same, cross } = relatedChips(t);
      const dgs = DIAGRAMS.filter((d) => d.relatedTerms.includes(t.id));
      const cls = CALCS.filter((c) => c.relatedTerms.includes(t.id));
      box.innerHTML = `
        <div class="detail-inner">
          <div class="crumbs">
            <span class="tag ${subjClass(t.subject)}">${esc(t.subject)}</span>
            ${t.hl ? '<span class="tag hl">HL only</span>' : ''}
            <span>${esc(t.unit)}</span><span>›</span><span>${esc(t.topic)}</span>
          </div>
          <h2>${esc(t.term)}</h2>
          <p class="definition ${subjClass(t.subject)}">${esc(t.definition)}</p>
          ${t.whyTested ? `<p class="why"><b>Why it's tested</b><span>${esc(t.whyTested)}</span></p>` : ''}
          <div class="related">
            <h3>Related terms · ${t.relatedTerms.length}</h3>
            <div class="chips">${same.map(chip).join('')}</div>
            ${cross.length ? `<h3 style="margin-top:22px">Across subjects</h3><div class="chips">${cross.map(chip).join('')}</div>` : ''}
          </div>
          ${dgs.length ? `<div class="related"><h3>Diagrams · ${dgs.length}</h3><div class="dg-thumbs">${dgs.map((d) => `
            <button class="dg-thumb" data-diagram="${d.id}" title="${esc(d.title)}">${window.DiagramRenderer ? DiagramRenderer.render(d) : ''}<span>${esc(d.title)}</span></button>`).join('')}</div></div>` : ''}
          ${cls.length ? `<div class="related"><h3>Calculations · ${cls.length}</h3><div class="chips">${cls.map((c) => `<button class="chip calc-chip" data-calc="${c.id}"><span aria-hidden="true">=</span>${esc(c.title)}</button>`).join('')}</div></div>` : ''}
          <div class="detail-actions">
            <button class="btn" data-graph="${t.id}">View in graph →</button>
          </div>
        </div>`;
      box.scrollTop = 0;
      const sel = $(`#dictList li[data-id="${id}"]`);
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    },
  };

  /* ================= FLASHCARDS ================= */
  const Cards = {
    deck: [], i: 0, flipped: false, session: { known: 0, learning: 0 },
    init() {
      this.renderBuilder();
      $('#builderGrid').addEventListener('change', (e) => {
        const box = e.target;
        if (box.matches('.unit-check')) {
          $$(`.topic-check[data-unit="${CSS.escape(box.value)}"]`).forEach((c) => { c.checked = box.checked; });
        } else if (box.matches('.topic-check')) {
          const all = $$(`.topic-check[data-unit="${CSS.escape(box.dataset.unit)}"]`);
          const u = $(`.unit-check[value="${CSS.escape(box.dataset.unit)}"]`);
          u.checked = all.every((c) => c.checked);
          u.indeterminate = !u.checked && all.some((c) => c.checked);
        }
        this.updateSize();
      });
      $('#builderGrid').addEventListener('click', (e) => { if (e.target.closest('.unit-check')) e.stopPropagation(); });
      ['#deckHL', '#deckLearningOnly'].forEach((s) => $(s).addEventListener('change', () => this.updateSize()));
      $('#startDeck').addEventListener('click', () => this.start());
      $('#resetProgress').addEventListener('click', () => {
        if (!confirm('Reset all flashcard progress saved in this browser?')) return;
        progress = {}; store.set('ibdefs.progress', progress); this.renderBuilder();
      });
      $('#backToBuilder').addEventListener('click', () => this.exit());
      $('#flashcard').addEventListener('click', () => this.flip());
      $('#markKnown').addEventListener('click', () => this.grade('known'));
      $('#markLearning').addEventListener('click', () => this.grade('learning'));
      $('#shuffleNow').addEventListener('click', () => {
        const rest = this.deck.slice(this.i); shuffle(rest); this.deck.splice(this.i, rest.length, ...rest); this.showCard();
      });
      $('#redoLearning').addEventListener('click', () => {
        const ids = this.deck.filter((id) => progress[id] === 'learning');
        if (!ids.length) return this.exit();
        this.begin(ids);
      });
      $('#redoAll').addEventListener('click', () => this.begin([...this.deck]));
      document.addEventListener('keydown', (e) => {
        if ($('#mode-cards').hidden || $('#study').hidden || e.target.matches('input, select, textarea')) return;
        if (e.code === 'Space') { e.preventDefault(); this.flip(); }
        else if (e.key === 'ArrowRight') this.grade('known');
        else if (e.key === 'ArrowLeft') this.grade('learning');
      });
    },
    renderBuilder() {
      const sel = new Set($$('.topic-check:checked').map((c) => c.value));
      $('#builderGrid').innerHTML = Object.entries(SUBJECTS).filter(([subject]) => !SUBJECT || subject === SUBJECT).map(([subject, units]) => `
        <div class="subject-col">
          <h3><span class="dot ${subjClass(subject)}"></span>${esc(subject)}</h3>
          ${units.map((unit) => {
            const terms = TERMS.filter((t) => t.unit === unit);
            const known = terms.filter((t) => progress[t.id] === 'known').length;
            const topics = topicsFor(subject, unit);
            return `<details class="unit-box">
              <summary>
                <input type="checkbox" class="unit-check" value="${esc(unit)}" aria-label="Select ${esc(unit)}">
                <span class="u-name">${esc(unit)}</span>
                <span class="mini-bar" title="${known} of ${terms.length} known"><span style="width:${terms.length ? (100 * known) / terms.length : 0}%"></span></span>
                <span class="u-count">${known}/${terms.length}</span>
                <span class="chev">›</span>
              </summary>
              <div class="topic-list">
                ${topics.map((tp) => {
                  const k = `${unit}::${tp}`;
                  const n = terms.filter((t) => t.topic === tp).length;
                  return `<label class="check"><input type="checkbox" class="topic-check" data-unit="${esc(unit)}" value="${esc(k)}" ${sel.has(k) ? 'checked' : ''}> ${esc(tp)} <span class="muted">(${n})</span></label>`;
                }).join('')}
              </div>
            </details>`;
          }).join('')}
        </div>`).join('');
      // restore unit check state
      $$('.unit-check').forEach((u) => {
        const all = $$(`.topic-check[data-unit="${CSS.escape(u.value)}"]`);
        u.checked = all.length > 0 && all.every((c) => c.checked);
        u.indeterminate = !u.checked && all.some((c) => c.checked);
      });
      this.updateSize();
    },
    selection() {
      const keys = new Set($$('.topic-check:checked').map((c) => c.value));
      const hl = $('#deckHL').checked, learningOnly = $('#deckLearningOnly').checked;
      return TERMS.filter((t) => keys.has(`${t.unit}::${t.topic}`) && (hl || !t.hl) && (!learningOnly || progress[t.id] !== 'known')).map((t) => t.id);
    },
    updateSize() {
      const n = this.selection().length;
      $('#deckSize').textContent = n ? `${n} card${n === 1 ? '' : 's'}` : 'Nothing selected';
      $('#startDeck').disabled = !n;
    },
    start() {
      const ids = this.selection();
      if (!ids.length) return;
      this.begin(ids);
    },
    begin(ids) {
      this.deck = ids;
      if ($('#deckShuffle').checked) shuffle(this.deck);
      this.i = 0; this.session = { known: 0, learning: 0 };
      $('#deckBuilder').hidden = true; $('#study').hidden = false; $('#deckDone').hidden = true;
      $('.card-stage').hidden = false; $('.grade').hidden = false;
      this.showCard();
    },
    exit() {
      $('#study').hidden = true; $('#deckBuilder').hidden = false; this.renderBuilder();
    },
    showCard() {
      const total = this.deck.length;
      $('#progressFill').style.width = `${(100 * this.i) / total}%`;
      $('#counter').textContent = `${Math.min(this.i + 1, total)} / ${total} · ✓ ${this.session.known}`;
      if (this.i >= total) return this.finish();
      const t = BY_ID.get(this.deck[this.i]);
      const fc = $('#flashcard');
      fc.classList.remove('flipped'); this.flipped = false;
      fc.classList.toggle('bm', t.subject !== 'Economics');
      const status = progress[t.id] === 'known' ? ' · known' : progress[t.id] === 'learning' ? ' · still learning' : '';
      const meta = `${subjShort(t.subject)} · ${t.topic}${t.hl ? ' · HL' : ''}`;
      // set content after the flip-back transition starts so the answer never flashes
      setTimeout(() => {
        $('#cardMetaFront').textContent = meta + status;
        $('#cardMetaBack').textContent = t.term;
        $('#cardTerm').textContent = t.term;
        $('#cardDef').textContent = t.definition;
        $('#cardWhy').textContent = t.whyTested ? `Why it's tested: ${t.whyTested}` : '';
      }, this.i === 0 ? 0 : 120);
    },
    flip() {
      if (this.i >= this.deck.length) return;
      this.flipped = !this.flipped;
      $('#flashcard').classList.toggle('flipped', this.flipped);
    },
    grade(status) {
      if (this.i >= this.deck.length) return;
      const id = this.deck[this.i];
      progress[id] = status; store.set('ibdefs.progress', progress);
      this.session[status]++;
      this.i++;
      this.showCard();
    },
    finish() {
      $('.card-stage').hidden = true; $('.grade').hidden = true; $('#deckDone').hidden = false;
      $('#counter').textContent = `${this.deck.length} / ${this.deck.length}`;
      $('#doneStats').textContent = `${this.session.known} known · ${this.session.learning} still learning`;
      $('#redoLearning').hidden = !this.session.learning;
    },
  };
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ================= GRAPH ================= */
  const Graph = {
    built: false, selected: null,
    init() {
      fillSelect($('#graphUnit'), unitsFor(SUBJECT), 'All units');
      this.fillTerms();
      $('#graphUnit').addEventListener('change', () => this.build());
      $('#graphLabels').addEventListener('change', () => this.updateLabels());
      $('#graphReset').addEventListener('click', () => { this.select(null); this.fit(); });
      $('#graphSearch').addEventListener('change', (e) => this.searchFocus(e.target.value));
      $('#graphSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.searchFocus(e.target.value); });
      $('#graphPanel').addEventListener('click', (e) => {
        if (e.target.closest('.close')) return this.select(null);
        const c = e.target.closest('.chip'); if (c) return this.focusId(c.dataset.id);
        const d = e.target.closest('[data-dict]'); if (d) return goTerm(d.dataset.dict);
      });
      window.addEventListener('resize', () => { if (this.built && !$('#mode-graph').hidden) this.resize(); });
    },
    activate(id) {
      if (typeof d3 === 'undefined') {
        $('#graphPanel').hidden = false;
        $('#graphPanel').innerHTML = '<p>The graph library (d3) failed to load — check your connection.</p>';
        return;
      }
      if (!this.built || this.dirty) this.build();
      else this.resize();
      if (id) this.focusId(id);
    },
    fillTerms() {
      $('#graphTerms').innerHTML = TERMS.filter((t) => !SUBJECT || t.subject === SUBJECT).map((t) => `<option value="${esc(t.term)}"></option>`).join('');
    },
    onSubject() {
      fillSelect($('#graphUnit'), unitsFor(SUBJECT), 'All units');
      this.fillTerms();
      if (!this.built) return;
      if ($('#mode-graph').hidden) this.dirty = true;
      else this.build();
    },
    palette() {
      const css = getComputedStyle(document.documentElement);
      const econ = d3.color(css.getPropertyValue('--econ').trim()) || d3.color('#1f6f78');
      const bm = d3.color(css.getPropertyValue('--bm').trim()) || d3.color('#b8552a');
      const map = new Map();
      for (const [subject, units] of Object.entries(SUBJECTS)) {
        const base = d3.hsl(subject === 'Economics' ? econ : bm);
        units.forEach((u, k) => {
          const c = d3.hsl(base); const n = units.length;
          c.h = base.h + (k - (n - 1) / 2) * (subject === 'Economics' ? 16 : 11);
          c.l = Math.max(0.28, Math.min(0.68, base.l + (k % 2 ? 0.07 : -0.04)));
          map.set(u, c.formatHex());
        });
      }
      return map;
    },
    build() {
      const svgEl = $('#graph');
      this.dirty = false;
      const subj = SUBJECT, unit = $('#graphUnit').value;
      const nodes = TERMS.filter((t) => (!subj || t.subject === subj) && (!unit || t.unit === unit)).map((t) => ({ id: t.id, t }));
      const keep = new Set(nodes.map((n) => n.id));
      const seen = new Set(), links = [];
      nodes.forEach((n) => n.t.relatedTerms.forEach((r) => {
        if (!keep.has(r)) return;
        const k = n.id < r ? `${n.id}|${r}` : `${r}|${n.id}`;
        if (seen.has(k)) return; seen.add(k);
        links.push({ source: n.id, target: r, cross: n.t.subject !== BY_ID.get(r).subject });
      }));
      const deg = new Map(nodes.map((n) => [n.id, 0]));
      links.forEach((l) => { deg.set(l.source, deg.get(l.source) + 1); deg.set(l.target, deg.get(l.target) + 1); });
      nodes.forEach((n) => { n.deg = deg.get(n.id); n.r = 4 + Math.sqrt(n.deg) * 2.2; });

      const colors = this.palette();
      this.colors = colors;
      const unitsShown = [...new Set(nodes.map((n) => n.t.unit))];
      const allUnits = Object.values(SUBJECTS).flat().filter((u) => unitsShown.includes(u));
      // cluster centres on a ring, one per unit
      const centres = new Map();
      allUnits.forEach((u, k) => {
        const a = (k / allUnits.length) * Math.PI * 2 - Math.PI / 2;
        const R = allUnits.length > 1 ? 260 : 0;
        centres.set(u, { x: Math.cos(a) * R, y: Math.sin(a) * R });
      });

      if (this.sim) this.sim.stop();
      const svg = d3.select(svgEl);
      svg.selectAll('*').remove();
      const root = svg.append('g');
      this.root = root; this.svg = svg; this.nodes = nodes; this.links = links;

      const zoom = d3.zoom().scaleExtent([0.15, 5]).on('zoom', (e) => {
        root.attr('transform', e.transform); this.k = e.transform.k; this.updateLabels();
      });
      this.zoom = zoom; this.k = 1;
      svg.call(zoom).on('dblclick.zoom', null);
      svg.on('click', (e) => { if (e.target === svgEl) this.select(null); });

      const link = root.append('g').selectAll('line').data(links).join('line')
        .attr('class', (d) => 'link' + (d.cross ? ' cross' : ''));
      const node = root.append('g').selectAll('g').data(nodes, (d) => d.id).join('g').attr('class', 'node');
      node.append('circle').attr('r', (d) => d.r).attr('fill', (d) => colors.get(d.t.unit));
      node.append('text').text((d) => d.t.term).attr('x', (d) => d.r + 3).attr('y', 3.5);
      node.append('title').text((d) => `${d.t.term}\n${d.t.unit}`);
      node.on('click', (e, d) => { e.stopPropagation(); this.select(d.id); });
      node.call(d3.drag()
        .on('start', (e, d) => { if (!e.active) this.sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
        .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on('end', (e, d) => { if (!e.active) this.sim.alphaTarget(0); d.fx = null; d.fy = null; }));
      this.linkSel = link; this.nodeSel = node;

      this.sim = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id((d) => d.id).distance((l) => (l.cross ? 120 : 46)).strength((l) => (l.cross ? 0.05 : 0.5)))
        .force('charge', d3.forceManyBody().strength(-70).distanceMax(380))
        .force('collide', d3.forceCollide().radius((d) => d.r + 3))
        .force('x', d3.forceX((d) => centres.get(d.t.unit).x).strength(0.09))
        .force('y', d3.forceY((d) => centres.get(d.t.unit).y).strength(0.09))
        .on('tick', () => {
          link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
          node.attr('transform', (d) => `translate(${d.x},${d.y})`);
        });
      // settle a bit before first paint, then fit
      this.sim.stop();
      for (let i = 0; i < 220; i++) this.sim.tick();
      link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
      this.sim.alpha(0.05).restart();

      this.built = true;
      this.renderLegend(allUnits, colors);
      this.resize();
      this.fit(false);
      if (this.selected && keep.has(this.selected)) this.select(this.selected); else this.select(null);
    },
    resize() {
      const el = $('#graph');
      this.w = el.clientWidth; this.h = el.clientHeight;
      this.svg.attr('viewBox', [-this.w / 2, -this.h / 2, this.w, this.h]);
    },
    fit(animate = true) {
      if (!this.nodes.length) return;
      const xs = this.nodes.map((n) => n.x), ys = this.nodes.map((n) => n.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const k = Math.min(2.2, 0.9 * Math.min(this.w / (x1 - x0 + 60), this.h / (y1 - y0 + 60)));
      const tr = d3.zoomIdentity.scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      (animate ? this.svg.transition().duration(600) : this.svg).call(this.zoom.transform, tr);
    },
    renderLegend(units, colors) {
      const lg = $('#legend');
      let html = '', last = '';
      units.forEach((u) => {
        const s = Object.keys(SUBJECTS).find((k) => SUBJECTS[k].includes(u));
        if (s !== last) { html += `<div class="lg-head">${esc(s)}</div>`; last = s; }
        html += `<div class="lg-row" data-unit="${esc(u)}"><span class="dot" style="background:${colors.get(u)}"></span>${esc(u.replace(/^Unit \d+: /, ''))}</div>`;
      });
      lg.innerHTML = html;
      lg.onclick = (e) => {
        const r = e.target.closest('.lg-row'); if (!r) return;
        const s = Object.keys(SUBJECTS).find((k) => SUBJECTS[k].includes(r.dataset.unit));
        setSubject(s);
        $('#graphUnit').value = r.dataset.unit; this.build();
      };
    },
    updateLabels() {
      if (!this.nodeSel) return;
      const all = $('#graphLabels').checked;
      const sel = this.selected;
      const nb = sel ? new Set([sel, ...BY_ID.get(sel).relatedTerms]) : null;
      this.nodeSel.classed('show-label', (d) => all || (nb ? nb.has(d.id) : d.deg >= 7 || this.k > 1.6 || this.nodes.length < 45));
    },
    select(id) {
      this.selected = id;
      const svg = $('#graph');
      const panel = $('#graphPanel');
      if (!id || !this.nodes.some((n) => n.id === id)) {
        this.selected = null;
        svg.classList.remove('focusing');
        this.nodeSel.classed('hi', false).classed('sel', false);
        this.linkSel.classed('hi', false);
        panel.hidden = true;
        this.updateLabels();
        return;
      }
      const t = BY_ID.get(id);
      const nb = new Set([id, ...t.relatedTerms]);
      svg.classList.add('focusing');
      this.nodeSel.classed('hi', (d) => nb.has(d.id)).classed('sel', (d) => d.id === id);
      this.linkSel.classed('hi', (d) => d.source.id === id || d.target.id === id);
      this.updateLabels();
      const hidden = t.relatedTerms.filter((r) => !this.nodes.some((n) => n.id === r)).length;
      const { same, cross } = relatedChips(t);
      panel.hidden = false;
      panel.innerHTML = `
        <button class="close" aria-label="Close">×</button>
        <div class="crumbs"><span class="tag ${subjClass(t.subject)}">${subjShort(t.subject)}</span>${t.hl ? '<span class="tag hl">HL</span>' : ''}<span>${esc(t.topic)}</span></div>
        <h2>${esc(t.term)}</h2>
        <p class="def">${esc(t.definition)}</p>
        <div class="panel-sub">Connected · ${t.relatedTerms.length}${hidden ? ` (${hidden} outside this filter)` : ''}</div>
        <div class="chips">${[...same, ...cross].map(chip).join('')}</div>
        <button class="btn" data-dict="${t.id}">Open in dictionary →</button>`;
    },
    focusId(id) {
      if (!this.nodes.some((n) => n.id === id)) {
        // term is outside the current filter: show its subject (or both) and rebuild
        const s = BY_ID.get(id).subject;
        this.selected = id;
        if (SUBJECT && SUBJECT !== s) setSubject(s);
        fillSelect($('#graphUnit'), unitsFor(SUBJECT), 'All units');
        this.build();
      }
      this.select(id);
      const n = this.nodes.find((x) => x.id === id);
      if (!n) return;
      const k = Math.max(this.k || 1, 1.5);
      this.svg.transition().duration(650).call(this.zoom.transform, d3.zoomIdentity.scale(k).translate(-n.x, -n.y));
    },
    searchFocus(q) {
      q = q.trim().toLowerCase(); if (!q) return;
      const pool = TERMS.filter((x) => !SUBJECT || x.subject === SUBJECT);
      const t = pool.find((x) => x.term.toLowerCase() === q) || pool.find((x) => x.term.toLowerCase().startsWith(q)) || pool.find((x) => x.term.toLowerCase().includes(q))
        || TERMS.find((x) => x.term.toLowerCase() === q) || TERMS.find((x) => x.term.toLowerCase().startsWith(q)) || TERMS.find((x) => x.term.toLowerCase().includes(q));
      if (t) this.focusId(t.id);
    },
  };

  /* ================= DIAGRAMS ================= */
  const Diagrams = {
    current: null, step: 0,
    init() {
      const unit = $('#dgUnit');
      fillSelect(unit, SUBJECTS.Economics || [], 'All units');
      unit.addEventListener('change', () => this.renderList());
      $('#dgHL').addEventListener('change', () => this.renderList());
      $('#dgSearch').addEventListener('input', () => this.renderList());
      $('#dgSearch').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const first = $('#dgList li[data-id]'); if (first) goDiagram(first.dataset.id); }
      });
      $('#dgList').addEventListener('click', (e) => { const li = e.target.closest('li[data-id]'); if (li) goDiagram(li.dataset.id); });
      $('#dgDetail').addEventListener('click', (e) => {
        const cc = e.target.closest('[data-calc]'); if (cc) return goCalc(cc.dataset.calc);
        const c = e.target.closest('.chip'); if (c) return goTerm(c.dataset.id);
        const st = e.target.closest('[data-step]'); if (st) return this.go(+st.dataset.step);
        const a = e.target.closest('[data-act]'); if (!a) return;
        const act = a.dataset.act;
        if (act === 'prev') this.go(this.step - 1);
        else if (act === 'next') this.go(this.step + 1);
        else if (act === 'all') this.go(this.count() - 1);
        else if (act === 'first') this.go(0);
        else if (act === 'svg') this.download();
        else if (act === 'econ') setSubject('Economics');
      });
      document.addEventListener('keydown', (e) => {
        if ($('#mode-diagrams').hidden || !this.current || e.target.matches('input, select, textarea')) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); this.go(this.step + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); this.go(this.step - 1); }
      });
      this.renderList();
    },
    count() { const d = DG_BY_ID.get(this.current); return d ? DiagramRenderer.stepCount(d) : 1; },
    filtered() {
      const q = $('#dgSearch').value.trim().toLowerCase(), u = $('#dgUnit').value, hl = $('#dgHL').checked;
      return DIAGRAMS.filter((d) => (!u || d.unit === u) && (hl || !d.hl) && (!q
        || d.title.toLowerCase().includes(q) || d.topic.toLowerCase().includes(q) || (d.summary || '').toLowerCase().includes(q)
        || d.relatedTerms.some((r) => BY_ID.get(r).term.toLowerCase().includes(q))));
    },
    renderList() {
      const list = this.filtered();
      $('#dgCount').textContent = `${list.length} diagram${list.length === 1 ? '' : 's'}`;
      let lastUnit = null, lastTopic = null, html = '';
      for (const d of list) {
        if (d.unit !== lastUnit) { html += `<li class="list-head econ" role="presentation"><span>${esc(d.unit)}</span></li>`; lastUnit = d.unit; lastTopic = null; }
        if (d.topic !== lastTopic) { html += `<li class="dg-topic" role="presentation">${esc(d.topic)}</li>`; lastTopic = d.topic; }
        html += `<li role="option" data-id="${d.id}" aria-selected="${d.id === this.current}">
          <span class="dg-ico" aria-hidden="true">${d.kind === 'flow' ? '⇄' : d.kind === 'matrix' ? '▦' : '⟋'}</span>
          <span><span class="t-name">${esc(d.title)}</span>${d.hl ? '<span class="t-topic">HL only</span>' : ''}</span></li>`;
      }
      $('#dgList').innerHTML = html || '<li class="dg-topic" role="presentation">No diagrams match.</li>';
    },
    onSubject() { this.show(this.current); },
    show(id) {
      this.current = id;
      $$('#dgList li[data-id]').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.id === id)));
      const box = $('#dgDetail');
      if (SUBJECT === 'Business Management') {
        box.innerHTML = `<div class="detail-inner"><p class="empty">Diagrams cover the Economics syllabus.</p>
          <div class="detail-actions"><button class="btn" data-act="econ">Switch to Economics →</button></div></div>`;
        return;
      }
      if (!id) {
        const hl = DIAGRAMS.filter((d) => d.hl).length;
        box.innerHTML = `<div class="detail-inner"><p class="empty">Pick a diagram — ${DIAGRAMS.length} in total, ${DIAGRAMS.length - hl} SL/HL and ${hl} HL-only. Each one builds step by step: use the buttons or the ← → keys.</p></div>`;
        return;
      }
      this.step = 0;
      const d = DG_BY_ID.get(id);
      const rel = d.relatedTerms.map((r) => BY_ID.get(r));
      box.innerHTML = `
        <div class="detail-inner dg-inner">
          <div class="crumbs">
            <span class="tag econ">Economics</span>${d.hl ? '<span class="tag hl">HL only</span>' : ''}
            <span>${esc(d.unit)}</span><span>›</span><span>${esc(d.topic)}</span>
          </div>
          <h2>${esc(d.title)}</h2>
          ${d.summary ? `<p class="dg-summary">${esc(d.summary)}</p>` : ''}
          <figure class="dg-figure" id="dgFigure"></figure>
          <div class="dg-controls">
            <button class="btn ghost" data-act="first" title="Back to start" aria-label="Back to start">⟲</button>
            <button class="btn" data-act="prev" aria-label="Previous step">← Prev</button>
            <span class="dg-stepnum" id="dgStepNum"></span>
            <button class="btn primary" data-act="next" aria-label="Next step">Next →</button>
            <button class="btn ghost" data-act="all">Show all</button>
            <span class="spacer"></span>
            <button class="btn ghost" data-act="svg" title="Download as SVG">Download SVG</button>
          </div>
          <ol class="dg-steps" id="dgSteps">${(d.steps || []).map((s, i) => `<li data-step="${i}">${esc(s)}</li>`).join('')}</ol>
          ${d.examTips && d.examTips.length ? `<div class="dg-tips"><h3>Exam tips</h3><ul>${d.examTips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
          ${CALCS.some((c) => (c.diagrams || []).includes(d.id)) ? `<div class="related"><h3>Calculations</h3><div class="chips">${CALCS.filter((c) => (c.diagrams || []).includes(d.id)).map((c) => `<button class="chip calc-chip" data-calc="${c.id}"><span aria-hidden="true">=</span>${esc(c.title)}</button>`).join('')}</div></div>` : ''}
          ${rel.length ? `<div class="related"><h3>Terms on this diagram · ${rel.length}</h3><div class="chips">${rel.map(chip).join('')}</div></div>` : ''}
        </div>`;
      box.scrollTop = 0;
      this.paint();
      const sel = $(`#dgList li[data-id="${id}"]`);
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    },
    go(n) { this.step = Math.max(0, Math.min(this.count() - 1, n)); this.paint(); },
    paint() {
      const d = DG_BY_ID.get(this.current); if (!d) return;
      const n = this.count();
      $('#dgFigure').innerHTML = DiagramRenderer.render(d, this.step);
      $('#dgStepNum').textContent = `Step ${this.step + 1} / ${n}`;
      $('[data-act="prev"]').disabled = this.step === 0;
      $('[data-act="next"]').disabled = this.step >= n - 1;
      $$('#dgSteps li').forEach((li) => {
        const i = +li.dataset.step;
        li.classList.toggle('is-done', i < this.step);
        li.classList.toggle('is-now', i === this.step);
      });
    },
    download() {
      const d = DG_BY_ID.get(this.current); if (!d) return;
      // Render the finished diagram off-screen with the page's styles, then inline the computed
      // styles so the file looks the same in any SVG viewer (no CSS variables or classes needed).
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px';
      host.innerHTML = DiagramRenderer.render(d);
      document.body.appendChild(host);
      const root = host.firstElementChild;
      const PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
        'font-family', 'font-size', 'font-weight', 'font-style', 'paint-order'];
      root.querySelectorAll('*').forEach((el) => {
        const c = getComputedStyle(el);
        if (c.display === 'none' && el.tagName !== 'marker' && !el.closest('marker')) { el.remove(); return; }
        // color-mix() resolves to color(srgb r g b / a), which many SVG viewers don't understand
        const rgb = (val) => val.replace(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)/g,
          (m, r, g, bl, al) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(bl * 255)},${al === undefined ? 1 : al})`);
        el.setAttribute('style', PROPS.map((k) => `${k}:${rgb(c.getPropertyValue(k))}`).join(';'));
        el.removeAttribute('class');
      });
      root.removeAttribute('class');
      root.setAttribute('style', `background:${getComputedStyle(document.documentElement).getPropertyValue('--card').trim()}`);
      const svg = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
      host.remove();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      a.download = `${d.id.replace(/^dg-/, '')}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
  };

  /* ================= CALCULATIONS ================= */
  const pre = (u) => (u.startsWith('$') ? '<span>$</span>' : u === '€' ? '<span>€</span>' : '');
  const suf = (u) => { const s = u === '%' ? '%' : u.startsWith('$') ? u.slice(1) : u === '€' ? '' : u; return s ? `<span>${esc(s)}</span>` : ''; };
  const Calcs = {
    current: null, inst: null, checked: false, streak: 0,
    solved: store.get('ibdefs.calc', {}), // id -> number of questions answered fully correctly
    init() {
      fillSelect($('#calcUnit'), SUBJECTS.Economics || [], 'All units');
      $('#calcUnit').addEventListener('change', () => this.renderList());
      $('#calcHL').addEventListener('change', () => this.renderList());
      $('#calcSearch').addEventListener('input', () => this.renderList());
      $('#calcSearch').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { const first = $('#calcList li[data-id]'); if (first) goCalc(first.dataset.id); }
      });
      $('#calcList').addEventListener('click', (e) => { const li = e.target.closest('li[data-id]'); if (li) goCalc(li.dataset.id); });
      $('#calcDetail').addEventListener('click', (e) => {
        const c = e.target.closest('.chip'); if (c) return goTerm(c.dataset.id);
        const dg = e.target.closest('[data-diagram]'); if (dg) return goDiagram(dg.dataset.diagram);
        const ch = e.target.closest('[data-choice]');
        if (ch) {
          const row = ch.closest('.cq-part');
          $$('[data-choice]', row).forEach((b) => b.setAttribute('aria-pressed', String(b === ch)));
          row.dataset.value = ch.dataset.choice;
          return;
        }
        const a = e.target.closest('[data-act]'); if (!a) return;
        if (a.dataset.act === 'check') this.check();
        else if (a.dataset.act === 'working') this.reveal();
        else if (a.dataset.act === 'new') this.newQuestion();
        else if (a.dataset.act === 'econ') setSubject('Economics');
      });
      $('#calcDetail').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('.cq-part input')) { e.preventDefault(); this.checked ? this.newQuestion() : this.check(); }
      });
      this.renderList();
    },
    filtered() {
      const q = $('#calcSearch').value.trim().toLowerCase(), u = $('#calcUnit').value, hl = $('#calcHL').checked;
      return CALCS.filter((c) => (!u || c.unit === u) && (hl || !c.hl) && (!q
        || c.title.toLowerCase().includes(q) || c.topic.toLowerCase().includes(q) || c.formulas.join(' ').toLowerCase().includes(q)
        || c.relatedTerms.some((r) => BY_ID.get(r).term.toLowerCase().includes(q))));
    },
    renderList() {
      const list = this.filtered();
      const done = list.filter((c) => this.solved[c.id]).length;
      $('#calcCount').textContent = `${list.length} calculation${list.length === 1 ? '' : 's'} · ${done} practised`;
      let lastUnit = null, lastTopic = null, html = '';
      for (const c of list) {
        if (c.unit !== lastUnit) { html += `<li class="list-head econ" role="presentation"><span>${esc(c.unit)}</span></li>`; lastUnit = c.unit; lastTopic = null; }
        if (c.topic !== lastTopic) { html += `<li class="dg-topic" role="presentation">${esc(c.topic)}</li>`; lastTopic = c.topic; }
        html += `<li role="option" data-id="${c.id}" aria-selected="${c.id === this.current}">
          <span class="dg-ico${this.solved[c.id] ? ' done' : ''}" aria-hidden="true">${this.solved[c.id] ? '✓' : '='}</span>
          <span><span class="t-name">${esc(c.title)}</span>${c.hl ? '<span class="t-topic">HL only</span>' : ''}</span></li>`;
      }
      $('#calcList').innerHTML = html || '<li class="dg-topic" role="presentation">No calculations match.</li>';
    },
    onSubject() { this.show(this.current); },
    show(id) {
      this.current = id;
      $$('#calcList li[data-id]').forEach((li) => li.setAttribute('aria-selected', String(li.dataset.id === id)));
      const box = $('#calcDetail');
      if (SUBJECT === 'Business Management') {
        box.innerHTML = `<div class="detail-inner"><p class="empty">Calculations cover the Economics syllabus.</p>
          <div class="detail-actions"><button class="btn" data-act="econ">Switch to Economics →</button></div></div>`;
        return;
      }
      if (!id) {
        const hl = CALCS.filter((c) => c.hl).length;
        box.innerHTML = `<div class="detail-inner"><p class="empty">Pick a calculation — ${CALCS.length} in total, ${CALCS.length - hl} SL/HL and ${hl} HL-only. Each has the formula, a worked example and unlimited practice questions with new numbers every time.</p></div>`;
        return;
      }
      const c = CALC_BY_ID.get(id);
      let ex;
      try { ex = CalcEngine.generate(c.practice, Math.random, c.example); } catch (e) { console.warn(`[calc] ${id} example`, e); }
      const rel = c.relatedTerms.map((r) => BY_ID.get(r));
      const dgs = (c.diagrams || []).map((d) => DG_BY_ID.get(d)).filter(Boolean);
      box.innerHTML = `
        <div class="detail-inner dg-inner">
          <div class="crumbs">
            <span class="tag econ">Economics</span>${c.hl ? '<span class="tag hl">HL only</span>' : ''}
            <span>${esc(c.unit)}</span><span>›</span><span>${esc(c.topic)}</span>
          </div>
          <h2>${esc(c.title)}</h2>
          <div class="calc-formula">${c.formulas.map((f) => `<div>${esc(f)}</div>`).join('')}</div>
          <p class="dg-summary">${esc(c.meaning)}</p>
          <p class="calc-tip"><b>Remember</b><span>${esc(c.tip)}</span></p>
          ${ex ? `<section class="calc-block">
            <h3>Worked example</h3>
            <p class="cq-text">${esc(ex.question)}</p>
            <ol class="calc-steps">${ex.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
            <p class="calc-answer">${ex.parts.map((p) => `<span><b>${esc(p.label)}:</b> ${esc(CalcEngine.show(p))}</span>`).join('')}</p>
          </section>` : ''}
          <section class="calc-block calc-practice">
            <div class="calc-practice-head"><h3>Practice</h3><span class="muted" id="calcStreak"></span></div>
            <div id="calcQ"></div>
          </section>
          ${dgs.length ? `<div class="related"><h3>Diagrams</h3><div class="dg-thumbs">${dgs.map((d) => `
            <button class="dg-thumb" data-diagram="${d.id}" title="${esc(d.title)}">${DiagramRenderer.render(d)}<span>${esc(d.title)}</span></button>`).join('')}</div></div>` : ''}
          ${rel.length ? `<div class="related"><h3>Related terms · ${rel.length}</h3><div class="chips">${rel.map(chip).join('')}</div></div>` : ''}
        </div>`;
      box.scrollTop = 0;
      this.newQuestion(false);
      const sel = $(`#calcList li[data-id="${id}"]`);
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    },
    newQuestion(focus = true) {
      const c = CALC_BY_ID.get(this.current); if (!c) return;
      this.inst = CalcEngine.generate(c.practice);
      this.checked = false;
      const q = this.inst;
      $('#calcQ').innerHTML = `
        <p class="cq-text">${esc(q.question)}</p>
        <div class="cq-parts">${q.parts.map((p, i) => `
          <div class="cq-part" data-i="${i}">
            <label for="cq${i}">${esc(p.label)}</label>
            ${p.choices
              ? `<div class="cq-choices" role="group" aria-label="${esc(p.label)}">${p.choices.map((ch) => `<button type="button" class="btn ghost" data-choice="${esc(ch)}" aria-pressed="false">${esc(ch)}</button>`).join('')}</div>`
              : `<div class="cq-input">${pre(p.unit)}<input id="cq${i}" inputmode="decimal" autocomplete="off" placeholder="?">${suf(p.unit)}</div>`}
            <span class="cq-mark" aria-live="polite"></span>
          </div>`).join('')}</div>
        <div class="dg-controls">
          <button class="btn primary" data-act="check">Check</button>
          <button class="btn" data-act="working">Show working</button>
          <span class="spacer"></span>
          <button class="btn ghost" data-act="new">New question ↻</button>
        </div>
        <ol class="calc-steps" id="calcWorking" hidden>${q.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <p class="muted calc-note">Round to 2 decimal places where needed; answers within about 1% are accepted.</p>`;
      this.paintStreak();
      if (focus) { const first = $('#calcQ input'); if (first) first.focus(); }
    },
    check() {
      const q = this.inst; if (!q) return;
      let allRight = true, anyBlank = false;
      $$('#calcQ .cq-part').forEach((row) => {
        const p = q.parts[+row.dataset.i];
        const input = p.choices ? row.dataset.value : $('input', row).value;
        const mark = $('.cq-mark', row);
        if (!input) { anyBlank = true; allRight = false; mark.textContent = ''; row.dataset.state = ''; return; }
        const ok = CalcEngine.check(p, input);
        if (ok === null) { allRight = false; mark.textContent = 'Enter a number'; row.dataset.state = 'bad'; return; }
        row.dataset.state = ok ? 'good' : 'bad';
        mark.textContent = ok ? '✓' : '✗';
        if (!ok) allRight = false;
      });
      if (anyBlank && !$$('#calcQ .cq-part[data-state]').some((r) => r.dataset.state)) return;
      if (!this.checked) {
        this.checked = true;
        if (allRight) {
          this.streak++;
          this.solved[this.current] = (this.solved[this.current] || 0) + 1;
          store.set('ibdefs.calc', this.solved);
          this.renderList();
        } else if (!anyBlank) this.streak = 0;
      }
      if (allRight) { $('#calcWorking').hidden = false; }
      this.paintStreak(allRight);
    },
    reveal() {
      const q = this.inst; if (!q) return;
      $$('#calcQ .cq-part').forEach((row) => {
        const p = q.parts[+row.dataset.i];
        if (row.dataset.state !== 'good') { $('.cq-mark', row).textContent = '→ ' + CalcEngine.show(p); row.dataset.state = row.dataset.state || 'shown'; }
      });
      $('#calcWorking').hidden = false;
      if (!this.checked) { this.checked = true; this.streak = 0; this.paintStreak(); }
    },
    paintStreak(justRight) {
      const n = this.solved[this.current] || 0;
      $('#calcStreak').textContent = (justRight ? 'Correct! ' : '') + (this.streak > 1 ? `${this.streak} in a row · ` : '') + `${n} solved`;
    },
  };
})();
