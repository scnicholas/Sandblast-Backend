"use strict";
const VERSION="nyx.marion.layer28.metaReasoningPolicy/1.0";

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

const DEFAULTS=Object.freeze({enabled:true,internalOnly:true,maxPasses:1,maxRecursionDepth:1,maxOutputBytes:48000,preserveReply:true,executionAuthorized:false,automaticExecutionAllowed:false,replaceComposer:false,replaceReplyAuthority:false,noUserFacingDiagnostics:true});
function resolve(input){const src=safeObject(input);const p=safeObject(src.policy||src);return Object.freeze({...DEFAULTS,...p,internalOnly:true,maxPasses:Math.max(0,Math.min(1,Number(p.maxPasses)||1)),maxRecursionDepth:Math.max(0,Math.min(1,Number(p.maxRecursionDepth)||1)),maxOutputBytes:Math.max(4000,Math.min(49000,Number(p.maxOutputBytes)||48000)),preserveReply:true,executionAuthorized:false,automaticExecutionAllowed:false,replaceComposer:false,replaceReplyAuthority:false,noUserFacingDiagnostics:true});}
module.exports={VERSION,DEFAULTS,resolve,run:resolve,default:resolve};
