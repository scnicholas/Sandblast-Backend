"use strict";

const { processWithMarion } = require("./marionBridge");

function _safeObj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _trim(v) { return v == null ? "" : String(v).trim(); }

async function runCognitivePipeline(input = {}) {
  const normalizedInput = {
    userQuery: input.userQuery || input.query || input.text || "",
    requestedDomain: input.requestedDomain || input.domain || "",
    conversationState: _safeObj(input.conversationState || input.state),
    datasets: _safeArray(input.datasets),
    previousMemory: _safeObj(input.previousMemory),
    domainEvidence: _safeArray(input.domainEvidence),
    datasetEvidence: _safeArray(input.datasetEvidence),
    memoryEvidence: _safeArray(input.memoryEvidence),
    generalEvidence: _safeArray(input.generalEvidence)
  };

  const marionResult = await processWithMarion(normalizedInput);
  const meta = _safeObj(marionResult.meta);
  const layer2 = _safeObj(marionResult.layer2);
  const diagnostics = _safeObj(layer2.diagnostics);
  const evidenceCounts = _safeObj(diagnostics.layer2EvidenceCounts);

  return {
    ok: !!marionResult.ok,
    partial: !!marionResult.partial,
    pipeline: "layer2-layer3-layer4-layer5",
    result: marionResult,
    reply: _trim(marionResult.reply || marionResult.text || marionResult.message || marionResult.output || marionResult.answer),
    diagnostics: {
      domain: marionResult.domain || normalizedInput.requestedDomain || "general",
      intent: marionResult.intent || "general",
      mode: meta.mode || "balanced",
      continuityHealth: _safeObj(marionResult.turnMemory).continuityHealth || _safeObj(marionResult.continuityState).continuityHealth || "watch",
      recoveryMode: _safeObj(marionResult.turnMemory).recoveryMode || _safeObj(marionResult.continuityState).recoveryMode || "normal",
      evidenceCounts: {
        domain: Number(evidenceCounts.domainEvidence || 0),
        dataset: Number(evidenceCounts.datasetEvidence || 0),
        memory: Number(evidenceCounts.memoryEvidence || 0),
        general: Number(evidenceCounts.generalEvidence || 0)
      },
      linkedDatasets: Array.isArray(meta.linkedDatasets) ? meta.linkedDatasets.slice(0, 12) : []
    }
  };
}

module.exports = { runCognitivePipeline, run: runCognitivePipeline, handle: runCognitivePipeline };
