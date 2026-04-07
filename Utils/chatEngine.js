
"use strict";

/**
 * Utils/chatEngine.js
 *
 * FINAL-FORM GOALS
 * - Marion is the primary authority on cognition every turn
 * - Speech governor is injected directly in-engine
 * - Stable contracts in, stable contracts out
 * - Preserve cache/inflight/session patch behavior
 * - Fail-open without losing reply continuity
 */

let Spine = null;
let MarionSO = null;
let MarionBridgeMod = null;
let EmotionRouteGuard = null;
let Support = null;
let laneRouter = null;
let memoryAdapter = null;
let telemetryAdapter = null;
let ResponsePlanner = null;

try { Spine = require("./stateSpine"); } catch (_e) { Spine = null; }
try { MarionSO = require("./marionSO"); } catch (_e) { MarionSO = null; }
try { MarionBridgeMod = require("./marionBridge"); } catch (_e) { MarionBridgeMod = null; }
try { EmotionRouteGuard = require("./emotionRouteGuard"); } catch (_e) { EmotionRouteGuard = null; }
try { Support = require("./supportResponse"); } catch (_e) { Support = null; }
try { laneRouter = require("./laneRouter"); } catch (_e) { laneRouter = null; }
try { memoryAdapter = require("./chatMemoryAdapter"); } catch (_e) { memoryAdapter = null; }
try { telemetryAdapter = require("./chatTelemetryAdapter"); } catch (_e) { telemetryAdapter = null; }
try { ResponsePlanner = require("./responsePlanner"); } catch (_e) { ResponsePlanner = null; }

const { buildResponseContract, sanitizeUserFacingReply } = require("./conversationalResponseSystem");

const VERSION = "chatEngine v2.1.0 COMMERCIAL-MERGED-MARION-PRIMARY";
const KNOWLEDGE_DOMAINS = ["psychology", "law", "finance", "english", "cybersecurity", "ai", "strategy", "marketing", "general"];

const DUP_WINDOW_MS = 6000;
const CACHE_WINDOW_MS = 12000;
const INFLIGHT_TTL_MS = 15000;
const MAX_FOLLOWUPS = 4;
const MAX_TEXT_LEN = 5000;
const MAX_SPEECH_CHARS = 520;

const routeLane = typeof laneRouter?.routeLane === "function" ? laneRouter.routeLane : null;
const buildUiForLane = typeof laneRouter?.buildUiForLane === "function"
  ? laneRouter.buildUiForLane
  : (lane) => ({ chips: [], allowMic: true, mode: lane || "focused" });
const buildFollowUpsForLane = typeof laneRouter?.buildFollowUpsForLane === "function"
  ? laneRouter.buildFollowUpsForLane
  : () => [];
const buildMemoryContext = typeof memoryAdapter?.buildMemoryContext === "function"
  ? memoryAdapter.buildMemoryContext
  : () => null;
const storeMemoryTurn = typeof memoryAdapter?.storeMemoryTurn === "function"
  ? memoryAdapter.storeMemoryTurn
  : async () => false;
const buildTelemetry = typeof telemetryAdapter?.buildTelemetry === "function"
  ? telemetryAdapter.buildTelemetry
  : (params = {}) => ({
      phase: params.phase || "turn",
      requestId: params.requestId || "",
      lane: params.lane || "general",
      publicMode: !!params.publicMode
    });

const planResponse = typeof ResponsePlanner?.planResponse === "function"
  ? ResponsePlanner.planResponse
  : (input = {}) => ({
      ok: true,
      version: "fallback",
      replyShape: "direct_answer",
      shouldClarify: false,
      minimalClarifier: "",
      replyDepth: "medium",
      nextBestAction: "",
      guidanceMode: false,
      actionFirst: false,
      supportFirst: !!input.supportFirst,
      metaControlSuppressed: !!input.supportFirst,
      failOpen: true
    });

const INFLIGHT = new Map();
let MarionBridge = null;

if (!Spine) {
  Spine = {
    SPINE_VERSION: "fallback",
    createState(seed) { return { rev: 0, lane: safeStr(seed?.lane || "general"), stage: safeStr(seed?.stage || "open") || "open", audio: { terminalStopUntil: 0 } }; },
    coerceState(v) {
      const x = isObj(v) ? v : {};
      return {
        rev: Number(x.rev || 0) || 0,
        lane: safeStr(x.lane || "general") || "general",
        stage: safeStr(x.stage || "open") || "open",
        audio: isObj(x.audio) ? x.audio : { terminalStopUntil: 0 }
      };
    },
    finalizeTurn({ prevState, lane, decision, inbound }) {
      const prev = this.coerceState(prevState);
      const audioSig = isObj(inbound?.turnSignals) ? inbound.turnSignals : {};
      const audioAction = safeStr(audioSig.ttsAction || audioSig.audioAction || "").toLowerCase();
      const shouldStop = !!(audioSig.ttsShouldStop || audioSig.audioShouldStop || /stop|terminal/.test(audioAction));
      return {
        ...prev,
        rev: prev.rev + 1,
        lane: safeStr(lane || prev.lane || "general") || "general",
        stage: safeStr(decision?.stage || prev.stage || "open") || "open",
        audio: {
          terminalStopUntil: shouldStop ? nowMs() + 30000 : Number(prev.audio?.terminalStopUntil || 0) || 0,
          terminalStopReason: shouldStop ? safeStr(audioSig.ttsReason || audioSig.audioReason || "audio_stop") : safeStr(prev.audio?.terminalStopReason || "")
        }
      };
    },
    assertTurnUpdated(prevState, nextState) {
      const prev = this.coerceState(prevState);
      const next = this.coerceState(nextState);
      return next.rev > prev.rev ||
        Number(next.audio?.terminalStopUntil || 0) !== Number(prev.audio?.terminalStopUntil || 0);
    }
  };
}

function nowMs() { return Date.now(); }
function safeStr(v) { return v == null ? "" : String(v); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function oneLine(v) { return safeStr(v).replace(/\s+/g, " ").trim(); }
function clamp(n, min, max, fallback = min) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}
function truthy(v) {
  return /^(1|true|yes|on)$/i.test(safeStr(v).trim());
}
function toBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (v == null || v === "") return fallback;
  return truthy(v);
}
function hashLite(v) {
  const s = safeStr(v);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function shortId(v, keep = 6) {
  const s = safeStr(v).trim();
  if (!s) return "";
  if (s.length <= keep * 2) return s;
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}
function quietUi(mode = "quiet") {
  return { chips: [], allowMic: true, mode, state: mode, replace: true, clearStale: true, actions: [] };
}
function buildSupportFallback(norm, emo, planner) {
  const builder = Support && (typeof Support.buildSupportResponse === "function"
    ? Support.buildSupportResponse
    : typeof Support.createSupportResponse === "function"
      ? Support.createSupportResponse
      : null);
  if (!builder) return "";
  try {
    const out = builder({ text: norm.text, emotion: emo, planner, lane: safeStr(norm.lane || "general") });
    const reply = sanitizeUserFacingReply(out?.reply || out?.text || out?.message || "");
    return reply;
  } catch (_e) {
    return "";
  }
}
function logDiag(event, payload) {
  if (!truthy(process.env.SB_CHAT_DEBUG || "true")) return;
  try {
    console.info("[CHAT_DIAG]", JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...(isObj(payload) ? payload : {})
    }));
  } catch (_e) {}
}
function pruneInflight(now = nowMs()) {
  for (const [key, value] of INFLIGHT.entries()) {
    if (!isObj(value) || now - Number(value.startedAt || 0) > INFLIGHT_TTL_MS) INFLIGHT.delete(key);
  }
}
function sessionKeyOf(session, rawInput, norm) {
  return safeStr(
    session.id ||
    rawInput.sessionId ||
    norm.ctx?.sessionId ||
    norm.body?.sessionId ||
    norm.payload?.sessionId ||
    "anon"
  );
}
function dedupeFollowUps(items) {
  const out = [];
  const seen = new Set();
  for (const item of arr(items)) {
    const label = typeof item === "string"
      ? item
      : safeStr(item?.label || item?.title || item?.text || "");
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(typeof item === "string" ? { label, role: "advance", payload: { text: label } } : item);
  }
  return out.slice(0, MAX_FOLLOWUPS);
}
function continuityBandFromEmotion(emo = {}) {
  const intensity = clamp(emo.intensity, 0, 1, 0);
  const primary = safeStr(emo.primaryEmotion || "neutral").toLowerCase();
  if (emo.supportFlags?.highDistress || intensity >= 0.86) {
    return { continuityHealth: "contain", continuityLevel: "high_hold", recoveryMode: "containment" };
  }
  if (emo.supportFlags?.needsStabilization || primary === "anxious" || intensity >= 0.72) {
    return { continuityHealth: "stabilize", continuityLevel: "stabilizing", recoveryMode: "paced" };
  }
  if (primary === "sad" || primary === "angry" || intensity >= 0.56) {
    return { continuityHealth: "watch", continuityLevel: "attuned", recoveryMode: "supportive" };
  }
  if (primary === "positive" && intensity >= 0.45) {
    return { continuityHealth: "open", continuityLevel: "expansive", recoveryMode: "normal" };
  }
  return { continuityHealth: "steady", continuityLevel: "steady", recoveryMode: "normal" };
}
function normalizeInbound(input = {}) {
  const body = isObj(input.body) ? input.body : {};
  const payload = isObj(input.payload) ? input.payload : {};
  const ctx = isObj(input.ctx) ? input.ctx : {};
  const rawText = input.text || body.text || payload.text || input.message || body.message || "";
  const text = oneLine(rawText).slice(0, MAX_TEXT_LEN);
  return {
    raw: input,
    body,
    payload,
    ctx,
    text,
    lane: safeStr(input.lane || payload.lane || body.lane || ctx.lane || "general").toLowerCase() || "general",
    action: safeStr(input.action || payload.action || body.action || "").toLowerCase(),
    publicMode: input.publicMode ?? payload.publicMode ?? body.publicMode ?? ctx.publicMode,
    requestId: safeStr(input.requestId || ctx.requestId || body.requestId || payload.requestId || ""),
    turnId: safeStr(input.turnId || input.messageId || ctx.turnId || body.turnId || payload.turnId || "")
  };
}
function validateInboundContract(rawInput, norm) {
  const issues = [];
  if (!isObj(rawInput)) issues.push("input_not_object");
  if (!safeStr(norm.lane)) issues.push("lane_missing");
  if (safeStr(norm.text).length > MAX_TEXT_LEN) issues.push("text_trimmed");
  return {
    ok: true,
    issues,
    publicMode: toBool(norm.publicMode, true),
    lane: KNOWLEDGE_DOMAINS.includes(norm.lane) ? norm.lane : "general"
  };
}
function computeInboundSig(norm) {
  const payload = isObj(norm.payload) ? norm.payload : {};
  return hashLite(JSON.stringify({
    text: oneLine(norm.text).toLowerCase(),
    lane: safeStr(norm.lane || "").toLowerCase(),
    action: safeStr(norm.action || "").toLowerCase(),
    route: safeStr(payload.route || "").toLowerCase()
  })).slice(0, 18);
}
function canFastReplay(session, inSig) {
  const same = safeStr(session.__cacheInSig || "") === safeStr(inSig || "");
  const age = nowMs() - Number(session.__cacheAt || 0);
  return same && age >= 0 && age <= CACHE_WINDOW_MS && isObj(session.__cacheContract);
}
function isNearDuplicate(session, inSig) {
  const same = safeStr(session.__lastInboundSig || "") === safeStr(inSig || "");
  const age = nowMs() - Number(session.__lastHandledAt || 0);
  return same && age >= 0 && age <= DUP_WINDOW_MS;
}
function normalizeKnowledgeItems(value, domain) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  const out = [];
  for (const item of list) {
    if (typeof item === "string" && oneLine(item)) {
      out.push({ title: `${domain}_knowledge`, content: oneLine(item), source: `knowledge.${domain}`, score: 0.74, tags: [domain, "knowledge"] });
      continue;
    }
    if (!isObj(item)) continue;
    const content = oneLine(item.content || item.text || item.body || item.summary || item.note || "");
    if (!content) continue;
    out.push({
      title: safeStr(item.title || item.label || `${domain}_knowledge`),
      content,
      source: safeStr(item.source || `knowledge.${domain}`),
      score: clamp(item.score, 0, 1, 0.76),
      tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [domain, "knowledge"]
    });
  }
  return out;
}
function extractKnowledgeSections(rawInput, norm, session) {
  const out = {};
  for (const d of KNOWLEDGE_DOMAINS) out[d] = [];
  const bags = [
    rawInput?.knowledgeSections, rawInput?.knowledge, rawInput?.meta?.knowledgeSections,
    norm?.ctx?.knowledgeSections, norm?.body?.knowledgeSections, norm?.payload?.knowledgeSections,
    session?.__knowledgeSections, session?.knowledgeSections
  ].filter(isObj);
  for (const bag of bags) {
    for (const d of KNOWLEDGE_DOMAINS) out[d].push(...normalizeKnowledgeItems(bag[d], d));
  }
  return out;
}
function collectKnowledgeEvidence(meta, preferredDomain) {
  const sections = isObj(meta?.knowledgeSections) ? meta.knowledgeSections : {};
  const out = [];
  if (preferredDomain && Array.isArray(sections[preferredDomain])) out.push(...sections[preferredDomain]);
  for (const d of KNOWLEDGE_DOMAINS) {
    if (d === preferredDomain) continue;
    if (Array.isArray(sections[d])) out.push(...sections[d]);
  }
  return out.slice(0, 24);
}
function normalizeEmotionGuard(text, session) {
  const lockedEmotion = isObj(session?.__lockedEmotion) ? session.__lockedEmotion : null;
  if (EmotionRouteGuard && typeof EmotionRouteGuard.analyzeEmotionRoute === "function" && lockedEmotion?.locked) {
    try {
      const analyzed = EmotionRouteGuard.analyzeEmotionRoute({ text, lockedEmotion }, session || {});
      if (isObj(analyzed) && analyzed.ok !== false) {
        return {
          mode: safeStr(analyzed.mode || "REGULATED"),
          primaryEmotion: safeStr(analyzed.primaryEmotion || "neutral").toLowerCase(),
          secondaryEmotion: safeStr(analyzed.secondaryEmotion || "").toLowerCase(),
          emotionCluster: safeStr(analyzed.nuanceProfile?.cluster || analyzed.primaryEmotion || "neutral").toLowerCase(),
          intensity: clamp(analyzed.intensity, 0, 1, 0),
          valence: clamp(analyzed.valence, -1, 1, 0),
          supportModeCandidate: safeStr(analyzed.supportModeCandidate || "steady_assist"),
          supportFlags: isObj(analyzed.supportFlags) ? analyzed.supportFlags : {},
          deliveryTone: safeStr(analyzed.deliveryTone || ""),
          routeBias: safeStr(analyzed.routeBias || ""),
          archetype: safeStr(analyzed.archetype || "")
        };
      }
    } catch (_e) {}
  }

  const q = safeStr(text).toLowerCase();
  let primaryEmotion = "neutral";
  let intensity = 0.2;
  if (/(sad|down|grief|cry|depressed|heartbroken)/.test(q)) { primaryEmotion = "sad"; intensity = 0.82; }
  else if (/(anxious|panic|worried|overwhelmed|afraid|scared)/.test(q)) { primaryEmotion = "anxious"; intensity = 0.8; }
  else if (/(angry|mad|furious|frustrated)/.test(q)) { primaryEmotion = "angry"; intensity = 0.68; }
  else if (/(happy|great|excited|good)/.test(q)) { primaryEmotion = "positive"; intensity = 0.56; }

  return {
    mode: primaryEmotion === "neutral" ? "STEADY" : "VULNERABLE",
    primaryEmotion,
    secondaryEmotion: "",
    emotionCluster: primaryEmotion,
    intensity,
    valence: primaryEmotion === "positive" ? 0.6 : primaryEmotion === "neutral" ? 0 : -0.45,
    supportModeCandidate: primaryEmotion === "neutral" ? "steady_assist" : "supportive_containment",
    supportFlags: {
      highDistress: intensity >= 0.82,
      needsContainment: intensity >= 0.72,
      needsStabilization: intensity >= 0.78
    },
    deliveryTone: primaryEmotion === "anxious" ? "firm_calm" : primaryEmotion === "sad" ? "soft_attuned" : "neutral"
  };
}
function shouldForceMarion(norm, emo) {
  if (!safeStr(norm.text)) return false;
  if (emo?.supportFlags?.highDistress || emo?.supportFlags?.needsContainment || emo?.primaryEmotion === "sad" || emo?.primaryEmotion === "anxious") return true;
  return /(explain|analyze|break down|debug|fix|strategy|plan|why|rebuild|integrate|implementation|architecture)/i.test(norm.text);
}
function getMarionBridge() {
  if (MarionBridge) return MarionBridge;
  const factory = MarionBridgeMod && typeof MarionBridgeMod.createMarionBridge === "function"
    ? MarionBridgeMod.createMarionBridge
    : null;
  if (!factory) return null;
  MarionBridge = factory({
    memoryProvider: {
      async getContext(req) {
        const session = isObj(req?.meta?.session) ? req.meta.session : {};
        return {
          lastQuery: safeStr(session.__lastQuery || ""),
          lastDomain: safeStr(session.__lastDomain || ""),
          lastIntent: safeStr(session.__lastIntent || ""),
          repeatQueryStreak: Number(session.__repeatQueryStreak || 0),
          fallbackStreak: Number(session.__fallbackStreak || 0),
          continuityHealth: safeStr(session.__continuityHealth || "watch"),
          recoveryMode: safeStr(session.__recoveryMode || "normal")
        };
      },
      async putContext() { return true; }
    },
    evidenceEngine: {
      async collect(req) {
        return collectKnowledgeEvidence(req?.meta, req?.domain);
      }
    }
  });
  return MarionBridge;
}
function resolveMarionCognition(norm, session, opts = {}) {
  const mediate = typeof MarionSO?.mediate === "function" ? MarionSO.mediate : null;
  if (!mediate) {
    return {
      ok: false,
      fallback: true,
      used: false,
      lane: norm.lane || "general",
      effectiveLane: norm.lane || "general",
      intent: opts.forceMarion ? "ADVANCE" : "CLARIFY",
      mode: "transitional",
      dominance: "neutral",
      budget: "medium",
      audio: { speakEnabled: true, silent: false, maxSpeakChars: MAX_SPEECH_CHARS, voiceStyle: "neutral" },
      knowledgeDomains: { primaryDomain: norm.lane || "general", secondaryDomains: [], availableDomains: [], counts: {} },
      marionVersion: ""
    };
  }

  try {
    const result = mediate(
      {
        text: norm.text,
        lane: norm.lane,
        action: norm.action,
        payload: norm.payload,
        body: norm.body,
        ctx: norm.ctx,
        turnSignals: opts.turnSignals || {}
      },
      session || {},
      {
        requestId: opts.requestId,
        turnId: opts.turnId,
        inputSig: opts.inputSig,
        knowledgeSections: opts.knowledgeSections,
        publicMode: !!opts.publicMode,
        disableBridgeOnDistress: true,
        cpuBudgetMs: 40
      }
    );

    const lane = safeStr(result?.effectiveLane || result?.lane || norm.lane || "general").toLowerCase() || "general";
    return {
      ok: true,
      used: true,
      fallback: false,
      lane,
      effectiveLane: lane,
      intent: safeStr(result?.intent || "ADVANCE").toUpperCase(),
      mode: safeStr(result?.mode || "transitional").toLowerCase() || "transitional",
      dominance: safeStr(result?.dominance || "neutral").toLowerCase() || "neutral",
      budget: safeStr(result?.budget || "medium").toLowerCase() || "medium",
      movePolicy: isObj(result?.movePolicy) ? result.movePolicy : {},
      routeConfidence: clamp(result?.routeConfidence, 0, 1, 0.62),
      intentConfidence: clamp(result?.intentConfidence, 0, 1, 0.62),
      ambiguityScore: clamp(result?.ambiguityScore, 0, 1, 0.24),
      minimalClarifier: safeStr(result?.minimalClarifier || ""),
      unresolvedThreads: arr(result?.unresolvedThreads).slice(0, 6),
      actionHints: arr(result?.actionHints).slice(0, 6),
      assumptions: arr(result?.assumptions).slice(0, 6),
      contradictions: arr(result?.contradictions).slice(0, 4),
      bridge: isObj(result?.bridge) ? result.bridge : { enabled: false, reason: "none" },
      handoff: isObj(result?.handoff) ? result.handoff : {},
      audio: isObj(result?.audio) ? result.audio : { speakEnabled: true, silent: false, maxSpeakChars: MAX_SPEECH_CHARS, voiceStyle: "neutral" },
      tempo: isObj(result?.tempo) ? result.tempo : {},
      marionStyle: isObj(result?.marionStyle) ? result.marionStyle : {},
      supportCompatible: !!result?.supportCompatible,
      questionSuppression: !!result?.questionSuppression,
      knowledgeDomains: isObj(result?.knowledgeDomains) ? result.knowledgeDomains : { primaryDomain: lane, secondaryDomains: [], availableDomains: [], counts: {} },
      lanesUsed: arr(result?.lanesUsed).slice(0, 6),
      lanesAvailable: arr(result?.lanesAvailable).slice(0, 24),
      marionVersion: safeStr(result?.marionVersion || MarionSO?.MARION_VERSION || MarionSO?.SO_VERSION || MarionSO?.version || ""),
      raw: result
    };
  } catch (_e) {
    return {
      ok: false,
      fallback: true,
      used: false,
      lane: norm.lane || "general",
      effectiveLane: norm.lane || "general",
      intent: opts.forceMarion ? "ADVANCE" : "CLARIFY",
      mode: "transitional",
      dominance: "neutral",
      budget: "medium",
      audio: { speakEnabled: true, silent: false, maxSpeakChars: MAX_SPEECH_CHARS, voiceStyle: "neutral" },
      knowledgeDomains: { primaryDomain: norm.lane || "general", secondaryDomains: [], availableDomains: [], counts: {} },
      marionVersion: ""
    };
  }
}
function validateMarionResolution(out, emo) {
  if (!isObj(out)) return { ok: false, issues: ["bridge_result_not_object"], value: null };

  const issues = [];
  const packet = isObj(out.packet) ? out.packet : null;
  const reply = sanitizeUserFacingReply(out.reply || packet?.reply || packet?.synthesis?.answer || "");
  const domain = safeStr(out.domain || out.effectiveLane || "general").toLowerCase() || "general";
  const intent = safeStr(out.intent || "general").toLowerCase() || "general";
  const usedBridge = !!out.usedBridge && !!reply;

  if (out.usedBridge && !packet) issues.push("bridge_packet_missing");
  if (out.usedBridge && !reply) issues.push("bridge_reply_missing");

  return {
    ok: issues.length === 0,
    issues,
    value: {
      usedBridge,
      packet,
      reply,
      domain,
      intent,
      ui: isObj(out.ui) ? out.ui : {},
      followUps: dedupeFollowUps(out.followUps || []),
      emotionalTurn: isObj(out.emotionalTurn) ? out.emotionalTurn : null,
      result: isObj(out.result) ? out.result : { emotion: emo, turnMemory: continuityBandFromEmotion(emo) },
      authority: {
        mode: safeStr(packet?.authority?.mode || (usedBridge ? "bridge_primary" : "bridge_bypassed")),
        confidence: clamp(packet?.authority?.confidence, 0, 1, usedBridge ? 0.82 : 0),
        source: safeStr(packet?.authority?.source || "marion")
      }
    }
  };
}
async function maybeResolveMarionAnswer(rawInput, norm, session, emo, requestId, turnId, publicMode, knowledgeSections, marionCog) {
  const bridge = getMarionBridge();
  if (!bridge || typeof bridge.maybeResolve !== "function") {
    return {
      usedBridge: false,
      packet: null,
      reply: "",
      domain: marionCog.effectiveLane || norm.lane || "general",
      intent: marionCog.intent || "general",
      validation: { ok: true, issues: ["bridge_unavailable"] }
    };
  }

  try {
    const out = await bridge.maybeResolve({
      text: norm.text,
      turnId,
      sessionId: safeStr(session.id || rawInput.sessionId || norm.ctx.sessionId || ""),
      meta: {
        requestId,
        publicMode: !!publicMode,
        session,
        norm: { ...norm, lane: marionCog.effectiveLane || norm.lane },
        knowledgeSections,
        preferredDomain: marionCog.knowledgeDomains?.primaryDomain || marionCog.effectiveLane || norm.lane,
        emotion: emo,
        marion: marionCog.raw || marionCog
      }
    });
    const validated = validateMarionResolution(out, emo);
    return {
      ...(validated.value || {
        usedBridge: false,
        packet: null,
        reply: "",
        domain: marionCog.effectiveLane || norm.lane || "general",
        intent: marionCog.intent || "general"
      }),
      validation: { ok: validated.ok, issues: validated.issues }
    };
  } catch (_e) {
    return {
      usedBridge: false,
      packet: null,
      reply: "",
      domain: marionCog.effectiveLane || norm.lane || "general",
      intent: marionCog.intent || "general",
      validation: { ok: false, issues: ["bridge_exception"] }
    };
  }
}
function routeNonMarion(norm, session, lane) {
  const safeLane = safeStr(lane || norm.lane || session.lane || "general").toLowerCase() || "general";
  const routeOut = routeLane ? routeLane({ text: norm.text, lane: safeLane, session, payload: norm.payload }) : null;
  const reply = sanitizeUserFacingReply(
    safeStr(routeOut?.reply || routeOut?.text || "").trim() ||
    makeFallbackReply(norm, normalizeEmotionGuard(norm.text, session))
  );
  const ui = isObj(routeOut?.ui) ? routeOut.ui : buildUiForLane(safeLane);
  const followUps = dedupeFollowUps(routeOut?.followUps || buildFollowUpsForLane(safeLane, { text: norm.text, session }));
  return { reply, ui, followUps, routeOut };
}
function resolvePlannerInput(norm, emo, marion, continuity) {
  const lane = marion.effectiveLane || norm.lane || "general";
  const intent = safeStr(marion.intent || "ADVANCE").toLowerCase();
  const supportFirst = !!(
    emo.supportFlags?.highDistress ||
    emo.supportFlags?.needsContainment ||
    intent === "stabilize"
  );

  return {
    lane,
    intent,
    mode: marion.mode || "transitional",
    regulation: continuity.recoveryMode,
    message: norm.text,
    supportFirst,
    routeConfidence: marion.routeConfidence,
    intentConfidence: marion.intentConfidence,
    ambiguity: marion.ambiguityScore,
    actionHints: marion.actionHints,
    unresolvedAsks: marion.unresolvedThreads
  };
}
function resolveSpeechGovernor(args = {}) {
  const marion = isObj(args.marion) ? args.marion : {};
  const planner = isObj(args.planner) ? args.planner : {};
  const emotion = isObj(args.emotion) ? args.emotion : {};
  const state = Spine.coerceState(args.state || {});
  const session = isObj(args.session) ? args.session : {};
  const reply = sanitizeUserFacingReply(args.reply || "");
  const now = Number(args.now || nowMs()) || nowMs();
  const lane = safeStr(args.lane || marion.effectiveLane || "general").toLowerCase() || "general";

  const terminalStopUntil = Number(state?.audio?.terminalStopUntil || 0) || 0;
  const hardStop = terminalStopUntil > now;
  const speakEnabled = marion.audio?.speakEnabled !== false;
  const silent = !!marion.audio?.silent;
  const supportFirst = !!planner.supportFirst;
  const stabilizeIntent = safeStr(marion.intent || "").toUpperCase() === "STABILIZE";
  const shouldClarify = !!planner.shouldClarify;
  const highDistress = !!(emotion.supportFlags?.highDistress || emotion.supportFlags?.needsContainment);
  const techLane = /^(strategy|ai|finance|law|english|cybersecurity|psychology|general)$/i.test(lane);
  const maxChars = clamp(marion.audio?.maxSpeakChars, 120, 1200, MAX_SPEECH_CHARS);
  const spoken = reply.slice(0, maxChars).trim();
  const speakOnceKey = safeStr(marion.audio?.speakOnceKey || hashLite(`${lane}|${spoken}`).slice(0, 18));
  const sameSpeechKey = !!spoken && safeStr(session.__lastSpeechKey || "") === speakOnceKey;
  const sameReply = !!spoken && hashLite(spoken) === hashLite(safeStr(session.__lastReply || "").slice(0, maxChars).trim());
  const recentTurn = now - Number(session.__lastHandledAt || 0) <= DUP_WINDOW_MS;
  const duplicateSpeech = recentTurn && (sameSpeechKey || sameReply);

  let speak = false;
  if (!hardStop && !duplicateSpeech && speakEnabled && !silent && reply) {
    if (supportFirst || stabilizeIntent || highDistress) speak = true;
    else if (!shouldClarify) speak = true;
    else if (techLane && reply.length <= 220) speak = true;
  }

  const voiceStyle = safeStr(
    marion.audio?.voiceStyle ||
    (supportFirst || stabilizeIntent ? "grounded" : marion.dominance === "firm" ? "firm" : "neutral"),
    24
  );
  const priority = supportFirst || stabilizeIntent ? "high" : "normal";
  const interrupt = supportFirst || stabilizeIntent;

  return {
    speak,
    hardStop,
    duplicateSpeech,
    policy: hardStop ? "terminal_stop_active" : duplicateSpeech ? "speech_duplicate_suppressed" : speak ? "speak" : "silent",
    packet: {
      enabled: speak,
      speak,
      interrupt,
      priority,
      voiceStyle,
      bargeInAllowed: !!marion.audio?.bargeInAllowed,
      userGestureRequired: !!marion.audio?.userGestureRequired,
      text: speak ? spoken : "",
      speakOnceKey,
      lane,
      intent: safeStr(marion.intent || "ADVANCE").toUpperCase(),
      maxChars
    }
  };
}
function stableContract(base = {}) {
  const lane = safeStr(base.lane || "general").toLowerCase() || "general";
  const reply = sanitizeUserFacingReply(base.reply || base.payload?.reply || "");
  const followUps = dedupeFollowUps(base.followUps);
  const ui = isObj(base.ui) ? { ...base.ui } : quietUi("focused");
  ui.actions = dedupeFollowUps(ui.actions || followUps);
  ui.chips = arr(ui.chips).slice(0, MAX_FOLLOWUPS);

  const payload = isObj(base.payload)
    ? { ...base.payload, reply, text: reply, output: reply, message: reply }
    : { reply, text: reply, output: reply, message: reply };

  if (base.speech && isObj(base.speech)) payload.speech = { ...base.speech };

  return {
    ok: base.ok !== false,
    reply,
    payload,
    lane,
    laneId: safeStr(base.laneId || lane),
    sessionLane: safeStr(base.sessionLane || lane),
    bridge: isObj(base.bridge) ? base.bridge : null,
    ctx: isObj(base.ctx) ? base.ctx : {},
    ui,
    emotionalTurn: isObj(base.emotionalTurn) ? base.emotionalTurn : null,
    directives: arr(base.directives).slice(0, 8),
    followUps,
    followUpsStrings: followUps.map((x) => safeStr(x.label || "").trim()).filter(Boolean),
    sessionPatch: isObj(base.sessionPatch) ? base.sessionPatch : {},
    cog: isObj(base.cog) ? base.cog : {},
    requestId: safeStr(base.requestId || ""),
    meta: isObj(base.meta) ? base.meta : {}
  };
}
function makeFallbackReply(norm, emo, planner) {
  if (planner?.supportFirst || emo?.primaryEmotion === "sad") {
    return "I am here with you.\nTell me what feels heaviest right now, and I will stay with that thread.";
  }
  if (emo?.primaryEmotion === "anxious") {
    return "I can feel the pressure in this.\nGive me the most urgent piece first, and we will handle it one step at a time.";
  }
  if (planner?.shouldClarify && planner?.minimalClarifier) {
    return planner.minimalClarifier;
  }
  if (safeStr(norm.text)) {
    return "I have the thread.\nGive me one clean beat more, and I will answer directly.";
  }
  return "I am here.\nTell me what you want help with.";
}
function mergePresentation(norm, session, lane, emo, planner, marionAnswer, marionCog) {
  let reply = "";
  let ui = quietUi("focused");
  let followUps = [];
  let bridge = null;
  let meta = {
    marionBridgeUsed: false,
    marionPrimary: true,
    marionVersion: marionCog.marionVersion || "",
    plannerShape: safeStr(planner.replyShape || ""),
    plannerAction: safeStr(planner.nextBestAction || "")
  };

  if (marionAnswer.usedBridge && marionAnswer.reply) {
    const built = buildResponseContract({
      reply: marionAnswer.reply,
      domain: marionAnswer.domain || lane,
      intent: marionAnswer.intent || marionCog.intent || "general",
      emotion: marionAnswer.result?.emotion || emo,
      mode: marionCog.mode || "balanced"
    }, marionAnswer.packet || {});

    reply = built.reply;
    ui = { ...(isObj(marionAnswer.ui) ? marionAnswer.ui : {}), ...built.ui };
    followUps = dedupeFollowUps(marionAnswer.followUps || built.followUps);
    bridge = {
      v: "bridge.v4",
      authority: "marion_primary",
      domain: safeStr(marionAnswer.domain || marionCog.effectiveLane || lane || "general"),
      intent: safeStr(marionCog.intent || marionAnswer.intent || "general"),
      confidence: clamp(marionAnswer.authority?.confidence, 0, 1, 0.88),
      source: safeStr(marionAnswer.authority?.source || "marion")
    };
    meta.marionBridgeUsed = true;
  } else {
    const routed = routeNonMarion(norm, session, lane);
    reply = routed.reply;
    ui = { ...quietUi("focused"), ...(isObj(routed.ui) ? routed.ui : {}) };
    followUps = dedupeFollowUps(routed.followUps || []);
    bridge = {
      v: "bridge.v4",
      authority: "marion_primary_lane_shell",
      domain: safeStr(marionCog.effectiveLane || lane || "general"),
      intent: safeStr(marionCog.intent || "general"),
      confidence: 0.72,
      source: "marion"
    };
    meta.marionBridgeUsed = false;
  }

  if (planner.supportFirst) {
    ui = { ...quietUi("supportive"), ...ui, actions: [], chips: [] };
    followUps = [];
  } else if (planner.shouldClarify && planner.minimalClarifier) {
    reply = sanitizeUserFacingReply(planner.minimalClarifier || reply);
  }

  if (!reply) reply = makeFallbackReply(norm, emo, planner);

  const built = buildResponseContract({
    reply,
    domain: marionCog.effectiveLane || lane,
    intent: marionCog.intent || "general",
    emotion: emo,
    mode: marionCog.mode || "balanced"
  }, marionAnswer.packet || {});

  return {
    reply: built.reply || reply,
    ui: { ...ui, ...(built.ui || {}) },
    emotionalTurn: built.emotionalTurn,
    followUps: dedupeFollowUps(followUps.length ? followUps : built.followUps),
    lane: safeStr(marionCog.effectiveLane || lane || norm.lane || "general").toLowerCase() || "general",
    bridge,
    meta
  };
}
function buildSessionPatchFromContract(contract, session, inSig, speech) {
  const emo = isObj(contract.emotionalTurn?.emotion) ? contract.emotionalTurn.emotion : {};
  return {
    __cacheInSig: inSig,
    __cacheAt: nowMs(),
    __cacheContract: contract,
    __lastReply: contract.reply,
    __lastLane: contract.lane,
    __lastIntent: safeStr(contract.bridge?.intent || contract.meta?.intent || contract.ui?.intent || ""),
    __lastDomain: safeStr(contract.bridge?.domain || contract.meta?.domain || contract.ui?.domain || ""),
    __lastQuery: safeStr(session.__pendingText || ""),
    __continuityHealth: safeStr(contract.meta?.continuityHealth || contract.emotionalTurn?.continuityLevel || "steady"),
    __recoveryMode: safeStr(contract.meta?.recoveryMode || "normal"),
    __repeatQueryStreak: Number(session.__repeatQueryStreak || 0),
    __fallbackStreak: Number(session.__fallbackStreak || 0),
    __lastEmotion: safeStr(emo.primaryEmotion || ""),
    __lastHandledAt: nowMs(),
    __lastInboundSig: inSig,
    __lastSpeechKey: safeStr(speech?.packet?.speakOnceKey || ""),
    __lastSpeechPolicy: safeStr(speech?.policy || ""),
    __engineVersion: VERSION,
    __lockedEmotion: isObj(session.__lockedEmotion) ? session.__lockedEmotion : undefined
  };
}
function runDomainContractTests() {
  const failures = [];
  for (const domain of KNOWLEDGE_DOMAINS) {
    const contract = stableContract({
      reply: `ok ${domain}`,
      lane: domain,
      followUps: [{ label: "Next" }, { label: "Next" }],
      speech: { enabled: true, speak: true, text: "ok" }
    });
    if (contract.lane !== domain) failures.push(`lane_failed_${domain}`);
    if (!contract.reply) failures.push(`reply_missing_${domain}`);
    if (contract.followUps.length !== 1) failures.push(`followup_dedupe_failed_${domain}`);
    if (!isObj(contract.payload.speech)) failures.push(`speech_missing_${domain}`);
  }
  return { ok: failures.length === 0, failures };
}

async function handleChat(input) {
  const started = nowMs();
  const rawInput = isObj(input) ? input : {};
  const session = isObj(rawInput.session) ? rawInput.session : {};
  const norm = normalizeInbound(rawInput);
  const inboundValidation = validateInboundContract(rawInput, norm);
  const requestId = norm.requestId || `req_${hashLite(JSON.stringify({ t: norm.text, at: started })).slice(0, 16)}`;
  const turnId = norm.turnId || `turn_${hashLite(`${requestId}|${started}`).slice(0, 16)}`;
  const publicMode = inboundValidation.publicMode;
  const inSig = computeInboundSig(norm);
  const sessionKey = sessionKeyOf(session, rawInput, norm);
  const inflightKey = `${sessionKey}:${inSig}`;

  pruneInflight(started);
  logDiag("turn_start", {
    requestId: shortId(requestId),
    turnId: shortId(turnId),
    lane: inboundValidation.lane,
    text: norm.text.slice(0, 180),
    issues: inboundValidation.issues
  });

  if (canFastReplay(session, inSig)) {
    const replay = stableContract({
      ...session.__cacheContract,
      requestId,
      meta: { ...(session.__cacheContract.meta || {}), replay: true, source: "cache", version: VERSION }
    });
    replay.sessionPatch = { __cacheAt: nowMs(), __lastHandledAt: nowMs(), __lastInboundSig: inSig };
    return replay;
  }

  if (isNearDuplicate(session, inSig) && isObj(session.__cacheContract)) {
    const replay = stableContract({
      ...session.__cacheContract,
      requestId,
      meta: { ...(session.__cacheContract.meta || {}), replay: true, source: "near_duplicate", version: VERSION }
    });
    replay.sessionPatch = { __cacheAt: nowMs(), __lastHandledAt: nowMs(), __lastInboundSig: inSig };
    return replay;
  }

  if (INFLIGHT.has(inflightKey)) {
    const inflight = INFLIGHT.get(inflightKey);
    if (inflight?.promise && typeof inflight.promise.then === "function") return inflight.promise;
  }

  session.__pendingText = norm.text;

  const work = (async () => {
    try {
      const prevState = Spine.coerceState(session.__spineState || {});
      const emo = normalizeEmotionGuard(norm.text, session);
      const continuity = continuityBandFromEmotion(emo);
      const forceMarion = shouldForceMarion(norm, emo);
      const knowledgeSections = extractKnowledgeSections(rawInput, norm, session);

      const marionCog = resolveMarionCognition(norm, session, {
        requestId,
        turnId,
        inputSig: inSig,
        publicMode,
        forceMarion,
        knowledgeSections,
        turnSignals: {
          hasPayload: !!Object.keys(norm.payload || {}).length,
          textEmpty: !norm.text,
          payloadAction: norm.action,
          payloadActionable: !!norm.action
        }
      });

      let lane = safeStr(marionCog.effectiveLane || inboundValidation.lane || norm.lane || "general").toLowerCase() || "general";
      if (!KNOWLEDGE_DOMAINS.includes(lane)) lane = "general";

      const planner = planResponse(resolvePlannerInput(norm, emo, marionCog, continuity));
      const marionAnswer = await maybeResolveMarionAnswer(
        rawInput, norm, session, emo, requestId, turnId, publicMode, knowledgeSections, marionCog
      );

      const presentation = mergePresentation(norm, session, lane, emo, planner, marionAnswer, marionCog);
      lane = presentation.lane || lane;

      const speech = resolveSpeechGovernor({
        marion: marionCog,
        planner,
        emotion: emo,
        state: prevState,
        session,
        reply: presentation.reply,
        lane,
        now: started
      });

      const decision = {
        move: safeStr(marionCog.intent || "ADVANCE").toUpperCase(),
        stage: speech.hardStop ? "quiet" : planner.supportFirst ? "stabilize" : planner.shouldClarify ? "clarify" : "deliver",
        rationale: speech.policy
      };

      let nextState = Spine.finalizeTurn({
        prevState,
        lane,
        decision,
        inbound: {
          text: norm.text,
          turnSignals: {
            ttsAction: speech.hardStop ? "stop" : speech.speak ? "speak" : "silent",
            ttsShouldStop: speech.hardStop,
            ttsReason: speech.policy,
            emotionPrimary: emo.primaryEmotion,
            emotionSupportMode: emo.supportModeCandidate,
            emotionShouldSuppressMenus: !!planner.supportFirst
          }
        }
      });
      if (typeof Spine.assertTurnUpdated === "function" && !Spine.assertTurnUpdated(prevState, nextState)) {
        nextState = { ...Spine.coerceState(prevState), rev: Number(prevState?.rev || 0) + 1, lane, stage: safeStr(decision.stage || "deliver") || "deliver", audio: isObj(nextState?.audio) ? nextState.audio : isObj(prevState?.audio) ? prevState.audio : { terminalStopUntil: 0 } };
      }

      const meta = {
        version: VERSION,
        marionPrimary: true,
        marionFirst: forceMarion,
        marionVersion: marionCog.marionVersion,
        marionBridgeUsed: !!presentation.meta?.marionBridgeUsed,
        marionBridgeValidation: marionAnswer.validation,
        inboundIssues: inboundValidation.issues,
        continuityHealth: continuity.continuityHealth,
        recoveryMode: continuity.recoveryMode,
        continuityLevel: continuity.continuityLevel,
        speechPolicy: speech.policy,
        speechEnabled: !!speech.packet.enabled,
        duplicateSpeechSuppressed: !!speech.duplicateSpeech,
        plannerShape: safeStr(planner.replyShape || ""),
        engineGrade: "commercial_candidate",
        t: nowMs()
      };

      const contract = stableContract({
        ok: true,
        reply: presentation.reply,
        payload: {
          reply: presentation.reply,
          text: presentation.reply,
          output: presentation.reply,
          message: presentation.reply
        },
        speech: speech.packet,
        lane,
        laneId: lane,
        sessionLane: lane,
        bridge: presentation.bridge,
        ui: presentation.ui,
        emotionalTurn: presentation.emotionalTurn,
        followUps: presentation.followUps,
        cog: {
          marionVersion: marionCog.marionVersion,
          route: presentation.meta?.marionBridgeUsed ? "marion_bridge" : "marion_lane_shell",
          intent: safeStr(marionCog.intent || "ADVANCE").toUpperCase(),
          mode: marionCog.mode || "transitional",
          dominance: marionCog.dominance || "neutral",
          publicMode: !!publicMode,
          speechPolicy: speech.policy,
          audio: speech.packet,
          duplicateSpeechSuppressed: !!speech.duplicateSpeech,
          emotion: {
            primaryEmotion: emo.primaryEmotion,
            secondaryEmotion: emo.secondaryEmotion,
            intensity: emo.intensity,
            valence: emo.valence,
            supportModeCandidate: emo.supportModeCandidate,
            deliveryTone: emo.deliveryTone
          },
          planner,
          knowledgeDomains: marionCog.knowledgeDomains,
          lanesUsed: marionCog.lanesUsed,
          actionHints: marionCog.actionHints,
          assumptions: marionCog.assumptions,
          contradictions: marionCog.contradictions
        },
        requestId,
        meta
      });

      const memoryContext = buildMemoryContext({
        norm,
        session,
        contract,
        emotion: emo,
        bridge: contract.bridge,
        continuity
      });
      try {
        await Promise.resolve(storeMemoryTurn({
          norm,
          session,
          contract,
          memoryContext,
          bridge: contract.bridge,
          emotion: emo,
          continuity
        }));
      } catch (_e) {}

      const telemetry = buildTelemetry({
        phase: "turn",
        requestId,
        lane,
        publicMode,
        norm,
        bridge: contract.bridge,
        emotion: emo,
        continuity
      });
      contract.ctx = { telemetry };

      contract.sessionPatch = {
        ...buildSessionPatchFromContract(contract, session, inSig, speech),
        __spineState: nextState,
        __lastRequestId: requestId,
        __lastTurnId: turnId
      };

      logDiag("turn_ok", {
        requestId: shortId(requestId),
        turnId: shortId(turnId),
        lane,
        marion: true,
        speech: speech.policy,
        ms: nowMs() - started
      });

      return contract;
    } catch (err) {
      const emo = normalizeEmotionGuard(norm.text, session);
      const continuity = continuityBandFromEmotion(emo);
      const planner = planResponse(resolvePlannerInput(norm, emo, {
        effectiveLane: inboundValidation.lane || norm.lane || "general",
        intent: "ADVANCE",
        mode: "transitional",
        routeConfidence: 0.4,
        intentConfidence: 0.4,
        ambiguityScore: 0.5,
        actionHints: [],
        unresolvedThreads: [],
        audio: { speakEnabled: true, silent: false, maxSpeakChars: MAX_SPEECH_CHARS }
      }, continuity));

      const reply = makeFallbackReply(norm, emo, planner);
      const speech = resolveSpeechGovernor({
        marion: {
          effectiveLane: inboundValidation.lane || norm.lane || "general",
          intent: planner.supportFirst ? "STABILIZE" : "ADVANCE",
          mode: "transitional",
          dominance: "neutral",
          audio: { speakEnabled: true, silent: false, maxSpeakChars: MAX_SPEECH_CHARS, voiceStyle: "neutral" }
        },
        planner,
        emotion: emo,
        state: session.__spineState || {},
        session,
        reply,
        lane: inboundValidation.lane || norm.lane || "general",
        now: started
      });

      const contract = stableContract({
        ok: true,
        reply,
        payload: { reply, text: reply, output: reply, message: reply },
        speech: speech.packet,
        lane: inboundValidation.lane || norm.lane || "general",
        laneId: inboundValidation.lane || norm.lane || "general",
        sessionLane: inboundValidation.lane || norm.lane || "general",
        bridge: {
          v: "bridge.v4",
          authority: "failsafe",
          domain: inboundValidation.lane || norm.lane || "general",
          intent: planner.supportFirst ? "STABILIZE" : "ADVANCE",
          confidence: 0.35,
          source: "chatEngine"
        },
        ui: quietUi(emo.primaryEmotion === "neutral" ? "focused" : "supportive"),
        emotionalTurn: buildResponseContract({
          reply,
          domain: norm.lane || "general",
          intent: planner.supportFirst ? "stabilize" : "general",
          emotion: emo,
          mode: "balanced"
        }, {}).emotionalTurn,
        followUps: [],
        cog: {
          route: "failsafe",
          mode: "transitional",
          publicMode: !!publicMode,
          speechPolicy: speech.policy,
          audio: speech.packet,
          duplicateSpeechSuppressed: !!speech.duplicateSpeech,
          diag: {
            failSafe: true,
            err: safeStr(err?.message || err).slice(0, 180),
            source: "chatEngine",
            version: VERSION
          }
        },
        requestId,
        meta: {
          version: VERSION,
          failSafe: true,
          degradedSupport: true,
          suppressMenus: true,
          continuityHealth: continuity.continuityHealth,
          recoveryMode: continuity.recoveryMode,
          continuityLevel: continuity.continuityLevel,
          speechPolicy: speech.policy,
          t: nowMs()
        }
      });

      contract.sessionPatch = {
        __cacheInSig: inSig,
        __cacheAt: nowMs(),
        __cacheContract: contract,
        __lastHandledAt: nowMs(),
        __lastInboundSig: inSig
      };

      logDiag("turn_fail", {
        requestId: shortId(requestId),
        turnId: shortId(turnId),
        err: safeStr(err?.message || err).slice(0, 180),
        ms: nowMs() - started
      });

      return contract;
    } finally {
      INFLIGHT.delete(inflightKey);
    }
  })();

  INFLIGHT.set(inflightKey, { startedAt: started, promise: work });
  return work;
}

async function route(input) { return handleChat(input); }
const ask = route;
const handle = route;

module.exports = {
  VERSION,
  handleChat,
  route,
  ask,
  handle,
  normalizeInbound,
  validateInboundContract,
  validateMarionResolution,
  extractKnowledgeSections,
  collectKnowledgeEvidence,
  continuityBandFromEmotion,
  resolveSpeechGovernor,
  runDomainContractTests,
  default: handleChat
};
