"use strict";

/**
 * R18D Layer 02 Test — Finance Source Freshness Evaluator
 *
 * Run:
 *   node tests/finance/layer02_source_authority/finance-source-freshness.test.js
 */

const assert = require("assert");

const {
  FinanceSourceFreshnessEvaluator
} = require("../../../Data/marion/runtime/finance/layer02_source_authority/FinanceSourceFreshnessEvaluator");

function createEvaluator() {
  const evaluator = new FinanceSourceFreshnessEvaluator({
    now: "2026-03-15T00:00:00.000Z"
  });

  const status = evaluator.getLoadStatus();

  assert.strictEqual(
    status.freshnessRulesLoaded,
    true,
    `Expected fin_source_freshness_rules_v1.json to load. Errors: ${JSON.stringify(status.errors, null, 2)}`
  );

  return evaluator;
}

function testCurrentCentralBankSource() {
  const evaluator = createEvaluator();

  const result = evaluator.evaluate({
    sourceDate: "2026-03-10",
    claimType: "interest_rate_or_monetary_policy",
    intentId: "macro",
    sourceType: "central_bank",
    queryText: "What are the current Bank of Canada rate implications?",
    currentRequired: true
  });

  assert.strictEqual(result.freshnessRequired, true);
  assert.strictEqual(result.freshnessStatus, "current");
  assert.strictEqual(result.confidenceImpact, "increase");
  assert.ok(result.sourceAgeDays <= 14);
}

function testStaleGovernmentProgramSource() {
  const evaluator = createEvaluator();

  const result = evaluator.evaluate({
    sourceDate: "2026-02-01",
    claimType: "grant_or_funding_program_status",
    intentId: "compliance",
    sourceType: "government_program",
    queryText: "Is this funding program still open in Ontario?",
    currentRequired: true
  });

  assert.strictEqual(result.freshnessRequired, true);
  assert.strictEqual(result.freshnessStatus, "stale_for_current_claim");
  assert.strictEqual(result.confidenceImpact, "decrease");
}

function testUnknownFreshnessForCurrentClaim() {
  const evaluator = createEvaluator();

  const result = evaluator.evaluate({
    sourceDate: null,
    claimType: "regulatory_or_compliance_claim",
    intentId: "compliance",
    sourceType: "securities_regulator",
    queryText: "Is this compliant right now?",
    currentRequired: true
  });

  assert.strictEqual(result.freshnessRequired, true);
  assert.strictEqual(result.freshnessStatus, "unknown_freshness");
  assert.strictEqual(result.confidenceImpact, "decrease");
}

function testFrameworkCanUseOlderSource() {
  const evaluator = createEvaluator();

  const result = evaluator.evaluate({
    sourceDate: "2021-01-01",
    claimType: "business_model_framework",
    intentId: "pricing",
    sourceType: "professional_research",
    queryText: "Give me a framework for subscription pricing.",
    currentRequired: false
  });

  assert.strictEqual(result.freshnessRequired, false);
  assert.strictEqual(result.freshnessStatus, "dated_but_usable");
  assert.strictEqual(result.confidenceImpact, "neutral");
}

function testFreshnessMarkerDetection() {
  const evaluator = createEvaluator();

  assert.strictEqual(
    evaluator.detectFreshnessRequiredFromText("Is this program still open?"),
    true
  );

  assert.strictEqual(
    evaluator.detectFreshnessRequiredFromText("Explain contribution margin."),
    false
  );
}

function run() {
  testCurrentCentralBankSource();
  testStaleGovernmentProgramSource();
  testUnknownFreshnessForCurrentClaim();
  testFrameworkCanUseOlderSource();
  testFreshnessMarkerDetection();

  console.log("PASS: finance-source-freshness.test.js");
}

if (require.main === module) {
  run();
}

module.exports = {
  run
};
