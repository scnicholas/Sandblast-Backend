"use strict";

/**
 * R18D Layer 12 — Finance Domain Fallback Router
 * Controls bypass, review, blocked, and failure response posture for the
 * Finance Marion/Nyx domain adapter.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

class FinanceDomainFallbackRouter {
  preflight(input = {}) {
    const domainDecision = input.domainDecision || {};

    if (!domainDecision.shouldRouteToFinance) {
      return {
        fallbackId: `fin_fallback_preflight_${Date.now().toString(36)}`,
        domain: "finance",
        runtimeLayer: "layer12_marion_nyx_bridge",
        phase: "preflight",
        shouldBypassFinance: true,
        shouldUseFallbackResponse: true,
        routeStatus: "pass_to_default_router",
        fallbackText: "This does not appear to be a finance-domain request, so it should continue through the default Marion/Nyx router.",
        requiresHumanReview: false,
        requiresMoreEvidence: false,
        diagnostics: {
          ok: true,
          warnings: ["finance_domain_not_selected"],
          errors: [],
          routeReason: domainDecision.routeReason || "finance_route_not_selected"
        }
      };
    }

    return {
      fallbackId: `fin_fallback_preflight_clear_${Date.now().toString(36)}`,
      domain: "finance",
      runtimeLayer: "layer12_marion_nyx_bridge",
      phase: "preflight",
      shouldBypassFinance: false,
      shouldUseFallbackResponse: false,
      routeStatus: "route_to_finance",
      fallbackText: "",
      requiresHumanReview: false,
      requiresMoreEvidence: false,
      diagnostics: {
        ok: true,
        warnings: [],
        errors: []
      }
    };
  }

  postflight(input = {}) {
    const runtimeBridge = input.runtimeBridge || {};
    const orchestrationEnvelope = input.orchestrationEnvelope || {};
    const bridgeStatus = runtimeBridge.bridgeStatus;
    const pipelineStatus = orchestrationEnvelope.pipelineStatus;
    const handoff = orchestrationEnvelope.nextLayerHandoff || {};

    if (bridgeStatus === "bridge_failed" || pipelineStatus === "failed" || handoff.failed) {
      return this.buildPostflight({
        status: "finance_failed",
        shouldUseFallbackResponse: true,
        fallbackText: "The finance runtime could not complete the request safely. The failure has been preserved for review.",
        requiresHumanReview: true,
        diagnosticsError: "finance_runtime_failed"
      });
    }

    if (bridgeStatus === "bridge_blocked" || pipelineStatus === "blocked" || handoff.blocked) {
      return this.buildPostflight({
        status: "finance_blocked",
        shouldUseFallbackResponse: true,
        fallbackText: "The finance response is blocked because required evidence or delivery checks were not satisfied.",
        requiresHumanReview: true,
        diagnosticsError: "finance_runtime_blocked"
      });
    }

    if (
      bridgeStatus === "bridge_review_required" ||
      pipelineStatus === "completed_with_review_hold" ||
      handoff.requiresHumanReview
    ) {
      return this.buildPostflight({
        status: "handoff_review",
        shouldUseFallbackResponse: false,
        fallbackText: "",
        requiresHumanReview: true,
        diagnosticsWarning: "finance_response_requires_review"
      });
    }

    if (
      bridgeStatus === "bridge_requires_more_evidence" ||
      pipelineStatus === "requires_more_evidence" ||
      handoff.requiresMoreEvidence
    ) {
      return this.buildPostflight({
        status: "request_more_evidence",
        shouldUseFallbackResponse: false,
        fallbackText: "",
        requiresMoreEvidence: true,
        diagnosticsWarning: "finance_response_requires_more_evidence"
      });
    }

    if (
      bridgeStatus === "bridge_ready_with_caveats" ||
      pipelineStatus === "completed_with_caveats" ||
      handoff.canReturnToMarionWithCaveats
    ) {
      return this.buildPostflight({
        status: "finance_ready_with_caveats",
        shouldUseFallbackResponse: false,
        fallbackText: "",
        diagnosticsWarning: "finance_response_has_caveats"
      });
    }

    return this.buildPostflight({
      status: "finance_ready",
      shouldUseFallbackResponse: false,
      fallbackText: ""
    });
  }

  buildPostflight(options = {}) {
    const warnings = safeArray([
      options.diagnosticsWarning
    ]).filter(Boolean);

    const errors = safeArray([
      options.diagnosticsError
    ]).filter(Boolean);

    return {
      fallbackId: `fin_fallback_postflight_${Date.now().toString(36)}`,
      domain: "finance",
      runtimeLayer: "layer12_marion_nyx_bridge",
      phase: "postflight",
      shouldBypassFinance: false,
      shouldUseFallbackResponse: Boolean(options.shouldUseFallbackResponse),
      routeStatus: options.status || "finance_ready",
      fallbackText: options.fallbackText || "",
      requiresHumanReview: Boolean(options.requiresHumanReview),
      requiresMoreEvidence: Boolean(options.requiresMoreEvidence),
      diagnostics: {
        ok: errors.length === 0,
        warnings,
        errors
      }
    };
  }

  route(input = {}) { return this.postflight(input); }
  process(input = {}) { return this.postflight(input); }
  execute(input = {}) { return this.postflight(input); }
  run(input = {}) { return this.postflight(input); }

  static preflight(input = {}, options = {}) {
    return new FinanceDomainFallbackRouter(options).preflight(input);
  }

  static postflight(input = {}, options = {}) {
    return new FinanceDomainFallbackRouter(options).postflight(input);
  }
}

module.exports = {
  FinanceDomainFallbackRouter
};
