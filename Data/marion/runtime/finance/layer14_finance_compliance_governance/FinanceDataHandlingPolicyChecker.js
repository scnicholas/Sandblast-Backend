"use strict";

class FinanceDataHandlingPolicyChecker {
  constructor(config = {}) {
    this.config = config;
    this.sensitiveFinancialData = config.dataHandling?.sensitiveFinancialData || [];
    this.redactionPolicy = config.dataHandling?.redactionPolicy || {};
  }

  check(payload = {}) {
    const response = payload.answer || payload.response || "";
    const text = response.toLowerCase();
    const flags = [];

    for (const item of this.sensitiveFinancialData) {
      if (text.includes(String(item).toLowerCase())) {
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
