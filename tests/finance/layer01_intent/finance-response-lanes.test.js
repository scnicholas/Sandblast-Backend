"use strict";

/**
 * R18D Layer 01 Test — Finance Response Lanes
 *
 * Run directly:
 *   node tests/finance/layer01_intent/finance-response-lanes.test.js
 */

const assert = require("assert");

const {
  FinanceDomainRouteMap
} = require("../../../Data/marion/runtime/finance/layer01_intent/FinanceDomainRouteMap");

function testResponseLanesLoad() {
  const routeMap = new FinanceDomainRouteMap();
  const status = routeMap.getLoadStatus();

  assert.strictEqual(
    status.responseLanesLoaded,
    true,
    `Expected fin_response_lanes_v1.json to load. Errors: ${JSON.stringify(status.errors, null, 2)}`
  );
}

function testCommercialRiskLane() {
  const routeMap = new FinanceDomainRouteMap();

  const lane = routeMap.getResponseLane("commercial_risk");

  assert.ok(lane, "Expected commercial_risk response lane to exist.");
  assert.strictEqual(lane.label, "Commercial Risk Response");

  assert.ok(
    Array.isArray(lane.requiredSections),
    "Expected commercial_risk lane to include requiredSections."
  );

  assert.ok(
    lane.requiredSections.includes("risk_classification"),
    "Expected commercial_risk lane to require risk_classification."
  );

  assert.ok(
    lane.requiredSections.includes("mitigation_path"),
    "Expected commercial_risk lane to require mitigation_path."
  );
}

function testComplianceLaneRequiresSourceDiscipline() {
  const routeMap = new FinanceDomainRouteMap();

  const lane = routeMap.getResponseLane("compliance");

  assert.ok(lane, "Expected compliance response lane to exist.");

  assert.strictEqual(
    lane.evidenceExpectation,
    "official_current_sources_required",
    "Compliance lane should require official current sources."
  );

  assert.ok(
    lane.requiredSections.includes("jurisdiction_needed_or_identified"),
    "Compliance lane should require jurisdiction handling."
  );

  assert.ok(
    lane.boundaryNote.includes("not legal"),
    "Compliance lane should include non-legal-advice boundary language."
  );
}

function testSourceLookupLane() {
  const routeMap = new FinanceDomainRouteMap();

  const lane = routeMap.getResponseLane("source_lookup");

  assert.ok(lane, "Expected source_lookup response lane to exist.");

  assert.ok(
    lane.requiredSections.includes("best_source_types"),
    "Expected source_lookup to include best_source_types."
  );

  assert.ok(
    lane.requiredSections.includes("source_priority"),
    "Expected source_lookup to include source_priority."
  );
}

function testLayer02HandoffRulesExist() {
  const routeMap = new FinanceDomainRouteMap();
  const lanes = routeMap.responseLanes;

  assert.ok(
    lanes.handoffToLayer02,
    "Expected handoffToLayer02 rules to exist in fin_response_lanes_v1.json."
  );

  assert.ok(
    lanes.handoffToLayer02.whenSourceAuthorityRequired.includes("intent_is_compliance"),
    "Expected compliance to require Layer 2 source authority handoff."
  );

  assert.ok(
    lanes.handoffToLayer02.whenSourceAuthorityRequired.includes("intent_is_macro"),
    "Expected macro to require Layer 2 source authority handoff."
  );
}

function run() {
  testResponseLanesLoad();
  testCommercialRiskLane();
  testComplianceLaneRequiresSourceDiscipline();
  testSourceLookupLane();
  testLayer02HandoffRulesExist();

  console.log("PASS: finance-response-lanes.test.js");
}

if (require.main === module) {
  run();
}

module.exports = {
  run
};
