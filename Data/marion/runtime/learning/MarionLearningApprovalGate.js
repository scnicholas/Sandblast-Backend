"use strict";

const VERSION = "marion.learningApprovalGate/1.0";

function clean(value, limit = 120) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function createApprovalGate({ proposalStore, auditStore, clock = () => new Date().toISOString() } = {}) {
  if (!proposalStore || typeof proposalStore.get !== "function" || typeof proposalStore.set !== "function") {
    throw new TypeError("proposalStore.get/set are required; proposals must use private durable storage");
  }
  if (!auditStore || typeof auditStore.append !== "function") throw new TypeError("auditStore.append is required");

  async function submitEvaluation(report) {
    if (!report || report.validated !== true || report.state !== "awaiting_owner_approval" || report.liveBehaviorChanged === true) {
      return { ok: false, reason: "evaluation_not_approvable" };
    }
    const proposalId = clean(report.proposalId);
    if (!proposalId) return { ok: false, reason: "proposal_id_required" };
    const record = Object.freeze({ ...report, state: "awaiting_owner_approval", submittedAt: clock() });
    await proposalStore.set(proposalId, record);
    await auditStore.append({ type: "learning_proposal_submitted", proposalId, candidateVersion: clean(report.candidateVersion), state: record.state });
    return { ok: true, proposalId, state: record.state, liveBehaviorChanged: false };
  }

  async function decide({ proposalId, decision, authContext, approvalId, reason = "" } = {}) {
    const id = clean(proposalId);
    const actorId = clean(authContext && authContext.actorId);
    const authorized = !!(authContext && authContext.authenticated === true && authContext.role === "owner" && authContext.verifiedBy === "server_middleware" && actorId);
    if (!authorized) return { ok: false, reason: "owner_authentication_required" };
    if (!id || !["approve", "reject"].includes(decision)) return { ok: false, reason: "invalid_decision" };
    const proposal = await proposalStore.get(id);
    if (!proposal || proposal.state !== "awaiting_owner_approval" || proposal.validated !== true) return { ok: false, reason: "proposal_not_decidable" };
    const resolvedState = decision === "approve" ? "approved_for_release_review" : "rejected_by_owner";
    const updated = Object.freeze({ ...proposal, state: resolvedState, decidedAt: clock(), decision, approvalId: clean(approvalId), decisionReason: clean(reason, 300), decidedBy: actorId });
    await proposalStore.set(id, updated);
    await auditStore.append({
      type: "learning_owner_decision", proposalId: id, decision, state: resolvedState,
      candidateVersion: proposal.candidateVersion, actorId, approvalId: clean(approvalId), at: clock(),
      activationMode: "separate_release_pipeline", liveBehaviorChanged: false
    });
    return { ok: true, proposalId: id, state: resolvedState, liveBehaviorChanged: false, releaseRequired: decision === "approve" };
  }

  return Object.freeze({ VERSION, submitEvaluation, decide });
}

module.exports = { VERSION, createApprovalGate };
