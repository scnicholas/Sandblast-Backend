"use strict";

/**
 * R18D Layer 01 — Finance Domain Route Map
 * Loads Layer 1 finance packs and resolves source packs / response lanes.
 *
 * Expected pack path:
 * /Data/Domains/finance/packs/
 *
 * No external dependencies.
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_PACK_DIR = path.resolve(__dirname, "../../../../Domains/finance/packs");

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_) {
    return false;
  }
}

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fileExists(filePath)) return fallback;

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

function uniqueArray(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

class FinanceDomainRouteMap {
  constructor(options = {}) {
    this.packDir = options.packDir
      ? path.resolve(options.packDir)
      : DEFAULT_PACK_DIR;

    this.taxonomy = safeReadJson(
      path.join(this.packDir, "fin_intent_taxonomy_v1.json"),
      { intentLanes: [], defaultIntentPriority: [] }
    );

    this.responseLanes = safeReadJson(
      path.join(this.packDir, "fin_response_lanes_v1.json"),
      { responseLanes: {}, globalResponseRules: [] }
    );

    this.queryPatterns = safeReadJson(
      path.join(this.packDir, "fin_query_patterns_v1.json"),
      { intentPatterns: {}, jurisdictionMarkers: {} }
    );
  }

  getLoadStatus() {
    return {
      packDir: this.packDir,
      taxonomyLoaded: !this.taxonomy.__loadError,
      responseLanesLoaded: !this.responseLanes.__loadError,
      queryPatternsLoaded: !this.queryPatterns.__loadError,
      errors: [
        this.taxonomy.__loadError ? this.taxonomy : null,
        this.responseLanes.__loadError ? this.responseLanes : null,
        this.queryPatterns.__loadError ? this.queryPatterns : null
      ].filter(Boolean)
    };
  }

  getIntentLanes() {
    return Array.isArray(this.taxonomy.intentLanes)
      ? this.taxonomy.intentLanes
      : [];
  }

  getIntentLane(intentId) {
    return this.getIntentLanes().find((lane) => lane.id === intentId) || null;
  }

  getDefaultIntentPriority() {
    return Array.isArray(this.taxonomy.defaultIntentPriority)
      ? this.taxonomy.defaultIntentPriority
      : [];
  }

  getQueryPatterns() {
    return this.queryPatterns || { intentPatterns: {}, jurisdictionMarkers: {} };
  }

  getResponseLane(intentId) {
    if (!this.responseLanes || !this.responseLanes.responseLanes) return null;
    return this.responseLanes.responseLanes[intentId] || null;
  }

  getRecommendedSourcePacks(intentIds = []) {
    const packs = [];

    intentIds.forEach((intentId) => {
      const lane = this.getIntentLane(intentId);
      if (lane && Array.isArray(lane.sourcePacks)) {
        packs.push(...lane.sourcePacks);
      }
    });

    return uniqueArray(packs);
  }

  resolveFlags(intentIds = [], detected = {}) {
    const lanes = intentIds
      .map((intentId) => this.getIntentLane(intentId))
      .filter(Boolean);

    const requiresJurisdiction = lanes.some((lane) => lane.requiresJurisdiction === true);
    const requiresFreshData = lanes.some((lane) => lane.requiresFreshData === true) || detected.freshnessDetected === true;
    const requiresSourceCheck = lanes.some((lane) => lane.requiresSourceCheck === true) || requiresFreshData;
    const advisoryBoundaryRequired = lanes.some((lane) => lane.advisoryBoundaryRequired === true) || detected.advisoryBoundaryHit === true;

    return {
      requiresJurisdiction,
      requiresFreshData,
      requiresSourceCheck,
      advisoryBoundaryRequired
    };
  }

  resolveRoute(primaryIntent, secondaryIntents = [], detected = {}) {
    const allIntents = uniqueArray([primaryIntent, ...secondaryIntents]);
    const primaryLane = this.getIntentLane(primaryIntent);
    const responseLane = this.getResponseLane(primaryIntent);
    const flags = this.resolveFlags(allIntents, detected);

    return {
      domain: "finance",
      primaryIntent,
      secondaryIntents,
      allIntents,
      primaryLane,
      responseLane,
      recommendedSourcePacks: this.getRecommendedSourcePacks(allIntents),
      ...flags
    };
  }
}

module.exports = {
  FinanceDomainRouteMap,
  DEFAULT_PACK_DIR
};
