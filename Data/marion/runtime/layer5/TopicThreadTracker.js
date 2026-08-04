"use strict";

/**
 * runtime/layer5/TopicThreadTracker.js
 *
 * Detects exact or semantically overlapping query continuity. It returns
 * metadata only and does not mutate memory or author replies.
 */

const VERSION = "marion.topicThreadTracker/2.1-conflict-resolved";
const CONTINUATION_THRESHOLD = 0.45;

function normalizeText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text = "") {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((token) => token.length > 2)
  );
}

function jaccard(left = new Set(), right = new Set()) {
  const a = left instanceof Set ? left : new Set();
  const b = right instanceof Set ? right : new Set();
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function buildTopicThread({ userQuery = "", previousMemory = {} } = {}) {
  const memory = previousMemory && typeof previousMemory === "object" ? previousMemory : {};
  const current = normalizeText(userQuery);
  const previous = normalizeText(memory.lastQuery || "");
  const similarity = jaccard(tokenSet(current), tokenSet(previous));
  const exactRepeat = Boolean(previous && current) && current === previous;
  const continued = exactRepeat || similarity >= CONTINUATION_THRESHOLD;
  const threadStrength = exactRepeat ? "strong" : continued ? "moderate" : "weak";

  return {
    lastQuery: previous,
    currentQuery: current,
    exactRepeat,
    similarityScore: Number(similarity.toFixed(3)),
    continued,
    threadStrength,
    threadLabel: exactRepeat
      ? "repeated-thread"
      : continued
        ? "continued-thread"
        : "new-thread"
  };
}

module.exports = {
  VERSION,
  CONTINUATION_THRESHOLD,
  buildTopicThread
};
