"use strict";

/**
 * R18D Layer 09 — Finance Caveat Narrative Injector
 * Ensures caveats, blocked items, assumptions, and evidence limitations are
 * preserved directly inside the rendered finance response.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableSlug(value) {
  const slug = normalizeText(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "unknown";
}

function uniqueBy(items = [], keyFn) {
  const seen = new Set();
  const output = [];

  safeArray(items).filter(Boolean).forEach((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });

  return output;
}

class FinanceCaveatNarrativeInjector {
  inject(input = {}) {
    const baseText = String(input.finalResponseText || "").trim();
    const caveatsApplied = this.collectCaveats(input);
    const blockedClaims = this.collectBlockedClaims(input);

    const caveatText = this.renderCaveatText(caveatsApplied);
    const blockedText = this.renderBlockedText(blockedClaims);

    const finalResponseText = [baseText, caveatText, blockedText]
      .filter(Boolean)
      .join("\n\n");

    const renderedSections = safeArray(input.renderedSections);
    const finalResponseBlocks = [
      ...safeArray(input.finalResponseBlocks),
      ...this.caveatBlocks(caveatsApplied),
      ...this.blockedBlocks(blockedClaims)
    ];

    return {
      finalResponseText,
      renderedSections,
      finalResponseBlocks,
      caveatsApplied,
      blockedClaims,
      diagnostics: {
        ok: true,
        warnings: caveatsApplied.length > 0 ? ["caveats_injected_into_final_response"] : [],
        errors: blockedClaims.some((item) => item.severity === "blocking") ? ["blocked_claims_present"] : [],
        caveatCount: caveatsApplied.length,
        blockedClaimCount: blockedClaims.length
      }
    };
  }

  collectCaveats(input = {}) {
    const caveats = safeArray(input.caveats).map((caveat) => ({
      caveatId: caveat.caveatId || `fin_applied_caveat_${stableSlug(caveat.caveatCode)}`,
      caveatCode: caveat.caveatCode || "finance_caveat",
      severity: caveat.severity || "medium",
      message: caveat.message || "A finance caveat applies.",
      appliesTo: safeArray(caveat.appliesTo),
      source: caveat.source || "layer08_caveat"
    }));

    safeArray(input.assumptionNotes).forEach((note) => {
      if (note.requiresConfirmation) {
        caveats.push({
          caveatId: `fin_applied_caveat_assumption_${stableSlug(note.assumptionNoteId || note.statement)}`,
          caveatCode: `unconfirmed_assumption:${note.assumptionNoteId || "unknown"}`,
          severity: "low",
          message: `The result depends on an assumption that may need confirmation: ${note.statement || "assumption not specified"}.`,
          appliesTo: [note.assumptionNoteId || "assumption"],
          source: "assumption_notes"
        });
      }
    });

    safeArray(input.evidenceNotes).forEach((note) => {
      if (note.status === "gap_detected") {
        caveats.push({
          caveatId: `fin_applied_caveat_evidence_${stableSlug(note.requirementCode)}`,
          caveatCode: `evidence_gap:${note.requirementCode}`,
          severity: note.priority === "required" ? "high" : "medium",
          message: `Evidence requirement needs attention: ${note.requirementCode}.`,
          appliesTo: safeArray(note.relatedGapCodes),
          source: "evidence_notes"
        });
      }
    });

    return uniqueBy(caveats, (item) => item.caveatCode);
  }

  collectBlockedClaims(input = {}) {
    const blocked = [];

    safeArray(input.blockedItems).forEach((item) => {
      blocked.push({
        blockedClaimId: item.blockedItemId || `fin_blocked_claim_${stableSlug(item.code)}`,
        code: item.code || "blocked_item",
        type: item.type || "blocked_item",
        reason: item.reason || "This item is blocked pending evidence.",
        severity: "blocking",
        source: "blocked_items"
      });
    });

    safeArray(input.resultSupportScores).forEach((score) => {
      if (score.supportStatus === "blocked_pending_evidence") {
        blocked.push({
          blockedClaimId: `fin_blocked_claim_${stableSlug(score.resultId)}`,
          code: score.resultId,
          type: "result",
          reason: "This result is blocked pending required evidence.",
          severity: "blocking",
          source: "result_support_scores"
        });
      }

      if (score.supportStatus === "unsupported") {
        blocked.push({
          blockedClaimId: `fin_unsupported_claim_${stableSlug(score.resultId)}`,
          code: score.resultId,
          type: "result",
          reason: "This result is unsupported and should not be presented as a firm finding.",
          severity: "high",
          source: "result_support_scores"
        });
      }
    });

    return uniqueBy(blocked, (item) => `${item.type}:${item.code}`);
  }

  renderCaveatText(caveats = []) {
    const rows = safeArray(caveats);

    if (rows.length === 0) return "";

    const messages = rows.map((item) => item.message).filter(Boolean);

    return `Caveats: ${messages.join(" ")}`;
  }

  renderBlockedText(blockedClaims = []) {
    const rows = safeArray(blockedClaims);

    if (rows.length === 0) return "";

    const messages = rows.map((item) => item.reason).filter(Boolean);

    return `Blocked or excluded items: ${messages.join(" ")}`;
  }

  caveatBlocks(caveats = []) {
    if (safeArray(caveats).length === 0) return [];

    return [{
      blockId: "fin_response_block_caveats_applied",
      blockType: "caveats_applied",
      title: "Caveats Applied",
      text: this.renderCaveatText(caveats),
      renderHint: "caveats"
    }];
  }

  blockedBlocks(blockedClaims = []) {
    if (safeArray(blockedClaims).length === 0) return [];

    return [{
      blockId: "fin_response_block_blocked_claims",
      blockType: "blocked_claims",
      title: "Blocked or Excluded Items",
      text: this.renderBlockedText(blockedClaims),
      renderHint: "blocked"
    }];
  }

  injectCaveats(input = {}) { return this.inject(input); }
  process(input = {}) { return this.inject(input); }
  execute(input = {}) { return this.inject(input); }
  run(input = {}) { return this.inject(input); }

  static inject(input = {}, options = {}) {
    return new FinanceCaveatNarrativeInjector(options).inject(input);
  }
}

module.exports = {
  FinanceCaveatNarrativeInjector
};
