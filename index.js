"use strict";

/**
 * Sandblast Backend — index.js (product-system hardened)
 *
 * PRODUCT-SYSTEM UPGRADES (all pillars):
 *
 * PILLAR A — Interaction Contract (UI ↔ Backend)
 *  - Adds contractVersion + visitorId + requestId
 *  - Adds structured followUps: [{label, send}] (v1)
 *  - Keeps legacy followUp: ["1950","Top 10",...] during rollout
 *  - Adds staged rollout: deterministic bucket by visitorId
 *  - Adds /api/contract to expose contract + rollout settings
 *
 * PILLAR B — Conversation Engine readiness
 *  - Missing-year guards for Top10/Story/Micro (chat + s2s transcript)
 *  - Consistent “next move” follow-ups in every non-terminal reply
 *  - Anti-loop gate with polite breaker (after 2 exact repeats)
 *
 * PILLAR C — Personality guardrails (public-safe)
 *  - Removes rude breaker language
 *  - Uses “broadcast confident” guiding prompts
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
const NYX_ROLLOUT_PCT = Math.max(
  0,
  Math.min(100, Number(process.env.NYX_ROLLOUT_PCT || "100"))
);

// Build stamp (Render commonly provides RENDER_GIT_COMMIT)
const BUILD_SHA =
  process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || process.env.COMMIT_SHA || null;

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
   CRITICAL: Preflight + CORS headers (browser unblock)
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
    "Content-Type, Authorization, X-Requested-With, X-Visitor-Id, X-Contract-Version, X-Client-Build"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
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
      "Authorization",
      "X-Requested-With",
      "X-Visitor-Id",
      "X-Contract-Version",
      "X-Client-Build",
    ],
    optionsSuccessStatus: 200,
    credentials: false,
  })
);

/* ======================================================
   Body parsing
====================================================== */

app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true }));

/* ======================================================
   Safe requires (don’t crash deploy if a module moves)
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

// Nyx voice naturalizer (optional)
const nyxVoiceNaturalize = safeRequire("./Utils/nyxVoiceNaturalize");

// Optional S2S/STT handlers
const s2sModule =
  safeRequire("./Utils/s2s") ||
  safeRequire("./Utils/speechToSpeech") ||
  safeRequire("./Utils/s2sHandler") ||
  safeRequire("./Utils/stt");

/* ======================================================
   Sessions (simple in-memory)
====================================================== */

const SESSIONS = new Map();
const SESSION_TTL_MIN = Number(process.env.SESSION_TTL_MINUTES || 120);

function nowMs() {
  return Date.now();
}

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
   Utility: request identifiers + timing
====================================================== */

function makeRequestId() {
  return crypto.randomBytes(8).toString("hex");
}

app.use((req, res, next) => {
  req._t0 = nowMs();
  req.requestId = makeRequestId();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

function finishTiming(req, res) {
  const ms = typeof req._t0 === "number" ? nowMs() - req._t0 : null;
  if (ms !== null) res.setHeader("X-Response-Time-ms", String(ms));
}

/* ======================================================
   Payload tolerance
====================================================== */

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function extractMessage(body) {
  if (!body || typeof body !== "object") return "";
  const candidates = [
    body.message,
    body.text,
    body.input,
    body.value,
    body.label,
    body.query,
  ];
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
   Contract: visitorId + version + staged rollout
====================================================== */

function extractContractVersion(req) {
  const hv = cleanText(req.headers["x-contract-version"]);
  const bv = cleanText(req.body?.contractVersion);
  return bv || hv || "0"; // "0" = legacy client
}

function extractClientBuild(req) {
  return cleanText(req.headers["x-client-build"] || req.body?.clientBuild || "");
}

function extractVisitorId(req) {
  // Prefer explicit
  const h = cleanText(req.headers["x-visitor-id"]);
  const b = cleanText(req.body?.visitorId);
  if (b) return b;
  if (h) return h;

  // If strict contract is on, require it
  if (NYX_STRICT_CONTRACT) return "";

  // Best-effort stable-ish fallback: hash IP+UA (not perfect but adequate for rollout)
  const ip = cleanText(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "0");
  const ua = cleanText(req.headers["user-agent"] || "ua");
  const raw = `${ip}|${ua}`;
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}

function stableBucket100(key) {
  const h = crypto.createHash("sha1").update(String(key || "0")).digest("hex");
  const n = parseInt(h.slice(0, 8), 16);
  return n % 100;
}

function shouldUseV1Contract(contractVersion, visitorId) {
  // If client claims v1+ AND rollout bucket allows it
  const cv = String(contractVersion || "0");
  if (cv === "0") return false;
  if (!visitorId) return false;
  const bucket = stableBucket100(visitorId);
  return bucket < NYX_ROLLOUT_PCT;
}

/* ======================================================
   Intent helpers
====================================================== */

function extractYearFromText(s) {
  const m = String(s || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/); // 1950–2024
  return m ? Number(m[1]) : null;
}

function classifyMissingYearIntent(s) {
  const t = cleanText(s).toLowerCase();
  const hasYear = extractYearFromText(t) !== null;
  if (hasYear) return null;

  if (/\btop\s*10\b/.test(t) || /\btop10\b/.test(t)) return "top10";
  if (/\bstory\s*moment\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b/.test(t)) return "micro";
  return null;
}

// Legacy quick picks
function buildYearFollowupStrings() {
  return ["1950", "1960", "1970", "1980", "1990", "2000", "2010", "2024"];
}

// Contract v1 follow-ups: actionable
function buildYearFollowUpsV1() {
  const years = buildYearFollowupStrings();
  return years.map((y) => ({ label: y, send: y }));
}

function buildActionFollowUpsV1(year) {
  const y = Number(year) || 1950;
  return [
    { label: `Top 10 (${y})`, send: `top 10 ${y}` },
    { label: `Story moment (${y})`, send: `story moment ${y}` },
    { label: `Micro moment (${y})`, send: `micro moment ${y}` },
  ];
}

function replyMissingYear(intent) {
  const label =
    intent === "top10" ? "Top 10" : intent === "story" ? "a story moment" : "a micro moment";
  const hint =
    intent === "top10"
      ? 'Try: “top 10 1950”'
      : intent === "story"
      ? 'Try: “story moment 1950”'
      : 'Try: “micro moment 1950”';

  return {
    reply: `Got you. What year should I use for ${label}? (1950–2024) ${hint}.`,
    // Provide both legacy + v1 follow-ups; wrapper will pick based on contract
    followUpLegacy: buildYearFollowupStrings(),
    followUpsV1: buildYearFollowUpsV1(),
  };
}

/* ======================================================
   Anti-loop gate (polite, after 2 repeats)
====================================================== */

function hashStr(s) {
  return crypto.createHash("sha1").update(String(s || "")).digest("hex");
}

function applyAntiLoop(session, userMsg, reply) {
  const msg = cleanText(userMsg);
  const rep = cleanText(reply);

  if (!msg || !rep) return { reply: rep, followUpLegacy: null, followUpsV1: null };

  session._loop = session._loop || {
    lastUserHash: null,
    lastReplyHash: null,
    repeats: 0,
  };

  const uH = hashStr(msg);
  const rH = hashStr(rep);

  const sameAsLast =
    session._loop.lastUserHash === uH && session._loop.lastReplyHash === rH;

  if (sameAsLast) session._loop.repeats += 1;
  else session._loop.repeats = 0;

  session._loop.lastUserHash = uH;
  session._loop.lastReplyHash = rH;

  if (session._loop.repeats >= 2) {
    const forced = [
      "Looks like we hit a repeat — let’s move forward.",
      "Pick one:",
      "• Top 10: “top 10 1950”",
      "• Story moment: “story moment 1950”",
      "• Micro moment: “micro moment 1950”",
      "Or type any year (1950–2024) and I’ll take it from there.",
    ].join(" ");

    return {
      reply: forced,
      followUpLegacy: buildYearFollowupStrings(),
      followUpsV1: buildYearFollowUpsV1(),
      _antiLoopTripped: true,
    };
  }

  return { reply: rep, followUpLegacy: null, followUpsV1: null };
}

/* ======================================================
   Response shaping (contract wrapper)
====================================================== */

function sendContracted(res, req, payload) {
  const contractVersion = extractContractVersion(req);
  const visitorId = extractVisitorId(req);
  const clientBuild = extractClientBuild(req);
  const useV1 = shouldUseV1Contract(contractVersion, visitorId);

  // Required core
  const reply = cleanText(payload.reply || "");
  const ok = payload.ok !== false;

  // Legacy followUp strings
  const followUpLegacy =
    payload.followUpLegacy ||
    payload.followUp ||
    payload.followup ||
    null;

  // v1 followUps objects
  const followUpsV1 =
    payload.followUpsV1 ||
    payload.followUps ||
    null;

  const out = {
    ok,
    reply: reply || "On air—tell me what you want to do, and I’ll take it from there.",
    sessionId: payload.sessionId || null,
    requestId: req.requestId,
    visitorId: visitorId || null,
    contractVersion: useV1 ? NYX_CONTRACT_VERSION : "0",
  };

  // Backward compatibility: always include legacy field if available
  if (Array.isArray(followUpLegacy)) out.followUp = followUpLegacy;
  else if (followUpLegacy === null) out.followUp = null;

  // v1 field: only if v1 contract is active; but we can include it safely too
  if (useV1 && Array.isArray(followUpsV1)) out.followUps = followUpsV1;
  else if (useV1) out.followUps = [];

  // Helpful context for debugging/harness (non-breaking)
  if (ENABLE_DEBUG) {
    out._debug = {
      useV1,
      contractIn: contractVersion,
      clientBuild: clientBuild || null,
      rolloutPct: NYX_ROLLOUT_PCT,
    };
  }

  finishTiming(req, res);
  return res.json(out);
}

/* ======================================================
   TTS (ElevenLabs)
====================================================== */

const ENABLE_TTS = (process.env.ENABLE_TTS || "true") === "true";
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "";
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

const NYX_VOICE_STABILITY = Number(process.env.NYX_VOICE_STABILITY || "0.35");
const NYX_VOICE_SIMILARITY = Number(process.env.NYX_VOICE_SIMILARITY || "0.80");
const NYX_VOICE_STYLE = Number(process.env.NYX_VOICE_STYLE || "0.25");
const NYX_VOICE_SPEAKER_BOOST =
  (process.env.NYX_VOICE_SPEAKER_BOOST || "true") === "true";

function normalizeTtsText(s) {
  const raw = cleanText(s);
  if (!raw) return "";
  if (nyxVoiceNaturalize && typeof nyxVoiceNaturalize === "function") {
    try {
      return nyxVoiceNaturalize(raw);
    } catch (_) {
      return raw;
    }
  }
  return raw;
}

async function elevenLabsTts(text) {
  const payloadText = normalizeTtsText(text);
  if (!payloadText) return null;

  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return { ok: false, error: "TTS_NOT_CONFIGURED" };
  }

  const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  const body = {
    text: payloadText,
    model_id: ELEVENLABS_MODEL_ID || undefined,
    voice_settings: {
      stability: NYX_VOICE_STABILITY,
      similarity_boost: NYX_VOICE_SIMILARITY,
      style: NYX_VOICE_STYLE,
      use_speaker_boost: NYX_VOICE_SPEAKER_BOOST,
    },
  };

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return { ok: false, error: `ELEVENLABS_${r.status}`, detail: t.slice(0, 400) };
  }

  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: true, audioBytes: buf.toString("base64"), audioMime: "audio/mpeg" };
}

async function handleTts(req, res) {
  try {
    if (!ENABLE_TTS) return res.status(503).json({ ok: false, error: "TTS_DISABLED" });

    const text = cleanText(req.body?.text || req.body?.message || req.body?.input || "");
    if (!text) return res.status(400).json({ ok: false, error: "NO_TEXT" });

    if (TTS_PROVIDER === "elevenlabs") {
      const out = await elevenLabsTts(text);
      if (!out || out.ok === false) {
        return res.status(500).json(out || { ok: false, error: "TTS_FAILED" });
      }
      finishTiming(req, res);
      return res.json({
        ok: true,
        audioBytes: out.audioBytes,
        audioMime: out.audioMime,
        requestId: req.requestId,
      });
    }

    return res.status(400).json({ ok: false, error: `UNKNOWN_TTS_PROVIDER:${TTS_PROVIDER}` });
  } catch (err) {
    console.error("[/api/tts] ERROR:", err);
    return res.status(500).json({ ok: false, error: "TTS_ERROR" });
  }
}

/* ======================================================
   Routes
====================================================== */

app.get("/", (req, res) => {
  finishTiming(req, res);
  return res.json({ ok: true, service: "sandblast-backend", requestId: req.requestId });
});

// Expose contract details for harness + staged rollout verification
app.get("/api/contract", (req, res) => {
  const visitorId = extractVisitorId(req);
  const contractIn = extractContractVersion(req);
  const useV1 = shouldUseV1Contract(contractIn, visitorId);

  finishTiming(req, res);
  return res.json({
    ok: true,
    contract: {
      current: NYX_CONTRACT_VERSION,
      strict: NYX_STRICT_CONTRACT,
      rolloutPct: NYX_ROLLOUT_PCT,
      clientSent: contractIn,
      using: useV1 ? NYX_CONTRACT_VERSION : "0",
    },
    visitorId: visitorId || null,
    requestId: req.requestId,
    build: BUILD_SHA,
  });
});

// Harness-friendly echo
app.post("/api/diag/echo", (req, res) => {
  const msg = extractMessage(req.body);
  const visitorId = extractVisitorId(req);
  const contractIn = extractContractVersion(req);
  const useV1 = shouldUseV1Contract(contractIn, visitorId);

  finishTiming(req, res);
  return res.json({
    ok: true,
    echo: msg,
    contractUsing: useV1 ? NYX_CONTRACT_VERSION : "0",
    requestId: req.requestId,
  });
});

app.get("/api/health", (req, res) => {
  finishTiming(req, res);
  res.json({
    ok: true,
    service: "sandblast-backend",
    env: NODE_ENV,
    time: new Date().toISOString(),
    build: BUILD_SHA,
    sessions: SESSIONS.size,
    cors: { allowedOrigins: ALLOWED_ORIGINS.length },
    contract: {
      version: NYX_CONTRACT_VERSION,
      strict: NYX_STRICT_CONTRACT,
      rolloutPct: NYX_ROLLOUT_PCT,
    },
    tts: {
      enabled: ENABLE_TTS,
      provider: TTS_PROVIDER,
      hasKey: Boolean(ELEVENLABS_API_KEY),
      hasVoiceId: Boolean(ELEVENLABS_VOICE_ID),
      model: ELEVENLABS_MODEL_ID || null,
      tuning: {
        stability: NYX_VOICE_STABILITY,
        similarity: NYX_VOICE_SIMILARITY,
        style: NYX_VOICE_STYLE,
        speakerBoost: NYX_VOICE_SPEAKER_BOOST,
      },
    },
    s2s: {
      enabled: Boolean(multer) && Boolean(s2sModule),
      hasMulter: Boolean(multer),
      hasModule: Boolean(s2sModule),
    },
  });
});

// Chat (musicMoments first, then musicKnowledge)
app.post("/api/chat", async (req, res) => {
  try {
    const contractIn = extractContractVersion(req);
    const visitorId = extractVisitorId(req);

    if (NYX_STRICT_CONTRACT && !visitorId) {
      return res.status(400).json({
        ok: false,
        error: "MISSING_VISITOR_ID",
        requestId: req.requestId,
      });
    }

    const sessionId = extractSessionId(req.body) || makeSessionId();
    const msg = extractMessage(req.body);

    if (ENABLE_DEBUG) {
      console.log("[/api/chat] requestId=", req.requestId);
      console.log("[/api/chat] origin=", req.headers.origin || "(none)");
      console.log("[/api/chat] sessionId=", sessionId, "visitorId=", visitorId, "msg=", msg);
      console.log("[/api/chat] contractIn=", contractIn);
    }

    const session =
      getSession(sessionId) || {
        _t: nowMs(),
        hasSpoken: false,
        activeMusicChart: "Billboard Hot 100",
      };

    if (!msg) {
      setSession(sessionId, session);
      return sendContracted(res, req, {
        ok: true,
        reply: "On air—welcome to Sandblast. I’m Nyx. Tell me what you’re here for, and I’ll take it from there.",
        followUpLegacy: null,
        followUpsV1: [],
        sessionId,
      });
    }

    // Guard: incomplete commands (prevents “Top 10” looping even with legacy widget)
    const missingIntent = classifyMissingYearIntent(msg);
    if (missingIntent) {
      const out = replyMissingYear(missingIntent);
      setSession(sessionId, session);
      return sendContracted(res, req, {
        ok: true,
        reply: out.reply,
        followUpLegacy: out.followUpLegacy,
        followUpsV1: out.followUpsV1,
        sessionId,
      });
    }

    // Route: curated moments first
    if (musicMoments && typeof musicMoments.handle === "function") {
      try {
        const out = musicMoments.handle(msg, session);
        if (out && out.reply) {
          if (out.sessionPatch && typeof out.sessionPatch === "object") {
            Object.assign(session, out.sessionPatch);
          }

          const loopFix = applyAntiLoop(session, msg, out.reply);
          setSession(sessionId, session);

          // Provide a “next move” if none is returned
          const yr = extractYearFromText(msg) || extractYearFromText(out.reply) || null;
          const nextV1 = yr ? buildActionFollowUpsV1(yr) : buildYearFollowUpsV1();
          const nextLegacy = yr ? [`top 10 ${yr}`, `story moment ${yr}`, `micro moment ${yr}`] : buildYearFollowupStrings();

          return sendContracted(res, req, {
            ok: true,
            reply: loopFix.reply,
            followUpLegacy: out.followUp || loopFix.followUpLegacy || nextLegacy,
            followUpsV1: out.followUps || loopFix.followUpsV1 || nextV1,
            sessionId,
          });
        }
      } catch (e) {
        if (ENABLE_DEBUG) console.warn("[musicMoments] fail:", e.message);
      }
    }

    // Fallback: musicKnowledge
    if (musicKnowledge && typeof musicKnowledge.handleChat === "function") {
      try {
        const out = musicKnowledge.handleChat({ text: msg, session });
        if (out && out.reply) {
          if (out.sessionPatch && typeof out.sessionPatch === "object") {
            Object.assign(session, out.sessionPatch);
          }

          const loopFix = applyAntiLoop(session, msg, out.reply);
          setSession(sessionId, session);

          const yr = extractYearFromText(msg) || extractYearFromText(out.reply) || null;
          const nextV1 = yr ? buildActionFollowUpsV1(yr) : buildYearFollowUpsV1();
          const nextLegacy = yr ? [`top 10 ${yr}`, `story moment ${yr}`, `micro moment ${yr}`] : buildYearFollowupStrings();

          return sendContracted(res, req, {
            ok: true,
            reply: loopFix.reply,
            followUpLegacy: out.followUp || loopFix.followUpLegacy || nextLegacy,
            followUpsV1: out.followUps || loopFix.followUpsV1 || nextV1,
            sessionId,
          });
        }
      } catch (e) {
        if (ENABLE_DEBUG) console.warn("[musicKnowledge] fail:", e.message);
      }
    }

    // Final fallback (guided, not dead-end)
    setSession(sessionId, session);
    return sendContracted(res, req, {
      ok: true,
      reply: "Tell me a year (1950–2024) and I’ll pull the Top 10, a story moment, or a micro moment.",
      followUpLegacy: buildYearFollowupStrings(),
      followUpsV1: buildYearFollowUpsV1(),
      sessionId,
    });
  } catch (err) {
    console.error("[/api/chat] ERROR:", err);
    return res.status(500).json({
      ok: false,
      reply: "I’m having trouble reaching my brain right now. Try again in a moment.",
      requestId: req.requestId,
    });
  }
});

// TTS + alias
app.post("/api/tts", handleTts);
app.post("/api/voice", handleTts);

/* ======================================================
   Speech-to-Speech / Speech-to-Text
====================================================== */

if (multer) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024 },
  });

  app.post("/api/s2s", upload.single("file"), async (req, res) => {
    try {
      const contractIn = extractContractVersion(req);
      const visitorId = extractVisitorId(req);

      if (NYX_STRICT_CONTRACT && !visitorId) {
        return res.status(400).json({
          ok: false,
          error: "MISSING_VISITOR_ID",
          requestId: req.requestId,
        });
      }

      const sessionId =
        req.body?.sessionId || req.headers["x-session-id"] || makeSessionId();

      const session =
        getSession(sessionId) || {
          _t: nowMs(),
          hasSpoken: false,
          activeMusicChart: "Billboard Hot 100",
        };

      if (!req.file || !req.file.buffer) {
        setSession(sessionId, session);
        return sendContracted(res, req, {
          ok: false,
          reply: "",
          followUpLegacy: null,
          followUpsV1: [],
          sessionId,
          error: "NO_AUDIO_FILE",
        });
      }

      if (!s2sModule) {
        setSession(sessionId, session);
        finishTiming(req, res);
        return res.status(501).json({
          ok: false,
          error: "S2S_NOT_CONFIGURED",
          detail:
            "No S2S module found. Add Utils/s2s.js (or speechToSpeech.js) and export a handler.",
          sessionId,
          requestId: req.requestId,
        });
      }

      const mimeType = req.file.mimetype || "audio/webm";
      const audioBuffer = req.file.buffer;

      let transcript = "";
      let reply = "";
      let audioBytes = null;
      let audioMime = null;

      if (typeof s2sModule.handle === "function") {
        const out = await s2sModule.handle({ audioBuffer, mimeType, session, sessionId });
        transcript = out?.transcript || "";
        reply = out?.reply || "";
        audioBytes = out?.audioBytes || null;
        audioMime = out?.audioMime || null;
        if (out?.sessionPatch && typeof out.sessionPatch === "object") {
          Object.assign(session, out.sessionPatch);
        }
      } else if (typeof s2sModule.handleS2S === "function") {
        const out = await s2sModule.handleS2S(req, session);
        transcript = out?.transcript || "";
        reply = out?.reply || "";
        audioBytes = out?.audioBytes || null;
        audioMime = out?.audioMime || null;
        if (out?.sessionPatch && typeof out.sessionPatch === "object") {
          Object.assign(session, out.sessionPatch);
        }
      } else if (typeof s2sModule.transcribe === "function") {
        transcript = cleanText(await s2sModule.transcribe(audioBuffer, mimeType));
        // Route transcript through /api/chat handler path
        const chatOut = await new Promise((resolve) => {
          const fakeReq = { body: { message: transcript, sessionId } };
          const fakeRes = {
            json: (o) => resolve(o),
            status: () => fakeRes,
          };
          app._router.handle(
            { ...req, method: "POST", url: "/api/chat", body: fakeReq.body },
            fakeRes,
            () => resolve({ ok: false })
          );
        });
        reply = chatOut?.reply || "";
      } else {
        setSession(sessionId, session);
        finishTiming(req, res);
        return res.status(501).json({
          ok: false,
          error: "S2S_MODULE_SHAPE_UNKNOWN",
          detail:
            "Expected Utils/s2s to export handle() or handleS2S() or transcribe().",
          sessionId,
          requestId: req.requestId,
        });
      }

      // Missing-year guard for voice transcripts
      const missingIntent = classifyMissingYearIntent(transcript || "");
      let followUpLegacy = null;
      let followUpsV1 = null;

      if (missingIntent) {
        const out = replyMissingYear(missingIntent);
        reply = out.reply;
        followUpLegacy = out.followUpLegacy;
        followUpsV1 = out.followUpsV1;
      }

      // If no audio returned by s2s module, optionally synthesize reply via TTS
      if (!audioBytes && ENABLE_TTS && cleanText(reply)) {
        const ttsOut = await elevenLabsTts(reply);
        if (ttsOut?.ok) {
          audioBytes = ttsOut.audioBytes;
          audioMime = ttsOut.audioMime;
        }
      }

      // Anti-loop breaker (uses transcript as userMsg)
      const loopFix = applyAntiLoop(session, transcript || "[voice]", reply || "");
      reply = loopFix.reply;

      // Provide “next move” follow-ups if missing
      const yr = extractYearFromText(transcript) || extractYearFromText(reply) || null;
      const nextV1 = yr ? buildActionFollowUpsV1(yr) : buildYearFollowUpsV1();
      const nextLegacy = yr ? [`top 10 ${yr}`, `story moment ${yr}`, `micro moment ${yr}`] : buildYearFollowupStrings();

      setSession(sessionId, session);

      // s2s has extra fields; still wrap contract
      // (We keep transcript + audio fields in the response)
      const contracted = {
        ok: true,
        reply: cleanText(reply),
        followUpLegacy: followUpLegacy || loopFix.followUpLegacy || nextLegacy,
        followUpsV1: followUpsV1 || loopFix.followUpsV1 || nextV1,
        sessionId,
      };

      // Send contracted base first, then decorate
      const contractVersion = extractContractVersion(req);
      const useV1 = shouldUseV1Contract(contractVersion, visitorId);
      const base = {
        ok: true,
        transcript: transcript || "",
        reply: contracted.reply,
        sessionId,
        requestId: req.requestId,
        visitorId: visitorId || null,
        contractVersion: useV1 ? NYX_CONTRACT_VERSION : "0",
        followUp: contracted.followUpLegacy || null,
        followUps: useV1 ? contracted.followUpsV1 || [] : undefined,
        audioBytes: audioBytes || null,
        audioMime: audioMime || null,
      };

      finishTiming(req, res);
      return res.json(base);
    } catch (err) {
      console.error("[/api/s2s] ERROR:", err);
      return res.status(500).json({ ok: false, error: "S2S_ERROR", requestId: req.requestId });
    }
  });
} else {
  app.post("/api/s2s", (req, res) => {
    finishTiming(req, res);
    res.status(501).json({
      ok: false,
      error: "S2S_MULTER_NOT_INSTALLED",
      detail: "Install multer to enable multipart audio uploads: npm i multer",
      requestId: req.requestId,
    });
  });
}

/* ======================================================
   Error handler (prevents silent failures in production)
====================================================== */

app.use((err, req, res, next) => {
  console.error("[express] ERROR:", err);
  finishTiming(req, res);
  res.status(500).json({
    ok: false,
    error: "INTERNAL_ERROR",
    requestId: req?.requestId || null,
  });
  next();
});

/* ======================================================
   Start
====================================================== */

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[sandblast-backend] up :${PORT} env=${NODE_ENV} build=${BUILD_SHA || "n/a"} contract=${NYX_CONTRACT_VERSION} rollout=${NYX_ROLLOUT_PCT}%`
  );
});
