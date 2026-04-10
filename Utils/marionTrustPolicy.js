"use strict";
const VERSION = "marionTrustPolicy v1.0.0 PHASE1-TRUST-POLICY";
function safeStr(v) { return v == null ? "" : String(v).trim(); }
function resolveTrustState(relationship = {}, context = {}) {
  const tier = safeStr(relationship.trustTier || "public") || "public";
  const requestedMode = safeStr(context.requestedMode || context.mode || "").toLowerCase();
  const privateRequested = requestedMode === "private" || requestedMode === "private_channel" || !!context.privateChannelRequested;
  const state = {
    tier,
    level: tier === "owner" ? 4 : tier === "bridge_peer" ? 3 : tier === "expression_shell" ? 2 : 1,
    allowsPrivateDialogue: tier === "owner" || tier === "bridge_peer",
    allowsDirectRelay: tier === "owner" || tier === "bridge_peer" || tier === "expression_shell",
    nyxMode: tier === "expression_shell" ? "resolved_state_only" : (tier === "public" ? "public_filtered" : "trusted"),
    requestedMode,
    privateRequested,
    version: VERSION
  };
  state.effectiveChannel = state.allowsPrivateDialogue && privateRequested ? "private_channel" : (tier === "expression_shell" ? "resolved_state_only" : "relay_to_nyx");
  state.deniedReasons = [];
  if (privateRequested && !state.allowsPrivateDialogue) state.deniedReasons.push("private_channel_not_allowed");
  return state;
}
function isPrivateChannelAllowed(trustState = {}) { return !!trustState.allowsPrivateDialogue; }
module.exports = { VERSION, resolveTrustState, isPrivateChannelAllowed };
