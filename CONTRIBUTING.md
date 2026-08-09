# Contributing to Agile Toolbox

Bug reports from people who facilitate for a living are as valuable as code here. If something
gets in your way during a real ceremony, that is a bug worth filing even if you cannot name the
cause.

## The five constraints

These are not preferences. A PR that breaks one of them will be asked to change, however good
the feature is.

1. **No build step.** Plain HTML, CSS and JavaScript, loaded with classic `<script>` tags.
   Someone should be able to fork the repo, edit a file, and hit refresh.
2. **No dependencies.** Zero runtime dependencies, zero dev dependencies, no CDN links, no web
   fonts. If you need a chart, draw it on a canvas — there are three examples already.
3. **It must work from `file://`.** This rules out ES modules (`type="module"`), `fetch()` of
   local files, and anything else the browser blocks off the file system. Test by
   double-clicking the HTML file, not only through a local server.
4. **Never measure an individual.** No stored per-person timings, no per-person blocker counts,
   no leaderboards, no "who answered what". Live facilitation aids are fine; a record that could
   become a performance report is not. This is the constraint the project exists to protect.
5. **Everything exports.** Any tool that stores something must be able to hand it back as JSON,
   and preferably as Markdown a human can paste into a ticket.

## Adding a new tool

A tool is one folder and two files.

```
tools/<your-tool>/
├── index.html     markup + tool-specific <style> block
└── <your-tool>.js  behaviour, in one IIFE
```

### 1. Start from the skeleton

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your Tool · Agile Toolbox</title>
<meta name="description" content="One sentence, for search results and link previews.">
<link rel="icon" href="../../assets/icons/icon.svg" type="image/svg+xml">
<link rel="manifest" href="../../manifest.json">
<link rel="stylesheet" href="../../assets/css/app.css">
<style>
  /* Only what is specific to this tool. Reach for app.css first. */
</style>
</head>
<body data-title="Your Tool" data-root="../../">
  <main class="wrap">
    <!-- … -->
  </main>
  <div id="toasts"></div>
  <script src="../../assets/js/store.js"></script>
  <script src="../../assets/js/ui.js"></script>
  <script src="./your-tool.js"></script>
</body>
</html>
```

`data-title` and `data-root` drive the shared top bar. `UI.initChrome()` builds it.

### 2. Wrap your JavaScript in an IIFE

```js
(function () {
  "use strict";
  var NS = "your-tool";           // storage namespace

  function init() {
    UI.initChrome();              // top bar, theme, service worker
    // …
  }
  document.addEventListener("DOMContentLoaded", init);
})();
```

### 3. Register it

- Add a card to the tool grid in `index.html`.
- Add both new files to the `SHELL` array in `sw.js`, and **bump `CACHE`** — otherwise returning
  users keep serving the old app shell from cache.
- Add a shortcut entry to `manifest.json` if it is a top-level tool.
- Add a section to the README, in the same shape as the existing four.

## The shared layer

### `Store` — persistence

Everything lives in `localStorage` behind the `atbx:` prefix. Never call `localStorage` directly;
`Store` handles the JSON, the corrupt-value fallback, and the private-mode case where storage
throws (it falls back to memory so the tool still runs for one session).

```js
Store.read(NS, "key", fallback)   // parsed value, or fallback if absent/corrupt
Store.write(NS, "key", value)     // returns false if the browser refused (quota)
Store.remove(NS, "key")
Store.keys(NS)                    // key suffixes in this namespace
Store.exportAll()                 // whole-app backup object
Store.importAll(payload, "merge") // "merge" | "replace"
Store.usage()                     // rough byte count
Store.isPersistent                // false when storage is blocked
```

### `UI` — helpers

```js
UI.el(tag, props, children)       // props: class, text, html, dataset, style, on<event>
UI.qs(sel) / UI.qsa(sel) / UI.clear(node)
UI.uid(prefix)  UI.clamp(n,min,max)  UI.round(n,digits)
UI.isoDate(date)  UI.parseDate(iso)  UI.addDays(d,n)  UI.prettyDate(iso)  UI.mmss(sec)
UI.toast(msg, "ok"|"danger")  UI.confirmDanger(msg)
UI.download(name, text, mime)  UI.downloadJSON(name, obj)  UI.copy(text)  UI.pickJSON(cb)
UI.slug(str)  UI.shuffle(arr)  UI.debounce(fn, ms)  UI.autoGrow(textarea)
UI.initChrome()  UI.addBarButton(label, fn)  UI.guardUnload(fn)
```

Dates: use `UI.isoDate` and `UI.parseDate` rather than `new Date(string)`. They are local-time
by design — a sprint boundary that drifts a day because of UTC parsing is a real bug that has
bitten this codebase's ancestors.

### `app.css` — the design system

Use the tokens, never literal colours. Every colour is defined on bare `:root` and redefined for
both `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`, so the theme toggle
works in both directions.

```
--bg --surface --surface-2 --surface-3 --border --border-strong
--text --text-2 --text-3
--accent --accent-hover --accent-soft --accent-text
--ok --warn --danger --info  (each with a --*-soft companion)
--radius --radius-sm --radius-lg  --shadow-1..3  --sp-1..7
```

Components already available: `.card`, `.btn` (`--primary`, `--ghost`, `--danger`, `--sm`,
`--lg`, `--icon`), `.field`, `.label`, `.hint`, `.tag` (`--ok`, `--warn`, `--danger`, `--info`,
`--accent`), `.stat`, `table.data`, `.empty`, `.row`, `.stack`, `.grid`, `.section-title`,
`dialog`, plus the utilities at the bottom of the file.

If you find yourself adding a colour to a tool's `<style>` block, add a token instead.

## Drawing charts

Three canvas charts exist to copy from: a histogram and a survival curve in
`tools/capacity/capacity.js`, a radar and a line chart in `tools/health-radar/radar.js`.

The pattern that matters:

```js
function css(name, fallback) {
  var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
```

Read colours from the tokens so charts follow the theme, size the canvas by
`devicePixelRatio` so it is not blurry, and redraw on `resize`, on the
`prefers-color-scheme` media query change, and on the theme toggle.

## Testing a change

There is no test runner — which puts the burden on the checklist:

- [ ] Open the page by **double-clicking the file** (`file://`), not just via a server.
- [ ] Then check it again over `http://localhost` — the service worker and clipboard API only
      exist there.
- [ ] Both themes, plus system, using the toggle in the top bar.
- [ ] Narrow viewport (~360px) — no horizontal scroll on `body`.
- [ ] Keyboard only: reach every control, see the focus ring, operate every button.
- [ ] Reload the page — state comes back from `localStorage` as expected.
- [ ] Export, then re-import your export into a fresh browser profile.
- [ ] Console clean: no errors, no warnings you added.

## Commit and PR style

- One logical change per commit; imperative subject line (`retro: carry over unfinished actions`).
- In the PR description, say what a facilitator can now do that they could not before.
- Screenshots for anything visual, in both themes.
- Confirm the five constraints above still hold.

## Filing an issue

Useful bug reports include: which tool, what you did, what you expected, what happened, browser
and version, and whether you were on `file://` or a server. If the tool lost data, please say so
in the title — that class of bug jumps the queue.

For a feature request, lead with the facilitation problem rather than the proposed UI. "Our
retro actions never get done and nobody notices" produced the carry-over feature; "add a
checkbox" would not have.

## Code of conduct

Be decent. Assume the person on the other side is trying to make their team's week better. If
you would not say it in a retro you were facilitating, do not put it in a review comment.
