/*
  designer.js — the Design Studio: a "design as you go" wizard.

  Unlike the old click-through wizard (which just READ forced/choices/limits per carrier),
  this walks you through each concrete design choice for ONE element and enforces the mod's
  real balance scales live (warn-but-allow): point-buys, tier norms, the trinket value model,
  the "no dead skill levels" rule. Each flow ends in an authorable .darkest/.json snippet + a
  Definition-of-Done checklist mapped to HERO_COOKBOOK phases.

  Balance data comes from window.DDC_DATA.balance (compiled by tools/gen-balance.mjs from the
  user-authored dd-mods scales). Reference palettes (effects / buff stats / rule gates) are the
  same DDC_DATA.surfaces the Appendix uses. State persists to localStorage (ddc.design): one
  in-progress build per flow.

  app.js owns #app (header + nav + <main>). When the Design Studio view is active it drops a
  <div id="studio"> and calls DDCDesigner.render(); app.js forwards data-ds clicks/inputs here.
  Appendix jump-links use data-action="goto-view" so app.js keeps handling them.
*/
(function () {
  "use strict";

  const DATA = window.DDC_DATA || {};
  const B = DATA.balance || {};
  const SS = B.statScale || { curves: {}, combatBlocks: [], resistTypes: [], roles: {}, budgets: {} };
  const LADDER = (B.trinketLadder && B.trinketLadder.effects) || [];
  const LADDER_STEPS = (B.trinketLadder && B.trinketLadder.steps) || ["common", "uncommon", "rare", "very_rare", "special", "super_special"];
  const TRULES = (B.trinketRules && B.trinketRules.rules) || [];
  const KEY = "ddc.design";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const round = (n) => Math.round(n * 100) / 100;

  // ── rarity / point model (shared by trinket + quirk) ──
  const RARITY = ["common", "uncommon", "rare", "very_rare", "special", "super_special"];
  const RARITY_LABEL = { common: "Common", uncommon: "Uncommon", rare: "Rare", very_rare: "Very Rare", special: "Special · CC", super_special: "Super Special · Comet" };
  const stepOf = (r) => Math.max(0, RARITY.indexOf(r));
  const MALUS = { 1: { step: 0, credit: 1, label: "T1 · Common ×−1" }, 2: { step: 2, credit: 3, label: "T2 · Rare ×−1" }, 3: { step: 4, credit: 5, label: "T3 · Special ×−1" } };
  const ladderVal = (eff, step) => (eff && Array.isArray(eff.ladder) ? eff.ladder[clamp(step, 0, eff.ladder.length - 1)] : null);
  const fmtMag = (v, unit) => v == null ? "—" : (unit === "flat" ? (v > 0 ? "+" + v : String(v)) : (v > 0 ? "+" + v + "%" : v + "%"));
  const ruleOf = (rule, ruleData) => TRULES.find((r) => r.rule === rule && (r.ruleData || "") === (ruleData || ""));
  const ruleModifier = (rule, ruleData) => { const hit = ruleOf(rule, ruleData); return hit && hit.modifier != null ? hit.modifier : 1; };
  const ruleProvisional = (rule, ruleData) => { const hit = ruleOf(rule, ruleData); return !!(hit && hit.provisional); };
  const ladderByName = (name) => LADDER.find((e) => e.name === name);

  // component (a buff or drawback line on a trinket/quirk)
  function compPoints(c) { return c.kind === "malus" ? -MALUS[c.tier].credit : (c.step + 1); }
  function compMagnitude(c) {
    const eff = ladderByName(c.effectName);
    if (!eff) return null;
    if (c.kind === "malus") return round(ladderVal(eff, MALUS[c.tier].step) * -1);
    return round(ladderVal(eff, c.step) * ruleModifier(c.rule, c.ruleData));
  }

  // ── state ──
  let S = loadState();
  function loadState() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { s = {}; }
    return { target: s.target || null, step: s.step || 0, builds: s.builds || {} };
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
  function build() { return S.builds[S.target] || (S.builds[S.target] = FLOWS[S.target] ? FLOWS[S.target].init() : {}); }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Reusable controls (return HTML strings; actions carry data-ds="…")
  // ═══════════════════════════════════════════════════════════════════════════
  function stepper(field, val, lo, hi, opts = {}) {
    const suffix = opts.suffix || "", step = opts.step || 1;
    const argAttr = opts.arg != null ? ` data-arg="${esc(opts.arg)}"` : "";
    return `<span class="ds-stepper" data-field="${esc(field)}">
      <button class="ds-sbtn" data-ds="dec" data-field="${esc(field)}" data-lo="${lo}" data-hi="${hi}" data-step="${step}"${argAttr} aria-label="decrease">−</button>
      <span class="ds-sval">${esc(val)}${suffix}</span>
      <button class="ds-sbtn" data-ds="inc" data-field="${esc(field)}" data-lo="${lo}" data-hi="${hi}" data-step="${step}"${argAttr} aria-label="increase">+</button>
    </span>`;
  }
  function chips(field, val, options) {
    return `<div class="ds-chips">${options.map((o) => {
      const v = typeof o === "string" ? o : o.value, label = typeof o === "string" ? o : o.label;
      return `<button class="ds-chip ${v === val ? "on" : ""}" data-ds="set" data-field="${esc(field)}" data-value="${esc(v)}">${esc(label)}</button>`;
    }).join("")}</div>`;
  }
  function multiRanks(field, arr) {
    return `<div class="ds-chips">${[1, 2, 3, 4].map((r) =>
      `<button class="ds-chip ${arr.includes(r) ? "on" : ""}" data-ds="rank" data-field="${esc(field)}" data-value="${r}">Rank ${r}</button>`).join("")}</div>`;
  }
  function toggle(field, on, label) {
    return `<button class="ds-toggle ${on ? "on" : ""}" data-ds="toggle" data-field="${esc(field)}">
      <span class="ds-toggle-box">${on ? "✓" : ""}</span> ${esc(label)}</button>`;
  }
  function textField(field, val, ph) {
    return `<input class="ds-text" data-ds="text" data-field="${esc(field)}" value="${esc(val || "")}" placeholder="${esc(ph || "")}" />`;
  }
  function textArea(field, val, ph) {
    return `<textarea class="ds-text ds-area" data-ds="text" data-field="${esc(field)}" placeholder="${esc(ph || "")}">${esc(val || "")}</textarea>`;
  }
  function budgetBar(cur, target, unit) {
    const pct = clamp((cur / (target * 1.6)) * 100, 0, 100);
    const st = cur === target ? "ok" : (cur > target ? "over" : "under");
    return `<div class="ds-budget ${st}">
      <div class="ds-budget-head"><b>${esc(cur)}</b> / ${esc(target)} ${esc(unit || "pts")}
        <span class="ds-budget-tag">${st === "ok" ? "on budget" : st === "over" ? "over by " + (cur - target) : "under by " + (target - cur)}</span></div>
      <div class="ds-budget-track"><span style="width:${pct}%"></span><i style="left:${clamp((target / (target * 1.6)) * 100, 0, 100)}%"></i></div>
    </div>`;
  }
  const V = { ok: (l, d) => ({ level: "ok", label: l, detail: d }), warn: (l, d) => ({ level: "warn", label: l, detail: d }), info: (l, d) => ({ level: "info", label: l, detail: d }) };
  function verdictList(vs) {
    if (!vs || !vs.length) return "";
    return `<div class="ds-verdicts">${vs.map((v) =>
      `<div class="ds-verdict ds-${v.level}"><span class="ds-vdot"></span><div><b>${esc(v.label)}</b>${v.detail ? `<span>${v.detail}</span>` : ""}</div></div>`).join("")}</div>`;
  }
  function appendixLinks(links) {
    if (!links || !links.length) return "";
    return `<div class="ds-refs">Reference: ${links.map((l) =>
      `<button class="ds-ref" data-action="goto-view" data-view="${esc(l.view)}">${esc(l.label)} →</button>`).join(" ")}</div>`;
  }
  function compList(list, kind) {
    // kind: "trinket-buff" | "trinket-malus" | "quirk"
    if (!list.length) return `<p class="ds-empty">None yet.</p>`;
    return `<ul class="ds-complist">${list.map((c, i) => {
      const eff = ladderByName(c.effectName);
      const mag = compMagnitude(c), pts = compPoints(c);
      const tierCtl = c.kind === "malus"
        ? `<select class="ds-mini" data-ds="select" data-kind="malus-tier" data-idx="${i}">${[1, 2, 3].map((t) =>
          `<option value="${t}" ${t === c.tier ? "selected" : ""}>${esc(MALUS[t].label)}</option>`).join("")}</select>`
        : `<select class="ds-mini" data-ds="select" data-kind="buff-step" data-idx="${i}">${LADDER_STEPS.map((s, si) =>
          `<option value="${si}" ${si === c.step ? "selected" : ""}>${esc(RARITY_LABEL[s])}</option>`).join("")}</select>`;
      const gate = c.kind === "buff"
        ? `<button class="ds-mini-btn" data-ds="gate" data-idx="${i}">${c.rule && c.rule !== "always" ? "gate: " + esc(c.rule) + (c.ruleData ? " " + esc(c.ruleData) : "") + " ×" + ruleModifier(c.rule, c.ruleData) : "+ gate"}</button>` : "";
      const warn = c.kind === "buff" && c.rule !== "always" && eff && !eff.modified
        ? `<span class="ds-tinywarn" title="the model reserves gates for modified-eligible effects">⚠ not gate-eligible</span>` : "";
      return `<li class="ds-comp ds-comp-${c.kind}">
        <div class="ds-comp-main"><b>${esc(c.effectName)}</b> <span class="ds-mag">${esc(fmtMag(mag, c.unit))}</span> ${warn}</div>
        <div class="ds-comp-ctl">${tierCtl}${gate}<span class="ds-pts ${pts < 0 ? "neg" : ""}">${pts > 0 ? "+" + pts : pts} pt</span>
          <button class="ds-del" data-ds="del" data-idx="${i}" aria-label="remove">✕</button></div>
      </li>`;
    }).join("")}</ul>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  FLOW: HERO COMBAT SKILL
  // ═══════════════════════════════════════════════════════════════════════════
  const ROLES = ["Bulwark", "Juggernaut", "Bruiser", "Skirmisher", "Assassin", "Marksman", "Support", "Controller"];
  // tc = enemy ranks hit · aoe = hits them all at once · front = nearest rank targeted
  const SHAPES = [
    { value: "st_r1", label: "ST · rank 1 only", target: "1", side: "enemy", tc: 1, aoe: false, front: 1 },
    { value: "st_front", label: "ST · front", target: "1 2", side: "enemy", tc: 2, aoe: false, front: 1 },
    { value: "st_any", label: "ST · any rank", target: "1 2 3 4", side: "enemy", tc: 4, aoe: false, front: 1 },
    { value: "st_back", label: "ST · back", target: "3 4", side: "enemy", tc: 2, aoe: false, front: 3 },
    { value: "aoe_front2", label: "AoE · front 2", target: "@ 1 2", side: "enemy", tc: 2, aoe: true, front: 1 },
    { value: "aoe_all", label: "AoE · all", target: "@ 1 2 3 4", side: "enemy", tc: 4, aoe: true, front: 1 },
    { value: "self", label: "Self", target: "performer", side: "self", tc: 0, aoe: false },
    { value: "ally", label: "Single ally", target: "~ 1 2 3 4", side: "ally", tc: 0, aoe: false },
    { value: "ally_all", label: "Whole party", target: "~ @ 1 2 3 4", side: "ally", tc: 0, aoe: true },
  ];
  const shapeOf = (v) => SHAPES.find((s) => s.value === v) || SHAPES[1];
  const wdmg = (tier, rank) => (SS.curves.WeaponDamage && SS.curves.WeaponDamage[String(tier)] && SS.curves.WeaponDamage[String(tier)][rank]) || { min: 0, max: 0, avg: 0, crit: 0 };
  const wcrit = (tier, rank) => (SS.curves.WeaponCrit && SS.curves.WeaponCrit[String(tier)] && SS.curves.WeaponCrit[String(tier)][rank]) || 0;

  // ── Damage-budget model (dd-mods/notes/skill-balance-framework.md — large-n, vanilla-anchored) ──
  //   expected .dmg = rank-lock premium − AoE penalty − any-rank reach creep − Σ rider taxes
  //   The BASE skill must sit in this window; rank-3/5 extras are FREE (financed by the difficulty curve).
  const RIDERS = [
    { key: "rStun", tax: 60, label: "Stuns the target" },
    { key: "rDebuff", tax: 85, label: "Debuffs the target (mark / −prot / −dodge / −dmg)" },
    { key: "rBleed", tax: 20, label: "Applies bleed (the DoT carries the damage)" },
    { key: "rBlight", tax: 75, label: "Applies blight (the DoT is the payload)" },
    { key: "rMove", tax: 50, label: "Pushes / pulls the target" },
  ];
  function damageBudget(b) {
    const sh = shapeOf(b.shape);
    if (sh.side !== "enemy") return null; // heals / buffs aren't damage-priced
    const parts = [];
    let exp = 0;
    const singleLaunch = (b.launch || []).length === 1;
    const minLaunch = (b.launch || []).length ? Math.min(...b.launch) : 1;
    // rank-lock premium (the "Point-Blank-Shot" rule): tightest lock pays most
    let lock = 0;
    if (singleLaunch && sh.tc === 1 && minLaunch <= 2 && Math.abs(minLaunch - sh.front) <= 1) lock = 50; // front melee-range lock
    else if (singleLaunch && sh.tc === 1) lock = 20;      // single-rank lock that reaches away
    else if (!sh.aoe && sh.tc <= 2 && (b.launch || []).length <= 2) lock = 10; // tight front ST
    if (lock) { exp += lock; parts.push(["rank-lock", "+" + lock]); }
    // reach / AoE
    if (sh.aoe) { const p = sh.tc >= 4 ? 80 : sh.tc === 3 ? 55 : 45; exp -= p; parts.push([`AoE ×${sh.tc}`, "−" + p]); }
    else if (sh.tc >= 3) { exp -= 15; parts.push(["any-rank reach", "−15"]); }
    // rider taxes (they stack; utility attacks bottom out near −100)
    for (const r of RIDERS) if (b[r.key]) { exp -= r.tax; parts.push([r.label.split(" ")[0].toLowerCase().replace(/s$/, ""), "−" + r.tax]); }
    exp = clamp(Math.round(exp), -100, 150);
    return { expected: exp, lo: exp - 15, hi: exp + 15, parts };
  }
  function budgetPanel(b) {
    const bud = damageBudget(b);
    if (!bud) return `<div class="ds-realized">Utility skill (self / ally) — <b>no damage budget</b>. Its power is the effect, so keep <code>.dmg</code> at 0.</div>`;
    const chips = (bud.parts.length ? bud.parts : [["clean hit", "0"]]).map((p) => `<span class="ds-bud-chip">${esc(p[0])} <b>${esc(p[1])}</b></span>`).join("");
    const d = b.dmg, st = d >= bud.lo && d <= bud.hi ? "ok" : d > bud.hi ? "over" : "under";
    return `<div class="ds-budget2 ds-b-${st}">
      <div class="ds-b-head">Damage budget → expected <b>${bud.expected}%</b> ±15 · your <b>.dmg ${d}%</b> <span class="ds-b-tag">${st === "ok" ? "on budget" : st === "over" ? "over" : "under"}</span></div>
      <div class="ds-bud-chips">${chips}</div>
      <div class="ds-b-foot">Prices the <b>base</b> skill only — rank-3/5 extras are free (the difficulty curve pays).</div></div>`;
  }

  const FLOW_COMBAT = {
    id: "combat-skill", carrier: "hero-combat-skill", name: "Combat Skill",
    tagline: "Attack / utility skill — targeting, damage vs tier norms, effects, rank escalation.",
    init: () => ({
      name: "", role: "", subId: "", scenario: "",
      type: "melee", launch: [1, 2], shape: "st_front",
      dmgTier: 5, atk: 0, dmg: 0, crit: 0,
      rStun: false, rDebuff: false, rBleed: false, rBlight: false, rMove: false,
      moveFwd: 0, moveBack: 0, perBattle: 0, continueTurn: false, ignoreStealth: false, ignoreGuard: false,
      effects: [], buffs: [], r3: "", r5: "",
    }),
    steps: [
      { id: "identity", title: "Identity", body: csIdentity },
      { id: "type", title: "Type & delivery", body: csType },
      { id: "target", title: "Targeting", body: csTarget },
      { id: "numbers", title: "Numbers", body: csNumbers },
      { id: "move", title: "Movement & flags", body: csMove },
      { id: "effects", title: "Effects (payloads)", body: csEffects },
      { id: "buffs", title: "Buffs & gates", body: csBuffs },
      { id: "escalation", title: "Rank escalation", body: csEscalation },
      { id: "review", title: "Review", body: csReview },
    ],
  };
  function csIdentity(b) {
    return `<p class="ds-prompt">Name the skill and place it in the kit. Every hero splits its 7 skills across <b>two sub-identities</b> — which one is this, and which tactical scenario does it answer?</p>
      <label class="ds-lab">Skill name ${textField("name", b.name, "e.g. Holy Lance")}</label>
      <label class="ds-lab">Role <span class="ds-hint">(the archetype this skill serves)</span></label>${chips("role", b.role, ROLES)}
      <label class="ds-lab">Sub-identity ${textField("subId", b.subId, "e.g. re-engage bruiser")}</label>
      <label class="ds-lab">Scenario answered ${textField("scenario", b.scenario, "e.g. pulled to rank 4, needs back")}</label>
      ${verdictList(FLOW_COMBAT.verdicts(b, "identity"))}
      ${appendixLinks([{ view: "designElements", label: "Combat-skill wiring" }])}`;
  }
  function csType(b) {
    const T = [{ value: "melee", label: "Melee attack" }, { value: "ranged", label: "Ranged attack" }, { value: "move", label: "Move skill" }, { value: "riposte", label: "Riposte skill" }];
    return `<p class="ds-prompt">What kind of skill line is this? <code>combat_move_skill:</code> and <code>riposte_skill:</code> share the grammar but change the slot. Note: <b>the Move fires even on a miss</b>.</p>
      ${chips("type", b.type, T)}
      ${verdictList(FLOW_COMBAT.verdicts(b, "type"))}`;
  }
  function csTarget(b) {
    const sh = shapeOf(b.shape);
    return `<p class="ds-prompt">Which ranks can it be <b>used from</b> (launch), and what does it <b>hit</b> (target)?</p>
      <label class="ds-lab">Launch from</label>${multiRanks("launch", b.launch)}
      <label class="ds-lab">Target shape</label>${chips("shape", b.shape, SHAPES)}
      <p class="ds-note">Resolves to <code>.launch ${esc(b.launch.slice().sort().join(""))}</code> · <code>.target ${esc(sh.target)}</code> <span class="ds-hint">(${esc(sh.side)})</span></p>
      ${verdictList(FLOW_COMBAT.verdicts(b, "target"))}`;
  }
  function csNumbers(b) {
    const r0 = wdmg(b.dmgTier, 0), r4 = wdmg(b.dmgTier, 4);
    const mul = 1 + b.dmg / 100;
    const rz = `${Math.round(r0.min * mul)}–${Math.round(r0.max * mul)}`, rf = `${Math.round(r4.min * mul)}–${Math.round(r4.max * mul)}`;
    const baseCrit = wcrit(b.dmgTier, 4);
    return `<p class="ds-prompt">Set the static line numbers. <code>.atk</code> and <code>.dmg%</code> stay fixed across all 5 levels — only <code>.crit%</code> may scale. Your <b>.dmg</b> is priced against a <b>constraint-aware budget</b>: reach + AoE + the riders this skill carries (from the measured framework).</p>
      <label class="ds-lab">Riders this skill carries <span class="ds-hint">(each control the base damage pays for)</span></label>
      <div class="ds-toggles">${RIDERS.map((r) => toggle(r.key, b[r.key], `${r.label} (−${r.tax})`)).join("")}</div>
      ${budgetPanel(b)}
      <div class="ds-numgrid">
        <div><label class="ds-lab">Hero WeaponDmg tier</label>${stepper("dmgTier", b.dmgTier, 1, 10)}<span class="ds-hint">for the realized preview</span></div>
        <div><label class="ds-lab">Accuracy .atk</label>${stepper("atk", b.atk, -30, 50, { suffix: "%", step: 5 })}</div>
        <div><label class="ds-lab">Damage .dmg</label>${stepper("dmg", b.dmg, -100, 150, { suffix: "%", step: 5 })}</div>
        <div><label class="ds-lab">Crit .crit</label>${stepper("crit", b.crit, -10, 40, { suffix: "%", step: 5 })}</div>
      </div>
      <div class="ds-realized">Realized at tier ${b.dmgTier}: <b>${rz}</b> dmg (rank 0) → <b>${rf}</b> (rank 4) · crit chance ≈ <b>${round(baseCrit + b.crit)}%</b> at rank 4</div>
      ${verdictList(FLOW_COMBAT.verdicts(b, "numbers"))}
      ${appendixLinks([{ view: "buffStats", label: "Combat stats" }])}`;
  }
  function csMove(b) {
    return `<p class="ds-prompt">Per-skill reposition (<code>.move fwd back</code>, fires even on miss), use-limits, and flags.</p>
      <div class="ds-numgrid">
        <div><label class="ds-lab">Move forward</label>${stepper("moveFwd", b.moveFwd, 0, 4)}</div>
        <div><label class="ds-lab">Move back</label>${stepper("moveBack", b.moveBack, 0, 4)}</div>
        <div><label class="ds-lab">Per-battle limit</label>${stepper("perBattle", b.perBattle, 0, 5)}<span class="ds-hint">0 = unlimited</span></div>
      </div>
      <div class="ds-toggles">${toggle("continueTurn", b.continueTurn, "is_continue_turn (free / bonus action)")}
        ${toggle("ignoreStealth", b.ignoreStealth, "ignore_stealth")}
        ${toggle("ignoreGuard", b.ignoreGuard, "ignore_guard")}</div>
      ${verdictList(FLOW_COMBAT.verdicts(b, "move"))}`;
  }
  function csEffects(b) {
    return `<p class="ds-prompt">A combat-skill line <b>cannot hold a buff</b> — every persistent power is delivered by an <b>effect</b> it names. Add the payloads this skill fires.</p>
      ${addBar("Add effect", "effect")}
      ${b.effects.length ? `<ul class="ds-complist">${b.effects.map((e, i) =>
        `<li class="ds-comp"><div class="ds-comp-main"><b>${esc(e.name)}</b> <span class="ds-hint">${esc(e.category || "")}</span></div>
          <div class="ds-comp-ctl"><span class="ds-hint">${esc(e.summary || "").slice(0, 90)}</span><button class="ds-del" data-ds="del" data-idx="${i}">✕</button></div></li>`).join("")}</ul>`
        : `<p class="ds-empty">No payloads yet.</p>`}
      ${verdictList(FLOW_COMBAT.verdicts(b, "effects"))}
      ${appendixLinks([{ view: "effects", label: "Effects palette" }, { view: "bridge", label: "Effect→buff bridge" }])}`;
  }
  function csBuffs(b) {
    return `<p class="ds-prompt">For any effect that carries a <b>buff</b> (a stat modifier), define it here. A buff is the only route to the 55 <b>rule gates</b> — and a gate lets you trade uptime for magnitude. <b>One payload mechanism per effect</b> (buff_ids XOR inline XOR buff_type XOR riposte).</p>
      ${addBar("Add buff", "buffstat")}
      ${b.buffs.length ? `<ul class="ds-complist">${b.buffs.map((bf, i) => {
        const gate = bf.rule && bf.rule !== "always" ? `gate: ${esc(bf.rule)}${bf.ruleData ? " " + esc(bf.ruleData) : ""} ×${ruleModifier(bf.rule, bf.ruleData)}` : "+ gate";
        return `<li class="ds-comp"><div class="ds-comp-main"><b>${esc(bf.name)}</b> ${bf.subType ? `<span class="ds-hint">${esc(bf.subType)}</span>` : ""}</div>
          <div class="ds-comp-ctl">
            <label class="ds-inline">amt ${stepper("buffAmt", bf.amount, -100, 200, { arg: i, suffix: bf.unit === "flat" ? "" : "%", step: bf.unit === "flat" ? 1 : 5 })}</label>
            <button class="ds-mini-btn" data-ds="gate-buff" data-idx="${i}">${gate}</button>
            <button class="ds-del" data-ds="del" data-idx="${i}">✕</button></div></li>`;
      }).join("")}</ul>` : `<p class="ds-empty">No buffs — fine for a pure damage/move skill.</p>`}
      ${verdictList(FLOW_COMBAT.verdicts(b, "buffs"))}
      ${appendixLinks([{ view: "buffStats", label: "Buff stats" }, { view: "buffRules", label: "Rule gates" }])}`;
  }
  function csEscalation(b) {
    return `<p class="ds-prompt"><b>Rank-3 and rank-5 extras — the one thing hero skills add beyond their budget.</b> These are <b>free power spikes</b>: the overhaul makes the game much harder as it progresses, and that rising difficulty is what pays for them. So <b>don't discount your base <code>.dmg</code> to afford them</b> — the base skill stands on its own budget; r3 (<code>.level 2</code>) and r5 (<code>.level 4</code>) add on top.</p>
      <label class="ds-lab">Rank 3 extra <span class="ds-hint">(added at .level 2)</span> ${textArea("r3", b.r3, "e.g. +dmg vs Unholy · a stun · a debuff")}</label>
      <label class="ds-lab">Rank 5 extra <span class="ds-hint">(added at .level 4)</span> ${textArea("r5", b.r5, "e.g. a 1-turn Speed buff · a second target · a resist swing")}</label>
      ${verdictList(FLOW_COMBAT.verdicts(b, "escalation"))}`;
  }
  function csReview(b) {
    return reviewPane(FLOW_COMBAT.snippet(b), FLOW_COMBAT.dod(b), FLOW_COMBAT.verdicts(b, "all"));
  }
  FLOW_COMBAT.verdicts = function (b, step) {
    const out = [];
    const push = (arr) => out.push(...arr);
    const identity = () => b.name && b.role ? [] : [V.info("Fill identity", "Name + role anchor the design; the DoD tracks them.")];
    const target = () => {
      const sh = shapeOf(b.shape); const r = [];
      if (b.type === "melee" && (b.shape === "st_back" || b.shape === "aoe_all")) r.push(V.warn("Melee reaching back ranks", "Melee usually hits ranks 1–2. A back-rank melee needs a reposition or a reason."));
      if (sh.side !== "enemy" && b.dmg > 0) r.push(V.warn("Damage on a non-attack target", `${sh.label} is ${sh.side}-targeted — a positive .dmg% won't do what you expect.`));
      if (!b.launch.length) r.push(V.warn("No launch ranks", "A skill with no launch ranks can never be used."));
      if (b.type === "move" && b.moveFwd === 0 && b.moveBack === 0) r.push(V.info("Move skill, no distance", "Set a .move distance in the next step."));
      return r;
    };
    const numbers = () => {
      const r = []; const d = b.dmg; const bud = damageBudget(b);
      if (bud) {
        if (d >= bud.lo && d <= bud.hi) r.push(V.ok(`On budget (${d}% vs ${bud.expected}% ±15)`, "Matches the constraint-priced window (reach + AoE + riders). A fair base skill."));
        else if (d > bud.hi) r.push(V.warn(`Over budget by ${d - bud.hi}%`, "Free damage the contract doesn't pay for — the classic mod over-tune. Tighten the lock, add a rider/AoE, or move the surplus to a CONDITIONAL premium (vs marked / stunned / type) rather than the unconditional base."));
        else r.push(V.info(`Under budget by ${bud.lo - d}%`, "Room to spend: raise .dmg, drop a rider, or widen reach — unless the effect is the point (then keep it lean)."));
        r.push(V.info("Base only — r3/r5 are free", "This prices the BASE skill. The rank-3/5 extras are financed by the rising difficulty curve, so don't discount .dmg here to afford them."));
      } else {
        r.push(V.info("Utility skill — no damage budget", "Self / ally-targeted: its power is the effect, not the hit. Keep .dmg at 0."));
      }
      if (b.crit > 15) r.push(V.warn(`Crit +${b.crit}%`, "Above the weapon-crit norm (~+3.5% ST / −2% AoE across 645 skills). Fine as a signature; it stacks with gear crit."));
      if (b.atk > 15) r.push(V.warn(`High accuracy +${b.atk}%`, "Baseline is ~90% (.atk ≈ 0). High acc is a must-land-utility statement."));
      else if (b.atk < -15) r.push(V.warn(`Low accuracy ${b.atk}%`, "A big to-hit penalty needs a big payoff (Leper-style raw output)."));
      r.push(V.info("Static across levels", ".atk and .dmg% are identical on all 5 .level lines; only .crit% may scale per rank."));
      return r;
    };
    const effects = () => {
      const n = b.effects.length; const r = [];
      if (n > 3) r.push(V.warn(`${n} payloads`, "Many effects on one skill — make sure each is pulling its weight, or split across ranks."));
      else if (n === 0) r.push(V.info("No effects yet", "A pure attack can ship with none; utility skills carry their power here."));
      return r;
    };
    const buffs = () => {
      const r = [];
      if (b.buffs.some((x) => x.rule && x.rule !== "always")) r.push(V.ok("Conditional buff", "A rule gate makes the same stat situational — the creative layer. Uptime traded for character."));
      for (const x of b.buffs) if (ruleProvisional(x.rule, x.ruleData)) { r.push(V.info(`Provisional gate: ${x.rule}`, `×${ruleModifier(x.rule, x.ruleData)} is a provisional uptime estimate — not yet locked in the balance model.`)); break; }
      if (b.buffs.length && !b.effects.length) r.push(V.warn("Buffs but no effect", "A buff reaches the skill THROUGH an effect's .buff_ids — add an effect to carry it."));
      return r;
    };
    const escalation = () => {
      if (!b.r3 && !b.r5) return [V.warn("No rank extras yet", "The r3/r5 spikes are free power the difficulty curve pays for — author at least one, or the skill stays flat across upgrades.")];
      if (!b.r3 || !b.r5) return [V.info(`Only ${b.r3 ? "rank 3" : "rank 5"} adds something`, "A single spike is fine; two is the norm."), V.ok("Free by design", "Not charged to the damage budget — the harder late game is the cost.")];
      return [V.ok("Spikes at rank 3 and 5", "Both breakpoints add power, financed by the difficulty curve — not your base .dmg budget.")];
    };
    if (step === "identity") push(identity());
    else if (step === "target" || step === "type") push(target());
    else if (step === "numbers") push(numbers());
    else if (step === "effects") push(effects());
    else if (step === "buffs") push(buffs());
    else if (step === "escalation") push(escalation());
    else if (step === "all") { push(identity()); push(target()); push(numbers()); push(effects()); push(buffs()); push(escalation()); }
    return out;
  };
  FLOW_COMBAT.snippet = function (b) {
    const id = slug(b.name) || "new_skill";
    const sh = shapeOf(b.shape);
    const launch = b.launch.slice().sort().join("") || "1234";
    const line = (lvl) => `combat_skill: .id "${id}" .level ${lvl} .type ${b.type === "move" ? "melee" : b.type} .atk ${b.atk}% .dmg ${b.dmg}% .crit ${b.crit}%\n` +
      `  .launch ${launch} .target ${sh.target} .move ${b.moveFwd} ${b.moveBack}` +
      (b.perBattle ? ` .per_battle_limit ${b.perBattle}` : "") + (b.continueTurn ? " .is_continue_turn true" : "") +
      (b.ignoreStealth ? " .ignore_stealth true" : "") + (b.ignoreGuard ? " .ignore_guard true" : "") +
      (b.effects.length ? `\n  .effect ${b.effects.map((e) => `"${e.name}"`).join(" ")}` : "");
    const bud = damageBudget(b);
    let out = `// ${b.name || "New skill"}${b.role ? " · " + b.role : ""}  (${b.type === "move" ? "combat_move_skill" : "combat_skill"})\n`;
    if (bud) out += `// base .dmg budget: expected ${bud.expected}% ±15 (${bud.parts.map((p) => p[0] + " " + p[1]).join(", ") || "clean hit 0"}) — yours ${b.dmg}%\n`;
    const riders = RIDERS.filter((r) => b[r.key]).map((r) => r.label.split(" ")[0]);
    if (riders.length) out += `// riders (author as effects): ${riders.join(", ")}\n`;
    out += line(0) + "\n// …repeat for .level 1–4 (static atk/dmg%). Rank-3/5 EXTRAS are free (difficulty-financed) — add effects at .level 2 / .level 4:\n";
    out += `//   rank 3 (.level 2): ${b.r3 ? b.r3.replace(/\n+/g, " ") : "— (author a free spike)"}\n`;
    out += `//   rank 5 (.level 4): ${b.r5 ? b.r5.replace(/\n+/g, " ") : "— (author a free spike)"}\n`;
    if (b.effects.length) {
      out += `\n// effects/overhaul.effects.darkest\n`;
      for (const e of b.effects) out += `effect: .name "${e.name}" .target ${sh.side === "self" ? "performer" : "target"}${b.buffs.length ? ` .buff_ids "${b.buffs.map((x) => slug(id + "_" + x.subType || x.id)).join(" ")}"` : ""}\n`;
    }
    if (b.buffs.length) {
      out += `\n// shared/buffs/overhaul.buffs.json\n`;
      for (const bf of b.buffs) {
        const amt = bf.unit === "flat" ? bf.amount : round(bf.amount / 100);
        out += `{ "id":"${slug(id + "_" + (bf.subType || bf.id))}", "stat_type":"${bf.id}"${bf.subType ? `, "stat_sub_type":"${bf.subType}"` : ""}, "amount":${amt}${bf.rule && bf.rule !== "always" ? `, "rule_type":"${bf.rule}"${bf.ruleData ? `, "rule_data":"${bf.ruleData}"` : ""}` : ""}, "duration_type":"combat_end" }\n`;
      }
    }
    out += `\n// scaffold — verify .target syntax + duration against Appendix › Design Elements / Bridge.`;
    return out;
  };
  FLOW_COMBAT.dod = function (b) {
    const bud = damageBudget(b);
    const onBudget = !bud || (b.dmg >= bud.lo && b.dmg <= bud.hi);
    return [
      ["Identity (name · role · sub-identity · scenario)", !!(b.name && b.role && b.subId)],
      ["Targeting (launch + target shape)", b.launch.length > 0],
      ["Base .dmg on the constraint budget", onBudget],
      ["Move values set deliberately", b.moveFwd > 0 || b.moveBack > 0 || b.type !== "move"],
      ["Effects author-complete (each referenced name resolves)", b.effects.length > 0 || b.dmg !== 0],
      ["Buffs via bridge (one payload mechanism per effect)", true],
      ["Rank-3 / rank-5 extras (free spikes, difficulty-financed)", !!(b.r3 || b.r5)],
      ["Localization: combat_skill_name key (P5)", false],
      ["Lint clean + boot only if new primitive (P11)", false],
    ];
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  FLOW: STAT BLOCK  (point-buy)
  // ═══════════════════════════════════════════════════════════════════════════
  const RES = SS.resistTypes || ["Stun", "Poison", "Bleed", "Disease", "Move", "Debuff", "DeathBlow", "Trap"];
  const rcurve = (block, tier, rank) => (SS.curves[block] && SS.curves[block][String(tier)] && SS.curves[block][String(tier)][rank]) || 0;
  const rescurve = (tier, type) => (SS.curves.Resist && SS.curves.Resist[String(tier)] && SS.curves.Resist[String(tier)][type]) || 0;

  const FLOW_STAT = {
    id: "stat-block", carrier: null, name: "Stat Block",
    tagline: "Hero .info stats — 6-tier + 8-resist point-buy to a budget of 30, live realized stats.",
    init: () => ({ name: "", role: "", combat: [5, 5, 5, 5, 5, 5], resist: [4, 4, 4, 4, 4, 4, 3, 3] }),
    steps: [
      { id: "identity", title: "Identity & role", body: sbIdentity },
      { id: "combat", title: "Combat point-buy", body: sbCombat },
      { id: "resist", title: "Resist point-buy", body: sbResist },
      { id: "review", title: "Review", body: sbReview },
    ],
  };
  function sbIdentity(b) {
    return `<p class="ds-prompt">Name the hero and (optionally) drop in a role template. Every hero spends the <b>same total power</b> (30 combat + 30 resist) — differentiated only by <b>shape</b>. Speed is weapon-only; accuracy is per-skill (both off the tier budget).</p>
      <label class="ds-lab">Hero name ${textField("name", b.name, "e.g. Crusader")}</label>
      <label class="ds-lab">Role template <span class="ds-hint">(applies a combat vector — you can still tune)</span></label>
      ${chips("role", b.role, Object.keys(SS.roles || {}))}
      ${b.role ? `<p class="ds-note">${esc(b.role)} = ${(SS.roles[b.role] || []).join(" / ")} <span class="ds-hint">(Dmg/Crit/Spd/Dodge/Prot/HP)</span></p>` : ""}`;
  }
  function sbCombat(b) {
    const sum = b.combat.reduce((a, c) => a + c, 0);
    const blocks = SS.combatBlocks || [];
    const rows = blocks.map((blk, i) => {
      const t = b.combat[i];
      let realized;
      if (blk.key === "WeaponDamage") { const d = wdmg(t, 4); realized = `${d.min}–${d.max} dmg`; }
      else if (blk.key === "ArmorHP") realized = `${rcurve("ArmorHP", t, 4)} HP`;
      else if (blk.key === "WeaponSpeed") realized = `${rcurve("WeaponSpeed", t, 4)} spd`;
      else realized = `${rcurve(blk.key, t, 4)}%`;
      return `<div class="ds-pb-row"><span class="ds-pb-name">${esc(blk.label)}</span>${stepper("combat", t, 1, 10, { arg: i })}
        <span class="ds-pb-real">T${t} → <b>${realized}</b></span></div>`;
    }).join("");
    return `<p class="ds-prompt">Assign a tier (1–10) to each combat block. They must <b>sum to 30</b> (avg tier 5). Realized values shown at max gear (rank 4).</p>
      ${budgetBar(sum, SS.budgets.combatSum || 30, "tiers")}
      <div class="ds-pb">${rows}</div>
      ${verdictList(FLOW_STAT.verdicts(b, "combat"))}
      ${appendixLinks([{ view: "designElements", label: "Stat carrier" }])}`;
  }
  function sbResist(b) {
    const sum = b.resist.reduce((a, c) => a + c, 0);
    const rows = RES.map((type, i) => {
      const t = b.resist[i];
      return `<div class="ds-pb-row"><span class="ds-pb-name">${esc(type)}</span>${stepper("resist", t, 1, 10, { arg: i })}
        <span class="ds-pb-real">T${t} → <b>${rescurve(t, type)}%</b></span></div>`;
    }).join("");
    return `<p class="ds-prompt">Assign a tier to each resistance. These <b>sum to 30</b> too (avg 3.75) — spend them <b>thematically</b>. DeathBlow &amp; Trap ride their own curves; the other six share one.</p>
      ${budgetBar(sum, SS.budgets.resistSum || 30, "tiers")}
      <div class="ds-pb">${rows}</div>
      ${verdictList(FLOW_STAT.verdicts(b, "resist"))}`;
  }
  function sbReview(b) {
    return reviewPane(FLOW_STAT.snippet(b), FLOW_STAT.dod(b), FLOW_STAT.verdicts(b, "all"));
  }
  FLOW_STAT.verdicts = function (b, step) {
    const out = [];
    const cs = b.combat.reduce((a, c) => a + c, 0), rs = b.resist.reduce((a, c) => a + c, 0);
    const cbud = SS.budgets.combatSum || 30, rbud = SS.budgets.resistSum || 30;
    if (step === "combat" || step === "all")
      out.push(cs === cbud ? V.ok(`Combat sum ${cs}`, "Balanced — equal total power, differentiated by shape.") : V.warn(`Combat sum ${cs}`, `${cs > cbud ? "Over" : "Under"} the budget by ${Math.abs(cs - cbud)}. Every hero should total ${cbud}.`));
    if (step === "resist" || step === "all")
      out.push(rs === rbud ? V.ok(`Resist sum ${rs}`, "On budget — a thematic profile at the standard total.") : V.warn(`Resist sum ${rs}`, `${rs > rbud ? "Over" : "Under"} by ${Math.abs(rs - rbud)}. Resists also total ${rbud}.`));
    return out;
  };
  FLOW_STAT.snippet = function (b) {
    const name = slug(b.name) || "hero";
    const [wd, wc, ws, ad, ap, ah] = [0, 1, 2, 3, 4, 5].map((i) => b.combat[i]);
    let out = `// ${b.name || "Hero"}.info.darkest — computed from the tier scale\n`;
    out += `resistances: ${RES.map((t, i) => `.${t.toLowerCase().replace("deathblow", "death_blow")} ${rescurve(b.resist[i], t)}%`).join(" ")}\n`;
    for (let r = 0; r < 5; r++) {
      const d = wdmg(wd, r);
      out += `weapon: .name "${name}_weapon_${r}" .atk 0% .dmg ${d.min} ${d.max} .crit ${rcurve("WeaponCrit", wc, r)}% .spd ${rcurve("WeaponSpeed", ws, r)}${r ? ` .upgradeRequirementCode ${r - 1}` : ""}\n`;
    }
    for (let r = 0; r < 5; r++) {
      out += `armour: .name "${name}_armour_${r}" .def ${rcurve("ArmorDodge", ad, r)}% .prot ${rcurve("ArmorProt", ap, r)}% .hp ${rcurve("ArmorHP", ah, r)} .spd 0${r ? ` .upgradeRequirementCode ${r - 1}` : ""}\n`;
    }
    return out;
  };
  FLOW_STAT.dod = function (b) {
    const cs = b.combat.reduce((a, c) => a + c, 0), rs = b.resist.reduce((a, c) => a + c, 0);
    return [
      ["Hero named", !!b.name],
      ["Combat vector sums to 30", cs === (SS.budgets.combatSum || 30)],
      ["Resist vector sums to 30", rs === (SS.budgets.resistSum || 30)],
      ["Paste resistances: + weapon:×5 + armour:×5 into .info (P1)", true],
      ["stat_block.py self-test matches (P1 done)", false],
    ];
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  FLOW: TRINKET
  // ═══════════════════════════════════════════════════════════════════════════
  const FLOW_TRINKET = {
    id: "trinket", carrier: "trinket", name: "Trinket",
    tagline: "Live value = ladder × gate, malus drawbacks, point-buy vs rarity.",
    init: () => ({ name: "", rarity: "rare", components: [] }),
    steps: [
      { id: "identity", title: "Identity & rarity", body: tkIdentity },
      { id: "effects", title: "Buffs & drawbacks", body: tkEffects },
      { id: "review", title: "Budget & review", body: tkReview },
    ],
  };
  function tkIdentity(b) {
    return `<p class="ds-prompt">Name the trinket and set its rarity. Rarity sets the <b>point budget</b> it may spend across buffs; a drawback buys headroom for a stronger buff (weapon-style risk/reward). Class-locked out of the generic pool via a private loot table.</p>
      <label class="ds-lab">Trinket name ${textField("name", b.name, "e.g. Knight's Crest")}</label>
      <label class="ds-lab">Rarity</label>${chips("rarity", b.rarity, (B.trinketLadder && B.trinketLadder.trinketRarities || RARITY.slice(1)).map((r) => ({ value: r, label: RARITY_LABEL[r] })))}
      <p class="ds-note">Budget at ${esc(RARITY_LABEL[b.rarity])} = <b>${stepOf(b.rarity) + 1} pts</b>.</p>`;
  }
  function tkEffects(b) {
    const buffs = b.components.filter((c) => c.kind === "buff"), mal = b.components.filter((c) => c.kind === "malus");
    const net = b.components.reduce((a, c) => a + compPoints(c), 0), budget = stepOf(b.rarity) + 1;
    return `<p class="ds-prompt">Add buffs (positive) and drawbacks (negative). Each buff's <b>magnitude</b> = its ladder value at the tier you pick, ×its gate multiplier. Its <b>cost</b> is the tier (Uncommon 2 … Comet 6); a gate raises magnitude but not cost — you're trading uptime.</p>
      ${budgetBar(net, budget, "pts")}
      <div class="ds-addrow">${addBar("Add buff", "ladder-buff")} ${addBar("Add drawback", "ladder-malus")}</div>
      <label class="ds-lab">Buffs</label>${compList(buffs, "trinket-buff")}
      <label class="ds-lab">Drawbacks</label>${compList(mal, "trinket-malus")}
      ${verdictList(FLOW_TRINKET.verdicts(b, "effects"))}
      ${appendixLinks([{ view: "buffStats", label: "Buff stats" }, { view: "buffRules", label: "Rule gates" }])}`;
  }
  function tkReview(b) {
    return reviewPane(FLOW_TRINKET.snippet(b), FLOW_TRINKET.dod(b), FLOW_TRINKET.verdicts(b, "all"));
  }
  FLOW_TRINKET.verdicts = function (b, step) {
    const out = [];
    const net = b.components.reduce((a, c) => a + compPoints(c), 0), budget = stepOf(b.rarity) + 1;
    out.push(net === budget ? V.ok(`On budget (${net}/${budget})`, "Spends exactly its rarity's points — consistent with the ladder.")
      : net > budget ? V.warn(`Over budget (${net}/${budget})`, "Add a drawback or drop a buff's tier to bring it in line.")
        : V.info(`Under budget (${net}/${budget})`, "Room for another buff, a higher tier, or a set-bonus payload."));
    for (const c of b.components) if (c.kind === "buff" && c.rule && c.rule !== "always") {
      const eff = ladderByName(c.effectName);
      if (eff && !eff.modified) out.push(V.warn(`Gate on "${c.effectName}"`, "The model reserves gates for modified-eligible effects (chance/utility stats are meant to stay always-on)."));
      if (ruleProvisional(c.rule, c.ruleData)) out.push(V.info(`Provisional gate: ${c.rule}`, `×${ruleModifier(c.rule, c.ruleData)} is a provisional uptime estimate — not yet locked in the balance model. Fine to design with; confirm before shipping.`));
    }
    if (!b.components.length) out.push(V.info("No effects yet", "A trinket needs at least one buff."));
    return out;
  };
  FLOW_TRINKET.snippet = function (b) {
    const id = slug(b.name) || "new_trinket";
    const buffJson = (c) => {
      const eff = ladderByName(c.effectName); const mag = compMagnitude(c);
      const amt = c.unit === "flat" ? mag : round(mag / 100);
      return `  { "stat_type":"${eff.statType}"${eff.subType ? `, "stat_sub_type":"${eff.subType.split("|")[0].split("+")[0]}"` : ""}, "amount":${amt}${c.kind === "buff" && c.rule && c.rule !== "always" ? `, "rule_type":"${c.rule}"${c.ruleData ? `, "rule_data":"${c.ruleData}"` : ""}` : ""} }`;
    };
    let out = `// trinkets/overhaul.<hero>.entries.trinkets.json — ${b.name || "New trinket"} (${b.rarity})\n`;
    out += `{\n  "id": "${id}",\n  "rarity": "${b.rarity}",\n  "buffs": [\n${b.components.map(buffJson).join(",\n")}\n  ]\n}\n`;
    out += `\n// display: ${b.components.map((c) => `${c.effectName} ${fmtMag(compMagnitude(c), c.unit)}${c.kind === "buff" && c.rule !== "always" ? " @" + c.rule : ""}`).join(" · ")}`;
    out += `\n// amount encoding: percent stats as fractions (0.15=+15%); confirm combat_stat_add scale vs a real trinket.`;
    return out;
  };
  FLOW_TRINKET.dod = function (b) {
    const net = b.components.reduce((a, c) => a + compPoints(c), 0), budget = stepOf(b.rarity) + 1;
    return [
      ["Named + rarity chosen", !!b.name],
      ["Carries ≥1 buff", b.components.some((c) => c.kind === "buff")],
      ["On the rarity point budget", net === budget],
      ["Entry in overhaul.<hero>.entries.trinkets.json (P4.1)", false],
      ["Wired into <HERO>TRINKETTABLE loot (P4.2–4.3)", false],
      ["Class-locked; leftover/exotic audit clean (P4.4)", false],
    ];
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  FLOW: QUIRK
  // ═══════════════════════════════════════════════════════════════════════════
  const FLOW_QUIRK = {
    id: "quirk", carrier: "quirk", name: "Quirk",
    tagline: "Signature +/- components, rule-gated, point-buy + permanence.",
    init: () => ({ name: "", isPositive: true, flavor: "", components: [], canModify: true, canReplace: true, isLocked: false }),
    steps: [
      { id: "identity", title: "Identity", body: qkIdentity },
      { id: "components", title: "Components", body: qkComponents },
      { id: "permanence", title: "Permanence", body: qkPermanence },
      { id: "review", title: "Review", body: qkReview },
    ],
  };
  function qkIdentity(b) {
    return `<p class="ds-prompt">A signature quirk is <b>thematic and deterministic</b> (one positive + one negative per hero). Positive quirks target <b>+2 pts</b>; negatives are often built <b>net-neutral (0)</b> — a drawback you can weaponize (e.g. bonus damage while afflicted).</p>
      <label class="ds-lab">Quirk name ${textField("name", b.name, "e.g. Zealous")}</label>
      <label class="ds-lab">Polarity</label>${chips("isPositive", b.isPositive ? "pos" : "neg", [{ value: "pos", label: "Positive" }, { value: "neg", label: "Negative" }])}
      <label class="ds-lab">Flavor ${textField("flavor", b.flavor, "marched to war sure in his convictions")}</label>`;
  }
  function qkComponents(b) {
    const target = b.isPositive ? 2 : 0;
    const net = b.components.reduce((a, c) => a + compPoints(c), 0);
    return `<p class="ds-prompt">Build the quirk from buff components. A <b>rule gate</b> (virtued / afflicted / at_deaths_door…) gives it character and raises magnitude for the same slot. Point-buy uses the same grid as trinkets (Common 1 … Comet 6).</p>
      ${budgetBar(net, target, "pts")}
      <div class="ds-addrow">${addBar("Add buff", "ladder-buff")} ${addBar("Add drawback", "ladder-malus")}</div>
      ${compList(b.components, "quirk")}
      ${verdictList(FLOW_QUIRK.verdicts(b, "components"))}
      ${appendixLinks([{ view: "buffRules", label: "Rule gates (virtued/afflicted)" }, { view: "buffStats", label: "Buff stats" }])}`;
  }
  function qkPermanence(b) {
    return `<p class="ds-prompt">How sticky is this quirk? A signature positive is often protected from the 5-slot overflow and locked into the roster seed; a negative usually stays curable (weaponize it or pay to remove it).</p>
      <div class="ds-toggles">
        ${toggle("canModify", b.canModify, "can_modify_in_activity (curable in Sanitarium)")}
        ${toggle("canReplace", b.canReplace, "can_be_replaced_by_new_quirk")}
        ${toggle("isLocked", b.isLocked, "seed is_locked (starts locked on the roster)")}</div>
      ${verdictList(FLOW_QUIRK.verdicts(b, "permanence"))}`;
  }
  function qkReview(b) {
    return reviewPane(FLOW_QUIRK.snippet(b), FLOW_QUIRK.dod(b), FLOW_QUIRK.verdicts(b, "all"));
  }
  FLOW_QUIRK.verdicts = function (b, step) {
    const out = [];
    const target = b.isPositive ? 2 : 0;
    const net = b.components.reduce((a, c) => a + compPoints(c), 0);
    if (step === "components" || step === "all") {
      out.push(net === target ? V.ok(`On target (${net}/${target})`, b.isPositive ? "A standard-strength positive." : "Net-neutral — a negative with a usable upside.")
        : V.warn(`Off target (${net}/${target})`, `A ${b.isPositive ? "positive" : "negative"} quirk usually nets ${target}.`));
      if (b.isPositive && net < 0) out.push(V.warn("Positive quirk is net-negative", "Its drawbacks outweigh its buffs — flip polarity or rebalance."));
      if (b.components.some((c) => c.rule && c.rule !== "always")) out.push(V.ok("Rule-gated character", "Gating on virtued/afflicted/DD is exactly how a signature quirk earns its identity."));
      for (const c of b.components) if (ruleProvisional(c.rule, c.ruleData)) { out.push(V.info(`Provisional gate: ${c.rule}`, `×${ruleModifier(c.rule, c.ruleData)} is a provisional uptime estimate — not yet locked. Confirm before shipping.`)); break; }
    }
    if ((step === "permanence" || step === "all") && b.isPositive && b.canReplace)
      out.push(V.info("Replaceable positive", "Signature positives are often can_be_replaced_by_new_quirk:false so the 5-slot overflow can't drop them."));
    return out;
  };
  FLOW_QUIRK.snippet = function (b) {
    const id = slug(b.name) || "new_quirk";
    let out = `// shared/quirk/overhaul.quirk_library.json\n`;
    out += `"${id}": {\n  "id": "${id}",\n  "is_positive": ${!!b.isPositive},\n  "can_modify_in_activity": ${!!b.canModify},\n  "can_be_replaced_by_new_quirk": ${!!b.canReplace},\n  "buffs": [ ${b.components.map((c, i) => `"${id}_${i + 1}"`).join(", ")} ]\n}\n`;
    out += `\n// shared/buffs/overhaul.buffs.json\n`;
    for (let i = 0; i < b.components.length; i++) {
      const c = b.components[i], eff = ladderByName(c.effectName), mag = compMagnitude(c);
      const amt = c.unit === "flat" ? mag : round(mag / 100);
      out += `{ "id":"${id}_${i + 1}", "stat_type":"${eff.statType}"${eff.subType ? `, "stat_sub_type":"${eff.subType.split("|")[0].split("+")[0]}"` : ""}, "amount":${amt}${c.kind === "buff" && c.rule && c.rule !== "always" ? `, "rule_type":"${c.rule}"${c.ruleData ? `, "rule_data":"${c.ruleData}"` : ""}` : ""} }\n`;
    }
    out += `\n// roster seed (P10b): scripts/starting_save/persist.roster.json →\n// "quirks": { "${id}": { "is_new": false, "is_locked": ${!!b.isLocked}, "mission_count": 0 } }`;
    return out;
  };
  FLOW_QUIRK.dod = function (b) {
    const target = b.isPositive ? 2 : 0, net = b.components.reduce((a, c) => a + compPoints(c), 0);
    return [
      ["Named + polarity + flavor", !!(b.name && b.flavor)],
      ["≥1 component", b.components.length > 0],
      [`On point target (${net}/${target})`, net === target],
      ["Permanence flags chosen", true],
      ["Quirk def in overhaul.quirk_library.json (P5B)", false],
      ["Component buffs in overhaul.buffs.json", false],
      ["Seeded into persist.roster.json (P10b)", false],
      ["Localization: str_quirk_name key (P5)", false],
    ];
  };

  const FLOWS = { "combat-skill": FLOW_COMBAT, "stat-block": FLOW_STAT, "trinket": FLOW_TRINKET, "quirk": FLOW_QUIRK };
  const DEEP_ORDER = ["combat-skill", "stat-block", "trinket", "quirk"];

  // ═══════════════════════════════════════════════════════════════════════════
  //  Shared review pane + add bar
  // ═══════════════════════════════════════════════════════════════════════════
  function addBar(label, kind) {
    return `<button class="ds-add" data-ds="add" data-kind="${esc(kind)}">＋ ${esc(label)}</button>`;
  }
  function reviewPane(snippet, dod, verdicts) {
    const done = dod.filter((d) => d[1]).length;
    return `<p class="ds-prompt">Your authorable scaffold and the Definition-of-Done. Copy the snippet into the mod; check the DoD against the cookbook phase.</p>
      ${verdictList(verdicts)}
      <div class="ds-review">
        <div class="ds-snip"><div class="ds-snip-head"><span>Authorable snippet</span><button class="ds-copy" data-ds="copy">Copy</button></div>
          <pre class="ds-code" id="ds-snippet">${esc(snippet)}</pre></div>
        <div class="ds-dod"><div class="ds-snip-head"><span>Definition of Done — ${done}/${dod.length}</span></div>
          <ul class="ds-dodlist">${dod.map((d) => `<li class="${d[1] ? "on" : ""}">${d[1] ? "✔" : "▢"} ${esc(d[0])}</li>`).join("")}</ul></div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ENGINE — render home / flow
  // ═══════════════════════════════════════════════════════════════════════════
  const carrierIcon = (id) => { const c = (DATA.carriers && DATA.carriers.items || []).find((x) => x.id === id); return c && c.icon; };

  function render() {
    const host = document.getElementById("studio");
    if (!host) return;
    host.innerHTML = S.target && FLOWS[S.target] ? flowHTML() : S.target ? guidedHTML() : homeHTML();
    const main = document.querySelector(".surface-main"); // keep scroll stable like the rest of the app
    if (main && render._scroll != null) main.scrollTop = render._scroll;
  }

  function homeHTML() {
    const deep = DEEP_ORDER.map((id) => {
      const f = FLOWS[id], icon = carrierIcon(f.carrier);
      return `<div class="ds-card deep" data-ds="pick" data-target="${id}">
        <div class="ds-card-h">${icon ? `<img class="ds-card-icon" src="${esc(icon)}" alt="" onerror="this.style.visibility='hidden'">` : `<span class="ds-card-glyph">◆</span>`}<span class="ds-card-name">${esc(f.name)}</span><span class="ds-card-badge">design flow</span></div>
        <div class="ds-card-tag">${esc(f.tagline)}</div>
        <div class="ds-card-cta">Design →</div></div>`;
    }).join("");
    const deepCarriers = new Set(DEEP_ORDER.map((id) => FLOWS[id].carrier).filter(Boolean));
    const guided = (DATA.carriers && DATA.carriers.items || []).filter((c) => !deepCarriers.has(c.id)).map((c) =>
      `<div class="ds-card guided" data-ds="pick" data-target="carrier:${esc(c.id)}">
        <div class="ds-card-h">${c.icon ? `<img class="ds-card-icon" src="${esc(c.icon)}" alt="" onerror="this.style.visibility='hidden'">` : ""}<span class="ds-card-name">${esc(c.name)}</span></div>
        <div class="ds-card-tag">${esc(c.summary || "").slice(0, 96)}</div></div>`).join("");
    return `<div class="ds-home">
      <div class="ds-home-lead"><h2>What are you designing?</h2>
        <p>Pick an element and walk each choice with the mod's balance scales enforced live. Four elements have a full <b>design-as-you-go</b> flow; the rest open a guided reference for now.</p></div>
      <h3 class="ds-sec">Design flows <span class="ds-hint">— number-enforced</span></h3>
      <div class="ds-grid">${deep}</div>
      <h3 class="ds-sec">Guided reference <span class="ds-hint">— walk the forced / choices / limits</span></h3>
      <div class="ds-grid ds-grid-sm">${guided}</div>
    </div>`;
  }

  function flowHTML() {
    const f = FLOWS[S.target], b = build();
    const step = clamp(S.step, 0, f.steps.length - 1);
    const st = f.steps[step];
    const rail = f.steps.map((s, i) =>
      `<button class="ds-step ${i === step ? "active" : i < step ? "done" : ""}" data-ds="goto" data-step="${i}">
        <span class="ds-step-n">${i + 1}</span><span class="ds-step-t">${esc(s.title)}</span></button>`).join("");
    const icon = carrierIcon(f.carrier);
    return `<div class="ds-flow">
      <div class="ds-flow-top">
        <button class="ds-back-home" data-ds="home">← All elements</button>
        <div class="ds-flow-title">${icon ? `<img class="ds-card-icon" src="${esc(icon)}" alt="">` : ""}<b>${esc(f.name)}</b>${b.name ? `<span class="ds-flow-name">“${esc(b.name)}”</span>` : ""}</div>
      </div>
      <div class="ds-rail">${rail}</div>
      <div class="ds-panel">
        <h2 class="ds-panel-q">${step + 1}. ${esc(st.title)}</h2>
        ${st.body(b)}
      </div>
      <div class="ds-nav">
        <button class="ds-ghost" data-ds="prev" ${step === 0 ? "disabled" : ""}>← Back</button>
        ${step < f.steps.length - 1 ? `<button class="ds-next" data-ds="next">Next →</button>` : `<button class="ds-next" data-ds="restart">Design another ↺</button>`}
      </div>
    </div>`;
  }

  function guidedHTML() {
    const id = S.target.slice("carrier:".length);
    const c = (DATA.carriers && DATA.carriers.items || []).find((x) => x.id === id);
    if (!c) { S.target = null; return homeHTML(); }
    const list = (arr, kind) => arr && arr.length
      ? `<ul class="ds-guided-list">${arr.map((it) => `<li><b>${esc(it.element || it.choice || it.limit || "")}</b>${it.why || it.detail ? `<span>${esc(it.why || it.detail)}</span>` : ""}${it.link && it.link.view ? ` <button class="ds-ref" data-action="goto-view" data-view="${esc(it.link.view)}">ref →</button>` : ""}</li>`).join("")}</ul>`
      : `<p class="ds-empty">—</p>`;
    return `<div class="ds-flow">
      <div class="ds-flow-top"><button class="ds-back-home" data-ds="home">← All elements</button>
        <div class="ds-flow-title">${c.icon ? `<img class="ds-card-icon" src="${esc(c.icon)}" alt="">` : ""}<b>${esc(c.name)}</b><span class="ds-flow-name">guided reference</span></div></div>
      <div class="ds-panel">
        <p class="ds-prompt">${esc(c.summary || "")}</p>
        <div class="ds-guided"><h3>Forced</h3>${list(c.forced)}<h3>Choices</h3>${list(c.choices)}<h3>Hard limits</h3>${list(c.limits)}</div>
        <p class="ds-note">A full design-as-you-go flow for <b>${esc(c.name)}</b> is on the backlog — for now, the Appendix carries its wiring, effects, and rule gates.</p>
      </div></div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  PICKER OVERLAY (#picker-root) — searchable list for add-actions
  // ═══════════════════════════════════════════════════════════════════════════
  let picker = null; // { title, items:[{id,name,summary,tag}], onPick }
  function openPicker(cfg) { picker = { q: "", ...cfg }; renderPicker(); }
  function closePicker() { picker = null; const r = document.getElementById("picker-root"); if (r) { r.classList.add("hidden"); r.innerHTML = ""; } }
  function pickerItems() {
    const q = (picker.q || "").toLowerCase();
    return picker.items.filter((it) => !q || (it.name + " " + it.id + " " + (it.summary || "") + " " + (it.tag || "")).toLowerCase().includes(q));
  }
  function renderPicker() {
    const r = document.getElementById("picker-root"); if (!r || !picker) return;
    const rows = pickerItems().slice(0, 200).map((it) =>
      `<button class="ds-pick-row" data-dsp="pick" data-id="${esc(it.id)}">
        <span class="ds-pick-name">${esc(it.name)}${it.tag ? ` <span class="ds-pick-tag">${esc(it.tag)}</span>` : ""}</span>
        ${it.summary ? `<span class="ds-pick-sum">${esc(it.summary)}</span>` : ""}</button>`).join("");
    r.innerHTML = `<div class="ds-pick-panel" role="dialog" aria-modal="true">
      <div class="ds-pick-head"><h3>${esc(picker.title)}</h3><button class="ds-pick-close" data-dsp="close">✕</button></div>
      <input class="ds-pick-search" data-dsp="search" placeholder="Search…" value="${esc(picker.q || "")}" />
      <div class="ds-pick-list">${rows || `<p class="ds-empty">No matches.</p>`}</div></div>`;
    r.classList.remove("hidden");
    const inp = r.querySelector(".ds-pick-search"); if (inp && picker._focus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  // sources for the picker
  function effectItems() { return ((DATA.surfaces.effects && DATA.surfaces.effects.items) || []).map((e) => ({ id: e.id, name: e.name, summary: e.summary, tag: e.category, _raw: e })); }
  function buffStatItems() { return ((DATA.surfaces.buffStats && DATA.surfaces.buffStats.items) || []).map((s) => ({ id: s.id, name: s.name, summary: s.summary, tag: s.unit, _raw: s })); }
  function ladderItems() { return LADDER.filter((e) => !e.placeholder).map((e) => ({ id: e.name, name: e.name, summary: `ladder ${e.ladder.join(" / ")}${e.modified ? "  · gate-eligible" : ""}`, tag: e.unit, _raw: e })); }
  function gateItems() {
    // locked rules first, then provisional (both usable); provisional carries a visible tag
    return TRULES.filter((r) => r.modifier != null)
      .slice().sort((a, b) => (a.provisional === b.provisional ? 0 : a.provisional ? 1 : -1))
      .map((r) => ({
        id: r.rule + "|" + (r.ruleData || ""),
        name: r.rule + (r.ruleData ? ` (${r.ruleData})` : ""),
        summary: `×${r.modifier}${r.provisional ? " · provisional" : ""}${r.notes ? " — " + r.notes : ""}`,
        tag: "×" + r.modifier + (r.provisional ? " ⚑" : ""), _raw: r,
      }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ACTION HANDLERS (forwarded by app.js)
  // ═══════════════════════════════════════════════════════════════════════════
  function rememberScroll() { const main = document.querySelector(".surface-main"); render._scroll = main ? main.scrollTop : 0; }

  function handleClick(el) {
    const ds = el.dataset.ds, b = S.target && FLOWS[S.target] ? build() : null;
    rememberScroll();
    switch (ds) {
      case "pick": {
        const t = el.dataset.target;
        if (t.startsWith("carrier:")) { S.target = t; S.step = 0; } else { S.target = t; S.step = 0; build(); }
        save(); render(); break;
      }
      case "home": S.target = null; save(); render(); break;
      case "goto": S.step = clamp(Number(el.dataset.step), 0, FLOWS[S.target].steps.length - 1); save(); render(); break;
      case "next": S.step = clamp(S.step + 1, 0, FLOWS[S.target].steps.length - 1); save(); render(); break;
      case "prev": S.step = clamp(S.step - 1, 0, FLOWS[S.target].steps.length - 1); save(); render(); break;
      case "restart": S.target = null; save(); render(); break;
      case "inc": case "dec": {
        const mag = Number(el.dataset.step) || 1, d = (ds === "inc" ? 1 : -1) * mag;
        applyNumber(b, el.dataset.field, d, Number(el.dataset.lo), Number(el.dataset.hi), el.dataset.arg); save(); render(); break;
      }
      case "set": setField(b, el.dataset.field, el.dataset.value); save(); render(); break;
      case "rank": {
        const r = Number(el.dataset.value), f = el.dataset.field, set = new Set(b[f]);
        set.has(r) ? set.delete(r) : set.add(r); b[f] = [...set].sort(); save(); render(); break;
      }
      case "toggle": b[el.dataset.field] = !b[el.dataset.field]; save(); render(); break;
      case "add": openAdd(b, el.dataset.kind); break;
      case "del": removeComp(b, Number(el.dataset.idx)); save(); render(); break;
      case "gate": openGate(b, Number(el.dataset.idx), "components"); break;
      case "gate-buff": openGate(b, Number(el.dataset.idx), "buffs"); break;
      case "copy": copySnippet(el); break;
    }
  }
  function handleInput(el) {
    const b = S.target && FLOWS[S.target] ? build() : null; if (!b) return;
    if (el.dataset.ds === "text") { b[el.dataset.field] = el.value; save(); /* no full re-render: keep caret */ syncReview(); }
  }
  function handleChange(el) {
    const b = S.target && FLOWS[S.target] ? build() : null; if (!b) return;
    if (el.dataset.ds !== "select") return;
    rememberScroll();
    const idx = Number(el.dataset.idx), kind = el.dataset.kind, list = b.components;
    if (kind === "buff-step") list[idx].step = Number(el.value);
    else if (kind === "malus-tier") list[idx].tier = Number(el.value);
    save(); render();
  }

  function applyNumber(b, field, d, lo, hi, arg) {
    if (field === "combat" || field === "resist") { const i = Number(arg); b[field][i] = clamp(b[field][i] + d, lo, hi); if (field === "combat") b.role = ""; }
    else if (field === "buffAmt") { const i = Number(arg); b.buffs[i].amount = clamp(b.buffs[i].amount + d, lo, hi); }
    else b[field] = clamp((b[field] || 0) + d, lo, hi);
  }
  function setField(b, field, value) {
    if (field === "isPositive") b.isPositive = value === "pos";
    else if (field === "role" && FLOWS[S.target].id === "stat-block") { b.role = value; if (SS.roles[value]) b.combat = SS.roles[value].slice(); }
    else b[field] = value;
  }
  function removeComp(b, idx) {
    if (FLOWS[S.target].id === "combat-skill") {
      // effects list on the effects step, buffs list on the buffs step
      const st = FLOWS[S.target].steps[S.step].id;
      if (st === "effects") b.effects.splice(idx, 1); else if (st === "buffs") b.buffs.splice(idx, 1);
    } else b.components.splice(idx, 1);
  }
  function openAdd(b, kind) {
    if (kind === "effect") {
      openPicker({ title: "Add an effect payload", items: effectItems(), _focus: true, onPick: (it) => { b.effects.push({ id: it.id, name: it._raw.name, category: it._raw.category, summary: it._raw.summary }); } });
    } else if (kind === "buffstat") {
      openPicker({ title: "Add a buff (stat_type)", items: buffStatItems(), _focus: true, onPick: (it) => { b.buffs.push({ id: it._raw.id, name: it._raw.name, subType: it._raw.sub_type || "", unit: it._raw.unit, amount: it._raw.unit === "flat" ? 1 : 15, rule: "always", ruleData: null }); } });
    } else if (kind === "ladder-buff") {
      openPicker({ title: "Add a buff (value ladder)", items: ladderItems(), _focus: true, onPick: (it) => { const e = it._raw; b.components.push({ effectName: e.name, statType: e.statType, unit: e.unit, modified: e.modified, kind: "buff", step: FLOWS[S.target].id === "trinket" ? stepOf(build().rarity) : 0, tier: 1, rule: "always", ruleData: null }); } });
    } else if (kind === "ladder-malus") {
      openPicker({ title: "Add a drawback", items: ladderItems(), _focus: true, onPick: (it) => { const e = it._raw; b.components.push({ effectName: e.name, statType: e.statType, unit: e.unit, modified: e.modified, kind: "malus", step: 0, tier: 1, rule: "always", ruleData: null }); } });
    }
  }
  function openGate(b, idx, listName) {
    const list = listName === "buffs" ? b.buffs : b.components;
    openPicker({
      title: "Choose a rule gate", items: [{ id: "always|", name: "always", summary: "unconditional ×1", tag: "×1", _raw: { rule: "always", ruleData: "" } }].concat(gateItems()), _focus: true,
      onPick: (it) => { list[idx].rule = it._raw.rule; list[idx].ruleData = it._raw.ruleData || null; },
    });
  }
  function copySnippet(el) {
    const pre = document.getElementById("ds-snippet"); if (!pre) return;
    const txt = pre.textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => { el.textContent = "Copied ✓"; setTimeout(() => (el.textContent = "Copy"), 1400); }).catch(() => { });
  }
  // live-update the review snippet/dod without a full re-render (so text inputs keep focus)
  function syncReview() {
    if (!S.target || !FLOWS[S.target]) return;
    const f = FLOWS[S.target]; if (f.steps[S.step].id !== "review") return;
    const b = build(), pre = document.getElementById("ds-snippet");
    if (pre) pre.textContent = f.snippet(b);
  }

  // picker-root events (its own listeners — separate from app.js overlays)
  function bindPicker() {
    const r = document.getElementById("picker-root"); if (!r) return;
    r.addEventListener("click", (e) => {
      const el = e.target.closest("[data-dsp]"); if (!el) { if (e.target.id === "picker-root") closePicker(); return; }
      const a = el.dataset.dsp;
      if (a === "close") return closePicker();
      if (a === "pick" && picker) {
        const it = picker.items.find((x) => x.id === el.dataset.id);
        if (it && picker.onPick) { rememberScroll(); picker.onPick(it); save(); closePicker(); render(); }
      }
    });
    r.addEventListener("input", (e) => { const el = e.target.closest("[data-dsp='search']"); if (el && picker) { picker.q = el.value; picker._focus = true; renderPicker(); } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && picker) { e.stopPropagation(); closePicker(); } }, true);
  }

  // ── expose ──
  window.DDCDesigner = {
    render,
    handleClick, handleInput, handleChange,
    isStudioNode: (el) => !!(el && el.closest && el.closest("#studio")),
    initPicker: bindPicker,
  };
})();
