"use strict";
const VERSION="nyx.marion.layer27.strategicPolicy/1.1-baseline-freeze";
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

const DEFAULTS=Object.freeze({enabled:true,advisoryOnly:true,executionAuthorized:false,automaticExecutionAllowed:false,preserveReplyAuthority:true,preserveComposer:true,currentTurnWins:true,maxSteps:12,maxObjectives:24,maxOutputBytes:48000,safetyFirst:true,architectureFirst:true});
function resolvePolicy(input) { const src=safeObject(input); const p=safeObject(safeRead(src,"policy",src)); return Object.freeze({...DEFAULTS,...safeDataCopy(p),executionAuthorized:false,automaticExecutionAllowed:false,advisoryOnly:true,preserveReplyAuthority:true,preserveComposer:true,currentTurnWins:true,maxSteps:Math.max(1,Math.min(24,Number(safeRead(p,"maxSteps",DEFAULTS.maxSteps))||DEFAULTS.maxSteps)),maxObjectives:Math.max(1,Math.min(50,Number(safeRead(p,"maxObjectives",DEFAULTS.maxObjectives))||DEFAULTS.maxObjectives)),maxOutputBytes:Math.max(4000,Math.min(49000,Number(safeRead(p,"maxOutputBytes",DEFAULTS.maxOutputBytes))||DEFAULTS.maxOutputBytes))}); }
function validateStrategicOutput(output, policy) { const p=resolvePolicy(policy); const o=safeObject(output); const violations=[]; if(safeRead(o,"executionAuthorized",false)===true)violations.push("execution_authorization_forbidden"); if(safeRead(o,"automaticExecutionAllowed",false)===true)violations.push("automatic_execution_forbidden"); if(safeRead(o,"replaceComposer",false)===true)violations.push("composer_replacement_forbidden"); if(safeRead(o,"replaceReplyAuthority",false)===true)violations.push("reply_authority_replacement_forbidden"); let size=0; try{size=byteLength(o);}catch(_){violations.push("non_serializable_output");} if(size>p.maxOutputBytes)violations.push("output_byte_limit_exceeded"); return boundary({version:VERSION,valid:violations.length===0,violations,currentTurnWins:true,policy:p,sizeBytes:size}); }
module.exports={VERSION,DEFAULTS,resolvePolicy,validateStrategicOutput,run:resolvePolicy,default:resolvePolicy};
