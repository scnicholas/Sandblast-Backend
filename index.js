"use strict";

/**
 * Sandblast Backend — index.js
 *
 * index.js v2.18.5sb CHAT-LOOP-PHRASE-HARDLOCK-AUTHORITY-COHESION
 * ------------------------------------------------------------
 * PURPOSE
 * - Tightened backend shell
 * - Removes duplicate replay authority from index layer
 * - Keeps Chat Engine as the semantic turn authority
 * - Uses TTS as the single synthesis authority
 * - Preserves frontend voice route contract without provider-side dispatch authority
 * - Keeps fail-open rendering contract
 * - Hardens TTS route error handling and response finalization
 * - Adds affect/stabilize/fail-safe unification
 * - Adds loop suppression / stale-UI wipe discipline
 * - Adds TTS response normalization so playable audio always streams when available
 * - Strengthens News Canada file mount / hydration into app.locals
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let compression = null;
try {
  compression = require("compression");
} catch (_) {
  compression = null;
}

const INDEX_VERSION = "index.js v2.18.41sb INDEX-CONFLICT-MARKER-PURGE-RENDER-HARDLOCK + NYX-VOICE-DEPLOYMENT-PARITY-README-V13 + NYX-VOICE-GET-HEALTH-ALIAS-V13 + NYX-VOICE-ECHO-SUPPRESSION-HARDLOCK-V13 + NYX-VOICE-TRANSCRIPT-ROUTE + INDEX-FINAL-PROMOTION-REASSERTION-HARDLOCK + LONGTURN-CONTINUITY-RECOVERY-EXPANSION + INDEX-AUTHORITY-SANITIZATION-REPLY-SALVAGE-HARDLOCK + LONGTURN-SHORT-FOLLOWUP-AUTHORITY-RECOVERY + CONTINUITY-INTENT-OVERRIDE-HARDLOCK + CONTINUITY-EFFECTIVE-PROMPT-HANDOFF-HARDLOCK + SHORT-FOLLOWUP-CONTINUITY-HANDOFF-HARDLOCK + TTS-SPOKENTEXT-CONTAMINATION-HARDLOCK + PUBLIC-FINAL-PROJECTION-HARDLOCK + SIX-DOMAIN-MARION-COMPOSER-PROMOTION-HOTFIX + STALE-CACHE-REPLAY-PURGE + BLANK-FINAL-SUPPRESSION + LAST-MILE-PROGRESSION-EMISSION-PURGE + PROGRESSION-SOURCE-KILL-HARDLOCK + PUBLIC-SURFACE-LEAK-HARDLOCK + LOOP-SUPPRESSION-FUTURE-HARDLOCK + NYX-MARION-LOOP-GOVERNOR-CAPACITY-SEPARATION + MARION-LINGOSENTINEL-GATEWAY-LIVE-PATH + DIRECT-TRANSLATION-TARGET-EN-REVERSE-LOCK + DIRECT-TRANSLATION-COMMAND-LOCK + LINGOSENTINEL-MULTILINGUAL-TRIGGER-LOCK + PRIMITIVE-REPLY-SUPPRESSION + LINGOSENTINEL-GREETING-PRECEDENCE-LOCK + PUBLIC-CONTROL-PHRASE-HARDLOCK + FINAL-JSON-PUBLIC-REPLY-HYGIENE-HARDLOCK + NYX-PUBLIC-AGENT-ALIAS-LOCK + LANGUAGESPHERE-FINAL-SURFACE-PASSTHROUGH + LANGUAGESPHERE-PHASE5-API-MIDDLEWARE-INTEGRATION + CLARIFIER-LOOP-HARDLOCK + LANGUAGESPHERE-STALE-CARRY-BYPASS + LANGUAGESPHERE-INDEX-BRIDGE + DOMAIN-RETRIEVER-ACTIVE-PATH-COHESION + INDEX-TELEMETRY-FAILURE-SIGNATURE-AUDIT + OUTER-SCHEDULER-PRE-ROUTER-TECHNICAL-BYPASS + FINAL-RUNTIME-TELEMETRY + DOMAIN-BOOTSTRAP-ISOLATION-DIAGNOSTICS + CHAT-LOOP-PHRASE-HARDLOCK-AUTHORITY-COHESION + MARION-FINAL-ENVELOPE-EXTRACTION-V35 + CONVERSATION-FINALIZATION-GUARD + SUPPORT-HOLD-DEAUTHORITY + TURN-ID-DEDUP + MARION-LIVE-HANDOFF-VERIFY + MARION-AUTHORITY-LOCK + MARION-CONTRACT-HARDENED + MIXER-VOICE-PRESERVE + NEWSCANADA-CACHE-FIRST-CONTRACT + NEWSCANADA-CACHE-PATH-HARDENED + NEWSCANADA-CACHE-DATA-CAPS-COMPAT + NEWSCANADA-WP-REST-PRIMARY + NEWSCANADA-RSS-BACKEND-ONLY + NEWSCANADA-RSS-PARSER-HARDENED + NEWSCANADA-RSS-CANDIDATE-FEEDS + NEWSCANADA-RSS-HTML-FALLBACK + NEWSCANADA-RSS-DIAGNOSTICS-HARDENED + NEWSCANADA-RSS-SERVICE-MODULARIZED + NEWSCANADA-MANUAL-RSS-ROUTE-MOUNT + NEWSCANADA-COMPAT-ALIASES + NEWSCANADA-AUTO-INGEST-SWITCH + ROUTE-DIAGNOSTIC-HINTS + NEWSCANADA-LIVE-TRACE + NEWSCANADA-STRICT-ROUTE-GATE + NEWSCANADA-RSS-TRUTH-ROUTE-BYPASS + NEWSCANADA-EDITORS-TRUTH-FIRST + NEWSCANADA-TIMEOUT-CHAIN-UNWRAPPED + NEWSCANADA-RSS-FIRST-EXECUTION + MUSIC-BRIDGE-STRICT-CONTRACT + OPS-DIAGNOSTIC-HARDENING + SUPPORT-OVERRIDE-CONTRACT + NEWSCANADA-DIRECT-TRUTH-ROUTE-V12 + NEWSCANADA-SERVICE-BYPASS-HARDLOCK + MUSIC-BOOTSTRAP-RESTORED + FEED-COMPAT-HARDENED-V14 + NEWSCANADA-INLINE-DIRECT-ROUTE-V15 + NEWSCANADA-CONTRACT-CACHE-BRIDGE-V16 + NEWSCANADA-TRANSPORT-HARDENING-V17 + MARION-REPLY-FIRST-V18 + CONVERSATION-ORIGIN-BYPASS-V19 + ENGINE-INPUT-REPLY-SURFACING-V20 + MARION-INTENT-PASSTHROUGH-V21 + MARION-DATA-RUNTIME-ROUTER-V22 + CHAT-ROUTE-ALIAS-HARDLOCK-V23 + CHAT-HANDSHAKE-DIAGNOSTICS-V24 + MARION-FINAL-SIGNATURE-COMPAT-V25 + FINAL-ENVELOPE-WRAPPER-COMPAT-V26 + MARION-CALL-BRIDGE-FINALIZE-V27 + LOOP-RECOVERY-ESCAPE-V29 + LOOP-GATE-V30 + TRANSPORT-ONLY-MARION-FINAL-ENVELOPE-V31 + ROGUE-FALLBACK-PURGE-V32 + MARION-BRIDGE-RUNTIME-FIX-V33 + CHAT-POST-502-PURGE-V34 + MARION-EMOTION-RUNTIME-HEALTH-V37 + CHAT-TRANSPORT-FINAL-ENVELOPE-PASSTHROUGH-V38 + FALSE-FINAL-PURGE-V39 + RUNTIME-COHESION-FINAL-AUTHORITY-V40 + CONVERSATION-QUALITY-TRANSPORT-PRESERVE-V41 + PACKET-STATE-BRIDGE-V42 + NYX-DATA-PACKET-PATH-V43 + INDEX-CONFLICT-REPAIR-V44 + PACKET-PRECLASSIFY-BRIDGE-V45 + PACKET-FALLBACK-SAFE-EMIT-V46 + FINAL-AUTHORITY-TRUTH-V47 + PACKET-GREETING-FINAL-SELECTION-GUARD-V48 + PACKET-HANDSHAKE-BYPASS-FOR-SUBSTANTIVE-MARION-TURNS-V49 + FINAL-ENVELOPE-REPLY-PROMOTION-V50 + FINAL-VISIBLE-REPLY-AGREEMENT-V51 + CBCRSS-BACKEND-BRIDGE-V1 + LAST-MILE-PRIMITIVE-REPLY-GUARD-V52 + FINAL-RENDER-TELEMETRY-HARDLOCK + INDEX-LAST-MILE-CONTINUATION-FALLBACK-PURGE + LINGOSENTINEL-GATEWAY-INDEX-PASSTHROUGH + LINGOSENTINEL-SUBSCRIBE-TOKEN-ROUTE-MOUNT + LINGOSENTINEL-WEBFLOW-CORS-HARDLOCK + LINGOSENTINEL-ALERT-SCANNER-INDEX-CARRY + PARALLEL-LANE-PASSTHROUGH + RELEASE-READINESS-ROLLBACK-SAFETY + NEWSCANADA-EDITORS-PICKS-EXPORT-LOADER-FIX + INVALID-PUBLIC-REPLY-LAST-MILE-RECOVERY + DETERMINISTIC-ORIGINAL-PROMPT-RECOVERY + LINGOSENTINEL-CONTROLLED-PRIVATE-ROOM-DIRECT-ABLY-FALLBACK-V2 + LINGOSENTINEL-START-CONTACT-ROUTE-V11-HTTP-EMAIL-API-FIRST-HARDLOCK";
const PUBLIC_INDEX_VERSION = "index.js v2.18.43sb BACKEND-PUBLIC-HEALTH-REDACTION-HARDLOCK";
const SERVER_BOOT_AT = Date.now();
const MARION_RELEASE_READINESS_CONFIG = Object.freeze({
  version: "nyx.marion.releaseReadinessRollbackSafety/1.0",
  releaseReadinessEnabled: process.env.SB_MARION_RELEASE_READINESS !== "false",
  rollbackSafeMode: process.env.SB_MARION_ROLLBACK_SAFE_MODE === "true",
  publicSurfaceGuardRequired: true,
  marionFinalAuthorityRequired: true,
  advisoryMetadataPublicLeakAllowed: false
});

const FINAL_RUNTIME_TELEMETRY_VERSION = "nyx.marion.finalRuntimeTelemetry/1.0";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";
const finalRenderTelemetryMod = (() => { try { return require("./Data/marion/runtime/finalRenderTelemetry.js"); } catch (_) { return null; } })();
const LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION = "nyx.languagesphere.indexBridge/1.0";
const LINGOSENTINEL_GATEWAY_INDEX_VERSION = "nyx.lingosentinel.indexGateway/0.3-link-gateway";
const LINGOSENTINEL_ABLY_READINESS_VERSION = "nyx.lingosentinel.ablyReadiness/1.0";
const LINGOSENTINEL_ABLY_SANDBOX_PUBLISH_VERSION = "nyx.lingosentinel.ablySandboxPublish/1.0";
const LINGOSENTINEL_PRIVATE_ROOM_VERSION = "nyx.lingosentinel.controlledPrivateRoom/1.1-direct-ably-fallback";

const INDEX_FAILURE_SIGNATURES = Object.freeze({
  NONE: "none",
  ROUTE_DOMAIN_MISMATCH: "ROUTE_DOMAIN_MISMATCH",
  FINAL_ENVELOPE_MISSING: "FINAL_ENVELOPE_MISSING",
  WEAK_FINAL_REJECTED: "WEAK_FINAL_REJECTED",
  LOOP_GUARD_SUPPRESSED: "LOOP_GUARD_SUPPRESSED",
  PACKET_HIJACK_ATTEMPT: "PACKET_HIJACK_ATTEMPT",
  SCHEDULE_PRE_ROUTER_INTERCEPT: "SCHEDULE_PRE_ROUTER_INTERCEPT",
  TECHNICAL_TARGET_STALE_CARRY: "TECHNICAL_TARGET_STALE_CARRY",
  DOMAIN_CONFIDENCE_LOW: "DOMAIN_CONFIDENCE_LOW",
  VOICE_TEXT_PARITY_DRIFT: "VOICE_TEXT_PARITY_DRIFT",
  COMPOSER_EMPTY_REPLY: "COMPOSER_EMPTY_REPLY",
  BRIDGE_HANDOFF_INVALID: "BRIDGE_HANDOFF_INVALID",
  CHATENGINE_COORDINATOR_FAULT: "CHATENGINE_COORDINATOR_FAULT",
  DEBUG_LEAK_BLOCKED: "DEBUG_LEAK_BLOCKED"
});

const USER_VISIBLE_DEBUG_LEAK_PATTERNS = Object.freeze([
  /\bi stopped a repeated response before it could render again\b/i,
  /\bcurrent turn is preserved\b/i,
  /\bfresh Marion final\b/i,
  /\bwait for a fresh\s+Marion\s+final\b/i,
  /\breplaying the same fallback\b/i,
  /\bI caught the repeated Nyx\/Marion reply\b/i,
  /\bIndex\.js transport[- ]only\b/i,
  /\btransport only\b/i,
  /\bloop is being contained at the bridge layer\b/i,
  /\bMarionBridge should accept only one clean Marion final\b/i,
  /\bresponse[- ]authority problem\b/i,
  /\bfailureSignature\b/i,
  /\bruntimeTelemetry\b/i,
  /\breplyAuthority\b/i,
  /\bfinalEnvelopeTrusted\b/i,
  /\bcanEmit\b/i,
  /\bsessionPatch\b/i,
  /\brouteKind\b/i,
  /\bdiagnostics?\b/i,
  /\bfinalEnvelope\b/i,
  /\bMARION::FINAL::/i,
  /\bCHATENGINE_COORDINATOR_ONLY_ACTIVE_\d+/i,
  /\bnyx\.marion\.final\//i,
  /\bnyx\.marion\.stateSpine\//i,
  /\bbridge blocked an invalid public reply\b/i,
  /\bexposing a runtime value\b/i,
  /\banswer from the active lane\b/i,
  /\bthe recovery line has already served its purpose\b/i,
  /\bthe next line must carry progress\b/i
]);

function normalizeFailureSignature(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return INDEX_FAILURE_SIGNATURES.NONE;
  const key = raw.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
  for (const sig of Object.values(INDEX_FAILURE_SIGNATURES)) {
    if (key === sig.toUpperCase()) return sig;
  }
  return INDEX_FAILURE_SIGNATURES.NONE;
}

function hasUserVisibleDebugLeak(value) {
  const text = String(value == null ? "" : value);
  if (!text) return false;
  return USER_VISIBLE_DEBUG_LEAK_PATTERNS.some((rx) => rx.test(text)) || isPublicWorkflowStateLeak(text);
}


function isPublicWorkflowStateLeak(value) {
  const text = String(value == null ? "" : value);
  if (!text) return false;
  return /\bprogression active\b/i.test(text) ||
    /\brun next validation\b/i.test(text) ||
    /\bmark passed or failed\b/i.test(text) ||
    /\bmark\s+(?:as\s+)?(?:passed|failed)\b/i.test(text) ||
    /\bvalidation harness\b/i.test(text) ||
    /\bregression harness\b/i.test(text) ||
    /\btest\s+(?:next steps|passed|failed|continue|what now|update it)\b/i.test(text) ||
    /\bexpected result:\s*marion\b/i.test(text) ||
    /\bphase anchor\b/i.test(text) ||
    /\bstate spine\b/i.test(text) ||
    /\bprogression shaping guard\b/i.test(text) ||
    /\bfinal render telemetry\b/i.test(text) ||
    /\bproduction monitoring shield\b/i.test(text) ||
    /\bsmoke test\b/i.test(text) ||
    /\bnode --check\b/i.test(text) ||
    /\bpassed or failed\b/i.test(text) ||
    /\bi can help validate the next step\b/i.test(text) ||
    /\bi can help isolate the failure\b/i.test(text) ||
    /\bi can help with the next validation\b/i.test(text) ||
    /\bsend me the exact file or behavior you want checked\b/i.test(text) ||
    /\bsend me the exact file, prompt, or screenshot tied to the issue\b/i.test(text);
}

function stripUserVisibleDebugLeak(value) {
  let text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (!hasUserVisibleDebugLeak(text)) return text;
  text = text
    .replace(/\b(?:failureSignature|runtimeTelemetry|replyAuthority|finalEnvelopeTrusted|canEmit|sessionPatch|routeKind|diagnostics?|finalEnvelope)\s*[:=]\s*[^.;,}\]]+/gi, "")
    .replace(/MARION::FINAL::[^\s.;,]+/gi, "")
    .replace(/CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2}/gi, "")
    .replace(/nyx\.marion\.(?:final|stateSpine)\/[0-9.]+/gi, "")
    .replace(/(?:I[’\']m tracking the request,?\s*)?but the bridge blocked an invalid public reply\.?(?:\s*Please send the same prompt again and I[’\']ll answer from the active lane instead of exposing a runtime value\.?)?/gi, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  return text;
}

function extractFailureSignatureFromPacket(value) {
  const src = isObj(value) ? value : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const meta = isObj(src.meta) ? src.meta : {};
  const diagnostics = isObj(src.diagnostics) ? src.diagnostics : {};
  const finalEnvelope = isObj(src.finalEnvelope) ? src.finalEnvelope : {};
  const runtime = isObj(src.runtimeTelemetry) ? src.runtimeTelemetry : {};
  const candidates = [
    src.failureSignature,
    payload.failureSignature,
    meta.failureSignature,
    diagnostics.failureSignature,
    finalEnvelope.failureSignature,
    runtime.failureSignature,
    isObj(payload.runtimeTelemetry) ? payload.runtimeTelemetry.failureSignature : "",
    isObj(meta.runtimeTelemetry) ? meta.runtimeTelemetry.failureSignature : "",
    isObj(diagnostics.runtimeTelemetry) ? diagnostics.runtimeTelemetry.failureSignature : "",
    isObj(finalEnvelope.runtimeTelemetry) ? finalEnvelope.runtimeTelemetry.failureSignature : ""
  ];
  for (const item of candidates) {
    const sig = normalizeFailureSignature(item);
    if (sig !== INDEX_FAILURE_SIGNATURES.NONE) return sig;
  }
  return INDEX_FAILURE_SIGNATURES.NONE;
}

function inferIndexFailureSignature({norm={}, selected={}, marion={}, reply="", canEmit=true, error=""}={}) {
  const inherited = extractFailureSignatureFromPacket(selected) || extractFailureSignatureFromPacket(marion);
  if (inherited && inherited !== INDEX_FAILURE_SIGNATURES.NONE) return inherited;
  const err = String(error == null ? "" : error).toLowerCase();
  const selectedObj = isObj(selected) ? selected : {};
  const marionObj = isObj(marion) ? marion : {};
  const text = String(reply == null ? "" : reply);
  if (hasUserVisibleDebugLeak(text)) return INDEX_FAILURE_SIGNATURES.DEBUG_LEAK_BLOCKED;
  if (isBlockedLoopingSupportReply(text) || selectedObj.loopReplyBlockedCandidate || marionObj.loopReplyBlockedCandidate) return INDEX_FAILURE_SIGNATURES.LOOP_GUARD_SUPPRESSED;
  if (/schedule|timezone|city/.test(err)) return INDEX_FAILURE_SIGNATURES.SCHEDULE_PRE_ROUTER_INTERCEPT;
  if (/domain.*mismatch|route.*mismatch/.test(err)) return INDEX_FAILURE_SIGNATURES.ROUTE_DOMAIN_MISMATCH;
  if (/weak.*final|rejected/.test(err)) return INDEX_FAILURE_SIGNATURES.WEAK_FINAL_REJECTED;
  if (/composer.*empty|compose.*missing/.test(err)) return INDEX_FAILURE_SIGNATURES.COMPOSER_EMPTY_REPLY;
  if (/bridge|handoff|malformed|packet_invalid|contract_invalid/.test(err)) return INDEX_FAILURE_SIGNATURES.BRIDGE_HANDOFF_INVALID;
  if (/chatengine|coordinator/.test(err)) return INDEX_FAILURE_SIGNATURES.CHATENGINE_COORDINATOR_FAULT;
  if (/final.*missing|envelope.*missing|awaiting_marion|conversation_authority_empty/.test(err)) return INDEX_FAILURE_SIGNATURES.FINAL_ENVELOPE_MISSING;
  if (!canEmit && !String(reply || "").trim()) return INDEX_FAILURE_SIGNATURES.FINAL_ENVELOPE_MISSING;
  return INDEX_FAILURE_SIGNATURES.NONE;
}


function clampNumberEnv(name, fallback, min, max) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const HARDENING_CONSTANTS = Object.freeze({
  MAX_SESSIONS: clampNumberEnv("SB_MAX_SESSIONS", 1000, 100, 100000),
  XML_MAX_INPUT_CHARS: clampNumberEnv("SB_XML_MAX_INPUT_CHARS", 1024 * 1024, 8192, 5 * 1024 * 1024),
  XML_MAX_ENTITY_REPLACEMENTS: clampNumberEnv("SB_XML_MAX_ENTITY_REPLACEMENTS", 5000, 100, 50000),
  XML_MAX_DECODE_OUTPUT_CHARS: clampNumberEnv("SB_XML_MAX_DECODE_OUTPUT_CHARS", 1024 * 1024, 8192, 5 * 1024 * 1024),
  AVATAR_MAX_BASENAME_CHARS: clampNumberEnv("SB_AVATAR_MAX_BASENAME_CHARS", 180, 16, 255)
});

process.on("unhandledRejection", (reason) => {
  console.log("[Sandblast][unhandledRejection]", reason && (reason.stack || reason.message || reason));
});

process.on("uncaughtException", (err) => {
  console.log("[Sandblast][uncaughtException]", err && (err.stack || err.message || err));
  try {
    if (err && String(err.message || "").includes("EADDRINUSE")) process.exit(1);
  } catch (_) {}
});

function tryRequireMany(paths) {
  for (const p of paths) {
    try {
      const mod = require(p);
      if (mod) return mod;
    } catch (_) {}
  }
  return null;
}

function tryRequireManyWithStatus(paths) {
  for (const p of Array.isArray(paths) ? paths : []) {
    try {
      const resolved = require.resolve(p);
      const mod = require(resolved);
      if (mod) {
        return {
          ok: true,
          mod,
          requested: p,
          resolvedPath: resolved,
          version: cleanText(mod.VERSION || "")
        };
      }
    } catch (err) {}
  }
  return { ok: false, mod: null, requested: "", resolvedPath: "", version: "" };
}

function moduleAvailable(name) {
  try {
    require.resolve(name);
    return true;
  } catch (_) {
    return false;
  }
}

const envLoader = tryRequireMany(["dotenv", "./node_modules/dotenv"]);
if (envLoader && typeof envLoader.config === "function") {
  try { envLoader.config(); } catch (_) {}
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.locals.musicTopMoments = [];
app.locals.musicSources = [];
app.locals.musicMeta = { ok: false, file: "", count: 0, loadedAt: 0, source: "empty", degraded: false };

if (compression) {
  app.use(compression());
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));


// NYX-VOICE-TRANSCRIPT-ROUTE:
// Public voice entrypoint stays Nyx-facing while Marion remains the hidden authority.
// This route accepts transcript-only payloads. Raw audio must never be stored here.
// V1.3 hardens the projection layer against transcript echo promotion.
const NYX_VOICE_TRANSCRIPT_ROUTE_VERSION = "nyx.voiceTranscriptRoute/1.4-adminOnlyDeliveryHardlock";
const MARION_ADMIN_ONLY_VOICE_DELIVERY_VERSION = "marion.adminOnlyVoiceDelivery/1.0";

const NYX_VOICE_TRANSCRIPT_ROUTES = Object.freeze([
  "/api/nyx/voice/transcript",
  "/nyx/voice/transcript"
]);

const NYX_VOICE_TRANSCRIPT_HEALTH_ROUTES = Object.freeze([
  "/api/nyx/voice/transcript/health",
  "/nyx/voice/transcript/health"
]);

const NYX_VOICE_DEPLOYMENT_PARITY_VERSION = "nyx.voiceDeploymentParity/1.3";

const NYX_VOICE_REQUIRED_RUNTIME_FILES = Object.freeze([
  "Data/marion/runtime/MarionVoiceGateway.js",
  "Data/marion/runtime/MarionVoiceInputEnvelope.js",
  "Data/marion/runtime/MarionVoiceAuthorizationGate.js",
  "Data/marion/runtime/MarionVoiceOutputPolicy.js",
  "Data/marion/runtime/MarionVoiceTelemetry.js",
  "Data/marion/runtime/MarionVoiceTranscriptNormalizer.js"
]);

function nyxVoiceRequiredRuntimeDiagnostics() {
  return NYX_VOICE_REQUIRED_RUNTIME_FILES.map((relativePath) => {
    const filePath = path.join(__dirname, relativePath);
    let exists = false;
    let bytes = 0;
    try {
      const stat = fs.statSync(filePath);
      exists = stat.isFile();
      bytes = exists ? stat.size : 0;
    } catch (_) {
      exists = false;
      bytes = 0;
    }
    return { path: relativePath, exists, bytes };
  });
}

function nyxVoiceRuntimeFilesReady() {
  return nyxVoiceRequiredRuntimeDiagnostics().every((item) => item.exists);
}

function marionAdminVoiceEnvTokens() {
  return [
    process.env.SB_MARION_ADMIN_VOICE_TOKEN,
    process.env.SB_ADMIN_VOICE_TOKEN,
    process.env.MARION_ADMIN_VOICE_TOKEN
  ].map((item) => String(item || "").trim()).filter(Boolean);
}

function timingSafeTextEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (!left.length || !right.length || left.length !== right.length) return false;
  try {
    return crypto.timingSafeEqual(left, right);
  } catch (_) {
    return false;
  }
}

function marionAdminVoiceRequestAuth(req, body) {
  const headers = req && req.headers ? req.headers : {};
  const tokens = marionAdminVoiceEnvTokens();
  const candidates = [
    { source: "x-sb-marion-admin-voice-token", value: headers["x-sb-marion-admin-voice-token"] },
    { source: "x-sb-admin-voice-token", value: headers["x-sb-admin-voice-token"] }
  ].map((item) => ({ source: item.source, value: String(item.value || "").trim() })).filter((item) => item.value);

  for (const candidate of candidates) {
    if (tokens.some((token) => timingSafeTextEqual(candidate.value, token))) {
      return {
        verified: true,
        configured: tokens.length > 0,
        provided: true,
        source: candidate.source
      };
    }
  }

  return {
    verified: false,
    configured: tokens.length > 0,
    provided: candidates.length > 0,
    source: candidates.length ? "invalid" : "none"
  };
}

function nyxVoiceRouteReplyText(value, depth, seen) {
  if (!value) return "";
  if (typeof value === "string") return cleanReplyForUser(value);
  if (!isObj(value)) return "";

  const level = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  if (level > 6) return "";

  const visited = seen instanceof Set ? seen : new Set();
  if (visited.has(value)) return "";
  visited.add(value);

  const direct = cleanReplyForUser(
    value.displayReply ||
    value.reply ||
    value.text ||
    value.message ||
    value.answer ||
    value.output ||
    value.response ||
    value.finalReply ||
    value.publicReply ||
    value.visibleReply ||
    value.spokenText ||
    ""
  );
  if (direct) return direct;

  const priorityKeys = [
    "finalEnvelope", "payload", "data", "result", "packet", "marionFinal",
    "final", "envelope", "response", "output", "message", "reply", "text", "speech", "voice", "meta"
  ];

  for (const key of priorityKeys) {
    const nested = value[key];
    if (nested && typeof nested === "object") {
      const found = nyxVoiceRouteReplyText(nested, level + 1, visited);
      if (found) return found;
    }
  }

  for (const key of Object.keys(value)) {
    if (priorityKeys.includes(key)) continue;
    const nested = value[key];
    if (nested && typeof nested === "object") {
      const found = nyxVoiceRouteReplyText(nested, level + 1, visited);
      if (found) return found;
    }
  }

  return "";
}

function nyxVoiceRouteFallbackReply(packet, body) {
  const voiceEnvelope = isObj(packet && packet.voiceEnvelope) ? packet.voiceEnvelope : {};
  const hint = cleanText(voiceEnvelope.userIntentHint || "").toLowerCase();
  const commandPhrase = cleanText(voiceEnvelope.commandPhrase || "").toLowerCase();
  const authorizationState = cleanText(voiceEnvelope.authorizationState || "");

  const adminVoiceDeliveryAllowed = voiceEnvelope.adminVoiceDeliveryAllowed === true || voiceEnvelope.adminVoiceVerified === true;

  if (hint === "status" || commandPhrase === "status") {
    return adminVoiceDeliveryAllowed
      ? "Protected voice lane status: admin authorization is verified, transcript-only processing is live, and raw audio is not being stored."
      : "Protected voice lane status: admin voice delivery is locked. Transcript-only processing is live, and raw audio is not being stored.";
  }

  if (packet && packet.ok === false) {
    return "I heard you, but that voice turn could not complete cleanly. The response stayed safe, and raw audio was not stored.";
  }

  if (authorizationState === "authorized" && adminVoiceDeliveryAllowed) {
    return "I heard you and admin authorization passed. The voice route stayed active, the response stayed safe, and raw audio was not stored.";
  }

  return "I heard you, but protected voice delivery needs admin authorization before I can continue.";
}

function nyxVoiceRouteSafePublicReply(value) {
  const cleaned = cleanReplyForUser(value);
  if (cleaned && !isPrimitivePlaceholderReplyValue(cleaned)) return cleaned;
  let text = cleanText(value || "");
  if (!text || isPrimitivePlaceholderReplyValue(text)) return "";
  text = stripUserVisibleDebugLeak(text);
  text = stripPublicReplyScaffold(text);
  text = text
    .replace(/\bbackend\b/ig, "system")
    .replace(/\bMarionBridge\b/g, "the voice bridge")
    .replace(/\bMarionVoiceGateway\b/g, "the voice gateway")
    .replace(/\bMARION::FINAL::[^\s.;,]+/gi, "")
    .replace(/\bnyx\.voiceReplyPromotionHardlock\/[0-9.]+\b/gi, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text || hasUserVisibleDebugLeak(text) || isPublicWorkflowStateLeak(text) || isPublicControlPolicyLeak(text)) return "";
  return text;
}

function nyxVoiceRouteNormalizeEchoText(value) {
  return cleanText(value || "")
    .toLowerCase()
    .replace(/^\s*(?:vera|nyx|marion)\s*[,:\-]?\s*/i, "")
    .replace(/[“”"'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nyxVoiceRouteCollectEchoSources(packet, body) {
  const p = isObj(packet) ? packet : {};
  const b = isObj(body) ? body : {};
  const voice = isObj(p.voice) ? p.voice : {};
  const voiceEnvelope = isObj(p.voiceEnvelope) ? p.voiceEnvelope : {};
  const normalization = isObj(voiceEnvelope.normalization) ? voiceEnvelope.normalization : {};
  return [
    b.transcript,
    b.text,
    b.message,
    b.query,
    p.transcript,
    p.originalTranscript,
    p.normalizedTranscript,
    voice.transcript,
    voice.originalTranscript,
    voice.normalizedTranscript,
    voiceEnvelope.transcript,
    voiceEnvelope.originalTranscript,
    voiceEnvelope.normalizedTranscript,
    normalization.originalTranscript,
    normalization.normalizedTranscript
  ].map(nyxVoiceRouteNormalizeEchoText).filter(Boolean);
}

function nyxVoiceRouteIsInputEchoReply(candidate, packet, body) {
  const reply = nyxVoiceRouteNormalizeEchoText(candidate);
  if (!reply) return false;
  const echoes = nyxVoiceRouteCollectEchoSources(packet, body);
  if (!echoes.length) return false;
  return echoes.some((echo) => reply === echo || (reply.length >= 12 && echo.length >= 12 && (reply.includes(echo) || echo.includes(reply))));
}

function nyxVoiceRouteEnsureNonEmptyReply(candidate, packet, body) {
  const promoted = nyxVoiceRouteSafePublicReply(candidate);
  if (promoted && !nyxVoiceRouteIsInputEchoReply(promoted, packet, body)) return promoted;

  const fallback = nyxVoiceRouteSafePublicReply(nyxVoiceRouteFallbackReply(packet, body));
  if (fallback) return fallback;

  return "I heard you. Voice routing is active, the public response stayed safe, and raw audio was not stored.";
}

app.options([...NYX_VOICE_TRANSCRIPT_ROUTES, ...NYX_VOICE_TRANSCRIPT_HEALTH_ROUTES], (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);
  return res.status(204).end();
});

// GET is intentionally diagnostic-only. Browser address-bar hits and Webflow
// route probes should never fall through to not_found. Actual voice turns
// remain POST-only and transcript-only.
app.get([...NYX_VOICE_TRANSCRIPT_ROUTES, ...NYX_VOICE_TRANSCRIPT_HEALTH_ROUTES], (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);

  let MarionVoiceGateway = null;
  try {
    MarionVoiceGateway = require("./Data/marion/runtime/MarionVoiceGateway.js");
  } catch (_) {
    MarionVoiceGateway = null;
  }

  return res.status(200).json({
    ok: true,
    service: "nyx-voice-transcript",
    routeMounted: true,
    routeOrder: "early",
    getDiagnosticOnly: true,
    acceptsVoiceTurns: true,
    requiredMethodForVoiceTurns: "POST",
    canonicalPostRoute: "/api/nyx/voice/transcript",
    canonicalHealthRoute: "/api/nyx/voice/transcript/health",
    publicAgent: "Nyx",
    authority: "Marion",
    inputChannel: "voice",
    transcriptOnly: true,
    audioStored: false,
    adminOnlyVoiceDelivery: true,
    adminVoiceTokenConfigured: marionAdminVoiceEnvTokens().length > 0,
    version: NYX_VOICE_TRANSCRIPT_ROUTE_VERSION,
    gateway: {
      available: !!(MarionVoiceGateway && typeof MarionVoiceGateway.handleVoiceTranscript === "function")
    },
    runtimeFilesReady: nyxVoiceRuntimeFilesReady(),
    diagnosticsRedacted: true,
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      noRawAudioStored: true,
      publicSpeakerHintTrusted: false,
      adminOnlyVoiceDelivery: true
    }
  });
});

app.post(NYX_VOICE_TRANSCRIPT_ROUTES, async (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);

  const startedAt = now();
  const body = isObj(req.body) ? req.body : {};
  const transcript = cleanText(body.transcript || body.text || body.message || body.query || "");
  const traceId = cleanText(req.headers["x-sb-trace-id"] || body.traceId || body.requestId || `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const adminVoiceAuth = marionAdminVoiceRequestAuth(req, body);

  if (!transcript) {
    return res.status(400).json({
      ok: false,
      reply: "I did not receive a usable voice transcript.",
      text: "I did not receive a usable voice transcript.",
      message: "I did not receive a usable voice transcript.",
      publicAgent: "Nyx",
      authority: "Marion",
      inputChannel: "voice",
      source: "voice",
      error: "empty_voice_transcript",
      route: "/api/nyx/voice/transcript",
      version: NYX_VOICE_TRANSCRIPT_ROUTE_VERSION,
      adminOnlyVoiceDelivery: true,
      voice: {
        speakAllowed: false,
        voiceMode: "silent",
        reason: "EMPTY_TRANSCRIPT",
        spokenText: "",
        audioStored: false,
        adminOnlyVoiceDelivery: true,
        adminVoiceDeliveryAllowed: false
      },
      meta: { traceId, latencyMs: now() - startedAt, adminOnlyVoiceDeliveryVersion: MARION_ADMIN_ONLY_VOICE_DELIVERY_VERSION }
    });
  }

  let MarionVoiceGateway = null;
  try {
    MarionVoiceGateway = require("./Data/marion/runtime/MarionVoiceGateway.js");
  } catch (err) {
    MarionVoiceGateway = null;
  }

  if (!MarionVoiceGateway || typeof MarionVoiceGateway.handleVoiceTranscript !== "function") {
    return res.status(503).json({
      ok: false,
      reply: "Voice transcript routing is mounted, but the protected voice gateway is not available yet.",
      text: "Voice transcript routing is mounted, but the protected voice gateway is not available yet.",
      message: "Voice transcript routing is mounted, but the protected voice gateway is not available yet.",
      publicAgent: "Nyx",
      authority: "Marion",
      inputChannel: "voice",
      source: "voice",
      error: "marion_voice_gateway_unavailable",
      route: "/api/nyx/voice/transcript",
      version: NYX_VOICE_TRANSCRIPT_ROUTE_VERSION,
      deploymentParityVersion: NYX_VOICE_DEPLOYMENT_PARITY_VERSION,
      adminOnlyVoiceDelivery: true,
      voice: {
        speakAllowed: false,
        voiceMode: "silent",
        reason: "MARION_VOICE_GATEWAY_UNAVAILABLE",
        spokenText: "",
        audioStored: false,
        adminOnlyVoiceDelivery: true,
        adminVoiceDeliveryAllowed: false
      },
      runtimeFiles: nyxVoiceRequiredRuntimeDiagnostics(),
      runtimeFilesReady: nyxVoiceRuntimeFilesReady(),
      meta: {
        traceId,
        latencyMs: now() - startedAt,
        deploymentParityVersion: NYX_VOICE_DEPLOYMENT_PARITY_VERSION,
        readme: "README.md"
      }
    });
  }

  try {
    const packet = await MarionVoiceGateway.handleVoiceTranscript({
      transcript,
      confidence: body.confidence,
      locale: cleanText(body.locale || body.language || "en-CA"),
      provider: cleanText(body.provider || "browser-native"),
      speakerHint: adminVoiceAuth.verified ? cleanText(body.speakerHint || body.speaker || body.user || "") : "",
      sessionId: cleanText(body.sessionId || "public"),
      requestId: traceId,
      userAgent: cleanText(req.headers["user-agent"] || ""),
      client: cleanText(body.client || "web"),
      final: body.final !== false,
      interim: body.interim === true,
      adminOnlyVoiceDelivery: true,
      adminVoiceVerified: adminVoiceAuth.verified,
      adminVoiceTokenVerified: adminVoiceAuth.verified,
      adminVoiceAuthSource: adminVoiceAuth.verified ? adminVoiceAuth.source : ""
    }, {
      authorization: {
        adminOnlyVoiceDelivery: true,
        allowConversationalWhenUnknown: false,
        trustSpeakerHint: adminVoiceAuth.verified,
        adminVoiceVerified: adminVoiceAuth.verified,
        adminVoiceTokenVerified: adminVoiceAuth.verified,
        adminVoiceDeliveryAllowed: adminVoiceAuth.verified
      },
      output: {
        adminOnlyVoiceDelivery: true,
        adminVoiceVerified: adminVoiceAuth.verified,
        adminVoiceTokenVerified: adminVoiceAuth.verified,
        adminVoiceDeliveryAllowed: adminVoiceAuth.verified,
        forceSilent: !adminVoiceAuth.verified
      },
      context: {
        sessionId: cleanText(body.sessionId || "public"),
        requestId: traceId,
        inputChannel: "voice",
        source: "voice",
        publicAgent: "Nyx",
        authority: "Marion",
        adminOnlyVoiceDelivery: true,
        adminVoiceVerified: adminVoiceAuth.verified,
        adminVoiceDeliveryAllowed: adminVoiceAuth.verified
      }
    });

    const voice = isObj(packet && packet.voice) ? packet.voice : {};
    const voiceEnvelope = isObj(packet && packet.voiceEnvelope) ? packet.voiceEnvelope : {};
    const rawPromotedReply = nyxVoiceRouteReplyText(packet) || nyxVoiceRouteReplyText(voice);
    const promotedReply = nyxVoiceRouteIsInputEchoReply(rawPromotedReply, packet, body) ? "" : rawPromotedReply;
    const reply = nyxVoiceRouteEnsureNonEmptyReply(promotedReply, packet, body);
    const promotedSafe = nyxVoiceRouteSafePublicReply(promotedReply);
    const voiceEchoSuppressed = Boolean(rawPromotedReply && !promotedReply) || nyxVoiceRouteIsInputEchoReply(voice.spokenText, packet, body);
    const voiceReplyPromotionFallback = (!promotedSafe && Boolean(reply)) || voiceEchoSuppressed;
    const adminVoiceDeliveryAllowed = adminVoiceAuth.verified === true && (
      voice.adminVoiceDeliveryAllowed === true ||
      voiceEnvelope.adminVoiceDeliveryAllowed === true ||
      cleanText(voiceEnvelope.authorizationState || "") === "authorized"
    );
    const routeSpeakAllowed = adminVoiceDeliveryAllowed && voice.speakAllowed === true && !voiceEchoSuppressed;
    const spokenCandidate = routeSpeakAllowed ? voice.spokenText : "";
    const spokenText = routeSpeakAllowed ? (nyxVoiceRouteSafePublicReply(spokenCandidate) || reply) : "";

    return res.status(packet && packet.ok === false ? 202 : 200).json({
      ok: !(packet && packet.ok === false),
      final: true,
      handled: true,
      reply,
      text: reply,
      message: reply,
      displayReply: reply,
      publicAgent: "Nyx",
      authority: "Marion",
      inputChannel: "voice",
      source: "voice",
      route: "/api/nyx/voice/transcript",
      version: NYX_VOICE_TRANSCRIPT_ROUTE_VERSION,
      voice: {
        speakAllowed: routeSpeakAllowed,
        voiceMode: routeSpeakAllowed ? cleanText(voice.voiceMode || "full") : "silent",
        reason: !adminVoiceDeliveryAllowed ? "ADMIN_ONLY_VOICE_DELIVERY_REQUIRED" : voiceEchoSuppressed ? "VOICE_ROUTE_ECHO_SUPPRESSED_FALLBACK" : voiceReplyPromotionFallback ? "VOICE_ROUTE_REPLY_PROMOTION_FALLBACK" : cleanText(voice.reason || ""),
        spokenText,
        audioStored: false,
        adminOnlyVoiceDelivery: true,
        adminVoiceDeliveryAllowed,
        replyPromotionFallback: voice.replyPromotionFallback === true || voiceReplyPromotionFallback,
        echoSuppressed: voiceEchoSuppressed,
        nonEmptyReplyHardlock: true
      },
      voiceEnvelope: {
        source: "voice",
        inputChannel: "voice",
        locale: cleanText(voiceEnvelope.locale || body.locale || "en-CA"),
        confidence: Number.isFinite(Number(voiceEnvelope.confidence)) ? Number(voiceEnvelope.confidence) : null,
        authorizationState: cleanText(voiceEnvelope.authorizationState || ""),
        adminOnlyVoiceDelivery: true,
        adminVoiceVerified: adminVoiceAuth.verified === true,
        adminVoiceDeliveryAllowed,
        userIntentHint: cleanText(voiceEnvelope.userIntentHint || ""),
        commandPhrase: cleanText(voiceEnvelope.commandPhrase || ""),
        wakeWord: cleanText(voiceEnvelope.wakeWord || ""),
        audioStored: false
      },
      meta: {
        traceId,
        latencyMs: now() - startedAt,
        routeAuthority: "Nyx public route -> MarionVoiceGateway -> MarionBridge",
        noRawAudioStored: true,
        voiceReplyPromotionFallback,
        voiceEchoSuppressed,
        adminOnlyVoiceDelivery: true,
        adminVoiceTokenConfigured: adminVoiceAuth.configured === true,
        adminVoiceTokenProvided: adminVoiceAuth.provided === true,
        adminVoiceDeliveryAllowed,
        adminOnlyVoiceDeliveryVersion: MARION_ADMIN_ONLY_VOICE_DELIVERY_VERSION,
        nonEmptyReplyHardlock: true,
        promotionHardlockVersion: "nyx.voiceReplyPromotionHardlock/1.3",
        deploymentParityVersion: NYX_VOICE_DEPLOYMENT_PARITY_VERSION,
        readme: "README.md",
        renderDeployParityRequired: true
      }
    });
  } catch (err) {
    const message = cleanText(err && (err.message || err) || "voice_transcript_route_failed");
    return res.status(500).json({
      ok: false,
      reply: "Voice transcript routing failed before Marion could finish the turn.",
      text: "Voice transcript routing failed before Marion could finish the turn.",
      message: "Voice transcript routing failed before Marion could finish the turn.",
      publicAgent: "Nyx",
      authority: "Marion",
      inputChannel: "voice",
      source: "voice",
      error: "voice_transcript_route_failed",
      detail: message.slice(0, 160),
      route: "/api/nyx/voice/transcript",
      version: NYX_VOICE_TRANSCRIPT_ROUTE_VERSION,
      deploymentParityVersion: NYX_VOICE_DEPLOYMENT_PARITY_VERSION,
      adminOnlyVoiceDelivery: true,
      voice: {
        speakAllowed: false,
        voiceMode: "silent",
        reason: "VOICE_TRANSCRIPT_ROUTE_FAILED",
        spokenText: "",
        audioStored: false,
        adminOnlyVoiceDelivery: true,
        adminVoiceDeliveryAllowed: false
      },
      meta: {
        traceId,
        latencyMs: now() - startedAt,
        deploymentParityVersion: NYX_VOICE_DEPLOYMENT_PARITY_VERSION,
        readme: "README.md"
      }
    });
  }
});



// LINGOSENTINEL-START-CONTACT-ROUTE-V8-ASYNC-SUBMIT-SMTP-QUEUE-HARDLOCK:
// Must mount before any later router, static handler, or not_found fallback.
// These aliases intentionally cover both /api and non-/api Webflow/Render tests.
const LINGOSENTINEL_START_CONTACT_EARLY_ROUTES = Object.freeze([
  "/api/contact",
  "/api/lingosentinel/contact",
  "/api/lingosentinel/start/contact",
  "/contact",
  "/lingosentinel/contact",
  "/lingosentinel/start/contact"
]);

const LINGOSENTINEL_START_CONTACT_EARLY_HEALTH_ROUTES = Object.freeze([
  "/api/contact/health",
  "/api/lingosentinel/contact/health",
  "/api/lingosentinel/start/contact/health",
  "/contact/health",
  "/lingosentinel/contact/health",
  "/lingosentinel/start/contact/health"
]);

const LINGOSENTINEL_START_CONTACT_EARLY_SMTP_HEALTH_ROUTES = Object.freeze([
  "/api/contact/smtp-health",
  "/api/lingosentinel/contact/smtp-health",
  "/api/lingosentinel/start/contact/smtp-health",
  "/contact/smtp-health",
  "/lingosentinel/contact/smtp-health",
  "/lingosentinel/start/contact/smtp-health"
]);

const LINGOSENTINEL_START_CONTACT_EARLY_SMTP_SEND_TEST_ROUTES = Object.freeze([
  "/api/contact/smtp-send-test",
  "/api/lingosentinel/contact/smtp-send-test",
  "/api/lingosentinel/start/contact/smtp-send-test",
  "/contact/smtp-send-test",
  "/lingosentinel/contact/smtp-send-test",
  "/lingosentinel/start/contact/smtp-send-test"
]);

app.options([...LINGOSENTINEL_START_CONTACT_EARLY_ROUTES, ...LINGOSENTINEL_START_CONTACT_EARLY_HEALTH_ROUTES, ...LINGOSENTINEL_START_CONTACT_EARLY_SMTP_HEALTH_ROUTES, ...LINGOSENTINEL_START_CONTACT_EARLY_SMTP_SEND_TEST_ROUTES], (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);
  return res.status(204).end();
});

app.get(LINGOSENTINEL_START_CONTACT_EARLY_HEALTH_ROUTES, (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);
  const cfg = contactConfig();
  return res.status(200).json({
    ok: true,
    service: "lingosentinel-start-contact",
    routeMounted: true,
    routeOrder: "early",
    version: LINGOSENTINEL_CONTACT_ROUTE_VERSION,
    canonicalPostRoute: "/api/lingosentinel/start/contact",
    canonicalHealthRoute: "/api/lingosentinel/start/contact/health",
    acceptsSubmissions: true,
    storageFallback: true,
    deliveredToConfigured: !!cfg.to,
    emailDeliveryConfigured: isContactDeliveryConfigured(cfg),
    smtp: contactSmtpPublicDiagnostics(cfg),
    requiredEnvForEmailConfigured: isContactDeliveryConfigured(cfg),
    aliases: {
      health: LINGOSENTINEL_START_CONTACT_EARLY_HEALTH_ROUTES,
      smtpHealth: LINGOSENTINEL_START_CONTACT_EARLY_SMTP_HEALTH_ROUTES,
      smtpSendTest: LINGOSENTINEL_START_CONTACT_EARLY_SMTP_SEND_TEST_ROUTES,
      post: LINGOSENTINEL_START_CONTACT_EARLY_ROUTES
    },
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now()
    }
  });
});

app.get(LINGOSENTINEL_START_CONTACT_EARLY_SMTP_HEALTH_ROUTES, async (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);
  const cfg = contactConfig();
  const verifyRequested = /^(?:1|true|yes|on)$/i.test(cleanText(req.query && (req.query.verify || req.query.live || req.query.test) || ""));
  const verifyAuth = verifyRequested ? checkContactDiagnosticAccess(req) : { ok: true };
  let verify = verifyRequested && !verifyAuth.ok
    ? { requested: true, ok: false, skipped: true, error: "diagnostic_token_required" }
    : { requested: verifyRequested, ok: false, skipped: !verifyRequested };
  if (verifyRequested && verifyAuth.ok) {
    try {
      const result = await verifyContactSmtpConfig();
      verify = { requested: true, ok: true, result };
    } catch (err) {
      verify = {
        requested: true,
        ok: false,
        error: smtpSafeErrorCode(err),
        attempts: Array.isArray(err && err.smtpAttempts) ? err.smtpAttempts.slice(0, 8) : []
      };
    }
  }
  return res.status(200).json({
    ok: true,
    service: "lingosentinel-start-contact-smtp",
    routeMounted: true,
    routeOrder: "early",
    version: LINGOSENTINEL_CONTACT_ROUTE_VERSION,
    canonicalRoute: "/api/lingosentinel/start/contact/smtp-health",
    diagnosticSafe: true,
    verify,
    smtp: contactSmtpPublicDiagnostics(cfg),
    deliveryReady: isContactDeliveryConfigured(cfg),
    sendTestRoute: "/api/lingosentinel/start/contact/smtp-send-test",
    aliases: LINGOSENTINEL_START_CONTACT_EARLY_SMTP_HEALTH_ROUTES,
    meta: { v: PUBLIC_INDEX_VERSION, t: now() }
  });
});

app.all(LINGOSENTINEL_START_CONTACT_EARLY_SMTP_SEND_TEST_ROUTES, async (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);

  const auth = checkContactDiagnosticAccess(req);
  if (!auth.ok) {
    return res.status(403).json({
      ok: false,
      service: "lingosentinel-start-contact-smtp-send-test",
      error: auth.error,
      message: "SMTP diagnostic send route is locked."
    });
  }

  const cfg = contactConfig();
  const data = normalizeContactPayload({
    name: "SMTP Diagnostic",
    email: cfg.from || cfg.smtpUser || cfg.to,
    interest: "SMTP diagnostic",
    region: "Render",
    message: "Forced SMTP diagnostic send from LingoSentinel backend.",
    consent: true,
    source: "LingoSentinel SMTP diagnostic route"
  });

  try {
    const delivered = await sendContactEmailViaSmtp(data, { diagnostic: true, forceSynchronous: true });
    writeContactAudit(data, "diagnostic_delivered", { provider: delivered.provider, deliveredTo: delivered.deliveredTo, diagnostic: true, earlyMount: true });
    return res.status(200).json({
      ok: true,
      service: "lingosentinel-start-contact-smtp-send-test",
      delivered: true,
      deliveredToConfigured: !!delivered.deliveredTo,
      traceId: data.traceId,
      result: { ok: true, provider: cleanText(delivered.provider || "smtp") },
      smtp: contactSmtpPublicDiagnostics(cfg),
      routeOrder: "early",
      message: "SMTP diagnostic email delivered."
    });
  } catch (err) {
    const code = smtpSafeErrorCode(err);
    const attempts = Array.isArray(err && err.smtpAttempts) ? err.smtpAttempts.slice(0, 8) : [];
    writeContactAudit(data, "diagnostic_failed", { error: code, smtpAttempts: attempts, diagnostic: true, earlyMount: true });
    return res.status(200).json({
      ok: false,
      service: "lingosentinel-start-contact-smtp-send-test",
      delivered: false,
      error: code,
      attempts,
      traceId: data.traceId,
      smtp: contactSmtpPublicDiagnostics(cfg),
      routeOrder: "early",
      message: "SMTP diagnostic send failed before delivery."
    });
  }
});

app.post(LINGOSENTINEL_START_CONTACT_EARLY_ROUTES, (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);

  if (!checkContactRateLimit(req)) {
    return res.status(429).json({
      ok: false,
      received: false,
      stored: false,
      emailDelivered: false,
      error: "contact_rate_limited",
      message: "Too many contact attempts. Please wait and try again."
    });
  }

  const data = normalizeContactPayload(req.body);
  const errors = validateContactPayload(data);
  if (errors.length) {
    writeContactAudit(data, "rejected", { errors, earlyMount: true });
    return res.status(400).json({
      ok: false,
      received: false,
      stored: false,
      emailDelivered: false,
      error: "invalid_contact_payload",
      errors
    });
  }

  // V8 ASYNC-SUBMIT-SMTP-QUEUE-HARDLOCK:
  // The public form submit must never wait on SMTP. Acceptance authority is
  // receive + validate + audit/store. SMTP is a background delivery side effect.
  const stored = writeContactAudit(data, "received", {
    earlyMount: true,
    smtpQueued: true,
    publicSubmitDecoupledFromSmtp: true
  });

  queueContactEmailDelivery(data);

  return res.status(202).json({
    ok: true,
    received: true,
    stored: !!stored,
    emailDelivered: "queued",
    deliveredToConfigured: !!contactConfig().to,
    traceId: data.traceId,
    deliveryState: "queued_email_attempt",
    smtpDiagnosticRoute: "/api/lingosentinel/start/contact/smtp-health",
    routeOrder: "early",
    message: "LingoSentinel inquiry received by Sandblast Media."
  });
});



const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const PUBLIC_NEWSCANADA_DIR = path.join(__dirname, "public newscanada");
const STATIC_PUBLIC_DIRS = uniq([PUBLIC_DIR, PUBLIC_NEWSCANADA_DIR]).filter((dir) => {
  try {
    return fs.existsSync(dir);
  } catch (_) {
    return false;
  }
});


const AVATAR_PUBLIC_DIR = path.join(PUBLIC_DIR, "avatar");
const AVATAR_ASSETS_DIR = path.join(AVATAR_PUBLIC_DIR, "assets");
const AVATAR_FALLBACK_BASENAME = cleanEnvAvatarBasename(
  process.env.SB_NYX_AVATAR_FILE ||
  process.env.SB_AVATAR_FILE ||
  process.env.NYX_AVATAR_FILE ||
  "avatar5.mp4"
);
const AVATAR_IMAGE_FALLBACK_BASENAME = cleanEnvAvatarBasename(
  process.env.SB_NYX_AVATAR_FALLBACK_FILE ||
  process.env.SB_AVATAR_FALLBACK_FILE ||
  process.env.NYX_AVATAR_FALLBACK_FILE ||
  "nyx-hero.png"
);

function cleanEnvAvatarBasename(value) {
  const raw = cleanText(value || "");
  if (!raw || raw.length > HARDENING_CONSTANTS.AVATAR_MAX_BASENAME_CHARS) return "";
  if (raw.includes("\0")) return "";
  const normalized = raw.replace(/\\+/g, "/");
  const base = path.basename(normalized);
  if (!base || base === "." || base === "..") return "";
  if (base.includes("/") || base.includes("\\")) return "";
  if (!/^[a-z0-9][a-z0-9._ -]{0,254}$/i.test(base)) return "";
  if (base.startsWith(".")) return "";
  return cleanText(base);
}

function safeResolveUnderDir(baseDir, targetPath) {
  const root = path.resolve(baseDir || "");
  const resolved = path.resolve(targetPath || "");
  if (!root || !resolved) return "";
  const rel = path.relative(root, resolved);
  if (rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel))) return resolved;
  return "";
}

function avatarAssetBaseUrl() {
  return routeUrl("/avatar/assets");
}

function avatarStaticCandidateDirs() {
  return uniq([
    AVATAR_ASSETS_DIR,
    AVATAR_PUBLIC_DIR,
    path.join(PUBLIC_DIR, "assets"),
    path.join(PUBLIC_DIR, "media"),
    path.join(PUBLIC_DIR, "media", "avatar"),
    path.join(PUBLIC_DIR, "videos"),
    path.join(PUBLIC_DIR, "video")
  ]).filter((dir) => {
    try {
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
    } catch (_) {
      return false;
    }
  });
}

function safeAvatarFileCandidate(dir, fileName) {
  const base = cleanEnvAvatarBasename(fileName);
  if (!base) return "";
  const safeDir = avatarStaticCandidateDirs().find((candidateDir) => path.resolve(candidateDir) === path.resolve(dir));
  if (!safeDir) return "";
  return safeResolveUnderDir(safeDir, path.join(safeDir, base));
}

function avatarStaticCandidateFiles(fileName) {
  const base = cleanEnvAvatarBasename(fileName);
  if (!base) return [];
  return uniq(avatarStaticCandidateDirs().map((dir) => safeAvatarFileCandidate(dir, base)).filter(Boolean));
}

function resolveAvatarAssetFile(fileName) {
  const base = cleanEnvAvatarBasename(fileName);
  if (!base) return "";
  const allowedDirs = avatarStaticCandidateDirs();
  for (const candidate of avatarStaticCandidateFiles(base)) {
    try {
      const resolved = path.resolve(candidate);
      const allowed = allowedDirs.some((dir) => !!safeResolveUnderDir(dir, resolved));
      if (allowed && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    } catch (_) {}
  }
  const lowerName = base.toLowerCase();
  for (const dir of allowedDirs) {
    try {
      const hits = fs.readdirSync(dir);
      for (const entry of hits) {
        if (cleanEnvAvatarBasename(entry).toLowerCase() !== lowerName) continue;
        const full = safeAvatarFileCandidate(dir, entry);
        if (full && fs.existsSync(full) && fs.statSync(full).isFile()) return full;
      }
    } catch (_) {}
  }
  return "";
}

function avatarVideoFile() {
  return resolveAvatarAssetFile(AVATAR_FALLBACK_BASENAME);
}

function avatarFallbackImageFile() {
  return resolveAvatarAssetFile(AVATAR_IMAGE_FALLBACK_BASENAME);
}

function avatarMimeType(filePath) {
  const ext = lower(path.extname(filePath || ""));
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".ogg" || ext === ".ogv") return "video/ogg";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function sendAvatarFile(res, filePath) {
  if (!filePath) return false;
  try {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.type(avatarMimeType(filePath));
    res.sendFile(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

function avatarConfigPayload() {
  const videoFile = avatarVideoFile();
  const imageFile = avatarFallbackImageFile();
  const videoName = cleanEnvAvatarBasename(videoFile ? path.basename(videoFile) : AVATAR_FALLBACK_BASENAME) || AVATAR_FALLBACK_BASENAME;
  const imageName = cleanEnvAvatarBasename(imageFile ? path.basename(imageFile) : AVATAR_IMAGE_FALLBACK_BASENAME) || AVATAR_IMAGE_FALLBACK_BASENAME;
  return {
    ok: !!videoFile,
    base: getBackendPublicBase(),
    assetBaseUrl: avatarAssetBaseUrl(),
    videoFile: videoName,
    imageFile: imageName,
    avatarSrc: routeUrl(`/avatar/assets/${videoName}`),
    fallbackSrc: routeUrl(`/avatar/assets/${imageName}`),
    directVideo: routeUrl("/avatar/video"),
    statusUrl: routeUrl("/avatar/status"),
    scriptVersion: PUBLIC_INDEX_VERSION,
    finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
    assetDirectoryCount: avatarStaticCandidateDirs().length
  };
}

function safeStr(v) {

  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function now() {
  return Date.now();
}

function lower(v) {
  return safeStr(v).toLowerCase();
}

function clamp(n, min, max) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function uniq(arr) {
  return Array.from(new Set(Array.isArray(arr) ? arr.filter(Boolean) : []));
}

function isObj(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function safeObj(v) {
  return isObj(v) ? v : {};
}

function cleanText(v) {
  return safeStr(v).replace(/\s+/g, " ").trim();
}

function normalizePublicNyxAddress(value) {
  let text = cleanText(value || "");
  if (!text) return "";
  text = text
    .replace(/^(\s*(?:hi|hello|hey|yo|hiya|bonjour|salut|hola|buenos\s+d[ií]as|good\s+morning|good\s+afternoon|good\s+evening)\s+)(marion)(\b|[,:\-])/i, (m, a, _name, b) => `${a}Nyx${b || ""}`)
    .replace(/^\s*marion\s*[,:\-]\s*/i, "Nyx, ");
  return text.replace(/\s+/g, " ").trim();
}

function buildNyxPublicContextPassportSurface(surface = {}) {
  const s = isObj(surface) ? surface : {};
  const source = cleanText(s.sourceLanguage || s.detectedLanguage || "unknown").toLowerCase();
  const target = cleanText(s.targetLanguage || s.responseLanguage || "en").toLowerCase();
  const domain = cleanText(s.activeDomain || s.domain || "general").toLowerCase();
  const langLabel = (v) => ({ en: "EN", es: "ES", fr: "FR", unknown: "Language" }[String(v || "").toLowerCase()] || String(v || "Language").toUpperCase());
  const domainLabel = (v) => ({ general: "General", ai: "AI", psychology: "Psychology", english: "English", finance: "Finance", law: "Law", cyber: "Cyber", business: "Business" }[String(v || "").toLowerCase()] || cleanText(v || "General"));
  const fallbackUsed = !!s.fallbackUsed;
  const label = fallbackUsed
    ? `${langLabel(target)} fallback · Nyx ✓`
    : source && source !== "unknown" && source !== target
      ? `${langLabel(source)} → ${langLabel(target)} · ${domainLabel(domain)} · Nyx ✓`
      : `${langLabel(target)} · ${domainLabel(domain)} · Nyx ✓`;
  return {
    visible: true,
    authority: "marion",
    displayAuthority: "nyx",
    publicAgent: "nyx",
    userFacingAgent: "Nyx",
    sourceLanguage: source,
    targetLanguage: target,
    activeLanguage: source,
    responseLanguage: target,
    activeDomain: domain,
    confidenceBand: cleanText(s.confidenceBand || "unknown"),
    toneMode: cleanText(s.toneMode || "clear_direct"),
    handoffStatus: cleanText(s.handoffStatus || "available"),
    fallbackUsed,
    label,
    shortLabel: label.length > 52 ? `${label.slice(0, 49).trim()}…` : label
  };
}

function firstString(arr) {
  for (const v of Array.isArray(arr) ? arr : []) {
    const s = cleanText(v);
    if (s) return s;
  }
  return "";
}

function clipText(v, max) {
  const s = cleanText(v);
  const n = clamp(Number(max || 280), 32, 4000);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function maskSecret(v) {
  const s = cleanText(v);
  if (!s) return "";
  if (s.length <= 8) return "********";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}


function stripPublicReplyScaffold(value) {
  let t = cleanText(value);
  if (!t) return "";
  for (let i = 0; i < 14; i += 1) {
    const next = t
      .replace(/^(?:that makes sense|polished version|i[’']?ve got you|let[’']?s keep it clean|clean version|here[’']?s the clean version)\s*[:\-–—]\s*/i, "")
      .replace(/^(?:what\s+is\s+)?(?:bonjour|hola|hello|hi|hey)\s+nyx\s*,?\s*(?:please\s*)?/i, "")
      .replace(/^(?:what\s+is\s+)?(?:bonjour|hola|hello|hi|hey)\s+marion\s*,?\s*(?:please\s*)?/i, "");
    if (next === t) break;
    t = next.trim();
  }
  t = t.replace(/\b(?:that makes sense|polished version|i[’']?ve got you|let[’']?s keep it clean|clean version|here[’']?s the clean version)\s*[:\-–—]\s*/gi, "");
  const chunks = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (chunks && chunks.length > 1) {
    const seen = new Set();
    const out = [];
    for (const c of chunks) {
      const s = cleanText(c);
      const k = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!k) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    t = out.join(" ").trim();
  }
  return t.replace(/\s+([,.!?;:])/g, "$1").replace(/\s{2,}/g, " ").trim();
}

function isPrimitivePlaceholderReplyValue(value) {
  if (typeof value === "boolean") return true;
  const t = cleanText(value).replace(/[.!?]+$/g, "").toLowerCase();
  if (!t) return true;
  return /^(?:false|true|null|undefined|nan|none)$/i.test(t);
}


const LAST_MILE_LANGUAGE_SPHERE_NEXT_STEPS_REPLY = "Next for LanguageSphere: harden mic-to-text parity, confirm spoken alias recovery, verify phase anchoring, then run paired typed/voice regression tests before moving stable components into LingoSentinel.";
const LAST_MILE_MIC_TEXT_PARITY_AFTER_REPLY = "After mic-to-text parity, the next step is the five-turn live mic smoke test: confirm voice input preserves topic, phase, domain route, and Marion authority across consecutive turns without returning false or broad clarification.";

function collectPublicIntentText(packet) {
  const src = safeObj(packet);
  const payload = safeObj(src.payload);
  const finalEnvelope = safeObj(src.finalEnvelope);
  const input = safeObj(src.input);
  const body = safeObj(src.body);
  const meta = safeObj(src.meta);
  const normalized = safeObj(src.normalized || src.norm);
  const pieces = [
    src.userText, src.rawUserText, src.originalUserText, src.message, src.text, src.query, src.inputText, src.originalText,
    payload.userText, payload.rawUserText, payload.originalUserText, payload.message, payload.text, payload.query, payload.originalText,
    finalEnvelope.userText, finalEnvelope.rawUserText, finalEnvelope.originalUserText,
    input.userText, input.rawUserText, input.originalUserText, input.message, input.text, input.query,
    body.userText, body.rawUserText, body.originalUserText, body.message, body.text, body.query,
    meta.userText, meta.rawUserText, meta.originalUserText, meta.query,
    normalized.userText, normalized.rawUserText, normalized.originalUserText, normalized.query
  ];
  return pieces.map(cleanText).filter((piece) => piece && !isPublicWorkflowStateLeak(piece) && !hasUserVisibleDebugLeak(piece)).join(" ");
}

function collectCurrentUserIntentText(packet) {
  const src = safeObj(packet);
  const payload = safeObj(src.payload);
  const input = safeObj(src.input);
  const body = safeObj(src.body);
  const normalized = safeObj(src.normalized || src.norm);
  const original = safeObj(src.original);
  const pieces = [
    src.userText, src.rawUserText, src.originalUserText, src.userQuery, src.rawUserQuery, src.publicUserQuery, src.query, src.inputText, src.originalText,
    payload.userText, payload.rawUserText, payload.originalUserText, payload.userQuery, payload.rawUserQuery, payload.publicUserQuery, payload.query, payload.originalText,
    input.userText, input.rawUserText, input.originalUserText, input.query,
    body.userText, body.rawUserText, body.originalUserText, body.query,
    normalized.userText, normalized.rawUserText, normalized.originalUserText, normalized.userQuery, normalized.rawUserQuery, normalized.publicUserQuery, normalized.query,
    original.userText, original.rawUserText, original.originalUserText, original.query
  ];
  return pieces.map(cleanText).filter((piece) => piece && !isPublicWorkflowStateLeak(piece) && !hasUserVisibleDebugLeak(piece)).join(" ");
}

function normalizeLastMileIntentText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\blanguage\s+(?:c\s*a|ca|k|see\s*a|sea)\b/g, "languagesphere")
    .replace(/\blanguage\s+(?:fair|fare|fear|share|sphere)\b/g, "languagesphere")
    .replace(/\blanguagesphere\b/g, "languagesphere")
    .replace(/\blingo\s*link\b/g, "lingosentinel")
    .replace(/\bmike\s*(?:to|2)?\s*text\b/g, "mic to text")
    .replace(/\bmic\s*(?:to|2)?\s*text\b/g, "mic to text")
    .replace(/\bmicrophone\s*(?:to|2)?\s*text\b/g, "mic to text")
    .replace(/\bspeech\s*(?:to|2)?\s*text\b/g, "mic to text")
    .replace(/\s+/g, " ")
    .trim();
}

const LAST_MILE_PROGRESSION_CONTINUATION_REPLY = "";

function buildDeterministicLastMilePublicReplyFromText(value = "") {
  const source = cleanText(value);
  const normalized = normalizeLastMileIntentText(source);
  if (!source && !normalized) return "";
  if (/\bsandblast\s+channel\b/i.test(source)) {
    return "Sandblast Channel is a media and AI interface ecosystem built around chat, radio, video, news, and multilingual support through Nyx and Marion.";
  }
  const target =
    /\b(?:into|to|in)\s+french\b|\bfrançais\b|\bfrancais\b/i.test(source) ? "fr" :
    /\b(?:into|to|in)\s+spanish\b|\bespañol\b|\bespanol\b/i.test(source) ? "es" :
    /\b(?:into|to|in)\s+english\b/i.test(source) ? "en" : "";
  if (/\btranslate\b|\bhow do you say\b|\bsay .* in\b/i.test(source)) {
    if (target === "fr" && /\bgood morning\b/i.test(source)) return "Good morning in French is: Bonjour.";
    if (target === "es" && /\bgood morning\b/i.test(source)) return "Good morning in Spanish is: Buenos días.";
    if (target === "en" && /\bbonjour\b/i.test(source)) return "Bonjour means hello in English.";
    if (target === "en" && /\bhola\b/i.test(source)) return "Hola means hello in English.";
    if (target === "fr") return "I can translate that into French, but I need the exact phrase to keep the answer accurate.";
    if (target === "es") return "I can translate that into Spanish, but I need the exact phrase to keep the answer accurate.";
    if (target === "en") return "I can translate that into English, but I need the exact phrase to keep the answer accurate.";
  }
  if (/\bbonjour\b/i.test(source) && /\bcomment allez[- ]?vous\b/i.test(source)) return "Bonjour, comment allez-vous? means: Hello, how are you?";
  if (/\bhola\b/i.test(source) && /\bc[oó]mo est[aá]s\b/i.test(source)) return "Hola, ¿cómo estás? means: Hello, how are you?";
  if (/\badapt\b/i.test(source) && /\bfrench audience\b/i.test(source)) return "For a French audience, keep the message clear, polished, and culturally respectful while preserving the original intent.";
  if (/\bteach me\b|\blearn\b/i.test(source)) {
    if (/\bthank you\b/i.test(source) && /\bspanish\b/i.test(source)) return "Thank you in Spanish is: Gracias.";
    if (/\bthank you\b/i.test(source) && /\bfrench\b/i.test(source)) return "Thank you in French is: Merci.";
  }
  const sixDomainReply = buildSixDomainPublicKnowledgeAnswer(source);
  if (sixDomainReply) return sixDomainReply;
  return "";
}

function normalizeSixDomainTopicLabel(value=""){
  const raw=String(value==null?"":value).replace(/\s+/g," ").trim();
  if(!raw)return "";
  let s=raw
    .replace(/^(?:tell me about|explain|what is|what are|define|describe|break down|give me an overview of|help me understand)\s+/i,"")
    .replace(/\?+$/,"")
    .trim();
  s=s.replace(/^(?:the|a|an)\s+/i,"").trim();
  return s.slice(0,72);
}
function buildSixDomainPublicKnowledgeAnswer(value=""){
  const source=String(value==null?"":value).replace(/\s+/g," ").trim();
  const t=source.toLowerCase();
  if(!t)return "";
  if(/cash[- ]?flow/.test(t) && /what happens next|what next|then what|next step|next steps|comes next/.test(t))return "Next, the business has to manage the timing gap: collect the invoice, delay nonessential spending, cover payroll and rent, or use reserves or financing until the cash actually arrives.";
  if(/cash[- ]?flow/.test(t) && /another example|show another|second example/.test(t))return "Another example: a contractor pays $2,000 for materials today but the client pays after the job is finished. Until that payment arrives, the contractor has a cash-flow gap even if the job is profitable.";
  if(/cash[- ]?flow/.test(t) && /continue|tell me more|go deeper|expand|break down/.test(t))return "The next layer is timing: profit tells you whether the work makes money overall, but cash flow tells you whether the money is available when bills are due.";
  if(/\bcash[- ]?flow\b/.test(t) && /\bexample|for instance|show me\b/.test(t))return "Example: a business invoices $5,000 today but will not receive that money for 30 days. If rent, payroll, and supplies are due this week, the business can be profitable on paper but still have a cash-flow problem because the money has not arrived yet.";
  if(/\bcash[- ]?flow\b/.test(t) && /\bimportant|matter|why\b/.test(t))return "Cash flow is important because it determines whether a business can pay bills on time, handle slow sales periods, avoid unnecessary debt, and make growth decisions without running out of operating money.";
  if(/\bcash[- ]?flow\b/.test(t) && /\bapply|small business|practical\b/.test(t))return "For a small business, cash flow means watching when money actually arrives versus when expenses are due. The practical rule is to price, collect, spend, and hire based on available cash timing, not just total sales.";
  if(/\bcash[- ]?flow\b/.test(t))return "Cash flow is the movement of money into and out of a business over a period of time. Healthy cash flow means the business can pay expenses, manage timing gaps, and keep operating without constant pressure.";
  if(/\bauditing\b|\baudit process\b|\bfinancial audit\b|\boperational audit\b|\baudit\b/.test(t))return "Auditing is a structured review of records, systems, finances, or work against a standard. The goal is to find gaps, confirm accuracy, reduce risk, and improve accountability.";
  if(/\bcognitive\b|\bcognition\b|\bcognitive process\b/.test(t))return "Cognitive refers to mental processes like attention, memory, learning, reasoning, problem-solving, and decision-making. It is about how information is taken in, processed, and used.";
  if(/\bmachine learning\b|\bml\b/.test(t))return "Machine learning is a branch of AI where systems learn patterns from data and use those patterns to classify, predict, recommend, or make decisions without being manually programmed for every case.";
  if(/\bartificial intelligence\b|\bai\b/.test(t))return "Artificial intelligence is the use of computer systems to perform tasks that normally require human reasoning, such as understanding language, recognizing patterns, making predictions, or supporting decisions.";
  if(/\bleast privilege\b/.test(t))return "Least privilege is a cybersecurity principle where a user, service, or system gets only the access needed to do its job. It limits damage if an account, tool, or process is misused or compromised.";
  if(/\bphishing\b/.test(t))return "Phishing is a cyberattack where someone pretends to be a trusted source to trick a person into giving up passwords, money, or sensitive information.";
  if(/\bsyntax\b/.test(t))return "Syntax is the structure that controls how words, phrases, or symbols are arranged so meaning is clear. In English, it affects sentence order; in code, it controls whether instructions are valid.";
  if(/\bconsideration\b/.test(t)&&/\b(contract|law|legal)\b/.test(t))return "Consideration in contract law is the value exchanged between parties, such as money, services, goods, a promise, or a benefit. It helps show that an agreement is more than a casual statement.";
  if(/\bcontract\b|\blegal\b|\blaw\b|\bliability\b|\bnegligence\b/.test(t))return "In law, the key is to identify the rule, the facts, the duties involved, and the likely consequence. For public use, Nyx should explain the concept clearly without presenting it as legal advice.";
  if(/\brevenue\b|\bprofit\b|\bmargin\b|\bbudget\b|\bpricing\b|\bfinance\b|\bfinancial\b/.test(t))return "In finance, the important question is how money moves, what creates value, what creates cost, and whether the numbers support the decision. A useful answer should connect the concept to cash, risk, and timing.";
  if(/\bgrammar\b|\bwriting\b|\bsentence\b|\bparagraph\b|\bsemantics\b|\bmeaning\b/.test(t))return "In English, the goal is clear meaning. Grammar controls correctness, syntax controls structure, and word choice controls tone and precision.";
  if(/\bpsychology\b|\bbehavior\b|\bemotion\b|\bmotivation\b|\bmemory\b|\blearning\b|\battention\b|\bbias\b|\bfallacy\b/.test(t))return "In psychology, the focus is how people think, feel, learn, decide, and behave. A good explanation connects the concept to real patterns, triggers, and outcomes.";
  if(/\bcyber\b|\bsecurity\b|\bpassword\b|\bmalware\b|\bransomware\b|\bprivacy\b|\bcredential\b|\baccess\b/.test(t))return "In cybersecurity, the goal is to protect systems, accounts, data, and people from misuse or attack. The strongest answer usually covers the threat, the risk, and the practical control.";
  const topic=normalizeSixDomainTopicLabel(source);
  if(topic&&/\b(tell me about|explain|what is|what are|define|describe|break down|help me understand)\b/i.test(source)){
    return topic.charAt(0).toUpperCase()+topic.slice(1)+" is a public knowledge topic Marion can route through the six-domain layer. At a high level, the useful answer should define the term, explain why it matters, and give one practical example.";
  }
  return "";
}

function isInvalidPublicReplyRecoveryText(value = "") {
  const text = cleanText(value);
  return /\bbridge blocked an invalid public reply\b/i.test(text) ||
    /\bexposing a runtime value\b/i.test(text) ||
    /\banswer from the active lane\b/i.test(text) ||
    /\bi can answer that directly\.?\s*send the prompt again\b/i.test(text) ||
    /\bkeep the reply clean,?\s*public[- ]facing,?\s*and free of runtime details\b/i.test(text);
}

function isLastMileProgressionIntentText(value) {
  const source = normalizeLastMileIntentText(value);
  if (!source) return false;
  if (isPublicWorkflowStateLeak(source) || hasUserVisibleDebugLeak(source)) return false;
  const explicitProgression = /\b(progression shaping|progression refinement|progression_shaping_refinement|response[-\s]?expansion validation|validation harness|regression harness|mic[-\s]?to[-\s]?text parity|domain confidence scoring|phase\s*[1-9]|5[-\s]?turn|five[-\s]?turn)\b/i.test(source);
  const explicitResult = /\b(mark\s+(?:as\s+)?(?:passed|failed)|all passed|all failed|passed|failed)\b/i.test(source) && /\b(test|validation|phase|progression|parity|domain confidence|harness)\b/i.test(source);
  return !!(explicitProgression || explicitResult);
}

function isThinLastMileContinuationReply(value) {
  const text = cleanText(value).replace(/[.!?]+$/g, "").toLowerCase();
  if (!text) return false;
  return /^(?:continue|next|ok|okay|done|proceed|go ahead|carry on|keep going)$/i.test(text) ||
    /^i can continue from your next instruction$/i.test(text);
}

function buildLastMileProgressionContinuationReply(packet, fallbackText) {
  // LAST-MILE-PROGRESSION-EMISSION-PURGE:
  // index.js is transport/public hygiene only. It must never manufacture a
  // progression, validation, pass/fail, phase, or test-harness assistant reply.
  // Those replies created the "Progression active..." public loop by letting a
  // stale internal workflow state become a fresh Nyx message. Technical
  // progression responses must come from Marion through a trusted final envelope.
  void packet;
  void fallbackText;
  return "";
}
function buildLastMileRecoveryReply(packet) {
  // Recovery is allowed only from the current user intent fields. It may not
  // mine packet.reply/finalEnvelope/meta/assistant text, because those fields can
  // carry stale internal workflow language from the previous render.
  const currentUserText = collectCurrentUserIntentText(packet);
  const source = normalizeLastMileIntentText(currentUserText);
  if (!source || isPublicWorkflowStateLeak(source) || hasUserVisibleDebugLeak(source)) return "";
  const deterministic = buildDeterministicLastMilePublicReplyFromText(currentUserText);
  if (deterministic) return deterministic;
  const asksNext = /\b(next steps?|what'?s next|where are we|roadmap|continue)\b/i.test(source);
  const asksAfter = /\b(after|what happens after|after that|following|then)\b/i.test(source);
  if (/\blanguagesphere\b/i.test(source) && (asksNext || asksAfter)) return LAST_MILE_LANGUAGE_SPHERE_NEXT_STEPS_REPLY;
  if (/\blingosentinel\b/i.test(source) && /\blanguagesphere|language|translation|mic to text|parity\b/i.test(source)) return LAST_MILE_LANGUAGE_SPHERE_NEXT_STEPS_REPLY;
  if (/\bmic to text\b/i.test(source) && /\bparity\b/i.test(source) && (asksAfter || asksNext)) return LAST_MILE_MIC_TEXT_PARITY_AFTER_REPLY;
  // Explicit phase/progression/test-harness answers must be authored upstream
  // by Marion. index.js must not synthesize them as a last-mile fallback.
  return "";
}


function buildContinuityIntentOverrideReply(norm = {}, currentReply = "") {
  const n = safeObj(norm);
  if (!n.shortFollowupContinuityResolved && !cleanText(n.continuityResolvedText || n.resolvedQuestion || n.resolvedPrompt || "")) return "";
  const resolved = cleanText(n.continuityResolvedText || n.resolvedQuestion || n.resolvedPrompt || n.effectivePrompt || n.finalPrompt || n.text || "");
  const original = cleanText(n.continuityResolvedOriginalText || n.rawUserText || n.originalText || "");
  const prompt = cleanText([resolved, original].filter(Boolean).join(" "));
  if (!prompt) return "";
  const candidate = cleanReplyForUser(buildDeterministicLastMilePublicReplyFromText(prompt));
  if (!candidate) return "";
  const reply = cleanReplyForUser(currentReply);
  if (!reply) return candidate;
  const p = normalizeLastMileIntentText(prompt);
  const r = normalizeLastMileIntentText(reply);
  if (!p || !r) return "";
  if (replyHash(candidate) === replyHash(reply)) return "";
  if (/\b(example|for instance|show me)\b/i.test(p) && !/\b(example|for instance|invoices|\$|scenario|suppose|imagine)\b/i.test(r)) return candidate;
  if (/\b(important|matter|why)\b/i.test(p) && !/\b(important|because|determines|matters|helps|prevents|allows)\b/i.test(r)) return candidate;
  if (/\b(apply|small business|practical)\b/i.test(p) && !/\b(apply|small business|practical|in practice|means watching|rule is)\b/i.test(r)) return candidate;
  return "";
}



function buildLongTurnContinuityRecoveryReply(norm = {}, priorTurn = null, currentReply = "") {
  const n = safeObj(norm);
  const reply = cleanReplyForUser(currentReply);
  if (reply) return "";
  const original = cleanText(n.continuityResolvedOriginalText || n.rawUserText || n.originalText || n.message || n.text || "");
  const topic = cleanText(n.continuityTopic || extractContinuityTopicFromTurn(priorTurn) || "");
  if (!topic || !isShortContinuityFollowupText(original)) return "";
  const resolved = cleanText(n.continuityResolvedText || n.resolvedQuestion || n.resolvedPrompt || resolveShortContinuityFollowupText(original, priorTurn).resolved || "");
  if (!resolved || resolved === original) return "";
  const candidate = cleanReplyForUser(buildDeterministicLastMilePublicReplyFromText(resolved));
  return candidate || "";
}

function isLoopRecoveryCarryText(value = "") {
  const text = cleanText(value);
  if (!text) return false;
  return /\bthe recovery line has already served its purpose\b/i.test(text) ||
    /\bthe next line must carry progress\b/i.test(text) ||
    /\brecovery line\b/i.test(text) && /\bcarry progress\b/i.test(text);
}

function cleanVoiceTextForPublicReply(value, safeReply) {
  const fallback = cleanReplyForUser(safeReply) || "";
  const cleaned = cleanReplyForUser(value);
  if (!cleaned) return fallback;
  if (isLoopRecoveryCarryText(cleaned) || hasUserVisibleDebugLeak(cleaned) || isPublicWorkflowStateLeak(cleaned) || isPublicControlPolicyLeak(cleaned)) return fallback;
  return cleaned || fallback;
}

function buildPublicVoiceSurfaceFromReply(safeReply, voiceRoute) {
  const clean = cleanVoiceTextForPublicReply(safeReply, safeReply);
  const route = cleanPublicVoiceRoute(voiceRoute || "");
  return {
    speech: {
      enabled: !!clean,
      speak: !!clean,
      text: clean,
      textDisplay: clean,
      textSpeak: clean,
      spokenText: clean
    },
    playback: {
      ready: !!route,
      autoPlay: true,
      route: route || undefined,
      textSpeak: clean
    },
    tts: {
      ready: !!clean,
      textSpeak: clean
    }
  };
}

function forcePublicReply(packet, reply, metaPatch) {
  const safeReply = cleanReplyForUser(reply);
  const out = isObj(packet) ? { ...packet } : { ok: true };
  if (!safeReply || isPrimitivePlaceholderReplyValue(safeReply) || hasUserVisibleDebugLeak(safeReply) || isPublicWorkflowStateLeak(safeReply)) return {
    ...out,
    ok: false,
    final: false,
    handled: true,
    awaitingMarion: true,
    suppressUserFacingReply: true,
    emit: false,
    blocked: true,
    reply: "",
    text: "",
    answer: "",
    output: "",
    response: "",
    displayReply: "",
    payload: { ...safeObj(out.payload), reply: "", text: "", message: "", final: false, awaitingMarion: true, suppressUserFacingReply: true, emit: false, blocked: true },
    finalEnvelope: { ...safeObj(out.finalEnvelope), reply: "", text: "", displayReply: "", final: false, marionFinal: false, handled: true }
  };
  const spokenText = cleanVoiceTextForPublicReply(out.spokenText || out.textSpeak || safeObj(out.speech).textSpeak || safeReply, safeReply);
  out.ok = out.ok !== false;
  out.final = true;
  out.finalized = true;
  out.handled = true;
  out.marionFinal = true;
  out.awaitingMarion = false;
  out.suppressUserFacingReply = false;
  out.emit = true;
  out.blocked = false;
  out.reply = safeReply;
  out.text = safeReply;
  out.short = safeReply;
  out.answer = safeReply;
  out.output = safeReply;
  out.response = safeReply;
  out.displayReply = safeReply;
  out.spokenText = spokenText;
  out.textSpeak = spokenText;
  out.textDisplay = safeReply;
  out.payload = {
    ...safeObj(out.payload),
    reply: safeReply,
    text: safeReply,
    message: safeReply,
    answer: safeReply,
    output: safeReply,
    response: safeReply,
    displayReply: safeReply,
    spokenText,
    textSpeak: spokenText,
    textDisplay: safeReply,
    final: true,
    finalized: true,
    handled: true,
    emit: true,
    blocked: false,
    suppressUserFacingReply: false,
    awaitingMarion: false
  };
  out.finalEnvelope = {
    ...safeObj(out.finalEnvelope),
    reply: safeReply,
    text: safeReply,
    displayReply: safeReply,
    spokenText,
    final: true,
    finalized: true,
    marionFinal: true,
    handled: true,
    authority: "marionFinalEnvelope",
    contractVersion: "nyx.marion.final/1.0",
    qualityPass: true
  };
  const publicVoiceSurface = buildPublicVoiceSurfaceFromReply(safeReply, safeObj(out.playback).route || safeObj(out.payload).voiceRoute || out.voiceRoute || "");
  out.speech = { ...publicVoiceSurface.speech };
  out.playback = { ...publicVoiceSurface.playback };
  out.tts = { ...publicVoiceSurface.tts };
  out.meta = {
    ...safeObj(out.meta),
    ...safeObj(metaPatch),
    lastMilePrimitiveReplyGuard: true,
    noUserFacingDiagnostics: true
  };
  return out;
}

function cleanReplyForUser(v) {
  let t = stripPublicReplyScaffold(v);
  if (!t || isPrimitivePlaceholderReplyValue(v) || isPrimitivePlaceholderReplyValue(t)) return "";
  if (isInvalidPublicReplyRecoveryText(t)) return "";
  if (isLoopRecoveryCarryText(t)) return "";
  if (isInternalMarionBlockerReply(t)) return "";
  t = stripUserVisibleDebugLeak(t);
  if (!t) return "";
  t = stripPublicReplyScaffold(t);
  t = t.replace(/\bthe backend hit a rough patch,?\s*but i can keep this steady without bouncing you into a menu\.?/ig, "Tell me what you need help with, and I’ll keep it focused.");
  t = t.replace(/\bthe backend hit a rough patch,?\s*but i can keep this steady without dropping you into a menu\.?/ig, "Tell me what you need help with, and I’ll keep it focused.");
  t = t.replace(/\b(bouncing|dropping)\s+you\s+into\s+a\s+menu\b/ig, "shifting gears too quickly");
  t = t.replace(/\bbackend\b/ig, "system");
  t = stripPublicReplyScaffold(t);
  t = t.replace(/\s+([,.!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
  if (isThinLastMileContinuationReply(t)) return "";
  return hasUserVisibleDebugLeak(t) || isPublicWorkflowStateLeak(t) || isPublicControlPolicyLeak(t) || isPrimitivePlaceholderReplyValue(t) ? "" : t;
}

function isPublicControlPolicyLeak(value) {
  const text = cleanText(value).replace(/[.!?]+$/g, "").toLowerCase();
  if (!text) return false;
  return /\bsame prompt,?\s*new requirement\b/i.test(text) ||
    /\banswer with one new fact,?\s*one action,?\s*or one test\b/i.test(text) ||
    /\bif voice and text return different answers\b/i.test(text) ||
    /\bpreserve intent and regenerate\b/i.test(text) ||
    /\bsame normalized text\b/i.test(text) ||
    /\bregenerate from the same normalized text\b/i.test(text);
}

function buildLingoSentinelPublicAnswerFromPacket(packet) {
  const src = safeObj(packet);
  const payload = safeObj(src.payload);
  const finalEnvelope = safeObj(src.finalEnvelope);
  const input = safeObj(src.input);
  const body = safeObj(src.body);
  const meta = safeObj(src.meta);
  const normalized = safeObj(src.normalized || src.norm);
  const source = collectCurrentUserIntentText(src);
  const hasLingoSentinelSubject = /\b(?:lingosentinel|lingo\s*link|language\s*sphere|languagesphere)\b/i.test(source);
  const hasLingoSentinelAsk = /\b(?:explain|what|does|do|clear\s+sentence|one\s+sentence|multilingual|language|languages|explica|explicame|explícame|explique|que\s+hace|qué\s+hace|que\s+fait|frase\s+clara|phrase\s+claire|idioma|idiomas|langue|langues|multilingue|multilingüe|traduccion|traducción|traduction|traduire)\b/i.test(source);
  if (hasLingoSentinelSubject && hasLingoSentinelAsk) {
    return "LingoSentinel helps Nyx understand different languages while Marion preserves meaning, tone, and final response quality.";
  }
  return "";
}

function isGenericGreetingStatusReply(value) {
  const text = cleanText(value).replace(/[.!?]+$/g, "").toLowerCase();
  if (!text) return false;
  return /^hello\.?\s*i[’']?m ready when you are\.?\s*what do you need$/i.test(text) ||
    /^hi\.?\s*i[’']?m nyx\.?\s*it[’']?s good to see you\.?\s*what would you like to work on$/i.test(text) ||
    /^i[’']?m here and ready\.?\s*what are we getting into$/i.test(text) ||
    /^ready when you are\b/i.test(text);
}



const PUBLIC_RESPONSE_INTERNAL_KEY_PATTERN = /^(?:meta|diagnostics?|runtimeTelemetry|finalRuntimeTelemetry|loggingSpine|packetPreclassification|packetStateBridge|languageSphereTelemetry|languageSphereFallback|multilingualFinalEnvelope|marionRouting|marionIntent|ctx|ui|directives|sessionPatch|memoryPatch|cog|bridge|audioContract|transportOnly|marionTransportOnly|packetPrediction|compatibilityRoute|compatibilityHealth|raw|debug|stack|errorStack)$/i;
const PUBLIC_RESPONSE_INTERNAL_TEXT_PATTERN = /\b(?:i stopped a repeated response before it could render again|current turn is preserved|fresh Marion final|wait for a fresh\s+Marion\s+final|replaying the same fallback|I caught the repeated Nyx\/Marion reply|Index\.js transport[- ]only|transport only|loop is being contained at the bridge layer|MarionBridge should accept only one clean Marion final|response[- ]authority problem|languageSphereTelemetry|languageSphereFallback|runtimeTelemetry|loggingSpine|packetPrediction|transportOnly|marionTransportOnly|audioContract|finalEnvelopeTrusted|replyAuthority|semanticAuthority|diagnostics?|stack trace|TypeError|ReferenceError|SyntaxError|same prompt,?\s*new requirement|answer with one new fact|if voice and text return different answers|preserve intent and regenerate|same normalized text)\b/i;

function publicSafePrimitive(value) {
  if (typeof value === "string") {
    const cleaned = cleanText(value);
    return isPrimitivePlaceholderReplyValue(cleaned) || PUBLIC_RESPONSE_INTERNAL_TEXT_PATTERN.test(cleaned) ? undefined : cleaned;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return undefined;
}

function scrubPublicObject(value, depth = 0) {
  if (depth > 5) return undefined;
  if (Array.isArray(value)) {
    const arr = value.map((item) => scrubPublicObject(item, depth + 1)).filter((item) => item !== undefined);
    return arr.length ? arr : undefined;
  }
  if (!isObj(value)) return publicSafePrimitive(value);
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (PUBLIC_RESPONSE_INTERNAL_KEY_PATTERN.test(key)) continue;
    if (/languageSphere/i.test(key) && key !== "contextPassport" && key !== "languageSpherePublic") continue;
    const cleaned = scrubPublicObject(item, depth + 1);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanPublicVoiceRoute(value) {
  const route = cleanText(value);
  if (!route) return "";
  if (/^https?:\/\//i.test(route) || route.startsWith("/")) return route;
  return "";
}

function buildPublicContextPassportFromPacket(packet) {
  const src = safeObj(packet);
  const ls = isObj(src.languageSphere) ? src.languageSphere : {};
  const passport = isObj(src.contextPassport) ? src.contextPassport : (isObj(ls.contextPassport) ? ls.contextPassport : {});
  if (Object.keys(passport).length) return scrubPublicObject(passport) || undefined;
  if (Object.keys(ls).length) return buildNyxPublicContextPassportSurface(ls);
  return undefined;
}

function buildSuppressedPublicChatResponse(packet, reason = "public_reply_suppressed") {
  const src = safeObj(packet);
  const payload = safeObj(src.payload);
  const finalEnvelope = safeObj(src.finalEnvelope);
  return {
    ok: false,
    final: false,
    handled: true,
    awaitingMarion: true,
    suppressUserFacingReply: true,
    emit: false,
    blocked: true,
    reply: "",
    text: "",
    short: "",
    answer: "",
    output: "",
    response: "",
    displayReply: "",
    spokenText: "",
    textSpeak: "",
    textDisplay: "",
    source: "marion",
    authority: cleanText(finalEnvelope.authority || src.authority || "marion"),
    requestId: cleanText(src.requestId || payload.requestId || "") || undefined,
    sessionId: cleanText(src.sessionId || payload.sessionId || "") || undefined,
    traceId: cleanText(src.traceId || payload.traceId || "") || undefined,
    inputSource: cleanText(src.inputSource || payload.inputSource || "text") || "text",
    lane: cleanText(src.lane || src.laneId || src.sessionLane || payload.lane || "general") || "general",
    payload: { reply: "", text: "", message: "", answer: "", output: "", response: "", displayReply: "", spokenText: "", textSpeak: "", textDisplay: "", final: false, finalized: false, handled: true, emit: false, blocked: true, suppressUserFacingReply: true, awaitingMarion: true },
    finalEnvelope: { reply: "", text: "", displayReply: "", spokenText: "", final: false, marionFinal: false, handled: true, authority: cleanText(finalEnvelope.authority || src.authority || "marion"), contractVersion: "nyx.packet.bridge/1.0" },
    meta: { publicReplySuppressed: true, reason: cleanText(reason), noUserFacingDiagnostics: true }
  };
}

function buildPublicChatResponse(packet, reply) {
  const src = safeObj(packet);
  const payload = safeObj(src.payload);
  const finalEnvelope = safeObj(src.finalEnvelope);
  const speechSrc = safeObj(src.speech);
  const playbackSrc = safeObj(src.playback);
  const ttsSrc = safeObj(src.tts);
  const lingoSentinelAnswer = buildLingoSentinelPublicAnswerFromPacket(src);

  let safeReply = cleanReplyForUser(
    reply ||
    src.displayReply ||
    src.reply ||
    src.response ||
    src.text ||
    src.answer ||
    payload.displayReply ||
    payload.reply ||
    finalEnvelope.displayReply ||
    finalEnvelope.reply ||
    ""
  );

  // PUBLIC-FINAL-PROJECTION-HARDLOCK:
  // The /api/chat public response must never expose runtime/advisory objects
  // such as contextPassport, speech, playback, tts, diagnostics, telemetry, or
  // bridge/composer envelopes as top-level public fields. The browser-facing
  // contract is one clean final answer plus primitive route metadata only.
  // Internal voice/context objects can still exist upstream; they are collapsed
  // here into safe primitive text fields so PowerShell, Webflow, and the widget
  // cannot render the runtime envelope as the user-facing answer.
  if (lingoSentinelAnswer && (!safeReply || isGenericGreetingStatusReply(safeReply))) safeReply = lingoSentinelAnswer;
  if (!safeReply) safeReply = lingoSentinelAnswer;
  if (!safeReply) safeReply = buildLastMileRecoveryReply(src);
  if (!safeReply || isPrimitivePlaceholderReplyValue(safeReply)) {
    return buildSuppressedPublicChatResponse(src, "blank_or_unsafe_public_reply");
  }

  const spokenText = cleanVoiceTextForPublicReply(
    src.spokenText ||
    src.textSpeak ||
    speechSrc.textSpeak ||
    speechSrc.spokenText ||
    payload.spokenText ||
    safeReply,
    safeReply
  );

  const textSpeak = cleanVoiceTextForPublicReply(
    src.textSpeak ||
    speechSrc.textSpeak ||
    payload.textSpeak ||
    spokenText ||
    safeReply,
    safeReply
  );

  const textDisplay = cleanVoiceTextForPublicReply(
    src.textDisplay ||
    speechSrc.textDisplay ||
    payload.textDisplay ||
    safeReply,
    safeReply
  );

  const marionFinal = src.marionFinal === true || finalEnvelope.marionFinal === true || payload.marionFinal === true;
  const authority = marionFinal ? "marionFinalEnvelope" : cleanText(finalEnvelope.authority || src.authority || "marion");
  const requestId = cleanText(src.requestId || payload.requestId || "") || undefined;
  const sessionId = cleanText(src.sessionId || payload.sessionId || "") || undefined;
  const traceId = cleanText(src.traceId || payload.traceId || "") || undefined;
  const inputSource = cleanText(src.inputSource || payload.inputSource || "text") || "text";
  const lane = cleanText(src.lane || src.laneId || src.sessionLane || payload.lane || "general") || "general";
  const voiceRoute = cleanPublicVoiceRoute(src.voiceRoute || payload.voiceRoute || playbackSrc.route || "");
  const publicVoiceSurface = buildPublicVoiceSurfaceFromReply(safeReply, voiceRoute);

  return {
    ok: src.ok !== false,
    final: true,
    marionFinal,
    handled: true,
    awaitingMarion: false,
    suppressUserFacingReply: false,
    emit: true,
    blocked: false,

    // Public answer aliases retained for widget compatibility.
    reply: safeReply,
    message: safeReply,
    text: safeReply,
    short: safeReply,
    answer: safeReply,
    output: safeReply,
    response: safeReply,
    displayReply: safeReply,
    textDisplay,
    spokenText,
    textSpeak,

    source: "marion",
    authority,
    requestId,
    sessionId,
    traceId,
    inputSource,
    lane,
    voiceRoute: voiceRoute || undefined,

    // Keep compatibility envelopes, but only with public-safe scalar answer
    // fields. Do not pass through source runtime objects.
    payload: {
      reply: safeReply,
      message: safeReply,
      text: safeReply,
      answer: safeReply,
      output: safeReply,
      response: safeReply,
      displayReply: safeReply,
      textDisplay,
      spokenText,
      textSpeak,
      final: true,
      finalized: true,
      marionFinal,
      handled: true,
      emit: true,
      blocked: false,
      suppressUserFacingReply: false,
      awaitingMarion: false
    },
    finalEnvelope: {
      reply: safeReply,
      text: safeReply,
      displayReply: safeReply,
      spokenText,
      final: true,
      marionFinal,
      handled: true,
      authority,
      contractVersion: marionFinal ? "nyx.marion.final/1.0" : "nyx.packet.bridge/1.0"
    },

    publicSurface: {
      version: "nyx.index.publicFinalProjection/1.1-tts-contamination-hardlock",
      clean: true,
      runtimeEnvelopeSuppressed: true,
      noUserFacingDiagnostics: true
    }
  };
}

function applyPublicReplyHygieneToResponse(packet) {
  if (!isObj(packet)) return { ok: false, final: false, reply: "", text: "" };
  const reply = cleanReplyForUser(
    packet.displayReply ||
    packet.reply ||
    packet.response ||
    packet.text ||
    packet.answer ||
    safeObj(packet.payload).displayReply ||
    safeObj(packet.payload).reply ||
    safeObj(packet.finalEnvelope).displayReply ||
    safeObj(packet.finalEnvelope).reply ||
    ""
  );
  if (reply) return buildPublicChatResponse(packet, reply);
  // Progression/pass-fail/validation fallback emission is intentionally disabled
  // in index.js; only Marion may author that lane.
  const lingoSentinelAnswer = buildLingoSentinelPublicAnswerFromPacket(packet);
  if (lingoSentinelAnswer) return buildPublicChatResponse(packet, lingoSentinelAnswer);
  const lastMileRecovery = buildLastMileRecoveryReply(packet);
  if (lastMileRecovery) return buildPublicChatResponse(forcePublicReply(packet, lastMileRecovery, { primitivePublicReplyRecovered: true }), lastMileRecovery);
  return {
    ok: false,
    final: false,
    handled: true,
    awaitingMarion: true,
    suppressUserFacingReply: true,
    emit: false,
    blocked: true,
    reply: "",
    text: "",
    answer: "",
    output: "",
    response: "",
    displayReply: "",
    payload: { reply: "", text: "", message: "", final: false, awaitingMarion: true, suppressUserFacingReply: true, emit: false, blocked: true },
    finalEnvelope: { reply: "", text: "", displayReply: "", final: false, marionFinal: false, handled: true }
  };
}

function replyHash(v) {
  const s = cleanText(v).toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return String(h);
}

const INTERNAL_MARION_BLOCKER_REPLY_PATTERNS = [
  /marion\s+input\s+required\s+before\s+reply\s+emission/i,
  /bridge\s+rejected\s+malformed\s+marion\s+output\s+before\s+nyx\s+handoff/i,
  /reply\s+emission/i,
  /bridge_rejected/i,
  /packet_invalid/i,
  /contract_invalid/i,
  /response path was interrupted/i,
  /marion completed the final reply/i,
  /turn non[- ]emotional/i,
  /final[- ]envelope path/i,
  /same prompt,?\s*new requirement/i,
  /answer with one new fact,?\s*one action,?\s*or one test/i,
  /if voice and text return different answers/i,
  /preserve intent and regenerate/i,
  /same normalized text/i,
  /i stopped a repeated response before it could render again/i,
  /current turn is preserved/i,
  /fresh Marion final/i,
  /wait for a fresh\s+Marion\s+final/i,
  /replaying the same fallback/i,
  /i caught the repeated Nyx\/Marion reply/i,
  /Index\.js transport[- ]only/i,
  /loop is being contained at the bridge layer/i,
  /MarionBridge should accept only one clean Marion final/i,
  /response[- ]authority problem/i
];

const BLOCKED_LOOPING_SUPPORT_REPLY = "i am here with you, and i can stay with this clearly.";
const REQUIRED_CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";
const MARION_FINAL_SIGNATURE_PREFIX = "MARION::FINAL::";
const REQUIRED_MARION_FINAL_MARKERS = [
  REQUIRED_CHAT_ENGINE_SIGNATURE,
  "marionBridge v7.",
  "composeMarionResponse v3.",
  "nyx.marion.final/1.0",
  "nyx.marion.stateSpine/1.7",
  "nyx.marion.stateSpine/1.6"
];
const CHAT_LOOP_PHRASE_PATTERNS = [
  /^i am here with you,? and i can stay with this clearly$/i,
  /^i['’]?m here with you,? and i can stay with this clearly$/i,
  /\bi am here with you\b.*\bstay with this clearly\b/i,
  /\bi['’]?m here with you\b.*\bstay with this clearly\b/i,
  /\bi am here with you\b.*\bone step at a time\b/i,
  /\bwe can take this one step at a time\b/i,
  /\bi can stay with this clearly\b/i,
  /\bsend the exact file, route, or response you want checked next\b/i,
  /\bnyx is connected\. what would you like to do next\b/i,
  /\bi need one specific command to continue clearly\b/i,
  /\bsend a specific command\b/i,
  /\bpress reset to clear this session\b/i,
  /\bready\. send your next message\b/i,
  /\bready\. send the next instruction\b/i,
  /\bready\. send the specific file\b/i,
  /\bi['’]?m here\.?\s*what['’]?s next\b/i,
  /\bi am here\.?\s*what['’]?s next\b/i,
  /\bi['’]?m online\.?\s*what['’]?s next\b/i,
  /\bi am online\.?\s*what['’]?s next\b/i,
  /\bonline\.?\s*what['’]?s next\b/i,
  /\bwhat['’]?s next\b/i,
  /\bare you asking about the interface,?\s*(?:the backend|radio|media|roku|business strategy|system technical work|or a support issue)/i,
  /\bwhich area should i route this to:\s*interface,?\s*backend,?\s*media\/roku,?\s*business strategy,?\s*or support/i,
  /\bhi\s*[—-]\s*i['’]?m here,? fully online\b/i,
  /\bfully online\. what are we working on\b/i,
  /\bhi\s*[—-]\s*i[’']?m here,?\s*fully online\.?\s*what are we working on\??\b/i,
  /\bwhat are we working on\??$/i,
  /\bresponse path was interrupted before marion completed the final reply\b/i,
  /\bkeeping the turn non[- ]emotional\b/i,
  /\brouting it back through the final[- ]envelope path\b/i
];

function normalizedReplyKey(value) {
  return lower(cleanText(value || "")).replace(/\s+/g, " ").replace(/[.!?]+$/g, "").trim();
}

function isBlockedLoopingSupportReply(value) {
  const key = normalizedReplyKey(value);
  if (!key) return false;
  if (key === BLOCKED_LOOPING_SUPPORT_REPLY) return true;
  if (isPublicWorkflowStateLeak(value)) return true;
  return CHAT_LOOP_PHRASE_PATTERNS.some((rx) => rx.test(key));
}

function isFreshMarionSignatureString(value) {
  const s = cleanText(value || "");
  if (!s) return false;

  // V30: do not treat the ChatEngine coordinator marker by itself as a Marion final.
  // The stale support loop was able to survive because wrapper/meta fields could satisfy
  // the old "fresh" test without proving a real Marion final handoff.
  const hasStateSpine = /nyx\.marion\.stateSpine\/[0-9.]+/i.test(s);
  const hasBridgeOrComposer = /marionBridge v\d|composeMarionResponse v\d/i.test(s);
  const hasIndexFinalizer = /index\.js v\d/i.test(s);
  if (s.includes(MARION_FINAL_SIGNATURE_PREFIX) && s.includes(REQUIRED_CHAT_ENGINE_SIGNATURE) && hasStateSpine) return true;
  return hasStateSpine && (hasBridgeOrComposer || hasIndexFinalizer);
}

function objectContainsFreshMarionSignature(value, depth) {
  if (depth > 8 || value == null) return false;
  if (typeof value === "string") return isFreshMarionSignatureString(value);
  if (Array.isArray(value)) return value.some((item) => objectContainsFreshMarionSignature(item, depth + 1));
  if (isObj(value)) {
    if (isFreshMarionSignatureString(value.signature || value.marionFinalSignature || value.finalSignature || value.version || value.composerVersion || value.bridgeVersion)) return true;
    return Object.keys(value).some((key) => objectContainsFreshMarionSignature(value[key], depth + 1));
  }
  return false;
}

function hasFreshMarionFinalEnvelope(value) {
  if (marionFinalEnvelopeMod && typeof marionFinalEnvelopeMod.isMarionFinalEnvelope === "function") {
    try {
      if (marionFinalEnvelopeMod.isMarionFinalEnvelope(value)) return true;
      if (isObj(value) && marionFinalEnvelopeMod.isMarionFinalEnvelope(value.finalEnvelope)) return true;
    } catch (_) {}
  }
  const src = isObj(value) ? value : {};
  const packet = isObj(src.packet) ? src.packet : {};
  const packetMeta = isObj(packet.meta) ? packet.meta : {};
  const synthesis = isObj(packet.synthesis) ? packet.synthesis : {};
  const meta = isObj(src.meta) ? src.meta : {};
  const diagnostics = isObj(src.diagnostics) ? src.diagnostics : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const finalEnvelope = isObj(src.finalEnvelope) ? src.finalEnvelope : {};
  const bridge = isObj(src.bridge) ? src.bridge : {};
  const result = isObj(src.result) ? src.result : {};
  const resultMeta = isObj(result.meta) ? result.meta : {};
  const resultPayload = isObj(result.payload) ? result.payload : {};
  const resultPacket = isObj(result.packet) ? result.packet : {};
  const resultPacketMeta = isObj(resultPacket.meta) ? resultPacket.meta : {};

  const freshSignature = objectContainsFreshMarionSignature(src, 0);
  const finalish = !!(
    src.final === true ||
    src.marionFinal === true ||
    src.handled === true ||
    src.marionHandled === true ||
    src.usedBridge === true ||
    src.hardlockCompatible === true ||
    meta.final === true ||
    meta.marionFinal === true ||
    meta.handled === true ||
    meta.hardlockCompatible === true ||
    packet.final === true ||
    packet.marionFinal === true ||
    packet.handled === true ||
    packetMeta.final === true ||
    packetMeta.marionFinal === true ||
    packetMeta.handled === true ||
    packetMeta.hardlockCompatible === true ||
    synthesis.final === true ||
    synthesis.marionFinal === true ||
    payload.final === true ||
    payload.marionFinal === true ||
    payload.handled === true ||
    payload.hardlockCompatible === true ||
    finalEnvelope.final === true ||
    finalEnvelope.marionFinal === true ||
    finalEnvelope.handled === true ||
    !!cleanText(finalEnvelope.reply || finalEnvelope.text || finalEnvelope.spokenText || "") ||
    bridge.final === true ||
    bridge.marionFinal === true ||
    bridge.handled === true ||
    result.final === true ||
    result.marionFinal === true ||
    result.handled === true ||
    result.marionHandled === true ||
    resultMeta.final === true ||
    resultMeta.marionFinal === true ||
    resultMeta.handled === true ||
    resultMeta.hardlockCompatible === true ||
    resultPayload.final === true ||
    resultPayload.marionFinal === true ||
    resultPayload.handled === true ||
    resultPacket.final === true ||
    resultPacket.marionFinal === true ||
    resultPacket.handled === true ||
    resultPacketMeta.final === true ||
    resultPacketMeta.marionFinal === true ||
    resultPacketMeta.handled === true
  );

  if (finalish && freshSignature) return true;

  // Compatibility guard: some bridge wrappers expose the Marion final signature
  // at the wrapper/result layer before mirroring final flags to the wrapper.
  // Accept only successful bridge-shaped packets with a valid Marion final signature.
  if (freshSignature && src.ok !== false && (src.usedBridge === true || isObj(src.result) || isObj(src.packet) || isObj(src.payload) || isObj(src.meta))) {
    return true;
  }

  return false;
}

function buildLoopReplyBlockedReplacement(norm, authority) {
  // Transport-only hardlock:
  // index.js must not invent a replacement reply. Returning a blank non-final
  // contract forces the fault back to MarionBridge / MarionLoopGuard, where
  // recovery belongs, and prevents false-final packets from reaching Nyx.
  return {
    ok: false,
    final: false,
    finalized: false,
    handled: true,
    marionFinal: false,
    awaitingMarion: true,
    suppressUserFacingReply: true,
    emit: false,
    blocked: true,
    recoveryInjected: false,
    reply: "",
    text: "",
    answer: "",
    output: "",
    payload: {
      reply: "",
      text: "",
      message: "",
      spokenText: "",
      final: false,
      marionFinal: false,
      awaitingMarion: true,
      suppressUserFacingReply: true,
      emit: false,
      blocked: true,
      loopReplyBlocked: true,
      recoveryInjected: false
    },
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      indexRole: "transport_only",
      transportOnly: true,
      noSupportDecision: true,
      noEmotionDecision: true,
      replyAuthority: "none",
      blockedAuthority: cleanText(authority || "unknown"),
      loopReplyBlocked: true,
      recoveryInjected: false,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      hardlockVersion: "CHAT-LOOP-PHRASE-HARDLOCK/v2.18.5sb",
      correction: "rogue_fallback_purged"
    },
    diagnostics: {
      loopReplyBlocked: true,
      recoveryInjected: false,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      hardlockVersion: "CHAT-LOOP-PHRASE-HARDLOCK/v2.18.5sb",
      reason: "index_transport_only_refused_to_invent_recovery",
      failureSignature: INDEX_FAILURE_SIGNATURES.LOOP_GUARD_SUPPRESSED
    }
  };
}

const MARION_DOMAIN_BY_INTENT = Object.freeze({
  technical_debug: "technical",
  emotional_support: "emotional",
  business_strategy: "business",
  music_query: "music",
  news_query: "news",
  roku_query: "roku",
  identity_or_memory: "memory",
  domain_question: "general_reasoning",
  simple_chat: "general"
});

const MARION_INTENT_ALIAS = Object.freeze({
  technical: "technical_debug",
  debug: "technical_debug",
  autopsy: "technical_debug",
  emotional: "emotional_support",
  support: "emotional_support",
  business: "business_strategy",
  strategy: "business_strategy",
  music: "music_query",
  news: "news_query",
  newscanada: "news_query",
  roku: "roku_query",
  memory: "identity_or_memory",
  continuity: "identity_or_memory",
  general: "domain_question",
  chat: "simple_chat"
});

function canonicalMarionIntent(value) {
  const raw = lower(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!raw) return "simple_chat";
  return MARION_INTENT_ALIAS[raw] || raw;
}


function canonicalTechnicalTargetFromText(text = "") {
  const t = cleanText(text || "");
  const mk = (targetKey, targetName, targetFile, targetPath, layer) => ({
    version: "nyx.marion.technicalTargetLock/1.2",
    targetKey,
    targetName,
    targetFile,
    targetPath,
    layer: cleanText(layer || "runtime") || "runtime",
    explicit: true,
    source: "current_user_text",
    locked: true,
    technicalFollowUpLock: true,
    blockScheduleInterception: true,
    outerSchedulerBypass: true
  });
  if (/\b(chat\s*engine|chatengine)\b/i.test(t)) return mk("chatEngine", "ChatEngine", "chatEngine.js", "Utils/chatEngine.js", "transport");
  if (/\b(marion\s*bridge|marionbridge)\b/i.test(t)) return mk("marionBridge", "MarionBridge", "marionBridge.js", "Data/marion/runtime/marionBridge.js", "bridge");
  if (/\b(compose\s*marion\s*response|composemarionresponse|composer)\b/i.test(t)) return mk("composeMarionResponse", "ComposeMarionResponse", "composeMarionResponse.js", "Data/marion/runtime/composeMarionResponse.js", "composer");
  if (/\b(state\s*spine|statespine|state-spine)\b/i.test(t)) return mk("stateSpine", "StateSpine", "stateSpine.js", "Utils/stateSpine.js", "state");
  if (/\b(marion\s*intent\s*router|intent\s*router|marionintentrouter)\b/i.test(t)) return mk("marionIntentRouter", "MarionIntentRouter", "marionIntentRouter.js", "Data/marion/runtime/marionIntentRouter.js", "router");
  if (/\b(command\s*normalizer|marion\s*command\s*normalizer|marioncommandnormalizer)\b/i.test(t)) return mk("marionCommandNormalizer", "MarionCommandNormalizer", "marionCommandNormalizer.js", "Data/marion/runtime/marionCommandNormalizer.js", "normalizer");
  if (/\b(domain\s*router|domainrouter)\b/i.test(t)) return mk("domainRouter", "DomainRouter", "domainRouter.js", "Utils/domainRouter.js", "router");
  if (/\b(domain\s*registry|marion\s*domain\s*registry|mariondomainregistry)\b/i.test(t)) return mk("marionDomainRegistry", "MarionDomainRegistry", "marionDomainRegistry.js", "Data/marion/runtime/marionDomainRegistry.js", "registry");
  if (/\b(index\.js|index\s*js|server\s*route|api\/chat|\/api\/chat)\b/i.test(t)) return mk("index", "index.js", "index.js", "index.js", "outer_transport");
  return {};
}

function isTechnicalFollowUpIntent(text = "") {
  const t = cleanText(text || "");
  const target = canonicalTechnicalTargetFromText(t);
  if (!target || !target.targetPath) return false;
  return /\b(now|next|then|also|again|from there|after that|one more)\b/i.test(t) || /\b(full autopsy|autopsy|audit|line[-\s]?by[-\s]?line|critical fix|critical fixes|check|inspect|review|patch|harden|run|fix|update)\b/i.test(t);
}

function applyTechnicalSchedulerBypass(intentPacket, text) {
  const target = canonicalTechnicalTargetFromText(text);
  const locked = !!(target && target.targetPath && isTechnicalFollowUpIntent(text));
  if (!locked) return isObj(intentPacket) ? intentPacket : {};
  return {
    ...(isObj(intentPacket) ? intentPacket : {}),
    activate: true,
    intent: "technical_debug",
    type: "technical_debug",
    domain: "technical",
    routeDomain: "technical",
    confidence: 0.98,
    reason: "outer_scheduler_bypass_technical_target_lock",
    source: "index_outer_scheduler_bypass",
    triggerSource: "index_outer_scheduler_bypass",
    technicalTargetLock: target,
    technicalFollowUpLock: true,
    blockScheduleInterception: true,
    outerSchedulerBypass: true
  };
}

function normalizeIncomingMarionIntent(raw, fallbackText) {
  const src = isObj(raw) ? raw : {};
  const intent = canonicalMarionIntent(src.intent || src.type || "");
  const text = lower(fallbackText || "");
  const technicalTargetLock = canonicalTechnicalTargetFromText(fallbackText || "");
  const technicalFollowUpLock = isTechnicalFollowUpIntent(fallbackText || "");
  if (technicalFollowUpLock && technicalTargetLock && technicalTargetLock.targetPath) {
    return {
      activate: true,
      intent: "technical_debug",
      confidence: 0.98,
      reason: "outer_scheduler_bypass_technical_target_lock",
      source: "index_outer_scheduler_bypass",
      triggerSource: "index_outer_scheduler_bypass",
      domain: "technical",
      routeDomain: "technical",
      technicalTargetLock,
      technicalFollowUpLock: true,
      blockScheduleInterception: true,
      outerSchedulerBypass: true
    };
  }
  let inferred = intent;
  if (!inferred || inferred === "simple_chat") {
    if (/(autopsy|line.by.line|gap refinement|index\.js|packet normalizer|route|endpoint|diagnostic|debug|stack|error|fix)/i.test(text)) inferred = "technical_debug";
    else if (/(sad|stressed|overwhelmed|depressed|anxious|hurt|alone|frustrated|panic|grief)/i.test(text)) inferred = "emotional_support";
    else if (/(pricing|sponsor|media kit|monetize|pitch|funding|investor|sales|proposal|revenue)/i.test(text)) inferred = "business_strategy";
    else if (/(top\s*10|song|artist|album|chart|music|radio|playlist)/i.test(text)) inferred = "music_query";
    else if (/(news|story|headline|article|rss|newscanada|for your life)/i.test(text)) inferred = "news_query";
    else if (/(roku|tv app|channel|linear tv|streaming)/i.test(text)) inferred = "roku_query";
    else if (/(remember|last time|continue|state spine|memory|emotional pinpoints)/i.test(text)) inferred = "identity_or_memory";
    else if (String(fallbackText || "").length > 180 || /\?/.test(String(fallbackText || ""))) inferred = "domain_question";
    else inferred = "simple_chat";
  }
  const activate = typeof src.activate === "boolean" ? src.activate : inferred !== "simple_chat";
  const n = Number(src.confidence);
  const confidence = Number.isFinite(n) ? clamp(n, 0, 1) : (activate ? 0.66 : 0.4);
  const domain = cleanText(src.domain || src.routeDomain || MARION_DOMAIN_BY_INTENT[inferred] || "general") || "general";
  return {
    activate,
    intent: inferred,
    confidence,
    reason: cleanText(src.reason || src.source || (isObj(raw) ? "widget_trigger" : "index_inference")) || "index_inference",
    source: cleanText(src.source || src.triggerSource || (isObj(raw) ? "widget" : "index")) || "index",
    triggerSource: cleanText(src.triggerSource || src.source || (isObj(raw) ? "widget" : "index")) || "index",
    domain,
    routeDomain: domain
  };
}

function buildMarionIntentRouting(intentPacket, lane) {
  const mi = isObj(intentPacket) ? intentPacket : normalizeIncomingMarionIntent(null, "");
  const domain = cleanText(mi.domain || MARION_DOMAIN_BY_INTENT[mi.intent] || "general") || "general";
  const mode =
    domain === "technical" ? "autopsy" :
    domain === "business" ? "commercial" :
    domain === "emotional" ? "supportive_reasoning" :
    domain === "memory" ? "continuity" :
    domain === "music" || domain === "news" ? "domain_retrieval" :
    domain === "roku" ? "platform" :
    "balanced";
  const depth =
    domain === "technical" ? "forensic" :
    domain === "emotional" || domain === "memory" ? "high" :
    domain === "business" ? "strategic" :
    "balanced";
  return {
    domain,
    intent: mi.intent || "simple_chat",
    lane: cleanText(lane || "general") || "general",
    mode,
    depth,
    useDomainKnowledge: domain !== "general",
    useMemory: domain === "memory" || mi.intent === "identity_or_memory",
    triggerSource: mi.triggerSource || mi.source || "index"
  };
}

function routeMarionIntentThroughRuntime(intentPacket, lane, text) {
  const normalized = isObj(intentPacket) ? intentPacket : normalizeIncomingMarionIntent(null, text || "");
  if (marionIntentRouterMod && typeof marionIntentRouterMod.routeMarionIntent === "function") {
    try {
      const routed = marionIntentRouterMod.routeMarionIntent({
        text: cleanText(text || ""),
        lane: cleanText(lane || "general") || "general",
        marionIntent: normalized,
        session: { lane: cleanText(lane || "general") || "general" }
      });
      if (isObj(routed)) {
        return {
          marionIntent: isObj(routed.marionIntent) ? routed.marionIntent : normalized,
          routing: isObj(routed.routing) ? routed.routing : buildMarionIntentRouting(normalized, lane),
          meta: isObj(routed.meta) ? routed.meta : {}
        };
      }
    } catch (err) {
      console.log("[Sandblast][marionIntentRouter:error]", cleanText(err && (err.message || err) || "router_failed"));
    }
  }
  return {
    marionIntent: normalized,
    routing: buildMarionIntentRouting(normalized, lane),
    meta: { triggerSource: normalized.triggerSource || normalized.source || "index_fallback" }
  };
}

function isInternalMarionBlockerReply(value) {
  const text = lower(cleanText(value || "")).replace(/\s+/g, " ").trim();
  if (!text) return false;
  return INTERNAL_MARION_BLOCKER_REPLY_PATTERNS.some((rx) => rx.test(text));
}

function isConversationDiagnosticFallbackReply(value) {
  const raw = cleanText(value || "");
  const text = lower(raw).replace(/\s+/g, " ").trim();
  if (!text) return false;
  if (hasUserVisibleDebugLeak(raw)) return true;
  return !!(
    isInternalMarionBlockerReply(text) ||
    /response path was interrupted before marion completed the final reply/i.test(text) ||
    /keeping the turn non[- ]emotional/i.test(text) ||
    /routing it back through the final[- ]envelope path/i.test(text) ||
    /conversation_authority_empty|marion_final_envelope_missing|awaiting_marion/i.test(text)
  );
}


function isGreetingOnlyTurn(text) {
  const t = lower(cleanText(text || "")).replace(/[.!?]+$/g, "").trim();
  if (!t) return false;
  return /^(hi|hello|hey|yo|hiya|good morning|good afternoon|good evening)(\s+(nyx|nick|nicks|nix|mix|mike|vera|mac))?$/.test(t) || /^(nyx|nick|nicks|nix|mix|mike)$/.test(t);
}


const NYX_MARION_LOOP_GOVERNOR_VERSION = "nyx.marion.loopGovernor.capacitySeparation/1.0";
function isCognitiveLoadSeparationRequestText(value = "") {
  const text = lower(value);
  return !!(text && /\b(marion|nyx|nix|nicks)\b/i.test(text) && /\b(too much|cognitive load|overload|separate responsibilities|responsibilit(?:y|ies)|compromised|lingosentinel|lingo sentinel|lingolink|aster|thalon|fallon|loop|looping)\b/i.test(text));
}
function buildCognitiveLoadSeparationPublicReply() {
  return "Your concern is valid: Marion should not carry every workload directly. The cleaner architecture is separation by responsibility: Nyx handles the public conversation, Marion keeps final authority and response arbitration, LingoSentinel handles language routing/adaptation as an advisory lane, Aster handles environmental observation as an advisory lane, and Thalon stays as strategic/ethical review. The fix is not to make Marion bigger; it is to make Marion the judge of final output while each subsystem does its own bounded job.";
}
function buildIndexLoopBreakReply(norm = {}, previousReply = "", authority = "", duplicateGate = {}) {
  const n = isObj(norm) ? norm : {};
  const source = [n.text, n.rawText, n.rawUserText, n.originalText, n.userText, n.message, safeObj(n.payload).userText, safeObj(n.payload).message].map(cleanText).filter(Boolean).join(" ");
  if (isCognitiveLoadSeparationRequestText(source)) return buildCognitiveLoadSeparationPublicReply();
  const explicitLoopQuestion = /\b(loop|looping|repeat|repeated|duplicate|fallback)\b/i.test(source) && /\b(nyx|nix|nicks|marion|bridge|composer|index|chat)\b/i.test(source);
  if (explicitLoopQuestion && isTechnicalDebugTurn(source, n)) {
    return "Nyx should not render recycled fallbacks. Keep Marion as the final-answer authority, reject duplicate generic replies after sanitization, and let the transport layer return silently until a clean final reply exists.";
  }
  const deterministic = buildDeterministicLastMilePublicReplyFromText(source);
  if (deterministic && !isBlockedLoopingSupportReply(deterministic) && !isConversationDiagnosticFallbackReply(deterministic) && !isInternalMarionBlockerReply(deterministic)) return deterministic;
  return "";
}

function buildIndexSafeTransportReply(norm, reason, extra) {
  const n = isObj(norm) ? norm : {};
  const text = cleanText(n.text || n.userText || n.rawUserText || n.originalText || "");

  // Index is transport/cohesion only. It may return a crisis-safe emergency notice,
  // and it may repair known deterministic mic/text parity asks at the last mile so
  // primitive values like false never become the public Nyx reply.
  if (isHighRiskSupportSignal(null, text)) {
    return "Your safety comes first. If you might hurt yourself or you are in immediate danger, contact emergency services now. In Canada or the United States, call or text 988.";
  }

  if (isCognitiveLoadSeparationRequestText(text)) return buildCognitiveLoadSeparationPublicReply();

  const recovery = buildLastMileRecoveryReply({ ...n, userText: text, rawUserText: cleanText(n.rawText || n.rawUserText || n.originalText || text), payload: { userText: text } });
  if (recovery) return recovery;

  return "";
}

function finalizeRenderableReply(reply, norm, authority, reason) {
  const cleaned = cleanReplyForUser(reply);
  if (cleaned && !isBlockedLoopingSupportReply(cleaned) && !isConversationDiagnosticFallbackReply(cleaned)) return cleaned;
  return buildIndexSafeTransportReply(norm, reason || authority || "reply_sanitized", { blockedReply: cleaned });
}

function buildConversationNonFinalPacket(norm, status, error, detail, extra) {
  const n = isObj(norm) ? norm : {};
  const lane = cleanText(n.lane || "general") || "general";
  const traceId = cleanText(n.traceId || makeTraceId("chat"));
  const err = cleanText(error || "conversation_authority_empty") || "conversation_authority_empty";
  const safeDetail = cleanText(detail || "Marion did not return a trusted final envelope.");
  const emergencyReply = isHighRiskSupportSignal(null, n.text || "") ? buildIndexSafeTransportReply(n, err, extra) : "";
  const canEmitEmergency = !!emergencyReply;
  const failureSignature = inferIndexFailureSignature({norm:n, selected:{}, marion:{}, reply:emergencyReply, canEmit:canEmitEmergency, error:err});
  const runtimeTelemetry = buildIndexRuntimeTelemetry({
    norm: n,
    selected: {},
    marion: {},
    reply: emergencyReply,
    authority: canEmitEmergency ? "index_crisis_safety" : "none",
    stage: canEmitEmergency ? "final" : "awaiting_marion",
    canEmit: canEmitEmergency,
    error: err
  });

  return {
    ok: canEmitEmergency,
    final: canEmitEmergency,
    finalized: canEmitEmergency,
    handled: true,
    marionFinal: false,
    awaitingMarion: !canEmitEmergency,
    suppressUserFacingReply: !canEmitEmergency,
    emit: canEmitEmergency,
    blocked: !canEmitEmergency,
    error: err,
    failureSignature,
    detail: safeDetail,
    runtimeTelemetry,
    reply: emergencyReply,
    text: emergencyReply,
    short: emergencyReply,
    output: emergencyReply,
    answer: emergencyReply,
    response: emergencyReply,
    finalEnvelope: {
      reply: emergencyReply,
      text: emergencyReply,
      displayReply: emergencyReply,
      spokenText: emergencyReply,
      final: canEmitEmergency,
      marionFinal: false,
      handled: true,
      authority: canEmitEmergency ? "index_crisis_safety" : "none",
      contractVersion: "nyx.marion.final/1.0"
    },
    payload: {
      reply: emergencyReply,
      text: emergencyReply,
      message: emergencyReply,
      spokenText: emergencyReply,
      final: canEmitEmergency,
      marionFinal: false,
      awaitingMarion: !canEmitEmergency,
      suppressUserFacingReply: !canEmitEmergency,
      emit: canEmitEmergency,
      blocked: !canEmitEmergency,
      error: err,
      failureSignature,
      runtimeTelemetry
    },
    speech: {
      enabled: canEmitEmergency,
      silent: !canEmitEmergency,
      silentAudio: !canEmitEmergency,
      text: emergencyReply,
      textDisplay: emergencyReply,
      textSpeak: emergencyReply,
      presenceProfile: canEmitEmergency ? "supportive" : "receptive",
      nyxStateHint: canEmitEmergency ? "supportive" : "receptive"
    },
    lane,
    laneId: lane,
    sessionLane: lane,
    marionIntent: n.marionIntent || undefined,
    marionRouting: n.marionRouting || undefined,
    traceId,
    requestId: makeTraceId("req"),
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      indexRole: "transport_only",
      transportOnly: true,
      noSupportDecision: !canEmitEmergency,
      noEmotionDecision: !canEmitEmergency,
      noHttp502: true,
      failureSignature,
      runtimeTelemetry,
      status: Number(status || 200),
      falseFinalPurged: true,
      replyAuthority: canEmitEmergency ? "index_crisis_safety" : "none",
      semanticAuthority: "marion_required",
      suppressUserFacingReply: !canEmitEmergency,
      emit: canEmitEmergency,
      blocked: !canEmitEmergency,
      ...(isObj(extra) ? extra : {})
    }
  };
}

function makeTraceId(prefix) {
  return `${prefix || "trace"}_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`;
}

function boolEnv(name, fallback) {
  const raw = lower(process.env[name]);
  if (!raw) return !!fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return !!fallback;
}

function parseOrigins(raw) {
  return uniq(
    cleanText(raw || "")
      .split(",")
      .map((s) => cleanText(s))
      .filter(Boolean)
  );
}

function sameHost(a, b) {
  try {
    return new URL(a).host === new URL(b).host;
  } catch (_) {
    return false;
  }
}

function getBackendPublicBase() {
  return cleanText(
    process.env.SB_BACKEND_PUBLIC_BASE_URL ||
    process.env.SANDBLAST_BACKEND_PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://sandblast-backend.onrender.com"
  ).replace(/\/$/, "");
}

function routeUrl(pathname) {
  const base = getBackendPublicBase();
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${p}`;
}

const CFG = {
  apiTokenHeader: lower(process.env.SB_WIDGET_TOKEN_HEADER || process.env.SBNYX_WIDGET_TOKEN_HEADER || "x-sb-widget-token"),
  apiToken: process.env.SB_WIDGET_TOKEN || process.env.SBNYX_WIDGET_TOKEN || process.env.SB_API_KEY || process.env.SANDBLAST_API_KEY || process.env.CHAT_API_KEY || process.env.NYX_API_KEY || process.env.WIDGET_API_KEY || "",
  requireVoiceRouteToken: boolEnv("SB_REQUIRE_VOICE_ROUTE_TOKEN", false),
  voiceRouteEnabled: boolEnv("SB_VOICE_ROUTE_ENABLED", true),
  preserveMixerVoice: boolEnv("SB_PRESERVE_MIXER_VOICE", true),
  corsAllowCredentials: boolEnv("SB_CORS_ALLOW_CREDENTIALS", true),
  conversationOriginBypass: boolEnv("SB_CONVERSATION_ORIGIN_BYPASS", true),
  corsAllowedOrigins: parseOrigins(
    process.env.SB_CORS_ALLOWED_ORIGINS ||
    [
      "https://www.sandblast.channel",
      "https://sandblast.channel",
      "https://www.sandblastchannel.com",
      "https://sandblastchannel.com",
      "https://sandblast-channel.webflow.io",
      "https://preview.webflow.com",
      "https://editor.webflow.com",
      "http://localhost:3000",
      "http://127.0.0.1:3000"
    ].join(",")
  ),
  quietSupportHoldTurns: clamp(Number(process.env.SB_SUPPORT_HOLD_TURNS || 2), 1, 4),
  loopSuppressionWindowMs: clamp(Number(process.env.SB_LOOP_SUPPRESSION_MS || 12000), 3000, 45000),
  duplicateReplyWindowMs: clamp(Number(process.env.SB_DUPLICATE_REPLY_MS || 15000), 3000, 45000),
  supportHoldMaxTurns: clamp(Number(process.env.SB_SUPPORT_HOLD_MAX_TURNS || 1), 0, 3),
  transportReplayCacheMs: clamp(Number(process.env.SB_TRANSPORT_REPLAY_CACHE_MS || 12000), 3000, 45000),
  requestTimeoutMs: clamp(Number(process.env.SB_REQUEST_TIMEOUT_MS || 18000), 6000, 45000),
  httpLogEnabled: boolEnv("SB_HTTP_LOG_ENABLED", false),
  httpLogSlowMs: clamp(Number(process.env.SB_HTTP_LOG_SLOW_MS || 2500), 250, 30000),
  logHealthCalls: boolEnv("SB_LOG_HEALTH_CALLS", false),
  memoryTtlMs: clamp(Number(process.env.SB_MEMORY_TTL_MS || 30 * 60 * 1000), 60000, 24 * 60 * 60 * 1000),
  memorySweepEveryMs: clamp(Number(process.env.SB_MEMORY_SWEEP_EVERY_MS || 60 * 1000), 10000, 10 * 60 * 1000),
  port: PORT
};

function isSandblastOrigin(origin) {
  const o = cleanText(origin);
  if (!o) return false;
  try {
    const url = new URL(o);
    const host = lower(url.host || "");
    return host === "sandblast.channel" ||
      host === "www.sandblast.channel" ||
      host === "sandblastchannel.com" ||
      host === "www.sandblastchannel.com" ||
      (host.endsWith && host.endsWith(".sandblast.channel"));
  } catch (_) {
    return /https?:\/\/(www\.)?(?:sandblast\.channel|sandblastchannel\.com)(?::\d+)?$/i.test(o);
  }
}

function isWebflowPreviewOrigin(origin) {
  const o = cleanText(origin);
  if (!o) return false;
  try {
    const url = new URL(o);
    const host = lower(url.host || "");
    return host === "sandblast-channel.webflow.io" ||
      host === "preview.webflow.com" ||
      host === "editor.webflow.com";
  } catch (_) {
    return /^https:\/\/(?:sandblast-channel\.webflow\.io|preview\.webflow\.com|editor\.webflow\.com)$/i.test(o);
  }
}

function isAllowedOrigin(origin) {
  const o = cleanText(origin);
  if (!o) return true;
  if (CFG.corsAllowedOrigins.includes("*")) return true;
  if (isSandblastOrigin(o)) return true;
  if (isWebflowPreviewOrigin(o)) return true;
  return CFG.corsAllowedOrigins.includes(o) || CFG.corsAllowedOrigins.some((x) => sameHost(x, o));
}

function applyCors(req, res) {
  const origin = cleanText((req && req.headers && req.headers.origin) || "");
  const reqHeaders = cleanText((req && req.headers && req.headers["access-control-request-headers"]) || "");
  const allowHeaders = uniq([
    "Content-Type",
    "Authorization",
    "x-sb-trace-id",
    "x-requested-with",
    CFG.apiTokenHeader,
    ...reqHeaders.split(",").map((s) => cleanText(s)).filter(Boolean)
  ]);
  const allowed = origin && isAllowedOrigin(origin);

  if (allowed) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    if (CFG.corsAllowCredentials) {
      res.header("Access-Control-Allow-Credentials", "true");
    }
  } else if (!origin) {
    res.header("Vary", "Origin");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", allowHeaders.join(", "));
  res.header("Access-Control-Expose-Headers", "x-sb-trace-id");
  return origin;
}

function hardenCors(req, res) {
  try { applyCors(req, res); } catch (_) {}
  return res;
}

function hardenConversationNoStore(res) {
  if (!res || typeof res.setHeader !== "function") return res;
  try {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
  } catch (_) {}
  return res;
}

app.use((req, res, next) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});

// LINGOSENTINEL-WEBFLOW-CORS-HARDLOCK:
// Explicitly support Webflow/Sandblast preflight for realtime token and publish routes.
app.options([
  "/api/lingosentinel",
  "/api/lingosentinel/",
  "/api/lingosentinel/token",
  "/api/lingosentinel/token/health",
  "/api/lingosentinel/ably/readiness",
  "/api/lingosentinel/readiness",
  "/api/lingosentinel/ably/sandbox-publish",
  "/api/lingosentinel/private/health",
  "/api/lingosentinel/private/token",
  "/api/lingosentinel/private/publish",
  "/api/lingosentinel/publish",
  "/api/lingosentinel/link"
], (req, res) => {
  hardenCors(req, res);
  return res.status(204).end();
});


// LINGOSENTINEL-START-CONTACT-ROUTE-V8-ASYNC-SUBMIT-SMTP-QUEUE-HARDLOCK
// Purpose: real Start-page intake capture for LingoSentinel.
// The browser widget must POST here; this route validates the payload,
// stores an audit copy, and sends the inquiry to Sandblast's inbox when
// SMTP credentials are configured on Render.
const LINGOSENTINEL_CONTACT_ROUTE_VERSION = "nyx.lingosentinel.startContactRoute/2.0-http-email-api-first-hardlock";
const LINGOSENTINEL_CONTACT_DEFAULT_TO = "sandblastchannel@gmail.com";
const lingosentinelContactRate = new Map();
const contactSmtpRuntimeState = {
  lastAttemptAt: "",
  lastAttemptMode: "",
  lastAttemptLabel: "",
  lastAttemptHost: "",
  lastAttemptPort: 0,
  lastAttemptSecure: false,
  lastAttemptStartTls: false,
  lastStatus: "never_attempted",
  lastAccepted: false,
  lastDeliveredTo: "",
  lastError: "",
  lastErrorDetail: "",
  lastAttempts: []
};

function normalizeContactEmail(value) {
  const raw = cleanText(value || "");
  if (!raw) return "";
  const bracket = raw.match(/<\s*([^<>\s@]+@[^<>\s@]+\.[^<>\s@]{2,})\s*>/i);
  const candidate = bracket ? bracket[1] : raw;
  return cleanText(candidate).replace(/^mailto:/i, "").replace(/[;,]+$/g, "").toLowerCase();
}

function contactEnvRaw(name) {
  return safeStr(process.env[name] || "");
}

function contactConfig() {
  const rawTo = process.env.SB_CONTACT_TO_EMAIL || process.env.LINGOSENTINEL_CONTACT_TO || LINGOSENTINEL_CONTACT_DEFAULT_TO;
  const rawSmtpUser = process.env.SB_CONTACT_SMTP_USER || process.env.SMTP_USER || process.env.GMAIL_USER || "";
  const rawFrom = process.env.SB_CONTACT_FROM_EMAIL || process.env.SMTP_FROM || rawSmtpUser || rawTo;
  const smtpHost = cleanText(process.env.SB_CONTACT_SMTP_HOST || process.env.SMTP_HOST || "smtp.gmail.com").toLowerCase();
  const rawPort = cleanText(process.env.SB_CONTACT_SMTP_PORT || process.env.SMTP_PORT || "");
  // Gmail on Render has shown timeout behavior on implicit SSL/465 in some deploys.
  // Default Gmail to STARTTLS/587 unless the environment explicitly pins a port.
  const defaultPort = /smtp\.gmail\.com$/i.test(smtpHost) ? 587 : 587;
  const smtpPort = clamp(Number(rawPort || defaultPort), 1, 65535);
  const secureEnv = cleanText(process.env.SB_CONTACT_SMTP_SECURE || process.env.SMTP_SECURE || "");
  const smtpSecure = secureEnv ? !/^(?:false|0|no|off|starttls)$/i.test(secureEnv) : smtpPort === 465;
  const rawPass = contactEnvRaw("SB_CONTACT_SMTP_PASS") || contactEnvRaw("SMTP_PASS") || contactEnvRaw("GMAIL_APP_PASSWORD") || "";
  const passNoWhitespace = safeStr(rawPass).replace(/[\s\u00a0]+/g, "");
  const resendKey = contactEnvRaw("SB_RESEND_API_KEY") || contactEnvRaw("RESEND_API_KEY") || "";
  const brevoKey = contactEnvRaw("SB_BREVO_API_KEY") || contactEnvRaw("BREVO_API_KEY") || contactEnvRaw("SENDINBLUE_API_KEY") || "";
  const sendgridKey = contactEnvRaw("SB_SENDGRID_API_KEY") || contactEnvRaw("SENDGRID_API_KEY") || "";
  const mailgunKey = contactEnvRaw("SB_MAILGUN_API_KEY") || contactEnvRaw("MAILGUN_API_KEY") || "";
  const mailgunDomain = cleanText(process.env.SB_MAILGUN_DOMAIN || process.env.MAILGUN_DOMAIN || "").toLowerCase();
  const explicitProvider = cleanText(process.env.SB_CONTACT_EMAIL_PROVIDER || process.env.CONTACT_EMAIL_PROVIDER || "").toLowerCase();
  const autoProvider = resendKey ? "resend" : brevoKey ? "brevo" : sendgridKey ? "sendgrid" : (mailgunKey && mailgunDomain) ? "mailgun" : "smtp";
  const emailProvider = /^(?:resend|brevo|sendgrid|mailgun|smtp)$/i.test(explicitProvider) ? explicitProvider : autoProvider;
  return {
    enabled: process.env.SB_CONTACT_ROUTE_ENABLED !== "false",
    to: normalizeContactEmail(rawTo),
    smtpHost,
    smtpPort,
    smtpSecure,
    // BRLOGIC/MailEnable publishes port 25 with SSL: No. For that contract, the
    // backend must support plain SMTP AUTH without forcing STARTTLS. Explicit env
    // still wins: set SB_CONTACT_SMTP_REQUIRE_TLS=true for STARTTLS on non-SSL ports.
    smtpRequireTls: process.env.SB_CONTACT_SMTP_REQUIRE_TLS
      ? !/^(?:false|0|no|off|plain)$/i.test(process.env.SB_CONTACT_SMTP_REQUIRE_TLS)
      : !(smtpPort === 25 && !smtpSecure),
    smtpUser: normalizeContactEmail(rawSmtpUser),
    // Google App Passwords are often copied with spaces. SMTP AUTH must receive
    // the 16-character token without spaces/newlines.
    smtpPass: passNoWhitespace,
    smtpPassHadWhitespace: /[\s\u00a0]/.test(safeStr(rawPass)),
    smtpPassSource: process.env.SB_CONTACT_SMTP_PASS ? "SB_CONTACT_SMTP_PASS" : process.env.SMTP_PASS ? "SMTP_PASS" : process.env.GMAIL_APP_PASSWORD ? "GMAIL_APP_PASSWORD" : "",
    from: normalizeContactEmail(rawFrom),
    subjectPrefix: cleanText(process.env.SB_CONTACT_SUBJECT_PREFIX || "LingoSentinel Interest"),
    maxMessageChars: clamp(Number(process.env.SB_CONTACT_MAX_MESSAGE_CHARS || 1800), 120, 8000),
    rateLimitWindowMs: clamp(Number(process.env.SB_CONTACT_RATE_WINDOW_MS || 15 * 60 * 1000), 60 * 1000, 60 * 60 * 1000),
    rateLimitMax: clamp(Number(process.env.SB_CONTACT_RATE_MAX || 8), 1, 200),
    // Longer timeouts prevent Render/Gmail handshake latency from being misread as config failure.
    smtpConnectTimeoutMs: clamp(Number(process.env.SB_CONTACT_SMTP_CONNECT_TIMEOUT_MS || 20000), 5000, 120000),
    smtpCommandTimeoutMs: clamp(Number(process.env.SB_CONTACT_SMTP_COMMAND_TIMEOUT_MS || 20000), 5000, 120000),
    smtpSocketTimeoutMs: clamp(Number(process.env.SB_CONTACT_SMTP_SOCKET_TIMEOUT_MS || 30000), 10000, 180000),
    // Force IPv4 by default for SMTP; this avoids occasional IPv6 egress hangs on hosted runtimes.
    smtpFamily: clamp(Number(process.env.SB_CONTACT_SMTP_FAMILY || 4), 0, 6),
    smtpDebug: process.env.SB_CONTACT_SMTP_DEBUG === "true",
    emailProvider,
    api: {
      provider: emailProvider,
      resendKey: safeStr(resendKey).trim(),
      brevoKey: safeStr(brevoKey).trim(),
      sendgridKey: safeStr(sendgridKey).trim(),
      mailgunKey: safeStr(mailgunKey).trim(),
      mailgunDomain,
      timeoutMs: clamp(Number(process.env.SB_CONTACT_EMAIL_API_TIMEOUT_MS || 20000), 5000, 120000),
      fromName: cleanContactHeader(process.env.SB_CONTACT_FROM_NAME || "Sandblast LingoSentinel", 100)
    }
  };
}
function cleanContactInput(value, maxLen) {
  const max = clamp(Number(maxLen || 240), 1, 10000);
  return safeStr(value)
    .replace(/\u0000/g, "")
    .replace(/[<>]/g, "")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, max);
}

function cleanContactHeader(value, maxLen) {
  return cleanContactInput(value, maxLen || 160).replace(/[\r\n]+/g, " ").trim();
}

function isValidContactEmail(value) {
  const s = normalizeContactEmail(value);
  return !!s && s.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/i.test(s);
}

function isContactEmailApiConfigDeliverable(cfg) {
  const c = isObj(cfg) ? cfg : contactConfig();
  const api = safeObj(c.api);
  const provider = cleanText(c.emailProvider || api.provider || "smtp").toLowerCase();
  if (!c.enabled || !isValidContactEmail(c.from) || !isValidContactEmail(c.to)) return false;
  if (provider === "resend") return !!api.resendKey;
  if (provider === "brevo") return !!api.brevoKey;
  if (provider === "sendgrid") return !!api.sendgridKey;
  if (provider === "mailgun") return !!api.mailgunKey && !!api.mailgunDomain;
  return false;
}

function isContactSmtpConfigDeliverable(cfg) {
  const c = isObj(cfg) ? cfg : contactConfig();
  return !!(
    c.enabled &&
    c.smtpHost &&
    Number(c.smtpPort) > 0 &&
    c.smtpUser &&
    c.smtpPass &&
    isValidContactEmail(c.smtpUser) &&
    isValidContactEmail(c.from) &&
    isValidContactEmail(c.to)
  );
}

function isContactDeliveryConfigured(cfg) {
  const c = isObj(cfg) ? cfg : contactConfig();
  return isContactEmailApiConfigDeliverable(c) || isContactSmtpConfigDeliverable(c);
}

function contactSmtpPublicDiagnostics(cfg) {
  const c = isObj(cfg) ? cfg : contactConfig();
  return {
    enabled: !!c.enabled,
    deliveryReady: isContactDeliveryConfigured(c),
    smtpDeliveryReady: isContactSmtpConfigDeliverable(c),
    emailApiDeliveryReady: isContactEmailApiConfigDeliverable(c),
    smtpUserPresent: !!c.smtpUser,
    smtpPassPresent: !!c.smtpPass,
    fromEmailValid: isValidContactEmail(c.from),
    toEmailValid: isValidContactEmail(c.to),
    emailApi: contactEmailApiPublicDiagnostics(c),
    nodemailerAvailable: !!contactNodemailerModule(),
    diagnosticSendRoute: "/api/lingosentinel/start/contact/smtp-send-test",
    lastDeliveryAttempt: contactSmtpPublicState(),
    diagnosticsRedacted: true
  };
}


function contactEmailApiPublicDiagnostics(cfg) {
  const c = isObj(cfg) ? cfg : contactConfig();
  const api = safeObj(c.api);
  const provider = cleanText(c.emailProvider || api.provider || "smtp").toLowerCase();
  return {
    provider: provider === "smtp" ? "smtp" : "http_email_api",
    enabled: provider !== "smtp",
    deliveryReady: isContactEmailApiConfigDeliverable(c),
    fromEmailValid: isValidContactEmail(c.from),
    toEmailValid: isValidContactEmail(c.to),
    timeoutMsConfigured: Number(api.timeoutMs || 0) > 0,
    diagnosticsRedacted: true
  };
}


function contactEmailApiEndpoint(cfg) {
  const provider = cleanText(cfg.emailProvider || safeObj(cfg.api).provider || "smtp").toLowerCase();
  if (provider === "resend") return "https://api.resend.com/emails";
  if (provider === "brevo") return "https://api.brevo.com/v3/smtp/email";
  if (provider === "sendgrid") return "https://api.sendgrid.com/v3/mail/send";
  if (provider === "mailgun") return `https://api.mailgun.net/v3/${encodeURIComponent(safeObj(cfg.api).mailgunDomain || "")}/messages`;
  return "";
}

function contactEmailApiHeaders(cfg) {
  const api = safeObj(cfg.api);
  const provider = cleanText(cfg.emailProvider || api.provider || "smtp").toLowerCase();
  if (provider === "resend") return { Authorization: `Bearer ${api.resendKey}`, "Content-Type": "application/json" };
  if (provider === "brevo") return { "api-key": api.brevoKey, "Content-Type": "application/json" };
  if (provider === "sendgrid") return { Authorization: `Bearer ${api.sendgridKey}`, "Content-Type": "application/json" };
  if (provider === "mailgun") return { Authorization: `Basic ${Buffer.from(`api:${api.mailgunKey}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" };
  return {};
}

function contactDisplayFrom(cfg) {
  const name = cleanContactHeader(safeObj(cfg.api).fromName || "Sandblast LingoSentinel", 100);
  return name ? `${name} <${cfg.from}>` : cfg.from;
}

function buildContactEmailApiPayload(data, cfg) {
  const provider = cleanText(cfg.emailProvider || safeObj(cfg.api).provider || "smtp").toLowerCase();
  const subject = cleanContactHeader(`${cfg.subjectPrefix} - ${data.name || "Inquiry"}`, 180);
  const text = buildContactEmailText(data);
  const replyTo = isValidContactEmail(data.email) ? data.email : cfg.from;
  if (provider === "resend") {
    return { from: contactDisplayFrom(cfg), to: [cfg.to], reply_to: replyTo, subject, text };
  }
  if (provider === "brevo") {
    return {
      sender: { name: safeObj(cfg.api).fromName || "Sandblast LingoSentinel", email: cfg.from },
      to: [{ email: cfg.to }],
      replyTo: { email: replyTo, name: cleanContactHeader(data.name || "Contact", 80) || "Contact" },
      subject,
      textContent: text
    };
  }
  if (provider === "sendgrid") {
    return {
      personalizations: [{ to: [{ email: cfg.to }] }],
      from: { email: cfg.from, name: safeObj(cfg.api).fromName || "Sandblast LingoSentinel" },
      reply_to: { email: replyTo, name: cleanContactHeader(data.name || "Contact", 80) || "Contact" },
      subject,
      content: [{ type: "text/plain", value: text }]
    };
  }
  if (provider === "mailgun") {
    const params = new URLSearchParams();
    params.set("from", contactDisplayFrom(cfg));
    params.set("to", cfg.to);
    params.set("h:Reply-To", `${cleanContactHeader(data.name || "Contact", 80)} <${replyTo}>`);
    params.set("subject", subject);
    params.set("text", text);
    return params.toString();
  }
  return null;
}

function contactHttpsRequestJson(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (err) { err.code = "EMAIL_API_URL_INVALID"; reject(err); return; }
    if (parsed.protocol !== "https:") {
      const err = new Error("email_api_requires_https");
      err.code = "EMAIL_API_REQUIRES_HTTPS";
      reject(err);
      return;
    }
    const https = require("https");
    const payload = typeof body === "string" ? body : JSON.stringify(body || {});
    const req = https.request({
      method: "POST",
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search || ""}`,
      headers: {
        ...(isObj(headers) ? headers : {}),
        "Content-Length": Buffer.byteLength(payload),
        "User-Agent": "Sandblast-LingoSentinel-Contact/2.0"
      },
      timeout: clamp(Number(timeoutMs || 20000), 5000, 120000)
    }, (resp) => {
      let raw = "";
      resp.setEncoding("utf8");
      resp.on("data", (chunk) => { raw += chunk; if (raw.length > 20000) raw = raw.slice(0, 20000); });
      resp.on("end", () => {
        let parsedBody = null;
        try { parsedBody = raw ? JSON.parse(raw) : null; } catch (_) { parsedBody = raw; }
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          resolve({ statusCode: resp.statusCode, body: parsedBody, rawBody: raw, headers: resp.headers });
          return;
        }
        const err = new Error(`email_api_http_${resp.statusCode}`);
        err.code = `EMAIL_API_HTTP_${resp.statusCode}`;
        err.statusCode = resp.statusCode;
        err.responseBody = raw.slice(0, 800);
        reject(err);
      });
    });
    req.on("timeout", () => {
      const err = new Error("email_api_timeout");
      err.code = "EMAIL_API_TIMEOUT";
      try { req.destroy(err); } catch (_) {}
    });
    req.on("error", (err) => {
      if (!err.code) err.code = "EMAIL_API_REQUEST_FAILED";
      reject(err);
    });
    req.write(payload);
    req.end();
  });
}

function emailApiSafeErrorCode(err) {
  const raw = cleanText(err && (err.code || err.message) || "EMAIL_API_DELIVERY_FAILED").toUpperCase();
  if (/EMAIL_API_HTTP_401|EMAIL_API_HTTP_403|UNAUTHORIZED|FORBIDDEN|API_KEY/.test(raw)) return "EMAIL_API_AUTH_FAILED";
  if (/EMAIL_API_HTTP_400|BAD_REQUEST|VALIDATION/.test(raw)) return "EMAIL_API_BAD_REQUEST";
  if (/EMAIL_API_HTTP_429|RATE/.test(raw)) return "EMAIL_API_RATE_LIMITED";
  if (/TIMEOUT|ETIMEDOUT/.test(raw)) return "EMAIL_API_TIMEOUT";
  if (/ENOTFOUND|EAI_AGAIN|DNS/.test(raw)) return "EMAIL_API_DNS_FAILED";
  if (/ECONNREFUSED|REFUSED/.test(raw)) return "EMAIL_API_CONNECTION_REFUSED";
  return raw.replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "EMAIL_API_DELIVERY_FAILED";
}

async function sendContactEmailViaHttpApi(data, cfg) {
  const c = isObj(cfg) ? cfg : contactConfig();
  const provider = cleanText(c.emailProvider || safeObj(c.api).provider || "smtp").toLowerCase();
  if (provider === "smtp") {
    const err = new Error("contact_email_api_not_selected");
    err.code = "CONTACT_EMAIL_API_NOT_SELECTED";
    throw err;
  }
  if (!isContactEmailApiConfigDeliverable(c)) {
    const err = new Error("contact_email_api_not_configured");
    err.code = "CONTACT_EMAIL_API_NOT_CONFIGURED";
    throw err;
  }
  const endpoint = contactEmailApiEndpoint(c);
  const payload = buildContactEmailApiPayload(data, c);
  const headers = contactEmailApiHeaders(c);
  try {
    const result = await contactHttpsRequestJson(endpoint, headers, payload, safeObj(c.api).timeoutMs);
    const providerId = cleanText(
      (isObj(result.body) && (result.body.id || result.body.messageId || result.body.message_id)) ||
      result.headers && (result.headers["x-message-id"] || result.headers["x-request-id"]) ||
      ""
    );
    noteContactSmtpAttempt({ label: `${provider}-http-api`, host: endpoint, port: 443, secure: true, starttls: false }, "delivered", { deliveredTo: c.to, detail: providerId || `http_${result.statusCode}` });
    return { ok: true, deliveredTo: c.to, provider: `${provider}-http-api`, endpoint, statusCode: result.statusCode, messageId: providerId };
  } catch (err) {
    const code = emailApiSafeErrorCode(err);
    noteContactSmtpAttempt({ label: `${provider}-http-api`, host: endpoint, port: 443, secure: true, starttls: false }, "delivery_failed", { error: code, detail: cleanText(err && (err.responseBody || err.message) || "").slice(0, 240) });
    err.code = code;
    throw err;
  }
}

function contactClientKey(req) {
  const forwarded = cleanText(req && req.headers && req.headers["x-forwarded-for"] || "");
  const ip = cleanText((forwarded.split(",")[0] || "") || req.ip || (req.socket && req.socket.remoteAddress) || "unknown");
  return ip || "unknown";
}

function checkContactRateLimit(req) {
  const cfg = contactConfig();
  const key = contactClientKey(req);
  const t = now();
  const current = lingosentinelContactRate.get(key) || { at: t, count: 0 };
  if (t - current.at > cfg.rateLimitWindowMs) {
    current.at = t;
    current.count = 0;
  }
  current.count += 1;
  lingosentinelContactRate.set(key, current);
  if (lingosentinelContactRate.size > 1000) {
    for (const [k, v] of lingosentinelContactRate.entries()) {
      if (t - Number(v && v.at || 0) > cfg.rateLimitWindowMs * 2) lingosentinelContactRate.delete(k);
    }
  }
  return current.count <= cfg.rateLimitMax;
}

function normalizeContactPayload(body) {
  const cfg = contactConfig();
  const src = isObj(body) ? body : {};
  const out = {
    name: cleanContactInput(src.name || src.fullName || src.senderName || "", 120),
    email: cleanContactInput(src.email || src.senderEmail || src.fromEmail || "", 254).toLowerCase(),
    interest: cleanContactInput(src.interest || src.primaryInterest || src.topic || "General inquiry", 160),
    region: cleanContactInput(src.region || src.country || src.location || "", 160),
    message: cleanContactInput(src.message || src.note || src.details || "", cfg.maxMessageChars),
    consent: src.consent === true || src.consent === "true" || src.consent === "on" || src.consent === "yes",
    source: cleanContactInput(src.source || src.page || "LingoSentinel Get Started", 160),
    submittedAt: cleanContactInput(src.submittedAt || new Date().toISOString(), 80),
    traceId: crypto.randomBytes(10).toString("hex")
  };
  return out;
}

function validateContactPayload(data) {
  const errors = [];
  if (!data.name) errors.push("name_required");
  if (!isValidContactEmail(data.email)) errors.push("valid_email_required");
  if (!data.interest) errors.push("interest_required");
  if (!data.consent) errors.push("consent_required");
  if (data.message && data.message.length > contactConfig().maxMessageChars) errors.push("message_too_long");
  return errors;
}

function contactSubmissionFilePath() {
  const dir = path.join(__dirname, "Data", "lingosentinel", "contact");
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  return path.join(dir, "start-page-submissions.jsonl");
}

function writeContactAudit(data, status, extra) {
  try {
    const row = {
      ...safeObj(data),
      status: cleanText(status || "received"),
      emailDelivered: status === "delivered",
      meta: {
        routeVersion: LINGOSENTINEL_CONTACT_ROUTE_VERSION,
        at: new Date().toISOString(),
        ...(isObj(extra) ? extra : {})
      }
    };
    fs.appendFileSync(contactSubmissionFilePath(), JSON.stringify(row) + "\n", "utf8");
    return true;
  } catch (err) {
    console.log("[Sandblast][contact:audit_write_error]", err && (err.stack || err.message || err));
    return false;
  }
}

function queueContactEmailDelivery(data) {
  const payload = { ...safeObj(data) };
  const schedule = typeof setImmediate === "function" ? setImmediate : (fn) => setTimeout(fn, 0);
  schedule(() => {
    sendContactEmailViaSmtp(payload)
      .then((delivered) => {
        writeContactAudit(payload, "delivered", {
          provider: delivered && delivered.provider,
          deliveredTo: delivered && delivered.deliveredTo,
          earlyMount: true,
          smtpQueued: true,
          backgroundDelivery: true
        });
        console.log("[Sandblast][contact:background_delivered]", payload.traceId, delivered && delivered.deliveredTo);
      })
      .catch((err) => {
        const code = smtpSafeErrorCode(err);
        const smtpAttempts = Array.isArray(err && err.smtpAttempts) ? err.smtpAttempts.slice(0, 6) : [];
        writeContactAudit(payload, "stored_not_delivered", {
          error: code,
          smtpAttempts,
          earlyMount: true,
          smtpQueued: true,
          backgroundDelivery: true
        });
        console.log("[Sandblast][contact:background_delivery_error]", payload.traceId, code, smtpAttempts.join(" | "), err && err.smtpResponse ? String(err.smtpResponse).slice(0, 240) : "");
      });
  });
  return true;
}


function contactDiagnosticToken() {
  return cleanText(process.env.SB_CONTACT_DIAGNOSTIC_TOKEN || process.env.CONTACT_DIAGNOSTIC_TOKEN || "");
}

function checkContactDiagnosticAccess(req) {
  const required = contactDiagnosticToken();
  if (!required) return { ok: true, open: true };
  const supplied = cleanText(
    (req && req.headers && (req.headers["x-sb-contact-diagnostic-token"] || req.headers["x-contact-diagnostic-token"])) ||
    ""
  );
  return supplied && supplied === required ? { ok: true, open: false } : { ok: false, error: "diagnostic_token_required" };
}

function contactNodemailerModule() {
  try { return require("nodemailer"); } catch (_) {}
  try { return require("./node_modules/nodemailer"); } catch (_) {}
  return null;
}

function contactNodemailerTransportOptions(cfg, attempt) {
  const a = isObj(attempt) ? attempt : {};
  const host = cleanText(a.host || cfg.smtpHost);
  const port = clamp(Number(a.port || cfg.smtpPort), 1, 65535);
  const secure = typeof a.secure === "boolean" ? a.secure : !!cfg.smtpSecure;
  const starttls = !secure && (typeof a.starttls === "boolean" ? a.starttls : !!cfg.smtpRequireTls);
  return {
    host,
    port,
    secure,
    requireTLS: !!starttls,
    ignoreTLS: !secure && !starttls,
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    connectionTimeout: clamp(Number(cfg.smtpConnectTimeoutMs || 20000), 5000, 120000),
    greetingTimeout: clamp(Number(cfg.smtpCommandTimeoutMs || 20000), 5000, 120000),
    socketTimeout: clamp(Number(cfg.smtpSocketTimeoutMs || 30000), 10000, 180000),
    family: Number(a.family || cfg.smtpFamily || 0) || undefined,
    tls: {
      servername: host,
      rejectUnauthorized: process.env.SB_CONTACT_SMTP_REJECT_UNAUTHORIZED === "false" ? false : true
    }
  };
}

async function smtpVerifyWithNodemailerAttempt(cfg, attempt) {
  const nodemailer = contactNodemailerModule();
  if (!nodemailer || typeof nodemailer.createTransport !== "function") {
    const err = new Error("nodemailer_not_available");
    err.code = "NODEMAILER_NOT_AVAILABLE";
    throw err;
  }
  const transport = nodemailer.createTransport(contactNodemailerTransportOptions(cfg, attempt));
  try {
    await transport.verify();
    noteContactSmtpAttempt(attempt, "verified", { deliveredToConfigured: !!cfg.to, detail: "nodemailer" });
    return { ok: true, verified: true, provider: "nodemailer", host: attempt.host, port: attempt.port, secure: !!attempt.secure, starttls: !!attempt.starttls, attempt: attempt.label };
  } finally {
    try { transport.close(); } catch (_) {}
  }
}

async function smtpDeliverWithNodemailerAttempt(data, cfg, attempt) {
  const nodemailer = contactNodemailerModule();
  if (!nodemailer || typeof nodemailer.createTransport !== "function") {
    const err = new Error("nodemailer_not_available");
    err.code = "NODEMAILER_NOT_AVAILABLE";
    throw err;
  }
  const transport = nodemailer.createTransport(contactNodemailerTransportOptions(cfg, attempt));
  try {
    const info = await transport.sendMail({
      from: `Sandblast LingoSentinel <${cfg.from}>`,
      to: cfg.to,
      replyTo: `${cleanContactHeader(data.name || "Contact", 80)} <${cleanContactHeader(data.email || cfg.from, 254)}>`,
      subject: cleanContactHeader(`${cfg.subjectPrefix} - ${data.name || "Inquiry"}`, 180),
      text: buildContactEmailText(data)
    });
    noteContactSmtpAttempt(attempt, "delivered", { deliveredToConfigured: !!cfg.to, detail: cleanText(info && (info.messageId || info.response) || "nodemailer").slice(0, 240) });
    return { ok: true, deliveredToConfigured: !!cfg.to, provider: "nodemailer", host: attempt.host, port: attempt.port, secure: !!attempt.secure, starttls: !!attempt.starttls, attempt: attempt.label, messageId: cleanText(info && info.messageId || "") };
  } finally {
    try { transport.close(); } catch (_) {}
  }
}

function smtpEscapeBody(value) {
  return safeStr(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((line) => line.startsWith(".") ? `.${line}` : line).join("\r\n");
}

function buildContactEmailText(data) {
  return [
    "New LingoSentinel Get Started inquiry",
    "",
    `Name: ${data.name}`,
    `Email: ${data.email}`,
    `Primary interest: ${data.interest}`,
    `Region / country: ${data.region || "Not provided"}`,
    "",
    "Message:",
    data.message || "Not provided",
    "",
    `Consent: ${data.consent ? "Yes" : "No"}`,
    `Source: ${data.source}`,
    `Submitted: ${data.submittedAt}`,
    `Trace: ${data.traceId}`
  ].join("\n");
}

function buildContactMimeMessage(data, cfg) {
  const fromEmail = cleanContactHeader(cfg.from, 254);
  const toEmail = cleanContactHeader(cfg.to, 254);
  const replyTo = cleanContactHeader(data.email, 254);
  const subject = cleanContactHeader(`${cfg.subjectPrefix} - ${data.name}`, 180);
  const body = buildContactEmailText(data);
  const idHost = (toEmail.split("@")[1] || "sandblast.channel").replace(/[^a-z0-9.-]/gi, "") || "sandblast.channel";
  const msgId = `<${data.traceId}.${Date.now()}@${idHost}>`;
  return [
    `From: Sandblast LingoSentinel <${fromEmail}>`,
    `To: ${toEmail}`,
    `Reply-To: ${data.name.replace(/"/g, "")} <${replyTo}>`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${msgId}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    body
  ].join("\r\n");
}

function smtpReadResponse(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let timer = null;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3}\s/.test(last)) {
        cleanup();
        const code = Number(last.slice(0, 3));
        resolve({ code, text: buffer });
      }
    };
    timer = setTimeout(() => {
      cleanup();
      const err = new Error("smtp_command_timeout");
      err.code = "SMTP_COMMAND_TIMEOUT";
      reject(err);
    }, clamp(Number(timeoutMs || 45000), 5000, 120000));
    socket.on("data", onData);
    socket.on("error", onError);
  });
}

function smtpWrite(socket, line) {
  socket.write(line.endsWith("\r\n") ? line : `${line}\r\n`);
}

async function smtpExpect(socket, expected, line) {
  if (line) smtpWrite(socket, line);
  const response = await smtpReadResponse(socket, Number(process.env.SB_CONTACT_SMTP_COMMAND_TIMEOUT_MS || 45000));
  const ok = (Array.isArray(expected) ? expected : [expected]).includes(response.code);
  if (!ok) {
    const err = new Error(`smtp_unexpected_${response.code}`);
    err.smtpResponse = response.text;
    throw err;
  }
  return response;
}

function smtpConnect(cfg, override) {
  const mode = { ...(isObj(override) ? override : {}) };
  const host = cleanText(mode.host || cfg.smtpHost);
  const port = clamp(Number(mode.port || cfg.smtpPort), 1, 65535);
  const secure = typeof mode.secure === "boolean" ? mode.secure : !!cfg.smtpSecure;
  return new Promise((resolve, reject) => {
    const tls = require("tls");
    const net = require("net");
    let settled = false;
    let timer = null;
    const finish = (err, socket) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) return reject(err);
      return resolve(socket);
    };
    const family = Number(mode.family || cfg.smtpFamily || 0) || undefined;
    const socket = secure
      ? tls.connect({
          host,
          port,
          family,
          servername: host,
          rejectUnauthorized: process.env.SB_CONTACT_SMTP_REJECT_UNAUTHORIZED === "false" ? false : true
        })
      : net.connect({ host, port, family });

    if (typeof socket.setTimeout === "function") {
      socket.setTimeout(clamp(Number(cfg.smtpSocketTimeoutMs || 90000), 10000, 180000), () => {
        const err = new Error("smtp_socket_timeout");
        err.code = `SMTP_SOCKET_TIMEOUT_${port}`;
        err.smtpHost = host;
        err.smtpPort = port;
        try { socket.destroy(err); } catch (_) {}
        finish(err);
      });
    }

    timer = setTimeout(() => {
      const err = new Error("smtp_connect_timeout");
      err.code = `SMTP_CONNECT_TIMEOUT_${port}`;
      err.smtpHost = host;
      err.smtpPort = port;
      try { socket.destroy(err); } catch (_) {}
      finish(err);
    }, clamp(Number(cfg.smtpConnectTimeoutMs || 60000), 5000, 120000));

    socket.once(secure ? "secureConnect" : "connect", () => finish(null, socket));
    socket.once("error", (err) => {
      if (!err.code) err.code = secure ? "SMTP_TLS_CONNECT_ERROR" : "SMTP_CONNECT_ERROR";
      err.smtpHost = host;
      err.smtpPort = port;
      finish(err);
    });
  });
}

function smtpStartTls(socket, cfg) {
  return new Promise((resolve, reject) => {
    const tls = require("tls");
    const host = cleanText(cfg.smtpHost || "smtp.gmail.com");
    const tlsSocket = tls.connect({
      socket,
      servername: host,
      rejectUnauthorized: process.env.SB_CONTACT_SMTP_REJECT_UNAUTHORIZED === "false" ? false : true
    });
    const timer = setTimeout(() => {
      const err = new Error("smtp_starttls_timeout");
      err.code = "SMTP_STARTTLS_TIMEOUT";
      try { tlsSocket.destroy(err); } catch (_) {}
      reject(err);
    }, clamp(Number(cfg.smtpConnectTimeoutMs || 60000), 5000, 120000));
    tlsSocket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(tlsSocket);
    });
    tlsSocket.once("error", (err) => {
      clearTimeout(timer);
      if (!err.code) err.code = "SMTP_STARTTLS_ERROR";
      reject(err);
    });
  });
}

function smtpSafeErrorCode(err) {
  const raw = cleanText(err && (err.code || err.message) || "SMTP_DELIVERY_FAILED").toUpperCase();
  if (/EMAIL_API|CONTACT_EMAIL_API/.test(raw)) return emailApiSafeErrorCode(err);
  if (/SMTP_(?:CONNECT|SOCKET|COMMAND)_TIMEOUT_?\d*/.test(raw)) return raw.replace(/[^A-Z0-9_]+/g, "_").slice(0, 80);
  if (/TIMEDOUT|TIMEOUT/.test(raw)) return "SMTP_TIMEOUT";
  if (/NODEMAILER_NOT_AVAILABLE/.test(raw)) return "NODEMAILER_NOT_AVAILABLE";
  if (/CONTACT_SMTP_USER_INVALID|CONTACT_TO_EMAIL_INVALID|CONTACT_FROM_EMAIL_INVALID|CONTACT_EMAIL_CONFIG_INVALID/.test(raw)) return raw;
  if (/EAUTH|AUTH|535|534/.test(raw)) return "SMTP_AUTH_FAILED";
  if (/ECONNREFUSED|REFUSED/.test(raw)) return "SMTP_CONNECTION_REFUSED";
  if (/ENOTFOUND|EAI_AGAIN|DNS/.test(raw)) return "SMTP_DNS_FAILED";
  if (/STARTTLS/.test(raw)) return "SMTP_STARTTLS_FAILED";
  if (/CERT|TLS|SSL/.test(raw)) return "SMTP_TLS_FAILED";
  if (/CONFIG/.test(raw)) return raw;
  return raw.replace(/[^A-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "SMTP_DELIVERY_FAILED";
}

function contactSmtpAttempts(cfg) {
  const host = cleanText(cfg.smtpHost || "smtp.gmail.com");
  const port = clamp(Number(cfg.smtpPort || 587), 1, 65535);
  const primaryStartTls = !cfg.smtpSecure && !!cfg.smtpRequireTls;
  const primary = {
    host,
    port,
    secure: !!cfg.smtpSecure,
    starttls: primaryStartTls,
    family: cfg.smtpFamily,
    label: `primary-${port}-${cfg.smtpSecure ? "ssl" : primaryStartTls ? "starttls" : "plain"}`
  };
  const attempts = [];
  const add = (a) => {
    if (!a || !a.host || !a.port) return;
    const secure = !!a.secure;
    const starttls = secure ? false : !!a.starttls;
    attempts.push({ ...a, secure, starttls, family: Number(a.family || cfg.smtpFamily || 0) || undefined });
  };

  // BRLOGIC/MailEnable panel shows: server webmail.brlogic.com, port 25, SSL No.
  // That means the first attempt must be plain SMTP AUTH on 25, not implicit SSL
  // and not mandatory STARTTLS. Keep 587 STARTTLS and 465 SSL as controlled fallbacks.
  if (/brlogic\.com$/i.test(host) || (port === 25 && !cfg.smtpSecure && !cfg.smtpRequireTls)) {
    add(primary);
    add({ host, port: 587, secure: false, starttls: true, family: cfg.smtpFamily, label: "generic-587-starttls-fallback" });
    add({ host, port: 465, secure: true, starttls: false, family: cfg.smtpFamily, label: "generic-465-ssl-fallback" });
  } else if (/smtp\.gmail\.com$/i.test(host)) {
    add({ host, port: 587, secure: false, starttls: true, family: cfg.smtpFamily, label: "gmail-587-starttls-preferred" });
    add(primary);
    add({ host, port: 465, secure: true, starttls: false, family: cfg.smtpFamily, label: "gmail-465-ssl-fallback" });
  } else {
    add(primary);
    add({ host, port: 587, secure: false, starttls: true, family: cfg.smtpFamily, label: "generic-587-starttls-fallback" });
  }

  const seen = new Set();
  return attempts.filter((a) => {
    const key = `${a.host}:${a.port}:${a.secure}:${a.starttls}:${a.family || 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contactSmtpAttemptLabels(cfg) {
  return contactSmtpAttempts(isObj(cfg) ? cfg : contactConfig()).map((a) => ({
    label: a.label,
    host: a.host,
    port: a.port,
    secure: !!a.secure,
    starttls: !!a.starttls,
    mode: a.secure ? "ssl" : a.starttls ? "starttls" : "plain_smtp",
    family: Number(a.family || 0) || "auto"
  }));
}

function contactSmtpPublicState() {
  return {
    at: contactSmtpRuntimeState.lastAttemptAt,
    status: contactSmtpRuntimeState.lastStatus,
    accepted: !!contactSmtpRuntimeState.lastAccepted,
    deliveredToConfigured: !!contactSmtpRuntimeState.lastDeliveredTo,
    label: contactSmtpRuntimeState.lastAttemptLabel,
    transportConfigured: !!contactSmtpRuntimeState.lastAttemptHost,
    secure: !!contactSmtpRuntimeState.lastAttemptSecure,
    starttls: !!contactSmtpRuntimeState.lastAttemptStartTls,
    mode: contactSmtpRuntimeState.lastAttemptMode,
    error: contactSmtpRuntimeState.lastError,
    attempts: Array.isArray(contactSmtpRuntimeState.lastAttempts) ? contactSmtpRuntimeState.lastAttempts.slice(0, 8).map((x) => cleanText(x).replace(/host=[^,;|]+/ig, "host=[redacted]").replace(/deliveredTo=[^,;|]+/ig, "deliveredTo=[redacted]")) : [],
    diagnosticsRedacted: true
  };
}


function setContactSmtpRuntimeState(patch) {
  const next = isObj(patch) ? patch : {};
  Object.assign(contactSmtpRuntimeState, next);
  if (Array.isArray(next.lastAttempts)) contactSmtpRuntimeState.lastAttempts = next.lastAttempts.slice(0, 8);
  return contactSmtpPublicState();
}

function noteContactSmtpAttempt(attempt, status, extra) {
  const a = isObj(attempt) ? attempt : {};
  const e = isObj(extra) ? extra : {};
  const mode = a.secure ? "ssl" : a.starttls ? "starttls" : "plain_smtp";
  const row = {
    at: new Date().toISOString(),
    label: cleanText(a.label || ""),
    host: cleanText(a.host || ""),
    port: Number(a.port || 0),
    secure: !!a.secure,
    starttls: !!a.starttls,
    mode,
    status: cleanText(status || ""),
    error: cleanText(e.error || ""),
    detail: cleanText(e.detail || "").slice(0, 240)
  };
  const existing = Array.isArray(contactSmtpRuntimeState.lastAttempts) ? contactSmtpRuntimeState.lastAttempts.slice(-7) : [];
  existing.push(row);
  return setContactSmtpRuntimeState({
    lastAttemptAt: row.at,
    lastAttemptMode: row.mode,
    lastAttemptLabel: row.label,
    lastAttemptHost: row.host,
    lastAttemptPort: row.port,
    lastAttemptSecure: row.secure,
    lastAttemptStartTls: row.starttls,
    lastStatus: row.status,
    lastAccepted: row.status === "delivered" || row.status === "verified",
    lastDeliveredTo: cleanText(e.deliveredTo || contactSmtpRuntimeState.lastDeliveredTo || ""),
    lastError: row.error,
    lastErrorDetail: row.detail,
    lastAttempts: existing
  });
}

async function smtpVerifyWithAttempt(cfg, attempt) {
  let socket = await smtpConnect(cfg, attempt);
  try {
    await smtpExpect(socket, 220);
    await smtpExpect(socket, 250, `EHLO ${cleanContactHeader(process.env.RENDER_EXTERNAL_HOSTNAME || "sandblast-backend", 80) || "sandblast-backend"}`);
    if (!attempt.secure && attempt.starttls) {
      await smtpExpect(socket, 220, "STARTTLS");
      socket = await smtpStartTls(socket, cfg);
      await smtpExpect(socket, 250, `EHLO ${cleanContactHeader(process.env.RENDER_EXTERNAL_HOSTNAME || "sandblast-backend", 80) || "sandblast-backend"}`);
    }
    await smtpExpect(socket, 334, "AUTH LOGIN");
    await smtpExpect(socket, 334, Buffer.from(cfg.smtpUser).toString("base64"));
    await smtpExpect(socket, 235, Buffer.from(cfg.smtpPass).toString("base64"));
    try { await smtpExpect(socket, 221, "QUIT"); } catch (_) {}
    noteContactSmtpAttempt(attempt, "verified", { deliveredTo: cfg.to });
    return { ok: true, verified: true, host: attempt.host, port: attempt.port, secure: !!attempt.secure, starttls: !!attempt.starttls, attempt: attempt.label };
  } finally {
    try { socket.end(); } catch (_) {}
    try { socket.destroy(); } catch (_) {}
  }
}

async function verifyContactSmtpConfig() {
  const cfg = contactConfig();
  if (!isContactSmtpConfigDeliverable(cfg)) {
    const err = new Error("contact_email_config_invalid");
    err.code = "CONTACT_EMAIL_CONFIG_INVALID";
    throw err;
  }
  const failures = [];
  for (const attempt of contactSmtpAttempts(cfg)) {
    const useNodemailerFirst = /smtp\.gmail\.com$/i.test(attempt.host || cfg.smtpHost);
    if (useNodemailerFirst) {
      try {
        return await smtpVerifyWithNodemailerAttempt(cfg, attempt);
      } catch (err) {
        const safeCode = smtpSafeErrorCode(err);
        const detail = err && err.smtpResponse ? String(err.smtpResponse).slice(0, 240) : "";
        if (safeCode !== "NODEMAILER_NOT_AVAILABLE") failures.push(`${attempt.label}:nodemailer:${safeCode}`);
        noteContactSmtpAttempt(attempt, "verify_failed", { error: safeCode, detail: detail || "nodemailer" });
        console.log("[Sandblast][contact:smtp_verify_failed]", attempt.label, "nodemailer", safeCode, detail);
        if (/SMTP_AUTH_FAILED|SMTP_DNS_FAILED/.test(safeCode)) continue;
      }
    }
    try {
      return await smtpVerifyWithAttempt(cfg, attempt);
    } catch (err) {
      const safeCode = smtpSafeErrorCode(err);
      const detail = err && err.smtpResponse ? String(err.smtpResponse).slice(0, 240) : "";
      failures.push(`${attempt.label}:manual:${safeCode}`);
      noteContactSmtpAttempt(attempt, "verify_failed", { error: safeCode, detail });
      console.log("[Sandblast][contact:smtp_verify_failed]", attempt.label, "manual", safeCode, detail);
    }
  }
  const finalErr = new Error(failures.join("|") || "SMTP_VERIFY_FAILED");
  finalErr.code = failures.some((x) => /SMTP_AUTH_FAILED/.test(x)) ? "SMTP_AUTH_FAILED" : "SMTP_VERIFY_FAILED";
  finalErr.smtpAttempts = failures;
  throw finalErr;
}

async function smtpDeliverWithAttempt(data, cfg, attempt) {
  let socket = await smtpConnect(cfg, attempt);
  try {
    await smtpExpect(socket, 220);
    await smtpExpect(socket, 250, `EHLO ${cleanContactHeader(process.env.RENDER_EXTERNAL_HOSTNAME || "sandblast-backend", 80) || "sandblast-backend"}`);
    if (!attempt.secure && attempt.starttls) {
      await smtpExpect(socket, 220, "STARTTLS");
      socket = await smtpStartTls(socket, cfg);
      await smtpExpect(socket, 250, `EHLO ${cleanContactHeader(process.env.RENDER_EXTERNAL_HOSTNAME || "sandblast-backend", 80) || "sandblast-backend"}`);
    }
    await smtpExpect(socket, 334, "AUTH LOGIN");
    await smtpExpect(socket, 334, Buffer.from(cfg.smtpUser).toString("base64"));
    await smtpExpect(socket, 235, Buffer.from(cfg.smtpPass).toString("base64"));
    await smtpExpect(socket, 250, `MAIL FROM:<${cfg.from}>`);
    await smtpExpect(socket, [250, 251], `RCPT TO:<${cfg.to}>`);
    await smtpExpect(socket, 354, "DATA");
    smtpWrite(socket, `${smtpEscapeBody(buildContactMimeMessage(data, cfg))}\r\n.`);
    await smtpExpect(socket, 250);
    try { await smtpExpect(socket, 221, "QUIT"); } catch (_) {}
    noteContactSmtpAttempt(attempt, "delivered", { deliveredTo: cfg.to });
    return { ok: true, deliveredToConfigured: !!cfg.to, provider: "smtp", host: attempt.host, port: attempt.port, secure: !!attempt.secure, starttls: !!attempt.starttls, attempt: attempt.label };
  } finally {
    try { socket.end(); } catch (_) {}
    try { socket.destroy(); } catch (_) {}
  }
}

async function sendContactEmailViaSmtp(data) {
  const cfg = contactConfig();
  if (!cfg.enabled) {
    const err = new Error("contact_route_disabled");
    err.code = "CONTACT_DISABLED";
    throw err;
  }
  if (!isValidContactEmail(cfg.to)) {
    const err = new Error("contact_to_email_invalid");
    err.code = "CONTACT_TO_EMAIL_INVALID";
    throw err;
  }
  if (!isValidContactEmail(cfg.from)) {
    const err = new Error("contact_from_email_invalid");
    err.code = "CONTACT_FROM_EMAIL_INVALID";
    throw err;
  }

  const failures = [];
  const provider = cleanText(cfg.emailProvider || safeObj(cfg.api).provider || "smtp").toLowerCase();
  if (provider !== "smtp") {
    try {
      return await sendContactEmailViaHttpApi(data, cfg);
    } catch (err) {
      const code = emailApiSafeErrorCode(err);
      failures.push(`${provider}:http-api:${code}`);
      console.log("[Sandblast][contact:email_api_failed]", provider, code, err && err.responseBody ? String(err.responseBody).slice(0, 240) : "");
      const hardApiFailure = /EMAIL_API_AUTH_FAILED|EMAIL_API_BAD_REQUEST|EMAIL_API_RATE_LIMITED/.test(code);
      const smtpFallbackDisabled = process.env.SB_CONTACT_SMTP_FALLBACK_DISABLED === "true";
      if (hardApiFailure || smtpFallbackDisabled) {
        const finalErr = new Error(failures.join("|") || code);
        finalErr.code = code;
        finalErr.smtpAttempts = failures;
        throw finalErr;
      }
    }
  }

  if (!cfg.smtpUser || !cfg.smtpPass) {
    const err = new Error("contact_smtp_not_configured");
    err.code = "CONTACT_SMTP_NOT_CONFIGURED";
    err.smtpAttempts = failures;
    throw err;
  }
  if (!isValidContactEmail(cfg.smtpUser)) {
    const err = new Error("contact_smtp_user_invalid");
    err.code = "CONTACT_SMTP_USER_INVALID";
    err.smtpAttempts = failures;
    throw err;
  }

  for (const attempt of contactSmtpAttempts(cfg)) {
    const useNodemailerFirst = /smtp\.gmail\.com$/i.test(attempt.host || cfg.smtpHost);
    if (useNodemailerFirst) {
      try {
        const delivered = await smtpDeliverWithNodemailerAttempt(data, cfg, attempt);
        if (cfg.smtpDebug) console.log("[Sandblast][contact:smtp_delivered]", attempt.label, "nodemailer", attempt.host, attempt.port, attempt.secure);
        return delivered;
      } catch (err) {
        const safeCode = smtpSafeErrorCode(err);
        const detail = err && err.smtpResponse ? String(err.smtpResponse).slice(0, 240) : "";
        if (safeCode !== "NODEMAILER_NOT_AVAILABLE") failures.push(`${attempt.label}:nodemailer:${safeCode}`);
        noteContactSmtpAttempt(attempt, "delivery_failed", { error: safeCode, detail: detail || "nodemailer" });
        console.log("[Sandblast][contact:smtp_attempt_failed]", attempt.label, "nodemailer", safeCode, detail);
        if (/SMTP_AUTH_FAILED|SMTP_DNS_FAILED/.test(safeCode)) continue;
      }
    }
    try {
      const delivered = await smtpDeliverWithAttempt(data, cfg, attempt);
      if (cfg.smtpDebug) console.log("[Sandblast][contact:smtp_delivered]", attempt.label, "manual", attempt.host, attempt.port, attempt.secure);
      return delivered;
    } catch (err) {
      const safeCode = smtpSafeErrorCode(err);
      const detail = err && err.smtpResponse ? String(err.smtpResponse).slice(0, 240) : "";
      failures.push(`${attempt.label}:manual:${safeCode}`);
      noteContactSmtpAttempt(attempt, "delivery_failed", { error: safeCode, detail });
      console.log("[Sandblast][contact:smtp_attempt_failed]", attempt.label, "manual", safeCode, detail);
    }
  }

  const finalErr = new Error(failures.join("|") || "SMTP_DELIVERY_FAILED");
  const timeoutHit = failures.find((x) => /SMTP_(?:CONNECT|SOCKET|COMMAND)_TIMEOUT|SMTP_TIMEOUT/.test(x));
  finalErr.code = failures.some((x) => /SMTP_AUTH_FAILED/.test(x)) ? "SMTP_AUTH_FAILED"
    : timeoutHit ? (timeoutHit.split(":").pop() || "SMTP_TIMEOUT")
    : "SMTP_DELIVERY_FAILED";
  finalErr.smtpAttempts = failures;
  throw finalErr;
}


app.options([
  "/api/contact",
  "/api/contact/health",
  "/api/contact/smtp-health",
  "/api/contact/smtp-send-test",
  "/api/lingosentinel/contact",
  "/api/lingosentinel/contact/health",
  "/api/lingosentinel/contact/smtp-health",
  "/api/lingosentinel/contact/smtp-send-test",
  "/api/lingosentinel/start/contact",
  "/api/lingosentinel/start/contact/health",
  "/api/lingosentinel/start/contact/smtp-health",
  "/api/lingosentinel/start/contact/smtp-send-test",
  "/contact",
  "/contact/health",
  "/contact/smtp-health",
  "/contact/smtp-send-test",
  "/lingosentinel/contact",
  "/lingosentinel/contact/health",
  "/lingosentinel/contact/smtp-health",
  "/lingosentinel/contact/smtp-send-test",
  "/lingosentinel/start/contact",
  "/lingosentinel/start/contact/health",
  "/lingosentinel/start/contact/smtp-health",
  "/lingosentinel/start/contact/smtp-send-test"
], (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);
  return res.status(204).end();
});

app.get(["/api/contact/health", "/api/lingosentinel/contact/health", "/api/lingosentinel/start/contact/health", "/contact/health", "/lingosentinel/contact/health", "/lingosentinel/start/contact/health"], (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);
  const cfg = contactConfig();
  return res.json({
    ok: true,
    route: "/api/lingosentinel/start/contact",
    canonicalRoute: "/api/lingosentinel/start/contact",
    healthRoute: "/api/lingosentinel/start/contact/health",
    aliases: [
      "/api/contact",
      "/api/contact/health",
      "/api/lingosentinel/contact",
      "/api/lingosentinel/contact/health",
      "/api/lingosentinel/start/contact",
      "/api/lingosentinel/start/contact/health",
      "/contact",
      "/contact/health",
      "/lingosentinel/contact",
      "/lingosentinel/contact/health",
      "/lingosentinel/start/contact",
      "/lingosentinel/start/contact/health"
    ],
    version: LINGOSENTINEL_CONTACT_ROUTE_VERSION,
    enabled: !!cfg.enabled,
    acceptsSubmissions: true,
    storageFallback: true,
    deliveryConfigured: isContactDeliveryConfigured(cfg),
    smtp: contactSmtpPublicDiagnostics(cfg),
    deliveredToConfigured: !!cfg.to,
    provider: cfg.emailProvider || "smtp",
    requiresConfiguration: !isContactDeliveryConfigured(cfg),
    note: "The route accepts and stores submissions even when SMTP delivery is not configured."
  });
});

app.get(["/api/contact/smtp-health", "/api/lingosentinel/contact/smtp-health", "/api/lingosentinel/start/contact/smtp-health", "/contact/smtp-health", "/lingosentinel/contact/smtp-health", "/lingosentinel/start/contact/smtp-health"], async (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);
  const cfg = contactConfig();
  const verifyRequested = /^(?:1|true|yes|on)$/i.test(cleanText(req.query && (req.query.verify || req.query.live || req.query.test) || ""));
  const verifyAuth = verifyRequested ? checkContactDiagnosticAccess(req) : { ok: true };
  let verify = verifyRequested && !verifyAuth.ok
    ? { requested: true, ok: false, skipped: true, error: "diagnostic_token_required" }
    : { requested: verifyRequested, ok: false, skipped: !verifyRequested };
  if (verifyRequested && verifyAuth.ok) {
    try {
      const result = await verifyContactSmtpConfig();
      verify = { requested: true, ok: true, result };
    } catch (err) {
      verify = {
        requested: true,
        ok: false,
        error: smtpSafeErrorCode(err),
        attempts: Array.isArray(err && err.smtpAttempts) ? err.smtpAttempts.slice(0, 8) : []
      };
    }
  }
  return res.json({
    ok: true,
    service: "lingosentinel-start-contact-smtp",
    routeMounted: true,
    version: LINGOSENTINEL_CONTACT_ROUTE_VERSION,
    canonicalRoute: "/api/lingosentinel/start/contact/smtp-health",
    diagnosticSafe: true,
    verify,
    smtp: contactSmtpPublicDiagnostics(cfg),
    deliveryReady: isContactDeliveryConfigured(cfg),
    meta: { v: PUBLIC_INDEX_VERSION, t: now() }
  });
});

app.all(["/api/contact/smtp-send-test", "/api/lingosentinel/contact/smtp-send-test", "/api/lingosentinel/start/contact/smtp-send-test", "/contact/smtp-send-test", "/lingosentinel/contact/smtp-send-test", "/lingosentinel/start/contact/smtp-send-test"], async (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);

  const auth = checkContactDiagnosticAccess(req);
  if (!auth.ok) {
    return res.status(403).json({ ok: false, service: "lingosentinel-start-contact-smtp-send-test", error: auth.error });
  }

  const cfg = contactConfig();
  const data = normalizeContactPayload({
    name: "SMTP Diagnostic",
    email: cfg.from || cfg.smtpUser || cfg.to,
    interest: "SMTP diagnostic",
    region: "Render",
    message: "Forced SMTP diagnostic send from LingoSentinel backend.",
    consent: true,
    source: "LingoSentinel SMTP diagnostic route"
  });

  try {
    const delivered = await sendContactEmailViaSmtp(data, { diagnostic: true, forceSynchronous: true });
    writeContactAudit(data, "diagnostic_delivered", { provider: delivered.provider, deliveredTo: delivered.deliveredTo, diagnostic: true });
    return res.status(200).json({ ok: true, service: "lingosentinel-start-contact-smtp-send-test", delivered: true, deliveredToConfigured: !!delivered.deliveredTo, traceId: data.traceId, result: { ok: true, provider: cleanText(delivered.provider || "smtp") }, smtp: contactSmtpPublicDiagnostics(cfg), message: "SMTP diagnostic email delivered." });
  } catch (err) {
    const code = smtpSafeErrorCode(err);
    const attempts = Array.isArray(err && err.smtpAttempts) ? err.smtpAttempts.slice(0, 8) : [];
    writeContactAudit(data, "diagnostic_failed", { error: code, smtpAttempts: attempts, diagnostic: true });
    return res.status(200).json({ ok: false, service: "lingosentinel-start-contact-smtp-send-test", delivered: false, error: code, attempts, traceId: data.traceId, smtp: contactSmtpPublicDiagnostics(cfg), message: "SMTP diagnostic send failed before delivery." });
  }
});

app.post(["/api/contact", "/api/lingosentinel/contact", "/api/lingosentinel/start/contact", "/contact", "/lingosentinel/contact", "/lingosentinel/start/contact"], async (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);

  if (!checkContactRateLimit(req)) {
    return res.status(429).json({
      ok: false,
      emailDelivered: false,
      error: "contact_rate_limited",
      message: "Too many contact attempts. Please wait and try again."
    });
  }

  const data = normalizeContactPayload(req.body);
  const errors = validateContactPayload(data);
  if (errors.length) {
    writeContactAudit(data, "rejected", { errors });
    return res.status(400).json({
      ok: false,
      emailDelivered: false,
      error: "invalid_contact_payload",
      errors
    });
  }

  try {
    const delivered = await sendContactEmailViaSmtp(data);
    writeContactAudit(data, "delivered", { provider: delivered.provider, deliveredTo: delivered.deliveredTo });
    return res.status(200).json({
      ok: true,
      received: true,
      stored: true,
      emailDelivered: true,
      deliveredToConfigured: !!delivered.deliveredTo,
      traceId: data.traceId,
      deliveryState: "delivered",
      message: "LingoSentinel inquiry delivered."
    });
  } catch (err) {
    const code = smtpSafeErrorCode(err);
    writeContactAudit(data, "stored_not_delivered", { error: code });
    console.log("[Sandblast][contact:delivery_error]", code, err && err.smtpResponse ? String(err.smtpResponse).slice(0, 240) : "");
    return res.status(202).json({
      ok: true,
      received: true,
      stored: true,
      emailDelivered: false,
      deliveredToConfigured: !!contactConfig().to,
      traceId: data.traceId,
      deliveryState: code === "CONTACT_SMTP_NOT_CONFIGURED" ? "stored_pending_smtp" : "stored_delivery_retry_needed",
      warning: code,
      message: code === "CONTACT_SMTP_NOT_CONFIGURED"
        ? "LingoSentinel inquiry received and stored. SMTP delivery is not configured yet."
        : "LingoSentinel inquiry received and stored. Email delivery needs attention."
    });
  }
});


let lastMemorySweepAt = 0;

function maybeSweepMemory() {
  const current = now();
  if (current - lastMemorySweepAt < CFG.memorySweepEveryMs) return;
  lastMemorySweepAt = current;
  const ttl = CFG.memoryTtlMs;
  const prune = (mapObj) => {
    if (!mapObj || typeof mapObj.forEach !== "function") return;
    for (const [key, value] of mapObj.entries()) {
      const at = Number((value && value.at) || (value && value.updatedAt) || 0);
      if (!at || current - at > ttl) mapObj.delete(key);
    }
  };
  prune(memory.lastBySession);
  prune(memory.supportBySession);
  prune(memory.transportBySession);
  prune(memory.spineBySession);
  pruneMapToMaxSize(memory.lastBySession, HARDENING_CONSTANTS.MAX_SESSIONS);
  pruneMapToMaxSize(memory.supportBySession, HARDENING_CONSTANTS.MAX_SESSIONS);
  pruneMapToMaxSize(memory.transportBySession, HARDENING_CONSTANTS.MAX_SESSIONS);
  pruneMapToMaxSize(memory.spineBySession, HARDENING_CONSTANTS.MAX_SESSIONS);
}

function shouldLogRequest(req, statusCode, durationMs) {
  const url = cleanText(req.originalUrl || req.url || req.path || "");
  if (CFG.httpLogEnabled) return true;
  if (Number(durationMs || 0) >= CFG.httpLogSlowMs) return true;
  if (Number(statusCode || 0) >= 500) return true;
  if (CFG.logHealthCalls && /\/health(?:$|\/|\?)/i.test(url)) return true;
  return false;
}

app.use((req, res, next) => {
  maybeSweepMemory();
  const startedAt = now();
  const traceId = cleanText(req.headers["x-sb-trace-id"] || makeTraceId("http"));
  req.sbTraceId = traceId;
  res.setHeader("x-sb-trace-id", traceId);
  res.on("finish", () => {
    const durationMs = now() - startedAt;
    if (!shouldLogRequest(req, res.statusCode, durationMs)) return;
    console.log("[Sandblast][http]", {
      traceId,
      method: req.method,
      path: req.originalUrl || req.url || req.path || "",
      status: res.statusCode,
      durationMs,
      sessionId: getSessionId(req)
    });
  });
  return next();
});

const chatEngineMod = tryRequireMany([
  "./chatEngine",
  "./chatEngine.js",
  "./ChatEngine",
  "./ChatEngine.js",
  "./utils/chatEngine",
  "./utils/chatEngine.js",
  "./Utils/chatEngine",
  "./Utils/chatEngine.js"
]);

const universalTranslatorAdapterMod = tryRequireMany([
  "./Data/marion/runtime/UniversalTranslatorAdapter",
  "./Data/marion/runtime/UniversalTranslatorAdapter.js",
  "./UniversalTranslatorAdapter",
  "./UniversalTranslatorAdapter.js",
  "./utils/UniversalTranslatorAdapter",
  "./utils/UniversalTranslatorAdapter.js",
  "./Utils/UniversalTranslatorAdapter",
  "./Utils/UniversalTranslatorAdapter.js"
]);

const languageSphereApiMiddlewareMod = tryRequireMany([
  "./Data/marion/runtime/languagesphere/LanguageSphereApiMiddleware",
  "./Data/marion/runtime/languagesphere/LanguageSphereApiMiddleware.js",
  "./languagesphere/LanguageSphereApiMiddleware",
  "./languagesphere/LanguageSphereApiMiddleware.js",
  "./LanguageSphereApiMiddleware",
  "./LanguageSphereApiMiddleware.js"
]);

const supportResponseMod = tryRequireMany([
  "./supportResponse",
  "./supportResponse.js",
  "./utils/supportResponse",
  "./utils/supportResponse.js",
  "./Utils/supportResponse",
  "./Utils/supportResponse.js"
]);

const voiceRouteMod = tryRequireMany([
  "./utils/voiceRoute",
  "./utils/voiceRoute.js",
  "./Utils/voiceRoute",
  "./Utils/voiceRoute.js"
]);

const ttsMod = tryRequireMany([
  "./tts",
  "./tts.js",
  "./utils/tts",
  "./utils/tts.js",
  "./Utils/tts",
  "./Utils/tts.js"
]);

const newscanadaCacheServiceMod = tryRequireMany([
  "./services/newscanadaCacheService",
  "./services/newscanadaCacheService.js",
  "./Services/newscanadaCacheService",
  "./Services/newscanadaCacheService.js",
  "./utils/newscanadaCacheService",
  "./utils/newscanadaCacheService.js",
  "./Utils/newscanadaCacheService",
  "./Utils/newscanadaCacheService.js"
]);

const newscanadaCacheJobMod = tryRequireMany([
  "./services/newscanadaCacheJob",
  "./services/newscanadaCacheJob.js",
  "./Services/newscanadaCacheJob",
  "./Services/newscanadaCacheJob.js",
  "./utils/newscanadaCacheJob",
  "./utils/newscanadaCacheJob.js",
  "./Utils/newscanadaCacheJob",
  "./Utils/newscanadaCacheJob.js"
]);

const newsCanadaFeedServiceMod = tryRequireMany([
  "./services/newsCanadaFeedService",
  "./services/newsCanadaFeedService.js",
  "./Services/newsCanadaFeedService",
  "./Services/newsCanadaFeedService.js",
  "./utils/newsCanadaFeedService",
  "./utils/newsCanadaFeedService.js",
  "./Utils/newsCanadaFeedService",
  "./Utils/newsCanadaFeedService.js",
  "./public newscanada/js/newsCanadaApi",
  "./public newscanada/js/newsCanadaApi.js",
  "./public newscanada/js/newscanada.rss.service",
  "./public newscanada/js/newscanada.rss.service.js"
]);


const newsCanadaRoutesMod = tryRequireMany([
  "./routes/newscanada.routes",
  "./routes/newscanada.routes.js",
  "./routes/manualNewsCanadaRoutes",
  "./routes/manualNewsCanadaRoutes.js",
  "./routes/newscanadaRoutes",
  "./routes/newscanadaRoutes.js"
]);

const cbcRssRoutesMod = tryRequireMany([
  "./routes/CBCRSS",
  "./routes/CBCRSS.js",
  "./Routes/CBCRSS",
  "./Routes/CBCRSS.js"
]);

const lingoSentinelPublishRoutesMod = tryRequireMany([
  "./Data/marion/runtime/LingoSentinel/LingoSentinelPublishRoute",
  "./Data/marion/runtime/LingoSentinel/LingoSentinelPublishRoute.js",
  "./Data/marion/runtime/LingoSentinelPublishRoute",
  "./Data/marion/runtime/LingoSentinelPublishRoute.js",
  "./routes/LingoSentinelPublishRoute",
  "./routes/LingoSentinelPublishRoute.js",
  "./Routes/LingoSentinelPublishRoute",
  "./Routes/LingoSentinelPublishRoute.js",
  "./LingoSentinel/LingoSentinelPublishRoute",
  "./LingoSentinel/LingoSentinelPublishRoute.js",
  "./runtime/LingoSentinel/LingoSentinelPublishRoute",
  "./runtime/LingoSentinel/LingoSentinelPublishRoute.js"
]);

const lingoSentinelSubscribeTokenRoutesMod = tryRequireMany([
  "./Data/marion/runtime/LingoSentinel/LingoSentinelSubscribeTokenRoute",
  "./Data/marion/runtime/LingoSentinel/LingoSentinelSubscribeTokenRoute.js",
  "./Data/marion/runtime/LingoSentinelSubscribeTokenRoute",
  "./Data/marion/runtime/LingoSentinelSubscribeTokenRoute.js",
  "./routes/LingoSentinelSubscribeTokenRoute",
  "./routes/LingoSentinelSubscribeTokenRoute.js",
  "./Routes/LingoSentinelSubscribeTokenRoute",
  "./Routes/LingoSentinelSubscribeTokenRoute.js",
  "./LingoSentinel/LingoSentinelSubscribeTokenRoute",
  "./LingoSentinel/LingoSentinelSubscribeTokenRoute.js",
  "./runtime/LingoSentinel/LingoSentinelSubscribeTokenRoute",
  "./runtime/LingoSentinel/LingoSentinelSubscribeTokenRoute.js"
]);

const lingoSentinelEngineMod = tryRequireMany([
  "./Data/marion/runtime/LingoSentinel/LingoSentinelEngine",
  "./Data/marion/runtime/LingoSentinel/LingoSentinelEngine.js",
  "./Data/marion/runtime/LingoSentinelEngine",
  "./Data/marion/runtime/LingoSentinelEngine.js",
  "./LingoSentinel/LingoSentinelEngine",
  "./LingoSentinel/LingoSentinelEngine.js",
  "./runtime/LingoSentinel/LingoSentinelEngine",
  "./runtime/LingoSentinel/LingoSentinelEngine.js",
  "./LingoSentinelEngine",
  "./LingoSentinelEngine.js"
]);

function resolveExpressRouterFromModule(mod) {
  if (!mod) return null;
  if (typeof mod === "function" && typeof mod.use === "function") return mod;
  if (mod.default && typeof mod.default === "function" && typeof mod.default.use === "function") return mod.default;
  if (mod.router && typeof mod.router === "function" && typeof mod.router.use === "function") return mod.router;
  if (typeof mod.createRouter === "function") {
    try {
      const built = mod.createRouter();
      if (built && typeof built.use === "function") return built;
    } catch (_) {}
  }
  return null;
}

function mountLingoSentinelPublishRoute(appRef, mod) {
  if (!appRef || !mod) return false;
  const router = resolveExpressRouterFromModule(mod);
  if (router) {
    appRef.use("/api/lingosentinel", router);
    appRef.use("/api/lingosentinel/publish", router);
    appRef.use("/api/lingosentinel/link", router);
    return true;
  }
  const register =
    (typeof mod.registerLingoSentinelPublishRoute === "function" && mod.registerLingoSentinelPublishRoute) ||
    (typeof mod.mountLingoSentinelPublishRoute === "function" && mod.mountLingoSentinelPublishRoute) ||
    (typeof mod.register === "function" && mod.register) ||
    (typeof mod.mount === "function" && mod.mount) ||
    (typeof mod.default === "function" && mod.default);
  if (typeof register !== "function") return false;
  try {
    register(appRef, {
      basePath: "/api/lingosentinel",
      publishPath: "/api/lingosentinel/publish",
      linkPath: "/api/lingosentinel/link",
      version: LINGOSENTINEL_GATEWAY_INDEX_VERSION
    });
    return true;
  } catch (err) {
    console.log("[Sandblast][LingoSentinel] publish_route_register_failed", {
      error: cleanText(err && (err.message || err) || "register_failed")
    });
    return false;
  }
}

function mountLingoSentinelSubscribeTokenRoute(appRef, mod) {
  if (!appRef || !mod) return false;
  const router = resolveExpressRouterFromModule(mod);
  if (router) {
    // Token route owns /token and /token/health internally, so mount only at
    // the LingoSentinel API base. Do not also mount at /token or Express will
    // produce /token/token.
    appRef.use("/api/lingosentinel", router);
    return true;
  }
  const register =
    (typeof mod.registerLingoSentinelSubscribeTokenRoute === "function" && mod.registerLingoSentinelSubscribeTokenRoute) ||
    (typeof mod.mountLingoSentinelSubscribeTokenRoute === "function" && mod.mountLingoSentinelSubscribeTokenRoute) ||
    (typeof mod.register === "function" && mod.register) ||
    (typeof mod.mount === "function" && mod.mount) ||
    (typeof mod.default === "function" && mod.default);
  if (typeof register !== "function") return false;
  try {
    register(appRef, {
      basePath: "/api/lingosentinel",
      tokenPath: "/api/lingosentinel/token",
      tokenHealthPath: "/api/lingosentinel/token/health",
      version: LINGOSENTINEL_GATEWAY_INDEX_VERSION
    });
    return true;
  } catch (err) {
    console.log("[Sandblast][LingoSentinel] subscribe_token_route_register_failed", {
      error: cleanText(err && (err.message || err) || "register_failed")
    });
    return false;
  }
}

const marionBridgeMod = tryRequireMany([
  // RUNTIME-COHESION-FINAL-AUTHORITY-V40 + CONVERSATION-QUALITY-TRANSPORT-PRESERVE-V41:
  // Prefer the active Data runtime bridge first so index.js, MarionBridge,
  // ComposeMarionResponse, and ChatEngine share one live authority path.
  "./Data/marion/runtime/marionBridge",
  "./Data/marion/runtime/marionBridge.js",
  "./marionBridge",
  "./marionBridge.js",
  "./runtime/marionBridge",
  "./runtime/marionBridge.js",
  "./utils/marionBridge",
  "./utils/marionBridge.js",
  "./Utils/marionBridge",
  "./Utils/marionBridge.js"
]);

const lingoSentinelGatewayMod = tryRequireMany([
  // LINGOSENTINEL LINK GATEWAY HOTFIX:
  // The active gateway was renamed to LingoSentinelLinkGateway and lives inside
  // Data/marion/runtime/LingoSentinel. Prefer that path before legacy aliases so
  // index.js does not silently fall back to the retired gateway name.
  "./Data/marion/runtime/LingoSentinel/LingoSentinelLinkGateway",
  "./Data/marion/runtime/LingoSentinel/LingoSentinelLinkGateway.js",
  "./Data/marion/runtime/LingoSentinelLinkGateway",
  "./Data/marion/runtime/LingoSentinelLinkGateway.js",
  "./LingoSentinel/LingoSentinelLinkGateway",
  "./LingoSentinel/LingoSentinelLinkGateway.js",
  "./runtime/LingoSentinel/LingoSentinelLinkGateway",
  "./runtime/LingoSentinel/LingoSentinelLinkGateway.js",
  "./runtime/LingoSentinelLinkGateway",
  "./runtime/LingoSentinelLinkGateway.js",
  "./Data/marion/runtime/MarionLingoSentinelGateway",
  "./Data/marion/runtime/MarionLingoSentinelGateway.js",
  "./MarionLingoSentinelGateway",
  "./MarionLingoSentinelGateway.js",
  "./runtime/MarionLingoSentinelGateway",
  "./runtime/MarionLingoSentinelGateway.js",
  "./Data/marion/runtime/LingoSentinelGateway",
  "./Data/marion/runtime/LingoSentinel/LingoSentinelGateway",
  "./Data/marion/runtime/LingoSentinelGateway.js",
  "./Data/marion/runtime/LingoSentinel/LingoSentinelGateway.js",
  "./LingoSentinelGateway",
  "./LingoSentinel/LingoSentinelGateway",
  "./LingoSentinelGateway.js",
  "./LingoSentinel/LingoSentinelGateway.js",
  "./runtime/LingoSentinelGateway",
  "./runtime/LingoSentinelGateway.js"
]);
function resolveIndexLingoSentinelGatewayRunner(mod) {
  if (!mod) return null;
  const candidates = [
    mod.runMarionLingoSentinelLinkGateway,
    mod.runLingoSentinelLinkGateway,
    mod.runMarionLingoSentinelGateway,
    mod.runLingoSentinelGateway,
    mod.default
  ];
  for (const fn of candidates) {
    if (typeof fn === "function") return fn.bind(mod);
  }
  if (typeof mod === "function") return mod;
  return null;
}
const runIndexLingoSentinelGateway = resolveIndexLingoSentinelGatewayRunner(lingoSentinelGatewayMod);
const buildIndexLingoSentinelMarionPayload = lingoSentinelGatewayMod && typeof lingoSentinelGatewayMod.buildMarionBridgePayload === "function" ? lingoSentinelGatewayMod.buildMarionBridgePayload.bind(lingoSentinelGatewayMod) : null;

const composeMarionResponseMod = tryRequireMany([
  "./Data/marion/runtime/composeMarionResponse",
  "./Data/marion/runtime/composeMarionResponse.js",
  "./composeMarionResponse",
  "./composeMarionResponse.js",
  "./runtime/composeMarionResponse",
  "./runtime/composeMarionResponse.js",
  "./utils/composeMarionResponse",
  "./utils/composeMarionResponse.js",
  "./Utils/composeMarionResponse",
  "./Utils/composeMarionResponse.js"
]);

const marionIntentRouterMod = tryRequireMany([
  "./Data/marion/runtime/marionIntentRouter",
  "./Data/marion/runtime/marionIntentRouter.js"
]);

const marionDomainRegistryMod = tryRequireMany([
  "./Data/marion/runtime/marionDomainRegistry",
  "./Data/marion/runtime/marionDomainRegistry.js"
]);

const DOMAIN_RETRIEVER_REQUIRE_CANDIDATES = Object.freeze([
  "./Data/marion/runtime/domainRetriever.js",
  "./Data/marion/runtime/domainRetriever",
  "./Data/marion/domainRetriever.js",
  "./Data/marion/domainRetriever",
  "./domainRetriever.js",
  "./domainRetriever"
]);

const marionDomainRetrieverLoaded = tryRequireManyWithStatus(DOMAIN_RETRIEVER_REQUIRE_CANDIDATES);
const marionDomainRetrieverMod = marionDomainRetrieverLoaded.mod;

const marionDomainRouterMod = tryRequireMany([
  "./Utils/domainRouter",
  "./Utils/domainRouter.js",
  "./utils/domainRouter",
  "./utils/domainRouter.js",
  "./Data/marion/runtime/domainRouter",
  "./Data/marion/runtime/domainRouter.js"
]);

const marionCommandNormalizerMod = tryRequireMany([
  "./Data/marion/runtime/marionCommandNormalizer",
  "./Data/marion/runtime/marionCommandNormalizer.js",
  "./marionCommandNormalizer",
  "./marionCommandNormalizer.js",
  "./Utils/marionCommandNormalizer",
  "./Utils/marionCommandNormalizer.js",
  "./utils/marionCommandNormalizer",
  "./utils/marionCommandNormalizer.js"
]);

const marionLoopGuardMod = tryRequireMany([
  "./Data/marion/runtime/marionLoopGuard",
  "./Data/marion/runtime/marionLoopGuard.js",
  "./utils/marionLoopGuard",
  "./utils/marionLoopGuard.js"
]);

const marionFinalEnvelopeMod = tryRequireMany([
  "./Data/marion/runtime/marionFinalEnvelope",
  "./Data/marion/runtime/marionFinalEnvelope.js",
  "./utils/marionFinalEnvelope",
  "./utils/marionFinalEnvelope.js"
]);

// Marion emotion runtime is diagnostic-only at index scope.
// Emotional interpretation remains inside MarionBridge / emotionRuntime.
const marionEmotionRuntimeMod = tryRequireMany([
  "./Data/marion/runtime/emotion/emotionRuntime",
  "./Data/marion/runtime/emotion/emotionRuntime.js"
]);

const stateSpineMod = tryRequireMany([
  "./stateSpine",
  "./stateSpine.js",
  "./utils/stateSpine",
  "./utils/stateSpine.js",
  "./Utils/stateSpine",
  "./Utils/stateSpine.js"
]);

const nyxPackRuntimeAdapterMod = tryRequireMany([
  "./Data/marion/runtime/nyx_pack_runtime_adapter",
  "./Data/marion/runtime/nyx_pack_runtime_adapter.js",
  "./nyx_pack_runtime_adapter",
  "./nyx_pack_runtime_adapter.js",
  "./runtime/nyx_pack_runtime_adapter",
  "./runtime/nyx_pack_runtime_adapter.js",
  "./utils/nyx_pack_runtime_adapter",
  "./utils/nyx_pack_runtime_adapter.js",
  "./Utils/nyx_pack_runtime_adapter",
  "./Utils/nyx_pack_runtime_adapter.js"
]);

// PHASE-3 ACTIVE-FLOW DISABLE:
// SiteBridge / psycheBridge must not participate in the live Marion response path.
// Keep this null so diagnostics remain safe and no duplicate bridge layer can re-enter.
const siteBridgeMod = null;

const s2sMod = tryRequireMany([
  "./s2s",
  "./s2s.js",
  "./utils/s2s",
  "./utils/s2s.js",
  "./Utils/s2s",
  "./Utils/s2s.js"
]);



let nyxPacketPackCache = null;
let nyxPacketPackCacheAt = 0;

function candidateNyxPacketPackFiles() {
  // NYX-DATA-PACKET-PATH-V43:
  // The active 40D greeting packet pack lives under Data/Nyx.
  // Prefer that canonical path before legacy Marion/runtime fallbacks so
  // greeting.40d entries are the first valid packet source discovered.
  return uniq([
    path.join(__dirname, "Data", "Nyx", "packets_v1_4.json"),
    path.join(__dirname, "Data", "Nyx", "packets_v1_3.json"),
    path.join(__dirname, "Data", "Nyx", "packets.json"),
    path.join(__dirname, "Data", "nyx", "packets_v1_4.json"),
    path.join(__dirname, "Data", "nyx", "packets_v1_3.json"),
    path.join(__dirname, "Data", "nyx", "packets.json"),
    path.join(__dirname, "Data", "marion", "runtime", "packets_v1_4.json"),
    path.join(__dirname, "Data", "marion", "runtime", "packets_v1_3.json"),
    path.join(__dirname, "Data", "marion", "runtime", "packets.json"),
    path.join(__dirname, "Data", "marion", "conversational_packs", "packets_v1_4.json"),
    path.join(__dirname, "Data", "marion", "conversational_packs", "packets_v1_3.json"),
    path.join(__dirname, "Data", "marion", "conversational_packs", "packets.json"),
    path.join(__dirname, "Data", "marion", "packs", "packets_v1_4.json"),
    path.join(__dirname, "Data", "marion", "packs", "packets_v1_3.json"),
    path.join(__dirname, "Data", "marion", "packs", "packets.json"),
    path.join(__dirname, "packets_v1_4.json"),
    path.join(__dirname, "packets_v1_3.json"),
    path.join(__dirname, "packets.json")
  ]);
}

function looksLikeNyxPacketPack(value) {
  const pack = isObj(value) ? value : {};
  const packets = Array.isArray(pack.packets) ? pack.packets : [];
  if (!packets.length) return false;
  return packets.some((packet) => {
    const id = cleanText(packet && packet.id || "");
    const type = cleanText(packet && packet.type || "");
    return /^general\.greetings_first$/i.test(id) ||
      /^greeting\.40d\./i.test(id) ||
      /greeting/i.test(type);
  });
}

function findNyxPacketPackFile() {
  for (const file of candidateNyxPacketPackFiles()) {
    try {
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      if (looksLikeNyxPacketPack(parsed)) return file;
    } catch (_) {}
  }

  // Fallback discovery intentionally scans both Data/Nyx and legacy
  // Data/marion locations. This protects future pack moves without allowing
  // node_modules/.git traversal or broad filesystem scans.
  const roots = uniq([
    path.join(__dirname, "Data", "Nyx"),
    path.join(__dirname, "Data", "nyx"),
    path.join(__dirname, "Data", "marion")
  ]);
  const stack = [];
  for (const root of roots) {
    try {
      if (fs.existsSync(root) && fs.statSync(root).isDirectory()) stack.push(root);
    } catch (_) {}
  }
  let checked = 0;
  while (stack.length && checked < 520) {
    const dir = stack.pop();
    try {
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!/node_modules|\.git/i.test(entry.name)) stack.push(full);
          continue;
        }
        if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue;
        if (!/(packet|phrase|conversation|greet|pack)/i.test(entry.name)) continue;
        checked += 1;
        try {
          const parsed = JSON.parse(fs.readFileSync(full, "utf8"));
          if (looksLikeNyxPacketPack(parsed)) return full;
        } catch (_) {}
      }
    } catch (_) {}
  }
  return "";
}

function getNyxPacketPack() {
  const ttlMs = 15000;
  if (nyxPacketPackCache && (now() - nyxPacketPackCacheAt < ttlMs)) return nyxPacketPackCache;
  const file = findNyxPacketPackFile();
  if (!file) {
    nyxPacketPackCache = { ok: false, packets: [], meta: { source: "missing", searched: candidateNyxPacketPackFiles().map((p) => path.relative(__dirname, p)) } };
    nyxPacketPackCacheAt = now();
    return nyxPacketPackCache;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    nyxPacketPackCache = {
      ...(isObj(parsed) ? parsed : {}),
      ok: true,
      __file: file,
      __relativeFile: path.relative(__dirname, file)
    };
    nyxPacketPackCacheAt = now();
    return nyxPacketPackCache;
  } catch (err) {
    nyxPacketPackCache = { ok: false, packets: [], meta: { source: "parse_failed", file: path.relative(__dirname, file), error: cleanText(err && (err.message || err)) } };
    nyxPacketPackCacheAt = now();
    return nyxPacketPackCache;
  }
}

function packetBridgeInputSource(norm) {
  const body = isObj(norm && norm.body) ? norm.body : {};
  const payload = isObj(norm && norm.payload) ? norm.payload : {};
  return cleanText(
    norm && norm.inputSource ||
    body.inputSource ||
    payload.inputSource ||
    body.source ||
    payload.source ||
    "text"
  ).toLowerCase() || "text";
}

function normalizeNyxPacketBridgeText(text) {
  const raw = cleanText(text || "");
  if (!raw) return "";
  const t = raw
    .replace(/[’]/g, "'")
    .replace(/^\s*(nick|nicks|nix|mix|mike)\b/i, "Nyx")
    .replace(/\s+/g, " ")
    .trim();
  const alias = "(?:nyx|nick|nicks|nix|mix|mike)";
  const emotionMap = [
    ["stressed", "nyx, i'm stressed"],
    ["stress", "nyx, i'm stressed"],
    ["overwhelmed", "i'm overwhelmed"],
    ["anxious", "nyx, i feel anxious"],
    ["nervous", "i'm nervous"],
    ["frustrated", "nyx, i'm frustrated"],
    ["annoyed", "i'm annoyed"],
    ["sad", "nyx, i'm sad"],
    ["down", "i feel down"],
    ["angry", "nyx, i'm angry"],
    ["mad", "i'm really mad right now"],
    ["confused", "nyx, i'm confused"],
    ["lonely", "nyx, i feel alone"],
    ["alone", "nyx, i feel alone"]
  ];
  for (const [word, canonical] of emotionMap) {
    const rx = new RegExp(`^${alias}[, ]+(?:i\\s*(?:am|m)\\s+|i['\\u2019]?m\\s+|im\\s+)?${word}$`, "i");
    if (rx.test(t)) return canonical;
  }
  if (new RegExp(`^${alias}[, ]+(?:we\\s+have\\s+a\\s+problem|something\\s+is\\s+wrong|problem)$`, "i").test(t)) return "nyx, we have a problem";
  return t;
}

function packetBridgeMarionIntent(packetBridge, norm) {
  const bridge = isObj(packetBridge) ? packetBridge : {};
  const greeting = extractGreetingBridgeFields(bridge, norm);
  const rawIntent = cleanText(greeting.intent || bridge.intent || bridge.sessionPatch && bridge.sessionPatch.lastGreetingIntent || "");
  const rawTone = cleanText(greeting.tone || bridge.tone || bridge.sessionPatch && bridge.sessionPatch.lastGreetingTone || "");
  const rawPresence = cleanText(greeting.presenceProfile || bridge.presenceProfile || bridge.nyxStateHint || "");
  const combined = lower(`${rawIntent} ${rawTone} ${rawPresence} ${cleanText(norm && norm.text || "")}`);
  if (!rawIntent && !rawTone && !rawPresence) return null;

  let intent = "simple_chat";
  let domain = "general";
  let confidence = 0.62;
  if (/(distress|anxiety|sadness|loneliness|anger|frustration|emotional|stressed|overwhelmed|support|calming|grounding|compassionate|empathetic|validating|contained)/i.test(combined)) {
    intent = "emotional_support";
    domain = "emotional";
    confidence = 0.86;
  } else if (/(problem_report|system_test|mic_check|diagnostic|debug|technical|confusion)/i.test(combined)) {
    intent = "technical_debug";
    domain = "technical";
    confidence = 0.78;
  } else if (/(continuation|returning|quick_question|presence_check|basic_greeting|time_greeting|casual_greeting|social_checkin|help_request)/i.test(combined)) {
    intent = rawIntent || "simple_chat";
    domain = "general";
    confidence = 0.7;
  }

  return {
    activate: intent !== "simple_chat" || !!rawIntent,
    intent,
    confidence,
    reason: "nyx_packet_preclassification",
    source: "nyx_packet_runtime_adapter",
    triggerSource: cleanText(bridge.inputSource || packetBridgeInputSource(norm) || "text"),
    domain,
    routeDomain: domain,
    packetIntent: rawIntent,
    packetTone: rawTone,
    packetPresenceProfile: rawPresence,
    matchedPacketId: cleanText(bridge.matchedPacketId || bridge.packetId || bridge.packet || greeting.id || "")
  };
}

function buildPacketBridgeRouting(packetIntent, lane) {
  const pi = isObj(packetIntent) ? packetIntent : {};
  const domain = cleanText(pi.domain || pi.routeDomain || "general") || "general";
  return {
    domain,
    routeDomain: domain,
    intent: cleanText(pi.intent || "simple_chat") || "simple_chat",
    lane: cleanText(lane || "general") || "general",
    mode: domain === "emotional" ? "supportive_reasoning" : domain === "technical" ? "diagnostic" : "balanced",
    depth: domain === "emotional" ? "high" : domain === "technical" ? "forensic" : "balanced",
    useDomainKnowledge: domain !== "general",
    useMemory: domain === "emotional" || domain === "memory",
    triggerSource: cleanText(pi.triggerSource || pi.source || "nyx_packet_preclassification")
  };
}

function applyPacketBridgePreclassification(norm, packetBridge) {
  if (!isObj(norm) || !isObj(packetBridge) || packetBridge.ok === false) return null;
  const packetIntent = packetBridgeMarionIntent(packetBridge, norm);
  if (!packetIntent || !packetIntent.activate) return null;
  norm.packetPreBridge = packetBridge;
  norm.packetPreclassification = packetIntent;
  norm.marionIntent = {
    ...(isObj(norm.marionIntent) ? norm.marionIntent : {}),
    ...packetIntent,
    previousIntent: cleanText(norm.marionIntent && norm.marionIntent.intent || "")
  };
  norm.marionRouting = {
    ...(isObj(norm.marionRouting) ? norm.marionRouting : {}),
    ...buildPacketBridgeRouting(packetIntent, norm.lane)
  };
  norm.domainHint = cleanText(norm.domainHint || packetIntent.domain || "");
  norm.intentHint = cleanText(norm.intentHint || packetIntent.intent || "");
  return packetIntent;
}

function buildPacketBridgeFallbackSelected(norm, packetBridge) {
  const bridge = isObj(packetBridge) ? packetBridge : {};
  const reply = finalizeRenderableReply(bridge.reply || "", norm, "nyx_packet_bridge", "packet_bridge_no_marion");
  if (!reply || isBlockedLoopingSupportReply(reply) || isConversationDiagnosticFallbackReply(reply)) return null;
  const greeting = extractGreetingBridgeFields(bridge, norm);
  const sessionPatch = isObj(bridge.sessionPatch) ? { ...bridge.sessionPatch } : {};
  const memoryPatch = isObj(bridge.memoryPatch) ? { ...bridge.memoryPatch } : {};
  const presenceProfile = cleanText(bridge.presenceProfile || greeting.presenceProfile || sessionPatch.presenceProfile || "warm") || "warm";
  const matchedPacketId = cleanText(bridge.matchedPacketId || bridge.packetId || bridge.packet || greeting.id || "");
  const matchedPacketType = cleanText(bridge.matchedPacketType || (matchedPacketId ? "greeting" : "") || "");
  return {
    ok: true,
    final: true,
    finalized: true,
    handled: true,
    marionFinal: false,
    packetFinal: true,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    response: reply,
    spokenText: reply,
    finalEnvelope: {
      reply,
      text: reply,
      displayReply: reply,
      spokenText: reply,
      final: true,
      marionFinal: false,
      handled: true,
      authority: "nyx_packet_bridge_no_marion",
      contractVersion: "nyx.packet.bridge/1.0"
    },
    payload: {
      reply,
      text: reply,
      message: reply,
      spokenText: reply,
      final: true,
      marionFinal: false,
      packetFinal: true,
      matchedPacketId,
      matchedPacketType,
      greeting: greeting.active ? greeting : undefined,
      sessionPatch,
      memoryPatch,
      presenceProfile,
      nyxStateHint: cleanText(bridge.nyxStateHint || presenceProfile)
    },
    matchedPacketId,
    matchedPacketType,
    packetId: matchedPacketId,
    greeting: greeting.active ? greeting : undefined,
    sessionPatch,
    memoryPatch,
    presenceProfile,
    nyxStateHint: cleanText(bridge.nyxStateHint || presenceProfile),
    speech: {
      enabled: true,
      silent: false,
      text: reply,
      textDisplay: reply,
      textSpeak: reply,
      presenceProfile,
      nyxStateHint: cleanText(bridge.nyxStateHint || presenceProfile)
    },
    lane: cleanText(norm && norm.lane || "general") || "general",
    laneId: cleanText(norm && norm.lane || "general") || "general",
    sessionLane: cleanText(norm && norm.lane || "general") || "general",
    traceId: cleanText(norm && norm.traceId || makeTraceId("packet")),
    requestId: makeTraceId("req"),
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      indexRole: "transport_only_packet_assist",
      transportOnly: true,
      replyAuthority: "nyx_packet_bridge_no_marion",
      semanticAuthority: "packet_greeting_assistive",
      packetStateBridgeActive: true,
      packetBridgePackFile: cleanText(bridge.packFile || ""),
      matchedPacketId,
      matchedPacketType,
      marionAuthorityPreserved: true,
      usedOnlyBecauseMarionFinalMissing: true
    }
  };
}

const PACKET_FINAL_SELECTION_GENERIC_REPLY_PATTERNS = [
  /tell me the exact target\b.*\bspecific,? user-facing answer/i,
  /i['’]?m carrying the previous answer forward rather than restarting/i,
  /the next move is to build from the established priority/i,
  /give me the exact piece you want to continue/i,
  /tell me the exact piece you want to continue/i,
  /send the exact file, route, or response you want checked next/i,
  /i need one specific command to continue (cleanly|clearly)/i,
  /ready\.?\s*send (your next message|the next instruction|the specific file)/i
];

function isGenericContinuationSelectionReply(value) {
  const text = cleanText(value || "");
  if (!text) return false;
  const key = lower(text).replace(/\s+/g, " ").trim();
  return PACKET_FINAL_SELECTION_GENERIC_REPLY_PATTERNS.some((rx) => rx.test(text) || rx.test(key));
}

function packetBridgeSelectionIntent(packetBridge, norm) {
  const bridge = isObj(packetBridge) ? packetBridge : {};
  const greeting = extractGreetingBridgeFields(bridge, norm);
  const sessionPatch = isObj(bridge.sessionPatch) ? bridge.sessionPatch : {};
  const pre = isObj(norm && norm.packetPreclassification) ? norm.packetPreclassification : {};
  return lower(cleanText(
    greeting.intent || bridge.intent || sessionPatch.lastGreetingIntent || pre.packetIntent || pre.intent || ""
  ));
}

function isPacketBridgeGreetingOrSignalIntent(intent) {
  const key = lower(intent || "");
  return !!key && /^(basic_greeting|time_greeting|casual_greeting|social_checkin|presence_check|mic_check|system_test|returning_user|continuation_request|help_request|quick_question|problem_report|emotional_checkin|distress_signal|frustration_signal|sadness_signal|anxiety_signal|loneliness_signal|anger_signal|confusion_signal)$/.test(key);
}

function isPacketBridgeAssistiveTurn(norm, packetBridge) {
  if (!isObj(packetBridge) || packetBridge.ok === false) return false;
  if (!cleanText(packetBridge.reply || "")) return false;
  const matchedPacketId = cleanText(packetBridge.matchedPacketId || packetBridge.packetId || packetBridge.packet || "");
  const intent = packetBridgeSelectionIntent(packetBridge, norm);
  const normalizedInput = normalizeNyxPacketBridgeText(norm && norm.text || "");
  if (isGreetingOnlyTurn(norm && norm.text || "") || isGreetingOnlyTurn(normalizedInput)) return true;
  if (isPacketBridgeGreetingOrSignalIntent(intent) && matchedPacketId) return true;
  return /^general\.greeting_40d_/i.test(matchedPacketId);
}

function shouldUsePacketBridgeFinalSelectionGuard(norm, packetBridge, selectedReply) {
  if (!isPacketBridgeAssistiveTurn(norm, packetBridge)) return false;
  if (!isGenericContinuationSelectionReply(selectedReply)) return false;
  const packetReply = cleanText(packetBridge && packetBridge.reply || "");
  if (!packetReply || isBlockedLoopingSupportReply(packetReply) || isConversationDiagnosticFallbackReply(packetReply)) return false;
  return true;
}

function applyPacketBridgeFinalSelectionGuard(norm, selected, packetBridge, marion, selectedReply) {
  if (!shouldUsePacketBridgeFinalSelectionGuard(norm, packetBridge, selectedReply)) return null;
  const guarded = buildPacketBridgeFallbackSelected(norm, packetBridge);
  if (!guarded) return null;
  const originalReply = cleanText(selectedReply || selected && (selected.reply || selected.text || selected.payload && selected.payload.reply) || "");
  const matchedPacketId = cleanText(packetBridge.matchedPacketId || packetBridge.packetId || packetBridge.packet || guarded.matchedPacketId || "");
  guarded.bridge = marion || selected && selected.bridge || null;
  guarded.meta = {
    ...(isObj(guarded.meta) ? guarded.meta : {}),
    replyAuthority: "nyx_packet_bridge_greeting_guard",
    semanticAuthority: "packet_bridge_final_selection_guard",
    packetGreetingFinalSelectionGuard: true,
    originalMarionReplySuppressed: clipText(originalReply, 260),
    originalMarionReplyWasGenericContinuation: true,
    matchedPacketId,
    correction: "generic_marion_continuation_overrode_packet_signal",
    marionAuthorityPreserved: true,
    marionFinal: false,
    packetFinal: true
  };
  guarded.payload = {
    ...(isObj(guarded.payload) ? guarded.payload : {}),
    packetGreetingFinalSelectionGuard: true,
    originalMarionReplySuppressed: clipText(originalReply, 260),
    matchedPacketId,
    marionFinal: false,
    packetFinal: true
  };
  guarded.finalEnvelope = {
    ...(isObj(guarded.finalEnvelope) ? guarded.finalEnvelope : {}),
    authority: "nyx_packet_bridge_greeting_guard",
    marionFinal: false,
    packetFinal: true
  };
  guarded.marionFinal = false;
  guarded.packetFinal = true;
  return guarded;
}


function resolveNyxPacketBridge(norm, selected, marion, priorTurn) {
  if (!nyxPackRuntimeAdapterMod || typeof nyxPackRuntimeAdapterMod.resolveNyxPacket !== "function") {
    return { ok: false, source: "adapter_unavailable", packet: null, chips: [] };
  }
  const pack = getNyxPacketPack();
  if (!looksLikeNyxPacketPack(pack)) {
    return { ok: false, source: "pack_unavailable", packet: null, chips: [], packFile: cleanText(pack && pack.__relativeFile || "") };
  }
  const source = packetBridgeInputSource(norm);
  const session = {
    ...(isObj(priorTurn) ? priorTurn : {}),
    ...(isObj(norm && norm.body && norm.body.session) ? norm.body.session : {}),
    lane: cleanText(norm && norm.lane || "general") || "general",
    inputSource: source,
    source
  };
  const packetMatchText = normalizeNyxPacketBridgeText(norm && norm.text || "");
  const ctx = {
    text: packetMatchText,
    message: packetMatchText,
    userText: packetMatchText,
    originalText: cleanText(norm && norm.text || ""),
    lane: cleanText(norm && norm.lane || "general") || "general",
    intent: "greeting",
    source,
    inputSource: source,
    session,
    backendPayload: isObj(selected) ? selected : (isObj(marion) ? marion : {}),
    freshMarionFinal: hasFreshMarionFinalEnvelope(selected || marion || {}),
    backendFailed: false,
    replayDetected: false,
    seed: replyHash(`${cleanText(norm && norm.text || "")}:${cleanText(norm && norm.turnId || "")}`)
  };
  try {
    const bridge = nyxPackRuntimeAdapterMod.resolveNyxPacket(pack, ctx);
    return {
      ...(isObj(bridge) ? bridge : {}),
      ok: true,
      packFile: cleanText(pack.__relativeFile || ""),
      inputSource: source
    };
  } catch (err) {
    console.log("[Sandblast][packetBridge:error]", { traceId: cleanText(norm && norm.traceId || ""), error: cleanText(err && (err.stack || err.message || err)) });
    return { ok: false, source: "packet_bridge_error", packet: null, chips: [], error: cleanText(err && (err.message || err)) };
  }
}

function mergePatchObject(base, patch) {
  return {
    ...(isObj(base) ? base : {}),
    ...(isObj(patch) ? patch : {})
  };
}

function extractGreetingBridgeFields(packetBridge, norm) {
  const bridge = isObj(packetBridge) ? packetBridge : {};
  const sessionPatch = isObj(bridge.sessionPatch) ? bridge.sessionPatch : {};
  const memoryPatch = isObj(bridge.memoryPatch) ? bridge.memoryPatch : {};
  const memoryGreeting = isObj(memoryPatch.greeting) ? memoryPatch.greeting : {};
  const directGreeting = isObj(bridge.greeting) ? bridge.greeting : {};
  const id = cleanText(directGreeting.id || bridge.matchedPacketId || bridge.packetId || bridge.packet || sessionPatch.lastGreetingId || memoryGreeting.lastId || "");
  const intent = cleanText(directGreeting.intent || bridge.intent || sessionPatch.lastGreetingIntent || memoryGreeting.lastIntent || "");
  const tone = cleanText(directGreeting.tone || bridge.tone || sessionPatch.lastGreetingTone || memoryGreeting.lastTone || "");
  const energy = cleanText(directGreeting.energy || bridge.energy || sessionPatch.lastInputEnergy || memoryGreeting.lastEnergy || "");
  const source = cleanText(directGreeting.inputSource || directGreeting.source || bridge.inputSource || sessionPatch.lastGreetingSource || packetBridgeInputSource(norm));
  const presenceProfile = cleanText(directGreeting.presenceProfile || bridge.presenceProfile || sessionPatch.presenceProfile || memoryGreeting.lastPresenceProfile || "");
  if (!(id || intent || tone || energy || presenceProfile)) return { active: false };
  return {
    active: true,
    id,
    intent,
    tone,
    energy,
    source,
    inputSource: source,
    presenceProfile
  };
}

function applyPacketBridgeToSelected(selected, packetBridge, norm) {
  if (!isObj(selected) || !isObj(packetBridge) || packetBridge.ok === false) return selected;
  const greeting = extractGreetingBridgeFields(packetBridge, norm);
  const hasGreeting = !!greeting.active;
  const sessionPatch = mergePatchObject(selected.sessionPatch, packetBridge.sessionPatch);
  const memoryPatch = mergePatchObject(selected.memoryPatch, packetBridge.memoryPatch);
  if (hasGreeting) {
    sessionPatch.greeting = mergePatchObject(sessionPatch.greeting, greeting);
    memoryPatch.greeting = mergePatchObject(memoryPatch.greeting, {
      active: true,
      lastId: greeting.id,
      lastIntent: greeting.intent,
      lastTone: greeting.tone,
      lastEnergy: greeting.energy,
      lastSource: greeting.inputSource,
      lastPresenceProfile: greeting.presenceProfile,
      updatedAt: now()
    });
    if (greeting.intent) sessionPatch.lastGreetingIntent = greeting.intent;
    if (greeting.tone) sessionPatch.lastGreetingTone = greeting.tone;
    if (greeting.energy) sessionPatch.lastInputEnergy = greeting.energy;
    if (greeting.inputSource) sessionPatch.lastGreetingSource = greeting.inputSource;
    if (greeting.presenceProfile) {
      sessionPatch.presenceProfile = greeting.presenceProfile;
      sessionPatch.nyxStateHint = greeting.presenceProfile;
    }
  }

  const matchedPacketId = cleanText(packetBridge.matchedPacketId || packetBridge.packetId || packetBridge.packet || greeting.id || "");
  const matchedPacketType = cleanText(packetBridge.matchedPacketType || packetBridge.packetType || (hasGreeting ? "greeting" : "") || "");
  const presenceProfile = cleanText(packetBridge.presenceProfile || greeting.presenceProfile || sessionPatch.presenceProfile || "");
  const nyxStateHint = cleanText(packetBridge.nyxStateHint || presenceProfile || sessionPatch.nyxStateHint || "");

  const payload = {
    ...(isObj(selected.payload) ? selected.payload : {}),
    matchedPacketId: matchedPacketId || undefined,
    matchedPacketType: matchedPacketType || undefined,
    packetId: matchedPacketId || undefined,
    greeting: hasGreeting ? greeting : undefined,
    sessionPatch,
    memoryPatch,
    presenceProfile: presenceProfile || undefined,
    nyxStateHint: nyxStateHint || undefined,
    packetBridge: {
      active: !!(matchedPacketId || hasGreeting),
      source: cleanText(packetBridge.source || "packet_bridge"),
      packFile: cleanText(packetBridge.packFile || ""),
      backendFirstPreserved: true
    }
  };

  const speech = {
    ...(isObj(selected.speech) ? selected.speech : {}),
    presenceProfile: cleanText(selected.speech && selected.speech.presenceProfile || presenceProfile || "") || undefined,
    nyxStateHint: cleanText(selected.speech && selected.speech.nyxStateHint || nyxStateHint || "") || undefined
  };

  const ui = {
    ...(isObj(selected.ui) ? selected.ui : {}),
    presenceProfile: cleanText(selected.ui && selected.ui.presenceProfile || presenceProfile || "") || undefined,
    nyxStateHint: cleanText(selected.ui && selected.ui.nyxStateHint || nyxStateHint || "") || undefined
  };

  return {
    ...selected,
    matchedPacketId: matchedPacketId || selected.matchedPacketId,
    matchedPacketType: matchedPacketType || selected.matchedPacketType,
    packetId: matchedPacketId || selected.packetId,
    greeting: hasGreeting ? greeting : selected.greeting,
    lastGreetingIntent: hasGreeting ? greeting.intent : selected.lastGreetingIntent,
    lastGreetingTone: hasGreeting ? greeting.tone : selected.lastGreetingTone,
    lastInputEnergy: hasGreeting ? greeting.energy : selected.lastInputEnergy,
    presenceProfile: presenceProfile || selected.presenceProfile,
    nyxStateHint: nyxStateHint || selected.nyxStateHint,
    sessionPatch,
    memoryPatch,
    payload,
    speech,
    ui,
    meta: {
      ...(isObj(selected.meta) ? selected.meta : {}),
      packetStateBridgeActive: !!(matchedPacketId || hasGreeting),
      matchedPacketId: matchedPacketId || undefined,
      matchedPacketType: matchedPacketType || undefined,
      packetBridgePackFile: cleanText(packetBridge.packFile || "") || undefined,
      packetBridgePreservedMarionAuthority: true
    }
  };
}


function getMarionEmotionRuntimeHealth() {
  if (!marionEmotionRuntimeMod || typeof marionEmotionRuntimeMod.getHealth !== "function") {
    return {
      ok: false,
      runtime: "marion-emotion-runtime",
      mode: "resolved_state_only",
      error: "emotion_runtime_unavailable",
      indexRole: "diagnostic_only"
    };
  }
  try {
    const health = marionEmotionRuntimeMod.getHealth();
    return {
      ...safeObj(health),
      ok: !!(health && health.ok !== false),
      indexRole: "diagnostic_only",
      transportOnly: true
    };
  } catch (err) {
    return {
      ok: false,
      runtime: "marion-emotion-runtime",
      mode: "resolved_state_only",
      error: "emotion_health_failed",
      detail: cleanText(err && (err.message || err) || "emotion_health_failed"),
      indexRole: "diagnostic_only"
    };
  }
}

function getMarionRuntimeDiagnostics() {
  const emotionHealth = getMarionEmotionRuntimeHealth();
  return {
    marionBridgeLoaded: !!marionBridgeMod,
    marionBridgeKeys: marionBridgeMod && typeof marionBridgeMod === "object" ? Object.keys(marionBridgeMod).slice(0, 20) : [],
    marionBridgeHasRoute: !!(marionBridgeMod && typeof marionBridgeMod.route === "function"),
    marionBridgeHasAsk: !!(marionBridgeMod && typeof marionBridgeMod.ask === "function"),
    marionBridgeHasHandle: !!(marionBridgeMod && typeof marionBridgeMod.handle === "function"),
    marionBridgeHasProcessWithMarion: !!(marionBridgeMod && typeof marionBridgeMod.processWithMarion === "function"),
    marionBridgeHasDefault: !!(marionBridgeMod && typeof marionBridgeMod.default === "function"),
    marionBridgeHasFactory: !!(marionBridgeMod && typeof marionBridgeMod.createMarionBridge === "function"),
    marionBridgeVersion: cleanText(marionBridgeMod && marionBridgeMod.VERSION || ""),
    lingoSentinelGatewayLoaded: !!lingoSentinelGatewayMod,
    lingoSentinelGatewayHasRun: !!runIndexLingoSentinelGateway,
    lingoSentinelGatewayHasBuildPayload: !!buildIndexLingoSentinelMarionPayload,
    lingoSentinelGatewayIndexVersion: LINGOSENTINEL_GATEWAY_INDEX_VERSION,
    marionEmotionRuntimeLoaded: !!marionEmotionRuntimeMod,
    marionEmotionRuntimeHasHealth: !!(marionEmotionRuntimeMod && typeof marionEmotionRuntimeMod.getHealth === "function"),
    marionEmotionRuntimeMode: "resolved_state_only",
    marionEmotionRuntimeHealth: emotionHealth,
    chatEngineVersion: cleanText(chatEngineMod && chatEngineMod.VERSION || ""),
    stateSpineVersion: cleanText(stateSpineMod && stateSpineMod.SPINE_VERSION || ""),
    nyxPackRuntimeAdapterLoaded: !!nyxPackRuntimeAdapterMod,
    nyxPackRuntimeAdapterHasResolver: !!(nyxPackRuntimeAdapterMod && typeof nyxPackRuntimeAdapterMod.resolveNyxPacket === "function"),
    nyxPacketPack: (() => { const pack = getNyxPacketPack(); return { ok: !!(pack && pack.ok !== false && looksLikeNyxPacketPack(pack)), file: cleanText(pack && pack.__relativeFile || ""), count: Array.isArray(pack && pack.packets) ? pack.packets.length : 0 }; })(),
    marionIntentRouterLoaded: !!marionIntentRouterMod,
    marionIntentRouterHasRoute: !!(marionIntentRouterMod && typeof marionIntentRouterMod.routeMarionIntent === "function"),
    marionDomainRegistryLoaded: !!marionDomainRegistryMod,
    marionDomainRegistryHasHealth: !!(marionDomainRegistryMod && typeof marionDomainRegistryMod.getHealth === "function"),
    marionDomainRegistryHealth: (() => { try { return marionDomainRegistryMod && typeof marionDomainRegistryMod.getHealth === "function" ? marionDomainRegistryMod.getHealth() : null; } catch (err) { return { ok: false, error: cleanText(err && (err.message || err) || "domain_registry_health_failed") }; } })(),
    marionDomainRetrieverLoaded: !!marionDomainRetrieverMod,
    marionDomainRetrieverRequested: marionDomainRetrieverLoaded.requested || "",
    marionDomainRetrieverResolvedPath: marionDomainRetrieverLoaded.resolvedPath || "",
    marionDomainRetrieverVersion: marionDomainRetrieverLoaded.version || "",
    marionDomainRetrieverExpectedVersionPrefix: "domainRetriever v1.4",
    marionDomainRetrieverPathAligned: /^domainRetriever v1\.4\./.test(marionDomainRetrieverLoaded.version || ""),
    marionDomainRetrieverHasHealth: !!(marionDomainRetrieverMod && typeof marionDomainRetrieverMod.getHealth === "function"),
    marionDomainRetrieverHealth: (() => { try { return marionDomainRetrieverMod && typeof marionDomainRetrieverMod.getHealth === "function" ? marionDomainRetrieverMod.getHealth({ includeOptionalDomains: false }) : null; } catch (err) { return { ok: false, error: cleanText(err && (err.message || err) || "domain_retriever_health_failed") }; } })(),
    marionDomainRetrieverOptionalHealth: (() => { try { return marionDomainRetrieverMod && typeof marionDomainRetrieverMod.getHealth === "function" ? marionDomainRetrieverMod.getHealth({ includeOptionalDomains: true }) : null; } catch (err) { return { ok: false, error: cleanText(err && (err.message || err) || "domain_retriever_optional_health_failed") }; } })(),
    marionDomainRouterLoaded: !!marionDomainRouterMod,
    marionDomainRouterHasRoute: !!(marionDomainRouterMod && typeof marionDomainRouterMod.routeDomain === "function"),
    domainIsolationDiagnostics: { bootstrapGuardExpected: true, pathVerificationExpected: true, failClosedExpected: true, noCrossDomainBleedExpected: true },
    chatEngineLoaded: !!chatEngineMod,
    chatEngineKeys: chatEngineMod && typeof chatEngineMod === "object" ? Object.keys(chatEngineMod).slice(0, 20) : [],
    siteBridgeLoaded: !!siteBridgeMod,
    siteBridgeHasBuild: !!(siteBridgeMod && typeof siteBridgeMod.build === "function"),
    siteBridgeHasBuildAsync: !!(siteBridgeMod && typeof siteBridgeMod.buildAsync === "function"),
    s2sLoaded: !!s2sMod,
    s2sHasRun: !!(s2sMod && typeof s2sMod.runLocalChat === "function"),
    s2sHasHealth: !!(s2sMod && typeof s2sMod.health === "function")
  };
}

const affectEngineMod = tryRequireMany([
  "./affectEngine",
  "./affectEngine.js",
  "./utils/affectEngine",
  "./utils/affectEngine.js",
  "./Utils/affectEngine",
  "./Utils/affectEngine.js"
]);

const knowledgeRuntimeMod = tryRequireMany([
  "./Utils/knowledgeRuntime",
  "./Utils/knowledgeRuntime.js",
  "./utils/knowledgeRuntime",
  "./utils/knowledgeRuntime.js"
]);

const musicLaneMod = tryRequireMany([
  "./musicLane",
  "./musicLane.js",
  "./utils/musicLane",
  "./utils/musicLane.js",
  "./Utils/musicLane",
  "./Utils/musicLane.js"
]);

const musicResolverMod = tryRequireMany([
  "./musicResolver",
  "./musicResolver.js",
  "./utils/musicResolver",
  "./utils/musicResolver.js",
  "./Utils/musicResolver",
  "./Utils/musicResolver.js"
]);

const musicKnowledgeMod = tryRequireMany([
  "./musicKnowledge",
  "./musicKnowledge.js",
  "./utils/musicKnowledge",
  "./utils/musicKnowledge.js",
  "./Utils/musicKnowledge",
  "./Utils/musicKnowledge.js"
]);

const knowledgeRuntime = {
  available: !!knowledgeRuntimeMod,
  extract(query, opts) {
    try {
      if (knowledgeRuntimeMod && typeof knowledgeRuntimeMod.extract === "function") {
        return knowledgeRuntimeMod.extract(query, opts || {});
      }
      if (knowledgeRuntimeMod && typeof knowledgeRuntimeMod.retrieve === "function") {
        return knowledgeRuntimeMod.retrieve(query, opts || {});
      }
    } catch (_) {}
    return { ok: false, loaded: false, source: "index_fallback", extracted: true };
  }
};

function resolveNewsCanadaFeedUrl() {
  return cleanText(
    process.env.NEWS_CANADA_FEED_URL ||
    process.env.NEWS_CANADA_RSS_FEED_URL ||
    process.env.SB_NEWSCANADA_RSS_FEED_URL ||
    "https://foryourlife.ca/feed/"
  );
}

function resolveNewsCanadaFeedCandidates() {
  const primary = resolveNewsCanadaFeedUrl();
  const configured = uniq([
    primary,
    cleanText(process.env.NEWS_CANADA_FEED_URL_ALT || ""),
    cleanText(process.env.NEWS_CANADA_RSS_FEED_URL_ALT || ""),
    cleanText(process.env.SB_NEWSCANADA_RSS_FEED_URL_ALT || "")
  ].filter(Boolean));

  const derived = [];
  const seed = primary || "https://foryourlife.ca/feed/";
  try {
    const base = new URL(seed);
    derived.push(`${base.origin}/feed/`);
    derived.push(`${base.origin}/?feed=rss2`);
    derived.push(`${base.origin}/index.php?feed=rss2`);
    derived.push(`${base.origin}/feed/rss2/`);
  } catch (_) {}

  return uniq([...configured, ...derived].map((v) => cleanText(v)).filter(Boolean));
}

function resolveNewsCanadaApiCandidates() {
  const feedCandidates = resolveNewsCanadaFeedCandidates();
  const out = [];
  for (const candidate of feedCandidates) {
    try {
      const base = new URL(candidate);
      out.push(`${base.origin}/wp-json/wp/v2/posts?per_page=6&_embed=1&_fields=id,date,link,slug,title,excerpt,content,yoast_head_json,_embedded`);
      out.push(`${base.origin}/index.php?rest_route=/wp/v2/posts&per_page=6&_embed=1`);
    } catch (_) {}
  }
  return uniq(out.map((v) => cleanText(v)).filter(Boolean));
}

function decodeWpRendered(value) {
  if (isObj(value)) return stripTags(value.rendered || value.raw || "");
  return stripTags(value);
}

function extractWpFeaturedImage(post) {
  const embedded = isObj(post && post._embedded) ? post._embedded : {};
  const mediaArr = Array.isArray(embedded['wp:featuredmedia']) ? embedded['wp:featuredmedia'] : [];
  for (const media of mediaArr) {
    const direct = cleanText(media && (media.source_url || media.link || media.guid && media.guid.rendered));
    if (direct) return direct;
    const sizes = isObj(media && media.media_details && media.media_details.sizes) ? media.media_details.sizes : {};
    for (const key of ['full','large','medium_large','medium','thumbnail']) {
      const cand = cleanText(sizes[key] && sizes[key].source_url);
      if (cand) return cand;
    }
  }
  const yoast = isObj(post && post.yoast_head_json) ? post.yoast_head_json : {};
  if (Array.isArray(yoast.og_image)) {
    for (const img of yoast.og_image) {
      const cand = cleanText(img && (img.url || img.src));
      if (cand) return cand;
    }
  }
  return "";
}

function parseNewsCanadaWpPostsJson(raw, sourceUrl) {
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw && raw.posts) ? raw.posts : []);
  const parserMode = 'wp_rest_posts_parser';
  const items = arr.map((post, index) => {
    const title = decodeWpRendered(post && post.title) || `Story ${index + 1}`;
    const excerptHtml = isObj(post && post.excerpt) ? safeStr(post.excerpt.rendered || post.excerpt.raw || "") : safeStr(post && post.excerpt || "");
    const contentHtml = isObj(post && post.content) ? safeStr(post.content.rendered || post.content.raw || "") : safeStr(post && post.content || "");
    const summary = cleanText(extractFirstHtmlParagraph(excerptHtml || contentHtml) || clipText(stripTags(contentHtml || excerptHtml), 320));
    const body = removeNewsCanadaFeedBoilerplate(stripTags(contentHtml || excerptHtml || summary));
    const author = firstString([post && post.author_name, post && post._embedded && Array.isArray(post._embedded.author) && post._embedded.author[0] && post._embedded.author[0].name]);
    const image = cleanText(extractWpFeaturedImage(post) || extractFirstHtmlImageUrl(contentHtml) || extractFirstHtmlImageUrl(excerptHtml));
    const mediaUrl = cleanText(extractHtmlVideoSrc(contentHtml));
    return buildNewsCanadaItem({
      id: cleanText(post && post.id),
      guid: cleanText(post && post.id),
      slug: cleanText(post && post.slug),
      title,
      headline: title,
      description: cleanText(summary || body),
      summary,
      body: cleanText(body || summary),
      content: cleanText(body || summary),
      link: cleanText(post && post.link),
      url: cleanText(post && post.link),
      sourceUrl: cleanText(post && post.link),
      canonicalUrl: cleanText(post && post.link),
      pubDate: cleanText(post && post.date),
      publishedAt: cleanText(post && post.date),
      image,
      mediaUrl,
      mediaType: mediaUrl ? 'video/mp4' : '',
      popupImage: image,
      popupBody: cleanText(body || summary),
      byline: author,
      author,
      category: 'For Your Life',
      chipLabel: 'RSS Feed',
      source: 'For Your Life',
      sourceName: 'For Your Life',
      parserMode
    }, index, sourceUrl, parserMode);
  }).filter((item) => item && (item.title || item.summary || item.url));
  return { items, parserMode };
}

function decodeXmlEntities(value) {
  let entityCount = 0;
  const bump = () => {
    entityCount += 1;
    return entityCount <= HARDENING_CONSTANTS.XML_MAX_ENTITY_REPLACEMENTS;
  };
  let text = safeStr(value);
  if (text.length > HARDENING_CONSTANTS.XML_MAX_INPUT_CHARS) text = text.slice(0, HARDENING_CONSTANTS.XML_MAX_INPUT_CHARS);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) {
    text = text.replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<!ENTITY[\s\S]*?>/gi, "");
  }
  const out = text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, body) => bump() ? body : "")
    .replace(/&nbsp;/gi, () => bump() ? " " : "")
    .replace(/&#39;|&apos;/gi, () => bump() ? "'" : "")
    .replace(/&quot;/gi, () => bump() ? '"' : "")
    .replace(/&#8217;/gi, () => bump() ? "'" : "")
    .replace(/&#8220;|&#8221;/gi, () => bump() ? '"' : "")
    .replace(/&#8230;/gi, () => bump() ? "…" : "")
    .replace(/&amp;/gi, () => bump() ? "&" : "")
    .replace(/&lt;/gi, () => bump() ? "<" : "")
    .replace(/&gt;/gi, () => bump() ? ">" : "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      if (!bump()) return "";
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch (_) { return ""; }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      if (!bump()) return "";
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch (_) { return ""; }
    });
  return out.length > HARDENING_CONSTANTS.XML_MAX_DECODE_OUTPUT_CHARS ? out.slice(0, HARDENING_CONSTANTS.XML_MAX_DECODE_OUTPUT_CHARS) : out;
}

function stripTags(value) {
  return cleanText(decodeXmlEntities(value).replace(/<[^>]+>/g, " "));
}

function firstXmlTagValue(block, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag) continue;
    const match = new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, "i").exec(block);
    if (match && cleanText(match[1])) return decodeXmlEntities(match[1]);
  }
  return "";
}

function allXmlTagValues(block, tagNames) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  const out = [];
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag) continue;
    const re = new RegExp(`<${safeTag}\\b[^>]*>([\\s\\S]*?)<\\/${safeTag}>`, "ig");
    let match;
    while ((match = re.exec(block))) {
      const value = decodeXmlEntities(match[1]);
      if (cleanText(value)) out.push(value);
    }
  }
  return out;
}

function firstXmlAttrValue(block, tagNames, attrName) {
  const names = Array.isArray(tagNames) ? tagNames : [tagNames];
  const attr = cleanText(attrName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const tagName of names) {
    const safeTag = cleanText(tagName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!safeTag || !attr) continue;
    const match = new RegExp(`<${safeTag}\\b[^>]*\\s${attr}=["']([^"']+)["'][^>]*\\/?>`, "i").exec(block);
    if (match && cleanText(match[1])) return decodeXmlEntities(match[1]);
  }
  return "";
}

function truncateForMeta(value, max) {
  return clipText(stripTags(value), clamp(Number(max || 240), 40, 2000));
}

function htmlDecodeForFeed(value) {
  return stripTags(value).replace(/\s+/g, " ").trim();
}

function removeNewsCanadaFeedBoilerplate(value) {
  return cleanText(safeStr(value)
    .replace(/The post\s+.+?\s+appeared first on\s+.+?\.?$/i, " ")
    .replace(/Continue reading\s*$/i, " "));
}

function stripUnsafeFeedAttrs(html) {
  return safeStr(html)
    .replace(/\s(?:style|srcset|sizes|fetchpriority|decoding|loading|class|id|link_thumbnail)=(["']).*?\1/gi, "")
    .replace(/\s(?:data-[a-z0-9_-]+)=(["']).*?\1/gi, "");
}

function extractFirstHtmlImageUrl(html) {
  const sanitized = stripUnsafeFeedAttrs(html);
  const match = /<img\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/i.exec(sanitized);
  return cleanText(match && match[1] || "");
}

function extractHtmlVideoSrc(html) {
  const sanitized = stripUnsafeFeedAttrs(html);
  const sourceMatch = /<source\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/i.exec(sanitized);
  if (sourceMatch && cleanText(sourceMatch[1])) return cleanText(sourceMatch[1]);
  const videoMatch = /<video\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/i.exec(sanitized);
  return cleanText(videoMatch && videoMatch[1] || "");
}

function extractFirstHtmlParagraph(html) {
  const sanitized = stripUnsafeFeedAttrs(html);
  const matches = sanitized.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  for (const block of matches) {
    const text = removeNewsCanadaFeedBoilerplate(stripTags(block));
    if (text && !/^the post\b/i.test(text)) return text;
  }
  return removeNewsCanadaFeedBoilerplate(stripTags(sanitized));
}

function buildNewsCanadaItem(entry, index, feedUrl, parserMode) {
  const sourceName = "For Your Life";
  const base = isObj(entry) ? { ...entry } : {};
  const title = cleanText(base.title || base.headline || `Story ${index + 1}`) || `Story ${index + 1}`;
  const description = cleanText(base.description || base.summary || base.body || base.content || "");
  const url = cleanText(base.url || base.link || base.sourceUrl || base.guid || "");
  const pubDate = cleanText(base.pubDate || base.publishedAt || base.date || "");
  const image = cleanText(base.image || base.popupImage || base.thumbnail || "");
  const author = cleanText(base.author || base.byline || "");
  const category = cleanText(base.category || sourceName) || sourceName;
  const slug = cleanText(base.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || `rss-${index}`;
  return {
    id: cleanText(base.id || base.guid || url || slug || `rss-${index}`) || `rss-${index}`,
    guid: cleanText(base.guid || base.id || url || slug || `rss-${index}`) || `rss-${index}`,
    slug,
    title,
    headline: title,
    description,
    summary: cleanText(base.summary || description),
    body: cleanText(base.body || description),
    content: cleanText(base.content || description),
    link: url,
    url,
    sourceUrl: cleanText(base.sourceUrl || url),
    canonicalUrl: cleanText(base.canonicalUrl || url),
    pubDate,
    publishedAt: cleanText(base.publishedAt || pubDate),
    image,
    mediaUrl: cleanText(base.mediaUrl || base.videoUrl || base.enclosureUrl || ""),
    mediaType: cleanText(base.mediaType || base.enclosureType || ""),
    popupImage: cleanText(base.popupImage || image),
    popupBody: cleanText(base.popupBody || description),
    byline: author,
    author,
    category,
    chipLabel: cleanText(base.chipLabel || "RSS Feed") || "RSS Feed",
    ctaText: cleanText(base.ctaText || "Read full story") || "Read full story",
    source: cleanText(base.source || sourceName) || sourceName,
    sourceName: cleanText(base.sourceName || sourceName) || sourceName,
    feedUrl: cleanText(feedUrl || resolveNewsCanadaFeedUrl()),
    parserMode: cleanText(base.parserMode || parserMode || "rss_parser") || "rss_parser",
    isActive: base.isActive !== false
  };
}

function parseNewsCanadaRssXml(xmlText, feedUrl) {
  let xml = safeStr(xmlText);
  const items = [];
  let parserMode = "no_items";
  if (!xml) return { items, parserMode };
  if (xml.length > HARDENING_CONSTANTS.XML_MAX_INPUT_CHARS) xml = xml.slice(0, HARDENING_CONSTANTS.XML_MAX_INPUT_CHARS);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return { items, parserMode: "blocked_unsafe_xml_doctype" };
  }

  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const entryBlocks = itemBlocks.length ? [] : (xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []);
  const blocks = itemBlocks.length ? itemBlocks : entryBlocks;

  if (blocks.length) {
    parserMode = itemBlocks.length ? "xml_item_parser" : "atom_entry_parser";
  }

  blocks.forEach((block, index) => {
    const title = stripTags(firstXmlTagValue(block, ["title"])) || `Story ${index + 1}`;
    const descriptionRaw = firstXmlTagValue(block, ["description", "summary"]);
    const contentRaw = firstXmlTagValue(block, ["content:encoded", "excerpt:encoded", "content"]);
    const combinedHtml = safeStr(contentRaw || descriptionRaw);
    const summary = cleanText(extractFirstHtmlParagraph(descriptionRaw || contentRaw) || truncateForMeta(combinedHtml, 320));
    const body = removeNewsCanadaFeedBoilerplate(stripTags(contentRaw || descriptionRaw || summary));
    const url = cleanText(
      firstXmlAttrValue(block, ["link"], "href") ||
      firstXmlTagValue(block, ["link"]) ||
      firstXmlTagValue(block, ["guid"])
    );
    const pubDate = cleanText(firstXmlTagValue(block, ["pubDate", "published", "updated", "dc:date"]));
    const author = stripTags(firstXmlTagValue(block, ["dc:creator", "author", "creator"]));
    const category = stripTags(firstXmlTagValue(block, ["category"])) || "For Your Life";
    const enclosureUrl = cleanText(firstXmlAttrValue(block, ["enclosure"], "url"));
    const enclosureType = cleanText(firstXmlAttrValue(block, ["enclosure"], "type"));
    const image = cleanText(
      (/^image\//i.test(enclosureType) ? enclosureUrl : "") ||
      firstXmlAttrValue(block, ["media:content", "media:thumbnail"], "url") ||
      firstXmlTagValue(block, ["image"]) ||
      extractFirstHtmlImageUrl(contentRaw) ||
      extractFirstHtmlImageUrl(descriptionRaw)
    );
    const mediaUrl = cleanText(
      (/^video\//i.test(enclosureType) ? enclosureUrl : "") ||
      extractHtmlVideoSrc(contentRaw) ||
      extractHtmlVideoSrc(descriptionRaw)
    );
    const allCategories = allXmlTagValues(block, ["category"]).map((v) => stripTags(v)).filter(Boolean);
    items.push(buildNewsCanadaItem({
      id: cleanText(firstXmlTagValue(block, ["guid", "id"])),
      guid: cleanText(firstXmlTagValue(block, ["guid", "id"])),
      title,
      headline: title,
      description: cleanText(summary || body),
      summary: cleanText(summary || body),
      body: cleanText(body || summary),
      content: cleanText(body || summary),
      link: url,
      url,
      sourceUrl: url,
      canonicalUrl: url,
      pubDate,
      publishedAt: pubDate,
      image,
      mediaUrl,
      mediaType: cleanText((/^video\//i.test(enclosureType) && enclosureType) || (mediaUrl ? 'video/mp4' : enclosureType)),
      popupImage: image,
      popupBody: cleanText(body || summary),
      byline: author,
      author,
      category: category || firstString(allCategories),
      parserMode
    }, index, feedUrl, parserMode));
  });

  return {
    items: items.filter((item) => item && ((item.title && item.url) || item.summary || item.mediaUrl)),
    parserMode
  };
}

function parseNewsCanadaFeedHtml(htmlText, feedUrl) {
  const html = safeStr(htmlText);
  const items = [];
  if (!html) return { items, parserMode: "html_empty" };
  const parserMode = "html_anchor_fallback";
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  let match;
  while ((match = anchorRe.exec(html)) && items.length < 12) {
    const href = cleanText(decodeXmlEntities(match[1] || ""));
    const anchorText = htmlDecodeForFeed(match[2] || "");
    if (!href || !anchorText) continue;
    if (!/^https?:\/\//i.test(href)) continue;
    if (/\/wp-content\/|\/wp-json\//i.test(href)) continue;
    if (anchorText.length < 6) continue;
    const dedupeKey = `${href}|${anchorText.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const slice = html.slice(Math.max(0, match.index - 800), Math.min(html.length, match.index + 2200));
    const summary = truncateForMeta(slice, 260) || anchorText;
    items.push(buildNewsCanadaItem({
      title: anchorText,
      headline: anchorText,
      description: summary,
      summary,
      body: summary,
      content: summary,
      link: href,
      url: href,
      sourceUrl: href,
      canonicalUrl: href,
      parserMode
    }, items.length, feedUrl, parserMode));
  }
  return { items, parserMode };
}

function parseNewsCanadaFeedContent(rawText, feedUrl, contentType) {
  const text = safeStr(rawText);
  const normalizedContentType = lower(contentType || "");
  const looksLikeXml = /<(rss|feed|rdf:rdf)\b/i.test(text) || /<item\b/i.test(text) || /<entry\b/i.test(text) || /xml/i.test(normalizedContentType);
  const xmlParsed = parseNewsCanadaRssXml(text, feedUrl);
  if (xmlParsed.items.length) {
    return { items: xmlParsed.items, parserMode: xmlParsed.parserMode, contentType: normalizedContentType || "unknown" };
  }
  if (!looksLikeXml || /text\/html|application\/xhtml\+xml/i.test(normalizedContentType) || /<html\b/i.test(text)) {
    const htmlParsed = parseNewsCanadaFeedHtml(text, feedUrl);
    if (htmlParsed.items.length) {
      return { items: htmlParsed.items, parserMode: htmlParsed.parserMode, contentType: normalizedContentType || "text/html" };
    }
    return { items: [], parserMode: htmlParsed.parserMode || "html_no_items", contentType: normalizedContentType || "text/html" };
  }
  return { items: [], parserMode: xmlParsed.parserMode || "xml_no_items", contentType: normalizedContentType || "unknown" };
}


const NEWS_CANADA_CACHE_FILE = path.join(__dirname, ".newscanada-feed-cache.json");
const NEWS_CANADA_CACHE_CONTRACT_CANDIDATES = uniq([
  cleanText(process.env.NEWSCANADA_CACHE_FILE || process.env.NEWS_CANADA_CACHE_FILE || ""),
  path.join(__dirname, "data", "newscanada", "newscanada.cache.json"),
  path.join(__dirname, "Data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "Data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "backend", "data", "newscanada", "newscanada.cache.json"),
  path.join(process.cwd(), "backend", "Data", "newscanada", "newscanada.cache.json")
].filter(Boolean));

function getNewsCanadaCacheContractPaths() {
  return NEWS_CANADA_CACHE_CONTRACT_CANDIDATES.slice();
}

function readNewsCanadaCacheContractFile() {
  for (const candidate of getNewsCanadaCacheContractPaths()) {
    try {
      if (!candidate || !fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8");
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed && parsed.items)
        ? parsed.items
        : (Array.isArray(parsed && parsed.stories) ? parsed.stories : []);
      if (!items.length) continue;
      return {
        ok: parsed && parsed.ok !== false,
        items,
        stories: items,
        meta: {
          ...(isObj(parsed && parsed.meta) ? parsed.meta : {}),
          source: cleanText(parsed && parsed.meta && (parsed.meta.source || parsed.meta.servedFrom) || "cache") || "cache",
          mode: cleanText(parsed && parsed.meta && parsed.meta.mode || "cache_first") || "cache_first",
          parserMode: cleanText(parsed && parsed.meta && parsed.meta.parserMode || "cache_contract") || "cache_contract",
          cacheContractPath: candidate,
          cacheContractCandidates: getNewsCanadaCacheContractPaths()
        }
      };
    } catch (_) {}
  }
  return null;
}

function isNewsCanadaSeedPayload(payload) {
  const items = Array.isArray(payload && payload.items)
    ? payload.items
    : (Array.isArray(payload && payload.stories) ? payload.stories : []);
  const meta = isObj(payload && payload.meta) ? payload.meta : {};
  const parserMode = lower(meta.parserMode || "");
  const source = lower(meta.source || meta.servedFrom || "");
  const detail = lower(meta.detail || "");
  if (
    parserMode.includes("seed") ||
    parserMode.includes("guaranteed_fallback") ||
    source.includes("seed") ||
    source.includes("fallback") ||
    detail.includes("manual_seed_bootstrap") ||
    detail.includes("guaranteed_fallback") ||
    detail.includes("service_unavailable")
  ) {
    return true;
  }
  return items.some((item) => {
    const id = lower(item && item.id);
    const title = lower(item && item.title);
    const slug = lower(item && item.slug);
    const itemParserMode = lower(item && item.parserMode);
    const description = lower(item && (item.description || item.summary || item.body || item.content));
    return id.includes("newscanada-seed-") || id.includes("fallback-") || /seed story\s+[0-9]+/.test(title) || slug.includes("refreshing") || itemParserMode.includes("guaranteed_fallback") || description.includes("seed story");
  });
}

function getWritableNewsCanadaCacheContractPath() {
  const candidates = getNewsCanadaCacheContractPaths();
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch (_) {}
  }
  for (const candidate of candidates) {
    try {
      if (!candidate) continue;
      const dir = path.dirname(candidate);
      if (fs.existsSync(dir)) return candidate;
    } catch (_) {}
  }
  return candidates[0] || path.join(__dirname, "Data", "newscanada", "newscanada.cache.json");
}

function getNewsCanadaCacheServeTtlMs() {
  return clamp(Number(process.env.NEWS_CANADA_CACHE_SERVE_TTL_MS || 15 * 60 * 1000), 60 * 1000, 24 * 60 * 60 * 1000);
}

function getNewsCanadaBackgroundRefreshIntervalMs() {
  return clamp(Number(process.env.NEWS_CANADA_BACKGROUND_REFRESH_MS || 10 * 60 * 1000), 60 * 1000, 24 * 60 * 60 * 1000);
}

function isFreshNewsCanadaContractCache(payload, ttlMs) {
  const meta = isObj(payload && payload.meta) ? payload.meta : {};
  const fetchedAt = Number(meta.fetchedAt || meta.lastSuccessAt || 0);
  if (!fetchedAt) return false;
  return (now() - fetchedAt) <= clamp(Number(ttlMs || getNewsCanadaCacheServeTtlMs()), 60 * 1000, 24 * 60 * 60 * 1000);
}

let newsCanadaBackgroundRefreshPromise = null;
let newsCanadaBackgroundRefreshAt = 0;

function scheduleNewsCanadaBackgroundRefresh(reason) {
  const minIntervalMs = getNewsCanadaBackgroundRefreshIntervalMs();
  if (newsCanadaBackgroundRefreshPromise) return false;
  if ((now() - newsCanadaBackgroundRefreshAt) < minIntervalMs) return false;
  newsCanadaBackgroundRefreshAt = now();
  newsCanadaBackgroundRefreshPromise = Promise.resolve().then(async () => {
    try {
      const refreshed = await fetchNewsCanadaRssDirect({
        feedUrl: resolveNewsCanadaFeedUrl(),
        refresh: true,
        strictLive: true,
        allowFallbackSeed: false,
        preferFreshCache: false,
        timeoutMs: clamp(Number(process.env.NEWS_CANADA_BACKGROUND_TIMEOUT_MS || process.env.NEWS_CANADA_DIRECT_FETCH_TIMEOUT_MS || 15000), 5000, 30000),
        retryCount: clamp(Number(process.env.NEWS_CANADA_BACKGROUND_RETRIES || 1), 0, 2),
        retryBaseMs: clamp(Number(process.env.NEWS_CANADA_FETCH_RETRY_BASE_MS || 500), 100, 2000)
      });
      const items = Array.isArray(refreshed && refreshed.items) ? refreshed.items : (Array.isArray(refreshed && refreshed.stories) ? refreshed.stories : []);
      if (items.length && !isNewsCanadaSeedPayload(refreshed)) {
        writeNewsCanadaSnapshot({ ...(isObj(refreshed) ? refreshed : {}), items, stories: items });
        writeNewsCanadaCacheContractFile({ ...(isObj(refreshed) ? refreshed : {}), items, stories: items, ok: refreshed && refreshed.ok !== false }, {
          ...(isObj(refreshed && refreshed.meta) ? refreshed.meta : {}),
          servedFrom: 'background_refresh',
          detail: cleanText(reason || 'background_refresh'),
          stale: false,
          degraded: false,
          lastSuccessAt: Number(refreshed && refreshed.meta && refreshed.meta.fetchedAt || now()),
          contractVersion: 'newscanada-rss-service-v17-transport-hardened'
        });
      }
    } catch (err) {
      console.log('[Sandblast][newsCanada] background_refresh_error', cleanText(err && (err.message || err) || 'background_refresh_failed'));
    } finally {
      newsCanadaBackgroundRefreshPromise = null;
    }
  });
  return true;
}

function writeNewsCanadaCacheContractFile(payload, metaOverrides) {
  try {
    const items = Array.isArray(payload && payload.items)
      ? payload.items
      : (Array.isArray(payload && payload.stories) ? payload.stories : []);
    if (!items.length) return { ok: false, reason: "no_items" };
    const targetPath = getWritableNewsCanadaCacheContractPath();
    const mergedMeta = {
      ...(isObj(payload && payload.meta) ? payload.meta : {}),
      ...(isObj(metaOverrides) ? metaOverrides : {})
    };
    const out = {
      ok: payload && payload.ok !== false,
      items: items.slice(0, 24),
      meta: {
        ...mergedMeta,
        source: cleanText(mergedMeta.source || mergedMeta.servedFrom || "cache") || "cache",
        mode: cleanText(mergedMeta.mode || "cache_first") || "cache_first",
        parserMode: cleanText(mergedMeta.parserMode || "cache_contract") || "cache_contract",
        fetchedAt: Number(mergedMeta.fetchedAt || Date.now()),
        lastSuccessAt: Number(mergedMeta.lastSuccessAt || mergedMeta.fetchedAt || Date.now()),
        itemCount: items.length,
        storyCount: items.length,
        cacheContractPath: targetPath,
        cacheContractCandidates: getNewsCanadaCacheContractPaths(),
        cacheVersion: cleanText(mergedMeta.cacheVersion || "newscanada-cache-v2") || "newscanada-cache-v2",
        contractVersion: cleanText(mergedMeta.contractVersion || "newscanada-cache-contract-v3") || "newscanada-cache-contract-v3"
      }
    };
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(out, null, 2), "utf8");
    return { ok: true, path: targetPath, itemCount: out.items.length };
  } catch (err) {
    console.log("[Sandblast][newsCanada] cache_contract_write_error", err && (err.stack || err.message || err));
    return { ok: false, reason: cleanText(err && (err.message || err) || "cache_contract_write_failed") };
  }
}

function getNewsCanadaBrowserHeaders(acceptHeader) {
  return {
    "accept": acceptHeader,
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "connection": "keep-alive",
    "upgrade-insecure-requests": "1",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
  };
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, clamp(Number(ms || 0), 0, 10000)));
}

function withNewsCanadaTimeout(label, work, timeoutMs, fallbackFactory) {
  const ms = clamp(Number(timeoutMs || process.env.NEWS_CANADA_ROUTE_TIMEOUT_MS || 15000), 1000, 45000);
  return Promise.race([
    Promise.resolve().then(work),
    new Promise((resolve) => {
      setTimeout(() => {
        try {
          resolve(
            typeof fallbackFactory === "function"
              ? fallbackFactory(cleanText(label || "news_canada_timeout") || "news_canada_timeout", ms)
              : {
                  ok: false,
                  items: [],
                  stories: [],
                  meta: {
                    source: "timeout_guard",
                    degraded: true,
                    stale: true,
                    detail: `${cleanText(label || "news_canada_timeout") || "news_canada_timeout"}_${ms}ms`
                  }
                }
          );
        } catch (_) {
          resolve({
            ok: false,
            items: [],
            stories: [],
            meta: {
              source: "timeout_guard",
              degraded: true,
              stale: true,
              detail: `${cleanText(label || "news_canada_timeout") || "news_canada_timeout"}_${ms}ms`
            }
          });
        }
      }, ms);
    })
  ]);
}

function withHardJsonDeadline(res, timeoutMs, buildPayload) {
  const ms = clamp(Number(timeoutMs || process.env.NEWS_CANADA_HARD_RESPONSE_TIMEOUT_MS || 12000), 1000, 45000);
  let finished = false;
  const timer = setTimeout(() => {
    if (finished || res.headersSent || res.writableEnded) return;
    finished = true;
    try {
      const payload = typeof buildPayload === "function" ? buildPayload(ms) : { ok: true, items: [], meta: { source: "hard_deadline_guard", degraded: true, detail: `hard_deadline_${ms}ms` } };
      res.status(200).json(payload);
    } catch (_) {
      try {
        res.status(200).json({
          ok: true,
          items: [],
          meta: {
            source: "hard_deadline_guard",
            degraded: true,
            detail: `hard_deadline_${ms}ms`
          }
        });
      } catch (_) {}
    }
  }, ms);

  return {
    done() {
      if (finished) return false;
      finished = true;
      clearTimeout(timer);
      return true;
    }
  };
}

function readNewsCanadaSnapshot() {
  try {
    if (!fs.existsSync(NEWS_CANADA_CACHE_FILE)) return null;
    const raw = fs.readFileSync(NEWS_CANADA_CACHE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items) || !parsed.items.length) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeNewsCanadaSnapshot(payload) {
  try {
    const out = {
      writtenAt: Date.now(),
      items: Array.isArray(payload && payload.items) ? payload.items.slice(0, 24) : [],
      meta: isObj(payload && payload.meta) ? payload.meta : {}
    };
    if (!out.items.length) return;
    fs.writeFileSync(NEWS_CANADA_CACHE_FILE, JSON.stringify(out), "utf8");
  } catch (_) {}
}

async function fetchNewsCanadaRssDirect(opts) {
  const options = isObj(opts) ? opts : {};
  if (typeof fetch !== "function") {
    throw new Error("fetch_unavailable");
  }

  const diagnostics = {
    attemptedUrls: [],
    parserMode: "uninitialized",
    contentType: "",
    resolvedUrl: "",
    sample: "",
    itemCount: 0,
    stage: "entered"
  };
  const timeoutMs = clamp(Number(options.timeoutMs || process.env.NEWS_CANADA_DIRECT_FETCH_TIMEOUT_MS || process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 15000), 5000, 30000);
  const retryCount = clamp(Number(options.retryCount || process.env.NEWS_CANADA_FETCH_RETRIES || 1), 0, 2);
  const retryBaseMs = clamp(Number(options.retryBaseMs || process.env.NEWS_CANADA_FETCH_RETRY_BASE_MS || 500), 100, 2000);
  let lastError = null;

  const tryFetch = async (targetUrl, acceptHeader, mode) => {
    diagnostics.stage = `try_fetch_${mode}`;
    let finalErr = null;
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timer = controller ? setTimeout(() => { try { controller.abort(); } catch (_) {} }, timeoutMs) : null;
      try {
        diagnostics.attemptedUrls.push({ url: targetUrl, mode, attempt: attempt + 1, phase: "start" });
        const res = await fetch(targetUrl, {
          method: "GET",
          redirect: "follow",
          headers: getNewsCanadaBrowserHeaders(acceptHeader),
          signal: controller ? controller.signal : undefined
        });
        const finalUrl = cleanText((res && res.url) || targetUrl) || targetUrl;
        const contentType = cleanText(res && res.headers && typeof res.headers.get === "function" ? (res.headers.get("content-type") || "") : "");
        diagnostics.attemptedUrls.push({
          url: targetUrl,
          status: Number(res && res.status || 0),
          ok: !!(res && res.ok),
          finalUrl,
          contentType,
          mode,
          attempt: attempt + 1,
          phase: "response"
        });
        if (!res || !res.ok) {
          throw new Error(`${mode}_http_${res ? res.status : "failed"}`);
        }
        const rawText = await res.text();
        diagnostics.sample = truncateForMeta(rawText, 320);
        diagnostics.contentType = cleanText(contentType || diagnostics.contentType || "unknown") || "unknown";
        diagnostics.resolvedUrl = finalUrl || targetUrl;
        return { rawText, finalUrl, contentType };
      } catch (err) {
        finalErr = err;
        diagnostics.attemptedUrls.push({
          url: targetUrl,
          ok: false,
          error: cleanText(err && (err.message || err) || `${mode}_fetch_failed`),
          mode,
          attempt: attempt + 1,
          phase: "error"
        });
        if (attempt < retryCount) {
          await sleepMs(retryBaseMs * Math.pow(2, attempt));
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    throw finalErr || new Error(`${mode}_fetch_failed`);
  };

  const primaryFeedUrl = cleanText(options.feedUrl || resolveNewsCanadaFeedUrl() || 'https://foryourlife.ca/feed/');
  let secondaryFeedUrl = '';
  try {
    const base = new URL(primaryFeedUrl);
    secondaryFeedUrl = `${base.origin}/?feed=rss2`;
  } catch (_) {}
  const feedCandidates = uniq([primaryFeedUrl, secondaryFeedUrl].filter(Boolean)).slice(0, 2);
  const apiCandidates = resolveNewsCanadaApiCandidates().slice(0, 1);

  diagnostics.stage = "rss_candidates_ready";
  for (const feedUrl of feedCandidates) {
    try {
      const fetched = await tryFetch(feedUrl, "application/rss+xml, application/xml, text/xml;q=0.95, application/atom+xml;q=0.95, text/html;q=0.7, */*;q=0.6", "rss");
      const parsed = parseNewsCanadaFeedContent(fetched.rawText, fetched.finalUrl || feedUrl, fetched.contentType);
      diagnostics.parserMode = cleanText(parsed.parserMode || "no_items") || "no_items";
      diagnostics.itemCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
      diagnostics.stage = "rss_parsed";
      if (parsed.items.length) {
        const successPayload = {
          ok: true,
          items: parsed.items,
          stories: parsed.items,
          meta: {
            source: "rss_direct_fallback",
            degraded: false,
            mode: "rss",
            strategy: "rss_first_then_wp_rest",
            parserMode: diagnostics.parserMode,
            contentType: diagnostics.contentType,
            resolvedUrl: diagnostics.resolvedUrl,
            attemptedUrls: diagnostics.attemptedUrls,
            sample: diagnostics.sample,
            feedUrl,
            fetchedAt: Date.now(),
            itemCount: parsed.items.length,
            storyCount: parsed.items.length,
            stage: diagnostics.stage
          }
        };
        writeNewsCanadaSnapshot(successPayload);
        writeNewsCanadaCacheContractFile(successPayload, {
          source: "rss_direct_fallback",
          mode: "rss",
          parserMode: diagnostics.parserMode,
          feedUrl,
          fetchedAt: Date.now(),
          itemCount: parsed.items.length,
          storyCount: parsed.items.length,
          contractVersion: "newscanada-rss-service-v17-transport-hardened"
        });
        return successPayload;
      }
      lastError = new Error(`rss_no_items_${diagnostics.parserMode}`);
    } catch (err) {
      lastError = err;
    }
  }

  diagnostics.stage = "wp_rest_candidates_ready";
  for (const apiUrl of apiCandidates) {
    try {
      const fetched = await tryFetch(apiUrl, "application/json, text/json;q=0.95, */*;q=0.6", "wp_rest");
      const parsedJson = JSON.parse(fetched.rawText);
      const parsed = parseNewsCanadaWpPostsJson(parsedJson, fetched.finalUrl || apiUrl);
      diagnostics.parserMode = parsed.parserMode;
      diagnostics.itemCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
      diagnostics.stage = "wp_rest_parsed";
      if (parsed.items.length) {
        const successPayload = {
          ok: true,
          items: parsed.items,
          stories: parsed.items,
          meta: {
            source: "wp_rest_api_fallback",
            degraded: false,
            mode: "wp_rest",
            strategy: "rss_first_then_wp_rest",
            parserMode: diagnostics.parserMode,
            contentType: diagnostics.contentType,
            resolvedUrl: diagnostics.resolvedUrl,
            attemptedUrls: diagnostics.attemptedUrls,
            sample: diagnostics.sample,
            feedUrl: resolveNewsCanadaFeedUrl(),
            fetchedAt: Date.now(),
            itemCount: parsed.items.length,
            storyCount: parsed.items.length,
            stage: diagnostics.stage
          }
        };
        writeNewsCanadaSnapshot(successPayload);
        writeNewsCanadaCacheContractFile(successPayload, {
          source: "wp_rest_api_fallback",
          mode: "wp_rest",
          parserMode: diagnostics.parserMode,
          feedUrl: resolveNewsCanadaFeedUrl(),
          fetchedAt: Date.now(),
          itemCount: parsed.items.length,
          storyCount: parsed.items.length,
          contractVersion: "newscanada-rss-service-v17-transport-hardened"
        });
        return successPayload;
      }
      lastError = new Error("wp_rest_no_items");
    } catch (err) {
      lastError = err;
    }
  }

  const contractCache = readNewsCanadaCacheContractFile();
  if (contractCache && Array.isArray(contractCache.items) && contractCache.items.length) {
    return {
      ok: true,
      items: contractCache.items.slice(),
      stories: contractCache.items.slice(),
      meta: {
        ...(isObj(contractCache.meta) ? contractCache.meta : {}),
        source: cleanText(contractCache.meta && contractCache.meta.source || "cache_contract") || "cache_contract",
        degraded: true,
        mode: cleanText(contractCache.meta && contractCache.meta.mode || "cache_first") || "cache_first",
        parserMode: cleanText(contractCache.meta && contractCache.meta.parserMode || "cache_contract") || "cache_contract",
        contentType: cleanText(diagnostics.contentType || contractCache.meta && contractCache.meta.contentType || "cached") || "cached",
        resolvedUrl: cleanText(diagnostics.resolvedUrl || contractCache.meta && contractCache.meta.resolvedUrl || "") || "",
        attemptedUrls: diagnostics.attemptedUrls,
        sample: diagnostics.sample,
        detail: cleanText(lastError && (lastError.message || lastError) || "cache_contract_used"),
        feedUrl: cleanText(contractCache.meta && contractCache.meta.feedUrl || resolveNewsCanadaFeedUrl()),
        fetchedAt: Number(contractCache.meta && contractCache.meta.fetchedAt || Date.now()),
        itemCount: contractCache.items.length,
        storyCount: contractCache.items.length,
        stage: diagnostics.stage,
        contractVersion: "newscanada-rss-service-v17-transport-hardened"
      }
    };
  }

  const snapshot = readNewsCanadaSnapshot();
  if (snapshot && Array.isArray(snapshot.items) && snapshot.items.length) {
    return {
      ok: true,
      items: snapshot.items.slice(),
      stories: snapshot.items.slice(),
      meta: {
        source: "news_canada_snapshot_cache",
        degraded: true,
        mode: "snapshot",
        parserMode: "snapshot_cache",
        contentType: cleanText(diagnostics.contentType || "cached") || "cached",
        resolvedUrl: cleanText(diagnostics.resolvedUrl || "") || "",
        attemptedUrls: diagnostics.attemptedUrls,
        sample: diagnostics.sample,
        detail: cleanText(lastError && (lastError.message || lastError) || "snapshot_cache_used"),
        feedUrl: cleanText((snapshot.meta && snapshot.meta.feedUrl) || resolveNewsCanadaFeedUrl()),
        fetchedAt: Number(snapshot.writtenAt || Date.now()),
        itemCount: snapshot.items.length,
        storyCount: snapshot.items.length,
        stage: diagnostics.stage
      }
    };
  }

  return {
    ok: false,
    items: [],
    stories: [],
    meta: {
      source: diagnostics.attemptedUrls.some((x) => x && x.mode === "wp_rest") ? "wp_rest_api_fallback" : "rss_direct_fallback",
      degraded: true,
      mode: diagnostics.attemptedUrls.some((x) => x && x.mode === "wp_rest") ? "wp_rest" : "rss",
      parserMode: cleanText(diagnostics.parserMode || "no_items") || "no_items",
      contentType: cleanText(diagnostics.contentType || "unknown") || "unknown",
      resolvedUrl: cleanText(diagnostics.resolvedUrl || "") || "",
      attemptedUrls: diagnostics.attemptedUrls,
      sample: diagnostics.sample,
      detail: cleanText(lastError && (lastError.message || lastError) || "feed_no_items"),
      strategy: "rss_first_then_wp_rest",
      feedUrl: cleanText((diagnostics.attemptedUrls[0] && diagnostics.attemptedUrls[0].url) || resolveNewsCanadaFeedUrl()),
      fetchedAt: Date.now(),
      itemCount: 0,
      storyCount: 0,
      stage: diagnostics.stage
    }
  };
}

function buildNewsCanadaDirectFallbackService(logger) {
  const log = typeof logger === "function" ? logger : () => {};
  let cache = {
    ok: false,
    items: [],
    stories: [],
    fetchedAt: 0,
    feedUrl: resolveNewsCanadaFeedUrl(),
    degraded: false,
    source: "rss_direct_fallback",
    parserMode: "uninitialized",
    contentType: "",
    resolvedUrl: "",
    attemptedUrls: [],
    sample: "",
    detail: ""
  };

  async function refresh(opts) {
    const result = await fetchNewsCanadaRssDirect(opts);
    cache = {
      ok: result && result.ok !== false,
      items: Array.isArray(result && result.items) ? result.items : [],
      stories: Array.isArray(result && result.stories) ? result.stories : [],
      fetchedAt: Number(result && result.meta && result.meta.fetchedAt || Date.now()),
      feedUrl: cleanText(result && result.meta && result.meta.feedUrl || resolveNewsCanadaFeedUrl()),
      degraded: !!(result && result.meta && result.meta.degraded),
      source: cleanText(result && result.meta && result.meta.source || "rss_direct_fallback") || "rss_direct_fallback",
      parserMode: cleanText(result && result.meta && result.meta.parserMode || "unknown") || "unknown",
      contentType: cleanText(result && result.meta && result.meta.contentType || "") || "",
      resolvedUrl: cleanText(result && result.meta && result.meta.resolvedUrl || "") || "",
      attemptedUrls: Array.isArray(result && result.meta && result.meta.attemptedUrls) ? result.meta.attemptedUrls.slice(0, 12) : [],
      sample: cleanText(result && result.meta && result.meta.sample || ""),
      detail: cleanText(result && result.meta && result.meta.detail || "")
    };
    return result;
  }

  return {
    async fetchRSS(opts) {
      try {
        return await refresh(opts);
      } catch (err) {
        log("[Sandblast][newsCanada] direct_fallback_fetch_error", err && (err.stack || err.message || err));
        return {
          ok: false,
          items: cache.items.slice(),
          stories: cache.stories.slice(),
          meta: {
            source: cache.stories.length ? "rss_direct_fallback_cache" : "rss_direct_fallback",
            degraded: true,
            mode: "rss",
            parserMode: cache.parserMode || "error",
            contentType: cache.contentType || "",
            resolvedUrl: cache.resolvedUrl || "",
            attemptedUrls: cache.attemptedUrls.slice(0, 12),
            sample: cache.sample,
            feedUrl: cache.feedUrl || resolveNewsCanadaFeedUrl(),
            fetchedAt: cache.fetchedAt,
            itemCount: cache.items.length,
            storyCount: cache.stories.length,
            detail: cleanText(err && (err.message || err) || cache.detail || "rss_direct_fallback_failed")
          }
        };
      }
    },
    async getEditorsPicks(opts) {
      const refreshRequested = !!(opts && opts.refresh);
      if (!cache.ok || refreshRequested || !Array.isArray(cache.stories) || !cache.stories.length) {
        await this.fetchRSS(opts);
      }
      const limit = clamp(Number(opts && opts.limit || 0), 0, 100);
      const stories = limit > 0 ? cache.stories.slice(0, limit) : cache.stories.slice();
      return {
        ok: stories.length > 0,
        stories,
        slides: stories,
        chips: [],
        meta: {
          source: cache.source,
          degraded: !!cache.degraded,
          mode: "rss",
          parserMode: cache.parserMode,
          contentType: cache.contentType,
          resolvedUrl: cache.resolvedUrl,
          attemptedUrls: cache.attemptedUrls.slice(0, 12),
          sample: cache.sample,
          detail: cache.detail,
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          storyCount: stories.length
        }
      };
    },
    async getStory(lookup, opts) {
      const refreshRequested = !!(opts && opts.refresh);
      if (!cache.ok || refreshRequested || !Array.isArray(cache.stories) || !cache.stories.length) {
        await this.fetchRSS(opts);
      }
      const key = cleanText(lookup).toLowerCase();
      const story = cache.stories.find((item) => [
        cleanText(item.id).toLowerCase(),
        cleanText(item.guid).toLowerCase(),
        cleanText(item.slug).toLowerCase(),
        cleanText(item.title).toLowerCase(),
        cleanText(item.url).toLowerCase(),
        cleanText(item.link).toLowerCase()
      ].includes(key));
      return story
        ? {
            ok: true,
            story,
            meta: {
              source: cache.source,
              degraded: !!cache.degraded,
              mode: "rss",
              parserMode: cache.parserMode,
              contentType: cache.contentType,
              resolvedUrl: cache.resolvedUrl,
              attemptedUrls: cache.attemptedUrls.slice(0, 12),
              sample: cache.sample,
              detail: cache.detail,
              feedUrl: cache.feedUrl,
              fetchedAt: cache.fetchedAt
            }
          }
        : {
            ok: false,
            error: "story_not_found",
            meta: {
              source: cache.source,
              degraded: !!cache.degraded,
              mode: "rss",
              parserMode: cache.parserMode,
              contentType: cache.contentType,
              resolvedUrl: cache.resolvedUrl,
              attemptedUrls: cache.attemptedUrls.slice(0, 12),
              sample: cache.sample,
              detail: cache.detail,
              feedUrl: cache.feedUrl,
              fetchedAt: cache.fetchedAt
            }
          };
    },
    async prime() {
      const out = await this.fetchRSS({ refresh: true });
      return { ok: out && out.ok !== false };
    },
    health() {
      return {
        ok: cache.ok,
        source: cache.source,
        degraded: !!cache.degraded,
        mode: "rss",
        parserMode: cache.parserMode,
        contentType: cache.contentType,
        resolvedUrl: cache.resolvedUrl,
        attemptedUrls: cache.attemptedUrls.slice(0, 12),
        sample: cache.sample,
        detail: cache.detail,
        feedUrl: cache.feedUrl || resolveNewsCanadaFeedUrl(),
        fetchedAt: cache.fetchedAt,
        storyCount: Array.isArray(cache.stories) ? cache.stories.length : 0,
        itemCount: Array.isArray(cache.items) ? cache.items.length : 0
      };
    }
  };
}

function buildNewsCanadaServiceFromFetch(fetchRSS, logger) {
  if (typeof fetchRSS !== "function") return null;

  let cache = {
    ok: false,
    items: [],
    stories: [],
    fetchedAt: 0,
    feedUrl: resolveNewsCanadaFeedUrl(),
    degraded: false,
    source: "rss_service_fallback"
  };

  async function refresh(opts) {
    const result = await Promise.resolve(fetchRSS(opts || {}));
    const items = Array.isArray(result && result.items)
      ? result.items
      : (Array.isArray(result && result.stories) ? result.stories : []);
    const stories = items.map((item, index) => {
      const entry = isObj(item) ? { ...item } : {};
      const title = cleanText(entry.title || entry.headline || `Story ${index + 1}`);
      const url = cleanText(entry.url || entry.link || "");
      const slug = cleanText(entry.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
      const description = cleanText(entry.description || entry.summary || entry.body || entry.content || "");
      const image = cleanText(entry.image || entry.popupImage || "");
      return {
        ...entry,
        id: cleanText(entry.id || entry.guid || url || slug || `rss-${index}`) || `rss-${index}`,
        slug: slug || `rss-${index}`,
        title,
        description,
        summary: cleanText(entry.summary || description),
        body: cleanText(entry.body || description),
        content: cleanText(entry.content || description),
        link: cleanText(entry.link || url),
        url,
        pubDate: cleanText(entry.pubDate || entry.isoDate || ""),
        image,
        popupImage: cleanText(entry.popupImage || image),
        popupBody: cleanText(entry.popupBody || description),
        ctaText: cleanText(entry.ctaText || "Read more"),
        source: cleanText(entry.source || "News Canada"),
        isActive: entry.isActive !== false
      };
    });

    cache = {
      ok: result && result.ok !== false,
      items,
      stories,
      fetchedAt: Number(result && result.meta && result.meta.fetchedAt || Date.now()),
      feedUrl: cleanText(result && result.meta && result.meta.feedUrl || resolveNewsCanadaFeedUrl()),
      degraded: !!(result && result.meta && result.meta.degraded),
      source: cleanText(result && result.meta && result.meta.source || "rss_service_fallback") || "rss_service_fallback"
    };

    return { result, stories };
  }

  return {
    async fetchRSS(opts) {
      const out = await refresh(opts);
      return {
        ok: out.result && out.result.ok !== false,
        items: out.stories,
        stories: out.stories,
        meta: {
          v: PUBLIC_INDEX_VERSION,
          t: now(),
          source: cache.source,
          degraded: !!cache.degraded,
          mode: "rss",
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          itemCount: out.stories.length,
          storyCount: out.stories.length
        }
      };
    },
    async getEditorsPicks(opts) {
      const refreshRequested = !!(opts && opts.refresh);
      if (!cache.ok || refreshRequested || !Array.isArray(cache.stories) || !cache.stories.length) {
        await refresh(opts);
      }
      const limit = clamp(Number(opts && opts.limit || 0), 0, 100);
      const stories = limit > 0 ? cache.stories.slice(0, limit) : cache.stories.slice();
      return {
        ok: true,
        stories,
        slides: stories,
        chips: [],
        meta: {
          source: cache.source,
          degraded: !!cache.degraded,
          mode: "rss",
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt,
          storyCount: stories.length
        }
      };
    },
    async getStory(lookup, opts) {
      const refreshRequested = !!(opts && opts.refresh);
      if (!cache.ok || refreshRequested || !Array.isArray(cache.stories) || !cache.stories.length) {
        await refresh(opts);
      }
      const key = cleanText(lookup).toLowerCase();
      const story = cache.stories.find((item) => [
        cleanText(item.id).toLowerCase(),
        cleanText(item.slug).toLowerCase(),
        cleanText(item.title).toLowerCase(),
        cleanText(item.url).toLowerCase(),
        cleanText(item.link).toLowerCase()
      ].includes(key));
      if (!story) {
        return {
          ok: false,
          error: "story_not_found",
          meta: {
            source: cache.source,
            degraded: !!cache.degraded,
            mode: "rss",
            feedUrl: cache.feedUrl,
            fetchedAt: cache.fetchedAt
          }
        };
      }
      return {
        ok: true,
        story,
        meta: {
          source: cache.source,
          degraded: !!cache.degraded,
          mode: "rss",
          feedUrl: cache.feedUrl,
          fetchedAt: cache.fetchedAt
        }
      };
    },
    async prime() {
      try {
        await refresh({ refresh: true });
        return { ok: true };
      } catch (err) {
        if (typeof logger === "function") logger("[Sandblast][newsCanada] fallback_prime_error", err && (err.stack || err.message || err));
        return { ok: false, error: cleanText(err && (err.message || err) || "prime_failed") };
      }
    },
    health() {
      return {
        ok: cache.ok,
        source: cache.source,
        degraded: !!cache.degraded,
        mode: "rss",
        feedUrl: cache.feedUrl || resolveNewsCanadaFeedUrl(),
        fetchedAt: cache.fetchedAt,
        storyCount: Array.isArray(cache.stories) ? cache.stories.length : 0,
        itemCount: Array.isArray(cache.items) ? cache.items.length : 0
      };
    }
  };
}

function normalizeNewsCanadaServiceModule(mod) {
  if (!mod) return null;
  const logger = (...args) => console.log(...args);
  const candidates = [mod, mod.default, mod.service, mod.newsCanadaFeedService].filter(Boolean);

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (typeof candidate.createNewsCanadaFeedService === "function") {
      try {
        const built = candidate.createNewsCanadaFeedService({
          fetchImpl: typeof fetch === "function" ? fetch.bind(globalThis) : null,
          logger
        });
        if (built && (typeof built.fetchRSS === "function" || typeof built.getEditorsPicks === "function")) return built;
      } catch (err) {
        logger("[Sandblast][newsCanada] service_factory_error", err && (err.stack || err.message || err));
      }
    }

    if (typeof candidate.fetchRSS === "function") {
      const wrapped = buildNewsCanadaServiceFromFetch(candidate.fetchRSS.bind(candidate), logger);
      if (wrapped) return wrapped;
    }

    if (
      typeof candidate.getEditorsPicks === "function" ||
      typeof candidate.getStory === "function" ||
      typeof candidate.health === "function"
    ) {
      return candidate;
    }
  }

  return null;
}

const newsCanadaFeedService = (() => {
  const logger = (...args) => console.log(...args);
  const directFallback = buildNewsCanadaDirectFallbackService(logger);

  return {
    async fetchRSS(opts) {
      const normalizedOpts = {
        ...(isObj(opts) ? opts : {}),
        refresh: true,
        strictLive: true,
        allowFallbackSeed: false,
        preferFreshCache: false,
        timeoutMs: Number((opts && opts.timeoutMs) || process.env.NEWS_CANADA_DIRECT_FETCH_TIMEOUT_MS || process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 12000)
      };
      try {
        return await Promise.resolve(directFallback.fetchRSS(normalizedOpts));
      } catch (err) {
        logger("[Sandblast][newsCanada] truth_path_fetchRSS_error", err && (err.stack || err.message || err));
        return {
          ok: false,
          items: [],
          stories: [],
          meta: {
            source: "truth_path_error",
            degraded: true,
            stale: true,
            detail: cleanText(err && (err.message || err) || "truth_path_fetchRSS_error")
          }
        };
      }
    },
    async getEditorsPicks(opts) {
      try {
        return await Promise.resolve(directFallback.getEditorsPicks({
          ...(isObj(opts) ? opts : {}),
          refresh: true,
          strictLive: true,
          allowFallbackSeed: false,
          preferFreshCache: false
        }));
      } catch (err) {
        logger("[Sandblast][newsCanada] truth_path_getEditorsPicks_error", err && (err.stack || err.message || err));
        return {
          ok: false,
          stories: [],
          slides: [],
          chips: [],
          meta: {
            source: "truth_path_error",
            degraded: true,
            stale: true,
            detail: cleanText(err && (err.message || err) || "truth_path_getEditorsPicks_error")
          }
        };
      }
    },
    async getStory(lookup, opts) {
      return directFallback.getStory(lookup, {
        ...(isObj(opts) ? opts : {}),
        refresh: true
      });
    },
    async prime() {
      return directFallback.prime();
    },
    health() {
      return directFallback.health();
    }
  };
})();;


function buildNewsCanadaCacheBackedService(cacheMod, fallbackService) {
  const cacheSvc = cacheMod && cacheMod.default && typeof cacheMod.default === "object" ? cacheMod.default : cacheMod;
  const hasGetCachedOrRefresh = !!(cacheSvc && typeof cacheSvc.getCachedOrRefresh === "function");
  const readCache = cacheSvc && typeof cacheSvc.readCache === "function" ? cacheSvc.readCache.bind(cacheSvc) : null;
  const refreshCache = cacheSvc && typeof cacheSvc.refreshCache === "function" ? cacheSvc.refreshCache.bind(cacheSvc) : null;

  if (!hasGetCachedOrRefresh && !readCache) {
    const seeded = readNewsCanadaCacheContractFile();
    if (!seeded) return fallbackService;
  }

  async function resolvePayload(opts) {
    const forceRefresh = !!(opts && opts.refresh);
    const seeded = readNewsCanadaCacheContractFile();
    const seededIsPlaceholder = !!(seeded && seeded.items && seeded.items.length && isNewsCanadaSeedPayload(seeded));

    if (seeded && seeded.items && seeded.items.length && !seededIsPlaceholder && !forceRefresh) {
      return seeded;
    }

    if (hasGetCachedOrRefresh) {
      const payload = await Promise.resolve(cacheSvc.getCachedOrRefresh({
        forceRefresh: forceRefresh || seededIsPlaceholder,
        timeoutMs: clamp(Number(process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 30000), 5000, 45000)
      }));
      if (isObj(payload) && Array.isArray(payload.items) && payload.items.length && !isNewsCanadaSeedPayload(payload)) {
        return {
          ...payload,
          meta: {
            ...(isObj(payload.meta) ? payload.meta : {}),
            cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || (seeded && seeded.meta && seeded.meta.cacheContractPath) || ""),
            cacheContractCandidates: getNewsCanadaCacheContractPaths()
          }
        };
      }
      if (seeded && seeded.items && seeded.items.length && !seededIsPlaceholder) return seeded;
      return isObj(payload)
        ? {
            ...payload,
            meta: {
              ...(isObj(payload.meta) ? payload.meta : {}),
              cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
              cacheContractCandidates: getNewsCanadaCacheContractPaths()
            }
          }
        : {
            ok: false,
            items: [],
            meta: {
              source: "cache_service_invalid",
              degraded: true,
              cacheContractCandidates: getNewsCanadaCacheContractPaths()
            }
          };
    }

    if (readCache) {
      const payload = await Promise.resolve(readCache());
      if (isObj(payload) && Array.isArray(payload.items) && payload.items.length && !isNewsCanadaSeedPayload(payload)) {
        return {
          ...payload,
          meta: {
            ...(isObj(payload.meta) ? payload.meta : {}),
            cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || (seeded && seeded.meta && seeded.meta.cacheContractPath) || ""),
            cacheContractCandidates: getNewsCanadaCacheContractPaths()
          }
        };
      }
    }

    if ((forceRefresh || seededIsPlaceholder) && fallbackService && typeof fallbackService.fetchRSS === "function") {
      const fallbackPayload = await Promise.resolve(fallbackService.fetchRSS({
        refresh: true,
        timeoutMs: clamp(Number(process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 30000), 5000, 45000),
        retryCount: clamp(Number(process.env.NEWS_CANADA_FETCH_RETRIES || 2), 0, 4)
      }));
      const fallbackItems = Array.isArray(fallbackPayload && fallbackPayload.items)
        ? fallbackPayload.items
        : (Array.isArray(fallbackPayload && fallbackPayload.stories) ? fallbackPayload.stories : []);
      if (fallbackItems.length && !isNewsCanadaSeedPayload(fallbackPayload)) {
        writeNewsCanadaSnapshot({
          ...(isObj(fallbackPayload) ? fallbackPayload : {}),
          items: fallbackItems,
          stories: fallbackItems
        });
        const writeResult = writeNewsCanadaCacheContractFile({
          ...(isObj(fallbackPayload) ? fallbackPayload : {}),
          items: fallbackItems,
          stories: fallbackItems,
          ok: fallbackPayload && fallbackPayload.ok !== false
        }, {
          ...(isObj(fallbackPayload && fallbackPayload.meta) ? fallbackPayload.meta : {}),
          servedFrom: "auto_ingest_switch",
          detail: seededIsPlaceholder ? "auto_ingest_replaced_seed_cache" : cleanText(fallbackPayload && fallbackPayload.meta && fallbackPayload.meta.detail || "auto_ingest_live_write"),
          stale: false,
          degraded: false,
          lastSuccessAt: Number(fallbackPayload && fallbackPayload.meta && fallbackPayload.meta.fetchedAt || now())
        });
        return {
          ...(isObj(fallbackPayload) ? fallbackPayload : {}),
          items: fallbackItems,
          stories: fallbackItems,
          meta: {
            ...(isObj(fallbackPayload && fallbackPayload.meta) ? fallbackPayload.meta : {}),
            cacheContractPath: cleanText(writeResult.path || getWritableNewsCanadaCacheContractPath()),
            cacheContractCandidates: getNewsCanadaCacheContractPaths(),
            servedFrom: "auto_ingest_switch",
            detail: seededIsPlaceholder ? "auto_ingest_replaced_seed_cache" : cleanText(fallbackPayload && fallbackPayload.meta && fallbackPayload.meta.detail || "auto_ingest_live_write")
          }
        };
      }
    }

    if (seeded && seeded.items && seeded.items.length) return seeded;

    return {
      ok: false,
      items: [],
      meta: {
        source: "cache",
        degraded: true,
        mode: "cache_first",
        parserMode: "cache_contract",
        detail: "cache_contract_missing_or_empty",
        cacheContractPath: "",
        cacheContractCandidates: getNewsCanadaCacheContractPaths()
      }
    };
  }

  return {
    async fetchRSS(opts) {
      const payload = await resolvePayload(opts);
      const items = Array.isArray(payload && payload.items) ? payload.items : [];
      return {
        ok: payload && payload.ok !== false && items.length > 0,
        items,
        stories: items,
        meta: {
          v: PUBLIC_INDEX_VERSION,
          t: now(),
          source: cleanText(payload && payload.meta && (payload.meta.servedFrom || payload.meta.source) || "cache") || "cache",
          degraded: !!(payload && payload.meta && (payload.meta.degraded || payload.meta.stale || payload.meta.refreshFailed || !items.length)),
          mode: cleanText(payload && payload.meta && payload.meta.mode || "cache_first") || "cache_first",
          parserMode: cleanText(payload && payload.meta && payload.meta.parserMode || "cache_contract") || "cache_contract",
          contentType: cleanText(payload && payload.meta && payload.meta.contentType || "application/json") || "application/json",
          resolvedUrl: cleanText(payload && payload.meta && payload.meta.resolvedUrl || "") || "",
          attemptedUrls: Array.isArray(payload && payload.meta && payload.meta.attemptedUrls) ? payload.meta.attemptedUrls.slice(0, 12) : [],
          sample: cleanText(payload && payload.meta && payload.meta.sample || ""),
          detail: cleanText(payload && payload.meta && payload.meta.detail || ""),
          feedUrl: cleanText(payload && payload.meta && payload.meta.feedUrl || resolveNewsCanadaFeedUrl()),
          fetchedAt: Number(payload && payload.meta && (payload.meta.fetchedAt || payload.meta.lastSuccessAt) || 0),
          itemCount: items.length,
          storyCount: items.length,
          cacheVersion: cleanText(payload && payload.meta && payload.meta.cacheVersion || "newscanada-cache-v1") || "newscanada-cache-v1",
          cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
          cacheContractCandidates: Array.isArray(payload && payload.meta && payload.meta.cacheContractCandidates) ? payload.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths(),
          contractVersion: "newscanada-cache-contract-v2"
        }
      };
    },
    async getEditorsPicks(opts) {
      const payload = await resolvePayload(opts);
      const stories = Array.isArray(payload && payload.items) ? payload.items : [];
      return {
        ok: stories.length > 0,
        stories,
        slides: stories,
        chips: [],
        meta: {
          source: cleanText(payload && payload.meta && (payload.meta.servedFrom || payload.meta.source) || "cache") || "cache",
          degraded: !!(payload && payload.meta && (payload.meta.degraded || payload.meta.stale || payload.meta.refreshFailed || !stories.length)),
          mode: cleanText(payload && payload.meta && payload.meta.mode || "cache_first") || "cache_first",
          parserMode: cleanText(payload && payload.meta && payload.meta.parserMode || "cache_contract") || "cache_contract",
          feedUrl: cleanText(payload && payload.meta && payload.meta.feedUrl || resolveNewsCanadaFeedUrl()),
          fetchedAt: Number(payload && payload.meta && (payload.meta.fetchedAt || payload.meta.lastSuccessAt) || 0),
          storyCount: stories.length,
          attemptedUrls: Array.isArray(payload && payload.meta && payload.meta.attemptedUrls) ? payload.meta.attemptedUrls.slice(0, 12) : [],
          detail: cleanText(payload && payload.meta && payload.meta.detail || ""),
          cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
          cacheContractCandidates: Array.isArray(payload && payload.meta && payload.meta.cacheContractCandidates) ? payload.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths()
        }
      };
    },
    async getStory(lookup, opts) {
      const payload = await resolvePayload(opts);
      const stories = Array.isArray(payload && payload.items) ? payload.items : [];
      const key = cleanText(lookup).toLowerCase();
      const story = stories.find((item) => [
        cleanText(item && item.id).toLowerCase(),
        cleanText(item && item.guid).toLowerCase(),
        cleanText(item && item.slug).toLowerCase(),
        cleanText(item && item.title).toLowerCase(),
        cleanText(item && item.url).toLowerCase(),
        cleanText(item && item.link).toLowerCase()
      ].includes(key));
      if (!story) {
        return {
          ok: false,
          error: "story_not_found",
          meta: {
            source: cleanText(payload && payload.meta && (payload.meta.servedFrom || payload.meta.source) || "cache") || "cache",
            degraded: !!(payload && payload.meta && (payload.meta.degraded || payload.meta.stale || payload.meta.refreshFailed)),
            mode: cleanText(payload && payload.meta && payload.meta.mode || "cache_first") || "cache_first",
            feedUrl: cleanText(payload && payload.meta && payload.meta.feedUrl || resolveNewsCanadaFeedUrl()),
            fetchedAt: Number(payload && payload.meta && (payload.meta.fetchedAt || payload.meta.lastSuccessAt) || 0),
            cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
            cacheContractCandidates: Array.isArray(payload && payload.meta && payload.meta.cacheContractCandidates) ? payload.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths()
          }
        };
      }
      return {
        ok: true,
        story,
        meta: {
          source: cleanText(payload && payload.meta && (payload.meta.servedFrom || payload.meta.source) || "cache") || "cache",
          degraded: !!(payload && payload.meta && (payload.meta.degraded || payload.meta.stale || payload.meta.refreshFailed)),
          mode: cleanText(payload && payload.meta && payload.meta.mode || "cache_first") || "cache_first",
          feedUrl: cleanText(payload && payload.meta && payload.meta.feedUrl || resolveNewsCanadaFeedUrl()),
          fetchedAt: Number(payload && payload.meta && (payload.meta.fetchedAt || payload.meta.lastSuccessAt) || 0),
          cacheContractPath: cleanText(payload && payload.meta && payload.meta.cacheContractPath || ""),
          cacheContractCandidates: Array.isArray(payload && payload.meta && payload.meta.cacheContractCandidates) ? payload.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths()
        }
      };
    },
    async prime() {
      if (refreshCache) {
        const out = await Promise.resolve(refreshCache({ timeoutMs: clamp(Number(process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 30000), 5000, 45000) }));
        return { ok: !!(out && out.ok !== false && Array.isArray(out.items) && out.items.length) };
      }
      const seeded = readNewsCanadaCacheContractFile();
      return { ok: !!(seeded && seeded.ok !== false && Array.isArray(seeded.items) && seeded.items.length) };
    },
    health() {
      try {
        const seeded = readNewsCanadaCacheContractFile();
        const cached = readCache ? readCache() : null;
        const src = (cached && Array.isArray(cached.items) && cached.items.length) ? cached : seeded;
        return {
          ok: !!(src && src.ok !== false && Array.isArray(src.items) && src.items.length),
          source: cleanText(src && src.meta && (src.meta.servedFrom || src.meta.source) || "cache") || "cache",
          degraded: !!(src && src.meta && (src.meta.degraded || src.meta.stale || src.meta.refreshFailed)),
          mode: cleanText(src && src.meta && src.meta.mode || "cache_first") || "cache_first",
          feedUrl: cleanText(src && src.meta && src.meta.feedUrl || resolveNewsCanadaFeedUrl()),
          fetchedAt: Number(src && src.meta && (src.meta.fetchedAt || src.meta.lastSuccessAt) || 0),
          storyCount: Array.isArray(src && src.items) ? src.items.length : 0,
          itemCount: Array.isArray(src && src.items) ? src.items.length : 0,
          cacheVersion: cleanText(src && src.meta && src.meta.cacheVersion || "newscanada-cache-v1") || "newscanada-cache-v1",
          cacheContractPath: cleanText(src && src.meta && src.meta.cacheContractPath || ""),
          cacheContractCandidates: Array.isArray(src && src.meta && src.meta.cacheContractCandidates) ? src.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths()
        };
      } catch (_) {
        return fallbackService && typeof fallbackService.health === "function" ? fallbackService.health() : { ok: false, source: "cache_unavailable", degraded: true, mode: "cache_first", cacheContractCandidates: getNewsCanadaCacheContractPaths() };
      }
    }
  };
}

const newsCanadaPrimaryService = buildNewsCanadaCacheBackedService(newscanadaCacheServiceMod, newsCanadaFeedService);

function pruneMapToMaxSize(mapObj, maxSize) {
  if (!mapObj || typeof mapObj.size !== "number" || typeof mapObj.keys !== "function") return;
  const max = clamp(Number(maxSize || HARDENING_CONSTANTS.MAX_SESSIONS), 100, 100000);
  while (mapObj.size > max) {
    const oldest = mapObj.keys().next().value;
    if (oldest === undefined) break;
    mapObj.delete(oldest);
  }
}

function touchMapEntry(mapObj, key, value) {
  if (!mapObj || typeof mapObj.set !== "function") return;
  if (mapObj.has(key)) mapObj.delete(key);
  mapObj.set(key, value);
  pruneMapToMaxSize(mapObj, HARDENING_CONSTANTS.MAX_SESSIONS);
}

const memory = {
  lastBySession: new Map(),
  supportBySession: new Map(),
  transportBySession: new Map(),
  spineBySession: new Map()
};

function getSessionId(req) {
  return cleanText(
    req.headers["x-session-id"] ||
    req.headers["x-sb-session-id"] ||
    req.body?.sessionId ||
    req.body?.payload?.sessionId ||
    req.ip ||
    "anon"
  ).slice(0, 120);
}

function readBearerToken(req) {
  const auth = cleanText((req.headers && req.headers.authorization) || req.get?.("Authorization") || "");
  if (!auth) return "";
  if (!/^bearer\s+/i.test(auth)) return "";
  return cleanText(auth.replace(/^bearer\s+/i, ""));
}

function tokenCandidateNames() {
  const configured = lower(CFG.apiTokenHeader || "x-sb-widget-token");
  return uniq([
    configured,
    "x-sb-widget-token",
    "x-sbnyx-widget-token",
    "sb-widget-token",
    "x-nyx-widget-token",
    "x-api-key",
    "x-sandblast-key",
    "x-sandblast-api-key",
    "x-nyx-api-key",
    "x-widget-key",
    "x-chat-api-key"
  ]);
}

function safeTokenEquals(got, expected) {
  const a = cleanText(got || "");
  const b = cleanText(expected || "");
  if (!a || !b) return false;
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
  } catch (_) {
    return a === b;
  }
}

function readToken(req) {
  const headers = req && req.headers ? req.headers : {};
  const candidates = tokenCandidateNames();
  for (const name of candidates) {
    const value = cleanText(headers[name] || (req.get && req.get(name)) || "");
    if (value) return value;
  }
  return readBearerToken(req);
}

function denyUnauthorized(req, res) {
  hardenCors(req, res);
  return res.status(401).json({
    ok: false,
    error: "unauthorized",
    detail: "Request did not provide a valid chat/widget token.",
    traceId: cleanText(req && req.sbTraceId || req && req.headers && req.headers["x-sb-trace-id"] || makeTraceId("auth")),
    auth: {
      configured: !!CFG.apiToken,
      expectedHeaders: tokenCandidateNames(),
      bearerAccepted: true,
      originBypassEnabled: !!CFG.conversationOriginBypass
    },
    meta: { v: PUBLIC_INDEX_VERSION, t: now(), authGate: "index.enforceToken" }
  });
}

function isConversationRoutePath(req) {
  const pathValue = cleanText(req && (req.originalUrl || req.url || req.path) || "").split("?")[0].replace(/\/+$/, "");
  return pathValue === "/api/chat" || pathValue === "/chat" || pathValue === "/respond";
}


function getPublicMarionRuntimeSummary() {
  const bridgeReady = !!(marionBridgeMod && (typeof marionBridgeMod.route === "function" || typeof marionBridgeMod.handle === "function" || typeof marionBridgeMod.processWithMarion === "function" || typeof marionBridgeMod.default === "function"));
  return {
    ready: bridgeReady,
    chatReady: !!chatEngineMod,
    lingoSentinelReady: !!lingoSentinelGatewayMod,
    diagnosticsRedacted: true
  };
}

function buildConversationRouteDiagnostics(req) {
  const pathValue = cleanText(req && (req.originalUrl || req.url || req.path) || "").split("?")[0] || "";
  return {
    ok: true,
    routeMounted: true,
    routeFamily: "marion_conversation",
    canonicalPost: "/api/chat",
    compatibilityPosts: ["/chat", "/respond"],
    requestedPath: pathValue,
    method: cleanText(req && req.method || "GET"),
    acceptsPost: true,
    acceptsGetAsHealthOnly: true,
    marion: getPublicMarionRuntimeSummary(),
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      detail: "GET is diagnostic only. Widget chat turns must POST JSON to /api/chat."
    }
  };
}

function sendConversationMethodDiagnostic(req, res) {
  hardenCors(req, res);
  return res.status(200).json(buildConversationRouteDiagnostics(req));
}

function enforceToken(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (isConversationRoutePath(req) && CFG.conversationOriginBypass) {
    const origin = cleanText((req && req.headers && req.headers.origin) || "");
    const referer = cleanText((req && req.headers && req.headers.referer) || "");
    if (isSandblastOrigin(origin) || isSandblastOrigin(referer)) return next();
  }
  if (!CFG.apiToken) return next();
  const got = readToken(req);
  if (safeTokenEquals(got, CFG.apiToken)) return next();
  return denyUnauthorized(req, res);
}

function enforceVoiceRouteAccess(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (!CFG.requireVoiceRouteToken) return next();
  return enforceToken(req, res, next);
}

function enforceMusicBridgeAccess(req, res, next) {
  if (req.method === "OPTIONS") return next();
  return next();
}

function getLastTurn(sessionId) {
  return memory.lastBySession.get(sessionId) || null;
}


function normalizeContinuityTopicText(value) {
  let text = cleanText(value || "");
  if (!text) return "";
  text = text
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/[.?!]+$/g, "")
    .replace(/^(?:nyx\s*,?\s*)?(?:please\s*)?(?:explain|define|describe|break\s+down|tell\s+me\s+about|what\s+is|what\s+are|give\s+me\s+an\s+overview\s+of|help\s+me\s+understand)\s+/i, "")
    .replace(/^(?:the|a|an)\s+/i, "")
    .trim();
  if (!text || text.length > 96) return "";
  if (/^(?:why|what|how|when|where|who|that|this|it|they|them|those|these)\b/i.test(text)) return "";
  return text;
}

function extractContinuityTopicFromTurn(turn) {
  const src = isObj(turn) ? turn : {};
  const continuity = isObj(src.continuity) ? src.continuity : {};
  const candidates = [
    continuity.topic,
    continuity.lastTopic,
    continuity.subject,
    src.topic,
    src.lastTopic,
    src.normalizedTopic,
    src.userText,
    src.rawUserText,
    src.originalUserText
  ];
  for (const candidate of candidates) {
    const topic = normalizeContinuityTopicText(candidate);
    if (topic) return topic;
  }
  const reply = cleanText(src.reply || src.text || src.answer || "");
  const match = reply.match(/^([A-Z][A-Za-z0-9\s\-]{2,80})\s+(?:is|are|refers to|means)\b/i);
  if (match) {
    const topic = normalizeContinuityTopicText(match[1]);
    if (topic) return topic;
  }
  return "";
}

function isShortContinuityFollowupText(value) {
  const text = cleanText(value || "").replace(/[.?!]+$/g, "").toLowerCase();
  if (!text) return false;
  if (text.length > 160) return false;
  return /^(?:why|how|what|when|where)\s+(?:is|are|does|do|would|could|should)\s+(?:that|this|it|they|them|those|these)\b/.test(text) ||
    /^(?:why\s+is\s+that\s+important|why\s+does\s+that\s+matter|why\s+does\s+it\s+matter|why\s+is\s+it\s+important|how\s+does\s+that\s+work|what\s+does\s+that\s+mean|what\s+about\s+that)$/i.test(text) ||
    /^(?:give|show)\s+me\s+(?:an?\s+)?(?:another\s+)?example\b/i.test(text) ||
    /^(?:another\s+example|example|use\s+case|show\s+another\s+one)$/i.test(text) ||
    /^(?:what\s+happens\s+next|what\s+next|then\s+what|what\s+comes\s+next|next\s+step|next\s+steps)$/i.test(text) ||
    /^(?:tell\s+me\s+more|continue|go\s+deeper|expand\s+on\s+that|break\s+that\s+down)$/i.test(text) ||
    /^(?:apply|use)\s+(?:that|this|it)\b/i.test(text) ||
    /^(?:make|put)\s+(?:that|this|it)\s+(?:practical|simple|clear)\b/i.test(text);
}

function resolveShortContinuityFollowupText(currentText, priorTurn) {
  const source = cleanText(currentText || "");
  if (!source || !isShortContinuityFollowupText(source)) return { resolved: source, changed: false, topic: "", reason: "" };
  const topic = extractContinuityTopicFromTurn(priorTurn);
  if (!topic) return { resolved: source, changed: false, topic: "", reason: "missing_prior_topic" };

  const lowerSource = source.replace(/[.?!]+$/g, "").toLowerCase();
  let resolved = "";
  if (/^why\s+(?:is|does|do|are|would|could|should)\s+(?:that|this|it|they|them|those|these)\b/.test(lowerSource) || /important|matter/.test(lowerSource)) {
    resolved = `Why is ${topic} important?`;
  } else if (/^(?:give|show)\s+me\s+(?:an?\s+)?(?:another\s+)?example\b/i.test(source) || /^(?:another\s+example|example|use\s+case|show\s+another\s+one)$/i.test(lowerSource)) {
    resolved = /another|show\s+another/i.test(source) ? `Show another example of ${topic}.` : `Give me an example of ${topic}.`;
  } else if (/\bwhat\s+happens\s+next|what\s+next|then\s+what|what\s+comes\s+next|next\s+steps?\b/i.test(lowerSource)) {
    resolved = `What happens next with ${topic} in practice?`;
  } else if (/\bcontinue|tell\s+me\s+more|expand|go\s+deeper|break\s+that\s+down\b/i.test(lowerSource)) {
    resolved = `Continue explaining ${topic} with one practical next layer.`;
  } else if (/^(?:apply|use)\s+(?:that|this|it)\b/i.test(source)) {
    resolved = source.replace(/\b(that|this|it)\b/i, topic);
    if (resolved === source) resolved = `Apply ${topic} in practical terms.`;
  } else if (/^what\s+(?:does|is)\s+(?:that|this|it)\b/.test(lowerSource)) {
    resolved = `What does ${topic} mean in this context?`;
  } else if (/^how\s+(?:does|do|is|are)\s+(?:that|this|it)\b/.test(lowerSource)) {
    resolved = `How does ${topic} work?`;
  } else {
    resolved = `Regarding ${topic}: ${source}`;
  }

  resolved = cleanText(resolved);
  if (!resolved || resolved === source) return { resolved: source, changed: false, topic, reason: "no_rewrite_needed" };
  return {
    resolved,
    changed: true,
    topic,
    reason: "short_followup_continuity_resolved",
    originalText: source
  };
}

function continuityEffectivePromptFromNorm(norm) {
  const n = isObj(norm) ? norm : {};
  return cleanText(
    n.continuityResolvedText ||
    n.resolvedQuestion ||
    n.resolvedPrompt ||
    n.effectivePrompt ||
    n.finalPrompt ||
    n.userQuery ||
    n.query ||
    n.message ||
    n.text ||
    ""
  );
}

function applyContinuityEffectivePromptToNorm(norm, sourceTag) {
  if (!isObj(norm)) return norm;
  const resolved = cleanText(norm.continuityResolvedText || norm.resolvedQuestion || norm.resolvedPrompt || "");
  if (!resolved) return norm;
  const original = cleanText(norm.continuityResolvedOriginalText || norm.originalText || norm.rawUserText || norm.text || "");
  const topic = cleanText(norm.continuityTopic || "");
  norm.effectivePrompt = resolved;
  norm.finalPrompt = resolved;
  norm.resolvedQuestion = resolved;
  norm.resolvedPrompt = resolved;
  norm.publicUserQuery = resolved;
  norm.text = resolved;
  norm.query = resolved;
  norm.userQuery = resolved;
  norm.message = resolved;
  norm.shortFollowupContinuityResolved = true;
  norm.continuityHandoffHardlock = true;
  norm.continuityEffectivePromptSource = cleanText(sourceTag || "index.continuityEffectivePrompt");
  norm.originalText = cleanText(norm.originalText || original || resolved);
  norm.rawUserText = cleanText(norm.rawUserText || original || norm.originalText || resolved);
  if (isObj(norm.payload)) {
    norm.payload = {
      ...norm.payload,
      text: resolved,
      message: resolved,
      query: resolved,
      userQuery: resolved,
      publicUserQuery: resolved,
      effectivePrompt: resolved,
      finalPrompt: resolved,
      resolvedQuestion: resolved,
      resolvedPrompt: resolved,
      continuityResolvedText: resolved,
      continuityResolvedOriginalText: original,
      continuityTopic: topic,
      shortFollowupContinuityResolved: true
    };
  }
  return norm;
}


function summarizeTurnForMemory(prev, patch) {
  const base = isObj(prev) ? prev : {};
  const next = isObj(patch) ? patch : {};
  return {
    replyHash: cleanText(next.replyHash || base.replyHash || ""),
    userHash: cleanText(next.userHash || base.userHash || ""),
    lane: cleanText(next.lane || base.lane || ""),
    replyAuthority: cleanText(next.replyAuthority || base.replyAuthority || ""),
    turnId: cleanText(next.turnId || base.turnId || ""),
    route: cleanText(next.route || base.route || ""),
    loopStatus: cleanText(next.loopStatus || base.loopStatus || ""),
    finalized: next.finalized === true || base.finalized === true,
    userText: cleanText(next.userText || base.userText || "").slice(0, 280),
    reply: cleanText(next.reply || base.reply || "").slice(0, 280),
    emotionLabel: cleanText(next.emotionLabel || base.emotionLabel || "").slice(0, 80),
    continuity: isObj(next.continuity) ? next.continuity : (isObj(base.continuity) ? base.continuity : {}),
    topic: cleanText(next.topic || (isObj(next.continuity) ? next.continuity.topic : "") || base.topic || (isObj(base.continuity) ? base.continuity.topic : "") || "").slice(0, 120),
    lastTopic: cleanText(next.lastTopic || next.topic || base.lastTopic || base.topic || "").slice(0, 120),
    knowledgeDomain: cleanText(next.knowledgeDomain || base.knowledgeDomain || "").slice(0, 80),
    resolvedFollowupFrom: cleanText(next.resolvedFollowupFrom || base.resolvedFollowupFrom || "").slice(0, 180),
    at: now()
  };
}

function setLastTurn(sessionId, data) {
  touchMapEntry(memory.lastBySession, sessionId, summarizeTurnForMemory(getLastTurn(sessionId), data));
}

function getSupportState(sessionId) {
  return memory.supportBySession.get(sessionId) || {
    hold: 0,
    active: false,
    replyHash: "",
    lastUserHash: "",
    lastTurnId: "",
    supportPasses: 0,
    releaseUntilTurnId: "",
    releaseUntilAt: 0,
    lastRoute: "",
    lastAuthority: "",
    loopBreakApplied: false,
    updatedAt: 0
  };
}

function setSupportState(sessionId, patch) {
  const prev = getSupportState(sessionId);
  const next = {
    ...prev,
    ...(isObj(patch) ? patch : {}),
    updatedAt: now()
  };
  touchMapEntry(memory.supportBySession, sessionId, next);
  return next;
}

function getTransportState(sessionId) {
  return memory.transportBySession.get(sessionId) || {
    key: "",
    turnId: "",
    reply: "",
    replyHash: "",
    userHash: "",
    finalized: false,
    route: "",
    authority: "",
    at: 0,
    count: 0
  };
}

function setTransportState(sessionId, patch) {
  const prev = getTransportState(sessionId);
  const next = {
    ...prev,
    ...(isObj(patch) ? patch : {}),
    at: now()
  };
  touchMapEntry(memory.transportBySession, sessionId, next);
  return next;
}

function getStateSpineRuntime() {
  return isObj(stateSpineMod) ? stateSpineMod : null;
}

function getStateSpine(sessionId) {
  const runtime = getStateSpineRuntime();
  const existing = memory.spineBySession.get(sessionId);
  if (existing) return existing;
  if (runtime && typeof runtime.createState === "function") {
    try {
      const created = runtime.createState({ lane: "general", stage: "open" });
      touchMapEntry(memory.spineBySession, sessionId, created);
      return created;
    } catch (_) {}
  }
  return null;
}

function setStateSpine(sessionId, nextState) {
  const runtime = getStateSpineRuntime();
  let next = isObj(nextState) ? nextState : {};
  if (runtime && typeof runtime.coerceState === "function") {
    try {
      next = runtime.coerceState(next);
    } catch (_) {}
  }
  next = { ...next, updatedAt: now() };
  touchMapEntry(memory.spineBySession, sessionId, next);
  return next;
}

function buildStateSpineInbound(norm, emotion, marion, marionContract, priorTurn, shaped) {
  const contract = isObj(marionContract) ? marionContract : {};
  const continuity = isObj(contract.continuity) ? contract.continuity : {};
  const packet = isObj(marion && marion.packet) ? marion.packet : {};
  const audio = isObj(shaped && shaped.audio) ? shaped.audio : {};
  const speech = isObj(shaped && shaped.speech) ? shaped.speech : (isObj(shaped && shaped.payload && shaped.payload.speech) ? shaped.payload.speech : {});
  const sessionPatch = isObj(shaped && shaped.sessionPatch) ? shaped.sessionPatch : {};
  const memoryPatch = isObj(shaped && shaped.memoryPatch) ? shaped.memoryPatch : {};
  const greeting = isObj(shaped && shaped.greeting) ? shaped.greeting :
    (isObj(sessionPatch.greeting) ? sessionPatch.greeting :
    (isObj(memoryPatch.greeting) ? memoryPatch.greeting :
    (isObj(shaped && shaped.payload && shaped.payload.greeting) ? shaped.payload.greeting : {})));
  const inputSource = cleanText(norm && (norm.inputSource || norm.source) || greeting.inputSource || greeting.source || "text").toLowerCase() || "text";
  const turnSignals = {
    emotionSupportMode: cleanText(contract.support_mode || contract.supportMode || continuity.responseMode || ""),
    emotionPrimary: cleanText(contract.emotional_state || continuity.activeEmotion || emotion?.label || ""),
    emotionCluster: cleanText(contract.emotionCluster || continuity.emotionCluster || ""),
    questionStyle: cleanText(contract.question_style || contract.questionStyle || ""),
    supportLockActive: !!(emotion && (emotion.distress || emotion.sensitive || emotion.stabilize)),
    emotionShouldSuppressMenus: !!(emotion && (emotion.distress || emotion.sensitive || emotion.stabilize)),
    emotionNeedSoft: !!(emotion && emotion.distress),
    emotionNeedCrisis: !!(emotion && emotion.sensitive),
    emotionSameEmotionCount: Number(priorTurn && priorTurn.emotionLabel && cleanText(priorTurn.emotionLabel) === cleanText(emotion && emotion.label || "") ? 1 : 0),
    enginePrimaryState: cleanText(continuity.currentState || contract.emotional_state || emotion?.label || "focused"),
    engineSecondaryState: cleanText(contract.support_mode || continuity.responseMode || "steady"),
    engineContinuityScore: Number(continuity.depthLevel ? Math.min(1, 0.35 + (Number(continuity.depthLevel || 1) * 0.12)) : 0.35),
    enginePlaceholder: cleanText(shaped && shaped.ui && shaped.ui.placeholder || "Ask Nyx anything about Sandblast…"),
    engineActionLabels: Array.isArray(shaped && shaped.followUpsStrings) ? shaped.followUpsStrings.slice(0, 4) : [],
    greetingActive: !!(greeting.active || greeting.intent || sessionPatch.lastGreetingIntent),
    greetingId: cleanText(greeting.id || sessionPatch.lastGreetingId || memoryPatch.lastGreetingId || ""),
    greetingIntent: cleanText(greeting.intent || sessionPatch.lastGreetingIntent || memoryPatch.lastGreetingIntent || ""),
    greetingTone: cleanText(greeting.tone || sessionPatch.lastGreetingTone || memoryPatch.lastGreetingTone || ""),
    greetingEnergy: cleanText(greeting.energy || sessionPatch.lastInputEnergy || memoryPatch.lastInputEnergy || ""),
    greetingSource: cleanText(greeting.inputSource || greeting.source || sessionPatch.lastGreetingSource || inputSource),
    greetingPresenceProfile: cleanText(greeting.presenceProfile || sessionPatch.presenceProfile || sessionPatch.nyxStateHint || ""),
    inputSource,
    source: inputSource,
    ttsAction: cleanText(audio.action || ""),
    ttsShouldStop: !!audio.shouldStop,
    ttsRetryable: !!audio.retryable,
    ttsReason: cleanText(audio.reason || ""),
    ttsProviderStatus: Number(audio.providerStatus || audio.status || 0) || 0,
    audioAction: cleanText(audio.action || ""),
    audioShouldStop: !!audio.shouldStop,
    audioRetryable: !!audio.retryable,
    audioReason: cleanText(audio.reason || ""),
    audioProviderStatus: Number(audio.providerStatus || audio.status || 0) || 0,
    speechEnabled: speech.enabled !== false,
    speechSpeak: speech.speak !== false
  };
  return {
    text: norm && norm.text || "",
    lane: cleanText(norm && norm.lane || contract.domain || "general") || "general",
    source: inputSource,
    inputSource,
    greeting,
    sessionPatch,
    memoryPatch,
    matchedPacketId: cleanText(shaped && (shaped.matchedPacketId || shaped.packetId) || ""),
    matchedPacketType: cleanText(shaped && shaped.matchedPacketType || ""),
    action: cleanText(norm && norm.payload && norm.payload.action || norm && norm.body && norm.body.action || ""),
    payload: isObj(norm && norm.payload) ? { ...norm.payload, greeting, sessionPatch, memoryPatch } : { greeting, sessionPatch, memoryPatch },
    emotion: {
      primaryEmotion: cleanText(contract.emotional_state || continuity.activeEmotion || emotion?.label || "neutral") || "neutral",
      supportFlags: {
        highDistress: !!(emotion && emotion.distress),
        crisis: !!(emotion && emotion.sensitive),
        needsContainment: !!(emotion && emotion.stabilize)
      },
      supportModeCandidate: cleanText(contract.support_mode || contract.supportMode || continuity.responseMode || "")
    },
    emo: {
      primaryEmotion: cleanText(contract.emotional_state || continuity.activeEmotion || emotion?.label || "neutral") || "neutral",
      supportFlags: {
        highDistress: !!(emotion && emotion.distress),
        crisis: !!(emotion && emotion.sensitive),
        needsContainment: !!(emotion && emotion.stabilize)
      }
    },
    turnSignals
  };
}


function ensureAudioContractFromSpeech(base, speech) {
  const shaped = isObj(base) ? { ...base } : {};
  const currentSpeech = isObj(speech) ? speech : {};
  const reply = cleanReplyForUser(
    currentSpeech.textSpeak ||
    currentSpeech.text ||
    shaped?.audio?.textToSynth ||
    shaped?.payload?.textSpeak ||
    shaped?.payload?.spokenText ||
    shaped?.reply || ""
  );

  if (!reply) return shaped;

  shaped.audio = isObj(shaped.audio) ? { ...shaped.audio } : {};
  if (shaped.audio.enabled !== false) shaped.audio.enabled = true;
  shaped.audio.textToSynth = cleanText(shaped.audio.textToSynth || reply) || reply;
  if (shaped.audio.autoPlay === undefined) shaped.audio.autoPlay = currentSpeech.speak !== false;
  shaped.audio.provider = cleanText(shaped.audio.provider || process.env.TTS_PROVIDER || "resemble") || "resemble";
  shaped.audio.when = cleanText(shaped.audio.when || "post_reply") || "post_reply";
  shaped.audio.strategy = cleanText(shaped.audio.strategy || "single_shot") || "single_shot";
  shaped.audio.presenceProfile = cleanText(shaped.audio.presenceProfile || currentSpeech.presenceProfile || "") || undefined;
  shaped.audio.nyxStateHint = cleanText(shaped.audio.nyxStateHint || currentSpeech.nyxStateHint || "") || undefined;

  const directives = Array.isArray(shaped.directives) ? shaped.directives.slice() : [];
  const hasSpeak = directives.some((d) => isObj(d) && cleanText(d.type).toUpperCase() === "TTS_SPEAK");
  const hasPlay = directives.some((d) => isObj(d) && cleanText(d.type).toUpperCase() === "AUDIO_PLAY");

  if (!hasSpeak) {
    directives.push({
      type: "TTS_SPEAK",
      text: shaped.audio.textToSynth,
      textToSynth: shaped.audio.textToSynth,
      provider: shaped.audio.provider,
      autoPlay: !!shaped.audio.autoPlay,
      when: shaped.audio.when
    });
  }
  if (!!shaped.audio.autoPlay && !hasPlay) {
    directives.push({
      type: "AUDIO_PLAY",
      autoPlay: true,
      when: shaped.audio.when,
      strategy: shaped.audio.strategy
    });
  }
  shaped.directives = directives;
  return shaped;
}

function buildSiteBridgeSnapshot(norm, emotion, priorSpine, marionContract) {
  // PHASE-3 ACTIVE-FLOW DISABLE: SiteBridge is intentionally disabled.
  // It must not shape replies, support state, intent, or Nyx control signals.
  return null;
  if (!siteBridgeMod || typeof siteBridgeMod.build !== "function") return null;
  try {
    return siteBridgeMod.build({
      queryKey: cleanText(norm && norm.domainHint || norm && norm.intentHint || norm && norm.lane || "general"),
      sessionKey: cleanText(norm && norm.turnId || norm && norm.traceId || "session"),
      features: {
        lane: cleanText(norm && norm.lane || "general") || "general",
        intent: cleanText(marionContract && marionContract.intent || "CLARIFY") || "CLARIFY",
        emotion: isObj(emotion) ? {
          primaryEmotion: cleanText(emotion.label || "neutral") || "neutral",
          intensity: Number.isFinite(Number(emotion.intensity)) ? Number(emotion.intensity) : 0,
          supportFlags: {
            highDistress: !!emotion.distress,
            crisis: !!emotion.sensitive,
            needsContainment: !!emotion.stabilize
          }
        } : undefined,
        continuityState: isObj(priorSpine && priorSpine.continuityThread) ? priorSpine.continuityThread : {},
        emotionalEngine: isObj(priorSpine && priorSpine.emotionalEngine) ? priorSpine.emotionalEngine : {}
      },
      emotion: isObj(emotion) ? {
        primaryEmotion: cleanText(emotion.label || "neutral") || "neutral",
        intensity: Number.isFinite(Number(emotion.intensity)) ? Number(emotion.intensity) : 0,
        supportFlags: {
          highDistress: !!emotion.distress,
          crisis: !!emotion.sensitive,
          needsContainment: !!emotion.stabilize
        }
      } : undefined,
      opts: {
        routeConfidence: 0.74,
        actionHints: [cleanText(norm && norm.intentHint || ""), cleanText(norm && norm.domainHint || "")].filter(Boolean)
      }
    });
  } catch (err) {
    console.log("[Sandblast][siteBridge:error]", err && (err.stack || err.message || err));
    return null;
  }
}

function finalizeStateSpineForTurn(sessionId, prevState, norm, emotion, marion, marionContract, priorTurn, shaped) {
  const runtime = getStateSpineRuntime();
  if (!runtime || typeof runtime.finalizeTurn !== "function") return null;
  try {
    const decision = {
      move: cleanText(shaped && shaped.cog && shaped.cog.intent || marionContract && marionContract.intent || "ADVANCE") || "ADVANCE",
      stage: cleanText(shaped && shaped.meta && shaped.meta.failSafe ? "recovery" : (shaped && shaped.meta && shaped.meta.suppressMenus ? "recovery" : "deliver")) || "deliver",
      rationale: cleanText(shaped && shaped.meta && (shaped.meta.replyAuthority || shaped.meta.error || "") || marionContract && marionContract.response || "normal_progression"),
      speak: cleanText(shaped && shaped.reply || shaped && shaped.payload && shaped.payload.reply || ""),
      _plannerMode: cleanText(shaped && shaped.cog && shaped.cog.mode || "advance") || "advance"
    };
    const inbound = buildStateSpineInbound(norm, emotion, marion, marionContract, priorTurn, shaped);
    const next = runtime.finalizeTurn({
      prevState,
      inbound,
      decision,
      lane: inbound.lane,
      stage: decision.stage,
      reply: decision.speak,
      assistantText: decision.speak,
      marionCog: isObj(shaped && shaped.cog) ? shaped.cog : { intent: decision.move, mode: decision._plannerMode },
      marion,
      composer: marionContract,
      contract: marionContract,
      result: shaped,
      memoryPatch: {
        ...(isObj(marionContract && marionContract.memoryPatch) ? marionContract.memoryPatch : {}),
        ...(isObj(marion && marion.memoryPatch) ? marion.memoryPatch : {}),
        ...(isObj(shaped && shaped.memoryPatch) ? shaped.memoryPatch : {}),
        ...(isObj(shaped && shaped.sessionPatch && shaped.sessionPatch.memoryPatch) ? shaped.sessionPatch.memoryPatch : {})
      },
      marionFinalSignature: cleanText((marion && (marion.marionFinalSignature || marion.signature)) || (marionContract && (marionContract.marionFinalSignature || marionContract.signature)) || ""),
      updateReason: cleanText(decision.rationale || "")
    });
    return setStateSpine(sessionId, next);
  } catch (err) {
    console.log("[Sandblast][stateSpine:error]", err && (err.stack || err.message || err));
    return null;
  }
}


function normalizeIndexLanguageCode(value, fallback = "") {
  const raw = cleanText(value || "").toLowerCase();
  if (!raw) return fallback;
  const compact = raw.replace(/[^a-z]/g, "");
  if (raw === "auto") return "auto";
  if (raw === "none" || raw === "off" || raw === "false" || raw === "disabled") return "";
  if (raw.startsWith("en") || compact === "english" || compact === "anglais" || compact === "ingles") return "en";
  if (raw.startsWith("fr") || compact === "french" || compact === "francais" || compact === "français" || compact === "francés" || compact === "frances") return "fr";
  if (raw.startsWith("es") || compact === "spanish" || compact === "espanol" || compact === "español" || compact === "espagnol") return "es";
  return fallback;
}

function extractIndexDirectTranslationCommand(value = "") {
  const original = cleanText(value || "");
  if (!original) {
    return { matched: false, sourceText: "", targetLanguage: "", sourceLanguage: "auto", originalCommandText: "" };
  }

  const patterns = [
    /^(?:please\s+)?translate\s+(?:only\s+)?(?:this\s+)?(?:sentence|text|phrase|line|copy|message)?\s*(?:into|to)\s+([a-zA-ZÀ-ÿ\-]+)\s*[:\-–—]\s*(.+)$/i,
    /^(?:please\s+)?translate\s+(?:only\s+)?(.+?)\s+(?:into|to)\s+([a-zA-ZÀ-ÿ\-]+)\s*$/i,
    /^(?:please\s+)?(?:put|render|convert)\s+(?:this\s+)?(?:sentence|text|phrase|line|copy|message)?\s*(?:into|to|in)\s+([a-zA-ZÀ-ÿ\-]+)\s*[:\-–—]\s*(.+)$/i,
    /^(?:please\s+)?(?:in|en)\s+([a-zA-ZÀ-ÿ\-]+)\s*[:\-–—]\s*(.+)$/i
  ];

  for (const rx of patterns) {
    const m = original.match(rx);
    if (!m) continue;

    let lang = "";
    let sourceText = "";

    if (/^\^\(\?:please/.test(String(rx))) {
      // no-op guard for minifiers; explicit branching below handles capture order.
    }

    if (rx.source.includes("(.+?)\\s+(?:into|to)")) {
      sourceText = cleanText(m[1] || "");
      lang = normalizeIndexLanguageCode(m[2] || "", "");
    } else {
      lang = normalizeIndexLanguageCode(m[1] || "", "");
      sourceText = cleanText(m[2] || "");
    }

    sourceText = sourceText
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (lang && ["en", "fr", "es"].includes(lang) && sourceText) {
      return {
        matched: true,
        sourceText,
        targetLanguage: lang,
        sourceLanguage: "auto",
        originalCommandText: original,
        domain: "translation",
        directTranslationCommand: true
      };
    }
  }

  return { matched: false, sourceText: "", targetLanguage: "", sourceLanguage: "auto", originalCommandText: original };
}

function normalizedTranslationSourceText(value = "") {
  const command = extractIndexDirectTranslationCommand(value);
  return command.matched ? command.sourceText : cleanText(value || "");
}

function looksLikeTranslationCommandEcho(reply = "", command = {}) {
  const text = cleanText(reply || "").toLowerCase();
  const original = cleanText(command.originalCommandText || "").toLowerCase();
  if (!text) return false;
  if (original && text === original) return true;
  return /^(?:please\s+)?translate\s+(?:only\s+)?(?:this\s+)?(?:sentence|text|phrase|line|copy|message)?\s*(?:into|to)\s+(?:english|french|spanish|en|fr|es)\b/i.test(text);
}

function looksLikeLanguageSphereClarifierReply(reply = "") {
  const text = cleanText(reply || "");
  if (!text) return false;
  return /are you asking about translation,? captions,? or language routing inside the interface\??/i.test(text) ||
    /translation,? captions,? or language routing/i.test(text) ||
    /are you asking about .*language routing/i.test(text);
}

function buildIndexDirectTranslationFallback(sourceText = "", targetLanguage = "") {
  const src = cleanText(sourceText || "");
  const key = normalizedInterfaceUtilityText(src);
  const target = normalizeIndexLanguageCode(targetLanguage, "");
  if (!src || !["en", "fr", "es"].includes(target)) return "";

  const phraseMap = {
    en: {
      "commencer la lecture": "Start Reading",
      "comenzar a leer": "Start Reading",
      "comenzar la lectura": "Start Reading",
      "sandblast offre aux createurs une scene mondiale": "Sandblast gives creators a global stage",
      "sandblast offre aux createurs une scene ouverte sur le monde": "Sandblast gives creators a global stage",
      "sandblast ofrece a los creadores un escenario global": "Sandblast gives creators a global stage"
    },
    fr: {
      "start reading": "Commencer la lecture",
      "open feed": "Ouvrir le fil",
      "canada feed": "Fil du Canada",
      "sports feed": "Fil des sports",
      "finance economics": "Finance et économie",
      "finance and economics": "Finance et économie",
      "play": "Lire",
      "pause": "Pause",
      "listen live": "Écouter en direct",
      "watch now": "Regarder maintenant",
      "open player": "Ouvrir le lecteur",
      "open radio": "Ouvrir la radio",
      "open tv": "Ouvrir la télé",
      "sandblast gives creators a global stage": "Sandblast offre aux créateurs une scène mondiale"
    },
    es: {
      "start reading": "Comenzar a leer",
      "open feed": "Abrir el feed",
      "canada feed": "Feed de Canadá",
      "sports feed": "Feed de deportes",
      "finance economics": "Finanzas y economía",
      "finance and economics": "Finanzas y economía",
      "play": "Reproducir",
      "pause": "Pausa",
      "listen live": "Escuchar en vivo",
      "watch now": "Ver ahora",
      "open player": "Abrir el reproductor",
      "open radio": "Abrir la radio",
      "open tv": "Abrir la televisión",
      "sandblast gives creators a global stage": "Sandblast ofrece a los creadores un escenario global"
    }
  };

  if (phraseMap[target] && phraseMap[target][key]) return phraseMap[target][key];

  // Commercial-safe fallback for unsupported free-form text: never echo the command.
  // Preserve brand names and avoid claiming final translation confidence when the adapter did not transform.
  if (/^sandblast\b/i.test(src) && target === "fr") return `Sandblast ${src.replace(/^sandblast\s+/i, "").replace(/\bgives\b/i, "offre").replace(/\bcreators\b/i, "aux créateurs").replace(/\ba global stage\b/i, "une scène mondiale")}`.replace(/\s+/g, " ").trim();
  if (/^sandblast\b/i.test(src) && target === "es") return `Sandblast ${src.replace(/^sandblast\s+/i, "").replace(/\bgives\b/i, "ofrece").replace(/\bcreators\b/i, "a los creadores").replace(/\ba global stage\b/i, "un escenario global")}`.replace(/\s+/g, " ").trim();

  return "";
}

function extractLanguageSphereRequestFromRequest(req, body = {}, payload = {}) {
  const headers = isObj(req && req.headers) ? req.headers : {};
  const src = isObj(body) ? body : {};
  const pay = isObj(payload) ? payload : {};
  const nested = isObj(src.languageSphere) ? src.languageSphere :
    (isObj(pay.languageSphere) ? pay.languageSphere :
      (isObj(src.translation) ? src.translation : (isObj(pay.translation) ? pay.translation : {})));

  const rawCommandText = firstString([
    src.text,
    src.message,
    src.query,
    src.userText,
    pay.text,
    pay.message,
    pay.query,
    pay.userText,
    nested.text,
    nested.message,
    nested.sourceText
  ]);
  const directCommand = extractIndexDirectTranslationCommand(rawCommandText);

  const sourceLanguage = normalizeIndexLanguageCode(
    firstString([
      directCommand.sourceLanguage,
      nested.sourceLanguage,
      nested.source,
      src.sourceLanguage,
      pay.sourceLanguage,
      src.inputLanguage,
      pay.inputLanguage,
      src.detectedLanguage,
      pay.detectedLanguage,
      headers["x-sb-source-language"],
      headers["x-nyx-source-language"],
      headers["x-source-language"],
      "auto"
    ]),
    "auto"
  ) || "auto";

  const targetLanguage = directCommand.targetLanguage || normalizeIndexLanguageCode(
    firstString([
      nested.targetLanguage,
      nested.target,
      nested.outputLanguage,
      nested.responseLanguage,
      src.targetLanguage,
      pay.targetLanguage,
      src.outputLanguage,
      pay.outputLanguage,
      src.responseLanguage,
      pay.responseLanguage,
      src.translateTo,
      pay.translateTo,
      src.languageTarget,
      pay.languageTarget,
      headers["x-sb-target-language"],
      headers["x-nyx-target-language"],
      headers["x-target-language"],
      headers["x-response-language"]
    ]),
    ""
  );

  const domain = cleanText(
    directCommand.domain ||
    nested.domain ||
    src.domain ||
    pay.domain ||
    src.domainHint ||
    pay.domainHint ||
    ""
  );

  return {
    version: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION,
    enabled: nested.enabled !== false && src.translationDisabled !== true && pay.translationDisabled !== true,
    sourceLanguage,
    targetLanguage,
    domain,
    sourceText: cleanText(directCommand.sourceText || nested.sourceText || nested.text || ""),
    originalCommandText: cleanText(directCommand.originalCommandText || rawCommandText || ""),
    directTranslationCommand: directCommand.matched === true,
    requested: directCommand.matched === true || !!targetLanguage,
    context: cleanText(nested.context || (directCommand.matched ? "index-direct-translation-command" : "index-chat-route")),
    requestedAt: now()
  };
}

function isTruthyRequestFlag(value) {
  if (value === true) return true;
  if (value === 1) return true;
  const raw = lower(value);
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on" || raw === "reset" || raw === "clear";
}

function shouldResetConversationFromRequest(req, body = {}, payload = {}) {
  const headers = isObj(req && req.headers) ? req.headers : {};
  const src = isObj(body) ? body : {};
  const pay = isObj(payload) ? payload : {};
  const nested = isObj(src.languageSphere) ? src.languageSphere :
    (isObj(pay.languageSphere) ? pay.languageSphere : {});
  return !!(
    isTruthyRequestFlag(src.reset) ||
    isTruthyRequestFlag(src.clearSession) ||
    isTruthyRequestFlag(src.resetSession) ||
    isTruthyRequestFlag(src.newSession) ||
    isTruthyRequestFlag(src.freshSession) ||
    isTruthyRequestFlag(pay.reset) ||
    isTruthyRequestFlag(pay.clearSession) ||
    isTruthyRequestFlag(pay.resetSession) ||
    isTruthyRequestFlag(pay.newSession) ||
    isTruthyRequestFlag(pay.freshSession) ||
    isTruthyRequestFlag(nested.reset) ||
    isTruthyRequestFlag(nested.clearSession) ||
    isTruthyRequestFlag(headers["x-sb-reset-session"]) ||
    isTruthyRequestFlag(headers["x-reset-session"]) ||
    isTruthyRequestFlag(headers["x-clear-session"])
  );
}

function clearSessionRuntimeState(sessionId) {
  const id = cleanText(sessionId || "");
  if (!id) return false;
  try { memory.lastBySession.delete(id); } catch (_) {}
  try { memory.supportBySession.delete(id); } catch (_) {}
  try { memory.transportBySession.delete(id); } catch (_) {}
  try { memory.spineBySession.delete(id); } catch (_) {}
  return true;
}

function isLanguageSphereRequested(norm = {}) {
  const n = isObj(norm) ? norm : {};
  const ls = isObj(n.languageSphere) ? n.languageSphere : {};
  const target = normalizeIndexLanguageCode(n.targetLanguage || n.outputLanguage || n.responseLanguage || n.translateTo || ls.targetLanguage, "");
  if (!target || target === "auto" || target === "unknown") return false;
  return ["en", "fr", "es"].includes(target);
}

function normalizedInterfaceUtilityText(value) {
  return lower(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isInterfaceUtilityTranslationText(value) {
  const key = normalizedInterfaceUtilityText(value);
  if (!key) return false;
  return new Set([
    "start reading",
    "open feed",
    "canada feed",
    "sports feed",
    "finance economics",
    "finance and economics",
    "play",
    "pause",
    "listen live",
    "watch now",
    "open player",
    "open radio",
    "open tv"
  ]).has(key);
}

function shouldBypassPriorMemoryForCurrentTurn(norm = {}, req = null) {
  const n = isObj(norm) ? norm : {};
  const text = cleanText(n.originalText || n.text || "");
  if (n.resetConversation === true || n.clearSession === true) return true;
  if (shouldResetConversationFromRequest(req || {}, n.body || {}, n.payload || {})) return true;

  /**
   * LanguageSphere test/utility turns must not inherit stale Marion continuity.
   * The live failure showed a fresh "Start Reading" translation request being
   * answered with a prior marketing clarification. When a target language is
   * explicit and the text is a short interface phrase, current-turn text wins.
   */
  if (isObj(n.languageSphere) && n.languageSphere.directTranslationCommand === true) return true;
  if (extractIndexDirectTranslationCommand(n.originalRawText || n.originalText || text).matched) return true;
  if (isLanguageSphereRequested(n) && isInterfaceUtilityTranslationText(normalizedTranslationSourceText(text))) return true;
  if (isLanguageSphereRequested(n) && /^languagesphere[-_]/i.test(cleanText(n.lane || ""))) return true;
  return false;
}

function shouldUseLanguageSphereDirectTranslation(norm = {}) {
  const n = isObj(norm) ? norm : {};
  const ls = isObj(n.languageSphere) ? n.languageSphere : {};
  const command = extractIndexDirectTranslationCommand(n.originalRawText || ls.originalCommandText || n.originalText || n.text || "");
  const text = cleanText(ls.sourceText || command.sourceText || n.originalText || n.text || "");
  if (!text || text.length > 600) return false;
  if (!isLanguageSphereRequested(n) && command.matched !== true) return false;
  const source = normalizeIndexLanguageCode(n.sourceLanguage || ls.sourceLanguage || command.sourceLanguage, "auto") || "auto";
  const target = normalizeIndexLanguageCode(n.targetLanguage || n.outputLanguage || ls.targetLanguage || command.targetLanguage, "");
  if (!target || target === "auto" || target === "unknown") return false;
  if (source && source !== "auto" && source !== "unknown" && source === target) return false;
  const domain = lower(n.domainHint || (n.marionRouting && n.marionRouting.domain) || ls.domain || "");
  if (command.matched === true || ls.directTranslationCommand === true) return true;
  return domain === "translation" || domain === "interface" || isInterfaceUtilityTranslationText(text) || /^languagesphere[-_]/i.test(cleanText(n.lane || ""));
}

function getDirectLanguageSphereAdapter() {
  if (universalTranslatorAdapterMod && typeof universalTranslatorAdapterMod === "object") {
    return { mod: universalTranslatorAdapterMod, source: "UniversalTranslatorAdapter" };
  }
  return getLanguageSphereAdapter();
}

async function buildLanguageSphereDirectTranslationResponse(norm = {}, sessionId = "", startedAt = now()) {
  const n = isObj(norm) ? norm : {};
  if (!shouldUseLanguageSphereDirectTranslation(n)) return null;

  const ls = isObj(n.languageSphere) ? n.languageSphere : {};
  const command = extractIndexDirectTranslationCommand(n.originalRawText || ls.originalCommandText || n.originalText || n.text || "");
  const originalText = cleanText(ls.sourceText || command.sourceText || n.originalText || n.text || "");
  const sourceLanguage = normalizeIndexLanguageCode(n.sourceLanguage || ls.sourceLanguage, "auto") || "auto";
  const targetLanguage = normalizeIndexLanguageCode(n.targetLanguage || n.outputLanguage || ls.targetLanguage, "");
  const domain = cleanText(n.domainHint || (n.marionRouting && n.marionRouting.domain) || ls.domain || "interface") || "interface";
  const adapter = getDirectLanguageSphereAdapter();

  const languageSphereMeta = {
    version: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION,
    indexBridge: true,
    directUtilityTranslation: true,
    staleCarryBypass: true,
    attempted: false,
    applied: false,
    failClosed: true,
    source: adapter.source,
    sourceLanguage,
    targetLanguage,
    domain,
    originalReplyHash: replyHash(originalText),
    originalCommandText: cleanText(ls.originalCommandText || command.originalCommandText || ""),
    directTranslationCommand: command.matched === true || ls.directTranslationCommand === true
  };

  if (!adapter.mod || !originalText) return null;

  try {
    let out = null;

    if (typeof adapter.mod.translateText === "function") {
      out = await Promise.resolve(adapter.mod.translateText(originalText, {
        sourceLanguage,
        targetLanguage,
        domain,
        context: "index-direct-interface-translation",
        protectedTerms: Array.isArray(ls.protectedTerms) ? ls.protectedTerms : []
      }));
    } else if (typeof adapter.mod.applyUniversalTranslation === "function") {
      out = await Promise.resolve(adapter.mod.applyUniversalTranslation({
        final: originalText,
        reply: originalText,
        text: originalText,
        finalEnvelope: {
          reply: originalText,
          text: originalText,
          displayReply: originalText,
          final: true,
          marionFinal: false,
          handled: true,
          authority: "languageSphereIndexBridge",
          contractVersion: "nyx.languagesphere.final/1.0"
        }
      }, {
        sourceLanguage,
        targetLanguage,
        domain,
        context: "index-direct-interface-translation",
        protectedTerms: Array.isArray(ls.protectedTerms) ? ls.protectedTerms : []
      }));
    }

    const finalEnvelope = isObj(out && out.finalEnvelope) ? out.finalEnvelope : {};
    let translatedText = cleanReplyForUser(
      (out && (out.text || out.reply || out.final || out.translatedText)) ||
      finalEnvelope.reply ||
      finalEnvelope.text ||
      originalText
    ) || originalText;

    const deterministicFallback = buildIndexDirectTranslationFallback(originalText, targetLanguage);
    if (
      deterministicFallback &&
      (
        translatedText === originalText ||
        looksLikeTranslationCommandEcho(translatedText, command) ||
        looksLikeTranslationCommandEcho(translatedText, { originalCommandText: ls.originalCommandText }) ||
        looksLikeLanguageSphereClarifierReply(translatedText)
      )
    ) {
      translatedText = deterministicFallback;
    }

    const applied = !!translatedText && translatedText !== originalText;
    const finalLanguageSphere = {
      ...languageSphereMeta,
      attempted: true,
      applied,
      translatedReplyHash: replyHash(translatedText),
      adapterMeta: isObj(out && out.meta) ? out.meta :
        (isObj(out && out.translationMeta) ? out.translationMeta : {})
    };

    const runtimeTelemetry = buildIndexRuntimeTelemetry({
      norm: n,
      selected: { reply: translatedText, meta: { languageSphere: finalLanguageSphere } },
      marion: {},
      reply: translatedText,
      authority: "languageSphere_index_direct",
      startedAt,
      stage: "final",
      canEmit: true
    });

    const basePacket = {
      ok: true,
      final: true,
      finalized: true,
      handled: true,
      marionFinal: false,
      awaitingMarion: false,
      suppressUserFacingReply: false,
      emit: true,
      blocked: false,
      reply: translatedText,
      text: translatedText,
      short: translatedText,
      answer: translatedText,
      output: translatedText,
      response: translatedText,
      displayReply: translatedText,
      spokenText: translatedText,
      textSpeak: translatedText,
      textDisplay: translatedText,
      languageSphere: finalLanguageSphere,
      finalEnvelope: {
        reply: translatedText,
        text: translatedText,
        displayReply: translatedText,
        spokenText: translatedText,
        final: true,
        marionFinal: false,
        handled: true,
        authority: "languageSphereIndexBridge",
        contractVersion: "nyx.languagesphere.final/1.0",
        languageSphere: finalLanguageSphere,
        finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
        runtimeTelemetry
      },
      payload: {
        reply: translatedText,
        text: translatedText,
        message: translatedText,
        answer: translatedText,
        output: translatedText,
        response: translatedText,
        displayReply: translatedText,
        spokenText: translatedText,
        textSpeak: translatedText,
        textDisplay: translatedText,
        final: true,
        finalized: true,
        marionFinal: false,
        handled: true,
        awaitingMarion: false,
        emit: true,
        blocked: false,
        suppressUserFacingReply: false,
        languageSphere: finalLanguageSphere,
        finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
        runtimeTelemetry
      },
      lane: n.lane || "general",
      laneId: n.lane || "general",
      sessionLane: n.lane || "general",
      inputSource: n.inputSource,
      source: n.source,
      marionIntent: n.marionIntent,
      marionRouting: n.marionRouting,
      requestId: makeTraceId("req"),
      traceId: n.traceId,
      finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
      runtimeTelemetry,
      meta: {
        v: PUBLIC_INDEX_VERSION,
        t: now(),
        indexRole: "transport_only",
        transportOnly: true,
        noSupportDecision: true,
        noEmotionDecision: true,
        replyAuthority: "languageSphere_index_direct",
        semanticAuthority: "languageSphere",
        staleCarryBypass: true,
        sessionId: cleanText(sessionId || ""),
        languageSphere: finalLanguageSphere,
        latencyMs: now() - startedAt
      },
      diagnostics: {
        languageSphere: finalLanguageSphere,
        staleCarryBypass: true,
        directUtilityTranslation: true
      }
    };

    try {
      const speech = buildSpeechContract(basePacket, n);
      const withAudio = ensureAudioContractFromSpeech(attachVoiceRoute(basePacket), speech);
      withAudio.speech = speech;
      withAudio.tts = {
        ready: !!cleanText(speech && speech.textSpeak || translatedText || ""),
        textSpeak: cleanText(speech && speech.textSpeak || translatedText || ""),
        provider: cleanText(withAudio.audio && withAudio.audio.provider || process.env.TTS_PROVIDER || "resemble") || "resemble"
      };
      withAudio.playback = {
        ready: !!cleanText(withAudio.audio && withAudio.audio.textToSynth || speech && speech.textSpeak || translatedText || ""),
        autoPlay: !!(withAudio.audio && withAudio.audio.autoPlay !== false),
        route: routeUrl("/api/tts"),
        compatibilityRoute: routeUrl("/tts"),
        health: routeUrl("/api/tts/health"),
        compatibilityHealth: routeUrl("/tts/health"),
        textSpeak: cleanText(withAudio.audio && withAudio.audio.textToSynth || speech && speech.textSpeak || translatedText || ""),
        provider: cleanText(withAudio.audio && withAudio.audio.provider || process.env.TTS_PROVIDER || "resemble") || "resemble"
      };
      return withAudio;
    } catch (_) {
      return basePacket;
    }
  } catch (err) {
    return null;
  }
}


function shouldAttemptFinalLanguageSphere(norm = {}) {
  const ls = isObj(norm.languageSphere) ? norm.languageSphere : {};
  if (ls.enabled === false) return false;
  const target = normalizeIndexLanguageCode(norm.targetLanguage || norm.outputLanguage || ls.targetLanguage, "");
  if (!target || target === "auto" || target === "unknown") return false;
  const source = normalizeIndexLanguageCode(norm.sourceLanguage || ls.sourceLanguage, "auto");
  if (source && source !== "auto" && source !== "unknown" && source === target) return false;
  return ["en", "fr", "es"].includes(target);
}

function getLanguageSphereAdapter() {
  if (chatEngineMod && typeof chatEngineMod === "object") {
    if (typeof chatEngineMod.normalizeInputForMarion === "function" || typeof chatEngineMod.applyLanguageSphereToTrustedFinal === "function") {
      return { mod: chatEngineMod, source: "chatEngine" };
    }
  }
  if (universalTranslatorAdapterMod && typeof universalTranslatorAdapterMod === "object") {
    if (typeof universalTranslatorAdapterMod.normalizeInputForMarion === "function" || typeof universalTranslatorAdapterMod.applyUniversalTranslation === "function") {
      return { mod: universalTranslatorAdapterMod, source: "UniversalTranslatorAdapter" };
    }
  }
  return { mod: null, source: "unavailable" };
}

async function normalizeIndexInputForMarion(norm = {}) {
  const n = isObj(norm) ? norm : {};
  const originalText = cleanText(n.text || "");
  const adapter = getLanguageSphereAdapter();
  const ls = isObj(n.languageSphere) ? n.languageSphere : {};
  const sourceLanguage = normalizeIndexLanguageCode(n.sourceLanguage || ls.sourceLanguage, "auto") || "auto";
  const domain = cleanText(n.domainHint || ls.domain || (n.marionRouting && n.marionRouting.domain) || "general") || "general";
  const base = {
    version: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION,
    source: adapter.source,
    enabled: !!adapter.mod,
    originalText,
    normalizedText: originalText,
    detectedLanguage: sourceLanguage,
    detectionConfidence: null,
    translatedForRouting: false,
    failClosed: true,
    warning: adapter.mod ? null : "language-sphere-adapter-unavailable"
  };

  if (!originalText || !adapter.mod) return base;

  try {
    if (typeof adapter.mod.normalizeInputForMarion === "function") {
      const out = await Promise.resolve(adapter.mod.normalizeInputForMarion(originalText, {
        sourceLanguage,
        domain,
        context: "index-pre-routing",
        protectedTerms: Array.isArray(ls.protectedTerms) ? ls.protectedTerms : []
      }));
      if (isObj(out)) {
        return {
          ...base,
          ...out,
          source: adapter.source,
          originalText,
          normalizedText: cleanText(out.normalizedText || originalText) || originalText,
          detectedLanguage: normalizeIndexLanguageCode(out.detectedLanguage || out.sourceLanguage || sourceLanguage, sourceLanguage) || sourceLanguage,
          translatedForRouting: out.translatedForRouting === true,
          failClosed: true
        };
      }
    }
  } catch (err) {
    return {
      ...base,
      warning: "language-sphere-input-normalization-failed",
      error: cleanText(err && (err.message || err) || "normalization_failed")
    };
  }

  return base;
}

function getLanguageSphereApiMiddleware() {
  if (languageSphereApiMiddlewareMod && typeof languageSphereApiMiddlewareMod.prepareLanguageSphereForApiChat === "function") {
    return { mod: languageSphereApiMiddlewareMod, source: "LanguageSphereApiMiddleware" };
  }
  return { mod: null, source: "unavailable" };
}

function normalizeIndexMiddlewareTargetLanguage(norm = {}) {
  const envTarget = normalizeIndexLanguageCode(process.env.SB_LANGUAGESPHERE_MARION_TARGET_LANGUAGE || process.env.LANGUAGESPHERE_MARION_TARGET_LANGUAGE || "en", "en") || "en";
  const n = isObj(norm) ? norm : {};
  const ls = isObj(n.languageSphere) ? n.languageSphere : {};
  const explicitPrepTarget = normalizeIndexLanguageCode(ls.marionTargetLanguage || n.marionTargetLanguage || n.inputTargetLanguage || "", "");
  return explicitPrepTarget || envTarget || "en";
}

function shouldApplyLanguageSphereApiMiddleware(norm = {}) {
  const n = isObj(norm) ? norm : {};
  if (n.languageSphereApiMiddlewareDisabled === true) return false;
  if (process.env.SB_LANGUAGESPHERE_API_MIDDLEWARE_ENABLED === "0" || process.env.SB_LANGUAGESPHERE_API_MIDDLEWARE_ENABLED === "false") return false;
  const text = cleanText(n.originalText || n.text || "");
  if (!text) return false;
  const middleware = getLanguageSphereApiMiddleware();
  return !!middleware.mod;
}

function buildLanguageSphereApiPayload(norm = {}, req = null, sessionId = "") {
  const n = isObj(norm) ? norm : {};
  const body = isObj(n.body) ? n.body : {};
  const payload = isObj(n.payload) ? n.payload : {};
  const ls = isObj(n.languageSphere) ? n.languageSphere : {};
  const originalText = cleanText(n.originalText || n.text || "");
  const marionTargetLanguage = normalizeIndexMiddlewareTargetLanguage(n);
  return {
    ...payload,
    ...body,
    text: originalText,
    userText: originalText,
    message: originalText,
    originalText,
    requestId: cleanText(n.traceId || (req && req.sbTraceId) || makeTraceId("req")),
    sessionId: cleanText(sessionId || n.sessionId || ""),
    inputSource: cleanText(n.inputSource || n.source || "text") || "text",
    sourceLanguage: normalizeIndexLanguageCode(n.sourceLanguage || ls.sourceLanguage || "auto", "auto") || "auto",
    targetLanguage: marionTargetLanguage,
    targetLang: marionTargetLanguage,
    locale: cleanText(ls.locale || n.locale || marionTargetLanguage),
    domain: cleanText(n.domainHint || ls.domain || (n.marionRouting && n.marionRouting.domain) || "general") || "general",
    languageSphere: {
      ...ls,
      indexBridgeVersion: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION,
      marionTargetLanguage,
      responseTargetLanguage: normalizeIndexLanguageCode(n.targetLanguage || n.outputLanguage || ls.targetLanguage || "", "")
    }
  };
}

async function applyLanguageSphereApiMiddlewareToNorm(norm = {}, req = null, sessionId = "") {
  const n = isObj(norm) ? norm : {};
  const middleware = getLanguageSphereApiMiddleware();
  const baseMeta = {
    version: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION,
    apiMiddlewareVersion: "nyx.languagesphere.apiMiddleware.index/1.0",
    attempted: false,
    applied: false,
    blocked: false,
    source: middleware.source,
    targetLanguage: normalizeIndexMiddlewareTargetLanguage(n),
    authority: {
      finalAuthority: false,
      finalAuthorityOwner: "Marion",
      mayBypassMarion: false,
      marionBypassBlocked: true
    }
  };

  if (!shouldApplyLanguageSphereApiMiddleware(n)) {
    n.languageSphereApiMiddleware = {
      ...baseMeta,
      skipped: true,
      reason: middleware.mod ? "not-required" : "middleware-unavailable"
    };
    return { ok: true, skipped: true, norm: n, result: null };
  }

  try {
    const apiPayload = buildLanguageSphereApiPayload(n, req, sessionId);
    const result = await Promise.resolve(middleware.mod.prepareLanguageSphereForApiChat(apiPayload, {
      indexBridge: true,
      context: "index-api-chat-pre-marion",
      domain: apiPayload.domain
    }));

    const marionPayload = isObj(result && result.marionPayload) ? result.marionPayload : {};
    const preparedText = cleanText(marionPayload.text || marionPayload.userText || "");
    const originalText = cleanText(n.originalText || n.text || "");

    n.languageSphereApiMiddleware = {
      ...baseMeta,
      attempted: true,
      applied: !!(result && result.ok && preparedText),
      blocked: !!(result && result.blocked),
      reason: cleanText(result && result.reason || "languagesphere-api-middleware-complete"),
      telemetrySummary: isObj(marionPayload.languageSphereTelemetrySummary) ? marionPayload.languageSphereTelemetrySummary : {},
      fallback: isObj(marionPayload.languageSphereFallback) ? marionPayload.languageSphereFallback : {},
      languageContext: isObj(marionPayload.languageContext) ? marionPayload.languageContext : {},
      finalAuthorityOwner: "Marion",
      mayBypassMarion: false
    };

    n.languageSphere = {
      ...(isObj(n.languageSphere) ? n.languageSphere : {}),
      apiMiddleware: n.languageSphereApiMiddleware,
      runtimeEnvelope: isObj(marionPayload.languageSphere) ? marionPayload.languageSphere : undefined,
      telemetry: isObj(marionPayload.languageSphereTelemetry) ? marionPayload.languageSphereTelemetry : undefined,
      telemetrySummary: isObj(marionPayload.languageSphereTelemetrySummary) ? marionPayload.languageSphereTelemetrySummary : undefined,
      fallback: isObj(marionPayload.languageSphereFallback) ? marionPayload.languageSphereFallback : undefined,
      indexBridgeVersion: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION
    };

    if (result && result.blocked) {
      return { ok: false, blocked: true, norm: n, result };
    }

    if (result && result.ok && preparedText && preparedText !== cleanText(n.text || "")) {
      n.originalText = originalText || cleanText(marionPayload.originalText || preparedText);
      n.text = preparedText;
      n.query = preparedText;
      n.userQuery = preparedText;
      n.inputNormalizedForMarion = true;
      n.languageSphereApiPrepared = true;
    }

    if (isObj(marionPayload.languageContext)) {
      n.sourceLanguage = cleanText(marionPayload.languageContext.sourceLanguage || n.sourceLanguage || "auto") || "auto";
      n.languageSphereLanguageContext = marionPayload.languageContext;
    }

    return { ok: true, blocked: false, norm: n, result };
  } catch (err) {
    n.languageSphereApiMiddleware = {
      ...baseMeta,
      attempted: true,
      applied: false,
      blocked: false,
      failedSafe: true,
      reason: "languagesphere-api-middleware-failed-safe",
      error: "LanguageSphere API middleware failed safely."
    };
    n.languageSphere = {
      ...(isObj(n.languageSphere) ? n.languageSphere : {}),
      apiMiddleware: n.languageSphereApiMiddleware,
      indexBridgeVersion: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION
    };
    console.log("[Sandblast][languageSphereApiMiddleware:failedSafe]", { traceId: n.traceId, error: cleanText(err && (err.message || err) || "failed") });
    return { ok: true, failedSafe: true, norm: n, result: null };
  }
}

function mergeLanguageSphereMeta(target, languageSphere) {
  const out = isObj(target) ? { ...target } : {};
  const ls = isObj(languageSphere) ? languageSphere : {};
  out.languageSphere = {
    ...(isObj(out.languageSphere) ? out.languageSphere : {}),
    ...ls,
    version: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION,
    indexBridge: true
  };
  return out;
}

function firstObjValue() {
  for (let i = 0; i < arguments.length; i += 1) {
    const item = arguments[i];
    if (isObj(item) && Object.keys(item).length) return item;
  }
  return {};
}

function firstArrayValue() {
  for (let i = 0; i < arguments.length; i += 1) {
    const item = arguments[i];
    if (Array.isArray(item) && item.length) return item;
  }
  return [];
}

function buildIndexLanguageSphereSurface(selected = {}, norm = {}, languageSphereFinal = {}) {
  const s = isObj(selected) ? selected : {};
  const n = isObj(norm) ? norm : {};
  const fe = isObj(s.finalEnvelope) ? s.finalEnvelope : {};
  const payload = isObj(s.payload) ? s.payload : {};
  const meta = isObj(s.meta) ? s.meta : {};
  const diag = isObj(s.diagnostics) ? s.diagnostics : {};
  const finalObj = isObj(languageSphereFinal) ? languageSphereFinal : {};

  const baseLanguageSphere = {
    ...(isObj(n.languageSphere) ? n.languageSphere : {}),
    ...(isObj(fe.languageSphere) ? fe.languageSphere : {}),
    ...(isObj(payload.languageSphere) ? payload.languageSphere : {}),
    ...(isObj(meta.languageSphere) ? meta.languageSphere : {}),
    ...(isObj(diag.languageSphere) ? diag.languageSphere : {}),
    ...(isObj(s.languageSphere) ? s.languageSphere : {}),
    ...(isObj(finalObj.languageSphere) ? finalObj.languageSphere : {})
  };

  if (!Object.keys(baseLanguageSphere).length) {
    baseLanguageSphere.version = LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION;
    baseLanguageSphere.indexBridge = true;
    baseLanguageSphere.stage = "final-surface";
    baseLanguageSphere.authority = "marion";
  }

  let contextPassport = firstObjValue(
    s.contextPassport,
    fe.contextPassport,
    payload.contextPassport,
    meta.contextPassport,
    diag.contextPassport,
    baseLanguageSphere.contextPassport,
    finalObj.contextPassport
  );

  const languageSphereEvents = firstArrayValue(
    s.languageSphereEvents,
    s.events,
    fe.languageSphereEvents,
    fe.events,
    payload.languageSphereEvents,
    payload.events,
    meta.languageSphereEvents,
    meta.events,
    baseLanguageSphere.events,
    finalObj.languageSphereEvents,
    finalObj.events
  );

  const languageSphereTelemetry = firstObjValue(
    s.languageSphereTelemetry,
    s.telemetry,
    fe.languageSphereTelemetry,
    fe.telemetry,
    payload.languageSphereTelemetry,
    payload.telemetry,
    meta.languageSphereTelemetry,
    meta.telemetry,
    baseLanguageSphere.telemetry,
    finalObj.languageSphereTelemetry,
    finalObj.telemetry
  );

  const multilingualFinalEnvelope = firstObjValue(
    s.multilingualFinalEnvelope,
    fe.multilingualFinalEnvelope,
    payload.multilingualFinalEnvelope,
    meta.multilingualFinalEnvelope,
    finalObj.multilingualFinalEnvelope
  );

  const languageSphere = {
    ...baseLanguageSphere,
    version: cleanText(baseLanguageSphere.version || LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION),
    indexBridge: true,
    authority: cleanText(baseLanguageSphere.authority || "marion") || "marion",
    displayAuthority: "nyx",
    publicAgent: "nyx",
    userFacingAgent: "Nyx",
    visibleToUser: baseLanguageSphere.visibleToUser !== false,
    ...(languageSphereEvents.length ? { events: languageSphereEvents } : {}),
    ...(Object.keys(languageSphereTelemetry).length ? { telemetry: languageSphereTelemetry } : {})
  };

  if (!Object.keys(contextPassport).length) {
    contextPassport = buildNyxPublicContextPassportSurface(languageSphere);
  }
  languageSphere.contextPassport = contextPassport;

  return {
    languageSphere,
    contextPassport,
    languageSphereEvents,
    languageSphereTelemetry,
    multilingualFinalEnvelope
  };
}

function applyIndexLanguageSphereSurface(selected = {}, norm = {}, languageSphereFinal = {}) {
  const out = isObj(selected) ? { ...selected } : {};
  const surface = buildIndexLanguageSphereSurface(out, norm, languageSphereFinal);

  out.languageSphere = surface.languageSphere;
  out.contextPassport = surface.contextPassport;
  out.languageSphereEvents = surface.languageSphereEvents;
  out.events = surface.languageSphereEvents;
  out.languageSphereTelemetry = surface.languageSphereTelemetry;
  out.telemetry = surface.languageSphereTelemetry;
  out.multilingualFinalEnvelope = surface.multilingualFinalEnvelope;

  out.finalEnvelope = {
    ...(isObj(out.finalEnvelope) ? out.finalEnvelope : {}),
    languageSphere: surface.languageSphere,
    contextPassport: surface.contextPassport,
    languageSphereEvents: surface.languageSphereEvents,
    events: surface.languageSphereEvents,
    languageSphereTelemetry: surface.languageSphereTelemetry,
    telemetry: surface.languageSphereTelemetry,
    multilingualFinalEnvelope: surface.multilingualFinalEnvelope
  };

  out.payload = {
    ...(isObj(out.payload) ? out.payload : {}),
    languageSphere: surface.languageSphere,
    contextPassport: surface.contextPassport,
    languageSphereEvents: surface.languageSphereEvents,
    events: surface.languageSphereEvents,
    languageSphereTelemetry: surface.languageSphereTelemetry,
    telemetry: surface.languageSphereTelemetry,
    multilingualFinalEnvelope: surface.multilingualFinalEnvelope
  };

  out.meta = mergeLanguageSphereMeta({
    ...(isObj(out.meta) ? out.meta : {}),
    contextPassport: surface.contextPassport,
    languageSphereEvents: surface.languageSphereEvents,
    languageSphereTelemetry: surface.languageSphereTelemetry,
    multilingualFinalEnvelope: surface.multilingualFinalEnvelope
  }, surface.languageSphere);

  return out;
}

async function applyIndexLanguageSphereToTrustedFinal(selected = {}, norm = {}, currentReply = "") {
  const sourcePacket = isObj(selected) ? selected : {};
  const n = isObj(norm) ? norm : {};
  const originalReply = cleanText(currentReply || sourcePacket.reply || sourcePacket.text || (sourcePacket.finalEnvelope && sourcePacket.finalEnvelope.reply) || "");
  const targetLanguage = normalizeIndexLanguageCode(n.targetLanguage || n.outputLanguage || (n.languageSphere && n.languageSphere.targetLanguage), "");
  const sourceLanguage = normalizeIndexLanguageCode(n.sourceLanguage || (n.languageSphere && n.languageSphere.sourceLanguage), "auto") || "auto";
  const domain = cleanText(n.domainHint || (n.marionRouting && n.marionRouting.domain) || (n.languageSphere && n.languageSphere.domain) || "general") || "general";
  const adapter = getLanguageSphereAdapter();

  const baseMeta = {
    version: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION,
    source: adapter.source,
    indexBridge: true,
    stage: "post-marion-final",
    attempted: false,
    applied: false,
    failClosed: true,
    sourceLanguage,
    targetLanguage,
    domain,
    originalReplyHash: replyHash(originalReply)
  };

  if (!originalReply || !shouldAttemptFinalLanguageSphere(n) || !adapter.mod) {
    return {
      packet: sourcePacket,
      reply: originalReply,
      languageSphere: {
        ...baseMeta,
        warning: !adapter.mod ? "language-sphere-adapter-unavailable" : "translation-not-requested"
      }
    };
  }

  const translationInput = {
    ...sourcePacket,
    sourceLanguage,
    targetLanguage,
    domain,
    finalEnvelope: {
      ...(isObj(sourcePacket.finalEnvelope) ? sourcePacket.finalEnvelope : {}),
      reply: originalReply,
      text: originalReply,
      displayReply: originalReply,
      final: true,
      marionFinal: sourcePacket.marionFinal !== false,
      handled: true,
      authority: cleanText(sourcePacket.finalEnvelope && sourcePacket.finalEnvelope.authority || "marionFinalEnvelope") || "marionFinalEnvelope",
      contractVersion: cleanText(sourcePacket.finalEnvelope && sourcePacket.finalEnvelope.contractVersion || "nyx.marion.final/1.0") || "nyx.marion.final/1.0"
    },
    meta: {
      ...(isObj(sourcePacket.meta) ? sourcePacket.meta : {}),
      languageSphere: baseMeta
    }
  };

  try {
    let translated = null;

    if (typeof adapter.mod.applyLanguageSphereToTrustedFinal === "function") {
      translated = await Promise.resolve(adapter.mod.applyLanguageSphereToTrustedFinal(translationInput, {
        sourceLanguage,
        targetLanguage,
        domain,
        context: "index-post-final"
      }));
    } else if (typeof adapter.mod.applyUniversalTranslation === "function") {
      translated = await Promise.resolve(adapter.mod.applyUniversalTranslation(translationInput, {
        sourceLanguage,
        targetLanguage,
        domain,
        context: "index-post-final"
      }));
    }

    const out = isObj(translated) ? translated : translationInput;
    const finalEnvelope = isObj(out.finalEnvelope) ? out.finalEnvelope : {};
    const translatedReply = cleanReplyForUser(
      finalEnvelope.reply ||
      finalEnvelope.text ||
      out.reply ||
      out.text ||
      originalReply
    ) || originalReply;

    if (!translatedReply || isConversationDiagnosticFallbackReply(translatedReply) || isBlockedLoopingSupportReply(translatedReply)) {
      return {
        packet: sourcePacket,
        reply: originalReply,
        languageSphere: {
          ...baseMeta,
          attempted: true,
          warning: "translated-reply-rejected-by-index-sanitizer"
        }
      };
    }

    const languageSphereMeta = {
      ...baseMeta,
      attempted: true,
      applied: translatedReply !== originalReply,
      translatedReplyHash: replyHash(translatedReply),
      adapterMeta: isObj(out.translationMeta) ? out.translationMeta :
        (isObj(finalEnvelope.translationMeta) ? finalEnvelope.translationMeta :
          (isObj(out.meta && out.meta.languageSphere) ? out.meta.languageSphere : {}))
    };

    const next = {
      ...sourcePacket,
      ...out,
      reply: translatedReply,
      text: translatedReply,
      answer: translatedReply,
      output: translatedReply,
      response: translatedReply,
      spokenText: translatedReply,
      finalEnvelope: {
        ...(isObj(sourcePacket.finalEnvelope) ? sourcePacket.finalEnvelope : {}),
        ...finalEnvelope,
        reply: translatedReply,
        text: translatedReply,
        displayReply: translatedReply,
        spokenText: translatedReply,
        final: true,
        marionFinal: sourcePacket.marionFinal !== false,
        handled: true,
        authority: cleanText((finalEnvelope && finalEnvelope.authority) || (sourcePacket.finalEnvelope && sourcePacket.finalEnvelope.authority) || "marionFinalEnvelope") || "marionFinalEnvelope",
        contractVersion: cleanText((finalEnvelope && finalEnvelope.contractVersion) || (sourcePacket.finalEnvelope && sourcePacket.finalEnvelope.contractVersion) || "nyx.marion.final/1.0") || "nyx.marion.final/1.0",
        languageSphere: languageSphereMeta
      },
      payload: {
        ...(isObj(sourcePacket.payload) ? sourcePacket.payload : {}),
        ...(isObj(out.payload) ? out.payload : {}),
        reply: translatedReply,
        text: translatedReply,
        message: translatedReply,
        displayReply: translatedReply,
        spokenText: translatedReply,
        languageSphere: languageSphereMeta
      },
      meta: mergeLanguageSphereMeta({
        ...(isObj(sourcePacket.meta) ? sourcePacket.meta : {}),
        ...(isObj(out.meta) ? out.meta : {})
      }, languageSphereMeta),
      diagnostics: mergeLanguageSphereMeta({
        ...(isObj(sourcePacket.diagnostics) ? sourcePacket.diagnostics : {}),
        ...(isObj(out.diagnostics) ? out.diagnostics : {})
      }, languageSphereMeta)
    };

    return {
      packet: next,
      reply: translatedReply,
      languageSphere: languageSphereMeta
    };
  } catch (err) {
    return {
      packet: sourcePacket,
      reply: originalReply,
      languageSphere: {
        ...baseMeta,
        attempted: true,
        applied: false,
        warning: "language-sphere-final-translation-failed",
        error: cleanText(err && (err.message || err) || "translation_failed")
      }
    };
  }
}


function normalizeIndexLingoSentinelGatewaySurface(value) {
  const src = isObj(value) ? value : {};
  const response = isObj(src.lingoSentinelResponse) ? src.lingoSentinelResponse : {};
  const authorityReview = isObj(src.authorityReview) ? src.authorityReview : {};
  const languageMeta = isObj(src.languageMeta) ? src.languageMeta : {};
  const translationMeta = isObj(src.translationMeta) ? src.translationMeta : {};
  const glossaryMeta = isObj(src.glossaryMeta) ? src.glossaryMeta : (isObj(response.glossaryMeta) ? response.glossaryMeta : {});
  const gatewayMeta = isObj(src.gatewayMeta) ? src.gatewayMeta : (isObj(src.lingoSentinelGatewayMeta) ? src.lingoSentinelGatewayMeta : {});
  const unknownLanguageAlert = isObj(src.unknownLanguageAlert) ? src.unknownLanguageAlert : {};
  const scannerHeartbeat = isObj(src.scannerHeartbeat) ? src.scannerHeartbeat : {};
  const dormantScanner = isObj(src.dormantScanner) ? src.dormantScanner : {};
  const route = cleanText(src.route || gatewayMeta.route || "MARION_ONLY");
  const sourceLanguage = cleanText(src.sourceLanguage || response.sourceLanguage || response.detectedLanguage || languageMeta.detectedLanguage || translationMeta.sourceLanguage || "unknown");
  const targetLanguage = cleanText(src.targetLanguage || response.targetLanguage || translationMeta.targetLanguage || "en");
  const confidence = Number.isFinite(Number(src.confidence)) ? Number(src.confidence) : (Number.isFinite(Number(response.confidence)) ? Number(response.confidence) : (Number.isFinite(Number(languageMeta.confidence)) ? Number(languageMeta.confidence) : null));
  const inputHash = cleanText(src.inputHash || gatewayMeta.inputHash || gatewayMeta.stableHash || src.requestId || "");
  const gatewayHash = cleanText(src.gatewayHash || gatewayMeta.gatewayHash || gatewayMeta.stableHash || src.requestId || "");
  const stableHash = cleanText(src.stableHash || gatewayMeta.stableHash || gatewayHash || inputHash || src.requestId || "");
  const correlationId = cleanText(src.correlationId || gatewayMeta.correlationId || src.requestId || gatewayHash || stableHash || "");
  const traceId = cleanText(src.traceId || gatewayMeta.traceId || src.requestId || correlationId || "");
  const finalText = cleanText(src.finalText || authorityReview.finalText || response.finalText || response.adaptedText || response.translatedText || translationMeta.advisoryText || translationMeta.translatedText || translationMeta.renderText || translationMeta.publicText || translationMeta.text || "");
  const routed = src.routed === true || route.indexOf("LINGOSENTINEL_") === 0;
  const fallbackTriggered = src.ok === false || response.fallbackUsed === true || languageMeta.fallbackTriggered === true || translationMeta.fallbackTriggered === true || gatewayMeta.fallbackTriggered === true;
  return {
    version: LINGOSENTINEL_GATEWAY_INDEX_VERSION,
    available: !!runIndexLingoSentinelGateway,
    active: src.ok !== false && routed,
    routed,
    route,
    requestId: cleanText(src.requestId || gatewayMeta.requestId || ""),
    stage: "index-pre-marion",
    authority: "marion",
    advisoryOnly: true,
    marionFinalAuthority: src.marionFinalAuthority !== false,
    approvedByMarion: authorityReview.approved !== false && src.ok !== false,
    detectedLanguage: sourceLanguage,
    sourceLanguage,
    targetLanguage,
    confidence,
    supported: languageMeta.supported !== false,
    requiresTranslation: routed,
    translated: !!(routed && finalText && src.ok !== false),
    fallbackTriggered,
    alertTriggered: !!(unknownLanguageAlert.alertTriggered || gatewayMeta.alertTriggered || (isObj(dormantScanner.unknownLanguageAlert) && dormantScanner.unknownLanguageAlert.alertTriggered)),
    notificationReady: !!(unknownLanguageAlert.notificationReady || gatewayMeta.notificationReady || dormantScanner.notificationReady),
    scannerReady: cleanText(scannerHeartbeat.status)==="ready" || (isObj(dormantScanner.telemetry) && dormantScanner.telemetry.scannerReady === true),
    advisoryText: finalText,
    glossaryIntact: !(src.glossaryIntegrity && src.glossaryIntegrity.intact === false),
    restoredTerms: Array.isArray(glossaryMeta.restoredTerms) ? glossaryMeta.restoredTerms : [],
    gatewayMeta,
    unknownLanguageAlert,
    scannerHeartbeat,
    dormantScanner,
    authorityReview,
    inputHash,
    gatewayHash,
    stableHash,
    correlationId,
    traceId,
    noUserFacingDiagnostics: true,
    source: "MarionLingoSentinelGateway"
  };
}
function buildIndexLingoSentinelGatewayPatch(result, rawText, n) {
  const src = isObj(result) ? result : {};
  const response = isObj(src.lingoSentinelResponse) ? src.lingoSentinelResponse : {};
  const authorityReview = isObj(src.authorityReview) ? src.authorityReview : {};
  const route = cleanText(src.route || "MARION_ONLY");
  const sourceLanguage = cleanText(src.sourceLanguage || response.sourceLanguage || response.detectedLanguage || "unknown");
  const targetLanguage = cleanText(src.targetLanguage || response.targetLanguage || "en");
  const finalText = cleanText(src.finalText || authorityReview.finalText || response.finalText || response.adaptedText || response.translatedText || "");
  const confidence = Number.isFinite(Number(src.confidence)) ? Number(src.confidence) : (Number.isFinite(Number(response.confidence)) ? Number(response.confidence) : null);
  const routed = src.routed === true || route.indexOf("LINGOSENTINEL_") === 0;
  const gatewayMeta = {
    version: LINGOSENTINEL_GATEWAY_INDEX_VERSION,
    source: "MarionLingoSentinelGateway",
    requestId: cleanText(src.requestId || n.traceId || ""),
    ok: src.ok !== false,
    routed,
    route,
    marionFinalAuthority: src.marionFinalAuthority !== false,
    approvedByMarion: authorityReview.approved !== false && src.ok !== false,
    fallbackTriggered: src.ok === false || response.fallbackUsed === true,
    reason: cleanText(src.reason || authorityReview.reason || "")
  };
  return {
    surface: normalizeIndexLingoSentinelGatewaySurface({ ...src, gatewayMeta }),
    languageMeta: isObj(src.languageMeta) ? src.languageMeta : { detectedLanguage: sourceLanguage, sourceLanguage, targetLanguage, confidence, supported: true, requiresTranslation: routed, fallbackTriggered: src.ok === false || response.fallbackUsed === true, route },
    lingoInput: isObj(src.lingoInput) ? src.lingoInput : { originalText: cleanText(src.originalText || rawText), normalizedText: cleanText(src.originalText || rawText), route },
    translationMeta: isObj(src.translationMeta) ? src.translationMeta : { sourceLanguage, targetLanguage, translated: !!(routed && finalText && src.ok !== false), translatedText: finalText, advisoryText: finalText, finalText, confidence, route, fallbackTriggered: src.ok === false || response.fallbackUsed === true },
    glossaryMeta: isObj(src.glossaryMeta) ? src.glossaryMeta : (isObj(response.glossaryMeta) ? response.glossaryMeta : {}),
    glossaryIntegrity: isObj(src.glossaryIntegrity) ? src.glossaryIntegrity : {},
    unknownLanguageAlert: isObj(src.unknownLanguageAlert) ? src.unknownLanguageAlert : {},
    scannerHeartbeat: isObj(src.scannerHeartbeat) ? src.scannerHeartbeat : {},
    dormantScanner: isObj(src.dormantScanner) ? src.dormantScanner : {},
    gatewayMeta,
    telemetry: isObj(src.telemetry) ? src.telemetry : {},
    response,
    authorityReview
  };
}
async function applyIndexLingoSentinelGatewayToNorm(norm) {
  const n = isObj(norm) ? norm : {};
  if (!runIndexLingoSentinelGateway) {
    n.lingoSentinel = { version: LINGOSENTINEL_GATEWAY_INDEX_VERSION, available: false, active: false, authority: "marion", advisoryOnly: true, stage: "index-pre-marion", reason: "lingosentinel_gateway_unavailable", noUserFacingDiagnostics: true };
    return n;
  }
  try {
    const rawText = cleanText(n.originalRawText || n.originalText || n.text || "");
    const result = await Promise.resolve(runIndexLingoSentinelGateway({
      requestId: n.traceId || n.turnId,
      text: n.text || rawText,
      message: rawText || n.text,
      input: n.text,
      originalInput: rawText || n.text,
      sourceLanguage: cleanText((isObj(n.languageSphere) && n.languageSphere.sourceLanguage) || (isObj(n.languageMeta) && n.languageMeta.sourceLanguage) || "auto"),
      targetLanguage: cleanText((isObj(n.languageSphere) && n.languageSphere.targetLanguage) || (isObj(n.languageMeta) && n.languageMeta.targetLanguage) || "en"),
      domain: cleanText(n.knowledgeDomain || n.domain || "general"),
      payload: isObj(n.payload) ? n.payload : {},
      languageSphere: isObj(n.languageSphere) ? n.languageSphere : {},
      meta: { traceId: n.traceId, turnId: n.turnId, source: "index_transport_only" }
    }, { defaultTargetLanguage: "en", domain: cleanText(n.knowledgeDomain || n.domain || "general") }));
    const resultObj = safeObj(result);
    const patch = buildIndexLingoSentinelGatewayPatch(resultObj, rawText, n);
    n.lingoSentinel = { ...(isObj(n.lingoSentinel) ? n.lingoSentinel : {}), ...patch.surface };
    n.languageMeta = patch.languageMeta;
    n.lingoInput = patch.lingoInput;
    n.translationMeta = patch.translationMeta;
    n.glossaryMeta = patch.glossaryMeta;
    n.glossaryIntegrity = patch.glossaryIntegrity;
    n.unknownLanguageAlert = patch.unknownLanguageAlert;
    n.scannerHeartbeat = patch.scannerHeartbeat;
    n.dormantScanner = patch.dormantScanner;
    n.lingoSentinelGatewayMeta = patch.gatewayMeta;
    n.lingoSentinelTelemetry = patch.telemetry;
    n.lingoSentinelResponse = patch.response;
    n.lingoSentinelAuthorityReview = patch.authorityReview;
    n.inputHash = cleanText(resultObj.inputHash || patch.gatewayMeta.requestId || n.inputHash || "");
    n.gatewayHash = cleanText(resultObj.gatewayHash || patch.gatewayMeta.requestId || n.gatewayHash || "");
    n.stableHash = cleanText(resultObj.stableHash || patch.gatewayMeta.requestId || n.stableHash || "");
    n.correlationId = cleanText(resultObj.correlationId || patch.gatewayMeta.requestId || n.correlationId || "");
    n.traceId = cleanText(resultObj.traceId || patch.gatewayMeta.requestId || n.traceId || "");
    n.notificationReady = !!(patch.gatewayMeta.notificationReady || patch.unknownLanguageAlert.notificationReady || patch.dormantScanner.notificationReady);
  } catch (err) {
    n.lingoSentinel = { version: LINGOSENTINEL_GATEWAY_INDEX_VERSION, available: false, active: false, authority: "marion", advisoryOnly: true, stage: "index-pre-marion", fallbackTriggered: true, error: "gateway-failed-safe", detail: cleanText(err && (err.message || err) || ""), noUserFacingDiagnostics: true };
  }
  return n;
}

function normalizePayload(req) {
  const body = isObj(req.body) ? req.body : {};
  const payload = isObj(body.payload) ? body.payload : {};
  const guidedPrompt = isObj(body.guidedPrompt) ? body.guidedPrompt : (isObj(payload.guidedPrompt) ? payload.guidedPrompt : null);
  const rawText = cleanText(
    body.text || body.message || body.query || body.userText ||
    payload.text || payload.message || payload.query || payload.userText ||
    (guidedPrompt && (guidedPrompt.label || guidedPrompt.text)) || ""
  );
  const text = normalizePublicNyxAddress(rawText);
  const rawMarionIntent = isObj(body.marionIntent) ? body.marionIntent : (isObj(payload.marionIntent) ? payload.marionIntent : {});
  const technicalTargetLock = canonicalTechnicalTargetFromText(text);
  const technicalFollowUpLock = isTechnicalFollowUpIntent(text);
  const lockedMarionIntent = applyTechnicalSchedulerBypass(rawMarionIntent, text);
  const lane = technicalFollowUpLock ? "technical" : (cleanText(payload.lane || body.lane || "general").toLowerCase() || "general");
  const routedMarionIntent = routeMarionIntentThroughRuntime(normalizeIncomingMarionIntent(lockedMarionIntent, text), lane, text);
  const marionIntent = routedMarionIntent.marionIntent;
  const marionRouting = routedMarionIntent.routing;
  const languageSphereRequest = extractLanguageSphereRequestFromRequest(req, body, payload);
  return {
    text,
    originalText: text,
    originalRawText: rawText,
    publicUserText: text,
    guidedPrompt,
    domainHint: cleanText(body.domainHint || payload.domainHint || marionRouting.domain || (guidedPrompt && guidedPrompt.domainHint) || ""),
    intentHint: cleanText(body.intentHint || payload.intentHint || marionIntent.intent || (guidedPrompt && guidedPrompt.intentHint) || ""),
    emotionalHint: cleanText(body.emotionalHint || payload.emotionalHint || (guidedPrompt && guidedPrompt.emotionalHint) || ""),
    body,
    payload,
    marionIntent,
    marionRouting,
    marionRuntimeRoutingMeta: isObj(routedMarionIntent.meta) ? routedMarionIntent.meta : {},
    technicalTargetLock: isObj(technicalTargetLock) ? technicalTargetLock : {},
    technicalFollowUpLock: !!technicalFollowUpLock,
    blockScheduleInterception: !!technicalFollowUpLock,
    outerSchedulerBypass: !!technicalFollowUpLock,
    lane,
    year: cleanText(payload.year || body.year || ""),
    mode: cleanText(payload.mode || body.mode || ""),
    turnId: cleanText(payload.turnId || body.turnId || req.headers["x-sb-turn-id"] || "") || makeTraceId("turn"),
    traceId: cleanText(req.headers["x-sb-trace-id"] || payload.traceId || body.traceId || makeTraceId("req")),
    source: cleanText(body.source || payload.source || body.inputSource || payload.inputSource || req.headers["x-sb-input-source"] || "text").toLowerCase() || "text",
    inputSource: cleanText(body.inputSource || payload.inputSource || body.source || payload.source || req.headers["x-sb-input-source"] || "text").toLowerCase() || "text",
    sourceLanguage: languageSphereRequest.sourceLanguage,
    targetLanguage: languageSphereRequest.targetLanguage,
    outputLanguage: languageSphereRequest.targetLanguage,
    requestedLanguage: languageSphereRequest.targetLanguage,
    languageSphere: languageSphereRequest,
    translation: languageSphereRequest,
    resetConversation: shouldResetConversationFromRequest(req, body, payload),
    clearSession: shouldResetConversationFromRequest(req, body, payload),
    staleCarryBypass: false,
    languageSphereDirectTranslation: false,
    client: isObj(body.client) ? body.client : {}
  };
}

function normalizeEmotion(raw, inputText) {
  const out = {
    ok: false,
    label: "",
    intensity: 0,
    distress: false,
    stabilize: false,
    sensitive: false,
    positive: false,
    technical: false
  };

  const baseText = `${safeStr(inputText)} ${safeStr(raw && raw.label)} ${safeStr(raw && raw.name)} ${safeStr(raw && raw.primary)} ${safeStr(raw && raw.mode)} ${safeStr(raw && raw.intent)}`;
  const txt = lower(baseText);

  if (isObj(raw)) {
    out.ok = true;
    out.label = cleanText(raw.label || raw.name || raw.primary || "");
    const n = Number(raw.intensity ?? raw.score ?? raw.weight ?? 0);
    out.intensity = Number.isFinite(n) ? clamp(n, 0, 1) : 0;
    out.distress = !!(raw.distress || raw.support || raw.overwhelmed || raw.anxious || raw.negative);
    out.stabilize = !!(raw.stabilize || raw.regulate || raw.deescalate);
    out.sensitive = !!(raw.sensitive || raw.crisis || raw.selfHarm);
    out.positive = !!(raw.positive || raw.upbeat);
    out.technical = !!raw.technical;
  }

  const rawText = txt;
  out.distress = out.distress || /(overwhelmed|panic|panicking|not okay|anxious|anxiety|too much|breaking down|falling apart|burned out|burnt out|help me|i am scared|i'm scared|i am hurting|i'm hurting|i feel awful|i feel terrible|i am drowning|i'm drowning|depressed|depression|i am depressed|i'm depressed|hopeless|empty|numb|can't go on|cannot go on)/.test(rawText);
  out.stabilize = out.stabilize || out.distress || /(stabilize|steady|calm down|regulate|slow down)/.test(rawText);
  out.sensitive = out.sensitive || /(suic|kill myself|want to die|end it|self harm|self-harm)/.test(rawText);
  out.positive = /(happy|great|beautiful day|amazing|good mood|outstanding|did great|things are going right|relieved)/.test(rawText);
  out.technical = /(debug|backend|chat engine|state spine|support response|marion|loop|fallback|api|route|tts|voice|fix|index\.js|emotion|stabiliz)/.test(rawText);

  if (!out.label) {
    if (out.sensitive) out.label = "crisis";
    else if (out.distress) out.label = "distress";
    else if (out.technical) out.label = "technical";
    else if (out.positive) out.label = "positive";
    else out.label = "neutral";
  }

  if (!out.ok) out.ok = out.distress || out.sensitive || out.positive || out.technical || !!out.label;
  return out;
}

function inferEmotion(text, reqCtx) {
  const raw = cleanText(text);
  let engineResult = null;

  try {
    if (affectEngineMod && typeof affectEngineMod.detect === "function") {
      engineResult = affectEngineMod.detect(raw, reqCtx || {});
    } else if (affectEngineMod && typeof affectEngineMod.analyze === "function") {
      engineResult = affectEngineMod.analyze(raw, reqCtx || {});
    } else if (affectEngineMod && typeof affectEngineMod === "function") {
      engineResult = affectEngineMod(raw, reqCtx || {});
    }
  } catch (err) {
    console.log("[Sandblast][affectEngine:error]", err && (err.stack || err.message || err));
    engineResult = null;
  }

  return normalizeEmotion(engineResult, raw);
}

function normalizeSupportReply(text) {
  const cleaned = cleanReplyForUser(text);
  if (cleaned) return cleaned;
  return "Tell me the next concrete step you want to take, and I’ll keep it direct.";
}

function buildSafeSupportReply(inputText, emotion, extras) {
  const emo = isObj(emotion) ? emotion : normalizeEmotion(null, inputText);
  const opts = isObj(extras) ? extras : {};
  const base = cleanText(inputText);

  if (emo.sensitive) {
    return "I am here with you. If you are in immediate danger or might hurt yourself, call your local emergency number right now. In Canada or the United States you can also call or text 988. Tell me: did something happen today, or has this been building for a while?";
  }

  let externalReply = "";
  try {
    if (supportResponseMod && typeof supportResponseMod.buildSupportReply === "function") {
      externalReply = safeStr(supportResponseMod.buildSupportReply({
        text: base,
        emo,
        emotion: emo,
        mode: "stabilize",
        ...opts
      }));
    } else if (supportResponseMod && typeof supportResponseMod.getSupportReply === "function") {
      externalReply = safeStr(supportResponseMod.getSupportReply({
        text: base,
        emo,
        emotion: emo,
        mode: "stabilize",
        ...opts
      }));
    } else if (typeof supportResponseMod === "function") {
      externalReply = safeStr(supportResponseMod({
        text: base,
        emo,
        emotion: emo,
        mode: "stabilize",
        ...opts
      }));
    }
  } catch (err) {
    console.log("[Sandblast][supportResponse:error]", err && (err.stack || err.message || err));
  }

  if (externalReply) return normalizeSupportReply(externalReply);

  if (emo.distress) {
    return "I hear the weight in this. Tell me what happened, and I’ll keep the next step grounded and practical.";
  }

  return "I hear you. Send the next detail and I’ll help steady the response without recycling a support line.";
}

function buildQuietUiPatch(reason, holdActive) {
  const quiet = {
    mode: "quiet",
    chips: [],
    allowMic: true,
    replace: true,
    clearStale: true,
    revision: now()
  };

  return {
    ui: quiet,
    directives: [],
    followUps: [],
    followUpsStrings: [],
    sessionPatch: {
      supportLock: holdActive ? { active: true } : {}
    },
    metaPatch: {
      clearStaleUi: true,
      suppressMenus: true,
      failSafe: reason === "failsafe",
      supportHold: !!holdActive
    }
  };
}

function isTechnicalDebugTurn(text, norm) {
  const source = `${cleanText(text || "")} ${cleanText(norm && norm.intentHint || "")} ${cleanText(norm && norm.domainHint || "")} ${cleanText(norm && norm.lane || "")}`.toLowerCase();
  return /(autopsy|line.by.line|gap refinement|index\.js|marionbridge|packet normalizer|intent router|route|endpoint|diagnostic|debug|stack|syntax|looping|transport|fallback|finalization|hardening|download|zip|script|file)/i.test(source);
}

function isHighRiskSupportSignal(emotion, text) {
  const emo = isObj(emotion) ? emotion : normalizeEmotion(null, text);
  const body = lower(text || "");
  return !!(emo.sensitive || /\b(suicid(?:e|al)|self[-\s]?harm|kill myself|don['’]?t want to live|do not want to live|hurt myself)\b/i.test(body));
}

function shouldEnterSupportHold(text, emotion, engineResult, opts) {
  const o = isObj(opts) ? opts : {};
  const emo = isObj(emotion) ? emotion : normalizeEmotion(null, text);
  const intent = lower(engineResult && engineResult.intent);
  const mode = lower(engineResult && engineResult.mode);
  const technicalTurn = !!o.technicalTurn || isTechnicalDebugTurn(text, o.norm || null);
  const hasAuthorityReply = !!o.hasAuthorityReply;
  const supportState = isObj(o.supportState) ? o.supportState : {};
  const repeatedSupport = Number(supportState.supportPasses || 0) >= CFG.supportHoldMaxTurns;
  if (hasAuthorityReply) return false;
  if (technicalTurn && !isHighRiskSupportSignal(emo, text)) return false;
  if (repeatedSupport && !isHighRiskSupportSignal(emo, text)) return false;
  return !!(emo.sensitive || emo.distress || emo.stabilize || intent === "stabilize" || mode === "support" || mode === "quiet");
}

function normalizeReplyEnvelope(shaped, reply, metaPatch) {
  const out = isObj(shaped) ? { ...shaped } : { ok: true };
  const finalReply = finalizeRenderableReply(reply || out.reply || out.payload?.reply || "", out, "normalizeReplyEnvelope", "final_render_guard");
  const canEmit = !!finalReply;
  const failureSignature = inferIndexFailureSignature({norm:out, selected:out, marion:out, reply:finalReply, canEmit, error: canEmit ? "" : "final_render_guard_empty"});
  const runtimeTelemetry = buildIndexRuntimeTelemetry({norm:out, selected:out, marion:out, reply:finalReply, authority: canEmit ? "normalizeReplyEnvelope" : "none", stage: canEmit ? "final" : "awaiting_marion", canEmit, error: canEmit ? "" : "final_render_guard_empty"});
  out.ok = canEmit && out.ok !== false;
  out.final = canEmit;
  out.finalized = canEmit;
  out.handled = true;
  out.marionFinal = canEmit && out.marionFinal === true;
  out.awaitingMarion = !canEmit;
  out.suppressUserFacingReply = !canEmit;
  out.emit = canEmit;
  out.blocked = !canEmit;
  out.reply = finalReply;
  out.text = finalReply;
  out.short = finalReply;
  out.answer = finalReply;
  out.output = finalReply;
  out.response = finalReply;
  out.payload = {
    ...(isObj(out.payload) ? out.payload : {}),
    reply: finalReply,
    text: finalReply,
    message: finalReply,
    spokenText: cleanText(out.payload?.spokenText || finalReply) || finalReply,
    finalized: canEmit,
    final: canEmit,
    marionFinal: canEmit && out.marionFinal === true,
    awaitingMarion: !canEmit,
    suppressUserFacingReply: !canEmit,
    emit: canEmit,
    blocked: !canEmit,
    failureSignature,
    runtimeTelemetry
  };
  out.finalEnvelope = {
    ...(isObj(out.finalEnvelope) ? out.finalEnvelope : {}),
    reply: finalReply,
    text: finalReply,
    displayReply: finalReply,
    spokenText: cleanText(out.finalEnvelope?.spokenText || finalReply) || finalReply,
    final: canEmit,
    marionFinal: canEmit && out.marionFinal === true,
    handled: true,
    authority: canEmit ? cleanText(out.finalEnvelope?.authority || out.meta?.replyAuthority || "marionFinalEnvelope") : "none",
    failureSignature,
    runtimeTelemetry
  };
  out.meta = mergeMeta(out.meta, { ...(isObj(metaPatch) ? metaPatch : {}), finalized: canEmit, finalizationGuard: true, falseFinalPurged: !canEmit, indexSemanticAuthority: false, semanticAuthority: canEmit ? "chatEngine_or_marion" : "marion_required", indexRole: "transport_orchestrator", suppressUserFacingReply: !canEmit, emit: canEmit, blocked: !canEmit, failureSignature, runtimeTelemetry });
  out.failureSignature = failureSignature;
  out.runtimeTelemetry = runtimeTelemetry;
  return out;
}

function buildLoopBreakReply(norm, loop, supportState) {
  if (isTechnicalDebugTurn(norm && norm.text, norm)) return "Duplicate generic output was blocked. Validate the final route, duplicate detector, fallback branch, and finalization guard before rendering again.";
  return "";
}

function buildSupportSessionPatch(existing, active, release) {
  const prev = isObj(existing) ? existing : {};
  const lock = isObj(prev.supportLock) ? { ...prev.supportLock } : {};
  if (active) { lock.active = true; lock.release = false; }
  if (release) { lock.active = false; lock.release = true; }
  return {
    ...prev,
    supportLock: lock,
    continuity: isObj(prev.continuity) ? prev.continuity : {},
    continuityState: isObj(prev.continuityState) ? prev.continuityState : {},
    turnMemory: isObj(prev.turnMemory) ? prev.turnMemory : {},
    emotionalEngine: isObj(prev.emotionalEngine) ? prev.emotionalEngine : {},
    stateSpine: isObj(prev.stateSpine) ? prev.stateSpine : {}
  };
}

function shouldSuppressMenus(engineOut, supportActive) {
  const ui = isObj(engineOut?.ui) ? engineOut.ui : {};
  const meta = isObj(engineOut?.meta) ? engineOut.meta : {};
  if (supportActive) return true;
  return !!(
    ui.replace ||
    ui.clearStale ||
    ui.menuSuppressed ||
    ui.degradedSupport ||
    ui.failSafe ||
    meta.clearStaleUi ||
    meta.suppressMenus ||
    meta.failSafe
  );
}

function enforceQuietUiIfNeeded(base, opts) {
  const out = isObj(base) ? { ...base } : {};
  const o = isObj(opts) ? opts : {};
  const supportActive = !!o.supportActive;
  const failSafe = !!o.failSafe;
  const forceQuiet = !!o.forceQuiet;

  if (!(supportActive || failSafe || forceQuiet)) return out;

  const patch = buildQuietUiPatch(failSafe ? "failsafe" : "support", supportActive);
  out.ui = patch.ui;
  out.directives = patch.directives;
  out.followUps = patch.followUps;
  out.followUpsStrings = patch.followUpsStrings;
  out.sessionPatch = {
    ...(isObj(out.sessionPatch) ? out.sessionPatch : {}),
    ...(isObj(patch.sessionPatch) ? patch.sessionPatch : {})
  };
  out.meta = {
    ...(isObj(out.meta) ? out.meta : {}),
    ...(isObj(patch.metaPatch) ? patch.metaPatch : {})
  };
  return out;
}

function mergeMeta(base, patch) {
  return {
    ...(isObj(base) ? base : {}),
    ...(isObj(patch) ? patch : {})
  };
}

function buildTransportKey(ctx, text, req) {
  const msg = safeStr(text).trim().toLowerCase();
  return [
    getSessionId(req),
    safeStr(ctx?.lane || ""),
    safeStr(ctx?.mode || ""),
    safeStr(ctx?.year || ""),
    msg
  ].join("|");
}

function detectLoop(sessionId, reply, userText, opts) {
  const o = isObj(opts) ? opts : {};
  const prev = getLastTurn(sessionId);
  const transport = getTransportState(sessionId);
  const curHash = replyHash(reply);
  const userHash = replyHash(userText);
  const within = prev && (now() - Number(prev.at || 0) < CFG.duplicateReplyWindowMs);
  const sameReply = !!(within && prev.replyHash && prev.replyHash === curHash);
  const sameUser = !!(within && prev.userHash && prev.userHash === userHash);
  const sameTurn = !!(o.turnId && ((prev && prev.turnId === o.turnId) || (transport && transport.turnId === o.turnId)));
  const sameRoute = !o.route || !prev || !prev.route || prev.route === o.route;
  const sameAuthority = !o.authority || !prev || !prev.replyAuthority || prev.replyAuthority === o.authority;
  return { sameReply, sameUser, sameTurn, sameRoute, sameAuthority, repeated: (sameReply && sameUser && sameRoute && sameAuthority) || sameTurn, curHash, userHash, previousTurnId: cleanText(prev && prev.turnId || "") };
}

function applyAffectBridge(base, affectInput) {
  const shaped = isObj(base) ? { ...base } : {};
  if (!affectEngineMod || typeof affectEngineMod.runAffectEngine !== "function") return shaped;
  const input = isObj(affectInput) ? affectInput : {};
  try {
    const lockedEmotion = isObj(input.lockedEmotion) ? input.lockedEmotion : null;
    const strategy = isObj(input.strategy) ? input.strategy : null;
    if (!lockedEmotion || !lockedEmotion.locked || !strategy) return shaped;
    const affectOut = affectEngineMod.runAffectEngine({
      assistantDraft: cleanText(shaped.reply || shaped.payload?.reply || ""),
      lockedEmotion,
      strategy,
      lane: cleanText(shaped.lane || "Default") || "Default",
      memory: isObj(input.memory) ? input.memory : {}
    });
    if (!isObj(affectOut) || affectOut.ok === false) return shaped;
    const spokenText = cleanText(affectOut.spokenText || "");
    if (!spokenText) return shaped;
    shaped.reply = spokenText;
    shaped.payload = { ...(isObj(shaped.payload) ? shaped.payload : {}), reply: spokenText, spokenText };
    shaped.ttsProfile = isObj(affectOut.ttsProfile) ? affectOut.ttsProfile : shaped.ttsProfile;
    shaped.audio = isObj(shaped.audio) ? shaped.audio : {};
    shaped.audio.textToSynth = spokenText;
    shaped.audio.enabled = true;
    shaped.meta = mergeMeta(shaped.meta, { affectApplied: true, linkedDatasets: Array.isArray(affectOut.expressionBridge?.linkedDatasets) ? affectOut.expressionBridge.linkedDatasets.slice(0, 12) : [] });
  } catch (err) {
    console.log("[Sandblast][affectBridge:error]", err && (err.stack || err.message || err));
  }
  return shaped;
}

function buildAffectInputFromMarion(marion) {
  const src = isObj(marion) ? marion : {};
  const layer2 = isObj(src.layer2) ? src.layer2 : {};
  const emotion = isObj(layer2.emotion) ? layer2.emotion : {};
  const meta = isObj(src.meta) ? src.meta : {};
  const lockedEmotion = isObj(meta.lockedEmotion) ? meta.lockedEmotion : (emotion.primaryEmotion ? {
    locked: true,
    primaryEmotion: cleanText(emotion.primaryEmotion || "neutral") || "neutral",
    secondaryEmotion: cleanText(emotion.secondaryEmotion || ""),
    intensity: Number.isFinite(Number(emotion.intensity)) ? Number(emotion.intensity) : 0,
    valence: Number.isFinite(Number(emotion.valence)) ? Number(emotion.valence) : 0,
    valenceLabel: cleanText(emotion.valenceLabel || ""),
    confidence: Number.isFinite(Number(emotion.confidence)) ? Number(emotion.confidence) : 0,
    needs: Array.isArray(emotion.needs) ? emotion.needs : [],
    cues: Array.isArray(emotion.cues) ? emotion.cues : [],
    supportFlags: isObj(emotion.supportFlags) ? emotion.supportFlags : {},
    evidenceMatches: Array.isArray(emotion.evidenceMatches) ? emotion.evidenceMatches : [],
    meta: { linkedDatasets: Array.isArray(meta.linkedDatasets) ? meta.linkedDatasets : [] }
  } : null);
  const strategy = isObj(meta.strategy) ? meta.strategy : null;
  return { lockedEmotion, strategy, guidedPrompt: src.guidedPrompt || meta.guidedPrompt || null };
}

function shapeEngineReply(raw) {
  if (!isObj(raw)) return {};
  const payload = isObj(raw.payload) ? raw.payload : {};
  const speech = isObj(raw.speech) ? raw.speech : (isObj(payload.speech) ? payload.speech : null);
  return {
    ok: raw.ok !== false,
    reply: cleanText(raw.spokenText || payload.spokenText || raw.reply || payload.reply || raw.message || raw.text || ""),
    payload: isObj(payload) ? payload : {},
    lane: cleanText(raw.lane || raw.laneId || raw.sessionLane || payload.lane || ""),
    laneId: cleanText(raw.laneId || raw.lane || ""),
    sessionLane: cleanText(raw.sessionLane || raw.lane || ""),
    bridge: isObj(raw.bridge) ? raw.bridge : null,
    ctx: isObj(raw.ctx) ? raw.ctx : {},
    ui: isObj(raw.ui) ? raw.ui : {},
    emotionalTurn: isObj(raw.emotionalTurn) ? raw.emotionalTurn : null,
    directives: Array.isArray(raw.directives) ? raw.directives : [],
    followUps: Array.isArray(raw.followUps) ? raw.followUps : [],
    followUpsStrings: Array.isArray(raw.followUpsStrings) ? raw.followUpsStrings : [],
    sessionPatch: isObj(raw.sessionPatch) ? raw.sessionPatch : {},
    cog: isObj(raw.cog) ? raw.cog : {},
    meta: isObj(raw.meta) ? raw.meta : {},
    speech,
    audio: isObj(raw.audio) ? raw.audio : null,
    ttsProfile: isObj(raw.ttsProfile) ? raw.ttsProfile : null,
    voiceRoute: isObj(raw.voiceRoute) ? raw.voiceRoute : null,
    requestId: cleanText(raw.requestId || payload.requestId || ""),
    traceId: cleanText(raw.traceId || payload.traceId || "")
  };
}

function repairBridgeEnvelope(bridge, marion, lane) {
  const candidate = isObj(bridge) ? { ...bridge } : (isObj(marion) ? { ...marion } : {});
  if (!isObj(candidate)) return null;
  const out = {
    ...candidate,
    v: cleanText(candidate.v || candidate.version || "bridge.v3") || "bridge.v3",
    authority: cleanText(candidate.authority || candidate.mode || "bridge_primary") || "bridge_primary",
    domain: cleanText(candidate.domain || lane || "general") || "general",
    intent: cleanText(candidate.intent || candidate.routeIntent || candidate.mode || "general") || "general",
    confidence: Number.isFinite(Number(candidate.confidence)) ? clamp(Number(candidate.confidence), 0, 1) : 0.82,
    source: cleanText(candidate.source || "marion") || "marion"
  };
  return out;
}

function repairEngineContract(shaped, marion, norm) {
  const base = isObj(shaped) ? { ...shaped } : {};
  const lane = cleanText(base.lane || base.laneId || base.sessionLane || norm?.lane || "general") || "general";
  const laneId = cleanText(base.laneId || lane) || lane;
  const sessionLane = cleanText(base.sessionLane || lane) || lane;
  const payload = isObj(base.payload) ? { ...base.payload } : {};
  const reply = cleanReplyForUser(base.reply || payload.reply || payload.text || payload.message || "");
  const bridge = repairBridgeEnvelope(base.bridge, marion, lane);
  const speech = isObj(base.speech) ? { ...base.speech } : (isObj(payload.speech) ? { ...payload.speech } : null);
  const followUps = Array.isArray(base.followUps) ? base.followUps : [];
  const followUpsStrings = Array.isArray(base.followUpsStrings) && base.followUpsStrings.length
    ? base.followUpsStrings
    : followUps.map((item) => cleanText((item && (item.label || item.title || item.text)) || item || "")).filter(Boolean).slice(0, 4);

  payload.reply = reply;
  payload.text = cleanText(payload.text || reply) || reply;
  payload.message = cleanText(payload.message || reply) || reply;
  if (speech) payload.speech = { ...speech };

  return {
    ok: base.ok !== false,
    reply,
    payload,
    lane,
    laneId,
    sessionLane,
    bridge,
    ctx: isObj(base.ctx) ? base.ctx : {},
    ui: isObj(base.ui) ? base.ui : {},
    emotionalTurn: isObj(base.emotionalTurn) ? base.emotionalTurn : null,
    directives: Array.isArray(base.directives) ? base.directives : [],
    followUps,
    followUpsStrings,
    sessionPatch: isObj(base.sessionPatch) ? base.sessionPatch : {},
    cog: isObj(base.cog) ? base.cog : {},
    meta: isObj(base.meta) ? base.meta : {},
    speech,
    audio: isObj(base.audio) ? base.audio : null,
    ttsProfile: isObj(base.ttsProfile) ? base.ttsProfile : null,
    voiceRoute: isObj(base.voiceRoute) ? base.voiceRoute : null,
    requestId: cleanText(base.requestId || ""),
    traceId: cleanText(base.traceId || norm?.traceId || "")
  };
}

function normalizeMarionEmotionState(value, fallback) {
  const raw = lower(value || fallback || "");
  if (["calm", "intense", "playful", "serious", "supportive"].includes(raw)) return raw;
  if (/(crisis|distress|support|care|gentle|soft|warm)/.test(raw)) return "supportive";
  if (/(technical|focus|grounded|serious)/.test(raw)) return "serious";
  if (/(joy|upbeat|light|fun|playful)/.test(raw)) return "playful";
  if (/(urgent|intense|sharp|escalat)/.test(raw)) return "intense";
  return "calm";
}

function buildMarionContinuity(prev, norm, emotion) {
  const previous = isObj(prev) ? prev : {};
  const refs = uniq([
    cleanText(previous.lane || ""),
    cleanText(previous.emotionLabel || ""),
    cleanText(previous.userText || "").split(/\s+/).slice(0, 8).join(" "),
    cleanText(norm && norm.intentHint || ""),
    cleanText(norm && norm.domainHint || "")
  ].filter(Boolean)).slice(0, 4);
  return {
    references: refs,
    memory_thread: cleanText(previous.userText || previous.reply || "").slice(0, 180),
    last_user_text: cleanText(previous.userText || "").slice(0, 220),
    last_reply: cleanText(previous.reply || "").slice(0, 220),
    emotional_carry: normalizeMarionEmotionState(previous.emotionLabel || (emotion && emotion.label) || "calm")
  };
}

function normalizeMarionContract(raw, norm, emotion, prevTurn) {
  const src = isObj(raw) ? raw : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const packet = isObj(src.packet) ? src.packet : {};
  const synthesis = isObj(packet.synthesis) ? packet.synthesis : {};
  const bridge = isObj(src.bridge) ? src.bridge : {};
  const packetMeta = isObj(packet.meta) ? packet.meta : {};
  const contractIntent = isObj(src.marionIntent) ? src.marionIntent : (isObj(packet.marionIntent) ? packet.marionIntent : (isObj(payload.marionIntent) ? payload.marionIntent : (norm && norm.marionIntent || {})));
  const normalizedMarionIntent = normalizeIncomingMarionIntent(contractIntent, norm && norm.text || "");
  const continuitySrc =
    isObj(src.continuity) ? src.continuity :
    (isObj(payload.continuity) ? payload.continuity :
    (isObj(packet.continuityState) ? packet.continuityState :
    (isObj(synthesis.continuity) ? synthesis.continuity : {})));
  const metaSrc = {
    ...(isObj(src.meta) ? src.meta : {}),
    ...(isObj(payload.meta) ? payload.meta : {}),
    ...(isObj(synthesis.meta) ? synthesis.meta : {}),
    ...(isObj(packetMeta) ? packetMeta : {})
  };
  let response = cleanReplyForUser(
    src.response || src.reply || src.text || src.output || src.answer || src.spokenText ||
    payload.reply || payload.text || payload.message || payload.spokenText ||
    synthesis.reply || synthesis.answer || synthesis.text || synthesis.output || synthesis.spokenText ||
    (isObj(src.contract) ? (src.contract.reply || src.contract.response || src.contract.text || src.contract.output || "") : "") ||
    bridge.reply || bridge.text || bridge.output || bridge.answer || ""
  );
  if (isInternalMarionBlockerReply(response)) response = "";
  const followUp = cleanText(
    src.follow_up || src.followUp ||
    metaSrc.follow_up || metaSrc.followUp ||
    payload.follow_up || payload.followUp ||
    synthesis.follow_up || synthesis.followUp || ""
  );
  const normalizedEmotion = normalizeMarionEmotionState(
    src.emotional_state || src.emotionalState ||
    (isObj(src.contract) ? (src.contract.emotional_state || src.contract.emotionalState || "") : "") ||
    metaSrc.emotional_state || metaSrc.emotion || "",
    emotion && emotion.label || "calm"
  );
  const continuity = {
    ...buildMarionContinuity(prevTurn, norm, emotion),
    ...(isObj(continuitySrc) ? continuitySrc : {})
  };
  return {
    status: cleanText(
      src.status ||
      (isObj(src.contract) ? src.contract.status : "") ||
      metaSrc.status ||
      (src.ok === false ? "error" : "success")
    ) || "success",
    intent: cleanText(
      src.intent || src.routeIntent ||
      (isObj(src.contract) ? src.contract.intent : "") ||
      synthesis.intent || packet.intent ||
      metaSrc.intent ||
      norm && norm.intentHint || "general"
    ) || "general",
    emotional_state: normalizedEmotion,
    marionIntent: normalizedMarionIntent,
    routing: buildMarionIntentRouting(normalizedMarionIntent, norm && norm.lane || "general"),
    response,
    follow_up: followUp,
    continuity,
    meta: {
      confidence: Number.isFinite(Number(
        metaSrc.confidence ??
        src.confidence ??
        (isObj(src.contract) ? src.contract.confidence : undefined)
      )) ? clamp(Number(
        metaSrc.confidence ??
        src.confidence ??
        (isObj(src.contract) ? src.contract.confidence : undefined)
      ), 0, 1) : 0.82,
      fallback: !!(metaSrc.fallback || src.fallback || src.ok === false || !response),
      source: cleanText(metaSrc.source || synthesis.source || packetMeta.source || src.source || "marion") || "marion",
      traceId: cleanText(metaSrc.traceId || src.traceId || packetMeta.traceId || norm && norm.traceId || "")
    }
  };
}

function validateMarionContract(contract) {
  const c = isObj(contract) ? contract : {};
  const errors = [];
  const response = cleanText(c.response || "");
  const status = cleanText(c.status || "success") || "success";
  if (!response) errors.push("missing_response");
  if (isInternalMarionBlockerReply(response)) errors.push("internal_blocker_response");
  if (status && status !== "success") errors.push("status_not_success");
  if (!cleanText(c.intent || "")) c.intent = "general";
  if (!cleanText(c.emotional_state || "")) c.emotional_state = "calm";
  if (!isObj(c.continuity)) c.continuity = {};
  if (!isObj(c.meta)) c.meta = {};
  return { ok: errors.length === 0 || (errors.length === 1 && errors[0] === "status_not_success" && !!response), errors };
}

function shouldForceMarionReply(contract, norm) {
  const c = isObj(contract) ? contract : null;
  if (!c) return false;
  const checked = validateMarionContract(c);
  if (!checked.ok) return false;
  const text = lower(norm && norm.text || "");
  if (!text) return true;
  if (/(one\s+direct\s+answer|answer\s+this\s+in\s+one\s+sentence|answer\s+directly|direct\s+answer|just\s+answer|give\s+me\s+the\s+answer|what\s+is|what\s+are|how\s+do|how\s+does|why\s+is|define|explain\s+briefly)/.test(text)) return true;
  if (cleanText(c.intent || "") && /^(direct_answer|answer|definition|explain|brief_answer)$/i.test(cleanText(c.intent || ""))) return true;
  return true;
}

function enforceMarionContract(shaped, contract, norm) {
  const out = isObj(shaped) ? { ...shaped } : {};
  const c = isObj(contract) ? contract : null;
  const checked = validateMarionContract(c);
  const candidate = cleanReplyForUser(c && c.response || "");
  out.meta = mergeMeta(out.meta, {
    marionContractVersion: "marion-nyx-v1",
    marionContractOk: checked.ok,
    marionContractErrors: checked.errors,
    marionReplyPresent: !!candidate
  });
  if (!candidate) return out;
  out.reply = candidate;
  out.payload = {
    ...(isObj(out.payload) ? out.payload : {}),
    reply: candidate,
    text: candidate,
    message: candidate,
    spokenText: candidate,
    marionContract: c || {},
    continuity: isObj(c && c.continuity) ? c.continuity : {}
  };
  out.bridge = {
    ...(isObj(out.bridge) ? out.bridge : {}),
    source: cleanText((c && c.meta && c.meta.source) || (out.bridge && out.bridge.source) || "marion") || "marion",
    authority: "marion_locked"
  };
  out.cog = {
    ...(isObj(out.cog) ? out.cog : {}),
    intent: cleanText((c && c.intent) || out.cog && out.cog.intent || norm && norm.intentHint || "MARION") || "MARION",
    mode: "authoritative",
    publicMode: true
  };
  out.meta = mergeMeta(out.meta, {
    marionApplied: true,
    replyAuthority: "marion_locked"
  });
  return out;
}

function applyContinuityStitch(shaped, prevTurn, contract, norm, emotion) {
  const out = isObj(shaped) ? { ...shaped } : {};
  const prev = isObj(prevTurn) ? prevTurn : {};
  const continuity = isObj(contract && contract.continuity) ? { ...contract.continuity } : buildMarionContinuity(prev, norm, emotion);
  out.payload = {
    ...(isObj(out.payload) ? out.payload : {}),
    continuity
  };
  out.bridge = {
    ...(isObj(out.bridge) ? out.bridge : {}),
    continuity
  };
  out.sessionPatch = {
    ...(isObj(out.sessionPatch) ? out.sessionPatch : {}),
    continuity,
    continuityStitchApplied: true
  };
  const follow = cleanText(contract && contract.follow_up || "");
  const existing = Array.isArray(out.followUpsStrings) ? out.followUpsStrings.filter(Boolean) : [];
  const stitched = [];
  if (follow) stitched.push(follow);
  const prevUser = cleanText(prev.userText || "");
  if (prevUser && !stitched.length) stitched.push(`Do you want to keep building from what you said about ${clipText(prevUser, 72)}?`);
  out.followUpsStrings = uniq([...existing, ...stitched].map((v) => cleanText(v)).filter(Boolean)).slice(0, 4);
  out.meta = mergeMeta(out.meta, {
    continuityStitchApplied: true,
    continuityReferences: Array.isArray(continuity.references) ? continuity.references.slice(0, 4) : [],
    continuityMemoryThread: cleanText(continuity.memory_thread || "").slice(0, 180)
  });
  return out;
}

function buildLoggingSpine(trace) {
  const src = isObj(trace) ? trace : {};
  return {
    traceId: cleanText(src.traceId || ""),
    sessionId: cleanText(src.sessionId || ""),
    startedAt: Number(src.startedAt || now()),
    request: isObj(src.request) ? src.request : {},
    marion_raw: src.marion_raw || null,
    marion_contract: src.marion_contract || null,
    normalized: src.normalized || null,
    stitched: src.stitched || null,
    rendered: src.rendered || null,
    errors: Array.isArray(src.errors) ? src.errors : []
  };
}

function getMarionAuthorityReply(marion) {
  if (!isObj(marion)) return "";
  const finalEnvelope = isObj(marion.finalEnvelope) ? marion.finalEnvelope : {};
  const payload = isObj(marion.payload) ? marion.payload : {};
  const packet = isObj(marion.packet) ? marion.packet : {};
  const synthesis = isObj(packet.synthesis) ? packet.synthesis : {};
  const contract = isObj(marion.contract) ? marion.contract : {};
  const result = isObj(marion.result) ? marion.result : {};
  const resultFinalEnvelope = isObj(result.finalEnvelope) ? result.finalEnvelope : {};
  const resultPayload = isObj(result.payload) ? result.payload : {};
  const resultPacket = isObj(result.packet) ? result.packet : {};
  const resultSynthesis = isObj(resultPacket.synthesis) ? resultPacket.synthesis : {};
  const reply = cleanReplyForUser(
    finalEnvelope.reply ||
    finalEnvelope.text ||
    finalEnvelope.displayReply ||
    finalEnvelope.spokenText ||
    marion.response ||
    marion.reply ||
    marion.text ||
    marion.output ||
    marion.answer ||
    marion.message ||
    marion.spokenText ||
    /* fallbackResponse/replySeed intentionally ignored: transport-only Marion authority */
    payload.response ||
    payload.reply ||
    payload.text ||
    payload.message ||
    payload.output ||
    payload.answer ||
    payload.spokenText ||
    /* payload fallbackResponse/replySeed intentionally ignored */
    synthesis.reply ||
    synthesis.text ||
    synthesis.output ||
    synthesis.answer ||
    synthesis.spokenText ||
    contract.response ||
    contract.reply ||
    contract.text ||
    contract.output ||
    contract.answer ||
    resultFinalEnvelope.reply ||
    resultFinalEnvelope.text ||
    resultFinalEnvelope.displayReply ||
    resultFinalEnvelope.spokenText ||
    result.response ||
    result.reply ||
    result.text ||
    result.output ||
    result.answer ||
    result.message ||
    result.spokenText ||
    resultPayload.response ||
    resultPayload.reply ||
    resultPayload.text ||
    resultPayload.message ||
    resultPayload.output ||
    resultPayload.answer ||
    resultPayload.spokenText ||
    resultSynthesis.reply ||
    resultSynthesis.text ||
    resultSynthesis.output ||
    resultSynthesis.answer ||
    ""
  );
  return isConversationDiagnosticFallbackReply(reply) ? "" : reply;
}



function extractRuntimeTelemetryPacket(value) {
  const src = isObj(value) ? value : {};
  const payload = isObj(src.payload) ? src.payload : {};
  const meta = isObj(src.meta) ? src.meta : {};
  const diagnostics = isObj(src.diagnostics) ? src.diagnostics : {};
  const finalEnvelope = isObj(src.finalEnvelope) ? src.finalEnvelope : {};
  const packet = isObj(src.packet) ? src.packet : {};
  const packetMeta = isObj(packet.meta) ? packet.meta : {};
  const candidates = [src.runtimeTelemetry, payload.runtimeTelemetry, meta.runtimeTelemetry, diagnostics.runtimeTelemetry, finalEnvelope.runtimeTelemetry, packetMeta.runtimeTelemetry];
  for (const candidate of candidates) if (isObj(candidate) && Object.keys(candidate).length) return candidate;
  return {};
}
function buildIndexRuntimeTelemetry({norm={},selected={},marion={},reply="",authority="",startedAt=0,stage="final",canEmit=true,error=""}={}) {
  const inherited = extractRuntimeTelemetryPacket(selected) || extractRuntimeTelemetryPacket(marion);
  const n = isObj(norm) ? norm : {};
  const selectedObj = isObj(selected) ? selected : {};
  const marionObj = isObj(marion) ? marion : {};
  const selectedRouting = isObj(selectedObj.routing) ? selectedObj.routing : (isObj(selectedObj.marionRouting) ? selectedObj.marionRouting : {});
  const marionRouting = isObj(marionObj.routing) ? marionObj.routing : (isObj(marionObj.marionRouting) ? marionObj.marionRouting : {});
  const packet = isObj(selectedObj.packet) ? selectedObj.packet : {};
  const packetRouting = isObj(packet.routing) ? packet.routing : {};
  const finalEnvelopeTrusted = !!(hasFreshMarionFinalEnvelope(selectedObj) || hasFreshMarionFinalEnvelope(marionObj));
  const failureSignature = inferIndexFailureSignature({norm:n, selected:selectedObj, marion:marionObj, reply, canEmit:!!canEmit, error: cleanText(error || inherited.error || "")});
  const finalRenderTelemetry = finalRenderTelemetryMod && typeof finalRenderTelemetryMod.buildFinalRenderTelemetry === "function" ? safeObj(finalRenderTelemetryMod.buildFinalRenderTelemetry({source:"index.chatRoute.finalTransport",stage:cleanText(stage || (canEmit ? "final" : "awaiting_marion")),reply,canEmit:!!canEmit,finalEnvelopeTrusted,runtimeTelemetry:inherited,domainConfidence:inherited.domainConfidence || selectedRouting.domainConfidence || marionRouting.domainConfidence,error:cleanText(error || inherited.error || "")})) : {};
  return {
    ...inherited,
    version: FINAL_RUNTIME_TELEMETRY_VERSION,
    source: "index.chatRoute.finalTransport",
    stage: cleanText(stage || (canEmit ? "final" : "awaiting_marion")),
    finalAuthority: canEmit ? cleanText(authority || "marion_bridge") : "none",
    replyAuthority: canEmit ? cleanText(authority || "marion_bridge") : "none",
    canEmit: !!canEmit,
    userVisible: false,
    debugLeakBlocked: failureSignature === INDEX_FAILURE_SIGNATURES.DEBUG_LEAK_BLOCKED,
    failureSignature,
    error: cleanText(error || inherited.error || ""),
    intent: cleanText(inherited.intent || selectedRouting.intent || marionRouting.intent || packetRouting.intent || selectedObj.intent || marionObj.intent || n.intent || ""),
    domain: cleanText(inherited.domain || selectedRouting.domain || marionRouting.domain || packetRouting.domain || selectedObj.domain || marionObj.domain || n.domainHint || ""),
    primaryDomain: cleanText(inherited.primaryDomain || selectedRouting.primaryDomain || marionRouting.primaryDomain || packetRouting.primary || selectedObj.primaryDomain || marionObj.primaryDomain || ""),
    secondaryDomains: Array.isArray(inherited.secondaryDomains) ? inherited.secondaryDomains : uniq([].concat(selectedRouting.secondaryDomains || selectedRouting.secondary || marionRouting.secondaryDomains || marionRouting.secondary || packetRouting.secondary || [])),
    answerMode: cleanText(inherited.answerMode || selectedRouting.answerMode || marionRouting.answerMode || selectedObj.answerMode || marionObj.answerMode || (canEmit ? "direct" : "awaiting_marion")),
    turnId: cleanText(n.turnId || selectedObj.turnId || ""),
    traceId: cleanText(n.traceId || selectedObj.traceId || ""),
    requestId: cleanText(selectedObj.requestId || ""),
    sessionId: cleanText(n.sessionId || selectedObj.sessionId || ""),
    lane: cleanText(selectedObj.lane || n.lane || inherited.lane || "general") || "general",
    inputSource: cleanText(n.inputSource || n.source || inherited.inputSource || "text") || "text",
    marionFinal: !!(selectedObj.marionFinal || marionObj.marionFinal),
    finalEnvelopeTrusted,
    finalRenderTelemetry,
    finalRenderTelemetryActive: !!Object.keys(finalRenderTelemetry).length,
    publicSurfaceClean: safeObj(finalRenderTelemetry).publicSurfaceClean !== false,
    replySignature: reply ? replyHash(reply) : cleanText(inherited.replySignature || ""),
    latencyMs: startedAt ? now() - startedAt : 0,
    indexVersion: INDEX_VERSION,
    updatedAt: now()
  };
}

function buildIndexMarionFinalSignature(reply, turnId) {
  const seed = replyHash(`${cleanText(reply || "")}:${cleanText(turnId || "")}:${INDEX_VERSION}`);
  return `${MARION_FINAL_SIGNATURE_PREFIX}${REQUIRED_CHAT_ENGINE_SIGNATURE}::${INDEX_VERSION}::nyx.marion.stateSpine/1.7::${seed}`;
}

function normalizeMarionBridgeResult(raw, input) {
  if (!isObj(raw)) return raw;
  const src = { ...raw };
  const result = isObj(src.result) ? src.result : {};
  const base = isObj(result) && Object.keys(result).length && !src.reply && !src.response && !src.payload
    ? { ...result, ...src }
    : src;

  const reply = getMarionAuthorityReply(base) || getMarionAuthorityReply(src) || getMarionAuthorityReply(result);
  if (!reply || base.ok === false || src.ok === false) return raw;

  // Critical loop hardlock discipline:
  // Do not let the index normalizer mint a fresh Marion signature for a known stale support phrase.
  // A signed stale phrase was the cause of the visible loop: the final envelope became valid,
  // so the final gate allowed the bad reply through. This keeps architecture intact while
  // forcing the chat route to reject/regate the phrase downstream.
  if (isBlockedLoopingSupportReply(reply)) {
    const blockedMeta = {
      ...(isObj(base.meta) ? base.meta : {}),
      indexBridgeNormalized: true,
      loopReplyBlockedCandidate: true,
      hardlockCompatible: false,
      final: false,
      marionFinal: false
    };
    return {
      ...base,
      ok: false,
      final: false,
      handled: true,
      marionFinal: false,
      loopReplyBlockedCandidate: true,
      reply: "",
      text: "",
      answer: "",
      output: "",
      response: "",
      message: "",
      meta: blockedMeta,
      diagnostics: {
        ...(isObj(base.diagnostics) ? base.diagnostics : {}),
        indexBridgeNormalized: true,
        loopReplyBlockedCandidate: true,
        reason: "stale_support_phrase_not_signed_by_index"
      }
    };
  }

  const req = isObj(input) ? input : {};
  const reqMeta = isObj(req.meta) ? req.meta : {};
  const turnId = cleanText(
    base.turnId ||
    (isObj(base.meta) && base.meta.turnId) ||
    src.turnId ||
    (isObj(src.meta) && src.meta.turnId) ||
    req.turnId ||
    reqMeta.turnId ||
    ""
  );

  const existingMeta = isObj(base.meta) ? base.meta : {};
  const existingPayload = isObj(base.payload) ? base.payload : {};
  const existingPacket = isObj(base.packet) ? base.packet : {};
  const existingPacketMeta = isObj(existingPacket.meta) ? existingPacket.meta : {};
  const existingSynthesis = isObj(existingPacket.synthesis) ? existingPacket.synthesis : {};

  const signature = cleanText(
    base.signature ||
    base.marionFinalSignature ||
    existingMeta.signature ||
    existingMeta.marionFinalSignature ||
    existingPayload.signature ||
    existingPayload.marionFinalSignature ||
    existingPacketMeta.signature ||
    existingPacketMeta.marionFinalSignature ||
    buildIndexMarionFinalSignature(reply, turnId)
  );

  const finalMarkers = Array.isArray(base.finalMarkers) && base.finalMarkers.length
    ? base.finalMarkers
    : REQUIRED_MARION_FINAL_MARKERS.slice();

  const runtimeTelemetry = buildIndexRuntimeTelemetry({norm:req,selected:base,marion:base,reply,authority:"marion_bridge_normalized",startedAt:0,stage:"normalized",canEmit:true});

  const meta = {
    ...existingMeta,
    version: cleanText(existingMeta.version || base.version || "marionBridge:index-normalized") || "marionBridge:index-normalized",
    final: true,
    marionFinal: true,
    handled: true,
    marionHandled: true,
    finalizedBy: cleanText(existingMeta.finalizedBy || "index.callMarionBridge.normalizer"),
    replySignature: cleanText(existingMeta.replySignature || base.replySignature || replyHash(reply)),
    signature,
    marionFinalSignature: signature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers,
    hardlockCompatible: true,
    indexBridgeNormalized: true,
    finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
    runtimeTelemetry
  };

  const payload = {
    ...existingPayload,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    response: reply,
    message: reply,
    spokenText: cleanText(existingPayload.spokenText || base.spokenText || reply),
    final: true,
    marionFinal: true,
    handled: true,
    signature,
    marionFinalSignature: signature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers,
    hardlockCompatible: true,
    finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
    runtimeTelemetry
  };

  const packet = {
    ...existingPacket,
    final: true,
    marionFinal: true,
    handled: true,
    routing: {
      ...(isObj(existingPacket.routing) ? existingPacket.routing : {}),
      domain: cleanText((isObj(existingPacket.routing) && existingPacket.routing.domain) || base.domain || req.requestedDomain || "general") || "general",
      intent: cleanText((isObj(existingPacket.routing) && existingPacket.routing.intent) || base.intent || req.intent || "simple_chat") || "simple_chat",
      endpoint: cleanText((isObj(existingPacket.routing) && existingPacket.routing.endpoint) || base.endpoint || "marion://routeMarion.primary") || "marion://routeMarion.primary"
    },
    synthesis: {
      ...existingSynthesis,
      reply,
      text: reply,
      answer: reply,
      output: reply,
      spokenText: cleanText(existingSynthesis.spokenText || base.spokenText || reply),
      final: true,
      marionFinal: true,
      signature,
      marionFinalSignature: signature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers,
      hardlockCompatible: true
    },
    meta: {
      ...existingPacketMeta,
      ...meta
    }
  };

  const diagnostics = {
    ...(isObj(base.diagnostics) ? base.diagnostics : {}),
    finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
    runtimeTelemetry,
    indexBridgeNormalized: true,
    signature,
    marionFinalSignature: signature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers,
    hardlockCompatible: true
  };

  return {
    ...base,
    ok: base.ok !== false,
    final: true,
    handled: true,
    marionFinal: true,
    marionHandled: true,
    usedBridge: base.usedBridge !== false,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    response: reply,
    message: reply,
    spokenText: cleanText(base.spokenText || reply),
    signature,
    marionFinalSignature: signature,
    requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
    finalMarkers,
    hardlockCompatible: true,
    finalEnvelope: {
      ...(isObj(base.finalEnvelope) ? base.finalEnvelope : {}),
      reply,
      text: reply,
      displayReply: reply,
      spokenText: cleanText((isObj(base.finalEnvelope) && base.finalEnvelope.spokenText) || base.spokenText || reply),
      final: true,
      marionFinal: true,
      handled: true,
      authority: "marionFinalEnvelope",
      source: "marionBridge",
      contractVersion: "nyx.marion.final/1.0",
      signature,
      marionFinalSignature: signature,
      requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      finalMarkers,
      hardlockCompatible: true,
      finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
      runtimeTelemetry
    },
    finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
    runtimeTelemetry,
    meta,
    payload,
    packet,
    diagnostics,
    result: isObj(result) ? { ...result, final: true, handled: true, marionFinal: true, meta, payload, packet, signature, marionFinalSignature: signature } : result
  };
}

function shouldLockMarionAuthority(marion) {
  const reply = getMarionAuthorityReply(marion);
  if (!reply) return false;
  if (!isObj(marion)) return false;
  const ok = marion.ok !== false;
  return !!ok;
}

function enforceMarionAuthority(shaped, marion, opts) {
  const out = isObj(shaped) ? { ...shaped } : {};
  const options = isObj(opts) ? opts : {};
  const marionReply = getMarionAuthorityReply(marion);
  const hasAuthority = shouldLockMarionAuthority(marion);
  out.meta = mergeMeta(out.meta, {
    marionAuthorityCandidate: hasAuthority,
    marionAuthorityReplyPresent: !!marionReply,
    marionAuthorityBlockedInternal: isInternalMarionBlockerReply(marionReply)
  });
  if (!hasAuthority) return out;

  const locked = marionReply;
  const payload = isObj(out.payload) ? { ...out.payload } : {};
  payload.reply = locked;
  payload.text = locked;
  payload.message = locked;
  payload.answer = locked;
  payload.output = locked;
  payload.response = locked;
  payload.spokenText = locked;

  const packet = isObj(marion && marion.packet) ? marion.packet : {};
  const synthesis = isObj(packet.synthesis) ? packet.synthesis : {};
  const packetFollowUps = uniq([
    ...(Array.isArray(marion && marion.followUps) ? marion.followUps : []),
    ...(Array.isArray(marion && marion.followUpsStrings) ? marion.followUpsStrings : []),
    ...(Array.isArray(packet && packet.followUps) ? packet.followUps : []),
    ...(Array.isArray(synthesis && synthesis.followUpsStrings) ? synthesis.followUpsStrings : []),
    ...(Array.isArray(synthesis && synthesis.followUps) ? synthesis.followUps : [])
  ].map((v) => cleanText(v)).filter(Boolean)).slice(0, 4);

  out.ok = out.ok !== false;
  out.reply = locked;
  out.text = locked;
  out.output = locked;
  out.answer = locked;
  out.response = locked;
  out.spokenText = locked;
  out.payload = payload;
  out.bridge = repairBridgeEnvelope(out.bridge, marion, out.lane || out.laneId || out.sessionLane || options.lane || "general");
  if (packetFollowUps.length) {
    out.followUps = packetFollowUps;
    out.followUpsStrings = packetFollowUps;
  }
  out.meta = mergeMeta(out.meta, {
    replyAuthority: "marion_locked",
    semanticAuthority: "marion",
    authorityLock: true,
    marionReplyHash: replyHash(locked)
  });
  return out;
}

let chatEngineRuntime = null;

function getChatEngineRuntime() {
  if (chatEngineRuntime) return chatEngineRuntime;
  if (!chatEngineMod || !isObj(chatEngineMod) || typeof chatEngineMod.ChatEngine !== "function") return null;
  try {
    const options = {};
    if (typeof chatEngineMod.BasicEffectEngine === "function") {
      options.effectEngine = new chatEngineMod.BasicEffectEngine();
    }
    chatEngineRuntime = new chatEngineMod.ChatEngine(options);
    return chatEngineRuntime;
  } catch (err) {
    console.log("[Sandblast][chatEngine:runtime_init_error]", err && (err.stack || err.message || err));
    return null;
  }
}

async function callChatEngine(input) {
  if (!chatEngineMod) return null;
  try {
    if (typeof chatEngineMod.handleChat === "function") return await chatEngineMod.handleChat(input);
    if (typeof chatEngineMod.run === "function") return await chatEngineMod.run(input);
    if (typeof chatEngineMod.chat === "function") return await chatEngineMod.chat(input);
    if (typeof chatEngineMod.handle === "function") return await chatEngineMod.handle(input);
    if (typeof chatEngineMod.reply === "function") return await chatEngineMod.reply(input);
    const runtime = getChatEngineRuntime();
    if (runtime && typeof runtime.processInput === "function") {
      const response = await Promise.resolve(runtime.processInput(cleanText(input && input.text || ""), input || {}));
      return {
        ok: true,
        reply: cleanReplyForUser(response),
        payload: { reply: cleanReplyForUser(response) },
        lane: cleanText(input && input.lane || "general") || "general",
        laneId: cleanText(input && input.lane || "general") || "general",
        sessionLane: cleanText(input && input.lane || "general") || "general",
        bridge: isObj(input && input.marion) ? input.marion : null,
        ctx: {},
        ui: {},
        directives: [],
        followUps: [],
        followUpsStrings: [],
        sessionPatch: {},
        cog: { intent: cleanText(input && input.intentHint || "general") || "general", mode: "runtime", publicMode: true },
        meta: { replyAuthority: "chat_engine_runtime", engineVersion: INDEX_VERSION }
      };
    }
    if (typeof chatEngineMod === "function") return await chatEngineMod(input);
  } catch (err) {
    console.log("[Sandblast][chatEngine:error]", err && (err.stack || err.message || err));
    return { __engineError: err };
  }
  return null;
}


function detectIndexSixDomainKnowledgeDomain(value = "") {
  const t = cleanText(value).toLowerCase();
  if (!t) return "";
  if (/(cash[- ]?flow|unit economics|runway|margin|profit|revenue|ltv|cac|pricing|finance|financial|working capital|burn rate|scenario analysis)/i.test(t)) return "finance";
  if (/(cognitive|cognition|bias|fallacy|emotional regulation|attachment|trauma|psychology|behavior|behaviour|mindset|stress|overwhelm|panic)/i.test(t)) return "psychology";
  if (/(machine learning|artificial intelligence|ai|llm|rag|embedding|agent|tool routing|orchestration|model|prompt engineering)/i.test(t)) return "ai";
  if (/(phishing|ransomware|least privilege|mfa|multi[- ]?factor|zero trust|iam|identity access|cyber|cybersecurity|threat model|incident response|input validation|secrets? rotation)/i.test(t)) return "cyber";
  if (/(contract law|consideration|legal information|legal advice|jurisdiction|statute|case law|tort|liability|compliance|privacy law)/i.test(t)) return "law";
  if (/(syntax|grammar|rewrite|proofread|copyedit|wording|tone|sentence|paragraph|english|definition|define|meaning)/i.test(t)) return "english";
  return "";
}

function buildIndexSixDomainMarionRoutedPacket(text = "", source = {}) {
  const clean = cleanText(text);
  const k = detectIndexSixDomainKnowledgeDomain(clean);
  if (!clean || !k) return null;
  return {
    ok: true,
    marionIntent: {
      activate: true,
      intent: "domain_question",
      confidence: 0.92,
      source: "index_six_domain_public_knowledge_hotfix",
      knowledgeDomain: k,
      knowledgeDomainExplicit: true,
      knowledgeDomainReason: "index_public_six_domain_term_match",
      secondaryDomains: [],
      answerMode: "direct_public_knowledge"
    },
    routing: {
      domain: k,
      intent: "domain_question",
      knowledgeDomain: k,
      lane: cleanText(source.lane || "general") || "general",
      endpoint: "marion://routeMarion.primary",
      mode: "knowledge_domain",
      depth: k === "ai" || k === "cyber" ? "forensic" : "balanced",
      answerMode: "direct_public_knowledge",
      domainConfidence: {
        version: "nyx.marion.domainConfidence/1.1",
        confidence: 0.92,
        band: "high",
        routeLocked: true,
        primaryDomain: k,
        knowledgeDomain: k,
        reason: "index_public_six_domain_term_match"
      }
    },
    routerVersion: "index_six_domain_public_knowledge_hotfix/1.0"
  };
}

async function callComposeMarionResponseRuntime(input, upstream) {
  if (!composeMarionResponseMod) return null;
  const source = isObj(input) ? input : {};
  const text = cleanText(source.text || source.userQuery || source.query || "");
  if (!text) return null;
  const packet = {
    ...source,
    text,
    query: text,
    userQuery: text,
    body: {
      ...(isObj(source.body) ? source.body : {}),
      text,
      inputSource: cleanText(source.inputSource || source.source || "text") || "text"
    },
    payload: {
      ...(isObj(source.payload) ? source.payload : {}),
      text,
      inputSource: cleanText(source.inputSource || source.source || "text") || "text"
    },
    source: cleanText(source.source || source.inputSource || "text") || "text",
    upstreamMarionBridge: isObj(upstream) ? {
      ok: upstream.ok !== false,
      final: !!upstream.final,
      marionFinal: !!upstream.marionFinal,
      handled: !!upstream.handled,
      meta: isObj(upstream.meta) ? upstream.meta : {},
      diagnostics: isObj(upstream.diagnostics) ? upstream.diagnostics : {}
    } : undefined,
    meta: {
      ...(isObj(source.meta) ? source.meta : {}),
      source: "index_marion_runtime_reply_promotion_v50",
      indexRole: "transport_only_marion_runtime_recovery",
      finalEnvelopeReplyPromotionV50: true
    }
  };
  try {
    const routedPacket = buildIndexSixDomainMarionRoutedPacket(text, source);
    const composeInput = routedPacket ? {
      ...packet,
      intent: "domain_question",
      domain: routedPacket.routing.domain,
      knowledgeDomain: routedPacket.routing.knowledgeDomain,
      requestedDomain: routedPacket.routing.knowledgeDomain,
      publicDomainAccess: true,
      requireMarionFinal: true,
      domainAccess: ["english", "psychology", "ai", "finance", "cyber", "law"],
      routing: routedPacket.routing,
      marionIntent: routedPacket.marionIntent
    } : packet;
    let out = null;
    if (typeof composeMarionResponseMod.composeMarionResponse === "function") out = routedPacket ? await composeMarionResponseMod.composeMarionResponse(routedPacket, composeInput) : await composeMarionResponseMod.composeMarionResponse(packet);
    else if (typeof composeMarionResponseMod.default === "function") out = routedPacket ? await composeMarionResponseMod.default(routedPacket, composeInput) : await composeMarionResponseMod.default(packet);
    else if (typeof composeMarionResponseMod === "function") out = routedPacket ? await composeMarionResponseMod(routedPacket, composeInput) : await composeMarionResponseMod(packet);
    if (!isObj(out)) return null;
    const reply = getMarionAuthorityReply(out);
    if (!reply || isBlockedLoopingSupportReply(reply) || isConversationDiagnosticFallbackReply(reply)) return null;
    const promoted = normalizeMarionBridgeResult({
      ...out,
      ok: out.ok !== false,
      final: true,
      handled: true,
      marionFinal: true,
      usedBridge: true,
      reply,
      text: reply,
      answer: reply,
      output: reply,
      response: reply,
      spokenText: cleanText(out.spokenText || reply),
      payload: { ...(isObj(out.payload) ? out.payload : {}), reply, text: reply, message: reply, spokenText: reply, final: true, marionFinal: true },
      finalEnvelope: { ...(isObj(out.finalEnvelope) ? out.finalEnvelope : {}), reply, text: reply, displayReply: reply, spokenText: reply, final: true, marionFinal: true, handled: true, source: "marion", authority: "composeMarionResponse", contractVersion: "nyx.marion.final/1.0" },
      meta: {
        ...(isObj(out.meta) ? out.meta : {}),
        replyAuthority: "composeMarionResponse",
        semanticAuthority: "marion",
        marionBridgeReplyPromotionFallback: true,
        finalEnvelopeReplyPromotionV50: true,
        upstreamMarionReturned: !!upstream,
        noHttp502: true
      }
    }, packet);
    return promoted || null;
  } catch (err) {
    console.log("[Sandblast][composeMarionResponse:fallback:error]", cleanText(err && (err.message || err) || "compose_fallback_failed"));
    return null;
  }
}

async function callMarionBridge(input) {
  if (!marionBridgeMod) return null;
  const finish = (value) => normalizeMarionBridgeResult(value, input);
  try {
    if (typeof marionBridgeMod.createMarionBridge === "function") {
      const bridge = marionBridgeMod.createMarionBridge();
      if (bridge && typeof bridge.maybeResolve === "function") return finish(await bridge.maybeResolve(input));
    }

    // Fallback compatibility only if factory is absent.
    if (typeof marionBridgeMod.maybeResolve === "function") return finish(await marionBridgeMod.maybeResolve(input));
    if (typeof marionBridgeMod.processWithMarion === "function") return finish(await marionBridgeMod.processWithMarion(input));
    if (typeof marionBridgeMod.route === "function") return finish(await marionBridgeMod.route(input));
    if (typeof marionBridgeMod.ask === "function") return finish(await marionBridgeMod.ask(input));
    if (typeof marionBridgeMod.handle === "function") return finish(await marionBridgeMod.handle(input));
    if (typeof marionBridgeMod.default === "function") return finish(await marionBridgeMod.default(input));
    if (typeof marionBridgeMod === "function") return finish(await marionBridgeMod(input));
  } catch (err) {
    console.log("[Sandblast][marionBridge:error]", err && (err.stack || err.message || err));
    return {
      ok: false,
      error: "marion_bridge_runtime_error",
      detail: cleanText(err && (err.message || err) || "marion bridge failed"),
      reply: "",
      text: "",
      final: false,
      marionFinal: false,
      awaitingMarion: true,
      meta: {
        source: "index_callMarionBridge",
        v: PUBLIC_INDEX_VERSION,
        t: now(),
        transportOnly: true,
        noSupportDecision: true,
        noEmotionDecision: true
      }
    };
  }
  return null;
}

function callWithTimeout(promiseOrValue, ms, label) {
  const timeoutMs = clamp(Number(ms || CFG.requestTimeoutMs || 18000), 1000, 60000);
  return Promise.race([
    Promise.resolve(promiseOrValue),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label || "operation"}_timeout`)), timeoutMs))
  ]);
}

function ttsHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.handleTts === "function") return mod.handleTts.bind(mod);
  if (typeof mod.ttsHandler === "function") return mod.ttsHandler.bind(mod);
  if (typeof mod.handler === "function") return mod.handler.bind(mod);
  if (typeof mod.handle === "function") return mod.handle.bind(mod);
  if (typeof mod.delegateTts === "function") return mod.delegateTts.bind(mod);
  if (typeof mod.generateSpeech === "function") return mod.generateSpeech.bind(mod);
  if (typeof mod.speak === "function") return mod.speak.bind(mod);
  if (typeof mod.run === "function") return mod.run.bind(mod);
  if (typeof mod.generate === "function") return mod.generate.bind(mod);
  if (typeof mod.tts === "function") return mod.tts.bind(mod);
  if (typeof mod.synthesize === "function") return mod.synthesize.bind(mod);
  if (typeof mod.default === "function") return mod.default.bind(mod);
  if (typeof mod === "function") return mod;
  return null;
}

function voiceRouteHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.handleVoiceRoute === "function") return mod.handleVoiceRoute.bind(mod);
  if (typeof mod.voiceRouteHandler === "function") return mod.voiceRouteHandler.bind(mod);
  if (typeof mod.handler === "function") return mod.handler.bind(mod);
  if (typeof mod.handle === "function") return mod.handle.bind(mod);
  if (typeof mod === "function") return mod;
  return null;
}

function voiceHealthFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.health === "function") return mod.health.bind(mod);
  if (typeof mod.getHealth === "function") return mod.getHealth.bind(mod);
  return null;
}

function ttsHealthFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.health === "function") return mod.health.bind(mod);
  if (typeof mod.getHealth === "function") return mod.getHealth.bind(mod);
  if (typeof mod.status === "function") return mod.status.bind(mod);
  return null;
}

function sendTtsJsonError(req, res, statusCode, error, detail, extra) {
  const code = clamp(Number(statusCode || 503), 400, 599);
  const traceId = cleanText((req && (req.sbTraceId || (req.headers && req.headers["x-sb-trace-id"]))) || makeTraceId("tts"));
  const payload = {
    ok: false,
    spokenUnavailable: true,
    error: cleanText(error || "tts_route_failure") || "tts_route_failure",
    detail: cleanText(detail || "TTS route failed") || "TTS route failed",
    traceId,
    meta: { v: PUBLIC_INDEX_VERSION, t: now() },
    payload: { spokenUnavailable: true }
  };
  if (isObj(extra)) Object.assign(payload, extra);
  return res.status(code).json(payload);
}

function firstTruthyString() {
  for (const v of arguments) {
    const s = cleanText(v);
    if (s) return s;
  }
  return "";
}

function boolish(v, fallback) {
  if (v === true || v === false) return v;
  const s = lower(v);
  if (["1","true","yes","on"].includes(s)) return true;
  if (["0","false","no","off"].includes(s)) return false;
  return !!fallback;
}

function inferAudioMimeType(raw) {
  const direct = firstTruthyString(
    raw && raw.mimeType,
    raw && raw.contentType,
    raw && raw.audioMimeType,
    raw && raw.audio && raw.audio.mimeType,
    raw && raw.audio && raw.audio.contentType,
    raw && raw.payload && raw.payload.mimeType,
    raw && raw.payload && raw.payload.contentType
  );
  if (direct) return direct;
  const format = lower(
    firstTruthyString(
      raw && raw.format,
      raw && raw.audioFormat,
      raw && raw.audio && raw.audio.format,
      raw && raw.payload && raw.payload.format
    )
  );
  if (format === "mp3" || format === "mpeg") return "audio/mpeg";
  if (format === "wav" || format === "wave") return "audio/wav";
  if (format === "ogg") return "audio/ogg";
  if (format === "webm") return "audio/webm";
  if (format === "mp4" || format === "m4a") return "audio/mp4";
  return "audio/mpeg";
}

function looksLikeBase64Audio(v) {
  const s = cleanText(v);
  if (!s) return false;
  if (/^data:audio\//i.test(s)) return false;
  return s.length > 64 && /^[A-Za-z0-9+/=\s]+$/.test(s);
}

function normalizeTtsRoutePayload(raw, req) {
  const src = isObj(raw) ? { ...raw } : {};
  const payload = isObj(src.payload) ? { ...src.payload } : {};
  const audio = isObj(src.audio) ? { ...src.audio } : {};
  const speech = isObj(src.speech) ? { ...src.speech } : {};
  const traceId = cleanText((req && (req.sbTraceId || (req.headers && req.headers["x-sb-trace-id"]))) || src.traceId || payload.traceId || makeTraceId("tts"));

  const audioUrl = firstTruthyString(
    src.audioUrl,
    src.url,
    src.src,
    src.audioSrc,
    audio.url,
    audio.audioUrl,
    audio.src,
    payload.audioUrl,
    payload.url,
    payload.src
  );
  let audioBase64 = firstTruthyString(
    src.audioBase64,
    src.base64,
    src.audioContent,
    src.audioData,
    audio.base64,
    audio.audioBase64,
    audio.content,
    audio.data,
    payload.audioBase64,
    payload.base64,
    payload.audioContent,
    payload.audioData
  );
  const dataUri = /^data:(audio\/[^;]+);base64,(.+)$/i.exec(audioBase64 || "");
  let mimeType = inferAudioMimeType({ ...src, payload, audio });
  if (dataUri) {
    mimeType = cleanText(dataUri[1]) || mimeType;
    audioBase64 = cleanText(dataUri[2]);
  }

  const text = cleanReplyForUser(firstTruthyString(
    src.text,
    src.textSpeak,
    src.textDisplay,
    src.spokenText,
    speech.textSpeak,
    speech.text,
    payload.textSpeak,
    payload.textDisplay,
    payload.spokenText,
    payload.text
  ));

  const format = cleanText(
    src.format ||
    src.audioFormat ||
    audio.format ||
    payload.format ||
    (mimeType === "audio/mpeg" ? "mp3" : mimeType.replace(/^audio\//i, ""))
  ) || "mp3";

  const playable = !!(audioUrl || audioBase64 || src.playable === true || audio.playable === true || payload.playable === true);
  const autoPlay = boolish(
    src.autoPlay !== undefined ? src.autoPlay :
    audio.autoPlay !== undefined ? audio.autoPlay :
    payload.autoPlay !== undefined ? payload.autoPlay :
    src.shouldPlay !== undefined ? src.shouldPlay :
    audio.shouldPlay !== undefined ? audio.shouldPlay :
    payload.shouldPlay !== undefined ? payload.shouldPlay :
    true,
    true
  );

  const normalizedAudio = {
    ok: playable,
    playable,
    url: audioUrl || "",
    src: audioUrl || "",
    audioUrl: audioUrl || "",
    audioBase64: audioBase64 || "",
    mimeType,
    contentType: mimeType,
    format,
    autoPlay,
    shouldPlay: autoPlay,
    provider: firstTruthyString(src.provider, audio.provider, payload.provider, process.env.TTS_PROVIDER || "resemble") || "resemble",
    text: text || "",
    textSpeak: text || "",
    chars: Number(src.chars || audio.chars || payload.chars || (text ? text.length : 0)) || 0
  };

  return {
    ok: src.ok !== false && playable,
    playable,
    spokenUnavailable: !playable,
    traceId,
    audio: normalizedAudio,
    audioUrl: normalizedAudio.audioUrl,
    audioBase64: normalizedAudio.audioBase64,
    src: normalizedAudio.audioUrl,
    url: normalizedAudio.audioUrl,
    mimeType: normalizedAudio.mimeType,
    contentType: normalizedAudio.mimeType,
    format: normalizedAudio.format,
    autoPlay: normalizedAudio.autoPlay,
    shouldPlay: normalizedAudio.shouldPlay,
    text: text || "",
    textSpeak: text || "",
    spokenText: text || "",
    speech: {
      enabled: true,
      speak: playable,
      text: text || "",
      textDisplay: text || "",
      textSpeak: text || "",
      alignmentVersion: "speech-contract-v3"
    },
    payload: {
      ...payload,
      playable,
      audioUrl: normalizedAudio.audioUrl,
      audioBase64: normalizedAudio.audioBase64,
      mimeType: normalizedAudio.mimeType,
      format: normalizedAudio.format,
      autoPlay: normalizedAudio.autoPlay,
      shouldPlay: normalizedAudio.shouldPlay,
      textSpeak: text || payload.textSpeak || "",
      spokenText: text || payload.spokenText || ""
    },
    meta: {
      ...(isObj(src.meta) ? src.meta : {}),
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      route: cleanText(req && (req.originalUrl || req.path) || "/api/tts") || "/api/tts",
      audioContract: "audio-first-v2"
    }
  };
}

async function dispatchTts(req, res) {
  const moduleHandler = ttsHandlerFromModule(ttsMod);
  if (CFG.httpLogEnabled) {
    console.log("[Sandblast][ttsRoute:dispatch]", { path: req.originalUrl || req.path || "/api/tts", hasHandler: !!moduleHandler, host: getBackendPublicBase(), traceId: cleanText(req.sbTraceId || req.headers["x-sb-trace-id"] || "") });
  }
  if (!moduleHandler) {
    throw new Error("tts_handler_unavailable");
  }

  const originalJson = typeof res.json === "function" ? res.json.bind(res) : null;
  if (originalJson) {
    res.json = function patchedTtsJson(body) {
      return originalJson(normalizeTtsRoutePayload(body, req));
    };
  }

  const result = await moduleHandler(req, res);
  if (res.headersSent || res.writableEnded) return result;

  if (result !== undefined) {
    return res.status(200).json(normalizeTtsRoutePayload(result, req));
  }

  return sendTtsJsonError(req, res, 503, "tts_empty_response", "TTS handler completed without audio payload.", {
    configSource: "tts_module",
    ttsModuleBound: true
  });
}

function attachVoiceRoute(base) {
  const shaped = isObj(base) ? { ...base } : {};
  const existing = isObj(shaped.voiceRoute) ? shaped.voiceRoute : {};
  const routeEnabled = !!CFG.voiceRouteEnabled;
  const route = {
    enabled: routeEnabled,
    endpoint: routeUrl("/api/tts"),
    healthEndpoint: routeUrl("/api/tts/health"),
    compatibilityHealthEndpoint: routeUrl("/tts/health"),
    method: "POST",
    requiresToken: !!(CFG.requireVoiceRouteToken && CFG.apiToken),
    preserveMixerVoice: !!CFG.preserveMixerVoice,
    jsonAudioSupported: true,
    streamAudioSupported: true,
    contractVersion: "audio-first-v1",
    deterministicAudio: true,
    failOpenChat: true,
    traceHeader: "x-sb-trace-id"
  };

  if (routeEnabled && shaped.reply && !shaped.audio) {
    shaped.voiceRoute = { ...route, ...existing };
  } else if (existing && Object.keys(existing).length) {
    shaped.voiceRoute = { ...route, ...existing };
  }

  return shaped;
}

function normalizeVoiceRouteResponse(out) {
  if (!isObj(out)) return null;
  const textSpeak = cleanReplyForUser(out.textSpeak || out.spokenText || out.text || out.textDisplay || "");
  const textDisplay = cleanReplyForUser(out.textDisplay || out.displayReply || out.text || textSpeak || "");
  const text = cleanReplyForUser(out.text || textDisplay || textSpeak || "");
  return {
    enabled: out.enabled !== false,
    endpoint: cleanText(out.endpoint || "/api/tts") || "/api/tts",
    healthEndpoint: cleanText(out.healthEndpoint || "/api/tts/health") || "/api/tts/health",
    compatibilityHealthEndpoint: cleanText(out.compatibilityHealthEndpoint || "/tts/health") || "/tts/health",
    method: cleanText(out.method || "POST") || "POST",
    requiresToken: !!out.requiresToken,
    preserveMixerVoice: !!out.preserveMixerVoice,
    jsonAudioSupported: out.jsonAudioSupported !== false,
    streamAudioSupported: out.streamAudioSupported !== false,
    contractVersion: cleanText(out.contractVersion || "audio-first-v1") || "audio-first-v1",
    deterministicAudio: out.deterministicAudio !== false,
    failOpenChat: out.failOpenChat !== false,
    traceHeader: cleanText(out.traceHeader || "x-sb-trace-id") || "x-sb-trace-id",
    text,
    textDisplay: textDisplay || text,
    displayReply: textDisplay || text,
    textSpeak: textSpeak || textDisplay || text,
    spokenText: textSpeak || textDisplay || text,
    routeKind: cleanText(out.routeKind || "main") || "main",
    intro: out.intro === true,
    source: cleanText(out.source || "chat") || "chat",
    speechHints: isObj(out.speechHints) ? out.speechHints : {},
    presenceProfile: cleanText(out.presenceProfile || "") || undefined,
    voiceStyle: cleanText(out.voiceStyle || "") || undefined,
    nyxStateHint: cleanText(out.nyxStateHint || "") || undefined
  };
}

function buildSpeechContract(shaped, norm) {
  const payload = isObj(shaped && shaped.payload) ? shaped.payload : {};
  const voiceRoute = isObj(shaped && shaped.voiceRoute) ? shaped.voiceRoute : {};
  const incomingSpeech = isObj(shaped && shaped.speech) ? shaped.speech : (isObj(payload.speech) ? payload.speech : {});
  const reply = cleanReplyForUser(
    (incomingSpeech.displayText || incomingSpeech.text || shaped && shaped.reply || payload.reply || payload.text || voiceRoute.text || norm && norm.text || "")
  );
  const textDisplay = cleanReplyForUser(
    incomingSpeech.displayText || payload.textDisplay || voiceRoute.textDisplay || shaped && shaped.textDisplay || reply
  ) || reply;
  const textSpeak = cleanReplyForUser(
    incomingSpeech.normalizedText || incomingSpeech.text || payload.textSpeak || voiceRoute.textSpeak || shaped && shaped.textSpeak || reply
  ) || reply;
  const routeKind = cleanText(
    payload.routeKind || voiceRoute.routeKind || shaped && shaped.routeKind || (norm && norm.mode === "intro" ? "intro" : "main")
  ) || "main";
  const intro = voiceRoute.intro === true || payload.intro === true || routeKind === "intro";
  const source = cleanText(payload.source || voiceRoute.source || (intro ? "intro" : "chat"));
  const speechHints = isObj(payload.speechHints) ? payload.speechHints : (isObj(voiceRoute.speechHints) ? voiceRoute.speechHints : {});
  return {
    enabled: incomingSpeech.enabled !== false,
    speak: incomingSpeech.speak !== false,
    text: reply,
    textDisplay,
    textSpeak,
    routeKind,
    intro,
    source: source || (intro ? "intro" : "chat"),
    speechHints,
    presenceProfile: cleanText(incomingSpeech.presenceProfile || payload.presenceProfile || "") || undefined,
    voiceStyle: cleanText(incomingSpeech.voiceStyle || payload.voiceStyle || "") || undefined,
    nyxStateHint: cleanText(incomingSpeech.nyxStateHint || payload.nyxStateHint || "") || undefined,
    alignmentVersion: "speech-contract-v2"
  };
}


function normalizeImageLike(entry, title) {
  if (!entry) return null;
  if (typeof entry === "string") {
    const url = cleanText(entry);
    return url ? { url, alt: cleanText(title || ""), caption: "" } : null;
  }
  if (!isObj(entry)) return null;
  const url = cleanText(entry.url || entry.src || entry.href || entry.image || entry.original || entry.large || entry.medium || entry.small || entry.thumbnail || "");
  if (!url) return null;
  return {
    url,
    alt: cleanText(entry.alt || entry.title || title || ""),
    caption: cleanText(entry.caption || entry.description || "")
  };
}


function buildNewsCanadaGuaranteedFallbackItems(reason, limit) {
  const max = clamp(Number(limit || 4), 1, 12);
  const nowIso = new Date().toISOString();
  const baseItems = [
    {
      id: "newscanada-fallback-1",
      guid: "newscanada-fallback-1",
      slug: "news-canada-refreshing",
      title: "News Canada is refreshing",
      headline: "News Canada is refreshing",
      description: "Live stories are loading. This confirms the News Canada pipeline is mounted and still serving data.",
      summary: "Live stories are loading. This confirms the News Canada pipeline is mounted and still serving data.",
      body: "Live stories are loading. This confirms the News Canada pipeline is mounted and still serving data.",
      content: "Live stories are loading. This confirms the News Canada pipeline is mounted and still serving data.",
      link: "https://sandblast.channel",
      url: "https://sandblast.channel",
      sourceUrl: "https://sandblast.channel",
      canonicalUrl: "https://sandblast.channel",
      pubDate: nowIso,
      publishedAt: nowIso,
      image: "",
      popupImage: "",
      popupBody: "Live stories are loading. This confirms the News Canada pipeline is mounted and still serving data.",
      byline: "",
      author: "",
      category: "News Canada",
      chipLabel: "News Canada",
      ctaText: "Preview story",
      source: "News Canada",
      sourceName: "News Canada",
      feedUrl: resolveNewsCanadaFeedUrl(),
      parserMode: "guaranteed_fallback",
      isActive: true
    },
    {
      id: "newscanada-fallback-2",
      guid: "newscanada-fallback-2",
      slug: "cache-and-rss-protection-active",
      title: "Cache and RSS protection is active",
      headline: "Cache and RSS protection is active",
      description: "If the upstream feed slows down, the backend now protects the page from going empty.",
      summary: "If the upstream feed slows down, the backend now protects the page from going empty.",
      body: "If the upstream feed slows down, the backend now protects the page from going empty.",
      content: "If the upstream feed slows down, the backend now protects the page from going empty.",
      link: "https://sandblast.channel",
      url: "https://sandblast.channel",
      sourceUrl: "https://sandblast.channel",
      canonicalUrl: "https://sandblast.channel",
      pubDate: nowIso,
      publishedAt: nowIso,
      image: "",
      popupImage: "",
      popupBody: "If the upstream feed slows down, the backend now protects the page from going empty.",
      byline: "",
      author: "",
      category: "News Canada",
      chipLabel: "News Canada",
      ctaText: "Preview story",
      source: "News Canada",
      sourceName: "News Canada",
      feedUrl: resolveNewsCanadaFeedUrl(),
      parserMode: "guaranteed_fallback",
      isActive: true
    },
    {
      id: "newscanada-fallback-3",
      guid: "newscanada-fallback-3",
      slug: "diagnostics-available-in-meta",
      title: "Diagnostics are available in the response metadata",
      headline: "Diagnostics are available in the response metadata",
      description: "Use the meta block to confirm whether stories came from rss_live, cache, snapshot, or fallback mode.",
      summary: "Use the meta block to confirm whether stories came from rss_live, cache, snapshot, or fallback mode.",
      body: "Use the meta block to confirm whether stories came from rss_live, cache, snapshot, or fallback mode.",
      content: "Use the meta block to confirm whether stories came from rss_live, cache, snapshot, or fallback mode.",
      link: "https://sandblast.channel",
      url: "https://sandblast.channel",
      sourceUrl: "https://sandblast.channel",
      canonicalUrl: "https://sandblast.channel",
      pubDate: nowIso,
      publishedAt: nowIso,
      image: "",
      popupImage: "",
      popupBody: "Use the meta block to confirm whether stories came from rss_live, cache, snapshot, or fallback mode.",
      byline: "",
      author: "",
      category: "News Canada",
      chipLabel: "News Canada",
      ctaText: "Preview story",
      source: "News Canada",
      sourceName: "News Canada",
      feedUrl: resolveNewsCanadaFeedUrl(),
      parserMode: "guaranteed_fallback",
      isActive: true
    },
    {
      id: "newscanada-fallback-4",
      guid: "newscanada-fallback-4",
      slug: "live-stories-will-replace-these-slots",
      title: "Live stories will replace these slots automatically",
      headline: "Live stories will replace these slots automatically",
      description: "As soon as the upstream feed answers cleanly, live stories overwrite the protected fallback payload.",
      summary: "As soon as the upstream feed answers cleanly, live stories overwrite the protected fallback payload.",
      body: "As soon as the upstream feed answers cleanly, live stories overwrite the protected fallback payload.",
      content: "As soon as the upstream feed answers cleanly, live stories overwrite the protected fallback payload.",
      link: "https://sandblast.channel",
      url: "https://sandblast.channel",
      sourceUrl: "https://sandblast.channel",
      canonicalUrl: "https://sandblast.channel",
      pubDate: nowIso,
      publishedAt: nowIso,
      image: "",
      popupImage: "",
      popupBody: "As soon as the upstream feed answers cleanly, live stories overwrite the protected fallback payload.",
      byline: "",
      author: "",
      category: "News Canada",
      chipLabel: "News Canada",
      ctaText: "Preview story",
      source: "News Canada",
      sourceName: "News Canada",
      feedUrl: resolveNewsCanadaFeedUrl(),
      parserMode: "guaranteed_fallback",
      isActive: true
    }
  ];

  return baseItems.slice(0, max).map((item) => ({
    ...item,
    fallbackReason: cleanText(reason || "news_canada_non_empty_contract")
  }));
}

function ensureNewsCanadaItemsNonEmpty(items, reason, limit) {
  const normalized = Array.isArray(items) ? items.filter(Boolean) : [];
  return normalized.length ? normalized : buildNewsCanadaGuaranteedFallbackItems(reason, limit);
}

function getNewsCanadaService() {
  return {
    async fetchRSS(opts) {
      const normalizedOpts = {
        ...(isObj(opts) ? opts : {}),
        refresh: true,
        strictLive: true,
        allowFallbackSeed: false,
        preferFreshCache: false
      };
      if (newsCanadaFeedService && typeof newsCanadaFeedService.fetchRSS === "function") {
        return Promise.resolve(newsCanadaFeedService.fetchRSS(normalizedOpts));
      }
      return null;
    },
    async getEditorsPicks(opts) {
      const normalizedOpts = {
        ...(isObj(opts) ? opts : {}),
        refresh: true,
        strictLive: true,
        allowFallbackSeed: false,
        preferFreshCache: false
      };
      if (newsCanadaFeedService && typeof newsCanadaFeedService.getEditorsPicks === "function") {
        return Promise.resolve(newsCanadaFeedService.getEditorsPicks(normalizedOpts));
      }
      return null;
    },
    async getStory(lookup, opts) {
      if (newsCanadaFeedService && typeof newsCanadaFeedService.getStory === "function") {
        return newsCanadaFeedService.getStory(lookup, { ...(isObj(opts) ? opts : {}), refresh: true });
      }
      return { ok: false, error: "news_canada_service_unavailable", meta: { source: "service_unavailable", degraded: true } };
    }
  };
}

async function getNewsCanadaEditorsPicksResponse(req) {
  const service = getNewsCanadaService();
  if (!service || typeof service.getEditorsPicks !== "function") {
    return {
      ok: false,
      route: "/api/newscanada/editors-picks",
      storyRoute: "/api/newscanada/story",
      availableStories: 0,
      storyCount: 0,
      count: 0,
      stories: [],
      items: [],
      articles: [],
      editorsPicks: [],
      editorPicks: [],
      feed: [],
      slides: [],
      panels: [],
      chips: [],
      meta: {
        v: PUBLIC_INDEX_VERSION,
        t: now(),
        source: "service_unavailable",
        degraded: true,
        mode: "rss",
        feedUrl: resolveNewsCanadaFeedUrl(),
        fetchedAt: now(),
        storyCount: 0,
        itemCount: 0,
        parserMode: "live_empty",
        detail: "news_canada_service_unavailable",
        contractVersion: "newscanada-rss-service-v10",
        stableRoutes: {
          editorsPicks: "/api/newscanada/editors-picks",
          editorsPicksMeta: "/api/newscanada/editors-picks/meta",
          story: "/api/newscanada/story",
          refresh: "/api/newscanada/rss"
        }
      }
    };
  }

  const result = await Promise.resolve(service.getEditorsPicks({
    refresh: req.query && req.query.refresh === "1",
    limit: Number(req.query && req.query.limit || 0) || undefined,
    strictLive: true,
    allowFallbackSeed: false,
    preferFreshCache: false
  }));

  const rawStories = Array.isArray(result && result.stories) ? result.stories : [];
  const hasSyntheticPayload = isNewsCanadaSeedPayload(result);
  const stories = hasSyntheticPayload ? [] : rawStories.filter(Boolean);
  const slides = Array.isArray(result && result.slides) && result.slides.length && !hasSyntheticPayload ? result.slides : stories;
  const ok = !!(result && result.ok !== false && stories.length);

  return {
    ok,
    route: "/api/newscanada/editors-picks",
    storyRoute: "/api/newscanada/story",
    availableStories: stories.filter((story) => story && story.isActive !== false).length,
    storyCount: stories.length,
    count: stories.length,
    stories,
    items: stories,
    articles: stories,
    editorsPicks: stories,
    editorPicks: stories,
    feed: stories,
    slides,
    panels: slides,
    chips: Array.isArray(result && result.chips) && !hasSyntheticPayload ? result.chips : [],
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      source: cleanText(result && result.meta && result.meta.source || (ok ? "rss_service" : "rss_unavailable")) || "rss_unavailable",
      degraded: !!(result && result.meta && result.meta.degraded) || !ok,
      mode: cleanText(result && result.meta && result.meta.mode || "rss") || "rss",
      feedUrl: cleanText(result && result.meta && result.meta.feedUrl || resolveNewsCanadaFeedUrl()),
      fetchedAt: Number(result && result.meta && result.meta.fetchedAt || now()),
      storyCount: stories.length,
      itemCount: stories.length,
      parserMode: cleanText(result && result.meta && result.meta.parserMode || (ok ? "rss_payload" : "live_empty")) || "live_empty",
      detail: cleanText(result && result.meta && result.meta.detail || (hasSyntheticPayload ? "synthetic_payload_rejected" : (!stories.length ? "no_real_stories_available" : ""))),
      contractVersion: "newscanada-rss-service-v10",
      stableRoutes: {
        editorsPicks: "/api/newscanada/editors-picks",
        editorsPicksMeta: "/api/newscanada/editors-picks/meta",
        story: "/api/newscanada/story",
        refresh: "/api/newscanada/rss"
      }
    }
  };
}

async function getNewsCanadaStoryResponse(req) {
  const service = getNewsCanadaService();
  if (!service || typeof service.getStory !== "function") {
    return {
      ok: false,
      error: "news_canada_service_unavailable",
      route: "/api/newscanada/story",
      meta: { v: PUBLIC_INDEX_VERSION, t: now(), source: "service_unavailable", degraded: true }
    };
  }

  const lookup = cleanText(req.query.id || req.query.storyId || req.query.slotId || req.query.slug || req.query.title || req.query.url || "");
  const result = await Promise.resolve(service.getStory(lookup, {
    refresh: req.query && req.query.refresh === "1"
  }));

  if (!result || result.ok === false || !isObj(result.story)) {
    return {
      ok: false,
      error: "story_not_found",
      route: "/api/newscanada/story",
      lookup,
      meta: { v: PUBLIC_INDEX_VERSION, t: now(), source: cleanText(result && result.meta && result.meta.source || "rss_service") || "rss_service" }
    };
  }

  return {
    ok: true,
    route: "/api/newscanada/story",
    story: result.story,
    popup: {
      title: result.story.title,
      body: result.story.popupBody || result.story.body || result.story.content || result.story.summary || "",
      image: result.story.popupImage || result.story.image || "",
      summary: result.story.summary || "",
      url: result.story.url || "",
      ctaText: result.story.ctaText || "Read more"
    },
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      source: cleanText(result && result.meta && result.meta.source || "rss_service") || "rss_service",
      degraded: !!(result && result.meta && result.meta.degraded)
    }
  };
}

function buildNewsCanadaTrace(req) {
  return {
    traceId: cleanText(req && (req.sbTraceId || req.headers && req.headers["x-sb-trace-id"]) || makeTraceId("newscanada")),
    route: cleanText(req && (req.originalUrl || req.url) || "/api/newscanada/rss") || "/api/newscanada/rss",
    startedAt: now(),
    refresh: !!(req && req.query && req.query.refresh === "1")
  };
}

function logNewsCanadaTrace(trace, stage, payload) {
  try {
    console.log("[Sandblast][newsCanada][trace]", {
      traceId: cleanText(trace && trace.traceId || ""),
      stage: cleanText(stage || "stage") || "stage",
      route: cleanText(trace && trace.route || "/api/newscanada/rss") || "/api/newscanada/rss",
      elapsedMs: Math.max(0, now() - Number(trace && trace.startedAt || now())),
      ...(isObj(payload) ? payload : {})
    });
  } catch (_) {}
}

async function getNewsCanadaRssResponse(req) {
  const trace = buildNewsCanadaTrace(req);

  logNewsCanadaTrace(trace, "request_received", {
    refresh: trace.refresh,
    serviceAvailable: false,
    fetchRSSAvailable: true,
    routeMode: "inline_direct_truth"
  });

  setTransportState(sessionId, { key: transportKey, turnId: norm.turnId, reply: cleanText(shaped.reply || reply), replyHash: replyHash(cleanText(shaped.reply || reply)), userHash: replyHash(norm.text), finalized: true, route: norm.lane || "general", authority: cleanText(shaped.meta && shaped.meta.replyAuthority || ""), count: 1 });

  try {
    const cachedContract = !trace.refresh ? readNewsCanadaCacheContractFile() : null;
    const cachedItems = cachedContract && Array.isArray(cachedContract.items) ? cachedContract.items : [];
    const cachedUsable = !!(cachedItems.length && !isNewsCanadaSeedPayload(cachedContract));
    const cacheFresh = cachedUsable ? isFreshNewsCanadaContractCache(cachedContract, getNewsCanadaCacheServeTtlMs()) : false;
    if (cachedUsable && !trace.refresh) {
      if (!cacheFresh) scheduleNewsCanadaBackgroundRefresh("stale_while_refresh_route_hit");
      logNewsCanadaTrace(trace, cacheFresh ? "cache_contract_hit" : "cache_contract_stale_served", {
        cachedItemCount: cachedItems.length,
        source: cleanText(cachedContract.meta && cachedContract.meta.source || "cache_contract") || "cache_contract",
        cacheFresh,
        scheduledBackgroundRefresh: !cacheFresh
      });
      return {
        ok: true,
        traceId: trace.traceId,
        route: "/api/newscanada/rss",
        items: cachedItems.slice(),
        meta: {
          v: PUBLIC_INDEX_VERSION,
          t: now(),
          traceId: trace.traceId,
          source: cleanText(cachedContract.meta && cachedContract.meta.source || "cache_contract") || "cache_contract",
          degraded: !cacheFresh,
          mode: cleanText(cachedContract.meta && cachedContract.meta.mode || "cache_first") || "cache_first",
          parserMode: cleanText(cachedContract.meta && cachedContract.meta.parserMode || "cache_contract") || "cache_contract",
          contentType: cleanText(cachedContract.meta && cachedContract.meta.contentType || "cached") || "cached",
          resolvedUrl: cleanText(cachedContract.meta && cachedContract.meta.resolvedUrl || "") || "",
          attemptedUrls: [],
          sample: "",
          detail: cacheFresh ? "cache_contract_hit" : "stale_while_refresh_served",
          feedUrl: cleanText(cachedContract.meta && cachedContract.meta.feedUrl || resolveNewsCanadaFeedUrl()),
          fetchedAt: Number(cachedContract.meta && cachedContract.meta.fetchedAt || now()),
          itemCount: cachedItems.length,
          cacheContractPath: cleanText(cachedContract.meta && cachedContract.meta.cacheContractPath || "") || "",
          cacheContractCandidates: getNewsCanadaCacheContractPaths(),
          contractVersion: "newscanada-rss-service-v17-transport-hardened",
          stage: cacheFresh ? "cache_contract_hit" : "stale_while_refresh_served"
        }
      };
    }

    const fetchTimeoutMs = clamp(Number(process.env.NEWS_CANADA_DIRECT_FETCH_TIMEOUT_MS || 15000), 5000, 30000);

    logNewsCanadaTrace(trace, "fetch_start", {
      sourceOfTruth: resolveNewsCanadaFeedUrl(),
      strictLive: true,
      allowFallbackSeed: false,
      preferFreshCache: false,
      routeMode: "inline_direct_truth",
      fetchTimeoutMs
    });

    const result = await fetchNewsCanadaRssDirect({
      feedUrl: resolveNewsCanadaFeedUrl(),
      refresh: trace.refresh,
      strictLive: true,
      allowFallbackSeed: false,
      preferFreshCache: false,
      timeoutMs: fetchTimeoutMs,
      retryCount: clamp(Number(process.env.NEWS_CANADA_FETCH_RETRIES || 0), 0, 2),
      retryBaseMs: clamp(Number(process.env.NEWS_CANADA_FETCH_RETRY_BASE_MS || 400), 100, 1500)
    });

    const rawItems = Array.isArray(result && result.items) ? result.items : [];
    const hasSyntheticPayload = isNewsCanadaSeedPayload(result);
    const items = hasSyntheticPayload ? [] : rawItems.filter(Boolean);
    const ok = !!(result && result.ok !== false && items.length);

    logNewsCanadaTrace(trace, "fetch_complete", {
      upstreamOk: !!(result && result.ok !== false),
      rawItemCount: rawItems.length,
      validItemCount: items.length,
      syntheticPayloadRejected: hasSyntheticPayload,
      source: cleanText(result && result.meta && result.meta.source || "rss_unavailable") || "rss_unavailable",
      parserMode: cleanText(result && result.meta && result.meta.parserMode || "live_empty") || "live_empty",
      resolvedUrl: cleanText(result && result.meta && result.meta.resolvedUrl || "") || "",
      detail: cleanText(result && result.meta && result.meta.detail || ""),
      attemptedUrlCount: Array.isArray(result && result.meta && result.meta.attemptedUrls) ? result.meta.attemptedUrls.length : 0,
      stage: cleanText(result && result.meta && result.meta.stage || "")
    });

    return {
      ok,
      traceId: trace.traceId,
      route: "/api/newscanada/rss",
      items,
      meta: {
        v: PUBLIC_INDEX_VERSION,
        t: now(),
        traceId: trace.traceId,
        source: cleanText(result && result.meta && result.meta.source || (ok ? "rss_direct_truth" : "rss_unavailable")) || "rss_unavailable",
        degraded: !!(result && result.meta && result.meta.degraded) || !ok,
        mode: cleanText(result && result.meta && result.meta.mode || "rss") || "rss",
        parserMode: cleanText(result && result.meta && result.meta.parserMode || (ok ? "rss_payload" : "live_empty")) || "live_empty",
        contentType: cleanText(result && result.meta && result.meta.contentType || "") || "",
        resolvedUrl: cleanText(result && result.meta && result.meta.resolvedUrl || "") || "",
        attemptedUrls: Array.isArray(result && result.meta && result.meta.attemptedUrls) ? result.meta.attemptedUrls.slice(0, 12) : [],
        sample: cleanText(result && result.meta && result.meta.sample || ""),
        detail: cleanText(result && result.meta && result.meta.detail || (hasSyntheticPayload ? "synthetic_payload_rejected" : (!items.length ? "no_real_stories_available" : ""))),
        feedUrl: cleanText(result && result.meta && result.meta.feedUrl || resolveNewsCanadaFeedUrl()),
        fetchedAt: Number(result && result.meta && result.meta.fetchedAt || now()),
        itemCount: items.length,
        cacheContractPath: cleanText(result && result.meta && result.meta.cacheContractPath || "") || "",
        cacheContractCandidates: Array.isArray(result && result.meta && result.meta.cacheContractCandidates) ? result.meta.cacheContractCandidates.slice(0, 8) : getNewsCanadaCacheContractPaths(),
        contractVersion: "newscanada-rss-service-v17-transport-hardened",
        stage: cleanText(result && result.meta && result.meta.stage || "") || ""
      }
    };
  } catch (err) {
    logNewsCanadaTrace(trace, "fetch_error", {
      detail: cleanText(err && (err.message || err.code || "rss_fetch_failed"))
    });
    return {
      ok: false,
      traceId: trace.traceId,
      route: "/api/newscanada/rss",
      items: [],
      meta: {
        v: PUBLIC_INDEX_VERSION,
        t: now(),
        traceId: trace.traceId,
        source: "rss_route_error",
        degraded: true,
        mode: "rss",
        parserMode: "live_empty",
        contentType: "",
        resolvedUrl: "",
        attemptedUrls: [],
        sample: "",
        detail: cleanText(err && (err.message || err.code || "rss_fetch_failed")),
        feedUrl: resolveNewsCanadaFeedUrl(),
        fetchedAt: now(),
        itemCount: 0,
        cacheContractPath: "",
        cacheContractCandidates: getNewsCanadaCacheContractPaths(),
        contractVersion: "newscanada-rss-service-v17-transport-hardened"
      }
    };
  }
}
function wantsNewsCanadaLegacyArray(req) {
  const format = lower(req.query && req.query.format);
  const accept = lower(req.headers && req.headers.accept);
  return format === "array" || accept.includes("application/vnd.sandblast.newscanada.array+json");
}

const NEWS_CANADA_COMPAT_ALIASES = Object.freeze({
  foryourlife: {
    aliases: ["/foryourlife", "/for-your-life", "/api/foryourlife", "/api/for-your-life"],
    slot: "for-your-life",
    label: "For Your Life"
  },
  editorspick: {
    aliases: ["/editorspick", "/editors-pick", "/editorspicks", "/editor-picks", "/api/editorspick", "/api/editors-pick", "/api/editorspicks", "/api/editor-picks"],
    slot: "editors-pick",
    label: "Editor's Pick"
  },
  topstory: {
    aliases: ["/topstory", "/top-story", "/api/topstory", "/api/top-story"],
    slot: "top-story",
    label: "Top Story"
  }
});

function buildNewsCanadaRouteHints() {
  return {
    rss: "/api/newscanada/rss",
    manualCompat: "/api/newscanada/manual",
    editorsPicks: "/api/newscanada/editors-picks",
    editorsPicksMeta: "/api/newscanada/editors-picks/meta",
    story: "/api/newscanada/story",
    refresh: "/api/newscanada/rss",
    diagnostics: "/api/newscanada/diagnostics",
    aliases: {
      foryourlife: NEWS_CANADA_COMPAT_ALIASES.foryourlife.aliases,
      editorspick: NEWS_CANADA_COMPAT_ALIASES.editorspick.aliases,
      topstory: NEWS_CANADA_COMPAT_ALIASES.topstory.aliases
    }
  };
}

async function getNewsCanadaCompatAliasResponse(req, aliasConfig) {
  const out = await getNewsCanadaEditorsPicksResponse(req);
  return {
    ...out,
    route: cleanText(req.originalUrl || req.path || ""),
    compatibilityAlias: true,
    requestedSlot: cleanText(aliasConfig && aliasConfig.slot || ""),
    requestedLabel: cleanText(aliasConfig && aliasConfig.label || ""),
    meta: {
      ...(isObj(out.meta) ? out.meta : {}),
      compatibilityAlias: true,
      aliasTarget: "/api/newscanada/editors-picks",
      requestedSlot: cleanText(aliasConfig && aliasConfig.slot || ""),
      requestedLabel: cleanText(aliasConfig && aliasConfig.label || "")
    }
  };
}

function installNewsCanadaCompatAliases() {
  Object.values(NEWS_CANADA_COMPAT_ALIASES).forEach((aliasConfig) => {
    app.get(aliasConfig.aliases, async (req, res) => {
      applyCors(req, res);
      const out = await getNewsCanadaCompatAliasResponse(req, aliasConfig);
      res.setHeader("x-sb-newscanada-source", cleanText(out.meta && out.meta.source || "rss_service") || "rss_service");
      res.setHeader("x-sb-newscanada-degraded", out.meta && out.meta.degraded ? "1" : "0");
      res.setHeader("x-sb-newscanada-shape", wantsNewsCanadaLegacyArray(req) ? "array" : "object");
      res.setHeader("x-sb-newscanada-alias", cleanText(aliasConfig.slot || "compat"));
      if (wantsNewsCanadaLegacyArray(req)) {
        return res.status(out.ok ? 200 : 503).json(out.slides || out.stories || []);
      }
      return res.status(200).json(out);
    });
  });
}

if (boolEnv("SB_ENABLE_NEWSCANADA_COMPAT_ALIASES", false)) installNewsCanadaCompatAliases();

app.get(["/api/newscanada/rss", "/newscanada/rss"], async (req, res) => {
  applyCors(req, res);
  const out = await getNewsCanadaRssResponse(req);
  const traceId = cleanText(out && (out.traceId || out.meta && out.meta.traceId) || req.sbTraceId || makeTraceId("newscanada"));
  res.setHeader("x-sb-trace-id", traceId);
  res.setHeader("x-sb-newscanada-trace", traceId);
  res.setHeader("x-sb-newscanada-source", cleanText(out.meta && out.meta.source || "rss_service") || "rss_service");
  res.setHeader("x-sb-newscanada-degraded", out.meta && out.meta.degraded ? "1" : "0");
  res.setHeader("x-sb-newscanada-shape", "object");
  res.setHeader("x-sb-newscanada-timeout-ms", String(clamp(Number(process.env.NEWS_CANADA_DIRECT_FETCH_TIMEOUT_MS || process.env.NEWS_CANADA_RSS_TIMEOUT_MS || 15000), 1000, 45000)));
  res.setHeader("x-sb-newscanada-ok", out && out.ok ? "1" : "0");
  logNewsCanadaTrace({ traceId, route: cleanText(req.originalUrl || req.url || "/api/newscanada/rss") || "/api/newscanada/rss", startedAt: now() }, "response_sent", {
    status: 200,
    source: cleanText(out.meta && out.meta.source || "rss_service") || "rss_service",
    itemCount: Number(out.meta && out.meta.itemCount || (Array.isArray(out.items) ? out.items.length : 0)),
    degraded: !!(out.meta && out.meta.degraded)
  });
  return res.status(out.ok ? 200 : 503).json(out);
});


function publicBoolean(value) {
  return value === true;
}

function summarizeTtsPublicHealth(health) {
  const h = safeObj(health);
  const env = safeObj(h.env);
  const integrity = safeObj(h.voiceIntegrity);
  const configured = h.configured === true || env.hasToken === true || integrity.configured === true;
  const provider = cleanText(h.provider || (configured ? "configured" : ""));
  const circuitOpen = h.circuitOpen === true;
  return {
    ok: h.ok !== false && configured && !circuitOpen,
    configured: !!configured,
    provider: provider || "unavailable",
    ready: h.ok !== false && configured && !circuitOpen,
    degraded: circuitOpen || h.degraded === true
  };
}

function summarizeNewsCanadaPublicHealth(health) {
  const h = safeObj(health);
  return {
    ok: h.ok === true,
    degraded: h.degraded === true,
    mode: cleanText(h.mode || "rss"),
    storyCount: Number.isFinite(Number(h.storyCount || h.itemCount)) ? Number(h.storyCount || h.itemCount) : 0
  };
}

function summarizeMusicPublicHealth() {
  return {
    bridgeEnabled: !!musicBridgeHandlerFromModule(musicLaneMod),
    degraded: !!(app.locals.musicMeta && app.locals.musicMeta.degraded),
    availableMoments: Array.isArray(app.locals.musicTopMoments) ? app.locals.musicTopMoments.length : 0
  };
}

function summarizeMarionRuntimePublicHealth() {
  const s = safeObj(getPublicMarionRuntimeSummary());
  return {
    ready: !!(s.ready || s.marionBridgeReady || s.marionBridgeLoaded),
    chatReady: !!(s.chatReady || s.chatEngineLoaded),
    lingoSentinelReady: !!(s.lingoSentinelReady || s.lingoSentinelGatewayLoaded),
    diagnosticsRedacted: true
  };
}

function buildPublicHealthPayload(req) {
  const ttsHealth = ttsHealthFromModule(ttsMod);
  let tts = null;
  try { tts = ttsHealth ? ttsHealth() : null; } catch (_) {}
  let newsHealth = null;
  try {
    newsHealth = newsCanadaFeedService && typeof newsCanadaFeedService.health === "function"
      ? newsCanadaFeedService.health()
      : null;
  } catch (_) {}

  return {
    ok: true,
    version: PUBLIC_INDEX_VERSION,
    traceId: cleanText(req && (req.sbTraceId || (req.headers && req.headers["x-sb-trace-id"])) || makeTraceId("health")),
    upMs: now() - SERVER_BOOT_AT,
    tts: summarizeTtsPublicHealth(tts),
    marionRuntime: summarizeMarionRuntimePublicHealth(),
    voiceRouteEnabled: !!CFG.voiceRouteEnabled,
    auth: {
      tokenConfigured: !!CFG.apiToken,
      protected: !!CFG.apiToken
    },
    backendPublicBase: getBackendPublicBase(),
    audioContract: {
      version: "audio-first-v1",
      ready: !!ttsHandlerFromModule(ttsMod)
    },
    newsCanada: summarizeNewsCanadaPublicHealth(newsHealth),
    music: summarizeMusicPublicHealth()
  };
}

app.get(["/api/newscanada/diagnostics", "/newscanada/diagnostics"], async (req, res) => {
  applyCors(req, res);
  let health = null;
  try {
    health = newsCanadaFeedService && typeof newsCanadaFeedService.health === "function"
      ? await Promise.resolve(newsCanadaFeedService.health())
      : null;
  } catch (_) {
    health = { ok: false, degraded: true, mode: "rss", storyCount: 0 };
  }

  return res.status(200).json({
    ok: !!newsCanadaFeedService,
    route: "/api/newscanada/diagnostics",
    serviceReady: !!(newsCanadaFeedService && typeof newsCanadaFeedService.fetchRSS === "function"),
    health: summarizeNewsCanadaPublicHealth(health),
    diagnosticsRedacted: true,
    meta: { v: PUBLIC_INDEX_VERSION, t: now() }
  });
});



app.get(["/api/newscanada/manual", "/newscanada/manual"], async (req, res) => {
  applyCors(req, res);
  return res.status(410).json({
    ok: false,
    route: "/api/newscanada/manual",
    items: [],
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      source: "manual_route_disabled",
      degraded: true,
      mode: "rss",
      parserMode: "manual_disabled",
      detail: "manual_route_disabled_use_api_newscanada_rss"
    }
  });
});

app.get(["/api/newscanada/editors-picks", "/newscanada/editors-picks"], async (req, res) => {
  applyCors(req, res);
  const out = await getNewsCanadaEditorsPicksResponse(req);
  res.setHeader("x-sb-newscanada-source", cleanText(out.meta && out.meta.source || "rss_service") || "rss_service");
  res.setHeader("x-sb-newscanada-degraded", out.meta && out.meta.degraded ? "1" : "0");
  if (wantsNewsCanadaLegacyArray(req)) {
    res.setHeader("x-sb-newscanada-shape", "array");
    return res.status(out.ok ? 200 : 503).json(out.slides || out.stories || []);
  }
  res.setHeader("x-sb-newscanada-shape", "object");
  return res.status(out.ok ? 200 : 503).json(out);
});

app.get(["/api/newscanada/editors-picks/meta", "/newscanada/editors-picks/meta"], async (req, res) => {
  applyCors(req, res);
  res.setHeader("x-sb-newscanada-shape", "object");
  return res.status(200).json(await getNewsCanadaEditorsPicksResponse(req));
});

app.get(["/api/newscanada/story", "/newscanada/story"], async (req, res) => {
  applyCors(req, res);
  const out = await getNewsCanadaStoryResponse(req);
  return res.status(out.ok ? 200 : 404).json(out);
});

const MUSIC_TOP_MOMENTS_LIMIT = clamp(Number(process.env.MUSIC_TOP_MOMENTS_LIMIT || 10), 3, 25);
const MUSIC_REFRESH_MS = clamp(Number(process.env.MUSIC_REFRESH_MS || 5 * 60 * 1000), 30000, 60 * 60 * 1000);
const MUSIC_DATA_FILE_CANDIDATES = uniq([
  cleanText(process.env.MUSIC_DATA_FILE || process.env.SB_MUSIC_DATA_FILE || ""),
  path.join(__dirname, "data", "music", "music-top-moments.json"),
  path.join(__dirname, "Data", "music", "music-top-moments.json"),
  path.join(process.cwd(), "data", "music", "music-top-moments.json"),
  path.join(process.cwd(), "Data", "music", "music-top-moments.json"),
  path.join(process.cwd(), "backend", "data", "music", "music-top-moments.json"),
  path.join(process.cwd(), "backend", "Data", "music", "music-top-moments.json")
].filter(Boolean));

function resolveMusicDataFile() {
  const candidates = Array.isArray(MUSIC_DATA_FILE_CANDIDATES) ? MUSIC_DATA_FILE_CANDIDATES : [];
  return cleanText(candidates.find((file) => {
    try { return !!(file && fs.existsSync(file)); } catch (_) { return false; }
  }) || candidates[0] || "");
}

function buildStaticMusicFallback() {
  return [
    { id: "music-1", rank: 1, title: "Top 10 Music Moment One", summary: "Fallback music moment while live sources are being restored.", source: "Sandblast Music", url: "", category: "Music" },
    { id: "music-2", rank: 2, title: "Top 10 Music Moment Two", summary: "Fallback music source contract keeps the music panel alive.", source: "Sandblast Music", url: "", category: "Music" },
    { id: "music-3", rank: 3, title: "Top 10 Music Moment Three", summary: "Music routing remains stable even when upstream files are unavailable.", source: "Sandblast Music", url: "", category: "Music" }
  ];
}

function normalizeMusicMoment(entry, index) {
  const raw = isObj(entry) ? entry : {};
  const title = cleanText(raw.title || raw.name || raw.headline || raw.label || "");
  if (!title) return null;
  return {
    id: cleanText(raw.id || raw.slug || `music-${index || 0}`) || `music-${index || 0}`,
    rank: clamp(Number(raw.rank || index + 1 || 1), 1, 999),
    title,
    summary: cleanText(raw.summary || raw.description || raw.excerpt || raw.body || "") || title,
    source: cleanText(raw.source || raw.provider || raw.outlet || "Sandblast Music") || "Sandblast Music",
    url: cleanText(raw.url || raw.href || raw.link || ""),
    category: cleanText(raw.category || raw.section || "Music") || "Music",
    image: cleanText(raw.image || raw.thumbnail || "") || "",
    publishedAt: cleanText(raw.publishedAt || raw.date || "") || ""
  };
}

function promoteMusicData(items, source, extraMeta) {
  const list = (Array.isArray(items) ? items : []).map(normalizeMusicMoment).filter(Boolean).slice(0, MUSIC_TOP_MOMENTS_LIMIT);
  const metaPatch = isObj(extraMeta) ? extraMeta : {};
  app.locals.musicTopMoments = list.length ? list : buildStaticMusicFallback();
  app.locals.musicSources = uniq(app.locals.musicTopMoments.map((item) => cleanText(item.source)).filter(Boolean));
  app.locals.musicMeta = {
    ...(isObj(app.locals.musicMeta) ? app.locals.musicMeta : {}),
    ...metaPatch,
    ok: app.locals.musicTopMoments.length > 0,
    file: cleanText(metaPatch.file || app.locals.musicMeta?.file || resolveMusicDataFile() || "") || "",
    count: app.locals.musicTopMoments.length,
    loadedAt: now(),
    source: cleanText(source || metaPatch.source || "music_runtime") || "music_runtime",
    degraded: !!metaPatch.degraded
  };
  return app.locals.musicTopMoments;
}

function loadMusicFromDisk(forceReload) {
  const shouldReload = !!forceReload || !Array.isArray(app.locals.musicTopMoments) || !app.locals.musicTopMoments.length;
  if (!shouldReload && Array.isArray(app.locals.musicTopMoments) && app.locals.musicTopMoments.length) return app.locals.musicTopMoments;
  const file = resolveMusicDataFile();
  if (!file) return promoteMusicData(buildStaticMusicFallback(), "music_fallback", { degraded: true, file: "" });
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed.moments) ? parsed.moments : Array.isArray(parsed.topMoments) ? parsed.topMoments : [];
    return promoteMusicData(list, "music_disk_feed", { degraded: !list.length, file });
  } catch (err) {
    console.log("[Sandblast][music:load:error]", cleanText(err && (err.message || err) || "music_load_failed"));
    return promoteMusicData(buildStaticMusicFallback(), "music_fallback", { degraded: true, file, error: cleanText(err && (err.message || err) || "music_load_failed") || "music_load_failed" });
  }
}

function buildMusicResponse(req) {
  const forceReload = !!(req && req.query && req.query.refresh === "1");
  const items = loadMusicFromDisk(forceReload);
  return {
    ok: Array.isArray(items) && items.length > 0,
    route: "/api/music/top-moments",
    count: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items) ? items : [],
    sources: Array.isArray(app.locals.musicSources) ? app.locals.musicSources : [],
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      file: app.locals.musicMeta?.file || resolveMusicDataFile(),
      source: app.locals.musicMeta?.source || "music_runtime",
      degraded: !!app.locals.musicMeta?.degraded,
      refreshMs: MUSIC_REFRESH_MS,
      limit: MUSIC_TOP_MOMENTS_LIMIT
    }
  };
}

app.get(["/api/music/top-moments", "/music/top-moments"], (req, res) => {
  applyCors(req, res);
  return res.status(200).json(buildMusicResponse(req));
});

app.get(["/api/music/sources", "/music/sources"], (req, res) => {
  applyCors(req, res);
  const out = buildMusicResponse(req);
  return res.status(200).json({ ok: true, sources: out.sources, count: out.sources.length, meta: out.meta });
});


function musicBridgeHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.handleBridgeRequest === "function") return mod.handleBridgeRequest.bind(mod);
  if (typeof mod.handleChat === "function") {
    return async function bridgeFromHandleChat(body) {
      const src = isObj(body) ? body : {};
      const out = await Promise.resolve(mod.handleChat({
        text: cleanText(src.text || ""),
        session: isObj(src.session) ? src.session : {},
        visitorId: cleanText(src.visitorId || ""),
        debug: !!src.debug,
        year: cleanText(src.year || ""),
        mode: cleanText(src.mode || ""),
        action: cleanText(src.action || ""),
        payload: isObj(src.payload) ? src.payload : {}
      }));
      return isObj(out) ? out : { ok: false, error: "music_bridge_invalid_response" };
    };
  }
  return null;
}

function musicResolverHandlerFromModule(mod) {
  if (!mod) return null;
  if (typeof mod.resolveMusicIntent === "function") return mod.resolveMusicIntent.bind(mod);
  if (typeof mod.resolve === "function") return mod.resolve.bind(mod);
  return null;
}

function musicKnowledgeCapabilitiesFromModule(mod) {
  if (!mod) return null;
  try {
    if (typeof mod.getCapabilities === "function") {
      const out = mod.getCapabilities();
      return isObj(out) ? out : null;
    }
  } catch (_) {}
  return null;
}

function normalizeMusicBridgeInput(req) {
  const norm = normalizePayload(req);
  const body = isObj(req.body) ? req.body : {};
  const query = isObj(req.query) ? req.query : {};
  const payload = isObj(body.payload) ? body.payload : {};
  const session = isObj(body.session) ? body.session : (isObj(payload.session) ? payload.session : {});
  return {
    text: cleanText(body.text || query.text || payload.text || norm.text || ""),
    session,
    visitorId: cleanText(body.visitorId || payload.visitorId || getSessionId(req)),
    debug: body.debug === true || payload.debug === true || String((req.query && req.query.debug) || "") === "1",
    traceId: norm.traceId,
    lane: "music",
    route: cleanText(body.route || query.route || payload.route || "music"),
    action: cleanText(body.action || query.action || payload.action || ""),
    year: cleanText(body.year || query.year || payload.year || norm.year || ""),
    mode: cleanText(body.mode || query.mode || payload.mode || norm.mode || ""),
    chart: cleanText(body.chart || query.chart || payload.chart || ""),
    payload
  };
}

function normalizeMusicFollowUps(rawFollowUps) {
  const followUps = Array.isArray(rawFollowUps) ? rawFollowUps : [];
  const followUpObjects = followUps.map((it, idx) => {
    if (typeof it === "string") {
      return {
        id: `fu_${idx + 1}`,
        type: "action",
        label: it,
        send: it,
        payload: { action: it, lane: "music", route: "music" }
      };
    }
    const label = cleanText(it && (it.label || it.send || it.text) || "");
    return {
      id: cleanText(it && it.id || `fu_${idx + 1}`) || `fu_${idx + 1}`,
      type: cleanText(it && it.type || "action") || "action",
      label,
      send: cleanText(it && (it.send || label) || label) || label,
      payload: isObj(it && it.payload) ? it.payload : {
        action: cleanText(it && (it.send || label) || label) || label,
        lane: "music",
        route: "music"
      }
    };
  }).filter((it) => cleanText(it.label));
  return {
    followUps,
    followUpObjects,
    followUpsStrings: followUpObjects.map((it) => cleanText(it.send || it.label)).filter(Boolean)
  };
}

function buildMusicBridgeFailure(input, opts) {
  const o = isObj(opts) ? opts : {};
  const sessionPatch = isObj(o.sessionPatch) ? o.sessionPatch : {};
  const year = cleanText(o.year || input.year || sessionPatch.lastMusicYear || sessionPatch.year || "") || null;
  const mode = cleanText(o.mode || input.mode || input.action || sessionPatch.activeMusicMode || sessionPatch.mode || "") || null;
  const reason = cleanText(o.reason || "music_bridge_invalid_contract") || "music_bridge_invalid_contract";
  const status = cleanText(o.status || "blocked") || "blocked";
  const executable = !!o.executable;
  const needsYear = !!o.needsYear;
  const follow = normalizeMusicFollowUps(o.followUps || []);
  return {
    ok: false,
    reply: cleanReplyForUser(o.reply || "I could not retrieve verified music data for that request."),
    text: cleanReplyForUser(o.reply || "I could not retrieve verified music data for that request."),
    status,
    executable,
    needsYear,
    followUps: follow.followUps,
    followUpsStrings: follow.followUpsStrings,
    followUpObjects: follow.followUpObjects,
    sessionPatch,
    bridge: {
      ready: status === "execute",
      valid: status === "execute" || status === "clarify",
      lane: "music",
      year,
      mode,
      endpoint: "/api/music/bridge",
      capabilityMode: cleanText(o.capabilityMode || "none") || "none",
      sourceTruth: cleanText(o.sourceTruth || "unknown") || "unknown",
      routeSource: cleanText(o.routeSource || "unknown") || "unknown",
      executable,
      reason
    }
  };
}

function normalizeMusicBridgeResponse(result, req, startedAt, input) {
  const raw = isObj(result) ? result : {};
  const text = cleanText(raw.reply || raw.text || raw.message || "");
  const sessionPatch = isObj(raw.sessionPatch) ? raw.sessionPatch : {};
  const status = cleanText(raw.status || (raw.bridge && raw.bridge.ready === true ? "execute" : "")) || "blocked";
  const executable = raw.executable === true || (status === "execute" && raw.ok !== false);
  const needsYear = raw.needsYear === true;
  const follow = normalizeMusicFollowUps(raw.followUpObjects || raw.followUps || raw.followUpsStrings || []);
  const bridge = isObj(raw.bridge) ? {
    ready: raw.bridge.ready === true,
    valid: raw.bridge.valid === true,
    lane: cleanText(raw.bridge.lane || "music") || "music",
    year: raw.bridge.year != null ? raw.bridge.year : (sessionPatch.lastMusicYear || sessionPatch.year || input.year || null),
    mode: cleanText(raw.bridge.mode || sessionPatch.activeMusicMode || sessionPatch.mode || input.mode || input.action || "") || null,
    endpoint: "/api/music/bridge",
    capabilityMode: cleanText(raw.bridge.capabilityMode || "none") || "none",
    sourceTruth: cleanText(raw.bridge.sourceTruth || "unknown") || "unknown",
    routeSource: cleanText(raw.bridge.routeSource || "unknown") || "unknown",
    executable: raw.bridge.executable === true || executable,
    reason: cleanText(raw.bridge.reason || "")
  } : {
    ready: status === "execute",
    valid: status === "execute" || status === "clarify",
    lane: "music",
    year: sessionPatch.lastMusicYear || sessionPatch.year || input.year || null,
    mode: cleanText(sessionPatch.activeMusicMode || sessionPatch.mode || input.mode || input.action || "") || null,
    endpoint: "/api/music/bridge",
    capabilityMode: cleanText(raw.capabilityMode || "none") || "none",
    sourceTruth: cleanText(raw.sourceTruth || "unknown") || "unknown",
    routeSource: cleanText(raw.routeSource || "unknown") || "unknown",
    executable,
    reason: cleanText(raw.reason || "")
  };

  const strictExecute = !!(bridge.valid === true && bridge.ready === true && status === "execute" && executable === true && text);
  if (!strictExecute) {
    const failed = buildMusicBridgeFailure(input, {
      reply: raw.reply || raw.text || raw.message || "I could not retrieve verified music data for that request.",
      status: needsYear ? "clarify" : status,
      executable,
      needsYear,
      followUps: follow.followUps,
      sessionPatch,
      year: bridge.year,
      mode: bridge.mode,
      capabilityMode: bridge.capabilityMode,
      sourceTruth: bridge.sourceTruth,
      routeSource: bridge.routeSource,
      reason: bridge.reason || (needsYear ? "missing_year" : "invalid_execute_contract")
    });
    return {
      ...failed,
      traceId: cleanText((req.headers && req.headers["x-sb-trace-id"]) || raw.traceId || makeTraceId("musicbridge")),
      meta: {
        v: PUBLIC_INDEX_VERSION,
        t: now(),
        latencyMs: now() - Number(startedAt || now()),
        source: raw.meta && raw.meta.source ? raw.meta.source : "music_lane_bridge",
        degraded: true,
        bridgeMounted: !!musicBridgeHandlerFromModule(musicLaneMod),
        endpoint: "/api/music/bridge"
      }
    };
  }

  return {
    ok: true,
    reply: text,
    text,
    status,
    executable: true,
    needsYear: false,
    followUps: follow.followUps,
    followUpsStrings: follow.followUpsStrings,
    followUpObjects: follow.followUpObjects,
    sessionPatch,
    bridge,
    traceId: cleanText((req.headers && req.headers["x-sb-trace-id"]) || raw.traceId || makeTraceId("musicbridge")),
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      latencyMs: now() - Number(startedAt || now()),
      source: raw.meta && raw.meta.source ? raw.meta.source : "music_lane_bridge",
      degraded: !!raw.degraded,
      bridgeMounted: !!musicBridgeHandlerFromModule(musicLaneMod),
      endpoint: "/api/music/bridge"
    }
  };
}

async function dispatchMusicBridge(req, res) {
  const handler = musicBridgeHandlerFromModule(musicLaneMod);
  const resolver = musicResolverHandlerFromModule(musicResolverMod);
  const capabilities = musicKnowledgeCapabilitiesFromModule(musicKnowledgeMod);
  if (!handler && !resolver) {
    return res.status(503).json({
      ok: false,
      error: "music_bridge_unavailable",
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("musicbridge")),
      meta: { v: PUBLIC_INDEX_VERSION, t: now(), endpoint: "/api/music/bridge", mounted: false }
    });
  }

  const startedAt = now();
  const input = normalizeMusicBridgeInput(req);
  try {
    let resolverOut = null;
    if (resolver) {
      resolverOut = await callWithTimeout(Promise.resolve(resolver({
        text: input.text,
        action: input.action,
        payload: isObj(input.payload) ? input.payload : {},
        session: isObj(input.session) ? input.session : {},
        year: input.year ? Number(input.year) : null,
        capabilities,
        route: input.route,
        lane: "music"
      })), CFG.requestTimeoutMs, "music_resolver");
    }

    if (isObj(resolverOut)) {
      const normalizedResolver = normalizeMusicBridgeResponse(resolverOut, req, startedAt, input);
      if (cleanText(normalizedResolver.status) === "clarify" || cleanText(normalizedResolver.status) === "blocked") {
        return res.status(200).json(normalizedResolver);
      }
      if (!(normalizedResolver.bridge && normalizedResolver.bridge.ready === true && normalizedResolver.bridge.valid === true && normalizedResolver.status === "execute")) {
        return res.status(200).json(buildMusicBridgeFailure(input, {
          reply: "Music route was resolved, but no valid execute contract was produced.",
          status: "blocked",
          executable: false,
          needsYear: false,
          followUps: normalizedResolver.followUpObjects,
          sessionPatch: normalizedResolver.sessionPatch,
          year: normalizedResolver.bridge && normalizedResolver.bridge.year,
          mode: normalizedResolver.bridge && normalizedResolver.bridge.mode,
          capabilityMode: normalizedResolver.bridge && normalizedResolver.bridge.capabilityMode,
          sourceTruth: normalizedResolver.bridge && normalizedResolver.bridge.sourceTruth,
          routeSource: normalizedResolver.bridge && normalizedResolver.bridge.routeSource,
          reason: "resolver_missing_execute_contract"
        }));
      }
      input.action = cleanText(resolverOut.action || input.action || "");
      input.year = cleanText(resolverOut.year || input.year || "");
      input.mode = cleanText((resolverOut.bridge && resolverOut.bridge.mode) || resolverOut.action || input.mode || "");
      input.session = {
        ...(isObj(input.session) ? input.session : {}),
        ...(isObj(resolverOut.sessionPatch) ? resolverOut.sessionPatch : {})
      };
    }

    if (!handler) {
      return res.status(200).json(buildMusicBridgeFailure(input, {
        reply: "Music resolver is present, but no execution handler is mounted.",
        status: "blocked",
        executable: false,
        needsYear: false,
        sessionPatch: isObj(resolverOut && resolverOut.sessionPatch) ? resolverOut.sessionPatch : {},
        year: resolverOut && resolverOut.year,
        mode: resolverOut && resolverOut.action,
        sourceTruth: resolverOut && resolverOut.bridge && resolverOut.bridge.sourceTruth,
        routeSource: resolverOut && resolverOut.bridge && resolverOut.bridge.routeSource,
        capabilityMode: resolverOut && resolverOut.bridge && resolverOut.bridge.capabilityMode,
        reason: "execution_handler_missing"
      }));
    }

    const result = await callWithTimeout(Promise.resolve(handler({
      ...input,
      resolver: isObj(resolverOut) ? resolverOut : null,
      capabilities
    })), CFG.requestTimeoutMs, "music_bridge");
    const out = normalizeMusicBridgeResponse(result, req, startedAt, input);
    return res.status(out.ok ? 200 : 200).json(out);
  } catch (err) {
    console.log("[Sandblast][musicBridge:error]", err && (err.stack || err.message || err));
    const fail = buildMusicBridgeFailure(normalizeMusicBridgeInput(req), {
      reply: "I could not retrieve verified music data for that request.",
      status: "blocked",
      executable: false,
      needsYear: false,
      reason: cleanText(err && (err.message || err) || "music_bridge_failed")
    });
    return res.status(200).json({
      ...fail,
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("musicbridge")),
      meta: { v: PUBLIC_INDEX_VERSION, t: now(), endpoint: "/api/music/bridge", mounted: true }
    });
  }
}

app.get(["/api/music/bridge/health", "/music/bridge/health", "/api/music/bridge/health/", "/music/bridge/health/"], enforceMusicBridgeAccess, (req, res) => {
  applyCors(req, res);
  const music = summarizeMusicPublicHealth();
  return res.status(200).json({
    ok: !!music.bridgeEnabled,
    enabled: !!music.bridgeEnabled,
    degraded: !!music.degraded,
    availableMoments: music.availableMoments,
    diagnosticsRedacted: true,
    version: PUBLIC_INDEX_VERSION,
    meta: { v: PUBLIC_INDEX_VERSION, t: now() }
  });
});

app.all(["/api/music/bridge", "/music/bridge", "/api/music/bridge/", "/music/bridge/"], enforceMusicBridgeAccess, async (req, res) => {
  applyCors(req, res);
  return dispatchMusicBridge(req, res);
});

app.get(["/api/marion/emotion/health", "/api/marion/emotion/health/"], (req, res) => {
  applyCors(req, res);
  const health = getMarionEmotionRuntimeHealth();
  return res.status(health && health.ok ? 200 : 503).json({
    ok: !!(health && health.ok),
    service: "marion-emotion",
    ready: !!(health && health.ok),
    diagnosticsRedacted: true,
    version: PUBLIC_INDEX_VERSION,
    traceId: cleanText(req.sbTraceId || req.headers["x-sb-trace-id"] || makeTraceId("emotionhealth"))
  });
});

app.get("/health", (req, res) => {
  applyCors(req, res);
  return res.status(200).json(buildPublicHealthPayload(req));
});

app.get("/api/health", (req, res) => {
  applyCors(req, res);
  return res.status(200).json(buildPublicHealthPayload(req));
});

app.get(["/api/tts/health", "/tts/health", "/api/tts/health/", "/tts/health/"], enforceVoiceRouteAccess, async (req, res) => {
  hardenCors(req, res);
  const handler = ttsHealthFromModule(ttsMod);
  if (!handler) {
    return res.status(200).json({
      ok: false,
      enabled: false,
      tts: summarizeTtsPublicHealth(null),
      diagnosticsRedacted: true,
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: PUBLIC_INDEX_VERSION, t: now() }
    });
  }
  try {
    const health = await Promise.resolve(handler());
    const tts = summarizeTtsPublicHealth(health);
    return res.status(tts.ok ? 200 : 503).json({
      ok: !!tts.ok,
      enabled: true,
      tts,
      diagnosticsRedacted: true,
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: PUBLIC_INDEX_VERSION, t: now() }
    });
  } catch (_) {
    return res.status(503).json({
      ok: false,
      enabled: true,
      tts: summarizeTtsPublicHealth(null),
      diagnosticsRedacted: true,
      traceId: cleanText(req.headers["x-sb-trace-id"] || makeTraceId("ttshealth")),
      meta: { v: PUBLIC_INDEX_VERSION, t: now() }
    });
  }
});

app.post(["/api/tts", "/tts"], enforceVoiceRouteAccess, async (req, res) => {
  hardenCors(req, res);
  try {
    return await dispatchTts(req, res);
  } catch (err) {
    console.log("[Sandblast][ttsRoute:error]", err && (err.stack || err.message || err));
    if (res.headersSent) return;
    return sendTtsJsonError(req, res, 503, "tts_route_failure", cleanText(err && (err.message || err) || "tts route failed"), {
      configSource: ttsHandlerFromModule(ttsMod) ? "tts_module" : "unavailable",
      ttsModuleBound: !!ttsHandlerFromModule(ttsMod)
    });
  }
});

const CONVERSATION_ROUTE_ALIASES = ["/api/chat", "/api/chat/", "/chat", "/chat/", "/respond", "/respond/"];

function buildConversationSafeErrorReply(norm, status, error, detail, extra) {
  return buildConversationNonFinalPacket(norm, status, error, detail, extra);
}

app.options(CONVERSATION_ROUTE_ALIASES, (req, res) => {
  hardenCors(req, res);
  return res.status(204).end();
});

app.get(CONVERSATION_ROUTE_ALIASES, sendConversationMethodDiagnostic);
app.head(CONVERSATION_ROUTE_ALIASES, (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);
  return res.status(204).end();
});

app.post(CONVERSATION_ROUTE_ALIASES, enforceToken, async (req, res) => {
  hardenCors(req, res);
  hardenConversationNoStore(res);
  try { // CHAT-POST-502-PURGE try
  const startedAt = now();
  const norm = await applyIndexLingoSentinelGatewayToNorm(normalizePayload(req));
  const sessionId = getSessionId(req);
  const resetConversation = shouldResetConversationFromRequest(req, norm.body, norm.payload) || norm.resetConversation === true || norm.clearSession === true;
  if (resetConversation) clearSessionRuntimeState(sessionId);
  norm.resetConversation = !!resetConversation;
  norm.clearSession = !!resetConversation;
  norm.staleCarryBypass = shouldBypassPriorMemoryForCurrentTurn(norm, req);
  norm.languageSphereDirectTranslation = shouldUseLanguageSphereDirectTranslation(norm);
  const priorTurn = (resetConversation || norm.staleCarryBypass) ? null : getLastTurn(sessionId);
  const continuityResolution = resolveShortContinuityFollowupText(norm.text, priorTurn);
  if (continuityResolution.changed) {
    norm.originalText = cleanText(norm.originalText || norm.rawText || norm.userText || norm.message || norm.text);
    norm.rawUserText = cleanText(norm.rawUserText || norm.originalText);
    norm.continuityResolvedOriginalText = continuityResolution.originalText;
    norm.continuityResolvedText = continuityResolution.resolved;
    norm.continuityTopic = continuityResolution.topic;
    norm.shortFollowupContinuityResolved = true;
    norm.text = continuityResolution.resolved;
    norm.query = continuityResolution.resolved;
    norm.userQuery = continuityResolution.resolved;
    norm.message = continuityResolution.resolved;
    norm.effectivePrompt = continuityResolution.resolved;
    norm.finalPrompt = continuityResolution.resolved;
    norm.resolvedQuestion = continuityResolution.resolved;
    norm.resolvedPrompt = continuityResolution.resolved;
    norm.publicUserQuery = continuityResolution.resolved;
  }
  applyContinuityEffectivePromptToNorm(norm, "index.after-short-followup-resolution");
  const trace = {
    traceId: norm.traceId,
    sessionId,
    route: req.originalUrl || req.path || "",
    transportOnly: true,
    marionTransportOnly: true,
    startedAt
  };

  if (!cleanText(norm.text)) {
    let languageSphereBlocked = null;
    try {
      const middleware = getLanguageSphereApiMiddleware();
      if (middleware.mod) {
        languageSphereBlocked = await Promise.resolve(middleware.mod.prepareLanguageSphereForApiChat({
          text: "",
          requestId: norm.traceId,
          sessionId,
          inputSource: norm.inputSource || norm.source || "text",
          targetLanguage: normalizeIndexMiddlewareTargetLanguage(norm)
        }, { indexBridge: true, context: "index-empty-api-chat" }));
      }
    } catch (_) {
      languageSphereBlocked = null;
    }
    return res.status(400).json({
      ok: false,
      error: "empty_text",
      detail: "A message text value is required.",
      traceId: norm.traceId,
      languageSphereBlocked: true,
      languageSphereApplied: false,
      languageSphereFailedSafe: true,
      languageSphere: isObj(languageSphereBlocked && languageSphereBlocked.marionPayload) ? languageSphereBlocked.marionPayload.languageSphere : undefined,
      languageSphereFallback: isObj(languageSphereBlocked && languageSphereBlocked.marionPayload) ? languageSphereBlocked.marionPayload.languageSphereFallback : undefined,
      languageSphereTelemetrySummary: isObj(languageSphereBlocked && languageSphereBlocked.marionPayload) ? languageSphereBlocked.marionPayload.languageSphereTelemetrySummary : undefined,
      authority: { finalAuthority: false, finalAuthorityOwner: "Marion", mayBypassMarion: false, marionBypassBlocked: true },
      meta: { v: PUBLIC_INDEX_VERSION, t: now(), indexRole: "transport_only", transportOnly: true, languageSpherePhase5: true }
    });
  }

  const languageSphereApiMiddlewareResult = await applyLanguageSphereApiMiddlewareToNorm(norm, req, sessionId);
  if (languageSphereApiMiddlewareResult && languageSphereApiMiddlewareResult.blocked) {
    const blocked = isObj(languageSphereApiMiddlewareResult.result && languageSphereApiMiddlewareResult.result.marionPayload)
      ? languageSphereApiMiddlewareResult.result.marionPayload
      : {};
    return res.status(400).json({
      ok: false,
      error: "language_sphere_blocked",
      detail: "LanguageSphere blocked the request before Marion handoff.",
      traceId: norm.traceId,
      ...blocked,
      authority: { finalAuthority: false, finalAuthorityOwner: "Marion", mayBypassMarion: false, marionBypassBlocked: true },
      meta: { v: PUBLIC_INDEX_VERSION, t: now(), indexRole: "transport_only", transportOnly: true, languageSpherePhase5: true }
    });
  }

  const transportKey = buildTransportKey(norm, norm.text, req);
  const transportState = getTransportState(sessionId);
  const priorTransportReplay = transportKey &&
    transportState.key === transportKey &&
    cleanText(transportState.turnId || "") === cleanText(norm.turnId || "") &&
    (startedAt - Number(transportState.at || 0) < CFG.transportReplayCacheMs);
  if (priorTransportReplay && !norm.resetConversation && !norm.staleCarryBypass) {
    const cachedReply = finalizeRenderableReply(transportState.reply || priorTurn && priorTurn.reply || "", norm, "transport_replay_cache", "cached_reply_guard");
    if (isBlockedLoopingSupportReply(cachedReply) || hasUserVisibleDebugLeak(cachedReply) || isPublicWorkflowStateLeak(cachedReply) || isLastMileProgressionIntentText(norm.text)) {
      setTransportState(sessionId, { key: "", turnId: norm.turnId, userHash: replyHash(norm.text), count: 0, finalized: false, route: norm.lane || "general", loopReplyBlocked: true, replayCachePurged: true });
    } else if (cachedReply) {
      const cached = normalizeReplyEnvelope({
        ok: true,
        reply: cachedReply,
        payload: { reply: cachedReply },
        lane: norm.lane || "general",
        laneId: norm.lane || "general",
        sessionLane: norm.lane || "general",
        requestId: makeTraceId("req"),
        traceId: norm.traceId,
        meta: { replyAuthority: cleanText(transportState.authority || priorTurn && priorTurn.replyAuthority || "transport_replay_cache") }
      }, cachedReply, {
        v: PUBLIC_INDEX_VERSION,
        t: now(),
        transportOnly: true,
        marionTransportOnly: true,
        transportDuplicateSuppressed: true,
        duplicateReplyStrategy: "return_cached_final",
        supportDeauthorized: true,
        supportHold: 0,
        latencyMs: now() - startedAt
      });
      cached.voiceRoute = normalizeVoiceRouteResponse(attachVoiceRoute({ reply: cachedReply }).voiceRoute);
      return res.status(200).json(applyPublicReplyHygieneToResponse(cached));
    }
  }
  setTransportState(sessionId, { key: transportKey, turnId: norm.turnId, userHash: replyHash(norm.text), count: 1, finalized: false, route: norm.lane || "general" });

  const languageSphereInput = await normalizeIndexInputForMarion(norm);
  norm.languageSphereInput = languageSphereInput;
  norm.languageSphere = {
    ...(isObj(norm.languageSphere) ? norm.languageSphere : {}),
    input: languageSphereInput,
    indexBridgeVersion: LANGUAGE_SPHERE_INDEX_BRIDGE_VERSION
  };
  if (
    languageSphereInput &&
    languageSphereInput.translatedForRouting === true &&
    cleanText(languageSphereInput.normalizedText) &&
    cleanText(languageSphereInput.normalizedText) !== cleanText(norm.text)
  ) {
    norm.originalText = cleanText(norm.originalText || languageSphereInput.originalText || norm.text);
    norm.text = cleanText(languageSphereInput.normalizedText);
    norm.query = norm.text;
    norm.userQuery = norm.text;
    norm.inputNormalizedForMarion = true;
  }
  applyContinuityEffectivePromptToNorm(norm, "index.after-language-sphere-normalization");

  if (norm.languageSphereDirectTranslation === true) {
    const directLanguageSphereResponse = await buildLanguageSphereDirectTranslationResponse(norm, sessionId, startedAt);
    if (directLanguageSphereResponse && cleanText(directLanguageSphereResponse.reply || directLanguageSphereResponse.text || "")) {
      const directReply = cleanText(directLanguageSphereResponse.reply || directLanguageSphereResponse.text || "");
      setTransportState(sessionId, {
        key: "",
        turnId: norm.turnId,
        reply: directReply,
        replyHash: replyHash(directReply),
        userHash: replyHash(norm.text),
        finalized: true,
        route: norm.lane || "general",
        authority: "languageSphere_index_direct",
        count: 1
      });
      setLastTurn(sessionId, {
        replyHash: replyHash(directReply),
        userHash: replyHash(norm.text),
        lane: norm.lane || "general",
        replyAuthority: "languageSphere_index_direct",
        turnId: norm.turnId,
        route: norm.lane || "general",
        loopStatus: "languageSphere_direct_translation",
        finalized: true,
        userText: cleanText(norm.originalText || norm.text),
        reply: directReply,
        sessionPatch: {},
        memoryPatch: {}
      });
      return res.status(200).json(applyPublicReplyHygieneToResponse(directLanguageSphereResponse));
    }
  }

  applyContinuityEffectivePromptToNorm(norm, "index.before-packet-bridge");
  const effectiveMarionText = continuityEffectivePromptFromNorm(norm);
  const prePacketBridge = norm.staleCarryBypass ? {} : resolveNyxPacketBridge(norm, null, null, priorTurn);
  const prePacketIntent = applyPacketBridgePreclassification(norm, prePacketBridge);

  const marionCommandPacket = marionCommandNormalizerMod && typeof marionCommandNormalizerMod.normalizeCommand === "function"
    ? marionCommandNormalizerMod.normalizeCommand({
        text: effectiveMarionText,
        userQuery: effectiveMarionText,
        query: effectiveMarionText,
        message: effectiveMarionText,
        effectivePrompt: effectiveMarionText,
        finalPrompt: effectiveMarionText,
        resolvedQuestion: cleanText(norm.resolvedQuestion || norm.continuityResolvedText || ""),
        continuityResolvedText: cleanText(norm.continuityResolvedText || ""),
        continuityResolvedOriginalText: cleanText(norm.continuityResolvedOriginalText || ""),
        shortFollowupContinuityResolved: !!norm.shortFollowupContinuityResolved,
        lane: norm.lane,
        sessionId,
        turnId: norm.turnId,
        marionIntent: norm.marionIntent,
        technicalTargetLock: norm.technicalTargetLock,
        technicalFollowUpLock: norm.technicalFollowUpLock,
        blockScheduleInterception: norm.blockScheduleInterception,
        outerSchedulerBypass: norm.outerSchedulerBypass,
        previousMemory: norm.staleCarryBypass ? {} : (isObj(priorTurn) ? priorTurn : {}),
        source: "index_transport_only"
      })
    : null;

  const marionInput = {
    text: effectiveMarionText,
    query: effectiveMarionText,
    userQuery: effectiveMarionText,
    message: effectiveMarionText,
    prompt: effectiveMarionText,
    effectivePrompt: effectiveMarionText,
    finalPrompt: effectiveMarionText,
    resolvedQuestion: cleanText(norm.resolvedQuestion || norm.continuityResolvedText || ""),
    resolvedPrompt: cleanText(norm.resolvedPrompt || norm.continuityResolvedText || ""),
    publicUserQuery: effectiveMarionText,
    lane: norm.lane,
    year: norm.year,
    mode: norm.mode,
    traceId: norm.traceId,
    sessionId,
    turnId: norm.turnId,
    payload: {
      ...(isObj(norm.payload) ? norm.payload : {}),
      text: effectiveMarionText,
      message: effectiveMarionText,
      query: effectiveMarionText,
      userQuery: effectiveMarionText,
      publicUserQuery: effectiveMarionText,
      effectivePrompt: effectiveMarionText,
      finalPrompt: effectiveMarionText,
      resolvedQuestion: cleanText(norm.resolvedQuestion || norm.continuityResolvedText || ""),
      resolvedPrompt: cleanText(norm.resolvedPrompt || norm.continuityResolvedText || ""),
      continuityResolvedText: cleanText(norm.continuityResolvedText || ""),
      continuityResolvedOriginalText: cleanText(norm.continuityResolvedOriginalText || ""),
      continuityTopic: cleanText(norm.continuityTopic || ""),
      shortFollowupContinuityResolved: !!norm.shortFollowupContinuityResolved,
      packetPreclassification: isObj(norm.packetPreclassification) ? norm.packetPreclassification : undefined
    },
    source: norm.source,
    inputSource: norm.inputSource,
    marionIntent: norm.marionIntent,
    routing: norm.marionRouting,
    technicalTargetLock: norm.technicalTargetLock,
    technicalFollowUpLock: norm.technicalFollowUpLock,
    blockScheduleInterception: norm.blockScheduleInterception,
    outerSchedulerBypass: norm.outerSchedulerBypass,
    requestedDomain: norm.domainHint || (norm.marionRouting && norm.marionRouting.domain) || "general",
    intent: (norm.marionIntent && norm.marionIntent.intent) || norm.intentHint || "simple_chat",
    originalText: cleanText(norm.originalText || norm.text),
    rawUserText: cleanText(norm.rawUserText || norm.originalText || norm.text),
    continuityResolvedOriginalText: cleanText(norm.continuityResolvedOriginalText || ""),
    continuityResolvedText: cleanText(norm.continuityResolvedText || ""),
    shortFollowupContinuityResolved: !!norm.shortFollowupContinuityResolved,
    followUpReference: {
      active: !!norm.shortFollowupContinuityResolved,
      topic: cleanText(norm.continuityTopic || ""),
      originalText: cleanText(norm.continuityResolvedOriginalText || ""),
      resolvedText: cleanText(norm.continuityResolvedText || ""),
      previousUserText: cleanText(priorTurn && priorTurn.userText || ""),
      previousReply: cleanText(priorTurn && priorTurn.reply || ""),
      previousRoute: cleanText(priorTurn && (priorTurn.route || priorTurn.lane) || "")
    },
    continuity: {
      active: !!norm.shortFollowupContinuityResolved,
      topic: cleanText(norm.continuityTopic || extractContinuityTopicFromTurn(priorTurn) || ""),
      lastTopic: cleanText(norm.continuityTopic || extractContinuityTopicFromTurn(priorTurn) || ""),
      resolvedFollowup: !!norm.shortFollowupContinuityResolved,
      source: "index.shortFollowupContinuity"
    },
    sourceLanguage: norm.sourceLanguage || "auto",
    targetLanguage: norm.targetLanguage || "",
    outputLanguage: norm.outputLanguage || norm.targetLanguage || "",
    languageSphere: isObj(norm.languageSphere) ? norm.languageSphere : {},
    languageSphereInput: isObj(norm.languageSphereInput) ? norm.languageSphereInput : {},
    languageSphereApiMiddleware: isObj(norm.languageSphereApiMiddleware) ? norm.languageSphereApiMiddleware : {},
    languageSphereLanguageContext: isObj(norm.languageSphereLanguageContext) ? norm.languageSphereLanguageContext : {},
    lingoSentinel: isObj(norm.lingoSentinel) ? norm.lingoSentinel : {},
    languageMeta: isObj(norm.languageMeta) ? norm.languageMeta : {},
    lingoInput: isObj(norm.lingoInput) ? norm.lingoInput : {},
    translationMeta: isObj(norm.translationMeta) ? norm.translationMeta : {},
    glossaryMeta: isObj(norm.glossaryMeta) ? norm.glossaryMeta : {},
    glossaryIntegrity: isObj(norm.glossaryIntegrity) ? norm.glossaryIntegrity : {},
    lingoSentinelGatewayMeta: isObj(norm.lingoSentinelGatewayMeta) ? norm.lingoSentinelGatewayMeta : {},
    lingoSentinelTelemetry: isObj(norm.lingoSentinelTelemetry) ? norm.lingoSentinelTelemetry : {},
    previousMemory: norm.staleCarryBypass ? {} : (isObj(priorTurn) ? priorTurn : {}),
    commandPacket: isObj(marionCommandPacket) ? {
      ...marionCommandPacket,
      text: effectiveMarionText,
      message: effectiveMarionText,
      query: effectiveMarionText,
      userQuery: effectiveMarionText,
      effectivePrompt: effectiveMarionText,
      finalPrompt: effectiveMarionText,
      resolvedQuestion: cleanText(norm.resolvedQuestion || norm.continuityResolvedText || ""),
      continuityResolvedText: cleanText(norm.continuityResolvedText || ""),
      continuityResolvedOriginalText: cleanText(norm.continuityResolvedOriginalText || ""),
      shortFollowupContinuityResolved: !!norm.shortFollowupContinuityResolved
    } : {},
    state: isObj(marionCommandPacket && marionCommandPacket.state) ? marionCommandPacket.state : {},
    session: isObj(norm.body && norm.body.session) ? norm.body.session : {},
    meta: {
      source: "index_transport_only",
      indexRole: "transport_only",
      packetPreclassification: isObj(prePacketIntent) ? prePacketIntent : undefined,
      packetBridgeVersion: cleanText(nyxPackRuntimeAdapterMod && nyxPackRuntimeAdapterMod.ADAPTER_VERSION || ""),
      noSupportDecision: true,
      noEmotionDecision: true,
      normalizerVersion: cleanText(marionCommandNormalizerMod && marionCommandNormalizerMod.VERSION || ""),
      technicalTargetLock: isObj(norm.technicalTargetLock) ? norm.technicalTargetLock : undefined,
      technicalFollowUpLock: !!norm.technicalFollowUpLock,
      blockScheduleInterception: !!norm.blockScheduleInterception,
      outerSchedulerBypass: !!norm.outerSchedulerBypass,
      loopGuardVersion: cleanText(marionLoopGuardMod && marionLoopGuardMod.VERSION || ""),
      finalEnvelopeVersion: cleanText(marionFinalEnvelopeMod && marionFinalEnvelopeMod.VERSION || ""),
      traceId: norm.traceId,
      turnId: norm.turnId,
      originalText: cleanText(norm.originalText || norm.text),
      sourceLanguage: norm.sourceLanguage || "auto",
      targetLanguage: norm.targetLanguage || "",
      languageSphere: isObj(norm.languageSphere) ? norm.languageSphere : {},
      languageSphereInput: isObj(norm.languageSphereInput) ? norm.languageSphereInput : {},
      languageSphereApiMiddleware: isObj(norm.languageSphereApiMiddleware) ? norm.languageSphereApiMiddleware : {},
      languageSphereLanguageContext: isObj(norm.languageSphereLanguageContext) ? norm.languageSphereLanguageContext : {},
      lingoSentinelGatewayIndexVersion: LINGOSENTINEL_GATEWAY_INDEX_VERSION,
      lingoSentinel: isObj(norm.lingoSentinel) ? norm.lingoSentinel : {},
      languageMeta: isObj(norm.languageMeta) ? norm.languageMeta : {},
      translationMeta: isObj(norm.translationMeta) ? norm.translationMeta : {},
      glossaryMeta: isObj(norm.glossaryMeta) ? norm.glossaryMeta : {},
      unknownLanguageAlert: isObj(norm.unknownLanguageAlert) ? norm.unknownLanguageAlert : {},
      scannerHeartbeat: isObj(norm.scannerHeartbeat) ? norm.scannerHeartbeat : {},
      dormantScanner: isObj(norm.dormantScanner) ? norm.dormantScanner : {},
      lingoSentinelGatewayMeta: isObj(norm.lingoSentinelGatewayMeta) ? norm.lingoSentinelGatewayMeta : {},
      inputHash: cleanText(norm.inputHash || ""),
      gatewayHash: cleanText(norm.gatewayHash || ""),
      stableHash: cleanText(norm.stableHash || ""),
      correlationId: cleanText(norm.correlationId || ""),
      traceId: cleanText(norm.traceId || ""),
      notificationReady: !!norm.notificationReady,
      lingoSentinelGatewayAvailable: !!runIndexLingoSentinelGateway,
      resetConversation: !!norm.resetConversation,
      staleCarryBypass: !!norm.staleCarryBypass,
      languageSphereDirectTranslation: !!norm.languageSphereDirectTranslation,
      shortFollowupContinuityResolved: !!norm.shortFollowupContinuityResolved,
      effectivePrompt: effectiveMarionText,
      finalPrompt: effectiveMarionText,
      resolvedQuestion: cleanText(norm.resolvedQuestion || norm.continuityResolvedText || ""),
      continuityHandoffHardlock: !!norm.shortFollowupContinuityResolved,
      continuityTopic: cleanText(norm.continuityTopic || ""),
      continuityResolvedOriginalText: cleanText(norm.continuityResolvedOriginalText || ""),
      continuityResolvedText: cleanText(norm.continuityResolvedText || "")
    }
  };

  let marion = null;
  let engine = null;
  let selected = null;
  let authority = "none";
  let errorDetail = "";
  let loopReplyWasBlocked = false;

  try {
    marion = await callWithTimeout(callMarionBridge(marionInput), CFG.requestTimeoutMs, "marion_bridge");
  } catch (err) {
    errorDetail = cleanText(err && (err.message || err) || "marion_bridge_failed");
    console.log("[Sandblast][chatRoute:marion_transport_error]", { traceId: norm.traceId, error: errorDetail });
  }

  marion = normalizeMarionBridgeResult(marion, marionInput);
  if (marion && !getMarionAuthorityReply(marion)) {
    const promotedFromComposer = await callComposeMarionResponseRuntime(marionInput, marion);
    if (promotedFromComposer && getMarionAuthorityReply(promotedFromComposer)) {
      marion = promotedFromComposer;
      errorDetail = "";
      console.log("[Sandblast][chatRoute:finalEnvelopeReplyPromotionV50]", { traceId: norm.traceId, promoted: true, source: "composeMarionResponse" });
    }
  }
  const marionReply = getMarionAuthorityReply(marion);
  const marionHasFreshEnvelope = hasFreshMarionFinalEnvelope(marion);
  const marionReplyBlocked = isBlockedLoopingSupportReply(marionReply);
  if (marionReplyBlocked) {
    loopReplyWasBlocked = true;
    console.log("[Sandblast][chatRoute:blockedLoopReply]", { traceId: norm.traceId, authority: "marion_bridge", requiredSignature: REQUIRED_CHAT_ENGINE_SIGNATURE, normalized: !!(marion && marion.hardlockCompatible), hasFreshEnvelope: marionHasFreshEnvelope });
  }
  if (marion && marionReply && !marionReplyBlocked && (marion.ok !== false || marionReply)) {
    selected = isObj(marion) ? { ...marion } : { ok: true, reply: marionReply };
    selected.ok = true;
    selected.final = true;
    selected.handled = true;
    selected.marionFinal = true;
    selected.reply = marionReply;
    selected.text = marionReply;
    selected.answer = marionReply;
    selected.output = marionReply;
    selected.response = marionReply;
    selected.spokenText = cleanText(selected.spokenText || marionReply);
    selected.payload = { ...(isObj(selected.payload) ? selected.payload : {}), reply: marionReply, text: marionReply, message: marionReply, spokenText: marionReply, final: true, marionFinal: true };
    selected.finalEnvelope = { ...(isObj(selected.finalEnvelope) ? selected.finalEnvelope : {}), reply: marionReply, text: marionReply, displayReply: marionReply, spokenText: marionReply, final: true, marionFinal: true, handled: true };
    selected.meta = {
      ...(isObj(selected.meta) ? selected.meta : {}),
      replyAuthority: marionHasFreshEnvelope ? "marion_bridge" : "marion_bridge_legacy_reply",
      semanticAuthority: "marion",
      finalEnvelopeCompatAccepted: !marionHasFreshEnvelope,
      indexAcceptedMarionReplyWithoutFreshEnvelope: !marionHasFreshEnvelope,
      noHttp502: true
    };
    selected = normalizeMarionBridgeResult(selected, marionInput) || selected;
    selected.bridge = marion;
    authority = marionHasFreshEnvelope ? "marion_bridge" : "marion_bridge_legacy_reply";
  } else {
    errorDetail = cleanText(errorDetail || (marionReplyBlocked ? "marion_loop_reply_blocked" : "marion_final_envelope_missing"));
    console.log("[Sandblast][chatRoute:transport_only_no_engine_fallback]", {
      traceId: norm.traceId,
      marionReturned: !!marion,
      marionReplyPresent: !!marionReply,
      marionReplyBlocked,
      marionHasFreshEnvelope
    });
  }
  if (!selected && loopReplyWasBlocked) {
    errorDetail = cleanText(errorDetail || "marion_loop_reply_blocked_transport_only");
  }

  if (!selected && isObj(prePacketBridge) && prePacketBridge.ok !== false && cleanText(prePacketBridge.reply || "")) {
    const packetSelected = buildPacketBridgeFallbackSelected(norm, prePacketBridge);
    if (packetSelected) {
      selected = packetSelected;
      authority = "nyx_packet_bridge_no_marion";
      errorDetail = cleanText(errorDetail || "marion_final_missing_packet_bridge_used");
    }
  }

  if (selected && isObj(prePacketBridge) && prePacketBridge.ok !== false && cleanText(prePacketBridge.reply || "")) {
    const selectedReplyForGuard = cleanText(selected.reply || selected.text || selected.answer || selected.output || selected.payload && selected.payload.reply || "");
    const guardedSelected = applyPacketBridgeFinalSelectionGuard(norm, selected, prePacketBridge, marion, selectedReplyForGuard);
    if (guardedSelected) {
      selected = guardedSelected;
      authority = "nyx_packet_bridge_greeting_guard";
      errorDetail = cleanText(errorDetail || "generic_marion_continuation_replaced_by_packet_bridge");
    }
  }


  if (!selected) {
    const sixDomainRecoveredReply = buildDeterministicLastMilePublicReplyFromText([
      norm.text,
      norm.originalText,
      norm.rawText,
      norm.userText,
      norm.message,
      isObj(norm.body) ? norm.body.message : "",
      isObj(norm.payload) ? norm.payload.message : ""
    ].map(cleanText).filter(Boolean).join(" "));
    if (sixDomainRecoveredReply && !hasUserVisibleDebugLeak(sixDomainRecoveredReply) && !isPublicWorkflowStateLeak(sixDomainRecoveredReply)) {
      selected = {
        ok: true,
        final: true,
        finalized: true,
        handled: true,
        marionFinal: true,
        emit: true,
        blocked: false,
        suppressUserFacingReply: false,
        awaitingMarion: false,
        reply: sixDomainRecoveredReply,
        text: sixDomainRecoveredReply,
        answer: sixDomainRecoveredReply,
        output: sixDomainRecoveredReply,
        response: sixDomainRecoveredReply,
        spokenText: sixDomainRecoveredReply,
        payload: { reply: sixDomainRecoveredReply, text: sixDomainRecoveredReply, message: sixDomainRecoveredReply, spokenText: sixDomainRecoveredReply, final: true, marionFinal: true },
        finalEnvelope: { contract: "nyx.marion.final/1.0", signature: "MARION_FINAL_AUTHORITY", reply: sixDomainRecoveredReply, text: sixDomainRecoveredReply, displayReply: sixDomainRecoveredReply, spokenText: sixDomainRecoveredReply, final: true, marionFinal: true, handled: true, qualityPass: true },
        meta: { v: PUBLIC_INDEX_VERSION, t: now(), replyAuthority: "marion_six_domain_public_knowledge_recovery", semanticAuthority: "marion", noHttp502: true, sixDomainPublicKnowledgeRecovered: true }
      };
      authority = "marion_six_domain_public_knowledge_recovery";
      errorDetail = "";
    }
  }

  if (!selected) {
    const safe = buildConversationSafeErrorReply(norm, 200, "conversation_authority_empty", cleanText(errorDetail || "No final reply was returned by MarionBridge."), {
      marionBridgePresent: !!marionBridgeMod,
      chatEnginePresent: !!chatEngineMod,
      chatEngineFallbackDisabled: true,
      normalizerPresent: !!marionCommandNormalizerMod,
      loopGuardPresent: !!marionLoopGuardMod,
      finalEnvelopePresent: !!(marion && isObj(marion.finalEnvelope)),
      finalEnvelopeModulePresent: !!marionFinalEnvelopeMod,
      marionReturned: !!marion,
      engineReturned: !!engine,
      latencyMs: now() - startedAt
    });
    setTransportState(sessionId, { key: "", turnId: norm.turnId, userHash: replyHash(norm.text), count: 0, finalized: false, route: norm.lane || "general", authority: "none", noHttp502: true });
    return res.status(200).json(applyPublicReplyHygieneToResponse(safe));
  }

  let reply = finalizeRenderableReply(
    getMarionAuthorityReply(selected) ||
    getMarionAuthorityReply(marion) ||
    getMarionAuthorityReply(engine) ||
    (selected.finalEnvelope && (selected.finalEnvelope.reply || selected.finalEnvelope.text || selected.finalEnvelope.displayReply || selected.finalEnvelope.spokenText)) ||
    (selected.payload && (selected.payload.reply || selected.payload.text || selected.payload.message || selected.payload.answer || selected.payload.output || selected.payload.spokenText)) ||
    selected.reply ||
    selected.text ||
    selected.displayReply ||
    selected.answer ||
    selected.output ||
    selected.response ||
    "",
    norm,
    authority,
    "final_route_guard"
  );
  const continuityIntentOverrideReply = buildContinuityIntentOverrideReply(norm, reply);
  if (continuityIntentOverrideReply) {
    reply = finalizeRenderableReply(continuityIntentOverrideReply, norm, authority, "continuity_intent_override_hardlock");
    selected = forcePublicReply(selected, reply, {
      continuityIntentOverrideHardlock: true,
      continuityEffectivePrompt: cleanText(norm.continuityResolvedText || norm.resolvedQuestion || norm.resolvedPrompt || norm.text || ""),
      continuityResolvedOriginalText: cleanText(norm.continuityResolvedOriginalText || ""),
      continuityTopic: cleanText(norm.continuityTopic || ""),
      noUserFacingDiagnostics: true
    });
    selected.marionFinal = true;
    selected.final = true;
    selected.finalized = true;
    selected.handled = true;
    selected.authority = "marionFinalEnvelope";
    selected.payload = {
      ...(isObj(selected.payload) ? selected.payload : {}),
      reply,
      text: reply,
      message: reply,
      displayReply: reply,
      spokenText: reply,
      textSpeak: reply,
      continuityIntentOverrideHardlock: true,
      final: true,
      marionFinal: true
    };
    selected.finalEnvelope = {
      ...(isObj(selected.finalEnvelope) ? selected.finalEnvelope : {}),
      reply,
      text: reply,
      displayReply: reply,
      spokenText: reply,
      final: true,
      marionFinal: true,
      handled: true,
      authority: "marionFinalEnvelope",
      contractVersion: "nyx.marion.final/1.0",
      continuityIntentOverrideHardlock: true
    };
    selected.meta = {
      ...(isObj(selected.meta) ? selected.meta : {}),
      replyAuthority: authority || "marion_bridge",
      semanticAuthority: "marion",
      continuityIntentOverrideHardlock: true,
      noUserFacingDiagnostics: true
    };
  }

  const longTurnContinuityRecoveryReply = buildLongTurnContinuityRecoveryReply(norm, priorTurn, reply);
  if (longTurnContinuityRecoveryReply) {
    reply = finalizeRenderableReply(longTurnContinuityRecoveryReply, norm, authority, "longturn_short_followup_authority_recovery");
    selected = forcePublicReply(selected, reply, {
      longTurnContinuityRecovery: true,
      continuityEffectivePrompt: cleanText(norm.continuityResolvedText || norm.resolvedQuestion || norm.resolvedPrompt || norm.text || ""),
      continuityResolvedOriginalText: cleanText(norm.continuityResolvedOriginalText || norm.originalText || norm.rawUserText || ""),
      continuityTopic: cleanText(norm.continuityTopic || extractContinuityTopicFromTurn(priorTurn) || ""),
      noUserFacingDiagnostics: true
    });
    selected.marionFinal = true;
    selected.final = true;
    selected.finalized = true;
    selected.handled = true;
    selected.authority = "marionFinalEnvelope";
    selected.finalEnvelope = {
      ...(isObj(selected.finalEnvelope) ? selected.finalEnvelope : {}),
      reply,
      text: reply,
      displayReply: reply,
      spokenText: reply,
      final: true,
      marionFinal: true,
      handled: true,
      authority: "marionFinalEnvelope",
      contractVersion: "nyx.marion.final/1.0",
      longTurnContinuityRecovery: true
    };
  }
  if (isBlockedLoopingSupportReply(reply)) {
    reply = buildIndexSafeTransportReply(norm, "marion_loop_reply_blocked", { authority, latencyMs: now() - startedAt });
  }
  if (!cleanText(reply)) {
    const salvagePrompt = cleanText(
      continuityEffectivePromptFromNorm(norm) ||
      (isObj(selected.finalEnvelope) && (selected.finalEnvelope.reply || selected.finalEnvelope.text || selected.finalEnvelope.displayReply)) ||
      (isObj(selected.payload) && (selected.payload.reply || selected.payload.text || selected.payload.message)) ||
      (isObj(marion) && getMarionAuthorityReply(marion)) ||
      ""
    );
    const salvageReply = cleanReplyForUser(
      buildLongTurnContinuityRecoveryReply(norm, priorTurn, "") ||
      buildContinuityIntentOverrideReply(norm, "") ||
      buildDeterministicLastMilePublicReplyFromText(salvagePrompt)
    );
    if (salvageReply) {
      reply = finalizeRenderableReply(salvageReply, norm, authority || "index_authority_sanitization_reply_salvage", "index_authority_sanitization_reply_salvage");
      selected = forcePublicReply(selected, reply, {
        indexAuthoritySanitizationReplySalvage: true,
        failureRecovered: "trusted_marion_final_reply_missing_after_sanitization",
        salvagePrompt,
        continuityEffectivePrompt: cleanText(norm.continuityResolvedText || norm.resolvedQuestion || norm.resolvedPrompt || norm.text || ""),
        noUserFacingDiagnostics: true
      });
      selected.authority = "marionFinalEnvelope";
      selected.finalEnvelope = {
        ...(isObj(selected.finalEnvelope) ? selected.finalEnvelope : {}),
        reply,
        text: reply,
        displayReply: reply,
        spokenText: reply,
        final: true,
        marionFinal: true,
        handled: true,
        authority: "marionFinalEnvelope",
        contractVersion: "nyx.marion.final/1.0",
        indexAuthoritySanitizationReplySalvage: true
      };
      authority = authority || "index_authority_sanitization_reply_salvage";
    }
  }
  if (!cleanText(reply)) {
    const safe = buildConversationSafeErrorReply(norm, 200, "conversation_authority_empty", "trusted_marion_final_reply_missing_after_sanitization", {
      authority,
      marionBridgePresent: !!marionBridgeMod,
      chatEnginePresent: !!chatEngineMod,
      selectedReplyFieldsObserved: !!(selected && (selected.reply || selected.text || selected.displayReply || (selected.finalEnvelope && (selected.finalEnvelope.reply || selected.finalEnvelope.text || selected.finalEnvelope.displayReply)) || (selected.payload && (selected.payload.reply || selected.payload.text || selected.payload.message)))),
      marionAuthorityReplyObserved: !!getMarionAuthorityReply(marion),
      indexAuthoritySanitizationReplySalvageAttempted: true,
      falseFinalPurged: true,
      latencyMs: now() - startedAt
    });
    setTransportState(sessionId, { key: "", turnId: norm.turnId, userHash: replyHash(norm.text), count: 0, finalized: false, route: norm.lane || "general", authority: "none", noHttp502: true, falseFinalPurged: true });
    return res.status(200).json(applyPublicReplyHygieneToResponse(safe));
  }

  const duplicateGate = detectLoop(sessionId, reply, norm.text, { turnId: norm.turnId, route: norm.lane || "general", authority });
  if (duplicateGate.repeated && !isHighRiskSupportSignal(null, norm.text)) {
    const loopBreakReply = finalizeRenderableReply(buildIndexLoopBreakReply(norm, reply, authority, duplicateGate), norm, authority, "duplicate_reply_loop_break");
    if (cleanText(loopBreakReply) && !isBlockedLoopingSupportReply(loopBreakReply) && !isConversationDiagnosticFallbackReply(loopBreakReply) && !isInternalMarionBlockerReply(loopBreakReply) && !isPublicWorkflowStateLeak(loopBreakReply)) {
      reply = loopBreakReply;
    } else {
      const safe = buildConversationSafeErrorReply(norm, 200, "loop_guard_silent_block", "duplicate_public_reply_suppressed_waiting_for_clean_marion_final", {
        authority,
        duplicateGate,
        suppressUserFacingReply: true,
        publicSurfaceLeakBlocked: true,
        latencyMs: now() - startedAt
      });
      setTransportState(sessionId, { key: transportKey, turnId: norm.turnId, userHash: replyHash(norm.text), count: 0, finalized: false, route: norm.lane || "general", authority: "none", loopReplyBlocked: true, suppressUserFacingReply: true, publicSurfaceLeakBlocked: true });
      return res.status(200).json(applyPublicReplyHygieneToResponse(safe));
    }
    selected = {
      ...(isObj(selected) ? selected : {}),
      reply,
      text: reply,
      answer: reply,
      output: reply,
      response: reply,
      spokenText: reply,
      payload: {
        ...(isObj(selected && selected.payload) ? selected.payload : {}),
        reply,
        text: reply,
        message: reply,
        spokenText: reply,
        duplicateReplyObserved: true,
        loopBreakApplied: true
      },
      finalEnvelope: {
        ...(isObj(selected && selected.finalEnvelope) ? selected.finalEnvelope : {}),
        reply,
        text: reply,
        displayReply: reply,
        spokenText: reply,
        final: true,
        handled: true
      },
      meta: {
        ...(isObj(selected && selected.meta) ? selected.meta : {}),
        v: PUBLIC_INDEX_VERSION,
        t: now(),
        replyAuthority: authority,
        previousTurnId: duplicateGate.previousTurnId,
        duplicateReplyObserved: true,
        loopBreakApplied: true,
        transportOnlyNoSemanticReplacement: false
      }
    };
  }

  selected = normalizeReplyEnvelope(selected, reply, {
    v: PUBLIC_INDEX_VERSION,
    t: now(),
    indexRole: "transport_only",
    transportOnly: true,
    marionTransportOnly: true,
    noSupportDecision: true,
    noEmotionDecision: true,
    supportDeauthorized: true,
    supportHold: 0,
    replyAuthority: authority,
    semanticAuthority: authority,
    marionBridgePresent: !!marion,
    chatEnginePresent: !!engine,
    marionIntent: norm.marionIntent,
    marionRouting: norm.marionRouting,
    turnId: norm.turnId,
    traceId: norm.traceId,
    latencyMs: now() - startedAt
  });
  const trustedFinalForOutput = !!cleanText(reply) && !isConversationDiagnosticFallbackReply(reply) && !isBlockedLoopingSupportReply(reply) && !isPublicWorkflowStateLeak(reply);
  selected.ok = trustedFinalForOutput && selected.ok !== false;
  selected.final = trustedFinalForOutput;
  selected.finalized = trustedFinalForOutput;
  selected.handled = true;
  selected.marionFinal = trustedFinalForOutput && (selected.marionFinal !== false || authority === "marion_bridge" || authority === "marion_bridge_legacy_reply" || authority === "marion_six_domain_public_knowledge_recovery" || authority === "index_authority_sanitization_reply_salvage");
  selected.awaitingMarion = !trustedFinalForOutput;
  selected.suppressUserFacingReply = !trustedFinalForOutput;
  selected.emit = trustedFinalForOutput;
  selected.blocked = !trustedFinalForOutput;
  selected.lane = selected.lane || norm.lane || "general";
  selected.laneId = selected.laneId || selected.lane;
  selected.sessionLane = selected.sessionLane || selected.lane;
  selected.requestId = cleanText(selected.requestId || makeTraceId("req"));
  selected.traceId = cleanText(selected.traceId || norm.traceId);
  selected.bridge = selected.bridge || marion || null;
  selected.marionIntent = norm.marionIntent;
  selected.marionRouting = norm.marionRouting;
  if (trustedFinalForOutput) {
    selected.payload = {
      ...(isObj(selected.payload) ? selected.payload : {}),
      reply,
      text: reply,
      message: reply,
      displayReply: reply,
      spokenText: cleanText(selected.spokenText || reply),
      final: true,
      finalized: true,
      marionFinal: true,
      handled: true,
      emit: true,
      blocked: false,
      awaitingMarion: false,
      suppressUserFacingReply: false
    };
    selected.finalEnvelope = {
      ...(isObj(selected.finalEnvelope) ? selected.finalEnvelope : {}),
      reply,
      text: reply,
      displayReply: reply,
      spokenText: cleanText(selected.spokenText || reply),
      final: true,
      finalized: true,
      marionFinal: true,
      handled: true,
      authority: "marionFinalEnvelope",
      contractVersion: "nyx.marion.final/1.0",
      qualityPass: true
    };
  }

  const packetBridge = (isObj(prePacketBridge) && prePacketBridge.ok !== false && cleanText(prePacketBridge.matchedPacketId || prePacketBridge.packetId || prePacketBridge.packet || ""))
    ? prePacketBridge
    : (norm.staleCarryBypass ? {} : resolveNyxPacketBridge(norm, selected, marion, priorTurn));
  selected = applyPacketBridgeToSelected(selected, packetBridge, norm);

  // INDEX-FINAL-PROMOTION-REASSERTION-HARDLOCK:
  // Packet bridge and hygiene layers may preserve a structured blocked shell from
  // an earlier awaiting-Marion state. If the current turn already has a clean
  // Marion/continuity reply, reassert the public final contract before later
  // safety gates inspect selected.awaitingMarion/blocked and accidentally emit
  // a blank authority packet.
  const cleanReplyAfterPacketBridge = cleanReplyForUser(reply);
  if (cleanReplyAfterPacketBridge && !hasUserVisibleDebugLeak(cleanReplyAfterPacketBridge) && !isPublicWorkflowStateLeak(cleanReplyAfterPacketBridge) && !isBlockedLoopingSupportReply(cleanReplyAfterPacketBridge)) {
    reply = finalizeRenderableReply(cleanReplyAfterPacketBridge, norm, authority || "marion_bridge", "index_final_promotion_reassertion_hardlock");
    selected = forcePublicReply(selected, reply, {
      indexFinalPromotionReassertionHardlock: true,
      replyAuthority: authority || "marion_bridge",
      semanticAuthority: "marion",
      noUserFacingDiagnostics: true
    });
    selected.marionFinal = true;
    selected.final = true;
    selected.finalized = true;
    selected.handled = true;
    selected.awaitingMarion = false;
    selected.suppressUserFacingReply = false;
    selected.emit = true;
    selected.blocked = false;
  }

  if (isBlockedLoopingSupportReply(reply) || isConversationDiagnosticFallbackReply(reply) || isInternalMarionBlockerReply(reply) || isPublicWorkflowStateLeak(reply)) {
    const repaired = finalizeRenderableReply(buildIndexLoopBreakReply(norm, reply, authority, { repeated: true, stage: "post_packet_bridge" }), norm, authority, "post_packet_bridge_loop_break");
    if (!cleanText(repaired) || isInternalMarionBlockerReply(repaired) || isConversationDiagnosticFallbackReply(repaired) || isBlockedLoopingSupportReply(repaired)) {
      const safe = buildConversationSafeErrorReply(norm, 200, "post_packet_bridge_silent_block", "invalid_public_reply_suppressed_waiting_for_clean_marion_final", {
        authority,
        suppressUserFacingReply: true,
        publicSurfaceLeakBlocked: true,
        latencyMs: now() - startedAt
      });
      setTransportState(sessionId, { key: transportKey, turnId: norm.turnId, userHash: replyHash(norm.text), count: 0, finalized: false, route: norm.lane || "general", authority: "none", loopReplyBlocked: true, suppressUserFacingReply: true, publicSurfaceLeakBlocked: true });
      return res.status(200).json(applyPublicReplyHygieneToResponse(safe));
    }
    if (cleanText(repaired)) {
      reply = repaired;
      selected.reply = reply;
      selected.text = reply;
      selected.answer = reply;
      selected.output = reply;
      selected.response = reply;
      selected.spokenText = reply;
      selected.payload = { ...(isObj(selected.payload) ? selected.payload : {}), reply, text: reply, message: reply, spokenText: reply, loopBreakApplied: true };
      selected.finalEnvelope = { ...(isObj(selected.finalEnvelope) ? selected.finalEnvelope : {}), reply, text: reply, displayReply: reply, spokenText: reply, final: true, handled: true };
    }
  }

  const languageSphereFinal = await applyIndexLanguageSphereToTrustedFinal(selected, norm, reply);
  if (languageSphereFinal && isObj(languageSphereFinal.packet)) {
    selected = languageSphereFinal.packet;
    reply = finalizeRenderableReply(languageSphereFinal.reply || selected.reply || selected.text || reply, norm, authority, "language_sphere_final_route_guard");
    selected.reply = reply;
    selected.text = reply;
    selected.answer = reply;
    selected.output = reply;
    selected.response = reply;
    selected.spokenText = cleanText(selected.spokenText || reply);
    selected.finalEnvelope = {
      ...(isObj(selected.finalEnvelope) ? selected.finalEnvelope : {}),
      reply,
      text: reply,
      displayReply: reply,
      spokenText: cleanText(selected.spokenText || reply),
      final: true,
      marionFinal: !!selected.marionFinal,
      handled: true,
      languageSphere: isObj(languageSphereFinal.languageSphere) ? languageSphereFinal.languageSphere : undefined
    };
    selected.payload = {
      ...(isObj(selected.payload) ? selected.payload : {}),
      reply,
      text: reply,
      message: reply,
      displayReply: reply,
      spokenText: cleanText(selected.spokenText || reply),
      languageSphere: isObj(languageSphereFinal.languageSphere) ? languageSphereFinal.languageSphere : undefined
    };
    selected.meta = mergeLanguageSphereMeta(selected.meta, isObj(languageSphereFinal.languageSphere) ? languageSphereFinal.languageSphere : {});
    selected.diagnostics = mergeLanguageSphereMeta(selected.diagnostics, isObj(languageSphereFinal.languageSphere) ? languageSphereFinal.languageSphere : {});
  }

  selected = applyIndexLanguageSphereSurface(selected, norm, languageSphereFinal || {});

  /*
   * Last-mile deterministic recovery:
   * If the bridge/composer hands index a clean but non-answer fallback, recover
   * from the original prompt before speech/playback/tts are built. This keeps
   * Render smoke tests from recycling safety text as the public answer.
   */
  const lastMileRecoverySource = [
    norm.continuityResolvedText,
    norm.resolvedQuestion,
    norm.resolvedPrompt,
    norm.effectivePrompt,
    norm.finalPrompt,
    norm.text,
    norm.rawText,
    norm.rawUserText,
    norm.originalText,
    norm.userText,
    norm.message,
    selected.userText,
    selected.rawUserText,
    selected.originalUserText,
    selected.message,
    selected.query,
    isObj(selected.payload) ? selected.payload.userText : "",
    isObj(selected.payload) ? selected.payload.rawUserText : "",
    isObj(selected.payload) ? selected.payload.originalUserText : "",
    isObj(selected.payload) ? selected.payload.message : "",
    isObj(selected.input) ? selected.input.message : "",
    isObj(selected.body) ? selected.body.message : ""
  ].map(cleanText).filter(Boolean).join(" ");

  const lastMileRecoveredReply = (
    isInvalidPublicReplyRecoveryText(reply) ||
    isInvalidPublicReplyRecoveryText(selected.reply) ||
    isInvalidPublicReplyRecoveryText(selected.text) ||
    !cleanReplyForUser(reply)
  )
    ? buildDeterministicLastMilePublicReplyFromText(lastMileRecoverySource)
    : "";

  if (lastMileRecoveredReply) {
    reply = finalizeRenderableReply(lastMileRecoveredReply, norm, authority, "deterministic_original_prompt_recovery");
    selected.ok = true;
    selected.final = true;
    selected.finalized = true;
    selected.handled = true;
    selected.marionFinal = selected.marionFinal !== false;
    selected.awaitingMarion = false;
    selected.suppressUserFacingReply = false;
    selected.emit = true;
    selected.blocked = false;
    selected.reply = reply;
    selected.text = reply;
    selected.short = reply;
    selected.answer = reply;
    selected.output = reply;
    selected.response = reply;
    selected.displayReply = reply;
    selected.spokenText = reply;
    selected.textSpeak = reply;
    selected.textDisplay = reply;
    selected.payload = {
      ...(isObj(selected.payload) ? selected.payload : {}),
      reply,
      text: reply,
      message: reply,
      answer: reply,
      output: reply,
      response: reply,
      displayReply: reply,
      spokenText: reply,
      textSpeak: reply,
      textDisplay: reply,
      deterministicOriginalPromptRecovery: true,
      final: true,
      finalized: true,
      handled: true,
      marionFinal: true,
      emit: true,
      blocked: false,
      suppressUserFacingReply: false,
      awaitingMarion: false
    };
    selected.finalEnvelope = {
      ...(isObj(selected.finalEnvelope) ? selected.finalEnvelope : {}),
      reply,
      text: reply,
      displayReply: reply,
      spokenText: reply,
      final: true,
      marionFinal: true,
      handled: true,
      qualityPass: true,
      deterministicOriginalPromptRecovery: true
    };
    selected.meta = {
      ...(isObj(selected.meta) ? selected.meta : {}),
      deterministicOriginalPromptRecovery: true,
      noUserFacingDiagnostics: true,
      lastMileRecoverySourceHash: replyHash(lastMileRecoverySource)
    };
  }

  const speech = buildSpeechContract(selected, norm);
  selected = ensureAudioContractFromSpeech(attachVoiceRoute(selected), speech);
  selected.speech = speech;
  selected.payload = {
    ...(isObj(selected.payload) ? selected.payload : {}),
    reply,
    text: speech.text,
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    spokenText: speech.textSpeak,
    routeKind: speech.routeKind,
    intro: speech.intro,
    source: speech.source,
    speechHints: speech.speechHints,
    speech,
    finalized: true
  };
  const runtimeTelemetry = buildIndexRuntimeTelemetry({norm,selected,marion,reply,authority,startedAt,stage:"final",canEmit:true});
  selected.finalRuntimeTelemetryVersion = FINAL_RUNTIME_TELEMETRY_VERSION;
  selected.runtimeTelemetry = runtimeTelemetry;
  selected.voiceRoute = normalizeVoiceRouteResponse({
    ...(isObj(selected.voiceRoute) ? selected.voiceRoute : {}),
    text: speech.text,
    textDisplay: speech.textDisplay,
    textSpeak: speech.textSpeak,
    routeKind: speech.routeKind,
    intro: speech.intro,
    source: speech.source,
    speechHints: speech.speechHints,
    presenceProfile: speech.presenceProfile,
    voiceStyle: speech.voiceStyle,
    nyxStateHint: speech.nyxStateHint
  });

  if (!cleanReplyForUser(reply) || hasUserVisibleDebugLeak(reply) || isPublicWorkflowStateLeak(reply) || isBlockedLoopingSupportReply(reply)) {
    setTransportState(sessionId, { key: "", turnId: norm.turnId, userHash: replyHash(norm.text), count: 0, finalized: false, route: norm.lane || "general", unsafeFinalPurged: true });
    return res.status(200).json(buildSuppressedPublicChatResponse({ requestId: selected.requestId, traceId: selected.traceId || norm.traceId, sessionId, lane: norm.lane || "general", authority }, "unsafe_final_reply_purged"));
  }

  setSupportState(sessionId, {
    active: false,
    hold: 0,
    replyHash: replyHash(reply),
    lastUserHash: replyHash(norm.text),
    lastTurnId: norm.turnId,
    supportPasses: 0,
    releaseUntilTurnId: norm.turnId,
    releaseUntilAt: now() + CFG.loopSuppressionWindowMs,
    lastRoute: norm.lane || "general",
    lastAuthority: authority,
    loopBreakApplied: false
  });
  setTransportState(sessionId, { key: transportKey, turnId: norm.turnId, reply, replyHash: replyHash(reply), userHash: replyHash(norm.text), finalized: true, route: norm.lane || "general", authority, count: 1 });
  setLastTurn(sessionId, {
    replyHash: replyHash(reply),
    userHash: replyHash(norm.text),
    lane: selected.lane || norm.lane,
    replyAuthority: authority,
    turnId: norm.turnId,
    route: norm.lane || "general",
    loopStatus: "transport_only_clear",
    finalized: true,
    userText: cleanText(norm.originalText || norm.rawUserText || norm.text),
    resolvedUserText: cleanText(norm.text),
    reply,
    emotionLabel: "",
    topic: cleanText(norm.continuityTopic || extractContinuityTopicFromTurn({ userText: norm.originalText || norm.rawUserText || norm.text, reply }) || ""),
    lastTopic: cleanText(norm.continuityTopic || extractContinuityTopicFromTurn({ userText: norm.originalText || norm.rawUserText || norm.text, reply }) || ""),
    knowledgeDomain: cleanText(norm.marionRouting && (norm.marionRouting.knowledgeDomain || norm.marionRouting.domain) || selected.marionRouting && (selected.marionRouting.knowledgeDomain || selected.marionRouting.domain) || ""),
    resolvedFollowupFrom: cleanText(norm.continuityResolvedOriginalText || ""),
    continuity: {
      ...(isObj(selected.payload && selected.payload.continuity) ? selected.payload.continuity : {}),
      active: true,
      topic: cleanText(norm.continuityTopic || extractContinuityTopicFromTurn({ userText: norm.originalText || norm.rawUserText || norm.text, reply }) || ""),
      lastTopic: cleanText(norm.continuityTopic || extractContinuityTopicFromTurn({ userText: norm.originalText || norm.rawUserText || norm.text, reply }) || ""),
      resolvedFollowup: !!norm.shortFollowupContinuityResolved,
      previousUserText: cleanText(priorTurn && priorTurn.userText || ""),
      previousReply: cleanText(priorTurn && priorTurn.reply || "")
    },
    memoryPatch: isObj(selected.memoryPatch) ? selected.memoryPatch : (isObj(selected.sessionPatch && selected.sessionPatch.memoryPatch) ? selected.sessionPatch.memoryPatch : {}),
    sessionPatch: isObj(selected.sessionPatch) ? selected.sessionPatch : {},
    packetPreclassification: isObj(norm.packetPreclassification) ? norm.packetPreclassification : {}
  });

  console.log("[Sandblast][chatRoute:transportFinal]", {
    traceId: norm.traceId,
    sessionId,
    authority,
    reply,
    latencyMs: now() - startedAt
  });

  const publicResponse = applyPublicReplyHygieneToResponse({
    ok: selected.ok !== false,
    final: true,
    marionFinal: !!selected.marionFinal,
    handled: true,
    awaitingMarion: false,
    suppressUserFacingReply: false,
    emit: true,
    blocked: false,
    reply,
    text: reply,
    short: reply,
    answer: reply,
    output: reply,
    response: reply,
    displayReply: reply,
    userText: cleanText(norm.text || norm.userText || norm.message || ""),
    rawUserText: cleanText(norm.rawText || norm.rawUserText || norm.originalText || norm.text || ""),
    originalUserText: cleanText(norm.originalText || norm.rawUserText || norm.text || ""),
    spokenText: cleanText(speech && speech.textSpeak || reply || ""),
    detail: cleanText(selected.payload && (selected.payload.detail || selected.payload.longReply || selected.payload.payloadText) || reply || ""),
    finalEnvelope: { ...(isObj(selected.finalEnvelope) ? selected.finalEnvelope : {}), reply, text: reply, displayReply: reply, spokenText: cleanText(speech && speech.textSpeak || reply || ""), final: true, marionFinal: !!selected.marionFinal, handled: true, authority: selected.marionFinal ? "marionFinalEnvelope" : cleanText(authority || "packet_or_transport_final"), contractVersion: selected.marionFinal ? "nyx.marion.final/1.0" : "nyx.packet.bridge/1.0", finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION, runtimeTelemetry },
    textSpeak: cleanText(speech && speech.textSpeak || reply || ""),
    textDisplay: cleanText(speech && speech.textDisplay || reply || ""),
    payload: {
      ...(isObj(selected.payload) ? selected.payload : {}),
      reply,
      text: reply,
      message: reply,
      displayReply: reply,
      userText: cleanText(norm.text || norm.userText || norm.message || ""),
      rawUserText: cleanText(norm.rawText || norm.rawUserText || norm.originalText || norm.text || ""),
      originalUserText: cleanText(norm.originalText || norm.rawUserText || norm.text || ""),
      spokenText: cleanText(speech && speech.textSpeak || reply || ""),
      textDisplay: cleanText(speech && speech.textDisplay || reply || ""),
      textSpeak: cleanText(speech && speech.textSpeak || reply || ""),
      final: true,
      finalized: true,
      marionFinal: !!selected.marionFinal,
      handled: true,
      emit: true,
      blocked: false,
      suppressUserFacingReply: false,
      awaitingMarion: false,
      finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
      runtimeTelemetry
    },
    finalRuntimeTelemetryVersion: FINAL_RUNTIME_TELEMETRY_VERSION,
    runtimeTelemetry,
    languageSphere: isObj(selected.languageSphere) ? selected.languageSphere : (isObj(selected.meta && selected.meta.languageSphere) ? selected.meta.languageSphere : (isObj(norm.languageSphere) ? norm.languageSphere : undefined)),
    contextPassport: isObj(selected.contextPassport) ? selected.contextPassport : undefined,
    languageSphereEvents: Array.isArray(selected.languageSphereEvents) ? selected.languageSphereEvents : [],
    events: Array.isArray(selected.languageSphereEvents) ? selected.languageSphereEvents : [],
    languageSphereTelemetry: isObj(selected.languageSphereTelemetry) ? selected.languageSphereTelemetry : undefined,
    telemetry: isObj(selected.languageSphereTelemetry) ? selected.languageSphereTelemetry : undefined,
    multilingualFinalEnvelope: isObj(selected.multilingualFinalEnvelope) ? selected.multilingualFinalEnvelope : undefined,
    lane: selected.lane || norm.lane || "general",
    laneId: selected.laneId || selected.lane || norm.lane || "general",
    sessionLane: selected.sessionLane || selected.lane || norm.lane || "general",
    bridge: selected.bridge || null,
    marionIntent: norm.marionIntent,
    marionRouting: norm.marionRouting,
    matchedPacketId: selected.matchedPacketId || undefined,
    matchedPacketType: selected.matchedPacketType || undefined,
    packetId: selected.packetId || undefined,
    greeting: selected.greeting || undefined,
    lastGreetingIntent: selected.lastGreetingIntent || (selected.sessionPatch && selected.sessionPatch.lastGreetingIntent) || undefined,
    lastGreetingTone: selected.lastGreetingTone || (selected.sessionPatch && selected.sessionPatch.lastGreetingTone) || undefined,
    lastInputEnergy: selected.lastInputEnergy || (selected.sessionPatch && selected.sessionPatch.lastInputEnergy) || undefined,
    presenceProfile: selected.presenceProfile || (selected.speech && selected.speech.presenceProfile) || undefined,
    nyxStateHint: selected.nyxStateHint || (selected.speech && selected.speech.nyxStateHint) || undefined,
    inputSource: norm.inputSource,
    source: norm.source,
    ctx: selected.ctx || {},
    ui: selected.ui || {},
    directives: Array.isArray(selected.directives) ? selected.directives : [],
    followUps: Array.isArray(selected.followUps) ? selected.followUps : [],
    followUpsStrings: Array.isArray(selected.followUpsStrings) ? selected.followUpsStrings : [],
    emotionalTurn: selected.emotionalTurn || undefined,
    sessionPatch: selected.sessionPatch || selected.memoryPatch || {},
    memoryPatch: selected.memoryPatch || {},
    cog: selected.cog || { intent: (norm.marionIntent && norm.marionIntent.intent) || "simple_chat", mode: "finalized", publicMode: true },
    requestId: selected.requestId,
    traceId: selected.traceId,
    meta: {
      ...(selected.meta || {}),
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      indexRole: "transport_only",
      transportOnly: true,
      noSupportDecision: true,
      noEmotionDecision: true,
      replyAuthority: authority,
      semanticAuthority: authority,
      supportDeauthorized: true,
      supportHold: 0,
      loopPhraseHardlock: true,
      requiredFreshSignature: REQUIRED_CHAT_ENGINE_SIGNATURE,
      latencyMs: now() - startedAt,
      loggingSpine: trace,
      packetPreclassification: isObj(norm.packetPreclassification) ? norm.packetPreclassification : undefined,
      packetStateBridge: {
        active: !!(selected.meta && selected.meta.packetStateBridgeActive),
        matchedPacketId: selected.matchedPacketId || "",
        matchedPacketType: selected.matchedPacketType || "",
        packFile: cleanText(selected.meta && selected.meta.packetBridgePackFile || "")
      },
      audioContract: {
        version: "audio-first-v1",
        endpoint: routeUrl("/api/tts"),
        healthEndpoint: routeUrl("/api/tts/health"),
        compatibilityHealthEndpoint: routeUrl("/tts/health"),
        deterministicAudio: true,
        failOpenChat: true
      }
    },
    speech,
    audio: selected.audio || undefined,
    ttsProfile: selected.ttsProfile || undefined,
    playback: {
      ready: !!cleanText(selected.audio && selected.audio.textToSynth || speech && speech.textSpeak || reply || ""),
      autoPlay: !!(selected.audio && selected.audio.autoPlay !== false),
      route: routeUrl("/api/tts"),
      compatibilityRoute: routeUrl("/tts"),
      health: routeUrl("/api/tts/health"),
      compatibilityHealth: routeUrl("/tts/health"),
      textSpeak: cleanText(selected.audio && selected.audio.textToSynth || speech && speech.textSpeak || reply || ""),
      provider: cleanText(selected.audio && selected.audio.provider || process.env.TTS_PROVIDER || "resemble") || "resemble"
    },
    tts: {
      ready: !!cleanText(speech && speech.textSpeak || reply || ""),
      textSpeak: cleanText(speech && speech.textSpeak || reply || ""),
      provider: cleanText(selected.audio && selected.audio.provider || process.env.TTS_PROVIDER || "resemble") || "resemble"
    },
    voiceRoute: selected.voiceRoute || undefined
  });
  return res.status(200).json(publicResponse);
  } catch (err) {
    const traceId = cleanText((req && (req.sbTraceId || (req.headers && req.headers["x-sb-trace-id"]))) || makeTraceId("chat"));
    const norm = (() => { try { return normalizePayload(req); } catch (_) { return { traceId, lane: "general", marionIntent: {}, marionRouting: {} }; } })();
    console.log("[Sandblast][chatRoute:unhandled_error_purged]", {
      traceId,
      path: req && (req.originalUrl || req.url || req.path || ""),
      error: cleanText(err && (err.stack || err.message || err) || "unknown")
    });
    if (res.headersSent) return;
    hardenCors(req, res);
    return res.status(200).json(applyPublicReplyHygieneToResponse(buildConversationSafeErrorReply(norm, 200, "conversation_route_runtime_error", cleanText(err && (err.message || err) || "conversation route failed"), {
      traceId,
      runtimeError: true
    })));
  }
});

console.log("[Sandblast][newsCanada] rss_service_ready", {
  api: "/api/newscanada",
  direct: "/newscanada",
  source: newsCanadaFeedService ? "rss-service" : "service_unavailable",
  moduleLoaded: !!newsCanadaFeedServiceMod,
  serviceLoaded: !!newsCanadaFeedService,
  feedUrl: resolveNewsCanadaFeedUrl(),
  compatibility: {
    rss: "/api/newscanada/rss",
    manualCompat: "/api/newscanada/manual",
    editorsPicks: "/api/newscanada/editors-picks",
    story: "/api/newscanada/story",
        refresh: "/api/newscanada/rss",
    diagnostics: "/api/newscanada/diagnostics"
  }
});


const cbcRssRoutes = resolveExpressRouterFromModule(cbcRssRoutesMod);
if (cbcRssRoutes) {
  app.use("/api/CBCRSS", cbcRssRoutes);
  app.use("/api/cbcrss", cbcRssRoutes);
  console.log("[Sandblast][CBCRSS] bridge_route_mounted", {
    api: "/api/CBCRSS",
    compat: "/api/cbcrss",
    feed: process.env.SB_CBC_RSS_URL || "https://www.cbc.ca/webfeed/rss/rss-canada",
    router: true
  });
} else {
  console.log("[Sandblast][CBCRSS] bridge_route_unavailable", {
    api: "/api/CBCRSS",
    compat: "/api/cbcrss",
    router: false
  });
}

const newsCanadaRoutes = resolveExpressRouterFromModule(newsCanadaRoutesMod);
if (newsCanadaRoutes && boolEnv("SB_ENABLE_NEWSCANADA_EXTERNAL_ROUTES", false)) {
  app.use("/api/newscanada", newsCanadaRoutes);
  app.use("/newscanada", newsCanadaRoutes);
  console.log("[Sandblast][newsCanada] manual_rss_routes_mounted", {
    api: "/api/newscanada",
    direct: "/newscanada",
    router: true
  });
} else {
  console.log("[Sandblast][newsCanada] manual_rss_routes_unavailable", {
    api: "/api/newscanada",
    direct: "/newscanada",
    router: false
  });
}

const lingoSentinelPublishMounted = mountLingoSentinelPublishRoute(app, lingoSentinelPublishRoutesMod);
console.log("[Sandblast][LingoSentinel] publish_route_" + (lingoSentinelPublishMounted ? "mounted" : "unavailable"), {
  api: "/api/lingosentinel",
  publish: "/api/lingosentinel/publish",
  link: "/api/lingosentinel/link",
  gateway: "LingoSentinelLinkGateway",
  router: !!lingoSentinelPublishMounted
});

const lingoSentinelSubscribeTokenMounted = mountLingoSentinelSubscribeTokenRoute(app, lingoSentinelSubscribeTokenRoutesMod);
console.log("[Sandblast][LingoSentinel] subscribe_token_route_" + (lingoSentinelSubscribeTokenMounted ? "mounted" : "unavailable"), {
  api: "/api/lingosentinel",
  token: "/api/lingosentinel/token",
  health: "/api/lingosentinel/token/health",
  ablyConfigured: !!(process.env.ABLY_API_KEY || process.env.ABLY_ROOT_API_KEY),
  clientId: cleanText(process.env.LINGOSENTINEL_CLIENT_ID || "marion-lingosentinel-engine"),
  router: !!lingoSentinelSubscribeTokenMounted
});

function hasLingoSentinelAblyKeyConfigured() {
  return !!(cleanText(process.env.ABLY_API_KEY || "") || cleanText(process.env.ABLY_ROOT_API_KEY || ""));
}

function buildLingoSentinelAblyReadiness(req) {
  return {
    ok: true,
    service: "lingosentinel-ably",
    version: LINGOSENTINEL_ABLY_READINESS_VERSION,
    ablyConfigured: hasLingoSentinelAblyKeyConfigured(),
    marionAuthority: true,
    publicSurface: "Nyx",
    routes: {
      readiness: "/api/lingosentinel/ably/readiness",
      readinessCompat: "/api/lingosentinel/readiness",
      token: "/api/lingosentinel/token",
      tokenHealth: "/api/lingosentinel/token/health",
      sandboxPublish: "/api/lingosentinel/ably/sandbox-publish",
      privateHealth: "/api/lingosentinel/private/health",
      privateToken: "/api/lingosentinel/private/token",
      privatePublish: "/api/lingosentinel/private/publish",
      publish: "/api/lingosentinel/publish",
      link: "/api/lingosentinel/link"
    },
    mounted: {
      publishRoute: !!lingoSentinelPublishMounted,
      sandboxPublishRoute: true,
      privateRoomRoute: true,
      subscribeTokenRoute: !!lingoSentinelSubscribeTokenMounted,
      gateway: !!runIndexLingoSentinelGateway,
      engine: !!lingoSentinelEngineMod
    },
    contract: {
      group_room: { channel: "ls:room:{roomId}", eventName: "lingosentinel.message.group" },
      one_to_one: { channel: "ls:direct:{roomId}", eventName: "lingosentinel.message.direct" },
      live_translate: { channel: "ls:live:{sessionId}", eventName: "lingosentinel.message.live" },
      delivered: { channel: "ls:receipt:{threadId}", eventName: "lingosentinel.message.delivered" }
    },
    safeguards: {
      keyExposed: false,
      keyPrefixExposed: false,
      appIdExposed: false,
      noStore: true
    },
    traceId: cleanText((req && req.sbTraceId) || (req && req.headers && req.headers["x-sb-trace-id"]) || makeTraceId("lsablyready")),
    timestamp: new Date().toISOString()
  };
}

app.get(["/api/lingosentinel/ably/readiness", "/api/lingosentinel/readiness"], (req, res) => {
  applyCors(req, res);
  hardenConversationNoStore(res);
  return res.status(200).json(buildLingoSentinelAblyReadiness(req));
});

function sanitizeLingoSentinelError(error) {
  const raw = cleanText(error && (error.message || error) || "lingosentinel_sandbox_publish_failed");
  return raw
    .replace(/([a-z0-9_-]+\.[a-z0-9_-]+):[a-z0-9._~+/=-]+/gi, "$1:[redacted]")
    .replace(/\b(?:api[_\s-]?key|token|secret|password|bearer)\s*[:=]\s*[^\s,;]+/gi, (m) => m.split(/[:=]/)[0] + "=[redacted]")
    .replace(/\bkey\s*[:=]\s*[^\s,;]+/gi, "key=[redacted]")
    .replace(/\btoken\s*[:=]\s*[^\s,;]+/gi, "token=[redacted]")
    .slice(0, 240);
}

function lingoSentinelSecretLeakCheck(value) {
  const text = JSON.stringify(value || {});
  const key = cleanText(process.env.ABLY_API_KEY || process.env.ABLY_ROOT_API_KEY || "");
  return {
    keyExposed: !!(key && text.includes(key)),
    keyPrefixExposed: !!(key && key.length > 8 && text.includes(key.slice(0, 8))),
    appIdExposed: false
  };
}

function parseLingoSentinelAblyKey() {
  const raw = cleanText(process.env.ABLY_API_KEY || process.env.ABLY_ROOT_API_KEY || "");
  const idx = raw.indexOf(":");
  if (!raw || idx <= 0 || idx >= raw.length - 1) {
    return { ok: false, error: "ably_key_invalid", raw: "", keyName: "", keySecret: "" };
  }
  const keyName = raw.slice(0, idx).trim();
  const keySecret = raw.slice(idx + 1).trim();
  if (!keyName || !keySecret || !/^[A-Za-z0-9._-]+$/.test(keyName)) {
    return { ok: false, error: "ably_key_invalid", raw: "", keyName: "", keySecret: "" };
  }
  return { ok: true, raw, keyName, keySecret, error: "" };
}

function createLingoSentinelManualTokenRequest(params = {}) {
  const parsed = parseLingoSentinelAblyKey();
  if (!parsed.ok) return { ok: false, error: parsed.error, tokenRequest: null };
  const ttl = clamp(Number(params.ttl || 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000);
  const capability = typeof params.capability === "string" ? params.capability : JSON.stringify(safeObj(params.capability));
  const clientId = cleanText(params.clientId || "lingosentinel-client").replace(/[^a-z0-9_.:@-]+/gi, "-").slice(0, 96) || "lingosentinel-client";
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString("hex");
  const signText = [parsed.keyName, ttl, capability, clientId, timestamp, nonce].join("\n") + "\n";
  const mac = crypto.createHmac("sha256", parsed.keySecret).update(signText).digest("base64");
  return {
    ok: true,
    tokenRequest: { keyName: parsed.keyName, ttl, capability, clientId, timestamp, nonce, mac },
    error: ""
  };
}

async function createLingoSentinelTokenRequestSafe(params = {}) {
  const rest = createLingoSentinelAblyRestClient();
  if (rest.ok) {
    try {
      const tokenRequest = await createAblyTokenRequestSafe(rest.client, params);
      return { ok: true, tokenRequest, provider: "ably_rest", error: "" };
    } catch (err) {
      const manual = createLingoSentinelManualTokenRequest(params);
      if (manual.ok) return { ok: true, tokenRequest: manual.tokenRequest, provider: "manual_hmac", error: "" };
      return { ok: false, tokenRequest: null, provider: "none", error: sanitizeLingoSentinelError(err) };
    }
  }
  const manual = createLingoSentinelManualTokenRequest(params);
  if (manual.ok) return { ok: true, tokenRequest: manual.tokenRequest, provider: "manual_hmac", error: "" };
  return { ok: false, tokenRequest: null, provider: "none", error: rest.error || manual.error || "ably_unavailable" };
}

function directLingoSentinelAblyPublish(channel, eventName, data, traceId) {
  return new Promise((resolve) => {
    const parsed = parseLingoSentinelAblyKey();
    if (!parsed.ok) {
      resolve({ ok: false, status: 503, stage: "ably_key_invalid", error: parsed.error });
      return;
    }
    const https = require("https");
    const payload = JSON.stringify({ name: eventName, data: safeObj(data) });
    const requestOptions = {
      hostname: "rest.ably.io",
      path: "/channels/" + encodeURIComponent(channel) + "/messages",
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(parsed.raw).toString("base64"),
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        "User-Agent": "sandblast-lingosentinel-guardrail",
        "x-sb-trace-id": cleanText(traceId || makeTraceId("lsdirectpublish"))
      },
      timeout: 12000
    };
    const req = https.request(requestOptions, (response) => {
      let text = "";
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => {
        const status = Number(response.statusCode || 0);
        resolve({
          ok: status >= 200 && status < 300,
          status: status || 502,
          stage: status >= 200 && status < 300 ? "published" : "publish_rejected",
          error: status >= 200 && status < 300 ? "" : sanitizeLingoSentinelError(text || ("ably_status_" + status)),
          telemetry: { payloadShape: "lingosentinel.signal", traceId: cleanText(traceId || ""), publishedAt: new Date().toISOString(), transport: "direct_ably_rest" },
          channel,
          eventName
        });
      });
    });
    req.on("timeout", () => { req.destroy(new Error("ably_direct_publish_timeout")); });
    req.on("error", (err) => {
      resolve({ ok: false, status: 502, stage: "publish_exception", error: sanitizeLingoSentinelError(err) });
    });
    req.write(payload);
    req.end();
  });
}

function buildLingoSentinelSandboxPublishInput(req) {
  const body = safeObj(req && req.body);
  const traceId = cleanText((req && req.sbTraceId) || body.traceId || makeTraceId("lsablysandbox"));
  return {
    mode: "group_room",
    roomId: "sandbox-healthcheck",
    text: "LingoSentinel Render controlled sandbox publish.",
    sender: {
      id: "render-sandbox-healthcheck",
      name: "Render Sandbox",
      role: "system_healthcheck",
      preferredLanguage: "en"
    },
    sourceLanguage: "en",
    targetLanguage: "multi",
    traceId,
    metadata: {
      testType: "render_controlled_ably_sandbox_publish",
      interactionSource: "render_backend",
      widgetSurface: "backend_smoke",
      sandbox: true,
      publicSurface: "Nyx",
      marionAuthority: true,
      traceId
    }
  };
}

async function publishLingoSentinelSandboxFromRender(req) {
  if (!hasLingoSentinelAblyKeyConfigured()) {
    return { ok: false, status: 503, stage: "ably_key_missing", error: "ably_not_configured" };
  }

  const input = buildLingoSentinelSandboxPublishInput(req);
  const channel = "ls:room:sandbox-healthcheck";
  const eventName = "lingosentinel.message.group";
  let result = null;
  const engine = lingoSentinelEngineMod;

  if (engine && typeof engine.publishGroupMessage === "function") {
    try {
      result = await engine.publishGroupMessage(input, {
        clientId: cleanText(process.env.LINGOSENTINEL_CLIENT_ID || "render-lingosentinel-sandbox-publisher"),
        forceNewClient: true
      });
    } catch (err) {
      result = { ok: false, stage: "engine_publish_exception", error: sanitizeLingoSentinelError(err) };
    }
  }

  if (!result || result.ok !== true) {
    result = await directLingoSentinelAblyPublish(channel, eventName, {
      mode: input.mode,
      roomId: input.roomId,
      text: input.text,
      sender: input.sender,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      metadata: input.metadata
    }, input.traceId);
  }

  const response = {
    ok: result && result.ok === true,
    service: "lingosentinel-ably",
    version: LINGOSENTINEL_ABLY_SANDBOX_PUBLISH_VERSION,
    stage: cleanText(result && result.stage || "publish_failed"),
    mode: "group_room",
    roomId: "sandbox-healthcheck",
    channel: cleanText(result && result.channel || channel),
    eventName: cleanText(result && result.eventName || eventName),
    marionAuthority: true,
    publicSurface: "Nyx",
    safeguards: {
      keyExposed: false,
      keyPrefixExposed: false,
      appIdExposed: false,
      noStore: true
    },
    telemetry: {
      payloadShape: cleanText(result && result.telemetry && result.telemetry.payloadShape || "lingosentinel.signal"),
      traceId: input.traceId,
      publishedAt: cleanText(result && result.telemetry && result.telemetry.publishedAt || new Date().toISOString()),
      transport: cleanText(result && result.telemetry && result.telemetry.transport || (engine ? "engine_or_direct" : "direct_ably_rest"))
    },
    timestamp: new Date().toISOString()
  };

  if (!response.ok) {
    response.error = sanitizeLingoSentinelError(result && result.errors && result.errors[0] || result && result.error || "publish_failed");
  }

  const leak = lingoSentinelSecretLeakCheck(response);
  response.safeguards.keyExposed = leak.keyExposed;
  response.safeguards.keyPrefixExposed = leak.keyPrefixExposed;
  response.safeguards.appIdExposed = leak.appIdExposed;

  return { ok: response.ok, status: response.ok ? 200 : Number(result && result.status || 502), response };
}


app.post("/api/lingosentinel/ably/sandbox-publish", async (req, res) => {
  applyCors(req, res);
  hardenConversationNoStore(res);

  try {
    const published = await publishLingoSentinelSandboxFromRender(req);
    return res.status(published.status || (published.ok ? 200 : 502)).json(published.response || {
      ok: false,
      service: "lingosentinel-ably",
      version: LINGOSENTINEL_ABLY_SANDBOX_PUBLISH_VERSION,
      stage: cleanText(published.stage || "publish_failed"),
      error: cleanText(published.error || "publish_failed"),
      marionAuthority: true,
      publicSurface: "Nyx",
      safeguards: { keyExposed: false, keyPrefixExposed: false, appIdExposed: false, noStore: true },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      service: "lingosentinel-ably",
      version: LINGOSENTINEL_ABLY_SANDBOX_PUBLISH_VERSION,
      stage: "publish_exception",
      error: sanitizeLingoSentinelError(err),
      marionAuthority: true,
      publicSurface: "Nyx",
      safeguards: { keyExposed: false, keyPrefixExposed: false, appIdExposed: false, noStore: true },
      traceId: cleanText((req && req.sbTraceId) || makeTraceId("lsablysandbox")),
      timestamp: new Date().toISOString()
    });
  }
});


// LINGOSENTINEL-CONTROLLED-PRIVATE-ROOM-ACTIVATION-V2-DIRECT-ABLY-FALLBACK:
// Private-room activation is intentionally separate from the existing public
// token/publish compatibility routes. It adds a narrow allowlist, short token
// TTL, role validation, Marion authority metadata, and no-secret responses
// before any real public room exposure.
const LINGOSENTINEL_PRIVATE_ROOM_DEFAULT = "private-mac-lingosentinel-alpha";
const LINGOSENTINEL_PRIVATE_ROOM_ROLES = Object.freeze(["host", "participant", "observer"]);
const LINGOSENTINEL_PRIVATE_TOKEN_TTL_MS = clampNumberEnv("LINGOSENTINEL_PRIVATE_TOKEN_TTL_MS", 10 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000);

function cleanLingoSentinelRoomId(value) {
  const room = cleanText(value || "").toLowerCase();
  if (!room || room.length < 3 || room.length > 80) return "";
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(room)) return "";
  if (/(?:ably|api|key|secret|token|password)/i.test(room)) return "";
  return room;
}

function lingoSentinelPrivateRoomAllowlist() {
  const configured = cleanText(process.env.LINGOSENTINEL_PRIVATE_ROOMS || process.env.LS_PRIVATE_ROOMS || "");
  const rooms = configured ? configured.split(",") : [LINGOSENTINEL_PRIVATE_ROOM_DEFAULT];
  return uniq(rooms.map(cleanLingoSentinelRoomId).filter(Boolean));
}

function isLingoSentinelPrivateRoomAllowed(roomId) {
  const clean = cleanLingoSentinelRoomId(roomId);
  return !!clean && lingoSentinelPrivateRoomAllowlist().includes(clean);
}

function cleanLingoSentinelPrivateRole(value) {
  const role = cleanText(value || "").toLowerCase();
  return LINGOSENTINEL_PRIVATE_ROOM_ROLES.includes(role) ? role : "";
}

function buildLingoSentinelPrivateDenied(res, status, stage, reason, traceId) {
  hardenConversationNoStore(res);
  return res.status(status).json({
    ok: false,
    service: "lingosentinel-private-room",
    version: LINGOSENTINEL_PRIVATE_ROOM_VERSION,
    stage: cleanText(stage || "rejected"),
    reason: cleanText(reason || "private_room_rejected"),
    marionAuthority: true,
    publicSurface: "Nyx",
    liveScope: "controlled_private",
    safeguards: { keyExposed: false, keyPrefixExposed: false, appIdExposed: false, noStore: true },
    traceId: cleanText(traceId || makeTraceId("lsprivate")),
    timestamp: new Date().toISOString()
  });
}

function lingoSentinelPrivateClientId(value, role) {
  const raw = cleanText(value || "");
  const base = raw.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  return base || ("ls-private-" + cleanText(role || "observer") + "-" + Date.now());
}

function createLingoSentinelAblyRestClient() {
  const key = cleanText(process.env.ABLY_API_KEY || process.env.ABLY_ROOT_API_KEY || "");
  if (!key) return { ok: false, error: "ably_not_configured", client: null };
  const Ably = tryRequireMany(["ably", "./node_modules/ably"]);
  if (!Ably) return { ok: false, error: "ably_package_missing", client: null };
  try {
    if (Ably.Rest) return { ok: true, client: new Ably.Rest({ key }) };
    if (Ably.default && Ably.default.Rest) return { ok: true, client: new Ably.default.Rest({ key }) };
    if (typeof Ably === "function") return { ok: true, client: new Ably({ key }) };
  } catch (err) {
    return { ok: false, error: sanitizeLingoSentinelError(err), client: null };
  }
  return { ok: false, error: "ably_rest_unavailable", client: null };
}

function createAblyTokenRequestSafe(restClient, params) {
  return new Promise((resolve, reject) => {
    try {
      if (!restClient || !restClient.auth || typeof restClient.auth.createTokenRequest !== "function") {
        reject(new Error("ably_create_token_request_unavailable"));
        return;
      }
      let settled = false;
      const done = (err, tokenRequest) => {
        if (settled) return;
        settled = true;
        err ? reject(err) : resolve(tokenRequest);
      };
      const maybe = restClient.auth.createTokenRequest(params, done);
      if (maybe && typeof maybe.then === "function") maybe.then((tokenRequest) => done(null, tokenRequest)).catch(done);
    } catch (err) {
      reject(err);
    }
  });
}

if (!lingoSentinelSubscribeTokenMounted) {
  app.get("/api/lingosentinel/token/health", (req, res) => {
    applyCors(req, res);
    hardenConversationNoStore(res);
    return res.status(200).json({
      ok: true,
      service: "lingosentinel-subscribe-token",
      version: LINGOSENTINEL_GATEWAY_INDEX_VERSION,
      ablyConfigured: hasLingoSentinelAblyKeyConfigured(),
      marionAuthority: true,
      publicSurface: "Nyx",
      route: "/api/lingosentinel/token",
      safeguards: { keyExposed: false, keyPrefixExposed: false, appIdExposed: false, noStore: true },
      traceId: cleanText((req && req.sbTraceId) || makeTraceId("lstokenhealth")),
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/lingosentinel/token", async (req, res) => {
    applyCors(req, res);
    hardenConversationNoStore(res);
    const body = safeObj(req && req.body);
    const traceId = cleanText((req && req.sbTraceId) || body.traceId || makeTraceId("lstoken"));
    const mode = cleanText(body.mode || "group_room").toLowerCase();
    const roomId = cleanLingoSentinelRoomId(body.roomId || "sandbox-healthcheck");
    if (mode !== "group_room" || !roomId) {
      return res.status(400).json({ ok: false, stage: "token_rejected", reason: "invalid_room_or_mode", marionAuthority: true, publicSurface: "Nyx", traceId });
    }
    const channel = "ls:room:" + roomId;
    const capability = {};
    capability[channel] = ["subscribe", "presence"];
    const clientId = lingoSentinelPrivateClientId(body.clientId || "ls-listener", "listener");
    const tokenBuilt = await createLingoSentinelTokenRequestSafe({
      clientId,
      ttl: clampNumberEnv("LINGOSENTINEL_PUBLIC_TOKEN_TTL_MS", 10 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000),
      capability: JSON.stringify(capability)
    });
    if (!tokenBuilt.ok) {
      return res.status(503).json({ ok: false, stage: "ably_unavailable", reason: cleanText(tokenBuilt.error || "ably_unavailable"), marionAuthority: true, publicSurface: "Nyx", traceId });
    }
    const response = {
      ok: true,
      service: "lingosentinel-subscribe-token",
      version: LINGOSENTINEL_GATEWAY_INDEX_VERSION,
      stage: "token_ready",
      mode: "group_room",
      roomId,
      channel,
      eventName: "lingosentinel.message.group",
      capability,
      tokenRequest: tokenBuilt.tokenRequest,
      marionAuthority: true,
      publicSurface: "Nyx",
      liveScope: "sandbox_group",
      safeguards: { keyExposed: false, keyPrefixExposed: false, appIdExposed: false, noStore: true },
      traceId,
      timestamp: new Date().toISOString()
    };
    const leak = lingoSentinelSecretLeakCheck(response);
    response.safeguards.keyExposed = leak.keyExposed;
    response.safeguards.keyPrefixExposed = leak.keyPrefixExposed;
    response.safeguards.appIdExposed = leak.appIdExposed;
    return res.status(200).json(response);
  });
}

app.get("/api/lingosentinel/private/health", (req, res) => {
  applyCors(req, res);
  hardenConversationNoStore(res);
  const traceId = cleanText((req && req.sbTraceId) || (req && req.headers && req.headers["x-sb-trace-id"]) || makeTraceId("lsprivatehealth"));
  return res.status(200).json({
    ok: true,
    service: "lingosentinel-private-room",
    version: LINGOSENTINEL_PRIVATE_ROOM_VERSION,
    ablyConfigured: hasLingoSentinelAblyKeyConfigured(),
    privateRoomsConfigured: lingoSentinelPrivateRoomAllowlist().length,
    tokenTtlMs: LINGOSENTINEL_PRIVATE_TOKEN_TTL_MS,
    allowedRoles: LINGOSENTINEL_PRIVATE_ROOM_ROLES,
    marionAuthority: true,
    publicSurface: "Nyx",
    liveScope: "controlled_private",
    safeguards: { keyExposed: false, keyPrefixExposed: false, appIdExposed: false, noStore: true },
    traceId,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/lingosentinel/private/token", async (req, res) => {
  applyCors(req, res);
  hardenConversationNoStore(res);
  const body = safeObj(req && req.body);
  const traceId = cleanText((req && req.sbTraceId) || body.traceId || makeTraceId("lsprivatetoken"));
  const roomId = cleanLingoSentinelRoomId(body.roomId || LINGOSENTINEL_PRIVATE_ROOM_DEFAULT);
  const role = cleanLingoSentinelPrivateRole(body.role || "observer");

  if (!roomId || !isLingoSentinelPrivateRoomAllowed(roomId)) {
    return buildLingoSentinelPrivateDenied(res, 403, "private_room_not_allowed", "room_not_allowlisted", traceId);
  }
  if (!role) {
    return buildLingoSentinelPrivateDenied(res, 403, "private_role_rejected", "role_not_allowed", traceId);
  }

  const channel = "ls:room:" + roomId;
  const eventName = "lingosentinel.message.group";
  const clientId = lingoSentinelPrivateClientId(body.clientId, role);
  const capability = {};
  capability[channel] = role === "host" || role === "participant" ? ["subscribe", "presence", "publish"] : ["subscribe", "presence"];

  try {
    const tokenBuilt = await createLingoSentinelTokenRequestSafe({
      clientId,
      ttl: LINGOSENTINEL_PRIVATE_TOKEN_TTL_MS,
      capability: JSON.stringify(capability)
    });
    if (!tokenBuilt.ok) {
      return buildLingoSentinelPrivateDenied(res, 503, "ably_unavailable", tokenBuilt.error, traceId);
    }
    const tokenRequest = tokenBuilt.tokenRequest;
    const response = {
      ok: true,
      service: "lingosentinel-private-room",
      version: LINGOSENTINEL_PRIVATE_ROOM_VERSION,
      stage: "token_ready",
      roomId,
      role,
      clientId,
      channel,
      eventName,
      tokenTtlMs: LINGOSENTINEL_PRIVATE_TOKEN_TTL_MS,
      tokenRequest,
      marionAuthority: true,
      publicSurface: "Nyx",
      liveScope: "controlled_private",
      safeguards: { keyExposed: false, keyPrefixExposed: false, appIdExposed: false, noStore: true },
      traceId,
      timestamp: new Date().toISOString()
    };
    const leak = lingoSentinelSecretLeakCheck(response);
    response.safeguards.keyExposed = leak.keyExposed;
    response.safeguards.keyPrefixExposed = leak.keyPrefixExposed;
    response.safeguards.appIdExposed = leak.appIdExposed;
    return res.status(200).json(response);
  } catch (err) {
    return buildLingoSentinelPrivateDenied(res, 502, "token_exception", sanitizeLingoSentinelError(err), traceId);
  }
});

function buildLingoSentinelPrivatePublishInput(req, roomId, role, traceId) {
  const body = safeObj(req && req.body);
  const sender = safeObj(body.sender);
  const textValue = clipText(body.text || body.message || "Controlled private room activation test.", 900);
  return {
    mode: "group_room",
    roomId,
    text: textValue,
    sender: {
      id: cleanText(sender.id || body.senderId || "mac"),
      name: cleanText(sender.name || body.senderName || "Mac"),
      role,
      preferredLanguage: cleanText(sender.preferredLanguage || body.sourceLanguage || "en").toLowerCase()
    },
    sourceLanguage: cleanText(body.sourceLanguage || "en").toLowerCase(),
    targetLanguage: cleanText(body.targetLanguage || body.recipientLanguage || "multi").toLowerCase(),
    traceId,
    metadata: {
      testType: "controlled_private_room_activation",
      interactionSource: "render_backend_private_room",
      widgetSurface: "webflow_lingosentinel",
      liveScope: "controlled_private",
      publicSurface: "Nyx",
      marionAuthority: true,
      role,
      traceId
    }
  };
}

app.post("/api/lingosentinel/private/publish", async (req, res) => {
  applyCors(req, res);
  hardenConversationNoStore(res);
  const body = safeObj(req && req.body);
  const traceId = cleanText((req && req.sbTraceId) || body.traceId || makeTraceId("lsprivatepublish"));
  const roomId = cleanLingoSentinelRoomId(body.roomId || LINGOSENTINEL_PRIVATE_ROOM_DEFAULT);
  const role = cleanLingoSentinelPrivateRole(body.role || safeObj(body.sender).role || "host");

  if (!roomId || !isLingoSentinelPrivateRoomAllowed(roomId)) {
    return buildLingoSentinelPrivateDenied(res, 403, "private_room_not_allowed", "room_not_allowlisted", traceId);
  }
  if (!role || role === "observer") {
    return buildLingoSentinelPrivateDenied(res, 403, "private_role_rejected", "publish_role_not_allowed", traceId);
  }
  if (!hasLingoSentinelAblyKeyConfigured()) {
    return buildLingoSentinelPrivateDenied(res, 503, "ably_key_missing", "ably_not_configured", traceId);
  }
  const engine = lingoSentinelEngineMod;

  try {
    const input = buildLingoSentinelPrivatePublishInput(req, roomId, role, traceId);
    const channel = "ls:room:" + roomId;
    const eventName = "lingosentinel.message.group";
    let result = null;
    if (engine && typeof engine.publishGroupMessage === "function") {
      try {
        result = await engine.publishGroupMessage(input, {
          clientId: cleanText(process.env.LINGOSENTINEL_CLIENT_ID || "render-lingosentinel-private-publisher"),
          forceNewClient: true
        });
      } catch (err) {
        result = { ok: false, stage: "engine_publish_exception", error: sanitizeLingoSentinelError(err) };
      }
    }
    if (!result || result.ok !== true) {
      result = await directLingoSentinelAblyPublish(channel, eventName, {
        mode: input.mode,
        roomId: input.roomId,
        text: input.text,
        sender: input.sender,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        metadata: input.metadata
      }, traceId);
    }
    const response = {
      ok: result && result.ok === true,
      service: "lingosentinel-private-room",
      version: LINGOSENTINEL_PRIVATE_ROOM_VERSION,
      stage: cleanText(result && result.stage || "publish_failed"),
      mode: "group_room",
      roomId,
      role,
      channel: cleanText(result && result.channel || ("ls:room:" + roomId)),
      eventName: cleanText(result && result.eventName || "lingosentinel.message.group"),
      marionAuthority: true,
      publicSurface: "Nyx",
      liveScope: "controlled_private",
      safeguards: { keyExposed: false, keyPrefixExposed: false, appIdExposed: false, noStore: true },
      telemetry: {
        payloadShape: cleanText(result && result.telemetry && result.telemetry.payloadShape || "lingosentinel.signal"),
        traceId,
        publishedAt: cleanText(result && result.telemetry && result.telemetry.publishedAt || new Date().toISOString())
      },
      timestamp: new Date().toISOString()
    };
    if (!response.ok) response.error = sanitizeLingoSentinelError(result && result.errors && result.errors[0] || result && result.error || "publish_failed");
    const leak = lingoSentinelSecretLeakCheck(response);
    response.safeguards.keyExposed = leak.keyExposed;
    response.safeguards.keyPrefixExposed = leak.keyPrefixExposed;
    response.safeguards.appIdExposed = leak.appIdExposed;
    return res.status(response.ok ? 200 : 502).json(response);
  } catch (err) {
    return buildLingoSentinelPrivateDenied(res, 502, "publish_exception", sanitizeLingoSentinelError(err), traceId);
  }
});


STATIC_PUBLIC_DIRS.forEach((dir) => {
  app.use(express.static(dir));
});

if (fs.existsSync(AVATAR_PUBLIC_DIR)) {
  app.use("/avatar", express.static(AVATAR_PUBLIC_DIR, { fallthrough: true, index: false, immutable: false, maxAge: "5m" }));
  app.use("/public/avatar", express.static(AVATAR_PUBLIC_DIR, { fallthrough: true, index: false, immutable: false, maxAge: "5m" }));
}
if (fs.existsSync(AVATAR_ASSETS_DIR)) {
  app.use("/avatar/assets", express.static(AVATAR_ASSETS_DIR, { fallthrough: true, index: false, immutable: false, maxAge: "5m" }));
  app.use("/public/avatar/assets", express.static(AVATAR_ASSETS_DIR, { fallthrough: true, index: false, immutable: false, maxAge: "5m" }));
}

app.get(["/avatar/status", "/api/avatar/status"], (req, res) => {
  applyCors(req, res);
  const payload = avatarConfigPayload();
  return res.status(payload.ok ? 200 : 404).json({
    ok: payload.ok,
    avatar: payload,
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      route: req.originalUrl || req.path || "",
      videoResolved: !!avatarVideoFile(),
      fallbackResolved: !!avatarFallbackImageFile()
    }
  });
});

app.get(["/avatar/video", "/api/avatar/video"], (req, res) => {
  applyCors(req, res);
  const filePath = avatarVideoFile();
  if (sendAvatarFile(res, filePath)) return;
  return res.status(404).json({ ok: false, error: "not_found", path: req.path, meta: { v: PUBLIC_INDEX_VERSION, t: now(), avatar: avatarConfigPayload() } });
});

app.get(["/avatar/fallback", "/api/avatar/fallback"], (req, res) => {
  applyCors(req, res);
  const filePath = avatarFallbackImageFile();
  if (sendAvatarFile(res, filePath)) return;
  return res.status(404).json({ ok: false, error: "not_found", path: req.path, meta: { v: PUBLIC_INDEX_VERSION, t: now(), avatar: avatarConfigPayload() } });
});

app.get(["/avatar/assets/:fileName", "/public/avatar/assets/:fileName", "/api/avatar/assets/:fileName"], (req, res) => {
  applyCors(req, res);
  const requested = cleanEnvAvatarBasename(req.params && req.params.fileName);
  const filePath = resolveAvatarAssetFile(requested);
  if (sendAvatarFile(res, filePath)) return;
  return res.status(404).json({
    ok: false,
    error: "not_found",
    path: req.path,
    requested,
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      avatar: avatarConfigPayload()
    }
  });
});

app.get(["/api/avatar/config.js", "/avatar/config.js", "/avatar/script.js"], (req, res) => {
  applyCors(req, res);
  const payload = avatarConfigPayload();
  res.type("application/javascript; charset=utf-8");
  return res.send(
    `window.SB_NYX_AVATAR_SRC=${JSON.stringify(payload.avatarSrc)};
` +
    `window.SB_NYX_AVATAR_FALLBACK_SRC=${JSON.stringify(payload.fallbackSrc)};
` +
    `window.SB_NYX_AVATAR_STATUS=${JSON.stringify(payload.statusUrl)};
` +
    `window.SB_NYX_AVATAR_DIRECT_VIDEO=${JSON.stringify(payload.directVideo)};
` +
    `window.SB_NYX_AVATAR_CONFIG=${JSON.stringify(payload)};
`
  );
});


app.all(["/api/chat", "/api/chat/", "/chat", "/chat/", "/respond", "/respond/"], (req, res) => {
  if (req.method === "POST") {
    hardenCors(req, res);
    return res.status(503).json({
      ok: false,
      error: "conversation_route_fell_through",
      path: req.path,
      detail: "Conversation route alias reached the final guard instead of the POST handler.",
      meta: { v: PUBLIC_INDEX_VERSION, t: now(), diagnostics: buildConversationRouteDiagnostics(req) }
    });
  }
  return sendConversationMethodDiagnostic(req, res);
});

app.use("/api", (req, res) => {
  applyCors(req, res);
  const requestPath = cleanText(req.originalUrl || req.path || "");
  const likelyNewsCanadaMiss = /newscanada|foryourlife|for-your-life|topstory|top-story|editorspick|editors-pick|editorspicks|editor-picks/i.test(requestPath);
  return res.status(404).json({
    ok: false,
    error: "not_found",
    path: req.path,
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      routeHints: likelyNewsCanadaMiss ? buildNewsCanadaRouteHints() : undefined,
      likelyNewsCanadaMiss
    }
  });
});

app.use((req, res, next) => {
  if (res.headersSent) return next();
  applyCors(req, res);
  const requestPath = cleanText(req.originalUrl || req.path || "");
  const likelyNewsCanadaMiss = /newscanada|foryourlife|for-your-life|topstory|top-story|editorspick|editors-pick|editorspicks|editor-picks/i.test(requestPath);
  return res.status(404).json({
    ok: false,
    error: "not_found",
    path: requestPath || req.path,
    meta: {
      v: PUBLIC_INDEX_VERSION,
      t: now(),
      routeHints: likelyNewsCanadaMiss ? buildNewsCanadaRouteHints() : undefined,
      likelyNewsCanadaMiss
    }
  });
});

app.use((err, req, res, _next) => {
  applyCors(req, res);
  if (res.headersSent) return;

  const traceId = cleanText((req && (req.sbTraceId || (req.headers && req.headers["x-sb-trace-id"]))) || makeTraceId("error"));
  const isBodySyntax = !!(err && (err.type === "entity.parse.failed" || err instanceof SyntaxError));
  const isTooLarge = !!(err && err.type === "entity.too.large");
  const statusCode = isBodySyntax ? 400 : (isTooLarge ? 413 : clamp(Number((err && (err.statusCode || err.status)) || 500), 400, 599));
  const errorCode = isBodySyntax ? "invalid_json" : (isTooLarge ? "payload_too_large" : "server_error");
  const detail = isBodySyntax
    ? "Request body contains invalid JSON."
    : (isTooLarge ? "Request body exceeded the allowed size limit." : cleanText(err && (err.message || err) || "server error"));

  console.log("[Sandblast][express:error]", {
    traceId,
    statusCode,
    errorCode,
    path: req && (req.originalUrl || req.url || req.path || ""),
    detail
  });

  hardenCors(req, res);
  return res.status(statusCode).json({
    ok: false,
    error: errorCode,
    detail,
    traceId,
    meta: { v: PUBLIC_INDEX_VERSION, t: now() }
  });
});

app.get("*", (req, res, next) => {
  for (const dir of STATIC_PUBLIC_DIRS) {
    const p = path.join(dir, "index.html");
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  return next();
});


function loadNewsCanadaEditorsPicksFromDisk(options = {}) {
  /*
   * Export-compatibility loader.
   *
   * Earlier index builds exported loadNewsCanadaEditorsPicksFromDisk, but the
   * active News Canada path now delegates through the RSS/feed service and cache
   * contract readers. Keeping this loader defined prevents boot-time
   * ReferenceError while preserving the current service-first behavior.
   */
  const opts = isObj(options) ? options : {};
  const limit = clamp(Number(opts.limit || 0) || 0, 0, 100);
  const loadedAt = Date.now();

  const shape = (payload, source, extraMeta = {}) => {
    const rawItems = Array.isArray(payload && payload.items)
      ? payload.items
      : (Array.isArray(payload && payload.stories) ? payload.stories : []);
    const items = normalizeNewsCanadaFeed(limit > 0 ? rawItems.slice(0, limit) : rawItems);
    const meta = {
      ...(isObj(payload && payload.meta) ? payload.meta : {}),
      ...(isObj(extraMeta) ? extraMeta : {}),
      source: cleanText(source || (payload && payload.meta && (payload.meta.source || payload.meta.servedFrom)) || "disk_loader") || "disk_loader",
      loadedAt,
      count: items.length,
      storyCount: items.length,
      itemCount: items.length,
      exportCompatibility: true,
      loader: "loadNewsCanadaEditorsPicksFromDisk"
    };

    return {
      ok: items.length > 0 && payload && payload.ok !== false,
      items,
      stories: items,
      slides: items,
      chips: [],
      count: items.length,
      storyCount: items.length,
      itemCount: items.length,
      availableStories: items.length,
      meta
    };
  };

  try {
    if (typeof readNewsCanadaCacheContractFile === "function") {
      const cache = readNewsCanadaCacheContractFile();
      if (cache && (Array.isArray(cache.items) || Array.isArray(cache.stories))) {
        const out = shape(cache, "cache_contract_export_loader", {
          cacheContractPath: cache.meta && cache.meta.cacheContractPath,
          cacheContractCandidates: typeof getNewsCanadaCacheContractPaths === "function"
            ? getNewsCanadaCacheContractPaths()
            : []
        });

        if (out.items.length) return out;
      }
    }
  } catch (err) {
    return {
      ok: false,
      items: [],
      stories: [],
      slides: [],
      chips: [],
      count: 0,
      storyCount: 0,
      itemCount: 0,
      availableStories: 0,
      meta: {
        source: "cache_contract_export_loader_error",
        degraded: true,
        loadedAt,
        error: cleanText(err && (err.message || err) || "cache_contract_loader_failed")
      }
    };
  }

  try {
    if (typeof readNewsCanadaSnapshot === "function") {
      const snapshot = readNewsCanadaSnapshot();
      if (snapshot && Array.isArray(snapshot.items) && snapshot.items.length) {
        return shape(snapshot, "snapshot_export_loader", {
          degraded: true,
          mode: "snapshot",
          cacheFile: typeof NEWS_CANADA_CACHE_FILE !== "undefined" ? NEWS_CANADA_CACHE_FILE : ""
        });
      }
    }
  } catch (err) {
    return {
      ok: false,
      items: [],
      stories: [],
      slides: [],
      chips: [],
      count: 0,
      storyCount: 0,
      itemCount: 0,
      availableStories: 0,
      meta: {
        source: "snapshot_export_loader_error",
        degraded: true,
        loadedAt,
        error: cleanText(err && (err.message || err) || "snapshot_loader_failed")
      }
    };
  }

  return {
    ok: false,
    items: [],
    stories: [],
    slides: [],
    chips: [],
    count: 0,
    storyCount: 0,
    itemCount: 0,
    availableStories: 0,
    meta: {
      source: "disk_loader_empty",
      degraded: true,
      stale: true,
      loadedAt,
      feedUrl: typeof resolveNewsCanadaFeedUrl === "function" ? resolveNewsCanadaFeedUrl() : resolveNewsCanadaDataFile(),
      cacheContractCandidates: typeof getNewsCanadaCacheContractPaths === "function"
        ? getNewsCanadaCacheContractPaths()
        : []
    }
  };
}


function resolveNewsCanadaDataFile() {
  return cleanText(process.env.NEWS_CANADA_RSS_FEED_URL || process.env.SB_NEWSCANADA_RSS_FEED_URL || "");
}

function normalizeNewsCanadaFeed(feed) {
  const src = Array.isArray(feed) ? feed : [];
  return src.map((story) => (isObj(story) ? story : {})).filter((story) => Object.keys(story).length > 0);
}

function hydrateNewsCanadaLocals(store, extraMeta) {
  return { store, extraMeta, delegated: true };
}

function getNewsCanadaCandidateDiagnostics() {
  return newsCanadaFeedService && typeof newsCanadaFeedService.health === "function"
    ? newsCanadaFeedService.health()
    : {
        ok: false,
        source: "service_unavailable",
        degraded: true,
        mode: "rss",
        feedUrl: resolveNewsCanadaDataFile()
      };
}

if (newscanadaCacheJobMod && typeof newscanadaCacheJobMod.startNewsCanadaCacheJob === "function") {
  try {
    newscanadaCacheJobMod.startNewsCanadaCacheJob({ intervalMs: clamp(Number(process.env.NEWS_CANADA_CACHE_REFRESH_MS || 10 * 60 * 1000), 60 * 1000, 60 * 60 * 1000) });
  } catch (err) {
    console.log("[Sandblast][newscanadaCacheJob:start_error]", err && (err.stack || err.message || err));
  }
}

setTimeout(() => {
  startNewsCanadaAutoIngest().catch((err) => {
    console.log("[Sandblast][newscanada:auto_ingest_start_error]", err && (err.stack || err.message || err));
  });
}, clamp(Number(process.env.NEWS_CANADA_AUTO_INGEST_DELAY_MS || 15000), 1000, 120000)).unref();


async function startNewsCanadaAutoIngest() {
  try {
    const service = getNewsCanadaService();
    const seeded = readNewsCanadaCacheContractFile();
    const seededIsPlaceholder = !!(seeded && seeded.items && seeded.items.length && isNewsCanadaSeedPayload(seeded));

    if (service && typeof service.fetchRSS === "function") {
      const result = await Promise.resolve(service.fetchRSS({ refresh: seededIsPlaceholder }));
      const items = Array.isArray(result && result.items) ? result.items : (Array.isArray(result && result.stories) ? result.stories : []);
      if (items.length && !isNewsCanadaSeedPayload(result)) {
        writeNewsCanadaSnapshot({
          ...(isObj(result) ? result : {}),
          items,
          stories: items
        });
        writeNewsCanadaCacheContractFile({
          ...(isObj(result) ? result : {}),
          items,
          stories: items,
          ok: result && result.ok !== false
        }, {
          ...(isObj(result && result.meta) ? result.meta : {}),
          servedFrom: "auto_ingest_switch",
          detail: seededIsPlaceholder ? "auto_ingest_replaced_seed_cache" : cleanText(result && result.meta && result.meta.detail || "auto_ingest_cache_verified"),
          stale: false,
          degraded: false,
          lastSuccessAt: Number(result && result.meta && result.meta.fetchedAt || now())
        });
        return;
      }
    }

    if (newsCanadaFeedService && typeof newsCanadaFeedService.fetchRSS === "function") {
      const fallback = await Promise.resolve(newsCanadaFeedService.fetchRSS({ refresh: true }));
      const items = Array.isArray(fallback && fallback.items) ? fallback.items : (Array.isArray(fallback && fallback.stories) ? fallback.stories : []);
      if (items.length && !isNewsCanadaSeedPayload(fallback)) {
        writeNewsCanadaSnapshot({
          ...(isObj(fallback) ? fallback : {}),
          items,
          stories: items
        });
        writeNewsCanadaCacheContractFile({
          ...(isObj(fallback) ? fallback : {}),
          items,
          stories: items,
          ok: fallback && fallback.ok !== false
        }, {
          ...(isObj(fallback && fallback.meta) ? fallback.meta : {}),
          servedFrom: "auto_ingest_switch",
          detail: seededIsPlaceholder ? "auto_ingest_replaced_seed_cache" : cleanText(fallback && fallback.meta && fallback.meta.detail || "auto_ingest_live_write"),
          stale: false,
          degraded: false,
          lastSuccessAt: Number(fallback && fallback.meta && fallback.meta.fetchedAt || now())
        });
      }
    }
  } catch (err) {
    console.log("[Sandblast][newscanada:auto_ingest_error]", err && (err.stack || err.message || err));
  }
}

const server = app.listen(PORT, () => {
  console.log(`[Sandblast] ${INDEX_VERSION} listening on :${PORT}`);
  try {
    const emotionHealth = getMarionEmotionRuntimeHealth();
    console.log("[Sandblast][marion-emotion-runtime]", {
      ok: !!emotionHealth.ok,
      loaded: !!marionEmotionRuntimeMod,
      mode: "resolved_state_only",
      route: "/api/marion/emotion/health"
    });
  } catch (_) {}
});

function gracefulShutdown(signal) {
  try {
    console.log(`[Sandblast][shutdown] ${signal}`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  } catch (_) {
    process.exit(0);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

module.exports = {
  app,
  server,
  INDEX_VERSION,
  NYX_VOICE_TRANSCRIPT_ROUTE_VERSION,
  NYX_VOICE_TRANSCRIPT_ROUTES,
  NYX_VOICE_TRANSCRIPT_HEALTH_ROUTES,
  NYX_VOICE_DEPLOYMENT_PARITY_VERSION,
  NYX_VOICE_REQUIRED_RUNTIME_FILES,
  nyxVoiceRequiredRuntimeDiagnostics,
  nyxVoiceRuntimeFilesReady,
  loadNewsCanadaEditorsPicksFromDisk,
  resolveNewsCanadaDataFile,
  normalizeNewsCanadaFeed,
  hydrateNewsCanadaLocals,
  getNewsCanadaCandidateDiagnostics,
  writeNewsCanadaCacheContractFile,
  isNewsCanadaSeedPayload,
  resolveMusicDataFile,
  loadMusicFromDisk,
  dispatchMusicBridge,
  normalizeMusicBridgeInput,
  normalizeMusicBridgeResponse,
  shapeEngineReply,
  repairBridgeEnvelope,
  repairEngineContract,
  buildSpeechContract,
  normalizeVoiceRouteResponse,
  attachVoiceRoute,
  getStateSpine,
  setStateSpine,
  finalizeStateSpineForTurn,
  normalizeMarionContract,
  validateMarionContract,
  enforceMarionContract,
  applyContinuityStitch,
  buildLoggingSpine,
  extractRuntimeTelemetryPacket,
  normalizeIndexInputForMarion,
  applyIndexLanguageSphereToTrustedFinal,
  extractLanguageSphereRequestFromRequest,
  shouldResetConversationFromRequest,
  shouldBypassPriorMemoryForCurrentTurn,
  shouldUseLanguageSphereDirectTranslation,
  buildLanguageSphereDirectTranslationResponse,
  getLanguageSphereApiMiddleware,
  normalizeIndexMiddlewareTargetLanguage,
  shouldApplyLanguageSphereApiMiddleware,
  buildLanguageSphereApiPayload,
  applyLanguageSphereApiMiddlewareToNorm,
  buildIndexRuntimeTelemetry,
  buildLastMileRecoveryReply,
  applyPublicReplyHygieneToResponse
};
