"use strict";

// Marion signed-final diagnostic — read-only synthetic input, no application changes.
// Run from the Sandblast backend repository root:
//   node .\marion-wrap-diagnostic.cjs
// Synthetic data deliberately carries no server-verified private session.

const path = require("node:path");

const bridgePath = path.resolve(__dirname, "Data", "marion", "runtime", "marionBridge.js");

function safeErrorCode(error) {
  return typeof error?.code === "string" && error.code.length <= 100
    ? error.code
    : typeof error?.name === "string" && error.name.length <= 100
      ? error.name
      : "UNKNOWN_ERROR";
}


// Only bounded, code-like diagnostics are emitted. Never stringify complete packets.
function safeCode(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,90}$/.test(value)
    ? value : null;
}
function safeCodes(value) {
  if (!Array.isArray(value)) return [];
  return value.map(safeCode).filter(Boolean).slice(0, 16);
}
function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function status(value) {
  return typeof value === "boolean" ? value : "missing";
}
function builderSnapshot(value) {
  const s = safeObject(value);
  if (!Object.keys(s).length) return { present: false };
  // Allowlist based on marionFinalBuilderSnapshot(), not source object spread.
  return {
    present: true,
    ok: status(s.ok),
    final: status(s.final),
    marionFinal: status(s.marionFinal),
    canEmit: status(s.canEmit),
    envelopeFinal: status(s.envelopeFinal),
    envelopeMarionFinal: status(s.envelopeMarionFinal),
    currentTurnBound: status(s.currentTurnBound),
    semanticAuthorityMarion: status(s.semanticAuthorityMarion),
    signaturePresent: status(s.signaturePresent),
    replyHashMatches: status(s.replyHashMatches),
    completionComplete: status(s.completionComplete),
    trustAllowsEmit: status(s.trustAllowsEmit),
    contractReasons: safeCodes(s.contractReasons),
    validationReasons: safeCodes(s.validationReasons)
  };
}
function authorityDiagnostics(packet) {
  const p = safeObject(packet);
  const diagnostics = safeObject(p.diagnostics);
  const loop = safeObject(diagnostics.loopGuard);
  const envelope = safeObject(p.finalEnvelope);
  const envDiagnostics = safeObject(envelope.diagnostics);
  const boundary = loop.finalBoundaryReasons ?? diagnostics.finalBoundaryReasons ??
    envDiagnostics.finalBoundaryReasons;
  const snapshot = loop.finalBuilderAuthoritySnapshot ??
    loop.finalBuilderSnapshot ?? diagnostics.finalBuilderAuthoritySnapshot ??
    diagnostics.finalBuilderSnapshot;
  return {
    bridgeReason: safeCode(diagnostics.reason) || "missing",
    fallbackDetected: diagnostics.localFinalFallback === true,
    boundaryReasonsPresent: Array.isArray(boundary),
    boundaryReasons: safeCodes(boundary),
    builder: builderSnapshot(snapshot),
    diagnosticLocation: Array.isArray(loop.finalBoundaryReasons) ||
      loop.finalBuilderAuthoritySnapshot !== undefined ? "diagnostics.loopGuard" :
      (boundary !== undefined || snapshot !== undefined ? "alternate_diagnostics" : "not_returned")
  };
}

async function main() {
  let bridge;
  try {
    bridge = require(bridgePath);
  } catch (error) {
    console.error("BRIDGE_LOAD_FAILED", safeErrorCode(error));
    process.exitCode = 1;
    return;
  }

  if (typeof bridge?._internal?.wrapFinal !== "function") {
    console.error("WRAP_FINAL_EXPORT_UNAVAILABLE");
    process.exitCode = 1;
    return;
  }

  const reply = "Here is a concise, current-turn response that preserves the requested answer.";
  const result = await bridge._internal.wrapFinal({
    normalized: {
      ok: true,
      userQuery: "Give me one concise next step.",
      turnId: "runtime-bundle-turn",
      sessionId: "runtime-bundle-session",
      domain: "general",
      original: {}
    },
    routed: {
      ok: true,
      intent: "simple_chat",
      domain: "general",
      marionIntent: { intent: "simple_chat" },
      routing: { intent: "simple_chat", domain: "general" }
    },
    contract: {
      ok: true,
      reply,
      text: reply,
      spokenText: reply,
      intent: "simple_chat",
      domain: "general"
    },
    loopGuardResult: {
      ok: true,
      allowReply: true,
      forceRecovery: false,
      reasons: []
    },
    resolvedEmotionPacket: { ok: false, state: {} }
  });

  const envelope = result?.finalEnvelope || {};
  const completion = envelope.completionStatus || {};
  const trust = envelope.adaptiveTrustVerification || {};
  const validation = envelope.validation || {};

  // Intentionally avoids printing reply text, tokens, session IDs and signatures.
  console.log(JSON.stringify({
    ok: result?.ok,
    final: result?.final,
    marionFinal: result?.marionFinal,
    canEmit: result?.canEmit,
    error: result?.error,
    stage: result?.stage,
    envelopePresent: !!result?.finalEnvelope,
    envelopeFinal: envelope.final,
    envelopeMarionFinal: envelope.marionFinal,
    signaturePresent: !!envelope.signature,
    currentTurnBound: envelope.currentTurnBound,
    semanticAuthority: envelope.semanticAuthority,
    requiresRetry: result?.requiresRetry,
    recoverySuggested: result?.recoverySuggested,
    completionComplete: completion.complete,
    completionReason: completion.reason,
    completionRequiresRetry: completion.requiresRetry,
    trustAllowsEmit: trust.allowEmit,
    trustReasons: trust.reasons,
    replyValidationReasons: validation.finalReply?.reasons,
    contractValidationReasons: validation.replyContract?.reasons,
    rejectionReasons: safeCodes(result?.diagnostics?.loopGuard?.finalBoundaryReasons),
    builderRejection: authorityDiagnostics(result)
  }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error("DIAGNOSTIC_FAILED", safeErrorCode(error));
    process.exitCode = 1;
  });
}

module.exports = { authorityDiagnostics, builderSnapshot, safeCodes };
