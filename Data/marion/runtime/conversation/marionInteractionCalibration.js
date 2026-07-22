"use strict";

/**
 * Layer 11 — Adaptive Interaction Calibration
 * Produces internal response-shaping metadata. It does not invent semantic
 * content and does not replace Marion's composer or final authority.
 */
const VERSION="marion.interactionCalibration/11.0-layer11";
const CONTRACT="nyx.marion.conversation.interactionCalibration/1.0";
function isObj(v){return !!v&&typeof v==="object"&&!Array.isArray(v);}
function text(v,max=2400){try{return String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,max);}catch(_){return"";}}
function norm(v){return text(v).toLowerCase().replace(/[’‘]/g,"'");}
function first(){for(const v of arguments){const t=text(v);if(t)return t;}return"";}
function clamp01(v,f=0){const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):f;}
function emotionSignals(emotion){const e=isObj(emotion)?emotion:{};const s=isObj(e.state)?e.state:e;const support=isObj(s.support)?s.support:{};const guard=isObj(s.guard)?s.guard:{};return {emotion:first(s.primary_emotion,s.emotion,s.label,"neutral").toLowerCase(),urgency:clamp01(s.urgency||s.intensity||0),steady:/steady|calm/i.test(first(support.tone)),escalation:guard.escalation_needed===true};}
function analyzeTurn({prompt="",previous={},stage="",direction="",domain="",emotion={}}={}){
  const p=norm(prompt),prev=isObj(previous)?previous:{},es=emotionSignals(emotion);
  const direct=/\b(?:direct answer|just answer|be direct|straight answer|bottom line|no preamble|concise|briefly|keep it short)\b/.test(p);
  const deep=/\b(?:go deeper|deep dive|surgical autopsy|critical analysis|forensic|comprehensive|in detail|thorough)\b/.test(p)||stage==="deep_analysis";
  const simplify=/\b(?:plain english|simple terms|simplify|explain simply|without jargon)\b/.test(p);
  const frustration=/\b(?:frustrated|again|still not|keeps happening|we keep|same problem|not working|failed again|going in circles)\b/.test(p);
  const urgency=/\b(?:urgent|immediately|right now|critical|asap|today|before deployment|production down)\b/.test(p)||es.urgency>=0.65;
  const decision=/\b(?:what do you think|recommend|which should|should we|best option|make the call|your assessment)\b/.test(p)||stage==="prioritization";
  const technical=/\b(?:javascript|node|runtime|router|bridge|composer|envelope|adapter|module|api|http|code|index\.js|state)\b/.test(p)||domain==="technical";
  const resetProfile=stage==="social"||direction==="pivot"||direction==="branch";
  let responseLength=stage==="social"?"short":direct?"short":deep?"long":(resetProfile?"medium":first(prev.responseLength,"medium"));
  let depth=stage==="social"?"standard":deep?"deep":direct?"focused":(resetProfile?"standard":first(prev.depth,"standard"));
  let density=stage==="social"?"low":simplify?"low":technical?(deep?"high":"medium"):(resetProfile?"low":first(prev.technicalDensity,"low"));
  const warmth=frustration||es.emotion!=="neutral"?"steady":first(resetProfile?"":prev.warmth,"balanced");
  const directness=stage==="social"?"medium":direct||urgency||decision?"high":first(resetProfile?"":prev.directness,"medium");
  const confidenceRequired=decision||/\b(?:are you sure|confidence|certain)\b/.test(p);
  const responseBudget=responseLength==="short"?{sentences:4,words:140}:responseLength==="long"?{sentences:16,words:900}:{sentences:9,words:480};
  const directives=[];
  if(directness==="high")directives.push("lead_with_conclusion");
  if(deep)directives.push("show_mechanism_dependencies_and_risks");
  if(simplify)directives.push("use_plain_language");
  if(frustration)directives.push("acknowledge_once_then_resolve_root_cause");
  if(decision)directives.push("provide_recommendation_not_only_options");
  if(direction==="return")directives.push("signal_natural_return_to_previous_thread");
  if(direction==="pivot"||direction==="branch")directives.push("acknowledge_direction_change_without_exposing_state_metadata");
  return {version:VERSION,contract:CONTRACT,layer:11,responseLength,depth,technicalDensity:density,directness,warmth,urgency:urgency?"high":"normal",decisionRequired:decision,confidenceRequired,responseBudget,toneProfile:frustration?"calm_exacting":urgency?"focused_urgent":"natural_professional",acknowledgementBudget:frustration?1:0,recommendationMode:decision?"decisive":"conditional",directives,internalOnly:true};
}
function composerDirective(profile={}){const p=isObj(profile)?profile:{};const parts=[];if(p.directness==="high")parts.push("Lead with the conclusion.");if(p.depth==="deep")parts.push("Explain the mechanism, dependencies, risks, and concrete next action.");if(p.technicalDensity==="low")parts.push("Use plain language and define necessary technical terms.");if(p.decisionRequired)parts.push("Give a clear recommendation and rationale.");if(p.acknowledgementBudget===1)parts.push("Acknowledge frustration once, briefly, then move to root-cause resolution.");return parts.join(" ");}
function projectState(profile={}){const p=isObj(profile)?profile:{};return {version:VERSION,contract:CONTRACT,responseLength:text(p.responseLength,40),depth:text(p.depth,40),technicalDensity:text(p.technicalDensity,40),directness:text(p.directness,40),warmth:text(p.warmth,40),urgency:text(p.urgency,40),decisionRequired:p.decisionRequired===true,confidenceRequired:p.confidenceRequired===true,responseBudget:isObj(p.responseBudget)?p.responseBudget:{},toneProfile:text(p.toneProfile,80),directives:Array.isArray(p.directives)?p.directives.map(x=>text(x,100)).filter(Boolean).slice(0,8):[]};}
module.exports={VERSION,CONTRACT,emotionSignals,analyzeTurn,composerDirective,projectState};
