"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  sampleFinanceAdapterRequest,
  sampleNonFinanceRequest
} = require("./finance-layer12-test-utils");

describe("FinanceDomainIntentMapper", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer12_marion_nyx_bridge/FinanceDomainIntentMapper.js",
    "../../../FinanceDomainIntentMapper.js",
    "../../../finance/FinanceDomainIntentMapper.js",
    "../../../finance/layer12_marion_nyx_bridge/FinanceDomainIntentMapper.js",
    "../../../Data/finance/layer12_marion_nyx_bridge/FinanceDomainIntentMapper.js",
    "../../../Data/Domains/finance/layer12_marion_nyx_bridge/FinanceDomainIntentMapper.js",
    "../../../Domains/finance/layer12_marion_nyx_bridge/FinanceDomainIntentMapper.js"
  ]);

  const FinanceDomainIntentMapper = pickExport(mod, [
    "FinanceDomainIntentMapper",
    "DomainIntentMapper"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceDomainIntentMapper()).not.toThrow();
  });

  test("routes clear finance ratio requests into finance", () => {
    const mapper = new FinanceDomainIntentMapper();
    const result = callFirst(mapper, ["map", "detect", "classify", "route", "run", "process"], sampleFinanceAdapterRequest());

    expect(result.domain).toBe("finance");
    expect(result.runtimeLayer).toBe("layer12_marion_nyx_bridge");
    expect(result.shouldRouteToFinance).toBe(true);
    expect(result.intent).toBe("finance_ratio_analysis");
    expect(result.confidence).toBeGreaterThanOrEqual(0.42);
    expect(result.matchedSignals.length).toBeGreaterThan(0);
  });

  test("routes explicit finance domain requests even with limited wording", () => {
    const mapper = new FinanceDomainIntentMapper();
    const result = callFirst(mapper, ["map", "detect", "classify", "route", "run", "process"], {
      originalQuery: "Review this.",
      domain: "finance"
    });

    expect(result.shouldRouteToFinance).toBe(true);
    expect(result.matchedSignals).toContain("explicit_finance_domain");
  });

  test("does not route clear non-finance creative request", () => {
    const mapper = new FinanceDomainIntentMapper();
    const result = callFirst(mapper, ["map", "detect", "classify", "route", "run", "process"], sampleNonFinanceRequest());

    expect(result.shouldRouteToFinance).toBe(false);
    expect(result.rejectedSignals).toContain("creative_primary_query");
    expect(result.routeReason).toContain("finance_route_rejected");
  });

  test("rejects explicit non-finance domain", () => {
    const mapper = new FinanceDomainIntentMapper();
    const result = callFirst(mapper, ["map", "detect", "classify", "route", "run", "process"], {
      originalQuery: "Calculate revenue growth.",
      domain: "law"
    });

    expect(result.shouldRouteToFinance).toBe(false);
    expect(result.rejectedSignals.some((item) => item.includes("explicit_non_finance_domain"))).toBe(true);
  });

  test("output is JSON-serializable", () => {
    const mapper = new FinanceDomainIntentMapper();
    const result = callFirst(mapper, ["map", "detect", "classify", "route", "run", "process"], sampleFinanceAdapterRequest());

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
