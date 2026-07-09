"use strict";

/**
 * R18D Layer 10 — Finance Delivery Policy Gate
 * Final runtime delivery gate for rendered finance responses.
 *
 * It does not alter financial analysis. It only decides delivery posture.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueArray(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

class FinanceDeliveryPolicyGate {
  evaluate(input = {}) {
    const finalResponseText = String(input.finalResponseText || "").trim();
    const responseReadiness = input.responseReadiness || {};
    const nextLayerHandoff = input.nextLayerHandoff || {};

    const caveatsApplied = safeArray(input.caveatsApplied);
    const blockedClaims = safeArray(input.blockedClaims);
    const toneGuardFindings = safeArray(input.toneGuardFindings);
    const verificationGaps = safeArray(input.verificationGaps);

    const blockingClaims = blockedClaims.filter((item) => item.severity === "blocking");
    const blockingToneFindings = toneGuardFindings.filter((item) => item.severity === "blocking");
    const highToneFindings = toneGuardFindings.filter((item) => item.severity === "high");
    const blockingGaps = verificationGaps.filter((gap) => gap.severity === "blocking");
    const highGaps = verificationGaps.filter((gap) => gap.severity === "high");

    const blockingReasons = uniqueArray([
      finalResponseText.length === 0 ? "empty_final_response_text" : null,
      responseReadiness.status === "empty_response" ? "response_readiness_empty_response" : null,
      responseReadiness.status === "response_rendered_with_blocks" ? "response_rendered_with_blocks" : null,
      nextLayerHandoff.requiresReviewBeforeDelivery ? "review_required_by_layer09" : null,
      ...blockingClaims.map((item) => `blocked_claim:${item.code || item.blockedClaimId}`),
      ...blockingToneFindings.map((item) => `blocking_tone:${item.findingCode}`),
      ...blockingGaps.map((gap) => `blocking_verification_gap:${gap.gapCode}`)
    ]);

    const warnings = uniqueArray([
      ...caveatsApplied.map((item) => `caveat:${item.caveatCode}`),
      ...highToneFindings.map((item) => `high_tone:${item.findingCode}`),
      ...highGaps.map((gap) => `high_verification_gap:${gap.gapCode}`),
      responseReadiness.status === "response_rendered_with_caveats" ? "response_rendered_with_caveats" : null
    ]);

    const status = this.status({
      finalResponseText,
      blockingReasons,
      warnings,
      responseReadiness,
      nextLayerHandoff,
      caveatsApplied,
      blockedClaims,
      toneGuardFindings,
      verificationGaps
    });

    const deliveryPolicy = {
      policyId: `fin_delivery_policy_${Date.now().toString(36)}`,
      domain: "finance",
      runtimeLayer: "layer10_delivery_runtime",
      status,
      canDeliver:
        status === "deliver" ||
        status === "deliver_with_caveats",
      requiresReview:
        status === "hold_for_review" ||
        status === "blocked",
      requiresCaveats:
        status === "deliver_with_caveats" ||
        caveatsApplied.length > 0 ||
        warnings.length > 0,
      requiresMoreEvidence:
        status === "request_more_evidence",
      blockingReasons,
      warnings,
      rationale: this.rationale(status),
      confidence: this.confidence(status, responseReadiness)
    };

    return {
      deliveryPolicy,
      diagnostics: {
        ok: deliveryPolicy.canDeliver,
        warnings,
        errors: blockingReasons,
        deliveryStatus: status
      }
    };
  }

  status(options = {}) {
    if (!options.finalResponseText) return "blocked";

    if (options.blockingReasons.length > 0) {
      if (
        options.responseReadiness.status === "empty_response" ||
        options.blockingReasons.includes("empty_final_response_text")
      ) {
        return "blocked";
      }

      return "hold_for_review";
    }

    if (options.nextLayerHandoff && options.nextLayerHandoff.requiresEvidenceVerification) {
      return "request_more_evidence";
    }

    if (
      safeArray(options.caveatsApplied).length > 0 ||
      options.warnings.length > 0 ||
      options.responseReadiness.status === "response_rendered_with_caveats"
    ) {
      return "deliver_with_caveats";
    }

    return "deliver";
  }

  rationale(status) {
    const map = {
      deliver: "Response is deliverable without blocking caveats.",
      deliver_with_caveats: "Response is deliverable, but caveats or warning conditions must remain visible.",
      hold_for_review: "Response exists, but blocking or high-risk conditions require review before delivery.",
      request_more_evidence: "Response requires more evidence before reliable delivery.",
      blocked: "Response cannot be delivered in its current state."
    };

    return map[status] || "Delivery posture could not be classified.";
  }

  confidence(status, responseReadiness = {}) {
    if (typeof responseReadiness.score === "number") {
      const base = responseReadiness.score;

      if (status === "deliver") return Math.min(0.95, base);
      if (status === "deliver_with_caveats") return Math.min(0.82, base);
      if (status === "request_more_evidence") return Math.min(0.55, base);
      if (status === "hold_for_review") return Math.min(0.48, base);
      if (status === "blocked") return Math.min(0.25, base);
    }

    const fallback = {
      deliver: 0.86,
      deliver_with_caveats: 0.72,
      request_more_evidence: 0.48,
      hold_for_review: 0.42,
      blocked: 0.18
    };

    return fallback[status] || 0.5;
  }

  gate(input = {}) { return this.evaluate(input); }
  process(input = {}) { return this.evaluate(input); }
  execute(input = {}) { return this.evaluate(input); }
  run(input = {}) { return this.evaluate(input); }

  static evaluate(input = {}, options = {}) {
    return new FinanceDeliveryPolicyGate(options).evaluate(input);
  }
}

module.exports = {
  FinanceDeliveryPolicyGate
};
