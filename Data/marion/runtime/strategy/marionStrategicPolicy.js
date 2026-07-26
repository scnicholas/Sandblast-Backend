"use strict";
const VERSION="nyx.marion.layer27.strategicPolicy/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

const DEFAULTS=Object.freeze({enabled:true,advisoryOnly:true,executionAuthorized:false,preserveReplyAuthority:true,preserveComposer:true,currentTurnWins:true,maxSteps:12,maxObjectives:24,maxOutputBytes:48000,safetyFirst:true,architectureFirst:true});
function resolvePolicy(input){ const src=safeObject(input); const p=safeObject(safeRead(src,"policy",src)); return Object.freeze({...DEFAULTS,...p,executionAuthorized:false,advisoryOnly:true,preserveReplyAuthority:true,preserveComposer:true,currentTurnWins:true,maxSteps:Math.max(1,Math.min(24,Number(p.maxSteps)||DEFAULTS.maxSteps)),maxObjectives:Math.max(1,Math.min(50,Number(p.maxObjectives)||DEFAULTS.maxObjectives)),maxOutputBytes:Math.max(4000,Math.min(49000,Number(p.maxOutputBytes)||DEFAULTS.maxOutputBytes))}); }
function validateStrategicOutput(output, policy){ const p=resolvePolicy(policy); const o=safeObject(output); const violations=[]; if(o.executionAuthorized===true) violations.push("execution_authorization_forbidden"); if(o.replaceComposer===true) violations.push("composer_replacement_forbidden"); if(o.replaceReplyAuthority===true) violations.push("reply_authority_replacement_forbidden"); let size=0; try{size=JSON.stringify(o).length;}catch(_){violations.push("non_serializable_output");} if(size>p.maxOutputBytes) violations.push("output_byte_limit_exceeded"); return {version:VERSION,valid:violations.length===0,violations,executionAuthorized:false,policy:p}; }
module.exports={VERSION,DEFAULTS,resolvePolicy,validateStrategicOutput,run:resolvePolicy,default:resolvePolicy};
