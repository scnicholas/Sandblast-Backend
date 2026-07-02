"use strict";

/**
 * R18D Layer 02 — Finance Conflicting Source Resolver
 * Detects and resolves source conflicts across authority, freshness, jurisdiction, and metric scope.
 *
 * No external dependencies.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_PACK_DIR = path.resolve(__dirname, "../../../../Domains/finance/packs");

const AUTHORITY_ORDER = [
  "primary_official",
  "primary_filings",
  "institutional_multilateral",
  "professional_research",
  "exchange_or_market_reference",
  "major_financial_press",
  "user_provided_operational_data",
  "secondary_context",
  "unsupported_or_unknown"
];

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return {
      __loadError: true,
      filePath,
      message: error.message,
      fallback
    };
  }
}

function tierRank(tier) {
  const index = AUTHORITY_ORDER.indexOf(tier);
  return index === -1 ? AUTHORITY_ORDER.length : index;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function uniqueArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

class FinanceConflictingSourceResolver {
  constructor(options = {}) {
    this.packDir = options.packDir ? path.resolve(options.packDir) : DEFAULT_PACK_DIR;

    this.rules = safeReadJson(
      path.join(this.packDir, "fin_conflicting_sources_v1.json"),
      { conflictTypes: {}, resolutionRules: {}, conflictSeverityBands: {} }
    );
  }

  getLoadStatus() {
    return {
      packDir: this.packDir,
      conflictingSourcesLoaded: !this.rules.__loadError,
      errors: [this.rules.__loadError ? this.rules : null].filter(Boolean)
    };
  }

  detect(sources = [], context = {}) {
    const conflictTypes = [];
    const notes = [];

    if (!Array.isArray(sources) || sources.length <= 1) {
      return {
        conflictDetected: false,
        conflictTypes: [],
        conflictSeverity: "none",
        preferredSource: sources[0] || null,
        resolutionAction: "single_or_no_source",
        confidenceImpact: "neutral",
        mustDiscloseConflict: false,
        notes: []
      };
    }

    const tiers = uniqueArray(sources.map((source) => source.sourceTier));
    const jurisdictions = uniqueArray(sources.map((source) => source.jurisdiction).filter(Boolean));
    const metricDefinitions = uniqueArray(sources.map((source) => source.metricDefinition).filter(Boolean));
    const freshnessStatuses = uniqueArray(sources.map((source) => source.freshnessStatus).filter(Boolean));

    if (tiers.length > 1) {
      conflictTypes.push("authority_conflict");
      notes.push("Sources have different authority tiers.");
    }

    if (freshnessStatuses.includes("current") && freshnessStatuses.includes("stale_for_current_claim")) {
      conflictTypes.push("freshness_conflict");
      notes.push("Current and stale sources are present together.");
    }

    if (jurisdictions.length > 1) {
      conflictTypes.push("jurisdiction_conflict");
      notes.push("Sources appear to reference different jurisdictions.");
    }

    if (metricDefinitions.length > 1) {
      conflictTypes.push("metric_definition_conflict");
      notes.push("Sources appear to use different metric definitions.");
    }

    const explicitlyConflicting = sources.some((source) => source.conflictsWithHigherAuthority === true || source.conflictFlag === true);

    if (explicitlyConflicting) {
      conflictTypes.push("authority_conflict");
      notes.push("One or more sources were explicitly marked as conflicting.");
    }

    const uniqueTypes = uniqueArray(conflictTypes);

    if (uniqueTypes.length === 0) {
      return {
        conflictDetected: false,
        conflictTypes: [],
        conflictSeverity: "none",
        preferredSource: this.pickPreferredSource(sources, context),
        resolutionAction: "no_material_conflict_detected",
        confidenceImpact: "neutral",
        mustDiscloseConflict: false,
        notes: []
      };
    }

    const severity = this.determineSeverity(uniqueTypes, sources, context);
    const preferredSource = this.pickPreferredSource(sources, context);

    return {
      conflictDetected: true,
      conflictTypes: uniqueTypes,
      conflictSeverity: severity,
      preferredSource,
      resolutionAction: this.resolveAction(uniqueTypes, severity, context),
      confidenceImpact: severity === "blocking" ? "block" : severity === "minor" ? "neutral" : "decrease",
      mustDiscloseConflict: severity !== "minor",
      notes
    };
  }

  pickPreferredSource(sources = [], context = {}) {
    if (!Array.isArray(sources) || sources.length === 0) return null;

    const targetJurisdiction = context.jurisdiction || context.detectedJurisdiction || null;

    return sources
      .slice()
      .sort((a, b) => {
        const tierDelta = tierRank(a.sourceTier) - tierRank(b.sourceTier);
        if (tierDelta !== 0) return tierDelta;

        if (targetJurisdiction) {
          const aMatch = a.jurisdiction === targetJurisdiction ? 1 : 0;
          const bMatch = b.jurisdiction === targetJurisdiction ? 1 : 0;
          if (bMatch !== aMatch) return bMatch - aMatch;
        }

        const aDate = parseDate(a.sourceDate);
        const bDate = parseDate(b.sourceDate);
        if (aDate && bDate) return bDate.getTime() - aDate.getTime();

        return (b.evidenceScore || 0) - (a.evidenceScore || 0);
      })[0];
  }

  determineSeverity(conflictTypes = [], sources = [], context = {}) {
    const complianceSensitive =
      context.intentId === "compliance" ||
      context.claimSensitivity === "regulatory_or_compliance_claim";

    if (complianceSensitive && conflictTypes.length > 0) {
      return "blocking";
    }

    if (conflictTypes.includes("authority_conflict")) {
      const hasOfficial = sources.some((source) => source.sourceTier === "primary_official");
      const hasUnsupported = sources.some((source) => source.sourceTier === "unsupported_or_unknown");
      if (hasOfficial && hasUnsupported) return "material";
    }

    if (conflictTypes.includes("freshness_conflict")) return "material";
    if (conflictTypes.includes("jurisdiction_conflict")) return "material";
    if (conflictTypes.includes("metric_definition_conflict")) return "moderate";

    return "moderate";
  }

  resolveAction(conflictTypes = [], severity = "moderate", context = {}) {
    if (severity === "blocking") {
      return "block_final_claim_until_current_official_source_or_confirmation";
    }

    if (conflictTypes.includes("freshness_conflict")) {
      return "prefer_current_authoritative_source_and_label_stale_source";
    }

    if (conflictTypes.includes("jurisdiction_conflict")) {
      return "prefer_exact_jurisdiction_source_and_label_other_sources_context";
    }

    if (conflictTypes.includes("metric_definition_conflict")) {
      return "align_metric_definitions_before_concluding";
    }

    if (conflictTypes.includes("authority_conflict")) {
      return "prefer_higher_authority_source";
    }

    return "surface_conflict_and_reduce_confidence";
  }
}

module.exports = {
  FinanceConflictingSourceResolver
};
