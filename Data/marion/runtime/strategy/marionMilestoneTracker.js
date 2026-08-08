"use strict";
const VERSION="nyx.marion.layer27.milestoneTracker/1.1-baseline-freeze";
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

const VALID_STATUS=new Set(["pending","active","blocked","complete","deferred"]);
function track(input) {
  const src=safeObject(input); const raw=safeArray(safeRead(src,"milestones",safeRead(src,"items",safeRead(src,"steps",[])))).slice(0,40); const seen=new Set(); const milestones=[];
  raw.forEach((item,index)=>{ const x=safeObject(item); let id=safeText(safeRead(x,"id",`milestone_${index+1}`),`milestone_${index+1}`,96); if(!id||seen.has(id)) id=`milestone_${index+1}`; seen.add(id); const statusRaw=safeText(safeRead(x,"status","pending"),"pending",40).toLowerCase(); const status=VALID_STATUS.has(statusRaw)?statusRaw:"pending"; milestones.push({id,label:safeText(safeRead(x,"label",safeRead(x,"name",safeRead(x,"action",""))),"",600),status,progress:clamp01(safeRead(x,"progress",status==="complete"?1:0),status==="complete"?1:0)}); });
  return bounded({version:VERSION,layer:27,milestones,summary:{total:milestones.length,complete:milestones.filter(m=>m.status==="complete").length,blocked:milestones.filter(m=>m.status==="blocked").length},advisoryOnly:true});
}
module.exports={VERSION,track,update:track,run:track,default:track};
