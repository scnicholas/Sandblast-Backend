"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v2.6.1sb
 * ------------------------------------------------------------
 * PURPOSE
 * - Tightened backend shell
 * - Removes duplicate replay authority from index layer
 * - Keeps Chat Engine as the semantic turn authority
 * - Uses TTS as the single synthesis authority
 * - Preserves frontend voice route contract without provider-side dispatch authority
 * - Keeps fail-open rendering contract
 * - Hardens TTS route error handling and response finalization
 * - Adds affect/stabilize/fail-safe unification
 * - Adds loop suppression / stale-UI wipe discipline
 * - Adds TTS response normalization so playable audio always streams when available
 */

const express = require("express");
const path = require("path");
const fs = require("fs");

let compression = null;
try {
  compression = require("compression");
} catch (_) {
  compression = null;
}

const INDEX_VERSION = "index.js v2.12.1sb TTS-HARDENED-AUDIO-CONTRACT + NEWSCANADA-MOUNT";
const SERVER_BOOT_AT = Date.now();

process.on("unhandledRejection", (reason) => {
  console.log("[Sandblast][unhandledRejection]", reason && (reason.stack || reason.message || reason));
});

process.on("uncaughtException", (err) => {
  console.log("[Sandblast][uncaughtException]", err && (err.stack || err.message || err));
  try {
    if (err && String(err.message || "").includes("EADDRINUSE")) process.exit(1);
  } catch (_) {}
});

function tryRequireMany(paths) {
  for (const p of paths) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_) {}
  }
  return null;
}

const envLoader = tryRequireMany(["dotenv", "./node_modules/dotenv"]);
if (envLoader && typeof envLoader.config === "function") {
  try { envLoader.config(); } catch (_) {}
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.locals.newsCanadaEditorsPicks = [];
app.locals.newsCanadaEditorsPicksMeta = { ok: false, file: "", count: 0, loadedAt: 0 };

if (compression) {
  app.use(compression());
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const NEWS_CANADA_DATA_FILE_CANDIDATES = [
  process.env.NEWS_CANADA_DATA_FILE,
  process.env.SB_NEWSCANADA_DATA_FILE,
  path.join(process.cwd(), "data", "newscanada", "editors-picks.v2.json"),
  path.join(__dirname, "data", "newscanada", "editors-picks.v2.json"),
  path.join(process.cwd(), "jobs", "news-canada", "data", "newscanada", "editors-picks.v2.json"),
  path.join(__dirname, "jobs", "news-canada", "data", "newscanada", "editors-picks.v2.json")
].filter(Boolean);

const NEWS_CANADA_REFRESH_MS = Math.max(15000, Number(process.env.NEWS_CANADA_REFRESH_MS || 60000));

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function now() {
  return Date.now();
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function uniq(arr) {
  return Array.from(new Set(Array.isArray(arr) ? arr.filter(Boolean) : []));
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function clipText(v, max) {
  const s = cleanText(v);
  const n = clamp(Number(max || 280), 32, 4000);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function maskSecret(v) {
  const s = cleanText(v);
  if (!s) return "";
  if (s.length <= 8) return "********";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function cleanReplyForUser(v) {
  let t = cleanText(v);
  if (!t) return "";
  t = t.replace(/\bthe backend hit a rough patch,?\s*but i can keep this steady without bouncing you into a menu\.?/ig, "I am here with you. We can take this one step at a time.");
  t = t.replace(/\bthe backend hit a rough patch,?\s*but i can keep this steady without dropping you into a menu\.?/ig, "I am here with you. We can take this one step at a time.");
  t = t.replace(/\b(bouncing|dropping)\s+you\s+into\s+a\s+menu\b/ig, "shifting gears too quickly");
  t = t.replace(/\bbackend\b/ig, "system");
  t = t.replace(/\s+([,.!?])/g, "$1").trim();
  return t;
}

function replyHash(v) {
  const s = cleanText(v).toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

function makeTraceId(prefix) {
  return `${prefix || "trace"}_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
}

function boolEnv(name, fallback) {
  const raw = lower(process.env[name]);
  if (!raw) return !!fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return !!fallback;
}

function parseOrigins(raw) {
  return uniq(
    cleanText(raw || "")
      .split(",")
      .map((s) => cleanText(s))
      .filter(Boolean)
  );
}

function sameHost(a, b) {
  try {
    return new URL(a).host === new URL(b).host;
  } catch (_) {
    return false;
  }
}

function getBackendPublicBase() {
  return cleanText(
    process.env.SB_BACKEND_PUBLIC_BASE_URL ||
    process.env.SANDBLAST_BACKEND_PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://sandblast-backend.onrender.com"
  ).replace(/\/$/, "");
}

function routeUrl(pathname) {
  const base = getBackendPublicBase();
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${p}`;
}

const CFG = {
  apiTokenHeader: process.env.SB_WIDGET_TOKEN_HEADER || process.env.SBNYX_WIDGET_TOKEN_HEADER || "x-sb-widget-token",
  apiToken: process.env.SB_WIDGET_TOKEN || process.env.SBNYX_WIDGET_TOKEN || "",
  requireVoiceRouteToken: boolEnv("SB_REQUIRE_VOICE_ROUTE_TOKEN", false),
  voiceRouteEnabled: boolEnv("SB_VOICE_ROUTE_ENABLED", true),
  preserveMixerVoice: boolEnv("SB_PRESERVE_MIXER_VOICE", true),
  corsAllowCredentials: boolEnv("SB_CORS_ALLOW_CREDENTIALS", true),
  corsAllowedOrigins: parseOrigins(
    process.env.SB_CORS_ALLOWED_ORIGINS ||
    "https://www.sandblast.channel,https://sandblast.channel,http://localhost:3000,http://127.0.0.1:3000"
  ),
  quietSupportHoldTurns: clamp(Number(process.env.SB_SUPPORT_HOLD_TURNS || 2), 1, 4),
  loopSuppressionWindowMs: clamp(Number(process.env.SB_LOOP_SUPPRESSION_MS || 12000), 3000, 45000),
  duplicateReplyWindowMs: clamp(Number(process.env.SB_DUPLICATE_REPLY_MS || 15000), 3000, 45000),
  requestTimeoutMs: clamp(Number(process.env.SB_REQUEST_TIMEOUT_MS || 18000), 6000, 45000),
  port: PORT
};

function isAllowedOrigin(origin) {
  const o = cleanText(origin);
  if (!o) return true;
  if (CFG.corsAllowedOrigins.includes("*")) return true;
  return CFG.corsAllowedOrigins.includes(o) || CFG.corsAllowedOrigins.some((x) => sameHost(x, o));
}

function applyCors(req, res) {
  const origin = cleanText(req.headers.origin || "");
  const reqHeaders = cleanText(req.headers["access-control-request-headers"] || "");
  const allowHeaders = uniq([
    "Content-Type",
    "Authorization",
    "x-sb-trace-id",
    CFG.apiTokenHeader,
    ...reqHeaders.split(",").map((s) => cleanText(s)).filter(Boolean)
  ]);

  if (origin && isAllowedOrigin(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    if (CFG.corsAllowCredentials) {
      res.header("Access-Control-Allow-Credentials", "true");
    }
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", allowHeaders.join(", "));
  res.header("Access-Control-Expose-Headers", "x-sb-trace-id");
  return origin;
}

app.use((req, res, next) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});

const chatEngineMod = tryRequireMany([
  "./chatEngine",
  "./chatEngine.js",
  "./ChatEngine",
  "./ChatEngine.js",
  "./utils/chatEngine",
  "./utils/chatEngine.js",
  "./Utils/chatEngine",
  "./Utils/chatEngine.js"
]);

const supportResponseMod = tryRequireMany([
  "./supportResponse",
  "./supportResponse.js",
  "./utils/supportResponse",
  "./utils/supportResponse.js",
  "./Utils/supportResponse",
  "./Utils/supportResponse.js"
]);

const voiceRouteMod = tryRequireMany([
  "./utils/voiceRoute",
  "./utils/voiceRoute.js",
  "./Utils/voiceRoute",
  "./Utils/voiceRoute.js"
]);

const ttsMod = tryRequireMany([
  "./tts",
  "./tts.js",
  "./utils/tts",
  "./utils/tts.js",
  "./Utils/tts",
  "./Utils/tts.js"
]);

const newsCanadaRouter = tryRequireMany([
  "./routes/newscanada",
  "./routes/newscanada.js",
  "./routes/newsCanada",
  "./routes/newsCanada.js",
  "./Routes/newscanada",
  "./Routes/newscanada.js"
]);


const marionBridgeMod = tryRequireMany([
  "./marionBridge",
  "./marionBridge.js",
  "./utils/marionBridge",
  "./utils/marionBridge.js",
  "./Utils/marionBridge",
  "./Utils/marionBridge.js",
  "./runtime/marionBridge",
  "./runtime/marionBridge.js"
]);

const affectEngineMod = tryRequireMany([
  "./affectEngine",
  "./affectEngine.js",
  "./utils/affectEngine",
  "./utils/affectEngine.js",
  "./Utils/affectEngine",
  "./Utils/affectEngine.js"
]);

const knowledgeRuntimeMod = tryRequireMany([
  "./Utils/knowledgeRuntime",
  "./Utils/knowledgeRuntime.js",
  "./utils/knowledgeRuntime",
  "./utils/knowledgeRuntime.js"
]);

const knowledgeRuntime = {
  available: !!knowledgeRuntimeMod,
  extract(query, opts) {
    try {
      if (knowledgeRuntimeMod && typeof knowledgeRuntimeMod.extract === "function") {
        return knowledgeRuntimeMod.extract(query, opts || {});
      }
      if (knowledgeRuntimeMod && typeof knowledgeRuntimeMod.retrieve === "function") {
        return knowledgeRuntimeMod.retrieve(query, opts || {});
      }
    } catch (_) {}
    return { ok: false, loaded: false, source: "index_fallback", extracted: true };
  }
};

const memory = {
  lastBySession: new Map(),
  supportBySession: new Map(),
  transportBySession: new Map()
};

function getSessionId(req) {
  return cleanText(
    req.headers["x-session-id"] ||
    req.headers["x-sb-session-id"] ||
    req.body?.sessionId ||
    req.body?.payload?.sessionId ||
    req.ip ||
    "anon"
  ).slice(0, 120);
}

function readBearerToken(req) {
  const auth = cleanText((req.headers && req.headers.authorization) || req.get?.("Authorization") || "");
  if (!auth) return "";
  if (!/^bearer\s+/i.test(auth)) return "";
  return cleanText(auth.replace(/^bearer\s+/i, ""));
}

function readToken(req) {
  const header = lower(CFG.apiTokenHeader || "x-sb-widget-token");
  const byHeader = cleanText((req.headers && req.headers[header]) || req.get?.(CFG.apiTokenHeader) || "");
  if (byHeader) return byHeader;
  return readBearerToken(req);
}

function denyUnauthorized(res) {
  return res.status(401).json({
    ok: false,
    error: "unauthorized",
    meta: { v: INDEX_VERSION, t: now() }
  });
}

function enforceToken(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (!CFG.apiToken) return next();
  const got = readToken(req);
  if (got && got === CFG.apiToken) return next();
  return denyUnauthorized(res);
}

function enforceVoiceRouteAccess(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (!CFG.requireVoiceRouteToken) return next();
  return enforceToken(req, res, next);
}

function getLastTurn(sessionId) {
  return memory.lastBySession.get(sessionId) || null;
}

function setLastTurn(sessionId, data) {
  memory.lastBySession.set(sessionId, {
    ...(getLastTurn(sessionId) || {}),
    ...(isObj(data) ? data : {}),
    at: now()
  });
}

function getSupportState(sessionId) {
  return memory.supportBySession.get(sessionId) || {
    hold: 0,
    active: false,
    replyHash: "",
    lastUserHash: "",
    updatedAt: 0
  };
}

function setSupportState(sessionId, patch) {
  const prev = getSupportState(sessionId);
  const next = {
    ...prev,
    ...(isObj(patch) ? patch : {}),
    updatedAt: now()
  };
  memory.supportBySession.set(sessionId, next);
  return next;
}

function getTransportState(sessionId) {
  return memory.transportBySession.get(sessionId) || {
    key: "",
    at: 0,
    count: 0
  };
}

function setTransportState(sessionId, patch) {
  const prev = getTransportState(sessionId);
  const next = {
    ...prev,
    ...(isObj(patch) ? patch : {}),
    at: now()
  };
  memory.transportBySession.set(sessionId, next);
  return next;
}
function normalizePayload(req) {
  const body = isObj(req.body) ? req.body : {};
  const payload = isObj(body.payload) ? body.payload : {};
  const guidedPrompt = isObj(body.guidedPrompt) ? body.guidedPrompt : (isObj(payload.guidedPrompt) ? payload.guidedPrompt : null);
  const text = cleanText(body.text || payload.text || payload.query || (guidedPrompt && (guidedPrompt.label || guidedPrompt.text)) || "");
  return {
    text,
    guidedPrompt,
    domainHint: cleanText(body.domainHint || payload.domainHint || (guidedPrompt && guidedPrompt.domainHint) || ""),
    intentHint: cleanText(body.intentHint || payload.intentHint || (guidedPrompt && guidedPrompt.intentHint) || ""),
    emotionalHint: cleanText(body.emotionalHint || payload.emotionalHint || (guidedPrompt && guidedPrompt.emotionalHint) || ""),
    body,
    payload,
    lane: cleanText(payload.lane || body.lane || "general").toLowerCase() || "general",
    year: cleanText(payload.year || body.year || ""),
    mode: cleanText(payload.mode || body.mode || ""),
    turnId: payload.turnId || body.turnId || null,
    traceId: cleanText(req.headers["x-sb-trace-id"] || payload.traceId || body.traceId || makeTraceId("req")),
    client: isObj(body.client) ? body.client : {}
  };
}

function normalizeEmotion(raw, inputText) {
  const out = {
    ok: false,
    label: "",
    intensity: 0,
    distress: false,
    stabilize: false,
    sensitive: false,
    positive: false,
    technical: false
  };

  const baseText = `${safeStr(inputText)} ${safeStr(raw && raw.label)} ${safeStr(raw && raw.name)} ${safeStr(raw && raw.primary)} ${safeStr(raw && raw.mode)} ${safeStr(raw && raw.intent)}`;
  const txt = lower(baseText);

  if (isObj(raw)) {
    out.ok = true;
    out.label = cleanText(raw.label || raw.name || raw.primary || "");
    const n = Number(raw.intensity ?? raw.score ?? raw.weight ?? 0);
    out.intensity = Number.isFinite(n) ? clamp(n, 0, 1) : 0;
    out.distress = !!(raw.distress || raw.support || raw.overwhelmed || raw.anxious || raw.negative);
    out.stabilize = !!(raw.stabilize || raw.regulate || raw.deescalate);
    out.sensitive = !!(raw.sensitive || raw.crisis || raw.selfHarm);
    out.positive = !!(raw.positive || raw.upbeat);
    out.technical = !!raw.technical;
  }

  const rawText = txt;
  out.distress = out.distress || /(overwhelmed|panic|panicking|not okay|anxious|anxiety|too much|breaking down|falling apart|burned out|burnt out|help me|i am scared|i'm scared|i am hurting|i'm hurting|i feel awful|i feel terrible|i am drowning|i'm drowning)/.test(rawText);
  out.stabilize = out.stabilize || out.distress || /(stabilize|steady|calm down|regulate|slow down)/.test(rawText);
  out.sensitive = out.sensitive || /(suic|kill myself|want to die|end it|self harm|self-harm)/.test(rawText);
  out.positive = /(happy|great|beautiful day|amazing|good mood|outstanding|did great|things are going right|relieved)/.test(rawText);
  out.technical = /(debug|backend|chat engine|state spine|support response|marion|loop|fallback|api|route|tts|voice|fix|index\.js|emotion|stabiliz)/.test(rawText);

  if (!out.label) {
    if (out.sensitive) out.label = "crisis";
    else if (out.distress) out.label = "distress";
    else if (out.technical) out.label = "technical";
    else if (out.positive) out.label = "positive";
    else out.label = "neutral";
  }

  if (!out.ok) out.ok = out.distress || out.sensitive || out.positive || out.technical || !!out.label;
  return out;
}

function inferEmotion(text, reqCtx) {
  const raw = cleanText(text);
  let engineResult = null;

  try {
    if (affectEngineMod && typeof affectEngineMod.detect === "function") {
      engineResult = affectEngineMod.detect(raw, reqCtx || {});
    } else if (affectEngineMod && typeof affectEngineMod.analyze === "function") {
      engineResult = affectEngineMod.analyze(raw, reqCtx || {});
    } else if (affectEngineMod && typeof affectEngineMod === "function") {
      engineResult = affectEngineMod(raw, reqCtx || {});
    }
  } catch (err) {
    console.log("[Sandblast][affectEngine:error]", err && (err.stack || err.message || err));
    engineResult = null;
  }

  return normalizeEmotion(engineResult, raw);
}

function normalizeSupportReply(text) {
  const cleaned = cleanReplyForUser(text);
  if (cleaned) return cleaned;
  return "I am here with you. We can take this one step at a time.";
}

function buildSafeSupportReply(inputText, emotion, extras) {
  const emo = isObj(emotion) ? emotion : normalizeEmotion(null, inputText);
  const opts = isObj(extras) ? extras : {};
  const base = cleanText(inputText);

  if (emo.sensitive) {
    return "I am here with you. If you are in immediate danger or might hurt yourself, call your local emergency number right now. In Canada or the United States you can also call or text 988. Tell me: did something happen today, or has this been building for a while?";
  }

  let externalReply = "";
  try {
    if (supportResponseMod && typeof supportResponseMod.buildSupportReply === "function") {
      externalReply = safeStr(supportResponseMod.buildSupportReply({
        text: base,
        emo,
        emotion: emo,
        mode: "stabilize",
        ...opts
      }));
    } else if (supportResponseMod && typeof supportResponseMod.getSupportReply === "function") {
      externalReply = safeStr(supportResponseMod.getSupportReply({
        text: base,
        emo,
        emotion: emo,
        mode: "stabilize",
        ...opts
      }));
    } else if (typeof supportResponseMod === "function") {
      externalReply = safeStr(supportResponseMod({
        text: base,
        emo,
        emotion: emo,
        mode: "stabilize",
        ...opts
      }));
    }
  } catch (err) {
    console.log("[Sandblast][supportResponse:error]", err && (err.stack || err.message || err));
  }

  if (externalReply) return normalizeSupportReply(externalReply);

  if (emo.distress) {
    return "I am here with you. We can take this one step at a time. Tell me what happened, or keep talking and I will stay with you.";
  }

  return "I am here with you. Tell me what happened, and we will steady this together.";
}

function buildQuietUiPatch(reason, holdActive) {
  const quiet = {
    mode: "quiet",
    chips: [],
    allowMic: true,
    replace: true,
    clearStale: true,
    revision: now()
  };

  return {
    ui: quiet,
    directives: [],
    followUps: [],
    followUpsStrings: [],
    sessionPatch: {
      supportLock: holdActive ? { active: true } : {}
    },
    metaPatch: {
      clearStaleUi: true,
      suppressMenus: true,
      failSafe: reason === "failsafe",
      supportHold: !!holdActive
    }
  };
}

function shouldEnterSupportHold(text, emotion, engineResult) {
  const emo = isObj(emotion) ? emotion : normalizeEmotion(null, text);
  const intent = lower(engineResult && engineResult.intent);
  const mode = lower(engineResult && engineResult.mode);
  return !!(
    emo.sensitive ||
    emo.distress ||
    emo.stabilize ||
    intent === "stabilize" ||
    mode === "transitional" ||
    mode === "support" ||
    mode === "quiet"
  );
}

function buildSupportSessionPatch(existing, active, release) {
  const prev = isObj(existing) ? existing : {};
  const lock = {};
  if (active) lock.active = true;
  if (release) lock.release = true;
  return {
    ...prev,
    supportLock: lock
  };
}

function shouldSuppressMenus(engineOut, supportActive) {
  const ui = isObj(engineOut?.ui) ? engineOut.ui : {};
  const meta = isObj(engineOut?.meta) ? engineOut.meta : {};
  if (supportActive) return true;
  return !!(
    ui.replace ||
    ui.clearStale ||
    ui.menuSuppressed ||
    ui.degradedSupport ||
    ui.failSafe ||
    meta.clearStaleUi ||
    meta.suppressMenus ||
    meta.failSafe
  );
}

function enforceQuietUiIfNeeded(base, opts) {
  const out = isObj(base) ? { ...base } : {};
  const o = isObj(opts) ? opts : {};
  const supportActive = !!o.supportActive;
  const failSafe = !!o.failSafe;
  const forceQuiet = !!o.forceQuiet;

  if (!(supportActive || failSafe || forceQuiet)) return out;

  const patch = buildQuietUiPatch(failSafe ? "failsafe" : "support", supportActive);
  out.ui = patch.ui;
  out.directives = patch.directives;
  out.followUps = patch.followUps;
  out.followUpsStrings = patch.followUpsStrings;
  out.sessionPatch = {
    ...(isObj(out.sessionPatch) ? out.sessionPatch : {}),
    ...(isObj(patch.sessionPatch) ? patch.sessionPatch : {})
  };
  out.meta = {
    ...(isObj(out.meta) ? out.meta : {}),
    ...(isObj(patch.metaPatch) ? patch.metaPatch : {})
  };
  return out;
}

function mergeMeta(base, patch) {
  return {
    ...(isObj(base) ? base : {}),
    ...(isObj(patch) ? patch : {})
  };
}

function buildTransportKey(ctx, text, req) {
  const msg = safeStr(text).trim().toLowerCase();
  return [
    getSessionId(req),
    safeStr(ctx?.lane || ""),
    safeStr(ctx?.mode || ""),
    safeStr(ctx?.year || ""),
    msg
  ].join("|");
}

function detectLoop(sessionId, reply, userText) {
  const prev = getLastTurn(sessionId);
  const curHash = replyHash(reply);
  const userHash = replyHash(userText);
  const within = prev && (now() - Number(prev.at || 0) < CFG.duplicateReplyWindowMs);
  const sameReply = !!(within && prev.replyHash && prev.replyHash === curHash);
  const sameUser = !!(within && prev.userHash && prev.userHash === userHash);
  return {
    sameReply,
    sameUser,
    repeated: sameReply && sameUser,
    curHash,
    userHash
  };
}

function applyAffectBridge(base, affectInput) {
  const shaped = isObj(base) ? { ...base } : {};
  if (!affectEngineMod || typeof affectEngineMod.runAffectEngine !== "function") return shaped;
  const input = isObj(affectInput) ? affectInput : {};
  try {
    const lockedEmotion = isObj(input.lockedEmotion) ? input.lockedEmotion : null;
    const strategy = isObj(input.strategy) ? input.strategy : null;
    if (!lockedEmotion || !lockedEmotion.locked || !strategy) return shaped;
    const affectOut = affectEngineMod.runAffectEngine({
      assistantDraft: cleanText(shaped.reply || shaped.payload?.reply || ""),
      lockedEmotion,
      strategy,
      lane: cleanText(shaped.lane || "Default") || "Default",
      memory: isObj(input.memory) ? input.memory : {}
    });
    if (!isObj(affectOut) || affectOut.ok === false) return shaped;
    const spokenText = cleanText(affectOut.spokenText || "");
    if (!spokenText) return shaped;
    shaped.reply = spokenText;
    shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply: spokenText, spokenText };
    shaped.ttsProfile = isObj(affectOut.ttsProfile) ? affectOut.ttsProfile : shaped.ttsProfile;
    shaped.audio = isObj(shaped.audio) ? shaped.audio : {};
    shaped.audio.textToSynth = spokenText;
    shaped.audio.enabled = true;
    shaped.meta = mergeMeta(shaped.meta, { affectApplied: true, linkedDatasets: Array.isArray(affectOut.expressionBridge?.linkedDatasets) ? affectOut.expressionBridge.linkedDatasets.slice(0, 12) : [] });
  } catch (err) {
    console.log("[Sandblast][affectBridge:error]", err && (err.stack || err.message || err));
  }
  return shaped;
}

function buildAffectInputFromMarion(marion) {
  const src = isObj(marion) ? marion : {};
  const layer2 = isObj(src.layer2) ? src.layer2 : {};
  const emotion = isObj(layer2.emotion) ? layer2.emotion : {};
  const meta = isObj(src.meta) ? src.meta : {};
  const lockedEmotion = isObj(meta.lockedEmotion) ? meta.lockedEmotion : (emotion.primaryEmotion ? {
    locked: true,
    primaryEmotion: cleanText(emotion.primaryEmotion || "neutral") || "neutral",
    secondaryEmotion: cleanText(emotion.secondaryEmotion || ""),
    intensity: Number.isFinite(Number(emotion.intensity)) ? Number(emotion.intensity) : 0,
    valence: Number.isFinite(Number(emotion.valence)) ? Number(emotion.valence) : 0,
    valenceLabel: cleanText(emotion.valenceLabel || ""),
    confidence: Number.isFinite(Number(emotion.confidence)) ? Number(emotion.confidence) : 0,
    needs: Array.isArray(emotion.needs) ? emotion.needs : [],
    cues: Array.isArray(emotion.cues) ? emotion.cues : [],
    supportFlags: isObj(emotion.supportFlags) ? emotion.supportFlags : {},
    evidenceMatches: Array.isArray(emotion.evidenceMatches) ? emotion.evidenceMatches : [],
    meta: { linkedDatasets: Array.isArray(meta.linkedDatasets) ? meta.linkedDatasets : [] }
  } : null);
  const strategy = isObj(meta.strategy) ? meta.strategy : null;
  return { lockedEmotion, strategy, guidedPrompt: src.guidedPrompt || meta.guidedPrompt || null };
}


function shapeEngineReply(raw) {
  if (!isObj(raw)) return {};
  const payload = isObj(raw.payload) ? raw.payload : {};
  return {
    ok: raw.ok !== false,
    reply: cleanText(raw.spokenText || payload.spokenText || raw.reply || payload.reply || raw.message || raw.text || ""),
    payload: isObj(payload) ? payload : {},
    lane: cleanText(raw.lane || raw.laneId || raw.sessionLane || payload.lane || ""),
    laneId: cleanText(raw.laneId || raw.lane || ""),
    sessionLane: cleanText(raw.sessionLane || raw.lane || ""),
    bridge: raw.bridge || null,
    ctx: isObj(raw.ctx) ? raw.ctx : {},
    ui: isObj(raw.ui) ? raw.ui : {},
    directives: Array.isArray(raw.directives) ? raw.directives : [],
    followUps: Array.isArray(raw.followUps) ? raw.followUps : [],
    followUpsStrings: Array.isArray(raw.followUpsStrings) ? raw.followUpsStrings : [],
    sessionPatch: isObj(raw.sessionPatch) ? raw.sessionPatch : {},
    cog: isObj(raw.cog) ? raw.cog : {},
    meta: isObj(raw.meta) ? raw.meta : {},
    audio: isObj(raw.audio) ? raw.audio : null,
    ttsProfile: isObj(raw.ttsProfile) ? raw.ttsProfile : null,
    voiceRoute: isObj(raw.voiceRoute) ? raw.voiceRoute : null
  };
}

async function callChatEngine(input) {
  if (!chatEngineMod) return null;
  try {
    if (typeof chatEngineMod.run === "function") return await chatEngineMod.run(input);
    if (typeof chatEngineMod.chat === "function") return await chatEngineMod.chat(input);
    if (typeof chatEngineMod.handle === "function") return await chatEngineMod.handle(input);
    if (typeof chatEngineMod.reply === "function") return await chatEngineMod.reply(input);
    if (typeof chatEngineMod === "function") return await chatEngineMod(input);
  } catch (err) {
    console.log("[Sandblast][chatEngine:error]", err && (err.stack || err.message || err));
    return { __engineError: err };
  }
  return null;
}

async function callMarionBridge(input) {
  if (!marionBridgeMod) return null;
  try {
    if (typeof marionBridgeMod.route === "function") return await marionBridgeMod.route(input);
    if (typeof marionBridgeMod.ask === "function") return await marionBridgeMod.ask(input);
    if (typeof marionBridgeMod.handle === "function") return await marionBridgeMod.handle(input);
    if (typeof marionBridgeMod === "function") return await marionBridgeMod(input);
  } catch (err) {
    console.log("[Sandblast][marionBridge:error]", err && (err.stack || err.message || err));
  }
  return null;
}

function callWithTimeout(promiseOrValue, ms, label) {
  const timeoutMs = clamp(Number(ms || CFG.requestTimeoutMs || 18000), 1000, 60000);
  return Promise.race([
    Promise.resolve(promiseOrValue),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label || "operation"}_timeout`)), timeoutMs))
  ]);
}

function ttsHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.handleTts === "function") return mod.handleTts.bind(mod);
  if (typeof mod.ttsHandler === "function") return mod.ttsHandler.bind(mod);
  if (typeof mod.handler === "function") return mod.handler.bind(mod);
  if (typeof mod.handle === "function") return mod.handle.bind(mod);
  if (typeof mod.delegateTts === "function") return mod.delegateTts.bind(mod);
  if (typeof mod.generateSpeech === "function") return mod.generateSpeech.bind(mod);
  if (typeof mod.speak === "function") return mod.speak.bind(mod);
  if (typeof mod.run === "function") return mod.run.bind(mod);
  if (typeof mod.generate === "function") return mod.generate.bind(mod);
  if (typeof mod.tts === "function") return mod.tts.bind(mod);
  if (typeof mod.synthesize === "function") return mod.synthesize.bind(mod);
  if (typeof mod.default === "function") return mod.default.bind(mod);
  if (typeof mod === "function") return mod;
  return null;
}

function voiceRouteHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.handleVoiceRoute === "function") return mod.handleVoiceRoute.bind(mod);
  if (typeof mod.voiceRouteHandler === "function") return mod.voiceRouteHandler.bind(mod);
  if (typeof mod.handler === "function") return mod.handler.bind(mod);
  if (typeof mod.handle === "function") return mod.handle.bind(mod);
  if (typeof mod === "function") return mod;
  return null;
}

function voiceHealthFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.health === "function") return mod.health.bind(mod);
  if (typeof mod.getHealth === "function") return mod.getHealth.bind(mod);
  return null;
}

function ttsHealthFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.health === "function") return mod.health.bind(mod);
  if (typeof mod.getHealth === "function") return mod.getHealth.bind(mod);
  if (typeof mod.status === "function") return mod.status.bind(mod);
  return null;
}



function sendTtsJsonError(req, res, statusCode, error, detail, extra) {
  const code = clamp(Number(statusCode || 503), 400, 599);
  const traceId = cleanText((req && req.headers && req.headers["x-sb-trace-id"]) || makeTraceId("tts"));
  const payload = {
    ok: false,
    spokenUnavailable: true,
    error: cleanText(error || "tts_route_failure") || "tts_route_failure",
    detail: cleanText(detail || "TTS route failed") || "TTS route failed",
    traceId,
    meta: { v: INDEX_VERSION, t: now() },
    payload: { spokenUnavailable: true }
  };
  if (isObj(extra)) Object.assign(payload, extra);
  return res.status(code).json(payload);
}

async function dispatchTts(req, res) {
  const moduleHandler = ttsHandlerFromModule(ttsMod);
  console.log("[Sandblast][ttsRoute:dispatch]", { path: req.originalUrl || req.path || "/api/tts", hasHandler: !!moduleHandler, host: getBackendPublicBase() });
  if (!moduleHandler) {
    throw new Error("tts_handler_unavailable");
  }
  return moduleHandler(req, res);
}

function attachVoiceRoute(base) {
  const shaped = isObj(base) ? { ...base } : {};
  const existing = isObj(shaped.voiceRoute) ? shaped.voiceRoute : {};
  const routeEnabled = !!CFG.voiceRouteEnabled;
  const route = {
    enabled: routeEnabled,
    endpoint: routeUrl("/api/tts"),
    healthEndpoint: routeUrl("/api/tts/health"),
    method: "POST",
    requiresToken: !!(CFG.requireVoiceRouteToken && CFG.apiToken),
    preserveMixerVoice: !!CFG.preserveMixerVoice,
    jsonAudioSupported: true,
    streamAudioSupported: true,
    contractVersion: "audio-first-v1",
    deterministicAudio: true,
    failOpenChat: true,
    traceHeader: "x-sb-trace-id"
  };

  if (routeEnabled && shaped.reply && !shaped.audio) {
    shaped.voiceRoute = { ...route, ...existing };
  } else if (existing && Object.keys(existing).length) {
    shaped.voiceRoute = { ...route, ...existing };
  }

  return shaped;
}

function normalizeVoiceRouteResponse(out) {
  if (!isObj(out)) return null;
  return {
    enabled: out.enabled !== false,
    endpoint: cleanText(out.endpoint || "/api/tts") || "/api/tts",
    healthEndpoint: cleanText(out.healthEndpoint || "/api/tts/health") || "/api/tts/health",
    method: cleanText(out.method || "POST") || "POST",
    requiresToken: !!out.requiresToken,
    preserveMixerVoice: !!out.preserveMixerVoice,
    jsonAudioSupported: out.jsonAudioSupported !== false,
    streamAudioSupported: out.streamAudioSupported !== false,
    contractVersion: cleanText(out.contractVersion || "audio-first-v1") || "audio-first-v1",
    deterministicAudio: out.deterministicAudio !== false,
    failOpenChat: out.failOpenChat !== false,
    traceHeader: cleanText(out.traceHeader || "x-sb-trace-id") || "x-sb-trace-id"
  };
}

function buildSpeechContract(shaped, norm) {
  const payload = isObj(shaped && shaped.payload) ? shaped.payload : {};
  const voiceRoute = isObj(shaped && shaped.voiceRoute) ? shaped.voiceRoute : {};
  const reply = cleanReplyForUser(
    shaped && shaped.reply || payload.reply || payload.text || voiceRoute.text || norm && norm.text || ""
  );
  const textDisplay = cleanReplyForUser(
    payload.textDisplay || voiceRoute.textDisplay || shaped && shaped.textDisplay || reply
  ) || reply;
  const textSpeak = cleanReplyForUser(
    payload.textSpeak || voiceRoute.textSpeak || shaped && shaped.textSpeak || reply
  ) || reply;
  const routeKind = cleanText(
    payload.routeKind || voiceRoute.routeKind || shaped && shaped.routeKind || (norm && norm.mode === "intro" ? "intro" : "main")
  ) || "main";
  const intro = voiceRoute.intro === true || payload.intro === true || routeKind === "intro";
  const source = cleanText(payload.source || voiceRoute.source || "chat");
  const speechHints = isObj(payload.speechHints) ? payload.speechHints : (isObj(voiceRoute.speechHints) ? voiceRoute.speechHints : {});
  const speech = {
    text: reply,
    textDisplay,
    textSpeak,
    routeKind,
    intro,
    source: source || (intro ? "intro" : "chat"),
    speechHints,
    alignmentVersion: "speech-contract-v1"
  };
  return speech;
}


function normalizeNewsCanadaStory(item, index) {
  if (!item || typeof item !== "object") return null;

  const title = cleanText(item.title || item.headline || item.name || "");
  const url = cleanText(item.url || item.link || item.href || item.storyUrl || item.canonicalUrl || "");
  if (!title || !url) return null;

  const images = Array.isArray(item.images)
    ? item.images.filter(Boolean)
    : Array.isArray(item.media)
      ? item.media.filter(Boolean)
      : [];

  const categories = Array.isArray(item.categories)
    ? item.categories
    : Array.isArray(item.tags)
      ? item.tags
      : Array.isArray(item.topics)
        ? item.topics
        : [];

  return {
    id: cleanText(item.id || item.storyId || item.slug || url || `story-${index || 0}`),
    title,
    summary: cleanText(item.summary || item.description || item.excerpt || item.deck || item.body || item.content || item.text || ""),
    body: typeof item.body === "string" ? item.body.trim() : "",
    content: typeof item.content === "string" ? item.content.trim() : (typeof item.fullText === "string" ? item.fullText.trim() : (typeof item.text === "string" ? item.text.trim() : "")),
    url,
    issue: cleanText(item.issue || item.kicker || item.section || item.categoryLabel || "Editor's Pick"),
    categories: categories.map(cleanText).filter(Boolean).slice(0, 4),
    images: images.slice(0, 12),
    publishedAt: cleanText(item.publishedAt || item.publishDate || item.date || ""),
    author: cleanText(item.author || item.byline || item.creator || ""),
    storyUrl: cleanText(item.storyUrl || ""),
    canonicalUrl: cleanText(item.canonicalUrl || "")
  };
}

function normalizeNewsCanadaFeed(payload) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload && payload.items) ? payload.items
    : Array.isArray(payload && payload.stories) ? payload.stories
    : Array.isArray(payload && payload.articles) ? payload.articles
    : Array.isArray(payload && payload.data) ? payload.data
    : [];

  return list
    .map((item, index) => normalizeNewsCanadaStory(item, index))
    .filter(Boolean);
}

function resolveNewsCanadaDataFile() {
  for (const candidate of NEWS_CANADA_DATA_FILE_CANDIDATES) {
    const clean = cleanText(candidate);
    if (!clean) continue;
    try {
      if (fs.existsSync(clean)) return clean;
    } catch (_) {}
  }
  return cleanText(NEWS_CANADA_DATA_FILE_CANDIDATES[0] || "");
}

function loadNewsCanadaEditorsPicksFromDisk() {
  const file = resolveNewsCanadaDataFile();
  if (!file) {
    return { ok: false, file: "", count: 0, stories: [], error: "news_canada_data_file_missing" };
  }

  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    const stories = normalizeNewsCanadaFeed(parsed);
    app.locals.newsCanadaEditorsPicks = stories;
    app.locals.newsCanadaEditorsPicksMeta = {
      ok: true,
      file,
      count: stories.length,
      loadedAt: now()
    };
    return { ok: true, file, count: stories.length, stories };
  } catch (err) {
    app.locals.newsCanadaEditorsPicks = Array.isArray(app.locals.newsCanadaEditorsPicks) ? app.locals.newsCanadaEditorsPicks : [];
    app.locals.newsCanadaEditorsPicksMeta = {
      ok: false,
      file,
      count: Array.isArray(app.locals.newsCanadaEditorsPicks) ? app.locals.newsCanadaEditorsPicks.length : 0,
      loadedAt: now(),
      error: cleanText(err && (err.message || err) || "news canada load failed")
    };
    return {
      ok: false,
      file,
      count: Array.isArray(app.locals.newsCanadaEditorsPicks) ? app.locals.newsCanadaEditorsPicks.length : 0,
      stories: Array.isArray(app.locals.newsCanadaEditorsPicks) ? app.locals.newsCanadaEditorsPicks : [],
      error: cleanText(err && (err.message || err) || "news canada load failed")
    };
  }
}

function bootstrapNewsCanadaFeed() {
  const result = loadNewsCanadaEditorsPicksFromDisk();
  console.log("[Sandblast][newsCanada:bootstrap]", {
    ok: !!result.ok,
    file: result.file,
    count: result.count,
    error: result.error || ""
  });

  if (NEWS_CANADA_REFRESH_MS > 0) {
    setInterval(() => {
      const refreshed = loadNewsCanadaEditorsPicksFromDisk();
      console.log("[Sandblast][newsCanada:refresh]", {
        ok: !!refreshed.ok,
        file: refreshed.file,
        count: refreshed.count,
        error: refreshed.error || ""
      });
    }, NEWS_CANADA_REFRESH_MS).unref();
  }
}

app.get("/health", (req, res) => {
  applyCors(req, res);
  const ttsHealth = ttsHealthFromModule(ttsMod);
  let tts = null;
  try { tts = ttsHealth ? ttsHealth() : null; } catch (_) {}
  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    upMs: now() - SERVER_BOOT_AT,
    bootAt: SERVER_BOOT_AT,
    modules: {
      chatEngine: !!chatEngineMod,
      marionBridge: !!marionBridgeMod,
      supportResponse: !!supportResponseMod,
      affectEngine: !!affectEngineMod,
      voiceRoute: !!voiceRouteMod,
      tts: !!ttsMod
    },
    bindings: {
      voiceRouteHandler: false,
      voiceRouteHealth: false,
      ttsHandler: !!ttsHandlerFromModule(ttsMod),
      ttsHealth: !!ttsHealthFromModule(ttsMod)
    },
    voiceRouteEnabled: !!CFG.voiceRouteEnabled,
    preserveMixerVoice: !!CFG.preserveMixerVoice,
    tts
  });
});

app.get("/api/health", (req, res) => {
  applyCors(req, res);
  const ttsHealth = ttsHealthFromModule(ttsMod);
  let tts = null;
  try { tts = ttsHealth ? ttsHealth() : null; } catch (_) {}
  return res.status(200).json({
    ok: true,
    version: INDEX_VERSION,
    traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("health")),
    upMs: now() - SERVER_BOOT_AT,
    tts,
    voiceRouteEnabled: !!CFG.voiceRouteEnabled,
    requireVoiceRouteToken: !!CFG.requireVoiceRouteToken,
    backendPublicBase: getBackendPublicBase(),
    audioContract: {
      version: "audio-first-v1",
      endpoint: routeUrl("/api/tts"),
      healthEndpoint: routeUrl("/api/tts/health"),
      deterministicAudio: true
    },
    newsCanada: {
      file: app.locals.newsCanadaEditorsPicksMeta?.file || resolveNewsCanadaDataFile(),
      availableStories: Array.isArray(app.locals.newsCanadaEditorsPicks) ? app.locals.newsCanadaEditorsPicks.length : 0,
      loadedAt: app.locals.newsCanadaEditorsPicksMeta?.loadedAt || 0
    }
  });
});

app.get("/api/tts/health", enforceVoiceRouteAccess, async (req, res) => {
  applyCors(req, res);
  const handler = ttsHealthFromModule(ttsMod);
  if (!handler) {
    return res.status(200).json({
      ok: false,
      enabled: false,
      error: "tts_health_unavailable",
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: INDEX_VERSION, t: now() }
    });
  }
  try {
    const health = await Promise.resolve(handler());
    return res.status(200).json({
      ok: !!(health && health.ok !== false),
      enabled: true,
      health,
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: INDEX_VERSION, t: now() }
    });
  } catch (err) {
    return res.status(503).json({
      ok: false,
      enabled: true,
      error: "tts_health_failed",
      detail: cleanText(err && (err.message || err) || "tts health failed"),
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: INDEX_VERSION, t: now() }
    });
  }
});

app.post(["/api/tts", "/tts"], enforceVoiceRouteAccess, async (req, res) => {
  applyCors(req, res);
  try {
    return await dispatchTts(req, res);
  } catch (err) {
    console.log("[Sandblast][ttsRoute:error]", err && (err.stack || err.message || err));
    if (res.headersSent) return;
    return sendTtsJsonError(req, res, 503, "tts_route_failure", cleanText(err && (err.message || err) || "tts route failed"), {
      configSource: ttsHandlerFromModule(ttsMod) ? "tts_module" : "unavailable",
      ttsModuleBound: !!ttsHandlerFromModule(ttsMod)
    });
  }
});

app.post("/api/chat", enforceToken, async (req, res) => {
  applyCors(req, res);
  const startedAt = now();
  const norm = normalizePayload(req);
  const sessionId = getSessionId(req);
  const priorSupport = getSupportState(sessionId);
  let supportHold = clamp(Number(priorSupport.hold || 0), 0, CFG.quietSupportHoldTurns);
  let supportActive = !!priorSupport.active && supportHold > 0;
  if (supportHold > 0) supportHold -= 1;
  let failSafe = false;

  const emotion = inferEmotion(norm.text, {
    lane: norm.lane,
    mode: norm.mode,
    sessionId,
    traceId: norm.traceId
  });

  const transportKey = buildTransportKey(norm, norm.text, req);
  const transportState = getTransportState(sessionId);
  if (transportKey && transportState.key === transportKey && (startedAt - Number(transportState.at || 0) < CFG.loopSuppressionWindowMs)) {
    setTransportState(sessionId, { key: transportKey, count: Number(transportState.count || 0) + 1 });
    return res.status(200).json({
      ok: true,
      reply: normalizeSupportReply("I am here with you. We can take this one step at a time."),
      payload: { reply: normalizeSupportReply("I am here with you. We can take this one step at a time.") },
      lane: norm.lane || "general",
      laneId: norm.lane || "general",
      sessionLane: norm.lane || "general",
      bridge: null,
      ctx: {},
      ui: buildQuietUiPatch("loop", true).ui,
      directives: [],
      followUps: [],
      followUpsStrings: [],
      sessionPatch: buildSupportSessionPatch({}, true, false),
      cog: { intent: "STABILIZE", mode: "transitional", publicMode: true },
      requestId: makeTraceId("req"),
      traceId: norm.traceId,
      meta: {
        v: INDEX_VERSION,
        t: now(),
        transportDuplicateSuppressed: true,
        supportHold: Math.max(supportHold, 1),
        latencyMs: now() - startedAt
      },
      voiceRoute: normalizeVoiceRouteResponse(attachVoiceRoute({ reply: norm.text || "" }).voiceRoute)
    });
  }
  setTransportState(sessionId, { key: transportKey, count: 1 });

  const marionInput = {
    text: norm.text,
    lane: norm.lane,
    year: norm.year,
    mode: norm.mode,
    traceId: norm.traceId,
    sessionId,
    turnId: norm.turnId,
    payload: norm.payload,
    emotion,
    guidedPrompt: norm.guidedPrompt,
    domainHint: norm.domainHint,
    intentHint: norm.intentHint,
    emotionalHint: norm.emotionalHint
  };

  let marion = null;
  try {
    marion = await callWithTimeout(callMarionBridge(marionInput), CFG.requestTimeoutMs, "marion_bridge");
  } catch (err) {
    console.log("[Sandblast][marionBridge:timeout]", err && (err.stack || err.message || err));
    marion = null;
  }

  const engineInput = {
    text: norm.text,
    payload: norm.payload,
    body: norm.body,
    lane: norm.lane,
    year: norm.year,
    mode: norm.mode,
    turnId: norm.turnId,
    traceId: norm.traceId,
    sessionId,
    client: norm.client,
    marion,
    emotion,
    guidedPrompt: norm.guidedPrompt,
    domainHint: norm.domainHint,
    intentHint: norm.intentHint,
    emotionalHint: norm.emotionalHint,
    knowledge: knowledgeRuntime.extract(norm.text, { marion, guidedPrompt: norm.guidedPrompt })
  };

  let engineRaw = null;
  let engineError = null;
  try {
    engineRaw = await callWithTimeout(callChatEngine(engineInput), CFG.requestTimeoutMs, "chat_engine");
    if (engineRaw && engineRaw.__engineError) {
      engineError = engineRaw.__engineError;
      engineRaw = null;
    }
  } catch (err) {
    engineError = err;
  }

  let shaped = shapeEngineReply(engineRaw);
  if (!shaped.lane) shaped.lane = norm.lane || "general";
  if (!shaped.laneId) shaped.laneId = shaped.lane;
  if (!shaped.sessionLane) shaped.sessionLane = shaped.lane;
  if (!shaped.bridge && marion) shaped.bridge = marion;
  shaped = applyAffectBridge(shaped, buildAffectInputFromMarion(marion));

  if (shouldEnterSupportHold(norm.text, emotion, shaped.cog || shaped.meta || {})) {
    supportActive = true;
    supportHold = Math.max(supportHold, CFG.quietSupportHoldTurns);
  }

  if (engineError) {
    failSafe = true;
    const supportReply = buildSafeSupportReply(norm.text, emotion, {
      traceId: norm.traceId,
      sessionId,
      source: "engine_error"
    });

    shaped = {
      ok: false,
      reply: supportReply,
      payload: { reply: supportReply },
      lane: norm.lane || "general",
      laneId: norm.lane || "general",
      sessionLane: norm.lane || "general",
      bridge: marion || null,
      ctx: {},
      ui: {},
      directives: [],
      followUps: [],
      followUpsStrings: [],
      sessionPatch: {},
      cog: { intent: "STABILIZE", mode: "transitional", publicMode: true },
      meta: {
        v: INDEX_VERSION,
        t: now(),
        engineVersion: "chatEngine failure contained",
        knowledge: knowledgeRuntime.extract(norm.text, { marion }),
        clearStaleUi: true,
        suppressMenus: true,
        failSafe: true,
        error: cleanText(engineError && engineError.message || engineError || "engine failure")
      }
    };
  }

  let reply = cleanText(shaped.reply || shaped.payload?.reply || "");
  if (!reply) {
    reply = buildSafeSupportReply(norm.text, emotion, {
      traceId: norm.traceId,
      sessionId,
      source: "empty_reply"
    });
    shaped.reply = reply;
    shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply };
    supportActive = true;
    supportHold = Math.max(supportHold, CFG.quietSupportHoldTurns);
  }

  reply = cleanReplyForUser(reply);
  shaped.reply = reply;
  shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply };

  const loop = detectLoop(sessionId, reply, norm.text);
  if (loop.repeated) {
    failSafe = false;
    supportActive = true;
    supportHold = Math.max(supportHold, 1);
    reply = normalizeSupportReply("I am here with you. We can take this one step at a time.");
    shaped.reply = reply;
    shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply };
    shaped.cog = {
      ...(isObj(shaped.cog) ? shaped.cog : {}),
      intent: "STABILIZE",
      mode: "transitional",
      publicMode: true
    };
    shaped.meta = mergeMeta(shaped.meta, {
      duplicateReplySuppressed: true
    });
  }

  const suppressMenus = shouldSuppressMenus(shaped, supportActive || failSafe);
  if (suppressMenus) {
    supportActive = true;
    supportHold = Math.max(supportHold, 1);
  }

  setSupportState(sessionId, {
    active: supportActive,
    hold: supportHold,
    replyHash: replyHash(reply),
    lastUserHash: replyHash(norm.text)
  });

  const sessionPatch = buildSupportSessionPatch(shaped.sessionPatch, supportActive, !supportActive);
  shaped.sessionPatch = sessionPatch;

  shaped.meta = mergeMeta(shaped.meta, {
    v: INDEX_VERSION,
    t: now(),
    knowledge: shaped.meta?.knowledge || knowledgeRuntime.extract(norm.text, { marion }),
    clearStaleUi: suppressMenus,
    suppressMenus,
    failSafe: !!failSafe,
    error: shaped.meta?.error || "",
    indexLoopGuard: true,
    supportHold,
    traceId: norm.traceId,
    latencyMs: now() - startedAt
  });

  shaped.cog = {
    ...(isObj(shaped.cog) ? shaped.cog : {}),
    intent: shaped.cog?.intent || (supportActive ? "STABILIZE" : ""),
    mode: shaped.cog?.mode || (supportActive ? "transitional" : ""),
    publicMode: shaped.cog?.publicMode !== false
  };

  shaped = attachVoiceRoute(shaped);
  const speech = buildSpeechContract(shaped, norm);
  shaped.payload = {
    ...(isObj(shaped.payload) ? shaped.payload : {}),
    text: speech.text,
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    routeKind: speech.routeKind,
    intro: speech.intro,
    source: speech.source,
    speechHints: speech.speechHints
  };
  shaped.voiceRoute = {
    ...(isObj(shaped.voiceRoute) ? shaped.voiceRoute : {}),
    text: speech.text,
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    routeKind: speech.routeKind,
    intro: speech.intro,
    source: speech.source,
    speechHints: speech.speechHints
  };
  shaped = enforceQuietUiIfNeeded(shaped, {
    supportActive,
    failSafe,
    forceQuiet: suppressMenus
  });

  shaped.voiceRoute = normalizeVoiceRouteResponse(shaped.voiceRoute);
  shaped.requestId = cleanText(shaped.requestId || makeTraceId("req"));
  shaped.traceId = cleanText(shaped.traceId || norm.traceId);

  setLastTurn(sessionId, {
    replyHash: replyHash(reply),
    userHash: replyHash(norm.text),
    lane: shaped.lane || norm.lane
  });

  return res.status(200).json({
    ok: shaped.ok !== false,
    reply: shaped.reply,
    payload: shaped.payload,
    lane: shaped.lane || norm.lane || "general",
    laneId: shaped.laneId || shaped.lane || norm.lane || "general",
    sessionLane: shaped.sessionLane || shaped.lane || norm.lane || "general",
    bridge: shaped.bridge || marion || null,
    ctx: shaped.ctx || {},
    ui: shaped.ui || {},
    directives: Array.isArray(shaped.directives) ? shaped.directives : [],
    followUps: Array.isArray(shaped.followUps) ? shaped.followUps : [],
    followUpsStrings: Array.isArray(shaped.followUpsStrings) ? shaped.followUpsStrings : [],
    sessionPatch: shaped.sessionPatch || {},
    cog: shaped.cog || {},
    requestId: shaped.requestId,
    traceId: shaped.traceId,
    meta: {
      ...(shaped.meta || {}),
      audioContract: {
        version: "audio-first-v1",
        endpoint: routeUrl("/api/tts"),
        healthEndpoint: routeUrl("/api/tts/health"),
        deterministicAudio: true,
        failOpenChat: true
      }
    },
    speech,
    audio: shaped.audio || undefined,
    ttsProfile: shaped.ttsProfile || undefined,
    voiceRoute: shaped.voiceRoute || undefined
  });
});

if (newsCanadaRouter) {
  app.use("/api/newscanada", newsCanadaRouter);
  app.use("/newscanada", newsCanadaRouter);
  console.log("[Sandblast][newsCanada] mounted", {
    api: "/api/newscanada",
    direct: "/newscanada"
  });
  bootstrapNewsCanadaFeed();
} else {
  console.log("[Sandblast][newsCanada] router_missing");
}

app.use("/api", (req, res) => {
  applyCors(req, res);
  return res.status(404).json({
    ok: false,
    error: "not_found",
    path: req.path,
    meta: { v: INDEX_VERSION, t: now() }
  });
});

app.use((err, req, res, _next) => {
  console.log("[Sandblast][express:error]", err && (err.stack || err.message || err));
  applyCors(req, res);
  return res.status(500).json({
    ok: false,
    error: "server_error",
    detail: cleanText(err && (err.message || err) || "server error"),
    meta: { v: INDEX_VERSION, t: now() }
  });
});

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

app.get("*", (req, res, next) => {
  const p = path.join(PUBLIC_DIR, "index.html");
  if (fs.existsSync(p)) return res.sendFile(p);
  return next();
});

const server = app.listen(PORT, () => {
  console.log(`[Sandblast] ${INDEX_VERSION} listening on :${PORT}`);
});

module.exports = { app, server, INDEX_VERSION, loadNewsCanadaEditorsPicksFromDisk, resolveNewsCanadaDataFile };
