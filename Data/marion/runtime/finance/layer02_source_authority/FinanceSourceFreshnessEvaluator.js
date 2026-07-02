"use strict";

/**
 * R18D Layer 02 — Finance Source Freshness Evaluator
 * Evaluates whether a finance source is fresh enough for the claim type.
 *
 * No external dependencies.
 */

const fs = require("fs");
const path = require("path");

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

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function daysBetween(later, earlier) {
  const ms = later.getTime() - earlier.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function includesAny(text, values = []) {
  const safe = String(text || "").toLowerCase();
  return values.some((value) => safe.includes(String(value).toLowerCase()));
}

class FinanceSourceFreshnessEvaluator {
  constructor(options = {}) {
    this.packDir = options.packDir ? path.resolve(options.packDir) : DEFAULT_PACK_DIR;

    this.rules = safeReadJson(
      path.join(this.packDir, "fin_source_freshness_rules_v1.json"),
      {
        freshnessMarkers: [],
        claimTypeRules: {},
        intentFreshnessRules: {},
        sourceTypeFreshnessRules: {},
        freshnessStatusLabels: {}
      }
    );

    this.now = options.now ? parseDate(options.now) || new Date() : new Date();
  }

  getLoadStatus() {
    return {
      packDir: this.packDir,
      freshnessRulesLoaded: !this.rules.__loadError,
      errors: [this.rules.__loadError ? this.rules : null].filter(Boolean)
    };
  }

  detectFreshnessRequiredFromText(text = "") {
    return includesAny(text, this.rules.freshnessMarkers || []);
  }

  resolveRule({ claimType, intentId, sourceType } = {}) {
    const claimRule = claimType && this.rules.claimTypeRules
      ? this.rules.claimTypeRules[claimType]
      : null;

    const intentRule = intentId && this.rules.intentFreshnessRules
      ? this.rules.intentFreshnessRules[intentId]
      : null;

    const sourceRule = sourceType && this.rules.sourceTypeFreshnessRules
      ? this.rules.sourceTypeFreshnessRules[sourceType]
      : null;

    return {
      claimRule,
      intentRule,
      sourceRule
    };
  }

  evaluate(input = {}) {
    const {
      sourceDate = null,
      claimType = "unknown",
      intentId = "unknown",
      sourceType = "unknown",
      queryText = "",
      currentRequired = false
    } = input;

    const { claimRule, intentRule, sourceRule } = this.resolveRule({
      claimType,
      intentId,
      sourceType
    });

    const freshnessFromText = this.detectFreshnessRequiredFromText(queryText);
    const freshnessRequired =
      Boolean(currentRequired) ||
      freshnessFromText ||
      Boolean(claimRule && claimRule.freshnessRequired) ||
      Boolean(intentRule && intentRule.freshnessRequired) ||
      Boolean(sourceRule && sourceRule.freshnessRequired);

    const maximumAgeDays =
      (claimRule && claimRule.maximumAgeDays !== undefined ? claimRule.maximumAgeDays : undefined) ??
      (sourceRule && sourceRule.defaultMaximumAgeDays !== undefined ? sourceRule.defaultMaximumAgeDays : undefined) ??
      (intentRule && intentRule.defaultMaximumAgeDays !== undefined ? intentRule.defaultMaximumAgeDays : undefined) ??
      null;

    const parsedDate = parseDate(sourceDate);

    if (!freshnessRequired) {
      return {
        domain: "finance",
        layer: "source_freshness",
        freshnessRequired: false,
        freshnessStatus: "dated_but_usable",
        maximumAgeDays,
        sourceDate,
        sourceAgeDays: parsedDate ? daysBetween(this.now, parsedDate) : null,
        claimType,
        confidenceImpact: "neutral",
        notes: ["Freshness not required for this framework or user-supplied analysis."]
      };
    }

    if (!parsedDate) {
      return {
        domain: "finance",
        layer: "source_freshness",
        freshnessRequired: true,
        freshnessStatus: "unknown_freshness",
        maximumAgeDays,
        sourceDate: null,
        sourceAgeDays: null,
        claimType,
        confidenceImpact: "decrease",
        notes: ["Source date is missing or invalid for a freshness-sensitive finance claim."]
      };
    }

    const sourceAgeDays = daysBetween(this.now, parsedDate);

    if (maximumAgeDays === null || maximumAgeDays === undefined) {
      return {
        domain: "finance",
        layer: "source_freshness",
        freshnessRequired: true,
        freshnessStatus: "current",
        maximumAgeDays,
        sourceDate,
        sourceAgeDays,
        claimType,
        confidenceImpact: "neutral",
        notes: ["Freshness required, but no maximum age rule is defined for this source or claim type."]
      };
    }

    if (sourceAgeDays <= maximumAgeDays) {
      return {
        domain: "finance",
        layer: "source_freshness",
        freshnessRequired: true,
        freshnessStatus: "current",
        maximumAgeDays,
        sourceDate,
        sourceAgeDays,
        claimType,
        confidenceImpact: "increase",
        notes: ["Source is fresh enough for this finance claim."]
      };
    }

    return {
      domain: "finance",
      layer: "source_freshness",
      freshnessRequired: true,
      freshnessStatus: "stale_for_current_claim",
      maximumAgeDays,
      sourceDate,
      sourceAgeDays,
      claimType,
      confidenceImpact: "decrease",
      notes: ["Source is stale for a current or time-sensitive finance claim."]
    };
  }
}

module.exports = {
  FinanceSourceFreshnessEvaluator
};
