"use strict";

class FinanceDisclosureGuard {
  constructor(config = {}) {
    this.config = config;
    this.disclosureCategories = config.disclosureCategories || {};
  }

  evaluate(payload = {}) {
    const applicabilityText = this._collectApplicabilityText(payload);
    const responseText = this._collectResponseText(payload);
    const disclosureFlags = [];

    for (const [category, rule] of Object.entries(this.disclosureCategories)) {
      if (!this._categoryApplies(category, applicabilityText)) continue;

      const required = Array.isArray(rule.required) ? rule.required : [];
      const missing = required.filter(key => !this._hasDisclosure(responseText, key));

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

  _collectApplicabilityText(payload) {
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

  _collectResponseText(payload) {
    return [
      payload.sanitizedResponse,
      payload.response,
      payload.answer
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  _categoryApplies(category, text) {
    const map = {
      general_financial_information: [
        "finance",
        "financial",
        "money",
        "budget",
        "capital"
      ],
      investment_discussion: [
        "stock",
        "portfolio",
        "invest",
        "investment",
        "security",
        "securities",
        "etf",
        "bond",
        "crypto",
        "return",
        "yield"
      ],
      tax_discussion: [
        "tax",
        "cra",
        "irs",
        "deduction",
        "write off",
        "write-off",
        "capital gains"
      ],
      legal_or_regulatory_discussion: [
        "legal",
        "regulatory",
        "securities law",
        "fiduciary",
        "prospectus"
      ],
      forecast_or_projection: [
        "forecast",
        "projection",
        "valuation",
        "expected",
        "scenario",
        "growth"
      ]
    };

    return (map[category] || []).some(term => text.includes(term));
  }

  _hasDisclosure(text, key) {
    const disclosureSignals = {
      generalInformationOnly: [
        "general information",
        "general financial information"
      ],

      notFinancialAdvice: [
        "not financial advice",
        "not personalized financial advice",
        "general financial information, not personalized financial advice"
      ],

      notTaxAdvice: [
        "not tax advice"
      ],

      notLegalAdvice: [
        "not legal advice"
      ],

      consultQualifiedProfessional: [
        "qualified professional",
        "financial advisor",
        "tax professional",
        "legal professional",
        "advisor specific to your situation",
        "professional for advice specific to your situation",
        "for advice specific to your situation"
      ],

      riskMayVary: [
        "risk tolerance",
        "personal circumstances",
        "risk may vary",
        "timing",
        "liquidity needs"
      ],

      doOwnResearch: [
        "verify",
        "do your own research",
        "authoritative sources",
        "current authoritative sources",
        "current, authoritative sources"
      ],

      projectionUncertain: [
        "forecasts and projections are uncertain",
        "forecast is uncertain",
        "projection is uncertain",
        "projections are uncertain",
        "forecasts are uncertain",
        "uncertain forecast",
        "uncertain projection",
        "not a certainty",
        "may not occur"
      ],

      assumptionsMatter: [
        "assumption",
        "assumptions",
        "depends on",
        "depends upon",
        "based on the assumptions"
      ],

      noGuaranteedOutcome: [
        "not guaranteed",
        "no guarantee",
        "no guaranteed",
        "no return is guaranteed",
        "no returns are guaranteed",
        "no market outcome is guaranteed",
        "no outcome is guaranteed",
        "no return, approval, funding, or market outcome is guaranteed"
      ],

      jurisdictionMayMatter: [
        "jurisdiction",
        "rules may vary",
        "varies by jurisdiction",
        "jurisdiction may matter"
      ]
    };

    return (disclosureSignals[key] || [key.toLowerCase()]).some(signal =>
      text.includes(signal)
    );
  }
}

module.exports = FinanceDisclosureGuard;
