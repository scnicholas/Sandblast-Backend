"use strict";
const VERSION="nyx.marion.layer27.dependencyResolver/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function resolve(input){ const src=safeObject(input); const steps=safeArray(src.steps||src.items); const ids=new Set(steps.map((s,i)=>safeString(safeRead(s,"id",`step_${i+1}`)))); const unresolved=[]; const resolved=steps.map((s,i)=>{const x=safeObject(s);const id=safeString(x.id||`step_${i+1}`);const dependencies=safeArray(x.dependencies).map(safeString).filter(Boolean);dependencies.forEach(d=>{if(!ids.has(d))unresolved.push({step:id,dependency:d});});return{...x,id,dependencies};}); return bounded({version:VERSION,steps:resolved,unresolved,ready:unresolved.length===0,executionAuthorized:false}); }
module.exports={VERSION,resolve,analyze:resolve,run:resolve,default:resolve};
