"use strict";

const {
  loadModule,
  pickExport,
  flattenStrings
} = require("./finance-layer11-test-utils");

describe("FinanceRuntimeErrorBoundary", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer11_runtime_orchestration/FinanceRuntimeErrorBoundary.js",
    "../../../FinanceRuntimeErrorBoundary.js",
    "../../../finance/FinanceRuntimeErrorBoundary.js",
    "../../../finance/layer11_runtime_orchestration/FinanceRuntimeErrorBoundary.js",
    "../../../Data/finance/layer11_runtime_orchestration/FinanceRuntimeErrorBoundary.js",
    "../../../Data/Domains/finance/layer11_runtime_orchestration/FinanceRuntimeErrorBoundary.js",
    "../../../Domains/finance/layer11_runtime_orchestration/FinanceRuntimeErrorBoundary.js"
  ]);

  const FinanceRuntimeErrorBoundary = pickExport(mod, [
    "FinanceRuntimeErrorBoundary",
    "RuntimeErrorBoundary"
  ]);

  const layerDescriptor = {
    key: "layer06_analysis_execution",
    runtimeLayer: "layer06_analysis_execution"
  };

  test("constructs without throwing", () => {
    expect(() => new FinanceRuntimeErrorBoundary()).not.toThrow();
  });

  test("returns successful execution when layer output is valid", () => {
    const boundary = new FinanceRuntimeErrorBoundary();

    const result = boundary.executeLayer({
      layerDescriptor,
      input: {},
      executor: () => ({
        domain: "finance",
        runtimeLayer: "layer06_analysis_execution",
        diagnostics: { ok: true }
      })
    });

    expect(result.ok).toBe(true);
    expect(result.output.runtimeLayer).toBe("layer06_analysis_execution");
    expect(result.error).toBe(null);
  });

  test("classifies thrown layer execution errors and returns fallback output", () => {
    const boundary = new FinanceRuntimeErrorBoundary();

    const result = boundary.executeLayer({
      layerDescriptor,
      input: {},
      executor: () => {
        throw new Error("forced execution failure");
      }
    });

    expect(result.ok).toBe(false);
    expect(result.error.classification).toBe("layer_execution_error");
    expect(result.fallbackOutput.runtimeLayer).toBe("layer06_analysis_execution");
    expect(result.fallbackOutput.nextLayerHandoff.blocked).toBe(true);
  });

  test("classifies missing layer module errors", () => {
    const boundary = new FinanceRuntimeErrorBoundary();

    const result = boundary.executeLayer({
      layerDescriptor: {
        key: "layer07_evidence_binding",
        runtimeLayer: "layer07_evidence_binding"
      },
      input: {},
      executor: () => {
        throw new Error("Cannot find module '../layer07_evidence_binding/FinanceEvidenceBindingController.js'");
      }
    });

    expect(result.ok).toBe(false);
    expect(result.error.classification).toBe("missing_layer_module");

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("missing_layer_module");
  });

  test("rejects invalid non-object layer output", () => {
    const boundary = new FinanceRuntimeErrorBoundary();

    const result = boundary.executeLayer({
      layerDescriptor,
      input: {},
      executor: () => "not an envelope"
    });

    expect(result.ok).toBe(false);
    expect(result.error.classification).toBe("invalid_layer_output");
    expect(result.fallbackOutput.diagnostics.ok).toBe(false);
  });

  test("output is JSON-serializable", () => {
    const boundary = new FinanceRuntimeErrorBoundary();

    const result = boundary.executeLayer({
      layerDescriptor,
      input: {},
      executor: () => {
        throw new Error("forced execution failure");
      }
    });

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
