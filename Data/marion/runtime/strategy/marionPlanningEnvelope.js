"use strict";
const VERSION="nyx.marion.layer27.planningEnvelope/1.1-baseline-freeze";
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

function build(input) {
  const src=safeObject(input); const base=safeObject(safeRead(src,"baseEnvelope",{})); const out=safeDataCopy(base);
  const reply=safeText(safeRead(base,"reply",safeRead(base,"displayReply","")),"",12000); if(reply){out.reply=reply;out.displayReply=safeText(safeRead(base,"displayReply",reply),reply,12000)||reply;}
  for(const key of ["visibleReply","directReply","finalReply","answer","response","text","message","spokenText"]){ if(safeOwn(base,key)) out[key]=safeText(safeRead(base,key,reply),reply,12000)||reply; }
  for(const key of ["ok","final","handled","stateSpine"]){ if(safeOwn(base,key)) out[key]=safeRead(base,key,out[key]); }
  const layer27={version:VERSION,plan:safeObject(safeRead(src,"plan",{})),priorities:safeObject(safeRead(src,"priorities",{})),internalOnly:true,executionAuthorized:false,automaticExecutionAllowed:false,replaceComposer:false,replaceReplyAuthority:false};
  out.layer27=layer27; out.planning=layer27; out.noUserFacingDiagnostics=true; out.executionAuthorized=false; out.automaticExecutionAllowed=false; out.replaceComposer=false; out.replaceReplyAuthority=false; out.internalOnly=true;
  try { if(byteLength(out)<=48000)return out; } catch(_){}
  const fallback=boundary({version:VERSION,bounded:true,degraded:true,layer27:{version:VERSION,internalOnly:true,executionAuthorized:false}}); if(reply){fallback.reply=reply;fallback.displayReply=out.displayReply||reply;} for(const key of ["ok","final","handled","stateSpine"]) if(safeOwn(base,key)) fallback[key]=safeRead(base,key,undefined); return fallback;
}
module.exports={VERSION,build,create:build,wrap:build,run:build,default:build};
