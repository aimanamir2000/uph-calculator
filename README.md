# UPH Calculator

A web version of the **UPH Calc** Excel workbook: a sequence-of-operation / timing-chart tool that turns a list of machine-cycle steps into **cycle time, PPM and UPH**, with a live Gantt chart.

Personal-use, single-user, no accounts. Runs as one Docker container; data is stored as plain JSON files on a Docker volume.

## Quick start

```bash
docker compose up -d --build
# open http://localhost:8080
```

Two sample projects (the Fiber Splicing sheets from the workbook) are created on first run.

Without Docker (Node 20+): `npm start` → http://localhost:8080 (data in `./data`, override with `DATA_DIR`).

## Using it

| Tab | What it does |
|---|---|
| **Projects** | Create, open, duplicate, delete. Changes autosave. |
| **Editor** | Project details, notes, step grid (per-step bar colour from a fixed palette), timing chart, then the summary. Choosing a Type locks the servo columns. |
| **Move types** | Editable lookup of typical move times (the old "Linked Move Types" table). |
| **Motion reference** | Searchable vendor timing tables (grippers, P&P, slides, cylinders, rotary...). Read-only. |
| **Servo calc** | Quick trapezoidal servo move-time calculator. |
| **How it works** | Full in-app guide to every column, formula and tab. |

The layout is responsive: on phones the top bar scrolls sideways, step rows become cards, and the timing chart resizes to fit.

The button at the far right of the top bar toggles light/dark mode (remembered per browser).

### How a step's duration is decided

1. **Override** (seconds), if filled in. Shown yellow.
2. Else, if **Accel > 0** (only possible when no Type is selected): servo trapezoid from Distance / Velocity / Accel / Settling.
   Short moves that never reach max velocity use the triangular profile `2·√(d/a)`.
3. Else the **Type** time from the Move types table.
4. A type with no time (e.g. *Manual*) and no override is flagged **red** and counts as 0 s.

### Scheduling

- A step with no dependencies starts when the **previous row** finishes.
- **After steps** takes step numbers (e.g. `3,5`): the step starts when the *latest* of those finishes, so parallel work is possible. Dependencies are stored by step ID, so reordering or deleting rows never breaks them. Circular dependencies are reported.
- **Cycle time** = latest finish. **Est. cycle time** = cycle × (1 + safety factor). **PPM** = #up × 60 / est. cycle. **UPH** = PPM × 60.

## Project layout

```
server.js            dependency-free Node server (static files + JSON API)
public/index.html    the whole UI (vanilla JS, no build step)
public/engine.js     pure calculation engine, shared by browser and tests
seed/                default move types, motion reference, sample projects
test/                golden tests against the Excel workbook's own results
tools/extract_seed.py  one-time workbook -> seed/ + test fixtures extractor
```

### API

`GET/PUT /api/library` · `GET /api/reference` · `GET /api/projects` · `GET/PUT/DELETE /api/projects/:id`

## Deploy to Cloudflare Workers (alternative to Docker)

`worker/index.js` is a Cloudflare Worker version of `server.js`: same API, data stored in a **D1** database, UI served from `public/` via Workers static assets. Docker keeps working as before.

**Deploy from GitHub (auto-deploys on every push)**

1. Push this repo to GitHub.
2. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** → pick the repo.
3. Set the Worker name to **`uph-calculator`** (must match `name` in `wrangler.jsonc`). Leave the build command empty and the deploy command as `npx wrangler deploy`. Save and Deploy.
4. The first deploy creates the D1 database automatically (Wrangler >= 4.45). If your build fails on that, run `npx wrangler d1 create uph-calculator` once, paste the returned `database_id` into `wrangler.jsonc`, and push.
5. Open the `*.workers.dev` URL. The tables and the sample projects are created on the first request.

**Lock it down (important).** A Worker URL is public, so anyone with the link could edit your data. Dashboard → your Worker → **Access** → *Protect this Worker behind Access* → allow only your email, with One-time PIN as the sign-in method. Check by opening the URL in a private window: you should hit a Cloudflare sign-in first.

**From the command line**

```bash
npm install
npx wrangler login
npx wrangler dev        # local preview with a local D1
npx wrangler deploy     # publish
```

**Backup:** `npx wrangler d1 export uph-calculator --remote --output backup.sql`

Notes: existing Docker data is not migrated automatically; the free plan is plenty for personal use; `npm test` also runs the Worker's SQL against a local SQLite.

## Tests

```bash
npm test
```

The engine is checked against the workbook's cached Excel values (start/finish of every step, cycle time, UPH) for all three project sheets, plus servo-profile and circular-dependency cases.

## Data and backups

Everything lives in the `uph-data` volume (`/data`: `library.json` and `projects/*.json`).

```bash
# backup
docker run --rm -v uph-data:/data -v "$PWD":/out alpine tar czf /out/uph-backup.tgz -C /data .
# restore
docker run --rm -v uph-data:/data -v "$PWD":/in alpine tar xzf /in/uph-backup.tgz -C /data
```

Seed data is only copied when `/data/library.json` doesn't exist, so rebuilding the image never overwrites your data.

## Not included / ideas

- `.xlsm` import UI (use `tools/extract_seed.py` as a starting point), XLSX/CSV export
- Critical-path highlighting, S-curve motion profiles, revision history
- "Use this time" button from Motion reference into a step
- The original's Excel macros (add/delete row, show/hide columns) are replaced by the row buttons; column hiding isn't implemented

## Notes on the port

- Matches Excel's maths exactly (trapezoid). Excel's quirks are fixed rather than copied: no 26-row limit, type lookup by ID instead of text concatenation, dependencies by stable ID.
- The hidden *Cell 10* sheet contained customer data and is used only as an anonymised test fixture, not as a sample project.
