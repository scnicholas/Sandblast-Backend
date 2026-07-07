"use strict";
/**
 * privateOperatorBoundaryLock.js
 * Phase 2 Private Marion / Operator Boundary Lock.
 *
 * Purpose:
 * - Public Sandblast.channel users speak with Nyx only.
 * - Private/admin operator sessions may speak with Marion and may preserve Mac-specific
 *   personalization only after the server-side admin route/auth layer has already
 *   marked the turn as allowed.
 * - Body-supplied claims such as operatorPersonalization, allowPersonalName, or
 *   authenticatedOperator are not enough by themselves when the request is public.
 */

const VERSION = "nyx.privateOperatorBoundaryLock/2.0";
const OPERATOR_NAME = "Mac";
const OPERATOR_AGENT = "Marion";
const PUBLIC_AGENT = "Nyx";
const REPLY_KEYS = new Set([
  "reply", "text", "answer", "response", "message", "output", "spokenText", "speechText",
  "displayReply", "publicReply", "visibleReply", "finalReply", "authoritativeReply", "adminReply",
  "marionReply", "privateReply"
]);
const PRIVATE_MARKER_KEYS = /^(?:authenticatedOperator|operatorAuthenticated|operatorPersonalization|allowPersonalName|operatorName|privateAdminConversation|marionAdminConversation|adminConversationAllowed|adminVerified|sessionVerified|serverSideAdminAuth|trustedServerAuth|ownerVerified|adminVoiceVerified|adminVoiceDeliveryAllowed|adminVoiceRuntimeApproval)$/i;
const PUBLIC_SOURCE_RE = /(?:sandblast_channel_widget|cosmos-widget|nyx-widget|public_interface|webflow|sandblast\.channel)/i;
const ADMIN_SOURCE_RE = /(?:marion_admin_conversation|admin_text|admin|marion-admin-interface|protected admin route)/i;
const ADMIN_ROUTE_RE = /(?:\/api\/marion\/admin\/conversation|\/marion\/admin\/conversation)/i;

function isObj(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function safeObj(value) { return isObj(value) ? value : {}; }
function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function lower(value) { return safeStr(value).toLowerCase(); }
function headerValue(headers, key) {
  const h = safeObj(headers);
  return safeStr(h[key] || h[key.toLowerCase()] || h[key.toUpperCase()] || "");
}
function boolish(value) {
  if (value === true) return true;
  if (typeof value === "string") return /^(?:1|true|yes|on|verified|allowed|operator|admin)$/i.test(value.trim());
  return false;
}
function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const v = safeStr(arguments[i]);
    if (v) return v;
  }
  return "";
}
function collectContext(input) {
  const src = safeObj(input);
  const req = safeObj(src.req || src.request);
  const body = safeObj(src.body || req.body);
  const payload = safeObj(src.payload || src.response || src.result || src.packet || src.data);
  const meta = safeObj(src.meta || body.meta || payload.meta);
  const ui = safeObj(src.ui || body.ui || payload.ui);
  const client = safeObj(src.client || body.client || payload.client);
  const auth = safeObj(src.auth || src.authorization || body.auth || body.authorization || payload.auth || payload.authorization || meta.auth || meta.authorization);
  const headers = safeObj(src.headers || body.headers || req.headers);
  const route = firstText(src.route, body.route, payload.route, req.path, req.originalUrl, req.url, headerValue(headers, "x-sb-route"));
  const source = firstText(src.source, body.source, payload.source, src.inputChannel, body.inputChannel, payload.inputChannel, meta.source, headerValue(headers, "x-sb-source"));
  const audience = firstText(src.audience, body.audience, payload.audience, ui.audience, meta.audience, headerValue(headers, "x-sb-audience"));
  const surfaceAgent = firstText(src.surfaceAgent, body.surfaceAgent, payload.surfaceAgent, ui.surfaceAgent, meta.surfaceAgent, payload.publicAgent, headerValue(headers, "x-sb-public-surface"));
  const site = firstText(client.site, safeObj(body.client).site, safeObj(payload.client).site);
  return { src, body, payload, meta, ui, client, auth, headers, route, source, audience, surfaceAgent, site };
}
function hasPublicSurfaceMarkers(ctx) {
  const c = collectContext(ctx);
  return c.src.publicSurfaceOnly === true || c.body.publicSurfaceOnly === true || c.payload.publicSurfaceOnly === true || c.ui.publicSurfaceOnly === true ||
    c.src.publicIdentityLock === true || c.body.publicIdentityLock === true || c.payload.publicIdentityLock === true ||
    lower(c.audience) === "public" || lower(c.surfaceAgent) === "nyx" || PUBLIC_SOURCE_RE.test(c.source) || PUBLIC_SOURCE_RE.test(c.site) || !!headerValue(c.headers, "x-nyx-client-version");
}
function hasAdminSurfaceMarkers(ctx) {
  const c = collectContext(ctx);
  return ADMIN_ROUTE_RE.test(c.route) || ADMIN_SOURCE_RE.test(c.source) ||
    c.src.privateAdminConversation === true || c.body.privateAdminConversation === true || c.payload.privateAdminConversation === true ||
    c.src.marionAdminConversation === true || c.body.marionAdminConversation === true || c.payload.marionAdminConversation === true ||
    lower(c.audience) === "operator" || lower(c.audience) === "admin" || lower(c.surfaceAgent) === "marion";
}
function hasServerVerifiedAuth(ctx) {
  const c = collectContext(ctx);
  const candidates = [
    c.src.serverSideAdminAuth, c.body.serverSideAdminAuth, c.payload.serverSideAdminAuth, c.meta.serverSideAdminAuth, c.auth.serverSideAdminAuth,
    c.src.trustedServerAuth, c.body.trustedServerAuth, c.payload.trustedServerAuth, c.meta.trustedServerAuth, c.auth.trustedServerAuth,
    c.src.sessionVerified, c.body.sessionVerified, c.payload.sessionVerified, c.meta.sessionVerified, c.auth.sessionVerified,
    c.src.adminVerified, c.body.adminVerified, c.payload.adminVerified, c.meta.adminVerified, c.auth.adminVerified, c.auth.verified,
    c.src.ownerVerified, c.body.ownerVerified, c.payload.ownerVerified, c.meta.ownerVerified,
    c.src.adminVoiceVerified, c.body.adminVoiceVerified, c.payload.adminVoiceVerified, c.meta.adminVoiceVerified, c.auth.adminVoiceVerified,
    c.src.adminVoiceDeliveryAllowed, c.body.adminVoiceDeliveryAllowed, c.payload.adminVoiceDeliveryAllowed, c.meta.adminVoiceDeliveryAllowed, c.auth.adminVoiceDeliveryAllowed
  ];
  return candidates.some(boolish);
}
function isVerifiedOperatorContext(input) {
  const c = collectContext(input);
  const adminMarkers = hasAdminSurfaceMarkers(c) || c.payload.adminConversationAllowed === true || c.body.adminConversationAllowed === true;
  const publicMarkers = hasPublicSurfaceMarkers(c);
  const explicitOperator = c.src.authenticatedOperator === true || c.body.authenticatedOperator === true || c.payload.authenticatedOperator === true ||
    c.src.operatorAuthenticated === true || c.body.operatorAuthenticated === true || c.payload.operatorAuthenticated === true;
  const verified = hasServerVerifiedAuth(c) || (c.payload.adminConversationAllowed === true && ADMIN_ROUTE_RE.test(c.payload.route || c.route)) || explicitOperator;
  if (!adminMarkers || !verified) return false;
  if (publicMarkers && !ADMIN_ROUTE_RE.test(c.route) && !ADMIN_ROUTE_RE.test(c.payload.route || "")) return false;
  return true;
}
function operatorNameFrom(input) {
  const c = collectContext(input);
  return firstText(c.payload.operatorName, c.body.operatorName, c.src.operatorName, c.payload.speakerHint, c.body.speakerHint, OPERATOR_NAME) || OPERATOR_NAME;
}
function sanitizeOperatorReply(value) {
  const text = safeStr(value);
  return text || "I'm with you, Mac. What would you like to work on next?";
}
function projectPrivateOperatorFields(value, context, depth) {
  const d = Number(depth || 0);
  if (d > 8) return value;
  if (typeof value === "string") return sanitizeOperatorReply(value);
  if (Array.isArray(value)) return value.map((item) => projectPrivateOperatorFields(item, context, d + 1));
  if (!isObj(value)) return value;
  const name = operatorNameFrom(context || value);
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (REPLY_KEYS.has(key)) { out[key] = sanitizeOperatorReply(child); continue; }
    if (/^audience$/i.test(key)) { out[key] = "operator"; continue; }
    if (/^(?:surfaceAgent|publicAgent|userFacingAgent|authority)$/i.test(key)) { out[key] = OPERATOR_AGENT; continue; }
    out[key] = projectPrivateOperatorFields(child, context, d + 1);
  }
  out.privateOperatorBoundaryLock = true;
  out.publicSurfaceOnly = false;
  out.publicSurfaceIdentityLock = false;
  out.audience = "operator";
  out.surfaceAgent = "marion";
  out.publicAgent = OPERATOR_AGENT;
  out.userFacingAgent = OPERATOR_AGENT;
  out.authority = OPERATOR_AGENT;
  out.privateAdminConversation = true;
  out.marionAdminConversation = true;
  out.authenticatedOperator = true;
  out.operatorPersonalization = true;
  out.allowPersonalName = true;
  out.operatorName = name;
  out.publicUsersMayAddressMarion = false;
  out.publicUsersSpeakThrough = PUBLIC_AGENT;
  out.meta = Object.assign({}, safeObj(out.meta), {
    privateOperatorBoundaryLock: true,
    audience: "operator",
    surfaceAgent: "marion",
    operatorPersonalization: true,
    allowPersonalName: true,
    operatorName: name,
    publicSurfaceOnly: false,
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: PUBLIC_AGENT,
    diagnosticsRedacted: true,
    version: VERSION
  });
  return out;
}
function stripUnverifiedOperatorClaims(value, depth) {
  const d = Number(depth || 0);
  if (d > 8) return value;
  if (Array.isArray(value)) return value.map((item) => stripUnverifiedOperatorClaims(item, d + 1));
  if (!isObj(value)) return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^operatorName$/i.test(key)) continue;
    if (PRIVATE_MARKER_KEYS.test(key)) {
      if (/^(?:operatorPersonalization|allowPersonalName|authenticatedOperator|operatorAuthenticated|adminConversationAllowed)$/i.test(key)) out[key] = false;
      else if (/^(?:privateAdminConversation|marionAdminConversation)$/i.test(key)) out[key] = false;
      else out[key] = false;
      continue;
    }
    out[key] = stripUnverifiedOperatorClaims(child, d + 1);
  }
  return out;
}
function projectRuntimeContext(packet, context) {
  if (!isObj(packet)) return packet;
  if (isVerifiedOperatorContext(context || packet)) return projectPrivateOperatorFields(packet, context || packet);
  return stripUnverifiedOperatorClaims(packet);
}
function buildOperatorContextPatch(input) {
  const verified = isVerifiedOperatorContext(input);
  return {
    version: VERSION,
    verified,
    audience: verified ? "operator" : "public",
    surfaceAgent: verified ? "marion" : "nyx",
    privateAdminConversation: verified,
    marionAdminConversation: verified,
    authenticatedOperator: verified,
    operatorPersonalization: verified,
    allowPersonalName: verified,
    operatorName: verified ? operatorNameFrom(input) : "",
    publicSurfaceOnly: !verified,
    publicUsersMayAddressMarion: false,
    publicUsersSpeakThrough: PUBLIC_AGENT
  };
}
module.exports = {
  VERSION,
  OPERATOR_NAME,
  OPERATOR_AGENT,
  PUBLIC_AGENT,
  collectContext,
  hasPublicSurfaceMarkers,
  hasAdminSurfaceMarkers,
  hasServerVerifiedAuth,
  isVerifiedOperatorContext,
  operatorNameFrom,
  sanitizeOperatorReply,
  projectPrivateOperatorFields,
  stripUnverifiedOperatorClaims,
  projectRuntimeContext,
  buildOperatorContextPatch
};
