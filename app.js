"use strict";

const express = require("express");

const shadowBrain = require("./Utils/shadowBrain");

function start() {
  const app = express();

  // Use built-in JSON parser (no extra dep needed)
  app.use(express.json({ limit: "1mb" }));

  // -----------------------------
  // Simple in-memory session store
  // -----------------------------
  const sessions = Object.create(null);

  function clampYear(y) {
    if (!Number.isFinite(y)) return null;
    if (y < 1950 || y > 2024) return null;
    return y;
  }

  function getSession(sessionId) {
    const sid = String(sessionId || "anon");
    if (!sessions[sid]) {
      sessions[sid] = {
        sessionId: sid,

        // Core routing context
        lane: "music",

        // Music context
        lastMusicYear: null,
        activeMusicMode: null, // e.g. "top10" | "story" | "micro" | "#1" (optional)

        // Voice
        voiceMode: "standard",
      };
    }
    return sessions[sid];
  }

  function safeFollowUps(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    const seen = new Set();
    for (const it of list) {
      const label = String(it && it.label ? it.label : "").trim();
      const send = String(it && it.send ? it.send : "").trim();
      if (!label || !send) continue;
      const k = send.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ label, send });
    }
    return out;
  }

  function ensureShadowNonNull(shadow, session) {
    // Regression harness expects payload.shadow not null.
    // If shadowBrain returns null (should be rare), give a minimal safe object.
    if (shadow && typeof shadow === "object") return shadow;

    return {
      at: Date.now(),
      lane: (session && session.lane) || "general",
      mode: (session && session.activeMusicMode) || null,
      year: (session && session.lastMusicYear) || null,
      orderedIntents: [],
      candidates: [],
      prepared: null,
      orderedChips: [],
      sig: "fallback",
    };
  }

  // -----------------------------
  // Health
  // -----------------------------
  app.get("/health", (req, res) => res.json({ ok: true }));

  // -----------------------------
  // /api/chat
  // -----------------------------
  app.post("/api/chat", (req, res) => {
    const t0 = Date.now();

    const body = req.body || {};
    const text = String(body.text || "").trim();
    const sessionId = String(body.sessionId || "anon");
    const visitorId = String(body.visitorId || "anon");

    const requestId = Math.random().toString(16).slice(2, 10); // simple debug id
    const session = getSession(sessionId);

    // Ensure lane always exists
    if (!session.lane) session.lane = "music";

    // -----------------------------
    // SHADOW BRAIN: PRIME + OBSERVE
    // (guarded so it can't break chat)
    // -----------------------------
    try {
      shadowBrain.prime({
        session,
        visitorId,
        lane: session.lane,
        mode: session.activeMusicMode,
        year: session.lastMusicYear,
        now: t0,
      });

      shadowBrain.observe({
        session,
        visitorId,
        userText: text,
        event: "user_turn",
        lane: session.lane,
        mode: session.activeMusicMode,
        year: session.lastMusicYear,
        now: t0,
      });
    } catch (e) {
      console.warn("[shadowBrain] prime/observe error:", e && e.message ? e.message : e);
    }

    // -----------------------------
    // TEMP REPLY (stub logic for now)
    // Replace later with your real engine
    // -----------------------------
    let reply = "Tell me a year (1950–2024).";
    let followUps = safeFollowUps([
      { label: "1988", send: "1988" },
      { label: "Top 10", send: "top 10" },
      { label: "Story moment", send: "story moment" },
      { label: "Micro moment", send: "micro moment" },
    ]);

    // Detect bare year
    const yRaw = Number(text);
    const y = clampYear(yRaw);

    if (y) {
      session.lastMusicYear = y;

      // Optional: if user typed "top 10 1988" etc, you’d set activeMusicMode here later.
      // For now we keep it null or set a sensible default:
      if (!session.activeMusicMode) session.activeMusicMode = "top10";

      reply = `Top 10 — Billboard Year-End Hot 100 (${y})`;

      followUps = safeFollowUps([
        { label: "#1", send: "#1" },
        { label: "Story moment", send: "story moment" },
        { label: "Micro moment", send: "micro moment" },
        { label: "Another year", send: "another year" },
      ]);
    }

    // -----------------------------
    // SHADOW BRAIN: GET
    // -----------------------------
    let shadow = null;
    let imprint = null;

    try {
      const got = shadowBrain.get({
        session,
        visitorId,
        lane: session.lane,
        mode: session.activeMusicMode,
        year: session.lastMusicYear,
        userText: text,
        replyText: reply,
        followUps,
        now: Date.now(),
      });

      shadow = got && got.shadow ? got.shadow : null;
      imprint = got && got.imprint ? got.imprint : null;
    } catch (e) {
      console.warn("[shadowBrain] get error:", e && e.message ? e.message : e);
    }

    shadow = ensureShadowNonNull(shadow, session);

    // -----------------------------
    // RESPONSE PAYLOAD
    // -----------------------------
    return res.json({
      ok: true,
      reply,
      sessionId,
      visitorId,
      requestId,
      contractVersion: "1",
      voiceMode: session.voiceMode || "standard",
      followUps,

      // ✅ REQUIRED by regression_shadowBrain_api_v1.ps1
      shadow,

      // optional safe prefs snapshot
      imprint,
    });
  });

  // -----------------------------
  // Start server
  // -----------------------------
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => {
    console.log(`[app] listening on port ${PORT}`);
  });
}

module.exports = { start };
