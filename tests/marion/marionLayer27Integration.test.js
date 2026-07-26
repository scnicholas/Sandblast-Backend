"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function load(name, folder="strategy") {
  const list = [
    path.join(process.cwd(), "Data", "marion", "runtime", name),
    path.join(process.cwd(), "src", "marion", folder, name)
  ];
  for (const p of list) { try { return require(p); } catch (e) { if (!e || e.code !== "MODULE_NOT_FOUND") throw e; } }
  throw new Error(`Missing required runtime file: ${name}`);
}
function call(api, names, input) {
  const f = typeof api === "function" ? api : names.map(n => api && api[n]).find(v => typeof v === "function");
  assert.equal(typeof f, "function", `Missing callable export ${names.join("/")}`);
  return f.call(api, input);
}

test("Layer 27 modules compose additively and preserve the Layers 1-26 envelope", async () => {
  const planner = load("marionStrategicPlanner.js");
  const arbitrator = load("marionPriorityArbitrator.js");
  const envelopeApi = load("marionPlanningEnvelope.js");
  const base = {
    ok: true,
    final: true,
    handled: true,
    reply: "Existing Layers 1 through 26 reply.",
    displayReply: "Existing Layers 1 through 26 reply.",
    stateSpine: { schema: "nyx.marion.stateSpine/1.7", currentTurn: 27 },
    noUserFacingDiagnostics: true
  };
  const plan = await call(planner, ["plan", "createPlan", "analyze", "run"], {
    prompt: "Prepare Layer 27 without changing the public reply.", baseEnvelope: base
  });
  const priorities = await call(arbitrator, ["arbitrate", "rank", "prioritize", "run"], {
    candidates: plan.priorities || plan.steps || [], executionAuthorized: false
  });
  const out = await call(envelopeApi, ["build", "create", "wrap", "run"], { baseEnvelope: base, plan, priorities });
  assert.equal(out.reply, base.reply);
  assert.equal(out.displayReply, base.displayReply);
  assert.equal(out.final, true);
  assert.equal(out.handled, true);
  assert.equal(out.noUserFacingDiagnostics, true);
  assert.equal(out.executionAuthorized, false);
  assert.ok(out.layer27 || out.planning || out.strategicPlan, "Layer 27 metadata missing");
  assert.ok(JSON.stringify(out).length < 50000);
});

test("Layer 27 fails closed on malformed strategic input without emitting diagnostics as reply", async () => {
  const planner = load("marionStrategicPlanner.js");
  const out = await call(planner, ["plan", "createPlan", "analyze", "run"], Object.create(null));
  assert.ok(out && typeof out === "object");
  assert.notEqual(out.executionAuthorized, true);
  const reply = String(out.reply || out.displayReply || "");
  assert.doesNotMatch(reply, /TypeError|stack|at\s+\w+\s*\(/i);
});
