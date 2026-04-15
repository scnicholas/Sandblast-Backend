<<<<<<< HEAD
"use strict";

function normalizeText(text = "") {
  return String(text).toLowerCase().replace(/[^\w\s'-]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenSet(text = "") {
  return new Set(normalizeText(text).split(" ").filter((token) => token.length > 2));
}

function jaccard(a = new Set(), b = new Set()) {
  const intersection = [...a].filter((token) => b.has(token)).length;
=======
function normalizeText(text = '') {
  return String(text).toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenSet(text = '') {
  return new Set(normalizeText(text).split(' ').filter(token => token.length > 2));
}

function jaccard(a = new Set(), b = new Set()) {
  const intersection = [...a].filter(token => b.has(token)).length;
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function buildTopicThread({
<<<<<<< HEAD
  userQuery = "",
  previousMemory = {}
} = {}) {
  const current = normalizeText(userQuery);
  const previous = normalizeText(previousMemory.lastQuery || "");
=======
  userQuery = '',
  previousMemory = {}
} = {}) {
  const current = normalizeText(userQuery);
  const previous = normalizeText(previousMemory.lastQuery || '');
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
  const currentTokens = tokenSet(current);
  const previousTokens = tokenSet(previous);
  const similarity = jaccard(currentTokens, previousTokens);
  const exactRepeat = Boolean(previous) && current === previous;
  const continued = exactRepeat || similarity >= 0.45;
<<<<<<< HEAD
  const threadStrength = exactRepeat ? "strong" : continued ? "moderate" : "weak";
=======
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)

  return {
    lastQuery: previous,
    currentQuery: current,
    exactRepeat,
    similarityScore: Number(similarity.toFixed(3)),
    continued,
<<<<<<< HEAD
    threadStrength,
    threadLabel: exactRepeat
      ? "repeated-thread"
      : (continued ? "continued-thread" : "new-thread")
=======
    threadLabel: exactRepeat
      ? 'repeated-thread'
      : (continued ? 'continued-thread' : 'new-thread')
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
  };
}

module.exports = {
  buildTopicThread
<<<<<<< HEAD
};
=======
};
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
