# DD Design Companion — Spec & Plan

A single-page **design-companion + wiki** for the Darkest Dungeon 1 overhaul mod
(`../dd-mods`). **Not a DPS build calculator** — it is a reference & visualization tool for
*modding our own game*. Three jobs:

1. **Visualize our hero designs** — Crusader / Highwayman / Vestal (and every hero after them)
   rendered as structured cards, with each skill's effects/buffs linking into the catalog.
2. **Remember the possibility space** — browse *every* way to apply an effect or a buff, and how
   to bridge the two. The reusable wiki backbone.
3. **Reference the balance scales** — the stat point-buy vectors and the trinket buff-weight
   ladder, made interactive.

Secondary goal: if the mod ever ships publicly, this doubles as its **player/modder wiki**.

## Relationship to the skeleton
Scaffolded from `build-calc-planner`, but the intent is different, so we kept the transferable
bones and dropped the calculator-specific parts:
- **Kept:** build-first/overlay-driven browsing → *catalog-browser-first*; structured-data-not-prose;
  the colour-themed tag banners (repurposed from trait banners → category/domain/rarity tags); the
  stat-grid table; the cross-reference matrix; `build-data.mjs` **with hygiene guardrails**;
  mobile-first; localStorage; `tools/serve.mjs`; inert-until-release analytics.
- **Dropped:** DPS simulation, equip-a-loadout totals, "build slots." Replaced by reference surfaces.
- **Guardrails, repurposed:** the killer feature here. The pipeline cross-checks every hero-design
  reference (each skill's effects/buffs) against the possibility-space catalog and **fails the build
  on a dangling reference** — the same class of bug `tools/lint.ps1` catches in the mod itself.

## Architecture
Vanilla stack (no framework): `index.html` + `styles.css` + `app.js`, data in a generated
`data.js` exposing `window.DDC_DATA`. Build pipeline `build-data.mjs` compiles the authored JSON
sources in `data/` into `data.js`. Preview via `tools/serve.mjs`. Deploys to GitHub Pages.

- Global: `window.DDC_DATA`  ·  localStorage namespace: `ddc.*`  ·  acronym: `ddc`.
- **Catalog-browser-first**, not build-first: the home screen is a top-nav of surfaces; each surface
  is a searchable, category-tabbed **tile grid**; clicking a tile opens a **detail overlay**
  (`#detail-overlay-root`). The two-layer overlay system, event delegation, static overlay sizing,
  and scroll-preserving re-render from the skeleton are all retained.

## Data model (authored JSON in `data/`, compiled to `data.js`)
Generated from `../dd-mods/notes` + `../_dd_extract` (the datamine wiki). Sources are **not** shipped
in this repo — only the compiled `data/*.json` the app consumes (see `WIKI_CONTEXT.md`).

| File | Rows | Source | Feeds |
|---|---|---|---|
| `effects.json` | ~150 effect payloads, categorized | `_dd_extract/EFFECT_COMPONENTS.md` + `EFFECTS_REFERENCE.md` | Possibility Space → Effects |
| `buff_stats.json` | 93 buff `stat_types`, by domain | `BUFF_COMPONENTS.md` + `BUFFS_REFERENCE.md` | Possibility Space → Buffs |
| `buff_rules.json` | 55 `rule_type` conditional gates | `BUFF_COMPONENTS.md §3` + `trinket-rule-modifiers.csv` | Possibility Space → Gates |
| `bridge.json` | bridge model + 22 trinket triggers | `EFFECT_BUFF_BRIDGE.md` | Possibility Space → Bridge |
| `heroes.json` | authored hero designs | `notes/hero-design-*.md` + `stat_block.py` | Hero Designs |
| `stat_scale.json` | tier×rank stat table + role templates | `notes/stat_scale.csv` + `STAT_SCALING.md` | Balance → Stats |
| `trinket_ladder.json` | effect buff-weight ladder + rule modifiers | `notes/trinket-buff-weights.csv` + `trinket-rule-modifiers.csv` | Balance → Trinket Valuator |

Cross-reference invariant: `heroes[].skills[].effects[]` and `[].buffs[]` are **IDs** that must
resolve into `effects.json` / `buff_stats.json`. The guardrail enforces this.

## Feature phases
### P0 — runnable baseline (this session)
- App shell: top nav across the three surfaces; DD-gothic palette; mobile-first.
- **Possibility Space** surface, fully working: Effects · Buff Stats · Rule Gates · Bridge as
  category-tabbed, coloured, **searchable** tile grids → detail overlay per entry.
- `build-data.mjs` pipeline + hygiene guardrails (dangling-ref + schema checks), hygiene report.
- Deploy live to GitHub Pages.

### P1 — core value
- **Hero Designs** viewer: the 3 authored heroes as structured cards (stat table, 7 skills with
  base/r3/r5 escalation, crit passive, Death's Door set, quirks, trinkets); every referenced
  effect/buff is a **link into the Possibility Space catalog**.
- **Trinket Valuator**: faithful JS port of `tools/trinket_value.py` — pick effect × rarity × rule
  gate → value; compose a trinket → tally the rarity-step points.
- **Stat point-buy visualizer**: 6 combat + 8 resist tiers summing to 30 → computed base→max stat
  table (via `stat_scale.json`), with role-template presets.
- **Bridge** deep view: the 22-trigger firing table rendered as a reference.

### P2 — nice-to-have
- **Cross-reference matrix**: primitive × hero ("which heroes use this effect/buff"), and/or
  `stat_type` × `rule_type` (which gates are meaningful on which stats).
- **Compose & export**: author an effect or buff inline and copy the `.darkest` / `.json` snippet.
- Global search across all surfaces.
- More heroes as authored; a live "do my design's references resolve?" checker.

## Palette (DD gothic)
Charcoal/near-black grounds, bone/parchment text, torch-amber gold accent, blood-red for negatives
& conflict. Rarity colours match the game: uncommon (green), rare (yellow), very_rare (purple),
crimson_court (deep red), comet (cyan/white). Effect categories & buff domains each get a stable
identity colour, injected as `--aff-color`/`--aff-text` (contrast-derived) exactly like the skeleton's
trait banners.

## Non-goals
No combat simulation, no in-game math reproduction beyond the trinket valuator's deterministic
ladder, no loadout persistence-as-a-build. This is a reference tool, not a calculator.
