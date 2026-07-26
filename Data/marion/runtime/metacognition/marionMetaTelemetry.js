"use strict";
const VERSION="nyx.marion.layer28.metaTelemetry/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function collect(input){const src=safeObject(input);const meta=safeObject(src.meta||src);return bounded({version:VERSION,layer:28,metrics:{recursionDepth:Math.max(0,Math.min(1,Number(meta.recursionDepth)||0)),passes:Math.max(0,Math.min(2,Number(meta.passes)||0)),approved:meta.approved===true},events:meta.stopped?[safeString(meta.reason||"reflection_stopped")]:[],internalOnly:true,noUserFacingDiagnostics:true,executionAuthorized:false});}
module.exports={VERSION,collect,record:collect,run:collect,default:collect};
