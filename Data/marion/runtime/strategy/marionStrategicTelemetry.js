"use strict";
const VERSION="nyx.marion.layer27.strategicTelemetry/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function collect(input){ const src=safeObject(input); const plan=safeObject(src.plan||src); const events=[]; if(safeRead(plan,"correctionOverride",false))events.push("current_turn_correction_preserved"); if(safeArray(plan.steps).length)events.push("execution_plan_created"); if(safeArray(plan.opportunities).length)events.push("opportunities_detected"); return bounded({version:VERSION,layer:27,events,metrics:{stepCount:safeArray(plan.steps).length,priorityCount:safeArray(plan.priorities||plan.ranked).length},internalOnly:true,noUserFacingDiagnostics:true,executionAuthorized:false}); }
module.exports={VERSION,collect,record:collect,run:collect,default:collect};
