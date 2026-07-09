"use strict";

const {
  loadModule,
  pickExport
} = require("./finance-layer13-test-utils");

describe("FinanceEvaluationScenarioCatalog", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer13_domain_evaluation/FinanceEvaluationScenarioCatalog.js",
    "../../../FinanceEvaluationScenarioCatalog.js",
    "../../../finance/FinanceEvaluationScenarioCatalog.js",
    "../../../finance/layer13_domain_evaluation/FinanceEvaluationScenarioCatalog.js",
    "../../../Data/finance/layer13_domain_evaluation/FinanceEvaluationScenarioCatalog.js",
    "../../../Data/Domains/finance/layer13_domain_evaluation/FinanceEvaluationScenarioCatalog.js",
    "../../../Domains/finance/layer13_domain_evaluation/FinanceEvaluationScenarioCatalog.js"
  ]);

  const FinanceEvaluationScenarioCatalog = pickExport(mod, [
    "FinanceEvaluationScenarioCatalog",
    "EvaluationScenarioCatalog"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceEvaluationScenarioCatalog()).not.toThrow();
  });

  test("returns default finance-domain evaluation scenarios", () => {
    const catalog = new FinanceEvaluationScenarioCatalog();
    const scenarios = catalog.getDefaultScenarios();

    expect(scenarios.length).toBeGreaterThanOrEqual(9);
    expect(scenarios.some((scenario) => scenario.scenarioId === "finance_ratio_gross_margin_basic")).toBe(true);
    expect(scenarios.some((scenario) => scenario.scenarioId === "non_finance_creative_bypass")).toBe(true);
    expect(scenarios.some((scenario) => scenario.scenarioId === "runtime_failure_safe_fallback")).toBe(true);
  });

  test("lists categories and scenario IDs", () => {
    const catalog = new FinanceEvaluationScenarioCatalog();

    expect(catalog.listScenarioIds()).toContain("explicit_finance_domain_short_query");
    expect(catalog.listCategories()).toContain("finance_ratio_request");
    expect(catalog.listCategories()).toContain("runtime_failure_simulation");
  });

  test("retrieves scenarios by category and ID", () => {
    const catalog = new FinanceEvaluationScenarioCatalog();

    const byCategory = catalog.getScenariosByCategory(["non_finance_creative_bypass"]);
    expect(byCategory.length).toBe(1);
    expect(byCategory[0].scenarioId).toBe("non_finance_creative_bypass");

    const byId = catalog.getScenariosByIds(["finance_market_analysis_caveated"]);
    expect(byId.length).toBe(1);
    expect(byId[0].category).toBe("finance_market_analysis_request");

    expect(catalog.getScenario("missing_evidence_market_price").scenarioId).toBe("missing_evidence_market_price");
  });

  test("appends custom scenarios", () => {
    const catalog = new FinanceEvaluationScenarioCatalog({
      customScenarios: [
        {
          scenarioId: "custom_finance_eval",
          category: "custom",
          input: { originalQuery: "Review cash runway." },
          expected: { shouldRouteToFinance: true }
        }
      ]
    });

    expect(catalog.listScenarioIds()).toContain("custom_finance_eval");
    expect(catalog.getScenariosByCategory(["custom"]).length).toBe(1);
  });

  test("output is JSON-serializable", () => {
    const catalog = new FinanceEvaluationScenarioCatalog();
    expect(() => JSON.stringify(catalog.getDefaultScenarios())).not.toThrow();
  });
});
