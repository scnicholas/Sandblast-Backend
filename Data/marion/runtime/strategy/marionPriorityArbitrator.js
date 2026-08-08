"use strict";
const VERSION="nyx.marion.layer27.priorityArbitrator/1.1-baseline-freeze";
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

function score(item,index) { const o=safeObject(item); const label=safeText(safeRead(o,"label",safeRead(o,"name",safeRead(o,"id",""))),"",600).toLowerCase(); const safety=Boolean(safeRead(o,"blocker",false))||clamp01(safeRead(o,"risk",0),0)>=0.8||/safety|security|recursive|loop|integrity/.test(label); const architecture=Boolean(safeRead(o,"dependency",false))||/preserve|compatib|architecture|layers?\s*1/.test(label); return (safety?4:0)+(architecture?3:0)+clamp01(safeRead(o,"urgency",0.5),0.5)*2+clamp01(safeRead(o,"value",0.5),0.5)+clamp01(safeRead(o,"priority",0.5),0.5)-index/100000; }
function arbitrate(input) {
  const src=safeObject(input); const raw=safeArray(safeRead(src,"candidates",safeRead(src,"items",safeRead(src,"priorities",[])))).slice(0,50); const seen=new Set(); const ranked=[];
  raw.forEach((value,index)=>{ const o=safeObject(value); const fallback=typeof value==="string"?safeText(value,"",600):""; let id=safeText(safeRead(o,"id",safeRead(o,"key",`priority_${index+1}`)),`priority_${index+1}`,96); if(!id)id=`priority_${index+1}`; if(seen.has(id))return; seen.add(id); ranked.push({...safeDataCopy(o),id,label:safeText(safeRead(o,"label",safeRead(o,"name",fallback)),fallback,600),__index:index,__score:score(o,index)}); });
  ranked.sort((a,b)=>b.__score-a.__score||a.__index-b.__index); const clean=ranked.map(item=>{const out=safeDataCopy(item);out.score=Number(item.__score.toFixed(4));delete out.__score;delete out.__index;return out;});
  return bounded({version:VERSION,layer:27,ranked:clean,priorities:clean,deterministic:true,advisoryOnly:true});
}
module.exports={VERSION,arbitrate,rank:arbitrate,prioritize:arbitrate,run:arbitrate,default:arbitrate};

/* MARION_ROUND3_EVIDENCE_PRIORITY_V1_START */
(function(){"use strict";const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionRound3EvidencePriorityV1)return;const V="nyx.marion.round3.evidencePriority/1.0";function arbitrateEvidence(input={}){const x=safeObject(input),items=safeArray(safeRead(x,"candidates",safeRead(x,"options",safeRead(x,"evidence",[])))).slice(0,50).map((v,i)=>{const o=safeObject(v),reliability=clamp01(safeRead(o,"reliability",.5),.5),relevance=clamp01(safeRead(o,"relevance",.5),.5),recency=clamp01(safeRead(o,"recency",.5),.5),reversibility=safeRead(o,"reversible",true)===false?0:1,score=reliability*.4+relevance*.35+recency*.15+reversibility*.1;return{...safeDataCopy(o),id:safeText(safeRead(o,"id",`candidate_${i+1}`),`candidate_${i+1}`,96),score,index:i};}).sort((a,b)=>b.score-a.score||a.index-b.index).map(v=>{const o=safeDataCopy(v);delete o.index;return o;});return boundary({version:V,ranked:items,winner:items[0]||null,currentEvidenceWins:true,deterministic:true,advisoryOnly:true});}api.arbitrateEvidence=arbitrateEvidence;api.__marionRound3EvidencePriorityV1=true;})();
/* MARION_ROUND3_EVIDENCE_PRIORITY_V1_END */
