import { adaptGuardianResponse } from "../adapters/guardian.response.adapter.js";
import { rememberTurn, getGuardianMemory } from "../memory/guardian.memory.bridge.js";
import { logGuardianEvent } from "../audit/guardian.audit.logger.js";

export async function handleMarionConversation({ input, session, runtimeClient }) {
  if (!input || !String(input).trim()) {
    return {
      guardian: "marion",
      directReply: "I need a clean input before I can respond.",
      riskLevel: "low",
      approvalRequired: false
    };
  }

  const memory = getGuardianMemory("marion");

  const raw = await runtimeClient({
    guardian: "marion",
    input,
    session,
    memory,
    mode: "admin_dialogue"
  });

  const packet = adaptGuardianResponse(raw, {
    guardian: "marion",
    guardianMode: "marion",
    currentObjective: memory.currentObjective
  });

  rememberTurn("marion", {
    input,
    reply: packet.directReply,
    nextAction: packet.nextAction,
    traceId: packet.traceId
  });

  logGuardianEvent({
    guardian: "marion",
    type: "conversation",
    input,
    decision: packet.nextAction,
    approvalRequired: packet.approvalRequired,
    traceId: packet.traceId
  });

  return packet;
}
