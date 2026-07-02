"use strict";

/**
 * R18D Layer 02 Test — Finance Evidence Ranker
 *
 * Run:
 *   node tests/finance/layer02_source_authority/finance-evidence-ranker.test.js
 */

const assert = require("assert");

const {
  FinanceEvidenceRanker
} = require("../../../Data/marion/runtime/finance/layer02_source_authority/FinanceEvidenceRanker");

function createRanker() {
  const ranker = new FinanceEvidenceRanker({
    now: "2026-03-15T00:00:00.000Z"
  });

  const status = ranker.getLoadStatus();

  assert.strictEqual(
    status.freshness.freshnessRulesLoaded,
    true,
    `Expected freshness rules to load. Status: ${JSON.stringify(status, null, 2)}`
  );

  assert.strictEqual(
    status.weighting.evidenceWeightingLoaded,
    true,
    `Expected evidence weighting rules to load. Status: ${JSON.stringify(status, null, 2)}`
  );

  assert.strictEqual(
    status.conflicts.conflictingSourcesLoaded,
    true,
    `Expected conflict rules to load. Status: ${JSON.stringify(status, null, 2)}`
  );

  return ranker;
}

function testRanksStrongOfficialMacroEvidence() {
  const ranker = createRanker();

  const result = ranker.rank({
    intentContext: {
      primaryIntent: "macro",
      requiresFreshData: true
    },
    claim: "Bank of Canada rate conditions are current.",
    claimType: "interest_rate_or_monetary_policy",
    claimSensitivity: "current_market_or_macro_claim",
    queryText: "What are the current Bank of Canada rate implications?",
    sources: [
      {
        sourceName: "Bank of Canada policy interest rate page",
        sourceType: "central_bank",
        sourceTier: "primary_official",
        authorityWeight: 0.95,
        citationRequired: true,
        sourceDate: "2026-03-10",
        jurisdiction: "canada",
        relevanceScore: 1,
        specificityScore: 1,
        consistencyScore: 1
      }
    ]
  });

  assert.strictEqual(result.rankedSources.length, 1);
  assert.ok(result.aggregateEvidenceScore >= 0.8);
  assert.strictEqual(result.evidenceBand, "strong");
  assert.strictEqual(result.conflict.conflictDetected, false);
  assert.strictEqual(result.citationRequired, true);
  assert.strictEqual(result.freshnessRequired, true);
}

function testRanksStaleEvidenceWithMissingCurrentSource() {
  const ranker = createRanker();

  const result = ranker.rank({
    intentContext: {
      primaryIntent: "macro",
      requiresFreshData: true
    },
    claim: "Rate policy is current.",
    claimType: "interest_rate_or_monetary_policy",
    claimSensitivity: "current_market_or_macro_claim",
    queryText: "What are the current rate conditions?",
    sources: [
      {
        sourceName: "Old central bank policy page",
        sourceType: "central_bank",
        sourceTier: "primary_official",
        authorityWeight: 0.95,
        citationRequired: true,
        sourceDate: "2025-12-01",
        jurisdiction: "canada",
        relevanceScore: 0.9,
        specificityScore: 0.9,
        consistencyScore: 0.9
      }
    ]
  });

  assert.ok(result.aggregateEvidenceScore < 0.8);
  assert.ok(result.missingEvidence.includes("current_source"));
  assert.strictEqual(result.freshnessRequired, true);
}

function testDetectsConflictDuringRanking() {
  const ranker = createRanker();

  const result = ranker.rank({
    intentContext: {
      primaryIntent: "compliance",
      requiresFreshData: true
    },
    claim: "A funding program is currently open.",
    claimType: "grant_or_funding_program_status",
    claimSensitivity: "regulatory_or_compliance_claim",
    queryText: "Is this funding program still open?",
    sources: [
      {
        sourceName: "Current Ontario program page",
        sourceType: "government_program",
        sourceTier: "primary_official",
        authorityWeight: 0.94,
        citationRequired: true,
        sourceDate: "2026-03-14",
        jurisdiction: "ontario",
        relevanceScore: 1,
        specificityScore: 1,
        consistencyScore: 0.8
      },
      {
        sourceName: "Old business article",
        sourceType: "major_financial_press",
        sourceTier: "major_financial_press",
        authorityWeight: 0.68,
        citationRequired: true,
        sourceDate: "2025-12-01",
        jurisdiction: "ontario",
        relevanceScore: 0.7,
        specificityScore: 0.7,
        consistencyScore: 0.4
      }
    ]
  });

  assert.strictEqual(result.conflict.conflictDetected, true);
  assert.strictEqual(result.conflict.confidenceImpact, "block");
  assert.ok(result.missingEvidence.includes("conflict_resolution"));
}

function testNoSourcesReturnsInsufficient() {
  const ranker = createRanker();

  const result = ranker.rank({
    intentContext: {
      primaryIntent: "source_lookup"
    },
    claim: "Find finance sources.",
    claimType: "unknown",
    sources: []
  });

  assert.strictEqual(result.aggregateEvidenceScore, 0);
  assert.strictEqual(result.evidenceBand, "insufficient");
  assert.ok(result.missingEvidence.includes("sources"));
}

function run() {
  testRanksStrongOfficialMacroEvidence();
  testRanksStaleEvidenceWithMissingCurrentSource();
  testDetectsConflictDuringRanking();
  testNoSourcesReturnsInsufficient();

  console.log("PASS: finance-evidence-ranker.test.js");
}

if (require.main === module) {
  run();
}

module.exports = {
  run
};
