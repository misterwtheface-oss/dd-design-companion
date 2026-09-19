# DD Design Companion — Wiki / Data Context (read me to resume)

LLM-oriented context tree for this project. If you're a future session picking this up, read
`Progress.md` first, then this.

## What this is
A design-companion + wiki SPA for the **Darkest Dungeon 1 overhaul mod**. See `SPEC_PLAN.md` for the
full spec. The knowledge it renders lives in two sibling workspaces — this repo only ships the
*compiled* view of it.

## Source-of-truth workspaces (NOT shipped in this repo)
- **`../dd-mods/`** — the modding project. Hero designs (`notes/hero-design-*.md`), the balance
  scales (`notes/stat_scale.csv`, `notes/STAT_SCALING.md`, `notes/trinket-buff-weights.csv`,
  `notes/trinket-rule-modifiers.csv`), the tools (`tools/stat_block.py`, `tools/trinket_value.py`),
  the per-hero Definition of Done (`notes/HERO_COOKBOOK.md`), and design intent (`INTENT.md`).
  Status log: `PROGRESS.md`.
- **`../_dd_extract/`** — the datamine context wiki. The possibility-space reference docs:
  `EFFECT_COMPONENTS.md`, `EFFECTS_REFERENCE.md`, `BUFF_COMPONENTS.md`, `BUFFS_REFERENCE.md`,
  `EFFECT_BUFF_BRIDGE.md`, plus `REGISTRIES.md` (code-certain enum tables). Hub: `CONTEXT_MAP.md`.

These two are the input. **They are `.gitignore`-adjacent by policy**: never copy the datamine or the
mod's raw notes into this repo. Only the compiled `data/*.json` is tracked (see
[[feedback_extract_not_in_app_repo]] in the user's memory).

## The pipeline
`build-data.mjs` reads the authored `data/*.json` files, runs data-hygiene guardrails (every
cross-reference and enum must resolve), and writes `data.js` (`window.DDC_DATA`). Run:

```
node build-data.mjs            # warnings allowed
node build-data.mjs --strict   # warnings promoted to errors (pre-release pass)
```

A clean run prints a hygiene report and writes `data.js`. On any error it prints the offenders and
**refuses to overwrite** the last good `data.js`.

## How the `data/*.json` was produced
The JSON files in `data/` were extracted from the source docs above (by LLM sub-agents during
scaffolding, schema-validated by the pipeline). To **regenerate or extend** a file, re-read the
corresponding source doc and re-emit the JSON to the schema documented at the top of `build-data.mjs`
and in `SPEC_PLAN.md`'s data-model table. Each `data/*.json` is self-describing (a `_meta` block
records its source doc + extraction date).

Current `data/` files and their sources:
- `effects.json`  ← `_dd_extract/EFFECT_COMPONENTS.md` + `EFFECTS_REFERENCE.md`
- `buff_stats.json` ← `_dd_extract/BUFF_COMPONENTS.md` + `BUFFS_REFERENCE.md`
- `buff_rules.json` ← `_dd_extract/BUFF_COMPONENTS.md §3` + `dd-mods/notes/trinket-rule-modifiers.csv`
- `bridge.json` ← `_dd_extract/EFFECT_BUFF_BRIDGE.md`
- (P1) `heroes.json` ← `dd-mods/notes/hero-design-*.md`
- (P1) `stat_scale.json` ← `dd-mods/notes/stat_scale.csv` + `STAT_SCALING.md`
- (P1) `trinket_ladder.json` ← `dd-mods/notes/trinket-buff-weights.csv` + `trinket-rule-modifiers.csv`

## What ships vs. what stays out
- **Ships (tracked):** `index.html`, `styles.css`, `app.js`, `build-data.mjs`, `tools/serve.mjs`,
  `data/*.json` (compiled), the generated `data.js`, planning docs.
- **Stays out (`.gitignore`d / never copied):** the `_dd_extract` datamine, the `dd-mods` raw notes
  and `.py` tools, the game install, any decompiled source. This repo is public (GitHub Pages) — it
  must contain only the mod's *design surface*, authored by us.

## Key domain facts (so the renderer stays faithful)
- **Effects** are skill payloads (`.darkest`); **buffs** are stat modifiers (`shared/buffs/*.json`,
  93 `stat_type`s). A skill applies a buff through the **bridge** (`.buff_ids` for named buffs, or
  inline `combat_stat_buff`). Named buffs unlock what effects can't: the 55 `rule_type` conditional
  gates, resistances, and the wider stat palette. This three-part structure IS the Possibility Space.
- **Balance scales:** each hero is a point-buy vector — 6 combat tiers + 8 resist tiers, each summing
  to 30. Trinket buffs are priced on a 6-rarity ladder × a per-`rule_type` conditional modifier
  (`value = base_ladder(effect, rarity) × rule_modifier`). The valuator is a faithful port of
  `dd-mods/tools/trinket_value.py`.
