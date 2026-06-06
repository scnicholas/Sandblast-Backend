"use strict";

/** AsterContextClassifier.js — after-conflagration hardened runtime. */

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
const ASTER_CONTEXT_SCHEMA = "nyx.marion.aster.context/1.0";
const DEFAULT_CONTEXT_MAP = Object.freeze({ weather:"environment.weather.general", airQuality:"environment.air-quality.general", airquality:"environment.air-quality.general", indoorEnvironment:"environment.indoor.general", indoorenvironment:"environment.indoor.general", locationContext:"environment.location.general", locationcontext:"environment.location.general", unknown:"environment.unknown" });
function extractNormalized(input = {}) { if (!isPlainObject(input)) return {}; if (isPlainObject(input.normalized)) return input.normalized; if (isPlainObject(input.readings)) return input.readings; if (isPlainObject(input.observation)) { if (isPlainObject(input.observation.normalized)) return input.observation.normalized; if (isPlainObject(input.observation.readings)) return input.observation.readings; } return {}; }
function hasAnyMetric(readings = {}, metrics = []) { return isPlainObject(readings) && metrics.some((m) => Object.prototype.hasOwnProperty.call(readings, m)); }
function inferContextFromReadings(readings = {}, fallback = "environment.general") { if (!isPlainObject(readings)) return fallback; const hasAir = hasAnyMetric(readings,["airQualityIndex","pm25","pm10","co2Ppm","vocIndex"]); const hasWeather = hasAnyMetric(readings,["temperatureC","humidityPercent","windKph","pressureHpa","precipitationMm","uvIndex"]); const hasIndoor = hasAnyMetric(readings,["noiseDb","lightLux"]); if (hasAir && hasWeather) return "environment.weather.air-quality"; if (hasAir) return "environment.air-quality.general"; if (hasIndoor) return "environment.indoor.comfort"; if (hasWeather) return "environment.weather.general"; return fallback; }
function refineWeatherContext(readings = {}, baseContext = "environment.weather.general") { if (!isPlainObject(readings)) return baseContext; const temp=safeNumber(readings.temperatureC), humidity=safeNumber(readings.humidityPercent), wind=safeNumber(readings.windKph), uv=safeNumber(readings.uvIndex), aqi=safeNumber(readings.airQualityIndex), pm25=safeNumber(readings.pm25), co2=safeNumber(readings.co2Ppm); if ((aqi !== null && aqi >= 101) || (pm25 !== null && pm25 >= 35) || (co2 !== null && co2 >= 1200)) return "environment.weather.air-quality"; if (temp !== null && temp >= 32) return "environment.weather.heat"; if (humidity !== null && humidity >= 75) return "environment.weather.humidity"; if (wind !== null && wind >= 40) return "environment.weather.wind"; if (uv !== null && uv >= 6) return "environment.weather.uv"; return baseContext; }
function getConfiguredContext(sensorType, config = {}) { const normalized = normalizeSensorType(sensorType); const configuredMap = isPlainObject(config.classification) && isPlainObject(config.classification.contextMap) ? config.classification.contextMap : {}; return configuredMap[normalized] || configuredMap[safeString(sensorType)] || DEFAULT_CONTEXT_MAP[normalized] || DEFAULT_CONTEXT_MAP[safeString(sensorType).toLowerCase()] || ""; }
function classifyPayload(input = {}, options = {}) { const config=loadAsterConfig(); const rawInput=isPlainObject(input)?input:{}; const sensorType=normalizeSensorType(rawInput.sensorType || (isPlainObject(rawInput.observation)?rawInput.observation.sensorType:"") || options.sensorType || "unknown"); const source=safeString(rawInput.source || options.source || "aster-context-classifier"); const readings=extractNormalized(rawInput); const defaultContext=isPlainObject(config.classification)&&config.classification.defaultContext?safeString(config.classification.defaultContext,"environment.general"):"environment.general"; const unknownContext=isPlainObject(config.classification)&&config.classification.unknownContext?safeString(config.classification.unknownContext,"environment.unknown"):"environment.unknown"; let context=getConfiguredContext(sensorType,config); if (!context || context === "environment.unknown") context = inferContextFromReadings(readings, sensorType === "unknown" ? unknownContext : defaultContext); if (context === "environment.weather.general" || context === "environment.weather.air-quality") context = refineWeatherContext(readings, context); const confidence = context === unknownContext ? 0.35 : Object.keys(readings).length ? 0.82 : 0.45; const tags=Array.from(new Set(["aster","environment",sensorType,...String(context).split(".").filter(Boolean)])); const warnings=[]; if(sensorType==="unknown")warnings.push("unknown-sensor-type"); if(!Object.keys(readings).length)warnings.push("no-normalized-readings"); const classification={ schema:ASTER_CONTEXT_SCHEMA, version:VERSION, context, sensorType, confidence, tags, source, warnings, createdAt:nowIso(), authority:authoritySurface() }; return { ok:true, version:VERSION, schema:ASTER_CONTEXT_SCHEMA, gateway:"Aster", aster:{gateway:"Aster", module:"AsterContextClassifier", observational:true}, classification, context, sensorType, confidence, tags, source, warnings, ...authoritySurface(), updatedAt:Date.now() }; }
function classifyAsterContext(input = {}, options = {}) { try { return classifyPayload(isPlainObject(input)?input:{}, options); } catch(error) { const warnings=["context-classifier-failed"]; const classification={ schema:ASTER_CONTEXT_SCHEMA, version:VERSION, context:"environment.unknown", sensorType:"unknown", confidence:0, tags:["aster","environment","unknown","fallback"], source:"aster-context-classifier", warnings, error:safeString(error&&error.message,"unknown-error"), createdAt:nowIso(), authority:authoritySurface() }; return { ok:false, version:VERSION, schema:ASTER_CONTEXT_SCHEMA, gateway:"Aster", aster:{gateway:"Aster", module:"AsterContextClassifier", observational:true, status:"fallback"}, classification, context:"environment.unknown", sensorType:"unknown", confidence:0, tags:classification.tags, warnings, ...authoritySurface(), updatedAt:Date.now() }; } }
function classifyEnvironmentContext(input = {}, options = {}) { return classifyAsterContext(input, options); }
function classifyContext(input = {}, options = {}) { return classifyAsterContext(input, options); }
function classify(input = {}, options = {}) { return classifyAsterContext(input, options); }
function run(input = {}, options = {}) { return classifyAsterContext(input, options); }
module.exports = { VERSION, ASTER_CONTEXT_SCHEMA, classifyAsterContext, classifyEnvironmentContext, classifyContext, classify, run, default: classifyAsterContext, _internal:{ loadAsterConfig, normalizeSensorType, extractNormalized, inferContextFromReadings, refineWeatherContext, getConfiguredContext, authoritySurface } };
