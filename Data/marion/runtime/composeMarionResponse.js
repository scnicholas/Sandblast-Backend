"use strict";

/**
 * composeMarionResponse.js
 * Cohesive Marion composition layer.
 */

const VERSION = "composeMarionResponse v1.5.0 AUTOPSY-HARDENED-EMISSION-SAFE-CONTINUITY";
const DEBUG_TAG = "[MARION] composeMarionResponse patch active";
const FALLBACK_REPLY = "I am here with you. Tell me what feels most important right now.";
try { console.log(DEBUG_TAG, VERSION); } catch (_e) {}

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function _clamp(v, min = 0, max = 1) { return Math.max(min, Math.min(max, _num(v, min))); }
function _uniq(arr) { return [...new Set(_safeArray(arr).map(_trim).filter(Boolean))]; }

const INTERNAL_BLOCKER_PATTERNS = [
  /marion input required before reply emission/i,
  /reply emission/i,
  /bridge rejected malformed marion output before nyx handoff/i,
  /bridge rejected/i,
  /authoritative_reply_missing/i,
  /packet_synthesis_reply_missing/i,
  /contract_missing/i,
  /packet_missing/i,
  /bridge_rejected/i,
  /marion_contract_invalid/i,
  /compose_marion_response_unavailable/i,
  /packet_invalid/i,
  /internal(?:-|\s)?pipeline/i,
  /runtime(?:-|\s)?trace/i,
  /route(?:_|\s)?guard/i,
  /telemetry/i,
  /shell is active/i,
  /guiding properly/i,
  /^working\.?$/i,
  /^ready\.?$/i,
  /^done\.?$/i
];

function _isInternalBlockerText(value = "") {
  const text = _trim(value);
  if (!text) return false;
  return INTERNAL_BLOCKER_PATTERNS.some((rx) => rx.test(text));
}

function _sanitizeEmissionText(value = "", fallback = FALLBACK_REPLY) {
  const text = _trim(value);
  if (!text || _isInternalBlockerText(text)) return _trim(fallback) || FALLBACK_REPLY;
  return text;
}

function _isWeakEmissionText(value = "") {
  const text = _trim(value);
  if (!text) return true;
  if (_isInternalBlockerText(text)) return true;
  if (text.length < 2) return true;
  return false;
}

function _ensureUsableReply(value = "", fallback = FALLBACK_REPLY) {
  const sanitized = _sanitizeEmissionText(value, fallback);
  return _isWeakEmissionText(sanitized) ? (_trim(fallback) || FALLBACK_REPLY) : sanitized;
}


function _harmonizeReplyBundle(reply = "", followUps = []) {
  const normalizedReply = _ensureUsableReply(reply, FALLBACK_REPLY);
  const followUpsStrings = _uniq(_safeArray(followUps).map((item) => _trim(item)).filter(Boolean).filter((item) => !_isInternalBlockerText(item)).filter((item) => _lower(item) !== _lower(normalizedReply)));
  return {
    reply: normalizedReply,
    text: normalizedReply,
    answer: normalizedReply,
    output: normalizedReply,
    displayReply: normalizedReply,
    spokenText: normalizedReply.replace(/\n+/g, " ").trim(),
    followUpsStrings
  };
}


function _normalizeSupportFlags() {
  const merged = {};
  for (const src of arguments) {
    const obj = _safeObj(src);
    for (const [key, value] of Object.entries(obj)) {
      const keyName = _trim(key);
      if (!keyName) continue;
      merged[keyName] = !!value;
    }
  }

  if (merged.guarded && !("guardedness" in merged)) merged.guardedness = true;
  if (merged.suppressionPresent && !("suppressed" in merged)) merged.suppressed = true;
  if (merged.forcedPositivity && !("suppressed" in merged)) merged.suppressed = true;
  if (merged.minimization && !("suppressed" in merged)) merged.suppressed = true;
  if (merged.needsContainment && !("needsGrounding" in merged)) merged.needsGrounding = true;
  if (merged.needsConnection && !("vulnerable" in merged)) merged.vulnerable = true;

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
  const prevMemory = _safeObj(input.previousMemory);
  const prevPatch = _safeObj(prevMemory.memoryPatch);
  const previousState = _safeObj(prevMemory.conversationState || prevMemory.continuityState || prevPatch.conversationState);
  const lastTopics = _uniq([].concat(_safeArray(state.lastTopics)).concat(_safeArray(previousState.lastTopics))).slice(0, 6);
  const unresolvedSignals = _uniq([].concat(_safeArray(state.unresolvedSignals)).concat(_safeArray(previousState.unresolvedSignals))).slice(0, 6);
  const repetitionCount = Math.max(0, _num(state.repetitionCount, previousState.repetitionCount || prevMemory.repetitionCount || 0));
  const depthLevel = Math.max(1, Math.min(6, _num(state.depthLevel, previousState.depthLevel || prevMemory.depthLevel || (repetitionCount > 0 ? 2 : 1))));
  const threadContinuation = !!(state.threadContinuation || previousState.threadContinuation || unresolvedSignals.length || depthLevel > 1);
  return {
    previousEmotion: _lower(state.previousEmotion || _safeObj(state.lastEmotion).previousEmotion || previousState.previousEmotion || ""),
    currentEmotion: _lower(_safeObj(state.lastEmotion).primaryEmotion || previousState.currentEmotion || ""),
    emotionTrend: _lower(state.emotionTrend || previousState.emotionTrend || "stable") || "stable",
    lastTopics,
    repetitionCount,
    depthLevel,
    unresolvedSignals,
    threadContinuation,
    continuityMode: _trim(state.continuityMode || previousState.continuityMode || (threadContinuation ? "deepen" : "stabilize")) || "stabilize"
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
  return _ensureUsableReply(`${lead} ${base}`.trim(), base || FALLBACK_REPLY);
}

function _buildStateAwareFollowUps(modePlan, primaryEmotion, supportFlags = {}, conversationState = {}) {
  if (supportFlags.crisis) return [];
  if (!modePlan.shouldAskFollowup) return [];
  const state = _safeObj(conversationState);
  const emo = _lower(primaryEmotion || "neutral");
  if (_num(state.depthLevel, 1) >= 3 || state.threadContinuation) {
    if (["sadness", "sad", "depressed", "loneliness", "grief", "hurt", "hurting"].includes(emo)) {
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


function _resolveArcState(routed = {}, input = {}, primaryEmotion = "", conversationState = {}, escalationProfile = {}) {
  const prevMemory = _safeObj(input.previousMemory);
  const prevPatch = _safeObj(prevMemory.memoryPatch);
  const prev = _safeObj(prevMemory.arcState || prevPatch.arcState);
  const currentEmotion = _normalizeEmotionAlias(primaryEmotion || conversationState.currentEmotion || "");
  const topics = _safeArray(conversationState.lastTopics).slice(0, 6);
  const anchorTopic = _trim(topics[0] || prev.anchorTopic || currentEmotion || "general") || "general";
  const anchorPerson = topics.find((t) => ["cait"].includes(_lower(t))) || _trim(prev.anchorPerson || "");
  const depth = Math.max(1, _num(conversationState.depthLevel, 1));
  const arcState = _safeObj(input.arcState || _safeObj(_safeObj(input.previousMemory).memoryPatch).arcState || input.arcState);
  const engagementState = _safeObj(input.engagementState || _safeObj(_safeObj(input.previousMemory).memoryPatch).engagementState || input.engagementState);
  const highSolve = !!_safeObj(escalationProfile).shouldSolve;
  let arcType = _trim(prev.arcType || "");
  if (!arcType) arcType = highSolve ? "problem_solving" : (currentEmotion === "sadness" ? "connection_building" : "emotional_processing");
  let stage = "opening";
  if (highSolve) stage = "resolution";
  else if (depth >= 5) stage = "reframing";
  else if (depth >= 4) stage = "differentiation";
  else if (depth >= 3) stage = "deepening";
  const objectiveMap = {
    emotional_processing: "help the user name the real pressure under the feeling",
    problem_solving: "turn recurring pressure into one useful next move",
    identity_reflection: "surface the meaning beneath the immediate sentence",
    connection_building: "increase trust and felt understanding without overreaching"
  };
  return {
    arcType,
    stage,
    objective: objectiveMap[arcType] || objectiveMap.identity_reflection,
    tension: Number(_clamp((_num(conversationState.repetitionCount, 0) * 0.18) + _num(_safeObj(escalationProfile).intensity, 0), 0, 1).toFixed(3)),
    resolved: highSolve && _num(conversationState.repetitionCount, 0) <= 1,
    anchorTopic,
    anchorPerson: anchorPerson || null,
    lastShiftAt: Date.now()
  };
}

function _resolveEngagementState(input = {}, conversationState = {}, escalationProfile = {}) {
  const behavior = _safeObj(input.behavior || input.userBehavior);
  const prevMemory = _safeObj(input.previousMemory);
  const prevPatch = _safeObj(prevMemory.memoryPatch);
  const previous = _safeObj(prevMemory.engagementState || prevPatch.engagementState);
  const messageLength = Math.max(0, _num(behavior.messageLength, 0));
  const openness = Number(_clamp(
    (previous.openness || 0.35)
    + (messageLength > 140 ? 0.22 : messageLength > 60 ? 0.12 : 0)
    + (_safeArray(conversationState.unresolvedSignals).length ? 0.08 : 0),
    0, 1).toFixed(3));
  const brevity = Number(_clamp(messageLength ? 1 - (messageLength / 220) : (previous.brevity || 0.75), 0, 1).toFixed(3));
  const volatility = Number(_clamp(_num(behavior.volatility, previous.volatility || 0.2), 0, 1).toFixed(3));
  const receptivity = Number(_clamp((openness * 0.65) + ((1 - volatility) * 0.35), 0, 1).toFixed(3));
  const engagementLevel = receptivity >= 0.72 ? "high" : receptivity >= 0.48 ? "medium" : "low";
  const preferredCadence = _safeObj(escalationProfile).shouldSolve ? "directive" : (engagementLevel === "high" ? "deepening" : "tight");
  return { engagementLevel, openness, brevity, volatility, receptivity, preferredCadence };
}

function _resolveRelationalStyle(input = {}, conversationState = {}, engagementState = {}, escalationProfile = {}) {
  const prevMemory = _safeObj(input.previousMemory);
  const prevPatch = _safeObj(prevMemory.memoryPatch);
  const previous = _safeObj(prevMemory.relationalStyle || prevPatch.relationalStyle);
  const gravity = Number(_clamp(previous.gravity || (_num(conversationState.depthLevel, 1) * 0.12), 0.35, 0.85).toFixed(3));
  const warmth = Number(_clamp(previous.warmth || (engagementState.engagementLevel === "high" ? 0.76 : 0.62), 0.45, 0.9).toFixed(3));
  const directness = Number(_clamp(previous.directness || (_safeObj(escalationProfile).shouldSolve ? 0.72 : 0.56), 0.35, 0.88).toFixed(3));
  return {
    warmth,
    gravity,
    directness,
    invitationStyle: engagementState.engagementLevel === "high" ? "soft_magnetic" : "clean_direct",
    intimacyCeiling: _safeObj(escalationProfile).shouldDeepen ? "measured_warm" : "measured",
    validationDensity: _num(conversationState.depthLevel, 1) <= 2 ? "light" : "minimal"
  };
}

function _applyRelationalPhrasing(reply = "", relationalStyle = {}, engagementState = {}, arcState = {}) {
  const base = _trim(reply);
  if (!base) return "";
  const lowerBase = _lower(base);
  if (lowerBase.startsWith("stay with me for a second.") || lowerBase.startsWith("let us get precise for a second.") || lowerBase.startsWith("there is a little more under that.")) return base;
  const style = _safeObj(relationalStyle);
  const engagement = _safeObj(engagementState);
  const arc = _safeObj(arcState);
  let opener = "";
  if (engagement.preferredCadence === "directive" && style.directness >= 0.68) opener = "Let us get precise for a second.";
  else if (/deepening|differentiation|reframing/.test(_trim(arc.stage)) && style.gravity >= 0.55) opener = "Stay with me for a second.";
  else if (engagement.engagementLevel === "high" && style.invitationStyle === "soft_magnetic") opener = "There is a little more under that.";
  return opener ? `${opener} ${base}` : base;
}

function _isMetaResponse(reply = "") {
  const text = _lower(reply).replace(/\s+/g, " ").trim();
  if (!text) return false;
  const patterns = [
    "i'm following the thread",
    "i am following the thread",
    "push the next layer",
    "continue the thread",
    "stay with the thread",
    "not starting cold",
    "next layer instead of",
    "restating the surface",
    "expand on that a bit",
    "so push the next layer"
  ];
  return patterns.some((pattern) => text.includes(pattern));
}

function _rewriteMetaToHuman(reply = "", primaryEmotion = "", conversationState = {}) {
  const emo = _normalizeEmotionAlias(primaryEmotion || _safeObj(conversationState).currentEmotion || "");
  if (emo === "sadness") {
    return "You do not have to push anything forward right now. Just tell me what part of this is still sitting with you.";
  }
  if (emo === "fear") {
    return "Let us slow this down for a second. What feels like it is pressing on you the most right now?";
  }
  if (emo === "anger") {
    return "Something here clearly is not sitting right. What part of it is actually crossing the line for you?";
  }
  return "Stay with me here. What feels most real in this for you right now?";
}

function _humanizeMetaReply(reply = "", primaryEmotion = "", conversationState = {}, relationalStyle = {}, engagementState = {}, arcState = {}) {
  const cleaned = _trim(reply);
  if (!cleaned) return "";
  if (!_isMetaResponse(cleaned)) return cleaned;
  return _applyRelationalPhrasing(
    _rewriteMetaToHuman(cleaned, primaryEmotion, conversationState),
    relationalStyle,
    engagementState,
    arcState
  );
}


function _normalizeEmotionAlias(value = "") {
  const emo = _lower(value);
  if (["sad", "depressed", "lonely", "loneliness", "grief", "heartbroken", "hurt", "hurting"].includes(emo)) return "sadness";
  if (["anxious", "panic", "overwhelmed", "overwhelm", "fear", "afraid"].includes(emo)) return "fear";
  if (["angry", "frustrated", "frustration", "mad"].includes(emo)) return "anger";
  return emo || "neutral";
}

function _isGenericLoopReply(reply = "") {
  const text = _lower(reply).replace(/\s+/g, " ").trim();
  if (!text) return true;
  const bannedPatterns = [
    "i have the thread",
    "give me one clean beat more",
    "i will answer directly without flattening",
    "tell me the next piece",
    "stay with the next honest piece",
    "continue the thread",
    "give me one more",
    "one clean beat more",
    "the real thread",
    "answer directly without flattening",
    "tell me one more",
    "stay with this thread"
  ];
  return bannedPatterns.some((snippet) => text.includes(snippet));
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

function _shouldHonorDraftReply(candidateReply = "", escalationProfile = {}, primaryEmotion = "", conversationState = {}, input = {}) {
  const reply = _trim(candidateReply);
  if (!reply) return false;
  if (_isInternalBlockerText(reply)) return false;
  if (_safeObj(input).allowExternalDraftOverride !== true) return false;
  if (_safeObj(escalationProfile).shouldDeepen) return false;
  if (_isGenericLoopReply(reply)) return false;
  return _looksEmotionSpecific(reply, primaryEmotion, conversationState);
}

function _functionSeed(text = "") {
  const s = _trim(text);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h >>> 0);
}

function _emotionFamily(primaryEmotion = "") {
  const emo = _normalizeEmotionAlias(primaryEmotion);
  if (["sadness", "fear", "anger"].includes(emo)) return emo;
  return "general";
}

function _responseFunctionBanks() {
  return {
    sadness: {
      trace: [
        "When did this start feeling heavier instead of just sad?",
        "What changed between missing them and feeling pulled under by it?",
        "When do you notice this loneliness hit the hardest?"
      ],
      differentiate: [
        "Is this more about missing Cait, or about missing how you felt when that connection was alive?",
        "Does this feel more like absence, rejection, or something unfinished that keeps reopening?",
        "Is the pain coming more from who is missing, or from what that absence says to you about your life now?"
      ],
      interpret: [
        "This does not sound like a passing mood. It sounds like an absence that keeps echoing after the moment itself is over.",
        "This feels less like one bad moment and more like something unresolved that keeps finding its way back in.",
        "There is grief-like weight in this, even if you are not naming it that way."
      ],
      solve: [
        "What would make tonight feel even ten percent less heavy in a real way?",
        "What do you need most here: comfort, contact, clarity, or a concrete shift in what happens next?",
        "What would actually help this feel less stuck instead of just more described?"
      ]
    },
    fear: {
      trace: [
        "When did this shift from stress into something that started running you?",
        "What is usually happening right before this pressure spikes again?",
        "When do you first notice the strain move from manageable to too much?"
      ],
      differentiate: [
        "Is this fear about one real risk, or about too many open loops stacking together?",
        "Does this feel more like urgency, uncertainty, or loss of control?",
        "Is the pressure coming from what is actually happening, or from what your mind keeps preparing for?"
      ],
      interpret: [
        "This sounds like your system staying braced, not just your thoughts running fast.",
        "There is a pattern of anticipatory pressure here, not just a single hard moment.",
        "This feels like accumulation more than randomness."
      ],
      solve: [
        "What is the next controllable move here, even if it is small?",
        "Which part of this actually needs action first, and which part only needs to stop getting fed?",
        "What would reduce the pressure fastest without making the rest worse?"
      ]
    },
    anger: {
      trace: [
        "When did this stop being irritating and start feeling personal?",
        "What keeps bringing you back to the same pressure point?",
        "At what point did this start feeling like too much rather than just frustrating?"
      ],
      differentiate: [
        "Is this more about disrespect, blockage, or having to carry what should not be yours?",
        "Are you angrier about what happened, or about what keeps not changing?",
        "Does this feel more like crossed boundaries or accumulated pressure?"
      ],
      interpret: [
        "This feels like a pattern your system is tired of tolerating.",
        "There is more than irritation here. There is a sense that something keeps staying unresolved.",
        "This sounds like repeated friction, not just a single flare-up."
      ],
      solve: [
        "What specifically needs to stop, change, or be confronted for this to ease?",
        "What boundary or decision would actually reduce this pressure?",
        "What action would move this from circular to resolved?"
      ]
    },
    general: {
      trace: [
        "When did this start feeling heavier than you expected?",
        "What has been building underneath this that keeps bringing it back?",
        "Where do you feel the shift from surface stress into something deeper?"
      ],
      differentiate: [
        "What is this really about underneath the latest sentence?",
        "Is this more about the event itself, or what it means to you?",
        "Which part of this is immediate, and which part goes deeper than today?"
      ],
      interpret: [
        "This feels like a recurring pattern, not an isolated moment.",
        "There is more continuity here than your last line alone would suggest.",
        "This sounds like something that keeps returning because it has not actually resolved."
      ],
      solve: [
        "What would make this feel more resolved, not just more discussed?",
        "What next move would create real relief here?",
        "What would help this situation shift in a meaningful way today?"
      ]
    }
  };
}

function _selectResponseFunction(primaryEmotion = "", escalationProfile = {}, conversationState = {}, input = {}) {
  const prev = _safeObj(input.previousMemory || {});
  const memoryPatch = _safeObj(prev.memoryPatch);
  const lastFn = _lower(
    conversationState.lastResponseFunction ||
    memoryPatch.lastResponseFunction ||
    prev.lastResponseFunction ||
    prev.responseFunction ||
    ""
  );
  const depth = Math.max(1, _num(conversationState.depthLevel, 1));
  const arcState = _safeObj(input.arcState || _safeObj(_safeObj(input.previousMemory).memoryPatch).arcState || input.arcState);
  const engagementState = _safeObj(input.engagementState || _safeObj(_safeObj(input.previousMemory).memoryPatch).engagementState || input.engagementState);
  const repetition = Math.max(0, _num(conversationState.repetitionCount, 0));
  let pool = [];
  if (_trim(arcState.stage) === "resolution" || _safeObj(escalationProfile).shouldSolve) pool = ["differentiate", "interpret", "solve"];
  else if (_trim(arcState.stage) === "reframing") pool = ["interpret", "differentiate", "solve"];
  else if (_trim(engagementState.preferredCadence) === "tight" && !_safeObj(escalationProfile).shouldDeepen) pool = ["clarify", "trace"];
  else if (_safeObj(escalationProfile).shouldDeepen && depth >= 5) pool = ["interpret", "differentiate", "trace", "solve"];
  else if (_safeObj(escalationProfile).shouldDeepen && depth >= 3) pool = repetition >= 2 ? ["trace", "differentiate", "interpret"] : ["differentiate", "trace", "interpret"];
  else if (lastFn === "clarify") pool = ["trace", "differentiate"];
  else pool = ["clarify", "trace"];
  const effectivePool = pool.filter((name) => name !== lastFn);
  const finalPool = effectivePool.length ? effectivePool : pool;
  const seed = _functionSeed(`${conversationState.lastQuery || ""}|${conversationState.repetitionCount || 0}|${conversationState.depthLevel || 0}|${primaryEmotion}|${lastFn}|${_trim(conversationState.previousEmotion || "")}`);
  return finalPool[seed % finalPool.length] || finalPool[0] || "clarify";
}

function _buildFunctionReply(primaryEmotion = "", selectedFunction = "clarify", conversationState = {}, escalationProfile = {}, arcState = {}, engagementState = {}) {
  const family = _emotionFamily(primaryEmotion);
  const banks = _responseFunctionBanks();
  if (selectedFunction === "clarify") {
    return _trim(_safeObj(engagementState).engagementLevel) === "low"
      ? "Keep it simple for me. What part of this matters most right now?"
      : "I am with you. Tell me what feels most important right now.";
  }
  const choices = _safeArray(_safeObj(banks[family])[selectedFunction] || _safeObj(banks.general)[selectedFunction]);
  if (!choices.length) return "I am with you. Tell me what feels most important right now.";
  const seed = _functionSeed(`${conversationState.lastQuery || ""}|${selectedFunction}|${conversationState.depthLevel || 0}|${conversationState.repetitionCount || 0}|${_trim(_safeObj(arcState).stage)}|${_trim(_safeObj(engagementState).engagementLevel)}`);
  return choices[seed % choices.length];
}

function _buildFunctionFollowUps(primaryEmotion = "", selectedFunction = "clarify", escalationProfile = {}, conversationState = {}, arcState = {}, engagementState = {}) {
  const nextMap = {
    clarify: ["trace", "differentiate"],
    trace: ["differentiate", "interpret"],
    differentiate: [_safeObj(escalationProfile).shouldSolve ? "solve" : "interpret", "trace"],
    interpret: [_safeObj(escalationProfile).shouldSolve ? "solve" : "differentiate", "trace"],
    solve: ["differentiate", "solve"]
  };
  const options = _safeArray(nextMap[selectedFunction]);
  const nextFn = options.length > 1
    ? options[_functionSeed(`${conversationState.lastQuery || ""}|${selectedFunction}|follow`) % options.length]
    : (options[0] || "differentiate");
  const prompt = _buildFunctionReply(primaryEmotion, nextFn, conversationState, escalationProfile, arcState, engagementState);
  return prompt ? [prompt] : [];
}

function _resolveFinalReply(routed = {}, input = {}, primaryEmotion = "", supportMode = "clarify_and_sequence", intensity = 0, conversationState = {}, escalationProfile = {}, arcState = {}, engagementState = {}, relationalStyle = {}) {
  const selectedFunction = _selectResponseFunction(primaryEmotion, escalationProfile, conversationState, { ...input, arcState, engagementState });
  const generatedBase = _makeEscalatedReply(primaryEmotion, supportMode, intensity, { ...conversationState, selectedFunction }, escalationProfile, arcState, engagementState);
  const generated = _humanizeMetaReply(
    _applyRelationalPhrasing(generatedBase, relationalStyle, engagementState, arcState),
    primaryEmotion,
    conversationState,
    relationalStyle,
    engagementState,
    arcState
  );
  if (_safeObj(escalationProfile).shouldDeepen) {
    return { reply: generated, source: _isMetaResponse(generatedBase) ? "forced_meta_rewrite" : "forced_escalation_override", selectedFunction, authority: "marion" };
  }
  const assistantDraft = _trim(_safeObj(input).assistantDraft);
  if (_shouldHonorDraftReply(assistantDraft, escalationProfile, primaryEmotion, conversationState, input)) {
    return { reply: _ensureUsableReply(_humanizeMetaReply(assistantDraft, primaryEmotion, conversationState, relationalStyle, engagementState, arcState), FALLBACK_REPLY), source: "assistantDraft", selectedFunction, authority: "external_override" };
  }
  const inputReply = _trim(_safeObj(input).reply);
  if (_shouldHonorDraftReply(inputReply, escalationProfile, primaryEmotion, conversationState, input)) {
    return { reply: _ensureUsableReply(_humanizeMetaReply(inputReply, primaryEmotion, conversationState, relationalStyle, engagementState, arcState), FALLBACK_REPLY), source: "input.reply", selectedFunction, authority: "external_override" };
  }
  const routedReply = _trim(_safeObj(routed).reply);
  if (_shouldHonorDraftReply(routedReply, escalationProfile, primaryEmotion, conversationState, input)) {
    return { reply: _ensureUsableReply(_humanizeMetaReply(routedReply, primaryEmotion, conversationState, relationalStyle, engagementState, arcState), FALLBACK_REPLY), source: "routed.reply", selectedFunction, authority: "external_override" };
  }
  return { reply: _ensureUsableReply(_humanizeMetaReply(generated, primaryEmotion, conversationState, relationalStyle, engagementState, arcState), FALLBACK_REPLY), source: "marion_generated", selectedFunction, authority: "marion" };
}

function _makeEscalatedReply(primaryEmotion, supportMode, intensity, conversationState = {}, escalationProfile = {}, arcState = {}, engagementState = {}) {
  const emo = _lower(primaryEmotion || "neutral");
  const state = _safeObj(conversationState);
  const profile = _safeObj(escalationProfile);
  const shouldDeepen = !!profile.shouldDeepen;
  const shouldSolve = !!profile.shouldSolve;
  if (!shouldDeepen) {
    return _makeStateAwareReply(primaryEmotion, supportMode, intensity, conversationState);
  }
  const lead = _buildStateLead(state, primaryEmotion) || "I can feel this thread continuing.";
  const selectedFunction = _trim(state.selectedFunction || "") || _selectResponseFunction(primaryEmotion, escalationProfile, state, {});
  const functionalReply = _buildFunctionReply(primaryEmotion, selectedFunction, state, profile, arcState, engagementState);
  if (shouldSolve && selectedFunction === "solve") {
    return `${lead} ${functionalReply}`;
  }
  if (["sadness", "sad", "depressed", "loneliness", "grief"].includes(emo) && selectedFunction === "interpret") {
    return `${lead} ${functionalReply}`;
  }
  if (["fear", "anxiety", "panic", "overwhelm", "overwhelmed"].includes(emo) && selectedFunction === "interpret") {
    return `${lead} ${functionalReply}`;
  }
  return `${lead} ${functionalReply}`.trim();
}

function _buildEscalatedFollowUps(modePlan, primaryEmotion, supportFlags = {}, conversationState = {}, escalationProfile = {}, arcState = {}, engagementState = {}) {
  if (supportFlags.crisis) return [];
  const profile = _safeObj(escalationProfile);
  if (!profile.shouldDeepen) return _buildStateAwareFollowUps(modePlan, primaryEmotion, supportFlags, conversationState);
  const selectedFunction = _trim(_safeObj(conversationState).selectedFunction || "") || _selectResponseFunction(primaryEmotion, escalationProfile, conversationState, {});
  return _buildFunctionFollowUps(primaryEmotion, selectedFunction, escalationProfile, conversationState, arcState, engagementState);
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
  if (["sadness", "sad", "depressed", "loneliness", "grief", "hurt", "hurting"].includes(emo)) {
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
  if (["sadness", "sad", "depressed", "loneliness", "grief", "hurt", "hurting"].includes(emo)) {
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
  const arcState = _resolveArcState(routed, input, normalizedPrimaryEmotion, conversationState, escalationProfile);
  const engagementState = _resolveEngagementState(input, conversationState, escalationProfile);
  const relationalStyle = _resolveRelationalStyle(input, conversationState, engagementState, escalationProfile);
  const responsePlan = {
    semanticFrame: modePlan.semanticFrame,
    deliveryTone: escalationProfile.shouldSolve ? "steadying_directive" : (engagementState.engagementLevel === "high" ? "warm_gravity" : modePlan.deliveryTone),
    expressionStyle: escalationProfile.shouldDeepen ? "state_aware_reflection" : modePlan.expressionStyle,
    followupStyle: escalationProfile.shouldSolve ? "explore_then_direct" : (escalationProfile.shouldDeepen ? "deep_reflection" : modePlan.followupStyle),
    responseLength: engagementState.engagementLevel === "high" ? "medium" : (escalationProfile.shouldDeepen ? "medium" : modePlan.responseLength),
    pacing: engagementState.preferredCadence === "tight" ? "tight" : modePlan.pacing,
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
    escalationProfile,
    arcState,
    engagementState,
    relationalStyle
  );
  const replyBundle = _harmonizeReplyBundle(_ensureUsableReply(resolvedReply.reply || FALLBACK_REPLY, FALLBACK_REPLY));
  const selectedFunction = _trim(resolvedReply.selectedFunction || "") || (escalationProfile.shouldDeepen ? _selectResponseFunction(normalizedPrimaryEmotion, escalationProfile, conversationState, input) : "clarify");
  const followUps = _uniq(
    _buildEscalatedFollowUps(
      modePlan,
      normalizedPrimaryEmotion,
      supportFlags,
      { ...conversationState, selectedFunction },
      escalationProfile,
      arcState,
      engagementState
    )
  ).filter((item) => _trim(item) && _lower(item) !== _lower(replyBundle.reply) && !_isGenericLoopReply(item));
  const strategy = { ..._buildStrategyPayload(supportMode, modePlan, routed, psychology), escalationMode: escalationProfile.mode, shouldDeepen: !!escalationProfile.shouldDeepen, shouldSolve: !!escalationProfile.shouldSolve, arcStage: arcState.stage, engagementLevel: engagementState.engagementLevel };
  const finalReplyBundle = _harmonizeReplyBundle(_ensureUsableReply(replyBundle.reply, FALLBACK_REPLY), followUps);
  const pipelineTrace = _buildPipelineTrace(primaryDomain, supportMode, riskLevel, emotionPayload, strategy, finalReplyBundle.reply, finalReplyBundle.followUpsStrings);

  try {
    console.log("[MARION] composeMarionResponse resolve", {
      domain: primaryDomain,
      emotion: normalizedPrimaryEmotion,
      supportMode,
      riskLevel,
      replyPreview: _trim(finalReplyBundle.reply).slice(0, 120),
      forcedEmotionalExecution: true
    });
  } catch (_e) {}

  return {
    ok: true,
    matched: !!(psychology.matched || emotion.matched || _safeArray(sourcePrimary.matches).length),
    domain: primaryDomain,
    interpretation,
    reply: finalReplyBundle.reply,
    text: finalReplyBundle.text,
    answer: finalReplyBundle.answer,
    output: finalReplyBundle.output,
    displayReply: finalReplyBundle.displayReply,
    spokenText: finalReplyBundle.spokenText,
    followUps: finalReplyBundle.followUpsStrings,
    followUpsStrings: finalReplyBundle.followUpsStrings,
    supportMode,
    routeBias: _trim(record.routeBias || _safeObj(psychology.route).routeBias || routed.routeBias || "clarify") || "clarify",
    riskLevel,
    supportFlags,
    mode: modePlan.semanticFrame,
    intent: _trim(routed.intent || _safeObj(routed.classified).intent || _safeObj(input).intent || "general").toLowerCase() || "general",
    emotion: emotionPayload,
    strategy,
    conversationState: { ...conversationState, selectedFunction, lastResponseFunction: selectedFunction },
    escalationProfile,
    memoryPatch: { lastResponseFunction: selectedFunction, replyAuthority: _trim(resolvedReply.authority || "marion") || "marion", arcState, engagementState, relationalStyle, conversationState: { ...conversationState, selectedFunction, lastResponseFunction: selectedFunction }, unresolvedSignals: _safeArray(conversationState.unresolvedSignals), continuityMode: _trim(conversationState.continuityMode || "stabilize"), depthLevel: _num(conversationState.depthLevel, 1), threadContinuation: !!conversationState.threadContinuation, emissionSafe: true },
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
      expressiveRole: "express_resolved_state_only",
      allowNyxRewrite: false,
      allowReplySynthesis: false,
      singleSourceOfTruth: true
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
      replyResolvedFrom: resolvedReply.source,
      replyAuthority: _trim(resolvedReply.authority || "marion") || "marion",
      selectedFunction,
      arcStage: arcState.stage,
      arcType: arcState.arcType,
      engagementLevel: engagementState.engagementLevel,
      engagementCadence: engagementState.preferredCadence,
      emissionSafe: true,
      blockerGuardActive: true
    },
    pipelineTrace,
    synthesis: {
      reply: finalReplyBundle.reply,
      text: finalReplyBundle.text,
      answer: finalReplyBundle.answer,
      output: finalReplyBundle.output,
      spokenText: finalReplyBundle.spokenText,
      followUps: finalReplyBundle.followUpsStrings,
      followUpsStrings: finalReplyBundle.followUpsStrings,
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
        expressiveRole: "express_resolved_state_only",
      allowNyxRewrite: false,
      allowReplySynthesis: false,
      singleSourceOfTruth: true
      },
      emotion: emotionPayload,
      strategy,
      arcState,
      engagementState,
      relationalStyle,
      conversationState: { ...conversationState, selectedFunction, lastResponseFunction: selectedFunction },
      escalationProfile,
      memoryPatch: { lastResponseFunction: selectedFunction, arcState, engagementState, relationalStyle, conversationState: { ...conversationState, selectedFunction, lastResponseFunction: selectedFunction }, unresolvedSignals: _safeArray(conversationState.unresolvedSignals), continuityMode: _trim(conversationState.continuityMode || "stabilize"), depthLevel: _num(conversationState.depthLevel, 1), threadContinuation: !!conversationState.threadContinuation, emissionSafe: true, replyAuthority: _trim(resolvedReply.authority || "marion") || "marion" }
    },
    matches: _safeArray(psychology.matches).map((m) => {
      const rec = _safeObj(_safeObj(m).record);
      return { recordId: _trim(rec.id) || null, subdomain: _trim(rec.subdomain) || null, topic: _trim(rec.topic) || null, score: _num(_safeObj(m).score, 0) };
    })
  };
}

module.exports = { composeMarionResponse };
