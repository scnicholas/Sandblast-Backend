"use strict";

/**
 * R18D Layer 01 Test — Finance Query Shape Normalizer
 *
 * Run directly:
 *   node tests/finance/layer01_intent/finance-query-shape-normalizer.test.js
 */

const assert = require("assert");

const {
  FinanceQueryShapeNormalizer
} = require("../../../Data/marion/runtime/finance/layer01_intent/FinanceQueryShapeNormalizer");

function testPreservesFinanceSignals() {
  const normalizer = new FinanceQueryShapeNormalizer();

  const result = normalizer.normalize(
    "Can we survive if ad revenue drops 30% for three months in Ontario with CAD 50,000 cash?"
  );

  assert.strictEqual(result.originalQuery.includes("30%"), true);
  assert.strictEqual(result.shape.isQuestion, true);
  assert.strictEqual(result.shape.asksForRisk, true);
  assert.strictEqual(result.shape.containsPercentages, true);
  assert.strictEqual(result.shape.containsNumbers, true);

  assert.ok(
    result.numericSignals.percentages.some((item) => item.includes("30")),
    "Expected percentage signal to include 30%."
  );

  assert.ok(
    result.matchText.includes("ontario"),
    "Expected normalized match text to preserve Ontario."
  );
}

function testDetectsSourceShape() {
  const normalizer = new FinanceQueryShapeNormalizer();

  const result = normalizer.normalize(
    "Where would we get official data and sources for current Bank of Canada rates?"
  );

  assert.strictEqual(result.shape.asksForSources, true);
  assert.strictEqual(result.shape.containsTimeMarkers, true);

  assert.ok(
    result.matchText.includes("official"),
    "Expected source-related marker to be preserved."
  );

  assert.ok(
    result.matchText.includes("bank of canada"),
    "Expected Bank of Canada phrase to be preserved."
  );
}

function testDetectsComplianceShape() {
  const normalizer = new FinanceQueryShapeNormalizer();

  const result = normalizer.normalize(
    "Is this funding program still open and are we eligible in Ontario?"
  );

  assert.strictEqual(result.shape.asksForCompliance, true);
  assert.strictEqual(result.shape.containsTimeMarkers, true);

  assert.ok(
    result.matchText.includes("eligible"),
    "Expected eligibility marker to be preserved."
  );

  assert.ok(
    result.matchText.includes("still open"),
    "Expected freshness phrase to be preserved."
  );
}

function testEmptyQuery() {
  const normalizer = new FinanceQueryShapeNormalizer();

  const result = normalizer.normalize("   ");

  assert.strictEqual(result.shape.isEmpty, true);
  assert.strictEqual(result.trimmedQuery, "");
  assert.deepStrictEqual(result.tokens, []);
}

function run() {
  testPreservesFinanceSignals();
  testDetectsSourceShape();
  testDetectsComplianceShape();
  testEmptyQuery();

  console.log("PASS: finance-query-shape-normalizer.test.js");
}

if (require.main === module) {
  run();
}

module.exports = {
  run
};
