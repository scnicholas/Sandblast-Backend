"use strict";

/** Layer 26 deterministic pragmatic marker registry. */

const A = require("./marionNuanceEnvelope.js");

const VERSION = "nyx.marion.pragmaticMarkerRegistry/1.0";
const CONTRACT = "nyx.marion.pragmaticMarkers/1.0";

const FAMILIES = Object.freeze({
  knowledge_seeking: Object.freeze([
    "request_for_information", "request_for_definition", "request_for_explanation", "request_for_example",
    "request_for_comparison", "request_for_synthesis", "request_for_evidence", "request_for_critical_assessment"
  ]),
  action_operational: Object.freeze([
    "request_for_action", "request_for_plan", "request_for_procedure", "request_for_prioritization",
    "request_for_validation", "request_for_troubleshooting", "request_for_review", "request_for_revision",
    "request_for_confirmation"
  ]),
  decision_commitment: Object.freeze([
    "request_for_recommendation", "request_for_decision_support", "request_for_permission", "tentative_commitment",
    "explicit_commitment", "deferral", "rejection", "closure_request"
  ]),
  correction_challenge: Object.freeze([
    "direct_correction", "indirect_correction", "polite_disagreement", "explicit_disagreement", "skepticism",
    "challenge_to_reasoning", "challenge_to_consistency"
  ]),
  relational_emotional: Object.freeze([
    "request_for_reassurance", "request_for_support", "request_for_acknowledgement", "trust_check",
    "relationship_repair", "rapport_building"
  ]),
  conversation_control: Object.freeze([
    "implied_continuation", "return_to_previous_topic", "topic_pivot", "temporary_branch", "pace_control",
    "format_control", "scope_control", "pause_request", "reopening_request"
  ]),
  figurative_subtext: Object.freeze([
    "rhetorical_question_possible", "sarcasm_possible", "irony_possible", "humour_possible",
    "understatement_possible", "reluctant_acceptance_possible", "face_saving_language_possible",
    "hedged_intent", "implicit_priority"
  ])
});

const ALL_CATEGORIES = Object.freeze(Object.values(FAMILIES).flat());

const RULES = Object.freeze([
  { category: "request_for_information", weight: .58, patterns: [/\b(?:what files|what are|tell me about|information on|overview of)\b/i] },
  { category: "request_for_definition", weight: .74, patterns: [/^(?:what is|what does)\s+.+(?:mean)?\??$/i, /\bdefine\b/i] },
  { category: "request_for_explanation", weight: .72, patterns: [/\b(?:why|explain|how does|how is it that|what causes)\b/i] },
  { category: "request_for_example", weight: .75, patterns: [/\b(?:give|show) me (?:an |a )?example|for example|illustrate\b/i] },
  { category: "request_for_comparison", weight: .78, patterns: [/\b(?:compare|versus|vs\.?|difference between|trade[- ]?offs?)\b/i] },
  { category: "request_for_synthesis", weight: .76, patterns: [/\b(?:bring together|synthesi[sz]e|combine|integrate .* together|cohesive framework)\b/i] },
  { category: "request_for_evidence", weight: .76, patterns: [/\b(?:what evidence|what supports|how do you know|basis for|prove|show me why)\b/i] },
  { category: "request_for_critical_assessment", weight: .82, patterns: [/\b(?:critical assessment|critical analysis|surgical autopsy|weaknesses|gaps|unsparing review)\b/i] },

  { category: "request_for_action", weight: .78, patterns: [/^(?:please\s+)?(?:create|make|fix|update|address|remove|add|insert|replace|resend|deploy|run|build)\b/i] },
  { category: "request_for_plan", weight: .72, patterns: [/\b(?:plan|roadmap|implementation sequence|what are the phases|framework looks like)\b/i] },
  { category: "request_for_procedure", weight: .76, patterns: [/\b(?:exact steps|commands|procedure|how do i|how should we deploy|step by step)\b/i] },
  { category: "request_for_prioritization", weight: .8, patterns: [/\b(?:what first|which .* first|first priority|prioriti[sz]e|what should come first)\b/i] },
  { category: "request_for_validation", weight: .78, patterns: [/\b(?:validate|verify|test|did .* pass|production-ready|ready to deploy|are you sure it works)\b/i] },
  { category: "request_for_troubleshooting", weight: .84, patterns: [/\b(?:why is .* failing|debug|troubleshoot|error|500|not working|root cause|fix the issue)\b/i] },
  { category: "request_for_review", weight: .7, patterns: [/\b(?:review|look over|examine the current|check the package)\b/i] },
  { category: "request_for_revision", weight: .82, patterns: [/\b(?:redo|revise|rewrite|change this|update the existing|make the necessary changes)\b/i] },
  { category: "request_for_confirmation", weight: .68, patterns: [/^(?:is|are|did|does|do|can|will)\b/i, /\b(?:confirm|just to confirm)\b/i] },

  { category: "request_for_recommendation", weight: .78, patterns: [/\b(?:what do you recommend|which would you choose|best option|your recommendation)\b/i] },
  { category: "request_for_decision_support", weight: .72, patterns: [/\b(?:help me decide|decision criteria|weigh the options|which makes more sense)\b/i] },
  { category: "request_for_permission", weight: .66, patterns: [/\b(?:can we|may we|is it okay to|are we allowed to|safe to)\b/i] },
  { category: "tentative_commitment", weight: .65, patterns: [/\b(?:i think i(?:'m| am) going to|probably go with|leaning toward|might choose)\b/i] },
  { category: "explicit_commitment", weight: .88, patterns: [/\b(?:we(?:'re| are) going with|i(?:'ve| have) decided|the decision is|use option|we will proceed with)\b/i] },
  { category: "deferral", weight: .82, patterns: [/\b(?:leave that for|later|tomorrow|not now|put that on hold|defer)\b/i] },
  { category: "rejection", weight: .85, patterns: [/\b(?:not interested|reject|we(?:'re| are) not using|do not want|no,? not that)\b/i] },
  { category: "closure_request", weight: .8, patterns: [/\b(?:hard stop|close this|finalize|we(?:'re| are) done|stop here|freeze the baseline)\b/i] },

  { category: "direct_correction", weight: .9, patterns: [/\b(?:no[, ]|that is wrong|not what i meant|wrong file|wrong target|correct that)\b/i] },
  { category: "indirect_correction", weight: .72, patterns: [/\b(?:the focus should be|rather than|instead,? (?:we|let)|what i am looking for is)\b/i] },
  { category: "polite_disagreement", weight: .68, patterns: [/\b(?:i(?:'m| am) not sure i agree|i see it differently|i do not think that is quite right)\b/i] },
  { category: "explicit_disagreement", weight: .84, patterns: [/\b(?:i disagree|i do not agree|that conclusion is incorrect|not convinced)\b/i] },
  { category: "skepticism", weight: .72, patterns: [/\b(?:do you really think|are you sure|seriously|really production-ready|how confident are you)\b/i] },
  { category: "challenge_to_reasoning", weight: .76, patterns: [/\b(?:what makes that|why is that more|justify|how does that follow|what is your reasoning)\b/i] },
  { category: "challenge_to_consistency", weight: .8, patterns: [/\b(?:not what you said before|contradicts what you said|earlier you said|you told me before)\b/i] },

  { category: "request_for_reassurance", weight: .72, patterns: [/\b(?:are we still intact|did this destroy|should i worry|are we okay|is everything safe)\b/i] },
  { category: "request_for_support", weight: .72, patterns: [/\b(?:help me break it down|overwhelmed|struggling|need help with this|support me through)\b/i] },
  { category: "request_for_acknowledgement", weight: .62, patterns: [/\b(?:i(?:'ve| have) spent|recognize that|acknowledge|this matters to me)\b/i] },
  { category: "trust_check", weight: .74, patterns: [/\b(?:do you understand|are you sure you understand|can i trust|are you being honest|do you remember)\b/i] },
  { category: "relationship_repair", weight: .76, patterns: [/\b(?:reset and get back|same page|let(?:'s| us) reset|restore alignment|start over carefully)\b/i] },
  { category: "rapport_building", weight: .72, patterns: [/^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))(?:\s*,?\s*(?:vera|marion))?[.!?]*$/i, /\bhow are you\b/i] },

  { category: "implied_continuation", weight: .76, patterns: [/^(?:and after that|then what|what next|next|keep going|continue|from there)\??$/i] },
  { category: "return_to_previous_topic", weight: .82, patterns: [/\b(?:go back to|return to|resume|pick up where|back to marion)\b/i] },
  { category: "topic_pivot", weight: .82, patterns: [/\b(?:now let(?:'s| us) talk about|new topic|switch to|moving on to|another matter)\b/i] },
  { category: "temporary_branch", weight: .78, patterns: [/\b(?:before that|one quick question|side question|temporarily|briefly before)\b/i] },
  { category: "pace_control", weight: .82, patterns: [/\b(?:piece by piece|slow down|one at a time|bottom line|go deeper|keep it short|quickly)\b/i] },
  { category: "format_control", weight: .86, patterns: [/\b(?:point form|bullet points|table|zip package|\.zip|html file|jpeg|json|format)\b/i] },
  { category: "scope_control", weight: .84, patterns: [/\b(?:only address|for now|focus on|do not touch|remaining files|exclude|keep .* out)\b/i] },
  { category: "pause_request", weight: .86, patterns: [/\b(?:pause|stop here for now|leave it there|hold on|short pause)\b/i] },
  { category: "reopening_request", weight: .8, patterns: [/\b(?:revisit|reopen|go back and address|return to layer|look at .* again)\b/i] },

  { category: "rhetorical_question_possible", weight: .62, figurative: true, patterns: [/\b(?:how many times|who would think|what else could go wrong|isn(?:'t|’t) that obvious)\b/i] },
  { category: "sarcasm_possible", weight: .68, figurative: true, patterns: [/\b(?:great,? another|oh,? perfect|just wonderful|fantastic,? another)\b/i] },
  { category: "irony_possible", weight: .72, figurative: true, patterns: [/\b(?:the .* update .* broke|the safety .* caused the risk|the stable .* became unstable)\b/i] },
  { category: "humour_possible", weight: .74, figurative: true, patterns: [/\b(?:just kidding|kidding|joking|haha|lol|that was a joke)\b/i] },
  { category: "understatement_possible", weight: .56, figurative: true, patterns: [/\b(?:not ideal|did not go perfectly|a bit of a problem|slightly concerning)\b/i] },
  { category: "reluctant_acceptance_possible", weight: .58, figurative: true, patterns: [/^(?:fine|okay then|if we have to|i suppose so)[.!]?$/i] },
  { category: "face_saving_language_possible", weight: .52, figurative: true, patterns: [/\b(?:maybe we could look at another|perhaps another direction|it might be better to)\b/i] },
  { category: "hedged_intent", weight: .66, figurative: true, patterns: [/\b(?:might|maybe|perhaps|i think|probably|leaning toward)\b/i] },
  { category: "implicit_priority", weight: .76, figurative: true, patterns: [/\b(?:the main thing is|what matters most|above all|the priority is|most important)\b/i] }
]);

const AMBIGUOUS_MARKERS = Object.freeze([
  { marker: "fine", possibleInterpretations: ["literal_acceptance", "reluctant_acceptance_possible", "conversation_closure", "masked_disagreement"] },
  { marker: "interesting", possibleInterpretations: ["genuine_interest", "skepticism", "polite_distance"] },
  { marker: "great, another", possibleInterpretations: ["sarcasm_possible", "frustration_possible"] },
  { marker: "seriously", possibleInterpretations: ["skepticism", "urgency", "rhetorical_question_possible"] }
]);

function familyFor(category) {
  for (const [family, categories] of Object.entries(FAMILIES)) {
    if (categories.includes(category)) return family;
  }
  return "";
}

function matchPragmaticMarkers(value = "") {
  const text = A.cleanText(value);
  const matches = [];
  for (const rule of RULES) {
    const evidence = [];
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) evidence.push(`marker_${rule.category}`);
    }
    if (!evidence.length) continue;
    matches.push({
      category: rule.category,
      family: familyFor(rule.category),
      confidence: A.clamp01(rule.weight + Math.min(0.12, (evidence.length - 1) * 0.04)),
      figurative: rule.figurative === true,
      evidence
    });
  }
  matches.sort((left, right) => right.confidence - left.confidence || ALL_CATEGORIES.indexOf(left.category) - ALL_CATEGORIES.indexOf(right.category));
  return matches;
}

function registryHealth() {
  return {
    ok: ALL_CATEGORIES.length === 56,
    version: VERSION,
    contract: CONTRACT,
    familyCount: Object.keys(FAMILIES).length,
    categoryCount: ALL_CATEGORIES.length,
    ruleCount: RULES.length,
    fixedCulturalInterpretationAllowed: false
  };
}

module.exports = {
  VERSION,
  CONTRACT,
  FAMILIES,
  ALL_CATEGORIES,
  RULES,
  AMBIGUOUS_MARKERS,
  familyFor,
  matchPragmaticMarkers,
  registryHealth,
  match: matchPragmaticMarkers
};
