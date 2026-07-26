"use strict";

/** Layer 25 — Conversational Stance Resolution. */

const A = require("./marionNuanceEnvelope.js");

const VERSION = "nyx.marion.conversationalStanceResolver/1.0";
const CONTRACT = "nyx.marion.nuance.layer25/1.0";
const LAYER = 25;

const CANONICAL_STANCES = Object.freeze([
  "informative", "explanatory", "analytical", "diagnostic", "exploratory", "comparative",
  "critical_assessment", "synthesizing", "planning", "procedural", "execution_focused",
  "coordinating", "prioritizing", "corrective", "validating", "decisive", "collaborative",
  "supportive", "reassuring", "grounding", "celebratory", "restrained", "protective",
  "boundary_setting"
]);

const STANCE_MODIFIERS = Object.freeze([
  "warm", "neutral", "firm", "gentle", "concise", "detailed", "urgent", "cautious",
  "evidence_first", "action_first", "low_jargon", "high_precision", "non_confrontational",
  "risk_forward", "continuity_preserving"
]);

const STATE_STANCE = Object.freeze({
  opening: "informative",
  exploration: "exploratory",
  clarification: "explanatory",
  correction: "corrective",
  continuation: "collaborative",
  decision: "decisive",
  execution: "execution_focused",
  validation: "validating",
  disagreement: "critical_assessment",
  recovery: "diagnostic",
  closure: "restrained",
  topic_pivot: "exploratory"
});

const PATTERNS = Object.freeze({
  informative: [/\b(?:what is|what are|tell me about|overview|information about)\b/i],
  explanatory: [/\b(?:why|how does|how is|explain|break that down|what causes)\b/i],
  analytical: [/\b(?:analy[sz]e|analysis|examine|assess the relationship|break into components)\b/i],
  diagnostic: [/\b(?:debug|diagnos|surgical autopsy|root cause|why is .* failing|error|500|stack trace)\b/i],
  exploratory: [/\b(?:explore|let(?:'s| us) look at|what could|possibilities|framework could)\b/i],
  comparative: [/\b(?:compare|versus|vs\.?|difference between|trade[- ]?offs?)\b/i],
  critical_assessment: [/\b(?:critical assessment|critical analysis|weaknesses|gaps|risks|unsparing|forensic review)\b/i],
  synthesizing: [/\b(?:synthesi[sz]e|bring together|combine|integrate|cohesive framework)\b/i],
  planning: [/\b(?:plan|roadmap|implementation sequence|phases?|framework|next steps)\b/i],
  procedural: [/\b(?:exact steps|commands|procedure|how do i|how should we deploy|step by step)\b/i],
  execution_focused: [/^(?:please\s+)?(?:create|make|fix|update|address|insert|remove|replace|resend|deploy|run|build)\b/i],
  coordinating: [/\b(?:cohesion|cohesive|coordinate|work together|dependencies|merge them|integration across)\b/i],
  prioritizing: [/\b(?:what first|which .* first|priority|prioriti[sz]e|what should come first)\b/i],
  corrective: [/\b(?:no[, ]|not what i meant|that is wrong|wrong target|instead|redo|correct that|fix the current)\b/i],
  validating: [/\b(?:validate|verify|test|passed|certif|production-ready|ready to deploy)\b/i],
  decisive: [/\b(?:recommend|bottom line|which should we choose|go with|decision|conclusion)\b/i],
  collaborative: [/\b(?:let(?:'s| us)|work through|together|we should|our goal)\b/i],
  supportive: [/\b(?:help me|overwhelmed|difficult|struggling|support)\b/i],
  reassuring: [/\b(?:are we still|did this destroy|is everything intact|should i worry|are we okay)\b/i],
  grounding: [/\b(?:slow down|piece by piece|one thing at a time|step by step|focus on the current)\b/i],
  celebratory: [/\b(?:passed|great work|excellent|success|we did it|that works)\b/i],
  restrained: [/\b(?:serious|sensitive|legal risk|security incident|financial distress|keep it factual)\b/i],
  protective: [/\b(?:safety|protect|privacy|security|legal boundary|risk|structural integrity)\b/i],
  boundary_setting: [/\b(?:do not|must not|cannot|not allowed|hard boundary|limit|refuse|prohibited)\b/i]
});

function addScore(scores, reasons, stance, amount, reason) {
  if (!CANONICAL_STANCES.includes(stance)) return;
  scores[stance] = (scores[stance] || 0) + amount;
  if (!reasons[stance]) reasons[stance] = [];
  if (reason && !reasons[stance].includes(reason)) reasons[stance].push(reason);
}

function textOf(input) { return A.extractCanonicalText(input); }

function routeInfo(input = {}) {
  const source = A.safeRecord(input);
  const routing = A.safeRecord(source.routing);
  return {
    intent: A.lowerText(source.intent || routing.intent || source.canonicalIntent),
    domain: A.lowerText(source.domain || routing.domain || routing.knowledgeDomain),
    answerMode: A.lowerText(source.answerMode || routing.answerMode)
  };
}

function resolveModifiers(primary, text, phaseA, route) {
  const modifiers = [];
  const gate = A.safeRecord(phaseA.layer23);
  const state = A.cleanText(A.safeRecord(phaseA.layer24).currentState);
  const pacing = A.safeRecord(A.safeRecord(phaseA.layer21).pacing);
  const emotional = A.cleanText(A.safeRecord(A.safeRecord(phaseA.layer22).primaryCandidate).state);

  if (/\b(?:brief|concise|bottom line|short answer|no preamble)\b/i.test(text)) modifiers.push("concise");
  if (/\b(?:deep|detailed|comprehensive|in depth|thorough|surgical)\b/i.test(text)) modifiers.push("detailed");
  if (/\b(?:plain english|simple terms|low jargon)\b/i.test(text)) modifiers.push("low_jargon");
  if (/\b(?:exact|precise|structural integrity|syntax|contract|schema)\b/i.test(text) || ["diagnostic", "validating", "corrective"].includes(primary)) modifiers.push("high_precision");
  if (["diagnostic", "critical_assessment", "validating"].includes(primary)) modifiers.push("evidence_first");
  if (["execution_focused", "procedural", "prioritizing"].includes(primary)) modifiers.push("action_first");
  if (["protective", "boundary_setting"].includes(primary) || /\b(?:risk|safety|security|legal|privacy)\b/i.test(text)) modifiers.push("risk_forward");
  if (["correction", "continuation", "validation"].includes(state)) modifiers.push("continuity_preserving");
  if (state === "correction" || state === "disagreement") modifiers.push("non_confrontational");
  if (pacing.signal === "accelerate" || /\b(?:urgent|immediately|asap|right now)\b/i.test(text)) modifiers.push("urgent");
  if (gate.confidenceBand === "low" || /\b(?:uncertain|not sure|possibly|careful)\b/i.test(text)) modifiers.push("cautious");
  if (["supportive", "reassuring", "collaborative", "celebratory"].includes(primary) && !["law", "finance", "cyber"].includes(route.domain)) modifiers.push("warm");
  if (["restrained", "diagnostic", "critical_assessment", "boundary_setting"].includes(primary)) modifiers.push("neutral");
  if (primary === "boundary_setting" || /\b(?:must|hard stop|non-negotiable)\b/i.test(text)) modifiers.push("firm");
  if (["supportive", "reassuring"].includes(primary) || emotional === "overwhelmed") modifiers.push("gentle");

  return A.uniquePrimitiveStrings(modifiers.filter((item) => STANCE_MODIFIERS.includes(item)), 4, 60);
}

function resolveConversationalStance(input = {}, phaseA = {}, options = {}) {
  const text = textOf(input);
  const a = A.safeRecord(phaseA);
  const state = A.cleanText(A.safeRecord(a.layer24).currentState, "exploration");
  const route = routeInfo(input);
  const scores = {};
  const reasons = {};

  addScore(scores, reasons, STATE_STANCE[state] || "informative", 0.48, `interaction_state_${state}`);

  for (const [stance, patterns] of Object.entries(PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        addScore(scores, reasons, stance, 0.56, `explicit_marker_${stance}`);
        break;
      }
    }
  }

  if (route.intent === "technical_debug") addScore(scores, reasons, "diagnostic", 0.34, "technical_debug_intent");
  if (route.intent === "directive_response" || route.intent === "contextual_directive") addScore(scores, reasons, "execution_focused", 0.3, "directive_intent");
  if (route.intent === "emotional_support") addScore(scores, reasons, "supportive", 0.28, "support_intent");
  if (["law", "finance", "cyber"].includes(route.domain)) addScore(scores, reasons, "restrained", 0.2, "high_stakes_domain");
  if (state === "correction") addScore(scores, reasons, "corrective", 0.32, "current_turn_correction_precedence");
  if (state === "recovery") addScore(scores, reasons, "diagnostic", 0.3, "recovery_requires_fault_isolation");

  // Emotional cues may only adjust supportive secondary posture; they cannot independently select the main stance.
  const emotional = A.safeRecord(A.safeRecord(a.layer22).primaryCandidate);
  const emotionalGate = A.safeRecord(a.layer23);
  if (emotionalGate.toneAdjustmentAllowed === true && emotional.confidence >= 0.4) {
    if (["overwhelmed", "concerned", "uncertain", "frustration_possible"].includes(A.cleanText(emotional.state))) {
      addScore(scores, reasons, "supportive", 0.08, "confidence_gated_emotional_modifier");
      addScore(scores, reasons, "grounding", 0.07, "confidence_gated_emotional_modifier");
    }
  }

  const ranked = Object.entries(scores)
    .map(([stance, score]) => ({ stance, score: A.clamp01(score), reasons: reasons[stance] || [] }))
    .sort((left, right) => right.score - left.score || CANONICAL_STANCES.indexOf(left.stance) - CANONICAL_STANCES.indexOf(right.stance));

  const primary = ranked[0] || { stance: "informative", score: 0.4, reasons: ["safe_default"] };
  const secondaryStances = ranked.slice(1).filter((item) => item.score >= 0.3).slice(0, 2).map((item) => item.stance);
  const modifiers = resolveModifiers(primary.stance, text, a, route);

  return {
    contract: CONTRACT,
    version: VERSION,
    layer: LAYER,
    status: "ready",
    available: true,
    degraded: false,
    turnId: A.extractTurnId(input, options.turnId),
    primaryStance: primary.stance,
    secondaryStances,
    modifiers,
    confidence: Number(A.clamp01(primary.score).toFixed(3)),
    selectionBasis: A.uniquePrimitiveStrings(primary.reasons, 8, 100),
    responsePostureSeed: {
      directness: ["corrective", "decisive", "execution_focused", "boundary_setting"].includes(primary.stance) ? 0.82 : 0.62,
      warmth: ["supportive", "reassuring", "collaborative", "celebratory"].includes(primary.stance) ? 0.7 : 0.42,
      challenge: ["critical_assessment", "analytical", "diagnostic"].includes(primary.stance) ? 0.62 : 0.18,
      reassurance: primary.stance === "reassuring" ? 0.68 : 0.12,
      explanationDepth: modifiers.includes("detailed") ? "detailed" : modifiers.includes("concise") ? "concise" : "focused"
    },
    safeguards: {
      semanticAuthorityChanged: false,
      factualAuthorityChanged: false,
      routeAuthorityChanged: false,
      approvalAuthorityCreated: false,
      executionAuthorityCreated: false,
      emotionalCueAloneSelectedPrimaryStance: false,
      sycophancyAllowed: false
    }
  };
}

module.exports = {
  VERSION,
  CONTRACT,
  LAYER,
  CANONICAL_STANCES,
  STANCE_MODIFIERS,
  resolveConversationalStance,
  resolve: resolveConversationalStance,
  analyze: resolveConversationalStance,
  run: resolveConversationalStance
};
