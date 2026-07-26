"use strict";

/** Cohesive coordinator for Layers 15–17. Metadata-only; no route or execution authority. */
const alignment=require("./marionStrategicObjectiveAlignment.js");
const risk=require("./marionPredictiveRiskModel.js");
const pathways=require("./marionStrategicPathwaySynthesizer.js");
const VERSION="marion.strategicFlowCoordinator/17.0-cohesive-15-16-17";
const CONTRACT="nyx.marion.strategicFlow/1.0";
function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=1800){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function hash(v=""){let h=2166136261;const s=text(v,12000);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
function previousFrom(v={}){const x=isObj(v)?v:{};if(isObj(x.strategicFlowState))return x.strategicFlowState;if(isObj(x.strategicFlow))return x.strategicFlow;if(isObj(x.conversationFlowState)&&isObj(x.conversationFlowState.strategicFlow))return x.conversationFlowState.strategicFlow;if(isObj(x.privateRuntimeContinuity)&&isObj(x.privateRuntimeContinuity.strategicFlowState))return x.privateRuntimeContinuity.strategicFlowState;if(x.contract===CONTRACT||isObj(x.objectiveAlignment)||isObj(x.pathwaySynthesis))return x;return{};}
function shouldReset(input={}){const x=isObj(input)?input:{};return x.newSession===true||x.firstTurn===true||x.resetSession===true||x.clearSession===true||x.freshSession===true;}
function blockerFingerprint(outcomeFlow={}){const o=isObj(outcomeFlow)?outcomeFlow:{},c=isObj(o.commitmentTracking)?o.commitmentTracking:{};return (Array.isArray(c.openCommitments)?c.openCommitments:[]).flatMap(x=>Array.isArray(x&&x.blockers)?x.blockers:[]).map(v=>text(v,180)).filter(Boolean).sort().join("|");}
function strategicFingerprint(objective="",outcomeFlow={},conversationFlow={}){const f=isObj(conversationFlow)?conversationFlow:{},blockers=blockerFingerprint(outcomeFlow);return `sf-${hash([text(objective,700).toLowerCase(),blockers,f.activeDomain].join("|"))}`;}
function analyzeTurn({prompt="",previous={},outcomeFlow={},conversationFlow={},turnId="",reset=false}={}){
  const prior=reset?{}:previousFrom(previous),flow=isObj(conversationFlow)?conversationFlow:{},outcomes=isObj(outcomeFlow)?outcomeFlow:{};
  const objectiveAlignment=alignment.analyze({prompt,previous:isObj(prior.objectiveAlignment)?prior.objectiveAlignment:prior,outcomeFlow:outcomes,conversationFlow:flow,turnId});
  const fp=strategicFingerprint(objectiveAlignment.governingObjective,outcomes,flow);
  const priorObjective=text(isObj(prior.objectiveAlignment)?prior.objectiveAlignment.governingObjective:prior.governingObjective,700).toLowerCase();
  const nextObjective=text(objectiveAlignment.governingObjective,700).toLowerCase();
  const previousBlockers=text(prior.blockerFingerprint,1200),nextBlockers=blockerFingerprint(outcomes);
  const stale=!!priorObjective&&priorObjective!==nextObjective||previousBlockers!==nextBlockers&&(!!previousBlockers||!!nextBlockers);
  const predictiveRisk=risk.analyze({prompt,previous:isObj(prior.predictiveRisk)?prior.predictiveRisk:prior,alignment:objectiveAlignment,outcomeFlow:outcomes,conversationFlow:flow});
  const pathwaySynthesis=pathways.analyze({prompt,previous:isObj(prior.pathwaySynthesis)?prior.pathwaySynthesis:prior,alignment:objectiveAlignment,risk:predictiveRisk,outcomeFlow:outcomes,conversationFlow:flow,stale});
  return {version:VERSION,contract:CONTRACT,layers:Object.freeze({strategicObjectiveAlignment:15,predictiveRiskModel:16,strategicPathwaySynthesis:17}),turnId:text(turnId,120),strategicFingerprint:fp,blockerFingerprint:nextBlockers,objectiveAlignment,predictiveRisk,pathwaySynthesis,governingObjective:text(objectiveAlignment.governingObjective,700),principalRisk:text(predictiveRisk.principalRisk,700),recommendedPathwayId:text(pathwaySynthesis.recommendedPathwayId,140),approvedPathwayId:text(pathwaySynthesis.approvedPathwayId,140),stalePriorAssessment:stale,internalOnly:true};
}
function commitTurn(v={},reply="",result={}){const x=isObj(v)?v:{};return {...x,lastReply:text(reply,1200),resultStatus:text(isObj(result)?result.statusCode:"",40),committed:true,committedAt:Date.now()};}
function projectState(v={}){const x=isObj(v)?v:{};return {version:VERSION,contract:CONTRACT,turnId:text(x.turnId,120),strategicFingerprint:text(x.strategicFingerprint,140),blockerFingerprint:text(x.blockerFingerprint,1200),objectiveAlignment:alignment.projectState(x.objectiveAlignment),predictiveRisk:risk.projectState(x.predictiveRisk),pathwaySynthesis:pathways.projectState(x.pathwaySynthesis),governingObjective:text(x.governingObjective,700),principalRisk:text(x.principalRisk,700),recommendedPathwayId:text(x.recommendedPathwayId,140),approvedPathwayId:text(x.approvedPathwayId,140),stalePriorAssessment:x.stalePriorAssessment===true,lastReply:text(x.lastReply,1200),committed:x.committed===true,committedAt:Number(x.committedAt||0)};}
function reconcileVisibleReply(reply="",v={}){const x=isObj(v)?v:{};return pathways.reconcileVisibleReply(reply,isObj(x.pathwaySynthesis)?x.pathwaySynthesis:{});}
function reconcileResult(result={},v={}){if(!isObj(result))return result;const state=projectState(v),memory=isObj(result.memoryPatch)?result.memoryPatch:{},session=isObj(result.sessionPatch)?result.sessionPatch:{},meta=isObj(result.meta)?result.meta:{},routing=isObj(result.routing)?result.routing:{},payload=isObj(result.payload)?result.payload:{},envelope=isObj(result.finalEnvelope)?result.finalEnvelope:{};let reply="";for(const candidate of [result.directReply,result.visibleReply,result.displayReply,result.finalReply,result.reply,result.text,result.message,envelope.reply,payload.reply]){reply=text(candidate,12000);if(reply)break;}reply=reconcileVisibleReply(reply,v);const base={...result,strategicFlow:v,strategicFlowState:state,objectiveAlignment:v.objectiveAlignment,predictiveRisk:v.predictiveRisk,pathwaySynthesis:v.pathwaySynthesis,memoryPatch:{...memory,strategicFlowState:state},sessionPatch:{...session,strategicFlowState:state},routing:{...routing,strategicFlowVersion:VERSION},meta:{...meta,strategicFlowVersion:VERSION,conversationLayers:[9,10,11,12,13,14,15,16,17],strategicMetadataPrivate:true,automaticExecutionAllowed:false}};if(!reply)return base;return {...base,reply,text:reply,answer:reply,output:reply,response:reply,message:reply,directReply:reply,visibleReply:reply,displayReply:reply,finalReply:reply,payload:{...payload,reply,text:reply,message:reply},finalEnvelope:{...envelope,reply,text:reply,answer:reply,output:reply,response:reply,message:reply,directReply:reply,visibleReply:reply,displayReply:reply,finalReply:reply,strategicFlowState:state}};}
function getStatus(){return {ok:true,version:VERSION,contract:CONTRACT,layers:{15:alignment.VERSION,16:risk.VERSION,17:pathways.VERSION},routeAuthority:false,replyAuthority:false,metadataOnly:true,maxPathways:pathways.MAX_PATHWAYS,maxRisks:risk.MAX_RISKS,maxObjectives:alignment.MAX_OBJECTIVES,automaticExecutionAllowed:false,approvalBoundaryPreserved:true};}
module.exports={VERSION,CONTRACT,previousFrom,shouldReset,blockerFingerprint,strategicFingerprint,analyzeTurn,commitTurn,projectState,reconcileVisibleReply,reconcileResult,getStatus,alignment,risk,pathways};

/* MARION_NUANCE_PHASE_A_STRATEGIC_COORDINATOR_V1_START */
(function marionNuancePhaseAStrategicCoordinatorV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseAStrategicCoordinatorV1)return;
  const PHASE_A_VERSION="marion.strategicFlowCoordinator/17.1-cohesive-15-17-nuance-boundary";
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=160){return typeof v==="string"?v.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max):"";}
  function applyNuance(value={},nuanceContext={},prompt=""){
    const base=obj(value),n=obj(nuanceContext);if(!Object.keys(n).length)return {...base,version:PHASE_A_VERSION};
    const objective=typeof api.alignment.applyNuance==="function"?api.alignment.applyNuance(base.objectiveAlignment,n,prompt):base.objectiveAlignment;
    const predictive=typeof api.risk.applyNuance==="function"?api.risk.applyNuance(base.predictiveRisk,n):base.predictiveRisk;
    const pathways=typeof api.pathways.applyNuance==="function"?api.pathways.applyNuance(base.pathwaySynthesis,n,prompt):base.pathwaySynthesis;
    const l23=obj(n.layer23),l24=obj(n.layer24);
    return {...base,version:PHASE_A_VERSION,objectiveAlignment:objective,predictiveRisk:predictive,pathwaySynthesis:pathways,nuanceSummary:{interactionState:clean(l24.currentState,60),confidenceBand:clean(l23.confidenceBand,40),internalOnly:true},nuanceCannotAuthorizeAction:true,nuanceMetadataPrivate:true};
  }
  const originalAnalyze=api.analyzeTurn;
  api.analyzeTurn=function(args={}){const source=obj(args),out=originalAnalyze(source);return applyNuance(out,source.nuanceContext,source.prompt);};
  const originalProject=api.projectState;
  api.projectState=function(value={}){const out=originalProject(value),v=obj(value);return {...out,version:PHASE_A_VERSION,nuanceSummary:obj(v.nuanceSummary),nuanceCannotAuthorizeAction:true};};
  const originalStatus=api.getStatus;
  api.getStatus=function(){return {...originalStatus(),version:PHASE_A_VERSION,nuancePhaseACompatible:true,nuanceCannotAuthorizeAction:true};};
  api.applyNuance=applyNuance;api.VERSION=PHASE_A_VERSION;api.NUANCE_PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";api.__marionNuancePhaseAStrategicCoordinatorV1=true;
})();
/* MARION_NUANCE_PHASE_A_STRATEGIC_COORDINATOR_V1_END */

/* MARION_NUANCE_PHASE_B_StrategicCoordinatorCohesion_V1_START */
(function marionNuancePhaseBStrategicCoordinatorCohesionV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseBStrategicCoordinatorCohesionV1)return;
  const PHASE_B_CONTRACT="nyx.marion.nuance.phaseB/1.0";
  const PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";
  const HARD_STOP_LAYER=26;
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=240){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
  function phaseB(v){const x=obj(v),candidates=[x.phaseBNuance,x.nuancePhaseBContext,x.phaseBContext,x.nuanceContext,obj(x.payload).phaseBNuance,obj(x.payload).nuancePhaseBContext];for(const n of candidates){const q=obj(n);if(q.contract===PHASE_B_CONTRACT&&q.phase==="B")return q;}return{};}
  function phaseAFrom(n){const b=obj(n),a=obj(b.phaseA);return a.contract===PHASE_A_CONTRACT?a:{};}
  function summary(n){const b=obj(n),l25=obj(b.layer25),l26=obj(b.layer26),g=obj(b.subtextGate),p=obj(b.responsePosture),a=phaseAFrom(b),l24=obj(a.layer24);return{contract:PHASE_B_CONTRACT,phase:"B",turnId:clean(b.turnId,160),interactionState:clean(l24.currentState,60),primaryStance:clean(l25.primaryStance,80),secondaryStances:Array.isArray(l25.secondaryStances)?l25.secondaryStances.slice(0,2):[],modifiers:Array.isArray(l25.modifiers)?l25.modifiers.slice(0,4):[],stanceConfidence:Number(l25.confidence||0),literalIntent:clean(l26.literalIntent,120),primaryPragmaticIntent:clean(l26.primaryPragmaticIntent,120),secondaryPragmaticIntents:Array.isArray(l26.secondaryPragmaticIntents)?l26.secondaryPragmaticIntents.slice(0,2):[],conversationControl:clean(obj(l26.conversationControl).category,100),pragmaticConfidence:Number(l26.confidence||0),subtextPolicy:clean(g.subtextPolicy,80),answerStructure:Array.isArray(p.answerStructure)?p.answerStructure.slice(0,6):[],literalIntentPreserved:g.literalIntentPreserved!==false,noUserFacingDiagnostics:true};}

  const original=api.analyzeTurn;if(typeof original==="function")api.analyzeTurn=function(input={}){const b=phaseB(input),s=summary(b),out=original.call(this,input);return {...obj(out),phaseBNuanceSummary:s,phaseBPrimaryStance:s.primaryStance,phaseBPrimaryPragmaticIntent:s.primaryPragmaticIntent,subtextMayChangeObjective:false,subtextMaySelectPathway:false,stanceMayApproveDecision:false,automaticExecutionAllowed:false,conversationArchitectureHardStop:HARD_STOP_LAYER,literalIntentPreserved:true};};

  api.MARION_NUANCE_PHASE_B_CONTRACT=PHASE_B_CONTRACT;
  api.MARION_LAYER_HARD_STOP=HARD_STOP_LAYER;
  api.__marionNuancePhaseBStrategicCoordinatorCohesionV1=true;
})();
/* MARION_NUANCE_PHASE_B_StrategicCoordinatorCohesion_V1_END */
