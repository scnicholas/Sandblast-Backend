"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  expectDeepKey,
  sampleFinanceRequest,
  makeSuccessfulLayerOverrides,
  makeFailingLayerOverrides
} = require("./finance-layer11-test-utils");

describe("FinanceRuntimeOrchestrator", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrator.js",
    "../../../FinanceRuntimeOrchestrator.js",
    "../../../finance/FinanceRuntimeOrchestrator.js",
    "../../../finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrator.js",
    "../../../Data/finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrator.js",
    "../../../Data/Domains/finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrator.js",
    "../../../Domains/finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrator.js"
  ]);

  const FinanceRuntimeOrchestrator = pickExport(mod, [
    "FinanceRuntimeOrchestrator",
    "RuntimeOrchestrator"
  ]);

  test("constructs without throwing with layer overrides", () => {
    expect(() => new FinanceRuntimeOrchestrator({
      layerOverrides: makeSuccessfulLayerOverrides()
    })).not.toThrow();
  });

  test("orchestrates the full Finax pipeline and returns Layer 11 envelope", () => {
    const orchestrator = new FinanceRuntimeOrchestrator({
      layerOverrides: makeSuccessfulLayerOverrides()
    });

    const result = callFirst(
      orchestrator,
      ["orchestrate", "run", "execute", "process", "handle"],
      sampleFinanceRequest()
    );

    expect(result.domain).toBe("finance");
    expect(result.runtimeLayer).toBe("layer11_runtime_orchestration");
    expect(result.pipelineStatus).toBe("completed_with_caveats");
    expect(result.pipelineReadiness.status).toBe("pipeline_ready_with_caveats");

    expect(result.finalDeliveryEnvelope.runtimeLayer).toBe("layer10_delivery_runtime");
    expect(result.runtimeResponse.replyText).toContain("gross margin");
    expect(result.uiDelivery.blocks.length).toBeGreaterThan(0);
    expect(result.telemetry.deliveryStatus).toBe("deliver_with_caveats");

    expectDeepKey(result, [
      "pipelineStatus",
      "pipelineReadiness",
      "layerOutputs",
      "finalDeliveryEnvelope",
      "runtimeResponse",
      "uiDelivery",
      "telemetry",
      "stateTrace",
      "nextLayerHandoff"
    ]);
  });

  test("normalizes request query context into orchestration envelope", () => {
    const orchestrator = new FinanceRuntimeOrchestrator({
      layerOverrides: makeSuccessfulLayerOverrides()
    });

    const result = callFirst(
      orchestrator,
      ["orchestrate", "run", "execute", "process", "handle"],
      sampleFinanceRequest({
        originalQuery: "What is gross margin?",
        normalizedQuery: "what is gross margin"
      })
    );

    expect(result.queryContext.originalQuery).toBe("What is gross margin?");
    expect(result.queryContext.normalizedQuery).toBe("what is gross margin");
  });

  test("returns failed orchestration envelope when pipeline fails", () => {
    const orchestrator = new FinanceRuntimeOrchestrator({
      layerOverrides: makeFailingLayerOverrides("layer06_analysis_execution")
    });

    const result = callFirst(
      orchestrator,
      ["orchestrate", "run", "execute", "process", "handle"],
      sampleFinanceRequest()
    );

    expect(result.pipelineStatus).toBe("failed");
    expect(result.pipelineReadiness.status).toBe("pipeline_failed");
    expect(result.nextLayerHandoff.failed).toBe(true);
    expect(result.diagnostics.valid).toBe(false);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("layer06_analysis_execution");
    expect(strings).toContain("forced_failure");
  });

  test("static orchestrate and run helpers work", () => {
    const result = FinanceRuntimeOrchestrator.orchestrate(sampleFinanceRequest(), {
      layerOverrides: makeSuccessfulLayerOverrides()
    });

    expect(result.domain).toBe("finance");
    expect(result.runtimeLayer).toBe("layer11_runtime_orchestration");
    expect(result.pipelineStatus).toBe("completed_with_caveats");
  });

  test("output is JSON-serializable", () => {
    const orchestrator = new FinanceRuntimeOrchestrator({
      layerOverrides: makeSuccessfulLayerOverrides()
    });

    const result = callFirst(
      orchestrator,
      ["orchestrate", "run", "execute", "process", "handle"],
      sampleFinanceRequest()
    );

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
