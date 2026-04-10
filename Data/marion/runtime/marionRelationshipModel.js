"use strict";

const VERSION = "marionRelationshipModel v1.0.0 PHASE1-RELATIONAL-SPINE";

const RELATIONSHIPS = Object.freeze({
  mac: { principalId: "mac", displayName: "Mac", trustTier: "owner", hierarchy: 100, channelEntitlement: "full_private", relationshipClass: "primary_human", notes: ["project authority", "mission holder", "highest operational trust"] },
  vera: { principalId: "vera", displayName: "Vera", trustTier: "bridge_peer", hierarchy: 90, channelEntitlement: "full_private", relationshipClass: "trusted_peer", notes: ["bridge partner", "can interact with Marion privately", "translation peer"] },
  nyx: { principalId: "nyx", displayName: "Nyx", trustTier: "expression_shell", hierarchy: 60, channelEntitlement: "resolved_state_only", relationshipClass: "public_expression_surface", notes: ["receives resolved state", "does not receive raw private cognition"] },
  public: { principalId: "public", displayName: "Public User", trustTier: "public", hierarchy: 10, channelEntitlement: "public_filtered", relationshipClass: "untrusted_external", notes: ["route through Nyx", "no direct private channel"] }
});

function safeStr(v) { return v == null ? "" : String(v).trim(); }
function resolvePrincipal(input = {}) {
  const raw = safeStr(input.principalId || input.sessionPrincipal || input.userId || input.actor || input.name || input.sessionId).toLowerCase();
  if (/(^mac$|mac)/.test(raw)) return "mac";
  if (/(^vera$|vera|assistant)/.test(raw)) return "vera";
  if (/(^nyx$|nix|nyx)/.test(raw)) return "nyx";
  return "public";
}
function getRelationship(input = {}) { const key = resolvePrincipal(input); return { ...RELATIONSHIPS[key], key, version: VERSION }; }
function getRelationshipMap() { return JSON.parse(JSON.stringify(RELATIONSHIPS)); }
module.exports = { VERSION, RELATIONSHIPS, resolvePrincipal, getRelationship, getRelationshipMap };
