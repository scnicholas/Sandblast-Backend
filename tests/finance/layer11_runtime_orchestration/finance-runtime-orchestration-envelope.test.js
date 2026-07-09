"use strict";

const {
  loadModule,
  pickExport,
  expectDeepKey
} = require("./finance-layer11-test-utils");

describe("FinanceRuntimeOrchestrationEnvelope", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrationEnvelope.js",
    "../../../FinanceRuntimeOrchestrationEnvelope.js",
    "../../../finance/FinanceRuntimeOrchestrationEnvelope.js",
    "../../../finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrationEnvelope.js",
    "../../../Data/finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrationEnvelope.js",
    "../../../Data/Domains/finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrationEnvelope.js",
    "../../../Domains/finance/layer11_runtime_orchestration/FinanceRuntimeOrchestrationEnvelope.js"
  ]);

  const FinanceRuntimeOrchestrationEnvelope = pickExport(mod, [
    "FinanceRuntimeOrchestrationEnvelope",
    "RuntimeOrchestrationEnvelope"
  ]);

  function callEnvelopeFactory(EnvelopeClass, payload) {
    if (typeof EnvelopeClass.create === "function") return EnvelopeClass.create(payload);
    if (typeof EnvelopeClass.build === "function") return EnvelopeClass.build(payload);

    return new EnvelopeClass(payload);
  }

  test("constructs or creates without throwing", () => {
    expect(() => {
      callEnvelopeFactory(FinanceRuntimeOrchestrationEnvelope, {
        originalQuery: "Run finance pipeline.",
        pipelineStatus: "completed",
        layerOutputs: {},
        stateTrace: {
          completedLayers: [],
          failedLayers: [],
          skippedLayers: []
        }
      });
    }).not.toThrow();
  });

  test("creates stable Layer 11 orchestration metadata and handoff fields", () => {
    const envelope = callEnvelopeFactory(FinanceRuntimeOrchestrationEnvelope, {
      requestId: "orch-envelope-request",
      traceId: "orch-envelope-trace",
      originalQuery: "Run finance pipeline.",
      normalizedQuery: "run finance pipeline",
      pipelineStatus: "completed_with_caveats",
      layerOutputs: {
        layer10_delivery_runtime: {
          runtimeLayer: "layer10_delivery_runtime"
        }
      },
      finalDeliveryEnvelope: {
        runtimeLayer: "layer10_delivery_runtime",
        deliveryPolicy: { status: "deliver_with_caveats" },
        runtimeResponse: {
          replyText: "Based on the provided finance data..."
        },
        uiDelivery: {
          blocks: [{ blockId: "main" }]
        },
        telemetry: {
          telemetryId: "telemetry_1"
        }
      },
      runtimeResponse: {
        replyText: "Based on the provided finance data..."
      },
      uiDelivery: {
        blocks: [{ blockId: "main" }]
      },
      telemetry: {
        telemetryId: "telemetry_1"
      },
      stateTrace: {
        completedLayers: [
          { layerKey: "layer03_data_ingestion" },
          { layerKey: "layer04_normalization" },
          { layerKey: "layer05_analysis_planning" },
          { layerKey: "layer06_analysis_execution" },
          { layerKey: "layer07_evidence_binding" },
          { layerKey: "layer08_synthesis" },
          { layerKey: "layer09_final_response" },
          { layerKey: "layer10_delivery_runtime" }
        ],
        failedLayers: [],
        skippedLayers: [],
        warnings: [],
        errors: []
      }
    });

    expect(envelope.domain).toBe("finance");
    expect(envelope.runtimeLayer).toBe("layer11_runtime_orchestration");
    expect(envelope.pipelineStatus).toBe("completed_with_caveats");
    expect(envelope.pipelineReadiness.status).toBe("pipeline_ready_with_caveats");

    expectDeepKey(envelope, [
      "pipelineReadiness",
      "layerOutputs",
      "finalDeliveryEnvelope",
      "runtimeResponse",
      "uiDelivery",
      "telemetry",
      "stateTrace",
      "nextLayerHandoff"
    ]);

    expect(envelope.nextLayerHandoff.canReturnToMarionWithCaveats).toBe(true);
  });

  test("marks failed pipeline as not valid", () => {
    const envelope = callEnvelopeFactory(FinanceRuntimeOrchestrationEnvelope, {
      originalQuery: "Run finance pipeline.",
      pipelineStatus: "failed",
      layerOutputs: {},
      stateTrace: {
        completedLayers: [],
        failedLayers: [{ layerKey: "layer06_analysis_execution" }],
        skippedLayers: [{ layerKey: "layer07_evidence_binding" }],
        warnings: ["layer07_evidence_binding:skipped"],
        errors: ["layer06_analysis_execution:forced_failure"]
      }
    });

    expect(envelope.pipelineReadiness.status).toBe("pipeline_failed");
    expect(envelope.nextLayerHandoff.failed).toBe(true);
    expect(envelope.diagnostics.valid).toBe(false);
  });

  test("validates required orchestration envelope shape", () => {
    const envelope = callEnvelopeFactory(FinanceRuntimeOrchestrationEnvelope, {
      originalQuery: "Run finance pipeline.",
      pipelineStatus: "completed",
      layerOutputs: {},
      stateTrace: {
        completedLayers: [],
        failedLayers: [],
        skippedLayers: []
      }
    });

    if (typeof FinanceRuntimeOrchestrationEnvelope.validate === "function") {
      const validation = FinanceRuntimeOrchestrationEnvelope.validate(envelope);

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    } else {
      expect(envelope.nextLayerHandoff).toBeTruthy();
    }
  });

  test("output is JSON-serializable", () => {
    const envelope = callEnvelopeFactory(FinanceRuntimeOrchestrationEnvelope, {
      originalQuery: "Run finance pipeline.",
      pipelineStatus: "completed",
      layerOutputs: {},
      stateTrace: {
        completedLayers: [],
        failedLayers: [],
        skippedLayers: []
      }
    });

    expect(() => JSON.stringify(envelope)).not.toThrow();
  });
});
