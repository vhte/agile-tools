/* ==========================================================================
   Standup Facilitator — order, timeboxes, blockers, digest, trend.

   Design constraint worth keeping if you fork this: nothing here reports on
   an individual. Turn timings are shown live to help the facilitator keep the
   meeting inside its box, and are never stored per person in history.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "standup";

  var CATEGORIES = [
    "Dependency on another team",
    "Tooling / environment",
    "Process / approval",
    "External / vendor",
    "Unclear requirements",
    "Capacity / people",
    "Technical unknown"
  ];

  var CIRC = 2 * Math.PI * 58; // ring radius 58

  var state = {
    teams: [],
    team: null,
    mode: "live",
    session: null,   // live session in progress
    tick: null,
    sessions: []     // saved history (all teams)
  };

  /* --- Persistence ------------------------------------------------------ */
  function loadTeams() {
    state.teams = Store.read(NS, "teams", []);
    if (!state.teams.length) {
      state.teams = [makeTeam("My team", ["Ana", "Bruno", "Chen", "Dara", "Eli"])];
      Store.write(NS, "teams", state.teams);
    }
    var activeId = Store.read(NS, "activeTeam", null);
    state.team = state.teams.filter(function (t) { return t.id === activeId; })[0] || state.teams[0];
    Store.write(NS, "activeTeam", state.team.id);
  }
  function saveTeams() { Store.write(NS, "teams", state.teams); }
  function loadSessions() { state.sessions = Store.read(NS, "sessions", []); }
  function saveSessions() { Store.write(NS, "sessions", state.sessions.slice(-400)); }

  function makeTeam(name, memberNames) {
    return {
      id: UI.uid("team"),
      name: name,
      members: (memberNames || []).map(function (n) { return { id: UI.uid("m"), name: n }; }),
      timeboxSec: 90,
      autoAdvance: false,
      sound: true,
      lastFirst: null
    };
  }

  /* --- Live session ----------------------------------------------------- */
  function buildOrder() {
    var members = state.team.members.filter(function (m) { return m.name.trim(); });
    if (members.length < 2) return members.map(function (m) { return m.id; });
    var order = UI.shuffle(members).map(function (m) { return m.id; });
    // Don't let the same person open two days in a row.
    if (order[0] === state.team.lastFirst) {
      order.push(order.shift());
    }
    return order;
  }

  function newSession() {
    return {
      id: UI.uid("su"),
      teamId: state.team.id,
      date: UI.isoDate(),
      startedAt: new Date().toISOString(),
      order: buildOrder(),
      index: -1,          // -1 = not started
      running: false,
      remaining: state.team.timeboxSec,
      spent: {},          // memberId -> seconds used (live only, not persisted)
      blockers: [],
      totalSec: 0
    };
  }

  function currentMemberId() {
    var s = state.session;
    if (!s || s.index < 0 || s.index >= s.order.length) return null;
    return s.order[s.index];
  }

  function memberName(id) {
    var m = (state.team.members || []).filter(function (x) { return x.id === id; })[0];
    return m ? (m.name || "unnamed") : "(left the team)";
  }

  function startStandup() {
    state.session = newSession();
    if (!state.session.order.length) {
      UI.toast("Add at least one person to the roster.", "danger");
      state.session = null;
      return;
    }
    state.session.index = 0;
    state.session.remaining = state.team.timeboxSec;
    setRunning(true);
    renderLive();
  }

  function setRunning(run) {
    var s = state.session;
    if (!s) return;
    s.running = run;
    clearInterval(state.tick);
    if (!run) { renderLive(); return; }
    state.tick = setInterval(function () {
      var id = currentMemberId();
      s.remaining--;
      s.totalSec++;
      if (id) s.spent[id] = (s.spent[id] || 0) + 1;
      if (s.remaining === 0) {
        if (state.team.sound) beep();
        if (state.team.autoAdvance) { nextSpeaker(); return; }
      }
      paintRing();
      paintQueue();
    }, 1000);
    renderLive();
  }

  function nextSpeaker() {
    var s = state.session;
    if (!s) return;
    if (s.index + 1 >= s.order.length) { finishStandup(); return; }
    s.index++;
    s.remaining = state.team.timeboxSec;
    if (!s.running) setRunning(true);
    renderLive();
  }

  function finishStandup() {
    var s = state.session;
    if (!s) return;
    clearInterval(state.tick);
    s.running = false;
    state.team.lastFirst = s.order[0] || null;
    saveTeams();

    // Persisted record: aggregate only. No per-person timings leave this page.
    state.sessions.push({
      id: s.id,
      teamId: s.teamId,
      teamName: state.team.name,
      date: s.date,
      participants: s.order.length,
      totalSec: s.totalSec,
      blockers: s.blockers.map(function (b) {
        return { text: b.text, category: b.category, resolved: !!b.resolved };
      })
    });
    saveSessions();

    var digest = liveDigest();
    Store.write(NS, "lastDigest", digest);
    state.session.index = s.order.length; // parked past the end
    renderLive();
    UI.toast("Standup closed in " + UI.mmss(s.totalSec) + ". Digest is ready below.", "ok");
  }

  /* --- Render: live ----------------------------------------------------- */
  function paintRing() {
    var s = state.session;
    var box = state.team.timeboxSec;
    var remaining = s ? s.remaining : box;
    var ring = UI.qs("#ring");
    var fill = UI.qs("#ring-fill");
    var over = remaining < 0;
    var ratio = UI.clamp(Math.abs(remaining) / Math.max(1, box), 0, 1);

    fill.setAttribute("stroke-dasharray", CIRC.toFixed(1));
    fill.setAttribute("stroke-dashoffset", (CIRC * (1 - (over ? 1 : ratio))).toFixed(1));
    ring.classList.toggle("is-warn", !over && remaining <= Math.max(10, box * 0.2));
    ring.classList.toggle("is-over", over);

    UI.qs("#ring-time").textContent = (over ? "+" : "") + UI.mmss(Math.abs(remaining));
    UI.qs("#ring-sub").textContent = over ? "over" : (s && s.running ? "speaking" : "timebox");
  }

  function paintQueue() {
    var host = UI.qs("#queue");
    UI.clear(host);
    var s = state.session;
    var order = s ? s.order : state.team.members.map(function (m) { return m.id; });
    UI.qs("#queue-total").textContent = order.length + (s ? "" : " (preview)");

    order.forEach(function (id, i) {
      var cls = "";
      if (s && i === s.index) cls = " is-current";
      else if (s && i < s.index) cls = " is-done";
      var li = UI.el("li", { class: "queue__item" + cls });
      li.appendChild(UI.el("span", { class: "queue__pos", text: String(i + 1) }));
      li.appendChild(UI.el("span", { class: "flex-1", text: memberName(id) }));
      if (s && s.spent[id]) {
        var over = s.spent[id] > state.team.timeboxSec;
        li.appendChild(UI.el("span", {
          class: "queue__time" + (over ? " is-over" : ""), text: UI.mmss(s.spent[id])
        }));
      }
      host.appendChild(li);
    });
    if (!order.length) {
      host.appendChild(UI.el("li", { class: "muted tiny", text: "Roster is empty." }));
    }
  }

  function renderLive() {
    var s = state.session;
    var started = !!s && s.index >= 0 && s.index < s.order.length;
    var closed = !!s && s.index >= s.order.length;

    UI.qs("#speaker-name").textContent = started
      ? memberName(currentMemberId())
      : closed ? "Standup closed" : "Press “Start standup”";
    UI.qs("#speaker-position").textContent = started
      ? "Speaker " + (s.index + 1) + " of " + s.order.length
      : closed ? "Total " + UI.mmss(s.totalSec) : "Not started";
    UI.qs("#speaker-hint").textContent = started
      ? "Yesterday · Today · Anything in the way. Take discussion to the parking lot."
      : closed ? "Copy the digest, then close the tab. Blockers were saved to the trend."
      : "Randomized order, one timebox each. The facilitator talks last, if at all.";

    UI.qs("#btn-start").disabled = started;
    UI.qs("#btn-start").textContent = closed ? "Start a new one" : "Start standup";
    UI.qs("#btn-pause").disabled = !started;
    UI.qs("#btn-pause").textContent = s && s.running ? "Pause" : "Resume";
    UI.qs("#btn-next").disabled = !started;
    UI.qs("#btn-next").textContent = started && s.index + 1 >= s.order.length ? "Finish" : "Next →";
    UI.qs("#btn-finish").disabled = !started;

    var count = state.team.members.filter(function (m) { return m.name.trim(); }).length;
    UI.qs("#budget").textContent = count
      ? UI.mmss(count * state.team.timeboxSec) + " of speaking for " + count + " people"
      : "—";

    paintRing();
    paintQueue();
    renderBlockers();
    UI.qs("#digest").textContent = s ? liveDigest() : (Store.read(NS, "lastDigest", "") || "—");
  }

  /* --- Blockers --------------------------------------------------------- */
  function renderBlockers() {
    var host = UI.qs("#blockers");
    UI.clear(host);
    var list = state.session ? state.session.blockers : [];
    UI.qs("#blocker-count").textContent = String(list.length);
    if (!list.length) {
      host.appendChild(UI.el("p", { class: "empty", text: "Nothing raised yet. “No blockers” every day is itself a signal." }));
      return;
    }
    list.forEach(function (b, i) {
      var row = UI.el("div", { class: "blocker" });
      var text = UI.el("input", {
        type: "text", value: b.text, placeholder: "What is in the way?",
        "aria-label": "Description of blocker " + (i + 1)
      });
      text.addEventListener("input", UI.debounce(function () { b.text = text.value; refreshDigest(); }, 250));
      row.appendChild(text);

      var sel = UI.el("select", { "aria-label": "Category" });
      CATEGORIES.forEach(function (c) {
        sel.appendChild(UI.el("option", { value: c, text: c, selected: c === b.category }));
      });
      sel.addEventListener("change", function () { b.category = sel.value; refreshDigest(); });
      row.appendChild(sel);

      row.appendChild(UI.el("button", {
        class: "btn btn--ghost btn--sm", type: "button", text: "✕", title: "Remove",
        onclick: function () { state.session.blockers.splice(i, 1); renderBlockers(); refreshDigest(); }
      }));
      host.appendChild(row);
    });
  }

  function addBlocker() {
    if (!state.session) { UI.toast("Start the standup first.", "danger"); return; }
    state.session.blockers.push({
      id: UI.uid("blk"),
      text: "",
      category: CATEGORIES[0],
      raisedDuring: currentMemberId() || null,
      resolved: false
    });
    renderBlockers();
    var inputs = UI.qsa("#blockers input[type=text]");
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  function refreshDigest() {
    if (state.mode === "live") UI.qs("#digest").textContent = liveDigest();
  }

  /* --- Digests ---------------------------------------------------------- */
  function liveDigest() {
    var s = state.session;
    if (!s) return "—";
    var out = ["# Daily standup — " + state.team.name + " — " + s.date, ""];
    out.push("_" + s.order.length + " participants · " + UI.mmss(s.totalSec) + " elapsed · " +
      UI.mmss(state.team.timeboxSec) + " per person_", "");
    out.push("**Speaking order:** " + s.order.map(memberName).join(" → "), "");
    var real = s.blockers.filter(function (b) { return b.text.trim(); });
    out.push("## Blockers");
    if (!real.length) out.push("_None raised._");
    real.forEach(function (b) { out.push("- **[" + b.category + "]** " + b.text.trim()); });
    out.push("", "---", "_Generated with Agile Toolbox — Standup Facilitator._");
    return out.join("\n");
  }

  var ASYNC_PROMPT = [
    "Async standup — please reply in this thread before the cutoff:",
    "",
    "1. *Since my last update:* what moved?",
    "2. *Today:* what am I taking on?",
    "3. *In the way:* anything blocked, and what I need to unblock it.",
    "",
    "Keep it to three lines. If something needs a conversation, say so and we book it."
  ].join("\n");

  function renderAsync() {
    var host = UI.qs("#async-grid");
    UI.clear(host);
    var saved = Store.read(NS, "async:" + state.team.id + ":" + UI.isoDate(), {});
    var members = state.team.members.filter(function (m) { return m.name.trim(); });
    if (!members.length) {
      host.appendChild(UI.el("p", { class: "empty", text: "Add people to the roster first." }));
      return;
    }
    members.forEach(function (m) {
      var entry = saved[m.id] || { done: "", next: "", blocked: "" };
      var card = UI.el("div", { class: "async-card" });
      var head = UI.el("div", { class: "async-card__head" });
      head.appendChild(UI.el("strong", { text: m.name }));
      var badge = UI.el("span", { class: "tag", text: "no update" });
      head.appendChild(badge);
      card.appendChild(head);

      var body = UI.el("div", { class: "async-card__body" });
      ["done", "next", "blocked"].forEach(function (key) {
        var labels = { done: "Since last update", next: "Today", blocked: "In the way" };
        var field = UI.el("div", { class: "field" });
        field.appendChild(UI.el("label", { class: "label", text: labels[key] }));
        var ta = UI.el("textarea", {
          rows: 3, placeholder: "—",
          "aria-label": labels[key] + " — " + m.name
        });
        ta.value = entry[key] || "";
        ta.addEventListener("input", UI.debounce(function () {
          entry[key] = ta.value;
          saved[m.id] = entry;
          Store.write(NS, "async:" + state.team.id + ":" + UI.isoDate(), saved);
          var filled = (entry.done || entry.next || entry.blocked).trim();
          badge.textContent = filled ? "updated" : "no update";
          badge.className = "tag" + (filled ? " tag--ok" : "");
        }, 300));
        field.appendChild(ta);
        body.appendChild(field);
      });
      var any = ((entry.done || "") + (entry.next || "") + (entry.blocked || "")).trim();
      badge.textContent = any ? "updated" : "no update";
      badge.className = "tag" + (any ? " tag--ok" : "");
      card.appendChild(body);
      host.appendChild(card);
    });
  }

  function asyncDigest() {
    var saved = Store.read(NS, "async:" + state.team.id + ":" + UI.isoDate(), {});
    var members = state.team.members.filter(function (m) { return m.name.trim(); });
    var out = ["# Async standup — " + state.team.name + " — " + UI.isoDate(), ""];
    var missing = [];
    var blocked = [];

    members.forEach(function (m) {
      var e = saved[m.id];
      var any = e && ((e.done || "") + (e.next || "") + (e.blocked || "")).trim();
      if (!any) { missing.push(m.name); return; }
      out.push("### " + m.name);
      if ((e.done || "").trim()) out.push("- **Since last update:** " + e.done.trim().replace(/\n+/g, " / "));
      if ((e.next || "").trim()) out.push("- **Today:** " + e.next.trim().replace(/\n+/g, " / "));
      if ((e.blocked || "").trim()) {
        out.push("- **In the way:** " + e.blocked.trim().replace(/\n+/g, " / "));
        blocked.push(m.name + " — " + e.blocked.trim().replace(/\n+/g, " / "));
      }
      out.push("");
    });

    out.push("## Needs attention");
    if (!blocked.length) out.push("_Nothing reported as blocked._");
    blocked.forEach(function (b) { out.push("- " + b); });
    if (missing.length) {
      out.push("", "_No update from: " + missing.join(", ") + "._");
    }
    out.push("", "---", "_Generated with Agile Toolbox — Standup Facilitator._");
    return out.join("\n");
  }

  /* --- Trend ------------------------------------------------------------ */
  /** ISO week label like 2026-W32. */
  function isoWeek(iso) {
    var d = UI.parseDate(iso);
    if (!d) return "?";
    var target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var day = (target.getDay() + 6) % 7;         // Mon = 0
    target.setDate(target.getDate() - day + 3);  // nearest Thursday
    var firstThursday = new Date(target.getFullYear(), 0, 4);
    var fday = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - fday + 3);
    var week = 1 + Math.round((target - firstThursday) / (7 * 24 * 3600 * 1000));
    return target.getFullYear() + "-W" + String(week).padStart(2, "0");
  }

  function renderTrend() {
    var mine = state.sessions.filter(function (s) { return s.teamId === state.team.id; });

    /* Heatmap: category × last 10 weeks */
    var weeks = [];
    mine.forEach(function (s) {
      var w = isoWeek(s.date);
      if (weeks.indexOf(w) === -1) weeks.push(w);
    });
    weeks.sort();
    weeks = weeks.slice(-10);

    var counts = {};
    var max = 0;
    var totals = {};
    mine.forEach(function (s) {
      var w = isoWeek(s.date);
      if (weeks.indexOf(w) === -1) return;
      (s.blockers || []).forEach(function (b) {
        if (!b.text || !b.text.trim()) return;
        var cat = b.category || "Uncategorised";
        counts[cat] = counts[cat] || {};
        counts[cat][w] = (counts[cat][w] || 0) + 1;
        totals[cat] = (totals[cat] || 0) + 1;
        max = Math.max(max, counts[cat][w]);
      });
    });

    var table = UI.qs("#heatmap");
    UI.clear(table);
    var cats = CATEGORIES.filter(function (c) { return totals[c]; })
      .concat(Object.keys(totals).filter(function (c) { return CATEGORIES.indexOf(c) === -1; }));

    if (!weeks.length || !cats.length) {
      table.appendChild(UI.el("tbody", {}, [
        UI.el("tr", {}, [UI.el("td", { colspan: 2, html: '<p class="empty">Nothing to plot yet. Finish a standup with at least one blocker and it lands here.</p>' })])
      ]));
    } else {
      var head = UI.el("tr", {}, [UI.el("th", { class: "rowhead", text: "Category" })]);
      weeks.forEach(function (w) { head.appendChild(UI.el("th", { text: w.slice(5) })); });
      head.appendChild(UI.el("th", { text: "Σ" }));
      table.appendChild(UI.el("thead", {}, head));

      var body = UI.el("tbody");
      cats.forEach(function (cat) {
        var tr = UI.el("tr", {}, [UI.el("th", { class: "rowhead", text: cat })]);
        weeks.forEach(function (w) {
          var n = (counts[cat] && counts[cat][w]) || 0;
          var alpha = n ? (0.15 + 0.85 * (n / max)) : 0;
          tr.appendChild(UI.el("td", {
            text: n ? String(n) : "·",
            title: cat + " · " + w + " · " + n,
            style: n
              ? "background: color-mix(in srgb, var(--danger) " + Math.round(alpha * 62) + "%, var(--surface-2));"
              : "background: var(--surface-2); color: var(--text-3);"
          }));
        });
        tr.appendChild(UI.el("td", { text: String(totals[cat]), style: "font-weight:700;" }));
        body.appendChild(tr);
      });
      table.appendChild(body);
    }

    /* Stats */
    var statHost = UI.qs("#trend-stats");
    UI.clear(statHost);
    var blockerTotal = mine.reduce(function (s, x) {
      return s + (x.blockers || []).filter(function (b) { return b.text && b.text.trim(); }).length;
    }, 0);
    var avgSec = mine.length ? mine.reduce(function (s, x) { return s + (x.totalSec || 0); }, 0) / mine.length : 0;
    var topCat = Object.keys(totals).sort(function (a, b) { return totals[b] - totals[a]; })[0];

    [
      { label: "Standups recorded", value: String(mine.length), sub: "for " + state.team.name },
      { label: "Average length", value: mine.length ? UI.mmss(avgSec) : "—", sub: "wall clock, whole meeting" },
      { label: "Blockers logged", value: String(blockerTotal), sub: mine.length ? UI.round(blockerTotal / mine.length, 1) + " per standup" : "—" },
      { label: "Most frequent source", value: topCat ? String(totals[topCat]) : "—", sub: topCat || "nothing logged yet" }
    ].forEach(function (s) {
      statHost.appendChild(UI.el("div", { class: "stat" }, [
        UI.el("div", { class: "stat__label", text: s.label }),
        UI.el("div", { class: "stat__value", text: s.value }),
        UI.el("div", { class: "stat__sub", text: s.sub })
      ]));
    });

    /* History table */
    var tbl = UI.qs("#sessions");
    UI.clear(tbl);
    tbl.appendChild(UI.el("thead", {}, UI.el("tr", {}, [
      UI.el("th", { text: "Date" }),
      UI.el("th", { class: "num", text: "People" }),
      UI.el("th", { class: "num", text: "Length" }),
      UI.el("th", { class: "num", text: "Blockers" }),
      UI.el("th", { text: "Categories" })
    ])));
    var tb = UI.el("tbody");
    mine.slice().reverse().slice(0, 40).forEach(function (s) {
      var real = (s.blockers || []).filter(function (b) { return b.text && b.text.trim(); });
      var cats = {};
      real.forEach(function (b) { cats[b.category] = true; });
      tb.appendChild(UI.el("tr", {}, [
        UI.el("td", { text: UI.prettyDate(s.date) }),
        UI.el("td", { class: "num", text: String(s.participants) }),
        UI.el("td", { class: "num", text: UI.mmss(s.totalSec || 0) }),
        UI.el("td", { class: "num", text: String(real.length) }),
        UI.el("td", { text: Object.keys(cats).join(", ") || "—" })
      ]));
    });
    if (!mine.length) {
      tb.appendChild(UI.el("tr", {}, UI.el("td", { colspan: 5, class: "muted center", text: "No history yet." })));
    }
    tbl.appendChild(tb);
  }

  /* --- Roster & teams --------------------------------------------------- */
  function renderRoster() {
    var host = UI.qs("#roster");
    UI.clear(host);
    state.team.members.forEach(function (m, i) {
      var row = UI.el("div", { class: "roster-row" });
      var input = UI.el("input", { type: "text", value: m.name, placeholder: "Name", "aria-label": "Member name" });
      input.addEventListener("input", UI.debounce(function () {
        m.name = input.value;
        saveTeams();
        paintQueue();
        renderLive();
      }, 300));
      row.appendChild(input);
      row.appendChild(UI.el("button", {
        class: "btn btn--ghost btn--sm", type: "button", text: "✕", title: "Remove from roster",
        onclick: function () {
          state.team.members.splice(i, 1);
          saveTeams();
          renderRoster();
          renderLive();
          if (state.mode === "async") renderAsync();
        }
      }));
      host.appendChild(row);
    });
    if (!state.team.members.length) {
      host.appendChild(UI.el("p", { class: "empty", text: "Nobody on the roster yet." }));
    }
  }

  function renderTeamSelect() {
    var sel = UI.qs("#team-select");
    UI.clear(sel);
    state.teams.forEach(function (t) {
      sel.appendChild(UI.el("option", {
        value: t.id, selected: t.id === state.team.id,
        text: t.name + " (" + t.members.length + ")"
      }));
    });
  }

  function switchTeam(id) {
    clearInterval(state.tick);
    state.session = null;
    state.team = state.teams.filter(function (t) { return t.id === id; })[0] || state.teams[0];
    Store.write(NS, "activeTeam", state.team.id);
    renderAllViews();
  }

  /* --- Mode ------------------------------------------------------------- */
  function setMode(mode) {
    state.mode = mode;
    UI.qsa("#mode-tabs .mode-tab").forEach(function (b) {
      b.setAttribute("aria-current", String(b.dataset.mode === mode));
    });
    UI.qs("#view-live").classList.toggle("hidden", mode !== "live");
    UI.qs("#view-async").classList.toggle("hidden", mode !== "async");
    UI.qs("#view-trend").classList.toggle("hidden", mode !== "trend");
    if (mode === "async") renderAsync();
    if (mode === "trend") renderTrend();
  }

  function renderAllViews() {
    renderTeamSelect();
    renderRoster();
    UI.qs("#timebox").value = state.team.timeboxSec;
    UI.qs("#auto-advance").checked = !!state.team.autoAdvance;
    UI.qs("#sound-on").checked = state.team.sound !== false;
    renderLive();
    if (state.mode === "async") renderAsync();
    if (state.mode === "trend") renderTrend();
  }

  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = 740;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.47);
      setTimeout(function () { ctx.close(); }, 800);
    } catch (err) { /* no audio, no problem */ }
  }

  /* --- Init ------------------------------------------------------------- */
  function init() {
    UI.initChrome();
    loadTeams();
    loadSessions();
    renderAllViews();
    setMode("live");

    UI.qs("#team-select").addEventListener("change", function (e) { switchTeam(e.target.value); });
    UI.qs("#new-team").addEventListener("click", function () {
      var name = prompt("Team name", "New team");
      if (name === null) return;
      var team = makeTeam(name.trim() || "New team", []);
      state.teams.push(team);
      saveTeams();
      switchTeam(team.id);
    });
    UI.qs("#delete-team").addEventListener("click", function () {
      if (state.teams.length === 1) { UI.toast("Keep at least one team.", "danger"); return; }
      if (!UI.confirmDanger("Delete team “" + state.team.name + "”? Its standup history stays in the trend view.")) return;
      state.teams = state.teams.filter(function (t) { return t.id !== state.team.id; });
      saveTeams();
      switchTeam(state.teams[0].id);
    });

    UI.qsa("#mode-tabs .mode-tab").forEach(function (b) {
      b.addEventListener("click", function () { setMode(b.dataset.mode); });
    });

    UI.qs("#btn-start").addEventListener("click", startStandup);
    UI.qs("#btn-pause").addEventListener("click", function () { setRunning(!state.session.running); });
    UI.qs("#btn-next").addEventListener("click", nextSpeaker);
    UI.qs("#btn-finish").addEventListener("click", function () {
      if (UI.confirmDanger("Close the standup now and save the digest?")) finishStandup();
    });
    UI.qs("#btn-reshuffle").addEventListener("click", function () {
      if (state.session && state.session.index >= 0 && state.session.index < state.session.order.length) {
        UI.toast("Reshuffle before you start — mid-meeting it just confuses people.", "danger");
        return;
      }
      state.session = newSession();
      renderLive();
      UI.toast("New order drawn.");
    });

    UI.qs("#add-member").addEventListener("click", function () {
      state.team.members.push({ id: UI.uid("m"), name: "" });
      saveTeams();
      renderRoster();
      renderLive();
      var inputs = UI.qsa("#roster input[type=text]");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    UI.qs("#add-blocker").addEventListener("click", addBlocker);

    UI.qs("#timebox").addEventListener("change", function (e) {
      state.team.timeboxSec = UI.clamp(parseInt(e.target.value, 10) || 90, 15, 600);
      e.target.value = state.team.timeboxSec;
      saveTeams();
      if (state.session && !state.session.running) state.session.remaining = state.team.timeboxSec;
      renderLive();
    });
    UI.qs("#auto-advance").addEventListener("change", function (e) {
      state.team.autoAdvance = e.target.checked; saveTeams();
    });
    UI.qs("#sound-on").addEventListener("change", function (e) {
      state.team.sound = e.target.checked; saveTeams();
    });

    UI.qs("#copy-digest").addEventListener("click", function () {
      UI.copy(state.session ? liveDigest() : (Store.read(NS, "lastDigest", "") || ""));
    });
    UI.qs("#download-digest").addEventListener("click", function () {
      UI.download("standup-" + UI.isoDate() + ".md",
        state.session ? liveDigest() : Store.read(NS, "lastDigest", ""), "text/markdown");
    });

    UI.qs("#copy-prompt").addEventListener("click", function () { UI.copy(ASYNC_PROMPT); });
    UI.qs("#async-digest").addEventListener("click", function () {
      UI.qs("#async-out").textContent = asyncDigest();
    });
    UI.qs("#copy-async").addEventListener("click", function () { UI.copy(asyncDigest()); });
    UI.qs("#download-async").addEventListener("click", function () {
      UI.download("async-standup-" + UI.isoDate() + ".md", asyncDigest(), "text/markdown");
    });

    UI.qs("#export-sessions").addEventListener("click", function () {
      UI.downloadJSON("standup-history.json", {
        app: "agile-toolbox", tool: "standup", schema: Store.schema,
        teams: state.teams, sessions: state.sessions
      });
    });
    UI.qs("#import-sessions").addEventListener("click", function () {
      UI.pickJSON(function (payload) {
        if (!payload || !Array.isArray(payload.sessions)) {
          UI.toast("That file has no standup history in it.", "danger");
          return;
        }
        var known = {};
        state.sessions.forEach(function (s) { known[s.id] = true; });
        var added = 0;
        payload.sessions.forEach(function (s) { if (!known[s.id]) { state.sessions.push(s); added++; } });
        (payload.teams || []).forEach(function (t) {
          if (!state.teams.some(function (x) { return x.id === t.id; })) state.teams.push(t);
        });
        state.sessions.sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
        saveSessions();
        saveTeams();
        renderAllViews();
        renderTrend();
        UI.toast("Imported " + added + " session(s).", "ok");
      });
    });
    UI.qs("#clear-sessions").addEventListener("click", function () {
      if (!UI.confirmDanger("Delete all recorded standup history? Export it first if you want the trend.")) return;
      state.sessions = [];
      saveSessions();
      renderTrend();
    });

    UI.guardUnload(function () { return !!(state.session && state.session.running); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
