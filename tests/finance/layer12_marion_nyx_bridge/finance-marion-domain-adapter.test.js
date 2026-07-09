"use strict";

const {
  loadModule,
  pickExport,
  callFirst,
  flattenStrings,
  expectDeepKey,
  sampleFinanceAdapterRequest,
  sampleNonFinanceRequest,
  makeFakeOrchestrator,
  makeFailingOrchestrator
} = require("./finance-layer12-test-utils");

describe("FinanceMarionDomainAdapter", () => {
  const mod = loadModule([
    "../../../Data/marion/runtime/finance/layer12_marion_nyx_bridge/FinanceMarionDomainAdapter.js",
    "../../../FinanceMarionDomainAdapter.js",
    "../../../finance/FinanceMarionDomainAdapter.js",
    "../../../finance/layer12_marion_nyx_bridge/FinanceMarionDomainAdapter.js",
    "../../../Data/finance/layer12_marion_nyx_bridge/FinanceMarionDomainAdapter.js",
    "../../../Data/Domains/finance/layer12_marion_nyx_bridge/FinanceMarionDomainAdapter.js",
    "../../../Domains/finance/layer12_marion_nyx_bridge/FinanceMarionDomainAdapter.js"
  ]);

  const FinanceMarionDomainAdapter = pickExport(mod, [
    "FinanceMarionDomainAdapter",
    "MarionDomainAdapter"
  ]);

  test("constructs without throwing with fake Layer 11 orchestrator", () => {
    expect(() => new FinanceMarionDomainAdapter({
      orchestrator: makeFakeOrchestrator()
    })).not.toThrow();
  });

  test("routes finance request through Layer 11 bridge and returns Layer 12 adapter envelope", () => {
    const orchestrator = makeFakeOrchestrator();
    const adapter = new FinanceMarionDomainAdapter({ orchestrator });

    const result = callFirst(
      adapter,
      ["adapt", "handle", "route", "run", "execute", "process"],
      sampleFinanceAdapterRequest()
    );

    expect(orchestrator.calls.length).toBe(1);
    expect(result.domain).toBe("finance");
    expect(result.runtimeLayer).toBe("layer12_marion_nyx_bridge");
    expect(result.routeStatus).toBe("finance_ready_with_caveats");
    expect(result.bridgeReadiness.status).toBe("adapter_ready_with_caveats");

    expect(result.domainDecision.shouldRouteToFinance).toBe(true);
    expect(result.runtimeBridge.bridgeStatus).toBe("bridge_ready_with_caveats");
    expect(result.orchestrationEnvelope.runtimeLayer).toBe("layer11_runtime_orchestration");

    expect(result.marionResponse.replyText).toContain("gross margin");
    expect(result.nyxResponse.widgetReady).toBe(true);

    expectDeepKey(result, [
      "domainDecision",
      "runtimeBridge",
      "orchestrationEnvelope",
      "marionResponse",
      "nyxResponse",
      "bridgeReadiness",
      "nextLayerHandoff"
    ]);
  });

  test("bypasses non-finance request to default Marion/Nyx router", () => {
    const orchestrator = makeFakeOrchestrator();
    const adapter = new FinanceMarionDomainAdapter({ orchestrator });

    const result = callFirst(
      adapter,
      ["adapt", "handle", "route", "run", "execute", "process"],
      sampleNonFinanceRequest()
    );

    expect(orchestrator.calls.length).toBe(0);
    expect(result.routeStatus).toBe("pass_to_default_router");
    expect(result.bridgeReadiness.status).toBe("adapter_bypassed_to_default_router");
    expect(result.marionResponse.replyText).toContain("default Marion/Nyx router");
    expect(result.nextLayerHandoff.canReturnToMarion).toBe(true);
  });

  test("returns fallback response when Layer 11 bridge fails", () => {
    const adapter = new FinanceMarionDomainAdapter({
      orchestrator: makeFailingOrchestrator()
    });

    const result = callFirst(
      adapter,
      ["adapt", "handle", "route", "run", "execute", "process"],
      sampleFinanceAdapterRequest()
    );

    expect(result.routeStatus).toBe("finance_failed");
    expect(result.bridgeReadiness.status).toBe("adapter_failed");
    expect(result.nextLayerHandoff.requiresHumanReview).toBe(true);
    expect(result.marionResponse.replyText).toContain("could not complete");

    const strings = flattenStrings(result).join(" ");
    expect(strings).toContain("forced_layer12_orchestrator_failure");
  });

  test("static adapt helper works", () => {
    const result = FinanceMarionDomainAdapter.adapt(sampleFinanceAdapterRequest(), {
      orchestrator: makeFakeOrchestrator()
    });

    expect(result.domain).toBe("finance");
    expect(result.runtimeLayer).toBe("layer12_marion_nyx_bridge");
    expect(result.routeStatus).toBe("finance_ready_with_caveats");
  });

  test("output is JSON-serializable", () => {
    const adapter = new FinanceMarionDomainAdapter({
      orchestrator: makeFakeOrchestrator()
    });

    const result = callFirst(
      adapter,
      ["adapt", "handle", "route", "run", "execute", "process"],
      sampleFinanceAdapterRequest()
    );

    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
