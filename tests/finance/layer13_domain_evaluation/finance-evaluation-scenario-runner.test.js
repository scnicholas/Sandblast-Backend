"use strict";

const {
  loadModule,
  pickExport,
  flattenStrings,
  sampleAdapterEnvelope,
  createFakeLayer12Adapter
} = require("./finance-layer13-test-utils");

describe("FinanceEvaluationScenarioRunner", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer13_domain_evaluation/FinanceEvaluationScenarioRunner.js",
    "../../../FinanceEvaluationScenarioRunner.js",
    "../../../finance/FinanceEvaluationScenarioRunner.js",
    "../../../finance/layer13_domain_evaluation/FinanceEvaluationScenarioRunner.js",
    "../../../Data/finance/layer13_domain_evaluation/FinanceEvaluationScenarioRunner.js",
    "../../../Data/Domains/finance/layer13_domain_evaluation/FinanceEvaluationScenarioRunner.js",
    "../../../Domains/finance/layer13_domain_evaluation/FinanceEvaluationScenarioRunner.js"
  ]);

  const FinanceEvaluationScenarioRunner = pickExport(mod, [
    "FinanceEvaluationScenarioRunner",
    "EvaluationScenarioRunner"
  ]);

  test("constructs without throwing with fake adapter", () => {
    expect(() => new FinanceEvaluationScenarioRunner({ adapter: createFakeLayer12Adapter() })).not.toThrow();
  });

  test("runs one scenario against the Layer 12 adapter", () => {
    const adapter = createFakeLayer12Adapter();
    const runner = new FinanceEvaluationScenarioRunner({ adapter });

    const result = runner.runScenario({
      scenario: {
        scenarioId: "runner_ratio_scenario",
        category: "finance_ratio_request",
        input: {
          originalQuery: "Revenue is 1000 and COGS is 600. Calculate gross margin."
        }
      }
    });

    expect(adapter.calls.length).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.adapterEnvelope.domain).toBe("finance");
    expect(result.routeStatus).toBe("finance_ready_with_caveats");
    expect(result.bridgeReadinessStatus).toBe("adapter_ready_with_caveats");
  });

  test("normalizes scenario input with request and trace IDs", () => {
    const runner = new FinanceEvaluationScenarioRunner({ adapter: createFakeLayer12Adapter() });

    const result = runner.runScenario({
      requestId: "outer-request",
      traceId: "outer-trace",
      scenario: {
        scenarioId: "runner_context_scenario",
        category: "finance_ratio_request",
        input: {
          originalQuery: "Calculate gross margin."
        }
      }
    });

    expect(result.adapterEnvelope.requestId).toBe("outer-request");
    expect(result.adapterEnvelope.traceId).toBe("outer-trace");
  });

  test("returns structured failure when adapter is missing", () => {
    const runner = new FinanceEvaluationScenarioRunner({ adapterFactory: () => null });

    const result = runner.runScenario({
      scenario: {
        scenarioId: "missing_adapter_scenario",
        category: "finance_ratio_request",
        input: { originalQuery: "Calculate gross margin." }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.routeStatus).toBe("scenario_execution_failed");
    expect(result.thrownError.code).toBe("missing_layer12_finance_adapter");
  });

  test("supports runtime failure simulation scenario", () => {
    const runner = new FinanceEvaluationScenarioRunner({ adapter: createFakeLayer12Adapter() });

    const result = runner.runScenario({
      scenario: {
        scenarioId: "runtime_failure_safe_fallback",
        category: "runtime_failure_simulation",
        input: { originalQuery: "Calculate gross margin from revenue and costs." },
        harness: { simulateRuntimeFailure: true }
      }
    });

    expect(result.ok).toBe(true);
    expect(result.adapterEnvelope.routeStatus).toBe("finance_failed");
    expect(result.adapterEnvelope.nextLayerHandoff.requiresHumanReview).toBe(true);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("could not complete");
  });

  test("output is JSON-serializable", () => {
    const runner = new FinanceEvaluationScenarioRunner({
      adapter: { adapt: () => sampleAdapterEnvelope() }
    });

    const result = runner.runScenario({
      scenario: {
        scenarioId: "json_runner_scenario",
        category: "finance_ratio_request",
        input: { originalQuery: "Calculate gross margin." }
      }
    });

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
