"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function loadRuntime(name) {
  const candidates = [
    path.join(process.cwd(), "Data", "marion", "runtime", name),
    path.join(process.cwd(), "src", "marion", "strategy", name),
    path.join(__dirname, "..", "..", "..", "Data", "marion", "runtime", name)
  ];
  let last;
  for (const candidate of candidates) {
    try { return require(candidate); } catch (error) {
      if (error && error.code !== "MODULE_NOT_FOUND") throw error;
      last = error;
    }
  }
  throw new Error(`Missing Layer 27 runtime module ${name}. Last error: ${last && last.message}`);
}

function callable(api, names) {
  if (typeof api === "function") return api;
  for (const name of names) if (api && typeof api[name] === "function") return api[name].bind(api);
  throw new TypeError(`Expected one callable export: ${names.join(", ")}`);
}

function clean(value) { return typeof value === "string" ? value.trim() : ""; }

test("Layer 27 strategic planner creates bounded multi-horizon planning without authorizing execution", async () => {
  const api = loadRuntime("marionStrategicPlanner.js");
  const plan = callable(api, ["plan", "createPlan", "analyze", "run"]);
  const input = {
    prompt: "Integrate Layers 27 and 28 after Layers 1 through 26 remain stable.",
    activeGoal: "extend Marion additively without destabilizing production",
    constraints: ["preserve reply authority", "no automatic execution", "current-turn authority"],
    stateSpine: { schema: "nyx.marion.stateSpine/1.7", currentTurn: 27 },
    priorLayers: { min: 1, max: 26, certified: true }
  };
  const out = await plan(input);
  assert.ok(out && typeof out === "object" && !Array.isArray(out));
  assert.equal(out.executionAuthorized, false);
  assert.notEqual(out.replaceComposer, true);
  assert.notEqual(out.replaceReplyAuthority, true);
  const horizons = out.horizons || out.planHorizons || out.timeline;
  assert.ok(horizons && typeof horizons === "object", "planner must expose bounded horizons");
  const serialized = JSON.stringify(out);
  assert.match(serialized, /immediate|current|now/i);
  assert.match(serialized, /short|next/i);
  assert.ok(serialized.length < 50000, "planner output must remain bounded");
  assert.ok(clean(out.version || api.VERSION || api.version), "planner must expose a version");
});

test("Layer 27 strategic planner preserves explicit current-turn goal corrections", async () => {
  const api = loadRuntime("marionStrategicPlanner.js");
  const plan = callable(api, ["plan", "createPlan", "analyze", "run"]);
  const out = await plan({
    prompt: "Correction: test files first; runtime files come afterward.",
    previousGoal: "generate all Layer 27 and 28 runtime files",
    explicitGoal: "generate only the six dedicated test files",
    interactionState: "correction",
    correctionOverride: true
  });
  const text = JSON.stringify(out);
  assert.match(text, /six dedicated test files|test files first/i);
  assert.doesNotMatch(text, /executionAuthorized\s*[:=]\s*true/i);
});
