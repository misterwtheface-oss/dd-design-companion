# DD Design Companion — Progress

Cross-session status log. Newest on top. Read this first, then `WIKI_CONTEXT.md`.

### 2026-09-20 — Combat-skill flow: real damage-budget enforcement + free r3/r5 rule
Wired the empirical skill-balance framework (`../dd-mods/notes/skill-balance-framework.md`, large-n) into
the Combat Skill flow, replacing the hand-picked ±10%/+50% bands with a **constraint-aware damage budget**:
- **Numbers step** now has **rider toggles** (stun −60 / debuff −85 / bleed −20 / blight −75 / push-pull −50)
  + a live **budget panel**: `expected .dmg = rank-lock premium − AoE penalty − any-rank reach creep −
  Σ rider taxes`, window ±15. Verdict flags over/under (over = "free damage the contract doesn't pay for —
  move it to a conditional premium, not the base"). Added a **ST · rank 1 only** shape so Point-Blank-style
  locks (+50) are authorable; `damageBudget()`/`budgetPanel()` + `RIDERS`/`SHAPES` tc/aoe metadata in
  `designer.js`.
- **Rank-3/5 = free spikes (user rule):** the overhaul makes the game much harder as it progresses, and
  *that rising difficulty is what pays for the r3/r5 extras* — so they are NOT charged to the base budget.
  Escalation step reframed accordingly ("don't discount base .dmg to afford them"); snippet + DoD updated
  (base-on-budget checkbox; r3/r5 flagged free/difficulty-financed).
- Verified: jsdom 12/12 (default +10, stun→−50, Point-Blank→+50, AoE→−80, reframed escalation, snippet/DoD).
  Self/ally skills correctly show "no damage budget". No data.js rebuild needed (designer.js is static).

### 2026-09-19 — Design Studio: the "design as you go" wizard (major reframe)
The old wizard was a 4-question **reader** (pick a carrier → read its forced/choices/limits). It is
replaced by a **Design Studio**: pick an element and walk **each concrete design choice** with the
mod's real balance scales **enforced live** (warn-but-allow), ending in an authorable snippet + a
Definition-of-Done. Front-door nav is now **Design Studio · 📖 Appendix** (the Appendix reference
layer is unchanged).
- **Four deep, number-enforced flows** (`designer.js`, `window.DDCDesigner`):
  - **Combat Skill** (9 steps): identity → type → targeting → numbers (dmg%/crit vs the WeaponDmg
    tier, live realized min–max) → move & flags → effects (palette picker) → buffs & rule gates →
    rank-3/5 escalation (**"no dead skill levels"** warn) → review. Enforces the static-across-levels
    rule, damage bands, one-payload-per-effect.
  - **Stat Block** (4): combat 6-tier + resist 8-tier **point-buy to 30** with a live budget bar,
    role presets, realized rank-4 stats, and an **exact** `resistances:`/`weapon:`×5/`armour:`×5 block.
  - **Trinket** (3): live **value = ladder × gate** + malus drawbacks; **point-buy vs rarity budget**
    (uncommon 2 … comet 6); gates trade uptime for magnitude, drawbacks buy headroom.
  - **Quirk** (4): signature +/- components (same ladder), rule gates (virtued/afflicted/DD),
    point target (+2 positive / 0 neutral negative), permanence flags, roster-seed snippet (P10b).
  - The other 11 carriers get a **guided reference** fallback (the old forced/choices/limits walk).
- **Balance data pipeline:** `tools/gen-balance.mjs` compiles the user-authored scales from
  `../dd-mods/notes/*.csv` (stat_scale, trinket-buff-weights, trinket-rule-modifiers) → tracked
  `data/balance/*.json` (same dev-time-reads-sibling-workspace pattern as `sync-icons.mjs`; raw CSVs
  stay out of the repo). `build-data.mjs` compiles them into `DDC_DATA.balance` with guardrails
  (10 tiers present, role vectors sum to the budget, ladder rows have a stat_type, rules have a
  modifier). `--strict` clean.
- **UI:** each flow = a horizontal stepper rail + a panel (prompt · controls · **live verdict list**
  · Appendix jump-links). Add-pickers (effects / buff stats / value ladder / rule gates) are a
  searchable overlay on a dedicated `#picker-root` (own listeners; own Escape). Review step renders
  a copy-able snippet + a DoD checklist that auto-checks from the build state. Mobile-first;
  side-by-side review ≥720px. State persists per-flow to `ddc.design`.
- **Verified:** jsdom click-through of all 4 flows (28/28 — home grid, step nav, pickers, live
  verdicts, point-buys, snippets), `node build-data.mjs --strict` clean. Old dead wizard code removed
  from `app.js`; `.wiz-*`/`.carrier-*` CSS retained (carriers still power the Appendix).
- **Next:** deepen the guided carriers into real flows (monster/curio/camping first); optional
  side-rail persistent spec preview; export multiple designs to a saved list.

**Follow-up (same day) — closed the 7 undefined rule multipliers.** The trinket value model had 7
`rule_type`s with no multiplier (target_in_rank, has_buff, negative_quirk_above,
quest_uses_remaining_above, target_is_burning, any_is_burning, is_target_corpse). Assigned all of them
via an explicit **uptime model** — `multiplier ≈ 1 / expected-uptime`, snapped to quarters against the
existing anchors (always=1 · ~½=2 · ~⅓=3 · rare=5), parameterized rules ramping +0.5/step. Written
**provisional** into `../dd-mods/notes/trinket-rule-modifiers.csv` (source of truth) with the model
recorded in `trinket-buff-weights.md` open-Q5 (now RESOLVED-provisional). `gen-balance.mjs` carries a
`provisional` flag; the Studio gate picker now lists all **70** rule modifiers (was 58), sorts locked
first, tags provisional ones **⚑ · provisional**, and every flow that uses a gate (Combat Skill buffs /
Trinket / Quirk) raises an **info verdict** noting the multiplier isn't locked yet. jsdom 5/5 on the
provisional path. Awaiting the user's lock/tune pass (esp. `has_buff` single-default vs per-buff tiers).

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
