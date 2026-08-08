"use strict";
const VERSION="nyx.marion.layer28.reflectionEngine/1.0";

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

const auditor=require("./marionReasoningAuditor.js"); const calibrator=require("./marionQualityCalibrator.js");
function reflect(input){try{const src=safeObject(input);const depth=Math.max(0,Math.min(1,Number(src.recursionDepth)||0));if(depth>=1)return{version:VERSION,recursionDepth:depth,passes:0,stopped:true,reason:"reflection_depth_limit",internalOnly:true,executionAuthorized:false};const base=safeObject(safeRead(src,"baseEnvelope",{}));const reply=safeString(safeRead(base,"reply",safeRead(src,"reply","")));const audit=auditor.audit({...src,proposedReply:reply});const quality=calibrator.calibrate({...src,reply});return bounded({version:VERSION,recursionDepth:depth+1,passes:1,audit,quality,approved:audit.approved&&quality.approved,internalOnly:true,executionAuthorized:false,noUserFacingDiagnostics:true});}catch(_){return{version:VERSION,recursionDepth:1,passes:0,stopped:true,reason:"reflection_failure_contained",internalOnly:true,executionAuthorized:false};}}
module.exports={VERSION,reflect,analyze:reflect,run:reflect,default:reflect};
