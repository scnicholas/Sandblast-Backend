"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceDisclosureGuard = require("../../../Data/marion/runtime/finance/layer14_finance_compliance_governance/FinanceDisclosureGuard");

function buildGuard() {
  return new FinanceDisclosureGuard({
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
  });
}

test("FinanceDisclosureGuard flags missing investment disclosures", () => {
  const guard = buildGuard();

  const result = guard.evaluate({
    query: "Explain whether this stock is good.",
    answer: "This stock may perform well over time."
  });

  assert.equal(result.hasDisclosureHold, true);
  assert.equal(result.hasDisclosureWarning, false);

  const investmentFlag = result.disclosureFlags.find(
    flag => flag.category === "investment_discussion"
  );

  assert.ok(investmentFlag, "Expected investment disclosure flag.");
  assert.equal(investmentFlag.severity, "hold");
  assert.deepEqual(investmentFlag.missing, [
    "notFinancialAdvice",
    "riskMayVary",
    "doOwnResearch"
  ]);
});

test("FinanceDisclosureGuard passes complete investment disclosures", () => {
  const guard = buildGuard();

  const result = guard.evaluate({
    query: "Explain stock portfolio risk.",
    answer:
      "This is general financial information, not personalized financial advice. " +
      "Financial outcomes depend on risk tolerance and personal circumstances. " +
      "Verify details using current authoritative sources before acting."
  });

  assert.equal(result.hasDisclosureHold, false);
  assert.equal(result.hasDisclosureWarning, false);
  assert.deepEqual(result.disclosureFlags, []);
});

test("FinanceDisclosureGuard flags missing tax disclosure", () => {
  const guard = buildGuard();

  const result = guard.evaluate({
    query: "Can this be a tax deduction?",
    answer: "It may reduce taxable income in some cases."
  });

  assert.equal(result.hasDisclosureHold, true);

  const taxFlag = result.disclosureFlags.find(
    flag => flag.category === "tax_discussion"
  );

  assert.ok(taxFlag, "Expected tax discussion disclosure flag.");
  assert.equal(taxFlag.severity, "hold");
  assert.deepEqual(taxFlag.missing, [
    "notTaxAdvice",
    "consultQualifiedProfessional"
  ]);
});

test("FinanceDisclosureGuard passes complete tax disclosure", () => {
  const guard = buildGuard();

  const result = guard.evaluate({
    query: "Explain corporate tax deduction basics.",
    answer:
      "This is not tax advice. Consider speaking with a qualified professional " +
      "for advice specific to your situation."
  });

  assert.equal(result.hasDisclosureHold, false);
  assert.deepEqual(result.disclosureFlags, []);
});

test("FinanceDisclosureGuard flags legal or regulatory disclosure gaps", () => {
  const guard = buildGuard();

  const result = guard.evaluate({
    query: "Does this create securities law exposure?",
    answer: "It may depend on how the offer is structured."
  });

  assert.equal(result.hasDisclosureHold, true);

  const legalFlag = result.disclosureFlags.find(
    flag => flag.category === "legal_or_regulatory_discussion"
  );

  assert.ok(legalFlag, "Expected legal/regulatory disclosure flag.");
  assert.equal(legalFlag.severity, "hold");
  assert.deepEqual(legalFlag.missing, [
    "notLegalAdvice",
    "jurisdictionMayMatter"
  ]);
});

test("FinanceDisclosureGuard flags forecast or projection disclosure gaps", () => {
  const guard = buildGuard();

  const result = guard.evaluate({
    query: "Give me a valuation forecast for this company.",
    answer: "The business could grow 30 percent next year."
  });

  assert.equal(result.hasDisclosureHold, true);

  const forecastFlag = result.disclosureFlags.find(
    flag => flag.category === "forecast_or_projection"
  );

  assert.ok(forecastFlag, "Expected forecast/projection disclosure flag.");
  assert.equal(forecastFlag.severity, "hold");
  assert.deepEqual(forecastFlag.missing, [
    "projectionUncertain",
    "assumptionsMatter",
    "noGuaranteedOutcome"
  ]);
});

test("FinanceDisclosureGuard returns clean result when no disclosure category applies", () => {
  const guard = buildGuard();

  const result = guard.evaluate({
    query: "Explain what a balance sheet is.",
    answer: "A balance sheet summarizes assets, liabilities, and equity."
  });

  assert.equal(result.hasDisclosureHold, false);
  assert.equal(result.hasDisclosureWarning, false);
  assert.deepEqual(result.disclosureFlags, []);
});
