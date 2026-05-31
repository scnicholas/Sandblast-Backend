"use strict";

/**
 * finalRenderTelemetry.js
 *
 * Final Render Telemetry hardlock.
 * ------------------------------------------------------------
 * PURPOSE
 * - Verify the final public reply is renderable user-facing text only.
 * - Keep final-envelope, sessionPatch, runtimeTelemetry, routing, and confidence details internal.
 * - Provide a pure, transport-safe telemetry object that downstream layers can attach without
 *   altering Marion authority or composing a replacement answer.
 */

const VERSION = "finalRenderTelemetry v1.0.0 FINAL-RENDER-TELEMETRY-HARDLOCK";
const FINAL_RENDER_TELEMETRY_VERSION = "nyx.marion.finalRenderTelemetry/1.0";

const PUBLIC_RENDER_BLOCKED_PATTERNS = Object.freeze([
  /\bfailureSignature\b/i,
  /\bfailureSignatureAudit\b/i,
  /\bruntimeTelemetry\b/i,
  /\bfinalRenderTelemetry\b/i,
  /\breplyAuthority\b/i,
  /\bfinalAuthority\b/i,
  /\bfinalEnvelopeTrusted\b/i,
  /\bcanEmit\b/i,
  /\bsessionPatch\b/i,
  /\bmemoryPatch\b/i,
  /\brouteKind\b/i,
  /\bspeechHints\b/i,
  /\bpresenceProfile\b/i,
  /\bnyxStateHint\b/i,
  /\btransportSafe\b/i,
  /\bdiagnostics?\b/i,
  /\bfinalEnvelope\b/i,
  /\bdomainConfidence\b/i,
  /\bconfidenceScore\b/i,
  /\bconfidenceBand\b/i,
  /\bprimaryDomain\b/i,
  /\bsecondaryDomains\b/i,
  /\bMARION::FINAL::/i,
  /\bMARION_FINAL_AUTHORITY\b/i,
  /\bCHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2}\b/i,
  /\bnyx\.marion\.(?:final|stateSpine|domainConfidence|finalRuntimeTelemetry|progressionTelemetry)\//i,
  /\b(routeKind|speechHints|presenceProfile|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|nyxStateHint)\s*=/i
]);

function safeStr(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function safeObj(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function hashText(value) {
  const source = safeStr(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function hasPublicRenderLeak(value = "") {
  const text = safeStr(value);
  if (!text) return false;
  return PUBLIC_RENDER_BLOCKED_PATTERNS.some((rx) => rx.test(text));
}

function sanitizeFinalRenderedReply(value = "") {
  let text = safeStr(value);
  if (!text) return "";
  if (!hasPublicRenderLeak(text)) return text;

  text = text
    .replace(/\b(?:failureSignature|failureSignatureAudit|runtimeTelemetry|finalRenderTelemetry|replyAuthority|finalAuthority|finalEnvelopeTrusted|canEmit|sessionPatch|memoryPatch|routeKind|speechHints|presenceProfile|nyxStateHint|transportSafe|diagnostics?|finalEnvelope|domainConfidence|confidenceScore|confidenceBand|primaryDomain|secondaryDomains)\s*[:=]\s*[^.;,}\]\n]+/gi, "")
    .replace(/\b(routeKind|speechHints|presenceProfile|finalEnvelope|sessionPatch|marionFinal|transportSafe|replyAuthority|nyxStateHint)\s*=\s*[^.;,}\]\n]+/gi, "")
    .replace(/MARION::FINAL::[^\s.;,}\]]+/gi, "")
    .replace(/MARION_FINAL_AUTHORITY/gi, "")
    .replace(/CHATENGINE_COORDINATOR_ONLY_ACTIVE_\d{4}_\d{2}_\d{2}/gi, "")
    .replace(/nyx\.marion\.(?:final|stateSpine|domainConfidence|finalRuntimeTelemetry|progressionTelemetry)\/[0-9.]+/gi, "")
    .replace(/\s+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (/^\s*[\[{]/.test(text) && hasPublicRenderLeak(text)) return "";
  return text;
}

function finalReplyLooksRenderable(value = "") {
  const text = safeStr(value);
  if (!text) return false;
  if (text.length < 2) return false;
  if (/^\s*(true|false|null|undefined|nan|\[object object\])\s*$/i.test(text)) return false;
  if (hasPublicRenderLeak(text)) return false;
  return true;
}

function buildFinalRenderTelemetry({
  source = "finalRenderTelemetry",
  stage = "final",
  reply = "",
  sanitizedReply = "",
  canEmit = true,
  finalEnvelopeTrusted = false,
  runtimeTelemetry = {},
  domainConfidence = {},
  progressionTelemetry = {},
  error = ""
} = {}) {
  const rt = safeObj(runtimeTelemetry);
  const dc = safeObj(domainConfidence || rt.domainConfidence);
  const pg = safeObj(progressionTelemetry || rt.progressionTelemetry);
  const rawReply = safeStr(reply);
  const cleanReply = safeStr(sanitizedReply || sanitizeFinalRenderedReply(rawReply));
  const leakBlocked = rawReply !== cleanReply || hasPublicRenderLeak(rawReply);
  const renderable = finalReplyLooksRenderable(cleanReply);
  return {
    version: FINAL_RENDER_TELEMETRY_VERSION,
    source: safeStr(source),
    stage: safeStr(stage || (canEmit ? "final" : "awaiting_marion")),
    active: true,
    publicSurfaceClean: renderable && !hasPublicRenderLeak(cleanReply),
    renderable,
    leakBlocked,
    debugLeakBlocked: leakBlocked,
    userVisible: false,
    canEmit: !!canEmit && renderable,
    finalEnvelopeTrusted: !!finalEnvelopeTrusted,
    replyHash: cleanReply ? hashText(cleanReply) : "",
    rawReplyHash: rawReply ? hashText(rawReply) : "",
    domainConfidenceObserved: !!Object.keys(dc).length,
    primaryDomain: safeStr(dc.primaryDomain || dc.domain || rt.primaryDomain || rt.domain || ""),
    confidenceBand: safeStr(dc.band || dc.confidenceBand || rt.confidenceBand || ""),
    progressionObserved: !!Object.keys(pg).length,
    progressionLane: safeStr(pg.lane || pg.activePhase || ""),
    failureSignature: leakBlocked ? "DEBUG_LEAK_BLOCKED" : safeStr(rt.failureSignature || "none"),
    error: safeStr(error || rt.error || ""),
    updatedAt: Date.now()
  };
}

function applyFinalRenderTelemetryToPacket(packet = {}, options = {}) {
  const p = safeObj(packet);
  const reply = safeStr(options.reply || p.reply || p.text || p.answer || p.output || p.response || safeObj(p.finalEnvelope).reply || "");
  const sanitizedReply = sanitizeFinalRenderedReply(reply);
  const telemetry = buildFinalRenderTelemetry({
    ...safeObj(options),
    reply,
    sanitizedReply,
    runtimeTelemetry: options.runtimeTelemetry || p.runtimeTelemetry || safeObj(p.finalEnvelope).runtimeTelemetry,
    domainConfidence: options.domainConfidence || p.domainConfidence || safeObj(p.routing).domainConfidence,
    progressionTelemetry: options.progressionTelemetry || p.progressionTelemetry,
    finalEnvelopeTrusted: options.finalEnvelopeTrusted !== undefined ? options.finalEnvelopeTrusted : !!(p.final || p.marionFinal || safeObj(p.finalEnvelope).marionFinal),
    canEmit: options.canEmit !== undefined ? options.canEmit : !!(p.final || p.ok || p.emit)
  });
  return {
    ...p,
    reply: sanitizedReply || reply,
    text: sanitizedReply || reply,
    answer: sanitizedReply || reply,
    output: sanitizedReply || reply,
    response: sanitizedReply || reply,
    finalRenderTelemetry: telemetry,
    runtimeTelemetry: {
      ...safeObj(p.runtimeTelemetry),
      finalRenderTelemetry: telemetry,
      finalRenderTelemetryActive: true
    }
  };
}

module.exports = {
  VERSION,
  FINAL_RENDER_TELEMETRY_VERSION,
  PUBLIC_RENDER_BLOCKED_PATTERNS,
  hasPublicRenderLeak,
  sanitizeFinalRenderedReply,
  finalReplyLooksRenderable,
  buildFinalRenderTelemetry,
  applyFinalRenderTelemetryToPacket,
  default: buildFinalRenderTelemetry
};
