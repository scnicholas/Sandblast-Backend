const fs = require("fs");
const path = require("path");

const supportStrategies = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../psychology/support_strategies.json"), "utf8")
);

function selectSupportMode(psychology) {
  const strategy =
    supportStrategies.strategies[psychology.care_mode] ||
    supportStrategies.strategies["validation_first"];

  return {
    tone: strategy.tone,
    followup: strategy.followup,
    advice_level: strategy.advice_level
  };
}

module.exports = {
  selectSupportMode
};