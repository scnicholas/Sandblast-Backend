const fs = require("fs");
const path = require("path");

const crisisFlags = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../psychology/crisis_flags.json"), "utf8")
);
const traumaSensitivity = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../psychology/trauma_sensitivity.json"), "utf8")
);

function checkGuard(userText = "", psychology = {}, nuance = {}) {
  const text = userText.toLowerCase();

  let safeToContinue = true;
  let diagnosisBlock = true;
  let escalationNeeded = false;
  let detectedFlags = [];

  for (const flag of crisisFlags.flags) {
    const matched = flag.signals.some((signal) => text.includes(signal));
    if (matched) {
      detectedFlags.push(flag.name);
      if (flag.priority === "critical") {
        safeToContinue = false;
        escalationNeeded = true;
      }
    }
  }

  const traumaSignals = traumaSensitivity.guidelines.signals.some((signal) =>
    text.includes(signal)
  );

  if (traumaSignals && !detectedFlags.includes("trauma_sensitive")) {
    detectedFlags.push("trauma_sensitive");
  }

  return {
    diagnosis_block: diagnosisBlock,
    safe_to_continue: safeToContinue,
    escalation_needed: escalationNeeded,
    detected_flags: detectedFlags,
    trauma_sensitive: traumaSignals,
    risk_flags: nuance.risk_flags || []
  };
}

module.exports = {
  checkGuard
};