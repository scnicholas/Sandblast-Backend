"use strict";

class FinanceDataHandlingPolicyChecker {
  constructor(config = {}) {
    this.config = config;
    this.sensitiveFinancialData = config.dataHandling?.sensitiveFinancialData || [];
    this.redactionPolicy = config.dataHandling?.redactionPolicy || {};
  }

  check(payload = {}) {
    const response = payload.sanitizedResponse || payload.response || payload.answer || "";
    const flags = [];

    for (const item of this.sensitiveFinancialData) {
      if (this._containsSensitiveReference(response, item)) {
        flags.push({
          type: "sensitive_financial_data_reference",
          item,
          severity: "hold"
        });
      }
    }

    const maskedResponse = this._maskLikelyAccountNumbers(response);

    if (maskedResponse !== response) {
      flags.push({
        type: "account_number_redacted",
        severity: "warn"
      });
    }

    return {
      dataHandlingFlags: flags,
      sanitizedResponse: maskedResponse,
      hasDataHandlingHold: flags.some(flag => flag.severity === "hold")
    };
  }

  _containsSensitiveReference(response, item) {
    const rawItem = String(item || "").trim();
    if (!rawItem) return false;

    const lowerItem = rawItem.toLowerCase();
    const text = String(response || "");
    const lowerText = text.toLowerCase();

    if (lowerItem === "sin") {
      return /\bSIN\b/.test(text) || /\bsocial\s+insurance\s+number\b/i.test(text);
    }

    if (lowerItem === "ssn") {
      return /\bSSN\b/.test(text) || /\bsocial\s+security\s+number\b/i.test(text);
    }

    const escaped = this._escapeRegExp(lowerItem).replace(/\s+/g, "\\s+");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");

    return pattern.test(lowerText);
  }

  _escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  _maskLikelyAccountNumbers(text) {
    const visibleDigits = Number(this.redactionPolicy.accountNumberVisibleDigits || 4);
    const mask = this.redactionPolicy.maskCharacter || "*";

    return String(text || "").replace(/\b\d{9,16}\b/g, value => {
      const suffix = value.slice(-visibleDigits);
      return `${mask.repeat(Math.max(0, value.length - visibleDigits))}${suffix}`;
    });
  }
}

module.exports = FinanceDataHandlingPolicyChecker;
