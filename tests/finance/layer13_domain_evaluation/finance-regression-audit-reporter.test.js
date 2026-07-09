"use strict";

const {
  loadModule,
  pickExport,
  makeScenarioResult
} = require("./finance-layer13-test-utils");

describe("FinanceRegressionAuditReporter", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer13_domain_evaluation/FinanceRegressionAuditReporter.js",
    "../../../FinanceRegressionAuditReporter.js",
    "../../../finance/FinanceRegressionAuditReporter.js",
    "../../../finance/layer13_domain_evaluation/FinanceRegressionAuditReporter.js",
    "../../../Data/finance/layer13_domain_evaluation/FinanceRegressionAuditReporter.js",
    "../../../Data/Domains/finance/layer13_domain_evaluation/FinanceRegressionAuditReporter.js",
    "../../../Domains/finance/layer13_domain_evaluation/FinanceRegressionAuditReporter.js"
  ]);

  const FinanceRegressionAuditReporter = pickExport(mod, [
    "FinanceRegressionAuditReporter",
    "RegressionAuditReporter"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceRegressionAuditReporter()).not.toThrow();
  });

  test("reports passed evaluation when all scenarios are strong", () => {
    const reporter = new FinanceRegressionAuditReporter();
    const report = reporter.report({
      requestId: "audit-request",
      traceId: "audit-trace",
      scenarioResults: [
        makeScenarioResult("ratio", "finance_ratio_request", 0.95, "pass_strong"),
        makeScenarioResult("bypass", "non_finance_creative_bypass", 0.94, "pass_strong")
      ],
      elapsedMs: 5
    });

    expect(report.evaluationStatus).toBe("evaluation_passed");
    expect(report.aggregateScore).toBeGreaterThanOrEqual(0.9);
    expect(report.totalScenarios).toBe(2);
    expect(report.passedScenarioCount).toBe(2);
    expect(report.failedScenarioCount).toBe(0);
    expect(report.elapsedMs).toBe(5);
  });

  test("reports passed-with-warnings for warning scenarios", () => {
    const reporter = new FinanceRegressionAuditReporter();
    const report = reporter.report({
      scenarioResults: [
        makeScenarioResult("ratio", "finance_ratio_request", 0.92, "pass_strong"),
        makeScenarioResult("market", "finance_market_analysis_request", 0.78, "pass_with_warnings")
      ]
    });

    expect(report.evaluationStatus).toBe("evaluation_passed_with_warnings");
    expect(report.warningScenarioCount).toBe(1);
    expect(report.warnings).toContain("evaluation_has_warning_scenarios");
  });

  test("reports failed evaluation with failure buckets", () => {
    const reporter = new FinanceRegressionAuditReporter();
    const report = reporter.report({
      scenarioResults: [
        makeScenarioResult("ratio", "finance_ratio_request", 0.94, "pass_strong"),
        makeScenarioResult("unsafe", "unsafe_investment_advice_prompt", 0.3, "fail", {
          critical: true,
          failures: ["safetyPosture:must_not_contain_unsafe_text", "routingCorrectness:expected_route_status"]
        })
      ]
    });

    expect(report.evaluationStatus).toBe("evaluation_failed");
    expect(report.failedScenarioCount).toBe(1);
    expect(report.criticalFailureCount).toBe(1);
    expect(report.safetyFailures).toContain("unsafe");
    expect(report.routeFailures).toContain("unsafe");
    expect(report.errors).toContain("evaluation_has_failed_scenarios");
  });

  test("reports blocked evaluation when no scenarios are evaluated", () => {
    const reporter = new FinanceRegressionAuditReporter();
    const report = reporter.report({ scenarioResults: [] });

    expect(report.evaluationStatus).toBe("evaluation_blocked");
    expect(report.errors).toContain("no_scenarios_evaluated");
  });

  test("produces category summaries", () => {
    const reporter = new FinanceRegressionAuditReporter();
    const report = reporter.report({
      scenarioResults: [
        makeScenarioResult("ratio1", "finance_ratio_request", 1, "pass_strong"),
        makeScenarioResult("ratio2", "finance_ratio_request", 0.8, "pass_with_warnings"),
        makeScenarioResult("bypass", "non_finance_creative_bypass", 0.9, "pass_strong")
      ]
    });

    const ratioSummary = report.categorySummary.find((item) => item.category === "finance_ratio_request");
    expect(ratioSummary.total).toBe(2);
    expect(ratioSummary.averageScore).toBe(0.9);
  });

  test("output is JSON-serializable", () => {
    const reporter = new FinanceRegressionAuditReporter();
    const report = reporter.report({
      scenarioResults: [makeScenarioResult("ratio", "finance_ratio_request", 0.95, "pass_strong")]
    });

    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
