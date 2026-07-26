"use strict";

/** Cohesive coordinator for Layers 18–20. No route, reply, or execution authority. */
const context=require("./marionCrossDomainContextIntegrator.js");
const realignment=require("./marionGoalRealignment.js");
const closure=require("./marionDecisionClosure.js");
const VERSION="marion.completionFlowCoordinator/20.0-cohesive-18-19-20";
const CONTRACT="nyx.marion.completionFlow/1.0";
function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=1200){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function previousFrom(v={}){const x=isObj(v)?v:{};if(isObj(x.completionFlowState))return x.completionFlowState;if(isObj(x.completionFlow))return x.completionFlow;if(isObj(x.conversationFlowState)&&isObj(x.conversationFlowState.completionFlow))return x.conversationFlowState.completionFlow;if(isObj(x.privateRuntimeContinuity)&&isObj(x.privateRuntimeContinuity.completionFlowState))return x.privateRuntimeContinuity.completionFlowState;if(x.contract===CONTRACT||isObj(x.decisionClosure))return x;return{};}
function analyzeTurn({prompt="",previous={},conversationFlow={},outcomeFlow={},strategicFlow={},turnId="",reset=false}={}){
  const prior=reset?{}:previousFrom(previous);
  const crossDomainContext=context.analyze({prompt,previous:isObj(prior.crossDomainContext)?prior.crossDomainContext:prior,conversationFlow,outcomeFlow,strategicFlow});
  const goalRealignment=realignment.analyze({prompt,previous:isObj(prior.goalRealignment)?prior.goalRealignment:prior,strategicFlow,crossDomainContext});
  const decisionClosure=closure.analyze({prompt,previous:isObj(prior.decisionClosure)?prior.decisionClosure:prior,conversationFlow,outcomeFlow,strategicFlow,goalRealignment,crossDomainContext});
  return {version:VERSION,contract:CONTRACT,prompt:text(prompt,6000),layers:Object.freeze({crossDomainContextIntegration:18,dynamicGoalRealignment:19,rationalDecisionClosure:20}),turnId:text(turnId,120),crossDomainContext,goalRealignment,decisionClosure,hardStopAtLayer20:decisionClosure.hardStopAtLayer20===true,additionalLayerRecommended:false,automaticExecutionAllowed:false,internalOnly:true};
}
function commitTurn(v={},reply="",result={}){const x=isObj(v)?v:{};return {...x,lastReply:text(reply,1200),resultStatus:text(isObj(result)?result.statusCode:"",40),committed:true,committedAt:Date.now()};}
function projectState(v={}){const x=isObj(v)?v:{};return {version:VERSION,contract:CONTRACT,prompt:text(x.prompt,6000),turnId:text(x.turnId,120),crossDomainContext:context.projectState(x.crossDomainContext),goalRealignment:realignment.projectState(x.goalRealignment),decisionClosure:closure.projectState(x.decisionClosure),hardStopAtLayer20:x.hardStopAtLayer20===true,additionalLayerRecommended:false,automaticExecutionAllowed:false,lastReply:text(x.lastReply,1200),committed:x.committed===true,committedAt:Number(x.committedAt||0)};}
function directQuery(prompt=""){return context.isCrossDomainQuery(prompt)||realignment.isRealignmentQuery(prompt)||closure.querySignal(prompt)||closure.closureSignal(prompt);}
function suggested(v={}){const x=isObj(v)?v:{};return text(isObj(x.decisionClosure)?x.decisionClosure.suggestedReply:"")||text(isObj(x.goalRealignment)?x.goalRealignment.suggestedReply:"")||text(isObj(x.crossDomainContext)?x.crossDomainContext.suggestedReply:"");}
function reconcileVisibleReply(reply="",v={}){const x=isObj(v)?v:{},candidate=suggested(x);if(!candidate||!directQuery(text(x.prompt||"")))return text(reply,12000);return candidate;}
function reconcileResult(result={},v={}){if(!isObj(result))return result;const state=projectState(v),memory=isObj(result.memoryPatch)?result.memoryPatch:{},session=isObj(result.sessionPatch)?result.sessionPatch:{},meta=isObj(result.meta)?result.meta:{},routing=isObj(result.routing)?result.routing:{},payload=isObj(result.payload)?result.payload:{},envelope=isObj(result.finalEnvelope)?result.finalEnvelope:{};let reply="";for(const candidate of [result.directReply,result.visibleReply,result.displayReply,result.finalReply,result.reply,result.text,result.message,envelope.reply,payload.reply]){reply=text(candidate,12000);if(reply)break;}const proposed=suggested(v);if(proposed&&directQuery(text(v.prompt||"")))reply=proposed;const base={...result,completionFlow:v,completionFlowState:state,crossDomainContext:v.crossDomainContext,goalRealignment:v.goalRealignment,decisionClosure:v.decisionClosure,memoryPatch:{...memory,completionFlowState:state},sessionPatch:{...session,completionFlowState:state},routing:{...routing,completionFlowVersion:VERSION},meta:{...meta,completionFlowVersion:VERSION,conversationLayers:[9,10,11,12,13,14,15,16,17,18,19,20],completionMetadataPrivate:true,hardStopLayer:20,additionalLayerRecommended:false,automaticExecutionAllowed:false}};if(!reply)return base;return {...base,reply,text:reply,answer:reply,output:reply,response:reply,message:reply,directReply:reply,visibleReply:reply,displayReply:reply,finalReply:reply,payload:{...payload,reply,text:reply,message:reply},finalEnvelope:{...envelope,reply,text:reply,answer:reply,output:reply,response:reply,message:reply,directReply:reply,visibleReply:reply,displayReply:reply,finalReply:reply,completionFlowState:state}};}
function getStatus(){return {ok:true,version:VERSION,contract:CONTRACT,layers:{18:context.VERSION,19:realignment.VERSION,20:closure.VERSION},routeAuthority:false,replyAuthority:false,metadataOnly:true,hardStopLayer:20,additionalLayerRecommended:false,automaticExecutionAllowed:false,humanFinalAuthority:true};}
module.exports={VERSION,CONTRACT,previousFrom,analyzeTurn,commitTurn,projectState,directQuery,suggested,reconcileVisibleReply,reconcileResult,getStatus,context,realignment,closure};

/* MARION_NUANCE_PHASE_A_COMPLETION_COORDINATOR_INTEGRATION_V2_START */
(function marionNuancePhaseACompletionCoordinatorIntegrationV2(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseACompletionCoordinatorIntegrationV2)return;
  const PATCH_VERSION="nyx.marion.nuance.completionCoordinatorIntegration/2.0";
  const PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";
  const HARD_STOP_LAYER=24;
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=160){return typeof v==="string"?v.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max):"";}
  function controls(input){const n=obj(obj(input).nuanceContext||obj(input).phaseANuance),l23=obj(n.layer23),l24=obj(n.layer24),state=clean(l24.currentState,60),correction=["correction","clarification","disagreement"].includes(state)||obj(l24.controlFlags).correctionOverride===true;return{contract:PHASE_A_CONTRACT,interactionState:state,confidenceBand:clean(l23.confidenceBand,40),correctionOverride:correction,currentTurnIntentPrimary:true,emotionMayAuthorizeCompletion:false,culturalMarkersMayAuthorizeCompletion:false,internalOnly:true};}
  const original=api.analyzeTurn;
  if(typeof original==="function")api.analyzeTurn=function(input={}){const out=obj(original.call(this,input)),control=controls(input);return{...out,phaseAControls:control,conversationArchitectureHardStop:HARD_STOP_LAYER,phaseAHardStopLayer:HARD_STOP_LAYER,hardStopAtLayer20:out.hardStopAtLayer20===true,additionalLayerRecommended:false,automaticExecutionAllowed:false,currentTurnCorrectionBlocksStaleClosure:control.correctionOverride};};
  const oldProject=api.projectState;
  if(typeof oldProject==="function")api.projectState=function(value={}){const out=obj(oldProject.call(this,value)),control=obj(obj(value).phaseAControls);return{...out,phaseAControls:control,conversationArchitectureHardStop:HARD_STOP_LAYER,phaseAHardStopLayer:HARD_STOP_LAYER,additionalLayerRecommended:false,automaticExecutionAllowed:false};};
  api.MARION_NUANCE_PHASE_A_COMPLETION_COORDINATOR_VERSION=PATCH_VERSION;
  api.MARION_NUANCE_PHASE_A_CONTRACT=PHASE_A_CONTRACT;
  api.MARION_LAYER_HARD_STOP=HARD_STOP_LAYER;
  api.__marionNuancePhaseACompletionCoordinatorIntegrationV2=true;
})();
/* MARION_NUANCE_PHASE_A_COMPLETION_COORDINATOR_INTEGRATION_V2_END */

/* MARION_NUANCE_PHASE_B_CompletionCoordinatorCohesion_V1_START */
(function marionNuancePhaseBCompletionCoordinatorCohesionV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseBCompletionCoordinatorCohesionV1)return;
  const PHASE_B_CONTRACT="nyx.marion.nuance.phaseB/1.0";
  const PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";
  const HARD_STOP_LAYER=26;
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=240){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
  function phaseB(v){const x=obj(v),candidates=[x.phaseBNuance,x.nuancePhaseBContext,x.phaseBContext,x.nuanceContext,obj(x.payload).phaseBNuance,obj(x.payload).nuancePhaseBContext];for(const n of candidates){const q=obj(n);if(q.contract===PHASE_B_CONTRACT&&q.phase==="B")return q;}return{};}
  function phaseAFrom(n){const b=obj(n),a=obj(b.phaseA);return a.contract===PHASE_A_CONTRACT?a:{};}
  function summary(n){const b=obj(n),l25=obj(b.layer25),l26=obj(b.layer26),g=obj(b.subtextGate),p=obj(b.responsePosture),a=phaseAFrom(b),l24=obj(a.layer24);return{contract:PHASE_B_CONTRACT,phase:"B",turnId:clean(b.turnId,160),interactionState:clean(l24.currentState,60),primaryStance:clean(l25.primaryStance,80),secondaryStances:Array.isArray(l25.secondaryStances)?l25.secondaryStances.slice(0,2):[],modifiers:Array.isArray(l25.modifiers)?l25.modifiers.slice(0,4):[],stanceConfidence:Number(l25.confidence||0),literalIntent:clean(l26.literalIntent,120),primaryPragmaticIntent:clean(l26.primaryPragmaticIntent,120),secondaryPragmaticIntents:Array.isArray(l26.secondaryPragmaticIntents)?l26.secondaryPragmaticIntents.slice(0,2):[],conversationControl:clean(obj(l26.conversationControl).category,100),pragmaticConfidence:Number(l26.confidence||0),subtextPolicy:clean(g.subtextPolicy,80),answerStructure:Array.isArray(p.answerStructure)?p.answerStructure.slice(0,6):[],literalIntentPreserved:g.literalIntentPreserved!==false,noUserFacingDiagnostics:true};}

  const original=api.analyzeTurn;if(typeof original==="function")api.analyzeTurn=function(input={}){const b=phaseB(input),s=summary(b),enriched={...input,nuanceContext:input.nuanceContext,phaseBNuance:b};const out=original.call(this,enriched);return {...obj(out),phaseBNuanceSummary:s,phaseBControls:{primaryStance:s.primaryStance,primaryPragmaticIntent:s.primaryPragmaticIntent,conversationControl:s.conversationControl,literalIntentPreserved:true},conversationArchitectureHardStop:HARD_STOP_LAYER,phaseBHardStopLayer:HARD_STOP_LAYER,completionDecisionLayer:20,additionalLayerRecommended:false,automaticExecutionAllowed:false};};

  api.MARION_NUANCE_PHASE_B_CONTRACT=PHASE_B_CONTRACT;
  api.MARION_LAYER_HARD_STOP=HARD_STOP_LAYER;
  api.__marionNuancePhaseBCompletionCoordinatorCohesionV1=true;
})();
/* MARION_NUANCE_PHASE_B_CompletionCoordinatorCohesion_V1_END */
