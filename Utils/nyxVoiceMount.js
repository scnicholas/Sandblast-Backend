"use strict";

/**
 * utils/nyxVoiceMount.js
 *
 * Canonical location:
 *   C:\Users\User\Desktop\sandblast backend\utils\nyxVoiceMount.js
 *
 * Mount once after express.json()/express.urlencoded() and before final 404
 * handlers. All dependencies are hardlocked to the same utils directory:
 *   ./tts.js
 *   ./voiceRoute.js
 *
 * The optional second argument allows index.js to preserve its existing TTS
 * compatibility routes while adding only the missing Nyx canonical routes.
 */

const tts = require("./tts.js");
const voiceRoute = require("./voiceRoute.js");

const NYX_VOICE_MOUNT_VERSION =
  "nyx.voice.utilsMount/2.1-health-contract-allowlist-hardlock";
const NYX_VOICE_HEALTH_CONTRACT =
  "nyx.voice.health/1.0-strict-allowlist";

const CANONICAL_VOICE_ROUTES = Object.freeze([
  "/api/nyx/voice",
  "/nyx/voice"
]);

const COMPATIBILITY_TTS_ROUTES = Object.freeze([
  "/api/tts",
  "/tts"
]);

const CANONICAL_HEALTH_ROUTES = Object.freeze([
  "/api/nyx/voice/health",
  "/nyx/voice/health"
]);

const COMPATIBILITY_HEALTH_ROUTES = Object.freeze([
  "/api/tts/health",
  "/tts/health"
]);

function callable(value) {
  return typeof value === "function" ? value : null;
}

function resolveVoiceHandler() {
  const handler =
    callable(voiceRoute && voiceRoute.voiceRoute) ||
    callable(voiceRoute && voiceRoute.route) ||
    callable(voiceRoute && voiceRoute.default) ||
    callable(voiceRoute);

  if (!handler) {
    throw new TypeError(
      "utils/voiceRoute.js does not export a callable route handler."
    );
  }

  return handler;
}

function resolveTtsHandler() {
  return (
    callable(tts && tts.handleTts) ||
    callable(tts && tts.ttsHandler) ||
    callable(tts && tts.handler) ||
    callable(tts && tts.default) ||
    callable(tts) ||
    resolveVoiceHandler()
  );
}

function resolveVoiceHealth() {
  return (
    callable(voiceRoute && voiceRoute.health) ||
    callable(voiceRoute && voiceRoute.getHealth) ||
    callable(voiceRoute && voiceRoute.status) ||
    callable(tts && tts.health) ||
    callable(tts && tts.getHealth) ||
    callable(tts && tts.status) ||
    null
  );
}

function resolveTtsHealth() {
  return (
    callable(tts && tts.health) ||
    callable(tts && tts.getHealth) ||
    callable(tts && tts.status) ||
    callable(voiceRoute && voiceRoute.health) ||
    callable(voiceRoute && voiceRoute.getHealth) ||
    callable(voiceRoute && voiceRoute.status) ||
    null
  );
}

function normalizeMountOptions(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.freeze({
    canonicalVoiceRoutes: source.canonicalVoiceRoutes !== false,
    compatibilityTtsRoutes: source.compatibilityTtsRoutes !== false,
    canonicalHealthRoutes: source.canonicalHealthRoutes !== false,
    compatibilityHealthRoutes: source.compatibilityHealthRoutes !== false
  });
}

function mountedRouteSet(app) {
  const existing =
    app && app.locals && Array.isArray(app.locals.__sandblastNyxVoiceRouteKeys)
      ? app.locals.__sandblastNyxVoiceRouteKeys
      : [];
  return new Set(existing.map((item) => String(item)));
}

function registerOnce(app, mounted, method, route, handler) {
  const verb = String(method || "").toLowerCase();
  const key = `${verb.toUpperCase()} ${route}`;
  if (mounted.has(key)) return false;
  if (!app || typeof app[verb] !== "function") {
    throw new TypeError(`Express app does not support ${verb.toUpperCase()}.`);
  }
  app[verb](route, handler);
  mounted.add(key);
  return true;
}

const HEALTH_STRING_LIMITS = Object.freeze({
  service: 64,
  healthContract: 128,
  scope: 64,
  version: 320,
  guideContract: 128,
  ttsModulePath: 260,
  ttsModuleResolvedPath: 520,
  ttsModuleRoot: 64,
  provider: 64,
  loadError: 320,
  error: 320,
  reason: 160,
  state: 64,
  status: 64,
  transport: 64,
  transportMode: 64
});

const HEALTH_BOOLEAN_KEYS = Object.freeze([
  "ok",
  "enabled",
  "ready",
  "configured",
  "degraded",
  "ttsModuleLoaded",
  "ttsDelegateBound",
  "ttsHealthBound",
  "voiceConfigured",
  "clientVoiceOverrideAllowed",
  "tokenConfigured",
  "endpointConfigured",
  "synthEndpointConfigured",
  "streamEndpointConfigured",
  "circuitOpen"
]);

const HEALTH_NUMBER_KEYS = Object.freeze([
  "providerStatus",
  "retryAfterMs",
  "lastSuccessAt",
  "lastFailureAt"
]);

const HEALTH_STRING_KEYS = Object.freeze([
  "service",
  "healthContract",
  "scope",
  "version",
  "guideContract",
  "ttsModulePath",
  "ttsModuleResolvedPath",
  "ttsModuleRoot",
  "provider",
  "loadError",
  "error",
  "reason",
  "state",
  "status",
  "transport",
  "transportMode"
]);

function cleanHealthString(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max || 240);
}

function finiteHealthNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function sanitizeOperationalHealth(value, depth = 0) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  const out = {};

  for (const key of HEALTH_BOOLEAN_KEYS) {
    if (typeof source[key] === "boolean") out[key] = source[key];
  }

  for (const key of HEALTH_NUMBER_KEYS) {
    const number = finiteHealthNumber(source[key]);
    if (number !== undefined) out[key] = number;
  }

  for (const key of HEALTH_STRING_KEYS) {
    const text = cleanHealthString(source[key], HEALTH_STRING_LIMITS[key]);
    if (text) out[key] = text;
  }

  if (Array.isArray(source.compatibilityRoutes)) {
    out.compatibilityRoutes = Object.freeze(
      source.compatibilityRoutes
        .map((item) => cleanHealthString(item, 160))
        .filter(Boolean)
        .slice(0, 8)
    );
  }

  const upstreamSource =
    source.upstream && typeof source.upstream === "object"
      ? source.upstream
      : source.upstreamHealth && typeof source.upstreamHealth === "object"
        ? source.upstreamHealth
        : null;
  if (upstreamSource && depth < 1) {
    const upstream = sanitizeOperationalHealth(upstreamSource, depth + 1);
    if (Object.keys(upstream).length) out.upstream = upstream;
  }

  return out;
}

function buildHealthPayload(snapshot, scope) {
  const sanitized = sanitizeOperationalHealth(snapshot);
  return {
    ok: sanitized.ok !== false,
    service:
      sanitized.service ||
      (scope === "tts_compatibility" ? "nyx-tts-compatibility" : "nyx-voice"),
    healthContract: NYX_VOICE_HEALTH_CONTRACT,
    scope: sanitized.scope || scope,
    version: sanitized.version || NYX_VOICE_MOUNT_VERSION,
    enabled:
      typeof sanitized.enabled === "boolean" ? sanitized.enabled : true,
    guideContract: sanitized.guideContract,
    ttsModuleLoaded: sanitized.ttsModuleLoaded,
    ttsModulePath: sanitized.ttsModulePath,
    ttsModuleResolvedPath: sanitized.ttsModuleResolvedPath,
    ttsModuleRoot: sanitized.ttsModuleRoot || "utils",
    ttsDelegateBound: sanitized.ttsDelegateBound,
    ttsHealthBound: sanitized.ttsHealthBound,
    voiceConfigured: sanitized.voiceConfigured,
    clientVoiceOverrideAllowed: sanitized.clientVoiceOverrideAllowed,
    provider: sanitized.provider,
    loadError: sanitized.loadError,
    error: sanitized.error,
    compatibilityRoutes: sanitized.compatibilityRoutes,
    upstream: sanitized.upstream,
    canonicalVoiceRoute: "/api/nyx/voice",
    canonicalHealthRoute: "/api/nyx/voice/health",
    moduleRoot: "utils",
    pathHardlock: true,
    timestamp: Date.now()
  };
}

function compactHealthPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

function applyHealthHeaders(res) {
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-SB-Nyx-Voice-Health-Contract", NYX_VOICE_HEALTH_CONTRACT);
  } catch (_) {}
}

function createHealthHandler(healthResolver, scope) {
  return async function nyxVoiceHealthHandler(_req, res) {
    applyHealthHeaders(res);
    try {
      const health = healthResolver();
      const snapshot = health
        ? await Promise.resolve(health())
        : { ok: true, enabled: true };

      const payload = compactHealthPayload(
        buildHealthPayload(snapshot, scope)
      );

      return res
        .status(payload.ok === false ? 503 : 200)
        .json(payload);
    } catch (error) {
      return res.status(503).json(
        compactHealthPayload({
          ok: false,
          service:
            scope === "tts_compatibility"
              ? "nyx-tts-compatibility"
              : "nyx-voice",
          healthContract: NYX_VOICE_HEALTH_CONTRACT,
          scope,
          version: NYX_VOICE_MOUNT_VERSION,
          enabled: false,
          error: cleanHealthString(
            (error && (error.message || error)) ||
              "nyx_voice_health_failed",
            HEALTH_STRING_LIMITS.error
          ),
          canonicalVoiceRoute: "/api/nyx/voice",
          canonicalHealthRoute: "/api/nyx/voice/health",
          moduleRoot: "utils",
          pathHardlock: true,
          timestamp: Date.now()
        })
      );
    }
  };
}

function mountNyxVoice(app, options) {
  if (
    !app ||
    typeof app.get !== "function" ||
    typeof app.post !== "function"
  ) {
    throw new TypeError("mountNyxVoice requires an Express app instance.");
  }

  app.locals = app.locals || {};
  const config = normalizeMountOptions(options);
  const mounted = mountedRouteSet(app);
  const voiceHandler = resolveVoiceHandler();
  const ttsHandler = resolveTtsHandler();
  const voiceHealthHandler = createHealthHandler(
    resolveVoiceHealth,
    "nyx_voice"
  );
  const ttsHealthHandler = createHealthHandler(
    resolveTtsHealth,
    "tts_compatibility"
  );

  if (config.canonicalVoiceRoutes) {
    for (const route of CANONICAL_VOICE_ROUTES) {
      registerOnce(app, mounted, "options", route, voiceHandler);
      registerOnce(app, mounted, "get", route, voiceHandler);
      registerOnce(app, mounted, "post", route, voiceHandler);
    }
  }

  if (config.compatibilityTtsRoutes) {
    for (const route of COMPATIBILITY_TTS_ROUTES) {
      registerOnce(app, mounted, "options", route, ttsHandler);
      registerOnce(app, mounted, "get", route, ttsHandler);
      registerOnce(app, mounted, "post", route, ttsHandler);
    }
  }

  if (config.canonicalHealthRoutes) {
    for (const route of CANONICAL_HEALTH_ROUTES) {
      registerOnce(app, mounted, "get", route, voiceHealthHandler);
    }
  }

  if (config.compatibilityHealthRoutes) {
    for (const route of COMPATIBILITY_HEALTH_ROUTES) {
      registerOnce(app, mounted, "get", route, ttsHealthHandler);
    }
  }

  const mountedKeys = Object.freeze(Array.from(mounted).sort());
  app.locals.__sandblastNyxVoiceMounted = mountedKeys.length > 0;
  app.locals.__sandblastNyxVoiceRouteKeys = mountedKeys;
  app.locals.__sandblastNyxVoiceRoutes = Object.freeze({
    version: NYX_VOICE_MOUNT_VERSION,
    moduleRoot: "utils",
    pathHardlock: true,
    options: config,
    canonical: CANONICAL_VOICE_ROUTES,
    compatibility: COMPATIBILITY_TTS_ROUTES,
    health: CANONICAL_HEALTH_ROUTES,
    compatibilityHealth: COMPATIBILITY_HEALTH_ROUTES,
    mountedKeys
  });

  return app;
}

module.exports = mountNyxVoice;
module.exports.mountNyxVoice = mountNyxVoice;
module.exports.VERSION = NYX_VOICE_MOUNT_VERSION;
module.exports.HEALTH_CONTRACT = NYX_VOICE_HEALTH_CONTRACT;
module.exports.routes = Object.freeze([
  ...CANONICAL_VOICE_ROUTES,
  ...COMPATIBILITY_TTS_ROUTES,
  ...CANONICAL_HEALTH_ROUTES,
  ...COMPATIBILITY_HEALTH_ROUTES
]);
module.exports.canonicalRoutes = CANONICAL_VOICE_ROUTES;
module.exports.compatibilityRoutes = COMPATIBILITY_TTS_ROUTES;
module.exports.healthRoutes = CANONICAL_HEALTH_ROUTES;
module.exports.compatibilityHealthRoutes = COMPATIBILITY_HEALTH_ROUTES;
module.exports.normalizeMountOptions = normalizeMountOptions;
module.exports.sanitizeOperationalHealth = sanitizeOperationalHealth;
module.exports.buildHealthPayload = buildHealthPayload;
