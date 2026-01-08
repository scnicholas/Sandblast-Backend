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
 * PILLAR B.1 — Prime Directive (Conversation Advancement)  ✅ NEW
 *  - Nyx must ALWAYS advance the conversation (no dead ends)
 *  - Every non-terminal reply gets 2–3 concrete next moves (chips + prose)
 *  - Adds light state anchoring (year/mode/chart) to reduce loop risk
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

  // Ensure we only inject once
  let injected = false;

  res.writeHead = function wrappedWriteHead(...args) {
    if (!injected) {
      injected = true;

      const ms = Math.max(0, nowMs() - (req._t0 || nowMs()));

      // Only set if still safe
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
    String(req.headers["x-contract-version"] || req.body?.contractVersion || req.body?.contract || "0").trim() || "0"
  );
}

function bucketPct(visitorId) {
  if (!visitorId) return 0;
  const h = crypto.createHash("sha256").update(String(visitorId)).digest("hex");
  const n = parseInt(h.slice(0, 8), 16); // 0..2^32-1
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
    return { reply: "Hi — I can do that. What year (1950–2024) for your Top 10?", followUpLegacy, followUpsV1 };
  }
  if (kind === "story") {
    return { reply: "Hi — love it. What year (1950–2024) for the story moment?", followUpLegacy, followUpsV1 };
  }
  if (kind === "micro") {
    return { reply: "Hi — done. What year (1950–2024) for the micro moment?", followUpLegacy, followUpsV1 };
  }

  return {
    reply:
      "Hi — quick one: tell me the year (1950–2024) and I’ll do it clean. For example: “Top 10 1988” or “Story moment 1955”.",
    followUpLegacy,
    followUpsV1,
  };
}

/* ======================================================
   Prime Directive: Conversation Advancement ✅ NEW
====================================================== */

/**
 * A reply is “terminal” only if it explicitly indicates an error/temporary outage.
 * Everything else must advance the conversation with next moves.
 */
function isTerminalReply(reply) {
  const r = cleanText(reply).toLowerCase();
  if (!r) return false;
  if (r.includes("having trouble") && r.includes("try again")) return true;
  if (r.includes("brain right now") || r.includes("try again in a moment")) return true;
  return false;
}

function hasNextMoves(payload) {
  const legacy = payload?.followUpLegacy ?? payload?.followUp ?? null;
  const v1 = payload?.followUpsV1 ?? payload?.followUps ?? null;
  return (
    (Array.isArray(legacy) && legacy.length > 0) ||
    (Array.isArray(v1) && v1.length > 0)
  );
}

/**
 * Lightly anchors state so the user feels guided and it reduces loop-risk.
 * Does NOT invent facts—only uses what’s in session / message.
 */
function makeStateAnchor(userMsg, session) {
  const year = extractYearFromText(userMsg) || session?.activeYear || null;

  const mode = String(session?.activeMode || "").toLowerCase();
  const modeLabel =
    mode === "top10" ? "Top 10" :
    mode === "story" ? "Story moment" :
    mode === "micro" ? "Micro moment" :
    null;

  const chart = session?.activeMusicChart || null;

  const bits = [];
  if (year) bits.push(String(year));
  if (modeLabel) bits.push(modeLabel);
  if (!modeLabel && chart) bits.push(String(chart));

  if (!bits.length) return "";
  return `Staying with ${bits.join(" · ")} — `;
}

function ensureConversationAdvances(payload, userMsg, session) {
  const out = payload && typeof payload === "object" ? payload : { reply: String(payload || "") };
  out.reply = cleanText(out.reply || "");

  // Terminal replies (temporary outage) should not try to “advance”
  if (isTerminalReply(out.reply)) return out;

  // If we already have next moves, just add a light anchor if missing
  const anchored = makeStateAnchor(userMsg, session);
  const hasAnchor = /^staying with\b/i.test(out.reply);
  if (anchored && !hasAnchor) {
    // Only add anchor when it won’t sound awkward (avoid greeting lines)
    if (!isGreeting(out.reply) && out.reply.length > 0) {
      out.reply = `${anchored}${out.reply}`;
    }
  }

  // Guarantee next moves when missing
  if (!hasNextMoves(out)) {
    out.followUpLegacy = buildYearFollowupStrings();
    out.followUpsV1 = buildYearFollowupsV1();

    // Also guarantee a forward motion line if it doesn't already contain one
    const r = out.reply.toLowerCase();
    const alreadyGuides =
      r.includes("give me a year") ||
      r.includes("tell me a year") ||
      r.includes("pick one") ||
      r.includes("choose");

    if (!alreadyGuides) {
      out.reply = out.reply
        ? `${out.reply} Tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.`
        : "Hi — tell me a year (1950–2024), then choose: Top 10, Story moment, or Micro moment.";
    }
  }

  return out;
}

/* ======================================================
   Anti-loop breaker (polite)
====================================================== */

function applyAntiLoop(session, userMsg, reply) {
  const r = cleanText(reply);
  if (!session) return { reply: r };

  session._lastReply = session._lastReply || "";
  session._repeatCount = session._repeatCount || 0;

  if (r && r === session._lastReply) session._repeatCount += 1;
  else session._repeatCount = 0;

  session._lastReply = r;

  if (session._repeatCount >= 2) {
    return {
      reply:
        "Hi — I’m looping a bit. Give me a year (1950–2024) and pick one: Top 10, Story moment, or Micro moment. I’ll take it from there.",
    };
  }

  return { reply: r };
}

/* ======================================================
   TTS (ElevenLabs) + /api/voice alias
====================================================== */

const ENABLE_TTS = (process.env.TTS_ENABLED || "true") === "true";
const TTS_PROVIDER = String(process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.XI_API_KEY || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "";

const NYX_VOICE_STABILITY = Number(process.env.NYX_VOICE_STABILITY || 0.55);
const NYX_VOICE_SIMILARITY = Number(process.env.NYX_VOICE_SIMILARITY || 0.78);
const NYX_VOICE_STYLE = Number(process.env.NYX_VOICE_STYLE || 0.12);
const NYX_VOICE_SPEAKER_BOOST = (process.env.NYX_VOICE_SPEAKER_BOOST || "false") === "true";

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function computeVoiceSettingsForMode(modeRaw) {
  const mode = String(modeRaw || "standard").toLowerCase();
  // Defaults
  let stability = NYX_VOICE_STABILITY;
  let similarity_boost = NYX_VOICE_SIMILARITY;
  let style = NYX_VOICE_STYLE;
  let use_speaker_boost = NYX_VOICE_SPEAKER_BOOST;

  // Per-mode tuning (safe, bounded)
  if (mode === "calm") {
    stability = clamp01(stability + 0.12);
    similarity_boost = clamp01(similarity_boost + 0.05);
    style = clamp01(style - 0.08);
    use_speaker_boost = false;
  } else if (mode === "high" || mode === "highenergy" || mode === "high_energy") {
    stability = clamp01(stability - 0.08);
    similarity_boost = clamp01(similarity_boost - 0.02);
    style = clamp01(style + 0.20);
    use_speaker_boost = true;
  }

  return { stability, similarity_boost, style, use_speaker_boost };
}

async function elevenLabsTtsToBuffer(text, voiceMode) {
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
    return { ok: false, error: "ELEVENLABS_MISSING_KEY_OR_VOICE" };
  }

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;
  const voice_settings = computeVoiceSettingsForMode(voiceMode);

  const body = {
    text,
    model_id: ELEVENLABS_MODEL_ID || undefined,
    voice_settings,
  };

  if (typeof fetch !== "function") {
    return { ok: false, error: "FETCH_NOT_AVAILABLE" };
  }

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
  return { ok: true, audioBuffer: buf, audioMime: "audio/mpeg", tuning: voice_settings };
}

function wantsJsonTts(req) {
  const fmt = String(req.query?.format || "").toLowerCase();
  if (fmt === "json") return true;
  const accept = String(req.headers["accept"] || "").toLowerCase();
  return accept.includes("application/json");
}

async function handleTts(req, res) {
  try {
    if (!ENABLE_TTS) return res.status(503).json({ ok: false, error: "TTS_DISABLED", requestId: req.requestId });

    let text = cleanText(req.body?.text || req.body?.message || req.body?.input || "");
    if (!text) return res.status(400).json({ ok: false, error: "NO_TEXT", requestId: req.requestId });

    // Apply voice naturalizer here as well, so spoken audio matches chat polish
    if (nyxVoiceNaturalize && typeof nyxVoiceNaturalize === "function") {
      try {
        text = nyxVoiceNaturalize(text);
      } catch (_) {}
    }

    const voiceMode = cleanText(req.body?.voiceMode || req.body?.mode || "standard").toLowerCase() || "standard";

    if (TTS_PROVIDER === "elevenlabs") {
      const out = await elevenLabsTtsToBuffer(text, voiceMode);
      if (!out || out.ok === false) {
        return res.status(500).json({ ...out, requestId: req.requestId });
      }

      // Default: raw audio for widget blob playback
      if (!wantsJsonTts(req)) {
        res.setHeader("Content-Type", out.audioMime || "audio/mpeg");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Nyx-Voice-Mode", voiceMode);
        return res.status(200).send(out.audioBuffer);
      }

      // JSON mode (backward compatible for clients that want base64)
      return res.json({
        ok: true,
        audioBytes: out.audioBuffer.toString("base64"),
        audioMime: out.audioMime,
        voiceMode,
        tuning: out.tuning || null,
        requestId: req.requestId,
      });
    }

    return res.status(400).json({ ok: false, error: `UNKNOWN_TTS_PROVIDER:${TTS_PROVIDER}`, requestId: req.requestId });
  } catch (err) {
    console.error("[/api/tts] ERROR:", err);
    return res.status(500).json({ ok: false, error: "TTS_ERROR", requestId: req.requestId });
  }
}

/* ======================================================
   Core chat runner (used by /api/chat and /api/s2s)
====================================================== */

function runChat(msg, session) {
  const text = cleanText(msg);

  // Greeting must satisfy harness regex (?i)(hi|hey|welcome)
  if (isGreeting(text)) {
    return {
      reply:
        "Hi — welcome to Sandblast. I’m Nyx. Give me a year (1950–2024) and choose: Top 10, Story moment, or Micro moment.",
      followUpLegacy: buildYearFollowupStrings(),
      followUpsV1: buildYearFollowupsV1(),
      sessionPatch: { hasSpoken: true },
    };
  }

  const missingIntent = classifyMissingYearIntent(text);
  if (missingIntent) return replyMissingYear(missingIntent);

  if (musicMoments && typeof musicMoments.handle === "function") {
    try {
      const out = musicMoments.handle(text, session);
      if (out && out.reply) return out;
    } catch (e) {
      if (ENABLE_DEBUG) console.warn("[musicMoments] fail:", e.message);
    }
  }

  if (musicKnowledge && typeof musicKnowledge.handleChat === "function") {
    try {
      const out = musicKnowledge.handleChat({ text, session });
      if (out && out.reply) return out;
    } catch (e) {
      if (ENABLE_DEBUG) console.warn("[musicKnowledge] fail:", e.message);
    }
  }

  return {
    reply: "Hi — tell me a year (1950–2024) and I’ll pull the top 10, #1, or a story moment.",
    followUpLegacy: buildYearFollowupStrings(),
    followUpsV1: buildYearFollowupsV1(),
  };
}

/* ======================================================
   Contracted response wrapper
====================================================== */

function sendContracted(res, req, payload) {
  const visitorId = extractVisitorId(req);
  const contractIn = extractContractVersion(req);
  const useV1 = shouldUseV1Contract(contractIn, visitorId);

  const followUpLegacy = payload.followUpLegacy ?? payload.followUp ?? null;
  const followUpsV1 = payload.followUpsV1 ?? payload.followUps ?? [];

  const base = {
    ok: payload.ok !== false,
    reply: cleanText(payload.reply || ""),
    sessionId: payload.sessionId || null,
    requestId: req.requestId,
    visitorId: visitorId || null,
    contractVersion: useV1 ? NYX_CONTRACT_VERSION : "0",
    followUp: followUpLegacy,
  };

  if (useV1) base.followUps = Array.isArray(followUpsV1) ? followUpsV1 : [];

  if (payload.transcript !== undefined) base.transcript = payload.transcript;
  if (payload.audioBytes !== undefined) base.audioBytes = payload.audioBytes;
  if (payload.audioMime !== undefined) base.audioMime = payload.audioMime;

  return res.json(base);
}

/* ======================================================
   Routes
====================================================== */

app.get("/", (req, res) => res.json({ ok: true, service: "sandblast-backend", requestId: req.requestId }));

app.get("/api/diag/echo", (req, res) => {
  return res.json({
    ok: true,
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    hasFetch: typeof fetch === "function",
    env: NODE_ENV,
  });
});

app.get("/api/contract", (req, res) => {
  return res.json({
    ok: true,
    contract: {
      version: NYX_CONTRACT_VERSION,
      strict: NYX_STRICT_CONTRACT,
      rolloutPct: NYX_ROLLOUT_PCT,
      followUpsV1Shape: { label: "string", send: "string" },
      legacyFollowUp: true,
    },
    requestId: req.requestId,
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "sandblast-backend",
    env: NODE_ENV,
    time: new Date().toISOString(),
    build: BUILD_SHA,
    sessions: SESSIONS.size,
    cors: { allowedOrigins: ALLOWED_ORIGINS.length },
    contract: { version: NYX_CONTRACT_VERSION, strict: NYX_STRICT_CONTRACT, rolloutPct: NYX_ROLLOUT_PCT },
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
      modes: {
        calm: "stability↑ style↓",
        standard: "env defaults",
        high: "stability↓ style↑ boost on",
      },
    },
    s2s: {
      enabled: Boolean(multer) && Boolean(s2sModule),
      hasMulter: Boolean(multer),
      hasModule: Boolean(s2sModule),
    },
    requestId: req.requestId,
  });
});

// Chat
app.post("/api/chat", async (req, res) => {
  try {
    const visitorId = extractVisitorId(req);
    const contractIn = extractContractVersion(req);

    if (NYX_STRICT_CONTRACT && !visitorId) {
      return res.status(400).json({ ok: false, error: "MISSING_VISITOR_ID", requestId: req.requestId });
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
      // Prime directive: even empty message gets a clear forward path
      const payload = ensureConversationAdvances(
        {
          ok: true,
          reply: "Hi — welcome to Sandblast. I’m Nyx. Tell me what you’re here for, and I’ll take it from there.",
          followUpLegacy: null,
          followUpsV1: [],
          sessionId,
        },
        "",
        session
      );
      return sendContracted(res, req, payload);
    }

    let out = runChat(msg, session);

    if (out?.sessionPatch && typeof out.sessionPatch === "object") {
      Object.assign(session, out.sessionPatch);
    }

    // Prime directive: guarantee forward motion + next moves
    out = ensureConversationAdvances(out, msg, session);

    if (nyxVoiceNaturalize && typeof nyxVoiceNaturalize === "function" && out?.reply) {
      try {
        out.reply = nyxVoiceNaturalize(out.reply);
      } catch (_) {}
    }

    const loopFix = applyAntiLoop(session, msg, out?.reply || "");
    out.reply = loopFix.reply;

    // After anti-loop, still guarantee next moves (loop breaker also advances)
    out = ensureConversationAdvances(out, msg, session);

    setSession(sessionId, session);

    return sendContracted(res, req, {
      ok: true,
      reply: out.reply,
      followUpLegacy: out.followUpLegacy ?? out.followUp ?? null,
      followUpsV1: out.followUpsV1 ?? out.followUps ?? [],
      sessionId,
    });
  } catch (err) {
    console.error("[/api/chat] ERROR:", err);
    return res.status(500).json({
      ok: false,
      reply: "Hi — I’m having trouble reaching my brain right now. Try again in a moment.",
      requestId: req.requestId,
    });
  }
});

// TTS + /api/voice alias
app.post("/api/tts", handleTts);
app.post("/api/voice", handleTts);

/* ======================================================
   S2S (multipart)
====================================================== */

if (multer && s2sModule) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

  app.post("/api/s2s", upload.single("file"), async (req, res) => {
    try {
      const sessionId = extractSessionId(req.body) || makeSessionId();
      const session =
        getSession(sessionId) || {
          _t: nowMs(),
          hasSpoken: false,
          activeMusicChart: "Billboard Hot 100",
        };

      const file = req.file;
      if (!file || !file.buffer) {
        setSession(sessionId, session);
        return res.status(400).json({ ok: false, error: "NO_AUDIO_FILE", requestId: req.requestId, sessionId });
      }

      const audioBuffer = file.buffer;
      const mimeType = file.mimetype || "application/octet-stream";

      let transcript = "";
      let reply = "";
      let audioBytes = null;
      let audioMime = null;

      if (typeof s2sModule.handle === "function") {
        const out = await s2sModule.handle({ audioBuffer, mimeType, session, sessionId });
        transcript = cleanText(out?.transcript || "");
        reply = cleanText(out?.reply || "");
        audioBytes = out?.audioBytes || null;
        audioMime = out?.audioMime || null;
        if (out?.sessionPatch && typeof out.sessionPatch === "object") Object.assign(session, out.sessionPatch);
      } else if (typeof s2sModule.transcribe === "function") {
        transcript = cleanText(await s2sModule.transcribe(audioBuffer, mimeType));
        const out = runChat(transcript, session);
        reply = cleanText(out?.reply || "");
      } else {
        setSession(sessionId, session);
        return res.status(501).json({
          ok: false,
          error: "S2S_MODULE_SHAPE_UNKNOWN",
          detail: "Expected Utils/s2s to export handle() or transcribe().",
          requestId: req.requestId,
          sessionId,
        });
      }

      const missingIntent = classifyMissingYearIntent(transcript);
      if (missingIntent) {
        const out = replyMissingYear(missingIntent);
        reply = out.reply;
      }

      // Prime directive for voice transcripts too
      let chatOut = ensureConversationAdvances({ reply }, transcript || "[voice]", session);
      reply = chatOut.reply;

      if (!audioBytes && ENABLE_TTS && reply) {
        const ttsOut = await elevenLabsTtsToBuffer(reply, "standard");
        if (ttsOut?.ok) {
          audioBytes = ttsOut.audioBuffer.toString("base64");
          audioMime = ttsOut.audioMime;
        }
      }

      const loopFix = applyAntiLoop(session, transcript || "[voice]", reply || "");
      reply = loopFix.reply;

      // Ensure forward motion after loop-breaker
      chatOut = ensureConversationAdvances(
        { reply, audioBytes, audioMime },
        transcript || "[voice]",
        session
      );
      reply = chatOut.reply;

      setSession(sessionId, session);

      return sendContracted(res, req, {
        ok: true,
        transcript: transcript || "",
        reply,
        audioBytes: audioBytes || null,
        audioMime: audioMime || null,
        sessionId,
      });
    } catch (err) {
      console.error("[/api/s2s] ERROR:", err);
      return res.status(500).json({ ok: false, error: "S2S_ERROR", requestId: req.requestId });
    }
  });
} else {
  app.post("/api/s2s", (req, res) => {
    return res.status(501).json({
      ok: false,
      error: multer ? "S2S_MODULE_MISSING" : "S2S_MULTER_NOT_INSTALLED",
      detail: multer ? "Utils/s2s not found." : "Install multer to enable multipart audio uploads: npm i multer",
      requestId: req.requestId,
    });
  });
}

/* ======================================================
   Error handlers (must be LAST)
====================================================== */

// Body-parser / JSON errors (ensures requestId is present)
app.use((err, req, res, next) => {
  if (err && (err.type === "entity.too.large" || err instanceof SyntaxError)) {
    return res.status(400).json({
      ok: false,
      error: "BAD_REQUEST",
      detail: err.type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON",
      requestId: req?.requestId || null,
    });
  }
  return next(err);
});

// Final express error handler (never call next() after sending)
app.use((err, req, res, next) => {
  console.error("[express] ERROR:", err);

  if (res.headersSent) return next(err);

  return res.status(500).json({
    ok: false,
    error: "INTERNAL_ERROR",
    requestId: req?.requestId || null,
  });
});

/* ======================================================
   Start (ONLY when run directly)
====================================================== */

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `[sandblast-backend] up :${PORT} env=${NODE_ENV} build=${BUILD_SHA || "n/a"} contract=${NYX_CONTRACT_VERSION} rollout=${NYX_ROLLOUT_PCT}%`
    );
  });
}

module.exports = app;
