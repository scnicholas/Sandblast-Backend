// demo-parent.js (UPDATED)
// Parent harness that pumps consciousness packets into an avatar iframe
// and can optionally hit /api/chat + /api/tts on the SAME origin.
//
// Usage:
//  1) Put this next to parent-harness.html
//  2) Ensure parent-harness.html has: <iframe id="avatarFrame" src="./avatar.html"></iframe>
//  3) Serve over http(s) (local server) if you want fetch("/api/chat") to work (same origin)
//  4) Buttons in parent-harness.html run scenarios
//
// Security:
//  - Uses a shared token + strict targetOrigin by default (same-origin).
//  - For cross-origin embedding, set pump.targetOrigin explicitly and ensure avatar-bridge.js allows that origin.
//
// Requires avatar-bridge.js to accept messages of shape:
//   { type:"NYX_CONSCIOUSNESS", token:"...", payload:{...} }

(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const ui = {
    frame: null,
    status: null,
    lastPacket: null,
    btnBoot: null,
    btnIdle: null,
    btnListen: null,
    btnSpeak: null,
    btnSequence: null,
    btnChat: null,
    btnTts: null,
    btnStop: null,
    originNote: null,
  };

  const pump = {
    running: false,
    seqTimer: 0,

    // IMPORTANT: must match avatar-bridge.js expectedToken
    token: "nyx-dev-2026-02-07",

    // Default same-origin; tightened automatically in init()
    targetOrigin: "*",

    lastSendAt: 0,
  };

  function now() {
    return Date.now();
  }

  function safeStr(x) {
    return x === null || x === undefined ? "" : String(x);
  }

  function writeStatus(msg) {
    if (!ui.status) return;
    ui.status.textContent = safeStr(msg);
  }

  function setLastPacket(payload) {
    if (!ui.lastPacket) return;
    try {
      ui.lastPacket.textContent = JSON.stringify(payload || {}, null, 2);
    } catch (_) {
      ui.lastPacket.textContent = String(payload || "");
    }
  }

  // -------------------------
  // Consciousness injection (postMessage)
  // -------------------------
  function postConsciousness(payload) {
    const fwin = ui.frame && ui.frame.contentWindow;
    if (!fwin) {
      writeStatus("iframe not ready");
      return false;
    }

    const packet = {
      type: "NYX_CONSCIOUSNESS",
      token: pump.token,
      payload: payload || {},
    };

    try {
      fwin.postMessage(packet, pump.targetOrigin);
      pump.lastSendAt = now();
      setLastPacket(payload);
      return true;
    } catch (e) {
      writeStatus("postMessage failed: " + (e && e.message ? e.message : e));
      return false;
    }
  }

  // -------------------------
  // Convenience “Nyx-like reply” packet builder
  // -------------------------
  function buildPacket({
    presence,
    lane,
    topic,
    stage,
    dominance,
    velvet,
    route,
    hasCog = true,
    hasSpine = true,
  } = {}) {
    const _lane = lane || "music";
    const _topic = topic || "unknown";
    const _stage = stage || "warm";
    const _dom = dominance || "neutral";
    const _velvet = !!velvet;

    const sp = hasSpine
      ? { __spine: { lane: _lane, topic: _topic, stage: _stage, dominance: _dom, velvet: _velvet } }
      : {};

    const cog = hasCog ? { dominance: _dom, velvet: _velvet } : null;

    return {
      presence: presence || "", // hint only
      lane: _lane,
      topic: _topic,
      stage: _stage,
      dominance: _dom,
      velvet: _velvet,
      cog,
      sessionPatch: sp,
      meta: { route: route || "" },
      hintPresence: presence || "",
    };
  }

  // -------------------------
  // Scenarios
  // -------------------------
  function sendBoot() {
    postConsciousness(
      buildPacket({
        presence: "idle",
        lane: "system",
        topic: "boot",
        stage: "boot",
        dominance: "neutral",
        velvet: false,
        route: "boot",
      })
    );
    writeStatus("Sent: boot");
  }

  function sendIdle() {
    postConsciousness(
      buildPacket({
        presence: "idle",
        lane: "music",
        topic: "unknown",
        stage: "warm",
        dominance: "neutral",
        velvet: false,
        route: "idle",
      })
    );
    writeStatus("Sent: idle");
  }

  function sendListening() {
    postConsciousness(
      buildPacket({
        presence: "listening",
        lane: "help",
        topic: "awaiting_user",
        stage: "engaged",
        dominance: "soft",
        velvet: false,
        route: "listening",
      })
    );
    writeStatus("Sent: listening");
  }

  function sendSpeaking() {
    postConsciousness(
      buildPacket({
        presence: "speaking",
        lane: "music",
        topic: "top10_by_year",
        stage: "engaged",
        dominance: "firm",
        velvet: false,
        route: "speaking",
      })
    );
    writeStatus("Sent: speaking (hint only; audio wins if playing)");
  }

  // Alive loop: idle → listening → speaking → sponsor speaking → velvet idle
  function startSequence() {
    stopAll();

    pump.running = true;
    let step = 0;

    const steps = [
      () => {
        postConsciousness(
          buildPacket({
            presence: "idle",
            lane: "music",
            topic: "browse",
            stage: "warm",
            dominance: "neutral",
            velvet: false,
            route: "seq_idle",
          })
        );
        writeStatus("Sequence: idle (music/browse)");
      },
      () => {
        postConsciousness(
          buildPacket({
            presence: "listening",
            lane: "music",
            topic: "year_prompt",
            stage: "engaged",
            dominance: "soft",
            velvet: false,
            route: "seq_listening",
          })
        );
        writeStatus("Sequence: listening (music/year_prompt)");
      },
      () => {
        postConsciousness(
          buildPacket({
            presence: "speaking",
            lane: "music",
            topic: "top10_by_year",
            stage: "engaged",
            dominance: "neutral",
            velvet: false,
            route: "seq_speaking_top10",
          })
        );
        writeStatus("Sequence: speaking (music/top10_by_year)");
      },
      () => {
        postConsciousness(
          buildPacket({
            presence: "speaking",
            lane: "sponsor",
            topic: "offer",
            stage: "engaged",
            dominance: "firm",
            velvet: false,
            route: "seq_speaking_sponsor",
          })
        );
        writeStatus("Sequence: speaking (sponsor/offer)");
      },
      () => {
        postConsciousness(
          buildPacket({
            presence: "idle",
            lane: "movies",
            topic: "recommendation",
            stage: "warm",
            dominance: "neutral",
            velvet: true,
            route: "seq_idle_movies_velvet",
          })
        );
        writeStatus("Sequence: idle (movies/recommendation, velvet=1)");
      },
    ];

    pump.seqTimer = window.setInterval(() => {
      if (!pump.running) return;
      const fn = steps[step % steps.length];
      step += 1;
      try {
        fn();
      } catch (e) {
        writeStatus("Sequence error: " + (e && e.message ? e.message : e));
      }
    }, 2500);

    steps[0]();
  }

  function stopAll() {
    pump.running = false;
    if (pump.seqTimer) window.clearInterval(pump.seqTimer);
    pump.seqTimer = 0;
    writeStatus("Stopped");
  }

  // -------------------------
  // Optional: Same-origin backend tests
  // -------------------------
  async function testChat() {
    writeStatus("Calling /api/chat …");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: "Give me Top 10 for 1988.",
          payload: { lane: "music", action: "top10", year: 1988, route: "top10" },
        }),
      });

      const ct = res.headers.get("content-type") || "";
      let data = null;
      if (ct.toLowerCase().includes("json")) data = await res.json();
      else data = await res.text();

      // Also push a minimal adapted packet to prove the pipe even if iframe sniffing is off.
      if (data && typeof data === "object") {
        postConsciousness({
          lane: data.lane || "music",
          topic:
            (data.sessionPatch && data.sessionPatch.__spine && data.sessionPatch.__spine.topic) ||
            (data.meta && data.meta.route) ||
            "chat_reply",
          stage:
            (data.sessionPatch && data.sessionPatch.__spine && data.sessionPatch.__spine.stage) ||
            "engaged",
          dominance: (data.cog && data.cog.dominance) || "neutral",
          velvet: !!(data.cog && data.cog.velvet),
          cog: data.cog,
          sessionPatch: data.sessionPatch,
          meta: data.meta,
          hintPresence: "idle",
        });
        writeStatus("Chat ok: pumped consciousness from /api/chat response");
      } else {
        writeStatus("Chat returned non-JSON (see console)");
        console.log("CHAT response:", data);
      }
    } catch (e) {
      writeStatus("Chat failed: " + (e && e.message ? e.message : e));
    }
  }

  async function testTts() {
    writeStatus("Calling /api/tts …");
    try {
      await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: "Nyx online. Consciousness anchored. Avatar speaking now.",
        }),
      });
      writeStatus("TTS requested. If iframe sniffing is enabled, audio should play there.");
    } catch (e) {
      writeStatus("TTS failed: " + (e && e.message ? e.message : e));
    }
  }

  // -------------------------
  // Wiring + handshake listener
  // -------------------------
  function init() {
    ui.frame = $("#avatarFrame");
    ui.status = $("#parentStatus");
    ui.lastPacket = $("#lastPacket");
    ui.btnBoot = $("#btnBoot");
    ui.btnIdle = $("#btnIdle");
    ui.btnListen = $("#btnListen");
    ui.btnSpeak = $("#btnSpeak");
    ui.btnSequence = $("#btnSequence");
    ui.btnChat = $("#btnChat");
    ui.btnTts = $("#btnTts");
    ui.btnStop = $("#btnStop");
    ui.originNote = $("#originNote");

    if (!ui.frame) {
      console.error("Missing #avatarFrame iframe");
      return;
    }

    // Tighten targetOrigin automatically if iframe src is same-origin path.
    try {
      const src = ui.frame.getAttribute("src") || "";
      if (!src || src.startsWith("./") || src.startsWith("/") || !/^https?:\/\//i.test(src)) {
        pump.targetOrigin = window.location.origin;
      } else {
        // If absolute, derive origin (best-effort)
        const u = new URL(src, window.location.href);
        pump.targetOrigin = u.origin;
      }
    } catch (_) {
      pump.targetOrigin = window.location.origin;
    }

    if (ui.originNote) ui.originNote.textContent = `targetOrigin: ${pump.targetOrigin}`;

    ui.btnBoot && ui.btnBoot.addEventListener("click", sendBoot);
    ui.btnIdle && ui.btnIdle.addEventListener("click", sendIdle);
    ui.btnListen && ui.btnListen.addEventListener("click", sendListening);
    ui.btnSpeak && ui.btnSpeak.addEventListener("click", sendSpeaking);
    ui.btnSequence && ui.btnSequence.addEventListener("click", startSequence);
    ui.btnStop && ui.btnStop.addEventListener("click", stopAll);
    ui.btnChat && ui.btnChat.addEventListener("click", testChat);
    ui.btnTts && ui.btnTts.addEventListener("click", testTts);

    // Listen for iframe handshake (optional)
    window.addEventListener("message", (ev) => {
      if (pump.targetOrigin !== "*" && ev.origin !== pump.targetOrigin) return;
      const d = ev && ev.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "NYX_PONG") {
        writeStatus("Handshake: NYX_PONG (avatar connected)");
      }
    });

    // When iframe loads, send a boot packet
    ui.frame.addEventListener("load", () => {
      sendBoot();
    });

    writeStatus("Ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Public surface (optional)
  window.NyxDemoParent = {
    postConsciousness,
    startSequence,
    stopAll,
    testChat,
    testTts,
    setToken: (t) => (pump.token = safeStr(t).trim() || pump.token),
    setTargetOrigin: (o) => (pump.targetOrigin = safeStr(o).trim() || pump.targetOrigin),
  };
})();
