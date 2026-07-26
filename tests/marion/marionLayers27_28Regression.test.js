"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const path=require("node:path");
const STRATEGY=new Set(["marionStrategicPlanner.js","marionMissionRegistry.js","marionObjectiveHierarchy.js","marionPriorityArbitrator.js","marionFutureStateProjector.js","marionConversationTrajectory.js","marionOpportunityDetector.js","marionMilestoneTracker.js","marionExecutionPlanner.js","marionDependencyResolver.js","marionStrategicPolicy.js","marionStrategicTelemetry.js","marionPlanningEnvelope.js"]);
const METACOGNITION=new Set(["marionMetaReasoner.js","marionReflectionEngine.js","marionConfidenceAnalyzer.js","marionBiasDetector.js","marionKnowledgeGapDetector.js","marionReasoningAuditor.js","marionResponseEvaluator.js","marionQualityCalibrator.js","marionLearningSignalCollector.js","marionAdaptiveImprovementEngine.js","marionMetaReasoningPolicy.js","marionMetaTelemetry.js","marionReflectionEnvelope.js"]);
function load(name){const folder=STRATEGY.has(name)?"strategy":METACOGNITION.has(name)?"metacognition":"supervision";return require(path.join(process.cwd(),"Data","marion","runtime",folder,name));}
test("Layers 27 and 28 preserve the established final reply and remain advisory",async()=>{
  const supervisor=load("marionCognitiveSupervisor.js");
  const base={ok:true,final:true,handled:true,reply:"Layers 1 through 26 retain final reply authority.",displayReply:"Layers 1 through 26 retain final reply authority.",stateSpine:{schema:"nyx.marion.stateSpine/1.7",currentTurn:28},noUserFacingDiagnostics:true};
  const out=await supervisor.supervise({baseEnvelope:base,prompt:"Plan the next integration without executing it.",explicitGoal:"validate Layers 27 and 28"});
  assert.equal(out.reply,base.reply);assert.equal(out.displayReply,base.displayReply);assert.equal(out.final,true);assert.equal(out.handled,true);assert.equal(out.executionAuthorized,false);assert.equal(out.noUserFacingDiagnostics,true);assert.ok(out.layer27);assert.ok(out.layer28);assert.ok(out.cognitiveSupervisor);assert.ok(JSON.stringify(out).length<50000);
});
test("all Layer 27 and 28 modules expose versions and load under CommonJS",()=>{
  const files=["marionStrategicPlanner.js","marionMissionRegistry.js","marionObjectiveHierarchy.js","marionPriorityArbitrator.js","marionFutureStateProjector.js","marionConversationTrajectory.js","marionOpportunityDetector.js","marionMilestoneTracker.js","marionExecutionPlanner.js","marionDependencyResolver.js","marionStrategicPolicy.js","marionStrategicTelemetry.js","marionPlanningEnvelope.js","marionMetaReasoner.js","marionReflectionEngine.js","marionConfidenceAnalyzer.js","marionBiasDetector.js","marionKnowledgeGapDetector.js","marionReasoningAuditor.js","marionResponseEvaluator.js","marionQualityCalibrator.js","marionLearningSignalCollector.js","marionAdaptiveImprovementEngine.js","marionMetaReasoningPolicy.js","marionMetaTelemetry.js","marionReflectionEnvelope.js","marionCognitiveSupervisor.js"];
  for(const f of files){const api=load(f);assert.ok(api&&typeof api==="object",f);assert.equal(typeof api.VERSION,"string",f+" version");}
});
