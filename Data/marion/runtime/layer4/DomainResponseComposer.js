"use strict";

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeText(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function uniqueStrings(values) {
  return [...new Set(normalizeArray(values).map(normalizeText).filter(Boolean))];
}

function buildDomainFrame(domain = "general") {
  switch (domain) {
    case "psychology":
      return {
        opening: "acknowledge-state",
        middle: "supportive-interpretation",
        close: "grounded-next-step",
        evidenceStyle: "human-signal-first",
        pacing: "calm"
      };
    case "finance":
      return {
        opening: "direct-conclusion",
        middle: "risk-logic-and-evidence",
        close: "decision-frame",
        evidenceStyle: "material-risk-first",
        pacing: "tight"
      };
    case "law":
      return {
        opening: "qualified-answer",
        middle: "rule-application",
        close: "risk-qualified-next-step",
        evidenceStyle: "qualified-application",
        pacing: "disciplined"
      };
    case "english":
      return {
        opening: "clear-thesis",
        middle: "supporting-analysis",
        close: "refined-summary",
        evidenceStyle: "textual-support",
        pacing: "measured"
      };
    case "cybersecurity":
      return {
        opening: "risk-callout",
        middle: "technical-assessment",
        close: "defensive-action",
        evidenceStyle: "threat-signal-first",
        pacing: "urgent-but-controlled"
      };
    case "marketing":
      return {
        opening: "positioning-statement",
        middle: "audience-and-message-logic",
        close: "execution-suggestion",
        evidenceStyle: "audience-impact-first",
        pacing: "forward"
      };
    case "strategy":
    case "ai":
      return {
        opening: "operating-thesis",
        middle: "tradeoff-analysis",
        close: "execution-path",
        evidenceStyle: "system-signal-first",
        pacing: "forward-disciplined"
      };
    default:
      return {
        opening: "direct-answer",
        middle: "supporting-reasoning",
        close: "clear-wrap-up",
        evidenceStyle: "clarity-first",
        pacing: "balanced"
      };
  }
}

function buildEmotionLens(fusionPacket = {}, responseMode = {}) {
  const emotion = fusionPacket.emotion || {};
  const psychology = fusionPacket.psychology || {};
  const stateDrift = emotion.stateDrift || {};
  const blendProfile = emotion.blendProfile || {};
  const suppressionSignals = uniqueStrings(emotion.suppressionSignals || psychology.suppressionSignals || []);
  const primaryEmotion = normalizeText(emotion.primaryEmotion || "neutral") || "neutral";
  const intensity = clampScore(emotion.intensity || 0);
  const posture = responseMode.mode || "balanced";

  return {
    primaryEmotion,
    intensity,
    posture,
    stateDrift: {
      previousEmotion: normalizeText(stateDrift.previousEmotion || "") || null,
      currentEmotion: normalizeText(stateDrift.currentEmotion || primaryEmotion) || primaryEmotion,
      trend: normalizeText(stateDrift.trend || "steady") || "steady",
      volatility: clampScore(stateDrift.volatility || 0),
      stability: clampScore(stateDrift.stability == null ? 0.5 : stateDrift.stability)
    },
    blendProfile: {
      dominantAxis: normalizeText(blendProfile.dominantAxis || primaryEmotion) || primaryEmotion,
      components: Array.isArray(blendProfile.components)
        ? blendProfile.components.map((item) => ({
            emotion: normalizeText(item && item.emotion),
            weight: clampScore(item && item.weight)
          })).filter((item) => item.emotion)
        : [],
      guardedness: clampScore(blendProfile.guardedness || 0)
    },
    suppressionSignals
  };
}

function composeEvidenceLines(evidence = [], domain = "general") {
  return normalizeArray(evidence).slice(0, 5).map((item, idx) => {
    const rawScore = item && (item.fusedScore ?? item.score ?? item.weight ?? 0);
    const fusedScore = clampScore(rawScore);
    return {
      rank: idx + 1,
      title: normalizeText(item && (item.title || `Evidence ${idx + 1}`)) || `Evidence ${idx + 1}`,
      summary: normalizeText(item && (item.summary || item.snippet || "")),
      source: normalizeText(item && item.source) || "general",
      domain: normalizeText(item && item.domain) || domain,
      fusedScore,
      relevanceLabel: fusedScore >= 0.8 ? "high" : fusedScore >= 0.55 ? "medium" : "supporting"
    };
  });
}

function buildGapSignals({ fusionPacket = {}, answerPlan = {}, responseMode = {} } = {}) {
  const diagnostics = fusionPacket.diagnostics || {};
  const evidenceCount = normalizeArray(fusionPacket.evidence).length;
  const reasoningSteps = normalizeArray(answerPlan.reasoningSteps);
  const toneDirectives = normalizeArray(answerPlan.toneDirectives);
  const emotion = fusionPacket.emotion || {};
  const suppressionSignals = uniqueStrings(emotion.suppressionSignals);

  return {
    lowEvidence: (diagnostics.evidenceKept || evidenceCount || 0) < 2,
    thinReasoning: reasoningSteps.length < 2,
    thinTonePlan: toneDirectives.length < 2,
    degradedMode: ["recovery", "stabilizing", "supportive-directive"].includes(responseMode.mode),
    suppressionActive: suppressionSignals.length > 0,
    driftActive: !!(emotion.stateDrift && normalizeText(emotion.stateDrift.trend) && normalizeText(emotion.stateDrift.trend) !== "steady")
  };
}

function buildRecoveryNotes({ gapSignals = {}, domain = "general", emotionLens = {} } = {}) {
  const notes = [];

  if (gapSignals.lowEvidence) {
    notes.push("Keep claims bounded to strongest available signal.");
  }
  if (gapSignals.thinReasoning) {
    notes.push("Compress reasoning into one clear chain, not scattered fragments.");
  }
  if (gapSignals.thinTonePlan) {
    notes.push("Anchor tone with steady pacing and direct phrasing.");
  }
  if (gapSignals.degradedMode) {
    notes.push(`Hold ${domain} framing steady while avoiding repetitive fallback phrasing.`);
  }
  if (gapSignals.suppressionActive) {
    notes.push("Do not overread guarded language; acknowledge gently and keep pressure low.");
  }
  if (gapSignals.driftActive) {
    notes.push(`Track emotional movement as ${emotionLens.stateDrift?.trend || "active"} rather than treating each turn as isolated.`);
  }

  return notes;
}

function buildNyxDirective({ fusionPacket = {}, answerPlan = {}, responseMode = {}, gapSignals = {}, emotionLens = {}, frame = {} } = {}) {
  const toneDirectives = uniqueStrings(answerPlan.toneDirectives || []);
  const careSequence = uniqueStrings(
    (fusionPacket.psychology && fusionPacket.psychology.careSequence) ||
    (fusionPacket.emotion && fusionPacket.emotion.careSequence) ||
    []
  );

  return {
    mode: responseMode.mode || "balanced",
    pacing: frame.pacing || "balanced",
    openingMove: frame.opening || "direct-answer",
    evidenceStyle: frame.evidenceStyle || "clarity-first",
    careSequence: careSequence.length ? careSequence : ["acknowledge", "answer", "steady-next-step"],
    suppressionAware: !!gapSignals.suppressionActive,
    driftAware: !!gapSignals.driftActive,
    primaryEmotion: emotionLens.primaryEmotion || "neutral",
    dominantAxis: emotionLens.blendProfile?.dominantAxis || emotionLens.primaryEmotion || "neutral",
    toneDirectives
  };
}

function composeDomainResponse({ fusionPacket = {}, answerPlan = {}, responseMode = {} } = {}) {
  const domain = normalizeText(fusionPacket.domain || answerPlan.domain || "general") || "general";
  const frame = buildDomainFrame(domain);
  const evidenceLines = composeEvidenceLines(fusionPacket.evidence || [], domain);
  const reasoningSteps = normalizeArray(answerPlan.reasoningSteps);
  const toneDirectives = normalizeArray(answerPlan.toneDirectives);
  const emotionLens = buildEmotionLens(fusionPacket, responseMode);
  const gapSignals = buildGapSignals({ fusionPacket, answerPlan, responseMode });

  return {
    domain,
    responseMode: responseMode.mode || "balanced",
    frame,
    openingStrategy: normalizeText(answerPlan.openingStrategy) || "Lead clearly and stay grounded.",
    reasoningSteps: reasoningSteps.length
      ? reasoningSteps
      : ["State the clearest conclusion supported by the strongest signal."],
    toneDirectives: toneDirectives.length
      ? toneDirectives
      : ["Keep the answer controlled, clear, and non-repetitive."],
    evidenceLines,
    evidenceStrength: evidenceLines.length >= 3 ? "strong" : evidenceLines.length >= 1 ? "limited" : "thin",
    emotionLens,
    recoveryNotes: buildRecoveryNotes({ gapSignals, domain, emotionLens }),
    nyxDirective: buildNyxDirective({ fusionPacket, answerPlan, responseMode, gapSignals, emotionLens, frame }),
    gapSignals
  };
}

module.exports = {
  composeDomainResponse,
  buildDomainFrame,
  buildEmotionLens
};
