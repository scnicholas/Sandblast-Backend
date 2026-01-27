"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v1.5.17zo
 * (Option B alignment: chatEngine v0.6zV compatibility + enterprise guards)
 *
 * Goals:
 *  ✅ Preserve Voice/TTS stability (ElevenLabs) + /api/tts + /api/voice aliases
 *  ✅ Preserve CORS HARD-LOCK + preflight reliability
 *  ✅ Preserve turn dedupe + loop fuse (session + burst + sustained)
 *  ✅ Preserve sessionPatch persistence (cog + continuity keys)
 *  ✅ Preserve boot-intro bridge behavior (panel_open_intro / boot_intro)
 *  ✅ Zero "index.js imports" inside chatEngine (chatEngine stays pure)
 *
 * NOTE:
 *  - This file expects ./Utils/chatEngine.js to export handleChat (as in your v0.6zV paste).
 *  - This is a full-file deliverable (drop-in). If you have custom routes, merge them in carefully.
 */

// =========================
// Imports
// =========================
const express = require("express");
const crypto = require("crypto");

// Optional (safe-load)
function safeRequire(p) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(p);
  } catch (_) {
    return null;
  }
}

const cors = safeRequire("cors") || null;

// Your pure engine
const chatEngine = safeRequire("./Utils/chatEngine") || safeRequire("./Utils/chatEngine.js") || null;

// Optional ElevenLabs (safe-load; won't brick server if missing)
const fetch = global.fetch || safeRequire("node-fetch");

// =========================
// Version
// =========================
const INDEX_VERSION =
  "index.js v1.5.17zo (enterprise hardened: CORS hard-lock + loop fuse + sessionPatch persistence + boot-intro bridge + TTS parse recovery + chatEngine v0.6zV compatibility)";

// =========================
// Env / knobs
// =========================
const PORT = Number(process.env.PORT || 10000);

const TRUST_PROXY = String(process.env.TRUST_PROXY || "").trim(); // "1" / "true" to enable
const NODE_ENV = String(process.env.NODE_ENV || "production").trim();

const MAX_JSON_BODY = String(process.env.MAX_JSON_BODY || "512kb");

const ORIGINS_ALLOWLIST = String(
  process.env.CORS_ALLOW_ORIGINS ||
    process.env.ALLOW_ORIGINS ||
    "https://sandblast.channel,https://www.sandblast.channel,https://sandblastchannel.com,https://www.sandblastchannel.com"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Widget sometimes runs from preview domains — you can add them via env, no code change.
const ORIGINS_REGEX_ALLOWLIST = String(process.env.CORS_ALLOW_ORIGINS_REGEX || "").trim(); // optional "https://.*\.webflow\.io$;https://.*\.vercel\.app$"

const LOOP_REPLAY_WINDOW_MS = clampInt(process.env.LOOP_REPLAY_WINDOW_MS, 4000, 500, 15000);
const BURST_WINDOW_MS = clampInt(process.env.BURST_WINDOW_MS, 1200, 200, 5000);
const BURST_MAX = clampInt(process.env.BURST_MAX, 6, 2, 30);
const SUSTAINED_WINDOW_MS = clampInt(process.env.SUSTAINED_WINDOW_MS, 12000, 2000, 60000);
const SUSTAINED_MAX = clampInt(process.env.SUSTAINED_MAX, 18, 6, 120);

const SESSION_TTL_MS = clampInt(process.env.SESSION_TTL_MS, 45 * 60 * 1000, 10 * 60 * 1000, 12 * 60 * 60 * 1000); // default 45m
const SESSION_MAX = clampInt(process.env.SESSION_MAX, 50000, 5000, 250000);

// TTS env
const ELEVEN_API_KEY = String(process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY || "").trim();
const ELEVEN_VOICE_ID = String(process.env.ELEVENLABS_VOICE_ID || process.env.NYX_VOICE_ID || "").trim();

const NYX_VOICE_STABILITY = clampFloat(process.env.NYX_VOICE_STABILITY, 0.45, 0, 1);
const NYX_VOICE_SIMILARITY = clampFloat(process.env.NYX_VOICE_SIMILARITY, 0.72, 0, 1);
const NYX_VOICE_STYLE = clampFloat(process.env.NYX_VOICE_STYLE, 0.25, 0, 1);
const NYX_VOICE_SPEAKER_BOOST = toBool(process.env.NYX_VOICE_SPEAKER_BOOST, true);

// =========================
// Utils
// =========================
function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function sha1(s) {
  return crypto.createHash("sha1").update(String(s)).digest("hex");
}
function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function clampFloat(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}
function toBool(v, def) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return !!def;
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return !!def;
}
function isPlainObject(x) {
  return (
    !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null)
  );
}
function safeJsonParseMaybe(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "object") return x;
  const s = String(x).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}
function pickClientIp(req) {
  const xf = safeStr(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket?.remoteAddress || "";
}
function normalizeOrigin(o) {
  return safeStr(o).trim().replace(/\/$/, "");
}
function makeOriginRegexes() {
  const raw = ORIGINS_REGEX_ALLOWLIST
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const r of raw) {
    try {
      out.push(new RegExp(r));
    } catch (_) {}
  }
  return out;
}
const ORIGIN_REGEXES = makeOriginRegexes();

// =========================
// Session store (in-memory, enterprise-safe-ish)
// =========================
/**
 * In production you may swap this for Redis; but this Map gives:
 *  - deterministic session objects (so chatEngine can persist continuity)
 *  - TTL eviction + max cap
 */
const SESSIONS = new Map(); // key -> { data: sessionObj, lastSeenAt, burst:[ts], sustained:[ts] }

function sessionKeyFromReq(req) {
  // Widget can send one of these: visitorId, sessionId, deviceId
  const b = isPlainObject(req.body) ? req.body : {};
  const h = req.headers || {};
  const sid =
    safeStr(b.sessionId || b.visitorId || b.deviceId).trim() ||
    safeStr(h["x-sb-session"] || h["x-session-id"] || h["x-visitor-id"]).trim();

  // fallback: stable-ish on IP+UA (not perfect, but better than nothing)
  if (sid) return sid.slice(0, 120);

  const fp = sha1(`${pickClientIp(req)}|${safeStr(req.headers["user-agent"] || "")}`).slice(0, 24);
  return `fp_${fp}`;
}

function pruneSessions(now) {
  // TTL prune
  for (const [k, v] of SESSIONS.entries()) {
    if (!v || !v.lastSeenAt) {
      SESSIONS.delete(k);
      continue;
    }
    if (now - v.lastSeenAt > SESSION_TTL_MS) SESSIONS.delete(k);
  }
  // size cap prune (oldest first)
  if (SESSIONS.size > SESSION_MAX) {
    const arr = Array.from(SESSIONS.entries()).sort((a, b) => (a[1].lastSeenAt || 0) - (b[1].lastSeenAt || 0));
    const cut = SESSIONS.size - SESSION_MAX;
    for (let i = 0; i < cut; i++) SESSIONS.delete(arr[i][0]);
  }
}

function getSession(req) {
  const now = nowMs();
  pruneSessions(now);

  const key = sessionKeyFromReq(req);
  let rec = SESSIONS.get(key);
  if (!rec) {
    rec = {
      data: {
        sessionId: key,
        visitorId: key,
        lane: "general",
        cog: {},
      },
      lastSeenAt: now,
      burst: [],
      sustained: [],
    };
    SESSIONS.set(key, rec);
  }
  rec.lastSeenAt = now;
  return { key, rec };
}

// =========================
// Loop / abuse guards
// =========================
function pushWindow(arr, now, windowMs) {
  const a = Array.isArray(arr) ? arr : [];
  a.push(now);
  const cutoff = now - windowMs;
  while (a.length && a[0] < cutoff) a.shift();
  return a;
}

function checkBurst(rec, now) {
  rec.burst = pushWindow(rec.burst, now, BURST_WINDOW_MS);
  if (rec.burst.length > BURST_MAX) return { blocked: true, reason: "burst" };
  return { blocked: false };
}

function checkSustained(rec, now) {
  rec.sustained = pushWindow(rec.sustained, now, SUSTAINED_WINDOW_MS);
  if (rec.sustained.length > SUSTAINED_MAX) return { blocked: true, reason: "sustained" };
  return { blocked: false };
}

function replayDedupe(rec, inboundText, source, clientRequestId) {
  // Conservative: dedupe identical inbound within a short window.
  // chatEngine v0.6zV also has its own replayKey logic; this is an outer fuse.
  const now = nowMs();
  const rid = safeStr(clientRequestId).trim();

  const sig = sha1(`${safeStr(rec.data.sessionId)}|${safeStr(source)}|${safeStr(inboundText)}`).slice(0, 12);
  const key = rid ? `rid:${rid}` : `sig:${sig}`;

  const lastKey = safeStr(rec.data.__idx_lastReqKey || "");
  const lastAt = Number(rec.data.__idx_lastReqAt || 0);
  if (lastKey && key === lastKey && lastAt && now - lastAt <= LOOP_REPLAY_WINDOW_MS) {
    const lastOut = safeStr(rec.data.__idx_lastOut || "");
    const lastLane = safeStr(rec.data.__idx_lastLane || "general") || "general";
    if (lastOut) return { hit: true, reply: lastOut, lane: lastLane };
  }

  rec.data.__idx_lastReqKey = key;
  rec.data.__idx_lastReqAt = now;
  return { hit: false };
}

function writeReplay(rec, reply, lane) {
  rec.data.__idx_lastOut = safeStr(reply);
  rec.data.__idx_lastLane = safeStr(lane || "general") || "general";
}

// =========================
// App
// =========================
const app = express();

if (toBool(TRUST_PROXY, false)) {
  app.set("trust proxy", 1);
}

// Body parsers
app.use(express.json({ limit: MAX_JSON_BODY }));
app.use(express.text({ type: ["text/*"], limit: MAX_JSON_BODY }));

// CORS hard-lock (works even without cors package)
app.use((req, res, next) => {
  const origin = normalizeOrigin(req.headers.origin || "");
  const allow = isAllowedOrigin(origin);

  if (origin && allow) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, X-SB-Session, X-Session-Id, X-Visitor-Id"
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }

  if (req.method === "OPTIONS") {
    // Preflight should never loop; return fast
    return res.status(204).send("");
  }

  return next();
});

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const o = normalizeOrigin(origin);
  if (ORIGINS_ALLOWLIST.includes(o)) return true;
  for (const rx of ORIGIN_REGEXES) {
    try {
      if (rx.test(o)) return true;
    } catch (_) {}
  }
  return false;
}

// Health + discovery
app.get("/", (req, res) => {
  res.status(200).json({ ok: true, service: "sandblast-backend", version: INDEX_VERSION, env: NODE_ENV });
});
app.get("/health", (req, res) => {
  res.status(200).json({ ok: true, version: INDEX_VERSION, up: true, now: new Date().toISOString() });
});
app.get("/api/discovery", (req, res) => {
  res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    endpoints: ["/api/sandblast-gpt", "/api/nyx/chat", "/api/tts", "/api/voice", "/health"],
  });
});

// =========================
// Chat route (main)
// =========================
async function handleChatRoute(req, res) {
  const startedAt = nowMs();

  const body = isPlainObject(req.body) ? req.body : safeJsonParseMaybe(req.body) || {};
  const clientRequestId = safeStr(body.requestId || req.headers["x-request-id"] || "").trim();

  const source =
    safeStr(body?.client?.source || body?.source || req.headers["x-client-source"] || "").trim() || "unknown";

  const routeHint =
    safeStr(body?.client?.routeHint || body?.routeHint || body?.lane || req.headers["x-route-hint"] || "").trim() ||
    "general";

  const inboundText = safeStr(body.text || body.message || body.prompt || body.query || body?.payload?.text || "").trim();

  // Session
  const { rec } = getSession(req);

  // Abuse guards
  const burst = checkBurst(rec, startedAt);
  const sus = checkSustained(rec, startedAt);
  if (burst.blocked || sus.blocked) {
    const reply =
      burst.reason === "burst"
        ? "One sec — you’re firing a little fast. Try again in a moment."
        : "Give me a breath — then hit me again with a year or a request.";
    writeReplay(rec, reply, rec.data.lane || "general");
    return res.status(429).json({
      ok: true,
      reply,
      lane: rec.data.lane || "general",
      sessionPatch: {},
      requestId: clientRequestId || sha1(`${startedAt}|${Math.random()}`).slice(0, 10),
      meta: { index: INDEX_VERSION, throttled: burst.blocked ? "burst" : "sustained" },
    });
  }

  // Outer replay dedupe (inner engine also dedupes)
  const dedupe = replayDedupe(rec, inboundText, source, clientRequestId);
  if (dedupe.hit) {
    return res.status(200).json({
      ok: true,
      reply: dedupe.reply,
      lane: dedupe.lane,
      sessionPatch: {},
      requestId: clientRequestId || sha1(`${startedAt}|${Math.random()}`).slice(0, 10),
      meta: { index: INDEX_VERSION, replay: true },
    });
  }

  if (!chatEngine || typeof chatEngine.handleChat !== "function") {
    const reply = "Backend engine not loaded. Check deploy: Utils/chatEngine.js is missing.";
    writeReplay(rec, reply, "general");
    return res.status(500).json({ ok: false, reply, lane: "general", meta: { index: INDEX_VERSION, engine: "missing" } });
  }

  // Build engine input (Option B friendly)
  const engineInput = {
    ...body,
    requestId: clientRequestId || undefined, // IMPORTANT: let engine know if client actually provided one
    text: inboundText,
    source,
    routeHint,
    client: {
      ...(isPlainObject(body.client) ? body.client : {}),
      source,
      routeHint,
    },
    session: rec.data, // the live session object
  };

  let out;
  try {
    out = await chatEngine.handleChat(engineInput);
  } catch (e) {
    const msg = safeStr(e?.message || e).trim();
    const reply = "I hit a snag, but I’m still here. Give me a year (1950–2024) and I’ll jump right in.";
    writeReplay(rec, reply, rec.data.lane || "general");
    return res.status(500).json({
      ok: true,
      reply,
      lane: rec.data.lane || "general",
      requestId: clientRequestId || sha1(`${startedAt}|${Math.random()}`).slice(0, 10),
      meta: { index: INDEX_VERSION, error: safeStr(msg).slice(0, 200) },
    });
  }

  // Persist sessionPatch allowlist (engine already sanitized it; we still gate)
  if (out && isPlainObject(out.sessionPatch)) {
    applySessionPatch(rec.data, out.sessionPatch);
  }

  // Persist lane / lastOut for outer replay
  const lane = safeStr(out?.lane || rec.data.lane || "general") || "general";
  const reply = safeStr(out?.reply || "").trim() || "Okay — tell me what you want next.";
  rec.data.lane = lane;
  writeReplay(rec, reply, lane);

  // Standard response (NyxReplyContract-ish)
  return res.status(200).json({
    ok: true,
    reply,
    lane,
    ctx: out?.ctx,
    ui: out?.ui,
    directives: out?.directives,
    followUps: out?.followUps,
    followUpsStrings: out?.followUpsStrings,
    sessionPatch: out?.sessionPatch || {},
    cog: out?.cog,
    requestId: out?.requestId || clientRequestId || sha1(`${startedAt}|${Math.random()}`).slice(0, 10),
    meta: {
      ...(isPlainObject(out?.meta) ? out.meta : {}),
      index: INDEX_VERSION,
      elapsedMs: nowMs() - startedAt,
      source,
      routeHint,
    },
  });
}

function applySessionPatch(session, patch) {
  if (!isPlainObject(session) || !isPlainObject(patch)) return;

  // Mirror the allowlist from chatEngine (kept narrow on purpose).
  const PATCH_KEYS = new Set([
    "introDone",
    "introAt",
    "introVariantId",
    "introBucket",
    "lastInText",
    "lastInAt",
    "lastOut",
    "lastOutAt",
    "turns",
    "startedAt",
    "lastTurnAt",
    "lane",
    "lastLane",
    "lastYear",
    "lastMode",
    "activeMusicMode",
    "lastMusicYear",
    "pendingYear",
    "pendingMode",
    "pendingLane",
    "turnCount",
    "__hasRealUserTurn",
    "__introDone",
    "__cs1",
    "cog",
    "__ce_lastReqId",
    "__ce_lastReqAt",
    "__ce_lastOutHash",
    "__ce_lastOut",
    "__ce_lastOutLane",
    "allowPackets",
  ]);

  for (const [k, v] of Object.entries(patch)) {
    if (!PATCH_KEYS.has(k)) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;

    if (k === "cog") {
      if (isPlainObject(v)) session.cog = v;
      continue;
    }
    session[k] = v;
  }
}

// Main chat endpoints (aliases preserved)
app.post("/api/sandblast-gpt", handleChatRoute);
app.post("/api/nyx/chat", handleChatRoute);
app.post("/api/chat", handleChatRoute);

// =========================
// TTS
// =========================
async function handleTtsRoute(req, res) {
  const startedAt = nowMs();

  // Accept JSON body OR raw string OR { NO_TEXT: true, text: "..."} patterns
  let body = isPlainObject(req.body) ? req.body : safeJsonParseMaybe(req.body) || {};
  if (typeof req.body === "string") body = { text: req.body };

  const text = safeStr(body.text || body.message || body.prompt || "").trim();
  const noText = toBool(body.NO_TEXT || body.noText, false);

  if (!ELEVEN_API_KEY || !ELEVEN_VOICE_ID || !fetch) {
    return res.status(501).json({
      ok: false,
      error: "TTS not configured (missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID).",
      meta: { index: INDEX_VERSION },
    });
  }

  if (!text && !noText) {
    return res.status(400).json({ ok: false, error: "Missing text for TTS.", meta: { index: INDEX_VERSION } });
  }

  try {
    const payload = {
      text: text || " ",
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: NYX_VOICE_STABILITY,
        similarity_boost: NYX_VOICE_SIMILARITY,
        style: NYX_VOICE_STYLE,
        use_speaker_boost: NYX_VOICE_SPEAKER_BOOST,
      },
    };

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVEN_VOICE_ID)}`, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVEN_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const errTxt = await r.text().catch(() => "");
      return res.status(502).json({
        ok: false,
        error: "TTS upstream error",
        detail: safeStr(errTxt).slice(0, 800),
        meta: { index: INDEX_VERSION, status: r.status },
      });
    }

    const buf = Buffer.from(await r.arrayBuffer());

    // Safer headers
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Length", String(buf.length));
    return res.status(200).send(buf);
  } catch (e) {
    const msg = safeStr(e?.message || e).trim();
    return res.status(500).json({
      ok: false,
      error: "TTS failure",
      detail: safeStr(msg).slice(0, 250),
      meta: { index: INDEX_VERSION, elapsedMs: nowMs() - startedAt },
    });
  }
}

app.post("/api/tts", handleTtsRoute);
app.post("/api/voice", handleTtsRoute); // alias (kept)

// =========================
// Start
// =========================
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Sandblast] ${INDEX_VERSION} listening on ${PORT}`);
});

module.exports = { app, INDEX_VERSION };
