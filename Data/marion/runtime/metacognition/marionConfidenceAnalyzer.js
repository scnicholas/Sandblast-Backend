"use strict";
const VERSION="nyx.marion.layer28.confidenceAnalyzer/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function analyze(input){const src=safeObject(input);const claims=safeArray(src.claims);const evidence=safeArray(src.evidence);let supported=claims.filter(c=>safeRead(c,"sourceBound",false)||safeRead(c,"supported",false)).length;let score=claims.length?clamp01(supported/claims.length):clamp01(src.confidence,evidence.length?0.75:0.5);const gaps=claims.filter(c=>!(safeRead(c,"sourceBound",false)||safeRead(c,"supported",false))).map(c=>safeString(safeRead(c,"text","unsupported claim"))).slice(0,10);return bounded({version:VERSION,confidence:score,knowledgeGaps:gaps,evidenceCount:evidence.length,internalOnly:true,executionAuthorized:false});}
module.exports={VERSION,analyze,score:analyze,run:analyze,default:analyze};
