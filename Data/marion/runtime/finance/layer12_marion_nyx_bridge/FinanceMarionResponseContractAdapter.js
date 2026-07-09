"use strict";

/**
 * R18D Layer 12 — Finance Marion Response Contract Adapter
 * Converts Layer 11 orchestration results into Marion/Nyx response shapes.
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

class FinanceMarionResponseContractAdapter {
  adapt(input = {}) {
    const orchestrationEnvelope = input.orchestrationEnvelope || {};
    const runtimeBridge = input.runtimeBridge || {};
    const runtimeResponse =
      orchestrationEnvelope.runtimeResponse ||
      runtimeBridge.runtimeResponse ||
      {};

    const uiDelivery =
      orchestrationEnvelope.uiDelivery ||
      runtimeBridge.uiDelivery ||
      {};

    const telemetry =
      orchestrationEnvelope.telemetry ||
      runtimeBridge.telemetry ||
      {};

    const fallback = input.fallback || {};
    const shouldUseFallback = fallback.shouldUseFallbackResponse === true;

    const replyText = shouldUseFallback
      ? fallback.fallbackText
      : runtimeResponse.replyText || runtimeResponse.displayText || "The finance response could not be prepared.";

    const displayText = shouldUseFallback
      ? fallback.fallbackText
      : runtimeResponse.displayText || replyText;

    const voiceText = shouldUseFallback
      ? stripForVoice(fallback.fallbackText)
      : runtimeResponse.voiceText || stripForVoice(replyText);

    const deliveryStatus =
      fallback.routeStatus ||
      runtimeResponse.deliveryStatus ||
      orchestrationEnvelope.pipelineStatus ||
      "finance_response_prepared";

    const confidence =
      typeof runtimeResponse.confidence === "number"
        ? runtimeResponse.confidence
        : orchestrationEnvelope.pipelineReadiness && typeof orchestrationEnvelope.pipelineReadiness.score === "number"
          ? orchestrationEnvelope.pipelineReadiness.score
          : 0.6;

    const marionResponse = {
      responseId: `fin_marion_response_${Date.now().toString(36)}`,
      domain: "finance",
      source: "finax",
      adapterLayer: "layer12_marion_nyx_bridge",
      runtimeLayer: "layer12_marion_nyx_bridge",
      intent: input.domainDecision && input.domainDecision.intent || "finance_response",
      reply: replyText,
      replyText,
      text: displayText,
      displayText,
      voiceText,
      answer: replyText,
      responseBlocks: safeArray(runtimeResponse.responseBlocks),
      uiBlocks: safeArray(uiDelivery.blocks),
      uiDelivery,
      telemetry,
      deliveryStatus,
      caveatState: runtimeResponse.caveatState || this.caveatState(orchestrationEnvelope),
      confidence,
      canReturnToUser: this.canReturnToUser(orchestrationEnvelope, fallback),
      requiresHumanReview: this.requiresHumanReview(orchestrationEnvelope, fallback),
      requiresMoreEvidence: this.requiresMoreEvidence(orchestrationEnvelope, fallback),
      metadata: {
        requestId: input.requestId || null,
        traceId: input.traceId || null,
        pipelineStatus: orchestrationEnvelope.pipelineStatus || null,
        bridgeStatus: runtimeBridge.bridgeStatus || null,
        routeStatus: deliveryStatus,
        domainDecisionConfidence: input.domainDecision && input.domainDecision.confidence || null
      }
    };

    const nyxResponse = {
      ...marionResponse,
      responseId: `fin_nyx_response_${Date.now().toString(36)}`,
      personaSurface: "nyx",
      channelReady: true,
      widgetReady: true,
      apiReady: marionResponse.canReturnToUser === true
    };

    return {
      marionResponse,
      nyxResponse,
      diagnostics: {
        ok: Boolean(replyText),
        warnings: shouldUseFallback ? ["fallback_response_used"] : [],
        errors: replyText ? [] : ["empty_marion_response"],
        deliveryStatus,
        confidence
      }
    };
  }

  fromFallback(input = {}) {
    const fallback = input.fallback || {};
    const text =
      fallback.fallbackText ||
      "This request is not being routed through the finance domain.";

    const marionResponse = {
      responseId: `fin_marion_fallback_${Date.now().toString(36)}`,
      domain: "finance",
      source: "finax",
      adapterLayer: "layer12_marion_nyx_bridge",
      runtimeLayer: "layer12_marion_nyx_bridge",
      intent: input.domainDecision && input.domainDecision.intent || "unknown_or_non_finance",
      reply: text,
      replyText: text,
      text,
      displayText: text,
      voiceText: stripForVoice(text),
      answer: text,
      responseBlocks: [],
      uiBlocks: [],
      uiDelivery: { blocks: [], mainAnswer: text },
      telemetry: null,
      deliveryStatus: fallback.routeStatus || "finance_route_bypassed",
      caveatState: "not_applicable",
      confidence: input.domainDecision && input.domainDecision.confidence || 0,
      canReturnToUser: true,
      requiresHumanReview: false,
      requiresMoreEvidence: false,
      metadata: {
        requestId: input.requestId || null,
        traceId: input.traceId || null,
        routeStatus: fallback.routeStatus || "finance_route_bypassed"
      }
    };

    return {
      marionResponse,
      nyxResponse: {
        ...marionResponse,
        responseId: `fin_nyx_fallback_${Date.now().toString(36)}`,
        personaSurface: "nyx",
        channelReady: true,
        widgetReady: true,
        apiReady: true
      },
      diagnostics: {
        ok: true,
        warnings: ["fallback_response_created"],
        errors: [],
        deliveryStatus: marionResponse.deliveryStatus
      }
    };
  }

  caveatState(orchestrationEnvelope = {}) {
    const runtimeResponse = orchestrationEnvelope.runtimeResponse || {};
    if (runtimeResponse.caveatState) return runtimeResponse.caveatState;

    const delivery = orchestrationEnvelope.finalDeliveryEnvelope || {};
    const caveats = safeArray(delivery.caveatsApplied);

    return caveats.length > 0 ? "caveats_present" : "no_caveats";
  }

  canReturnToUser(orchestrationEnvelope = {}, fallback = {}) {
    if (fallback.shouldUseFallbackResponse) return true;

    const handoff = orchestrationEnvelope.nextLayerHandoff || {};
    return Boolean(
      handoff.canReturnToMarion ||
      handoff.canReturnToMarionWithCaveats ||
      orchestrationEnvelope.pipelineStatus === "completed" ||
      orchestrationEnvelope.pipelineStatus === "completed_with_caveats"
    );
  }

  requiresHumanReview(orchestrationEnvelope = {}, fallback = {}) {
    if (fallback.requiresHumanReview) return true;

    const handoff = orchestrationEnvelope.nextLayerHandoff || {};
    return Boolean(handoff.requiresHumanReview);
  }

  requiresMoreEvidence(orchestrationEnvelope = {}, fallback = {}) {
    if (fallback.requiresMoreEvidence) return true;

    const handoff = orchestrationEnvelope.nextLayerHandoff || {};
    return Boolean(handoff.requiresMoreEvidence);
  }

  toMarionResponse(input = {}) { return this.adapt(input); }
  process(input = {}) { return this.adapt(input); }
  execute(input = {}) { return this.adapt(input); }
  run(input = {}) { return this.adapt(input); }

  static adapt(input = {}, options = {}) {
    return new FinanceMarionResponseContractAdapter(options).adapt(input);
  }
}

module.exports = {
  FinanceMarionResponseContractAdapter
};
