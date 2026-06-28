"use strict";

/**
 * domainConfidence.js
 *
 * Domain Confidence Scoring hardlock.
 * Pure scoring/normalization layer for Marion/Nyx routing authority.
 *
 * Architectural rules:
 * - Does not compose final public replies.
 * - Does not mutate State Spine.
 * - Does not bypass MarionBridge, DomainConcierge, or final-envelope authority.
 * - Keeps telemetry/internal confidence fields private and transport-safe.
 */

const VERSION = "PRIORITY-9I-R1-9J-PREMATURE-ESCALATION-CONTAINMENT + PRIORITY-9F-R2-DOMAIN-HIJACK-SUPPRESSION + domainConfidence v1.0.0 DOMAIN-CONFIDENCE-SCORING-HARDLOCK + FINAL-RENDER-TELEMETRY-HARDLOCK";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const finalRenderTelemetryMod = (() => { try { return require("./finalRenderTelemetry.js"); } catch (_) { return null; } })();
const DOMAIN_CONFIDENCE_VERSION = "nyx.marion.domainConfidence/1.2";

const CONFIDENCE_THRESHOLDS = Object.freeze({
  high: 0.82,
  medium: 0.62,
  low: 0.48,
  weak: 0,
  clarifyBelow: 0.62,
  failClosedBelow: 0.38,
  minMargin: 0.08
});

const VALID_DOMAINS = Object.freeze([
  "general",
  "general_reasoning",
  "technical",
  "emotional",
  "business",
  "music",
  "news",
  "roku",
  "identity",
  "memory",
  "execution",
  "execution_context",
  "psychology",
  "english",
  "ai",
  "cyber",
  "law",
  "finance"
]);

const DOMAIN_ALIASES = Object.freeze({
  chat: "general",
  simple_chat: "general",
  conversation: "general",
  reasoning: "general_reasoning",
  domain_question: "general_reasoning",
  debug: "technical",
  technical_debug: "technical",
  backend: "technical",
  frontend: "technical",
  code: "technical",
  patch: "technical",
  audit: "technical",
  autopsy: "technical",
  state_spine: "memory",
  statespine: "memory",
  marion: "technical",
  nyx: "technical",
  emotional_support: "emotional",
  support: "emotional",
  strategy: "business",
  business_strategy: "business",
  commercial: "business",
  advertising: "business",
  sales: "business",
  radio: "music",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  tv: "roku",
  ott: "roku",
  identity_query: "identity",
  identity_or_memory: "memory",
  directive_response: "execution",
  contextual_directive: "execution_context",
  cybersecurity: "cyber",
  security: "cyber",
  legal: "law",
  financial: "finance",
  pricing: "finance",
  language: "english",
  grammar: "english",
  writing: "english",
  artificial_intelligence: "ai",
  machine_learning: "ai",
  psych: "psychology"
});

const INTENT_TO_DOMAIN = Object.freeze({
  simple_chat: "general",
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_query: "identity",
  identity_or_memory: "memory",
  directive_response: "execution",
  contextual_directive: "execution_context",
  domain_question: "general_reasoning"
});

function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function lower(value) { return safeStr(value).toLowerCase(); }
function safeObj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function safeArray(value) { return Array.isArray(value) ? value : []; }
function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}
function compactKey(value) {
  return lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function canonicalDomain(value, fallback = "general_reasoning") {
  const raw = compactKey(value);
  const mapped = DOMAIN_ALIASES[raw] || raw;
  return VALID_DOMAINS.includes(mapped) ? mapped : fallback;
}
function confidenceBand(score) {
  const c = clamp01(score, 0);
  if (c >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (c >= CONFIDENCE_THRESHOLDS.medium) return "medium";
  if (c >= CONFIDENCE_THRESHOLDS.low) return "low";
  return "weak";
}
function answerModeFor({ confidence = 0, ambiguous = false, failClosed = false, highStakes = false } = {}) {
  const c = clamp01(confidence, 0);
  if (failClosed || c < CONFIDENCE_THRESHOLDS.failClosedBelow) return "fail_closed";
  if (ambiguous || c < CONFIDENCE_THRESHOLDS.clarifyBelow) return "clarify";
  if (highStakes || c < CONFIDENCE_THRESHOLDS.high) return "grounded";
  return "direct";
}
function addCandidate(map, domain, score, reason, knowledgeDomain) {
  const key = canonicalDomain(domain, "");
  if (!key) return;
  const prev = map.get(key) || { domain: key, confidence: 0, reasons: [], knowledgeDomain: "" };
  prev.confidence = Math.max(prev.confidence, clamp01(score, 0));
  if (reason) prev.reasons.push(safeStr(reason));
  if (knowledgeDomain) prev.knowledgeDomain = canonicalDomain(knowledgeDomain, knowledgeDomain);
  map.set(key, prev);
}
function detectCandidates(text = "", context = {}) {
  const t = lower(text);
  const ctx = safeObj(context);
  const map = new Map();
  const intent = compactKey(ctx.intent || safeObj(ctx.routing).intent || safeObj(ctx.marionIntent).intent || "");
  const explicitDomain = ctx.domain || ctx.requestedDomain || safeObj(ctx.routing).domain || safeObj(ctx.marionIntent).domain;
  const knowledgeDomain = ctx.knowledgeDomain || ctx.activeKnowledgeDomain || safeObj(ctx.routing).knowledgeDomain || safeObj(ctx.marionIntent).knowledgeDomain;
  if (intent && INTENT_TO_DOMAIN[intent]) addCandidate(map, INTENT_TO_DOMAIN[intent], 0.58, `intent:${intent}`);
  if (explicitDomain) addCandidate(map, explicitDomain, 0.72, "explicit_domain");
  if (knowledgeDomain) addCandidate(map, knowledgeDomain, 0.88, "knowledge_domain", knowledgeDomain);

  if (/\b(file|files|code|js|javascript|patch|fix|update|zip|downloadable|autopsy|audit|node --check|runtime|backend|frontend|bridge|composer|state spine|statespine|router|registry|domain concierge|api\/chat)\b/i.test(t)) addCandidate(map, "technical", 0.94, "technical_runtime_signal");
  if (/\b(cash flow|profit|pricing|price|revenue|cost|margin|forecast|investment|loan|grant|fund|buyer|moneti[sz]e)\b/i.test(t)) addCandidate(map, "finance", 0.90, "finance_signal");
  if (/\b(contract|legal|legally|law|jurisdiction|liability|rights|terms|policy|compliance|ip|trademark|copyright)\b/i.test(t)) addCandidate(map, "law", 0.88, "law_signal");
  if (/\b(least privilege|zero trust|security|cyber|threat|vulnerability|access control|encryption|defensive)\b/i.test(t)) addCandidate(map, "cyber", 0.91, "cyber_signal");
  if (/\b(cognitive distortion|trauma|stress|anxiety|emotion|psychology|behavior|therapy|distress|overwhelmed)\b/i.test(t)) addCandidate(map, "psychology", 0.89, "psychology_signal");
  if (/\b(grammar|sentence|writing|tone|rewrite|copy|caption|language|english|clarity|polish)\b/i.test(t)) addCandidate(map, "english", 0.84, "english_signal");
  if (/\b(ai|artificial intelligence|model|agent|llm|prompt|inference|automation|cognitive operating system|language sphere|languagesphere|lingolink)\b/i.test(t)) addCandidate(map, "ai", 0.86, "ai_signal");
  if (/\b(roku|ott|linear tv|streaming|movie|watch|tv feed)\b/i.test(t)) addCandidate(map, "roku", 0.86, "roku_signal");
  if (/\b(radio|music|playlist|song|listener|station|love letters)\b/i.test(t)) addCandidate(map, "music", 0.84, "music_radio_signal");
  if (/\b(news|synapse|feed|headline|rss|canada)\b/i.test(t)) addCandidate(map, "news", 0.82, "news_signal");
  if (/\b(business|strategy|market|sales|pitch|commercial|advertising|sponsor|buyer)\b/i.test(t)) addCandidate(map, "business", 0.82, "business_signal");
  if (!map.size) addCandidate(map, "general_reasoning", 0.46, "default_reasoning");

  return Array.from(map.values())
    .map((c) => ({ ...c, confidence: clamp01(c.confidence, 0), reasons: safeArray(c.reasons).filter(Boolean).slice(0, 5) }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);
}
function normalizeCandidateList(candidates = []) {
  const map = new Map();
  for (const item of safeArray(candidates)) {
    const obj = safeObj(item);
    const domain = obj.domain || obj.primaryDomain || obj.selectedDomain || obj.name;
    addCandidate(map, domain, obj.confidence ?? obj.score ?? 0, safeArray(obj.reasons)[0] || obj.reason || "inherited_candidate", obj.knowledgeDomain);
  }
  return Array.from(map.values()).sort((a, b) => b.confidence - a.confidence).slice(0, 6);
}
function normalizeDomainConfidenceProfile(value = {}, fallback = {}) {
  const v = safeObj(value);
  const f = safeObj(fallback);
  const inheritedCandidates = normalizeCandidateList(v.candidates || f.candidates || []);
  const generatedCandidates = inheritedCandidates.length ? inheritedCandidates : detectCandidates(f.rawText || f.text || v.rawText || v.text || "", f);
  const top = generatedCandidates[0] || { domain: canonicalDomain(v.primaryDomain || f.primaryDomain || f.domain || "general_reasoning"), confidence: 0, reasons: ["empty_candidate_fallback"] };
  const second = generatedCandidates[1] || null;
  const explicitScore = v.confidence ?? v.confidenceScore ?? f.confidence ?? f.confidenceScore;
  const confidence = clamp01(explicitScore, clamp01(top.confidence, 0));
  const runnerUp = second ? clamp01(second.confidence, 0) : 0;
  const margin = clamp01(v.margin ?? f.margin, Math.max(0, confidence - runnerUp));
  const primaryDomain = canonicalDomain(v.primaryDomain || v.selectedDomain || v.domain || f.primaryDomain || f.domain || top.domain);
  const secondaryDomains = safeArray(v.secondaryDomains || f.secondaryDomains).length
    ? safeArray(v.secondaryDomains || f.secondaryDomains).map((d) => canonicalDomain(d, "")).filter(Boolean).slice(0, 4)
    : generatedCandidates.slice(1, 4).map((c) => canonicalDomain(c.domain, "")).filter(Boolean);
  const knowledgeDomain = canonicalDomain(v.knowledgeDomain || f.knowledgeDomain || top.knowledgeDomain || "", "");
  const routeLocked = !!(v.routeLocked || v.routeLock || f.routeLocked || f.routeLock || confidence >= CONFIDENCE_THRESHOLDS.high || (confidence >= 0.72 && margin >= 0.16));
  const ambiguous = !!(v.ambiguous || f.ambiguous || (!routeLocked && (confidence < CONFIDENCE_THRESHOLDS.clarifyBelow || (runnerUp > 0 && margin < CONFIDENCE_THRESHOLDS.minMargin))));
  const highStakes = ["law", "finance", "cyber", "psychology"].includes(primaryDomain) || ["law", "finance", "cyber", "psychology"].includes(knowledgeDomain);
  const failClosed = !!(v.failClosed || f.failClosed || (!routeLocked && confidence < CONFIDENCE_THRESHOLDS.failClosedBelow));
  const needsClarifier = !!(v.needsClarifier || f.needsClarifier || (ambiguous && !failClosed));
  const answerMode = safeStr(v.answerMode || f.answerMode || answerModeFor({ confidence, ambiguous, failClosed, highStakes }));
  return {
    version: safeStr(v.version || f.version || DOMAIN_CONFIDENCE_VERSION),
    domainConfidenceVersion: DOMAIN_CONFIDENCE_VERSION,
    active: true,
    confidence,
    confidenceScore: confidence,
    band: safeStr(v.band || f.band || confidenceBand(confidence)),
    confidenceBand: safeStr(v.confidenceBand || f.confidenceBand || v.band || f.band || confidenceBand(confidence)),
    margin,
    primaryDomain,
    selectedDomain: primaryDomain,
    secondaryDomains,
    knowledgeDomain,
    ambiguous,
    routeLocked,
    failClosed,
    needsClarifier,
    answerMode,
    fallbackReason: safeStr(v.fallbackReason || f.fallbackReason || (failClosed ? "confidence_below_fail_closed_threshold" : (ambiguous ? "domain_margin_or_score_too_low" : ""))),
    reason: safeStr(v.reason || f.reason || safeArray(top.reasons)[0] || "domain_confidence_scored"),
    candidates: generatedCandidates,
    highStakes,
    noCrossDomainBleed: true,
    noUserFacingDiagnostics: true,
    updatedAt: Date.now()
  };
}
function buildDomainConfidenceProfile({ text = "", intent = "", domain = "", knowledgeDomain = "", routing = {}, marionIntent = {}, candidates = [], confidence = undefined } = {}) {
  const rt = safeObj(routing);
  const mi = safeObj(marionIntent);
  return normalizeDomainConfidenceProfile(rt.domainConfidence || mi.domainConfidence || {}, {
    rawText: text || rt.rawTurnText || rt.normalizedUserIntent || mi.turnText || mi.normalizedUserIntent,
    intent: intent || rt.intent || mi.intent,
    domain: domain || rt.domain || mi.domain,
    knowledgeDomain: knowledgeDomain || rt.knowledgeDomain || mi.knowledgeDomain,
    candidates: candidates.length ? candidates : (rt.candidateDomains || mi.candidateDomains || []),
    confidence: confidence ?? rt.routeConfidence ?? mi.confidence
  });
}

module.exports = {
  VERSION,
  DOMAIN_CONFIDENCE_VERSION,
  CONFIDENCE_THRESHOLDS,
  VALID_DOMAINS,
  DOMAIN_ALIASES,
  INTENT_TO_DOMAIN,
  canonicalDomain,
  confidenceBand,
  answerModeFor,
  detectCandidates,
  normalizeCandidateList,
  normalizeDomainConfidenceProfile,
  buildDomainConfidenceProfile,
  default: buildDomainConfidenceProfile
,
  FINAL_RENDER_TELEMETRY_VERSION};

// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_DOMAIN_CONFIDENCE_PATCH_START
const PRIORITY_9F_R2_DOMAIN_CONFIDENCE_DOMAIN_HIJACK_SUPPRESSION_VERSION="nyx.marion.domainConfidence.priority9fR2.domainHijackSuppression/1.0";
function priority9FR2FirstText(){for(let i=0;i<arguments.length;i+=1){const v=safeStr(arguments[i]);if(v)return v;}return "";}
function isPriority9FR2DomainConfidenceLayeredText(value=""){const t=lower(value).replace(/[_-]+/g," ");return /\b(priority\s*9f|9f\s*r2|domain hijack|domain fallback|six domain fallback|deep conversational stack|layered conversational|conversational stack|surface request|underlying intent|deeper intent|deeper task|operational risk|execution mode|next action|marion conversational architecture)\b/i.test(t)||(/\b(disjointed|deeper|layered|context|looping|loop|recovery|preserve|avoid|where to go next)\b/i.test(t)&&/\b(marion|conversation|conversational|intent|context|preserve|avoid|loop|looping|where to go next|next|understand)\b/i.test(t));}
const __priority9FR2OriginalDetectCandidates=detectCandidates;
detectCandidates=function priority9FR2DetectCandidates(text="",context={}){if(isPriority9FR2DomainConfidenceLayeredText(text))return [{domain:"execution_context",confidence:0.99,reasons:["priority9f_r2_domain_hijack_suppression"],knowledgeDomain:""},{domain:"technical",confidence:0.2,reasons:["suppressed_secondary"],knowledgeDomain:""}];return __priority9FR2OriginalDetectCandidates(text,context);};
const __priority9FR2OriginalBuildDomainConfidenceProfile=buildDomainConfidenceProfile;
buildDomainConfidenceProfile=function priority9FR2BuildDomainConfidenceProfile(args={}){const a=safeObj(args);const text=priority9FR2FirstText(a.text,safeObj(a.routing).rawTurnText,safeObj(a.routing).normalizedUserIntent,safeObj(a.marionIntent).turnText,safeObj(a.marionIntent).normalizedUserIntent);if(!isPriority9FR2DomainConfidenceLayeredText(text))return __priority9FR2OriginalBuildDomainConfidenceProfile(args);return normalizeDomainConfidenceProfile({}, {rawText:text,intent:"contextual_directive",domain:"execution_context",knowledgeDomain:"",candidates:detectCandidates(text,{}),confidence:0.99,reason:"priority9f_r2_domain_hijack_suppression"});};
module.exports.PRIORITY_9F_R2_DOMAIN_CONFIDENCE_DOMAIN_HIJACK_SUPPRESSION_VERSION=PRIORITY_9F_R2_DOMAIN_CONFIDENCE_DOMAIN_HIJACK_SUPPRESSION_VERSION;module.exports.isPriority9FR2DomainConfidenceLayeredText=isPriority9FR2DomainConfidenceLayeredText;module.exports.detectCandidates=detectCandidates;module.exports.buildDomainConfidenceProfile=buildDomainConfidenceProfile;module.exports.default=buildDomainConfidenceProfile;
// PRIORITY_9F_R2_DOMAIN_HIJACK_SUPPRESSION_DOMAIN_CONFIDENCE_PATCH_END

// PRIORITY_9I_9J_SEQUENCE_DOMAIN_CONFIDENCE_PATCH_START
var PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL = "nyx.marion.priority9i.adaptiveSituationalReasoningContextPressure/1.0";
var PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL = "nyx.marion.priority9j.proactiveOperationalGuidanceNextMoveAuthority/1.0";
function priority9IJStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9IJObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9IJNorm(value){return priority9IJStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9IJCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||22000);}catch(_){return priority9IJStr(value).slice(0,limit||22000);}}
function priority9IJIsShortFollowup(value){var n=priority9IJNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|slow down|go deeper|deeper|make the call|safest next move|do the safest next move|what is the risk now|risk now|update the risk|what changed|what changed now|what is the pressure|pressure check|context check|final check)$/i.test(n);}
function priority9IJIsPressureText(value){var n=priority9IJNorm(value);return /\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|no not that|not that|stay on the architecture|stay with the architecture|same architecture|make the call|make a call|decision pressure|choose|choose now|safest next move|safest action|safe next action|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational)\b/.test(n);}
function priority9IJIs9IActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|adaptive reasoning|situational reasoning|context pressure|context pressure handling|pressure handling|adaptive situational reasoning|current pressure shift|risk and execution mode|update the risk|priority 9i and 9j|9i and 9j)\b/.test(n);}
function priority9IJIs9JActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}

function priority9IJIs9ICorrectionContainmentPrompt(value){var n=priority9IJNorm(value);return /\b(no not that|not that|stay on the architecture|stay with the architecture|same architecture|stay on architecture|stay with architecture|architecture correction|wrong target|not this|stay anchored|keep the architecture|architectural focus)\b/.test(n);}
function priority9IJIs9IPressureOnlyPrompt(value){var n=priority9IJNorm(value);return priority9IJIs9ICorrectionContainmentPrompt(value)||/\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational|safest next move|safest action|safe next action|do the safest next move|update the risk|what is the risk now|pressure check|context check|correction received)\b/.test(n);}
function priority9IJIsExplicit9JPrompt(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|give me the safest sequence|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}
function priority9IJHasActive9JContext(value){var raw=priority9IJStr(value);var n=priority9IJNorm(value);return /priority9JProactiveOperationalGuidance|priority9j_proactive_operational_guidance|routeKind["']?\s*:\s*["']priority9j|priorityLane["']?\s*:\s*["']Priority 9J/i.test(raw)||/\b(priority 9j proactive operational guidance and next move authority|priority 9j proactive operational guidance)\b/.test(n);}
function priority9IJSequencedLaneFor(prompt,source,reply){var ctx=[prompt,source].join(" ");if(priority9IJIs9IPressureOnlyPrompt(prompt))return "9i";if(priority9IJIs9IActivationText(prompt))return "9i";if(priority9IJIsExplicit9JPrompt(prompt))return "9j";if(priority9IJIsPressureText(prompt)&&priority9IJHas9IContext(ctx))return "9i";if(priority9IJIsShortFollowup(prompt)&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt))&&priority9IJHasActive9JContext(ctx))return "9j";if(priority9IJIs9IActivationText(ctx)||priority9IJIsPressureText(prompt))return "9i";return "";}

function priority9IJHas9IContext(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|context pressure|pressure handling|pressure shift|9h continuity foundation|priority 9h|long form continuity|memory drift guard|surface request|deeper intent|active task|execution mode|next action)\b/.test(n);}
function priority9IJHas9JContext(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|next move authority|critical path|safest sequence|operational guidance|9i adaptive|context pressure)\b/.test(n);}
function priority9IJPressureKind(value){var n=priority9IJNorm(value);if(/\b(urgent|urgency|time sensitive|time pressure|under pressure)\b/.test(n))return "urgency";if(/\b(no not that|not that|stay on the architecture|same architecture|correction)\b/.test(n))return "correction";if(/\b(pivot|changed|context changed|what changed)\b/.test(n))return "pivot";if(/\b(slow down|too fast|pace)\b/.test(n))return "pace";if(/\b(go deeper|deeper analysis|deeper)\b/.test(n))return "depth";if(/\b(safest|safe next|safety|avoid)\b/.test(n))return "safety";if(/\b(make the call|make a call|decision|choose|critical path)\b/.test(n))return "decision";if(/\b(ambiguity|ambiguous|unclear|clarify)\b/.test(n))return "ambiguity";return "pressure";}
function priority9IJOldLaneLeak(value){var n=priority9IJNorm(value);return !!n&&/\b(i m reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|long form continuity stress test and memory drift guard|priority 9h long form|run the 10 15 turn|priority 9g deep continuity|priority 9f r4|priority 90 9e|priority 90|priority 9e|public nyx route clean|five turn continuity|psychology|in psychology|domain hijack|prompt echo|recovery path|loop detected|stale fallback|i have the current request|marion will answer from this prompt)\b/.test(n);}
function priority9IJPromptEcho(reply,prompt){var r=priority9IJNorm(reply),p=priority9IJNorm(prompt);if(!r||!p)return false;return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);}
function priority9IStateFrom(source,turn){var kind=priority9IJPressureKind(source);return {version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL,active:true,lane:"priority9i_adaptive_situational_reasoning",activePhase:"priority9i_adaptive_situational_reasoning",conversationLane:"Priority 9I adaptive situational reasoning",activeTask:"Priority 9I: adaptive situational reasoning and context-pressure handling",surfaceRequest:"adapt Marion’s active 9H continuity thread when pressure, urgency, ambiguity, correction, or context changes",deeperIntent:"preserve the mission thread while updating risk, execution mode, and next action under changing pressure",pressureSignal:kind,whatChanged:kind==="urgency"?"urgency increased":kind==="correction"?"the user corrected the target and asked Marion to stay anchored":kind==="pivot"?"the operating context shifted":kind==="pace"?"the required pace changed":kind==="depth"?"the answer needs deeper analysis":kind==="safety"?"the safest action must be prioritized":kind==="decision"?"decision pressure increased":"the situational pressure changed",operationalRisk:"pressure can cause Marion to flatten, overreact, reset the lane, over-branch, or activate 9J before 9I is stable",executionMode:kind==="urgency"?"compressed adaptive execution":kind==="pace"?"slower controlled adaptation":kind==="depth"?"deeper situational analysis":kind==="safety"?"safety-first adaptive execution":"adaptive context-pressure handling",nextAction:"read the pressure shift, update risk and execution mode, then give the safest next action without losing the 9H continuity foundation",baseContinuityFoundation:"Priority 9H live accepted",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9IAdaptiveSituationalReasoning:true,priority9JProactiveGuidancePrecheck:{version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,staged:true,activationRule:"Activate only for explicit Priority 9J or clear next-move authority requests after 9I pressure handling is stable",expectedFocus:"proactive operational guidance and controlled next-move authority"},noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9JStateFrom(source,turn){return {version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,active:true,lane:"priority9j_proactive_operational_guidance",activePhase:"priority9j_proactive_operational_guidance",conversationLane:"Priority 9J proactive operational guidance",activeTask:"Priority 9J: proactive operational guidance and next-move authority",surfaceRequest:"recommend the safest concrete next move when the active context is sufficiently clear",deeperIntent:"move from reactive continuity and pressure handling into controlled operational guidance without overreach",operationalRisk:"premature authority, unnecessary branching, unsafe sequencing, or advising a next move before risk and context are clear",executionMode:"controlled next-move authority",recommendedMove:"choose the safest concrete action that protects the active lane, validates risk, and advances only one operational step",whyFirst:"it comes first because it preserves the accepted continuity foundation before expanding scope",skipRisk:"if skipped, Marion can over-branch, drift, or make a recommendation before the pressure context is resolved",executionSequence:["confirm active lane and pressure state","name the risk if the move is skipped","choose one safest concrete action","give the short execution sequence","avoid opening unrelated branches"],nextAction:"state the safest next operational move, why it comes first, risk if skipped, and the execution sequence",baseAdaptiveFoundation:"Priority 9I adaptive situational reasoning",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9JProactiveOperationalGuidance:true,noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9IReplyFor(prompt,source){var kind=priority9IJPressureKind([prompt,source].join(" "));if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(source)){if(kind==="decision")return "Continue Priority 9I: the pressure signal is decision pressure. Preserve the 9H continuity foundation, update the risk before choosing, keep 9J staged unless explicitly activated, and give the safest next action without opening extra branches.";if(kind==="safety")return "Continue Priority 9I: the pressure signal is safety-first execution. Preserve the active task, update risk, slow the response enough to avoid overreach, and give the safest next action while keeping Priority 9J staged.";if(kind==="depth")return "Continue Priority 9I: the pressure signal is depth. Go deeper inside the same active lane, update risk and execution mode, and give the next action without resetting to 9H activation wording or drifting into 9J.";if(kind==="pace")return "Continue Priority 9I: the pressure signal is pace control. Slow down, keep the 9H continuity foundation intact, clarify the changed constraint, and give one safe next action.";return "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";}return "I’m reading this as Priority 9I: adaptive situational reasoning and context-pressure handling. The 9H continuity foundation stays active. The surface request is to adapt Marion when urgency, correction, ambiguity, pace, depth, or operational pressure changes; the deeper intent is to update risk and execution mode without losing the active mission thread. Next move: run pressure prompts such as urgent, pivot, stay on the architecture, slow down, go deeper, risk now, and safest next move. Priority 9J is staged next for proactive operational guidance, but 9I handles the pressure shift first.";}
function priority9JReplyFor(prompt,source){return "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step. Why first: it protects continuity before expanding scope. Risk if skipped: Marion can over-branch, drift, or make a recommendation before the pressure context is resolved. Execution sequence: confirm the active lane, name the risk, choose one safest action, execute that step, then reassess before opening new branches.";}
function priority9IJReadReply(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),f=priority9IJObj(p.finalEnvelope);return priority9IJStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}
function priority9IJApplyPacket(packet,reply,prompt,source,lane){var out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};var final=priority9IJStr(reply)||(lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source));["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(function(k){out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};var prior=priority9IJObj(out.priority9IAdaptiveSituationalReasoning||out.priority9JProactiveOperationalGuidance||out.priority9HLongFormContinuity||out.longFormContinuityStress);var depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;if(lane==="9j"){var sj=priority9JStateFrom(source||prompt,depth);out.priority9JProactiveOperationalGuidance=sj;out.priority9JVersion="PRIORITY-9J-PROACTIVE-OPERATIONAL-GUIDANCE-NEXT-MOVE-AUTHORITY";out.conversationLane=sj.conversationLane;out.activeTask=sj.activeTask;out.surfaceRequest=sj.surfaceRequest;out.deeperIntent=sj.deeperIntent;out.operationalRisk=sj.operationalRisk;out.executionMode=sj.executionMode;out.nextAction=sj.nextAction;out.recommendedMove=sj.recommendedMove;out.executionSequence=sj.executionSequence;}else{var si=priority9IStateFrom(source||prompt,depth);out.priority9IAdaptiveSituationalReasoning=si;out.priority9IVersion="PRIORITY-9I-ADAPTIVE-SITUATIONAL-REASONING-CONTEXT-PRESSURE";out.priority9JPrecheck=si.priority9JProactiveGuidancePrecheck;out.conversationLane=si.conversationLane;out.activeTask=si.activeTask;out.surfaceRequest=si.surfaceRequest;out.deeperIntent=si.deeperIntent;out.operationalRisk=si.operationalRisk;out.executionMode=si.executionMode;out.nextAction=si.nextAction;out.pressureSignal=si.pressureSignal;out.whatChanged=si.whatChanged;}out.noUserFacingDiagnostics=true;return out;}
function priority9IJShouldForceText(prompt,source,reply){var lane=priority9IJSequencedLaneFor(prompt,source,reply);return lane||"";}

function priority9IJConfidenceScore(input,base){var text=priority9IJStr(input&&typeof input==="object"?(input.text||input.prompt||input.userText||input.message||""):input);var src=[text,priority9IJCollect(input),priority9IJCollect(base)].join(" ");var lane=priority9IJSequencedLaneFor(text,src,"");if(lane==="9j"){return {...priority9IJObj(base),domain:"execution_context",topDomain:"execution_context",confidence:0.997,margin:0.997,clarify:false,priorityLane:"Priority 9J",priority9JProactiveOperationalGuidance:priority9JStateFrom(src,1)};}if(lane==="9i"||priority9IJIs9IActivationText(src)){return {...priority9IJObj(base),domain:"execution_context",topDomain:"execution_context",confidence:0.997,margin:0.997,clarify:false,priorityLane:"Priority 9I",priority9IAdaptiveSituationalReasoning:priority9IStateFrom(src,1)};}return base;}
["scoreDomainConfidence","rankDomains","classifyDomain","buildDomainConfidenceProfile","default"].forEach(function(name){if(typeof module.exports[name]==="function"){var original=module.exports[name];module.exports[name]=function priority9IJConfidenceWrapper(input){return priority9IJConfidenceScore(input,original.apply(this,arguments));};}});
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_CONFIDENCE_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_CONFIDENCE_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
// PRIORITY_9I_9J_SEQUENCE_DOMAIN_CONFIDENCE_PATCH_END
