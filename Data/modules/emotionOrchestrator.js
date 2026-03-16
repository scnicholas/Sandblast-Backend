const emotionEngine = require("./emotionEngine");
const psychologyEngine = require("./psychologyEngine");
const supportEngine = require("./supportEngine");
const rootGuard = require("./rootGuard");

function analyzeEmotionalState(userText = "") {
  const emotion = emotionEngine.detectEmotion(userText);
  const nuance = psychologyEngine.resolveNuance(emotion, userText);
  const psychology = psychologyEngine.interpretPsychology(emotion, nuance, userText);
  const support = supportEngine.selectSupportMode(psychology);
  const guard = rootGuard.checkGuard(userText, psychology, nuance);

  return {
    emotion,
    nuance,
    psychology,
    support,
    guard
  };
}

module.exports = {
  analyzeEmotionalState
};