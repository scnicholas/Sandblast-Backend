"use strict";

const VERSION = "marion.learningApprovalGate/1.3-audited-owner-boundary";
const { isVerifiedOwner } = require("./MarionLearningRuntime");
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/;

function clean(value, limit = 120) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function plainDataRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(descriptors).every(key => typeof key === "string" &&
    descriptors[key].enumerable && Object.prototype.hasOwnProperty.call(descriptors[key], "value"));
}

function canonicalTimestamp(clock) {
  try {
    const value = clock();
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? value : null;
  } catch (_) { return null; }
}

function validSubmittedReport(report) {
  return plainDataRecord(report) && report.validated === true &&
    report.state === "awaiting_owner_approval" && report.liveBehaviorChanged === false &&
    typeof report.proposalId === "string" && ID_RE.test(report.proposalId) &&
    typeof report.candidateVersion === "string" && ID_RE.test(report.candidateVersion);
}

function createApprovalGate({ proposalStore, auditStore, clock = () => new Date().toISOString() } = {}) {
  if (!proposalStore || typeof proposalStore.get !== "function" || typeof proposalStore.set !== "function") {
    throw new TypeError("proposalStore.get/set are required; proposals must use private durable storage");
  }
  if (!auditStore || typeof auditStore.append !== "function") throw new TypeError("auditStore.append is required");
  if (typeof clock !== "function") throw new TypeError("clock must be a function");

  async function submitEvaluation(report) {
    if (!validSubmittedReport(report)) {
      return { ok: false, reason: "evaluation_not_approvable" };
    }
    if (typeof proposalStore.insertWithAudit !== "function") {
      return { ok: false, reason: "atomic_proposal_storage_required" };
    }
    const submittedAt = canonicalTimestamp(clock);
    if (!submittedAt) return { ok: false, reason: "learning_approval_clock_invalid" };
    const proposalId = report.proposalId;
    const record = Object.freeze({ ...report, submittedAt });
    try {
      const inserted = await proposalStore.insertWithAudit(proposalId, record, {
        type: "learning_proposal_submitted", proposalId,
        candidateVersion: report.candidateVersion, state: record.state
      });
      if (inserted === false) return { ok: false, reason: "proposal_already_exists" };
      if (inserted !== true) return { ok: false, reason: "proposal_persistence_unconfirmed" };
      return { ok: true, proposalId, state: record.state, liveBehaviorChanged: false };
    } catch (_) {
      return { ok: false, reason: "proposal_persistence_failed" };
    }
  }

  async function decide({ proposalId, decision, authContext, approvalId, reason = "" } = {}) {
    let ownerVerified = false;
    try { ownerVerified = isVerifiedOwner(authContext) === true; } catch (_) {}
    if (!ownerVerified) return { ok: false, reason: "owner_authentication_required" };
    if (typeof proposalId !== "string" || !ID_RE.test(proposalId) ||
        (decision !== "approve" && decision !== "reject")) {
      return { ok: false, reason: "invalid_decision" };
    }
    if (!authContext || typeof authContext.actorId !== "string" || !authContext.actorId.trim()) {
      return { ok: false, reason: "owner_authentication_required" };
    }
    if (typeof proposalStore.decideWithAudit !== "function") {
      return { ok: false, reason: "atomic_proposal_storage_required" };
    }
    const decidedAt = canonicalTimestamp(clock);
    if (!decidedAt) return { ok: false, reason: "learning_approval_clock_invalid" };
    const resolvedState = decision === "approve" ? "approved_for_release_review" : "rejected_by_owner";
    try {
      const proposal = await proposalStore.get(proposalId);
      if (!plainDataRecord(proposal) || proposal.proposalId !== proposalId ||
          proposal.state !== "awaiting_owner_approval" || proposal.validated !== true ||
          proposal.liveBehaviorChanged !== false ||
          typeof proposal.candidateVersion !== "string" || !ID_RE.test(proposal.candidateVersion)) {
        return { ok: false, reason: "proposal_not_decidable" };
      }
      const change = {
        state: resolvedState, decidedAt, decision,
        approvalId: clean(approvalId), decisionReason: clean(reason, 300),
        decidedBy: authContext.actorId
      };
      const event = {
        type: "learning_owner_decision", proposalId, decision, state: resolvedState,
        candidateVersion: proposal.candidateVersion, actorId: authContext.actorId,
        approvalId: change.approvalId, at: decidedAt,
        activationMode: "separate_release_pipeline", liveBehaviorChanged: false
      };
      // decideWithAudit must atomically lock, update and audit the record; a prior
      // get is advisory only and never authorizes a non-atomic state transition.
      const changed = await proposalStore.decideWithAudit(proposalId, decision, change, event);
      if (changed === false) return { ok: false, reason: "proposal_decision_conflict" };
      if (changed !== true) return { ok: false, reason: "proposal_decision_unconfirmed" };
      return { ok: true, proposalId, state: resolvedState,
        liveBehaviorChanged: false, releaseRequired: decision === "approve" };
    } catch (_) {
      return { ok: false, reason: "proposal_decision_persistence_failed" };
    }
  }

  return Object.freeze({ VERSION, submitEvaluation, decide });
}

module.exports = { VERSION, createApprovalGate };
