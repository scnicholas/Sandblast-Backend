"use strict";

/**
 * Routes/voiceRoute.js
 *
 * voiceRoute v1.1.0 TTS-COMPAT-HARDEN
 * ------------------------------------------------------------
 * PURPOSE
 * - Resolve TTS delegate compatibility across multiple export shapes
 * - Preserve backend contract integrity for audio and JSON clients
 * - Keep downgrade behavior centralized and loop-safe
 * - Expose health/status helpers for index.js compatibility
 */

const ttsMod = require("./tts");
let chatEngine = null;
try { chatEngine = require("./chatEngine"); } catch (_e) { chatEngine = null; }

const VOICE_ROUTE_VERSION = "voiceRoute v1.2.0 PLAYBACK-CONTRACT-HARDEN";
const MAX_RETRY_ATTEMPTS = Math.max(0, Number(process.env.SB_VOICE_ROUTE_MAX_RETRY || 1));

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}
function boolish(v, dflt = false) {
  if (v === true || v === false) return v;
  const s = safeStr(v).trim().toLowerCase();
  if (!s) return dflt;
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return dflt;
}
function pickFirst() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== undefined && v !== null && String(v) !== "") return v;
  }
  return "";
}
function setHeaderSafe(res, key, value) {
  try { if (res && !res.headersSent) res.setHeader(key, value); } catch (_e) {}
}
function wantsJson(req) {
  const q = req && req.query && typeof req.query === "object" ? req.query : {};
  const b = req && req.body && typeof req.body === "object" ? req.body : {};
  return boolish(pickFirst(q.returnJson, b.returnJson, q.json, b.json), false);
}

function clientWantsJson(req) {
  if (wantsJson(req)) return true;
  const headers = req && req.headers && typeof req.headers === "object" ? req.headers : {};
  const accept = safeStr(headers.accept || "").toLowerCase();
  const requestedWith = safeStr(headers["x-requested-with"] || "").toLowerCase();
  const secFetchDest = safeStr(headers["sec-fetch-dest"] || "").toLowerCase();
  const contentType = safeStr(headers["content-type"] || "").toLowerCase();
  if (accept.includes("application/json") || accept.includes("text/json")) return true;
  if (requestedWith === "xmlhttprequest") return true;
  if (secFetchDest === "empty") return true;
  if (contentType.includes("application/json")) return true;
  return false;
}
function hasAnyValue(v) {
  return !(v === undefined || v === null || v === "");
}
function extractAudioUrl(result) {
  return safeStr(pickFirst(
    result && result.audioUrl,
    result && result.url,
    result && result.audio_url,
    result && result.publicUrl,
    result && result.signedUrl,
    result && result.streamUrl,
    result && result.audio && result.audio.url,
    result && result.audio && result.audio.audioUrl,
    result && result.payload && result.payload.audioUrl,
    result && result.payload && result.payload.url
  ));
}
function extractMime(result) {
  return safeStr(pickFirst(
    result && result.mime,
    result && result.mimeType,
    result && result.contentType,
    result && result.audio && result.audio.mime,
    result && result.audio && result.audio.mimeType,
    "audio/mpeg"
  )) || "audio/mpeg";
}
function extractFormat(result, mime) {
  const format = safeStr(pickFirst(
    result && result.format,
    result && result.audio && result.audio.format
  )).toLowerCase();
  if (format) return format;
  const m = safeStr(mime).toLowerCase();
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("webm")) return "webm";
  return "mp3";
}
function extractAudioBase64(result) {
  const direct = pickFirst(
    result && result.audioBase64,
    result && result.base64,
    result && result.audio && result.audio.base64,
    result && result.audio && result.audio.audioBase64,
    result && result.payload && result.payload.audioBase64
  );
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  if (result && Buffer.isBuffer(result.audio)) return result.audio.toString("base64");
  if (result && Buffer.isBuffer(result.buffer)) return result.buffer.toString("base64");
  if (result && Buffer.isBuffer(result.data)) return result.data.toString("base64");
  return "";
}
function buildPlayableAudioEnvelope(input, result) {
  const mimeType = extractMime(result);
  const format = extractFormat(result, mimeType);
  const audioUrl = extractAudioUrl(result);
  const audioBase64 = extractAudioBase64(result);
  const text = safeStr(pickFirst(result && result.text, result && result.textSpeak, input.textDisplay, input.text));
  const playable = !!(audioUrl || audioBase64 || (result && Buffer.isBuffer(result.audio)));
  return {
    ok: !!(result && result.ok),
    version: VOICE_ROUTE_VERSION,
    requestId: safeStr(pickFirst(result && result.requestId, input.requestId)),
    turnId: safeStr(pickFirst(result && result.turnId, input.turnId)),
    sessionId: safeStr(pickFirst(result && result.sessionId, input.sessionId)),
    provider: safeStr(pickFirst(result && result.provider, input.provider, "resemble")) || "resemble",
    providerStatus: clampInt(pickFirst(result && result.providerStatus, result && result.status, 200), 200, 0, 999999),
    routeKind: safeStr(pickFirst(result && result.routeKind, input.routeKind, "main")) || "main",
    mimeType,
    mime: mimeType,
    format,
    text,
    textSpeak: text,
    spokenText: text,
    audioUrl,
    url: audioUrl,
    audioBase64,
    chars: clampInt(text.length, 0, 0, 999999),
    playable,
    autoPlay: true,
    audio: {
      url: audioUrl,
      audioUrl,
      audioBase64,
      mimeType,
      mime: mimeType,
      format,
      playable,
      autoPlay: true,
      chars: clampInt(text.length, 0, 0, 999999)
    },
    playback: {
      ready: playable,
      autoPlay: true,
      route: "/api/tts",
      compatibilityRoute: "/tts",
      mimeType,
      format
    }
  };
}
function normalizeInput(req) {
  const body = req && req.body && typeof req.body === "object" ? req.body : {};
  const query = req && req.query && typeof req.query === "object" ? req.query : {};
  const headers = req && req.headers && typeof req.headers === "object" ? req.headers : {};
  return {
    text: safeStr(pickFirst(body.text, body.message, body.prompt, query.text, query.message, query.prompt)),
    textDisplay: safeStr(pickFirst(body.textDisplay, query.textDisplay)),
    requestId: safeStr(pickFirst(body.requestId, query.requestId, headers["x-sb-request-id"])).slice(0, 80),
    turnId: safeStr(pickFirst(body.turnId, query.turnId, headers["x-sb-turn-id"])).slice(0, 80),
    sessionId: safeStr(pickFirst(body.sessionId, body.sid, query.sessionId, query.sid, headers["x-sb-session-id"])).slice(0, 120),
    provider: safeStr(pickFirst(body.provider, query.provider, "resemble")),
    routeKind: safeStr(pickFirst(body.routeKind, query.routeKind, body.mode, query.mode, "main")),
    voiceUuid: safeStr(pickFirst(body.voiceUuid, body.voice_uuid, query.voiceUuid, query.voice_uuid, headers["x-sb-voice"])),
    title: safeStr(pickFirst(body.title, query.title, "voice_route")),
    wantJson: clientWantsJson(req)
  };
}

function resolveTtsDelegate(mod) {
  if (!mod) return null;
  if (typeof mod.delegateTts === "function") return mod.delegateTts.bind(mod);
  if (typeof mod.handleTts === "function") return mod.handleTts.bind(mod);
  if (typeof mod.tts === "function") return mod.tts.bind(mod);
  if (typeof mod.handle === "function") return mod.handle.bind(mod);
  if (typeof mod.handler === "function") return mod.handler.bind(mod);
  if (typeof mod.ttsHandler === "function") return mod.ttsHandler.bind(mod);
  if (typeof mod.synthesize === "function") return mod.synthesize.bind(mod);
  if (typeof mod.generateSpeech === "function") return mod.generateSpeech.bind(mod);
  if (typeof mod.generate === "function") return mod.generate.bind(mod);
  if (typeof mod.speak === "function") return mod.speak.bind(mod);
  if (typeof mod.run === "function") return mod.run.bind(mod);
  if (typeof mod.default === "function") return mod.default.bind(mod);
  if (typeof mod === "function") return mod;
  return null;
}

function resolveTtsHealth(mod) {
  if (!mod) return null;
  if (typeof mod.health === "function") return mod.health.bind(mod);
  if (typeof mod.getHealth === "function") return mod.getHealth.bind(mod);
  if (typeof mod.status === "function") return mod.status.bind(mod);
  return null;
}

const delegateTts = resolveTtsDelegate(ttsMod);
const ttsHealth = resolveTtsHealth(ttsMod);

function classifyFailure(result, attempt) {
  const status = clampInt(result && (result.providerStatus || result.status), 0, 0, 999999);
  const retryable = !!(result && result.retryable);
  const reason = safeStr(result && (result.reason || "tts_unavailable")).toLowerCase();

  if (reason === "missing_text") return { action: "stop", terminal: true, retryable: false, reason };
  if (reason === "missing_voice") return { action: "stop", terminal: true, retryable: false, reason };
  if (reason === "private_network_url_blocked") return { action: "stop", terminal: true, retryable: false, reason };

  if (retryable && attempt < MAX_RETRY_ATTEMPTS && (status === 429 || status === 503 || status === 504 || /timeout|network|circuit|concurrency/.test(reason))) {
    return { action: "retry", terminal: false, retryable: true, reason };
  }
  if (retryable && (status >= 500 || status === 429 || /timeout|network|circuit|concurrency/.test(reason))) {
    return { action: "downgrade", terminal: false, retryable: true, reason };
  }
  if (!retryable && status >= 400 && status < 500) {
    return { action: "stop", terminal: true, retryable: false, reason };
  }
  return { action: "downgrade", terminal: false, retryable: retryable, reason };
}

function buildFailureEnvelope(input, result, decision) {
  return {
    ok: false,
    version: VOICE_ROUTE_VERSION,
    provider: safeStr((result && result.provider) || input.provider || "resemble"),
    action: safeStr((decision && decision.action) || "downgrade"),
    terminal: !!(decision && decision.terminal),
    retryable: !!(decision && decision.retryable),
    reason: safeStr((decision && decision.reason) || (result && result.reason) || "tts_unavailable"),
    message: safeStr((result && result.message) || "TTS unavailable."),
    providerStatus: clampInt(result && (result.providerStatus || result.status), 0, 0, 999999),
    requestId: safeStr((result && result.requestId) || input.requestId || ""),
    turnId: safeStr((result && result.turnId) || input.turnId || ""),
    sessionId: safeStr((result && result.sessionId) || input.sessionId || ""),
    traceId: safeStr((result && result.traceId) || ""),
    text: safeStr((result && result.text) || input.textDisplay || input.text || ""),
    ttsFailure: {
      ok: false,
      action: safeStr((decision && decision.action) || "downgrade"),
      shouldTerminate: !!(decision && decision.terminal),
      retryable: !!(decision && decision.retryable),
      reason: safeStr((decision && decision.reason) || (result && result.reason) || "tts_unavailable"),
      message: safeStr((result && result.message) || "TTS unavailable."),
      providerStatus: clampInt(result && (result.providerStatus || result.status), 0, 0, 999999)
    }
  };
}

async function maybeBuildDowngradedText(input, envelope) {
  if (!chatEngine || typeof chatEngine.handleChat !== "function" || !input.text) {
    return {
      ok: true,
      degraded: true,
      reply: envelope.text || input.text || "Audio is unavailable right now.",
      payload: { reply: envelope.text || input.text || "Audio is unavailable right now." },
      directives: [{ type: "tts_failure", ...envelope.ttsFailure }]
    };
  }
  try {
    return await chatEngine.handleChat({
      text: input.text,
      payload: { ttsFailure: envelope.ttsFailure },
      ctx: { requestId: input.requestId, turnId: input.turnId, sessionId: input.sessionId }
    });
  } catch (_e) {
    return {
      ok: true,
      degraded: true,
      reply: envelope.text || input.text || "Audio is unavailable right now.",
      payload: { reply: envelope.text || input.text || "Audio is unavailable right now." },
      directives: [{ type: "tts_failure", ...envelope.ttsFailure }]
    };
  }
}

async function callDelegate(req, attempt) {
  const payload = { ...(req && req.body && typeof req.body === "object" ? req.body : {}) };
  payload.requestId = pickFirst(payload.requestId, req && req.query && req.query.requestId, req && req.headers && req.headers["x-sb-request-id"]);
  payload.turnId = pickFirst(payload.turnId, req && req.query && req.query.turnId, req && req.headers && req.headers["x-sb-turn-id"]);
  payload.sessionId = pickFirst(payload.sessionId, payload.sid, req && req.query && req.query.sessionId, req && req.query && req.query.sid, req && req.headers && req.headers["x-sb-session-id"]);
  payload.__voiceRouteAttempt = attempt;

  if (!delegateTts) {
    return {
      ok: false,
      retryable: false,
      reason: "tts_delegate_unavailable",
      message: "Resolved TTS delegate is unavailable",
      providerStatus: 503,
      requestId: safeStr(payload.requestId || ""),
      turnId: safeStr(payload.turnId || ""),
      sessionId: safeStr(payload.sessionId || "")
    };
  }

  return delegateTts(payload, req);
}

async function health() {
  try {
    const info = ttsHealth ? await Promise.resolve(ttsHealth()) : null;
    return {
      ok: !!delegateTts,
      enabled: !!delegateTts,
      version: VOICE_ROUTE_VERSION,
      ttsDelegateBound: !!delegateTts,
      ttsHealthBound: !!ttsHealth,
      tts: info && typeof info === "object" ? info : null
    };
  } catch (err) {
    return {
      ok: false,
      enabled: !!delegateTts,
      version: VOICE_ROUTE_VERSION,
      ttsDelegateBound: !!delegateTts,
      ttsHealthBound: !!ttsHealth,
      error: safeStr(err && (err.message || err) || "tts_health_failed")
    };
  }
}

async function voiceRoute(req, res) {
  const input = normalizeInput(req);
  setHeaderSafe(res, "X-SB-Voice-Route-Version", VOICE_ROUTE_VERSION);

  let attempt = 0;
  let result = null;
  let decision = null;

  while (attempt <= MAX_RETRY_ATTEMPTS) {
    result = await callDelegate(req, attempt);
    if (result && result.ok) break;
    decision = classifyFailure(result || {}, attempt);
    if (decision.action !== "retry") break;
    attempt += 1;
  }

  if (result && result.ok) {
    const playable = buildPlayableAudioEnvelope(input, result);
    setHeaderSafe(res, "X-SB-TTS-Action", "success");
    setHeaderSafe(res, "X-SB-TTS-Provider", safeStr(playable.provider || "resemble"));
    setHeaderSafe(res, "X-SB-TTS-Upstream-Status", String(clampInt(playable.providerStatus || 200, 200, 0, 999999)));
    setHeaderSafe(res, "X-SB-TTS-Playable", playable.playable ? "1" : "0");

    if (input.wantJson || playable.audioUrl || playable.audioBase64 || !Buffer.isBuffer(result.audio)) {
      return res.status(200).json(playable);
    }

    setHeaderSafe(res, "Content-Type", safeStr(playable.mimeType || "audio/mpeg"));
    return res.status(200).send(result.audio);
  }

  decision = decision || classifyFailure(result || {}, attempt);
  const envelope = buildFailureEnvelope(input, result || {}, decision);

  setHeaderSafe(res, "X-SB-TTS-Action", safeStr(envelope.action));
  setHeaderSafe(res, "X-SB-TTS-Reason", safeStr(envelope.reason));
  setHeaderSafe(res, "X-SB-TTS-Upstream-Status", String(clampInt(envelope.providerStatus, 0, 0, 999999)));

  if (envelope.action === "stop") {
    const status = envelope.providerStatus === 0 ? 409 : Math.max(400, Math.min(409, envelope.providerStatus));
    return res.status(status).json(envelope);
  }

  const downgraded = await maybeBuildDowngradedText(input, envelope);
  return res.status(200).json({
    ok: true,
    degraded: true,
    version: VOICE_ROUTE_VERSION,
    action: envelope.action,
    terminal: envelope.terminal,
    ttsFailure: envelope.ttsFailure,
    reply: safeStr((downgraded || {}).reply || envelope.text || input.text || "Audio unavailable."),
    payload: (downgraded || {}).payload || { reply: safeStr((downgraded || {}).reply || envelope.text || input.text || "Audio unavailable.") },
    directives: (downgraded || {}).directives || [Object.assign({ type: "tts_failure" }, envelope.ttsFailure)],
    audio: {
      url: "",
      audioUrl: "",
      audioBase64: "",
      mimeType: "audio/mpeg",
      mime: "audio/mpeg",
      format: "mp3",
      playable: false,
      autoPlay: false,
      chars: 0
    },
    playback: {
      ready: false,
      autoPlay: false,
      route: "/api/tts",
      compatibilityRoute: "/tts",
      mimeType: "audio/mpeg",
      format: "mp3"
    }
  });
}

module.exports = voiceRoute;
module.exports.voiceRoute = voiceRoute;
module.exports.route = voiceRoute;
module.exports.run = voiceRoute;
module.exports.speak = voiceRoute;
module.exports.default = voiceRoute;
module.exports.health = health;
module.exports.getHealth = health;
module.exports.status = health;
module.exports.resolveTtsDelegate = resolveTtsDelegate;
module.exports.resolveTtsHealth = resolveTtsHealth;
module.exports.VOICE_ROUTE_VERSION = VOICE_ROUTE_VERSION;
