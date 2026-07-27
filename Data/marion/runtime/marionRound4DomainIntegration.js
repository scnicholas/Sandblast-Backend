"use strict";
/** Round 4 multi-domain integration contract. Internal routing/evidence metadata only. */
const VERSION="nyx.marion.round4.multiDomainIntegration/1.0";
const SIX_DOMAINS=Object.freeze(["psychology","english","ai","cyber","law","finance"]);
const PRIORITY=Object.freeze(["law","cyber","finance","psychology","ai","english"]);
const SIGNALS=Object.freeze({
 psychology:[/\bpsycholog(?:y|ical)\b/i,/\bbehavio(?:u)?r(?:al)?\b/i,/\bemotion(?:al)?\b/i,/\bbias(?:es)?\b/i,/\btrust\b/i,/\badoption\b/i],
 english:[/\benglish\b/i,/\bgrammar\b/i,/\bwording\b/i,/\btone\b/i,/\bclarity\b/i,/\bcopy\b/i,/\bcommunication\b/i],
 ai:[/\bartificial intelligence\b/i,/\bai\b/i,/\bmachine learning\b/i,/\bllm\b/i,/\bagent(?:ic|s)?\b/i,/\bmodel governance\b/i],
 cyber:[/\bcyber(?:security)?\b/i,/\bsecurity\b/i,/\bprivacy\b/i,/\bdata protection\b/i,/\baccess control\b/i,/\bthreat\b/i,/\bzero trust\b/i],
 law:[/\blaw\b/i,/\blegal\b/i,/\bcontract\b/i,/\bcompliance\b/i,/\bliability\b/i,/\blicen[cs]ing\b/i,/\bcopyright\b/i,/\bregulat(?:ion|ory)\b/i],
 finance:[/\bfinance\b/i,/\bfinancial\b/i,/\bcash flow\b/i,/\brevenue\b/i,/\bpricing\b/i,/\bmargin\b/i,/\bbudget\b/i,/\bcost(?:s|ing)?\b/i,/\bimplementation cost\b/i,/\brisk management\b/i]
});
function text(v){try{return String(v==null?"":v).replace(/\s+/g," ").trim();}catch(_){return"";}}
function canonical(v){const k=text(v).toLowerCase().replace(/[^a-z0-9]+/g,"_");const a={psych:"psychology",language:"english",writing:"english",artificial_intelligence:"ai",machine_learning:"ai",cybersecurity:"cyber",security:"cyber",legal:"law",financial:"finance"};const d=a[k]||k;return SIX_DOMAINS.includes(d)?d:"";}
function extract(input){if(typeof input==="string")return text(input);const x=input&&typeof input==="object"?input:{};const p=x.payload&&typeof x.payload==="object"?x.payload:{};const r=x.routing&&typeof x.routing==="object"?x.routing:{};return text(x.text||x.userText||x.rawUserText||x.prompt||x.message||x.query||p.text||p.userText||r.rawUserText||r.normalizedUserIntent);}
function score(textValue,context={}){const t=text(textValue),scores={};for(const d of SIX_DOMAINS){let n=0;for(const rx of SIGNALS[d])if(rx.test(t))n+=1;scores[d]=Math.min(1,n?0.58+n*0.12:0);}const explicit=[context.domain,context.knowledgeDomain,context.primaryDomain].map(canonical).filter(Boolean);for(const d of explicit)scores[d]=Math.max(scores[d],.88);return scores;}
function build(input={},context={}){const q=extract(input)||extract(context),scores=score(q,{...(input&&typeof input==="object"?input:{}),...(context&&typeof context==="object"?context:{})});let selected=SIX_DOMAINS.filter(d=>scores[d]>=.58);if(!selected.length){const c=canonical(context.domain||context.knowledgeDomain||(input&&input.domain));if(c)selected=[c];}selected.sort((a,b)=>scores[b]-scores[a]||PRIORITY.indexOf(a)-PRIORITY.indexOf(b));const primary=selected[0]||"";const secondary=selected.slice(1,5);const highStakes=selected.some(d=>["law","finance","cyber","psychology"].includes(d));return {version:VERSION,active:selected.length>1,primaryDomain:primary,secondaryDomains:secondary,domains:selected,scores,highStakes,requiresSourceSeparation:selected.length>1,domainIsolationRequired:true,noCrossDomainBleed:true,answerSynthesisOrder:selected,policy:{law:"educational_only_jurisdiction_aware",finance:"educational_scenario_based",cyber:"defensive_only",psychology:"educational_not_therapy",ai:"human_oversight",english:"preserve_meaning"},executionAuthorized:false,noUserFacingDiagnostics:true};}
function attach(result,input,context={}){if(!result||typeof result!=="object")return result;const plan=build(input,context);return {...result,multiDomainIntegration:plan,primaryDomain:result.primaryDomain||plan.primaryDomain,secondaryDomains:Array.isArray(result.secondaryDomains)&&result.secondaryDomains.length?result.secondaryDomains:plan.secondaryDomains};}
module.exports={VERSION,SIX_DOMAINS,PRIORITY,canonical,extract,score,build,attach};
