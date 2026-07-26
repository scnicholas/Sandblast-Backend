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
