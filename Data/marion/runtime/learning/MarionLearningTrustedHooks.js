"use strict";

// Trusted gates for Marion Learning. The newer index contract resolves only
// server-registered offline versions and verifies owner-approved fixture reviews.
// The older owner-authenticated runtime hooks remain available for compatibility.
const crypto = require("node:crypto");
const { isVerifiedOwner } = require("./MarionLearningRuntime");

const VERSION = "marion.learningTrustedHooks/2.1-owner-issued-review";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const OWNER_ACTOR_RE = /^owner:[a-f0-9]{24}$/;
const REVIEW_RECORD_KEYS = new Set([
  "approved", "approvedBy", "caseCount", "caseIds", "datasetId", "fixtureSetHash",
  "fixtureStore", "manifestHash", "ownerConsent", "reviewId", "reviewRef", "scope",
  "signature", "version"
]);
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);
const MIN_REVIEW_KEY_BYTES = 32;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isValidBinding(binding) {
  return !!binding && typeof binding === "object" &&
    ID_RE.test(binding.datasetId || "") &&
    ID_RE.test(binding.datasetVersion || "") &&
    ALLOWED_SCOPES.has(binding.scope);
}

function isValidOfflineEntry(version, entry) {
  return ID_RE.test(version || "") && !!entry && typeof entry === "object" &&
    entry.version === version && entry.mode === "offline" &&
    typeof entry.runOffline === "function" && Array.isArray(entry.bindings) &&
    entry.bindings.length > 0 && entry.bindings.length <= 256 &&
    entry.bindings.every(isValidBinding);
}

function isPlainDataObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key => {
    const descriptor = descriptors[key];
    return !descriptor.enumerable ||
      (typeof key === "string" && Object.prototype.hasOwnProperty.call(descriptor, "value"));
  });
}

function reviewPayload(review) {
  return {
    approved: true,
    approvedBy: review.approvedBy,
    caseCount: review.caseCount,
    caseIds: review.caseIds,
    datasetId: review.datasetId,
    fixtureSetHash: review.fixtureSetHash,
    fixtureStore: review.fixtureStore,
    manifestHash: review.manifestHash,
    ownerConsent: true,
    reviewId: review.reviewId,
    reviewRef: review.reviewRef,
    scope: review.scope,
    version: review.version
  };
}

function timingSafeHexEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string" ||
      !HASH_RE.test(left) || !HASH_RE.test(right)) return false;
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function validReviewIssuance(input) {
  return isPlainDataObject(input) &&
    ID_RE.test(input.reviewRef || "") && ID_RE.test(input.reviewId || "") &&
    OWNER_ACTOR_RE.test(input.approvedBy || "") &&
    ID_RE.test(input.datasetId || "") && ID_RE.test(input.version || "") &&
    ID_RE.test(input.fixtureStore || "") && ALLOWED_SCOPES.has(input.scope) &&
    HASH_RE.test(input.manifestHash || "") && HASH_RE.test(input.fixtureSetHash || "") &&
    input.ownerConsent === true && Array.isArray(input.caseIds) &&
    input.caseIds.length >= 20 && input.caseIds.length <= 500 &&
    Number.isSafeInteger(input.caseCount) && input.caseCount === input.caseIds.length &&
    new Set(input.caseIds).size === input.caseIds.length &&
    input.caseIds.every(id => typeof id === "string" && ID_RE.test(id));
}

function buildReviewTrust({ versionRegistry, reviewStore, reviewHmacKey } = {}) {
  const getReview = reviewStore &&
    (typeof reviewStore.get === "function" ? reviewStore.get.bind(reviewStore) :
      typeof reviewStore.getReview === "function" ? reviewStore.getReview.bind(reviewStore) : null);
  const insertReview = reviewStore && typeof reviewStore.insertIfAbsent === "function"
    ? reviewStore.insertIfAbsent.bind(reviewStore) : null;
  const key = typeof reviewHmacKey === "string" ? reviewHmacKey : "";
  const configured = versionRegistry instanceof Map && typeof getReview === "function" &&
    typeof insertReview === "function" &&
    Buffer.byteLength(key, "utf8") >= MIN_REVIEW_KEY_BYTES;

  function resolveVersion(versionOrRequest, datasetIdOrBinding, datasetVersion, scope) {
    if (!configured) return null;
    let version = "";
    let requested = {};
    if (typeof versionOrRequest === "string") {
      version = versionOrRequest;
      if (datasetIdOrBinding && typeof datasetIdOrBinding === "object") requested = datasetIdOrBinding;
      else requested = { datasetId: datasetIdOrBinding, datasetVersion, scope };
    } else if (versionOrRequest && typeof versionOrRequest === "object" && !Array.isArray(versionOrRequest)) {
      version = versionOrRequest.version;
      requested = versionOrRequest.binding && typeof versionOrRequest.binding === "object"
        ? versionOrRequest.binding : versionOrRequest;
    }
    const entry = versionRegistry.get(version);
    if (!isValidOfflineEntry(version, entry)) return null;

    const constraints = ["datasetId", "datasetVersion", "scope"]
      .filter(keyName => requested[keyName] !== undefined);
    if (constraints.length) {
      const matches = entry.bindings.some(binding => constraints.every(keyName => binding[keyName] === requested[keyName]));
      if (!matches) return null;
    }
    return Object.freeze({ ...entry, bindings: Object.freeze(entry.bindings.map(binding => Object.freeze({ ...binding }))) });
  }

  async function verifyFixtureReview(request = {}) {
    if (!configured || !request || typeof request !== "object" || Array.isArray(request)) return null;
    const { reviewRef, datasetId, version, scope, fixtureStore, manifestHash, fixtureSetHash, caseIds, caseCount } = request;
    if (!ID_RE.test(reviewRef || "") || !ID_RE.test(datasetId || "") || !ID_RE.test(version || "") ||
        !ALLOWED_SCOPES.has(scope) || !ID_RE.test(fixtureStore || "") ||
        !HASH_RE.test(manifestHash || "") || !HASH_RE.test(fixtureSetHash || "") ||
        !Array.isArray(caseIds) || caseIds.length === 0 || caseIds.length > 10000 ||
        !Number.isSafeInteger(caseCount) || caseCount !== caseIds.length ||
        caseIds.some(id => typeof id !== "string" || !ID_RE.test(id))) return null;

    let review;
    try { review = await getReview(reviewRef); } catch (_) { return null; }
    if (!isPlainDataObject(review) || Object.keys(review).length !== REVIEW_RECORD_KEYS.size ||
        Object.keys(review).some(keyName => !REVIEW_RECORD_KEYS.has(keyName)) ||
        review.approved !== true || review.ownerConsent !== true || review.reviewRef !== reviewRef ||
        !OWNER_ACTOR_RE.test(review.approvedBy || "") || review.datasetId !== datasetId ||
        review.version !== version || review.scope !== scope || review.fixtureStore !== fixtureStore ||
        review.manifestHash !== manifestHash || review.fixtureSetHash !== fixtureSetHash ||
        review.caseCount !== caseCount || !Array.isArray(review.caseIds) ||
        review.caseIds.length !== caseIds.length || review.caseIds.some((id, index) => id !== caseIds[index]) ||
        (review.revoked === true || review.revokedAt)) return null;

    const reviewId = typeof review.reviewId === "string" && ID_RE.test(review.reviewId) ? review.reviewId : reviewRef;
    const suppliedSignature = typeof review.signature === "string" ? review.signature : "";
    let expectedSignature;
    try {
      expectedSignature = crypto.createHmac("sha256", key).update(stableJson(reviewPayload({ ...review, reviewId }))).digest("hex");
    } catch (_) { return null; }
    if (!timingSafeHexEqual(suppliedSignature, expectedSignature)) return null;

    return Object.freeze({
      approved: true,
      reviewRef,
      reviewId,
      datasetId,
      version,
      scope,
      fixtureStore,
      manifestHash,
      fixtureSetHash
    });
  }

  async function issueFixtureReview(input = {}) {
    if (!configured || !validReviewIssuance(input)) return null;
    const unsigned = reviewPayload({ ...input, approved: true, ownerConsent: true });
    let signature;
    try { signature = crypto.createHmac("sha256", key).update(stableJson(unsigned)).digest("hex"); }
    catch (_) { return null; }
    const signedRecord = Object.freeze({ ...unsigned, signature });
    let inserted = false;
    try { inserted = await insertReview(signedRecord) === true; } catch (_) { return null; }
    if (!inserted) return null;
    return verifyFixtureReview({
      reviewRef: signedRecord.reviewRef,
      datasetId: signedRecord.datasetId,
      version: signedRecord.version,
      scope: signedRecord.scope,
      fixtureStore: signedRecord.fixtureStore,
      manifestHash: signedRecord.manifestHash,
      fixtureSetHash: signedRecord.fixtureSetHash,
      caseIds: signedRecord.caseIds,
      caseCount: signedRecord.caseCount
    });
  }

  return Object.freeze({ VERSION, configured, resolveVersion, verifyFixtureReview, issueFixtureReview });
}

function createLegacyRuntimeHooks({ runtime, resolveAuthContext, enabled = false } = {}) {
  if (!runtime || typeof runtime !== "object") throw new TypeError("runtime is required");
  if (typeof resolveAuthContext !== "function") {
    throw new TypeError("resolveAuthContext must use the existing server authentication middleware");
  }
  for (const method of ["evaluateCandidate", "submitEvaluation", "decideProposal", "getPrivateHealth"]) {
    if (typeof runtime[method] !== "function") throw new TypeError(`runtime.${method} is required`);
  }

  async function invoke(req, method, args = []) {
    if (enabled !== true) return { ok: false, status: 503, reason: "learning_hooks_disabled" };
    let authContext;
    try { authContext = await resolveAuthContext(req); }
    catch (_) { return { ok: false, status: 403, reason: "owner_authentication_required" }; }
    if (!isVerifiedOwner(authContext)) return { ok: false, status: 403, reason: "owner_authentication_required" };
    try { return await runtime[method](...args, authContext); }
    catch (_) { return { ok: false, status: 503, reason: "learning_runtime_unavailable" }; }
  }

  return Object.freeze({
    VERSION,
    evaluateCandidate(req, candidate, dataset) { return invoke(req, "evaluateCandidate", [candidate, dataset]); },
    submitEvaluation(req, report) { return invoke(req, "submitEvaluation", [report]); },
    decideProposal(req, input) { return invoke(req, "decideProposal", [input]); },
    getPrivateHealth(req) { return invoke(req, "getPrivateHealth"); }
  });
}

function createMarionLearningTrustedHooks(options = {}) {
  if (options.runtime || options.resolveAuthContext) return createLegacyRuntimeHooks(options);
  return buildReviewTrust(options);
}

module.exports = {
  VERSION,
  createMarionLearningTrustedHooks
};
