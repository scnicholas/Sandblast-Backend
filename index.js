"use strict";

/**
 * Sandblast Backend — index.js (canonical)
 * Updates included:
 *  - CORS hardening (OPTIONS + dynamic allow-origin + proper headers)
 *  - Payload tolerance (prevents empty-message loops)
 *  - Anti-loop gate (server-side repeat-reply breaker) [UPDATED: polite + triggers after 2 repeats]
 *  - Missing-year guard for Top10/Story/Micro [NEW: prevents "Top 10" loop]
 *  - TTS stability (/api/tts + /api/voice alias via shared handler)
 *  - Speech-to-Text endpoint (/api/s2s) multipart audio upload w/ safe module discovery
 *  - Music routing (musicMoments first, then musicKnowledge fallback)
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
   Config
====================================================== */

const PORT = Number(process.env.PORT || 10000);
const NODE_ENV = process.env.NODE_ENV || "production";
const ENABLE_DEBUG = (process.env.NYX_DEBUG || "false") === "true";

// Build stamp (Render commonly provides RENDER_GIT_COMMIT)
const BUILD_SHA =
  process.env.RENDER_GIT_COMMIT ||
  process.env.GIT_SHA ||
  process.env.COMMIT_SHA ||
  null;

// CORS allowlist (override in Render with CORS_ORIGINS="a,b,c")
const ALLOWED_ORIGINS = String(
  process.env.CORS_ORIGINS ||
    [
      "https://sandblast.channel",
      "https://www.sandblast.channel",
      "https://sandblastchannel.com",
      "https://www.sandblastchannel.com",
      // Webflow staging (add your exact project domain(s) here)
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
    "Content-Type, Authorization, X-Requested-With"
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
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
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

// Nyx voice naturalizer (optional but recommended)
const nyxVoiceNaturalize = safeRequire("./Utils/nyxVoiceNaturalize");

// Optional S2S/STT handlers (we’ll probe several common names)
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
   Payload tolerance (prevents “empty message” loops)
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
   Intent helpers (NEW: missing-year guard)
====================================================== */

function extractYearFromText(s) {
  const m = String(s || "").match(/\b(19[5-9]\d|20[0-1]\d|202[0-4])\b/); // 1950–2024
  return m ? Number(m[1]) : null;
}

function classifyMissingYearIntent(s) {
  const t = cleanText(s).toLowerCase();
  const hasYear = extractYearFromText(t) !== null;

  if (hasYear) return null;

  // Only intercept if user clearly asked for these actions but omitted the year
  if (/\btop\s*10\b/.test(t) || /\btop10\b/.test(t)) return "top10";
  if (/\bstory\s*moment\b/.test(t)) return "story";
  if (/\bmicro\s*moment\b/.test(t)) return "micro";

  return null;
}

function buildYearFollowups() {
  // Tap-friendly, minimal, high-utility
  return ["1950", "1960", "1970", "1980", "1990", "2000", "2010", "2024"];
}

function replyMissingYear(intent) {
  const label =
    intent === "top10"
      ? "Top 10"
      : intent === "story"
      ? "a story moment"
      : "a micro moment";

  const hint =
    intent === "top10"
      ? 'Try: “top 10 1950”'
      : intent === "story"
      ? 'Try: “story moment 1950”'
      : 'Try: “micro moment 1950”';

  return {
    reply: `Got you. What year should I use for ${label}? (1950–2024) ${hint}.`,
    followUp: buildYearFollowups(),
  };
}

/* ======================================================
   Anti-loop gate (server-side breaker)
   UPDATED:
    - triggers after 2 repeats (less aggressive)
    - polite copy (broadcast-appropriate)
    - includes follow-ups
====================================================== */

function hashStr(s) {
  return crypto.createHash("sha1").update(String(s || "")).digest("hex");
}

function applyAntiLoop(session, userMsg, reply) {
  const msg = cleanText(userMsg);
  const rep = cleanText(reply);

  if (!msg || !rep) return { reply: rep, followUp: null };

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

  // Break only after 2 exact repeats for same input/reply
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
      followUp: buildYearFollowups(),
      _antiLoopTripped: true,
    };
  }

  return { reply: rep, followUp: null };
}

/* ======================================================
   TTS (ElevenLabs) — returns audioBytes/audioMime
====================================================== */

const ENABLE_TTS = (process.env.ENABLE_TTS || "true") === "true";
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || ""; // optional
const ELEVENLABS_BASE_URL =
  process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

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
      return res.json({ ok: true, audioBytes: out.audioBytes, audioMime: out.audioMime });
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

app.get("/", (req, res) => res.json({ ok: true, service: "sandblast-backend" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "sandblast-backend",
    env: NODE_ENV,
    time: new Date().toISOString(),
    build: BUILD_SHA,
    sessions: SESSIONS.size,
    cors: { allowedOrigins: ALLOWED_ORIGINS.length },
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

// Chat (MusicMoments first, then MusicKnowledge)
app.post("/api/chat", async (req, res) => {
  try {
    const sessionId = extractSessionId(req.body) || makeSessionId();
    const msg = extractMessage(req.body);

    if (ENABLE_DEBUG) {
      console.log("[/api/chat] origin=", req.headers.origin || "(none)");
      console.log("[/api/chat] keys=", Object.keys(req.body || {}));
      console.log("[/api/chat] sessionId=", sessionId, "msg=", msg);
    }

    const session =
      getSession(sessionId) || {
        _t: nowMs(),
        hasSpoken: false,
        activeMusicChart: "Billboard Hot 100",
      };

    if (!msg) {
      setSession(sessionId, session);
      return res.json({
        ok: true,
        reply:
          "On air—welcome to Sandblast. I’m Nyx. Tell me what you’re here for, and I’ll take it from there.",
        followUp: null,
        sessionId,
      });
    }

    // NEW: Guard against incomplete commands that cause loops (e.g., “Top 10” with no year)
    const missingIntent = classifyMissingYearIntent(msg);
    if (missingIntent) {
      const out = replyMissingYear(missingIntent);
      setSession(sessionId, session);
      return res.json({
        ok: true,
        reply: out.reply,
        followUp: out.followUp,
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

          // Anti-loop breaker (UPDATED)
          const loopFix = applyAntiLoop(session, msg, out.reply);
          setSession(sessionId, session);

          return res.json({
            ok: true,
            reply: loopFix.reply,
            followUp: out.followUp || loopFix.followUp || null,
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

          // Anti-loop breaker (UPDATED)
          const loopFix = applyAntiLoop(session, msg, out.reply);
          setSession(sessionId, session);

          return res.json({
            ok: true,
            reply: loopFix.reply,
            followUp: out.followUp || loopFix.followUp || null,
            sessionId,
          });
        }
      } catch (e) {
        if (ENABLE_DEBUG) console.warn("[musicKnowledge] fail:", e.message);
      }
    }

    // Final fallback
    setSession(sessionId, session);
    return res.json({
      ok: true,
      reply: "Tell me a year (1950–2024) and I’ll pull the top 10, #1, or a story moment.",
      followUp: buildYearFollowups(),
      sessionId,
    });
  } catch (err) {
    console.error("[/api/chat] ERROR:", err);
    return res.status(500).json({
      ok: false,
      reply: "I’m having trouble reaching my brain right now. Try again in a moment.",
    });
  }
});

// TTS
app.post("/api/tts", handleTts);

// /api/voice alias (widget compatibility)
app.post("/api/voice", handleTts);

/* ======================================================
   Speech-to-Speech / Speech-to-Text
   POST /api/s2s  (multipart/form-data with field "file")
   Returns: { ok, transcript, reply, audioBytes, audioMime, sessionId }
====================================================== */

if (multer) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 12 * 1024 * 1024 },
  });

  app.post("/api/s2s", upload.single("file"), async (req, res) => {
    try {
      const sessionId =
        req.body?.sessionId ||
        req.headers["x-session-id"] ||
        makeSessionId();

      const session =
        getSession(sessionId) || {
          _t: nowMs(),
          hasSpoken: false,
          activeMusicChart: "Billboard Hot 100",
        };

      if (!req.file || !req.file.buffer) {
        setSession(sessionId, session);
        return res.status(400).json({ ok: false, error: "NO_AUDIO_FILE", sessionId });
      }

      if (!s2sModule) {
        setSession(sessionId, session);
        return res.status(501).json({
          ok: false,
          error: "S2S_NOT_CONFIGURED",
          detail:
            "No S2S module found. Add Utils/s2s.js (or speechToSpeech.js) and export a handler.",
          sessionId,
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
        return res.status(501).json({
          ok: false,
          error: "S2S_MODULE_SHAPE_UNKNOWN",
          detail:
            "Expected Utils/s2s to export handle() or handleS2S() or transcribe().",
          sessionId,
        });
      }

      // NEW: Missing-year guard for voice transcripts too (prevents the same loop in S2S)
      const missingIntent = classifyMissingYearIntent(transcript || "");
      if (missingIntent) {
        const out = replyMissingYear(missingIntent);
        reply = out.reply;
      }

      // If no audio returned by s2s module, optionally synthesize reply via TTS
      if (!audioBytes && ENABLE_TTS && cleanText(reply)) {
        const ttsOut = await elevenLabsTts(reply);
        if (ttsOut?.ok) {
          audioBytes = ttsOut.audioBytes;
          audioMime = ttsOut.audioMime;
        }
      }

      // Anti-loop breaker (UPDATED, uses transcript as userMsg)
      const loopFix = applyAntiLoop(session, transcript || "[voice]", reply || "");
      reply = loopFix.reply;

      setSession(sessionId, session);
      return res.json({
        ok: true,
        transcript: transcript || "",
        reply: cleanText(reply),
        audioBytes: audioBytes || null,
        audioMime: audioMime || null,
        sessionId,
      });
    } catch (err) {
      console.error("[/api/s2s] ERROR:", err);
      return res.status(500).json({ ok: false, error: "S2S_ERROR" });
    }
  });
} else {
  app.post("/api/s2s", (req, res) => {
    res.status(501).json({
      ok: false,
      error: "S2S_MULTER_NOT_INSTALLED",
      detail: "Install multer to enable multipart audio uploads: npm i multer",
    });
  });
}

/* ======================================================
   Start
====================================================== */

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `[sandblast-backend] up :${PORT} env=${NODE_ENV} build=${BUILD_SHA || "n/a"}`
  );
});
