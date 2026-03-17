// runtime/layer4/index.js

const { resolveResponseMode } = require('./ResponseModeResolver');
const { buildToneEnvelope } = require('./ToneEnvelopeBuilder');
const { composeDomainResponse } = require('./DomainResponseComposer');
const { buildSafetyEnvelope } = require('./SafetyEnvelope');
const { buildFallbackResponse } = require('./FallbackResponseBuilder');
const { assembleResponse } = require('./ResponseAssembler');
const { adaptForNyx } = require('./NyxOutputAdapter');

async function runLayer4({ fusionPacket = {}, answerPlan = {} } = {}) {
  const responseMode = resolveResponseMode({ fusionPacket, answerPlan });
  const toneEnvelope = buildToneEnvelope({ fusionPacket, responseMode });
  const domainResponse = composeDomainResponse({ fusionPacket, answerPlan, responseMode });
  const safetyEnvelope = buildSafetyEnvelope({ fusionPacket, responseMode, toneEnvelope });
  const fallbackResponse = buildFallbackResponse({ fusionPacket, responseMode });

  const assembled = assembleResponse({
    fusionPacket,
    answerPlan,
    responseMode,
    toneEnvelope,
    domainResponse,
    safetyEnvelope,
    fallbackResponse
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
