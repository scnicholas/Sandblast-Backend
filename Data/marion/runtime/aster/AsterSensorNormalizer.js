"use strict";

/** AsterSensorNormalizer.js — after-conflagration hardened runtime. */

const fs = require("fs");
const path = require("path");

function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function safeString(value, fallback = "") { if (value === null || value === undefined) return fallback; return String(value).replace(/\s+/g, " ").trim() || fallback; }
function nowIso() { return new Date().toISOString(); }
function cloneJson(value) { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return {}; } }
function safeNumber(value) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string") { const n = Number(value.trim().replace(/,/g, "")); return Number.isFinite(n) ? n : null; } return null; }
function loadAsterConfig() {
  const candidates = [
    path.join(__dirname, "asterConfig.json"),
    path.join(process.cwd(), "Data", "marion", "runtime", "aster", "asterConfig.json"),
    path.join(process.cwd(), "Data", "marion", "runtime", "asterConfig.json")
  ];
  for (const candidate of candidates) {
    try { if (!fs.existsSync(candidate)) continue; const raw = fs.readFileSync(candidate, "utf8"); if (raw.trim()) return JSON.parse(raw); } catch (_) { return {}; }
  }
  return {};
}
function authoritySurface(extra = {}) {
  return {
    finalAnswerAuthorized: false,
    marionAuthorityRequired: true,
    neverOverrideMarionFinal: true,
    observationOnly: true,
    advisoryOnly: true,
    publicReplyVisible: false,
    userFacing: false,
    publicText: "",
    renderText: "",
    text: "",
    publicAgent: "nyx",
    displayAuthority: "nyx",
    finalAuthority: "Marion",
    ...extra
  };
}
function sensitiveFieldSet(config = {}) {
  const fields = isPlainObject(config.privacy) && Array.isArray(config.privacy.sensitiveFields) ? config.privacy.sensitiveFields : ["latitude","longitude","address","deviceId","userId","ipAddress"];
  return new Set(fields.map((x) => safeString(x).toLowerCase()).filter(Boolean));
}
function redactSensitiveObject(value, config = {}) {
  if (Array.isArray(value)) return value.map((v) => redactSensitiveObject(v, config));
  if (!isPlainObject(value)) return value;
  const blocked = sensitiveFieldSet(config);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(String(key).toLowerCase())) { out[key] = "[redacted]"; continue; }
    out[key] = redactSensitiveObject(item, config);
  }
  return out;
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

const VERSION = "0.1.1";
const ASTER_NORMALIZATION_SCHEMA = "nyx.marion.aster.normalizedSensor/1.0";
const DEFAULT_RANGES = Object.freeze({ temperatureC:{min:-60,max:60}, humidityPercent:{min:0,max:100}, airQualityIndex:{min:0,max:500}, windKph:{min:0,max:300}, pressureHpa:{min:800,max:1100}, precipitationMm:{min:0,max:500}, uvIndex:{min:0,max:15}, pm25:{min:0,max:1000}, pm10:{min:0,max:2000}, co2Ppm:{min:250,max:10000}, vocIndex:{min:0,max:500}, noiseDb:{min:0,max:160}, lightLux:{min:0,max:200000} });
function clampNumber(value, range) { if (!isPlainObject(range)) return value; let out = value; if (typeof range.min === "number" && out < range.min) out = range.min; if (typeof range.max === "number" && out > range.max) out = range.max; return out; }
function getConfiguredRanges(config = {}) { const configured = isPlainObject(config.normalization) && isPlainObject(config.normalization.ranges) ? config.normalization.ranges : {}; return { ...DEFAULT_RANGES, ...configured }; }
function extractReadings(input = {}) { if (!isPlainObject(input)) return {}; if (isPlainObject(input.readings)) return input.readings; if (isPlainObject(input.normalized)) return input.normalized; if (isPlainObject(input.observation)) { if (isPlainObject(input.observation.readings)) return input.observation.readings; if (isPlainObject(input.observation.normalized)) return input.observation.normalized; if (isPlainObject(input.observation.raw)) return input.observation.raw; } return {}; }
function normalizeMetricValue(metric, value, ranges) { const numeric = safeNumber(value); if (numeric === null) return { metric, rawValue:value, valid:false, normalizedValue:null, warning:`invalid-reading:${metric}` }; const range = ranges[metric]; const clamped = clampNumber(numeric, range); return { metric, rawValue:value, valid:true, normalizedValue:clamped, clamped:clamped !== numeric, warning:clamped !== numeric ? `clamped-reading:${metric}` : "" }; }
function buildNormalizedPayload(input = {}, options = {}) {
  const config = loadAsterConfig(); const ranges = getConfiguredRanges(config); const rawInput = isPlainObject(input) ? input : {}; const source = safeString(rawInput.source || options.source || "aster-sensor-normalizer"); const sensorType = normalizeSensorType(rawInput.sensorType || (isPlainObject(rawInput.observation) ? rawInput.observation.sensorType : "") || options.sensorType || "unknown"); const timestamp = safeString(rawInput.timestamp || (isPlainObject(rawInput.observation) ? rawInput.observation.timestamp : "") || options.timestamp || nowIso());
  const rawReadings = redactSensitiveObject(cloneJson(extractReadings(rawInput)), config); const normalized = {}; const invalid = {}; const warnings = []; const metricResults = [];
  for (const [metric, value] of Object.entries(rawReadings)) { if (!Object.prototype.hasOwnProperty.call(ranges, metric)) { invalid[metric] = value; warnings.push(`unsupported-reading:${metric}`); continue; } const result = normalizeMetricValue(metric, value, ranges); metricResults.push(result); if (result.valid) normalized[metric] = result.normalizedValue; else invalid[metric] = value; if (result.warning) warnings.push(result.warning); }
  if (!Object.keys(rawReadings).length) warnings.push("no-readings-provided"); if (!Object.keys(normalized).length) warnings.push("no-valid-normalized-readings");
  const observation = { schema:ASTER_NORMALIZATION_SCHEMA, version:VERSION, gateway:"Aster", role:"sensor-normalization", observational:true, source, sensorType, timestamp, raw:rawReadings, normalized, invalid, metricResults, warnings:Array.from(new Set(warnings)), createdAt:nowIso(), authority:authoritySurface() };
  return { ok:true, version:VERSION, schema:ASTER_NORMALIZATION_SCHEMA, gateway:"Aster", aster:{ gateway:"Aster", module:"AsterSensorNormalizer", observational:true }, observation, normalized, readings:normalized, raw:rawReadings, invalid, metricResults, warnings:observation.warnings, sensorType, source, timestamp, ...authoritySurface(), updatedAt:Date.now() };
}
function normalizeSensorReading(input = {}, options = {}) { try { return buildNormalizedPayload(isPlainObject(input) ? input : {}, options); } catch (error) { const warnings = ["sensor-normalizer-failed"]; return { ok:false, version:VERSION, schema:ASTER_NORMALIZATION_SCHEMA, gateway:"Aster", aster:{gateway:"Aster", module:"AsterSensorNormalizer", observational:true, status:"fallback"}, observation:{ schema:ASTER_NORMALIZATION_SCHEMA, version:VERSION, gateway:"Aster", role:"sensor-normalization", observational:true, source:"aster-sensor-normalizer", sensorType:"unknown", timestamp:nowIso(), raw:{}, normalized:{}, invalid:{}, metricResults:[], warnings, error:safeString(error && error.message, "unknown-error"), createdAt:nowIso(), authority:authoritySurface() }, normalized:{}, readings:{}, raw:{}, invalid:{}, metricResults:[], warnings, sensorType:"unknown", source:"aster-sensor-normalizer", ...authoritySurface(), updatedAt:Date.now() }; } }
function normalizeAsterSensorReading(input = {}, options = {}) { return normalizeSensorReading(input, options); }
function normalizeSensorInput(input = {}, options = {}) { return normalizeSensorReading(input, options); }
function normalize(input = {}, options = {}) { return normalizeSensorReading(input, options); }
function run(input = {}, options = {}) { return normalizeSensorReading(input, options); }
module.exports = { VERSION, ASTER_NORMALIZATION_SCHEMA, normalizeSensorReading, normalizeAsterSensorReading, normalizeSensorInput, normalize, run, default: normalizeSensorReading, _internal:{ loadAsterConfig, getConfiguredRanges, extractReadings, normalizeSensorType, normalizeMetricValue, buildNormalizedPayload, authoritySurface, redactSensitiveObject } };
