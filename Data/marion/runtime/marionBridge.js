"use strict";

let EmotionRetriever = null;
let PsychologyRetriever = null;
let DomainRetriever = null;
let DatasetRetriever = null;
let routeMarion = null;
let domainRouter = null;
let composeMarionResponse = null;
let buildResponseContract = null;

try { EmotionRetriever = require("./emotionRetriever"); } catch (_e) { EmotionRetriever = null; }
try { PsychologyRetriever = require("./psychologyRetriever"); } catch (_e) { PsychologyRetriever = null; }
try { DomainRetriever = require("./domainRetriever"); } catch (_e) { DomainRetriever = null; }
try { DatasetRetriever = require("./datasetRetriever"); } catch (_e) { DatasetRetriever = null; }
try { ({ routeMarion } = require("./marionRouter")); } catch (_e) { routeMarion = null; }
try { domainRouter = require("./domainRouter"); } catch (_e) { domainRouter = null; }
try { ({ composeMarionResponse } = require("./composeMarionResponse")); } catch (_e) {
  try { ({ composeMarionResponse } = require("./composeMarionResponse")); } catch (_err) { composeMarionResponse = null; }
}
try { ({ buildResponseContract } = require("./conversationalResponseSystem")); } catch (_e) {
  try { ({ buildResponseContract } = require("./conversationalResponseSystem")); } catch (_err) { buildResponseContract = null; }
}

const VERSION = "marionBridge v4.2.0 BRIDGE-AND-KNOWLEDGE-STABLE";
const FALLBACK_REPLY = "I am here with you, and I can stay with this clearly.";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";
const MAX_EVIDENCE = 16;
const MAX_RANKED_EVIDENCE = 8;
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
function _pickFn(mod, name) { if (mod && typeof mod[name] === "function") return mod[name]; if (mod && typeof mod.retrieve === "function") return mod.retrieve; if (typeof mod === "function") return mod; return null; }
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
function _hashText(v) { const s = _trim(v); let h = 0; for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h) + s.charCodeAt(i); return String(h >>> 0); }
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
    crisis: _bool(src.crisis), needsContainment: _bool(src.needsContainment), needsStabilization: _bool(src.needsStabilization), needsClarification: _bool(src.needsClarification), needsConnection: _bool(src.needsConnection), highDistress: _bool(src.highDistress), frustration: _bool(src.frustration), urgency: _bool(src.urgency), repeatEscalation: _bool(src.repeatEscalation), guardedness: _bool(src.guardedness), suppressed: _bool(src.suppressed), forcedPositivity: _bool(src.forcedPositivity), minimization: _bool(src.minimization)
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
  return { messageLength: _trim(text).length, repeatQuery, repeatQueryStreak: repeatQuery ? (_num(mem.repeatQueryStreak, 0) + 1) : 0, exclamations, questionMarks, capsTokens, urgencyHits, frustrationHits, distressHits, directiveHits, cognitiveLoad: Number(cognitiveLoad.toFixed(3)), volatility: Number(volatility.toFixed(3)), userState: distressHits > 0 ? "distressed" : (frustrationHits > 0 ? "frustrated" : (urgencyHits > 0 ? "urgent" : "stable")) };
}
function _normalizeEmotion(raw = {}, text = "", behavior = {}) {
  const src = _safeObj(raw); const primary = _safeObj(src.primary); const supportFlags = _normalizeSupportFlags(src.supportFlags);
  let primaryEmotion = _lower(primary.emotion || src.primaryEmotion || src.emotion || "");
  let intensity = _clamp01(primary.intensity != null ? primary.intensity : src.intensity, 0);
  const q = _lower(text);
  if (!primaryEmotion) {
    if (/(sad|down|grief|cry|depressed|heartbroken)/.test(q)) { primaryEmotion = "sadness"; intensity = Math.max(intensity, 0.78); }
    else if (/(anxious|panic|worried|overwhelmed|scared|afraid)/.test(q)) { primaryEmotion = "fear"; intensity = Math.max(intensity, 0.76); }
    else if (/(angry|mad|furious|frustrated|annoyed|horrible)/.test(q)) { primaryEmotion = "anger"; intensity = Math.max(intensity, 0.68); }
    else if (/(happy|good|great|excited|love|relieved|grateful)/.test(q)) { primaryEmotion = "joy"; intensity = Math.max(intensity, 0.55); }
    else { primaryEmotion = "neutral"; }
  }
  intensity = Math.min(1, intensity + Math.min(0.22, _num(behavior.volatility, 0) * 0.35) + Math.min(0.16, _num(behavior.distressHits, 0) * 0.04));
  if (["sadness", "fear"].includes(primaryEmotion)) { supportFlags.needsContainment = supportFlags.needsContainment || intensity >= 0.7; supportFlags.highDistress = supportFlags.highDistress || intensity >= 0.82 || _num(behavior.distressHits, 0) >= 2; }
  if (primaryEmotion === "anger" || _num(behavior.frustrationHits, 0) > 0) supportFlags.frustration = true;
  if (_num(behavior.urgencyHits, 0) > 0) supportFlags.urgency = true;
  if (_bool(behavior.repeatQuery) || _num(behavior.repeatQueryStreak, 0) >= 2) supportFlags.repeatEscalation = true;
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
  return { id: obj.id || null, source: obj.source || fallbackSource, dataset: obj.dataset || obj.name || null, domain: _canonicalDomain(obj.domain || fallbackDomain), title: _trim(obj.title || obj.label || `${fallbackDomain}_evidence`) || `${fallbackDomain}_evidence`, summary: _trim(obj.summary || content.slice(0, 220)), content, score: _clamp01(obj.score, 0.68), confidence: _clamp01(obj.confidence != null ? obj.confidence : obj.score, 0.68), tags: _safeArray(obj.tags).map((x) => _trim(x)).filter(Boolean).slice(0, 8), metadata: _safeObj(obj.metadata) };
}
function _normalizeEvidence(evidence = [], domain = "general", source = "bridge") { return _uniqBy(_safeArray(evidence).map((item) => _normalizeEvidenceItem(item, domain, source)).filter(Boolean), (item) => `${item.domain}|${item.source}|${_lower(item.content)}`); }
function _validateEvidenceShape(evidence = [], domain = "general") {
  const items = _normalizeEvidence(evidence, domain, "validated").slice(0, MAX_EVIDENCE);
  const issues = [];
  if (!items.length) issues.push("evidence_empty");
  return { ok: true, issues, items };
}
function _validateInputShape(input = {}) {
  const src = _safeObj(input);
  const userQuery = _trim(src.userQuery || src.text || src.query || "");
  const requestedDomain = _canonicalDomain(src.requestedDomain || src.domain || "general");
  const knowledgeSections = _safeObj(src.knowledgeSections || src.knowledge || src.sections);
  const normalized = {
    userQuery,
    requestedDomain,
    previousMemory: _safeObj(src.previousMemory),
    datasets: _safeArray(src.datasets),
    knowledgeSections,
    domainEvidence: _safeArray(src.domainEvidence),
    datasetEvidence: _safeArray(src.datasetEvidence),
    memoryEvidence: _safeArray(src.memoryEvidence),
    generalEvidence: _safeArray(src.generalEvidence),
    intent: _trim(src.intent || src.intentHint || "")
  };
  const issues = [];
  if (!userQuery) issues.push("user_query_missing");
  return { ok: true, issues, normalized };
}
async function _callRetriever(mod, name, payload) { const fn = _pickFn(mod, name); if (!fn) return null; try { return await Promise.resolve(fn(payload)); } catch (_e) { return null; } }
function _extractDatasets(inputDatasets = [], sections = {}) { const out = []; for (const item of _safeArray(inputDatasets)) out.push(item); for (const value of Object.values(_safeObj(sections))) if (Array.isArray(value)) out.push(...value); return out; }
function _resolveCanonicalRoute(text, requestedDomain, previousMemory = {}) {
  if (typeof routeMarion === "function") {
    try { return _safeObj(routeMarion({ text, query: text, requestedDomain, domain: requestedDomain, previousMemory })); } catch (_e) {}
  }
  return { ok: true, primaryDomain: _canonicalDomain(requestedDomain), secondaryDomains: [], supportFlags: {}, domains: { emotion: {}, psychology: { matched: false, matches: [] } }, primaryEmotion: { emotion: "neutral", intensity: 0 }, blendProfile: { weights: { neutral: 1 }, dominantAxis: "neutral" }, stateDrift: { previousEmotion: "", currentEmotion: "neutral", trend: "stable", stability: 1 }, classified: { classifications: {}, supportFlags: {}, domainCandidates: [_canonicalDomain(requestedDomain)] }, diagnostics: { domainCandidates: [_canonicalDomain(requestedDomain)], usedPsychology: false } };
}
function _synthesizeReply(contract = {}, layer2 = {}) {
  const directive = _safeObj(contract.nyxDirective);
  const line1 = _trim(contract.interpretation || FALLBACK_REPLY) || FALLBACK_REPLY;
  const top = _safeArray(layer2.evidence)[0] || null;
  if (_safeObj(contract.supportFlags).crisis) return [line1, "Your safety comes first. Reach out to immediate human support right now or local emergency help if you might act on this."].join("\n");
  if (layer2.domain !== "psychology") {
    if (top && _trim(top.summary) && _lower(top.summary) !== _lower(line1)) return [line1, _trim(top.summary)].join("\n");
    return line1;
  }
  if (directive.pacing === "slow" && directive.followupStyle === "soft_probe") return [line1, "You do not have to force it. Give me the piece that feels easiest to say first."].join("\n");
  if (directive.followupStyle === "ground_then_narrow") return [line1, "Let’s keep it to one piece at a time. Tell me the part that feels most immediate."].join("\n");
  if (directive.followupStyle === "action_gate") return [line1, "Stay with the immediate next safe step only."].join("\n");
  if (directive.followupStyle === "direct_answer_then_one_question") return [line1, "What is the next move you want to stabilize first?"].join("\n");
  return line1;
}
function _buildPacket(result, evidence) {
  return {
    routing: { domain: result.domain, intent: result.intent, endpoint: result.endpoint },
    emotion: { lockedEmotion: result.emotion },
    synthesis: { domain: result.domain, intent: result.intent, mode: result.contract.supportMode, answer: result.reply, reply: result.reply, interpretation: result.contract.interpretation, supportMode: result.contract.supportMode, routeBias: result.contract.routeBias, riskLevel: result.contract.riskLevel, blendProfile: result.contract.blendProfile, stateDrift: result.contract.stateDrift, responsePlan: result.contract.responsePlan, nyxDirective: result.contract.nyxDirective },
    evidence: _safeArray(evidence).slice(0, MAX_RANKED_EVIDENCE),
    continuityState: result.continuityState,
    turnMemory: result.turnMemory,
    meta: result.meta
  };
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
  const directDomainEvidence = _safeArray(await _callRetriever(DomainRetriever, "retrieve", { text, query: text, userQuery: text, domain, maxMatches: 5 }));
  const directDatasetEvidence = _safeArray(await _callRetriever(DatasetRetriever, "retrieveDataset", { text, query: text, userQuery: text, domain, intent, datasets, emotion: { primaryEmotion: emotion.primaryEmotion, intensity: emotion.intensity }, psychology: { supportMode: _trim(_safeObj(_safeObj(psychology.primary).record).supportMode || _safeObj(psychology.route).supportMode || "") }, maxMatches: 6 }));
  const evidence = _normalizeEvidence([].concat(normalized.memoryEvidence).concat(normalized.generalEvidence).concat(normalized.domainEvidence).concat(normalized.datasetEvidence).concat(directDomainEvidence).concat(directDatasetEvidence).concat(_safeArray(normalized.knowledgeSections[domain])).concat(_safeArray(normalized.knowledgeSections.general)), domain, "bridge").slice(0, MAX_EVIDENCE);
  const evidenceValidation = _validateEvidenceShape(evidence, domain);
  return { endpoint: CANONICAL_ENDPOINT, userQuery: text, domain, intent, behavior, emotion, routing, psychology, supportFlags, datasets, evidence: evidenceValidation.items, diagnostics: { inputIssues: validated.issues, evidenceIssues: evidenceValidation.issues, layer2EvidenceCounts: { total: evidenceValidation.items.length, memory: _safeArray(normalized.memoryEvidence).length, general: _safeArray(normalized.generalEvidence).length, domain: _safeArray(normalized.domainEvidence).length + directDomainEvidence.length, dataset: _safeArray(normalized.datasetEvidence).length + directDatasetEvidence.length }, routingDiagnostics: _safeObj(routing.diagnostics) } };
}

async function processWithMarion(input = {}) {
  const layer2 = await retrieveLayer2Signals(input);
  const contract = typeof composeMarionResponse === "function"
    ? composeMarionResponse({ primaryDomain: layer2.domain, domains: { psychology: layer2.psychology, emotion: { matched: true, primary: { emotion: layer2.emotion.primaryEmotion, secondaryEmotion: layer2.emotion.secondaryEmotion, intensity: layer2.emotion.intensity, confidence: layer2.emotion.confidence }, supportFlags: layer2.supportFlags, intensity: layer2.emotion.intensity, primaryEmotion: layer2.emotion.primaryEmotion, secondaryEmotion: layer2.emotion.secondaryEmotion, blendProfile: _safeObj(layer2.routing.blendProfile), stateDrift: _safeObj(layer2.routing.stateDrift) } }, psychology: layer2.psychology, emotion: layer2.emotion, classified: layer2.routing.classified || {}, supportFlags: layer2.supportFlags, blendProfile: layer2.routing.blendProfile, stateDrift: layer2.routing.stateDrift, previousTurn: layer2.routing.previousTurn, routeBias: _trim(_safeObj(_safeObj(layer2.psychology).route).routeBias || "") }, input)
    : { interpretation: FALLBACK_REPLY, supportMode: "clarify_and_sequence", routeBias: "clarify", riskLevel: layer2.supportFlags.crisis ? "critical" : (layer2.supportFlags.highDistress ? "high" : "low"), responsePlan: { pacing: "steady", followupStyle: "reflective" }, nyxDirective: { followupStyle: "reflective", pacing: "steady", responseLength: "medium" }, supportFlags: layer2.supportFlags, blendProfile: layer2.routing.blendProfile, stateDrift: layer2.routing.stateDrift };
  const reply = _trim(_synthesizeReply(contract, layer2)) || FALLBACK_REPLY;
  const continuityState = { activeQuery: layer2.userQuery, activeDomain: layer2.domain, activeIntent: layer2.intent, activeEmotion: layer2.emotion.primaryEmotion, emotionalIntensity: layer2.emotion.intensity, responseMode: contract.supportMode || "clarify_and_sequence", continuityHealth: layer2.behavior.repeatQuery ? "stressed" : "stable", recoveryMode: !!layer2.supportFlags.recoveryPresent, timestamp: Date.now() };
  const turnMemory = { lastQuery: layer2.userQuery, domain: layer2.domain, intent: layer2.intent, emotion: { primaryEmotion: layer2.emotion.primaryEmotion, intensity: layer2.emotion.intensity }, behavior: { userState: layer2.behavior.userState, volatility: layer2.behavior.volatility, urgencyHits: layer2.behavior.urgencyHits, frustrationHits: layer2.behavior.frustrationHits }, repeatQueryStreak: layer2.behavior.repeatQueryStreak, updatedAt: Date.now() };
  const result = { ok: true, partial: layer2.diagnostics.inputIssues.length > 0 || layer2.diagnostics.evidenceIssues.length > 0, status: "ok", endpoint: layer2.endpoint, userQuery: layer2.userQuery, domain: layer2.domain, intent: layer2.intent, emotion: layer2.emotion, behavior: layer2.behavior, psychology: layer2.psychology, evidence: layer2.evidence, contract, reply, text: reply, answer: reply, output: reply, spokenText: reply.replace(/\n+/g, " ").trim(), continuityState, turnMemory, diagnostics: layer2.diagnostics, meta: { version: VERSION, endpoint: layer2.endpoint, evidenceCount: layer2.evidence.length, mode: contract.supportMode || "clarify_and_sequence", packetSignature: _hashText(`${layer2.domain}|${layer2.intent}|${reply}`), knowledgeStable: true }, layer2 };
  const packet = _buildPacket(result, layer2.evidence);
  let ui = null; let emotionalTurn = null; let followUps = []; let followUpsStrings = []; let payload = null;
  if (typeof buildResponseContract === "function") {
    try {
      const presentation = buildResponseContract(result, packet);
      ui = presentation.ui; emotionalTurn = presentation.emotionalTurn; followUps = presentation.followUps; followUpsStrings = presentation.followUpsStrings; payload = presentation.payload;
    } catch (_e) {}
  }
  return { ...result, packet, ui, emotionalTurn, followUps, followUpsStrings, payload };
}

async function runDomainContractTests() {
  const results = [];
  for (const testCase of DOMAIN_TEST_CASES) {
    const out = await processWithMarion({ userQuery: testCase.text, requestedDomain: testCase.domain, previousMemory: {} });
    results.push({ domain: testCase.domain, requestedDomain: testCase.domain, resolvedDomain: out.domain, intent: out.intent, ok: !!_trim(out.reply), hasPacket: !!_safeObj(out.packet).synthesis, endpoint: out.endpoint, mode: _safeObj(out.meta).mode, passed: out.domain === _canonicalDomain(testCase.domain) && !!_trim(out.reply) && out.endpoint === CANONICAL_ENDPOINT });
  }
  return { version: VERSION, canonicalEndpoint: CANONICAL_ENDPOINT, passed: results.every((x) => x.passed), results };
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
      const result = await processWithMarion({ userQuery: req.text || req.query || "", requestedDomain: meta.preferredDomain || req.domain || "", conversationState: _safeObj(meta.session), previousMemory, datasets, knowledgeSections, domainEvidence: _safeArray(collectedEvidence), datasetEvidence: _safeArray(meta.datasetEvidence), memoryEvidence: _safeArray(meta.memoryEvidence), generalEvidence: _safeArray(meta.generalEvidence) });
      return { usedBridge: !!_trim(result.reply), packet: result.packet, reply: result.reply, domain: result.domain, intent: result.intent, endpoint: result.endpoint, meta: result.meta, diagnostics: result.diagnostics, ui: result.ui, emotionalTurn: result.emotionalTurn, followUps: result.followUps, followUpsStrings: result.followUpsStrings, result };
    }
  };
}

async function route(input = {}) { return processWithMarion(input); }
const ask = route;
const handle = route;

module.exports = { VERSION, CANONICAL_ENDPOINT, DOMAIN_TEST_CASES, validateInputShape: _validateInputShape, validateEvidenceShape: _validateEvidenceShape, analyzeBehavior: _analyzeBehavior, retrieveLayer2Signals, processWithMarion, runDomainContractTests, createMarionBridge, route, ask, handle, default: route };
