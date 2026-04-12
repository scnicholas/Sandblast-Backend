"use strict";

/**
 * composeMarionResponse.js
 * Cohesive Marion composition layer.
 */

const VERSION = "composeMarionResponse v1.4.0 AUTHORITY-ESCALATION-OVERRIDE";
const DEBUG_TAG = "[MARION] composeMarionResponse patch active";
try { console.log(DEBUG_TAG, VERSION); } catch (_e) {}

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function _clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, _num(v, min))); }
function _uniq(arr) { return [...new Set(_safeArray(arr).map(_trim).filter(Boolean))]; }


function _normalizeSupportFlags() {
  const merged = {};
  for (const src of arguments) {
    const obj = _safeObj(src);
    for (const [key, value] of Object.entries(obj)) {
      merged[_trim(key)] = !!value;
    }
  }
  return merged;
}

function _buildEmotionPayload(primaryEmotion = {}, emotion = {}, supportFlags = {}) {
  const primary = _safeObj(primaryEmotion);
  const blended = _safeObj(emotion);
  return {
    locked: true,
    primaryEmotion: _lower(primary.emotion || blended.primaryEmotion || "neutral") || "neutral",
    secondaryEmotion: _lower(primary.secondaryEmotion || blended.secondaryEmotion || "") || null,
    intensity: Number(_clamp(primary.intensity != null ? primary.intensity : blended.intensity, 0, 1).toFixed(3)),
    valence: Number(_clamp(primary.valence != null ? primary.valence : blended.valence, -1, 1).toFixed(3)),
    confidence: Number(_clamp(primary.confidence != null ? primary.confidence : blended.confidence != null ? blended.confidence : 0.82, 0, 1).toFixed(3)),
    supportFlags: _normalizeSupportFlags(supportFlags),
    needs: _uniq(_safeArray(blended.needs).concat(_safeArray(primary.needs))),
    cues: _uniq(_safeArray(blended.cues).concat(_safeArray(primary.cues))),
    blendProfile: _resolveBlendProfile(blended),
    stateDrift: _resolveStateDrift({}, blended)
  };
}

function _buildStrategyPayload(supportMode, modePlan, routed = {}, psychology = {}) {
  const route = _safeObj(psychology.route);
  const record = _safeObj(_safeObj(psychology.primary).record);
  const routeBias = _trim(record.routeBias || route.routeBias || routed.routeBias || "clarify") || "clarify";
  const deliveryTone = _trim(modePlan.deliveryTone || route.deliveryTone || routed.deliveryTone || "steadying") || "steadying";
  let archetype = _trim(route.archetype || record.archetype || routed.archetype || "");
  if (!archetype) {
    if (/crisis|acute|soothe|stabilize|ground/.test(supportMode)) archetype = "ground";
    else if (/affirm|channel/.test(supportMode)) archetype = "channel";
    else if (/celebrate/.test(supportMode)) archetype = "celebrate";
    else archetype = "clarify";
  }
  return {
    archetype,
    supportModeCandidate: supportMode,
    routeBias,
    deliveryTone,
    questionPressure: modePlan.shouldAskFollowup ? "medium" : "low",
    transitionReadiness: _trim(modePlan.transitionReadiness || "medium") || "medium",
    acknowledgementMode: /crisis|acute|soothe|stabilize/.test(supportMode) ? "auto" : "light",
    expressionContract: {
      questionPressure: modePlan.shouldAskFollowup ? "medium" : "low",
      transitionReadiness: _trim(modePlan.transitionReadiness || "medium") || "medium",
      acknowledgementMode: /crisis|acute|soothe|stabilize/.test(supportMode) ? "auto" : "light"
    }
  };
}

function _buildPipelineTrace(primaryDomain, supportMode, riskLevel, emotionPayload, strategyPayload, reply, followUps) {
  return {
    stage: "composeMarionResponse",
    version: VERSION,
    domain: primaryDomain,
    supportMode,
    riskLevel,
    emotion: {
      primaryEmotion: emotionPayload.primaryEmotion,
      intensity: emotionPayload.intensity,
      valence: emotionPayload.valence
    },
    strategy: {
      archetype: strategyPayload.archetype,
      routeBias: strategyPayload.routeBias,
      deliveryTone: strategyPayload.deliveryTone
    },
    replyPreview: _trim(reply).slice(0, 160),
    followUpCount: _safeArray(followUps).length,
    resolvedAt: Date.now()
  };
}

function _resolveConversationState(routed = {}, input = {}) {
  const state = _safeObj(routed.conversationState || input.conversationState);
  return {
    previousEmotion: _lower(state.previousEmotion || _safeObj(state.lastEmotion).previousEmotion || ""),
    currentEmotion: _lower(_safeObj(state.lastEmotion).primaryEmotion || ""),
    emotionTrend: _lower(state.emotionTrend || "stable") || "stable",
    lastTopics: _uniq(_safeArray(state.lastTopics)).slice(0, 6),
    repetitionCount: Math.max(0, _num(state.repetitionCount, 0)),
    depthLevel: Math.max(1, Math.min(5, _num(state.depthLevel, 1))),
    unresolvedSignals: _uniq(_safeArray(state.unresolvedSignals)).slice(0, 6),
    threadContinuation: !!state.threadContinuation,
    continuityMode: _trim(state.continuityMode || "stabilize") || "stabilize"
  };
}

function _buildStateLead(conversationState = {}, primaryEmotion = "") {
  const state = _safeObj(conversationState);
  const previousEmotion = _lower(state.previousEmotion || "");
  const currentEmotion = _lower(primaryEmotion || state.currentEmotion || "neutral");
  if (!state.threadContinuation && _num(state.depthLevel, 1) <= 1) return "";
  if (previousEmotion && previousEmotion !== currentEmotion) {
    return `Earlier this felt closer to ${previousEmotion}, and now it seems heavier.`;
  }
  if (state.threadContinuation && currentEmotion) {
    return `I can see this thread is still carrying ${currentEmotion}.`;
  }
  return "I can feel this thread continuing.";
}

function _makeStateAwareReply(primaryEmotion, supportMode, intensity, conversationState = {}) {
  const base = _makeSupportReply(primaryEmotion, supportMode, intensity);
  const lead = _buildStateLead(conversationState, primaryEmotion);
  if (!lead) return base;
  if (_num(conversationState.depthLevel, 1) >= 3) {
    if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(_lower(primaryEmotion))) {
      return `${lead} I am still with you in it. Does this feel like something that has been building, or did something make it sharper today?`;
    }
    if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(_lower(primaryEmotion))) {
      return `${lead} Let us keep this narrow and honest. Is the pressure coming more from what might happen, or from what is already happening?`;
    }
    return `${lead} ${base}`;
  }
  return `${lead} ${base}`.trim();
}

function _buildStateAwareFollowUps(modePlan, primaryEmotion, supportFlags = {}, conversationState = {}) {
  if (supportFlags.crisis) return [];
  if (!modePlan.shouldAskFollowup) return [];
  const state = _safeObj(conversationState);
  const emo = _lower(primaryEmotion || "neutral");
  if (_num(state.depthLevel, 1) >= 3 || state.threadContinuation) {
    if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(emo)) {
      return ["Has this been building over time, or did something trigger it today?"];
    }
    if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(emo)) {
      return ["Is the pressure coming from one clear source, or from everything stacking at once?"];
    }
    return ["What keeps this thread active for you right now?"];
  }
  return _buildFollowUps(modePlan, primaryEmotion, supportFlags);
}

function _resolveEscalationProfile(routed = {}, input = {}, supportFlags = {}, conversationState = {}, primaryEmotion = {}) {
  const routedProfile = _safeObj(routed.escalationProfile || input.escalationProfile);
  const depthLevel = Math.max(1, _num(conversationState.depthLevel, routedProfile.depthLevel || 1));
  const repetitionCount = Math.max(0, _num(conversationState.repetitionCount, routedProfile.repetitionCount || 0));
  const unresolvedSignals = _uniq(_safeArray(conversationState.unresolvedSignals).concat(_safeArray(routedProfile.unresolvedSignals))).slice(0, 6);
  const intensity = _clamp(primaryEmotion.intensity != null ? primaryEmotion.intensity : routedProfile.intensity, 0, 1);
  const highDistress = !!_safeObj(supportFlags).highDistress || !!_safeObj(supportFlags).needsContainment;
  const shouldDeepen = !!routedProfile.shouldDeepen || depthLevel >= 3 || repetitionCount >= 2 || unresolvedSignals.length >= 2 || intensity >= 0.74 || !!conversationState.threadContinuation;
  return {
    shouldDeepen,
    shouldSolve: !!routedProfile.shouldSolve || (!highDistress && (depthLevel >= 4 || repetitionCount >= 3 || unresolvedSignals.length >= 3) && intensity < 0.82),
    mode: _trim(routedProfile.mode || (shouldDeepen ? "deep_reflection" : "standard")) || "standard",
    depthLevel,
    repetitionCount,
    unresolvedSignals,
    intensity,
    threadContinuation: !!conversationState.threadContinuation,
    emotionTrend: _trim(conversationState.emotionTrend || routedProfile.emotionTrend || "stable") || "stable"
  };
}

function _normalizeEmotionAlias(value = "") {
  const emo = _lower(value);
  if (["sad", "depressed", "lonely", "loneliness", "grief", "heartbroken"].includes(emo)) return "sadness";
  if (["anxious", "panic", "overwhelmed", "overwhelm", "fear", "afraid"].includes(emo)) return "fear";
  if (["angry", "frustrated", "frustration", "mad"].includes(emo)) return "anger";
  return emo || "neutral";
}

function _isGenericLoopReply(reply = "") {
  const text = _lower(reply).replace(/\s+/g, " ").trim();
  if (!text) return true;
  return [
    "i have the thread.",
    "give me one clean beat more",
    "i will answer directly without flattening the conversation",
    "tell me the next piece",
    "stay with the next honest piece only"
  ].some((snippet) => text.includes(snippet));
}

function _looksEmotionSpecific(reply = "", primaryEmotion = "", conversationState = {}) {
  const text = _lower(reply);
  const emo = _normalizeEmotionAlias(primaryEmotion);
  const signals = _safeArray(conversationState.unresolvedSignals).map(_lower);
  if (emo && emo !== "neutral") {
      }
  const emotionHints = {
    sadness: ["missing", "lost", "grief", "lonely", "heavy", "hurt", "connection", "unfinished"],
    fear: ["pressure", "control", "urgent", "stacking", "signal", "controllable", "pressure point"],
    anger: ["boundary", "confront", "change", "pressure", "unfinished", "decision"]
  };
  const hints = emotionHints[emo] || [];
  const emotionHit = hints.some((hint) => text.includes(hint));
  const stateHit = signals.some((signal) => !!signal && text.includes(signal)) || _safeArray(conversationState.lastTopics).some((topic) => text.includes(_lower(topic)));
  return emotionHit || stateHit;
}

function _shouldHonorDraftReply(candidateReply = "", escalationProfile = {}, primaryEmotion = "", conversationState = {}) {
  const reply = _trim(candidateReply);
  if (!reply) return false;
  if (!_safeObj(escalationProfile).shouldDeepen) return true;
  if (_isGenericLoopReply(reply)) return false;
  return _looksEmotionSpecific(reply, primaryEmotion, conversationState);
}

function _resolveFinalReply(routed = {}, input = {}, primaryEmotion = "", supportMode = "clarify_and_sequence", intensity = 0, conversationState = {}, escalationProfile = {}) {
  const generated = _makeEscalatedReply(primaryEmotion, supportMode, intensity, conversationState, escalationProfile);
  const assistantDraft = _trim(_safeObj(input).assistantDraft);
  if (_shouldHonorDraftReply(assistantDraft, escalationProfile, primaryEmotion, conversationState)) {
    return { reply: assistantDraft, source: "assistantDraft" };
  }
  const inputReply = _trim(_safeObj(input).reply);
  if (_shouldHonorDraftReply(inputReply, escalationProfile, primaryEmotion, conversationState)) {
    return { reply: inputReply, source: "input.reply" };
  }
  const routedReply = _trim(_safeObj(routed).reply);
  if (_shouldHonorDraftReply(routedReply, escalationProfile, primaryEmotion, conversationState)) {
    return { reply: routedReply, source: "routed.reply" };
  }
  return { reply: generated, source: "escalation_override" };
}

function _makeEscalatedReply(primaryEmotion, supportMode, intensity, conversationState = {}, escalationProfile = {}) {
  const emo = _lower(primaryEmotion || "neutral");
  const state = _safeObj(conversationState);
  const profile = _safeObj(escalationProfile);
  const shouldDeepen = !!profile.shouldDeepen;
  const shouldSolve = !!profile.shouldSolve;
  if (!shouldDeepen) {
    return _makeStateAwareReply(primaryEmotion, supportMode, intensity, conversationState);
  }
  const lead = _buildStateLead(state, primaryEmotion) || "I can feel this thread continuing.";
  if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(emo)) {
    if (shouldSolve) {
      return `${lead} This feels persistent, not passing. Let us name whether this is asking for relief, connection, or a concrete change, so we can move toward something that actually helps.`;
    }
    return `${lead} This has some history to it. I do not want to skim the surface of it. Does this feel more like a slow build that has worn you down, or something specific that keeps reopening it?`;
  }
  if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(emo)) {
    if (shouldSolve) {
      return `${lead} We may be past simple reassurance here. Let us separate what is actually urgent from what is emotionally loud, then choose the next controllable move.`;
    }
    return `${lead} I do not want to blur this into one big feeling. Is the strain coming from one repeating pressure point, or from several things stacking without relief?`;
  }
  if (["anger", "frustration"].includes(emo)) {
    if (shouldSolve) {
      return `${lead} There is enough pattern here that we should stop circling it. What specifically needs to change, stop, or be confronted for this to ease?`;
    }
    return `${lead} This feels less like a moment and more like a pattern. What keeps pushing you back to the same pressure point?`;
  }
  if (shouldSolve) {
    return `${lead} There is enough continuity here to move from reflection into direction. What outcome would actually make this feel more resolved, not just more discussed?`;
  }
  return `${lead} I want to stay with the pattern, not just the latest sentence. What keeps this thread alive for you underneath the surface?`;
}

function _buildEscalatedFollowUps(modePlan, primaryEmotion, supportFlags = {}, conversationState = {}, escalationProfile = {}) {
  if (supportFlags.crisis) return [];
  const profile = _safeObj(escalationProfile);
  if (!profile.shouldDeepen) return _buildStateAwareFollowUps(modePlan, primaryEmotion, supportFlags, conversationState);
  const emo = _lower(primaryEmotion || "neutral");
  if (profile.shouldSolve) {
    if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(emo)) {
      return ["What would bring real relief here: being understood, being supported, or changing something concrete?"];
    }
    if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(emo)) {
      return ["What is the next thing you can actually control in this, even if it is small?"];
    }
    if (["anger", "frustration"].includes(emo)) {
      return ["What boundary, decision, or action would reduce this pressure in a real way?"];
    }
    return ["What next move would make this situation meaningfully better, not just more manageable?"];
  }
  if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(emo)) {
    return ["Does this feel rooted in something missing, something lost, or something unresolved?"];
  }
  if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(emo)) {
    return ["When this starts rising, what is the first signal that tells you it is happening again?"];
  }
  if (["anger", "frustration"].includes(emo)) {
    return ["What keeps making this feel unfinished or unaddressed for you?"];
  }
  return ["What pattern do you think this is exposing for you now that it has shown up more than once?"];
}

const MODE_DEFAULTS = Object.freeze({
  crisis_escalation: { semanticFrame: "immediate_safety", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "action_gate", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["stabilize", "escalate"], careSequence: ["acknowledge", "stabilize", "escalate"], adviceLevel: "minimal", shouldAskFollowup: false, shouldOfferNextStep: true },
  acute_regulation: { semanticFrame: "acute_regulation", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "ground_then_narrow", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["stabilize", "contain"], careSequence: ["acknowledge", "ground", "narrow"], adviceLevel: "minimal", shouldAskFollowup: true, shouldOfferNextStep: true },
  soothe_and_structure: { semanticFrame: "stabilization", deliveryTone: "warm_affirming", expressionStyle: "plain_statement", followupStyle: "ground_then_narrow", responseLength: "short", pacing: "steady", transitionReadiness: "low", transitionTargets: ["stabilize", "clarify"], careSequence: ["validate", "stabilize", "sequence"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: true },
  careful_nonshaming_reflection: { semanticFrame: "identity_decompression", deliveryTone: "gentle_nonintrusive", expressionStyle: "plain_statement", followupStyle: "reflective", responseLength: "short", pacing: "steady", transitionReadiness: "low", transitionTargets: ["stabilize", "clarify"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: false },
  validate_and_gently_activate: { semanticFrame: "depletion_support", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "reflective", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["clarify", "activate"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: true },
  affirm_and_channel: { semanticFrame: "momentum_preservation", deliveryTone: "warm_affirming", expressionStyle: "plain_statement", followupStyle: "direct_answer_then_one_question", responseLength: "short", pacing: "steady", transitionReadiness: "high", transitionTargets: ["maintain", "channel"], adviceLevel: "low", shouldAskFollowup: true, shouldOfferNextStep: true },
  soft_probe_first: { semanticFrame: "guarded_attunement", deliveryTone: "gentle_nonintrusive", expressionStyle: "plain_statement", followupStyle: "soft_probe", responseLength: "short", pacing: "slow", transitionReadiness: "low", transitionTargets: ["validate", "clarify"], adviceLevel: "minimal", shouldAskFollowup: true, shouldOfferNextStep: false },
  clarify_and_sequence: { semanticFrame: "clarity_building", deliveryTone: "steadying", expressionStyle: "plain_statement", followupStyle: "reflective", responseLength: "medium", pacing: "steady", transitionReadiness: "medium", transitionTargets: ["clarify"], adviceLevel: "medium", shouldAskFollowup: true, shouldOfferNextStep: true }
});

function _pickSupportMode(routed = {}, psychology = {}, emotion = {}, supportFlags = {}) {
  const route = _safeObj(psychology.route);
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  if (_safeObj(supportFlags).crisis) return "crisis_escalation";
  if (_safeObj(supportFlags).needsContainment && _safeObj(supportFlags).highDistress) return "acute_regulation";
  if (_safeObj(supportFlags).suppressed || _safeObj(supportFlags).guardedness) return "soft_probe_first";
  const resolved = _trim(record.supportMode || route.supportMode || routed.supportMode || "");
  if (resolved) return resolved;
  const primaryEmotion = _lower(_safeObj(emotion.primary).emotion || emotion.primaryEmotion || "");
  if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(primaryEmotion)) return "soothe_and_structure";
  if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(primaryEmotion)) return "acute_regulation";
  return "clarify_and_sequence";
}

function _resolveModePlan(mode) {
  return _safeObj(MODE_DEFAULTS[mode]) || _safeObj(MODE_DEFAULTS.clarify_and_sequence);
}

function _resolveBlendProfile(emotion = {}) {
  const primary = _safeObj(emotion.primary);
  const raw = _safeObj(emotion.blendProfile || emotion.blend_profile || {});
  const out = {};
  for (const [key, value] of Object.entries(raw.weights || raw)) {
    const k = _lower(key);
    const v = _clamp(value, 0, 1);
    if (k && v > 0) out[k] = Number(v.toFixed(3));
  }
  if (!Object.keys(out).length && _trim(primary.emotion || emotion.primaryEmotion)) {
    const p = _lower(primary.emotion || emotion.primaryEmotion);
    const s = _lower(primary.secondaryEmotion || emotion.secondaryEmotion || "");
    out[p] = Number(_clamp(primary.weight || 0.7, 0.45, 1).toFixed(3));
    if (s && s !== p) out[s] = Number((1 - out[p]).toFixed(3));
  }
  const sorted = Object.entries(out).sort((a, b) => b[1] - a[1]);
  return { weights: out, dominantAxis: sorted[0] ? sorted[0][0] : (_lower(primary.emotion || emotion.primaryEmotion) || "neutral") };
}

function _resolveStateDrift(routed = {}, emotion = {}) {
  const drift = _safeObj(routed.stateDrift || emotion.stateDrift || emotion.state_drift);
  if (Object.keys(drift).length) {
    return {
      previousEmotion: _lower(drift.previousEmotion || drift.previous_emotion || ""),
      currentEmotion: _lower(drift.currentEmotion || drift.current_emotion || ""),
      trend: _lower(drift.trend || "stable") || "stable",
      stability: Number(_clamp(drift.stability, 0, 1).toFixed(3))
    };
  }
  const primary = _safeObj(emotion.primary);
  return {
    previousEmotion: _lower(_safeObj(_safeObj(routed.previousTurn).emotion).primaryEmotion || ""),
    currentEmotion: _lower(primary.emotion || emotion.primaryEmotion || "neutral"),
    trend: "stable",
    stability: 0.75
  };
}

function _resolveRiskLevel(supportFlags = {}, psychology = {}, primaryEmotion = {}) {
  if (_safeObj(supportFlags).crisis) return "critical";
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  const route = _safeObj(psychology.route);
  const declared = _lower(record.riskLevel || route.riskLevel || psychology.riskLevel || "");
  if (declared) return declared;
  return _clamp(primaryEmotion.intensity, 0, 1) >= 0.82 || _safeObj(supportFlags).highDistress ? "high" : "low";
}

function _buildGuidance(modePlan, psychology = {}, routed = {}, supportFlags = {}) {
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  const supportProfile = _safeObj(primary.supportProfile);
  return _uniq([])
    .concat(_safeArray(record.responseGuidance))
    .concat(_safeArray(supportProfile.responseShape))
    .concat(_safeArray(routed.guidance))
    .concat(_safeObj(supportFlags).suppressed ? ["Do not overinterpret guarded language."] : [])
    .concat(_safeObj(supportFlags).needsContainment ? ["Keep the next move singular and bounded."] : [])
    .concat(modePlan.shouldAskFollowup ? ["Ask at most one follow-up unless the user clearly opens the door further."] : [])
    .concat(["Keep Marion as the sole interpreter and let Nyx express the resolved state only."]);
}

function _buildGuardrails(modePlan, psychology = {}, routed = {}, supportFlags = {}) {
  const primary = _safeObj(psychology.primary);
  const record = _safeObj(primary.record);
  const supportProfile = _safeObj(primary.supportProfile);
  return _uniq([])
    .concat(_safeArray(record.contraindications))
    .concat(_safeArray(supportProfile.constraints))
    .concat(_safeArray(routed.guardrails))
    .concat(_safeObj(supportFlags).suppressed ? ["Do not force disclosure."] : [])
    .concat(_safeObj(supportFlags).crisis ? ["Stop normal flow and prioritize safety language."] : [])
    .concat(["Do not allow bridge-level improvisation to override the response contract."]);
}

function _makeSupportReply(primaryEmotion, supportMode, intensity) {
  const emo = _lower(primaryEmotion || "neutral");
  if (supportMode === "crisis_escalation") {
    return "I am here with you. Your safety comes first right now. If you are in immediate danger or might act on this, call emergency services or a crisis line right now.";
  }
  if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(emo)) {
    return intensity >= 0.8
      ? "I hear how heavy this feels. You do not have to hold all of it at once. What feels heaviest right now?"
      : "I hear the weight in that. You do not have to carry it alone in this moment. What has been sitting on you the most?";
  }
  if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(emo)) {
    return "I am with you. Let us slow this down and take the most urgent piece first. What feels hardest right now?";
  }
  if (["anger", "frustration"].includes(emo)) {
    return "I can feel the pressure in that. Let us keep it steady and look at the part that needs attention first.";
  }
  return "I am with you. Tell me what feels most important right now.";
}

function _buildFollowUps(modePlan, primaryEmotion, supportFlags = {}) {
  if (supportFlags.crisis) return [];
  if (!modePlan.shouldAskFollowup) return [];
  const emo = _lower(primaryEmotion || "neutral");
  if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(emo)) {
    return ["What has been sitting on you the most?"];
  }
  if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(emo)) {
    return ["What feels hardest right now?"];
  }
  return ["What feels most important right now?"];
}

function composeMarionResponse(routed = {}, input = {}) {
  const primaryDomain = _trim(routed.primaryDomain || routed.domain || input.requestedDomain || input.domain || "general") || "general";
  const domains = _safeObj(routed.domains);
  const psychology = _safeObj(domains.psychology || routed.psychology);
  const emotion = _safeObj(domains.emotion || routed.emotion);
  const classified = _safeObj(routed.classified);
  const supportFlags = _normalizeSupportFlags(
    routed.supportFlags,
    emotion.supportFlags,
    _safeObj(_safeObj(_safeObj(psychology.primary).record).supportFlags)
  );
  const conversationState = _resolveConversationState(routed, input);

  const primaryEmotion = _safeObj(emotion.primary || emotion);
  const normalizedPrimaryEmotion = _trim(primaryEmotion.emotion || emotion.primaryEmotion || "neutral") || "neutral";
  const supportMode = _pickSupportMode(routed, psychology, emotion, supportFlags) || "clarify_and_sequence";
  const modePlan = _resolveModePlan(supportMode);
  const blendProfile = _resolveBlendProfile(emotion);
  const stateDrift = _resolveStateDrift(routed, emotion);
  const riskLevel = _resolveRiskLevel(supportFlags, psychology, primaryEmotion);
  const emotionPayload = _buildEmotionPayload(primaryEmotion, emotion, supportFlags);

  const escalationProfile = _resolveEscalationProfile(routed, input, supportFlags, conversationState, primaryEmotion);
  const responsePlan = {
    semanticFrame: modePlan.semanticFrame,
    deliveryTone: escalationProfile.shouldSolve ? "steadying_directive" : modePlan.deliveryTone,
    expressionStyle: escalationProfile.shouldDeepen ? "state_aware_reflection" : modePlan.expressionStyle,
    followupStyle: escalationProfile.shouldSolve ? "explore_then_direct" : (escalationProfile.shouldDeepen ? "deep_reflection" : modePlan.followupStyle),
    responseLength: escalationProfile.shouldDeepen ? "medium" : modePlan.responseLength,
    pacing: modePlan.pacing,
    transitionReadiness: escalationProfile.shouldSolve ? "high" : modePlan.transitionReadiness,
    transitionTargets: modePlan.transitionTargets,
    careSequence: modePlan.careSequence,
    adviceLevel: escalationProfile.shouldSolve ? "medium" : modePlan.adviceLevel
  };

  const sourcePrimary = _safeObj(psychology.primary);
  const record = _safeObj(sourcePrimary.record);
  const interpretation =
    _trim(record.interpretation) ||
    _trim(record.summary) ||
    _trim(routed.interpretation) ||
    (_trim(normalizedPrimaryEmotion) ? `Resolved emotional posture: ${normalizedPrimaryEmotion}.` : "Resolved posture held.");

  const resolvedReply = _resolveFinalReply(
    routed,
    input,
    normalizedPrimaryEmotion,
    supportMode,
    _clamp(primaryEmotion.intensity != null ? primaryEmotion.intensity : emotion.intensity, 0, 1),
    conversationState,
    escalationProfile
  );
  const reply = resolvedReply.reply;
  const followUps = _uniq(_buildEscalatedFollowUps(modePlan, normalizedPrimaryEmotion, supportFlags, conversationState, escalationProfile)).filter((item) => _lower(item) !== _lower(reply));
  const strategy = { ..._buildStrategyPayload(supportMode, modePlan, routed, psychology), escalationMode: escalationProfile.mode, shouldDeepen: !!escalationProfile.shouldDeepen, shouldSolve: !!escalationProfile.shouldSolve };
  const pipelineTrace = _buildPipelineTrace(primaryDomain, supportMode, riskLevel, emotionPayload, strategy, reply, followUps);

  try {
    console.log("[MARION] composeMarionResponse resolve", {
      domain: primaryDomain,
      emotion: normalizedPrimaryEmotion,
      supportMode,
      riskLevel,
      replyPreview: _trim(reply).slice(0, 120),
      forcedEmotionalExecution: true
    });
  } catch (_e) {}

  return {
    ok: true,
    matched: !!(psychology.matched || emotion.matched || _safeArray(sourcePrimary.matches).length),
    domain: primaryDomain,
    interpretation,
    reply,
    output: reply,
    followUps,
    supportMode,
    routeBias: _trim(record.routeBias || _safeObj(psychology.route).routeBias || routed.routeBias || "clarify") || "clarify",
    riskLevel,
    supportFlags,
    mode: modePlan.semanticFrame,
    intent: _trim(routed.intent || _safeObj(routed.classified).intent || _safeObj(input).intent || "general").toLowerCase() || "general",
    emotion: emotionPayload,
    strategy,
    conversationState,
    escalationProfile,
    responsePlan,
    blendProfile,
    stateDrift,
    guidance: _buildGuidance(modePlan, psychology, routed, supportFlags),
    guardrails: _buildGuardrails(modePlan, psychology, routed, supportFlags),
    nyxDirective: {
      tonePosture: responsePlan.deliveryTone,
      pacing: responsePlan.pacing,
      responseLength: responsePlan.responseLength,
      followupStyle: responsePlan.followupStyle,
      askAtMost: modePlan.shouldAskFollowup ? 1 : 0,
      shouldOfferNextStep: !!modePlan.shouldOfferNextStep,
      shouldMirrorIntensity: false,
      expressiveRole: "express_resolved_state_only"
    },
    source: {
      domain: primaryDomain,
      subdomain: _trim(record.subdomain) || null,
      topic: _trim(record.topic) || null,
      recordId: _trim(record.id) || null,
      routeRuleId: _trim(_safeObj(psychology.route).ruleId) || null,
      emotion: normalizedPrimaryEmotion || null,
      emotionIntensity: _clamp(primaryEmotion.intensity != null ? primaryEmotion.intensity : emotion.intensity, 0, 1),
      matchScore: _num(sourcePrimary.score, 0)
    },
    diagnostics: {
      classifier: classified.classifications || {},
      psychologyMatched: !!psychology.matched,
      emotionMatched: !!emotion.matched,
      supportFlagCount: Object.keys(_safeObj(supportFlags)).length,
      forcedEmotionalExecution: true,
      responsePlanResolved: !!Object.keys(responsePlan).length,
      continuityDepth: _num(conversationState.depthLevel, 1),
      threadContinuation: !!conversationState.threadContinuation,
      escalationMode: escalationProfile.mode,
      escalationShouldDeepen: !!escalationProfile.shouldDeepen,
      escalationShouldSolve: !!escalationProfile.shouldSolve,
      handoffNormalized: true,
      replyResolvedFrom: resolvedReply.source
    },
    pipelineTrace,
    synthesis: {
      reply,
      followUps,
      supportMode,
      responsePlan,
      nyxDirective: {
        tonePosture: responsePlan.deliveryTone,
        pacing: responsePlan.pacing,
        responseLength: responsePlan.responseLength,
        followupStyle: responsePlan.followupStyle,
        askAtMost: modePlan.shouldAskFollowup ? 1 : 0,
        shouldOfferNextStep: !!modePlan.shouldOfferNextStep,
        shouldMirrorIntensity: false,
        expressiveRole: "express_resolved_state_only"
      },
      emotion: emotionPayload,
      strategy,
      conversationState,
      escalationProfile
    },
    matches: _safeArray(psychology.matches).map((m) => {
      const rec = _safeObj(_safeObj(m).record);
      return { recordId: _trim(rec.id) || null, subdomain: _trim(rec.subdomain) || null, topic: _trim(rec.topic) || null, score: _num(_safeObj(m).score, 0) };
    })
  };
}

module.exports = { composeMarionResponse };
