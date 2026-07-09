"use strict";

const FinanceComplianceEnvelope = require("./FinanceComplianceEnvelope");
const FinanceRegulatoryBoundaryChecker = require("./FinanceRegulatoryBoundaryChecker");
const FinanceDisclosureGuard = require("./FinanceDisclosureGuard");
const FinanceAdviceCaveatEnforcer = require("./FinanceAdviceCaveatEnforcer");
const FinanceDataHandlingPolicyChecker = require("./FinanceDataHandlingPolicyChecker");

class FinanceComplianceController {
  constructor(config = {}) {
    this.config = config;

    this.boundaryChecker = new FinanceRegulatoryBoundaryChecker(config.regulatoryBoundary || {});
    this.disclosureGuard = new FinanceDisclosureGuard(config.disclosureRequirements || {});
    this.caveatEnforcer = new FinanceAdviceCaveatEnforcer(config.caveatRules || {});
    this.dataPolicyChecker = new FinanceDataHandlingPolicyChecker(config.dataHandlingPolicy || {});
  }

  evaluate(payload = {}) {
    if (!payload || typeof payload !== "object") {
      return FinanceComplianceEnvelope.fail("Invalid finance compliance payload.");
    }

    const domain = payload.domain || "finance";

    if (domain !== "finance") {
      return FinanceComplianceEnvelope.fail("Non-finance payload rejected by finance compliance layer.", {
        receivedDomain: domain
      });
    }

    const boundary = this.boundaryChecker.check(payload);
    const caveat = this.caveatEnforcer.enforce(payload);

    const caveatedPayload = {
      ...payload,
      answer: undefined,
      response: caveat.sanitizedResponse,
      sanitizedResponse: caveat.sanitizedResponse
    };

    const dataPolicy = this.dataPolicyChecker.check(caveatedPayload);

    const finalPayload = {
      ...payload,
      answer: undefined,
      response: dataPolicy.sanitizedResponse,
      sanitizedResponse: dataPolicy.sanitizedResponse
    };

    const disclosure = this.disclosureGuard.evaluate(finalPayload);

    const warnings = [
      ...boundary.boundaryFlags.map(flag => `Boundary flag: ${flag.category}`),
      ...disclosure.disclosureFlags.map(flag => `Disclosure gap: ${flag.category}`),
      ...dataPolicy.dataHandlingFlags.map(flag => `Data handling flag: ${flag.type}`)
    ];

    const blocked = boundary.hasBlockingBoundary;
    const requiresHumanReview =
      blocked ||
      boundary.hasReviewBoundary ||
      disclosure.hasDisclosureHold ||
      dataPolicy.hasDataHandlingHold;

    const complianceStatus = blocked
      ? "fail"
      : requiresHumanReview
        ? "hold"
        : warnings.length
          ? "pass_with_warnings"
          : "pass";

    return FinanceComplianceEnvelope.build({
      complianceStatus,
      safeForPublicResponse: complianceStatus === "pass" || complianceStatus === "pass_with_warnings",
      requiresHumanReview,
      blocked,
      warnings,
      boundaryFlags: boundary.boundaryFlags,
      disclosureFlags: disclosure.disclosureFlags,
      caveatStatus: caveat.caveatStatus,
      dataHandlingFlags: dataPolicy.dataHandlingFlags,
      sanitizedResponse: dataPolicy.sanitizedResponse,
      diagnostics: {
        boundary,
        caveat,
        dataPolicy,
        disclosure,
        finalPayload: {
          domain,
          hasQuery: Boolean(finalPayload.query),
          responseLength: String(finalPayload.sanitizedResponse || "").length
        }
      },
      nextLayerReason: requiresHumanReview
        ? "Compliance review required before Layer 15 handoff."
        : "Finance response cleared for Layer 15 feedback-loop handoff."
    });
  }
}

module.exports = FinanceComplianceController;
