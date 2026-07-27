"use strict";
/** Round 4 bounded multi-domain orchestration contract. Internal-only. */
const VERSION="nyx.marion.round4.boundedMultiDomain/2.0";
const HARD_STOP_LAYER=28;
const KNOWLEDGE_DOMAINS=Object.freeze(["psychology","english","ai","cyber","law","finance"]);
const ALIASES=Object.freeze({psych:"psychology",language:"english",writing:"english",artificial_intelligence:"ai",machine_learning:"ai",security:"cyber",cybersecurity:"cyber",legal:"law",financial:"finance",business:"finance",strategy:"finance",advertising:"finance",marketing:"finance"});
function obj(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{}}
function text(v,max=5000){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max)}catch(_){return""}}
function canonical(v){const k=text(v,80).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");const d=ALIASES[k]||k;return KNOWLEDGE_DOMAINS.includes(d)?d:""}
function extract(input){if(typeof input==="string")return text(input);const x=obj(input),b=obj(x.body),p=obj(x.payload),t=obj(x.turn);return text(x.prompt||x.userText||x.rawUserText||x.message||x.text||x.query||b.prompt||b.text||p.prompt||p.text||t.prompt||t.text)}
function detect(input){const t=extract(input).toLowerCase(),scores={};const add=(d,s)=>{scores[d]=Math.max(scores[d]||0,s)};
 if(/psycholog|behavio|confidence|trust|persuasi|emotion|cognitive|advertiser confidence/.test(t))add("psychology",.92);
 if(/rewrite|wording|tone|clarity|english|communication|message/.test(t))add("english",.88);
 if(/\bai\b|artificial intelligence|model|agent|architecture|automation|sensor/.test(t))add("ai",.91);
 if(/cyber|security|least privilege|access control|audit log|threat|identity/.test(t))add("cyber",.93);
 if(/legal|law|contract|licens|jurisdiction|liability|compliance|rights/.test(t))add("law",.92);
 if(/finance|pricing|cash flow|revenue|margin|cost|advertis|business|commercial|strategy/.test(t))add("finance",.90);
 const requested=[];const x=obj(input);for(const d of ([]).concat(x.domains||[],x.secondaryDomains||[],obj(x.routing).secondaryDomains||[])){const c=canonical(d);if(c&&!requested.includes(c))requested.push(c)}
 requested.forEach((d,i)=>add(d,.96-i*.01));
 return Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([domain,confidence])=>({domain,confidence}));}
function build(input,options={}){const ranked=detect(input),o=obj(options);let max=Math.max(1,Math.min(3,Number(o.maxDomains)||3));let domains=ranked.slice(0,max).map(x=>x.domain);const explicit=canonical(o.domain||o.primaryDomain);if(explicit){domains=[explicit].concat(domains.filter(d=>d!==explicit)).slice(0,max)}if(!domains.length)domains=["finance"];return {version:VERSION,hardStopLayer:HARD_STOP_LAYER,primaryDomain:domains[0],secondaryDomains:domains.slice(1),domains,rankedCandidates:ranked.slice(0,6),maxDomains:max,totalBudgetMs:Math.max(300,Math.min(1200,Number(o.totalBudgetMs)||750)),perDomainBudgetMs:Math.max(120,Math.min(500,Number(o.perDomainBudgetMs)||275)),singlePass:true,parallelRetrieval:true,partialFailureAllowed:true,domainIsolationRequired:true,noCrossDomainBleed:true,recomputeProhibited:true,executionAuthorized:false,noUserFacingDiagnostics:true};}
module.exports={VERSION,HARD_STOP_LAYER,KNOWLEDGE_DOMAINS,canonical,detect,build,extract};
