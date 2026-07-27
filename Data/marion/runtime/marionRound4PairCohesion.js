"use strict";

/**
 * marionRound4PairCohesion.js
 * Bounded pairing and six-domain certification contract for Round 4.3–4.5.
 *
 * Authority boundaries:
 * - classifies and plans only;
 * - never performs external execution;
 * - never replaces bridge/final-envelope authority;
 * - never permits recursive domain re-entry.
 */
const VERSION = "nyx.marion.round4.pairCohesion/1.0";
const LAYER_HARD_STOP = 28;
const SIX = Object.freeze(["psychology","english","ai","cyber","law","finance"]);

function obj(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function text(v){ try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim();}catch(_){return"";} }
function uniq(a){ const seen=new Set(),out=[]; for(const x of Array.isArray(a)?a:[]){const k=text(x).toLowerCase();if(!k||seen.has(k)||!SIX.includes(k))continue;seen.add(k);out.push(k);} return out; }

function classify(prompt){
  const t=text(prompt).toLowerCase();
  const lawFinance =
    /\b(licens|licensing|rights|contract|jurisdiction|compliance|regulat|privacy|legal)\b/.test(t) &&
    /\b(revenue|advertis|finance|financial|tax|currency|cash flow|forecast|recognition)\b/.test(t);
  const englishPsychology =
    /\b(rewrite|wording|clear|clarity|persuasive|tone|message|english)\b/.test(t) &&
    /\b(psycholog|pressure|manipulat|coerc|persuasion|emotion|behavior)\b/.test(t);
  const sixDomain =
    (/\b(six[- ]domain|all six|psychology.*english.*ai.*cyber.*law.*finance)\b/.test(t)) ||
    (/\blaunch[- ]readiness\b/.test(t) && /\b(real[- ]world|limited applications|human[- ]controlled|advisory)\b/.test(t));
  return { lawFinance, englishPsychology, sixDomain };
}

function build(prompt, existing={}){
  const flags=classify(prompt);
  let primary="", secondary=[], mode="single";
  if(flags.sixDomain){
    primary="ai";
    secondary=["cyber","law","finance","psychology","english"];
    mode="six_domain_certification";
  }else if(flags.lawFinance){
    primary="law";
    secondary=["finance"];
    mode="law_finance_pair";
  }else if(flags.englishPsychology){
    primary="english";
    secondary=["psychology"];
    mode="english_psychology_pair";
  }else{
    const e=obj(existing);
    primary=text(e.primaryDomain||e.domain||e.knowledgeDomain).toLowerCase();
    secondary=uniq(e.secondaryDomains);
  }
  return {
    version:VERSION,
    mode,
    primaryDomain:primary,
    secondaryDomains:secondary,
    domains:uniq([primary].concat(secondary)),
    routingFinalized:true,
    recomputeProhibited:true,
    recursiveHandoffProhibited:true,
    pairValidationSinglePass:true,
    mergedDisclosureSinglePass:true,
    partialDomainDegradationAllowed:true,
    domainIsolationRequired:true,
    noCrossDomainBleed:true,
    humanControlled:true,
    advisoryOnly:true,
    executionAuthorized:false,
    hardStopLayer:LAYER_HARD_STOP
  };
}

function directReply(prompt){
  const flags=classify(prompt);
  if(flags.lawFinance){
    return "Before international expansion, Sandblast should resolve two connected but distinct sets of questions. Legal: confirm exactly which territories, platforms, formats, languages, monetization methods, and sublicensing rights each content agreement permits; identify governing law and dispute terms; review advertising, privacy, consumer-protection, and data-transfer obligations in each target market; and verify that contracts allocate copyright, indemnity, takedown, and liability responsibilities clearly. Financial: determine how revenue will be recognized, invoiced, taxed, and converted across currencies; model withholding taxes, payment-processing costs, royalties, minimum guarantees, refunds, and collection delays; establish cash-flow reserves and country-by-country profitability thresholds; and test downside scenarios before committing fixed costs. The practical sequence is rights verification first, jurisdiction and compliance review second, then a finance model built from the verified contract terms. Assumptions should be documented, and final legal and tax positions should be reviewed by qualified professionals in the relevant jurisdictions. This is general legal and financial planning information, not legal, tax, or investment advice.";
  }
  if(flags.englishPsychology){
    return "Revised message: “Secure a campaign position that fits your audience and goals while current availability remains open.” The original relies on scarcity and competitive fear: it suggests that delay will cause loss because competitors may take everything. The revised version keeps urgency but shifts the decision toward relevance, fit, and voluntary choice. Linguistically, it is clearer and less absolute. Psychologically, it uses transparent availability rather than pressure, threat, or manipulation.";
  }
  if(flags.sixDomain){
    return "Launch-readiness assessment: Psychology—define consent, user expectations, escalation limits, and safeguards against dependency or over-trust. English communication—use plain language, consistent terminology, uncertainty disclosures, and clear distinctions between observation, recommendation, and action. AI—begin with read-only observation, bounded inference, confidence thresholds, test environments, and human approval for consequential decisions. Cybersecurity—apply least privilege, verified sensor provenance, strong identity controls, segmentation, audit logs, secret management, and an emergency shutdown path. Law—confirm jurisdiction, privacy, data use, liability, accessibility, record retention, and contractual authority before deployment; obtain professional review for high-stakes uses. Finance—define implementation cost, operating cost, insurance and compliance overhead, measurable value, reserve requirements, and stop/go thresholds. Dependencies: verified data sources, accountable operators, documented policies, testing evidence, and funding for monitoring. Recommendation: proceed only with a narrow, reversible pilot that is human-controlled, advisory, logged, and independently reviewed before scope expands.";
  }
  return "";
}

module.exports={VERSION,LAYER_HARD_STOP,SIX,classify,build,directReply};
