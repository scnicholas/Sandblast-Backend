"use strict";
const VERSION="nyx.marion.layer27.executionPlanner/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function create(input){ const src=safeObject(input); const goal=safeString(src.explicitGoal||src.activeGoal||src.goal||src.prompt); const supplied=safeArray(src.steps); const steps=(supplied.length?supplied:[{id:"preserve",action:"preserve Layers 1 through 26 contracts"},{id:"validate",action:"validate Layer 27 planning metadata",dependencies:["preserve"]},{id:"reflect",action:"evaluate internally through Layer 28",dependencies:["validate"]},{id:"return",action:"return through existing final reply authority",dependencies:["reflect"]}]).slice(0,12).map((s,i)=>{const x=safeObject(s);return{id:safeString(x.id||`step_${i+1}`),action:safeString(x.action||x.label),dependencies:safeArray(x.dependencies).map(safeString),requiresApproval:x.requiresApproval!==false,status:"planned"};}); return bounded({version:VERSION,goal,steps,executionAuthorized:false,planOnly:true,requiresUserApproval:true}); }
module.exports={VERSION,create,plan:create,run:create,default:create};
