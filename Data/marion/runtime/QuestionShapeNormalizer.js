"use strict";

/**
 * QuestionShapeNormalizer.js
 *
 * Purpose:
 * - Normalize loose user question phrasing before Marion intent routing.
 * - Convert natural shorthand like "tell me about cash flow" into "cash flow".
 * - Preserve technical/directive requests so backend patch commands are not misread as topic requests.
 * - Carry language/locale intent hints for the Universal Translator add-on without translating text here.
 * - Keep Nyx/Marion routing stable without changing final-response authority.
 *
 * Architectural rules:
 * - Does not compose final replies.
 * - Does not translate final replies.
 * - Does not mutate StateSpine.
 * - Does not bypass DomainConcierge, MarionBridge, or MarionFinalEnvelope.
 */

const QUESTION_SHAPE_NORMALIZATION_VERSION = "nyx.marion.questionShapeNormalization/1.2-referenceerror-hardening";
const DOMAIN_CONCIERGE_READINESS_VERSION = "nyx.marion.domainConciergeReadiness/1.0";
const UNIVERSAL_TRANSLATOR_READINESS_VERSION = "nyx.marion.universalTranslatorReadiness/0.1-prep";

const EXECUTION_OR_TECHNICAL_GUARD = /\b(file|files|zip|download|resend|update|patch|fix|replace|audit|autopsy|line[-\s]?by[-\s]?line|structural integrity|architecture|deploy|validate|node --check|backend|frontend|widget|script|code|html|css|javascript|js|api\/chat|runtime|router|composer|state spine|statespine|marion|nyx|nix|nixon|marionbridge|marion bridge|chatengine|chat engine|composemarionresponse|compose marion response|compose mario response|intent router|domain registry|question shape normalizer|question-shape normalizer|domain concierge|domainconcierge|concierge core|route confidence|domain confidence|confidence-aware|adaptive trust|final envelope|marion final envelope|universal translator|translator add-on|language selector|locale carry)\b/i;

const TRANSLATION_INTENT_GUARD = /\b(translate|translation|translator|language|locale|locali[sz]e|caption|captions|subtitle|subtitles|spanish|espa[ñn]ol|french|fran[çc]ais|mandarin|chinese|portuguese|portugu[eê]s|english|en[-\s]?ca|fr[-\s]?ca|pt[-\s]?br|zh[-\s]?cn|zh[-\s]?hans|es[-\s]?es|es[-\s]?mx)\b/i;

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
    rx: /^(?:please\s+)?what['’]?s\s+(.+)$/i,
    reason: "whats_is"
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

const SUPPORTED_TRANSLATOR_LANGUAGES = Object.freeze({
  en: Object.freeze({ code: "en", locale: "en-CA", label: "English", enabled: true }),
  es: Object.freeze({ code: "es", locale: "es-ES", label: "Spanish", enabled: true }),
  fr: Object.freeze({ code: "fr", locale: "fr-CA", label: "French", enabled: true }),
  zh: Object.freeze({ code: "zh", locale: "zh-Hans", label: "Mandarin Chinese", enabled: true }),
  pt: Object.freeze({ code: "pt", locale: "pt-BR", label: "Portuguese", enabled: true })
});

function safeStr(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function lower(value) {
  return safeStr(value).toLowerCase();
}

function isObj(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeObj(value) {
  return isObj(value) ? value : {};
}

function compactWhitespace(value) {
  return safeStr(value).replace(/\s+/g, " ").trim();
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = safeStr(arguments[i]);
    if (value) return value;
  }
  return "";
}

function extractTextInput(value) {
  if (!isObj(value)) return safeStr(value);
  const payload = safeObj(value.payload);
  const meta = safeObj(value.meta);
  const session = safeObj(value.session);
  return firstText(
    value.text,
    value.userText,
    value.message,
    value.prompt,
    value.rawUserText,
    value.normalizedUserIntent,
    payload.text,
    payload.userText,
    payload.message,
    meta.text,
    meta.userText,
    session.lastUserText
  );
}

function normalizeRouterVoiceTextParity(text = "") {
  return safeStr(text)
    .replace(/\b(nick|nix|mix|mike|nixon)\b/gi, "Nyx")
    .replace(/\b(state\s+line|state\s+sign|statespine|state\s+spine)\b/gi, "State Spine")
    .replace(/\b(chad\s+engine|chat\s+engine)\b/gi, "ChatEngine")
    .replace(/\b(mary\s+bridge|marian\s+bridge|marion\s+bridge|mario\s+bridge)\b/gi, "MarionBridge")
    .replace(/\b(compose\s+marion\s+response|composed\s+marion\s+response|compose\s+mario\s+response|composed\s+mario\s+response|compose\s+marian\s+response|composed\s+marian\s+response|compose\s+mailing\s+response|composed\s+mailing\s+response)\b/gi, "ComposeMarionResponse")
    .replace(/\b(final\s+envelop|final\s+envelope|marion\s+final\s+envelop|marion\s+final\s+envelope)\b/gi, "MarionFinalEnvelope")
    .replace(/\b(domain\s+con\s+ciers?|domain\s+concierges?|domain\s+consierge|domain\s+consier)\b/gi, "Domain Concierge")
    .replace(/\b(question\s+shape\s+normaliser|question\s+shape\s+normalizer|question-shape\s+normalizer)\b/gi, "QuestionShapeNormalizer")
    .replace(/\b(nex\s+steps|neck\s+steps)\b/gi, "Next steps")
    .replace(/\b(mic\s*tech|mike\s*tech|mike\s*text|mic\s*text)\b/gi, "mic text")
    .replace(/\b(5\s*term|five\s*term|five\s*turn|5\s*turn)\b/gi, "5-turn")
    .replace(/\b(portugese|portuguse)\b/gi, "Portuguese")
    .replace(/\b(mandrin|manderin)\b/gi, "Mandarin")
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

function detectLanguageIntent(text = "", options = {}) {
  const raw = lower(text);
  const opt = safeObj(options);
  const explicitLocale = safeStr(opt.locale || opt.targetLocale || opt.language || opt.targetLanguage);
  let targetLanguage = "";
  let targetLocale = "";

  function setLanguage(code) {
    const cfg = SUPPORTED_TRANSLATOR_LANGUAGES[code];
    if (!cfg) return;
    targetLanguage = cfg.code;
    targetLocale = cfg.locale;
  }

  if (/pt[-\s]?br|portugu[eê]s|portuguese/.test(raw) || /portugu[eê]s|portuguese/i.test(explicitLocale)) setLanguage("pt");
  else if (/zh[-\s]?(cn|hans)|mandarin|chinese|中文|普通话/.test(raw) || /mandarin|chinese|zh/i.test(explicitLocale)) setLanguage("zh");
  else if (/fr[-\s]?ca|french|fran[çc]ais/.test(raw) || /french|français|fr-ca|fr/i.test(explicitLocale)) setLanguage("fr");
  else if (/es[-\s]?(es|mx)|spanish|espa[ñn]ol/.test(raw) || /spanish|español|es/i.test(explicitLocale)) setLanguage("es");
  else if (/en[-\s]?ca|english/.test(raw) || /english|en-ca|en/i.test(explicitLocale)) setLanguage("en");

  const translationRequested = !!(
    TRANSLATION_INTENT_GUARD.test(raw) ||
    /\b(to|into|in)\s+(spanish|french|mandarin|chinese|portuguese|english)\b/i.test(text) ||
    /\btranslate\s+(.+?)\s+(to|into)\s+/i.test(text)
  );

  return {
    version: UNIVERSAL_TRANSLATOR_READINESS_VERSION,
    supported: true,
    translationRequested,
    languageIntentPresent: translationRequested || !!targetLanguage,
    sourceLanguage: firstText(opt.sourceLanguage, opt.sourceLocale, ""),
    targetLanguage,
    targetLocale,
    supportedLanguages: Object.keys(SUPPORTED_TRANSLATOR_LANGUAGES),
    confidence: translationRequested || targetLanguage ? 0.72 : 0,
    shouldTranslateHere: false,
    reason: translationRequested ? "translation_or_locale_intent_detected" : (targetLanguage ? "language_hint_detected" : "no_language_intent")
  };
}

function buildPassthrough(raw, cleaned, reason = "passthrough", options = {}) {
  const normalized = cleaned || raw || "";
  const languageIntent = detectLanguageIntent(normalized || raw, options);

  return {
    version: QUESTION_SHAPE_NORMALIZATION_VERSION,
    rawText: raw,
    normalizedText: normalized,
    normalizedUserIntent: normalized,
    questionShape: "direct_or_unknown",
    changed: false,
    reason,
    source: "QuestionShapeNormalizer",
    domainConciergeReady: true,
    domainConciergeReadinessVersion: DOMAIN_CONCIERGE_READINESS_VERSION,
    universalTranslatorReady: true,
    universalTranslatorReadinessVersion: UNIVERSAL_TRANSLATOR_READINESS_VERSION,
    languageIntent
  };
}


function detectLawDomainHint(value = "") {
  const text = lower(value);
  if (!text) return "";
  if (/\b(contract law|consideration|promissory estoppel|promise alone|legal consideration|law)\b/.test(text)) {
    return "law";
  }
  return "";
}

function buildNormalizedResult({ raw = "", cleaned = "", normalized = "", reason = "no_topic_prefix_match", shape = "passthrough", options = {}, languageIntent = null } = {}) {
  const domainHint = detectLawDomainHint(normalized || cleaned || raw);
  return {
    version: QUESTION_SHAPE_NORMALIZATION_VERSION,
    rawText: raw,
    normalizedText: normalized || cleaned || raw,
    normalizedUserIntent: normalized || cleaned || raw,
    questionShape: shape,
    changed: Boolean((normalized || cleaned || raw) !== cleaned),
    reason,
    source: "QuestionShapeNormalizer",
    domainConciergeReady: true,
    domainConciergeReadinessVersion: DOMAIN_CONCIERGE_READINESS_VERSION,
    universalTranslatorReady: true,
    universalTranslatorReadinessVersion: UNIVERSAL_TRANSLATOR_READINESS_VERSION,
    languageIntent: languageIntent || detectLanguageIntent(normalized || cleaned || raw, options),
    domainHint,
    knowledgeDomainHint: domainHint,
    runtimeSafe: true
  };
}

function normalizeQuestionShapeUnsafe(text = "", options = {}) {
  const rawInput = extractTextInput(text);
  const raw = normalizeRouterVoiceTextParity(compactWhitespace(rawInput));
  const cleaned = raw
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return buildPassthrough(raw, cleaned, "empty_input", options);
  }

  const externalGuard =
    typeof options.isExecutionOrTechnicalRequest === "function"
      ? !!options.isExecutionOrTechnicalRequest(cleaned)
      : false;

  if (externalGuard || isExecutionOrTechnicalRequest(cleaned)) {
    return buildPassthrough(raw, cleaned, "execution_or_technical_guard", options);
  }

  const languageIntent = detectLanguageIntent(cleaned, options);

  if (languageIntent.translationRequested) {
    return {
      version: QUESTION_SHAPE_NORMALIZATION_VERSION,
      rawText: raw,
      normalizedText: cleaned,
      normalizedUserIntent: cleaned,
      questionShape: "translation_request",
      changed: false,
      reason: "translation_or_locale_intent_preserved",
      source: "QuestionShapeNormalizer",
      domainConciergeReady: true,
      domainConciergeReadinessVersion: DOMAIN_CONCIERGE_READINESS_VERSION,
      universalTranslatorReady: true,
      universalTranslatorReadinessVersion: UNIVERSAL_TRANSLATOR_READINESS_VERSION,
      languageIntent
    };
  }

  for (const { rx, reason } of TOPIC_PREFIX_PATTERNS) {
    const match = cleaned.match(rx);
    const candidate = cleanCandidateTopic(match && match[1]);

    if (!candidate || candidate.length < 2) continue;

    if (isExecutionOrTechnicalRequest(candidate)) {
      return buildPassthrough(raw, cleaned, "candidate_execution_or_technical_guard", options);
    }

    return {
      version: QUESTION_SHAPE_NORMALIZATION_VERSION,
      rawText: raw,
      normalizedText: candidate,
      normalizedUserIntent: candidate,
      questionShape: "topic_request",
      changed: candidate !== cleaned,
      reason,
      source: "QuestionShapeNormalizer",
      domainConciergeReady: true,
      domainConciergeReadinessVersion: DOMAIN_CONCIERGE_READINESS_VERSION,
      universalTranslatorReady: true,
      universalTranslatorReadinessVersion: UNIVERSAL_TRANSLATOR_READINESS_VERSION,
      languageIntent: detectLanguageIntent(candidate, options)
    };
  }

  const passthrough = buildPassthrough(raw, cleaned, "no_topic_prefix_match", options);
  const domainHint = detectLawDomainHint(passthrough.normalizedText || cleaned);
  return {
    ...passthrough,
    domainHint,
    knowledgeDomainHint: domainHint,
    runtimeSafe: true
  };
}

function normalizeQuestionShape(text = "", options = {}) {
  try {
    const result = normalizeQuestionShapeUnsafe(text, options);
    const safeResult = result && typeof result === "object" ? result : buildPassthrough("", "", "normalizer_non_object_result", options);
    const domainHint = detectLawDomainHint(safeResult.normalizedText || safeResult.normalizedUserIntent || safeResult.rawText);
    return {
      ...safeResult,
      domainHint: safeResult.domainHint || domainHint,
      knowledgeDomainHint: safeResult.knowledgeDomainHint || domainHint,
      runtimeSafe: true
    };
  } catch (err) {
    const raw = normalizeRouterVoiceTextParity(compactWhitespace(extractTextInput(text)));
    const cleaned = raw.replace(/[\u2018\u2019]/g, "'").replace(/[?!.,]+$/g, "").replace(/\s+/g, " ").trim();
    return buildNormalizedResult({
      raw,
      cleaned,
      normalized: cleaned,
      reason: "normalizer_referenceerror_recovered",
      shape: "passthrough",
      options
    });
  }
}

function questionShapeNormalizerStatus() {
  return {
    version: QUESTION_SHAPE_NORMALIZATION_VERSION,
    domainConciergeReadinessVersion: DOMAIN_CONCIERGE_READINESS_VERSION,
    universalTranslatorReadinessVersion: UNIVERSAL_TRANSLATOR_READINESS_VERSION,
    supportedTranslatorLanguages: Object.keys(SUPPORTED_TRANSLATOR_LANGUAGES),
    authority: "input-shape-normalization-only",
    translatesText: false,
    composesFinalReply: false,
    mutatesStateSpine: false,
    finalAuthority: "not-owned-by-question-shape-normalizer"
  };
}

module.exports = {
  QUESTION_SHAPE_NORMALIZATION_VERSION,
  DOMAIN_CONCIERGE_READINESS_VERSION,
  UNIVERSAL_TRANSLATOR_READINESS_VERSION,
  SUPPORTED_TRANSLATOR_LANGUAGES,
  normalizeQuestionShape,
  normalizeRouterVoiceTextParity,
  isExecutionOrTechnicalRequest,
  cleanCandidateTopic,
  detectLanguageIntent,
  questionShapeNormalizerStatus,
  _internal: {
    safeStr,
    lower,
    isObj,
    safeObj,
    compactWhitespace,
    extractTextInput,
    firstText,
    detectLawDomainHint,
    buildNormalizedResult,
    TOPIC_PREFIX_PATTERNS,
    EXECUTION_OR_TECHNICAL_GUARD,
    TRANSLATION_INTENT_GUARD
  }
};

module.exports.default = module.exports;
