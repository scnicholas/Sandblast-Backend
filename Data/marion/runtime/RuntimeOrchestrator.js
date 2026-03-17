// runtime/RuntimeOrchestrator.js

const { processWithMarion } = require('./MarionBridge');

async function runCognitivePipeline(input = {}) {
  const {
    userQuery = '',
    requestedDomain = '',
    conversationState = {},
    datasets = []
  } = input;

  const marionResult = await processWithMarion({
    userQuery,
    requestedDomain,
    conversationState,
    datasets
  });

  return {
    ok: true,
    pipeline: 'layer1-layer2-layer3',
    result: marionResult
  };
}

module.exports = {
  runCognitivePipeline
};
