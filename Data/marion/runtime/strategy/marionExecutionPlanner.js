"use strict";
const VERSION="nyx.marion.layer27.executionPlanner/1.1-baseline-freeze";
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

function create(input) {
  const src=safeObject(input); const goal=safeText(safeRead(src,"explicitGoal",safeRead(src,"activeGoal",safeRead(src,"goal",safeRead(src,"prompt","")))),"",1200);
  const supplied=safeArray(safeRead(src,"steps",[]));
  const defaults=[
    {id:"preserve",action:"preserve Layers 1 through 26 contracts"},
    {id:"validate",action:"validate Layer 27 planning metadata",dependencies:["preserve"]},
    {id:"reflect",action:"evaluate internally through Layer 28",dependencies:["validate"]},
    {id:"return",action:"return through existing final reply authority",dependencies:["reflect"]}
  ];
  const seen=new Set(); const steps=(supplied.length?supplied:defaults).slice(0,12).map((item,index)=>{ const x=safeObject(item); let id=safeText(safeRead(x,"id",`step_${index+1}`),`step_${index+1}`,96); if(!id)id=`step_${index+1}`; if(seen.has(id))id=`${id}_${index+1}`; seen.add(id); return {...safeDataCopy(x),id,action:safeText(safeRead(x,"action",safeRead(x,"label","")),"",600),dependencies:[...new Set(safeArray(safeRead(x,"dependencies",[])).map(v=>safeText(v,"",96)).filter(Boolean))].slice(0,12),requiresApproval:true,status:"planned",executionAuthorized:false}; });
  return bounded({version:VERSION,layer:27,goal,currentGoal:goal,steps,planOnly:true,requiresUserApproval:true,advisoryOnly:true});
}
module.exports={VERSION,create,plan:create,run:create,default:create};
