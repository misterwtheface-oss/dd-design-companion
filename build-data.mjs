/*
  build-data.mjs — compiles authored data (data/*.json) into data.js
  as `window.DDC_DATA = {...}`, running data-hygiene guardrails first.

  Usage:  node build-data.mjs           (warnings allowed)
          node build-data.mjs --strict  (warnings promoted to errors)

  Pipeline:
    1. read the catalog sources (effects/buff_stats/buff_rules) + bridge
    2. merge each *.enrich.json { id: {doc, ref} } map onto items by id (rich descriptions)
    3. resolve a game ICON per group + per item (keyword match → group fallback), from assets/icons/
    4. run guardrails: group refs resolve, ids unique, every referenced icon exists on disk
    5. write data.js (window.DDC_DATA), or refuse and leave the last good copy intact
*/
import fs from "node:fs";
import path from "node:path";

const ACRONYM = "DDC";
const DATA_DIR = "data";
const ICONS_DIR = path.join("assets", "icons");
const OUT = "data.js";
const STRICT = process.argv.includes("--strict");

const errors = [];
const warnings = [];

const CATALOGS = [
  { key: "effects",   label: "Effects",    file: "effects.json",    groupsField: "categories", groupKey: "category", itemsField: "effects" },
  { key: "buffStats", label: "Buff Stats", file: "buff_stats.json", groupsField: "domains",    groupKey: "domain",   itemsField: "stats"   },
  { key: "buffRules", label: "Rule Gates", file: "buff_rules.json", groupsField: "groups",     groupKey: "group",    itemsField: "rules"   },
];

// ── Game-icon mapping (real DD status/resistance icons copied into assets/icons/) ──
// Per-group fallback icon (category / domain / group id -> icon file, no extension).
const GROUP_ICONS = {
  effects: {
    "damage-dot": "tray_bleed", "healing": "tray_dot_hp_heal", "buffs-debuffs": "tray_buff",
    "control-cc": "tray_stun", "cleanse-status": "tray_buff_plus", "movement": "tray_move",
    "kill": "tray_deathsdoor", "torch-light": "torch", "summon": "icon_summon",
    "transform-stance": "tray_berserk", "steal": "tray_debuff", "turn-economy": "tray_riposte",
    "curio-utility": "tray_town_event", "gates": "tray_tag", "frame": "tray_tag", "skill-line": "tray_tag",
  },
  buffStats: {
    "offense": "tray_buff", "defense": "tray_guard", "resistances": "resistance_icon_debuff",
    "dots": "tray_bleed", "status-chance": "tray_debuff", "healing": "tray_dot_hp_heal",
    "stress": "tray_dot_stress", "states": "tray_stealth", "cures": "tray_buff_plus",
    "scouting": "tray_town_event", "silence": "tray_guard_break", "town-economy": "icon_gold",
    "meta": "tray_tag", "crimson-curse": "tray_afflicted",
  },
  buffRules: {
    "self-hp-state": "tray_deathsdoor", "target-hp-state": "tray_deathsdoor_effects",
    "resolve-state": "tray_virtued", "position-rank": "tray_move", "combat-timing": "tray_riposte",
    "attack-skill-shape": "tray_buff", "status-stealth-guard": "tray_stealth", "monster-type": "tray_tag",
    "mode-class": "tray_berserk", "light-torch": "torch", "location-context": "tray_town_event",
    "inventory-quirk-quest": "tray_tag",
  },
};

// Per-item override: first rule whose regex hits `id + " " + name` wins (keywords excluded to
// avoid false hits, e.g. the generic `resistance` stat listing all 8 resist names).
const ITEM_ICON_RULES = [
  [/deaths?_?door|deathsdoor/i, "tray_deathsdoor"],
  [/death_?blow|deathblow/i, "resistance_icon_death_blow"],
  [/guard_?break/i, "tray_guard_break"],
  [/bleed/i, "tray_bleed"],
  [/poison|blight/i, "tray_poison"],
  [/\bstun/i, "tray_stun"],
  [/disease/i, "tray_disease"],
  [/burn|wildfire/i, "tray_dot_burn"],
  [/stealth/i, "tray_stealth"],
  [/riposte/i, "tray_riposte"],
  [/guard/i, "tray_guard"],
  [/afflict/i, "tray_afflicted"],
  [/virtue|virtued/i, "tray_virtued"],
  [/vampire|crimson/i, "tray_afflicted"],
  [/berserk|stance|\bmode\b|set_mode/i, "tray_berserk"],
  [/torch|light/i, "torch"],
  [/trap/i, "tray_trap_disarm"],
  [/summon/i, "icon_summon"],
  [/stress/i, "tray_dot_stress"],
  [/heal/i, "tray_dot_hp_heal"],
  [/push|pull|shuffle|\bmove/i, "tray_move"],
  [/resolve_?xp|\bxp\b/i, "tray_resolve_xp_bonus"],
  [/debuff/i, "tray_debuff"],
  [/\bbuff/i, "tray_buff"],
  [/\btag\b/i, "tray_tag"],
];

// Carrier (design-element) icons — one representative game icon per carrier.
const CARRIER_ICONS = {
  "hero-combat-skill": "carrier_skill", "hero-camping-skill": "carrier_camp",
  "trinket": "carrier_trinket", "trinket-set-bonus": "carrier_trinket",
  "quirk": "carrier_quirk", "disease": "carrier_disease",
  "deaths-door": "tray_deathsdoor", "afflictions-virtues": "tray_afflicted",
  "monster": "carrier_monster", "curio": "carrier_curio",
  "town-district-building": "carrier_town", "actor-dot": "tray_dot_burn",
  "mode-stance": "tray_berserk", "companion-summon": "icon_summon",
};

const iconExists = new Map();
function haveIcon(name) {
  if (!name) return false;
  if (iconExists.has(name)) return iconExists.get(name);
  const ok = fs.existsSync(path.join(ICONS_DIR, name + ".png"));
  iconExists.set(name, ok);
  return ok;
}
function iconPath(name) { return name ? `${ICONS_DIR.replace(/\\/g, "/")}/${name}.png` : null; }

function resolveItemIcon(surfaceKey, groupId, item) {
  const hay = `${item.id || ""} ${item.name || ""}`;
  for (const [re, icon] of ITEM_ICON_RULES) if (re.test(hay)) return icon;
  return (GROUP_ICONS[surfaceKey] && GROUP_ICONS[surfaceKey][groupId]) || null;
}

// ── utils ──
function readJSON(file, soft = false) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) { if (!soft) errors.push(`missing source file ${p}`); return null; }
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { errors.push(`${p}: invalid JSON — ${e.message}`); return null; }
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function textColorFor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6 ? "#111" : "#fff";
}

// ── compile one catalog surface ──
function compileCatalog(cfg, surfaceIndex) {
  const raw = readJSON(cfg.file);
  if (!raw) return null;
  const rawGroups = raw[cfg.groupsField];
  const rawItems = raw[cfg.itemsField];
  if (!Array.isArray(rawGroups)) { errors.push(`${cfg.file}: expected an array at "${cfg.groupsField}"`); return null; }
  if (!Array.isArray(rawItems)) { errors.push(`${cfg.file}: expected an array at "${cfg.itemsField}"`); return null; }

  // enrichment map (optional): { id: {doc, ref} }
  const enrich = readJSON(cfg.file.replace(/\.json$/, ".enrich.json"), true) || {};
  const enrichKeys = new Set(Object.keys(enrich));

  // groups
  const groupIndex = new Map();
  const hueOffset = surfaceIndex * 47;
  rawGroups.forEach((g, i) => {
    if (!g.id) { errors.push(`${cfg.file}: group #${i} has no id`); return; }
    if (groupIndex.has(g.id)) errors.push(`${cfg.file}: duplicate group id "${g.id}"`);
    const authored = /^#[0-9a-fA-F]{6}$/.test(g.color || "") ? g.color : null;
    const color = authored || hslToHex((hueOffset + Math.round((i * 360) / Math.max(1, rawGroups.length))) % 360, 42, 50);
    const iconName = GROUP_ICONS[cfg.key] && GROUP_ICONS[cfg.key][g.id];
    if (g.id in (GROUP_ICONS[cfg.key] || {}) && !haveIcon(iconName)) errors.push(`${cfg.file}: group "${g.id}" -> icon ${iconName}.png (missing)`);
    else if (!(g.id in (GROUP_ICONS[cfg.key] || {}))) warnings.push(`${cfg.file}: group "${g.id}" has no icon mapping`);
    groupIndex.set(g.id, {
      id: g.id, name: g.name || g.id, summary: g.summary || "",
      color, text: textColorFor(color), icon: haveIcon(iconName) ? iconPath(iconName) : null,
    });
    if (!g.name) warnings.push(`${cfg.file}: group "${g.id}" has no name`);
  });

  // items
  const seen = new Set();
  let enrichedCount = 0;
  for (const it of rawItems) {
    if (!it.id) { errors.push(`${cfg.file}: an item has no id (name="${it.name || "?"}")`); continue; }
    if (seen.has(it.id)) errors.push(`${cfg.file}: duplicate item id "${it.id}"`);
    seen.add(it.id);
    const gid = it[cfg.groupKey];
    if (!gid) errors.push(`${cfg.file}: item "${it.id}" has no ${cfg.groupKey}`);
    else if (!groupIndex.has(gid)) errors.push(`${cfg.file}: item "${it.id}" -> ${cfg.groupKey} "${gid}" (no such group)`);
    // merge enrichment
    if (enrich[it.id]) {
      it.doc = enrich[it.id].doc || it.doc || "";
      if (enrich[it.id].ref) it.ref = enrich[it.id].ref;
      enrichKeys.delete(it.id);
      enrichedCount++;
    }
    // resolve icon
    const iconName = resolveItemIcon(cfg.key, gid, it);
    if (iconName && !haveIcon(iconName)) errors.push(`${cfg.file}: item "${it.id}" -> icon ${iconName}.png (missing)`);
    it.icon = haveIcon(iconName) ? iconPath(iconName) : null;
    if (!it.name) warnings.push(`${cfg.file}: item "${it.id}" has no name`);
    if (!it.summary) warnings.push(`${cfg.file}: item "${it.id}" has no summary`);
  }
  const missingDoc = seen.size - enrichedCount;
  if (Object.keys(enrich).length && missingDoc > 0) warnings.push(`${cfg.file}: ${missingDoc} item(s) have no enrichment doc`);
  for (const k of enrichKeys) warnings.push(`${cfg.file}: enrich id "${k}" matches no item (stale)`);

  return {
    key: cfg.key, label: cfg.label, groupKey: cfg.groupKey,
    groups: [...groupIndex.values()], items: rawItems,
    _counts: { groups: groupIndex.size, items: seen.size, enriched: enrichedCount },
  };
}

function compileBridge() {
  const raw = readJSON("bridge.json");
  if (!raw) return { sections: [], triggers: [] };
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const triggers = Array.isArray(raw.triggers) ? raw.triggers : [];
  if (!sections.length) warnings.push(`bridge.json: no sections`);
  triggers.forEach((t, i) => { if (!t.id && !t.name) errors.push(`bridge.json: trigger #${i} has no id/name`); });
  return { sections, triggers };
}

// ── compile carriers (design elements — the author-first front door) ──
function compileCarriers() {
  const raw = readJSON("carriers.json");
  if (!raw) return { items: [] };
  if (!Array.isArray(raw.carriers)) { errors.push(`carriers.json: expected an array at "carriers"`); return { items: [] }; }
  const seen = new Set();
  for (const c of raw.carriers) {
    if (!c.id) { errors.push(`carriers.json: a carrier has no id (name="${c.name || "?"}")`); continue; }
    if (seen.has(c.id)) errors.push(`carriers.json: duplicate carrier id "${c.id}"`);
    seen.add(c.id);
    const iconName = CARRIER_ICONS[c.id];
    if (iconName && !haveIcon(iconName)) errors.push(`carriers.json: carrier "${c.id}" -> icon ${iconName}.png (missing)`);
    else if (!iconName) warnings.push(`carriers.json: carrier "${c.id}" has no icon mapping`);
    c.icon = haveIcon(iconName) ? iconPath(iconName) : null;
    if (!c.name) warnings.push(`carriers.json: carrier "${c.id}" has no name`);
  }
  return { items: raw.carriers, _count: seen.size };
}

// ── run ──
const surfaces = {};
CATALOGS.forEach((cfg, i) => { const c = compileCatalog(cfg, i); if (c) surfaces[cfg.key] = c; });
const carriers = compileCarriers();
const bridge = compileBridge();

// ── hygiene report ──
console.log("── Data hygiene report ──────────────────────────");
for (const key of Object.keys(surfaces)) {
  const s = surfaces[key];
  console.log(`✓ ${s.label.padEnd(11)} ${String(s._counts.items).padStart(3)} items · ${s._counts.groups} groups · ${s._counts.enriched} enriched`);
}
console.log(`✓ Carriers    ${String(carriers._count || 0).padStart(3)} design elements`);
console.log(`✓ Bridge      ${String(bridge.sections.length).padStart(3)} sections · ${bridge.triggers.length} triggers`);
if (errors.length) { console.log(`✗ ${errors.length} error(s):`); errors.forEach(e => console.log(`    ${e}`)); }
if (warnings.length) { console.log(`⚠ ${warnings.length} warning(s):`); warnings.slice(0, 40).forEach(w => console.log(`    ${w}`)); if (warnings.length > 40) console.log(`    …and ${warnings.length - 40} more`); }
console.log("─".repeat(50));

const hardErrors = errors.length + (STRICT ? warnings.length : 0);
if (hardErrors) {
  console.error(`BUILD FAILED: ${hardErrors} error(s)${STRICT ? " (strict)" : ""}. ${OUT} left untouched.`);
  process.exit(1);
}

for (const s of Object.values(surfaces)) delete s._counts;
delete carriers._count;
const data = {
  meta: { generated: new Date().toISOString().slice(0, 10), surfaces: Object.fromEntries(Object.values(surfaces).map(s => [s.key, s.items.length])) },
  carriers, surfaces, bridge,
};
fs.writeFileSync(OUT, `window.${ACRONYM}_DATA = ${JSON.stringify(data)};\n`);
console.log(`Wrote ${OUT} (window.${ACRONYM}_DATA) — ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB.`);
