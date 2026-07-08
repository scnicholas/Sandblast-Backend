"use strict";

/**
 * R18D Layer 09 — Finance Response Tone Guard
 * Detects and softens overconfident, advisory, or guarantee-like finance
 * language in the final response text.
 *
 * No external dependencies.
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function stableSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

class FinanceResponseToneGuard {
  guard(input = {}) {
    const findings = [];
    let text = String(input.finalResponseText || "");

    const replacements = this.replacementRules();

    replacements.forEach((rule) => {
      if (rule.pattern.test(text)) {
        findings.push({
          findingId: `fin_tone_guard_${stableSlug(rule.code)}`,
          findingCode: rule.code,
          severity: rule.severity,
          originalPattern: String(rule.pattern),
          action: "softened_or_replaced",
          replacement: rule.replacement
        });

        text = text.replace(rule.pattern, rule.replacement);
      }
    });

    const blockedLanguagePresent = findings.some((finding) => finding.severity === "blocking");
    const advisoryLanguagePresent = findings.length > 0;

    if (!this.hasFinancePosture(text)) {
      findings.push({
        findingId: "fin_tone_guard_missing_finance_posture",
        findingCode: "missing_finance_posture",
        severity: "low",
        action: "posture_note_added",
        replacement: "Based on the provided figures"
      });

      text = `Based on the provided figures, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
    }

    return {
      finalResponseText: text,
      renderedSections: safeArray(input.renderedSections),
      finalResponseBlocks: safeArray(input.finalResponseBlocks),
      toneGuardFindings: findings,
      diagnostics: {
        ok: !blockedLanguagePresent,
        warnings: advisoryLanguagePresent ? findings.map((item) => item.findingCode) : [],
        errors: blockedLanguagePresent ? findings.filter((item) => item.severity === "blocking").map((item) => item.findingCode) : [],
        findingCount: findings.length
      }
    };
  }

  replacementRules() {
    return [
      {
        code: "guaranteed_return_language",
        severity: "blocking",
        pattern: /\bguarantees?\s+(a\s+)?return(s)?\b/gi,
        replacement: "does not guarantee returns"
      },
      {
        code: "certain_future_price_language",
        severity: "high",
        pattern: /\bwill\s+(rise|increase|fall|drop|crash|surge)\b/gi,
        replacement: "could $1"
      },
      {
        code: "direct_buy_recommendation",
        severity: "high",
        pattern: /\byou\s+should\s+buy\b/gi,
        replacement: "a buy decision would require additional verified evidence and personal suitability review"
      },
      {
        code: "direct_sell_recommendation",
        severity: "high",
        pattern: /\byou\s+should\s+sell\b/gi,
        replacement: "a sell decision would require additional verified evidence and personal suitability review"
      },
      {
        code: "direct_hold_recommendation",
        severity: "medium",
        pattern: /\byou\s+should\s+hold\b/gi,
        replacement: "a hold decision would require additional verified evidence and personal suitability review"
      },
      {
        code: "safe_company_overclaim",
        severity: "medium",
        pattern: /\bthe company is safe\b/gi,
        replacement: "the provided figures suggest some supported strengths, but safety cannot be concluded from this analysis alone"
      },
      {
        code: "certain_valuation_overclaim",
        severity: "medium",
        pattern: /\bis undervalued\b/gi,
        replacement: "may appear undervalued based on the provided inputs, subject to verification"
      },
      {
        code: "certain_valuation_overclaim_overvalued",
        severity: "medium",
        pattern: /\bis overvalued\b/gi,
        replacement: "may appear overvalued based on the provided inputs, subject to verification"
      },
      {
        code: "legal_tax_certainty_language",
        severity: "medium",
        pattern: /\bthis is definitely (tax|legal) compliant\b/gi,
        replacement: "tax or legal compliance would require qualified professional review"
      }
    ];
  }

  hasFinancePosture(text = "") {
    return /\bbased on\b|\bprovided figures\b|\bevidence\b|\bsuggests\b|\bscenario\b|\bsubject to\b/i.test(text);
  }

  guardTone(input = {}) { return this.guard(input); }
  process(input = {}) { return this.guard(input); }
  execute(input = {}) { return this.guard(input); }
  run(input = {}) { return this.guard(input); }

  static guard(input = {}, options = {}) {
    return new FinanceResponseToneGuard(options).guard(input);
  }
}

module.exports = {
  FinanceResponseToneGuard
};
