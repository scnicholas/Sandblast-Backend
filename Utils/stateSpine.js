"use strict";

/**
 * Utils/stateSpine.js
 *
 * stateSpine v1.4.0 SUPPORT-LOCK LOOP-HARDEN
 * ------------------------------------------------------------
 * PURPOSE
 * - Maintain durable conversational progression state
 * - Prevent same-stage replay and shallow re-entry loops
 * - Keep support-lock / quiet-mode cohesion with chatEngine + index
 * - Terminalize repeated TTS/audio failures cleanly instead of re-entering
 * - Track emotion continuity so distress handling does not collapse too early
 * - Stay fail-open safe when upstream signals are partial
 */

const SPINE_VERSION = "stateSpine v1.8.0 SUPPORT-LOCK LOOP-HARDEN MARION-COMPOSER-COHESION";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.6";
const TERMINAL_AUDIO_STOP_MS = 30000;

function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

function isPlainObject(x) {
  return !!x && typeof x === "object" &&
    (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
}

function clampInt(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}

function hashText(v) {
  const s = safeStr(v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function nowMs() {
  return Date.now();
}

function canonicalIntent(value, fallback) {
  const raw = safeStr(value || fallback || "ADVANCE").trim();
  if (!raw) return "ADVANCE";
  return raw.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || "ADVANCE";
}

function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i += 1) {
    const s = oneLine(arguments[i]);
    if (s) return s;
  }
  return "";
}

function extractNested(obj, path) {
  let cur = obj;
  for (const key of path) {
    if (!isPlainObject(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}

function extractMarionObject(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const candidates = [
    p.marion, p.composer, p.contract, p.result, p.response, p.marionContract,
    inbound.marion, inbound.contract, inbound.result, inbound.response,
    meta.marion, meta.marionContract, meta.result,
    extractNested(inbound, ["meta", "marion"]),
    extractNested(inbound, ["meta", "marionContract"])
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) return candidate;
  }
  return {};
}

function extractComposerMemoryPatch(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  const candidates = [
    p.memoryPatch, inbound.memoryPatch, meta.memoryPatch, marion.memoryPatch, synthesis.memoryPatch,
    extractNested(marion, ["payload", "memoryPatch"]),
    extractNested(marion, ["meta", "memoryPatch"]),
    extractNested(inbound, ["payload", "memoryPatch"]),
    extractNested(inbound, ["meta", "memoryPatch"])
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) return candidate;
  }
  return {};
}

function extractComposerReply(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  return firstNonEmpty(
    p.reply, p.assistantText, p.assistantSummary,
    marion.reply, marion.text, marion.answer, marion.output, marion.response,
    payload.reply, payload.text, payload.answer, payload.output, payload.message,
    synthesis.reply, synthesis.text, synthesis.answer, synthesis.output,
    inbound.reply, inbound.response
  );
}

function hashUserTextForComposer(text) {
  return hashText(oneLine(text).toLowerCase());
}

function createState(seed = {}) {
  const lane = safeStr(seed.lane || "general") || "general";
  const stage = safeStr(seed.stage || "open") || "open";
  return {
    rev: 0,
    lane,
    stage,
    phase: inferPhaseFromStage(stage, false),
    domain: lane,
    lastIntent: "",
    lastAction: "",
    lastUserHash: "",
    lastAssistantHash: "",
    lastMove: "",
    lastRationale: "",
    lastPlannerMode: "",
    progressionLock: false,
    volatility: "stable",
    turns: { user: 0, assistant: 0 },
    repetition: {
      sameLaneCount: 0,
      sameStageCount: 0,
      sameIntentCount: 0,
      sameUserHashCount: 0,
      sameAssistantHashCount: 0,
      sameEmotionCount: 0,
      sameSupportModeCount: 0,
      sameArchetypeCount: 0,
      noProgressCount: 0,
      fallbackCount: 0
    },
    support: {
      lockActive: false,
      lockBias: "",
      quietTurns: 0,
      holdTurns: 0,
      reason: "",
      shouldSuppressMenus: false,
      supportMode: "",
      archetype: "",
      questionStyle: "",
      emotionKey: "",
      emotionCluster: ""
    },
    audio: {
      lastFailureReason: "",
      lastFailureStatus: 0,
      lastFailureAction: "",
      lastFailureRetryable: false,
      lastFailureAt: 0,
      terminalStopUntil: 0,
      terminalStopReason: "",
      lastSuccessAt: 0,
      lastPlayableAt: 0,
      lastPlayableKind: "",
      lastAudioUrl: "",
      lastAudioMimeType: "",
      lastAudioFormat: "",
      lastAudioChars: 0,
      playbackReady: false
    },
    emotionalEngine: {
      primaryState: "focused",
      secondaryState: "steady",
      continuityScore: 0.35,
      stateStreak: 0,
      placeholder: "Ask Nyx anything about Sandblast…",
      lastActionLabels: [],
      presenceState: "receptive",
      listenerMode: "attuned"
    },
    continuityThread: {
      depthLevel: 1,
      threadContinuation: false,
      unresolvedSignals: [],
      lastTopics: [],
      responseMode: "steady",
      updatedAt: 0
    },
    marionCohesion: {
      composerObserved: false,
      marionFinalObserved: false,
      lastComposerIntent: "",
      lastComposerDomain: "",
      lastComposerUserSignature: "",
      lastComposerReplySignature: "",
      lastMarionFinalSignature: "",
      statePatchRequired: false,
      shouldAdvanceState: false,
      noProgressCount: 0,
      updatedAt: 0
    },
    lastUpdatedAt: 0
  };
}

function coerceState(input) {
  const base = createState({
    lane: safeStr(input?.lane || "general"),
    stage: safeStr(input?.stage || "open")
  });
  const src = isPlainObject(input) ? input : {};
  return {
    ...base,
    ...src,
    lane: safeStr(src.lane || base.lane) || "general",
    stage: safeStr(src.stage || base.stage) || "open",
    phase: safeStr(src.phase || inferPhaseFromStage(src.stage || base.stage, !!src.progressionLock)) || "active",
    domain: safeStr(src.domain || src.lane || base.domain) || "general",
    lastIntent: safeStr(src.lastIntent || ""),
    lastAction: safeStr(src.lastAction || ""),
    lastUserHash: safeStr(src.lastUserHash || ""),
    lastAssistantHash: safeStr(src.lastAssistantHash || ""),
    lastMove: safeStr(src.lastMove || ""),
    lastRationale: safeStr(src.lastRationale || ""),
    lastPlannerMode: safeStr(src.lastPlannerMode || ""),
    progressionLock: !!src.progressionLock,
    volatility: safeStr(src.volatility || "stable") || "stable",
    turns: {
      user: clampInt(src?.turns?.user, 0, 0, 999999),
      assistant: clampInt(src?.turns?.assistant, 0, 0, 999999)
    },
    repetition: {
      sameLaneCount: clampInt(src?.repetition?.sameLaneCount, 0, 0, 999999),
      sameStageCount: clampInt(src?.repetition?.sameStageCount, 0, 0, 999999),
      sameIntentCount: clampInt(src?.repetition?.sameIntentCount, 0, 0, 999999),
      sameUserHashCount: clampInt(src?.repetition?.sameUserHashCount, 0, 0, 999999),
      sameAssistantHashCount: clampInt(src?.repetition?.sameAssistantHashCount, 0, 0, 999999),
      sameEmotionCount: clampInt(src?.repetition?.sameEmotionCount, 0, 0, 999999),
      sameSupportModeCount: clampInt(src?.repetition?.sameSupportModeCount, 0, 0, 999999),
      sameArchetypeCount: clampInt(src?.repetition?.sameArchetypeCount, 0, 0, 999999),
      noProgressCount: clampInt(src?.repetition?.noProgressCount, 0, 0, 999999),
      fallbackCount: clampInt(src?.repetition?.fallbackCount, 0, 0, 999999)
    },
    support: {
      lockActive: !!src?.support?.lockActive,
      lockBias: safeStr(src?.support?.lockBias || ""),
      quietTurns: clampInt(src?.support?.quietTurns, 0, 0, 999999),
      holdTurns: clampInt(src?.support?.holdTurns, 0, 0, 999999),
      reason: safeStr(src?.support?.reason || ""),
      shouldSuppressMenus: !!src?.support?.shouldSuppressMenus,
      supportMode: safeStr(src?.support?.supportMode || ""),
      archetype: safeStr(src?.support?.archetype || ""),
      questionStyle: safeStr(src?.support?.questionStyle || ""),
      emotionKey: safeStr(src?.support?.emotionKey || ""),
      emotionCluster: safeStr(src?.support?.emotionCluster || "")
    },
    audio: {
      lastFailureReason: safeStr(src?.audio?.lastFailureReason || ""),
      lastFailureStatus: clampInt(src?.audio?.lastFailureStatus, 0, 0, 999999),
      lastFailureAction: safeStr(src?.audio?.lastFailureAction || ""),
      lastFailureRetryable: !!src?.audio?.lastFailureRetryable,
      lastFailureAt: Number(src?.audio?.lastFailureAt || 0) || 0,
      terminalStopUntil: Number(src?.audio?.terminalStopUntil || 0) || 0,
      terminalStopReason: safeStr(src?.audio?.terminalStopReason || ""),
      lastSuccessAt: Number(src?.audio?.lastSuccessAt || 0) || 0,
      lastPlayableAt: Number(src?.audio?.lastPlayableAt || 0) || 0,
      lastPlayableKind: safeStr(src?.audio?.lastPlayableKind || ""),
      lastAudioUrl: safeStr(src?.audio?.lastAudioUrl || ""),
      lastAudioMimeType: safeStr(src?.audio?.lastAudioMimeType || ""),
      lastAudioFormat: safeStr(src?.audio?.lastAudioFormat || ""),
      lastAudioChars: clampInt(src?.audio?.lastAudioChars, 0, 0, 999999),
      playbackReady: !!src?.audio?.playbackReady
    },
    emotionalEngine: {
      primaryState: safeStr(src?.emotionalEngine?.primaryState || "focused") || "focused",
      secondaryState: safeStr(src?.emotionalEngine?.secondaryState || "steady") || "steady",
      continuityScore: Math.max(0, Math.min(1, Number(src?.emotionalEngine?.continuityScore ?? 0.35) || 0.35)),
      stateStreak: clampInt(src?.emotionalEngine?.stateStreak, 0, 0, 999999),
      placeholder: safeStr(src?.emotionalEngine?.placeholder || "Ask Nyx anything about Sandblast…") || "Ask Nyx anything about Sandblast…",
      lastActionLabels: Array.isArray(src?.emotionalEngine?.lastActionLabels) ? src.emotionalEngine.lastActionLabels.slice(0, 6).map((x) => safeStr(x)) : [],
      presenceState: safeStr(src?.emotionalEngine?.presenceState || "receptive") || "receptive",
      listenerMode: safeStr(src?.emotionalEngine?.listenerMode || "attuned") || "attuned"
    },
    continuityThread: {
      depthLevel: clampInt(src?.continuityThread?.depthLevel, 1, 1, 999999),
      threadContinuation: !!src?.continuityThread?.threadContinuation,
      unresolvedSignals: Array.isArray(src?.continuityThread?.unresolvedSignals) ? src.continuityThread.unresolvedSignals.slice(0, 6).map((x) => safeStr(x)) : [],
      lastTopics: Array.isArray(src?.continuityThread?.lastTopics) ? src.continuityThread.lastTopics.slice(0, 6).map((x) => safeStr(x)) : [],
      responseMode: safeStr(src?.continuityThread?.responseMode || "steady") || "steady",
      updatedAt: Number(src?.continuityThread?.updatedAt || 0) || 0
    },
    marionCohesion: {
      composerObserved: !!src?.marionCohesion?.composerObserved,
      marionFinalObserved: !!src?.marionCohesion?.marionFinalObserved,
      lastComposerIntent: safeStr(src?.marionCohesion?.lastComposerIntent || ""),
      lastComposerDomain: safeStr(src?.marionCohesion?.lastComposerDomain || ""),
      lastComposerUserSignature: safeStr(src?.marionCohesion?.lastComposerUserSignature || ""),
      lastComposerReplySignature: safeStr(src?.marionCohesion?.lastComposerReplySignature || ""),
      lastMarionFinalSignature: safeStr(src?.marionCohesion?.lastMarionFinalSignature || ""),
      statePatchRequired: !!src?.marionCohesion?.statePatchRequired,
      shouldAdvanceState: !!src?.marionCohesion?.shouldAdvanceState,
      noProgressCount: clampInt(src?.marionCohesion?.noProgressCount, 0, 0, 999999),
      updatedAt: Number(src?.marionCohesion?.updatedAt || 0) || 0
    },
    lastUpdatedAt: Number(src.lastUpdatedAt || 0) || 0
  };
}

function inferPhaseFromStage(stage, lock) {
  const s = safeStr(stage || "").toLowerCase();
  if (s === "recovery" || s === "stabilize" || s === "terminal_stop" || s === "quiet") return "recovery";
  if (s === "deliver" || s === "advance" || s === "domain_depth_1" || s === "domain_depth_2") return "active";
  if (s === "execution") return "execution";
  if (lock) return "recovery";
  return "active";
}

function isTechnicalInbound(inbound) {
  const text = safeStr(inbound?.text || "").toLowerCase();
  const action = safeStr(inbound?.action || inbound?.payload?.action || inbound?.payload?.route || "").toLowerCase();
  return /(chat engine|state spine|support response|loop|looping|debug|debugging|patch|update|rebuild|restructure|integrate|implementation|code|script|file|tts|api|route|backend|fix|voice route|voiceroute)/.test(text) ||
    /(diagnosis|restructure|patch|implement|debug|fix|repair|analysis)/.test(action);
}

function extractIntent(inbound) {
  const cogIntent = safeStr(inbound?.cog?.intent || "").toUpperCase();
  if (cogIntent) return cogIntent;
  const turnIntent = safeStr(inbound?.turnSignals?.turnIntent || "").toUpperCase();
  if (turnIntent) return turnIntent;
  const action = safeStr(inbound?.action || inbound?.payload?.action || inbound?.payload?.route || "").toUpperCase();
  if (action) return action;
  return "ADVANCE";
}

function normalizeAudioSignal(inbound) {
  const sig = isPlainObject(inbound?.turnSignals) ? inbound.turnSignals : {};
  const audioFailure = isPlainObject(inbound?.audioFailure) ? inbound.audioFailure : (isPlainObject(inbound?.ttsFailure) ? inbound.ttsFailure : {});
  const audio = isPlainObject(inbound?.audio) ? inbound.audio : {};
  const ttsResult = isPlainObject(inbound?.ttsResult) ? inbound.ttsResult : (isPlainObject(inbound?.tts) ? inbound.tts : {});
  const transport = isPlainObject(inbound?.transport) ? inbound.transport : {};
  const bridgeTts = isPlainObject(inbound?.bridge?.tts) ? inbound.bridge.tts : {};

  const actionRaw = safeStr(
    sig.ttsAction || sig.audioAction ||
    audioFailure.action || audio.action || ttsResult.action || transport.action ||
    bridgeTts.action || ""
  );
  const action = /retry/i.test(actionRaw) ? "retry" :
    /downgrade/i.test(actionRaw) ? "downgrade" :
    /stop|terminal/i.test(actionRaw) ? "stop" : "";

  const shouldStop = !!(
    sig.ttsShouldStop || sig.audioShouldStop ||
    audioFailure.shouldTerminate || audioFailure.shouldStop ||
    audio.shouldStop || ttsResult.shouldStop || transport.shouldStop || bridgeTts.shouldStop ||
    action === "stop"
  );
  const retryable = !!(
    sig.ttsRetryable || sig.audioRetryable ||
    audioFailure.retryable || audio.retryable || ttsResult.retryable || transport.retryable || bridgeTts.retryable ||
    action === "retry"
  );
  const reason = safeStr(
    sig.ttsReason || sig.audioReason ||
    audioFailure.reason || audioFailure.message ||
    audio.reason || ttsResult.reason || transport.reason || bridgeTts.reason || ""
  );
  const status = clampInt(
    sig.ttsProviderStatus || sig.audioProviderStatus ||
    audioFailure.providerStatus || audioFailure.status ||
    audio.providerStatus || audio.status ||
    ttsResult.providerStatus || ttsResult.status ||
    transport.providerStatus || transport.status ||
    bridgeTts.providerStatus || bridgeTts.status,
    0, 0, 999999
  );

  const audioUrl = safeStr(
    sig.audioUrl || sig.ttsAudioUrl ||
    audio.url || audio.audioUrl ||
    ttsResult.url || ttsResult.audioUrl ||
    transport.url || transport.audioUrl ||
    bridgeTts.url || bridgeTts.audioUrl || ""
  );
  const audioBase64 = safeStr(
    sig.audioBase64 || sig.ttsAudioBase64 ||
    audio.base64 || audio.audioBase64 ||
    ttsResult.base64 || ttsResult.audioBase64 ||
    transport.base64 || transport.audioBase64 ||
    bridgeTts.base64 || bridgeTts.audioBase64 || ""
  );
  const mimeType = safeStr(
    sig.audioMimeType || sig.ttsMimeType ||
    audio.mimeType || audio.contentType ||
    ttsResult.mimeType || ttsResult.contentType ||
    transport.mimeType || transport.contentType ||
    bridgeTts.mimeType || bridgeTts.contentType || ""
  ).toLowerCase();
  const format = safeStr(
    sig.audioFormat || sig.ttsFormat ||
    audio.format || ttsResult.format || transport.format || bridgeTts.format || ""
  ).toLowerCase();
  const chars = clampInt(
    sig.audioChars || sig.ttsChars ||
    audio.chars || audio.textLength ||
    ttsResult.chars || ttsResult.textLength ||
    transport.chars || transport.textLength ||
    bridgeTts.chars || bridgeTts.textLength,
    0, 0, 999999
  );
  const playable = !!(
    sig.audioPlayable || sig.ttsPlayable ||
    audio.playable || ttsResult.playable || transport.playable || bridgeTts.playable ||
    audioUrl || audioBase64
  );

  return { action, shouldStop, retryable, reason, status, playable, audioUrl, audioBase64, mimeType, format, chars };
}

function normalizeEmotionSignals(inbound, prevState) {
  const sig = isPlainObject(inbound?.turnSignals) ? inbound.turnSignals : {};
  const direct = isPlainObject(inbound?.emotion) ? inbound.emotion : (isPlainObject(inbound?.emo) ? inbound.emo : (isPlainObject(inbound?.emotionPayload) ? inbound.emotionPayload : {}));
  const prev = coerceState(prevState);
  const supportMode = safeStr(sig.emotionSupportMode || direct.supportModeCandidate || prev.support.supportMode || "").toLowerCase();
  const emotionKey = safeStr(sig.emotionPrimary || sig.emotionDominant || direct.primaryEmotion || prev.support.emotionKey || "").toLowerCase();
  const emotionCluster = safeStr(sig.emotionCluster || direct.emotionCluster || prev.support.emotionCluster || "").toLowerCase();
  const questionStyle = safeStr(sig.questionStyle || direct?.conversationPlan?.questionStyle || prev.support.questionStyle || "").toLowerCase();
  const supportLockSignal = !!(
    sig.supportLockActive ||
    sig.emotionSupportLock ||
    sig.emotionShouldSuppressMenus ||
    sig.emotionNeedSoft ||
    sig.emotionNeedCrisis ||
    sig.emotionFallbackSuppression ||
    sig.emotionRouteExhaustion ||
    direct?.supportFlags?.crisis ||
    direct?.supportFlags?.highDistress
  );
  const sameEmotionCount = clampInt(sig.emotionSameEmotionCount, prev.repetition.sameEmotionCount, 0, 999999);
  const sameSupportModeCount = clampInt(sig.emotionSameSupportModeCount, prev.repetition.sameSupportModeCount, 0, 999999);
  const sameArchetypeCount = clampInt(sig.emotionSameArchetypeCount, prev.repetition.sameArchetypeCount, 0, 999999);
  const noProgressTurnCount = clampInt(sig.emotionNoProgressTurnCount, prev.repetition.noProgressCount, 0, 999999);
  const repeatedFallbackCount = clampInt(sig.emotionRepeatedFallbackCount, prev.repetition.fallbackCount, 0, 999999);

  return {
    supportMode,
    emotionKey,
    emotionCluster,
    questionStyle,
    supportLockSignal,
    shouldSuppressMenus: !!(
      sig.emotionShouldSuppressMenus ||
      sig.clearStaleUi ||
      sig.suppressMenus ||
      sig.emotionFallbackSuppression ||
      sig.emotionRouteExhaustion ||
      direct?.supportFlags?.needsContainment ||
      direct?.supportFlags?.crisis
    ),
    highDistress: !!(sig.emotionNeedCrisis || sig.emotionNeedSoft || direct?.supportFlags?.highDistress || direct?.supportFlags?.crisis),
    mentionsLooping: !!(
      sig.emotionRouteExhaustion ||
      sig.emotionFallbackSuppression ||
      noProgressTurnCount >= 2 ||
      /loop|looping|same thing|again/i.test(safeStr(inbound?.text || ""))
    ),
    sameEmotionCount,
    sameSupportModeCount,
    sameArchetypeCount,
    noProgressTurnCount,
    repeatedFallbackCount
  };
}



function normalizeEmotionalEngineSignals(inbound, prevState) {
  const sig = isPlainObject(inbound?.turnSignals) ? inbound.turnSignals : {};
  const prev = coerceState(prevState);
  const prevEngine = isPlainObject(prev.emotionalEngine) ? prev.emotionalEngine : createState().emotionalEngine;
  const primaryState = safeStr(sig.enginePrimaryState || prevEngine.primaryState || "focused").toLowerCase() || "focused";
  const secondaryState = safeStr(sig.engineSecondaryState || prevEngine.secondaryState || "steady").toLowerCase() || "steady";
  const continuityScore = Math.max(0, Math.min(1, Number(sig.engineContinuityScore ?? prevEngine.continuityScore ?? 0.35) || 0.35));
  const placeholder = safeStr(sig.enginePlaceholder || prevEngine.placeholder || "Ask Nyx anything about Sandblast…") || "Ask Nyx anything about Sandblast…";
  const lastActionLabels = Array.isArray(sig.engineActionLabels) ? sig.engineActionLabels.slice(0, 6).map((x) => safeStr(x)) : prevEngine.lastActionLabels;
  const presenceState = safeStr(sig.enginePresenceState || prevEngine.presenceState || primaryState || "receptive").toLowerCase() || "receptive";
  const listenerMode = safeStr(sig.engineListenerMode || prevEngine.listenerMode || "attuned").toLowerCase() || "attuned";
  const stateStreak = safeStr(prevEngine.primaryState || "") === primaryState
    ? clampInt(prevEngine.stateStreak, 0, 0, 999999) + 1
    : 0;
  return { primaryState, secondaryState, continuityScore, placeholder, lastActionLabels, stateStreak, presenceState, listenerMode };
}

function inferConversationPhase(prevState, inbound, plannerDecision) {
  const prev = coerceState(prevState);
  const technical = isTechnicalInbound(inbound);
  const audio = normalizeAudioSignal(inbound);
  const emo = normalizeEmotionSignals(inbound, prev);
  const plannerStage = safeStr(plannerDecision?.stage || "").toLowerCase();

  if (audio.shouldStop) return "recovery";
  if (prev.audio.terminalStopUntil && prev.audio.terminalStopUntil > nowMs()) return "recovery";

  const activeHold = clampInt(prev.support?.holdTurns, 0, 0, 999999) > 0;
  const activeSupportLock = !!(emo.supportLockSignal || prev.support.lockActive || activeHold);
  if (activeSupportLock || plannerStage === "recovery" || plannerStage === "terminal_stop") return "recovery";

  if (technical) return "execution";
  return inferPhaseFromStage(prev.stage, false);
}

function decideNextMove(prevState, inbound) {
  const prev = coerceState(prevState);
  const userHash = hashText(oneLine(inbound?.text || "").toLowerCase());
  const intent = extractIntent(inbound);
  const technical = isTechnicalInbound(inbound);
  const audio = normalizeAudioSignal(inbound);
  const emo = normalizeEmotionSignals(inbound, prev);
  const terminalStopActive = prev.audio.terminalStopUntil && prev.audio.terminalStopUntil > nowMs();

  const sameUser = !!(userHash && prev.lastUserHash && userHash === prev.lastUserHash);
  const sameIntent = !!(intent && prev.lastIntent && intent === prev.lastIntent);
  const repeatedSupportHold = clampInt(prev.support?.holdTurns, 0, 0, 999999) > 0;
  const loopPressure = Number(prev?.repetition?.noProgressCount || 0) >= 2 || Number(prev?.repetition?.sameAssistantHashCount || 0) >= 2;
  const mentionsLooping = !!(emo.mentionsLooping || (sameUser && sameIntent) || loopPressure);

  if (audio.shouldStop || terminalStopActive) {
    return {
      move: "STABILIZE",
      stage: "terminal_stop",
      rationale: audio.reason ? `audio_terminal_${audio.reason}` : "audio_terminal_stop",
      speak: "",
      _plannerMode: "audio_terminal"
    };
  }

  if (audio.action === "downgrade") {
    return {
      move: "ADVANCE",
      stage: technical ? "execution" : "deliver",
      rationale: audio.reason ? `audio_downgrade_${audio.reason}` : "audio_downgrade",
      speak: "",
      _plannerMode: technical ? "execution" : "audio_downgrade"
    };
  }

  if (audio.action === "retry") {
    return {
      move: "ADVANCE",
      stage: "execution",
      rationale: audio.reason ? `audio_retry_${audio.reason}` : "audio_retry",
      speak: "",
      _plannerMode: "audio_retry"
    };
  }

  if (emo.supportLockSignal || emo.highDistress || safeStr(inbound?.cog?.intent || "").toUpperCase() === "STABILIZE" || repeatedSupportHold) {
    return {
      move: "STABILIZE",
      stage: "recovery",
      rationale: mentionsLooping ? "support_lock_loop_guard" : "emotion_stabilize",
      speak: "",
      _plannerMode: "support"
    };
  }

  if (technical) {
    return {
      move: "ADVANCE",
      stage: "execution",
      rationale: mentionsLooping ? "technical_loop_escape" : "technical_execution",
      speak: "",
      _plannerMode: "execution"
    };
  }

  if (mentionsLooping) {
    return {
      move: "STABILIZE",
      stage: "recovery",
      rationale: "route_exhaustion_guard",
      speak: "",
      _plannerMode: "stabilize"
    };
  }

  return {
    move: "ADVANCE",
    stage: technical ? "execution" : "deliver",
    rationale: "normal_progression",
    speak: "",
    _plannerMode: technical ? "execution" : "advance"
  };
}

function hasMarionFinalSignal(params = {}) {
  const p = isPlainObject(params) ? params : {};
  const inbound = isPlainObject(p.inbound) ? p.inbound : {};
  const meta = isPlainObject(p.meta) ? p.meta : {};
  const marion = extractMarionObject(p);
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const packetMeta = isPlainObject(packet.meta) ? packet.meta : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const memoryPatch = extractComposerMemoryPatch(p);
  const sig = firstNonEmpty(
    p.marionFinalSignature,
    p.signature,
    meta.marionFinalSignature,
    meta.signature,
    marion.marionFinalSignature,
    marion.signature,
    packetMeta.marionFinalSignature,
    packetMeta.signature,
    payload.marionFinalSignature,
    payload.signature,
    memoryPatch.marionFinalSignature,
    extractNested(inbound, ["meta", "marionFinalSignature"]),
    extractNested(inbound, ["packet", "meta", "marionFinalSignature"])
  );
  return !!(
    p.marionFinal || p.final || p.handled ||
    inbound.marionFinal || inbound.final || inbound.handled ||
    meta.marionFinal || meta.final || meta.handled ||
    marion.marionFinal || marion.final || marion.handled ||
    packet.marionFinal || packet.final || packet.handled ||
    packetMeta.marionFinal || packetMeta.final || packetMeta.handled ||
    payload.marionFinal || payload.final || payload.handled ||
    memoryPatch.marionFinal || memoryPatch.final || memoryPatch.composedOnce ||
    sig
  );
}

function finalizeTurn(params = {}) {
  const prev = coerceState(params.prevState);
  const inbound = isPlainObject(params.inbound) ? params.inbound : {};
  const decision = isPlainObject(params.decision) ? params.decision : {};
  const lane = safeStr(params.lane || inbound.lane || prev.lane || "general") || "general";
  const memoryPatch = extractComposerMemoryPatch(params);
  const marion = extractMarionObject(params);
  const composerIntent = firstNonEmpty(memoryPatch.lastIntent, marion.intent, params.intent, params.marionCog?.intent);
  const composerDomain = firstNonEmpty(memoryPatch.lastDomain, marion.domain, params.domain, lane);
  const marionReply = extractComposerReply(params);
  let stage = safeStr(decision.stage || params.stage || prev.stage || "deliver").toLowerCase() || "deliver";
  const intent = canonicalIntent(composerIntent || decision.move || extractIntent(inbound));
  const actionTaken = safeStr(params.actionTaken || inbound.action || inbound?.payload?.action || "");
  const speak = oneLine(safeStr(decision.speak || marionReply || params.assistantSummary || params.assistantText || params.reply || ""));
  const userHash = firstNonEmpty(memoryPatch.userSignature, memoryPatch.lastUserSignature, hashUserTextForComposer(inbound.text || ""));
  const assistantHash = hashText(speak.toLowerCase());
  const sameLane = lane === prev.lane;
  const sameStage = stage === prev.stage;
  const sameIntent = intent === prev.lastIntent;
  const sameUser = !!(userHash && prev.lastUserHash && userHash === prev.lastUserHash);
  const sameAssistant = !!(assistantHash && prev.lastAssistantHash && assistantHash === prev.lastAssistantHash);
  const marionFinalSignal = hasMarionFinalSignal(params);
  const composerAdvancedState = !!(memoryPatch?.stateBridge?.shouldAdvanceState || memoryPatch.shouldAdvanceState || memoryPatch.composedOnce || marionFinalSignal);
  if (marionFinalSignal && composerAdvancedState && stage === "recovery" && isTechnicalInbound(inbound)) {
    stage = "execution";
  }
  const plannerMode = safeStr(decision._plannerMode || params.marionCog?.mode || "").toLowerCase();
  const technical = isTechnicalInbound(inbound);
  const audio = normalizeAudioSignal(inbound);
  const emo = normalizeEmotionSignals(inbound, prev);
  const engineSignals = normalizeEmotionalEngineSignals(inbound, prev);

  const terminalStopUntil = audio.shouldStop ? nowMs() + TERMINAL_AUDIO_STOP_MS : 0;
  const releaseSupportLock = !!(
    marionFinalSignal &&
    composerAdvancedState &&
    speak &&
    !emo.highDistress &&
    !emo.supportLockSignal &&
    stage !== "terminal_stop" &&
    !audio.shouldStop
  );
  const supportLockActive = !releaseSupportLock && !!(
    emo.supportLockSignal ||
    stage === "terminal_stop" ||
    safeStr(intent) === "STABILIZE" ||
    (stage === "recovery" && (emo.highDistress || clampInt(prev.support?.holdTurns, 0, 0, 999999) > 0))
  );
  const progressionLock = !!(
    supportLockActive ||
    audio.shouldStop ||
    (!marionFinalSignal && sameAssistant && sameStage && clampInt(prev.repetition?.sameAssistantHashCount, 0, 0, 999999) >= 1) ||
    (sameUser && sameIntent && clampInt(prev.repetition?.sameUserHashCount, 0, 0, 999999) >= 1)
  );

  const repetition = {
    sameLaneCount: sameLane ? prev.repetition.sameLaneCount + 1 : 0,
    sameStageCount: sameStage ? prev.repetition.sameStageCount + 1 : 0,
    sameIntentCount: sameIntent ? prev.repetition.sameIntentCount + 1 : 0,
    sameUserHashCount: sameUser ? prev.repetition.sameUserHashCount + 1 : 0,
    sameAssistantHashCount: sameAssistant ? prev.repetition.sameAssistantHashCount + 1 : 0,
    sameEmotionCount: emo.sameEmotionCount,
    sameSupportModeCount: emo.sameSupportModeCount,
    sameArchetypeCount: emo.sameArchetypeCount,
    noProgressCount: marionFinalSignal && composerAdvancedState
      ? clampInt(memoryPatch.noProgressCount, 0, 0, 999999)
      : Math.max(
          emo.noProgressTurnCount,
          (sameStage && sameIntent && sameLane) ? prev.repetition.noProgressCount + 1 : 0
        ),
    fallbackCount: Math.max(
      emo.repeatedFallbackCount,
      /failopen|fallback|breaker|stabilize|audio_terminal|audio_downgrade|support_lock/i.test(
        safeStr(params.updateReason || "") + " " + safeStr(decision.rationale || "")
      ) ? prev.repetition.fallbackCount + 1 : 0
    )
  };

  const holdTurns = releaseSupportLock
    ? 0
    : supportLockActive
      ? Math.max(clampInt(prev.support.holdTurns, 0, 0, 999999), emo.highDistress ? 2 : 1)
      : Math.max(clampInt(prev.support.holdTurns, 0, 0, 999999) - 1, 0);

  const support = {
    lockActive: supportLockActive || holdTurns > 0,
    lockBias: emo.shouldSuppressMenus ? "strong" : (prev.support.lockBias || ""),
    quietTurns: emo.shouldSuppressMenus ? prev.support.quietTurns + 1 : Math.max(clampInt(prev.support.quietTurns, 0, 0, 999999) - 1, 0),
    holdTurns,
    reason: (supportLockActive || holdTurns > 0) ? safeStr(decision.rationale || prev.support.reason || intent || "support_lock") : "",
    shouldSuppressMenus: !!emo.shouldSuppressMenus,
    supportMode: safeStr(emo.supportMode || prev.support.supportMode || ""),
    archetype: safeStr(inbound?.turnSignals?.emotionArchetype || prev.support.archetype || ""),
    questionStyle: safeStr(emo.questionStyle || prev.support.questionStyle || ""),
    emotionKey: safeStr(emo.emotionKey || prev.support.emotionKey || ""),
    emotionCluster: safeStr(emo.emotionCluster || prev.support.emotionCluster || "")
  };

  const volatility = audio.shouldStop || progressionLock || repetition.noProgressCount >= 1 || support.lockActive
    ? "elevated"
    : repetition.sameStageCount >= 2
      ? "guarded"
      : "stable";

  const emotionalEngine = {
    primaryState: engineSignals.primaryState,
    secondaryState: engineSignals.secondaryState,
    continuityScore: engineSignals.continuityScore,
    stateStreak: engineSignals.stateStreak,
    placeholder: engineSignals.placeholder,
    lastActionLabels: Array.isArray(engineSignals.lastActionLabels) ? engineSignals.lastActionLabels : [],
    presenceState: safeStr(engineSignals.presenceState || prev.emotionalEngine?.presenceState || engineSignals.primaryState || "receptive") || "receptive",
    listenerMode: safeStr(engineSignals.listenerMode || prev.emotionalEngine?.listenerMode || "attuned") || "attuned"
  };

  const continuityThread = {
    depthLevel: Math.max(1, Math.max(repetition.sameStageCount + 1, repetition.sameIntentCount + 1, repetition.sameEmotionCount + 1)),
    threadContinuation: !!(sameLane || sameIntent || sameUser || sameAssistant || support.lockActive || repetition.noProgressCount > 0),
    unresolvedSignals: [safeStr(emo.emotionKey || ""), safeStr(emo.emotionCluster || ""), safeStr(decision.rationale || "")].filter(Boolean).slice(0, 6),
    lastTopics: [safeStr(inbound?.lane || lane || ""), safeStr(intent || "")].filter(Boolean).slice(0, 6),
    responseMode: safeStr(emo.supportMode || plannerMode || decision.move || "steady") || "steady",
    marionFinalObserved: marionFinalSignal,
    updatedAt: nowMs()
  };

  return {
    ...prev,
    rev: clampInt(prev.rev, 0, 0, 999999) + 1,
    lane,
    domain: safeStr(composerDomain || lane) || lane,
    stage,
    phase: inferPhaseFromStage(stage, progressionLock),
    lastIntent: intent,
    lastAction: actionTaken,
    lastMove: safeStr(decision.move || intent),
    lastRationale: safeStr(decision.rationale || ""),
    lastPlannerMode: plannerMode,
    lastUserHash: userHash,
    lastAssistantHash: assistantHash,
    progressionLock,
    volatility,
    turns: {
      user: clampInt(prev.turns.user, 0, 0, 999999) + 1,
      assistant: clampInt(prev.turns.assistant, 0, 0, 999999) + 1
    },
    repetition,
    support,
    audio: {
      lastFailureReason: audio.reason || (audio.action ? prev.audio.lastFailureReason : ""),
      lastFailureStatus: audio.status || (audio.action ? prev.audio.lastFailureStatus : 0),
      lastFailureAction: audio.action || "",
      lastFailureRetryable: !!audio.retryable,
      lastFailureAt: audio.action ? nowMs() : prev.audio.lastFailureAt,
      terminalStopUntil,
      terminalStopReason: audio.shouldStop ? (audio.reason || "audio_terminal_stop") : "",
      lastSuccessAt: audio.playable ? nowMs() : prev.audio.lastSuccessAt,
      lastPlayableAt: audio.playable ? nowMs() : prev.audio.lastPlayableAt,
      lastPlayableKind: audio.audioBase64 ? "base64" : (audio.audioUrl ? "url" : prev.audio.lastPlayableKind),
      lastAudioUrl: audio.audioUrl || prev.audio.lastAudioUrl,
      lastAudioMimeType: audio.mimeType || prev.audio.lastAudioMimeType,
      lastAudioFormat: audio.format || prev.audio.lastAudioFormat,
      lastAudioChars: audio.chars || prev.audio.lastAudioChars,
      playbackReady: !!audio.playable
    },
    emotionalEngine,
    continuityThread,
    marionCohesion: {
      composerObserved: !!Object.keys(memoryPatch).length,
      marionFinalObserved: marionFinalSignal,
      lastComposerIntent: safeStr(memoryPatch.lastIntent || marion.intent || ""),
      lastComposerDomain: safeStr(memoryPatch.lastDomain || marion.domain || ""),
      lastComposerUserSignature: safeStr(memoryPatch.userSignature || memoryPatch.lastUserSignature || ""),
      lastComposerReplySignature: safeStr(memoryPatch.replySignature || memoryPatch.lastReplySignature || ""),
      lastMarionFinalSignature: firstNonEmpty(memoryPatch.marionFinalSignature, marion.marionFinalSignature, marion.signature, params.marionFinalSignature),
      statePatchRequired: !!(marion?.nyxDirective?.statePatchRequired || memoryPatch?.stateBridge?.expectedStateMutation),
      shouldAdvanceState: composerAdvancedState,
      noProgressCount: clampInt(memoryPatch.noProgressCount, repetition.noProgressCount, 0, 999999),
      updatedAt: nowMs()
    },
    lastUpdatedAt: nowMs()
  };
}

function assertTurnUpdated(prevState, nextState) {
  const prev = coerceState(prevState);
  const next = coerceState(nextState);
  return next.rev > prev.rev ||
    next.lastUpdatedAt > prev.lastUpdatedAt ||
    next.lastUserHash !== prev.lastUserHash ||
    safeStr(next?.audio?.lastFailureAction || "") !== safeStr(prev?.audio?.lastFailureAction || "") ||
    Number(next?.audio?.terminalStopUntil || 0) !== Number(prev?.audio?.terminalStopUntil || 0) ||
    !!next?.audio?.playbackReady !== !!prev?.audio?.playbackReady ||
    safeStr(next?.audio?.lastAudioUrl || "") !== safeStr(prev?.audio?.lastAudioUrl || "") ||
    !!next?.support?.lockActive !== !!prev?.support?.lockActive ||
    clampInt(next?.repetition?.sameEmotionCount, 0, 0, 999999) !== clampInt(prev?.repetition?.sameEmotionCount, 0, 0, 999999) ||
    safeStr(next?.marionCohesion?.lastMarionFinalSignature || "") !== safeStr(prev?.marionCohesion?.lastMarionFinalSignature || "") ||
    !!next?.marionCohesion?.shouldAdvanceState !== !!prev?.marionCohesion?.shouldAdvanceState;
}

module.exports = {
  STATE_SPINE_SCHEMA,
  SPINE_VERSION,
  TERMINAL_AUDIO_STOP_MS,
  createState,
  coerceState,
  inferConversationPhase,
  decideNextMove,
  finalizeTurn,
  assertTurnUpdated,
  hasMarionFinalSignal,
  extractComposerMemoryPatch,
  extractComposerReply,
  normalizeAudioSignal,
  normalizeEmotionSignals,
  normalizeEmotionalEngineSignals
};
module.exports.default = module.exports;
