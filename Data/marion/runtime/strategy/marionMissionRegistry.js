"use strict";
const VERSION="nyx.marion.layer27.missionRegistry/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function normalizeMission(m,i){ const x=safeObject(m); return {id:safeString(x.id||x.key||`mission_${i+1}`).slice(0,96),label:safeString(x.label||x.name||x.goal||x.objective).slice(0,500),status:["active","deferred","completed","abandoned","blocked"].includes(safeString(x.status).toLowerCase())?safeString(x.status).toLowerCase():"active",priority:clamp01(x.priority,0.5),source:safeString(x.source||"conversation").slice(0,80)}; }
function buildRegistry(input){ const src=safeObject(input); const raw=safeArray(src.missions||src.items||src.goals); const seen=new Set(); const missions=[]; raw.slice(0,50).forEach((m,i)=>{const n=normalizeMission(m,i); if(n.label&&!seen.has(n.id)){seen.add(n.id);missions.push(n);}}); const explicit=safeString(src.explicitGoal||src.activeGoal); if(explicit&&!missions.some(m=>m.label===explicit)) missions.unshift(normalizeMission({id:"current_turn_goal",label:explicit,status:"active",priority:1,source:"current_turn"},0)); return bounded({version:VERSION,missions,active:missions.filter(m=>m.status==="active"),deferred:missions.filter(m=>m.status==="deferred"),executionAuthorized:false,internalOnly:true}); }
module.exports={VERSION,buildRegistry,register:buildRegistry,run:buildRegistry,default:buildRegistry};
