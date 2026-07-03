"use strict";

/**
 * R18D Layer 08 — Finance Caveat Composer
 * Converts evidence gaps, assumptions, missing inputs, and weak support into
 * structured caveats for downstream final rendering.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").trim();
}

function stableSlug(value) {
  const slug = normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
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

class FinanceCaveatComposer {
  compose(input = {}) {
    const caveats = [];

    this.addEvidenceReadinessCaveats(caveats, input.evidenceReadiness);
    this.addVerificationGapCaveats(caveats, input.verificationGaps);
    this.addSupportCaveats(caveats, input.resultSupportScores);
    this.addMissingInputCaveats(caveats, input.missingInputs);
    this.addRiskFlagCaveats(caveats, input.riskFlags);

    const assumptionNotes = this.composeAssumptionNotes(input.assumptions);
    const evidenceNotes = this.composeEvidenceNotes(input.evidenceRequirements, input.verificationGaps);
    const blockedItems = this.composeBlockedItems(input.verificationGaps, input.resultSupportScores);

    const uniqueCaveats = uniqueBy(caveats, (item) => item.caveatCode)
      .sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity));

    return {
      caveats: uniqueCaveats,
      assumptionNotes,
      evidenceNotes,
      blockedItems,
      diagnostics: {
        ok: !uniqueCaveats.some((item) => item.severity === "blocking"),
        warnings: uniqueCaveats.map((item) => item.caveatCode),
        errors: uniqueCaveats.filter((item) => item.severity === "blocking").map((item) => item.caveatCode),
        caveatCount: uniqueCaveats.length
      }
    };
  }

  makeCaveat(caveatCode, severity, message, appliesTo = [], source = "caveat_composer") {
    return {
      caveatId: `fin_caveat_${stableSlug(caveatCode)}`,
      caveatCode,
      severity,
      message,
      appliesTo: safeArray(appliesTo),
      source
    };
  }

  addEvidenceReadinessCaveats(caveats, evidenceReadiness = null) {
    if (!evidenceReadiness) {
      caveats.push(this.makeCaveat(
        "evidence_readiness_missing",
        "medium",
        "Evidence readiness was not provided by the prior layer."
      ));
      return;
    }

    if (evidenceReadiness.status === "blocked_pending_evidence") {
      caveats.push(this.makeCaveat(
        "blocked_pending_evidence",
        "blocking",
        "Some finance results are blocked because required evidence is missing.",
        evidenceReadiness.blockingIssues
      ));
    }

    if (evidenceReadiness.status === "needs_evidence_caveats") {
      caveats.push(this.makeCaveat(
        "needs_evidence_caveats",
        "high",
        "Some findings can be presented only with explicit evidence caveats.",
        evidenceReadiness.warnings
      ));
    }

    if (evidenceReadiness.status === "partially_evidence_bound") {
      caveats.push(this.makeCaveat(
        "partial_evidence_binding",
        "medium",
        "Evidence binding is partial; supported findings should be separated from weaker findings.",
        evidenceReadiness.warnings
      ));
    }
  }

  addVerificationGapCaveats(caveats, verificationGaps = []) {
    safeArray(verificationGaps).forEach((gap) => {
      caveats.push(this.makeCaveat(
        `verification_gap:${gap.gapCode}`,
        gap.severity || "medium",
        gap.reason || `Verification gap exists: ${gap.gapCode}.`,
        [gap.gapCode],
        "verification_gaps"
      ));
    });
  }

  addSupportCaveats(caveats, resultSupportScores = []) {
    safeArray(resultSupportScores).forEach((score) => {
      if (score.supportStatus === "partial_support") {
        caveats.push(this.makeCaveat(
          `partial_support:${score.resultId}`,
          "medium",
          "A result has partial evidence support and should be presented with caution.",
          [score.resultId],
          "result_support_scores"
        ));
      }

      if (score.supportStatus === "unsupported") {
        caveats.push(this.makeCaveat(
          `unsupported_result:${score.resultId}`,
          "high",
          "A result lacks adequate evidence support and should not be used as a firm finding.",
          [score.resultId],
          "result_support_scores"
        ));
      }

      if (score.supportStatus === "blocked_pending_evidence") {
        caveats.push(this.makeCaveat(
          `blocked_result:${score.resultId}`,
          "blocking",
          "A result is blocked pending required evidence.",
          [score.resultId],
          "result_support_scores"
        ));
      }
    });
  }

  addMissingInputCaveats(caveats, missingInputs = []) {
    safeArray(missingInputs).forEach((missing) => {
      const name = missing.missingInput || missing.input || missing.key || "unknown_input";

      caveats.push(this.makeCaveat(
        `missing_input:${name}`,
        missing.blocksAnalysis ? "blocking" : missing.severity === "required" ? "high" : "medium",
        missing.reason || `Missing finance input: ${name}.`,
        [name],
        "missing_inputs"
      ));
    });
  }

  addRiskFlagCaveats(caveats, riskFlags = []) {
    safeArray(riskFlags).forEach((risk) => {
      caveats.push(this.makeCaveat(
        `risk_flag:${risk.riskCode}`,
        risk.severity || "medium",
        risk.reason || `Risk flag present: ${risk.riskCode}.`,
        [risk.riskCode],
        "risk_flags"
      ));
    });
  }

  composeAssumptionNotes(assumptions = []) {
    return safeArray(assumptions).map((assumption, index) => ({
      assumptionNoteId: assumption.assumptionId || `fin_assumption_note_${index + 1}`,
      statement: assumption.statement || String(assumption),
      requiresConfirmation: Boolean(assumption.requiresConfirmation),
      handling: assumption.requiresConfirmation
        ? "carry_as_unconfirmed_assumption"
        : "carry_as_declared_assumption"
    }));
  }

  composeEvidenceNotes(evidenceRequirements = [], verificationGaps = []) {
    return safeArray(evidenceRequirements).map((requirement) => {
      const relatedGaps = safeArray(verificationGaps).filter((gap) => {
        return normalizeText(gap.gapCode).includes(normalizeText(requirement.requirementCode));
      });

      return {
        evidenceNoteId: `fin_evidence_note_${stableSlug(requirement.requirementCode || "requirement")}`,
        requirementCode: requirement.requirementCode || "unknown_requirement",
        priority: requirement.priority || "recommended",
        acceptableSources: safeArray(requirement.acceptableSources),
        status: relatedGaps.length > 0 ? "gap_detected" : "carried_forward",
        relatedGapCodes: relatedGaps.map((gap) => gap.gapCode)
      };
    });
  }

  composeBlockedItems(verificationGaps = [], resultSupportScores = []) {
    const blockedFromGaps = safeArray(verificationGaps)
      .filter((gap) => gap.severity === "blocking")
      .map((gap) => ({
        blockedItemId: `fin_blocked_gap_${stableSlug(gap.gapCode)}`,
        type: "verification_gap",
        code: gap.gapCode,
        reason: gap.reason || "Blocking verification gap."
      }));

    const blockedFromScores = safeArray(resultSupportScores)
      .filter((score) => score.supportStatus === "blocked_pending_evidence")
      .map((score) => ({
        blockedItemId: `fin_blocked_result_${stableSlug(score.resultId)}`,
        type: "result",
        code: score.resultId,
        reason: "Result is blocked pending evidence."
      }));

    return uniqueBy([...blockedFromGaps, ...blockedFromScores], (item) => item.blockedItemId);
  }

  severityWeight(severity) {
    const weights = {
      blocking: 4,
      high: 3,
      medium: 2,
      low: 1
    };

    return weights[severity] || 0;
  }

  composeCaveats(input = {}) { return this.compose(input); }
  process(input = {}) { return this.compose(input); }
  execute(input = {}) { return this.compose(input); }
  run(input = {}) { return this.compose(input); }

  static compose(input = {}, options = {}) {
    return new FinanceCaveatComposer(options).compose(input);
  }
}

module.exports = {
  FinanceCaveatComposer
};
