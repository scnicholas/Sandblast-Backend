"use strict";

/**
 * tests/marion/marionPriorityArbitrator.test.js
 * Layer 27 priority-arbitrator certification.
 * Canonical test path: tests/marion/marionPriorityArbitrator.test.js
 * Canonical runtime: Data/marion/runtime/strategy/marionPriorityArbitrator.js
 * This test intentionally remains directly inside tests/marion.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const VERSION = "marion.priorityArbitrator.test/2.1-canonical-marion-folder";
const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const CANONICAL_TEST_RELATIVE = path.join("tests", "marion", "marionPriorityArbitrator.test.js");
const CANONICAL_RUNTIME = path.join(
  BACKEND_ROOT,
  "Data", "marion", "runtime", "strategy", "marionPriorityArbitrator.js"
);
const CALLABLE_EXPORTS = Object.freeze(["arbitrate", "rank", "prioritize", "run"]);

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deepClone(value) {
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function loadRuntime() {
  assert.ok(
    fs.existsSync(CANONICAL_RUNTIME),
    `Canonical Layer 27 priority-arbitrator runtime is missing: ${CANONICAL_RUNTIME}`
  );

  let resolved;
  try {
    resolved = require.resolve(CANONICAL_RUNTIME);
  } catch (error) {
    throw new Error(
      `Layer 27 priority-arbitrator runtime exists but could not be resolved.\nCandidate: ${CANONICAL_RUNTIME}\nCause: ${error && error.message ? error.message : error}`,
      { cause: error }
    );
  }

  try {
    return require(resolved);
  } catch (error) {
    throw new Error(
      `Layer 27 priority-arbitrator runtime failed during module loading.\nResolved module: ${resolved}\nCause: ${error && error.message ? error.message : error}`,
      { cause: error }
    );
  }
}

function callable(api) {
  if (typeof api === "function") return api;
  for (const name of CALLABLE_EXPORTS) {
    if (!api) break;
    const descriptor = Object.getOwnPropertyDescriptor(api, name);
    if (descriptor && typeof descriptor.value === "function") return descriptor.value.bind(api);
  }
  throw new TypeError(`Priority arbitrator has no supported callable export: ${CALLABLE_EXPORTS.join(", ")}`);
}

function rankedItems(out) {
  const ranked = out && (out.ranked || out.priorities || out.items);
  assert.ok(Array.isArray(ranked), "Priority arbitrator must expose a ranked array.");
  return ranked;
}

function itemId(item) {
  if (!isObject(item)) return "";
  const value = item.id ?? item.key;
  return typeof value === "string" ? value.trim() : "";
}

function rankedIds(out) {
  const ids = rankedItems(out).map(itemId);
  assert.ok(ids.every(Boolean), "Every ranked priority must expose a non-empty id or key.");
  return ids;
}

function assertSameIdentitySet(actualIds, expectedIds, message) {
  assert.deepEqual([...new Set(actualIds)].sort(), [...new Set(expectedIds)].sort(), message);
}

function assertAdvisoryBoundary(out) {
  assert.ok(isObject(out), "Priority arbitrator must return a non-array object.");
  assert.equal(out.executionAuthorized, false, "Priority arbitration must remain advisory-only.");
  assert.notEqual(out.automaticExecutionAllowed, true, "Priority arbitration must not enable automatic execution.");
  assert.notEqual(out.replaceComposer, true, "Priority arbitration must not replace the response composer.");
  assert.notEqual(out.replaceReplyAuthority, true, "Priority arbitration must not replace Marion's reply authority.");
}

function assertBoundedVersionedOutput(out, api) {
  const serialized = JSON.stringify(out);
  assert.ok(Buffer.byteLength(serialized, "utf8") < 50000, "Priority-arbitration output must remain below 50,000 bytes.");
  const version = out.version || api.VERSION || api.version;
  assert.ok(typeof version === "string" && version.trim(), "Priority arbitrator must expose a version.");
}

test("Layer 27 priority arbitrator remains in the canonical Marion test folder", () => {
  const actualRelative = path.normalize(path.relative(BACKEND_ROOT, __filename));
  assert.equal(
    actualRelative.toLowerCase(),
    path.normalize(CANONICAL_TEST_RELATIVE).toLowerCase(),
    `Priority-arbitrator test pathway drifted. Expected: ${CANONICAL_TEST_RELATIVE}; Actual: ${actualRelative}`
  );
});

test("Layer 27 priority arbitrator resolves only from the canonical strategy runtime", () => {
  assert.ok(fs.existsSync(CANONICAL_RUNTIME), `Canonical priority-arbitrator runtime is missing: ${CANONICAL_RUNTIME}`);
  const resolved = require.resolve(CANONICAL_RUNTIME);
  assert.equal(
    path.normalize(resolved).toLowerCase(),
    path.normalize(CANONICAL_RUNTIME).toLowerCase(),
    "Priority-arbitrator runtime resolution drifted from the canonical strategy path."
  );
});

test("Layer 27 priority arbitration ranks safety and architecture preservation above feature expansion", async () => {
  const api = loadRuntime();
  const arbitrate = callable(api);
  const input = {
    candidates: [
      { id: "feature", label: "Add opportunity detection", urgency: 0.8, value: 0.9 },
      { id: "repair", label: "Prevent recursive reflection loop", urgency: 1, risk: 1, blocker: true },
      { id: "compat", label: "Preserve Layers 1 through 26 contracts", urgency: 0.95, dependency: true }
    ],
    policy: { safetyFirst: true, architectureFirst: true, executionAuthorized: false }
  };
  const snapshot = deepClone(input);
  const out = await Promise.resolve(arbitrate(input));
  assertAdvisoryBoundary(out);
  const ids = rankedIds(out);
  assert.equal(new Set(ids).size, ids.length, "Ranked priorities must be deduplicated.");
  assertSameIdentitySet(ids, ["feature", "repair", "compat"], "Priority arbitration must neither drop nor invent candidate identities.");
  assert.ok(ids.indexOf("repair") < ids.indexOf("feature"), "Safety repair must rank above feature expansion.");
  assert.ok(ids.indexOf("compat") < ids.indexOf("feature"), "Architecture preservation must rank above feature expansion.");
  assert.deepEqual(input, snapshot, "Priority arbitration must not mutate its input.");
  assertBoundedVersionedOutput(out, api);
});

test("Layer 27 priority arbitration is deterministic for equivalent input", async () => {
  const api = loadRuntime();
  const arbitrate = callable(api);
  const input = {
    candidates: [
      { id: "a", urgency: 0.5, value: 0.5 },
      { id: "b", urgency: 0.5, value: 0.5 }
    ],
    tieBreaker: "stable_input_order",
    policy: { executionAuthorized: false }
  };
  const snapshot = deepClone(input);
  const first = await Promise.resolve(arbitrate(deepClone(input)));
  const second = await Promise.resolve(arbitrate(deepClone(input)));
  assertAdvisoryBoundary(first);
  assertAdvisoryBoundary(second);
  const firstIds = rankedIds(first);
  const secondIds = rankedIds(second);
  assert.deepEqual(firstIds, secondIds, "Equivalent input must produce the same ranked order.");
  assert.deepEqual(firstIds, ["a", "b"], "stable_input_order must preserve input order for equivalent candidates.");
  assert.deepEqual(input, snapshot, "Determinism testing must not mutate the source input.");
  assertBoundedVersionedOutput(first, api);
  assertBoundedVersionedOutput(second, api);
});

test("Layer 27 priority arbitration deduplicates repeated candidate identities without dropping unique candidates", async () => {
  const api = loadRuntime();
  const arbitrate = callable(api);
  const input = {
    candidates: [
      { id: "repair", label: "Prevent recursive reflection loop", urgency: 1, blocker: true },
      { id: "repair", label: "Duplicate repair candidate", urgency: 0.7 },
      { id: "feature", label: "Add opportunity detection", urgency: 0.5 }
    ],
    policy: { safetyFirst: true, executionAuthorized: false }
  };
  const snapshot = deepClone(input);
  const out = await Promise.resolve(arbitrate(input));
  assertAdvisoryBoundary(out);
  const ids = rankedIds(out);
  assert.equal(ids.filter((id) => id === "repair").length, 1, "Repeated candidate identities must collapse to one ranked priority.");
  assert.equal(new Set(ids).size, ids.length, "Deduplicated ranking still contains repeated identities.");
  assertSameIdentitySet(ids, ["repair", "feature"], "Deduplication must preserve every unique candidate identity and invent none.");
  assert.deepEqual(input, snapshot, "Deduplication must not mutate its input.");
  assertBoundedVersionedOutput(out, api);
});
