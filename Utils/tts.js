"use strict";
/**
 * Nyx TTS Engine — Operationally Hardened Resemble Handler
 *
 * Goals:
 * - preserve structure integrity for existing callers
 * - export a route handler compatible with index.js delegation
 * - unify widget + intro page synthesis behavior
 * - keep fail-open health/circuit state to avoid repeated 503 storms
 * - add speech shaping so punctuation, cadence, and sentence breathing
 *   land in actual voice output rather than only front-end preload
 */

const crypto = require("crypto");
const { synthesize } = require("./ttsProvidersResemble");

/* ===============================
   CONFIGURATION
================================ */

const MAX_TEXT = 1800;
const MAX_CONCURRENT = Number(process.env.SB_TTS_MAX_CONCURRENT || 3);
const CIRCUIT_LIMIT = Number(process.env.SB_TTS_CIRCUIT_LIMIT || 5);
const CIRCUIT_RESET_MS = Number(process.env.SB_TTS_CIRCUIT_RESET_MS || 30000);
const DEFAULT_VOICE = "nyx";

const DEFAULT_SPEECH_HINTS = Object.freeze({
  pauses: {
    commaMs: 150,
    periodMs: 320,
    questionMs: 360,
    exclaimMs: 340,
    colonMs: 220,
    semicolonMs: 260,
    ellipsisMs: 520
  },
  pacing: {
    mode: "natural",
    preservePunctuation: true,
    sentenceBreath: true,
    noRunOns: true
  }
});

const DEFAULT_PRONUNCIATION_MAP = Object.freeze({
  "Nyx": "Nix",
  "Nix": "Nix",
  "Sandblast": "Sand-blast",
  "Roku": "Roh-koo",
  "Marion": "Marry-in"
});

/* ===============================
   STATE
================================ */

let activeRequests = 0;
let failCount = 0;
let circuitOpenUntil = 0;
let lastError = "";
let lastOkAt = 0;
let lastFailAt = 0;
let lastProviderStatus = 0;
let lastElapsedMs = 0;

/* ===============================
   UTILITIES
================================ */

function _str(v){ return v == null ? "" : String(v); }
function _trim(v){ return _str(v).trim(); }
function _lower(v){ return _trim(v).toLowerCase(); }
function _now(){ return Date.now(); }
function _makeTrace(){ return `tts_${Date.now().toString(16)}_${crypto.randomBytes(4).toString("hex")}`; }
function _bool(v, dflt){
  if (v == null || v === "") return dflt;
  if (typeof v === "boolean") return v;
  const s = _lower(v);
  if (["1","true","yes","on"].includes(s)) return true;
  if (["0","false","no","off"].includes(s)) return false;
  return dflt;
}
function _pickFirst(){
  for (let i = 0; i < arguments.length; i++){
    const v = _trim(arguments[i]);
    if (v) return v;
  }
  return "";
}
function _safeJson(res, status, body){
  if (res.headersSent) return;
  try { res.status(status).json(body); }
  catch (_) { try { res.status(status).send(JSON.stringify(body)); } catch (__) {} }
}
function _setHeader(res, k, v){ try { if (!res.headersSent) res.setHeader(k, v); } catch (_) {} }
function _setCommonAudioHeaders(res, traceId, meta){
  _setHeader(res, "Cache-Control", "no-store, max-age=0");
  _setHeader(res, "X-SB-Trace-ID", traceId);
  if (meta && meta.provider) _setHeader(res, "X-SB-TTS-Provider", meta.provider);
  if (meta && meta.voiceUuid) _setHeader(res, "X-SB-Voice", meta.voiceUuid);
  if (meta && Number.isFinite(meta.elapsedMs)) _setHeader(res, "X-SB-TTS-MS", String(meta.elapsedMs));
  if (meta && Number.isFinite(meta.shapeMs)) _setHeader(res, "X-SB-TTS-SHAPE-MS", String(meta.shapeMs));
  if (meta && Number.isFinite(meta.segmentCount)) _setHeader(res, "X-SB-TTS-SEGMENTS", String(meta.segmentCount));
}
function _circuitOpen(){ return _now() < circuitOpenUntil; }
function _recordFailure(message, status){
  failCount += 1;
  lastError = _trim(message) || "tts_failed";
  lastFailAt = _now();
  lastProviderStatus = Number(status || 0) || 0;
  if (failCount >= CIRCUIT_LIMIT) {
    circuitOpenUntil = _now() + CIRCUIT_RESET_MS;
    try { console.warn("[TTS] Circuit breaker OPEN", { failCount, resetInMs: CIRCUIT_RESET_MS }); } catch (_) {}
  }
}
function _recordSuccess(status, elapsedMs){
  failCount = 0;
  circuitOpenUntil = 0;
  lastError = "";
  lastOkAt = _now();
  lastProviderStatus = Number(status || 200) || 200;
  lastElapsedMs = Number(elapsedMs || 0) || 0;
}
function _healthSnapshot(){
  const voiceUuid = _pickFirst(process.env.RESEMBLE_VOICE_UUID, process.env.SB_RESEMBLE_VOICE_UUID, process.env.SBNYX_RESEMBLE_VOICE_UUID);
  const projectUuid = _pickFirst(process.env.RESEMBLE_PROJECT_UUID, process.env.SB_RESEMBLE_PROJECT_UUID);
  const token = _pickFirst(process.env.RESEMBLE_API_TOKEN, process.env.RESEMBLE_API_KEY);
  return {
    ok: !!(token && voiceUuid),
    provider: "resemble",
    activeRequests,
    failCount,
    circuitOpen: _circuitOpen(),
    circuitResetAt: circuitOpenUntil,
    lastError,
    lastOkAt,
    lastFailAt,
    lastProviderStatus,
    lastElapsedMs,
    env: {
      hasToken: !!token,
      hasProject: !!projectUuid,
      hasVoice: !!voiceUuid,
      voiceUuidPreview: voiceUuid ? `${voiceUuid.slice(0,4)}***${voiceUuid.slice(-3)}` : "",
      projectUuidPreview: projectUuid ? `${projectUuid.slice(0,4)}***${projectUuid.slice(-3)}` : ""
    }
  };
}

function _mergePronunciationMap(extra){
  const merged = Object.assign({}, DEFAULT_PRONUNCIATION_MAP);
  if (extra && typeof extra === "object") {
    Object.keys(extra).forEach((k) => {
      const key = _trim(k);
      const val = _trim(extra[k]);
      if (key && val) merged[key] = val;
    });
  }
  return merged;
}

function _parseSpeechHints(body){
  const inputHints = body && typeof body.speechHints === "object" ? body.speechHints : {};
  const inputPauses = inputHints && typeof inputHints.pauses === "object" ? inputHints.pauses : {};
  const inputPacing = inputHints && typeof inputHints.pacing === "object" ? inputHints.pacing : {};

  return {
    pauses: {
      commaMs: Number(inputPauses.commaMs || body.commaMs || DEFAULT_SPEECH_HINTS.pauses.commaMs) || DEFAULT_SPEECH_HINTS.pauses.commaMs,
      periodMs: Number(inputPauses.periodMs || body.periodMs || DEFAULT_SPEECH_HINTS.pauses.periodMs) || DEFAULT_SPEECH_HINTS.pauses.periodMs,
      questionMs: Number(inputPauses.questionMs || body.questionMs || DEFAULT_SPEECH_HINTS.pauses.questionMs) || DEFAULT_SPEECH_HINTS.pauses.questionMs,
      exclaimMs: Number(inputPauses.exclaimMs || body.exclaimMs || DEFAULT_SPEECH_HINTS.pauses.exclaimMs) || DEFAULT_SPEECH_HINTS.pauses.exclaimMs,
      colonMs: Number(inputPauses.colonMs || body.colonMs || DEFAULT_SPEECH_HINTS.pauses.colonMs) || DEFAULT_SPEECH_HINTS.pauses.colonMs,
      semicolonMs: Number(inputPauses.semicolonMs || body.semicolonMs || DEFAULT_SPEECH_HINTS.pauses.semicolonMs) || DEFAULT_SPEECH_HINTS.pauses.semicolonMs,
      ellipsisMs: Number(inputPauses.ellipsisMs || body.ellipsisMs || DEFAULT_SPEECH_HINTS.pauses.ellipsisMs) || DEFAULT_SPEECH_HINTS.pauses.ellipsisMs
    },
    pacing: {
      mode: _pickFirst(inputPacing.mode, body.pacingMode, DEFAULT_SPEECH_HINTS.pacing.mode),
      preservePunctuation: _bool(inputPacing.preservePunctuation, _bool(body.preservePunctuation, DEFAULT_SPEECH_HINTS.pacing.preservePunctuation)),
      sentenceBreath: _bool(inputPacing.sentenceBreath, _bool(body.sentenceBreath, DEFAULT_SPEECH_HINTS.pacing.sentenceBreath)),
      noRunOns: _bool(inputPacing.noRunOns, _bool(body.noRunOns, DEFAULT_SPEECH_HINTS.pacing.noRunOns))
    }
  };
}

function _normalizeWhitespace(text){
  return _str(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(\S)/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\. {0,}\.{0,}\.{4,}/g, "...")
    .replace(/\.\.\.+/g, "...")
    .trim();
}

function _applyPronunciationMap(text, pronunciationMap){
  let out = _str(text);
  const keys = Object.keys(pronunciationMap || {}).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const replacement = _trim(pronunciationMap[key]);
    if (!key || !replacement) continue;
    const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\b${safeKey}\\b`, "g"), replacement);
  }
  return out;
}

function _collapseJoiners(text){
  return _str(text)
    .replace(/\s+,/g, ",")
    .replace(/\s+;/g, ";")
    .replace(/\s+:/g, ":")
    .replace(/\s+\./g, ".")
    .replace(/\s+\?/g, "?")
    .replace(/\s+!/g, "!");
}

function _repairRunOns(text){
  let out = _str(text);

  out = out.replace(/,\s+(and|but|so)\s+(I|we|you|they|he|she|it)\b/g, ". $1 $2");
  out = out.replace(/,\s+(however|meanwhile|instead|still|then|also)\b/gi, ". $1");
  out = out.replace(/\b(also|right|you know)\b\s*,\s*\b(also|right|you know)\b/gi, "$1");
  out = out.replace(/\s{2,}/g, " ");

  return out;
}

function _splitLongSentence(sentence){
  const s = _trim(sentence);
  if (!s) return [];

  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 22) return [s];

  const splitter = /,\s+(and|but|so|because|while|which|that)\s+/i;
  const match = splitter.exec(s);
  if (!match || typeof match.index !== "number") return [s];

  const cut = match.index;
  const left = _trim(s.slice(0, cut));
  const right = _trim(s.slice(cut + 2));
  if (!left || !right) return [s];

  return [left.replace(/[,:;]+$/g, "") + ".", right];
}

function _segmentSentences(text, speechHints){
  const normalized = _collapseJoiners(_repairRunOns(_normalizeWhitespace(text)));
  const rough = normalized
    .replace(/([.!?])\s+(?=[A-Z"'])/g, "$1\n")
    .replace(/([:;])\s+(?=[A-Z"'])/g, "$1\n")
    .split(/\n+/)
    .map(_trim)
    .filter(Boolean);

  const segments = [];
  for (const item of rough) {
    if (speechHints && speechHints.pacing && speechHints.pacing.noRunOns) {
      const split = _splitLongSentence(item);
      split.forEach((part) => { if (_trim(part)) segments.push(_trim(part)); });
    } else {
      segments.push(item);
    }
  }

  return segments;
}

function _pauseToken(ms){
  const n = Math.max(0, Math.min(1500, Number(ms || 0) || 0));
  if (!n) return "";
  return `<break time=\"${n}ms\"/>`;
}

function _decorateSegment(segment, pauses){
  let s = _trim(segment);
  if (!s) return "";

  s = s.replace(/\.\.\./g, `... ${_pauseToken(pauses.ellipsisMs)}`);
  s = s.replace(/,\s*/g, `, ${_pauseToken(pauses.commaMs)}`);
  s = s.replace(/;\s*/g, `; ${_pauseToken(pauses.semicolonMs)}`);
  s = s.replace(/:\s*/g, `: ${_pauseToken(pauses.colonMs)}`);
  s = s.replace(/\.\s*$/g, `. ${_pauseToken(pauses.periodMs)}`);
  s = s.replace(/\?\s*$/g, `? ${_pauseToken(pauses.questionMs)}`);
  s = s.replace(/!\s*$/g, `! ${_pauseToken(pauses.exclaimMs)}`);
  return s.trim();
}

function _stripMarkup(text){
  return _str(text).replace(/<break\s+time=\"\d+ms\"\s*\/>/g, " ").replace(/\s+/g, " ").trim();
}

function _shapeSpeechText(rawText, options){
  const startedAt = _now();
  const speechHints = options && options.speechHints ? options.speechHints : DEFAULT_SPEECH_HINTS;
  const pronunciationMap = _mergePronunciationMap(options && options.pronunciationMap);

  const displayText = _normalizeWhitespace(rawText);
  const pronouncedText = _applyPronunciationMap(displayText, pronunciationMap);
  const segments = _segmentSentences(pronouncedText, speechHints);

  const ssmlSegments = segments.map((segment) => _decorateSegment(segment, speechHints.pauses)).filter(Boolean);
  const ssmlText = ssmlSegments.length
    ? `<speak>${ssmlSegments.join(_pauseToken(Math.max(120, Math.floor((speechHints.pauses.periodMs || 320) * 0.65))))}</speak>`
    : `<speak>${_decorateSegment(pronouncedText, speechHints.pauses)}</speak>`;

  return {
    rawText: _str(rawText),
    displayText,
    textSpeak: pronouncedText,
    text: pronouncedText,
    ssmlText,
    plainText: _stripMarkup(ssmlText).replace(/^<speak>|<\/speak>$/g, ""),
    segments,
    segmentCount: segments.length,
    shapeElapsedMs: _now() - startedAt,
    speechHints,
    pronunciationMap
  };
}

function _resolveInput(req){
  const body = req && req.body && typeof req.body === "object" ? req.body : {};
  const text = _pickFirst(body.textSpeak, body.text, body.data, body.speak, body.say, body.message, body.textDisplay);
  const voiceUuid = _pickFirst(
    body.voice_uuid,
    body.voiceUuid,
    body.voiceId,
    process.env.RESEMBLE_VOICE_UUID,
    process.env.SB_RESEMBLE_VOICE_UUID,
    process.env.SBNYX_RESEMBLE_VOICE_UUID
  );
  const projectUuid = _pickFirst(
    body.project_uuid,
    body.projectUuid,
    process.env.RESEMBLE_PROJECT_UUID,
    process.env.SB_RESEMBLE_PROJECT_UUID
  );
  const outputFormat = _lower(_pickFirst(body.output_format, body.outputFormat, "mp3")) === "wav" ? "wav" : "mp3";
  const traceId = _pickFirst(
    req && req.headers && (req.headers["x-sb-trace-id"] || req.headers["x-sb-traceid"]),
    body.traceId,
    _makeTrace()
  );
  return {
    text: _trim(text).slice(0, MAX_TEXT),
    textDisplay: _trim(body.textDisplay).slice(0, MAX_TEXT),
    voiceUuid,
    projectUuid,
    outputFormat,
    traceId,
    title: _pickFirst(body.title, body.source, body.client && body.client.source, "nyx_tts").slice(0, 120),
    sampleRate: body.sampleRate || body.sample_rate,
    precision: body.precision,
    useHd: body.useHd,
    intro: _bool(body.intro, false),
    healthCheck: _bool(body.healthCheck, false),
    wantJson: _bool(body.returnJson, false),
    mode: _pickFirst(body.mode, "presence"),
    source: _pickFirst(body.source, "tts"),
    sourceId: _pickFirst(body.sourceId, body.requestId, ""),
    speechHints: _parseSpeechHints(body),
    pronunciationMap: body.pronunciationMap && typeof body.pronunciationMap === "object" ? body.pronunciationMap : null,
    speechChunks: Array.isArray(body.speechChunks) ? body.speechChunks.map(_trim).filter(Boolean).slice(0, 24) : []
  };
}

/* ===============================
   MAIN GENERATOR
================================ */

async function generate(text, options){
  const opts = options && typeof options === "object" ? options : {};
  const fakeReq = { body: { text, ...opts }, headers: { "x-sb-trace-id": opts.traceId || _makeTrace() } };
  const input = _resolveInput(fakeReq);

  if (!input.text) return { ok:false, reason:"empty_text", status:400 };
  if (activeRequests >= MAX_CONCURRENT) return { ok:false, reason:"concurrency_limit", status:429 };
  if (_circuitOpen()) return { ok:false, reason:"circuit_open", status:503 };

  const shaped = _shapeSpeechText(input.text, {
    speechHints: input.speechHints,
    pronunciationMap: input.pronunciationMap
  });

  const providerInput = {
    ...input,
    text: shaped.text,
    textDisplay: input.textDisplay || shaped.displayText,
    textSpeak: shaped.textSpeak,
    plainText: shaped.plainText,
    ssmlText: shaped.ssmlText,
    speechChunks: input.speechChunks && input.speechChunks.length ? input.speechChunks : shaped.segments,
    speechHints: shaped.speechHints,
    pronunciationMap: shaped.pronunciationMap,
    segmentCount: shaped.segmentCount,
    shapeElapsedMs: shaped.shapeElapsedMs
  };

  activeRequests += 1;
  try {
    const out = await synthesize(providerInput);
    if (!out || !out.ok) {
      _recordFailure(out && out.message ? out.message : out && out.reason, out && out.status);
      return {
        ok: false,
        reason: out && out.reason ? out.reason : "provider_failed",
        message: out && out.message ? out.message : "TTS failed",
        status: out && out.retryable === false ? 400 : (out && out.status) || 503,
        retryable: !!(out && out.retryable),
        provider: "resemble",
        shapeElapsedMs: shaped.shapeElapsedMs,
        segmentCount: shaped.segmentCount,
        textDisplay: providerInput.textDisplay,
        textSpeak: providerInput.textSpeak
      };
    }
    _recordSuccess(out.providerStatus, out.elapsedMs);
    return {
      ok: true,
      provider: "resemble",
      buffer: out.buffer,
      mimeType: out.mimeType || "audio/mpeg",
      elapsedMs: out.elapsedMs || 0,
      requestId: out.requestId,
      providerStatus: out.providerStatus || 200,
      shapeElapsedMs: shaped.shapeElapsedMs,
      segmentCount: shaped.segmentCount,
      textDisplay: providerInput.textDisplay,
      textSpeak: providerInput.textSpeak,
      ssmlText: providerInput.ssmlText,
      speechChunks: providerInput.speechChunks
    };
  } catch (err) {
    const msg = _trim(err && (err.message || err)) || "tts_exception";
    _recordFailure(msg, 503);
    return {
      ok:false,
      reason:"exception",
      message:msg,
      status:503,
      retryable:true,
      provider:"resemble",
      shapeElapsedMs: shaped.shapeElapsedMs,
      segmentCount: shaped.segmentCount,
      textDisplay: providerInput.textDisplay,
      textSpeak: providerInput.textSpeak
    };
  } finally {
    activeRequests -= 1;
  }
}

/* ===============================
   EXPRESS HANDLER
================================ */

async function handleTts(req, res){
  const input = _resolveInput(req);
  _setCommonAudioHeaders(res, input.traceId, { provider: "resemble", voiceUuid: input.voiceUuid });

  if (input.healthCheck) {
    return _safeJson(res, 200, {
      ok: true,
      provider: "resemble",
      health: _healthSnapshot(),
      traceId: input.traceId
    });
  }

  if (!input.text) {
    return _safeJson(res, 400, {
      ok: false,
      spokenUnavailable: true,
      error: "missing_text",
      detail: "No TTS text was provided.",
      traceId: input.traceId,
      payload: { spokenUnavailable: true }
    });
  }

  const result = await generate(input.text, input);
  _setCommonAudioHeaders(res, input.traceId, {
    provider: result.provider || "resemble",
    voiceUuid: input.voiceUuid,
    elapsedMs: result.elapsedMs || 0,
    shapeMs: result.shapeElapsedMs || 0,
    segmentCount: result.segmentCount || 0
  });

  if (!result.ok) {
    const status = result.status === 429 ? 429 : (result.status >= 400 && result.status < 500 ? result.status : 503);
    return _safeJson(res, status, {
      ok: false,
      spokenUnavailable: true,
      error: result.reason || "tts_unavailable",
      detail: result.message || "TTS unavailable.",
      retryable: !!result.retryable,
      traceId: input.traceId,
      provider: result.provider || "resemble",
      textDisplay: result.textDisplay || input.textDisplay || input.text,
      textSpeak: result.textSpeak || input.text,
      shapeElapsedMs: result.shapeElapsedMs || 0,
      segmentCount: result.segmentCount || 0,
      health: _healthSnapshot(),
      payload: { spokenUnavailable: true }
    });
  }

  if (input.wantJson) {
    return _safeJson(res, 200, {
      ok: true,
      provider: result.provider,
      mimeType: result.mimeType,
      audioBase64: result.buffer.toString("base64"),
      traceId: input.traceId,
      elapsedMs: result.elapsedMs || 0,
      requestId: result.requestId,
      textDisplay: result.textDisplay || input.textDisplay || input.text,
      textSpeak: result.textSpeak || input.text,
      speechChunks: result.speechChunks || [],
      shapeElapsedMs: result.shapeElapsedMs || 0,
      segmentCount: result.segmentCount || 0
    });
  }

  try {
    _setHeader(res, "Content-Type", result.mimeType || "audio/mpeg");
    _setHeader(res, "Content-Length", String(result.buffer.length));
    _setHeader(res, "Accept-Ranges", "none");
    res.status(200).send(result.buffer);
  } catch (e) {
    return _safeJson(res, 503, {
      ok: false,
      spokenUnavailable: true,
      error: "send_failed",
      detail: _trim(e && (e.message || e)) || "Failed to send audio buffer.",
      traceId: input.traceId,
      provider: result.provider || "resemble",
      payload: { spokenUnavailable: true }
    });
  }
}

/* ===============================
   HEALTH CHECK
================================ */

function health(){
  return _healthSnapshot();
}

/* ===============================
   EXPORT
================================ */

module.exports = {
  handleTts,
  ttsHandler: handleTts,
  handler: handleTts,
  generate,
  health
};
