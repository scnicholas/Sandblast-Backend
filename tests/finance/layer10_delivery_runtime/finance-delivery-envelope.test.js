"use strict";

const {
  loadModule,
  pickExport,
  expectDeepKey,
  sampleLayer09Envelope
} = require("./finance-layer10-test-utils");

describe("FinanceDeliveryEnvelope", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer10_delivery_runtime/FinanceDeliveryEnvelope.js",
    "../../../FinanceDeliveryEnvelope.js",
    "../../../finance/FinanceDeliveryEnvelope.js",
    "../../../finance/layer10_delivery_runtime/FinanceDeliveryEnvelope.js",
    "../../../Data/finance/layer10_delivery_runtime/FinanceDeliveryEnvelope.js",
    "../../../Data/Domains/finance/layer10_delivery_runtime/FinanceDeliveryEnvelope.js",
    "../../../Domains/finance/layer10_delivery_runtime/FinanceDeliveryEnvelope.js"
  ]);

  const FinanceDeliveryEnvelope = pickExport(mod, [
    "FinanceDeliveryEnvelope",
    "DeliveryEnvelope"
  ]);

  function callEnvelopeFactory(EnvelopeClass, payload) {
    if (typeof EnvelopeClass.create === "function") return EnvelopeClass.create(payload);
    if (typeof EnvelopeClass.build === "function") return EnvelopeClass.build(payload);

    return new EnvelopeClass(payload);
  }

  test("constructs or creates without throwing", () => {
    expect(() => {
      callEnvelopeFactory(FinanceDeliveryEnvelope, {
        originalQuery: "Deliver finance answer.",
        runtimeResponse: { replyText: "Based on the provided figures..." },
        uiDelivery: { mainAnswer: "Based on the provided figures...", blocks: [] },
        deliveryPolicy: { status: "deliver", canDeliver: true },
        telemetry: { telemetryId: "telemetry_1" }
      });
    }).not.toThrow();
  });

  test("creates stable Layer 10 delivery metadata and handoff fields", () => {
    const input = sampleLayer09Envelope();

    const envelope = callEnvelopeFactory(FinanceDeliveryEnvelope, {
      ...input,
      runtimeResponse: {
        replyText: input.finalResponseText,
        displayText: input.finalResponseText,
        voiceText: input.finalResponseText,
        canDeliver: true
      },
      uiDelivery: {
        mainAnswer: input.finalResponseText,
        blocks: [{ blockId: "main", type: "main_answer" }]
      },
      deliveryPolicy: {
        status: "deliver_with_caveats",
        canDeliver: true,
        requiresReview: false,
        requiresCaveats: true,
        blockingReasons: [],
        warnings: ["caveat:assumption"]
      },
      telemetry: {
        telemetryId: "telemetry_1"
      }
    });

    expect(envelope.domain).toBe("finance");
    expect(envelope.runtimeLayer).toBe("layer10_delivery_runtime");

    expectDeepKey(envelope, ["runtimeResponse", "uiDelivery", "deliveryPolicy", "telemetry"]);
    expectDeepKey(envelope, ["deliveryReadiness", "nextLayerHandoff", "diagnostics"]);
    expect(envelope.nextLayerHandoff.canReturnToRuntime).toBe(true);
  });

  test("marks blocked delivery when policy is blocked", () => {
    const envelope = callEnvelopeFactory(FinanceDeliveryEnvelope, {
      originalQuery: "Deliver finance answer.",
      runtimeResponse: { replyText: "" },
      uiDelivery: { mainAnswer: "", blocks: [] },
      deliveryPolicy: {
        status: "blocked",
        canDeliver: false,
        requiresReview: true,
        blockingReasons: ["empty_final_response_text"],
        warnings: []
      },
      telemetry: { telemetryId: "telemetry_blocked" }
    });

    expect(envelope.deliveryReadiness.status).toBe("delivery_blocked");
    expect(envelope.nextLayerHandoff.blocked).toBe(true);
    expect(envelope.diagnostics.valid).toBe(false);
  });

  test("validates required delivery envelope shape", () => {
    const envelope = callEnvelopeFactory(FinanceDeliveryEnvelope, {
      originalQuery: "Deliver finance answer.",
      runtimeResponse: { replyText: "Based on the provided figures." },
      uiDelivery: { mainAnswer: "Based on the provided figures.", blocks: [] },
      deliveryPolicy: { status: "deliver", canDeliver: true },
      telemetry: { telemetryId: "telemetry_1" }
    });

    if (typeof FinanceDeliveryEnvelope.validate === "function") {
      const validation = FinanceDeliveryEnvelope.validate(envelope);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    } else {
      expect(envelope.nextLayerHandoff).toBeTruthy();
    }
  });

  test("output is JSON-serializable", () => {
    const envelope = callEnvelopeFactory(FinanceDeliveryEnvelope, {
      originalQuery: "Deliver finance answer.",
      runtimeResponse: { replyText: "Based on the provided figures." },
      uiDelivery: { mainAnswer: "Based on the provided figures.", blocks: [] },
      deliveryPolicy: { status: "deliver", canDeliver: true },
      telemetry: { telemetryId: "telemetry_1" }
    });

    expect(() => JSON.stringify(envelope)).not.toThrow();
  });
});
