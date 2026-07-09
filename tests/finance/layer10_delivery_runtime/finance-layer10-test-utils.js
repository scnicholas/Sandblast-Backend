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

function sampleLayer09Envelope(overrides = {}) {
  const envelope = {
    requestId: "layer10-test-request",
    traceId: "layer09-test-trace",
    schemaVersion: "1.0.0",
    version: "1.0.0",
    envelopeVersion: "1.0.0",
    envelopeType: "finance_final_response_envelope",
    domain: "finance",
    layer: "R18D_layer09_finance_final_response_narrative_rendering",
    runtimeLayer: "layer09_final_response",
    queryContext: {
      originalQuery: "Summarize the finance analysis.",
      normalizedQuery: "summarize the finance analysis"
    },

    finalResponseText:
      "Based on the provided finance data, gross margin is 40%. Revenue increased by 200. The cash runway scenario indicates approximately 6 months of runway. Caveats: Scenario results depend on user-supplied assumptions.",
    finalResponseBlocks: [
      {
        blockId: "fin_response_block_main",
        blockType: "main_answer",
        title: "Answer",
        text: "Based on the provided finance data, gross margin is 40%.",
        renderHint: "summary"
      },
      {
        blockId: "fin_response_block_caveats",
        blockType: "caveats_applied",
        title: "Caveats Applied",
        text: "Scenario results depend on user-supplied assumptions.",
        renderHint: "caveats"
      }
    ],
    renderedSections: [
      {
        renderedSectionId: "fin_rendered_section_answer_brief",
        sectionType: "answer_brief",
        title: "Answer Brief",
        renderedText: "3 supported finding(s) are available for response rendering.",
        includeInFinalResponse: true
      },
      {
        renderedSectionId: "fin_rendered_section_safe_findings",
        sectionType: "safe_findings",
        title: "Supported Findings",
        renderedText: "Gross margin: 40 percent. Revenue trend: increased by 200.",
        includeInFinalResponse: true
      }
    ],

    responseReadiness: {
      status: "response_rendered_with_caveats",
      score: 0.78,
      renderedSectionCount: 2,
      responseLength: 220,
      caveatCount: 1,
      blockedClaimCount: 0,
      toneFindingCount: 0,
      blockingIssues: [],
      warnings: ["scenario_assumption_caveat"]
    },
    nextLayerHandoff: {
      canDeliverToUser: true,
      canDeliverWithCaveats: true,
      requiresReviewBeforeDelivery: false,
      requiresEvidenceVerification: false,
      finalResponseStatus: "response_rendered_with_caveats"
    },

    synthesisReadiness: {
      status: "synthesis_prepared_with_caveats",
      score: 0.76
    },
    evidenceReadiness: {
      status: "needs_evidence_caveats",
      score: 0.7
    },
    executionQuality: {
      status: "executed",
      score: 0.8
    },

    answerPlan: {
      answerMode: "caveated_answer_preparation",
      canRenderFinalAnswer: true,
      requiresCaveats: true
    },
    answerSections: [],
    finalAnswerPackage: {
      format: "structured_answer_package",
      renderMode: "render_with_sections"
    },

    caveatsApplied: [
      {
        caveatId: "caveat_assumption",
        caveatCode: "unconfirmed_assumption:cash_burn",
        severity: "low",
        message: "The cash runway result depends on user-supplied cash and burn assumptions.",
        appliesTo: ["scenario_cash_runway"]
      }
    ],
    blockedClaims: [],
    toneGuardFindings: [],

    verificationGaps: [],
    evidenceNotes: [
      {
        evidenceNoteId: "evidence_note_financial_statement",
        requirementCode: "official_financial_statement_source",
        priority: "recommended",
        status: "carried_forward"
      }
    ],
    assumptionNotes: [
      {
        assumptionNoteId: "assumption_cash_burn",
        statement: "Cash and burn are user-supplied assumptions.",
        requiresConfirmation: true
      }
    ],

    prioritizedResults: [
      {
        resultId: "ratio_gross_margin",
        resultType: "ratio",
        resultName: "gross_margin",
        value: 40,
        unit: "percent",
        supportStatus: "adequate_support",
        supportScore: 0.72,
        priorityScore: 0.76,
        canUseInFinalSynthesis: true,
        shouldCaveat: false
      }
    ],
    resultGroups: {},
    caveats: [],
    blockedItems: [],

    normalizedMetrics: [],
    normalizedEntities: { companies: [], businessNames: [], programs: [], jurisdictions: [], sources: [] },
    normalizedPeriods: [],
    normalizedSources: [],

    ratioResults: {},
    trendResults: {},
    peerComparison: {},
    scenarioResults: {},
    valuationResults: {},

    assumptions: [],
    missingInputs: [],
    riskFlags: [],
    evidenceRequirements: []
  };

  return {
    ...envelope,
    ...overrides
  };
}

module.exports = {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  expectDeepKey,
  sampleLayer09Envelope
};
