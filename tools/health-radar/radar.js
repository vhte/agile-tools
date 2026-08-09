/* ==========================================================================
   Team Health Radar — anonymous survey with no server behind it.

   The trick: a participant's answers are encoded into a short numeric code.
   They hand the code to the facilitator by any channel they like. The code
   contains the scores, a signature of the question set, and a checksum —
   and nothing else. No name, no free text, no timestamp, no device id.
   Results stay hidden until three codes are in, so a round of two cannot be
   read back to a person.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "radar";
  var VERSION = "1";
  var MIN_RESPONSES = 3;
  var SCALE_LABELS = [
    "Strongly disagree", "Disagree", "Neither", "Agree", "Strongly agree"
  ];

  var DEFAULT_DIMS = [
    { id: "safety", name: "Psychological safety", statement: "I can raise a problem, a doubt or a mistake here without it being held against me." },
    { id: "confidence", name: "Delivery confidence", statement: "I believe we will finish what we took on this sprint." },
    { id: "quality", name: "Technical quality", statement: "The state of our code and tests lets us change things safely." },
    { id: "collab", name: "Collaboration", statement: "We work as one team, not as individuals with separate tasks." },
    { id: "clarity", name: "Clarity of purpose", statement: "I understand why my current work matters to a user or to the business." },
    { id: "learning", name: "Learning", statement: "I am learning things here that make me better at my craft." },
    { id: "pace", name: "Sustainable pace", statement: "We could keep working at this pace indefinitely." },
    { id: "flow", name: "Flow", statement: "Work moves without long waits on approvals, handoffs or other teams." }
  ];

  var state = {
    dims: [],
    rounds: [],
    round: null,
    draft: {},     // dimId -> 1..5 (this participant, this browser)
    role: "answer",
    trendDim: "__overall__"
  };

  /* --- Persistence ------------------------------------------------------ */
  function load() {
    state.dims = Store.read(NS, "dims", null) || JSON.parse(JSON.stringify(DEFAULT_DIMS));
    state.rounds = Store.read(NS, "rounds", []);
    if (!state.rounds.length) {
      state.rounds = [newRound("Round 1")];
      saveRounds();
    }
    var active = Store.read(NS, "activeRound", null);
    state.round = state.rounds.filter(function (r) { return r.id === active; })[0] || state.rounds[state.rounds.length - 1];
    Store.write(NS, "activeRound", state.round.id);
    state.draft = Store.read(NS, "draft", {});
  }
  function saveDims() { Store.write(NS, "dims", state.dims); }
  function saveRounds() { Store.write(NS, "rounds", state.rounds); }
  function saveDraft() { Store.write(NS, "draft", state.draft); }

  function newRound(label) {
    return { id: UI.uid("round"), label: label || "Round", date: UI.isoDate(), size: null, responses: [] };
  }

  /* --- Codes ------------------------------------------------------------ */
  /** Stable 3-char signature of the current question set. */
  function signature() {
    var seed = state.dims.map(function (d) { return d.id + "|" + d.name; }).join("~");
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return (h % 46656).toString(36).toUpperCase().padStart(3, "0"); // 36^3
  }

  function checksum(digits) {
    var sum = 0;
    for (var i = 0; i < digits.length; i++) sum += (i + 1) * parseInt(digits[i], 10);
    return (sum % 36).toString(36).toUpperCase();
  }

  function encodeAnswers(answers) {
    var digits = state.dims.map(function (d) {
      return String(UI.clamp(parseInt(answers[d.id], 10) || 0, 1, 5));
    }).join("");
    var raw = "ATBX" + VERSION + signature() + digits + checksum(digits);
    return raw.replace(/(.{4})(?=.)/g, "$1-");
  }

  /**
   * Returns { ok: true, scores: [..] } or { ok: false, why: "…" }.
   * Deliberately chatty about *why* — a facilitator with 7 codes and one typo
   * needs to know which of the two problems they have.
   */
  function decodeCode(input) {
    var raw = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!raw) return { ok: false, why: "empty" };
    if (raw.indexOf("ATBX") !== 0) return { ok: false, why: "not a toolbox code" };
    var body = raw.slice(4);
    if (body.charAt(0) !== VERSION) return { ok: false, why: "different code version" };
    var sig = body.slice(1, 4);
    if (sig !== signature()) return { ok: false, why: "answered a different question set" };
    var rest = body.slice(4);
    if (rest.length !== state.dims.length + 1) return { ok: false, why: "wrong length for " + state.dims.length + " questions" };
    var digits = rest.slice(0, state.dims.length);
    if (!/^[1-5]+$/.test(digits)) return { ok: false, why: "scores out of range" };
    if (checksum(digits) !== rest.slice(-1)) return { ok: false, why: "checksum failed — probably a typo" };
    return { ok: true, scores: digits.split("").map(Number) };
  }

  /* --- Statistics ------------------------------------------------------- */
  function statsFor(round) {
    var responses = (round && round.responses) || [];
    return state.dims.map(function (d, i) {
      var values = responses.map(function (r) { return r[i]; }).filter(function (v) { return v >= 1 && v <= 5; });
      if (!values.length) return { dim: d, n: 0, mean: null, min: null, max: null, sd: null };
      var mean = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
      var variance = values.length > 1
        ? values.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (values.length - 1)
        : 0;
      return {
        dim: d,
        n: values.length,
        mean: mean,
        min: Math.min.apply(null, values),
        max: Math.max.apply(null, values),
        sd: Math.sqrt(variance)
      };
    });
  }

  function roundIndex(round) {
    return state.rounds.map(function (r) { return r.id; }).indexOf(round.id);
  }
  function previousRound() {
    var i = roundIndex(state.round);
    for (var k = i - 1; k >= 0; k--) {
      if (state.rounds[k].responses.length >= MIN_RESPONSES) return state.rounds[k];
    }
    return null;
  }
  function revealed(round) {
    return ((round && round.responses) || []).length >= MIN_RESPONSES;
  }

  /* --- Participant view ------------------------------------------------- */
  function renderQuestions() {
    var host = UI.clear(UI.qs("#questions"));
    state.dims.forEach(function (d) {
      var q = UI.el("div", { class: "q" });
      q.appendChild(UI.el("div", { class: "q__name", text: d.name }));
      q.appendChild(UI.el("div", { class: "q__statement", text: d.statement }));
      var scale = UI.el("div", { class: "scale", role: "radiogroup", "aria-label": d.name });
      for (var v = 1; v <= 5; v++) {
        (function (value) {
          var picked = state.draft[d.id] === value;
          var label = UI.el("label", { class: picked ? "is-picked" : "" });
          var radio = UI.el("input", {
            type: "radio", name: "q-" + d.id, value: value, checked: picked,
            class: "sr-only"
          });
          radio.addEventListener("change", function () {
            state.draft[d.id] = value;
            saveDraft();
            renderQuestions();
          });
          label.appendChild(radio);
          label.appendChild(UI.el("span", { class: "num", text: String(value) }));
          label.appendChild(UI.el("span", { text: SCALE_LABELS[value - 1] }));
          scale.appendChild(label);
        })(v);
      }
      q.appendChild(scale);
      host.appendChild(q);
    });
    var answered = state.dims.filter(function (d) { return state.draft[d.id]; }).length;
    UI.qs("#survey-progress").textContent = answered + " of " + state.dims.length;
    UI.qs("#survey-progress").className = "tag" + (answered === state.dims.length ? " tag--ok" : "");
  }

  function makeCode() {
    var missing = state.dims.filter(function (d) { return !state.draft[d.id]; });
    if (missing.length) {
      UI.toast("Still missing: " + missing.map(function (d) { return d.name; }).join(", "), "danger", 4500);
      return;
    }
    var code = encodeAnswers(state.draft);
    UI.qs("#code-out").textContent = code;
    UI.qs("#code-card").classList.remove("hidden");
    UI.qs("#code-card").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* --- Facilitator: rounds --------------------------------------------- */
  function renderRoundSelect() {
    var sel = UI.clear(UI.qs("#round-select"));
    state.rounds.forEach(function (r) {
      sel.appendChild(UI.el("option", {
        value: r.id, selected: r.id === state.round.id,
        text: r.label + " · " + r.responses.length + " resp."
      }));
    });
    UI.qs("#round-label").value = state.round.label;
    UI.qs("#round-date").value = state.round.date || "";
    UI.qs("#round-size").value = state.round.size || "";

    var n = state.round.responses.length;
    UI.qs("#radar-n").textContent = n + " response" + (n === 1 ? "" : "s");
    var note = UI.qs("#responses-note");
    if (!n) {
      note.textContent = "No responses yet. Send everyone this page, collect the codes, paste them above.";
    } else if (n < MIN_RESPONSES) {
      note.textContent = n + " in. Results unlock at " + MIN_RESPONSES +
        " — with fewer than that, a chart can be read back to a person.";
    } else {
      var pct = state.round.size ? Math.round((n / state.round.size) * 100) + "% of the team" : "team size not set";
      note.textContent = n + " responses · " + pct + ". Paste more at any time; duplicates are legitimate answers, not errors.";
    }
  }

  function addCodes() {
    var lines = UI.qs("#codes-in").value.split(/[\n,;]+/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) { UI.toast("Paste at least one code.", "danger"); return; }
    var added = 0;
    var problems = [];
    lines.forEach(function (line) {
      var res = decodeCode(line);
      if (res.ok) { state.round.responses.push(res.scores); added++; }
      else problems.push(line.slice(0, 14) + "… (" + res.why + ")");
    });
    saveRounds();
    UI.qs("#codes-in").value = problems.join("\n");
    renderFacilitator();
    if (added) UI.toast("Added " + added + " response" + (added === 1 ? "" : "s") + ".", "ok");
    if (problems.length) {
      UI.toast(problems.length + " code(s) rejected — left in the box with the reason.", "danger", 6000);
    }
  }

  /* --- Facilitator: radar ---------------------------------------------- */
  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function radarGeometry(w, h) {
    return {
      cx: w / 2,
      cy: h / 2 + 4,
      // Padding leaves room for two lines of axis label plus its value.
      r: Math.min(w, h) / 2 - Math.max(52, Math.min(80, w * 0.115))
    };
  }

  function pointAt(g, index, value) {
    var n = state.dims.length;
    var angle = -Math.PI / 2 + (index * 2 * Math.PI) / n;
    var radius = (UI.clamp(value, 0, 5) / 5) * g.r;
    return { x: g.cx + Math.cos(angle) * radius, y: g.cy + Math.sin(angle) * radius };
  }

  function tracePolygon(ctx, g, values, reverse) {
    var n = values.length;
    for (var k = 0; k < n; k++) {
      var i = reverse ? n - 1 - k : k;
      var p = pointAt(g, i, values[i]);
      if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }

  function drawRadar() {
    var canvas = UI.qs("#radar");
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(300, Math.round(rect.width || 560));
    var h = Math.round(w * 0.8);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* opaque background so the PNG export is readable anywhere */
    ctx.fillStyle = css("--surface", "#fff");
    ctx.fillRect(0, 0, w, h);

    var font = css("--font-sans", "sans-serif");
    if (!revealed(state.round)) {
      ctx.fillStyle = css("--text-3", "#888");
      ctx.font = "14px " + font;
      ctx.textAlign = "center";
      ctx.fillText("Hidden until " + MIN_RESPONSES + " people have answered", w / 2, h / 2 - 8);
      ctx.font = "12px " + font;
      ctx.fillText(state.round.responses.length + " so far", w / 2, h / 2 + 14);
      return;
    }

    var g = radarGeometry(w, h);
    var stats = statsFor(state.round);
    var n = state.dims.length;

    /* grid rings + value labels */
    for (var ring = 1; ring <= 5; ring++) {
      ctx.beginPath();
      tracePolygon(ctx, g, state.dims.map(function () { return ring; }), false);
      ctx.strokeStyle = css("--border", "#ddd");
      ctx.lineWidth = ring === 5 ? 1.4 : 1;
      ctx.stroke();
      ctx.fillStyle = css("--text-3", "#999");
      ctx.font = "10px " + font;
      ctx.textAlign = "right";
      ctx.fillText(String(ring), g.cx - 4, g.cy - (ring / 5) * g.r + 3);
    }

    /* spokes */
    for (var i = 0; i < n; i++) {
      var end = pointAt(g, i, 5);
      ctx.beginPath();
      ctx.moveTo(g.cx, g.cy);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = css("--border", "#ddd");
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    /* range band between min and max, as a ring via even-odd fill */
    ctx.beginPath();
    tracePolygon(ctx, g, stats.map(function (s) { return s.max; }), false);
    tracePolygon(ctx, g, stats.map(function (s) { return s.min; }), true);
    ctx.fillStyle = css("--accent", "#4f46e5");
    ctx.globalAlpha = 0.16;
    ctx.fill("evenodd");
    ctx.globalAlpha = 1;

    /* outline both edges of the band — the fill alone reads as one flat shape */
    ctx.strokeStyle = css("--accent", "#4f46e5");
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    [stats.map(function (s) { return s.min; }), stats.map(function (s) { return s.max; })].forEach(function (vals) {
      ctx.beginPath();
      tracePolygon(ctx, g, vals, false);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    /* previous round, for comparison */
    var prev = previousRound();
    if (prev) {
      var prevStats = statsFor(prev);
      ctx.beginPath();
      tracePolygon(ctx, g, prevStats.map(function (s) { return s.mean; }), false);
      ctx.strokeStyle = css("--text-3", "#999");
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* this round's mean */
    ctx.beginPath();
    tracePolygon(ctx, g, stats.map(function (s) { return s.mean; }), false);
    ctx.fillStyle = css("--accent", "#4f46e5");
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = css("--accent", "#4f46e5");
    ctx.lineWidth = 2.4;
    ctx.stroke();

    stats.forEach(function (s, idx) {
      var p = pointAt(g, idx, s.mean);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = css("--accent", "#4f46e5");
      ctx.fill();
    });

    /* axis labels, then the mean underneath the wrapped name */
    var LINE_H = 12;
    stats.forEach(function (s, idx) {
      var p = pointAt(g, idx, 5.5);
      var angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
      var cos = Math.cos(angle);
      var sin = Math.sin(angle);
      ctx.textAlign = Math.abs(cos) < 0.25 ? "center" : (cos > 0 ? "left" : "right");
      ctx.textBaseline = "middle";

      ctx.font = "600 11px " + font;
      ctx.fillStyle = css("--text-2", "#555");
      var lines = wrapLabel(ctx, s.dim.name, p.x, p.y, 100, LINE_H);

      // Put the value on the far side of the label from the chart: above for
      // axes pointing up, below for the rest. Otherwise the top axis writes its
      // number straight over the polygon.
      var top = p.y - ((lines - 1) * LINE_H) / 2;
      var valueY = sin < -0.35 ? top - LINE_H - 1 : top + (lines - 1) * LINE_H + LINE_H + 1;
      ctx.font = "700 12px " + font;
      ctx.fillStyle = scoreCanvasColor(s.mean);
      ctx.fillText(UI.round(s.mean, 1).toFixed(1), p.x, valueY);
    });
    ctx.textBaseline = "alphabetic";
  }

  /** Wrap an axis label onto as many lines as it needs; returns the line count. */
  function wrapLabel(ctx, text, x, y, maxWidth, lineHeight) {
    var words = String(text).split(" ");
    var lines = [];
    var line = "";
    words.forEach(function (word) {
      var candidate = line ? line + " " + word : word;
      if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word; }
      else line = candidate;
    });
    if (line) lines.push(line);
    var top = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach(function (l, i) { ctx.fillText(l, x, top + i * lineHeight); });
    return lines.length;
  }

  /** Canvas needs a resolved colour, not a var() reference. */
  function scoreCanvasColor(mean) {
    if (mean >= 4) return css("--ok", "#128a5b");
    if (mean >= 3) return css("--text", "#000");
    if (mean >= 2.5) return css("--warn", "#a86400");
    return css("--danger", "#c02a34");
  }

  /* --- Facilitator: trend ---------------------------------------------- */
  function renderTrendControls() {
    var sel = UI.clear(UI.qs("#trend-dim"));
    sel.appendChild(UI.el("option", { value: "__overall__", text: "Overall average", selected: state.trendDim === "__overall__" }));
    state.dims.forEach(function (d) {
      sel.appendChild(UI.el("option", { value: d.id, text: d.name, selected: state.trendDim === d.id }));
    });
  }

  function trendSeries() {
    return state.rounds.filter(function (r) { return revealed(r); }).map(function (r) {
      var stats = statsFor(r);
      var value;
      if (state.trendDim === "__overall__") {
        var means = stats.map(function (s) { return s.mean; }).filter(function (m) { return m !== null; });
        value = means.length ? means.reduce(function (a, b) { return a + b; }, 0) / means.length : null;
      } else {
        var hit = stats.filter(function (s) { return s.dim.id === state.trendDim; })[0];
        value = hit ? hit.mean : null;
      }
      return { label: r.label, date: r.date, value: value, n: r.responses.length };
    }).filter(function (p) { return p.value !== null; });
  }

  function drawTrend() {
    var canvas = UI.qs("#trend");
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(260, Math.round(rect.width || 400));
    var h = 200;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var font = css("--font-sans", "sans-serif");
    var series = trendSeries();
    if (series.length < 2) {
      ctx.fillStyle = css("--text-3", "#888");
      ctx.font = "13px " + font;
      ctx.textAlign = "center";
      ctx.fillText(series.length ? "One round in — a trend needs two." : "No revealed rounds yet.", w / 2, h / 2);
      return;
    }

    var pad = { l: 30, r: 14, t: 14, b: 26 };
    var plotW = w - pad.l - pad.r;
    var plotH = h - pad.t - pad.b;

    for (var v = 1; v <= 5; v++) {
      var y = pad.t + plotH - ((v - 1) / 4) * plotH;
      ctx.strokeStyle = css("--border", "#ddd");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + plotW, y);
      ctx.stroke();
      ctx.fillStyle = css("--text-3", "#888");
      ctx.font = "10px " + font;
      ctx.textAlign = "right";
      ctx.fillText(String(v), pad.l - 5, y + 3);
    }

    var step = series.length > 1 ? plotW / (series.length - 1) : 0;
    ctx.strokeStyle = css("--accent", "#4f46e5");
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    series.forEach(function (p, i) {
      var x = pad.l + i * step;
      var y = pad.t + plotH - ((p.value - 1) / 4) * plotH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    series.forEach(function (p, i) {
      var x = pad.l + i * step;
      var y = pad.t + plotH - ((p.value - 1) / 4) * plotH;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = css("--accent", "#4f46e5");
      ctx.fill();
      ctx.fillStyle = css("--text-3", "#888");
      ctx.font = "10px " + font;
      ctx.textAlign = "center";
      ctx.fillText(p.label.slice(0, 12), x, h - 8);
    });
  }

  function renderTrendTable() {
    var tbl = UI.clear(UI.qs("#trend-table"));
    var revealedRounds = state.rounds.filter(revealed);
    if (!revealedRounds.length) {
      tbl.appendChild(UI.el("tbody", {}, UI.el("tr", {}, UI.el("td", {
        class: "muted center", text: "Nothing revealed yet."
      }))));
      return;
    }
    var head = UI.el("tr", {}, [UI.el("th", { text: "Round" }), UI.el("th", { class: "num", text: "n" })]);
    state.dims.forEach(function (d) {
      head.appendChild(UI.el("th", { class: "num", text: d.name.split(" ")[0], title: d.name }));
    });
    head.appendChild(UI.el("th", { class: "num", text: "Avg" }));
    tbl.appendChild(UI.el("thead", {}, head));

    var body = UI.el("tbody");
    revealedRounds.forEach(function (r) {
      var stats = statsFor(r);
      var tr = UI.el("tr", {}, [
        UI.el("td", { text: r.label + (r.date ? " · " + r.date.slice(5) : "") }),
        UI.el("td", { class: "num", text: String(r.responses.length) })
      ]);
      var sum = 0, count = 0;
      stats.forEach(function (s) {
        sum += s.mean; count++;
        tr.appendChild(UI.el("td", {
          class: "num",
          text: UI.round(s.mean, 1).toFixed(1),
          style: "color:" + scoreColor(s.mean) + ";font-weight:650;",
          title: "min " + s.min + " · max " + s.max + " · sd " + UI.round(s.sd, 2)
        }));
      });
      tr.appendChild(UI.el("td", { class: "num", style: "font-weight:750;", text: UI.round(sum / count, 1).toFixed(1) }));
      body.appendChild(tr);
    });
    tbl.appendChild(body);
  }

  function scoreColor(mean) {
    if (mean >= 4) return "var(--ok)";
    if (mean >= 3) return "var(--text)";
    if (mean >= 2.5) return "var(--warn)";
    return "var(--danger)";
  }

  /* --- Facilitator: read-out ------------------------------------------- */
  function renderReadout() {
    var host = UI.clear(UI.qs("#readout"));
    if (!revealed(state.round)) {
      host.appendChild(UI.el("p", {
        class: "empty",
        text: "Waiting for " + (MIN_RESPONSES - state.round.responses.length) +
          " more response(s). This threshold is not a technical limit — it is what makes the answer safe to give."
      }));
      return;
    }

    var stats = statsFor(state.round);
    var prev = previousRound();
    var prevStats = prev ? statsFor(prev) : null;

    var overall = stats.reduce(function (a, s) { return a + s.mean; }, 0) / stats.length;
    host.appendChild(UI.el("div", { class: "stat" }, [
      UI.el("div", { class: "stat__label", text: "Overall" }),
      UI.el("div", { class: "stat__value", text: UI.round(overall, 2).toFixed(2), style: "color:" + scoreColor(overall) }),
      UI.el("div", {
        class: "stat__sub",
        text: state.round.responses.length + " responses" +
          (state.round.size ? " · " + Math.round((state.round.responses.length / state.round.size) * 100) + "% of the team" : "")
      })
    ]));

    var lowest = stats.slice().sort(function (a, b) { return a.mean - b.mean; }).slice(0, 2);
    host.appendChild(section("Look here first", lowest.map(function (s) {
      return s.dim.name + " — " + UI.round(s.mean, 1).toFixed(1);
    }), "The two lowest scores. Ask about them; do not explain them away."));

    var contested = stats.slice().sort(function (a, b) { return b.sd - a.sd; })
      .filter(function (s) { return s.sd >= 0.9; }).slice(0, 3);
    host.appendChild(section("Least agreement", contested.length
      ? contested.map(function (s) { return s.dim.name + " — spread " + s.min + "–" + s.max + " (sd " + UI.round(s.sd, 2) + ")"; })
      : ["Nothing strongly contested this round."],
      "People on the same team living different realities is usually the more interesting finding."));

    if (prevStats) {
      var moves = stats.map(function (s, i) {
        return { name: s.dim.name, delta: s.mean - prevStats[i].mean };
      }).filter(function (m) { return Math.abs(m.delta) >= 0.3; })
        .sort(function (a, b) { return Math.abs(b.delta) - Math.abs(a.delta); }).slice(0, 3);
      host.appendChild(section("Moved since " + prev.label, moves.length
        ? moves.map(function (m) { return (m.delta > 0 ? "▲ " : "▼ ") + m.name + " " + (m.delta > 0 ? "+" : "") + UI.round(m.delta, 1).toFixed(1); })
        : ["Nothing moved by more than 0.3."],
        "Movement matters more than the absolute number, which is anchored to how your team reads a 1–5 scale."));
    }
  }

  function section(title, lines, note) {
    var box = UI.el("div", {});
    box.appendChild(UI.el("div", { class: "label", text: title }));
    var ul = UI.el("ul", { style: "margin:4px 0 0;padding-left:18px;font-size:0.9rem;" });
    lines.forEach(function (l) { ul.appendChild(UI.el("li", { text: l })); });
    box.appendChild(ul);
    if (note) box.appendChild(UI.el("p", { class: "hint mt-2", text: note }));
    return box;
  }

  /* --- Dimensions editor ----------------------------------------------- */
  function renderDims() {
    var host = UI.clear(UI.qs("#dims"));
    state.dims.forEach(function (d, i) {
      var row = UI.el("div", { class: "dim-row" });
      var name = UI.el("input", {
        type: "text", value: d.name, placeholder: "Name",
        "aria-label": "Name of dimension " + (i + 1)
      });
      name.addEventListener("input", UI.debounce(function () { d.name = name.value; saveDims(); softRefresh(); }, 400));
      row.appendChild(name);

      var stmt = UI.el("input", {
        class: "stmt", type: "text", value: d.statement,
        placeholder: "Statement people react to",
        "aria-label": "Statement for " + (d.name || "dimension " + (i + 1))
      });
      stmt.addEventListener("input", UI.debounce(function () { d.statement = stmt.value; saveDims(); }, 400));
      row.appendChild(stmt);

      row.appendChild(UI.el("button", {
        class: "btn btn--ghost btn--sm", type: "button", text: "✕", title: "Remove dimension",
        onclick: function () {
          if (state.dims.length <= 3) { UI.toast("Three dimensions is the floor for a radar.", "danger"); return; }
          if (!UI.confirmDanger("Removing a dimension invalidates existing codes and drops that column from stored rounds. Continue?")) return;
          state.dims.splice(i, 1);
          state.rounds.forEach(function (r) {
            r.responses = r.responses.map(function (resp) {
              var copy = resp.slice();
              copy.splice(i, 1);
              return copy;
            });
          });
          saveDims(); saveRounds(); renderAll();
        }
      }));
      host.appendChild(row);
    });
  }

  /* --- Export ---------------------------------------------------------- */
  function toMarkdown() {
    var out = ["# Team health radar", ""];
    var revealedRounds = state.rounds.filter(revealed);
    out.push("_" + revealedRounds.length + " revealed round(s) · " + state.dims.length + " dimensions_", "");
    out.push("## Questions", "");
    state.dims.forEach(function (d) { out.push("- **" + d.name + "** — " + d.statement); });
    out.push("");

    if (!revealedRounds.length) {
      out.push("_No round has reached the " + MIN_RESPONSES + "-response threshold yet._");
    } else {
      out.push("## Scores", "");
      out.push("| Round | n | " + state.dims.map(function (d) { return d.name; }).join(" | ") + " | Avg |");
      out.push("|---|---:|" + state.dims.map(function () { return "---:"; }).join("|") + "|---:|");
      revealedRounds.forEach(function (r) {
        var stats = statsFor(r);
        var avg = stats.reduce(function (a, s) { return a + s.mean; }, 0) / stats.length;
        out.push("| " + r.label + " | " + r.responses.length + " | " +
          stats.map(function (s) { return UI.round(s.mean, 1).toFixed(1); }).join(" | ") +
          " | " + UI.round(avg, 2).toFixed(2) + " |");
      });
      out.push("");
      var stats = statsFor(state.round);
      if (revealed(state.round)) {
        out.push("## " + state.round.label + " — spread", "");
        out.push("| Dimension | Mean | Min | Max | SD |");
        out.push("|---|---:|---:|---:|---:|");
        stats.forEach(function (s) {
          out.push("| " + s.dim.name + " | " + UI.round(s.mean, 2).toFixed(2) + " | " + s.min + " | " + s.max +
            " | " + UI.round(s.sd, 2).toFixed(2) + " |");
        });
      }
    }
    out.push("", "---",
      "_Generated with Agile Toolbox — Team Health Radar. Individual responses are not stored; only the numbers, unlabelled._");
    return out.join("\n");
  }

  /* --- Views ------------------------------------------------------------ */
  function setRole(role) {
    state.role = role;
    UI.qsa("#role-tabs .role-tab").forEach(function (b) {
      b.setAttribute("aria-current", String(b.dataset.role === role));
    });
    UI.qs("#view-answer").classList.toggle("hidden", role !== "answer");
    UI.qs("#view-facilitate").classList.toggle("hidden", role !== "facilitate");
    Store.write(NS, "role", role);
    if (role === "facilitate") renderFacilitator();
    else renderQuestions();
  }

  function renderFacilitator() {
    renderRoundSelect();
    renderTrendControls();
    drawRadar();
    drawTrend();
    renderTrendTable();
    renderReadout();
    renderDims();
  }

  function softRefresh() {
    if (state.role === "answer") renderQuestions();
    else renderFacilitator();
  }

  function renderAll() {
    renderQuestions();
    if (state.role === "facilitate") renderFacilitator();
  }

  /* --- Init ------------------------------------------------------------- */
  function init() {
    UI.initChrome();
    load();
    renderQuestions();
    setRole(Store.read(NS, "role", "answer"));

    UI.qsa("#role-tabs .role-tab").forEach(function (b) {
      b.addEventListener("click", function () { setRole(b.dataset.role); });
    });

    UI.qs("#make-code").addEventListener("click", makeCode);
    UI.qs("#clear-answers").addEventListener("click", function () {
      state.draft = {};
      saveDraft();
      UI.qs("#code-card").classList.add("hidden");
      renderQuestions();
    });
    UI.qs("#copy-code").addEventListener("click", function () {
      UI.copy(UI.qs("#code-out").textContent);
    });
    UI.qs("#download-code").addEventListener("click", function () {
      UI.download("health-response.txt", UI.qs("#code-out").textContent + "\n");
    });

    UI.qs("#round-select").addEventListener("change", function (e) {
      state.round = state.rounds.filter(function (r) { return r.id === e.target.value; })[0] || state.rounds[0];
      Store.write(NS, "activeRound", state.round.id);
      renderFacilitator();
    });
    UI.qs("#new-round").addEventListener("click", function () {
      var label = prompt("Round label", "Round " + (state.rounds.length + 1));
      if (label === null) return;
      var r = newRound(label.trim() || "Round " + (state.rounds.length + 1));
      state.rounds.push(r);
      state.round = r;
      saveRounds();
      Store.write(NS, "activeRound", r.id);
      renderFacilitator();
    });
    UI.qs("#delete-round").addEventListener("click", function () {
      if (state.rounds.length === 1) { UI.toast("Keep at least one round.", "danger"); return; }
      if (!UI.confirmDanger("Delete “" + state.round.label + "” and its responses?")) return;
      state.rounds = state.rounds.filter(function (r) { return r.id !== state.round.id; });
      state.round = state.rounds[state.rounds.length - 1];
      saveRounds();
      Store.write(NS, "activeRound", state.round.id);
      renderFacilitator();
    });
    UI.qs("#round-label").addEventListener("input", UI.debounce(function (e) {
      state.round.label = e.target.value; saveRounds(); renderRoundSelect();
    }, 300));
    UI.qs("#round-date").addEventListener("change", function (e) {
      state.round.date = e.target.value; saveRounds(); drawTrend(); renderTrendTable();
    });
    UI.qs("#round-size").addEventListener("change", function (e) {
      var n = parseInt(e.target.value, 10);
      state.round.size = isFinite(n) && n > 0 ? n : null;
      saveRounds(); renderRoundSelect(); renderReadout();
    });

    UI.qs("#add-codes").addEventListener("click", addCodes);
    UI.qs("#clear-responses").addEventListener("click", function () {
      if (!UI.confirmDanger("Remove every response from “" + state.round.label + "”?")) return;
      state.round.responses = [];
      saveRounds();
      renderFacilitator();
    });

    UI.qs("#trend-dim").addEventListener("change", function (e) {
      state.trendDim = e.target.value;
      drawTrend();
    });

    UI.qs("#add-dim").addEventListener("click", function () {
      state.dims.push({ id: UI.uid("d"), name: "New dimension", statement: "Statement people react to." });
      saveDims();
      state.rounds.forEach(function (r) {
        r.responses = r.responses.map(function (resp) { return resp.concat([3]); });
      });
      saveRounds();
      renderAll();
      UI.toast("Added. Existing rounds were back-filled with a neutral 3 — replace them if you can.", "danger", 6000);
    });
    UI.qs("#reset-dims").addEventListener("click", function () {
      if (!UI.confirmDanger("Reset to the default eight dimensions? Stored rounds keep their numbers but may no longer line up.")) return;
      state.dims = JSON.parse(JSON.stringify(DEFAULT_DIMS));
      saveDims();
      renderAll();
    });

    UI.qs("#download-png").addEventListener("click", function () {
      var canvas = UI.qs("#radar");
      if (!canvas.toBlob) { UI.toast("This browser cannot export the canvas.", "danger"); return; }
      canvas.toBlob(function (blob) {
        var url = URL.createObjectURL(blob);
        var a = UI.el("a", { href: url, download: UI.slug(state.round.label) + "-radar.png" });
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      });
    });

    UI.qs("#export-json").addEventListener("click", function () {
      UI.downloadJSON("team-health-radar.json", {
        app: "agile-toolbox", tool: "health-radar", schema: Store.schema,
        dims: state.dims, rounds: state.rounds
      });
    });
    UI.qs("#import-json").addEventListener("click", function () {
      UI.pickJSON(function (payload) {
        if (!payload || !Array.isArray(payload.rounds) || !Array.isArray(payload.dims)) {
          UI.toast("That file is not a radar export.", "danger");
          return;
        }
        state.dims = payload.dims;
        state.rounds = payload.rounds;
        state.round = state.rounds[state.rounds.length - 1] || newRound("Round 1");
        if (!state.rounds.length) state.rounds = [state.round];
        saveDims(); saveRounds();
        Store.write(NS, "activeRound", state.round.id);
        renderAll();
        UI.toast("Imported " + state.rounds.length + " round(s).", "ok");
      });
    });
    UI.qs("#export-md").addEventListener("click", function () {
      UI.download("team-health-radar.md", toMarkdown(), "text/markdown");
    });

    var redraw = UI.debounce(function () {
      if (state.role !== "facilitate") return;
      drawRadar();
      drawTrend();
    }, 150);
    window.addEventListener("resize", redraw);
    if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
    UI.qs("#theme-toggle").addEventListener("click", function () { setTimeout(redraw, 30); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
