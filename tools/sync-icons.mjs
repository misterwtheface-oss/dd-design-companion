/*
  sync-icons.mjs — (re)build assets/icons/ from the canonical extract, lean.

  The companion ships only the handful of game icons its UI references. Rather than
  hand-copy them, this pulls each one — by exact provenance — from the sibling
  datamine `../_dd_extract/assets/` using data/icon-sources.json (name -> source path).

  It also cross-checks against build-data.mjs: every icon name that build-data.mjs
  references must be mapped (else the build would fail on a missing icon), and any
  mapped-but-unreferenced icon is reported so the set can be pruned.

  Usage:
    node tools/sync-icons.mjs           # copy referenced icons, report drift
    node tools/sync-icons.mjs --prune   # also delete icons/ files not in the map
    node tools/sync-icons.mjs --strict  # exit non-zero on any drift (CI)
*/
import fs from "node:fs";
import path from "node:path";

const EXTRACT = path.resolve("..", "_dd_extract", "assets");
const MAP_FILE = path.join("data", "icon-sources.json");
const ICONS_DIR = path.join("assets", "icons");
const BUILD_DATA = "build-data.mjs";
const PRUNE = process.argv.includes("--prune");
const STRICT = process.argv.includes("--strict");

const problems = [];

function readMap() {
  if (!fs.existsSync(MAP_FILE)) { problems.push(`missing ${MAP_FILE}`); return {}; }
  const raw = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
  return raw.icons || raw; // tolerate {_comment, icons} or a bare map
}

// Names build-data.mjs actually resolves: any map key that appears as a quoted
// string literal in build-data.mjs. Robust to how the mapping tables are written.
function referencedNames(mapKeys) {
  if (!fs.existsSync(BUILD_DATA)) return new Set(mapKeys); // can't check -> treat all as used
  const src = fs.readFileSync(BUILD_DATA, "utf8");
  const used = new Set();
  for (const k of mapKeys) {
    const re = new RegExp(`["'\`]${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`);
    if (re.test(src)) used.add(k);
  }
  return used;
}

const map = readMap();
const names = Object.keys(map);
const used = referencedNames(names);

fs.mkdirSync(ICONS_DIR, { recursive: true });

let copied = 0, unchanged = 0, missingSrc = 0;
for (const name of names) {
  const src = path.join(EXTRACT, map[name]);
  const dst = path.join(ICONS_DIR, name + ".png");
  if (!fs.existsSync(src)) { problems.push(`source missing for "${name}": ${map[name]}`); missingSrc++; continue; }
  if (fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size) { unchanged++; continue; }
  fs.copyFileSync(src, dst);
  copied++;
}

// referenced by build-data.mjs but not in the provenance map -> would break build
const onDisk = new Set(fs.readdirSync(ICONS_DIR).filter(f => f.endsWith(".png")).map(f => f.slice(0, -4)));
const buildSrc = fs.existsSync(BUILD_DATA) ? fs.readFileSync(BUILD_DATA, "utf8") : "";
const unmapped = [];
// icon names referenced in build-data.mjs live as quoted tokens; flag any that resolve
// through haveIcon()/iconPath() but have neither a map entry nor a file on disk.
for (const m of buildSrc.matchAll(/["'`]([a-z0-9_]+)["'`]\s*[,\]}]/g)) {
  const tok = m[1];
  if (/^(tray_|carrier_|resistance_icon_|icon_|currency\.|torch$)/.test(tok) || tok.startsWith("icon_")) {
    if (!map[tok] && !onDisk.has(tok)) unmapped.push(tok);
  }
}
const unmappedUniq = [...new Set(unmapped)];

// mapped/on-disk but never referenced -> prunable
const unused = names.filter(n => !used.has(n));
const orphanFiles = [...onDisk].filter(n => !map[n]);

console.log("── icon sync ──────────────────────────────");
console.log(`extract: ${EXTRACT}`);
console.log(`copied ${copied} · unchanged ${unchanged} · missing-source ${missingSrc} · total mapped ${names.length}`);
if (unmappedUniq.length) { problems.push(`build-data.mjs references icon(s) with no provenance map entry: ${unmappedUniq.join(", ")}`); }
if (unused.length) console.log(`⚠ ${unused.length} mapped icon(s) not referenced by build-data.mjs: ${unused.join(", ")}`);
if (orphanFiles.length) {
  console.log(`⚠ ${orphanFiles.length} file(s) in ${ICONS_DIR} not in the map: ${orphanFiles.join(", ")}`);
  if (PRUNE) { for (const n of orphanFiles) fs.rmSync(path.join(ICONS_DIR, n + ".png")); console.log(`  pruned ${orphanFiles.length}`); }
}
if (problems.length) { console.log(`✗ ${problems.length} problem(s):`); problems.forEach(p => console.log(`    ${p}`)); }
console.log("─".repeat(44));

if (problems.length && STRICT) { console.error("SYNC FAILED (strict)."); process.exit(1); }
if (missingSrc) process.exit(1);
