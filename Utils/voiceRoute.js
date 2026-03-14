"use strict";

/**
 * utils/voiceRoute.js
 *
 * voiceRoute v1.3.0 HARDENED
 * ------------------------------------------------------------
 * PURPOSE
 * - Extract voice/TTS route logic out of index.js
 * - Preserve Mixer's voice as the preferred production voice
 * - Keep route behavior deterministic and fail-open safe
 * - Provide one clean registration surface for backend rendering
 * - Add strong diagnostics, trace correlation, and safer duplicate handling
 *
 * 20 PHASE COVERAGE
 * ------------------------------------------------------------
 * Phase 01: Config normalization
 * Phase 02: Voice preference preservation (Mixer first)
 * Phase 03: Intro text resolution
 * Phase 04: Payload normalization
 * Phase 05: Request validation
 * Phase 06: Safe TTS handler resolution
 * Phase 07: Audio header application
 * Phase 08: Voice CORS application
 * Phase 09: Intro route delegation
 * Phase 10: Standard TTS route delegation
 * Phase 11: Response normalization / wrapping
 * Phase 12: Duplicate request soft suppression
 * Phase 13: Terminal fail-open behavior
 * Phase 14: Diagnostics / health metadata
 * Phase 15: Registration hardening
 * Phase 16: Trace correlation
 * Phase 17: Structured failure pass-through
 * Phase 18: Safer duplicate keys
 * Phase 19: TTS health pass-through
 * Phase 20: Route-level logging
 */

const path = require("path");
const crypto = require("crypto");

const VR_VERSION = "voiceRoute v1.3.0 HARDENED";

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function isPlainObject(x) {
  return !!x &&
    typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

function truthy(v) {
  if (v === true) return true;
  const s = safeStr(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}

function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}

function nowMs() {
  return Date.now();
}

function sha1Lite(str) {
  const s = safeStr(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function makeTrace(prefix) {
  return `${prefix || "vr"}_${Date.now().toString(16)}_${crypto.randomBytes(4).toString("hex")}`;
}

function maskValue(v, left, right) {
  const s = oneLine(v);
  if (!s) return "";
  const l = clampInt(left, 4, 1, 12);
  const r = clampInt(right, 3, 1, 8);
  if (s.length <= l + r) return s;
  return `${s.slice(0, l)}***${s.slice(-r)}`;
}

function previewText(v, max) {
  const s = oneLine(v);
  const n = clampInt(max, 120, 20, 240);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function normalizeOptions(userOptions) {
  const input = isPlainObject(userOptions) ? userOptions : {};

  const allowedOrigins = Array.isArray(input.allowedOrigins)
    ? input.allowedOrigins.map((v) => oneLine(v)).filter(Boolean)
    : [];

  return {
    debug: !!input.debug,
    logEnabled: input.logEnabled === undefined ? true : !!input.logEnabled,
    mixerVoiceId: oneLine(
      input.mixerVoiceId ||
      process.env.MIXER_VOICE_ID ||
      process.env.RESEMBLE_VOICE_UUID ||
      process.env.RESEMBLE_VOICE_ID ||
      process.env.NYX_VOICE_ID ||
      ""
    ),
    mixerVoiceName: oneLine(
      input.mixerVoiceName ||
      process.env.MIXER_VOICE_NAME ||
      process.env.NYX_VOICE_NAME ||
      "Nyx"
    ),
    ttsModulePath: oneLine(input.ttsModulePath || ""),
    ttsHandler: typeof input.ttsHandler === "function" ? input.ttsHandler : null,
    ttsRoutePath: oneLine(input.ttsRoutePath || "/api/tts"),
    introRoutePath: oneLine(input.introRoutePath || "/api/tts/intro"),
    voiceRoutePath: oneLine(input.voiceRoutePath || "/api/voice/health"),
    healthRoutePath: oneLine(input.healthRoutePath || ""),
    duplicateWindowMs: clampInt(
      input.duplicateWindowMs != null ? input.duplicateWindowMs : 1500,
      1500,
      250,
      15000
    ),
    introFallbackText: oneLine(
      input.introFallbackText ||
      "Hi — how can I help you today?"
    ),
    allowedOrigins,
    allowAnyOrigin: allowedOrigins.length === 0 || allowedOrigins.includes("*")
  };
}

function createVoiceRoute(userOptions) {
  const opts = normalizeOptions(userOptions);
  const requestLedger = new Map();

  let __ttsResolved = null;
  let __ttsHealthFn = null;

  function log(event, meta) {
    if (!opts.debug && !opts.logEnabled) return;
    try {
      // eslint-disable-next-line no-console
      console.log("[voiceRoute]", event, meta || {});
    } catch (_e) {}
  }

  function sweepLedger() {
    const cutoff = nowMs() - opts.duplicateWindowMs;
    for (const [k, v] of requestLedger.entries()) {
      if (!v || !v.at || v.at < cutoff) requestLedger.delete(k);
    }
  }

  function buildTrace(req, payload, introMode) {
    const headers = req && isPlainObject(req.headers) ? req.headers : {};
    const body = isPlainObject(payload) ? payload : {};
    return oneLine(
      headers["x-sb-trace-id"] ||
      headers["x-request-id"] ||
      body.traceId ||
      body.requestId ||
      makeTrace(introMode ? "intro" : "tts")
    );
  }

  function buildRequestKey(req, payload, introMode) {
    const body = isPlainObject(payload) ? payload : {};
    const headers = req && isPlainObject(req.headers) ? req.headers : {};

    const traceId = oneLine(
      headers["x-sb-trace-id"] ||
      body.traceId ||
      ""
    );
    const requestId = oneLine(
      headers["x-sb-request-id"] ||
      headers["x-request-id"] ||
      body.requestId ||
      ""
    );
    const turnId = oneLine(
      headers["x-sb-turn-id"] ||
      body.turnId ||
      ""
    );
    const sessionId = oneLine(
      headers["x-sb-session-id"] ||
      headers["x-session-id"] ||
      body.sessionId ||
      ""
    );

    const text = oneLine(
      introMode
        ? resolveIntroText(body)
        : (body.text || body.textDisplay || body.message || body.prompt || body.say || body.data || "")
    );

    const voice = resolveMixerVoice(body);
    const routeMode = introMode ? "intro" : "tts";

    const keyObj = {
      routeMode,
      traceId: traceId || "",
      requestId: requestId || "",
      turnId: turnId || "",
      sessionId: sessionId || "",
      voice,
      text
    };

    return sha1Lite(JSON.stringify(keyObj));
  }

  function isDuplicateHot(req, payload, introMode) {
    sweepLedger();
    const key = buildRequestKey(req, payload, introMode);
    const hit = requestLedger.get(key);
    const t = nowMs();

    if (hit && (t - hit.at) <= opts.duplicateWindowMs) {
      return { duplicate: true, key, ageMs: t - hit.at };
    }

    requestLedger.set(key, { at: t });
    return { duplicate: false, key, ageMs: 0 };
  }

  function resolveMixerVoice(payload) {
    const body = isPlainObject(payload) ? payload : {};
    return oneLine(
      body.voice_uuid ||
      body.voiceUuid ||
      body.voiceId ||
      body.voice ||
      body.mixerVoiceId ||
      opts.mixerVoiceId ||
      process.env.MIXER_VOICE_ID ||
      process.env.RESEMBLE_VOICE_UUID ||
      process.env.RESEMBLE_VOICE_ID ||
      ""
    );
  }

  function resolveMixerVoiceName(payload) {
    const body = isPlainObject(payload) ? payload : {};
    return oneLine(
      body.voiceName ||
      body.mixerVoiceName ||
      opts.mixerVoiceName ||
      process.env.MIXER_VOICE_NAME ||
      process.env.NYX_VOICE_NAME ||
      "Nyx"
    );
  }

  function resolveIntroText(payload) {
    const body = isPlainObject(payload) ? payload : {};
    return oneLine(
      body.introText ||
      body.text ||
      body.textDisplay ||
      body.message ||
      body.prompt ||
      body.say ||
      opts.introFallbackText ||
      "Hi — how can I help you today?"
    );
  }

  function normalizePayload(req) {
    const body = req && isPlainObject(req.body) ? req.body : {};
    const query = req && isPlainObject(req.query) ? req.query : {};
    const headers = req && isPlainObject(req.headers) ? req.headers : {};

    const merged = { ...query, ...body };

    const traceId = oneLine(
      headers["x-sb-trace-id"] ||
      headers["x-request-id"] ||
      merged.traceId ||
      merged.requestId ||
      makeTrace("vr")
    );

    const payload = {
      ...merged,
      traceId,
      requestId: oneLine(merged.requestId || headers["x-sb-request-id"] || headers["x-request-id"] || traceId),
      turnId: oneLine(merged.turnId || headers["x-sb-turn-id"] || ""),
      sessionId: oneLine(merged.sessionId || headers["x-sb-session-id"] || headers["x-session-id"] || ""),
      voice_uuid: oneLine(
        merged.voice_uuid ||
        merged.voiceUuid ||
        merged.voiceId ||
        merged.voice ||
        merged.mixerVoiceId ||
        opts.mixerVoiceId
      ),
      voiceName: oneLine(
        merged.voiceName ||
        merged.mixerVoiceName ||
        opts.mixerVoiceName
      ),
      text: oneLine(
        merged.text ||
        merged.textDisplay ||
        merged.message ||
        merged.prompt ||
        merged.say ||
        merged.data ||
        ""
      ),
      introText: oneLine(
        merged.introText ||
        merged.text ||
        merged.textDisplay ||
        merged.message ||
        merged.prompt ||
        merged.say ||
        ""
      ),
      output_format: oneLine(
        merged.output_format ||
        merged.outputFormat ||
        merged.format ||
        "mp3"
      ),
      preserveMixerVoice: merged.preserveMixerVoice === undefined ? true : !!merged.preserveMixerVoice,
      rawBody: body
    };

    return payload;
  }

  function buildSnapshot(req, payload, introMode) {
    const body = isPlainObject(payload) ? payload : {};
    return {
      traceId: oneLine(body.traceId || ""),
      requestId: oneLine(body.requestId || ""),
      turnId: oneLine(body.turnId || ""),
      sessionId: oneLine(body.sessionId || ""),
      routeMode: introMode ? "intro" : "tts",
      voiceUuid: maskValue(resolveMixerVoice(body)),
      voiceName: resolveMixerVoiceName(body),
      outputFormat: oneLine(body.output_format || body.outputFormat || body.format || "mp3"),
      textLen: oneLine(introMode ? resolveIntroText(body) : body.text).length,
      textPreview: previewText(introMode ? resolveIntroText(body) : body.text),
      origin: oneLine(req && req.headers ? req.headers.origin : ""),
      method: oneLine(req && req.method),
      path: oneLine(req && req.originalUrl)
    };
  }

  function applyAudioHeaders(res, mime, meta) {
    if (!res || res.headersSent) return;
    res.setHeader("Content-Type", safeStr(mime || "audio/mpeg"));
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Accept-Ranges", "none");
    res.setHeader("X-Voice-Route-Version", VR_VERSION);
    if (meta && meta.traceId) res.setHeader("X-SB-Trace-ID", safeStr(meta.traceId).slice(0, 120));
    if (meta && meta.requestId) res.setHeader("X-SB-Request-ID", safeStr(meta.requestId).slice(0, 120));
    if (meta && meta.turnId) res.setHeader("X-SB-Turn-ID", safeStr(meta.turnId).slice(0, 120));
    if (meta && meta.sessionId) res.setHeader("X-SB-Session-ID", safeStr(meta.sessionId).slice(0, 120));
    if (meta && meta.reason) res.setHeader("X-SB-Voice-Reason", safeStr(meta.reason).slice(0, 120));
    if (meta && Number.isFinite(meta.providerStatus)) res.setHeader("X-SB-TTS-UPSTREAM-STATUS", String(meta.providerStatus));
  }

  function applyVoiceCors(req, res) {
    if (!res || res.headersSent) return;

    const reqOrigin = oneLine(req && req.headers ? req.headers.origin : "");
    let allowOrigin = "*";

    if (!opts.allowAnyOrigin) {
      if (reqOrigin && opts.allowedOrigins.includes(reqOrigin)) {
        allowOrigin = reqOrigin;
      } else {
        allowOrigin = opts.allowedOrigins[0] || "*";
      }
    }

    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Session-Id, X-Request-Id, X-SB-Request-ID, X-SB-Trace-ID, X-SB-Turn-ID"
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Type, X-Voice-Route-Version, X-SB-Trace-ID, X-SB-Request-ID, X-SB-Turn-ID, X-SB-Session-ID, X-SB-Voice-Reason, X-SB-TTS-UPSTREAM-STATUS"
    );
  }

  function safeSendJson(res, status, obj) {
    if (!res || res.headersSent) return;
    res.status(status).json(obj);
  }

  function buildJsonEnvelope(ok, extra) {
    return {
      ok: !!ok,
      source: "voiceRoute",
      version: VR_VERSION,
      t: nowMs(),
      ...(isPlainObject(extra) ? extra : {})
    };
  }

  function wrapHandlerResult(result, fallbackText, voiceId, voiceName, introMode, payload) {
    const traceId = oneLine(payload && payload.traceId || "");
    const requestId = oneLine(payload && payload.requestId || "");
    const turnId = oneLine(payload && payload.turnId || "");
    const sessionId = oneLine(payload && payload.sessionId || "");

    if (Buffer.isBuffer(result)) {
      return {
        kind: "audio_buffer",
        buffer: result,
        mime: "audio/mpeg",
        status: 200,
        meta: { traceId, requestId, turnId, sessionId }
      };
    }

    if (isPlainObject(result)) {
      if (Buffer.isBuffer(result.audio)) {
        return {
          kind: "audio_buffer",
          buffer: result.audio,
          mime: safeStr(result.mime || result.contentType || "audio/mpeg"),
          status: 200,
          meta: {
            traceId: oneLine(result.traceId || traceId),
            requestId: oneLine(result.requestId || requestId),
            turnId: oneLine(result.turnId || turnId),
            sessionId: oneLine(result.sessionId || sessionId),
            providerStatus: Number(result.providerStatus || 200) || 200
          }
        };
      }

      if (safeStr(result.audioBase64 || "")) {
        return {
          kind: "audio_base64",
          audioBase64: safeStr(result.audioBase64),
          mime: safeStr(result.mime || result.contentType || "audio/mpeg"),
          status: 200,
          meta: {
            traceId: oneLine(result.traceId || traceId),
            requestId: oneLine(result.requestId || requestId),
            turnId: oneLine(result.turnId || turnId),
            sessionId: oneLine(result.sessionId || sessionId),
            providerStatus: Number(result.providerStatus || 200) || 200
          }
        };
      }

      if (safeStr(result.url || result.audioUrl || "")) {
        return {
          kind: "json",
          status: 200,
          json: buildJsonEnvelope(true, {
            routeMode: introMode ? "intro" : "tts",
            traceId: oneLine(result.traceId || traceId),
            requestId: oneLine(result.requestId || requestId),
            turnId: oneLine(result.turnId || turnId),
            sessionId: oneLine(result.sessionId || sessionId),
            voice: voiceId,
            voiceName,
            audioUrl: safeStr(result.url || result.audioUrl),
            mime: safeStr(result.mime || result.contentType || "audio/mpeg"),
            provider: safeStr(result.provider || ""),
            text: safeStr(result.text || fallbackText || "")
          })
        };
      }

      if (result.ok === false) {
        const retryable = !!result.retryable;
        const providerStatus = Number(result.providerStatus || result.status || 0) || 0;
        const status =
          providerStatus === 429 ? 429 :
          retryable ? 503 :
          (providerStatus >= 400 && providerStatus < 500 ? providerStatus : 400);

        return {
          kind: "json",
          status,
          json: buildJsonEnvelope(false, {
            routeMode: introMode ? "intro" : "tts",
            traceId: oneLine(result.traceId || traceId),
            requestId: oneLine(result.requestId || requestId),
            turnId: oneLine(result.turnId || turnId),
            sessionId: oneLine(result.sessionId || sessionId),
            voice: voiceId,
            voiceName,
            error: safeStr(result.reason || result.error || "tts_failed"),
            detail: safeStr(result.message || result.error || "").slice(0, 280),
            provider: safeStr(result.provider || ""),
            providerStatus,
            providerEndpoint: safeStr(result.providerEndpoint || ""),
            authMode: safeStr(result.authMode || ""),
            retryable,
            spokenUnavailable: true,
            text: safeStr(result.text || fallbackText || "")
          })
        };
      }

      if (safeStr(result.text || "")) {
        return {
          kind: "json",
          status: 200,
          json: buildJsonEnvelope(true, {
            routeMode: introMode ? "intro" : "tts",
            traceId: oneLine(result.traceId || traceId),
            requestId: oneLine(result.requestId || requestId),
            turnId: oneLine(result.turnId || turnId),
            sessionId: oneLine(result.sessionId || sessionId),
            voice: voiceId,
            voiceName,
            text: safeStr(result.text),
            mime: safeStr(result.mime || result.contentType || "audio/mpeg"),
            provider: safeStr(result.provider || "")
          })
        };
      }
    }

    return {
      kind: "json",
      status: 503,
      json: buildJsonEnvelope(false, {
        routeMode: introMode ? "intro" : "tts",
        traceId,
        requestId,
        turnId,
        sessionId,
        voice: voiceId,
        voiceName,
        text: fallbackText || "",
        spokenUnavailable: true,
        error: "invalid_tts_response_shape"
      })
    };
  }

  function resolveTtsHandler() {
    if (__ttsResolved) return __ttsResolved;
    if (typeof opts.ttsHandler === "function") {
      __ttsResolved = opts.ttsHandler;
      return __ttsResolved;
    }

    const candidates = [
      opts.ttsModulePath,
      path.join(process.cwd(), "utils", "tts.js"),
      path.join(process.cwd(), "tts.js")
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const mod = require(candidate);

        if (mod && typeof mod.delegateTts === "function") {
          __ttsResolved = mod.delegateTts;
          __ttsHealthFn = typeof mod.health === "function" ? mod.health : null;
          log("tts_handler_resolved", { candidate, type: "delegateTts" });
          return __ttsResolved;
        }

        if (mod && typeof mod.ttsHandler === "function" && mod.ttsHandler.length <= 2) {
          __ttsResolved = mod.ttsHandler;
          __ttsHealthFn = typeof mod.health === "function" ? mod.health : null;
          log("tts_handler_resolved", { candidate, type: "ttsHandler" });
          return __ttsResolved;
        }

        if (typeof mod === "function" && mod.length <= 2) {
          __ttsResolved = mod;
          __ttsHealthFn = null;
          log("tts_handler_resolved", { candidate, type: "default_fn" });
          return __ttsResolved;
        }

        if (mod && typeof mod.default === "function" && mod.default.length <= 2) {
          __ttsResolved = mod.default;
          __ttsHealthFn = typeof mod.health === "function" ? mod.health : null;
          log("tts_handler_resolved", { candidate, type: "default_export" });
          return __ttsResolved;
        }
      } catch (e) {
        log("tts_handler_resolve_failed", {
          candidate,
          detail: safeStr(e && e.message ? e.message : e).slice(0, 220)
        });
      }
    }

    return null;
  }

  async function getTtsHealth() {
    if (typeof __ttsHealthFn === "function") {
      try {
        return __ttsHealthFn();
      } catch (_e) {
        return null;
      }
    }
    return null;
  }

  async function delegateToTts(ttsHandler, req, payload, introMode) {
    const voiceId = resolveMixerVoice(payload);
    const voiceName = resolveMixerVoiceName(payload);
    const text = introMode ? resolveIntroText(payload) : oneLine(payload.text || "");

    const ttsPayload = {
      text,
      textDisplay: text,
      message: text,
      prompt: text,
      voice_uuid: voiceId,
      voiceUuid: voiceId,
      voiceId,
      voice: voiceId,
      voiceName,
      mixerVoiceId: voiceId,
      mixerVoiceName: voiceName,
      output_format: oneLine(payload.output_format || payload.outputFormat || payload.format || "mp3"),
      outputFormat: oneLine(payload.output_format || payload.outputFormat || payload.format || "mp3"),
      traceId: oneLine(payload.traceId || payload.requestId || ""),
      requestId: oneLine(payload.requestId || ""),
      turnId: oneLine(payload.turnId || ""),
      sessionId: oneLine(payload.sessionId || ""),
      source: "voiceRoute",
      mode: introMode ? "intro" : (payload.mode || "tts"),
      routeKind: introMode ? "intro" : "main",
      intro: !!introMode,
      preserveMixerVoice: true,
      raw: payload.rawBody || {}
    };

    return ttsHandler(ttsPayload, req);
  }

  async function handleVoice(req, res, introMode) {
    applyVoiceCors(req, res);

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    const startedAt = nowMs();
    const payload = normalizePayload(req);
    const voiceId = resolveMixerVoice(payload);
    const voiceName = resolveMixerVoiceName(payload);
    const text = introMode ? resolveIntroText(payload) : oneLine(payload.text || "");
    const snap = buildSnapshot(req, payload, introMode);

    applyAudioHeaders(res, "audio/mpeg", {
      traceId: payload.traceId,
      requestId: payload.requestId,
      turnId: payload.turnId,
      sessionId: payload.sessionId
    });

    log("request_start", snap);

    if (!text) {
      log("request_missing_text", snap);
      safeSendJson(
        res,
        400,
        buildJsonEnvelope(false, {
          routeMode: introMode ? "intro" : "tts",
          traceId: payload.traceId,
          requestId: payload.requestId,
          turnId: payload.turnId,
          sessionId: payload.sessionId,
          error: "missing_text",
          spokenUnavailable: true,
          voice: voiceId,
          voiceName
        })
      );
      return;
    }

    const dupe = isDuplicateHot(req, { ...payload, text }, introMode);
    if (dupe.duplicate) {
      log("duplicate_suppressed", {
        ...snap,
        requestKey: dupe.key,
        duplicateAgeMs: dupe.ageMs
      });
      safeSendJson(
        res,
        202,
        buildJsonEnvelope(true, {
          routeMode: introMode ? "intro" : "tts",
          traceId: payload.traceId,
          requestId: payload.requestId,
          turnId: payload.turnId,
          sessionId: payload.sessionId,
          voice: voiceId,
          voiceName,
          duplicateSuppressed: true,
          requestKey: dupe.key,
          duplicateAgeMs: dupe.ageMs,
          text
        })
      );
      return;
    }

    const ttsHandler = resolveTtsHandler();
    if (!ttsHandler) {
      log("tts_handler_unavailable", snap);
      const ttsHealth = await getTtsHealth();
      safeSendJson(
        res,
        503,
        buildJsonEnvelope(false, {
          routeMode: introMode ? "intro" : "tts",
          traceId: payload.traceId,
          requestId: payload.requestId,
          turnId: payload.turnId,
          sessionId: payload.sessionId,
          error: "tts_handler_unavailable",
          spokenUnavailable: true,
          voice: voiceId,
          voiceName,
          preserveMixerVoice: true,
          text,
          ttsHealth: ttsHealth || null
        })
      );
      return;
    }

    try {
      const result = await delegateToTts(ttsHandler, req, payload, introMode);
      const wrapped = wrapHandlerResult(result, text, voiceId, voiceName, introMode, payload);

      log("tts_delegate_result", {
        ...snap,
        resultKind: wrapped.kind,
        status: wrapped.status || 200,
        elapsedMs: nowMs() - startedAt
      });

      if (wrapped.kind === "audio_buffer") {
        applyAudioHeaders(res, wrapped.mime, wrapped.meta || {
          traceId: payload.traceId,
          requestId: payload.requestId,
          turnId: payload.turnId,
          sessionId: payload.sessionId
        });
        res.status(200).send(wrapped.buffer);
        return;
      }

      if (wrapped.kind === "audio_base64") {
        try {
          const buf = Buffer.from(wrapped.audioBase64, "base64");
          applyAudioHeaders(res, wrapped.mime, wrapped.meta || {
            traceId: payload.traceId,
            requestId: payload.requestId,
            turnId: payload.turnId,
            sessionId: payload.sessionId
          });
          res.status(200).send(buf);
          return;
        } catch (e) {
          log("audio_base64_decode_failed", {
            ...snap,
            detail: safeStr(e && e.message ? e.message : e).slice(0, 220)
          });
          safeSendJson(
            res,
            503,
            buildJsonEnvelope(false, {
              routeMode: introMode ? "intro" : "tts",
              traceId: payload.traceId,
              requestId: payload.requestId,
              turnId: payload.turnId,
              sessionId: payload.sessionId,
              error: "audio_base64_decode_failed",
              spokenUnavailable: true,
              voice: voiceId,
              voiceName,
              text
            })
          );
          return;
        }
      }

      safeSendJson(res, wrapped.status || 200, wrapped.json);
    } catch (err) {
      log("tts_delegate_failed", {
        ...snap,
        detail: safeStr(err && err.message ? err.message : err).slice(0, 220),
        elapsedMs: nowMs() - startedAt
      });
      safeSendJson(
        res,
        500,
        buildJsonEnvelope(false, {
          routeMode: introMode ? "intro" : "tts",
          traceId: payload.traceId,
          requestId: payload.requestId,
          turnId: payload.turnId,
          sessionId: payload.sessionId,
          error: "tts_delegate_failed",
          spokenUnavailable: true,
          detail: safeStr(err && err.message ? err.message : err).slice(0, 220),
          voice: voiceId,
          voiceName,
          preserveMixerVoice: true,
          text
        })
      );
    }
  }

  async function voiceRouteHealth(_req, res) {
    const ttsHealth = await getTtsHealth();
    safeSendJson(res, 200, buildJsonEnvelope(true, {
      mixerVoiceId: opts.mixerVoiceId || "",
      mixerVoiceName: opts.mixerVoiceName || "",
      preserveMixerVoice: true,
      ttsRoutePath: opts.ttsRoutePath,
      introRoutePath: opts.introRoutePath,
      voiceRoutePath: opts.voiceRoutePath,
      ttsHealth: ttsHealth || null
    }));
  }

  function register(app) {
    if (!app || typeof app.post !== "function" || typeof app.options !== "function") {
      throw new Error("voiceRoute.register requires an Express app");
    }

    if (app.__voiceRouteRegistered) return app;
    app.__voiceRouteRegistered = true;

    app.options(opts.ttsRoutePath, (req, res) => {
      applyVoiceCors(req, res);
      res.status(204).end();
    });

    app.options(opts.introRoutePath, (req, res) => {
      applyVoiceCors(req, res);
      res.status(204).end();
    });

    if (opts.voiceRoutePath) {
      app.options(opts.voiceRoutePath, (req, res) => {
        applyVoiceCors(req, res);
        res.status(204).end();
      });
    }

    app.post(opts.ttsRoutePath, async (req, res) => {
      await handleVoice(req, res, false);
    });

    app.post(opts.introRoutePath, async (req, res) => {
      await handleVoice(req, res, true);
    });

    if (opts.voiceRoutePath) {
      app.get(opts.voiceRoutePath, async (req, res) => {
        applyVoiceCors(req, res);
        await voiceRouteHealth(req, res);
      });
    }

    if (opts.healthRoutePath) {
      app.get(opts.healthRoutePath, async (req, res) => {
        applyVoiceCors(req, res);
        await voiceRouteHealth(req, res);
      });
    }

    log("register_complete", {
      ttsRoutePath: opts.ttsRoutePath,
      introRoutePath: opts.introRoutePath,
      voiceRoutePath: opts.voiceRoutePath,
      healthRoutePath: opts.healthRoutePath || ""
    });

    return app;
  }

  return {
    version: VR_VERSION,
    options: opts,
    register,
    handleVoice,
    health: voiceRouteHealth,
    resolveTtsHandler
  };
}

function registerVoiceRoutes(app, options) {
  return createVoiceRoute(options).register(app);
}

module.exports = {
  VR_VERSION,
  createVoiceRoute,
  registerVoiceRoutes
};
