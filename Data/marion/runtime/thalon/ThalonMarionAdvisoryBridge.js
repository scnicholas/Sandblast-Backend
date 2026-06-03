"use strict";

const { buildDecisionPressureIndex } = require("./ThalonDecisionPressureIndex");
const THALON_MARION_ADVISORY_BRIDGE_VERSION = "nyx.thalon.marionAdvisoryBridge/0.1";
function safeObject(value){return value && typeof value === "object" && !Array.isArray(value) ? value : {};}
function buildThalonMarionAdvisoryBridge(payload = {}, options = {}) {
  const pressure = buildDecisionPressureIndex(payload);
  const p = safeObject(payload);
  return {
    version: THALON_MARION_ADVISORY_BRIDGE_VERSION,
    active: Boolean(p.active === true || pressure.score > 0 || Object.keys(safeObject(p.strategicReview)).length),
    lane: "strategic",
    source: "ThalonMarionAdvisoryBridge",
    decisionPressureIndex: pressure.score,
    pressureBand: pressure.band,
    strategicReviewRequired: pressure.score >= 0.45,
    requiresHumanReview: pressure.score >= 0.75 || p.requiresHumanReview === true,
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
module.exports = { THALON_MARION_ADVISORY_BRIDGE_VERSION, buildThalonMarionAdvisoryBridge, default: buildThalonMarionAdvisoryBridge };
