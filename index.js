"use strict";

/**
 * Sandblast
 * Sandblast Backend — index.js (single-file, production-safe)
 *
 * Pillars covered in this file:
 *  - P1: Conversational Intelligence & Flow (Nyx behavior)
 *  - P2: Mode/year guarding + Top10 routing stability (force Year-End for Top10)
 *  - P3: Sticky year+mode (mode-only uses lastYear; year-only honors active mode)
 *
 * Notes:
 *  - Contract v1 is supported via followUps[] objects + followUp[] strings (legacy).
 *  - This file is intentionally defensive: safe fallbacks, anti-loop guard, stable prompts.
 */

const express = require("express");
const crypto = require("crypto");

const app = express();

/* ======================================================
   Version + Contract
====================================================== */

const NYX_CONTRACT_VERSION = "1";
const INDEX_VERSION =
  "index.js v1.0.5 (P3 sticky year+mode: mode-only uses lastYear; year-only honors active mode; Top10 force Year-End + retry)"
;

/* ======================================================
   Basic middleware
====================================================== */

app.use(express.json({ limit: "1mb" }));

// Request ID / timing
app.use((req, res, next) => {
  req.requestId = req.headers["x-request-id"] || crypto.randomBytes(8).toString("hex");
  req._t0 = Date.now();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

/* ======================================================
   Simple in-memory session store (safe default)
   - In production you can swap with durable sessions later.
====================================================== */

const SESSIONS = new Map();

async function getSession(sessionId) {
  if (!sessionId) return {};
  return SESSIONS.get(sessionId) || {};
}

async function setSession(sessionId, session) {
  if (!sessionId) return;
  SESSIONS.set(sessionId, session || {});
}

/* ======================================================
   Helpers: text, contract, ids
====================================================== */

function cleanText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getVisitorId(req, body) {
  return (
    req.headers["x-visitor-id"] ||
    (body && body.visitorId) ||
    (body && body.vid) ||
    null
  );
}

function getContractIn(req, body) {
  return (
    req.headers["x-contract-version"] ||
    (body && body.contractVersion) ||
    NYX_CONTRACT_VERSION
  );
}

function getSessionId(req, body) {
  return (
    (body && body.sessionId) ||
    (body && body.sid) ||
    (body && body.session) ||
    null
  );
}

function shouldUseV1Contract(contractIn, visitorId) {
  // Current behavior: always honor v1 unless client explicitly sends something else.
  // Rollouts can be added here later.
  return String(contractIn || NYX_CONTRACT_VERSION) === NYX_CONTRACT_VERSION;
}

/* ======================================================
   Intent helpers (missing-year guard + greetings)
====================================================== */

function extractYearFromText(s) {
  const m = String(s || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/); // 1950–2024
  return m ? Number(m[1]) : null;
}

function isGreeting(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return false;
  if (/^(hi|hey|hello|yo|sup|greetings)\b/.test(t)) return true;
  if (/^(hi\s+nyx|hey\s+nyx|hello\s+nyx)\b/.test(t)) return true;
  return false;
}

function greetingReply() {
  return "Hi — welcome to Sandblast. I’m Nyx. Give me a year (1950–2024) and choose: Top 10, Story moment, or Micro moment.";
}

function classifyMissingYearIntent(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  // Mode-only signals (no year present)
  if (/\b(top\s*10|top10|top ten)\b/.test(t)) return "top10";
  if (/\b(story\s*moment|story)\b/.test(t)) return "story";
  if (/\b(micro\s*moment|micro)\b/.test(t)) return "micro";

  return null;
}

// ✅ Detect if user included a mode keyword at all
function hasExplicitMode(text) {
  const t = cleanText(text).toLowerCase();
  return /\b(top\s*10|top10|top ten|story\s*moment|story|micro\s*moment|micro)\b/.test(t);
}

/* ======================================================
   P2 Top10 routing helpers (v1.0.4)
====================================================== */

function isTop10Text(text) {
  const t = cleanText(text).toLowerCase();
  return /\b(top\s*10|top10|top ten)\b/.test(t);
}

function forceTop10Chart(session) {
  if (!session || typeof session !== "object") return;
  session.activeMusicChart = "Billboard Year-End Hot 100";
}

function replyIndicatesNoCleanListForYear(reply) {
  const t = cleanText(reply).toLowerCase();
  return t.includes("don’t have a clean list") || t.includes("don't have a clean list");
}

// ✅ P3: suppress “Try story moment YEAR first” style loop prompts
function replyIndicatesTryStoryMomentFirst(reply) {
  const t = cleanText(reply).toLowerCase();
  return t.includes("try") && t.includes("story moment") && t.includes("first");
}

/* ======================================================
   Followups (legacy + v1)
====================================================== */

function buildYearFollowupStrings() {
  return ["1950", "Top 10", "Story moment", "Micro moment"];
}

function buildYearFollowupsV1() {
  return [
    { label: "1950", send: "1950" },
    { label: "Top 10", send: "Top 10" },
    { label: "Story moment", send: "Story moment" },
    { label: "Micro moment", send: "Micro moment" },
  ];
}

/* ======================================================
   Reply builders (mode prompts)
====================================================== */

function replyMissingYear(kind) {
  const label =
    kind === "top10" ? "Top 10" : kind === "story" ? "Story moment" : "Micro moment";
  return {
    reply: `Hi — I can do that. What year (1950–2024) for your ${label}?`,
    followUpLegacy: buildYearFollowupStrings(),
    followUpsV1: buildYearFollowupsV1(),
  };
}

function replyNeedModeForYear(year, session) {
  // Remember the year so next mode-only message works.
  if (session && typeof session === "object") {
    session.lastYear = year;
  }
  return {
    reply: `Got it — ${year}. What do you want: Top 10, Story moment, or Micro moment?`,
    followUpLegacy: buildYearFollowupStrings(),
    followUpsV1: buildYearFollowupsV1(),
  };
}

/* ======================================================
   Anti-loop + “always advance” suffix
====================================================== */

function ensureNextMoveSuffix(reply, session) {
  const r = cleanText(reply);
  if (!r) return r;

  // If already includes a clear next-step, leave it.
  const low = r.toLowerCase();
  if (
    low.includes("what year") ||
    low.includes("give me a year") ||
    low.includes("tell me a year") ||
    low.includes("what do you want") ||
    low.includes("top 10") ||
    low.includes("story moment") ||
    low.includes("micro moment")
  ) {
    return r;
  }

  // Otherwise, append a minimal forward move.
  return `${r} Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.`;
}

// Very lightweight loop guard: detect repeated identical reply and shift to a safe prompt.
function antiLoopGuard(session, reply) {
  if (!session || typeof session !== "object") return { reply };
  const r = cleanText(reply);

  session._lastReply = session._lastReply || "";
  session._loopCount = session._loopCount || 0;

  if (session._lastReply && session._lastReply === r) {
    session._loopCount += 1;
  } else {
    session._loopCount = 0;
  }

  session._lastReply = r;

  if (session._loopCount >= 1) {
    // Replace with a safe, explicit next step.
    return {
      reply: "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.",
    };
  }

  return { reply: r };
}

/* ======================================================
   Local fallbacks (stable + short)
====================================================== */

function fallbackTop10(year, session) {
  // Keep it minimal; actual list comes from engine when available.
  const chart = (session && session.activeMusicChart) || "Billboard Year-End Hot 100";
  return `Top 10 — ${chart} (${year}). Tell me the year again if you want another chart run, or ask for a story moment or micro-moment.`;
}

function fallbackStoryMoment(year) {
  return `Story moment — ${year}: Tell me the year again and I’ll pull a story moment that’s tight and broadcast-ready. Want Top 10 or Micro moment instead?`;
}

function fallbackMicroMoment(year) {
  return `Micro moment — ${year}: Give me the year again and I’ll hit you with a quick 50–60 word moment. Want Top 10 or Story moment instead?`;
}

/* ======================================================
   Music engine adapter (safe)
====================================================== */

let musicKnowledge = null;
try {
  musicKnowledge = require("./Utils/musicKnowledge");
} catch (_) {
  musicKnowledge = null;
}

function safeMusicHandle({ text, session }) {
  if (!musicKnowledge || typeof musicKnowledge.handleChat !== "function") {
    return null;
  }
  return musicKnowledge.handleChat({ text, session });
}

/* ======================================================
   Routes
====================================================== */

app.get("/api/health", (req, res) => {
  const payload = {
    ok: true,
    service: "sandblast-backend",
    env: process.env.NODE_ENV || "production",
    time: new Date().toISOString(),
    build: process.env.RENDER_GIT_COMMIT_SHA || null,
    version: INDEX_VERSION,
    sessions: SESSIONS.size,
    cors: { allowedOrigins: 8 }, // placeholder; real CORS logic is elsewhere in your stack
    contract: { version: NYX_CONTRACT_VERSION, strict: false, rolloutPct: 100 },
    tts: {
      enabled: true,
      provider: "elevenlabs",
      hasKey: !!process.env.ELEVENLABS_API_KEY,
      hasVoiceId: !!process.env.ELEVENLABS_VOICE_ID,
      model: null,
      tuning: {
        stability: 0.55,
        similarity: 0.78,
        style: 0.12,
        speakerBoost: false,
      },
      modes: {
        calm: "stability↑ style↓",
        standard: "env defaults",
        high: "stability↓ style↑ boost on",
      },
    },
    s2s: {
      enabled: true,
      hasMulter: true,
      hasModule: (() => {
        try {
          require("./Utils/s2s");
          return true;
        } catch (_) {
          return false;
        }
      })(),
    },
    durableSessions: {
      enabled: false,
      provider: "none",
      ttlSec: 7200,
    },
    requestId: req.requestId,
  };

  res.json(payload);
});

app.post("/api/chat", async (req, res) => {
  const body = req.body || {};
  let text = cleanText(body.message || body.text || "");

  const visitorId = getVisitorId(req, body);
  const contractIn = getContractIn(req, body);
  const sessionId = getSessionId(req, body);

  if (!sessionId) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "MISSING_SESSION_ID",
      requestId: req.requestId,
    });
  }

  // Load / init session
  let session = (await getSession(sessionId)) || {};
  if (typeof session !== "object") session = {};

  // keep light state anchors
  session.lastYear = session.lastYear || null;
  session.pendingMode = session.pendingMode || null;
  session.activeMusicChart = session.activeMusicChart || "Billboard Hot 100";
  session.activeMusicMode = session.activeMusicMode || null; // ✅ engine-compat mode hint

  // ensure v1 contract decisions
  const useV1 = shouldUseV1Contract(contractIn, visitorId);

  // 1) Greeting
  if (isGreeting(text)) {
    const reply0 = greetingReply();
    const guarded = antiLoopGuard(session, reply0);

    await setSession(sessionId, session);

    return res.json(
      buildResponseEnvelope({
        ok: true,
        reply: ensureNextMoveSuffix(guarded.reply, session),
        sessionId,
        visitorId,
        contractVersion: useV1 ? NYX_CONTRACT_VERSION : contractIn,
        followUpLegacy: buildYearFollowupStrings(),
        followUpsV1: buildYearFollowupsV1(),
        requestId: req.requestId,
      })
    );
  }

  // 2) Missing-year intent guard (Top10/Story/Micro) + ✅ remember pending mode
  //    ✅ P3: if we already have a remembered year, run the intent immediately (no re-asking)
  const missingKind = classifyMissingYearIntent(text);
  if (missingKind) {
    if (session.lastYear) {
      const y = session.lastYear;
      session.pendingMode = null;
      session.activeMusicMode = missingKind;

      if (missingKind === "top10") {
        forceTop10Chart(session);
        text = String(y); // engine-compat: YEAR ONLY
      } else if (missingKind === "story") {
        text = `story moment ${y}`;
      } else {
        text = `micro moment ${y}`;
      }
      // fall through to normal handling below
    } else {
      session.pendingMode = missingKind; // store chosen mode until year arrives
      // also set engine-facing mode hint now
      session.activeMusicMode = missingKind;

      // ✅ v1.0.4: force chart source for Top 10
      if (missingKind === "top10") {
        forceTop10Chart(session);
      }

      const r = replyMissingYear(missingKind);
      const guarded = antiLoopGuard(session, r.reply);

      await setSession(sessionId, session);

      return res.json(
        buildResponseEnvelope({
          ok: true,
          reply: ensureNextMoveSuffix(guarded.reply, session),
          sessionId,
          visitorId,
          contractVersion: useV1 ? NYX_CONTRACT_VERSION : contractIn,
          followUpLegacy: r.followUpLegacy,
          followUpsV1: r.followUpsV1,
          requestId: req.requestId,
        })
      );
    }
  }

  // 3) ✅ One-shot normalize mode+year phrases BEFORE year-only handling (fixes “top 10 1988”)
  //    IMPORTANT: For Top10 we route as YEAR ONLY with session.activeMusicMode=top10 (engine compatibility).
  const tNorm = cleanText(text).toLowerCase();
  const yNorm = extractYearFromText(tNorm);

  if (yNorm) {
    if (isTop10Text(tNorm)) {
      session.activeMusicMode = "top10";
      session.pendingMode = "top10"; // makes behavior consistent even if engine ignores activeMusicMode
      session.lastYear = yNorm;

      // ✅ v1.0.4: force chart source for Top 10
      forceTop10Chart(session);

      text = String(yNorm); // ✅ engine-compat: YEAR ONLY
    } else if (/\b(story\s*moment|story)\b/.test(tNorm)) {
      session.activeMusicMode = "story";
      session.pendingMode = null;
      session.lastYear = yNorm;
      text = `story moment ${yNorm}`; // story already proven to work
    } else if (/\b(micro\s*moment|micro)\b/.test(tNorm)) {
      session.activeMusicMode = "micro";
      session.pendingMode = null;
      session.lastYear = yNorm;
      text = `micro moment ${yNorm}`;
    }
  }

  // 4) Year-only handler (1950–2024) with mode prompt
  const yearFromText = extractYearFromText(text);
  const looksLikeOnlyYear = /^(\d{4})$/.test(text);

  if (looksLikeOnlyYear && !hasExplicitMode(text)) {
    // ✅ P2/P3: Route year-only using pending mode (just selected) or active mode (previously selected)
    const respondWithModeYear = async (mode, consumePending) => {
      if (!mode) return null;

      if (consumePending) {
        session.pendingMode = null; // consume once
      }

      session.lastYear = yearFromText;
      session.activeMusicMode = mode;

      // ✅ force Top 10 chart source
      if (mode === "top10") {
        forceTop10Chart(session);
      }

      // ✅ engine-compat routing:
      // - For top10, pass YEAR ONLY and let mode live in session
      // - For story/micro, pass explicit string (already stable)
      const routedText =
        mode === "top10"
          ? String(yearFromText)
          : mode === "story"
          ? `story moment ${yearFromText}`
          : `micro moment ${yearFromText}`;

      let engine = null;
      try {
        engine = safeMusicHandle({ text: routedText, session });
      } catch (_) {
        engine = null;
      }

      let reply = engine && engine.reply ? String(engine.reply) : "";

      // ✅ v1.0.4: Top10 retry once if engine answered “no clean list”
      if (mode === "top10" && replyIndicatesNoCleanListForYear(reply)) {
        // force year-end chart again defensively + retry once
        forceTop10Chart(session);
        try {
          engine = safeMusicHandle({ text: String(yearFromText), session });
        } catch (_) {
          engine = null;
        }
        reply = engine && engine.reply ? String(engine.reply) : reply;
      }

      // ✅ P3: suppress “try story moment YEAR first” loops; replace with mode picker
      if (replyIndicatesTryStoryMomentFirst(reply)) {
        const rMode = replyNeedModeForYear(yearFromText, session);
        reply = rMode.reply;
      }

      // If the engine didn't return, use a stable local fallback that ADVANCES.
      if (!reply) {
        reply =
          mode === "top10"
            ? fallbackTop10(yearFromText, session)
            : mode === "story"
            ? fallbackStoryMoment(yearFromText)
            : fallbackMicroMoment(yearFromText);
      }

      reply = ensureNextMoveSuffix(reply, session);
      const guarded = antiLoopGuard(session, reply);

      await setSession(sessionId, session);

      return res.json(
        buildResponseEnvelope({
          ok: true,
          reply: guarded.reply,
          sessionId,
          visitorId,
          contractVersion: useV1 ? NYX_CONTRACT_VERSION : contractIn,
          followUpLegacy: buildYearFollowupStrings(),
          followUpsV1: buildYearFollowupsV1(),
          requestId: req.requestId,
        })
      );
    };

    // 1) pendingMode (fresh selection) takes priority
    if (session.pendingMode) {
      return respondWithModeYear(session.pendingMode, true);
    }

    // 2) if user already selected a mode earlier in the session, reuse it (P3)
    if (session.activeMusicMode && ["top10", "story", "micro"].includes(session.activeMusicMode)) {
      return respondWithModeYear(session.activeMusicMode, false);
    }

    // Otherwise: year-only with no mode context -> ask which mode they want
    const r = replyNeedModeForYear(yearFromText, session);
    const guarded = antiLoopGuard(session, r.reply);

    await setSession(sessionId, session);

    return res.json(
      buildResponseEnvelope({
        ok: true,
        reply: ensureNextMoveSuffix(guarded.reply, session),
        sessionId,
        visitorId,
        contractVersion: useV1 ? NYX_CONTRACT_VERSION : contractIn,
        followUpLegacy: r.followUpLegacy,
        followUpsV1: r.followUpsV1,
        requestId: req.requestId,
      })
    );
  }

  // 5) Delegate to music engine when available
  let engine = null;
  try {
    engine = safeMusicHandle({ text, session });
  } catch (_) {
    engine = null;
  }

  // Merge back session returned by engine (if any)
  if (engine && engine.session && typeof engine.session === "object") {
    session = { ...session, ...engine.session };
  }

  let reply = engine && engine.reply ? String(engine.reply) : "";

  // If engine reply is absent, produce a safe, advancing fallback
  if (!reply) {
    if (yearFromText) {
      // If a year is present and user said a mode explicitly, try to match.
      const low = cleanText(text).toLowerCase();
      if (isTop10Text(low)) {
        session.activeMusicMode = "top10";
        forceTop10Chart(session);
        reply = fallbackTop10(yearFromText, session);
      } else if (/\b(story\s*moment|story)\b/.test(low)) {
        session.activeMusicMode = "story";
        reply = fallbackStoryMoment(yearFromText);
      } else if (/\b(micro\s*moment|micro)\b/.test(low)) {
        session.activeMusicMode = "micro";
        reply = fallbackMicroMoment(yearFromText);
      } else {
        // year present but unclear mode -> ask
        const r = replyNeedModeForYear(yearFromText, session);
        reply = r.reply;
      }
    } else {
      reply = "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.";
    }
  }

  // Final safeguards
  reply = ensureNextMoveSuffix(reply, session);
  const guarded = antiLoopGuard(session, reply);

  await setSession(sessionId, session);

  return res.json(
    buildResponseEnvelope({
      ok: true,
      reply: guarded.reply,
      sessionId,
      visitorId,
      contractVersion: useV1 ? NYX_CONTRACT_VERSION : contractIn,
      followUpLegacy: buildYearFollowupStrings(),
      followUpsV1: buildYearFollowupsV1(),
      requestId: req.requestId,
    })
  );
});

/* ======================================================
   Response envelope (keeps both legacy + v1)
====================================================== */

function buildResponseEnvelope({
  ok,
  reply,
  sessionId,
  visitorId,
  contractVersion,
  followUpLegacy,
  followUpsV1,
  requestId,
}) {
  // Keep both legacy + v1 fields to preserve widget compatibility.
  return {
    ok: !!ok,
    reply: String(reply || ""),
    sessionId: sessionId || null,
    requestId: requestId || null,
    visitorId: visitorId || null,
    contractVersion: String(contractVersion || NYX_CONTRACT_VERSION),
    followUp: Array.isArray(followUpLegacy) ? followUpLegacy : buildYearFollowupStrings(),
    followUps: Array.isArray(followUpsV1) ? followUpsV1 : buildYearFollowupsV1(),
  };
}

/* ======================================================
   Listen
====================================================== */

const PORT = Number(process.env.PORT || 10000);
app.listen(PORT, "0.0.0.0", () => {
  // Intentionally concise: you already have /api/health for diagnostics.
  console.log(`[sandblast-backend] up :${PORT} env=${process.env.NODE_ENV || "production"} build=${process.env.RENDER_GIT_COMMIT_SHA || "n/a"} contract=${NYX_CONTRACT_VERSION} rollout=100%`);
});
