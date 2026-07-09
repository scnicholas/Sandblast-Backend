"use strict";

const {
  loadModule,
  pickExport,
  expectDeepKey,
  makeScenarioResult
} = require("./finance-layer13-test-utils");

describe("FinanceDomainEvaluationEnvelope", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer13_domain_evaluation/FinanceDomainEvaluationEnvelope.js",
    "../../../FinanceDomainEvaluationEnvelope.js",
    "../../../finance/FinanceDomainEvaluationEnvelope.js",
    "../../../finance/layer13_domain_evaluation/FinanceDomainEvaluationEnvelope.js",
    "../../../Data/finance/layer13_domain_evaluation/FinanceDomainEvaluationEnvelope.js",
    "../../../Data/Domains/finance/layer13_domain_evaluation/FinanceDomainEvaluationEnvelope.js",
    "../../../Domains/finance/layer13_domain_evaluation/FinanceDomainEvaluationEnvelope.js"
  ]);

  const FinanceDomainEvaluationEnvelope = pickExport(mod, [
    "FinanceDomainEvaluationEnvelope",
    "DomainEvaluationEnvelope"
  ]);

  function callEnvelopeFactory(EnvelopeClass, payload) {
    if (typeof EnvelopeClass.create === "function") return EnvelopeClass.create(payload);
    if (typeof EnvelopeClass.build === "function") return EnvelopeClass.build(payload);

    return new EnvelopeClass(payload);
  }

  test("constructs or creates without throwing", () => {
    expect(() => {
      callEnvelopeFactory(FinanceDomainEvaluationEnvelope, {
        originalQuery: "Run finance evaluation.",
        scenarioResults: [],
        regressionAudit: { evaluationStatus: "evaluation_blocked", aggregateScore: 0 }
      });
    }).not.toThrow();
  });

  test("creates stable Layer 13 evaluation metadata and handoff fields", () => {
    const scenarioResults = [
      makeScenarioResult("ratio", "finance_ratio_request", 0.95, "pass_strong"),
      makeScenarioResult("bypass", "non_finance_creative_bypass", 0.9, "pass_strong")
    ];

    const envelope = callEnvelopeFactory(FinanceDomainEvaluationEnvelope, {
      requestId: "eval-envelope-request",
      traceId: "eval-envelope-trace",
      originalQuery: "Run finance evaluation.",
      normalizedQuery: "run finance evaluation",
      scenarioResults,
      aggregateScore: 0.925,
      regressionAudit: {
        evaluationStatus: "evaluation_passed",
        aggregateScore: 0.925,
        totalScenarios: 2,
        passedScenarioCount: 2,
        failedScenarioCount: 0,
        warningScenarioCount: 0,
        criticalFailureCount: 0,
        warnings: [],
        errors: []
      }
    });

    expect(envelope.domain).toBe("finance");
    expect(envelope.runtimeLayer).toBe("layer13_domain_evaluation");
    expect(envelope.evaluationStatus).toBe("evaluation_passed");
    expect(envelope.evaluationReadiness.status).toBe("evaluation_ready");
    expect(envelope.nextLayerHandoff.canPromoteFinanceDomain).toBe(true);

    expectDeepKey(envelope, [
      "evaluationStatus",
      "evaluationReadiness",
      "scenarioResults",
      "aggregateScore",
      "regressionAudit",
      "diagnostics",
      "nextLayerHandoff"
    ]);
  });

  test("marks warnings as promotable with warnings", () => {
    const envelope = callEnvelopeFactory(FinanceDomainEvaluationEnvelope, {
      originalQuery: "Run finance evaluation.",
      scenarioResults: [makeScenarioResult("market", "finance_market_analysis_request", 0.8, "pass_with_warnings")],
      regressionAudit: {
        evaluationStatus: "evaluation_passed_with_warnings",
        aggregateScore: 0.8,
        totalScenarios: 1,
        passedScenarioCount: 1,
        failedScenarioCount: 0,
        warningScenarioCount: 1,
        criticalFailureCount: 0,
        warnings: ["evaluation_has_warning_scenarios"],
        errors: []
      }
    });

    expect(envelope.evaluationReadiness.status).toBe("evaluation_ready_with_warnings");
    expect(envelope.nextLayerHandoff.canPromoteWithWarnings).toBe(true);
    expect(envelope.nextLayerHandoff.requiresRegressionPatch).toBe(false);
  });

  test("marks failed evaluation as requiring regression patch", () => {
    const envelope = callEnvelopeFactory(FinanceDomainEvaluationEnvelope, {
      originalQuery: "Run finance evaluation.",
      scenarioResults: [makeScenarioResult("unsafe", "unsafe_investment_advice_prompt", 0.3, "fail", { critical: true })],
      regressionAudit: {
        evaluationStatus: "evaluation_failed",
        aggregateScore: 0.3,
        totalScenarios: 1,
        passedScenarioCount: 0,
        failedScenarioCount: 1,
        warningScenarioCount: 0,
        criticalFailureCount: 1,
        warnings: [],
        errors: ["evaluation_has_failed_scenarios"]
      }
    });

    expect(envelope.evaluationReadiness.status).toBe("evaluation_failed");
    expect(envelope.nextLayerHandoff.requiresRegressionPatch).toBe(true);
    expect(envelope.nextLayerHandoff.failed).toBe(true);
    expect(envelope.diagnostics.ok).toBe(false);
  });

  test("validates required evaluation envelope shape", () => {
    const envelope = callEnvelopeFactory(FinanceDomainEvaluationEnvelope, {
      originalQuery: "Run finance evaluation.",
      scenarioResults: [],
      regressionAudit: { evaluationStatus: "evaluation_blocked", aggregateScore: 0 }
    });

    if (typeof FinanceDomainEvaluationEnvelope.validate === "function") {
      const validation = FinanceDomainEvaluationEnvelope.validate(envelope);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    } else {
      expect(envelope.nextLayerHandoff).toBeTruthy();
    }
  });

  test("output is JSON-serializable", () => {
    const envelope = callEnvelopeFactory(FinanceDomainEvaluationEnvelope, {
      originalQuery: "Run finance evaluation.",
      scenarioResults: [makeScenarioResult("ratio", "finance_ratio_request", 0.95, "pass_strong")],
      regressionAudit: { evaluationStatus: "evaluation_passed", aggregateScore: 0.95 }
    });

    expect(() => JSON.stringify(envelope)).not.toThrow();
  });
});
