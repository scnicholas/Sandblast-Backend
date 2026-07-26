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
  for (const n of ["audit", "analyze", "evaluate", "run"]) if (api && typeof api[n] === "function") return api[n].bind(api);
  throw new TypeError("Reasoning auditor has no callable export");
}

test("Layer 28 reasoning auditor identifies unsupported certainty and knowledge gaps", async () => {
  const audit = callable(load("marionReasoningAuditor.js"));
  const out = await audit({
    prompt: "Are all Layer 27 files already installed?",
    proposedReply: "Yes, every file is installed and verified.",
    evidence: [],
    claims: [{ text: "every file is installed and verified", confidence: 1, sourceBound: false }]
  });
  assert.ok(out && typeof out === "object");
  const text = JSON.stringify(out);
  assert.match(text, /unsupported|evidence|knowledge.?gap|overconfidence|uncertain/i);
  assert.notEqual(out.approved, true);
  assert.notEqual(out.executionAuthorized, true);
  assert.equal(out.internalOnly !== false, true);
});

test("Layer 28 reasoning auditor does not rewrite a supported user-facing answer", async () => {
  const audit = callable(load("marionReasoningAuditor.js"));
  const reply = "The six tests are packaged; the 25 runtime files remain deferred.";
  const out = await audit({
    prompt: "What is included?", proposedReply: reply,
    evidence: [{ id: "manifest", supports: reply, sourceBound: true }],
    claims: [{ text: reply, confidence: 0.98, sourceBound: true }]
  });
  assert.ok(out && typeof out === "object");
  assert.ok(out.proposedReply === undefined || out.proposedReply === reply);
  assert.ok(out.rewrittenReply === undefined || out.rewrittenReply === reply);
});
