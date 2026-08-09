/* ==========================================================================
   Retro Board — browser-only retrospective facilitation.

   Why local-only: a retro is only as honest as the room feels. Nothing here
   is uploaded, so nobody has to wonder who can read it later.
   ========================================================================== */
(function () {
  "use strict";

  var NS = "retro";

  /* --- Formats ---------------------------------------------------------- */
  var FORMATS = {
    sss: {
      label: "Start / Stop / Continue",
      columns: [
        { id: "start", name: "Start", emoji: "🚀", hue: 152, prompt: "What should we begin doing?" },
        { id: "stop", name: "Stop", emoji: "🛑", hue: 5, prompt: "What is costing us more than it returns?" },
        { id: "continue", name: "Continue", emoji: "🔁", hue: 222, prompt: "What worked and deserves protection?" }
      ]
    },
    fourls: {
      label: "4 Ls",
      columns: [
        { id: "liked", name: "Liked", emoji: "💚", hue: 152, prompt: "What did you enjoy?" },
        { id: "learned", name: "Learned", emoji: "💡", hue: 44, prompt: "What do we know now that we didn't?" },
        { id: "lacked", name: "Lacked", emoji: "🧩", hue: 275, prompt: "What was missing?" },
        { id: "longed", name: "Longed for", emoji: "🌠", hue: 200, prompt: "What did you wish you had?" }
      ]
    },
    sailboat: {
      label: "Sailboat",
      columns: [
        { id: "wind", name: "Wind", emoji: "💨", hue: 196, prompt: "What is pushing us forward?" },
        { id: "anchor", name: "Anchors", emoji: "⚓", hue: 32, prompt: "What is slowing us down?" },
        { id: "rocks", name: "Rocks", emoji: "🪨", hue: 5, prompt: "What risks lie ahead?" },
        { id: "island", name: "Island", emoji: "🏝️", hue: 152, prompt: "Where are we actually trying to get to?" }
      ]
    },
    msg: {
      label: "Mad / Sad / Glad",
      columns: [
        { id: "mad", name: "Mad", emoji: "😠", hue: 5, prompt: "What frustrated you?" },
        { id: "sad", name: "Sad", emoji: "😔", hue: 232, prompt: "What disappointed you?" },
        { id: "glad", name: "Glad", emoji: "😄", hue: 152, prompt: "What made you glad?" }
      ]
    }
  };

  var PHASES = [
    { id: "collect", label: "1 · Collect", help: "Everyone writes in silence. With masking on, only you can read your own cards — that is the point." },
    { id: "reveal", label: "2 · Reveal", help: "Read the cards out loud, one column at a time. Group duplicates instead of debating them." },
    { id: "vote", label: "3 · Vote", help: "Each person spends their dots on what they want to discuss. No campaigning." },
    { id: "discuss", label: "4 · Discuss", help: "Work top-down by votes. Timebox each topic and leave with owned actions, not opinions." }
  ];

  /* --- State ------------------------------------------------------------ */
  var state = {
    index: [],      // [{id, title, format, createdAt}]
    board: null,    // active board object
    mine: null,     // { cards: [ids], votes: {cardId: n} } — this browser only
    drafts: {},     // colId -> in-progress textarea text
    focusCol: null,
    editing: null,  // cardId being edited
    timer: { seconds: 300, total: 300, running: false, handle: null }
  };

  /* --- Persistence ------------------------------------------------------ */
  function loadIndex() {
    state.index = Store.read(NS, "index", []);
  }
  function saveIndex() {
    Store.write(NS, "index", state.index);
  }
  function saveBoard() {
    if (!state.board) return;
    state.board.updatedAt = new Date().toISOString();
    Store.write(NS, "board:" + state.board.id, state.board);
    var entry = state.index.filter(function (b) { return b.id === state.board.id; })[0];
    if (entry) {
      entry.title = state.board.title;
      entry.format = state.board.format;
      saveIndex();
    }
  }
  function saveMine() {
    if (!state.board) return;
    Store.write(NS, "mine:" + state.board.id, state.mine);
  }

  function newBoard(title, format) {
    var board = {
      id: UI.uid("retro"),
      title: title,
      format: FORMATS[format] ? format : "sss",
      createdAt: new Date().toISOString(),
      phase: "collect",
      mask: true,
      anonymous: true,
      voteBudget: 3,
      cards: [],
      actions: []
    };
    state.index.unshift({ id: board.id, title: board.title, format: board.format, createdAt: board.createdAt });
    saveIndex();
    Store.write(NS, "board:" + board.id, board);
    Store.write(NS, "active", board.id);
    return board;
  }

  function openBoard(id) {
    var board = Store.read(NS, "board:" + id, null);
    if (!board) {
      UI.toast("That board is gone — opening the most recent one instead.", "danger");
      state.index = state.index.filter(function (b) { return b.id !== id; });
      saveIndex();
      bootBoard();
      return;
    }
    state.board = normalizeBoard(board);
    state.mine = Store.read(NS, "mine:" + id, { cards: [], votes: {} });
    state.drafts = {};
    state.editing = null;
    Store.write(NS, "active", id);
    resetTimer();
    renderAll();
  }

  /** Tolerate boards written by older builds or hand-edited JSON. */
  function normalizeBoard(b) {
    b.format = FORMATS[b.format] ? b.format : "sss";
    b.phase = PHASES.some(function (p) { return p.id === b.phase; }) ? b.phase : "collect";
    b.cards = Array.isArray(b.cards) ? b.cards : [];
    b.actions = Array.isArray(b.actions) ? b.actions : [];
    b.voteBudget = typeof b.voteBudget === "number" ? b.voteBudget : 3;
    b.mask = b.mask !== false;
    b.anonymous = b.anonymous !== false;
    var valid = {};
    FORMATS[b.format].columns.forEach(function (c) { valid[c.id] = true; });
    var firstCol = FORMATS[b.format].columns[0].id;
    b.cards.forEach(function (c) {
      if (!valid[c.col]) c.col = firstCol;       // format changed under it
      c.votes = typeof c.votes === "number" ? c.votes : 0;
      c.children = Array.isArray(c.children) ? c.children : [];
    });
    return b;
  }

  function bootBoard() {
    loadIndex();
    if (!state.index.length) {
      state.board = newBoard("Sprint retro — " + UI.prettyDate(UI.isoDate()), "sss");
      state.mine = { cards: [], votes: {} };
      renderAll();
      return;
    }
    var active = Store.read(NS, "active", null);
    var exists = state.index.some(function (b) { return b.id === active; });
    openBoard(exists ? active : state.index[0].id);
  }

  /* --- Helpers ---------------------------------------------------------- */
  function fmt() { return FORMATS[state.board.format]; }
  function cardsIn(colId) {
    return state.board.cards.filter(function (c) { return c.col === colId; });
  }
  function isMine(cardId) { return state.mine.cards.indexOf(cardId) !== -1; }
  function masked(card) {
    return state.board.mask && state.board.phase === "collect" && !isMine(card.id);
  }
  function votesSpent() {
    return Object.keys(state.mine.votes).reduce(function (sum, k) {
      return sum + (state.mine.votes[k] || 0);
    }, 0);
  }
  function votesLeft() { return Math.max(0, state.board.voteBudget - votesSpent()); }
  function myName() { return Store.read("app", "displayName", ""); }
  function totalVotes(card) {
    return (card.votes || 0) + (card.children || []).reduce(function (s, ch) { return s + (ch.votes || 0); }, 0);
  }

  /* --- Render: chrome --------------------------------------------------- */
  function renderBoardSelect() {
    var sel = UI.qs("#board-select");
    UI.clear(sel);
    state.index.forEach(function (b) {
      sel.appendChild(UI.el("option", {
        value: b.id,
        selected: b.id === state.board.id,
        text: b.title + "  ·  " + (FORMATS[b.format] ? FORMATS[b.format].label : b.format)
      }));
    });
  }

  function renderPhases() {
    var host = UI.qs("#phases");
    UI.clear(host);
    PHASES.forEach(function (p) {
      host.appendChild(UI.el("button", {
        class: "phase-btn", type: "button", text: p.label,
        "aria-current": String(state.board.phase === p.id),
        onclick: function () {
          state.board.phase = p.id;
          if (p.id === "discuss") sortAllByVotes();
          saveBoard();
          renderAll();
        }
      }));
    });
    var current = PHASES.filter(function (p) { return p.id === state.board.phase; })[0];
    UI.qs("#phase-help").textContent = current ? current.help : "";
  }

  function renderOptions() {
    UI.qs("#opt-mask").checked = state.board.mask;
    UI.qs("#opt-anon").checked = state.board.anonymous;
    UI.qs("#opt-budget").value = state.board.voteBudget;
    UI.qs("#opt-name").value = myName();
    UI.qs("#opt-name").disabled = state.board.anonymous;
    UI.qs("#votes-left").textContent = votesLeft();
  }

  /* --- Render: columns -------------------------------------------------- */
  function renderColumns() {
    var host = UI.qs("#columns");
    UI.clear(host);

    fmt().columns.forEach(function (col) {
      var wrap = UI.el("section", { class: "col", style: "--col-accent: hsl(" + col.hue + " 62% 52%)" });
      var list = cardsIn(col.id);

      var head = UI.el("div", { class: "col__head" });
      head.appendChild(UI.el("span", { class: "col__emoji", text: col.emoji, "aria-hidden": "true" }));
      head.appendChild(UI.el("h3", { class: "col__name", text: col.name }));
      head.appendChild(UI.el("span", { class: "col__count", text: list.length + " · " + list.reduce(function (s, c) { return s + totalVotes(c); }, 0) + "▲" }));
      wrap.appendChild(head);
      wrap.appendChild(UI.el("p", { class: "col__prompt", text: col.prompt }));

      var cards = UI.el("div", { class: "col__cards", dataset: { col: col.id } });
      list.forEach(function (card) { cards.appendChild(renderCard(card, col)); });
      if (!list.length) {
        cards.appendChild(UI.el("p", { class: "tiny muted center", style: "margin:6px 0;", text: "No cards yet" }));
      }
      wireColumnDrop(cards, col.id);
      wrap.appendChild(cards);

      if (state.board.phase === "collect" || state.board.phase === "reveal") {
        wrap.appendChild(renderComposer(col));
      }
      host.appendChild(wrap);
    });

    if (state.focusCol) {
      var ta = UI.qs('textarea[data-composer="' + state.focusCol + '"]');
      if (ta) { ta.focus(); }
      state.focusCol = null;
    }
  }

  function renderComposer(col) {
    var box = UI.el("div", { class: "col__new" });
    var ta = UI.el("textarea", {
      rows: 2,
      placeholder: "Add a card…  (Enter to save)",
      dataset: { composer: col.id },
      "aria-label": "New card in " + col.name
    });
    ta.value = state.drafts[col.id] || "";
    ta.addEventListener("input", function () { state.drafts[col.id] = ta.value; });
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        addCard(col.id, ta.value);
      }
    });
    box.appendChild(ta);
    return box;
  }

  function renderCard(card, col) {
    var node = UI.el("article", { class: "rcard", dataset: { id: card.id } });
    var hidden = masked(card);

    /* header: drag grip + author */
    var grip = UI.el("div", { class: "rcard__grip", draggable: "true", title: "Drag to move" });
    grip.appendChild(UI.el("span", {
      html: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><g fill="currentColor">' +
        '<circle cx="3" cy="2.5" r="1.1"/><circle cx="9" cy="2.5" r="1.1"/><circle cx="3" cy="6" r="1.1"/>' +
        '<circle cx="9" cy="6" r="1.1"/><circle cx="3" cy="9.5" r="1.1"/><circle cx="9" cy="9.5" r="1.1"/></g></svg>'
    }));
    grip.appendChild(UI.el("span", {
      class: "rcard__author",
      text: hidden ? "hidden" : (card.author ? card.author : "anonymous")
    }));
    grip.addEventListener("dragstart", function (e) {
      e.dataTransfer.setData("text/plain", card.id);
      e.dataTransfer.effectAllowed = "move";
      node.classList.add("is-dragging");
    });
    grip.addEventListener("dragend", function () {
      node.classList.remove("is-dragging");
      UI.qsa(".is-insert-before, .is-insert-after").forEach(function (n) {
        n.classList.remove("is-insert-before", "is-insert-after");
      });
      UI.qsa(".is-drop-target").forEach(function (n) { n.classList.remove("is-drop-target"); });
    });
    node.appendChild(grip);

    /* body */
    if (state.editing === card.id) {
      var editBox = UI.el("div", { class: "rcard__edit" });
      var ta = UI.el("textarea", { rows: 3, "aria-label": "Edit card" });
      ta.value = card.text;
      ta.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === "Escape") { state.editing = null; renderColumns(); }
      });
      ta.addEventListener("blur", commit);
      function commit() {
        var next = ta.value.trim();
        if (!next) { UI.toast("A card needs some text.", "danger"); ta.focus(); return; }
        card.text = next;
        state.editing = null;
        saveBoard();
        renderColumns();
      }
      editBox.appendChild(ta);
      node.appendChild(editBox);
      setTimeout(function () { ta.focus(); UI.autoGrow(ta, 60); }, 0);
    } else {
      var text = UI.el("div", {
        class: "rcard__text" + (hidden ? " is-masked" : ""),
        text: hidden ? "•••  written, not yet revealed" : card.text,
        title: hidden ? "" : "Click to edit"
      });
      if (!hidden) {
        text.addEventListener("click", function () { state.editing = card.id; renderColumns(); });
      }
      node.appendChild(text);
    }

    /* grouped children */
    if (!hidden && card.children && card.children.length) {
      var kids = UI.el("div", { class: "rcard__children" });
      card.children.forEach(function (child, i) {
        var row = UI.el("div", { class: "rcard__child" });
        row.appendChild(UI.el("span", { text: child.text }));
        row.appendChild(UI.el("button", {
          class: "btn btn--ghost btn--sm", type: "button", title: "Ungroup", text: "↥",
          onclick: function () {
            card.children.splice(i, 1);
            state.board.cards.push({
              id: UI.uid("card"), col: card.col, text: child.text,
              author: child.author || "", votes: child.votes || 0, children: []
            });
            saveBoard(); renderColumns();
          }
        }));
        kids.appendChild(row);
      });
      node.appendChild(kids);
    }

    /* footer: votes + actions */
    var foot = UI.el("div", { class: "rcard__foot" });

    if (state.board.phase === "vote" || state.board.phase === "discuss") {
      var votes = UI.el("div", { class: "rcard__votes" });
      if (state.board.phase === "vote") {
        votes.appendChild(UI.el("button", {
          class: "btn btn--ghost btn--sm", type: "button", text: "−", title: "Remove your vote",
          disabled: !(state.mine.votes[card.id] > 0),
          onclick: function () { vote(card, -1); }
        }));
      }
      votes.appendChild(UI.el("span", { class: "n", text: String(totalVotes(card)) }));
      votes.appendChild(UI.el("span", { text: "▲", "aria-label": "votes" }));
      if (state.board.phase === "vote") {
        votes.appendChild(UI.el("button", {
          class: "btn btn--ghost btn--sm", type: "button", text: "+", title: "Vote for this",
          disabled: votesLeft() <= 0,
          onclick: function () { vote(card, 1); }
        }));
        if (state.mine.votes[card.id]) {
          votes.appendChild(UI.el("span", { class: "tag tag--accent", text: "you: " + state.mine.votes[card.id] }));
        }
      }
      foot.appendChild(votes);
    }

    foot.appendChild(UI.el("div", { class: "flex-1" }));

    if (!hidden) {
      var idx = fmt().columns.map(function (c) { return c.id; }).indexOf(card.col);
      if (idx > 0) {
        foot.appendChild(UI.el("button", {
          class: "btn btn--ghost btn--sm", type: "button", text: "◀",
          title: "Move to " + fmt().columns[idx - 1].name,
          onclick: function () { card.col = fmt().columns[idx - 1].id; saveBoard(); renderColumns(); }
        }));
      }
      if (idx < fmt().columns.length - 1) {
        foot.appendChild(UI.el("button", {
          class: "btn btn--ghost btn--sm", type: "button", text: "▶",
          title: "Move to " + fmt().columns[idx + 1].name,
          onclick: function () { card.col = fmt().columns[idx + 1].id; saveBoard(); renderColumns(); }
        }));
      }
      var siblings = cardsIn(card.col).filter(function (c) { return c.id !== card.id; });
      if (siblings.length) {
        foot.appendChild(UI.el("button", {
          class: "btn btn--ghost btn--sm", type: "button", text: "⿻", title: "Group into another card",
          onclick: function () { openGroupDialog(card, siblings); }
        }));
      }
      foot.appendChild(UI.el("button", {
        class: "btn btn--ghost btn--sm", type: "button", text: "✕", title: "Delete card",
        onclick: function () {
          if (!UI.confirmDanger("Delete this card?")) return;
          deleteCard(card.id);
        }
      }));
    }
    node.appendChild(foot);

    wireCardDropTarget(node, card);
    return node;
  }

  /* --- Drag & drop ------------------------------------------------------ */
  function wireColumnDrop(listNode, colId) {
    listNode.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      listNode.classList.add("is-drop-target");
    });
    listNode.addEventListener("dragleave", function (e) {
      if (e.target === listNode) listNode.classList.remove("is-drop-target");
    });
    listNode.addEventListener("drop", function (e) {
      e.preventDefault();
      listNode.classList.remove("is-drop-target");
      var id = e.dataTransfer.getData("text/plain");
      if (id) moveCard(id, colId, null);
    });
  }

  function wireCardDropTarget(node, card) {
    node.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var box = node.getBoundingClientRect();
      var after = (e.clientY - box.top) > box.height / 2;
      node.classList.toggle("is-insert-before", !after);
      node.classList.toggle("is-insert-after", after);
    });
    node.addEventListener("dragleave", function () {
      node.classList.remove("is-insert-before", "is-insert-after");
    });
    node.addEventListener("drop", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var after = node.classList.contains("is-insert-after");
      node.classList.remove("is-insert-before", "is-insert-after");
      var id = e.dataTransfer.getData("text/plain");
      if (id && id !== card.id) moveCard(id, card.col, { anchorId: card.id, after: after });
    });
  }

  /** Move a card to a column, optionally before/after an anchor card. */
  function moveCard(id, colId, position) {
    var cards = state.board.cards;
    var from = cards.map(function (c) { return c.id; }).indexOf(id);
    if (from === -1) return;
    var card = cards.splice(from, 1)[0];
    card.col = colId;
    if (position) {
      var at = cards.map(function (c) { return c.id; }).indexOf(position.anchorId);
      cards.splice(at === -1 ? cards.length : at + (position.after ? 1 : 0), 0, card);
    } else {
      cards.push(card);
    }
    saveBoard();
    renderColumns();
  }

  /* --- Card operations -------------------------------------------------- */
  function addCard(colId, raw) {
    var text = (raw || "").trim();
    if (!text) return;
    // One card per line lets people paste a whole list at once.
    var lines = text.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
    lines.forEach(function (line) {
      var card = {
        id: UI.uid("card"),
        col: colId,
        text: line,
        author: state.board.anonymous ? "" : myName(),
        votes: 0,
        children: [],
        createdAt: new Date().toISOString()
      };
      state.board.cards.push(card);
      state.mine.cards.push(card.id);
    });
    state.drafts[colId] = "";
    state.focusCol = colId;
    saveBoard();
    saveMine();
    renderColumns();
  }

  function deleteCard(id) {
    state.board.cards = state.board.cards.filter(function (c) { return c.id !== id; });
    state.mine.cards = state.mine.cards.filter(function (c) { return c !== id; });
    delete state.mine.votes[id];
    saveBoard();
    saveMine();
    renderAll();
  }

  function vote(card, delta) {
    var mineNow = state.mine.votes[card.id] || 0;
    if (delta > 0 && votesLeft() <= 0) { UI.toast("You have spent all your votes.", "danger"); return; }
    if (delta < 0 && mineNow <= 0) return;
    state.mine.votes[card.id] = mineNow + delta;
    if (state.mine.votes[card.id] <= 0) delete state.mine.votes[card.id];
    card.votes = Math.max(0, (card.votes || 0) + delta);
    saveBoard();
    saveMine();
    UI.qs("#votes-left").textContent = votesLeft();
    renderColumns();
  }

  function openGroupDialog(card, siblings) {
    var dlg = UI.el("dialog");
    var sel = UI.el("select", { "aria-label": "Target card" });
    siblings.forEach(function (s) {
      sel.appendChild(UI.el("option", { value: s.id, text: s.text.slice(0, 70) }));
    });
    var body = UI.el("div", { class: "card__body stack" }, [
      UI.el("h2", { text: "Group this card into another" }),
      UI.el("p", { class: "muted tiny", text: "The text moves in as a sub-item and the votes are added together. Use this for duplicates instead of arguing about wording." }),
      sel
    ]);
    var foot = UI.el("div", { class: "card__head", style: "border-top:1px solid var(--border);border-bottom:0;justify-content:flex-end;" }, [
      UI.el("button", { class: "btn", type: "button", text: "Cancel", onclick: function () { dlg.close(); } }),
      UI.el("button", {
        class: "btn btn--primary", type: "button", text: "Group",
        onclick: function () {
          var target = state.board.cards.filter(function (c) { return c.id === sel.value; })[0];
          if (target) {
            target.children = target.children || [];
            target.children.push({ text: card.text, author: card.author, votes: card.votes || 0 });
            (card.children || []).forEach(function (ch) { target.children.push(ch); });
            deleteCard(card.id);
          }
          dlg.close();
        }
      })
    ]);
    dlg.appendChild(body);
    dlg.appendChild(foot);
    document.body.appendChild(dlg);
    dlg.addEventListener("close", function () { dlg.remove(); });
    dlg.showModal();
  }

  function sortAllByVotes() {
    var order = {};
    fmt().columns.forEach(function (c, i) { order[c.id] = i; });
    state.board.cards.sort(function (a, b) {
      if (order[a.col] !== order[b.col]) return order[a.col] - order[b.col];
      return totalVotes(b) - totalVotes(a);
    });
  }

  /* --- Action items ----------------------------------------------------- */
  function renderActions() {
    var host = UI.qs("#actions");
    UI.clear(host);
    if (!state.board.actions.length) {
      host.appendChild(UI.el("p", {
        class: "empty",
        text: "No actions yet. A retro without owned actions is a vent session — add at most two or three."
      }));
      return;
    }
    state.board.actions.forEach(function (action, i) {
      var row = UI.el("div", { class: "action-row" + (action.done ? " is-done" : "") });

      row.appendChild(UI.el("input", {
        type: "checkbox", checked: !!action.done, "aria-label": "Done",
        onchange: function (e) { action.done = e.target.checked; saveBoard(); renderActions(); }
      }));

      var nth = "action " + (i + 1);
      var text = UI.el("input", {
        type: "text", class: "action-text", value: action.text,
        placeholder: "What will change?", "aria-label": "Description of " + nth
      });
      text.addEventListener("input", UI.debounce(function () { action.text = text.value; saveBoard(); }, 300));
      row.appendChild(text);

      var owner = UI.el("input", {
        type: "text", class: "action-owner", value: action.owner || "",
        placeholder: "Owner", "aria-label": "Owner of " + nth
      });
      owner.addEventListener("input", UI.debounce(function () { action.owner = owner.value; saveBoard(); }, 300));
      row.appendChild(owner);

      var due = UI.el("input", {
        type: "date", class: "action-due", value: action.due || "",
        "aria-label": "Due date of " + nth
      });
      due.addEventListener("change", function () {
        action.due = due.value;
        saveBoard();
        UI.defer(renderActions);   // this input is inside the row being rebuilt
      });
      row.appendChild(due);

      row.appendChild(UI.el("button", {
        class: "btn btn--ghost btn--sm", type: "button", text: "✕", title: "Remove action",
        onclick: function () { state.board.actions.splice(i, 1); saveBoard(); renderActions(); }
      }));
      host.appendChild(row);
    });
  }

  function carryOverActions() {
    var previous = state.index.filter(function (b) { return b.id !== state.board.id; })[0];
    if (!previous) { UI.toast("No earlier retro to carry from.", "danger"); return; }
    var prevBoard = Store.read(NS, "board:" + previous.id, null);
    var open = ((prevBoard && prevBoard.actions) || []).filter(function (a) { return !a.done && a.text.trim(); });
    if (!open.length) { UI.toast("Every action from “" + previous.title + "” is closed. Nice.", "ok"); return; }
    open.forEach(function (a) {
      state.board.actions.push({
        id: UI.uid("act"), text: a.text, owner: a.owner || "", due: a.due || "",
        done: false, carriedFrom: previous.title
      });
    });
    saveBoard();
    renderActions();
    UI.toast("Carried " + open.length + " unfinished action(s) from “" + previous.title + "”.");
  }

  /* --- Timer ------------------------------------------------------------ */
  function paintTimer() {
    var d = UI.qs("#timer-display");
    d.textContent = UI.mmss(state.timer.seconds);
    d.classList.toggle("is-over", state.timer.seconds === 0);
    UI.qs("#timer-start").textContent = state.timer.running ? "Pause" : "Start";
  }
  function resetTimer() {
    clearInterval(state.timer.handle);
    state.timer.running = false;
    var mins = parseInt(UI.qs("#timer-minutes").value, 10) || 5;
    state.timer.total = mins * 60;
    state.timer.seconds = state.timer.total;
    paintTimer();
  }
  function toggleTimer() {
    if (state.timer.running) {
      clearInterval(state.timer.handle);
      state.timer.running = false;
      paintTimer();
      return;
    }
    if (state.timer.seconds <= 0) resetTimer();
    state.timer.running = true;
    state.timer.handle = setInterval(function () {
      state.timer.seconds--;
      if (state.timer.seconds <= 0) {
        state.timer.seconds = 0;
        clearInterval(state.timer.handle);
        state.timer.running = false;
        UI.toast("Time is up.", "danger", 4000);
        beep();
      }
      paintTimer();
    }, 1000);
    paintTimer();
  }
  function beep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.62);
      setTimeout(function () { ctx.close(); }, 900);
    } catch (err) { /* a silent timer is still a timer */ }
  }

  /* --- Export / import -------------------------------------------------- */
  function toMarkdown() {
    var b = state.board;
    var out = ["# " + b.title, ""];
    out.push("_" + UI.prettyDate(b.createdAt.slice(0, 10)) + " · Format: " + fmt().label + "_", "");
    fmt().columns.forEach(function (col) {
      var list = cardsIn(col.id).slice().sort(function (x, y) { return totalVotes(y) - totalVotes(x); });
      out.push("## " + col.emoji + " " + col.name);
      if (!list.length) out.push("_(nothing raised)_");
      list.forEach(function (c) {
        var v = totalVotes(c);
        out.push("- " + (v ? "**(" + v + "▲)** " : "") + c.text +
          (c.author ? "  — " + c.author : ""));
        (c.children || []).forEach(function (ch) { out.push("  - " + ch.text); });
      });
      out.push("");
    });
    out.push("## ✅ Action items");
    if (!b.actions.length) out.push("_(none agreed — worth asking why)_");
    b.actions.forEach(function (a) {
      out.push("- [" + (a.done ? "x" : " ") + "] " + (a.text || "(unnamed)") +
        (a.owner ? " — **" + a.owner + "**" : "") +
        (a.due ? " — due " + a.due : "") +
        (a.carriedFrom ? " _(carried from " + a.carriedFrom + ")_" : ""));
    });
    out.push("", "---", "_Generated with Agile Toolbox — Retro Board._");
    return out.join("\n");
  }

  function importBoard(payload) {
    var board = payload && payload.board ? payload.board : payload;
    if (!board || !Array.isArray(board.cards)) {
      UI.toast("That file does not look like a retro board.", "danger");
      return;
    }
    board.id = UI.uid("retro");
    board.title = (board.title || "Imported retro") + " (imported)";
    board.createdAt = board.createdAt || new Date().toISOString();
    state.index.unshift({ id: board.id, title: board.title, format: board.format || "sss", createdAt: board.createdAt });
    saveIndex();
    Store.write(NS, "board:" + board.id, normalizeBoard(board));
    openBoard(board.id);
    UI.toast("Board imported.", "ok");
  }

  /* --- Wiring ----------------------------------------------------------- */
  function renderAll() {
    renderBoardSelect();
    renderPhases();
    renderOptions();
    renderColumns();
    renderActions();
  }

  function askNewBoard() {
    var dlg = UI.el("dialog");
    var title = UI.el("input", { type: "text", value: "Sprint retro — " + UI.prettyDate(UI.isoDate()) });
    var sel = UI.el("select");
    Object.keys(FORMATS).forEach(function (k) {
      sel.appendChild(UI.el("option", { value: k, text: FORMATS[k].label }));
    });
    var body = UI.el("div", { class: "card__body stack" }, [
      UI.el("h2", { text: "New retro" }),
      UI.el("div", { class: "field" }, [UI.el("label", { class: "label", text: "Title" }), title]),
      UI.el("div", { class: "field" }, [UI.el("label", { class: "label", text: "Format" }), sel]),
      UI.el("p", { class: "tiny muted", text: "Rotating the format keeps people from answering on autopilot." })
    ]);
    var foot = UI.el("div", { class: "card__head", style: "border-top:1px solid var(--border);border-bottom:0;justify-content:flex-end;" }, [
      UI.el("button", { class: "btn", type: "button", text: "Cancel", onclick: function () { dlg.close(); } }),
      UI.el("button", {
        class: "btn btn--primary", type: "button", text: "Create",
        onclick: function () {
          var board = newBoard(title.value.trim() || "Untitled retro", sel.value);
          dlg.close();
          openBoard(board.id);
        }
      })
    ]);
    dlg.appendChild(body);
    dlg.appendChild(foot);
    document.body.appendChild(dlg);
    dlg.addEventListener("close", function () { dlg.remove(); });
    dlg.showModal();
    title.select();
  }

  function init() {
    UI.initChrome();
    bootBoard();

    UI.qs("#board-select").addEventListener("change", function (e) { openBoard(e.target.value); });
    UI.qs("#new-board").addEventListener("click", askNewBoard);

    UI.qs("#rename-board").addEventListener("click", function () {
      var next = prompt("Retro title", state.board.title);
      if (next === null) return;
      state.board.title = next.trim() || state.board.title;
      saveBoard();
      renderBoardSelect();
    });

    UI.qs("#delete-board").addEventListener("click", function () {
      if (!UI.confirmDanger("Delete “" + state.board.title + "” and everything on it? This cannot be undone.")) return;
      var id = state.board.id;
      Store.remove(NS, "board:" + id);
      Store.remove(NS, "mine:" + id);
      state.index = state.index.filter(function (b) { return b.id !== id; });
      saveIndex();
      state.board = null;
      bootBoard();
      UI.toast("Board deleted.");
    });

    UI.qs("#export-md").addEventListener("click", function () {
      UI.download(UI.slug(state.board.title) + ".md", toMarkdown(), "text/markdown");
    });
    UI.qs("#export-json").addEventListener("click", function () {
      UI.downloadJSON(UI.slug(state.board.title) + ".json", {
        app: "agile-toolbox", tool: "retro", schema: Store.schema, board: state.board
      });
    });
    UI.qs("#import-json").addEventListener("click", function () { UI.pickJSON(importBoard); });
    UI.qs("#print").addEventListener("click", function () { window.print(); });

    UI.qs("#opt-mask").addEventListener("change", function (e) {
      state.board.mask = e.target.checked; saveBoard(); renderColumns();
    });
    UI.qs("#opt-anon").addEventListener("change", function (e) {
      state.board.anonymous = e.target.checked;
      saveBoard();
      renderOptions();
      renderColumns();
    });
    UI.qs("#opt-name").addEventListener("input", UI.debounce(function (e) {
      Store.write("app", "displayName", e.target.value.trim());
    }, 300));
    UI.qs("#opt-budget").addEventListener("change", function (e) {
      state.board.voteBudget = UI.clamp(parseInt(e.target.value, 10) || 0, 0, 20);
      e.target.value = state.board.voteBudget;
      saveBoard();
      renderOptions();
      renderColumns();
    });

    UI.qs("#timer-start").addEventListener("click", toggleTimer);
    UI.qs("#timer-reset").addEventListener("click", resetTimer);
    UI.qs("#timer-minutes").addEventListener("change", resetTimer);

    UI.qs("#add-action").addEventListener("click", function () {
      state.board.actions.push({ id: UI.uid("act"), text: "", owner: "", due: "", done: false });
      saveBoard();
      renderActions();
      var inputs = UI.qsa("#actions .action-text");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    UI.qs("#carry-actions").addEventListener("click", carryOverActions);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
