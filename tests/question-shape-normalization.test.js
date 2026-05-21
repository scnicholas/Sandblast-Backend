"use strict";

/**
 * question-shape-normalization.test.js
 *
 * Run:
 * node tests/question-shape-normalization.test.js
 */

const assert = require("assert");

const {
  QUESTION_SHAPE_NORMALIZATION_VERSION,
  normalizeQuestionShape,
  isExecutionOrTechnicalRequest
} = require("../Data/marion/runtime/QuestionShapeNormalizer.js");

function expectTopic(input, expectedNormalized, expectedReason) {
  const result = normalizeQuestionShape(input);

  assert.strictEqual(result.version, QUESTION_SHAPE_NORMALIZATION_VERSION);
  assert.strictEqual(result.questionShape, "topic_request");
  assert.strictEqual(result.normalizedText, expectedNormalized);
  assert.strictEqual(result.normalizedUserIntent, expectedNormalized);
  assert.strictEqual(result.changed, true);

  if (expectedReason) {
    assert.strictEqual(result.reason, expectedReason);
  }

  return result;
}

function expectPassthrough(input, expectedReason) {
  const result = normalizeQuestionShape(input);

  assert.strictEqual(result.version, QUESTION_SHAPE_NORMALIZATION_VERSION);
  assert.strictEqual(result.questionShape, "direct_or_unknown");
  assert.strictEqual(result.changed, false);

  if (expectedReason) {
    assert.strictEqual(result.reason, expectedReason);
  }

  return result;
}

function run() {
  expectTopic("tell me about cash flow", "cash flow", "tell_me_about");
  expectTopic("Tell me something about cash flow.", "cash flow", "tell_me_about");
  expectTopic("give me something about cash flow", "cash flow", "give_me_about");
  expectTopic("Give me information on compound interest.", "compound interest", "give_me_about");
  expectTopic("can you explain cognitive intelligence", "cognitive intelligence", "explain_or_define");
  expectTopic("explain emotional intelligence", "emotional intelligence", "explain_or_define");
  expectTopic("define working capital", "working capital", "explain_or_define");
  expectTopic("I want to know about cash flow", "cash flow", "want_to_know");
  expectTopic("I wanna know about cognitive intelligence", "cognitive intelligence", "want_to_know");
  expectTopic("what is cash flow?", "cash flow", "what_is");
  expectTopic("what are cognitive distortions?", "cognitive distortions", "what_is");
  expectTopic("what does compound interest mean?", "compound interest", "what_does_mean");
  expectTopic("how does cash flow work?", "cash flow", "how_does_work");

  const guardedPatch = expectPassthrough(
    "give me the files I needed to patch Nyx Marion",
    "execution_or_technical_guard"
  );

  assert.strictEqual(
    guardedPatch.normalizedText,
    "give me the files I needed to patch Nyx Marion"
  );

  const guardedAudit = expectPassthrough(
    "give me an autopsy on marionIntentRouter",
    "execution_or_technical_guard"
  );

  assert.strictEqual(
    guardedAudit.normalizedText,
    "give me an autopsy on marionIntentRouter"
  );

  const guardedZip = expectPassthrough(
    "resend the updated backend files in a downloadable zip",
    "execution_or_technical_guard"
  );

  assert.strictEqual(
    guardedZip.normalizedText,
    "resend the updated backend files in a downloadable zip"
  );

  const normal = expectPassthrough("cash flow", "no_topic_prefix_match");
  assert.strictEqual(normal.normalizedText, "cash flow");

  const empty = expectPassthrough("", "empty_input");
  assert.strictEqual(empty.normalizedText, "");

  assert.strictEqual(isExecutionOrTechnicalRequest("patch marionIntentRouter"), true);
  assert.strictEqual(isExecutionOrTechnicalRequest("line by line audit"), true);
  assert.strictEqual(isExecutionOrTechnicalRequest("cash flow"), false);

  console.log("question-shape-normalization.test.js passed");
}

run();
