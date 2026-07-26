"use strict";
const VERSION="nyx.marion.layer27.strategicPlanner/1.0";

function safeObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeString(value) { if (typeof value === "string") return value; if (value == null) return ""; try { return String(value); } catch (_) { return ""; } }
function clamp01(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : Math.max(0, Math.min(1, Number(fallback) || 0)); }
function safeRead(obj, key, fallback) { try { const v = obj && obj[key]; return v === undefined ? fallback : v; } catch (_) { return fallback; } }
function bounded(value, limit = 48000) { try { const s = JSON.stringify(value); return s.length <= limit ? value : { version: value.version || "unknown", bounded: true, executionAuthorized: false }; } catch (_) { return { bounded: true, executionAuthorized: false }; } }

const trajectory=require("./marionConversationTrajectory.js");
const hierarchy=require("./marionObjectiveHierarchy.js");
const execution=require("./marionExecutionPlanner.js");
const projection=require("./marionFutureStateProjector.js");
const opportunity=require("./marionOpportunityDetector.js");
const policyApi=require("./marionStrategicPolicy.js");
function plan(input){ try{ const src=safeObject(input); const prompt=safeString(safeRead(src,"prompt","")); const explicitGoal=safeString(safeRead(src,"explicitGoal",safeRead(src,"activeGoal",prompt))); const correctionOverride=Boolean(safeRead(src,"correctionOverride",false)); const ctx={...src,prompt,explicitGoal,correctionOverride}; const tr=trajectory.analyze(ctx); const objectives=hierarchy.buildHierarchy(ctx); const exec=execution.create(ctx); const future=projection.project(ctx); const opportunities=opportunity.detect(ctx); const horizons={immediate:{goal:explicitGoal||"preserve current turn",steps:exec.steps.slice(0,3)},short:{goal:"validate additive integration",steps:exec.steps.slice(3,7)},medium:{goal:"observe telemetry and regression stability"},long:{goal:"maintain cohesive Layers 1 through 28"}}; const result={version:VERSION,layer:27,prompt,explicitGoal,correctionOverride,currentTurnWins:true,trajectory:tr,objectives,horizons,steps:exec.steps,priorities:exec.steps,opportunities:opportunities.opportunities,futureStates:future.states,executionAuthorized:false,replaceComposer:false,replaceReplyAuthority:false,advisoryOnly:true,internalOnly:true}; const validation=policyApi.validateStrategicOutput(result,src.policy); return bounded({...result,validation}); }catch(_){return{version:VERSION,layer:27,horizons:{immediate:{goal:"preserve current turn"},short:{goal:"fail closed"}},executionAuthorized:false,replaceComposer:false,replaceReplyAuthority:false,internalOnly:true,degraded:true};} }
module.exports={VERSION,plan,createPlan:plan,analyze:plan,run:plan,default:plan};
