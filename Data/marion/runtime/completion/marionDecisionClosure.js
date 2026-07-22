"use strict";

/** Layer 20: rational decision closure and hard-stop validation. Metadata only. */
const VERSION="marion.decisionClosure/20.0-layer-20";
const CONTRACT="nyx.marion.decisionClosure/1.0";
const HARD_STOP_LAYER=20;
function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=1200){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function closureSignal(prompt=""){return /\b(?:hard stop at layer 20|this is it|finalize|close (?:this|the thread|the decision)|freeze (?:the )?baseline|we(?:'re| are) done|complete the architecture|no more layers|stop at layer 20)\b/i.test(text(prompt));}
function validationSignal(prompt=""){return /\b(?:full pass|passed|live test passed|validation passed|all tests passed|certified|production baseline frozen|baseline certified)\b/i.test(text(prompt));}
function querySignal(prompt=""){return /\b(?:are we done|can we close|is this complete|what remains before closure|final decision|closure status|ready to freeze|functional validation)\b/i.test(text(prompt));}
function analyze({prompt="",previous={},conversationFlow={},outcomeFlow={},strategicFlow={},goalRealignment={},crossDomainContext={}}={}){
  const prior=isObj(previous)?previous:{},flow=isObj(conversationFlow)?conversationFlow:{},out=isObj(outcomeFlow)?outcomeFlow:{},strategic=isObj(strategicFlow)?strategicFlow:{},goal=isObj(goalRealignment)?goalRealignment:{};
  const commitments=isObj(out.commitmentTracking)?out.commitmentTracking:{},open=Array.isArray(commitments.openCommitments)?commitments.openCommitments:[],blocked=open.filter(c=>Array.isArray(c&&c.blockers)&&c.blockers.length),risk=isObj(strategic.predictiveRisk)?strategic.predictiveRisk:{},path=isObj(strategic.pathwaySynthesis)?strategic.pathwaySynthesis:{},alignment=isObj(strategic.objectiveAlignment)?strategic.objectiveAlignment:{};
  const validationPassed=validationSignal(prompt)||prior.validationPassed===true||/passed|certified/i.test(text(isObj(out.outcomeAwareness)?out.outcomeAwareness.outcomeText:""));
  const objectiveDefined=!!first(goal.activeGoal,alignment.governingObjective),outcomeResolved=!!(isObj(out.outcomeAwareness)&&out.outcomeAwareness.outcomeType&&out.outcomeAwareness.outcomeType!=="none")||validationPassed,noBlockingCommitments=blocked.length===0&&open.length===0,riskControlled=!/\b(?:critical|high)\b/i.test(text(risk.overallRisk))||!!path.approvedPathwayId||/baseline/i.test(text(path.selectedPathwayId)),pathwayResolved=!!first(path.approvedPathwayId,path.selectedPathwayId,path.recommendedPathwayId)||/no_action|closed/i.test(text(path.status)),goalStable=!goal.goalChanged||goal.requiresStrategicReassessment!==true;
  const criteria={objectiveDefined,outcomeResolved,noBlockingCommitments,riskControlled,pathwayResolved,goalStable,validationPassed};
  const all=Object.values(criteria).every(Boolean),wantsClose=closureSignal(prompt)||goal.hardStopAtLayer20===true;
  let closureStatus="open";if(blocked.length)closureStatus="blocked";else if(wantsClose&&all)closureStatus="closed";else if(wantsClose&&!all)closureStatus="provisional";else if(all)closureStatus="ready_to_close";else if(validationPassed)closureStatus="ready_for_resolution";
  const missing=Object.entries(criteria).filter(([,v])=>!v).map(([k])=>k);
  const finalDecision=closureStatus==="closed"?first(path.approvedPathwayId,path.selectedPathwayId,"Retain the validated production baseline"):"";
  let reply="";if(querySignal(prompt)||closureSignal(prompt)){
    if(closureStatus==="closed")reply="The architecture is ready to close at Layer 20. Freeze the validated production baseline, preserve the rollback package, and move from layering into real-world operational validation.";
    else if(closureStatus==="ready_to_close")reply="The decision structure is ready for formal closure. Confirm the final baseline and archive the validated release; no additional conversational layer is strategically justified.";
    else reply=`Closure is not yet definitive. The remaining validation points are: ${missing.join(", ")||"final operator confirmation"}.`;
  }
  return {version:VERSION,contract:CONTRACT,layer:20,closureStatus,hardStopLayer:HARD_STOP_LAYER,hardStopAtLayer20:wantsClose||goal.hardStopAtLayer20===true,criteria,missingCriteria:missing,openCommitmentCount:open.length,blockedCommitmentCount:blocked.length,validationPassed,finalDecision:text(finalDecision,500),closureCertificate:closureStatus==="closed"?{status:"certified_closed",layersValidated:"1-20",baselineFreezeRequired:true,operationalValidationNext:true}:null,additionalLayerRecommended:false,automaticExecutionAllowed:false,humanFinalAuthority:true,suggestedReply:reply};
}
function projectState(v={}){const x=isObj(v)?v:{};return {version:VERSION,contract:CONTRACT,closureStatus:text(x.closureStatus,80),hardStopLayer:HARD_STOP_LAYER,hardStopAtLayer20:x.hardStopAtLayer20===true,criteria:isObj(x.criteria)?{...x.criteria}:{},missingCriteria:Array.isArray(x.missingCriteria)?x.missingCriteria.slice(0,10):[],openCommitmentCount:Number(x.openCommitmentCount||0),blockedCommitmentCount:Number(x.blockedCommitmentCount||0),validationPassed:x.validationPassed===true,finalDecision:text(x.finalDecision,500),closureCertificate:isObj(x.closureCertificate)?{...x.closureCertificate}:null,additionalLayerRecommended:false,automaticExecutionAllowed:false,humanFinalAuthority:true};}
function getStatus(){return {ok:true,version:VERSION,contract:CONTRACT,layer:20,hardStopLayer:HARD_STOP_LAYER,additionalLayerRecommended:false,automaticExecutionAllowed:false,humanFinalAuthority:true,routeAuthority:false,replyAuthority:false};}
module.exports={VERSION,CONTRACT,HARD_STOP_LAYER,closureSignal,validationSignal,querySignal,analyze,projectState,getStatus};
