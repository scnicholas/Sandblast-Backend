// avatar-embed-bridge.js
"use strict";

/**
 * Nyx Avatar Embed Bridge v1.1.0
 * - Exact parent-origin lock
 * - No wildcard postMessage target
 * - Uses the documented NyxAvatarBridge public API
 * - Heartbeat is bounded and pauses when the document is hidden
 */
(function () {
  const bridge = window.NyxAvatarBridge;
  if (!bridge) return;

  const safeStr = (x) => x == null ? "" : String(x);

  function originFromReferrer() {
    try {
      return document.referrer ? new URL(document.referrer).origin : "";
    } catch (_) {
      return "";
    }
  }

  function allowedOrigins() {
    const list = bridge.__security && Array.isArray(bridge.__security.allowedOrigins)
      ? bridge.__security.allowedOrigins
      : [];
    return list.filter((value) => /^https?:\/\//i.test(safeStr(value)));
  }

  let parentOrigin =
    safeStr(bridge.__config && bridge.__config.parentOrigin) ||
    originFromReferrer();

  function isAllowedOrigin(origin) {
    const value = safeStr(origin);
    if (!value || value === "null") return false;
    if (parentOrigin) return value === parentOrigin;
    return allowedOrigins().includes(value);
  }

  function lockOrigin(origin) {
    if (!parentOrigin && isAllowedOrigin(origin)) parentOrigin = origin;
    return !!parentOrigin;
  }

  function post(type, payload) {
    try {
      if (!parentOrigin || !window.parent || window.parent === window) return false;
      window.parent.postMessage({
        type,
        v: Number(bridge.__protocol) || 1,
        payload: payload && typeof payload === "object" ? payload : {}
      }, parentOrigin);
      return true;
    } catch (_) {
      return false;
    }
  }

  window.addEventListener("message", (ev) => {
    if (!ev || ev.source !== window.parent) return;
    if (!isAllowedOrigin(ev.origin) || !lockOrigin(ev.origin)) return;

    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.type === "NYX_CONSCIOUSNESS" &&
        typeof bridge.applyConsciousness === "function") {
      bridge.applyConsciousness(msg.payload || {});
      return;
    }

    if (msg.type === "NYX_SAY" &&
        typeof bridge.speakText === "function") {
      bridge.speakText(msg.payload && msg.payload.text).catch(() => {});
      return;
    }

    if (msg.type === "NYX_STOP_AUDIO" &&
        typeof bridge.stopAudio === "function") {
      bridge.stopAudio("embed_parent");
      return;
    }

    if (msg.type === "NYX_PRESENCE" &&
        typeof bridge.setPresence === "function") {
      bridge.setPresence(msg.payload && msg.payload.presence);
      return;
    }

    if (msg.type === "NYX_PING") {
      post("NYX_PONG", { at: Date.now() });
    }
  });

  if (parentOrigin && allowedOrigins().includes(parentOrigin)) {
    post("NYX_AVATAR_READY", { at: Date.now() });
  }

  let heartbeatId = 0;

  function stopHeartbeat() {
    if (heartbeatId) clearInterval(heartbeatId);
    heartbeatId = 0;
  }

  function startHeartbeat() {
    stopHeartbeat();
    if (document.hidden || !parentOrigin) return;
    heartbeatId = setInterval(() => {
      const s = bridge.state || {};
      post("NYX_AVATAR_STATE", {
        at: Date.now(),
        presence: safeStr(s.presence || "idle"),
        stage: safeStr(s.stage || "warm"),
        dominance: safeStr(s.dominance || "neutral"),
        velvet: !!s.velvet
      });
    }, 1500);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stopHeartbeat();
    else startHeartbeat();
  }, { passive: true });

  startHeartbeat();
})();
