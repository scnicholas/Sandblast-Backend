"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  sampleLayer09Envelope
} = require("./finance-layer10-test-utils");

describe("FinanceRuntimeResponseAdapter", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer10_delivery_runtime/FinanceRuntimeResponseAdapter.js",
    "../../../FinanceRuntimeResponseAdapter.js",
    "../../../finance/FinanceRuntimeResponseAdapter.js",
    "../../../finance/layer10_delivery_runtime/FinanceRuntimeResponseAdapter.js",
    "../../../Data/finance/layer10_delivery_runtime/FinanceRuntimeResponseAdapter.js",
    "../../../Data/Domains/finance/layer10_delivery_runtime/FinanceRuntimeResponseAdapter.js",
    "../../../Domains/finance/layer10_delivery_runtime/FinanceRuntimeResponseAdapter.js"
  ]);

  const FinanceRuntimeResponseAdapter = pickExport(mod, [
    "FinanceRuntimeResponseAdapter",
    "RuntimeResponseAdapter"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceRuntimeResponseAdapter()).not.toThrow();
  });

  test("adapts final finance response to Marion/Nyx runtime shape", () => {
    const adapter = new FinanceRuntimeResponseAdapter();
    const input = sampleLayer09Envelope();

    const result = callFirst(adapter, ["adapt", "toRuntimeResponse", "run", "execute", "process"], {
      ...input,
      deliveryPolicy: {
        status: "deliver_with_caveats",
        canDeliver: true,
        requiresReview: false,
        requiresCaveats: true,
        confidence: 0.72
      }
    });

    expect(result.runtimeResponse.domain).toBe("finance");
    expect(result.runtimeResponse.runtimeLayer).toBe("layer10_delivery_runtime");
    expect(result.runtimeResponse.intent).toBe("finance_final_response");
    expect(result.runtimeResponse.replyText).toContain("gross margin");
    expect(result.runtimeResponse.displayText).toContain("gross margin");
    expect(result.runtimeResponse.voiceText.length).toBeGreaterThan(0);
    expect(result.runtimeResponse.caveatState).toBe("caveats_present");
  });

  test("uses blocked delivery text when policy blocks delivery", () => {
    const adapter = new FinanceRuntimeResponseAdapter();
    const input = sampleLayer09Envelope();

    const result = callFirst(adapter, ["adapt", "toRuntimeResponse", "run", "execute", "process"], {
      ...input,
      deliveryPolicy: {
        status: "blocked",
        canDeliver: false,
        requiresReview: true,
        requiresCaveats: false
      }
    });

    expect(result.runtimeResponse.replyText).toContain("can’t deliver");
    expect(result.runtimeResponse.canDeliver).toBe(false);
  });

  test("voice text strips markdown-oriented characters", () => {
    const adapter = new FinanceRuntimeResponseAdapter();
    const input = sampleLayer09Envelope({
      finalResponseText: "**Based on FY2024 data**, P/E is 30."
    });

    const result = callFirst(adapter, ["adapt", "toRuntimeResponse", "run", "execute", "process"], {
      ...input,
      deliveryPolicy: {
        status: "deliver",
        canDeliver: true
      }
    });

    expect(result.runtimeResponse.voiceText).not.toContain("*");
    expect(result.runtimeResponse.voiceText).toContain("fiscal year 2024");
    expect(result.runtimeResponse.voiceText.toLowerCase()).toContain("price to earnings");
  });

  test("output is JSON-serializable", () => {
    const adapter = new FinanceRuntimeResponseAdapter();
    const result = callFirst(adapter, ["adapt", "toRuntimeResponse", "run", "execute", "process"], {
      ...sampleLayer09Envelope(),
      deliveryPolicy: { status: "deliver", canDeliver: true }
    });

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
