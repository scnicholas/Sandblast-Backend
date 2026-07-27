"use strict";
const VERSION="nyx.marion.layer28.qualityCalibrator/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function calibrate(input){const src=safeObject(input);const prompt=safeString(src.prompt);const reply=safeString(src.reply||src.proposedReply);const diagnostic=/TypeError|ReferenceError|\bstack\b|\bat\s+\w+\s*\(/i.test(reply);const recursive=/(reflect(?:ing|ion)?).*(reflect(?:ing|ion)?).*(reflect(?:ing|ion)?)/i.test(reply);const clarity=clamp01(reply?Math.min(1,0.45+reply.length/500):0.1);const specificity=clamp01((/\b\d+\b|Layer|file|test/i.test(reply)?0.78:0.55));const completeness=clamp01(src.evidenceCoverage!==undefined?src.evidenceCoverage:(reply.length>=40?0.76:0.45));const confidence=clamp01((clarity+specificity+completeness)/3);const flags=[];if(diagnostic)flags.push("diagnostic_or_stack_leak");if(recursive)flags.push("recursive_reflection");return bounded({version:VERSION,approved:flags.length===0,scores:{clarity,specificity,completeness,confidence},flags,internalOnly:true,executionAuthorized:false});}
module.exports={VERSION,calibrate,score:calibrate,evaluate:calibrate,run:calibrate,default:calibrate};

/* MARION_ROUND3_QUALITY_CALIBRATION_V1_START */
(function(){"use strict";const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionRound3QualityCalibrationV1)return;const VERSION="nyx.marion.round3.qualityCalibration/1.0";
function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}function str(v){try{return String(v==null?"":v)}catch(_){return""}}function has(reply,rx){return rx.test(str(reply))}
function calibrateResilience(input={}){const x=obj(input),reply=str(x.reply||x.proposedReply),flags=[];if(!reply.trim())flags.push("empty_reply");if(has(reply,/\b(always|never|certainly|guaranteed)\b/i)&&!has(reply,/\bunless|except|uncertain|confidence|evidence\b/i))flags.push("unqualified_certainty");if(x.missingFacts&&Array.isArray(x.missingFacts)&&x.missingFacts.length&&!has(reply,/\bmissing|unknown|assum|provisional|scenario\b/i))flags.push("knowledge_gap_not_disclosed");if(x.conflictingEvidence===true&&!has(reply,/\brevise|changed|new evidence|reassess|update\b/i))flags.push("evidence_revision_not_visible");if(x.assumptionAuditRequired===true&&!has(reply,/\bassum/i))flags.push("assumptions_not_disclosed");return{version:VERSION,approved:flags.length===0,flags,scores:{clarity:reply.length>=40?.82:.45,specificity:has(reply,/\bevidence|assum|confidence|risk|option/i)?.84:.58,calibration:flags.length?Math.max(.2,.8-flags.length*.15):.9},internalOnly:true,noUserFacingDiagnostics:true,executionAuthorized:false};}
api.calibrateResilience=calibrateResilience;api.__marionRound3QualityCalibrationV1=true;})();
/* MARION_ROUND3_QUALITY_CALIBRATION_V1_END */
