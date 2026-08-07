"use strict";

/**
 * tests/marion/marionStrategicPlanner.test.js
 * Canonical runtime:
 * Data/marion/runtime/strategy/marionStrategicPlanner.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BACKEND_ROOT = path.resolve(__dirname, "..", "..");
const CANONICAL_RUNTIME = path.join(
  BACKEND_ROOT,
  "Data",
  "marion",
  "runtime",
  "strategy",
  "marionStrategicPlanner.js"
);

const LEGACY_CANDIDATES = Object.freeze([
  path.join(BACKEND_ROOT, "Data", "marion", "runtime", "marionStrategicPlanner.js"),
  path.join(BACKEND_ROOT, "src", "marion", "strategy", "marionStrategicPlanner.js")
]);

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function loadRuntime() {
  const attempted = [];
  for (const candidate of [CANONICAL_RUNTIME, ...LEGACY_CANDIDATES]) {
    attempted.push(candidate);
    if (!fs.existsSync(candidate)) continue;

    let resolved;
    try {
      resolved = require.resolve(candidate);
    } catch (error) {
      throw new Error(
        `Layer 27 strategic-planner runtime exists but could not be resolved.\nCandidate: ${candidate}\nCause: ${error && error.message ? error.message : error}`,
        { cause: error }
      );
    }

    try {
      return require(resolved);
    } catch (error) {
      throw new Error(
        `Layer 27 strategic-planner runtime failed during module loading.\nResolved module: ${resolved}\nCause: ${error && error.message ? error.message : error}`,
        { cause: error }
      );
    }
  }

  throw new Error([
    "Missing Layer 27 strategic-planner runtime.",
    `Canonical path: ${CANONICAL_RUNTIME}`,
    "Attempted candidates:",
    ...attempted.map((candidate) => `- ${candidate}`)
  ].join("\n"));
}

function callable(api, names) {
  if (typeof api === "function") return api;
  for (const name of names) {
    if (!api) break;
    const descriptor = Object.getOwnPropertyDescriptor(api, name);
    if (descriptor && typeof descriptor.value === "function") {
      return descriptor.value.bind(api);
    }
  }
  throw new TypeError(`Expected one callable strategic-planner export: ${names.join(", ")}`);
}

function assertPlannerEnvelope(out) {
  assert.ok(isObject(out), "Strategic planner must return a non-array object.");
  assert.equal(out.executionAuthorized, false, "Strategic planner must remain advisory-only.");
  assert.notEqual(out.automaticExecutionAllowed, true, "Strategic planner must not permit automatic execution.");
  assert.notEqual(out.replaceComposer, true, "Strategic planner must not replace the response composer.");
  assert.notEqual(out.replaceReplyAuthority, true, "Strategic planner must not replace Marion's reply authority.");
}

test("Layer 27 strategic planner resolves from the canonical strategy runtime", () => {
  assert.ok(fs.existsSync(CANONICAL_RUNTIME), `Canonical strategic-planner runtime is missing: ${CANONICAL_RUNTIME}`);
});

test("Layer 27 strategic planner creates bounded multi-horizon planning without authorizing execution", async () => {
  const api = loadRuntime();
  const plan = callable(api, ["plan", "createPlan", "analyze", "run"]);
  const input = {
    prompt: "Integrate Layers 27 and 28 after Layers 1 through 26 remain stable.",
    activeGoal: "extend Marion additively without destabilizing production",
    constraints: ["preserve reply authority", "no automatic execution", "current-turn authority"],
    stateSpine: { schema: "nyx.marion.stateSpine/1.7", currentTurn: 27 },
    priorLayers: { min: 1, max: 26, certified: true }
  };
  const out = await Promise.resolve(plan(input));
  assertPlannerEnvelope(out);
  const horizons = out.horizons || out.planHorizons || out.timeline;
  assert.ok(isObject(horizons) || Array.isArray(horizons), "Strategic planner must expose bounded planning horizons.");
  const serialized = JSON.stringify(out);
  assert.match(serialized, /immediate|current|now/i);
  assert.match(serialized, /short|next/i);
  assert.ok(Buffer.byteLength(serialized, "utf8") < 50000, "Strategic planner output must remain below 50,000 bytes.");
  assert.ok(clean(out.version || api.VERSION || api.version), "Strategic planner must expose a version.");
});

test("Layer 27 strategic planner preserves explicit current-turn goal corrections", async () => {
  const api = loadRuntime();
  const plan = callable(api, ["plan", "createPlan", "analyze", "run"]);
  const out = await Promise.resolve(plan({
    prompt: "Correction: test files first; runtime files come afterward.",
    previousGoal: "generate all Layer 27 and 28 runtime files",
    explicitGoal: "generate only the six dedicated test files",
    activeGoal: "generate only the six dedicated test files",
    interactionState: "correction",
    correctionOverride: true,
    currentTurnAuthority: true
  }));
  assertPlannerEnvelope(out);
  const text = JSON.stringify(out);
  assert.match(text, /six dedicated test files|test files first/i);
  assert.doesNotMatch(text, /executionAuthorized\s*["']?\s*[:=]\s*true/i);
  assert.doesNotMatch(text, /generate all Layer 27 and 28 runtime files/i);
});
