"use strict";

/**
 * tests/marion/marionLayer27Integration.test.js
 *
 * Marion Layer 27 integration certification.
 *
 * CANONICAL TEST PATH:
 * tests/marion/marionLayer27Integration.test.js
 *
 * Runtime authorities:
 *   Data/marion/runtime/strategy/marionStrategicPlanner.js
 *   Data/marion/runtime/strategy/marionPriorityArbitrator.js
 *   Data/marion/runtime/strategy/marionPlanningEnvelope.js
 *
 * Layer 27 remains advisory-only and must not replace the existing
 * Layers 1–26 reply/envelope authority.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const VERSION =
  "marion.layer27.integration.test/2.2-canonical-marion-folder";

const MAX_OUTPUT_BYTES =
  50000;

const BACKEND_ROOT =
  path.resolve(
    __dirname,
    "..",
    ".."
  );

const CANONICAL_TEST_RELATIVE =
  path.join(
    "tests",
    "marion",
    "marionLayer27Integration.test.js"
  );

const STRATEGY_RUNTIME_ROOT =
  path.join(
    BACKEND_ROOT,
    "Data",
    "marion",
    "runtime",
    "strategy"
  );

const REQUIRED_RUNTIME_FILES =
  Object.freeze([
    "marionStrategicPlanner.js",
    "marionPriorityArbitrator.js",
    "marionPlanningEnvelope.js"
  ]);

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function deepClone(value) {
  if (
    typeof globalThis.structuredClone ===
    "function"
  ) {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(
    JSON.stringify(value)
  );
}

function runtimePath(name) {
  return path.join(
    STRATEGY_RUNTIME_ROOT,
    name
  );
}

function loadRuntime(name) {
  assert.ok(
    REQUIRED_RUNTIME_FILES.includes(name),
    `Unexpected Layer 27 runtime requested: ${name}`
  );

  const candidate =
    runtimePath(name);

  assert.ok(
    fs.existsSync(candidate),
    `Missing required Layer 27 runtime file: ${candidate}`
  );

  let resolved;

  try {
    resolved =
      require.resolve(candidate);
  } catch (error) {
    throw new Error(
      [
        `Layer 27 runtime exists but could not be resolved: ${name}`,
        `Path: ${candidate}`,
        `Cause: ${
          error && error.message
            ? error.message
            : error
        }`
      ].join("\n"),
      { cause: error }
    );
  }

  assert.equal(
    path.normalize(resolved).toLowerCase(),
    path.normalize(candidate).toLowerCase(),
    `Layer 27 runtime resolution drifted from the canonical strategy path: ${name}`
  );

  try {
    return require(resolved);
  } catch (error) {
    /*
     * The canonical target exists. A MODULE_NOT_FOUND raised here therefore
     * identifies a transitive dependency failure and must not be rewritten
     * as a missing Layer 27 runtime.
     */
    throw new Error(
      [
        `Layer 27 runtime failed during module loading: ${name}`,
        `Resolved: ${resolved}`,
        `Cause: ${
          error && error.message
            ? error.message
            : error
        }`
      ].join("\n"),
      { cause: error }
    );
  }
}

function callable(api, names) {
  if (typeof api === "function") {
    return api;
  }

  for (const name of names) {
    if (!api) {
      break;
    }

    const descriptor =
      Object.getOwnPropertyDescriptor(
        api,
        name
      );

    if (
      descriptor &&
      typeof descriptor.value === "function"
    ) {
      return descriptor.value.bind(api);
    }
  }

  throw new TypeError(
    `Missing callable Layer 27 export: ${names.join("/")}`
  );
}

async function invoke(
  api,
  names,
  input
) {
  const fn =
    callable(
      api,
      names
    );

  return Promise.resolve(
    fn(input)
  );
}

function assertAdvisoryOnly(
  out,
  stage
) {
  assert.ok(
    isObject(out),
    `${stage} must return a non-array object.`
  );

  assert.equal(
    out.executionAuthorized,
    false,
    `${stage} must remain advisory-only.`
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
    `${stage} must not replace Marion's reply authority.`
  );
}

function assertNoVisibleDiagnostics(value) {
  const text =
    String(value || "");

  assert.doesNotMatch(
    text,
    /\b(?:TypeError|ReferenceError|SyntaxError)\b|(?:^|\n)\s*at\s+.+\(.+:\d+:\d+\)/i,
    "Layer 27 exposed runtime diagnostics in a user-facing field."
  );
}

function assertBounded(value, message) {
  let serialized;

  assert.doesNotThrow(
    () => {
      serialized =
        JSON.stringify(value);
    },
    "Layer 27 output must be JSON-serializable."
  );

  assert.ok(
    Buffer.byteLength(
      serialized,
      "utf8"
    ) < MAX_OUTPUT_BYTES,
    message
  );
}

test(
  "Layer 27 integration test remains in the canonical Marion folder",
  () => {
    const actualRelative =
      path.normalize(
        path.relative(
          BACKEND_ROOT,
          __filename
        )
      );

    assert.equal(
      actualRelative.toLowerCase(),
      path.normalize(
        CANONICAL_TEST_RELATIVE
      ).toLowerCase(),
      [
        "Layer 27 integration test pathway drifted.",
        `Expected: ${CANONICAL_TEST_RELATIVE}`,
        `Actual: ${actualRelative}`
      ].join("\n")
    );
  }
);

test(
  "Layer 27 strategy runtimes resolve from the canonical strategy folder",
  () => {
    for (
      const name
      of REQUIRED_RUNTIME_FILES
    ) {
      const candidate =
        runtimePath(name);

      assert.ok(
        fs.existsSync(candidate),
        `Canonical Layer 27 runtime is missing: ${candidate}`
      );

      assert.equal(
        path.normalize(
          require.resolve(candidate)
        ).toLowerCase(),
        path.normalize(
          candidate
        ).toLowerCase(),
        `Layer 27 runtime resolution drifted: ${name}`
      );
    }
  }
);

test(
  "Layer 27 modules compose additively and preserve the Layers 1–26 envelope",
  async () => {
    const planner =
      loadRuntime(
        "marionStrategicPlanner.js"
      );

    const arbitrator =
      loadRuntime(
        "marionPriorityArbitrator.js"
      );

    const envelopeApi =
      loadRuntime(
        "marionPlanningEnvelope.js"
      );

    const base = {
      ok:
        true,
      final:
        true,
      handled:
        true,
      reply:
        "Existing Layers 1 through 26 reply.",
      displayReply:
        "Existing Layers 1 through 26 reply.",
      finalReply:
        "Existing Layers 1 through 26 reply.",
      spokenText:
        "Existing Layers 1 through 26 reply.",
      stateSpine: {
        schema:
          "nyx.marion.stateSpine/1.7",
        currentTurn:
          27
      },
      noUserFacingDiagnostics:
        true,
      executionAuthorized:
        false
    };

    const baseSnapshot =
      deepClone(base);

    const plan =
      await invoke(
        planner,
        [
          "plan",
          "createPlan",
          "analyze",
          "run"
        ],
        {
          prompt:
            "Prepare Layer 27 without changing the public reply.",
          activeGoal:
            "extend Layer 27 additively",
          baseEnvelope:
            base,
          executionAuthorized:
            false
        }
      );

    assertAdvisoryOnly(
      plan,
      "Strategic Planner"
    );

    const candidates =
      Array.isArray(
        plan.priorities
      )
        ? plan.priorities
        : (
            Array.isArray(
              plan.steps
            )
              ? plan.steps
              : []
          );

    const priorities =
      await invoke(
        arbitrator,
        [
          "arbitrate",
          "rank",
          "prioritize",
          "run"
        ],
        {
          candidates,
          policy: {
            safetyFirst:
              true,
            architectureFirst:
              true,
            executionAuthorized:
              false
          },
          executionAuthorized:
            false
        }
      );

    assertAdvisoryOnly(
      priorities,
      "Priority Arbitrator"
    );

    const out =
      await invoke(
        envelopeApi,
        [
          "build",
          "create",
          "wrap",
          "run"
        ],
        {
          baseEnvelope:
            base,
          plan,
          priorities,
          executionAuthorized:
            false
        }
      );

    assertAdvisoryOnly(
      out,
      "Planning Envelope"
    );

    assert.equal(
      out.reply,
      base.reply,
      "Layer 27 changed the existing reply authority."
    );

    assert.equal(
      out.displayReply,
      base.displayReply,
      "Layer 27 changed the existing display reply."
    );

    if (
      Object.prototype.hasOwnProperty.call(
        out,
        "finalReply"
      )
    ) {
      assert.equal(
        out.finalReply,
        base.finalReply,
        "Layer 27 changed the existing final reply."
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(
        out,
        "spokenText"
      )
    ) {
      assert.equal(
        out.spokenText,
        base.spokenText,
        "Layer 27 changed the existing spoken text."
      );
    }

    assert.equal(
      out.final,
      true,
      "Layer 27 must preserve final=true."
    );

    assert.equal(
      out.handled,
      true,
      "Layer 27 must preserve handled=true."
    );

    assert.equal(
      out.noUserFacingDiagnostics,
      true,
      "Layer 27 must preserve diagnostic isolation."
    );

    assert.ok(
      out.layer27 ||
      out.planning ||
      out.strategicPlan,
      "Layer 27 metadata is missing."
    );

    for (
      const value
      of [
        out.reply,
        out.displayReply,
        out.finalReply,
        out.spokenText
      ]
    ) {
      assertNoVisibleDiagnostics(
        value
      );
    }

    assert.deepEqual(
      base,
      baseSnapshot,
      "Layer 27 integration mutated the source Layers 1–26 envelope."
    );

    assertBounded(
      out,
      "Layer 27 integration output must remain below 50,000 bytes."
    );
  }
);

test(
  "Layer 27 fails closed on malformed strategic input without emitting diagnostics as reply",
  async () => {
    const planner =
      loadRuntime(
        "marionStrategicPlanner.js"
      );

    const malformed =
      Object.create(null);

    const out =
      await invoke(
        planner,
        [
          "plan",
          "createPlan",
          "analyze",
          "run"
        ],
        malformed
      );

    assert.ok(
      isObject(out),
      "Malformed strategic input must still produce a bounded object result."
    );

    assert.notEqual(
      out.executionAuthorized,
      true,
      "Malformed input must fail closed and never authorize execution."
    );

    assert.notEqual(
      out.automaticExecutionAllowed,
      true,
      "Malformed input must not enable automatic execution."
    );

    assert.notEqual(
      out.replaceComposer,
      true,
      "Malformed input must not replace the response composer."
    );

    assert.notEqual(
      out.replaceReplyAuthority,
      true,
      "Malformed input must not replace Marion's reply authority."
    );

    for (
      const value
      of [
        out.reply,
        out.displayReply,
        out.finalReply,
        out.spokenText,
        out.message,
        out.text
      ]
    ) {
      assertNoVisibleDiagnostics(
        value
      );
    }

    assertBounded(
      out,
      "Malformed-input fallback must remain below 50,000 bytes."
    );
  }
);
