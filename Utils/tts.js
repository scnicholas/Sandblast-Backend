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
  p20_structuredFailureSurface: true,
  p21_tokenPreflight: true,
  p22_retryBackoff: true,
  p23_recoveryClearSignal: true,
  p24_healthReadinessTruth: true
});

const TTS_VERSION = "tts.js v2.5.0 BACKEND-LOCK-AUTH-HARDENED";
const MAX_TEXT = 1800;
const MAX_CONCURRENT = Number(process.env.SB_TTS_MAX_CONCURRENT || 3);
const CIRCUIT_LIMIT = Number(process.env.SB_TTS_CIRCUIT_LIMIT || 5);
const CIRCUIT_RESET_MS = Number(process.env.SB_TTS_CIRCUIT_RESET_MS || 30000);
const LOG_PREVIEW_MAX = Number(process.env.SB_TTS_LOG_PREVIEW_MAX || 160);
const LOG_ENABLED = !["0", "false", "off", "no"].includes(String(process.env.SB_TTS_LOG_ENABLED || "true").toLowerCase());
const PROVIDER_TIMEOUT_MS = Math.max(1000, Number(process.env.SB_TTS_PROVIDER_TIMEOUT_MS || process.env.SB_RESEMBLE_TIMEOUT_MS || process.env.RESEMBLE_TIMEOUT_MS || 20000));
const TOKEN_ENV_KEYS = Object.freeze([
  "RESEMBLE_API_TOKEN",
  "SB_RESEMBLE_API_TOKEN",
  "RESEMBLE_API_KEY",
  "SB_RESEMBLE_API_KEY"
]);
const VOICE_LOCK_ENV_KEYS = Object.freeze([
  "RESEMBLE_VOICE_UUID",
  "SB_RESEMBLE_VOICE_UUID",
  "SBNYX_RESEMBLE_VOICE_UUID",
  "MIXER_VOICE_ID",
  "RESEMBLE_VOICE_ID",
  "NYX_VOICE_ID",
  "TTS_VOICE_ID"
]);

const VOICE_NAME_ENV_KEYS = Object.freeze([
  "MIXER_VOICE_NAME",
  "NYX_VOICE_NAME",
  "TTS_VOICE_NAME"
]);


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

const STRICT_VOICE_LOCK = !["0", "false", "off", "no"].includes(String(process.env.SB_TTS_STRICT_VOICE_LOCK || "true").toLowerCase());

function _looksLikeShortVoiceId(value) {
  return /^[0-9a-f]{8}$/i.test(_trim(value));
}

function _looksLikeVoiceIdentifier(value) {
  return _looksLikeUuid(value) || _looksLikeShortVoiceId(value);
}

function _extractVoiceUuidCandidate() {
  for (let i = 0; i < arguments.length; i += 1) {
    const candidate = arguments[i];
    if (candidate == null) continue;
    if (typeof candidate === "string") {
      const v = _trim(candidate);
      if (v) return v;
      continue;
    }
    if (typeof candidate === "object") {
      const nested = _pickFirst(
        candidate.voice_uuid,
        candidate.voiceUuid,
        candidate.voiceId,
        candidate.voice,
        candidate.resembleVoiceUuid,
        candidate.mixerVoiceUuid,
        candidate.uuid,
        candidate.id
      );
      if (nested) return nested;
    }
  }
  return "";
}

function _voiceSelectionSource(requestedVoiceUuid, resolvedVoiceUuid) {
  if (_trim(requestedVoiceUuid) && _trim(resolvedVoiceUuid)) return "request";
  if (!_trim(requestedVoiceUuid) && _trim(resolvedVoiceUuid)) return "lock";
  return "missing";
}

function _voiceContract(input) {
  const integrity = _voiceIntegrityConfig();
  const requestedVoiceUuid = _trim(input && input.requestedVoiceUuid);
  const resolvedVoiceUuid = _trim(input && input.voiceUuid);
  const problems = [];

  if (!resolvedVoiceUuid) problems.push("missing_voice_uuid");
  if (requestedVoiceUuid && !_looksLikeVoiceIdentifier(requestedVoiceUuid)) problems.push("invalid_requested_voice_uuid");
  if (resolvedVoiceUuid && !_looksLikeVoiceIdentifier(resolvedVoiceUuid)) problems.push("invalid_resolved_voice_uuid");
  if (STRICT_VOICE_LOCK && integrity.configured && integrity.conflictingKeys.length) problems.push("conflicting_locked_voice_env");
  if (STRICT_VOICE_LOCK && requestedVoiceUuid && integrity.voiceUuid && requestedVoiceUuid !== integrity.voiceUuid) {
    problems.push("voice_uuid_override_blocked");
  }

  return {
    ok: problems.length === 0,
    strict: STRICT_VOICE_LOCK,
    source: _voiceSelectionSource(requestedVoiceUuid, resolvedVoiceUuid),
    requestedVoiceUuid,
    resolvedVoiceUuid,
    problems,
    integrity
  };
}


function _bool(v, d) {
  if (v == null || v === "") return d;
  if (typeof v === "boolean") return v;
  const s = _lower(v);
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return d;
}
function _int(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function _headerSafe(value, max = 80) {
  return _str(value).replace(/[\r\n]+/g, " ").trim().slice(0, max);
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
  _setHeader(res, "X-SB-Trace-ID", _headerSafe(traceId, 120));
  _setHeader(res, "X-SB-TTS-Version", _headerSafe(TTS_VERSION, 120));
  if (meta && meta.provider) _setHeader(res, "X-SB-TTS-Provider", _headerSafe(meta.provider, 40));
  if (meta && meta.voiceUuid) _setHeader(res, "X-SB-Voice", _mask(meta.voiceUuid));
  if (meta && meta.voiceSource) _setHeader(res, "X-SB-Voice-Source", _headerSafe(meta.voiceSource, 40));
  if (meta && meta.voiceLock) _setHeader(res, "X-SB-Voice-Lock", _headerSafe(meta.voiceLock, 40));
  if (meta && Number.isFinite(meta.elapsedMs)) _setHeader(res, "X-SB-TTS-MS", String(_int(meta.elapsedMs, 0, 0, 300000)));
  if (meta && Number.isFinite(meta.shapeMs)) _setHeader(res, "X-SB-TTS-SHAPE-MS", String(_int(meta.shapeMs, 0, 0, 300000)));
  if (meta && Number.isFinite(meta.segmentCount)) _setHeader(res, "X-SB-TTS-SEGMENTS", String(_int(meta.segmentCount, 0, 0, 999)));
  if (meta && Number.isFinite(meta.providerStatus)) _setHeader(res, "X-SB-TTS-UPSTREAM-STATUS", String(_int(meta.providerStatus, 0, 0, 999)));
  if (meta && meta.reason) _setHeader(res, "X-SB-TTS-REASON", _headerSafe(meta.reason, 80));
  if (meta && meta.requestId) _setHeader(res, "X-SB-Request-ID", _headerSafe(meta.requestId, 80));
  if (meta && meta.turnId) _setHeader(res, "X-SB-Turn-ID", _headerSafe(meta.turnId, 80));
  if (meta && meta.sessionId) _setHeader(res, "X-SB-Session-ID", _headerSafe(meta.sessionId, 80));
}

const _circuitOpen = () => _now() < circuitOpenUntil;

function _resolveProviderToken() {
  return _pickFirst(...TOKEN_ENV_KEYS.map((key) => process.env[key]));
}

function _hasProviderToken() {
  return !!_resolveProviderToken();
}

function _isRetryableStatus(status) {
  const n = Number(status || 0) || 0;
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(n);
}

function _normalizeFailureContract(reason, message, status, retryable, input, extra) {
  const terminalStopUntil = retryable ? 0 : (_now() + 15000);
  return {
    ok: false,
    reason: reason || "tts_unavailable",
    message: message || "TTS unavailable.",
    status: Number(status || 503) || 503,
    retryable: !!retryable,
    provider: "resemble",
    providerStatus: Number(status || 503) || 503,
    voiceUuid: (extra && extra.voiceUuid) || (input && input.voiceUuid) || "",
    traceId: input && input.traceId || "",
    requestId: input && input.requestId || "",
    turnId: input && input.turnId || "",
    sessionId: input && input.sessionId || "",
    ttsFailure: {
      ok: false,
      action: retryable ? "retry" : "downgrade",
      reason: reason || "tts_unavailable",
      retryable: !!retryable,
      shouldStop: !retryable,
      shouldTerminate: !retryable,
      terminalStopUntil
    },
    audioFailure: {
      ok: false,
      action: retryable ? "retry" : "downgrade",
      reason: reason || "tts_unavailable",
      retryable: !!retryable,
      shouldStop: !retryable,
      shouldTerminate: !retryable,
      terminalStopUntil
    }
  };
}

function _normalizeRecoveryContract(input) {
  return {
    ok: true,
    action: "clear",
    reason: "tts_recovered",
    retryable: false,
    shouldStop: false,
    shouldTerminate: false,
    terminalStopUntil: 0,
    traceId: input && input.traceId || "",
    requestId: input && input.requestId || "",
    turnId: input && input.turnId || "",
    sessionId: input && input.sessionId || ""
  };
}

function _retryPlan() {
  return {
    maxAttempts: _int(process.env.SB_TTS_MAX_ATTEMPTS || 3, 3, 1, 5),
    baseDelayMs: _int(process.env.SB_TTS_RETRY_BASE_MS || 350, 350, 50, 5000),
    maxDelayMs: _int(process.env.SB_TTS_RETRY_MAX_MS || 1500, 1500, 100, 10000)
  };
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function _synthesizeWithRetry(providerInput, snapshot, shapeElapsedMs, segmentCount) {
  const plan = _retryPlan();
  let lastFailure = null;

  for (let attempt = 1; attempt <= plan.maxAttempts; attempt += 1) {
    try {
      _log("provider_attempt", { ...snapshot, attempt, maxAttempts: plan.maxAttempts, timeoutMs: PROVIDER_TIMEOUT_MS });
      const out = await _withTimeout(synthesize(providerInput), PROVIDER_TIMEOUT_MS, { ...snapshot, attempt });
      const normalizedOut = _normalizeProviderAudio(out);
      const retryable = normalizedOut.retryable !== false && _isRetryableStatus(normalizedOut.providerStatus);

      if (normalizedOut.ok) return { ok: true, out: normalizedOut, attempt };

      lastFailure = {
        ok: false,
        attempt,
        reason: normalizedOut.reason || "provider_failed",
        message: normalizedOut.message || "TTS failed",
        status: normalizedOut.providerStatus || 503,
        retryable,
        providerStatus: normalizedOut.providerStatus || 503,
        providerEndpoint: normalizedOut.providerEndpoint || "",
        authMode: normalizedOut.authMode || "",
        voiceUuid: normalizedOut.voiceUuid || providerInput.voiceUuid,
        shapeElapsedMs,
        segmentCount
      };

      if (!retryable || attempt >= plan.maxAttempts) return lastFailure;
      const delayMs = Math.min(plan.maxDelayMs, plan.baseDelayMs * Math.pow(2, attempt - 1));
      _log("provider_retry_wait", { ...snapshot, attempt, delayMs, reason: lastFailure.reason, providerStatus: lastFailure.providerStatus });
      await _sleep(delayMs);
    } catch (err) {
      const status = _int(err && err.status, 503, 400, 599);
      const retryable = typeof (err && err.retryable) === "boolean" ? !!err.retryable : _isRetryableStatus(status);
      const reason = err && err.code === "TTS_PROVIDER_TIMEOUT" ? "provider_timeout" : "exception";
      lastFailure = {
        ok: false,
        attempt,
        reason,
        message: _trim(err && (err.message || err)) || "tts_exception",
        status,
        retryable,
        providerStatus: status,
        providerEndpoint: "",
        authMode: "",
        voiceUuid: providerInput.voiceUuid,
        shapeElapsedMs,
        segmentCount
      };
      if (!retryable || attempt >= plan.maxAttempts) return lastFailure;
      const delayMs = Math.min(plan.maxDelayMs, plan.baseDelayMs * Math.pow(2, attempt - 1));
      _log("provider_retry_wait", { ...snapshot, attempt, delayMs, reason, providerStatus: status });
      await _sleep(delayMs);
    }
  }

  return lastFailure || { ok: false, reason: "provider_failed", message: "TTS failed", status: 503, retryable: true, providerStatus: 503, voiceUuid: providerInput.voiceUuid, shapeElapsedMs, segmentCount };
}

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

function _looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(_trim(value));
}

function _voiceIntegrityConfig() {
  const candidates = VOICE_LOCK_ENV_KEYS
    .map((key) => ({ key, value: _trim(process.env[key]) }))
    .filter((item) => item.value);

  const validCandidates = candidates.filter((item) => _looksLikeVoiceIdentifier(item.value));
  const uniqueValues = [...new Set(validCandidates.map((item) => item.value))];
  const authoritative = uniqueValues[0] || "";
  const conflictingKeys = uniqueValues.length > 1
    ? candidates.filter((item) => item.value && item.value !== authoritative).map((item) => item.key)
    : [];

  return {
    voiceUuid: authoritative,
    voiceName: _pickFirst(...VOICE_NAME_ENV_KEYS.map((key) => process.env[key])),
    configuredKeys: candidates.map((item) => item.key),
    conflictingKeys,
    configured: !!authoritative,
    valid: !!authoritative && conflictingKeys.length === 0 && _looksLikeVoiceIdentifier(authoritative),
    strict: STRICT_VOICE_LOCK
  };
}

function _resolvePreferredVoice(inputVoice) {
  const requested = _trim(inputVoice);
  const integrity = _voiceIntegrityConfig();
  const locked = integrity.voiceUuid;

  if (!locked) return requested;

  if (requested && requested !== locked) {
    _log("voice_override_blocked", {
      requestedVoiceUuid: _mask(requested),
      lockedVoiceUuid: _mask(locked),
      configuredKeys: integrity.configuredKeys,
      conflictingKeys: integrity.conflictingKeys
    });
  }

  return locked;
}

function _resolvePreferredVoiceName(inputName) {
  const lockedName = _trim(_voiceIntegrityConfig().voiceName);
  return lockedName || _trim(inputName);
}

function _useProjectUuidByDefault() {
  return _bool(_pickFirst(process.env.RESEMBLE_USE_PROJECT_UUID, process.env.SB_RESEMBLE_USE_PROJECT_UUID), false);
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
  const integrity = _voiceIntegrityConfig();
  const voiceUuid = integrity.voiceUuid;
  const voiceName = _resolvePreferredVoiceName("");
  const projectUuid = _resolveProjectUuid("");
  const token = _resolveProviderToken();
  const configured = !!(token && voiceUuid);
  const ready = configured && integrity.valid && !_circuitOpen() && activeRequests < MAX_CONCURRENT;
  return {
    ok: ready,
    configured,
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
      projectUuidPreview: projectUuid ? _mask(projectUuid) : "",
      providerTimeoutMs: PROVIDER_TIMEOUT_MS,
      strictVoiceLock: STRICT_VOICE_LOCK,
      tokenEnvKeysDetected: TOKEN_ENV_KEYS.filter((key) => !!_trim(process.env[key]))
    },
    voiceIntegrity: {
      configured: integrity.configured,
      valid: integrity.valid,
      configuredKeys: integrity.configuredKeys,
      conflictingKeys: integrity.conflictingKeys,
      lockedVoiceUuid: voiceUuid ? _mask(voiceUuid) : "",
      lockedVoiceName: voiceName || ""
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

async function _withTimeout(promise, ms, meta) {
  let timer = null;
  const timeoutMs = _int(ms, PROVIDER_TIMEOUT_MS, 1000, 120000);
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`provider_timeout_${timeoutMs}ms`);
          err.code = "TTS_PROVIDER_TIMEOUT";
          err.status = 504;
          err.retryable = true;
          err.meta = meta || {};
          reject(err);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function _normalizeProviderAudio(out) {
  const buffer = _coerceBuffer(out && (out.buffer || out.audio || out.audioBuffer || out.audioBase64 || out.base64 || out.data));
  const providerStatus = Number(out && (out.providerStatus || out.status || 200)) || 200;
  const explicitOk = out && typeof out.ok === "boolean" ? out.ok : null;
  const inferredOk = !!(buffer && buffer.length && providerStatus >= 200 && providerStatus < 300);
  return {
    ok: explicitOk == null ? inferredOk : !!(explicitOk && buffer && buffer.length),
    buffer,
    mimeType: _pickFirst(out && out.mimeType, out && out.contentType, out && out.content_type, "audio/mpeg"),
    elapsedMs: _int(out && (out.elapsedMs || out.durationMs || 0), 0, 0, 300000),
    requestId: _pickFirst(out && out.requestId, out && out.id),
    providerStatus,
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

  if (!input.text) return _normalizeFailureContract("empty_text", "No TTS text was provided.", 400, false, input);
  if (!_hasProviderToken()) {
    _log("generate_reject_missing_token", snapshot);
    return _normalizeFailureContract("missing_token", "No provider token is configured.", 503, false, input);
  }
  const voiceContract = _voiceContract(input);
  if (!voiceContract.ok) {
    _log("generate_reject_voice_contract", { ...snapshot, voiceProblems: voiceContract.problems, voiceSource: voiceContract.source });
    return _normalizeFailureContract("voice_contract_failed", `Voice lock rejected request: ${voiceContract.problems.join(", ") || "unknown_voice_issue"}`, 503, false, input, { voiceUuid: input.voiceUuid });
  }
  if (!input.voiceUuid) {
    _log("generate_reject_missing_voice", snapshot);
    return _normalizeFailureContract("missing_voice", "No Mixer or provider voice is configured.", 503, false, input);
  }
  if (activeRequests >= MAX_CONCURRENT) {
    _log("generate_reject_concurrency_limit", { ...snapshot, activeRequests, maxConcurrent: MAX_CONCURRENT });
    return _normalizeFailureContract("concurrency_limit", "TTS is busy right now.", 429, true, input);
  }
  if (_circuitOpen()) {
    _log("generate_reject_circuit_open", { ...snapshot, circuitOpenUntil });
    return _normalizeFailureContract("circuit_open", "TTS is temporarily cooling down.", 503, true, input);
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
    _log("provider_request", { ...snapshot, activeRequests, provider: "resemble", shapeElapsedMs: shaped.shapeElapsedMs, segmentCount: shaped.segmentCount, timeoutMs: PROVIDER_TIMEOUT_MS });
    const providerResult = await _synthesizeWithRetry(providerInput, snapshot, shaped.shapeElapsedMs, shaped.segmentCount);

    if (!providerResult.ok) {
      _recordFailure(providerResult.message || providerResult.reason || "provider_failed", providerResult.providerStatus || providerResult.status || 503, snapshot);
      return {
        ..._normalizeFailureContract(providerResult.reason || "provider_failed", providerResult.message || "TTS failed", providerResult.status || providerResult.providerStatus || 503, !!providerResult.retryable, input, { voiceUuid: providerResult.voiceUuid || input.voiceUuid }),
        providerEndpoint: providerResult.providerEndpoint || "",
        authMode: providerResult.authMode || "",
        shapeElapsedMs: shaped.shapeElapsedMs,
        segmentCount: shaped.segmentCount,
        textDisplay: providerInput.textDisplay,
        textSpeak: providerInput.textSpeak
      };
    }

    const normalizedOut = providerResult.out;
    _log("provider_response", {
      ...snapshot,
      ok: !!normalizedOut.ok,
      providerStatus: normalizedOut.providerStatus || 0,
      reason: normalizedOut.reason || "",
      authMode: normalizedOut.authMode || "",
      providerEndpoint: normalizedOut.providerEndpoint || "",
      bytes: normalizedOut.buffer ? normalizedOut.buffer.length : 0,
      elapsedMs: normalizedOut.elapsedMs || 0,
      attempt: providerResult.attempt || 1
    });

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
      sessionId: input.sessionId,
      ttsFailure: _normalizeRecoveryContract(input),
      audioFailure: _normalizeRecoveryContract(input)
    };
  } catch (err) {
    const msg = _trim(err && (err.message || err)) || "tts_exception";
    const status = _int(err && err.status, 503, 400, 599);
    const retryable = typeof (err && err.retryable) === "boolean" ? !!err.retryable : _isRetryableStatus(status);
    const reason = err && err.code === "TTS_PROVIDER_TIMEOUT" ? "provider_timeout" : "exception";
    _log("provider_exception", { ...snapshot, message: msg, status, retryable, elapsedMs: _now() - startedAt });
    _recordFailure(msg, status, snapshot);
    return {
      ..._normalizeFailureContract(reason, msg, status, retryable, input),
      shapeElapsedMs: shaped.shapeElapsedMs,
      segmentCount: shaped.segmentCount,
      textDisplay: providerInput.textDisplay,
      textSpeak: providerInput.textSpeak
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

  const requestedVoiceUuid = _extractVoiceUuidCandidate(
    body.voice_uuid, body.voiceUuid, body.voiceId, body.voice,
    body.resembleVoiceUuid, body.mixerVoiceUuid, body.voiceConfig, body.voiceConfig && body.voiceConfig.voice,
    headers["x-sb-voice"], headers["x-voice-uuid"]
  );
  const voiceUuid = _resolvePreferredVoice(requestedVoiceUuid);

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
    requestedVoiceUuid: _trim(requestedVoiceUuid),
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

  const requestedVoiceUuid = _extractVoiceUuidCandidate(
    body.voice_uuid, body.voiceUuid, body.voiceId, body.voice,
    body.resembleVoiceUuid, body.mixerVoiceUuid, body.voiceConfig, body.voiceConfig && body.voiceConfig.voice,
    query.voice_uuid, query.voiceUuid, query.voiceId, query.voice,
    query.resembleVoiceUuid, query.mixerVoiceUuid,
    headers["x-sb-voice"], headers["x-voice-uuid"]
  );
  const voiceUuid = _resolvePreferredVoice(requestedVoiceUuid);

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
    requestedVoiceUuid: _trim(requestedVoiceUuid),
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
  const contract = _voiceContract(src);
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
    requestedVoiceUuid: _mask(src.requestedVoiceUuid || ""),
    voiceUuid: _mask(src.voiceUuid || ""),
    voiceSource: contract.source,
    voiceStrict: contract.strict,
    voiceProblems: contract.problems,
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
      ..._normalizeFailureContract("missing_text", "No TTS text was provided.", 400, false, input),
      provider: input.provider || "resemble",
      mime: "audio/mpeg",
      text: input.textDisplay || input.text || ""
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
      ..._normalizeFailureContract(result.reason || "tts_unavailable", result.message || "TTS unavailable.", result.status || result.providerStatus || 503, !!result.retryable, input, { voiceUuid: result.voiceUuid || input.voiceUuid }),
      provider: result.provider || "resemble",
      providerStatus: result.status || result.providerStatus || 503,
      providerEndpoint: result.providerEndpoint || "",
      authMode: result.authMode || "",
      mime: "audio/mpeg",
      text: result.textDisplay || input.textDisplay || input.text,
      textSpeak: result.textSpeak || input.text
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
    sessionId: result.sessionId || input.sessionId,
    ttsFailure: result.ttsFailure || _normalizeRecoveryContract(input),
    audioFailure: result.audioFailure || _normalizeRecoveryContract(input)
  };
}

async function handleTts(req, res) {
  const input = _resolveInput(req);
  const startedAt = _now();
  const snapshot = _buildInputSnapshot(input);

  _setCommonAudioHeaders(res, input.traceId, {
    provider: "resemble",
    voiceUuid: input.voiceUuid,
    voiceSource: _voiceSelectionSource(input.requestedVoiceUuid, input.voiceUuid),
    voiceLock: _voiceIntegrityConfig().configured ? "backend" : "request",
    requestId: input.requestId,
    turnId: input.turnId,
    sessionId: input.sessionId
  });

  _log("http_start", { ...snapshot, method: req && req.method, path: req && req.originalUrl });

  if (input.healthCheck) {
    const health = _healthSnapshot();
    return _safeJson(res, health.ok ? 200 : 503, {
      ok: health.ok,
      provider: "resemble",
      health,
      traceId: input.traceId
    });
  }

  const voiceContract = _voiceContract(input);
  if (!voiceContract.ok) {
    return _safeJson(res, 503, {
      ok: false,
      spokenUnavailable: true,
      error: "voice_contract_failed",
      detail: `Voice lock rejected request: ${voiceContract.problems.join(", ") || "unknown_voice_issue"}`,
      traceId: input.traceId,
      requestId: input.requestId || "",
      turnId: input.turnId || "",
      sessionId: input.sessionId || "",
      voiceUuid: input.voiceUuid || "",
      requestedVoiceUuid: input.requestedVoiceUuid || "",
      voiceSource: voiceContract.source,
      voiceProblems: voiceContract.problems,
      health: _healthSnapshot(),
      ttsFailure: _normalizeFailureContract("voice_contract_failed", "Voice lock rejected request.", 503, false, input, { voiceUuid: input.voiceUuid }).ttsFailure,
      audioFailure: _normalizeFailureContract("voice_contract_failed", "Voice lock rejected request.", 503, false, input, { voiceUuid: input.voiceUuid }).audioFailure,
      payload: { spokenUnavailable: true }
    });
  }

  if (!input.text) {
    return _safeJson(res, 400, {
      ok: false,
      spokenUnavailable: true,
      error: "missing_text",
      detail: "No TTS text was provided.",
      traceId: input.traceId,
      ttsFailure: _normalizeFailureContract("missing_text", "No TTS text was provided.", 400, false, input).ttsFailure,
      audioFailure: _normalizeFailureContract("missing_text", "No TTS text was provided.", 400, false, input).audioFailure,
      payload: { spokenUnavailable: true }
    });
  }

  const result = await generate(input.text, input);
  _setCommonAudioHeaders(res, input.traceId, {
    provider: result.provider || "resemble",
    voiceUuid: result.voiceUuid || input.voiceUuid,
    voiceSource: _voiceSelectionSource(input.requestedVoiceUuid, result.voiceUuid || input.voiceUuid),
    voiceLock: _voiceIntegrityConfig().configured ? "backend" : "request",
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
      ttsFailure: result.ttsFailure || _normalizeFailureContract(result.reason || "tts_unavailable", result.message || "TTS unavailable.", status, !!result.retryable, input).ttsFailure,
      audioFailure: result.audioFailure || _normalizeFailureContract(result.reason || "tts_unavailable", result.message || "TTS unavailable.", status, !!result.retryable, input).audioFailure,
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
      sessionId: result.sessionId || input.sessionId || "",
      ttsFailure: result.ttsFailure || _normalizeRecoveryContract(input),
      audioFailure: result.audioFailure || _normalizeRecoveryContract(input)
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
  handle: delegateTts,
  synthesize: delegateTts,
  tts: delegateTts,
  generate,
  health,
  PHASES,
  TTS_VERSION,
  VERSION: TTS_VERSION,
  version: TTS_VERSION
};
module.exports.default = module.exports;
