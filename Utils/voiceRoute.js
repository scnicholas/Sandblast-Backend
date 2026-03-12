"use strict";

/**
 * utils/voiceRoute.js
 *
 * voiceRoute v1.1.0
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

const VR_VERSION = "voiceRoute v1.1.0";

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
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
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
    const text = oneLine(body.text || body.message || body.prompt || body.introText || "").slice(0, 280);
    const voice = oneLine(
      body.voice ||
      body.voiceId ||
      body.voiceName ||
      body.mixerVoiceId ||
      body.mixerVoiceName ||
      ""
    ).slice(0, 80);
    const sid = oneLine(body.sessionId || body.sid || req?.headers?.["x-session-id"] || "").slice(0, 80);
    const rid = oneLine(body.requestId || req?.headers?.["x-request-id"] || "").slice(0, 80);
    const kind = introMode ? "intro" : "tts";
    return sha1Lite(`${kind}|${sid}|${rid}|${voice}|${text}`).slice(0, 24);
  }

  function isDuplicateHot(req, payload, introMode) {
    sweepLedger();
    const key = buildRequestKey(req, payload, introMode);
    const existing = requestLedger.get(key);
    const now = nowMs();
    if (existing && existing.at && (now - existing.at) <= opts.duplicateWindowMs) {
      return { duplicate: true, key };
    }
    requestLedger.set(key, { at: now });
    return { duplicate: false, key };
  }

  function normalizePayload(req) {
    const body = isPlainObject(req?.body) ? req.body : {};
    const query = isPlainObject(req?.query) ? req.query : {};
    const payload = {
      text:
        safeStr(body.text || "") ||
        safeStr(body.message || "") ||
        safeStr(body.prompt || "") ||
        safeStr(body.say || "") ||
        safeStr(body.data || "") ||
        safeStr(query.text || "") ||
        safeStr(query.message || "") ||
        "",
      voice:
        safeStr(body.voice || "") ||
        safeStr(body.voiceId || "") ||
        safeStr(body.voice_uuid || "") ||
        safeStr(body.voiceName || "") ||
        safeStr(query.voice || "") ||
        safeStr(query.voiceId || "") ||
        "",
      voiceId:
        safeStr(body.voiceId || "") ||
        safeStr(body.voice_uuid || "") ||
        safeStr(query.voiceId || "") ||
        "",
      voiceName:
        safeStr(body.voiceName || "") ||
        safeStr(body.mixerVoiceName || "") ||
        safeStr(query.voiceName || "") ||
        "",
      sessionId:
        safeStr(body.sessionId || "") ||
        safeStr(body.sid || "") ||
        safeStr(query.sessionId || "") ||
        safeStr(query.sid || "") ||
        safeStr(req?.headers?.["x-session-id"] || "") ||
        "",
      requestId:
        safeStr(body.requestId || "") ||
        safeStr(query.requestId || "") ||
        safeStr(req?.headers?.["x-request-id"] || "") ||
        "",
      mime:
        safeStr(body.mime || "") ||
        safeStr(query.mime || "") ||
        "",
      format:
        safeStr(body.format || "") ||
        safeStr(body.output_format || "") ||
        safeStr(query.format || "") ||
        "",
      provider:
        safeStr(body.provider || "") ||
        safeStr(query.provider || "") ||
        "",
      introText:
        safeStr(body.introText || "") ||
        safeStr(query.introText || "") ||
        "",
      lane:
        safeStr(body.lane || "") ||
        safeStr(query.lane || "") ||
        "",
      mode:
        safeStr(body.mode || "") ||
        safeStr(query.mode || "") ||
        "",
      routeKind:
        safeStr(body.routeKind || "") ||
        safeStr(query.routeKind || "") ||
        "",
      rawBody: body,
      rawQuery: query
    };

    payload.text = payload.text.slice(0, opts.maxTextLength);
    payload.introText = payload.introText.slice(0, opts.maxTextLength);

    return payload;
  }

  function resolveMixerVoice(payload) {
    const requested = oneLine(payload?.voiceId || payload?.voice || "");
    if (requested) return requested;

    const preferred = [
      opts.mixerVoiceId,
      process.env.MIXER_VOICE_ID,
      process.env.RESEMBLE_VOICE_UUID,
      process.env.SB_RESEMBLE_VOICE_UUID,
      process.env.SBNYX_RESEMBLE_VOICE_UUID,
      process.env.RESEMBLE_VOICE_ID,
      process.env.NYX_VOICE_ID,
      process.env.TTS_VOICE_ID
    ]
      .map((x) => oneLine(x))
      .find(Boolean);

    return preferred || "";
  }

  function resolveMixerVoiceName(payload) {
    const requested = oneLine(payload?.voiceName || payload?.voice || "");
    if (requested) return requested;

    const preferred = [
      opts.mixerVoiceName,
      process.env.MIXER_VOICE_NAME,
      process.env.NYX_VOICE_NAME,
      process.env.TTS_VOICE_NAME
    ]
      .map((x) => oneLine(x))
      .find(Boolean);

    return preferred || "Nyx";
  }

  function resolveIntroText(payload) {
    const direct = oneLine(payload?.introText || payload?.text || "");
    if (direct) return direct;

    const configured = oneLine(opts.defaultIntroText || "");
    if (configured) return configured;

    return "Hi, I am Nyx. Welcome to Sandblast. How can I help you today?";
  }

  function applyAudioHeaders(res, mimeHint) {
    const mime = oneLine(mimeHint || "").toLowerCase();
    const type =
      mime.includes("wav") ? "audio/wav" :
      mime.includes("ogg") ? "audio/ogg" :
      mime.includes("aac") ? "audio/aac" :
      mime.includes("mpeg") || mime.includes("mp3") ? "audio/mpeg" :
      "audio/mpeg";

    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("X-Voice-Route-Version", VR_VERSION);
  }

  function applyVoiceCors(req, res) {
    const origin = safeStr(req?.headers?.origin || "");
    const allowOrigin =
      opts.allowOrigin === "*" ? "*" :
      origin && opts.allowedOriginsSet.has(origin) ? origin :
      opts.allowedOrigins.length ? opts.allowedOrigins[0] : "*";

    res.setHeader("Access-Control-Allow-Origin", allowOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Id, X-Request-Id, X-SB-Trace-ID");
    res.setHeader("Access-Control-Expose-Headers", "Content-Type, X-Voice-Route-Version");
  }

  function safeSendJson(res, status, obj) {
    if (res.headersSent) return;
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
      return { kind: "audio_buffer", buffer: result, mime: "audio/mpeg" };
    }

    if (isPlainObject(result)) {
      if (Buffer.isBuffer(result.audio)) {
        return {
          kind: "audio_buffer",
          buffer: result.audio,
          mime: safeStr(result.mime || result.contentType || "audio/mpeg")
        };
      }

      if (safeStr(result.audioBase64 || "")) {
        return {
          kind: "audio_base64",
          audioBase64: safeStr(result.audioBase64),
          mime: safeStr(result.mime || result.contentType || "audio/mpeg")
        };
      }

      if (safeStr(result.url || result.audioUrl || "")) {
        return {
          kind: "json",
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
        return {
          kind: "json",
          json: buildJsonEnvelope(false, {
            routeMode: introMode ? "intro" : "tts",
            voice: voiceId,
            voiceName,
            error: safeStr(result.reason || "tts_failed"),
            detail: safeStr(result.message || result.error || "").slice(0, 220),
            provider: safeStr(result.provider || ""),
            retryable: !!result.retryable,
            text: safeStr(result.text || fallbackText || "")
          })
        };
      }

      if (safeStr(result.text || "")) {
        return {
          kind: "json",
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
        if (mod && typeof mod.delegateTts === "function") return mod.delegateTts;
        if (mod && typeof mod.ttsHandler === "function") return mod.ttsHandler;
        if (typeof mod === "function") return mod;
        if (mod && typeof mod.default === "function") return mod.default;
        if (mod && typeof mod.handleTts === "function") return mod.handleTts;
      } catch (_e) {}
    }

    return null;
  }

  async function delegateToTts(ttsHandler, req, payload, introMode) {
    const voiceId = resolveMixerVoice(payload);
    const voiceName = resolveMixerVoiceName(payload);
    const text = introMode ? resolveIntroText(payload) : oneLine(payload.text || "");
    const provider = oneLine(payload.provider || opts.defaultProvider || "");
    const format = oneLine(payload.format || opts.defaultFormat || "");
    const mime = oneLine(payload.mime || "");

    const ttsPayload = {
      text,
      message: text,
      prompt: text,
      voice: voiceId || "nyx",
      voiceId,
      voice_uuid: voiceId,
      voiceName,
      provider,
      format,
      output_format: format || "mp3",
      mime,
      sessionId: payload.sessionId || "",
      requestId: payload.requestId || "",
      lane: payload.lane || "",
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
      const wrapped = wrapHandlerResult(
        result,
        text,
        voiceId,
        voiceName,
        introMode
      );

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

      safeSendJson(
        res,
        wrapped.json && wrapped.json.ok === false && wrapped.json.error ? 503 : 200,
        wrapped.json
      );
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

    log("registered", {
      ttsRoutePath: opts.ttsRoutePath,
      introRoutePath: opts.introRoutePath,
      voiceRoutePath: opts.voiceRoutePath,
      preserveMixerVoice: true
    });

    return app;
  }

  return {
    version: VR_VERSION,
    register,
    handleVoice,
    resolveMixerVoice,
    resolveIntroText,
    normalizePayload
  };
}

function normalizeOptions(userOptions) {
  const input = isPlainObject(userOptions) ? userOptions : {};

  const allowedOrigins = Array.isArray(input.allowedOrigins)
    ? input.allowedOrigins.map((x) => oneLine(x)).filter(Boolean)
    : oneLine(input.allowedOrigins || process.env.CORS_ALLOW_ORIGIN || "*")
        .split(",")
        .map((x) => oneLine(x))
        .filter(Boolean);

  const allowOrigin = allowedOrigins.includes("*") ? "*" : (allowedOrigins[0] || "*");

  return {
    debug: !!input.debug || truthy(process.env.VOICE_ROUTE_DEBUG),
    ttsHandler: typeof input.ttsHandler === "function" ? input.ttsHandler : null,
    ttsModulePath:
      safeStr(input.ttsModulePath || "") ||
      safeStr(process.env.TTS_MODULE_PATH || ""),
    defaultProvider:
      safeStr(input.defaultProvider || "") ||
      safeStr(process.env.TTS_PROVIDER || ""),
    defaultFormat:
      safeStr(input.defaultFormat || "") ||
      safeStr(process.env.TTS_FORMAT || "mp3"),
    defaultIntroText:
      safeStr(input.defaultIntroText || "") ||
      safeStr(process.env.NYX_INTRO_TEXT || ""),
    mixerVoiceId:
      safeStr(input.mixerVoiceId || "") ||
      safeStr(process.env.MIXER_VOICE_ID || "") ||
      safeStr(process.env.RESEMBLE_VOICE_UUID || "") ||
      safeStr(process.env.SB_RESEMBLE_VOICE_UUID || "") ||
      safeStr(process.env.RESEMBLE_VOICE_ID || "") ||
      safeStr(process.env.NYX_VOICE_ID || ""),
    mixerVoiceName:
      safeStr(input.mixerVoiceName || "") ||
      safeStr(process.env.MIXER_VOICE_NAME || "") ||
      safeStr(process.env.NYX_VOICE_NAME || ""),
    ttsRoutePath:
      safeStr(input.ttsRoutePath || "") ||
      "/api/tts",
    introRoutePath:
      safeStr(input.introRoutePath || "") ||
      "/api/tts/intro",
    voiceRoutePath:
      safeStr(input.voiceRoutePath || "") ||
      "/api/voice-route",
    healthRoutePath:
      safeStr(input.healthRoutePath || "") ||
      "/api/tts/health",
    duplicateWindowMs: clampInt(
      input.duplicateWindowMs || process.env.VOICE_DUPLICATE_WINDOW_MS,
      4500,
      1000,
      15000
    ),
    maxTextLength: clampInt(
      input.maxTextLength || process.env.VOICE_MAX_TEXT_LENGTH,
      2000,
      120,
      12000
    ),
    allowedOrigins,
    allowedOriginsSet: new Set(allowedOrigins),
    allowOrigin
  };
}

/**
 * Convenience registration helper for index.js
 *
 * Usage:
 * const { registerVoiceRoutes } = require("./utils/voiceRoute");
 * registerVoiceRoutes(app, { ttsHandler: delegateTts });
 */
function registerVoiceRoutes(app, options) {
  const vr = createVoiceRoute(options);
  vr.register(app);
  return vr;
}

module.exports = {
  VR_VERSION,
  createVoiceRoute,
  registerVoiceRoutes
};
