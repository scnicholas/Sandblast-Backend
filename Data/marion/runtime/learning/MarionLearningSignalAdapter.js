"use strict";

const Policy = require("./MarionLearningPolicy");
const VERSION = "marion.learningSignalAdapter/1.0";

function createMarionLearningSignalAdapter({ signalStore, clock = () => new Date().toISOString() } = {}) {
  if (!signalStore || typeof signalStore.appendSignal !== "function") {
    throw new TypeError("signalStore.appendSignal is required; provide a private durable store in the runtime");
  }

  async function record(input) {
    const checked = Policy.validateSignal(input);
    if (!checked.ok) return { ok: false, accepted: false, reason: checked.reason };
    const signal = Object.freeze({ ...checked.signal, recordedAt: clock() });
    await signalStore.appendSignal(signal);
    return { ok: true, accepted: true, signalId: signal.signalId, scope: signal.scope, transcriptStored: false, audioStored: false };
  }

  return Object.freeze({ VERSION, record });
}

module.exports = { VERSION, createMarionLearningSignalAdapter };
