export function adaptGuardianResponse(raw = {}, fallback = {}) {
  const result = raw.result || {};
  const envelope = raw.finalEnvelope || result.finalEnvelope || {};
  const meta = result.meta || raw.meta || {};

  const directReply =
    raw.directReply ||
    raw.reply ||
    raw.publicReply ||
    raw.visibleReply ||
    result.reply ||
    result.publicReply ||
    envelope.reply ||
    "Marion received a runtime packet, but no clean reply field was exposed.";

  return {
    guardian: fallback.guardian || raw.guardian || "marion",
    guardianMode: fallback.guardianMode || raw.guardianMode || "marion",
    directReply,
    contextSummary:
      raw.contextSummary ||
      result.contextSummary ||
      meta.contextSummary ||
      "No context summary exposed yet.",
    currentObjective:
      raw.currentObjective ||
      result.currentObjective ||
      fallback.currentObjective ||
      "Maintain Marion admin continuity.",
    systemState:
      raw.systemState ||
      result.systemState ||
      (raw.ok ? "online" : "unknown"),
    nextAction:
      raw.nextAction ||
      result.nextAction ||
      "Review runtime output and continue validation.",
    riskLevel:
      raw.riskLevel ||
      result.riskLevel ||
      "low",
    approvalRequired:
      Boolean(raw.approvalRequired || result.approvalRequired),
    traceId:
      raw.traceId ||
      result.traceId ||
      fallback.traceId ||
      "",
    rawRuntimeAvailable: true
  };
}
