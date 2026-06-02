"use strict";

/**
 * AsterRiskTagger.js
 *
 * Runtime role:
 * - Assess normalized environmental readings.
 * - Attach risk level, tags, and reason codes.
 * - Stay observational only.
 * - Never authorize final public answers.
 *
 * Architecture:
 * AsterSensorNormalizer -> AsterContextClassifier -> AsterRiskTagger -> AsterObservationEnvelope -> Marion final authority
 */

const fs = require("fs");
const path = require("path");

const VERSION = "0.1.0";
const ASTER_RISK_SCHEMA = "nyx.marion.aster.risk/1.0";

const DEFAULT_THRESHOLDS = Object.freeze({
  temperatureC: Object.freeze({
    low: 27,
    moderate: 32,
    elevated: 36,
    high: 40
  }),
  humidityPercent: Object.freeze({
    low: 65,
    moderate: 75,
    elevated: 85,
    high: 95
  }),
  airQualityIndex: Object.freeze({
    low: 51,
    moderate: 101,
    elevated: 151,
    high: 201
  }),
  windKph: Object.freeze({
    low: 25,
    moderate: 40,
    elevated: 60,
    high: 90
  }),
  uvIndex: Object.freeze({
    low: 3,
    moderate: 6,
    elevated: 8,
    high: 11
  }),
  co2Ppm: Object.freeze({
    low: 800,
    moderate: 1200,
    elevated: 2000,
    high: 5000
  }),
  noiseDb: Object.freeze({
    low: 55,
    moderate: 70,
    elevated: 85,
    high: 100
  }),
  pm25: Object.freeze({
    low: 12,
    moderate: 35,
    elevated: 55,
    high: 150
  }),
  pm10: Object.freeze({
    low: 55,
    moderate: 155,
    elevated: 255,
    high: 355
  }),
  vocIndex: Object.freeze({
    low: 100,
    moderate: 200,
    elevated: 300,
    high: 400
  })
});

const RISK_RANK = Object.freeze({
  none: 0,
  low: 1,
  moderate: 2,
  elevated: 3,
  high: 4,
  unknown: -1
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).replace(/\s+/g, " ").trim() || fallback;
}

function safeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "");
    if (!cleaned) return null;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function nowIso() {
  return new Date().toISOString();
}

function loadAsterConfig() {
  const candidates = [
    path.join(__dirname, "asterConfig.json"),
    path.join(process.cwd(), "Data", "marion", "runtime", "aster", "asterConfig.json"),
    path.join(process.cwd(), "Data", "marion", "runtime", "asterConfig.json")
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8");
      if (!raw.trim()) continue;
      return JSON.parse(raw);
    } catch (_) {
      return {};
    }
  }

  return {};
}

function getThresholds(config = {}) {
  const configured =
    isPlainObject(config.riskTagging) && isPlainObject(config.riskTagging.thresholds)
      ? config.riskTagging.thresholds
      : {};

  return {
    ...DEFAULT_THRESHOLDS,
    ...configured
  };
}

function normalizeReadings(input = {}) {
  if (!isPlainObject(input)) return {};

  if (isPlainObject(input.normalized)) return input.normalized;
  if (isPlainObject(input.readings)) return input.readings;
  if (isPlainObject(input.observation) && isPlainObject(input.observation.normalized)) {
    return input.observation.normalized;
  }
  if (isPlainObject(input.observation) && isPlainObject(input.observation.readings)) {
    return input.observation.readings;
  }

  return input;
}

function riskLevelForValue(metric, value, thresholds) {
  const numeric = safeNumber(value);
  const table = isPlainObject(thresholds[metric]) ? thresholds[metric] : null;

  if (numeric === null || !table) {
    return {
      metric,
      value,
      numeric: null,
      level: "unknown",
      reasonCode: `risk.${metric}.unreadable`
    };
  }

  if (numeric >= Number(table.high)) {
    return {
      metric,
      value,
      numeric,
      level: "high",
      reasonCode: `risk.${metric}.high`
    };
  }

  if (numeric >= Number(table.elevated)) {
    return {
      metric,
      value,
      numeric,
      level: "elevated",
      reasonCode: `risk.${metric}.elevated`
    };
  }

  if (numeric >= Number(table.moderate)) {
    return {
      metric,
      value,
      numeric,
      level: "moderate",
      reasonCode: `risk.${metric}.moderate`
    };
  }

  if (numeric >= Number(table.low)) {
    return {
      metric,
      value,
      numeric,
      level: "low",
      reasonCode: `risk.${metric}.low`
    };
  }

  return {
    metric,
    value,
    numeric,
    level: "none",
    reasonCode: `risk.${metric}.normal`
  };
}

function strongestRiskLevel(items) {
  let strongest = "none";

  for (const item of items || []) {
    const level = safeString(item.level, "unknown");
    const currentRank = RISK_RANK[level] ?? -1;
    const strongestRank = RISK_RANK[strongest] ?? -1;

    if (currentRank > strongestRank) {
      strongest = level;
    }
  }

  return strongest;
}

function tagsForLevel(level, context = "") {
  const tags = ["risk"];

  if (context) {
    tags.push(context);
  }

  if (level === "high") {
    tags.push("high", "caution", "review-required");
  } else if (level === "elevated") {
    tags.push("elevated", "caution", "watch");
  } else if (level === "moderate") {
    tags.push("moderate", "watch");
  } else if (level === "low") {
    tags.push("low", "stable-watch");
  } else if (level === "none") {
    tags.push("low", "normal", "stable");
  } else {
    tags.push("unknown", "fallback");
  }

  return Array.from(new Set(tags.filter(Boolean)));
}

function summarizeReasonCodes(metricAssessments) {
  return (metricAssessments || [])
    .filter((item) => item && item.reasonCode)
    .map((item) => item.reasonCode);
}

function buildRiskPayload(input = {}, options = {}) {
  const config = loadAsterConfig();
  const thresholds = getThresholds(config);

  const context = safeString(
    input.context ||
      input.classification ||
      (isPlainObject(input.observation) ? input.observation.context : "") ||
      "environment.unknown"
  );

  const source = safeString(input.source || options.source || "aster-risk-tagger");
  const readings = normalizeReadings(input);

  const metricAssessments = [];

  for (const metric of Object.keys(thresholds)) {
    if (!Object.prototype.hasOwnProperty.call(readings, metric)) continue;
    metricAssessments.push(riskLevelForValue(metric, readings[metric], thresholds));
  }

  const level = metricAssessments.length
    ? strongestRiskLevel(metricAssessments)
    : "unknown";

  const reasonCodes = summarizeReasonCodes(metricAssessments);
  const tags = tagsForLevel(level, context);

  const warnings = [];

  if (!metricAssessments.length) {
    warnings.push("no-supported-risk-metrics-found");
  }

  for (const item of metricAssessments) {
    if (item.level === "unknown") {
      warnings.push(`unreadable-risk-metric:${item.metric}`);
    }
  }

  const risk = {
    schema: ASTER_RISK_SCHEMA,
    version: VERSION,
    gateway: "Aster",
    role: "environmental-risk-tagging",
    observational: true,
    level,
    tags,
    reasonCodes,
    metricAssessments,
    publicAlarm: false,
    source,
    context: context || "environment.unknown",
    warnings,
    createdAt: nowIso()
  };

  return {
    ok: true,
    version: VERSION,
    schema: ASTER_RISK_SCHEMA,
    gateway: "Aster",
    aster: {
      gateway: "Aster",
      module: "AsterRiskTagger",
      observational: true
    },
    risk,
    riskLevel: level,
    tags,
    reasonCodes,
    metricAssessments,
    context: context || "environment.unknown",
    source,
    warnings,
    publicAlarm: false,

    /**
     * Authority guardrails.
     * Aster observes and tags. Marion authorizes public final output.
     */
    finalAnswerAuthorized: false,
    marionAuthorityRequired: true,
    publicAgent: "nyx",
    displayAuthority: "nyx",
    updatedAt: Date.now()
  };
}

function tagAsterRisk(input = {}, options = {}) {
  try {
    return buildRiskPayload(isPlainObject(input) ? input : {}, options);
  } catch (error) {
    return {
      ok: false,
      version: VERSION,
      schema: ASTER_RISK_SCHEMA,
      gateway: "Aster",
      aster: {
        gateway: "Aster",
        module: "AsterRiskTagger",
        observational: true
      },
      risk: {
        schema: ASTER_RISK_SCHEMA,
        version: VERSION,
        level: "unknown",
        tags: ["risk", "unknown", "fallback"],
        reasonCodes: ["risk.tagger.error"],
        metricAssessments: [],
        publicAlarm: false,
        warnings: ["risk-tagger-failed"],
        error: error && error.message ? error.message : "unknown-error",
        createdAt: nowIso()
      },
      riskLevel: "unknown",
      tags: ["risk", "unknown", "fallback"],
      reasonCodes: ["risk.tagger.error"],
      warnings: ["risk-tagger-failed"],
      publicAlarm: false,
      finalAnswerAuthorized: false,
      marionAuthorityRequired: true,
      publicAgent: "nyx",
      displayAuthority: "nyx",
      updatedAt: Date.now()
    };
  }
}

function tagEnvironmentRisk(input = {}, options = {}) {
  return tagAsterRisk(input, options);
}

function tagRisk(input = {}, options = {}) {
  return tagAsterRisk(input, options);
}

function assessRisk(input = {}, options = {}) {
  return tagAsterRisk(input, options);
}

function classifyRisk(input = {}, options = {}) {
  return tagAsterRisk(input, options);
}

function run(input = {}, options = {}) {
  return tagAsterRisk(input, options);
}

module.exports = {
  VERSION,
  ASTER_RISK_SCHEMA,
  tagAsterRisk,
  tagEnvironmentRisk,
  tagRisk,
  assessRisk,
  classifyRisk,
  run,
  default: tagAsterRisk,

  /**
   * Exported for tests/diagnostics.
   */
  _internal: {
    loadAsterConfig,
    getThresholds,
    normalizeReadings,
    riskLevelForValue,
    strongestRiskLevel,
    tagsForLevel
  }
};
