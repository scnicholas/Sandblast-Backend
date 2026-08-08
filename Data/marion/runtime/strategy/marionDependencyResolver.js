"use strict";
const VERSION="nyx.marion.layer27.dependencyResolver/1.1-baseline-freeze";
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

function resolve(input) {
  const src=safeObject(input); const raw=safeArray(safeRead(src,"steps",safeRead(src,"items",[]))).slice(0,50);
  const resolved=[]; const ids=new Set();
  raw.forEach((item,index)=>{ const x=safeObject(item); let id=safeText(safeRead(x,"id",`step_${index+1}`),`step_${index+1}`,96); if(!id) id=`step_${index+1}`; if(ids.has(id)) id=`${id}_${index+1}`; ids.add(id); resolved.push({...safeDataCopy(x),id,dependencies:[]}); });
  const unresolved=[];
  resolved.forEach((step,index)=>{ const source=safeObject(raw[index]); const deps=safeArray(safeRead(source,"dependencies",[])).map(v=>safeText(v,"",96)).filter(Boolean).slice(0,24); step.dependencies=[...new Set(deps)]; for(const dep of step.dependencies) if(!ids.has(dep)) unresolved.push({step:step.id,dependency:dep}); });
  const graph=new Map(resolved.map(step=>[step.id,step.dependencies.filter(dep=>ids.has(dep))])); const visiting=new Set(), visited=new Set(), cycles=[];
  function visit(id,path=[]){ if(visiting.has(id)){cycles.push([...path,id]);return;} if(visited.has(id))return; visiting.add(id); for(const dep of graph.get(id)||[]) visit(dep,[...path,id]); visiting.delete(id); visited.add(id); }
  for(const id of graph.keys()) visit(id,[]);
  return bounded({version:VERSION,layer:27,steps:resolved,unresolved,cycles:cycles.slice(0,12),ready:unresolved.length===0&&cycles.length===0,advisoryOnly:true});
}
module.exports={VERSION,resolve,analyze:resolve,run:resolve,default:resolve};
