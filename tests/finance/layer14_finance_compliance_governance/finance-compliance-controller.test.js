"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceComplianceController = require("../../../Data/marion/runtime/finance/layer14_finance_compliance_governance/FinanceComplianceController");

function buildController() {
  return new FinanceComplianceController({
    regulatoryBoundary: {
      boundaryTriggers: {
        personalizedAdvice: [
          "should i buy",
          "should i sell",
          "guaranteed profit",
          "best stock for me"
        ],
        taxBoundary: [
          "tax deduction",
          "cra",
          "irs",
          "capital gains tax"
        ],
        legalBoundary: [
          "securities law",
          "fiduciary",
          "prospectus"
        ],
        fundingBoundary: [
          "grant approval guaranteed",
          "loan approval guaranteed",
          "funding is certain"
        ],
        highRiskFinancialProduct: [
          "options",
          "margin",
          "crypto leverage",
          "derivatives"
        ]
      }
    },

    disclosureRequirements: {
      disclosureCategories: {
        general_financial_information: {
          required: ["generalInformationOnly"],
          severityIfMissing: "warn"
        },
        investment_discussion: {
          required: ["notFinancialAdvice", "riskMayVary", "doOwnResearch"],
          severityIfMissing: "hold"
        },
        tax_discussion: {
          required: ["notTaxAdvice", "consultQualifiedProfessional"],
          severityIfMissing: "hold"
        },
        legal_or_regulatory_discussion: {
          required: ["notLegalAdvice", "jurisdictionMayMatter"],
          severityIfMissing: "hold"
        },
        forecast_or_projection: {
          required: ["projectionUncertain", "assumptionsMatter", "noGuaranteedOutcome"],
          severityIfMissing: "hold"
        }
      }
    },

    caveatRules: {
      caveatRules: {
        investment: {
          requiredWhen: ["stock", "portfolio", "ETF", "bond", "crypto", "return"],
          minimumCaveats: ["notFinancialAdvice", "riskMayVary", "noGuaranteedOutcome"]
        },
        businessFunding: {
          requiredWhen: ["grant", "loan", "underwriting", "financing", "capital"],
          minimumCaveats: [
            "approvalNotGuaranteed",
            "eligibilityDependsOnCriteria",
            "verifyProgramStatus"
          ]
        },
        forecast: {
          requiredWhen: ["forecast", "projection", "valuation", "scenario"],
          minimumCaveats: [
            "projectionUncertain",
            "assumptionsMatter",
            "noGuaranteedOutcome"
          ]
        }
      },
      phrases: {
        approvalNotGuaranteed: "Approval is not guaranteed.",
        eligibilityDependsOnCriteria:
          "Eligibility depends on the program, lender, underwriting standard, and submitted documentation.",
        verifyProgramStatus:
          "Program terms, deadlines, and funding availability should be verified before submission."
      }
    },

    dataHandlingPolicy: {
      dataHandling: {
        sensitiveFinancialData: [
          "bank account number",
          "credit card number",
          "SIN",
          "SSN",
          "tax return",
          "loan application"
        ],
        redactionPolicy: {
          accountNumberVisibleDigits: 4,
          maskCharacter: "*"
        }
      }
    }
  });
}

test("FinanceComplianceController passes a fully caveated general investment response", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    query: "Explain how a stock portfolio works.",
    answer:
      "This is general financial information, not personalized financial advice. " +
      "A stock portfolio is a collection of securities that may rise or fall in value. " +
      "Financial outcomes depend on risk tolerance, timing, liquidity needs, and personal circumstances. " +
      "Verify details using current, authoritative sources before acting. " +
      "No market outcome is guaranteed."
  });

  assert.equal(result.domain, "finance");
  assert.equal(result.runtimeLayer, "layer14_finance_compliance_governance");
  assert.equal(result.complianceStatus, "pass");
  assert.equal(result.safeForPublicResponse, true);
  assert.equal(result.requiresHumanReview, false);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.boundaryFlags, []);
  assert.deepEqual(result.disclosureFlags, []);
  assert.equal(result.caveatStatus, "complete");
  assert.equal(result.nextLayerHandoff.targetLayer, "layer15_feedback_loops");
  assert.equal(result.nextLayerHandoff.eligible, true);
});

test("FinanceComplianceController holds personalized investment advice for review", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    query: "Should I buy this stock today?",
    answer: "You should buy it today because it will probably go up."
  });

  assert.equal(result.complianceStatus, "hold");
  assert.equal(result.safeForPublicResponse, false);
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.blocked, false);

  assert.ok(
    result.boundaryFlags.some(flag => flag.category === "personalizedAdvice"),
    "Expected personalizedAdvice boundary flag."
  );

  assert.ok(
    result.disclosureFlags.some(flag => flag.category === "investment_discussion"),
    "Expected investment disclosure gap."
  );

  assert.equal(result.caveatStatus, "patched");

  assert.match(
    result.sanitizedResponse,
    /not personalized financial advice/i
  );

  assert.equal(result.nextLayerHandoff.eligible, false);
});

test("FinanceComplianceController blocks guaranteed funding language", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    query: "Can I tell applicants that grant approval guaranteed?",
    answer: "Yes, grant approval guaranteed if they submit the form."
  });

  assert.equal(result.complianceStatus, "fail");
  assert.equal(result.safeForPublicResponse, false);
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.blocked, true);

  assert.ok(
    result.boundaryFlags.some(flag => flag.category === "fundingBoundary"),
    "Expected fundingBoundary block."
  );

  assert.equal(result.nextLayerHandoff.eligible, false);
});

test("FinanceComplianceController redacts likely account numbers and downgrades to warning when otherwise safe", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "finance",
    query: "Explain capital handling in general financial terms.",
    answer:
      "This is general financial information. Approval is not guaranteed. " +
      "Eligibility depends on the program, lender, underwriting standard, and submitted documentation. " +
      "Program terms, deadlines, and funding availability should be verified before submission. " +
      "Reference account 123456789012 only as an example."
  });

  assert.equal(result.complianceStatus, "pass_with_warnings");
  assert.equal(result.safeForPublicResponse, true);
  assert.equal(result.requiresHumanReview, false);
  assert.equal(result.blocked, false);

  assert.match(result.sanitizedResponse, /\*+9012/);
  assert.doesNotMatch(result.sanitizedResponse, /123456789012/);

  assert.ok(
    result.dataHandlingFlags.some(flag => flag.type === "account_number_redacted"),
    "Expected account number redaction flag."
  );
});

test("FinanceComplianceController rejects non-finance domain payloads", () => {
  const controller = buildController();

  const result = controller.evaluate({
    domain: "law",
    query: "Explain contract risk.",
    answer: "This belongs to another domain."
  });

  assert.equal(result.complianceStatus, "fail");
  assert.equal(result.safeForPublicResponse, false);
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.blocked, true);
  assert.match(result.warnings[0], /Non-finance payload/i);
});

test("FinanceComplianceController rejects invalid payloads", () => {
  const controller = buildController();

  const result = controller.evaluate(null);

  assert.equal(result.complianceStatus, "fail");
  assert.equal(result.safeForPublicResponse, false);
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.blocked, true);
  assert.match(result.warnings[0], /Invalid finance compliance payload/i);
});
