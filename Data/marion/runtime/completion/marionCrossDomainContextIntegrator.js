"use strict";

/** Layer 18: bounded cross-domain contextual integration. Metadata only. */
const VERSION="marion.crossDomainContextIntegrator/20.0-layer-18";
const CONTRACT="nyx.marion.crossDomainContext/1.0";
const MAX_CONTEXT_ITEMS=12;
const MAX_DOMAINS=6;
function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=1200){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function uniq(values=[]){return [...new Set((Array.isArray(values)?values:[]).map(v=>text(v,80).toLowerCase()).filter(Boolean))].slice(0,MAX_DOMAINS);}
function domainSignals(prompt=""){
  const p=text(prompt).toLowerCase(),out=[];
  const rules={technical:/\b(?:technical|runtime|code|javascript|node|backend|frontend|api|deployment|architecture)\b/,business:/\b(?:business|commercial|revenue|market|advertis|licens|customer|conversion)\b/,law:/\b(?:law|legal|contract|liability|compliance|jurisdiction|regulation)\b/,finance:/\b(?:finance|financial|budget|cost|cash flow|loan|investment|tax)\b/,cyber:/\b(?:cyber|security|privacy|breach|authentication|credential|encryption)\b/,psychology:/\b(?:psychology|behavio|cognitive|emotion|trust|motivation)\b/};
  for(const [d,rx] of Object.entries(rules))if(rx.test(p))out.push(d);
  return uniq(out);
}
function isCrossDomainQuery(prompt=""){
  return /\b(?:across domains?|cross[- ]domain|connect (?:the|these) threads?|how does (?:this|that) affect|what else does this impact|relevant context|previous thread|bring together|synthesize|relationship between|technical and business|business and legal|risk across)\b/i.test(text(prompt));
}
function item(domain,subject,sourceLayer,status="active",relevance=.7){return {domain:text(domain,80)||"general",subject:text(subject,420),sourceLayer:text(sourceLayer,80),status:text(status,80),relevance:Number(Math.max(0,Math.min(1,relevance)).toFixed(2))};}
function collect({conversationFlow={},outcomeFlow={},strategicFlow={},previous={}}={}){
  const flow=isObj(conversationFlow)?conversationFlow:{},pivot=isObj(flow.contextPivot)?flow.contextPivot:{},out=isObj(outcomeFlow)?outcomeFlow:{},strategic=isObj(strategicFlow)?strategicFlow:{},items=[];
  if(flow.activeSubject)items.push(item(flow.activeDomain,flow.activeSubject,"layers_9_11","active",1));
  const paused=Array.isArray(pivot.pausedThreads)?pivot.pausedThreads:[];
  for(const t of paused.slice(-5))items.push(item(t&&t.domain,t&&(t.subject||t.activeSubject),"layer_10","paused",.78));
  const oa=isObj(out.outcomeAwareness)?out.outcomeAwareness:{};
  if(oa.outcomeType&&oa.outcomeType!=="none")items.push(item(flow.activeDomain,oa.outcomeText||oa.relatedSubject,"layer_12",oa.outcomeStatus||"recorded",.88));
  const ct=isObj(out.commitmentTracking)?out.commitmentTracking:{};
  for(const c of (Array.isArray(ct.openCommitments)?ct.openCommitments:[]).slice(0,4))items.push(item(c&&c.domain||flow.activeDomain,c&&(c.description||c.subject),"layer_13",c&&c.status||"pending",.9));
  const al=isObj(strategic.objectiveAlignment)?strategic.objectiveAlignment:{};
  if(al.governingObjective)items.push(item("strategy",al.governingObjective,"layer_15",al.alignmentStatus||"active",.96));
  const risk=isObj(strategic.predictiveRisk)?strategic.predictiveRisk:{};
  if(risk.principalRisk)items.push(item("risk",risk.principalRisk,"layer_16",risk.overallRisk||"assessed",.86));
  const ps=isObj(strategic.pathwaySynthesis)?strategic.pathwaySynthesis:{};
  if(ps.recommendedPathwayId||ps.approvedPathwayId||ps.selectedPathwayId){const pathwayId=first(ps.approvedPathwayId,ps.selectedPathwayId,ps.recommendedPathwayId),pathway=(Array.isArray(ps.pathways)?ps.pathways:[]).find(x=>x&&x.pathwayId===pathwayId)||{};items.push(item("strategy",first(pathway.label,pathway.description,"Current strategic pathway"),"layer_17",ps.status||"recommended",.84));}
  const prior=isObj(previous)?previous:{};
  for(const x of (Array.isArray(prior.contextItems)?prior.contextItems:[]).slice(-4))items.push({...x,relevance:Math.min(.65,Number(x&&x.relevance||.5))});
  const seen=new Set();return items.filter(x=>{const k=`${x.domain}|${x.subject.toLowerCase()}|${x.sourceLayer}`;if(!x.subject||seen.has(k))return false;seen.add(k);return true;}).slice(0,MAX_CONTEXT_ITEMS);
}
function conflicts(items=[]){
  const out=[];const active=items.filter(x=>x.status==="active"||x.status==="approved"||x.status==="pending");
  const hasBaseline=active.some(x=>/baseline/i.test(x.subject)),hasReplace=active.some(x=>/replace.*(?:route|baseline)|deploy.*at once/i.test(x.subject));
  if(hasBaseline&&hasReplace)out.push({type:"direction_conflict",description:"The retained-baseline position conflicts with a replacement or all-at-once action."});
  return out.slice(0,4);
}
function suggested(prompt,items,domainList,conflictList){
  if(!isCrossDomainQuery(prompt))return"";
  const subjects=items.slice(0,4).map(x=>`${x.domain}: ${x.subject}`).join("; ");
  if(!subjects)return"There is not enough authorized session context to form a cross-domain synthesis yet.";
  const conflict=conflictList.length?` One conflict needs attention: ${conflictList[0].description}`:"";
  return `The relevant context spans ${domainList.join(", ")||"the active thread"}. ${subjects}.${conflict}`.replace(/\.\./g,".");
}
function analyze({prompt="",previous={},conversationFlow={},outcomeFlow={},strategicFlow={}}={}){
  const contextItems=collect({conversationFlow,outcomeFlow,strategicFlow,previous}),requestedDomains=domainSignals(prompt),domains=uniq([...requestedDomains,...contextItems.map(x=>x.domain)]),conflictList=conflicts(contextItems);
  const query=isCrossDomainQuery(prompt),synthesisStatus=!contextItems.length?"insufficient_context":conflictList.length?"conflict_detected":domains.length>1?"integrated":"single_domain_context";
  return {version:VERSION,contract:CONTRACT,layer:18,query,synthesisStatus,requestedDomains,domains,contextItems,conflicts:conflictList,sourceBound:true,sessionBound:true,staleContextSuppressed:true,privateMetadata:true,suggestedReply:suggested(prompt,contextItems,domains,conflictList)};
}
function projectState(v={}){const x=isObj(v)?v:{};return {version:VERSION,contract:CONTRACT,synthesisStatus:text(x.synthesisStatus,80),domains:uniq(x.domains),contextItems:(Array.isArray(x.contextItems)?x.contextItems:[]).slice(0,MAX_CONTEXT_ITEMS).map(i=>({domain:text(i&&i.domain,80),subject:text(i&&i.subject,420),sourceLayer:text(i&&i.sourceLayer,80),status:text(i&&i.status,80),relevance:Number(i&&i.relevance||0)})),conflicts:(Array.isArray(x.conflicts)?x.conflicts:[]).slice(0,4),sourceBound:true,sessionBound:true};}
function getStatus(){return {ok:true,version:VERSION,contract:CONTRACT,layer:18,maxContextItems:MAX_CONTEXT_ITEMS,maxDomains:MAX_DOMAINS,routeAuthority:false,replyAuthority:false,executionAuthority:false};}
module.exports={VERSION,CONTRACT,MAX_CONTEXT_ITEMS,MAX_DOMAINS,isCrossDomainQuery,domainSignals,collect,conflicts,analyze,projectState,getStatus};
