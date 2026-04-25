"use strict";

/**
 * sitebridge.js
 * Phase-3 inert non-authority stub.
 *
 * Purpose:
 * - Preserve imports for any legacy caller.
 * - Return bounded, data-only hints if called.
 * - Never shape final replies, support mode, intent, transport, or Marion packets.
 */

const VERSION = "sitebridge.disabled.v1 PHASE3-DATA-HINTS-ONLY";

function build(input = {}) {
  const features = input && typeof input === "object" && input.features && typeof input.features === "object" ? input.features : {};
  return {
    ok: true,
    enabled: false,
    disabled: true,
    version: VERSION,
    nonAuthority: true,
    finalReplyAuthority: false,
    queryKey: String(input && input.queryKey || "").slice(0, 64),
    sessionKey: String(input && input.sessionKey || "").slice(0, 64),
    mode: "disabled",
    intent: String(features.intent || "CLARIFY").slice(0, 32),
    regulation: "steady",
    cognitiveLoad: "medium",
    stance: "data_only",
    toneCues: [],
    uiCues: [],
    guardrails: ["sitebridge_disabled", "non_authority", "no_reply_synthesis"],
    responseCues: [],
    domains: {},
    confidence: 0,
    diag: {
      disabled: true,
      reason: "phase3_removed_from_active_flow"
    }
  };
}

async function buildAsync(input = {}) {
  return build(input);
}

module.exports = {
  VERSION,
  build,
  buildAsync,
  DISABLED: true,
  nonAuthority: true
};
