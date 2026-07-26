"use strict";
const VERSION="nyx.marion.layer27.opportunityDetector/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function detect(input){ const src=safeObject(input); const text=[safeString(src.prompt),safeString(src.context),safeString(src.activeGoal)].join(" "); const rules=[["licensing",/rights|licens|copyright/i],["revenue",/revenue|advertis|monetiz/i],["integration",/integrat|backend|runtime/i],["quality",/test|regression|audit/i]]; const opportunities=rules.filter(r=>r[1].test(text)).map((r,i)=>({id:r[0],label:r[0],confidence:0.72-i*0.03,advisoryOnly:true})); return bounded({version:VERSION,opportunities,executionAuthorized:false,requiresUserApproval:true}); }
module.exports={VERSION,detect,analyze:detect,run:detect,default:detect};
