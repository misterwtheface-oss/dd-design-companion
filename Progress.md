# DD Design Companion — Progress

Cross-session status log. Newest on top. Read this first, then `WIKI_CONTEXT.md`.

## Current state (2026-09-19 — scaffolding session)
- **LIVE:** https://misterwtheface-oss.github.io/dd-design-companion/ (repo
  `misterwtheface-oss/dd-design-companion`, Pages main/root, analytics active). P0 shipped.

- **Purpose:** design-companion + wiki for the DD1 overhaul mod (`../dd-mods`). Three surfaces:
  Possibility Space (P0), Hero Designs (P1), Balance Scales (P1). See `SPEC_PLAN.md`.
- **Decisions locked this session:** deploy target = **live public GitHub Pages**; P0 priority =
  **Possibility Space** first (the catalog backbone the other surfaces link into).
- Scaffolded from `build-calc-planner` but re-shaped to catalog-browser-first (not build-first);
  DPS/loadout parts dropped, reference/visualization surfaces added.

## Backlog
### P0 (this session)
- [x] App shell + top nav + DD-gothic palette (mobile-first).
- [x] Possibility Space surface: Effects / Buff Stats / Rule Gates / Bridge — category-tabbed,
      coloured, searchable tile grids → detail overlay.
- [x] `build-data.mjs` + hygiene guardrails + hygiene report.
- [x] `data/*.json`: effects (176), buff_stats (93), buff_rules (55), bridge (9 sec/22 trig).
- [x] Deploy live to GitHub Pages; confirmed URL responds (200).

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
### 2026-09-19 — session 1b (Possibility Space polish)
- **Chips → dropdown:** the category chip strip filled the phone screen; replaced with a compact
  `<select>` (with the active category's game icon) + search on one toolbar row.
- **Game icons:** copied real DD status/resist icons (`overlays/tray_*`, `shared/resistance/*`,
  `overlays/torch.png`) into `assets/icons/` (41 files). `build-data.mjs` resolves a per-entry icon
  by keyword match on id+name (bleed→tray_bleed, stun→tray_stun, heal→tray_dot_hp_heal, …) with a
  per-group fallback icon; **guardrail fails the build if any referenced icon is missing**. Icons
  render on tiles, in the detail header, and beside the category dropdown.
- **Rich docs:** every catalog entry now carries an authoritative `doc` + `ref`, extracted from
  `EFFECTS_REFERENCE` / `BUFFS_REFERENCE` / `PARAMETER_GLOSSARY` into `data/*.enrich.json` id-maps
  and merged by the pipeline (324/324 enriched). Detail overlay shows the rich doc as the lead + a
  "Grounded in <ref>" citation; the short summary becomes a teaser. Strict build = 0 warnings.
- ⚠ **Licensing note:** the icons are Red Hook's copyrighted art, now in a PUBLIC repo. This mirrors
  the tension the mod's own `LICENSING.md` addresses ("public build ships zero art"). Fine for a
  personal fan wiki; revisit if the tool is ever formally distributed (could gate icons behind a
  local-only asset dir, or swap to original glyphs).

### 2026-09-19 — session 1 (scaffold)
- Read up on `dd-mods` (PROGRESS/INTENT/HERO_COOKBOOK) and `_dd_extract` (CONTEXT_MAP + component
  docs + balance CSVs + `trinket_value.py`). Confirmed the tool's intent differs from a build calc.
- Presented the plan; user chose live Pages + Possibility Space first.
- (in progress) extracting `data/*.json` from the reference docs; writing the shell + pipeline.
