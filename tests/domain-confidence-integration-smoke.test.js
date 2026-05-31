"use strict";

const assert = require("assert");
const registry = require("../Data/marion/runtime/marionDomainRegistry.js");
const concierge = require("../Data/marion/runtime/DomainConcierge.js");
const router = require("../Data/marion/runtime/marionIntentRouter.js");
const domainRouter = require("../Utils/domainRouter.js");

assert.strictEqual(typeof registry.buildDomainConfidenceProfile, "function");
assert.strictEqual(typeof concierge.runDomainConcierge, "function");
assert.strictEqual(typeof router.routeMarionIntent, "function");
assert.strictEqual(typeof domainRouter.domainConfidenceProfile, "function");

const regProfile = registry.buildDomainConfidenceProfile({ text: "What is cognitive distortion?", intent: "domain_question" });
assert.strictEqual(regProfile.primaryDomain, "psychology");
assert.ok(regProfile.confidenceScore >= 0.82);

const route = router.routeMarionIntent({ text: "Define least privilege", userText: "Define least privilege", inputSource: "text" });
assert.ok(route.routing.domainConfidence);
assert.ok(route.routing.domainConfidence.primaryDomain === "cyber" || route.routing.domainConfidence.knowledgeDomain === "cyber");

const routed = concierge.runDomainConcierge({ text: "How do I price this offer?", inputSource: "text" });
assert.ok(routed.domainConfidence);
assert.ok(["finance", "business"].includes(routed.domainConfidence.primaryDomain));

console.log("domain-confidence-integration-smoke.test.js passed");
