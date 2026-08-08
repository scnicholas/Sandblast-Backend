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
 * - Phase B may extend the active conversation registry through Layer 26.
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
  "marion.layers9_24.partialCohesion.test/2.2-runtime-version-projection";

const PHASE_A_HARD_STOP = 24;
const PHASE_B_HARD_STOP = 26;
const REPOSITORY_GLOBAL_HARD_STOP = 28;
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

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanVersion(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function conversationLayerFromVersion(value) {
  const text = cleanVersion(value);
  if (!text) return null;

  const match = text.match(
    /conversationLayers\/(\d+)(?:\.\d+)?/i
  );

  if (!match) return null;

  const layer = Number(match[1]);
  return Number.isFinite(layer)
    ? layer
    : null;
}

function assertVersionProjectionCohesion({
  registryVersion,
  statusVersion,
  flowVersion,
  statusHardStop,
  flowHardStop
}) {
  const registryText = cleanVersion(registryVersion);
  const statusText = cleanVersion(statusVersion);
  const flowText = cleanVersion(flowVersion);

  assert.ok(registryText, "Conversation Layer Registry must expose VERSION.");
  assert.ok(flowText, "Conversation flow must expose version.");

  const registryLayer = conversationLayerFromVersion(registryText);
  const statusLayer = conversationLayerFromVersion(statusText);
  const flowLayer = conversationLayerFromVersion(flowText);

  if (registryLayer !== null) {
    assert.ok(
      registryLayer === PHASE_A_HARD_STOP || registryLayer === PHASE_B_HARD_STOP,
      `Registry VERSION identifies unsupported conversation layer ${registryLayer}.`
    );
  }

  if (statusLayer !== null) {
    assert.ok(
      statusLayer === PHASE_A_HARD_STOP || statusLayer === PHASE_B_HARD_STOP,
      `Registry status version identifies unsupported conversation layer ${statusLayer}.`
    );
  }

  if (flowLayer !== null) {
    assert.equal(
      flowLayer,
      flowHardStop,
      [
        "Flow version is not synchronized with the active conversation boundary.",
        `Flow version: ${flowText}`,
        `Flow hard stop: ${flowHardStop}`
      ].join("\n")
    );
  } else {
    assert.ok(
      flowText === registryText || (statusText && flowText === statusText),
      "Unparseable flow version must match the registry or registry-status version exactly."
    );
  }

  if (statusLayer !== null) {
    assert.equal(
      statusLayer,
      statusHardStop,
      [
        "Registry status version is not synchronized with the active registry boundary.",
        `Status version: ${statusText}`,
        `Status hard stop: ${statusHardStop}`
      ].join("\n")
    );
  }

  if (registryText !== flowText && registryLayer !== null && flowLayer !== null) {
    assert.equal(
      registryLayer,
      PHASE_A_HARD_STOP,
      "A version projection mismatch is only valid when the exported registry VERSION remains the Phase A base."
    );
    assert.equal(
      flowLayer,
      PHASE_B_HARD_STOP,
      "A version projection mismatch is only valid when the active flow has been advanced by Phase B."
    );
  }

  return {
    registryLayer,
    statusLayer,
    flowLayer,
    projectionMode: registryText === flowText
      ? "direct"
      : "phase_b_integrated_projection"
  };
}

function assertConversationRegistryBoundary(value, label) {
  assert.ok(
    isObject(value),
    `${label} must be an object.`
  );

  const activeStop = numberOrNull(value.hardStopLayer);

  assert.ok(
    activeStop === PHASE_A_HARD_STOP ||
    activeStop === PHASE_B_HARD_STOP,
    [
      `${label} reported an unsupported conversation hard stop.`,
      `Expected ${PHASE_A_HARD_STOP} (Phase A only) or ${PHASE_B_HARD_STOP} (Phase B integrated).`,
      `Actual: ${String(value.hardStopLayer)}`
    ].join("\\n")
  );

  if (
    hasLayer(value.layers, 25) ||
    hasLayer(value.layers, 26)
  ) {
    assert.equal(
      activeStop,
      PHASE_B_HARD_STOP,
      `${label} exposes Layers 25/26 but is not bounded at Layer 26.`
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(value, "phaseAHardStopLayer")
  ) {
    assert.equal(
      numberOrNull(value.phaseAHardStopLayer),
      PHASE_A_HARD_STOP,
      `${label} phaseAHardStopLayer must remain 24.`
    );
  }

  assert.ok(
    activeStop <= PHASE_B_HARD_STOP,
    `${label} must not absorb Layers 27–28 into the conversation registry.`
  );

  return activeStop;
}

function assertPhaseALocalBoundaryEvidence(flow, enriched) {
  const candidates = [
    flow && flow.phaseAHardStopLayer,
    flow && flow.phaseANuance && flow.phaseANuance.hardStopLayer,
    flow && flow.nuanceContext && flow.nuanceContext.hardStopLayer,
    enriched && enriched.phaseAHardStopLayer,
    enriched && enriched.responseShaping &&
      (enriched.responseShaping.hardStopAtLayer24 === true
        ? PHASE_A_HARD_STOP
        : enriched.responseShaping.phaseAHardStopLayer),
    enriched && enriched.composerContext && enriched.composerContext.hardStopLayer
  ];

  const phaseAStops = candidates
    .map(numberOrNull)
    .filter((value) => value !== null);

  const explicitLayer24Marker = Boolean(
    enriched &&
    enriched.responseShaping &&
    enriched.responseShaping.hardStopAtLayer24 === true
  );

  assert.ok(
    explicitLayer24Marker || phaseAStops.includes(PHASE_A_HARD_STOP),
    [
      "No explicit Phase A Layer 24 boundary evidence was found.",
      "The active registry may report Layer 26 after Phase B integration, but Phase A must remain explicitly bounded at Layer 24."
    ].join("\\n")
  );
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

  const statusHardStop =
    assertConversationRegistryBoundary(
      status,
      "Conversation Layer Registry status"
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
    cleanVersion(registry.VERSION);

  const statusVersion =
    cleanVersion(
      status.version ||
      status.registryVersion ||
      status.conversationVersion
    );

  const flowVersion =
    cleanVersion(flow.version);

  const flowHardStop =
    assertConversationRegistryBoundary(
      {
        ...flow,
        layers: flow.layers || status.layers
      },
      "Conversation flow"
    );

  const versionProjection =
    assertVersionProjectionCohesion({
      registryVersion,
      statusVersion,
      flowVersion,
      statusHardStop,
      flowHardStop
    });

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

  if (
    enriched.privateRuntimeContext &&
    Object.prototype.hasOwnProperty.call(
      enriched.privateRuntimeContext,
      "hardStopLayer"
    )
  ) {
    const privateRuntimeStop =
      numberOrNull(
        enriched.privateRuntimeContext.hardStopLayer
      );

    assert.ok(
      privateRuntimeStop === PHASE_A_HARD_STOP ||
      privateRuntimeStop === PHASE_B_HARD_STOP,
      `Private runtime context has unsupported hard stop: ${privateRuntimeStop}`
    );
  }

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

  assertPhaseALocalBoundaryEvidence(
    flow,
    enriched
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
        statusVersion: statusVersion || null,
        flowVersion,
        versionProjection,
        phaseALocalHardStopLayer:
          PHASE_A_HARD_STOP,
        activeConversationHardStopLayer:
          statusHardStop,
        flowHardStopLayer:
          flowHardStop,
        phaseBIntegrated:
          statusHardStop === PHASE_B_HARD_STOP,
        phaseBHardStopLayer:
          PHASE_B_HARD_STOP,
        repositoryGlobalHardStopLayer:
          REPOSITORY_GLOBAL_HARD_STOP,
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
