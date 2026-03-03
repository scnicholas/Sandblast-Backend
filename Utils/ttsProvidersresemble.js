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
 *
 * Exports:
 *   synthesize({ text, voiceUuid, projectUuid, title, outputFormat, model, useHd, sampleRate, timeoutMs, traceId })
 */

'use strict';

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
  if (f === "mp3") return "audio/mpeg";
  if (f === "wav") return "audio/wav";
  return "application/octet-stream";
}

function _safeJsonParse(txt) {
  try { return JSON.parse(txt); } catch { return null; }
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
    process.env.RESEMBLE_API_TOKEN ||
    process.env.RESEMBLE_API_KEY ||
    ""
  ).toString().trim();
}

function _getVoiceUuid(opts) {
  const v = opts.voiceUuid || process.env.RESEMBLE_VOICE_UUID || process.env.RESEMBLE_VOICE_UUID || "";
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
    return {
      ok: true,
      status: res.status,
      rawText,
      elapsedMs: _now() - started,
    };
  } catch (err) {
    const isAbort = err && (err.name === "AbortError" || String(err.message || "").toLowerCase().includes("aborted"));
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

  const endpoint = opts.endpoint || DEFAULT_ENDPOINT;
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
        elapsedMs: _now() - started,
      };
    }

    // Success → decode audio
    const audioContent = body && typeof body === "object" ? body.audio_content : null;
    const fmt = (body && typeof body === "object" && body.output_format) ? body.output_format : outputFormat;

    if (!audioContent || typeof audioContent !== "string") {
      // Not a vendor-down case; likely API shape change or misconfig
      return {
        ok: false,
        reason: "bad_response",
        message: "Resemble returned success but no audio_content.",
        detail: body,
        elapsedMs: _now() - started,
      };
    }

    let buffer;
    try {
      buffer = Buffer.from(audioContent, "base64");
    } catch (e) {
      return {
        ok: false,
        reason: "bad_response",
        message: "Failed to decode Resemble audio_content base64.",
        detail: e?.message || String(e),
        elapsedMs: _now() - started,
      };
    }

    // Success clears cooldown state
    _clearVendorDown();

    return {
      ok: true,
      buffer,
      mimeType: _mimeForFormat(fmt),
      format: fmt,
      duration: (body && typeof body === "object" && typeof body.duration === "number") ? body.duration : undefined,
      sampleRate: (body && typeof body === "object" && typeof body.sample_rate === "number") ? body.sample_rate : undefined,
      elapsedMs: _now() - started,
      providerMeta: {
        provider: "resemble",
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
  synthesize,
};
