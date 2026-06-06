"use strict";

/** AsterRiskTagger.js — after-conflagration hardened runtime. */

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
const ASTER_RISK_SCHEMA = "nyx.marion.aster.risk/1.0";
const DEFAULT_THRESHOLDS = Object.freeze({ temperatureC:{low:27,moderate:32,elevated:36,high:40}, humidityPercent:{low:65,moderate:75,elevated:85,high:95}, airQualityIndex:{low:51,moderate:101,elevated:151,high:201}, windKph:{low:25,moderate:40,elevated:60,high:90}, uvIndex:{low:3,moderate:6,elevated:8,high:11}, co2Ppm:{low:800,moderate:1200,elevated:2000,high:5000}, noiseDb:{low:55,moderate:70,elevated:85,high:100}, pm25:{low:12,moderate:35,elevated:55,high:150}, pm10:{low:55,moderate:155,elevated:255,high:355}, vocIndex:{low:100,moderate:200,elevated:300,high:400} });
const RISK_RANK = Object.freeze({ unknown:-1, none:0, low:1, moderate:2, medium:2, elevated:3, high:4, critical:5 });
function normalizeRiskLevel(level) { const raw=safeString(level,"unknown").toLowerCase(); if(raw==="medium")return "moderate"; if(raw==="normal")return "none"; if(raw==="severe")return "critical"; return Object.prototype.hasOwnProperty.call(RISK_RANK,raw)?raw:"unknown"; }
function getThresholds(config = {}) { const configured=isPlainObject(config.riskTagging)&&isPlainObject(config.riskTagging.thresholds)?config.riskTagging.thresholds:{}; const out={...DEFAULT_THRESHOLDS}; for(const [key,val] of Object.entries(configured)){ if(isPlainObject(val)&&Object.keys(val).length) out[key]=val; } return out; }
function normalizeReadings(input = {}) { if(!isPlainObject(input))return {}; if(isPlainObject(input.normalized))return input.normalized; if(isPlainObject(input.readings))return input.readings; if(isPlainObject(input.observation)&&isPlainObject(input.observation.normalized))return input.observation.normalized; if(isPlainObject(input.observation)&&isPlainObject(input.observation.readings))return input.observation.readings; return input; }
function riskLevelForValue(metric, value, thresholds) { const numeric=safeNumber(value); const table=isPlainObject(thresholds[metric])?thresholds[metric]:null; if(numeric===null||!table)return{metric,value,numeric:null,level:"unknown",reasonCode:`risk.${metric}.unreadable`}; if(numeric>=Number(table.high))return{metric,value,numeric,level:"high",reasonCode:`risk.${metric}.high`}; if(numeric>=Number(table.elevated))return{metric,value,numeric,level:"elevated",reasonCode:`risk.${metric}.elevated`}; if(numeric>=Number(table.moderate))return{metric,value,numeric,level:"moderate",reasonCode:`risk.${metric}.moderate`}; if(numeric>=Number(table.low))return{metric,value,numeric,level:"low",reasonCode:`risk.${metric}.low`}; return{metric,value,numeric,level:"none",reasonCode:`risk.${metric}.normal`}; }
function strongestRiskLevel(items) { let strongest="none"; for(const item of items||[]){ const level=normalizeRiskLevel(item&&item.level); if((RISK_RANK[level]??-1)>(RISK_RANK[strongest]??-1))strongest=level; } return strongest; }
function tagsForLevel(level, context="") { const l=normalizeRiskLevel(level); const tags=["risk"]; if(context)tags.push(context); if(l==="critical")tags.push("critical","urgent-review","human-review-required"); else if(l==="high")tags.push("high","caution","review-required"); else if(l==="elevated")tags.push("elevated","caution","watch"); else if(l==="moderate")tags.push("moderate","watch"); else if(l==="low")tags.push("low","stable-watch"); else if(l==="none")tags.push("low","normal","stable"); else tags.push("unknown","fallback"); return Array.from(new Set(tags.filter(Boolean))); }
function summarizeReasonCodes(items){ return (items||[]).filter((x)=>x&&x.reasonCode).map((x)=>x.reasonCode); }
function buildRiskPayload(input = {}, options = {}) { const config=loadAsterConfig(); const thresholds=getThresholds(config); const rawInput=isPlainObject(input)?input:{}; const context=safeString(rawInput.context || (isPlainObject(rawInput.classification)?rawInput.classification.context:rawInput.classification) || (isPlainObject(rawInput.observation)?rawInput.observation.context:"") || "environment.unknown"); const source=safeString(rawInput.source || options.source || "aster-risk-tagger"); const readings=normalizeReadings(rawInput); const metricAssessments=[]; for(const metric of Object.keys(thresholds)){ if(!Object.prototype.hasOwnProperty.call(readings,metric))continue; metricAssessments.push(riskLevelForValue(metric, readings[metric], thresholds)); } let level=metricAssessments.length?strongestRiskLevel(metricAssessments):"unknown"; if((safeNumber(readings.temperatureC)??-Infinity)>=45 || (safeNumber(readings.co2Ppm)??-Infinity)>=8000 || (safeNumber(readings.airQualityIndex)??-Infinity)>=301) level="critical"; const reasonCodes=summarizeReasonCodes(metricAssessments); if(level==="critical")reasonCodes.push("risk.critical.threshold"); const tags=tagsForLevel(level,context); const warnings=[]; if(!metricAssessments.length)warnings.push("no-supported-risk-metrics-found"); for(const item of metricAssessments){ if(item.level==="unknown")warnings.push(`unreadable-risk-metric:${item.metric}`); } const requiresHumanReview = (RISK_RANK[level]??-1) >= RISK_RANK.high; const risk={ schema:ASTER_RISK_SCHEMA, version:VERSION, gateway:"Aster", role:"environmental-risk-tagging", observational:true, level, riskLevel:level, tags, reasonCodes:Array.from(new Set(reasonCodes)), metricAssessments, publicAlarm:false, requiresHumanReview, source, context, warnings:Array.from(new Set(warnings)), createdAt:nowIso(), authority:authoritySurface() }; return { ok:true, version:VERSION, schema:ASTER_RISK_SCHEMA, gateway:"Aster", aster:{gateway:"Aster", module:"AsterRiskTagger", observational:true}, risk, riskLevel:level, tags, reasonCodes:risk.reasonCodes, metricAssessments, context, source, warnings:risk.warnings, publicAlarm:false, requiresHumanReview, ...authoritySurface(), updatedAt:Date.now() }; }
function tagAsterRisk(input = {}, options = {}) { try { return buildRiskPayload(isPlainObject(input)?input:{}, options); } catch(error){ const warnings=["risk-tagger-failed"]; const risk={ schema:ASTER_RISK_SCHEMA, version:VERSION, level:"unknown", riskLevel:"unknown", tags:["risk","unknown","fallback"], reasonCodes:["risk.tagger.error"], metricAssessments:[], publicAlarm:false, warnings, error:safeString(error&&error.message,"unknown-error"), createdAt:nowIso(), authority:authoritySurface() }; return { ok:false, version:VERSION, schema:ASTER_RISK_SCHEMA, gateway:"Aster", aster:{gateway:"Aster", module:"AsterRiskTagger", observational:true, status:"fallback"}, risk, riskLevel:"unknown", tags:risk.tags, reasonCodes:risk.reasonCodes, warnings, publicAlarm:false, ...authoritySurface(), updatedAt:Date.now() }; } }
function tagEnvironmentRisk(input = {}, options = {}) { return tagAsterRisk(input, options); }
function tagRisk(input = {}, options = {}) { return tagAsterRisk(input, options); }
function assessRisk(input = {}, options = {}) { return tagAsterRisk(input, options); }
function classifyRisk(input = {}, options = {}) { return tagAsterRisk(input, options); }
function run(input = {}, options = {}) { return tagAsterRisk(input, options); }
module.exports = { VERSION, ASTER_RISK_SCHEMA, tagAsterRisk, tagEnvironmentRisk, tagRisk, assessRisk, classifyRisk, run, default: tagAsterRisk, _internal:{ loadAsterConfig, getThresholds, normalizeReadings, riskLevelForValue, strongestRiskLevel, tagsForLevel, normalizeRiskLevel, authoritySurface } };
