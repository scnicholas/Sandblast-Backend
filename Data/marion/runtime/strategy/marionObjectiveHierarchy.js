"use strict";
const VERSION="nyx.marion.layer27.objectiveHierarchy/1.1-baseline-freeze";
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

function buildHierarchy(input) {
  const src=safeObject(input); const explicit=safeText(safeRead(src,"explicitGoal",safeRead(src,"activeGoal",safeRead(src,"goal",safeRead(src,"prompt","")))),"",1200); const missions=safeArray(safeRead(src,"missions",safeRead(safeObject(safeRead(src,"registry",{})),"missions",[]))).slice(0,24);
  const root={id:"root",label:explicit||"preserve current conversational objective",level:"primary",children:[]}; const seen=new Set();
  missions.forEach((item,index)=>{ const x=safeObject(item); const label=safeText(safeRead(x,"label",safeRead(x,"goal","")),"",600); if(!label)return; let id=safeText(safeRead(x,"id",`objective_${index+1}`),`objective_${index+1}`,96); if(seen.has(id))id=`objective_${index+1}`; seen.add(id); root.children.push({id,label,level:index<3?"immediate":"supporting",status:safeText(safeRead(x,"status","active"),"active",40),priority:clamp01(safeRead(x,"priority",0.5),0.5)}); });
  return bounded({version:VERSION,layer:27,root,currentTurnObjective:explicit,currentGoal:explicit,correctionOverride:Boolean(safeRead(src,"correctionOverride",false)),currentTurnWins:true,advisoryOnly:true});
}
module.exports={VERSION,buildHierarchy,hierarchize:buildHierarchy,run:buildHierarchy,default:buildHierarchy};
