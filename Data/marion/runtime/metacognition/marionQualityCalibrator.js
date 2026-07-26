"use strict";
const VERSION="nyx.marion.layer28.qualityCalibrator/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function calibrate(input){const src=safeObject(input);const prompt=safeString(src.prompt);const reply=safeString(src.reply||src.proposedReply);const diagnostic=/TypeError|ReferenceError|stack|at\s+\w+\s*\(/i.test(reply);const recursive=/(reflect(?:ing|ion)?).*(reflect(?:ing|ion)?).*(reflect(?:ing|ion)?)/i.test(reply);const clarity=clamp01(reply?Math.min(1,0.45+reply.length/500):0.1);const specificity=clamp01((/\d+|Layer|file|test/i.test(reply)?0.78:0.55));const completeness=clamp01(src.evidenceCoverage!==undefined?src.evidenceCoverage:(reply.length>=40?0.76:0.45));const confidence=clamp01((clarity+specificity+completeness)/3);const flags=[];if(diagnostic)flags.push("diagnostic_or_stack_leak");if(recursive)flags.push("recursive_reflection");return bounded({version:VERSION,approved:flags.length===0,scores:{clarity,specificity,completeness,confidence},flags,internalOnly:true,executionAuthorized:false});}
module.exports={VERSION,calibrate,score:calibrate,evaluate:calibrate,run:calibrate,default:calibrate};
