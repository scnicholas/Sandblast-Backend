"use strict";
/**
 * Marion ecosystem baseline — public, read-only operational contract.
 * No private Marion session, learning data, API, or voice authority is exposed.
 * Mounted by index.js at /api/marion/ecosystem.
 * A healthy baseline route does NOT certify the wider Marion ecosystem.
 */
const express = require("express");
const router = express.Router();
const VERSION = "marion.ecosystem.baselineRoute/1.0";
const SURFACES = Object.freeze(["radio", "tv", "synapse", "lingosentinel", "nyx"]);
function noStore(res) {
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  return res;
}
function snapshot() {
  return {
    ok: true,
    service: "marion-ecosystem-baseline",
    version: VERSION,
    routeMounted: true,
    baselineReady: true,
    fullEcosystemReady: false,
    fullEcosystemVerified: false,
    scope: "public-operational-metadata",
    privateRuntimeExposed: false,
    adminAuthenticationBypassed: false,
    autonomousLearningActivated: false
  };
}
router.get("/health", (_req, res) => noStore(res).status(200).json(snapshot()));
router.get("/manifest", (_req, res) => noStore(res).status(200).json({
  ...snapshot(),
  manifest: { version: "marion.ecosystem.baselineManifest/1.0", surfaces: SURFACES,
    note: "Surface names indicate integration scope, not runtime readiness." }
}));
module.exports = router;
module.exports.router = router;
module.exports.VERSION = VERSION;
module.exports.snapshot = snapshot;
