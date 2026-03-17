// runtime/RuntimeOrchestrator.js
"use strict";

const { processWithMarion } = require("./marionBridge");

function _safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

async function runCognitivePipeline(input = {}) {
  const {
    userQuery = "",
    requestedDomain = "",
    conversationState = {},
    datasets = [],
    previousMemory = {},
    domainEvidence = [],
    datasetEvidence = [],
    memoryEvidence = [],
    generalEvidence = []
  } = input;

  const marionResult = await processWithMarion({
    userQuery,
    requestedDomain,
    conversationState,
    datasets,
    previousMemory,
    domainEvidence,
    datasetEvidence,
    memoryEvidence,
    generalEvidence
  });

  return {
    ok: !!marionResult.ok,
    partial: !!marionResult.partial,
    pipeline: "layer2-layer3-layer4-layer5",
    result: marionResult,
    diagnostics: {
      domain: marionResult.domain || requestedDomain || "general",
      intent: marionResult.intent || "general",
      mode: _safeObj(marionResult.meta).mode || "balanced",
      continuityHealth:
        _safeObj(marionResult.turnMemory).continuityHealth ||
        _safeObj(marionResult.continuityState).continuityHealth ||
        "watch",
      recoveryMode:
        _safeObj(marionResult.turnMemory).recoveryMode ||
        _safeObj(marionResult.continuityState).recoveryMode ||
        "normal"
    }
  };
}

module.exports = {
  runCognitivePipeline
};
