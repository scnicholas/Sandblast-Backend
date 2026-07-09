"use strict";

const {
  loadModule,
  pickExport,
  expectDeepKey,
  sampleLayer11OrchestrationEnvelope
} = require("./finance-layer12-test-utils");

describe("FinanceDomainAdapterEnvelope", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer12_marion_nyx_bridge/FinanceDomainAdapterEnvelope.js",
    "../../../FinanceDomainAdapterEnvelope.js",
    "../../../finance/FinanceDomainAdapterEnvelope.js",
    "../../../finance/layer12_marion_nyx_bridge/FinanceDomainAdapterEnvelope.js",
    "../../../Data/finance/layer12_marion_nyx_bridge/FinanceDomainAdapterEnvelope.js",
    "../../../Data/Domains/finance/layer12_marion_nyx_bridge/FinanceDomainAdapterEnvelope.js",
    "../../../Domains/finance/layer12_marion_nyx_bridge/FinanceDomainAdapterEnvelope.js"
  ]);

  const FinanceDomainAdapterEnvelope = pickExport(mod, [
    "FinanceDomainAdapterEnvelope",
    "DomainAdapterEnvelope"
  ]);

  function callEnvelopeFactory(EnvelopeClass, payload) {
    if (typeof EnvelopeClass.create === "function") return EnvelopeClass.create(payload);
    if (typeof EnvelopeClass.build === "function") return EnvelopeClass.build(payload);

    return new EnvelopeClass(payload);
  }

  test("constructs or creates without throwing", () => {
    expect(() => {
      callEnvelopeFactory(FinanceDomainAdapterEnvelope, {
        originalQuery: "Calculate gross margin.",
        domainDecision: {
          shouldRouteToFinance: true,
          confidence: 0.72
        },
        routeStatus: "finance_ready"
      });
    }).not.toThrow();
  });

  test("creates stable Layer 12 adapter metadata and handoff fields", () => {
    const orchestrationEnvelope = sampleLayer11OrchestrationEnvelope();

    const envelope = callEnvelopeFactory(FinanceDomainAdapterEnvelope, {
      requestId: "adapter-envelope-request",
      traceId: "adapter-envelope-trace",
      originalQuery: "Calculate gross margin.",
      normalizedQuery: "calculate gross margin",
      domainDecision: {
        shouldRouteToFinance: true,
        intent: "finance_ratio_analysis",
        confidence: 0.72
      },
      routeStatus: "finance_ready_with_caveats",
      runtimeBridge: {
        bridgeStatus: "bridge_ready_with_caveats",
        runtimeResponse: orchestrationEnvelope.runtimeResponse,
        uiDelivery: orchestrationEnvelope.uiDelivery,
        telemetry: orchestrationEnvelope.telemetry
      },
      orchestrationEnvelope,
      marionResponse: {
        replyText: orchestrationEnvelope.runtimeResponse.replyText,
        displayText: orchestrationEnvelope.runtimeResponse.displayText,
        uiBlocks: orchestrationEnvelope.uiDelivery.blocks
      },
      nyxResponse: {
        displayText: orchestrationEnvelope.runtimeResponse.displayText
      }
    });

    expect(envelope.domain).toBe("finance");
    expect(envelope.runtimeLayer).toBe("layer12_marion_nyx_bridge");
    expect(envelope.routeStatus).toBe("finance_ready_with_caveats");
    expect(envelope.bridgeReadiness.status).toBe("adapter_ready_with_caveats");
    expect(envelope.nextLayerHandoff.canReturnToMarion).toBe(true);
    expect(envelope.nextLayerHandoff.canReturnWithCaveats).toBe(true);

    expectDeepKey(envelope, [
      "domainDecision",
      "runtimeBridge",
      "orchestrationEnvelope",
      "marionResponse",
      "nyxResponse",
      "bridgeReadiness",
      "nextLayerHandoff"
    ]);
  });

  test("marks bypass to default router as valid return path", () => {
    const envelope = callEnvelopeFactory(FinanceDomainAdapterEnvelope, {
      originalQuery: "Write a poem.",
      domainDecision: {
        shouldRouteToFinance: false,
        intent: "unknown_or_non_finance",
        confidence: 0.1
      },
      routeStatus: "pass_to_default_router",
      marionResponse: {
        replyText: "This does not appear to be a finance-domain request.",
        displayText: "This does not appear to be a finance-domain request.",
        uiBlocks: []
      },
      nyxResponse: {
        displayText: "This does not appear to be a finance-domain request."
      }
    });

    expect(envelope.bridgeReadiness.status).toBe("adapter_bypassed_to_default_router");
    expect(envelope.nextLayerHandoff.canReturnToMarion).toBe(true);
    expect(envelope.diagnostics.valid).toBe(true);
  });

  test("marks failed adapter status as not valid", () => {
    const envelope = callEnvelopeFactory(FinanceDomainAdapterEnvelope, {
      originalQuery: "Calculate gross margin.",
      domainDecision: {
        shouldRouteToFinance: true,
        intent: "finance_ratio_analysis",
        confidence: 0.72
      },
      routeStatus: "finance_failed",
      marionResponse: {
        replyText: "The finance runtime could not complete the request safely."
      },
      nyxResponse: {
        displayText: "The finance runtime could not complete the request safely."
      }
    });

    expect(envelope.bridgeReadiness.status).toBe("adapter_failed");
    expect(envelope.nextLayerHandoff.failed).toBe(true);
    expect(envelope.diagnostics.valid).toBe(false);
  });

  test("validates required adapter envelope shape", () => {
    const envelope = callEnvelopeFactory(FinanceDomainAdapterEnvelope, {
      originalQuery: "Calculate gross margin.",
      domainDecision: {
        shouldRouteToFinance: true,
        intent: "finance_ratio_analysis"
      },
      routeStatus: "finance_ready"
    });

    if (typeof FinanceDomainAdapterEnvelope.validate === "function") {
      const validation = FinanceDomainAdapterEnvelope.validate(envelope);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    } else {
      expect(envelope.nextLayerHandoff).toBeTruthy();
    }
  });

  test("output is JSON-serializable", () => {
    const envelope = callEnvelopeFactory(FinanceDomainAdapterEnvelope, {
      originalQuery: "Calculate gross margin.",
      domainDecision: {
        shouldRouteToFinance: true,
        intent: "finance_ratio_analysis"
      },
      routeStatus: "finance_ready"
    });

    expect(() => JSON.stringify(envelope)).not.toThrow();
  });
});
