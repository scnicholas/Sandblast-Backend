"use strict";

/**
 * AsterContextClassifier.js
 *
 * Runtime role:
 * - Classify normalized environmental readings into stable Aster context lanes.
 * - Stay observational only.
 * - Never authorize public final answers.
 *
 * Architecture:
 * AsterSensorNormalizer -> AsterContextClassifier -> AsterRiskTagger -> AsterObservationEnvelope -> Marion final authority
 */

const fs = require("fs");
const path = require("path");

const VERSION = "0.1.0";
const ASTER_CONTEXT_SCHEMA = "nyx.marion.aster.context/1.0";

const DEFAULT_CONTEXT_MAP = Object.freeze({
  weather: "environment.weather.general",
  airQuality: "environment.air-quality.general",
  airquality: "environment.air-quality.general",
  indoorEnvironment: "environment.indoor.general",
  indoorenvironment: "environment.indoor.general",
  locationContext: "environment.location.general",
  locationcontext: "environment.location.general",
  unknown: "environment.unknown"
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

function normalizeSensorType(sensorType) {
  const raw = safeString(sensorType, "unknown");
  const compact = raw.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();

  if (compact === "weather") return "weather";
  if (compact === "airquality") return "airQuality";
  if (compact === "indoorenvironment" || compact === "indoor") return "indoorEnvironment";
  if (compact === "locationcontext" || compact === "location") return "locationContext";

  return raw || "unknown";
}

function extractNormalized(input = {}) {
  if (!isPlainObject(input)) return {};

  if (isPlainObject(input.normalized)) return input.normalized;
  if (isPlainObject(input.readings)) return input.readings;

  if (isPlainObject(input.observation)) {
    if (isPlainObject(input.observation.normalized)) return input.observation.normalized;
    if (isPlainObject(input.observation.readings)) return input.observation.readings;
  }

  return {};
}

function hasAnyMetric(readings = {}, metrics = []) {
  if (!isPlainObject(readings)) return false;
  return metrics.some((metric) => Object.prototype.hasOwnProperty.call(readings, metric));
}

function inferContextFromReadings(readings = {}, fallback = "environment.general") {
  if (!isPlainObject(readings)) return fallback;

  const hasAir = hasAnyMetric(readings, [
    "airQualityIndex",
    "pm25",
    "pm10",
    "co2Ppm",
    "vocIndex"
  ]);

  const hasWeather = hasAnyMetric(readings, [
    "temperatureC",
    "humidityPercent",
    "windKph",
    "pressureHpa",
    "precipitationMm",
    "uvIndex"
  ]);

  const hasIndoor = hasAnyMetric(readings, [
    "noiseDb",
    "lightLux"
  ]);

  if (hasAir && hasWeather) return "environment.weather.air-quality";
  if (hasAir) return "environment.air-quality.general";
  if (hasIndoor) return "environment.indoor.comfort";
  if (hasWeather) return "environment.weather.general";

  return fallback;
}

function refineWeatherContext(readings = {}, baseContext = "environment.weather.general") {
  if (!isPlainObject(readings)) return baseContext;

  const temp = Number(readings.temperatureC);
  const humidity = Number(readings.humidityPercent);
  const wind = Number(readings.windKph);
  const uv = Number(readings.uvIndex);
  const aqi = Number(readings.airQualityIndex);

  if (Number.isFinite(aqi) && aqi >= 101) return "environment.weather.air-quality";
  if (Number.isFinite(temp) && temp >= 32) return "environment.weather.heat";
  if (Number.isFinite(humidity) && humidity >= 75) return "environment.weather.humidity";
  if (Number.isFinite(wind) && wind >= 40) return "environment.weather.wind";
  if (Number.isFinite(uv) && uv >= 6) return "environment.weather.uv";

  return baseContext;
}

function getConfiguredContext(sensorType, config = {}) {
  const normalized = normalizeSensorType(sensorType);
  const configuredMap =
    isPlainObject(config.classification) && isPlainObject(config.classification.contextMap)
      ? config.classification.contextMap
      : {};

  return (
    configuredMap[normalized] ||
    configuredMap[safeString(sensorType)] ||
    DEFAULT_CONTEXT_MAP[normalized] ||
    DEFAULT_CONTEXT_MAP[safeString(sensorType).toLowerCase()] ||
    ""
  );
}

function classifyPayload(input = {}, options = {}) {
  const config = loadAsterConfig();

  const sensorType = normalizeSensorType(
    input.sensorType ||
      (isPlainObject(input.observation) ? input.observation.sensorType : "") ||
      options.sensorType ||
      "unknown"
  );

  const source = safeString(input.source || options.source || "aster-context-classifier");
  const readings = extractNormalized(input);

  const defaultContext =
    isPlainObject(config.classification) && config.classification.defaultContext
      ? safeString(config.classification.defaultContext, "environment.general")
      : "environment.general";

  const unknownContext =
    isPlainObject(config.classification) && config.classification.unknownContext
      ? safeString(config.classification.unknownContext, "environment.unknown")
      : "environment.unknown";

  let context = getConfiguredContext(sensorType, config);

  if (!context || context === "environment.unknown") {
    context = inferContextFromReadings(
      readings,
      sensorType === "unknown" ? unknownContext : defaultContext
    );
  }

  if (context === "environment.weather.general" || context === "environment.weather.air-quality") {
    context = refineWeatherContext(readings, context);
  }

  const confidence = context === unknownContext ? 0.35 : 0.82;

  const tags = Array.from(
    new Set([
      "aster",
      "environment",
      sensorType,
      ...String(context).split(".").filter(Boolean)
    ])
  );

  const warnings = [];

  if (sensorType === "unknown") {
    warnings.push("unknown-sensor-type");
  }

  if (!Object.keys(readings).length) {
    warnings.push("no-normalized-readings");
  }

  return {
    ok: true,
    version: VERSION,
    schema: ASTER_CONTEXT_SCHEMA,
    gateway: "Aster",
    aster: {
      gateway: "Aster",
      module: "AsterContextClassifier",
      observational: true
    },
    classification: {
      schema: ASTER_CONTEXT_SCHEMA,
      version: VERSION,
      context,
      sensorType,
      confidence,
      tags,
      source,
      warnings,
      createdAt: nowIso()
    },
    context,
    sensorType,
    confidence,
    tags,
    source,
    warnings,

    finalAnswerAuthorized: false,
    marionAuthorityRequired: true,
    publicAgent: "nyx",
    displayAuthority: "nyx",
    updatedAt: Date.now()
  };
}

function classifyAsterContext(input = {}, options = {}) {
  try {
    return classifyPayload(isPlainObject(input) ? input : {}, options);
  } catch (error) {
    return {
      ok: false,
      version: VERSION,
      schema: ASTER_CONTEXT_SCHEMA,
      gateway: "Aster",
      aster: {
        gateway: "Aster",
        module: "AsterContextClassifier",
        observational: true
      },
      classification: {
        schema: ASTER_CONTEXT_SCHEMA,
        version: VERSION,
        context: "environment.unknown",
        sensorType: "unknown",
        confidence: 0,
        tags: ["aster", "environment", "unknown", "fallback"],
        source: "aster-context-classifier",
        warnings: ["context-classifier-failed"],
        error: error && error.message ? error.message : "unknown-error",
        createdAt: nowIso()
      },
      context: "environment.unknown",
      sensorType: "unknown",
      confidence: 0,
      tags: ["aster", "environment", "unknown", "fallback"],
      warnings: ["context-classifier-failed"],
      finalAnswerAuthorized: false,
      marionAuthorityRequired: true,
      publicAgent: "nyx",
      displayAuthority: "nyx",
      updatedAt: Date.now()
    };
  }
}

function classifyEnvironmentContext(input = {}, options = {}) {
  return classifyAsterContext(input, options);
}

function classifyContext(input = {}, options = {}) {
  return classifyAsterContext(input, options);
}

function classify(input = {}, options = {}) {
  return classifyAsterContext(input, options);
}

function run(input = {}, options = {}) {
  return classifyAsterContext(input, options);
}

module.exports = {
  VERSION,
  ASTER_CONTEXT_SCHEMA,
  classifyAsterContext,
  classifyEnvironmentContext,
  classifyContext,
  classify,
  run,
  default: classifyAsterContext,

  _internal: {
    loadAsterConfig,
    normalizeSensorType,
    extractNormalized,
    inferContextFromReadings,
    refineWeatherContext,
    getConfiguredContext
  }
};
