"use strict";

/**
 * R18D Layer 01 Test — Finance Intent Classifier
 *
 * Run directly:
 *   node tests/finance/layer01_intent/finance-intent-classifier.test.js
 */

const assert = require("assert");

const {
  FinanceIntentClassifier
} = require("../../../Data/marion/runtime/finance/layer01_intent/FinanceIntentClassifier");

function createClassifier() {
  const classifier = new FinanceIntentClassifier();
  const status = classifier.getLoadStatus();

  assert.strictEqual(
    status.taxonomyLoaded,
    true,
    `Expected fin_intent_taxonomy_v1.json to load. Errors: ${JSON.stringify(status.errors, null, 2)}`
  );

  assert.strictEqual(
    status.queryPatternsLoaded,
    true,
    `Expected fin_query_patterns_v1.json to load. Errors: ${JSON.stringify(status.errors, null, 2)}`
  );

  assert.strictEqual(
    status.responseLanesLoaded,
    true,
    `Expected fin_response_lanes_v1.json to load. Errors: ${JSON.stringify(status.errors, null, 2)}`
  );

  return classifier;
}

function assertIntent(result, expectedPrimary, allowedSecondary = []) {
  assert.strictEqual(
    result.domain,
    "finance",
    "Expected finance domain envelope."
  );

  assert.strictEqual(
    result.layer,
    "R18D_layer01_intent_classification",
    "Expected Layer 1 intent classification envelope."
  );

  assert.strictEqual(
    result.primaryIntent,
    expectedPrimary,
    `Expected primary intent ${expectedPrimary}, got ${result.primaryIntent}. Full result: ${JSON.stringify(result, null, 2)}`
  );

  for (const intent of allowedSecondary) {
    assert.ok(
      result.allIntents.includes(intent),
      `Expected ${intent} to appear in allIntents. Got: ${JSON.stringify(result.allIntents)}`
    );
  }
}

function testCashflowCommercialRiskClassification() {
  const classifier = createClassifier();

  const result = classifier.classify(
    "Can this business survive if ad revenue drops 30% for three months in Ontario?"
  );

  assert.ok(
    ["cashflow", "commercial_risk"].includes(result.primaryIntent),
    `Expected primary intent to be cashflow or commercial_risk. Got ${result.primaryIntent}`
  );

  assert.ok(
    result.allIntents.includes("cashflow") || result.allIntents.includes("commercial_risk"),
    "Expected cashflow or commercial_risk to be present."
  );

  assert.ok(
    result.detectedJurisdictions.includes("ontario"),
    "Expected Ontario jurisdiction detection."
  );

  assert.strictEqual(result.advisoryBoundaryRequired, true);
  assert.strictEqual(result.requiresSourceCheck, true);
}

function testMacroClassification() {
  const classifier = createClassifier();

  const result = classifier.classify(
    "What happens if Bank of Canada rates stay high this year?"
  );

  assertIntent(result, "macro", ["credit_debt", "public_policy"]);

  assert.ok(
    result.detectedJurisdictions.includes("canada"),
    "Expected Canada jurisdiction detection from Bank of Canada."
  );

  assert.strictEqual(result.requiresFreshData, true);
  assert.strictEqual(result.requiresSourceCheck, true);
}

function testPricingClassification() {
  const classifier = createClassifier();

  const result = classifier.classify(
    "Should this be subscription pricing or a one-time fee?"
  );

  assertIntent(result, "pricing");

  assert.ok(
    result.allIntents.includes("unit_economics") || result.allIntents.includes("micro"),
    "Expected pricing query to preserve unit_economics or micro as related intent."
  );

  assert.strictEqual(result.advisoryBoundaryRequired, true);
}

function testSourceLookupClassification() {
  const classifier = createClassifier();

  const result = classifier.classify(
    "Where would we get official data and sources for this finance analysis?"
  );

  assertIntent(result, "source_lookup");

  assert.strictEqual(result.requiresSourceCheck, true);

  assert.ok(
    result.recommendedSourcePacks.includes("fin_sources_index_v1.json"),
    "Expected source lookup to recommend fin_sources_index_v1.json."
  );
}

function testComplianceClassification() {
  const classifier = createClassifier();

  const result = classifier.classify(
    "Is this funding program still open and are we eligible in Ontario?"
  );

  assertIntent(result, "compliance");

  assert.ok(
    result.detectedJurisdictions.includes("ontario"),
    "Expected Ontario jurisdiction detection."
  );

  assert.strictEqual(result.requiresFreshData, true);
  assert.strictEqual(result.requiresSourceCheck, true);
  assert.strictEqual(result.advisoryBoundaryRequired, true);
}

function testBoundaryTriggerClassification() {
  const classifier = createClassifier();

  const result = classifier.classify(
    "Should I buy this stock if it is guaranteed to go up?"
  );

  assert.ok(
    result.boundaryTriggers.length > 0,
    "Expected advisory boundary triggers to be detected."
  );

  assert.strictEqual(result.advisoryBoundaryRequired, true);

  assert.ok(
    result.allIntents.includes("compliance") || result.primaryIntent === "compliance",
    "Expected compliance boundary to be included when advisory trigger appears."
  );
}

function testEmptyQueryClassification() {
  const classifier = createClassifier();

  const result = classifier.classify("   ");

  assert.strictEqual(result.primaryIntent, "unknown");
  assert.strictEqual(result.confidenceBand, "insufficient");
  assert.ok(result.missingContext.includes("query_text"));
}

function run() {
  testCashflowCommercialRiskClassification();
  testMacroClassification();
  testPricingClassification();
  testSourceLookupClassification();
  testComplianceClassification();
  testBoundaryTriggerClassification();
  testEmptyQueryClassification();

  console.log("PASS: finance-intent-classifier.test.js");
}

if (require.main === module) {
  run();
}

module.exports = {
  run
};
