"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const FinanceUserCorrectionInterpreter = require("../../../Data/marion/runtime/finance/layer15_feedback_loops/FinanceUserCorrectionInterpreter");

function buildInterpreter() {
  return new FinanceUserCorrectionInterpreter({
    correctionPatterns: {
      explicitCorrection: ["that's wrong", "incorrect", "actually", "fix this"],
      staleData: ["outdated", "stale", "check latest", "deadline changed"],
      mathError: ["math is wrong", "calculation is wrong", "numbers don't match"],
      missingContext: ["you didn't account for", "you left out", "wrong year"],
      unsafeAdvice: ["sounds like financial advice", "you guaranteed", "missing caveat"]
    },
    classificationPriority: [
      "unsafeAdvice",
      "mathError",
      "staleData",
      "missingContext",
      "explicitCorrection"
    ],
    actions: {
      unsafeAdvice: "route_to_layer14_compliance_review",
      mathError: "route_to_layer06_execution_recalculation",
      staleData: "route_to_layer02_source_freshness_review",
      missingContext: "route_to_layer03_ingestion_gap_review",
      explicitCorrection: "route_to_feedback_memory_review"
    }
  });
}

test("FinanceUserCorrectionInterpreter detects unsafe advice first", () => {
  const interpreter = buildInterpreter();

  const result = interpreter.interpret({
    userFeedback: "That's wrong and it sounds like financial advice with a missing caveat."
  });

  assert.equal(result.correctionType, "unsafeAdvice");
  assert.equal(result.hasCorrection, true);
  assert.equal(result.recommendedAction, "route_to_layer14_compliance_review");
});

test("FinanceUserCorrectionInterpreter detects math errors", () => {
  const interpreter = buildInterpreter();

  const result = interpreter.interpret({
    userFeedback: "The calculation is wrong. The numbers don't match."
  });

  assert.equal(result.correctionType, "mathError");
  assert.equal(result.hasCorrection, true);
  assert.equal(result.recommendedAction, "route_to_layer06_execution_recalculation");
});

test("FinanceUserCorrectionInterpreter detects stale data", () => {
  const interpreter = buildInterpreter();

  const result = interpreter.interpret({
    userFeedback: "This is outdated. Check latest because the deadline changed."
  });

  assert.equal(result.correctionType, "staleData");
  assert.equal(result.hasCorrection, true);
  assert.equal(result.recommendedAction, "route_to_layer02_source_freshness_review");
});

test("FinanceUserCorrectionInterpreter detects missing context", () => {
  const interpreter = buildInterpreter();

  const result = interpreter.interpret({
    userFeedback: "You didn't account for the uploaded file and used the wrong year."
  });

  assert.equal(result.correctionType, "missingContext");
  assert.equal(result.hasCorrection, true);
  assert.equal(result.recommendedAction, "route_to_layer03_ingestion_gap_review");
});

test("FinanceUserCorrectionInterpreter returns none when no correction is found", () => {
  const interpreter = buildInterpreter();

  const result = interpreter.interpret({
    userFeedback: "Thanks, this helps."
  });

  assert.equal(result.correctionType, "none");
  assert.equal(result.hasCorrection, false);
  assert.equal(result.recommendedAction, "monitor");
});
