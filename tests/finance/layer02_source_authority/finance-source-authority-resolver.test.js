"use strict";

/**
 * R18D Layer 02 Test — Finance Source Authority Resolver
 *
 * Run:
 *   node tests/finance/layer02_source_authority/finance-source-authority-resolver.test.js
 */

const assert = require("assert");

const {
  FinanceSourceAuthorityResolver
} = require("../../../Data/marion/runtime/finance/layer02_source_authority/FinanceSourceAuthorityResolver");

function createResolver() {
  const resolver = new FinanceSourceAuthorityResolver({
    now: "2026-03-15T00:00:00.000Z"
  });

  const status = resolver.getLoadStatus();

  assert.strictEqual(
    status.sourceAuthorityLoaded,
    true,
    `Expected fin_source_authority_v1.json to load. Errors: ${JSON.stringify(status.errors, null, 2)}`
  );

  assert.strictEqual(
    status.sourcesIndexLoaded,
    true,
    `Expected fin_sources_index_v1.json to load. Errors: ${JSON.stringify(status.errors, null, 2)}`
  );

  return resolver;
}

function testInfersCentralBankSource() {
  const resolver = createResolver();

  const source = resolver.resolveOne({
    sourceName: "Bank of Canada policy interest rate page",
    sourceDate: "2026-03-10",
    jurisdiction: "canada"
  });

  assert.strictEqual(source.sourceType, "central_bank");
  assert.strictEqual(source.sourceTier, "primary_official");
  assert.ok(source.authorityWeight >= 0.9);
  assert.strictEqual(source.citationRequired, true);
  assert.strictEqual(source.freshnessRequired, true);
}

function testInfersRegulatoryFilingSource() {
  const resolver = createResolver();

  const source = resolver.resolveOne({
    sourceName: "SEDAR+ annual report filing",
    sourceDate: "2026-02-01",
    jurisdiction: "canada"
  });

  assert.strictEqual(source.sourceType, "regulatory_filings");
  assert.strictEqual(source.sourceTier, "primary_filings");
  assert.ok(source.authorityWeight >= 0.9);
  assert.strictEqual(source.citationRequired, true);
}

function testUserProvidedOperationalData() {
  const resolver = createResolver();

  const source = resolver.resolveOne({
    sourceName: "User monthly burn and cash runway inputs",
    userProvided: true,
    sourceDate: null,
    relevanceScore: 1,
    specificityScore: 1,
    consistencyScore: 0.8
  });

  assert.strictEqual(source.sourceType, "user_provided_data");
  assert.strictEqual(source.sourceTier, "user_provided_operational_data");
  assert.strictEqual(source.userProvided, true);
  assert.ok(source.limitations.includes("must_be_labeled_user_supplied"));
}

function testResolveCreatesStrongEnvelope() {
  const resolver = createResolver();

  const envelope = resolver.resolve({
    intentContext: {
      primaryIntent: "macro",
      requiresFreshData: true,
      detectedJurisdictions: ["canada"]
    },
    claim: "Bank of Canada rate context is current.",
    claimType: "interest_rate_or_monetary_policy",
    claimSensitivity: "current_market_or_macro_claim",
    queryText: "What are the current Bank of Canada rate implications?",
    sources: [
      {
        sourceName: "Bank of Canada policy interest rate page",
        sourceDate: "2026-03-10",
        jurisdiction: "canada",
        relevanceScore: 1,
        specificityScore: 1,
        consistencyScore: 1
      }
    ]
  });

  assert.strictEqual(envelope.domain, "finance");
  assert.strictEqual(envelope.layer, "R18D_layer02_source_authority");
  assert.ok(envelope.aggregateEvidenceScore >= 0.8);
  assert.strictEqual(envelope.evidenceBand, "strong");
  assert.strictEqual(envelope.citationRequired, true);
  assert.strictEqual(envelope.freshnessRequired, true);
  assert.strictEqual(envelope.nextLayerHandoff.canProceedToAnalysis, true);
}

function testResolveBlocksUnsupportedEvidence() {
  const resolver = createResolver();

  const envelope = resolver.resolve({
    intentContext: {
      primaryIntent: "compliance",
      requiresFreshData: true
    },
    claim: "This funding program is currently open.",
    claimType: "grant_or_funding_program_status",
    claimSensitivity: "regulatory_or_compliance_claim",
    queryText: "Is this funding program still open?",
    sources: [
      {
        sourceName: "Unknown blog post",
        sourceType: "unknown_source",
        sourceTier: "unsupported_or_unknown",
        sourceDate: null,
        relevanceScore: 0.4,
        specificityScore: 0.3,
        consistencyScore: 0.2
      }
    ]
  });

  assert.ok(envelope.aggregateEvidenceScore < 0.4);
  assert.strictEqual(envelope.evidenceBand, "insufficient");
  assert.strictEqual(envelope.confidenceImpact, "block");
  assert.strictEqual(envelope.nextLayerHandoff.canProceedToAnalysis, false);
}

function run() {
  testInfersCentralBankSource();
  testInfersRegulatoryFilingSource();
  testUserProvidedOperationalData();
  testResolveCreatesStrongEnvelope();
  testResolveBlocksUnsupportedEvidence();

  console.log("PASS: finance-source-authority-resolver.test.js");
}

if (require.main === module) {
  run();
}

module.exports = {
  run
};
