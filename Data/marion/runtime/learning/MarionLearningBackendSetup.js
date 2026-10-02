"use strict";

const { createMarionLearningSignalAdapter } = require("./MarionLearningSignalAdapter");
const { createEvaluator } = require("./MarionLearningEvaluator");
const { createApprovalGate } = require("./MarionLearningApprovalGate");
const { createMarionLearningAuditStore } = require("./MarionLearningAuditStore");
const { createMarionLearningRuntime } = require("./MarionLearningRuntime");
const { createMarionLearningManifestRegistry } = require("./MarionLearningManifestRegistry");
const { createMarionLearningOfflineRunner } = require("./MarionLearningOfflineRunner");
const VERSION = "marion.learningBackendSetup/1.2-signed-review-issuer";

function createAndRegisterMarionLearningBackend({
  signalStore, proposalStore, durableAuditAppend, manifestSource, manifestRegistryStore,
  verifyFixtureSet, verifyFixtureReview, issueFixtureReview, resolveVersion, loadFixture, scoreFixture,
  healthProbe, captureEnabled = false, gateway
} = {}) {
  if (!signalStore || typeof signalStore.appendSignal !== "function") throw new TypeError("private durable signalStore.appendSignal is required");
  if (!proposalStore || typeof proposalStore.get !== "function" || typeof proposalStore.set !== "function") throw new TypeError("private durable proposalStore.get/set are required");
  if (typeof durableAuditAppend !== "function") throw new TypeError("private durable durableAuditAppend is required");
  if (!manifestSource || typeof manifestSource.load !== "function" || typeof manifestSource.list !== "function") throw new TypeError("trusted manifestSource.load/list is required");
  if (!manifestRegistryStore || typeof manifestRegistryStore.get !== "function" || typeof manifestRegistryStore.putIfAbsent !== "function" || typeof manifestRegistryStore.listApproved !== "function" || typeof manifestRegistryStore.getRevocation !== "function" || typeof manifestRegistryStore.putRevocationIfAbsent !== "function") throw new TypeError("private durable manifestRegistryStore with revocation support is required");
  if (typeof verifyFixtureSet !== "function" || typeof verifyFixtureReview !== "function" || typeof issueFixtureReview !== "function") throw new TypeError("trusted fixture-set verifier, review verifier, and review issuer are required");
  if (typeof resolveVersion !== "function" || typeof loadFixture !== "function" || typeof scoreFixture !== "function") throw new TypeError("offline resolver, fixture loader, and scorer are required");

  const auditStore = createMarionLearningAuditStore({ durableAppend: durableAuditAppend });
  const manifestRegistry = createMarionLearningManifestRegistry({
    manifestSource, registrationStore: manifestRegistryStore, verifyFixtureSet,
    verifyFixtureReview, issueFixtureReview, auditStore
  });
  // Setup constructs the runner itself so callers cannot accidentally inject
  // a runVersion function that skips registry authorization.
  const offlineRunner = createMarionLearningOfflineRunner({
    resolveVersion, loadFixture, scoreFixture, authorizeEvaluation: manifestRegistry.authorizeEvaluation
  });
  const signalAdapter = createMarionLearningSignalAdapter({ signalStore });
  const evaluator = createEvaluator({ runVersion: offlineRunner.runVersion, auditStore });
  const approvalGate = createApprovalGate({ proposalStore, auditStore });
  const runtime = createMarionLearningRuntime({ signalAdapter, evaluator, approvalGate, manifestRegistry, healthProbe, captureEnabled });
  const gatewayModule = gateway || require("../MarionVoiceGateway.js");
  if (!gatewayModule || typeof gatewayModule.registerMarionLearningRuntime !== "function") {
    throw new Error("Gateway learning registration hook is unavailable");
  }
  const registration = gatewayModule.registerMarionLearningRuntime(runtime);
  return Object.freeze({ VERSION, runtime, auditStore, signalAdapter, evaluator, approvalGate, manifestRegistry, offlineRunner, registration });
}

module.exports = { VERSION, createAndRegisterMarionLearningBackend };
