"use strict";

/**
 * R18D Layer 01 — Finance Intent Classifier
 * Orchestrates query normalization, pattern detection, confidence scoring,
 * route mapping, and envelope creation.
 *
 * No external dependencies.
 */

const { FinanceQueryShapeNormalizer } = require("./FinanceQueryShapeNormalizer");
const { FinanceIntentConfidence } = require("./FinanceIntentConfidence");
const { FinanceDomainRouteMap } = require("./FinanceDomainRouteMap");
const { FinanceIntentEnvelope } = require("./FinanceIntentEnvelope");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueArray(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function includesPhrase(matchText, phrase) {
  if (!matchText || !phrase) return false;

  const normalizedPhrase = String(phrase)
    .toLowerCase()
    .replace(/[^a-z0-9\s.%$€£¥+\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedPhrase) return false;

  return matchText.includes(normalizedPhrase);
}

function includesKeyword(matchText, keyword) {
  if (!matchText || !keyword) return false;

  const normalizedKeyword = String(keyword)
    .toLowerCase()
    .replace(/[^a-z0-9\s.%$€£¥+\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedKeyword) return false;

  /**
   * Multi-word finance terms are better matched by includes().
   * Single-token keywords use word boundaries.
   */
  if (normalizedKeyword.includes(" ")) {
    return matchText.includes(normalizedKeyword);
  }

  const regex = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, "i");
  return regex.test(matchText);
}

function matchList(matchText, values = [], matcher = includesKeyword) {
  return uniqueArray(
    values.filter((value) => matcher(matchText, value))
  );
}

class FinanceIntentClassifier {
  constructor(options = {}) {
    this.routeMap = options.routeMap || new FinanceDomainRouteMap({
      packDir: options.packDir
    });

    this.normalizer = options.normalizer || new FinanceQueryShapeNormalizer(options.normalizerOptions || {});
    this.confidence = options.confidence || new FinanceIntentConfidence(options.confidenceOptions || {});
  }

  detectJurisdictions(normalized, queryPatterns) {
    const markers = queryPatterns.jurisdictionMarkers || {};
    const detectedJurisdictions = [];
    const matchedMarkers = [];

    Object.entries(markers).forEach(([jurisdiction, terms]) => {
      const matches = matchList(normalized.matchText, terms, includesPhrase);

      if (matches.length > 0) {
        detectedJurisdictions.push(jurisdiction);
        matchedMarkers.push(...matches.map((match) => `${jurisdiction}:${match}`));
      }
    });

    return {
      detectedJurisdictions: uniqueArray(detectedJurisdictions),
      jurisdictionMarkers: uniqueArray(matchedMarkers)
    };
  }

  detectBoundaryTriggers(normalized, queryPatterns) {
    const triggers = queryPatterns.advisoryBoundaryTriggers || [];
    return matchList(normalized.matchText, triggers, includesPhrase);
  }

  detectRiskLanguage(normalized, queryPatterns) {
    const markers = queryPatterns.riskLanguageMarkers || [];
    return matchList(normalized.matchText, markers, includesPhrase);
  }

  detectFreshnessMarkers(normalized, queryPatterns) {
    const markers = queryPatterns.freshnessRequiredMarkers || [];
    const explicitMarkers = matchList(normalized.matchText, markers, includesPhrase);
    const timeMarkers = normalized.timeSignals && normalized.timeSignals.relativeTimeMarkers
      ? normalized.timeSignals.relativeTimeMarkers
      : [];

    return uniqueArray([...explicitMarkers, ...timeMarkers]);
  }

  detectComplianceLanguage(normalized) {
    return normalized.shape && normalized.shape.asksForCompliance === true;
  }

  detectSecondaryHintMatches(intentPattern = {}, rankedScores = []) {
    const hints = Array.isArray(intentPattern.secondaryIntentHints)
      ? intentPattern.secondaryIntentHints
      : [];

    const rankedIntentIds = rankedScores.map((score) => score.intentId);

    return hints.filter((hint) => rankedIntentIds.includes(hint));
  }

  scoreAllIntents(normalized, detections, queryPatterns) {
    const intentPatterns = queryPatterns.intentPatterns || {};
    const lanes = this.routeMap.getIntentLanes();
    const priority = this.routeMap.getDefaultIntentPriority();

    const scores = lanes.map((lane) => {
      const pattern = intentPatterns[lane.id] || {};
      const keywords = Array.isArray(pattern.keywords) ? pattern.keywords : [];
      const phrases = Array.isArray(pattern.phrasePatterns) ? pattern.phrasePatterns : [];

      const keywordMatches = matchList(normalized.matchText, keywords, includesKeyword);
      const phraseMatches = matchList(normalized.matchText, phrases, includesPhrase);

      return this.confidence.scoreIntent({
        intentId: lane.id,
        keywordMatches,
        phraseMatches,
        secondaryHintMatches: [],
        laneConfig: lane,
        normalized,
        advisoryBoundaryHit: detections.boundaryTriggers.length > 0,
        jurisdictionDetected: detections.detectedJurisdictions.length > 0,
        freshnessDetected: detections.freshnessMarkers.length > 0,
        riskLanguageDetected: detections.riskLanguage.length > 0,
        complianceLanguageDetected: detections.complianceLanguageDetected
      });
    });

    return this.confidence.rankScores(scores, priority);
  }

  applyForcedIntentRules(rankedScores, normalized, detections) {
    const scoreMap = new Map(rankedScores.map((score) => [score.intentId, { ...score }]));

    function boost(intentId, amount, driver) {
      if (!scoreMap.has(intentId)) return;

      const current = scoreMap.get(intentId);
      current.score = Math.min(1, Number((current.score + amount).toFixed(3)));
      current.band = FinanceIntentConfidence.getBand(current.score);
      current.drivers = uniqueArray([...(current.drivers || []), driver]);
      scoreMap.set(intentId, current);
    }

    if (detections.boundaryTriggers.length > 0 || normalized.shape.asksForCompliance) {
      boost("compliance", 0.18, "forced_rule:compliance_or_boundary_language");
    }

    if (normalized.shape.asksForSources) {
      boost("source_lookup", 0.16, "forced_rule:source_lookup_shape");
    }

    if (normalized.shape.asksForRisk) {
      boost("commercial_risk", 0.12, "forced_rule:risk_shape");
    }

    if (normalized.shape.asksForFramework) {
      boost("case_study", 0.06, "forced_rule:framework_shape");
    }

    const priority = this.routeMap.getDefaultIntentPriority();
    return this.confidence.rankScores(Array.from(scoreMap.values()), priority);
  }

  selectPrimaryAndSecondary(rankedScores) {
    const viable = rankedScores.filter((score) => score.score >= 0.35);

    if (viable.length === 0) {
      const fallback = rankedScores[0] || {
        intentId: "commercial_risk",
        score: 0.35,
        band: "low"
      };

      return {
        primary: fallback.intentId,
        secondary: [],
        selectedScore: {
          ...fallback,
          score: Math.max(fallback.score || 0, 0.35),
          band: "low"
        }
      };
    }

    const primary = viable[0];
    const secondary = viable
      .slice(1)
      .filter((score) => score.score >= 0.4)
      .map((score) => score.intentId)
      .slice(0, 4);

    return {
      primary: primary.intentId,
      secondary,
      selectedScore: primary
    };
  }

  buildMissingContext(primaryIntent, secondaryIntents, route, normalized, detections) {
    const missing = [];

    if (route.requiresJurisdiction && detections.detectedJurisdictions.length === 0) {
      missing.push("jurisdiction");
    }

    if (normalized.shape.asksForPrediction && !normalized.shape.containsTimeMarkers) {
      missing.push("time_horizon");
    }

    const allIntents = uniqueArray([primaryIntent, ...secondaryIntents]);

    if (allIntents.includes("cashflow") && !normalized.shape.containsNumbers) {
      missing.push("cash_on_hand_monthly_burn_or_revenue_timing");
    }

    if (allIntents.includes("unit_economics") && !normalized.shape.containsNumbers) {
      missing.push("pricing_cac_ltv_margin_or_retention_inputs");
    }

    if (allIntents.includes("credit_debt") && !normalized.shape.containsNumbers) {
      missing.push("loan_amount_interest_rate_payment_or_cashflow_inputs");
    }

    if (allIntents.includes("compliance") && detections.detectedJurisdictions.length === 0) {
      missing.push("applicable_regulatory_jurisdiction");
    }

    return uniqueArray(missing);
  }

  classify(query, options = {}) {
    const normalized = this.normalizer.normalize(query, options);
    const queryPatterns = this.routeMap.getQueryPatterns();

    if (normalized.shape.isEmpty) {
      return FinanceIntentEnvelope.create({
        originalQuery: normalized.originalQuery,
        normalizedQuery: normalized.normalizedQuery,
        queryShape: normalized.shape,
        primaryIntent: "unknown",
        secondaryIntents: [],
        confidence: 0,
        confidenceBand: "insufficient",
        requiresJurisdiction: false,
        requiresFreshData: false,
        requiresSourceCheck: false,
        advisoryBoundaryRequired: true,
        recommendedSourcePacks: [],
        responseLane: null,
        route: null,
        matchedSignals: {
          keywords: [],
          phrases: [],
          riskLanguage: [],
          freshnessMarkers: [],
          jurisdictionMarkers: []
        },
        boundaryTriggers: [],
        missingContext: ["query_text"],
        notes: ["Empty finance query cannot be classified."]
      });
    }

    const jurisdictionDetection = this.detectJurisdictions(normalized, queryPatterns);
    const boundaryTriggers = this.detectBoundaryTriggers(normalized, queryPatterns);
    const riskLanguage = this.detectRiskLanguage(normalized, queryPatterns);
    const freshnessMarkers = this.detectFreshnessMarkers(normalized, queryPatterns);
    const complianceLanguageDetected = this.detectComplianceLanguage(normalized);

    const detections = {
      ...jurisdictionDetection,
      boundaryTriggers,
      riskLanguage,
      freshnessMarkers,
      complianceLanguageDetected
    };

    const rawScores = this.scoreAllIntents(normalized, detections, queryPatterns);
    const rankedScores = this.applyForcedIntentRules(rawScores, normalized, detections);

    const selection = this.selectPrimaryAndSecondary(rankedScores);
    const route = this.routeMap.resolveRoute(
      selection.primary,
      selection.secondary,
      {
        advisoryBoundaryHit: boundaryTriggers.length > 0,
        freshnessDetected: freshnessMarkers.length > 0
      }
    );

    const missingContext = this.buildMissingContext(
      selection.primary,
      selection.secondary,
      route,
      normalized,
      detections
    );

    const topScore = selection.selectedScore || rankedScores[0] || {
      score: 0.35,
      band: "low"
    };

    const allMatchedKeywords = uniqueArray(
      rankedScores.flatMap((score) => score.keywordMatches || [])
    );

    const allMatchedPhrases = uniqueArray(
      rankedScores.flatMap((score) => score.phraseMatches || [])
    );

    const notes = [];

    if (missingContext.length > 0) {
      notes.push(`missing_context:${missingContext.join(",")}`);
    }

    if (boundaryTriggers.length > 0) {
      notes.push("advisory_boundary_triggered");
    }

    if (route.requiresSourceCheck) {
      notes.push("handoff_required:layer02_source_authority");
    }

    return FinanceIntentEnvelope.create({
      originalQuery: normalized.originalQuery,
      normalizedQuery: normalized.normalizedQuery,
      queryShape: normalized.shape,

      primaryIntent: selection.primary,
      secondaryIntents: selection.secondary,
      confidence: topScore.score,
      confidenceBand: topScore.band,
      intentScores: rankedScores.slice(0, 8),

      requiresJurisdiction: route.requiresJurisdiction,
      detectedJurisdictions: detections.detectedJurisdictions,
      requiresFreshData: route.requiresFreshData,
      requiresSourceCheck: route.requiresSourceCheck,
      advisoryBoundaryRequired: route.advisoryBoundaryRequired,

      recommendedSourcePacks: route.recommendedSourcePacks,
      responseLane: route.responseLane,
      route,

      matchedSignals: {
        keywords: allMatchedKeywords,
        phrases: allMatchedPhrases,
        riskLanguage,
        freshnessMarkers,
        jurisdictionMarkers: detections.jurisdictionMarkers
      },

      boundaryTriggers,
      missingContext,
      notes
    });
  }

  getLoadStatus() {
    return this.routeMap.getLoadStatus();
  }

  static classify(query, options = {}) {
    return new FinanceIntentClassifier(options).classify(query, options);
  }
}

module.exports = {
  FinanceIntentClassifier
};
