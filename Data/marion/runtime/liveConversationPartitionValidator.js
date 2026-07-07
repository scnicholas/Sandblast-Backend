
"use strict";
/**
 * liveConversationPartitionValidator.js
 * Phase 3 — Live Conversation Stability / Memory Partition Validation.
 *
 * Purpose:
 * - Keep public Nyx visitor memory anonymous and public-only.
 * - Keep private Marion/operator memory authenticated and operator-only.
 * - Prevent Mac/operator identity, Marion/private route markers, admin state,
 *   and runtime diagnostics from crossing into the public surface.
 * - Preserve warm Nyx public language while allowing verified Marion sessions
 *   to address Mac privately.
 */
const VERSION = "nyx.marion.phase3.liveConversationPartition/1.0";
let publicLock = null;
let privateLock = null;
let identityRefinement = null;
try { publicLock = require("./publicSurfaceIdentityLock.js"); } catch (_err) { publicLock = null; }
try { privateLock = require("./privateOperatorBoundaryLock.js"); } catch (_err) { privateLock = null; }
try { identityRefinement = require("./publicIdentityQuestionRefinement.js"); } catch (_err) { identityRefinement = null; }

const REPLY_KEYS = new Set([
  "reply", "text", "answer", "response", "message", "output", "spokenText", "speechText",
  "displayReply", "publicReply", "visibleReply", "finalReply", "authoritativeReply",
  "adminReply", "marionReply", "privateReply"
]);
const PRIVATE_KEY_RE = /(?:operatorName|authenticatedOperator|operatorAuthenticated|operatorPersonalization|allowPersonalName|privateAdmin|privateMemory|privateContext|privateOperator|marionAdmin|marionAdminConversation|adminConversationAllowed|serverSideAdminAuth|trustedServerAuth|ownerVerified|sessionVerified|adminVerified|adminVoiceVerified|adminVoiceDeliveryAllowed|adminVoiceRuntimeApproval|macSpecific|operatorMemory|guardianMemory|marionMemory)/i;
const PUBLIC_KEY_RE = /(?:publicSurfaceOnly|publicIdentityLock|publicLoopFallbackSurfacePurge|publicUsersMayAddressMarion|publicUsersCanAddressMarion|publicUsersSpeakThrough)/i;
const PUBLIC_SOURCE_RE = /(?:sandblast_channel_widget|nyx-widget|cosmos-widget|public_interface|webflow|sandblast\.channel)/i;
const ADMIN_ROUTE_RE = /(?:\/api\/marion\/admin\/conversation|\/marion\/admin\/conversation)/i;
const INTERNAL_LEAK_RE = /\b(?:state spine|session patch|reply authority|final envelope|runtimeTelemetry|finalRenderTelemetry|diagnostic packet|greeting lane|testing the greeting lane|loop detected|fallback|operator personalization|admin route|private operator|serverSideAdminAuth|trustedServerAuth)\b/i;

function isObj(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function safeObj(value) { return isObj(value) ? value : {}; }
function safeStr(value) { return value == null ? "" : String(value).replace(/\s+/g, " ").trim(); }
function lower(value) { return safeStr(value).toLowerCase(); }
function headerValue(headers, key) {
  const h = safeObj(headers);
  return safeStr(h[key] || h[key.toLowerCase()] || h[key.toUpperCase()] || "");
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
  const auth = safeObj(src.auth || src.authorization || body.auth || payload.auth || meta.auth);
  const headers = safeObj(src.headers || body.headers || req.headers);
  const route = firstText(src.route, body.route, payload.route, req.path, req.originalUrl, req.url, headerValue(headers, "x-sb-route"));
  const source = firstText(src.source, body.source, payload.source, src.inputChannel, body.inputChannel, payload.inputChannel, meta.source, headerValue(headers, "x-sb-source"));
  const audience = firstText(src.audience, body.audience, payload.audience, ui.audience, meta.audience, headerValue(headers, "x-sb-audience"));
  const surfaceAgent = firstText(src.surfaceAgent, body.surfaceAgent, payload.surfaceAgent, ui.surfaceAgent, meta.surfaceAgent, payload.publicAgent, headerValue(headers, "x-sb-public-surface"));
  const site = firstText(client.site, safeObj(body.client).site, safeObj(payload.client).site);
  const sessionId = firstText(src.sessionId, body.sessionId, payload.sessionId, meta.sessionId, headerValue(headers, "x-sb-session-id"), headerValue(headers, "x-nyx-session-id"));
  const turnId = firstText(src.turnId, body.turnId, payload.turnId, meta.turnId, headerValue(headers, "x-sb-turn-id"));
  return { src, req, body, payload, meta, ui, client, auth, headers, route, source, audience, surfaceAgent, site, sessionId, turnId };
}
function isVerifiedOperatorContext(input) {
  try { return !!(privateLock && privateLock.isVerifiedOperatorContext && privateLock.isVerifiedOperatorContext(input)); } catch (_err) { return false; }
}
function isPublicContext(input) {
  try { if (publicLock && publicLock.isPublicSurfaceContext && publicLock.isPublicSurfaceContext(input)) return true; } catch (_err) {}
  const c = collectContext(input);
  if (isVerifiedOperatorContext(input)) return false;
  return c.src.publicSurfaceOnly === true || c.body.publicSurfaceOnly === true || c.payload.publicSurfaceOnly === true ||
    c.src.publicIdentityLock === true || c.body.publicIdentityLock === true || c.payload.publicIdentityLock === true ||
    lower(c.audience) === "public" || lower(c.surfaceAgent) === "nyx" || PUBLIC_SOURCE_RE.test(c.source) || PUBLIC_SOURCE_RE.test(c.site) ||
    !!headerValue(c.headers, "x-nyx-client-version");
}
function partitionKind(input) {
  if (isVerifiedOperatorContext(input)) return "operator";
  return "public";
}
function sessionPartitionKey(input) {
  const c = collectContext(input);
  const kind = partitionKind(input);
  const id = safeStr(c.sessionId || c.turnId || "anonymous").replace(/[^a-zA-Z0-9_.:-]+/g, "_").slice(0, 96) || "anonymous";
  return `${kind}:${id}`;
}
function hasReplyKey(value) {
  if (!isObj(value)) return false;
  return Object.keys(value).some((k) => REPLY_KEYS.has(k));
}
function identityPromptFromContext(context) {
  if (identityRefinement && identityRefinement.extractPrompt) {
    try { return identityRefinement.extractPrompt(context); } catch (_err) {}
  }
  const c = collectContext(context || {});
  return firstText(c.src.prompt, c.src.message, c.src.text, c.src.query, c.body.prompt, c.body.message, c.body.text, c.body.query, c.payload.prompt, c.payload.message, c.payload.text, c.payload.query);
}
function sanitizePublicText(text, context) {
  const prompt = identityPromptFromContext(context || {});
  if (identityRefinement && identityRefinement.isPublicIdentityQuestionPrompt && identityRefinement.isPublicIdentityQuestionPrompt(prompt)) {
    return identityRefinement.cleanPublicIdentityReply(prompt);
  }
  let out = safeStr(text);
  if (!out) return out;
  if (publicLock && publicLock.sanitizePublicReply) {
    try { out = publicLock.sanitizePublicReply(out, prompt); } catch (_err) {}
  }
  if (identityRefinement && identityRefinement.resolvePublicReply) {
    try { out = identityRefinement.resolvePublicReply(prompt, out); } catch (_err) {}
  }
  out = out
    .replace(/Mac/g, "")
    .replace(/Marion/g, "Nyx")
    .replace(/operator\s+session/gi, "session")
    .replace(/private\s+(?:admin|operator)/gi, "private")
    .replace(/serverSideAdminAuth/g, "")
    .replace(/trustedServerAuth/g, "")
    .replace(/\s+/g, " ").trim();
  if (!out || INTERNAL_LEAK_RE.test(out)) {
    return publicLock && publicLock.cleanPublicPresenceReply ? publicLock.cleanPublicPresenceReply() : "I’m here. You can ask about Sandblast, radio, TV, media, AI, or business tools.";
  }
  return out;
}
function sanitizeOperatorText(text, context) {
  if (privateLock && privateLock.sanitizeOperatorReply) {
    try { return privateLock.sanitizeOperatorReply(text, context); } catch (_err) {}
  }
  return safeStr(text) || "I'm with you, Mac. What would you like to work on next?";
}
function stripPublicPrivateLeaks(value, context, depth) {
  const d = Number(depth || 0);
  if (d > 8) return value;
  const kind = partitionKind(context || value);
  if (typeof value === "string") return kind === "operator" ? sanitizeOperatorText(value, context) : sanitizePublicText(value, context);
  if (Array.isArray(value)) return value.map((item) => stripPublicPrivateLeaks(item, context, d + 1));
  if (!isObj(value)) return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (kind === "public" && /(?:fallback|loop|diagnostic|telemetry|finalEnvelope|replyAuthority|sessionPatch|stateSpine|greetingLane)/i.test(key)) continue;
    if (kind === "public" && PRIVATE_KEY_RE.test(key)) {
      if (/^(?:operatorPersonalization|allowPersonalName|authenticatedOperator|operatorAuthenticated|adminConversationAllowed|privateAdminConversation|marionAdminConversation)$/i.test(key)) out[key] = false;
      continue;
    }
    if (kind === "operator" && PUBLIC_KEY_RE.test(key)) {
      if (/^publicSurfaceOnly$/i.test(key)) out[key] = false;
      else if (/^publicUsers(?:May|Can)AddressMarion$/i.test(key)) out[key] = false;
      else if (/^publicUsersSpeakThrough$/i.test(key)) out[key] = "Nyx";
      else out[key] = child;
      continue;
    }
    if (REPLY_KEYS.has(key)) {
      out[key] = kind === "operator" ? sanitizeOperatorText(child, context) : sanitizePublicText(child, context || value);
      continue;
    }
    out[key] = stripPublicPrivateLeaks(child, context, d + 1);
  }
  out.liveConversationPartitionValidation = true;
  out.memoryPartitionValidation = true;
  out.partitionKind = kind;
  out.sessionPartitionKey = sessionPartitionKey(context || value);
  if (kind === "public") {
    out.publicSurfaceOnly = true;
    out.audience = "public";
    out.surfaceAgent = "nyx";
    out.publicAgent = "Nyx";
    out.userFacingAgent = "Nyx";
    out.operatorPersonalization = false;
    out.allowPersonalName = false;
    out.authenticatedOperator = false;
    out.publicUsersCanAddressMarion = false;
    out.revealBackendAgent = false;
  } else {
    out.publicSurfaceOnly = false;
    out.audience = "operator";
    out.surfaceAgent = "marion";
    out.publicAgent = "Marion";
    out.userFacingAgent = "Marion";
    out.authenticatedOperator = true;
    out.operatorPersonalization = true;
    out.allowPersonalName = true;
    out.operatorName = (privateLock && privateLock.operatorNameFrom) ? privateLock.operatorNameFrom(context || value) : "Mac";
  }
  out.meta = Object.assign({}, safeObj(out.meta), {
    version: VERSION,
    liveConversationPartitionValidation: true,
    memoryPartitionValidation: true,
    partitionKind: out.partitionKind,
    sessionPartitionKey: out.sessionPartitionKey,
    publicSurfaceOnly: out.publicSurfaceOnly,
    surfaceAgent: out.surfaceAgent,
    audience: out.audience,
    diagnosticsRedacted: true
  });
  return out;
}
function projectPacket(value, context) {
  const kind = partitionKind(context || value);
  if (kind === "public") {
    if (typeof value === "string") return sanitizePublicText(value, context || value);
    if (isObj(value) && hasReplyKey(value) && publicLock && publicLock.projectPublicPayload) {
      try { return stripPublicPrivateLeaks(publicLock.projectPublicPayload(value, context || value), context || value); } catch (_err) {}
    }
    return stripPublicPrivateLeaks(value, context || value);
  }
  if (typeof value === "string") return sanitizeOperatorText(value, context || value);
  if (isObj(value) && privateLock && privateLock.projectPrivateOperatorFields) {
    try { return stripPublicPrivateLeaks(privateLock.projectPrivateOperatorFields(value, context || value), context || value); } catch (_err) {}
  }
  return stripPublicPrivateLeaks(value, context || value);
}
function projectResult(value, context) { return projectPacket(value, context); }
function buildPartitionPatch(input) {
  const kind = partitionKind(input);
  return {
    version: VERSION,
    liveConversationPartitionValidation: true,
    memoryPartitionValidation: true,
    partitionKind: kind,
    sessionPartitionKey: sessionPartitionKey(input),
    publicSurfaceOnly: kind === "public",
    audience: kind === "operator" ? "operator" : "public",
    surfaceAgent: kind === "operator" ? "marion" : "nyx",
    operatorPersonalization: kind === "operator",
    allowPersonalName: kind === "operator",
    authenticatedOperator: kind === "operator",
    publicUsersCanAddressMarion: false,
    noCrossSessionMemoryCarry: true,
    noPublicPrivateMemoryBleed: true,
    noUserFacingDiagnostics: true
  };
}
function validateNoCrossPartitionLeak(value, context) {
  const projected = projectPacket(value, context);
  const text = JSON.stringify(projected);
  const kind = partitionKind(context || value);
  return {
    ok: kind === "operator" ? !/publicUsersCanAddressMarion\s*[:=]\s*true/i.test(text) : !/("operatorName"\s*:\s*"Mac"|"authenticatedOperator"\s*:\s*true|"operatorPersonalization"\s*:\s*true|Marion is connected behind the response path|greeting lane|session patch|reply authority)/i.test(text),
    version: VERSION,
    partitionKind: kind,
    sessionPartitionKey: sessionPartitionKey(context || value),
    projected
  };
}
module.exports = {
  VERSION,
  collectContext,
  isVerifiedOperatorContext,
  isPublicContext,
  partitionKind,
  sessionPartitionKey,
  sanitizePublicText,
  sanitizeOperatorText,
  stripPublicPrivateLeaks,
  projectPacket,
  projectResult,
  buildPartitionPatch,
  validateNoCrossPartitionLeak
};


/* PHASE3D_VOICE_TEXT_PARITY_IDENTITY_DRIFT_HARDLOCK_START */
(function(){try{
  const V="nyx.marion.phase3d.voiceTextParityIdentityDrift.runtimeWrapper/1.0";
  let lock=null;try{lock=require("./voiceTextParityIdentityDriftHardlock.js");}catch(_e){try{lock=require("../Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js");}catch(_e2){lock=null;}}
  if(!lock||!lock.projectResult||typeof module==="undefined"||!module.exports)return;
  function ctx(value,args){args=Array.prototype.slice.call(args||[]);return Object.assign({},(args[0]&&typeof args[0]==="object"?args[0]:{}),{payload:value,body:args[0],options:args[1],headers:(args[0]&&args[0].headers)||(args[1]&&args[1].headers)||{},route:(args[0]&&args[0].route)||(args[0]&&args[0].path)||""});}
  function project(value,args){try{return lock.projectResult(value,ctx(value,args));}catch(_e){return value;}}
  function wrap(fn,name){if(typeof fn!=="function"||fn.__phase3dVoiceTextParity)return fn;const w=function(){const args=arguments;const r=fn.apply(this,args);if(r&&typeof r.then==="function")return r.then(v=>project(v,args));return project(r,args);};try{Object.keys(fn).forEach(k=>{w[k]=fn[k];});}catch(_e){}try{Object.defineProperty(w,"name",{value:fn.name||name||"phase3dVoiceTextParityWrapped"});}catch(_e){}w.__phase3dVoiceTextParity=true;return w;}
  if(typeof module.exports==="function")module.exports=wrap(module.exports,"default");
  const obj=module.exports&&typeof module.exports==="object"?module.exports:null;
  if(obj){["processWithMarion","route","maybeResolve","ask","handle","handleMessage","handleVoiceTranscript","handleVoiceInput","default","composeMarionResponse","compose","buildReply","run","handler","createMarionFinalEnvelope","finalize","buildFinalEnvelope","toFinalEnvelope","normalizeFinalEnvelope","handleMarionAdminConversation","handleMarionAdminTextRuntime","invokeMarionAdminTextRuntime","handleTextRuntime","handleAdminConversation","safeResponse","buildResponse","createResponse","finalizeTurn"].forEach(n=>{if(typeof obj[n]==="function")obj[n]=wrap(obj[n],n);});obj.PHASE3D_VOICE_TEXT_PARITY_IDENTITY_DRIFT_HARDLOCK_VERSION=V;obj.phase3dVoiceTextParityProject=lock.projectResult;obj.phase3dVoiceTextParityCompare=lock.compareVoiceTextParity;}
}catch(_){}})();
/* PHASE3D_VOICE_TEXT_PARITY_IDENTITY_DRIFT_HARDLOCK_END */

/* PHASE3D_LIVE_PARTITION_VOICE_TEXT_SESSION_KEY_LOCK_START */
(function(){try{
  const V="nyx.marion.phase3d.livePartitionVoiceTextSessionKey/1.0";
  let lock=null;try{lock=require("./voiceTextParityIdentityDriftHardlock.js");}catch(_){lock=null;}
  if(!lock||!lock.classifyTurn||typeof module==="undefined"||!module.exports)return;
  const origKind=module.exports.partitionKind;
  const origKey=module.exports.sessionPartitionKey;
  module.exports.partitionKind=function(input){try{return lock.classifyTurn(input).scope;}catch(_){return typeof origKind==="function"?origKind(input):"public";}};
  module.exports.sessionPartitionKey=function(input){try{return lock.classifyTurn(input).partitionKey;}catch(_){return typeof origKey==="function"?origKey(input):"public:anonymous";}};
  module.exports.PHASE3D_LIVE_PARTITION_VOICE_TEXT_SESSION_KEY_LOCK_VERSION=V;
}catch(_){}})();
/* PHASE3D_LIVE_PARTITION_VOICE_TEXT_SESSION_KEY_LOCK_END */
