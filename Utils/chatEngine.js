"use strict";

/**
 * Utils/chatEngine.js
 *
 * HARDENING GOALS
 * - Marion remains first authority for meaning when the turn warrants it
 * - Emotional routing can override generic lane flow without destabilizing continuity
 * - Stable contracts in, stable contracts out
 * - Duplicate suppression without dead-shell replies
 * - Fail-open behavior that still sounds human
 * - Inbound/result packet validation and replay-safe execution
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

const VERSION = "chatEngine v1.1.0 MARION-FIRST-HARDENED";
const KNOWLEDGE_DOMAINS = ["psychology", "law", "finance", "english", "cybersecurity", "ai", "strategy", "marketing", "general"];
const DUP_WINDOW_MS = 6000;
const CACHE_WINDOW_MS = 12000;
const INFLIGHT_TTL_MS = 15000;
const MAX_FOLLOWUPS = 4;
const MAX_TEXT_LEN = 5000;
const MAX_SPEECH_CHARS = 520;

function smallNumberToWords(n) {
  const ones = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const x = Math.trunc(Number(n) || 0);
  if (x < 20) return ones[Math.max(0, x)] || String(x);
  const t = Math.trunc(x / 10);
  const r = x % 10;
  return r ? `${tens[t]}-${ones[r]}` : tens[t];
}
function yearToSpeech(year) {
  const y = Number(year);
  if (!Number.isInteger(y)) return safeStr(year);
  if (y === 2000) return "two thousand";
  if (y > 2000 && y < 2010) return `two thousand ${smallNumberToWords(y % 100)}`;
  if (y >= 2010 && y <= 2099) return `twenty ${smallNumberToWords(y % 100)}`;
  if (y >= 1900 && y <= 1999) {
    const first = Math.trunc(y / 100);
    const last = y % 100;
    if (last === 0) return `${smallNumberToWords(first)} hundred`;
    return `${smallNumberToWords(first)} ${smallNumberToWords(last)}`;
  }
  return String(y);
}
function normalizeSpeechText(text) {
  const raw = safeStr(text);
  if (!raw) return "";
  return raw.replace(/\b(19\d{2}|20\d{2})\b/g, (m) => yearToSpeech(m));
}
function buildSpeechPacket(reply, lane, intent, emo, session) {
  const cleanReply = sanitizeUserFacingReply(reply || "");
  const spoken = normalizeSpeechText(cleanReply).slice(0, MAX_SPEECH_CHARS).trim();
  const speakOnceKey = hashLite(`${safeStr(lane)}|${spoken}`).slice(0, 18);
  const duplicate = !!spoken && safeStr(session && session.__lastSpeechKey || "") === speakOnceKey;
  const enabled = !!spoken && !duplicate;
  return {
    enabled,
    speak: enabled,
    text: enabled ? spoken : "",
    displayText: cleanReply,
    speakOnceKey,
    interrupt: !!(emo && emo.supportFlags && (emo.supportFlags.highDistress || emo.supportFlags.needsContainment)),
    priority: !!(emo && emo.supportFlags && (emo.supportFlags.highDistress || emo.supportFlags.needsContainment)) ? "high" : "normal",
    voiceStyle: emo && emo.primaryEmotion === "anxious" ? "grounded" : emo && emo.primaryEmotion === "sad" ? "soft" : "neutral",
    lane: safeStr(lane || "general").toLowerCase() || "general",
    intent: safeStr(intent || "general"),
    yearNormalization: true,
    maxChars: MAX_SPEECH_CHARS
  };
}

const routeLane = typeof laneRouter?.routeLane === "function" ? laneRouter.routeLane : null;
const buildUiForLane = typeof laneRouter?.buildUiForLane === "function" ? laneRouter.buildUiForLane : (lane) => ({ chips: [], allowMic: true, mode: lane || "focused" });
const buildFollowUpsForLane = typeof laneRouter?.buildFollowUpsForLane === "function" ? laneRouter.buildFollowUpsForLane : () => [];
const buildMemoryContext = typeof memoryAdapter?.buildMemoryContext === "function" ? memoryAdapter.buildMemoryContext : () => null;
const storeMemoryTurn = typeof memoryAdapter?.storeMemoryTurn === "function" ? memoryAdapter.storeMemoryTurn : async () => false;
const buildTelemetry = typeof telemetryAdapter?.buildTelemetry === "function"
  ? telemetryAdapter.buildTelemetry
  : (params = {}) => ({ phase: params.phase || "turn", requestId: params.requestId || "", lane: params.lane || "general", publicMode: !!params.publicMode });

const INFLIGHT = new Map();
let MarionBridge = null;

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

function nowMs() { return Date.now(); }
function safeStr(v) { return v == null ? "" : String(v); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function arr(v) { return Array.isArray(v) ? v : []; }
function oneLine(v) { return safeStr(v).replace(/\s+/g, " ").trim(); }
function truthy(v) { return /^(1|true|yes|on)$/i.test(safeStr(v).trim()); }
function clamp(n, min, max) { return Math.max(min, Math.min(max, Number(n) || 0)); }
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
function logDiag(event, payload) {
  if (!truthy(process.env.SB_CHAT_DEBUG || "true")) return;
  try { console.info("[CHAT_DIAG]", JSON.stringify({ ts: new Date().toISOString(), event, ...(isObj(payload) ? payload : {}) })); }
  catch (_e) {}
}
function quietUi(mode = "quiet") {
  return { chips: [], allowMic: true, mode, state: mode, replace: true, clearStale: true, actions: [] };
}
function sessionKeyOf(session, rawInput, norm) {
  return safeStr(session.id || rawInput.sessionId || norm.ctx?.sessionId || norm.body?.sessionId || norm.payload?.sessionId || "anon");
}
function pruneInflight(now = nowMs()) {
  for (const [k, v] of INFLIGHT.entries()) {
    if (!isObj(v) || now - Number(v.startedAt || 0) > INFLIGHT_TTL_MS) INFLIGHT.delete(k);
  }
}
function continuityBandFromEmotion(emo = {}) {
  const intensity = clamp(emo.intensity, 0, 1);
  const primary = safeStr(emo.primaryEmotion || "neutral").toLowerCase();
  if (emo.supportFlags?.highDistress || intensity >= 0.86) return { continuityHealth: "contain", continuityLevel: "high_hold", recoveryMode: "containment" };
  if (emo.supportFlags?.needsStabilization || primary === "anxious" || intensity >= 0.72) return { continuityHealth: "stabilize", continuityLevel: "stabilizing", recoveryMode: "paced" };
  if (primary === "sad" || primary === "angry" || intensity >= 0.56) return { continuityHealth: "watch", continuityLevel: "attuned", recoveryMode: "supportive" };
  if (primary === "positive" && intensity >= 0.45) return { continuityHealth: "open", continuityLevel: "expansive", recoveryMode: "normal" };
  return { continuityHealth: "steady", continuityLevel: "steady", recoveryMode: "normal" };
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
        score: clamp(Number(item.score || 0.76) || 0.76, 0, 1),
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
  const publicMode = toBool(norm.publicMode, true);
  return {
    ok: true,
    issues,
    publicMode,
    lane: KNOWLEDGE_DOMAINS.includes(norm.lane) ? norm.lane : "general"
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
  const payload = isObj(base.payload) ? { ...base.payload, reply, text: reply, output: reply, message: reply } : { reply, text: reply, output: reply, message: reply };
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
function makeFallbackReply(norm, emo) {
  if (emo?.primaryEmotion === "sad") return "I am here with you.\nTell me what feels heaviest right now, and I will stay with that thread.";
  if (emo?.primaryEmotion === "anxious") return "I can feel the pressure in this.\nGive me the most urgent piece first, and we will handle it one step at a time.";
  if (safeStr(norm.text)) return "I have the thread.\nGive me one clean beat more, and I will answer directly.";
  return "I am here.\nTell me what you want help with.";
}
function validateMarionResolution(out, emo) {
  if (!isObj(out)) return { ok: false, issues: ["bridge_result_not_object"], value: null };
  const issues = [];
  const usedBridge = !!out.usedBridge;
  const packet = isObj(out.packet) ? out.packet : null;
  const domain = KNOWLEDGE_DOMAINS.includes(safeStr(out.domain).toLowerCase()) ? safeStr(out.domain).toLowerCase() : "general";
  const intent = safeStr(out.intent || "general").toLowerCase() || "general";
  const reply = sanitizeUserFacingReply(out.reply || packet?.reply || packet?.synthesis?.reply || "");

  if (usedBridge && !packet) issues.push("bridge_packet_missing");
  if (usedBridge && !reply) issues.push("bridge_reply_missing");
  if (packet && packet.authority && Number.isNaN(Number(packet.authority.confidence))) issues.push("bridge_confidence_invalid");

  const authority = {
    mode: safeStr(packet?.authority?.mode || (usedBridge ? "bridge_primary" : "bridge_bypassed")),
    confidence: clamp(packet?.authority?.confidence ?? (usedBridge ? 0.82 : 0), 0, 1),
    source: safeStr(packet?.authority?.source || "marion")
  };

  return {
    ok: issues.length === 0,
    issues,
    value: {
      usedBridge: usedBridge && !!reply,
      packet,
      reply,
      domain,
      intent,
      ui: isObj(out.ui) ? out.ui : {},
      followUps: dedupeFollowUps(out.followUps || []),
      emotionalTurn: isObj(out.emotionalTurn) ? out.emotionalTurn : null,
      result: isObj(out.result) ? out.result : { emotion: emo, turnMemory: continuityBandFromEmotion(emo) },
      authority
    }
  };
}
async function maybeResolveMarion(rawInput, norm, session, emo, requestId, turnId, publicMode) {
  const bridge = getMarionBridge();
  const knowledgeSections = extractKnowledgeSections(rawInput, norm, session);
  if (!bridge || typeof bridge.maybeResolve !== "function") {
    return { usedBridge: false, packet: null, reply: "", sections: knowledgeSections, validation: { ok: true, issues: ["bridge_unavailable"] } };
  }

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
    const validated = validateMarionResolution(out, emo);
    return { ...(validated.value || { usedBridge: false, packet: null, reply: "", domain: "general", intent: "general" }), sections: knowledgeSections, validation: { ok: validated.ok, issues: validated.issues } };
  } catch (_e) {
    return { usedBridge: false, packet: null, reply: "", sections: knowledgeSections, validation: { ok: false, issues: ["bridge_exception"] } };
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
function isNearDuplicate(session, inSig) {
  const same = safeStr(session.__lastInboundSig || "") === safeStr(inSig || "");
  const age = nowMs() - Number(session.__lastHandledAt || 0);
  return same && age >= 0 && age <= DUP_WINDOW_MS;
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
    __lastSpeechKey: safeStr(speech?.speakOnceKey || speech?.packet?.speakOnceKey || contract?.payload?.speech?.speakOnceKey || ""),
    __lastSpeechPolicy: safeStr(speech?.policy || (contract?.payload?.speech?.speak ? "speak" : "silent") || "")
  };
}
function buildPresentationFromMarion(marion, lane, norm, emo) {
  const presentation = buildResponseContract({
    reply: marion.reply,
    domain: marion.domain || lane,
    intent: marion.intent || "general",
    emotion: marion.result?.emotion || emo,
    mode: marion.packet?.synthesis?.mode || "balanced"
  }, marion.packet || {});

  return {
    reply: presentation.reply,
    ui: { ...(isObj(marion.ui) ? marion.ui : {}), ...presentation.ui },
    emotionalTurn: isObj(marion.emotionalTurn) ? marion.emotionalTurn : presentation.emotionalTurn,
    followUps: dedupeFollowUps(marion.followUps || presentation.followUps),
    lane: safeStr(marion.domain || lane || norm.lane || "general").toLowerCase() || "general",
    bridge: {
      v: "bridge.v3",
      authority: safeStr(marion.authority?.mode || "bridge_primary"),
      domain: safeStr(marion.domain || "general"),
      intent: safeStr(marion.intent || "general"),
      confidence: clamp(marion.authority?.confidence ?? 0.82, 0, 1),
      source: safeStr(marion.authority?.source || "marion")
    },
    cog: { route: "marion_bridge", mode: marion.packet?.synthesis?.mode || "balanced", publicMode: false },
    meta: {
      marionBridgeUsed: true,
      marionBridgeDomain: marion.domain || "general",
      marionBridgeIntent: marion.intent || "general"
    }
  };
}
function buildFallbackPresentation(norm, session, lane, emo) {
  const routed = routeNonMarion(norm, session);
  const emotionalTurn = buildResponseContract({
    reply: routed.reply,
    domain: lane,
    intent: "general",
    emotion: emo,
    mode: "balanced"
  }, {}).emotionalTurn;

  return {
    reply: routed.reply,
    ui: { ...quietUi("focused"), ...(isObj(routed.ui) ? routed.ui : {}) },
    emotionalTurn,
    followUps: dedupeFollowUps(routed.followUps || []),
    lane,
    bridge: null,
    cog: { route: "lane_or_fallback", mode: "balanced", publicMode: false },
    meta: { marionBridgeUsed: false }
  };
}
function runDomainContractTests() {
  const failures = [];
  for (const domain of KNOWLEDGE_DOMAINS) {
    const contract = stableContract({ reply: `ok ${domain}`, lane: domain, followUps: [{ label: "Next" }, { label: "Next" }] });
    if (contract.lane !== domain) failures.push(`lane_failed_${domain}`);
    if (!contract.reply) failures.push(`reply_missing_${domain}`);
    if (contract.followUps.length !== 1) failures.push(`followup_dedupe_failed_${domain}`);
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
  logDiag("turn_start", { requestId: shortId(requestId), turnId: shortId(turnId), lane: inboundValidation.lane, text: norm.text.slice(0, 180), issues: inboundValidation.issues });

  if (canFastReplay(session, inSig)) {
    const replay = stableContract({ ...session.__cacheContract, requestId, meta: { ...(session.__cacheContract.meta || {}), replay: true, source: "cache", version: VERSION } });
    replay.sessionPatch = { __cacheAt: nowMs(), __lastHandledAt: nowMs(), __lastInboundSig: inSig };
    return replay;
  }

  if (isNearDuplicate(session, inSig) && isObj(session.__cacheContract)) {
    const replay = stableContract({ ...session.__cacheContract, requestId, meta: { ...(session.__cacheContract.meta || {}), replay: true, source: "near_duplicate", version: VERSION } });
    replay.sessionPatch = { __cacheAt: nowMs(), __lastHandledAt: nowMs(), __lastInboundSig: inSig };
    return replay;
  }

  if (INFLIGHT.has(inflightKey)) {
    const inflight = INFLIGHT.get(inflightKey);
    if (isObj(inflight?.promise)) return inflight.promise;
  }

  session.__pendingText = norm.text;

  const work = (async () => {
    try {
      const emo = normalizeEmotionGuard(norm.text, session);
      const continuity = continuityBandFromEmotion(emo);
      const marionFirst = shouldForceMarion(norm, emo);
      const marion = await maybeResolveMarion(rawInput, norm, session, emo, requestId, turnId, publicMode);

      let presentation = null;
      let lane = inboundValidation.lane || norm.lane || "general";
      let meta = {
        version: VERSION,
        marionFirst,
        marionValidation: marion.validation,
        inboundIssues: inboundValidation.issues,
        continuityHealth: continuity.continuityHealth,
        recoveryMode: continuity.recoveryMode,
        continuityLevel: continuity.continuityLevel,
        t: nowMs()
      };

      if (marion.usedBridge && marion.reply) {
        presentation = buildPresentationFromMarion(marion, lane, norm, emo);
        presentation.cog.publicMode = !!publicMode;
        lane = presentation.lane;
        meta = {
          ...meta,
          ...presentation.meta,
          continuityHealth: safeStr(marion.result?.turnMemory?.continuityHealth || continuity.continuityHealth),
          recoveryMode: safeStr(marion.result?.turnMemory?.recoveryMode || continuity.recoveryMode),
          continuityLevel: safeStr(marion.result?.turnMemory?.continuityLevel || continuity.continuityLevel)
        };
      } else {
        presentation = buildFallbackPresentation(norm, session, lane, emo);
        presentation.cog.publicMode = !!publicMode;
      }

      if (!presentation.reply) {
        presentation.reply = makeFallbackReply(norm, emo);
        presentation.ui = quietUi(emo.primaryEmotion === "neutral" ? "focused" : "supportive");
      }

      const prevState = Spine.coerceState(session.__spineState || {});
      const nextState = Spine.finalizeTurn({ prevState, lane });
      const speech = buildSpeechPacket(presentation.reply, lane, presentation.bridge?.intent || "general", emo, session);

      const contract = stableContract({
        ok: true,
        reply: presentation.reply,
        payload: { reply: presentation.reply, text: presentation.reply, output: presentation.reply, message: presentation.reply },
        speech,
        lane,
        laneId: lane,
        sessionLane: lane,
        bridge: presentation.bridge,
        ui: presentation.ui,
        emotionalTurn: presentation.emotionalTurn,
        followUps: presentation.followUps,
        cog: presentation.cog,
        requestId,
        meta: { ...meta, speechEnabled: !!speech.enabled, speechYearNormalization: true }
      });

      const memoryContext = buildMemoryContext({ norm, session, contract, emotion: emo, bridge: contract.bridge, continuity });
      try {
        await Promise.resolve(storeMemoryTurn({ norm, session, contract, memoryContext, bridge: contract.bridge, emotion: emo, continuity }));
      } catch (_e) {}

      const telemetry = buildTelemetry({ phase: "turn", requestId, lane, publicMode, norm, bridge: contract.bridge, emotion: emo, continuity });
      contract.ctx = { telemetry };
      contract.sessionPatch = {
        ...buildSessionPatchFromContract(contract, session, inSig, speech),
        __spineState: nextState,
        __lastRequestId: requestId,
        __lastTurnId: turnId
      };

      logDiag("turn_ok", { requestId: shortId(requestId), turnId: shortId(turnId), lane, marion: !!meta.marionBridgeUsed, ms: nowMs() - started });
      return contract;
    } catch (err) {
      const emo = normalizeEmotionGuard(norm.text, session);
      const continuity = continuityBandFromEmotion(emo);
      const reply = makeFallbackReply(norm, emo);
      const speech = buildSpeechPacket(reply, inboundValidation.lane || norm.lane || "general", "general", emo, session);
      const contract = stableContract({
        ok: true,
        reply,
        payload: { reply, text: reply, output: reply, message: reply },
        speech,
        lane: inboundValidation.lane || norm.lane || "general",
        laneId: inboundValidation.lane || norm.lane || "general",
        sessionLane: inboundValidation.lane || norm.lane || "general",
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
        meta: {
          version: VERSION,
          failSafe: true,
          degradedSupport: true,
          suppressMenus: true,
          continuityHealth: continuity.continuityHealth,
          recoveryMode: continuity.recoveryMode,
          continuityLevel: continuity.continuityLevel,
          t: nowMs(),
          speechEnabled: !!speech.enabled,
          speechYearNormalization: true
        }
      });
      contract.sessionPatch = {
        __cacheInSig: inSig,
        __cacheAt: nowMs(),
        __cacheContract: contract,
        __lastHandledAt: nowMs(),
        __lastInboundSig: inSig,
        __lastSpeechKey: safeStr(speech.speakOnceKey || "")
      };
      logDiag("turn_fail", { requestId: shortId(requestId), turnId: shortId(turnId), err: safeStr(err?.message || err).slice(0, 180), ms: nowMs() - started });
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
  runDomainContractTests,
  normalizeSpeechText,
  yearToSpeech,
  buildSpeechPacket,
  default: handleChat
};
