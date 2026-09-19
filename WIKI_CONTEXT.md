# DD Design Companion — Wiki / Data Context (read me to resume)

LLM-oriented context tree for this project. If you're a future session picking this up, read
`Progress.md` first (newest-on-top status log), then this.

## What this is
A design-companion + wiki SPA for the **Darkest Dungeon 1 overhaul mod**. **Not a build calculator** —
a reference & visualization tool for *building the mod*. See `SPEC_PLAN.md` for the original spec (note
the UI has since been reframed — this doc is the current truth).

**Current architecture (as shipped):**
- **Wizard** = the front door. A 4-question guided flow over the 14 **carriers** (the content types you
  author): (1) What are you building? → pick a carrier · (2) What's forced by that start? · (3) What
  choices does it give? · (4) What's the hard limit? Q1 is a carrier picker; Q2–Q4 are a stepped
  accordion (Forced / Choices / Limits), whose items jump-link into the Appendix.
- **Appendix** = one overlay (opened from a single nav button) hosting the whole reference layer as an
  internal tab strip: **Design Elements** (the 14 carriers + their wiring) · **Effects** (176) · **Buff
  Stats** (93) · **Rule Gates** (55) · **Bridge** (effect→buff chain + 22 trinket triggers). Searchable,
  category-filtered; tile detail stacks above the overlay.
- The unifying model the whole tool teaches: a **buff** is the leaf (a stat modifier, gatable by any of
  the 55 `rule_type`s); an **effect** is the only bridge to a buff for carriers that can't hold one.
  Every carrier is some mix of **B** (holds buffs directly) · **E** (carries effects) · **T** (fires on
  a trigger) · **S** (sets base stats).

## Source-of-truth workspaces (NOT committed in this repo)
- **`../dd-mods/`** — the modding project. Hero designs (`notes/hero-design-*.md`), balance scales
  (`notes/stat_scale.csv`, `STAT_SCALING.md`, `trinket-buff-weights.csv`, `trinket-rule-modifiers.csv`),
  tools (`tools/stat_block.py`, `tools/trinket_value.py`), the per-hero DoD (`notes/HERO_COOKBOOK.md`),
  design intent (`INTENT.md`). Status: `PROGRESS.md`.
- **`../_dd_extract/`** — the datamine context wiki. Possibility-space refs (`EFFECT_COMPONENTS.md`,
  `EFFECTS_REFERENCE.md`, `BUFF_COMPONENTS.md`, `BUFFS_REFERENCE.md`, `EFFECT_BUFF_BRIDGE.md`,
  `PARAMETER_GLOSSARY.md`, `MONSTERS_REFERENCE.md`, `QUIRKS_DISEASES_REFERENCE.md`, etc.), hub
  `CONTEXT_MAP.md`, and **`assets/`** — the full 730MB image export that `tools/sync-icons.mjs` pulls
  the shipped icons FROM (see `_dd_extract/ASSET_MAP.md`).

These two are the input. **Never copy the datamine or the mod's raw notes into this repo** (it's public
Pages). Only our authored/compiled design surface is tracked ([[feedback_extract_not_in_app_repo]]).

## Build & sync
Both are vanilla Node, **zero npm dependencies**.
```
node build-data.mjs            # compile data/*.json -> data.js (window.DDC_DATA), with hygiene guardrails
node build-data.mjs --strict   # warnings promoted to errors (pre-release pass)
node tools/sync-icons.mjs      # (re)build assets/icons/ from ../_dd_extract/assets via data/icon-sources.json
node tools/sync-icons.mjs --prune   # also delete on-disk icons not in the map
node tools/serve.mjs           # preview at http://localhost:8080 (+ LAN); stop when done
```
`build-data.mjs` guardrails: every catalog item's group resolves, every referenced **icon exists on
disk**, every wizard jump-link resolves to a real view — else it fails and leaves the last good
`data.js` intact. `sync-icons.mjs` cross-checks: any icon `build-data.mjs` references must be mapped in
`icon-sources.json`, and reports mapped-but-unreferenced icons (currently 12, reserved for the P1 stat
visualizer — kept on purpose).

## Data model (`data/`)
| File | Rows | Source | Feeds |
|---|---|---|---|
| `effects.json` (+`.enrich.json`) | 176 effect payloads / 16 cats | `_dd_extract/EFFECT_COMPONENTS` + `EFFECTS_REFERENCE` | Appendix → Effects |
| `buff_stats.json` (+`.enrich.json`) | 93 stat_types / 14 domains | `BUFF_COMPONENTS` + `BUFFS_REFERENCE` | Appendix → Buff Stats |
| `buff_rules.json` (+`.enrich.json`) | 55 rule gates / 12 groups | `BUFF_COMPONENTS §3` + `trinket-rule-modifiers.csv` | Appendix → Rule Gates |
| `bridge.json` | 9 sections + 22 triggers | `EFFECT_BUFF_BRIDGE` | Appendix → Bridge |
| `carriers.json` | 14 carriers + wiring | MONSTERS/QUIRKS/DEATHS_DOOR/CURIOS/BRIDGE + HERO_COOKBOOK | Appendix → Design Elements **and** the Wizard entry points |
| `wizard.enrich.json` | forced/choices/limits per carrier | HERO_COOKBOOK + carriers + refs | merged onto carriers → the Wizard steps |
| `icon-sources.json` | 49 icon → extract path | provenance recovered by content-hash off `_dd_extract/assets` | `sync-icons.mjs` |

**Enrichment pattern:** the `*.enrich.json` files are compact `{ id: {doc, ref} }` (or wizard
`{ id: {forced,choices,limits} }`) maps merged onto the base records by `build-data.mjs`, keyed by id.
This keeps rich descriptions decoupled from the base structure (low-risk regeneration). To extend an
entry's docs, re-read the source ref doc and re-emit its enrich map; ids must match exactly.

## What ships vs. what stays out
- **Ships (tracked):** `index.html`, `styles.css`, `app.js`, `build-data.mjs`, `tools/serve.mjs`,
  `tools/sync-icons.mjs`, `data/*.json` (incl. `*.enrich.json` + `icon-sources.json`), the generated
  `data.js`, `assets/icons/*.png` (49), planning docs.
- **Stays out (`.gitignore`d):** the `_dd_extract` datamine + its asset export, the `dd-mods` raw notes
  and `.py` tools, `node_modules` + `package*.json` (dev-test only, e.g. jsdom), OS/editor cruft, test
  scratch (`_test*.mjs`).

## Testing note
No test framework is committed. Interactive UI flows were verified with an ad-hoc **jsdom** click-through
(installed transiently, cleaned up after). If you re-run: `npm i jsdom --no-save`, write a `_test.mjs`
inside the project (gitignored), run it, then delete it + `node_modules` + `package*.json`.
