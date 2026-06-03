"use strict";

const ASTER_MARION_ESCALATION_BRIDGE_VERSION = "nyx.aster.marionEscalationBridge/0.1";
function safeObject(value){return value && typeof value === "object" && !Array.isArray(value) ? value : {};}
function safeString(value){return value == null ? "" : String(value).replace(/\s+/g," ").trim();}
function riskRank(level){return ({none:0,low:1,medium:2,high:3,critical:4})[safeString(level).toLowerCase()] ?? 0;}
function buildAsterMarionEscalationBridge(payload = {}, options = {}) {
  const p = safeObject(payload);
  const envelope = safeObject(p.envelope || p.realWorldEnvelope || safeObject(p.realWorldTrack).envelope);
  const riskLevel = safeString(p.riskLevel || envelope.riskLevel || safeObject(p.riskClassification).riskLevel || "low").toLowerCase();
  const requiresHumanReview = p.requiresHumanReview === true || envelope.requiresHumanReview === true || riskRank(riskLevel) >= 3;
  return {
    version: ASTER_MARION_ESCALATION_BRIDGE_VERSION,
    active: Boolean(Object.keys(envelope).length || p.active === true),
    lane: "real_world",
    source: "AsterMarionEscalationBridge",
    envelope,
    riskLevel,
    requiresHumanReview,
    escalationRecommended: requiresHumanReview,
    advisoryOnly: true,
    finalAnswerAuthorized: false,
    finalAuthority: "Marion",
    marionAuthorityRequired: true,
    publicReplyVisible: false,
    userFacing: false,
    text: "",
    options: safeObject(options)
  };
}
module.exports = { ASTER_MARION_ESCALATION_BRIDGE_VERSION, buildAsterMarionEscalationBridge, default: buildAsterMarionEscalationBridge };
