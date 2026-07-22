"use strict";

/**
 * Layer 17 — Bounded Strategic Pathway Synthesis
 * Produces at most three viable pathways and a recommendation. Never executes.
 */
const VERSION="marion.strategicPathwaySynthesizer/17.0-layer17";
const CONTRACT="nyx.marion.strategicPathways/1.0";
const MAX_PATHWAYS=3;
function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=1800){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function lower(v){return text(v).toLowerCase().replace(/[’‘]/g,"'");}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function clamp01(v,f=0){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):f;}
function hash(v=""){let h=2166136261;const s=text(v,12000);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
function makePath(id,label,description,{alignment=.5,risk=.5,effort=.5,reversibility="high",dependenciesSatisfied=true,mode="proceed_with_controls"}={}){return {pathwayId:id,label,description,mode,alignmentScore:clamp01(alignment),riskScore:clamp01(risk),effortScore:clamp01(effort),reversibility:/^(?:high|moderate|low|irreversible)$/.test(lower(reversibility))?lower(reversibility):"moderate",dependenciesSatisfied:dependenciesSatisfied!==false,requiresApproval:true,safeToExecute:false,status:"recommended_candidate",invalidated:false};}
function riskScore(level="low"){return ({low:.22,medium:.48,high:.75,critical:.96})[lower(level)]??.4;}
function selectReference(prompt,pathways,previous={}){const p=lower(prompt),prev=isObj(previous)?previous:{};for(const path of pathways){if(p.includes(lower(path.pathwayId))||p.includes(lower(path.label)))return path.pathwayId;}const letter=p.match(/\bpath(?:way)?\s*([abc123])\b/i);if(letter){const idx={a:0,"1":0,b:1,"2":1,c:2,"3":2}[letter[1].toLowerCase()];if(pathways[idx])return pathways[idx].pathwayId;}return text(prev.selectedPathwayId,140);}
function stateSignals(prompt=""){
  const p=lower(prompt);
  return {
    cancel:/\b(?:cancel|drop|discard|invalidate|stop)\s+(?:that|this|the)?\s*(?:path|pathway|plan|strategy)\b/.test(p),
    keepBaseline:/\b(?:keep|retain|preserve)\s+(?:the\s+)?current\s+(?:(?:validated|certified)\s+)?baseline\b/.test(p),
    approve:/\b(?:approve|approved|authorize|authorized|go ahead with|proceed with|use|select|choose)\b/.test(p)&&/\b(?:path|pathway|baseline|additive|pilot|phased)\b/.test(p),
    select:/\b(?:select|choose|recommend|go with|use)\b/.test(p)&&/\b(?:path|pathway|option|baseline|additive|pilot|phased)\b/.test(p),
    executing:/\b(?:executing|deploying|implementation has started|now applying)\b/.test(p),
    completed:/\b(?:completed|finished|full pass|all tests passed|deployment passed)\b/.test(p)
  };
}
function directStrategicQuery(prompt=""){return /\b(?:what are (?:our|the) options|which path|which pathway|which option|strongest path|best route|safest route|should we proceed|compare the approaches|what could go wrong|does this support the objective|are we drifting|what is the larger goal)\b/i.test(text(prompt));}
function analyze({prompt="",previous={},alignment={},risk={},outcomeFlow={},conversationFlow={},stale=false}={}){
  const prev=isObj(previous)?previous:{},a=isObj(alignment)?alignment:{},r=isObj(risk)?risk:{},raw=text(prompt,6000),sig=stateSignals(raw),objective=first(a.governingObjective,prev.governingObjective),decisionContext=first(a.proposedAction,r.subject,raw),blockers=[];
  const ct=isObj(outcomeFlow)&&isObj(outcomeFlow.commitmentTracking)?outcomeFlow.commitmentTracking:{};
  for(const c of Array.isArray(ct.openCommitments)?ct.openCommitments:[]){for(const b of Array.isArray(c&&c.blockers)?c.blockers:[])blockers.push(text(b,240));}
  const alignmentScore=a.alignmentScore==null?.45:clamp01(a.alignmentScore,.45),baseRisk=riskScore(r.overallRisk),deps=blockers.length===0;
  let pathways=[];
  if(a.alignmentStatus==="insufficient_objective_context"){
    pathways=[makePath("path_clarify_objective","Clarify the governing objective","Confirm the governing objective before ranking a strategic change.",{alignment:.5,risk:.18,effort:.18,mode:"clarify",dependenciesSatisfied:true})];
  }else if(sig.keepBaseline||a.alignmentStatus==="objective_conflict"||r.overallRisk==="critical"){
    pathways=[
      makePath("path_retain_baseline","Retain the current baseline","Keep the certified runtime unchanged while the conflicting objective or critical risk is resolved.",{alignment:Math.max(.72,alignmentScore),risk:.12,effort:.12,mode:"retain_baseline"}),
      makePath("path_reframe_additive","Reframe as additive integration","Reframe the requested change behind the existing adapter and preserve rollback authority.",{alignment:.82,risk:.34,effort:.55,mode:"reframe_objective"}),
      makePath("path_defer_for_evidence","Defer pending evidence","Pause implementation until the missing objective, dependency, or production evidence is available.",{alignment:.65,risk:.16,effort:.2,mode:"defer_pending_evidence",dependenciesSatisfied:false})
    ];
  }else{
    pathways=[
      makePath("path_additive_integration","Additive integration","Integrate Layers 15–17 behind the existing conversation registry and private adapter without changing route authority.",{alignment:Math.max(.82,alignmentScore),risk:Math.min(.48,baseRisk),effort:.58,reversibility:"high",mode:"proceed_with_controls",dependenciesSatisfied:deps}),
      makePath("path_controlled_pilot","Controlled strategic pilot","Activate the strategic modules in isolated private-session tests before a full production rollout.",{alignment:.78,risk:.25,effort:.48,reversibility:"high",mode:"limited_pilot",dependenciesSatisfied:deps}),
      makePath("path_retain_baseline","Retain the current baseline","Make no strategic runtime change until the expected value clearly exceeds the regression exposure.",{alignment:.62,risk:.1,effort:.08,reversibility:"high",mode:"no_action_required",dependenciesSatisfied:true})
    ];
  }
  pathways=pathways.slice(0,MAX_PATHWAYS);
  if(stale){for(const p of pathways)p.previousRankingsInvalidated=true;}
  const ranked=pathways.slice().sort((x,y)=>{
    const sx=(x.alignmentScore*.46)+((1-x.riskScore)*.3)+((1-x.effortScore)*.08)+(x.reversibility==="high"?.1:0)+(x.dependenciesSatisfied?.06:-.12);
    const sy=(y.alignmentScore*.46)+((1-y.riskScore)*.3)+((1-y.effortScore)*.08)+(y.reversibility==="high"?.1:0)+(y.dependenciesSatisfied?.06:-.12);
    x.rankScore=Number(sx.toFixed(3));y.rankScore=Number(sy.toFixed(3));return sy-sx;
  });
  let recommended=ranked[0]?.pathwayId||"";
  if(sig.keepBaseline)recommended="path_retain_baseline";
  else if(prev.selectedPathwayId==="path_retain_baseline"&&!sig.cancel&&!sig.select&&!sig.approve&&pathways.some(p=>p.pathwayId==="path_retain_baseline"))recommended="path_retain_baseline";
  let selected=selectReference(raw,pathways,prev),approved="";
  if(sig.cancel){selected="";approved="";}
  if(sig.keepBaseline){selected="path_retain_baseline";approved=sig.approve?selected:"";}
  else if(sig.approve&&selected)approved=selected;
  else if(!sig.approve&&prev.approvedPathwayId&&!stale&&!a.objectiveChanged)approved=text(prev.approvedPathwayId,140);
  if(stale){approved="";if(!sig.select&&!sig.approve&&!sig.keepBaseline)selected="";}
  const recommendedPath=pathways.find(p=>p.pathwayId===recommended)||ranked[0];
  const status=sig.completed?"completed":sig.executing?"executing":approved?"approved":selected?"selected":"recommended";
  const noAction=recommendedPath&&recommendedPath.mode==="no_action_required";
  const reason=recommendedPath?`${recommendedPath.label} ranks highest because it balances objective alignment, bounded risk, reversibility, dependency readiness, and implementation effort.`:"No viable pathway can be ranked yet.";
  let suggestedReply="";
  const approvedPath=pathways.find(p=>p.pathwayId===approved);
  const selectedPath=pathways.find(p=>p.pathwayId===selected);
  const objectiveStatement=a.objectiveChanged===true&&/\b(?:objective|goal|priority)\b/i.test(raw);
  if(sig.approve&&approvedPath){
    suggestedReply=`${approvedPath.label} is now the approved strategic pathway. ${approvedPath.description} Approval does not create autonomous execution; implementation still requires the existing runtime command and deployment controls.`;
  }else if(sig.keepBaseline&&selectedPath){
    suggestedReply=`The current certified baseline remains the active pathway. No strategic runtime change should proceed unless you explicitly replace that selection.`;
  }else if(objectiveStatement&&a.governingObjective){
    suggestedReply=`The governing objective is now: ${a.governingObjective}. I will evaluate proposed actions, risks, and pathways against that objective without treating the objective itself as authorization to execute.`;
  }else if(directStrategicQuery(raw)||a.requiresReframing===true){
    if(a.alignmentStatus==="insufficient_objective_context")suggestedReply="I do not yet have a sufficiently explicit governing objective to rank the options responsibly. Confirm the larger objective first, then I can compare the pathways against it.";
    else if(recommendedPath)suggestedReply=`The strongest pathway is ${recommendedPath.label.toLowerCase()}. ${recommendedPath.description} The principal risk is ${text(r.principalRisk||"a shared-state regression",420)} This is a recommendation only; implementation still requires your explicit approval.`;
  }
  return {version:VERSION,contract:CONTRACT,layer:17,assessmentId:`pathways-${hash([objective,decisionContext,pathways.map(p=>p.pathwayId).join("|")].join("|"))}`,decisionContext,governingObjective:objective,pathways,rankedPathwayIds:ranked.map(p=>p.pathwayId),recommendedPathwayId:recommended,selectedPathwayId:selected,approvedPathwayId:approved,invalidatedPathwayIds:stale?Array.isArray(prev.pathways)?prev.pathways.map(p=>text(p&&p.pathwayId,140)).filter(Boolean).slice(0,12):[]:[],recommendationReason:reason,confidence:clamp01((a.confidence||.5)*.55+(r.confidence||.5)*.45,.5),decisionRequired:!noAction&&status!=="approved"&&status!=="completed",automaticExecutionAllowed:false,safeToExecute:false,status,noActionRequired:noAction,staleRankingsInvalidated:stale,suggestedReply,shouldAnswerDirectly:!!suggestedReply,internalOnly:true};
}
function reconcileVisibleReply(reply="",flow={}){const f=isObj(flow)?flow:{},current=text(reply,12000),suggested=text(f.suggestedReply,1800);if(!suggested)return current;const generic=!current||/^(?:i['’]?m here|i am here|tell me what you want|what would you like)|\b(?:private runtime is unavailable|final envelope missing|diagnostic packet)\b/i.test(current);return f.shouldAnswerDirectly===true||generic?suggested:current;}
function projectPathway(p={}){const x=isObj(p)?p:{};return {pathwayId:text(x.pathwayId,140),label:text(x.label,160),description:text(x.description,700),mode:text(x.mode,80),alignmentScore:clamp01(x.alignmentScore),riskScore:clamp01(x.riskScore),effortScore:clamp01(x.effortScore),rankScore:clamp01(x.rankScore),reversibility:text(x.reversibility,40),dependenciesSatisfied:x.dependenciesSatisfied!==false,requiresApproval:true,safeToExecute:false,status:text(x.status,60),invalidated:x.invalidated===true,previousRankingsInvalidated:x.previousRankingsInvalidated===true};}
function projectState(v={}){const x=isObj(v)?v:{};return {version:VERSION,contract:CONTRACT,assessmentId:text(x.assessmentId,140),decisionContext:text(x.decisionContext,900),governingObjective:text(x.governingObjective,700),pathways:(Array.isArray(x.pathways)?x.pathways:[]).slice(0,MAX_PATHWAYS).map(projectPathway),rankedPathwayIds:(Array.isArray(x.rankedPathwayIds)?x.rankedPathwayIds:[]).slice(0,MAX_PATHWAYS).map(v=>text(v,140)),recommendedPathwayId:text(x.recommendedPathwayId,140),selectedPathwayId:text(x.selectedPathwayId,140),approvedPathwayId:text(x.approvedPathwayId,140),invalidatedPathwayIds:(Array.isArray(x.invalidatedPathwayIds)?x.invalidatedPathwayIds:[]).slice(0,12).map(v=>text(v,140)),recommendationReason:text(x.recommendationReason,900),confidence:clamp01(x.confidence),decisionRequired:x.decisionRequired===true,automaticExecutionAllowed:false,safeToExecute:false,status:text(x.status,60),noActionRequired:x.noActionRequired===true,staleRankingsInvalidated:x.staleRankingsInvalidated===true};}
module.exports={VERSION,CONTRACT,MAX_PATHWAYS,stateSignals,directStrategicQuery,analyze,reconcileVisibleReply,projectPathway,projectState};
