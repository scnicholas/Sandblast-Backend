"use strict";
const VERSION="nyx.marion.layer28.adaptiveImprovementEngine/1.0";

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

function improve(input){const src=safeObject(input);const signals=safeArray(src.signals||safeRead(src,"learningSignals",{}).signals);const recommendations=[];if(signals.some(s=>safeRead(s,"type","")==="quality_repair_needed"))recommendations.push("increase evidence binding before finalization");if(signals.some(s=>safeRead(s,"type","")==="current_turn_correction"))recommendations.push("raise current-turn objective above prior trajectory");return bounded({version:VERSION,recommendations,applied:false,requiresExplicitIntegration:true,internalOnly:true,noUserFacingDiagnostics:true,executionAuthorized:false,automaticExecutionAllowed:false,replaceComposer:false,replaceReplyAuthority:false});}
module.exports={VERSION,improve,recommend:improve,run:improve,default:improve};
