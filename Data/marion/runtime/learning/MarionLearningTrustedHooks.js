"use strict";

// Private, fail-closed review signing and registered offline version resolution.
// The persisted review payload and SHA-256 HMAC canonicalization are unchanged.
const crypto = require("node:crypto");
const { isVerifiedOwner } = require("./MarionLearningRuntime");

const VERSION = "marion.learningTrustedHooks/2.3-phase19-22-trust-boundaries";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const OWNER_ACTOR_RE = /^owner:[a-f0-9]{24}$/;
const REVIEW_KEYS = Object.freeze([
  "approved", "approvedBy", "caseCount", "caseIds", "datasetId", "fixtureSetHash",
  "fixtureStore", "manifestHash", "ownerConsent", "reviewId", "reviewRef", "scope",
  "signature", "version"
]);
const REVIEW_PAYLOAD_KEYS = Object.freeze(REVIEW_KEYS.filter(key => key !== "signature"));
const ALLOWED_SCOPES = new Set(["retrieval", "routing", "response_style"]);
const MIN_REVIEW_KEY_BYTES = 32;
const MAX_CASES = 500;
const MIN_CASES = 20;

function ownValue(object, key) {
  const desc = Object.getOwnPropertyDescriptor(object, key);
  return desc && Object.prototype.hasOwnProperty.call(desc, "value") ? desc.value : undefined;
}
function plainData(value, allowedKeys = null, exact = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  const desc = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(desc);
  if (exact && keys.length !== allowedKeys.length) return false;
  return keys.every(key => typeof key === "string" &&
    (!allowedKeys || allowedKeys.includes(key)) && desc[key].enumerable === true &&
    Object.prototype.hasOwnProperty.call(desc[key], "value"));
}
function denseDataArray(value, minimum, maximum) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || !keys.includes("length")) return false;
  for (let i = 0; i < value.length; i++) {
    const desc = Object.getOwnPropertyDescriptor(value, String(i));
    if (!desc || !desc.enumerable || !Object.prototype.hasOwnProperty.call(desc, "value")) return false;
  }
  return true;
}
function validCaseIds(value) {
  return denseDataArray(value, MIN_CASES, MAX_CASES) &&
    value.every(id => typeof id === "string" && ID_RE.test(id)) &&
    new Set(value).size === value.length;
}
function validBinding(binding) {
  return plainData(binding, ["datasetId", "datasetVersion", "scope"], true) &&
    ID_RE.test(binding.datasetId) && ID_RE.test(binding.datasetVersion) &&
    ALLOWED_SCOPES.has(binding.scope);
}
function validOfflineEntry(version, entry) {
  if (!ID_RE.test(version) || !plainData(entry) ||
      ownValue(entry, "version") !== version || ownValue(entry, "mode") !== "offline" ||
      typeof ownValue(entry, "runOffline") !== "function") return false;
  const bindings = ownValue(entry, "bindings");
  return denseDataArray(bindings, 1, 256) && bindings.every(validBinding);
}
// Matches the historical signed payload and stableJson algorithm exactly.
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function reviewPayload(review) {
  return {
    approved: true,
    approvedBy: review.approvedBy,
    caseCount: review.caseCount,
    caseIds: [...review.caseIds],
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
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
function validReviewFields(value, signed) {
  const keys = signed ? REVIEW_KEYS : REVIEW_PAYLOAD_KEYS;
  if (!plainData(value, keys, signed)) return false;
  // Issuance retains compatibility with the original contract: extra own-data
  // metadata is ignored when signing; never persisted into the signed payload.
  if (!signed && Reflect.ownKeys(value).some(key => key === "__proto__" || key === "constructor" || key === "prototype")) return false;
  return value.approvedBy !== undefined && OWNER_ACTOR_RE.test(value.approvedBy) &&
    ID_RE.test(value.reviewRef) && ID_RE.test(value.reviewId) &&
    ID_RE.test(value.datasetId) && ID_RE.test(value.version) &&
    ID_RE.test(value.fixtureStore) && ALLOWED_SCOPES.has(value.scope) &&
    HASH_RE.test(value.manifestHash) && HASH_RE.test(value.fixtureSetHash) &&
    value.ownerConsent === true && (!signed || value.approved === true) &&
    validCaseIds(value.caseIds) && Number.isSafeInteger(value.caseCount) &&
    value.caseCount === value.caseIds.length &&
    (!signed || HASH_RE.test(value.signature));
}
function validReviewRequest(request) {
  if (!plainData(request)) return false;
  const required = ["reviewRef", "datasetId", "version", "scope", "fixtureStore",
    "manifestHash", "fixtureSetHash", "caseIds", "caseCount"];
  if (!required.every(key => Object.prototype.hasOwnProperty.call(request, key))) return false;
  return ID_RE.test(request.reviewRef) && ID_RE.test(request.datasetId) &&
    ID_RE.test(request.version) && ALLOWED_SCOPES.has(request.scope) &&
    ID_RE.test(request.fixtureStore) && HASH_RE.test(request.manifestHash) &&
    HASH_RE.test(request.fixtureSetHash) && validCaseIds(request.caseIds) &&
    Number.isSafeInteger(request.caseCount) && request.caseCount === request.caseIds.length;
}
function buildReviewTrust({ versionRegistry, reviewStore, reviewHmacKey } = {}) {
  const getReview = reviewStore &&
    (typeof reviewStore.get === "function" ? reviewStore.get.bind(reviewStore) :
      typeof reviewStore.getReview === "function" ? reviewStore.getReview.bind(reviewStore) : null);
  const insertReview = reviewStore && typeof reviewStore.insertIfAbsent === "function"
    ? reviewStore.insertIfAbsent.bind(reviewStore) : null;
  const key = typeof reviewHmacKey === "string" ? reviewHmacKey : "";
  const keyBytes = Buffer.byteLength(key, "utf8");
  const configurationReason = !(versionRegistry instanceof Map)
    ? "review_version_registry_missing"
    : typeof getReview !== "function" || typeof insertReview !== "function"
      ? "review_store_unavailable"
      : keyBytes < MIN_REVIEW_KEY_BYTES
        ? "review_hmac_key_missing_or_too_short" : "ready";
  const configured = configurationReason === "ready";

  function resolveVersion(versionOrRequest, datasetIdOrBinding, datasetVersion, scope) {
    if (!configured) return null;
    try {
      let version, requested;
      if (typeof versionOrRequest === "string") {
        version = versionOrRequest;
        requested = plainData(datasetIdOrBinding) ? datasetIdOrBinding :
          { datasetId: datasetIdOrBinding, datasetVersion, scope };
      } else if (plainData(versionOrRequest)) {
        version = ownValue(versionOrRequest, "version");
        const binding = ownValue(versionOrRequest, "binding");
        requested = plainData(binding) ? binding : versionOrRequest;
      } else return null;
      if (!ID_RE.test(version) || !plainData(requested)) return null;
      // All three bindings are compulsory: never hand out an unbound handler.
      const datasetId = ownValue(requested, "datasetId");
      const boundVersion = ownValue(requested, "datasetVersion");
      const boundScope = ownValue(requested, "scope");
      if (!ID_RE.test(datasetId) || !ID_RE.test(boundVersion) ||
          !ALLOWED_SCOPES.has(boundScope)) return null;
      const entry = versionRegistry.get(version);
      if (!validOfflineEntry(version, entry)) return null;
      const bindings = ownValue(entry, "bindings");
      if (!bindings.some(binding => binding.datasetId === datasetId &&
          binding.datasetVersion === boundVersion && binding.scope === boundScope)) return null;
      const copy = Object.create(null);
      for (const name of Object.keys(entry)) copy[name] = ownValue(entry, name);
      copy.bindings = Object.freeze(bindings.map(binding => Object.freeze({
        datasetId: binding.datasetId, datasetVersion: binding.datasetVersion, scope: binding.scope
      })));
      return Object.freeze(copy);
    } catch (_) { return null; }
  }

  async function verifyFixtureReview(request = {}) {
    if (!configured) return null;
    let query;
    try {
      if (!validReviewRequest(request)) return null;
      query = Object.freeze({ ...request, caseIds: Object.freeze([...request.caseIds]) });
    } catch (_) { return null; }
    let review;
    try { review = await getReview(query.reviewRef); } catch (_) { return null; }
    try {
      if (!validReviewFields(review, true) || review.reviewRef !== query.reviewRef ||
          review.datasetId !== query.datasetId || review.version !== query.version ||
          review.scope !== query.scope || review.fixtureStore !== query.fixtureStore ||
          review.manifestHash !== query.manifestHash || review.fixtureSetHash !== query.fixtureSetHash ||
          review.caseCount !== query.caseCount ||
          review.caseIds.some((id, index) => id !== query.caseIds[index])) return null;
      const signature = crypto.createHmac("sha256", key)
        .update(stableJson(reviewPayload(review))).digest("hex");
      if (!timingSafeHexEqual(review.signature, signature)) return null;
      return Object.freeze({
        approved: true, reviewRef: query.reviewRef, reviewId: review.reviewId,
        datasetId: query.datasetId, version: query.version, scope: query.scope,
        fixtureStore: query.fixtureStore, manifestHash: query.manifestHash,
        fixtureSetHash: query.fixtureSetHash
      });
    } catch (_) { return null; }
  }

  async function issueFixtureReview(input = {}) {
    if (!configured) return null;
    let unsigned;
    try {
      if (!validReviewFields(input, false)) return null;
      unsigned = reviewPayload(input);
      unsigned.caseIds = Object.freeze(unsigned.caseIds);
      Object.freeze(unsigned);
    } catch (_) { return null; }
    let signature;
    try { signature = crypto.createHmac("sha256", key).update(stableJson(unsigned)).digest("hex"); }
    catch (_) { return null; }
    const signedRecord = Object.freeze({ ...unsigned, signature });
    let inserted;
    try { inserted = await insertReview(signedRecord) === true; } catch (_) { return null; }
    if (!inserted) return null;
    return verifyFixtureReview({
      reviewRef: signedRecord.reviewRef, datasetId: signedRecord.datasetId,
      version: signedRecord.version, scope: signedRecord.scope,
      fixtureStore: signedRecord.fixtureStore, manifestHash: signedRecord.manifestHash,
      fixtureSetHash: signedRecord.fixtureSetHash, caseIds: signedRecord.caseIds,
      caseCount: signedRecord.caseCount
    });
  }

  return Object.freeze({ VERSION, configured, configurationReason, resolveVersion, verifyFixtureReview, issueFixtureReview });
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
module.exports = { VERSION, createMarionLearningTrustedHooks };
