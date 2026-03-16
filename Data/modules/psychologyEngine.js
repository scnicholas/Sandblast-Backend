const fs = require("fs");
const path = require("path");

const nuanceMap = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../emotion/nuance_map.json"), "utf8")
);
const affectInterpretation = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../psychology/affect_interpretation.json"), "utf8")
);
const attachmentPatterns = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../psychology/attachment_patterns.json"), "utf8")
);
const cognitiveDistortions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../psychology/cognitive_distortions.json"), "utf8")
);

function resolveNuance(emotion, userText = "") {
  const text = userText.toLowerCase();
  const nuanceEntry = nuanceMap[emotion.primary] || nuanceMap.neutral;

  let subtype = nuanceEntry.subtypes?.[0] || "unclear";
  let socialPattern = nuanceEntry.social_patterns?.[0] || "low_signal";
  const riskFlags = [...(nuanceEntry.risk_flags || [])];

  for (const pattern of attachmentPatterns.patterns) {
    const matched = pattern.signals.some((signal) => text.includes(signal));
    if (matched) {
      socialPattern = pattern.name;
      break;
    }
  }

  for (const distortion of cognitiveDistortions.distortions) {
    const matched = distortion.signals.some((signal) => text.includes(signal));
    if (matched && !riskFlags.includes(distortion.name)) {
      riskFlags.push(distortion.name);
    }
  }

  if (emotion.secondary) {
    subtype = emotion.secondary;
  }

  return {
    subtype,
    social_pattern: socialPattern,
    risk_flags: riskFlags
  };
}

function interpretPsychology(emotion, nuance) {
  const interpretationEntry =
    affectInterpretation.interpretations[nuance.subtype] ||
    affectInterpretation.interpretations["overwhelm"] || {
      meaning: "possible emotional activation",
      care_mode: "validation_first"
    };

  return {
    interpretation: interpretationEntry.meaning,
    care_mode: interpretationEntry.care_mode
  };
}

module.exports = {
  resolveNuance,
  interpretPsychology
};