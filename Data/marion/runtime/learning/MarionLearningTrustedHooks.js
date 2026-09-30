"use strict";

const { isVerifiedOwner } = require("./MarionLearningRuntime");

const VERSION = "marion.learningTrustedHooks/1.0-fail-closed";

function createMarionLearningTrustedHooks({
  runtime,
  resolveAuthContext,
  enabled = false
} = {}) {
  if (!runtime || typeof runtime !== "object") {
    throw new TypeError("runtime is required");
  }

  if (typeof resolveAuthContext !== "function") {
    throw new TypeError(
      "resolveAuthContext must use the existing server authentication middleware"
    );
  }

  const requiredMethods = [
    "evaluateCandidate",
    "submitEvaluation",
    "decideProposal",
    "getPrivateHealth"
  ];

  for (const method of requiredMethods) {
    if (typeof runtime[method] !== "function") {
      throw new TypeError(`runtime.${method} is required`);
    }
  }

  async function invoke(req, method, args = []) {
    if (enabled !== true) {
      return {
        ok: false,
        status: 503,
        reason: "learning_hooks_disabled"
      };
    }

    let authContext;
    try {
      authContext = await resolveAuthContext(req);
    } catch (_) {
      return {
        ok: false,
        status: 403,
        reason: "owner_authentication_required"
      };
    }

    if (!isVerifiedOwner(authContext)) {
      return {
        ok: false,
        status: 403,
        reason: "owner_authentication_required"
      };
    }

    try {
      return await runtime[method](...args, authContext);
    } catch (_) {
      return {
        ok: false,
        status: 503,
        reason: "learning_runtime_unavailable"
      };
    }
  }

  return Object.freeze({
    VERSION,

    evaluateCandidate(req, candidate, dataset) {
      return invoke(req, "evaluateCandidate", [candidate, dataset]);
    },

    submitEvaluation(req, report) {
      return invoke(req, "submitEvaluation", [report]);
    },

    decideProposal(req, input) {
      return invoke(req, "decideProposal", [input]);
    },

    getPrivateHealth(req) {
      return invoke(req, "getPrivateHealth");
    }
  });
}

module.exports = {
  VERSION,
  createMarionLearningTrustedHooks
};
