"use strict";

/**
 * R18D Layer 02 Test — Finance Source Weighting Engine
 *
 * Run:
 *   node tests/finance/layer02_source_authority/finance-source-weighting.test.js
 */

const assert = require("assert");

const {
  FinanceSourceWeightingEngine
} = require("../../../Data/marion/runtime/finance/layer02_source_authority/FinanceSourceWeightingEngine");

function createEngine() {
  const engine = new FinanceSourceWeightingEngine();
  const status = engine.getLoadStatus();

  assert.strictEqual(
    status.evidenceWeightingLoaded,
    true,
    `Expected fin_evidence_weighting_v1.json to load. Errors: ${JSON.stringify(status.errors, null, 2)}`
  );

  return engine;
}

function testStrongOfficialEvidence() {
  const engine = createEngine();

  const result = engine.evaluateSource({
    source: {
      sourceName: "Bank of Canada policy interest rate page",
      sourceType: "central_bank",
      sourceTier: "primary_official",
      authorityWeight: 0.95,
      citationRequired: true,
      relevanceScore: 1,
      specificityScore: 1,
      consistencyScore: 1
    },
    freshness: {
      freshnessRequired: true,
      freshnessStatus: "current",
      sourceAgeDays: 5
    },
    conflict: {
      conflictDetected: false,
      confidenceImpact: "neutral"
    },
    claimSensitivity: "current_market_or_macro_claim"
  });

  assert.ok(result.evidenceScore >= 0.8);
  assert.strictEqual(result.evidenceBand, "strong");
  assert.strictEqual(result.meetsMinimumEvidence, true);
  assert.strictEqual(result.citationRequired, true);
}

function testStaleEvidenceDowngrade() {
  const engine = createEngine();

  const result = engine.evaluateSource({
    source: {
      sourceName: "Old central bank article",
      sourceType: "central_bank",
      sourceTier: "primary_official",
      authorityWeight: 0.95,
      relevanceScore: 0.9,
      specificityScore: 0.8,
      consistencyScore: 0.8
    },
    freshness: {
      freshnessRequired: true,
      freshnessStatus: "stale_for_current_claim",
      sourceAgeDays: 200
    },
    conflict: {
      conflictDetected: false,
      confidenceImpact: "neutral"
    },
    claimSensitivity: "current_market_or_macro_claim"
  });

  assert.ok(result.evidenceScore < 0.8);
  assert.ok(
    ["moderate", "weak", "insufficient"].includes(result.evidenceBand),
    `Expected stale evidence to be downgraded. Got ${result.evidenceBand}.`
  );
  assert.ok(result.weightingAdjustments.includes("stale_for_current_claim:-0.25"));
}

function testUnsupportedSourceBlockedOrInsufficient() {
  const engine = createEngine();

  const result = engine.evaluateSource({
    source: {
      sourceName: "Unknown finance blog",
      sourceType: "unknown_source",
      sourceTier: "unsupported_or_unknown",
      authorityWeight: 0.2,
      relevanceScore: 0.4,
      specificityScore: 0.3,
      consistencyScore: 0.2
    },
    freshness: {
      freshnessRequired: true,
      freshnessStatus: "unknown_freshness",
      sourceAgeDays: null
    },
    conflict: {
      conflictDetected: false,
      confidenceImpact: "neutral"
    },
    claimSensitivity: "regulatory_or_compliance_claim"
  });

  assert.ok(result.evidenceScore < 0.4);
  assert.strictEqual(result.evidenceBand, "insufficient");
  assert.strictEqual(result.meetsMinimumEvidence, false);
}

function testAggregateEvidenceScore() {
  const engine = createEngine();

  const aggregate = engine.aggregate([
    { evidenceScore: 0.95 },
    { evidenceScore: 0.75 },
    { evidenceScore: 0.6 },
    { evidenceScore: 0.2 }
  ]);

  assert.ok(aggregate.aggregateEvidenceScore >= 0.7);
  assert.ok(["strong", "moderate"].includes(aggregate.evidenceBand));
}

function testEmptyAggregate() {
  const engine = createEngine();

  const aggregate = engine.aggregate([]);

  assert.strictEqual(aggregate.aggregateEvidenceScore, 0);
  assert.strictEqual(aggregate.evidenceBand, "insufficient");
}

function run() {
  testStrongOfficialEvidence();
  testStaleEvidenceDowngrade();
  testUnsupportedSourceBlockedOrInsufficient();
  testAggregateEvidenceScore();
  testEmptyAggregate();

  console.log("PASS: finance-source-weighting.test.js");
}

if (require.main === module) {
  run();
}

module.exports = {
  run
};
