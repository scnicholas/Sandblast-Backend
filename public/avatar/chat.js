"use strict";

/**
 * public/avatar/chat.js
 *
 * Nyx Chat Client (BROWSER)
 * v1.1.0 (PHASE1 INTEROP++++ + RUNTIME CONFIG++++ + TOKEN HEADER x-sb-token++++
 *         + SESSION PERSIST++++ + LANE CONTRACT++++ + SAFE PATCH APPLY++++
 *         + EVENT HOOKS++++ + DIAG HOOKS++++ + BACKEND FIELD COMPAT+++)
 *
 * Responsibilities:
 *  - Own stable sessionId for the UI
 *  - Send messages to {apiBase}/api/chat (configurable chatPath)
 *  - Include token header x-sb-token when provided (plus back-compat)
 *  - Preserve lane + laneId deterministically (authoritative from server)
 *  - Apply sessionPatch safely (allowlist)
 *  - Expose hooks/events for avatar-host.html to render messages/chips/bridge
 *
 * Phase 1 notes:
 *  - This file DOES NOT mount UI. Safe to load in both legacy and Phase1 hosts.
 *  - If window.NYX_DISABLE_LEGACY is true, no legacy init is performed (still provides API).
 */

(function (global) {
  // -------------------------
  // Helpers
  // -------------------------
  function nowMs() { return Date.now(); }

  function safeJsonParse(txt) {
    try { return JSON.parse(txt); } catch (_) { return null; }
  }

  function uid(prefix) {
    var a = Math.random().toString(16).slice(2);
    var b = Date.now().toString(16);
    return (prefix || "nyx") + "-" + b + "-" + a;
  }

  function pick(obj, keys) {
    var out = {};
    if (!obj || typeof obj !== "object") return out;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (k in obj) out[k] = obj[k];
    }
    return out;
  }

  function safeStr(x, max) {
    var s = (x === null || x === undefined) ? "" : String(x);
    if (max && s.length > max) s = s.slice(0, max);
    return s;
  }

  function normalizeBase(base) {
    if (!base) return "";
    return String(base).replace(/\/+$/, "");
  }

  // -------------------------
  // Allowlist of session patch fields
  // -------------------------
  var PATCH_KEYS = new Set([
    "lane", "lastLane", "laneId", "laneAt",
    "lastBridgeAt", "lastBridgeReason", "lastBridgeFrom", "lastBridgeTo",
    "budget", "mode", "intent", "stage",
    "__nyxVelvet", "__nyxMeta"
  ]);

  function applySessionPatch(session, patch) {
    if (!patch || typeof patch !== "object") return session;
    var s = (session && typeof session === "object") ? session : {};
    var ks = Object.keys(patch);
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      if (!PATCH_KEYS.has(k)) continue;
      s[k] = patch[k];
    }
    return s;
  }

  // -------------------------
  // Config bootstrap
  // -------------------------
  function readQueryCfg() {
    var q = new URLSearchParams(global.location.search || "");
    var cfg = {};
    if (q.get("apiBase")) cfg.apiBase = q.get("apiBase");
    if (q.get("token")) cfg.token = q.get("token");
    if (q.get("debug")) cfg.debug = (q.get("debug") === "1" || q.get("debug") === "true");
    if (q.get("chatPath")) cfg.chatPath = q.get("chatPath");
    if (q.get("context")) cfg.context = q.get("context");
    return cfg;
  }

  function getCfg() {
    var fromWindow = (global.NYX_CONFIG && typeof global.NYX_CONFIG === "object") ? global.NYX_CONFIG : null;
    var fromQuery = readQueryCfg();
    var cfg = Object.assign({}, fromQuery, fromWindow || {});
    if (!cfg.apiBase) cfg.apiBase = global.location.origin;
    if (!cfg.chatPath) cfg.chatPath = "/api/chat";
    return cfg;
  }

  var cfg = getCfg();

  function setCfg(partial) {
    if (!partial || typeof partial !== "object") return;
    if (typeof partial.apiBase === "string" && partial.apiBase.trim()) cfg.apiBase = partial.apiBase.trim();
    if (typeof partial.token === "string") cfg.token = partial.token;
    if (typeof partial.chatPath === "string" && partial.chatPath.trim()) cfg.chatPath = partial.chatPath.trim();
    if (typeof partial.debug === "boolean") cfg.debug = partial.debug;
    if (typeof partial.context === "string") cfg.context = partial.context;
  }

  // -------------------------
  // State (persisted)
  // -------------------------
  var STORAGE_KEY = "nyx.chat.state.v1";
  var VERSION = "v1.1.0";

  function loadState() {
    var raw = null;
    try { raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null; } catch (_) {}
    var st = raw ? safeJsonParse(raw) : null;
    if (st && typeof st === "object" && typeof st.sessionId === "string") return st;
    return {
      sessionId: uid("nyx"),
      lane: "general",
      laneId: null,
      session: {},
      lastOkAt: 0
    };
  }

  function saveState(st) {
    try {
      if (!global.localStorage) return;
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    } catch (_) {}
  }

  var state = loadState();

  // -------------------------
  // Hooks + events
  // -------------------------
  var hooks = { onRequest: null, onResponse: null, onError: null };
  var listeners = {}; // type -> [fn]

  function on(type, fn) {
    if (!type || typeof fn !== "function") return;
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(fn);
  }

  function emit(type, payload) {
    var list = listeners[type];
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (_) {}
    }
  }

  function logDebug() {
    if (!cfg.debug) return;
    // eslint-disable-next-line no-console
    console.log.apply(console, arguments);
  }

  // -------------------------
  // Network
  // -------------------------
  async function postJson(url, body, timeoutMs) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, Math.max(3000, timeoutMs || 12000));

    var headers = { "Content-Type": "application/json", "Accept": "application/json" };

    if (cfg.token) headers["x-sb-token"] = cfg.token;
    if (cfg.token) {
      headers["Authorization"] = "Bearer " + cfg.token;
      headers["X-API-Token"] = cfg.token;
    }

    if (typeof hooks.onRequest === "function") {
      try { hooks.onRequest({ url: url, body: body, headers: pick(headers, Object.keys(headers)) }); } catch (_) {}
    }
    emit("request", { url: url, body: body });

    var resp = null;
    var text = "";
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body || {}),
        signal: ctrl.signal,
        credentials: "omit",
        cache: "no-store"
      });
      text = await resp.text();
    } finally {
      clearTimeout(t);
    }

    var json = safeJsonParse(text);
    if (typeof hooks.onResponse === "function") {
      try { hooks.onResponse({ url: url, status: resp ? resp.status : 0, json: json }); } catch (_) {}
    }
    emit("response", { url: url, status: resp ? resp.status : 0, json: json });

    return { resp: resp, text: text, json: json };
  }

  function coerceReply(json) {
    if (!json || typeof json !== "object") return "";
    return safeStr(
      json.reply ||
      json.text ||
      json.message ||
      (json.data && (json.data.reply || json.data.text || json.data.message)) ||
      "",
      8000
    );
  }

  // -------------------------
  // Public API
  // -------------------------
  async function sendMessage(userText, opts) {
    var o = (opts && typeof opts === "object") ? opts : {};
    var lane = o.lane || state.lane || "general";
    var msg = String(userText || "");

    var body = {
      requestId: o.requestId || uid("req"),
      sessionId: state.sessionId,
      lane: lane,
      laneId: state.laneId || null,

      message: msg,
      text: msg,

      action: o.action || null,
      chip: o.chip || null,
      route: o.route || null,

      session: state.session || {},
      context: o.context || cfg.context || null,

      client: {
        source: o.source || "nyx_chat_js",
        v: VERSION
      }
    };

    var apiBase = normalizeBase(cfg.apiBase);
    var url = apiBase + (cfg.chatPath || "/api/chat");

    logDebug("[chat.js] POST", url, body);

    var res = await postJson(url, body, o.timeoutMs || 12000);
    var resp = res.resp;
    var json = res.json;
    var text = res.text;

    if (!json || typeof json !== "object") {
      var err = new Error("Non-JSON response from chat endpoint");
      err.status = resp ? resp.status : 0;
      err.body = text;
      if (typeof hooks.onError === "function") { try { hooks.onError(err); } catch (_) {} }
      emit("error", err);
      throw err;
    }

    if (json.lane) state.lane = json.lane;
    if (json.laneId) state.laneId = json.laneId;

    if (json.sessionPatch) {
      state.session = applySessionPatch(state.session, json.sessionPatch);
      if (state.session.lane) state.lane = state.session.lane;
      if (state.session.laneId) state.laneId = state.session.laneId;
    }

    state.lastOkAt = nowMs();
    saveState(state);

    json.__reply = coerceReply(json);
    json.__lane = state.lane;
    json.__laneId = state.laneId;
    json.__session = state.session || {};

    if (json.sessionPatch && (json.sessionPatch.lastBridgeAt || json.sessionPatch.lastBridgeReason)) {
      emit("bridge", {
        lane: state.lane,
        laneId: state.laneId,
        patch: pick(json.sessionPatch, Array.from(PATCH_KEYS))
      });
    }

    return json;
  }

  function getState() {
    return {
      sessionId: state.sessionId,
      lane: state.lane,
      laneId: state.laneId,
      session: state.session || {},
      apiBase: cfg.apiBase,
      chatPath: cfg.chatPath,
      tokenPresent: !!cfg.token,
      debug: !!cfg.debug,
      v: VERSION
    };
  }

  function resetSession(hard) {
    if (hard) state.sessionId = uid("nyx");
    state.lane = "general";
    state.laneId = null;
    state.session = {};
    state.lastOkAt = 0;
    saveState(state);
    emit("reset", { hard: !!hard, state: getState() });
  }

  function setHooks(nextHooks) {
    if (!nextHooks || typeof nextHooks !== "object") return;
    if (typeof nextHooks.onRequest === "function") hooks.onRequest = nextHooks.onRequest;
    if (typeof nextHooks.onResponse === "function") hooks.onResponse = nextHooks.onResponse;
    if (typeof nextHooks.onError === "function") hooks.onError = nextHooks.onError;
  }

  // -------------------------
  // Runtime NYX_CONFIG updates (postMessage)
  // -------------------------
  function maybeParseIncoming(data) {
    if (!data) return null;
    if (typeof data === "string") return safeJsonParse(data);
    if (typeof data === "object") return data;
    return null;
  }

  global.addEventListener("message", function (ev) {
    var data = maybeParseIncoming(ev && ev.data);
    if (!data || typeof data !== "object") return;
    if (data.type !== "NYX_CONFIG") return;
    if (data.config && typeof data.config === "object") {
      setCfg(data.config);
      emit("config", getState());
      logDebug("[chat.js] NYX_CONFIG applied", getState());
    }
  });

  // -------------------------
  // Expose
  // -------------------------
  global.NyxChat = {
    sendMessage: sendMessage,
    getState: getState,
    resetSession: resetSession,
    setHooks: setHooks,
    on: on,
    setConfig: setCfg
  };

  // No UI mount here. Intentionally empty.
  if (!global.NYX_DISABLE_LEGACY) {
    // placeholder for any future legacy-only init
  }

  logDebug("[chat.js] ready", getState());
})(window);
