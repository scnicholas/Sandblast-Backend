"use strict";
const VERSION="nyx.marion.layer27.conversationTrajectory/1.1-baseline-freeze";
function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeRead(obj, key, fallback) {
  try { const value = obj && obj[key]; return value === undefined ? fallback : value; }
  catch (_) { return fallback; }
}
function safeOwn(obj, key) {
  try { return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key)); }
  catch (_) { return false; }
}
function safeText(value, fallback = "", max = 12000) {
  try {
    const type = typeof value;
    const primitive = type === "string" ? value :
      (type === "number" || type === "boolean" || type === "bigint") ? String(value) : fallback;
    return String(primitive).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, Math.max(0, Math.min(Number(max) || 12000, 100000)));
  } catch (_) { return fallback; }
}
function clamp01(value, fallback = 0) {
  const n = Number(value); const f = Number(fallback);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0));
}
function safeDataCopy(value) {
  const source = safeObject(value), out = {}; let keys = [];
  try { keys = Object.keys(source); } catch (_) { return out; }
  for (const key of keys) { const v = safeRead(source, key, undefined); if (v !== undefined) out[key] = v; }
  return out;
}
function byteLength(value) { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
function boundary(out = {}) {
  return {
    ...safeDataCopy(out),
    executionAuthorized: false,
    automaticExecutionAllowed: false,
    replaceComposer: false,
    replaceReplyAuthority: false,
    internalOnly: true,
    noUserFacingDiagnostics: true
  };
}
function bounded(value, limit = 48000) {
  try {
    const out = boundary(value);
    if (byteLength(out) <= limit) return out;
    return boundary({ version: safeText(safeRead(out, "version", "unknown"), "unknown", 180), bounded: true, degraded: true });
  } catch (_) {
    return boundary({ bounded: true, degraded: true });
  }
}

function analyze(input) {
  const src=safeObject(input);
  const prompt=safeText(safeRead(src,"prompt",safeRead(src,"userText",safeRead(src,"message",""))),"",6000);
  const previous=safeText(safeRead(src,"previousGoal",safeRead(safeObject(safeRead(src,"previous",{})),"goal","")),"",1200);
  const current=safeText(safeRead(src,"explicitGoal",safeRead(src,"activeGoal",prompt)),"",1200);
  const interactionState=safeText(safeRead(src,"interactionState",""),"",80).toLowerCase();
  const correction=Boolean(safeRead(src,"correctionOverride",false)) || interactionState==="correction" || /\\b(?:correction|correct|instead|first|rather)\\b/i.test(prompt);
  const direction=correction?"corrected":previous&&current!==previous?"pivoted":previous?"continued":"initiated";
  return bounded({version:VERSION,layer:27,direction,previousGoal:previous,currentGoal:current,effectiveGoal:current,currentTurnWins:true,correctionOverride:correction,confidence:current?0.9:0.4});
}
module.exports={VERSION,analyze,project:analyze,run:analyze,default:analyze};
