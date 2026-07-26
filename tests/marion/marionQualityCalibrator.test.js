"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function load(name) {
  for (const p of [path.join(process.cwd(), "Data", "marion", "runtime", name), path.join(process.cwd(), "src", "marion", "metacognition", name)]) {
    try { return require(p); } catch (e) { if (!e || e.code !== "MODULE_NOT_FOUND") throw e; }
  }
  throw new Error(`Missing Layer 28 runtime module ${name}`);
}
function callable(api) {
  if (typeof api === "function") return api;
  for (const n of ["calibrate", "score", "evaluate", "run"]) if (api && typeof api[n] === "function") return api[n].bind(api);
  throw new TypeError("Quality calibrator has no callable export");
}
function numberInRange(v) { return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1; }

test("Layer 28 quality calibrator emits normalized bounded quality dimensions", async () => {
  const calibrate = callable(load("marionQualityCalibrator.js"));
  const out = await calibrate({
    prompt: "Send the six dedicated tests first.",
    reply: "The six dedicated tests are included. The runtime modules are deferred.",
    evidenceCoverage: 1,
    constraints: { concise: true, preserveCurrentTurnAuthority: true }
  });
  assert.ok(out && typeof out === "object");
  const scores = out.scores || out.quality || out.dimensions;
  assert.ok(scores && typeof scores === "object");
  for (const key of ["clarity", "specificity", "completeness"]) {
    assert.ok(numberInRange(scores[key]), `${key} must be normalized from 0 to 1`);
  }
  if (scores.confidence !== undefined) assert.ok(numberInRange(scores.confidence));
  assert.ok(JSON.stringify(out).length < 20000);
});

test("Layer 28 quality calibrator flags leaked diagnostics and recursive self-commentary", async () => {
  const calibrate = callable(load("marionQualityCalibrator.js"));
  const out = await calibrate({
    prompt: "Give the result.",
    reply: "TypeError at marionMetaReasoner.js:44. I am reflecting on my reflection and will now reflect again.",
    noUserFacingDiagnostics: true
  });
  const text = JSON.stringify(out);
  assert.match(text, /diagnostic|stack|recursive|reflection|quality/i);
  assert.notEqual(out.approved, true);
});
