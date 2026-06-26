import guardianRegistry from "../registry/guardian.identity.registry.json" assert { type: "json" };
import { handleMarionConversation } from "../controllers/marion.conversation.controller.js";

export async function routeGuardianMessage(payload) {
  const guardian = payload.guardian || "marion";
  const profile = guardianRegistry.guardians[guardian];

  if (!profile) {
    throw new Error(`Unknown Guardian: ${guardian}`);
  }

  if (guardian === "marion") {
    return handleMarionConversation(payload);
  }

  return {
    guardian,
    guardianMode: guardian,
    directReply: `${profile.name} is registered but not fully activated yet.`,
    contextSummary: `${profile.name} profile exists in the Guardian registry.`,
    currentObjective: "Guardian expansion readiness.",
    systemState: "standby",
    nextAction: `Activate ${profile.name} controller when Marion pattern is locked.`,
    riskLevel: "low",
    approvalRequired: false,
    traceId: payload.traceId || ""
  };
}
