"use strict";

const { createMarionLearningSignalAdapter } = require("./MarionLearningSignalAdapter");
const { createEvaluator } = require("./MarionLearningEvaluator");
const { createApprovalGate } = require("./MarionLearningApprovalGate");
const { createMarionLearningAuditStore } = require("./MarionLearningAuditStore");
const { createMarionLearningRuntime } = require("./MarionLearningRuntime");
const { createMarionLearningManifestRegistry } = require("./MarionLearningManifestRegistry");
const { createMarionLearningOfflineRunner } = require("./MarionLearningOfflineRunner");
const VERSION = "marion.learningBackendSetup/1.7-bootstrap-preflight-and-registration-confirmation";

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
  // These are supplied by the durable PostgreSQL adapters and index bootstrap.
  // Never report a functional learning backend when a readiness probe is absent.
  if (typeof healthProbe !== "function" || typeof offlineEvaluationReady !== "function") {
    throw new TypeError("private learning readiness probes are required");
  }
  if (typeof captureEnabled !== "boolean") throw new TypeError("captureEnabled must be boolean");
  // Verify *all* synchronous registration/confirmation hooks before constructing
  // any learning component, especially before mutating gateway singleton state.
  // An explicitly supplied gateway is authoritative: no fallback on failure.
  const gatewayModule = gateway == null ? require("../MarionVoiceGateway.js") : gateway;
  if (!gatewayModule || typeof gatewayModule.registerMarionLearningRuntime !== "function") {
    throw new Error("Gateway learning registration hook is unavailable");
  }
  if (typeof gatewayModule.getMarionLearningIntegrationStatus !== "function" ||
      typeof gatewayModule.getMarionLearningRuntime !== "function") {
    throw new Error("gateway_learning_registration_confirmation_unavailable");
  }

  const auditStore = createMarionLearningAuditStore({ durableAppend: durableAuditAppend });
  const manifestRegistry = createMarionLearningManifestRegistry({
    manifestSource, registrationStore: manifestRegistryStore, verifyFixtureSet,
    verifyFixtureReview, issueFixtureReview, auditStore
  });
  if (typeof manifestRegistry.issueFixtureReview !== "function" ||
      typeof manifestRegistry.approveManifest !== "function" ||
      typeof manifestRegistry.authorizeEvaluation !== "function" ||
      typeof manifestRegistry.selectApprovedManifest !== "function" ||
      typeof manifestRegistry.listApproved !== "function" ||
      typeof manifestRegistry.revokeManifest !== "function") {
    throw new Error("owner_fixture_review_workflow_unavailable");
  }
  // Setup constructs the runner itself so callers cannot accidentally inject
  // a runVersion function that skips registry authorization.
  const offlineRunner = createMarionLearningOfflineRunner({
    resolveVersion, loadFixture, scoreFixture, authorizeEvaluation: manifestRegistry.authorizeEvaluation
  });
  if (!offlineRunner || typeof offlineRunner.runVersion !== "function") {
    throw new Error("offline_runner_contract_invalid");
  }
  const signalAdapter = createMarionLearningSignalAdapter({ signalStore });
  const evaluator = createEvaluator({ runVersion: offlineRunner.runVersion, auditStore });
  const approvalGate = createApprovalGate({ proposalStore, auditStore });
  const runtime = createMarionLearningRuntime({ signalAdapter, evaluator, approvalGate, manifestRegistry,
    healthProbe, offlineEvaluationReady, captureEnabled });
  // Registration is deliberately last: only a fully constructed, contract-valid
  // backend is exposed to the gateway. This is not a live-learning activation.
  if (!runtime || typeof runtime.evaluateCandidate !== "function" ||
      typeof runtime.getPrivateHealth !== "function" ||
      typeof runtime.listApprovedManifests !== "function") {
    throw new Error("learning_runtime_contract_invalid");
  }
  const registration = gatewayModule.registerMarionLearningRuntime(runtime);
  if (!registration || typeof registration.then === "function" ||
      registration.ok !== true || registration.registered !== true) {
    throw new Error("gateway_learning_registration_rejected");
  }
  // The bootstrap in index.js requires a synchronous, confirmed registration.
  // Both confirmation hooks are mandatory: a reported status alone does not
  // prove that the gateway holds the runtime constructed above.
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
