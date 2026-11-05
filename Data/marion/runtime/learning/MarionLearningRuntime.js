"use strict";

const VERSION = "marion.learningRuntime/1.7-parity-boundary-observability";

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const SCOPES = new Set(["retrieval", "routing", "response_style"]);
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
function ownData(obj, key) {
  if (!isPlainRecord(obj)) return undefined;
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  return desc && Object.prototype.hasOwnProperty.call(desc, "value") ? desc.value : undefined;
}
function isVerifiedOwner(authContext) {
  return ownData(authContext, "authenticated") === true &&
    ownData(authContext, "role") === "owner" &&
    ownData(authContext, "verifiedBy") === "server_middleware" &&
    typeof ownData(authContext, "actorId") === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,199}$/.test(ownData(authContext, "actorId"));
}
function validSelection(value) {
  return isPlainRecord(value) &&
    typeof ownData(value, "datasetId") === "string" && ID_RE.test(ownData(value, "datasetId")) &&
    typeof ownData(value, "version") === "string" && ID_RE.test(ownData(value, "version")) &&
    SCOPES.has(ownData(value, "scope"));
}
function copyJsonRecord(value, maxBytes) {
  if (!isPlainRecord(value)) throw new TypeError("invalid_learning_input");
  let nodes = 0;
  const ancestors = new WeakSet();
  function visit(node, depth) {
    if (++nodes > 10000 || depth > 20) throw new TypeError("learning_input_limit_exceeded");
    if (node === null || typeof node === "string" || typeof node === "boolean") return node;
    if (typeof node === "number" && Number.isFinite(node)) return node;
    if (typeof node !== "object" || ancestors.has(node) ||
        (!Array.isArray(node) && !isPlainRecord(node))) throw new TypeError("invalid_learning_input");
    ancestors.add(node);
    try {
      if (Array.isArray(node)) {
        if (Reflect.ownKeys(node).length !== node.length + 1) throw new TypeError("invalid_learning_input");
        const output = [];
        for (let i = 0; i < node.length; i++) {
          const d = Object.getOwnPropertyDescriptor(node, String(i));
          if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, "value")) throw new TypeError("invalid_learning_input");
          output.push(visit(d.value, depth + 1));
        }
        return output;
      }
      const output = Object.create(null);
      for (const key of Reflect.ownKeys(node)) {
        if (typeof key !== "string" || FORBIDDEN.has(key)) throw new TypeError("invalid_learning_input");
        const d = Object.getOwnPropertyDescriptor(node, key);
        if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, "value")) throw new TypeError("invalid_learning_input");
        output[key] = visit(d.value, depth + 1);
      }
      return output;
    } finally { ancestors.delete(node); }
  }
  const out = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(out), "utf8") > maxBytes) throw new TypeError("learning_input_limit_exceeded");
  return out;
}
function rejection(reason) { return { ok: false, reason }; }

// Only count metadata is observed at this boundary. The Evaluator is the source
// of parity results; the Runtime must never infer or manufacture reply counts.
function parityBoundaryStatus(result) {
  const diagnostics = ownData(result, "diagnostics");
  if (!isPlainRecord(diagnostics)) return "missing_upstream";
  const parity = ownData(diagnostics, "replyParity");
  if (parity === undefined) return "missing_upstream";
  if (!isPlainRecord(parity)) return "invalid_upstream";
  const report = ownData(result, "report");
  const sampleCount = ownData(report, "sampleCount");
  const compared = ownData(parity, "comparedCaseCount");
  const identical = ownData(parity, "identicalReplyCount");
  const different = ownData(parity, "differentReplyCount");
  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 500 ||
      !Number.isSafeInteger(compared) || compared !== sampleCount ||
      !Number.isSafeInteger(identical) || identical < 0 ||
      !Number.isSafeInteger(different) || different < 0 ||
      identical + different !== compared ||
      ownData(parity, "fingerprintsExposed") !== false ||
      ownData(parity, "normalization") !== "NFKC-whitespace-collapse" ||
      Reflect.ownKeys(parity).some(key => typeof key !== "string" ||
        !["comparedCaseCount", "identicalReplyCount", "differentReplyCount", "normalization", "fingerprintsExposed"].includes(key))) {
    return "invalid_upstream";
  }
  return "available";
}

function annotateEvaluationBoundary(result) {
  // A failed candidate is still an evaluation success; do not transform an
  // already-audited result into a transport error because parity is missing.
  if (!isPlainRecord(result) || ownData(result, "ok") !== true ||
      !isPlainRecord(ownData(result, "report"))) return result;
  // Read own data descriptors only: no accessors or arbitrary object code.
  const snapshot = Object.create(null);
  for (const key of Reflect.ownKeys(result)) {
    if (typeof key !== "string" || FORBIDDEN.has(key)) return result;
    const d = Object.getOwnPropertyDescriptor(result, key);
    if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, "value")) return result;
    snapshot[key] = d.value;
  }
  if (Object.prototype.hasOwnProperty.call(snapshot, "runtimeDiagnosticBoundary")) return result;
  snapshot.runtimeDiagnosticBoundary = Object.freeze({
    replyParity: parityBoundaryStatus(result)
  });
  return snapshot;
}

function createMarionLearningRuntime({ signalAdapter, evaluator, approvalGate, manifestRegistry,
  healthProbe = async () => ({ ready: false }), offlineEvaluationReady = async () => false,
  captureEnabled = false } = {}) {
  if (typeof healthProbe !== "function" || typeof offlineEvaluationReady !== "function") throw new TypeError("learning readiness probes must be functions");
  if (!signalAdapter || typeof signalAdapter.record !== "function") throw new TypeError("signalAdapter.record is required");
  if (!evaluator || typeof evaluator.evaluate !== "function") throw new TypeError("evaluator.evaluate is required");
  if (!approvalGate || typeof approvalGate.submitEvaluation !== "function" || typeof approvalGate.decide !== "function") throw new TypeError("approvalGate methods are required");
  if (!manifestRegistry || typeof manifestRegistry.listAvailable !== "function" ||
      typeof manifestRegistry.issueFixtureReview !== "function" || typeof manifestRegistry.approveManifest !== "function" || typeof manifestRegistry.revokeManifest !== "function" || typeof manifestRegistry.listApproved !== "function" ||
      typeof manifestRegistry.selectApprovedManifest !== "function") throw new TypeError("trusted manifestRegistry methods are required");

  async function captureFinalOutcome(event) {
    if (captureEnabled !== true) return { ok: false, accepted: false, reason: "learning_disabled" };
    const src = isPlainRecord(event) ? event : {};
    if (ownData(src, "finalAccepted") !== true) return { ok: false, accepted: false, reason: "final_response_not_accepted" };
    if (ownData(src, "learningConsent") !== true) return { ok: false, accepted: false, reason: "learning_consent_required" };
    // Whitelist scalar metadata; never forward the response, prompt, transcript, or request body.
    const signal = {
      signalId: ownData(src, "signalId"),
      signalClass: ownData(src, "signalClass"),
      scope: ownData(src, "scope"),
      sourceSubsystem: ownData(src, "sourceSubsystem"),
      outcomeScore: ownData(src, "outcomeScore"),
      occurredAt: ownData(src, "occurredAt")
    };
    try {
      const result = await signalAdapter.record(signal);
      if (ownData(result, "ok") !== true || ownData(result, "accepted") !== true) {
        return { ok: false, accepted: false, reason: "learning_signal_persistence_unconfirmed" };
      }
      // No adapter-controlled fields, tokens or arbitrary objects leave the runtime.
      return Object.freeze({ ok: true, accepted: true });
    } catch (_) {
      return { ok: false, accepted: false, reason: "learning_signal_persistence_failed" };
    }
  }

  async function listAvailableManifests(authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    return manifestRegistry.listAvailable(authContext);
  }

  async function approveManifest(selection, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    if (!validSelection(selection) || typeof ownData(selection, "reviewRef") !== "string" || !ID_RE.test(ownData(selection, "reviewRef"))) return rejection("invalid_manifest_approval_request");
    return manifestRegistry.approveManifest({ datasetId: ownData(selection, "datasetId"), version: ownData(selection, "version"), scope: ownData(selection, "scope"), reviewRef: ownData(selection, "reviewRef") }, authContext);
  }

  async function issueFixtureReview(selection, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    if (!validSelection(selection) || ownData(selection, "ownerConsent") !== true ||
        typeof ownData(selection, "reviewRef") !== "string" || !ID_RE.test(ownData(selection, "reviewRef")) ||
        typeof ownData(selection, "reviewId") !== "string" || !ID_RE.test(ownData(selection, "reviewId"))) return rejection("explicit_owner_review_consent_required");
    return manifestRegistry.issueFixtureReview({datasetId: ownData(selection, "datasetId"), version: ownData(selection, "version"), scope: ownData(selection, "scope"), reviewRef: ownData(selection, "reviewRef"), reviewId: ownData(selection, "reviewId"), ownerConsent: true}, authContext);
  }

  async function revokeManifest(selection, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    if (!isPlainRecord(selection) || !ID_RE.test(ownData(selection, "datasetId") || "") ||
        !ID_RE.test(ownData(selection, "version") || "") || !ID_RE.test(ownData(selection, "reasonCode") || "")) return rejection("invalid_manifest_revocation_request");
    return manifestRegistry.revokeManifest({ datasetId: ownData(selection, "datasetId"), version: ownData(selection, "version"), reasonCode: ownData(selection, "reasonCode") }, authContext);
  }

  async function listApprovedManifests(scope, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    if (scope !== undefined && !SCOPES.has(scope)) return rejection("invalid_manifest_scope");
    return manifestRegistry.listApproved(scope, authContext);
  }

  async function evaluationReadiness() {
    let storageReady = false;
    let offlineReady = false;
    try {
      const dependencyStatus = await healthProbe();
      storageReady = !!(dependencyStatus && dependencyStatus.ready === true);
    } catch (_) { storageReady = false; }
    try { offlineReady = await offlineEvaluationReady() === true; }
    catch (_) { offlineReady = false; }
    return Object.freeze({
      ready: storageReady && offlineReady,
      storageReady,
      offlineReady,
      reason: !storageReady ? "durable_storage_not_ready" :
        !offlineReady ? "offline_evaluation_handlers_not_registered" : "ready"
    });
  }

  async function evaluateCandidate(candidate, selection, authContext) {
    if (!isVerifiedOwner(authContext)) return rejection("owner_authentication_required");
    if (!validSelection(selection)) return rejection("invalid_manifest_selection");
    let safeCandidate;
    try { safeCandidate = copyJsonRecord(candidate, 65536); }
    catch (_) { return rejection("invalid_learning_candidate"); }
    const requested = { datasetId: ownData(selection, "datasetId"), version: ownData(selection, "version"), scope: ownData(selection, "scope") };
    const readiness = await evaluationReadiness();
    if (!readiness.ready) return rejection(readiness.reason);
    let selected;
    try { selected = await manifestRegistry.selectApprovedManifest(requested, authContext); }
    catch (_) { return rejection("manifest_selection_unavailable"); }
    if (ownData(selected, "ok") !== true) return rejection("manifest_selection_failed");
    if (!isPlainRecord(ownData(selected, "manifest")) || !isPlainRecord(ownData(selected, "registration"))) return rejection("approved_manifest_contract_invalid");
    const record = ownData(selected, "registration");
    if (ownData(record, "status") !== "approved" ||
        ownData(record, "datasetId") !== requested.datasetId || ownData(record, "version") !== requested.version ||
        ownData(record, "scope") !== requested.scope) return rejection("approved_manifest_contract_invalid");
    // Do not bypass the trusted registry's fixture and revocation checks.
    // Existing evaluator receives the same three positional arguments.
    try {
      const result = await evaluator.evaluate(safeCandidate, ownData(selected, "manifest"), record);
      return annotateEvaluationBoundary(result);
    } catch (_) { return rejection("offline_evaluation_unavailable"); }
  }

  async function submitEvaluation(report, authContext) {
    if (!isVerifiedOwner(authContext)) return rejection("owner_authentication_required");
    let safeReport;
    try { safeReport = copyJsonRecord(report, 262144); }
    catch (_) { return rejection("invalid_evaluation_report"); }
    const readiness = await evaluationReadiness();
    if (!readiness.ready) return rejection(readiness.reason);
    try { return await approvalGate.submitEvaluation(safeReport); }
    catch (_) { return rejection("evaluation_submission_unavailable"); }
  }

  async function decideProposal(input, authContext) {
    if (!isVerifiedOwner(authContext)) return rejection("owner_authentication_required");
    let safeInput;
    try { safeInput = copyJsonRecord(input, 65536); }
    catch (_) { return rejection("invalid_proposal_decision"); }
    // The server-verified context overrides any client-supplied authentication fields.
    try { return await approvalGate.decide({ ...safeInput, authContext }); }
    catch (_) { return rejection("proposal_decision_unavailable"); }
  }

  async function getPrivateHealth(authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, status: 403, reason: "owner_authentication_required" };
    const readiness = await evaluationReadiness();
    return {
      ok: true, status: readiness.ready ? 200 : 503,
      service: "marion-learning-runtime", version: VERSION,
      mode: "offline_candidate_evaluation_only",
      ready: readiness.ready, storageReady: readiness.storageReady, offlineReady: readiness.offlineReady, liveActivationEnabled: false,
      reason: readiness.reason,
      transcriptStorageEnabled: false, audioStorageEnabled: false,
      dependencies: {
        signalCapture: captureEnabled === true,
        offlineEvaluation: readiness.offlineReady,
        approvalGate: true,
        manifestRegistry: true,
        privateDurableStores: readiness.storageReady
      }
    };
  }

  return Object.freeze({ VERSION, captureFinalOutcome, listAvailableManifests, issueFixtureReview, approveManifest, revokeManifest, listApprovedManifests, evaluateCandidate, submitEvaluation, decideProposal, getPrivateHealth });
}

module.exports = { VERSION, createMarionLearningRuntime, isVerifiedOwner };
