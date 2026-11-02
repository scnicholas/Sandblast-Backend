"use strict";

const { createMarionLearningSignalAdapter } = require("./MarionLearningSignalAdapter");
const { createEvaluator } = require("./MarionLearningEvaluator");
const { createApprovalGate } = require("./MarionLearningApprovalGate");
const { createMarionLearningAuditStore } = require("./MarionLearningAuditStore");
const { createMarionLearningRuntime } = require("./MarionLearningRuntime");
const { createMarionLearningManifestRegistry } = require("./MarionLearningManifestRegistry");
const { createMarionLearningOfflineRunner } = require("./MarionLearningOfflineRunner");
const VERSION = "marion.learningBackendSetup/1.6-registration-contract-hardened";

function createAndRegisterMarionLearningBackend({
  signalStore, proposalStore, durableAuditAppend, manifestSource, manifestRegistryStore,
  verifyFixtureSet, verifyFixtureReview, issueFixtureReview, resolveVersion, loadFixture, scoreFixture,
  healthProbe, offlineEvaluationReady, captureEnabled = false, gateway
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
  if (typeof manifestRegistry.issueFixtureReview !== "function" ||
      typeof manifestRegistry.approveManifest !== "function") {
    throw new Error("owner_fixture_review_workflow_unavailable");
  }
  // Setup constructs the runner itself so callers cannot accidentally inject
  // a runVersion function that skips registry authorization.
  const offlineRunner = createMarionLearningOfflineRunner({
    resolveVersion, loadFixture, scoreFixture, authorizeEvaluation: manifestRegistry.authorizeEvaluation
  });
  const signalAdapter = createMarionLearningSignalAdapter({ signalStore });
  const evaluator = createEvaluator({ runVersion: offlineRunner.runVersion, auditStore });
  const approvalGate = createApprovalGate({ proposalStore, auditStore });
  const runtime = createMarionLearningRuntime({ signalAdapter, evaluator, approvalGate, manifestRegistry,
    healthProbe, offlineEvaluationReady, captureEnabled });
  // Explicitly supplied gateway is authoritative. Do not fall back to another
  // gateway instance after a failed registration or silently switch module state.
  const gatewayModule = gateway == null ? require("../MarionVoiceGateway.js") : gateway;
  if (!gatewayModule || typeof gatewayModule.registerMarionLearningRuntime !== "function") {
    throw new Error("Gateway learning registration hook is unavailable");
  }
  const registration = gatewayModule.registerMarionLearningRuntime(runtime);
  if (!registration || typeof registration.then === "function" ||
      registration.ok !== true || registration.registered !== true) {
    throw new Error("gateway_learning_registration_rejected");
  }
  // The bootstrap in index.js requires a synchronous, confirmed registration.
  // Both confirmation hooks are mandatory: a reported status alone does not
  // prove that the gateway holds the runtime constructed above.
  if (typeof gatewayModule.getMarionLearningIntegrationStatus !== "function" ||
      typeof gatewayModule.getMarionLearningRuntime !== "function") {
    throw new Error("gateway_learning_registration_confirmation_unavailable");
  }
  const gatewayStatus = gatewayModule.getMarionLearningIntegrationStatus();
  if (!gatewayStatus || gatewayStatus.registered !== true ||
      gatewayModule.getMarionLearningRuntime() !== runtime) {
    throw new Error("gateway_learning_registration_status_unconfirmed");
  }
  // A capture-enabled runtime must not masquerade as activated self-learning.
  // Evaluation and capture remain under their existing private authorization gates.
  return Object.freeze({ VERSION, runtime, auditStore, signalAdapter, evaluator, approvalGate, manifestRegistry, offlineRunner, registration });
}

module.exports = { VERSION, createAndRegisterMarionLearningBackend };
