function normalizeText(text = '') {
  return String(text).toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenSet(text = '') {
  return new Set(normalizeText(text).split(' ').filter(token => token.length > 2));
}

function jaccard(a = new Set(), b = new Set()) {
  const intersection = [...a].filter(token => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function buildTopicThread({
  userQuery = '',
  previousMemory = {}
} = {}) {
  const current = normalizeText(userQuery);
  const previous = normalizeText(previousMemory.lastQuery || '');
  const currentTokens = tokenSet(current);
  const previousTokens = tokenSet(previous);
  const similarity = jaccard(currentTokens, previousTokens);
  const exactRepeat = Boolean(previous) && current === previous;
  const continued = exactRepeat || similarity >= 0.45;

  return {
    lastQuery: previous,
    currentQuery: current,
    exactRepeat,
    similarityScore: Number(similarity.toFixed(3)),
    continued,
    threadLabel: exactRepeat
      ? 'repeated-thread'
      : (continued ? 'continued-thread' : 'new-thread')
  };
}

module.exports = {
  buildTopicThread
};
