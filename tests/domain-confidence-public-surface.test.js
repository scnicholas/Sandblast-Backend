"use strict";

const assert = require("assert");
const dc = require("../Data/marion/runtime/domainConfidence.js");

const profile = dc.buildDomainConfidenceProfile({ text: "What does this mean legally?", intent: "domain_question" });
assert.strictEqual(profile.primaryDomain, "law");
assert.strictEqual(profile.noUserFacingDiagnostics, true);
assert.strictEqual(profile.noCrossDomainBleed, true);
assert.ok(Object.prototype.hasOwnProperty.call(profile, "fallbackReason"));
assert.ok(Object.prototype.hasOwnProperty.call(profile, "answerMode"));

console.log("domain-confidence-public-surface.test.js passed");
