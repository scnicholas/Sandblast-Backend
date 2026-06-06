"use strict";

/** AsterMarionEscalationBridge.js — after-conflagration hardened runtime. */
const ASTER_MARION_ESCALATION_BRIDGE_VERSION = "nyx.aster.marionEscalationBridge/0.2";
function safeObject(value){return value && typeof value === "object" && !Array.isArray(value) ? value : {};}
function safeString(value, fallback=""){return value == null ? fallback : String(value).replace(/\s+/g," ").trim() || fallback;}
const RISK_RANK = Object.freeze({unknown:-1,none:0,low:1,moderate:2,medium:2,elevated:3,high:4,critical:5});
function normalizeRiskLevel(level){const raw=safeString(level,"unknown").toLowerCase(); if(raw==="medium")return"moderate"; if(raw==="normal")return"none"; if(raw==="severe")return"critical"; return Object.prototype.hasOwnProperty.call(RISK_RANK,raw)?raw:"unknown";}
function riskRank(level){return RISK_RANK[normalizeRiskLevel(level)] ?? -1;}
function authoritySurface(){return {advisoryOnly:true, finalAnswerAuthorized:false, finalAuthority:"Marion", marionAuthorityRequired:true, neverOverrideMarionFinal:true, publicReplyVisible:false, userFacing:false, publicText:"", renderText:"", text:"", publicAgent:"nyx", displayAuthority:"nyx"};}
function extractEnvelope(payload={}){const p=safeObject(payload); return safeObject(p.envelope || p.realWorldEnvelope || safeObject(p.realWorldTrack).envelope || safeObject(p.observation).envelope || p.observation);}
function buildAsterMarionEscalationBridge(payload = {}, options = {}) {
  const p = safeObject(payload); const envelope = extractEnvelope(p); const riskObject = safeObject(p.risk || envelope.risk || p.riskClassification); const riskLevel = normalizeRiskLevel(p.riskLevel || envelope.riskLevel || riskObject.level || riskObject.riskLevel || safeObject(p.riskClassification).riskLevel || "low"); const rank = riskRank(riskLevel); const requiresHumanReview = p.requiresHumanReview === true || envelope.requiresHumanReview === true || riskObject.requiresHumanReview === true || rank >= RISK_RANK.high; const active = Boolean(Object.keys(envelope).length || p.active === true || rank >= RISK_RANK.elevated);
  return { version:ASTER_MARION_ESCALATION_BRIDGE_VERSION, active, lane:"real_world", source:"AsterMarionEscalationBridge", envelope, riskLevel, riskRank:rank, requiresHumanReview, escalationRecommended:requiresHumanReview, reasonCodes:Array.isArray(riskObject.reasonCodes)?riskObject.reasonCodes:[], warnings:Array.isArray(p.warnings)?p.warnings:[], options:safeObject(options), ...authoritySurface(), updatedAt:Date.now() };
}
function run(payload={}, options={}){return buildAsterMarionEscalationBridge(payload, options);}
module.exports = { ASTER_MARION_ESCALATION_BRIDGE_VERSION, buildAsterMarionEscalationBridge, run, default: buildAsterMarionEscalationBridge, _internal:{normalizeRiskLevel,riskRank,extractEnvelope,authoritySurface} };
