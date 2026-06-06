"use strict";

/** AsterObservationEnvelope.js — after-conflagration hardened runtime. */

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
const ASTER_OBSERVATION_SCHEMA = "nyx.marion.aster.observation/1.0";
function extractObservation(input = {}) { if(!isPlainObject(input))return {}; if(isPlainObject(input.observation))return cloneJson(input.observation); return { sensorType:input.sensorType || "unknown", raw:isPlainObject(input.raw)?cloneJson(input.raw):undefined, readings:isPlainObject(input.readings)?cloneJson(input.readings):undefined, normalized:isPlainObject(input.normalized)?cloneJson(input.normalized):undefined, context:input.context || undefined, risk:isPlainObject(input.risk)?cloneJson(input.risk):undefined }; }
function normalizeGatewayMetadata(input = {}, config = {}) { const configLinkage=isPlainObject(config.observationEnvelope)&&isPlainObject(config.observationEnvelope.gatewayLinkage)?config.observationEnvelope.gatewayLinkage:{}; const metadata=isPlainObject(input.metadata)?redactSensitiveObject(input.metadata,config):{}; return { gateway:safeString(metadata.gateway || configLinkage.gateway || "Aster"), linkedGateway:safeString(metadata.linkedGateway || configLinkage.linkedGateway || "LingoLink"), project:safeString(metadata.project || configLinkage.project || "Sandblast"), state:safeString(configLinkage.state || metadata.state || "staged-environmental-pathway") }; }
function shouldInclude(config={},key="includeRaw"){ return !(isPlainObject(config.observationEnvelope) && config.observationEnvelope[key] === false); }
function buildEnvelopePayload(input = {}, options = {}) { const config=loadAsterConfig(); const rawInput=isPlainObject(input)?input:{}; const observation=redactSensitiveObject(extractObservation(rawInput),config); const gatewayMetadata=normalizeGatewayMetadata(rawInput,config); const source=safeString(rawInput.source || observation.source || options.source || "aster-observation-envelope"); const sensorType=normalizeSensorType(observation.sensorType || rawInput.sensorType || options.sensorType || "unknown"); const context=safeString(observation.context || rawInput.context || (isPlainObject(rawInput.classification)?rawInput.classification.context:"") || "environment.unknown"); const risk=isPlainObject(observation.risk)?cloneJson(observation.risk):(isPlainObject(rawInput.risk)?cloneJson(rawInput.risk):{}); const normalized=isPlainObject(observation.normalized)?cloneJson(observation.normalized):(isPlainObject(rawInput.normalized)?cloneJson(rawInput.normalized):{}); const raw=isPlainObject(observation.raw)?cloneJson(observation.raw):(isPlainObject(rawInput.raw)?cloneJson(rawInput.raw):(isPlainObject(rawInput.readings)?cloneJson(rawInput.readings):{})); const warnings=[]; if(sensorType==="unknown")warnings.push("unknown-sensor-type"); if(!Object.keys(normalized).length&&!Object.keys(raw).length)warnings.push("no-observation-readings"); const envelope={ schema:ASTER_OBSERVATION_SCHEMA, version:VERSION, gateway:"Aster", role:"environmental-observation-envelope", observational:true, source, sensorType, context, gatewayMetadata, linkedGateways:[gatewayMetadata.linkedGateway,"LanguageSphere"].filter(Boolean), authority:authoritySurface(), warnings, createdAt:nowIso() }; if(shouldInclude(config,"includeRaw"))envelope.raw=redactSensitiveObject(raw,config); if(shouldInclude(config,"includeNormalized"))envelope.normalized=redactSensitiveObject(normalized,config); if(shouldInclude(config,"includeRisk"))envelope.risk=risk; const riskLevel=safeString(risk.level || risk.riskLevel || rawInput.riskLevel || "unknown").toLowerCase(); envelope.riskLevel=riskLevel; envelope.requiresHumanReview = risk.requiresHumanReview === true || ["high","critical"].includes(riskLevel); return { ok:true, version:VERSION, schema:ASTER_OBSERVATION_SCHEMA, gateway:"Aster", aster:{gateway:"Aster", module:"AsterObservationEnvelope", observational:true}, envelope, observation:envelope, context, risk, riskLevel, requiresHumanReview:envelope.requiresHumanReview, sensorType, source, warnings, gatewayMetadata, ...authoritySurface(), updatedAt:Date.now() }; }
function createAsterObservationEnvelope(input = {}, options = {}) { try { return buildEnvelopePayload(isPlainObject(input)?input:{}, options); } catch(error){ const warnings=["observation-envelope-failed"]; const envelope={ schema:ASTER_OBSERVATION_SCHEMA, version:VERSION, gateway:"Aster", role:"environmental-observation-envelope", observational:true, source:"aster-observation-envelope", sensorType:"unknown", raw:{}, normalized:{}, context:"environment.unknown", risk:{level:"unknown", tags:["risk","unknown","fallback"]}, riskLevel:"unknown", gatewayMetadata:{gateway:"Aster", linkedGateway:"LingoLink", project:"Sandblast", state:"staged-environmental-pathway"}, authority:authoritySurface(), warnings, error:safeString(error&&error.message,"unknown-error"), createdAt:nowIso() }; return { ok:false, version:VERSION, schema:ASTER_OBSERVATION_SCHEMA, gateway:"Aster", aster:{gateway:"Aster", module:"AsterObservationEnvelope", observational:true, status:"fallback"}, envelope, observation:envelope, context:"environment.unknown", risk:envelope.risk, riskLevel:"unknown", warnings, ...authoritySurface(), updatedAt:Date.now() }; } }
function buildAsterObservationEnvelope(input = {}, options = {}) { return createAsterObservationEnvelope(input, options); }
function createObservationEnvelope(input = {}, options = {}) { return createAsterObservationEnvelope(input, options); }
function buildObservationEnvelope(input = {}, options = {}) { return createAsterObservationEnvelope(input, options); }
function envelopeObservation(input = {}, options = {}) { return createAsterObservationEnvelope(input, options); }
function run(input = {}, options = {}) { return createAsterObservationEnvelope(input, options); }
module.exports = { VERSION, ASTER_OBSERVATION_SCHEMA, createAsterObservationEnvelope, buildAsterObservationEnvelope, createObservationEnvelope, buildObservationEnvelope, envelopeObservation, run, default:createAsterObservationEnvelope, _internal:{ loadAsterConfig, extractObservation, normalizeGatewayMetadata, buildEnvelopePayload, shouldInclude, authoritySurface } };
