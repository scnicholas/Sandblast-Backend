"use strict";

/**
 * R18D Layer 02 Test — Finance Conflicting Source Resolver
 *
 * Run:
 *   node tests/finance/layer02_source_authority/finance-conflicting-sources.test.js
 */

const assert = require("assert");

const {
  FinanceConflictingSourceResolver
} = require("../../../Data/marion/runtime/finance/layer02_source_authority/FinanceConflictingSourceResolver");

function createResolver() {
  const resolver = new FinanceConflictingSourceResolver();
  const status = resolver.getLoadStatus();

  assert.strictEqual(
    status.conflictingSourcesLoaded,
    true,
    `Expected fin_conflicting_sources_v1.json to load. Errors: ${JSON.stringify(status.errors, null, 2)}`
  );

  return resolver;
}

function testNoConflictWithSingleSource() {
  const resolver = createResolver();

  const result = resolver.detect([
    {
      sourceName: "Bank of Canada",
      sourceTier: "primary_official",
      freshnessStatus: "current",
      jurisdiction: "canada"
    }
  ]);

  assert.strictEqual(result.conflictDetected, false);
  assert.strictEqual(result.resolutionAction, "single_or_no_source");
}

function testAuthorityConflictDetected() {
  const resolver = createResolver();

  const result = resolver.detect([
    {
      sourceName: "Official regulator page",
      sourceTier: "primary_official",
      freshnessStatus: "current",
      jurisdiction: "canada"
    },
    {
      sourceName: "Market commentary blog",
      sourceTier: "secondary_context",
      freshnessStatus: "current",
      jurisdiction: "canada"
    }
  ]);

  assert.strictEqual(result.conflictDetected, true);
  assert.ok(result.conflictTypes.includes("authority_conflict"));
  assert.ok(["moderate", "material"].includes(result.conflictSeverity));
  assert.strictEqual(result.preferredSource.sourceTier, "primary_official");
}

function testFreshnessConflictDetected() {
  const resolver = createResolver();

  const result = resolver.detect([
    {
      sourceName: "Current official grant page",
      sourceTier: "primary_official",
      freshnessStatus: "current",
      jurisdiction: "ontario",
      sourceDate: "2026-03-15"
    },
    {
      sourceName: "Old archived grant page",
      sourceTier: "primary_official",
      freshnessStatus: "stale_for_current_claim",
      jurisdiction: "ontario",
      sourceDate: "2025-12-01"
    }
  ]);

  assert.strictEqual(result.conflictDetected, true);
  assert.ok(result.conflictTypes.includes("freshness_conflict"));
  assert.strictEqual(result.conflictSeverity, "material");
  assert.strictEqual(
    result.resolutionAction,
    "prefer_current_authoritative_source_and_label_stale_source"
  );
}

function testJurisdictionConflictDetected() {
  const resolver = createResolver();

  const result = resolver.detect(
    [
      {
        sourceName: "Ontario source",
        sourceTier: "primary_official",
        freshnessStatus: "current",
        jurisdiction: "ontario"
      },
      {
        sourceName: "U.S. source",
        sourceTier: "primary_official",
        freshnessStatus: "current",
        jurisdiction: "united_states"
      }
    ],
    {
      jurisdiction: "ontario"
    }
  );

  assert.strictEqual(result.conflictDetected, true);
  assert.ok(result.conflictTypes.includes("jurisdiction_conflict"));
  assert.strictEqual(result.conflictSeverity, "material");
  assert.strictEqual(result.preferredSource.jurisdiction, "ontario");
}

function testComplianceConflictBlocksFinalClaim() {
  const resolver = createResolver();

  const result = resolver.detect(
    [
      {
        sourceName: "Official regulator page",
        sourceTier: "primary_official",
        freshnessStatus: "current",
        jurisdiction: "ontario"
      },
      {
        sourceName: "Old business article",
        sourceTier: "major_financial_press",
        freshnessStatus: "stale_for_current_claim",
        jurisdiction: "ontario"
      }
    ],
    {
      intentId: "compliance",
      claimSensitivity: "regulatory_or_compliance_claim"
    }
  );

  assert.strictEqual(result.conflictDetected, true);
  assert.strictEqual(result.conflictSeverity, "blocking");
  assert.strictEqual(result.confidenceImpact, "block");
  assert.strictEqual(
    result.resolutionAction,
    "block_final_claim_until_current_official_source_or_confirmation"
  );
}

function run() {
  testNoConflictWithSingleSource();
  testAuthorityConflictDetected();
  testFreshnessConflictDetected();
  testJurisdictionConflictDetected();
  testComplianceConflictBlocksFinalClaim();

  console.log("PASS: finance-conflicting-sources.test.js");
}

if (require.main === module) {
  run();
}

module.exports = {
  run
};
