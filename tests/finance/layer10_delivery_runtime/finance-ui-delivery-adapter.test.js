"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  sampleLayer09Envelope
} = require("./finance-layer10-test-utils");

describe("FinanceUIDeliveryAdapter", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer10_delivery_runtime/FinanceUIDeliveryAdapter.js",
    "../../../FinanceUIDeliveryAdapter.js",
    "../../../finance/FinanceUIDeliveryAdapter.js",
    "../../../finance/layer10_delivery_runtime/FinanceUIDeliveryAdapter.js",
    "../../../Data/finance/layer10_delivery_runtime/FinanceUIDeliveryAdapter.js",
    "../../../Data/Domains/finance/layer10_delivery_runtime/FinanceUIDeliveryAdapter.js",
    "../../../Domains/finance/layer10_delivery_runtime/FinanceUIDeliveryAdapter.js"
  ]);

  const FinanceUIDeliveryAdapter = pickExport(mod, [
    "FinanceUIDeliveryAdapter",
    "UIDeliveryAdapter"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceUIDeliveryAdapter()).not.toThrow();
  });

  test("creates UI delivery blocks from final response, sections, caveats, evidence, and assumptions", () => {
    const adapter = new FinanceUIDeliveryAdapter();
    const input = sampleLayer09Envelope();

    const result = callFirst(adapter, ["adapt", "toUI", "run", "execute", "process"], {
      ...input,
      deliveryPolicy: {
        status: "deliver_with_caveats",
        canDeliver: true
      },
      runtimeResponse: {
        displayText: input.finalResponseText
      }
    });

    expect(result.uiDelivery.domain).toBe("finance");
    expect(result.uiDelivery.runtimeLayer).toBe("layer10_delivery_runtime");
    expect(result.uiDelivery.canDisplay).toBe(true);
    expect(result.uiDelivery.blocks.length).toBeGreaterThan(0);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("main_answer");
    expect(strings).toContain("caveats");
    expect(strings).toContain("evidence_notes");
    expect(strings).toContain("assumptions");
  });

  test("includes blocked item UI block when blocked claims exist", () => {
    const adapter = new FinanceUIDeliveryAdapter();
    const input = sampleLayer09Envelope({
      blockedClaims: [
        {
          blockedClaimId: "blocked_claim_1",
          code: "missing_market_data",
          severity: "blocking",
          reason: "Market data is missing."
        }
      ]
    });

    const result = callFirst(adapter, ["adapt", "toUI", "run", "execute", "process"], {
      ...input,
      deliveryPolicy: {
        status: "hold_for_review",
        canDeliver: false
      },
      runtimeResponse: {
        displayText: input.finalResponseText
      }
    });

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("blocked_items");
    expect(strings).toContain("missing_market_data");
  });

  test("exposes debug trace metadata", () => {
    const adapter = new FinanceUIDeliveryAdapter();
    const input = sampleLayer09Envelope();

    const result = callFirst(adapter, ["adapt", "toUI", "run", "execute", "process"], {
      ...input,
      deliveryPolicy: { status: "deliver", canDeliver: true },
      runtimeResponse: { displayText: input.finalResponseText }
    });

    expect(result.uiDelivery.debugTrace.requestId).toBe("layer10-test-request");
    expect(result.uiDelivery.debugTrace.traceId).toBe("layer09-test-trace");
  });

  test("output is JSON-serializable", () => {
    const adapter = new FinanceUIDeliveryAdapter();
    const input = sampleLayer09Envelope();

    const result = callFirst(adapter, ["adapt", "toUI", "run", "execute", "process"], {
      ...input,
      deliveryPolicy: { status: "deliver", canDeliver: true },
      runtimeResponse: { displayText: input.finalResponseText }
    });

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
