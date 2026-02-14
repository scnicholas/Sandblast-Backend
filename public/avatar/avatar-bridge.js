// avatar-bridge.js
// Nyx Avatar Bridge (Standalone) — RESEND ENTIRE FILE
"use strict";

/**
 * Nyx Avatar Bridge (Standalone)
 *
 * v0.8.0 (MARION→UI BRIDGE + HOST CONTROL FIX + URL PASS-THROUGH)
 *
 * Keeps v0.7.0:
 *  ✅ PHASE H1: Public-ready security + config (NYX_CONFIG, origin whitelist, token rotation, apiBase, enforce)
 *  ✅ PHASE H2: Deterministic presence (TURN_START/END + inflight counter + netPending)
 *  ✅ PHASE H3: Settle polish (audio ended + pending drops to 0 + tiny delay) + settleHint into controller + shell.triggerSettle
 *  ✅ PHASE H4: visibility pause/resume
 *  ✅ ObjectURL revocation (no leaks)
 *  ✅ Fetch/XHR wrapping (guarded)
 *  ✅ Protocol versioning (v:1)
 *  ✅ Presence HUD split (final vs hint)
 *  ✅ Audio fail-soft + speaking truth
 *
 * Adds:
 *  ✅ Marion→Nyx UI bridge:
 *     - AvatarController.setMarionCog(packet.cog) (structured only)
 *     - AvatarController.setLane(lane)
 *     - AvatarController.setUrls(packet.urls) (schedule/radio/roku/music etc.)
 *  ✅ Fix host controls binding (no dependency on #controls wrapper)
 *     - Supports avatar-host.html actions: armAudio/idle/listen/speak/toggleVelvet/sendChat/speakText
 */

(function () {
  if (!window.NyxAvatarShell) throw new Error("NyxAvatarShell missing");
  if (!window.AvatarController) throw new Error("AvatarController missing");

  // =========================
  // Protocol
  // =========================
  const PROTOCOL_VERSION = 1;

  // =========================
  // Security + Config (H1)
  // =========================
  const SECURITY = {
    // Parent can tighten/replace via NYX_CONFIG.
    allowedOrigins: [
      window.location.origin,
      "https://sandblastchannel.com",
      "https://sandblast.channel",
    ],
    expectedToken: "dev-token-change-me",
    enforce: true,
  };

  const CONFIG = {
    apiBase: "",         // e.g. https://your-backend.onrender.com
    configuredAt: 0,
  };

  function safeStr(x) { return x == null ? "" : String(x); }
  const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

  function isAllowedOrigin(origin) {
    const o = String(origin || "");
    const list = SECURITY.allowedOrigins || [];
    for (let i = 0; i < list.length; i++) {
      if (o === list[i]) return true;
    }
    return false;
  }

  function okOrigin(ev) {
    if (!SECURITY.enforce) return true;
    return !!(ev && ev.origin && isAllowedOrigin(ev.origin));
  }

  function okToken(payload) {
    if (!SECURITY.enforce) return true;
    return !!(payload && payload.token && payload.token === SECURITY.expectedToken);
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
      if (hud.origin) hudSet(hud.origin, (SECURITY.allowedOrigins && SECURITY.allowedOrigins[0]) ? "whitelist" : "—");
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
      // H3: settle after audio ends
      state.diag.settleHint = true;
      scheduleSettleSoon(0);
    });
    audioEl.addEventListener("error", revokeObjectUrl);
    window.addEventListener("beforeunload", revokeObjectUrl);
  }

  // =========================
  // Presence arbitration (H2)
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

    // Store a SAFE summary (no raw user text)
    state.inlet.lastPacket = {
      lane: state.lane,
      topic: state.topic,
      stage: state.stage,
      dominance: state.dominance,
      velvet: state.velvet,
      hintPresence: state.inlet.hintPresence,
    };

    // NEW: pass structured cognition + urls into UI controller (fail-open)
    try {
      if (packet.cog && typeof window.AvatarController.setMarionCog === "function") {
        // structured object only — controller is responsible for not persisting raw text
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
  // Config inlet (H1)
  // =========================
  function applyConfig(payload, origin) {
    const p = payload && typeof payload === "object" ? payload : {};

    // allowedOrigins
    if (Array.isArray(p.allowedOrigins) && p.allowedOrigins.length) {
      const cleaned = [];
      for (let i = 0; i < p.allowedOrigins.length; i++) {
        const v = String(p.allowedOrigins[i] || "").trim();
        if (v && v.startsWith("http")) cleaned.push(v);
      }
      if (cleaned.length) SECURITY.allowedOrigins = cleaned;
    }

    // expected token rotation
    if (typeof p.token === "string" && p.token.trim().length >= 12) {
      SECURITY.expectedToken = p.token.trim();
    }

    // enforce toggle (optional)
    if (typeof p.enforce === "boolean") {
      SECURITY.enforce = p.enforce;
    }

    // apiBase
    if (typeof p.apiBase === "string") {
      const b = p.apiBase.trim();
      CONFIG.apiBase = (b && b.startsWith("http")) ? b.replace(/\/+$/, "") : "";
    }

    // Optional: url hints (pass-through to controller)
    try {
      if (p.urls && typeof p.urls === "object" && typeof window.AvatarController.setUrls === "function") {
        window.AvatarController.setUrls(p.urls);
      }
    } catch (_) {}

    CONFIG.configuredAt = Date.now();

    try {
      if (hud.hs) hudSet(hud.hs, "config@" + new Date().toLocaleTimeString());
      if (hud.origin) hudSet(hud.origin, "ok@" + safeStr(origin || "").slice(0, 28));
      if (hud.token) hudSet(hud.token, SECURITY.expectedToken ? "set" : "—");
    } catch (_) {}
  }

  // =========================
  // postMessage (secure + handshake + lifecycle) (H1/H2)
  // =========================
  window.addEventListener("message", (ev) => {
    const d = ev && ev.data;
    if (!d || typeof d !== "object") return;

    // Allow NYX_CONFIG only if origin already allowed OR enforcement is off.
    if (d.type === "NYX_CONFIG") {
      if (SECURITY.enforce && !okOrigin(ev)) return;
      const pl = d.payload || {};
      const tokenOk = okToken(pl) || (SECURITY.expectedToken === "dev-token-change-me" && typeof pl.token === "string");
      if (SECURITY.enforce && !tokenOk) return;
      applyConfig(pl, ev.origin);
      return;
    }

    if (SECURITY.enforce && !okOrigin(ev)) return;

    if (d.type === "NYX_PING") {
      if (!okToken(d.payload)) return;
      try {
        ev.source.postMessage(
          { type: "NYX_PONG", payload: { t: Date.now(), v: PROTOCOL_VERSION } },
          ev.origin
        );
      } catch (_) {}
      return;
    }

    if (d.type === "NYX_CONSCIOUSNESS") {
      if (!okToken(d.payload)) return;
      applyConsciousness(d.payload);
      return;
    }

    // Deterministic lifecycle
    if (d.type === "NYX_TURN_START") {
      if (!okToken(d.payload)) return;
      incInflight();
      return;
    }
    if (d.type === "NYX_TURN_END") {
      if (!okToken(d.payload)) return;
      decInflight();
      scheduleSettleSoon(180);
      return;
    }
  });

  // =========================
  // Fetch/XHR sniffing (guarded) + API_BASE routing (H1/H2)
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
    if (!CONFIG.apiBase) return u;
    if (u.startsWith("/api/")) return CONFIG.apiBase + u;
    return u;
  }

  if (!window.__NYX_FETCH_WRAPPED__ && window.fetch) {
    window.__NYX_FETCH_WRAPPED__ = true;
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
        } else if (input && input.url && input.url.startsWith("/api/")) {
          const newUrl = rewriteToApiBase(input.url);
          try {
            input = new Request(newUrl, input);
          } catch (_) {}
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

  if (!window.__NYX_XHR_WRAPPED__ && window.XMLHttpRequest) {
    window.__NYX_XHR_WRAPPED__ = true;
    const XHR = window.XMLHttpRequest;
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url) {
      try {
        this.__nyx_url = safeStr(url || "");
        this.__nyx_sniff = sniffUrl(this.__nyx_url);
        if (this.__nyx_url.startsWith("/api/") && CONFIG.apiBase) {
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
      const url = (CONFIG.apiBase ? (CONFIG.apiBase + "/api/chat") : "/api/chat");
      return fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: safeStr(text || "ping"), sessionId: "avatar-host" }),
      });
    } catch (_) {
      return Promise.reject(_);
    }
  }

  function hostFetchTts(text) {
    try {
      const url = (CONFIG.apiBase ? (CONFIG.apiBase + "/api/tts") : "/api/tts");
      return fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: safeStr(text || "Nyx test."), voice: "nyx" }),
      });
    } catch (_) {
      return Promise.reject(_);
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
            // optional hint to soften greeting on velvet toggle (no raw text)
            window.AvatarController.setMarionCog({ tone: state.velvet ? "velvet" : "neutral", stage: state.stage });
          }
        } catch (_) {}
        return;
      }

      // avatar-host.html actions:
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

      // legacy debug acts
      if (act === "testCHAT") { hostFetchChat("ping").catch(() => {}); return; }
      if (act === "testTTS") { hostFetchTts("Nyx test.").catch(() => {}); return; }
    }, { passive: true });
  }
  bindControls();

  // =========================
  // Visibility pause (H4)
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
    applyConfig,
    __protocol: PROTOCOL_VERSION,
    __security: SECURITY,
    __config: CONFIG,
  };
})();
