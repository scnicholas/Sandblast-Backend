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
