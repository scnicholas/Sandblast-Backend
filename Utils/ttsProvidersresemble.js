/**
 * providersResemble.js
 * Resemble AI TTS Provider (sync)
 *
 * Uses Resemble's synchronous synthesize endpoint:
 *   POST https://f.cluster.resemble.ai/synthesize
 * Returns JSON with base64 audio_content (wav/mp3).
 *
 * Env vars expected:
 *   RESEMBLE_API_TOKEN        (required)
 *   RESEMBLE_VOICE_UUID       (required)  // MUST be a real Resemble voice UUID / UID (not a placeholder)
 *   RESEMBLE_PROJECT_UUID     (optional)  // MUST be a real project UUID / UID (optional; will be ignored if invalid)
 *   RESEMBLE_MODEL            (optional)
 *   RESEMBLE_OUTPUT_FORMAT    (optional)  // "mp3" or "wav" (default: "mp3")
 *   RESEMBLE_USE_HD           (optional)  // "true"/"false"
 *   RESEMBLE_TIMEOUT_MS       (optional)  // default 15000
 *
 * Exports:
 *   synthesize({ text, voiceUuid, projectUuid, title, outputFormat, model, useHd, sampleRate, timeoutMs })
 *     -> { ok, buffer, mimeType, format, duration, sampleRate, providerMeta }
 */

const DEFAULT_ENDPOINT = "https://f.cluster.resemble.ai/synthesize";

function _boolEnv(v, def = false) {
  if (v == null) return def;
  const s = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return def;
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

/**
 * Resemble “UID” formats vary by surface. We accept:
 * - UUID-like strings (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx), OR
 * - digits-only IDs (some accounts/objects)
 * We ALSO explicitly reject placeholders commonly left in env files.
 */
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

  const isUuidish = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const isDigits = /^\d+$/.test(s);
  return isUuidish || isDigits;
}

function _extractDetailObj(bodyObjOrText) {
  if (!bodyObjOrText || typeof bodyObjOrText !== "object") return null;
  // Many Resemble errors look like: { detail: { ... } }
  if (bodyObjOrText.detail && typeof bodyObjOrText.detail === "object") return bodyObjOrText.detail;
  return null;
}

function _classifyResembleError(status, bodyObjOrText) {
  // Normalize into a stable reason + retryability.
  const detailObj = _extractDetailObj(bodyObjOrText);
  const code = detailObj && typeof detailObj.code === "string" ? detailObj.code : null;
  const statusStr = detailObj && typeof detailObj.status === "string" ? detailObj.status : null;

  const text = typeof bodyObjOrText === "string" ? bodyObjOrText : JSON.stringify(bodyObjOrText || {});
  const lower = text.toLowerCase();

  // Invalid IDs (what you're hitting): invalid_uid
  if (status === 400 && (statusStr === "invalid_uid" || lower.includes("invalid_uid") || lower.includes("invalid id"))) {
    return { reason: "invalid_uid", retryable: false };
  }

  if (status === 401 || lower.includes("unauthorized") || lower.includes("invalid token")) {
    return { reason: "auth_failed", retryable: false };
  }

  if (status === 429 || lower.includes("rate limit")) {
    return { reason: "rate_limited", retryable: true };
  }

  if (status >= 500) {
    return { reason: "vendor_5xx", retryable: true };
  }

  if (status === 400) {
    return { reason: "bad_request", retryable: false };
  }

  return { reason: "vendor_error", retryable: status >= 500 };
}

async function synthesize(opts = {}) {
  const started = Date.now();

  const token = process.env.RESEMBLE_API_TOKEN;
  const voiceUuid = opts.voiceUuid || process.env.RESEMBLE_VOICE_UUID;

  if (!token) {
    return {
      ok: false,
      reason: "config_missing",
      message: "Resemble token missing (RESEMBLE_API_TOKEN).",
      elapsedMs: Date.now() - started,
    };
  }
  if (!voiceUuid) {
    return {
      ok: false,
      reason: "config_missing",
      message: "Resemble voice UUID missing (RESEMBLE_VOICE_UUID).",
      elapsedMs: Date.now() - started,
    };
  }
  if (!_looksLikeUid(voiceUuid)) {
    return {
      ok: false,
      reason: "config_missing",
      message: "Invalid RESEMBLE_VOICE_UUID (looks like a placeholder or wrong format). Set it to a real Resemble voice UID/UUID from your dashboard.",
      elapsedMs: Date.now() - started,
    };
  }

  const text = (opts.text ?? "").toString().trim();
  if (!text) {
    return {
      ok: false,
      reason: "bad_request",
      message: "No text provided for synthesis.",
      elapsedMs: Date.now() - started,
    };
  }
  if (text.length > 3000) {
    return {
      ok: false,
      reason: "bad_request",
      message: "Text too long for Resemble sync synthesize (max 3000 chars).",
      elapsedMs: Date.now() - started,
    };
  }

  const endpoint = opts.endpoint || DEFAULT_ENDPOINT;

  const outputFormat =
    (opts.outputFormat || process.env.RESEMBLE_OUTPUT_FORMAT || "mp3").toString().toLowerCase();

  const model = (opts.model || process.env.RESEMBLE_MODEL || "").toString().trim() || undefined;

  // project is optional; if it doesn't look valid, ignore it to avoid invalid_uid failures.
  const projectUuidRaw =
    (opts.projectUuid || process.env.RESEMBLE_PROJECT_UUID || "").toString().trim() || undefined;
  const projectUuid = projectUuidRaw && _looksLikeUid(projectUuidRaw) ? projectUuidRaw : undefined;

  const title = (opts.title || "").toString().trim() || undefined;

  const useHd =
    typeof opts.useHd === "boolean" ? opts.useHd : _boolEnv(process.env.RESEMBLE_USE_HD, false);

  const sampleRate =
    opts.sampleRate != null && opts.sampleRate !== ""
      ? Number(opts.sampleRate)
      : undefined;

  const timeoutMs =
    opts.timeoutMs != null ? Number(opts.timeoutMs) : Number(process.env.RESEMBLE_TIMEOUT_MS || 15000);

  const payload = {
    voice_uuid: String(voiceUuid),
    data: text,
    output_format: outputFormat, // "mp3" | "wav"
    ...(projectUuid ? { project_uuid: projectUuid } : {}),
    ...(title ? { title } : {}),
    ...(model ? { model } : {}),
    ...(typeof sampleRate === "number" && Number.isFinite(sampleRate) ? { sample_rate: sampleRate } : {}),
    ...(typeof useHd === "boolean" ? { use_hd: useHd } : {}),
  };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  let res;
  let rawText = "";
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    rawText = await res.text();
  } catch (err) {
    clearTimeout(t);
    const isAbort = err && (err.name === "AbortError" || String(err.message || "").toLowerCase().includes("aborted"));
    return {
      ok: false,
      reason: isAbort ? "timeout" : "network_error",
      message: isAbort ? "Resemble synthesis timed out." : "Resemble network error.",
      detail: err?.message || String(err),
      elapsedMs: Date.now() - started,
    };
  } finally {
    clearTimeout(t);
  }

  const body = _safeJsonParse(rawText) ?? rawText;

  if (!res.ok) {
    const cls = _classifyResembleError(res.status, body);
    const detailObj = typeof body === "object" ? _extractDetailObj(body) : null;

    return {
      ok: false,
      status: res.status,
      reason: cls.reason,
      retryable: cls.retryable,
      message: cls.reason === "invalid_uid"
        ? "Resemble rejected an ID (voice_uuid/project_uuid). Double-check RESEMBLE_VOICE_UUID and (if set) RESEMBLE_PROJECT_UUID."
        : "Resemble synthesis failed.",
      detail: body,
      requestId: detailObj && typeof detailObj.request_id === "string" ? detailObj.request_id : undefined,
      elapsedMs: Date.now() - started,
    };
  }

  // Successful response shape: { success:true, audio_content:"base64...", output_format, sample_rate, duration, ... }
  const audioContent = body && typeof body === "object" ? body.audio_content : null;
  const fmt = (body && typeof body === "object" && body.output_format) ? body.output_format : outputFormat;

  if (!audioContent || typeof audioContent !== "string") {
    return {
      ok: false,
      reason: "bad_response",
      message: "Resemble returned success but no audio_content.",
      detail: body,
      elapsedMs: Date.now() - started,
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
      elapsedMs: Date.now() - started,
    };
  }

  return {
    ok: true,
    buffer,
    mimeType: _mimeForFormat(fmt),
    format: fmt,
    duration: (body && typeof body === "object" && typeof body.duration === "number") ? body.duration : undefined,
    sampleRate: (body && typeof body === "object" && typeof body.sample_rate === "number") ? body.sample_rate : undefined,
    elapsedMs: Date.now() - started,
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

module.exports = {
  synthesize,
};
