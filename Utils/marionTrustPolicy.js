"use strict";

/**
 * marionTrustPolicy.js
 *
 * Trust policy resolver for Marion/Nyx handoff.
 *
 * Contract:
 * - Trust policy decides channel permission only.
 * - It must not compose replies.
 * - It must not route domains.
 * - It must not normalize Marion packets.
 * - It must not call MarionSO, MarionBridge, or index.js.
 */

const VERSION = "marionTrustPolicy v1.0.1 CONFLICT-AUDITED-TIER-NORMALIZED";

const TRUST_TIERS = Object.freeze({
  PUBLIC: "public",
  EXPRESSION_SHELL: "expression_shell",
  BRIDGE_PEER: "bridge_peer",
  OWNER: "owner"
});

const TRUST_LEVELS = Object.freeze({
  [TRUST_TIERS.PUBLIC]: 1,
  [TRUST_TIERS.EXPRESSION_SHELL]: 2,
  [TRUST_TIERS.BRIDGE_PEER]: 3,
  [TRUST_TIERS.OWNER]: 4
});

const TRUST_ALIASES = Object.freeze({
  public: TRUST_TIERS.PUBLIC,
  guest: TRUST_TIERS.PUBLIC,
  anonymous: TRUST_TIERS.PUBLIC,
  default: TRUST_TIERS.PUBLIC,

  expression: TRUST_TIERS.EXPRESSION_SHELL,
  expression_shell: TRUST_TIERS.EXPRESSION_SHELL,
  shell: TRUST_TIERS.EXPRESSION_SHELL,
  nyx: TRUST_TIERS.EXPRESSION_SHELL,

  bridge: TRUST_TIERS.BRIDGE_PEER,
  bridge_peer: TRUST_TIERS.BRIDGE_PEER,
  peer: TRUST_TIERS.BRIDGE_PEER,
  trusted: TRUST_TIERS.BRIDGE_PEER,

  owner: TRUST_TIERS.OWNER,
  admin: TRUST_TIERS.OWNER,
  mac: TRUST_TIERS.OWNER
});

function safeStr(v) {
  return v == null ? "" : String(v).trim();
}

function safeObj(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function cleanKey(v) {
  return safeStr(v).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeTrustTier(value) {
  const key = cleanKey(value || TRUST_TIERS.PUBLIC);
  return TRUST_ALIASES[key] || TRUST_TIERS.PUBLIC;
}

function normalizeRequestedMode(context = {}) {
  const ctx = safeObj(context);
  return cleanKey(ctx.requestedMode || ctx.mode || ctx.channel || "");
}

function resolveTrustState(relationship = {}, context = {}) {
  const rel = safeObj(relationship);
  const ctx = safeObj(context);
  const tier = normalizeTrustTier(rel.trustTier || rel.tier || ctx.trustTier || ctx.tier || TRUST_TIERS.PUBLIC);
  const requestedMode = normalizeRequestedMode(ctx);
  const privateRequested =
    requestedMode === "private" ||
    requestedMode === "private_channel" ||
    requestedMode === "private_dialogue" ||
    !!ctx.privateChannelRequested;

  const allowsPrivateDialogue = tier === TRUST_TIERS.OWNER || tier === TRUST_TIERS.BRIDGE_PEER;
  const allowsDirectRelay =
    tier === TRUST_TIERS.OWNER ||
    tier === TRUST_TIERS.BRIDGE_PEER ||
    tier === TRUST_TIERS.EXPRESSION_SHELL;

  const state = {
    ok: true,
    tier,
    level: TRUST_LEVELS[tier] || TRUST_LEVELS[TRUST_TIERS.PUBLIC],
    allowsPrivateDialogue,
    allowsDirectRelay,
    nyxMode:
      tier === TRUST_TIERS.EXPRESSION_SHELL
        ? "resolved_state_only"
        : tier === TRUST_TIERS.PUBLIC
          ? "public_filtered"
          : "trusted",
    requestedMode,
    privateRequested,
    effectiveChannel:
      allowsPrivateDialogue && privateRequested
        ? "private_channel"
        : tier === TRUST_TIERS.EXPRESSION_SHELL
          ? "resolved_state_only"
          : "relay_to_nyx",
    deniedReasons: [],
    policyRole: "channel_permission_only",
    version: VERSION
  };

  if (privateRequested && !allowsPrivateDialogue) {
    state.deniedReasons.push("private_channel_not_allowed");
  }

  return state;
}

function isPrivateChannelAllowed(trustState = {}) {
  return !!safeObj(trustState).allowsPrivateDialogue;
}

function getTrustPolicyDiagnostics() {
  return {
    ok: true,
    version: VERSION,
    role: "trust_policy_only",
    required: true,
    conflictRisk: "low",
    ownsFinalReply: false,
    ownsRouting: false,
    ownsPacketNormalization: false,
    ownsTransport: false,
    validTiers: Object.values(TRUST_TIERS)
  };
}

module.exports = {
  VERSION,
  TRUST_TIERS,
  TRUST_LEVELS,
  normalizeTrustTier,
  resolveTrustState,
  isPrivateChannelAllowed,
  getTrustPolicyDiagnostics
};
