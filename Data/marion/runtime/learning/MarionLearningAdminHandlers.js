"use strict";

// HTTP-neutral owner-only handlers for the host app to mount under its private
// Marion admin routes. Authentication is resolved from server middleware only.
const crypto = require("node:crypto");
const { isVerifiedOwner } = require("./MarionLearningRuntime");
const VERSION = "marion.learningAdminHandlers/1.4-validated-owner-dispatch";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const SCOPES = new Set(["retrieval", "routing", "response_style"]);
const MAX_CANDIDATE_BYTES = 65536;

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

// Never execute client-controlled getters while building trusted runtime arguments.
function ownData(object, key) {
  if (!plainObject(object)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value") ? descriptor.value : undefined;
}
function objectBody(request) {
  const body = request && request.body;
  if (body === undefined || body === null) return {};
  if (!plainObject(body)) throw new TypeError("invalid_learning_request_body");
  return body;
}
function validId(value) { return typeof value === "string" && ID_RE.test(value); }
function validScope(value) { return SCOPES.has(value); }
function invalid(reason = "invalid_learning_request") { return { ok: false, reason }; }
function validManifestFields(body) {
  return validId(ownData(body, "datasetId")) && validId(ownData(body, "version")) &&
    validScope(ownData(body, "scope"));
}
function safeCandidate(value) {
  const seen = new WeakSet();
  let count = 0;
  function inspect(node, depth) {
    if (++count > 10000 || depth > 20) throw new TypeError("candidate_limit_exceeded");
    if (node === null || typeof node === "string" || typeof node === "boolean") return node;
    if (typeof node === "number" && Number.isFinite(node)) return node;
    if (typeof node !== "object" || seen.has(node)) throw new TypeError("invalid_learning_candidate");
    if (!Array.isArray(node) && !plainObject(node)) throw new TypeError("invalid_learning_candidate");
    seen.add(node);
    let output;
    if (Array.isArray(node)) {
      output = [];
      for (let i = 0; i < node.length; i++) {
        const d = Object.getOwnPropertyDescriptor(node, String(i));
        if (!d || !Object.prototype.hasOwnProperty.call(d, "value")) throw new TypeError("invalid_learning_candidate");
        output.push(inspect(d.value, depth + 1));
      }
    } else {
      output = {};
      for (const key of Object.keys(node)) {
        const d = Object.getOwnPropertyDescriptor(node, key);
        if (!d || !Object.prototype.hasOwnProperty.call(d, "value")) throw new TypeError("invalid_learning_candidate");
        if (key === "__proto__" || key === "constructor" || key === "prototype") throw new TypeError("invalid_learning_candidate");
        Object.defineProperty(output, key, {value: inspect(d.value, depth + 1), enumerable: true, writable: true, configurable: true});
      }
    }
    seen.delete(node);
    return output;
  }
  if (!plainObject(value)) throw new TypeError("invalid_learning_candidate");
  const copy = inspect(value, 0);
  const bytes = Buffer.byteLength(JSON.stringify(copy), "utf8");
  if (bytes > MAX_CANDIDATE_BYTES) throw new TypeError("candidate_limit_exceeded");
  return copy;
}
function safeReason(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{0,119}$/.test(value)) return "learning_request_rejected";
  return value;
}
function reply(status, body) { return Object.freeze({ status, body: Object.freeze(body) }); }

function createMarionLearningAdminHandlers({ runtime, getVerifiedOwnerContext } = {}) {
  if (!runtime || typeof runtime.listAvailableManifests !== "function" ||
      typeof runtime.issueFixtureReview !== "function" ||
      typeof runtime.approveManifest !== "function" || typeof runtime.revokeManifest !== "function" ||
      typeof runtime.listApprovedManifests !== "function" || typeof runtime.evaluateCandidate !== "function") {
    throw new TypeError("registered Marion learning runtime manifest methods are required");
  }
  if (typeof getVerifiedOwnerContext !== "function") throw new TypeError("server middleware owner-context resolver is required");

  async function run(request, action) {
    let authContext;
    try { authContext = await getVerifiedOwnerContext(request); }
    catch (_) { return reply(403, { ok: false, reason: "owner_authentication_required" }); }
    if (!isVerifiedOwner(authContext)) return reply(403, { ok: false, reason: "owner_authentication_required" });
    try {
      let body;
      try { body = objectBody(request); }
      catch (_) { return reply(422, invalid("invalid_learning_request_body")); }
      const result = await action(body, authContext, request);
      if (result && result.ok === true) return reply(200, result);
      const reason = safeReason(result && result.reason);
      const status = reason === "owner_authentication_required" ? 403 :
        ["offline_evaluation_handlers_not_registered", "durable_storage_not_ready"].includes(reason) || /(?:_unavailable|_not_ready)$/.test(reason) ? 503 :
          /not_registered|mismatch|revoked|race/.test(reason) ? 409 : 422;
      return reply(status, { ok: false, reason });
    } catch (_) {
      return reply(503, { ok: false, reason: "learning_registry_unavailable" });
    }
  }

  return Object.freeze({
    VERSION,
    listAvailable: request => run(request, (_body, auth) => runtime.listAvailableManifests(auth)),
    issueReview: request => run(request, (body, auth) => {
      // Review identifiers are server issued. Accepting caller chosen IDs lets
      // an owner accidentally collide with or replay another stored review.
      if (!validManifestFields(body) || ownData(body, "ownerConsent") !== true) {
        return invalid("explicit_owner_review_consent_required");
      }
      const reviewRef = `review_${crypto.randomBytes(16).toString("hex")}`;
      const reviewId = `review_${crypto.randomBytes(16).toString("hex")}`;
      return runtime.issueFixtureReview({
        datasetId: ownData(body, "datasetId"), version: ownData(body, "version"),
        scope: ownData(body, "scope"), reviewRef, reviewId, ownerConsent: true
      }, auth);
    }),
    approve: request => run(request, (body, auth) => {
      if (!validManifestFields(body) || !validId(ownData(body, "reviewRef")))
        return invalid("invalid_manifest_approval_request");
      return runtime.approveManifest({
        datasetId: ownData(body, "datasetId"), version: ownData(body, "version"),
        scope: ownData(body, "scope"), reviewRef: ownData(body, "reviewRef")
      }, auth);
    }),
    listApproved: request => run(request, (body, auth, req) => {
      const queryScope = ownData(req && req.query, "scope");
      const scope = queryScope === undefined ? ownData(body, "scope") : queryScope;
      if (scope !== undefined && !validScope(scope)) return invalid("invalid_manifest_scope");
      return runtime.listApprovedManifests(scope, auth);
    }),
    revoke: request => run(request, (body, auth) => {
      if (!validId(ownData(body, "datasetId")) || !validId(ownData(body, "version")) ||
          !validId(ownData(body, "reasonCode"))) return invalid("invalid_manifest_revocation_request");
      return runtime.revokeManifest({
        datasetId: ownData(body, "datasetId"), version: ownData(body, "version"),
        reasonCode: ownData(body, "reasonCode")
      }, auth);
    }),
    evaluate: request => run(request, (body, auth) => {
      const manifest = ownData(body, "manifest");
      const candidate = ownData(body, "candidate");
      if (!plainObject(manifest) || !validManifestFields(manifest))
        return invalid("invalid_manifest_selection");
      // The evaluation runner remains the authorization/fixture authority.
      // Here we only bound the untrusted candidate before dispatch.
      let checkedCandidate;
      try { checkedCandidate = safeCandidate(candidate); }
      catch (_) { return invalid("invalid_learning_candidate"); }
      return runtime.evaluateCandidate(checkedCandidate, {
        datasetId: ownData(manifest, "datasetId"),
        version: ownData(manifest, "version"), scope: ownData(manifest, "scope")
      }, auth);
    })
  });
}

module.exports = { VERSION, createMarionLearningAdminHandlers };
