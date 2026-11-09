"use strict";

// Private, offline Marion Learning signal capture boundary. The durable store
// owns persistence; this adapter must never treat a queued or void write as an ACK.
const Policy = require("./MarionLearningPolicy");
const VERSION = "marion.learningSignalAdapter/1.3-canonical-time-and-failclosed-validation";
const CANONICAL_UTC_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function validRecordedAt(value) {
  if (typeof value !== "string" || !CANONICAL_UTC_ISO.test(value)) return false;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  try { return new Date(time).toISOString() === value; }
  catch (_) { return false; }
}

function failure(reason) {
  return { ok: false, accepted: false, reason };
}

function createMarionLearningSignalAdapter({ signalStore, clock = () => new Date().toISOString() } = {}) {
  if (!signalStore || typeof signalStore.appendSignal !== "function") {
    throw new TypeError("signalStore.appendSignal is required; provide a private durable store in the runtime");
  }
  if (typeof clock !== "function") throw new TypeError("clock must be a function");
  if (!Policy || typeof Policy.validateSignal !== "function") {
    throw new TypeError("MarionLearningPolicy.validateSignal is required");
  }

  async function record(input) {
    let checked;
    try { checked = Policy.validateSignal(input); }
    catch (_) { return failure("learning_signal_validation_failed"); }

    if (!checked || checked.ok !== true) {
      const reason = checked && typeof checked.reason === "string" &&
        /^[a-zA-Z0-9_.:-]{1,120}$/.test(checked.reason)
        ? checked.reason : "learning_signal_invalid";
      return failure(reason);
    }

    // Fail closed if a policy implementation accidentally returns an incomplete
    // success shape. Do not allow a storage ACK with an undefined identity.
    let signal;
    let recordedAt;
    try { recordedAt = clock(); }
    catch (_) { return failure("learning_signal_clock_invalid"); }
    if (!validRecordedAt(recordedAt)) return failure("learning_signal_clock_invalid");
    try {
      if (!checked.signal || typeof checked.signal !== "object" || Array.isArray(checked.signal) ||
          typeof checked.signal.signalId !== "string" || !checked.signal.signalId ||
          typeof checked.signal.scope !== "string" || !checked.signal.scope) {
        return failure("learning_signal_validation_contract_invalid");
      }
      // Match MarionLearningPostgresAdapters' strict recordedAt contract exactly.
      signal = Object.freeze({ ...checked.signal, recordedAt });
      if (signal.signalId !== checked.signal.signalId || signal.scope !== checked.signal.scope) {
        return failure("learning_signal_validation_contract_invalid");
      }
    } catch (_) {
      return failure("learning_signal_validation_contract_invalid");
    }

    let saved;
    try { saved = await signalStore.appendSignal(signal); }
    catch (_) { return failure("learning_signal_persistence_failed"); }

    // A void promise, acknowledged queue, or wrong signalId is not durable proof.
    try {
      if (!saved || saved.ok !== true || saved.persisted !== true ||
          saved.signalId !== signal.signalId) {
        return failure("learning_signal_persistence_unconfirmed");
      }
    } catch (_) { return failure("learning_signal_persistence_unconfirmed"); }

    return {
      ok: true, accepted: true, signalId: signal.signalId, scope: signal.scope,
      transcriptStored: false, audioStored: false
    };
  }

  return Object.freeze({ VERSION, record });
}

module.exports = { VERSION, createMarionLearningSignalAdapter };
