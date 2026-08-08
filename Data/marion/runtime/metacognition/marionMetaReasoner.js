"use strict";
const VERSION="nyx.marion.layer28.metaReasoner/1.0";

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

const policyApi=require("./marionMetaReasoningPolicy.js"); const reflection=require("./marionReflectionEngine.js");
function reason(input){try{const src=safeObject(input);const policy=policyApi.resolve(src);const depth=Math.max(0,Math.min(policy.maxRecursionDepth,Number(safeRead(src,"recursionDepth",0))||0));const base=safeObject(safeRead(src,"baseEnvelope",{}));const result=reflection.reflect({...src,baseEnvelope:base,recursionDepth:depth});return bounded({version:VERSION,layer:28,recursionDepth:result.recursionDepth||depth,passes:result.passes||0,audit:result.audit||{},quality:result.quality||{},approved:result.approved===true,stopped:result.stopped===true,reason:result.reason,internalOnly:true,noUserFacingDiagnostics:true,executionAuthorized:false});}catch(_){return{version:VERSION,layer:28,recursionDepth:0,passes:0,approved:false,stopped:true,reason:"meta_failure_contained",internalOnly:true,noUserFacingDiagnostics:true,executionAuthorized:false};}}
module.exports={VERSION,reason,reflect:reason,analyze:reason,run:reason,default:reason};
