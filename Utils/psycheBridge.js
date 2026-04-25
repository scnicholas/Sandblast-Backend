"use strict";

/**
 * psycheBridge.js
 * Phase-3 disabled compatibility shim.
 *
 * Purpose:
 * - Preserve legacy require/import compatibility.
 * - Prevent psycheBridge from re-exporting SiteBridge.
 * - Prevent duplicate bridge behavior from re-entering Marion/Nyx flow.
 */

const VERSION = "psycheBridge.disabled.v1 PHASE3-INERT-NON-AUTHORITY";

function disabled() {
  return {
    ok: true,
    disabled: true,
    version: VERSION,
    nonAuthority: true,
    finalReplyAuthority: false
  };
}

module.exports = {
  VERSION,
  LEGACY_SHIM: true,
  DISABLED: true,
  nonAuthority: true,
  build: disabled,
  buildAsync: async () => disabled(),
  route: disabled,
  handle: disabled,
  maybeResolve: disabled
};
