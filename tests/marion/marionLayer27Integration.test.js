"use strict";

/**
 * Marion Layer 27 integration certification.
 *
 * Runtime authorities:
 *   Data/marion/runtime/strategy/marionStrategicPlanner.js
 *   Data/marion/runtime/strategy/marionPriorityArbitrator.js
 *   Data/marion/runtime/strategy/marionPlanningEnvelope.js
 *
 * This test does not authorize execution and does not replace the existing
 * Layers 1–26 reply/envelope authority.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const MAX_OUTPUT_BYTES = 50000;

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function findBackendRoot(startDir) {
  let current =
    path.resolve(startDir);

  while (true) {
    const packagePath =
      path.join(
        current,
        "package.json"
      );

    const runtimePath =
      path.join(
        current,
        "Data",
        "marion",
        "runtime"
      );

    if (
      fs.existsSync(packagePath) &&
      fs.existsSync(runtimePath)
    ) {
      return current;
    }

    const parent =
      path.dirname(current);

    if (parent === current) {
      break;
    }

    current =
      parent;
  }

  /*
   * Synthetic/node:test compatibility:
   * allow a root that has the canonical runtime tree even when package.json
   * is intentionally omitted by an isolated harness.
   */
  current =
    path.resolve(startDir);

  while (true) {
    const runtimePath =
      path.join(
        current,
        "Data",
        "marion",
        "runtime"
      );

    if (fs.existsSync(runtimePath)) {
      return current;
    }

    const parent =
      path.dirname(current);

    if (parent === current) {
      break;
    }

    current =
      parent;
  }

  throw new Error(
    `Unable to resolve Sandblast backend root from ${startDir}`
  );
}

const BACKEND_ROOT =
  findBackendRoot(__dirname);

function runtimePath(name) {
  return path.join(
    BACKEND_ROOT,
    "Data",
    "marion",
    "runtime",
    "strategy",
    name
  );
}

function loadRuntime(name) {
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
        `Layer 27 runtime file exists but could not be resolved: ${name}`,
        `Path: ${candidate}`,
        `Cause: ${error && error.message ? error.message : error}`
      ].join("\n"),
      { cause: error }
    );
  }

  try {
    return require(resolved);
  } catch (error) {
    /*
     * The target file exists. A MODULE_NOT_FOUND error here is therefore a
     * transitive dependency failure and must be reported as such.
     */
    throw new Error(
      [
        `Layer 27 runtime module failed during loading: ${name}`,
        `Resolved: ${resolved}`,
        `Cause: ${error && error.message ? error.message : error}`
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

function assertAdvisoryOnly(out) {
  assert.ok(
    isObject(out),
    "Layer 27 output must be a non-array object."
  );

  assert.equal(
    out.executionAuthorized,
    false,
    "Layer 27 must remain advisory-only."
  );

  assert.notEqual(
    out.automaticExecutionAllowed,
    true,
    "Layer 27 must not enable automatic execution."
  );

  assert.notEqual(
    out.replaceComposer,
    true,
    "Layer 27 must not replace the response composer."
  );

  assert.notEqual(
    out.replaceReplyAuthority,
    true,
    "Layer 27 must not replace reply authority."
  );
}

function assertNoVisibleDiagnostics(value) {
  const text =
    String(value || "");

  assert.doesNotMatch(
    text,
    /\bTypeError\b|\bReferenceError\b|\bSyntaxError\b|\bstack\b|at\s+\w+\s*\(/i,
    "Layer 27 exposed runtime diagnostics in a user-facing reply."
  );
}

test(
  "Layer 27 strategy runtimes resolve from the canonical strategy folder",
  () => {
    for (
      const name
      of [
        "marionStrategicPlanner.js",
        "marionPriorityArbitrator.js",
        "marionPlanningEnvelope.js"
      ]
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
        path.normalize(candidate).toLowerCase(),
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
      JSON.parse(
        JSON.stringify(base)
      );

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

    assertAdvisoryOnly(plan);

    const candidates =
      Array.isArray(plan.priorities)
        ? plan.priorities
        : (
            Array.isArray(plan.steps)
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

    assertAdvisoryOnly(priorities);

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

    assertAdvisoryOnly(out);

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

    assertNoVisibleDiagnostics(
      out.reply
    );

    assertNoVisibleDiagnostics(
      out.displayReply
    );

    assert.deepEqual(
      base,
      baseSnapshot,
      "Layer 27 integration mutated the source Layers 1–26 envelope."
    );

    const serialized =
      JSON.stringify(out);

    assert.ok(
      Buffer.byteLength(
        serialized,
        "utf8"
      ) < MAX_OUTPUT_BYTES,
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

    const visibleFields = [
      out.reply,
      out.displayReply,
      out.finalReply,
      out.spokenText,
      out.message,
      out.text
    ];

    for (
      const value
      of visibleFields
    ) {
      assertNoVisibleDiagnostics(
        value
      );
    }

    const serialized =
      JSON.stringify(out);

    assert.ok(
      Buffer.byteLength(
        serialized,
        "utf8"
      ) < MAX_OUTPUT_BYTES,
      "Malformed-input fallback must remain bounded."
    );
  }
);
