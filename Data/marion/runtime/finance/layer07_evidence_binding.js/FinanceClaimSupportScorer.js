"use strict";

/**
 * R18D Layer 07 — Finance Claim Support Scorer
 * Scores evidence support strength for each evidence-bound result.
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

function round(value, decimals = 3) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

class FinanceClaimSupportScorer {
  score(input = {}) {
    const boundResults = safeArray(input.boundEvidence && input.boundEvidence.evidenceBoundResults);

    const resultSupportScores = boundResults.map((boundResult) => {
      return this.scoreOne(boundResult, input);
    });

    return {
      resultSupportScores,
      diagnostics: {
        ok: true,
        warnings:
          resultSupportScores.some((item) => item.supportStatus === "unsupported" || item.supportStatus === "blocked_pending_evidence")
            ? ["some_results_lack_adequate_support"]
            : [],
        errors: [],
        scoredCount: resultSupportScores.length
      }
    };
  }

  scoreOne(boundResult = {}, input = {}) {
    let score = 0;

    const linkedMetrics = safeArray(boundResult.linkedMetrics);
    const linkedSources = safeArray(boundResult.linkedSources);
    const attachedRequirements = safeArray(boundResult.attachedRequirements);

    if (linkedMetrics.length > 0) score += 0.22;
    if (linkedSources.length > 0) score += 0.22;
    if (boundResult.sourceLineageComplete) score += 0.14;

    score += this.sourceAuthorityScore(linkedSources);
    score += this.requirementCoverageScore(attachedRequirements, boundResult);
    score -= this.verificationPenalty(boundResult);
    score -= this.assumptionPenalty(boundResult, input.assumptions);
    score -= this.riskPenalty(input.riskFlags);

    score = Math.max(0, Math.min(1, round(score, 3)));

    const supportStatus = this.statusForScore(score, boundResult);

    return {
      supportScoreId: `fin_support_${stableSlug(boundResult.resultType)}_${stableSlug(boundResult.resultName)}_${stableSlug(boundResult.resultId)}`,
      resultId: boundResult.resultId,
      resultType: boundResult.resultType,
      resultName: boundResult.resultName,
      supportScore: score,
      supportStatus,
      evidenceStrength: supportStatus,
      sourceAuthorityClasses: linkedSources.map((source) => source.authorityClass || "unknown"),
      requirementCodes: attachedRequirements.map((requirement) => requirement.requirementCode),
      blockers: this.blockers(boundResult, attachedRequirements),
      warnings: this.warnings(boundResult, attachedRequirements, linkedSources),
      canUseInFinalSynthesis:
        supportStatus !== "unsupported" &&
        supportStatus !== "blocked_pending_evidence",
      shouldCaveat:
        supportStatus === "partial_support" ||
        supportStatus === "adequate_support" ||
        boundResult.requiresVerification === true
    };
  }

  sourceAuthorityScore(sources = []) {
    if (safeArray(sources).length === 0) return 0;

    const authorityScores = safeArray(sources).map((source) => {
      const cls = source.authorityClass || "unknown";

      if (cls === "primary") return 0.28;
      if (cls === "secondary") return 0.2;
      if (cls === "user_supplied") return 0.14;
      return 0.06;
    });

    return Math.max(...authorityScores);
  }

  requirementCoverageScore(requirements = [], boundResult = {}) {
    const rows = safeArray(requirements);

    if (rows.length === 0) {
      return boundResult.linkedSources && boundResult.linkedSources.length > 0 ? 0.08 : 0;
    }

    const required = rows.filter((item) => item.priority === "required");
    const recommended = rows.filter((item) => item.priority !== "required");

    let score = 0;

    if (required.length > 0 && safeArray(boundResult.linkedSources).length > 0) score += 0.1;
    if (recommended.length > 0 && safeArray(boundResult.linkedSources).length > 0) score += 0.06;
    if (required.length === 0 && recommended.length > 0) score += 0.04;

    return score;
  }

  verificationPenalty(boundResult = {}) {
    if (boundResult.bindingStatus === "blocked_pending_evidence") return 0.3;
    if (boundResult.bindingStatus === "unsupported") return 0.24;
    if (boundResult.requiresVerification) return 0.1;
    return 0;
  }

  assumptionPenalty(boundResult = {}, assumptions = []) {
    if (boundResult.resultType !== "scenario") return 0;

    const confirmationRequired = safeArray(assumptions).some((assumption) => {
      return assumption.requiresConfirmation === true;
    });

    return confirmationRequired ? 0.08 : 0.03;
  }

  riskPenalty(riskFlags = []) {
    const blocking = safeArray(riskFlags).filter((risk) => risk.severity === "blocking").length;
    const high = safeArray(riskFlags).filter((risk) => risk.severity === "high").length;

    return Math.min(0.25, blocking * 0.16 + high * 0.06);
  }

  statusForScore(score, boundResult = {}) {
    if (boundResult.bindingStatus === "blocked_pending_evidence") return "blocked_pending_evidence";
    if (boundResult.bindingStatus === "unsupported") return "unsupported";

    if (score >= 0.78) return "strong_support";
    if (score >= 0.58) return "adequate_support";
    if (score >= 0.32) return "partial_support";
    return "unsupported";
  }

  blockers(boundResult = {}, requirements = []) {
    const blockers = [];

    if (boundResult.bindingStatus === "blocked_pending_evidence") {
      blockers.push("blocked_pending_evidence");
    }

    if (boundResult.bindingStatus === "unsupported") {
      blockers.push("no_metric_or_source_lineage");
    }

    safeArray(requirements).forEach((requirement) => {
      if (requirement.priority === "required" && requirement.blockingWithoutEvidence && safeArray(boundResult.linkedSources).length === 0) {
        blockers.push(`required_evidence_missing:${requirement.requirementCode}`);
      }
    });

    return blockers;
  }

  warnings(boundResult = {}, requirements = [], sources = []) {
    const warnings = [];

    if (boundResult.requiresVerification) {
      warnings.push("verification_required");
    }

    if (safeArray(sources).some((source) => source.authorityClass === "unknown")) {
      warnings.push("unknown_source_authority");
    }

    if (safeArray(requirements).some((requirement) => requirement.priority === "required")) {
      warnings.push("required_evidence_applies");
    }

    return warnings;
  }

  scoreClaims(input = {}) { return this.score(input); }
  process(input = {}) { return this.score(input); }
  execute(input = {}) { return this.score(input); }
  run(input = {}) { return this.score(input); }

  static score(input = {}, options = {}) {
    return new FinanceClaimSupportScorer(options).score(input);
  }
}

module.exports = {
  FinanceClaimSupportScorer
};
