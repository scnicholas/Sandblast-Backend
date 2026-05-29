"use strict";

/**
 * question-shape-normalization.test.js
 * ------------------------------------------------------------
 * Jest-owned regression harness.
 *
 * Validates:
 * - Topic-request phrasing is normalized safely.
 * - Intent router receives the normalized question shape.
 * - Execution/autopsy/download requests are guarded from topic coercion.
 *
 * Run:
 *   npx jest tests/question-shape-normalization.test.js --runInBand --verbose
 */

const path = require("path");

function runtimeRequire(relativePath) {
  return require(path.join(process.cwd(), relativePath));
}

const router = runtimeRequire("Data/marion/runtime/marionIntentRouter.js");
const normalizer = runtimeRequire("Data/marion/runtime/QuestionShapeNormalizer.js");

function expectTopic(input, expectedNormalized, expectedDomain) {
  const shape = normalizer.normalizeQuestionShape(input);
  expect(shape.questionShape).toBe("topic_request");
  expect(shape.normalizedText).toBe(expectedNormalized);

  const routed = router.routeMarionIntent({ text: input });
  expect(routed.ok).toBe(true);
  expect(routed.normalizedUserIntent).toBe(expectedNormalized);
  expect(routed.questionShape.questionShape).toBe("topic_request");

  if (expectedDomain) {
    expect(routed.routing.knowledgeDomain).toBe(expectedDomain);
  }

  return routed;
}

function expectGuard(input) {
  const shape = normalizer.normalizeQuestionShape(input);
  expect(shape.questionShape).toBe("direct_or_unknown");
  expect(shape.reason).toBe("execution_or_technical_guard");

  const routed = router.routeMarionIntent({ text: input });
  expect(routed.ok).toBe(true);
  expect(routed.questionShape.questionShape).not.toBe("topic_request");

  return routed;
}

describe("Question shape normalization regression", () => {
  afterAll(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  test("normalizes finance topic request shapes", () => {
    expectTopic("tell me about cash flow", "cash flow", "finance");
    expectTopic("give me something about cash flow", "cash flow", "finance");
    expectTopic("what does compound interest mean?", "compound interest", "finance");
  });

  test("normalizes AI and psychology topic request shapes", () => {
    expectTopic("can you explain cognitive intelligence", "cognitive intelligence", "ai");
    expectTopic("tell me something about emotional intelligence", "emotional intelligence", "psychology");
  });

  test("guards execution, autopsy, and downloadable-file requests", () => {
    expectGuard("give me the files I needed to patch Nyx Marion");
    expectGuard("give me an autopsy on marionIntentRouter");
    expectGuard("resend the updated backend files in a downloadable zip");
  });
});
