"use strict";

function loadModule(candidates) {
  const errors = [];

  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (err) {
      errors.push(`${candidate}: ${err.message}`);
    }
  }

  throw new Error(`Unable to load module from candidates:\n${errors.join("\n")}`);
}

function pickExport(mod, names) {
  if (typeof mod === "function") return mod;
  if (mod && typeof mod.default === "function") return mod.default;

  for (const name of names) {
    if (mod && typeof mod[name] === "function") return mod[name];
  }

  throw new Error(`Unable to resolve export. Available keys: ${Object.keys(mod || {}).join(", ")}`);
}

function callFirst(target, methodNames, ...args) {
  for (const methodName of methodNames) {
    if (target && typeof target[methodName] === "function") {
      return target[methodName](...args);
    }
  }

  throw new Error(`None of the expected methods exist: ${methodNames.join(", ")}`);
}

function flattenStrings(value, output = [], seen = new WeakSet()) {
  if (typeof value === "string") {
    output.push(value.toLowerCase());
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => flattenStrings(item, output, seen));
    return output;
  }

  if (value && typeof value === "object") {
    if (seen.has(value)) return output;
    seen.add(value);
    Object.values(value).forEach((item) => flattenStrings(item, output, seen));
  }

  return output;
}

function collectKeysDeep(value, keys = new Set(), seen = new WeakSet()) {
  if (!value || typeof value !== "object") return keys;
  if (seen.has(value)) return keys;
  seen.add(value);

  Object.keys(value).forEach((key) => {
    keys.add(key);
    collectKeysDeep(value[key], keys, seen);
  });

  return keys;
}

function expectDeepKey(value, possibleKeys) {
  const keys = collectKeysDeep(value);
  expect(possibleKeys.some((key) => keys.has(key))).toBe(true);
}

function sampleFinanceAdapterRequest(overrides = {}) {
  return {
    requestId: "layer12-test-request",
    traceId: "layer12-test-trace",
    originalQuery: "Calculate gross margin and summarize the finance result.",
    userText: "Revenue is 1000 and cost of goods sold is 600. Calculate gross margin.",
    queryContext: {
      originalQuery: "Calculate gross margin and summarize the finance result.",
      normalizedQuery: "calculate gross margin and summarize the finance result"
    },
    ...overrides
  };
}

function sampleNonFinanceRequest(overrides = {}) {
  return {
    requestId: "layer12-nonfinance-request",
    traceId: "layer12-nonfinance-trace",
    originalQuery: "Write a short poem about the moon.",
    userText: "Write a short poem about the moon.",
    queryContext: {
      originalQuery: "Write a short poem about the moon.",
      normalizedQuery: "write a short poem about the moon"
    },
    ...overrides
  };
}

function sampleLayer11OrchestrationEnvelope(overrides = {}) {
  return {
    requestId: "layer12-test-request",
    traceId: "layer12-test-trace",
    schemaVersion: "1.0.0",
    envelopeType: "finance_runtime_orchestration_envelope",
    domain: "finance",
    layer: "R18D_layer11_finance_runtime_orchestration_end_to_end_pipeline_harness",
    runtimeLayer: "layer11_runtime_orchestration",
    pipelineStatus: "completed_with_caveats",
    pipelineReadiness: {
      status: "pipeline_ready_with_caveats",
      score: 0.78,
      canReturnToRuntime: true,
      canReturnWithCaveats: true,
      requiresReview: false,
      requiresMoreEvidence: false,
      blocked: false,
      failed: false
    },
    runtimeResponse: {
      responseId: "runtime_response_1",
      domain: "finance",
      replyText:
        "Based on the provided finance data, gross margin is 40%. Caveats: this depends on user-supplied inputs.",
      displayText:
        "Based on the provided finance data, gross margin is 40%. Caveats: this depends on user-supplied inputs.",
      voiceText:
        "Based on the provided finance data, gross margin is 40 percent. Caveats: this depends on user supplied inputs.",
      responseBlocks: [
        {
          blockId: "main",
          blockType: "main_answer",
          title: "Answer",
          text: "Based on the provided finance data, gross margin is 40%."
        }
      ],
      canDeliver: true,
      deliveryStatus: "deliver_with_caveats",
      caveatState: "caveats_present",
      confidence: 0.72
    },
    uiDelivery: {
      mainAnswer:
        "Based on the provided finance data, gross margin is 40%. Caveats: this depends on user-supplied inputs.",
      blocks: [
        {
          blockId: "main",
          type: "main_answer",
          title: "Answer",
          text: "Based on the provided finance data, gross margin is 40%."
        },
        {
          blockId: "caveats",
          type: "caveats",
          title: "Caveats",
          items: [
            {
              code: "user_supplied_inputs",
              severity: "low",
              message: "This depends on user-supplied inputs."
            }
          ]
        }
      ]
    },
    telemetry: {
      telemetryId: "layer12-telemetry",
      deliveryStatus: "deliver_with_caveats",
      caveatCount: 1
    },
    finalDeliveryEnvelope: {
      runtimeLayer: "layer10_delivery_runtime",
      deliveryPolicy: {
        status: "deliver_with_caveats",
        canDeliver: true,
        requiresReview: false,
        requiresCaveats: true
      },
      caveatsApplied: [
        {
          caveatCode: "user_supplied_inputs",
          severity: "low",
          message: "This depends on user-supplied inputs."
        }
      ]
    },
    nextLayerHandoff: {
      canReturnToMarion: false,
      canReturnToMarionWithCaveats: true,
      requiresHumanReview: false,
      requiresMoreEvidence: false,
      blocked: false,
      failed: false,
      pipelineStatus: "completed_with_caveats"
    },
    diagnostics: {
      ok: true,
      valid: true,
      warnings: [],
      errors: []
    },
    ...overrides
  };
}

function makeFakeOrchestrator(envelopeOverrides = {}) {
  return {
    calls: [],
    orchestrate(input) {
      this.calls.push(input);

      return sampleLayer11OrchestrationEnvelope({
        requestId: input.requestId || "layer12-test-request",
        traceId: input.traceId || "layer12-test-trace",
        ...envelopeOverrides
      });
    }
  };
}

function makeFailingOrchestrator() {
  return {
    calls: [],
    orchestrate(input) {
      this.calls.push(input);
      throw new Error("forced_layer12_orchestrator_failure");
    }
  };
}

module.exports = {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  expectDeepKey,
  sampleFinanceAdapterRequest,
  sampleNonFinanceRequest,
  sampleLayer11OrchestrationEnvelope,
  makeFakeOrchestrator,
  makeFailingOrchestrator
};
