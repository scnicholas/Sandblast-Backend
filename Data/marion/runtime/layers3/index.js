// runtime/layer3/index.js
"use strict";

const { buildFusionPacket } = require("./FusionKernel");
const { buildAnswerPlan } = require("./AnswerPlanBuilder");

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

async function runLayer3(bundle = {}) {
  const fusionPacket = buildFusionPacket(bundle);
  const answerPlan = buildAnswerPlan(fusionPacket);

  return {
    ok: true,
    layer: "layer3",
    fusionPacket,
    answerPlan,
    diagnostics: {
      ..._safeObj(fusionPacket.diagnostics),
      answerPlanReady: true,
      nyxDirectiveReady: !!_safeObj(answerPlan.nyxDirective).mode
    }
  };
}

module.exports = {
  runLayer3
};
