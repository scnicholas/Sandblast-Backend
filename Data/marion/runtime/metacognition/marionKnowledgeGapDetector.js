"use strict";
const VERSION="nyx.marion.layer28.knowledgeGapDetector/1.0";

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

function detect(input){const src=safeObject(input);const claims=safeArray(src.claims);const evidence=safeArray(src.evidence);const gaps=[];claims.forEach((c,i)=>{const x=safeObject(c);if(!(x.sourceBound||x.supported))gaps.push({id:safeString(x.id||`gap_${i+1}`),claim:safeString(x.text),reason:"missing_support"});});if(!claims.length&&/verified|installed|confirmed/i.test(safeString(src.proposedReply||src.reply))&&!evidence.length)gaps.push({id:"implicit_claim_gap",claim:"verification claim",reason:"missing_support"});return bounded({version:VERSION,gaps,hasGaps:gaps.length>0,internalOnly:true,executionAuthorized:false});}
module.exports={VERSION,detect,analyze:detect,run:detect,default:detect};
