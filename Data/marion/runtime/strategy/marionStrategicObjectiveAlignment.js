"use strict";

/**
 * Layer 15 — Strategic Objective Alignment
 * Evaluates whether the current proposal supports the governing objective.
 * Metadata only: no route, reply, approval, or execution authority.
 */
const VERSION = "marion.strategicObjectiveAlignment/17.0-layer15";
const CONTRACT = "nyx.marion.strategicAlignment/1.0";
const MAX_OBJECTIVES = 8;

function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=1600){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function lower(v){return text(v).toLowerCase().replace(/[’‘]/g,"'");}
function clamp01(v,f=0){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):f;}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function hash(v=""){let h=2166136261;const s=text(v,12000);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
function unique(values,max=20){const out=[];for(const v of Array.isArray(values)?values:[]){const t=text(v,260);if(t&&!out.includes(t))out.push(t);if(out.length>=max)break;}return out;}
function normObjective(v={}){const o=isObj(v)?v:{};return {objectiveId:text(o.objectiveId,120),level:/^(?:governing|program|project|milestone|task)$/.test(lower(o.level))?lower(o.level):"project",text:text(o.text||o.objective||o.goal,700),source:/^(?:explicit|approved|inferred|carried)$/.test(lower(o.source))?lower(o.source):"carried",confidence:clamp01(o.confidence,.7),active:o.active!==false,createdAt:Number(o.createdAt||Date.now()),updatedAt:Number(o.updatedAt||Date.now())};}
function projectObjectives(list){return (Array.isArray(list)?list:[]).map(normObjective).filter(x=>x.text&&x.active).slice(-MAX_OBJECTIVES);}
function explicitObjective(prompt=""){
  const p=text(prompt,3000);
  const patterns=[
    /\b(?:our|the|my)\s+(?:(?:governing|program|project|milestone|task)\s+)?(?:objective|goal|priority)\s+(?:is|will be|remains)\s+(.+?)(?:[.!?]|$)/i,
    /\b(?:set|change|update)\s+(?:the\s+)?(?:(?:governing|program|project|milestone|task)\s+)?(?:objective|goal|priority)\s+to\s+(.+?)(?:[.!?]|$)/i,
    /\b(?:we need to|we must)\s+(.+?)(?:[.!?]|$)/i
  ];
  for(const rx of patterns){const m=p.match(rx);if(!m)continue;return text(m[1],700);}
  return "";
}
function objectiveChange(prompt=""){return /\b(?:change|replace|reset|update|new)\s+(?:the\s+)?(?:objective|goal|priority)\b|\b(?:our|the|my)\s+(?:new\s+)?(?:objective|goal|priority)\s+is\b/i.test(text(prompt));}
function objectiveCancellation(prompt=""){return /\b(?:cancel|drop|remove|abandon)\s+(?:that|the|this)?\s*(?:objective|goal|plan|strategy)\b/i.test(text(prompt));}
function actionFrom({prompt="",outcomeFlow={},previous={}}={}){
  const o=isObj(outcomeFlow)?outcomeFlow:{},oa=isObj(o.outcomeAwareness)?o.outcomeAwareness:{},g=isObj(o.anticipatoryGuidance)?o.anticipatoryGuidance:{},p=isObj(previous)?previous:{},raw=text(prompt,900);
  if(explicitObjective(raw)||objectiveChange(raw))return "";
  const query=/^(?:what|why|how|which|does|do|should|can|could|would|are|is)\b/i.test(raw)||/\b(?:what could go wrong|what are (?:our|the) options|which path|does this support|are we drifting)\b/i.test(raw);
  const pathwayReference=/\b(?:proceed with|approve|authorize|select|choose|go with)\s+(?:path|pathway|option)\s*[abc123]\b/i.test(raw);
  if((query||pathwayReference)&&p.proposedAction)return text(p.proposedAction,900);
  if(/\b(?:replace|overwrite|remove|bypass|deploy|integrate|implement|keep|retain|preserve|skip|rewrite|approve|proceed)\b/i.test(raw))return raw;
  return first(oa.outcomeText,g.nextBestAction,p.proposedAction,p.lastProposedAction,raw).slice(0,900);
}
function alignmentSignals(action="",objective=""){
  const a=lower(action),o=lower(objective),supports=[],conflicts=[];
  const addSupport=(s)=>{if(!supports.includes(s))supports.push(s);};
  const addConflict=(s)=>{if(!conflicts.includes(s))conflicts.push(s);};
  if(/\b(?:preserve|maintain|retain|keep|protect)\b.{0,80}\b(?:baseline|route|authority|architecture|compatibility|rollback)\b/.test(a))addSupport("production_stability");
  if(/\b(?:additive|backward compatible|behind the existing|phased|pilot|feature flag|rollback|backup|validate|test)\b/.test(a))addSupport("controlled_change");
  if(/\b(?:revenue|commercial|advertising|conversion|market|licens)\b/.test(a)&&/\b(?:revenue|commercial|advertising|conversion|market|licens)\b/.test(o))addSupport("commercial_objective");
  if(/\b(?:replace|overwrite|remove|bypass)\b.{0,100}\b(?:certified|direct-adapter|route authority|baseline|guard|validation|approval)\b/.test(a))addConflict("certified_baseline");
  if(/\b(?:skip|without|bypass)\b.{0,60}\b(?:test|validation|backup|approval|rollback)\b/.test(a))addConflict("control_boundary");
  if(/\b(?:deploy everything|all at once|big bang|replace the state spine|rewrite the runtime)\b/.test(a))addConflict("operational_continuity");
  if(/\b(?:public nyx|public interface)\b/.test(a)&&/\bprivate marion|private admin\b/.test(o))addConflict("public_private_separation");
  const objectiveTokens=new Set(o.replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(x=>x.length>4));
  const actionTokens=a.replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(x=>x.length>4);
  let overlap=0;for(const token of actionTokens)if(objectiveTokens.has(token))overlap++;
  if(overlap>=2)addSupport("semantic_objective_match");
  return {supports,conflicts,overlap};
}
function analyze({prompt="",previous={},outcomeFlow={},conversationFlow={},turnId=""}={}){
  const prev=isObj(previous)?previous:{},priorObjectives=projectObjectives(prev.objectives),raw=text(prompt,6000),explicit=explicitObjective(raw),cancel=objectiveCancellation(raw),changed=objectiveChange(raw)||!!explicit;
  let objectives=priorObjectives;
  if(cancel)objectives=[];
  if(explicit){
    const entry={objectiveId:`objective-${hash(explicit)}`,level:/\bgoverning\b/i.test(raw)?"governing":/\bprogram\b/i.test(raw)?"program":/\bmilestone\b/i.test(raw)?"milestone":/\btask\b/i.test(raw)?"task":"project",text:explicit,source:"explicit",confidence:.99,active:true,createdAt:Date.now(),updatedAt:Date.now()};
    objectives=[...objectives.filter(x=>lower(x.text)!==lower(entry.text)),entry].slice(-MAX_OBJECTIVES);
  }
  const governingEntry=objectives.slice().reverse().find(x=>x.level==="governing")||objectives.slice().reverse().find(x=>x.level==="project")||objectives.slice().reverse()[0]||null;
  const governing=first(governingEntry&&governingEntry.text,prev.governingObjective);
  const action=actionFrom({prompt:raw,outcomeFlow,previous:prev});
  const base={version:VERSION,contract:CONTRACT,layer:15,assessmentId:`alignment-${hash([turnId,governing,action].join("|"))}`,objectiveId:first(governingEntry&&governingEntry.objectiveId,prev.objectiveId),governingObjective:governing,objectives,proposedAction:action,alignmentStatus:"insufficient_objective_context",alignmentScore:null,confidence:governing?0.5:0.2,supports:[],conflicts:[],dimensions:[],strategicDrift:false,requiresClarification:!governing,requiresReframing:false,safeToProceed:false,objectiveChanged:changed,objectiveCancelled:cancel,sourceTurnId:text(turnId,120),internalOnly:true};
  if(!raw||/^\s*(?:hello|hi|hey|good\s+(?:morning|afternoon|evening))\b/i.test(raw))return base;
  if(!governing)return base;
  const sig=alignmentSignals(action,governing),conflictCount=sig.conflicts.length,supportCount=sig.supports.length;
  let score=.58+(supportCount*.12)-(conflictCount*.22);score=Math.max(0,Math.min(1,score));
  let status="neutral";
  if(conflictCount>=2||score<.3)status="objective_conflict";
  else if(conflictCount===1)status="conditionally_aligned";
  else if(supportCount>=2||score>=.8)status="strongly_aligned";
  else if(supportCount===1||score>=.62)status="aligned";
  const drift=/\b(?:unrelated|side project|while we are here|also rebuild|rewrite everything)\b/i.test(raw)&&supportCount===0;
  if(drift){status="tactical_distraction";score=Math.min(score,.42);}
  const dimensions=[
    {name:"production_stability",status:sig.conflicts.includes("certified_baseline")||sig.conflicts.includes("operational_continuity")?"conflict":sig.supports.includes("production_stability")||sig.supports.includes("controlled_change")?"support":"neutral"},
    {name:"authority_boundaries",status:sig.conflicts.includes("control_boundary")||sig.conflicts.includes("public_private_separation")?"conflict":"neutral"},
    {name:"objective_relevance",status:sig.supports.includes("semantic_objective_match")?"support":drift?"conflict":"neutral"}
  ];
  const confidence=Math.min(.98,.68+(explicit?0.16:0)+(Math.min(3,supportCount+conflictCount)*.05));
  return {...base,alignmentStatus:status,alignmentScore:Number(score.toFixed(2)),confidence:Number(confidence.toFixed(2)),supports:unique(sig.supports),conflicts:unique(sig.conflicts),dimensions,strategicDrift:drift,requiresClarification:false,requiresReframing:status==="objective_conflict"||status==="tactical_distraction",safeToProceed:status==="aligned"||status==="strongly_aligned"||status==="neutral"};
}
function projectState(v={}){const x=isObj(v)?v:{};return {version:VERSION,contract:CONTRACT,assessmentId:text(x.assessmentId,140),objectiveId:text(x.objectiveId,120),governingObjective:text(x.governingObjective,700),objectives:projectObjectives(x.objectives),proposedAction:text(x.proposedAction,900),alignmentStatus:text(x.alignmentStatus,80),alignmentScore:x.alignmentScore==null?null:clamp01(x.alignmentScore),confidence:clamp01(x.confidence),supports:unique(x.supports),conflicts:unique(x.conflicts),dimensions:Array.isArray(x.dimensions)?x.dimensions.slice(0,8).map(d=>({name:text(d&&d.name,80),status:text(d&&d.status,40)})):[],strategicDrift:x.strategicDrift===true,requiresClarification:x.requiresClarification===true,requiresReframing:x.requiresReframing===true,safeToProceed:x.safeToProceed===true,objectiveChanged:x.objectiveChanged===true,objectiveCancelled:x.objectiveCancelled===true,sourceTurnId:text(x.sourceTurnId,120)};}
module.exports={VERSION,CONTRACT,MAX_OBJECTIVES,explicitObjective,objectiveChange,objectiveCancellation,alignmentSignals,analyze,projectState};
