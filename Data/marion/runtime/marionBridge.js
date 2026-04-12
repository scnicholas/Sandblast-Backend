"use strict";

let EmotionRetriever = null;
let PsychologyRetriever = null;
let DomainRetriever = null;
let DatasetRetriever = null;
let routeMarion = null;
let domainRouter = null;
let composeMarionResponse = null;
let buildResponseContract = null;
let getIdentityCore = null;
let getPublicIdentitySnapshot = null;
let getRelationship = null;
let resolveTrustState = null;
let buildMemorySignals = null;
let buildConsciousnessContext = null;
let evaluateState = null;
let resolvePrivateChannel = null;
let normalizeMarionPacket = null;

try { EmotionRetriever = require("./emotionRetriever"); } catch (_e) { EmotionRetriever = null; }
try { PsychologyRetriever = require("./psychologyRetriever"); } catch (_e) { PsychologyRetriever = null; }
try { DomainRetriever = require("./domainRetriever"); } catch (_e) { DomainRetriever = null; }
try { DatasetRetriever = require("./datasetRetriever"); } catch (_e) { DatasetRetriever = null; }
try { ({ routeMarion } = require("./marionRouter")); } catch (_e) { routeMarion = null; }
try { domainRouter = require("./domainRouter"); } catch (_e) { domainRouter = null; }
try { ({ composeMarionResponse } = require("./composeMarionResponse")); } catch (_e) { composeMarionResponse = null; }
try { ({ buildResponseContract } = require("./conversationalResponseSystem")); } catch (_e) { buildResponseContract = null; }
try { ({ getIdentityCore, getPublicIdentitySnapshot } = require("./marionIdentityCore")); } catch (_e) { getIdentityCore = null; getPublicIdentitySnapshot = null; }
try { ({ getRelationship } = require("./marionRelationshipModel")); } catch (_e) { getRelationship = null; }
try { ({ resolveTrustState } = require("./marionTrustPolicy")); } catch (_e) { resolveTrustState = null; }
try { ({ buildMemorySignals, buildConsciousnessContext } = require("./marionMemoryRuntime")); } catch (_e) { buildMemorySignals = null; buildConsciousnessContext = null; }
try { ({ evaluateState } = require("./marionStateMachine")); } catch (_e) { evaluateState = null; }
try { ({ resolvePrivateChannel } = require("./marionPrivateChannel")); } catch (_e) { resolvePrivateChannel = null; }
try { ({ normalizeMarionPacket } = require("./marionPacketNormalizer")); } catch (_e) { normalizeMarionPacket = null; }

const VERSION = "marionBridge v5.1.0 PIPELINE-HARDENED-CONSCIOUSNESS-SPINE";
const FALLBACK_REPLY = "I am here with you, and I can stay with this clearly.";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";
const MAX_EVIDENCE = 16;
const MAX_RANKED_EVIDENCE = 8;

function _safeObj(v) { return !!v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _num(v, d = 0) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function _clamp01(v, d = 0) { return Math.max(0, Math.min(1, _num(v, d))); }
function _pickFn(mod, name) { if (mod && typeof mod[name] === "function") return mod[name]; if (mod && typeof mod.retrieve === "function") return mod.retrieve; if (typeof mod === "function") return mod; return null; }
function _hashText(v) { const s = _trim(v); let h = 0; for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i); return String(h >>> 0); }
function _uniqBy(items, keyFn) { const seen = new Set(); const out = []; for (const item of _safeArray(items)) { const key = keyFn(item); if (!key || seen.has(key)) continue; seen.add(key); out.push(item); } return out; }

function _canonicalDomain(v) {
  const raw = _lower(v || "general");
  if (domainRouter && typeof domainRouter.canonicalizeDomain === "function") {
    try {
      const mapped = _lower(domainRouter.canonicalizeDomain(raw, "general"));
      if (mapped) return mapped === "core" ? "general" : mapped;
    } catch (_e) {}
  }
  const map = { psych: "psychology", psychology: "psychology", finance: "finance", law: "law", legal: "law", english: "english", cyber: "cybersecurity", cybersecurity: "cybersecurity", ai: "ai", strategy: "strategy", marketing: "marketing", core: "general", general: "general" };
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

function _normalizeSupportFlags(flags = {}) {
  const src = _safeObj(flags);
  return {
    crisis: !!src.crisis,
    needsContainment: !!src.needsContainment,
    needsStabilization: !!src.needsStabilization,
    needsClarification: !!src.needsClarification,
    needsConnection: !!src.needsConnection,
    highDistress: !!src.highDistress,
    frustration: !!src.frustration,
    urgency: !!src.urgency,
    repeatEscalation: !!src.repeatEscalation,
    guardedness: !!src.guardedness,
    suppressed: !!src.suppressed,
    forcedPositivity: !!src.forcedPositivity,
    minimization: !!src.minimization
  };
}

function _analyzeBehavior(text = "", previousMemory = {}) {
  const q = _lower(text);
  const mem = _safeObj(previousMemory);
  const lastQuery = _lower(mem.lastQuery || "");
  const repeatQuery = !!q && !!lastQuery && q === lastQuery;
  const urgencyHits = (q.match(/\b(now|urgent|asap|immediately|today|quick|fast)\b/g) || []).length;
  const frustrationHits = (q.match(/\b(horrible|broken|annoying|stupid|mad|frustrated|angry|wtf|fail|failing)\b/g) || []).length;
  const distressHits = (q.match(/\b(hurting|overwhelmed|panic|afraid|depressed|sad|anxious|lonely)\b/g) || []).length;
  const directiveHits = (q.match(/\b(do|fix|update|resend|lock|stabilize|analyze|audit|build)\b/g) || []).length;
  const cognitiveLoad = Math.min(1, ((q.split(/\s+/).filter(Boolean).length / 120) + (directiveHits * 0.03)));
  return { messageLength: _trim(text).length, repeatQuery, repeatQueryStreak: repeatQuery ? (_num(mem.repeatQueryStreak, 0) + 1) : 0, urgencyHits, frustrationHits, distressHits, directiveHits, cognitiveLoad: Number(cognitiveLoad.toFixed(3)), volatility: Number(Math.min(1, frustrationHits * 0.18 + urgencyHits * 0.08).toFixed(3)), userState: distressHits > 0 ? "distressed" : (frustrationHits > 0 ? "frustrated" : (urgencyHits > 0 ? "urgent" : "stable")) };
}

function _normalizeEmotion(raw = {}, text = "", behavior = {}) {
  const src = _safeObj(raw);
  const primary = _safeObj(src.primary);
  const supportFlags = _normalizeSupportFlags(src.supportFlags);
  let primaryEmotion = _lower(primary.emotion || src.primaryEmotion || src.emotion || "");
  let intensity = _clamp01(primary.intensity != null ? primary.intensity : src.intensity, 0);
  const q = _lower(text);
  if (!primaryEmotion) {
    if (/(sad|down|grief|cry|depressed|heartbroken)/.test(q)) { primaryEmotion = "sadness"; intensity = Math.max(intensity, 0.78); }
    else if (/(anxious|panic|worried|overwhelmed|scared|afraid)/.test(q)) { primaryEmotion = "fear"; intensity = Math.max(intensity, 0.76); }
    else if (/(angry|mad|furious|frustrated|annoyed|horrible)/.test(q)) { primaryEmotion = "anger"; intensity = Math.max(intensity, 0.68); }
    else if (/(happy|good|great|excited|love|relieved|grateful)/.test(q)) { primaryEmotion = "joy"; intensity = Math.max(intensity, 0.55); }
    else primaryEmotion = "neutral";
  }
  intensity = Math.min(1, intensity + Math.min(0.16, _num(behavior.distressHits, 0) * 0.04));
  if (["sadness", "fear"].includes(primaryEmotion)) { supportFlags.needsContainment = supportFlags.needsContainment || intensity >= 0.7; supportFlags.highDistress = supportFlags.highDistress || intensity >= 0.82 || _num(behavior.distressHits, 0) >= 2; }
  if (_num(behavior.frustrationHits, 0) > 0) supportFlags.frustration = true;
  if (_num(behavior.urgencyHits, 0) > 0) supportFlags.urgency = true;
  if (behavior.repeatQuery || _num(behavior.repeatQueryStreak, 0) >= 2) supportFlags.repeatEscalation = true;
  return { primaryEmotion, secondaryEmotion: _lower(primary.secondaryEmotion || src.secondaryEmotion || ""), intensity: Number(intensity.toFixed(3)), valence: primaryEmotion === "joy" ? 0.7 : (primaryEmotion === "neutral" ? 0 : -0.7), confidence: _clamp01(primary.confidence != null ? primary.confidence : src.confidence, 0.72), supportFlags, source: src.source || "bridge_inference" };
}

function _normalizeEvidenceItem(item, fallbackDomain = "general", fallbackSource = "bridge") {
  if (typeof item === "string") {
    const text = _trim(item);
    return text ? { source: fallbackSource, domain: fallbackDomain, title: `${fallbackDomain}_evidence`, summary: text.slice(0, 220), content: text, score: 0.62, confidence: 0.62, tags: [fallbackDomain, "inline"], metadata: {} } : null;
  }
  const obj = _safeObj(item);
  const content = _trim(obj.content || obj.text || obj.body || obj.summary || obj.note || "");
  if (!content) return null;
  return { id: obj.id || null, source: obj.source || fallbackSource, dataset: obj.dataset || obj.name || null, domain: _canonicalDomain(obj.domain || fallbackDomain), title: _trim(obj.title || obj.label || `${fallbackDomain}_evidence`) || `${fallbackDomain}_evidence`, summary: _trim(obj.summary || content.slice(0, 220)) || content.slice(0, 220), content, score: _clamp01(obj.score, 0.7), confidence: _clamp01(obj.confidence != null ? obj.confidence : obj.score, 0.7), tags: _safeArray(obj.tags).slice(0, 8), metadata: _safeObj(obj.metadata) };
}

function _normalizeEvidence(items, domain, source) {
  return _uniqBy(_safeArray(items).map((x) => _normalizeEvidenceItem(x, domain, source)).filter(Boolean), (item) => item.id || `${item.source}|${item.domain}|${item.title}|${item.summary}`)
    .sort((a, b) => (_num(b.score, 0) + _num(b.confidence, 0)) - (_num(a.score, 0) + _num(a.confidence, 0)));
}

function _validateInputShape(input = {}) {
  const src = _safeObj(input);
  const userQuery = _trim(src.userQuery || src.text || src.query || "");
  const requestedDomain = _canonicalDomain(src.requestedDomain || src.domain || src.preferredDomain || "general");
  const knowledgeSections = _safeObj(src.knowledgeSections || _safeObj(_safeObj(src.knowledge).knowledgeSections) || {});
  const normalized = { userQuery, requestedDomain, previousMemory: _safeObj(src.previousMemory), datasets: [...new Set(_safeArray(src.datasets).map(_trim).filter(Boolean))], knowledgeSections, conversationState: _safeObj(src.conversationState), domainEvidence: _safeArray(src.domainEvidence), datasetEvidence: _safeArray(src.datasetEvidence), memoryEvidence: _safeArray(src.memoryEvidence), generalEvidence: _safeArray(src.generalEvidence), intent: _trim(src.intent || src.intentHint || "") };
  const issues = [];
  if (!userQuery) issues.push("user_query_missing");
  return { ok: true, issues, normalized };
}

async function _callRetriever(mod, name, payload) { const fn = _pickFn(mod, name); if (!fn) return null; try { return await Promise.resolve(fn(payload)); } catch (_e) { return null; } }
function _extractDatasets(inputDatasets = [], sections = {}) {
  const out = [];
  for (const item of _safeArray(inputDatasets)) out.push(_trim(item));
  for (const value of Object.values(_safeObj(sections))) {
    if (!Array.isArray(value)) continue;
    for (const item of value) out.push(_trim(item));
  }
  return [...new Set(out.filter(Boolean))];
}
function _resolveCanonicalRoute(text, requestedDomain, previousMemory = {}) { if (typeof routeMarion === "function") { try { return _safeObj(routeMarion({ text, query: text, requestedDomain, domain: requestedDomain, previousMemory })); } catch (_e) {} } return { ok: true, primaryDomain: _canonicalDomain(requestedDomain), supportFlags: {}, domains: { emotion: {}, psychology: { matched: false, matches: [] } }, blendProfile: { weights: { neutral: 1 }, dominantAxis: "neutral" }, stateDrift: { previousEmotion: "", currentEmotion: "neutral", trend: "stable", stability: 1 }, classified: { classifications: {}, supportFlags: {}, domainCandidates: [_canonicalDomain(requestedDomain)] }, diagnostics: { domainCandidates: [_canonicalDomain(requestedDomain)], usedPsychology: false } }; }

function _buildPacket(result, evidence) {
  const packet = {
    routing: { domain: result.domain, intent: result.intent, endpoint: result.endpoint },
    emotion: { lockedEmotion: result.emotion },
    synthesis: { domain: result.domain, intent: result.intent, mode: result.contract.supportMode, answer: result.reply, reply: result.reply, interpretation: result.contract.interpretation, supportMode: result.contract.supportMode, routeBias: result.contract.routeBias, riskLevel: result.contract.riskLevel, responsePlan: result.contract.responsePlan, nyxDirective: result.contract.nyxDirective },
    evidence: _safeArray(evidence).slice(0, MAX_RANKED_EVIDENCE),
    continuityState: result.continuityState,
    turnMemory: result.turnMemory,
    identityState: result.identityState,
    relationshipState: result.relationshipState,
    trustState: result.trustState,
    privateChannel: result.privateChannel,
    memorySignals: result.memorySignals,
    consciousness: result.consciousness,
    meta: result.meta
  };
  return typeof normalizeMarionPacket === "function" ? normalizeMarionPacket({ ...result, packet }) : packet;
}

async function retrieveLayer2Signals(input = {}) {
  const validated = _validateInputShape(input);
  const normalized = validated.normalized;
  const text = normalized.userQuery;
  const requestedDomain = normalized.requestedDomain;
  const intent = _trim(normalized.intent) || _inferIntent(text);
  const previousMemory = _safeObj(normalized.previousMemory);
  const behavior = _analyzeBehavior(text, previousMemory);
  const emotionRaw = await _callRetriever(EmotionRetriever, "retrieveEmotion", { text, query: text, userQuery: text, maxMatches: 5 });
  const emotion = _normalizeEmotion(emotionRaw || {}, text, behavior);
  const routing = _resolveCanonicalRoute(text, requestedDomain, previousMemory);
  const supportFlags = _normalizeSupportFlags({ ...emotion.supportFlags, ..._safeObj(routing.supportFlags), ..._safeObj(_safeObj(routing.classified).supportFlags) });
  const domain = _canonicalDomain(routing.primaryDomain || requestedDomain || "general");
  const datasets = _extractDatasets(normalized.datasets, normalized.knowledgeSections);
  const psychology = _safeObj(_safeObj(routing.domains).psychology).matched ? _safeObj(_safeObj(routing.domains).psychology) : _safeObj(await _callRetriever(PsychologyRetriever, "retrievePsychology", { text, query: text, userQuery: text, supportFlags, riskLevel: supportFlags.crisis ? "critical" : (supportFlags.highDistress ? "high" : "low"), maxMatches: 3 }));
  const directDomainEvidence = _safeArray(await _callRetriever(DomainRetriever, "retrieve", { text, query: text, userQuery: text, domain, conversationState: normalized.conversationState, maxMatches: 5 }));
  const directDatasetEvidence = _safeArray(await _callRetriever(DatasetRetriever, "retrieveDataset", { text, query: text, userQuery: text, domain, intent, conversationState: normalized.conversationState, datasets, emotion: { primaryEmotion: emotion.primaryEmotion, intensity: emotion.intensity }, psychology: { supportMode: _trim(_safeObj(_safeObj(psychology.primary).record).supportMode || _safeObj(psychology.route).supportMode || "") }, maxMatches: 6 }));
  const evidence = _normalizeEvidence([].concat(normalized.memoryEvidence).concat(normalized.generalEvidence).concat(normalized.domainEvidence).concat(normalized.datasetEvidence).concat(directDomainEvidence).concat(directDatasetEvidence).concat(_safeArray(normalized.knowledgeSections[domain])).concat(_safeArray(normalized.knowledgeSections.general)), domain, "bridge").slice(0, MAX_EVIDENCE);
  return {
    endpoint: CANONICAL_ENDPOINT,
    userQuery: text,
    domain,
    intent,
    behavior,
    emotion,
    routing,
    psychology,
    supportFlags,
    datasets,
    evidence,
    diagnostics: {
      inputIssues: validated.issues,
      evidenceIssues: evidence.length ? [] : ["evidence_empty"],
      retrievers: {
        emotionAvailable: !!_pickFn(EmotionRetriever, "retrieveEmotion"),
        psychologyAvailable: !!_pickFn(PsychologyRetriever, "retrievePsychology"),
        domainAvailable: !!_pickFn(DomainRetriever, "retrieve"),
        datasetAvailable: !!_pickFn(DatasetRetriever, "retrieveDataset")
      },
      layer2EvidenceCounts: {
        total: evidence.length,
        memory: _safeArray(normalized.memoryEvidence).length,
        general: _safeArray(normalized.generalEvidence).length,
        domain: _safeArray(normalized.domainEvidence).length + directDomainEvidence.length,
        dataset: _safeArray(normalized.datasetEvidence).length + directDatasetEvidence.length
      },
      routingDiagnostics: _safeObj(routing.diagnostics)
    }
  };
}

async function processWithMarion(input = {}) {
  const layer2 = await retrieveLayer2Signals(input);
  const identityState = typeof getPublicIdentitySnapshot === "function" ? getPublicIdentitySnapshot() : { name: "Marion", role: "private interpreter" };
  const relationshipState = typeof getRelationship === "function" ? getRelationship({ principalId: input?.principalId || input?.sessionId || input?.actor || "public" }) : { principalId: "public", trustTier: "public", channelEntitlement: "public_filtered" };
  const trustState = typeof resolveTrustState === "function" ? resolveTrustState(relationshipState, { requestedMode: input.mode || input.requestedMode || "", privateChannelRequested: !!input.privateChannelRequested }) : { tier: relationshipState.trustTier || "public", level: 1, effectiveChannel: "relay_to_nyx" };
  const memorySignals = typeof buildMemorySignals === "function" ? buildMemorySignals({ previousMemory: input.previousMemory || {}, emotion: layer2.emotion, relationship: relationshipState, trustState, identity: identityState, intent: layer2.intent }) : { retentionClass: "hold", privatePartition: "public_filtered" };
  const continuityState = { activeQuery: layer2.userQuery, activeDomain: layer2.domain, activeIntent: layer2.intent, activeEmotion: layer2.emotion.primaryEmotion, emotionalIntensity: layer2.emotion.intensity, responseMode: "clarify_and_sequence", continuityHealth: layer2.behavior.repeatQuery ? "stressed" : "stable", currentState: "receptive", timestamp: Date.now() };
  const stateTransition = typeof evaluateState === "function" ? evaluateState({ emotion: layer2.emotion, trustState, continuityState, intent: layer2.intent }) : { current: "receptive", previous: "receptive", reason: "fallback", stability: 0.8 };
  continuityState.currentState = stateTransition.current;
  continuityState.responseMode = stateTransition.current;
  const privateChannel = typeof resolvePrivateChannel === "function" ? resolvePrivateChannel({ trustState, relationship: relationshipState, mode: input.mode || input.requestedMode || "", privateChannelRequested: !!input.privateChannelRequested }) : { active: false, mode: "relay_to_nyx", target: "nyx" };
  const consciousness = typeof buildConsciousnessContext === "function" ? buildConsciousnessContext({ identity: identityState, relationship: relationshipState, trustState, memorySignals }) : { trustState, memorySignals };
  const contract = typeof composeMarionResponse === "function"
    ? composeMarionResponse({ primaryDomain: layer2.domain, emotion: layer2.emotion, psychology: layer2.psychology, supportFlags: layer2.supportFlags, blendProfile: _safeObj(layer2.routing.blendProfile), stateDrift: _safeObj(layer2.routing.stateDrift), routeBias: _trim(_safeObj(_safeObj(layer2.psychology).route).routeBias || layer2.intent || "") }, { domain: layer2.domain, intent: layer2.intent, emotion: layer2.emotion, behavior: layer2.behavior, evidence: layer2.evidence, identityState, relationshipState, trustState, privateChannel, memorySignals })
    : { interpretation: FALLBACK_REPLY, supportMode: "clarify_and_sequence", responsePlan: { pacing: "steady", followupStyle: "reflective" }, nyxDirective: { followupStyle: "reflective", pacing: "steady", responseLength: "medium" }, supportFlags: layer2.supportFlags };
  const reply = _trim(contract.reply || contract.output || contract.interpretation || FALLBACK_REPLY) || FALLBACK_REPLY;
  const turnMemory = { lastQuery: layer2.userQuery, domain: layer2.domain, intent: layer2.intent, emotion: { primaryEmotion: layer2.emotion.primaryEmotion, intensity: layer2.emotion.intensity }, behavior: { userState: layer2.behavior.userState, volatility: layer2.behavior.volatility, urgencyHits: layer2.behavior.urgencyHits, frustrationHits: layer2.behavior.frustrationHits }, repeatQueryStreak: layer2.behavior.repeatQueryStreak, updatedAt: Date.now(), trustTier: trustState.tier, state: stateTransition.current };
  const result = { ok: true, partial: layer2.diagnostics.inputIssues.length > 0, status: "ok", endpoint: layer2.endpoint, userQuery: layer2.userQuery, domain: layer2.domain, intent: layer2.intent, emotion: layer2.emotion, behavior: layer2.behavior, psychology: layer2.psychology, evidence: layer2.evidence, contract, reply, text: reply, answer: reply, output: reply, spokenText: reply.replace(/\n+/g, " ").trim(), continuityState, turnMemory, identityState, relationshipState, trustState, privateChannel, memorySignals, consciousness, diagnostics: layer2.diagnostics, meta: { version: VERSION, endpoint: layer2.endpoint, evidenceCount: layer2.evidence.length, mode: contract.supportMode || "clarify_and_sequence", packetSignature: _hashText(`${layer2.domain}|${layer2.intent}|${reply}`), knowledgeStable: true, stateTransition, trustTier: trustState.tier, privateChannel: privateChannel.mode }, layer2 };
  const packet = _buildPacket(result, layer2.evidence);
  let ui = null; let emotionalTurn = null; let followUps = _safeArray(contract.followUps); let followUpsStrings = _safeArray(contract.followUps).map((item) => _trim(item)).filter(Boolean); let payload = null;
  if (typeof buildResponseContract === "function") {
    try {
      const presentation = buildResponseContract(result, packet);
      ui = presentation.ui; emotionalTurn = presentation.emotionalTurn; followUps = presentation.followUps; followUpsStrings = presentation.followUpsStrings; payload = presentation.payload;
    } catch (_e) {}
  }
  return { ...result, packet, ui, emotionalTurn, followUps, followUpsStrings, payload };
}

function createMarionBridge(options = {}) {
  const memoryProvider = _safeObj(options.memoryProvider);
  const evidenceEngine = _safeObj(options.evidenceEngine);
  return {
    version: VERSION,
    canonicalEndpoint: CANONICAL_ENDPOINT,
    async maybeResolve(req = {}) {
      const meta = _safeObj(req.meta);
      const previousMemory = memoryProvider && typeof memoryProvider.getContext === "function" ? await Promise.resolve(memoryProvider.getContext(req)) : {};
      const collectedEvidence = evidenceEngine && typeof evidenceEngine.collect === "function" ? await Promise.resolve(evidenceEngine.collect(req)) : [];
      const knowledgeSections = _safeObj(meta.knowledgeSections || meta.knowledge || {});
      const datasets = _extractDatasets(meta.datasets, knowledgeSections);
      const result = await processWithMarion({ userQuery: req.text || req.query || "", requestedDomain: meta.preferredDomain || req.domain || "", conversationState: _safeObj(meta.session), previousMemory, datasets, knowledgeSections, domainEvidence: _safeArray(collectedEvidence), datasetEvidence: _safeArray(meta.datasetEvidence), memoryEvidence: _safeArray(meta.memoryEvidence), generalEvidence: _safeArray(meta.generalEvidence), mode: _trim(meta.mode || req.mode || ""), privateChannelRequested: !!meta.privateChannelRequested, principalId: _trim(meta.principalId || req.sessionId || "public"), sessionId: _trim(req.sessionId || meta.sessionId || "public") });
      return { usedBridge: !!_trim(result.reply), packet: result.packet, reply: result.reply, domain: result.domain, intent: result.intent, endpoint: result.endpoint, meta: result.meta, diagnostics: result.diagnostics, ui: result.ui, emotionalTurn: result.emotionalTurn, followUps: result.followUps, followUpsStrings: result.followUpsStrings, result, privateChannel: result.privateChannel, trustState: result.trustState, consciousness: result.consciousness };
    }
  };
}

async function route(input = {}) { return processWithMarion(input); }
const ask = route;
const handle = route;

module.exports = { VERSION, CANONICAL_ENDPOINT, retrieveLayer2Signals, processWithMarion, createMarionBridge, route, ask, handle, default: route };
