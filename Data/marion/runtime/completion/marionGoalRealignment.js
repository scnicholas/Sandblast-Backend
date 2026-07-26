"use strict";

/** Layer 19: explicit, current-turn-governed goal realignment. Metadata only. */
const VERSION="marion.goalRealignment/20.0-layer-19";
const CONTRACT="nyx.marion.goalRealignment/1.0";
function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=1000){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function extractExplicitGoal(prompt=""){
  const p=text(prompt,2000);let m=p.match(/\b(?:our|the|my)\s+(?:new\s+)?(?:governing\s+|program\s+|project\s+|current\s+)?(?:objective|goal|priority)\s+(?:is|will be|becomes)\s+(.+?)(?:[.!?]|$)/i);if(m)return text(m[1],700);
  m=p.match(/\b(?:change|shift|realign|replace|update|reset)\s+(?:the\s+)?(?:objective|goal|priority)\s+(?:to|toward|towards)\s+(.+?)(?:[.!?]|$)/i);if(m)return text(m[1],700);
  return"";
}
function extractConstraint(prompt=""){
  const p=text(prompt,1800);if(/\b(?:the\s+)?hard stop\s+(?:is\s+)?at\s+layer 20\b|\bhard stop at layer 20\b/i.test(p))return"Hard stop at Layer 20";
  let m=p.match(/\b(?:constraint|boundary|limit|non-negotiable)\s+(?:is|at|on|will be)\s+(.+?)(?:[.!?]|$)/i);if(m)return text(m[1],500);
  if(/\bdo not (?:change|replace|touch) index\.js\b/i.test(p))return"Preserve index.js and the certified route authority";
  return"";
}
function isRealignmentQuery(prompt=""){return /\b(?:what is our goal now|what are we optimizing for|have we changed direction|realign|new objective|change direction|instead|actually|priority now|hard stop at layer 20)\b/i.test(text(prompt));}
function analyze({prompt="",previous={},strategicFlow={},crossDomainContext={}}={}){
  const prior=isObj(previous)?previous:{},strategic=isObj(strategicFlow)?strategicFlow:{},alignment=isObj(strategic.objectiveAlignment)?strategic.objectiveAlignment:{};
  const previousGoal=first(prior.activeGoal,alignment.governingObjective),explicitGoal=extractExplicitGoal(prompt),constraint=extractConstraint(prompt),changed=!!explicitGoal&&text(explicitGoal).toLowerCase()!==text(previousGoal).toLowerCase(),hardStop=/\bhard stop at layer 20\b/i.test(text(prompt))||constraint==="Hard stop at Layer 20"||prior.hardStopAtLayer20===true;
  let status="unchanged";if(changed)status="explicitly_realigned";else if(constraint)status="constraint_updated";else if(!previousGoal)status="insufficient_goal_context";
  const activeGoal=first(explicitGoal,previousGoal),invalidated=[];
  if(changed)invalidated.push("prior_pathway_ranking","prior_closure_assessment");
  if(constraint)invalidated.push("constraint_sensitive_recommendations");
  const reply=isRealignmentQuery(prompt)?(activeGoal?`The active goal is ${activeGoal}.${constraint?` The controlling constraint is ${constraint}.`:""}${changed?" Prior pathway rankings require reassessment.":""}`:`No governing goal is sufficiently established in this session yet.`):"";
  return {version:VERSION,contract:CONTRACT,layer:19,status,previousGoal:text(previousGoal,700),activeGoal:text(activeGoal,700),explicitGoal:text(explicitGoal,700),goalChanged:changed,constraint:text(constraint,500),hardStopAtLayer20:hardStop,invalidatedAssessments:[...new Set(invalidated)],requiresStrategicReassessment:changed||!!constraint,currentTurnAuthorityPreserved:true,implicitGoalChangeAllowed:false,executionAuthorized:false,crossDomainConflictCount:Array.isArray(crossDomainContext&&crossDomainContext.conflicts)?crossDomainContext.conflicts.length:0,suggestedReply:reply};
}
function projectState(v={}){const x=isObj(v)?v:{};return {version:VERSION,contract:CONTRACT,status:text(x.status,80),previousGoal:text(x.previousGoal,700),activeGoal:text(x.activeGoal,700),goalChanged:x.goalChanged===true,constraint:text(x.constraint,500),hardStopAtLayer20:x.hardStopAtLayer20===true,invalidatedAssessments:Array.isArray(x.invalidatedAssessments)?x.invalidatedAssessments.slice(0,8):[],requiresStrategicReassessment:x.requiresStrategicReassessment===true,currentTurnAuthorityPreserved:true};}
function getStatus(){return {ok:true,version:VERSION,contract:CONTRACT,layer:19,routeAuthority:false,replyAuthority:false,executionAuthority:false,implicitGoalChangeAllowed:false};}
module.exports={VERSION,CONTRACT,extractExplicitGoal,extractConstraint,isRealignmentQuery,analyze,projectState,getStatus};

/* MARION_NUANCE_PHASE_A_GOAL_REALIGNMENT_INTEGRATION_V2_START */
(function marionNuancePhaseAGoalRealignmentIntegrationV2(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseAGoalRealignmentIntegrationV2)return;
  const PATCH_VERSION="nyx.marion.nuance.goalRealignmentIntegration/2.0";
  const PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=160){return typeof v==="string"?v.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max):"";}
  const original=api.analyze;
  if(typeof original==="function")api.analyze=function(input={}){const out=obj(original.call(this,input)),n=obj(obj(input).nuanceContext||obj(input).phaseANuance),l24=obj(n.layer24),state=clean(l24.currentState,60),explicit=clean(out.explicitGoal,700),correction=["correction","clarification","disagreement"].includes(state);let result={...out,phaseAControls:{version:PATCH_VERSION,contract:PHASE_A_CONTRACT,interactionState:state,currentTurnIntentPrimary:true,emotionMayRealignGoal:false,culturalMarkersMayRealignGoal:false,correctionAloneMayRealignGoal:false,internalOnly:true},emotionMayRealignGoal:false,culturalMarkersMayRealignGoal:false};if(correction&&!explicit&&result.goalChanged===true){result={...result,goalChanged:false,status:"unchanged",activeGoal:result.previousGoal,requiresStrategicReassessment:false,invalidatedAssessments:[],phaseAGoalChangeBlocked:true};}return result;};
  api.MARION_NUANCE_PHASE_A_GOAL_REALIGNMENT_VERSION=PATCH_VERSION;
  api.MARION_NUANCE_PHASE_A_CONTRACT=PHASE_A_CONTRACT;
  api.__marionNuancePhaseAGoalRealignmentIntegrationV2=true;
})();
/* MARION_NUANCE_PHASE_A_GOAL_REALIGNMENT_INTEGRATION_V2_END */

/* MARION_NUANCE_PHASE_B_GoalRealignmentCohesion_V1_START */
(function marionNuancePhaseBGoalRealignmentCohesionV1(){
  "use strict";
  const api=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(!api||api.__marionNuancePhaseBGoalRealignmentCohesionV1)return;
  const PHASE_B_CONTRACT="nyx.marion.nuance.phaseB/1.0";
  const PHASE_A_CONTRACT="nyx.marion.nuance.phaseA/1.0";
  const HARD_STOP_LAYER=26;
  function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
  function clean(v,max=240){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
  function phaseB(v){const x=obj(v),candidates=[x.phaseBNuance,x.nuancePhaseBContext,x.phaseBContext,x.nuanceContext,obj(x.payload).phaseBNuance,obj(x.payload).nuancePhaseBContext];for(const n of candidates){const q=obj(n);if(q.contract===PHASE_B_CONTRACT&&q.phase==="B")return q;}return{};}
  function phaseAFrom(n){const b=obj(n),a=obj(b.phaseA);return a.contract===PHASE_A_CONTRACT?a:{};}
  function summary(n){const b=obj(n),l25=obj(b.layer25),l26=obj(b.layer26),g=obj(b.subtextGate),p=obj(b.responsePosture),a=phaseAFrom(b),l24=obj(a.layer24);return{contract:PHASE_B_CONTRACT,phase:"B",turnId:clean(b.turnId,160),interactionState:clean(l24.currentState,60),primaryStance:clean(l25.primaryStance,80),secondaryStances:Array.isArray(l25.secondaryStances)?l25.secondaryStances.slice(0,2):[],modifiers:Array.isArray(l25.modifiers)?l25.modifiers.slice(0,4):[],stanceConfidence:Number(l25.confidence||0),literalIntent:clean(l26.literalIntent,120),primaryPragmaticIntent:clean(l26.primaryPragmaticIntent,120),secondaryPragmaticIntents:Array.isArray(l26.secondaryPragmaticIntents)?l26.secondaryPragmaticIntents.slice(0,2):[],conversationControl:clean(obj(l26.conversationControl).category,100),pragmaticConfidence:Number(l26.confidence||0),subtextPolicy:clean(g.subtextPolicy,80),answerStructure:Array.isArray(p.answerStructure)?p.answerStructure.slice(0,6):[],literalIntentPreserved:g.literalIntentPreserved!==false,noUserFacingDiagnostics:true};}

  const original=api.analyze;if(typeof original==="function")api.analyze=function(input={}){const b=phaseB(input),s=summary(b),prompt=clean(input.prompt,3000),explicit=/\b(?:our|the|my)\s+(?:new\s+)?(?:governing\s+|program\s+|project\s+|current\s+)?(?:objective|goal|priority)\s+(?:is|will be|becomes)\b|\b(?:change|shift|realign|replace|update|reset)\s+(?:the\s+)?(?:objective|goal|priority)\s+(?:to|toward|towards)\b/i.test(prompt),out=original.call(this,input);let result={...obj(out),phaseBPrimaryPragmaticIntent:s.primaryPragmaticIntent,subtextMayRealignGoal:false,stanceMayRealignGoal:false,literalIntentPreserved:true};if(!explicit&&result.goalChanged===true)result={...result,goalChanged:false,status:"unchanged",activeGoal:result.previousGoal,requiresStrategicReassessment:false,invalidatedAssessments:[],phaseBGoalChangeBlocked:true};return result;};

  api.MARION_NUANCE_PHASE_B_CONTRACT=PHASE_B_CONTRACT;
  api.MARION_LAYER_HARD_STOP=HARD_STOP_LAYER;
  api.__marionNuancePhaseBGoalRealignmentCohesionV1=true;
})();
/* MARION_NUANCE_PHASE_B_GoalRealignmentCohesion_V1_END */
