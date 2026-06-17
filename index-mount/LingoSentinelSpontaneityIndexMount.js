'use strict';

/**
 * LingoSentinelSpontaneityIndexMount
 * ADDITIVE index.js mount block. Do not replace your production index.js with this file.
 *
 * Place after express.json/body middleware and before not_found/fallback routes.
 *
 * Expected current architecture:
 * - index.js already mounts /api/lingosentinel publish/token/static lanes.
 * - This adds /api/lingosentinel/translate, /detect, and /translation/health.
 */

function tryRequireMany(paths) {
  for (const p of paths) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_) {}
  }
  return null;
}

function mountLingoSentinelSpontaneityRoutes(app) {
  if (!app || typeof app.use !== 'function') return false;

  const route = tryRequireMany([
    './Data/marion/runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute',
    './Data/marion/runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute.js',
    './runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute',
    './runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute.js'
  ]);

  if (!route) {
    console.log('[LingoSentinel][Spontaneity] translation route unavailable');
    return false;
  }

  app.use('/api/lingosentinel', route);
  console.log('[LingoSentinel][Spontaneity] mounted /api/lingosentinel/translate + /detect + /translation/health');
  return true;
}

module.exports = {
  mountLingoSentinelSpontaneityRoutes
};
