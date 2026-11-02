/* IB Definitions Lab — dictionary, flashcards and concept graph.
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
  let progress = store.get('ibdefs.progress', {}); // id -> 'known' | 'learning'
  let SUBJECT = store.get('ibdefs.subject', ''); // '' = both subjects

  /* ---------------- boot ---------------- */
  fetch('data.json')
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init)
    .catch((err) => {
      const box = $('#loadError');
      box.hidden = false;
      box.innerHTML = `<b>Couldn't load data.json.</b> If you opened index.html directly from your files, run a local server instead
        (e.g. <code>python3 -m http.server</code> in this folder, then open <code>http://localhost:8000</code>). <span class="muted">(${esc(err.message)})</span>`;
    });

  function init(data) {
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

    if (SUBJECT && !SUBJECTS[SUBJECT]) SUBJECT = '';
    setupTheme();
    setupTabs();
    setupSubjectToggle();
    Dict.init();
    Cards.init();
    Graph.init();
    route();
    window.addEventListener('hashchange', route);
  }

  /* ---------------- routing / tabs ---------------- */
  function setupTabs() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => {
      const mode = b.dataset.mode;
      const cur = parseHash();
      location.hash = mode === 'dict' && cur.term ? `dict/${cur.term}` : mode;
    }));
  }
  function parseHash() {
    const [mode, term] = location.hash.replace(/^#/, '').split('/');
    return { mode: ['dict', 'cards', 'graph'].includes(mode) ? mode : 'dict', term: term && BY_ID.has(term) ? term : null };
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
  }
  function goTerm(id) { location.hash = `dict/${id}`; }
  function goGraph(id) { location.hash = `graph/${id}`; }

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
        const c = e.target.closest('.chip'); if (c) return goTerm(c.dataset.id);
        const g = e.target.closest('[data-graph]'); if (g) return goGraph(g.dataset.graph);
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
})();
