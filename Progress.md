# DD Design Companion — Progress

Cross-session status log. Newest on top. Read this first, then `WIKI_CONTEXT.md`.

### 2026-09-19 — icon sync pipeline
- The 49 shipped icons are no longer hand-copied. `data/icon-sources.json` maps each icon name →
  its exact path inside the canonical `../_dd_extract/assets/` (provenance recovered by content-hash;
  49/49 matched, off the fresh full asset extract — see `_dd_extract/ASSET_MAP.md`).
- `tools/sync-icons.mjs` (re)builds `assets/icons/` from the extract: copies only mapped icons,
  idempotent (size-checked). Cross-checks `build-data.mjs` — **errors** if the build references an
  icon with no map entry (would break `haveIcon`), **reports** mapped-but-unreferenced icons.
  Flags: `--prune` deletes on-disk orphans, `--strict` fails CI on drift.
- 12 mapped icons currently unreferenced (resistance/currency/misc reserved for the backlog stat
  visualizer) — kept on purpose. Adding an icon = one line in `icon-sources.json` + run sync.

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
### 2026-09-19 — session 1e (collapse Appendix into one overlay)
- The five appendix nav chips (Design Elements + Effects/Buff Stats/Rule Gates/Bridge) collapsed into
  a **single "📖 Appendix" button** that opens ONE overlay (`#overlay-root`) with an internal tab strip.
  Nav is now just **Wizard · Appendix** (+ soon). Search/dropdown/tile-detail all work inside the
  overlay; tile detail stacks above (z200 > z100); Escape peels detail → appendix. Wizard/carrier
  jump-links now open the appendix overlay to the target surface instead of switching a main view.
- Verified with a real **jsdom click-through** (15/15: open, tabs, search-filter, detail stacking,
  Escape layering, wizard jump-link). No data change (data.js byte-identical).

### 2026-09-19 — session 1d (reframe: guided Wizard front door)
- **New front door = a Wizard** over 4 questions: (1) What are you building? → pick one of the 14
  carriers · (2) What's forced by that start? · (3) What choices does it give? · (4) What's the hard
  limit? Q1 = a carrier-card picker; Q2–Q4 = a **stepped accordion** (numbered rail + Back/Next) with
  Forced (bronze) / Choices (cyan) / Hard-limit (red) cards; forced & choice items carry **jump-links
  into the Appendix** palette surfaces.
- **Appendix** = everything prior (Design Elements + Effects/Buff Stats/Rule Gates/Bridge), regrouped
  under an "Appendix" nav label; still fully searchable/navigable. Wizard is now the default view.
- **`data/wizard.enrich.json`** (merged onto carriers in build-data): forced/choices/limits per
  carrier, grounded in HERO_COOKBOOK + carriers.json + the extract refs. Build validates every
  wizard link resolves to a real view. Limits = engine "cannot"s (grounded). Soft caveats the author
  flagged: camping "no combat triggers" (inferred), town 64 DistrictBuff cap (reported not re-verified),
  afflictions trait_library schema (floor not full map), hero `.enter_effects` (boot-test) — all carried
  as in-text caveats, not hard claims.

### 2026-09-19 — session 1c (reorg: Design Elements front door)
- **New organizing principle — carriers over primitives.** Added a **Design Elements** surface as
  the author-first front door: the 14 content types you actually author, each shown with its
  **wiring** to the palette. The unifying model = 4 modes: **B** holds buffs directly · **E** carries
  effects (the only bridge to a buff for non-B carriers) · **T** fires effects on a trigger · **S**
  sets base stats. Possibility Space stays as the palette these link into.
- **`data/carriers.json`** (14, grounded across MONSTERS/QUIRKS/DEATHS_DOOR/CURIOS/MODDING_COOKBOOK/
  EFFECT_BUFF_BRIDGE): hero-combat-skill, hero-camping-skill, trinket, trinket-set-bonus, quirk,
  disease, deaths-door, afflictions-virtues, monster, curio, town-district-building, actor-dot,
  mode-stance, companion-summon. Each carries buff_direct/effect_direct/bridge_to_buff/triggers/
  rule_gating/stat_carrier/notes/examples/ref. Carrier cards → detail overlay (wiring table + trigger
  table + examples + **jump-links into the palette**).
- **User-model corrections (grounded):** hero skill = E-only (can't hold a buff, confirmed); trinket
  = B + **22** triggers (not just on-attack); quirk = B-only but **rule-gatable** (not "simple");
  monster = the most multi-modal (B+E+T×12+S). Saved to memory.
- Carrier icons pulled from the install (carrier_skill/quirk/trinket/monster/curio/town/camp/disease).
  Build clean, 326 KB. [[dd-design-companion-site]].

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
- **Icons = base-game (Red Hook) assets, and that's fine.** No permissibility concern here. (The
  mod's `LICENSING.md` "public build ships zero art" rule is specifically about not passing off other
  **mod authors'** donor art as ours — it does not apply to base-game icons in a personal fan tool.)

### 2026-09-19 — session 1 (scaffold)
- Read up on `dd-mods` (PROGRESS/INTENT/HERO_COOKBOOK) and `_dd_extract` (CONTEXT_MAP + component
  docs + balance CSVs + `trinket_value.py`). Confirmed the tool's intent differs from a build calc.
- Presented the plan; user chose live Pages + Possibility Space first.
- (in progress) extracting `data/*.json` from the reference docs; writing the shell + pipeline.
