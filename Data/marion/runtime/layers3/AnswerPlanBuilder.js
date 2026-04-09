// runtime/layer3/AnswerPlanBuilder.js
"use strict";

function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _clamp(n, min = 0, max = 1) {
  const value = Number(n);
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
function _uniq(values = []) {
  return [...new Set(_safeArray(values).map(_trim).filter(Boolean))];
}

function buildOpeningStrategy(packet = {}) {
  const emotion = _trim(packet.emotion?.primaryEmotion || "neutral");
  const intensity = _clamp(packet.emotion?.intensity, 0, 1);
  const intent = _trim(packet.intent || "general");
  const evidenceCount = _safeArray(packet.evidence).length;
  const continuityHealth = _trim(packet.conversationState?.continuityHealth || "watch");
  const recoveryMode = _trim(packet.conversationState?.recoveryMode || "normal");
  const supportMode = _trim(packet.psychology?.supportMode || packet.psychology?.recommendedApproach || "");
  const degradedSignal = !!packet.diagnostics?.degradedSignal;

  if (supportMode === "crisis_escalation") {
    return "Start with immediate safety framing, keep the language plain, and stop normal branching.";
  }

  if (recoveryMode === "guided-recovery" || continuityHealth === "fragile") {
    return "Start with one calm direct answer, reduce branching, and give one grounded next move.";
  }

  if (degradedSignal) {
    return "Start with a bounded answer and avoid overclaiming beyond the strongest available signal.";
  }

  if (intensity >= 0.72 && emotion !== "neutral") {
    return "Start with measured emotional acknowledgement, then move into grounded guidance.";
  }

  if (["analysis", "research", "debug"].includes(intent)) {
    return evidenceCount >= 2
      ? "Start with a direct answer, then support it with ranked reasoning."
      : "Start with a bounded answer, then support it only with the strongest available signal.";
  }

  if (["strategy", "planning", "build"].includes(intent)) {
    return "Lead with the clearest operational direction, then layer the supporting rationale.";
  }

  return "Open warmly, answer directly, then reinforce with blended evidence.";
}

function buildCareSequence(packet = {}) {
  const emotion = _safeObj(packet.emotion);
  const psychology = _safeObj(packet.psychology);
  const supportFlags = _safeObj(emotion.supportFlags);
  const intensity = _clamp(emotion.intensity, 0, 1);
  const sequence = [];

  if (supportFlags.crisis || psychology.supportMode === "crisis_escalation") {
    return ["stabilize", "contain", "escalate"];
  }

  if (supportFlags.needsContainment || intensity >= 0.75) sequence.push("stabilize");
  sequence.push(emotion.primaryEmotion && emotion.primaryEmotion !== "neutral" ? "acknowledge" : "orient");
  if (supportFlags.needsClarification) sequence.push("clarify");
  if (psychology.recommendedApproach || psychology.supportMode) sequence.push("guide");
  else sequence.push("answer");
  if (packet.conversationState?.recoveryMode === "guided-recovery") sequence.push("narrow_next_step");

  return _uniq(sequence);
}

function buildReasoningSteps(packet = {}) {
  const steps = [];
  const evidence = _safeArray(packet.evidence);
  const topEvidence = evidence.slice(0, 3);
  const emotion = _safeObj(packet.emotion);
  const psychology = _safeObj(packet.psychology);

  if (emotion.primaryEmotion && emotion.primaryEmotion !== "neutral") {
    steps.push(`Reflect the user’s likely emotional state: ${emotion.primaryEmotion}.`);
  }

  if (_safeObj(emotion.stateDrift).trend) {
    steps.push(`Respect the emotional trajectory: ${emotion.stateDrift.trend}.`);
  }

  if (_safeObj(emotion.blendProfile).dominantAxis) {
    steps.push(`Resolve mixed affect through dominant axis: ${emotion.blendProfile.dominantAxis}.`);
  }

  if (psychology.recommendedApproach) {
    steps.push(`Apply psychology posture: ${psychology.recommendedApproach}.`);
  }

  steps.push(`Use the active domain lens: ${packet.domain || "general"}.`);

  if (topEvidence.length) {
    steps.push(`Anchor the answer in the strongest ${topEvidence.length} evidence fragment${topEvidence.length > 1 ? "s" : ""}.`);
  } else {
    steps.push("Keep the answer bounded because evidence coverage is thin.");
  }

  if (packet.conversationState?.recoveryMode === "guided-recovery") {
    steps.push("Break repetition by giving one clean direction instead of multiple competing paths.");
  }

  steps.push("Keep tone unified so the answer sounds like one intelligence, not stacked modules.");

  return steps;
}

function buildToneDirectives(packet = {}) {
  const directives = _safeArray(packet.toneDirectives);
  const evidenceCount = _safeArray(packet.evidence).length;
  const domain = _trim(packet.domain || "general");
  const supportMode = _trim(packet.psychology?.supportMode || packet.psychology?.recommendedApproach || "");
  const suppressionSignals = _safeArray(packet.emotion?.suppressionSignals);

  if (evidenceCount < 2) {
    directives.push("Keep certainty bounded to the strongest available support.");
  }

  if (packet.conversationState?.recoveryMode === "guided-recovery") {
    directives.push("Avoid repetitive reassurance and circular phrasing.");
    directives.push("Favor one grounded next step over response sprawl.");
  }

  if (suppressionSignals.length) {
    directives.push("Do not overread guarded language; acknowledge softly and avoid pressure.");
  }

  if (["law", "finance", "cybersecurity"].includes(domain)) {
    directives.push(`Maintain disciplined ${domain} framing.`);
  }

  if (supportMode === "crisis_escalation") {
    directives.push("Use plain, steady, safety-first wording.");
  }

  return _uniq(directives);
}

function buildPacingProfile(packet = {}) {
  const emotion = _safeObj(packet.emotion);
  const psychology = _safeObj(packet.psychology);
  const supportFlags = _safeObj(emotion.supportFlags);
  const intensity = _clamp(emotion.intensity, 0, 1);
  const degradedSignal = !!packet.diagnostics?.degradedSignal;

  let responseLength = "medium";
  let branchCount = 2;
  let probing = "light";

  if (supportFlags.crisis || psychology.supportMode === "crisis_escalation") {
    responseLength = "short";
    branchCount = 1;
    probing = "minimal";
  } else if (intensity >= 0.75 || supportFlags.needsContainment) {
    responseLength = "short";
    branchCount = 1;
    probing = "minimal";
  } else if (degradedSignal) {
    responseLength = "short";
    branchCount = 1;
    probing = "light";
  } else if (["analysis", "research", "strategy", "debug", "build"].includes(_trim(packet.intent))) {
    responseLength = "expanded";
    branchCount = 3;
    probing = "targeted";
  }

  return {
    responseLength,
    branchCount,
    probing,
    askOneQuestionMax: branchCount <= 1,
    shouldFrontloadAnswer: !supportFlags.crisis
  };
}

function buildNyxDirective(packet = {}) {
  const pacing = buildPacingProfile(packet);
  const careSequence = buildCareSequence(packet);
  return {
    mode: _trim(packet.psychology?.supportMode || packet.psychology?.recommendedApproach || "direct_support"),
    openingStrategy: buildOpeningStrategy(packet),
    toneDirectives: buildToneDirectives(packet),
    careSequence,
    pacing,
    shouldAcknowledgeEmotion: _trim(packet.emotion?.primaryEmotion) !== "" && _trim(packet.emotion?.primaryEmotion) !== "neutral",
    shouldAvoidSpeculation: !!packet.diagnostics?.degradedSignal,
    shouldOfferOneNextStep: pacing.branchCount <= 1 || packet.conversationState?.recoveryMode === "guided-recovery"
  };
}

function buildAnswerPlan(packet = {}) {
  const nyxDirective = buildNyxDirective(packet);
  return {
    openingStrategy: nyxDirective.openingStrategy,
    careSequence: nyxDirective.careSequence,
    reasoningSteps: buildReasoningSteps(packet),
    toneDirectives: nyxDirective.toneDirectives,
    pacingProfile: nyxDirective.pacing,
    nyxDirective,
    domain: packet.domain || "general",
    intent: packet.intent || "general",
    evidence: _safeArray(packet.evidence),
    weights: _safeObj(packet.weights),
    diagnostics: _safeObj(packet.diagnostics)
  };
}

module.exports = {
  buildAnswerPlan,
  buildOpeningStrategy,
  buildCareSequence,
  buildToneDirectives,
  buildPacingProfile,
  buildNyxDirective
};
