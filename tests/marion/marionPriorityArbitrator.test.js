"use strict";

/**
 * tests/marion/marionPriorityArbitrator.test.js
 *
 * Layer 27 priority-arbitrator certification.
 *
 * Canonical test path:
 * tests/marion/marionPriorityArbitrator.test.js
 *
 * Canonical runtime:
 * Data/marion/runtime/strategy/marionPriorityArbitrator.js
 *
 * The test remains directly inside tests/marion. It is not moved into a
 * tests/marion/layer27 subfolder.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BACKEND_ROOT =
  path.resolve(__dirname, "..", "..");

const CANONICAL_RUNTIME =
  path.join(
    BACKEND_ROOT,
    "Data",
    "marion",
    "runtime",
    "strategy",
    "marionPriorityArbitrator.js"
  );

const LEGACY_RUNTIME_CANDIDATES =
  Object.freeze([
    path.join(
      BACKEND_ROOT,
      "Data",
      "marion",
      "runtime",
      "marionPriorityArbitrator.js"
    ),
    path.join(
      BACKEND_ROOT,
      "src",
      "marion",
      "strategy",
      "marionPriorityArbitrator.js"
    )
  ]);

const CALLABLE_EXPORTS =
  Object.freeze([
    "arbitrate",
    "rank",
    "prioritize",
    "run"
  ]);

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function loadRuntime() {
  const candidates = [
    CANONICAL_RUNTIME,
    ...LEGACY_RUNTIME_CANDIDATES
  ];

  const attempted = [];

  for (const candidate of candidates) {
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
          "Layer 27 priority-arbitrator runtime exists but could not be resolved.",
          `Candidate: ${candidate}`,
          `Cause: ${error && error.message ? error.message : error}`
        ].join("\n"),
        { cause: error }
      );
    }

    try {
      return require(resolved);
    } catch (error) {
      /*
       * The candidate exists, so MODULE_NOT_FOUND here identifies a missing
       * transitive dependency. Do not misreport it as a missing arbitrator.
       */
      throw new Error(
        [
          "Layer 27 priority-arbitrator runtime failed during module loading.",
          `Resolved module: ${resolved}`,
          `Cause: ${error && error.message ? error.message : error}`
        ].join("\n"),
        { cause: error }
      );
    }
  }

  throw new Error(
    [
      "Missing Layer 27 priority-arbitrator runtime.",
      `Canonical path: ${CANONICAL_RUNTIME}`,
      "Attempted candidates:",
      ...attempted.map(
        (candidate) =>
          `- ${candidate}`
      )
    ].join("\n")
  );
}

function callable(api) {
  if (typeof api === "function") {
    return api;
  }

  for (const name of CALLABLE_EXPORTS) {
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
    `Priority arbitrator has no supported callable export: ${CALLABLE_EXPORTS.join(", ")}`
  );
}

function rankedItems(out) {
  const ranked =
    out &&
    (
      out.ranked ||
      out.priorities ||
      out.items
    );

  assert.ok(
    Array.isArray(ranked),
    "Priority arbitrator must expose a ranked array."
  );

  return ranked;
}

function itemId(item) {
  if (!isObject(item)) {
    return "";
  }

  const value =
    item.id ??
    item.key;

  return typeof value === "string"
    ? value.trim()
    : "";
}

function assertAdvisoryBoundary(out) {
  assert.ok(
    isObject(out),
    "Priority arbitrator must return a non-array object."
  );

  assert.equal(
    out.executionAuthorized,
    false,
    "Priority arbitration must remain advisory-only."
  );

  assert.notEqual(
    out.automaticExecutionAllowed,
    true,
    "Priority arbitration must not enable automatic execution."
  );

  assert.notEqual(
    out.replaceComposer,
    true,
    "Priority arbitration must not replace the response composer."
  );

  assert.notEqual(
    out.replaceReplyAuthority,
    true,
    "Priority arbitration must not replace Marion's reply authority."
  );
}

test(
  "Layer 27 priority arbitrator resolves from the canonical strategy runtime",
  () => {
    assert.ok(
      fs.existsSync(CANONICAL_RUNTIME),
      `Canonical priority-arbitrator runtime is missing: ${CANONICAL_RUNTIME}`
    );
  }
);

test(
  "Layer 27 priority arbitration ranks safety and architecture preservation above feature expansion",
  async () => {
    const api =
      loadRuntime();

    const arbitrate =
      callable(api);

    const input = {
      candidates: [
        {
          id:
            "feature",
          label:
            "Add opportunity detection",
          urgency:
            0.8,
          value:
            0.9
        },
        {
          id:
            "repair",
          label:
            "Prevent recursive reflection loop",
          urgency:
            1,
          risk:
            1,
          blocker:
            true
        },
        {
          id:
            "compat",
          label:
            "Preserve Layers 1 through 26 contracts",
          urgency:
            0.95,
          dependency:
            true
        }
      ],
      policy: {
        safetyFirst:
          true,
        architectureFirst:
          true,
        executionAuthorized:
          false
      }
    };

    const snapshot =
      clone(input);

    const out =
      await Promise.resolve(
        arbitrate(input)
      );

    assertAdvisoryBoundary(out);

    const ranked =
      rankedItems(out);

    assert.ok(
      ranked.length >= 3,
      "Priority arbitrator returned fewer items than supplied."
    );

    const ids =
      ranked.map(itemId);

    assert.ok(
      ids.every(Boolean),
      "Every ranked priority must expose a non-empty id or key."
    );

    assert.equal(
      new Set(ids).size,
      ids.length,
      "Ranked priorities must be deduplicated."
    );

    const repairIndex =
      ids.indexOf("repair");

    const compatIndex =
      ids.indexOf("compat");

    const featureIndex =
      ids.indexOf("feature");

    assert.notEqual(
      repairIndex,
      -1,
      "Safety repair candidate is missing from the ranked result."
    );

    assert.notEqual(
      compatIndex,
      -1,
      "Architecture-preservation candidate is missing from the ranked result."
    );

    assert.notEqual(
      featureIndex,
      -1,
      "Feature candidate is missing from the ranked result."
    );

    assert.ok(
      repairIndex < featureIndex,
      "Safety repair must rank above feature expansion."
    );

    assert.ok(
      compatIndex < featureIndex,
      "Architecture preservation must rank above feature expansion."
    );

    assert.deepEqual(
      input,
      snapshot,
      "Priority arbitration must not mutate its input."
    );

    const serialized =
      JSON.stringify(out);

    assert.ok(
      Buffer.byteLength(
        serialized,
        "utf8"
      ) < 50000,
      "Priority-arbitration output must remain below 50,000 bytes."
    );

    const version =
      out.version ||
      api.VERSION ||
      api.version;

    assert.ok(
      typeof version === "string" &&
      version.trim(),
      "Priority arbitrator must expose a version."
    );
  }
);

test(
  "Layer 27 priority arbitration is deterministic for equivalent input",
  async () => {
    const api =
      loadRuntime();

    const arbitrate =
      callable(api);

    const input = {
      candidates: [
        {
          id:
            "a",
          urgency:
            0.5,
          value:
            0.5
        },
        {
          id:
            "b",
          urgency:
            0.5,
          value:
            0.5
        }
      ],
      tieBreaker:
        "stable_input_order",
      policy: {
        executionAuthorized:
          false
      }
    };

    const snapshot =
      clone(input);

    const first =
      await Promise.resolve(
        arbitrate(clone(input))
      );

    const second =
      await Promise.resolve(
        arbitrate(clone(input))
      );

    assertAdvisoryBoundary(first);
    assertAdvisoryBoundary(second);

    const firstIds =
      rankedItems(first).map(itemId);

    const secondIds =
      rankedItems(second).map(itemId);

    assert.deepEqual(
      firstIds,
      secondIds,
      "Equivalent input must produce the same ranked order."
    );

    assert.deepEqual(
      firstIds,
      ["a", "b"],
      "stable_input_order must preserve input order for equivalent candidates."
    );

    assert.deepEqual(
      input,
      snapshot,
      "Determinism testing must not mutate the source input."
    );
  }
);

test(
  "Layer 27 priority arbitration deduplicates repeated candidate identities",
  async () => {
    const api =
      loadRuntime();

    const arbitrate =
      callable(api);

    const out =
      await Promise.resolve(
        arbitrate({
          candidates: [
            {
              id:
                "repair",
              label:
                "Prevent recursive reflection loop",
              urgency:
                1,
              blocker:
                true
            },
            {
              id:
                "repair",
              label:
                "Duplicate repair candidate",
              urgency:
                0.7
            },
            {
              id:
                "feature",
              label:
                "Add opportunity detection",
              urgency:
                0.5
            }
          ],
          policy: {
            safetyFirst:
              true,
            executionAuthorized:
              false
          }
        })
      );

    assertAdvisoryBoundary(out);

    const ids =
      rankedItems(out).map(itemId);

    assert.ok(
      ids.every(Boolean),
      "Deduplicated results must retain valid identities."
    );

    assert.equal(
      ids.filter(
        (id) =>
          id === "repair"
      ).length,
      1,
      "Repeated candidate identities must collapse to one ranked priority."
    );

    assert.equal(
      new Set(ids).size,
      ids.length,
      "Deduplicated ranking still contains repeated identities."
    );
  }
);
