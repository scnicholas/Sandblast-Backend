"use strict";

/**
 * question-shape-normalization.test.js
 *
 * Run:
 * node tests/question-shape-normalization.test.js
 */

const assert = require("assert");

const router = require("../Data/marion/runtime/marionIntentRouter.js");
const normalizer = require("../Data/marion/runtime/QuestionShapeNormalizer.js");

function expectTopic(input, expectedNormalized, expectedDomain) {
  const shape = normalizer.normalizeQuestionShape(input);
  assert.strictEqual(shape.questionShape, "topic_request");
  assert.strictEqual(shape.normalizedText, expectedNormalized);

  const routed = router.routeMarionIntent({ text: input });
  assert.strictEqual(routed.ok, true);
  assert.strictEqual(routed.normalizedUserIntent, expectedNormalized);
  assert.strictEqual(routed.questionShape.questionShape, "topic_request");

  if (expectedDomain) {
    assert.strictEqual(routed.routing.knowledgeDomain, expectedDomain);
  }

  return routed;
}

function expectGuard(input) {
  const shape = normalizer.normalizeQuestionShape(input);
  assert.strictEqual(shape.questionShape, "direct_or_unknown");
  assert.strictEqual(shape.reason, "execution_or_technical_guard");

  const routed = router.routeMarionIntent({ text: input });
  assert.strictEqual(routed.ok, true);
  assert.notStrictEqual(routed.questionShape.questionShape, "topic_request");

  return routed;
}

expectTopic("tell me about cash flow", "cash flow", "finance");
expectTopic("give me something about cash flow", "cash flow", "finance");
expectTopic("can you explain cognitive intelligence", "cognitive intelligence", "ai");
expectTopic("tell me something about emotional intelligence", "emotional intelligence", "psychology");
expectTopic("what does compound interest mean?", "compound interest", "finance");

expectGuard("give me the files I needed to patch Nyx Marion");
expectGuard("give me an autopsy on marionIntentRouter");
expectGuard("resend the updated backend files in a downloadable zip");

console.log("question-shape-normalization.test.js passed");
