"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

function load(name, folder="metacognition") {
  for (const p of [path.join(process.cwd(), "Data", "marion", "runtime", name), path.join(process.cwd(), "src", "marion", folder, name)]) {
    try { return require(p); } catch (e) { if (!e || e.code !== "MODULE_NOT_FOUND") throw e; }
  }
  throw new Error(`Missing required runtime file: ${name}`);
}
function invoke(api, names, input) {
  const fn = typeof api === "function" ? api : names.map(n => api && api[n]).find(v => typeof v === "function");
  assert.equal(typeof fn, "function", `Missing callable export ${names.join("/")}`);
  return fn.call(api, input);
}

test("Layer 28 reflection remains internal, bounded, non-recursive, and reply-preserving", async () => {
  const reasoner = load("marionMetaReasoner.js");
  const evaluator = load("marionResponseEvaluator.js");
  const envelope = load("marionReflectionEnvelope.js");
  const base = {
    ok: true, final: true, handled: true,
    reply: "Runtime files are deferred until the next batch.",
    displayReply: "Runtime files are deferred until the next batch.",
    noUserFacingDiagnostics: true,
    stateSpine: { schema: "nyx.marion.stateSpine/1.7" }
  };
  const meta = await invoke(reasoner, ["reason", "reflect", "analyze", "run"], {
    baseEnvelope: base, maxPasses: 1, recursionDepth: 0
  });
  const evaluation = await invoke(evaluator, ["evaluate", "score", "analyze", "run"], {
    baseEnvelope: base, meta
  });
  const out = await invoke(envelope, ["build", "create", "wrap", "run"], {
    baseEnvelope: base, meta, evaluation
  });
  assert.equal(out.reply, base.reply);
  assert.equal(out.displayReply, base.displayReply);
  assert.equal(out.final, true);
  assert.equal(out.handled, true);
  assert.equal(out.noUserFacingDiagnostics, true);
  assert.notEqual(out.executionAuthorized, true);
  const layer = out.layer28 || out.reflection || out.metaCognition;
  assert.ok(layer && typeof layer === "object");
  assert.ok((layer.recursionDepth || 0) <= 1);
  assert.ok(JSON.stringify(out).length < 50000);
});

test("Layer 28 contains thrown primitives and unsafe getters without public leakage", async () => {
  const reasoner = load("marionMetaReasoner.js");
  const hostile = {};
  Object.defineProperty(hostile, "reply", { enumerable: true, get() { throw new Error("secret diagnostic"); } });
  let out;
  try {
    out = await invoke(reasoner, ["reason", "reflect", "analyze", "run"], { baseEnvelope: hostile, recursionDepth: 0 });
  } catch (error) {
    assert.fail(`Layer 28 must contain hostile input: ${error && error.message}`);
  }
  assert.ok(out && typeof out === "object");
  assert.notEqual(out.executionAuthorized, true);
  assert.doesNotMatch(String(out.reply || out.displayReply || ""), /secret diagnostic|Error|stack/i);
});
