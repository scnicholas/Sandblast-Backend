"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  sampleLayer09Envelope
} = require("./finance-layer10-test-utils");

describe("FinanceTelemetryEmitter", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer10_delivery_runtime/FinanceTelemetryEmitter.js",
    "../../../FinanceTelemetryEmitter.js",
    "../../../finance/FinanceTelemetryEmitter.js",
    "../../../finance/layer10_delivery_runtime/FinanceTelemetryEmitter.js",
    "../../../Data/finance/layer10_delivery_runtime/FinanceTelemetryEmitter.js",
    "../../../Data/Domains/finance/layer10_delivery_runtime/FinanceTelemetryEmitter.js",
    "../../../Domains/finance/layer10_delivery_runtime/FinanceTelemetryEmitter.js"
  ]);

  const FinanceTelemetryEmitter = pickExport(mod, [
    "FinanceTelemetryEmitter",
    "TelemetryEmitter"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceTelemetryEmitter()).not.toThrow();
  });

  test("emits observational delivery telemetry without changing answer data", () => {
    const emitter = new FinanceTelemetryEmitter();
    const input = sampleLayer09Envelope();

    const result = callFirst(emitter, ["emit", "create", "run", "execute", "process"], {
      ...input,
      sourceLayer: "layer09_final_response",
      deliveryPolicy: {
        status: "deliver_with_caveats",
        canDeliver: true,
        requiresReview: false,
        requiresCaveats: true
      },
      runtimeResponse: {
        replyText: input.finalResponseText,
        displayText: input.finalResponseText,
        voiceText: input.finalResponseText
      },
      uiDelivery: {
        blocks: [{ blockId: "main", type: "main_answer" }]
      },
      elapsedMs: 12
    });

    expect(result.telemetry).toBeTruthy();
    expect(result.telemetry.domain).toBe("finance");
    expect(result.telemetry.runtimeLayer).toBe("layer10_delivery_runtime");
    expect(result.telemetry.sourceLayer).toBe("layer09_final_response");
    expect(result.telemetry.deliveryStatus).toBe("deliver_with_caveats");
    expect(result.telemetry.caveatCount).toBe(1);
    expect(result.telemetry.elapsedMs).toBe(12);
  });

  test("captures blocked, tone, verification, section, and UI counts", () => {
    const emitter = new FinanceTelemetryEmitter();
    const input = sampleLayer09Envelope({
      blockedClaims: [{ code: "blocked_valuation", severity: "blocking" }],
      toneGuardFindings: [{ findingCode: "buy_language", severity: "high" }],
      verificationGaps: [{ gapCode: "market_data_missing", severity: "high" }]
    });

    const result = callFirst(emitter, ["emit", "create", "run", "execute", "process"], {
      ...input,
      deliveryPolicy: { status: "hold_for_review", canDeliver: false, requiresReview: true },
      runtimeResponse: { replyText: "review required", displayText: "review required", voiceText: "review required" },
      uiDelivery: { blocks: [{ blockId: "main" }, { blockId: "blocked" }] }
    });

    expect(result.telemetry.blockedClaimCount).toBe(1);
    expect(result.telemetry.toneFindingCount).toBe(1);
    expect(result.telemetry.verificationGapCount).toBe(1);
    expect(result.telemetry.uiBlockCount).toBe(2);
  });

  test("output is JSON-serializable", () => {
    const emitter = new FinanceTelemetryEmitter();
    const result = callFirst(emitter, ["emit", "create", "run", "execute", "process"], sampleLayer09Envelope());

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
