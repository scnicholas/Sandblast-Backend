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

  for (const key of Object.keys(value)) {
    keys.add(key);
    collectKeysDeep(value[key], keys, seen);
  }

  return keys;
}

function expectDeepKey(value, possibleKeys) {
  const keys = collectKeysDeep(value);
  expect(possibleKeys.some((key) => keys.has(key))).toBe(true);
}

function sampleLayer08Envelope(overrides = {}) {
  const prioritizedResults = [
    {
      synthesisResultId: "fin_synth_ratio_gross_margin",
      resultId: "ratio_gross_margin",
      resultType: "ratio",
      resultName: "gross_margin",
      executionStatus: "calculated",
      value: 40,
      unit: "percent",
      linkedMetricIds: ["m_gross_profit_a_2024", "m_revenue_a_2024"],
      linkedSources: [{ sourceId: "src_annual_report", authorityClass: "primary" }],
      attachedRequirements: [{ requirementCode: "official_financial_statement_source" }],
      bindingStatus: "bound",
      supportStatus: "strong_support",
      supportScore: 0.87,
      priorityScore: 0.88,
      shouldCaveat: false,
      canUseInFinalSynthesis: true,
      presentationStatus: "include",
      summaryLabel: "ratio:gross_margin"
    },
    {
      synthesisResultId: "fin_synth_trend_revenue",
      resultId: "trend_revenue_apple",
      resultType: "trend",
      resultName: "revenue",
      executionStatus: "trend_calculated",
      value: 200,
      unit: "currency",
      linkedMetricIds: ["m_revenue_a_2023", "m_revenue_a_2024"],
      linkedSources: [{ sourceId: "src_annual_report", authorityClass: "primary" }],
      bindingStatus: "bound",
      supportStatus: "adequate_support",
      supportScore: 0.74,
      priorityScore: 0.77,
      shouldCaveat: false,
      canUseInFinalSynthesis: true,
      presentationStatus: "include",
      summaryLabel: "trend:revenue"
    },
    {
      synthesisResultId: "fin_synth_scenario_cash_runway",
      resultId: "scenario_cash_runway",
      resultType: "scenario",
      resultName: "cash_runway",
      executionStatus: "calculated",
      value: 6,
      unit: "months",
      linkedMetricIds: ["m_cash_a_2024", "m_burn_a_2024"],
      linkedSources: [{ sourceId: "src_user_query", authorityClass: "user_supplied" }],
      bindingStatus: "bound",
      supportStatus: "partial_support",
      supportScore: 0.52,
      priorityScore: 0.58,
      shouldCaveat: true,
      canUseInFinalSynthesis: true,
      presentationStatus: "include_with_caveat",
      summaryLabel: "scenario:cash_runway"
    }
  ];

  const answerSections = [
    {
      sectionId: "fin_section_answer_brief",
      sectionType: "answer_brief",
      title: "Answer Brief",
      order: 1,
      renderHint: "summary",
      includeInFinalAnswer: true,
      content: {
        query: "Render the final finance response.",
        primaryRoute: "peer_comparison",
        evidenceStatus: "evidence_bound",
        executionStatus: "executed",
        supportedFindingCount: 3,
        caveatCount: 1,
        blockedItemCount: 0,
        recommendedAnswerPosture: "answer_with_caveats"
      }
    },
    {
      sectionId: "fin_section_safe_findings",
      sectionType: "safe_findings",
      title: "Supported Findings",
      order: 2,
      renderHint: "findings",
      includeInFinalAnswer: true,
      content: prioritizedResults
    },
    {
      sectionId: "fin_section_scenario_results",
      sectionType: "scenario_results",
      title: "Scenario Results",
      order: 6,
      renderHint: "scenarios",
      includeInFinalAnswer: true,
      content: [prioritizedResults[2]]
    },
    {
      sectionId: "fin_section_caveats",
      sectionType: "caveats_and_limits",
      title: "Caveats and Limits",
      order: 8,
      renderHint: "caveats",
      includeInFinalAnswer: true,
      content: [
        {
          code: "partial_support:scenario_cash_runway",
          caveatCode: "partial_support:scenario_cash_runway",
          severity: "medium",
          message: "The cash runway result depends on user-supplied cash and burn assumptions.",
          appliesTo: ["scenario_cash_runway"]
        }
      ]
    }
  ];

  const envelope = {
    requestId: "test-layer09-request",
    traceId: "test-layer08-trace",
    schemaVersion: "1.0.0",
    version: "1.0.0",
    envelopeVersion: "1.0.0",
    envelopeType: "finance_synthesis_answer_preparation_envelope",
    domain: "finance",
    layer: "R18D_layer08_finance_synthesis_answer_preparation",
    runtimeLayer: "layer08_synthesis",
    queryContext: {
      originalQuery: "Render the final finance response.",
      normalizedQuery: "render the final finance response"
    },
    analysisPlan: {
      primaryRoute: "peer_comparison",
      secondaryRoutes: ["trend_comparison", "business_survival_scenario"]
    },
    analysisReadiness: { status: "ready_for_execution", score: 0.82 },
    executionQuality: { status: "executed", score: 0.78 },
    evidenceReadiness: { status: "evidence_bound", score: 0.76 },
    synthesisReadiness: {
      status: "synthesis_prepared_with_caveats",
      score: 0.74,
      renderableResultCount: 3,
      caveatedResultCount: 1,
      blockedItemCount: 0,
      sectionCount: answerSections.length,
      blockingIssues: [],
      warnings: ["partial_support:scenario_cash_runway"]
    },
    normalizedMetrics: [
      { normalizedMetricId: "m_revenue_a_2024", canonicalMetric: "revenue", value: 1200, period: "FY2024" },
      { normalizedMetricId: "m_gross_profit_a_2024", canonicalMetric: "gross_profit", value: 480, period: "FY2024" }
    ],
    normalizedEntities: {
      companies: [{ entityId: "apple", canonicalName: "Apple Inc.", ticker: "AAPL" }],
      businessNames: [],
      programs: [],
      jurisdictions: [],
      sources: []
    },
    normalizedPeriods: [{ periodId: "p_fy2024", canonicalPeriod: "FY2024" }],
    normalizedSources: [
      { sourceId: "src_annual_report", sourceType: "regulatory_filing", authorityClass: "primary" },
      { sourceId: "src_user_query", sourceType: "user_query", authorityClass: "user_supplied" }
    ],
    ratioResults: {
      calculatedRatios: [
        {
          ratioExecutionId: "ratio_gross_margin",
          ratioType: "gross_margin",
          value: 40,
          unit: "percent",
          executionStatus: "calculated",
          sourceMetricIds: ["m_gross_profit_a_2024", "m_revenue_a_2024"]
        }
      ]
    },
    trendResults: {
      trendLines: [
        {
          trendId: "trend_revenue_apple",
          canonicalMetric: "revenue",
          executionStatus: "trend_calculated",
          absoluteChange: 200
        }
      ]
    },
    peerComparison: {},
    scenarioResults: {
      scenarioOutputs: [
        {
          scenarioId: "scenario_cash_runway",
          scenarioType: "cash_runway",
          value: 6,
          unit: "months",
          executionStatus: "calculated"
        }
      ]
    },
    valuationResults: {},
    boundEvidence: {
      evidenceBoundResults: []
    },
    evidenceBoundResults: [],
    sourceRequirementMap: [],
    resultSupportScores: [
      { resultId: "ratio_gross_margin", supportStatus: "strong_support", shouldCaveat: false },
      { resultId: "scenario_cash_runway", supportStatus: "partial_support", shouldCaveat: true }
    ],
    verificationGaps: [],
    prioritizedResults,
    resultGroups: {
      keyFindings: prioritizedResults,
      calculations: [prioritizedResults[0]],
      trends: [prioritizedResults[1]],
      comparisons: [],
      scenarios: [prioritizedResults[2]],
      valuations: [],
      caveated: [prioritizedResults[2]],
      blocked: []
    },
    caveats: [
      {
        caveatId: "fin_caveat_partial_support_scenario_cash_runway",
        caveatCode: "partial_support:scenario_cash_runway",
        severity: "medium",
        message: "The cash runway result depends on user-supplied cash and burn assumptions.",
        appliesTo: ["scenario_cash_runway"],
        source: "result_support_scores"
      }
    ],
    evidenceNotes: [
      {
        evidenceNoteId: "fin_evidence_note_official_financial_statement_source",
        requirementCode: "official_financial_statement_source",
        priority: "recommended",
        status: "carried_forward"
      }
    ],
    assumptionNotes: [
      {
        assumptionNoteId: "assumption_runway",
        statement: "Cash and burn are user-supplied assumptions.",
        requiresConfirmation: true,
        handling: "carry_as_unconfirmed_assumption"
      }
    ],
    blockedItems: [],
    answerPlan: {
      answerPlanId: "fin_answer_plan_test",
      primaryRoute: "peer_comparison",
      answerMode: "caveated_answer_preparation",
      sectionOrder: answerSections.map((section) => section.sectionType),
      canRenderFinalAnswer: true,
      requiresCaveats: true,
      requiresUserClarification: false,
      resultCount: prioritizedResults.length,
      caveatCount: 1,
      blockedItemCount: 0
    },
    answerSections,
    finalAnswerPackage: {
      packageId: "fin_final_answer_package_test",
      format: "structured_answer_package",
      renderMode: "render_with_sections",
      answerSections,
      reusableBlocks: {}
    },
    assumptions: [{ assumptionId: "assumption_runway", statement: "Cash and burn are user-supplied assumptions.", requiresConfirmation: true }],
    missingInputs: [],
    riskFlags: [],
    evidenceRequirements: []
  };

  return {
    ...envelope,
    ...overrides
  };
}

describe("FinanceFinalResponseEnvelope", () => {
  const mod = loadModule(["../../../Data/marion/runtime/finance/layer09_final_response/FinanceFinalResponseEnvelope.js", "../../../FinanceFinalResponseEnvelope.js", "../../../finance/FinanceFinalResponseEnvelope.js", "../../../finance/layer09_final_response/FinanceFinalResponseEnvelope.js", "../../../Data/finance/layer09_final_response/FinanceFinalResponseEnvelope.js", "../../../Data/Domains/finance/layer09_final_response/FinanceFinalResponseEnvelope.js", "../../../Domains/finance/layer09_final_response/FinanceFinalResponseEnvelope.js"]);
  const FinanceFinalResponseEnvelope = pickExport(mod, ["FinanceFinalResponseEnvelope", "FinalResponseEnvelope"]);

  function callEnvelopeFactory(EnvelopeClass, payload) {
    if (typeof EnvelopeClass.create === "function") return EnvelopeClass.create(payload);
    if (typeof EnvelopeClass.build === "function") return EnvelopeClass.build(payload);
    return new EnvelopeClass(payload);
  }

  test("constructs or creates without throwing", () => {
    expect(() => callEnvelopeFactory(FinanceFinalResponseEnvelope, { finalResponseText: "Based on evidence, gross margin is 40%." })).not.toThrow();
  });

  test("creates stable Layer 09 metadata and final response fields", () => {
    const envelope = callEnvelopeFactory(FinanceFinalResponseEnvelope, {
      requestId: "final-response-001",
      originalQuery: "Render final finance answer.",
      finalResponseText: "Based on evidence, gross margin is 40%.",
      renderedSections: [{ sectionType: "safe_findings", renderedText: "Gross margin is 40%." }],
      finalResponseBlocks: [{ blockType: "findings", text: "Gross margin is 40%." }],
      caveatsApplied: [],
      blockedClaims: [],
      toneGuardFindings: []
    });

    expect(envelope.domain).toBe("finance");
    expect(envelope.runtimeLayer).toBe("layer09_final_response");
    expect(envelope.finalResponseText).toContain("gross margin");
    expectDeepKey(envelope, ["responseReadiness", "nextLayerHandoff", "diagnostics"]);
  });

  test("marks response as blocked when blocking claims remain", () => {
    const envelope = callEnvelopeFactory(FinanceFinalResponseEnvelope, {
      finalResponseText: "Based on evidence, some results are blocked.",
      renderedSections: [{ sectionType: "blocked_items", renderedText: "Blocked item." }],
      finalResponseBlocks: [],
      caveatsApplied: [],
      blockedClaims: [{ blockedClaimId: "b1", code: "valuation_pe", severity: "blocking" }],
      toneGuardFindings: []
    });

    expect(envelope.responseReadiness.status).toBe("response_rendered_with_blocks");
    expect(envelope.nextLayerHandoff.requiresReviewBeforeDelivery).toBe(true);
  });

  test("validates required final response shape", () => {
    const envelope = callEnvelopeFactory(FinanceFinalResponseEnvelope, {
      finalResponseText: "Based on evidence, gross margin is 40%.",
      renderedSections: [],
      finalResponseBlocks: [],
      caveatsApplied: [],
      blockedClaims: [],
      toneGuardFindings: []
    });

    if (typeof FinanceFinalResponseEnvelope.validate === "function") {
      const validation = FinanceFinalResponseEnvelope.validate(envelope);
      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    } else {
      expect(envelope.nextLayerHandoff).toBeTruthy();
    }
  });

  test("output is JSON-serializable", () => {
    const envelope = callEnvelopeFactory(FinanceFinalResponseEnvelope, { finalResponseText: "Based on evidence." });
    expect(() => JSON.stringify(envelope)).not.toThrow();
  });
});
