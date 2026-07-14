"use strict";

/**
 * Routes/voiceRoute.js
 *
 * Nyx guide-shell voice bridge. TTS remains the synthesis authority.
 * This route normalizes public guide context, preserves binary audio integrity,
 * and never exposes the configured voice identifier.
 */

const VOICE_ROUTE_VERSION = "voiceRoute v1.9.0 GUIDE-CONTEXT-ACTIONS + BINARY-INTEGRITY + CROSS-PROPERTY-CONTINUITY + TELEVISION-SAFE-VOICE";
const MAX_RETRY_ATTEMPTS = Math.max(0, Math.min(1, Number(process.env.SB_VOICE_ROUTE_MAX_RETRY || 0)));
const DEFAULT_PROVIDER = String(process.env.SB_TTS_PROVIDER || "resemble").trim() || "resemble";
const DEFAULT_VOICE_UUID = String(
  process.env.RESEMBLE_VOICE_UUID ||
  process.env.RESEMBLE_VOICE_ID ||
  process.env.SB_RESEMBLE_VOICE_UUID ||
  process.env.SB_RESEMBLE_VOICE_ID ||
  process.env.SB_TTS_VOICE_UUID ||
  ""
).trim();
const ALLOW_CLIENT_VOICE_OVERRIDE = /^(1|true|yes|on)$/i.test(String(process.env.SB_TTS_ALLOW_CLIENT_VOICE_OVERRIDE || ""));
const GUIDE_STATES = new Set(["available", "listening", "thinking", "speaking", "guiding", "quiet", "recovery", "minimized"]);
const GUIDE_LANES = new Set(["home", "search", "live", "watch", "roku", "news", "about", "apps"]);
const MAX_AUDIO_BYTES = Math.max(256 * 1024, Math.min(100 * 1024 * 1024, Number(process.env.SB_TTS_MAX_AUDIO_BYTES || 25 * 1024 * 1024)));

function safeStr(value) {
  return value == null ? "" : String(value);
}

function cleanText(value, max = 2000) {
  return safeStr(value).replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function boolish(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value, 16).toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(text)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(text)) return false;
  return fallback;
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function pickFirst() {
  for (const value of arguments) {
    if (value !== undefined && value !== null && String(value) !== "") return value;
  }
  return "";
}

function setHeaderSafe(res, key, value) {
  try {
    if (res && !res.headersSent && value !== undefined && value !== null) res.setHeader(key, value);
  } catch (_) {}
}

function tryRequireVoiceDependency(candidates) {
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate);
      const mod = require(resolved);
      if (mod) return { mod, path: candidate, resolvedPath: resolved, error: "" };
    } catch (err) {
      lastError = err;
    }
  }
  return {
    mod: null,
    path: "",
    resolvedPath: "",
    error: cleanText(lastError && (lastError.message || lastError), 300)
  };
}

const ttsLoad = tryRequireVoiceDependency([
  "../Utils/tts.js", "../Utils/tts", "../utils/tts.js", "../utils/tts",
  "./tts.js", "./tts", "../tts.js", "../tts",
  "../Routes/tts.js", "../Routes/tts", "../routes/tts.js", "../routes/tts"
]);
const ttsMod = ttsLoad.mod;
const ttsLoadError = ttsLoad.error;

function normalizeGuideState(value) {
  const state = cleanText(value || "available", 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  return GUIDE_STATES.has(state) ? state : "available";
}

function normalizeGuideLane(value) {
  const raw = cleanText(value || "home", 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
  const aliases = { radio: "live", listen: "live", tv: "watch", television: "watch", cartoon: "watch", cartoons: "watch", classic: "watch", classics: "watch", synapse: "news", discover: "news", guide: "search", nyx: "search", app: "apps" };
  const lane = aliases[raw] || raw;
  return GUIDE_LANES.has(lane) ? lane : "home";
}

function normalizeGuideContext(value, inputMode) {
  const src = safeObj(value);
  return {
    contract: "nyx.guideShell/1.0",
    surface: cleanText(src.surface || src.site || "sandblast.channel", 96),
    page: cleanText(src.page || src.pathname || "/", 160),
    currentLane: normalizeGuideLane(src.currentLane || src.lane),
    previousLane: normalizeGuideLane(src.previousLane || "home"),
    goal: cleanText(src.goal || "ask", 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "_") || "ask",
    guideState: normalizeGuideState(src.guideState || src.state),
    panelOpen: boolish(src.panelOpen, false),
    voiceEnabled: boolish(src.voiceEnabled, true),
    reducedMotion: boolish(src.reducedMotion, false),
    suggestionsEnabled: boolish(src.suggestionsEnabled, true),
    mediaState: {
      radioPlaying: boolish(safeObj(src.mediaState || src.media).radioPlaying, false),
      videoPlaying: boolish(safeObj(src.mediaState || src.media).videoPlaying, false)
    },
    inputMode: inputMode === "voice" ? "voice" : "text",
    publicSessionOnly: true,
    privateMemoryAccess: false
  };
}

const GUIDE_ACTION_TYPES = new Set(["navigate", "play_radio", "stop_radio", "open_media", "open_tv", "open_roku", "open_synapse", "open_guide", "focus_input", "summarize"]);

function normalizeGuideActions(value) {
  const list = Array.isArray(value) ? value : [];
  const out = [];
  for (const item of list) {
    const src = safeObj(item);
    const type = cleanText(src.type || src.action, 32).toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    if (!GUIDE_ACTION_TYPES.has(type)) continue;
    const target = normalizeGuideLane(src.target || src.lane || "home");
    const action = {
      contract: "nyx.guideAction/1.0",
      id: cleanText(src.id || `${type}_${target}`, 64),
      type,
      target,
      lane: target,
      label: cleanText(src.label || type.replace(/_/g, " "), 80),
      requiresUserGesture: true,
      autoExecute: false,
      advisoryOnly: true
    };
    if (!out.some((entry) => entry.type === action.type && entry.target === action.target)) out.push(action);
    if (out.length >= 4) break;
  }
  return out;
}

function wantsJson(req) {
  const query = safeObj(req && req.query);
  const body = safeObj(req && req.body);
  if (boolish(pickFirst(query.returnJson, body.returnJson, query.json, body.json), false)) return true;
  const headers = safeObj(req && req.headers);
  const accept = safeStr(headers.accept).toLowerCase();
  const mode = safeStr(headers["x-sb-response-mode"] || headers["x-response-mode"] || headers["x-tts-mode"]).toLowerCase();
  if (["audio", "binary", "stream", "audio-first"].includes(mode)) return false;
  if (["json", "json-audio", "audio-json", "base64-audio"].includes(mode)) return true;
  if (!accept || accept.includes("audio/") || accept.includes("application/octet-stream") || accept.includes("*/*")) return false;
  return accept.includes("application/json") || accept.includes("text/json");
}

function detectAudio(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.length > MAX_AUDIO_BYTES) return null;
  if (buffer.length >= 12 && buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WAVE") {
    return { mimeType: "audio/wav", format: "wav", signature: "RIFF/WAVE" };
  }
  if (buffer.slice(0, 3).toString("ascii") === "ID3") {
    return { mimeType: "audio/mpeg", format: "mp3", signature: "ID3" };
  }
  for (let i = 0; i < Math.min(buffer.length - 1, 64); i += 1) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
      return { mimeType: "audio/mpeg", format: "mp3", signature: "MPEG-FRAME" };
    }
  }
  if (buffer.slice(0, 4).toString("ascii") === "OggS") {
    return { mimeType: "audio/ogg", format: "ogg", signature: "OGGS" };
  }
  if (buffer.slice(0, 4).toString("ascii") === "fLaC") {
    return { mimeType: "audio/flac", format: "flac", signature: "FLAC" };
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mimeType: "audio/webm", format: "webm", signature: "WEBM" };
  }
  if (buffer.length >= 12 && buffer.slice(4, 8).toString("ascii") === "ftyp") {
    return { mimeType: "audio/mp4", format: "mp4", signature: "MP4" };
  }
  return null;
}

function extractAudioUrl(result) {
  return cleanText(pickFirst(
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
  ), 1200);
}

function base64Candidate(value) {
  if (typeof value !== "string") return null;
  const raw = value.replace(/^data:audio\/[^;]+;base64,/i, "").replace(/\s+/g, "");
  if (raw.length < 64 || raw.length > Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
  try {
    const buffer = Buffer.from(raw, "base64");
    return detectAudio(buffer) ? buffer : null;
  } catch (_) {
    return null;
  }
}

function extractAudioBuffer(result) {
  const candidates = [
    result && result.buffer,
    result && result.audioBuffer,
    result && result.binary,
    result && result.body,
    result && result.data,
    result && result.audio_content,
    result && result.audio,
    result && result.payload && result.payload.buffer,
    result && result.payload && result.payload.audioBuffer,
    result && result.payload && result.payload.binary,
    result && result.payload && result.payload.audio_content,
    result && result.payload && result.payload.audio
  ];
  for (const candidate of candidates) {
    let buffer = null;
    if (Buffer.isBuffer(candidate)) buffer = candidate;
    else if (candidate instanceof Uint8Array) buffer = Buffer.from(candidate);
    else if (candidate && candidate.type === "Buffer" && Array.isArray(candidate.data)) {
      try { buffer = Buffer.from(candidate.data); } catch (_) {}
    } else buffer = base64Candidate(candidate);
    if (buffer && detectAudio(buffer)) return buffer;
  }
  return null;
}

function extractAudioBase64(result) {
  const direct = pickFirst(
    result && result.audioBase64,
    result && result.base64,
    result && result.audio_content,
    result && result.audio && result.audio.base64,
    result && result.audio && result.audio.audioBase64,
    result && result.audio && result.audio.audio_content,
    result && result.payload && result.payload.audioBase64,
    result && result.payload && result.payload.base64,
    result && result.payload && result.payload.audio_content
  );
  const buffer = base64Candidate(direct) || extractAudioBuffer(result);
  return buffer && buffer.length ? buffer.toString("base64") : "";
}

function normalizeInput(req) {
  const body = safeObj(req && req.body);
  const query = safeObj(req && req.query);
  const headers = safeObj(req && req.headers);
  const inputSource = cleanText(pickFirst(body.inputSource, query.inputSource, headers["x-sb-input-source"], "text"), 24).toLowerCase();
  const guideSource = safeObj(body.guideContext || query.guideContext);
  const guideContextSource = Object.keys(guideSource).length ? guideSource : {
    surface: pickFirst(body.surface, query.surface, headers["x-sb-guide-surface"], "sandblast.channel"),
    page: pickFirst(body.page, query.page, headers["x-sb-guide-page"], "/"),
    currentLane: pickFirst(body.currentLane, body.lane, query.currentLane, query.lane, headers["x-sb-guide-lane"], "home"),
    previousLane: pickFirst(body.previousLane, query.previousLane, headers["x-sb-guide-previous-lane"], "home"),
    guideState: pickFirst(body.guideState, query.guideState, headers["x-sb-guide-state"], "available"),
    panelOpen: pickFirst(body.panelOpen, query.panelOpen, headers["x-sb-guide-panel-open"], false),
    voiceEnabled: pickFirst(body.voiceEnabled, query.voiceEnabled, headers["x-sb-guide-voice-enabled"], true),
    reducedMotion: pickFirst(body.reducedMotion, query.reducedMotion, headers["x-sb-guide-reduced-motion"], false),
    suggestionsEnabled: pickFirst(body.suggestionsEnabled, query.suggestionsEnabled, true),
    goal: pickFirst(body.goal, query.goal, headers["x-sb-guide-goal"], "ask"),
    mediaState: {
      radioPlaying: pickFirst(body.radioPlaying, query.radioPlaying, headers["x-sb-radio-playing"], false),
      videoPlaying: pickFirst(body.videoPlaying, query.videoPlaying, headers["x-sb-video-playing"], false)
    }
  };
  const requestedVoice = cleanText(pickFirst(body.voiceUuid, body.voice_uuid, query.voiceUuid, query.voice_uuid, headers["x-sb-voice"]), 128);
  const voiceUuid = ALLOW_CLIENT_VOICE_OVERRIDE && requestedVoice ? requestedVoice : DEFAULT_VOICE_UUID;

  return {
    text: cleanText(pickFirst(body.text, body.spokenText, body.textSpeak, body.message, body.prompt, query.text, query.spokenText, query.message, query.prompt), 5000),
    textDisplay: cleanText(pickFirst(body.textDisplay, body.displayText, query.textDisplay, query.displayText), 5000),
    requestId: cleanText(pickFirst(body.requestId, query.requestId, headers["x-sb-request-id"]), 80),
    turnId: cleanText(pickFirst(body.turnId, query.turnId, headers["x-sb-turn-id"]), 80),
    traceId: cleanText(pickFirst(body.traceId, query.traceId, headers["x-sb-trace-id"], headers["x-request-id"]), 96),
    sessionId: cleanText(pickFirst(body.sessionId, body.sid, query.sessionId, query.sid, headers["x-sb-session-id"]), 120),
    provider: cleanText(pickFirst(body.provider, query.provider, DEFAULT_PROVIDER), 32) || DEFAULT_PROVIDER,
    routeKind: cleanText(pickFirst(body.routeKind, query.routeKind, body.mode, query.mode, "guide_shell"), 32) || "guide_shell",
    voiceUuid,
    title: cleanText(pickFirst(body.title, query.title, "nyx_guide_voice"), 120),
    inputSource,
    guideContext: normalizeGuideContext(guideContextSource, inputSource),
    guideActions: normalizeGuideActions(body.guideActions || body.actions || []),
    wantJson: wantsJson(req)
  };
}

function createCaptureResponse() {
  let statusCode = 200;
  let body = null;
  const headers = {};
  const api = {
    headersSent: false,
    writableEnded: false,
    status(code) { statusCode = clampInt(code, 200, 100, 599); return api; },
    setHeader(key, value) { headers[String(key).toLowerCase()] = value; return api; },
    getHeader(key) { return headers[String(key).toLowerCase()]; },
    set(key, value) { return api.setHeader(key, value); },
    type(value) { return api.setHeader("content-type", value); },
    json(value) { api.headersSent = true; api.writableEnded = true; body = value; return api; },
    send(value) { api.headersSent = true; api.writableEnded = true; body = value; return api; },
    end(value) { api.headersSent = true; api.writableEnded = true; body = value; return api; },
    write(value) {
      const chunk = Buffer.from(value || "");
      body = Buffer.isBuffer(body) ? Buffer.concat([body, chunk]) : chunk;
      return true;
    },
    snapshot() { return { statusCode, headers, body }; }
  };
  return api;
}

function routeWrapper(fn) {
  return async function delegate(payload, originalReq) {
    const req = {
      ...(originalReq || {}),
      body: payload,
      query: safeObj(originalReq && originalReq.query),
      headers: safeObj(originalReq && originalReq.headers)
    };
    const res = createCaptureResponse();
    const returned = await Promise.resolve(fn(req, res, () => {}));
    if (returned !== undefined && returned !== res) return returned;
    const snapshot = res.snapshot();
    const packet = snapshot.body && typeof snapshot.body === "object" && !Buffer.isBuffer(snapshot.body)
      ? { ...snapshot.body }
      : {};
    if (Buffer.isBuffer(snapshot.body) || snapshot.body instanceof Uint8Array) packet.buffer = Buffer.from(snapshot.body);
    packet.ok = snapshot.statusCode >= 200 && snapshot.statusCode < 300 && (packet.ok !== false);
    packet.status = snapshot.statusCode;
    packet.providerStatus = Number(packet.providerStatus || snapshot.statusCode);
    packet.headers = snapshot.headers;
    return packet;
  };
}

function resolveTtsDelegate(mod) {
  if (!mod) return null;
  const direct = ["delegateTts", "synthesize", "generateSpeech", "generate", "speak", "run", "tts"];
  for (const name of direct) if (typeof mod[name] === "function") return mod[name].bind(mod);
  const routeNames = ["handleTts", "ttsHandler", "handle", "handler"];
  for (const name of routeNames) if (typeof mod[name] === "function") return routeWrapper(mod[name].bind(mod));
  if (typeof mod.default === "function") return routeWrapper(mod.default.bind(mod));
  if (typeof mod === "function") return routeWrapper(mod);
  return null;
}

function resolveTtsHealth(mod) {
  if (!mod) return null;
  for (const name of ["health", "getHealth", "status"]) {
    if (typeof mod[name] === "function") return mod[name].bind(mod);
  }
  return null;
}

const delegateTts = resolveTtsDelegate(ttsMod);
const ttsHealth = resolveTtsHealth(ttsMod);

function normalizeDelegateResult(value, input) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { ok: true, buffer: Buffer.from(value), provider: input.provider, text: input.text };
  }
  if (typeof value === "string") {
    if (/^https:\/\//i.test(value.trim())) return { ok: true, audioUrl: value.trim(), provider: input.provider, text: input.text };
    const buffer = base64Candidate(value);
    if (buffer) return { ok: true, buffer, provider: input.provider, text: input.text };
  }
  if (value && typeof value === "object") {
    const out = { ...value };
    if (out.ok === undefined) out.ok = !!(extractAudioBuffer(out) || extractAudioUrl(out));
    return out;
  }
  return {
    ok: false,
    retryable: false,
    reason: "tts_delegate_empty_result",
    message: "TTS delegate returned no result.",
    providerStatus: 502
  };
}

async function callDelegate(req, input, attempt) {
  if (!input.text) {
    return {
      ok: false,
      retryable: false,
      reason: "missing_text",
      message: "Text is required for speech synthesis.",
      providerStatus: 400
    };
  }
  if (!delegateTts) {
    return {
      ok: false,
      retryable: false,
      reason: "tts_delegate_unavailable",
      message: ttsLoadError || "Resolved TTS delegate is unavailable.",
      providerStatus: 503
    };
  }

  const body = safeObj(req && req.body);
  const payload = {
    ...body,
    text: input.text,
    textDisplay: input.textDisplay || input.text,
    requestId: input.requestId,
    turnId: input.turnId,
    traceId: input.traceId,
    sessionId: input.sessionId,
    provider: input.provider,
    routeKind: input.routeKind,
    title: input.title,
    inputSource: input.inputSource,
    guideContext: input.guideContext,
    guideActions: input.guideActions,
    __voiceRouteAttempt: attempt
  };
  if (input.voiceUuid) {
    payload.voiceUuid = input.voiceUuid;
    payload.voice_uuid = input.voiceUuid;
  }

  try {
    return normalizeDelegateResult(await Promise.resolve(delegateTts(payload, req)), input);
  } catch (err) {
    const message = cleanText(err && (err.message || err) || "tts_delegate_failed", 300);
    return {
      ok: false,
      retryable: /timeout|network|fetch|socket|429|503|504/i.test(message),
      reason: /timeout/i.test(message) ? "tts_timeout" : "tts_delegate_exception",
      message,
      providerStatus: /429/.test(message) ? 429 : /503/.test(message) ? 503 : /504/.test(message) ? 504 : 502
    };
  }
}

function classifyFailure(result, attempt) {
  const status = clampInt(result && (result.providerStatus || result.status), 0, 0, 999);
  const reason = cleanText(result && (result.reason || result.code || "tts_unavailable"), 120).toLowerCase();
  const retryable = result && result.retryable === true;
  if (["missing_text", "missing_voice", "tts_not_configured", "tts_provider_missing"].includes(reason)) {
    return { action: "stop", terminal: true, retryable: false, reason };
  }
  if (retryable && attempt < MAX_RETRY_ATTEMPTS && (status === 429 || status >= 500 || /timeout|network|circuit|concurrency/.test(reason))) {
    return { action: "retry", terminal: false, retryable: true, reason };
  }
  if (!retryable && status >= 400 && status < 500) return { action: "stop", terminal: true, retryable: false, reason };
  return { action: "downgrade", terminal: false, retryable, reason };
}

function buildPlayableAudioEnvelope(input, result, buffer, audioInfo) {
  const audioUrl = extractAudioUrl(result);
  const audioBase64 = input.wantJson ? (buffer ? buffer.toString("base64") : extractAudioBase64(result)) : "";
  const text = cleanText(pickFirst(result && result.text, result && result.textSpeak, result && result.spokenText, input.textDisplay, input.text), 5000);
  const mimeType = audioInfo ? audioInfo.mimeType : cleanText(result && (result.mimeType || result.mime || result.contentType), 80) || "audio/mpeg";
  const format = audioInfo ? audioInfo.format : cleanText(result && result.format, 16) || (mimeType.includes("wav") ? "wav" : "mp3");
  const playable = !!(buffer || audioUrl || audioBase64);

  return {
    ok: playable && result && result.ok !== false,
    version: VOICE_ROUTE_VERSION,
    requestId: cleanText(pickFirst(result && result.requestId, input.requestId), 80),
    turnId: cleanText(pickFirst(result && result.turnId, input.turnId), 80),
    traceId: cleanText(pickFirst(result && result.traceId, input.traceId), 96),
    sessionId: cleanText(pickFirst(result && result.sessionId, input.sessionId), 120),
    provider: cleanText(pickFirst(result && result.provider, input.provider, DEFAULT_PROVIDER), 32) || DEFAULT_PROVIDER,
    providerStatus: clampInt(pickFirst(result && result.providerStatus, result && result.status, 200), 200, 0, 999),
    routeKind: input.routeKind,
    guideContext: input.guideContext,
    guideActions: input.guideActions,
    mimeType,
    mime: mimeType,
    format,
    signature: audioInfo && audioInfo.signature || "",
    text,
    textSpeak: text,
    spokenText: text,
    audioUrl,
    url: audioUrl,
    audioBase64,
    byteLength: buffer ? buffer.length : 0,
    chars: text.length,
    playable,
    autoPlay: input.guideContext.voiceEnabled,
    shouldPlay: input.guideContext.voiceEnabled,
    audio: {
      url: audioUrl,
      audioUrl,
      audioBase64,
      byteLength: buffer ? buffer.length : 0,
      mimeType,
      format,
      playable,
      autoPlay: input.guideContext.voiceEnabled,
      shouldPlay: input.guideContext.voiceEnabled
    },
    playback: {
      ready: playable,
      autoPlay: input.guideContext.voiceEnabled,
      route: "/api/tts",
      compatibilityRoute: "/tts",
      method: "GET",
      synthesisMethod: "POST",
      mimeType,
      format
    },
    speechLifecycle: {
      prestart: "nyx:voice:prestart",
      start: "nyx:voice:start",
      end: "nyx:voice:end",
      error: "nyx:voice:error",
      guideState: "nyx:guide:state"
    }
  };
}

function failureEnvelope(input, result, decision) {
  const reason = cleanText(decision && decision.reason || result && (result.reason || result.code) || "tts_unavailable", 120);
  const message = cleanText(result && (result.message || result.detail) || "TTS unavailable.", 400);
  return {
    ok: false,
    playable: false,
    version: VOICE_ROUTE_VERSION,
    provider: cleanText(result && result.provider || input.provider || DEFAULT_PROVIDER, 32),
    providerStatus: clampInt(result && (result.providerStatus || result.status), 0, 0, 999),
    action: decision && decision.action || "downgrade",
    terminal: !!(decision && decision.terminal),
    retryable: !!(decision && decision.retryable),
    reason,
    message,
    requestId: input.requestId,
    turnId: input.turnId,
    traceId: cleanText(result && result.traceId || input.traceId, 96),
    sessionId: input.sessionId,
    text: input.textDisplay || input.text,
    guideContext: { ...input.guideContext, guideState: "recovery" },
    guideActions: input.guideActions,
    ttsFailure: {
      audioOnly: true,
      preserveTextReply: true,
      reason,
      message,
      retryable: !!(decision && decision.retryable)
    },
    audio: {
      playable: false,
      autoPlay: false,
      shouldPlay: false,
      audioUrl: "",
      audioBase64: "",
      byteLength: 0,
      mimeType: "application/json"
    }
  };
}

function applyCors(req, res) {
  const origin = cleanText(req && req.headers && req.headers.origin, 300);
  const allowed = String(process.env.SB_TTS_ALLOWED_ORIGINS || "https://sandblast.channel,https://www.sandblast.channel")
    .split(",").map((item) => item.trim()).filter(Boolean);
  if (origin && (allowed.includes(origin) || allowed.includes("*"))) {
    setHeaderSafe(res, "Access-Control-Allow-Origin", allowed.includes("*") ? "*" : origin);
    setHeaderSafe(res, "Vary", "Origin, Accept");
  }
  setHeaderSafe(res, "Access-Control-Allow-Methods", "POST,GET,OPTIONS");
  setHeaderSafe(res, "Access-Control-Allow-Headers", "Content-Type,Accept,X-SB-Response-Mode,X-SB-State-Contract,X-SB-Surface-Profile,X-SB-Widget-Token,X-SB-Session-ID,X-SB-Turn-ID,X-SB-Trace-ID,X-SB-Request-ID,X-SB-Input-Source");
  setHeaderSafe(res, "Access-Control-Expose-Headers", "X-SB-Voice-Route-Version,X-SB-TTS-Provider,X-SB-TTS-Upstream-Status,X-SB-TTS-Playable,X-SB-TTS-Audio-Signature,X-SB-Guide-State");
}

async function health() {
  try {
    const info = ttsHealth ? await Promise.resolve(ttsHealth()) : null;
    return {
      ok: !!delegateTts && (!info || info.ok !== false),
      enabled: !!delegateTts,
      version: VOICE_ROUTE_VERSION,
      guideContract: "nyx.guideShell/1.0",
      ttsModuleLoaded: !!ttsMod,
      ttsModulePath: ttsLoad.path || undefined,
      ttsModuleResolvedPath: ttsLoad.resolvedPath || undefined,
      ttsDelegateBound: !!delegateTts,
      ttsHealthBound: !!ttsHealth,
      voiceConfigured: !!DEFAULT_VOICE_UUID,
      clientVoiceOverrideAllowed: ALLOW_CLIENT_VOICE_OVERRIDE,
      provider: DEFAULT_PROVIDER,
      loadError: ttsLoadError || undefined,
      tts: info && typeof info === "object" ? info : null
    };
  } catch (err) {
    return {
      ok: false,
      enabled: !!delegateTts,
      version: VOICE_ROUTE_VERSION,
      error: cleanText(err && (err.message || err) || "tts_health_failed", 300)
    };
  }
}

async function voiceRoute(req, res) {
  applyCors(req, res);
  if (cleanText(req && req.method, 16).toUpperCase() === "OPTIONS") return res.status(204).end();

  const input = normalizeInput(req);
  setHeaderSafe(res, "X-SB-Voice-Route-Version", VOICE_ROUTE_VERSION);
  setHeaderSafe(res, "X-SB-Guide-Contract", "nyx.guideShell/1.0");
  setHeaderSafe(res, "X-SB-Guide-State", input.guideContext.guideState);
  setHeaderSafe(res, "X-SB-Guide-Lane", input.guideContext.currentLane);
  setHeaderSafe(res, "X-SB-Guide-Actions", String(input.guideActions.length));
  setHeaderSafe(res, "Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  setHeaderSafe(res, "X-SB-Audio-Contract", "audio-first-v3");
  setHeaderSafe(res, "X-Content-Type-Options", "nosniff");

  let attempt = 0;
  let result = null;
  let decision = null;
  while (attempt <= MAX_RETRY_ATTEMPTS) {
    result = await callDelegate(req, input, attempt);
    if (result && result.ok) break;
    decision = classifyFailure(result || {}, attempt);
    if (decision.action !== "retry") break;
    attempt += 1;
  }

  if (result && result.ok) {
    const buffer = extractAudioBuffer(result);
    const info = buffer ? detectAudio(buffer) : null;
    const playable = buildPlayableAudioEnvelope(input, result, buffer, info);

    setHeaderSafe(res, "X-SB-TTS-Provider", playable.provider);
    setHeaderSafe(res, "X-SB-TTS-Upstream-Status", String(playable.providerStatus || 200));
    setHeaderSafe(res, "X-SB-TTS-Playable", playable.playable ? "1" : "0");
    if (info) {
      setHeaderSafe(res, "X-SB-TTS-Audio-Signature", info.signature);
      setHeaderSafe(res, "X-SB-TTS-Actual-Format", info.format);
    }

    if (!playable.playable) {
      result = {
        ...result,
        ok: false,
        retryable: false,
        reason: "tts_empty_audio",
        message: "TTS reported success without a verified audio payload.",
        providerStatus: 502
      };
      decision = classifyFailure(result, attempt);
    } else if (input.wantJson || !buffer) {
      setHeaderSafe(res, "X-SB-Response-Mode", buffer ? "json-audio" : "json-url");
      return res.status(200).json(playable);
    } else {
      setHeaderSafe(res, "X-SB-Response-Mode", "audio");
      setHeaderSafe(res, "Content-Type", info.mimeType);
      setHeaderSafe(res, "Content-Length", String(buffer.length));
      setHeaderSafe(res, "Content-Disposition", `inline; filename="nyx_guide.${info.format}"`);
      setHeaderSafe(res, "Accept-Ranges", "none");
      res.status(200);
      return res.end(buffer);
    }
  }

  decision = decision || classifyFailure(result || {}, attempt);
  const envelope = failureEnvelope(input, result || {}, decision);
  setHeaderSafe(res, "X-SB-TTS-Reason", envelope.reason);
  setHeaderSafe(res, "X-SB-TTS-Upstream-Status", String(envelope.providerStatus || 0));
  setHeaderSafe(res, "X-SB-TTS-Playable", "0");

  if (envelope.action === "stop") {
    const status = envelope.providerStatus >= 400 ? Math.min(503, envelope.providerStatus) : 409;
    return res.status(status).json(envelope);
  }

  return res.status(200).json({
    ok: true,
    degraded: true,
    playable: false,
    version: VOICE_ROUTE_VERSION,
    reply: envelope.text || input.text || "Audio is unavailable right now.",
    payload: { reply: envelope.text || input.text || "Audio is unavailable right now." },
    guideContext: envelope.guideContext,
    guideActions: envelope.guideActions,
    directives: [{ type: "tts_failure", ...envelope.ttsFailure }],
    audio: envelope.audio,
    speechLifecycle: {
      error: "nyx:voice:error",
      end: "nyx:voice:end",
      guideRecovery: "nyx:guide:recovery"
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
module.exports.normalizeDelegateResult = normalizeDelegateResult;
module.exports.normalizeGuideContext = normalizeGuideContext;
module.exports.normalizeGuideActions = normalizeGuideActions;
module.exports.detectAudio = detectAudio;
module.exports.VOICE_ROUTE_VERSION = VOICE_ROUTE_VERSION;

/* NYX_VOICE_ROUTE_CONTINUITY_TV_STEPS_5_6_R1_START */
;(function () {
  "use strict";

  const PATCH_VERSION = "voiceRoute v1.9.0 CROSS-PROPERTY-CONTINUITY + TELEVISION-SAFE-VOICE";
  const CONTINUITY_CONTRACT = "nyx.guideContinuity/1.0";
  const TELEVISION_CONTRACT = "nyx.televisionGuide/1.0";
  const TV_DEVICES = new Set(["roku", "smart_tv", "web_tv", "set_top_box", "console"]);
  const MAX_TTL_MS = 30 * 60 * 1000;

  function isObj(value) {
    return !!value && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value);
  }

  function safeText(value, max = 240) {
    return String(value == null ? "" : value)
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, max);
  }

  function boolish(value, fallback = false) {
    if (typeof value === "boolean") return value;
    const text = safeText(value, 16).toLowerCase();
    if (["1", "true", "yes", "on", "enabled"].includes(text)) return true;
    if (["0", "false", "no", "off", "disabled"].includes(text)) return false;
    return fallback;
  }

  function clamp(value, fallback, min, max) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  }

  function normalizeSurface(value) {
    return safeText(value || "sandblast.channel", 96)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "") || "sandblast.channel";
  }

  function normalizeLane(value) {
    const raw = safeText(value || "home", 32).toLowerCase().replace(/[^a-z0-9_-]+/g, "");
    const aliases = {
      radio: "live", listen: "live", tv: "watch", television: "watch",
      cartoon: "watch", cartoons: "watch", classic: "watch", classics: "watch",
      synapse: "news", guide: "search", nyx: "search", app: "apps"
    };
    const lane = aliases[raw] || raw;
    return ["home", "search", "live", "watch", "roku", "news", "about", "apps"].includes(lane)
      ? lane
      : "home";
  }

  function publicId(value, fallback = "") {
    return safeText(value || fallback, 96).replace(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 96);
  }

  function hashText(value) {
    const text = String(value == null ? "" : value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function normalizePublicGuideContinuity(value = {}, fallback = {}) {
    const src = isObj(value) ? value : {};
    const base = isObj(fallback) ? fallback : {};
    const context = isObj(src.guideContext) ? src.guideContext : {};
    const media = isObj(src.mediaState || context.mediaState || base.mediaState)
      ? (src.mediaState || context.mediaState || base.mediaState)
      : {};
    const carry = isObj(src.conversationCarry || src.carry || base.conversationCarry)
      ? (src.conversationCarry || src.carry || base.conversationCarry)
      : {};
    const now = Date.now();
    const sessionId = publicId(src.sessionId || base.sessionId || "public", "public");
    const surface = normalizeSurface(src.surface || context.surface || base.surface);
    const previousSurface = normalizeSurface(src.previousSurface || base.surface || surface);
    const ttlMs = Math.round(clamp(src.ttlMs || base.ttlMs, MAX_TTL_MS, 60_000, MAX_TTL_MS));
    const handoff = isObj(src.handoff) ? src.handoff : {};
    const handoffId = publicId(
      src.handoffId ||
      handoff.id ||
      `handoff_${hashText(`${sessionId}|${previousSurface}|${surface}|${Math.floor(now / 30000)}`)}`,
      "handoff"
    );

    return {
      contract: CONTINUITY_CONTRACT,
      version: PATCH_VERSION,
      publicSessionOnly: true,
      privateMemoryAccess: false,
      authoritative: false,
      sessionId,
      handoffId,
      surface,
      previousSurface,
      page: safeText(src.page || context.page || base.page || "/", 160),
      previousPage: safeText(src.previousPage || base.previousPage || "/", 160),
      lane: normalizeLane(src.lane || src.currentLane || context.lane || context.currentLane),
      previousLane: normalizeLane(src.previousLane || base.previousLane || "home"),
      guideState: safeText(src.guideState || context.guideState || "available", 32)
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, ""),
      panelOpen: boolish(src.panelOpen ?? context.panelOpen, false),
      voiceEnabled: boolish(src.voiceEnabled ?? context.voiceEnabled, true),
      reducedMotion: boolish(src.reducedMotion ?? context.reducedMotion, false),
      suggestionsEnabled: boolish(src.suggestionsEnabled ?? context.suggestionsEnabled, true),
      conversationCarry: {
        goal: safeText(carry.goal || src.goal || "", 80),
        intent: safeText(carry.intent || src.intent || "", 80),
        lastDestination: safeText(carry.lastDestination || src.lastDestination || "", 96),
        lastUserText: safeText(carry.lastUserText || src.lastUserText || "", 180),
        lastNyxReply: safeText(carry.lastNyxReply || src.lastNyxReply || "", 180)
      },
      mediaState: {
        kind: safeText(media.kind || media.type || "", 24).toLowerCase().replace(/[^a-z0-9_-]+/g, ""),
        playing: boolish(media.playing ?? media.radioPlaying ?? media.videoPlaying, false),
        paused: boolish(media.paused, false),
        muted: boolish(media.muted, false),
        contentId: safeText(media.contentId || media.programId || "", 96),
        channelId: safeText(media.channelId || media.channel || "", 96),
        positionSec: clamp(media.positionSec || media.currentTime, 0, 0, 86400),
        durationSec: clamp(media.durationSec || media.duration, 0, 0, 86400)
      },
      handoff: {
        active: previousSurface !== surface,
        id: handoffId,
        issuedAt: clamp(handoff.issuedAt, now, 0, now + MAX_TTL_MS),
        expiresAt: clamp(handoff.expiresAt, now + ttlMs, now, now + MAX_TTL_MS),
        ttlMs,
        userGestureRequired: true,
        autoNavigate: false
      }
    };
  }

  function normalizeTelevisionGuide(value = {}, continuity = {}) {
    const root = isObj(value) ? value : {};
    const src = isObj(root.televisionGuide || root.tvGuide || root.tvContext)
      ? (root.televisionGuide || root.tvGuide || root.tvContext)
      : root;
    const rawDevice = safeText(src.deviceClass || src.device || root.deviceClass || "", 32)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_");
    const surface = normalizeSurface(src.surface || continuity.surface);
    const enabled = boolish(
      src.enabled,
      TV_DEVICES.has(rawDevice) || /(?:^|[._-])(roku|tv|television)(?:$|[._-])/.test(surface)
    );

    if (!enabled) {
      return {
        contract: TELEVISION_CONTRACT,
        version: PATCH_VERSION,
        enabled: false,
        authoritative: false
      };
    }

    const inputModeRaw = safeText(src.inputMode || src.navigationMode || "remote", 24)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_");
    const inputMode = ["remote", "keyboard", "pointer", "touch", "voice_request"].includes(inputModeRaw)
      ? inputModeRaw
      : "remote";
    const reducedMotion = boolish(src.reducedMotion, continuity.reducedMotion || true);

    return {
      contract: TELEVISION_CONTRACT,
      version: PATCH_VERSION,
      enabled: true,
      authoritative: false,
      deviceClass: TV_DEVICES.has(rawDevice)
        ? rawDevice
        : (surface.includes("roku") ? "roku" : "web_tv"),
      surface,
      inputMode,
      remotePrimary: inputMode === "remote",
      captionsRequired: true,
      captionsEnabled: boolish(src.captionsEnabled, true),
      continuousListening: false,
      voiceActivation: "explicit_user_request",
      explicitVoiceRequest: boolish(src.explicitVoiceRequest ?? root.voiceRequested ?? root.userGesture, false),
      autoSpeak: false,
      interruptPlayback: false,
      userGestureRequired: true,
      responseDensity: "compact",
      maxSpeechChars: Math.round(clamp(src.maxSpeechChars, 260, 120, 420)),
      maxActions: Math.round(clamp(src.maxActions, 4, 1, 4)),
      safeAreaPercent: clamp(src.safeAreaPercent, 5, 3, 10),
      animation: {
        mode: reducedMotion ? "reduced" : "restrained",
        reducedMotion,
        continuousMotion: false
      },
      focus: {
        target: safeText(src.focusTarget || src.focus || "guide_dock", 80),
        preserveNativeBack: true,
        preserveNativePlayPause: true,
        trapFocus: false
      },
      playbackPolicy: {
        autoPauseMedia: false,
        autoResumeMedia: false,
        duckAudioOnlyOnExplicitSpeech: true,
        restoreFocusAfterSpeech: true
      }
    };
  }

  function sentenceBounded(text, maxChars) {
    const clean = safeText(text, Math.max(120, maxChars + 200));
    if (clean.length <= maxChars) return clean;
    const clipped = clean.slice(0, maxChars);
    const boundary = Math.max(
      clipped.lastIndexOf(". "),
      clipped.lastIndexOf("! "),
      clipped.lastIndexOf("? ")
    );
    return (boundary >= Math.floor(maxChars * 0.55) ? clipped.slice(0, boundary + 1) : clipped)
      .trim()
      .replace(/[,:;–—-]+$/, "")
      .trim() + "…";
  }

  function wrapResponseJson(res, continuity, televisionGuide) {
    if (!res || typeof res.json !== "function" || res.json.__nyxTvContinuityWrapped) return;
    const original = res.json.bind(res);
    const wrapped = function (value) {
      if (!isObj(value)) return original(value);
      const out = { ...value, publicGuideContinuity: continuity };
      if (televisionGuide.enabled) out.televisionGuide = televisionGuide;
      if (isObj(out.payload)) {
        out.payload = { ...out.payload, publicGuideContinuity: continuity };
        if (televisionGuide.enabled) out.payload.televisionGuide = televisionGuide;
      }
      return original(out);
    };
    wrapped.__nyxTvContinuityWrapped = true;
    res.json = wrapped;
  }

  function copyFunctionProperties(from, to) {
    try {
      for (const key of Object.keys(from || {})) to[key] = from[key];
    } catch (_) {}
  }

  const original = module.exports;
  if (typeof original !== "function") return;

  const wrappedVoiceRoute = async function nyxContinuityTvVoiceRoute(req, res) {
    const body = isObj(req && req.body) ? { ...req.body } : {};
    const query = isObj(req && req.query) ? req.query : {};
    const continuityInput = body.publicGuideContinuity || body.guideContinuity || body.continuity || {
      sessionId: body.sessionId || query.sessionId,
      surface: body.surface || query.surface,
      previousSurface: body.previousSurface || query.previousSurface,
      page: body.page || query.page,
      previousPage: body.previousPage || query.previousPage,
      lane: body.lane || body.currentLane || query.lane,
      previousLane: body.previousLane || query.previousLane,
      guideState: body.guideState || query.guideState,
      panelOpen: body.panelOpen,
      voiceEnabled: body.voiceEnabled,
      reducedMotion: body.reducedMotion,
      suggestionsEnabled: body.suggestionsEnabled,
      mediaState: body.mediaState || body.media,
      conversationCarry: body.conversationCarry
    };
    const continuity = normalizePublicGuideContinuity(continuityInput);
    const televisionGuide = normalizeTelevisionGuide(body, continuity);

    body.publicGuideContinuity = continuity;
    body.guideContinuity = continuity;
    if (televisionGuide.enabled) {
      body.televisionGuide = televisionGuide;
      body.autoPlay = false;
      body.shouldPlay = false;
      body.interruptPlayback = false;
      if (body.text) body.text = sentenceBounded(body.text, televisionGuide.maxSpeechChars);
      if (body.spokenText) body.spokenText = sentenceBounded(body.spokenText, televisionGuide.maxSpeechChars);
      if (body.textSpeak) body.textSpeak = sentenceBounded(body.textSpeak, televisionGuide.maxSpeechChars);
    }

    if (req) req.body = body;

    try {
      if (res && !res.headersSent) {
        res.setHeader("X-SB-Guide-Continuity-Contract", CONTINUITY_CONTRACT);
        res.setHeader("X-SB-Guide-Handoff", continuity.handoff.active ? "1" : "0");
        res.setHeader("X-SB-Guide-Surface", continuity.surface);
        res.setHeader("X-SB-TV-Guide", televisionGuide.enabled ? "1" : "0");
        if (televisionGuide.enabled) {
          res.setHeader("X-SB-TV-Device-Class", televisionGuide.deviceClass);
          res.setHeader("X-SB-TV-Captions-Required", "1");
          res.setHeader("X-SB-TV-Auto-Speak", "0");
          res.setHeader("X-SB-TV-Interrupt-Playback", "0");
        }
      }
    } catch (_) {}

    wrapResponseJson(res, continuity, televisionGuide);

    const enforceExplicit = /^(1|true|yes|on)$/i.test(
      String(process.env.SB_TV_TTS_REQUIRE_EXPLICIT_REQUEST || "")
    );
    if (televisionGuide.enabled && enforceExplicit && !televisionGuide.explicitVoiceRequest) {
      return res.status(409).json({
        ok: false,
        playable: false,
        code: "TV_EXPLICIT_VOICE_REQUEST_REQUIRED",
        reason: "TV_EXPLICIT_VOICE_REQUEST_REQUIRED",
        message: "Television voice playback requires an explicit user request.",
        publicGuideContinuity: continuity,
        televisionGuide
      });
    }

    return original(req, res);
  };

  copyFunctionProperties(original, wrappedVoiceRoute);
  wrappedVoiceRoute.voiceRoute = wrappedVoiceRoute;
  wrappedVoiceRoute.route = wrappedVoiceRoute;
  wrappedVoiceRoute.run = wrappedVoiceRoute;
  wrappedVoiceRoute.speak = wrappedVoiceRoute;
  wrappedVoiceRoute.default = wrappedVoiceRoute;
  wrappedVoiceRoute.normalizePublicGuideContinuity = normalizePublicGuideContinuity;
  wrappedVoiceRoute.normalizeTelevisionGuide = normalizeTelevisionGuide;
  wrappedVoiceRoute.NYX_GUIDE_CONTINUITY_CONTRACT = CONTINUITY_CONTRACT;
  wrappedVoiceRoute.NYX_TELEVISION_GUIDE_CONTRACT = TELEVISION_CONTRACT;
  wrappedVoiceRoute.NYX_VOICE_CONTINUITY_TV_VERSION = PATCH_VERSION;

  module.exports = wrappedVoiceRoute;
})();
/* NYX_VOICE_ROUTE_CONTINUITY_TV_STEPS_5_6_R1_END */

/* NYX_GUIDE_ORCHESTRATION_STEPS_10_11_12_R1_START */
(function(){
  "use strict";
  if(typeof module==="undefined"||!module.exports)return;const V="nyx.guideOrchestration.voiceRoute/4.0-steps10-11-12",EC="nyx.guideExecution/1.0",SC="nyx.guideStateTransition/1.0",original=module.exports;if(typeof original!=="function")return;
  function o(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}function x(v,n=120){return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g,"").replace(/\s+/g," ").trim().slice(0,n)}
  function boundary(req){const b=o(req&&req.body),q=o(req&&req.query),h=o(req&&req.headers),e=o(b.nyxGuideExecution||b.guideExecution),c=o(b.guideContext||b.publicGuideContinuity);return{contract:EC,version:V,planId:x(e.planId||b.planId||h["x-sb-guide-plan-id"]||q.planId,80),actionId:x(e.actionId||b.actionId||h["x-sb-guide-action-id"]||q.actionId,80),status:x(e.status||"voice_transport",32),currentLane:x(e.currentLane||c.currentLane||b.lane||q.lane||"home",32),previousLane:x(e.previousLane||c.previousLane||"home",32),revision:Math.max(0,Number(e.revision||c.revision||h["x-sb-guide-state-revision"]||0)||0),requiresUserGesture:true,autoExecute:false,voiceMaySuggest:true,voiceMayExecuteNavigation:false,serverExecutionAllowed:false,publicSessionOnly:true,privateMemoryAccess:false}}
  function wrapJson(res,e){if(!res||typeof res.json!=="function"||res.json.__nyx101112Voice)return;const j=res.json.bind(res),w=function(v){if(v&&typeof v==="object"&&!Array.isArray(v)){v={...v,nyxGuideExecution:e,nyxGuideStateTransition:{contract:SC,version:V,status:"voice_transport_only",revision:e.revision,currentLane:e.currentLane,previousLane:e.previousLane,planId:e.planId,actionId:e.actionId,requiresUserGesture:true,autoExecute:false}}}return j(v)};w.__nyx101112Voice=true;res.json=w}
  const wrapped=async function(req,res){const e=boundary(req);if(req){req.body={...o(req.body),nyxGuideExecution:e,guideExecution:e};req.body.autoNavigate=false;req.body.autoExecute=false}try{if(res&&!res.headersSent){res.setHeader("X-SB-Guide-Execution-Contract",EC);res.setHeader("X-SB-Guide-State-Contract",SC);res.setHeader("X-SB-Guide-Plan-ID",e.planId||"");res.setHeader("X-SB-Guide-Action-ID",e.actionId||"");res.setHeader("X-SB-Guide-State-Revision",String(e.revision));res.setHeader("X-SB-Voice-Navigation-Execution","blocked_without_user_gesture")}}catch(_){}wrapJson(res,e);return original(req,res)};try{Object.keys(original).forEach(k=>wrapped[k]=original[k])}catch(_){}wrapped.voiceRoute=wrapped;wrapped.route=wrapped;wrapped.run=wrapped;wrapped.default=wrapped;wrapped.NYX_GUIDE_STEPS_10_11_12_VOICE_VERSION=V;wrapped.normalizeGuideExecutionBoundary=boundary;wrapped.NYX_GUIDE_EXECUTION_CONTRACT=EC;wrapped.NYX_GUIDE_STATE_TRANSITION_CONTRACT=SC;module.exports=wrapped;
})();
/* NYX_GUIDE_ORCHESTRATION_STEPS_10_11_12_R1_END */
