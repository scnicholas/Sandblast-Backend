"use strict";
const assert=require("assert");
const Module=require("module");
const coordinator=require("../../Data/marion/runtime/nuance/marionNuancePhaseACoordinator.js");
const low=coordinator.run({turnId:"gap-1",message:"Hmm..."});
assert.equal(low.layer23.explicitEmotionReferenceAllowed,false);
assert.equal(low.culturalCompatibility.culturalInferenceAllowed,false);
assert.ok(!JSON.stringify(low.carryPolicy.approvedStatePatch).includes("Hmm..."));
const explicit=coordinator.run({turnId:"gap-2",language:"en",locale:"en-CA",explicitCulturalContext:["User explicitly requested Canadian English conventions"],message:"Please keep Canadian spelling."});
assert.equal(explicit.culturalCompatibility.explicitLocale,"en-CA");
assert.equal(explicit.culturalCompatibility.identityInferenceAllowed,false);
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
  if(parent&&/emotionRuntime\.js$/.test(parent.filename)){
    if(request==="./emotionValidator")return {validateResolvedState:(state)=>({state}),buildAllowedFromContracts:()=>({}),clamp01:(v)=>Math.max(0,Math.min(1,Number(v)||0))};
    if(request==="./emotionSuppressionResolver")return {resolveSuppression:()=>({}),applySuppressionToCandidate:(c)=>c,normalizeText:(v)=>String(v||"").toLowerCase()};
    if(request==="./emotionStateTracker")return {updateEmotionState:(v)=>v};
    if(request==="./emotionalGovernor")return {governResolvedState:(v)=>v};
  }
  return originalLoad.call(this,request,parent,isMain);
};
try{
  const emotion=require("../../Data/marion/runtime/emotion/emotionRuntime.js");
  const packet={ok:true,state:{emotion:{primary:"neutral",confidence:.2,intensity:.1},support:{tone:"steady"},guard:{diagnosis_block:true},nuance:{},marion_handoff:{response_constraints:[]},runtime_meta:{}}};
  const adapted=emotion.adaptResolvedStateWithPhaseA(packet,low);
  assert.equal(adapted.phaseANuanceApplied,true);assert.equal(adapted.state.guard.explicit_emotion_reference_allowed,false);assert.equal(adapted.state.runtime_meta.raw_phase_a_evidence_redacted,true);
}finally{Module._load=originalLoad;}
console.log("PASS layers_21_24_gap_refinement_test");
