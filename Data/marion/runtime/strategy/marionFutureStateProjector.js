"use strict";
const VERSION="nyx.marion.layer27.futureStateProjector/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function project(input){ const src=safeObject(input); const goal=safeString(src.explicitGoal||src.activeGoal||src.goal||src.prompt); const constraints=safeArray(src.constraints).map(safeString).filter(Boolean).slice(0,12); return bounded({version:VERSION,states:[{horizon:"immediate",condition:"current-turn objective is preserved",desiredState:goal||"stable response"},{horizon:"short",condition:"dependencies and tests pass",desiredState:"additive Layer 27 integration"},{horizon:"medium",condition:"Layer 28 remains internal and bounded",desiredState:"reflective quality control without reply takeover"},{horizon:"long",condition:"production telemetry remains stable",desiredState:"cohesive Layers 1 through 28"}],constraints,assumptions:[],executionAuthorized:false}); }
module.exports={VERSION,project,forecast:project,run:project,default:project};
