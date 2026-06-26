"use strict";

const assert = require("assert");
const normalizer = require("../marionCommandNormalizer.js");
const router = require("../marionIntentRouter.js");
const concierge = require("../DomainConcierge.js");
const registry = require("../marionDomainRegistry.js");
const retriever = require("../domainRetriever.js");
const guardianPipeline = require("../guardian.pipeline.router.js");

async function run() {
  const priorityText = "Priority number two: marion intent router command normalizer guardian pipeline domain concierge registry retriever";
  const priorityPacket = normalizer.normalizeCommand({ text: priorityText });
  assert.strictEqual(priorityPacket.signals.priorityTwoRoutingLock, true, "Priority-2 lock should be active");
  assert.strictEqual(priorityPacket.routingHints.forceTechnical, true, "Priority-2 routing should force technical lane");
  assert(priorityPacket.signals.priorityTwoTargets.length >= 6, "All Priority-2 targets should be carried");

  const priorityRoute = router.routeMarionIntent(priorityPacket);
  assert.strictEqual(priorityRoute.marionIntent.intent, "technical_debug", "Priority-2 text should route as technical_debug");
  assert.strictEqual(priorityRoute.routing.domain, "technical", "Priority-2 text should route to technical domain");
  assert.strictEqual(priorityRoute.routing.routeLock, true, "Priority-2 route should be locked");

  const protectionText = "Set Aster and Talon protection escalation boundary for defensive use only";
  const protectionPacket = normalizer.normalizeCommand({ text: protectionText });
  assert.strictEqual(protectionPacket.signals.protectiveEscalation.detected, true, "Protection signal should be detected");
  assert.strictEqual(protectionPacket.signals.protectiveEscalation.requiresEthicalGate, true, "Protection signal should require ethical gate");

  const protectionRoute = router.routeMarionIntent(protectionPacket);
  assert.strictEqual(protectionRoute.routing.domain, "technical", "Protection policy should route to technical implementation lane");
  assert.strictEqual(protectionRoute.marionIntent.ethicalEscalationRequired, true, "Protection route should carry ethical escalation requirement");

  const protectionConcierge = concierge.runDomainConcierge(protectionPacket);
  assert.strictEqual(protectionConcierge.action, "route", "Protection policy should not fall into clarifier loop");
  assert.strictEqual(protectionConcierge.ethicalEscalationRequired, true, "Domain Concierge should carry ethical escalation metadata");

  const lawPacket = normalizer.normalizeCommand({ text: "What is consideration in contract law?" });
  const lawConcierge = concierge.runDomainConcierge(lawPacket);
  assert.strictEqual(lawConcierge.action, "route", "Answerable law topic should route directly");
  assert.strictEqual(lawConcierge.route, "law", "Answerable law topic should route to law");

  assert.strictEqual(registry.getDomainConfig("audit").resolvedDomain, "technical", "Bare audit should stay technical, not business");
  assert.strictEqual(registry.getDomainConfig("guardian pipeline").resolvedDomain, "technical", "Guardian pipeline alias should resolve to technical");
  assert.strictEqual(retriever._internal._canonicalDomain("business strategy"), "strategy", "Business strategy should map to strategy retriever alias");
  assert.strictEqual(retriever._internal._canonicalDomain("guardian pipeline"), "general", "Guardian pipeline retrieval should fail toward general, not cross-domain evidence");

  const guardianPacket = await guardianPipeline.routeGuardianMessage({
    guardian: "talon",
    intent: "protective_escalation_review",
    text: "protective escalation alarm boundary"
  }, {});
  assert.strictEqual(guardianPacket.guardian, "thalon", "Talon alias should normalize to Thalon canonical guardian");
  assert.strictEqual(guardianPacket.approvalRequired, true, "Talon protective output should require Marion approval");
  assert.strictEqual(guardianPacket.ethicalBoundary.active, true, "Guardian packet should carry active ethical boundary metadata");

  console.log("priority2-routing-smoke: PASS");
}

run().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
