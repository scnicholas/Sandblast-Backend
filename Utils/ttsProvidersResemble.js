"use strict";

/**
 * ttsProvidersresemble.js
 * Resemble AI TTS Provider (sync, hardened)
 *
 * Primary goal: keep Nyx/Nexus voice online with a stable contract + resilience layer.
 * - Provider-agnostic contract: { ok, buffer, mimeType, format, elapsedMs, reason?, retryable?, requestId? }
 * - Retry cap (1) on transient failures
 * - Cooldown vendor health mapping to prevent hammering when vendor is down/quota/auth fails
 * - Strict env validation (no placeholders)
 * - Binary-safe decoding (base64 -> Buffer)
 *
 * Endpoint:
 *   POST https://f.cluster.resemble.ai/synthesize
 * Response (success):
 *   { success: true, audio_content: "<base64>", output_format: "mp3"|"wav", sample_rate, duration, ... }
 * Response (error):
 *   { detail: { type, code, message, status, request_id } }
 *
 * Env vars expected (aliases supported):
 *   RESEMBLE_API_TOKEN        (required)  // Render: may be RESEMBLE_API_TOKEN or RESEMBLE_API_KEY
 *   RESEMBLE_API_TOKEN       (alias; supported)
 *   RESEMBLE_API_KEY          (alias; supported)
 *
 *   RESEMBLE_VOICE_UUID       (required)  // Resemble voice UUID/UID from dashboard ("Copy UUID")
 *   RESEMBLE_VOICE_UUID      (alias; supported)
 *
 * Optional:
 *   RESEMBLE_PROJECT_UUID     (optional)  // ignored if invalid
 *   RESEMBLE_MODEL            (optional)
 *   RESEMBLE_OUTPUT_FORMAT    (optional)  // "mp3" or "wav" (default: "mp3")
 *   RESEMBLE_USE_HD           (optional)  // "true"/"false"
 *   RESEMBLE_TIMEOUT_MS       (optional)  // default 15000
 *   RESEMBLE_HEALTH_COOLDOWN_MS (optional) // default 30000
 *   SB_TTS_RAW_RESPONSE_LOG (optional) // true enables pre-decode provider response logging
 *   SB_TTS_RAW_RESPONSE_LOG_MAX_CHARS (optional) // default 6000, max 20000
 *
 * Exports:
 *   synthesize({ text, voiceUuid, projectUuid, title, outputFormat, model, useHd, sampleRate, timeoutMs, traceId })
 */

'use strict';

const crypto = require("crypto");

const PROVIDER_VERSION = "ttsProvidersResemble v2.4.0 VERIFIED-DECODE + BINARY-SIGNATURE + ACTUAL-FORMAT-AUTHORITY";
const DEFAULT_ENDPOINT = "https://f.cluster.resemble.ai/synthesize";

// --- Fetch polyfill (Phase: Resilience Layer / runtime hardening)
let _fetch = globalThis.fetch;
if (typeof _fetch !== "function") {
  try {
    // node-fetch v3 is ESM; some stacks still ship v2 CJS. We'll try both patterns safely.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nf = require("node-fetch");
    _fetch = nf.default || nf;
  } catch (_) {
    // Leave undefined; we'll return a clean config/runtime error below.
  }
}

// --- Vendor health mapping (Phase: Resilience Layer)
const _vendorHealth = {
  downUntilMs: 0,
  reason: null,
  lastStatus: null,
};

function _now() { return Date.now(); }

function _boolEnv(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return def;
}

function _intEnv(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function _mimeForFormat(fmt) {
  const f = String(fmt || "").toLowerCase();
  if (f === "mp3" || f === "mpeg") return "audio/mpeg";
  if (f === "wav" || f === "wave") return "audio/wav";
  if (f === "ogg") return "audio/ogg";
  if (f === "flac") return "audio/flac";
  if (f === "webm") return "audio/webm";
  if (f === "mp4" || f === "m4a") return "audio/mp4";
  return "application/octet-stream";
}

function _detectAudioBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer.length >= 12 && buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WAVE") {
    return { mimeType: "audio/wav", format: "wav", signature: "RIFF/WAVE" };
  }
  if (buffer.length >= 4 && buffer.slice(0, 4).toString("ascii") === "OggS") {
    return { mimeType: "audio/ogg", format: "ogg", signature: "OggS" };
  }
  if (buffer.length >= 4 && buffer.slice(0, 4).toString("ascii") === "fLaC") {
    return { mimeType: "audio/flac", format: "flac", signature: "fLaC" };
  }
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mimeType: "audio/webm", format: "webm", signature: "EBML" };
  }
  if (buffer.length >= 12 && buffer.slice(4, 8).toString("ascii") === "ftyp") {
    return { mimeType: "audio/mp4", format: "mp4", signature: "ISO-BMFF" };
  }
  if (buffer.length >= 3 && buffer.slice(0, 3).toString("ascii") === "ID3") {
    return { mimeType: "audio/mpeg", format: "mp3", signature: "ID3" };
  }
  for (let i = 0; i < Math.min(buffer.length - 1, 128); i += 1) {
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) {
      return { mimeType: "audio/mpeg", format: "mp3", signature: "MPEG-FRAME" };
    }
  }
  return null;
}

function _decodeBase64Audio(value) {
  let raw = String(value == null ? "" : value).trim();
  const dataUri = /^data:audio\/[^;]+;base64,(.+)$/is.exec(raw);
  if (dataUri) raw = dataUri[1];
  raw = raw.replace(/\s+/g, "");
  const maxBytes = _clampInt(process.env.SB_TTS_MAX_AUDIO_BYTES, 25 * 1024 * 1024, 256 * 1024, 100 * 1024 * 1024);
  const maxChars = Math.ceil(maxBytes * 4 / 3) + 8;
  if (raw.length < 16 || raw.length > maxChars) {
    return { ok: false, reason: "base64_length_invalid", base64Length: raw.length, buffer: null };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return { ok: false, reason: "base64_charset_invalid", base64Length: raw.length, buffer: null };
  }
  try {
    const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);
    const buffer = Buffer.from(padded, "base64");
    if (!buffer.length || buffer.length > maxBytes) {
      return { ok: false, reason: "decoded_length_invalid", base64Length: raw.length, buffer: null };
    }
    return { ok: true, reason: "", base64Length: raw.length, buffer };
  } catch (err) {
    return {
      ok: false,
      reason: "base64_decode_exception",
      base64Length: raw.length,
      buffer: null,
      error: String(err && (err.message || err) || "decode_failed").slice(0, 220)
    };
  }
}

function _logDecodedAudio({ traceId, status, requestedFormat, declaredFormat, decoded, detected }) {
  if (!_rawResponseLogEnabled() && !_boolEnv(process.env.SB_TTS_LOG_JSON, false)) return;
  try {
    console.log("[TTS_AUDIO_DECODE]", JSON.stringify({
      event: "resemble_audio_content_decoded",
      providerVersion: PROVIDER_VERSION,
      traceId: String(traceId || "").slice(0, 96),
      status: Number(status) || 0,
      requestedFormat: String(requestedFormat || "").slice(0, 24),
      declaredFormat: String(declaredFormat || "").slice(0, 24),
      base64Length: decoded && decoded.base64Length || 0,
      bytes: decoded && decoded.buffer ? decoded.buffer.length : 0,
      decodeOk: !!(decoded && decoded.ok),
      decodeReason: decoded && decoded.reason || "",
      signature: detected && detected.signature || "",
      actualFormat: detected && detected.format || "",
      mimeType: detected && detected.mimeType || "",
      bufferSha256: decoded && decoded.buffer ? crypto.createHash("sha256").update(decoded.buffer).digest("hex") : ""
    }));
  } catch (_) {}
}

function _safeJsonParse(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}

function _clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function _rawResponseLogEnabled() {
  return _boolEnv(process.env.SB_TTS_RAW_RESPONSE_LOG, false);
}

function _rawResponseLogMaxChars() {
  return _clampInt(process.env.SB_TTS_RAW_RESPONSE_LOG_MAX_CHARS, 6000, 512, 20000);
}

function _sha256Text(value) {
  return crypto.createHash("sha256").update(String(value == null ? "" : value), "utf8").digest("hex");
}

function _safeHeaderValue(headers, name) {
  try {
    if (!headers) return "";
    if (typeof headers.get === "function") return String(headers.get(name) || "");
    const direct = headers[name] || headers[String(name).toLowerCase()] || headers[String(name).toUpperCase()];
    return direct == null ? "" : String(direct);
  } catch (_) {
    return "";
  }
}

function _safeResponseHeaderSnapshot(headers) {
  const allowed = [
    "content-type", "content-length", "date", "server",
    "x-request-id", "request-id", "retry-after",
    "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"
  ];
  const out = {};
  for (const name of allowed) {
    const value = _safeHeaderValue(headers, name);
    if (value) out[name] = value.slice(0, 240);
  }
  return out;
}

function _redactAudioPayloadFields(rawText) {
  const raw = String(rawText == null ? "" : rawText);
  let audioFieldsRedacted = 0;
  const text = raw.replace(
    /("(?:audio_content|audio_base64|audioContent|audioBase64)"\s*:\s*")([^"]*)(")/gi,
    (_match, prefix, value, suffix) => {
      audioFieldsRedacted += 1;
      return `${prefix}[REDACTED_AUDIO_BASE64 chars=${value.length} sha256=${_sha256Text(value)}]${suffix}`;
    }
  );
  return { text, audioFieldsRedacted };
}

function _safeEndpointLabel(endpoint) {
  try {
    const url = new URL(String(endpoint || DEFAULT_ENDPOINT));
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch (_) {
    return "resemble_synthesize";
  }
}

function _logRawProviderResponse({ response, rawText, traceId, endpoint, elapsedMs, error }) {
  if (!_rawResponseLogEnabled()) return;
  try {
    const raw = String(rawText == null ? "" : rawText);
    const redacted = _redactAudioPayloadFields(raw);
    const limit = _rawResponseLogMaxChars();
    const preview = redacted.text.slice(0, limit);
    const status = response && Number.isFinite(Number(response.status)) ? Number(response.status) : 0;
    const event = {
      event: "resemble_raw_response_predecode",
      providerVersion: PROVIDER_VERSION,
      traceId: String(traceId || "").slice(0, 96),
      endpoint: _safeEndpointLabel(endpoint),
      status,
      statusText: response && response.statusText ? String(response.statusText).slice(0, 120) : "",
      elapsedMs: Math.max(0, Number(elapsedMs) || 0),
      headers: _safeResponseHeaderSnapshot(response && response.headers),
      rawLength: raw.length,
      rawSha256: _sha256Text(raw),
      previewTruncated: redacted.text.length > limit,
      audioFieldsRedacted: redacted.audioFieldsRedacted,
      rawPreview: preview,
      error: error ? String(error).slice(0, 300) : ""
    };
    console.log("[TTS_RAW_PROVIDER_RESPONSE]", JSON.stringify(event));
  } catch (logError) {
    try {
      console.log("[TTS_RAW_PROVIDER_RESPONSE]", JSON.stringify({
        event: "resemble_raw_response_log_failed",
        traceId: String(traceId || "").slice(0, 96),
        error: String(logError && (logError.message || logError) || "log_failed").slice(0, 240)
      }));
    } catch (_) {}
  }
}

function _looksLikeUid(v) {
  const s = String(v || "").trim();
  if (!s) return false;

  const low = s.toLowerCase();
  if (
    low === "..." ||
    low.includes("your_voice") ||
    low.includes("your_project") ||
    low.includes("replace") ||
    low.includes("placeholder")
  ) return false;

  // Resemble UI shows short hex IDs in some places (e.g. 5dc633cb) — accept those too.
  const isUuidish = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const isDigits = /^\d+$/.test(s);
  const isShortHex = /^[0-9a-f]{8}$/i.test(s);

  return isUuidish || isDigits || isShortHex;
}

function _extractDetailObj(bodyObjOrText) {
  if (!bodyObjOrText || typeof bodyObjOrText !== "object") return null;
  if (bodyObjOrText.detail && typeof bodyObjOrText.detail === "object") return bodyObjOrText.detail;
  return null;
}

function _classifyResembleError(status, bodyObjOrText) {
  const detailObj = _extractDetailObj(bodyObjOrText);
  const statusStr = detailObj && typeof detailObj.status === "string" ? detailObj.status : null;

  const text = typeof bodyObjOrText === "string" ? bodyObjOrText : JSON.stringify(bodyObjOrText || {});
  const lower = text.toLowerCase();

  if (status === 400 && (statusStr === "invalid_uid" || lower.includes("invalid_uid") || lower.includes("invalid id"))) {
    return { reason: "invalid_uid", retryable: false, cooldown: true };
  }

  if (status === 401 || lower.includes("unauthorized") || lower.includes("invalid token")) {
    return { reason: "auth_failed", retryable: false, cooldown: true };
  }

  if (status === 429 || lower.includes("rate limit")) {
    return { reason: "rate_limited", retryable: false, cooldown: true };
  }

  if (status >= 500) {
    return { reason: "vendor_5xx", retryable: true, cooldown: true };
  }

  if (status === 400) {
    return { reason: "bad_request", retryable: false, cooldown: false };
  }

  return { reason: "vendor_error", retryable: status >= 500, cooldown: status >= 500 };
}

function _getToken() {
  return (
    process.env.RESEMBLE_API_TOKEN ||
    process.env.RESEMBLE_API_KEY ||
    process.env.SB_RESEMBLE_API_TOKEN ||
    process.env.SB_RESEMBLE_API_KEY ||
    process.env.NYX_RESEMBLE_API_TOKEN ||
    ""
  ).toString().trim();
}

function _getVoiceUuid(opts) {
  const v =
    opts.voiceUuid ||
    process.env.RESEMBLE_VOICE_UUID ||
    process.env.RESEMBLE_VOICE_ID ||
    process.env.SB_RESEMBLE_VOICE_UUID ||
    process.env.SB_TTS_VOICE_UUID ||
    "";
  return String(v).trim();
}

function _cooldownMs() {
  return _intEnv(process.env.RESEMBLE_HEALTH_COOLDOWN_MS, 30_000);
}

function _setVendorDown(reason, status) {
  _vendorHealth.reason = reason || "vendor_down";
  _vendorHealth.lastStatus = status || null;
  _vendorHealth.downUntilMs = _now() + _cooldownMs();
}

function _clearVendorDown() {
  _vendorHealth.reason = null;
  _vendorHealth.lastStatus = null;
  _vendorHealth.downUntilMs = 0;
}

function _isVendorDown() {
  return _vendorHealth.downUntilMs && _vendorHealth.downUntilMs > _now();
}

// Low-noise logger hook; caller can pass traceId
function _logDebug(_msg, _obj) {
  // Keep default silent to avoid leaking tokens; wire to your structured logger if desired.
  // Example:
  // if (process.env.DEBUG_TTS === "1") console.log(_msg, _obj);
}

async function _postSynthesize({ endpoint, token, payload, timeoutMs, traceId }) {
  if (typeof _fetch !== "function") {
    return {
      ok: false,
      reason: "runtime_missing_fetch",
      message: "Global fetch is unavailable. Use Node 18+ or install node-fetch.",
      elapsedMs: 0,
    };
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  const started = _now();
  let res;
  let rawText = "";
  try {
    res = await _fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(traceId ? { "X-SB-Trace-Id": String(traceId) } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    rawText = await res.text();
    const elapsedMs = _now() - started;

    // Diagnostic boundary: capture the exact provider response before JSON parsing
    // or audio_content/base64 decoding. Authorization and request headers are never logged.
    _logRawProviderResponse({ response: res, rawText, traceId, endpoint, elapsedMs });

    return {
      ok: true,
      status: res.status,
      statusText: res.statusText || "",
      headers: _safeResponseHeaderSnapshot(res.headers),
      rawText,
      rawLength: rawText.length,
      rawSha256: _sha256Text(rawText),
      elapsedMs,
    };
  } catch (err) {
    const isAbort = err && (err.name === "AbortError" || String(err.message || "").toLowerCase().includes("aborted"));
    _logRawProviderResponse({
      response: res,
      rawText,
      traceId,
      endpoint,
      elapsedMs: _now() - started,
      error: err && (err.message || err)
    });
    return {
      ok: false,
      reason: isAbort ? "timeout" : "network_error",
      message: isAbort ? "Resemble synthesis timed out." : "Resemble network error.",
      detail: err?.message || String(err),
      elapsedMs: _now() - started,
    };
  } finally {
    clearTimeout(t);
  }
}

async function synthesize(opts = {}) {
  const started = _now();

  // Phase: Vendor health mapping / cooldown
  if (_isVendorDown()) {
    return {
      ok: false,
      reason: "vendor_down",
      retryable: false,
      message: "Resemble temporarily marked down; skipping call (cooldown active).",
      vendor: { ..._vendorHealth },
      elapsedMs: _now() - started,
    };
  }

  const token = _getToken();
  const voiceUuid = _getVoiceUuid(opts);

  if (!token) {
    return {
      ok: false,
      reason: "config_missing",
      message: "Resemble token missing (set RESEMBLE_API_TOKEN or RESEMBLE_API_KEY).",
      elapsedMs: _now() - started,
    };
  }
  if (!voiceUuid) {
    return {
      ok: false,
      reason: "config_missing",
      message: "Resemble voice UUID missing (set RESEMBLE_VOICE_UUID).",
      elapsedMs: _now() - started,
    };
  }
  if (!_looksLikeUid(voiceUuid)) {
    _setVendorDown("invalid_uid", 400);
    return {
      ok: false,
      reason: "invalid_uid",
      retryable: false,
      message: "Invalid RESEMBLE_VOICE_UUID (placeholder/wrong format). Copy the voice UUID from Resemble (“Copy UUID”).",
      elapsedMs: _now() - started,
    };
  }

  const text = (opts.text ?? "").toString().trim();
  if (!text) {
    return {
      ok: false,
      reason: "bad_request",
      message: "No text provided for synthesis.",
      elapsedMs: _now() - started,
    };
  }

  // Guard: Resemble synth endpoint typical limits; keep explicit.
  if (text.length > 3000) {
    return {
      ok: false,
      reason: "bad_request",
      message: "Text too long for Resemble sync synthesize (max 3000 chars). Consider chunking on the caller side.",
      elapsedMs: _now() - started,
    };
  }

  const endpoint = opts.endpoint || process.env.RESEMBLE_SYNTH_URL || DEFAULT_ENDPOINT;
  const outputFormat = (opts.outputFormat || process.env.RESEMBLE_OUTPUT_FORMAT || "mp3").toString().toLowerCase();
  const model = (opts.model || process.env.RESEMBLE_MODEL || "").toString().trim() || undefined;

  // Optional project UUID (ignored if invalid, to avoid invalid_uid failures)
  const projectUuidRaw = (opts.projectUuid || process.env.RESEMBLE_PROJECT_UUID || "").toString().trim() || undefined;
  const projectUuid = projectUuidRaw && _looksLikeUid(projectUuidRaw) ? projectUuidRaw : undefined;

  const title = (opts.title || "").toString().trim() || undefined;
  const useHd = typeof opts.useHd === "boolean" ? opts.useHd : _boolEnv(process.env.RESEMBLE_USE_HD, false);
  const sampleRate = (opts.sampleRate != null && opts.sampleRate !== "") ? Number(opts.sampleRate) : undefined;
  const timeoutMs = (opts.timeoutMs != null) ? Number(opts.timeoutMs) : _intEnv(process.env.RESEMBLE_TIMEOUT_MS, 15000);

  const payload = {
    voice_uuid: String(voiceUuid),
    data: text,
    output_format: outputFormat,
    ...(projectUuid ? { project_uuid: projectUuid } : {}),
    ...(title ? { title } : {}),
    ...(model ? { model } : {}),
    ...(typeof sampleRate === "number" && Number.isFinite(sampleRate) ? { sample_rate: sampleRate } : {}),
    ...(typeof useHd === "boolean" ? { use_hd: useHd } : {}),
  };

  // Phase: Retry with cap (1) for transient issues only
  const maxAttempts = 2;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await _postSynthesize({
      endpoint,
      token,
      payload,
      timeoutMs,
      traceId: opts.traceId,
    });

    if (!r.ok) {
      // network/timeout
      lastErr = r;
      const retryable = r.reason === "network_error" || r.reason === "timeout";
      if (!retryable || attempt === maxAttempts) {
        _setVendorDown(r.reason, null);
        return {
          ok: false,
          reason: r.reason,
          retryable: false,
          message: r.message || "Resemble request failed.",
          detail: r.detail,
          elapsedMs: _now() - started,
        };
      }
      continue; // retry
    }

    // HTTP response
    const body = _safeJsonParse(r.rawText) ?? r.rawText;

    if (r.status < 200 || r.status >= 300) {
      const cls = _classifyResembleError(r.status, body);
      const detailObj = typeof body === "object" ? _extractDetailObj(body) : null;

      _logDebug("Resemble TTS error", { attempt, status: r.status, cls, traceId: opts.traceId });

      if (cls.cooldown) _setVendorDown(cls.reason, r.status);

      // Only retry vendor_5xx once
      if (cls.retryable && attempt < maxAttempts) {
        lastErr = { status: r.status, body, cls };
        continue;
      }

      return {
        ok: false,
        status: r.status,
        reason: cls.reason,
        retryable: cls.retryable,
        message: cls.reason === "invalid_uid"
          ? "Resemble rejected an ID (voice_uuid/project_uuid). Confirm RESEMBLE_VOICE_UUID (and RESEMBLE_PROJECT_UUID if set)."
          : "Resemble synthesis failed.",
        detail: body,
        requestId: detailObj && typeof detailObj.request_id === "string" ? detailObj.request_id : undefined,
        rawResponse: {
          status: r.status,
          contentType: r.headers && r.headers["content-type"] || "",
          length: r.rawLength || 0,
          sha256: r.rawSha256 || ""
        },
        elapsedMs: _now() - started,
      };
    }

    // Success → decode and verify audio before returning it to the route layer.
    const audioContainer = body && typeof body === "object"
      ? (body.audio_content || body.audioContent || (body.data && (body.data.audio_content || body.data.audioContent)))
      : null;
    const declaredFormat = body && typeof body === "object" && body.output_format
      ? String(body.output_format).toLowerCase()
      : outputFormat;

    if (!audioContainer || typeof audioContainer !== "string") {
      return {
        ok: false,
        status: r.status,
        traceId: opts.traceId,
        reason: "audio_content_missing",
        retryable: false,
        message: "Resemble returned HTTP success but no audio_content.",
        issues: body && typeof body === "object" && Array.isArray(body.issues) ? body.issues.slice(0, 8) : undefined,
        rawResponse: {
          status: r.status,
          contentType: r.headers && r.headers["content-type"] || "",
          length: r.rawLength || 0,
          sha256: r.rawSha256 || ""
        },
        elapsedMs: _now() - started,
      };
    }

    const decoded = _decodeBase64Audio(audioContainer);
    const detected = decoded.ok ? _detectAudioBuffer(decoded.buffer) : null;
    _logDecodedAudio({
      traceId: opts.traceId,
      status: r.status,
      requestedFormat: outputFormat,
      declaredFormat,
      decoded,
      detected
    });

    if (!decoded.ok || !decoded.buffer) {
      return {
        ok: false,
        status: r.status,
        traceId: opts.traceId,
        reason: decoded.reason || "audio_base64_decode_failed",
        retryable: false,
        message: "Resemble audio_content could not be decoded as bounded base64 audio.",
        base64Length: decoded.base64Length || 0,
        detail: decoded.error || "",
        rawResponse: {
          status: r.status,
          contentType: r.headers && r.headers["content-type"] || "",
          length: r.rawLength || 0,
          sha256: r.rawSha256 || ""
        },
        elapsedMs: _now() - started,
      };
    }

    if (!detected) {
      return {
        ok: false,
        status: r.status,
        traceId: opts.traceId,
        reason: "audio_signature_invalid",
        retryable: false,
        message: "Resemble audio_content decoded, but the bytes did not contain a recognized audio signature.",
        bytes: decoded.buffer.length,
        declaredFormat,
        requestedFormat: outputFormat,
        rawResponse: {
          status: r.status,
          contentType: r.headers && r.headers["content-type"] || "",
          length: r.rawLength || 0,
          sha256: r.rawSha256 || ""
        },
        elapsedMs: _now() - started,
      };
    }

    const declaredMimeType = _mimeForFormat(declaredFormat);
    const formatMismatch =
      (declaredMimeType !== "application/octet-stream" && declaredMimeType !== detected.mimeType) ||
      (declaredFormat && declaredFormat !== detected.format);

    _clearVendorDown();

    return {
      ok: true,
      status: r.status,
      traceId: opts.traceId,
      buffer: decoded.buffer,
      mimeType: detected.mimeType,
      format: detected.format,
      signature: detected.signature,
      declaredFormat,
      declaredMimeType,
      requestedFormat: outputFormat,
      formatMismatch,
      duration: (body && typeof body === "object" && typeof body.duration === "number") ? body.duration : undefined,
      sampleRate: (body && typeof body === "object" && typeof body.sample_rate === "number") ? body.sample_rate : undefined,
      rawResponse: {
        status: r.status,
        contentType: r.headers && r.headers["content-type"] || "",
        length: r.rawLength || 0,
        sha256: r.rawSha256 || ""
      },
      elapsedMs: _now() - started,
      providerMeta: {
        provider: "resemble",
        providerVersion: PROVIDER_VERSION,
        endpoint,
        model: model || null,
        useHd,
        projectUuid: projectUuid || null,
        voiceUuid: String(voiceUuid),
      },
    };
  }

  // Should never reach here
  return {
    ok: false,
    reason: "unknown_error",
    message: "Resemble synthesis failed (unknown).",
    detail: lastErr,
    elapsedMs: _now() - started,
  };
}

module.exports = {
  PROVIDER_VERSION,
  synthesize,
  _detectAudioBuffer,
  _decodeBase64Audio,
};

/* =========================================================
   Compatibility exports
   - Some callers import { synthesize } = require(...)
   - Others import provider.default or provider.synthesize
   ========================================================= */
module.exports = Object.assign(module.exports || {}, {
  PROVIDER_VERSION,
  synthesize,
  _detectAudioBuffer,
  _decodeBase64Audio,
  default: { PROVIDER_VERSION, synthesize, _detectAudioBuffer, _decodeBase64Audio }
});
