\
"use strict";

/**
 * Utils/chatEngine.js
 *
 * SURGICAL REWRITE GOALS
 * - Marion is the first authority for meaning
 * - Emotional routing can override generic lane flow
 * - Stable contracts in, stable contracts out
 * - Duplicate suppression without dead-shell replies
 * - Fail-open behavior that still sounds human
 */

let Spine = null;
let MarionBridgeMod = null;
let EmotionRouteGuard = null;
let Support = null;
let laneRouter = null;
let memoryAdapter = null;
let telemetryAdapter = null;

try { Spine = require("./stateSpine"); } catch (_e) { Spine = null; }
try { MarionBridgeMod = require("./marionBridge"); } catch (_e) { MarionBridgeMod = null; }
try { EmotionRouteGuard = require("./emotionRouteGuard"); } catch (_e) { EmotionRouteGuard = null; }
try { Support = require("./supportResponse"); } catch (_e) { Support = null; }
try { laneRouter = require("./laneRouter"); } catch (_e) { laneRouter = null; }
try { memoryAdapter = require("./chatMemoryAdapter"); } catch (_e) { memoryAdapter = null; }
try { telemetryAdapter = require("./chatTelemetryAdapter"); } catch (_e) { telemetryAdapter = null; }

const { buildResponseContract, sanitizeUserFacingReply } = require("./conversationalResponseSystem");

const VERSION = "chatEngine v1.0.0 MARION-FIRST-HARDENED";
const KNOWLEDGE_DOMAINS = ["psychology", "law", "finance", "english", "cybersecurity", "ai", "strategy", "marketing", "general"];
const DUP_WINDOW_MS = 6000;
const CACHE_WINDOW_MS = 12000;
const MAX_FOLLOWUPS = 4;

const routeLane = typeof laneRouter?.routeLane === "function" ? laneRouter.routeLane : null;
const buildUiForLane = typeof laneRouter?.buildUiForLane === "function" ? laneRouter.buildUiForLane : (lane) => ({ chips: [], allowMic: true, mode: lane || "focused" });
const buildFollowUpsForLane = typeof laneRouter?.buildFollowUpsForLane === "function" ? laneRouter.buildFollowUpsForLane : () => [];
const buildMemoryContext = typeof memoryAdapter?.buildMemoryContext === "function" ? memoryAdapter.buildMemoryContext : () => null;
const storeMemoryTurn = typeof memoryAdapter?.storeMemoryTurn === "function" ? memoryAdapter.storeMemoryTurn : async () => false;
const buildTelemetry = typeof telemetryAdapter?.buildTelemetry === "function"
  ? telemetryAdapter.buildTelemetry
  : (params = {}) => ({ phase: params.phase || "turn", requestId: params.requestId || "", lane: params.lane || "general", publicMode: !!params.publicMode });

if (!Spine) {
  Spine = {
    SPINE_VERSION: "fallback",
    createState(seed) { return { rev: 0, lane: safeStr(seed?.lane || "general"), stage: safeStr(seed?.stage || "open") }; },
    coerceState(v) { return isObj(v) ? v : { rev: 0, lane: "general", stage: "open" }; },
    decideNextMove() { return { move: "RESPOND", stage: "open", rationale: "fallback", speak: "" }; },
    finalizeTurn({ prevState, lane }) {
      const prev = isObj(prevState) ? prevState : { rev: 0, lane: "general", stage: "open" };
      return { ...prev, rev: Number(prev.rev || 0) + 1, lane: safeStr(lane || prev.lane || "general"), stage: "open" };
    },
    assertTurnUpdated() { return true; }
  };
}

let MarionBridge = null;

function nowMs() { return Date.now(); }
function safeStr(v) { return v == null ? "" : String(v); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function oneLine(v) { return safeStr(v).replace(/\s+/g, " ").trim(); }
function truthy(v) { return /^(1|true|yes|on)$/i.test(safeStr(v).trim()); }
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
function logDiag(event, payload) {
  if (!truthy(process.env.SB_CHAT_DEBUG || "true")) return;
  try { console.info("[CHAT_DIAG]", JSON.stringify({ ts: new Date().toISOString(), event, ...(isObj(payload) ? payload : {}) })); }
  catch (_e) {}
}
function quietUi(mode = "quiet") {
  return { chips: [], allowMic: true, mode, state: mode, replace: true, clearStale: true, actions: [] };
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
function normalizeKnowledgeItems(value, domain) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  const out = [];
  for (const item of list) {
    if (typeof item === "string" && oneLine(item)) {
      out.push({ title: `${domain}_knowledge`, content: oneLine(item), source: `knowledge.${domain}`, score: 0.74, tags: [domain, "knowledge"] });
      continue;
    }
    if (isObj(item)) {
      const content = oneLine(item.content || item.text || item.body || item.summary || item.note || "");
      if (!content) continue;
      out.push({
        title: safeStr(item.title || item.label || `${domain}_knowledge`),
        content,
        source: safeStr(item.source || `knowledge.${domain}`),
        score: Number(item.score || 0.76) || 0.76,
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [domain, "knowledge"]
      });
    }
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
function normalizeInbound(input = {}) {
  const body = isObj(input.body) ? input.body : {};
  const payload = isObj(input.payload) ? input.payload : {};
  const ctx = isObj(input.ctx) ? input.ctx : {};
  const text = oneLine(input.text || body.text || payload.text || input.message || body.message || "");
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
function normalizeEmotionGuard(text, session) {
  if (EmotionRouteGuard && typeof EmotionRouteGuard.analyze === "function") {
    try { return EmotionRouteGuard.analyze({ text, session }); } catch (_e) {}
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
    supportModeCandidate: primaryEmotion === "neutral" ? "steady_assist" : "supportive_containment",
    supportFlags: {
      highDistress: intensity >= 0.82,
      needsContainment: intensity >= 0.72,
      needsStabilization: intensity >= 0.78
    }
  };
}
function shouldForceMarion(norm, emo) {
  if (!safeStr(norm.text)) return false;
  if (emo?.supportFlags?.highDistress || emo?.supportFlags?.needsContainment || emo?.primaryEmotion === "sad" || emo?.primaryEmotion === "anxious") return true;
  if (/(explain|analyze|break down|debug|fix|strategy|plan|why)/i.test(norm.text)) return true;
  return false;
}
function dedupeFollowUps(items) {
  const out = [];
  const seen = new Set();
  for (const item of arr(items)) {
    const label = typeof item === "string" ? item : safeStr(item?.label || item?.title || item?.text || "");
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(typeof item === "string" ? { label, role: "advance", payload: { text: label } } : item);
  }
  return out.slice(0, MAX_FOLLOWUPS);
}
function stableContract(base = {}) {
  const lane = safeStr(base.lane || "general").toLowerCase() || "general";
  const reply = sanitizeUserFacingReply(base.reply || base.payload?.reply || "");
  const followUps = dedupeFollowUps(base.followUps);
  const ui = isObj(base.ui) ? { ...base.ui } : quietUi("focused");
  ui.actions = dedupeFollowUps(ui.actions || followUps);
  ui.chips = arr(ui.chips).slice(0, MAX_FOLLOWUPS);
  return {
    ok: base.ok !== false,
    reply,
    payload: isObj(base.payload) ? { ...base.payload, reply } : { reply, text: reply, output: reply, message: reply },
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
function makeFallbackReply(norm, emo) {
  if (emo?.primaryEmotion === "sad") return "I am here with you.\nTell me what feels heaviest right now, and I will stay with that thread.";
  if (emo?.primaryEmotion === "anxious") return "I can feel the pressure in this.\nGive me the most urgent piece first, and we will handle it one step at a time.";
  if (safeStr(norm.text)) return "I have the thread.\nGive me one clean beat more, and I will answer directly.";
  return "I am here.\nTell me what you want help with.";
}
async function maybeResolveMarion(rawInput, norm, session, emo, requestId, turnId, publicMode) {
  const bridge = getMarionBridge();
  if (!bridge || typeof bridge.maybeResolve !== "function") return { usedBridge: false, packet: null, sections: extractKnowledgeSections(rawInput, norm, session) };
  const knowledgeSections = extractKnowledgeSections(rawInput, norm, session);
  const preferredDomain = shouldForceMarion(norm, emo) && (emo.primaryEmotion === "sad" || emo.primaryEmotion === "anxious") ? "psychology" : "";
  try {
    const out = await bridge.maybeResolve({
      text: norm.text,
      turnId,
      sessionId: safeStr(session.id || rawInput.sessionId || norm.ctx.sessionId || ""),
      meta: {
        requestId,
        publicMode: !!publicMode,
        session,
        norm,
        knowledgeSections,
        preferredDomain,
        emotion: emo
      }
    });
    return { ...(isObj(out) ? out : {}), sections: knowledgeSections };
  } catch (_e) {
    return { usedBridge: false, packet: null, sections: knowledgeSections };
  }
}
function routeNonMarion(norm, session) {
  const lane = safeStr(norm.lane || session.lane || "general").toLowerCase() || "general";
  const routeOut = routeLane ? routeLane({ text: norm.text, lane, session, payload: norm.payload }) : null;
  const reply = sanitizeUserFacingReply(
    safeStr(routeOut?.reply || routeOut?.text || "").trim() ||
    makeFallbackReply(norm, normalizeEmotionGuard(norm.text, session))
  );
  const ui = isObj(routeOut?.ui) ? routeOut.ui : buildUiForLane(lane);
  const followUps = dedupeFollowUps(routeOut?.followUps || buildFollowUpsForLane(lane, { text: norm.text, session }));
  return { reply, ui, followUps, routeOut };
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
function buildSessionPatchFromContract(contract, session, inSig) {
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
    __lastEmotion: safeStr(emo.primaryEmotion || "")
  };
}

async function handleChat(input) {
  const started = nowMs();
  const rawInput = isObj(input) ? input : {};
  const session = isObj(rawInput.session) ? rawInput.session : {};
  const norm = normalizeInbound(rawInput);
  const requestId = norm.requestId || `req_${hashLite(JSON.stringify({ t: norm.text, at: started })).slice(0, 16)}`;
  const turnId = norm.turnId || `turn_${hashLite(`${requestId}|${started}`).slice(0, 16)}`;
  const publicMode = norm.publicMode !== undefined ? !!norm.publicMode : true;
  const inSig = computeInboundSig(norm);

  logDiag("turn_start", { requestId: shortId(requestId), turnId: shortId(turnId), lane: norm.lane, text: norm.text.slice(0, 180) });

  if (canFastReplay(session, inSig)) {
    const replay = stableContract({ ...session.__cacheContract, requestId, meta: { ...(session.__cacheContract.meta || {}), replay: true, source: "cache", version: VERSION } });
    replay.sessionPatch = { __cacheAt: nowMs() };
    return replay;
  }

  session.__pendingText = norm.text;

  try {
    const emo = normalizeEmotionGuard(norm.text, session);
    const marionFirst = shouldForceMarion(norm, emo);
    const marion = await maybeResolveMarion(rawInput, norm, session, emo, requestId, turnId, publicMode);

    let reply = "";
    let ui = quietUi("focused");
    let emotionalTurn = null;
    let followUps = [];
    let bridge = null;
    let cog = {};
    let lane = norm.lane || "general";
    let meta = {
      version: VERSION,
      marionBridgeUsed: false,
      marionFirst,
      t: nowMs()
    };

    if (marion.usedBridge && marion.packet && marion.reply) {
      const presentation = buildResponseContract({
        reply: marion.reply,
        domain: marion.domain || lane,
        intent: marion.intent || "general",
        emotion: marion.result?.emotion || emo,
        mode: marion.packet?.synthesis?.mode || "balanced"
      }, marion.packet);

      reply = presentation.reply;
      ui = { ...(isObj(marion.ui) ? marion.ui : {}), ...presentation.ui };
      emotionalTurn = isObj(marion.emotionalTurn) ? marion.emotionalTurn : presentation.emotionalTurn;
      followUps = dedupeFollowUps(marion.followUps || presentation.followUps);
      lane = safeStr(marion.domain || norm.lane || "general").toLowerCase() || "general";
      bridge = {
        v: "bridge.v3",
        authority: safeStr(marion.packet?.authority?.mode || "bridge_primary"),
        domain: safeStr(marion.domain || "general"),
        intent: safeStr(marion.intent || "general"),
        confidence: Number(marion.packet?.authority?.confidence || 0.82)
      };
      cog = { route: "marion_bridge", mode: marion.packet?.synthesis?.mode || "balanced", publicMode: !!publicMode };
      meta = {
        ...meta,
        marionBridgeUsed: true,
        marionBridgeDomain: marion.domain || "general",
        marionBridgeIntent: marion.intent || "general",
        continuityHealth: safeStr(marion.result?.turnMemory?.continuityHealth || "steady"),
        recoveryMode: safeStr(marion.result?.turnMemory?.recoveryMode || "normal")
      };
    } else {
      const routed = routeNonMarion(norm, session);
      reply = routed.reply;
      ui = { ...quietUi("focused"), ...(isObj(routed.ui) ? routed.ui : {}) };
      followUps = dedupeFollowUps(routed.followUps || []);
      emotionalTurn = buildResponseContract({
        reply,
        domain: lane,
        intent: "general",
        emotion: emo,
        mode: "balanced"
      }, {}).emotionalTurn;
      bridge = null;
      cog = { route: "lane_or_fallback", mode: "balanced", publicMode: !!publicMode };
      meta = {
        ...meta,
        continuityHealth: "steady",
        recoveryMode: "normal"
      };
    }

    if (!reply) {
      reply = makeFallbackReply(norm, emo);
      ui = quietUi(emo.primaryEmotion === "neutral" ? "focused" : "supportive");
    }

    const prevState = Spine.coerceState(session.__spineState || {});
    const nextState = Spine.finalizeTurn({ prevState, lane });

    const contract = stableContract({
      ok: true,
      reply,
      payload: { reply, text: reply, output: reply, message: reply },
      lane,
      laneId: lane,
      sessionLane: lane,
      bridge,
      ui,
      emotionalTurn,
      followUps,
      cog,
      requestId,
      meta
    });

    const memoryContext = buildMemoryContext({ norm, session, contract, emotion: emo, bridge });
    try {
      await Promise.resolve(storeMemoryTurn({ norm, session, contract, memoryContext, bridge, emotion: emo }));
    } catch (_e) {}

    const telemetry = buildTelemetry({ phase: "turn", requestId, lane, publicMode, norm, bridge, emotion: emo });
    contract.ctx = { telemetry };
    contract.sessionPatch = {
      ...buildSessionPatchFromContract(contract, session, inSig),
      __spineState: nextState,
      __lastRequestId: requestId,
      __lastTurnId: turnId,
      __lastInboundSig: inSig
    };

    logDiag("turn_ok", { requestId: shortId(requestId), turnId: shortId(turnId), lane, marion: !!meta.marionBridgeUsed, ms: nowMs() - started });
    return contract;
  } catch (err) {
    const emo = normalizeEmotionGuard(norm.text, session);
    const reply = makeFallbackReply(norm, emo);
    const contract = stableContract({
      ok: true,
      reply,
      payload: { reply, text: reply, output: reply, message: reply },
      lane: norm.lane || "general",
      laneId: norm.lane || "general",
      sessionLane: norm.lane || "general",
      bridge: null,
      ui: quietUi(emo.primaryEmotion === "neutral" ? "focused" : "supportive"),
      emotionalTurn: buildResponseContract({ reply, domain: norm.lane || "general", intent: "general", emotion: emo, mode: "balanced" }, {}).emotionalTurn,
      followUps: [],
      cog: {
        route: "failsafe",
        mode: "transitional",
        publicMode: !!publicMode,
        diag: { failSafe: true, err: safeStr(err?.message || err).slice(0, 180), source: "chatEngine", version: VERSION }
      },
      requestId,
      meta: { version: VERSION, failSafe: true, degradedSupport: true, suppressMenus: true, t: nowMs() }
    });
    contract.sessionPatch = {
      __cacheInSig: inSig,
      __cacheAt: nowMs(),
      __cacheContract: contract
    };
    logDiag("turn_fail", { requestId: shortId(requestId), turnId: shortId(turnId), err: safeStr(err?.message || err).slice(0, 180), ms: nowMs() - started });
    return contract;
  }
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
  extractKnowledgeSections,
  collectKnowledgeEvidence,
  default: handleChat
};
