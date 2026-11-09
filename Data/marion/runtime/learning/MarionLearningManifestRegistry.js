"use strict";

// Trusted manifest selection and immutable approval registry. A manifest file
// is only a candidate until an owner-approved, fixture-bound record is stored.
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const Dataset = require("./MarionLearningDataset");
const { isVerifiedOwner } = require("./MarionLearningRuntime");

const VERSION = "marion.learningManifestRegistry/1.6-atomic-manifest-audit-and-snapshot-cohesion";
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

// Hash and validate one stable JSON snapshot. The source is potentially mutable
// (including by asynchronous verifier callbacks), so never authorize using a
// different object from the one whose bytes were hashed.
function manifestSnapshot(raw) {
  const canonical = stableJson(raw);
  if (typeof canonical !== "string" || Buffer.byteLength(canonical, "utf8") > MAX_MANIFEST_BYTES)
    throw new Error("manifest_snapshot_invalid");
  const snapshot = JSON.parse(canonical);
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    throw new Error("manifest_snapshot_invalid");
  return { snapshot, manifestHash: crypto.createHash("sha256").update(canonical).digest("hex") };
}

function registrationKey(datasetId, version) { return `${datasetId}@${version}`; }

// Diagnostics only: listing never grants authority if the canonical keyed lookup
// fails. This prevents an index/key mismatch from being mistaken for approval.
async function missingRegistrationReason(registrationStore, datasetId, version) {
  try {
    const records = await registrationStore.listApproved();
    if (!Array.isArray(records)) return "manifest_registration_lookup_unavailable";
    const matches = records.filter(record => record && record.status === "approved" &&
      record.datasetId === datasetId && record.version === version);
    return matches.length ? "manifest_registration_lookup_mismatch" : "manifest_not_registered";
  } catch (_) {
    return "manifest_registration_lookup_unavailable";
  }
}

function verifiedFixtureSet(fixtureSet, dataset, expectedScope, expectedHash) {
  if (!fixtureSet || fixtureSet.ok !== true || fixtureSet.syntheticOnly !== true ||
      fixtureSet.datasetId !== dataset.datasetId || fixtureSet.version !== dataset.version ||
      fixtureSet.fixtureStore !== dataset.fixtureStore || fixtureSet.scope !== expectedScope ||
      fixtureSet.caseCount !== dataset.caseIds.length || !HASH_RE.test(fixtureSet.fixtureSetHash || "") ||
      (expectedHash && fixtureSet.fixtureSetHash !== expectedHash)) return false;
  // The fixture-store implementation may omit caseIds; when supplied, they must
  // match exactly. Never accept a conflicting case list.
  if (fixtureSet.caseIds !== undefined && (!Array.isArray(fixtureSet.caseIds) ||
      fixtureSet.caseIds.length !== dataset.caseIds.length ||
      fixtureSet.caseIds.some((id, i) => id !== dataset.caseIds[i]))) return false;
  return true;
}


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
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("manifest_root_must_be_real_directory");
    const rootReal = await fs.realpath(root);
    const roots = [rootReal];
    for (const name of ["drafts", "approved"]) {
      const candidate = path.join(rootReal, name);
      try {
        const stat = await fs.lstat(candidate);
        if (stat.isDirectory() && !stat.isSymbolicLink() &&
            await fs.realpath(candidate) === path.join(rootReal, name)) roots.push(candidate);
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
        try {
          const handle = await fs.open(fullPath, fsSync.constants.O_RDONLY | (fsSync.constants.O_NOFOLLOW || 0));
          try {
            const actual = await handle.stat();
            if (!actual.isFile() || actual.size > MAX_MANIFEST_BYTES) continue;
            const content = await handle.readFile("utf8");
            if (Buffer.byteLength(content, "utf8") > MAX_MANIFEST_BYTES) continue;
            output.push(JSON.parse(content));
          } finally { await handle.close(); }
        } catch (_) { /* malformed/unsafe drafts are omitted */ }
      }
    }
    return output;
  }

  function listSync() {
    const rootStat = fsSync.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("manifest_root_must_be_real_directory");
    const rootReal = fsSync.realpathSync(root);
    const roots = [rootReal];
    for (const name of ["drafts", "approved"]) {
      const candidate = path.join(rootReal, name);
      try {
        const stat = fsSync.lstatSync(candidate);
        if (stat.isDirectory() && !stat.isSymbolicLink() && fsSync.realpathSync(candidate) === candidate) roots.push(candidate);
      } catch (error) { if (!error || error.code !== "ENOENT") throw error; }
    }
    const output = [];
    for (const directory of roots) {
      for (const entry of fsSync.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const fullPath = path.join(directory, entry.name);
        const stat = fsSync.lstatSync(fullPath);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MANIFEST_BYTES) continue;
        try {
          const fd = fsSync.openSync(fullPath, fsSync.constants.O_RDONLY | (fsSync.constants.O_NOFOLLOW || 0));
          try {
            const actual = fsSync.fstatSync(fd);
            if (!actual.isFile() || actual.size > MAX_MANIFEST_BYTES) continue;
            const content = fsSync.readFileSync(fd, "utf8");
            if (Buffer.byteLength(content, "utf8") > MAX_MANIFEST_BYTES) continue;
            output.push(JSON.parse(content));
          } finally { fsSync.closeSync(fd); }
        } catch (_) { /* malformed/unsafe drafts are omitted */ }
      }
    }
    return output;
  }

  return Object.freeze({ load, list, listSync, directory: root });
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
    const loaded = await manifestSource.load(datasetId, version);
    const { snapshot: raw, manifestHash } = manifestSnapshot(loaded);
    const checked = Dataset.validateEvaluationSet(raw);
    if (!checked.ok) throw new Error(`manifest_invalid:${checked.reason}`);
    if (checked.dataset.datasetId !== datasetId || checked.dataset.version !== version) throw new Error("manifest_identity_mismatch");
    return { raw, dataset: checked.dataset, manifestHash };
  }

  async function listAvailable(authContext) {
    if (!isVerifiedOwner(authContext)) return { ok: false, reason: "owner_authentication_required" };
    const manifests = await manifestSource.list();
    const result = [];
    for (const raw of manifests) {
      let snap;
      try { snap = manifestSnapshot(raw); } catch (_) { continue; }
      const checked = Dataset.validateEvaluationSet(snap.snapshot);
      if (!checked.ok) continue;
      const dataset = checked.dataset;
      const hash = snap.manifestHash;
      const key = registrationKey(dataset.datasetId, dataset.version);
      const record = await registrationStore.get(key);
      const revoked = !!(await registrationStore.getRevocation(key));
      const approved = !revoked && exactRegistration(record, dataset, record && record.scope, hash, record && record.fixtureSetHash) &&
        ALLOWED_SCOPES.has(record.scope) && HASH_RE.test(record.fixtureSetHash || "");
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
      if (!verifiedFixtureSet(fixtureSet, dataset, scope)) {
        return { ok: false, reason: "fixture_set_not_verified" };
      }
      const review = await issueFixtureReview({
        reviewRef, reviewId: resolvedReviewId, approvedBy: authContext.actorId, datasetId, version, scope,
        fixtureStore: dataset.fixtureStore, manifestHash: manifestHashValue,
        fixtureSetHash: fixtureSet.fixtureSetHash, ownerConsent: true,
        caseIds: dataset.caseIds, caseCount: dataset.caseIds.length
      });
      if (!review || review.approved !== true || review.ownerConsent !== true ||
          review.approvedBy !== authContext.actorId || review.caseCount !== dataset.caseIds.length ||
          review.reviewRef !== reviewRef ||
          review.reviewId !== resolvedReviewId || review.datasetId !== datasetId || review.version !== version ||
          review.scope !== scope || review.fixtureStore !== dataset.fixtureStore ||
          review.manifestHash !== manifestHashValue || review.fixtureSetHash !== fixtureSet.fixtureSetHash ||
          !Array.isArray(review.caseIds) || review.caseIds.length !== dataset.caseIds.length ||
          review.caseIds.some((id, i) => id !== dataset.caseIds[i])) {
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
    if (!verifiedFixtureSet(fixtureSet, dataset, scope))
      return { ok: false, reason: "fixture_set_not_verified" };

    const review = await verifyFixtureReview({
      reviewRef, datasetId, version, scope, fixtureStore: dataset.fixtureStore,
      manifestHash: manifestHashValue, fixtureSetHash: fixtureSet.fixtureSetHash,
      caseIds: dataset.caseIds, caseCount: dataset.caseIds.length
    });
    if (!review || review.approved !== true || review.ownerConsent !== true ||
        review.reviewRef !== reviewRef || !ID_RE.test(review.reviewId || "") ||
        review.datasetId !== datasetId || review.version !== version || review.scope !== scope ||
        review.fixtureStore !== dataset.fixtureStore || review.manifestHash !== manifestHashValue ||
        review.fixtureSetHash !== fixtureSet.fixtureSetHash ||
        !(ID_RE.test(review.approvedBy || "") || /^owner:[a-f0-9]{24}$/.test(review.approvedBy || "")) ||
        review.caseCount !== dataset.caseIds.length ||
        !Array.isArray(review.caseIds) || review.caseIds.length !== dataset.caseIds.length ||
        review.caseIds.some((id, i) => id !== dataset.caseIds[i])) {
      return { ok: false, reason: "fixture_review_not_approved" };
    }

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
      if (await registrationStore.getRevocation(key)) return { ok: false, reason: "manifest_version_revoked" };
      if (exactRegistration(existing, dataset, scope, manifestHashValue, fixtureSet.fixtureSetHash)) {
        return { ok: true, status: "already_approved", registration: publicRecord(existing) };
      }
      return { ok: false, reason: "manifest_version_already_registered" };
    }

    // The PostgreSQL registrationStore.putIfAbsent implementation writes the
    // registry record AND its audit event inside one transaction. Appending here
    // first would create an orphan audit event if insertion fails, plus a second
    // event on success. Never create a non-atomic audit entry at this layer.
    const created = await registrationStore.putIfAbsent(key, record);
    if (created !== true) return { ok: false, reason: "manifest_registration_race_retry_selection" };
    // Do not report an approval that cannot be retrieved through the same keyed
    // lookup later used by selectApprovedManifest and authorizeEvaluation.
    const persisted = await registrationStore.get(key);
    if (!exactRegistration(persisted, dataset, scope, manifestHashValue, fixtureSet.fixtureSetHash))
      return { ok: false, reason: "manifest_registration_lookup_mismatch" };
    if (await registrationStore.getRevocation(key))
      return { ok: false, reason: "manifest_version_revoked" };
    return { ok: true, status: "approved", registration: publicRecord(persisted) };
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
    // Atomic PostgreSQL revocation store owns the corresponding audit append.
    // A standalone audit first could falsely record revocation on a failed write.
    const created = await registrationStore.putRevocationIfAbsent(key, revocation);
    if (created !== true) {
      return await registrationStore.getRevocation(key)
        ? { ok: true, status: "already_revoked" }
        : { ok: false, reason: "manifest_revocation_persistence_unconfirmed" };
    }
    const persisted = await registrationStore.getRevocation(key);
    if (!persisted || persisted.status !== "revoked" || persisted.datasetId !== datasetId ||
        persisted.version !== version || persisted.manifestHash !== revocation.manifestHash ||
        persisted.fixtureSetHash !== revocation.fixtureSetHash)
      return { ok: false, reason: "manifest_revocation_persistence_unconfirmed" };
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
    if (!record || record.status !== "approved") return {
      ok: false,
      reason: await missingRegistrationReason(registrationStore, datasetId, version)
    };
    if (!HASH_RE.test(record.fixtureSetHash || "") || record.scope !== scope || !exactRegistration(record, dataset, scope, manifestHashValue, record.fixtureSetHash)) {
      return { ok: false, reason: "registered_manifest_mismatch" };
    }
    const fixtureSet = await verifyFixtureSet({
      datasetId, version, fixtureStore: dataset.fixtureStore, caseIds: dataset.caseIds, mode: "selection"
    });
    if (!verifiedFixtureSet(fixtureSet, dataset, scope, record.fixtureSetHash))
      return { ok: false, reason: "registered_fixture_set_unavailable" };
    // A revocation committed during fixture verification must stop selection.
    if (await registrationStore.getRevocation(key))
      return { ok: false, reason: "manifest_registration_revoked" };
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
      if (!verifiedFixtureSet(fixtureSet, dataset, scope, requestedFixtureSetHash)) return false;
      // A revocation racing fixture verification cannot be ignored.
      return !(await registrationStore.getRevocation(key));
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
        // A listing is informational, not authority. Reject an item if its
        // canonical keyed lookup disagrees with the listed approval.
        if (record.status !== "approved" || !HASH_RE.test(record.fixtureSetHash || "") ||
            !exactRegistration(record, dataset, record.scope, currentHash, record.fixtureSetHash) ||
            !ALLOWED_SCOPES.has(record.scope) || (scope && record.scope !== scope)) continue;
        const key = registrationKey(record.datasetId, record.version);
        const keyed = await registrationStore.get(key);
        if (!exactRegistration(keyed, dataset, record.scope, currentHash, record.fixtureSetHash) ||
            keyed.reviewRef !== record.reviewRef || keyed.approvedAt !== record.approvedAt) continue;
        if (await registrationStore.getRevocation(key)) continue;
        output.push(publicRecord(keyed));
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
