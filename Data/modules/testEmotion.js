const { analyzeEmotionalState } = require("./emotionOrchestrator");

const result = analyzeEmotionalState(
  "I feel like nobody gets me anymore and I'm tired of pretending I'm okay."
);

console.log(JSON.stringify(result, null, 2));