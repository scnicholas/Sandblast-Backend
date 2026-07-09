"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceRegressionFeedbackMapper = require("../../../Data/marion/runtime/finance/layer15_feedback_loops/FinanceRegressionFeedbackMapper");

function buildMapper() {
  return new FinanceRegressionFeedbackMapper({
    regressionMap: {
      layer02_source_authority: ["bad source", "outdated source", "source conflict"],
      layer03_data_ingestion: ["missing input", "missing context", "bad extraction"],
      layer06_execution: ["calculation error", "ratio error", "valuation error"],
      layer07_evidence_binding: ["unsupported claim", "missing citation", "weak evidence"],
      layer14_compliance_governance: ["unsafe advice", "missing disclosure", "guaranteed return", "data leak"]
    },
    riskLevels: {
      critical: ["unsafe advice", "guaranteed return", "data leak"],
      high: ["calculation error", "outdated source", "unsupported claim", "missing disclosure"],
      medium: ["missing context", "wrong period", "bad answer structure"],
      low: ["tone issue", "format issue", "too verbose"]
    }
  });
}

test("FinanceRegressionFeedbackMapper maps calculation errors to execution layer", () => {
  const mapper = buildMapper();

  const result = mapper.map({
    userFeedback: "There is a calculation error in the valuation."
  });

  assert.equal(result.regressionRisk, "high");
  assert.equal(result.requiresRegressionReview, true);

  assert.ok(
    result.regressionTargets.some(target => target.layer === "layer06_execution"),
    "Expected layer06_execution target."
  );
});

test("FinanceRegressionFeedbackMapper maps unsafe advice to compliance layer", () => {
  const mapper = buildMapper();

  const result = mapper.map({
    userFeedback: "This is unsafe advice and includes a guaranteed return."
  });

  assert.equal(result.regressionRisk, "critical");
  assert.equal(result.requiresRegressionReview, true);

  assert.ok(
    result.regressionTargets.some(target => target.layer === "layer14_compliance_governance"),
    "Expected layer14 compliance target."
  );
});

test("FinanceRegressionFeedbackMapper maps unsupported claims to evidence binding", () => {
  const mapper = buildMapper();

  const result = mapper.map({
    userFeedback: "That was an unsupported claim with a missing citation."
  });

  assert.equal(result.regressionRisk, "high");
  assert.equal(result.requiresRegressionReview, true);

  assert.ok(
    result.regressionTargets.some(target => target.layer === "layer07_evidence_binding"),
    "Expected layer07 evidence binding target."
  );
});

test("FinanceRegressionFeedbackMapper maps missing context to ingestion layer", () => {
  const mapper = buildMapper();

  const result = mapper.map({
    userFeedback: "There was missing context from the uploaded file."
  });

  assert.equal(result.regressionRisk, "medium");
  assert.equal(result.requiresRegressionReview, false);

  assert.ok(
    result.regressionTargets.some(target => target.layer === "layer03_data_ingestion"),
    "Expected layer03 ingestion target."
  );
});

test("FinanceRegressionFeedbackMapper returns none when no regression signal exists", () => {
  const mapper = buildMapper();

  const result = mapper.map({
    userFeedback: "Looks good."
  });

  assert.equal(result.regressionRisk, "none");
  assert.equal(result.requiresRegressionReview, false);
  assert.deepEqual(result.regressionTargets, []);
});
