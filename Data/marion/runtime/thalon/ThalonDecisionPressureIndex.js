"use strict";
const THALON_DECISION_PRESSURE_INDEX_VERSION = "nyx.thalon.decisionPressureIndex/0.1";
function safeString(value){return value == null ? "" : String(value).replace(/\s+/g," ").trim();}
function clamp01(n){n=Number(n);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):0;}
function buildDecisionPressureIndex(payload = {}){
  const text = safeString(payload.text || payload.message || payload.summary);
  let score = clamp01(payload.pressure || payload.decisionPressureIndex || 0);
  if(/urgent|critical|danger|high risk|deadline|legal|ethical|safety|uncertain/i.test(text)) score += 0.25;
  if(/multiple options|tradeoff|trade-off|scenario|strategy|strategic/i.test(text)) score += 0.2;
  score = clamp01(score);
  return {version:THALON_DECISION_PRESSURE_INDEX_VERSION, score, band: score>=0.75?"high":score>=0.45?"medium":score>0?"low":"none", advisoryOnly:true, finalAuthority:"Marion", source:"ThalonDecisionPressureIndex"};
}
module.exports={THALON_DECISION_PRESSURE_INDEX_VERSION, buildDecisionPressureIndex, default:buildDecisionPressureIndex};
