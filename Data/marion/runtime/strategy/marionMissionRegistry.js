"use strict";
const VERSION="nyx.marion.layer27.missionRegistry/1.1-baseline-freeze";
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

const VALID_STATUS=new Set(["active","deferred","completed","abandoned","blocked"]);
function normalizeMission(item,index) { const x=safeObject(item); return {id:safeText(safeRead(x,"id",safeRead(x,"key",`mission_${index+1}`)),`mission_${index+1}`,96),label:safeText(safeRead(x,"label",safeRead(x,"name",safeRead(x,"goal",safeRead(x,"objective","")))),"",600),status:VALID_STATUS.has(safeText(safeRead(x,"status","active"),"active",40).toLowerCase())?safeText(safeRead(x,"status","active"),"active",40).toLowerCase():"active",priority:clamp01(safeRead(x,"priority",0.5),0.5),source:safeText(safeRead(x,"source","conversation"),"conversation",80)}; }
function buildRegistry(input) {
  const src=safeObject(input); const raw=safeArray(safeRead(src,"missions",safeRead(src,"items",safeRead(src,"goals",[])))).slice(0,50); const missions=[]; const byId=new Map();
  raw.forEach((item,index)=>{ const m=normalizeMission(item,index); if(!m.label)return; if(!byId.has(m.id)){byId.set(m.id,missions.length);missions.push(m);} });
  const explicit=safeText(safeRead(src,"explicitGoal",safeRead(src,"activeGoal","")),"",1200);
  if(explicit){ const current=normalizeMission({id:"current_turn_goal",label:explicit,status:"active",priority:1,source:"current_turn"},0); const existing=byId.get(current.id); if(existing!==undefined) missions.splice(existing,1); for(const m of missions) if(m.label===explicit) m.status="deferred"; missions.unshift(current); }
  return bounded({version:VERSION,layer:27,missions,active:missions.filter(m=>m.status==="active"),deferred:missions.filter(m=>m.status==="deferred"),currentTurnWins:true,advisoryOnly:true});
}
module.exports={VERSION,buildRegistry,register:buildRegistry,run:buildRegistry,default:buildRegistry};
