"use strict";

const crypto = require("crypto");
const { synthesize } = require("./ttsProvidersResemble");

const PHASES = Object.freeze({
  p01_contractSafe: true,
  p02_resembleUnified: true,
  p03_concurrencyGate: true,
  p04_circuitBreaker: true,
  p05_failOpenHealth: true,
  p06_inputNormalization: true,
  p07_speechShaping: true,
  p08_pronunciationMap: true,
  p09_payloadHardening: true,
  p10_bufferCoercion: true,
  p11_headerTelemetry: true,
  p12_jsonAudioMode: true,
  p13_introParity: true,
  p14_retrySignal: true,
  p15_operationalDiagnostics: true,
  p16_projectUuidGuard: true,
  p17_providerErrorPassThrough: true,
  p18_traceCorrelation: true,
  p19_safeSnapshots: true,
  p20_structuredFailureSurface: true
});

const TTS_VERSION = "tts.js v2.2.0 HARDENED";
const MAX_TEXT = 1800;
const MAX_CONCURRENT = Number(process.env.SB_TTS_MAX_CONCURRENT || 3);
const CIRCUIT_LIMIT = Number(process.env.SB_TTS_CIRCUIT_LIMIT || 5);
const CIRCUIT_RESET_MS = Number(process.env.SB_TTS_CIRCUIT_RESET_MS || 30000);
const LOG_PREVIEW_MAX = Number(process.env.SB_TTS_LOG_PREVIEW_MAX || 160);
const LOG_ENABLED = !["0", "false", "off", "no"].includes(String(process.env.SB_TTS_LOG_ENABLED || "true").toLowerCase());

const DEFAULT_SPEECH_HINTS = Object.freeze({
  pauses: { commaMs: 110, periodMs: 300, questionMs: 340, exclaimMs: 320, colonMs: 180, semicolonMs: 220, ellipsisMs: 480 },
  pacing: { mode: "natural", preservePunctuation: true, sentenceBreath: true, noRunOns: true }
});

const DEFAULT_PRONUNCIATION_MAP = Object.freeze({
  Nyx: "Nix",
  Nix: "Nix",
  Sandblast: "Sand-blast",
  Roku: "Roh-koo",
  Marion: "Marry-in",
  AI: "A I",
  TTS: "T T S",
  TV: "T V"
});

let activeRequests = 0;
let failCount = 0;
let circuitOpenUntil = 0;
let lastError = "";
let lastOkAt = 0;
let lastFailAt = 0;
let lastProviderStatus = 0;
let lastElapsedMs = 0;

const _str = (v) => (v == null ? "" : String(v));
const _trim = (v) => _str(v).trim();
const _lower = (v) => _trim(v).toLowerCase();
const _now = () => Date.now();
const _makeTrace = () => `tts_${Date.now().toString(16)}_${crypto.randomBytes(4).toString("hex")}`;

function _bool(v, d) {
  if (v == null || v === "") return d;
  if (typeof v === "boolean") return v;
  const s = _lower(v);
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return d;
}

function _pickFirst() {
  for (let i = 0; i < arguments.length; i += 1) {
    const v = _trim(arguments[i]);
    if (v) return v;
  }
  return "";
}

function _safeJson(res, status, body) {
  if (!res || res.headersSent) return;
  try {
    res.status(status).json(body);
  } catch (_) {
    try {
      res.status(status).send(JSON.stringify(body));
    } catch (__ ) {}
  }
}

function _setHeader(res, k, v) {
  try {
    if (res && !res.headersSent) res.setHeader(k, v);
  } catch (_) {}
}

function _hash(value) {
  return crypto.createHash("sha1").update(_str(value)).digest("hex").slice(0, 12);
}

function _preview(value, max = LOG_PREVIEW_MAX) {
  const s = _str(value).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function _mask(value, left = 4, right = 3) {
  const s = _trim(value);
  if (!s) return "";
  if (s.length <= left + right) return s;
  return `${s.slice(0, left)}***${s.slice(-right)}`;
}

function _sanitizeLogData(data) {
  if (data == null) return data;
  if (Array.isArray(data)) return data.map(_sanitizeLogData);
  if (typeof data !== "object") return data;

  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const key = _lower(k);
    if (["token", "authorization", "api_key", "apikey", "resemble_api_token", "audio", "buffer", "audiobase64", "audiobuffer", "data"].includes(key)) {
      continue;
    }
    if (key.includes("voiceuuid") || key.includes("projectuuid")) {
      out[k] = _mask(v);
      continue;
    }
    out[k] = _sanitizeLogData(v);
  }
  return out;
}

function _log(event, data) {
  if (!LOG_ENABLED) return;
  try {
    console.log(`[TTS] ${event}`, _sanitizeLogData(data));
  } catch (_) {}
}

function _setCommonAudioHeaders(res, traceId, meta) {
  _setHeader(res, "Cache-Control", "no-store, max-age=0");
  _setHeader(res, "X-SB-Trace-ID", traceId);
  _setHeader(res, "X-SB-TTS-Version", TTS_VERSION);
  if (meta && meta.provider) _setHeader(res, "X-SB-TTS-Provider", meta.provider);
  if (meta && meta.voiceUuid) _setHeader(res, "X-SB-Voice", meta.voiceUuid);
  if (meta && Number.isFinite(meta.elapsedMs)) _setHeader(res, "X-SB-TTS-MS", String(meta.elapsedMs));
  if (meta && Number.isFinite(meta.shapeMs)) _setHeader(res, "X-SB-TTS-SHAPE-MS", String(meta.shapeMs));
  if (meta && Number.isFinite(meta.segmentCount)) _setHeader(res, "X-SB-TTS-SEGMENTS", String(meta.segmentCount));
  if (meta && Number.isFinite(meta.providerStatus)) _setHeader(res, "X-SB-TTS-UPSTREAM-STATUS", String(meta.providerStatus));
  if (meta && meta.reason) _setHeader(res, "X-SB-TTS-REASON", String(meta.reason).slice(0, 80));
  if (meta && meta.requestId) _setHeader(res, "X-SB-Request-ID", String(meta.requestId).slice(0, 80));
  if (meta && meta.turnId) _setHeader(res, "X-SB-Turn-ID", String(meta.turnId).slice(0, 80));
  if (meta && meta.sessionId) _setHeader(res, "X-SB-Session-ID", String(meta.sessionId).slice(0, 80));
}

const _circuitOpen = () => _now() < circuitOpenUntil;

function _recordFailure(message, status, meta) {
  failCount += 1;
  lastError = _trim(message) || "tts_failed";
  lastFailAt = _now();
  lastProviderStatus = Number(status || 0) || 0;
  _log("failure_recorded", {
    failCount, status: lastProviderStatus, message: lastError,
    traceId: meta && meta.traceId, requestId: meta && meta.requestId, turnId: meta && meta.turnId, sessionId: meta && meta.sessionId
  });
  if (failCount >= CIRCUIT_LIMIT) {
    circuitOpenUntil = _now() + CIRCUIT_RESET_MS;
    try {
      console.warn("[TTS] Circuit breaker OPEN", { failCount, resetInMs: CIRCUIT_RESET_MS, traceId: meta && meta.traceId });
    } catch (_) {}
  }
}

function _recordSuccess(status, elapsedMs, meta) {
  failCount = 0;
  circuitOpenUntil = 0;
  lastError = "";
  lastOkAt = _now();
  lastProviderStatus = Number(status || 200) || 200;
  lastElapsedMs = Number(elapsedMs || 0) || 0;
  _log("success_recorded", {
    status: lastProviderStatus, elapsedMs: lastElapsedMs,
    traceId: meta && meta.traceId, requestId: meta && meta.requestId, turnId: meta && meta.turnId, sessionId: meta && meta.sessionId
  });
}

function _resolvePreferredVoice(inputVoice) {
  return _pickFirst(
    inputVoice,
    process.env.MIXER_VOICE_ID,
    process.env.RESEMBLE_VOICE_UUID,
    process.env.SB_RESEMBLE_VOICE_UUID,
    process.env.SBNYX_RESEMBLE_VOICE_UUID,
    process.env.RESEMBLE_VOICE_ID,
    process.env.NYX_VOICE_ID,
    process.env.TTS_VOICE_ID
  );
}

function _resolvePreferredVoiceName(inputName) {
  return _pickFirst(
    inputName,
    process.env.MIXER_VOICE_NAME,
    process.env.NYX_VOICE_NAME,
    process.env.TTS_VOICE_NAME
  );
}

function _useProjectUuidByDefault() {
  return _bool(process.env.RESEMBLE_USE_PROJECT_UUID, false);
}

function _resolveProjectUuid(explicitValue) {
  const explicit = _trim(explicitValue);
  if (explicit) return explicit;
  if (_useProjectUuidByDefault()) {
    return _pickFirst(process.env.RESEMBLE_PROJECT_UUID, process.env.SB_RESEMBLE_PROJECT_UUID);
  }
  return "";
}

function _healthSnapshot() {
  const voiceUuid = _resolvePreferredVoice("");
  const voiceName = _resolvePreferredVoiceName("");
  const projectUuid = _resolveProjectUuid("");
  const token = _pickFirst(process.env.RESEMBLE_API_TOKEN, process.env.RESEMBLE_API_KEY);
  return {
    ok: !!(token && voiceUuid),
    provider: "resemble",
    phases: PHASES,
    version: TTS_VERSION,
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
      useProjectUuidByDefault: _useProjectUuidByDefault(),
      voiceUuidPreview: voiceUuid ? _mask(voiceUuid) : "",
      voiceName: voiceName || "",
      projectUuidPreview: projectUuid ? _mask(projectUuid) : ""
    }
  };
}

function _mergePronunciationMap(extra) {
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

function _parseSpeechHints(body) {
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

function _normalizeWhitespace(text) {
  return _str(text)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(\S)/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\. {0,}\.{0,}\.{4,}/g, "...")
    .replace(/\.\.\.+/g, "...")
    .trim();
}

function _expandContractions(text) {
  let out = _str(text);
  const replacements = [
    [/\bI'm\b/gi, "I am"], [/\bI've\b/gi, "I have"], [/\bI'll\b/gi, "I will"], [/\bI'd\b/gi, "I would"],
    [/\bYou're\b/gi, "You are"], [/\bYou've\b/gi, "You have"], [/\bYou'll\b/gi, "You will"], [/\bYou'd\b/gi, "You would"],
    [/\bWe're\b/gi, "We are"], [/\bWe've\b/gi, "We have"], [/\bWe'll\b/gi, "We will"], [/\bWe'd\b/gi, "We would"],
    [/\bThey're\b/gi, "They are"], [/\bThey've\b/gi, "They have"], [/\bThey'll\b/gi, "They will"], [/\bThey'd\b/gi, "They would"],
    [/\bIt's\b/gi, "It is"], [/\bThat’s\b/gi, "That is"], [/\bThat's\b/gi, "That is"], [/\bThere's\b/gi, "There is"],
    [/\bHere’s\b/gi, "Here is"], [/\bHere's\b/gi, "Here is"], [/\bWhat's\b/gi, "What is"], [/\bWho’s\b/gi, "Who is"],
    [/\bWho's\b/gi, "Who is"], [/\bWhere’s\b/gi, "Where is"], [/\bWhere's\b/gi, "Where is"], [/\bWhen’s\b/gi, "When is"],
    [/\bWhen's\b/gi, "When is"], [/\bWhy’s\b/gi, "Why is"], [/\bWhy's\b/gi, "Why is"], [/\bHow’s\b/gi, "How is"],
    [/\bHow's\b/gi, "How is"], [/\bCannot\b/gi, "Cannot"], [/\bcan't\b/gi, "cannot"], [/\bwon't\b/gi, "will not"],
    [/\bdon't\b/gi, "do not"], [/\bdoesn't\b/gi, "does not"], [/\bdidn't\b/gi, "did not"], [/\bisn't\b/gi, "is not"],
    [/\baren't\b/gi, "are not"], [/\bwasn't\b/gi, "was not"], [/\bweren't\b/gi, "were not"], [/\bhaven't\b/gi, "have not"],
    [/\bhasn't\b/gi, "has not"], [/\bhadn't\b/gi, "had not"], [/\bwouldn't\b/gi, "would not"], [/\bshouldn't\b/gi, "should not"],
    [/\bcouldn't\b/gi, "could not"], [/\bmustn't\b/gi, "must not"], [/\bneedn't\b/gi, "need not"], [/\blet's\b/gi, "let us"],
    [/\bit'd\b/gi, "it would"], [/\bit'll\b/gi, "it will"], [/\bthey're\b/gi, "they are"], [/\bwe're\b/gi, "we are"],
    [/\byou're\b/gi, "you are"]
  ];
  replacements.forEach(([pattern, replacement]) => {
    out = out.replace(pattern, replacement);
  });
  return out;
}

function _applyPronunciationMap(text, pronunciationMap) {
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

function _applySpeakOptimizations(text) {
  let out = _str(text);
  out = out
    .replace(/\bI will help\b/gi, "I can help")
    .replace(/\bI will guide you\b/gi, "I can guide you")
    .replace(/\bI will walk you through\b/gi, "I can walk you through");
  return out;
}

const _collapseJoiners = (text) => _str(text)
  .replace(/\s+,/g, ",")
  .replace(/\s+;/g, ";")
  .replace(/\s+:/g, ":")
  .replace(/\s+\./g, ".")
  .replace(/\s+\?/g, "?")
  .replace(/\s+!/g, "!");

function _repairRunOns(text) {
  let out = _str(text);
  out = out
    .replace(/,\s+(however|meanwhile|instead|nevertheless|nonetheless)\b/gi, ". $1")
    .replace(/\b(also|right|you know)\b\s*,\s*\b(also|right|you know)\b/gi, "$1")
    .replace(/\s{2,}/g, " ");
  return out;
}

function _splitLongSentence(sentence) {
  const s = _trim(sentence);
  if (!s) return [];
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 22) return [s];
  const match = /,\s+(because|while|which|that)\s+/i.exec(s);
  if (!match || typeof match.index !== "number") return [s];
  const left = _trim(s.slice(0, match.index));
  const right = _trim(s.slice(match.index + 2));
  if (!left || !right) return [s];
  return [left.replace(/[,:;]+$/g, "") + ".", right];
}

function _segmentSentences(text, speechHints) {
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
      split.forEach((part) => {
        if (_trim(part)) segments.push(_trim(part));
      });
    } else {
      segments.push(item);
    }
  }
  return segments;
}

function _pauseToken(ms) {
  const n = Math.max(0, Math.min(1500, Number(ms || 0) || 0));
  return n ? `<break time="${n}ms"/>` : "";
}

function _decorateSegment(segment, pauses) {
  let s = _trim(segment);
  if (!s) return "";
  s = s
    .replace(/,\s+and\s+I will\b/gi, ", and I will")
    .replace(/,\s+and\s+I can\b/gi, ", and I can")
    .replace(/,\s+and\s+we can\b/gi, ", and we can")
    .replace(/,\s+but\s+I\b/gi, ", but I")
    .replace(/,\s+or\s+I\b/gi, ", or I");

  s = s
    .replace(/\.\.\./g, `... ${_pauseToken(pauses.ellipsisMs)}`)
    .replace(/,\s*/g, `, ${_pauseToken(pauses.commaMs)}`)
    .replace(/;\s*/g, `; ${_pauseToken(pauses.semicolonMs)}`)
    .replace(/:\s*/g, `: ${_pauseToken(pauses.colonMs)}`)
    .replace(/\.\s*$/g, `. ${_pauseToken(pauses.periodMs)}`)
    .replace(/\?\s*$/g, `? ${_pauseToken(pauses.questionMs)}`)
    .replace(/!\s*$/g, `! ${_pauseToken(pauses.exclaimMs)}`);
  return s.trim();
}

const _stripMarkup = (text) => _str(text)
  .replace(/<break\s+time="\d+ms"\s*\/>/g, " ")
  .replace(/<\/?speak>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

function _shapeSpeechText(rawText, options) {
  const startedAt = _now();
  const speechHints = options && options.speechHints ? options.speechHints : DEFAULT_SPEECH_HINTS;
  const pronunciationMap = _mergePronunciationMap(options && options.pronunciationMap);

  const displayText = _normalizeWhitespace(rawText);
  const expandedText = _expandContractions(displayText);
  const speakBase = _applySpeakOptimizations(expandedText);
  const pronouncedText = _applyPronunciationMap(speakBase, pronunciationMap);
  const segments = _segmentSentences(pronouncedText, speechHints);
  const ssmlSegments = segments.map((segment) => _decorateSegment(segment, speechHints.pauses)).filter(Boolean);
  const joinPause = _pauseToken(Math.max(120, Math.floor((speechHints.pauses.periodMs || 320) * 0.65)));
  const ssmlText = ssmlSegments.length
    ? `<speak>${ssmlSegments.join(joinPause)}</speak>`
    : `<speak>${_decorateSegment(pronouncedText, speechHints.pauses)}</speak>`;

  return {
    rawText: _str(rawText),
    displayText,
    textSpeak: pronouncedText,
    text: pronouncedText,
    ssmlText,
    plainText: _stripMarkup(ssmlText),
    segments,
    segmentCount: segments.length,
    shapeElapsedMs: _now() - startedAt,
    speechHints,
    pronunciationMap
  };
}

function _coerceBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) {
    try { return Buffer.from(value); } catch (_) { return null; }
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    if (/^data:audio\//i.test(s)) {
      const idx = s.indexOf(",");
      if (idx > -1) {
        try { return Buffer.from(s.slice(idx + 1), "base64"); } catch (_) { return null; }
      }
    }
    const b64ish = /^[A-Za-z0-9+/=\r\n]+$/.test(s) && (s.length % 4 === 0 || s.includes("="));
    if (b64ish) {
      try {
        const out = Buffer.from(s.replace(/\s+/g, ""), "base64");
        if (out && out.length) return out;
      } catch (_) {}
    }
    try { return Buffer.from(s, "binary"); } catch (_) { return null; }
  }
  if (typeof value === "object") {
    if (value.type === "Buffer" && Array.isArray(value.data)) {
      try { return Buffer.from(value.data); } catch (_) { return null; }
    }
    return _coerceBuffer(value.buffer || value.audio || value.audioBuffer || value.audioBase64 || value.base64 || value.data);
  }
  return null;
}

function _normalizeProviderAudio(out) {
  const buffer = _coerceBuffer(out && (out.buffer || out.audio || out.audioBuffer || out.audioBase64 || out.base64 || out.data));
  return {
    ok: !!(out && out.ok && buffer && buffer.length),
    buffer,
    mimeType: _pickFirst(out && out.mimeType, out && out.contentType, out && out.content_type, "audio/mpeg"),
    elapsedMs: Number(out && (out.elapsedMs || out.durationMs || 0)) || 0,
    requestId: _pickFirst(out && out.requestId, out && out.id),
    providerStatus: Number(out && (out.providerStatus || out.status || 200)) || 200,
    message: _pickFirst(out && out.message, out && out.reason, out && out.error),
    reason: _pickFirst(out && out.reason, out && out.error, out && out.message),
    retryable: out && typeof out.retryable === "boolean" ? out.retryable : true,
    authMode: _pickFirst(out && out.authMode),
    providerEndpoint: _pickFirst(out && out.providerEndpoint),
    voiceUuid: _pickFirst(out && out.voiceUuid)
  };
}

async function generate(text, options) {
  const opts = options && typeof options === "object" ? options : {};
  const input = _normalizePayloadLikeInput({ text, ...opts }, { headers: { "x-sb-trace-id": opts.traceId || _makeTrace() } });
  const snapshot = _buildInputSnapshot(input);
  const startedAt = _now();

  _log("generate_start", { ...snapshot, activeRequests, circuitOpen: _circuitOpen(), failCount });

  if (!input.text) return { ok: false, reason: "empty_text", status: 400, retryable: false };
  if (!input.voiceUuid) {
    _log("generate_reject_missing_voice", snapshot);
    return { ok: false, reason: "missing_voice", message: "No Mixer or provider voice is configured.", status: 503, retryable: false };
  }
  if (activeRequests >= MAX_CONCURRENT) {
    _log("generate_reject_concurrency_limit", { ...snapshot, activeRequests, maxConcurrent: MAX_CONCURRENT });
    return { ok: false, reason: "concurrency_limit", status: 429, retryable: true };
  }
  if (_circuitOpen()) {
    _log("generate_reject_circuit_open", { ...snapshot, circuitOpenUntil });
    return { ok: false, reason: "circuit_open", status: 503, retryable: true };
  }

  const shaped = _shapeSpeechText(input.text, { speechHints: input.speechHints, pronunciationMap: input.pronunciationMap });

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

  _log("generate_shaped", {
    ...snapshot,
    shapeElapsedMs: shaped.shapeElapsedMs,
    segmentCount: shaped.segmentCount,
    speakHash: _hash(providerInput.textSpeak || ""),
    speakPreview: _preview(providerInput.textSpeak || "")
  });

  activeRequests += 1;
  try {
    _log("provider_request", { ...snapshot, activeRequests, provider: "resemble", shapeElapsedMs: shaped.shapeElapsedMs, segmentCount: shaped.segmentCount });
    const out = await synthesize(providerInput);
    const normalizedOut = _normalizeProviderAudio(out);

    _log("provider_response", {
      ...snapshot,
      ok: !!normalizedOut.ok,
      providerStatus: normalizedOut.providerStatus || 0,
      reason: normalizedOut.reason || "",
      authMode: normalizedOut.authMode || "",
      providerEndpoint: normalizedOut.providerEndpoint || "",
      bytes: normalizedOut.buffer ? normalizedOut.buffer.length : 0,
      elapsedMs: normalizedOut.elapsedMs || 0
    });

    if (!normalizedOut.ok) {
      _recordFailure(normalizedOut.message || normalizedOut.reason || "provider_failed", normalizedOut.providerStatus || 503, snapshot);
      return {
        ok: false,
        reason: normalizedOut.reason || "provider_failed",
        message: normalizedOut.message || "TTS failed",
        status: normalizedOut.retryable === false ? 400 : (normalizedOut.providerStatus || 503),
        retryable: !!normalizedOut.retryable,
        provider: "resemble",
        providerStatus: normalizedOut.providerStatus || 503,
        providerEndpoint: normalizedOut.providerEndpoint || "",
        authMode: normalizedOut.authMode || "",
        shapeElapsedMs: shaped.shapeElapsedMs,
        segmentCount: shaped.segmentCount,
        textDisplay: providerInput.textDisplay,
        textSpeak: providerInput.textSpeak,
        voiceUuid: normalizedOut.voiceUuid || input.voiceUuid,
        traceId: input.traceId,
        requestId: input.requestId,
        turnId: input.turnId,
        sessionId: input.sessionId
      };
    }

    _recordSuccess(normalizedOut.providerStatus, normalizedOut.elapsedMs, snapshot);
    return {
      ok: true,
      provider: "resemble",
      buffer: normalizedOut.buffer,
      mimeType: normalizedOut.mimeType || "audio/mpeg",
      elapsedMs: normalizedOut.elapsedMs || 0,
      requestId: normalizedOut.requestId || input.requestId,
      providerStatus: normalizedOut.providerStatus || 200,
      providerEndpoint: normalizedOut.providerEndpoint || "",
      authMode: normalizedOut.authMode || "",
      shapeElapsedMs: shaped.shapeElapsedMs,
      segmentCount: shaped.segmentCount,
      textDisplay: providerInput.textDisplay,
      textSpeak: providerInput.textSpeak,
      ssmlText: providerInput.ssmlText,
      speechChunks: providerInput.speechChunks,
      voiceUuid: normalizedOut.voiceUuid || input.voiceUuid,
      traceId: input.traceId,
      turnId: input.turnId,
      sessionId: input.sessionId
    };
  } catch (err) {
    const msg = _trim(err && (err.message || err)) || "tts_exception";
    _log("provider_exception", { ...snapshot, message: msg, elapsedMs: _now() - startedAt });
    _recordFailure(msg, 503, snapshot);
    return {
      ok: false,
      reason: "exception",
      message: msg,
      status: 503,
      retryable: true,
      provider: "resemble",
      providerStatus: 503,
      shapeElapsedMs: shaped.shapeElapsedMs,
      segmentCount: shaped.segmentCount,
      textDisplay: providerInput.textDisplay,
      textSpeak: providerInput.textSpeak,
      voiceUuid: input.voiceUuid,
      traceId: input.traceId,
      requestId: input.requestId,
      turnId: input.turnId,
      sessionId: input.sessionId
    };
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
    _log("generate_complete", { ...snapshot, totalElapsedMs: _now() - startedAt, activeRequests });
  }
}

function _normalizePayloadLikeInput(payload, req) {
  const body = payload && typeof payload === "object" ? payload : {};
  const headers = req && req.headers && typeof req.headers === "object" ? req.headers : {};

  const text = _pickFirst(body.textSpeak, body.text, body.data, body.speak, body.say, body.message, body.prompt, body.textDisplay);

  const voiceUuid = _resolvePreferredVoice(_pickFirst(
    body.voice_uuid, body.voiceUuid, body.voiceId, body.voice, headers["x-sb-voice"], headers["x-voice-uuid"]
  ));

  const explicitProjectUuid = _pickFirst(
    body.project_uuid, body.projectUuid, headers["x-sb-project"], headers["x-project-uuid"]
  );
  const projectUuid = _resolveProjectUuid(explicitProjectUuid);

  const outputFormat = _lower(_pickFirst(body.output_format, body.outputFormat, body.format, headers["x-audio-format"], "mp3")) === "wav" ? "wav" : "mp3";
  const traceId = _pickFirst(headers["x-sb-trace-id"], body.traceId, body.requestId, _makeTrace());
  const requestId = _pickFirst(headers["x-sb-request-id"], body.requestId, body.sourceId, traceId);
  const turnId = _pickFirst(headers["x-sb-turn-id"], body.turnId, "");
  const sessionId = _pickFirst(headers["x-sb-session-id"], body.sessionId, body.sid, "");

  return {
    text: _trim(text).slice(0, MAX_TEXT),
    textDisplay: _trim(_pickFirst(body.textDisplay)).slice(0, MAX_TEXT),
    voiceUuid,
    voiceName: _resolvePreferredVoiceName(_pickFirst(body.voiceName, body.mixerVoiceName)),
    projectUuid,
    outputFormat,
    traceId,
    requestId,
    turnId,
    sessionId,
    title: _pickFirst(body.title, body.source, body.client && body.client.source, "nyx_tts").slice(0, 120),
    sampleRate: body.sampleRate || body.sample_rate,
    precision: body.precision,
    useHd: body.useHd,
    intro: _bool(body.intro, false) || _lower(body.routeKind) === "intro" || _lower(body.mode) === "intro",
    healthCheck: _bool(body.healthCheck, false),
    wantJson: _bool(body.returnJson, false),
    mode: _pickFirst(body.mode, "presence"),
    source: _pickFirst(body.source, "tts"),
    sourceId: _pickFirst(body.sourceId, body.requestId, ""),
    speechHints: _parseSpeechHints(body),
    pronunciationMap: body.pronunciationMap && typeof body.pronunciationMap === "object" ? body.pronunciationMap : null,
    speechChunks: Array.isArray(body.speechChunks) ? body.speechChunks.map(_trim).filter(Boolean).slice(0, 24) : [],
    preserveMixerVoice: _bool(body.preserveMixerVoice, true),
    provider: _pickFirst(body.provider, "resemble"),
    routeKind: _pickFirst(body.routeKind, body.mode, body.intro ? "intro" : "main"),
    rawBody: body
  };
}

function _resolveInput(req) {
  const body = req && req.body && typeof req.body === "object" ? req.body : {};
  const query = req && req.query && typeof req.query === "object" ? req.query : {};
  const params = req && req.params && typeof req.params === "object" ? req.params : {};
  const headers = req && req.headers && typeof req.headers === "object" ? req.headers : {};

  const text = _pickFirst(
    body.textSpeak, body.text, body.data, body.speak, body.say, body.message, body.prompt, body.textDisplay,
    query.text, query.speak, query.say, query.prompt, params.text
  );

  const voiceUuid = _resolvePreferredVoice(_pickFirst(
    body.voice_uuid, body.voiceUuid, body.voiceId, body.voice,
    query.voice_uuid, query.voiceUuid, query.voiceId, query.voice,
    headers["x-sb-voice"], headers["x-voice-uuid"]
  ));

  const explicitProjectUuid = _pickFirst(
    body.project_uuid, body.projectUuid, query.project_uuid, query.projectUuid, headers["x-sb-project"], headers["x-project-uuid"]
  );
  const projectUuid = _resolveProjectUuid(explicitProjectUuid);

  const outputFormat = _lower(_pickFirst(
    body.output_format, body.outputFormat, body.format, query.output_format, query.outputFormat, query.format, headers["x-audio-format"], "mp3"
  )) === "wav" ? "wav" : "mp3";

  const traceId = _pickFirst(headers["x-sb-trace-id"], headers["x-sb-traceid"], query.traceId, body.traceId, _makeTrace());
  const requestId = _pickFirst(headers["x-sb-request-id"], query.requestId, body.requestId, traceId);
  const turnId = _pickFirst(headers["x-sb-turn-id"], query.turnId, body.turnId, "");
  const sessionId = _pickFirst(headers["x-sb-session-id"], query.sessionId, body.sessionId, body.sid, query.sid, "");

  return {
    text: _trim(text).slice(0, MAX_TEXT),
    textDisplay: _trim(_pickFirst(body.textDisplay, query.textDisplay)).slice(0, MAX_TEXT),
    voiceUuid,
    voiceName: _resolvePreferredVoiceName(_pickFirst(body.voiceName, query.voiceName)),
    projectUuid,
    outputFormat,
    traceId,
    requestId,
    turnId,
    sessionId,
    title: _pickFirst(body.title, query.title, body.source, body.client && body.client.source, "nyx_tts").slice(0, 120),
    sampleRate: body.sampleRate || body.sample_rate || query.sampleRate || query.sample_rate,
    precision: body.precision || query.precision,
    useHd: body.useHd != null ? body.useHd : query.useHd,
    intro: _bool(body.intro != null ? body.intro : query.intro, false) || _lower(body.routeKind || query.routeKind) === "intro" || _lower(body.mode || query.mode) === "intro",
    healthCheck: _bool(body.healthCheck != null ? body.healthCheck : query.healthCheck, false),
    wantJson: _bool(body.returnJson != null ? body.returnJson : query.returnJson, false),
    mode: _pickFirst(body.mode, query.mode, "presence"),
    source: _pickFirst(body.source, query.source, "tts"),
    sourceId: _pickFirst(body.sourceId, query.sourceId, body.requestId, query.requestId, ""),
    speechHints: _parseSpeechHints({ ...query, ...body }),
    pronunciationMap: body.pronunciationMap && typeof body.pronunciationMap === "object"
      ? body.pronunciationMap
      : (query.pronunciationMap && typeof query.pronunciationMap === "object" ? query.pronunciationMap : null),
    speechChunks: Array.isArray(body.speechChunks)
      ? body.speechChunks.map(_trim).filter(Boolean).slice(0, 24)
      : (Array.isArray(query.speechChunks) ? query.speechChunks.map(_trim).filter(Boolean).slice(0, 24) : []),
    preserveMixerVoice: _bool(body.preserveMixerVoice != null ? body.preserveMixerVoice : query.preserveMixerVoice, true),
    provider: _pickFirst(body.provider, query.provider, "resemble"),
    routeKind: _pickFirst(body.routeKind, query.routeKind, body.intro || query.intro ? "intro" : "main")
  };
}

function _buildInputSnapshot(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    traceId: src.traceId || "",
    requestId: src.requestId || "",
    turnId: src.turnId || "",
    sessionId: src.sessionId || "",
    routeKind: src.routeKind || "",
    intro: !!src.intro,
    mode: src.mode || "",
    source: src.source || "",
    textLen: _str(src.text || "").length,
    textHash: _hash(src.text || ""),
    textPreview: _preview(src.textDisplay || src.text || ""),
    voiceUuid: _mask(src.voiceUuid || ""),
    projectUuid: _mask(src.projectUuid || ""),
    outputFormat: src.outputFormat || "",
    wantJson: !!src.wantJson
  };
}

async function delegateTts(payload, req) {
  const input = _normalizePayloadLikeInput(payload, req);
  const snapshot = _buildInputSnapshot(input);

  _log("delegate_start", snapshot);

  if (!input.text) {
    return {
      ok: false,
      provider: input.provider || "resemble",
      reason: "missing_text",
      message: "No TTS text was provided.",
      retryable: false,
      providerStatus: 400,
      mime: "audio/mpeg",
      text: input.textDisplay || input.text || "",
      voiceUuid: input.voiceUuid || "",
      traceId: input.traceId,
      requestId: input.requestId,
      turnId: input.turnId,
      sessionId: input.sessionId
    };
  }

  const result = await generate(input.text, input);

  if (!result.ok) {
    _log("delegate_failure", {
      ...snapshot,
      reason: result.reason || "",
      providerStatus: result.status || result.providerStatus || 503,
      authMode: result.authMode || "",
      providerEndpoint: result.providerEndpoint || ""
    });
    return {
      ok: false,
      provider: result.provider || "resemble",
      reason: result.reason || "tts_unavailable",
      message: result.message || "TTS unavailable.",
      retryable: !!result.retryable,
      providerStatus: result.status || result.providerStatus || 503,
      providerEndpoint: result.providerEndpoint || "",
      authMode: result.authMode || "",
      mime: "audio/mpeg",
      text: result.textDisplay || input.textDisplay || input.text,
      textSpeak: result.textSpeak || input.text,
      voiceUuid: result.voiceUuid || input.voiceUuid,
      traceId: result.traceId || input.traceId,
      requestId: result.requestId || input.requestId,
      turnId: result.turnId || input.turnId,
      sessionId: result.sessionId || input.sessionId
    };
  }

  _log("delegate_success", {
    ...snapshot,
    providerStatus: result.providerStatus || 200,
    elapsedMs: result.elapsedMs || 0,
    bytes: result.buffer ? result.buffer.length : 0
  });

  return {
    ok: true,
    provider: result.provider || "resemble",
    audio: result.buffer,
    mime: result.mimeType || "audio/mpeg",
    elapsedMs: result.elapsedMs || 0,
    requestId: result.requestId || input.sourceId || input.requestId || "",
    providerStatus: result.providerStatus || 200,
    providerEndpoint: result.providerEndpoint || "",
    authMode: result.authMode || "",
    text: result.textDisplay || input.textDisplay || input.text,
    textSpeak: result.textSpeak || input.text,
    voiceUuid: result.voiceUuid || input.voiceUuid,
    routeKind: input.routeKind || "main",
    traceId: result.traceId || input.traceId,
    turnId: result.turnId || input.turnId,
    sessionId: result.sessionId || input.sessionId
  };
}

async function handleTts(req, res) {
  const input = _resolveInput(req);
  const startedAt = _now();
  const snapshot = _buildInputSnapshot(input);

  _setCommonAudioHeaders(res, input.traceId, {
    provider: "resemble",
    voiceUuid: input.voiceUuid,
    requestId: input.requestId,
    turnId: input.turnId,
    sessionId: input.sessionId
  });

  _log("http_start", { ...snapshot, method: req && req.method, path: req && req.originalUrl });

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
    voiceUuid: result.voiceUuid || input.voiceUuid,
    elapsedMs: result.elapsedMs || 0,
    shapeMs: result.shapeElapsedMs || 0,
    segmentCount: result.segmentCount || 0,
    providerStatus: result.providerStatus || result.status || 0,
    reason: result.reason || "",
    requestId: result.requestId || input.requestId,
    turnId: result.turnId || input.turnId,
    sessionId: result.sessionId || input.sessionId
  });

  if (!result.ok) {
    const upstreamStatus = Number(result.providerStatus || result.status || 503) || 503;
    const status = result.status === 429 ? 429 : (result.status >= 400 && result.status < 500 ? result.status : 503);

    _log("http_failure", {
      ...snapshot,
      status,
      upstreamStatus,
      reason: result.reason || "",
      providerEndpoint: result.providerEndpoint || "",
      authMode: result.authMode || "",
      elapsedMs: _now() - startedAt
    });

    return _safeJson(res, status, {
      ok: false,
      spokenUnavailable: true,
      error: result.reason || "tts_unavailable",
      detail: result.message || "TTS unavailable.",
      retryable: !!result.retryable,
      traceId: input.traceId,
      provider: result.provider || "resemble",
      providerStatus: upstreamStatus,
      providerEndpoint: result.providerEndpoint || "",
      authMode: result.authMode || "",
      voiceUuid: result.voiceUuid || input.voiceUuid || "",
      textDisplay: result.textDisplay || input.textDisplay || input.text,
      textSpeak: result.textSpeak || input.text,
      shapeElapsedMs: result.shapeElapsedMs || 0,
      segmentCount: result.segmentCount || 0,
      requestId: result.requestId || input.requestId || "",
      turnId: result.turnId || input.turnId || "",
      sessionId: result.sessionId || input.sessionId || "",
      health: _healthSnapshot(),
      payload: { spokenUnavailable: true }
    });
  }

  if (input.wantJson) {
    _log("http_success_json", { ...snapshot, bytes: result.buffer ? result.buffer.length : 0, elapsedMs: _now() - startedAt });
    return _safeJson(res, 200, {
      ok: true,
      provider: result.provider,
      mimeType: result.mimeType,
      audioBase64: result.buffer.toString("base64"),
      traceId: input.traceId,
      elapsedMs: result.elapsedMs || 0,
      requestId: result.requestId,
      providerStatus: result.providerStatus || 200,
      providerEndpoint: result.providerEndpoint || "",
      authMode: result.authMode || "",
      textDisplay: result.textDisplay || input.textDisplay || input.text,
      textSpeak: result.textSpeak || input.text,
      speechChunks: result.speechChunks || [],
      shapeElapsedMs: result.shapeElapsedMs || 0,
      segmentCount: result.segmentCount || 0,
      voiceUuid: result.voiceUuid || input.voiceUuid || "",
      turnId: result.turnId || input.turnId || "",
      sessionId: result.sessionId || input.sessionId || ""
    });
  }

  try {
    _setHeader(res, "Content-Type", result.mimeType || "audio/mpeg");
    _setHeader(res, "Content-Length", String(result.buffer.length));
    _setHeader(res, "Accept-Ranges", "none");
    _log("http_success_audio", { ...snapshot, bytes: result.buffer.length, mimeType: result.mimeType || "audio/mpeg", elapsedMs: _now() - startedAt });
    res.status(200).send(result.buffer);
  } catch (e) {
    const detail = _trim(e && (e.message || e)) || "Failed to send audio buffer.";
    _log("http_send_failed", { ...snapshot, detail, elapsedMs: _now() - startedAt });
    return _safeJson(res, 503, {
      ok: false,
      spokenUnavailable: true,
      error: "send_failed",
      detail,
      traceId: input.traceId,
      provider: result.provider || "resemble",
      requestId: result.requestId || input.requestId || "",
      turnId: result.turnId || input.turnId || "",
      sessionId: result.sessionId || input.sessionId || "",
      payload: { spokenUnavailable: true }
    });
  }
}

const health = () => _healthSnapshot();

module.exports = {
  handleTts,
  delegateTts,
  ttsHandler: handleTts,
  handler: handleTts,
  generate,
  health,
  PHASES,
  TTS_VERSION
};
