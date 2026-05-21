"use strict";

/**
 * QuestionShapeNormalizer.js
 *
 * Purpose:
 * - Normalize loose user question phrasing before Marion intent routing.
 * - Convert natural shorthand like "tell me about cash flow" into "cash flow".
 * - Preserve technical/directive requests so backend patch commands are not misread as topic requests.
 * - Keep Nyx/Marion routing stable without changing final-response authority.
 */

const QUESTION_SHAPE_NORMALIZATION_VERSION = "nyx.marion.questionShapeNormalization/1.0";

const EXECUTION_OR_TECHNICAL_GUARD = /\b(file|files|zip|download|resend|update|patch|fix|replace|audit|autopsy|line[-\s]?by[-\s]?line|structural integrity|architecture|deploy|validate|node --check|backend|frontend|widget|script|code|html|css|javascript|js|api\/chat|runtime|router|composer|state spine|statespine|marion|nyx|nix|nixon|marionbridge|chatengine|composemarionresponse|intent router|domain registry|question shape normalizer|question-shape normalizer)\b/i;

const TOPIC_PREFIX_PATTERNS = Object.freeze([
  {
    rx: /^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?tell me(?:\s+something)?\s+about\s+(.+)$/i,
    reason: "tell_me_about"
  },
  {
    rx: /^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?give me\s+(?:something|some info|information|a quick overview|an overview)\s+(?:about|on|regarding|for)\s+(.+)$/i,
    reason: "give_me_about"
  },
  {
    rx: /^(?:please\s+)?(?:can you\s+|could you\s+|would you\s+)?(?:explain|describe|define|break down)\s+(.+)$/i,
    reason: "explain_or_define"
  },
  {
    rx: /^(?:please\s+)?(?:i want to know|i wanna know|i need to understand|i'd like to know|i would like to know)\s+(?:about|what|how)?\s*(.+)$/i,
    reason: "want_to_know"
  },
  {
    rx: /^(?:please\s+)?what\s+(?:is|are)\s+(.+)$/i,
    reason: "what_is"
  },
  {
    rx: /^(?:please\s+)?what\s+does\s+(.+?)\s+mean$/i,
    reason: "what_does_mean"
  },
  {
    rx: /^(?:please\s+)?how\s+does\s+(.+?)\s+work$/i,
    reason: "how_does_work"
  }
]);

function safeStr(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function lower(value) {
  return safeStr(value).toLowerCase();
}

function compactWhitespace(value) {
  return safeStr(value).replace(/\s+/g, " ").trim();
}

function normalizeRouterVoiceTextParity(text = "") {
  return safeStr(text)
    .replace(/\b(nick|nix|mix|mike|nixon)\b/gi, "Nyx")
    .replace(/\b(state\s+line|state\s+sign|statespine|state\s+spine)\b/gi, "State Spine")
    .replace(/\b(chad\s+engine|chat\s+engine)\b/gi, "ChatEngine")
    .replace(/\b(mary\s+bridge|marian\s+bridge|marion\s+bridge)\b/gi, "MarionBridge")
    .replace(/\b(compose\s+marion\s+response|composed\s+marion\s+response|compose\s+marian\s+response|composed\s+marian\s+response|compose\s+mailing\s+response|composed\s+mailing\s+response)\b/gi, "ComposeMarionResponse")
    .replace(/\b(nex\s+steps|neck\s+steps)\b/gi, "Next steps")
    .replace(/\b(mic\s*tech|mike\s*tech|mike\s*text|mic\s*text)\b/gi, "mic text")
    .replace(/\b(5\s*term|five\s*term|five\s*turn|5\s*turn)\b/gi, "5-turn")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCandidateTopic(value = "") {
  return safeStr(value)
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isExecutionOrTechnicalRequest(text = "") {
  const value = lower(text);
  if (!value) return false;
  return EXECUTION_OR_TECHNICAL_GUARD.test(value);
}

function buildPassthrough(raw, cleaned, reason = "passthrough") {
  const normalized = cleaned || raw || "";

  return {
    version: QUESTION_SHAPE_NORMALIZATION_VERSION,
    rawText: raw,
    normalizedText: normalized,
    normalizedUserIntent: normalized,
    questionShape: "direct_or_unknown",
    changed: false,
    reason,
    source: "QuestionShapeNormalizer"
  };
}

function normalizeQuestionShape(text = "", options = {}) {
  const raw = normalizeRouterVoiceTextParity(compactWhitespace(text));
  const cleaned = raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return buildPassthrough(raw, cleaned, "empty_input");
  }

  const externalGuard =
    typeof options.isExecutionOrTechnicalRequest === "function"
      ? !!options.isExecutionOrTechnicalRequest(cleaned)
      : false;

  if (externalGuard || isExecutionOrTechnicalRequest(cleaned)) {
    return buildPassthrough(raw, cleaned, "execution_or_technical_guard");
  }

  for (const { rx, reason } of TOPIC_PREFIX_PATTERNS) {
    const match = cleaned.match(rx);
    const candidate = cleanCandidateTopic(match && match[1]);

    if (!candidate || candidate.length < 2) continue;

    if (isExecutionOrTechnicalRequest(candidate)) {
      return buildPassthrough(raw, cleaned, "candidate_execution_or_technical_guard");
    }

    return {
      version: QUESTION_SHAPE_NORMALIZATION_VERSION,
      rawText: raw,
      normalizedText: candidate,
      normalizedUserIntent: candidate,
      questionShape: "topic_request",
      changed: candidate !== cleaned,
      reason,
      source: "QuestionShapeNormalizer"
    };
  }

  return buildPassthrough(raw, cleaned, "no_topic_prefix_match");
}

module.exports = {
  QUESTION_SHAPE_NORMALIZATION_VERSION,
  normalizeQuestionShape,
  normalizeRouterVoiceTextParity,
  isExecutionOrTechnicalRequest,
  cleanCandidateTopic,
  _internal: {
    safeStr,
    lower,
    compactWhitespace,
    TOPIC_PREFIX_PATTERNS,
    EXECUTION_OR_TECHNICAL_GUARD
  }
};
