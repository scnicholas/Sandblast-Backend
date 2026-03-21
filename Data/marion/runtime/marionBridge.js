"use strict";

/**
 * runtime/marionBridge.js
 *
 * Marion-first bridge:
 * - normalizes intent/domain/emotion
 * - gathers evidence from memory/datasets/external retrievers
 * - builds one authoritative answer packet for Nyx
 * - adds surgical schema checks, behavior analysis, canonical routing,
 *   and contract self-tests without drift-heavy rebuilds
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

const VERSION = "marionBridge v3.8.0 CANONICAL-HARDENED";
const FALLBACK_REPLY = "I am here with you, and I can stay with this clearly.";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";
const MAX_EVIDENCE = 16;
const MAX_RANKED_EVIDENCE = 8;
const MIN_CONFIDENCE = 0.72;
const MAX_CONFIDENCE = 0.96;
const DOMAIN_TEST_CASES = Object.freeze([
  { domain: "psychology", text: "I feel anxious and overwhelmed right now." },
  { domain: "finance", text: "Break down revenue, pricing, and investor risk." },
  { domain: "law", text: "Analyze contract liability and legal exposure." },
  { domain: "english", text: "Help me improve grammar and rhetoric in this draft." },
  { domain: "cybersecurity", text: "Assess network breach risk and malware exposure." },
  { domain: "marketing", text: "Build a campaign and branding strategy for the audience." },
  { domain: "ai", text: "Compare model inference behavior and prompt quality." },
  { domain: "strategy", text: "Design an operating model and roadmap for rollout." },
  { domain: "general", text: "Help me think clearly about the next move." }
]);

function _safeObj(v) { return !!v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function _clamp01(v, d = 0) { return Math.max(0, Math.min(1, _num(v, d))); }
function _bool(v) { return !!v; }
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
function _hashText(v) {
  const s = _trim(v);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i);
  return String(h >>> 0);
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
  if (/(sad|upset|anxious|overwhelmed|hurting|afraid|lonely|depressed|grief|panic)/.test(q)) return "support";
  if (/(fix|debug|repair|stability|loop|bridge|error|bug|broken|issue|failure)/.test(q)) return "debug";
  if (/(plan|roadmap|strategy|architecture|design|build|scale|execution)/.test(q)) return "strategy";
  if (/(analysis|assess|evaluate|compare|break down|audit|critical)/.test(q)) return "analysis";
  if (/(research|dataset|evidence|source|reference|study|signal)/.test(q)) return "research";
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
function _normalizeSupportFlags(flags = {}) {
  const src = _safeObj(flags);
  return {
    needsContainment: _bool(src.needsContainment),
    highDistress: _bool(src.highDistress),
    frustration: _bool(src.frustration),
    urgency: _bool(src.urgency),
    repeatEscalation: _bool(src.repeatEscalation)
  };
}
function _analyzeBehavior(text = "", previousMemory = {}) {
  const q = _lower(text);
  const mem = _safeObj(previousMemory);
  const lastQuery = _lower(mem.lastQuery || "");
  const repeatQuery = !!q && !!lastQuery && q === lastQuery;
  const exclamations = (_trim(text).match(/!/g) || []).length;
  const questionMarks = (_trim(text).match(/\?/g) || []).length;
  const capsTokens = (_trim(text).match(/\b[A-Z]{3,}\b/g) || []).length;
  const urgencyHits = (q.match(/\b(now|urgent|asap|immediately|today|quick|fast)\b/g) || []).length;
  const frustrationHits = (q.match(/\b(horrible|broken|annoying|stupid|mad|frustrated|angry|wtf|fail|failing)\b/g) || []).length;
  const distressHits = (q.match(/\b(hurting|overwhelmed|panic|afraid|depressed|sad|anxious|lonely)\b/g) || []).length;
  const directiveHits = (q.match(/\b(do|fix|update|resend|lock|stabilize|analyze|audit|build)\b/g) || []).length;
  const cognitiveLoad = Math.min(1, ((q.split(/\s+/).filter(Boolean).length / 120) + (questionMarks * 0.08) + (directiveHits * 0.03)));
  const volatility = Math.min(1, (exclamations * 0.08) + (capsTokens * 0.12) + (frustrationHits * 0.18) + (urgencyHits * 0.08));
  return {
    messageLength: _trim(text).length,
    repeatQuery,
    repeatQueryStreak: repeatQuery ? (_num(mem.repeatQueryStreak, 0) + 1) : 0,
    exclamations,
    questionMarks,
    capsTokens,
    urgencyHits,
    frustrationHits,
    distressHits,
    directiveHits,
    cognitiveLoad: Number(cognitiveLoad.toFixed(3)),
    volatility: Number(volatility.toFixed(3)),
    userState: distressHits > 0 ? "distressed" : (frustrationHits > 0 ? "frustrated" : (urgencyHits > 0 ? "urgent" : "stable"))
  };
}
function _normalizeEmotion(raw = {}, text = "", behavior = {}) {
  const src = _safeObj(raw);
  const supportFlags = _normalizeSupportFlags(src.supportFlags);
  let primaryEmotion = _lower(src.primaryEmotion || src.emotion || "");
  let intensity = _clamp01(src.intensity, 0);
  const q = _lower(text);

  if (!primaryEmotion) {
    if (/(sad|down|grief|cry|depressed|heartbroken)/.test(q)) { primaryEmotion = "sad"; intensity = Math.max(intensity, 0.78); }
    else if (/(anxious|panic|worried|overwhelmed|scared|afraid)/.test(q)) { primaryEmotion = "anxious"; intensity = Math.max(intensity, 0.76); }
    else if (/(angry|mad|furious|frustrated|annoyed|horrible)/.test(q)) { primaryEmotion = "angry"; intensity = Math.max(intensity, 0.68); }
    else if (/(happy|good|great|excited|love)/.test(q)) { primaryEmotion = "positive"; intensity = Math.max(intensity, 0.55); }
    else { primaryEmotion = "neutral"; }
  }

  intensity = Math.min(1, intensity + Math.min(0.22, _num(behavior.volatility, 0) * 0.35) + Math.min(0.16, _num(behavior.distressHits, 0) * 0.04));

  if (primaryEmotion === "sad" || primaryEmotion === "anxious") {
    supportFlags.needsContainment = supportFlags.needsContainment || intensity >= 0.7;
    supportFlags.highDistress = supportFlags.highDistress || intensity >= 0.82 || _num(behavior.distressHits, 0) >= 2;
  }
  if (primaryEmotion === "angry" || _num(behavior.frustrationHits, 0) > 0) supportFlags.frustration = true;
  if (_num(behavior.urgencyHits, 0) > 0) supportFlags.urgency = true;
  if (_bool(behavior.repeatQuery) || _num(behavior.repeatQueryStreak, 0) >= 2) supportFlags.repeatEscalation = true;

  return {
    primaryEmotion,
    secondaryEmotion: _lower(src.secondaryEmotion || ""),
    intensity: Number(intensity.toFixed(3)),
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
      tags: [fallbackDomain, "inline"],
      metadata: {}
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
function _validateEvidenceShape(items = [], fallbackDomain = "general") {
  const normalized = _normalizeEvidence(items, fallbackDomain, "validated");
  const issues = [];
  for (const item of normalized) {
    if (!_trim(item.content)) issues.push(`missing_content:${item.title || "untitled"}`);
    if (!_trim(item.title)) issues.push(`missing_title:${item.source || "unknown"}`);
    if (!_trim(item.domain)) issues.push(`missing_domain:${item.source || "unknown"}`);
  }
  return { valid: issues.length === 0, issues, items: normalized };
}
function _validateInputShape(input = {}) {
  const src = _safeObj(input);
  const text = _trim(src.userQuery || src.query || src.text);
  const issues = [];
  if (!text) issues.push("missing_text");
  if (text.length > 12000) issues.push("oversized_text");
  return {
    valid: issues.length === 0,
    issues,
    normalized: {
      userQuery: text,
      requestedDomain: _canonicalDomain(src.requestedDomain || src.domain || "general"),
      intent: _trim(src.intent || ""),
      previousMemory: _safeObj(src.previousMemory),
      conversationState: _safeObj(src.conversationState),
      datasets: _safeArray(src.datasets),
      knowledgeSections: _safeObj(src.knowledgeSections),
      domainEvidence: _safeArray(src.domainEvidence),
      datasetEvidence: _safeArray(src.datasetEvidence),
      memoryEvidence: _safeArray(src.memoryEvidence),
      generalEvidence: _safeArray(src.generalEvidence)
    }
  };
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
function _resolveCanonicalRoute(text, requestedDomain) {
  const routing = {
    endpoint: CANONICAL_ENDPOINT,
    source: "canonical",
    domain: _canonicalDomain(requestedDomain),
    intent: _inferIntent(text),
    driftPrevented: true
  };
  if (typeof routeMarion === "function") {
    try {
      const routed = _safeObj(routeMarion({ text, query: text, requestedDomain, domain: requestedDomain }));
      routing.source = "marionRouter";
      routing.domain = _canonicalDomain(routed.domain || routing.domain);
      routing.intent = _trim(routed.intent || routing.intent) || "general";
      routing.emotion = _safeObj(routed.emotion);
    } catch (_e) {
      routing.source = "canonical_fallback";
    }
  }
  return routing;
}
function _composeReply(domain, intent, emotion, evidence, text, memory, behavior) {
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
    if (emotion.primaryEmotion === "angry" || behavior.userState === "frustrated") {
      return [
        "I can feel the friction in this.",
        "Give me the sharpest version of what broke, and I will help you isolate the exact failure point without drift."
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
function _deriveContinuityMode(emotion, behavior, memory = {}) {
  const repeatStreak = Math.max(_num(memory.repeatQueryStreak, 0), _num(behavior.repeatQueryStreak, 0));
  if (emotion.supportFlags.highDistress) {
    return {
      responseMode: "containment",
      continuityHealth: "fragile",
      recoveryMode: "guided-recovery"
    };
  }
  if (emotion.supportFlags.frustration || repeatStreak >= 2) {
    return {
      responseMode: "recovery",
      continuityHealth: "strained",
      recoveryMode: "guided-recovery"
    };
  }
  if (emotion.supportFlags.urgency) {
    return {
      responseMode: "directive",
      continuityHealth: "alert",
      recoveryMode: "normal"
    };
  }
  return {
    responseMode: emotion.primaryEmotion === "positive" ? "affirming" : "balanced",
    continuityHealth: "steady",
    recoveryMode: "normal"
  };
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
      status: result.status,
      endpoint: result.endpoint
    },
    emotion: {
      lockedEmotion: result.emotion,
      behavior: result.behavior,
      strategy: {
        mode: result.mode,
        warmth: result.domain === "psychology" ? 0.92 : 0.74,
        directness: result.intent === "debug" ? 0.84 : 0.7
      }
    },
    evidence: {
      count: _safeArray(evidence).length,
      rankedCount: Math.min(_safeArray(evidence).length, MAX_RANKED_EVIDENCE),
      domainEvidence: _safeArray(evidence).slice(0, MAX_RANKED_EVIDENCE)
    },
    continuity: {
      state: _safeObj(result.continuityState),
      turnMemory: _safeObj(result.turnMemory),
      resetGuard: {
        shouldSuppressHardReset: true,
        shouldForceRecoveryMode: result.mode === "recovery" || result.mode === "containment",
        flags: ["bridge_authority", "canonical_endpoint"]
      }
    },
    authority: {
      shouldAnswer: !!_trim(result.reply),
      mode: result.ok === false ? "degraded" : "bridge_primary",
      confidence: result.confidence,
      reason: "marion_authority",
      packetSignature: _hashText(`${result.domain}|${result.intent}|${result.reply}`)
    },
    diagnostics: _safeObj(result.diagnostics),
    meta: _safeObj(result.meta),
    raw: result
  };
}

async function retrieveLayer2Signals(input = {}) {
  const inputCheck = _validateInputShape(input);
  const normalized = inputCheck.normalized;
  const text = normalized.userQuery;
  const requestedDomain = normalized.requestedDomain;
  const memory = _safeObj(normalized.previousMemory);
  const behavior = _analyzeBehavior(text, memory);
  const routing = _resolveCanonicalRoute(text, requestedDomain);
  const rawEmotion = await _callRetriever(EmotionRetriever, "retrieveEmotion", { text, query: text, userQuery: text, conversationState: normalized.conversationState, behavior, endpoint: routing.endpoint });
  const emotion = _normalizeEmotion(_safeObj(rawEmotion || routing.emotion), text, behavior);
  const domain = _inferDomain(text, _trim(routing.domain || requestedDomain), emotion);
  const intent = _trim(routing.intent || normalized.intent || _inferIntent(text)) || "general";
  const rawPsychology = domain === "psychology"
    ? await _callRetriever(PsychologyRetriever, "retrievePsychology", { text, query: text, userQuery: text, emotion, behavior, conversationState: normalized.conversationState, endpoint: routing.endpoint })
    : null;
  const psychology = _safeObj(rawPsychology);
  const directDomainEvidence = await _callRetriever(DomainRetriever, "retrieveDomain", { text, query: text, userQuery: text, domain, intent, conversationState: normalized.conversationState, emotion, psychology, behavior, endpoint: routing.endpoint });
  const datasets = _extractDatasets(normalized.datasets, normalized.knowledgeSections);
  const directDatasetEvidence = await _callRetriever(DatasetRetriever, "retrieveDataset", { text, query: text, userQuery: text, domain, intent, datasets, conversationState: normalized.conversationState, emotion, psychology, behavior, endpoint: routing.endpoint });

  const validatedDomainEvidence = _validateEvidenceShape([].concat(normalized.domainEvidence || [], directDomainEvidence || [], psychology.evidenceMatches || []), domain);
  const validatedDatasetEvidence = _validateEvidenceShape([].concat(normalized.datasetEvidence || [], directDatasetEvidence || [], datasets || [], emotion.evidenceMatches || []), domain);
  const validatedMemoryEvidence = _validateEvidenceShape(normalized.memoryEvidence || [], domain);
  const validatedGeneralEvidence = _validateEvidenceShape(normalized.generalEvidence || [], domain);

  return {
    userQuery: text,
    requestedDomain,
    domain,
    intent,
    endpoint: routing.endpoint,
    emotion,
    behavior,
    psychology,
    datasets,
    domainEvidence: validatedDomainEvidence.items,
    datasetEvidence: validatedDatasetEvidence.items,
    memoryEvidence: validatedMemoryEvidence.items,
    generalEvidence: validatedGeneralEvidence.items,
    diagnostics: {
      endpoint: routing.endpoint,
      routingSource: routing.source,
      driftPrevented: routing.driftPrevented,
      inputIssues: inputCheck.issues,
      evidenceIssues: []
        .concat(validatedDomainEvidence.issues, validatedDatasetEvidence.issues, validatedMemoryEvidence.issues, validatedGeneralEvidence.issues),
      evidenceCounts: {
        domainEvidence: validatedDomainEvidence.items.length,
        datasetEvidence: validatedDatasetEvidence.items.length,
        memoryEvidence: validatedMemoryEvidence.items.length,
        generalEvidence: validatedGeneralEvidence.items.length
      },
      behavior
    },
    previousMemory: memory
  };
}

async function processWithMarion(input = {}) {
  const layer2 = await retrieveLayer2Signals(input);
  const combinedEvidence = _uniqBy(
    [].concat(layer2.domainEvidence, layer2.datasetEvidence, layer2.memoryEvidence, layer2.generalEvidence),
    (x) => [x.id || "", x.source || "", x.title || "", x.summary || ""].join("::")
  ).slice(0, MAX_EVIDENCE);

  const memory = _safeObj(layer2.previousMemory);
  const continuity = _deriveContinuityMode(layer2.emotion, layer2.behavior, memory);
  const reply = _trim(_composeReply(layer2.domain, layer2.intent, layer2.emotion, combinedEvidence, layer2.userQuery, memory, layer2.behavior)) || FALLBACK_REPLY;
  const confidence = Math.max(
    MIN_CONFIDENCE,
    Math.min(MAX_CONFIDENCE, MIN_CONFIDENCE + (Math.min(combinedEvidence.length, 6) * 0.03) + (layer2.diagnostics.evidenceIssues.length ? -0.03 : 0))
  );

  const result = {
    ok: true,
    partial: layer2.diagnostics.inputIssues.length > 0 || layer2.diagnostics.evidenceIssues.length > 0,
    status: "ok",
    endpoint: layer2.endpoint,
    userQuery: layer2.userQuery,
    domain: layer2.domain,
    intent: layer2.intent,
    emotion: layer2.emotion,
    behavior: layer2.behavior,
    psychology: layer2.psychology,
    evidence: combinedEvidence,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    spokenText: reply.replace(/\n+/g, " ").trim(),
    mode: continuity.responseMode,
    continuityState: {
      activeQuery: layer2.userQuery,
      activeDomain: layer2.domain,
      activeIntent: layer2.intent,
      activeEmotion: layer2.emotion.primaryEmotion,
      emotionalIntensity: layer2.emotion.intensity,
      responseMode: continuity.responseMode,
      continuityHealth: continuity.continuityHealth,
      recoveryMode: continuity.recoveryMode,
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
      behavior: {
        userState: layer2.behavior.userState,
        volatility: layer2.behavior.volatility,
        urgencyHits: layer2.behavior.urgencyHits,
        frustrationHits: layer2.behavior.frustrationHits
      },
      fallbackStreak: 0,
      repeatQueryStreak: layer2.behavior.repeatQueryStreak,
      continuityHealth: continuity.continuityHealth,
      recoveryMode: continuity.recoveryMode,
      updatedAt: Date.now()
    },
    diagnostics: layer2.diagnostics,
    meta: {
      version: VERSION,
      endpoint: layer2.endpoint,
      evidenceCount: combinedEvidence.length,
      mode: continuity.responseMode,
      packetSignature: _hashText(`${layer2.domain}|${layer2.intent}|${reply}`)
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

async function runDomainContractTests() {
  const results = [];
  for (const testCase of DOMAIN_TEST_CASES) {
    const out = await processWithMarion({
      userQuery: testCase.text,
      requestedDomain: testCase.domain,
      previousMemory: {}
    });
    results.push({
      domain: testCase.domain,
      requestedDomain: testCase.domain,
      resolvedDomain: out.domain,
      intent: out.intent,
      ok: !!_trim(out.reply),
      hasPacket: !!_safeObj(out.packet).synthesis,
      endpoint: out.endpoint,
      mode: out.mode,
      passed: out.domain === _canonicalDomain(testCase.domain) && !!_trim(out.reply) && out.endpoint === CANONICAL_ENDPOINT
    });
  }
  return {
    version: VERSION,
    canonicalEndpoint: CANONICAL_ENDPOINT,
    passed: results.every((x) => x.passed),
    results
  };
}

function createMarionBridge(options = {}) {
  const memoryProvider = _safeObj(options.memoryProvider);
  const evidenceEngine = _safeObj(options.evidenceEngine);
  return {
    version: VERSION,
    canonicalEndpoint: CANONICAL_ENDPOINT,
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
        endpoint: result.endpoint,
        meta: result.meta,
        diagnostics: result.diagnostics,
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
  CANONICAL_ENDPOINT,
  DOMAIN_TEST_CASES,
  validateInputShape: _validateInputShape,
  validateEvidenceShape: _validateEvidenceShape,
  analyzeBehavior: _analyzeBehavior,
  retrieveLayer2Signals,
  processWithMarion,
  runDomainContractTests,
  createMarionBridge,
  route,
  ask,
  handle,
  default: route
};
