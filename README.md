# DD Design Companion

A design-companion + wiki for the **Darkest Dungeon 1 overhaul mod**. Not a build calculator — a
reference & visualization tool for *building the mod*:

- **Possibility Space** — browse every way to apply a skill **effect** or a **buff**, and how to
  bridge the two (the 55 conditional `rule_type` gates, the 93 buff `stat_type`s, the 22 trinket
  triggers).
- **Hero Designs** *(P1)* — our authored heroes as structured cards, each skill linking into the
  catalog above.
- **Balance Scales** *(P1)* — the stat point-buy vectors and the trinket buff-weight ladder, made
  interactive.

## Run locally
```
node build-data.mjs        # compile data/*.json -> data.js (with hygiene checks)
node tools/serve.mjs       # preview at http://localhost:8080 (+ LAN for phone testing)
```
Stop the server (Ctrl+C) when done.

## Layout
- `index.html` / `styles.css` / `app.js` — the vanilla SPA (`window.DDC_DATA`).
- `build-data.mjs` — compiles `data/*.json` into `data.js`; runs data-hygiene guardrails and refuses
  to ship a broken reference.
- `data/*.json` — the authored/compiled design data (see `WIKI_CONTEXT.md` for sources).
- `SPEC_PLAN.md` · `WIKI_CONTEXT.md` · `Progress.md` — planning & resume docs.

Data is compiled from the sibling `../dd-mods` (mod project) and `../_dd_extract` (datamine wiki);
those workspaces are never committed here.
