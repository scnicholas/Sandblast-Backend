"use strict";

// runtime/marionBridge.js

const EmotionRetriever = require("./emotionRetriever");
const PsychologyRetriever = require("./psychologyRetriever");
const DomainRetriever = require("./domainRetriever");
const DatasetRetriever = require("./datasetRetriever");
const { runLayer3 } = require("./layer3");
const { runLayer4 } = require("./layer4");
const { runLayer5 } = require("./layer5");

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
      ((emotion.intensity || 0) >= 0.6 ? "warm and steady" : "balanced");
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

function _dedupeEvidence(items = []) {
  const seen = new Set();
  const out = [];

  for (const item of _safeArray(items)) {
    const normalized = _normalizeEvidenceItem(item, item.source || "general", item.domain || "general");
    const key = [
      normalized.id || "",
      normalized.source || "",
      normalized.dataset || "",
      normalized.title || "",
      normalized.summary || ""
    ].join("::");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out;
}

function _sortEvidence(items = []) {
  return _safeArray(items)
    .slice()
    .sort((a, b) => {
      const scoreDelta = (Number(b.score) || 0) - (Number(a.score) || 0);
      if (scoreDelta !== 0) return scoreDelta;
      return (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
    });
}

function _mergeEvidence({ emotion, psychology, domainEvidence, datasetEvidence, memoryEvidence, generalEvidence }) {
  const mergedDomainEvidence = _dedupeEvidence([
    ..._safeArray(domainEvidence),
    ..._safeArray(psychology.evidenceMatches)
  ]);

  const mergedDatasetEvidence = _dedupeEvidence([
    ..._safeArray(datasetEvidence),
    ..._safeArray(emotion.evidenceMatches)
  ]);

  const mergedMemoryEvidence = _dedupeEvidence(_safeArray(memoryEvidence));
  const mergedGeneralEvidence = _dedupeEvidence(_safeArray(generalEvidence));

  return {
    domainEvidence: _sortEvidence(mergedDomainEvidence),
    datasetEvidence: _sortEvidence(mergedDatasetEvidence),
    memoryEvidence: _sortEvidence(mergedMemoryEvidence),
    generalEvidence: _sortEvidence(mergedGeneralEvidence)
  };
}

function _normalizePreviousMemory(previousMemory = {}) {
  const memory = _safeObj(previousMemory);
  const emotion = _safeObj(memory.emotion);
  const persistent = _safeObj(memory.persistent);
  const transient = _safeObj(memory.transient);

  return {
    ...memory,
    lastQuery: _trim(memory.lastQuery),
    domain: _trim(memory.domain || persistent.domain) || "general",
    intent: _trim(memory.intent || persistent.intent) || "general",
    emotion: {
      primaryEmotion: _trim(emotion.primaryEmotion) || "neutral",
      intensity: Number.isFinite(emotion.intensity) ? emotion.intensity : 0
    },
    persistent,
    transient
  };
}

async function _retrieveDomainEvidence({ userQuery, domain, conversationState }) {
  const domainFn = _pickRetrieverFn(DomainRetriever, "retrieveDomain");
  if (!domainFn) return [];

  return Promise.resolve(
    domainFn({
      query: userQuery,
      text: userQuery,
      userQuery,
      domain,
      conversationState
    })
  );
}

async function _retrieveDatasetEvidence({ userQuery, domain, datasets, conversationState, emotion, psychology }) {
  const datasetFn = _pickRetrieverFn(DatasetRetriever, "retrieveDataset");
  if (!datasetFn) return [];

  return Promise.resolve(
    datasetFn({
      query: userQuery,
      text: userQuery,
      userQuery,
      domain,
      datasets,
      conversationState,
      emotion,
      psychology
    })
  );
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

  const resolvedDomainEvidence = _safeArray(input.domainEvidence).length
    ? _safeArray(input.domainEvidence)
    : await _retrieveDomainEvidence({
        userQuery,
        domain,
        conversationState
      });

  const resolvedDatasetEvidence = _safeArray(input.datasetEvidence).length
    ? _safeArray(input.datasetEvidence)
    : await _retrieveDatasetEvidence({
        userQuery,
        domain,
        datasets,
        conversationState,
        emotion,
        psychology
      });

  const mergedEvidence = _mergeEvidence({
    emotion,
    psychology,
    domainEvidence: resolvedDomainEvidence,
    datasetEvidence: resolvedDatasetEvidence,
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
      inferredIntent: intent,
      layer2EvidenceCounts: {
        domainEvidence: mergedEvidence.domainEvidence.length,
        datasetEvidence: mergedEvidence.datasetEvidence.length,
        memoryEvidence: mergedEvidence.memoryEvidence.length,
        generalEvidence: mergedEvidence.generalEvidence.length
      }
    }
  };
}

async function processWithMarion(input = {}) {
  const previousMemory = _normalizePreviousMemory(input.previousMemory || {});
  const layer2Bundle = await retrieveLayer2Signals(input);

  const layer3 = await runLayer3(layer2Bundle);

  const layer4 = await runLayer4({
    fusionPacket: layer3.fusionPacket,
    answerPlan: layer3.answerPlan
  });

  const layer5 = await runLayer5({
    userQuery: layer2Bundle.userQuery,
    fusionPacket: layer3.fusionPacket,
    assembledResponse: layer4.assembledResponse,
    previousMemory
  });

  return {
    ok: true,
    intent: layer2Bundle.intent,
    domain: layer2Bundle.domain,
    userQuery: layer2Bundle.userQuery,

    marionPacket: layer3.fusionPacket,
    answerPlan: layer3.answerPlan,

    assembledResponse: layer4.assembledResponse,
    nyxOutput: layer4.nyxOutput,

    continuityState: layer5.continuityState,
    extractedSignals: layer5.extractedSignals,
    persistence: layer5.persistence,
    emotionalContinuity: layer5.emotionalContinuity,
    domainContinuity: layer5.domainContinuity,
    topicThread: layer5.topicThread,
    resetGuard: layer5.resetGuard,
    turnMemory: layer5.turnMemory,

    layer2: {
      emotion: layer2Bundle.emotion,
      psychology: layer2Bundle.psychology,
      diagnostics: layer2Bundle.diagnostics
    },

    layer3: {
      diagnostics: _safeObj(layer3.fusionPacket && layer3.fusionPacket.diagnostics),
      weights: _safeObj(layer3.fusionPacket && layer3.fusionPacket.weights)
    },

    layer4: {
      mode: _safeObj(layer4.assembledResponse && layer4.assembledResponse.responseMode).mode || "balanced",
      safety: _safeObj(layer4.assembledResponse && layer4.assembledResponse.safetyEnvelope),
      outputMetadata: _safeObj(layer4.nyxOutput && layer4.nyxOutput.metadata)
    },

    layer5: {
      continuityState: _safeObj(layer5.continuityState),
      resetGuard: _safeObj(layer5.resetGuard),
      topicThread: _safeObj(layer5.topicThread),
      turnMemoryMeta: {
        updatedAt: _safeObj(layer5.turnMemory).updatedAt || Date.now()
      }
    }
  };
}

module.exports = {
  retrieveLayer2Signals,
  processWithMarion
};
