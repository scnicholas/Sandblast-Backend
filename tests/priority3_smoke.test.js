"use strict";
const assert = require("assert");
const loopGuard = require("./marionLoopGuard.js");
const stateSpine = require("./stateSpine.js");
const memory = require("./guardian.memory.bridge.js");
const audit = require("./guardian.audit.logger.js");
const registry = require("./guardian.identity.registry.json");

assert.strictEqual(typeof loopGuard.evaluateLoop, "function");
assert.strictEqual(typeof loopGuard.normalizeProtectiveEscalationCarry, "function");
assert.strictEqual(typeof stateSpine.finalizeTurn, "function");
assert.strictEqual(typeof stateSpine.extractProtectiveEscalationStateCarry, "function");
assert.strictEqual(typeof memory.rememberTurn, "function");
assert.strictEqual(typeof audit.logGuardianEvent, "function");
assert.strictEqual(registry.aliases.talon, "thalon");
assert.strictEqual(registry.rules.protectiveEscalationRequiresMarionApproval, true);

const safeProtective = {
  active: true,
  defensiveIntent: true,
  protectivePurpose: "Verified self-defense attention signal.",
  verifiedCommand: true,
  humanApproval: true,
  maxBurstSeconds: 5,
  minCooldownSeconds: 15
};
const unsafeProtective = {
  active: true,
  defensiveIntent: true,
  protectivePurpose: "Continuous alarm",
  verifiedCommand: false,
  continuous: true,
  maxBurstSeconds: 20,
  minCooldownSeconds: 1
};
assert.strictEqual(loopGuard.normalizeProtectiveEscalationCarry(safeProtective).allowed, true);
assert.strictEqual(loopGuard.protectiveEscalationPolicyViolation(unsafeProtective), true);
const guarded = loopGuard.evaluateLoop({ text: "protect me", protectiveEscalation: unsafeProtective }, "Alarm escalation active.");
assert.strictEqual(guarded.allowReply, false);
assert.ok(guarded.reasons.includes("protective_escalation_policy_violation"));

const snap = memory.rememberTurn("talon", { input: "review scenario", protectiveEscalation: safeProtective, riskLevel: "high" });
assert.strictEqual(snap.guardian, "thalon");
assert.strictEqual(snap.protectiveEscalation.allowed, true);
const entry = audit.logGuardianEvent({ guardian: "talon", type: "protective_escalation", input: "token=secret", protectiveEscalation: safeProtective, meta: { authorization: "Bearer abc123" }});
assert.strictEqual(entry.guardian, "thalon");
assert.strictEqual(entry.protectiveEscalationActive, true);
assert.strictEqual(entry.meta.authorization, "[REDACTED]");

const state = stateSpine.finalizeTurn({
  prevState: stateSpine.createState(),
  inbound: { text: "Protective signal confirmed", protectiveEscalation: safeProtective },
  decision: { stage: "final", speak: "Protective signal is bounded and logged." },
  marionFinal: { finalEnvelope: { contract: "nyx.marion.final/1.0", finalSignature: "MARION_FINAL_AUTHORITY", reply: "Protective signal is bounded and logged." } },
  memoryPatch: { composedOnce: true }
});
assert.strictEqual(state.protectiveEscalationActive, true);
assert.strictEqual(state.protectiveEscalation.allowed, true);
console.log("priority3 smoke passed");
