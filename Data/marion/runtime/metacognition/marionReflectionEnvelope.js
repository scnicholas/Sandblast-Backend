"use strict";
const VERSION="nyx.marion.layer28.reflectionEnvelope/1.0";

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

function build(input){
  const src=safeObject(input);
  const base=safeObject(safeRead(src,"baseEnvelope",{}));

  const reply=safeString(
    safeRead(
      base,
      "reply",
      safeRead(base,"displayReply","")
    )
  );

  const displayReply=
    safeString(
      safeRead(base,"displayReply",reply)
    ) || reply;

  const meta=safeObject(src.meta);
  const evaluation=safeObject(src.evaluation);

  const layer28={
    version:VERSION,
    recursionDepth:Math.max(
      0,
      Math.min(
        1,
        Number(meta.recursionDepth)||0
      )
    ),
    passes:Math.max(
      0,
      Math.min(
        1,
        Number(meta.passes)||0
      )
    ),
    approved:
      meta.approved===true &&
      evaluation.approved!==false,
    internalOnly:true,
    noUserFacingDiagnostics:true,
    executionAuthorized:false,
    automaticExecutionAllowed:false,
    replaceComposer:false,
    replaceReplyAuthority:false
  };

  const out={
    ...base,
    reply,
    displayReply,
    noUserFacingDiagnostics:true,
    executionAuthorized:false,
    automaticExecutionAllowed:false,
    replaceComposer:false,
    replaceReplyAuthority:false,
    layer28,
    reflection:layer28,
    metaCognition:layer28
  };

  // Preserve already-established structural/control values with original types.
  for(const key of ["ok","final","handled","stateSpine"]){
    if(Object.prototype.hasOwnProperty.call(base,key)){
      out[key]=safeRead(base,key,out[key]);
    }
  }

  if(
    Object.prototype.hasOwnProperty.call(base,"finalReply")
  ){
    out.finalReply=
      safeString(
        safeRead(base,"finalReply",reply)
      ) || reply;
  }

  if(
    Object.prototype.hasOwnProperty.call(base,"spokenText")
  ){
    out.spokenText=
      safeString(
        safeRead(base,"spokenText",reply)
      ) || reply;
  }

  return bounded(out);
}
module.exports={VERSION,build,create:build,wrap:build,run:build,default:build};
