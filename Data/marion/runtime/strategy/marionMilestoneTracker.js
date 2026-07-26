"use strict";
const VERSION="nyx.marion.layer27.milestoneTracker/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function track(input){ const src=safeObject(input); const milestones=safeArray(src.milestones||src.items||src.steps).slice(0,40).map((m,i)=>{const x=safeObject(m);const status=["pending","active","blocked","complete","deferred"].includes(safeString(x.status).toLowerCase())?safeString(x.status).toLowerCase():"pending";return{id:safeString(x.id||`milestone_${i+1}`),label:safeString(x.label||x.name||x.action),status,progress:clamp01(x.progress,status==="complete"?1:0)};}); return bounded({version:VERSION,milestones,summary:{total:milestones.length,complete:milestones.filter(m=>m.status==="complete").length,blocked:milestones.filter(m=>m.status==="blocked").length},executionAuthorized:false}); }
module.exports={VERSION,track,update:track,run:track,default:track};
