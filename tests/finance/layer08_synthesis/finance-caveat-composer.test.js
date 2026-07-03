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

function sampleLayer07Envelope(overrides = {}) {
  const baseEnvelope = {
    requestId: "test-layer08-request",
    traceId: "test-layer07-trace",
    schemaVersion: "1.0.0",
    version: "1.0.0",
    envelopeVersion: "1.0.0",
    envelopeType: "finance_evidence_binding_envelope",
    domain: "finance",
    layer: "R18D_layer07_finance_evidence_binding",
    runtimeLayer: "layer07_evidence_binding",
    queryContext: {
      originalQuery: "Prepare a finance answer for gross margin, revenue trend, runway, and valuation caveats.",
      normalizedQuery: "prepare a finance answer for gross margin revenue trend runway valuation caveats"
    },
    analysisPlan: {
      primaryRoute: "peer_comparison",
      secondaryRoutes: ["trend_comparison", "business_survival_scenario", "valuation_analysis"],
      readinessStatus: "analysis_planned"
    },
    analysisReadiness: {
      status: "ready_for_execution",
      score: 0.82,
      blockingIssues: [],
      warnings: []
    },
    executionQuality: {
      status: "executed",
      score: 0.78,
      blockingIssues: [],
      warnings: []
    },
    evidenceReadiness: {
      status: "needs_evidence_caveats",
      score: 0.68,
      boundResultCount: 5,
      supportedResultCount: 3,
      unsupportedResultCount: 1,
      blockingIssues: [],
      warnings: ["caveat_result:valuation_pe_direct"]
    },
    normalizationQuality: {
      status: "normalized",
      score: 0.88
    },
    ingestionQuality: {
      status: "ingested",
      score: 0.84
    },
    normalizedMetrics: [
      {
        normalizedMetricId: "m_revenue_a_2024",
        canonicalMetric: "revenue",
        value: 1200,
        unit: "currency",
        period: "FY2024",
        entityId: "apple",
        sourceId: "src_annual_report"
      },
      {
        normalizedMetricId: "m_gross_profit_a_2024",
        canonicalMetric: "gross_profit",
        value: 480,
        unit: "currency",
        period: "FY2024",
        entityId: "apple",
        sourceId: "src_annual_report"
      },
      {
        normalizedMetricId: "m_pe_a_2024",
        canonicalMetric: "price_earnings_ratio",
        value: 30,
        unit: "multiple",
        period: "FY2024",
        entityId: "apple",
        sourceId: "src_user_query",
        verificationRequired: true
      }
    ],
    normalizedEntities: {
      companies: [{ entityId: "apple", canonicalName: "Apple Inc.", ticker: "AAPL" }],
      businessNames: [],
      programs: [],
      jurisdictions: [],
      sources: []
    },
    normalizedPeriods: [
      { periodId: "p_fy2024", canonicalPeriod: "FY2024", periodType: "fiscal_year" }
    ],
    normalizedSources: [
      {
        sourceId: "src_annual_report",
        sourceType: "regulatory_filing",
        sourceLabel: "annual_report",
        authorityClass: "primary",
        requiresVerification: false
      },
      {
        sourceId: "src_user_query",
        sourceType: "user_query",
        sourceLabel: "user_query",
        authorityClass: "user_supplied",
        requiresVerification: false
      }
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
      ],
      directRatios: [
        {
          ratioExecutionId: "ratio_direct_pe",
          ratioType: "price_earnings_ratio",
          value: 30,
          unit: "multiple",
          executionStatus: "direct_ratio_value_available",
          sourceMetricId: "m_pe_a_2024"
        }
      ]
    },
    trendResults: {
      trendLines: [
        {
          trendId: "trend_revenue_apple",
          canonicalMetric: "revenue",
          entityId: "apple",
          executionStatus: "trend_calculated",
          trendDirection: "increased",
          absoluteChange: 200,
          observations: [
            { sourceMetricId: "m_revenue_a_2023", period: "FY2023", value: 1000 },
            { sourceMetricId: "m_revenue_a_2024", period: "FY2024", value: 1200 }
          ]
        }
      ]
    },
    peerComparison: {
      metricComparisons: [
        {
          comparisonId: "peer_revenue",
          canonicalMetric: "revenue",
          executionStatus: "comparison_calculated"
        }
      ]
    },
    scenarioResults: {
      scenarioOutputs: [
        {
          scenarioId: "scenario_cash_runway",
          scenarioType: "cash_runway",
          value: 6,
          unit: "months",
          executionStatus: "calculated",
          lineageContext: {
            sourceMetricIds: ["m_cash_a_2024", "m_burn_a_2024"]
          }
        }
      ]
    },
    valuationResults: {
      valuationChecks: [
        {
          valuationId: "valuation_pe_direct",
          valuationType: "price_earnings_ratio",
          value: 30,
          unit: "multiple",
          executionStatus: "direct_value_available",
          sourceMetricIds: ["m_pe_a_2024"]
        }
      ]
    },
    boundEvidence: {
      bindingId: "bind_001",
      evidenceBoundResults: [
        {
          resultId: "ratio_gross_margin",
          resultType: "ratio",
          resultName: "gross_margin",
          executionStatus: "calculated",
          value: 40,
          unit: "percent",
          linkedMetricIds: ["m_gross_profit_a_2024", "m_revenue_a_2024"],
          linkedSources: [
            { sourceId: "src_annual_report", authorityClass: "primary", requiresVerification: false }
          ],
          attachedRequirements: [
            { requirementCode: "official_financial_statement_source", priority: "recommended" }
          ],
          bindingStatus: "bound",
          sourceLineageComplete: true,
          requiresVerification: false
        },
        {
          resultId: "trend_revenue_apple",
          resultType: "trend",
          resultName: "revenue",
          executionStatus: "trend_calculated",
          value: null,
          unit: null,
          linkedMetricIds: ["m_revenue_a_2023", "m_revenue_a_2024"],
          linkedSources: [
            { sourceId: "src_annual_report", authorityClass: "primary", requiresVerification: false }
          ],
          attachedRequirements: [
            { requirementCode: "official_financial_statement_source", priority: "recommended" }
          ],
          bindingStatus: "bound",
          sourceLineageComplete: true,
          requiresVerification: false
        },
        {
          resultId: "peer_revenue",
          resultType: "peer_comparison",
          resultName: "revenue",
          executionStatus: "comparison_calculated",
          value: null,
          unit: null,
          linkedMetricIds: ["m_revenue_a_2024", "m_revenue_msft_2024"],
          linkedSources: [
            { sourceId: "src_annual_report", authorityClass: "primary", requiresVerification: false }
          ],
          attachedRequirements: [
            { requirementCode: "official_financial_statement_source", priority: "recommended" }
          ],
          bindingStatus: "bound",
          sourceLineageComplete: true,
          requiresVerification: false
        },
        {
          resultId: "scenario_cash_runway",
          resultType: "scenario",
          resultName: "cash_runway",
          executionStatus: "calculated",
          value: 6,
          unit: "months",
          linkedMetricIds: ["m_cash_a_2024", "m_burn_a_2024"],
          linkedSources: [
            { sourceId: "src_user_query", authorityClass: "user_supplied", requiresVerification: false }
          ],
          attachedRequirements: [
            { requirementCode: "scenario_assumption_disclosure", priority: "required" }
          ],
          bindingStatus: "bound",
          sourceLineageComplete: true,
          requiresVerification: false
        },
        {
          resultId: "valuation_pe_direct",
          resultType: "valuation",
          resultName: "price_earnings_ratio",
          executionStatus: "direct_value_available",
          value: 30,
          unit: "multiple",
          linkedMetricIds: ["m_pe_a_2024"],
          linkedSources: [
            { sourceId: "src_user_query", authorityClass: "user_supplied", requiresVerification: false }
          ],
          attachedRequirements: [
            { requirementCode: "current_market_price_source", priority: "required", blockingWithoutEvidence: true }
          ],
          bindingStatus: "bound",
          sourceLineageComplete: true,
          requiresVerification: true
        }
      ],
      byResultType: {},
      executionResultCount: 5,
      boundResultCount: 5
    },
    evidenceBoundResults: [],
    sourceRequirementMap: [
      {
        requirementCode: "official_financial_statement_source",
        priority: "recommended",
        appliesToResultTypes: ["ratio", "trend", "peer_comparison"],
        appliesToResultNames: [],
        appliesToResultIds: []
      },
      {
        requirementCode: "scenario_assumption_disclosure",
        priority: "required",
        appliesToResultTypes: ["scenario"],
        appliesToResultNames: [],
        appliesToResultIds: []
      },
      {
        requirementCode: "current_market_price_source",
        priority: "required",
        blockingWithoutEvidence: true,
        appliesToResultTypes: ["valuation"],
        appliesToResultNames: ["price_earnings_ratio"],
        appliesToResultIds: []
      }
    ],
    resultSupportScores: [
      {
        resultId: "ratio_gross_margin",
        resultType: "ratio",
        resultName: "gross_margin",
        supportScore: 0.86,
        supportStatus: "strong_support",
        canUseInFinalSynthesis: true,
        shouldCaveat: false
      },
      {
        resultId: "trend_revenue_apple",
        resultType: "trend",
        resultName: "revenue",
        supportScore: 0.82,
        supportStatus: "strong_support",
        canUseInFinalSynthesis: true,
        shouldCaveat: false
      },
      {
        resultId: "peer_revenue",
        resultType: "peer_comparison",
        resultName: "revenue",
        supportScore: 0.76,
        supportStatus: "adequate_support",
        canUseInFinalSynthesis: true,
        shouldCaveat: false
      },
      {
        resultId: "scenario_cash_runway",
        resultType: "scenario",
        resultName: "cash_runway",
        supportScore: 0.52,
        supportStatus: "partial_support",
        canUseInFinalSynthesis: true,
        shouldCaveat: true
      },
      {
        resultId: "valuation_pe_direct",
        resultType: "valuation",
        resultName: "price_earnings_ratio",
        supportScore: 0.48,
        supportStatus: "partial_support",
        canUseInFinalSynthesis: true,
        shouldCaveat: true
      }
    ],
    verificationGaps: [
      {
        gapCode: "caveat_result:valuation_pe_direct",
        severity: "low",
        reason: "Valuation multiple is user supplied and should be caveated.",
        remediation: "Carry evidence caveat into synthesis."
      },
      {
        gapCode: "assumption_requires_confirmation:assumption_runway",
        severity: "low",
        reason: "Runway scenario depends on unconfirmed assumptions.",
        remediation: "Carry assumption caveat into synthesis."
      }
    ],
    assumptions: [
      {
        assumptionId: "assumption_runway",
        statement: "Cash and burn are user-supplied assumptions.",
        requiresConfirmation: true
      }
    ],
    missingInputs: [],
    missing: [],
    riskFlags: [],
    evidenceRequirements: [
      {
        requirementCode: "official_financial_statement_source",
        priority: "recommended",
        acceptableSources: ["issuer filing"]
      },
      {
        requirementCode: "current_market_price_source",
        priority: "required",
        acceptableSources: ["market data provider"]
      }
    ],
    nextLayerHandoff: {
      canProceedToSynthesis: true,
      canProceedWithCaveats: true,
      requiresEvidenceVerification: true,
      requiresUserClarification: false,
      evidenceStatus: "needs_evidence_caveats"
    }
  };

  return {
    ...baseEnvelope,
    ...overrides
  };
}

describe("FinanceCaveatComposer", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer08_synthesis/FinanceCaveatComposer.js",
    "../../../FinanceCaveatComposer.js",
    "../../../finance/FinanceCaveatComposer.js",
    "../../../finance/layer08_synthesis/FinanceCaveatComposer.js",
    "../../../Data/finance/layer08_synthesis/FinanceCaveatComposer.js",
    "../../../Data/Domains/finance/layer08_synthesis/FinanceCaveatComposer.js",
    "../../../Domains/finance/layer08_synthesis/FinanceCaveatComposer.js"
  ]);

  const FinanceCaveatComposer = pickExport(mod, [
    "FinanceCaveatComposer",
    "CaveatComposer"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceCaveatComposer()).not.toThrow();
  });

  test("composes caveats from evidence readiness, verification gaps, and support scores", () => {
    const composer = new FinanceCaveatComposer();
    const result = callFirst(
      composer,
      ["compose", "composeCaveats", "run", "execute", "process"],
      sampleLayer07Envelope()
    );

    expect(result).toBeTruthy();
    expect(Array.isArray(result.caveats)).toBe(true);
    expect(result.caveats.length).toBeGreaterThan(0);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("caveat_result:valuation_pe_direct");
    expect(strings).toContain("partial_support");
  });

  test("builds assumption notes for unconfirmed assumptions", () => {
    const composer = new FinanceCaveatComposer();
    const result = callFirst(
      composer,
      ["compose", "composeCaveats", "run", "execute", "process"],
      sampleLayer07Envelope()
    );

    expect(result.assumptionNotes.length).toBeGreaterThan(0);
    expect(result.assumptionNotes[0].handling).toBe("carry_as_unconfirmed_assumption");
  });

  test("creates blocking caveats and blocked items when prior evidence is blocked", () => {
    const composer = new FinanceCaveatComposer();
    const result = callFirst(
      composer,
      ["compose", "composeCaveats", "run", "execute", "process"],
      sampleLayer07Envelope({
        evidenceReadiness: {
          status: "blocked_pending_evidence",
          blockingIssues: ["required_source_missing:current_market_price_source"],
          warnings: []
        },
        resultSupportScores: [
          {
            resultId: "valuation_pe_direct",
            supportStatus: "blocked_pending_evidence",
            shouldCaveat: false
          }
        ],
        verificationGaps: [
          {
            gapCode: "required_source_missing:current_market_price_source",
            severity: "blocking",
            reason: "Current market price source is missing."
          }
        ]
      })
    );

    expect(result.caveats.some((item) => item.severity === "blocking")).toBe(true);
    expect(result.blockedItems.length).toBeGreaterThan(0);
    expect(result.diagnostics.ok).toBe(false);
  });

  test("output is JSON-serializable", () => {
    const composer = new FinanceCaveatComposer();
    const result = callFirst(
      composer,
      ["compose", "composeCaveats", "run", "execute", "process"],
      sampleLayer07Envelope()
    );

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
