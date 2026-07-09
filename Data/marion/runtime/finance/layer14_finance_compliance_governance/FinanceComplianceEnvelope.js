"use strict";

class FinanceComplianceEnvelope {
  static build(input = {}) {
    const status = input.complianceStatus || "unchecked";

    return {
      domain: "finance",
      runtimeLayer: "layer14_finance_compliance_governance",
      complianceStatus: status,
      safeForPublicResponse: Boolean(input.safeForPublicResponse),
      requiresHumanReview: Boolean(input.requiresHumanReview),
      blocked: Boolean(input.blocked),
      warnings: Array.isArray(input.warnings) ? input.warnings : [],
      boundaryFlags: Array.isArray(input.boundaryFlags) ? input.boundaryFlags : [],
      disclosureFlags: Array.isArray(input.disclosureFlags) ? input.disclosureFlags : [],
      caveatStatus: input.caveatStatus || "not_evaluated",
      dataHandlingFlags: Array.isArray(input.dataHandlingFlags) ? input.dataHandlingFlags : [],
      sanitizedResponse: input.sanitizedResponse || "",
      diagnostics: input.diagnostics || {},
      nextLayerHandoff: {
        targetLayer: "layer15_feedback_loops",
        eligible: status === "pass" || status === "pass_with_warnings",
        reason: input.nextLayerReason || null
      },
      timestamp: new Date().toISOString()
    };
  }

  static fail(reason, diagnostics = {}) {
    return this.build({
      complianceStatus: "fail",
      safeForPublicResponse: false,
      requiresHumanReview: true,
      blocked: true,
      warnings: [reason],
      diagnostics,
      nextLayerReason: reason
    });
  }
}

module.exports = FinanceComplianceEnvelope;
