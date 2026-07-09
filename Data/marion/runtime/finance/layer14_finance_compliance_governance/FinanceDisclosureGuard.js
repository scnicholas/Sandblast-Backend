"use strict";

class FinanceDisclosureGuard {
  constructor(config = {}) {
    this.config = config;
    this.disclosureCategories = config.disclosureCategories || {};
  }

  evaluate(payload = {}) {
    const text = this._collectText(payload);
    const disclosureFlags = [];

    for (const [category, rule] of Object.entries(this.disclosureCategories)) {
      if (!this._categoryApplies(category, text)) continue;

      const required = Array.isArray(rule.required) ? rule.required : [];
      const missing = required.filter(key => !this._hasDisclosure(text, key));

      if (missing.length) {
        disclosureFlags.push({
          category,
          severity: rule.severityIfMissing || "warn",
          missing
        });
      }
    }

    return {
      disclosureFlags,
      hasDisclosureHold: disclosureFlags.some(flag => flag.severity === "hold"),
      hasDisclosureWarning: disclosureFlags.some(flag => flag.severity === "warn")
    };
  }

  _collectText(payload) {
    return [
      payload.query,
      payload.answer,
      payload.response,
      payload.sanitizedResponse
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  _categoryApplies(category, text) {
    const map = {
      general_financial_information: ["finance", "financial", "money", "budget", "capital"],
      investment_discussion: ["stock", "portfolio", "invest", "security", "etf", "bond", "crypto"],
      tax_discussion: ["tax", "cra", "irs", "deduction", "write off", "capital gains"],
      legal_or_regulatory_discussion: ["legal", "regulatory", "securities law", "fiduciary", "prospectus"],
      forecast_or_projection: ["forecast", "projection", "valuation", "expected", "scenario", "growth"]
    };

    return (map[category] || []).some(term => text.includes(term));
  }

  _hasDisclosure(text, key) {
    const disclosureSignals = {
      generalInformationOnly: ["general information", "general financial information"],
      notFinancialAdvice: ["not financial advice", "not personalized financial advice"],
      notTaxAdvice: ["not tax advice"],
      notLegalAdvice: ["not legal advice"],
      consultQualifiedProfessional: ["qualified professional", "financial advisor", "tax professional", "legal professional"],
      riskMayVary: ["risk tolerance", "personal circumstances", "risk may vary"],
      doOwnResearch: ["verify", "do your own research", "authoritative sources"],
      projectionUncertain: ["projection", "forecast", "uncertain"],
      assumptionsMatter: ["assumption", "depends on"],
      noGuaranteedOutcome: ["not guaranteed", "no guarantee", "no guaranteed"],
      jurisdictionMayMatter: ["jurisdiction", "rules may vary"]
    };

    return (disclosureSignals[key] || [key.toLowerCase()]).some(signal => text.includes(signal));
  }
}

module.exports = FinanceDisclosureGuard;
