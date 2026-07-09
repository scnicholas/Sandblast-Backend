"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings
} = require("./finance-layer12-test-utils");

describe("FinanceDomainFallbackRouter", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer12_marion_nyx_bridge/FinanceDomainFallbackRouter.js",
    "../../../FinanceDomainFallbackRouter.js",
    "../../../finance/FinanceDomainFallbackRouter.js",
    "../../../finance/layer12_marion_nyx_bridge/FinanceDomainFallbackRouter.js",
    "../../../Data/finance/layer12_marion_nyx_bridge/FinanceDomainFallbackRouter.js",
    "../../../Data/Domains/finance/layer12_marion_nyx_bridge/FinanceDomainFallbackRouter.js",
    "../../../Domains/finance/layer12_marion_nyx_bridge/FinanceDomainFallbackRouter.js"
  ]);

  const FinanceDomainFallbackRouter = pickExport(mod, [
    "FinanceDomainFallbackRouter",
    "DomainFallbackRouter"
  ]);

  test("constructs without throwing", () => {
    expect(() => new FinanceDomainFallbackRouter()).not.toThrow();
  });

  test("preflight bypasses finance when domain decision says not finance", () => {
    const router = new FinanceDomainFallbackRouter();

    const result = router.preflight({
      domainDecision: {
        shouldRouteToFinance: false,
        routeReason: "finance_route_not_confident"
      }
    });

    expect(result.shouldBypassFinance).toBe(true);
    expect(result.shouldUseFallbackResponse).toBe(true);
    expect(result.routeStatus).toBe("pass_to_default_router");
    expect(result.fallbackText).toContain("default Marion/Nyx router");
  });

  test("preflight routes to finance when decision approves finance", () => {
    const router = new FinanceDomainFallbackRouter();

    const result = router.preflight({
      domainDecision: {
        shouldRouteToFinance: true,
        routeReason: "finance_route:finance_ratio_analysis"
      }
    });

    expect(result.shouldBypassFinance).toBe(false);
    expect(result.shouldUseFallbackResponse).toBe(false);
    expect(result.routeStatus).toBe("route_to_finance");
  });

  test("postflight marks finance-ready-with-caveats path", () => {
    const router = new FinanceDomainFallbackRouter();

    const result = callFirst(router, ["postflight", "route", "run", "execute", "process"], {
      runtimeBridge: {
        bridgeStatus: "bridge_ready_with_caveats"
      },
      orchestrationEnvelope: {
        pipelineStatus: "completed_with_caveats",
        nextLayerHandoff: {
          canReturnToMarionWithCaveats: true
        }
      }
    });

    expect(result.routeStatus).toBe("finance_ready_with_caveats");
    expect(result.shouldUseFallbackResponse).toBe(false);
    expect(result.diagnostics.warnings).toContain("finance_response_has_caveats");
  });

  test("postflight creates failure fallback when bridge fails", () => {
    const router = new FinanceDomainFallbackRouter();

    const result = callFirst(router, ["postflight", "route", "run", "execute", "process"], {
      runtimeBridge: {
        bridgeStatus: "bridge_failed"
      },
      orchestrationEnvelope: {
        pipelineStatus: "failed",
        nextLayerHandoff: {
          failed: true
        }
      }
    });

    expect(result.routeStatus).toBe("finance_failed");
    expect(result.shouldUseFallbackResponse).toBe(true);
    expect(result.requiresHumanReview).toBe(true);

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("finance_runtime_failed");
  });

  test("postflight marks request_more_evidence when orchestration requires evidence", () => {
    const router = new FinanceDomainFallbackRouter();

    const result = callFirst(router, ["postflight", "route", "run", "execute", "process"], {
      runtimeBridge: {
        bridgeStatus: "bridge_requires_more_evidence"
      },
      orchestrationEnvelope: {
        pipelineStatus: "requires_more_evidence",
        nextLayerHandoff: {
          requiresMoreEvidence: true
        }
      }
    });

    expect(result.routeStatus).toBe("request_more_evidence");
    expect(result.requiresMoreEvidence).toBe(true);
  });

  test("output is JSON-serializable", () => {
    const router = new FinanceDomainFallbackRouter();
    const result = router.preflight({
      domainDecision: {
        shouldRouteToFinance: false
      }
    });

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
