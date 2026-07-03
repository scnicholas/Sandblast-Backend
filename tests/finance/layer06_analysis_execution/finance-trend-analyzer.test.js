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

function flattenStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value.toLowerCase());
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => flattenStrings(item, output));
    return output;
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => flattenStrings(item, output));
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

function sampleLayer05Envelope(overrides = {}) {
  const companyA = {
    entityId: "fin_entity_company_apple_1",
    entityType: "company",
    canonicalName: "Apple Inc.",
    ticker: "AAPL",
    market: "USA"
  };

  const companyB = {
    entityId: "fin_entity_company_microsoft_2",
    entityType: "company",
    canonicalName: "Microsoft Corporation",
    ticker: "MSFT",
    market: "USA"
  };

  const normalizedMetrics = [
    {
      normalizedMetricId: "m_revenue_a_2023",
      canonicalMetric: "revenue",
      originalMetric: "revenue",
      value: 1000,
      unit: "currency",
      currency: "USD",
      period: "FY2023",
      entityId: companyA.entityId,
      confidence: 0.9
    },
    {
      normalizedMetricId: "m_revenue_a_2024",
      canonicalMetric: "revenue",
      originalMetric: "revenue",
      value: 1200,
      unit: "currency",
      currency: "USD",
      period: "FY2024",
      entityId: companyA.entityId,
      confidence: 0.9
    },
    {
      normalizedMetricId: "m_revenue_b_2024",
      canonicalMetric: "revenue",
      originalMetric: "revenue",
      value: 1600,
      unit: "currency",
      currency: "USD",
      period: "FY2024",
      entityId: companyB.entityId,
      confidence: 0.9
    },
    {
      normalizedMetricId: "m_gross_profit_a_2024",
      canonicalMetric: "gross_profit",
      originalMetric: "gross profit",
      value: 480,
      unit: "currency",
      currency: "USD",
      period: "FY2024",
      entityId: companyA.entityId,
      confidence: 0.88
    },
    {
      normalizedMetricId: "m_net_income_a_2024",
      canonicalMetric: "net_income",
      originalMetric: "net income",
      value: 260,
      unit: "currency",
      currency: "USD",
      period: "FY2024",
      entityId: companyA.entityId,
      confidence: 0.88
    },
    {
      normalizedMetricId: "m_cash_a_2024",
      canonicalMetric: "cash_and_equivalents",
      originalMetric: "cash",
      value: 300,
      unit: "currency",
      currency: "USD",
      period: "FY2024",
      entityId: companyA.entityId,
      confidence: 0.84
    },
    {
      normalizedMetricId: "m_burn_a_2024",
      canonicalMetric: "monthly_burn",
      originalMetric: "monthly burn",
      value: 50,
      unit: "currency",
      currency: "USD",
      period: "FY2024",
      entityId: companyA.entityId,
      confidence: 0.8
    },
    {
      normalizedMetricId: "m_decline_a_2024",
      canonicalMetric: "revenue_decline",
      originalMetric: "revenue decline",
      value: 25,
      unit: "percent",
      period: "FY2024",
      entityId: companyA.entityId,
      confidence: 0.75
    },
    {
      normalizedMetricId: "m_eps_a_2024",
      canonicalMetric: "eps",
      originalMetric: "eps",
      value: 6,
      unit: "currency",
      currency: "USD",
      period: "FY2024",
      entityId: companyA.entityId,
      confidence: 0.84
    },
    {
      normalizedMetricId: "m_pe_a_2024",
      canonicalMetric: "price_earnings_ratio",
      originalMetric: "pe ratio",
      value: 30,
      unit: "multiple",
      period: "FY2024",
      entityId: companyA.entityId,
      confidence: 0.82
    }
  ];

  const envelope = {
    requestId: "test-layer06-request",
    traceId: "test-layer05-trace",
    schemaVersion: "1.0.0",
    version: "1.0.0",
    envelopeVersion: "1.0.0",
    envelopeType: "finance_analysis_planning_envelope",
    domain: "finance",
    layer: "R18D_layer05_finance_analysis_planning",
    runtimeLayer: "layer05_analysis_planning",
    queryContext: {
      originalQuery: "Compare Apple and Microsoft revenue trend and analyze cash runway for FY2023 and FY2024.",
      normalizedQuery: "compare apple and microsoft revenue trend and analyze cash runway for fy2023 and fy2024",
      claimTargets: []
    },
    normalizedMetrics,
    normalizedEntities: {
      companies: [companyA, companyB],
      businessNames: [],
      programs: [],
      jurisdictions: [{ canonicalName: "United States", entityType: "jurisdiction" }],
      sources: []
    },
    normalizedPeriods: [
      { periodId: "p_fy2023", canonicalPeriod: "FY2023", periodType: "fiscal_year" },
      { periodId: "p_fy2024", canonicalPeriod: "FY2024", periodType: "fiscal_year" }
    ],
    normalizedSources: [
      {
        sourceId: "source_user_query",
        sourceType: "user_supplied",
        sourceLabel: "user_query",
        authorityClass: "user_supplied",
        requiresVerification: false
      }
    ],
    analysisPlan: {
      planId: "fin_analysis_plan_peer_comparison",
      primaryRoute: "peer_comparison",
      secondaryRoutes: ["trend_comparison", "business_survival_scenario", "valuation_analysis"],
      analysisSteps: ["align_entities", "align_periods", "compare_normalized_metrics"],
      readinessStatus: "analysis_planned",
      confidence: 0.86
    },
    ratioMap: {
      ratioCandidates: [
        {
          ratioId: "fin_ratio_gross_margin",
          ratioType: "gross_margin",
          family: "profitability",
          formula: "gross_profit / revenue",
          requiredMetrics: ["gross_profit", "revenue"],
          presentMetrics: ["gross_profit", "revenue"],
          missingMetrics: [],
          calculationStatus: "calculable"
        },
        {
          ratioId: "fin_ratio_net_margin",
          ratioType: "net_margin",
          family: "profitability",
          formula: "net_income / revenue",
          requiredMetrics: ["net_income", "revenue"],
          presentMetrics: ["net_income", "revenue"],
          missingMetrics: [],
          calculationStatus: "calculable"
        }
      ],
      directlyProvidedRatios: [
        {
          ratioId: "fin_ratio_direct_price_earnings_ratio",
          ratioType: "price_earnings_ratio",
          value: 30,
          unit: "multiple",
          sourceMetricId: "m_pe_a_2024",
          calculationStatus: "direct_value_available"
        }
      ],
      calculableRatios: [],
      partiallyAvailableRatios: [],
      unavailableRatios: []
    },
    scenarioFrame: {
      scenarioRequired: true,
      scenarioTypes: ["cash_runway_survival", "revenue_shock"],
      primaryScenarioType: "cash_runway_survival",
      readinessStatus: "scenario_ready"
    },
    riskFlags: [],
    evidenceRequirements: [
      {
        requirementCode: "official_financial_statement_source",
        priority: "recommended",
        blockingWithoutEvidence: false
      }
    ],
    assumptions: [
      {
        assumptionId: "assumption_decline",
        statement: "Assume revenue drops 25%.",
        requiresConfirmation: true,
        confidence: 0.78
      }
    ],
    missingInputs: [],
    analysisReadiness: {
      status: "ready_for_execution",
      score: 0.82,
      blockingIssues: [],
      warnings: []
    }
  };

  return {
    ...envelope,
    ...overrides
  };
}

describe("FinanceTrendAnalyzer", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer06_analysis_execution/FinanceTrendAnalyzer.js",
    "../../../FinanceTrendAnalyzer.js",
    "../../../finance/FinanceTrendAnalyzer.js",
    "../../../finance/layer06_analysis_execution/FinanceTrendAnalyzer.js",
    "../../../Data/finance/layer06_analysis_execution/FinanceTrendAnalyzer.js",
    "../../../Data/Domains/finance/layer06_analysis_execution/FinanceTrendAnalyzer.js",
    "../../../Domains/finance/layer06_analysis_execution/FinanceTrendAnalyzer.js"
  ]);

  const FinanceTrendAnalyzer = pickExport(mod, ["FinanceTrendAnalyzer", "TrendAnalyzer"]);

  test("constructs without throwing", () => {
    expect(() => new FinanceTrendAnalyzer()).not.toThrow();
  });

  test("calculates period-over-period trend from normalized metrics", () => {
    const analyzer = new FinanceTrendAnalyzer();
    const envelope = sampleLayer05Envelope();

    const result = callFirst(analyzer, ["analyze", "analyzeTrends", "run", "execute", "process"], {
      queryText: envelope.queryContext.originalQuery,
      analysisPlan: envelope.analysisPlan,
      normalizedMetrics: envelope.normalizedMetrics,
      normalizedPeriods: envelope.normalizedPeriods
    });

    expect(result).toBeTruthy();
    expect(result.trendResults.executableTrends.length).toBeGreaterThan(0);

    const revenueTrend = result.trendResults.trendLines.find((item) => item.canonicalMetric === "revenue");
    expect(revenueTrend).toBeTruthy();
    expect(revenueTrend.trendDirection).toBe("increased");
    expect(revenueTrend.absoluteChange).toBe(200);
  });

  test("flags insufficient trend when fewer than two numeric periods exist", () => {
    const analyzer = new FinanceTrendAnalyzer();

    const result = callFirst(analyzer, ["analyze", "analyzeTrends", "run", "execute", "process"], {
      queryText: "Show revenue trend.",
      analysisPlan: { primaryRoute: "trend_comparison", secondaryRoutes: [] },
      normalizedPeriods: [{ canonicalPeriod: "FY2024" }],
      normalizedMetrics: [
        { normalizedMetricId: "m1", canonicalMetric: "revenue", value: 1000, period: "FY2024" }
      ]
    });

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("insufficient_numeric_periods");
    expect(strings).toContain("not_enough_numeric_periods");
  });

  test("detects trend requirement from multiple normalized periods", () => {
    const analyzer = new FinanceTrendAnalyzer();
    const envelope = sampleLayer05Envelope({ analysisPlan: { primaryRoute: "peer_comparison", secondaryRoutes: [] } });

    const result = callFirst(analyzer, ["analyze", "analyzeTrends", "run", "execute", "process"], {
      queryText: "Compare revenue.",
      analysisPlan: envelope.analysisPlan,
      normalizedMetrics: envelope.normalizedMetrics,
      normalizedPeriods: envelope.normalizedPeriods
    });

    expect(result.trendResults.trendRequired).toBe(true);
  });

  test("output is JSON-serializable", () => {
    const analyzer = new FinanceTrendAnalyzer();
    const envelope = sampleLayer05Envelope();
    const result = callFirst(analyzer, ["analyze", "analyzeTrends", "run", "execute", "process"], envelope);
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
