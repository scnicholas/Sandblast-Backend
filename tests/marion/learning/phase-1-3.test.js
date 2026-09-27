"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Policy = require("../../../Data/marion/runtime/learning/MarionLearningPolicy");
const { createMarionLearningSignalAdapter } = require("../../../Data/marion/runtime/learning/MarionLearningSignalAdapter");
const { validateEvaluationSet } = require("../../../Data/marion/runtime/learning/MarionLearningDataset");
const { createEvaluator } = require("../../../Data/marion/runtime/learning/MarionLearningEvaluator");
const { createMarionLearningAuditStore } = require("../../../Data/marion/runtime/learning/MarionLearningAuditStore");
const { createApprovalGate } = require("../../../Data/marion/runtime/learning/MarionLearningApprovalGate");

function stores() {
  const events = [];
  const proposals = new Map();
  const auditStore = createMarionLearningAuditStore({ durableAppend: async event => { events.push(event); } });
  return {
    events, auditStore,
    signalStore: { async appendSignal(value) { events.push(value); } },
    proposalStore: { async get(id) { return proposals.get(id); }, async set(id, value) { proposals.set(id, value); } }
  };
}

test("Phase 1 accepts minimized signals and rejects prompt-like or protected content", async () => {
  const s = stores();
  const adapter = createMarionLearningSignalAdapter({ signalStore: s.signalStore });
  const accepted = await adapter.record({ signalId: "sig-1", signalClass: "owner_correction", scope: "response_style", sourceSubsystem: "marion", outcomeScore: 0.9 });
  assert.equal(accepted.ok, true);
  assert.equal((await adapter.record({ signalId: "sig-2", signalClass: "task_success", scope: "routing", sourceSubsystem: "marion", outcomeScore: 1, transcript: "private" })).reason, "sensitive_field_present");
  assert.equal(Policy.validateSignal({ signalId: "sig-3", signalClass: "task_success", scope: "safety", sourceSubsystem: "marion", outcomeScore: 1 }).reason, "protected_scope");
});

test("Phase 2 evaluates only versioned external fixtures and requires lift", async () => {
  const s = stores();
  const caseIds = Array.from({ length: 20 }, (_, i) => `case-${i + 1}`);
  const dataset = { datasetId: "synthetic-v1", version: "1", fixtureStore: "private-evaluation-fixtures", cases: caseIds.map(caseId => ({ caseId })) };
  assert.equal(validateEvaluationSet(dataset).ok, true);
  assert.equal(validateEvaluationSet({ ...dataset, cases: [{ caseId: "bad", prompt: "should not be embedded" }] }).reason, "case_must_use_external_fixture_reference");
  const evaluator = createEvaluator({
    auditStore: s.auditStore,
    runVersion: async version => ({ completed: true, score: version === "candidate-2" ? 0.78 : 0.70, regressions: [{ delta: -0.005 }], criticalFailures: [] })
  });
  const result = await evaluator.evaluate({ proposalId: "p-1", scope: "response_style", baselineVersion: "baseline-1", candidateVersion: "candidate-2", datasetId: "synthetic-v1", datasetVersion: "1", artifactRef: "candidate-artifact-2", sampleCount: 20 }, dataset);
  assert.equal(result.report.validated, true);
  assert.equal(result.report.liveBehaviorChanged, false);
});

test("Phase 3 requires server-verified owner approval and sends approved candidates to release review", async () => {
  const s = stores();
  const gate = createApprovalGate({ proposalStore: s.proposalStore, auditStore: s.auditStore });
  const report = { proposalId: "p-2", candidateVersion: "candidate-3", validated: true, state: "awaiting_owner_approval", liveBehaviorChanged: false };
  await gate.submitEvaluation(report);
  assert.equal((await gate.decide({ proposalId: "p-2", decision: "approve", authContext: { authenticated: true, role: "owner", actorId: "mac" } })).reason, "owner_authentication_required");
  const approved = await gate.decide({ proposalId: "p-2", decision: "approve", approvalId: "approval-1", authContext: { authenticated: true, role: "owner", actorId: "mac", verifiedBy: "server_middleware" } });
  assert.equal(approved.state, "approved_for_release_review");
  assert.equal(approved.releaseRequired, true);
  assert.equal(approved.liveBehaviorChanged, false);
  assert.ok(s.events.every(event => !("prompt" in event) && !("transcript" in event)));
});
