"use strict";

/**
 * scripts/route-mount-certification.js
 *
 * Certifies the canonical lowercase-utils Nyx route mount.
 *
 * The previous test expected a historical seven-route TTS-only profile even
 * though the current mount intentionally exposes 16 unique registrations.
 * This test validates the current declarative route plan and independently
 * proves that a second mount adds zero registrations.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

process.env.RESEMBLE_API_TOKEN =
  process.env.RESEMBLE_API_TOKEN ||
  "test-token";

process.env.RESEMBLE_VOICE_UUID =
  process.env.RESEMBLE_VOICE_UUID ||
  "83e8335f";

process.env.SB_TTS_LOG_ENABLED =
  "false";

const CERTIFICATION_VERSION =
  "nyx.routeMountCertification/2.2-plan-aware-idempotency";

const BACKEND_ROOT =
  path.resolve(
    __dirname,
    ".."
  );

const CANONICAL_MOUNT_PATH =
  path.join(
    BACKEND_ROOT,
    "utils",
    "nyxVoiceMount.js"
  );

const EXPECTED_DEFAULT_ROUTE_KEYS =
  Object.freeze([
    "OPTIONS /api/nyx/voice",
    "GET /api/nyx/voice",
    "POST /api/nyx/voice",

    "OPTIONS /nyx/voice",
    "GET /nyx/voice",
    "POST /nyx/voice",

    "OPTIONS /api/tts",
    "GET /api/tts",
    "POST /api/tts",

    "OPTIONS /tts",
    "GET /tts",
    "POST /tts",

    "GET /api/nyx/voice/health",
    "GET /nyx/voice/health",

    "GET /api/tts/health",
    "GET /tts/health"
  ]);

function assertCanonicalMountPath() {
  let stat;

  try {
    stat =
      fs.statSync(
        CANONICAL_MOUNT_PATH
      );
  } catch (error) {
    assert.fail(
      [
        "Unable to locate canonical nyxVoiceMount.js.",
        `Required path: ${CANONICAL_MOUNT_PATH}`,
        `Reason: ${error.message}`
      ].join("\n")
    );
  }

  assert.strictEqual(
    stat.isFile(),
    true,
    `Canonical mount path is not a file: ${CANONICAL_MOUNT_PATH}`
  );

  return CANONICAL_MOUNT_PATH;
}

function resolveMountExport(mod) {
  const mount =
    typeof mod === "function"
      ? mod
      : mod &&
        typeof mod.mountNyxVoice === "function"
        ? mod.mountNyxVoice
        : mod &&
          typeof mod.mount === "function"
          ? mod.mount
          : mod &&
            typeof mod.default === "function"
            ? mod.default
            : null;

  assert.strictEqual(
    typeof mount,
    "function",
    "utils/nyxVoiceMount.js must export a callable mount function."
  );

  return mount;
}

function createMockApp() {
  const registrations = [];

  const app = {
    locals: {},

    get(routePath, handler) {
      registrations.push([
        "GET",
        routePath,
        handler
      ]);
      return this;
    },

    post(routePath, handler) {
      registrations.push([
        "POST",
        routePath,
        handler
      ]);
      return this;
    },

    options(routePath, handler) {
      registrations.push([
        "OPTIONS",
        routePath,
        handler
      ]);
      return this;
    }
  };

  return {
    app,
    registrations
  };
}

function registrationKeys(registrations) {
  return registrations.map(
    ([method, routePath]) =>
      `${method} ${routePath}`
  );
}

function assertHandlers(registrations) {
  for (
    const [
      method,
      routePath,
      handler
    ] of registrations
  ) {
    assert.strictEqual(
      typeof handler,
      "function",
      `Handler must be a function for ${method} ${routePath}.`
    );
  }
}

function assertExactRouteSet(
  actualKeys,
  expectedKeys,
  label
) {
  const actual =
    [...actualKeys].sort();

  const expected =
    [...expectedKeys].sort();

  assert.deepStrictEqual(
    actual,
    expected,
    `${label} does not match the approved route plan.`
  );
}

function assertNoDuplicates(keys) {
  const unique =
    new Set(keys);

  assert.strictEqual(
    unique.size,
    keys.length,
    "Duplicate route registrations detected."
  );
}

const mountPath =
  assertCanonicalMountPath();

delete require.cache[
  require.resolve(mountPath)
];

const mountModule =
  require(mountPath);

const mount =
  resolveMountExport(
    mountModule
  );

assert.strictEqual(
  typeof mountModule.buildRoutePlan,
  "function",
  "nyxVoiceMount.js must export buildRoutePlan()."
);

const defaultPlan =
  mountModule.buildRoutePlan();

const defaultPlanKeys =
  defaultPlan.map(
    (entry) => entry.key
  );

assert.strictEqual(
  defaultPlan.length,
  EXPECTED_DEFAULT_ROUTE_KEYS.length,
  "Default route plan must expose exactly 16 approved registrations."
);

assertExactRouteSet(
  defaultPlanKeys,
  EXPECTED_DEFAULT_ROUTE_KEYS,
  "Default declarative route plan"
);

assertNoDuplicates(
  defaultPlanKeys
);

const {
  app,
  registrations
} = createMockApp();

assert.doesNotThrow(
  () => mount(app),
  "The first Nyx voice route mount must succeed."
);

const firstMountCount =
  registrations.length;

assert.strictEqual(
  firstMountCount,
  EXPECTED_DEFAULT_ROUTE_KEYS.length,
  "The first mount must register the complete approved route plan."
);

assert.doesNotThrow(
  () => mount(app),
  "The second Nyx voice route mount must be tolerated."
);

const secondMountCount =
  registrations.length;

const secondMountDelta =
  secondMountCount -
  firstMountCount;

assert.strictEqual(
  secondMountDelta,
  0,
  "The second mount must add zero route registrations."
);

const actualKeys =
  registrationKeys(
    registrations
  );

assertNoDuplicates(
  actualKeys
);

assertExactRouteSet(
  actualKeys,
  EXPECTED_DEFAULT_ROUTE_KEYS,
  "Mounted route set"
);

assertHandlers(
  registrations
);

assert.ok(
  app.locals &&
  app.locals.__sandblastNyxVoiceMounted,
  "Mount metadata must identify the app as mounted."
);

assertExactRouteSet(
  app.locals.__sandblastNyxVoiceRouteKeys,
  EXPECTED_DEFAULT_ROUTE_KEYS,
  "Persisted app.locals route keys"
);

const metadata =
  app.locals.__sandblastNyxVoiceRoutes;

assert.ok(
  metadata &&
  typeof metadata === "object",
  "Mount metadata must be available in app.locals."
);

assert.strictEqual(
  metadata.moduleRoot,
  "utils",
  "Mount metadata must preserve the lowercase utils hardlock."
);

assert.strictEqual(
  metadata.pathHardlock,
  true,
  "Mount metadata must report path hardlock."
);

assert.strictEqual(
  metadata.routeCount,
  EXPECTED_DEFAULT_ROUTE_KEYS.length,
  "Mount metadata routeCount is incorrect."
);

assert.strictEqual(
  metadata.mountCalls,
  2,
  "Mount metadata must record both mount attempts."
);

assert.strictEqual(
  metadata.registrations,
  EXPECTED_DEFAULT_ROUTE_KEYS.length,
  "Registration count must remain 16 after the second mount."
);

/*
 * Also certify an option-restricted profile. This proves route count is
 * derived from the selected plan rather than hardcoded globally.
 */
const restricted = createMockApp();

const restrictedOptions = {
  canonicalVoiceRoutes: false,
  canonicalHealthRoutes: false,
  compatibilityTtsRoutes: true,
  compatibilityHealthRoutes: true
};

const restrictedPlan =
  mountModule.buildRoutePlan(
    restrictedOptions
  );

assert.strictEqual(
  restrictedPlan.length,
  8,
  "The compatibility-only profile must contain eight registrations."
);

mount(
  restricted.app,
  restrictedOptions
);

mount(
  restricted.app,
  restrictedOptions
);

assert.strictEqual(
  restricted.registrations.length,
  restrictedPlan.length,
  "The compatibility-only profile must also remain idempotent."
);

assertExactRouteSet(
  registrationKeys(
    restricted.registrations
  ),
  restrictedPlan.map(
    (entry) => entry.key
  ),
  "Compatibility-only mounted route set"
);

console.log(
  JSON.stringify(
    {
      ok: true,
      certification:
        "nyx-route-mount",
      certificationVersion:
        CERTIFICATION_VERSION,
      mountVersion:
        mountModule.VERSION,
      mountPath,
      defaultRouteCount:
        actualKeys.length,
      firstMountCount,
      secondMountCount,
      secondMountDelta,
      defaultRoutes:
        actualKeys,
      restrictedRouteCount:
        restricted.registrations.length,
      idempotent:
        secondMountDelta === 0,
      handlersValid:
        true,
      pathHardlock:
        metadata.pathHardlock,
      moduleRoot:
        metadata.moduleRoot
    },
    null,
    2
  )
);
