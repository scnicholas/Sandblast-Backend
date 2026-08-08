"use strict";
const assert=require("assert");
const Module=require("module");
const originalLoad=Module._load;
const completionStub={
  VERSION:"marion.completionFlowCoordinator/20.0-test-contract",
  CONTRACT:"nyx.marion.completionFlow/1.0",
  context:{VERSION:"marion.crossDomainContext/18.0-test"},
  realignment:{VERSION:"marion.goalRealignment/19.0-test"},
  closure:{VERSION:"marion.decisionClosure/20.0-test"},
  directQuery(){return false;},
  analyzeTurn({turnId=""}={}){return {version:this.VERSION,contract:this.CONTRACT,turnId,crossDomainContext:{},goalRealignment:{},decisionClosure:{hardStopAtLayer20:true},internalOnly:true};},
  commitTurn(v={}){return {...v,committed:true};},
  projectState(v={}){return {...v,version:this.VERSION,contract:this.CONTRACT};},
  reconcileResult(result={}){return result;},
  reconcileVisibleReply(reply=""){return reply;}
};
Module._load=function(request,parent,isMain){if(request==="../completion/marionCompletionFlowCoordinator.js"&&parent&&/marionConversationLayerRegistry\.js$/.test(parent.filename))return completionStub;return originalLoad.call(this,request,parent,isMain);};
try{
  const registry=require("../../Data/marion/runtime/conversation/marionConversationLayerRegistry.js");
  const status=registry.getStatus();
  assert.equal(status.hardStopLayer,24);assert.ok(status.layers[21]);assert.ok(status.layers[24]);assert.equal(status.culturalInferenceAllowed,false);
  const input={turnId:"cohesion-1",conversationId:"cohesion",directMarionAdminInterface:true,adminInterfaceScope:"marion_admin_conversation",message:"No, that is not what I meant. Keep the same task and correct the current file.",requestedDomain:"technical"};
  const flow=registry.analyzeTurn(input,{},{});
  assert.equal(flow.version,"marion.conversationLayers/24.0-cohesive-9-24-part1");
  assert.equal(flow.phaseANuance.interactionState,"correction");
  assert.equal(flow.hardStopLayer,24);assert.equal(flow.currentTurnIntentPrimary,true);
  assert.ok(flow.progression.phaseAInteractionState);assert.ok(flow.interactionCalibration.phaseAResponsePolicy);
  const enriched=registry.applyToInput(input,{},{});
  assert.equal(enriched.privateRuntimeContext.hardStopLayer,24);assert.ok(enriched.previousMemory.nuanceState);assert.equal(enriched.responseShaping.hardStopAtLayer24,true);
  const publicFlow=registry.analyzeTurn({turnId:"pub-1",surfaceAgent:"Nyx",audience:"public",message:"Hello"},{},{});
  const stripped=registry.stripStrategicFlow(publicFlow);
  assert.equal(stripped.publicNuanceNoOp,true);assert.equal(stripped.nuanceContext,undefined);assert.equal(stripped.nuanceStatePatch,undefined);
  console.log("PASS layers_9_24_partial_cohesion_test");
}finally{Module._load=originalLoad;}
