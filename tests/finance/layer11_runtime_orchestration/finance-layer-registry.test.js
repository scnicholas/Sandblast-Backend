"use strict";

const {
  loadModule,
  pickExport,
  makeSuccessfulLayerOverrides
} = require("./finance-layer11-test-utils");

describe("FinanceLayerRegistry", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer11_runtime_orchestration/FinanceLayerRegistry.js",
    "../../../FinanceLayerRegistry.js",
    "../../../finance/FinanceLayerRegistry.js",
    "../../../finance/layer11_runtime_orchestration/FinanceLayerRegistry.js",
    "../../../Data/finance/layer11_runtime_orchestration/FinanceLayerRegistry.js",
    "../../../Data/Domains/finance/layer11_runtime_orchestration/FinanceLayerRegistry.js",
    "../../../Domains/finance/layer11_runtime_orchestration/FinanceLayerRegistry.js"
  ]);

  const FinanceLayerRegistry = pickExport(mod, [
    "FinanceLayerRegistry",
    "LayerRegistry"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceLayerRegistry({ layerOverrides: makeSuccessfulLayerOverrides() })).not.toThrow();
  });

  test("lists the expected Finax runtime layer keys in order", () => {
    const registry = new FinanceLayerRegistry({ layerOverrides: makeSuccessfulLayerOverrides() });
    const layers = registry.getAllLayers();

    expect(layers.map((layer) => layer.key)).toEqual([
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

  test("returns a layer descriptor with runtime metadata and controller factory", () => {
    const registry = new FinanceLayerRegistry({ layerOverrides: makeSuccessfulLayerOverrides() });
    const layer = registry.getLayer("layer08_synthesis");

    expect(layer.key).toBe("layer08_synthesis");
    expect(layer.runtimeLayer).toBe("layer08_synthesis");
    expect(layer.loadOk).toBe(true);
    expect(typeof layer.createController).toBe("function");
    expect(Array.isArray(layer.methodNames)).toBe(true);
  });

  test("supports validation when all layer overrides are loadable", () => {
    const registry = new FinanceLayerRegistry({ layerOverrides: makeSuccessfulLayerOverrides() });

    if (typeof registry.validate === "function") {
      const validation = registry.validate();

      expect(validation.valid).toBe(true);
      expect(validation.layerCount).toBe(8);
      expect(validation.errors.length).toBe(0);
    } else {
      expect(registry.getAllLayers().length).toBe(8);
    }
  });

  test("throws for unknown finance layer key", () => {
    const registry = new FinanceLayerRegistry({ layerOverrides: makeSuccessfulLayerOverrides() });

    expect(() => registry.getLayer("layer99_unknown")).toThrow(/unknown_finance_layer/);
  });

  test("output descriptors are JSON-serializable without controller functions", () => {
    const registry = new FinanceLayerRegistry({ layerOverrides: makeSuccessfulLayerOverrides() });
    const layers = registry.getAllLayers().map((layer) => ({
      key: layer.key,
      order: layer.order,
      runtimeLayer: layer.runtimeLayer,
      controllerName: layer.controllerName,
      resolvedPath: layer.resolvedPath,
      loadOk: layer.loadOk,
      loadErrors: layer.loadErrors,
      methodNames: layer.methodNames
    }));

    expect(() => JSON.stringify(layers)).not.toThrow();
  });
});
