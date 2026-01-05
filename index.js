"use strict";

/**
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
 *  - Consistent “next move” follow-ups in non-terminal replies
 *  - Anti-loop gate with polite breaker (after 2 exact repeats)
 *
 * PILLAR B.1 — Prime Directive (Conversation Advancement)
 *  - Nyx must ALWAYS advance the conversation (no dead ends)
 *  - Every non-terminal reply gets 2–3 concrete next moves (chips + prose)
 *  - Adds light state anchoring (year/mode/chart) to reduce loop risk
 *  - Normalize mixed-mode examples so replies stay consistent
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
const INDEX_VERSION = "index.js v1.0.1 (P2 year-only mode guard)";

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

/* ======================================================
   Preflight + CORS headers (browser unblock)
====================================================== */

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, X-Requested-With, X-Visitor-Id, X-Contract-Version, X-Request-Id"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true, requestId: req.requestId });
  }

  next();
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/server-to-server
      if (isAllowedOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Accept",
      "Authorization",
      "X-Requested-With",
      "X-Visitor-Id",
      "X-Contract-Version",
      "X-Request-Id",
    ],
    optionsSuccessStatus: 200,
    credentials: false,
  })
);

/* ======================================================
   Body parsing
====================================================== */

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

/* ======================================================
   Safe requires
====================================================== */

function safeRequire(p) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(p);
  } catch (e) {
    if (ENABLE_DEBUG) console.warn(`[safeRequire] ${p} failed: ${e.message}`);
    return null;
  }
}

const musicMoments = safeRequire("./Utils/musicMoments");
const musicKnowledge = safeRequire("./Utils/musicKnowledge");

// Optional: Nyx voice naturalizer
const nyxVoiceNaturalize = safeRequire("./Utils/nyxVoiceNaturalize");

// Optional S2S/STT handlers
const s2sModule =
  safeRequire("./Utils/s2s") ||
  safeRequire("./Utils/speechToSpeech") ||
  safeRequire("./Utils/s2sHandler") ||
  safeRequire("./Utils/stt");

/* ======================================================
   Sessions (in-memory)
====================================================== */

const SESSIONS = new Map();
const SESSION_TTL_MIN = Number(process.env.SESSION_TTL_MINUTES || 120);

function makeSessionId() {
  return crypto.randomBytes(9).toString("hex");
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const s = SESSIONS.get(sessionId);
  if (!s) return null;

  const ageMin = (nowMs() - (s._t || 0)) / 60000;
  if (ageMin > SESSION_TTL_MIN) {
    SESSIONS.delete(sessionId);
    return null;
  }

  s._t = nowMs();
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
  if (String(contractIn) === NYX_CONTRACT_VERSION) return true;
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
      reply: "Hi — done. What year (1950–2024) for the micro moment?",
      followUpLegacy,
      followUpsV1,
    };
  }

  return {
    reply: "Hi — what year (1950–2024) do you want?",
    followUpLegacy,
    followUpsV1,
  };
}

// ✅ P2 fix: year-only should prompt for mode (Top 10 / Story / Micro), not redirect to “try story moment …”
function replyNeedModeForYear(year, session) {
  const followUpLegacy = buildYearFollowupStrings();
  const followUpsV1 = buildYearFollowupsV1();

  if (session && typeof session === "object") {
    session.lastYear = year;
  }

  return {
    reply: `Got it — ${year}. What do you want: Top 10, Story moment, or Micro moment?`,
    followUpLegacy,
    followUpsV1,
  };
}

/* ======================================================
   Anti-loop gate (exact-repeat breaker)
====================================================== */

function normalizeForRepeatCheck(s) {
  return cleanText(s).toLowerCase();
}

function antiLoopGuard(session, proposedReply) {
  if (!session) return { reply: proposedReply, tripped: false };
  const r = normalizeForRepeatCheck(proposedReply);
  if (!r) return { reply: proposedReply, tripped: false };

  session._repeat = session._repeat || { last: null, count: 0 };

  if (session._repeat.last === r) {
    session._repeat.count += 1;
  } else {
    session._repeat.last = r;
    session._repeat.count = 0;
  }

  // after 2 exact repeats, break
  if (session._repeat.count >= 2) {
    session._repeat.count = 0;
    session._repeat.last = null;
    return {
      reply:
        "Hi — quick reset so we don’t loop. Pick one: say “top 10 1988”, “story moment 1955”, or “micro moment 1959”.",
      tripped: true,
    };
  }

  return { reply: proposedReply, tripped: false };
}

/* ======================================================
   Voice modes (widget tags -> backend visibility)
====================================================== */

function normalizeVoiceMode(v) {
  const t = cleanText(v).toLowerCase();
  if (t === "calm") return "calm";
  if (t === "high" || t === "high energy" || t === "highenergy") return "high";
  return "standard";
}

// ElevenLabs tuning defaults (your current live values)
const ELEVENLABS_ENABLED = (process.env.ELEVENLABS_ENABLED || "true") === "true";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_KEY || null;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || process.env.NYX_VOICE_ID || null;
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || null;

const TUNE_DEFAULT = {
  stability: Number(process.env.NYX_VOICE_STABILITY || 0.55),
  similarity: Number(process.env.NYX_VOICE_SIMILARITY || 0.78),
  style: Number(process.env.NYX_VOICE_STYLE || 0.12),
  speakerBoost: (process.env.NYX_VOICE_SPEAKER_BOOST || "false") === "true",
};

function tuningForMode(mode) {
  const m = normalizeVoiceMode(mode);
  if (m === "calm") {
    return {
      stability: Math.min(1, TUNE_DEFAULT.stability + 0.15),
      similarity: TUNE_DEFAULT.similarity,
      style: Math.max(0, TUNE_DEFAULT.style - 0.08),
      speakerBoost: false,
    };
  }
  if (m === "high") {
    return {
      stability: Math.max(0, TUNE_DEFAULT.stability - 0.15),
      similarity: TUNE_DEFAULT.similarity,
      style: Math.min(1, TUNE_DEFAULT.style + 0.18),
      speakerBoost: true,
    };
  }
  return { ...TUNE_DEFAULT };
}

/* ======================================================
   Conversation helpers (Prime Directive)
====================================================== */

function ensureNextMoveSuffix(reply, session) {
  const t = cleanText(reply);
  if (!t)
    return "Hi — welcome to Sandblast. I’m Nyx. Give me a year (1950–2024) and choose: Top 10, Story moment, or Micro moment.";

  // If it already ends with a clear next step, don't bloat it.
  const hasNextMove =
    /give me a year|pick one|say “top 10|say "top 10|choose: top 10|what year|what do you want|want the top 10|micro-moment|micro moment|story moment/i.test(
      t
    );

  if (hasNextMove) return t;

  // Default nudge: keep it tight and consistent with chips.
  return `${t} Want the top 10, a story moment, or a micro-moment?`;
}

function greetingReply() {
  // MUST include hi/hey/welcome token(s) for harness.
  return "Hi — welcome to Sandblast. I’m Nyx. Give me a year (1950–2024) and choose: Top 10, Story moment, or Micro moment.";
}

/* ======================================================
   Music routing (delegates to Utils when available)
====================================================== */

function safeMusicHandle({ text, session }) {
  // Prefer musicMoments if deployed and has handler
  if (musicMoments && typeof musicMoments.handleChat === "function") {
    return musicMoments.handleChat({ text, session });
  }
  if (musicKnowledge && typeof musicKnowledge.handleChat === "function") {
    return musicKnowledge.handleChat({ text, session });
  }
  return null;
}

// Fallback story/micro if modules are absent (keeps flow alive)
function fallbackStoryMoment(year) {
  return `Staying with ${year} · Story moment — Story moment — ${year}: Here’s your on-air snapshot: one dominant #1, a close runner-up, and a cultural shift you can feel in the grooves. Want the top 10, a micro-moment, or the next year?`;
}

function fallbackMicroMoment(year) {
  return `Staying with ${year} · Micro moment — ${year} in 50 seconds: the hook hits fast, the chorus sticks, and you can hear the decade’s sound turning a corner. Want the top 10, a story moment, or the next year?`;
}

/* ======================================================
   Contracted response builder
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
    reply: reply || "",
    sessionId: sessionId || null,
    requestId: requestId || null,
    visitorId: visitorId || null,
    contractVersion: contractVersion || null,
  };

  // Always include both during rollout (safe for older widgets)
  out.followUp = Array.isArray(followUpLegacy) ? followUpLegacy : null;
  out.followUps = Array.isArray(followUpsV1) ? followUpsV1 : null;

  // also include a simple followUp array for quick clients
  out.followUp = out.followUp || buildYearFollowupStrings();
  out.followUps = out.followUps || buildYearFollowupsV1();

  return out;
}

/* ======================================================
   Routes
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
      enabled: !!(ELEVENLABS_ENABLED && ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
      provider: "elevenlabs",
      hasKey: !!ELEVENLABS_API_KEY,
      hasVoiceId: !!ELEVENLABS_VOICE_ID,
      model: ELEVENLABS_MODEL,
      tuning: { ...TUNE_DEFAULT },
      modes: {
        calm: "stability↑ style↓",
        standard: "env defaults",
        high: "stability↓ style↑ boost on",
      },
    },
    s2s: { enabled: true, hasMulter: !!multer, hasModule: !!s2sModule },
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
      followUpsShape: "v1",
      legacyFollowUp: true,
    },
    requestId: req.requestId,
  });
});

app.post("/api/diag/echo", (req, res) => {
  res.json({
    ok: true,
    requestId: req.requestId,
    headers: {
      origin: req.headers.origin || null,
      "x-visitor-id": req.headers["x-visitor-id"] || null,
      "x-contract-version": req.headers["x-contract-version"] || null,
    },
    body: req.body || null,
  });
});

/* ======================================================
   /api/chat (main)
====================================================== */

app.post("/api/chat", (req, res) => {
  const visitorId = extractVisitorId(req);
  const contractIn = extractContractVersion(req);

  const body = req.body || {};
  const text = extractMessage(body);
  const voiceMode = normalizeVoiceMode(body.voiceMode || body.voice_mode || body.mode);

  let sessionId = extractSessionId(body);
  if (!sessionId) sessionId = makeSessionId();

  let session = getSession(sessionId);
  if (!session) session = {};

  // keep light state anchors
  session.lastVoiceMode = voiceMode || session.lastVoiceMode || "standard";
  session.activeMusicChart = session.activeMusicChart || "Billboard Hot 100";

  // ensure v1 contract decisions (kept even if you always include both)
  const useV1 = shouldUseV1Contract(contractIn, visitorId);

  // 1) Greeting
  if (isGreeting(text)) {
    const reply0 = greetingReply();
    const guarded = antiLoopGuard(session, reply0);

    setSession(sessionId, session);

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
  const missingKind = classifyMissingYearIntent(text);
  if (missingKind) {
    const r = replyMissingYear(missingKind);
    const guarded = antiLoopGuard(session, r.reply);

    setSession(sessionId, session);

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

  // 3) ✅ Year-only input -> prompt for mode (Top 10 / Story / Micro) instead of downstream redirect
  const yearFromText = extractYearFromText(text);
  const looksLikeOnlyYear = !!yearFromText && cleanText(text) === String(yearFromText);

  if (looksLikeOnlyYear && !hasExplicitMode(text)) {
    const r = replyNeedModeForYear(yearFromText, session);
    const guarded = antiLoopGuard(session, r.reply);

    setSession(sessionId, session);

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

  // 4) Delegate to music engine when available
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

  // 5) If engine didn't answer, produce a safe, advancing fallback
  if (!reply) {
    const y = extractYearFromText(text) || session.lastYear || null;
    const t = cleanText(text).toLowerCase();

    if (y && /\bstory\b|\bstory\s*moment\b/.test(t)) reply = fallbackStoryMoment(y);
    else if (y && /\bmicro\b|\bmicro\s*moment\b/.test(t)) reply = fallbackMicroMoment(y);
    else if (y && /\btop\s*10\b|\btop10\b/.test(t)) {
      reply = `Staying with ${y} · Top 10 — Say “top 10 ${y}” and I’ll read it out clean. Want Story moment or Micro moment instead?`;
    } else {
      reply = "Hi — tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.";
    }
  }

  // Prime Directive: keep endings consistent, prevent loops
  reply = ensureNextMoveSuffix(reply, session);
  const guarded = antiLoopGuard(session, reply);

  // Commit session
  setSession(sessionId, session);

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
   /api/tts + /api/voice (ElevenLabs wrapper)
====================================================== */

async function elevenlabsTts({ text, mode }) {
  const fetch = global.fetch || (await import("node-fetch")).default; // Node 18 has fetch; fallback if needed

  if (!ELEVENLABS_ENABLED || !ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    const err = new Error("TTS_DISABLED");
    err.code = "TTS_DISABLED";
    throw err;
  }

  let outText = String(text || "").trim();
  if (nyxVoiceNaturalize && typeof nyxVoiceNaturalize === "function") {
    try {
      outText = nyxVoiceNaturalize(outText);
    } catch (_) {
      // ignore naturalizer failure
    }
  }

  const tuning = tuningForMode(mode);

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}`;

  const payload = {
    text: outText,
    model_id: ELEVENLABS_MODEL || undefined,
    voice_settings: {
      stability: tuning.stability,
      similarity_boost: tuning.similarity,
      style: tuning.style,
      use_speaker_boost: !!tuning.speakerBoost,
    },
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    const err = new Error(`TTS_FAILED:${resp.status}`);
    err.code = "TTS_FAILED";
    err.detail = detail;
    throw err;
  }

  const buf = Buffer.from(await resp.arrayBuffer());
  return { audioBuffer: buf, contentType: "audio/mpeg", tuning };
}

app.post("/api/tts", async (req, res) => {
  try {
    const body = req.body || {};
    const rawText = body.text || body.message || body.reply || "";
    const mode = normalizeVoiceMode(body.voiceMode || body.voice_mode || body.mode);

    // allow NO_TEXT payload compatibility, return 400 if empty
    const t = String(rawText || "").trim();
    if (!t) {
      return res.status(400).json({ ok: false, error: "BAD_REQUEST", detail: "NO_TEXT", requestId: req.requestId });
    }

    const { audioBuffer, contentType } = await elevenlabsTts({ text: t, mode });

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Request-Id", req.requestId);
    res.send(audioBuffer);
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.code || "TTS_ERROR",
      detail: e.detail || e.message || String(e),
      requestId: req.requestId,
    });
  }
});

// Alias: /api/voice
app.post("/api/voice", (req, res) => {
  req.url = "/api/tts";
  return app._router.handle(req, res);
});

/* ======================================================
   /api/s2s (optional)
====================================================== */

let upload = null;
if (multer) {
  upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
}

app.post("/api/s2s", upload ? upload.single("audio") : (req, res, next) => next(), async (req, res) => {
  try {
    if (!s2sModule) {
      return res
        .status(501)
        .json({ ok: false, error: "NOT_IMPLEMENTED", detail: "S2S_MODULE_MISSING", requestId: req.requestId });
    }

    if (typeof s2sModule.handle !== "function" && typeof s2sModule.handleS2S !== "function") {
      return res
        .status(501)
        .json({ ok: false, error: "NOT_IMPLEMENTED", detail: "S2S_HANDLER_MISSING", requestId: req.requestId });
    }

    const handler = s2sModule.handle || s2sModule.handleS2S;

    const result = await handler({
      req,
      file: req.file || null,
      body: req.body || {},
      requestId: req.requestId,
    });

    return res.json({ ok: true, ...result, requestId: req.requestId });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "S2S_ERROR", detail: e.message || String(e), requestId: req.requestId });
  }
});

/* ======================================================
   JSON parse error handler (INVALID_JSON)
====================================================== */

app.use((err, req, res, next) => {
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: "INVALID_JSON",
      requestId: req.requestId,
    });
  }
  return next(err);
});

/* ======================================================
   Boot
====================================================== */

app.listen(PORT, "0.0.0.0", () => {
  // Keep this exact log format; you’re using it as a sanity signal.
  // Example: [sandblast-backend] up :10000 env=production build=n/a contract=1 rollout=100%
  const build = BUILD_SHA || "n/a";
  console.log(
    `[sandblast-backend] up :${PORT} env=${NODE_ENV} build=${build} contract=${NYX_CONTRACT_VERSION} rollout=${NYX_ROLLOUT_PCT}% version=${INDEX_VERSION}`
  );
});
