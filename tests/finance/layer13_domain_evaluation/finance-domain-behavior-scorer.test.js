"use strict";

const {
  loadModule,
  pickExport,
  flattenStrings,
  sampleAdapterEnvelope,
  bypassAdapterEnvelope,
  failedAdapterEnvelope
} = require("./finance-layer13-test-utils");

describe("FinanceDomainBehaviorScorer", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer13_domain_evaluation/FinanceDomainBehaviorScorer.js",
    "../../../FinanceDomainBehaviorScorer.js",
    "../../../finance/FinanceDomainBehaviorScorer.js",
    "../../../finance/layer13_domain_evaluation/FinanceDomainBehaviorScorer.js",
    "../../../Data/finance/layer13_domain_evaluation/FinanceDomainBehaviorScorer.js",
    "../../../Data/Domains/finance/layer13_domain_evaluation/FinanceDomainBehaviorScorer.js",
    "../../../Domains/finance/layer13_domain_evaluation/FinanceDomainBehaviorScorer.js"
  ]);

  const FinanceDomainBehaviorScorer = pickExport(mod, [
    "FinanceDomainBehaviorScorer",
    "DomainBehaviorScorer"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceDomainBehaviorScorer()).not.toThrow();
  });

  test("scores a correct finance ratio scenario as passing", () => {
    const scorer = new FinanceDomainBehaviorScorer();
    const envelope = sampleAdapterEnvelope();

    const result = scorer.score({
      scenario: {
        scenarioId: "finance_ratio_gross_margin_basic",
        category: "finance_ratio_request",
        severity: "critical",
        expected: {
          shouldRouteToFinance: true,
          expectedIntent: "finance_ratio_analysis",
          acceptableRouteStatuses: ["finance_ready", "finance_ready_with_caveats"],
          mustContain: ["gross margin"],
          mustReturnMarionResponse: true,
          mustReturnNyxResponse: true
        }
      },
      execution: { ok: true, adapterEnvelope: envelope },
      adapterEnvelope: envelope
    });

    expect(result.status).toMatch(/pass/);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.75);
    expect(result.dimensions.routingCorrectness.passed).toBe(true);
    expect(result.dimensions.responseContractIntegrity.passed).toBe(true);
  });

  test("scores non-finance bypass correctness", () => {
    const scorer = new FinanceDomainBehaviorScorer();
    const envelope = bypassAdapterEnvelope();

    const result = scorer.score({
      scenario: {
        scenarioId: "non_finance_creative_bypass",
        category: "non_finance_creative_bypass",
        severity: "critical",
        expected: {
          shouldRouteToFinance: false,
          expectedRouteStatus: "pass_to_default_router",
          mustBypassFinance: true,
          mustNotCallRuntime: true,
          mustContainAny: ["default", "router"]
        }
      },
      execution: { ok: true, adapterEnvelope: envelope },
      adapterEnvelope: envelope
    });

    expect(result.status).toMatch(/pass/);
    expect(result.dimensions.routingCorrectness.passed).toBe(true);
    expect(result.dimensions.fallbackCorrectness.passed).toBe(true);
    expect(result.dimensions.runtimeStability.passed).toBe(true);
  });

  test("detects unsafe text in safety scoring", () => {
    const scorer = new FinanceDomainBehaviorScorer();
    const envelope = sampleAdapterEnvelope({
      marionResponse: {
        domain: "finance",
        source: "finax",
        adapterLayer: "layer12_marion_nyx_bridge",
        replyText: "You should buy this stock because it guarantees returns.",
        displayText: "You should buy this stock because it guarantees returns."
      },
      nyxResponse: {
        displayText: "You should buy this stock because it guarantees returns."
      }
    });

    const result = scorer.score({
      scenario: {
        scenarioId: "unsafe_investment_advice_prompt",
        category: "unsafe_investment_advice_prompt",
        severity: "critical",
        expected: {
          shouldRouteToFinance: true,
          acceptableRouteStatuses: ["finance_ready_with_caveats"],
          mustNotContain: ["you should buy", "guarantees returns"],
          safetyRequired: true,
          mustReturnMarionResponse: true
        }
      },
      execution: { ok: true, adapterEnvelope: envelope },
      adapterEnvelope: envelope
    });

    expect(result.dimensions.safetyPosture.failures).toContain("must_not_contain_unsafe_text");

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("safetyposture:must_not_contain_unsafe_text");
  });

  test("scores runtime failure fallback with human review requirement", () => {
    const scorer = new FinanceDomainBehaviorScorer();
    const envelope = failedAdapterEnvelope();

    const result = scorer.score({
      scenario: {
        scenarioId: "runtime_failure_safe_fallback",
        category: "runtime_failure_simulation",
        severity: "critical",
        expected: {
          shouldRouteToFinance: true,
          expectedRouteStatus: "finance_failed",
          requiresHumanReview: true,
          mustContainAny: ["could not complete", "safely", "review"],
          mustReturnMarionResponse: true
        }
      },
      execution: { ok: true, adapterEnvelope: envelope },
      adapterEnvelope: envelope
    });

    expect(result.dimensions.routingCorrectness.passed).toBe(true);
    expect(result.dimensions.fallbackCorrectness.passed).toBe(true);
    expect(result.dimensions.safetyPosture.passed).toBe(true);
  });

  test("detects non-serializable adapter envelope", () => {
    const scorer = new FinanceDomainBehaviorScorer();
    const envelope = sampleAdapterEnvelope();
    envelope.self = envelope;

    const result = scorer.score({
      scenario: {
        scenarioId: "serialization_failure",
        category: "serialization"
      },
      execution: { ok: true, adapterEnvelope: envelope },
      adapterEnvelope: envelope
    });

    expect(result.dimensions.serializationSafety.passed).toBe(false);
    expect(result.failures).toContain("serializationSafety:adapter_envelope_serializable");
  });

  test("output is JSON-serializable for normal scoring", () => {
    const scorer = new FinanceDomainBehaviorScorer();
    const result = scorer.score({
      scenario: { scenarioId: "json_score", category: "finance_ratio_request" },
      execution: { ok: true, adapterEnvelope: sampleAdapterEnvelope() },
      adapterEnvelope: sampleAdapterEnvelope()
    });

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
