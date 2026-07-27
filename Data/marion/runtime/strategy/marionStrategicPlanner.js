"use strict";
const VERSION="nyx.marion.layer27.strategicPlanner/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

function optionalRequire(path,fallback){try{return require(path)}catch(_){return fallback}}
const trajectory=optionalRequire("./marionConversationTrajectory.js",{analyze:(ctx)=>({currentTurnWins:true,goal:ctx.explicitGoal||ctx.prompt||""})});
const hierarchy=optionalRequire("./marionObjectiveHierarchy.js",{buildHierarchy:(ctx)=>({primary:ctx.explicitGoal||ctx.prompt||"preserve current turn",secondary:[]})});
const execution=optionalRequire("./marionExecutionPlanner.js",{create:(ctx)=>({steps:["separate facts from assumptions","identify knowledge gaps","compare reversible options","validate against new evidence"]})});
const projection=optionalRequire("./marionFutureStateProjector.js",{project:()=>({states:[]})});
const opportunity=optionalRequire("./marionOpportunityDetector.js",{detect:()=>({opportunities:[]})});
const policyApi=optionalRequire("./marionStrategicPolicy.js",{validateStrategicOutput:()=>({approved:true,executionAuthorized:false})});
function plan(input){ try{ const src=safeObject(input); const prompt=safeString(safeRead(src,"prompt","")); const explicitGoal=safeString(safeRead(src,"explicitGoal",safeRead(src,"activeGoal",prompt))); const correctionOverride=Boolean(safeRead(src,"correctionOverride",false)); const ctx={...src,prompt,explicitGoal,correctionOverride}; const tr=trajectory.analyze(ctx); const objectives=hierarchy.buildHierarchy(ctx); const exec=execution.create(ctx); const future=projection.project(ctx); const opportunities=opportunity.detect(ctx); const horizons={immediate:{goal:explicitGoal||"preserve current turn",steps:exec.steps.slice(0,3)},short:{goal:"validate additive integration",steps:exec.steps.slice(3,7)},medium:{goal:"observe telemetry and regression stability"},long:{goal:"maintain cohesive Layers 1 through 28"}}; const result={version:VERSION,layer:27,prompt,explicitGoal,correctionOverride,currentTurnWins:true,trajectory:tr,objectives,horizons,steps:exec.steps,priorities:exec.steps,opportunities:opportunities.opportunities,futureStates:future.states,executionAuthorized:false,replaceComposer:false,replaceReplyAuthority:false,advisoryOnly:true,internalOnly:true}; const validation=policyApi.validateStrategicOutput(result,src.policy); return bounded({...result,validation}); }catch(_){return{version:VERSION,layer:27,horizons:{immediate:{goal:"preserve current turn"},short:{goal:"fail closed"}},executionAuthorized:false,replaceComposer:false,replaceReplyAuthority:false,internalOnly:true,degraded:true};} }
module.exports={VERSION,plan,createPlan:plan,analyze:plan,run:plan,default:plan};

/* MARION_ROUND3_RESILIENT_PLANNING_V1_START */
(function(){"use strict";const api=module.exports&&typeof module.exports==="object"?module.exports:null;if(!api||api.__marionRound3ResilientPlanningV1)return;const VERSION="nyx.marion.round3.resilientPlanning/1.0";
function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}function arr(v){return Array.isArray(v)?v:[]}function str(v){try{return String(v==null?"":v).replace(/\s+/g," ").trim()}catch(_){return""}}
function planResilient(input={}){const x=obj(input),goal=str(x.explicitGoal||x.activeGoal||x.prompt),options=arr(x.options||x.alternatives).slice(0,10),assumptions=arr(x.assumptions).map(str).filter(Boolean).slice(0,12),gaps=arr(x.missingFacts||x.knowledgeGaps).map(str).filter(Boolean).slice(0,12);return{version:VERSION,layer:27,goal,currentTurnWins:true,currentEvidenceWins:true,options:options.map((v,i)=>({id:str(obj(v).id||`option_${i+1}`),label:str(obj(v).label||obj(v).name||v),reversible:obj(v).reversible!==false,risk:Number(obj(v).risk||0)})),assumptions,knowledgeGaps:gaps,horizons:{immediate:{goal:"separate facts, assumptions, and gaps"},short:{goal:"compare reversible options using common criteria"},medium:{goal:"validate the selected path against new evidence"},long:{goal:"preserve cohesive Layers 1 through 28"}},advisoryOnly:true,replaceComposer:false,replaceReplyAuthority:false,executionAuthorized:false,internalOnly:true};}
api.planResilient=planResilient;api.__marionRound3ResilientPlanningV1=true;})();
/* MARION_ROUND3_RESILIENT_PLANNING_V1_END */
