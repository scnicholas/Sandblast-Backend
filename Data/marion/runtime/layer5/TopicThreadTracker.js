// runtime/layer5/TopicThreadTracker.js

function normalizeText(text = '') {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildTopicThread({
  userQuery = '',
  previousMemory = {}
} = {}) {
  const current = normalizeText(userQuery);
  const previous = normalizeText(previousMemory.lastQuery || '');

  let continued = false;

  if (previous && current) {
    const previousTokens = previous.split(' ').filter(Boolean);
    const overlap = previousTokens.filter(token => current.includes(token));
    continued = overlap.length >= Math.min(3, previousTokens.length);
  }

  return {
    lastQuery: previous,
    currentQuery: current,
    continued,
    threadLabel: continued ? 'continued-thread' : 'new-thread'
  };
}

module.exports = {
  buildTopicThread
};
