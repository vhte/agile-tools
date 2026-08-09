/* ==========================================================================
   UI — small shared helpers: chrome, theme, toasts, exports, dates.
   Plain globals on purpose: every page must open straight from the file
   system (file://) with no bundler and no module/CORS friction.
   ========================================================================== */
(function (global) {
  "use strict";

  var LOGO =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<rect x="2.5" y="2.5" width="19" height="19" rx="5" fill="currentColor" opacity=".12"/>' +
    '<path d="M6.5 14.5l3.2 3.2 8-9.4" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M6.5 9.2l1.9 1.9" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" opacity=".45"/>' +
    "</svg>";

  var SUN =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';

  var MOON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/></svg>';

  var UI = {
    /* --- DOM ------------------------------------------------------------- */
    qs: function (sel, root) { return (root || document).querySelector(sel); },
    qsa: function (sel, root) {
      return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    },

    /** el("div", {class:"x", onclick:fn, dataset:{id:1}}, ["text", childNode]) */
    el: function (tag, props, children) {
      var node = document.createElement(tag);
      Object.keys(props || {}).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "text") node.textContent = v;
        else if (k === "dataset") Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k === "style") node.setAttribute("style", v);
        else if (k.indexOf("on") === 0 && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (v === true) node.setAttribute(k, "");
        else node.setAttribute(k, v);
      });
      (Array.isArray(children) ? children : children ? [children] : []).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
      });
      return node;
    },

    /**
     * Empty a node. replaceChildren() detaches in one operation, which matters:
     * removing children one by one while the browser is mid-blur (a change
     * handler that rebuilds the table its own input lives in) throws.
     */
    clear: function (node) {
      if (!node) return node;
      if (node.replaceChildren) node.replaceChildren();
      else node.textContent = "";
      return node;
    },

    /**
     * Run fn after the current event finishes dispatching. Use it whenever a
     * change/blur handler needs to re-render the container that holds the very
     * element being changed — rebuilding mid-dispatch loses focus and, in some
     * browsers, throws outright.
     */
    defer: function (fn) { setTimeout(fn, 0); },

    escape: function (str) {
      return String(str === null || str === undefined ? "" : str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    },

    /* --- Ids, numbers, dates -------------------------------------------- */
    uid: function (prefix) {
      return (prefix || "id") + "-" + Date.now().toString(36) + "-" +
        Math.random().toString(36).slice(2, 8);
    },

    clamp: function (n, min, max) { return Math.min(max, Math.max(min, n)); },

    round: function (n, digits) {
      var f = Math.pow(10, digits || 0);
      return Math.round(n * f) / f;
    },

    /** Local YYYY-MM-DD (never UTC — sprint dates must not drift a day). */
    isoDate: function (date) {
      var d = date || new Date();
      return d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0") + "-" +
        String(d.getDate()).padStart(2, "0");
    },

    /** Parse YYYY-MM-DD as a *local* date at midnight. */
    parseDate: function (iso) {
      if (!iso) return null;
      var p = String(iso).split("-").map(Number);
      if (p.length !== 3 || p.some(isNaN)) return null;
      return new Date(p[0], p[1] - 1, p[2]);
    },

    addDays: function (date, days) {
      var d = new Date(date.getTime());
      d.setDate(d.getDate() + days);
      return d;
    },

    prettyDate: function (iso) {
      var d = UI.parseDate(iso);
      if (!d) return "—";
      return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    },

    mmss: function (totalSeconds) {
      var s = Math.max(0, Math.round(totalSeconds));
      return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
    },

    /* --- Feedback -------------------------------------------------------- */
    toast: function (message, kind, ms) {
      var host = document.getElementById("toasts");
      if (!host) {
        host = UI.el("div", { id: "toasts" });
        document.body.appendChild(host);
      }
      var t = UI.el("div", { class: "toast" + (kind ? " toast--" + kind : ""), role: "status", text: message });
      host.appendChild(t);
      setTimeout(function () {
        t.style.transition = "opacity .25s ease";
        t.style.opacity = "0";
        setTimeout(function () { t.remove(); }, 250);
      }, ms || 2600);
    },

    confirmDanger: function (message) {
      return global.confirm(message);
    },

    /* --- Data out -------------------------------------------------------- */
    download: function (filename, content, mime) {
      var blob = new Blob([content], { type: (mime || "text/plain") + ";charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = UI.el("a", { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    },

    downloadJSON: function (filename, obj) {
      UI.download(filename, JSON.stringify(obj, null, 2), "application/json");
    },

    copy: function (text) {
      function fallback() {
        var ta = UI.el("textarea", { style: "position:fixed;top:-1000px;left:-1000px;" });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
        ta.remove();
        UI.toast(ok ? "Copied to clipboard" : "Copy failed — select the text manually", ok ? "ok" : "danger");
      }
      if (navigator.clipboard && global.isSecureContext) {
        navigator.clipboard.writeText(text).then(
          function () { UI.toast("Copied to clipboard", "ok"); },
          fallback
        );
      } else {
        fallback();
      }
    },

    /** Ask for a .json file and hand back the parsed object. */
    pickJSON: function (onLoad) {
      var input = UI.el("input", { type: "file", accept: ".json,application/json", class: "hidden" });
      document.body.appendChild(input);
      input.addEventListener("change", function () {
        var file = input.files && input.files[0];
        if (!file) { input.remove(); return; }
        var reader = new FileReader();
        reader.onload = function () {
          try { onLoad(JSON.parse(String(reader.result)), file.name); }
          catch (err) { UI.toast("That file is not valid JSON.", "danger"); }
          input.remove();
        };
        reader.onerror = function () { UI.toast("Could not read that file.", "danger"); input.remove(); };
        reader.readAsText(file);
      });
      input.click();
    },

    /** Turn text into a filename-safe slug. */
    slug: function (str) {
      return String(str || "untitled").toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "untitled";
    },

    /* --- Theme ----------------------------------------------------------- */
    theme: {
      get: function () { return Store.read("app", "theme", "system"); },
      apply: function (mode) {
        if (mode === "system") document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", mode);
      },
      set: function (mode) {
        Store.write("app", "theme", mode);
        UI.theme.apply(mode);
      },
      cycle: function () {
        var order = ["system", "light", "dark"];
        var next = order[(order.indexOf(UI.theme.get()) + 1) % order.length];
        UI.theme.set(next);
        UI.toast("Theme: " + next);
        UI.theme.paintToggle();
        return next;
      },
      paintToggle: function () {
        var btn = document.getElementById("theme-toggle");
        if (!btn) return;
        var mode = UI.theme.get();
        var dark = mode === "dark" ||
          (mode === "system" && global.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
        btn.innerHTML = dark ? SUN : MOON;
        btn.title = "Theme: " + mode + " (click to change)";
        btn.setAttribute("aria-label", btn.title);
      }
    },

    /**
     * Build the shared top bar.
     * <body data-title="Retro Board" data-root="../../">
     */
    initChrome: function () {
      UI.theme.apply(UI.theme.get());

      var root = document.body.dataset.root || "";
      var title = document.body.dataset.title || "";
      var bar = UI.el("header", { class: "topbar" });

      bar.appendChild(UI.el("a", {
        class: "topbar__brand",
        href: root + "index.html",
        html: LOGO + "<span>Agile Toolbox</span>"
      }));
      if (title) {
        bar.appendChild(UI.el("span", { class: "topbar__sep", text: "/" }));
        bar.appendChild(UI.el("span", { class: "topbar__title", text: title }));
      }
      bar.appendChild(UI.el("div", { class: "topbar__spacer" }));

      var actions = UI.el("div", { class: "topbar__actions", id: "topbar-actions" });
      actions.appendChild(UI.el("button", {
        class: "btn btn--ghost btn--icon", id: "theme-toggle", type: "button",
        onclick: function () { UI.theme.cycle(); }
      }));
      bar.appendChild(actions);

      document.body.insertBefore(bar, document.body.firstChild);
      UI.theme.paintToggle();

      if (global.matchMedia) {
        matchMedia("(prefers-color-scheme: dark)").addEventListener("change", UI.theme.paintToggle);
      }

      if (!Store.isPersistent) {
        UI.toast("This browser blocked local storage — your work will vanish on reload.", "danger", 6000);
      }
      UI.registerServiceWorker(root);
      return actions;
    },

    /** Add a button to the top bar, right of the title. */
    addBarButton: function (label, onClick, variant) {
      var host = document.getElementById("topbar-actions");
      if (!host) return null;
      var btn = UI.el("button", {
        class: "btn btn--sm" + (variant ? " btn--" + variant : ""), type: "button",
        text: label, onclick: onClick
      });
      host.insertBefore(btn, host.firstChild);
      return btn;
    },

    registerServiceWorker: function (root) {
      if (!("serviceWorker" in navigator)) return;
      if (location.protocol === "file:") return; // no SW off the file system
      navigator.serviceWorker.register(root + "sw.js").catch(function () { /* offline is a bonus */ });
    },

    /* --- Misc ------------------------------------------------------------ */
    /** Fisher–Yates, non-mutating. */
    shuffle: function (list) {
      var a = list.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    },

    /** Debounce for autosave on keystrokes. */
    debounce: function (fn, ms) {
      var t;
      return function () {
        var args = arguments, self = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
      };
    },

    /** Keep a textarea's height glued to its content. */
    autoGrow: function (textarea, minPx) {
      function grow() {
        textarea.style.height = "auto";
        textarea.style.height = Math.max(minPx || 40, textarea.scrollHeight) + "px";
      }
      textarea.addEventListener("input", grow);
      grow();
    },

    /** Warn before a tab close would drop unsaved edits (used by timers). */
    guardUnload: function (shouldWarn) {
      global.addEventListener("beforeunload", function (e) {
        if (shouldWarn()) { e.preventDefault(); e.returnValue = ""; }
      });
    }
  };

  global.UI = UI;
})(window);
