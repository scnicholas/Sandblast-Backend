"use strict";

/**
 * R18D Layer 12 — Finance Marion/Nyx Domain Adapter
 * Entry bridge between Marion/Nyx domain routing and the Finax Layer 11
 * end-to-end finance runtime.
 *
 * Boundary:
 * - Does not calculate finance metrics.
 * - Does not fetch finance data.
 * - Does not rewrite final finance conclusions.
 * - Does not override Layer 10 delivery policy.
 * - Does not suppress Layer 11 failures.
 *
 * No external dependencies.
 */

const { FinanceDomainIntentMapper } = require("./FinanceDomainIntentMapper");
const { FinanceNyxRuntimeBridge } = require("./FinanceNyxRuntimeBridge");
const { FinanceMarionResponseContractAdapter } = require("./FinanceMarionResponseContractAdapter");
const { FinanceDomainFallbackRouter } = require("./FinanceDomainFallbackRouter");
const { FinanceDomainAdapterEnvelope } = require("./FinanceDomainAdapterEnvelope");

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

class FinanceMarionDomainAdapter {
  constructor(options = {}) {
    this.intentMapper =
      options.intentMapper || new FinanceDomainIntentMapper(options);

    this.runtimeBridge =
      options.runtimeBridge || new FinanceNyxRuntimeBridge(options);

    this.responseContractAdapter =
      options.responseContractAdapter || new FinanceMarionResponseContractAdapter(options);

    this.fallbackRouter =
      options.fallbackRouter || new FinanceDomainFallbackRouter(options);
  }

  adapt(input = {}) {
    const normalizedInput = this.normalizeInput(input);

    const domainDecision = this.intentMapper.map({
      ...input,
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      originalQuery: normalizedInput.originalQuery,
      normalizedQuery: normalizedInput.normalizedQuery,
      queryContext: normalizedInput.queryContext
    });

    const preflightFallback = this.fallbackRouter.preflight({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      domainDecision,
      input: normalizedInput
    });

    if (preflightFallback.shouldBypassFinance) {
      const fallbackResponse = this.responseContractAdapter.fromFallback({
        requestId: normalizedInput.requestId,
        traceId: normalizedInput.traceId,
        fallback: preflightFallback,
        domainDecision
      });

      return FinanceDomainAdapterEnvelope.create({
        requestId: normalizedInput.requestId,
        traceId: normalizedInput.traceId,
        originalQuery: normalizedInput.originalQuery,
        normalizedQuery: normalizedInput.normalizedQuery,
        domainDecision,
        routeStatus: preflightFallback.routeStatus,
        runtimeBridge: null,
        orchestrationEnvelope: null,
        marionResponse: fallbackResponse.marionResponse,
        nyxResponse: fallbackResponse.nyxResponse,
        diagnostics: {
          adapter: {
            ok: true,
            warnings: ["finance_route_bypassed"],
            errors: []
          },
          intentMapper: domainDecision.diagnostics,
          fallbackRouter: preflightFallback.diagnostics,
          responseContractAdapter: fallbackResponse.diagnostics
        }
      });
    }

    const runtimeBridge = this.runtimeBridge.bridge({
      ...input,
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      originalQuery: normalizedInput.originalQuery,
      normalizedQuery: normalizedInput.normalizedQuery,
      queryContext: normalizedInput.queryContext,
      domainDecision
    });

    const postflightFallback = this.fallbackRouter.postflight({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      domainDecision,
      runtimeBridge,
      orchestrationEnvelope: runtimeBridge.orchestrationEnvelope
    });

    const contractResponse = this.responseContractAdapter.adapt({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      domainDecision,
      runtimeBridge,
      orchestrationEnvelope: runtimeBridge.orchestrationEnvelope,
      fallback: postflightFallback
    });

    return FinanceDomainAdapterEnvelope.create({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      originalQuery: normalizedInput.originalQuery,
      normalizedQuery: normalizedInput.normalizedQuery,

      domainDecision,
      routeStatus: postflightFallback.routeStatus || runtimeBridge.bridgeStatus,
      runtimeBridge,
      orchestrationEnvelope: runtimeBridge.orchestrationEnvelope,

      marionResponse: contractResponse.marionResponse,
      nyxResponse: contractResponse.nyxResponse,

      diagnostics: {
        adapter: {
          ok: contractResponse.diagnostics.ok !== false,
          warnings: [],
          errors: []
        },
        intentMapper: domainDecision.diagnostics,
        runtimeBridge: runtimeBridge.diagnostics,
        fallbackRouter: postflightFallback.diagnostics,
        responseContractAdapter: contractResponse.diagnostics
      }
    });
  }

  normalizeInput(input = {}) {
    const queryContext = input.queryContext || {};

    const originalQuery = firstValue(
      input.originalQuery,
      input.query,
      input.userText,
      input.rawInput,
      input.message,
      input.text,
      queryContext.originalQuery,
      queryContext.normalizedQuery,
      ""
    );

    const requestId =
      input.requestId ||
      input.id ||
      `fin_domain_adapter_req_${Date.now().toString(36)}`;

    const traceId =
      input.traceId ||
      `fin_domain_adapter_trace_${Date.now().toString(36)}`;

    const normalizedQuery = input.normalizedQuery || normalizeText(originalQuery);

    return {
      requestId,
      traceId,
      originalQuery,
      normalizedQuery,
      queryContext: {
        ...queryContext,
        originalQuery,
        normalizedQuery
      }
    };
  }

  handle(input = {}) { return this.adapt(input); }
  route(input = {}) { return this.adapt(input); }
  process(input = {}) { return this.adapt(input); }
  execute(input = {}) { return this.adapt(input); }
  run(input = {}) { return this.adapt(input); }

  static adapt(input = {}, options = {}) {
    return new FinanceMarionDomainAdapter(options).adapt(input);
  }

  static handle(input = {}, options = {}) {
    return new FinanceMarionDomainAdapter(options).adapt(input);
  }
}

module.exports = {
  FinanceMarionDomainAdapter
};
