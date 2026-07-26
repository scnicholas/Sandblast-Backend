"use strict";
const VERSION="nyx.marion.layers27_28.cognitiveSupervisor/1.1";
const CONTRACT="nyx.marion.cognitiveSupervision/1.0";
const HARD_STOP_LAYER=28;

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }


function preserveReplyAuthority(base, next) {
  const b=safeObject(base), n=safeObject(next), out={...b,...n};
  const reply=safeString(safeRead(b,"reply",safeRead(b,"displayReply","")));
  if(reply){
    out.reply=reply; out.displayReply=safeString(safeRead(b,"displayReply",reply));
    for(const key of ["visibleReply","directReply","finalReply","final","answer","response","text","message","spokenText"]){
      if(Object.prototype.hasOwnProperty.call(b,key)) out[key]=safeString(safeRead(b,key,reply));
    }
    const bfe=safeObject(safeRead(b,"finalEnvelope",{}));
    if(Object.keys(bfe).length) out.finalEnvelope={...safeObject(safeRead(out,"finalEnvelope",{})),...bfe,reply:safeString(safeRead(bfe,"reply",reply)),finalReply:safeString(safeRead(bfe,"finalReply",safeRead(bfe,"reply",reply)))};
  }
  out.executionAuthorized=false; out.noUserFacingDiagnostics=true; out.cognitiveInternalOnly=true;
  return out;
}
const planner=require("../strategy/marionStrategicPlanner.js");const arbitrator=require("../strategy/marionPriorityArbitrator.js");const planningEnvelope=require("../strategy/marionPlanningEnvelope.js");const reasoner=require("../metacognition/marionMetaReasoner.js");const evaluator=require("../metacognition/marionResponseEvaluator.js");const reflectionEnvelope=require("../metacognition/marionReflectionEnvelope.js");
async function supervise(input){try{const src=safeObject(input);const base=safeObject(safeRead(src,"baseEnvelope",safeRead(src,"envelope",{})));const plan=await planner.plan({...src,baseEnvelope:base});const priorities=await arbitrator.arbitrate({candidates:plan.priorities||plan.steps||[],policy:src.policy});const with27=planningEnvelope.build({baseEnvelope:base,plan,priorities});const meta=await reasoner.reason({...src,baseEnvelope:with27,recursionDepth:0,maxPasses:1});const evaluation=await evaluator.evaluate({baseEnvelope:with27,meta});const out=reflectionEnvelope.build({baseEnvelope:with27,meta,evaluation});return bounded(preserveReplyAuthority(base,{...out,cognitiveSupervisor:{version:VERSION,layer27Applied:true,layer28Applied:true,replyAuthorityPreserved:true,composerPreserved:true,executionAuthorized:false,internalOnly:true,supervisorIntegrated:true,contract:CONTRACT,hardStopLayer:HARD_STOP_LAYER}}));}catch(_){const base=safeObject(safeRead(safeObject(input),"baseEnvelope",{}));return bounded({...base,reply:safeString(safeRead(base,"reply",safeRead(base,"displayReply",""))),displayReply:safeString(safeRead(base,"displayReply",safeRead(base,"reply",""))),executionAuthorized:false,noUserFacingDiagnostics:true,cognitiveSupervisor:{version:VERSION,degraded:true,replyAuthorityPreserved:true,executionAuthorized:false,supervisorIntegrated:true,contract:CONTRACT,hardStopLayer:HARD_STOP_LAYER}});}}
module.exports={VERSION,CONTRACT,HARD_STOP_LAYER,supervise,coordinate:supervise,run:supervise,default:supervise,getStatus:()=>({ok:true,version:VERSION,contract:CONTRACT,hardStopLayer:HARD_STOP_LAYER,layers:[27,28],replyAuthorityPreserved:true,executionAuthorized:false})};
