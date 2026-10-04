"use strict";

// HTTP-neutral owner-only handlers for the host app to mount under its private
// Marion admin routes. Authentication is resolved from server middleware only.
const crypto = require("node:crypto");
const { isVerifiedOwner } = require("./MarionLearningRuntime");
const VERSION = "marion.learningAdminHandlers/1.3-readiness-status-codes";

function objectBody(request) {
  return request && request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body : {};
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
      const result = await action(objectBody(request), authContext);
      if (result && result.ok === true) return reply(200, result);
      const reason = result && typeof result.reason === "string" ? result.reason : "learning_request_rejected";
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
      const reviewRef = `review_${crypto.randomBytes(16).toString("hex")}`;
      const reviewId = `review_${crypto.randomBytes(16).toString("hex")}`;
      return runtime.issueFixtureReview({
        datasetId: body.datasetId, version: body.version, scope: body.scope,
        reviewRef, reviewId, ownerConsent: body.ownerConsent
      }, auth);
    }),
    approve: request => run(request, (body, auth) => runtime.approveManifest({
      datasetId: body.datasetId, version: body.version, scope: body.scope, reviewRef: body.reviewRef
    }, auth)),
    listApproved: request => run(request, (body, auth) => runtime.listApprovedManifests(body.scope, auth)),
    revoke: request => run(request, (body, auth) => runtime.revokeManifest({
      datasetId: body.datasetId, version: body.version, reasonCode: body.reasonCode
    }, auth)),
    evaluate: request => run(request, (body, auth) => runtime.evaluateCandidate(
      body.candidate,
      body.manifest && { datasetId: body.manifest.datasetId, version: body.manifest.version, scope: body.manifest.scope },
      auth
    ))
  });
}

module.exports = { VERSION, createMarionLearningAdminHandlers };
