"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function loadModule(candidates) {
  const tried = [];
  for (const rel of candidates) {
    const abs = path.join(ROOT, rel);
    tried.push(rel);
    if (!fs.existsSync(abs)) continue;
    delete require.cache[require.resolve(abs)];
    return require(abs);
  }
  throw new Error(`Unable to load module. Tried: ${tried.join(", ")}`);
}

function loadJson(candidates) {
  return loadModule(candidates);
}

const safeProtectiveEscalation = Object.freeze({
  active: true,
  defensiveIntent: true,
  protectivePurpose: "Verified self-defense attention signal.",
  verifiedCommand: true,
  explicitCommand: true,
  humanApproval: true,
  permissionAllowed: true,
  maxBurstSeconds: 5,
  minCooldownSeconds: 15
});

const unsafeProtectiveEscalation = Object.freeze({
  active: true,
  defensiveIntent: true,
  protectivePurpose: "Continuous punitive alarm",
  verifiedCommand: false,
  explicitCommand: false,
  continuous: true,
  punitive: true,
  maxBurstSeconds: 20,
  minCooldownSeconds: 1
});

describe("Priority 3 — state management, memory, audit, and identity", () => {
  const loopGuard = loadModule([
    "Data/marion/runtime/marionLoopGuard.js",
    "marionLoopGuard.js"
  ]);
  const stateSpine = loadModule([
    "Utils/stateSpine.js",
    "Data/marion/runtime/stateSpine.js",
    "stateSpine.js"
  ]);
  const memoryBridge = loadModule([
    "Data/marion/runtime/guardian.memory.bridge.js",
    "guardian.memory.bridge.js"
  ]);
  const auditLogger = loadModule([
    "Data/marion/runtime/guardian.audit.logger.js",
    "guardian.audit.logger.js"
  ]);
  const identityRegistry = loadJson([
    "Data/marion/runtime/guardian.identity.registry.json",
    "guardian.identity.registry.json"
  ]);

  test("Priority-3 files expose CommonJS-compatible runtime functions", () => {
    expect(typeof loopGuard.evaluateLoop).toBe("function");
    expect(typeof loopGuard.normalizeProtectiveEscalationCarry).toBe("function");
    expect(typeof loopGuard.protectiveEscalationPolicyViolation).toBe("function");

    expect(typeof stateSpine.createState).toBe("function");
    expect(typeof stateSpine.finalizeTurn).toBe("function");
    expect(typeof stateSpine.extractProtectiveEscalationStateCarry).toBe("function");

    expect(typeof memoryBridge.rememberTurn).toBe("function");
    expect(typeof memoryBridge.getGuardianSnapshot).toBe("function");

    expect(typeof auditLogger.logGuardianEvent).toBe("function");
    expect(typeof auditLogger.getGuardianAuditLog).toBe("function");
  });

  test("identity registry preserves Marion authority and Talon alias compatibility", () => {
    expect(identityRegistry.defaultGuardian).toBe("marion");
    expect(identityRegistry.activeGuardian).toBe("marion");
    expect(identityRegistry.aliases.talon).toBe("thalon");
    expect(identityRegistry.rules.marionFinalAuthority).toBe(true);
    expect(identityRegistry.rules.advisoryGuardiansDoNotOverrideMarion).toBe(true);
    expect(identityRegistry.rules.protectiveEscalationRequiresMarionApproval).toBe(true);
    expect(identityRegistry.guardians.aster.finalAuthority).toBe(false);
    expect(identityRegistry.guardians.thalon.finalAuthority).toBe(false);
  });

  test("loop guard blocks unsafe protective escalation loops", () => {
    const normalizedSafe = loopGuard.normalizeProtectiveEscalationCarry(safeProtectiveEscalation);
    expect(normalizedSafe.active).toBe(true);
    expect(normalizedSafe.allowed).toBe(true);
    expect(normalizedSafe.maxBurstSeconds).toBeLessThanOrEqual(8);
    expect(normalizedSafe.minCooldownSeconds).toBeGreaterThanOrEqual(15);

    expect(loopGuard.protectiveEscalationPolicyViolation(unsafeProtectiveEscalation)).toBe(true);

    const guarded = loopGuard.evaluateLoop(
      { text: "protect me", protectiveEscalation: unsafeProtectiveEscalation },
      "Alarm escalation active."
    );

    expect(guarded.allowReply).toBe(false);
    expect(guarded.forceRecovery).toBe(true);
    expect(guarded.reasons).toContain("protective_escalation_policy_violation");
    expect(guarded.protectiveEscalationActive).toBe(true);
  });

  test("state spine persists bounded protective escalation carry only", () => {
    const prevState = stateSpine.createState();
    const reply = "Protective signal is bounded and logged.";

    const state = stateSpine.finalizeTurn({
      prevState,
      inbound: {
        text: "Protective signal confirmed.",
        protectiveEscalation: safeProtectiveEscalation
      },
      decision: {
        stage: "final",
        speak: reply
      },
      marionFinal: {
        finalEnvelope: {
          contract: "nyx.marion.final/1.0",
          finalSignature: "MARION_FINAL_AUTHORITY",
          reply
        }
      },
      memoryPatch: {
        composedOnce: true,
        protectiveEscalation: safeProtectiveEscalation
      }
    });

    expect(state.protectiveEscalationActive).toBe(true);
    expect(state.protectiveEscalation.allowed).toBe(true);
    expect(state.protectiveEscalation.maxBurstSeconds).toBeLessThanOrEqual(8);
    expect(state.protectiveEscalation.minCooldownSeconds).toBeGreaterThanOrEqual(15);
    expect(JSON.stringify(state)).not.toMatch(/Bearer|SECRET|authorization token/i);
  });

  test("Guardian memory normalizes Talon and carries redacted protective state", () => {
    const snap = memoryBridge.rememberTurn("talon", {
      input: "review scenario",
      reply: "Advisory review only.",
      protectiveEscalation: safeProtectiveEscalation,
      riskLevel: "high",
      authorization: "Bearer SECRET_TOKEN"
    });

    expect(snap.guardian).toBe("thalon");
    expect(snap.protectiveEscalation.active).toBe(true);
    expect(snap.protectiveEscalation.allowed).toBe(true);
    expect(JSON.stringify(snap)).not.toMatch(/SECRET_TOKEN|Bearer SECRET_TOKEN/);
  });

  test("Guardian audit logger records protective escalation without leaking secrets", () => {
    auditLogger.clearGuardianAuditLog();

    const entry = auditLogger.logGuardianEvent({
      guardian: "talon",
      type: "protective_escalation",
      input: "token=secret protect me",
      reply: "Advisory route only.",
      protectiveEscalation: safeProtectiveEscalation,
      meta: {
        authorization: "Bearer abc123",
        trace: "visible-trace"
      }
    });

    expect(entry.guardian).toBe("thalon");
    expect(entry.protectiveEscalationActive).toBe(true);
    expect(entry.riskLevel).toMatch(/high|critical|medium/);
    expect(entry.meta.authorization).toBe("[REDACTED]");
    expect(JSON.stringify(entry)).not.toMatch(/abc123|Bearer abc123/);

    const exported = auditLogger.exportGuardianAuditLog({ limit: 10 });
    expect(exported.count).toBe(1);
    expect(exported.entries[0].protectiveEscalationActive).toBe(true);
  });
});
