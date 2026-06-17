"use strict";

/**
 * LingoSentinelSpontaneityIndexMount
 * ADDITIVE index.js mount block. Do not replace production index.js with this file.
 *
 * Place after express.json/body middleware and before not_found/fallback routes.
 * Adds /api/lingosentinel/translate, /detect, /languages, and /translation/health.
 */

const path = require("path");

const VERSION = "2.2.0-spontaneity-index-mount";

function tryRequireMany(paths) {
  for (const p of paths) {
    try {
      const mod = require(p);
      if (mod) return { mod, resolved: require.resolve(p) };
    } catch (_) {}
  }
  return { mod: null, resolved: "" };
}

function candidatePaths(rootDir) {
  const root = rootDir || process.cwd();
  return [
    path.join(root, "Data/marion/runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute.js"),
    path.join(root, "Data/marion/runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute"),
    path.join(__dirname, "../Data/marion/runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute.js"),
    path.join(__dirname, "Data/marion/runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute.js"),
    "./Data/marion/runtime/LingoSentinel/LingoSentinelSpontaneousTranslationRoute.js"
  ];
}

function mountLingoSentinelSpontaneityRoutes(app, options = {}) {
  if (!app || typeof app.use !== "function") return { ok: false, mounted: false, reason: "invalid_express_app", version: VERSION };
  app.locals = app.locals || {};
  if (app.locals.lingoSentinelSpontaneityMounted) return { ok: true, mounted: true, duplicate: true, version: VERSION };

  const found = tryRequireMany(candidatePaths(options.rootDir));
  const route = found.mod;
  if (!route) {
    console.log("[LingoSentinel][Spontaneity] translation route unavailable");
    return { ok: false, mounted: false, reason: "route_unavailable", version: VERSION };
  }

  app.use("/api/lingosentinel", route);
  app.locals.lingoSentinelSpontaneityMounted = true;
  app.locals.lingoSentinelSpontaneityMount = { ok: true, mounted: true, resolvedPath: found.resolved, version: VERSION, mountedAt: Date.now() };
  console.log("[LingoSentinel][Spontaneity] mounted /api/lingosentinel/translate + /detect + /languages + /translation/health");
  return app.locals.lingoSentinelSpontaneityMount;
}

module.exports = { VERSION, mountLingoSentinelSpontaneityRoutes };
