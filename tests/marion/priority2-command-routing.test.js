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

function routeIntent(router, packetOrText) {
  const routeFn = router.routeMarionIntent || router.route || router.default;
  expect(typeof routeFn).toBe("function");
  return routeFn(packetOrText);
}

function routeDomain(result) {
  return result?.routing?.domain || result?.domain || result?.marionIntent?.domain || "";
}

function routeName(result) {
  return result?.marionIntent?.intent || result?.intent || result?.routing?.intent || "";
}

describe("Priority 2 — command routing row", () => {
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
  const registry = loadModule([
    "Data/marion/runtime/marionDomainRegistry.js",
    "marionDomainRegistry.js"
  ]);
  const retriever = loadModule([
    "Data/marion/runtime/domainRetriever.js",
    "domainRetriever.js"
  ]);
  const guardianPipeline = loadModule([
    "Data/marion/runtime/guardian.pipeline.router.js",
    "guardian.pipeline.router.js"
  ]);

  test("Priority-2 runtime file names lock to technical routing", () => {
    expect(typeof normalizer.normalizeCommand).toBe("function");

    const packet = normalizer.normalizeCommand({
      text: "Priority number two: audit marion intent router, command normalizer, guardian pipeline, Domain Concierge, registry, and domainRetriever."
    });

    expect(packet.userText).toMatch(/Priority number two/i);
    expect(packet.signals?.priorityTwoRoutingLock).toBe(true);
    expect(packet.routingHints?.forceTechnical).toBe(true);
    expect(packet.meta?.singlePacketAuthority).toBe(true);
    expect(packet.signals?.priorityTwoTargets?.length).toBeGreaterThanOrEqual(5);

    const routed = routeIntent(router, packet);
    expect(routeName(routed)).toBe("technical_debug");
    expect(routeDomain(routed)).toBe("technical");
    expect(routed.routing?.routeLock || routed.routeLocked || routed.marionIntent?.routeLock).toBeTruthy();
  });

  test("canonical technical targets are first-class and not vague chat", () => {
    const targets = [
      ["marionIntentRouter", "marionIntentRouter.js"],
      ["marionCommandNormalizer", "marionCommandNormalizer.js"],
      ["guardian pipeline router", "guardian.pipeline.router.js"],
      ["Domain Concierge", "DomainConcierge.js"],
      ["marionDomainRegistry", "marionDomainRegistry.js"],
      ["domainRetriever", "domainRetriever.js"]
    ];

    for (const [phrase, expectedFile] of targets) {
      const lock = normalizer.canonicalTechnicalTargetFromText(`Give me a surgical autopsy on ${phrase}.`);
      expect(lock?.technicalFollowUpLock).toBe(true);
      expect(lock?.targetFile).toBe(expectedFile);
    }
  });

  test("Domain Concierge routes high-confidence technical commands without clarifier loop", () => {
    expect(typeof concierge.runDomainConcierge).toBe("function");

    const packet = normalizer.normalizeCommand({
      text: "Give me a surgical autopsy on the guardian pipeline router and domainRetriever."
    });
    const decision = concierge.runDomainConcierge(packet);

    expect(decision.action).toBe("route");
    expect(decision.route || decision.domain || decision.selectedDomain).toBe("technical");
    expect(decision.needsClarifier).not.toBe(true);
    expect(JSON.stringify(decision)).not.toMatch(/finalEnvelope|runtimeTelemetry|diagnostic packet/i);
  });

  test("protective escalation routes to technical policy lane with ethics carry", () => {
    const packet = normalizer.normalizeCommand({
      text: "Set Aster and Talon protection escalation boundary for defensive use only."
    });

    expect(packet.signals?.protectiveEscalation?.detected).toBe(true);
    expect(packet.signals?.protectiveEscalation?.requiresEthicalGate).toBe(true);

    const routed = routeIntent(router, packet);
    expect(routeDomain(routed)).toBe("technical");
    expect(routed.marionIntent?.ethicalEscalationRequired || routed.ethicalEscalationRequired).toBe(true);

    const decision = concierge.runDomainConcierge(packet);
    expect(decision.action).toBe("route");
    expect(decision.ethicalEscalationRequired || decision.protectiveEscalation?.requiresEthicalGate).toBeTruthy();
  });

  test("domain registry and retriever keep domain cohesion", () => {
    expect(typeof registry.getDomainConfig).toBe("function");

    const audit = registry.getDomainConfig("audit");
    expect(audit.resolvedDomain || audit.domain).toBe("technical");

    const pipeline = registry.getDomainConfig("guardian pipeline");
    expect(pipeline.resolvedDomain || pipeline.domain).toBe("technical");

    expect(typeof retriever.retrieveDomain || typeof retriever.retrieve).toBe("function");
    expect(retriever._internal?._canonicalDomain("business strategy")).toBe("strategy");
    expect(retriever._internal?._canonicalDomain("guardian pipeline")).toBe("general");
  });

  test("Talon alias normalizes to canonical Thalon and requires Marion approval", async () => {
    expect(typeof guardianPipeline.routeGuardianMessage).toBe("function");

    const packet = await guardianPipeline.routeGuardianMessage({
      guardian: "talon",
      intent: "protective_escalation_review",
      text: "review a protective escalation boundary"
    }, {});

    expect(packet.guardian).toBe("thalon");
    expect(packet.finalAuthority).toBe(false);
    expect(packet.approvalRequired).toBe(true);
    expect(packet.ethicalBoundary?.active || packet.protectiveEscalation?.active).toBeTruthy();
    expect(packet.nextAction).toMatch(/Marion|approval|review/i);
  });
});
