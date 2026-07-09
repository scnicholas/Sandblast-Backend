"use strict";

const {
  loadModule,
  pickExport,
  flattenStrings,
  expectDeepKey,
  sampleFinanceRequest,
  makeSuccessfulLayerOverrides,
  makeFailingLayerOverrides
} = require("./finance-layer11-test-utils");

describe("FinancePipelineHarness", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer11_runtime_orchestration/FinancePipelineHarness.js",
    "../../../FinancePipelineHarness.js",
    "../../../finance/FinancePipelineHarness.js",
    "../../../finance/layer11_runtime_orchestration/FinancePipelineHarness.js",
    "../../../Data/finance/layer11_runtime_orchestration/FinancePipelineHarness.js",
    "../../../Data/Domains/finance/layer11_runtime_orchestration/FinancePipelineHarness.js",
    "../../../Domains/finance/layer11_runtime_orchestration/FinancePipelineHarness.js"
  ]);

  const FinancePipelineHarness = pickExport(mod, [
    "FinancePipelineHarness",
    "PipelineHarness"
  ]);

  test("constructs without throwing with layer overrides", () => {
    expect(() => new FinancePipelineHarness({
      layerOverrides: makeSuccessfulLayerOverrides()
    })).not.toThrow();
  });

  test("runs the full Layers 03–10 pipeline and returns final delivery envelope", () => {
    const harness = new FinancePipelineHarness({
      layerOverrides: makeSuccessfulLayerOverrides()
    });

    const result = harness.run(sampleFinanceRequest());

    expect(result.domain).toBe("finance");
    expect(result.runtimeLayer).toBe("layer11_runtime_orchestration");
    expect(result.pipelineStatus).toBe("completed_with_caveats");

    expect(result.finalDeliveryEnvelope).toBeTruthy();
    expect(result.finalDeliveryEnvelope.runtimeLayer).toBe("layer10_delivery_runtime");

    expect(result.runtimeResponse.replyText).toContain("gross margin");
    expect(result.uiDelivery.blocks.length).toBeGreaterThan(0);
    expect(result.telemetry.deliveryStatus).toBe("deliver_with_caveats");

    expectDeepKey(result, [
      "layerOutputs",
      "layerOutputSummary",
      "pipelineReadiness",
      "stateTrace",
      "diagnostics"
    ]);
  });

  test("records every completed layer in state trace", () => {
    const harness = new FinancePipelineHarness({
      layerOverrides: makeSuccessfulLayerOverrides()
    });

    const result = harness.run(sampleFinanceRequest());

    expect(result.stateTrace.completedLayers.length).toBe(8);
    expect(result.stateTrace.failedLayers.length).toBe(0);
    expect(result.stateTrace.skippedLayers.length).toBe(0);

    expect(Object.keys(result.layerOutputs)).toEqual([
      "layer03_data_ingestion",
      "layer04_normalization",
      "layer05_analysis_planning",
      "layer06_analysis_execution",
      "layer07_evidence_binding",
      "layer08_synthesis",
      "layer09_final_response",
      "layer10_delivery_runtime"
    ]);
  });

  test("fails safely and skips downstream layers when a layer throws", () => {
    const harness = new FinancePipelineHarness({
      layerOverrides: makeFailingLayerOverrides("layer06_analysis_execution")
    });

    const result = harness.run(sampleFinanceRequest());

    expect(result.pipelineStatus).toBe("failed");
    expect(result.stateTrace.failedLayers.length).toBe(1);
    expect(result.stateTrace.failedLayers[0].layerKey).toBe("layer06_analysis_execution");
    expect(result.stateTrace.skippedLayers.length).toBeGreaterThan(0);
    expect(result.diagnostics.valid).toBe(false);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("forced_failure");
    expect(strings).toContain("previous_layer_failed");
  });

  test("summarizes layer outputs with runtime layer status", () => {
    const harness = new FinancePipelineHarness({
      layerOverrides: makeSuccessfulLayerOverrides()
    });

    const result = harness.run(sampleFinanceRequest());

    expect(result.layerOutputSummary.length).toBe(8);
    expect(result.layerOutputSummary.some((item) => item.layerKey === "layer10_delivery_runtime")).toBe(true);
    expect(result.layerOutputSummary.some((item) => item.status === "delivery_ready_with_caveats")).toBe(true);
  });

  test("output is JSON-serializable", () => {
    const harness = new FinancePipelineHarness({
      layerOverrides: makeSuccessfulLayerOverrides()
    });

    const result = harness.run(sampleFinanceRequest());

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
