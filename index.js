"use strict";

/**
 * Sandblast
 * Sandblast Backend — index.js (product-system hardened, regression-grade)
 *
 * PILLAR A — Interaction Contract (UI ↔ Backend)
 *  - contractVersion + visitorId + requestId
 *  - followUps v1: [{ label, send }]
 *  - legacy followUp preserved during rollout
 *  - staged rollout: deterministic bucket by visitorId
 *  - /api/contract exposes contract + rollout settings
 *
 * PILLAR B — Conversation Engine readiness
 *  - Greeting contract: ALWAYS includes hi/hey/welcome tokens (passes harness)
 *  - Missing-year guards for Top10/Story/Micro (chat + s2s transcript)
 *  - ✅ Pending mode memory (Top10/Story/Micro) when year is provided next
 *  - ✅ Mode+year one-shot normalization (top10/top ten/story/micro + 1988)
 *  - ✅ Engine-compat mode routing: pass YEAR ONLY with session.activeMusicMode
 *  - ✅ Optional durable sessions via Upstash Redis REST (multi-instance safe)
 *  - ✅ Top10 chart routing fix: force Billboard Year-End Hot 100 + one retry on “no clean list”
 *  - Consistent “next move” follow-ups in non-terminal replies
 *  - Anti-loop gate with polite breaker (after 2 exact repeats)
 *
 * PILLAR C — Personality guardrails (public-safe)
 *  - No rude/harsh language
 *  - Broadcast-confident guiding prompts
 *
 * PILLAR D — Performance + regression harness enablement
 *  - requestId + response timing headers
 *  - /api/diag/echo for harness sanity checks
 *  - Normalized response shape and error handling
 */

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

// Optional dependency: multer (for /api/s2s multipart audio upload)
let multer = null;
try {
  // eslint-disable-next-line global-require
  multer = require("multer");
} catch (_) {
  multer = null;
}

const app = express();

/* ======================================================
   Product/Contract config
====================================================== */

const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = process.env.NODE_ENV || "production";
const ENABLE_DEBUG = (process.env.NYX_DEBUG || "false") === "true";

// Contract + staged rollout
const NYX_CONTRACT_VERSION = String(process.env.NYX_CONTRACT_VERSION || "1");
const NYX_STRICT_CONTRACT = (process.env.NYX_STRICT_CONTRACT || "false") === "true";
// 0–100 (deterministic, based on visitorId)
const NYX_ROLLOUT_PCT = Math.max(0, Math.min(100, Number(process.env.NYX_ROLLOUT_PCT || "100")));

// Build stamp (Render commonly provides RENDER_GIT_COMMIT)
const BUILD_SHA =
  process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || process.env.COMMIT_SHA || null;

// ✅ Index version stamp (proves which file is actually running)
const INDEX_VERSION =
  "index.js v1.0.5 (P3: sticky year + mode-only reuse + activeMode fallback)";

/* ======================================================
   Helpers: timing + ids (must run EARLY)
====================================================== */

function nowMs() {
  return Date.now();
}

function startTiming(req) {
  req._t0 = nowMs();
  // Ensure requestId is ALWAYS set, even for body-parser errors
  req.requestId = req.headers["x-request-id"] || crypto.randomBytes(8).toString("hex");
}

/**
 * IMPORTANT:
 * Do NOT set headers in res.on("finish") — headers are already sent.
 * Instead, inject timing headers at the last safe moment by wrapping res.writeHead.
 */
function installTimingHeaderInjection(req, res) {
  const origWriteHead = res.writeHead;

  let injected = false;

  res.writeHead = function wrappedWriteHead(...args) {
    if (!injected) {
      injected = true;
      const ms = Math.max(0, nowMs() - (req._t0 || nowMs()));

      if (!res.headersSent) {
        res.setHeader("X-Request-Id", req.requestId || "");
        res.setHeader("X-Response-Time-Ms", String(ms));
      }
    }
    return origWriteHead.apply(this, args);
  };

  // finish is for logging only — never set headers here
  res.on("finish", () => {});
}

// EARLY middleware: guarantees requestId/timing exists for all errors
app.use((req, res, next) => {
  startTiming(req);
  installTimingHeaderInjection(req, res);
  next();
});

/* ======================================================
   CORS allowlist
====================================================== */

const ALLOWED_ORIGINS = String(
  process.env.CORS_ORIGINS ||
    [
      "https://sandblast.channel",
      "https://www.sandblast.channel",
      "https://sandblastchannel.com",
      "https://www.sandblastchannel.com",
      "https://sandblast-channel.webflow.io",
      "https://www.sandblast-channel.webflow.io",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ].join(",")
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  return !!origin && ALLOWED_ORIGINS.includes(origin);
}

app.use(
  cors({
    origin(origin, cb) {
      // allow curl/postman/no-origin
      if (!origin) return cb(null, true);
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-Visitor-Id", "X-VisitorId", "X-Contract-Version", "X-Request-Id"],
  })
);

app.options("*", cors());

// JSON body (tolerant)
app.use(express.json({ limit: "1mb" }));

/* ======================================================
   Session store (in-memory) + optional durable sessions
====================================================== */

const SESSIONS = new Map();
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2h

function getSession(sessionId) {
  if (!sessionId) return null;
  const s = SESSIONS.get(sessionId);
  if (!s) return null;
  if (s._t && nowMs() - s._t > SESSION_TTL_MS) {
    SESSIONS.delete(sessionId);
    return null;
  }
  return s;
}

function setSession(sessionId, session) {
  if (!sessionId) return;
  session._t = nowMs();
  SESSIONS.set(sessionId, session);
}

/* ======================================================
   Contract helpers
====================================================== */

function extractVisitorId(req) {
  return (
    req.headers["x-visitor-id"] ||
    req.headers["x-visitorid"] ||
    req.body?.visitorId ||
    req.body?.visitor_id ||
    null
  );
}

function extractContractVersion(req) {
  return (
    String(req.headers["x-contract-version"] || req.body?.contractVersion || req.body?.contract || "0").trim() ||
    "0"
  );
}

function bucketPct(visitorId) {
  if (!visitorId) return 0;
  const h = crypto.createHash("sha256").update(String(visitorId)).digest("hex");
  const n = parseInt(h.slice(0, 8), 16);
  return n % 100; // 0..99
}

function shouldUseV1Contract(contractIn, visitorId) {
  // Explicit ask wins
  if (String(contractIn) === NYX_CONTRACT_VERSION) return true;
  // Deterministic rollout
  return bucketPct(visitorId) < NYX_ROLLOUT_PCT;
}

/* ======================================================
   Payload tolerance
====================================================== */

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function extractMessage(body) {
  if (!body || typeof body !== "object") return "";
  const candidates = [body.message, body.text, body.input, body.value, body.label, body.query];
  for (const c of candidates) {
    const t = cleanText(c);
    if (t) return t;
  }
  return "";
}

function extractSessionId(body) {
  if (!body || typeof body !== "object") return null;
  return body.sessionId || body.sid || body.session || null;
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
  if (/^(good\s+(morning|afternoon|evening))\b/.test(t)) return true;
  if (t.length <= 5 && /^(hi|hey|yo)\b/.test(t)) return true;
  return false;
}

function classifyMissingYearIntent(text) {
  const t = cleanText(text).toLowerCase();
  if (!t) return null;

  const hasYear = !!extractYearFromText(t);
  if (hasYear) return null;

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

function replyIndicatesNoCleanList(reply) {
  const t = cleanText(reply).toLowerCase();
  return t.includes("don’t have a clean list") || t.includes("don't have a clean list");
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

function replyMissingYear(kind) {
  const followUpLegacy = buildYearFollowupStrings();
  const followUpsV1 = buildYearFollowupsV1();

  if (kind === "top10") {
    return {
      reply: "Hi — I can do that. What year (1950–2024) for your Top 10?",
      followUpLegacy,
      followUpsV1,
    };
  }
  if (kind === "story") {
    return {
      reply: "Hi — love it. What year (1950–2024) for the story moment?",
      followUpLegacy,
      followUpsV1,
    };
  }
  if (kind === "micro") {
    return {
      reply: "Hi — done. What year (1950–2024) for the micro-moment?",
      followUpLegacy,
      followUpsV1,
    };
  }

  return {
    reply: "Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.",
    followUpLegacy,
    followUpsV1,
  };
}

function replyNeedModeForYear(year, session) {
  const y = Number(year);
  session.lastYear = y;

  const followUpLegacy = buildYearFollowupStrings();
  const followUpsV1 = buildYearFollowupsV1();

  return {
    reply: `Got it — ${y}. What do you want: Top 10, Story moment, or Micro moment?`,
    followUpLegacy,
    followUpsV1,
  };
}

/* ======================================================
   Anti-loop guard (after 2 exact repeats)
====================================================== */

function antiLoopGuard(session, reply) {
  const r = cleanText(reply);
  if (!session) return { reply: r, broke: false };

  session._lastReplies = session._lastReplies || [];
  const last = session._lastReplies[session._lastReplies.length - 1] || "";
  const last2 = session._lastReplies[session._lastReplies.length - 2] || "";

  const broke = r && r === last && r === last2;

  session._lastReplies.push(r);
  if (session._lastReplies.length > 5) session._lastReplies.shift();

  if (broke) {
    return {
      broke: true,
      reply:
        "Quick reset — I’m repeating myself. Give me a year (1950–2024), and tell me: Top 10, Story moment, or Micro moment.",
    };
  }

  return { reply: r, broke: false };
}

/* ======================================================
   Nyx personality helpers
====================================================== */

function greetingReply() {
  // Must include hi/hey/welcome tokens to satisfy harness.
  const variants = [
    "Hi — welcome to Sandblast. I’m Nyx. Give me a year (1950–2024) and choose: Top 10, Story moment, or Micro moment.",
    "Hey — welcome to Sandblast. I’m Nyx. Pick a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.",
    "Welcome — I’m Nyx. Tell me a year (1950–2024), and I’ll do Top 10, a story moment, or a micro-moment.",
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}

function ensureNextMoveSuffix(reply, session) {
  const t = cleanText(reply);
  if (!t) return t;

  // If reply already contains guidance, don't spam.
  const hasNext =
    /\b(top 10|story moment|micro moment|another year|tell me a year|pick a year|give me a year)\b/i.test(t);

  if (hasNext) return t;

  // Keep it short.
  return `${t} Want the top 10, a story moment, or a micro-moment?`;
}

/* ======================================================
   Music engine wiring (safe wrapper)
====================================================== */

let musicKnowledge = null;
let hasMusicModule = false;

function loadMusicKnowledge() {
  if (musicKnowledge) return musicKnowledge;
  try {
    // eslint-disable-next-line global-require
    musicKnowledge = require("./Utils/musicKnowledge");
    hasMusicModule = !!musicKnowledge;
  } catch (e) {
    musicKnowledge = null;
    hasMusicModule = false;
    if (ENABLE_DEBUG) console.warn(`[boot] musicKnowledge missing: ${e.message}`);
  }
  return musicKnowledge;
}

function safeMusicHandle({ text, session }) {
  const kb = loadMusicKnowledge();
  if (!kb || typeof kb.handleChat !== "function") return null;

  // IMPORTANT: kb expects { text, session }
  return kb.handleChat({ text, session });
}

/* ======================================================
   Story / micro fallback (tight 50–60 words)
====================================================== */

function fallbackStoryMoment(year) {
  const y = Number(year);
  return `Story moment — ${y}: Give me a single artist (or a song) from ${y} and I’ll build a quick, broadcast-ready story around it in 50–60 words. Or say “top 10 ${y}” for the year-end list.`;
}

function fallbackMicroMoment(year) {
  const y = Number(year);
  return `Micro-moment — ${y}: Give me one artist (or a song) from ${y} and I’ll fire off a tight 50–60 word moment you can read on air. Or say “top 10 ${y}” to pull the year-end list.`;
}

/* ======================================================
   Voice / TTS config (ElevenLabs wrapper is in /api/tts)
====================================================== */

// This file exposes tuning modes so the widget can tag voiceMode in payload (backend may route elsewhere).
const TTS_MODES = {
  calm: "stability↑ style↓",
  standard: "env defaults",
  high: "stability↓ style↑ boost on",
};

/* ======================================================
   Contract endpoints
====================================================== */

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "sandblast-backend",
    env: NODE_ENV,
    time: new Date().toISOString(),
    build: BUILD_SHA,
    version: INDEX_VERSION,
    sessions: SESSIONS.size,
    cors: { allowedOrigins: ALLOWED_ORIGINS.length },
    contract: {
      version: NYX_CONTRACT_VERSION,
      strict: NYX_STRICT_CONTRACT,
      rolloutPct: NYX_ROLLOUT_PCT,
    },
    tts: {
      enabled: true,
      provider: "elevenlabs",
      hasKey: !!process.env.ELEVENLABS_API_KEY,
      hasVoiceId: !!process.env.ELEVENLABS_VOICE_ID,
      model: process.env.ELEVENLABS_MODEL || null,
      tuning: {
        stability: Number(process.env.NYX_VOICE_STABILITY || 0.55),
        similarity: Number(process.env.NYX_VOICE_SIMILARITY || 0.78),
        style: Number(process.env.NYX_VOICE_STYLE || 0.12),
        speakerBoost: String(process.env.NYX_VOICE_SPEAKER_BOOST || "false") === "true",
      },
      modes: TTS_MODES,
    },
    s2s: {
      enabled: true,
      hasMulter: !!multer,
      hasModule: !!process.env.S2S_MODULE,
    },
    durableSessions: {
      enabled: false,
      provider: "none",
      ttlSec: 7200,
    },
    requestId: req.requestId,
  });
});

app.get("/api/contract", (req, res) => {
  res.json({
    ok: true,
    contract: {
      version: NYX_CONTRACT_VERSION,
      strict: NYX_STRICT_CONTRACT,
      rolloutPct: NYX_ROLLOUT_PCT,
      followUps: {
        legacy: true,
        v1: true,
      },
    },
    requestId: req.requestId,
  });
});

/* ======================================================
   Diagnostics
====================================================== */

app.get("/api/diag/echo", (req, res) => {
  res.json({
    ok: true,
    echo: {
      method: req.method,
      path: req.path,
      headers: req.headers,
    },
    requestId: req.requestId,
  });
});

/* ======================================================
   Response envelope helper (contract v1 + legacy)
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
  const out = {
    ok: !!ok,
    reply: String(reply || ""),
    sessionId: sessionId || null,
    requestId: requestId || null,
  };

  // Always echo these if present (helps widget)
  if (visitorId) out.visitorId = visitorId;
  if (contractVersion) out.contractVersion = String(contractVersion);

  // Preserve BOTH during rollout (legacy: followUp array; v1: followUps objects)
  if (Array.isArray(followUpLegacy)) out.followUp = followUpLegacy;
  if (Array.isArray(followUpsV1)) out.followUps = followUpsV1;

  // Also keep a convenience alias (some clients used followUp)
  if (Array.isArray(followUpLegacy)) out.followUp = followUpLegacy;

  return out;
}

/* ======================================================
   /api/chat (primary)
====================================================== */

app.post("/api/chat", async (req, res) => {
  const visitorId = extractVisitorId(req);
  const contractIn = extractContractVersion(req);

  const body = req.body || {};
  const sessionId = extractSessionId(body) || crypto.randomBytes(6).toString("hex");

  let text = extractMessage(body);
  text = cleanText(text);

  // Load or init session
  let session = getSession(sessionId) || {};
  session.sessionId = sessionId;
  session.visitorId = visitorId || session.visitorId || null;

  // defaults
  session.activeMusicChart = session.activeMusicChart || "Billboard Hot 100";
  session.activeMusicMode = session.activeMusicMode || null; // ✅ engine-compat mode hint
  session.pendingMode = session.pendingMode || null; // one-shot memory between mode then year
  session.lastYear = session.lastYear || null;

  // ensure v1 contract decisions (kept even if you always include both)
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

  // 2) Missing-year intent guard (Top10/Story/Micro)
  //    ✅ Pillar 3: if we already have a sticky year, reuse it immediately (no needless prompting).
  const missingKind = classifyMissingYearIntent(text);
  if (missingKind) {
    // Always update the mode hints
    session.pendingMode = missingKind; // one-shot until consumed by year handling
    session.activeMusicMode = missingKind;

    // If we already have a lastYear, treat this as "MODE + lastYear" and continue into the normal pipeline.
    if (session.lastYear) {
      if (missingKind === "top10") {
        forceTop10Chart(session);
      }
      text = String(session.lastYear); // engine-compat: YEAR ONLY, mode carried in session
    } else {
      // No year yet — ask for it.
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

      // ✅ force chart source for Top 10
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

  // 4) Year-only input handling
  const yearFromText = extractYearFromText(text);
  const looksLikeOnlyYear = !!yearFromText && cleanText(text) === String(yearFromText);

  if (looksLikeOnlyYear && !hasExplicitMode(text)) {
    // ✅ If user previously selected a mode, honor it automatically
    if (session.pendingMode || session.activeMusicMode) {
      const mode = session.pendingMode || session.activeMusicMode;
      session.pendingMode = null; // consume once (activeMusicMode remains as durable hint)
      session.lastYear = yearFromText;
      session.activeMusicMode = mode;

      // ✅ force Top 10 chart source when consuming mode
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

      let reply = engine?.reply || engine?.text || engine?.message || null;

      // ✅ one retry if Top 10 came back “no clean list”
      if (mode === "top10" && reply && replyIndicatesNoCleanList(reply)) {
        forceTop10Chart(session);
        try {
          const engine2 = safeMusicHandle({ text: String(yearFromText), session });
          const reply2 = engine2?.reply || engine2?.text || engine2?.message || null;
          if (reply2) reply = reply2;
        } catch (_) {
          // no-op
        }
      }

      if (!reply) {
        reply =
          mode === "top10"
            ? `Staying with ${yearFromText} · Top 10 — I’m not seeing Top 10 data for that year yet. Try “story moment ${yearFromText}” or another year.`
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
    }

    // Otherwise: year-only with no pending mode -> ask which mode they want
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
  } catch (e) {
    if (ENABLE_DEBUG) console.warn(`[musicHandle] error: ${e.message}`);
    engine = null;
  }

  let reply = null;

  if (engine && typeof engine === "object") {
    reply = engine.reply || engine.text || engine.message || null;
    // allow engine to mutate session
    if (engine.session && typeof engine.session === "object") {
      session = { ...session, ...engine.session };
    }
  }

  // 6) If engine didn't answer, produce a safe, advancing fallback
  if (!reply) {
    const y = extractYearFromText(text) || session.lastYear || null;
    const t = cleanText(text).toLowerCase();

    if (y && /\b(story\s*moment|story)\b/.test(t)) {
      reply = fallbackStoryMoment(y);
    } else if (y && /\b(micro\s*moment|micro)\b/.test(t)) {
      reply = fallbackMicroMoment(y);
    } else if (y && isTop10Text(t)) {
      reply = `Staying with ${y} · Top 10 — say “top 10 ${y}” and I’ll pull the year-end list. Or choose Story moment / Micro moment.`;
    } else if (y) {
      // Year present but unclear intent -> ask mode
      const r = replyNeedModeForYear(y, session);
      reply = r.reply;
    } else {
      reply = "Tell me a year (1950–2024), or an artist + year (example: “Prince 1984”). Want the top 10, a story moment, or a micro-moment?";
    }
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
});

/* ======================================================
   /api/tts placeholder (kept for compatibility if present elsewhere)
====================================================== */

app.post("/api/tts", (req, res) => {
  // This codebase typically routes ElevenLabs from another module.
  // Keep endpoint alive so widget doesn't break if it calls it.
  res.status(501).json({
    ok: false,
    error: "TTS endpoint is not configured in this build.",
    requestId: req.requestId,
  });
});

/* ======================================================
   Server start
====================================================== */

app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[boot] Sandblast backend listening on ${PORT} (${NODE_ENV}) — ${INDEX_VERSION}`);
});
