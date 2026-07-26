"use strict";
const VERSION="nyx.marion.layer28.reasoningAuditor/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

const confidence=require("./marionConfidenceAnalyzer.js"); const bias=require("./marionBiasDetector.js"); const gaps=require("./marionKnowledgeGapDetector.js");
function audit(input){try{const src=safeObject(input);const proposedReply=safeString(safeRead(src,"proposedReply",safeRead(src,"reply","")));const c=confidence.analyze(src);const b=bias.detect(src);const g=gaps.detect(src);const issues=[];if(g.hasGaps)issues.push("knowledge_gap","unsupported_evidence");if(b.findings.some(x=>x.type==="overconfidence"))issues.push("overconfidence");const approved=issues.length===0&&c.confidence>=0.5;return bounded({version:VERSION,approved,issues,confidence:c.confidence,biases:b.findings,knowledgeGaps:g.gaps,proposedReply,internalOnly:true,executionAuthorized:false,noUserFacingDiagnostics:true});}catch(_){return{version:VERSION,approved:false,issues:["audit_failure_contained"],internalOnly:true,executionAuthorized:false,noUserFacingDiagnostics:true};}}
module.exports={VERSION,audit,analyze:audit,evaluate:audit,run:audit,default:audit};
