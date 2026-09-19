/*
  DD Design Companion — app logic (P0: Possibility Space).
  Reads window.DDC_DATA (generated into data.js by build-data.mjs).

  Architecture (adapted from the build-calc skeleton):
    - CATALOG-BROWSER-FIRST: top-nav of views; each catalog view = category chips + search
      + a tile grid. Clicking a tile opens a DETAIL OVERLAY on #detail-overlay-root.
    - Overlays statically framed (CSS); every re-render PRESERVES the main scrollTop.
    - Category/domain/group colours come from DATA (assigned in build-data.mjs) and are injected
      as --aff-color/--aff-text — never hard-coded per-id in CSS.
    - Event delegation: one click handler per root, bound once at init.
*/
(function () {
  "use strict";

  const DATA = window.DDC_DATA || { carriers: { items: [] }, surfaces: {}, bridge: { sections: [], triggers: [] }, meta: {} };
  const UI_KEY = "ddc.ui";

  // The top-level views. `carriers` = the author-first front door; catalog views read
  // DATA.surfaces[key] (the palette they link into); bridge is bespoke; soon = P1 stub.
  const VIEWS = [
    { key: "wizard",    label: "Wizard",         kind: "wizard" },
    { key: "designElements", label: "Design Elements", kind: "carriers", group: "appendix" },
    { key: "effects",   label: "Effects",       kind: "catalog", group: "appendix" },
    { key: "buffStats", label: "Buff Stats",    kind: "catalog", group: "appendix" },
    { key: "buffRules", label: "Rule Gates",    kind: "catalog", group: "appendix" },
    { key: "bridge",    label: "Bridge",        kind: "bridge",  group: "appendix" },
    { key: "heroes",    label: "Hero Designs",  kind: "soon"    },
    { key: "balance",   label: "Balance Scales",kind: "soon"    },
  ];
  const carriers = () => (DATA.carriers && DATA.carriers.items) || [];
  const carrierById = (id) => carriers().find((c) => c.id === id);

  // the 4 wizard questions (Q1 is the entry-point pick; Q2-Q4 are the accordion steps)
  const WIZ_STEPS = [
    { key: "building", q: "What are you building?" },
    { key: "forced",   q: "What's forced by this starting point?" },
    { key: "choices",  q: "What design choices does it give you?" },
    { key: "limits",   q: "What's the hard limit here?" },
  ];

  const INTRO = {
    designElements: "The things you <b>author</b>, and how each one reaches the palette. A <b>buff</b> is the leaf (a stat modifier, gatable by any rule); an <b>effect</b> is the only bridge to it for carriers that can't hold a buff. Pick what you're building to see its wiring — <b>B</b> holds buffs directly · <b>E</b> carries effects · <b>T</b> fires on a trigger · <b>S</b> sets base stats.",
    effects:   "Skill <b>effects</b> — every payload a combat skill can carry (damage, control, movement, buffs, stress, stealth…). Filter by intent, search by plain-language keyword, open one for its authoring syntax and examples.",
    buffStats: "Buff <b>stat_types</b> — the 93 stat modifiers a buff can apply. These are what a skill reaches through the bridge. Watch the <b>unit</b> convention (fractional vs raw vs flag) — it's the #1 authoring trap.",
    buffRules: "<b>rule_type</b> gates — the 55 “only-while-X” conditionals that make a buff situational (low HP, front rank, vs a monster type, at Death's Door…). This is the creative layer: the same stat gains character from its gate.",
    bridge:    "The <b>effect → buff bridge</b>: how a skill applies a buff, what named buffs unlock that a skill line or inline effect cannot, and the 22 trinket-trigger firing points.",
  };

  // ── state ──
  const state = load();
  function load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { s = {}; }
    return {
      view: VIEWS.some(v => v.key === s.view && v.kind !== "soon") ? s.view : "wizard",
      cat: s.cat || {},        // { viewKey: activeCategoryId | "all" }
      search: s.search || {},  // { viewKey: query }
      wizard: s.wizard && typeof s.wizard === "object" ? { pick: s.wizard.pick || null, step: s.wizard.step || 1 } : { pick: null, step: 1 },
    };
  }
  function persist() {
    localStorage.setItem(UI_KEY, JSON.stringify({ view: state.view, cat: state.cat, search: state.search, wizard: state.wizard }));
  }

  // ── helpers ──
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function textColorFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return "#fff";
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? "#111" : "#fff";
  }
  const surface = (key) => DATA.surfaces && DATA.surfaces[key];
  const groupsOf = (s) => (s && s.groups) || [];
  const itemsOf = (s) => (s && s.items) || [];
  const groupMap = (s) => new Map(groupsOf(s).map(g => [g.id, g]));

  // group accessor: each surface names its group field differently (category/domain/group)
  function itemGroupId(s, it) { return it[s.groupKey]; }

  // ── colour helpers for a group/tag ──
  function tagBanner(group) {
    if (!group) return "";
    return `<span class="tag-banner"><span class="tag-banner-label"
      style="--aff-color:${esc(group.color)};--aff-text:${esc(group.text)}">${esc(group.name)}</span></span>`;
  }

  // ═══ MASTHEAD + NAV ═══
  function navHTML() {
    const btn = (v) => {
      if (v.kind === "soon")
        return `<button disabled title="Coming in P1">${esc(v.label)}<span class="soon">soon</span></button>`;
      const active = v.key === state.view ? " active" : "";
      return `<button class="${active.trim()}" data-action="view" data-view="${v.key}">${esc(v.label)}</button>`;
    };
    const wizard = VIEWS.filter(v => v.kind === "wizard").map(btn).join("");
    const appendix = VIEWS.filter(v => v.group === "appendix").map(btn).join("");
    const soon = VIEWS.filter(v => v.kind === "soon").map(btn).join("");
    // Wizard is the front door; the reference surfaces sit under an "Appendix" label.
    return `<nav class="surface-nav">${wizard}<span class="nav-label">Appendix</span>${appendix}<span style="flex:1"></span>${soon}</nav>`;
  }

  // ═══ MAIN RENDER ═══
  function renderApp() {
    const app = document.getElementById("app");
    const prevMain = app.querySelector(".surface-main");
    const prevScroll = prevMain ? prevMain.scrollTop : 0;

    const view = VIEWS.find(v => v.key === state.view);
    let body = "";
    if (view.kind === "wizard") body = wizardHTML();
    else if (view.kind === "carriers") body = carriersHTML();
    else if (view.kind === "catalog") body = catalogHTML(view.key);
    else if (view.kind === "bridge") body = bridgeHTML();

    app.innerHTML = `
      <header class="app-header">
        <h1>Darkest <span class="tag">Design</span> Companion</h1>
        <span class="subtitle">overhaul mod · possibility space</span>
      </header>
      ${navHTML()}
      <main class="surface-main">${body}</main>`;

    const newMain = app.querySelector(".surface-main");
    if (newMain) newMain.scrollTop = prevScroll;
  }

  // ═══ WIZARD — the guided front door (4 questions over the 14 carriers) ═══
  const VIEW_LABEL = { designElements: "Design Elements", effects: "Effects", buffStats: "Buff Stats", buffRules: "Rule Gates", bridge: "Bridge" };
  function wizLink(link) {
    if (!link || !link.view) return "";
    return `<button class="wiz-link" data-action="goto-view" data-view="${esc(link.view)}"${link.id ? ` data-id="${esc(link.id)}"` : ""}>${esc(VIEW_LABEL[link.view] || link.view)} →</button>`;
  }
  function wizList(arr, kind, empty) {
    if (!Array.isArray(arr) || !arr.length) return `<p class="muted">${esc(empty)}</p>`;
    return `<ul class="wiz-list">` + arr.map(it => `<li class="wiz-item wiz-${kind}">
      <div class="wiz-item-h">${esc(it.element || it.choice || "")}</div>
      <div class="wiz-item-b">${esc(it.why || it.detail || "")}</div>
      ${wizLink(it.link)}
    </li>`).join("") + `</ul>`;
  }
  function wizLimits(arr) {
    if (!Array.isArray(arr) || !arr.length) return `<p class="muted">No hard engine limit recorded for this entry point.</p>`;
    return `<ul class="wiz-list">` + arr.map(it => `<li class="wiz-item wiz-limit">
      <div class="wiz-item-h">✕&nbsp; ${esc(it.limit || "")}</div>
      <div class="wiz-item-b">${esc(it.why || "")}</div>
    </li>`).join("") + `</ul>`;
  }

  function wizardHTML() {
    const w = state.wizard;
    const items = carriers();
    if (!items.length) return `<p class="empty-state">No carriers. Run <code>node build-data.mjs</code>.</p>`;

    // Q1 — entry-point picker
    if (!w.pick || !carrierById(w.pick)) {
      const cards = items.map(c => {
        const icon = c.icon ? `<img class="carrier-icon" src="${esc(c.icon)}" alt="" onerror="this.style.visibility='hidden'">` : "";
        return `<div class="carrier-card" data-action="wizard-pick" data-id="${esc(c.id)}">
          <div class="carrier-head">${icon}<span class="carrier-name">${esc(c.name)}</span></div>
          ${wiringBadges(c)}
          <div class="carrier-summary">${esc(c.summary || "")}</div>
        </div>`;
      }).join("");
      return `<p class="surface-intro"><b>Step 1 — What are you building?</b> Pick a starting point; the wizard walks what it <b>forces</b>, the <b>choices</b> it gives you, and the <b>hard limit</b> you'll hit. Full reference lives in the <b>Appendix</b> tabs.</p>
        <div class="carrier-grid">${cards}</div>`;
    }

    // Q2–Q4 — stepped accordion for the picked carrier
    const c = carrierById(w.pick);
    const step = Math.min(Math.max(w.step || 1, 1), 4);
    const rail = WIZ_STEPS.map((s, i) => {
      const n = i + 1, cls = n === step ? "active" : (n < step ? "done" : "");
      return `<button class="wiz-step ${cls}" data-action="wizard-step" data-step="${n}">
        <span class="wiz-step-n">${n}</span><span class="wiz-step-q">${esc(s.q)}</span></button>`;
    }).join("");

    let content = "";
    if (step === 1) {
      content = `<div class="wiz-building">
        <div class="carrier-head">${c.icon ? `<img class="carrier-icon" src="${esc(c.icon)}" alt="">` : ""}<span class="carrier-name">${esc(c.name)}</span>${c.conf ? `<span class="pill conf-${esc(c.conf)}">${esc(c.conf)}</span>` : ""}</div>
        ${wiringBadges(c)}
        <p class="lead">${esc(c.summary || "")}</p>
        ${c.bridge_to_buff ? `<p class="muted"><b>Reaches a buff via:</b> ${esc(c.bridge_to_buff)}</p>` : ""}
        ${c.file ? `<p class="carrier-file">${esc(c.file)}</p>` : ""}</div>`;
    } else if (step === 2) content = wizList(c.forced, "forced", "Nothing extra is strictly forced — this element stands alone.");
    else if (step === 3) content = wizList(c.choices, "choices", "No branching choices recorded yet.");
    else content = wizLimits(c.limits);

    const nextBtn = step < 4
      ? `<button data-action="wizard-next">Next →</button>`
      : `<button data-action="wizard-restart">Build something else ↺</button>`;
    return `
      <div class="wiz-rail">${rail}</div>
      <div class="wiz-panel">
        <h2 class="wiz-q">${esc(WIZ_STEPS[step - 1].q)}</h2>
        ${content}
      </div>
      <div class="wiz-nav">
        <button class="ghost" data-action="wizard-back">${step === 1 ? "← Change selection" : "← Back"}</button>
        ${nextBtn}
      </div>`;
  }

  // ═══ DESIGN ELEMENTS (carriers) — appendix reference ═══
  function wiringBadges(c) {
    const b = [];
    if (c.buff_direct && c.buff_direct.can) b.push(`<span class="wb wb-b" title="Holds buffs directly (no effect needed)">B · direct buff</span>`);
    if (c.effect_direct && c.effect_direct.can) b.push(`<span class="wb wb-e" title="Carries effect payloads (which bridge to buffs)">E · effects</span>`);
    const tn = (c.triggers || []).length;
    if (tn) b.push(`<span class="wb wb-t" title="Fires effects on ${tn} event trigger${tn > 1 ? "s" : ""}">T · ${tn} trigger${tn > 1 ? "s" : ""}</span>`);
    if (c.stat_carrier) b.push(`<span class="wb wb-s" title="Also defines raw base stats">S · base stats</span>`);
    if (c.rule_gating && c.rule_gating.can) b.push(`<span class="wb wb-g" title="Its buffs can carry rule_type conditional gates">gatable</span>`);
    return `<div class="carrier-badges">${b.join("")}</div>`;
  }

  function carriersHTML() {
    const items = carriers();
    if (!items.length) return `<p class="empty-state">No carriers. Run <code>node build-data.mjs</code>.</p>`;
    const cards = items.map(c => {
      const icon = c.icon ? `<img class="carrier-icon" src="${esc(c.icon)}" alt="" onerror="this.style.visibility='hidden'">` : "";
      return `<div class="carrier-card" data-action="carrier" data-id="${esc(c.id)}">
        <div class="carrier-head">${icon}<span class="carrier-name">${esc(c.name)}</span>${c.conf ? `<span class="pill conf-${esc(c.conf)}">${esc(c.conf)}</span>` : ""}</div>
        ${wiringBadges(c)}
        <div class="carrier-summary">${esc(c.summary || "")}</div>
        ${c.file ? `<div class="carrier-file">${esc(c.file)}</div>` : ""}
      </div>`;
    }).join("");
    return `<p class="surface-intro">${INTRO.designElements}</p><div class="carrier-grid">${cards}</div>`;
  }

  // palette jump-links shown in a carrier's detail
  function paletteLinks() {
    const L = [["effects", "Effects"], ["buffStats", "Buff Stats"], ["buffRules", "Rule Gates"], ["bridge", "Bridge"]];
    return `<div class="palette-links">${L.map(([v, n]) =>
      `<button class="ghost" data-action="goto-view" data-view="${v}">${esc(n)} →</button>`).join("")}</div>`;
  }

  function openCarrierDetail(id) {
    const c = carriers().find(x => x.id === id);
    if (!c) return;
    let html = `<div class="detail-tags">${wiringBadges(c)}</div>`;
    html += `<p class="lead">${esc(c.summary || "")}</p>`;

    const rows = [];
    if (c.bridge_to_buff) rows.push(kv("Reaches a buff via", esc(c.bridge_to_buff)));
    if (c.buff_direct) rows.push(kv("Direct buff?", c.buff_direct.can ? esc(c.buff_direct.how || "yes") : `<span class="muted">no — ${esc(c.buff_direct.how || "must route through an effect")}</span>`));
    if (c.effect_direct) rows.push(kv("Carries effects?", c.effect_direct.can ? esc(c.effect_direct.how || "yes") : `<span class="muted">no</span>`));
    if (c.rule_gating) rows.push(kv("Rule-gatable?", (c.rule_gating.can ? "yes" : "no") + (c.rule_gating.note ? ` — ${esc(c.rule_gating.note)}` : "")));
    if (c.stat_carrier != null) rows.push(kv("Sets base stats?", c.stat_carrier ? "yes" : "no"));
    if (c.file) rows.push(kv("Authored in", `<code>${esc(c.file)}</code>`));
    html += `<h3>Wiring</h3><dl class="kv">${rows.join("")}</dl>`;

    if (Array.isArray(c.triggers) && c.triggers.length) {
      html += `<h3>Triggers — ${c.triggers.length}</h3>
        <div class="trig-table-wrap"><table class="trig-table">
          <thead><tr><th class="mono">hook</th><th>when</th><th>target</th></tr></thead>
          <tbody>${c.triggers.map(t => `<tr><td class="mono">${esc(t.hook || "")}</td><td>${esc(t.when || "")}</td><td>${esc(t.target || "")}</td></tr>`).join("")}</tbody>
        </table></div>`;
    }
    if (c.notes) html += `<h3>Notes</h3><p>${esc(c.notes)}</p>`;
    if (Array.isArray(c.examples) && c.examples.length) {
      html += `<h3>Examples</h3>` + c.examples.map(ex =>
        `<div class="code-block">${esc(ex.code)}</div>${ex.note ? `<p class="code-note">${esc(ex.note)}</p>` : ""}`).join("");
    }
    html += `<h3>Jump to the palette</h3>${paletteLinks()}`;
    if (c.ref) html += `<p class="ref-cite">Grounded in <code>${esc(c.ref)}</code></p>`;

    const titleIcon = c.icon ? `<img class="head-icon" src="${esc(c.icon)}" alt="" onerror="this.style.display='none'">` : "";
    renderDetail(`${titleIcon}${esc(c.name)} <span class="head-id">${esc(c.id)}</span>`, html);
  }

  // ═══ CATALOG VIEW (effects / buffStats / buffRules) ═══
  function filteredItems(key) {
    const s = surface(key);
    const items = itemsOf(s);
    const cat = state.cat[key] || "all";
    const q = (state.search[key] || "").trim().toLowerCase();
    return items.filter((it) => {
      if (cat !== "all" && itemGroupId(s, it) !== cat) return false;
      if (!q) return true;
      const hay = [it.name, it.id, it.summary, ...(it.keywords || [])].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function catalogHTML(key) {
    const s = surface(key);
    if (!s) return `<p class="empty-state">No data for “${esc(key)}”. Run <code>node build-data.mjs</code>.</p>`;
    const gmap = groupMap(s);
    const cat = state.cat[key] || "all";
    const q = state.search[key] || "";

    const total = itemsOf(s).length;
    const counts = new Map();
    for (const it of itemsOf(s)) { const gid = itemGroupId(s, it); counts.set(gid, (counts.get(gid) || 0) + 1); }

    // Compact category filter: a single <select> (was a wall of chips — bad on mobile).
    const opt = (id, name, count) =>
      `<option value="${esc(id)}" ${id === cat ? "selected" : ""}>${esc(name)} (${count})</option>`;
    const options = [opt("all", "All categories", total)]
      .concat(groupsOf(s).map(g => opt(g.id, g.name, counts.get(g.id) || 0))).join("");
    const activeGroup = gmap.get(cat);
    const catIcon = activeGroup && activeGroup.icon
      ? `<img class="cat-select-icon" src="${esc(activeGroup.icon)}" alt="" onerror="this.style.display='none'">` : "";

    const shown = filteredItems(key);
    const tiles = shown.length
      ? shown.map(it => tileHTML(s, it)).join("")
      : `<p class="empty-state">No matches.</p>`;

    return `
      <p class="surface-intro">${INTRO[key] || ""}</p>
      <div class="surface-toolbar">
        <label class="cat-select-wrap">${catIcon}
          <select class="cat-select" data-view="${key}">${options}</select>
        </label>
        <input class="surface-search" type="search" placeholder="Search ${esc(s.label.toLowerCase())}…"
               data-view="${key}" value="${esc(q)}" />
        <span class="result-count">${shown.length} / ${total}</span>
      </div>
      <div class="cat-grid">${tiles}</div>`;
  }

  function tileHTML(s, it) {
    const g = groupMap(s).get(itemGroupId(s, it));
    const color = g ? g.color : "var(--border)";
    const foot = [];
    if (it.unit) foot.push(`<span class="pill">${esc(it.unit)}</span>`);
    if (it.usage_count != null) foot.push(`<span class="pill">${it.usage_count}× used</span>`);
    if (it.standalone === false) foot.push(`<span class="pill">modifier</span>`);
    if (it.conf) foot.push(`<span class="pill conf-${esc(it.conf)}">${esc(it.conf)}</span>`);
    const icon = it.icon
      ? `<img class="tile-icon" src="${esc(it.icon)}" alt="" onerror="this.style.visibility='hidden'">` : "";
    return `<div class="cat-tile" style="--aff-color:${esc(color)}" data-action="detail" data-view="${s.key}" data-id="${esc(it.id)}">
      <div class="tile-name">${icon}<span>${esc(it.name)}</span></div>
      <div class="tile-id">${esc(it.id)}</div>
      <div class="tile-summary">${esc(it.doc || it.summary || "")}</div>
      <div class="tile-foot">${foot.join("")}</div>
    </div>`;
  }

  // ═══ DETAIL OVERLAY ═══
  function openDetail(key, id) {
    const s = surface(key);
    const it = itemsOf(s).find(x => x.id === id);
    if (!it) return;
    const g = groupMap(s).get(itemGroupId(s, it));

    const rows = [];
    if (it.syntax) rows.push(kv("Syntax", `<code>${esc(it.syntax)}</code>`));
    if (it.unit) rows.push(kv("Unit", esc(it.unit) + (it.unit_note ? ` — <span class="muted">${esc(it.unit_note)}</span>` : "")));
    if (it.sub_type) rows.push(kv("Sub-type", `<code>${esc(it.sub_type)}</code>`));
    if (it.rule_data) rows.push(kv("rule_data", esc(it.rule_data)));
    if (it.needs_string != null) rows.push(kv("Param kind", it.needs_string ? "string token" : "numeric / none"));
    if (it.invertible != null) rows.push(kv("Invertible", it.invertible ? "yes (is_false_rule)" : "no"));
    if (it.usage_count != null) rows.push(kv("Vanilla uses", `${it.usage_count}`));
    if (it.standalone != null) rows.push(kv("Kind", it.standalone ? "standalone payload" : "modifier (bundles)"));

    let html = "";
    html += `<div class="detail-tags">${g ? tagBanner(g) : ""}${it.conf ? `<span class="pill conf-${esc(it.conf)}">${esc(it.conf)} confidence</span>` : ""}</div>`;
    html += `<p class="lead">${esc(it.doc || it.summary || "")}</p>`;
    // if a rich doc replaced the summary as the lead, keep the short summary as a one-line teaser
    if (it.doc && it.summary && it.summary !== it.doc) html += `<p class="teaser">${esc(it.summary)}</p>`;
    if (rows.length) html += `<h3>Details</h3><dl class="kv">${rows.join("")}</dl>`;

    if (Array.isArray(it.params) && it.params.length) {
      html += `<h3>Parameters</h3><ul class="param-list">${it.params.map(p =>
        `<li><span class="pk">${esc(p.key)}</span>${esc(p.desc)}</li>`).join("")}</ul>`;
    }
    if (Array.isArray(it.targets) && it.targets.length) {
      html += `<h3>Valid targets</h3><div class="chip-row">${it.targets.map(t => `<span class="mini-chip">${esc(t)}</span>`).join("")}</div>`;
    }
    if (Array.isArray(it.examples) && it.examples.length) {
      html += `<h3>Examples</h3>` + it.examples.map(ex =>
        `<div class="code-block">${esc(ex.code)}</div>${ex.note ? `<p class="code-note">${esc(ex.note)}</p>` : ""}`).join("");
    }
    if (Array.isArray(it.keywords) && it.keywords.length) {
      html += `<h3>Also known as</h3><div class="kw-row">${it.keywords.map(k => `<span class="kw">${esc(k)}</span>`).join("")}</div>`;
    }
    if (it.ref) html += `<p class="ref-cite">Grounded in <code>${esc(it.ref)}</code></p>`;

    const titleIcon = it.icon ? `<img class="head-icon" src="${esc(it.icon)}" alt="" onerror="this.style.display='none'">` : "";
    renderDetail(`${titleIcon}${esc(it.name)} <span class="head-id">${esc(it.id)}</span>`, html);
  }
  const kv = (k, v) => `<dt>${esc(k)}</dt><dd>${v}</dd>`;

  function renderDetail(title, bodyHtml) {
    const root = document.getElementById("detail-overlay-root");
    root.innerHTML = `
      <div class="overlay-panel" role="dialog" aria-modal="true">
        <div class="overlay-header">
          <h2>${title}</h2>
          <button class="overlay-close" data-action="close-detail" aria-label="Close">&times;</button>
        </div>
        <div class="overlay-body"><div class="detail-main">${bodyHtml}</div></div>
        <div class="overlay-footer"><button data-action="close-detail">Close</button></div>
      </div>`;
    root.classList.remove("hidden");
    root.setAttribute("aria-hidden", "false");
  }
  function closeDetail() {
    const root = document.getElementById("detail-overlay-root");
    root.classList.add("hidden");
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = "";
  }

  // ═══ BRIDGE VIEW ═══
  function bridgeHTML() {
    const b = DATA.bridge || { sections: [], triggers: [] };
    const sections = (b.sections || []).map(sec => `
      <section class="bridge-section">
        <h2>${esc(sec.title)}</h2>
        ${sec.summary ? `<p>${esc(sec.summary)}</p>` : ""}
        ${Array.isArray(sec.points) && sec.points.length ? `<ul>${sec.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
        ${Array.isArray(sec.examples) ? sec.examples.map(ex =>
          `<div class="code-block">${esc(ex.code)}</div>${ex.note ? `<p class="code-note">${esc(ex.note)}</p>` : ""}`).join("") : ""}
      </section>`).join("");

    const trig = (b.triggers || []);
    const trigTable = trig.length ? `
      <section class="bridge-section">
        <h2>Trinket-trigger firing model — ${trig.length} triggers</h2>
        <p>Every <code>*_additional_effects</code> hook a buff/trinket can fire through, with its code-certain event and target binding.</p>
        <div class="trig-table-wrap"><table class="trig-table">
          <thead><tr><th class="mono">trigger</th><th>event</th><th>target binding</th><th>notes</th></tr></thead>
          <tbody>${trig.map(t => `<tr>
            <td class="mono">${esc(t.id || t.name)}</td>
            <td>${esc(t.event || "")}</td>
            <td>${esc(t.target_binding || "")}</td>
            <td>${esc(t.notes || "")}</td></tr>`).join("")}</tbody>
        </table></div>
      </section>` : "";

    return `<p class="surface-intro">${INTRO.bridge}</p>${sections}${trigTable}`;
  }

  // ═══ EVENTS ═══
  function onAppClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    switch (el.dataset.action) {
      case "view":
        state.view = el.dataset.view; persist(); renderApp(); break;
      case "cat":
        state.cat[el.dataset.view] = el.dataset.cat; persist(); renderApp(); break;
      case "detail":
        openDetail(el.dataset.view, el.dataset.id); break;
      case "carrier":
        openCarrierDetail(el.dataset.id); break;
      case "wizard-pick":
        state.wizard = { pick: el.dataset.id, step: 1 }; persist(); renderApp(); break;
      case "wizard-step":
        state.wizard.step = Number(el.dataset.step); persist(); renderApp(); break;
      case "wizard-next":
        state.wizard.step = Math.min(4, (state.wizard.step || 1) + 1); persist(); renderApp(); break;
      case "wizard-back":
        if ((state.wizard.step || 1) > 1) state.wizard.step -= 1; else state.wizard.pick = null;
        persist(); renderApp(); break;
      case "wizard-restart":
        state.wizard = { pick: null, step: 1 }; persist(); renderApp(); break;
      case "goto-view":
        state.view = el.dataset.view; persist(); renderApp(); break;
    }
  }
  function onAppInput(e) {
    if (!e.target.classList.contains("surface-search")) return;
    const view = e.target.dataset.view;
    state.search[view] = e.target.value;
    persist();
    // re-render only the grid + count so the search input keeps focus/caret
    const shown = filteredItems(view);
    const s = surface(view);
    const grid = document.querySelector(".cat-grid");
    const count = document.querySelector(".result-count");
    if (grid) grid.innerHTML = shown.length ? shown.map(it => tileHTML(s, it)).join("") : `<p class="empty-state">No matches.</p>`;
    if (count) count.textContent = `${shown.length} / ${itemsOf(s).length}`;
  }
  function onAppChange(e) {
    if (!e.target.classList.contains("cat-select")) return;
    state.cat[e.target.dataset.view] = e.target.value;
    persist();
    renderApp();
  }
  function onDetailClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) { if (e.target.id === "detail-overlay-root") closeDetail(); return; }
    if (el.dataset.action === "close-detail") closeDetail();
    else if (el.dataset.action === "goto-view") {   // carrier detail → jump into a palette surface
      state.view = el.dataset.view; persist(); closeDetail(); renderApp();
    }
  }
  function onKeydown(e) {
    if (e.key !== "Escape") return;
    if (!document.getElementById("detail-overlay-root").classList.contains("hidden")) closeDetail();
  }

  // ── init ──
  document.getElementById("app").addEventListener("click", onAppClick);
  document.getElementById("app").addEventListener("input", onAppInput);
  document.getElementById("app").addEventListener("change", onAppChange);
  document.getElementById("detail-overlay-root").addEventListener("click", onDetailClick);
  document.addEventListener("keydown", onKeydown);
  renderApp();
})();
