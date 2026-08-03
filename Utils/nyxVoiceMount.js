"use strict";

/**
 * Drop-in Nyx voice route mount.
 *
 * Canonical location:
 *   C:\Users\User\Desktop\sandblast backend\utils\nyxVoiceMount.js
 *
 * Call once after express.json()/express.urlencoded() and before the final
 * 404/error handlers:
 *   require("./utils/nyxVoiceMount")(app);
 *
 * Local dependencies are resolved from the same utils folder:
 *   ./tts.js
 *   ./voiceRoute.js
 */
const tts = require("./tts");
const voiceRoute = require("./voiceRoute");

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

function resolveVoiceHandler() {
  const handler =
    voiceRoute.voiceRoute ||
    voiceRoute.route ||
    voiceRoute.default ||
    voiceRoute;

  if (typeof handler !== "function") {
    throw new TypeError("utils/voiceRoute.js does not export a callable route handler.");
  }

  return handler;
}

function resolveTtsHandler() {
  const handler =
    tts.handleTts ||
    tts.ttsHandler ||
    tts.handler ||
    tts.default ||
    (typeof tts === "function" ? tts : null);

  return typeof handler === "function" ? handler : resolveVoiceHandler();
}

function resolveVoiceHealth() {
  return (
    voiceRoute.health ||
    voiceRoute.getHealth ||
    voiceRoute.status ||
    tts.health ||
    tts.getHealth ||
    tts.status ||
    null
  );
}

function resolveTtsHealth() {
  return (
    tts.health ||
    tts.getHealth ||
    tts.status ||
    voiceRoute.health ||
    voiceRoute.getHealth ||
    voiceRoute.status ||
    null
  );
}

function registerRoute(app, route, handler) {
  if (typeof app.options === "function") app.options(route, handler);
  app.get(route, handler);
  app.post(route, handler);
}

function createHealthHandler(healthResolver, scope) {
  return async function nyxVoiceHealthHandler(_req, res) {
    try {
      const health = healthResolver();
      const snapshot = typeof health === "function"
        ? await Promise.resolve(health())
        : { ok: true, enabled: true };

      const payload = snapshot && typeof snapshot === "object"
        ? { ...snapshot }
        : { ok: true, enabled: true };

      payload.scope = payload.scope || scope;
      payload.canonicalVoiceRoute = "/api/nyx/voice";
      payload.canonicalHealthRoute = "/api/nyx/voice/health";
      payload.moduleRoot = "utils";

      return res
        .status(payload.ok === false ? 503 : 200)
        .json(payload);
    } catch (error) {
      return res.status(503).json({
        ok: false,
        scope,
        error: String(
          (error && (error.message || error)) ||
          "nyx_voice_health_failed"
        ),
        canonicalVoiceRoute: "/api/nyx/voice",
        canonicalHealthRoute: "/api/nyx/voice/health",
        moduleRoot: "utils"
      });
    }
  };
}

function mountNyxVoice(app) {
  if (!app || typeof app.get !== "function" || typeof app.post !== "function") {
    throw new TypeError("mountNyxVoice requires an Express app instance.");
  }

  app.locals = app.locals || {};
  if (app.locals.__sandblastNyxVoiceMounted) return app;

  const voiceHandler = resolveVoiceHandler();
  const ttsHandler = resolveTtsHandler();
  const voiceHealthHandler = createHealthHandler(resolveVoiceHealth, "nyx_voice");
  const ttsHealthHandler = createHealthHandler(resolveTtsHealth, "tts_compatibility");

  for (const route of CANONICAL_VOICE_ROUTES) {
    registerRoute(app, route, voiceHandler);
  }

  for (const route of COMPATIBILITY_TTS_ROUTES) {
    registerRoute(app, route, ttsHandler);
  }

  for (const route of CANONICAL_HEALTH_ROUTES) {
    app.get(route, voiceHealthHandler);
  }

  for (const route of COMPATIBILITY_HEALTH_ROUTES) {
    app.get(route, ttsHealthHandler);
  }

  app.locals.__sandblastNyxVoiceMounted = true;
  app.locals.__sandblastNyxVoiceRoutes = Object.freeze({
    canonical: CANONICAL_VOICE_ROUTES,
    compatibility: COMPATIBILITY_TTS_ROUTES,
    health: CANONICAL_HEALTH_ROUTES,
    compatibilityHealth: COMPATIBILITY_HEALTH_ROUTES
  });

  return app;
}

module.exports = mountNyxVoice;
module.exports.mountNyxVoice = mountNyxVoice;
module.exports.routes = Object.freeze([
  ...CANONICAL_VOICE_ROUTES,
  ...COMPATIBILITY_TTS_ROUTES,
  ...CANONICAL_HEALTH_ROUTES,
  ...COMPATIBILITY_HEALTH_ROUTES
]);
module.exports.canonicalRoutes = CANONICAL_VOICE_ROUTES;
module.exports.compatibilityRoutes = COMPATIBILITY_TTS_ROUTES;
module.exports.healthRoutes = CANONICAL_HEALTH_ROUTES;
