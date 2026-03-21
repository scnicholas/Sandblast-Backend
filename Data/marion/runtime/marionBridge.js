\
"use strict";

/**
 * runtime/marionBridge.js
 *
 * Marion-first bridge:
 * - normalizes intent/domain/emotion
 * - gathers evidence from memory/datasets/external retrievers
 * - builds one authoritative answer packet for Nyx
 */

let EmotionRetriever = null;
let PsychologyRetriever = null;
let DomainRetriever = null;
let DatasetRetriever = null;
let routeMarion = null;
let domainRouter = null;

try { EmotionRetriever = require("./emotionRetriever"); } catch (_e) { EmotionRetriever = null; }
try { PsychologyRetriever = require("./psychologyRetriever"); } catch (_e) { PsychologyRetriever = null; }
try { DomainRetriever = require("./domainRetriever"); } catch (_e) { DomainRetriever = null; }
try { DatasetRetriever = require("./datasetRetriever"); } catch (_e) { DatasetRetriever = null; }
try { ({ routeMarion } = require("./marionRouter")); } catch (_e) { routeMarion = null; }
try { domainRouter = require("./domainRouter"); } catch (_e) { domainRouter = null; }

const { buildResponseContract } = require("./conversationalResponseSystem");

const VERSION = "marionBridge v3.0.0 SURGICAL-AUTHORITY";
const FALLBACK_REPLY = "I am here with you, and I can stay with this clearly.";

function _safeObj(v) { return !!v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function _clamp01(v, d = 0) { return Math.max(0, Math.min(1, _num(v, d))); }
function _pickFn(mod, name) {
  if (mod && typeof mod[name] === "function") return mod[name];
  if (mod && typeof mod.retrieve === "function") return mod.retrieve;
  if (typeof mod === "function") return mod;
  return null;
}
function _uniqBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of _safeArray(items)) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function _canonicalDomain(v) {
  const raw = _lower(v || "general");
  if (domainRouter && typeof domainRouter.canonicalizeDomain === "function") {
    try {
      const mapped = _lower(domainRouter.canonicalizeDomain(raw, "general"));
      if (mapped) return mapped === "core" ? "general" : mapped;
    } catch (_e) {}
  }
  const map = {
    psych: "psychology",
    psychology: "psychology",
    finance: "finance",
    law: "law",
    legal: "law",
    english: "english",
    cyber: "cybersecurity",
    cybersecurity: "cybersecurity",
    ai: "ai",
    strategy: "strategy",
    marketing: "marketing",
    core: "general",
    general: "general"
  };
  return map[raw] || "general";
}
function _inferIntent(text) {
  const q = _lower(text);
  if (/(sad|upset|anxious|overwhelmed|hurting|afraid|lonely|depressed)/.test(q)) return "support";
  if (/(fix|debug|repair|stability|loop|bridge|error|bug)/.test(q)) return "debug";
  if (/(plan|roadmap|strategy|architecture|design|build)/.test(q)) return "strategy";
  if (/(analysis|assess|evaluate|compare|break down)/.test(q)) return "analysis";
  if (/(research|dataset|evidence|source|reference)/.test(q)) return "research";
  return "general";
}
function _inferDomain(text, requestedDomain, emotion) {
  const joined = _lower(`${requestedDomain || ""} ${text || ""}`);
  if (emotion && (emotion.supportFlags.highDistress || emotion.primaryEmotion === "sad" || emotion.primaryEmotion === "anxious")) return "psychology";
  if (/(psych|emotion|mental|behavior|therapy|feeling|feelings|mood)/.test(joined)) return "psychology";
  if (/(finance|market|invest|investor|economic|economics|pricing|revenue)/.test(joined)) return "finance";
  if (/(law|legal|contract|statute|court|liability)/.test(joined)) return "law";
  if (/(english|writing|grammar|essay|rhetoric)/.test(joined)) return "english";
  if (/(cyber|security|network|infosec|malware|breach)/.test(joined)) return "cybersecurity";
  if (/(brand|branding|marketing|campaign|audience|copy)/.test(joined)) return "marketing";
  if (/(ai|model|llm|prompt|inference)/.test(joined)) return "ai";
  if (/(strategy|architecture|roadmap|operating model)/.test(joined)) return "strategy";
  return _canonicalDomain(requestedDomain);
}
function _normalizeEmotion(raw = {}, text = "") {
  const src = _safeObj(raw);
  const supportFlags = _safeObj(src.supportFlags);
  let primaryEmotion = _lower(src.primaryEmotion || src.emotion || "");
  let intensity = _clamp01(src.intensity, 0);
  if (!primaryEmotion) {
    const q = _lower(text);
    if (/(sad|down|grief|cry|depressed|heartbroken)/.test(q)) { primaryEmotion = "sad"; intensity = Math.max(intensity, 0.78); }
    else if (/(anxious|panic|worried|overwhelmed|scared|afraid)/.test(q)) { primaryEmotion = "anxious"; intensity = Math.max(intensity, 0.76); }
    else if (/(angry|mad|furious|frustrated)/.test(q)) { primaryEmotion = "angry"; intensity = Math.max(intensity, 0.68); }
    else if (/(happy|good|great|excited)/.test(q)) { primaryEmotion = "positive"; intensity = Math.max(intensity, 0.55); }
    else { primaryEmotion = "neutral"; }
  }
  if (primaryEmotion === "sad" || primaryEmotion === "anxious") {
    supportFlags.needsContainment = !!supportFlags.needsContainment || intensity >= 0.7;
    supportFlags.highDistress = !!supportFlags.highDistress || intensity >= 0.82;
  }
  return {
    primaryEmotion,
    secondaryEmotion: _lower(src.secondaryEmotion || ""),
    intensity,
    valence: primaryEmotion === "positive" ? 0.7 : (primaryEmotion === "neutral" ? 0 : -0.7),
    confidence: _clamp01(src.confidence, 0.72),
    supportFlags,
    source: src.source || "bridge_inference"
  };
}
function _normalizeEvidenceItem(item, fallbackDomain = "general", fallbackSource = "bridge") {
  if (typeof item === "string") {
    const text = _trim(item);
    return text ? {
      source: fallbackSource,
      domain: fallbackDomain,
      title: `${fallbackDomain}_evidence`,
      summary: text.slice(0, 220),
      content: text,
      score: 0.62,
      confidence: 0.62,
      tags: [fallbackDomain, "inline"]
    } : null;
  }
  const obj = _safeObj(item);
  const content = _trim(obj.content || obj.text || obj.body || obj.summary || obj.note || "");
  if (!content) return null;
  return {
    id: obj.id || null,
    source: obj.source || fallbackSource,
    dataset: obj.dataset || obj.name || null,
    domain: _canonicalDomain(obj.domain || fallbackDomain),
    title: obj.title || obj.label || obj.name || `${fallbackDomain}_evidence`,
    summary: _trim(obj.summary || content.slice(0, 220)),
    content,
    score: _num(obj.score, 0.64),
    confidence: _num(obj.confidence, 0.64),
    tags: _safeArray(obj.tags).length ? _safeArray(obj.tags) : [fallbackDomain, "evidence"],
    metadata: _safeObj(obj.metadata)
  };
}
function _normalizeEvidence(items, fallbackDomain, fallbackSource) {
  return _uniqBy(
    _safeArray(items).map((x) => _normalizeEvidenceItem(x, fallbackDomain, fallbackSource)).filter(Boolean),
    (x) => [x.id || "", x.source || "", x.title || "", x.summary || ""].join("::")
  ).sort((a, b) => (_num(b.score) + _num(b.confidence)) - (_num(a.score) + _num(a.confidence)));
}
async function _callRetriever(mod, preferredName, payload) {
  const fn = _pickFn(mod, preferredName);
  if (!fn) return null;
  try { return await Promise.resolve(fn(payload)); }
  catch (_e) { return null; }
}
function _extractDatasets(inputDatasets = [], sections = {}) {
  const out = [];
  for (const item of _safeArray(inputDatasets)) out.push(item);
  for (const value of Object.values(_safeObj(sections))) {
    if (Array.isArray(value)) out.push(...value);
  }
  return out;
}
function _composeReply(domain, intent, emotion, evidence, text, memory) {
  const cleanText = _trim(text);
  const top = _safeArray(evidence)[0];
  if (domain === "psychology") {
    if (emotion.primaryEmotion === "sad") {
      return [
        "I am sorry you are carrying that.",
        "You do not have to package it neatly for me. Tell me what happened, or tell me what feels heaviest right now."
      ].join("\n");
    }
    if (emotion.primaryEmotion === "anxious") {
      return [
        "I can feel the pressure in this.",
        "Let’s slow it down and handle one piece at a time. Tell me the part that feels most urgent."
      ].join("\n");
    }
    return [
      "I am with you on this.",
      "Give me the sharpest version of what is bothering you, and I will stay precise with it."
    ].join("\n");
  }
  if (intent === "debug") {
    return top
      ? `I traced the likely break point to ${top.title || top.source || "the bridge path"}.\nThe next clean move is to stabilize that handoff first, then verify response injection before anything cosmetic.`
      : "I can see a bridge-path problem.\nThe next clean move is to stabilize Marion authority first, then verify that the response reaches the chat contract without fallback overwrite.";
  }
  if (intent === "analysis") {
    return top
      ? `Here is the sharp read.\nThe strongest signal is ${top.title || top.source || "the primary evidence"}, and it points to a structural issue that should be fixed at the authority layer first.`
      : "Here is the sharp read.\nThe structure wants a single authority layer and a stable response contract, otherwise the system keeps slipping into generic fallback behavior.";
  }
  if (top) {
    return `Here is the clearest path forward.\nI am anchoring this on ${top.title || top.source || "the strongest evidence"} so we move with one clean thread instead of scattering.`;
  }
  if (_trim(memory.lastQuery) && _trim(memory.lastQuery) === cleanText) {
    return "I am staying on the same thread.\nI will tighten the answer instead of resetting the conversation.";
  }
  return "I have the thread.\nI can answer this directly and keep the conversation stable.";
}
function _buildPacket(result, evidence) {
  return {
    synthesis: {
      answer: result.reply,
      text: result.reply,
      mode: result.mode,
      spokenText: result.spokenText || result.reply,
      confidence: result.confidence
    },
    routing: {
      domain: result.domain,
      intent: result.intent,
      status: result.status
    },
    emotion: {
      lockedEmotion: result.emotion,
      strategy: {
        mode: result.mode,
        warmth: result.domain === "psychology" ? 0.92 : 0.74,
        directness: result.intent === "debug" ? 0.84 : 0.7
      }
    },
    evidence: {
      count: _safeArray(evidence).length,
      rankedCount: _safeArray(evidence).length,
      domainEvidence: _safeArray(evidence).slice(0, 8)
    },
    continuity: {
      state: _safeObj(result.continuityState),
      turnMemory: _safeObj(result.turnMemory),
      resetGuard: {
        shouldSuppressHardReset: true,
        shouldForceRecoveryMode: false,
        flags: ["bridge_authority"]
      }
    },
    authority: {
      shouldAnswer: !!_trim(result.reply),
      mode: result.ok === false ? "degraded" : "bridge_primary",
      confidence: result.confidence,
      reason: "marion_authority"
    },
    meta: _safeObj(result.meta),
    raw: result
  };
}

async function retrieveLayer2Signals(input = {}) {
  const text = _trim(input.userQuery || input.query || input.text);
  const requestedDomain = _canonicalDomain(input.requestedDomain || input.domain || "general");
  const memory = _safeObj(input.previousMemory);
  const routed = typeof routeMarion === "function"
    ? await Promise.resolve(routeMarion({ text, query: text, requestedDomain, domain: requestedDomain }))
    : {};
  const rawEmotion = await _callRetriever(EmotionRetriever, "retrieveEmotion", { text, query: text, userQuery: text, conversationState: _safeObj(input.conversationState) });
  const emotion = _normalizeEmotion(_safeObj(rawEmotion || routed.emotion), text);
  const domain = _inferDomain(text, _trim(routed.domain || requestedDomain), emotion);
  const intent = _trim(routed.intent || input.intent || _inferIntent(text)) || "general";
  const rawPsychology = domain === "psychology"
    ? await _callRetriever(PsychologyRetriever, "retrievePsychology", { text, query: text, userQuery: text, emotion, conversationState: _safeObj(input.conversationState) })
    : null;
  const psychology = _safeObj(rawPsychology);
  const directDomainEvidence = await _callRetriever(DomainRetriever, "retrieveDomain", { text, query: text, userQuery: text, domain, conversationState: _safeObj(input.conversationState), emotion, psychology });
  const datasets = _extractDatasets(input.datasets, input.knowledgeSections);
  const directDatasetEvidence = await _callRetriever(DatasetRetriever, "retrieveDataset", { text, query: text, userQuery: text, domain, datasets, conversationState: _safeObj(input.conversationState), emotion, psychology });
  const domainEvidence = _normalizeEvidence([].concat(input.domainEvidence || [], directDomainEvidence || [], psychology.evidenceMatches || []), domain, "domain");
  const datasetEvidence = _normalizeEvidence([].concat(input.datasetEvidence || [], directDatasetEvidence || [], datasets || [], emotion.evidenceMatches || []), domain, "dataset");
  const memoryEvidence = _normalizeEvidence(input.memoryEvidence || [], domain, "memory");
  const generalEvidence = _normalizeEvidence(input.generalEvidence || [], domain, "general");
  return {
    userQuery: text,
    requestedDomain,
    domain,
    intent,
    emotion,
    psychology,
    datasets,
    domainEvidence,
    datasetEvidence,
    memoryEvidence,
    generalEvidence,
    diagnostics: {
      evidenceCounts: {
        domainEvidence: domainEvidence.length,
        datasetEvidence: datasetEvidence.length,
        memoryEvidence: memoryEvidence.length,
        generalEvidence: generalEvidence.length
      }
    },
    previousMemory: memory
  };
}

async function processWithMarion(input = {}) {
  const layer2 = await retrieveLayer2Signals(input);
  const combinedEvidence = []
    .concat(layer2.domainEvidence, layer2.datasetEvidence, layer2.memoryEvidence, layer2.generalEvidence)
    .slice(0, 16);
  const memory = _safeObj(layer2.previousMemory);
  const reply = _composeReply(layer2.domain, layer2.intent, layer2.emotion, combinedEvidence, layer2.userQuery, memory);
  const mode = layer2.domain === "psychology"
    ? "supportive"
    : (memory.repeatQueryStreak >= 2 ? "recovery" : "balanced");
  const confidence = Math.max(
    0.72,
    Math.min(0.96, 0.72 + (Math.min(combinedEvidence.length, 6) * 0.03))
  );
  const result = {
    ok: true,
    partial: false,
    status: "ok",
    userQuery: layer2.userQuery,
    domain: layer2.domain,
    intent: layer2.intent,
    emotion: layer2.emotion,
    psychology: layer2.psychology,
    evidence: combinedEvidence,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    spokenText: reply.replace(/\n+/g, " ").trim(),
    mode,
    continuityState: {
      activeQuery: layer2.userQuery,
      activeDomain: layer2.domain,
      activeIntent: layer2.intent,
      activeEmotion: layer2.emotion.primaryEmotion,
      emotionalIntensity: layer2.emotion.intensity,
      responseMode: mode,
      continuityHealth: "steady",
      recoveryMode: mode === "recovery" ? "guided-recovery" : "normal",
      timestamp: Date.now()
    },
    turnMemory: {
      lastQuery: layer2.userQuery,
      domain: layer2.domain,
      intent: layer2.intent,
      emotion: {
        primaryEmotion: layer2.emotion.primaryEmotion,
        intensity: layer2.emotion.intensity
      },
      fallbackStreak: 0,
      repeatQueryStreak: _trim(memory.lastQuery).toLowerCase() === _trim(layer2.userQuery).toLowerCase() ? (_num(memory.repeatQueryStreak, 0) + 1) : 0,
      continuityHealth: "steady",
      recoveryMode: mode === "recovery" ? "guided-recovery" : "normal",
      updatedAt: Date.now()
    },
    meta: {
      version: VERSION,
      evidenceCount: combinedEvidence.length,
      mode
    },
    layer2
  };
  const packet = _buildPacket(result, combinedEvidence);
  const presentation = buildResponseContract(result, packet);
  return {
    ...result,
    packet,
    ui: presentation.ui,
    emotionalTurn: presentation.emotionalTurn,
    followUps: presentation.followUps,
    followUpsStrings: presentation.followUpsStrings,
    payload: presentation.payload
  };
}

function createMarionBridge(options = {}) {
  const memoryProvider = _safeObj(options.memoryProvider);
  const evidenceEngine = _safeObj(options.evidenceEngine);
  return {
    version: VERSION,
    async maybeResolve(req = {}) {
      const meta = _safeObj(req.meta);
      const previousMemory = memoryProvider && typeof memoryProvider.getContext === "function"
        ? await Promise.resolve(memoryProvider.getContext(req))
        : {};
      const collectedEvidence = evidenceEngine && typeof evidenceEngine.collect === "function"
        ? await Promise.resolve(evidenceEngine.collect(req))
        : [];
      const knowledgeSections = _safeObj(meta.knowledgeSections);
      const datasets = _extractDatasets(meta.datasets, knowledgeSections);
      const result = await processWithMarion({
        userQuery: req.text || req.query || "",
        requestedDomain: meta.preferredDomain || req.domain || "",
        conversationState: _safeObj(meta.session),
        previousMemory,
        datasets,
        knowledgeSections,
        domainEvidence: _safeArray(collectedEvidence),
        datasetEvidence: _safeArray(meta.datasetEvidence),
        memoryEvidence: _safeArray(meta.memoryEvidence),
        generalEvidence: _safeArray(meta.generalEvidence)
      });
      return {
        usedBridge: !!_trim(result.reply),
        packet: result.packet,
        reply: result.reply,
        domain: result.domain,
        intent: result.intent,
        meta: result.meta,
        ui: result.ui,
        emotionalTurn: result.emotionalTurn,
        followUps: result.followUps,
        followUpsStrings: result.followUpsStrings,
        result
      };
    }
  };
}

async function route(input = {}) { return processWithMarion(input); }
const ask = route;
const handle = route;

module.exports = {
  VERSION,
  retrieveLayer2Signals,
  processWithMarion,
  createMarionBridge,
  route,
  ask,
  handle,
  default: route
};
