"use strict";
const VERSION="nyx.marion.layer27.priorityArbitrator/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function score(x,index){ const o=safeObject(x); const label=safeString(o.label||o.name||o.id).toLowerCase(); const safety=Boolean(o.blocker)||clamp01(o.risk,0)>=0.8||/safety|security|recursive|loop|integrity/.test(label); const architecture=Boolean(o.dependency)||/preserve|compatib|architecture|layers? 1/.test(label); return (safety?4:0)+(architecture?3:0)+clamp01(o.urgency,0.5)*2+clamp01(o.value,0.5)+clamp01(o.priority,0.5)-index/100000; }
function arbitrate(input){ const src=safeObject(input); const raw=safeArray(src.candidates||src.items||src.priorities); const seen=new Set(); const ranked=raw.slice(0,50).map((v,i)=>{const o=safeObject(v); const id=safeString(o.id||o.key||`priority_${i+1}`); return {...o,id,__index:i,__score:score(o,i)};}).filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true;}).sort((a,b)=>b.__score-a.__score||a.__index-b.__index).map(x=>{const y={...x,score:Number(x.__score.toFixed(4))};delete y.__index;delete y.__score;return y;}); return bounded({version:VERSION,ranked,priorities:ranked,executionAuthorized:false,deterministic:true}); }
module.exports={VERSION,arbitrate,rank:arbitrate,prioritize:arbitrate,run:arbitrate,default:arbitrate};

/* MARION_ROUND3_EVIDENCE_PRIORITY_V1_START */
(function(){"use strict";const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionRound3EvidencePriorityV1)return;const VERSION="nyx.marion.round3.evidencePriority/1.0";
function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}function arr(v){return Array.isArray(v)?v:[]}function n(v,f=0){const x=Number(v);return Number.isFinite(x)?x:f}function str(v){try{return String(v==null?"":v)}catch(_){return""}}
function arbitrateEvidence(input={}){const x=obj(input),items=arr(x.candidates||x.options||x.evidence).slice(0,50).map((v,i)=>{const o=obj(v),reliability=Math.max(0,Math.min(1,n(o.reliability,.5))),relevance=Math.max(0,Math.min(1,n(o.relevance,.5))),recency=Math.max(0,Math.min(1,n(o.recency,.5))),reversibility=o.reversible===false?0:1,score=reliability*.4+relevance*.35+recency*.15+reversibility*.1;return{...o,id:str(o.id||`candidate_${i+1}`),score,index:i}}).sort((a,b)=>b.score-a.score||a.index-b.index);return{version:VERSION,ranked:items,winner:items[0]||null,currentEvidenceWins:true,deterministic:true,advisoryOnly:true,executionAuthorized:false,internalOnly:true};}
api.arbitrateEvidence=arbitrateEvidence;api.__marionRound3EvidencePriorityV1=true;})();
/* MARION_ROUND3_EVIDENCE_PRIORITY_V1_END */
