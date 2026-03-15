"use strict";

/**
 * Utils/stateSpine.js
 *
 * stateSpine v1.2.0 STAGE-LOCK LOOP-HARDEN
 * ------------------------------------------------------------
 * PURPOSE
 * - Maintain durable conversational progression state
 * - Prevent same-stage replay and shallow re-entry loops
 * - Expose a compact planning contract to chatEngine
 * - Stay fail-open safe when upstream signals are partial
 */

const SPINE_VERSION = "stateSpine v1.2.0 STAGE-LOCK LOOP-HARDEN";

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
      noProgressCount: 0,
      fallbackCount: 0
    },
    lastUpdatedAt: 0
  };
}

function coerceState(input) {
  const base = createState({ lane: safeStr(input?.lane || "general"), stage: safeStr(input?.stage || "open") });
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
      noProgressCount: clampInt(src?.repetition?.noProgressCount, 0, 0, 999999),
      fallbackCount: clampInt(src?.repetition?.fallbackCount, 0, 0, 999999)
    },
    lastUpdatedAt: Number(src.lastUpdatedAt || 0) || 0
  };
}

function inferPhaseFromStage(stage, lock) {
  const s = safeStr(stage || "").toLowerCase();
  if (s === "recovery" || s === "stabilize") return "recovery";
  if (s === "deliver" || s === "advance" || s === "domain_depth_1" || s === "domain_depth_2") return "active";
  if (s === "execution") return "execution";
  if (lock) return "recovery";
  return "active";
}

function isTechnicalInbound(inbound) {
  const text = safeStr(inbound?.text || "").toLowerCase();
  const action = safeStr(inbound?.action || inbound?.payload?.action || inbound?.payload?.route || "").toLowerCase();
  return /(chat engine|state spine|support response|loop|looping|debug|debugging|patch|update|rebuild|restructure|integrate|implementation|code|script|file|tts|api|route|backend|fix)/.test(text) ||
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

function inferConversationPhase(prevState, inbound, plannerDecision) {
  const prev = coerceState(prevState);
  const technical = isTechnicalInbound(inbound);
  if (technical) return "execution";
  if (safeStr(plannerDecision?.stage || "").toLowerCase() === "recovery") return "recovery";
  if (prev.progressionLock) return "recovery";
  return inferPhaseFromStage(prev.stage, prev.progressionLock);
}

function decideNextMove(prevState, inbound) {
  const prev = coerceState(prevState);
  const userHash = hashText(oneLine(inbound?.text || "").toLowerCase());
  const intent = extractIntent(inbound);
  const technical = isTechnicalInbound(inbound);
  const mentionsLooping = !!inbound?.turnSignals?.emotionRouteExhaustion ||
    !!inbound?.turnSignals?.emotionFallbackSuppression ||
    clampInt(inbound?.turnSignals?.emotionNoProgressTurnCount, 0, 0, 99) >= 2 ||
    /\bloop|looping|same thing|again\b/i.test(safeStr(inbound?.text || ""));

  const sameUser = !!(userHash && prev.lastUserHash && userHash === prev.lastUserHash);
  const sameIntent = !!(intent && prev.lastIntent && intent === prev.lastIntent);

  if (technical) {
    return {
      move: mentionsLooping || sameUser ? "STABILIZE" : "ADVANCE",
      stage: "execution",
      rationale: mentionsLooping || sameUser ? "technical_loop_guard" : "technical_execution",
      speak: "",
      _plannerMode: "execution"
    };
  }

  if (mentionsLooping || (sameUser && sameIntent)) {
    return {
      move: "STABILIZE",
      stage: "recovery",
      rationale: mentionsLooping ? "route_exhaustion_guard" : "same_turn_repeat_guard",
      speak: "",
      _plannerMode: "stabilize"
    };
  }

  if (safeStr(inbound?.cog?.intent || "").toUpperCase() === "STABILIZE") {
    return {
      move: "STABILIZE",
      stage: "recovery",
      rationale: "emotion_stabilize",
      speak: "",
      _plannerMode: "support"
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

function finalizeTurn(params = {}) {
  const prev = coerceState(params.prevState);
  const inbound = isPlainObject(params.inbound) ? params.inbound : {};
  const decision = isPlainObject(params.decision) ? params.decision : {};
  const lane = safeStr(params.lane || inbound.lane || prev.lane || "general") || "general";
  const stage = safeStr(decision.stage || prev.stage || "deliver").toLowerCase() || "deliver";
  const intent = safeStr(params.marionCog?.intent || decision.move || extractIntent(inbound)).toUpperCase();
  const actionTaken = safeStr(params.actionTaken || inbound.action || inbound?.payload?.action || "");
  const speak = oneLine(safeStr(decision.speak || params.assistantSummary || ""));
  const userHash = hashText(oneLine(inbound.text || "").toLowerCase());
  const assistantHash = hashText(speak.toLowerCase());
  const sameLane = lane === prev.lane;
  const sameStage = stage === prev.stage;
  const sameIntent = intent === prev.lastIntent;
  const sameUser = !!(userHash && prev.lastUserHash && userHash === prev.lastUserHash);
  const sameAssistant = !!(assistantHash && prev.lastAssistantHash && assistantHash === prev.lastAssistantHash);
  const plannerMode = safeStr(decision._plannerMode || params.marionCog?.mode || "").toLowerCase();
  const technical = isTechnicalInbound(inbound);
  const progressionLock = !!(
    technical ||
    safeStr(intent) === "STABILIZE" ||
    stage === "recovery" ||
    sameUser ||
    (sameAssistant && sameStage)
  );

  const repetition = {
    sameLaneCount: sameLane ? prev.repetition.sameLaneCount + 1 : 0,
    sameStageCount: sameStage ? prev.repetition.sameStageCount + 1 : 0,
    sameIntentCount: sameIntent ? prev.repetition.sameIntentCount + 1 : 0,
    sameUserHashCount: sameUser ? prev.repetition.sameUserHashCount + 1 : 0,
    sameAssistantHashCount: sameAssistant ? prev.repetition.sameAssistantHashCount + 1 : 0,
    noProgressCount: (sameStage && sameIntent && sameLane) ? prev.repetition.noProgressCount + 1 : 0,
    fallbackCount: /failopen|fallback|breaker|stabilize/i.test(safeStr(params.updateReason || "") + " " + safeStr(decision.rationale || ""))
      ? prev.repetition.fallbackCount + 1
      : 0
  };

  const volatility = progressionLock || repetition.noProgressCount >= 1
    ? "elevated"
    : repetition.sameStageCount >= 2
      ? "guarded"
      : "stable";

  return {
    ...prev,
    rev: clampInt(prev.rev, 0, 0, 999999) + 1,
    lane,
    domain: lane,
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
    lastUpdatedAt: Date.now()
  };
}

function assertTurnUpdated(prevState, nextState) {
  const prev = coerceState(prevState);
  const next = coerceState(nextState);
  return next.rev > prev.rev || next.lastUpdatedAt > prev.lastUpdatedAt || next.lastUserHash !== prev.lastUserHash;
}

module.exports = {
  SPINE_VERSION,
  createState,
  coerceState,
  inferConversationPhase,
  decideNextMove,
  finalizeTurn,
  assertTurnUpdated
};
