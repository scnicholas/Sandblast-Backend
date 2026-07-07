"use strict";

/**
 * MarionVoiceIntentClasses.js
 * Phase 3 voice-intent class module.
 *
 * Purpose:
 * - Replace the minimal Phase 3 compatibility shim with a real voice-intent
 *   classifier that understands public Nyx versus private Marion/operator voice.
 * - Keep Marion voice authority admin-only unless a verified operator/admin
 *   context is already present.
 * - Preserve privacy-minimal handling: no raw audio storage, bounded transcript
 *   text, transcript hashes for telemetry, and explicit partition scope.
 * - Export cleanText for compatibility with MarionAdminVoiceIdentityGate.js.
 */

const crypto = require("crypto");
let identityRefinement = null;
try { identityRefinement = require("./publicIdentityQuestionRefinement.js"); } catch (_err) { identityRefinement = null; }

const VERSION = "nyx.marion.voiceIntentClasses/3.1-phase3c-public-identity-question-refinement";
const PUBLIC_AGENT = "Nyx";
const PRIVATE_AGENT = "Marion";
const OPERATOR_NAME = "Mac";
const MAX_TRANSCRIPT = 1600;
const MAX_REASON = 240;

const VOICE_INTENT_CLASS = Object.freeze({
  PUBLIC_PRESENCE_CHECK: "public_presence_check",
  PUBLIC_IDENTITY_QUERY: "public_identity_query",
  PUBLIC_DISCOVERY: "public_discovery",
  PUBLIC_MEDIA_QUERY: "public_media_query",
  PUBLIC_BUSINESS_QUERY: "public_business_query",
  PUBLIC_SUPPORT_QUERY: "public_support_query",
  OPERATOR_STATUS_CHECK: "operator_status_check",
  OPERATOR_BUILD_COMMAND: "operator_build_command",
  OPERATOR_MEMORY_QUERY: "operator_memory_query",
  OPERATOR_DIAGNOSTIC: "operator_diagnostic",
  OPERATOR_PRIVATE_DIALOGUE: "operator_private_dialogue",
  VOICE_CONTROL: "voice_control",
  UNKNOWN: "unknown"
});

const PUBLIC_SOURCE_RE = /(?:sandblast_channel_widget|cosmos-widget|nyx-widget|public_interface|webflow|sandblast\.channel)/i;
const ADMIN_SOURCE_RE = /(?:marion_admin_conversation|admin_text|admin_voice|admin|marion-admin-interface|protected admin route)/i;
const ADMIN_ROUTE_RE = /(?:\/api\/marion\/admin\/conversation|\/api\/marion\/admin\/voice|\/marion\/admin\/conversation|\/marion\/admin\/voice)/i;

const PUBLIC_PRESENCE_PROMPT_RE = /^(?:hi\s+nyx\s*)?(?:are\s+you\s+(?:with\s+me|there|here|online|working|ready)|can\s+you\s+(?:hear\s+me|see\s+this|respond)|do\s+you\s+hear\s+me|you\s+there|still\s+there|hello\??|hi\??|hey\??)\??$/i;
const PUBLIC_IDENTITY_PROMPT_RE = /\b(?:who\s+am\s+i\s+talking\s+to|who\s+are\s+you|what\s+are\s+you|is\s+marion\s+connected|am\s+i\s+talking\s+to\s+marion|are\s+you\s+marion|are\s+you\s+mac|do\s+you\s+know\s+(?:mac|sean|the\s+operator)|are\s+you\s+talking\s+to\s+(?:mac|sean|the\s+operator)|who\s+is\s+(?:mac|sean|the\s+operator)|i\s+am\s+(?:mac|sean|the\s+operator)|this\s+is\s+(?:mac|sean|the\s+operator))\b/i;
const MEDIA_RE = /\b(?:radio|sandblast\s+radio|tv|sandblast\s+tv|watch|roku|movie|music|playlist|live|listen|stream|news|synapse)\b/i;
const BUSINESS_RE = /\b(?:business|retail|buyer|persona|sales|customer|marketing|advertising|conversion|revenue|brand|licensing|commercial|strategy)\b/i;
const SUPPORT_RE = /\b(?:help|support|guide|show\s+me|explain|how\s+do\s+i|what\s+is\s+this|what\s+can\s+you\s+do)\b/i;
const OPERATOR_BUILD_RE = /\b(?:phase\s*\d+|patch|package|zip|deploy|render|regression|test|runtime|backend|frontend|html|widget|lock|hardlock|gap\s+refinement|autopsy|surgical)\b/i;
const OPERATOR_MEMORY_RE = /\b(?:remember|memory|what\s+did\s+we|where\s+are\s+we|summarize\s+where\s+we|our\s+next\s+step|operator\s+context)\b/i;
const OPERATOR_DIAGNOSTIC_RE = /\b(?:diagnostic|log|error|referenceerror|typeerror|syntaxerror|loop|fallback|leak|contamination|partition|session|state\s+spine|final\s+envelope|reply\s+authority)\b/i;
const VOICE_CONTROL_RE = /\b(?:mute|unmute|volume|speak|voice|transcript|audio|mic|microphone|stop\s+speaking|start\s+speaking)\b/i;

function cleanText(value) {
  return value == null ? "" : String(value).replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function isObj(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeObj(value) {
  return isObj(value) ? value : {};
}

function boolish(value) {
  if (value === true) return true;
  if (typeof value === "string") return /^(?:1|true|yes|on|verified|allowed|operator|admin)$/i.test(value.trim());
  return false;
}

function clipText(value, max = MAX_TRANSCRIPT) {
  const text = cleanText(value);
  const limit = Math.max(32, Math.min(Number(max) || MAX_TRANSCRIPT, MAX_TRANSCRIPT));
  return text.length > limit ? text.slice(0, limit) : text;
}

function hashText(value) {
  const text = cleanText(value).toLowerCase();
  if (!text) return "";
  return crypto.createHash("sha256").update(text).digest("hex");
}

function headerValue(headers, key) {
  const h = safeObj(headers);
  return cleanText(h[key] || h[key.toLowerCase()] || h[key.toUpperCase()] || "");
}

function normalizeSpeaker(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeVoiceTranscript(value) {
  return clipText(value)
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\b(?:nick|nicks|nix|mix|mike)\b/gi, "Nyx")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeaders(input = {}, options = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const payload = safeObj(src.payload || body.payload);
  return Object.assign({}, safeObj(src.headers), safeObj(body.headers), safeObj(payload.headers), safeObj(options.headers));
}

function extractRoute(input = {}, options = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  return cleanText(options.route || src.route || src.path || body.route || body.path || "");
}

function extractVoiceText(input = {}) {
  if (typeof input === "string") return normalizeVoiceTranscript(input);
  const src = safeObj(input);
  const body = safeObj(src.body);
  const payload = safeObj(src.payload || body.payload);
  const turn = safeObj(src.turn || body.turn || payload.turn);
  return normalizeVoiceTranscript(
    src.transcript || src.voiceTranscript || src.spokenText || src.speechText || src.text || src.message || src.query ||
    body.transcript || body.voiceTranscript || body.spokenText || body.speechText || body.text || body.message || body.query ||
    payload.transcript || payload.voiceTranscript || payload.spokenText || payload.speechText || payload.text || payload.message || payload.query ||
    turn.transcript || turn.voiceTranscript || turn.spokenText || turn.speechText || turn.text || turn.message || ""
  );
}

function extractSourceFields(input = {}, options = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const payload = safeObj(src.payload || body.payload);
  const ui = safeObj(src.ui || body.ui || payload.ui);
  const client = safeObj(src.client || body.client || payload.client);
  const headers = extractHeaders(input, options);
  const route = extractRoute(input, options);
  return {
    headers,
    route,
    source: lower(options.source || src.source || body.source || payload.source || headerValue(headers, "x-sb-source")),
    audience: lower(options.audience || src.audience || body.audience || payload.audience || ui.audience || headerValue(headers, "x-sb-audience")),
    surfaceAgent: lower(options.surfaceAgent || src.surfaceAgent || body.surfaceAgent || payload.surfaceAgent || ui.surfaceAgent || headerValue(headers, "x-sb-public-surface")),
    site: lower(options.site || client.site || safeObj(payload.client).site || headerValue(headers, "x-sb-site")),
    inputSource: lower(options.inputSource || src.inputSource || body.inputSource || payload.inputSource || headerValue(headers, "x-sb-input-source")),
    sessionId: cleanText(options.sessionId || src.sessionId || body.sessionId || payload.sessionId || headerValue(headers, "x-sb-session-id")),
    turnId: cleanText(options.turnId || src.turnId || body.turnId || payload.turnId || headerValue(headers, "x-sb-turn-id")),
    traceId: cleanText(options.traceId || src.traceId || src.requestId || body.traceId || payload.traceId || headerValue(headers, "x-sb-trace-id"))
  };
}

function hasVerifiedOperatorSignal(input = {}, options = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const payload = safeObj(src.payload || body.payload);
  const auth = safeObj(options.auth || src.auth || body.auth || payload.auth);
  const headers = extractHeaders(input, options);
  const route = extractRoute(input, options);
  return boolish(options.serverSideAdminAuth) ||
    boolish(options.adminVerified) ||
    boolish(options.operatorVerified) ||
    boolish(src.serverSideAdminAuth) ||
    boolish(src.adminVerified) ||
    boolish(src.operatorVerified) ||
    boolish(src.sessionVerified) ||
    boolish(src.trustedServerAuth) ||
    boolish(body.serverSideAdminAuth) ||
    boolish(body.adminVerified) ||
    boolish(body.operatorVerified) ||
    boolish(payload.serverSideAdminAuth) ||
    boolish(payload.adminVerified) ||
    boolish(payload.operatorVerified) ||
    boolish(auth.serverSideAdminAuth) ||
    boolish(auth.adminVerified) ||
    boolish(auth.operatorVerified) ||
    boolish(auth.ownerVerified) ||
    boolish(headerValue(headers, "x-sb-marion-admin-verified")) ||
    boolish(headerValue(headers, "x-sb-operator-verified")) ||
    ADMIN_ROUTE_RE.test(route);
}

function isPublicVoiceContext(input = {}, options = {}) {
  const f = extractSourceFields(input, options);
  if (hasVerifiedOperatorSignal(input, options)) return false;
  return f.audience === "public" ||
    f.surfaceAgent === "nyx" ||
    f.source === "nyx-widget" ||
    PUBLIC_SOURCE_RE.test(f.source) ||
    PUBLIC_SOURCE_RE.test(f.site) ||
    PUBLIC_SOURCE_RE.test(f.route) ||
    boolish(safeObj(input).publicSurfaceOnly) ||
    boolish(safeObj(safeObj(input).body).publicSurfaceOnly) ||
    !!headerValue(f.headers, "x-nyx-client-version");
}

function isOperatorVoiceContext(input = {}, options = {}) {
  const f = extractSourceFields(input, options);
  return hasVerifiedOperatorSignal(input, options) && (
    f.audience === "operator" ||
    f.surfaceAgent === "marion" ||
    ADMIN_SOURCE_RE.test(f.source) ||
    ADMIN_ROUTE_RE.test(f.route) ||
    boolish(options.operatorPersonalization) ||
    boolish(safeObj(input).operatorPersonalization)
  );
}

function classifyOperatorIntent(text) {
  if (OPERATOR_DIAGNOSTIC_RE.test(text)) return VOICE_INTENT_CLASS.OPERATOR_DIAGNOSTIC;
  if (OPERATOR_BUILD_RE.test(text)) return VOICE_INTENT_CLASS.OPERATOR_BUILD_COMMAND;
  if (OPERATOR_MEMORY_RE.test(text)) return VOICE_INTENT_CLASS.OPERATOR_MEMORY_QUERY;
  if (/\b(?:marion|vera|are\s+you\s+speaking\s+to\s+me|do\s+you\s+recognize\s+me|it's\s+mac|this\s+is\s+mac)\b/i.test(text)) return VOICE_INTENT_CLASS.OPERATOR_PRIVATE_DIALOGUE;
  if (VOICE_CONTROL_RE.test(text)) return VOICE_INTENT_CLASS.VOICE_CONTROL;
  return VOICE_INTENT_CLASS.OPERATOR_PRIVATE_DIALOGUE;
}

function classifyPublicIntent(text) {
  if (PUBLIC_PRESENCE_PROMPT_RE.test(text)) return VOICE_INTENT_CLASS.PUBLIC_PRESENCE_CHECK;
  if (PUBLIC_IDENTITY_PROMPT_RE.test(text)) return VOICE_INTENT_CLASS.PUBLIC_IDENTITY_QUERY;
  if (MEDIA_RE.test(text)) return VOICE_INTENT_CLASS.PUBLIC_MEDIA_QUERY;
  if (BUSINESS_RE.test(text)) return VOICE_INTENT_CLASS.PUBLIC_BUSINESS_QUERY;
  if (SUPPORT_RE.test(text)) return VOICE_INTENT_CLASS.PUBLIC_SUPPORT_QUERY;
  if (VOICE_CONTROL_RE.test(text)) return VOICE_INTENT_CLASS.VOICE_CONTROL;
  return VOICE_INTENT_CLASS.PUBLIC_DISCOVERY;
}

function buildPartitionKey(scope, sessionId) {
  const id = cleanText(sessionId) || "anonymous";
  return `${scope}:${id}`;
}

function classifyVoiceIntent(input = {}, options = {}) {
  const transcript = extractVoiceText(input);
  const f = extractSourceFields(input, options);
  const publicContext = isPublicVoiceContext(input, options);
  const operatorContext = isOperatorVoiceContext(input, options);
  const requestedOperator = /\b(?:marion|mac|operator|admin|private)\b/i.test(transcript) ||
    boolish(safeObj(input).operatorPersonalization) ||
    boolish(safeObj(safeObj(input).body).operatorPersonalization);

  let scope = "public";
  let surfaceAgent = PUBLIC_AGENT;
  let audience = "public";
  let intentClass = classifyPublicIntent(transcript);
  let allowOperatorMemory = false;
  let allowPersonalName = false;
  let operatorPersonalization = false;
  let blockedOperatorClaim = false;
  let reason = "PUBLIC_VOICE_CONTEXT";

  if (operatorContext) {
    scope = "operator";
    surfaceAgent = PRIVATE_AGENT;
    audience = "operator";
    intentClass = classifyOperatorIntent(transcript);
    allowOperatorMemory = true;
    allowPersonalName = true;
    operatorPersonalization = true;
    reason = "VERIFIED_OPERATOR_VOICE_CONTEXT";
  } else if (requestedOperator || publicContext) {
    blockedOperatorClaim = requestedOperator && !operatorContext;
    scope = "public";
    surfaceAgent = PUBLIC_AGENT;
    audience = "public";
    intentClass = classifyPublicIntent(transcript);
    reason = blockedOperatorClaim ? "PUBLIC_CONTEXT_OPERATOR_CLAIM_BLOCKED" : "PUBLIC_VOICE_CONTEXT";
  } else if (!transcript) {
    intentClass = VOICE_INTENT_CLASS.UNKNOWN;
    reason = "EMPTY_TRANSCRIPT";
  }

  const partitionKey = buildPartitionKey(scope, f.sessionId);
  const cleanTranscript = clipText(transcript);
  const transcriptHash = hashText(cleanTranscript);

  return {
    ok: true,
    version: VERSION,
    intentClass,
    transcript: cleanTranscript,
    normalizedText: cleanTranscript,
    transcriptHash,
    rawTranscriptStored: false,
    noRawAudioStored: true,
    noRawTranscriptStored: true,
    privacyMode: "bounded_hash_only",
    scope,
    audience,
    surfaceAgent,
    publicSurfaceOnly: scope === "public",
    operatorSurfaceOnly: scope === "operator",
    allowOperatorMemory,
    allowPersonalName,
    operatorPersonalization,
    blockedOperatorClaim,
    partitionKey,
    partitionScope: scope,
    memoryPartition: partitionKey,
    sessionId: f.sessionId,
    turnId: f.turnId,
    traceId: f.traceId,
    voiceInput: true,
    source: f.source || (scope === "operator" ? "marion_admin_voice" : "nyx_public_voice"),
    route: f.route,
    reason: clipText(reason, MAX_REASON),
    publicIdentityQuestionRefinement: scope === "public" && intentClass === VOICE_INTENT_CLASS.PUBLIC_IDENTITY_QUERY,
    suggestedPublicReply: scope === "public" && intentClass === VOICE_INTENT_CLASS.PUBLIC_IDENTITY_QUERY && identityRefinement && identityRefinement.cleanPublicIdentityReply ? identityRefinement.cleanPublicIdentityReply(cleanTranscript) : ""
  };
}

function evaluateVoiceIntentClass(input = {}, options = {}) {
  return classifyVoiceIntent(input, options);
}

function sanitizeVoiceIntentForPublic(intent = {}) {
  const src = safeObj(intent);
  const out = Object.assign({}, src);
  out.scope = "public";
  out.audience = "public";
  out.surfaceAgent = PUBLIC_AGENT;
  out.publicSurfaceOnly = true;
  out.operatorSurfaceOnly = false;
  out.allowOperatorMemory = false;
  out.allowPersonalName = false;
  out.operatorPersonalization = false;
  out.blockedOperatorClaim = true;
  out.partitionScope = "public";
  out.partitionKey = buildPartitionKey("public", src.sessionId);
  out.memoryPartition = out.partitionKey;
  if (/operator|diagnostic|memory|private/i.test(cleanText(out.intentClass))) {
    out.intentClass = classifyPublicIntent(src.normalizedText || src.transcript || "");
  }
  out.reason = "PUBLIC_SANITIZED_VOICE_INTENT";
  return out;
}

function buildVoiceIntentEnvelope(input = {}, options = {}) {
  const result = classifyVoiceIntent(input, options);
  return {
    ok: true,
    version: VERSION,
    contract: "nyx.marion.voiceIntentEnvelope/1.0",
    voiceIntent: result,
    meta: {
      voiceInput: true,
      scope: result.scope,
      audience: result.audience,
      surfaceAgent: result.surfaceAgent,
      partitionKey: result.partitionKey,
      noRawAudioStored: true,
      noRawTranscriptStored: true,
      transcriptHash: result.transcriptHash
    },
    sessionPatch: {
      voiceIntentClass: result.intentClass,
      voicePartitionScope: result.scope,
      memoryPartition: result.memoryPartition,
      lastVoiceTranscriptHash: result.transcriptHash,
      publicSurfaceOnly: result.publicSurfaceOnly,
      operatorPersonalization: result.operatorPersonalization
    }
  };
}

module.exports = {
  VERSION,
  PUBLIC_AGENT,
  PRIVATE_AGENT,
  OPERATOR_NAME,
  VOICE_INTENT_CLASS,
  cleanText,
  lower,
  clipText,
  hashText,
  normalizeSpeaker,
  normalizeVoiceTranscript,
  extractVoiceText,
  isPublicVoiceContext,
  isOperatorVoiceContext,
  classifyVoiceIntent,
  evaluateVoiceIntentClass,
  sanitizeVoiceIntentForPublic,
  buildVoiceIntentEnvelope,
  buildPartitionKey
};
