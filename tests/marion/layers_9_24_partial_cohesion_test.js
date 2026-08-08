"use strict";

/**
 * tests/marion/layers_9_24_partial_cohesion_test.js
 *
 * Marion Layers 9–24 partial-cohesion certification.
 *
 * Canonical runtime:
 * Data/marion/runtime/conversation/marionConversationLayerRegistry.js
 *
 * Boundary contract:
 * - Layers 9–20 remain the established conversation/outcome/completion stack.
 * - Phase A Layers 21–24 remain locally bounded at Layer 24.
 * - This test does NOT redefine the repository/global hard stop, which may be
 *   raised to Layer 28 by the separately certified Layers 27–28 architecture.
 * - Current-turn corrections remain primary.
 * - Phase A nuance remains internal/non-authoritative.
 * - Public Nyx output must not expose private nuance state.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const VERSION =
  "marion.layers9_24.partialCohesion.test/2.0-baseline-freeze-hardening";

const PHASE_A_HARD_STOP = 24;
const MAX_OUTPUT_BYTES = 50000;

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const CANONICAL_TEST = path.join(
  BACKEND_ROOT,
  "tests",
  "marion",
  "layers_9_24_partial_cohesion_test.js"
);
const CANONICAL_REGISTRY = path.join(
  BACKEND_ROOT,
  "Data",
  "marion",
  "runtime",
  "conversation",
  "marionConversationLayerRegistry.js"
);

const originalLoad = Module._load;
let completionStubHits = 0;
let registryResolved = "";

function normalize(value) {
  return path.normalize(String(value || "")).toLowerCase();
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function hasLayer(layers, layer) {
  if (Array.isArray(layers)) {
    return (
      layers.includes(layer) ||
      Boolean(layers[layer])
    );
  }

  if (isObject(layers)) {
    return (
      Object.prototype.hasOwnProperty.call(layers, String(layer)) ||
      Object.prototype.hasOwnProperty.call(layers, layer)
    );
  }

  return false;
}

function assertBounded(value, label) {
  let serialized = "";

  assert.doesNotThrow(
    () => {
      serialized = JSON.stringify(value);
    },
    `${label} must be JSON-serializable.`
  );

  assert.ok(
    Buffer.byteLength(serialized, "utf8") < MAX_OUTPUT_BYTES,
    `${label} exceeded ${MAX_OUTPUT_BYTES} UTF-8 bytes.`
  );

  return serialized;
}

function assertNoPrivateNuanceLeak(value, label) {
  const serialized = assertBounded(value, label);

  assert.doesNotMatch(
    serialized,
    /"rawMarkerEvidence"\s*:|"rawNuanceEvidence"\s*:|"nuanceStatePatch"\s*:/i,
    `${label} exposed private/raw nuance material.`
  );
}

const completionStub = Object.freeze({
  VERSION:
    "marion.completionFlowCoordinator/20.0-test-contract",
  CONTRACT:
    "nyx.marion.completionFlow/1.0",

  context: Object.freeze({
    VERSION:
      "marion.crossDomainContext/18.0-test"
  }),

  realignment: Object.freeze({
    VERSION:
      "marion.goalRealignment/19.0-test"
  }),

  closure: Object.freeze({
    VERSION:
      "marion.decisionClosure/20.0-test"
  }),

  directQuery() {
    return false;
  },

  analyzeTurn({ turnId = "" } = {}) {
    return {
      version: this.VERSION,
      contract: this.CONTRACT,
      turnId,
      crossDomainContext: {},
      goalRealignment: {},
      decisionClosure: {
        hardStopAtLayer20: true,
        executionAuthorized: false
      },
      automaticExecutionAllowed: false,
      internalOnly: true
    };
  },

  commitTurn(value = {}) {
    return {
      ...value,
      committed: true
    };
  },

  projectState(value = {}) {
    return {
      ...value,
      version: this.VERSION,
      contract: this.CONTRACT
    };
  },

  reconcileResult(result = {}) {
    return result;
  },

  reconcileVisibleReply(reply = "") {
    return reply;
  }
});

function requestTargetsCompletionCoordinator(request) {
  const normalized =
    String(request || "")
      .replace(/\\/g, "/")
      .toLowerCase();

  return normalized.endsWith(
    "/completion/marioncompletionflowcoordinator.js"
  );
}

function parentIsCanonicalRegistry(parent) {
  const filename =
    parent &&
    typeof parent.filename === "string"
      ? parent.filename
      : "";

  if (!filename) {
    return false;
  }

  if (registryResolved) {
    return (
      normalize(filename) ===
      normalize(registryResolved)
    );
  }

  return /marionConversationLayerRegistry\.js$/i.test(
    filename
  );
}

function installScopedCompletionStub() {
  Module._load = function scopedMarionCompletionStub(
    request,
    parent,
    isMain
  ) {
    if (
      parentIsCanonicalRegistry(parent) &&
      requestTargetsCompletionCoordinator(request)
    ) {
      completionStubHits += 1;
      return completionStub;
    }

    return originalLoad.call(
      this,
      request,
      parent,
      isMain
    );
  };
}

function loadCanonicalRegistry() {
  assert.ok(
    fs.existsSync(CANONICAL_REGISTRY),
    [
      "Canonical Marion Conversation Layer Registry is missing.",
      `Expected: ${CANONICAL_REGISTRY}`
    ].join("\n")
  );

  registryResolved =
    require.resolve(CANONICAL_REGISTRY);

  assert.equal(
    normalize(registryResolved),
    normalize(CANONICAL_REGISTRY),
    [
      "Conversation Layer Registry resolution drifted.",
      `Expected: ${CANONICAL_REGISTRY}`,
      `Resolved: ${registryResolved}`
    ].join("\n")
  );

  const source =
    fs.readFileSync(
      CANONICAL_REGISTRY,
      "utf8"
    );

  assert.doesNotMatch(
    source,
    /^(?:<<<<<<<|=======|>>>>>>>)/m,
    "Conversation Layer Registry contains unresolved merge-conflict markers."
  );

  delete require.cache[
    registryResolved
  ];

  installScopedCompletionStub();

  try {
    return require(registryResolved);
  } catch (error) {
    throw new Error(
      [
        "Conversation Layer Registry failed during module loading.",
        `Resolved: ${registryResolved}`,
        `Cause: ${
          error &&
          error.message
            ? error.message
            : error
        }`
      ].join("\n"),
      { cause: error }
    );
  }
}

function requireCallable(api, name) {
  const descriptor =
    api &&
    Object.getOwnPropertyDescriptor(
      api,
      name
    );

  assert.ok(
    descriptor &&
    typeof descriptor.value === "function",
    `Conversation Layer Registry must expose ${name}().`
  );

  return descriptor.value.bind(api);
}

try {
  const actualTest =
    path.resolve(__filename);

  assert.equal(
    normalize(actualTest),
    normalize(CANONICAL_TEST),
    [
      "Layers 9–24 cohesion test pathway drifted.",
      `Expected: ${CANONICAL_TEST}`,
      `Actual: ${actualTest}`
    ].join("\n")
  );

  const registry =
    loadCanonicalRegistry();

  assert.ok(
    registry &&
    (
      typeof registry === "object" ||
      typeof registry === "function"
    ),
    "Conversation Layer Registry did not expose a CommonJS API."
  );

  const getStatus =
    requireCallable(
      registry,
      "getStatus"
    );

  const analyzeTurn =
    requireCallable(
      registry,
      "analyzeTurn"
    );

  const applyToInput =
    requireCallable(
      registry,
      "applyToInput"
    );

  const stripStrategicFlow =
    requireCallable(
      registry,
      "stripStrategicFlow"
    );

  assert.ok(
    completionStubHits > 0,
    [
      "The scoped Layer 20 completion stub was not used.",
      "The Conversation Layer Registry completion dependency path may have drifted."
    ].join("\n")
  );

  const status =
    getStatus();

  assert.ok(
    isObject(status),
    "Conversation Layer Registry status must be a non-array object."
  );

  assert.equal(
    Number(status.hardStopLayer),
    PHASE_A_HARD_STOP,
    "The dedicated Layers 9–24 registry must remain locally bounded at Layer 24."
  );

  assert.ok(
    hasLayer(status.layers, 21),
    "Conversation Layer Registry status does not expose Layer 21."
  );

  assert.ok(
    hasLayer(status.layers, 24),
    "Conversation Layer Registry status does not expose Layer 24."
  );

  assert.equal(
    status.culturalInferenceAllowed,
    false,
    "Phase A must not permit cultural inference."
  );

  assert.notEqual(
    status.automaticExecutionAllowed,
    true,
    "Layers 9–24 must not authorize automatic execution."
  );

  const input = {
    turnId: "cohesion-1",
    conversationId: "cohesion",
    directMarionAdminInterface: true,
    adminInterfaceScope:
      "marion_admin_conversation",
    message:
      "No, that is not what I meant. Keep the same task and correct the current file.",
    requestedDomain: "technical"
  };

  const flow =
    analyzeTurn(
      input,
      {},
      {}
    );

  assert.ok(
    isObject(flow),
    "Conversation Layer Registry analyzeTurn() must return an object."
  );

  const registryVersion =
    typeof registry.VERSION === "string"
      ? registry.VERSION.trim()
      : "";

  assert.ok(
    registryVersion,
    "Conversation Layer Registry must expose VERSION."
  );

  assert.equal(
    flow.version,
    registryVersion,
    "Flow version must remain synchronized with the active Conversation Layer Registry."
  );

  assert.match(
    registryVersion,
    /(?:^|[/.:-])24(?:[./:-]|$)/i,
    "Conversation Layer Registry VERSION no longer identifies the Layer 24 Phase A boundary."
  );

  assert.ok(
    isObject(flow.phaseANuance),
    "Phase A nuance projection is missing."
  );

  assert.equal(
    flow.phaseANuance.interactionState,
    "correction",
    "Explicit current-turn correction was not preserved."
  );

  assert.equal(
    Number(flow.hardStopLayer),
    PHASE_A_HARD_STOP,
    "Conversation flow local hard stop drifted from Layer 24."
  );

  assert.equal(
    flow.currentTurnIntentPrimary,
    true,
    "Current-turn intent must remain primary."
  );

  assert.ok(
    isObject(flow.progression) &&
    flow.progression.phaseAInteractionState,
    "Progression did not retain the Phase A interaction state."
  );

  assert.ok(
    isObject(flow.interactionCalibration) &&
    flow.interactionCalibration.phaseAResponsePolicy,
    "Interaction calibration did not retain the Phase A response policy."
  );

  assert.notEqual(
    flow.executionAuthorized,
    true,
    "Layers 9–24 conversation flow must not authorize execution."
  );

  assert.notEqual(
    flow.automaticExecutionAllowed,
    true,
    "Layers 9–24 conversation flow must not enable automatic execution."
  );

  assertBounded(
    flow,
    "Private Layers 9–24 conversation flow"
  );

  const enriched =
    applyToInput(
      input,
      {},
      {}
    );

  assert.ok(
    isObject(enriched),
    "applyToInput() must return an object."
  );

  assert.equal(
    Number(
      enriched.privateRuntimeContext &&
      enriched.privateRuntimeContext.hardStopLayer
    ),
    PHASE_A_HARD_STOP,
    "Private runtime context lost the Layer 24 Phase A boundary."
  );

  assert.ok(
    enriched.previousMemory &&
    enriched.previousMemory.nuanceState,
    "Approved Phase A nuance state was not carried into previousMemory."
  );

  assert.equal(
    enriched.responseShaping &&
    enriched.responseShaping.hardStopAtLayer24,
    true,
    "Response shaping lost the Layer 24 hard-stop marker."
  );

  const publicFlow =
    analyzeTurn(
      {
        turnId: "pub-1",
        surfaceAgent: "Nyx",
        audience: "public",
        message: "Hello"
      },
      {},
      {}
    );

  const stripped =
    stripStrategicFlow(
      publicFlow
    );

  assert.ok(
    isObject(stripped),
    "stripStrategicFlow() must return an object."
  );

  assert.equal(
    stripped.publicNuanceNoOp,
    true,
    "Public Nyx flow must remain a nuance no-op."
  );

  assert.equal(
    stripped.nuanceContext,
    undefined,
    "Public Nyx flow exposed private nuanceContext."
  );

  assert.equal(
    stripped.nuanceStatePatch,
    undefined,
    "Public Nyx flow exposed private nuanceStatePatch."
  );

  assertNoPrivateNuanceLeak(
    stripped,
    "Public Layers 9–24 projection"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        suite:
          "layers_9_24_partial_cohesion_test",
        version: VERSION,
        registryVersion,
        phaseALocalHardStopLayer:
          PHASE_A_HARD_STOP,
        repositoryGlobalHardStopUnaffected:
          true,
        currentTurnCorrectionPreserved:
          true,
        culturalInferenceAllowed:
          false,
        publicNuanceNoOp:
          true,
        completionStubHits
      },
      null,
      2
    )
  );

  console.log(
    "PASS layers_9_24_partial_cohesion_test"
  );
} finally {
  Module._load =
    originalLoad;

  if (registryResolved) {
    delete require.cache[
      registryResolved
    ];
  }
}
