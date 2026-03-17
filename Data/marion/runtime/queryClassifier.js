// runtime/queryClassifier.js
"use strict";

function _str(v) { return v == null ? "" : String(v); }
function _trim(v) { return _str(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }

function _containsAny(text, phrases) {
  const t = _lower(text);
  return _safeArray(phrases).some((p) => {
    const s = _lower(p);
    return !!s && t.includes(s);
  });
}

function _mergeFlags(base, extra) {
  return { ..._safeObj(base), ..._safeObj(extra) };
}

function _detectBusinessTechDomains(text = "") {
  const t = _lower(text);
  const domains = [];

  if (/(finance|stock|stocks|market|markets|economics|capital|investing|investor)/.test(t)) domains.push("finance");
  if (/(law|legal|contract|contracts|court|case law|bar exam|statute)/.test(t)) domains.push("law");
  if (/(english|writing|literature|essay|grammar|rhetoric)/.test(t)) domains.push("english");
  if (/(cyber|security|network|threat|infosec|malware)/.test(t)) domains.push("cybersecurity");
  if (/(marketing|brand|branding|copy|campaign|audience|growth)/.test(t)) domains.push("marketing");

  return domains;
}

function classifyQuery(input = {}) {
  const text = _trim(input.text || input.query || input.userQuery);
  const supportFlags = _safeObj(input.supportFlags);
  const emotion = _safeObj(input.emotion);
  const primaryEmotion = _safeObj(emotion.primary);

  const crisis = _containsAny(text, [
    "i want to die", "hurt myself", "can't stay safe", "not safe with myself",
    "i might hurt someone", "going to snap", "don't want to be here"
  ]) || !!supportFlags.crisis;

  const emotionDetected = !!primaryEmotion.emotion || !!emotion.matched;

  const positive = _containsAny(text, [
    "i feel great", "i feel better", "i'm doing better", "things are turning around", "i can do this"
  ]) || !!supportFlags.positivePresent || !!supportFlags.recoveryPresent;

  const psychology = crisis || emotionDetected || _containsAny(text, [
    "overwhelmed", "spiraling", "numb", "drained", "failure", "worthless", "not enough",
    "pulling away", "checking for a reply", "ruin everything", "disaster", "always happens",
    "never works", "set me off", "feel safe", "everything is too much"
  ]);

  const mergedSupportFlags = _mergeFlags(supportFlags, emotion.supportFlags);
  mergedSupportFlags.crisis = !!mergedSupportFlags.crisis || crisis;
  mergedSupportFlags.highDistress =
    !!mergedSupportFlags.highDistress ||
    crisis ||
    _containsAny(text, ["panic", "spiraling", "too much", "freaking out", "losing it"]);
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
    _containsAny(text, ["overwhelmed", "spiraling", "panic", "too much"]) ||
    ["panic", "overwhelm", "fear", "rage", "grief", "shame"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.needsClarification =
    !!mergedSupportFlags.needsClarification ||
    _containsAny(text, ["confused", "not sure", "what happened", "what do they mean"]) ||
    ["confusion", "ambivalence", "uncertainty"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.needsContainment =
    !!mergedSupportFlags.needsContainment ||
    crisis ||
    _containsAny(text, ["can't breathe", "losing it", "freaking out"]) ||
    ["panic", "rage"].includes(_lower(primaryEmotion.emotion));
  mergedSupportFlags.needsConnection =
    !!mergedSupportFlags.needsConnection ||
    _containsAny(text, ["alone", "pulling away", "need someone", "still care"]) ||
    ["loneliness", "grief", "sadness", "shame"].includes(_lower(primaryEmotion.emotion));

  const domainCandidates = [];
  if (emotionDetected) domainCandidates.push("emotion");
  if (psychology && !domainCandidates.includes("psychology")) domainCandidates.push("psychology");

  for (const domain of _detectBusinessTechDomains(text)) {
    if (!domainCandidates.includes(domain)) domainCandidates.push(domain);
  }

  if (positive && !domainCandidates.includes("emotion")) domainCandidates.push("emotion");
  if (positive && !domainCandidates.includes("psychology")) domainCandidates.push("psychology");
  if (!domainCandidates.length) domainCandidates.push("general");

  return {
    ok: true,
    text,
    classifications: {
      crisis,
      psychology,
      positive,
      emotion: emotionDetected
    },
    supportFlags: mergedSupportFlags,
    domainCandidates
  };
}

module.exports = { classifyQuery };
