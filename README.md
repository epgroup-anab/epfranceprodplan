# Production Planner — France Paper Bag Manufacturing

Upload the week's order sheet, upload today's stock, press Generate Plan.
Everything runs in the browser: no backend, no database, no network calls.
Data is kept in `localStorage`, so it survives a refresh and never leaves the machine.

## Deploy to Netlify

**Drag and drop (fastest)**

```bash
npm install
npm run build
```

Then drag the resulting `dist/` folder onto https://app.netlify.com/drop.

**From Git (recommended — redeploys on every push)**

Push this folder to a repository and connect it in Netlify. `netlify.toml`
already sets everything:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version | 20 |

**From the CLI**

```bash
npm install
npm run build
npx netlify-cli deploy --prod --dir=dist
```

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

## How the planner works

**Priority is a number, 1–5.** 1 Critical, 2 High, 3 Standard, 4 Low, 5 Filler.
This replaced the old `NO COMPROMISE` / `VERY HIGH` text tags, which were hard to
sort and easy to mistype. Old sheets still import — the legacy tags are mapped
automatically.

**Ranking.** Priority number first. Within one priority, whichever SKU has the
fewest weeks of cover runs first, so an urgent line that is already well stocked
does not jump ahead of one about to run dry. Largest job breaks any remaining tie.

**Carrefour France (35627) is pinned to MC-1.** It gets first claim on MC-1's
capacity. Current demand is larger than MC-1 can produce, so the excess spills
onto its other listed machines and the plan says so in plain language rather than
dropping the bags.

**Every changeover costs one shift**, whatever changes. Work is sequenced by roll
width first, then print colours, so the plan makes as few changeovers as possible
and groups all 990mm work before moving to another width.

**Plan covers the whole order book.** The horizon widens until every bag on the
sheet is scheduled.

**Nothing disappears silently.** If a SKU has a spec conflict — more print colours
than any listed machine supports, or a handle type that does not match — it is
still scheduled and the conflict is reported under the grid. The `compatible_machines`
list in the SKU master is treated as the authoritative business rule.

## Input files

**John Poole Order Sheet** (`.xlsx` or `.csv`) — columns are matched by *name*, not
position, so extra columns and reordering are fine.

`SAP Code · Priority · Product Name · Roll Width (mm) · Bags Per Carton ·
Monthly Requirement (Cartons) · Current Stock (Cartons) · Week 1 … Week 9`

Weeks 1–9 are demand in **bags**. Current Stock is finished bags in **cartons**.

**QuickBase Materials Plant 9000** (`.csv`) — the standard export. The planner reads
`FStk` (free stock), not `Stk`, because `Stk` includes blocked and committed
quantities that cannot actually be consumed. The file is Windows-1252 encoded and
is decoded correctly on import.

## Layout

```
src/
  data/machines.js        8 machines — capacity, shifts, colours, handle type
  data/skus.js            53 SKUs — machine compatibility, roll width, colours
  lib/csv.js              CSV parsing, cp1252 decoding, header matching
  lib/parseOrders.js      John Poole sheet → orders
  lib/parseMaterials.js   QuickBase export → materials, classified
  lib/priority.js         the 1–5 priority scheme
  lib/storage.js          localStorage
  engine/capacity.js      shift and capacity rules, read from each machine
  engine/scheduler.js     ranking, machine allocation, sequencing, layout
  components/             the five tabs
```

## Changing the rules

- **Pin another SKU to a machine** — `PINNED_MACHINES` in `src/engine/scheduler.js`.
- **Make changeovers cost more** — `CHANGEOVER_SHIFTS` in the same file. Set it to 2
  and every changeover costs two shifts.
- **Charge width changes more than colour changes** — the sequencer already knows
  which is which (`width_change` on each changeover slot); give them different costs
  in `generatePlan`.
- **Machine capacity or shift pattern** — `src/data/machines.js`. The engine reads
  these values; nothing is hardcoded.
