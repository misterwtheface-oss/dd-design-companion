/*
  build-data.mjs — compiles authored data (data/*.json) into data.js
  as `window.DDC_DATA = {...}`, running data-hygiene guardrails first.

  Usage:  node build-data.mjs           (warnings allowed)
          node build-data.mjs --strict  (warnings promoted to errors)

  Guardrail philosophy (from the build-calc skeleton): resolve every cross-reference
  BEFORE writing data.js. Here the killer check is the SAME class the mod's own lint
  catches — a catalog item whose group/category doesn't exist, or (P1) a hero skill that
  references an effect/buff id that isn't in the catalog. On any error we refuse to write
  data.js, leaving the last good copy intact.
*/
import fs from "node:fs";
import path from "node:path";

const ACRONYM = "DDC";                    // window.DDC_DATA
const DATA_DIR = "data";
const OUT = "data.js";
const STRICT = process.argv.includes("--strict");

const errors = [];
const warnings = [];

// The three catalog surfaces + how each names its group-list / group-key / item-list.
const CATALOGS = [
  { key: "effects",   label: "Effects",    file: "effects.json",    groupsField: "categories", groupKey: "category", itemsField: "effects" },
  { key: "buffStats", label: "Buff Stats", file: "buff_stats.json", groupsField: "domains",    groupKey: "domain",   itemsField: "stats"   },
  { key: "buffRules", label: "Rule Gates", file: "buff_rules.json", groupsField: "groups",     groupKey: "group",    itemsField: "rules"   },
];

// ── small utils ──
function readJSON(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) { errors.push(`missing source file ${p}`); return null; }
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { errors.push(`${p}: invalid JSON — ${e.message}`); return null; }
}

// HSL→hex; evenly-spaced hues per surface give distinct, stable, muted-gothic group colours.
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

// ── compile one catalog surface, with guardrails ──
function compileCatalog(cfg, surfaceIndex) {
  const raw = readJSON(cfg.file);
  if (!raw) return null;

  const rawGroups = raw[cfg.groupsField];
  const rawItems = raw[cfg.itemsField];
  if (!Array.isArray(rawGroups)) { errors.push(`${cfg.file}: expected an array at "${cfg.groupsField}"`); return null; }
  if (!Array.isArray(rawItems)) { errors.push(`${cfg.file}: expected an array at "${cfg.itemsField}"`); return null; }

  // groups: unique ids, assign colour (respect an authored hex if present)
  const groupIndex = new Map();
  const hueOffset = surfaceIndex * 47;               // stagger surfaces so palettes differ
  rawGroups.forEach((g, i) => {
    if (!g.id) { errors.push(`${cfg.file}: group #${i} has no id`); return; }
    if (groupIndex.has(g.id)) errors.push(`${cfg.file}: duplicate group id "${g.id}"`);
    const authored = /^#[0-9a-fA-F]{6}$/.test(g.color || "") ? g.color : null;
    const color = authored || hslToHex((hueOffset + Math.round((i * 360) / Math.max(1, rawGroups.length))) % 360, 42, 50);
    const rec = { id: g.id, name: g.name || g.id, summary: g.summary || "", color, text: textColorFor(color) };
    groupIndex.set(g.id, rec);
    if (!g.name) warnings.push(`${cfg.file}: group "${g.id}" has no name`);
  });

  // items: unique ids, group must resolve (the dangling-reference guardrail)
  const itemIndex = new Map();
  for (const it of rawItems) {
    if (!it.id) { errors.push(`${cfg.file}: an item has no id (name="${it.name || "?"}")`); continue; }
    if (itemIndex.has(it.id)) errors.push(`${cfg.file}: duplicate item id "${it.id}"`);
    itemIndex.set(it.id, it);
    const gid = it[cfg.groupKey];
    if (!gid) errors.push(`${cfg.file}: item "${it.id}" has no ${cfg.groupKey}`);
    else if (!groupIndex.has(gid)) errors.push(`${cfg.file}: item "${it.id}" -> ${cfg.groupKey} "${gid}" (no such group)`);
    if (!it.name) warnings.push(`${cfg.file}: item "${it.id}" has no name`);
    if (!it.summary) warnings.push(`${cfg.file}: item "${it.id}" has no summary`);
  }

  return {
    key: cfg.key, label: cfg.label, groupKey: cfg.groupKey,
    groups: [...groupIndex.values()],
    items: rawItems,
    _counts: { groups: groupIndex.size, items: itemIndex.size },
  };
}

// ── compile the bridge (bespoke) ──
function compileBridge() {
  const raw = readJSON("bridge.json");
  if (!raw) return { sections: [], triggers: [] };
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const triggers = Array.isArray(raw.triggers) ? raw.triggers : [];
  if (!sections.length) warnings.push(`bridge.json: no sections`);
  triggers.forEach((t, i) => { if (!t.id && !t.name) errors.push(`bridge.json: trigger #${i} has no id/name`); });
  return { sections, triggers };
}

// ── run ──
const surfaces = {};
CATALOGS.forEach((cfg, i) => { const c = compileCatalog(cfg, i); if (c) surfaces[cfg.key] = c; });
const bridge = compileBridge();

// ── hygiene report ──
console.log("── Data hygiene report ──────────────────────────");
for (const key of Object.keys(surfaces)) {
  const s = surfaces[key];
  console.log(`✓ ${s.label.padEnd(11)} ${String(s._counts.items).padStart(3)} items · ${s._counts.groups} groups`);
}
console.log(`✓ Bridge      ${String(bridge.sections.length).padStart(3)} sections · ${bridge.triggers.length} triggers`);
if (errors.length) { console.log(`✗ ${errors.length} error(s):`); errors.forEach(e => console.log(`    ${e}`)); }
if (warnings.length) { console.log(`⚠ ${warnings.length} warning(s):`); warnings.forEach(w => console.log(`    ${w}`)); }
console.log("─".repeat(50));

const hardErrors = errors.length + (STRICT ? warnings.length : 0);
if (hardErrors) {
  console.error(`BUILD FAILED: ${hardErrors} error(s)${STRICT ? " (strict)" : ""}. ${OUT} left untouched.`);
  process.exit(1);
}

// strip the internal _counts before shipping
for (const s of Object.values(surfaces)) delete s._counts;

const data = {
  meta: {
    generated: new Date().toISOString().slice(0, 10),
    surfaces: Object.fromEntries(Object.values(surfaces).map(s => [s.key, s.items.length])),
  },
  surfaces,
  bridge,
};
fs.writeFileSync(OUT, `window.${ACRONYM}_DATA = ${JSON.stringify(data)};\n`);
console.log(`Wrote ${OUT} (window.${ACRONYM}_DATA) — ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB.`);
