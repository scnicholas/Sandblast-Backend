const { buildContinuityState } = require('./ContinuityStateBuilder');
const { extractMemorySignals } = require('./MemorySignalExtractor');
const { classifyPersistence } = require('./PersistenceClassifier');
const { buildEmotionalContinuity } = require('./EmotionalContinuityEngine');
const { buildDomainContinuity } = require('./DomainContinuityEngine');
const { buildTopicThread } = require('./TopicThreadTracker');
const { buildResetGuard } = require('./ResetGuard');
const { assembleTurnMemory } = require('./TurnMemoryAssembler');

async function runLayer5({
  userQuery = '',
  fusionPacket = {},
  assembledResponse = {},
  previousMemory = {}
} = {}) {
  const continuityState = buildContinuityState({
    userQuery,
    fusionPacket,
    assembledResponse,
    previousMemory
  });

  const extractedSignals = extractMemorySignals({
    userQuery,
    fusionPacket,
    assembledResponse
  });

  const persistence = classifyPersistence(extractedSignals);

  const emotionalContinuity = buildEmotionalContinuity({
    fusionPacket,
    previousMemory
  });

  const domainContinuity = buildDomainContinuity({
    fusionPacket,
    previousMemory
  });

  const topicThread = buildTopicThread({
    userQuery,
    previousMemory
  });

  const resetGuard = buildResetGuard({
    continuityState,
    emotionalContinuity,
    domainContinuity,
    topicThread,
    extractedSignals,
    previousMemory,
    assembledResponse
  });

  const turnMemory = assembleTurnMemory({
    continuityState,
    extractedSignals,
    persistence,
    emotionalContinuity,
    domainContinuity,
    topicThread,
    resetGuard,
    previousMemory
  });

  return {
    continuityState,
    extractedSignals,
    persistence,
    emotionalContinuity,
    domainContinuity,
    topicThread,
    resetGuard,
    turnMemory
  };
}

module.exports = {
  runLayer5
};
