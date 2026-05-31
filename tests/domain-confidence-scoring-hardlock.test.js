"use strict";

const assert = require("assert");
const dc = require("../Data/marion/runtime/domainConfidence.js");

const finance = dc.buildDomainConfidenceProfile({ text: "Explain cash flow vs profit", intent: "domain_question" });
assert.strictEqual(finance.primaryDomain, "finance");
assert.ok(finance.confidenceScore >= 0.82);
assert.strictEqual(finance.confidenceBand, "high");
assert.ok(["direct", "grounded"].includes(finance.answerMode));
assert.strictEqual(finance.noCrossDomainBleed, true);

const cyber = dc.buildDomainConfidenceProfile({ text: "Define least privilege in cybersecurity", intent: "domain_question" });
assert.strictEqual(cyber.primaryDomain, "cyber");
assert.ok(cyber.confidenceScore >= 0.82);

const ambiguous = dc.normalizeDomainConfidenceProfile({ confidence: 0.44, primaryDomain: "general_reasoning" }, { text: "What does this mean?" });
assert.strictEqual(ambiguous.confidenceBand, "weak");
assert.strictEqual(ambiguous.failClosed, false);
assert.strictEqual(ambiguous.needsClarifier, true);
assert.strictEqual(ambiguous.answerMode, "clarify");

const weak = dc.normalizeDomainConfidenceProfile({ confidence: 0.25, primaryDomain: "general_reasoning" }, { text: "" });
assert.strictEqual(weak.answerMode, "fail_closed");
assert.strictEqual(weak.failClosed, true);

console.log("domain-confidence-scoring-hardlock.test.js passed");
