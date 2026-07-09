"use strict";

/**
 * R18D Layer 11 — Finance Layer Registry
 * Central registry for Finax runtime layers.
 *
 * Keeps Layer 11 from scattering direct require paths throughout the harness.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeRequire(candidates = []) {
  const errors = [];

  for (const candidate of candidates) {
    try {
      return {
        ok: true,
        module: require(candidate),
        resolvedPath: candidate,
        errors: []
      };
    } catch (err) {
      errors.push(`${candidate}: ${err.message}`);
    }
  }

  return {
    ok: false,
    module: null,
    resolvedPath: null,
    errors
  };
}

function pickExport(mod, exportNames = []) {
  if (typeof mod === "function") return mod;
  if (mod && typeof mod.default === "function") return mod.default;

  for (const name of exportNames) {
    if (mod && typeof mod[name] === "function") {
      return mod[name];
    }
  }

  return null;
}

class FinanceLayerRegistry {
  constructor(options = {}) {
    this.overrides = options.layers || options.layerOverrides || {};
    this.layerDefinitions = this.buildLayerDefinitions();
  }

  buildLayerDefinitions() {
    return [
      {
        key: "layer03_data_ingestion",
        order: 3,
        runtimeLayer: "layer03_data_ingestion",
        controllerName: "FinanceDataIngestionController",
        exportNames: ["FinanceDataIngestionController", "DataIngestionController"],
        methodNames: ["ingest", "process", "execute", "run", "handle"],
        candidates: [
          "../layer03_data_ingestion/FinanceDataIngestionController.js"
        ]
      },
      {
        key: "layer04_normalization",
        order: 4,
        runtimeLayer: "layer04_normalization",
        controllerName: "FinanceNormalizationController",
        exportNames: ["FinanceNormalizationController", "NormalizationController"],
        methodNames: ["normalize", "process", "execute", "run", "handle"],
        candidates: [
          "../layer04_normalization/FinanceNormalizationController.js"
        ]
      },
      {
        key: "layer05_analysis_planning",
        order: 5,
        runtimeLayer: "layer05_analysis_planning",
        controllerName: "FinanceAnalysisController",
        exportNames: ["FinanceAnalysisController", "AnalysisController"],
        methodNames: ["analyze", "plan", "process", "execute", "run", "handle"],
        candidates: [
          "../layer05_analysis_planning/FinanceAnalysisController.js"
        ]
      },
      {
        key: "layer06_analysis_execution",
        order: 6,
        runtimeLayer: "layer06_analysis_execution",
        controllerName: "FinanceExecutionController",
        exportNames: ["FinanceExecutionController", "ExecutionController"],
        methodNames: ["execute", "run", "process", "analyze", "calculate"],
        candidates: [
          "../layer06_analysis_execution/FinanceExecutionController.js"
        ]
      },
      {
        key: "layer07_evidence_binding",
        order: 7,
        runtimeLayer: "layer07_evidence_binding",
        controllerName: "FinanceEvidenceBindingController",
        exportNames: ["FinanceEvidenceBindingController", "EvidenceBindingController"],
        methodNames: ["bind", "bindEvidence", "process", "execute", "run"],
        candidates: [
          "../layer07_evidence_binding/FinanceEvidenceBindingController.js"
        ]
      },
      {
        key: "layer08_synthesis",
        order: 8,
        runtimeLayer: "layer08_synthesis",
        controllerName: "FinanceSynthesisController",
        exportNames: ["FinanceSynthesisController", "SynthesisController"],
        methodNames: ["synthesize", "prepare", "process", "execute", "run"],
        candidates: [
          "../layer08_synthesis/FinanceSynthesisController.js"
        ]
      },
      {
        key: "layer09_final_response",
        order: 9,
        runtimeLayer: "layer09_final_response",
        controllerName: "FinanceFinalResponseController",
        exportNames: ["FinanceFinalResponseController", "FinalResponseController"],
        methodNames: ["render", "prepare", "process", "execute", "run"],
        candidates: [
          "../layer09_final_response/FinanceFinalResponseController.js"
        ]
      },
      {
        key: "layer10_delivery_runtime",
        order: 10,
        runtimeLayer: "layer10_delivery_runtime",
        controllerName: "FinanceDeliveryController",
        exportNames: ["FinanceDeliveryController", "DeliveryController"],
        methodNames: ["deliver", "adapt", "process", "execute", "run"],
        candidates: [
          "../layer10_delivery_runtime/FinanceDeliveryController.js"
        ]
      }
    ];
  }

  getLayer(key) {
    const override = this.overrides[key];

    if (override) {
      return this.normalizeOverrideLayer(key, override);
    }

    const definition = this.layerDefinitions.find((layer) => layer.key === key);

    if (!definition) {
      throw new Error(`unknown_finance_layer:${key}`);
    }

    return this.buildDescriptor(definition);
  }

  getAllLayers() {
    return this.layerDefinitions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((definition) => this.getLayer(definition.key));
  }

  buildDescriptor(definition = {}) {
    const loadResult = safeRequire(definition.candidates);
    const Controller = loadResult.ok
      ? pickExport(loadResult.module, definition.exportNames)
      : null;

    return {
      key: definition.key,
      order: definition.order,
      runtimeLayer: definition.runtimeLayer,
      controllerName: definition.controllerName,
      resolvedPath: loadResult.resolvedPath,
      loadOk: Boolean(loadResult.ok && Controller),
      loadErrors: loadResult.errors,
      methodNames: safeArray(definition.methodNames),
      createController: () => {
        if (!loadResult.ok) {
          throw new Error(
            `missing_layer_module:${definition.key}:${loadResult.errors.join(" || ")}`
          );
        }

        if (!Controller) {
          throw new Error(
            `missing_layer_export:${definition.key}:${definition.exportNames.join("|")}`
          );
        }

        return new Controller();
      }
    };
  }

  normalizeOverrideLayer(key, override) {
    if (typeof override === "function") {
      return {
        key,
        order: this.orderForKey(key),
        runtimeLayer: key,
        controllerName: override.name || "OverrideController",
        resolvedPath: "override:function",
        loadOk: true,
        loadErrors: [],
        methodNames: ["run", "execute", "process", "deliver", "render", "synthesize", "bind", "analyze", "normalize", "ingest"],
        createController: () => new override()
      };
    }

    if (override && typeof override.createController === "function") {
      return {
        key,
        order: override.order || this.orderForKey(key),
        runtimeLayer: override.runtimeLayer || key,
        controllerName: override.controllerName || "OverrideController",
        resolvedPath: override.resolvedPath || "override:descriptor",
        loadOk: true,
        loadErrors: [],
        methodNames: safeArray(override.methodNames).length > 0
          ? safeArray(override.methodNames)
          : ["run", "execute", "process"],
        createController: override.createController
      };
    }

    if (override && typeof override === "object") {
      return {
        key,
        order: override.order || this.orderForKey(key),
        runtimeLayer: override.runtimeLayer || key,
        controllerName: override.controllerName || "OverrideInstance",
        resolvedPath: "override:instance",
        loadOk: true,
        loadErrors: [],
        methodNames: safeArray(override.methodNames).length > 0
          ? safeArray(override.methodNames)
          : ["run", "execute", "process", "deliver", "render", "synthesize", "bind", "analyze", "normalize", "ingest"],
        createController: () => override.controller || override
      };
    }

    throw new Error(`invalid_layer_override:${key}`);
  }

  orderForKey(key) {
    const match = String(key).match(/layer(\d+)/i);
    return match ? Number(match[1]) : 999;
  }

  validate() {
    const layers = this.getAllLayers();

    const errors = layers
      .filter((layer) => !layer.loadOk)
      .map((layer) => ({
        layerKey: layer.key,
        errors: layer.loadErrors
      }));

    return {
      valid: errors.length === 0,
      layerCount: layers.length,
      errors
    };
  }

  listLayerKeys() {
    return this.layerDefinitions.map((layer) => layer.key);
  }

  static create(options = {}) {
    return new FinanceLayerRegistry(options);
  }
}

module.exports = {
  FinanceLayerRegistry
};
