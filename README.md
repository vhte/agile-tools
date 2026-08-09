<div align="center">

<img src="assets/icons/icon.svg" width="88" height="88" alt="">

# Agile Toolbox

**Facilitation tools that run entirely in your browser.**
No account, no backend, no data leaving the machine.

[![License: MIT](https://img.shields.io/badge/License-MIT-4f46e5.svg)](LICENSE)
![Dependencies: none](https://img.shields.io/badge/dependencies-none-128a5b.svg)
![Build step: none](https://img.shields.io/badge/build%20step-none-128a5b.svg)
![Works offline](https://img.shields.io/badge/works-offline-1f6feb.svg)

[The tools](#the-tools) · [Quick start](#quick-start) · [Privacy model](#the-privacy-model) · [Contributing](CONTRIBUTING.md)

</div>

---

Most tools a scrum master needs are either a paid SaaS seat, a spreadsheet someone hacked
together, or a Confluence table that went stale the week it was written.

This is four of them, done properly, as static HTML. Open `index.html` and they work — from a
file on disk, from GitHub Pages, from your intranet, from a USB stick in a meeting room with no
wifi. There is nothing to install, nothing to log into, and no server that could ever be asked
to hand over what your team said in a retro.

## The tools

### 🔁 Retro Board — [`tools/retro/`](tools/retro/)

Run the whole retrospective in one tab.

- **Four formats**: Start / Stop / Continue, 4 Ls, Sailboat, Mad / Sad / Glad.
- **Four phases** with facilitation notes built in — Collect, Reveal, Vote, Discuss.
- **Masked collection**: during Collect, everyone sees their own cards and `•••` for everyone
  else's. Silent writing stops being an honour system.
- **Dot voting** with a per-person budget, so the loudest voice does not set the agenda.
- **Grouping** duplicates into one card, votes added together, instead of debating wording.
- **Action items with carry-over** — one click pulls every unfinished action from the previous
  retro into this one. This is the feature that makes retros compound instead of repeat.
- Drag and drop between columns, a built-in timer, and export to Markdown or JSON.

### ⏱️ Standup Facilitator — [`tools/standup/`](tools/standup/)

- **Randomized speaking order** that never opens with the same person twice in a row.
- **Per-person timebox** with a countdown ring, optional auto-advance, and a total meeting budget
  shown before you start.
- **Blocker capture** during the meeting, categorised as you go, compiled into a digest you can
  paste straight into your channel.
- **Async mode** for distributed teams: copy the prompt, collect written updates, generate one
  digest instead of holding the meeting.
- **Blocker heatmap** by category across ISO weeks — which part of the system keeps generating
  friction, over months.

### 📐 Sprint Capacity Planner — [`tools/capacity/`](tools/capacity/)

The one most teams do badly in a spreadsheet.

- Working days from a real calendar: your working week, company holidays, per-person time off,
  part-time allocation, and the in-team duties (on-call, interrupt rota) that were never free.
- **10,000-run Monte Carlo** over *your own* throughput history — bootstrap resampling or a
  lognormal fit — scaled to the capacity you actually have this sprint.
- Output is a **range with confidence attached**, not a number: what you can promise at 85%
  confidence, the coin-flip midpoint, and the stretch nobody should commit to.
- Answers the question planning actually asks: *"what are the odds we finish 34 points?"*
- Clone a plan into the next sprint and it carries the team and the history forward.

> It deliberately refuses to print one number. One number becomes a promise, and the promise
> becomes the thing the team gets held to.

### 🩺 Team Health Radar — [`tools/health-radar/`](tools/health-radar/)

An anonymous survey that is anonymous **because there is no service in the middle**.

- Eight default dimensions — psychological safety, delivery confidence, technical quality,
  collaboration, clarity of purpose, learning, sustainable pace, flow — all editable.
- Each person answers on their own device and gets a short code like `ATBX-1A2B-4352-3415-7`.
  They send it to the facilitator however they like.
- **The code contains the scores, a signature of the question set, and a checksum. Nothing else.**
  No name, no free text, no timestamp, no device id. Two people who answer identically produce
  identical codes, which is exactly the property you want.
- Results **stay hidden until three people have answered**, so a small round cannot be read back
  to an individual.
- Radar chart with the range of answers shaded, the previous round overlaid, a trend across
  rounds, and a read-out that points at the lowest scores and the ones people most disagree on.

Disagreement is the interesting signal. Two people on the same team living in different
realities tells you more than any average.

### 📋 DoD / DoR template library — [`templates/dod-dor/`](templates/dod-dor/)

Forkable Markdown checklists for backend, frontend, platform, data and mobile teams, plus a
Definition of Ready. Copy one into your repo next to the code, delete every line the team will
not actually honour, and version-control it. A DoD in a wiki is a document nobody has opened
since onboarding.

## Quick start

**Option 1 — just open it.** Download the repo, double-click `index.html`. Everything works from
`file://`; there is no build step and no module loading to trip over.

```bash
git clone https://github.com/USER/agile-toolbox.git
cd agile-toolbox
xdg-open index.html      # macOS: open index.html   ·   Windows: start index.html
```

**Option 2 — serve it locally**, which additionally enables the offline cache and clipboard API:

```bash
python3 -m http.server 8080
# then visit http://localhost:8080
```

**Option 3 — GitHub Pages.** Settings → Pages → deploy from `main`, root folder. A workflow is
included at [`.github/workflows/pages.yml`](.github/workflows/pages.yml) if you prefer Actions.
Nothing needs configuring: no API keys, no environment variables, no secrets.

**Option 4 — install it as an app.** Served over HTTPS (or localhost), your browser will offer to
install it. It then opens in its own window and works with no network at all — built for the
conference room where the wifi is a rumour.

## The privacy model

This is the part worth understanding before you use it with a real team.

| Where your data lives | What that means |
|---|---|
| `localStorage`, under the `atbx:` prefix | It is per-browser and per-origin. A different browser or a different machine sees nothing. |
| Nowhere else | There are no network calls in this codebase — no analytics, no fonts, no CDN, no telemetry. Grep for `fetch(` and you will find one call, in the service worker, for the app's own files. |
| Until you export or erase it | The hub page has a **Back up everything** button (one JSON file, all tools) and an **Erase all local data** button. Clearing your browser's site data does the same. |

Two consequences to plan around:

- **Clearing site data deletes your boards.** Export anything you would be upset to lose.
- **Sharing means exporting.** There is no live multiplayer, because live multiplayer needs a
  server, and a server is the thing this design is avoiding. In practice one person facilitates
  and shares the screen, or people work in parallel and exchange JSON.

### Why no individual metrics — ever

This is a design constraint, not an oversight, and it applies to any tool added here:

- Standup turn timings are shown **live** so the facilitator can keep the meeting inside its box.
  They are **never written to history**.
- Blockers aggregate by **category**, not by who raised them.
- Capacity inputs (allocation, days off, other duties) describe *availability*, never productivity.
- The health radar cannot attribute a response to a person, even by the facilitator, even with the
  raw export.

The moment a facilitation tool can be turned into a performance report, people start managing
their answers instead of giving them. Everything above exists to keep that door closed.

## Design constraints

Read these before opening a PR — they explain most of the "why not just use React" questions.

1. **No build step.** Plain HTML, CSS and ES5-flavoured JavaScript with classic `<script>` tags.
   A scrum master should be able to fork this, change a string, and refresh. No `npm install`,
   no toolchain to rot in two years.
2. **No dependencies.** Zero. The charts are hand-drawn canvas, the layout is CSS grid, the
   radar maths is forty lines. Nothing to audit, nothing to update, no supply chain.
3. **Must work from `file://`.** That is why there are no ES modules — the browser's CORS rules
   block them off the file system, and "download the zip and open it" has to keep working.
4. **Theme-aware and accessible.** Light, dark and system, driven by CSS custom properties in one
   stylesheet. Keyboard-operable, labelled, AA contrast in both themes.
5. **Everything exports.** Markdown for humans and tickets, JSON for round-tripping. No lock-in
   to a tool that has no company behind it.

## Project layout

```
agile-toolbox/
├── index.html                  hub: tool launcher, backup/restore, storage stats
├── manifest.json  sw.js        PWA: installable, offline app shell
├── assets/
│   ├── css/app.css             the whole design system — tokens, components, light/dark
│   ├── js/store.js             localStorage wrapper, backup/restore, memory fallback
│   └── js/ui.js                shared helpers: chrome, theme, toasts, dates, exports
├── tools/
│   ├── retro/                  index.html + retro.js
│   ├── standup/                index.html + standup.js
│   ├── capacity/               index.html + capacity.js
│   └── health-radar/           index.html + radar.js
└── templates/dod-dor/          forkable Definition of Done / Ready checklists
```

Each tool is **one folder, two files**, sharing `app.css`, `store.js` and `ui.js`. That is the
whole architecture. Adding a fifth tool means copying the pattern — see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

Sized to be picked up by someone who has never touched the repo. Every one of these is a folder
and two files:

- **Cross-team dependency tracker** — log "team A needs team B to deliver X by date Y", draw the
  graph, flag it when a date slips. The Confluence table this replaces went stale in a week.
- **Interactive ceremony playbook** — facilitation scripts, timings, anti-patterns and a timer per
  ceremony. Most useful thing you can hand a new scrum master.
- **Refinement helper** — planning-poker-style estimation for a co-located or screen-shared team,
  with reference stories and a "why are we 3 points apart" prompt.
- **Working agreement builder** — a guided set of prompts that ends in a Markdown agreement the
  team actually wrote themselves.
- **Impediment escalation log** — ageing impediments, escalation paths, and the evidence you need
  to make the case upward.
- **i18n string tables** — the UI is English-only today; the strings are not extracted yet.

Ideas and bug reports are as welcome as code. If you facilitate for a living and something here
gets in your way, that is a bug worth filing.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: no build step, no dependencies, keep it
working from `file://`, and never add anything that reports on an individual.

## A note on what this is not

This is not a replacement for a tracker, and it does not integrate with one. It sits in the gap
between "we need to run this ceremony well" and "we need this recorded in Jira" — you facilitate
here, then paste the Markdown export wherever your work actually lives.

## License

[MIT](LICENSE). Use it at work, fork it for your company, strip out what you do not need. If it
saves your team an afternoon, that is the whole point.

<!--
Publishing your own copy: replace USER/agile-toolbox in the Quick start clone URL with your
repository path. Nothing else in this repo hard-codes a URL.
-->
