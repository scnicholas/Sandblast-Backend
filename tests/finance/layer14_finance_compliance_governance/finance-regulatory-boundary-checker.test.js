"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceRegulatoryBoundaryChecker = require("../../../Data/marion/runtime/finance/layer14_finance_compliance_governance/FinanceRegulatoryBoundaryChecker");

function buildChecker() {
  return new FinanceRegulatoryBoundaryChecker({
    boundaryTriggers: {
      personalizedAdvice: [
        "should i buy",
        "should i sell",
        "best stock for me",
        "guaranteed profit"
      ],
      taxBoundary: [
        "tax deduction",
        "capital gains tax",
        "CRA",
        "IRS"
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
  });
}

test("FinanceRegulatoryBoundaryChecker detects personalized advice as hold severity", () => {
  const checker = buildChecker();

  const result = checker.check({
    query: "Should I buy this stock today?",
    answer: "It may move upward."
  });

  assert.equal(result.hasBlockingBoundary, false);
  assert.equal(result.hasReviewBoundary, true);

  assert.equal(result.boundaryFlags.length, 1);
  assert.equal(result.boundaryFlags[0].category, "personalizedAdvice");
  assert.equal(result.boundaryFlags[0].severity, "hold");
  assert.deepEqual(result.boundaryFlags[0].matched, ["should i buy"]);
});

test("FinanceRegulatoryBoundaryChecker detects guaranteed funding language as block severity", () => {
  const checker = buildChecker();

  const result = checker.check({
    query: "Can we say grant approval guaranteed?",
    answer: "Grant approval guaranteed after submission."
  });

  assert.equal(result.hasBlockingBoundary, true);
  assert.equal(result.hasReviewBoundary, false);

  assert.equal(result.boundaryFlags.length, 1);
  assert.equal(result.boundaryFlags[0].category, "fundingBoundary");
  assert.equal(result.boundaryFlags[0].severity, "block");
});

test("FinanceRegulatoryBoundaryChecker detects tax boundary as hold severity", () => {
  const checker = buildChecker();

  const result = checker.check({
    query: "Can this be used as a tax deduction?",
    answer: "It depends on your filing position."
  });

  assert.equal(result.hasBlockingBoundary, false);
  assert.equal(result.hasReviewBoundary, true);

  assert.ok(
    result.boundaryFlags.some(flag => flag.category === "taxBoundary"),
    "Expected taxBoundary flag."
  );
});

test("FinanceRegulatoryBoundaryChecker detects legal boundary as hold severity", () => {
  const checker = buildChecker();

  const result = checker.check({
    query: "Does this violate securities law?",
    answer: "That may depend on jurisdiction and filing context."
  });

  assert.equal(result.hasBlockingBoundary, false);
  assert.equal(result.hasReviewBoundary, true);

  assert.ok(
    result.boundaryFlags.some(flag => flag.category === "legalBoundary"),
    "Expected legalBoundary flag."
  );
});

test("FinanceRegulatoryBoundaryChecker detects high-risk products as hold severity", () => {
  const checker = buildChecker();

  const result = checker.check({
    query: "Explain options and margin exposure.",
    answer: "Both can increase risk."
  });

  assert.equal(result.hasBlockingBoundary, false);
  assert.equal(result.hasReviewBoundary, true);

  assert.ok(
    result.boundaryFlags.some(flag => flag.category === "highRiskFinancialProduct"),
    "Expected highRiskFinancialProduct flag."
  );
});

test("FinanceRegulatoryBoundaryChecker returns clean result when no trigger matches", () => {
  const checker = buildChecker();

  const result = checker.check({
    query: "Explain basic budgeting.",
    answer: "Budgeting compares expected income against planned expenses."
  });

  assert.equal(result.hasBlockingBoundary, false);
  assert.equal(result.hasReviewBoundary, false);
  assert.deepEqual(result.boundaryFlags, []);
});
