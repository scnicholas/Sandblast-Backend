"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceFeedbackTrendAnalyzer = require("../../../Data/marion/runtime/finance/layer16_runtime_monitoring/FinanceFeedbackTrendAnalyzer");

function buildAnalyzer() {
  return new FinanceFeedbackTrendAnalyzer({
    trendRules: {
      unsafeAdvice: {
        matchesCorrectionTypes: ["unsafeAdvice"],
        matchesSignals: [
          "unsafe advice",
          "missing caveat",
          "financial advice",
          "guaranteed return",
          "missing disclosure"
        ],
        trendType: "compliance_recurrence",
        minimumCount: 1,
        severity: "critical",
        recommendedRoute: "route_to_layer14_compliance_review"
      },
      mathError: {
        matchesCorrectionTypes: ["mathError"],
        matchesSignals: [
          "calculation error",
          "ratio error",
          "valuation error",
          "projection error",
          "numbers don't match"
        ],
        trendType: "calculation_recurrence",
        minimumCount: 2,
        severity: "high",
        recommendedRoute: "route_to_layer06_execution_recalculation"
      },
      staleData: {
        matchesCorrectionTypes: ["staleData"],
        matchesSignals: [
          "outdated source",
          "stale data",
          "deadline changed",
          "rate changed",
          "program changed",
          "not current"
        ],
        trendType: "source_freshness_pressure",
        minimumCount: 2,
        severity: "high",
        recommendedRoute: "route_to_layer02_source_freshness_review"
      },
      unsupportedClaim: {
        matchesCorrectionTypes: ["explicitCorrection"],
        matchesSignals: [
          "unsupported claim",
          "missing citation",
          "weak evidence",
          "source conflict",
          "no source"
        ],
        trendType: "evidence_support_decay",
        minimumCount: 2,
        severity: "high",
        recommendedRoute: "route_to_layer07_evidence_binding_review"
      },
      qualityDegradation: {
        matchesQualityBands: ["degraded", "failed"],
        trendType: "quality_degradation",
        minimumCount: 2,
        severity: "medium",
        recommendedRoute: "route_to_operator_review"
      }
    },
    priorityOrder: [
      "unsafeAdvice",
      "staleData",
      "mathError",
      "unsupportedClaim",
      "missingContext",
      "qualityDegradation"
    ],
    defaultRoute: "monitor_only"
  });
}

test("FinanceFeedbackTrendAnalyzer detects unsafe advice from a single event", () => {
  const analyzer = buildAnalyzer();

  const result = analyzer.analyze({
    events: [
      {
        id: "evt-1",
        correctionType: "unsafeAdvice",
        userFeedback: "This sounds like financial advice with a missing caveat."
      }
    ]
  });

  assert.equal(result.hasTrend, true);
  assert.equal(result.strongestTrend.rule, "unsafeAdvice");
  assert.equal(result.strongestTrend.trendType, "compliance_recurrence");
  assert.equal(result.strongestTrend.severity, "critical");
  assert.equal(result.recommendedRoute, "route_to_layer14_compliance_review");
});

test("FinanceFeedbackTrendAnalyzer requires two math-error events before trend detection", () => {
  const analyzer = buildAnalyzer();

  const single = analyzer.analyze({
    events: [
      {
        id: "evt-1",
        correctionType: "mathError",
        userFeedback: "The calculation is wrong."
      }
    ]
  });

  const repeated = analyzer.analyze({
    events: [
      {
        id: "evt-1",
        correctionType: "mathError",
        userFeedback: "The calculation is wrong."
      },
      {
        id: "evt-2",
        correctionType: "mathError",
        userFeedback: "This is another calculation error."
      }
    ]
  });

  assert.equal(single.hasTrend, false);
  assert.equal(single.recommendedRoute, "monitor_only");

  assert.equal(repeated.hasTrend, true);
  assert.equal(repeated.strongestTrend.rule, "mathError");
  assert.equal(repeated.strongestTrend.count, 2);
  assert.equal(repeated.recommendedRoute, "route_to_layer06_execution_recalculation");
});

test("FinanceFeedbackTrendAnalyzer detects stale-source pressure", () => {
  const analyzer = buildAnalyzer();

  const result = analyzer.analyze({
    events: [
      {
        id: "evt-1",
        correctionType: "staleData",
        userFeedback: "This is outdated source material."
      },
      {
        id: "evt-2",
        correctionType: "staleData",
        userFeedback: "The deadline changed and the data is not current."
      }
    ]
  });

  assert.equal(result.hasTrend, true);
  assert.equal(result.strongestTrend.rule, "staleData");
  assert.equal(result.strongestTrend.trendType, "source_freshness_pressure");
  assert.equal(result.recommendedRoute, "route_to_layer02_source_freshness_review");
});

test("FinanceFeedbackTrendAnalyzer detects evidence support decay", () => {
  const analyzer = buildAnalyzer();

  const result = analyzer.analyze({
    events: [
      {
        id: "evt-1",
        correctionType: "explicitCorrection",
        userFeedback: "That was an unsupported claim."
      },
      {
        id: "evt-2",
        regressionTargets: [
          {
            layer: "layer07_evidence_binding",
            matched: ["missing citation"]
          }
        ]
      }
    ]
  });

  assert.equal(result.hasTrend, true);
  assert.equal(result.strongestTrend.rule, "unsupportedClaim");
  assert.equal(result.strongestTrend.trendType, "evidence_support_decay");
  assert.equal(result.recommendedRoute, "route_to_layer07_evidence_binding_review");
});

test("FinanceFeedbackTrendAnalyzer detects quality degradation from quality bands", () => {
  const analyzer = buildAnalyzer();

  const result = analyzer.analyze({
    events: [
      {
        id: "evt-1",
        qualityBand: "degraded",
        qualityScore: 0.6
      },
      {
        id: "evt-2",
        qualityBand: "failed",
        qualityScore: 0.2
      }
    ]
  });

  assert.equal(result.hasTrend, true);
  assert.equal(result.strongestTrend.rule, "qualityDegradation");
  assert.equal(result.strongestTrend.trendType, "quality_degradation");
  assert.equal(result.recommendedRoute, "route_to_operator_review");
});
