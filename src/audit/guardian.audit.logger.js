const auditLog = [];

export function logGuardianEvent(event = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    guardian: event.guardian || "marion",
    type: event.type || "runtime",
    input: event.input || "",
    decision: event.decision || "",
    approvalRequired: Boolean(event.approvalRequired),
    approvedBy: event.approvedBy || null,
    route: event.route || "",
    traceId: event.traceId || ""
  };

  auditLog.push(entry);

  if (auditLog.length > 500) {
    auditLog.shift();
  }

  return entry;
}

export function getGuardianAuditLog(limit = 50) {
  return auditLog.slice(-limit);
}
