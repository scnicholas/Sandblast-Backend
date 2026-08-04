"use strict";

/**
 * utils/nyxVoiceMount.js
 *
 * Canonical path:
 *   C:\Users\User\Desktop\sandblast backend\utils\nyxVoiceMount.js
 *
 * Responsibilities:
 * - Register the approved Nyx voice and TTS compatibility route plan.
 * - Mount each method/path pair at most once per Express app/router.
 * - Preserve the strict operational health allowlist.
 * - Keep all voice dependencies hardlocked to this lowercase utils folder.
 *
 * The default route plan contains 16 unique method/path registrations:
 * - 6 canonical Nyx voice registrations
 * - 6 compatibility TTS registrations
 * - 2 canonical health registrations
 * - 2 compatibility health registrations
 */

const tts = require("./tts.js");
const voiceRoute = require("./voiceRoute.js");

const NYX_VOICE_MOUNT_VERSION =
  "nyx.voice.utilsMount/2.2-route-plan-idempotency-hardlock";

const NYX_VOICE_HEALTH_CONTRACT =
  "nyx.voice.health/1.0-strict-allowlist";

const MOUNT_STATE_SYMBOL = Symbol.for(
  "sandblast.nyxVoiceMount.routeState"
);

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
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  return Object.freeze({
    canonicalVoiceRoutes:
      source.canonicalVoiceRoutes !== false,
    compatibilityTtsRoutes:
      source.compatibilityTtsRoutes !== false,
    canonicalHealthRoutes:
      source.canonicalHealthRoutes !== false,
    compatibilityHealthRoutes:
      source.compatibilityHealthRoutes !== false
  });
}

function freezeRouteEntry(method, route, handlerKey, family) {
  return Object.freeze({
    method: String(method).toUpperCase(),
    route,
    key: `${String(method).toUpperCase()} ${route}`,
    handlerKey,
    family
  });
}

function appendRouteFamily(
  plan,
  enabled,
  routes,
  methods,
  handlerKey,
  family
) {
  if (!enabled) return;

  for (const route of routes) {
    for (const method of methods) {
      plan.push(
        freezeRouteEntry(
          method,
          route,
          handlerKey,
          family
        )
      );
    }
  }
}

function buildRoutePlan(options) {
  const config = normalizeMountOptions(options);
  const plan = [];

  appendRouteFamily(
    plan,
    config.canonicalVoiceRoutes,
    CANONICAL_VOICE_ROUTES,
    ["OPTIONS", "GET", "POST"],
    "voice",
    "canonical_voice"
  );

  appendRouteFamily(
    plan,
    config.compatibilityTtsRoutes,
    COMPATIBILITY_TTS_ROUTES,
    ["OPTIONS", "GET", "POST"],
    "tts",
    "compatibility_tts"
  );

  appendRouteFamily(
    plan,
    config.canonicalHealthRoutes,
    CANONICAL_HEALTH_ROUTES,
    ["GET"],
    "voiceHealth",
    "canonical_health"
  );

  appendRouteFamily(
    plan,
    config.compatibilityHealthRoutes,
    COMPATIBILITY_HEALTH_ROUTES,
    ["GET"],
    "ttsHealth",
    "compatibility_health"
  );

  const keys = plan.map((entry) => entry.key);
  const uniqueKeys = new Set(keys);

  if (uniqueKeys.size !== keys.length) {
    throw new Error(
      "Nyx voice route plan contains duplicate method/path keys."
    );
  }

  return Object.freeze(plan);
}

function cleanHealthString(value, max) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max || 240);
}

function finiteHealthNumber(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : undefined;
}

function sanitizeOperationalHealth(value, depth = 0) {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};

  const out = {};

  for (const key of HEALTH_BOOLEAN_KEYS) {
    if (typeof source[key] === "boolean") {
      out[key] = source[key];
    }
  }

  for (const key of HEALTH_NUMBER_KEYS) {
    const number = finiteHealthNumber(source[key]);
    if (number !== undefined) {
      out[key] = number;
    }
  }

  for (const key of HEALTH_STRING_KEYS) {
    const text = cleanHealthString(
      source[key],
      HEALTH_STRING_LIMITS[key]
    );

    if (text) {
      out[key] = text;
    }
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
    source.upstream &&
    typeof source.upstream === "object"
      ? source.upstream
      : source.upstreamHealth &&
        typeof source.upstreamHealth === "object"
        ? source.upstreamHealth
        : null;

  if (upstreamSource && depth < 1) {
    const upstream = sanitizeOperationalHealth(
      upstreamSource,
      depth + 1
    );

    if (Object.keys(upstream).length) {
      out.upstream = upstream;
    }
  }

  return out;
}

function buildHealthPayload(snapshot, scope) {
  const sanitized =
    sanitizeOperationalHealth(snapshot);

  return {
    ok: sanitized.ok !== false,
    service:
      sanitized.service ||
      (
        scope === "tts_compatibility"
          ? "nyx-tts-compatibility"
          : "nyx-voice"
      ),
    healthContract:
      NYX_VOICE_HEALTH_CONTRACT,
    scope: sanitized.scope || scope,
    version:
      sanitized.version ||
      NYX_VOICE_MOUNT_VERSION,
    enabled:
      typeof sanitized.enabled === "boolean"
        ? sanitized.enabled
        : true,
    guideContract:
      sanitized.guideContract,
    ttsModuleLoaded:
      sanitized.ttsModuleLoaded,
    ttsModulePath:
      sanitized.ttsModulePath,
    ttsModuleResolvedPath:
      sanitized.ttsModuleResolvedPath,
    ttsModuleRoot:
      sanitized.ttsModuleRoot || "utils",
    ttsDelegateBound:
      sanitized.ttsDelegateBound,
    ttsHealthBound:
      sanitized.ttsHealthBound,
    voiceConfigured:
      sanitized.voiceConfigured,
    clientVoiceOverrideAllowed:
      sanitized.clientVoiceOverrideAllowed,
    provider:
      sanitized.provider,
    loadError:
      sanitized.loadError,
    error:
      sanitized.error,
    compatibilityRoutes:
      sanitized.compatibilityRoutes,
    upstream:
      sanitized.upstream,
    canonicalVoiceRoute:
      "/api/nyx/voice",
    canonicalHealthRoute:
      "/api/nyx/voice/health",
    moduleRoot:
      "utils",
    pathHardlock:
      true,
    timestamp:
      Date.now()
  };
}

function compactHealthPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined
    )
  );
}

function applyHealthHeaders(res) {
  try {
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, max-age=0"
    );
    res.setHeader(
      "Pragma",
      "no-cache"
    );
    res.setHeader(
      "X-Content-Type-Options",
      "nosniff"
    );
    res.setHeader(
      "X-SB-Nyx-Voice-Health-Contract",
      NYX_VOICE_HEALTH_CONTRACT
    );
  } catch (_) {
    // Health response must remain available when a test double
    // does not implement the full Express response API.
  }
}

function createHealthHandler(
  healthResolver,
  scope
) {
  return async function nyxVoiceHealthHandler(
    _req,
    res
  ) {
    applyHealthHeaders(res);

    try {
      const health = healthResolver();
      const snapshot = health
        ? await Promise.resolve(health())
        : {
            ok: true,
            enabled: true
          };

      const payload = compactHealthPayload(
        buildHealthPayload(
          snapshot,
          scope
        )
      );

      return res
        .status(payload.ok === false ? 503 : 200)
        .json(payload);
    } catch (error) {
      return res
        .status(503)
        .json(
          compactHealthPayload({
            ok: false,
            service:
              scope === "tts_compatibility"
                ? "nyx-tts-compatibility"
                : "nyx-voice",
            healthContract:
              NYX_VOICE_HEALTH_CONTRACT,
            scope,
            version:
              NYX_VOICE_MOUNT_VERSION,
            enabled: false,
            error: cleanHealthString(
              (
                error &&
                (error.message || error)
              ) ||
                "nyx_voice_health_failed",
              HEALTH_STRING_LIMITS.error
            ),
            canonicalVoiceRoute:
              "/api/nyx/voice",
            canonicalHealthRoute:
              "/api/nyx/voice/health",
            moduleRoot:
              "utils",
            pathHardlock:
              true,
            timestamp:
              Date.now()
          })
        );
    }
  };
}

function readLegacyMountedKeys(app) {
  const values =
    app &&
    app.locals &&
    Array.isArray(
      app.locals.__sandblastNyxVoiceRouteKeys
    )
      ? app.locals.__sandblastNyxVoiceRouteKeys
      : [];

  return values
    .map((item) => String(item))
    .filter(Boolean);
}

function getMountState(app) {
  if (
    app[MOUNT_STATE_SYMBOL] &&
    app[MOUNT_STATE_SYMBOL].keys instanceof Set
  ) {
    return app[MOUNT_STATE_SYMBOL];
  }

  const state = {
    keys: new Set(
      readLegacyMountedKeys(app)
    ),
    mountCalls: 0,
    registrations: 0
  };

  Object.defineProperty(
    app,
    MOUNT_STATE_SYMBOL,
    {
      value: state,
      configurable: false,
      enumerable: false,
      writable: false
    }
  );

  return state;
}

function assertExpressMethods(app, plan) {
  if (!app || typeof app !== "object" && typeof app !== "function") {
    throw new TypeError(
      "mountNyxVoice requires an Express app or router."
    );
  }

  const requiredVerbs = new Set(
    plan.map((entry) =>
      entry.method.toLowerCase()
    )
  );

  const missing = [...requiredVerbs].filter(
    (verb) =>
      typeof app[verb] !== "function"
  );

  if (missing.length) {
    throw new TypeError(
      `Express app does not support required methods: ${missing
        .map((verb) => verb.toUpperCase())
        .join(", ")}.`
    );
  }
}

function resolveHandlerMap(plan) {
  const needed = new Set(
    plan.map((entry) => entry.handlerKey)
  );

  const handlers = {};

  if (needed.has("voice")) {
    handlers.voice =
      resolveVoiceHandler();
  }

  if (needed.has("tts")) {
    handlers.tts =
      resolveTtsHandler();
  }

  if (needed.has("voiceHealth")) {
    handlers.voiceHealth =
      createHealthHandler(
        resolveVoiceHealth,
        "nyx_voice"
      );
  }

  if (needed.has("ttsHealth")) {
    handlers.ttsHealth =
      createHealthHandler(
        resolveTtsHealth,
        "tts_compatibility"
      );
  }

  return handlers;
}

function mirrorMountState(
  app,
  state,
  config,
  plan
) {
  app.locals = app.locals || {};

  const mountedKeys = Object.freeze(
    Array.from(state.keys).sort()
  );

  app.locals.__sandblastNyxVoiceMounted =
    mountedKeys.length > 0;

  app.locals.__sandblastNyxVoiceRouteKeys =
    mountedKeys;

  app.locals.__sandblastNyxVoiceRoutes =
    Object.freeze({
      version:
        NYX_VOICE_MOUNT_VERSION,
      healthContract:
        NYX_VOICE_HEALTH_CONTRACT,
      moduleRoot:
        "utils",
      pathHardlock:
        true,
      options:
        config,
      canonical:
        CANONICAL_VOICE_ROUTES,
      compatibility:
        COMPATIBILITY_TTS_ROUTES,
      health:
        CANONICAL_HEALTH_ROUTES,
      compatibilityHealth:
        COMPATIBILITY_HEALTH_ROUTES,
      plannedKeys:
        Object.freeze(
          plan.map((entry) => entry.key)
        ),
      mountedKeys,
      routeCount:
        mountedKeys.length,
      mountCalls:
        state.mountCalls,
      registrations:
        state.registrations
    });
}

function mountNyxVoice(app, options) {
  const config =
    normalizeMountOptions(options);

  const plan =
    buildRoutePlan(config);

  assertExpressMethods(
    app,
    plan
  );

  app.locals = app.locals || {};

  const state =
    getMountState(app);

  state.mountCalls += 1;

  const missingPlanEntries =
    plan.filter(
      (entry) =>
        !state.keys.has(entry.key)
    );

  if (missingPlanEntries.length) {
    const handlers =
      resolveHandlerMap(
        missingPlanEntries
      );

    for (const entry of missingPlanEntries) {
      const verb =
        entry.method.toLowerCase();

      const handler =
        handlers[entry.handlerKey];

      if (
        typeof handler !== "function"
      ) {
        throw new TypeError(
          `No callable handler resolved for ${entry.key}.`
        );
      }

      app[verb](
        entry.route,
        handler
      );

      /*
       * Persist after every successful registration. This prevents a later
       * retry from duplicating routes if a subsequent registration fails.
       */
      state.keys.add(
        entry.key
      );

      state.registrations += 1;

      mirrorMountState(
        app,
        state,
        config,
        plan
      );
    }
  }

  mirrorMountState(
    app,
    state,
    config,
    plan
  );

  return app;
}

const DEFAULT_ROUTE_PLAN =
  buildRoutePlan();

module.exports =
  mountNyxVoice;

module.exports.mountNyxVoice =
  mountNyxVoice;

module.exports.VERSION =
  NYX_VOICE_MOUNT_VERSION;

module.exports.HEALTH_CONTRACT =
  NYX_VOICE_HEALTH_CONTRACT;

module.exports.MOUNT_STATE_SYMBOL =
  MOUNT_STATE_SYMBOL;

module.exports.routes = Object.freeze([
  ...CANONICAL_VOICE_ROUTES,
  ...COMPATIBILITY_TTS_ROUTES,
  ...CANONICAL_HEALTH_ROUTES,
  ...COMPATIBILITY_HEALTH_ROUTES
]);

module.exports.defaultRoutePlan =
  DEFAULT_ROUTE_PLAN;

module.exports.defaultRouteKeys =
  Object.freeze(
    DEFAULT_ROUTE_PLAN.map(
      (entry) => entry.key
    )
  );

module.exports.canonicalRoutes =
  CANONICAL_VOICE_ROUTES;

module.exports.compatibilityRoutes =
  COMPATIBILITY_TTS_ROUTES;

module.exports.healthRoutes =
  CANONICAL_HEALTH_ROUTES;

module.exports.compatibilityHealthRoutes =
  COMPATIBILITY_HEALTH_ROUTES;

module.exports.normalizeMountOptions =
  normalizeMountOptions;

module.exports.buildRoutePlan =
  buildRoutePlan;

module.exports.sanitizeOperationalHealth =
  sanitizeOperationalHealth;

module.exports.buildHealthPayload =
  buildHealthPayload;
