/* ==========================================================================
   Sprint Capacity Planner — availability maths plus a Monte Carlo forecast.

   The honest bit: capacity is arithmetic, throughput is a distribution.
   This tool keeps the two separate and refuses to collapse the forecast into
   one number, because that number is what teams get held to.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "capacity";
  var RUNS = 10000;
  var NEUTRAL_FOCUS = 80; // at 80 the forecast is pure history, no adjustment
  var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var state = {
    plans: [],
    plan: null,
    samples: []   // last simulation, sorted ascending
  };

  /* --- Model ------------------------------------------------------------ */
  function makePlan(name) {
    return {
      id: UI.uid("plan"),
      name: name || "Sprint 1",
      start: UI.isoDate(),
      days: 14,
      unit: "points",
      workdays: [1, 2, 3, 4, 5],
      holidays: [],
      people: [
        { id: UI.uid("p"), name: "Ana", alloc: 100, pto: 0, other: 10 },
        { id: UI.uid("p"), name: "Bruno", alloc: 100, pto: 2, other: 10 },
        { id: UI.uid("p"), name: "Chen", alloc: 50, pto: 0, other: 0 }
      ],
      history: [],
      focus: NEUTRAL_FOCUS,
      method: "bootstrap"
    };
  }

  function load() {
    state.plans = Store.read(NS, "plans", []);
    if (!state.plans.length) {
      var p = makePlan("Sprint 1");
      p.history = [
        { id: UI.uid("h"), label: "Sprint -3", delivered: 28, personDays: 42 },
        { id: UI.uid("h"), label: "Sprint -2", delivered: 34, personDays: 45 },
        { id: UI.uid("h"), label: "Sprint -1", delivered: 22, personDays: 36 }
      ];
      state.plans = [p];
      save();
    }
    var active = Store.read(NS, "active", null);
    state.plan = state.plans.filter(function (p) { return p.id === active; })[0] || state.plans[0];
    normalize(state.plan);
    Store.write(NS, "active", state.plan.id);
  }

  function normalize(p) {
    p.workdays = Array.isArray(p.workdays) && p.workdays.length ? p.workdays : [1, 2, 3, 4, 5];
    p.holidays = Array.isArray(p.holidays) ? p.holidays : [];
    p.people = Array.isArray(p.people) ? p.people : [];
    p.history = Array.isArray(p.history) ? p.history : [];
    p.days = num(p.days, 14);
    p.focus = num(p.focus, NEUTRAL_FOCUS);
    p.unit = p.unit === "items" ? "items" : "points";
    p.method = p.method === "lognormal" ? "lognormal" : "bootstrap";
    p.people.forEach(function (m) {
      m.alloc = clampNum(m.alloc, 0, 100, 100);
      m.pto = Math.max(0, num(m.pto, 0));
      m.other = clampNum(m.other, 0, 100, 0);
    });
    return p;
  }

  function num(v, fallback) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : fallback;
  }
  function clampNum(v, min, max, fallback) {
    return UI.clamp(num(v, fallback), min, max);
  }

  function save() { Store.write(NS, "plans", state.plans); }

  /* --- Capacity arithmetic --------------------------------------------- */
  function workingDays() {
    var p = state.plan;
    var start = UI.parseDate(p.start);
    if (!start) return 0;
    var holidays = {};
    p.holidays.forEach(function (h) { holidays[h.date] = true; });
    var count = 0;
    for (var i = 0; i < p.days; i++) {
      var d = UI.addDays(start, i);
      if (p.workdays.indexOf(d.getDay()) === -1) continue;
      if (holidays[UI.isoDate(d)]) continue;
      count++;
    }
    return count;
  }

  /** Holidays entered that don't actually land on a working day of this sprint. */
  function strayHolidays() {
    var p = state.plan;
    var start = UI.parseDate(p.start);
    if (!start) return p.holidays.slice();
    var inSprint = {};
    for (var i = 0; i < p.days; i++) {
      var d = UI.addDays(start, i);
      if (p.workdays.indexOf(d.getDay()) !== -1) inSprint[UI.isoDate(d)] = true;
    }
    return p.holidays.filter(function (h) { return !inSprint[h.date]; });
  }

  function personDays(member, wd) {
    var gross = wd * (member.alloc / 100) - member.pto;
    return Math.max(0, gross) * (1 - member.other / 100);
  }

  function capacity() {
    var wd = workingDays();
    var people = state.plan.people.filter(function (m) { return (m.name || "").trim() || m.alloc; });
    var available = people.reduce(function (s, m) { return s + personDays(m, wd); }, 0);
    var gross = wd * people.length;
    var adjust = state.plan.focus / NEUTRAL_FOCUS;
    return {
      workingDays: wd,
      headcount: people.length,
      fte: people.reduce(function (s, m) { return s + m.alloc / 100; }, 0),
      gross: gross,
      available: available,
      effective: available * adjust,
      adjust: adjust,
      lostToTimeOff: people.reduce(function (s, m) { return s + Math.min(m.pto, wd * (m.alloc / 100)); }, 0),
      lostToOther: people.reduce(function (s, m) {
        var g = Math.max(0, wd * (m.alloc / 100) - m.pto);
        return s + g * (m.other / 100);
      }, 0)
    };
  }

  /* --- Monte Carlo ------------------------------------------------------ */
  function productivities() {
    return state.plan.history
      .filter(function (h) { return num(h.personDays, 0) > 0 && num(h.delivered, -1) >= 0; })
      .map(function (h) { return num(h.delivered, 0) / num(h.personDays, 1); });
  }

  /** Box–Muller, one standard normal per call. */
  function gauss() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function simulate() {
    var ps = productivities();
    var cap = capacity();
    if (ps.length < 2 || cap.available <= 0) { state.samples = []; return; }

    var out = new Array(RUNS);
    if (state.plan.method === "lognormal") {
      var positive = ps.filter(function (p) { return p > 0; });
      if (positive.length < 2) { state.samples = []; return; }
      var logs = positive.map(Math.log);
      var mu = logs.reduce(function (a, b) { return a + b; }, 0) / logs.length;
      var variance = logs.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / (logs.length - 1);
      var sigma = Math.sqrt(Math.max(variance, 1e-9));
      for (var i = 0; i < RUNS; i++) {
        out[i] = Math.exp(mu + sigma * gauss()) * cap.available * cap.adjust;
      }
    } else {
      for (var j = 0; j < RUNS; j++) {
        out[j] = ps[Math.floor(Math.random() * ps.length)] * cap.available * cap.adjust;
      }
    }
    out.sort(function (a, b) { return a - b; });
    state.samples = out;
  }

  function quantile(q) {
    var s = state.samples;
    if (!s.length) return null;
    var idx = UI.clamp(Math.floor(q * (s.length - 1)), 0, s.length - 1);
    return s[idx];
  }

  /** P(deliver at least x). */
  function confidenceOf(x) {
    var s = state.samples;
    if (!s.length) return null;
    // s is ascending; count how many are >= x via binary search for lower bound
    var lo = 0, hi = s.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (s[mid] < x) lo = mid + 1; else hi = mid;
    }
    return (s.length - lo) / s.length;
  }

  function unitLabel() { return state.plan.unit === "items" ? "items" : "points"; }

  /**
   * Commitment figures are floored, never rounded. Rounding 21.6 up to 22 would
   * quietly turn "85% confident" into something less, and the number on screen
   * is the one that ends up in the planning meeting.
   */
  function commit(value) { return Math.floor(value); }

  /* --- Render: sprint form --------------------------------------------- */
  function renderSprint() {
    var p = state.plan;
    UI.qs("#sprint-name").value = p.name;
    UI.qs("#sprint-start").value = p.start;
    UI.qs("#sprint-days").value = p.days;
    UI.qs("#unit").value = p.unit;
    UI.qs("#focus").value = p.focus;
    UI.qs("#focus-val").textContent = p.focus;
    UI.qs("#method").value = p.method;

    var wdHost = UI.qs("#weekdays");
    UI.clear(wdHost);
    for (var d = 0; d < 7; d++) {
      (function (day) {
        var label = UI.el("label");
        var cb = UI.el("input", { type: "checkbox", checked: p.workdays.indexOf(day) !== -1 });
        cb.addEventListener("change", function () {
          if (cb.checked) { if (p.workdays.indexOf(day) === -1) p.workdays.push(day); }
          else p.workdays = p.workdays.filter(function (x) { return x !== day; });
          p.workdays.sort();
          if (!p.workdays.length) { p.workdays = [day]; cb.checked = true; UI.toast("At least one working day is needed.", "danger"); }
          save();
          UI.defer(refresh);   // this checkbox is inside the container being rebuilt
        });
        label.appendChild(cb);
        label.appendChild(document.createTextNode(DAY_NAMES[day]));
        wdHost.appendChild(label);
      })(d);
    }

    var host = UI.qs("#holidays");
    UI.clear(host);
    var stray = {};
    strayHolidays().forEach(function (h) { stray[h.date] = true; });
    p.holidays.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (h) {
      var chip = UI.el("span", {
        class: "holiday-chip",
        title: stray[h.date] ? "Outside this sprint's working days — it changes nothing" : ""
      });
      chip.appendChild(UI.el("span", {
        text: UI.prettyDate(h.date) + (h.name ? " · " + h.name : "") + (stray[h.date] ? " ⚠" : "")
      }));
      chip.appendChild(UI.el("button", {
        type: "button", title: "Remove", text: "✕",
        onclick: function () {
          p.holidays = p.holidays.filter(function (x) { return x !== h; });
          save(); refresh();
        }
      }));
      host.appendChild(chip);
    });
    if (!p.holidays.length) host.appendChild(UI.el("span", { class: "hint", text: "None added." }));

    var start = UI.parseDate(p.start);
    var end = start ? UI.addDays(start, p.days - 1) : null;
    var wd = workingDays();
    UI.qs("#sprint-summary").textContent = start
      ? UI.prettyDate(UI.isoDate(start)) + " → " + UI.prettyDate(UI.isoDate(end)) +
        " · " + wd + " working day" + (wd === 1 ? "" : "s") + " per full-time person"
      : "Pick a start date.";
  }

  /* --- Render: people --------------------------------------------------- */
  function renderPeople() {
    var p = state.plan;
    var wd = workingDays();
    var tbl = UI.qs("#people");
    UI.clear(tbl);

    tbl.appendChild(UI.el("thead", {}, UI.el("tr", {}, [
      UI.el("th", { text: "Person" }),
      UI.el("th", { class: "num", text: "Allocation %" }),
      UI.el("th", { class: "num", text: "Days off" }),
      UI.el("th", { class: "num", text: "Other duties %" }),
      UI.el("th", { class: "num", text: "Person-days" }),
      UI.el("th", {})
    ])));

    var body = UI.el("tbody");
    p.people.forEach(function (m, i) {
      var tr = UI.el("tr");

      var who = (m.name || "").trim() || "person " + (i + 1);
      var name = UI.el("input", {
        type: "text", value: m.name, placeholder: "Name",
        "aria-label": "Name of " + who
      });
      name.addEventListener("input", UI.debounce(function () { m.name = name.value; save(); }, 300));
      tr.appendChild(UI.el("td", {}, name));

      // Generated cells need an explicit accessible name — a table header alone
      // leaves a screen reader announcing "spin button" with no idea which column.
      [
        { key: "alloc", min: 0, max: 100, step: "5", label: "Allocation percent" },
        { key: "pto", min: 0, max: 60, step: "0.5", label: "Days off" },
        { key: "other", min: 0, max: 100, step: "5", label: "Other duties percent" }
      ].forEach(function (spec) {
        var input = UI.el("input", {
          type: "number", min: spec.min, max: spec.max, step: spec.step, value: m[spec.key],
          "aria-label": spec.label + " for " + who
        });
        input.addEventListener("change", function () {
          m[spec.key] = UI.clamp(num(input.value, 0), spec.min, spec.max);
          input.value = m[spec.key];
          save();
          UI.defer(refresh);   // refresh rebuilds this row
        });
        tr.appendChild(UI.el("td", { class: "num" }, input));
      });

      var pd = personDays(m, wd);
      tr.appendChild(UI.el("td", {
        class: "num",
        text: UI.round(pd, 1).toFixed(1),
        title: wd + " working days × " + m.alloc + "% − " + m.pto + " off, then −" + m.other + "% other duties"
      }));

      tr.appendChild(UI.el("td", { class: "num" }, UI.el("button", {
        class: "btn btn--ghost btn--sm", type: "button", text: "✕", title: "Remove",
        onclick: function () { p.people.splice(i, 1); save(); refresh(); }
      })));
      body.appendChild(tr);
    });

    if (!p.people.length) {
      body.appendChild(UI.el("tr", {}, UI.el("td", { colspan: 6, class: "muted center", text: "Nobody added yet." })));
    } else {
      var cap = capacity();
      body.appendChild(UI.el("tr", { style: "font-weight:700;background:var(--surface-2);" }, [
        UI.el("td", { text: "Total" }),
        UI.el("td", { class: "num", text: UI.round(cap.fte * 100, 0) + "%" }),
        UI.el("td", { class: "num", text: UI.round(cap.lostToTimeOff, 1).toFixed(1) }),
        UI.el("td", { class: "num", text: "−" + UI.round(cap.lostToOther, 1).toFixed(1) + "d" }),
        UI.el("td", { class: "num", text: UI.round(cap.available, 1).toFixed(1) }),
        UI.el("td", {})
      ]));
    }
    tbl.appendChild(body);
  }

  /* --- Render: history -------------------------------------------------- */
  function renderHistory() {
    var p = state.plan;
    var tbl = UI.qs("#history");
    UI.clear(tbl);
    UI.qs("#history-count").textContent = p.history.length + " recorded";

    tbl.appendChild(UI.el("thead", {}, UI.el("tr", {}, [
      UI.el("th", { text: "Sprint" }),
      UI.el("th", { class: "num", text: "Delivered (" + unitLabel() + ")" }),
      UI.el("th", { class: "num", text: "Person-days available" }),
      UI.el("th", { class: "num", text: "Per person-day" }),
      UI.el("th", {})
    ])));

    var body = UI.el("tbody");
    p.history.forEach(function (h, i) {
      var tr = UI.el("tr");

      var which = (h.label || "").trim() || "row " + (i + 1);
      var label = UI.el("input", {
        type: "text", value: h.label || "", placeholder: "Sprint 41",
        "aria-label": "Label of past sprint " + which
      });
      label.addEventListener("input", UI.debounce(function () { h.label = label.value; save(); }, 300));
      tr.appendChild(UI.el("td", {}, label));

      [
        { key: "delivered", label: "Delivered " + unitLabel() + " in " + which },
        { key: "personDays", label: "Person-days available in " + which }
      ].forEach(function (spec) {
        var input = UI.el("input", {
          type: "number", min: 0, step: "1", value: h[spec.key], "aria-label": spec.label
        });
        input.addEventListener("change", function () {
          h[spec.key] = Math.max(0, num(input.value, 0));
          input.value = h[spec.key];
          save();
          UI.defer(refresh);   // refresh rebuilds this row
        });
        tr.appendChild(UI.el("td", { class: "num" }, input));
      });

      var rate = num(h.personDays, 0) > 0 ? num(h.delivered, 0) / num(h.personDays, 1) : null;
      tr.appendChild(UI.el("td", { class: "num", text: rate === null ? "—" : UI.round(rate, 2).toFixed(2) }));

      tr.appendChild(UI.el("td", { class: "num" }, UI.el("button", {
        class: "btn btn--ghost btn--sm", type: "button", text: "✕", title: "Remove",
        onclick: function () { p.history.splice(i, 1); save(); refresh(); }
      })));
      body.appendChild(tr);
    });

    if (!p.history.length) {
      body.appendChild(UI.el("tr", {}, UI.el("td", {
        colspan: 5, class: "muted center",
        text: "Add at least three past sprints to unlock the forecast."
      })));
    }
    tbl.appendChild(body);
  }

  /* --- Render: results -------------------------------------------------- */
  function renderCapacityStats() {
    var cap = capacity();
    var host = UI.qs("#capacity-stats");
    UI.clear(host);
    [
      { label: "Working days", value: String(cap.workingDays), sub: "per full-time person" },
      { label: "People", value: UI.round(cap.fte, 2) + " FTE", sub: cap.headcount + " on the roster" },
      { label: "Available", value: UI.round(cap.available, 1).toFixed(1), sub: "person-days in the sprint" },
      {
        label: "After focus factor", value: UI.round(cap.effective, 1).toFixed(1),
        sub: cap.adjust === 1 ? "neutral — history speaks" : (cap.adjust > 1 ? "+" : "") + UI.round((cap.adjust - 1) * 100, 0) + "% vs history"
      }
    ].forEach(function (s) {
      host.appendChild(UI.el("div", { class: "stat" }, [
        UI.el("div", { class: "stat__label", text: s.label }),
        UI.el("div", { class: "stat__value", text: s.value }),
        UI.el("div", { class: "stat__sub", text: s.sub })
      ]));
    });
  }

  function renderForecast() {
    var verdictHost = UI.clear(UI.qs("#forecast-verdict"));
    var barHost = UI.clear(UI.qs("#forecast-bars"));
    var ps = productivities();
    var cap = capacity();

    if (ps.length < 2 || cap.available <= 0) {
      verdictHost.appendChild(UI.el("div", {
        class: "verdict verdict--warn",
        text: cap.available <= 0
          ? "Nobody is available in this sprint, so there is nothing to forecast."
          : "Two or more past sprints with both a delivered figure and person-days are needed. Three or more makes the range trustworthy."
      }));
      clearCanvas(UI.qs("#hist-chart"));
      clearCanvas(UI.qs("#surv-chart"));
      UI.qs("#target-prob").textContent = "—";
      return;
    }

    var conservative = quantile(0.15);
    var likely = quantile(0.5);
    var stretch = quantile(0.70);
    var u = unitLabel();

    /* Verdict: compare with the average of recent history. */
    var pastAvg = state.plan.history
      .filter(function (h) { return num(h.delivered, -1) >= 0; })
      .reduce(function (s, h, _, arr) { return s + num(h.delivered, 0) / arr.length; }, 0);
    var delta = pastAvg > 0 ? (likely - pastAvg) / pastAvg : 0;
    var kind = Math.abs(delta) < 0.1 ? "ok" : (delta < 0 ? "warn" : "ok");
    var direction = delta < 0 ? "below" : "above";
    verdictHost.appendChild(UI.el("div", { class: "verdict verdict--" + kind, html:
      "Take <strong>" + commit(conservative) + "–" + commit(stretch) + " " + u + "</strong> into planning as the range, " +
      "with <strong>" + commit(likely) + "</strong> as the coin-flip midpoint. " +
      (pastAvg > 0
        ? "That midpoint sits " + Math.abs(UI.round(delta * 100, 0)) + "% " + direction +
          " your recent average of " + UI.round(pastAvg, 0) + " " + u + ", which is what this sprint's availability implies."
        : "")
    }));

    /* Bars */
    var scale = quantile(0.97) || 1;
    [
      { label: "85% confident", value: conservative, hue: 152, note: "commit to this" },
      { label: "50/50", value: likely, hue: 222, note: "expected" },
      { label: "30% confident", value: stretch, hue: 32, note: "stretch, needs luck" }
    ].forEach(function (row) {
      var bar = UI.el("div", { class: "fbar" });
      bar.appendChild(UI.el("div", { class: "fbar__label", html: row.label + '<br><span class="tiny">' + row.note + "</span>" }));
      bar.appendChild(UI.el("div", { class: "fbar__track" },
        UI.el("div", {
          class: "fbar__fill",
          style: "width:" + UI.clamp((row.value / scale) * 100, 2, 100) + "%;background:hsl(" + row.hue + " 62% 52%);"
        })));
      bar.appendChild(UI.el("div", { class: "fbar__val", text: commit(row.value) }));
      barHost.appendChild(bar);
    });

    /* Bootstrap over k sprints can only produce k distinct outcomes. When that
       makes two of the three figures identical, say why instead of letting it
       look like a bug. */
    if (state.plan.method === "bootstrap" && commit(conservative) === commit(stretch)) {
      barHost.appendChild(UI.el("p", {
        class: "hint",
        text: "These figures collapse because bootstrapping " + ps.length +
          " past sprint(s) can only produce " + ps.length + " distinct outcomes. Add more history, " +
          "or switch to the lognormal fit for a smooth range."
      }));
    }

    drawHistogram();
    drawSurvival();
    renderTargetProbability();
  }

  function renderTargetProbability() {
    var raw = UI.qs("#target").value;
    var out = UI.qs("#target-prob");
    var note = UI.qs("#target-note");
    if (raw === "" || !state.samples.length) {
      out.textContent = "—";
      note.textContent = state.samples.length ? "Type a number to check a commitment." : "Forecast unavailable.";
      return;
    }
    var target = num(raw, 0);
    var conf = confidenceOf(target);
    out.textContent = Math.round(conf * 100) + "%";
    note.textContent = conf >= 0.85
      ? "Comfortable. You could probably pull in more."
      : conf >= 0.6 ? "Reasonable, with slack for one surprise."
      : conf >= 0.4 ? "A coin flip. Say so out loud in planning."
      : "Unlikely on this capacity. Cut scope or change the capacity, not the estimate.";
  }

  /* --- Charts ----------------------------------------------------------- */
  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function setupCanvas(canvas) {
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(240, Math.round(rect.width));
    var h = Math.max(140, canvas.getAttribute("height") ? parseInt(canvas.getAttribute("height"), 10) : 220);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function clearCanvas(canvas) {
    var c = setupCanvas(canvas);
    c.ctx.fillStyle = css("--text-3", "#888");
    c.ctx.font = "13px " + css("--font-sans", "sans-serif");
    c.ctx.textAlign = "center";
    c.ctx.fillText("No forecast yet", c.w / 2, c.h / 2);
  }

  function drawHistogram() {
    var canvas = UI.qs("#hist-chart");
    var c = setupCanvas(canvas);
    var ctx = c.ctx;
    var s = state.samples;
    if (!s.length) return;

    var pad = { l: 34, r: 10, t: 12, b: 26 };
    var plotW = c.w - pad.l - pad.r;
    var plotH = c.h - pad.t - pad.b;
    var lo = s[0];
    var hi = s[s.length - 1];
    if (hi <= lo) hi = lo + 1;

    var bins = 26;
    var counts = new Array(bins).fill(0);
    s.forEach(function (v) {
      var b = UI.clamp(Math.floor(((v - lo) / (hi - lo)) * bins), 0, bins - 1);
      counts[b]++;
    });
    var maxCount = Math.max.apply(null, counts);

    /* axis */
    ctx.strokeStyle = css("--border", "#ddd");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + plotH);
    ctx.lineTo(pad.l + plotW, pad.t + plotH);
    ctx.stroke();

    /* bars */
    var bw = plotW / bins;
    counts.forEach(function (n, i) {
      var h = (n / maxCount) * plotH;
      ctx.fillStyle = css("--accent", "#4f46e5");
      ctx.globalAlpha = 0.75;
      ctx.fillRect(pad.l + i * bw + 0.5, pad.t + plotH - h, Math.max(1, bw - 1), h);
      ctx.globalAlpha = 1;
    });

    /* percentile markers */
    [
      { q: 0.15, color: css("--ok", "green"), label: "85%" },
      { q: 0.5, color: css("--text", "#000"), label: "50%" },
      { q: 0.7, color: css("--warn", "orange"), label: "30%" }
    ].forEach(function (m) {
      var v = quantile(m.q);
      var x = pad.l + ((v - lo) / (hi - lo)) * plotW;
      ctx.strokeStyle = m.color;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = m.color;
      ctx.font = "600 10px " + css("--font-sans", "sans-serif");
      ctx.textAlign = "center";
      ctx.fillText(m.label, UI.clamp(x, pad.l + 14, pad.l + plotW - 14), pad.t + 9);
    });

    /* x labels */
    ctx.fillStyle = css("--text-3", "#888");
    ctx.font = "11px " + css("--font-sans", "sans-serif");
    ctx.textAlign = "left";
    ctx.fillText(String(UI.round(lo, 0)), pad.l, c.h - 8);
    ctx.textAlign = "right";
    ctx.fillText(UI.round(hi, 0) + " " + unitLabel(), pad.l + plotW, c.h - 8);
    ctx.save();
    ctx.textAlign = "center";
    ctx.translate(11, pad.t + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("simulations", 0, 0);
    ctx.restore();
  }

  function drawSurvival() {
    var canvas = UI.qs("#surv-chart");
    var c = setupCanvas(canvas);
    var ctx = c.ctx;
    var s = state.samples;
    if (!s.length) return;

    var pad = { l: 40, r: 12, t: 12, b: 26 };
    var plotW = c.w - pad.l - pad.r;
    var plotH = c.h - pad.t - pad.b;
    var lo = s[0];
    var hi = s[s.length - 1];
    if (hi <= lo) hi = lo + 1;

    /* horizontal guides at 50 / 85 % */
    [0.5, 0.85].forEach(function (p) {
      var y = pad.t + (1 - p) * plotH;
      ctx.strokeStyle = css("--border", "#ddd");
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = css("--text-3", "#888");
      ctx.font = "10px " + css("--font-sans", "sans-serif");
      ctx.textAlign = "right";
      ctx.fillText(Math.round(p * 100) + "%", pad.l - 6, y + 3);
    });

    ctx.strokeStyle = css("--border", "#ddd");
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, pad.t + plotH);
    ctx.lineTo(pad.l + plotW, pad.t + plotH);
    ctx.stroke();

    /* survival curve: for each x, share of samples >= x */
    ctx.strokeStyle = css("--accent", "#4f46e5");
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    var steps = 120;
    for (var i = 0; i <= steps; i++) {
      var x = lo + ((hi - lo) * i) / steps;
      var conf = confidenceOf(x);
      var px = pad.l + (i / steps) * plotW;
      var py = pad.t + (1 - conf) * plotH;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    /* fill under the curve, lightly */
    ctx.lineTo(pad.l + plotW, pad.t + plotH);
    ctx.lineTo(pad.l, pad.t + plotH);
    ctx.closePath();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = css("--accent", "#4f46e5");
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = css("--text-3", "#888");
    ctx.font = "11px " + css("--font-sans", "sans-serif");
    ctx.textAlign = "left";
    ctx.fillText(String(UI.round(lo, 0)), pad.l, c.h - 8);
    ctx.textAlign = "right";
    ctx.fillText(UI.round(hi, 0) + " " + unitLabel() + " committed", pad.l + plotW, c.h - 8);
  }

  /* --- Export ----------------------------------------------------------- */
  function toMarkdown() {
    var p = state.plan;
    var cap = capacity();
    var u = unitLabel();
    var out = ["# Capacity plan — " + p.name, ""];
    var start = UI.parseDate(p.start);
    out.push("_" + UI.prettyDate(p.start) + " → " +
      (start ? UI.prettyDate(UI.isoDate(UI.addDays(start, p.days - 1))) : "?") +
      " · " + cap.workingDays + " working days · " + UI.round(cap.fte, 2) + " FTE_", "");

    out.push("## Availability", "");
    out.push("| Person | Allocation | Days off | Other duties | Person-days |");
    out.push("|---|---:|---:|---:|---:|");
    p.people.forEach(function (m) {
      out.push("| " + (m.name || "—") + " | " + m.alloc + "% | " + m.pto + " | " + m.other + "% | " +
        UI.round(personDays(m, cap.workingDays), 1).toFixed(1) + " |");
    });
    out.push("| **Total** | | " + UI.round(cap.lostToTimeOff, 1).toFixed(1) + " | −" +
      UI.round(cap.lostToOther, 1).toFixed(1) + "d | **" + UI.round(cap.available, 1).toFixed(1) + "** |", "");

    if (p.holidays.length) {
      out.push("Holidays: " + p.holidays.map(function (h) {
        return h.date + (h.name ? " (" + h.name + ")" : "");
      }).join(", "), "");
    }

    out.push("## Forecast", "");
    if (!state.samples.length) {
      out.push("_Not enough history to simulate._");
    } else {
      out.push("Method: " + (p.method === "lognormal" ? "lognormal fit" : "bootstrap") +
        " over " + productivities().length + " past sprints, " + RUNS.toLocaleString() + " runs. " +
        "Focus factor " + p.focus + "% (" + NEUTRAL_FOCUS + "% = neutral).", "");
      out.push("| Confidence of finishing | " + u + " |");
      out.push("|---|---:|");
      [[0.95, 0.05], [0.85, 0.15], [0.7, 0.3], [0.5, 0.5], [0.3, 0.7], [0.15, 0.85]].forEach(function (pair) {
        out.push("| " + Math.round(pair[0] * 100) + "% | " + commit(quantile(pair[1])) + " |");
      });
      out.push("", "**Recommended commitment: " + commit(quantile(0.15)) + "–" +
        commit(quantile(0.7)) + " " + u + "**, midpoint " + commit(quantile(0.5)) + ".");
    }

    out.push("", "## Past sprints", "");
    out.push("| Sprint | Delivered | Person-days | Per person-day |");
    out.push("|---|---:|---:|---:|");
    p.history.forEach(function (h) {
      var rate = num(h.personDays, 0) > 0 ? UI.round(num(h.delivered, 0) / num(h.personDays, 1), 2).toFixed(2) : "—";
      out.push("| " + (h.label || "—") + " | " + num(h.delivered, 0) + " | " + num(h.personDays, 0) + " | " + rate + " |");
    });

    out.push("", "---", "_Generated with Agile Toolbox — Sprint Capacity Planner. A forecast, not a commitment._");
    return out.join("\n");
  }

  /* --- Plans ------------------------------------------------------------ */
  function renderPlanSelect() {
    var sel = UI.qs("#plan-select");
    UI.clear(sel);
    state.plans.forEach(function (p) {
      sel.appendChild(UI.el("option", { value: p.id, selected: p.id === state.plan.id, text: p.name }));
    });
  }

  function switchPlan(id) {
    state.plan = normalize(state.plans.filter(function (p) { return p.id === id; })[0] || state.plans[0]);
    Store.write(NS, "active", state.plan.id);
    refresh();
  }

  /** Next sprint keeps the team and history, adds the sprint just finished. */
  function clonePlan() {
    var src = state.plan;
    var copy = JSON.parse(JSON.stringify(src));
    copy.id = UI.uid("plan");
    copy.name = bumpName(src.name);
    var start = UI.parseDate(src.start);
    copy.start = start ? UI.isoDate(UI.addDays(start, src.days)) : UI.isoDate();
    copy.holidays = [];
    copy.people.forEach(function (m) { m.pto = 0; });
    copy.history.push({
      id: UI.uid("h"),
      label: src.name,
      delivered: 0,
      personDays: UI.round(capacity().available, 1)
    });
    state.plans.push(copy);
    save();
    switchPlan(copy.id);
    UI.toast("Cloned. Fill in what “" + src.name + "” actually delivered in the history table.", "ok", 5000);
  }

  /** "Sprint 41" -> "Sprint 42"; anything without a number gets " (next)". */
  function bumpName(name) {
    var next = String(name).replace(/(\d+)(\D*)$/, function (_, n, tail) {
      return String(parseInt(n, 10) + 1) + tail;
    });
    return next === String(name) ? name + " (next)" : next;
  }

  /* --- Refresh cycle ---------------------------------------------------- */
  function refresh() {
    renderPlanSelect();
    renderSprint();
    renderPeople();
    renderHistory();
    renderCapacityStats();
    simulate();
    renderForecast();
  }

  function init() {
    UI.initChrome();
    load();
    refresh();

    UI.qs("#plan-select").addEventListener("change", function (e) { switchPlan(e.target.value); });
    UI.qs("#new-plan").addEventListener("click", function () {
      var name = prompt("Plan name", "Sprint " + (state.plans.length + 1));
      if (name === null) return;
      var p = makePlan(name.trim() || "New plan");
      state.plans.push(p);
      save();
      switchPlan(p.id);
    });
    UI.qs("#clone-plan").addEventListener("click", clonePlan);
    UI.qs("#delete-plan").addEventListener("click", function () {
      if (state.plans.length === 1) { UI.toast("Keep at least one plan.", "danger"); return; }
      if (!UI.confirmDanger("Delete plan “" + state.plan.name + "”?")) return;
      state.plans = state.plans.filter(function (p) { return p.id !== state.plan.id; });
      save();
      switchPlan(state.plans[0].id);
    });

    UI.qs("#sprint-name").addEventListener("input", UI.debounce(function (e) {
      state.plan.name = e.target.value; save(); renderPlanSelect();
    }, 300));
    UI.qs("#sprint-start").addEventListener("change", function (e) {
      state.plan.start = e.target.value; save(); refresh();
    });
    UI.qs("#sprint-days").addEventListener("change", function (e) {
      state.plan.days = UI.clamp(num(e.target.value, 14), 1, 90);
      e.target.value = state.plan.days;
      save(); refresh();
    });
    UI.qs("#unit").addEventListener("change", function (e) {
      state.plan.unit = e.target.value; save(); refresh();
    });
    UI.qs("#add-holiday").addEventListener("click", function () {
      var date = UI.qs("#holiday-date").value;
      if (!date) { UI.toast("Pick a date first.", "danger"); return; }
      if (state.plan.holidays.some(function (h) { return h.date === date; })) {
        UI.toast("That date is already on the list.", "danger");
        return;
      }
      state.plan.holidays.push({ date: date, name: UI.qs("#holiday-name").value.trim() });
      UI.qs("#holiday-name").value = "";
      save();
      refresh();
    });

    UI.qs("#add-person").addEventListener("click", function () {
      state.plan.people.push({ id: UI.uid("p"), name: "", alloc: 100, pto: 0, other: 10 });
      save();
      refresh();
      var inputs = UI.qsa("#people input[type=text]");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    UI.qs("#add-history").addEventListener("click", function () {
      state.plan.history.push({
        id: UI.uid("h"),
        label: "Sprint " + (state.plan.history.length + 1),
        delivered: 0,
        personDays: UI.round(capacity().available, 1) || 40
      });
      save();
      refresh();
    });

    UI.qs("#focus").addEventListener("input", function (e) {
      state.plan.focus = num(e.target.value, NEUTRAL_FOCUS);
      UI.qs("#focus-val").textContent = state.plan.focus;
      save();
      renderCapacityStats();
      simulate();
      renderForecast();
    });
    UI.qs("#method").addEventListener("change", function (e) {
      state.plan.method = e.target.value; save(); simulate(); renderForecast();
    });
    UI.qs("#rerun").addEventListener("click", function () { simulate(); renderForecast(); });
    UI.qs("#target").addEventListener("input", UI.debounce(renderTargetProbability, 200));

    UI.qs("#export-md").addEventListener("click", function () {
      UI.download(UI.slug(state.plan.name) + "-capacity.md", toMarkdown(), "text/markdown");
    });
    UI.qs("#export-json").addEventListener("click", function () {
      UI.downloadJSON(UI.slug(state.plan.name) + "-capacity.json", {
        app: "agile-toolbox", tool: "capacity", schema: Store.schema, plan: state.plan
      });
    });
    UI.qs("#import-json").addEventListener("click", function () {
      UI.pickJSON(function (payload) {
        var plan = payload && payload.plan ? payload.plan : payload;
        if (!plan || !Array.isArray(plan.people)) {
          UI.toast("That file is not a capacity plan.", "danger");
          return;
        }
        plan.id = UI.uid("plan");
        plan.name = (plan.name || "Imported plan") + " (imported)";
        state.plans.push(normalize(plan));
        save();
        switchPlan(plan.id);
        UI.toast("Plan imported.", "ok");
      });
    });

    var redraw = UI.debounce(function () {
      if (!state.samples.length) return;
      drawHistogram();
      drawSurvival();
    }, 150);
    window.addEventListener("resize", redraw);
    if (window.matchMedia) {
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
    }
    UI.qs("#theme-toggle").addEventListener("click", function () { setTimeout(redraw, 30); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
