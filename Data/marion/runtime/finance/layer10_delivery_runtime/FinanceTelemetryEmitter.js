"use strict";

/**
 * R18D Layer 10 — Finance Telemetry Emitter
 * Produces observational telemetry for finance delivery.
 *
 * It does not change the answer or delivery policy.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

class FinanceTelemetryEmitter {
  emit(input = {}) {
    const deliveryPolicy = input.deliveryPolicy || {};
    const responseReadiness = input.responseReadiness || {};
    const runtimeResponse = input.runtimeResponse || {};
    const uiDelivery = input.uiDelivery || {};

    const telemetry = {
      telemetryId: `fin_delivery_telemetry_${Date.now().toString(36)}`,
      emittedAt: new Date().toISOString(),
      domain: "finance",
      runtimeLayer: "layer10_delivery_runtime",
      sourceLayer: input.sourceLayer || "layer09_final_response",

      requestId: input.requestId || null,
      traceId: input.traceId || null,

      deliveryStatus: deliveryPolicy.status || null,
      canDeliver: Boolean(deliveryPolicy.canDeliver),
      requiresReview: Boolean(deliveryPolicy.requiresReview),
      requiresCaveats: Boolean(deliveryPolicy.requiresCaveats),
      requiresMoreEvidence: Boolean(deliveryPolicy.requiresMoreEvidence),

      responseReadinessStatus: responseReadiness.status || null,
      responseReadinessScore: typeof responseReadiness.score === "number" ? responseReadiness.score : null,

      runtimeResponseLength: String(runtimeResponse.replyText || "").length,
      displayResponseLength: String(runtimeResponse.displayText || "").length,
      voiceResponseLength: String(runtimeResponse.voiceText || "").length,

      caveatCount: safeArray(input.caveatsApplied).length,
      blockedClaimCount: safeArray(input.blockedClaims).length,
      toneFindingCount: safeArray(input.toneGuardFindings).length,
      verificationGapCount: safeArray(input.verificationGaps).length,
      renderedSectionCount: safeArray(input.renderedSections).length,
      responseBlockCount: safeArray(input.finalResponseBlocks).length,
      uiBlockCount: safeArray(uiDelivery.blocks).length,

      elapsedMs: typeof input.elapsedMs === "number" ? input.elapsedMs : null,
      startedAt: input.startedAt || null,

      summary: {
        hasCaveats: safeArray(input.caveatsApplied).length > 0,
        hasBlockedClaims: safeArray(input.blockedClaims).length > 0,
        hasToneFindings: safeArray(input.toneGuardFindings).length > 0,
        hasVerificationGaps: safeArray(input.verificationGaps).length > 0
      }
    };

    return {
      telemetry,
      diagnostics: {
        ok: true,
        warnings: [],
        errors: [],
        telemetryId: telemetry.telemetryId
      }
    };
  }

  create(input = {}) { return this.emit(input); }
  process(input = {}) { return this.emit(input); }
  execute(input = {}) { return this.emit(input); }
  run(input = {}) { return this.emit(input); }

  static emit(input = {}, options = {}) {
    return new FinanceTelemetryEmitter(options).emit(input);
  }
}

module.exports = {
  FinanceTelemetryEmitter
};
