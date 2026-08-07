"use strict";

/**
 * tests/marion/marionLayers27_28Regression.test.js
 *
 * Cohesion regression for Marion Layers 27 and 28.
 *
 * Canonical test path:
 * tests/marion/marionLayers27_28Regression.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const MAX_OUTPUT_BYTES = 50000;
const TEST_RELATIVE = path.join(
  "tests",
  "marion",
  "marionLayers27_28Regression.test.js"
);

const STRATEGY = Object.freeze([
  "marionStrategicPlanner.js",
  "marionMissionRegistry.js",
  "marionObjectiveHierarchy.js",
  "marionPriorityArbitrator.js",
  "marionFutureStateProjector.js",
  "marionConversationTrajectory.js",
  "marionOpportunityDetector.js",
  "marionMilestoneTracker.js",
  "marionExecutionPlanner.js",
  "marionDependencyResolver.js",
  "marionStrategicPolicy.js",
  "marionStrategicTelemetry.js",
  "marionPlanningEnvelope.js"
]);

const METACOGNITION = Object.freeze([
  "marionMetaReasoner.js",
  "marionReflectionEngine.js",
  "marionConfidenceAnalyzer.js",
  "marionBiasDetector.js",
  "marionKnowledgeGapDetector.js",
  "marionReasoningAuditor.js",
  "marionResponseEvaluator.js",
  "marionQualityCalibrator.js",
  "marionLearningSignalCollector.js",
  "marionAdaptiveImprovementEngine.js",
  "marionMetaReasoningPolicy.js",
  "marionMetaTelemetry.js",
  "marionReflectionEnvelope.js"
]);

const SUPERVISION = Object.freeze([
  "marionCognitiveSupervisor.js"
]);

const STRATEGY_SET = new Set(STRATEGY);
const METACOGNITION_SET = new Set(METACOGNITION);
const SUPERVISION_SET = new Set(SUPERVISION);

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function deepClone(value) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function runtimeCandidates(name) {
  if (STRATEGY_SET.has(name)) {
    return [
      path.join(
        BACKEND_ROOT,
        "Data",
        "marion",
        "runtime",
        "strategy",
        name
      )
    ];
  }

  if (METACOGNITION_SET.has(name)) {
    return [
      path.join(
        BACKEND_ROOT,
        "Data",
        "marion",
        "runtime",
        "supervision",
        "metacognition",
        name
      ),
      path.join(
        BACKEND_ROOT,
        "Data",
        "marion",
        "runtime",
        "metacognition",
        name
      )
    ];
  }

  if (SUPERVISION_SET.has(name)) {
    return [
      path.join(
        BACKEND_ROOT,
        "Data",
        "marion",
        "runtime",
        "supervision",
        name
      )
    ];
  }

  throw new Error(`Unknown Layers 27/28 runtime requested: ${name}`);
}

function loadRuntime(name) {
  const attempted = [];

  for (const candidate of runtimeCandidates(name)) {
    attempted.push(candidate);

    if (!fs.existsSync(candidate)) {
      continue;
    }

    let resolved;

    try {
      resolved = require.resolve(candidate);
    } catch (error) {
      throw new Error(
        [
          `Layers 27/28 runtime exists but could not be resolved: ${name}`,
          `Candidate: ${candidate}`,
          `Cause: ${error && error.message ? error.message : error}`
        ].join("\n"),
        { cause: error }
      );
    }

    try {
      return require(resolved);
    } catch (error) {
      /* Preserve transitive module failures rather than hiding them. */
      throw new Error(
        [
          `Layers 27/28 runtime failed during module loading: ${name}`,
          `Resolved: ${resolved}`,
          `Cause: ${error && error.message ? error.message : error}`
        ].join("\n"),
        { cause: error }
      );
    }
  }

  throw new Error(
    [
      `Missing required Layers 27/28 runtime: ${name}`,
      "Attempted:",
      ...attempted.map((candidate) => `- ${candidate}`)
    ].join("\n")
  );
}

function callable(api, names) {
  if (typeof api === "function") {
    return api;
  }

  for (const name of names) {
    const descriptor =
      api &&
      Object.getOwnPropertyDescriptor(api, name);

    if (
      descriptor &&
      typeof descriptor.value === "function"
    ) {
      return descriptor.value.bind(api);
    }
  }

  throw new TypeError(
    `Missing callable Layers 27/28 export: ${names.join("/")}`
  );
}

function assertNonAuthoritative(out, stage) {
  assert.ok(
    isObject(out),
    `${stage} must return a non-array object.`
  );

  assert.equal(
    out.executionAuthorized,
    false,
    `${stage} must not authorize execution.`
  );

  assert.notEqual(
    out.automaticExecutionAllowed,
    true,
    `${stage} must not enable automatic execution.`
  );

  assert.notEqual(
    out.replaceComposer,
    true,
    `${stage} must not replace the response composer.`
  );

  assert.notEqual(
    out.replaceReplyAuthority,
    true,
    `${stage} must not replace Marion reply authority.`
  );
}

function assertBounded(out, message) {
  let serialized;

  assert.doesNotThrow(
    () => {
      serialized = JSON.stringify(out);
    },
    "Layers 27/28 regression output must be JSON-serializable."
  );

  assert.ok(
    Buffer.byteLength(serialized, "utf8") < MAX_OUTPUT_BYTES,
    message
  );
}

test(
  "Layers 27 and 28 regression remains in the canonical Marion test folder",
  () => {
    const actual = path.normalize(
      path.relative(BACKEND_ROOT, __filename)
    );

    assert.equal(
      actual.toLowerCase(),
      path.normalize(TEST_RELATIVE).toLowerCase(),
      [
        "Layers 27/28 regression pathway drifted.",
        `Expected: ${TEST_RELATIVE}`,
        `Actual: ${actual}`
      ].join("\n")
    );
  }
);

test(
  "Layers 27 and 28 preserve the established final reply and remain advisory",
  async () => {
    const supervisorApi = loadRuntime("marionCognitiveSupervisor.js");
    const supervise = callable(
      supervisorApi,
      ["supervise", "run", "evaluate"]
    );

    const base = {
      ok: true,
      final: true,
      handled: true,
      reply: "Layers 1 through 26 retain final reply authority.",
      displayReply: "Layers 1 through 26 retain final reply authority.",
      finalReply: "Layers 1 through 26 retain final reply authority.",
      spokenText: "Layers 1 through 26 retain final reply authority.",
      stateSpine: {
        schema: "nyx.marion.stateSpine/1.7",
        currentTurn: 28
      },
      noUserFacingDiagnostics: true,
      executionAuthorized: false
    };

    const snapshot = deepClone(base);

    const out = await Promise.resolve(
      supervise({
        baseEnvelope: base,
        prompt: "Plan the next integration without executing it.",
        explicitGoal: "validate Layers 27 and 28",
        executionAuthorized: false
      })
    );

    assertNonAuthoritative(out, "Cognitive Supervisor");

    assert.equal(out.reply, base.reply, "Layers 27/28 changed the established reply.");
    assert.equal(out.displayReply, base.displayReply, "Layers 27/28 changed the display reply.");

    if (Object.prototype.hasOwnProperty.call(out, "finalReply")) {
      assert.equal(out.finalReply, base.finalReply, "Layers 27/28 changed the final reply.");
    }

    if (Object.prototype.hasOwnProperty.call(out, "spokenText")) {
      assert.equal(out.spokenText, base.spokenText, "Layers 27/28 changed spoken text.");
    }

    assert.equal(out.final, true, "Layers 27/28 must preserve final=true.");
    assert.equal(out.handled, true, "Layers 27/28 must preserve handled=true.");
    assert.equal(out.noUserFacingDiagnostics, true, "Layers 27/28 must preserve diagnostic isolation.");

    assert.ok(isObject(out.layer27), "Layer 27 metadata is missing.");
    assert.ok(isObject(out.layer28), "Layer 28 metadata is missing.");
    assert.ok(isObject(out.cognitiveSupervisor), "Cognitive Supervisor metadata is missing.");

    assert.deepEqual(
      base,
      snapshot,
      "Layers 27/28 supervision mutated the source envelope."
    );

    assertBounded(
      out,
      "Layers 27/28 supervised output must remain below 50,000 UTF-8 bytes."
    );
  }
);

test(
  "all Layer 27 and 28 modules expose versions and load under CommonJS",
  () => {
    const files = [
      ...STRATEGY,
      ...METACOGNITION,
      ...SUPERVISION
    ];

    for (const file of files) {
      const api = loadRuntime(file);

      assert.ok(
        api &&
        (
          typeof api === "object" ||
          typeof api === "function"
        ),
        `${file} did not load as a CommonJS API.`
      );

      const version = api.VERSION || api.version;

      assert.ok(
        typeof version === "string" &&
        version.trim(),
        `${file} must expose a non-empty version string.`
      );
    }
  }
);
