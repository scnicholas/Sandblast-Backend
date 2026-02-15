// avatar-bridge.js
// Nyx Avatar Bridge — RESEND ENTIRE FILE
"use strict";

/**
 * Nyx Avatar Bridge
 *
 * v0.8.2 (HOST-AWARE++++ + NO TOKEN LEAK++++ + NO DOUBLE-HANDSHAKE++++ + FETCH WRAP GUARD++++)
 *
 * Why this update:
 * ✅ Your avatar-host.html now owns the secure handshake (nonce + anchored parent allowlist + closure token).
 * ✅ This bridge must NOT fight that handshake or require a token it can’t/shouldn’t see.
 *
 * Changes in v0.8.2:
 * ✅ HOST-AWARE: listens for nyx:config from avatar-host and uses NYX_API_BASE if provided
 * ✅ NO DOUBLE-HANDSHAKE: NYX_CONFIG handling becomes legacy-only (opt-in), so host is the authority
 * ✅ NO TOKEN LEAK: NYX_ACK no longer sends token back (ever)
 * ✅ ORIGIN LOCK: locks to first valid parent origin for consciousness/lifecycle packets (post-host config)
 * ✅ TOKEN OPTIONAL: if a token is present + expectedToken latched (legacy), enforce it; otherwise origin-lock only
 * ✅ FETCH WRAP GUARD: avoids wrapping twice when host already patched fetch (prefers NYX_FETCH when available)
 *
 * Keeps:
 * ✅ Deterministic presence (TURN_START/END + inflight + netPending)
 * ✅ Settle polish (audio ended + pending drops to 0 + delay) + settleHint into controller + shell.triggerSettle
 * ✅ visibility pause/resume
 * ✅ ObjectURL revocation (no leaks)
 * ✅ Protocol versioning (v:1)
 * ✅ Presence HUD split (final vs hint)
 * ✅ Audio fail-soft + speaking truth
 * ✅ Marion→Nyx UI bridge (setMarionCog, setLane, setUrls)
 * ✅ Host controls binding fix (button[data-act] direct binding)
 */

(function () {
  if (!window.NyxAvatarShell) throw new Error("NyxAvatarShell missing");
  if (!window.AvatarController) throw new Error("AvatarController missing");

  // =========================
  // Protocol
  // =========================
  const PROTOCOL_VERSION = 1;

  // =========================
  // Security + Config
  // =========================
  const SECURITY = {
    // Bridge-level allowlist (host already enforces anchored allowlist; keep this aligned + tight).
    allowedOrigins: [
      "https://sandblast.channel",
      "https://www.sandblast.channel",
    ],

    // Legacy mode only (host no longer exposes token to window)
    expectedToken: "",

    // Enforce means: if expectedToken exists, require it; otherwise origin-lock only.
    enforce: true,
  };

  const CONFIG = {
    apiBase: "",         // e.g. https://sandblast-backend.onrender.com
    configuredAt: 0,
    parentOrigin: "",    // locked parent origin (for consciousness/lifecycle packets)
    hostConfigSeen: false,
  };

  function safeStr(x) { return x == null ? "" : String(x); }
  const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

  function isTokenPlausible(t) {
    t = safeStr(t).trim();
    return t.length >= 12;
  }

  function isAllowedOrigin(origin) {
    const o = safeStr(origin);
    const list = SECURITY.allowedOrigins || [];
    for (let i = 0; i < list.length; i++) {
      if (o === list[i]) return true;
    }
    return false;
  }

  // Origin logic:
  // - if CONFIG.parentOrigin is set, require exact match
  // - otherwise, require allowlist (tight) for embedded parents
  function okOrigin(ev) {
    const o = safeStr(ev && ev.origin);
    if (!o || o === "null") return false;
    if (CONFIG.parentOrigin) return o === CONFIG.parentOrigin;
    return isAllowedOrigin(o);
  }

  // Token logic:
  // - If expectedToken is set (legacy), require match when enforce=true
  // - If expectedToken is empty (host-owned token), DO NOT block packets; rely on origin lock
  function okToken(payload) {
    if (!SECURITY.enforce) return true;

    // Host-owned mode (preferred): no token visible here.
    if (!SECURITY.expectedToken) return true;

    const got = safeStr(payload && payload.token).trim();
    return !!(got && got === SECURITY.expectedToken);
  }

  // =========================
  // Mount shell (wrapper-safe)
  // =========================
  const mountEl =
    document.getElementById("nyxShellMount") ||
    document.getElementById("avatarRoot") ||
    document.body;

  const shellInstance = window.NyxAvatarShell.mount(mountEl);

  // Normalize shell surface to a stable contract
  const SHELL = (function normalizeShell() {
    const api = {
      applyDirective: function () {},
      triggerSettle: function () {},
      destroy: function () {},
    };

    api.applyDirective = function (d) {
      try {
        if (window.NyxAvatarShell && typeof window.NyxAvatarShell.applyDirective === "function") {
          window.NyxAvatarShell.applyDirective(d);
          return;
        }
        if (shellInstance && typeof shellInstance.applyDirective === "function") {
          shellInstance.applyDirective(d);
          return;
        }
        if (shellInstance && typeof shellInstance.apply === "function") {
          shellInstance.apply(d);
          return;
        }
      } catch (_) {}
    };

    api.triggerSettle = function () {
      try {
        if (window.NyxAvatarShell && typeof window.NyxAvatarShell.triggerSettle === "function") {
          window.NyxAvatarShell.triggerSettle();
          return;
        }
        if (shellInstance && typeof shellInstance.triggerSettle === "function") {
          shellInstance.triggerSettle();
          return;
        }
      } catch (_) {}
    };

    api.destroy = function () {
      try {
        if (shellInstance && typeof shellInstance.destroy === "function") {
          shellInstance.destroy();
        }
      } catch (_) {}
    };

    return api;
  })();

  // Ensure controller binds host UI events (if it supports it)
  try {
    if (window.AvatarController && typeof window.AvatarController.bindHostEvents === "function") {
      window.AvatarController.bindHostEvents();
    }
  } catch (_) {}

  // =========================
  // HUD (fail-soft)
  // =========================
  const hud = {
    presenceFinal: document.getElementById("hudPresence"),
    presenceHint: document.getElementById("hudPresenceHint"),
    stage: document.getElementById("hudStage"),
    dom: document.getElementById("hudDom"),
    velvet: document.getElementById("hudVelvet"),
    anim: document.getElementById("hudAnim"),
    amp: document.getElementById("hudAmp"),
    net: document.getElementById("hudNet"),
    hs: document.getElementById("hudHandshake"),
    origin: document.getElementById("hudOrigin"),
    token: document.getElementById("hudToken"),
  };

  function hudSet(el, v) {
    if (el) el.textContent = String(v);
  }

  function hudInitSecurity() {
    try {
      if (hud.origin) hudSet(hud.origin, CONFIG.parentOrigin ? ("lock@" + CONFIG.parentOrigin) : "whitelist");
      if (hud.token) hudSet(hud.token, SECURITY.expectedToken ? "set" : "—");
    } catch (_) {}
  }
  hudInitSecurity();

  // =========================
  // State
  // =========================
  const state = {
    presence: "idle",
    stage: "warm",
    dominance: "neutral",
    velvet: false,

    speaking: false,
    amplitude: 0,

    lane: "general",
    topic: "unknown",

    // sniffed network pending (fetch/xhr)
    netPending: 0,

    // deterministic inflight from parent lifecycle
    inflight: 0,

    audioArmed: false,

    inlet: {
      hintPresence: "",
      lastPacket: null,
      lastCog: null,
      lastUrls: null,
    },

    diag: {
      lastPresence: "idle",
      lastFetchAt: 0,
      lastChatAt: 0,
      lastTtsAt: 0,
      settleDueAt: 0,
      settleHint: false,
      visible: true,
    },
  };

  // =========================
  // Utils
  // =========================
  function normPresence(p) {
    p = safeStr(p).toLowerCase();
    return p === "idle" || p === "listening" || p === "thinking" || p === "speaking" ? p : "";
  }

  function normStage(s) {
    s = safeStr(s).toLowerCase();
    return s === "boot" || s === "warm" || s === "engaged" ? s : "";
  }

  function normDom(d) {
    d = safeStr(d).toLowerCase();
    return d === "soft" || d === "neutral" || d === "firm" ? d : "";
  }

  function normLane(l) {
    l = safeStr(l).toLowerCase();
    return (l === "general" || l === "music" || l === "roku" || l === "schedule" || l === "radio") ? l : "";
  }

  function incNet() { state.netPending = Math.max(0, (state.netPending | 0) + 1); }
  function decNet() { state.netPending = Math.max(0, (state.netPending | 0) - 1); }
  function incInflight() { state.inflight = Math.max(0, (state.inflight | 0) + 1); }
  function decInflight() { state.inflight = Math.max(0, (state.inflight | 0) - 1); }

  function effectivePending() {
    return Math.max(0, (state.netPending | 0) + (state.inflight | 0));
  }

  // =========================
  // Host config awareness (IMPORTANT)
  // =========================
  function syncFromHostConfig(detail) {
    try {
      // avatar-host exposes NYX_API_BASE and NYX_CONFIG (no token).
      if (window.NYX_API_BASE && typeof window.NYX_API_BASE === "string") {
        CONFIG.apiBase = safeStr(window.NYX_API_BASE).trim().replace(/\/+$/, "");
      } else if (detail && detail.apiBase) {
        CONFIG.apiBase = safeStr(detail.apiBase).trim().replace(/\/+$/, "");
      }

      CONFIG.configuredAt = Date.now();
      CONFIG.hostConfigSeen = true;

      // HUD hint only (host owns real parent lock and token)
      if (hud.hs) hudSet(hud.hs, "host_config@" + new Date().toLocaleTimeString());
      if (hud.token) hudSet(hud.token, "host");
    } catch (_) {}
  }

  try {
    window.addEventListener("nyx:config", function (ev) {
      syncFromHostConfig(ev && ev.detail);
    });
    // If host already exposed config before this bridge loaded:
    if (window.NYX_CONFIG) syncFromHostConfig(window.NYX_CONFIG);
  } catch (_) {}

  // =========================
  // Audio (fail-soft)
  // =========================
  const audioEl = document.getElementById("nyxAudio") || null;
  let audioCtx = null;
  let analyser = null;
  let freqBuf = null;
  let lastObjectUrl = "";

  function revokeObjectUrl() {
    if (lastObjectUrl) {
      try { URL.revokeObjectURL(lastObjectUrl); } catch (_) {}
      lastObjectUrl = "";
    }
  }

  function armAudio() {
    if (!audioEl) return false;
    if (state.audioArmed) return true;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;

    try {
      audioCtx = new Ctx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;

      const src = audioCtx.createMediaElementSource(audioEl);
      src.connect(analyser);
      analyser.connect(audioCtx.destination);

      freqBuf = new Uint8Array(analyser.frequencyBinCount);
      state.audioArmed = true;
      return true;
    } catch (_) {
      audioCtx = null;
      analyser = null;
      freqBuf = null;
      state.audioArmed = false;
      return false;
    }
  }

  function computeRms(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i] / 255;
      sum += x * x;
    }
    return Math.sqrt(sum / (buf.length || 1));
  }

  function isAudioPlaying() {
    if (!audioEl) return false;
    return !audioEl.paused && !audioEl.ended && audioEl.readyState >= 2;
  }

  function scheduleSettleSoon(delayMs) {
    const t = Date.now() + Math.max(0, delayMs | 0);
    state.diag.settleDueAt = Math.max(state.diag.settleDueAt || 0, t);
  }

  function audioTick() {
    if (!audioEl) return;

    const playing = isAudioPlaying();

    if (playing && analyser && freqBuf) {
      try {
        analyser.getByteFrequencyData(freqBuf);
        state.amplitude = clamp01(computeRms(freqBuf) * 1.35);
      } catch (_) {
        state.amplitude = Math.max(state.amplitude * 0.9, 0.08);
      }
      state.speaking = true;
    } else if (playing) {
      state.amplitude = Math.max(state.amplitude * 0.92, 0.10);
      state.speaking = true;
    } else {
      state.amplitude *= 0.88;
      if (state.amplitude < 0.02) state.amplitude = 0;
      state.speaking = false;
    }
  }

  if (audioEl) {
    audioEl.addEventListener("ended", () => {
      revokeObjectUrl();
      state.diag.settleHint = true;
      scheduleSettleSoon(0);
    });
    audioEl.addEventListener("error", revokeObjectUrl);
    window.addEventListener("beforeunload", revokeObjectUrl);
  }

  // =========================
  // Presence arbitration
  // =========================
  function computePresence() {
    if (isAudioPlaying()) return "speaking";
    if (effectivePending() > 0) return "thinking";
    return normPresence(state.inlet.hintPresence) || "idle";
  }

  function reconcileStage(p) {
    if (p === "speaking" || p === "listening" || p === "thinking") return "engaged";
    return state.stage === "boot" ? "warm" : state.stage;
  }

  // =========================
  // Marion/Consciousness inlet
  // =========================
  function applyConsciousness(packet) {
    if (!packet || packet.v !== PROTOCOL_VERSION) return;

    const sp = packet.sessionPatch && packet.sessionPatch.__spine;

    const nextLane = normLane(packet.lane || (sp && sp.lane)) || state.lane;
    const nextTopic = safeStr(packet.topic || (sp && sp.topic) || state.topic);

    state.lane = nextLane;
    state.topic = nextTopic;

    state.stage = normStage(packet.stage) || normStage(sp && sp.stage) || state.stage;

    state.dominance =
      normDom(packet.dominance) ||
      normDom(packet.cog && packet.cog.dominance) ||
      state.dominance;

    state.velvet = typeof packet.velvet === "boolean" ? packet.velvet : state.velvet;

    state.inlet.hintPresence =
      normPresence(packet.presence) ||
      normPresence(packet.hintPresence) ||
      "";

    // SAFE summary (no raw user text)
    state.inlet.lastPacket = {
      lane: state.lane,
      topic: state.topic,
      stage: state.stage,
      dominance: state.dominance,
      velvet: state.velvet,
      hintPresence: state.inlet.hintPresence,
    };

    // pass structured cognition + urls into UI controller (fail-open)
    try {
      if (packet.cog && typeof window.AvatarController.setMarionCog === "function") {
        window.AvatarController.setMarionCog(packet.cog);
        state.inlet.lastCog = { ok: true, keys: Object.keys(packet.cog || {}).slice(0, 24) };
      }
    } catch (_) {
      state.inlet.lastCog = { ok: false };
    }

    try {
      const urls = packet.urls && typeof packet.urls === "object" ? packet.urls : null;
      if (urls && typeof window.AvatarController.setUrls === "function") {
        window.AvatarController.setUrls(urls);
        state.inlet.lastUrls = { ok: true };
      }
    } catch (_) {
      state.inlet.lastUrls = { ok: false };
    }

    try {
      if (typeof window.AvatarController.setLane === "function") {
        window.AvatarController.setLane(state.lane);
      }
    } catch (_) {}
  }

  // =========================
  // Legacy config inlet (NYX_CONFIG) — HOST IS AUTHORITY NOW
  // =========================
  // If you still send NYX_CONFIG to this bridge directly (older hosts),
  // we will accept it ONCE and lock origin, BUT we will NOT leak token in ACK.
  function applyLegacyConfig(payload, origin, evSource) {
    const p = payload && typeof payload === "object" ? payload : {};
    const o = safeStr(origin);
    if (!o || o === "null") return false;

    // token rotation (required for legacy config)
    const token = safeStr(p.token).trim();
    if (!isTokenPlausible(token)) return false;

    // apiBase (required)
    const apiBase = safeStr(p.apiBase).trim().replace(/\/+$/, "");
    if (!apiBase || !apiBase.startsWith("http")) return false;

    if (typeof p.enforce === "boolean") SECURITY.enforce = p.enforce;

    // allowedOrigins (optional)
    if (Array.isArray(p.allowedOrigins) && p.allowedOrigins.length) {
      const cleaned = [];
      for (let i = 0; i < p.allowedOrigins.length; i++) {
        const v = String(p.allowedOrigins[i] || "").trim();
        if (v && v.startsWith("http")) cleaned.push(v);
      }
      if (cleaned.length) SECURITY.allowedOrigins = cleaned;
    }

    // latch token + apiBase
    SECURITY.expectedToken = token;
    CONFIG.apiBase = apiBase;
    CONFIG.configuredAt = Date.now();

    // LOCK parent origin on first successful legacy config
    if (!CONFIG.parentOrigin) CONFIG.parentOrigin = o;

    // Optional: url hints (pass-through)
    try {
      if (p.urls && typeof p.urls === "object" && typeof window.AvatarController.setUrls === "function") {
        window.AvatarController.setUrls(p.urls);
      }
    } catch (_) {}

    // HUD
    try {
      if (hud.hs) hudSet(hud.hs, "legacy_config@" + new Date().toLocaleTimeString());
      if (hud.origin) hudSet(hud.origin, "lock@" + safeStr(CONFIG.parentOrigin).slice(0, 64));
      if (hud.token) hudSet(hud.token, "legacy");
    } catch (_) {}

    // ACK back to parent (NO TOKEN LEAK)
    try {
      const target = CONFIG.parentOrigin || o;
      const src = evSource || window.parent;
      if (src && typeof src.postMessage === "function") {
        src.postMessage(
          {
            type: "NYX_ACK",
            payload: {
              ok: true,
              v: PROTOCOL_VERSION,
              apiBase: CONFIG.apiBase,
              host: window.location.origin,
              lockedOrigin: CONFIG.parentOrigin || "",
              mode: "legacy",
            },
          },
          target
        );
      }
    } catch (_) {}

    return true;
  }

  // =========================
  // postMessage (secure + lifecycle)
  // =========================
  window.addEventListener("message", (ev) => {
    const d = ev && ev.data;
    if (!d || typeof d !== "object") return;

    // 1) Legacy NYX_CONFIG handling (only if host config not seen yet)
    if (d.type === "NYX_CONFIG") {
      // If host already configured, ignore to prevent double-handshake fights.
      if (CONFIG.hostConfigSeen) return;

      const origin = safeStr(ev.origin);
      if (!origin || origin === "null") return;

      // If already locked, require exact match.
      if (CONFIG.parentOrigin && origin !== CONFIG.parentOrigin) return;

      const pl = d.payload || {};
      const token = safeStr(pl.token).trim();
      const apiBase = safeStr(pl.apiBase).trim();
      if (!isTokenPlausible(token)) return;
      if (!apiBase || !apiBase.startsWith("http")) return;

      applyLegacyConfig(pl, origin, ev.source);
      return;
    }

    // 2) For all other packets: require origin lock/allowlist
    if (!okOrigin(ev)) return;

    // Lock parent origin on first valid post-config message (host mode)
    if (!CONFIG.parentOrigin) {
      CONFIG.parentOrigin = safeStr(ev.origin);
      try {
        if (hud.origin) hudSet(hud.origin, "lock@" + safeStr(CONFIG.parentOrigin).slice(0, 64));
      } catch (_) {}
    }

    // 3) Token optional (host mode) / enforced (legacy mode)
    if (!okToken(d.payload)) return;

    if (d.type === "NYX_PING") {
      try {
        ev.source.postMessage(
          { type: "NYX_PONG", payload: { t: Date.now(), v: PROTOCOL_VERSION } },
          ev.origin
        );
      } catch (_) {}
      return;
    }

    if (d.type === "NYX_CONSCIOUSNESS") {
      applyConsciousness(d.payload);
      return;
    }

    // Deterministic lifecycle
    if (d.type === "NYX_TURN_START") {
      incInflight();
      return;
    }
    if (d.type === "NYX_TURN_END") {
      decInflight();
      scheduleSettleSoon(180);
      return;
    }
  });

  // =========================
  // Fetch/XHR sniffing + API_BASE routing (GUARDED)
  // =========================
  function sniffUrl(u) {
    const url = safeStr(u);
    return {
      isChat: /\/api\/chat\b/i.test(url),
      isTts: /\/api\/(tts|voice)\b/i.test(url),
    };
  }

  function rewriteToApiBase(url) {
    const u = safeStr(url);
    const base = safeStr(CONFIG.apiBase || window.NYX_API_BASE || "").trim().replace(/\/+$/, "");
    if (!base) return u;
    if (u.startsWith("/api/")) return base + u;
    return u;
  }

  // Prefer host-provided NYX_FETCH if present; otherwise wrap fetch once.
  const HOST_FETCH = (typeof window.NYX_FETCH === "function") ? window.NYX_FETCH : null;

  if (!window.__NYX_BRIDGE_FETCH_WRAPPED__ && window.fetch && !HOST_FETCH) {
    window.__NYX_BRIDGE_FETCH_WRAPPED__ = true;
    const _fetch = window.fetch.bind(window);

    window.fetch = async function (input, init) {
      let url = typeof input === "string" ? input : (input && input.url) || "";
      const { isChat, isTts } = sniffUrl(url);

      if (isChat || isTts) {
        incNet();
        state.diag.lastFetchAt = Date.now();
        if (isChat) state.diag.lastChatAt = state.diag.lastFetchAt;
        if (isTts) state.diag.lastTtsAt = state.diag.lastFetchAt;
      }

      // Route relative /api/* to CONFIG.apiBase
      try {
        if (typeof input === "string") {
          url = rewriteToApiBase(url);
          input = url;
        } else if (input && input.url && String(input.url).startsWith("/api/")) {
          const newUrl = rewriteToApiBase(String(input.url));
          try { input = new Request(newUrl, input); } catch (_) {}
        }
      } catch (_) {}

      try {
        const res = await _fetch(input, init);

        // If TTS returns audio, play it (fail-soft)
        if (isTts && audioEl) {
          const ct = (res.headers && res.headers.get) ? (res.headers.get("content-type") || "") : "";
          if (ct.includes("audio")) {
            try {
              revokeObjectUrl();
              const blob = await res.clone().blob();
              lastObjectUrl = URL.createObjectURL(blob);
              audioEl.src = lastObjectUrl;
              if (state.audioArmed) audioEl.play().catch(() => {});
            } catch (_) {}
          }
        }

        return res;
      } finally {
        if (isChat || isTts) {
          decNet();
          if (effectivePending() === 0) scheduleSettleSoon(180);
        }
      }
    };
  }

  // XHR wrap only if not already wrapped; OK even if host patched fetch.
  if (!window.__NYX_BRIDGE_XHR_WRAPPED__ && window.XMLHttpRequest) {
    window.__NYX_BRIDGE_XHR_WRAPPED__ = true;
    const XHR = window.XMLHttpRequest;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try {
        this.__nyx_url = safeStr(url || "");
        this.__nyx_sniff = sniffUrl(this.__nyx_url);
        if (this.__nyx_url.startsWith("/api/") && (CONFIG.apiBase || window.NYX_API_BASE)) {
          this.__nyx_url = rewriteToApiBase(this.__nyx_url);
          return origOpen.call(this, method, this.__nyx_url);
        }
      } catch (_) {}
      return origOpen.apply(this, arguments);
    };

    XHR.prototype.send = function () {
      const sniff = this.__nyx_sniff || { isChat: false, isTts: false };
      if (sniff.isChat || sniff.isTts) incNet();

      const done = () => {
        if (sniff.isChat || sniff.isTts) {
          decNet();
          if (effectivePending() === 0) scheduleSettleSoon(180);
        }
      };

      try {
        this.addEventListener("loadend", done, { once: true });
      } catch (_) {
        setTimeout(done, 5000);
      }

      return origSend.apply(this, arguments);
    };
  }

  // =========================
  // Host controls (fixed binding)
  // =========================
  function setHintPresence(p) {
    state.inlet.hintPresence = normPresence(p) || "idle";
  }

  function hostFetchChat(text) {
    try {
      const base = safeStr(CONFIG.apiBase || window.NYX_API_BASE || "").trim().replace(/\/+$/, "");
      const url = (base ? (base + "/api/chat") : "/api/chat");
      const f = HOST_FETCH || window.fetch;
      return f(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: safeStr(text || "ping"), sessionId: "avatar-host" }),
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function hostFetchTts(text) {
    try {
      const base = safeStr(CONFIG.apiBase || window.NYX_API_BASE || "").trim().replace(/\/+$/, "");
      const url = (base ? (base + "/api/tts") : "/api/tts");
      const f = HOST_FETCH || window.fetch;
      return f(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: safeStr(text || "Nyx test."), voice: "nyx" }),
      });
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function bindControls() {
    if (bindControls._bound) return;
    bindControls._bound = true;

    document.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("button[data-act]") : null;
      if (!btn) return;
      const act = btn.getAttribute("data-act") || "";

      if (act === "armAudio") {
        armAudio();
        if (hud.hs) hudSet(hud.hs, "audio=" + (state.audioArmed ? "1" : "0"));
        return;
      }
      if (act === "idle") { setHintPresence("idle"); return; }
      if (act === "listen") { setHintPresence("listening"); return; }
      if (act === "think") { setHintPresence("thinking"); return; } // legacy support
      if (act === "speak") { setHintPresence("speaking"); return; }
      if (act === "toggleVelvet") {
        state.velvet = !state.velvet;
        try {
          if (typeof window.AvatarController.setMarionCog === "function") {
            window.AvatarController.setMarionCog({ tone: state.velvet ? "velvet" : "neutral", stage: state.stage });
          }
        } catch (_) {}
        return;
      }

      if (act === "sendChat") {
        const ta = document.getElementById("prompt");
        const txt = ta ? ta.value : "ping";
        hostFetchChat(txt).catch(() => {});
        return;
      }
      if (act === "speakText") {
        const ta = document.getElementById("prompt");
        const txt = ta ? ta.value : "Nyx test.";
        hostFetchTts(txt).catch(() => {});
        return;
      }

      if (act === "testCHAT") { hostFetchChat("ping").catch(() => {}); return; }
      if (act === "testTTS") { hostFetchTts("Nyx test.").catch(() => {}); return; }
    }, { passive: true });
  }
  bindControls();

  // =========================
  // Visibility pause
  // =========================
  let rafId = 0;

  function onVisibility() {
    state.diag.visible = !document.hidden;
    if (state.diag.visible) {
      if (!rafId) rafId = requestAnimationFrame(tick);
      if (hud.hs) hudSet(hud.hs, "resume");
    } else {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      if (hud.hs) hudSet(hud.hs, "pause");
    }
  }

  document.addEventListener("visibilitychange", onVisibility, { passive: true });

  // =========================
  // Render loop
  // =========================
  let prevDirective = null;

  function maybeSettle(now) {
    if (state.diag.settleDueAt && now >= state.diag.settleDueAt) {
      state.diag.settleHint = true;
      state.diag.settleDueAt = 0;
    }
  }

  function tick() {
    rafId = 0;
    if (document.hidden) return;

    audioTick();

    const now = Date.now();
    maybeSettle(now);

    state.presence = computePresence();
    state.stage = reconcileStage(state.presence);

    const d = window.AvatarController.computeDirective(
      {
        presence: state.presence,
        stage: state.stage,
        dominance: state.dominance,
        velvet: state.velvet,
        speaking: state.speaking,
        amplitude: state.amplitude,
        lane: state.lane,
        topic: state.topic,
        netPending: effectivePending(),
        t: now,
        settleHint: !!state.diag.settleHint,
      },
      prevDirective
    );

    state.diag.settleHint = false;
    prevDirective = d;

    SHELL.applyDirective(d);

    if (d && d.settle) {
      SHELL.triggerSettle();
    }

    hudSet(hud.presenceFinal, state.presence);
    hudSet(hud.presenceHint, state.inlet.hintPresence);
    hudSet(hud.stage, state.stage);
    hudSet(hud.dom, state.dominance);
    hudSet(hud.velvet, state.velvet ? "1" : "0");
    hudSet(hud.amp, state.amplitude.toFixed(2));
    hudSet(hud.net, effectivePending());
    if (hud.anim && d && d.animSet) hudSet(hud.anim, d.animSet);

    if (hud.hs && state.diag.lastPresence !== state.presence) {
      state.diag.lastPresence = state.presence;
      hudSet(hud.hs, "presence→" + state.presence);
    }

    rafId = requestAnimationFrame(tick);
  }

  // start
  onVisibility();

  // =========================
  // Public surface
  // =========================
  window.NyxAvatarBridge = {
    state,
    armAudio,
    applyConsciousness,
    __protocol: PROTOCOL_VERSION,
    __security: SECURITY,
    __config: CONFIG,
  };
})();
