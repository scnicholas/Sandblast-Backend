"use strict";

// HTTP-neutral owner-only handlers for the host app to mount under its private
// Marion admin routes. Authentication is resolved from server middleware only.
const crypto = require("node:crypto");
const { isVerifiedOwner } = require("./MarionLearningRuntime");
const VERSION = "marion.learningAdminHandlers/1.6-phase21-22-result-hardening";
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;
const SCOPES = new Set(["retrieval", "routing", "response_style"]);
const MAX_CANDIDATE_BYTES = 65536;
const MAX_RESPONSE_BYTES = 262144;
const MAX_CANDIDATE_DEPTH = 20;
const MAX_CANDIDATE_NODES = 10000;
const MAX_REASON_LENGTH = 120;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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
function onlyFields(body, allowed) {
  if (!plainObject(body)) return false;
  try { return Reflect.ownKeys(body).every(key => typeof key === "string" && allowed.has(key) &&
    !!Object.getOwnPropertyDescriptor(body, key)?.enumerable &&
    Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(body, key), "value")); }
  catch (_) { return false; }
}
function validManifestFields(body) {
  return validId(ownData(body, "datasetId")) && validId(ownData(body, "version")) &&
    validScope(ownData(body, "scope"));
}
// Deep-copy into own-data-only JSON values. Reject sparse arrays, hidden/symbol
// properties, prototype pollution, accessors, shared cyclic references, and
// caller-controlled serialization hooks. No evaluation input is ever executed.
function safeCandidate(value) {
  const ancestors = new WeakSet();
  let count = 0;
  function inspect(node, depth) {
    if (++count > MAX_CANDIDATE_NODES || depth > MAX_CANDIDATE_DEPTH)
      throw new TypeError("candidate_limit_exceeded");
    if (node === null || typeof node === "string" || typeof node === "boolean") return node;
    if (typeof node === "number" && Number.isFinite(node)) return node;
    if (typeof node !== "object" || ancestors.has(node))
      throw new TypeError("invalid_learning_candidate");
    if (!Array.isArray(node) && !plainObject(node))
      throw new TypeError("invalid_learning_candidate");
    if (Reflect.ownKeys(node).some(key => typeof key === "symbol"))
      throw new TypeError("invalid_learning_candidate");
    ancestors.add(node);
    try {
      if (Array.isArray(node)) {
        const ownKeys = Reflect.ownKeys(node);
        if (ownKeys.length !== node.length + 1 ||
            ownKeys.some(key => key !== "length" && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= node.length)))
          throw new TypeError("invalid_learning_candidate");
        const result = [];
        for (let i = 0; i < node.length; i++) {
          const d = Object.getOwnPropertyDescriptor(node, String(i));
          if (!d || !Object.prototype.hasOwnProperty.call(d, "value") || !d.enumerable)
            throw new TypeError("invalid_learning_candidate");
          result.push(inspect(d.value, depth + 1));
        }
        return result;
      }
      const result = Object.create(null);
      for (const key of Reflect.ownKeys(node)) {
        if (typeof key !== "string" || FORBIDDEN_KEYS.has(key))
          throw new TypeError("invalid_learning_candidate");
        const d = Object.getOwnPropertyDescriptor(node, key);
        if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, "value"))
          throw new TypeError("invalid_learning_candidate");
        result[key] = inspect(d.value, depth + 1);
      }
      return result;
    } finally { ancestors.delete(node); }
  }
  if (!plainObject(value)) throw new TypeError("invalid_learning_candidate");
  const copy = inspect(value, 0);
  if (Buffer.byteLength(JSON.stringify(copy), "utf8") > MAX_CANDIDATE_BYTES)
    throw new TypeError("candidate_limit_exceeded");
  return copy;
}
function safeResult(result) {
  // Runtime results cross an HTTP boundary; avoid invoking arbitrary toJSON or
  // exposing secrets accidentally returned by dependencies. Preserve documented
  // result shapes, including arrays of manifest/evaluation metadata.
  const redacted = /(?:token|password|secret|credential|cookie|privatekey|authorization|connectionstring|databaseurl|apikey|accesskey|clientsecret|bearer)/i;
  const ancestors = new WeakSet();
  let nodes = 0;
  function visit(value, depth) {
    if (++nodes > 20000 || depth > 25) throw new TypeError("invalid_learning_response");
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (Buffer.byteLength(value, "utf8") > MAX_RESPONSE_BYTES) throw new TypeError("invalid_learning_response");
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "object" || ancestors.has(value)) throw new TypeError("invalid_learning_response");
    if (!Array.isArray(value) && !plainObject(value)) throw new TypeError("invalid_learning_response");
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        if (Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError("invalid_learning_response");
        return Array.from({length: value.length}, (_, i) => {
          const d = Object.getOwnPropertyDescriptor(value, String(i));
          if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, "value")) throw new TypeError("invalid_learning_response");
          return visit(d.value, depth + 1);
        });
      }
      const copy = Object.create(null);
      for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== "string" || FORBIDDEN_KEYS.has(key)) throw new TypeError("invalid_learning_response");
        const d = Object.getOwnPropertyDescriptor(value, key);
        if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, "value")) throw new TypeError("invalid_learning_response");
        if (!redacted.test(key)) copy[key] = visit(d.value, depth + 1);
      }
      return copy;
    } finally { ancestors.delete(value); }
  }
  const clean = visit(result, 0);
  if (Buffer.byteLength(JSON.stringify(clean), "utf8") > MAX_RESPONSE_BYTES)
    throw new TypeError("invalid_learning_response");
  return clean;
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
      // Sanitize *before* reading any dependency-owned fields. Accessors, proxies,
      // non-JSON values and oversize responses must never cross the HTTP boundary.
      let clean;
      try { clean = safeResult(result); }
      catch (_) { return reply(503, invalid("learning_response_invalid")); }
      if (!plainObject(clean) || typeof ownData(clean, "ok") !== "boolean")
        return reply(503, invalid("learning_response_invalid"));
      if (ownData(clean, "ok") === true) {
        // Only the Owner-only health action may produce the documented 503
        // { ok:true, ready:false, status:503 } contract. Never trust an
        // arbitrary success result to choose its own HTTP status.
        if (action === healthAction) {
          if (ownData(clean, "ready") !== true && ownData(clean, "ready") !== false)
            return reply(503, invalid("learning_response_invalid"));
          const expectedStatus = ownData(clean, "ready") === true ? 200 : 503;
          if (ownData(clean, "status") !== expectedStatus || ownData(clean, "liveActivationEnabled") !== false)
            return reply(503, invalid("learning_response_invalid"));
          return reply(expectedStatus, clean);
        }
        return reply(200, clean);
      }
      const reason = safeReason(ownData(clean, "reason"));
      const status = reason === "owner_authentication_required" ? 403 :
        ["offline_evaluation_handlers_not_registered", "durable_storage_not_ready"].includes(reason) || /(?:_unavailable|_not_ready|_failed)$/.test(reason) ? 503 :
          /not_registered|mismatch|revoked|race/.test(reason) ? 409 : 422;
      return reply(status, { ok: false, reason });
    } catch (_) {
      return reply(503, { ok: false, reason: "learning_registry_unavailable" });
    }
  }

  // Fixed action identity ensures only the health endpoint may advertise
  // degraded readiness through its documented 503 status.
  const healthAction = (body, auth) =>
    !onlyFields(body, new Set())
      ? invalid("invalid_learning_request_body")
      : typeof runtime.getPrivateHealth === "function"
        ? runtime.getPrivateHealth(auth)
        : invalid("offline_evaluation_handlers_not_registered");

  return Object.freeze({
    VERSION,
    // Health is Owner-only and never authorizes live learning activation.
    health: request => run(request, healthAction),
    listAvailable: request => run(request, (body, auth) =>
      onlyFields(body, new Set())
        ? runtime.listAvailableManifests(auth)
        : invalid("invalid_learning_request_body")),
    issueReview: request => run(request, (body, auth) => {
      // Review identifiers are server issued. Accepting caller chosen IDs lets
      // an owner accidentally collide with or replay another stored review.
      if (!onlyFields(body, new Set(["datasetId", "version", "scope", "ownerConsent"])) ||
          !validManifestFields(body) || ownData(body, "ownerConsent") !== true) {
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
      if (!onlyFields(body, new Set(["datasetId", "version", "scope", "reviewRef"])) ||
          !validManifestFields(body) || !validId(ownData(body, "reviewRef")))
        return invalid("invalid_manifest_approval_request");
      return runtime.approveManifest({
        datasetId: ownData(body, "datasetId"), version: ownData(body, "version"),
        scope: ownData(body, "scope"), reviewRef: ownData(body, "reviewRef")
      }, auth);
    }),
    listApproved: request => run(request, (body, auth, req) => {
      if (!onlyFields(body, new Set(["scope"]))) return invalid("invalid_manifest_scope");
      const queryScope = ownData(req && req.query, "scope");
      const scope = queryScope === undefined ? ownData(body, "scope") : queryScope;
      if (scope !== undefined && !validScope(scope)) return invalid("invalid_manifest_scope");
      return runtime.listApprovedManifests(scope, auth);
    }),
    revoke: request => run(request, (body, auth) => {
      if (!onlyFields(body, new Set(["datasetId", "version", "reasonCode"])) ||
          !validId(ownData(body, "datasetId")) || !validId(ownData(body, "version")) ||
          !validId(ownData(body, "reasonCode"))) return invalid("invalid_manifest_revocation_request");
      return runtime.revokeManifest({
        datasetId: ownData(body, "datasetId"), version: ownData(body, "version"),
        reasonCode: ownData(body, "reasonCode")
      }, auth);
    }),
    evaluate: request => run(request, (body, auth) => {
      const manifest = ownData(body, "manifest");
      const candidate = ownData(body, "candidate");
      if (!onlyFields(body, new Set(["manifest", "candidate"])) ||
          !onlyFields(manifest, new Set(["datasetId", "version", "scope"])) || !validManifestFields(manifest))
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
