"use strict";

// Trusted manifest selection and immutable approval registry. A manifest file
// is only a candidate until an owner-approved, fixture-bound record is stored.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const Dataset = require("./MarionLearningDataset");
const { isVerifiedOwner } = require("./MarionLearningRuntime");

const VERSION = "marion.learningManifestRegistry/1.1-owner-issued-review";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);
const MAX_MANIFEST_BYTES = 1024 * 1024;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashManifest(manifest) {
  return crypto.createHash("sha256").update(stableJson(manifest)).digest("hex");
}

function registrationKey(datasetId, version) { return `${datasetId}@${version}`; }

function createFileManifestSource({ directory } = {}) {
  if (typeof directory !== "string" || !directory.trim() || !path.isAbsolute(directory)) {
    throw new TypeError("manifest directory must be an absolute path");
  }
  const root = path.resolve(directory);

  async function load(datasetId, version) {
    if (!ID_RE.test(datasetId || "") || !ID_RE.test(version || "")) throw new Error("invalid_manifest_reference");
    const matches = (await list()).filter(item => item && item.datasetId === datasetId && item.version === version);
    if (matches.length !== 1) throw new Error(matches.length ? "duplicate_manifest_identity" : "manifest_not_found");
    return matches[0];
  }

  async function list() {
    const rootReal = await fs.realpath(root);
    const roots = [rootReal];
    for (const name of ["drafts", "approved"]) {
      const candidate = path.join(rootReal, name);
      try {
        const stat = await fs.lstat(candidate);
        if (stat.isDirectory() && !stat.isSymbolicLink()) roots.push(await fs.realpath(candidate));
      } catch (error) { if (!error || error.code !== "ENOENT") throw error; }
    }
    const output = [];
    for (const directory of roots) {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const fullPath = path.join(directory, entry.name);
        const stat = await fs.lstat(fullPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MANIFEST_BYTES) continue;
        try { output.push(JSON.parse(await fs.readFile(fullPath, "utf8"))); } catch (_) { /* malformed drafts are omitted */ }
      }
    }
    return output;
  }

  return Object.freeze({ load, list, directory: root });
}

function exactRegistration(record, dataset, scope, manifestHashValue, fixtureSetHash) {
  return !!record && record.status === "approved" && record.datasetId === dataset.datasetId &&
    record.version === dataset.version && record.fixtureStore === dataset.fixtureStore &&
    record.scope === scope && record.manifestHash === manifestHashValue &&
    record.fixtureSetHash === fixtureSetHash && Array.isArray(record.caseIds) &&
    record.caseIds.length === dataset.caseIds.length && record.caseIds.every((id, i) => id === dataset.caseIds[i]);
}

function createMarionLearningManifestRegistry({ manifestSource, registrationStore, verifyFixtureSet, verifyFixtureReview, issueFixtureReview, auditStore } = {}) {
  if (!manifestSource || typeof manifestSource.load !== "function" || typeof manifestSource.list !== "function") {
    throw new TypeError("manifestSource.load/list are required");
  }
  if (!registrationStore || typeof registrationStore.get !== "function" ||
      typeof registrationStore.putIfAbsent !== "function" || typeof registrationStore.listApproved !== "function" ||
      typeof registrationStore.getRevocation !== "function" || typeof registrationStore.putRevocationIfAbsent !== "function") {
    throw new TypeError("private durable registrationStore and revocation methods are required");
  }
  if (typeof verifyFixtureSet !== "function" || typeof verifyFixtureReview !== "function" ||
      typeof issueFixtureReview !== "function") {
    throw new TypeError("trusted fixture-set verifier and fixture-review issue/verify callbacks are required");
  }
  if (!auditStore || typeof auditStore.append !== "function") throw new TypeError("durable auditStore.append is required");

  async function readAndValidate(datasetId, version) {
    const raw = await manifestSource.load(datasetId, version);
    const checked = Dataset.validateEvaluationSet(raw);
    if (!checked.ok) throw new Error(`manifest_invalid:${checked.reason}`);
    if (checked.dataset.datasetId !== datasetId || checked.dataset.version !== version) throw new Error("manifest_identity_mismatch");
    return { raw, dataset: checked.dataset, manifestHash: hashManifest(raw) };
  }

  async function listAvailable(authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    const manifests = await manifestSource.list();
    const result = [];
    for (const raw of manifests) {
      const checked = Dataset.validateEvaluationSet(raw);
      if (!checked.ok) continue;
      const dataset = checked.dataset;
      const hash = hashManifest(raw);
      const key = registrationKey(dataset.datasetId, dataset.version);
      const record = await registrationStore.get(key);
      const revoked = !!(await registrationStore.getRevocation(key));
      const approved = !revoked && !!record && record.status === "approved" && record.manifestHash === hash && record.fixtureStore === dataset.fixtureStore;
      result.push(Object.freeze({
        datasetId: dataset.datasetId, version: dataset.version, fixtureStore: dataset.fixtureStore,
        caseCount: dataset.caseIds.length, manifestHash: hash,
        status: revoked ? "revoked" : approved ? "approved" : record ? "registered_content_mismatch" : "pending_fixture_review"
      }));
    }
    return { ok: true, manifests: Object.freeze(result) };
  }

  async function issueOwnerFixtureReview({ datasetId, version, scope, reviewRef, reviewId, ownerConsent } = {}, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    const resolvedReviewId = reviewId || reviewRef;
    if (!ID_RE.test(datasetId || "") || !ID_RE.test(version || "") || !ALLOWED_SCOPES.has(scope) ||
        !ID_RE.test(reviewRef || "") || !ID_RE.test(resolvedReviewId || "") || ownerConsent !== true) {
      return { ok: false, reason: "explicit_owner_review_consent_required" };
    }
    try {
      const { dataset, manifestHash: manifestHashValue } = await readAndValidate(datasetId, version);
      const fixtureSet = await verifyFixtureSet({
        datasetId, version, fixtureStore: dataset.fixtureStore, caseIds: dataset.caseIds, mode: "review"
      });
      if (!fixtureSet || fixtureSet.ok !== true || fixtureSet.syntheticOnly !== true ||
          fixtureSet.datasetId !== datasetId || fixtureSet.version !== version ||
          fixtureSet.fixtureStore !== dataset.fixtureStore || fixtureSet.scope !== scope ||
          fixtureSet.caseCount !== dataset.caseIds.length || !HASH_RE.test(fixtureSet.fixtureSetHash || "")) {
        return { ok: false, reason: "fixture_set_not_verified" };
      }
      const review = await issueFixtureReview({
        reviewRef, reviewId: resolvedReviewId, approvedBy: authContext.actorId, datasetId, version, scope,
        fixtureStore: dataset.fixtureStore, manifestHash: manifestHashValue,
        fixtureSetHash: fixtureSet.fixtureSetHash, ownerConsent: true,
        caseIds: dataset.caseIds, caseCount: dataset.caseIds.length
      });
      if (!review || review.approved !== true || review.reviewRef !== reviewRef ||
          review.reviewId !== resolvedReviewId || review.datasetId !== datasetId || review.version !== version ||
          review.scope !== scope || review.fixtureStore !== dataset.fixtureStore ||
          review.manifestHash !== manifestHashValue || review.fixtureSetHash !== fixtureSet.fixtureSetHash) {
        return { ok: false, reason: "fixture_review_issue_failed" };
      }
      const publicReview = Object.freeze({ ...review });
      return Object.freeze({ ok: true, status: "issued", ...publicReview, review: publicReview });
    } catch (_) {
      return { ok: false, reason: "fixture_review_issue_failed" };
    }
  }

  async function approveManifest({ datasetId, version, scope, reviewRef } = {}, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    if (!ID_RE.test(datasetId || "") || !ID_RE.test(version || "") || !ALLOWED_SCOPES.has(scope) ||
        typeof reviewRef !== "string" || !ID_RE.test(reviewRef)) return { ok: false, reason: "invalid_manifest_approval_request" };

    const { dataset, manifestHash: manifestHashValue } = await readAndValidate(datasetId, version);
    const fixtureSet = await verifyFixtureSet({
      datasetId, version, fixtureStore: dataset.fixtureStore, caseIds: dataset.caseIds, mode: "approval"
    });
    if (!fixtureSet || fixtureSet.ok !== true || fixtureSet.syntheticOnly !== true ||
        fixtureSet.datasetId !== datasetId || fixtureSet.version !== version ||
        fixtureSet.fixtureStore !== dataset.fixtureStore || fixtureSet.caseCount !== dataset.caseIds.length ||
        !HASH_RE.test(fixtureSet.fixtureSetHash || "")) return { ok: false, reason: "fixture_set_not_verified" };

    const review = await verifyFixtureReview({
      reviewRef, datasetId, version, scope, fixtureStore: dataset.fixtureStore,
      manifestHash: manifestHashValue, fixtureSetHash: fixtureSet.fixtureSetHash,
      caseIds: dataset.caseIds, caseCount: dataset.caseIds.length
    });
    if (!review || review.approved !== true || review.reviewRef !== reviewRef ||
        review.datasetId !== datasetId || review.version !== version || review.scope !== scope ||
        review.fixtureStore !== dataset.fixtureStore || review.manifestHash !== manifestHashValue ||
        review.fixtureSetHash !== fixtureSet.fixtureSetHash) return { ok: false, reason: "fixture_review_not_approved" };

    const record = Object.freeze({
      status: "approved", datasetId, version, scope, fixtureStore: dataset.fixtureStore,
      caseIds: Object.freeze([...dataset.caseIds]), manifestHash: manifestHashValue,
      fixtureSetHash: fixtureSet.fixtureSetHash, reviewRef,
      reviewId: typeof review.reviewId === "string" ? review.reviewId : reviewRef,
      approvedBy: authContext.actorId, approvedAt: new Date().toISOString()
    });
    const key = registrationKey(datasetId, version);
    if (await registrationStore.getRevocation(key)) return { ok: false, reason: "manifest_version_revoked" };
    const existing = await registrationStore.get(key);
    if (existing) {
      if (exactRegistration(existing, dataset, scope, manifestHashValue, fixtureSet.fixtureSetHash)) {
        return { ok: true, status: "already_approved", registration: publicRecord(existing) };
      }
      return { ok: false, reason: "manifest_version_already_registered" };
    }

    // Audit first so a store failure cannot leave an active, unaudited approval.
    await auditStore.append({
      type: "learning_manifest_approval", action: "register_approved_manifest",
      datasetId, version, scope, fixtureStore: dataset.fixtureStore,
      manifestHash: manifestHashValue, fixtureSetHash: fixtureSet.fixtureSetHash,
      caseCount: dataset.caseIds.length, reviewRef,
      actorId: authContext.actorId
    });
    const created = await registrationStore.putIfAbsent(key, record);
    if (!created) return { ok: false, reason: "manifest_registration_race_retry_selection" };
    return { ok: true, status: "approved", registration: publicRecord(record) };
  }

  async function revokeManifest({ datasetId, version, reasonCode } = {}, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    if (!ID_RE.test(datasetId || "") || !ID_RE.test(version || "") || !ID_RE.test(reasonCode || "")) {
      return { ok: false, reason: "invalid_manifest_revocation_request" };
    }
    const key = registrationKey(datasetId, version);
    const record = await registrationStore.get(key);
    if (!record || record.status !== "approved") return { ok: false, reason: "manifest_not_registered" };
    if (await registrationStore.getRevocation(key)) return { ok: true, status: "already_revoked" };
    const revocation = Object.freeze({
      status: "revoked", datasetId, version, manifestHash: record.manifestHash,
      fixtureSetHash: record.fixtureSetHash, reasonCode, revokedBy: authContext.actorId,
      revokedAt: new Date().toISOString()
    });
    await auditStore.append({ type: "learning_manifest_approval", action: "revoke_manifest_registration",
      datasetId, version, fixtureStore: record.fixtureStore, manifestHash: record.manifestHash,
      fixtureSetHash: record.fixtureSetHash, reasonCode, actorId: authContext.actorId });
    const created = await registrationStore.putRevocationIfAbsent(key, revocation);
    if (!created) return { ok: true, status: "already_revoked" };
    return { ok: true, status: "revoked", datasetId, version };
  }

  async function selectApprovedManifest({ datasetId, version, scope } = {}, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    if (!ID_RE.test(datasetId || "") || !ID_RE.test(version || "") || !ALLOWED_SCOPES.has(scope)) {
      return { ok: false, reason: "invalid_manifest_selection" };
    }
    const { dataset, manifestHash: manifestHashValue, raw } = await readAndValidate(datasetId, version);
    const key = registrationKey(datasetId, version);
    if (await registrationStore.getRevocation(key)) return { ok: false, reason: "manifest_registration_revoked" };
    const record = await registrationStore.get(key);
    if (!record || record.status !== "approved") return { ok: false, reason: "manifest_not_registered" };
    if (!HASH_RE.test(record.fixtureSetHash || "") || record.scope !== scope || !exactRegistration(record, dataset, scope, manifestHashValue, record.fixtureSetHash)) {
      return { ok: false, reason: "registered_manifest_mismatch" };
    }
    const fixtureSet = await verifyFixtureSet({
      datasetId, version, fixtureStore: dataset.fixtureStore, caseIds: dataset.caseIds, mode: "selection"
    });
    if (!fixtureSet || fixtureSet.ok !== true || fixtureSet.syntheticOnly !== true ||
        fixtureSet.datasetId !== datasetId || fixtureSet.version !== version ||
        fixtureSet.fixtureStore !== record.fixtureStore || fixtureSet.fixtureSetHash !== record.fixtureSetHash ||
        fixtureSet.caseCount !== dataset.caseIds.length) return { ok: false, reason: "registered_fixture_set_unavailable" };
    return {
      ok: true,
      manifest: raw,
      registration: publicRecord(record),
      evaluationContext: Object.freeze({
        datasetId, datasetVersion: version, scope, fixtureStore: record.fixtureStore,
        manifestHash: record.manifestHash, fixtureSetHash: record.fixtureSetHash,
        caseIds: Object.freeze([...record.caseIds])
      })
    };
  }

  async function authorizeEvaluation(context = {}) {
    const { datasetId, datasetVersion, scope, fixtureStore, manifestHash: requestedManifestHash,
      fixtureSetHash: requestedFixtureSetHash, caseIds } = context;
    if (!ID_RE.test(datasetId || "") || !ID_RE.test(datasetVersion || "") || !ALLOWED_SCOPES.has(scope) ||
        !ID_RE.test(fixtureStore || "") || !HASH_RE.test(requestedManifestHash || "") ||
        !HASH_RE.test(requestedFixtureSetHash || "") || !Array.isArray(caseIds)) return false;
    try {
      const { dataset, manifestHash: liveManifestHash } = await readAndValidate(datasetId, datasetVersion);
      if (liveManifestHash !== requestedManifestHash || dataset.fixtureStore !== fixtureStore ||
          dataset.caseIds.length !== caseIds.length || dataset.caseIds.some((id, i) => id !== caseIds[i])) return false;
      const key = registrationKey(datasetId, datasetVersion);
      if (await registrationStore.getRevocation(key)) return false;
      const record = await registrationStore.get(key);
      if (!exactRegistration(record, dataset, scope, requestedManifestHash, requestedFixtureSetHash)) return false;
      const fixtureSet = await verifyFixtureSet({
        datasetId, version: datasetVersion, fixtureStore, caseIds, mode: "evaluation"
      });
      return !!(fixtureSet && fixtureSet.ok === true && fixtureSet.syntheticOnly === true &&
        fixtureSet.datasetId === datasetId && fixtureSet.version === datasetVersion &&
        fixtureSet.fixtureStore === fixtureStore && fixtureSet.fixtureSetHash === requestedFixtureSetHash &&
        fixtureSet.caseCount === caseIds.length);
    } catch (_) {
      return false;
    }
  }

  async function listApproved(scope, authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    if (scope !== undefined && !ALLOWED_SCOPES.has(scope)) return { ok: false, reason: "invalid_manifest_scope" };
    const records = await registrationStore.listApproved(scope);
    const output = [];
    for (const record of records) {
      try {
        if (await registrationStore.getRevocation(registrationKey(record.datasetId, record.version))) continue;
        const { dataset, manifestHash: currentHash } = await readAndValidate(record.datasetId, record.version);
        if (record.status === "approved" && HASH_RE.test(record.fixtureSetHash || "") &&
            exactRegistration(record, dataset, record.scope, currentHash, record.fixtureSetHash) &&
            ALLOWED_SCOPES.has(record.scope) && (!scope || record.scope === scope)) output.push(publicRecord(record));
      } catch (_) { /* stale or invalid registrations are never selectable */ }
    }
    return { ok: true, registrations: Object.freeze(output) };
  }

  return Object.freeze({
    VERSION,
    listAvailable,
    issueFixtureReview: issueOwnerFixtureReview,
    issueReview: issueOwnerFixtureReview,
    approveManifest,
    revokeManifest,
    listApproved,
    selectApprovedManifest,
    authorizeEvaluation
  });
}

function publicRecord(record) {
  return Object.freeze({
    status: record.status, datasetId: record.datasetId, version: record.version,
    scope: record.scope, fixtureStore: record.fixtureStore,
    caseCount: record.caseIds.length, manifestHash: record.manifestHash,
    fixtureSetHash: record.fixtureSetHash, caseIds: Object.freeze([...record.caseIds]),
    reviewRef: record.reviewRef, reviewId: record.reviewId, approvedAt: record.approvedAt
  });
}

module.exports = { VERSION, hashManifest, registrationKey, createFileManifestSource, createMarionLearningManifestRegistry };
