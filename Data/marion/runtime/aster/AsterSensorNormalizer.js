"use strict";

/**
 * AsterSensorNormalizer.js
 *
 * Runtime role:
 * - Normalize environmental sensor readings.
 * - Coerce safe numeric values.
 * - Clamp configured environmental ranges.
 * - Preserve raw readings.
 * - Fail closed without crashing Marion.
 *
 * Architecture:
 * AsterSensorNormalizer -> AsterContextClassifier -> AsterRiskTagger -> AsterObservationEnvelope -> Marion final authority
 */

const fs = require("fs");
const path = require("path");

const VERSION = "0.1.0";
const ASTER_NORMALIZATION_SCHEMA = "nyx.marion.aster.normalizedSensor/1.0";

const DEFAULT_RANGES = Object.freeze({
  temperatureC: Object.freeze({ min: -60, max: 60 }),
  humidityPercent: Object.freeze({ min: 0, max: 100 }),
  airQualityIndex: Object.freeze({ min: 0, max: 500 }),
  windKph: Object.freeze({ min: 0, max: 300 }),
  pressureHpa: Object.freeze({ min: 800, max: 1100 }),
  precipitationMm: Object.freeze({ min: 0, max: 500 }),
  uvIndex: Object.freeze({ min: 0, max: 15 }),
  pm25: Object.freeze({ min: 0, max: 1000 }),
  pm10: Object.freeze({ min: 0, max: 2000 }),
  co2Ppm: Object.freeze({ min: 250, max: 10000 }),
  vocIndex: Object.freeze({ min: 0, max: 500 }),
  noiseDb: Object.freeze({ min: 0, max: 160 }),
  lightLux: Object.freeze({ min: 0, max: 200000 })
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).replace(/\s+/g, " ").trim() || fallback;
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

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return {};
  }
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

function clampNumber(value, range) {
  if (!isPlainObject(range)) return value;

  let output = value;

  if (typeof range.min === "number" && output < range.min) {
    output = range.min;
  }

  if (typeof range.max === "number" && output > range.max) {
    output = range.max;
  }

  return output;
}

function getConfiguredRanges(config = {}) {
  const configured =
    isPlainObject(config.normalization) && isPlainObject(config.normalization.ranges)
      ? config.normalization.ranges
      : {};

  return {
    ...DEFAULT_RANGES,
    ...configured
  };
}

function extractReadings(input = {}) {
  if (!isPlainObject(input)) return {};

  if (isPlainObject(input.readings)) return input.readings;
  if (isPlainObject(input.normalized)) return input.normalized;

  if (isPlainObject(input.observation)) {
    if (isPlainObject(input.observation.readings)) return input.observation.readings;
    if (isPlainObject(input.observation.normalized)) return input.observation.normalized;
  }

  return {};
}

function normalizeSensorType(sensorType) {
  const raw = safeString(sensorType, "unknown");
  const compact = raw.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();

  if (compact === "weather") return "weather";
  if (compact === "airquality") return "airQuality";
  if (compact === "indoorenvironment" || compact === "indoor") return "indoorEnvironment";
  if (compact === "locationcontext" || compact === "location") return "locationContext";

  return raw || "unknown";
}

function normalizeMetricValue(metric, value, ranges) {
  const numeric = safeNumber(value);

  if (numeric === null) {
    return {
      metric,
      rawValue: value,
      valid: false,
      normalizedValue: null,
      warning: `invalid-reading:${metric}`
    };
  }

  const range = ranges[metric];
  const clamped = clampNumber(numeric, range);

  return {
    metric,
    rawValue: value,
    valid: true,
    normalizedValue: clamped,
    clamped: clamped !== numeric,
    warning: clamped !== numeric ? `clamped-reading:${metric}` : ""
  };
}

function buildNormalizedPayload(input = {}, options = {}) {
  const config = loadAsterConfig();
  const ranges = getConfiguredRanges(config);

  const source = safeString(input.source || options.source || "aster-sensor-normalizer");
  const sensorType = normalizeSensorType(
    input.sensorType ||
      (isPlainObject(input.observation) ? input.observation.sensorType : "") ||
      options.sensorType ||
      "unknown"
  );

  const timestamp = safeString(
    input.timestamp ||
      (isPlainObject(input.observation) ? input.observation.timestamp : "") ||
      options.timestamp ||
      nowIso()
  );

  const rawReadings = cloneJson(extractReadings(input));
  const normalized = {};
  const invalid = {};
  const warnings = [];
  const metricResults = [];

  for (const [metric, value] of Object.entries(rawReadings)) {
    if (!Object.prototype.hasOwnProperty.call(ranges, metric)) {
      invalid[metric] = value;
      warnings.push(`unsupported-reading:${metric}`);
      continue;
    }

    const result = normalizeMetricValue(metric, value, ranges);
    metricResults.push(result);

    if (result.valid) {
      normalized[metric] = result.normalizedValue;
    } else {
      invalid[metric] = value;
    }

    if (result.warning) {
      warnings.push(result.warning);
    }
  }

  if (!Object.keys(rawReadings).length) {
    warnings.push("no-readings-provided");
  }

  if (!Object.keys(normalized).length) {
    warnings.push("no-valid-normalized-readings");
  }

  const observation = {
    schema: ASTER_NORMALIZATION_SCHEMA,
    version: VERSION,
    gateway: "Aster",
    role: "sensor-normalization",
    observational: true,
    source,
    sensorType,
    timestamp,
    raw: rawReadings,
    normalized,
    invalid,
    metricResults,
    warnings,
    createdAt: nowIso()
  };

  return {
    ok: true,
    version: VERSION,
    schema: ASTER_NORMALIZATION_SCHEMA,
    gateway: "Aster",
    aster: {
      gateway: "Aster",
      module: "AsterSensorNormalizer",
      observational: true
    },
    observation,
    normalized,
    readings: normalized,
    raw: rawReadings,
    invalid,
    metricResults,
    warnings,
    sensorType,
    source,
    timestamp,

    finalAnswerAuthorized: false,
    marionAuthorityRequired: true,
    publicAgent: "nyx",
    displayAuthority: "nyx",
    updatedAt: Date.now()
  };
}

function normalizeSensorReading(input = {}, options = {}) {
  try {
    return buildNormalizedPayload(isPlainObject(input) ? input : {}, options);
  } catch (error) {
    return {
      ok: false,
      version: VERSION,
      schema: ASTER_NORMALIZATION_SCHEMA,
      gateway: "Aster",
      aster: {
        gateway: "Aster",
        module: "AsterSensorNormalizer",
        observational: true
      },
      observation: {
        schema: ASTER_NORMALIZATION_SCHEMA,
        version: VERSION,
        gateway: "Aster",
        role: "sensor-normalization",
        observational: true,
        source: "aster-sensor-normalizer",
        sensorType: "unknown",
        timestamp: nowIso(),
        raw: {},
        normalized: {},
        invalid: {},
        metricResults: [],
        warnings: ["sensor-normalizer-failed"],
        error: error && error.message ? error.message : "unknown-error",
        createdAt: nowIso()
      },
      normalized: {},
      readings: {},
      raw: {},
      invalid: {},
      metricResults: [],
      warnings: ["sensor-normalizer-failed"],
      sensorType: "unknown",
      source: "aster-sensor-normalizer",
      finalAnswerAuthorized: false,
      marionAuthorityRequired: true,
      publicAgent: "nyx",
      displayAuthority: "nyx",
      updatedAt: Date.now()
    };
  }
}

function normalizeAsterSensorReading(input = {}, options = {}) {
  return normalizeSensorReading(input, options);
}

function normalizeSensorInput(input = {}, options = {}) {
  return normalizeSensorReading(input, options);
}

function normalize(input = {}, options = {}) {
  return normalizeSensorReading(input, options);
}

function run(input = {}, options = {}) {
  return normalizeSensorReading(input, options);
}

module.exports = {
  VERSION,
  ASTER_NORMALIZATION_SCHEMA,
  normalizeSensorReading,
  normalizeAsterSensorReading,
  normalizeSensorInput,
  normalize,
  run,
  default: normalizeSensorReading,

  _internal: {
    loadAsterConfig,
    getConfiguredRanges,
    extractReadings,
    normalizeSensorType,
    normalizeMetricValue,
    buildNormalizedPayload
  }
};
