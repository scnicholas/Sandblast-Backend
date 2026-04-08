"use strict";

function _str(v) { return v == null ? "" : String(v); }
function _trim(v) { return _str(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }

const DOMAIN_PATTERNS = Object.freeze([
  ["ai", /(artificial intelligence|machine learning|deep learning|neural|transformer|llm|rag|embedding|vector|prompt|agent|inference|model eval|openai|anthropic|gemini|llama|mistral)/],
  ["finance", /(finance|stock|stocks|market|markets|economics|capital|investing|investor|revenue|profit|margin|cash flow|forecast|budget|roi|mrr|arr)/],
  ["law", /(law|legal|contract|contracts|court|case law|bar exam|statute|privacy law|copyright|trademark|nda|jurisdiction)/],
  ["english", /(english|writing|literature|essay|grammar|rhetoric|rewrite|edit|proofread|summary|summari[sz]e|clarity|tone)/],
  ["cyber", /(cyber|security|network|threat|infosec|malware|breach|exploit|vulnerability|patch|xss|sql injection|mfa)/],
  ["marketing", /(marketing|brand|branding|copy|campaign|audience|growth|positioning|messaging|funnel)/],
  ["strategy", /(strategy|roadmap|plan|milestone|priority|trade[- ]?off|kpi|execution|constraint|risk management)/]
]);

const CRISIS_PHRASES = Object.freeze([
  "i want to die", "hurt myself", "can't stay safe", "not safe with myself",
  "i might hurt someone", "going to snap", "don't want to be here"
]);

const SUPPRESSION_PHRASES = Object.freeze([
  "i'm fine", "its fine", "it's fine", "whatever", "doesn't matter",
  "never mind", "forget it", "all good", "i'm okay", "im okay", "no worries"
]);

const GUARDED_PHRASES = Object.freeze([
  "i guess", "kind of", "sort of", "maybe", "not sure", "hard to explain", "i don't know"
]);

const HIGH_DISTRESS_PHRASES = Object.freeze([
  "panic", "spiraling", "too much", "freaking out", "losing it", "can't breathe", "mind won't stop"
]);

const PSYCHOLOGY_PHRASES = Object.freeze([
  "overwhelmed", "spiraling", "numb", "drained", "failure", "worthless", "not enough",
  "pulling away", "checking for a reply", "ruin everything", "disaster", "always happens",
  "never works", "set me off", "feel safe", "everything is too much", "alone", "unseen"
]);

function _containsAny(text, phrases) {
  const t = _lower(text);
  return _safeArray(phrases).some((p) => {
    const s = _lower(p);
    return !!s && t.includes(s);
  });
}

function _detectDomains(text = "") {
  const t = _lower(text);
  const domains = [];
  for (const [domain, re] of DOMAIN_PATTERNS) if (re.test(t)) domains.push(domain);
  return domains;
}

function _mergeFlags(base, extra) {
  return { ..._safeObj(base), ..._safeObj(extra) };
}

function _inferSuppression(text = "", primaryEmotion = {}) {
  const t = _lower(text);
  const suppressionHits = SUPPRESSION_PHRASES.filter((p) => t.includes(_lower(p)));
  const contradictionHits =
    (suppressionHits.length > 0 && /(tired of everything|done with this|can't keep doing this|hurts|overwhelmed|numb|drained|panic|alone)/.test(t)) ||
    (suppressionHits.length > 0 && ["sadness", "fear", "anger", "shame", "grief", "panic", "overwhelm"].includes(_lower(primaryEmotion.emotion)));
  return {
    suppressed: suppressionHits.length > 0 || contradictionHits,
    forcedPositivity: contradictionHits,
    minimization: suppressionHits.length > 0,
    suppressionHits
  };
}

function classifyQuery(input = {}) {
  const text = _trim(input.text || input.query || input.userQuery);
  const supportFlags = _safeObj(input.supportFlags);
  const emotion = _safeObj(input.emotion);
  const primaryEmotion = _safeObj(emotion.primary);
  const t = _lower(text);

  const crisis = _containsAny(t, CRISIS_PHRASES) || !!supportFlags.crisis;
  const emotionDetected = !!_trim(primaryEmotion.emotion) || !!emotion.matched;
  const positive = /(i feel great|i feel better|i'm doing better|things are turning around|i can do this|relieved|grateful|hopeful)/.test(t) ||
    !!supportFlags.positivePresent || !!supportFlags.recoveryPresent;

  const suppression = _inferSuppression(text, primaryEmotion);
  const guardedness = suppression.suppressed || _containsAny(t, GUARDED_PHRASES);
  const psychology = crisis || emotionDetected || _containsAny(t, PSYCHOLOGY_PHRASES);
  const domainsFromText = _detectDomains(text);

  const mergedSupportFlags = _mergeFlags(supportFlags, emotion.supportFlags);
  mergedSupportFlags.crisis = !!mergedSupportFlags.crisis || crisis;
  mergedSupportFlags.highDistress =
    !!mergedSupportFlags.highDistress ||
    crisis ||
    _containsAny(t, HIGH_DISTRESS_PHRASES) ||
    ["panic", "overwhelm", "fear", "grief", "shame", "rage"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.recoveryPresent =
    !!mergedSupportFlags.recoveryPresent ||
    positive ||
    ["relief", "hope", "calm"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.positivePresent =
    !!mergedSupportFlags.positivePresent ||
    positive ||
    ["joy", "gratitude", "confidence", "pride", "relief", "hope", "calm"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.needsStabilization =
    !!mergedSupportFlags.needsStabilization ||
    crisis ||
    _containsAny(t, ["overwhelmed", "spiraling", "panic", "too much"]) ||
    ["panic", "overwhelm", "fear", "rage", "grief", "shame"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.needsClarification =
    !!mergedSupportFlags.needsClarification ||
    guardedness ||
    _containsAny(t, ["confused", "not sure", "what happened", "what do they mean"]) ||
    ["confusion", "ambivalence", "uncertainty"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.needsContainment =
    !!mergedSupportFlags.needsContainment ||
    crisis ||
    _containsAny(t, ["can't breathe", "losing it", "freaking out"]) ||
    ["panic", "rage"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.needsConnection =
    !!mergedSupportFlags.needsConnection ||
    _containsAny(t, ["alone", "pulling away", "need someone", "still care", "unseen"]) ||
    ["loneliness", "grief", "sadness", "shame"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.suppressed = !!mergedSupportFlags.suppressed || suppression.suppressed;
  mergedSupportFlags.guardedness = !!mergedSupportFlags.guardedness || guardedness;
  mergedSupportFlags.forcedPositivity = !!mergedSupportFlags.forcedPositivity || suppression.forcedPositivity;
  mergedSupportFlags.minimization = !!mergedSupportFlags.minimization || suppression.minimization;

  const domainCandidates = [];
  if (psychology && !domainCandidates.includes("psychology")) domainCandidates.push("psychology");
  for (const domain of domainsFromText) if (!domainCandidates.includes(domain)) domainCandidates.push(domain);
  if (!domainCandidates.length) domainCandidates.push("general");

  return {
    ok: true,
    text,
    classifications: {
      crisis,
      psychology,
      positive,
      emotion: emotionDetected,
      guardedness,
      suppressed: suppression.suppressed
    },
    supportFlags: mergedSupportFlags,
    domainCandidates,
    diagnostics: {
      primaryEmotion: _lower(primaryEmotion.emotion || emotion.primaryEmotion || "") || "neutral",
      candidateCount: domainCandidates.length,
      suppressionHits: suppression.suppressionHits
    }
  };
}

module.exports = { classifyQuery };
