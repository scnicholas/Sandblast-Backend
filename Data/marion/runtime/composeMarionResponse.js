\"use strict\";

/**
 * composeMarionResponse.js
 * Clean single-emission Marion composer.
 */

const VERSION = "composeMarionResponse v2.0.0 CLEAN-REBUILD-SINGLE-EMISSION";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";

function safeStr(v){ return v == null ? "" : String(v).trim(); }
function lower(v){ return safeStr(v).toLowerCase(); }

function hashText(v){
  const s = lower(v).replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  let h=0;
  for(let i=0;i<s.length;i++){ h=((h<<5)-h)+s.charCodeAt(i); h|=0; }
  return String(h>>>0);
}

function buildSignature(sig, turnId){
  const seed = safeStr(sig || hashText(turnId || Date.now()));
  return `${MARION_FINAL_SIGNATURE_PREFIX}${REQUIRED_CHAT_ENGINE_SIGNATURE}::${VERSION}::${seed}`;
}

function composeMarionResponse(routed={}, input={}){
  const text = safeStr(input.userQuery || input.text || "");
  let reply = text
    ? "I’m with you. Give me the next piece and I’ll move it forward."
    : "Say something — I’m here.";

  let replySignature = hashText(reply);
  const turnId = safeStr(input.turnId || "");
  const signature = buildSignature(replySignature, turnId);

  return {
    ok:true,
    final:true,
    marionFinal:true,
    version:VERSION,

    reply,
    text:reply,
    answer:reply,
    output:reply,

    signature,
    marionFinalSignature:signature,

    payload:{
      reply,
      text:reply,
      signature,
      marionFinal:true
    },

    meta:{
      version:VERSION,
      signature,
      marionFinal:true,
      final:true,
      hardlockCompatible:true
    },

    diagnostics:{
      signature,
      composerVersion:VERSION
    }
  };
}

module.exports = { VERSION, composeMarionResponse };
