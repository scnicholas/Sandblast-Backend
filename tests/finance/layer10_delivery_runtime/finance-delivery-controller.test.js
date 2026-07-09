"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  expectDeepKey,
  sampleLayer09Envelope
} = require("./finance-layer10-test-utils");

describe("FinanceDeliveryController", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer10_delivery_runtime/FinanceDeliveryController.js",
    "../../../FinanceDeliveryController.js",
    "../../../finance/FinanceDeliveryController.js",
    "../../../finance/layer10_delivery_runtime/FinanceDeliveryController.js",
    "../../../Data/finance/layer10_delivery_runtime/FinanceDeliveryController.js",
    "../../../Data/Domains/finance/layer10_delivery_runtime/FinanceDeliveryController.js",
    "../../../Domains/finance/layer10_delivery_runtime/FinanceDeliveryController.js"
  ]);

  const FinanceDeliveryController = pickExport(mod, [
    "FinanceDeliveryController",
    "DeliveryController"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceDeliveryController()).not.toThrow();
  });

  test("consumes a Layer 09 final response envelope and returns Layer 10 delivery envelope", () => {
    const controller = new FinanceDeliveryController();
    const result = callFirst(controller, ["deliver", "adapt", "run", "execute", "process"], sampleLayer09Envelope());

    expect(result).toBeTruthy();
    expect(result.domain).toBe("finance");
    expect(result.runtimeLayer).toBe("layer10_delivery_runtime");

    expectDeepKey(result, ["runtimeResponse", "uiDelivery", "deliveryPolicy", "telemetry"]);
    expectDeepKey(result, ["deliveryReadiness", "nextLayerHandoff", "diagnostics"]);
  });

  test("delivers caveated finance response to runtime and UI", () => {
    const controller = new FinanceDeliveryController();
    const result = callFirst(controller, ["deliver", "adapt", "run", "execute", "process"], sampleLayer09Envelope());

    expect(result.deliveryPolicy.status).toBe("deliver_with_caveats");
    expect(result.runtimeResponse.canDeliver).toBe(true);
    expect(result.runtimeResponse.caveatState).toBe("caveats_present");
    expect(result.uiDelivery.blocks.length).toBeGreaterThan(0);
    expect(result.telemetry.deliveryStatus).toBe("deliver_with_caveats");

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("gross margin");
    expect(strings).toContain("caveats");
    expect(strings).toContain("layer10_delivery_runtime");
  });

  test("holds response for review when Layer 09 contains blocked claims", () => {
    const controller = new FinanceDeliveryController();
    const input = sampleLayer09Envelope({
      responseReadiness: {
        status: "response_rendered_with_blocks",
        score: 0.42,
        blockingIssues: ["current_market_price_source"]
      },
      nextLayerHandoff: {
        requiresReviewBeforeDelivery: true,
        requiresEvidenceVerification: true
      },
      blockedClaims: [
        {
          blockedClaimId: "blocked_market_price",
          code: "current_market_price_source",
          severity: "blocking",
          reason: "Current market price source is missing."
        }
      ]
    });

    const result = callFirst(controller, ["deliver", "adapt", "run", "execute", "process"], input);

    expect(result.deliveryPolicy.status).toBe("hold_for_review");
    expect(result.deliveryPolicy.canDeliver).toBe(false);
    expect(result.nextLayerHandoff.requiresHumanReview).toBe(true);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("current_market_price_source");
  });

  test("blocks empty final response", () => {
    const controller = new FinanceDeliveryController();
    const input = sampleLayer09Envelope({
      finalResponseText: "",
      responseReadiness: {
        status: "empty_response",
        score: 0.1
      },
      caveatsApplied: []
    });

    const result = callFirst(controller, ["deliver", "adapt", "run", "execute", "process"], input);

    expect(result.deliveryPolicy.status).toBe("blocked");
    expect(result.runtimeResponse.canDeliver).toBe(false);
    expect(result.nextLayerHandoff.blocked).toBe(true);
  });

  test("output is JSON-serializable", () => {
    const controller = new FinanceDeliveryController();
    const result = callFirst(controller, ["deliver", "adapt", "run", "execute", "process"], sampleLayer09Envelope());

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
