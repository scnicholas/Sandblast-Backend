"use strict";
const assert = require("assert");
const domainRouter = require("../Utils/domainRouter.js");
const domainConfidence = require("../Data/marion/runtime/domainConfidence.js");
const registry = require("../Data/marion/runtime/marionDomainRegistry.js");
const intentRouter = require("../Data/marion/runtime/marionIntentRouter.js");
const concierge = require("../Data/marion/runtime/DomainConcierge.js");
const manifest = require("../Data/marion/runtime/domain_runtime_priority_manifest.normalized.json");

const legalPrompt = "Can I use copyrighted movies on my Roku channel if I have paperwork?";
const technicalPrompt = "Run a surgical autopsy on the domain registry files and resend the zip.";

const routed = domainRouter.routeDomain({ text: legalPrompt }, {}, {});
assert.strictEqual(routed.primaryDomain || routed.primary, "law", "domainRouter should select law for copyright/licensing risk");
assert.strictEqual(routed.knowledgeDomain || (routed.routing && routed.routing.knowledgeDomain), "law", "domainRouter should expose law knowledge domain");
assert.ok(routed.domainConfidence && routed.domainConfidence.legalCategories.includes("copyright_licensing"), "domainRouter should classify copyright/licensing");

const conf = domainConfidence.buildDomainConfidenceProfile({ text: legalPrompt, rawText: legalPrompt });
assert.strictEqual(conf.primaryDomain, "law", "domainConfidence should select law");
assert.strictEqual(conf.answerMode, "grounded", "law should use grounded answer mode");
assert.ok(conf.highStakes, "law should be treated as high-stakes");

const intent = intentRouter.routeMarionIntent({ text: legalPrompt });
assert.strictEqual(intent.routing.domain, "law", "intent router should route law");
assert.strictEqual(intent.marionIntent.knowledgeDomain, "law", "intent router should expose law knowledge domain");
assert.strictEqual(intent.routing.domainConfidence.legalCategory, "copyright_licensing", "intent router should attach legal category");

const con = concierge.runDomainConcierge({ text: legalPrompt });
assert.strictEqual(con.route, "law", "DomainConcierge should route law");
assert.strictEqual(con.knowledgeDomain, "law", "DomainConcierge should expose law knowledge domain");
assert.strictEqual(con.needsClarifier, false, "high-confidence legal prompt should not clarify");

const lawCfg = registry.getKnowledgeDomainConfig("law");
assert.ok(lawCfg.r18cLawAssessmentLayer, "registry should expose R18C law layer metadata");
assert.ok(Array.isArray(lawCfg.assessmentFrame) && lawCfg.assessmentFrame.includes("jurisdiction_sensitivity"), "registry should include law assessment frame");

const tech = concierge.runDomainConcierge({ text: technicalPrompt });
assert.strictEqual(tech.route, "technical", "technical file-patching prompts must stay technical");

assert.strictEqual(manifest.canonicalPath, "Data/marion/runtime/domain_runtime_priority_manifest.normalized.json", "manifest canonical path should be runtime path");
assert.ok(manifest.r18cLawAssessment.active, "manifest should activate R18C law assessment");

console.log("R18C domain routing/registry smoke test passed.");
