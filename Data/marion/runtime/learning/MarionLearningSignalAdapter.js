"use strict";

const Policy = require("./MarionLearningPolicy");
const VERSION = "marion.learningSignalAdapter/1.2-strict-persistence-ack";

function createMarionLearningSignalAdapter({ signalStore, clock = () => new Date().toISOString() } = {}) {
  if (!signalStore || typeof signalStore.appendSignal !== "function") {
    throw new TypeError("signalStore.appendSignal is required; provide a private durable store in the runtime");
  }

  async function record(input) {
    const checked = Policy.validateSignal(input);
    if (!checked.ok) return { ok: false, accepted: false, reason: checked.reason };
    const recordedAt = clock();
    if (typeof recordedAt !== "string" || !Number.isFinite(Date.parse(recordedAt))) {
      return { ok: false, accepted: false, reason: "learning_signal_clock_invalid" };
    }
    const signal = Object.freeze({ ...checked.signal, recordedAt });
    let saved;
    try { saved = await signalStore.appendSignal(signal); }
    catch (_) { return { ok: false, accepted: false, reason: "learning_signal_persistence_failed" }; }
    // A void promise / undefined is NOT proof of durable persistence.
    if (!saved || saved.ok !== true || saved.persisted !== true || saved.signalId !== signal.signalId) {
      return { ok: false, accepted: false, reason: "learning_signal_persistence_unconfirmed" };
    }
    return { ok: true, accepted: true, signalId: signal.signalId, scope: signal.scope, transcriptStored: false, audioStored: false };
  }

  return Object.freeze({ VERSION, record });
}

module.exports = { VERSION, createMarionLearningSignalAdapter };
