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

  throw new Error(
    `Unable to load module from candidates:\n${errors.join("\n")}`
  );
}

function pickExport(mod, names) {
  if (typeof mod === "function") return mod;
  if (mod && typeof mod.default === "function") return mod.default;

  for (const name of names) {
    if (mod && typeof mod[name] === "function") {
      return mod[name];
    }
  }

  throw new Error(`Unable to resolve export. Available keys: ${Object.keys(mod || {}).join(", ")}`);
}

function callFirst(target, methodNames, ...args) {
  for (const methodName of methodNames) {
    if (target && typeof target[methodName] === "function") {
      return target[methodName](...args);
    }
  }

  throw new Error(
    `None of the expected methods exist: ${methodNames.join(", ")}`
  );
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

function sampleLayer06Envelope(overrides = {}) {
  const source = {
    sourceId: "src_user_query",
    sourceType: "user_query",
    sourceLabel: "user_query",
    authorityClass: "user_supplied",
    requiresVerification: false
  };

  const filingSource = {
    sourceId: "src_annual_report",
    sourceType: "regulatory_filing",
    sourceLabel: "annual_report",
    authorityClass: "primary",
    requiresVerification: false
  };

  const normalizedMetrics = [
    {
      normalizedMetricId: "m_revenue_a_2024",
      canonicalMetric: "revenue",
      value: 1200,
      unit: "currency",
      period: "FY2024",
      entityId: "apple",
      sourceId: "src_annual_report",
      sourceType: "regulatory_filing",
      sourceLabel: "annual_report",
      sourceInputId: "line_revenue_fy2024",
      verificationRequired: false
    },
    {
      normalizedMetricId: "m_gross_profit_a_2024",
      canonicalMetric: "gross_profit",
      value: 480,
      unit: "currency",
      period: "FY2024",
      entityId: "apple",
      sourceId: "src_annual_report",
      sourceType: "regulatory_filing",
      sourceLabel: "annual_report",
      sourceInputId: "line_gp_fy2024",
      verificationRequired: false
    },
    {
      normalizedMetricId: "m_revenue_a_2023",
      canonicalMetric: "revenue",
      value: 1000,
      unit: "currency",
      period: "FY2023",
      entityId: "apple",
      sourceId: "src_annual_report",
      sourceType: "regulatory_filing",
      sourceLabel: "annual_report",
      sourceInputId: "line_revenue_fy2023",
      verificationRequired: false
    },
    {
      normalizedMetricId: "m_revenue_msft_2024",
      canonicalMetric: "revenue",
      value: 1600,
      unit: "currency",
      period: "FY2024",
      entityId: "microsoft",
      sourceId: "src_annual_report",
      sourceType: "regulatory_filing",
      sourceLabel: "annual_report",
      sourceInputId: "line_msft_revenue_fy2024",
      verificationRequired: false
    },
    {
      normalizedMetricId: "m_cash_a_2024",
      canonicalMetric: "cash_and_equivalents",
      value: 300,
      unit: "currency",
      period: "FY2024",
      entityId: "apple",
      sourceId: "src_user_query",
      sourceType: "user_query",
      sourceLabel: "user_query",
      sourceInputId: "cash_assumption",
      verificationRequired: false
    },
    {
      normalizedMetricId: "m_burn_a_2024",
      canonicalMetric: "monthly_burn",
      value: 50,
      unit: "currency",
      period: "FY2024",
      entityId: "apple",
      sourceId: "src_user_query",
      sourceType: "user_query",
      sourceLabel: "user_query",
      sourceInputId: "burn_assumption",
      verificationRequired: false
    },
    {
      normalizedMetricId: "m_pe_a_2024",
      canonicalMetric: "price_earnings_ratio",
      value: 30,
      unit: "multiple",
      period: "FY2024",
      entityId: "apple",
      sourceId: "src_user_query",
      sourceType: "user_query",
      sourceLabel: "user_query",
      sourceInputId: "pe_user_supplied",
      verificationRequired: true
    }
  ];

  const envelope = {
    requestId: "test-layer07-request",
    traceId: "test-layer06-trace",
    schemaVersion: "1.0.0",
    version: "1.0.0",
    envelopeVersion: "1.0.0",
    envelopeType: "finance_analysis_execution_envelope",
    domain: "finance",
    layer: "R18D_layer06_finance_analysis_execution",
    runtimeLayer: "layer06_analysis_execution",
    queryContext: {
      originalQuery: "Compare Apple revenue trend and bind evidence for gross margin and runway.",
      normalizedQuery: "compare apple revenue trend and bind evidence for gross margin and runway"
    },
    normalizedMetrics,
    normalizedEntities: {
      companies: [
        { entityId: "apple", canonicalName: "Apple Inc.", ticker: "AAPL" },
        { entityId: "microsoft", canonicalName: "Microsoft Corporation", ticker: "MSFT" }
      ],
      businessNames: [],
      programs: [],
      jurisdictions: [],
      sources: []
    },
    normalizedPeriods: [
      { periodId: "p_fy2023", canonicalPeriod: "FY2023", periodType: "fiscal_year" },
      { periodId: "p_fy2024", canonicalPeriod: "FY2024", periodType: "fiscal_year" }
    ],
    normalizedSources: [source, filingSource],
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
      warnings: [],
      executableResultCounts: {
        ratios: 1,
        trends: 1,
        peerComparisons: 1,
        scenarios: 1,
        valuations: 1
      }
    },
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
          executionStatus: "comparison_calculated",
          observations: [
            { metric: { sourceMetricId: "m_revenue_a_2024" } },
            { metric: { sourceMetricId: "m_revenue_msft_2024" } }
          ]
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
    riskFlags: [],
    evidenceRequirements: [
      {
        requirementCode: "official_financial_statement_source",
        priority: "recommended",
        reason: "Financial statement analysis should be grounded in issuer filings.",
        acceptableSources: ["annual report", "issuer filing"],
        blockingWithoutEvidence: false
      },
      {
        requirementCode: "scenario_assumption_disclosure",
        priority: "required",
        reason: "Scenario analysis requires assumption disclosure.",
        acceptableSources: ["user supplied assumptions", "scenario table"],
        blockingWithoutEvidence: false
      },
      {
        requirementCode: "current_market_price_source",
        priority: "required",
        reason: "Valuation needs market data.",
        acceptableSources: ["market data provider"],
        blockingWithoutEvidence: true
      }
    ],
    assumptions: [
      {
        assumptionId: "assumption_runway",
        statement: "Cash and burn are user-supplied assumptions.",
        requiresConfirmation: true
      }
    ],
    missingInputs: []
  };

  return {
    ...envelope,
    ...overrides
  };
}

describe("FinanceVerificationGapDetector", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer07_evidence_binding/FinanceVerificationGapDetector.js",
    "../../../FinanceVerificationGapDetector.js",
    "../../../finance/FinanceVerificationGapDetector.js",
    "../../../finance/layer07_evidence_binding/FinanceVerificationGapDetector.js",
    "../../../Data/finance/layer07_evidence_binding/FinanceVerificationGapDetector.js",
    "../../../Data/Domains/finance/layer07_evidence_binding/FinanceVerificationGapDetector.js",
    "../../../Domains/finance/layer07_evidence_binding/FinanceVerificationGapDetector.js"
  ]);

  const FinanceVerificationGapDetector = pickExport(mod, [
    "FinanceVerificationGapDetector",
    "VerificationGapDetector"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceVerificationGapDetector()).not.toThrow();
  });

  test("detects unsupported and blocked evidence gaps", () => {
    const detector = new FinanceVerificationGapDetector();

    const result = callFirst(
      detector,
      ["detect", "detectGaps", "run", "execute", "process"],
      {
        resultSupportScores: [
          {
            resultId: "unsupported_ratio",
            supportStatus: "unsupported",
            shouldCaveat: false
          },
          {
            resultId: "blocked_valuation",
            supportStatus: "blocked_pending_evidence",
            shouldCaveat: false
          }
        ],
        sourceRequirementMap: [],
        boundEvidence: { evidenceBoundResults: [] },
        normalizedSources: [],
        normalizedMetrics: [],
        assumptions: [],
        riskFlags: []
      }
    );

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("unsupported_result");
    expect(strings).toContain("blocked_result");
    expect(result.diagnostics.ok).toBe(false);
  });

  test("detects required source gaps when mapped requirement has no linked source", () => {
    const detector = new FinanceVerificationGapDetector();

    const result = callFirst(
      detector,
      ["detect", "detectGaps", "run", "execute", "process"],
      {
        resultSupportScores: [],
        sourceRequirementMap: [
          {
            requirementCode: "current_market_price_source",
            priority: "required",
            blockingWithoutEvidence: true,
            appliesToResultTypes: ["valuation"],
            appliesToResultNames: [],
            appliesToResultIds: []
          }
        ],
        boundEvidence: {
          evidenceBoundResults: [
            {
              resultId: "valuation_pe",
              resultType: "valuation",
              resultName: "price_earnings_ratio",
              linkedSources: []
            }
          ]
        },
        normalizedSources: [],
        normalizedMetrics: [],
        assumptions: [],
        riskFlags: []
      }
    );

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("required_source_missing");
    expect(result.diagnostics.ok).toBe(false);
  });

  test("detects assumption confirmation and metric lineage caveat gaps", () => {
    const detector = new FinanceVerificationGapDetector();

    const result = callFirst(
      detector,
      ["detect", "detectGaps", "run", "execute", "process"],
      {
        resultSupportScores: [],
        sourceRequirementMap: [],
        boundEvidence: { evidenceBoundResults: [] },
        normalizedSources: [{ sourceId: "s1", sourceLabel: "unknown", authorityClass: "unknown" }],
        normalizedMetrics: [{ normalizedMetricId: "m1", canonicalMetric: "revenue" }],
        assumptions: [{ assumptionId: "a1", requiresConfirmation: true }],
        riskFlags: []
      }
    );

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("assumption_requires_confirmation");
    expect(strings).toContain("metric_source_lineage_missing");
    expect(strings).toContain("unknown_source_authority");
  });

  test("output is JSON-serializable", () => {
    const detector = new FinanceVerificationGapDetector();
    const result = callFirst(
      detector,
      ["detect", "detectGaps", "run", "execute", "process"],
      sampleLayer06Envelope()
    );

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
