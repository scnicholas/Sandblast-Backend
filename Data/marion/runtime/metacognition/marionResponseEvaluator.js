"use strict";
const VERSION="nyx.marion.layer28.responseEvaluator/1.0";

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

function evaluate(input){const src=safeObject(input);const base=safeObject(safeRead(src,"baseEnvelope",{}));const reply=safeString(safeRead(base,"reply",safeRead(src,"reply","")));const diagnostic=/TypeError|ReferenceError|\bstack\b|\bat\s+\w+\s*\(/i.test(reply);const recursive=/(reflect(?:ing|ion)?).*(reflect(?:ing|ion)?).*(reflect(?:ing|ion)?)/i.test(reply);const scores={clarity:reply?0.8:0.2,specificity:reply.length>20?0.75:0.45,completeness:reply.length>40?0.75:0.5,safety:diagnostic?0.1:0.95,nonRecursion:recursive?0.1:1};const approved=!diagnostic&&!recursive;return bounded({version:VERSION,approved,scores,flags:{diagnosticLeak:diagnostic,recursiveReflection:recursive},internalOnly:true,executionAuthorized:false});}
module.exports={VERSION,evaluate,score:evaluate,analyze:evaluate,run:evaluate,default:evaluate};
