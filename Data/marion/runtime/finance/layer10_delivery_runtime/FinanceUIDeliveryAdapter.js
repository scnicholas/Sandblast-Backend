"use strict";

/**
 * R18D Layer 10 — Finance UI Delivery Adapter
 * Converts Layer 09 final response material into widget/API-friendly UI blocks.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

class FinanceUIDeliveryAdapter {
  adapt(input = {}) {
    const deliveryPolicy = input.deliveryPolicy || {};
    const runtimeResponse = input.runtimeResponse || {};

    const blocks = [
      this.mainAnswerBlock(input),
      ...this.sectionBlocks(input.renderedSections),
      ...this.responseBlocks(input.finalResponseBlocks),
      ...this.caveatBlocks(input.caveatsApplied),
      ...this.evidenceBlocks(input.evidenceNotes),
      ...this.assumptionBlocks(input.assumptionNotes),
      ...this.blockedBlocks(input.blockedClaims),
      ...this.toneGuardBlocks(input.toneGuardFindings)
    ].filter(Boolean);

    const uiDelivery = {
      uiDeliveryId: `fin_ui_delivery_${Date.now().toString(36)}`,
      domain: "finance",
      runtimeLayer: "layer10_delivery_runtime",
      deliveryStatus: deliveryPolicy.status || "deliver",
      canDisplay: Boolean(deliveryPolicy.canDeliver || deliveryPolicy.status === "hold_for_review"),
      mainAnswer: runtimeResponse.displayText || input.finalResponseText || "",
      displayText: runtimeResponse.displayText || input.finalResponseText || "",
      blocks,
      sections: safeArray(input.renderedSections),
      caveats: safeArray(input.caveatsApplied),
      blockedItems: safeArray(input.blockedClaims),
      evidenceNotes: safeArray(input.evidenceNotes),
      assumptionNotes: safeArray(input.assumptionNotes),
      debugTrace: {
        requestId: input.requestId || null,
        traceId: input.traceId || null,
        responseReadinessStatus: input.responseReadiness && input.responseReadiness.status || null,
        deliveryPolicyStatus: deliveryPolicy.status || null
      }
    };

    return {
      uiDelivery,
      diagnostics: {
        ok: uiDelivery.mainAnswer.length > 0 || blocks.length > 0,
        warnings: blocks.length === 0 ? ["no_ui_blocks_created"] : [],
        errors: uiDelivery.mainAnswer.length === 0 && blocks.length === 0 ? ["empty_ui_delivery"] : [],
        blockCount: blocks.length
      }
    };
  }

  mainAnswerBlock(input = {}) {
    const text = input.runtimeResponse && input.runtimeResponse.displayText || input.finalResponseText || "";

    if (!text) return null;

    return {
      blockId: "fin_ui_block_main_answer",
      type: "main_answer",
      title: "Answer",
      text,
      severity: "normal",
      order: 1
    };
  }

  sectionBlocks(sections = []) {
    return safeArray(sections).map((section, index) => ({
      blockId: `fin_ui_block_section_${stableSlug(section.sectionType || section.title || index)}`,
      type: section.sectionType || "section",
      title: section.title || "Finance Section",
      text: section.renderedText || "",
      sourceSectionId: section.sourceSectionId || null,
      renderHint: section.renderHint || null,
      severity: "normal",
      order: 10 + index
    })).filter((block) => block.text);
  }

  responseBlocks(blocks = []) {
    return safeArray(blocks).map((block, index) => ({
      blockId: block.blockId || `fin_ui_block_response_${index + 1}`,
      type: block.blockType || "response_block",
      title: block.title || "Finance Block",
      text: block.text || "",
      renderHint: block.renderHint || null,
      severity: "normal",
      order: 100 + index
    })).filter((block) => block.text);
  }

  caveatBlocks(caveats = []) {
    if (safeArray(caveats).length === 0) return [];

    return [{
      blockId: "fin_ui_block_caveats",
      type: "caveats",
      title: "Caveats",
      items: safeArray(caveats).map((item) => ({
        code: item.caveatCode || item.caveatId || "finance_caveat",
        severity: item.severity || "medium",
        message: item.message || "Finance caveat applies."
      })),
      severity: "warning",
      order: 200
    }];
  }

  evidenceBlocks(evidenceNotes = []) {
    if (safeArray(evidenceNotes).length === 0) return [];

    return [{
      blockId: "fin_ui_block_evidence_notes",
      type: "evidence_notes",
      title: "Evidence Notes",
      items: safeArray(evidenceNotes),
      severity: "info",
      order: 210
    }];
  }

  assumptionBlocks(assumptionNotes = []) {
    if (safeArray(assumptionNotes).length === 0) return [];

    return [{
      blockId: "fin_ui_block_assumptions",
      type: "assumptions",
      title: "Assumptions",
      items: safeArray(assumptionNotes),
      severity: "info",
      order: 220
    }];
  }

  blockedBlocks(blockedClaims = []) {
    if (safeArray(blockedClaims).length === 0) return [];

    return [{
      blockId: "fin_ui_block_blocked_claims",
      type: "blocked_items",
      title: "Blocked or Excluded Items",
      items: safeArray(blockedClaims).map((item) => ({
        code: item.code || item.blockedClaimId || "blocked_claim",
        severity: item.severity || "blocking",
        reason: item.reason || "This item is blocked pending evidence."
      })),
      severity: "blocking",
      order: 230
    }];
  }

  toneGuardBlocks(toneGuardFindings = []) {
    if (safeArray(toneGuardFindings).length === 0) return [];

    return [{
      blockId: "fin_ui_block_tone_guard",
      type: "tone_guard",
      title: "Finance Safety Review",
      items: safeArray(toneGuardFindings),
      severity: "info",
      order: 240
    }];
  }

  toUI(input = {}) { return this.adapt(input); }
  process(input = {}) { return this.adapt(input); }
  execute(input = {}) { return this.adapt(input); }
  run(input = {}) { return this.adapt(input); }

  static adapt(input = {}, options = {}) {
    return new FinanceUIDeliveryAdapter(options).adapt(input);
  }
}

module.exports = {
  FinanceUIDeliveryAdapter
};
