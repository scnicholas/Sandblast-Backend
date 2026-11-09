"use strict";

const crypto = require("node:crypto");

const { createMarionLearningSignalAdapter } = require("./MarionLearningSignalAdapter");
const { createEvaluator } = require("./MarionLearningEvaluator");
const { createApprovalGate } = require("./MarionLearningApprovalGate");
const { createMarionLearningAuditStore } = require("./MarionLearningAuditStore");
const { createMarionLearningRuntime } = require("./MarionLearningRuntime");
const { createMarionLearningManifestRegistry } = require("./MarionLearningManifestRegistry");
const { createMarionLearningOfflineRunner } = require("./MarionLearningOfflineRunner");
const VERSION = "marion.learningBackendSetup/2.1-private-persistence-validation-hardening";

// Private, explicit verification only: never called during construction or boot.
// Authorization must be verified by the existing private admin boundary supplied
// by the caller. This module intentionally does not issue tokens or create routes.
const PERSISTENCE_TEST_ID_RE = /^marion_persistence_test_[A-Za-z0-9_-]{12,80}$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

function canonicalJson(value) {
  const state = { count: 0, seen: new Set() };
  function visit(item, depth) {
    if (++state.count > 10000 || depth > 32) throw new TypeError("invalid_persistence_test_record");
    if (item === null || typeof item === "boolean" || typeof item === "string") return JSON.stringify(item);
    if (typeof item === "number" && Number.isFinite(item)) return JSON.stringify(item);
    if (!item || typeof item !== "object" || state.seen.has(item)) throw new TypeError("invalid_persistence_test_record");
    const isArray = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (!isArray && prototype !== Object.prototype && prototype !== null)
      throw new TypeError("invalid_persistence_test_record");
    const descriptors = Object.getOwnPropertyDescriptors(item);
    state.seen.add(item);
    let result;
    if (isArray) {
      const length = item.length;
      if (Reflect.ownKeys(descriptors).length !== length + 1) throw new TypeError("invalid_persistence_test_record");
      const entries = [];
      for (let i = 0; i < length; i++) {
        const entry = descriptors[String(i)];
        if (!entry || !Object.prototype.hasOwnProperty.call(entry, "value") || entry.enumerable !== true)
          throw new TypeError("invalid_persistence_test_record");
        entries.push(visit(entry.value, depth + 1));
      }
      result = `[${entries.join(",")}]`;
    } else {
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some(k => typeof k !== "string" || ["__proto__", "prototype", "constructor"].includes(k) ||
          !descriptors[k].enumerable || !Object.prototype.hasOwnProperty.call(descriptors[k], "value")))
        throw new TypeError("invalid_persistence_test_record");
      result = `{${keys.sort().map(k => `${JSON.stringify(k)}:${visit(descriptors[k].value, depth + 1)}`).join(",")}}`;
    }
    state.seen.delete(item);
    return result;
  }
  return visit(value, 0);
}

function persistenceDigest(record) {
  const canonical = canonicalJson(record);
  if (Buffer.byteLength(canonical, "utf8") > 65536) throw new TypeError("persistence_test_record_too_large");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// The same record ID and digest must be retained OUTSIDE the Render process to
// run read_after_restart after a real deployment restart. No writes on this path.
async function verifyMarionLearningPersistence({
  proposalStore, healthProbe, confirmPrivateAuthorization,
  mode, proposalId, draftRecord, expectedDigest
} = {}) {
  if (!proposalStore || typeof proposalStore.get !== "function" || typeof proposalStore.set !== "function") {
    throw new TypeError("private_durable_proposal_store_required");
  }
  if (typeof healthProbe !== "function") throw new TypeError("private_database_health_probe_required");
  if (typeof confirmPrivateAuthorization !== "function") throw new TypeError("private_authorization_checker_required");
  if (mode !== "write_read" && mode !== "read_after_restart") throw new TypeError("invalid_persistence_test_mode");
  if (typeof proposalId !== "string" || !PERSISTENCE_TEST_ID_RE.test(proposalId)) {
    throw new TypeError("invalid_persistence_test_id");
  }
  // Authorization is checked before touching storage or probing database state.
  if (await confirmPrivateAuthorization() !== true) {
    return Object.freeze({ ok: false, stage: "authorization", reason: "private_authorization_required" });
  }
  let readiness;
  try { readiness = await healthProbe(); }
  catch (_) { return Object.freeze({ ok: false, stage: "database_probe", reason: "database_probe_failed" }); }
  if (!readiness || readiness.ready !== true) {
    return Object.freeze({ ok: false, stage: "database_probe", reason: "database_not_ready" });
  }

  if (mode === "write_read") {
    if (!draftRecord || typeof draftRecord !== "object" || Array.isArray(draftRecord) ||
        draftRecord.proposalId !== proposalId || draftRecord.state !== "draft" ||
        draftRecord.approved === true || draftRecord.validated === true ||
        draftRecord.liveBehaviorChanged !== false || draftRecord.validated !== false ||
         draftRecord.approved !== false) {
      throw new TypeError("invalid_draft_persistence_test_record");
    }
    const digest = persistenceDigest(draftRecord);
    // Never overwrite an existing record: proposalStore.set can update draft rows.
    let existing;
    try { existing = await proposalStore.get(proposalId); }
    catch (_) { return Object.freeze({ ok: false, stage: "prewrite", reason: "persistence_prewrite_check_failed" }); }
    if (existing !== null) {
      return Object.freeze({ ok: false, stage: "prewrite", reason: "test_id_already_exists" });
    }
    try { await proposalStore.set(proposalId, draftRecord); }
    catch (_) { return Object.freeze({ ok: false, stage: "write", reason: "persistence_write_failed" }); }
    let stored;
    try { stored = await proposalStore.get(proposalId); }
    catch (_) { return Object.freeze({ ok: false, stage: "read", reason: "persistence_read_failed" }); }
    if (stored === null) return Object.freeze({ ok: false, stage: "read", reason: "record_missing_after_write" });
    let storedDigest;
    try { storedDigest = persistenceDigest(stored); }
    catch (_) { return Object.freeze({ ok: false, stage: "read", reason: "persisted_record_invalid" }); }
    if (storedDigest !== digest) return Object.freeze({ ok: false, stage: "comparison", reason: "record_digest_mismatch" });
    return Object.freeze({ ok: true, stage: "write_read", persisted: true, digest, proposalId,
      restartVerificationRequired: true });
  }

  if (typeof expectedDigest !== "string" || !SHA256_RE.test(expectedDigest)) {
    throw new TypeError("expected_persistence_digest_required");
  }
  let persisted;
  try { persisted = await proposalStore.get(proposalId); }
  catch (_) { return Object.freeze({ ok: false, stage: "read_after_restart", reason: "persistence_read_failed" }); }
  if (persisted === null) return Object.freeze({ ok: false, stage: "read_after_restart", reason: "record_missing_after_restart" });
  let actualDigest;
  try { actualDigest = persistenceDigest(persisted); }
  catch (_) { return Object.freeze({ ok: false, stage: "read_after_restart", reason: "persisted_record_invalid" }); }
  return Object.freeze({ ok: actualDigest === expectedDigest, stage: "read_after_restart",
    reason: actualDigest === expectedDigest ? "durability_verified" : "record_digest_mismatch",
    proposalId, durabilityVerified: actualDigest === expectedDigest });
}

function createAndRegisterMarionLearningBackend({
  signalStore, proposalStore, durableAuditAppend, manifestSource, manifestRegistryStore,
  verifyFixtureSet, verifyFixtureReview, issueFixtureReview, resolveVersion, loadFixture, scoreFixture,
  healthProbe, offlineEvaluationReady, captureEnabled = false, gateway,
  offlineVersionRegistry, offlineVersionIds
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
  // Optional explicit proof, supplied by index.js. Existing standalone callers
  // without these parameters retain the prior API contract.
  if (offlineVersionRegistry !== undefined || offlineVersionIds !== undefined) {
    if (!(offlineVersionRegistry instanceof Map) || !Array.isArray(offlineVersionIds) ||
        offlineVersionIds.length !== 2 || new Set(offlineVersionIds).size !== 2 ||
        offlineVersionIds.some(id => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(id)) ||
        offlineVersionIds.some(id => {
          const entry = Map.prototype.get.call(offlineVersionRegistry, id);
          return !entry || entry.version !== id || entry.mode !== "offline" ||
            typeof entry.runOffline !== "function" || !Array.isArray(entry.bindings) || !entry.bindings.length;
        })) throw new Error("offline_required_versions_not_registered");
  }
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
  // A registered gateway is not proof that its evaluation dependencies are callable.
  // Validate method contracts before making the runtime discoverable.
  if (!signalAdapter || typeof signalAdapter.record !== "function" ||
      !evaluator || typeof evaluator.evaluate !== "function" ||
      !approvalGate || typeof approvalGate.submitEvaluation !== "function" ||
      typeof approvalGate.decide !== "function") {
    throw new Error("learning_evaluation_dependency_contract_invalid");
  }
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

module.exports = { VERSION, createAndRegisterMarionLearningBackend, verifyMarionLearningPersistence };
