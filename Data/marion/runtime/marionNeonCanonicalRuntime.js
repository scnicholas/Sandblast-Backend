'use strict';
/**
 * Sandblast Media Inc. — Marion canonical runtime (Phase 1, isolated).
 * Does not connect to Neon, alter routes, load secrets, or enable learning.
 * Existing production adapters must be wired explicitly after integration tests.
 */

const REQUIRED = ['authorize', 'invokeGateway', 'compose', 'validate'];

function createMarionNeonCanonicalRuntime(deps) {
  if (!deps || typeof deps !== 'object') throw new TypeError('Dependencies are required');
  for (const key of REQUIRED) {
    if (typeof deps[key] !== 'function') throw new TypeError(`Missing required adapter: ${key}`);
  }
  for (const key of ['loadContext', 'writeAudit']) {
    if (deps[key] !== undefined && typeof deps[key] !== 'function') {
      throw new TypeError(`Invalid optional adapter: ${key}`);
    }
  }

  async function execute(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      throw new TypeError('Request must be an object');
    }
    // Do not log request, tokens, secrets, model contents, or memory.
    const access = await deps.authorize(request);
    if (!access || access.authorized !== true) {
      const error = new Error('Marion canonical request not authorized');
      error.code = 'MARION_UNAUTHORIZED';
      throw error;
    }
    const context = deps.loadContext ? await deps.loadContext(request, access) : null;
    const inference = await deps.invokeGateway({ request, access, context });
    const composed = await deps.compose({ request, access, context, inference });
    const verdict = await deps.validate({ request, access, context, inference, composed });
    if (!verdict || verdict.valid !== true || !Object.prototype.hasOwnProperty.call(verdict, 'response')) {
      const error = new Error('Marion canonical response did not pass validation');
      error.code = 'MARION_VALIDATION_FAILED';
      throw error;
    }
    // Audit is a production policy decision: if configured and fails, fail closed.
    if (deps.writeAudit) await deps.writeAudit({ request, access, verdict });
    return verdict.response;
  }

  return Object.freeze({ execute });
}

module.exports = { createMarionNeonCanonicalRuntime };
