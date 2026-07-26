"use strict";
const VERSION="nyx.marion.layer27.objectiveHierarchy/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function buildHierarchy(input){ const src=safeObject(input); const explicit=safeString(src.explicitGoal||src.activeGoal||src.goal||src.prompt).slice(0,1000); const missions=safeArray(src.missions||safeRead(src.registry,"missions",[])); const root={id:"root",label:explicit||"preserve current conversational objective",level:"primary",children:[]}; missions.slice(0,24).forEach((m,i)=>{const x=safeObject(m); const label=safeString(x.label||x.goal); if(label) root.children.push({id:safeString(x.id||`objective_${i+1}`),label,level:i<3?"immediate":"supporting",status:safeString(x.status||"active"),priority:clamp01(x.priority,0.5)});}); return bounded({version:VERSION,root,currentTurnObjective:explicit,correctionOverride:Boolean(src.correctionOverride),executionAuthorized:false,replaceReplyAuthority:false}); }
module.exports={VERSION,buildHierarchy,hierarchize:buildHierarchy,run:buildHierarchy,default:buildHierarchy};
