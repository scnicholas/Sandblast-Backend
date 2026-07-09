"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  sampleFinanceAdapterRequest,
  makeFakeOrchestrator,
  makeFailingOrchestrator
} = require("./finance-layer12-test-utils");

describe("FinanceNyxRuntimeBridge", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer12_marion_nyx_bridge/FinanceNyxRuntimeBridge.js",
    "../../../FinanceNyxRuntimeBridge.js",
    "../../../finance/FinanceNyxRuntimeBridge.js",
    "../../../finance/layer12_marion_nyx_bridge/FinanceNyxRuntimeBridge.js",
    "../../../Data/finance/layer12_marion_nyx_bridge/FinanceNyxRuntimeBridge.js",
    "../../../Data/Domains/finance/layer12_marion_nyx_bridge/FinanceNyxRuntimeBridge.js",
    "../../../Domains/finance/layer12_marion_nyx_bridge/FinanceNyxRuntimeBridge.js"
  ]);

  const FinanceNyxRuntimeBridge = pickExport(mod, [
    "FinanceNyxRuntimeBridge",
    "NyxRuntimeBridge"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceNyxRuntimeBridge({ orchestrator: makeFakeOrchestrator() })).not.toThrow();
  });

  test("calls Layer 11 orchestrator and returns bridge-ready result", () => {
    const orchestrator = makeFakeOrchestrator();
    const bridge = new FinanceNyxRuntimeBridge({ orchestrator });

    const result = callFirst(bridge, ["bridge", "run", "execute", "process"], sampleFinanceAdapterRequest());

    expect(orchestrator.calls.length).toBe(1);
    expect(result.domain).toBe("finance");
    expect(result.runtimeLayer).toBe("layer12_marion_nyx_bridge");
    expect(result.bridgeStatus).toBe("bridge_ready_with_caveats");
    expect(result.orchestratorAvailable).toBe(true);
    expect(result.orchestrationEnvelope.runtimeLayer).toBe("layer11_runtime_orchestration");
    expect(result.runtimeResponse.replyText).toContain("gross margin");
  });

  test("returns bridge_failed when orchestrator is missing", () => {
    const bridge = new FinanceNyxRuntimeBridge({ orchestrator: null });
    bridge.orchestrator = null;

    const result = callFirst(bridge, ["bridge", "run", "execute", "process"], sampleFinanceAdapterRequest());

    expect(result.bridgeStatus).toBe("bridge_failed");
    expect(result.orchestratorAvailable).toBe(false);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("missing_finance_runtime_orchestrator");
  });

  test("captures orchestrator failures without throwing", () => {
    const bridge = new FinanceNyxRuntimeBridge({ orchestrator: makeFailingOrchestrator() });

    const result = callFirst(bridge, ["bridge", "run", "execute", "process"], sampleFinanceAdapterRequest());

    expect(result.bridgeStatus).toBe("bridge_failed");
    expect(result.diagnostics.ok).toBe(false);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("forced_layer12_orchestrator_failure");
  });

  test("classifies review-required orchestration as bridge_review_required", () => {
    const bridge = new FinanceNyxRuntimeBridge({
      orchestrator: makeFakeOrchestrator({
        pipelineStatus: "completed_with_review_hold",
        nextLayerHandoff: {
          requiresHumanReview: true,
          failed: false,
          blocked: false
        }
      })
    });

    const result = callFirst(bridge, ["bridge", "run", "execute", "process"], sampleFinanceAdapterRequest());

    expect(result.bridgeStatus).toBe("bridge_review_required");
  });

  test("output is JSON-serializable", () => {
    const bridge = new FinanceNyxRuntimeBridge({ orchestrator: makeFakeOrchestrator() });
    const result = callFirst(bridge, ["bridge", "run", "execute", "process"], sampleFinanceAdapterRequest());

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
