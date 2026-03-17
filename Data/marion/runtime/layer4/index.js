const { resolveResponseMode } = require('./ResponseModeResolver');
const { buildToneEnvelope } = require('./ToneEnvelopeBuilder');
const { composeDomainResponse } = require('./DomainResponseComposer');
const { buildSafetyEnvelope } = require('./SafetyEnvelope');
const { buildFallbackResponse } = require('./FallbackResponseBuilder');
const { assembleResponse } = require('./ResponseAssembler');
const { adaptForNyx } = require('./NyxOutputAdapter');

async function runLayer4({
  fusionPacket = {},
  answerPlan = {},
  continuityState = {},
  turnMemory = {}
} = {}) {
  const responseMode = resolveResponseMode({
    fusionPacket,
    answerPlan,
    continuityState,
    turnMemory
  });

  const toneEnvelope = buildToneEnvelope({
    fusionPacket,
    responseMode,
    turnMemory
  });

  const domainResponse = composeDomainResponse({
    fusionPacket,
    answerPlan,
    responseMode
  });

  const safetyEnvelope = buildSafetyEnvelope({
    fusionPacket,
    responseMode,
    toneEnvelope,
    turnMemory,
    domainResponse
  });

  const fallbackResponse = buildFallbackResponse({
    fusionPacket,
    responseMode,
    answerPlan,
    continuityState,
    turnMemory
  });

  const assembled = assembleResponse({
    fusionPacket,
    answerPlan,
    responseMode,
    toneEnvelope,
    domainResponse,
    safetyEnvelope,
    fallbackResponse,
    continuityState,
    turnMemory
  });

  const nyxOutput = adaptForNyx(assembled);

  return {
    assembledResponse: assembled,
    nyxOutput
  };
}

module.exports = {
  runLayer4
};
