"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Integration = require("../../../Data/marion/runtime/learning/MarionLearningIntegration");
const { createAndRegisterMarionLearningBackend } = require("../../../Data/marion/runtime/learning/MarionLearningBackendSetup");
const { createMarionLearningAuditStore } = require("../../../Data/marion/runtime/learning/MarionLearningAuditStore");

const AUTH = {
  authenticated: true, ownerAuthenticated: true, role: "owner", actorId: "owner-id",
  verifiedBy: "server_middleware", learningConsent: true,
  signal: { signalId: "signal-01", signalClass: "owner_confirmation", scope: "response_style", sourceSubsystem: "marion-admin", outcomeScore: 1 }
};
const FINAL = {
  ok: true, final: true, marionFinal: true, reply: "Confirmed.",
  finalEnvelope: { final: true, marionFinal: true, reply: "Confirmed." }
};

test("learning capture requires explicit middleware-verified owner consent and an accepted final", async () => {
  const sent = [];
  const runtime = { async captureFinalOutcome(event) { sent.push(event); return { ok: true, accepted: true }; } };
  assert.equal((await Integration.captureAcceptedAdminFinal({ runtime, result: FINAL, options: { marionLearningContext: { ...AUTH, verifiedBy: "client" } }, gatewayAdminVerified: true })).reason, "trusted_owner_consent_required");
  assert.equal((await Integration.captureAcceptedAdminFinal({ runtime, result: { ...FINAL, ok: false }, options: { marionLearningContext: AUTH }, gatewayAdminVerified: true })).reason, "accepted_marion_final_required");
  await Integration.captureAcceptedAdminFinal({ runtime, result: FINAL, options: { marionLearningContext: AUTH }, gatewayAdminVerified: true });
  assert.equal(sent.length, 1);
  assert.equal("transcript" in sent[0], false);
  assert.equal("prompt" in sent[0], false);
  assert.equal("reply" in sent[0], false);
});

test("backend setup requires durable stores and registers the assembled runtime", () => {
  const stored = [];
  const proposals = new Map();
  const signalStore = { async appendSignal(event) { stored.push(event); } };
  const proposalStore = { async get(id) { return proposals.get(id); }, async set(id, value) { proposals.set(id, value); } };
  const audit = { async append(event) { stored.push(event); } };
  const gateway = { registerMarionLearningRuntime(runtime) { this.runtime = runtime; return { ok: true }; } };
  const system = createAndRegisterMarionLearningBackend({ signalStore, proposalStore, durableAuditAppend: audit.append, runVersion: async () => ({ completed: true, score: 0.8, regressions: [], criticalFailures: [] }), gateway });
  assert.equal(system.registration.ok, true);
  assert.equal(gateway.runtime, system.runtime);
  assert.throws(() => createAndRegisterMarionLearningBackend({ signalStore, proposalStore, durableAuditAppend: audit.append, gateway }), /runVersion/);
});

test("audit append queue preserves a valid hash chain under concurrent writes", async () => {
  const events = [];
  const store = createMarionLearningAuditStore({ durableAppend: async event => { await new Promise(resolve => setTimeout(resolve, 1)); events.push(event); } });
  await Promise.all(Array.from({ length: 12 }, (_, i) => store.append({ type: "test", index: i })));
  assert.equal(events.length, 12);
  for (let i = 1; i < events.length; i++) assert.equal(events[i].previousHash, events[i - 1].eventHash);
  assert.equal(new Set(events.map(e => e.auditSequence)).size, 12);
});
