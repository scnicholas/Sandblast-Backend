/**
 * index.js — Sandblast Backend (Nyx)
 * Critical fixes:
 *  - Intro ALWAYS wins on first contact (even if widget sends lane token)
 *  - Fix chip arbitration boolean precedence bug
 *  - Loop guard less aggressive + never pollutes the intro
 *  - /api/voice is a real alias of /api/tts
 *  - Keeps your state spine + safe imports + final-boundary TTS
 */

"use strict";

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const multer = require("multer");

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

/* ======================================================
   ENV + Config
====================================================== */

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

const SERVICE_NAME = process.env.SERVICE_NAME || "sandblast-backend";
const NODE_ENV = process.env.NODE_ENV || "development";

// Session TTL to prevent memory bloat
const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 90);

// Intelligence Level (keep your pattern)
const DEFAULT_INTELLIGENCE_LEVEL = Number(process.env.NYX_INTELLIGENCE_LEVEL || 2);

// TTS settings
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "elevenlabs").toLowerCase();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "";
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || ""; // optional
const ELEVENLABS_BASE_URL = process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";

// Voice tuning (canonical approach you locked)
const NYX_VOICE_STABILITY = process.env.NYX_VOICE_STABILITY || "0.35";
const NYX_VOICE_SIMILARITY = process.env.NYX_VOICE_SIMILARITY || "0.80";
const NYX_VOICE_STYLE = process.env.NYX_VOICE_STYLE || "0.25";
const NYX_VOICE_SPEAKER_BOOST = (process.env.NYX_VOICE_SPEAKER_BOOST || "true") === "true";

// Utility feature toggles
const ENABLE_TTS = (process.env.ENABLE_TTS || "true") === "true";
const ENABLE_S2S = (process.env.ENABLE_S2S || "true") === "true";
const ENABLE_DEBUG = (process.env.NYX_DEBUG || "false") === "true";

// CORS: permissive by default; tighten if you want
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

/* ======================================================
   Safe Imports (do not crash if a module changes)
====================================================== */

function safeRequire(path) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (e) {
    if (ENABLE_DEBUG) console.warn(`[safeRequire] missing/failed: ${path} :: ${e.message}`);
    return null;
  }
}

const musicKnowledge = safeRequire("./Utils/musicKnowledge");
const intentClassifier = safeRequire("./Utils/intentClassifier");
const nyxPersonality = safeRequire("./Utils/nyxPersonality");

// Canonical: Nyx voice naturalizer (you locked this)
const nyxVoiceNaturalize = safeRequire("./Utils/nyxVoiceNaturalize");

// Optional routers
const tvKnowledge = safeRequire("./Utils/tvKnowledge");
const sponsorsKnowledge = safeRequire("./Utils/sponsorsKnowledge");

/* ======================================================
   Session Store (authoritative state spine)
====================================================== */

const sessions = new Map();

function nowMs() {
  return Date.now();
}

function makeSessionId() {
  return crypto.randomBytes(8).toString("hex");
}

/**
 * phase:
 *  - "greeting": intro allowed (one time)
 *  - "engaged": post-intro, general conversation (name capture/intent routing)
 *  - "domain_active": user is in a lane (music/tv/sponsors/ai/etc.)
 */
function newSessionState(sessionId) {
  return {
    sessionId,
    createdAt: nowMs(),
    updatedAt: nowMs(),
    intelligenceLevel: DEFAULT_INTELLIGENCE_LEVEL,

    phase: "greeting",
    greetedOnce: false,

    nameCaptured: false,
    userName: null,

    activeDomain: null, // "music" | "tv" | "sponsors" | "ai" | "general"
    lastUserIntent: null,
    lastUserText: null,

    // loop protection
    lastReplyHash: null,
    repeatCount: 0,
  };
}

function getSession(sessionIdRaw) {
  const sid = (sessionIdRaw || "").trim() || makeSessionId();
  let st = sessions.get(sid);
  if (!st) {
    st = newSessionState(sid);
    sessions.set(sid, st);
  }
  return st;
}

function touchSession(st) {
  st.updatedAt = nowMs();
}

function cleanupSessions() {
  const ttl = SESSION_TTL_MINUTES * 60 * 1000;
  const cutoff = nowMs() - ttl;
  for (const [sid, st] of sessions.entries()) {
    if ((st.updatedAt || st.createdAt) < cutoff) sessions.delete(sid);
  }
}
setInterval(cleanupSessions, 60 * 1000).unref();

/* ======================================================
   Helpers: text normalization + detection
====================================================== */

function cleanText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function lower(s) {
  return cleanText(s).toLowerCase();
}

function isGreeting(text) {
  const t = lower(text);
  if (!t) return false;
  return (
    t === "hi" ||
    t === "hey" ||
    t === "hello" ||
    t === "good morning" ||
    t === "good afternoon" ||
    t === "good evening" ||
    t.startsWith("hi ") ||
    t.startsWith("hey ") ||
    t.startsWith("hello ")
  );
}

function isOnlyName(text) {
  const t = cleanText(text);
  if (!t) return false;
  if (/[\d@#$%^&*_=+[\]{}<>\\/|]/.test(t)) return false;
  const parts = t.split(" ").filter(Boolean);
  if (parts.length < 1 || parts.length > 3) return false;
  if (!parts.every((p) => /^[A-Za-z'’-]{2,}$/.test(p))) return false;
  return true;
}

function extractName(text) {
  const t = cleanText(text);

  let m = t.match(/\bmy name is\s+([A-Za-z'’-]{2,}(?:\s+[A-Za-z'’-]{2,}){0,2})\b/i);
  if (m && m[1]) return m[1].trim();

  m = t.match(/\b(i am|i'm)\s+([A-Za-z'’-]{2,}(?:\s+[A-Za-z'’-]{2,}){0,2})\b/i);
  if (m && m[2]) return m[2].trim();

  if (isOnlyName(t)) return t;

  return null;
}

function hashReply(s) {
  return crypto.createHash("sha1").update(String(s || "")).digest("hex");
}

function noteLoopProtection(st, reply) {
  const h = hashReply(reply);
  if (st.lastReplyHash === h) {
    st.repeatCount += 1;
  } else {
    st.lastReplyHash = h;
    st.repeatCount = 0;
  }
  // Less aggressive: require 2 repeats (prevents "nagging" early)
  return st.repeatCount >= 2;
}

/* ======================================================
   Nyx Copy: Intro + social responses (no chips listed)
====================================================== */

function nyxIntroLine() {
  return "On air—welcome to Sandblast. I’m Nyx, your guide. Tell me what you’re here for, and I’ll take it from there.";
}

function nyxAcknowledgeName(name) {
  return `Perfect, ${name}. What do you want to dive into first—music, TV, sponsors, or something else?`;
}

function nyxGreetingReply(st) {
  if (st.nameCaptured && st.userName) {
    return `Hey, ${st.userName}. Where do you want to go next?`;
  }
  return "Hey. What are you in the mood for today—music, TV, sponsors, or something else?";
}

/* ======================================================
   Domain routing (safe, minimal, forward-moving)
====================================================== */

function normalizeDomainFromChipOrText(text) {
  const t = lower(text);
  if (!t) return null;

  if (["music", "lane:music"].includes(t)) return "music";
  if (["tv", "television", "lane:tv"].includes(t)) return "tv";
  if (["sponsors", "sponsor", "ads", "advertising", "lane:sponsors"].includes(t)) return "sponsors";
  if (["ai", "a.i.", "consulting", "lane:ai"].includes(t)) return "ai";
  if (["general", "lane:general"].includes(t)) return "general";

  return null;
}

function classifyIntent(text) {
  const t = cleanText(text);
  if (!t) return { intent: "empty", confidence: 1.0 };

  if (intentClassifier && typeof intentClassifier.classify === "function") {
    try {
      return intentClassifier.classify(t);
    } catch (e) {
      if (ENABLE_DEBUG) console.warn(`[intentClassifier] failed: ${e.message}`);
    }
  }

  const d = normalizeDomainFromChipOrText(t);
  if (d) return { intent: `domain:${d}`, confidence: 0.75 };

  if (isGreeting(t)) return { intent: "greeting", confidence: 0.9 };
  if (extractName(t)) return { intent: "name", confidence: 0.85 };

  return { intent: "general", confidence: 0.5 };
}

function handleDomain(st, domain, userText) {
  const text = cleanText(userText);

  if (domain === "music") {
    if (musicKnowledge && typeof musicKnowledge.handleChat === "function") {
      try {
        return musicKnowledge.handleChat({ text, session: st });
      } catch (e) {
        if (ENABLE_DEBUG) console.warn(`[musicKnowledge.handleChat] failed: ${e.message}`);
      }
    }
    return {
      reply: "Music—nice. Give me a year (1950–2024) or an artist + year, and I’ll pull something memorable.",
      followUp: ["Try: 1984", "Try: 1999", "Try: Prince 1984"],
      domain: "music",
    };
  }

  if (domain === "tv") {
    if (tvKnowledge && typeof tvKnowledge.handleChat === "function") {
      try {
        return tvKnowledge.handleChat({ text, session: st });
      } catch (e) {
        if (ENABLE_DEBUG) console.warn(`[tvKnowledge.handleChat] failed: ${e.message}`);
      }
    }
    return {
      reply: "TV—got it. Tell me a show title, a decade, or a vibe (crime, western, comedy) and I’ll line up the best next step.",
      followUp: ["Try: crime classics", "Try: westerns", "Try: 1960s TV"],
      domain: "tv",
    };
  }

  if (domain === "sponsors") {
    if (sponsorsKnowledge && typeof sponsorsKnowledge.handleChat === "function") {
      try {
        return sponsorsKnowledge.handleChat({ text, session: st });
      } catch (e) {
        if (ENABLE_DEBUG) console.warn(`[sponsorsKnowledge.handleChat] failed: ${e.message}`);
      }
    }
    return {
      reply: "Sponsors—perfect. Are you looking to advertise, explore packages, or see audience and placement options?",
      followUp: ["Advertising packages", "Audience stats", "Placement options"],
      domain: "sponsors",
    };
  }

  if (domain === "ai") {
    return {
      reply: "AI lane—love it. Tell me what you’re trying to achieve: build something, automate a workflow, or improve a business process.",
      followUp: ["Build a chatbot", "Automate outreach", "Improve operations"],
      domain: "ai",
    };
  }

  return {
    reply: "Alright. Tell me what you want to do, and I’ll steer us cleanly.",
    followUp: ["Music", "TV", "Sponsors", "AI"],
    domain: "general",
  };
}

/* ======================================================
   Nyx Tone Wrapper (optional)
====================================================== */

function applyNyxTone(st, reply) {
  if (nyxPersonality && typeof nyxPersonality.applyTone === "function") {
    try {
      return nyxPersonality.applyTone(reply, { session: st });
    } catch (e) {
      if (ENABLE_DEBUG) console.warn(`[nyxPersonality.applyTone] failed: ${e.message}`);
    }
  }
  return reply;
}

/* ======================================================
   TTS (ElevenLabs) — final boundary only
====================================================== */

async function elevenlabsTts(text) {
  let fetchFn = global.fetch;
  if (!fetchFn) {
    try {
      // eslint-disable-next-line global-require
      fetchFn = require("node-fetch");
    } catch (e) {
      throw new Error("Fetch unavailable; install node-fetch or use Node 18+.");
    }
  }

  const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

  const payload = {
    text,
    model_id: ELEVENLABS_MODEL_ID || undefined,
    voice_settings: {
      stability: Number(NYX_VOICE_STABILITY),
      similarity_boost: Number(NYX_VOICE_SIMILARITY),
      style: Number(NYX_VOICE_STYLE),
      use_speaker_boost: NYX_VOICE_SPEAKER_BOOST,
    },
  };

  const resp = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": ELEVENLABS_API_KEY,
      Accept: "audio/mpeg",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`ElevenLabs TTS failed: ${resp.status} ${resp.statusText} :: ${errText}`);
  }

  const arrayBuf = await resp.arrayBuffer();
  return {
    audioBytes: Buffer.from(arrayBuf),
    audioMime: "audio/mpeg",
  };
}

async function ttsForReply(text) {
  const raw = cleanText(text);
  if (!raw) return null;

  const natural =
    nyxVoiceNaturalize && typeof nyxVoiceNaturalize === "function"
      ? nyxVoiceNaturalize(raw)
      : raw;

  if (!ENABLE_TTS) return null;
  if (TTS_PROVIDER !== "elevenlabs") return null;
  if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) return null;

  return elevenlabsTts(natural);
}

/* ======================================================
   /api/chat — Core endpoint
====================================================== */

app.post("/api/chat", async (req, res) => {
  try {
    const sessionId = cleanText(req.body.sessionId);
    const message = cleanText(req.body.message);

    const st = getSession(sessionId);
    touchSession(st);
    st.lastUserText = message;

    // --- Precompute chip token safely (FIX precedence bug)
    const chipDomain = normalizeDomainFromChipOrText(message);
    const isLaneToken = lower(message).startsWith("lane:");
    const isSimpleDomainWord = ["music", "tv", "sponsors", "ai", "general"].includes(lower(message));
    const messageIsJustChip = Boolean(chipDomain) && (isLaneToken || isSimpleDomainWord);

    // 1) Empty message: if first contact -> intro; else prompt forward
    if (!message) {
      if (st.phase === "greeting" && !st.greetedOnce) {
        st.greetedOnce = true;
        st.phase = "engaged";
        const reply = applyNyxTone(st, nyxIntroLine());
        return res.json({ ok: true, reply, followUp: null, sessionId: st.sessionId });
      }
      const reply = applyNyxTone(st, "I’m here. Tell me what you want to do next.");
      return res.json({ ok: true, reply, followUp: null, sessionId: st.sessionId });
    }

    // 2) Name capture is first-class (handle before intro rule)
    const name = extractName(message);
    if (name && !st.nameCaptured) {
      st.nameCaptured = true;
      st.userName = name;
      if (st.phase === "greeting") {
        st.greetedOnce = true;
        st.phase = "engaged";
      }
      const reply = applyNyxTone(st, nyxAcknowledgeName(name));
      return res.json({ ok: true, reply, followUp: ["Music", "TV", "Sponsors", "AI"], sessionId: st.sessionId });
    }

    // 3) HARD RULE: Intro ALWAYS wins on first contact (even if widget sends a chip token)
    // This is the key fix for your screenshot behavior.
    if (st.phase === "greeting" && !st.greetedOnce) {
      st.greetedOnce = true;
      st.phase = "engaged";
      const reply = applyNyxTone(st, nyxIntroLine());
      return res.json({ ok: true, reply, followUp: null, sessionId: st.sessionId });
    }

    // 4) Intent classification (post-intro)
    const intent = classifyIntent(message);
    st.lastUserIntent = intent.intent;

    // 5) Greeting handling: post-intro social response
    if (intent.intent === "greeting" || isGreeting(message)) {
      const reply = applyNyxTone(st, nyxGreetingReply(st));
      return res.json({ ok: true, reply, followUp: ["Music", "TV", "Sponsors", "AI"], sessionId: st.sessionId });
    }

    // 6) Chip arbitration: chips switch lane only when message is a lane token
    if (messageIsJustChip && chipDomain) {
      st.activeDomain = chipDomain;
      st.phase = "domain_active";

      const result = handleDomain(st, chipDomain, "");
      let reply = applyNyxTone(st, result.reply);

      // Loop guard should not be annoying; only on real repeats
      const forcedForward = noteLoopProtection(st, reply);
      if (forcedForward) {
        reply = applyNyxTone(
          st,
          `${reply}\n\nGive me one detail (year, title, or goal) and I’ll move us forward immediately.`
        );
      }

      return res.json({
        ok: true,
        reply,
        followUp: result.followUp || null,
        sessionId: st.sessionId,
      });
    }

    // 7) Otherwise: user free-text. Route based on activeDomain if set; else infer domain.
    let domain = st.activeDomain;

    if (!domain) {
      domain = chipDomain || "general";
    }

    // If user explicitly says a domain keyword in free-text, allow it to set active lane
    const explicitDomain = normalizeDomainFromChipOrText(message);
    if (explicitDomain) {
      st.activeDomain = explicitDomain;
      st.phase = "domain_active";
      domain = explicitDomain;
    } else if (st.phase !== "domain_active" && domain !== "general") {
      st.phase = "domain_active";
    }

    const result = handleDomain(st, domain, message);
    let reply = applyNyxTone(st, result.reply);

    const forcedForward = noteLoopProtection(st, reply);
    if (forcedForward) {
      reply = applyNyxTone(
        st,
        `${reply}\n\nGive me one specific input (a year, a title, or a goal) and I’ll move us forward immediately.`
      );
    }

    return res.json({
      ok: true,
      reply,
      followUp: result.followUp || null,
      sessionId: st.sessionId,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "SERVER_ERROR" });
  }
});

/* ======================================================
   /api/tts + /api/voice — Explicit TTS endpoint + alias
====================================================== */

async function handleTts(req, res) {
  try {
    const text = cleanText(req.body.text || req.body.reply);
    if (!text) return res.status(400).json({ ok: false, error: "NO_TEXT" });

    const audio = await ttsForReply(text);
    if (!audio) return res.status(501).json({ ok: false, error: "TTS_NOT_CONFIGURED" });

    res.setHeader("Content-Type", audio.audioMime);
    res.setHeader("Cache-Control", "no-store");
    return res.send(audio.audioBytes);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "TTS_ERROR" });
  }
}

app.post("/api/tts", handleTts);
app.post("/api/voice", handleTts);

/* ======================================================
   /api/s2s — Speech-to-speech (minimal placeholder)
====================================================== */

app.post("/api/s2s", upload.single("file"), async (req, res) => {
  try {
    if (!ENABLE_S2S) return res.status(501).json({ ok: false, error: "S2S_DISABLED" });

    const sessionId = cleanText(req.body.sessionId) || makeSessionId();
    const st = getSession(sessionId);
    touchSession(st);

    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ ok: false, error: "NO_FILE" });
    }

    const transcript = cleanText(req.body.transcript || "");
    const syntheticText = transcript || "Hi Nyx";

    // Reuse /api/chat logic internally (simple)
    const fakeReq = { body: { message: syntheticText, sessionId: st.sessionId } };
    const fakeRes = {
      _json: null,
      json(obj) {
        this._json = obj;
      },
      status() {
        return this;
      },
    };

    await new Promise((resolve) => {
      app._router.handle(
        { ...fakeReq, method: "POST", url: "/api/chat" },
        fakeRes,
        resolve
      );
    });

    const reply = fakeRes._json?.reply || "Want to pick up where we left off, or switch lanes?";

    let audioBytes = null;
    let audioMime = null;
    try {
      const audio = await ttsForReply(reply);
      if (audio) {
        audioBytes = audio.audioBytes.toString("base64");
        audioMime = audio.audioMime;
      }
    } catch (e) {
      if (ENABLE_DEBUG) console.warn(`[s2s tts] failed: ${e.message}`);
    }

    return res.json({
      ok: true,
      transcript: syntheticText,
      reply,
      audioBytes,
      audioMime,
      sessionId: st.sessionId,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "S2S_ERROR" });
  }
});

/* ======================================================
   /api/health — Diagnostics
====================================================== */

app.get("/api/health", (req, res) => {
  const ttsConfigured =
    Boolean(ELEVENLABS_API_KEY) &&
    Boolean(ELEVENLABS_VOICE_ID) &&
    ENABLE_TTS &&
    TTS_PROVIDER === "elevenlabs";

  return res.json({
    ok: true,
    service: SERVICE_NAME,
    env: NODE_ENV,
    host: HOST,
    port: PORT,
    time: new Date().toISOString(),
    pid: process.pid,
    keepalive: true,
    nyx: { intelligenceLevel: DEFAULT_INTELLIGENCE_LEVEL },
    sessions: sessions.size,
    tts: {
      provider: TTS_PROVIDER,
      configured: ttsConfigured,
      hasApiKey: Boolean(ELEVENLABS_API_KEY),
      hasVoiceId: Boolean(ELEVENLABS_VOICE_ID),
      hasModelId: Boolean(ELEVENLABS_MODEL_ID),
      voiceTuning: {
        stability: NYX_VOICE_STABILITY,
        similarity: NYX_VOICE_SIMILARITY,
        style: NYX_VOICE_STYLE,
        speakerBoost: NYX_VOICE_SPEAKER_BOOST,
      },
    },
  });
});

/* ======================================================
   Start
====================================================== */

app.listen(PORT, HOST, () => {
  console.log(
    `[${SERVICE_NAME}] up :: env=${NODE_ENV} host=${HOST} port=${PORT} tts=${ENABLE_TTS ? TTS_PROVIDER : "off"}`
  );
});
