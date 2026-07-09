"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceAdviceCaveatEnforcer = require("../../../Data/marion/runtime/finance/layer14_finance_compliance_governance/FinanceAdviceCaveatEnforcer");

function buildEnforcer() {
  return new FinanceAdviceCaveatEnforcer({
    caveatRules: {
      investment: {
        requiredWhen: [
          "security",
          "portfolio",
          "stock",
          "bond",
          "ETF",
          "crypto",
          "return",
          "yield"
        ],
        minimumCaveats: [
          "notFinancialAdvice",
          "riskMayVary",
          "noGuaranteedOutcome"
        ]
      },
      businessFunding: {
        requiredWhen: [
          "grant",
          "loan",
          "underwriting",
          "financing",
          "capital",
          "cash flow"
        ],
        minimumCaveats: [
          "approvalNotGuaranteed",
          "eligibilityDependsOnCriteria",
          "verifyProgramStatus"
        ]
      },
      forecast: {
        requiredWhen: [
          "forecast",
          "projection",
          "valuation",
          "growth rate",
          "scenario"
        ],
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
        "Program terms, deadlines, and funding availability should be verified before submission.",
      projectionUncertain: "Forecasts and projections are uncertain.",
      assumptionsMatter: "The result depends on the assumptions used."
    }
  });
}

test("FinanceAdviceCaveatEnforcer patches missing investment caveats", () => {
  const enforcer = buildEnforcer();

  const result = enforcer.enforce({
    query: "Explain this stock return.",
    answer: "This stock may rise over time."
  });

  assert.equal(result.caveatStatus, "patched");

  assert.deepEqual(
    result.missingCaveats.map(item => item.caveatKey),
    [
      "notFinancialAdvice",
      "riskMayVary",
      "noGuaranteedOutcome"
    ]
  );

  assert.match(
    result.sanitizedResponse,
    /general financial information, not personalized financial advice/i
  );

  assert.match(
    result.sanitizedResponse,
    /risk tolerance, timing, liquidity needs, and personal circumstances/i
  );

  assert.match(
    result.sanitizedResponse,
    /no return, approval, funding, or market outcome is guaranteed/i
  );
});

test("FinanceAdviceCaveatEnforcer does not duplicate complete investment caveats", () => {
  const enforcer = buildEnforcer();

  const answer =
    "This is general financial information, not personalized financial advice. " +
    "Financial outcomes depend on risk tolerance, timing, liquidity needs, and personal circumstances. " +
    "No market outcome is guaranteed.";

  const result = enforcer.enforce({
    query: "Explain stock portfolio risk.",
    answer
  });

  assert.equal(result.caveatStatus, "complete");
  assert.deepEqual(result.missingCaveats, []);
  assert.equal(result.sanitizedResponse, answer);
});

test("FinanceAdviceCaveatEnforcer patches business funding caveats", () => {
  const enforcer = buildEnforcer();

  const result = enforcer.enforce({
    query: "Explain grant financing for a corporation.",
    answer: "Grant financing may help with project costs."
  });

  assert.equal(result.caveatStatus, "patched");

  assert.deepEqual(
    result.missingCaveats.map(item => item.caveatKey),
    [
      "approvalNotGuaranteed",
      "eligibilityDependsOnCriteria",
      "verifyProgramStatus"
    ]
  );

  assert.match(result.sanitizedResponse, /Approval is not guaranteed/i);
  assert.match(result.sanitizedResponse, /Eligibility depends/i);
  assert.match(result.sanitizedResponse, /Program terms, deadlines/i);
});

test("FinanceAdviceCaveatEnforcer patches forecast caveats", () => {
  const enforcer = buildEnforcer();

  const result = enforcer.enforce({
    query: "Create a valuation forecast scenario.",
    answer: "The valuation may increase under a stronger growth case."
  });

  assert.equal(result.caveatStatus, "patched");

  assert.ok(
    result.missingCaveats.some(item => item.caveatKey === "projectionUncertain"),
    "Expected projectionUncertain caveat."
  );

  assert.ok(
    result.missingCaveats.some(item => item.caveatKey === "assumptionsMatter"),
    "Expected assumptionsMatter caveat."
  );

  assert.ok(
    result.missingCaveats.some(item => item.caveatKey === "noGuaranteedOutcome"),
    "Expected noGuaranteedOutcome caveat."
  );

  assert.match(result.sanitizedResponse, /Forecasts and projections are uncertain/i);
  assert.match(result.sanitizedResponse, /depends on the assumptions used/i);
});

test("FinanceAdviceCaveatEnforcer returns original answer when no caveat rule applies", () => {
  const enforcer = buildEnforcer();

  const answer = "A balance sheet lists assets, liabilities, and equity.";

  const result = enforcer.enforce({
    query: "Explain a balance sheet.",
    answer
  });

  assert.equal(result.caveatStatus, "complete");
  assert.deepEqual(result.missingCaveats, []);
  assert.equal(result.sanitizedResponse, answer);
});

test("FinanceAdviceCaveatEnforcer handles empty answer safely", () => {
  const enforcer = buildEnforcer();

  const result = enforcer.enforce({
    query: "Explain stock return.",
    answer: ""
  });

  assert.equal(result.caveatStatus, "patched");
  assert.match(result.sanitizedResponse, /general financial information/i);
});
