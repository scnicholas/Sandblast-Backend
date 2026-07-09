"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  sampleLayer11OrchestrationEnvelope
} = require("./finance-layer12-test-utils");

describe("FinanceMarionResponseContractAdapter", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer12_marion_nyx_bridge/FinanceMarionResponseContractAdapter.js",
    "../../../FinanceMarionResponseContractAdapter.js",
    "../../../finance/FinanceMarionResponseContractAdapter.js",
    "../../../finance/layer12_marion_nyx_bridge/FinanceMarionResponseContractAdapter.js",
    "../../../Data/finance/layer12_marion_nyx_bridge/FinanceMarionResponseContractAdapter.js",
    "../../../Data/Domains/finance/layer12_marion_nyx_bridge/FinanceMarionResponseContractAdapter.js",
    "../../../Domains/finance/layer12_marion_nyx_bridge/FinanceMarionResponseContractAdapter.js"
  ]);

  const FinanceMarionResponseContractAdapter = pickExport(mod, [
    "FinanceMarionResponseContractAdapter",
    "MarionResponseContractAdapter"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceMarionResponseContractAdapter()).not.toThrow();
  });

  test("adapts Layer 11 orchestration into Marion and Nyx response contracts", () => {
    const adapter = new FinanceMarionResponseContractAdapter();
    const orchestrationEnvelope = sampleLayer11OrchestrationEnvelope();

    const result = callFirst(adapter, ["adapt", "toMarionResponse", "run", "execute", "process"], {
      requestId: "layer12-test-request",
      traceId: "layer12-test-trace",
      domainDecision: {
        intent: "finance_ratio_analysis",
        confidence: 0.72
      },
      runtimeBridge: {
        bridgeStatus: "bridge_ready_with_caveats",
        runtimeResponse: orchestrationEnvelope.runtimeResponse,
        uiDelivery: orchestrationEnvelope.uiDelivery,
        telemetry: orchestrationEnvelope.telemetry
      },
      orchestrationEnvelope,
      fallback: {
        shouldUseFallbackResponse: false,
        routeStatus: "finance_ready_with_caveats"
      }
    });

    expect(result.marionResponse.domain).toBe("finance");
    expect(result.marionResponse.source).toBe("finax");
    expect(result.marionResponse.adapterLayer).toBe("layer12_marion_nyx_bridge");
    expect(result.marionResponse.intent).toBe("finance_ratio_analysis");
    expect(result.marionResponse.replyText).toContain("gross margin");
    expect(result.marionResponse.caveatState).toBe("caveats_present");
    expect(result.marionResponse.canReturnToUser).toBe(true);

    expect(result.nyxResponse.personaSurface).toBe("nyx");
    expect(result.nyxResponse.widgetReady).toBe(true);
  });

  test("uses fallback response when postflight fallback requests it", () => {
    const adapter = new FinanceMarionResponseContractAdapter();

    const result = callFirst(adapter, ["adapt", "toMarionResponse", "run", "execute", "process"], {
      requestId: "layer12-test-request",
      traceId: "layer12-test-trace",
      domainDecision: {
        intent: "finance_ratio_analysis",
        confidence: 0.72
      },
      orchestrationEnvelope: sampleLayer11OrchestrationEnvelope({
        pipelineStatus: "failed"
      }),
      fallback: {
        shouldUseFallbackResponse: true,
        routeStatus: "finance_failed",
        fallbackText: "The finance runtime could not complete the request safely.",
        requiresHumanReview: true
      }
    });

    expect(result.marionResponse.replyText).toContain("could not complete");
    expect(result.marionResponse.requiresHumanReview).toBe(true);
    expect(result.diagnostics.warnings).toContain("fallback_response_used");
  });

  test("creates preflight fallback response for non-finance routing", () => {
    const adapter = new FinanceMarionResponseContractAdapter();

    const result = adapter.fromFallback({
      requestId: "layer12-nonfinance-request",
      traceId: "layer12-nonfinance-trace",
      domainDecision: {
        intent: "unknown_or_non_finance",
        confidence: 0.1
      },
      fallback: {
        routeStatus: "pass_to_default_router",
        fallbackText: "This does not appear to be a finance-domain request."
      }
    });

    expect(result.marionResponse.deliveryStatus).toBe("pass_to_default_router");
    expect(result.marionResponse.canReturnToUser).toBe(true);
    expect(result.nyxResponse.apiReady).toBe(true);
  });

  test("voice text is markdown-cleaned", () => {
    const adapter = new FinanceMarionResponseContractAdapter();

    const result = callFirst(adapter, ["adapt", "toMarionResponse", "run", "execute", "process"], {
      orchestrationEnvelope: sampleLayer11OrchestrationEnvelope({
        runtimeResponse: {
          replyText: "**Based on FY2024 data**, P/E is 30.",
          displayText: "**Based on FY2024 data**, P/E is 30."
        }
      }),
      fallback: {
        shouldUseFallbackResponse: false
      }
    });

    expect(result.marionResponse.voiceText).not.toContain("*");
    expect(result.marionResponse.voiceText).toContain("fiscal year 2024");
    expect(result.marionResponse.voiceText.toLowerCase()).toContain("price to earnings");
  });

  test("output is JSON-serializable", () => {
    const adapter = new FinanceMarionResponseContractAdapter();
    const result = callFirst(adapter, ["adapt", "toMarionResponse", "run", "execute", "process"], {
      orchestrationEnvelope: sampleLayer11OrchestrationEnvelope(),
      fallback: {
        shouldUseFallbackResponse: false
      }
    });

    expect(() => JSON.stringify(result)).not.toThrow();

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("finax");
  });
});
