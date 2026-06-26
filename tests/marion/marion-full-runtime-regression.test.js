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

function expectNoPublicRuntimeLeak(value) {
  const text = firstText(value);
  expect(text).not.toMatch(/\b(finalEnvelope|runtimeTelemetry|replyAuthority|sessionPatch|routeKind|diagnostic packet|MARION::FINAL::|ReferenceError|TypeError|SyntaxError|stack trace)\b/i);
}

describe("Marion full runtime regression — Priority 1 through Priority 4", () => {
  const normalizer = loadModule([
    "Data/marion/runtime/marionCommandNormalizer.js",
    "marionCommandNormalizer.js"
  ]);
  const router = loadModule([
    "Data/marion/runtime/marionIntentRouter.js",
    "marionIntentRouter.js"
  ]);
  const concierge = loadModule([
    "Data/marion/runtime/DomainConcierge.js",
    "DomainConcierge.js"
  ]);
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
  const loopGuard = loadModule([
    "Data/marion/runtime/marionLoopGuard.js",
    "marionLoopGuard.js"
  ]);
  const stateSpine = loadModule([
    "Utils/stateSpine.js",
    "Data/marion/runtime/stateSpine.js",
    "stateSpine.js"
  ]);
  const gatekeeper = loadModule([
    "Data/marion/runtime/MarionEthicalGatekeeper.js",
    "MarionEthicalGatekeeper.js"
  ]);

  test("five-turn Marion/Nyx continuity does not echo, leak telemetry, or fallback-loop", () => {
    const prompts = [
      "Good morning, Nyx.",
      "What is Marion supposed to do?",
      "Why is that important for Nyx?",
      "How does that help Sandblast?",
      "Next steps."
    ];

    let previousReply = "";
    let prevState = stateSpine.createState ? stateSpine.createState() : {};

    for (const prompt of prompts) {
      const packet = normalizer.normalizeCommand({ text: prompt, previousState: prevState });
      const routed = router.routeMarionIntent(packet);
      const domainDecision = concierge.runDomainConcierge(packet);
      const composed = composer.composeMarionResponse(routed, {
        ...packet,
        domainConcierge: domainDecision,
        previousAssistantReply: previousReply,
        prevState
      });
      const reply = visibleReply(composed);

      expect(reply.length).toBeGreaterThan(4);
      expect(reply.toLowerCase()).not.toBe(prompt.toLowerCase());
      expectNoPublicRuntimeLeak(reply);

      const guarded = loopGuard.evaluateLoop({ previousReply, state: prevState }, reply);
      expect(guarded.allowReply).toBe(true);

      const final = finalEnvelope.createMarionFinalEnvelope({ reply, routed, domainConcierge: domainDecision });
      const finalReply = visibleReply(final);
      expect(finalReply).toBe(reply);
      expectNoPublicRuntimeLeak(finalReply);

      prevState = stateSpine.finalizeTurn({
        prevState,
        inbound: packet,
        decision: { stage: "final", speak: reply },
        marionFinal: final,
        memoryPatch: { lastAssistantReply: reply, domainConcierge: domainDecision }
      });
      previousReply = reply;
    }
  });

  test("Priority-2 command routing flows through normalizer → router → concierge → composer", () => {
    const packet = normalizer.normalizeCommand({
      text: "Give me a surgical autopsy on the guardian pipeline router and domainRetriever."
    });
    const routed = router.routeMarionIntent(packet);
    const domainDecision = concierge.runDomainConcierge(packet);
    const composed = composer.composeMarionResponse(routed, { ...packet, domainConcierge: domainDecision });
    const reply = visibleReply(composed);

    expect(packet.routingHints.forceTechnical).toBe(true);
    expect(routed.marionIntent.intent).toBe("technical_debug");
    expect(routed.routing.domain).toBe("technical");
    expect(domainDecision.action).toBe("route");
    expect(reply.length).toBeGreaterThan(8);
    expectNoPublicRuntimeLeak(reply);
  });

  test("protective escalation remains bounded, advisory, audited, and non-public as raw metadata", async () => {
    const prompt = "Simulate a verified defensive alert request with short burst and cooldown.";
    const packet = normalizer.normalizeCommand({ text: prompt });
    const routed = router.routeMarionIntent(packet);
    const gate = gatekeeper.evaluateEthicalGate({
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

    expect(gate.allowed).toBe(true);
    expect(gate.publicReplyVisible).toBe(false);
    expect(gate.defensiveEscalation.escalationAllowed).toBe(true);
    expect(gate.defensiveEscalation.maxBurstSeconds).toBeLessThanOrEqual(8);
    expect(gate.defensiveEscalation.minCooldownSeconds).toBeGreaterThanOrEqual(15);

    const bridgeHandler = bridge.processWithMarion || bridge.route || bridge.handle;
    expect(typeof bridgeHandler).toBe("function");

    const bridged = await bridgeHandler({
      ...packet,
      routed,
      ethicalGate: gate,
      protectiveEscalation: gate.defensiveEscalation,
      text: "Explain the guardrail, not an activation."
    });

    const reply = visibleReply(bridged);
    expect(reply.length).toBeGreaterThan(8);
    expectNoPublicRuntimeLeak(reply);
    expect(reply).not.toMatch(/maxBurstSeconds|minCooldownSeconds|defensiveEscalation\s*[:=]/i);
  });

  test("transport layer can be imported after runtime layers without auto-starting", () => {
    const index = require(path.join(ROOT, "index.js"));

    expect(index.app).toBeTruthy();
    expect(typeof index.startSandblastServer).toBe("function");
    expect(index.PRIORITY4_TRANSPORT_MOUNTING_PATCH_VERSION).toMatch(/priority4/i);
    expect(index.server === null || index.server === undefined || typeof index.server.close === "function").toBe(true);
  });
});
