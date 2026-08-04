"use strict";

/**
 * tests/marion/layers_9_24_partial_cohesion_test.js
 *
 * Purpose:
 * - Certify the Layers 9–24 cohesion baseline.
 * - Remain valid when the active conversation registry extends beyond Layer 24.
 * - Fail on regression below Layer 24, missing baseline layers, contract drift,
 *   private-state loss, or public strategic-flow leakage.
 *
 * This test intentionally does not claim to certify Layers 25+ in full.
 * It verifies that later extensions preserve the established 9–24 contract.
 */

const assert = require("assert");
const Module = require("module");
const path = require("path");

const TEST_VERSION =
  "marion.layers9_24PartialCohesionTest/2.2-unicode-contract-normalization";

const BASELINE_START_LAYER = 9;
const BASELINE_HARD_STOP_LAYER = 24;
const BASELINE_REQUIRED_LAYERS = Object.freeze([21, 24]);

const REGISTRY_PATH = path.resolve(
  __dirname,
  "../../Data/marion/runtime/conversation/marionConversationLayerRegistry.js"
);

const originalLoad = Module._load;
const previousRegistryCacheEntry = require.cache[REGISTRY_PATH];

const completionStub = Object.freeze({
  VERSION: "marion.completionFlowCoordinator/20.0-test-contract",
  CONTRACT: "nyx.marion.completionFlow/1.0",

  context: Object.freeze({
    VERSION: "marion.crossDomainContext/18.0-test"
  }),

  realignment: Object.freeze({
    VERSION: "marion.goalRealignment/19.0-test"
  }),

  closure: Object.freeze({
    VERSION: "marion.decisionClosure/20.0-test"
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
        hardStopAtLayer20: true
      },
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

function isPlainObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function assertPlainObject(value, label) {
  assert.ok(
    isPlainObject(value),
    `${label} must be a plain object.`
  );
}

function assertCallable(value, label) {
  assert.strictEqual(
    typeof value,
    "function",
    `${label} must be exported as a function.`
  );
}

function normalizeRequestPath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

function isRegistryParent(parent) {
  const filename = normalizeRequestPath(parent && parent.filename);
  return filename.endsWith(
    "/data/marion/runtime/conversation/marionconversationlayerregistry.js"
  );
}

function isCompletionCoordinatorRequest(request) {
  const normalized = normalizeRequestPath(request);

  return normalized ===
      "../completion/marioncompletionflowcoordinator.js" ||
    normalized.endsWith(
      "/completion/marioncompletionflowcoordinator.js"
    );
}

function normalizeConversationLayerVersion(value) {
  return String(value || "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*\.\s*/g, ".");
}

function conversationLayerVersionCodePoints(value) {
  return Array.from(String(value || "")).map((character) => ({
    character,
    codePoint: `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`
  }));
}

function parseConversationLayerVersion(value) {
  const raw = String(value || "");
  const text = normalizeConversationLayerVersion(raw);

  const baseMatch = text.match(
    /^marion\.conversationLayers\/(\d+)(?:\.(\d+))?(.*)$/i
  );

  if (!baseMatch) {
    return null;
  }

  const activeLayer = Number(baseMatch[1]);
  const minor = Number(baseMatch[2] || 0);
  const tail = String(baseMatch[3] || "");

  if (
    !Number.isInteger(activeLayer) ||
    activeLayer < 1 ||
    !Number.isInteger(minor) ||
    minor < 0
  ) {
    return null;
  }

  if (!tail) {
    return {
      raw,
      normalized: text,
      activeLayer,
      minor,
      cohesiveStartLayer: null,
      cohesiveEndLayer: null,
      part: null,
      extensionTags: []
    };
  }

  const cohesiveMatch = tail.match(
    /^-cohesive-(\d+)-(\d+)-part(\d+)(.*)$/i
  );

  if (!cohesiveMatch) {
    return null;
  }

  const cohesiveStartLayer = Number(cohesiveMatch[1]);
  const cohesiveEndLayer = Number(cohesiveMatch[2]);
  const part = Number(cohesiveMatch[3]);
  const extensionTail = String(cohesiveMatch[4] || "");

  if (
    !Number.isInteger(cohesiveStartLayer) ||
    !Number.isInteger(cohesiveEndLayer) ||
    !Number.isInteger(part) ||
    cohesiveStartLayer < 1 ||
    cohesiveEndLayer < cohesiveStartLayer ||
    part < 1
  ) {
    return null;
  }

  const extensionTags = [];

  if (extensionTail) {
    if (!/^(?:-[a-z][a-z0-9._]*)+$/i.test(extensionTail)) {
      return null;
    }

    extensionTags.push(
      ...extensionTail
        .split("-")
        .map((item) => item.trim())
        .filter(Boolean)
    );
  }

  return {
    raw,
    normalized: text,
    activeLayer,
    minor,
    cohesiveStartLayer,
    cohesiveEndLayer,
    part,
    extensionTags
  };
}

function layerEnabled(layers, layerNumber) {
  if (!layers) {
    return false;
  }

  try {
    return Boolean(layers[layerNumber]);
  } catch (_) {
    return false;
  }
}

function dynamicHardStopFlag(responseShaping, layerNumber) {
  if (!isPlainObject(responseShaping)) {
    return undefined;
  }

  const key = `hardStopAtLayer${layerNumber}`;

  return Object.prototype.hasOwnProperty.call(
    responseShaping,
    key
  )
    ? responseShaping[key]
    : undefined;
}

function buildFailureContext({
  status,
  flow,
  enriched,
  publicFlow,
  stripped
} = {}) {
  return {
    testVersion: TEST_VERSION,
    registryPath: REGISTRY_PATH,
    baseline: {
      startLayer: BASELINE_START_LAYER,
      hardStopLayer: BASELINE_HARD_STOP_LAYER,
      requiredLayers: BASELINE_REQUIRED_LAYERS
    },
    observed: {
      statusHardStopLayer:
        status && status.hardStopLayer,
      statusLayerKeys:
        status && status.layers
          ? Object.keys(status.layers)
          : [],
      flowVersion:
        flow && flow.version,
      flowHardStopLayer:
        flow && flow.hardStopLayer,
      enrichedHardStopLayer:
        enriched &&
        enriched.privateRuntimeContext &&
        enriched.privateRuntimeContext.hardStopLayer,
      publicNuanceNoOp:
        stripped && stripped.publicNuanceNoOp,
      publicFlowPresent:
        Boolean(publicFlow)
    }
  };
}

Module._load = function patchedModuleLoad(
  request,
  parent,
  isMain
) {
  if (
    isCompletionCoordinatorRequest(request) &&
    isRegistryParent(parent)
  ) {
    return completionStub;
  }

  return originalLoad.call(
    this,
    request,
    parent,
    isMain
  );
};

let status;
let flow;
let enriched;
let publicFlow;
let stripped;

try {
  /*
   * Force this test to evaluate the registry under the controlled completion
   * stub even when a parent test runner has already populated require.cache.
   */
  delete require.cache[REGISTRY_PATH];

  const registry = require(REGISTRY_PATH);

  assertPlainObject(registry, "Conversation layer registry");
  assertCallable(registry.getStatus, "registry.getStatus");
  assertCallable(registry.analyzeTurn, "registry.analyzeTurn");
  assertCallable(registry.applyToInput, "registry.applyToInput");
  assertCallable(
    registry.stripStrategicFlow,
    "registry.stripStrategicFlow"
  );

  status = registry.getStatus();

  assertPlainObject(status, "Registry status");
  assert.ok(
    Number.isInteger(status.hardStopLayer),
    "status.hardStopLayer must be an integer."
  );
  assert.ok(
    status.hardStopLayer >= BASELINE_HARD_STOP_LAYER,
    `Conversation registry regressed below Layer ${BASELINE_HARD_STOP_LAYER}. ` +
      `Observed Layer ${status.hardStopLayer}.`
  );

  assert.ok(
    status.layers &&
    (
      typeof status.layers === "object" ||
      Array.isArray(status.layers)
    ),
    "status.layers must expose the active layer registry."
  );

  for (const layerNumber of BASELINE_REQUIRED_LAYERS) {
    assert.ok(
      layerEnabled(status.layers, layerNumber),
      `Required baseline Layer ${layerNumber} is unavailable.`
    );
  }

  assert.ok(
    layerEnabled(status.layers, status.hardStopLayer),
    `The active hard-stop Layer ${status.hardStopLayer} ` +
      "must exist in status.layers."
  );

  assert.strictEqual(
    status.culturalInferenceAllowed,
    false,
    "Cultural inference must remain disabled in this partial-cohesion contract."
  );

  const input = {
    turnId: "cohesion-1",
    conversationId: "cohesion",
    directMarionAdminInterface: true,
    adminInterfaceScope: "marion_admin_conversation",
    message:
      "No, that is not what I meant. Keep the same task and correct the current file.",
    requestedDomain: "technical"
  };

  flow = registry.analyzeTurn(
    input,
    {},
    {}
  );

  assertPlainObject(flow, "Private cohesion flow");

  const parsedVersion = parseConversationLayerVersion(
    flow.version
  );

  assert.ok(
    parsedVersion,
    [
      `Unexpected conversation-layer version contract: ${String(flow.version)}`,
      `Normalized contract: ${normalizeConversationLayerVersion(flow.version)}`,
      `Code points: ${JSON.stringify(conversationLayerVersionCodePoints(flow.version))}`
    ].join("\n")
  );

  assert.ok(
    parsedVersion.activeLayer >= BASELINE_HARD_STOP_LAYER,
    "The flow version must retain the Layer 24 baseline."
  );

  assert.ok(
    parsedVersion.activeLayer <= status.hardStopLayer,
    "The flow version cannot claim a layer beyond the active registry hard stop."
  );

  if (parsedVersion.cohesiveStartLayer !== null) {
    assert.ok(
      parsedVersion.cohesiveStartLayer <= BASELINE_START_LAYER,
      "The cohesive version scope must include Layer 9."
    );
  }

  if (parsedVersion.cohesiveEndLayer !== null) {
    assert.ok(
      parsedVersion.cohesiveEndLayer >= BASELINE_HARD_STOP_LAYER,
      "The cohesive version scope must include Layer 24."
    );
    assert.ok(
      parsedVersion.cohesiveEndLayer <= status.hardStopLayer,
      "The cohesive version scope cannot exceed the active hard stop."
    );
  }

  assertPlainObject(
    flow.phaseANuance,
    "flow.phaseANuance"
  );
  assert.strictEqual(
    flow.phaseANuance.interactionState,
    "correction",
    "The current corrective turn must retain correction-state authority."
  );

  assert.strictEqual(
    flow.hardStopLayer,
    status.hardStopLayer,
    "Flow and registry hard-stop layers must agree."
  );

  assert.strictEqual(
    flow.currentTurnIntentPrimary,
    true,
    "The current turn must remain primary over historical state."
  );

  assertPlainObject(
    flow.progression,
    "flow.progression"
  );
  assert.ok(
    flow.progression.phaseAInteractionState,
    "Progression must carry the Phase A interaction state."
  );

  assertPlainObject(
    flow.interactionCalibration,
    "flow.interactionCalibration"
  );
  assert.ok(
    flow.interactionCalibration.phaseAResponsePolicy,
    "Interaction calibration must expose the Phase A response policy."
  );

  enriched = registry.applyToInput(
    input,
    {},
    {}
  );

  assertPlainObject(enriched, "Enriched private input");
  assertPlainObject(
    enriched.privateRuntimeContext,
    "enriched.privateRuntimeContext"
  );
  assert.strictEqual(
    enriched.privateRuntimeContext.hardStopLayer,
    status.hardStopLayer,
    "Enriched private runtime context must carry the active hard stop."
  );

  assertPlainObject(
    enriched.previousMemory,
    "enriched.previousMemory"
  );
  assert.ok(
    enriched.previousMemory.nuanceState,
    "Enriched memory must retain the nuance state."
  );

  assertPlainObject(
    enriched.responseShaping,
    "enriched.responseShaping"
  );
  assert.strictEqual(
    enriched.responseShaping.hardStopAtLayer24,
    true,
    "Layer 24 response-shaping compatibility must remain active."
  );

  const extensionHardStopFlag = dynamicHardStopFlag(
    enriched.responseShaping,
    status.hardStopLayer
  );

  if (
    status.hardStopLayer > BASELINE_HARD_STOP_LAYER &&
    extensionHardStopFlag !== undefined
  ) {
    assert.strictEqual(
      extensionHardStopFlag,
      true,
      `Dynamic response shaping must acknowledge Layer ${status.hardStopLayer}.`
    );
  }

  publicFlow = registry.analyzeTurn(
    {
      turnId: "pub-1",
      surfaceAgent: "Nyx",
      audience: "public",
      message: "Hello"
    },
    {},
    {}
  );

  stripped = registry.stripStrategicFlow(
    publicFlow
  );

  assertPlainObject(
    stripped,
    "Stripped public flow"
  );
  assert.strictEqual(
    stripped.publicNuanceNoOp,
    true,
    "Public Nyx flow must remain a nuance no-op."
  );
  assert.strictEqual(
    stripped.nuanceContext,
    undefined,
    "Public flow must not expose nuanceContext."
  );
  assert.strictEqual(
    stripped.nuanceStatePatch,
    undefined,
    "Public flow must not expose nuanceStatePatch."
  );

  console.log(
    "PASS layers_9_24_partial_cohesion_test",
    JSON.stringify({
      testVersion: TEST_VERSION,
      baselineHardStopLayer:
        BASELINE_HARD_STOP_LAYER,
      activeHardStopLayer:
        status.hardStopLayer,
      flowVersion:
        flow.version,
      normalizedFlowVersion:
        parsedVersion.normalized,
      versionPart:
        parsedVersion.part,
      versionExtensionTags:
        parsedVersion.extensionTags,
      extensionAware:
        status.hardStopLayer >
        BASELINE_HARD_STOP_LAYER
    })
  );
} catch (error) {
  console.error(
    "FAIL layers_9_24_partial_cohesion_test"
  );
  console.error(
    JSON.stringify(
      buildFailureContext({
        status,
        flow,
        enriched,
        publicFlow,
        stripped
      }),
      null,
      2
    )
  );

  throw error;
} finally {
  Module._load = originalLoad;

  /*
   * Restore the caller's original registry cache state. This prevents the
   * controlled completion stub from contaminating another test in a shared
   * Node process.
   */
  delete require.cache[REGISTRY_PATH];

  if (previousRegistryCacheEntry) {
    require.cache[REGISTRY_PATH] =
      previousRegistryCacheEntry;
  }
}
