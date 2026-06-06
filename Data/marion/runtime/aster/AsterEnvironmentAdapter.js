"use strict";

/** AsterEnvironmentAdapter.js — after-conflagration hardened runtime. */

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
const ASTER_ADAPTER_SCHEMA = "nyx.marion.aster.environmentAdapter/1.0";
function safeRequireLocal(fileName) { const candidates=[path.join(__dirname,fileName), path.join(process.cwd(),"Data","marion","runtime","aster",fileName), path.join(process.cwd(),"Data","marion","runtime",fileName)]; for(const candidate of candidates){ try{ if(!fs.existsSync(candidate))continue; return require(candidate); }catch(_){ continue; } } return null; }
function getFunction(moduleValue, names) { for(const name of names||[]){ if(moduleValue && typeof moduleValue[name]==="function")return moduleValue[name]; } if(typeof moduleValue==="function")return moduleValue; return null; }
function buildInputEnvelope(input = {}, options = {}) { const rawInput=isPlainObject(input)?input:{}; const source=safeString(rawInput.source || options.source || "aster-environment-adapter"); const sensorType=normalizeSensorType(rawInput.sensorType || (isPlainObject(rawInput.observation)?rawInput.observation.sensorType:"") || options.sensorType || "unknown"); const readings=isPlainObject(rawInput.readings)?cloneJson(rawInput.readings):isPlainObject(rawInput.normalized)?cloneJson(rawInput.normalized):isPlainObject(rawInput.observation)&&isPlainObject(rawInput.observation.readings)?cloneJson(rawInput.observation.readings):isPlainObject(rawInput.observation)&&isPlainObject(rawInput.observation.normalized)?cloneJson(rawInput.observation.normalized):{}; const context=isPlainObject(rawInput.context)?cloneJson(rawInput.context):rawInput.context || options.context || {}; return { source, sensorType, readings, context, timestamp:safeString(rawInput.timestamp || options.timestamp || nowIso()), location: rawInput.location || options.location || "", metadata:isPlainObject(rawInput.metadata)?cloneJson(rawInput.metadata):{} }; }
function buildSafeFallback(reason, error) { const warning=safeString(reason,"aster-environment-adapter-fallback"); return { ok:false, version:VERSION, schema:ASTER_ADAPTER_SCHEMA, gateway:"Aster", aster:{gateway:"Aster", module:"AsterEnvironmentAdapter", observational:true, status:"fallback"}, observation:{ schema:ASTER_ADAPTER_SCHEMA, version:VERSION, gateway:"Aster", role:"environmental-observation-adapter", observational:true, source:"aster-environment-adapter", sensorType:"unknown", raw:{}, normalized:{}, context:"environment.unknown", risk:{level:"unknown", tags:["risk","unknown","fallback"], reasonCodes:["aster.adapter.fallback"]}, warnings:[warning], error:safeString(error&&error.message,""), createdAt:nowIso(), authority:authoritySurface() }, normalized:{}, classification:{ context:"environment.unknown", confidence:0, warnings:[warning] }, context:"environment.unknown", risk:{ level:"unknown", tags:["risk","unknown","fallback"], reasonCodes:["aster.adapter.fallback"] }, envelope:null, warnings:[warning], pipeline:{normalizer:false, contextClassifier:false, riskTagger:false, observationEnvelope:false}, ...authoritySurface(), updatedAt:Date.now() }; }
function callStage(stageName, fn, payload, options = {}) { if(typeof fn!=="function")return{ok:false,warnings:[`missing-stage:${stageName}`],error:`missing-stage:${stageName}`}; try{ const result=fn(payload,options); if(!isPlainObject(result))return{ok:false,warnings:[`invalid-stage-result:${stageName}`],error:`invalid-stage-result:${stageName}`}; return result; }catch(error){ return{ok:false,warnings:[`stage-failed:${stageName}`],error:safeString(error&&error.message,"unknown-error")}; } }
function runAsterEnvironmentAdapter(input = {}, options = {}) { try{ const config=loadAsterConfig(); const initial=buildInputEnvelope(isPlainObject(input)?input:{}, options); initial.readings=redactSensitiveObject(initial.readings,config); initial.metadata=redactSensitiveObject(initial.metadata,config); const Normalizer=safeRequireLocal("AsterSensorNormalizer.js"); const Classifier=safeRequireLocal("AsterContextClassifier.js"); const RiskTagger=safeRequireLocal("AsterRiskTagger.js"); const Envelope=safeRequireLocal("AsterObservationEnvelope.js"); const normalizeSensorReading=getFunction(Normalizer,["normalizeSensorReading","normalizeAsterSensorReading","normalizeSensorInput","normalize","run","default"]); const classifyContext=getFunction(Classifier,["classifyAsterContext","classifyEnvironmentContext","classifyContext","classify","run","default"]); const tagRisk=getFunction(RiskTagger,["tagAsterRisk","tagEnvironmentRisk","tagRisk","assessRisk","classifyRisk","run","default"]); const createEnvelope=getFunction(Envelope,["createAsterObservationEnvelope","buildAsterObservationEnvelope","createObservationEnvelope","buildObservationEnvelope","envelopeObservation","run","default"]);
  const normalizedResult=callStage("normalizer", normalizeSensorReading, {source:initial.source,sensorType:initial.sensorType,readings:initial.readings,timestamp:initial.timestamp,location:initial.location,metadata:initial.metadata}, options); const normalizedReadings=isPlainObject(normalizedResult.normalized)?normalizedResult.normalized:isPlainObject(normalizedResult.readings)?normalizedResult.readings:{};
  const classificationResult=callStage("context-classifier", classifyContext, {source:initial.source,sensorType:initial.sensorType,normalized:normalizedReadings,readings:normalizedReadings,location:initial.location,observation:normalizedResult.observation||{},metadata:initial.metadata}, options); const context=safeString(classificationResult.context || (isPlainObject(classificationResult.classification)?classificationResult.classification.context:"") || "environment.unknown");
  const riskResult=callStage("risk-tagger", tagRisk, {source:initial.source,context,normalized:normalizedReadings,readings:normalizedReadings,classification:classificationResult.classification||{},observation:normalizedResult.observation||{},metadata:initial.metadata}, options); const risk=isPlainObject(riskResult.risk)?riskResult.risk:{level:riskResult.riskLevel||"unknown",tags:Array.isArray(riskResult.tags)?riskResult.tags:["risk","unknown"],reasonCodes:Array.isArray(riskResult.reasonCodes)?riskResult.reasonCodes:[]};
  const envelopeResult=callStage("observation-envelope", createEnvelope, {source:initial.source,sensorType:initial.sensorType,raw:initial.readings,normalized:normalizedReadings,context,risk,observation:{sensorType:initial.sensorType,raw:initial.readings,normalized:normalizedReadings,context,risk,source:initial.source},metadata:{gateway:"Aster",linkedGateway:"LingoLink",project:"Sandblast",...initial.metadata}}, options);
  const warnings=[].concat(Array.isArray(normalizedResult.warnings)?normalizedResult.warnings:[],Array.isArray(classificationResult.warnings)?classificationResult.warnings:[],Array.isArray(riskResult.warnings)?riskResult.warnings:[],Array.isArray(envelopeResult.warnings)?envelopeResult.warnings:[]).filter(Boolean); const observation=envelopeResult.envelope || envelopeResult.observation || { schema:ASTER_ADAPTER_SCHEMA, version:VERSION, gateway:"Aster", role:"environmental-observation-adapter", observational:true, source:initial.source, sensorType:initial.sensorType, raw:initial.readings, normalized:normalizedReadings, context, risk, warnings:Array.from(new Set(warnings)), createdAt:nowIso(), authority:authoritySurface() };
  const pipeline={ normalizer:normalizedResult.ok!==false, contextClassifier:classificationResult.ok!==false, riskTagger:riskResult.ok!==false, observationEnvelope:envelopeResult.ok!==false }; const ok = Object.values(pipeline).some(Boolean); return { ok, version:VERSION, schema:ASTER_ADAPTER_SCHEMA, gateway:"Aster", aster:{gateway:"Aster", module:"AsterEnvironmentAdapter", observational:true, status:"staged-hardened", linkedGateways:["LingoLink","LanguageSphere"]}, configVersion:safeString(config.version,""), observation, normalized:normalizedReadings, normalizedResult, classification:classificationResult.classification || classificationResult, context, risk, riskResult, envelope:envelopeResult.envelope || envelopeResult, warnings:Array.from(new Set(warnings)), pipeline, ...authoritySurface(), updatedAt:Date.now() };
  }catch(error){ return buildSafeFallback("aster-environment-adapter-failed", error); } }
function adaptEnvironmentObservation(input = {}, options = {}) { return runAsterEnvironmentAdapter(input, options); }
function createEnvironmentObservation(input = {}, options = {}) { return runAsterEnvironmentAdapter(input, options); }
function observeEnvironment(input = {}, options = {}) { return runAsterEnvironmentAdapter(input, options); }
function run(input = {}, options = {}) { return runAsterEnvironmentAdapter(input, options); }
module.exports = { VERSION, ASTER_ADAPTER_SCHEMA, runAsterEnvironmentAdapter, adaptEnvironmentObservation, createEnvironmentObservation, observeEnvironment, run, default:runAsterEnvironmentAdapter, _internal:{ loadAsterConfig, safeRequireLocal, getFunction, normalizeSensorType, buildInputEnvelope, buildSafeFallback, callStage, authoritySurface } };
