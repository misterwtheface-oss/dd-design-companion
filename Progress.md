# DD Design Companion — Progress

Cross-session status log. Newest on top. Read this first, then `WIKI_CONTEXT.md`.

## Current state (2026-09-19 — scaffolding session)
- **Purpose:** design-companion + wiki for the DD1 overhaul mod (`../dd-mods`). Three surfaces:
  Possibility Space (P0), Hero Designs (P1), Balance Scales (P1). See `SPEC_PLAN.md`.
- **Decisions locked this session:** deploy target = **live public GitHub Pages**; P0 priority =
  **Possibility Space** first (the catalog backbone the other surfaces link into).
- Scaffolded from `build-calc-planner` but re-shaped to catalog-browser-first (not build-first);
  DPS/loadout parts dropped, reference/visualization surfaces added.

## Backlog
### P0 (this session)
- [ ] App shell + top nav + DD-gothic palette (mobile-first).
- [ ] Possibility Space surface: Effects / Buff Stats / Rule Gates / Bridge — category-tabbed,
      coloured, searchable tile grids → detail overlay.
- [ ] `build-data.mjs` + hygiene guardrails + hygiene report.
- [ ] `data/*.json`: effects, buff_stats, buff_rules, bridge (extracted from `_dd_extract`).
- [ ] Deploy live to GitHub Pages; confirm URL responds.

### P1
- [ ] Hero Designs viewer (Crusader / Highwayman / Vestal) with effect/buff links into the catalog.
- [ ] Trinket Valuator (JS port of `trinket_value.py`).
- [ ] Stat point-buy visualizer (6+8 tiers → base→max table + role presets).
- [ ] Bridge deep view (22-trigger firing table).

### P2
- [ ] Cross-reference matrix (primitive × hero; stat_type × rule_type).
- [ ] Compose & export `.darkest`/`.json` snippets.
- [ ] Global search across surfaces.
- [ ] Live "do my design's references resolve?" checker.

## Log
### 2026-09-19 — session 1 (scaffold)
- Read up on `dd-mods` (PROGRESS/INTENT/HERO_COOKBOOK) and `_dd_extract` (CONTEXT_MAP + component
  docs + balance CSVs + `trinket_value.py`). Confirmed the tool's intent differs from a build calc.
- Presented the plan; user chose live Pages + Possibility Space first.
- (in progress) extracting `data/*.json` from the reference docs; writing the shell + pipeline.
