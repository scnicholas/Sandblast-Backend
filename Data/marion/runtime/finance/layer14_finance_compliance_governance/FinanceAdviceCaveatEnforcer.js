"use strict";

class FinanceAdviceCaveatEnforcer {
  constructor(config = {}) {
    this.config = config;
    this.caveatRules = config.caveatRules || {};
    this.phrases = config.phrases || {};
  }

  enforce(payload = {}) {
    const original = payload.answer || payload.response || "";
    const text = [payload.query, original].filter(Boolean).join(" ").toLowerCase();

    const missing = [];

    for (const [ruleName, rule] of Object.entries(this.caveatRules)) {
      const applies = (rule.requiredWhen || []).some(term => text.includes(String(term).toLowerCase()));
      if (!applies) continue;

      for (const caveatKey of rule.minimumCaveats || []) {
        if (!this._hasCaveat(original, caveatKey)) {
          missing.push({
            rule: ruleName,
            caveatKey
          });
        }
      }
    }

    const appended = this._appendMissingCaveats(original, missing);

    return {
      caveatStatus: missing.length ? "patched" : "complete",
      missingCaveats: missing,
      sanitizedResponse: appended
    };
  }

  _hasCaveat(answer, key) {
    const text = String(answer || "").toLowerCase();

    const signals = {
      notFinancialAdvice: ["not financial advice", "general financial information"],
      riskMayVary: ["risk tolerance", "personal circumstances", "risk may vary"],
      noGuaranteedOutcome: ["not guaranteed", "no guarantee"],
      approvalNotGuaranteed: ["approval is not guaranteed", "not guaranteed"],
      eligibilityDependsOnCriteria: ["eligibility depends", "depends on"],
      verifyProgramStatus: ["verify", "program terms", "deadline"],
      projectionUncertain: ["projection", "forecast", "uncertain"],
      assumptionsMatter: ["assumption", "depends on"]
    };

    return (signals[key] || [key.toLowerCase()]).some(signal => text.includes(signal));
  }

  _appendMissingCaveats(answer, missing) {
    if (!missing.length) return answer;

    const uniqueKeys = [...new Set(missing.map(item => item.caveatKey))];

    const phraseMap = {
      notFinancialAdvice: "This is general financial information, not personalized financial advice.",
      riskMayVary: "Financial outcomes depend on risk tolerance, timing, liquidity needs, and personal circumstances.",
      noGuaranteedOutcome: "No return, approval, funding, or market outcome is guaranteed.",
      approvalNotGuaranteed: "Approval is not guaranteed.",
      eligibilityDependsOnCriteria: "Eligibility depends on the program, lender, underwriting standard, and submitted documentation.",
      verifyProgramStatus: "Program terms, deadlines, and funding availability should be verified before submission.",
      projectionUncertain: "Forecasts and projections are uncertain.",
      assumptionsMatter: "The result depends on the assumptions used."
    };

    const caveatText = uniqueKeys
      .map(key => this.phrases[key] || phraseMap[key])
      .filter(Boolean)
      .join(" ");

    if (!caveatText) return answer;

    return `${answer}\n\n${caveatText}`;
  }
}

module.exports = FinanceAdviceCaveatEnforcer;
