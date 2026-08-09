/* ==========================================================================
   Store — the only place Agile Toolbox persists anything.
   Everything lives in this browser's localStorage under the "atbx:" prefix.
   Nothing is ever sent anywhere. There is no server to send it to.
   ========================================================================== */
(function (global) {
  "use strict";

  var PREFIX = "atbx:";
  var SCHEMA = 1;

  function fullKey(ns, key) {
    return PREFIX + ns + ":" + key;
  }

  var available = (function () {
    try {
      var probe = PREFIX + "__probe__";
      localStorage.setItem(probe, "1");
      localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  })();

  /** In-memory fallback so tools still work in private modes that block storage. */
  var memory = {};

  function rawGet(k) {
    return available ? localStorage.getItem(k) : (k in memory ? memory[k] : null);
  }
  function rawSet(k, v) {
    if (available) localStorage.setItem(k, v);
    else memory[k] = v;
  }
  function rawRemove(k) {
    if (available) localStorage.removeItem(k);
    else delete memory[k];
  }
  function rawKeys() {
    if (!available) return Object.keys(memory);
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(PREFIX) === 0) out.push(k);
    }
    return out;
  }

  var Store = {
    schema: SCHEMA,
    isPersistent: available,

    /** Read a JSON value. Returns `fallback` when absent or corrupt. */
    read: function (ns, key, fallback) {
      var raw = rawGet(fullKey(ns, key));
      if (raw === null) return fallback;
      try {
        var parsed = JSON.parse(raw);
        return parsed === null || parsed === undefined ? fallback : parsed;
      } catch (err) {
        console.warn("[Store] unreadable value at " + ns + ":" + key + ", using fallback", err);
        return fallback;
      }
    },

    /** Write a JSON value. Returns false when the browser refused (quota, etc). */
    write: function (ns, key, value) {
      try {
        rawSet(fullKey(ns, key), JSON.stringify(value));
        return true;
      } catch (err) {
        console.error("[Store] write failed for " + ns + ":" + key, err);
        return false;
      }
    },

    remove: function (ns, key) {
      rawRemove(fullKey(ns, key));
    },

    /** Every key stored by a namespace, without the prefix. */
    keys: function (ns) {
      var head = PREFIX + ns + ":";
      return rawKeys()
        .filter(function (k) { return k.indexOf(head) === 0; })
        .map(function (k) { return k.slice(head.length); });
    },

    /** Full backup of every tool, suitable for a file download. */
    exportAll: function () {
      var data = {};
      rawKeys().forEach(function (k) {
        var raw = rawGet(k);
        try { data[k.slice(PREFIX.length)] = JSON.parse(raw); }
        catch (err) { data[k.slice(PREFIX.length)] = raw; }
      });
      return {
        app: "agile-toolbox",
        schema: SCHEMA,
        exportedAt: new Date().toISOString(),
        data: data
      };
    },

    /**
     * Restore a backup produced by exportAll().
     * mode "merge" keeps existing keys not present in the backup;
     * mode "replace" wipes every atbx: key first.
     */
    importAll: function (payload, mode) {
      if (!payload || payload.app !== "agile-toolbox" || typeof payload.data !== "object") {
        throw new Error("This file is not an Agile Toolbox backup.");
      }
      if (payload.schema > SCHEMA) {
        throw new Error(
          "Backup schema v" + payload.schema + " is newer than this build (v" + SCHEMA + "). Update the toolbox first."
        );
      }
      if (mode === "replace") Store.clearAll();
      var count = 0;
      Object.keys(payload.data).forEach(function (suffix) {
        rawSet(PREFIX + suffix, JSON.stringify(payload.data[suffix]));
        count++;
      });
      return count;
    },

    clearAll: function () {
      rawKeys().forEach(rawRemove);
    },

    /** Rough footprint in bytes, for the "your data" panel. */
    usage: function () {
      return rawKeys().reduce(function (sum, k) {
        var v = rawGet(k) || "";
        return sum + k.length + v.length;
      }, 0);
    }
  };

  global.Store = Store;
})(window);
