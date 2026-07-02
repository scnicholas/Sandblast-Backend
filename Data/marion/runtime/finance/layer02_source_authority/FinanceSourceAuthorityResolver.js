"use strict";

/**
 * R18D Layer 02 — Finance Source Authority Resolver
 * Resolves source authority, freshness, evidence ranking, and source envelope.
 *
 * No external dependencies.
 */

const fs = require("fs");
const path = require("path");

const { FinanceEvidenceRanker } = require("./FinanceEvidenceRanker");
const { FinanceSourceEnvelope } = require("./FinanceSourceEnvelope");

const DEFAULT_PACK_DIR = path.resolve(__dirname, "../../../../Domains/finance/packs");

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

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function uniqueArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

class FinanceSourceAuthorityResolver {
  constructor(options = {}) {
    this.packDir = options.packDir ? path.resolve(options.packDir) : DEFAULT_PACK_DIR;

    this.authorityRules = safeReadJson(
      path.join(this.packDir, "fin_source_authority_v1.json"),
      {
        authorityTiers: [],
        sourceTypeRules: {},
        intentAuthorityRequirements: {}
      }
    );

    this.sourceIndex = safeReadJson(
      path.join(this.packDir, "fin_sources_index_v1.json"),
      {
        categories: {},
        currentOfficialAnchors: []
      }
    );

    this.ranker = options.ranker || new FinanceEvidenceRanker({
      packDir: this.packDir,
      now: options.now
    });
  }

  getLoadStatus() {
    return {
      packDir: this.packDir,
      sourceAuthorityLoaded: !this.authorityRules.__loadError,
      sourcesIndexLoaded: !this.sourceIndex.__loadError,
      ranker: this.ranker.getLoadStatus(),
      errors: [
        this.authorityRules.__loadError ? this.authorityRules : null,
        this.sourceIndex.__loadError ? this.sourceIndex : null
      ].filter(Boolean)
    };
  }

  getAuthorityTier(tierName) {
    const tiers = Array.isArray(this.authorityRules.authorityTiers)
      ? this.authorityRules.authorityTiers
      : [];

    return tiers.find((tier) => tier.tier === tierName) || null;
  }

  getSourceTypeRule(sourceType) {
    if (!sourceType || !this.authorityRules.sourceTypeRules) return null;
    return this.authorityRules.sourceTypeRules[sourceType] || null;
  }

  inferSourceType(source = {}) {
    const name = normalize(source.sourceName || source.name || source.title);
    const type = normalize(source.sourceType || source.type);

    if (type) return type;

    if (name.includes("bank of canada") || name.includes("federal reserve") || name.includes("central bank")) {
      return "central_bank";
    }

    if (name.includes("statistics canada") || name.includes("statistical") || name.includes("census")) {
      return "official_statistics";
    }

    if (name.includes("sec") || name.includes("securities") || name.includes("osc") || name.includes("fca")) {
      return "securities_regulator";
    }

    if (name.includes("cra") || name.includes("irs") || name.includes("tax")) {
      return "tax_authority";
    }

    if (name.includes("sedar") || name.includes("edgar") || name.includes("10-k") || name.includes("annual report")) {
      return "regulatory_filings";
    }

    if (name.includes("imf") || name.includes("world bank") || name.includes("oecd") || name.includes("bis")) {
      return "multilateral_data";
    }

    if (name.includes("financial times") || name.includes("wall street journal") || name.includes("bloomberg") || name.includes("reuters") || name.includes("economist")) {
      return "major_financial_press";
    }

    if (name.includes("grant") || name.includes("program") || name.includes("government")) {
      return "government_program";
    }

    if (source.userProvided === true) {
      return "user_provided_data";
    }

    return "unknown_source";
  }

  resolveOne(source = {}, context = {}) {
    const sourceType = this.inferSourceType(source);
    const typeRule = this.getSourceTypeRule(sourceType);

    const preferredTier = source.sourceTier ||
      (typeRule && typeRule.preferredTier) ||
      "unsupported_or_unknown";

    const tierRule = this.getAuthorityTier(preferredTier);

    const authorityWeight = Number(
      source.authorityWeight ??
      (typeRule && typeRule.authorityWeight) ??
      (tierRule && tierRule.authorityWeight) ??
      0.2
    );

    const citationRequired = Boolean(
      source.citationRequired ??
      (tierRule && tierRule.citationRequired)
    );

    const allowedUses = uniqueArray([
      ...(source.allowedUses || []),
      ...((typeRule && typeRule.bestFor) || []),
      ...((tierRule && tierRule.allowedUses) || [])
    ]);

    const limitations = uniqueArray([
      ...(source.limitations || []),
      ...((tierRule && tierRule.limitations) || [])
    ]);

    return {
      sourceName: source.sourceName || source.name || source.title || "unknown_source",
      sourceType,
      sourceTier: preferredTier,
      authorityWeight,
      citationRequired,
      freshnessRequired: Boolean(typeRule && typeRule.requiresFreshness),
      allowedUses,
      limitations,

      sourceDate: source.sourceDate || source.date || null,
      jurisdiction: source.jurisdiction || context.jurisdiction || null,
      metricDefinition: source.metricDefinition || null,

      relevanceScore: source.relevanceScore,
      specificityScore: source.specificityScore,
      consistencyScore: source.consistencyScore,

      userProvided: Boolean(source.userProvided),
      url: source.url || null,
      notes: source.notes || []
    };
  }

  resolve(input = {}) {
    const {
      sources = [],
      intentContext = {},
      claim = "",
      claimType = "unknown",
      claimSensitivity = "business_decision_support",
      queryText = ""
    } = input;

    const normalizedSources = Array.isArray(sources)
      ? sources.map((source) => this.resolveOne(source, intentContext))
      : [];

    const ranking = this.ranker.rank({
      sources: normalizedSources,
      intentContext,
      claim,
      claimType,
      claimSensitivity,
      queryText
    });

    const blocking =
      ranking.conflict.confidenceImpact === "block" ||
      ranking.aggregateEvidenceScore < 0.4;

    return FinanceSourceEnvelope.create({
      intentContext,
      claim,
      claimType,
      claimSensitivity,

      sources: normalizedSources,
      rankedSources: ranking.rankedSources,

      aggregateEvidenceScore: ranking.aggregateEvidenceScore,
      evidenceBand: ranking.evidenceBand,
      citationRequired: ranking.citationRequired,
      freshnessRequired: ranking.freshnessRequired,
      sourceAuthorityRequired: true,

      conflict: ranking.conflict,
      missingEvidence: ranking.missingEvidence,
      limitations: uniqueArray(normalizedSources.flatMap((source) => source.limitations || [])),
      notes: ranking.notes,

      complianceBoundaryRequired:
        intentContext.primaryIntent === "compliance" ||
        claimSensitivity === "regulatory_or_compliance_claim",

      blocking
    });
  }

  static resolve(input = {}, options = {}) {
    return new FinanceSourceAuthorityResolver(options).resolve(input);
  }
}

module.exports = {
  FinanceSourceAuthorityResolver
};
