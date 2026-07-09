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

function sampleFinanceRequest(overrides = {}) {
  return {
    requestId: "layer11-test-request",
    traceId: "layer11-test-trace",
    originalQuery: "Calculate gross margin and summarize the finance result.",
    userText: "Revenue is 1000 and cost of goods sold is 600. Calculate gross margin.",
    queryContext: {
      originalQuery: "Calculate gross margin and summarize the finance result.",
      normalizedQuery: "calculate gross margin and summarize the finance result"
    },
    ...overrides
  };
}

function makeLayerOutput(layerKey, runtimeLayer, input, extra = {}) {
  return {
    ...input,
    requestId: input.requestId || "layer11-test-request",
    traceId: input.traceId || "layer11-test-trace",
    domain: "finance",
    layer: `R18D_${layerKey}`,
    runtimeLayer,
    envelopeType: `finance_${runtimeLayer}_envelope`,
    diagnostics: {
      ok: true,
      valid: true,
      warnings: [],
      errors: []
    },
    nextLayerHandoff: {
      canContinuePipeline: true
    },
    ...extra
  };
}

function makeFakeLayerDescriptor(layerKey, runtimeLayer, handler) {
  return {
    key: layerKey,
    order: Number(String(layerKey).match(/layer(\d+)/i)?.[1] || 99),
    runtimeLayer,
    controllerName: `Fake${runtimeLayer}Controller`,
    resolvedPath: "test:override",
    loadOk: true,
    loadErrors: [],
    methodNames: ["run", "execute", "process"],
    createController: () => ({
      run: (input) => handler(input),
      execute: (input) => handler(input),
      process: (input) => handler(input)
    })
  };
}

function makeSuccessfulLayerOverrides() {
  return {
    layer03_data_ingestion: makeFakeLayerDescriptor(
      "layer03_data_ingestion",
      "layer03_data_ingestion",
      (input) => makeLayerOutput("layer03_data_ingestion", "layer03_data_ingestion", input, {
        ingestionQuality: { status: "ingested", score: 0.88 },
        extractedInputs: [{ metric: "revenue", value: 1000 }]
      })
    ),

    layer04_normalization: makeFakeLayerDescriptor(
      "layer04_normalization",
      "layer04_normalization",
      (input) => makeLayerOutput("layer04_normalization", "layer04_normalization", input, {
        normalizationQuality: { status: "normalized", score: 0.86 },
        normalizedMetrics: [
          { canonicalMetric: "revenue", value: 1000 },
          { canonicalMetric: "cost_of_goods_sold", value: 600 }
        ]
      })
    ),

    layer05_analysis_planning: makeFakeLayerDescriptor(
      "layer05_analysis_planning",
      "layer05_analysis_planning",
      (input) => makeLayerOutput("layer05_analysis_planning", "layer05_analysis_planning", input, {
        analysisReadiness: { status: "analysis_plan_ready", score: 0.84 },
        analysisPlan: { plannedAnalyses: ["ratio:gross_margin"] }
      })
    ),

    layer06_analysis_execution: makeFakeLayerDescriptor(
      "layer06_analysis_execution",
      "layer06_analysis_execution",
      (input) => makeLayerOutput("layer06_analysis_execution", "layer06_analysis_execution", input, {
        executionQuality: { status: "executed", score: 0.82 },
        ratioResults: {
          grossMargin: {
            resultId: "ratio_gross_margin",
            resultName: "gross_margin",
            value: 40,
            unit: "percent"
          }
        }
      })
    ),

    layer07_evidence_binding: makeFakeLayerDescriptor(
      "layer07_evidence_binding",
      "layer07_evidence_binding",
      (input) => makeLayerOutput("layer07_evidence_binding", "layer07_evidence_binding", input, {
        evidenceReadiness: { status: "evidence_bound_with_caveats", score: 0.78 },
        evidenceBoundResults: [
          {
            resultId: "ratio_gross_margin",
            resultName: "gross_margin",
            value: 40,
            unit: "percent",
            supportStatus: "adequate_support"
          }
        ]
      })
    ),

    layer08_synthesis: makeFakeLayerDescriptor(
      "layer08_synthesis",
      "layer08_synthesis",
      (input) => makeLayerOutput("layer08_synthesis", "layer08_synthesis", input, {
        synthesisReadiness: { status: "synthesis_prepared_with_caveats", score: 0.76 },
        finalAnswerPackage: {
          answerSections: [
            {
              sectionType: "safe_findings",
              title: "Supported Findings",
              content: [
                {
                  resultName: "gross_margin",
                  value: 40,
                  unit: "percent",
                  supportStatus: "adequate_support"
                }
              ]
            }
          ]
        }
      })
    ),

    layer09_final_response: makeFakeLayerDescriptor(
      "layer09_final_response",
      "layer09_final_response",
      (input) => makeLayerOutput("layer09_final_response", "layer09_final_response", input, {
        responseReadiness: { status: "response_rendered_with_caveats", score: 0.78 },
        finalResponseText:
          "Based on the provided finance data, gross margin is 40%. Caveats: this depends on user-supplied inputs.",
        finalResponseBlocks: [
          {
            blockId: "main",
            blockType: "main_answer",
            title: "Answer",
            text: "Based on the provided finance data, gross margin is 40%."
          }
        ],
        renderedSections: [
          {
            sectionType: "safe_findings",
            title: "Supported Findings",
            renderedText: "Gross margin: 40 percent."
          }
        ],
        caveatsApplied: [
          {
            caveatCode: "user_supplied_inputs",
            severity: "low",
            message: "This depends on user-supplied inputs."
          }
        ]
      })
    ),

    layer10_delivery_runtime: makeFakeLayerDescriptor(
      "layer10_delivery_runtime",
      "layer10_delivery_runtime",
      (input) => makeLayerOutput("layer10_delivery_runtime", "layer10_delivery_runtime", input, {
        deliveryPolicy: {
          status: "deliver_with_caveats",
          canDeliver: true,
          requiresReview: false,
          requiresCaveats: true,
          requiresMoreEvidence: false,
          blockingReasons: [],
          warnings: ["caveat:user_supplied_inputs"]
        },
        deliveryReadiness: {
          status: "delivery_ready_with_caveats",
          score: 0.78,
          canDeliver: true,
          requiresReview: false,
          requiresCaveats: true
        },
        runtimeResponse: {
          replyText:
            "Based on the provided finance data, gross margin is 40%. Caveats: this depends on user-supplied inputs.",
          displayText:
            "Based on the provided finance data, gross margin is 40%. Caveats: this depends on user-supplied inputs.",
          voiceText:
            "Based on the provided finance data, gross margin is 40 percent. Caveats: this depends on user supplied inputs.",
          canDeliver: true,
          caveatState: "caveats_present"
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
            }
          ]
        },
        telemetry: {
          telemetryId: "layer11-telemetry",
          deliveryStatus: "deliver_with_caveats",
          caveatCount: 1
        }
      })
    )
  };
}

function makeFailingLayerOverrides(failingLayerKey = "layer06_analysis_execution") {
  const overrides = makeSuccessfulLayerOverrides();

  overrides[failingLayerKey] = makeFakeLayerDescriptor(
    failingLayerKey,
    failingLayerKey,
    () => {
      throw new Error(`forced_failure:${failingLayerKey}`);
    }
  );

  return overrides;
}

module.exports = {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  expectDeepKey,
  sampleFinanceRequest,
  makeLayerOutput,
  makeFakeLayerDescriptor,
  makeSuccessfulLayerOverrides,
  makeFailingLayerOverrides
};
