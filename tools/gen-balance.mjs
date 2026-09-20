/*
  gen-balance.mjs — dev-time generator. Reads the user-authored balance model from the
  sibling mod workspace (../dd-mods/notes/*.csv) and compiles it into this repo's
  data/balance/*.json (the tracked, authored design surface the companion teaches).

  Same hygiene pattern as tools/sync-icons.mjs (which pulls icons from ../_dd_extract/assets):
  the RAW csv/notes stay OUT of this public repo; only the compiled JSON is committed.

  Sources (dd-mods/notes):
    stat_scale.csv               -> data/balance/stat-scale.json   (tier×rank stat curves + point-buy)
    trinket-buff-weights.csv     -> data/balance/trinket-ladder.json (effect value ladder + malus)
    trinket-rule-modifiers.csv   -> data/balance/trinket-rules.json  (conditional value multipliers)

  Run:  node tools/gen-balance.mjs        (writes if sources present; else leaves JSON intact)
*/
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve("..", "dd-mods", "notes");
const OUT = path.join("data", "balance");
fs.mkdirSync(OUT, { recursive: true });

function readCsv(file) {
  const p = path.join(SRC, file);
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, "utf8").replace(/\r/g, "");
  const lines = text.split("\n").filter((l) => l.length);
  const header = lines.shift().split(",");
  return lines.map((line) => {
    // naive CSV: no quoted commas in these sources (verified)
    const cells = line.split(",");
    const row = {};
    header.forEach((h, i) => (row[h.trim()] = (cells[i] ?? "").trim()));
    return row;
  });
}
const numOr = (s, d = null) => {
  if (s == null || s === "") return d;
  const n = Number(String(s).replace(/%/g, ""));
  return Number.isFinite(n) ? n : d;
};
const write = (name, obj) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 0) + "\n");
  console.log(`  wrote ${OUT}/${name}  (${(fs.statSync(path.join(OUT, name)).size / 1024).toFixed(1)} KB)`);
};

let wrote = 0;

// ── 1. stat scale ────────────────────────────────────────────────────────────
// CSV long form: tier,block,rank,metric,value  → structured curves per block.
const ss = readCsv("stat_scale.csv");
if (ss) {
  // block -> tier -> rank -> {metric:value}  (WeaponDamage) OR tier -> rank -> value (single-metric)
  const dmg = {};      // tier -> [rank]{min,max,avg,crit}
  const single = { WeaponCrit: {}, WeaponSpeed: {}, ArmorDodge: {}, ArmorProt: {}, ArmorHP: {} };
  const resist = {};   // tier -> {Stun,Poison,...}
  const BLOCK_TO_SINGLE = {
    "WeaponCrit%": "WeaponCrit", WeaponSpeed: "WeaponSpeed",
    ArmorDodge: "ArmorDodge", ArmorProt: "ArmorProt", ArmorHP: "ArmorHP",
  };
  for (const r of ss) {
    const tier = String(numOr(r.tier));
    const rank = numOr(r.rank);
    const val = numOr(r.value);
    if (r.block === "WeaponDamage") {
      (dmg[tier] ??= [])[rank] ??= {};
      dmg[tier][rank][r.metric.toLowerCase()] = val;
    } else if (r.block === "Resist") {
      (resist[tier] ??= {})[r.metric] = val;
    } else if (BLOCK_TO_SINGLE[r.block]) {
      const key = BLOCK_TO_SINGLE[r.block];
      (single[key][tier] ??= [])[rank] = val;
    }
    // ArmorSpeed intentionally ignored (unused per STAT_SCALING.md)
  }
  const statScale = {
    provenance: "dd-mods/notes/stat_scale.csv + STAT_SCALING.md (user-authored 2026-09-10)",
    // point-buy order = STAT_SCALING.md role vector order
    combatBlocks: [
      { key: "WeaponDamage", label: "Weapon Damage", unit: "dmg", note: "avg dmg; raw scales with gear rank" },
      { key: "WeaponCrit", label: "Weapon Crit %", unit: "pct", note: "crit chance" },
      { key: "WeaponSpeed", label: "Weapon Speed", unit: "int", note: "all speed comes from the weapon" },
      { key: "ArmorDodge", label: "Dodge", unit: "pct", note: "lighter, archetype-specific axis" },
      { key: "ArmorProt", label: "Protection", unit: "pct", note: "first-class flat mitigation" },
      { key: "ArmorHP", label: "Max HP", unit: "int", note: "flat, reliable durability" },
    ],
    resistTypes: ["Stun", "Poison", "Bleed", "Disease", "Move", "Debuff", "DeathBlow", "Trap"],
    tiers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ranks: [0, 1, 2, 3, 4],
    budgets: { combatSum: 30, resistSum: 30, avgTierCombat: 5, avgTierResist: 3.75 },
    curves: { WeaponDamage: dmg, ...single, Resist: resist },
    // role templates (STAT_SCALING.md; order Dmg/Crit/Spd/Dodge/Prot/HP, all sum 30)
    roles: {
      Bulwark: [3, 2, 2, 3, 10, 10], Juggernaut: [6, 3, 3, 2, 8, 8], Bruiser: [8, 5, 4, 3, 4, 6],
      Skirmisher: [6, 5, 8, 7, 1, 3], Assassin: [9, 9, 7, 2, 1, 2], Marksman: [7, 8, 5, 3, 2, 5],
      Support: [3, 3, 6, 4, 6, 8], Controller: [4, 4, 7, 4, 5, 6],
    },
  };
  write("stat-scale.json", statScale);
  wrote++;
} else console.log("  (stat_scale.csv not found — leaving stat-scale.json intact)");

// ── 2. trinket buff ladder ───────────────────────────────────────────────────
const tw = readCsv("trinket-buff-weights.csv");
if (tw) {
  const STEPS = ["common", "uncommon", "rare", "very_rare", "special", "super_special"];
  const effects = [];
  for (const r of tw) {
    const initial = numOr(r.initial);
    const incrRaw = r.increment;
    const unit = r.unit || "pct";
    const placeholder = initial == null;
    let ladder = null;
    if (!placeholder) {
      // flat stats record increment as a % of initial ("+100%" -> +1/step); pct stats are pt deltas
      let incr = numOr(incrRaw, 0);
      const delta = unit === "flat" ? initial * (incr / 100) : incr;
      ladder = STEPS.map((_, step) => Math.round((initial + delta * step) * 100) / 100);
    }
    effects.push({
      name: r.buff, statType: r.stat_type, subType: r.stat_sub_type || null, unit,
      modified: r.modified === "TRUE", placeholder,
      initial, ladder, notes: r.notes || "",
    });
  }
  write("trinket-ladder.json", {
    provenance: "dd-mods/notes/trinket-buff-weights.csv (G4 balance model)",
    steps: STEPS,
    aliases: { cc: "special", crimson_court: "special", crystal: "super_special", comet: "super_special" },
    // real per-hero slots start at uncommon; common is baseline/malus anchor only
    trinketRarities: ["uncommon", "rare", "very_rare", "special", "super_special"],
    malusTiers: [
      { tier: 1, label: "Common × −1", step: 0 },
      { tier: 2, label: "Rare × −1", step: 2 },
      { tier: 3, label: "Special × −1", step: 4 },
    ],
    effects,
  });
  wrote++;
} else console.log("  (trinket-buff-weights.csv not found — leaving trinket-ladder.json intact)");

// ── 3. trinket rule modifiers ────────────────────────────────────────────────
const tr = readCsv("trinket-rule-modifiers.csv");
if (tr) {
  const rules = tr.map((r) => ({
    rule: r.buff_rule, ruleData: r.rule_data || null, modifier: numOr(r.modifier),
    needsString: r.needs_string === "yes", provisional: /provisional/i.test(r.notes || ""), notes: r.notes || "",
  }));
  const prov = rules.filter((r) => r.provisional).length;
  write("trinket-rules.json", {
    provenance: "dd-mods/notes/trinket-rule-modifiers.csv (conditional value multipliers)",
    note: "value = base_ladder(effect, rarity) × modifier(rule, rule_data). Only modified=TRUE effects may be gated.",
    model: "multiplier ≈ 1 / expected-uptime, snapped to quarters (always=1 · ~1/2=2 · ~1/3=3 · rare=5); parameterized rules ramp +0.5 per rarity step.",
    provisionalCount: prov,
    rules,
  });
  wrote++;
} else console.log("  (trinket-rule-modifiers.csv not found — leaving trinket-rules.json intact)");

console.log(`gen-balance: ${wrote}/3 file(s) regenerated.`);
