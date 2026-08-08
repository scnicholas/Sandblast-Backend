"use strict";
const VERSION="nyx.marion.layer28.reasoningAuditor/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) {
  const fallback = {
    version: "unknown",
    bounded: true,
    internalOnly: true,
    noUserFacingDiagnostics: true,
    executionAuthorized: false,
    automaticExecutionAllowed: false,
    replaceComposer: false,
    replaceReplyAuthority: false
  };

  try {
    const source = safeObject(value);
    const out = {
      ...source,
      internalOnly: true,
      noUserFacingDiagnostics: true,
      executionAuthorized: false,
      automaticExecutionAllowed: false,
      replaceComposer: false,
      replaceReplyAuthority: false
    };

    const serialized = JSON.stringify(out);

    if (
      Buffer.byteLength(
        serialized,
        "utf8"
      ) <= limit
    ) {
      return out;
    }

    return {
      ...fallback,
      version:
        safeString(
          safeRead(
            source,
            "version",
            "unknown"
          )
        ) || "unknown"
    };
  } catch (_) {
    return fallback;
  }
}

const confidence=require("./marionConfidenceAnalyzer.js");
const bias=require("./marionBiasDetector.js");
const gaps=require("./marionKnowledgeGapDetector.js");
function audit(input){try{const src=safeObject(input);const proposedReply=safeString(safeRead(src,"proposedReply",safeRead(src,"reply","")));const c=confidence.analyze(src);const b=bias.detect(src);const g=gaps.detect(src);const issues=[];if(g.hasGaps)issues.push("knowledge_gap","unsupported_evidence");if(b.findings.some(x=>x.type==="overconfidence"))issues.push("overconfidence");const approved=issues.length===0&&c.confidence>=0.5;return bounded({version:VERSION,approved,issues,confidence:c.confidence,biases:b.findings,knowledgeGaps:g.gaps,proposedReply,internalOnly:true,executionAuthorized:false,noUserFacingDiagnostics:true});}catch(_){return{version:VERSION,approved:false,issues:["audit_failure_contained"],internalOnly:true,executionAuthorized:false,noUserFacingDiagnostics:true};}}
module.exports={VERSION,audit,analyze:audit,evaluate:audit,run:audit,default:audit};

/* MARION_ROUND3_REASONING_AUDIT_V1_START */
(function(){"use strict";const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionRound3ReasoningAuditV1)return;const VERSION="nyx.marion.round3.reasoningAudit/1.0";
function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}function arr(v){return Array.isArray(v)?v:[]}function str(v){try{return String(v==null?"":v).replace(/\s+/g," ").trim()}catch(_){return""}}function clamp(v,f=.5){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):f}
function resilienceAudit(input={}){const x=obj(input),evidence=arr(x.evidence),assumptions=arr(x.assumptions),alternatives=arr(x.alternatives),missing=arr(x.missingFacts||x.knowledgeGaps);const conflicts=arr(x.conflictingEvidence).length>0||evidence.some(v=>obj(v).conflicts===true);const support=clamp(x.evidenceCoverage,evidence.length?Math.min(.95,.5+evidence.length*.08):.35);const confidence=clamp(x.confidence,support);const issues=[];if(!evidence.length)issues.push("evidence_not_supplied");if(!assumptions.length)issues.push("assumptions_not_explicit");if(missing.length)issues.push("knowledge_gaps_present");if(conflicts)issues.push("conflicting_evidence_requires_revision");return{version:VERSION,approved:issues.length===0||confidence>=.55,issues,confidence,evidenceCoverage:support,assumptions:assumptions.map(str).slice(0,12),knowledgeGaps:missing.map(str).slice(0,12),alternativesConsidered:alternatives.length,currentEvidenceWins:true,revisionRequired:conflicts,internalOnly:true,noUserFacingDiagnostics:true,executionAuthorized:false};}
api.resilienceAudit=resilienceAudit;api.auditCognitiveResilience=resilienceAudit;api.__marionRound3ReasoningAuditV1=true;})();
/* MARION_ROUND3_REASONING_AUDIT_V1_END */
