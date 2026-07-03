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

describe("FinanceRatioCalculator", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer06_analysis_execution/FinanceRatioCalculator.js",
    "../../../FinanceRatioCalculator.js",
    "../../../finance/FinanceRatioCalculator.js",
    "../../../finance/layer06_analysis_execution/FinanceRatioCalculator.js",
    "../../../Data/finance/layer06_analysis_execution/FinanceRatioCalculator.js",
    "../../../Data/Domains/finance/layer06_analysis_execution/FinanceRatioCalculator.js",
    "../../../Domains/finance/layer06_analysis_execution/FinanceRatioCalculator.js"
  ]);

  const FinanceRatioCalculator = pickExport(mod, ["FinanceRatioCalculator", "RatioCalculator"]);

  test("constructs without throwing", () => {
    expect(() => new FinanceRatioCalculator()).not.toThrow();
  });

  test("calculates profitability ratios when numeric normalized metrics are present", () => {
    const calculator = new FinanceRatioCalculator();
    const envelope = sampleLayer05Envelope();

    const result = callFirst(calculator, ["calculate", "calculateRatios", "run", "execute", "process"], {
      ratioMap: envelope.ratioMap,
      normalizedMetrics: envelope.normalizedMetrics
    });

    expect(result).toBeTruthy();
    expect(typeof result).toBe("object");

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("gross_margin");
    expect(strings).toContain("calculated");

    const gross = result.ratioResults.calculatedRatios.find((item) => item.ratioType === "gross_margin");
    expect(gross).toBeTruthy();
    expect(gross.value).toBe(40);
    expect(gross.unit).toBe("percent");
  });

  test("preserves direct ratio metrics such as PE ratio", () => {
    const calculator = new FinanceRatioCalculator();
    const envelope = sampleLayer05Envelope();

    const result = callFirst(calculator, ["calculate", "calculateRatios", "run", "execute", "process"], {
      ratioMap: envelope.ratioMap,
      normalizedMetrics: envelope.normalizedMetrics
    });

    expect(result.ratioResults.directRatios.length).toBeGreaterThan(0);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("price_earnings_ratio");
    expect(strings).toContain("direct_ratio_value_available");
  });

  test("returns partial state when ratio candidates lack numeric values", () => {
    const calculator = new FinanceRatioCalculator();

    const result = callFirst(calculator, ["calculate", "calculateRatios", "run", "execute", "process"], {
      ratioMap: {
        ratioCandidates: [
          {
            ratioType: "fcf_margin",
            formula: "free_cash_flow / revenue",
            requiredMetrics: ["free_cash_flow", "revenue"]
          }
        ]
      },
      normalizedMetrics: [
        { normalizedMetricId: "m1", canonicalMetric: "revenue", value: null }
      ]
    });

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("missing_values");
    expect(strings).toContain("free_cash_flow");
  });

  test("output is JSON-serializable", () => {
    const calculator = new FinanceRatioCalculator();
    const envelope = sampleLayer05Envelope();
    const result = callFirst(calculator, ["calculate", "calculateRatios", "run", "execute", "process"], {
      ratioMap: envelope.ratioMap,
      normalizedMetrics: envelope.normalizedMetrics
    });

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
