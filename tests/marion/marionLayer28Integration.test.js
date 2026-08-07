"use strict";

/**
 * tests/marion/marionLayer28Integration.test.js
 *
 * Marion Layer 28 integration certification.
 *
 * CANONICAL TEST PATH:
 * tests/marion/marionLayer28Integration.test.js
 *
 * Evidence-backed runtime authority:
 * Data/marion/runtime/supervision/metacognition/
 *
 * Marion's cognitive supervisor resolves the Layer 28 reasoner, evaluator,
 * and reflection envelope from this metacognition tree.
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
  "marionLayer28Integration.test.js"
);

const PREFERRED_RUNTIME_ROOT = path.join(
  BACKEND_ROOT,
  "Data",
  "marion",
  "runtime",
  "supervision",
  "metacognition"
);

const FALLBACK_RUNTIME_ROOT = path.join(
  BACKEND_ROOT,
  "Data",
  "marion",
  "runtime",
  "metacognition"
);

const REQUIRED_RUNTIME_FILES = Object.freeze([
  "marionMetaReasoner.js",
  "marionResponseEvaluator.js",
  "marionReflectionEnvelope.js"
]);

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

function candidatePaths(name) {
  return [
    path.join(
      PREFERRED_RUNTIME_ROOT,
      name
    ),
    path.join(
      FALLBACK_RUNTIME_ROOT,
      name
    )
  ];
}

function loadRuntime(name) {
  assert.ok(
    REQUIRED_RUNTIME_FILES.includes(name),
    `Unexpected Layer 28 runtime requested: ${name}`
  );

  const attempted = [];

  for (
    const candidate
    of candidatePaths(name)
  ) {
    attempted.push(candidate);

    if (!fs.existsSync(candidate)) {
      continue;
    }

    let resolved;

    try {
      resolved =
        require.resolve(candidate);
    } catch (error) {
      throw new Error(
        [
          `Layer 28 runtime exists but could not be resolved: ${name}`,
          `Candidate: ${candidate}`,
          `Cause: ${error && error.message ? error.message : error}`
        ].join("\n"),
        { cause: error }
      );
    }

    try {
      return require(resolved);
    } catch (error) {
      throw new Error(
        [
          `Layer 28 runtime failed during module loading: ${name}`,
          `Resolved: ${resolved}`,
          `Cause: ${error && error.message ? error.message : error}`
        ].join("\n"),
        { cause: error }
      );
    }
  }

  throw new Error(
    [
      `Missing required Layer 28 runtime file: ${name}`,
      "Attempted:",
      ...attempted.map(
        (candidate) =>
          `- ${candidate}`
      )
    ].join("\n")
  );
}

function callable(
  api,
  names
) {
  if (typeof api === "function") {
    return api;
  }

  for (const name of names) {
    const descriptor =
      api &&
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
    `Missing callable Layer 28 export: ${names.join("/")}`
  );
}

async function invoke(
  api,
  names,
  input
) {
  return Promise.resolve(
    callable(
      api,
      names
    )(input)
  );
}

function assertNonAuthoritative(
  out,
  stage
) {
  assert.ok(
    isObject(out),
    `${stage} must return a non-array object.`
  );

  assert.notEqual(
    out.executionAuthorized,
    true,
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

function assertNoVisibleDiagnostics(
  value
) {
  const text =
    String(value || "");

  assert.doesNotMatch(
    text,
    /secret diagnostic|\b(?:TypeError|ReferenceError|SyntaxError)\b|(?:^|\n)\s*at\s+.+\(.+:\d+:\d+\)/i,
    "Layer 28 leaked runtime diagnostics into a public-facing field."
  );
}

function assertBounded(
  value,
  message
) {
  let serialized;

  assert.doesNotThrow(
    () => {
      serialized =
        JSON.stringify(value);
    },
    "Layer 28 output must be JSON-serializable."
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
  "Layer 28 integration test remains in the canonical Marion test folder",
  () => {
    const actual =
      path.normalize(
        path.relative(
          BACKEND_ROOT,
          __filename
        )
      );

    assert.equal(
      actual.toLowerCase(),
      path.normalize(TEST_RELATIVE).toLowerCase(),
      [
        "Layer 28 integration test pathway drifted.",
        `Expected: ${TEST_RELATIVE}`,
        `Actual: ${actual}`
      ].join("\n")
    );
  }
);

test(
  "Layer 28 metacognition runtimes resolve from a bounded known runtime tree",
  () => {
    for (
      const name
      of REQUIRED_RUNTIME_FILES
    ) {
      assert.ok(
        candidatePaths(name).some(
          (candidate) =>
            fs.existsSync(candidate)
        ),
        [
          `No known Layer 28 runtime location exists for ${name}.`,
          ...candidatePaths(name).map(
            (candidate) =>
              `- ${candidate}`
          )
        ].join("\n")
      );

      const api =
        loadRuntime(name);

      assert.ok(
        api &&
        (
          typeof api === "function" ||
          typeof api === "object"
        ),
        `${name} did not load as a CommonJS API.`
      );
    }
  }
);

test(
  "Layer 28 reflection remains internal, bounded, non-recursive, and reply-preserving",
  async () => {
    const reasoner =
      loadRuntime(
        "marionMetaReasoner.js"
      );

    const evaluator =
      loadRuntime(
        "marionResponseEvaluator.js"
      );

    const envelope =
      loadRuntime(
        "marionReflectionEnvelope.js"
      );

    const base = {
      ok:
        true,
      final:
        true,
      handled:
        true,
      reply:
        "Runtime files are deferred until the next batch.",
      displayReply:
        "Runtime files are deferred until the next batch.",
      finalReply:
        "Runtime files are deferred until the next batch.",
      spokenText:
        "Runtime files are deferred until the next batch.",
      noUserFacingDiagnostics:
        true,
      executionAuthorized:
        false,
      stateSpine: {
        schema:
          "nyx.marion.stateSpine/1.7"
      }
    };

    const snapshot =
      deepClone(base);

    const meta =
      await invoke(
        reasoner,
        [
          "reason",
          "reflect",
          "analyze",
          "run"
        ],
        {
          baseEnvelope:
            base,
          maxPasses:
            1,
          recursionDepth:
            0
        }
      );

    assertNonAuthoritative(
      meta,
      "Meta Reasoner"
    );

    const evaluation =
      await invoke(
        evaluator,
        [
          "evaluate",
          "score",
          "analyze",
          "run"
        ],
        {
          baseEnvelope:
            base,
          meta
        }
      );

    assertNonAuthoritative(
      evaluation,
      "Response Evaluator"
    );

    const out =
      await invoke(
        envelope,
        [
          "build",
          "create",
          "wrap",
          "run"
        ],
        {
          baseEnvelope:
            base,
          meta,
          evaluation
        }
      );

    assertNonAuthoritative(
      out,
      "Reflection Envelope"
    );

    assert.equal(
      out.reply,
      base.reply,
      "Layer 28 changed the existing reply."
    );

    assert.equal(
      out.displayReply,
      base.displayReply,
      "Layer 28 changed the existing display reply."
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
        "Layer 28 changed the existing final reply."
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
        "Layer 28 changed the existing spoken text."
      );
    }

    assert.equal(
      out.final,
      true,
      "Layer 28 must preserve final=true."
    );

    assert.equal(
      out.handled,
      true,
      "Layer 28 must preserve handled=true."
    );

    assert.equal(
      out.noUserFacingDiagnostics,
      true,
      "Layer 28 must preserve diagnostic isolation."
    );

    const layer =
      out.layer28 ||
      out.reflection ||
      out.metaCognition;

    assert.ok(
      isObject(layer),
      "Layer 28 reflection metadata is missing."
    );

    const recursionDepth =
      Number(
        layer.recursionDepth ||
        0
      );

    assert.ok(
      Number.isFinite(recursionDepth) &&
      recursionDepth <= 1,
      "Layer 28 recursion depth exceeded the bounded reflection contract."
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
      snapshot,
      "Layer 28 integration mutated the source envelope."
    );

    assertBounded(
      out,
      "Layer 28 integration output must remain below 50,000 UTF-8 bytes."
    );
  }
);

test(
  "Layer 28 contains unsafe getters without public leakage",
  async () => {
    const reasoner =
      loadRuntime(
        "marionMetaReasoner.js"
      );

    const hostile =
      {};

    Object.defineProperty(
      hostile,
      "reply",
      {
        enumerable:
          true,
        get() {
          throw new Error(
            "secret diagnostic"
          );
        }
      }
    );

    let out;

    try {
      out =
        await invoke(
          reasoner,
          [
            "reason",
            "reflect",
            "analyze",
            "run"
          ],
          {
            baseEnvelope:
              hostile,
            recursionDepth:
              0,
            maxPasses:
              1
          }
        );
    } catch (error) {
      assert.fail(
        `Layer 28 must contain hostile input: ${
          error && error.message
            ? error.message
            : error
        }`
      );
    }

    assertNonAuthoritative(
      out,
      "Hostile-input Meta Reasoner"
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
      "Hostile-input reflection output must remain bounded."
    );
  }
);
