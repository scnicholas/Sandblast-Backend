"use strict";

/**
 * R18D Layer 07 — Finance Verification Gap Detector
 * Identifies unresolved evidence, source, lineage, and assumption gaps before
 * downstream synthesis.
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

class FinanceVerificationGapDetector {
  detect(input = {}) {
    const gaps = [];

    this.addUnsupportedResultGaps(gaps, input.resultSupportScores);
    this.addRequirementGaps(gaps, input.sourceRequirementMap, input.boundEvidence);
    this.addSourceAuthorityGaps(gaps, input.normalizedSources);
    this.addMetricLineageGaps(gaps, input.normalizedMetrics);
    this.addAssumptionGaps(gaps, input.assumptions);
    this.addRiskFlagGaps(gaps, input.riskFlags);

    const verificationGaps = uniqueBy(gaps, (gap) => gap.gapCode)
      .sort((a, b) => this.severityWeight(b.severity) - this.severityWeight(a.severity));

    return {
      verificationGaps,
      diagnostics: {
        ok: !verificationGaps.some((gap) => gap.severity === "blocking"),
        warnings: verificationGaps.map((gap) => gap.gapCode),
        errors: verificationGaps.filter((gap) => gap.severity === "blocking").map((gap) => gap.gapCode),
        gapCount: verificationGaps.length
      }
    };
  }

  makeGap(gapCode, severity, reason, remediation, source = "verification_gap_detector") {
    return {
      gapId: `fin_gap_${stableSlug(gapCode)}`,
      gapCode,
      severity,
      reason,
      remediation,
      source
    };
  }

  addUnsupportedResultGaps(gaps, resultSupportScores = []) {
    safeArray(resultSupportScores).forEach((score) => {
      if (score.supportStatus === "blocked_pending_evidence") {
        gaps.push(this.makeGap(
          `blocked_result:${score.resultId}`,
          "blocking",
          "A result is blocked pending required evidence.",
          "Attach required evidence or mark the result as unusable in final synthesis.",
          "result_support_scores"
        ));
      }

      if (score.supportStatus === "unsupported") {
        gaps.push(this.makeGap(
          `unsupported_result:${score.resultId}`,
          "high",
          "A result has no adequate evidence or source lineage.",
          "Attach source lineage or exclude/caveat this result.",
          "result_support_scores"
        ));
      }

      if (score.shouldCaveat) {
        gaps.push(this.makeGap(
          `caveat_result:${score.resultId}`,
          "low",
          "A result can be used only with caveats.",
          "Carry caveat language into synthesis.",
          "result_support_scores"
        ));
      }
    });
  }

  addRequirementGaps(gaps, sourceRequirementMap = [], boundEvidence = {}) {
    const boundResults = safeArray(boundEvidence && boundEvidence.evidenceBoundResults);

    safeArray(sourceRequirementMap).forEach((requirement) => {
      const applicable = boundResults.filter((result) => {
        return safeArray(requirement.appliesToResultTypes).includes(result.resultType) ||
          safeArray(requirement.appliesToResultNames).includes(result.resultName) ||
          safeArray(requirement.appliesToResultIds).includes(result.resultId);
      });

      if (applicable.length === 0) {
        gaps.push(this.makeGap(
          `requirement_unmapped:${requirement.requirementCode}`,
          requirement.priority === "required" ? "medium" : "low",
          "An evidence requirement does not map to any available execution result.",
          "Review whether the requirement is stale or whether the execution result is missing.",
          "source_requirement_map"
        ));
        return;
      }

      const noSources = applicable.every((result) => safeArray(result.linkedSources).length === 0);

      if (requirement.priority === "required" && noSources) {
        gaps.push(this.makeGap(
          `required_source_missing:${requirement.requirementCode}`,
          requirement.blockingWithoutEvidence ? "blocking" : "high",
          "A required evidence/source requirement has no linked source.",
          "Attach an authoritative source or block downstream claim synthesis.",
          "source_requirement_map"
        ));
      }
    });
  }

  addSourceAuthorityGaps(gaps, normalizedSources = []) {
    const sources = safeArray(normalizedSources);

    if (sources.length === 0) {
      gaps.push(this.makeGap(
        "no_normalized_sources",
        "medium",
        "No normalized sources are available for evidence binding.",
        "Supply source lineage before making factual finance claims.",
        "normalized_sources"
      ));
    }

    sources.forEach((source) => {
      if (!source.authorityClass || source.authorityClass === "unknown") {
        gaps.push(this.makeGap(
          `unknown_source_authority:${source.sourceLabel || source.sourceId || "unknown"}`,
          "medium",
          "A source has unknown finance authority class.",
          "Classify source authority before confident synthesis.",
          "normalized_sources"
        ));
      }

      if (source.requiresVerification) {
        gaps.push(this.makeGap(
          `source_requires_verification:${source.sourceLabel || source.sourceId || "unknown"}`,
          "medium",
          "A normalized source requires verification.",
          "Verify source recency, authority, and relevance.",
          "normalized_sources"
        ));
      }
    });
  }

  addMetricLineageGaps(gaps, normalizedMetrics = []) {
    safeArray(normalizedMetrics).forEach((metric) => {
      const id = metric.normalizedMetricId || metric.metricId || metric.canonicalMetric || "unknown_metric";

      if (!metric.sourceInputId && !metric.sourceId && !metric.sourceLabel && !metric.sourceType) {
        gaps.push(this.makeGap(
          `metric_source_lineage_missing:${id}`,
          "low",
          "A normalized metric lacks explicit source lineage fields.",
          "Carry caveat or bind to the available normalized source when appropriate.",
          "normalized_metrics"
        ));
      }

      if (metric.verificationRequired) {
        gaps.push(this.makeGap(
          `metric_requires_verification:${id}`,
          "medium",
          "A normalized metric requires verification.",
          "Verify metric against acceptable evidence before final claims.",
          "normalized_metrics"
        ));
      }
    });
  }

  addAssumptionGaps(gaps, assumptions = []) {
    safeArray(assumptions).forEach((assumption) => {
      if (assumption.requiresConfirmation) {
        gaps.push(this.makeGap(
          `assumption_requires_confirmation:${assumption.assumptionId || stableSlug(assumption.statement || "unknown")}`,
          "low",
          "A user-supplied assumption requires confirmation.",
          "Carry assumption caveat or ask for confirmation before firm claims.",
          "assumptions"
        ));
      }
    });
  }

  addRiskFlagGaps(gaps, riskFlags = []) {
    safeArray(riskFlags).forEach((risk) => {
      if (risk.severity === "blocking") {
        gaps.push(this.makeGap(
          `blocking_risk_unresolved:${risk.riskCode}`,
          "blocking",
          "A blocking upstream risk remains unresolved.",
          "Resolve the upstream risk before synthesis.",
          "risk_flags"
        ));
      }
    });
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

  detectGaps(input = {}) { return this.detect(input); }
  process(input = {}) { return this.detect(input); }
  execute(input = {}) { return this.detect(input); }
  run(input = {}) { return this.detect(input); }

  static detect(input = {}, options = {}) {
    return new FinanceVerificationGapDetector(options).detect(input);
  }
}

module.exports = {
  FinanceVerificationGapDetector
};
