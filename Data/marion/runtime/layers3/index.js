// runtime/layer3/index.js

const { buildFusionPacket } = require('./FusionKernel');
const { buildAnswerPlan } = require('./AnswerPlanBuilder');

async function runLayer3(bundle = {}) {
  const fusionPacket = buildFusionPacket(bundle);
  const answerPlan = buildAnswerPlan(fusionPacket);

  return {
    fusionPacket,
    answerPlan
  };
}

module.exports = {
  runLayer3
};
