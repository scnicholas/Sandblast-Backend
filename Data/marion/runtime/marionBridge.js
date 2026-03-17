// runtime/marionBridge.js
"use strict";

const EmotionRetriever = require("./emotionRetriever");
const PsychologyRetriever = require("./psychologyRetriever");
const DomainRetriever = require("./domainRetriever");
const DatasetRetriever = require("./datasetRetriever");
const { runLayer3 } = require("./layer3");
const { runLayer4 } = require("./layer4");
const { runLayer5 } = require("./layer5");

const FALLBACK_REPLY = "I’m here with you. Let’s keep going together.";
const FALLBACK_STATUS_REPLY = "I’m keeping this stable while I finish the handoff, and I can stay with the request without dropping out.";

function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _trim(v) { return v == null ? "" : String(v).trim(); }
function _lower(v) { return _trim(v).toLowerCase(); }
function _clamp(n, min = 0, max = 1) { return Math.max(min, Math.min(max, Number.isFinite(Number(n)) ? Number(n) : min)); }

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
  if (/(debug|fix|repair|stability|loop|retry|runtime|bridge)/.test(q)) return "debug";

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
      ? Math.max(0, Math.min(1, legacyIntensity > 1 ? legacyIntensity / 10 : legacyIntensity))
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
    intensity: _clamp(intensity || 0),
    valence: Math.max(-1, Math.min(1, Number(valence) || 0)),
    needs: _safeArray(result.needs),
    cues: _safeArray(result.cues),
    confidence: _clamp(Number(result.confidence) || 0),
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
    confidence: _clamp(Number(result.confidence) || 0),
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

  return {
    domainEvidence: _sortEvidence(mergedDomainEvidence),
    datasetEvidence: _sortEvidence(mergedDatasetEvidence),
    memoryEvidence: _sortEvidence(_dedupeEvidence(_safeArray(memoryEvidence))),
    generalEvidence: _sortEvidence(_dedupeEvidence(_safeArray(generalEvidence)))
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
    transient,
    fallbackStreak: Number(memory.fallbackStreak || 0),
    repeatQueryStreak: Number(memory.repeatQueryStreak || 0),
    continuityHealth: _trim(memory.continuityHealth) || "watch",
    recoveryMode: _trim(memory.recoveryMode) || "normal"
  };
}

function _buildPreLayer4TurnMemory(previousMemory = {}, layer2Bundle = {}, fusionPacket = {}) {
  const previous = _normalizePreviousMemory(previousMemory);
  const emotion = _safeObj(fusionPacket.emotion);
  const currentQuery = _trim(layer2Bundle.userQuery);
  const normalizedCurrent = _lower(currentQuery).replace(/\s+/g, " ").trim();
  const normalizedPrevious = _lower(previous.lastQuery).replace(/\s+/g, " ").trim();
  const repeatedQuery = !!normalizedCurrent && normalizedCurrent === normalizedPrevious;
  const repeatQueryStreak = repeatedQuery ? Number(previous.repeatQueryStreak || 0) + 1 : 0;

  return {
    ...previous,
    lastQuery: currentQuery,
    domain: layer2Bundle.domain || previous.domain || "general",
    intent: layer2Bundle.intent || previous.intent || "general",
    emotion: {
      primaryEmotion: _trim(emotion.primaryEmotion) || previous.emotion.primaryEmotion || "neutral",
      intensity: Number.isFinite(emotion.intensity) ? emotion.intensity : previous.emotion.intensity || 0
    },
    repeatQueryStreak,
    fallbackStreak: Number(previous.fallbackStreak || 0),
    continuityHealth: _trim(previous.continuityHealth) || "watch",
    recoveryMode:
      repeatQueryStreak >= 2 || Number(previous.fallbackStreak || 0) >= 2
        ? "guided-recovery"
        : (_trim(previous.recoveryMode) || "normal")
  };
}

function _safeNarrativeText(nyxOutput = {}, assembledResponse = {}) {
  const narrative = _safeObj(nyxOutput.narrative);
  const domainResponse = _safeObj(assembledResponse.domainResponse);
  const fallbackResponse = _safeObj(assembledResponse.fallbackResponse);

  const candidates = [
    _trim(narrative.opening),
    _trim(domainResponse.openingStrategy),
    _trim(fallbackResponse.opening),
    _trim(fallbackResponse.nextMove)
  ].filter(Boolean);

  return candidates.length ? candidates.join(" ") : FALLBACK_REPLY;
}

function _buildCompatibilityChips(nyxOutput = {}, assembledResponse = {}, fusionPacket = {}) {
  const chips = [];
  const evidence = _safeArray(_safeObj(nyxOutput.narrative).evidence);
  const reasoning = _safeArray(_safeObj(nyxOutput.narrative).reasoning);
  const domain = _trim(fusionPacket.domain || assembledResponse.domain || "general");
  const recoveryMode = _trim(_safeObj(_safeObj(nyxOutput).metadata).recoveryMode);

  if (recoveryMode === "guided-recovery") {
    chips.push("Stay focused", "Next step");
  } else if (domain === "psychology") {
    chips.push("Keep talking", "What happened?");
  } else if (domain === "finance") {
    chips.push("Risk view", "Break it down");
  } else if (domain === "law") {
    chips.push("What applies?", "Key risk");
  } else {
    chips.push("Tell me more", "Break it down");
  }

  if (evidence.length) chips.push("Evidence");
  if (reasoning.length) chips.push("Next step");

  return [...new Set(chips)].slice(0, 4);
}

function _buildCompatibilityPayload({
  layer2Bundle = {},
  fusionPacket = {},
  answerPlan = {},
  assembledResponse = {},
  nyxOutput = {},
  turnMemory = {},
  partial = false,
  status = "ok",
  error = null
} = {}) {
  const replyText = _safeNarrativeText(nyxOutput, assembledResponse);
  const chips = _buildCompatibilityChips(nyxOutput, assembledResponse, fusionPacket);
  const mode =
    _trim(_safeObj(_safeObj(assembledResponse).responseMode).mode) ||
    _trim(_safeObj(nyxOutput.metadata).mode) ||
    "balanced";

  return {
    ok: !error,
    partial,
    status,
    reply: replyText,
    text: replyText,
    message: replyText,
    output: replyText,
    answer: replyText,
    ui: {
      text: replyText,
      chips,
      mode,
      domain: fusionPacket.domain || layer2Bundle.domain || "general",
      intent: fusionPacket.intent || layer2Bundle.intent || "general"
    },
    marionPacket: fusionPacket,
    answerPlan,
    assembledResponse,
    nyxOutput,
    turnMemory,
    meta: {
      mode,
      domain: fusionPacket.domain || layer2Bundle.domain || "general",
      intent: fusionPacket.intent || layer2Bundle.intent || "general",
      partial,
      status,
      error: error ? String(error.message || error) : null
    }
  };
}

function _buildSafeLayer4Fallback({ layer2Bundle = {}, layer3 = {}, turnMemory = {} } = {}) {
  const fusionPacket = _safeObj(layer3.fusionPacket);
  const domain = fusionPacket.domain || layer2Bundle.domain || "general";
  const intent = fusionPacket.intent || layer2Bundle.intent || "general";
  const emotion = _safeObj(fusionPacket.emotion);
  const primaryEmotion = _trim(emotion.primaryEmotion) || "neutral";
  const recoveryMode = _trim(turnMemory.recoveryMode) || "normal";

  const opening =
    primaryEmotion !== "neutral"
      ? `I can hear some ${primaryEmotion} in this, and I’m staying with you.`
      : "I’m here, and I can stay with this clearly.";

  const assembledResponse = {
    ok: true,
    partial: true,
    status: "degraded-but-usable",
    domain,
    intent,
    responseMode: {
      mode: recoveryMode === "guided-recovery" ? "recovery" : (intent === "support" ? "supportive" : "balanced")
    },
    toneEnvelope: {
      warmth: 0.7,
      precision: 0.76,
      directness: 0.66,
      directives: [
        "Stay calm and clear.",
        "Avoid repetitive fallback phrasing."
      ],
      forbidden: ["generic filler"]
    },
    domainResponse: {
      openingStrategy: opening,
      reasoningSteps: [
        "Answer directly.",
        "Preserve continuity.",
        "Avoid overclaiming."
      ],
      toneDirectives: [
        "Keep the response stable and human.",
        "Reduce repetition under degraded conditions."
      ],
      evidenceLines: [],
      recoveryNotes: recoveryMode === "guided-recovery"
        ? ["Break repetition and give one grounded next move."]
        : []
    },
    safetyEnvelope: {
      checks: ["Preserve stability.", "Do not drop continuity."],
      warnings: ["Layer 4 fallback active."],
      safeToElaborate: true,
      forbidden: ["repetitive fallback language"],
      recoveryMode
    },
    fallbackResponse: {
      fallback: true,
      opening,
      posture: recoveryMode === "guided-recovery" ? "guided-recovery" : "balanced",
      nextMove: recoveryMode === "guided-recovery"
        ? "Continue with one stable next step."
        : "Continue with the request in a stable way.",
      recoveryMode
    },
    sourcePacket: {
      emotion,
      psychology: _safeObj(fusionPacket.psychology),
      evidence: _safeArray(fusionPacket.evidence),
      weights: _safeObj(fusionPacket.weights),
      diagnostics: _safeObj(fusionPacket.diagnostics)
    },
    meta: {
      evidenceKept: _safeArray(fusionPacket.evidence).length,
      lowEvidence: _safeArray(fusionPacket.evidence).length < 2,
      thinReasoning: false,
      recoveryMode,
      fallbackStreak: Number(turnMemory.fallbackStreak || 0),
      repeatQueryStreak: Number(turnMemory.repeatQueryStreak || 0),
      continuityHealth: _trim(turnMemory.continuityHealth) || "watch"
    }
  };

  const nyxOutput = {
    ok: true,
    channel: "nyx",
    partial: true,
    status: "degraded-but-usable",
    voiceDirectives: {
      warmth: 0.7,
      precision: 0.76,
      directness: 0.66
    },
    narrative: {
      mode: assembledResponse.responseMode.mode,
      domain,
      opening,
      reasoning: assembledResponse.domainResponse.reasoningSteps,
      tone: assembledResponse.toneEnvelope.directives,
      evidence: [],
      fallback: assembledResponse.fallbackResponse,
      recoveryNotes: assembledResponse.domainResponse.recoveryNotes
    },
    safety: assembledResponse.safetyEnvelope,
    metadata: {
      domain,
      intent,
      mode: assembledResponse.responseMode.mode,
      recoveryMode,
      continuityHealth: _trim(turnMemory.continuityHealth) || "watch",
      fallbackStreak: Number(turnMemory.fallbackStreak || 0),
      repeatQueryStreak: Number(turnMemory.repeatQueryStreak || 0),
      lowEvidence: true
    }
  };

  return {
    assembledResponse,
    nyxOutput
  };
}

async function _retrieveDomainEvidence({ userQuery, domain, conversationState }) {
  const domainFn = _pickRetrieverFn(DomainRetriever, "retrieveDomain");
  if (!domainFn) return [];

  return Promise.resolve(domainFn({
    query: userQuery,
    text: userQuery,
    userQuery,
    domain,
    conversationState
  }));
}

async function _retrieveDatasetEvidence({ userQuery, domain, datasets, conversationState, emotion, psychology }) {
  const datasetFn = _pickRetrieverFn(DatasetRetriever, "retrieveDataset");
  if (!datasetFn) return [];

  return Promise.resolve(datasetFn({
    query: userQuery,
    text: userQuery,
    userQuery,
    domain,
    datasets,
    conversationState,
    emotion,
    psychology
  }));
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

  if (!emotionFn) throw new Error("Emotion retriever is missing a callable export.");
  if (!psychologyFn) throw new Error("Psychology retriever is missing a callable export.");

  const rawEmotion = await Promise.resolve(emotionFn({
    text: userQuery,
    query: userQuery,
    userText: userQuery,
    conversationState,
    domain,
    datasets
  }));

  const emotion = _normalizeEmotionResult(rawEmotion);

  const rawPsychology = await Promise.resolve(psychologyFn({
    text: userQuery,
    query: userQuery,
    userText: userQuery,
    conversationState,
    domain,
    datasets,
    emotion,
    supportFlags: emotion.supportFlags
  }));

  const psychology = _normalizePsychologyResult(rawPsychology, emotion);

  const resolvedDomainEvidence = _safeArray(input.domainEvidence).length
    ? _safeArray(input.domainEvidence)
    : await _retrieveDomainEvidence({ userQuery, domain, conversationState });

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
  let layer2Bundle = null;
  let layer3 = null;
  let layer4 = null;
  let layer5 = null;
  let preLayer4TurnMemory = null;

  try {
    layer2Bundle = await retrieveLayer2Signals(input);
    layer3 = await runLayer3(layer2Bundle);

    preLayer4TurnMemory = _buildPreLayer4TurnMemory(previousMemory, layer2Bundle, _safeObj(layer3.fusionPacket));

    try {
      layer4 = await runLayer4({
        fusionPacket: _safeObj(layer3.fusionPacket),
        answerPlan: _safeObj(layer3.answerPlan),
        continuityState: {
          activeQuery: layer2Bundle.userQuery,
          activeDomain: layer2Bundle.domain,
          activeIntent: layer2Bundle.intent,
          activeEmotion: _trim(_safeObj(_safeObj(layer3.fusionPacket).emotion).primaryEmotion) || "neutral",
          emotionalIntensity: Number(_safeObj(_safeObj(layer3.fusionPacket).emotion).intensity) || 0,
          continuityHealth: preLayer4TurnMemory.continuityHealth || "watch",
          recoveryMode: preLayer4TurnMemory.recoveryMode || "normal"
        },
        turnMemory: preLayer4TurnMemory
      });
    } catch (layer4Error) {
      layer4 = _buildSafeLayer4Fallback({
        layer2Bundle,
        layer3,
        turnMemory: preLayer4TurnMemory
      });
      layer4.error = layer4Error;
    }

    try {
      layer5 = await runLayer5({
        userQuery: layer2Bundle.userQuery,
        fusionPacket: _safeObj(layer3.fusionPacket),
        assembledResponse: _safeObj(layer4.assembledResponse),
        previousMemory
      });
    } catch (layer5Error) {
      layer5 = {
        continuityState: {
          activeQuery: layer2Bundle.userQuery,
          activeDomain: layer2Bundle.domain,
          activeIntent: layer2Bundle.intent,
          activeEmotion: _trim(_safeObj(_safeObj(layer3.fusionPacket).emotion).primaryEmotion) || "neutral",
          emotionalIntensity: Number(_safeObj(_safeObj(layer3.fusionPacket).emotion).intensity) || 0,
          psychologyRisks: _safeArray(_safeObj(_safeObj(layer3.fusionPacket).psychology).risks),
          responseMode: _trim(_safeObj(_safeObj(layer4.assembledResponse).responseMode).mode) || "balanced",
          continuityHealth: preLayer4TurnMemory.continuityHealth || "watch",
          recoveryMode: preLayer4TurnMemory.recoveryMode || "normal",
          timestamp: Date.now()
        },
        extractedSignals: {},
        persistence: {},
        emotionalContinuity: {},
        domainContinuity: {},
        topicThread: {},
        resetGuard: {
          shouldSuppressHardReset: true,
          shouldForceRecoveryMode: preLayer4TurnMemory.recoveryMode === "guided-recovery",
          flags: ["layer5-fallback"]
        },
        turnMemory: {
          ...preLayer4TurnMemory,
          updatedAt: Date.now()
        },
        error: layer5Error
      };
    }

    const shouldRerunLayer4 =
      !layer4.error &&
      _trim(_safeObj(_safeObj(layer4.nyxOutput).metadata).recoveryMode) !== _trim(_safeObj(layer5.turnMemory).recoveryMode);

    if (shouldRerunLayer4) {
      try {
        layer4 = await runLayer4({
          fusionPacket: _safeObj(layer3.fusionPacket),
          answerPlan: _safeObj(layer3.answerPlan),
          continuityState: _safeObj(layer5.continuityState),
          turnMemory: _safeObj(layer5.turnMemory)
        });
      } catch (layer4RerunError) {
        layer4 = _buildSafeLayer4Fallback({
          layer2Bundle,
          layer3,
          turnMemory: _safeObj(layer5.turnMemory)
        });
        layer4.error = layer4RerunError;
      }
    }

    const compatibility = _buildCompatibilityPayload({
      layer2Bundle,
      fusionPacket: _safeObj(layer3.fusionPacket),
      answerPlan: _safeObj(layer3.answerPlan),
      assembledResponse: _safeObj(layer4.assembledResponse),
      nyxOutput: _safeObj(layer4.nyxOutput),
      turnMemory: _safeObj(layer5.turnMemory),
      partial: !!(layer4.error || layer5.error || _safeObj(layer4.assembledResponse).partial),
      status: layer4.error || layer5.error ? "partial" : (_safeObj(layer4.assembledResponse).status || "ok"),
      error: layer4.error || layer5.error || null
    });

    return {
      ok: true,
      partial: compatibility.partial,
      status: compatibility.status,
      reply: compatibility.reply,
      text: compatibility.text,
      message: compatibility.message,
      output: compatibility.output,
      answer: compatibility.answer,
      ui: compatibility.ui,
      meta: compatibility.meta,
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
        mode: _trim(_safeObj(_safeObj(layer4.assembledResponse).responseMode).mode) || "balanced",
        safety: _safeObj(_safeObj(layer4.assembledResponse).safetyEnvelope),
        outputMetadata: _safeObj(_safeObj(layer4.nyxOutput).metadata),
        fallbackUsed: !!layer4.error,
        error: layer4.error ? String(layer4.error.message || layer4.error) : null
      },
      layer5: {
        continuityState: _safeObj(layer5.continuityState),
        resetGuard: _safeObj(layer5.resetGuard),
        topicThread: _safeObj(layer5.topicThread),
        fallbackUsed: !!layer5.error,
        error: layer5.error ? String(layer5.error.message || layer5.error) : null,
        turnMemoryMeta: {
          updatedAt: _safeObj(layer5.turnMemory).updatedAt || Date.now()
        }
      }
    };
  } catch (error) {
    const userQuery = _trim(input.userQuery || input.query || input.text);
    const inferredDomain = _inferDomain(userQuery, _trim(input.requestedDomain || input.domain));
    const inferredIntent = _inferIntent(userQuery);
    const safeReply = FALLBACK_STATUS_REPLY;

    return {
      ok: false,
      partial: true,
      status: "degraded",
      reply: safeReply,
      text: safeReply,
      message: safeReply,
      output: safeReply,
      answer: safeReply,
      ui: {
        text: safeReply,
        chips: ["Keep talking", "What happened?"],
        mode: "stabilizing",
        domain: inferredDomain,
        intent: inferredIntent
      },
      meta: {
        mode: "stabilizing",
        domain: inferredDomain,
        intent: inferredIntent,
        partial: true,
        status: "degraded",
        error: String(error.message || error)
      },
      intent: inferredIntent,
      domain: inferredDomain,
      userQuery,
      marionPacket: {},
      answerPlan: {},
      assembledResponse: {},
      nyxOutput: {},
      continuityState: {},
      extractedSignals: {},
      persistence: {},
      emotionalContinuity: {},
      domainContinuity: {},
      topicThread: {},
      resetGuard: {
        shouldSuppressHardReset: true,
        flags: ["bridge-degraded"]
      },
      turnMemory: {
        lastQuery: userQuery,
        domain: inferredDomain,
        intent: inferredIntent,
        emotion: {
          primaryEmotion: "neutral",
          intensity: 0
        },
        continuityHealth: "fragile",
        recoveryMode: "guided-recovery",
        updatedAt: Date.now()
      },
      layer2: { emotion: {}, psychology: {}, diagnostics: {} },
      layer3: { diagnostics: {}, weights: {} },
      layer4: {
        mode: "stabilizing",
        safety: {},
        outputMetadata: {},
        fallbackUsed: true,
        error: String(error.message || error)
      },
      layer5: {
        continuityState: {},
        resetGuard: {
          shouldSuppressHardReset: true,
          flags: ["bridge-degraded"]
        },
        topicThread: {},
        fallbackUsed: true,
        error: String(error.message || error),
        turnMemoryMeta: { updatedAt: Date.now() }
      }
    };
  }
}

module.exports = {
  retrieveLayer2Signals,
  processWithMarion
};
