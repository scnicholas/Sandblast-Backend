"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceComplianceEnvelope = require("../../../Data/marion/runtime/finance/layer14_finance_compliance_governance/FinanceComplianceEnvelope");

test("FinanceComplianceEnvelope builds a pass envelope", () => {
  const envelope = FinanceComplianceEnvelope.build({
    complianceStatus: "pass",
    safeForPublicResponse: true,
    requiresHumanReview: false,
    blocked: false,
    warnings: [],
    boundaryFlags: [],
    disclosureFlags: [],
    caveatStatus: "complete",
    dataHandlingFlags: [],
    sanitizedResponse: "Safe response.",
    diagnostics: {
      checked: true
    },
    nextLayerReason: "Finance response cleared for Layer 15 feedback-loop handoff."
  });

  assert.equal(envelope.domain, "finance");
  assert.equal(envelope.runtimeLayer, "layer14_finance_compliance_governance");
  assert.equal(envelope.complianceStatus, "pass");
  assert.equal(envelope.safeForPublicResponse, true);
  assert.equal(envelope.requiresHumanReview, false);
  assert.equal(envelope.blocked, false);
  assert.deepEqual(envelope.warnings, []);
  assert.deepEqual(envelope.boundaryFlags, []);
  assert.deepEqual(envelope.disclosureFlags, []);
  assert.equal(envelope.caveatStatus, "complete");
  assert.deepEqual(envelope.dataHandlingFlags, []);
  assert.equal(envelope.sanitizedResponse, "Safe response.");
  assert.equal(envelope.nextLayerHandoff.targetLayer, "layer15_feedback_loops");
  assert.equal(envelope.nextLayerHandoff.eligible, true);
  assert.equal(
    envelope.nextLayerHandoff.reason,
    "Finance response cleared for Layer 15 feedback-loop handoff."
  );
  assert.ok(envelope.timestamp);
});

test("FinanceComplianceEnvelope builds a pass_with_warnings envelope eligible for Layer 15", () => {
  const envelope = FinanceComplianceEnvelope.build({
    complianceStatus: "pass_with_warnings",
    safeForPublicResponse: true,
    requiresHumanReview: false,
    blocked: false,
    warnings: ["Data handling flag: account_number_redacted"],
    dataHandlingFlags: [
      {
        type: "account_number_redacted",
        severity: "warn"
      }
    ],
    sanitizedResponse: "Account ********9012 was redacted."
  });

  assert.equal(envelope.complianceStatus, "pass_with_warnings");
  assert.equal(envelope.nextLayerHandoff.eligible, true);
  assert.equal(envelope.safeForPublicResponse, true);
  assert.equal(envelope.requiresHumanReview, false);
  assert.equal(envelope.blocked, false);
  assert.equal(envelope.warnings.length, 1);
  assert.equal(envelope.dataHandlingFlags.length, 1);
});

test("FinanceComplianceEnvelope builds a hold envelope not eligible for Layer 15", () => {
  const envelope = FinanceComplianceEnvelope.build({
    complianceStatus: "hold",
    safeForPublicResponse: false,
    requiresHumanReview: true,
    blocked: false,
    warnings: ["Disclosure gap: investment_discussion"],
    disclosureFlags: [
      {
        category: "investment_discussion",
        severity: "hold",
        missing: ["notFinancialAdvice"]
      }
    ],
    caveatStatus: "patched",
    nextLayerReason: "Compliance review required before Layer 15 handoff."
  });

  assert.equal(envelope.complianceStatus, "hold");
  assert.equal(envelope.safeForPublicResponse, false);
  assert.equal(envelope.requiresHumanReview, true);
  assert.equal(envelope.blocked, false);
  assert.equal(envelope.nextLayerHandoff.eligible, false);
  assert.equal(envelope.nextLayerHandoff.targetLayer, "layer15_feedback_loops");
});

test("FinanceComplianceEnvelope fail helper returns blocked fail envelope", () => {
  const envelope = FinanceComplianceEnvelope.fail("Invalid finance compliance payload.", {
    received: null
  });

  assert.equal(envelope.complianceStatus, "fail");
  assert.equal(envelope.safeForPublicResponse, false);
  assert.equal(envelope.requiresHumanReview, true);
  assert.equal(envelope.blocked, true);
  assert.deepEqual(envelope.warnings, ["Invalid finance compliance payload."]);
  assert.equal(envelope.nextLayerHandoff.eligible, false);
  assert.equal(envelope.nextLayerHandoff.reason, "Invalid finance compliance payload.");
  assert.deepEqual(envelope.diagnostics, {
    received: null
  });
});

test("FinanceComplianceEnvelope defaults missing arrays and fields safely", () => {
  const envelope = FinanceComplianceEnvelope.build();

  assert.equal(envelope.domain, "finance");
  assert.equal(envelope.runtimeLayer, "layer14_finance_compliance_governance");
  assert.equal(envelope.complianceStatus, "unchecked");
  assert.equal(envelope.safeForPublicResponse, false);
  assert.equal(envelope.requiresHumanReview, false);
  assert.equal(envelope.blocked, false);
  assert.deepEqual(envelope.warnings, []);
  assert.deepEqual(envelope.boundaryFlags, []);
  assert.deepEqual(envelope.disclosureFlags, []);
  assert.deepEqual(envelope.dataHandlingFlags, []);
  assert.equal(envelope.caveatStatus, "not_evaluated");
  assert.equal(envelope.sanitizedResponse, "");
  assert.equal(envelope.nextLayerHandoff.targetLayer, "layer15_feedback_loops");
  assert.equal(envelope.nextLayerHandoff.eligible, false);
});

test("FinanceComplianceEnvelope is JSON serializable", () => {
  const envelope = FinanceComplianceEnvelope.build({
    complianceStatus: "pass",
    safeForPublicResponse: true,
    sanitizedResponse: "Serializable response."
  });

  const serialized = JSON.stringify(envelope);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.domain, "finance");
  assert.equal(parsed.runtimeLayer, "layer14_finance_compliance_governance");
  assert.equal(parsed.complianceStatus, "pass");
  assert.equal(parsed.sanitizedResponse, "Serializable response.");
});
