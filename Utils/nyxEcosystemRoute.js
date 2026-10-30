"use strict";

/**
 * Nyx public ecosystem router — guarded boot and safe readiness responses.
 * Install at exactly Utils/nyxEcosystemRoute.js (Linux paths are case-sensitive).
 * index.js mounts this router at /api/nyx/ecosystem.
 * The original business logic remains delegated to ecosystem spine/registry.
 */
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const BRIDGE_PATH = path.resolve(__dirname, "..", "public", "Nyx", "nyx-surface-bridge.js");
const VERSION = "nyx.ecosystem.route/1.2-dependency-readiness";

function loadLocal(modulePath, requiredFunctions) {
  try {
    const value = require(modulePath);
    if (!value || requiredFunctions.some((name) => typeof value[name] !== "function")) {
      return { value: null, error: "invalid_module_contract" };
    }
    return { value, error: "" };
  } catch (error) {
    // Do not echo stack traces or filesystem details on public routes.
    return { value: null, error: error && error.code === "MODULE_NOT_FOUND" ? "module_not_found" : "module_load_failed" };
  }
}

const spineLoad = loadLocal("./nyxEcosystemSpine.js", ["readManifest", "surfaceName", "normalizeContext", "transition"]);
const contentLoad = loadLocal("./nyxContentDataRegistry.js", ["status", "catalog", "releaseValidation"]);
const spine = spineLoad.value;
const content = contentLoad.value;
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const bridgeExists = () => { try { return fs.statSync(BRIDGE_PATH).isFile(); } catch (_) { return false; } };
const dependencyStatus = () => ({
  spine: !!spine, contentRegistry: !!content, bridge: bridgeExists(),
  spineError: spine ? undefined : spineLoad.error,
  registryError: content ? undefined : contentLoad.error
});
const unavailable = (res, component) => res.status(503).json({
  ok: false, error: "ECOSYSTEM_DEPENDENCY_UNAVAILABLE", component,
  service: "nyx-ecosystem", publicOnly: true
});
function wrap(handler) {
  return (req, res) => {
    try { return handler(req, res); }
    catch (_) { return res.status(503).json({ ok: false, error: "ECOSYSTEM_RUNTIME_ERROR", service: "nyx-ecosystem" }); }
  };
}

router.get("/manifest", wrap((_req, res) => spine ? res.json(spine.readManifest()) : unavailable(res, "spine")));
router.post("/context", wrap((req, res) => spine ? res.json(spine.normalizeContext(object(req.body), object(req.body).previousState)) : unavailable(res, "spine")));
router.post("/transition", wrap((req, res) => {
  if (!spine) return unavailable(res, "spine");
  const result = spine.transition(req.body);
  if (!result || typeof result !== "object") return res.status(503).json({ ok: false, error: "ECOSYSTEM_INVALID_TRANSITION_RESULT" });
  return res.status(result.ok ? 200 : 400).json(result);
}));
router.get("/bridge.js", wrap((_req, res) => {
  if (!bridgeExists()) return unavailable(res, "bridge");
  res.type("application/javascript");
  res.set("Cache-Control", "public,max-age=300");
  return res.sendFile(BRIDGE_PATH);
}));
router.get("/health", wrap((_req, res) => {
  res.set("Cache-Control", "no-store");
  const status = dependencyStatus();
  const ok = status.spine && status.contentRegistry && status.bridge;
  return res.status(ok ? 200 : 503).json({
    ok, version: spine && spine.VERSION || VERSION,
    manifest: status.spine, bridge: status.bridge,
    contentRegistry: status.contentRegistry, publicOnly: true,
    dependencies: status
  });
}));
router.get("/content/status", wrap((_req, res) => content ? res.json(content.status()) : unavailable(res, "contentRegistry")));
router.get("/content/catalog/:source", wrap((req, res) => {
  res.set("Cache-Control", "no-store");
  if (!content) return unavailable(res, "contentRegistry");
  const result = content.catalog(String(req.params.source || "").toLowerCase());
  if (!result || typeof result !== "object") return res.status(503).json({ ok: false, error: "ECOSYSTEM_INVALID_CATALOG_RESULT" });
  return res.status(result.status === "invalid" ? 404 : 200).json(result);
}));
router.get("/release/validate", wrap((_req, res) => {
  if (!content) return unavailable(res, "contentRegistry");
  const result = content.releaseValidation();
  if (!result || typeof result !== "object") return res.status(503).json({ ok: false, error: "ECOSYSTEM_INVALID_RELEASE_RESULT" });
  return res.status(result.releaseReady ? 200 : 503).json(result);
}));

module.exports = router;
module.exports.VERSION = spine && spine.VERSION || VERSION;
module.exports.readManifest = (...args) => spine ? spine.readManifest(...args) : { ok: false, error: "ECOSYSTEM_DEPENDENCY_UNAVAILABLE" };
module.exports.surfaceName = (...args) => spine ? spine.surfaceName(...args) : "";
module.exports.normalizeContext = (...args) => spine ? spine.normalizeContext(...args) : { ok: false, error: "ECOSYSTEM_DEPENDENCY_UNAVAILABLE" };
module.exports.transition = (...args) => spine ? spine.transition(...args) : { ok: false, error: "ECOSYSTEM_DEPENDENCY_UNAVAILABLE" };
module.exports.contentRegistry = content;
module.exports.releaseValidation = (...args) => content ? content.releaseValidation(...args) : { ok: false, releaseReady: false, error: "ECOSYSTEM_DEPENDENCY_UNAVAILABLE" };
module.exports.dependencyStatus = dependencyStatus;
