const fs = require("fs");
const path = require("path");

const baseLabels = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../emotion/base_labels.json"), "utf8")
);
const conversationPatterns = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../emotion/conversation_patterns.json"), "utf8")
);

function detectEmotion(userText = "") {
  const text = userText.toLowerCase();

  let primary = "neutral";
  let secondary = null;
  let confidence = 0.45;
  let intensity = 0.3;

  for (const pattern of conversationPatterns.patterns) {
    if (pattern.match_type === "contains") {
      const matched = pattern.phrases.some((phrase) => text.includes(phrase));
      if (matched) {
        primary = pattern.emotion_bias;
        secondary = pattern.nuance_bias || null;
        confidence = 0.83;
        intensity = 0.69;
        break;
      }
    }
  }

  if (text.includes("angry") || text.includes("mad") || text.includes("pissed")) {
    primary = "anger";
    confidence = 0.8;
    intensity = 0.72;
  } else if (text.includes("sad") || text.includes("alone") || text.includes("hurt")) {
    primary = "sadness";
    confidence = 0.8;
    intensity = 0.68;
  } else if (text.includes("scared") || text.includes("worried") || text.includes("anxious")) {
    primary = "fear";
    confidence = 0.81;
    intensity = 0.7;
  } else if (text.includes("happy") || text.includes("relieved") || text.includes("excited")) {
    primary = "joy";
    confidence = 0.78;
    intensity = 0.62;
  }

  if (!baseLabels.primary_emotions.includes(primary)) {
    primary = "neutral";
  }

  return {
    primary,
    secondary,
    confidence,
    intensity
  };
}

module.exports = {
  detectEmotion
};