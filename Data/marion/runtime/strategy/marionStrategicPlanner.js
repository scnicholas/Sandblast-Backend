"use strict";
const fs=require("node:fs");
const path=require("node:path");
const VERSION="nyx.marion.layer27.strategicPlanner/1.1-baseline-freeze";
function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeRead(obj, key, fallback) {
  try { const value = obj && obj[key]; return value === undefined ? fallback : value; }
  catch (_) { return fallback; }
}
function safeOwn(obj, key) {
  try { return Boolean(obj && Object.prototype.hasOwnProperty.call(obj, key)); }
  catch (_) { return false; }
}
function safeText(value, fallback = "", max = 12000) {
  try {
    const type = typeof value;
    const primitive = type === "string" ? value :
      (type === "number" || type === "boolean" || type === "bigint") ? String(value) : fallback;
    return String(primitive).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, Math.max(0, Math.min(Number(max) || 12000, 100000)));
  } catch (_) { return fallback; }
}
function clamp01(value, fallback = 0) {
  const n = Number(value); const f = Number(fallback);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number.isFinite(f) ? f : 0));
}
function safeDataCopy(value) {
  const source = safeObject(value), out = {}; let keys = [];
  try { keys = Object.keys(source); } catch (_) { return out; }
  for (const key of keys) { const v = safeRead(source, key, undefined); if (v !== undefined) out[key] = v; }
  return out;
}
function byteLength(value) { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
function boundary(out = {}) {
  return {
    ...safeDataCopy(out),
    executionAuthorized: false,
    automaticExecutionAllowed: false,
    replaceComposer: false,
    replaceReplyAuthority: false,
    internalOnly: true,
    noUserFacingDiagnostics: true
  };
}
function bounded(value, limit = 48000) {
  try {
    const out = boundary(value);
    if (byteLength(out) <= limit) return out;
    return boundary({ version: safeText(safeRead(out, "version", "unknown"), "unknown", 180), bounded: true, degraded: true });
  } catch (_) {
    return boundary({ bounded: true, degraded: true });
  }
}

function normalizePath(value){return path.normalize(String(value||"")).toLowerCase();}
function requireExact(file){ const candidate=path.join(__dirname,file); if(!fs.existsSync(candidate))throw new Error(`Layer 27 dependency missing: ${candidate}`); const resolved=require.resolve(candidate); if(normalizePath(resolved)!==normalizePath(candidate))throw new Error(`Layer 27 dependency resolution drift: ${file}`); const source=fs.readFileSync(candidate,"utf8"); if(/^(?:<<<<<<<|=======|>>>>>>>)/m.test(source))throw new Error(`Layer 27 dependency contains merge-conflict markers: ${file}`); return require(resolved); }
const trajectory=requireExact("marionConversationTrajectory.js");
const hierarchy=requireExact("marionObjectiveHierarchy.js");
const execution=requireExact("marionExecutionPlanner.js");
const projection=requireExact("marionFutureStateProjector.js");
const opportunity=requireExact("marionOpportunityDetector.js");
const policyApi=requireExact("marionStrategicPolicy.js");
function plan(input){
  const src=safeObject(input);
  try{
    const prompt=safeText(safeRead(src,"prompt",safeRead(src,"message","")),"",6000);
    const explicitGoal=safeText(safeRead(src,"explicitGoal",safeRead(src,"activeGoal",prompt)),"",1200);
    const correctionOverride=Boolean(safeRead(src,"correctionOverride",false))||safeText(safeRead(src,"interactionState",""),"",80).toLowerCase()==="correction";
    const ctx={...safeDataCopy(src),prompt,explicitGoal,activeGoal:explicitGoal,currentGoal:explicitGoal,effectiveGoal:explicitGoal,correctionOverride,currentTurnWins:true,executionAuthorized:false,automaticExecutionAllowed:false};
    const tr=trajectory.analyze(ctx); const objectives=hierarchy.buildHierarchy(ctx); const exec=execution.create(ctx); const future=projection.project(ctx); const opportunities=opportunity.detect(ctx);
    const steps=safeArray(safeRead(exec,"steps",[])).slice(0,12);
    const horizons={immediate:{goal:explicitGoal||"preserve current turn",steps:steps.slice(0,3)},short:{goal:"validate additive integration",steps:steps.slice(3,7)},medium:{goal:"observe telemetry and regression stability"},long:{goal:"maintain cohesive Layers 1 through 28"}};
    const result=boundary({version:VERSION,layer:27,prompt,explicitGoal,activeGoal:explicitGoal,effectiveGoal:explicitGoal,currentGoal:explicitGoal,objective:explicitGoal,correctionOverride,currentTurnWins:true,trajectory:tr,objectives,horizons,steps,priorities:steps,opportunities:safeArray(safeRead(opportunities,"opportunities",[])),futureStates:safeArray(safeRead(future,"states",[])),advisoryOnly:true});
    const validation=policyApi.validateStrategicOutput(result,safeRead(src,"policy",undefined));
    return bounded({...result,validation:{...safeDataCopy(validation),currentTurnWins:true}});
  }catch(_){ return bounded({version:VERSION,layer:27,horizons:{immediate:{goal:"preserve current turn"},short:{goal:"fail closed"}},currentTurnWins:true,advisoryOnly:true,degraded:true}); }
}
module.exports={VERSION,plan,createPlan:plan,analyze:plan,run:plan,default:plan};

/* MARION_ROUND3_RESILIENT_PLANNING_V1_START */
(function(){"use strict";const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionRound3ResilientPlanningV1)return;const V="nyx.marion.round3.resilientPlanning/1.0";function planResilient(input={}){const x=safeObject(input),goal=safeText(safeRead(x,"explicitGoal",safeRead(x,"activeGoal",safeRead(x,"prompt",""))),"",1200),options=safeArray(safeRead(x,"options",safeRead(x,"alternatives",[]))).slice(0,10),assumptions=safeArray(safeRead(x,"assumptions",[])).map(v=>safeText(v,"",500)).filter(Boolean).slice(0,12),gaps=safeArray(safeRead(x,"missingFacts",safeRead(x,"knowledgeGaps",[]))).map(v=>safeText(v,"",500)).filter(Boolean).slice(0,12);return boundary({version:V,layer:27,goal,currentTurnWins:true,currentEvidenceWins:true,options:options.map((v,i)=>{const o=safeObject(v);return{id:safeText(safeRead(o,"id",`option_${i+1}`),`option_${i+1}`,96),label:safeText(safeRead(o,"label",safeRead(o,"name",typeof v==="string"?v:"")),"",600),reversible:safeRead(o,"reversible",true)!==false,risk:Number(safeRead(o,"risk",0))||0};}),assumptions,knowledgeGaps:gaps,horizons:{immediate:{goal:"separate facts, assumptions, and gaps"},short:{goal:"compare reversible options using common criteria"},medium:{goal:"validate the selected path against new evidence"},long:{goal:"preserve cohesive Layers 1 through 28"}},advisoryOnly:true});}api.planResilient=planResilient;api.__marionRound3ResilientPlanningV1=true;})();
/* MARION_ROUND3_RESILIENT_PLANNING_V1_END */
