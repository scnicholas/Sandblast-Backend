"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  sampleLayer09Envelope
} = require("./finance-layer10-test-utils");

describe("FinanceDeliveryPolicyGate", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer10_delivery_runtime/FinanceDeliveryPolicyGate.js",
    "../../../FinanceDeliveryPolicyGate.js",
    "../../../finance/FinanceDeliveryPolicyGate.js",
    "../../../finance/layer10_delivery_runtime/FinanceDeliveryPolicyGate.js",
    "../../../Data/finance/layer10_delivery_runtime/FinanceDeliveryPolicyGate.js",
    "../../../Data/Domains/finance/layer10_delivery_runtime/FinanceDeliveryPolicyGate.js",
    "../../../Domains/finance/layer10_delivery_runtime/FinanceDeliveryPolicyGate.js"
  ]);

  const FinanceDeliveryPolicyGate = pickExport(mod, [
    "FinanceDeliveryPolicyGate",
    "DeliveryPolicyGate"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceDeliveryPolicyGate()).not.toThrow();
  });

  test("returns deliver_with_caveats when caveats are present but delivery is allowed", () => {
    const gate = new FinanceDeliveryPolicyGate();
    const input = sampleLayer09Envelope();

    const result = callFirst(gate, ["evaluate", "gate", "run", "execute", "process"], input);

    expect(result.deliveryPolicy).toBeTruthy();
    expect(result.deliveryPolicy.status).toBe("deliver_with_caveats");
    expect(result.deliveryPolicy.canDeliver).toBe(true);
    expect(result.deliveryPolicy.requiresCaveats).toBe(true);
  });

  test("blocks empty final response text", () => {
    const gate = new FinanceDeliveryPolicyGate();
    const input = sampleLayer09Envelope({
      finalResponseText: "",
      responseReadiness: {
        status: "empty_response",
        score: 0.1
      }
    });

    const result = callFirst(gate, ["evaluate", "gate", "run", "execute", "process"], input);

    expect(result.deliveryPolicy.status).toBe("blocked");
    expect(result.deliveryPolicy.canDeliver).toBe(false);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("empty_final_response_text");
  });

  test("holds for review when blocked claims exist", () => {
    const gate = new FinanceDeliveryPolicyGate();
    const input = sampleLayer09Envelope({
      blockedClaims: [
        {
          blockedClaimId: "blocked_market_price",
          code: "current_market_price_source",
          severity: "blocking",
          reason: "Current market price source is missing."
        }
      ],
      responseReadiness: {
        status: "response_rendered_with_blocks",
        score: 0.4
      }
    });

    const result = callFirst(gate, ["evaluate", "gate", "run", "execute", "process"], input);

    expect(result.deliveryPolicy.status).toBe("hold_for_review");
    expect(result.deliveryPolicy.requiresReview).toBe(true);
    expect(result.deliveryPolicy.canDeliver).toBe(false);
  });

  test("requests more evidence when Layer 09 handoff requires evidence verification", () => {
    const gate = new FinanceDeliveryPolicyGate();
    const input = sampleLayer09Envelope({
      caveatsApplied: [],
      responseReadiness: {
        status: "response_rendered",
        score: 0.74
      },
      nextLayerHandoff: {
        requiresEvidenceVerification: true,
        requiresReviewBeforeDelivery: false
      }
    });

    const result = callFirst(gate, ["evaluate", "gate", "run", "execute", "process"], input);

    expect(result.deliveryPolicy.status).toBe("request_more_evidence");
    expect(result.deliveryPolicy.requiresMoreEvidence).toBe(true);
  });

  test("output is JSON-serializable", () => {
    const gate = new FinanceDeliveryPolicyGate();
    const result = callFirst(gate, ["evaluate", "gate", "run", "execute", "process"], sampleLayer09Envelope());

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
