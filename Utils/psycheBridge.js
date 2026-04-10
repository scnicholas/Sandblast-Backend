"use strict";

/**
 * Utils/psycheBridge.js
 * Legacy compatibility shim.
 * Normalized to re-export the hardened SiteBridge implementation so the
 * Marion -> Nyx pipeline cannot drift between duplicate bridge modules.
 */

let SiteBridge = null;
try { SiteBridge = require("./sitebridge"); } catch (_e1) {
  try { SiteBridge = require("./SiteBridge"); } catch (_e2) { SiteBridge = null; }
}

if (!SiteBridge) {
  throw new Error("sitebridge_missing_for_legacy_psycheBridge");
}

module.exports = SiteBridge;
module.exports.LEGACY_SHIM = true;
