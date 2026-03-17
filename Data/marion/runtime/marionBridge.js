"use strict";

// runtime/marionBridge.js

const EmotionRetriever = require("./emotionRetriever");
const PsychologyRetriever = require("./psychologyRetriever");
const { runLayer3 } = require("./layer3");

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function _trim(v) {
  return v == null ? "" : String(v).trim();
}

function _lower(v) {
  return _trim(v).toLowerCase();
}

function _pickRetrieverFn(mod, preferredName) {
  if (mod && typeof mod[preferredName] === "function") return mod[preferredName];
  if (mod && typeof mod.retrieve === "function") return mod.retrieve;
  if (typeof mod === "function") return mod;
  return null;
}

function _inferIntent(query = "") {
  const q = _lower(query);

  if (/(analyz|break down|evaluate|assess|critical analysis|compare)/.test(q)) return "analysis";
  if (/(strategy|roadmap|plan|implement|build|architecture|design)/.test(q)) return "strategy";
  if (/(research|study|dataset|source|evidence|reference)/.test(q)) return "research";
  if (/(help|support|hurting|sad|upset|anxious|afraid|overwhelmed)/.test(q)) return "support";

  return "general";
}

function _inferDomain(query = "", requestedDomain = "") {
  const raw = _lower(`${requestedDomain} ${query}`);

  if (/(psych|emotion|mental|behavior|therapy|mood|feeling|feelings)/.test(raw)) return "psychology";
  if (/(finance|stock|stocks|market|markets|economics|capital|investing|investor)/.test(raw)) return "finance";
  if (/(law|legal|contract|contracts|court|case law|bar exam|statute)/.test(raw)) return "law";
  if (/(english|writing|literature|essay|grammar|rhetoric)/.test(raw)) return "english";
  if (/(cyber|security|network|threat|infosec|malware)/.test(raw)) return "cybersecurity";
  if (/(marketing|brand|branding|copy|campaign|audience|growth)/.test(raw)) return "marketing";

  return "general";
}

function _normalizeEmotionResult(result = {}) {
  const primary = _safeObj(result.primary);
  const supportFlags = _safeObj(result.supportFlags);

  const primaryEmotion =
    _trim(result.primaryEmotion) ||
    _trim(primary.emotion) ||
    "neutral";

  const secondaryEmotion = _trim(result.secondaryEmotion) || null;

  let intensity = result.intensity;
  if (typeof intensity !== "number" || Number.isNaN(intensity)) {
    const legacyIntensity = Number(primary.intensity);
    intensity = Number.isFinite(legacyIntensity)
      ? Math.max(0, Math.min(1, legacyIntensity / 10))
      : 0;
  }

  let valence = result.valence;
  if (typeof valence !== "number" || Number.isNaN(valence)) {
    const rawValence = _lower(result.valence || primary.valence);
    if (rawValence === "positive") valence = 0.75;
    else if (rawValence === "negative") valence = -0.75;
    else valence = 0;
  }

  return {
    primaryEmotion,
    secondaryEmotion,
    intensity: Math.max(0, Math.min(1, Number(intensity) || 0)),
    valence: Math.max(-1, Math.min(1, Number(valence) || 0)),
    needs: _safeArray(result.needs),
    cues: _safeArray(result.cues),
    confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
    supportFlags,
    matched: !!result.matched,
    primary,
    matches: _safeArray(result.matches),
    evidenceMatches: _safeArray(result.evidenceMatches),
    meta: _safeObj(result.meta)
  };
}

function _normalizePsychologyResult(result = {}, emotion = {}) {
  const route = _safeObj(result.route);
  const supportFlags = _safeObj(emotion.supportFlags);

  const patterns = _safeArray(result.patterns);
  const risks = _safeArray(result.risks);
  const needs = _safeArray(result.needs);

  let recommendedApproach = _trim(result.recommendedApproach);
  if (!recommendedApproach) {
    if (supportFlags.needsContainment || supportFlags.highDistress) recommendedApproach = "supportive-directive";
    else if ((emotion.intensity || 0) >= 0.6) recommendedApproach = "supportive-containment";
    else recommendedApproach = "supportive";
  }

  let toneGuide = _trim(result.toneGuide);
  if (!toneGuide) {
    toneGuide =
      _trim(route.routeBias) ||
      (((emotion.intensity || 0) >= 0.6) ? "warm and steady" : "balanced");
  }

  return {
    patterns,
    risks,
    needs,
    recommendedApproach,
    toneGuide,
    confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
    matched: !!result.matched,
    route,
    primary: _safeObj(result.primary),
    matches: _safeArray(result.matches),
    evidenceMatches: _safeArray(result.evidenceMatches),
    meta: _safeObj(result.meta)
  };
}

function _normalizeEvidenceItem(item = {}, fallbackSource = "general", fallbackDomain = "general") {
  return {
    id: item.id || null,
    source: item.source || fallbackSource,
    dataset: item.dataset || null,
    domain: item.domain || fallbackDomain,
    title: item.title || null,
    summary: item.summary || "",
    content: item.content || "",
    score: Number.isFinite(item.score) ? item.score : 0,
    confidence: Number.isFinite(item.confidence) ? item.confidence : 0,
    tags: _safeArray(item.tags),
    recency: Number.isFinite(item.recency) ? item.recency : 0,
    emotionalRelevance: Number.isFinite(item.emotionalRelevance) ? item.emotionalRelevance : 0,
    metadata: _safeObj(item.metadata)
  };
}

function _mergeEvidence({ emotion, psychology, domainEvidence, datasetEvidence, memoryEvidence, generalEvidence }) {
  return {
    domainEvidence: _safeArray(domainEvidence).map((x) => _normalizeEvidenceItem(x, "domain", x.domain || "general")),
    datasetEvidence: [
      ..._safeArray(datasetEvidence).map((x) => _normalizeEvidenceItem(x, "dataset", x.domain || "general")),
      ..._safeArray(emotion.evidenceMatches).map((x) => _normalizeEvidenceItem(x, "dataset", "psychology"))
    ],
    memoryEvidence: _safeArray(memoryEvidence).map((x) => _normalizeEvidenceItem(x, "memory", x.domain || "general")),
    generalEvidence: [
      ..._safeArray(generalEvidence).map((x) => _normalizeEvidenceItem(x, "general", x.domain || "general")),
      ..._safeArray(psychology.evidenceMatches).map((x) => _normalizeEvidenceItem(x, "domain", "psychology"))
    ]
  };
}

async function retrieveLayer2Signals(input = {}) {
  const userQuery = _trim(input.userQuery || input.query || input.text);
  const requestedDomain = _trim(input.requestedDomain || input.domain);
  const conversationState = _safeObj(input.conversationState);
  const datasets = _safeArray(input.datasets);
  const domain = _inferDomain(userQuery, requestedDomain);
  const intent = _inferIntent(userQuery);

  const emotionFn = _pickRetrieverFn(EmotionRetriever, "retrieveEmotion");
  const psychologyFn = _pickRetrieverFn(PsychologyRetriever, "retrievePsychology");

  if (!emotionFn) {
    throw new Error("Emotion retriever is missing a callable export.");
  }

  if (!psychologyFn) {
    throw new Error("Psychology retriever is missing a callable export.");
  }

  const rawEmotion = await Promise.resolve(
    emotionFn({
      text: userQuery,
      query: userQuery,
      userText: userQuery,
      conversationState,
      domain,
      datasets
    })
  );

  const emotion = _normalizeEmotionResult(rawEmotion);

  const rawPsychology = await Promise.resolve(
    psychologyFn({
      text: userQuery,
      query: userQuery,
      userText: userQuery,
      conversationState,
      domain,
      datasets,
      emotion,
      supportFlags: emotion.supportFlags
    })
  );

  const psychology = _normalizePsychologyResult(rawPsychology, emotion);

  const mergedEvidence = _mergeEvidence({
    emotion,
    psychology,
    domainEvidence: input.domainEvidence,
    datasetEvidence: input.datasetEvidence,
    memoryEvidence: input.memoryEvidence,
    generalEvidence: input.generalEvidence
  });

  return {
    intent,
    domain,
    userQuery,
    conversationState,
    datasets,
    emotion,
    psychology,
    domainEvidence: mergedEvidence.domainEvidence,
    datasetEvidence: mergedEvidence.datasetEvidence,
    memoryEvidence: mergedEvidence.memoryEvidence,
    generalEvidence: mergedEvidence.generalEvidence,
    diagnostics: {
      requestedDomain,
      inferredDomain: domain,
      inferredIntent: intent
    }
  };
}

async function processWithMarion(input = {}) {
  const layer2Bundle = await retrieveLayer2Signals(input);
  const layer3 = await runLayer3(layer2Bundle);

  return {
    ok: true,
    intent: layer2Bundle.intent,
    domain: layer2Bundle.domain,
    userQuery: layer2Bundle.userQuery,
    marionPacket: layer3.fusionPacket,
    answerPlan: layer3.answerPlan,
    layer2: {
      emotion: layer2Bundle.emotion,
      psychology: layer2Bundle.psychology,
      diagnostics: layer2Bundle.diagnostics
    }
  };
}

module.exports = {
  retrieveLayer2Signals,
  processWithMarion
};
