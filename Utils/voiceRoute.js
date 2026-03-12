"use strict";

/**
 * utils/voiceRoute.js
 *
 * voiceRoute v1.2.0
 * ------------------------------------------------------------
 * PURPOSE
 * - Extract voice/TTS route logic out of index.js
 * - Preserve Mixer's voice as the preferred production voice
 * - Keep route behavior deterministic and fail-open safe
 * - Provide one clean registration surface for backend rendering
 *
 * 15 PHASE COVERAGE
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
 */

const path = require("path");

const VR_VERSION = "voiceRoute v1.2.0";

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

function normalizeOptions(userOptions) {
  const input = isPlainObject(userOptions) ? userOptions : {};

  const allowedOrigins = Array.isArray(input.allowedOrigins)
    ? input.allowedOrigins.map((v) => oneLine(v)).filter(Boolean)
    : [];

  return {
    debug: !!input.debug,
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

  function log() {
    if (!opts.debug) return;
    try {
      // eslint-disable-next-line no-console
      console.log("[voiceRoute]", ...arguments);
    } catch (_e) {}
  }

  function sweepLedger() {
    const cutoff = nowMs() - opts.duplicateWindowMs;
    for (const [k, v] of requestLedger.entries()) {
      if (!v || !v.at || v.at < cutoff) requestLedger.delete(k);
    }
  }

  function buildRequestKey(req, payload, introMode) {
    const body = isPlainObject(payload) ? payload : {};
    const sessionId = oneLine(
      (req && req.headers && (req.headers["x-session-id"] || req.headers["x-request-id"] || req.headers["x-sb-trace-id"])) ||
      body.sessionId ||
      body.requestId ||
      ""
    );

    const text = oneLine(
      introMode
        ? resolveIntroText(body)
        : (body.text || body.textDisplay || body.message || body.prompt || body.say || body.data || "")
    );

    const voice = resolveMixerVoice(body);
    const routeMode = introMode ? "intro" : "tts";

    return sha1Lite(JSON.stringify({
      routeMode,
      sessionId,
      voice,
      text
    }));
  }

  function isDuplicateHot(req, payload, introMode) {
    sweepLedger();
    const key = buildRequestKey(req, payload, introMode);
    const hit = requestLedger.get(key);
    const t = nowMs();

    if (hit && (t - hit.at) <= opts.duplicateWindowMs) {
      return { duplicate: true, key };
    }

    requestLedger.set(key, { at: t });
    return { duplicate: false, key };
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

    const merged = {
      ...query,
      ...body
    };

    const payload = {
      ...merged,
      traceId: oneLine(
        headers["x-sb-trace-id"] ||
        headers["x-request-id"] ||
        merged.traceId ||
        merged.requestId ||
        ""
      ),
      requestId: oneLine(
        merged.requestId ||
        headers["x-request-id"] ||
        ""
      ),
      sessionId: oneLine(
        merged.sessionId ||
        headers["x-session-id"] ||
        ""
      ),
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
      preserveMixerVoice: true,
      rawBody: body
    };

    return payload;
  }

  function applyAudioHeaders(res, mime) {
    if (!res || res.headersSent) return;
    res.setHeader("Content-Type", safeStr(mime || "audio/mpeg"));
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Accept-Ranges", "none");
    res.setHeader("X-Voice-Route-Version", VR_VERSION);
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
      "Content-Type, Authorization, X-Session-Id, X-Request-Id, X-SB-Trace-ID"
    );
    res.setHeader("Access-Control-Expose-Headers", "Content-Type, X-Voice-Route-Version");
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

  function wrapHandlerResult(result, fallbackText, voiceId, voiceName, introMode) {
    if (Buffer.isBuffer(result)) {
      return {
        kind: "audio_buffer",
        buffer: result,
        mime: "audio/mpeg",
        status: 200
      };
    }

    if (isPlainObject(result)) {
      if (Buffer.isBuffer(result.audio)) {
        return {
          kind: "audio_buffer",
          buffer: result.audio,
          mime: safeStr(result.mime || result.contentType || "audio/mpeg"),
          status: 200
        };
      }

      if (safeStr(result.audioBase64 || "")) {
        return {
          kind: "audio_base64",
          audioBase64: safeStr(result.audioBase64),
          mime: safeStr(result.mime || result.contentType || "audio/mpeg"),
          status: 200
        };
      }

      if (safeStr(result.url || result.audioUrl || "")) {
        return {
          kind: "json",
          status: 200,
          json: buildJsonEnvelope(true, {
            routeMode: introMode ? "intro" : "tts",
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
            voice: voiceId,
            voiceName,
            error: safeStr(result.reason || result.error || "tts_failed"),
            detail: safeStr(result.message || result.error || "").slice(0, 220),
            provider: safeStr(result.provider || ""),
            providerStatus,
            providerEndpoint: safeStr(result.providerEndpoint || ""),
            authMode: safeStr(result.authMode || ""),
            retryable,
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
        voice: voiceId,
        voiceName,
        text: fallbackText || "",
        error: "invalid_tts_response_shape"
      })
    };
  }

  function resolveTtsHandler() {
    if (typeof opts.ttsHandler === "function") return opts.ttsHandler;

    const candidates = [
      opts.ttsModulePath,
      path.join(process.cwd(), "utils", "tts.js"),
      path.join(process.cwd(), "tts.js")
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const mod = require(candidate);

        // Payload-style delegate is the only primary target here.
        if (mod && typeof mod.delegateTts === "function") {
          log("Resolved delegateTts from", candidate);
          return mod.delegateTts;
        }

        // Backward compatibility: accept explicitly exported payload-safe ttsHandler.
        if (mod && typeof mod.ttsHandler === "function" && mod.ttsHandler.length <= 2) {
          log("Resolved payload-safe ttsHandler from", candidate);
          return mod.ttsHandler;
        }

        // Last-resort payload-style default export.
        if (typeof mod === "function" && mod.length <= 2) {
          log("Resolved default function from", candidate);
          return mod;
        }

        if (mod && typeof mod.default === "function" && mod.default.length <= 2) {
          log("Resolved default export from", candidate);
          return mod.default;
        }
      } catch (_e) {}
    }

    return null;
  }

  async function delegateToTts(ttsHandler, req, payload, introMode) {
    const voiceId = resolveMixerVoice(payload);
    const voiceName = resolveMixerVoiceName(payload);
    const text = introMode
      ? resolveIntroText(payload)
      : oneLine(payload.text || "");

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

    const payload = normalizePayload(req);
    const voiceId = resolveMixerVoice(payload);
    const voiceName = resolveMixerVoiceName(payload);
    const text = introMode ? resolveIntroText(payload) : oneLine(payload.text || "");

    if (!text) {
      safeSendJson(
        res,
        400,
        buildJsonEnvelope(false, {
          routeMode: introMode ? "intro" : "tts",
          error: "missing_text",
          voice: voiceId,
          voiceName
        })
      );
      return;
    }

    const dupe = isDuplicateHot(req, { ...payload, text }, introMode);
    if (dupe.duplicate) {
      safeSendJson(
        res,
        202,
        buildJsonEnvelope(true, {
          routeMode: introMode ? "intro" : "tts",
          voice: voiceId,
          voiceName,
          duplicateSuppressed: true,
          requestKey: dupe.key,
          text
        })
      );
      return;
    }

    const ttsHandler = resolveTtsHandler();
    if (!ttsHandler) {
      safeSendJson(
        res,
        503,
        buildJsonEnvelope(false, {
          routeMode: introMode ? "intro" : "tts",
          error: "tts_handler_unavailable",
          voice: voiceId,
          voiceName,
          preserveMixerVoice: true,
          text
        })
      );
      return;
    }

    try {
      const result = await delegateToTts(ttsHandler, req, payload, introMode);
      const wrapped = wrapHandlerResult(result, text, voiceId, voiceName, introMode);

      if (wrapped.kind === "audio_buffer") {
        applyAudioHeaders(res, wrapped.mime);
        res.status(200).send(wrapped.buffer);
        return;
      }

      if (wrapped.kind === "audio_base64") {
        applyAudioHeaders(res, wrapped.mime);
        const buf = Buffer.from(wrapped.audioBase64, "base64");
        res.status(200).send(buf);
        return;
      }

      safeSendJson(res, wrapped.status || 200, wrapped.json);
    } catch (err) {
      safeSendJson(
        res,
        500,
        buildJsonEnvelope(false, {
          routeMode: introMode ? "intro" : "tts",
          error: "tts_delegate_failed",
          detail: safeStr(err && err.message ? err.message : err).slice(0, 220),
          voice: voiceId,
          voiceName,
          preserveMixerVoice: true,
          text
        })
      );
    }
  }

  function voiceRouteHealth(_req, res) {
    safeSendJson(res, 200, buildJsonEnvelope(true, {
      mixerVoiceId: opts.mixerVoiceId || "",
      mixerVoiceName: opts.mixerVoiceName || "",
      preserveMixerVoice: true,
      ttsRoutePath: opts.ttsRoutePath,
      introRoutePath: opts.introRoutePath,
      voiceRoutePath: opts.voiceRoutePath
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
      app.get(opts.voiceRoutePath, (req, res) => {
        applyVoiceCors(req, res);
        voiceRouteHealth(req, res);
      });
    }

    if (opts.healthRoutePath) {
      app.get(opts.healthRoutePath, (req, res) => {
        applyVoiceCors(req, res);
        voiceRouteHealth(req, res);
      });
    }

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
