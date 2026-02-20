"use strict";

/**
 * public/avatar/chat.js
 *
 * Nyx Chat Client (BROWSER)
 * v1.0.0 (BRIDGE HARDEN++++ + TOKEN HEADER x-sb-token++++ + SESSION PERSIST++++
 *         + LANE CONTRACT++++ + SAFE PATCH APPLY++++ + DIAG HOOKS++++)
 *
 * Responsibilities:
 *  - Own stable sessionId for the UI
 *  - Send messages to {apiBase}/api/chat
 *  - Include token header x-sb-token when provided
 *  - Preserve lane + laneId deterministically (from server)
 *  - Apply sessionPatch safely (allowlist)
 *  - Expose tiny hooks for avatar-host.html to render messages/chips/bridge
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
    // deterministic-enough for client session; not security-sensitive
    const a = Math.random().toString(16).slice(2);
    const b = Date.now().toString(16);
    return (prefix || "nyx") + "-" + b + "-" + a;
  }

  function pick(obj, keys) {
    const out = {};
    if (!obj || typeof obj !== "object") return out;
    for (const k of keys) if (k in obj) out[k] = obj[k];
    return out;
  }

  // Allowlist of session patch fields the UI is allowed to persist locally.
  // This mirrors your backend intent: stable routing + bridge markers only.
  const PATCH_KEYS = new Set([
    "lane", "lastLane", "laneId", "laneAt",
    "lastBridgeAt", "lastBridgeReason", "lastBridgeFrom", "lastBridgeTo",
    "budget", "mode", "intent", "stage",
    "__nyxVelvet", "__nyxMeta"
  ]);

  function applySessionPatch(session, patch) {
    if (!patch || typeof patch !== "object") return session;
    const s = session && typeof session === "object" ? session : {};
    for (const k of Object.keys(patch)) {
      if (!PATCH_KEYS.has(k)) continue;
      s[k] = patch[k];
    }
    return s;
  }

  // -------------------------
  // Config bootstrap
  // -------------------------
  function readQueryCfg() {
    const q = new URLSearchParams(global.location.search || "");
    const cfg = {};
    if (q.get("apiBase")) cfg.apiBase = q.get("apiBase");
    if (q.get("token")) cfg.token = q.get("token");
    if (q.get("debug")) cfg.debug = q.get("debug") === "1" || q.get("debug") === "true";
    return cfg;
  }

  // Parent can provide window.NYX_CONFIG via postMessage or direct injection.
  function getCfg() {
    const fromWindow = (global.NYX_CONFIG && typeof global.NYX_CONFIG === "object")
      ? global.NYX_CONFIG
      : null;

    const fromQuery = readQueryCfg();

    const cfg = Object.assign({}, fromQuery, fromWindow || {});
    // default apiBase to same origin if not set
    if (!cfg.apiBase) cfg.apiBase = global.location.origin;
    return cfg;
  }

  function normalizeBase(base) {
    if (!base) return "";
    return String(base).replace(/\/+$/, "");
  }

  // -------------------------
  // State
  // -------------------------
  const STORAGE_KEY = "nyx.chat.state.v1";
  const cfg = getCfg();

  function loadState() {
    const raw = global.localStorage ? global.localStorage.getItem(STORAGE_KEY) : null;
    const st = raw ? safeJsonParse(raw) : null;
    if (st && typeof st === "object") return st;
    return {
      sessionId: uid("nyx"),
      lane: "general",
      laneId: null,
      session: {},           // local cached session patch subset
      lastOkAt: 0
    };
  }

  function saveState(st) {
    try {
      if (!global.localStorage) return;
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(st));
    } catch (_) {}
  }

  const state = loadState();

  // -------------------------
  // Diagnostics
  // -------------------------
  function logDebug() {
    if (!cfg.debug) return;
    // eslint-disable-next-line no-console
    console.log.apply(console, arguments);
  }

  // -------------------------
  // Network
  // -------------------------
  async function postJson(url, body, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Math.max(3000, timeoutMs || 12000));

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json"
    };

    // Token header (your backend expects x-sb-token)
    if (cfg.token) headers["x-sb-token"] = cfg.token;

    // Optional back-compat headers if you still accept them elsewhere
    if (cfg.token) headers["Authorization"] = "Bearer " + cfg.token;

    let resp, text;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body || {}),
        signal: ctrl.signal,
        credentials: "omit",
        cache: "no-store"
      });
      text = await resp.text();
    } finally {
      clearTimeout(t);
    }

    const json = safeJsonParse(text);
    return { resp, text, json };
  }

  // -------------------------
  // Public API for avatar-host.html
  // -------------------------
  async function sendMessage(userText, opts) {
    const o = opts && typeof opts === "object" ? opts : {};

    // Keep lane stable unless caller overrides (chips / route)
    const lane = o.lane || state.lane || "general";

    const body = {
      message: String(userText || ""),
      sessionId: state.sessionId,

      // routing/intent signals (optional)
      lane,
      action: o.action || null,
      chip: o.chip || null,
      route: o.route || null,

      // allow sending minimal session context if backend uses it
      session: state.session || {}
    };

    const apiBase = normalizeBase(cfg.apiBase);
    const url = apiBase + "/api/chat";

    logDebug("[chat.js] POST", url, body);

    const { resp, json, text } = await postJson(url, body, o.timeoutMs || 12000);

    // hard fail if not json
    if (!json || typeof json !== "object") {
      const err = new Error("Non-JSON response from /api/chat");
      err.status = resp ? resp.status : 0;
      err.body = text;
      throw err;
    }

    // Update state from server contract (authoritative)
    if (json.lane) state.lane = json.lane;
    if (json.laneId) state.laneId = json.laneId;

    // Apply safe patch subset if provided
    if (json.sessionPatch) {
      state.session = applySessionPatch(state.session, json.sessionPatch);
      // keep lane/laneId in sync if patch includes it
      if (state.session.lane) state.lane = state.session.lane;
      if (state.session.laneId) state.laneId = state.session.laneId;
    }

    state.lastOkAt = nowMs();
    saveState(state);

    // Return the full server payload to avatar-host for rendering
    return json;
  }

  function getState() {
    return {
      sessionId: state.sessionId,
      lane: state.lane,
      laneId: state.laneId,
      session: state.session || {},
      apiBase: cfg.apiBase,
      debug: !!cfg.debug
    };
  }

  function resetSession(hard) {
    // hard resets sessionId so backend treats it as a fresh convo
    if (hard) state.sessionId = uid("nyx");
    state.lane = "general";
    state.laneId = null;
    state.session = {};
    state.lastOkAt = 0;
    saveState(state);
  }

  // Expose under global.NyxChat
  global.NyxChat = {
    sendMessage,
    getState,
    resetSession
  };

  logDebug("[chat.js] ready", getState());
})(window);
