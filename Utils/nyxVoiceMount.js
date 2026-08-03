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
  "nyx.voice.utilsMount/2.0-canonical-utils-granular-idempotence";

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

function createHealthHandler(healthResolver, scope) {
  return async function nyxVoiceHealthHandler(_req, res) {
    try {
      const health = healthResolver();
      const snapshot = health
        ? await Promise.resolve(health())
        : { ok: true, enabled: true };

      const payload =
        snapshot && typeof snapshot === "object"
          ? { ...snapshot }
          : { ok: true, enabled: true };

      payload.scope = payload.scope || scope;
      payload.version = payload.version || NYX_VOICE_MOUNT_VERSION;
      payload.canonicalVoiceRoute = "/api/nyx/voice";
      payload.canonicalHealthRoute = "/api/nyx/voice/health";
      payload.moduleRoot = "utils";
      payload.pathHardlock = true;

      return res
        .status(payload.ok === false ? 503 : 200)
        .json(payload);
    } catch (error) {
      return res.status(503).json({
        ok: false,
        scope,
        version: NYX_VOICE_MOUNT_VERSION,
        error: String(
          (error && (error.message || error)) ||
            "nyx_voice_health_failed"
        ),
        canonicalVoiceRoute: "/api/nyx/voice",
        canonicalHealthRoute: "/api/nyx/voice/health",
        moduleRoot: "utils",
        pathHardlock: true
      });
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
