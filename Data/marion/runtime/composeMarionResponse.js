"use strict";

/**
 * composeMarionResponse.js
 * Clean single-emission Marion composer.
 *
 * Mission:
 * - Convert routed intent + normalized context into one Marion final response contract.
 * - Emit exactly one user-facing reply per turn.
 * - Provide recovery output when loop guard / state spine requests recovery.
 * - Produce signatures and final envelope compatibility metadata for MarionBridge + index transport.
 *
 * Non-goals:
 * - No routing authority.
 * - No bridge authority.
 * - No index fallback.
 * - No memory mutation outside memoryPatch.
 * - No Nyx/UI rewriting.
 */

const VERSION = "composeMarionResponse v2.4.0 SINGLE-EMISSION-RECOVERY-FINAL-ENVELOPE";
const LEGACY_COMPOSER_VERSION_MARKER = "composeMarionResponse v2.0.0 CLEAN-REBUILD-SINGLE-EMISSION";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const MARION_BRIDGE_VERSION_MARKER = "marionBridge v6.3.0 STATE-SPINE-COHESION-FINAL-HANDOFF + PACKET-NORMALIZER + LOOP-GUARD + FINAL-ENVELOPE";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const STATE_SPINE_SCHEMA = "nyx.marion.stateSpine/1.7";
const STATE_SPINE_SCHEMA_COMPAT = "nyx.marion.stateSpine/1.6";
const FINAL_ENVELOPE_CONTRACT = "nyx.marion.final/1.0";
const FINAL_SIGNATURE = "MARION_FINAL_AUTHORITY";

const MARION_FINAL_MARKERS = Object.freeze([
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  MARION_BRIDGE_VERSION_MARKER,
  LEGACY_COMPOSER_VERSION_MARKER,
  VERSION,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  FINAL_ENVELOPE_CONTRACT,
  FINAL_SIGNATURE
]);

const VALID_INTENTS = Object.freeze([
  "simple_chat",
  "technical_debug",
  "emotional_support",
  "business_strategy",
  "music_query",
  "news_query",
  "roku_query",
  "identity_or_memory",
  "domain_question"
]);

const INTENT_TO_DOMAIN = Object.freeze({
  simple_chat: "general",
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_or_memory: "memory",
  domain_question: "general_reasoning"
});

const BLOCKED_LOOP_REPLY_PATTERNS = Object.freeze([
  /\bi am here with you\b/i,
  /\bi['’]?m here with you\b/i,
  /\bi can stay with this clearly\b/i,
  /\bwe can take this one step at a time\b/i,
  /\bsend the next instruction and i['’]?ll continue\b/i,
  /\bready\.\s*send the next instruction/i,
  /\bready\.\s*send the specific file/i,
  /\bnyx is connected\.\s*what would you like to do next\b/i,
  /\bi blocked a repeated fallback from the bridge\b/i,
  /\bsend a specific command\b/i,
  /\bpress reset to clear this session\b/i,
  /\bi need one specific command to continue clearly\b/i
]);

function safeStr(v) {
  return v == null ? "" : String(v).trim();
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeObj(v) {
  return isObj(v) ? v : {};
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function oneLine(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const s = safeStr(arguments[i]);
    if (s) return s;
  }
  return "";
}

function clamp01(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clampInt(v, fallback = 0, min = 0, max = 999) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const t = Math.trunc(n);
  return Math.max(min, Math.min(max, t));
}

function hashText(v) {
  const s = lower(v).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return String(h >>> 0);
}

function stateHashText(value) {
  const s = safeStr(value);
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function userSignature(text) {
  return hashText(lower(text).replace(/\s+/g, " "));
}

function stateUserSignature(text) {
  return stateHashText(oneLine(text).toLowerCase());
}

function stateAssistantSignature(text) {
  return stateHashText(oneLine(text).toLowerCase());
}

function nowIso() {
  return new Date().toISOString();
}

function buildMarionFinalSignature(replySignature, turnId) {
  const seed = safeStr(replySignature || hashText(turnId || Date.now())).replace(/::+/g, ":").replace(/\s+/g, "_").slice(0, 180);
  const turn = safeStr(turnId || "turn").replace(/::+/g, ":").replace(/\s+/g, "_").slice(0, 180);
  return `${MARION_FINAL_SIGNATURE_PREFIX}${REQUIRED_CHAT_ENGINE_SIGNATURE}::${MARION_BRIDGE_VERSION_MARKER}::${VERSION}::${STATE_SPINE_SCHEMA}::${FINAL_SIGNATURE}::${turn}::${seed}`;
}

function normalizeIntent(value) {
  const raw = lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = {
    chat: "simple_chat",
    general: "simple_chat",
    simple: "simple_chat",
    debug: "technical_debug",
    technical: "technical_debug",
    autopsy: "technical_debug",
    audit: "technical_debug",
    support: "emotional_support",
    emotional: "emotional_support",
    business: "business_strategy",
    strategy: "business_strategy",
    music: "music_query",
    news: "news_query",
    newscanada: "news_query",
    roku: "roku_query",
    memory: "identity_or_memory",
    continuity: "identity_or_memory",
    state: "identity_or_memory",
    state_spine: "identity_or_memory",
    domain: "domain_question",
    question: "domain_question"
  };
  const normalized = aliases[raw] || raw || "simple_chat";
  return VALID_INTENTS.includes(normalized) ? normalized : "domain_question";
}

function normalizeDomain(value, intent) {
  const raw = lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (raw) return raw;
  return INTENT_TO_DOMAIN[intent] || "general";
}

function extractText(routed = {}, input = {}) {
  const i = safeObj(input);
  const r = safeObj(routed);
  const packet = safeObj(i.packet || r.packet);
  const payload = safeObj(i.payload || r.payload);
  const body = safeObj(i.body || r.body);
  const synthesis = safeObj(packet.synthesis);
  return firstText(
    i.userText,
    i.userQuery,
    i.normalizedText,
    i.text,
    i.query,
    i.message,
    r.userText,
    r.userQuery,
    r.text,
    r.query,
    r.message,
    payload.userText,
    payload.userQuery,
    payload.text,
    payload.query,
    payload.message,
    body.userText,
    body.userQuery,
    body.text,
    body.query,
    body.message,
    synthesis.userText,
    synthesis.userQuery,
    synthesis.text,
    synthesis.query
  );
}

function resolveIntent(routed = {}, input = {}) {
  const r = safeObj(routed);
  const i = safeObj(input);
  return normalizeIntent(
    r.intent ||
    r.marionIntent?.intent ||
    r.routing?.intent ||
    i.intent ||
    i.marionIntent?.intent ||
    i.routing?.intent ||
    i.signals?.technical?.detected && "technical_debug" ||
    i.signals?.emotional?.detected && "emotional_support" ||
    "simple_chat"
  );
}

function resolveDomain(routed = {}, input = {}, intent = "simple_chat") {
  const r = safeObj(routed);
  const i = safeObj(input);
  return normalizeDomain(
    r.primaryDomain ||
    r.domain ||
    r.routing?.domain ||
    i.domain ||
    i.requestedDomain ||
    i.routing?.domain,
    intent
  );
}

function resolveTurnId(routed = {}, input = {}) {
  return firstText(
    input.turnId,
    input.sourceTurnId,
    input.packetId,
    routed.turnId,
    routed.packetId,
    input.meta?.turnId,
    routed.meta?.turnId,
    `compose_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
}

function resolvePreviousMemory(input = {}) {
  const previousMemory = safeObj(input.previousMemory || input.memory || input.turnMemory);
  const state = safeObj(input.conversationState || input.state || previousMemory.stateSpine || previousMemory.conversationState);
  const repetition = safeObj(state.repetition || previousMemory.repetition);
  return { previousMemory, state, repetition };
}

function detectDistress(text) {
  const t = lower(text);
  const crisis = /\b(suicide|self[- ]?harm|kill myself|don['’]?t want to live|dont want to live|end my life|hurt myself)\b/i.test(t);
  const high = crisis || /\b(panic attack|panic|depressed|hopeless|overwhelmed|crying|heartbroken|grief|breaking down)\b/i.test(t);
  const emotional = high || /\b(sad|lonely|hurt|anxious|afraid|stressed|upset|lost|empty|off today)\b/i.test(t);
  return { crisis, high, emotional };
}

function isBlockedLoopReply(value) {
  const s = lower(oneLine(value)).replace(/[.!?]+$/g, "");
  if (!s) return true;
  return BLOCKED_LOOP_REPLY_PATTERNS.some((rx) => rx.test(s));
}

function isRecoveryRequested(input = {}, routed = {}) {
  const i = safeObj(input);
  const r = safeObj(routed);
  const state = safeObj(i.state || i.conversationState);
  const meta = safeObj(i.meta || r.meta);
  const loop = safeObj(i.loopGuard || r.loopGuard || meta.loopGuard);
  const reasons = safeArray(loop.reasons || i.lastLoopReasons || state.lastLoopReasons);
  const stage = lower(state.stateStage || i.stateStage || r.stateStage || meta.stateStage);
  return !!(
    i.forceRecovery ||
    r.forceRecovery ||
    i.recoveryRequired ||
    r.recoveryRequired ||
    state.recoveryRequired ||
    loop.forceRecovery ||
    loop.loopDetected ||
    reasons.length ||
    stage === "recover" ||
    stage === "recovery" ||
    stage === "blocked" ||
    stage === "fallback"
  );
}

function safeFinalReply(value, intent, text, input = {}) {
  const raw = oneLine(value);
  if (raw && !isBlockedLoopReply(raw)) return raw;

  const recovery = isRecoveryRequested(input);
  if (recovery) return recoveryReply(intent, text, input, { sanitized: true });

  if (intent === "technical_debug") {
    return "Technical path confirmed. I will inspect the route output, composer contract, bridge final flag, and State Spine mutation for this turn.";
  }

  if (intent === "emotional_support") {
    return "I’m hearing real weight here. Let’s move carefully: what part of this is pressing hardest right now?";
  }

  if (/^(hi|hello|hey|yo)\b/i.test(safeStr(text))) {
    return "Hey. Nyx is live, responsive, and ready for the next direction.";
  }

  return "Nyx is live and tracking the turn. Give me the next target and I’ll move it forward.";
}

function simpleChatReply(text) {
  const t = lower(text);
  if (!t) return "Give me the target and I’ll route it cleanly.";
  if (/^(hi|hello|hey|yo)\b/.test(t)) return "Hey. Nyx is live, responsive, and ready for the next direction.";
  if (/how are you/.test(t)) return "I’m steady, focused, and ready to help. What do you want to tackle first?";
  if (/thank/.test(t)) return "You’re welcome. Let’s keep it moving.";
  return "Nyx is live and tracking the turn. Give me the next target and I’ll move it forward.";
}

function technicalReply(text, input = {}) {
  const t = lower(text);
  const memory = safeObj(input.previousMemory || input.memory);
  const state = safeObj(input.conversationState || input.state || memory.stateSpine || memory.conversationState);
  const rep = safeObj(state.repetition);
  const priorMove = firstText(memory.nextMove, memory.routeBias, state.lastMove, "verify_packet_path");
  const noProgress = clampInt(rep.noProgressCount || memory.noProgressCount, 0, 0, 99);

  if (/state spine|statespine/i.test(t)) {
    return `The next audit target is the State Spine: confirm rev increments, lastUserHash changes, lastAssistantHash changes, and noProgressCount resets after a trusted Marion final. Prior move: ${priorMove}.`;
  }

  if (/phrase pack|greeting|packet|normalizer/i.test(t)) {
    return "The packet layer should stabilize inbound input only. It should not compose replies, mutate memory, or override Marion authority once a final envelope exists.";
  }

  if (/bridge|final envelope|signature/i.test(t)) {
    return "Bridge audit path: normalize first, route once, compose once, loop-check after compose, wrap exactly one final envelope, then return without re-entering the packet.";
  }

  if (/loop/i.test(t) || noProgress >= 1) {
    return `Treat the loop as a state-progression fault: router intent must resolve, composer must emit once, bridge must finalize, and State Spine must persist the new turn. Current no-progress pressure: ${noProgress}.`;
  }

  return "Technical path: verify intent router shape, Marion domain handoff, composer single-emission contract, bridge final envelope, then State Spine persistence.";
}

function emotionalReply(text, input = {}) {
  const memory = safeObj(input.previousMemory || input.memory);
  const distress = detectDistress(text);
  const alreadySupported = !!memory.supportUsedLastTurn || !!memory.memoryPatch?.supportUsedLastTurn;

  if (distress.crisis) {
    return "Your safety comes first. If you might hurt yourself or you’re in immediate danger, contact emergency services or a local crisis line now. For this moment, focus only on the smallest safe next step: move near another person, put distance between you and anything harmful, and breathe slowly.";
  }

  if (alreadySupported && !distress.high) {
    return "I hear the weight in that. Let’s move deeper instead of circling it: what is the real pressure underneath this right now?";
  }

  if (distress.high) {
    return "That sounds heavy, and I’m not going to flatten it into a generic line. What part of it is pressing on you the hardest right now?";
  }

  return "I hear you. Let’s not flatten this into a generic answer. What is the part of this that actually matters most underneath the surface?";
}

function businessReply() {
  return "Let’s make this commercial and practical: clarify the offer, sharpen the buyer psychology, define the package, then move it into a clean execution path.";
}

function musicReply() {
  return "Music lane is ready. Give me the year, artist, chart, or story angle and I’ll route it cleanly.";
}

function newsReply() {
  return "News Canada lane is ready. Give me the story, headline, or feed issue and I’ll keep the source path clean.";
}

function rokuReply() {
  return "Roku lane is ready. Tell me whether we’re checking the app path, live TV lane, content feed, or deployment issue.";
}

function memoryReply() {
  return "I’m holding the thread. Tell me what continuity point you want carried forward, and I’ll anchor it cleanly.";
}

function domainReply() {
  return "I can work through that. Give me the exact target and I’ll break it down into a clean answer.";
}

function recoveryReply(intent, text, input = {}, flags = {}) {
  const distress = detectDistress(text);
  const state = safeObj(input.state || input.conversationState);
  const loopReasons = safeArray(input.lastLoopReasons || state.lastLoopReasons || input.loopGuard?.reasons);
  const reasonSuffix = loopReasons.length ? ` Recovery reason: ${loopReasons.slice(0, 2).join(", ")}.` : "";

  if (intent === "technical_debug") {
    return `Recovery path engaged. I’m advancing the diagnosis instead of repeating the blocker: verify normalized input, routed intent, composer reply, loop-guard result, and final envelope for this exact turn.${reasonSuffix}`;
  }

  if (intent === "emotional_support" || distress.emotional) {
    if (distress.crisis) {
      return "Recovery path engaged, but safety comes first. If you may hurt yourself or you’re in immediate danger, contact emergency services or a local crisis line now. Take the smallest safe step near you first.";
    }
    return "Recovery path engaged. I won’t repeat the same support line. Tell me the part that feels heaviest right now, and I’ll stay with that specific point.";
  }

  if (intent === "music_query") {
    return "Recovery path engaged. Give me the artist, year, chart, or music lane target and I’ll route it cleanly.";
  }

  if (intent === "news_query") {
    return "Recovery path engaged. Give me the headline, story, feed route, or News Canada issue and I’ll isolate it cleanly.";
  }

  if (intent === "roku_query") {
    return "Recovery path engaged. Tell me whether the issue is app path, live TV lane, feed, or deployment.";
  }

  if (intent === "business_strategy") {
    return "Recovery path engaged. Give me the offer, audience, pricing, or execution target and I’ll convert it into the next clean move.";
  }

  if (intent === "identity_or_memory") {
    return "Recovery path engaged. Give me the continuity point you want preserved, and I’ll anchor it without replaying the stale response.";
  }

  return flags.sanitized
    ? "Recovery path engaged. Give me the next clear target and I’ll continue from there without replaying the blocked response."
    : "Recovery path engaged. I’m clearing the stale turn and ready for the next clear target.";
}

function buildReply(intent, text, input = {}, routed = {}) {
  if (isRecoveryRequested(input, routed)) return recoveryReply(intent, text, input);

  switch (intent) {
    case "technical_debug": return technicalReply(text, input);
    case "emotional_support": return emotionalReply(text, input);
    case "business_strategy": return businessReply(text, input);
    case "music_query": return musicReply(text, input);
    case "news_query": return newsReply(text, input);
    case "roku_query": return rokuReply(text, input);
    case "identity_or_memory": return memoryReply(text, input);
    case "domain_question": return domainReply(text, input);
    case "simple_chat":
    default: return simpleChatReply(text, input);
  }
}

function chooseNextMove(intent, text, recoveryRequired) {
  if (recoveryRequired) return "recover_then_advance";
  if (intent === "technical_debug") return "verify_packet_path";
  if (intent === "emotional_support") return "deepen_without_repeating";
  if (intent === "business_strategy") return "convert_to_execution";
  if (intent === "music_query") return "ask_music_target";
  if (intent === "news_query") return "ask_news_target";
  if (intent === "roku_query") return "ask_roku_target";
  if (intent === "identity_or_memory") return "anchor_continuity";
  return "continue_conversation";
}

function nextStateStageFor(intent, recoveryRequired) {
  if (recoveryRequired) return "recover";
  return "final";
}

function buildProgressionPatch({
  intent,
  domain,
  text,
  reply,
  replySignature,
  replyStateSignature,
  previousMemory,
  state,
  nextMove,
  marionFinalSignature,
  duplicateBroken,
  recoveryRequired,
  turnId
}) {
  const priorMemoryUserSig = firstText(previousMemory.userSignature, previousMemory.lastUserSignature);
  const priorStateUserSig = firstText(state.lastUserHash, state.stateUserHash);
  const currentUserSig = userSignature(text);
  const currentStateUserSig = stateUserSignature(text);
  const sameUser = !!(
    (priorMemoryUserSig && priorMemoryUserSig === currentUserSig) ||
    (priorStateUserSig && priorStateUserSig === currentStateUserSig)
  );

  const priorIntent = firstText(previousMemory.lastIntent, state.lastIntent).toLowerCase();
  const sameIntent = !!(priorIntent && priorIntent === intent);
  const previousNoProgress = clampInt(safeObj(state.repetition).noProgressCount || previousMemory.noProgressCount, 0, 0, 99);
  const previousLoopCount = clampInt(state.loopCount || previousMemory.loopCount, 0, 0, 99);

  const noProgressCount = recoveryRequired ? 0 : (sameUser && sameIntent ? previousNoProgress + 1 : 0);
  const loopCount = recoveryRequired ? Math.max(1, previousLoopCount) : 0;
  const nextStateStage = nextStateStageFor(intent, recoveryRequired);

  return {
    lastIntent: intent,
    lastDomain: domain,
    userSignature: currentUserSig,
    lastUserSignature: currentUserSig,
    stateUserHash: currentStateUserSig,
    lastUserHash: currentStateUserSig,

    replySignature,
    replyStateSignature,
    lastReplySignature: replySignature,
    lastAssistantHash: replyStateSignature,
    lastAssistantReply: reply,

    noProgressCount,
    loopCount,
    recoveryRequired: !!recoveryRequired,
    duplicateUserTurn: sameUser,
    duplicateIntentTurn: sameIntent,
    supportUsedLastTurn: intent === "emotional_support",
    composedOnce: true,
    marionFinal: true,
    final: true,
    marionFinalSignature,
    finalSignature: marionFinalSignature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers: MARION_FINAL_MARKERS.slice(),
    nextMove,
    stateStage: nextStateStage,
    stage: nextStateStage,
    turnId,

    stateBridge: {
      shouldAdvanceState: true,
      expectedStateMutation: "finalizeTurn",
      source: "composeMarionResponse",
      stateSchema: STATE_SPINE_SCHEMA,
      stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
      composedOnce: true,
      finalEnvelopeTrusted: true,
      marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      duplicateBroken: !!duplicateBroken,
      recoveryRequired: !!recoveryRequired,
      nextStateStage,
      userSignature: currentUserSig,
      replySignature,
      replyStateSignature,
      stateUserHash: currentStateUserSig,
      noProgressCount,
      loopCount
    },

    marionCohesion: {
      composerObserved: true,
      marionFinalObserved: true,
      finalEnvelopeTrusted: true,
      loopPhraseRejected: false,
      loopBreakTrustedFinal: !!recoveryRequired,
      shouldAdvanceState: true,
      lastComposerIntent: intent,
      lastComposerDomain: domain,
      lastComposerUserSignature: currentUserSig,
      lastComposerReplySignature: replySignature,
      lastMarionFinalSignature: marionFinalSignature,
      updatedAt: Date.now()
    },

    updatedAt: Date.now()
  };
}

function buildFinalEnvelope({
  reply,
  intent,
  domain,
  stateStage,
  turnId,
  memoryPatch,
  routing,
  replySignature,
  replyStateSignature,
  recoveryRequired,
  duplicateDetected,
  diagnostics
}) {
  return {
    ok: !!reply,
    final: true,
    source: "marion",
    signature: FINAL_SIGNATURE,
    contractVersion: FINAL_ENVELOPE_CONTRACT,
    envelopeVersion: "marionFinalEnvelope-compatible/1.0",
    envelopeId: `marion_final_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: nowIso(),
    reply,
    intent,
    domain,
    stateStage,
    routing: {
      intent,
      domain,
      mode: safeStr(routing.mode || ""),
      depth: safeStr(routing.depth || ""),
      endpoint: safeStr(routing.endpoint || "marion://routeMarion.primary")
    },
    state: {
      sessionId: safeStr(memoryPatch.sessionId || ""),
      conversationDepth: clampInt(memoryPatch.conversationDepth, 0, 0, 100),
      loopCount: clampInt(memoryPatch.loopCount, 0, 0, 25),
      recoveryRequired: !!recoveryRequired
    },
    meta: {
      freshMarionFinal: true,
      singleFinalAuthority: true,
      bridgeCompatible: true,
      widgetCompatible: true,
      ttsCompatible: true,
      composerVersion: VERSION,
      stateSpineVersion: STATE_SPINE_SCHEMA,
      replySignature,
      replyStateSignature,
      marionFinalSignature: memoryPatch.marionFinalSignature,
      duplicateBroken: !!duplicateDetected,
      recoveryRequired: !!recoveryRequired,
      diagnostics: safeObj(diagnostics)
    }
  };
}

function composeMarionResponse(routed = {}, input = {}) {
  const text = extractText(routed, input);
  const intent = resolveIntent(routed, input);
  const domain = resolveDomain(routed, input, intent);
  const turnId = resolveTurnId(routed, input);
  const { previousMemory, state } = resolvePreviousMemory(input);
  const routing = safeObj(routed.routing || input.routing);
  const recoveryRequired = isRecoveryRequested(input, routed);

  const previousReplySig = safeStr(
    previousMemory.replySignature ||
    previousMemory.lastReplySignature ||
    previousMemory.memoryPatch?.replySignature ||
    state.lastComposerReplySignature ||
    ""
  );
  const previousAssistantStateSig = safeStr(
    state.lastAssistantHash ||
    previousMemory.replyStateSignature ||
    previousMemory.memoryPatch?.replyStateSignature ||
    ""
  );

  let duplicateDetected = false;
  let rawReply = buildReply(intent, text, input, routed);
  let reply = safeFinalReply(rawReply, intent, text, { ...input, forceRecovery: recoveryRequired });
  let replySignature = hashText(reply);
  let replyStateSignature = stateAssistantSignature(reply);

  if (
    !recoveryRequired &&
    (
      (previousReplySig && previousReplySig === replySignature) ||
      (previousAssistantStateSig && previousAssistantStateSig === replyStateSignature)
    )
  ) {
    duplicateDetected = true;
    rawReply = recoveryReply(intent, text, { ...input, forceRecovery: true, lastLoopReasons: ["duplicate_composer_reply"] });
    reply = safeFinalReply(rawReply, intent, text, { ...input, forceRecovery: true });
    replySignature = hashText(reply);
    replyStateSignature = stateAssistantSignature(reply);
  }

  if (isBlockedLoopReply(reply)) {
    duplicateDetected = true;
    rawReply = recoveryReply(intent, text, { ...input, forceRecovery: true, lastLoopReasons: ["blocked_loop_phrase_sanitized"] }, { sanitized: true });
    reply = oneLine(rawReply);
    replySignature = hashText(reply);
    replyStateSignature = stateAssistantSignature(reply);
  }

  const marionFinalSignature = buildMarionFinalSignature(replySignature, turnId);
  const distress = detectDistress(text);
  const nextMove = chooseNextMove(intent, text, recoveryRequired || duplicateDetected);
  const stateStage = nextStateStageFor(intent, recoveryRequired || duplicateDetected);

  const memoryPatch = buildProgressionPatch({
    intent,
    domain,
    text,
    reply,
    replySignature,
    replyStateSignature,
    previousMemory,
    state,
    nextMove,
    marionFinalSignature,
    duplicateBroken: duplicateDetected,
    recoveryRequired: recoveryRequired || duplicateDetected,
    turnId
  });

  const diagnostics = {
    composerVersion: VERSION,
    replySignature,
    signature: marionFinalSignature,
    marionFinalSignature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers: MARION_FINAL_MARKERS.slice(),
    hardlockCompatible: true,
    previousReplySignature: previousReplySig,
    previousAssistantStateSignature: previousAssistantStateSig,
    replyStateSignature,
    duplicateBroken: duplicateDetected,
    recoveryRequired: recoveryRequired || duplicateDetected,
    singleEmission: true,
    finalAuthority: "composeMarionResponse",
    blockedLoopReplySanitized: isBlockedLoopReply(rawReply),
    stateSchema: STATE_SPINE_SCHEMA,
    stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
    finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
    transportOnlyIndexCompatible: true
  };

  const finalEnvelope = buildFinalEnvelope({
    reply,
    intent,
    domain,
    stateStage,
    turnId,
    memoryPatch,
    routing,
    replySignature,
    replyStateSignature,
    recoveryRequired: recoveryRequired || duplicateDetected,
    duplicateDetected,
    diagnostics
  });

  return {
    ok: true,
    final: true,
    marionFinal: true,
    composedOnce: true,
    finalizedBy: "composeMarionResponse",
    version: VERSION,
    signature: marionFinalSignature,
    marionFinalSignature,
    finalSignature: marionFinalSignature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers: MARION_FINAL_MARKERS.slice(),

    domain,
    intent,
    stateStage,

    reply,
    text: reply,
    answer: reply,
    output: reply,
    response: reply,
    message: reply,
    displayReply: reply,
    spokenText: reply.replace(/\n+/g, " ").trim(),

    followUps: [],
    followUpsStrings: [],

    supportMode: intent === "emotional_support" ? "support_then_deepen" : "none",
    routeBias: nextMove,
    riskLevel: distress.crisis ? "critical" : distress.high ? "high" : "low",
    supportFlags: {
      crisis: distress.crisis,
      highDistress: distress.high,
      emotional: distress.emotional
    },

    responsePlan: {
      semanticFrame: intent,
      deliveryTone: intent === "emotional_support" ? "warm_direct" : "clear_direct",
      expressionStyle: "single_emission",
      followupStyle: "none",
      responseLength: "short",
      pacing: "steady",
      transitionReadiness: "high",
      stateCohesion: "requires_bridge_or_index_merge_memoryPatch",
      nextMove,
      recoveryRequired: recoveryRequired || duplicateDetected
    },

    nyxDirective: {
      expressiveRole: "express_resolved_state_only",
      allowNyxRewrite: false,
      allowReplySynthesis: false,
      singleSourceOfTruth: true,
      askAtMost: 0,
      shouldOfferNextStep: true,
      statePatchRequired: true
    },

    payload: {
      reply,
      text: reply,
      answer: reply,
      output: reply,
      response: reply,
      message: reply,
      spokenText: reply.replace(/\n+/g, " ").trim(),
      final: true,
      marionFinal: true,
      handled: true,
      signature: marionFinalSignature,
      marionFinalSignature,
      finalSignature: marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      finalEnvelope
    },

    packet: {
      final: true,
      marionFinal: true,
      handled: true,
      routing: {
        domain,
        intent,
        endpoint: safeStr(routing.endpoint || "marion://routeMarion.primary"),
        stateSchema: STATE_SPINE_SCHEMA,
        stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT
      },
      synthesis: {
        reply,
        text: reply,
        answer: reply,
        output: reply,
        response: reply,
        message: reply,
        spokenText: reply.replace(/\n+/g, " ").trim(),
        followUps: [],
        followUpsStrings: [],
        memoryPatch,
        final: true,
        marionFinal: true,
        handled: true,
        signature: marionFinalSignature,
        marionFinalSignature,
        finalSignature: marionFinalSignature,
        requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
        finalMarkers: MARION_FINAL_MARKERS.slice()
      },
      meta: {
        version: VERSION,
        composerVersion: VERSION,
        final: true,
        marionFinal: true,
        handled: true,
        signature: marionFinalSignature,
        marionFinalSignature,
        finalSignature: marionFinalSignature,
        requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
        finalMarkers: MARION_FINAL_MARKERS.slice(),
        hardlockCompatible: true,
        stateSchema: STATE_SPINE_SCHEMA,
        stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
        finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT
      }
    },

    finalEnvelope,

    meta: {
      version: VERSION,
      composerVersion: VERSION,
      final: true,
      marionFinal: true,
      handled: true,
      finalizedBy: "composeMarionResponse",
      replySignature,
      replyStateSignature,
      signature: marionFinalSignature,
      marionFinalSignature,
      finalSignature: marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      hardlockCompatible: true,
      stateSchema: STATE_SPINE_SCHEMA,
      stateSchemaCompat: STATE_SPINE_SCHEMA_COMPAT,
      finalEnvelopeContract: FINAL_ENVELOPE_CONTRACT,
      jsonPostFinalEnvelope: true,
      transportOnlyIndexCompatible: true,
      freshMarionFinal: true,
      singleFinalAuthority: true
    },

    memoryPatch,
    diagnostics,

    synthesis: {
      reply,
      text: reply,
      answer: reply,
      output: reply,
      response: reply,
      message: reply,
      spokenText: reply.replace(/\n+/g, " ").trim(),
      followUps: [],
      followUpsStrings: [],
      memoryPatch,
      signature: marionFinalSignature,
      marionFinalSignature,
      finalSignature: marionFinalSignature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers: MARION_FINAL_MARKERS.slice(),
      finalEnvelope
    }
  };
}

module.exports = {
  VERSION,
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  LEGACY_COMPOSER_VERSION_MARKER,
  MARION_BRIDGE_VERSION_MARKER,
  MARION_FINAL_SIGNATURE_PREFIX,
  MARION_FINAL_MARKERS,
  STATE_SPINE_SCHEMA,
  STATE_SPINE_SCHEMA_COMPAT,
  FINAL_ENVELOPE_CONTRACT,
  FINAL_SIGNATURE,
  buildMarionFinalSignature,
  isBlockedLoopReply,
  safeFinalReply,
  recoveryReply,
  composeMarionResponse,
  default: composeMarionResponse
};

module.exports.default = composeMarionResponse;
