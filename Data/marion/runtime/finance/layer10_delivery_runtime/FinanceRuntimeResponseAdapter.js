"use strict";

/**
 * R18D Layer 10 — Finance Runtime Response Adapter
 * Converts a Layer 09 final finance response envelope into the runtime response
 * shape expected by Marion/Nyx/API/widget delivery.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripForVoice(value) {
  return normalizeWhitespace(value)
    .replace(/[#*_`>\[\](){}]/g, "")
    .replace(/\bFY(\d{4})\b/g, "fiscal year $1")
    .replace(/\bP\/E\b/gi, "price to earnings");
}

class FinanceRuntimeResponseAdapter {
  adapt(input = {}) {
    const deliveryPolicy = input.deliveryPolicy || {};
    const finalText = String(input.finalResponseText || "").trim();

    const blocked = deliveryPolicy.status === "blocked";
    const holdForReview = deliveryPolicy.status === "hold_for_review";
    const requestEvidence = deliveryPolicy.status === "request_more_evidence";

    const replyText = this.buildReplyText({
      finalText,
      deliveryPolicy,
      blocked,
      holdForReview,
      requestEvidence
    });

    const displayText = replyText;
    const voiceText = stripForVoice(replyText);

    const runtimeResponse = {
      responseId: `fin_runtime_response_${Date.now().toString(36)}`,
      domain: "finance",
      runtimeLayer: "layer10_delivery_runtime",
      intent: "finance_final_response",
      replyText,
      displayText,
      voiceText,
      responseBlocks: safeArray(input.finalResponseBlocks),
      renderedSections: safeArray(input.renderedSections),
      deliveryStatus: deliveryPolicy.status || "deliver",
      canDeliver: Boolean(deliveryPolicy.canDeliver),
      requiresReview: Boolean(deliveryPolicy.requiresReview),
      requiresCaveats: Boolean(deliveryPolicy.requiresCaveats),
      caveatState: this.caveatState(input),
      confidence: this.confidence(input),
      metadata: {
        requestId: input.requestId || null,
        traceId: input.traceId || null,
        responseReadinessStatus: input.responseReadiness && input.responseReadiness.status || null,
        synthesisStatus: input.synthesisReadiness && input.synthesisReadiness.status || null,
        caveatCount: safeArray(input.caveatsApplied).length,
        blockedClaimCount: safeArray(input.blockedClaims).length,
        toneFindingCount: safeArray(input.toneGuardFindings).length
      }
    };

    return {
      runtimeResponse,
      diagnostics: {
        ok: runtimeResponse.replyText.length > 0,
        warnings: runtimeResponse.requiresCaveats ? ["runtime_response_requires_caveats"] : [],
        errors: runtimeResponse.replyText.length === 0 ? ["empty_runtime_reply_text"] : [],
        deliveryStatus: runtimeResponse.deliveryStatus
      }
    };
  }

  buildReplyText(options = {}) {
    const finalText = options.finalText || "";
    const status = options.deliveryPolicy && options.deliveryPolicy.status;

    if (options.blocked) {
      return "I can’t deliver this finance response yet because required evidence or safety checks are blocking delivery.";
    }

    if (options.holdForReview) {
      return [
        "This finance response should be reviewed before delivery because one or more blocking or high-risk delivery conditions were detected.",
        finalText
      ].filter(Boolean).join("\n\n");
    }

    if (options.requestEvidence) {
      return [
        "More evidence is needed before this finance response can be relied on.",
        finalText
      ].filter(Boolean).join("\n\n");
    }

    return finalText || "No deliverable finance response text was available.";
  }

  caveatState(input = {}) {
    const caveatCount = safeArray(input.caveatsApplied).length;
    const blockedCount = safeArray(input.blockedClaims).length;

    if (blockedCount > 0) return "blocked_items_present";
    if (caveatCount > 0) return "caveats_present";

    return "no_caveats";
  }

  confidence(input = {}) {
    const policy = input.deliveryPolicy || {};
    const readiness = input.responseReadiness || {};

    if (typeof policy.confidence === "number") return policy.confidence;
    if (typeof readiness.score === "number") return readiness.score;

    if (policy.status === "deliver") return 0.84;
    if (policy.status === "deliver_with_caveats") return 0.72;
    if (policy.status === "hold_for_review") return 0.48;
    if (policy.status === "request_more_evidence") return 0.42;
    if (policy.status === "blocked") return 0.2;

    return 0.6;
  }

  toRuntimeResponse(input = {}) { return this.adapt(input); }
  process(input = {}) { return this.adapt(input); }
  execute(input = {}) { return this.adapt(input); }
  run(input = {}) { return this.adapt(input); }

  static adapt(input = {}, options = {}) {
    return new FinanceRuntimeResponseAdapter(options).adapt(input);
  }
}

module.exports = {
  FinanceRuntimeResponseAdapter
};
