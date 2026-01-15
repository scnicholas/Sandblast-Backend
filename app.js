"use strict";

const express = require("express");
const bodyParser = require("body-parser");

const shadowBrain = require("./Utils/shadowBrain");

function start() {
  const app = express();

  app.use(bodyParser.json({ limit: "1mb" }));

  // -----------------------------
  // Simple in-memory session store
  // (you already use this pattern)
  // -----------------------------
  const sessions = Object.create(null);

  function getSession(sessionId) {
    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        sessionId,
        lane: "music",
        voiceMode: "standard",
        lastMusicYear: null,
        activeMusicMode: null,
      };
    }
    return sessions[sessionId];
  }

  // -----------------------------
  // /api/chat
  // -----------------------------
  app.post("/api/chat", (req, res) => {
    const {
      text = "",
      sessionId = "anon",
      visitorId = "anon",
    } = req.body || {};

    const session = getSession(sessionId);

    // -----------------------------
    // SHADOW BRAIN: PRIME
    // -----------------------------
    shadowBrain.prime({
      session,
      visitorId,
      lane: session.lane,
      mode: session.activeMusicMode,
      year: session.lastMusicYear,
      now: Date.now(),
    });

    // -----------------------------
    // SHADOW BRAIN: OBSERVE USER
    // -----------------------------
    shadowBrain.observe({
      session,
      visitorId,
      userText: text,
      event: "user_turn",
      lane: session.lane,
      mode: session.activeMusicMode,
      year: session.lastMusicYear,
      now: Date.now(),
    });

    // -----------------------------
    // TEMP REPLY (stub for now)
    // Replace later with real logic
    // -----------------------------
    let reply = "Tell me a year (1950–2024).";
    let followUps = [
      { label: "1988", send: "1988" },
      { label: "Top 10", send: "top 10" },
      { label: "Story moment", send: "story moment" },
    ];

    // Example: detect bare year
    const y = Number(text);
    if (Number.isFinite(y)) {
      session.lastMusicYear = y;
      reply = `Top 10 — Billboard Year-End Hot 100 (${y})`;
      followUps = [
        { label: "#1", send: "#1" },
        { label: "Story moment", send: "story moment" },
        { label: "Micro moment", send: "micro moment" },
        { label: "Another year", send: "another year" },
      ];
    }

    // -----------------------------
    // SHADOW BRAIN: GET (THIS FIXES YOUR REGRESSION)
    // -----------------------------
    const { shadow, imprint } = shadowBrain.get({
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

    // -----------------------------
    // RESPONSE PAYLOAD
    // -----------------------------
    return res.json({
      ok: true,
      reply,
      sessionId,
      visitorId,
      contractVersion: "1",
      voiceMode: session.voiceMode,

      followUps,

      // ✅ REQUIRED
      shadow,

      // optional (safe)
      imprint,
    });
  });

  // -----------------------------
  // Start server
  // -----------------------------
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[app] listening on port ${PORT}`);
  });
}

module.exports = { start };
