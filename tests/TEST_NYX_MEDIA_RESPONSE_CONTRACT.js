"use strict";

const assert = require("assert");
const { loadIndex } = require("./_index_test_harness.js");
const { backend } = loadIndex();

const prompts = [
  "What can I watch on Sandblast?",
  "What movies are available?",
  "Can I watch that on Roku?"
];

for (const prompt of prompts) {
  const norm = {
    audience: "public",
    lane: "public_interface",
    presentationProfile: "public",
    publicSurfaceOnly: true,
    publicIdentityLock: true,
    text: prompt,
    message: prompt,
    turnId: `turn_${prompt.length}`,
    traceId: `trace_${prompt.length}`
  };

  const decision = backend.buildNyxPublicFastPathDecision(norm);

  assert.ok(decision, `${prompt}: no public fast-path decision`);
  assert.strictEqual(decision.routeType, "knowledge");
  assert.strictEqual(decision.actionMode, "answer");
  assert.strictEqual(decision.semanticRoute, true);
  assert.strictEqual(decision.navigationRoute, false);
  assert.strictEqual(decision.actionRequired, false);
  assert.strictEqual(decision.validateAction, false);
  assert.strictEqual(decision.domain, "media");

  const response = backend.buildNyxPublicFastPathResponse(
    norm,
    "regression_session",
    Date.now(),
    decision
  );

  assert.ok(response && typeof response === "object");
  assert.strictEqual(response.routeType, "knowledge");
  assert.strictEqual(response.actionMode, "answer");
  assert.strictEqual(response.semanticRoute, true);
  assert.strictEqual(response.navigationRoute, false);
  assert.strictEqual(response.actionRequired, false);
  assert.strictEqual(response.validateAction, false);
  assert.strictEqual(response.actionValidationRequired, false);
  assert.strictEqual(response.pendingActionValidation, false);
  assert.strictEqual(response.answerOnly, true);
  assert.strictEqual(response.domain, "media");
  assert.strictEqual(response.payload.actionRequired, false);
  assert.strictEqual(response.payload.validateAction, false);
  assert.strictEqual(response.finalEnvelope.actionRequired, false);
  assert.strictEqual(response.finalEnvelope.validateAction, false);

  assert.doesNotMatch(
    response.reply,
    /legal-risk triage|not legal advice|legal category|jurisdiction sensitivity/i
  );
}

const legalDecision = backend.buildNyxPublicFastPathDecision({
  audience: "public",
  lane: "public_interface",
  publicSurfaceOnly: true,
  text: "Can I legally distribute copyrighted movies on Roku?"
});

assert.strictEqual(
  legalDecision,
  null,
  "Explicit legal/media request must not use deterministic media discovery"
);

console.log("PASS: Nyx public media response contract R5.1");
