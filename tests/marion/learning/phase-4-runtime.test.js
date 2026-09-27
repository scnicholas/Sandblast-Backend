"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createMarionLearningRuntime } = require("../../../Data/marion/runtime/learning/MarionLearningRuntime");

const OWNER = { authenticated: true, role: "owner", actorId: "owner-1", verifiedBy: "server_middleware" };

test("Phase 4 captures only consented accepted-final metadata", async () => {
  const captured = [];
  const runtime = createMarionLearningRuntime({
    signalAdapter: { async record(signal) { captured.push(signal); return { ok: true, accepted: true }; } },
    evaluator: { async evaluate() { return { ok: true }; } },
    approvalGate: { async submitEvaluation() { return { ok: true }; }, async decide() { return { ok: true }; } }
  });
  assert.equal((await runtime.captureFinalOutcome({ finalAccepted: false, learningConsent: true })).reason, "final_response_not_accepted");
  assert.equal((await runtime.captureFinalOutcome({ finalAccepted: true, learningConsent: false })).reason, "learning_consent_required");
  await runtime.captureFinalOutcome({ finalAccepted: true, learningConsent: true, signalId: "s1", signalClass: "owner_confirmation", scope: "response_style", sourceSubsystem: "marion", outcomeScore: 1, prompt: "not forwarded" });
  assert.equal(captured.length, 1);
  assert.equal("prompt" in captured[0], false);
});

test("Phase 4 keeps evaluation and proposal decisions owner-only", async () => {
  let evaluated = 0;
  let decided = 0;
  const runtime = createMarionLearningRuntime({
    signalAdapter: { async record() { return { ok: true }; } },
    evaluator: { async evaluate() { evaluated += 1; return { ok: true }; } },
    approvalGate: { async submitEvaluation() { return { ok: true }; }, async decide() { decided += 1; return { ok: true }; } }
  });
  assert.equal((await runtime.evaluateCandidate({}, {}, { authenticated: true, role: "owner", actorId: "x" })).reason, "owner_authentication_required");
  assert.equal((await runtime.decideProposal({}, { authenticated: true, role: "owner", actorId: "x" })).reason, "owner_authentication_required");
  await runtime.evaluateCandidate({}, {}, OWNER);
  await runtime.decideProposal({}, OWNER);
  assert.equal(evaluated, 1);
  assert.equal(decided, 1);
});

test("Phase 4 health is private and reports offline-only behavior", async () => {
  const runtime = createMarionLearningRuntime({
    signalAdapter: { async record() { return { ok: true }; } },
    evaluator: { async evaluate() { return { ok: true }; } },
    approvalGate: { async submitEvaluation() { return { ok: true }; }, async decide() { return { ok: true }; } },
    healthProbe: async () => ({ ready: true })
  });
  assert.equal((await runtime.getPrivateHealth({})).status, 403);
  const health = await runtime.getPrivateHealth(OWNER);
  assert.equal(health.status, 200);
  assert.equal(health.liveActivationEnabled, false);
  assert.equal(health.transcriptStorageEnabled, false);
});
