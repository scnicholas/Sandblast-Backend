"use strict";

/**
 * Utils/chatEngine.js
 *
 * chatEngine v0.11.1 OPINTEL LOOP-HARDEN
 * ------------------------------------------------------------
 * PURPOSE
 * - Keep Chat Engine as the single semantic turn authority
 * - Preserve structural integrity and fail-open behavior
 * - Remove lane/memory/telemetry/persona bulk from the hot path
 * - Centralize turn lifecycle, duplicate suppression, and clean contract return
 *
 * 15 PHASE COVERAGE
 * ------------------------------------------------------------
 * Phase 01: Inbound normalization
 * Phase 02: Session / request identity
 * Phase 03: Emotional route-guard intake
 * Phase 04: Support packet routing
 * Phase 05: Distress / recovery / positive handling
 * Phase 06: Public-mode sanitization
 * Phase 07: Greeting handling
 * Phase 08: Inbound duplicate breaker
 * Phase 09: Turn lifecycle lock
 * Phase 10: Lane routing delegation
 * Phase 11: Spine finalization
 * Phase 12: Memory write-through
 * Phase 13: Telemetry shaping
 * Phase 14: Stable contract assembly
 * Phase 15: Fail-open terminal safety
 */

let Spine = null;
let MarionBridgeMod = null;
let MarionBridge = null;
let MarionSO = null;
let EmotionRouteGuard = null;
let Support = null;

try { Spine = require("./stateSpine"); } catch (_e) { Spine = null; }
try { MarionBridgeMod = require("./marionBridge"); } catch (_e) { MarionBridgeMod = null; }
try { MarionSO = require("./marionSO"); } catch (_e) { MarionSO = null; }
try { EmotionRouteGuard = require("./emotionRouteGuard"); } catch (_e) { EmotionRouteGuard = null; }
try { Support = require("./supportResponse"); } catch (_e) { Support = null; }

let laneRouter = null;
let memoryAdapter = null;
let telemetryAdapter = null;

try { laneRouter = require("./laneRouter"); } catch (_e) { laneRouter = null; }
try { memoryAdapter = require("./chatMemoryAdapter"); } catch (_e) { memoryAdapter = null; }
try { telemetryAdapter = require("./chatTelemetryAdapter"); } catch (_e) { telemetryAdapter = null; }

if (!Spine) {
  Spine = {
    SPINE_VERSION: "missing",
    createState: (seed) => ({
      rev: 0,
      lane: (seed && seed.lane) || "general",
      stage: (seed && seed.stage) || "open"
    }),
    coerceState: (s) => (s && typeof s === "object" ? s : { rev: 0, lane: "general", stage: "open" }),
    decideNextMove: () => ({ move: "CLARIFY", stage: "open", rationale: "spine_missing", speak: "" }),
    finalizeTurn: ({ prevState }) => {
      const prev = prevState && typeof prevState === "object"
        ? prevState
        : { rev: 0, lane: "general", stage: "open" };
      return { ...prev, rev: (Number.isFinite(prev.rev) ? prev.rev : 0) + 1 };
    },
    assertTurnUpdated: () => true
  };
}

const routeLane = typeof laneRouter?.routeLane === "function"
  ? laneRouter.routeLane
  : null;

const buildUiForLane = typeof laneRouter?.buildUiForLane === "function"
  ? laneRouter.buildUiForLane
  : function fallbackBuildUiForLane() {
      return {
        chips: [],
        allowMic: true,
        mode: "quiet"
      };
    };

const buildFollowUpsForLane = typeof laneRouter?.buildFollowUpsForLane === "function"
  ? laneRouter.buildFollowUpsForLane
  : function fallbackBuildFollowUpsForLane() {
      return [];
    };

const buildMemoryContext = typeof memoryAdapter?.buildMemoryContext === "function"
  ? memoryAdapter.buildMemoryContext
  : function fallbackBuildMemoryContext() { return null; };

const storeMemoryTurn = typeof memoryAdapter?.storeMemoryTurn === "function"
  ? memoryAdapter.storeMemoryTurn
  : function fallbackStoreMemoryTurn() { return false; };

const buildTelemetry = typeof telemetryAdapter?.buildTelemetry === "function"
  ? telemetryAdapter.buildTelemetry
  : function fallbackBuildTelemetry(params) {
      const src = isPlainObject(params) ? params : {};
      return {
        phase: safeStr(src.phase || "turn"),
        requestId: safeStr(src.requestId || ""),
        lane: safeStr(src.lane || src?.norm?.lane || "general"),
        publicMode: !!src.publicMode,
        emotion: null,
        dataset: null
      };
    };

const CE_VERSION = "chatEngine v0.18.0 BACKEND-STABILITY HARDEN";

const KNOWLEDGE_DOMAINS = ["psychology", "law", "finance", "language", "ai_cyber", "marketing_media"];

function getMarionBridge() {
  if (MarionBridge) return MarionBridge;
  const factory = MarionBridgeMod && typeof MarionBridgeMod.createMarionBridge === "function"
    ? MarionBridgeMod.createMarionBridge
    : null;
  if (!factory) return null;
  MarionBridge = factory({
    marionSO: MarionSO,
    memoryProvider: {
      async getContext(req) {
        const meta = isPlainObject(req?.meta) ? req.meta : {};
        const session = isPlainObject(meta.session) ? meta.session : {};
        return {
          lastIntent: safeStr(session.__lastIntent || session.lastIntent || ""),
          lastDomain: safeStr(session.__lastDomain || session.lastDomain || ""),
          openLoops: Array.isArray(session.__openLoops) ? session.__openLoops : [],
          userPreferences: Array.isArray(session.__userPreferences) ? session.__userPreferences : [],
          recentTopics: Array.isArray(session.__recentTopics) ? session.__recentTopics : []
        };
      },
      async putContext() { return true; }
    },
    evidenceEngine: {
      async collect(req) {
        const meta = isPlainObject(req?.meta) ? req.meta : {};
        return collectKnowledgeEvidence(meta, req?.domain);
      }
    }
  });
  return MarionBridge;
}

function normalizeKnowledgeItems(value, domain) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  const out = [];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === "string") {
      const content = oneLine(item).trim();
      if (content) out.push({ title: `${domain}_knowledge`, content, source: `knowledge.${domain}`, score: 0.78, tags: [domain, "knowledge"] });
      continue;
    }
    if (isPlainObject(item)) {
      const content = oneLine(item.content || item.text || item.body || item.summary || item.note || "").trim();
      if (!content) continue;
      out.push({
        title: safeStr(item.title || item.label || `${domain}_knowledge`),
        content,
        source: safeStr(item.source || `knowledge.${domain}`),
        score: Number(item.score || 0.8) || 0.8,
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 8) : [domain, "knowledge"]
      });
    }
  }
  return out;
}

function extractKnowledgeSections(rawInput, norm, session) {
  const domains = {};
  for (const d of KNOWLEDGE_DOMAINS) domains[d] = [];
  const raw = isPlainObject(rawInput) ? rawInput : {};
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const bags = [
    raw.knowledgeSections, raw.knowledge, raw.meta?.knowledgeSections, raw.meta?.knowledge,
    n.ctx?.knowledgeSections, n.ctx?.knowledge, n.body?.knowledgeSections, n.body?.knowledge,
    n.payload?.knowledgeSections, n.payload?.knowledge,
    s.__knowledgeSections, s.knowledgeSections, s.meta?.knowledgeSections, s.meta?.knowledge
  ].filter(isPlainObject);
  for (const bag of bags) {
    for (const d of KNOWLEDGE_DOMAINS) {
      domains[d].push(...normalizeKnowledgeItems(bag[d], d));
    }
  }
  return domains;
}

function collectKnowledgeEvidence(meta, preferredDomain) {
  const sections = isPlainObject(meta?.knowledgeSections) ? meta.knowledgeSections : {};
  const out = [];
  if (preferredDomain && Array.isArray(sections[preferredDomain])) out.push(...sections[preferredDomain]);
  for (const d of KNOWLEDGE_DOMAINS) {
    if (d === preferredDomain) continue;
    if (Array.isArray(sections[d])) out.push(...sections[d]);
  }
  return out.slice(0, 24);
}

function shouldSuppressLaneArtifacts(norm, emo, routeOut) {
  if (isTechnicalExecutionInbound(norm)) return true;
  if (emo?.bypassClarify || emo?.fallbackSuppression || emo?.routeExhaustion || emo?.supportFlags?.mentionsLooping) return true;
  if (emo?.supportFlags?.crisis || emo?.supportFlags?.highDistress || emo?.supportFlags?.needsStabilization) return true;
  if (emo?.conversationPlan?.shouldSuppressMenus || emo?.nuanceProfile?.supportLockBias === "strong") return true;
  if (safeStr(norm?.ctx?.supportLockMode || norm?.ctx?.supportLock || "").toLowerCase() === "active") return true;
  if (safeStr(norm?.ctx?.conversationMode || "").toLowerCase() === "support") return true;
  const routeReply = safeStr(routeOut?.reply || "");
  if (/pick a lane|take it there|exact target|go to music|go to movies|menu|tap reset/i.test(routeReply)) return true;
  return false;
}

function quietUi(mode) {
  return { chips: [], allowMic: true, mode: safeStr(mode || "quiet") || "quiet" };
}

function laneArtifactsForTurn(norm, emo, lane, followUpsRaw, uiRaw, routeOut) {
  const suppress = shouldSuppressLaneArtifacts(norm, emo, routeOut);
  if (suppress) return { followUps: [], followUpsStrings: [], ui: quietUi(emo ? "supportive" : "direct"), menusSuppressed: true };
  const followUps = dedupeFollowUpsForExecution(followUpsRaw, norm, emo);
  const followUpsStrings = (Array.isArray(followUps) ? followUps : []).map((x) => safeStr(x?.label || x?.title || "")).filter(Boolean);
  const ui = isPlainObject(uiRaw) ? uiRaw : buildUiForLane(lane);
  return { followUps, followUpsStrings, ui, menusSuppressed: false };
}

async function maybeResolveMarionBridge(rawInput, norm, session, emo, requestId, turnId, publicMode) {
  const bridge = getMarionBridge();
  if (!bridge || typeof bridge.maybeResolve !== "function") return { usedBridge: false, packet: null, sections: extractKnowledgeSections(rawInput, norm, session) };
  const knowledgeSections = extractKnowledgeSections(rawInput, norm, session);
  const domainHint = (emo && (emo.supportFlags?.needsConnection || emo.supportFlags?.needsStabilization || emo.mode === "VULNERABLE")) ? "psychology" : safeStr(rawInput?.preferredDomain || "");
  const req = {
    text: safeStr(norm?.text || ""),
    sessionId: safeStr(session?.id || rawInput?.sessionId || norm?.ctx?.sessionId || ""),
    userId: safeStr(rawInput?.userId || session?.userId || ""),
    turnId: safeStr(turnId || ""),
    meta: {
      requestId,
      publicMode: !!publicMode,
      session: isPlainObject(session) ? session : {},
      norm,
      knowledgeSections,
      preferredDomain: domainHint || undefined,
      emotion: emo ? {
        mode: emo.mode,
        primaryEmotion: emo.primaryEmotion,
        secondaryEmotion: emo.secondaryEmotion,
        emotionCluster: emo.emotionCluster,
        supportModeCandidate: emo.supportModeCandidate,
        fallbackSuppression: !!emo.fallbackSuppression,
        routeExhaustion: !!emo.routeExhaustion,
        expressionStyle: safeStr(emo.expressionStyle || "").toLowerCase(),
        deliveryTone: safeStr(emo.deliveryTone || "").toLowerCase(),
        semanticFrame: safeStr(emo.semanticFrame || "").toLowerCase(),
        responseFamily: safeStr(emo.responseFamily || "").toLowerCase()
      } : null
    }
  };
  try {
    const out = await bridge.maybeResolve(req);
    return { ...(isPlainObject(out) ? out : {}), sections: knowledgeSections };
  } catch (_e) {
    return { usedBridge: false, packet: null, sections: knowledgeSections };
  }
}

function nowMs() {
  return Date.now();
}
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}
function isPlainObject(x) {
  return !!x &&
    typeof x === "object" &&
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
function truthy(v) {
  if (v === true) return true;
  const s = safeStr(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y" || s === "on";
}
function falsy(v) {
  if (v === false) return true;
  const s = safeStr(v).trim().toLowerCase();
  return s === "0" || s === "false" || s === "no" || s === "n" || s === "off";
}
const CHAT_DEBUG = !falsy(process.env.SB_CHAT_DEBUG || "true");
function shortId(v, keep = 6) {
  const s = safeStr(v).trim();
  if (!s) return "";
  if (s.length <= keep * 2) return s;
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}
function previewText(v, max = 180) {
  const s = oneLine(v).replace(/[\r\n]+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
function hashText(v) {
  const s = safeStr(v).trim();
  return s ? sha1Lite(s).slice(0, 12) : "";
}
function logChatDiag(event, data) {
  if (!CHAT_DEBUG) return;
  try {
    const payload = isPlainObject(data) ? data : {};
    const line = {
      ts: new Date().toISOString(),
      event: safeStr(event || 'chat_diag'),
      ...payload
    };
    console.info('[CHAT_DIAG]', safeJsonStringify(line));
  } catch (_e) {}
}
function buildTurnDiagSnapshot(norm, session, extra) {
  const n = isPlainObject(norm) ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const x = isPlainObject(extra) ? extra : {};
  return {
    requestId: shortId(x.requestId || ''),
    turnId: shortId(x.turnId || ''),
    sessionId: shortId(x.sessionId || ''),
    inboundKey: shortId(x.inboundKey || ''),
    inboundSig: shortId(x.inSig || ''),
    lane: safeStr(x.lane || n.lane || s.lane || 'general') || 'general',
    publicMode: !!x.publicMode,
    textHash: hashText(n.text || ''),
    textPreview: previewText(n.text || ''),
    textLen: safeStr(n.text || '').length,
    action: safeStr(n.action || n?.payload?.action || ''),
    route: safeStr(n?.payload?.route || ''),
    cachedReplyHash: hashText(s.__cacheReply || ''),
    cachedReplyAgeMs: Number(s.__cacheAt || 0) ? Math.max(0, nowMs() - Number(s.__cacheAt || 0)) : 0,
    loopN: clampInt(s.__loopN || 0, 0, 0, 99),
    inboundN: clampInt(s.__inN || 0, 0, 0, 99),
    activeTurnId: shortId(s.__turnActiveId || ''),
    elapsedMs: Number(x.elapsedMs || 0) || 0
  };
}
function oneLine(s) {
  return safeStr(s).replace(/\s+/g, " ").trim();
}
function splitLines(s) {
  return safeStr(s).split("\n");
}
function takeLines(s, maxLines) {
  return splitLines(s).slice(0, Math.max(1, maxLines)).join("\n").trim();
}
function safeJsonStringify(x) {
  try {
    return JSON.stringify(x);
  } catch (_e) {
    return "{\"_fail\":true}";
  }
}
function sha1Lite(str) {
  const s = safeStr(str);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
function normYear(y) {
  const n = Number(y);
  if (!Number.isFinite(n)) return null;
  const t = Math.trunc(n);
  if (t < 1900 || t > 2100) return null;
  return t;
}
function mergeSessionPatches() {
  const merged = {};
  for (let i = 0; i < arguments.length; i++) {
    const part = arguments[i];
    if (isPlainObject(part)) Object.assign(merged, part);
  }
  return merged;
}
function hasActionablePayload(payload) {
  if (!isPlainObject(payload)) return false;
  const keys = Object.keys(payload);
  if (!keys.length) return false;
  const actionable = new Set([
    "action", "route", "year", "id", "_id", "label", "lane", "vibe",
    "macMode", "mode", "allowDerivedTop10", "allowYearendFallback", "focus", "publicMode"
  ]);
  return keys.some((k) => actionable.has(k));
}
function buildInboundKey(norm) {
  const p = isPlainObject(norm?.payload) ? norm.payload : {};
  const keyObj = {
    t: safeStr(norm?.text || ""),
    a: safeStr(norm?.action || ""),
    y: normYear(norm?.year),
    l: safeStr(norm?.lane || ""),
    v: safeStr(norm?.vibe || ""),
    pa: safeStr(p.action || ""),
    py: normYear(p.year),
    pl: safeStr(p.lane || ""),
    pr: safeStr(p.route || ""),
    pv: safeStr(p.vibe || "")
  };
  return sha1Lite(safeJsonStringify(keyObj)).slice(0, 18);
}
function resolveRequestId(input, norm, inboundKey) {
  const src = isPlainObject(input) ? input : {};
  const candidates = [
    src.requestId,
    norm?.ctx?.requestId,
    norm?.body?.requestId,
    norm?.payload?.requestId
  ];
  for (const c of candidates) {
    const s = safeStr(c).trim();
    if (s) return s.slice(0, 80);
  }
  return `req_${safeStr(inboundKey || sha1Lite(nowMs())).slice(0, 18)}`;
}
function buildTurnId(input, norm, inboundKey, requestId) {
  const src = isPlainObject(input) ? input : {};
  const candidates = [
    src.turnId,
    src.messageId,
    src.id,
    norm?.ctx?.turnId,
    norm?.ctx?.messageId,
    norm?.body?.turnId,
    norm?.body?.messageId,
    norm?.payload?.turnId,
    norm?.payload?.messageId,
    requestId
  ];
  for (const c of candidates) {
    const s = safeStr(c).trim();
    if (s) return `turn_${sha1Lite(s).slice(0, 20)}`;
  }
  return `turn_${sha1Lite(`${safeStr(inboundKey)}|${safeStr(requestId)}`).slice(0, 20)}`;
}
function resolveSessionId(norm, session, inboundKey) {
  const nctx = isPlainObject(norm?.ctx) ? norm.ctx : {};
  const nb = isPlainObject(norm?.body) ? norm.body : {};
  const s = isPlainObject(session) ? session : {};
  const candidates = [
    nctx.sessionId, nctx.sid, nb.sessionId, nb.sid,
    s.sessionId, s.sid, s.id, s.sessionKey, s.key
  ];
  for (const v of candidates) {
    const t = safeStr(v).trim();
    if (t && t.length <= 180) return t;
  }
  return safeStr(inboundKey || `sess_${nowMs()}`).slice(0, 36);
}
function applyBudgetText(s, budget) {
  const txt = safeStr(s).trim();
  if (!txt) return "";
  if (budget === "short") return takeLines(txt, 6);
  return takeLines(txt, 14);
}
function softSpeak(text) {
  let t = safeStr(text || "");
  t = t.replace(/\bI'm\b/g, "I am")
    .replace(/\bcan't\b/gi, "cannot")
    .replace(/\bwon't\b/gi, "will not")
    .replace(/\bit's\b/gi, "it is")
    .replace(/\bthat's\b/gi, "that is")
    .replace(/\bthere's\b/gi, "there is")
    .replace(/\bwhat's\b/gi, "what is");
  t = t.replace(/!{2,}/g, "!")
    .replace(/\?{2,}/g, "?")
    .replace(/\.{4,}/g, "...");
  t = t.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
  t = t.replace(/\s*—\s*/g, ". ");
  t = t.replace(/\s*;\s*/g, ". ");
  return t.trim();
}
function scrubExecutionStyleArtifacts(reply) {
  const raw = safeStr(reply);
  if (!raw) return "";
  const killLine = (ln) => {
    const s = safeStr(ln).trim();
    if (!s) return false;
    if (/^one quick detail[, ]+then i['’]?ll execute cleanly\.?$/i.test(s)) return true;
    if (/^then i['’]?ll execute cleanly\.?$/i.test(s)) return true;
    if (/^i['’]?ll execute cleanly\.?$/i.test(s)) return true;
    if (/^alright\.?$/i.test(s)) return true;
    return false;
  };
  const kept = raw.split("\n").filter((ln) => !killLine(ln));
  let out = kept.join("\n");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out || safeStr(reply).trim() || "Okay.";
}

const LOOP_WINDOW_MS = 9000;
const LOOP_HARD_LIMIT = 2;
const INBOUND_WINDOW_MS = 12000;
const INBOUND_DUPLICATE_FAST_MS = 5000;
const INBOUND_HARD_LIMIT = 2;
const TURN_INFLIGHT_STALE_MS = 20000;
const TURN_TERMINAL_WINDOW_MS = 30000;
const TURN_LEDGER_LIMIT = 24;

function replyLoopSig(lane, replyText) {
  const l = safeStr(lane || "").trim().toLowerCase();
  const r = oneLine(replyText || "").slice(0, 260);
  return sha1Lite(`${l}|${r}`).slice(0, 18);
}
function detectAndPatchLoop(session, lane, replyText) {
  const s = isPlainObject(session) ? session : {};
  const sig = replyLoopSig(lane, replyText);
  const now = nowMs();
  const lastSig = safeStr(s.__loopSig || "");
  const lastAt = Number(s.__loopAt || 0) || 0;
  const lastN = clampInt(s.__loopN || 0, 0, 0, 99);
  const same = !!(sig && lastSig && sig === lastSig);
  const inWindow = !!(lastAt && now - lastAt <= LOOP_WINDOW_MS);
  let n = lastN;
  if (same && inWindow) n += 1;
  else n = 0;
  const tripped = same && inWindow && n >= LOOP_HARD_LIMIT;
  return {
    tripped,
    patch: { __loopSig: sig, __loopAt: now, __loopN: n },
    sig,
    n
  };
}
function inboundLoopSig(norm, session) {
  const n = norm && typeof norm === "object" ? norm : {};
  const s = isPlainObject(session) ? session : {};
  const text = oneLine((n.text || "")).slice(0, 360).toLowerCase();
  const action = safeStr(n.action || "").toLowerCase();
  const lane = safeStr(n.lane || n?.payload?.lane || s.lane || s.lastLane || "").toLowerCase();
  const route = safeStr(n?.payload?.route || n?.payload?.action || "").toLowerCase();
  const intent = safeStr(n?.turnIntent || n?.turnSignals?.turnIntent || "").toLowerCase();
  let pmini = "";
  try {
    const p = isPlainObject(n.payload) ? n.payload : {};
    const keep = {};
    ["lane", "route", "action", "year", "chip", "choice", "id", "tag"].forEach((k) => {
      if (k in p) keep[k] = p[k];
    });
    pmini = safeJsonStringify(keep).slice(0, 220);
  } catch (_e) {
    pmini = "";
  }
  return sha1Lite(`${lane}|${action}|${route}|${intent}|${text}|${pmini}`).slice(0, 18);
}
function detectInboundRepeat(session, inSig) {
  const s = isPlainObject(session) ? session : {};
  const now = nowMs();
  const lastSig = safeStr(s.__inSig || "");
  const lastAt = Number(s.__inAt || 0) || 0;
  const lastN = clampInt(s.__inN || 0, 0, 0, 99);
  const same = !!(inSig && lastSig && inSig === lastSig);
  const inWindow = !!(lastAt && now - lastAt <= INBOUND_WINDOW_MS);
  let n = lastN;
  if (same && inWindow) n += 1;
  else n = 0;
  const tripped = same && inWindow && n >= INBOUND_HARD_LIMIT;
  return {
    tripped,
    patch: { __inSig: inSig, __inAt: now, __inN: n },
    inSig,
    n,
    canFastReturn: same && lastAt && now - lastAt <= INBOUND_DUPLICATE_FAST_MS
  };
}
function getCachedReply(session, inSig) {
  const s = isPlainObject(session) ? session : {};
  const sig = safeStr(s.__cacheInSig || "");
  const at = Number(s.__cacheAt || 0) || 0;
  if (!sig || !inSig || sig !== inSig) return null;
  if (!at || nowMs() - at > INBOUND_WINDOW_MS) return null;
  const reply = safeStr(s.__cacheReply || "");
  if (!reply) return null;
  return {
    reply,
    lane: safeStr(s.__cacheLane || "general") || "general",
    followUps: Array.isArray(s.__cacheFollowUps) ? s.__cacheFollowUps : [],
    directives: Array.isArray(s.__cacheDirectives) ? s.__cacheDirectives : []
  };
}
function normalizeTurnLedger(session) {
  const s = isPlainObject(session) ? session : {};
  const raw = Array.isArray(s.__turnLedger) ? s.__turnLedger : [];
  return raw
    .filter((x) => isPlainObject(x))
    .map((x) => ({
      turnId: safeStr(x.turnId || "").slice(0, 64),
      requestId: safeStr(x.requestId || "").slice(0, 80),
      inboundSig: safeStr(x.inboundSig || "").slice(0, 24),
      inboundKey: safeStr(x.inboundKey || "").slice(0, 24),
      phase: safeStr(x.phase || "unknown").slice(0, 24),
      lane: safeStr(x.lane || "general").slice(0, 24),
      replySig: safeStr(x.replySig || "").slice(0, 24),
      at: Number(x.at || 0) || 0,
      status: safeStr(x.status || "unknown").slice(0, 24),
      completed: !!x.completed,
      failed: !!x.failed
    }))
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-TURN_LEDGER_LIMIT);
}
function upsertTurnLedger(ledger, entry) {
  const list = Array.isArray(ledger) ? ledger.slice() : [];
  const e = isPlainObject(entry) ? entry : {};
  const turnId = safeStr(e.turnId || "");
  if (!turnId) return list.slice(-TURN_LEDGER_LIMIT);
  const idx = list.findIndex((x) => safeStr(x.turnId || "") === turnId);
  if (idx >= 0) list[idx] = { ...list[idx], ...e, turnId };
  else list.push({ ...e, turnId });
  return list
    .filter((x) => isPlainObject(x))
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-TURN_LEDGER_LIMIT);
}
function findTurnEntry(ledger, turnId) {
  const list = Array.isArray(ledger) ? ledger : [];
  const id = safeStr(turnId || "");
  if (!id) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (safeStr(list[i]?.turnId || "") === id) return list[i];
  }
  return null;
}
function findReusableCompletedEntry(ledger, inSig) {
  const list = Array.isArray(ledger) ? ledger : [];
  const sig = safeStr(inSig || "");
  const now = nowMs();
  for (let i = list.length - 1; i >= 0; i--) {
    const x = list[i];
    if (!x || !x.completed) continue;
    if (safeStr(x.inboundSig || "") !== sig) continue;
    if (!x.at || now - x.at > TURN_TERMINAL_WINDOW_MS) continue;
    return x;
  }
  return null;
}
function buildTerminalContractSnapshot(contract) {
  const c = isPlainObject(contract) ? contract : {};
  return {
    ok: !!c.ok,
    reply: safeStr(c.reply || ""),
    payload: isPlainObject(c.payload) ? { ...c.payload } : { reply: safeStr(c.reply || "") },
    lane: safeStr(c.lane || "general") || "general",
    laneId: safeStr(c.laneId || c.lane || "general") || "general",
    sessionLane: safeStr(c.sessionLane || c.lane || "general") || "general",
    bridge: c.bridge || null,
    ctx: isPlainObject(c.ctx) ? { ...c.ctx } : {},
    ui: isPlainObject(c.ui) ? { ...c.ui } : { chips: [], allowMic: true },
    directives: Array.isArray(c.directives) ? c.directives.slice(0, 12) : [],
    followUps: Array.isArray(c.followUps) ? c.followUps.slice(0, 12) : [],
    followUpsStrings: Array.isArray(c.followUpsStrings) ? c.followUpsStrings.slice(0, 12) : [],
    cog: isPlainObject(c.cog) ? { ...c.cog } : {},
    requestId: safeStr(c.requestId || "").slice(0, 80),
    meta: isPlainObject(c.meta) ? { ...c.meta } : {}
  };
}
function getLastTerminalContractForInbound(session, inSig) {
  const s = isPlainObject(session) ? session : {};
  const sig = safeStr(inSig || "");
  const snap = isPlainObject(s.__lastTerminalContract) ? s.__lastTerminalContract : null;
  if (!snap) return null;
  if (safeStr(s.__lastTerminalInboundSig || "") !== sig) return null;
  const at = Number(s.__lastTerminalAt || 0) || 0;
  if (!at || nowMs() - at > TURN_TERMINAL_WINDOW_MS) return null;
  return buildTerminalContractSnapshot(snap);
}
function beginTurnLifecycle(session, args) {
  const s = isPlainObject(session) ? session : {};
  const turnId = safeStr(args?.turnId || "");
  const requestId = safeStr(args?.requestId || "");
  const inboundSig = safeStr(args?.inSig || "");
  const inboundKey = safeStr(args?.inboundKey || "");
  const laneHint = safeStr(args?.laneHint || "general") || "general";
  const ledger = normalizeTurnLedger(s);
  const now = nowMs();

  const existing = findTurnEntry(ledger, turnId);
  if (existing) {
    if (existing.completed && now - (existing.at || 0) <= TURN_TERMINAL_WINDOW_MS) {
      const snap = getLastTerminalContractForInbound(s, inboundSig);
      if (snap) {
        snap.meta = { ...(snap.meta || {}), replay: true, replaySource: "turn_completed", phase: 15, v: CE_VERSION, t: now };
        snap.sessionPatch = {
          __turnLedger: ledger,
          __turnLastSeenAt: now,
          __turnLastReplayId: turnId
        };
        return { blocked: true, reason: "completed_turn_replay", patch: snap.sessionPatch, replay: snap };
      }
    }
    if (existing.phase === "in_flight" && now - (existing.at || 0) <= TURN_INFLIGHT_STALE_MS) {
      const snap = getLastTerminalContractForInbound(s, inboundSig);
      if (snap) {
        snap.meta = { ...(snap.meta || {}), replay: true, replaySource: "inflight_terminal_cache", phase: 15, v: CE_VERSION, t: now };
        snap.sessionPatch = {
          __turnLedger: ledger,
          __turnLastSeenAt: now,
          __turnLastReplayId: turnId
        };
        return { blocked: true, reason: "turn_already_inflight", patch: snap.sessionPatch, replay: snap };
      }
      return {
        blocked: true,
        reason: "turn_already_inflight",
        patch: {
          __turnLedger: ledger,
          __turnLastSeenAt: now,
          __turnLastBlockedId: turnId
        },
        replay: null
      };
    }
  }

  const reusable = findReusableCompletedEntry(ledger, inboundSig);
  if (reusable) {
    const snap = getLastTerminalContractForInbound(s, inboundSig);
    if (snap) {
      snap.meta = { ...(snap.meta || {}), replay: true, replaySource: "inbound_sig_completed", phase: 15, v: CE_VERSION, t: now };
      snap.sessionPatch = {
        __turnLedger: ledger,
        __turnLastSeenAt: now,
        __turnLastReplayId: safeStr(reusable.turnId || turnId)
      };
      return { blocked: true, reason: "inbound_sig_completed", patch: snap.sessionPatch, replay: snap };
    }
  }

  const nextLedger = upsertTurnLedger(ledger, {
    turnId,
    requestId,
    inboundSig,
    inboundKey,
    phase: "in_flight",
    lane: laneHint,
    at: now,
    status: "active",
    completed: false,
    failed: false
  });

  return {
    blocked: false,
    reason: "",
    patch: {
      __turnLedger: nextLedger,
      __turnLastSeenAt: now,
      __turnActiveId: turnId,
      __turnActiveRequestId: requestId,
      __turnActiveInboundSig: inboundSig,
      __turnActiveInboundKey: inboundKey
    }
  };
}
function completeTurnLifecycle(session, args) {
  const s = isPlainObject(session) ? session : {};
  const turnId = safeStr(args?.turnId || "");
  const requestId = safeStr(args?.requestId || "");
  const inboundSig = safeStr(args?.inSig || "");
  const inboundKey = safeStr(args?.inboundKey || "");
  const lane = safeStr(args?.lane || "general") || "general";
  const reply = safeStr(args?.reply || "");
  const contract = isPlainObject(args?.contract) ? args.contract : null;
  const now = nowMs();

  const ledger = normalizeTurnLedger(s);
  const nextLedger = upsertTurnLedger(ledger, {
    turnId,
    requestId,
    inboundSig,
    inboundKey,
    phase: "complete",
    lane,
    replySig: replyLoopSig(lane, reply),
    at: now,
    status: "complete",
    completed: true,
    failed: false
  });

  return {
    __turnLedger: nextLedger,
    __turnActiveId: "",
    __turnActiveRequestId: "",
    __turnActiveInboundSig: "",
    __turnActiveInboundKey: "",
    __turnLastCompleteId: turnId,
    __turnLastCompleteAt: now,
    __lastTerminalInboundSig: inboundSig,
    __lastTerminalAt: now,
    __lastTerminalContract: contract ? buildTerminalContractSnapshot(contract) : null
  };
}
function failTurnLifecycle(session, args) {
  const s = isPlainObject(session) ? session : {};
  const turnId = safeStr(args?.turnId || "");
  const requestId = safeStr(args?.requestId || "");
  const inboundSig = safeStr(args?.inSig || "");
  const inboundKey = safeStr(args?.inboundKey || "");
  const lane = safeStr(args?.lane || "general") || "general";
  const reply = safeStr(args?.reply || "");
  const contract = isPlainObject(args?.contract) ? args.contract : null;
  const now = nowMs();

  const ledger = normalizeTurnLedger(s);
  const nextLedger = upsertTurnLedger(ledger, {
    turnId,
    requestId,
    inboundSig,
    inboundKey,
    phase: "failed_terminal",
    lane,
    replySig: replyLoopSig(lane, reply),
    at: now,
    status: "failed_terminal",
    completed: true,
    failed: true
  });

  return {
    __turnLedger: nextLedger,
    __turnActiveId: "",
    __turnActiveRequestId: "",
    __turnActiveInboundSig: "",
    __turnActiveInboundKey: "",
    __turnLastFailedId: turnId,
    __turnLastFailedAt: now,
    __lastTerminalInboundSig: inboundSig,
    __lastTerminalAt: now,
    __lastTerminalContract: contract ? buildTerminalContractSnapshot(contract) : null
  };
}
function computePublicMode(norm, session) {
  const p = norm && isPlainObject(norm.payload) ? norm.payload : {};
  const c = norm && isPlainObject(norm.ctx) ? norm.ctx : {};
  const b = norm && isPlainObject(norm.body) ? norm.body : {};
  const s = isPlainObject(session) ? session : {};
  const candidates = [p.publicMode, c.publicMode, b.publicMode, s.publicMode, p.public, c.public, b.public, s.public];
  for (const v of candidates) {
    if (v === undefined || v === null || v === "") continue;
    if (falsy(v)) return false;
    if (truthy(v)) return true;
  }
  return true;
}
function collectForbiddenNames(norm, session) {
  const out = new Set(["Mac"]);
  const s = isPlainObject(session) ? session : {};
  const c = isPlainObject(norm?.ctx) ? norm.ctx : {};
  const b = isPlainObject(norm?.body) ? norm.body : {};
  const p = isPlainObject(norm?.payload) ? norm.payload : {};
  const candidates = [
    s.ownerName, s.userName, s.displayName, s.name, s.macName,
    c.ownerName, c.userName, c.displayName, c.name,
    b.ownerName, b.userName, b.displayName, b.name,
    p.ownerName, p.userName, p.displayName, p.name
  ];
  for (const v of candidates) {
    const name = oneLine(safeStr(v)).trim();
    if (name && name.length >= 2 && name.length <= 36) out.add(name);
  }
  return Array.from(out).filter(Boolean);
}
function escapeRegExp(s) {
  return safeStr(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function sanitizePublicReply(text, forbiddenNames) {
  let out = safeStr(text || "");
  if (!out) return "";
  const names = Array.isArray(forbiddenNames) ? forbiddenNames : [];
  for (const nm of names) {
    const n = escapeRegExp(nm);
    out = out.replace(new RegExp(`(^|\\n)\\s*(Alright|Okay|Hey|Hi|Hello)\\s*,?\\s*${n}\\s*([.!?]|,)?\\s*`, "gi"), "$1$2. ");
    out = out.replace(new RegExp(`,\\s*${n}\\b\\s*([.!?])`, "gi"), "$1");
    out = out.replace(new RegExp(`(^|\\n)\\s*${n}\\s*([.!?])?\\s*(?=\\n|$)`, "gi"), "$1");
    out = out.replace(new RegExp(`\\b${n}\\b`, "gi"), "there");
  }
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\.\s*\./g, ".")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function applyPublicSanitization(reply, norm, session, publicMode) {
  if (!publicMode) return safeStr(reply || "").trim();
  return sanitizePublicReply(reply, collectForbiddenNames(norm, session));
}
function detectGreetingQuick(text) {
  const raw0 = safeStr(text || "");
  const t0 = raw0.trim();
  if (!t0) return null;
  const canon = t0.toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim();
  const how = /(how are you|how\'s it going|hows it going|how are you doing|how\'re you|whats up|what\'s up)(\s+today)?$/i;
  const greetHead = /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening))(\s+nyx)?(\s*[,:-])?\s*/i;
  if (/^(how are you|how are you doing|how\'s it going|hows it going|what\'s up|whats up)(\s+today)?$/i.test(canon)) {
    return { kind: "GREETING_HOW" };
  }
  if (greetHead.test(canon)) {
    const tail = canon.replace(greetHead, "").trim();
    if (!tail) return { kind: "GREETING_ONLY" };
    if (how.test(tail)) return { kind: "GREETING_HOW" };
    if (/^(there|nyx)$/i.test(tail)) return { kind: "GREETING_ONLY" };
  }
  return null;
}
function pickBySeed(arr, seed) {
  const a = Array.isArray(arr) ? arr : [];
  if (!a.length) return "";
  const h = sha1Lite(safeStr(seed || ""));
  const n = parseInt(h.slice(0, 8), 16);
  const idx = Number.isFinite(n) ? (n % a.length) : 0;
  return safeStr(a[idx] || "");
}
function buildGreetingReply(kind, seed) {
  const k = safeStr(kind || "").toUpperCase();
  const poolOnly = [
    "Hi — I am Nyx. How can I help you today?",
    "Hey — I am Nyx. What can I do for you?",
    "Hello — I am Nyx. How can I help?",
    "Hi there. I am Nyx — what would you like to talk about?"
  ];
  const poolHow = [
    "I am doing well, thank you. How can I help you today?",
    "Doing good — thanks for asking. What can I help you with?",
    "I am well. What is on your mind today?",
    "I am doing great — thank you. How can I help?"
  ];
  return pickBySeed(k === "GREETING_HOW" ? poolHow : poolOnly, seed);
}

function normalizeNuanceProfile(nuance) {
  const n = isPlainObject(nuance) ? nuance : {};
  return {
    archetype: safeStr(n.archetype || '').toLowerCase(),
    fallbackArchetype: safeStr(n.fallbackArchetype || '').toLowerCase(),
    conversationNeed: safeStr(n.conversationNeed || '').toLowerCase(),
    followupStyle: safeStr(n.followupStyle || '').toLowerCase(),
    transitionReadiness: safeStr(n.transitionReadiness || '').toLowerCase(),
    loopRisk: safeStr(n.loopRisk || '').toLowerCase(),
    questionPressure: safeStr(n.questionPressure || '').toLowerCase(),
    mirrorDepth: safeStr(n.mirrorDepth || '').toLowerCase(),
    antiLoopShift: safeStr(n.antiLoopShift || '').toLowerCase(),
    followupVariants: Array.isArray(n.followupVariants) ? n.followupVariants.slice(0, 10) : [],
    transitionTargets: Array.isArray(n.transitionTargets) ? n.transitionTargets.slice(0, 8) : []
  };
}
function normalizeConversationPlan(plan) {
  const p = isPlainObject(plan) ? plan : {};
  return {
    primaryArchetype: safeStr(p.primaryArchetype || '').toLowerCase(),
    fallbackArchetype: safeStr(p.fallbackArchetype || '').toLowerCase(),
    askAllowed: p.askAllowed === false ? false : true,
    questionStyle: safeStr(p.questionStyle || '').toLowerCase(),
    questionPressure: safeStr(p.questionPressure || '').toLowerCase(),
    mirrorDepth: safeStr(p.mirrorDepth || '').toLowerCase(),
    shouldSuppressMenus: !!p.shouldSuppressMenus,
    shouldPreferReflection: !!p.shouldPreferReflection,
    shouldDelaySolutioning: !!p.shouldDelaySolutioning,
    recommendedDepth: safeStr(p.recommendedDepth || '').toLowerCase(),
    antiLoopShift: safeStr(p.antiLoopShift || '').toLowerCase(),
    transitionTargets: Array.isArray(p.transitionTargets) ? p.transitionTargets.slice(0, 8) : [],
    conversationNeed: safeStr(p.conversationNeed || '').toLowerCase(),
    followupStyle: safeStr(p.followupStyle || '').toLowerCase(),
    allowsActionShift: !!p.allowsActionShift,
    expressionStyle: safeStr(p.expressionStyle || '').toLowerCase(),
    deliveryTone: safeStr(p.deliveryTone || '').toLowerCase(),
    semanticFrame: safeStr(p.semanticFrame || '').toLowerCase(),
    responseFamily: safeStr(p.responseFamily || '').toLowerCase(),
    followupVariants: Array.isArray(p.followupVariants) ? p.followupVariants.slice(0, 10) : []
  };
}
function deriveEmotionResponseFamily(emo) {
  const expressionStyle = safeStr(emo?.expressionStyle || '').toLowerCase();
  const semanticFrame = safeStr(emo?.semanticFrame || '').toLowerCase();
  const valence = safeStr(emo?.valence || '').toLowerCase();
  const dom = safeStr(emo?.dominantEmotion || emo?.primaryEmotion || '').toLowerCase();
  if (expressionStyle.includes('poetic') || semanticFrame.includes('awe')) return 'reflective_mirroring';
  if (expressionStyle.includes('recovery') || semanticFrame.includes('recovery')) return 'grounded_reinforcement';
  if (expressionStyle.includes('achievement') || semanticFrame.includes('achievement')) return 'earned_affirmation';
  if (expressionStyle.includes('celebratory')) return 'warm_celebration';
  if (['gratitude','relief','calmness','satisfaction','contentment','serenity'].includes(dom)) return 'grounded_reinforcement';
  if (['joy','excitement','triumph','pride','momentum','confidence','focus','resolve'].includes(dom)) return 'warm_affirmation';
  if (valence == 'positive') return 'warm_affirmation';
  if (valence == 'negative' || valence == 'mixed') return 'supportive_presence';
  return 'default';
}
function buildEmotionPresentation(emo, session) {
  const s = isPlainObject(session) ? session : {};
  const enriched = isPlainObject(emo) ? { ...emo } : {};
  enriched.nuanceProfile = normalizeNuanceProfile(enriched.nuanceProfile || enriched.downstream?.supportResponse?.nuanceProfile || {});
  enriched.conversationPlan = normalizeConversationPlan(enriched.conversationPlan || enriched.downstream?.supportResponse?.conversationPlan || {});
  enriched.expressionStyle = safeStr(enriched.expressionStyle || enriched.downstream?.supportResponse?.expressionStyle || enriched.conversationPlan.expressionStyle || 'plain_statement').toLowerCase();
  enriched.deliveryTone = safeStr(enriched.deliveryTone || enriched.downstream?.supportResponse?.deliveryTone || enriched.conversationPlan.deliveryTone || 'warm_affirming').toLowerCase();
  enriched.semanticFrame = safeStr(enriched.semanticFrame || enriched.downstream?.supportResponse?.semanticFrame || enriched.conversationPlan.semanticFrame || enriched.expressionStyle || 'plain_statement').toLowerCase();
  enriched.presentationSignals = isPlainObject(enriched.presentationSignals) ? enriched.presentationSignals : (isPlainObject(enriched.downstream?.supportResponse?.presentationSignals) ? enriched.downstream.supportResponse.presentationSignals : {});
  enriched.priorResponseFamily = safeStr(s.__lastResponseFamily || s.__responseFamily || '').toLowerCase();
  enriched.lastOpeningFamily = safeStr(s.__lastOpeningFamily || '').toLowerCase();
  enriched.lastQuestionStyle = safeStr(s.__lastQuestionStyle || '').toLowerCase();
  enriched.sameResponseFamilyCount = clampInt(s.__sameResponseFamilyCount || 0, 0, 0, 99);
  enriched.responseFamily = safeStr(enriched.responseFamily || enriched.conversationPlan.responseFamily || deriveEmotionResponseFamily(enriched)).toLowerCase();
  return enriched;
}

function normalizeEmotionGuardResult(raw) {
  const r = isPlainObject(raw) ? raw : {};
  const state = isPlainObject(r.state) ? r.state : {};
  const supportFlags = isPlainObject(r.supportFlags) ? r.supportFlags : {};
  const reinforcements = isPlainObject(r.reinforcements) ? r.reinforcements : {};
  const continuity = isPlainObject(r.continuity) ? r.continuity : {};
  const downstream = isPlainObject(r.downstream) ? r.downstream : {};
  const routeHints = Array.isArray(r.routeHints) ? r.routeHints.slice(0, 12) : [];
  const responseHints = Array.isArray(r.responseHints) ? r.responseHints.slice(0, 20) : [];

  const primaryEmotion = safeStr(
    r.primaryEmotion ||
    state.dominantEmotion ||
    state.primaryEmotion ||
    downstream?.supportResponse?.primaryEmotion ||
    "neutral"
  );

  const secondaryEmotion = safeStr(
    r.secondaryEmotion ||
    state.secondaryEmotion ||
    downstream?.supportResponse?.secondaryEmotion ||
    ""
  );

  const emotionCluster = safeStr(
    r.emotionCluster ||
    downstream?.stateSpine?.emotionCluster ||
    ""
  );

  const valence = safeStr(
    r.valence ||
    state.valence ||
    "neutral"
  ).toLowerCase();

  const rawIntensity = r.intensity;
  const intensity = clampInt(
    typeof rawIntensity === "number"
      ? Math.round(rawIntensity <= 1 ? rawIntensity * 100 : rawIntensity)
      : state.intensity === "very_high" ? 95 :
        state.intensity === "high" ? 78 :
        state.intensity === "moderate" ? 55 :
        state.intensity === "low" ? 28 : 0,
    0, 0, 100
  );

  const confidence = Math.max(0, Math.min(100, Math.round(Number(
    r.confidence ??
    downstream?.supportResponse?.confidence ??
    0
  ) * 100)));

  const mode =
    supportFlags.crisis ? "DISTRESS" :
    (supportFlags.highDistress || valence === "negative" || valence === "critical_negative" || intensity >= 70) ? "VULNERABLE" :
    valence === "positive" ? "POSITIVE" :
    "NORMAL";

  const tags = [];
  for (const part of [primaryEmotion, secondaryEmotion, valence, emotionCluster]) {
    if (safeStr(part)) tags.push(safeStr(part));
  }
  for (const h of routeHints) tags.push(safeStr(h));

  return {
    ok: !!r.ok,
    source: safeStr(r.source || "emotionRouteGuard"),
    mode,
    valence,
    intensityLabel: safeStr(r.intensityLabel || state.intensity || ""),
    intensity,
    confidence,
    dominantEmotion: primaryEmotion,
    primaryEmotion,
    secondaryEmotion,
    dominantSource: safeStr(state.dominantSource || "emotion_route_guard"),
    emotionCluster,
    tone: safeStr(
      downstream?.affectEngine?.tone ||
      r.tone ||
      state.tone ||
      "steady_neutral"
    ),
    routeBias: safeStr(
      r.routeBias ||
      downstream?.chatEngine?.routeBias ||
      ""
    ),
    supportModeCandidate: safeStr(
      r.supportModeCandidate ||
      downstream?.supportResponse?.supportModeCandidate ||
      ""
    ),
    bypassClarify: !!(supportFlags.crisis || supportFlags.highDistress || r.fallbackSuppression || continuity.fallbackSuppression),
    fallbackSuppression: !!(r.fallbackSuppression || continuity.fallbackSuppression || routeHints.includes("fallback_suppression")),
    needsNovelMove: !!(r.needsNovelMove || continuity.needsNovelMove),
    routeExhaustion: !!(r.routeExhaustion || continuity.routeExhaustion),
    emotionalVolatility: safeStr(r.emotionalVolatility || downstream?.stateSpine?.volatility || "stable"),
    supportFlags: {
      crisis: !!supportFlags.crisis,
      highDistress: !!(supportFlags.highDistress || (valence === "negative" && intensity >= 70)),
      needsGentlePacing: !!(supportFlags.needsGentlePacing || intensity >= 65),
      avoidCelebratoryTone: !!supportFlags.avoidCelebratoryTone,
      recoveryPresent: !!supportFlags.recoveryPresent,
      positivePresent: !!supportFlags.positivePresent,
      needsStabilization: !!supportFlags.needsStabilization,
      needsClarification: !!supportFlags.needsClarification,
      needsContainment: !!supportFlags.needsContainment,
      needsConnection: !!supportFlags.needsConnection,
      needsForwardMotion: !!supportFlags.needsForwardMotion,
      mentionsLooping: !!supportFlags.mentionsLooping
    },
    routeHints,
    responseHints,
    distressReinforcements: Array.isArray(reinforcements.distress) ? reinforcements.distress.slice(0, 12) : [],
    positiveReinforcements: Array.isArray(reinforcements.positive) ? reinforcements.positive.slice(0, 12) : [],
    recoverySignals: Array.isArray(r.recoverySignals) ? r.recoverySignals.slice(0, 12) : [],
    contradictions: isPlainObject(r.contradictions)
      ? {
          count: clampInt(r.contradictions.count || 0, 0, 0, 99),
          contradictions: Array.isArray(r.contradictions.contradictions) ? r.contradictions.contradictions.slice(0, 8) : Array.isArray(r.contradictions) ? r.contradictions.slice(0, 8) : []
        }
      : { count: 0, contradictions: [] },
    continuity: {
      sameEmotionCount: clampInt(continuity.sameEmotionCount || 0, 0, 0, 99),
      sameSupportModeCount: clampInt(continuity.sameSupportModeCount || 0, 0, 0, 99),
      noProgressTurnCount: clampInt(continuity.noProgressTurnCount || 0, 0, 0, 99),
      repeatedFallbackCount: clampInt(continuity.repeatedFallbackCount || 0, 0, 0, 99),
      stateShift: safeStr(continuity.stateShift || "stable_or_unknown"),
      fallbackSuppression: !!continuity.fallbackSuppression,
      needsNovelMove: !!continuity.needsNovelMove,
      routeExhaustion: !!continuity.routeExhaustion
    },
    nuanceProfile: normalizeNuanceProfile(r.nuanceProfile || downstream?.supportResponse?.nuanceProfile || {}),
    conversationPlan: normalizeConversationPlan(r.conversationPlan || downstream?.supportResponse?.conversationPlan || {}),
    presentationSignals: isPlainObject(r.presentationSignals) ? r.presentationSignals : (isPlainObject(downstream?.supportResponse?.presentationSignals) ? downstream.supportResponse.presentationSignals : {}),
    expressionStyle: safeStr(r.expressionStyle || downstream?.supportResponse?.expressionStyle || '').toLowerCase(),
    deliveryTone: safeStr(r.deliveryTone || downstream?.supportResponse?.deliveryTone || '').toLowerCase(),
    semanticFrame: safeStr(r.semanticFrame || downstream?.supportResponse?.semanticFrame || '').toLowerCase(),
    responseFamily: safeStr(r.responseFamily || downstream?.supportResponse?.responseFamily || '').toLowerCase(),
    summary: isPlainObject(r.summary) ? r.summary : { concise: "", narrative: "" },
    tags: [...new Set(tags.filter(Boolean))].slice(0, 20),
    cached: !!r.cached
  };
}
function runEmotionGuard(text, priorState) {
  const t = safeStr(text || "").trim();
  if (!t) return null;
  try {
    if (!EmotionRouteGuard) return null;

    if (typeof EmotionRouteGuard.analyzeEmotionRoute === "function") {
      return normalizeEmotionGuardResult(
        EmotionRouteGuard.analyzeEmotionRoute(
          { text: t },
          isPlainObject(priorState) ? priorState : {}
        )
      );
    }

    if (typeof EmotionRouteGuard.analyzeEmotion === "function") {
      return normalizeEmotionGuardResult(
        EmotionRouteGuard.analyzeEmotion(t, {
          enableCache: true,
          enableMomentum: true,
          enableContradictions: true,
          enableRiskSignals: true,
          enablePositiveReinforcement: true,
          enableRecoverySignals: true
        })
      );
    }

    if (EmotionRouteGuard.emotionRootGod && typeof EmotionRouteGuard.emotionRootGod.analyze === "function") {
      return normalizeEmotionGuardResult(
        EmotionRouteGuard.emotionRootGod.analyze(t, {
          enableCache: true,
          enableMomentum: true,
          enableContradictions: true,
          enableRiskSignals: true,
          enablePositiveReinforcement: true,
          enableRecoverySignals: true
        })
      );
    }
  } catch (_e) {
    return null;
  }
  return null;
}
function applyEmotionSignalsToNorm(norm, emo) {
  if (!emo || !isPlainObject(norm.turnSignals)) return;
  norm.turnSignals.emotionMode = safeStr(emo.mode || "NORMAL");
  norm.turnSignals.emotionTags = Array.isArray(emo.tags) ? emo.tags.slice(0, 12) : [];
  norm.turnSignals.emotionIntensity = clampInt(emo.intensity || 0, 0, 0, 100);
  norm.turnSignals.emotionBypassClarify = !!emo.bypassClarify;
  norm.turnSignals.emotionNeedSoft = !!(emo.supportFlags?.needsGentlePacing || emo.supportFlags?.needsStabilization);
  norm.turnSignals.emotionNeedCrisis = !!emo.supportFlags?.crisis;
  norm.turnSignals.emotionValence = safeStr(emo.valence || "neutral");
  norm.turnSignals.emotionDominant = safeStr(emo.primaryEmotion || emo.dominantEmotion || "neutral");
  norm.turnSignals.emotionPrimary = safeStr(emo.primaryEmotion || emo.dominantEmotion || "neutral");
  norm.turnSignals.emotionSecondary = safeStr(emo.secondaryEmotion || "");
  norm.turnSignals.emotionCluster = safeStr(emo.emotionCluster || "");
  norm.turnSignals.emotionTone = safeStr(emo.tone || "steady_neutral");
  norm.turnSignals.emotionRouteBias = safeStr(emo.routeBias || "");
  norm.turnSignals.emotionSupportMode = safeStr(emo.supportModeCandidate || "");
  norm.turnSignals.emotionConfidence = clampInt(emo.confidence || 0, 0, 0, 100);
  norm.turnSignals.emotionCached = !!emo.cached;
  norm.turnSignals.emotionRecoveryPresent = !!emo.supportFlags?.recoveryPresent;
  norm.turnSignals.emotionPositivePresent = !!emo.supportFlags?.positivePresent;
  norm.turnSignals.emotionContradictions = clampInt(emo.contradictions?.count || 0, 0, 0, 99);
  norm.turnSignals.emotionFallbackSuppression = !!emo.fallbackSuppression;
  norm.turnSignals.emotionNeedsNovelMove = !!emo.needsNovelMove;
  norm.turnSignals.emotionRouteExhaustion = !!emo.routeExhaustion;
  norm.turnSignals.emotionSameEmotionCount = clampInt(emo.continuity?.sameEmotionCount || 0, 0, 0, 99);
  norm.turnSignals.emotionSameSupportModeCount = clampInt(emo.continuity?.sameSupportModeCount || 0, 0, 0, 99);
  norm.turnSignals.emotionNoProgressTurnCount = clampInt(emo.continuity?.noProgressTurnCount || 0, 0, 0, 99);
  norm.turnSignals.expressionStyle = safeStr(emo.expressionStyle || "");
  norm.turnSignals.deliveryTone = safeStr(emo.deliveryTone || "");
  norm.turnSignals.semanticFrame = safeStr(emo.semanticFrame || "");
  norm.turnSignals.responseFamily = safeStr(emo.responseFamily || "");
  norm.turnSignals.followupStyle = safeStr(emo.conversationPlan?.followupStyle || emo.nuanceProfile?.followupStyle || "");
  norm.turnSignals.questionStyle = safeStr(emo.conversationPlan?.questionStyle || "");
  norm.turnSignals.askAllowed = emo.conversationPlan?.askAllowed === false ? false : true;
}
function isTechnicalExecutionInbound(norm) {
  const text = safeStr(norm?.text || "", 400).toLowerCase();
  const action = safeStr(norm?.action || norm?.payload?.action || norm?.payload?.route || "", 80).toLowerCase();
  if (!text && !action) return false;
  return /(chat engine|state spine|support response|loop|looping|debug|debugging|patch|update|rebuild|restructure|integrate|implementation|code|script|file|tts|api|route|backend|fix)/.test(text) ||
    /(diagnosis|restructure|patch|implement|debug|fix|repair|analysis)/.test(action);
}

function shouldAllowEmotionFirst(norm, emo, spineState, plannerDecision) {
  if (!emo) return false;
  if (emo.supportFlags?.crisis) return true;
  const technical = isTechnicalExecutionInbound(norm);
  const phase = typeof Spine?.inferConversationPhase === "function"
    ? Spine.inferConversationPhase(spineState, {
        text: norm?.text,
        payload: norm?.payload,
        action: norm?.action,
        lane: norm?.lane,
        turnSignals: norm?.turnSignals
      }, plannerDecision || null)
    : "active";
  if (technical && phase !== "recovery") return false;
  if (phase === "execution" && !emo.supportFlags?.highDistress && !emo.bypassClarify) return false;
  if (phase === "active" && technical) return false;
  return !!(emo.bypassClarify || emo.mode === "VULNERABLE" || emo.valence === "negative" || emo.supportFlags?.needsGentlePacing || emo.valence === "mixed");
}

function shouldSuppressGreeting(norm, spineState) {
  const technical = isTechnicalExecutionInbound(norm);
  const turns = Number(spineState?.turns?.user || 0);
  return technical || turns > 0;
}

function dedupeFollowUpsForExecution(followUps, norm, emo) {
  const list = Array.isArray(followUps) ? followUps : [];
  if (emo?.supportFlags?.crisis) return list.slice(0, 2);
  if (isTechnicalExecutionInbound(norm)) return [];
  return list;
}

function buildSupportPacketSafe(norm, emo) {
  if (!emo || !Support) return null;
  try {
    const presentation = {
      priorResponseFamily: safeStr(emo?.priorResponseFamily || norm?.ctx?.lastResponseFamily || norm?.ctx?.priorResponseFamily || "").toLowerCase(),
      lastResponseFamily: safeStr(emo?.priorResponseFamily || norm?.ctx?.lastResponseFamily || norm?.ctx?.priorResponseFamily || "").toLowerCase(),
      expressionStyle: safeStr(emo?.expressionStyle || "").toLowerCase(),
      deliveryTone: safeStr(emo?.deliveryTone || "").toLowerCase(),
      semanticFrame: safeStr(emo?.semanticFrame || "").toLowerCase()
    };
    if (typeof Support.buildSupportPacket === "function") {
      return Support.buildSupportPacket({
        userText: safeStr(norm?.text || ""),
        emo,
        seed: safeStr(norm?.ctx?.sessionId || norm?.ctx?.sid || ""),
        ...presentation
      }, { suppressQuestionOnTechnical: isTechnicalExecutionInbound(norm), suppressQuestionOnRecovery: true });
    }
    if (typeof Support.buildSupportiveResponse === "function") {
      return {
        ok: true,
        mode: emo.supportFlags?.crisis ? "crisis" : "supportive",
        reply: Support.buildSupportiveResponse({
          userText: safeStr(norm?.text || ""),
          emo,
          seed: safeStr(norm?.ctx?.sessionId || norm?.ctx?.sid || ""),
          ...presentation
        }, { suppressQuestionOnTechnical: isTechnicalExecutionInbound(norm), suppressQuestionOnRecovery: true }),
        meta: {
          crisis: !!emo.supportFlags?.crisis,
          dominantEmotion: safeStr(emo.dominantEmotion || "neutral"),
          valence: safeStr(emo.valence || "neutral"),
          tone: safeStr(emo.tone || "steady_neutral"),
          expressionStyle: presentation.expressionStyle,
          deliveryTone: presentation.deliveryTone,
          semanticFrame: presentation.semanticFrame,
          priorResponseFamily: presentation.priorResponseFamily,
          responseFamily: safeStr(emo.responseFamily || "").toLowerCase()
        }
      };
    }
  } catch (_e) {
    return null;
  }
  return null;
}
function buildEmotionDirectives(emo, packet) {
  const out = [];
  if (!emo) return out;

  if (emo.supportFlags?.crisis) {
    out.push({ type: "safety", level: "critical", route: "human_support" });
  } else if (emo.supportFlags?.highDistress) {
    out.push({ type: "pacing", level: "soft", reason: "high_distress" });
  } else if (emo.valence === "positive") {
    out.push({ type: "reinforcement", level: "positive", dominantEmotion: safeStr(emo.dominantEmotion || "positive") });
  } else if (emo.mode === "VULNERABLE" || emo.valence === "negative") {
    out.push({ type: "pacing", level: "soft", reason: "vulnerable_support" });
  }

  if (emo.supportFlags?.needsGentlePacing) out.push({ type: "tone", level: "gentle", reason: "needs_gentle_pacing" });
  if (emo.supportFlags?.recoveryPresent) out.push({ type: "recovery", level: "detected" });
  if ((emo.contradictions?.count || 0) > 0) out.push({ type: "mixed_state", count: clampInt(emo.contradictions.count, 0, 0, 99) });
  if (packet && isPlainObject(packet.meta) && packet.meta.crisis) out.push({ type: "support_packet", mode: safeStr(packet.mode || "supportive") });

  return out.slice(0, 8);
}
function buildSupportiveEmotionFollowUps(emo) {
  const dom = safeStr(emo?.dominantEmotion || "").trim().toLowerCase();
  const frame = safeStr(emo?.semanticFrame || "").toLowerCase();
  const style = safeStr(emo?.expressionStyle || "").toLowerCase();
  const positive = safeStr(emo?.valence || "").toLowerCase() === "positive";

  if (emo?.supportFlags?.crisis || emo?.supportFlags?.highDistress) {
    return [
      { id: "fu_ground", type: "action", label: "Stay with me", payload: { action: "support_ground", mode: "supportive" } },
      { id: "fu_breathe", type: "action", label: "One breath", payload: { action: "support_breathe", mode: "supportive" } }
    ];
  }

  if (positive) {
    if (style === 'achievement_statement' || frame.includes('achievement')) {
      return [
        { id: "fu_build_win", type: "action", label: "Build on it", payload: { action: "positive_build", mode: "positive", frame: "achievement" } },
        { id: "fu_name_win", type: "action", label: "Name the win", payload: { action: "positive_name", mode: "positive", frame: "achievement" } }
      ];
    }
    if (style === 'poetic_observation' || frame.includes('awe') || frame.includes('environment')) {
      return [
        { id: "fu_stay_with_it", type: "action", label: "Stay with it", payload: { action: "positive_reflect", mode: "positive", frame: "aesthetic" } },
        { id: "fu_put_words", type: "action", label: "Put words to it", payload: { action: "positive_name", mode: "positive", frame: "aesthetic" } }
      ];
    }
    if (style === 'recovery_statement' || frame.includes('recovery') || dom === 'relief') {
      return [
        { id: "fu_anchor_it", type: "action", label: "Anchor it", payload: { action: "positive_anchor", mode: "positive", frame: "recovery" } },
        { id: "fu_next_step", type: "action", label: "Use this energy", payload: { action: "positive_channel", mode: "positive", frame: "recovery" } }
      ];
    }
    return [
      { id: "fu_keep_it_going", type: "action", label: "Keep it going", payload: { action: "positive_extend", mode: "positive" } },
      { id: "fu_turn_into_step", type: "action", label: "Turn it into a step", payload: { action: "positive_channel", mode: "positive" } }
    ];
  }

  if (dom === "loneliness" || dom === "lonely" || dom === "isolation") {
    return [
      { id: "fu_talk_lonely", type: "action", label: "Talk about it", payload: { action: "support_talk", mode: "supportive", emotion: "loneliness" } },
      { id: "fu_stay_lonely", type: "action", label: "Stay with me", payload: { action: "support_stay", mode: "supportive", emotion: "loneliness" } }
    ];
  }

  return [
    { id: "fu_talk_support", type: "action", label: "Talk to me", payload: { action: "support_talk", mode: "supportive" } },
    { id: "fu_slow_support", type: "action", label: "Slow it down", payload: { action: "support_slow", mode: "supportive" } }
  ];
}
function buildSupportiveEmotionUi(emo) {
  return {
    chips: buildSupportiveEmotionFollowUps(emo),
    allowMic: true,
    mode: "supportive"
  };
}
function isGenericMenuBounceReply(summary) {
  const s = safeStr(summary || "").toLowerCase();
  if (!s) return false;
  return /exact target|pick a lane|go to music|go to movies|drop you into a menu|tell me where you want to go|what do you want next/.test(s);
}

function finalizeSpineSafe(params) {
  try {
    if (typeof Spine?.finalizeTurn === "function") {
      return Spine.finalizeTurn(params);
    }
  } catch (_e) {}
  const prev = isPlainObject(params?.prevState) ? params.prevState : { rev: 0 };
  return {
    ...prev,
    rev: (Number.isFinite(prev.rev) ? prev.rev : 0) + 1,
    lane: safeStr(params?.lane || prev.lane || "general") || "general"
  };
}

function maybeBuildEmotionFirstReply(norm, emo) {
  if (!emo) return null;
  const text = safeStr(norm?.text || "").trim();
  if (!text) return null;

  const packet = buildSupportPacketSafe(norm, emo);

  if (emo.bypassClarify && packet && safeStr(packet.reply)) {
    return {
      reply: safeStr(packet.reply),
      mode: safeStr(packet.mode || "supportive"),
      directives: buildEmotionDirectives(emo, packet),
      meta: isPlainObject(packet.meta) ? packet.meta : {}
    };
  }

  const vulnerableSupport =
    emo.mode === "VULNERABLE" ||
    emo.valence === "negative" ||
    emo.valence === "mixed" ||
    !!emo.supportFlags?.needsGentlePacing;

  if (vulnerableSupport) {
    let reply = "";
    const dom = safeStr(emo.dominantEmotion || "").trim().toLowerCase();

    if (packet && safeStr(packet.reply)) {
      reply = safeStr(packet.reply);
    } else if (dom === "loneliness" || dom === "lonely" || dom === "isolation") {
      reply = "I am here with you. You do not have to sit in that feeling alone. What is making today feel heavy?";
    } else if (dom === "sadness" || dom === "grief" || dom === "hurt") {
      reply = "I am here, and I am listening. What is weighing on you most right now?";
    } else {
      reply = "I am here with you. Talk to me. What feels hardest right now?";
    }

    return {
      reply,
      mode: "supportive",
      directives: buildEmotionDirectives(emo, packet),
      meta: isPlainObject(packet?.meta) ? packet.meta : {}
    };
  }

  if (emo.valence === "positive" && (packet && safeStr(packet.reply) || Array.isArray(emo.positiveReinforcements) && emo.positiveReinforcements.length)) {
    let reply = safeStr(packet?.reply || "");
    const dom = safeStr(emo.dominantEmotion || "positive").toLowerCase();
    if (!reply) {
      if (["confidence","pride","momentum","triumph","resolve","focus"].includes(dom)) {
        reply = "That has strong forward motion in it. What do you want to build on next?";
      } else if (["gratitude","connection","calmness","satisfaction","contentment","serenity","relief"].includes(dom)) {
        reply = "That sounds steady in a good way. Do you want to stay with it for a second or turn it into a next step?";
      } else if (["awe","aestheticappreciation"].includes(dom) || safeStr(emo.expressionStyle).includes('poetic')) {
        reply = "There is something beautiful in the way you are holding that. Do you want to stay with it a little longer or say what makes it stand out?";
      } else {
        reply = "That is a strong signal in a good direction. What do you want to do with that energy next?";
      }
    }
    return {
      reply,
      mode: "positive",
      directives: buildEmotionDirectives(emo, packet),
      meta: isPlainObject(packet?.meta) ? packet.meta : {}
    };
  }

  if (emo.valence === "mixed" && packet && safeStr(packet.reply) && (emo.contradictions?.count || 0) > 0) {
    return {
      reply: safeStr(packet.reply),
      mode: "mixed",
      directives: buildEmotionDirectives(emo, packet),
      meta: isPlainObject(packet?.meta) ? packet.meta : {}
    };
  }

  return null;
}
function makeBreakerReply(norm, emo) {
  const packet = buildSupportPacketSafe(norm, emo);
  if (packet && packet.reply && (packet.mode === "supportive" || packet.mode === "crisis")) {
    return safeStr(packet.reply);
  }
  return "I am seeing repetition, so I am slowing this down and keeping it steady. Give me one fresh sentence and I will stay with it without reopening menus.";
}
function makeInFlightReply(norm, emo) {
  const packet = buildSupportPacketSafe(norm, emo);
  if (packet && packet.reply && safeStr(packet.reply)) return safeStr(packet.reply);
  return "I am already processing that exact turn. Hold steady for a moment, then send one fresh sentence only if you still need to.";
}
function normalizeInbound(input) {
  const src = isPlainObject(input) ? input : {};
  const body = isPlainObject(src.body) ? src.body : {};
  const payload = isPlainObject(src.payload) ? src.payload : {};
  const ctx = isPlainObject(src.ctx) ? src.ctx : {};
  const session = isPlainObject(src.session) ? src.session : {};

  let text =
    safeStr(src.text || "") ||
    safeStr(body.text || "") ||
    safeStr(payload.text || "") ||
    safeStr(body.message || "") ||
    safeStr(payload.message || "");

  if (text.length > 6500) text = text.slice(0, 6500);

  const lane =
    safeStr(src.lane || "") ||
    safeStr(payload.lane || "") ||
    safeStr(body.lane || "") ||
    safeStr(session.lane || "") ||
    "general";

  const action =
    safeStr(src.action || "") ||
    safeStr(payload.action || "") ||
    safeStr(body.action || "");

  const year =
    normYear(src.year) ||
    normYear(payload.year) ||
    normYear(body.year);

  return {
    text,
    lane,
    action,
    year,
    vibe: safeStr(src.vibe || payload.vibe || body.vibe || ""),
    body,
    payload,
    ctx,
    turnSignals: {
      textEmpty: !safeStr(text).trim(),
      hasPayload: !!Object.keys(payload).length,
      payloadActionable: hasActionablePayload(payload)
    }
  };
}
function computeLaneState(session, corePrev, lane, norm) {
  const s = isPlainObject(session) ? session : {};
  const prev = safeStr(s.lane || "").trim() || safeStr(corePrev?.lane || "").trim() || "general";
  const cur = safeStr(lane || "").trim() || "general";
  const payloadLane = safeStr(norm?.payload?.lane || "").trim();
  const bodyLane = safeStr(norm?.body?.lane || "").trim();
  const ctxLane = safeStr(norm?.ctx?.lane || "").trim();
  const route = safeStr(norm?.payload?.route || norm?.payload?.action || "").trim();
  const changed = !!(prev && cur && prev !== cur);
  let reason = "carry";
  if (changed) reason = "lane_change";
  if (payloadLane && payloadLane === cur) reason = "payload_lane";
  else if (bodyLane && bodyLane === cur) reason = "body_lane";
  else if (ctxLane && ctxLane === cur) reason = "ctx_lane";
  else if (route) reason = "route_or_action";
  else if (safeStr(norm?.action || "").trim()) reason = "typed_action";
  return { current: cur, previous: prev, changed, reason };
}
function computeBridge(sessionLaneState, requestId) {
  const st = isPlainObject(sessionLaneState) ? sessionLaneState : null;
  if (!st || !st.changed) return null;
  return {
    v: "bridge.v1",
    requestId: safeStr(requestId || ""),
    fromLane: safeStr(st.previous || ""),
    toLane: safeStr(st.current || ""),
    reason: safeStr(st.reason || "lane_change"),
    at: nowMs()
  };
}
function failSafeContract(err, input, extra) {
  const src = isPlainObject(input) ? input : {};
  const requestId = safeStr(src.requestId || "").slice(0, 80) || `req_${nowMs()}`;
  const msg = "I am keeping this steady while the backend recovers. No menu bounce, no lane shift.";
  return {
    ok: false,
    reply: msg,
    payload: { reply: msg },
    lane: "general",
    laneId: "general",
    sessionLane: "general",
    bridge: null,
    ctx: {},
    ui: { chips: [], allowMic: true },
    directives: [],
    followUps: [],
    followUpsStrings: [],
    sessionPatch: isPlainObject(extra?.sessionPatch) ? extra.sessionPatch : {},
    cog: {
      intent: "STABILIZE",
      mode: "transitional",
      publicMode: true,
      diag: {
        failSafe: true,
        err: safeStr(err && err.message ? err.message : err).slice(0, 180),
        source: "chatEngine",
        version: CE_VERSION
      }
    },
    requestId,
    meta: { v: CE_VERSION, failSafe: true, degradedSupport: true, suppressMenus: true, supportCompatible: true, t: nowMs(), phase: 15 }
  };
}

async function handleChat(input) {
  const started = nowMs();
  const rawInput = isPlainObject(input) ? input : {};
  const session = isPlainObject(rawInput.session) ? rawInput.session : {};

  let inboundKey = "";
  let requestId = "";
  let turnId = "";
  let sessionId = "";
  let inSig = "";
  let publicMode = true;
  let norm = null;
  let lifecycle = { blocked: false, reason: "", patch: {} };

  try {
    norm = normalizeInbound(rawInput);
    norm._t0 = started;

    inboundKey = buildInboundKey(norm);
    requestId = resolveRequestId(rawInput, norm, inboundKey);
    turnId = buildTurnId(rawInput, norm, inboundKey, requestId);
    publicMode = computePublicMode(norm, session);
    sessionId = resolveSessionId(norm, session, inboundKey);
    logChatDiag('turn_start', buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, publicMode }));

    inSig = inboundLoopSig(norm, session);
    lifecycle = beginTurnLifecycle(session, {
      turnId,
      requestId,
      inSig,
      inboundKey,
      publicMode,
      laneHint: safeStr(norm.lane || "general") || "general"
    });

    if (lifecycle.blocked && lifecycle.replay) {
      logChatDiag('lifecycle_replay', buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, elapsedMs: nowMs() - started }));
      return {
        ...lifecycle.replay,
        requestId,
        sessionPatch: mergeSessionPatches(lifecycle.replay.sessionPatch, lifecycle.patch, {
          __turnLifecycleReason: lifecycle.reason
        })
      };
    }

    if (lifecycle.blocked) {
      logChatDiag('lifecycle_blocked', buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, elapsedMs: nowMs() - started }));
      const emoBlocked = runEmotionGuard(norm.text || "", session.__spineState || {});
      const blockedReply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(makeInFlightReply(norm, emoBlocked))),
        norm,
        session,
        publicMode
      );
      return {
        ok: true,
        reply: blockedReply,
        payload: { reply: blockedReply },
        lane: safeStr(norm.lane || "general") || "general",
        laneId: safeStr(norm.lane || "general") || "general",
        sessionLane: safeStr(norm.lane || "general") || "general",
        bridge: null,
        ctx: {},
        ui: buildUiForLane(safeStr(norm.lane || "general") || "general"),
        directives: [],
        followUps: [],
        followUpsStrings: [],
        sessionPatch: mergeSessionPatches(lifecycle.patch, {
          __turnLifecycleReason: lifecycle.reason
        }),
        cog: { publicMode, mode: "transitional", intent: "STABILIZE" },
        requestId,
        meta: { v: CE_VERSION, blocked: true, reason: lifecycle.reason, t: nowMs(), phase: 15 }
      };
    }

    const corePrev = typeof Spine?.coerceState === "function"
      ? Spine.coerceState(
          session.__spineState ||
          session.spineState ||
          session.state ||
          (typeof Spine?.createState === "function"
            ? Spine.createState({ lane: safeStr(norm.lane || session.lane || "general") || "general" })
            : { rev: 0, lane: safeStr(norm.lane || session.lane || "general") || "general", stage: "open" })
        )
      : (isPlainObject(session.__spineState)
          ? session.__spineState
          : { rev: 0, lane: safeStr(norm.lane || session.lane || "general") || "general", stage: "open" });

    const inboundRepeat = detectInboundRepeat(session, inSig);
    logChatDiag('inbound_repeat_eval', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, elapsedMs: nowMs() - started }), inboundRepeatN: inboundRepeat.n, inboundRepeatTripped: !!inboundRepeat.tripped, inboundFastReturn: !!inboundRepeat.canFastReturn });

    const emo = buildEmotionPresentation(runEmotionGuard(norm.text || "", { ...(isPlainObject(corePrev) ? corePrev : {}), lastResponseFamily: safeStr(session.__lastResponseFamily || session.__responseFamily || "") }), session);
    logChatDiag('emotion_eval', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, elapsedMs: nowMs() - started }), emotionMode: safeStr(emo?.mode || 'NONE'), emotionValence: safeStr(emo?.valence || 'neutral'), emotionDominant: safeStr(emo?.dominantEmotion || ''), emotionBypassClarify: !!emo?.bypassClarify, emotionHighDistress: !!emo?.supportFlags?.highDistress, emotionCrisis: !!emo?.supportFlags?.crisis });
    applyEmotionSignalsToNorm(norm, emo);

    const bypassFastReplay = !!(
      emo && (
        emo.bypassClarify ||
        emo.mode === "VULNERABLE" ||
        emo.valence === "negative" ||
        !!emo.supportFlags?.needsGentlePacing
      )
    );

    if (inboundRepeat.canFastReturn && !bypassFastReplay) {
      const cached = getCachedReply(session, inSig);
      if (cached) {
        logChatDiag('cached_fast_return', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, elapsedMs: nowMs() - started }), replayLane: safeStr(cached.lane || 'general'), replayReplyHash: hashText(cached.reply || ''), replayFollowUps: Array.isArray(cached.followUps) ? cached.followUps.length : 0 });
        const replayContract = {
          ok: true,
          reply: cached.reply,
          payload: { reply: cached.reply },
          lane: cached.lane,
          laneId: cached.lane,
          sessionLane: cached.lane,
          bridge: null,
          ctx: {},
          ui: buildUiForLane(cached.lane),
          directives: cached.directives || [],
          followUps: cached.followUps || [],
          followUpsStrings: (cached.followUps || []).map((x) => x.label),
          sessionPatch: {},
          cog: { publicMode, mode: "transitional", intent: "REPLAY" },
          requestId,
          meta: { v: CE_VERSION, replay: true, t: nowMs(), phase: 8 }
        };

        replayContract.sessionPatch = mergeSessionPatches(
          lifecycle.patch,
          inboundRepeat.patch,
          completeTurnLifecycle(session, {
            turnId,
            requestId,
            inSig,
            inboundKey,
            lane: cached.lane,
            reply: cached.reply,
            contract: replayContract
          }),
          {
            __lastInboundKey: inboundKey,
            __cacheAt: nowMs(),
            __turnLifecycleReason: "cached_fast_return"
          }
        );
        return replayContract;
      }
    }

    const plannerDecision = typeof Spine?.decideNextMove === "function"
      ? Spine.decideNextMove(corePrev, {
          text: norm.text,
          payload: norm.payload,
          ctx: norm.ctx,
          lane: norm.lane,
          year: norm.year,
          action: norm.action,
          turnSignals: norm.turnSignals,
          cog: {
            intent: emo?.bypassClarify ? "STABILIZE" : "ADVANCE",
            mode: isTechnicalExecutionInbound(norm) ? "execution" : "transitional",
            publicMode
          }
        })
      : { move: "ADVANCE", stage: "deliver", rationale: "planner_missing" };

    const emotionFirst = shouldAllowEmotionFirst(norm, emo, corePrev, plannerDecision)
      ? maybeBuildEmotionFirstReply(norm, emo)
      : null;
    if (emotionFirst && safeStr(emotionFirst.reply)) {
      let lane = safeStr(norm.lane || "general") || "general";
      logChatDiag('emotion_first_return', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, lane, elapsedMs: nowMs() - started }), emotionMode: safeStr(emotionFirst.mode || ''), replyHash: hashText(emotionFirst.reply || '') });

      const emotionLoopPatch = detectAndPatchLoop(session, lane, safeStr(emotionFirst.reply));
      if (emotionLoopPatch.tripped) {
        logChatDiag('emotion_first_loop_tripped', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, lane, elapsedMs: nowMs() - started }), loopCount: emotionLoopPatch.n, replyHash: hashText(emotionFirst.reply || '') });
        emotionFirst = {
          ...emotionFirst,
          reply: makeBreakerReply(norm, emo),
          mode: "supportive",
          directives: Array.isArray(emotionFirst.directives) ? emotionFirst.directives : []
        };
        lane = "general";
      }

      const safeReply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(emotionFirst.reply)),
        norm,
        session,
        publicMode
      );
      const isSupportiveEmotion = safeStr(emotionFirst.mode || "").toLowerCase() === "supportive";
      const followUpsRaw = isSupportiveEmotion ? buildSupportiveEmotionFollowUps(emo) : buildFollowUpsForLane(lane);
      const directives = Array.isArray(emotionFirst.directives) ? emotionFirst.directives : [];
      const artifacts = laneArtifactsForTurn(norm, emo, lane, followUpsRaw, isSupportiveEmotion ? buildSupportiveEmotionUi(emo) : buildUiForLane(lane), { reply: safeReply, lane, mode: emotionFirst.mode });
      const followUps = artifacts.followUps;
      const ui = artifacts.ui;
      const nextSpine = finalizeSpineSafe({
        prevState: corePrev,
        inbound: {
          text: norm.text,
          payload: norm.payload,
          ctx: norm.ctx,
          lane: norm.lane,
          year: norm.year,
          action: norm.action,
          turnSignals: norm.turnSignals,
          latencyMs: Math.max(0, nowMs() - started),
          cog: {
            intent: emo?.bypassClarify ? "STABILIZE" : safeStr(plannerDecision?.move || "ADVANCE", 20).toUpperCase(),
            mode: isTechnicalExecutionInbound(norm) ? "execution" : "transitional",
            publicMode
          }
        },
        lane,
        topicOverride: "",
        actionTaken: safeStr(norm.action || ""),
        followUps,
        pendingAsk: null,
        decision: {
          move: safeStr(plannerDecision?.move || (emo?.bypassClarify ? "ADVANCE" : "ADVANCE"), 20).toUpperCase(),
          rationale: safeStr(plannerDecision?.rationale || (emo?.bypassClarify ? "emotion_bypass" : "emotion_first_turn"), 80),
          speak: safeReply,
          stage: safeStr(plannerDecision?.stage || "deliver", 20).toLowerCase(),
          _plannerMode: safeStr(plannerDecision?._plannerMode || "emotion_first", 48)
        },
        marionCog: {
          route: "emotion_route_guard",
          intent: emo?.bypassClarify ? "STABILIZE" : safeStr(plannerDecision?.move || "ADVANCE", 20).toUpperCase(),
          mode: isTechnicalExecutionInbound(norm) ? "execution" : "transitional",
          publicMode
        },
        assistantSummary: safeReply,
        updateReason: "emotion_first"
      });

      const emotionContract = {
        ok: true,
        reply: safeReply,
        payload: { reply: safeReply },
        lane,
        laneId: lane,
        sessionLane: lane,
        bridge: null,
        ctx: {},
        ui,
        directives,
        followUps,
        followUpsStrings: artifacts.followUpsStrings,
        sessionPatch: {},
        cog: {
          route: "emotion_route_guard",
          publicMode,
          mode: "transitional",
          intent: emo?.bypassClarify ? "STABILIZE" : "ENGAGE",
          emotion: emo ? {
            mode: emo.mode,
            valence: emo.valence,
            dominantEmotion: emo.dominantEmotion,
            tone: emo.tone,
            bypassClarify: !!emo.bypassClarify,
            recoveryPresent: !!emo.supportFlags?.recoveryPresent,
            contradictions: clampInt(emo.contradictions?.count || 0, 0, 0, 99),
            expressionStyle: safeStr(emo.expressionStyle || ""),
            deliveryTone: safeStr(emo.deliveryTone || ""),
            semanticFrame: safeStr(emo.semanticFrame || ""),
            responseFamily: safeStr(emotionFirst.meta?.responseFamily || emo.responseFamily || "")
          } : null
        },
        requestId,
        meta: {
          v: CE_VERSION,
          earlyReturn: "emotion_first",
          emotionCached: !!emo?.cached,
          telemetry: buildTelemetry({ norm, lane, emo, requestId, publicMode, phase: "emotion_first" }),
          t: nowMs(),
          phase: 7
        }
      };

      emotionContract.sessionPatch = mergeSessionPatches(
        lifecycle.patch,
        inboundRepeat.patch,
        emotionLoopPatch.patch,
        {
          lane,
          publicMode,
          __lastInboundKey: inboundKey,
          __memoryWindow: buildMemoryContext(sessionId || resolveSessionId(norm, session, inboundKey)) || {},
          __spineState: nextSpine,
          __conversationPhase: safeStr(nextSpine?.phase || "active"),
          __emotionMode: safeStr(emo?.mode || "NORMAL"),
          __emotionValence: safeStr(emo?.valence || "neutral"),
          __emotionDominant: safeStr(emo?.dominantEmotion || "neutral"),
          __emotionPrimary: safeStr(emo?.primaryEmotion || emo?.dominantEmotion || "neutral"),
          __emotionSecondary: safeStr(emo?.secondaryEmotion || ""),
          __emotionCluster: safeStr(emo?.emotionCluster || ""),
          __emotionRouteBias: safeStr(emo?.routeBias || ""),
          __emotionSupportMode: safeStr(emo?.supportModeCandidate || ""),
          __emotionFallbackSuppression: !!emo?.fallbackSuppression,
          __emotionNeedsNovelMove: !!emo?.needsNovelMove,
          __emotionRouteExhaustion: !!emo?.routeExhaustion,
          __emotionExpressionStyle: safeStr(emo?.expressionStyle || ""),
          __emotionDeliveryTone: safeStr(emo?.deliveryTone || ""),
          __emotionSemanticFrame: safeStr(emo?.semanticFrame || ""),
          __responseFamily: safeStr(emotionFirst.meta?.responseFamily || emo?.responseFamily || ""),
          __lastResponseFamily: safeStr(emotionFirst.meta?.responseFamily || emo?.responseFamily || ""),
          __lastOpeningFamily: safeStr(emotionFirst.meta?.openingFamily || ""),
          __lastQuestionStyle: safeStr(emotionFirst.meta?.questionStyle || emo?.conversationPlan?.questionStyle || ""),
          __sameResponseFamilyCount: safeStr(session.__lastResponseFamily || "").toLowerCase() === safeStr(emotionFirst.meta?.responseFamily || emo?.responseFamily || "").toLowerCase() ? clampInt(session.__sameResponseFamilyCount || 0, 0, 0, 99) + 1 : 0,
          __emotionAt: nowMs(),
        __lastIntent: safeStr(bridgeRouting?.intent || plannerDecision?.move || ""),
        __lastDomain: safeStr(bridgeRouting?.domain || ""),
        __knowledgeSections: marionBridgeOut?.sections || {},
        __marionBridgeUsed: !!bridgeShouldAnswer,
        __marionBridgeDomain: safeStr(bridgeRouting?.domain || ""),
        __marionBridgeEvidenceCount: clampInt(bridgePacket?.evidence?.rankedCount || bridgePacket?.evidence?.count || 0, 0, 0, 99),
          __cacheInSig: inSig,
          __cacheReply: safeReply,
          __cacheLane: lane,
          __cacheFollowUps: followUps,
          __cacheDirectives: directives,
          __cacheAt: nowMs()
        },
        completeTurnLifecycle(session, {
          turnId,
          requestId,
          inSig,
          inboundKey,
          lane,
          reply: safeReply,
          contract: emotionContract
        })
      );

      return emotionContract;
    }

    if (inboundRepeat.tripped) {
      logChatDiag('breaker_triggered', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, elapsedMs: nowMs() - started }), reason: 'inbound_repeat_tripped' });
      const breaker = makeBreakerReply(norm, emo);
      const safeReply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(breaker)),
        norm,
        session,
        publicMode
      );

      const breakerContract = {
        ok: true,
        reply: safeReply,
        payload: { reply: safeReply },
        lane: "general",
        laneId: "general",
        sessionLane: "general",
        bridge: null,
        ctx: {},
        ui: quietUi("supportive"),
        directives: [],
        followUps: [],
        followUpsStrings: [],
        sessionPatch: {},
        cog: {
          publicMode,
          mode: "transitional",
          intent: "STABILIZE",
          emotion: emo ? {
            mode: emo.mode,
            valence: emo.valence,
            dominantEmotion: emo.dominantEmotion
          } : null
        },
        requestId,
        meta: { v: CE_VERSION, breaker: true, t: nowMs(), phase: 8 }
      };

      breakerContract.sessionPatch = mergeSessionPatches(
        lifecycle.patch,
        inboundRepeat.patch,
        {
          __lastInboundKey: inboundKey,
          __cacheInSig: inSig,
          __cacheReply: safeReply,
          __cacheLane: "general",
          __cacheFollowUps: [],
          __cacheDirectives: [],
          __cacheAt: nowMs()
        },
        completeTurnLifecycle(session, {
          turnId,
          requestId,
          inSig,
          inboundKey,
          lane: "general",
          reply: safeReply,
          contract: breakerContract
        })
      );

      return breakerContract;
    }

    const greeting = detectGreetingQuick(norm.text || "");
    if (greeting && !shouldSuppressGreeting(norm, corePrev)) {
      logChatDiag('greeting_return', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, elapsedMs: nowMs() - started }), greetingKind: safeStr(greeting.kind || '') });
      const reply = applyPublicSanitization(
        scrubExecutionStyleArtifacts(softSpeak(buildGreetingReply(greeting.kind, inboundKey))),
        norm,
        session,
        publicMode
      );
      const lane = safeStr(norm.lane || "general") || "general";
      const artifacts = laneArtifactsForTurn(norm, emo, lane, buildFollowUpsForLane(lane), buildUiForLane(lane), { reply, lane, mode: "greeting" });
      const followUps = artifacts.followUps;

      const greetingContract = {
        ok: true,
        reply,
        payload: { reply },
        lane,
        laneId: lane,
        sessionLane: lane,
        bridge: null,
        ctx: {},
        ui: artifacts.ui,
        directives: [],
        followUps,
        followUpsStrings: artifacts.followUpsStrings,
        sessionPatch: {},
        cog: { publicMode, mode: "transitional", intent: "GREETING" },
        requestId,
        meta: { v: CE_VERSION, greeting: true, t: nowMs(), phase: 7 }
      };

      greetingContract.sessionPatch = mergeSessionPatches(
        lifecycle.patch,
        inboundRepeat.patch,
        {
          lane,
          publicMode,
          __greeted: true,
          __lastInboundKey: inboundKey,
          __cacheInSig: inSig,
          __cacheReply: applyPublicSanitization(scrubExecutionStyleArtifacts(softSpeak(reply)), norm, session, publicMode),
          __cacheLane: lane,
          __cacheFollowUps: followUps,
          __cacheDirectives: [],
          __cacheAt: nowMs()
        },
        completeTurnLifecycle(session, {
          turnId,
          requestId,
          inSig,
          inboundKey,
          lane,
          reply,
          contract: greetingContract
        })
      );

      return greetingContract;
    }

    const marionBridgeOut = await maybeResolveMarionBridge(rawInput, norm, session, emo, requestId, turnId, publicMode);
    const bridgePacket = isPlainObject(marionBridgeOut?.packet) ? marionBridgeOut.packet : null;
    const bridgeSynthesis = isPlainObject(bridgePacket?.synthesis) ? bridgePacket.synthesis : null;
    const bridgeRouting = isPlainObject(bridgePacket?.routing) ? bridgePacket.routing : null;
    const bridgeShouldAnswer = !!(marionBridgeOut?.usedBridge && safeStr(bridgeSynthesis?.answer || ""));

    const routeOut = bridgeShouldAnswer
      ? {
          reply: safeStr(bridgeSynthesis.answer),
          lane: safeStr((bridgeRouting && bridgeRouting.domain) || norm.lane || session.lane || (emo ? "general" : "general")) || "general",
          directives: [],
          followUps: [],
          ui: quietUi(bridgeRouting?.domain === "psychology" ? "supportive" : "direct"),
          meta: {
            bridgeResolved: true,
            bridgeDomain: safeStr(bridgeRouting?.domain || "general"),
            bridgeEvidenceCount: clampInt(bridgePacket?.evidence?.rankedCount || bridgePacket?.evidence?.count || 0, 0, 0, 99)
          }
        }
      : routeLane
      ? routeLane(norm, session, emo)
      : {
          reply: isPlainObject(emo) && safeStr(emo.valence).toLowerCase() === "positive"
            ? "I hear the positive signal in that, and I can stay with it without flattening this into a menu."
            : "I am here with you. We can keep this simple and steady without dropping you into a menu.",
          lane: "general",
          directives: [],
          followUps: [],
          ui: quietUi(emo ? "supportive" : "direct"),
          meta: { failOpen: true, routeLaneMissing: true, supportCompatible: true, suppressMenus: true }
        };

    let reply = safeStr(routeOut?.reply || "").trim();
    let lane = safeStr(routeOut?.lane || norm.lane || session.lane || "general") || "general";
    if (emo && isGenericMenuBounceReply(reply)) {
      const recoveryPacket = buildSupportPacketSafe(norm, emo);
      if (recoveryPacket && safeStr(recoveryPacket.reply)) {
        reply = safeStr(recoveryPacket.reply);
        if (isPlainObject(routeOut.meta)) {
          routeOut.meta.responseFamily = safeStr(recoveryPacket.meta?.responseFamily || emo.responseFamily || '').toLowerCase();
          routeOut.meta.openingFamily = safeStr(recoveryPacket.meta?.openingFamily || '').toLowerCase();
          routeOut.meta.questionStyle = safeStr(recoveryPacket.meta?.questionStyle || emo.conversationPlan?.questionStyle || '').toLowerCase();
        }
      }
    }
    logChatDiag('route_selected', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, lane, elapsedMs: nowMs() - started }), routeReplyHash: hashText(reply || ''), routeMeta: isPlainObject(routeOut?.meta) ? routeOut.meta : {} });

    if (!reply) reply = isPlainObject(emo) && safeStr(emo.valence).toLowerCase() === "positive" ? "That sounds like a real positive shift. I can stay with it or help you build on it." : "I am here with you. We can keep this simple and steady.";

    const loopPatch = detectAndPatchLoop(session, lane, reply);
    if (loopPatch.tripped) {
      logChatDiag('reply_loop_tripped', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, lane, elapsedMs: nowMs() - started }), loopCount: loopPatch.n, replyHash: hashText(reply || '') });
      reply = makeBreakerReply(norm, emo);
      lane = "general";
    }

    const safeReply = applyPublicSanitization(
      scrubExecutionStyleArtifacts(softSpeak(applyBudgetText(reply, "medium"))),
      norm,
      session,
      publicMode
    );

    const sessionLaneState = computeLaneState(session, corePrev, lane, norm);
    const bridge = bridgeShouldAnswer
      ? {
          v: safeStr(bridgePacket?.version || "bridge.v2"),
          requestId: safeStr(requestId || ""),
          domain: safeStr(bridgeRouting?.domain || "general"),
          candidates: Array.isArray(bridgeRouting?.candidates) ? bridgeRouting.candidates : [],
          evidenceCount: clampInt(bridgePacket?.evidence?.rankedCount || bridgePacket?.evidence?.count || 0, 0, 0, 99),
          confidence: Number(bridgePacket?.synthesis?.confidence || 0) || 0,
          knowledgeDomains: Object.keys(marionBridgeOut?.sections || {}).filter((k) => Array.isArray(marionBridgeOut.sections[k]) && marionBridgeOut.sections[k].length),
          supportLockBias: !!shouldSuppressLaneArtifacts(norm, emo, routeOut),
          at: nowMs()
        }
      : computeBridge(sessionLaneState, requestId);
    const followUpsRaw = Array.isArray(routeOut?.followUps) ? routeOut.followUps : buildFollowUpsForLane(lane);
    const directives = Array.isArray(routeOut?.directives) ? routeOut.directives : [];
    const artifacts = laneArtifactsForTurn(norm, emo, lane, followUpsRaw, isPlainObject(routeOut?.ui) ? routeOut.ui : buildUiForLane(lane), routeOut);
    const followUps = artifacts.followUps;
    const ui = artifacts.ui;

    let nextSpine = null;
    try {
      nextSpine = Spine.finalizeTurn({
        prevState: corePrev,
        inbound: {
          text: norm.text,
          payload: norm.payload,
          ctx: norm.ctx,
          lane: norm.lane,
          year: norm.year,
          action: norm.action,
          turnSignals: norm.turnSignals,
          latencyMs: Math.max(0, nowMs() - started),
          cog: {
            intent: emo?.bypassClarify ? "STABILIZE" : "CLARIFY",
            mode: "transitional",
            publicMode
          }
        },
        lane,
        topicOverride: "",
        actionTaken: safeStr(norm.action || ""),
        followUps,
        pendingAsk: null,
        decision: {
          move: safeStr(plannerDecision?.move || (emo?.bypassClarify ? "ADVANCE" : "ADVANCE"), 20).toUpperCase(),
          rationale: safeStr(plannerDecision?.rationale || (emo?.bypassClarify ? "emotion_bypass" : "normal_turn"), 80),
          speak: safeReply,
          stage: safeStr(plannerDecision?.stage || "deliver", 20).toLowerCase(),
          _plannerMode: safeStr(plannerDecision?._plannerMode || (isTechnicalExecutionInbound(norm) ? "execution" : "advance"), 48)
        },
        marionCog: {
          route: bridgeShouldAnswer ? "marion_bridge" : (emo ? "emotion_route_guard" : "general"),
          intent: emo?.bypassClarify ? "STABILIZE" : safeStr(plannerDecision?.move || "ADVANCE", 20).toUpperCase(),
          mode: isTechnicalExecutionInbound(norm) ? "execution" : "transitional",
          publicMode
        },
        assistantSummary: safeReply,
        updateReason: "turn"
      });
    } catch (_e) {
      nextSpine = { ...corePrev, rev: (Number.isFinite(corePrev.rev) ? corePrev.rev : 0) + 1, lane };
    }

    storeMemoryTurn(resolveSessionId(norm, session, inboundKey), {
      at: nowMs(),
      lane,
      user: safeStr(norm.text || "").slice(0, 400),
      assistant: safeReply.slice(0, 400),
      emotion: emo ? {
        mode: emo.mode,
        valence: emo.valence,
        dominantEmotion: emo.dominantEmotion,
        tone: emo.tone,
        recoveryPresent: !!emo.supportFlags?.recoveryPresent,
        positivePresent: !!emo.supportFlags?.positivePresent,
        contradictions: clampInt(emo.contradictions?.count || 0, 0, 0, 99)
      } : null,
      requestId
    });

    const finalContract = {
      ok: true,
      reply: safeReply,
      payload: { reply: safeReply },
      lane,
      laneId: lane,
      sessionLane: lane,
      bridge,
      ctx: {},
      ui,
      directives,
      followUps,
      followUpsStrings: artifacts.followUpsStrings,
      sessionPatch: {},
      cog: {
        marionVersion: safeStr(bridgePacket?.version || MarionBridgeMod?.BRIDGE_VERSION || MarionSO?.MARION_VERSION || MarionSO?.SO_VERSION || MarionSO?.version || ""),
        route: bridgeShouldAnswer ? "marion_bridge" : (emo ? "emotion_route_guard" : "general"),
        intent: emo?.bypassClarify ? "STABILIZE" : safeStr(plannerDecision?.move || "ADVANCE", 20).toUpperCase(),
        mode: isTechnicalExecutionInbound(norm) ? "execution" : "transitional",
        publicMode,
        emotion: emo ? {
          mode: emo.mode,
          valence: emo.valence,
          dominantEmotion: emo.dominantEmotion,
          tone: emo.tone,
          bypassClarify: !!emo.bypassClarify,
          recoveryPresent: !!emo.supportFlags?.recoveryPresent,
          positivePresent: !!emo.supportFlags?.positivePresent,
          contradictions: clampInt(emo.contradictions?.count || 0, 0, 0, 99),
          expressionStyle: safeStr(emo.expressionStyle || ""),
          deliveryTone: safeStr(emo.deliveryTone || ""),
          semanticFrame: safeStr(emo.semanticFrame || ""),
          responseFamily: safeStr(routeOut?.meta?.responseFamily || bridgePacket?.synthesis?.responseFamily || emo.responseFamily || "")
        } : null
      },
      requestId,
      meta: {
        v: CE_VERSION,
        t: nowMs(),
        phase: 14,
        marionBridgeUsed: !!bridgeShouldAnswer,
        marionBridgeDomain: safeStr(bridgeRouting?.domain || ""),
        emotionCached: !!emo?.cached,
        telemetry: buildTelemetry({ norm, lane, emo, requestId, publicMode, phase: "final" }),
        sessionId: shortId(sessionId),
        turnId: shortId(turnId)
      }
    };

    logChatDiag('turn_complete', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, lane, elapsedMs: nowMs() - started }), bridgeActive: !!bridge, followUpCount: Array.isArray(followUps) ? followUps.length : 0, directiveCount: Array.isArray(directives) ? directives.length : 0, replyHash: hashText(safeReply || '') });

    finalContract.sessionPatch = mergeSessionPatches(
      lifecycle.patch,
      inboundRepeat.patch,
      loopPatch.patch,
      {
        lane,
        publicMode,
        __lastInboundKey: inboundKey,
        __memoryWindow: buildMemoryContext(sessionId || resolveSessionId(norm, session, inboundKey)) || {},
        __spineState: nextSpine,
        __conversationPhase: safeStr(nextSpine?.phase || "active"),
        __cacheInSig: inSig,
        __cacheReply: safeReply,
        __cacheLane: lane,
        __cacheFollowUps: followUps,
        __cacheDirectives: directives,
        __cacheAt: nowMs(),
        __emotionMode: safeStr(emo?.mode || "NORMAL"),
        __emotionValence: safeStr(emo?.valence || "neutral"),
        __emotionDominant: safeStr(emo?.dominantEmotion || "neutral"),
        __emotionPrimary: safeStr(emo?.primaryEmotion || emo?.dominantEmotion || "neutral"),
        __emotionSecondary: safeStr(emo?.secondaryEmotion || ""),
        __emotionCluster: safeStr(emo?.emotionCluster || ""),
        __emotionRouteBias: safeStr(emo?.routeBias || ""),
        __emotionSupportMode: safeStr(emo?.supportModeCandidate || ""),
        __emotionFallbackSuppression: !!emo?.fallbackSuppression,
        __emotionNeedsNovelMove: !!emo?.needsNovelMove,
        __emotionRouteExhaustion: !!emo?.routeExhaustion,
        __emotionExpressionStyle: safeStr(emo?.expressionStyle || ""),
        __emotionDeliveryTone: safeStr(emo?.deliveryTone || ""),
        __emotionSemanticFrame: safeStr(emo?.semanticFrame || ""),
        __responseFamily: safeStr(routeOut?.meta?.responseFamily || bridgePacket?.synthesis?.responseFamily || emo?.responseFamily || ""),
        __lastResponseFamily: safeStr(routeOut?.meta?.responseFamily || bridgePacket?.synthesis?.responseFamily || emo?.responseFamily || ""),
        __lastOpeningFamily: safeStr(routeOut?.meta?.openingFamily || bridgePacket?.synthesis?.openingFamily || ""),
        __lastQuestionStyle: safeStr(routeOut?.meta?.questionStyle || emo?.conversationPlan?.questionStyle || ""),
        __sameResponseFamilyCount: safeStr(session.__lastResponseFamily || "").toLowerCase() === safeStr(routeOut?.meta?.responseFamily || bridgePacket?.synthesis?.responseFamily || emo?.responseFamily || "").toLowerCase() ? clampInt(session.__sameResponseFamilyCount || 0, 0, 0, 99) + 1 : 0,
        __emotionAt: nowMs(),
        __lastIntent: safeStr(bridgeRouting?.intent || plannerDecision?.move || ""),
        __lastDomain: safeStr(bridgeRouting?.domain || ""),
        __knowledgeSections: marionBridgeOut?.sections || {},
        __marionBridgeUsed: !!bridgeShouldAnswer,
        __marionBridgeDomain: safeStr(bridgeRouting?.domain || ""),
        __marionBridgeEvidenceCount: clampInt(bridgePacket?.evidence?.rankedCount || bridgePacket?.evidence?.count || 0, 0, 0, 99)
      },
      completeTurnLifecycle(session, {
        turnId,
        requestId,
        inSig,
        inboundKey,
        lane,
        reply: safeReply,
        contract: finalContract
      })
    );

    return finalContract;
  } catch (err) {
    logChatDiag('turn_fail', { ...buildTurnDiagSnapshot(norm, session, { requestId, turnId, sessionId, inboundKey, inSig, publicMode, elapsedMs: nowMs() - started }), error: safeStr(err && err.message ? err.message : err).slice(0, 180) });
    const failContract = failSafeContract(err, rawInput, {
      sessionPatch: mergeSessionPatches(
        lifecycle.patch,
        failTurnLifecycle(session, {
          turnId,
          requestId,
          inSig,
          inboundKey,
          lane: safeStr(norm?.lane || "general") || "general",
          reply: "Backend is stabilizing. Try again in a moment — or tap Reset."
        })
      )
    });

    failContract.meta = {
      ...(isPlainObject(failContract.meta) ? failContract.meta : {}),
      caughtError: safeStr(err && err.message ? err.message : err).slice(0, 180),
      requestId,
      phase: 15,
      v: CE_VERSION,
      t: nowMs()
    };

    failContract.sessionPatch = mergeSessionPatches(
      lifecycle.patch,
      failTurnLifecycle(session, {
        turnId,
        requestId,
        inSig,
        inboundKey,
        lane: safeStr(norm?.lane || "general") || "general",
        reply: failContract.reply,
        contract: failContract
      })
    );
    return failContract;
  }
}

module.exports = handleChat;
module.exports.CE_VERSION = CE_VERSION;
module.exports.handleChat = handleChat;
module.exports.chatEngine = handleChat;
module.exports.default = handleChat;
module.exports.computePublicMode = computePublicMode;
module.exports.sanitizePublicReply = sanitizePublicReply;
module.exports.STATE_SPINE_VERSION = Spine.SPINE_VERSION;
module.exports.STATE_SPINE = Spine;
