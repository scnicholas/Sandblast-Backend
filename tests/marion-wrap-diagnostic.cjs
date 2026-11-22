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
    rejectionReasons: result?.diagnostics?.loopGuard?.finalBoundaryReasons
  }, null, 2));
}

main().catch(error => {
  console.error("DIAGNOSTIC_FAILED", safeErrorCode(error));
  process.exitCode = 1;
});
