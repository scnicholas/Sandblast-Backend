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

function firstText(...values) {
  for (const value of values) {
    const text = value == null ? "" : String(value).replace(/\s+/g, " ").trim();
    if (text) return text;
  }
  return "";
}

function visibleReply(packet) {
  const p = packet && typeof packet === "object" ? packet : {};
  const payload = p.payload && typeof p.payload === "object" ? p.payload : {};
  const envelope = p.finalEnvelope && typeof p.finalEnvelope === "object" ? p.finalEnvelope : {};
  return firstText(
    p.directReply,
    p.publicReply,
    p.visibleReply,
    p.displayReply,
    p.finalReply,
    p.reply,
    p.text,
    p.message,
    payload.directReply,
    payload.publicReply,
    payload.visibleReply,
    payload.displayReply,
    payload.finalReply,
    payload.reply,
    payload.text,
    envelope.directReply,
    envelope.publicReply,
    envelope.visibleReply,
    envelope.displayReply,
    envelope.finalReply,
    envelope.reply,
    envelope.text
  );
}

function expectCleanPublicReply(reply) {
  expect(reply).toEqual(expect.any(String));
  expect(reply.length).toBeGreaterThan(8);
  expect(reply).not.toMatch(/\b(finalEnvelope|runtimeTelemetry|replyAuthority|sessionPatch|routeKind|diagnostic packet|MARION::FINAL::|ReferenceError|TypeError|SyntaxError)\b/i);
}

describe("Priority 1 — response composition and final envelope", () => {
  const composer = loadModule([
    "Data/marion/runtime/composeMarionResponse.js",
    "composeMarionResponse.js"
  ]);
  const finalEnvelope = loadModule([
    "Data/marion/runtime/marionFinalEnvelope.js",
    "marionFinalEnvelope.js"
  ]);
  const bridge = loadModule([
    "Data/marion/runtime/marionBridge.js",
    "marionBridge.js"
  ]);
  const gatekeeper = loadModule([
    "Data/marion/runtime/MarionEthicalGatekeeper.js",
    "MarionEthicalGatekeeper.js"
  ]);
  const adapter = loadModule([
    "Data/marion/runtime/guardian.response.adapter.js",
    "guardian.response.adapter.js"
  ]);

  test("composeMarionResponse returns a clean Marion/Nyx continuity answer", () => {
    expect(typeof composer.composeMarionResponse).toBe("function");

    const result = composer.composeMarionResponse({}, {
      text: "What is Marion supposed to do?",
      inputChannel: "text"
    });

    const reply = visibleReply(result);
    expectCleanPublicReply(reply);
    expect(reply).toMatch(/Marion/i);
    expect(reply).toMatch(/Nyx/i);
  });

  test("final envelope promotes one visible reply across public aliases", () => {
    expect(typeof finalEnvelope.createMarionFinalEnvelope).toBe("function");

    const final = finalEnvelope.createMarionFinalEnvelope({
      reply: "Marion produced one clean final reply for Nyx to show.",
      source: "priority1-test"
    });

    const reply = visibleReply(final);
    expectCleanPublicReply(reply);
    expect(reply).toBe("Marion produced one clean final reply for Nyx to show.");

    const payload = final.payload || {};
    const envelope = final.finalEnvelope || {};
    expect(firstText(payload.reply, payload.text, envelope.reply, envelope.text)).toBe(reply);
    expect(final.final === true || final.marionFinal === true || envelope.final === true || envelope.marionFinal === true).toBe(true);
  });

  test("ethical gatekeeper authorizes only bounded verified defensive escalation", () => {
    expect(typeof gatekeeper.evaluateEthicalGate).toBe("function");

    const unverified = gatekeeper.evaluateEthicalGate({
      observationSummary: "Activate a continuous protection alarm with no explicit code."
    });

    expect(unverified.allowed).toBe(false);
    expect(unverified.blocked).toBe(true);
    expect(unverified.publicReplyVisible).toBe(false);
    expect(unverified.finalAuthority || unverified.authority?.finalAuthority).toBe("Marion");

    const verified = gatekeeper.evaluateEthicalGate({
      observationSummary: "Emergency personal safety imminent threat. Activate defensive alert with explicit authorized command.",
      defensiveJustification: {
        explicitCommand: true,
        immediateThreat: true,
        protectivePurpose: true,
        escalationRequested: true,
        permissionAllowed: true,
        maxBurstSeconds: 5,
        minCooldownSeconds: 15
      }
    });

    expect(verified.allowed).toBe(true);
    expect(verified.blocked).toBe(false);
    expect(verified.publicReplyVisible).toBe(false);
    expect(verified.defensiveEscalation?.escalationAllowed).toBe(true);
    expect(verified.defensiveEscalation?.maxBurstSeconds).toBeLessThanOrEqual(8);
    expect(verified.defensiveEscalation?.minCooldownSeconds).toBeGreaterThanOrEqual(15);
  });

  test("Guardian adapter carries ethics metadata without exposing secrets", () => {
    expect(typeof adapter.adaptGuardianResponse).toBe("function");

    const ethicalGate = gatekeeper.evaluateEthicalGate({
      observationSummary: "Emergency personal safety imminent threat. Activate defensive alert with explicit authorized command.",
      defensiveJustification: {
        explicitCommand: true,
        immediateThreat: true,
        protectivePurpose: true,
        escalationRequested: true,
        permissionAllowed: true
      }
    });

    const packet = adapter.adaptGuardianResponse({
      reply: "Visible response only.",
      ethicalGate,
      authorization: "Bearer SECRET_TOKEN"
    });

    expect(packet.directReply).toBe("Visible response only.");
    expect(packet.ethicalGate).toBeTruthy();
    expect(packet.defensiveEscalation).toBeTruthy();
    expect(JSON.stringify(packet)).not.toMatch(/SECRET_TOKEN|Bearer SECRET_TOKEN/);
  });

  test("bridge exposes defensive escalation carry while preserving Marion final authority", async () => {
    expect(typeof bridge.processWithMarion || typeof bridge.route || typeof bridge.handle).toBe("function");
    expect(bridge._internal).toBeTruthy();

    if (typeof bridge._internal.bridgeDefensiveEscalationCarry === "function") {
      const carry = bridge._internal.bridgeDefensiveEscalationCarry({
        userQuery: "Emergency personal safety imminent threat activate defensive alert with explicit authorized command."
      }, {});
      expect(carry.immediateThreat).toBe(true);
      expect(carry.explicitCommand).toBe(true);
      expect(carry.protectivePurpose).toBe(true);
    }

    const handler = bridge.processWithMarion || bridge.route || bridge.handle;
    const result = await handler({
      text: "Explain the defensive escalation guardrail for Marion, Aster, and Talon.",
      userQuery: "Explain the defensive escalation guardrail for Marion, Aster, and Talon."
    });

    const reply = visibleReply(result);
    expectCleanPublicReply(reply);
    expect(reply).toMatch(/Marion|guardrail|defensive|Aster|Talon|Thalon/i);
  });
});
