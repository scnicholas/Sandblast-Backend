import { adaptGuardianResponse } from "../adapters/guardian.response.adapter.js";
import { rememberTurn, getGuardianMemory } from "../memory/guardian.memory.bridge.js";
import { logGuardianEvent } from "../audit/guardian.audit.logger.js";

const CONTROLLER_VERSION = "1.5.1-r18ab-surface-continuity";
const DEFAULT_GUARDIAN = "marion";
const DEFAULT_MODE = "admin_dialogue";
const DEFAULT_ROUTE = "marion.admin.runtime";
const MAX_INPUT_LENGTH = 8000;

function nowIso() {
  return new Date().toISOString();
}

function makeTraceId(prefix = "marion") {
  const cryptoRef = globalThis.crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return `${prefix}_${cryptoRef.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function cleanText(value, max = MAX_INPUT_LENGTH) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function safeGuardian(value) {
  const v = cleanText(value || DEFAULT_GUARDIAN, 64).toLowerCase();
  if (v === "mariam") return "marion";
  if (v === "astro") return "aster";
  if (v === "fallon") return "thalon";
  return ["marion", "aster", "thalon"].includes(v) ? v : DEFAULT_GUARDIAN;
}

function safeError(error) {
  if (!error) return { message: "Unknown runtime error." };
  const data = error.data && typeof error.data === "object" ? error.data : null;
  return {
    name: cleanText(error.name || "RuntimeError", 80),
    message: cleanText(error.message || data?.message || data?.error || "The turn did not complete cleanly.", 500),
    status: error.status || data?.status || null,
    code: data?.code || data?.error || null
  };
}

function ensurePacketShape(packet = {}, fallback = {}) {
  const traceId = cleanText(packet.traceId || fallback.traceId || makeTraceId("marion"), 120);
  return {
    guardian: safeGuardian(packet.guardian || fallback.guardian),
    guardianMode: safeGuardian(packet.guardianMode || fallback.guardianMode),
    directReply: cleanText(packet.directReply || fallback.directReply || "Marion returned without a clean reply.", 4000),
    contextSummary: cleanText(packet.contextSummary || fallback.contextSummary || "No context summary exposed yet.", 2000),
    currentObjective: cleanText(packet.currentObjective || fallback.currentObjective || "Maintain Marion admin continuity.", 1000),
    systemState: cleanText(packet.systemState || fallback.systemState || "unknown", 64).toLowerCase(),
    nextAction: cleanText(packet.nextAction || fallback.nextAction || "Review runtime output and continue validation.", 1000),
    riskLevel: cleanText(packet.riskLevel || fallback.riskLevel || "low", 32).toLowerCase(),
    approvalRequired: Boolean(packet.approvalRequired),
    traceId,
    timestamp: cleanText(packet.timestamp || fallback.timestamp || nowIso(), 80),
    route: cleanText(packet.route || fallback.route || DEFAULT_ROUTE, 120),
    rawRuntimeAvailable: packet.rawRuntimeAvailable !== false,
    controllerVersion: CONTROLLER_VERSION,
    r17cStability: true,
    voiceTextParity: true,
    longSessionStressGuard: true,
    finalBaseline: "r16m-r17b"
  };
}


function r17aKind(input) {
  const t = cleanText(input, 600).toLowerCase();
  if (/frustr|stuck|annoyed|tired|not working/.test(t)) return "strained";
  if (/pass|good|held|works/.test(t)) return "positive";
  if (/still there|are you there|you there/.test(t)) return "presence";
  return "steady";
}

function r18DomainProfile(input) {
  const t = cleanText(input, 1600).toLowerCase();
  const ai = /\b(ai|artificial intelligence|model|reasoning|agent|automation|adaptive|intelligence|llm|machine learning)\b/.test(t);
  const cyber = /\b(cyber|security|protect|identity|permission|access|token|secret|auth|authentication|authorization|least privilege|risk|threat|anomaly|credential)\b/.test(t);
  return { ai, cyber };
}


function r18ShortPromptKind(input) {
  const t = cleanText(input, 400).toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (/^(pass|passed|locked|green|success)$/.test(t)) return "pass";
  if (/^(next|next steps|what now|what's next|what is next)$/.test(t)) return "next";
  if (/^(continue|keep going|carry on|proceed)$/.test(t)) return "continue";
  if (/what were we fixing|where were we|active lane|what are we doing/.test(t)) return "ask";
  if (/frustr|stuck|annoyed|tired|wrong lane|not working/.test(t)) return "repair";
  return "";
}

function r18ActiveLane(memory = {}, packet = {}, input = "") {
  const text = cleanText(`${input} ${packet.directReply || ""} ${packet.currentObjective || ""} ${packet.contextSummary || ""} ${memory.lastTopic || ""} ${memory.currentObjective || ""} ${memory.activeFeatureLane || ""}`, 3000).toLowerCase();
  return /\b(ai|artificial intelligence|agent|model|llm|automation|cyber|security|identity|access|secret|least privilege|credential|approval|ai_cyber)\b/.test(text) || r18ShortPromptKind(input);
}

function r18SurfaceReply(kind) {
  if (kind === "pass") return "Good. The AI/cyber lane held. Next we validate without loosening the R17C baseline.";
  if (kind === "ask") return "We are fixing AI adaptability and cybersecurity protection: goal, context, data, risk, then identity, access, secrets, and approval.";
  if (kind === "next") return "Next, validate AI routing, then verify identity, access, secrets, and explicit approval.";
  if (kind === "continue") return "Keep going: AI assessment first, then cybersecurity boundary checks.";
  if (kind === "repair") return "You are right, Mac. I will pull the reply back to the active AI/cyber lane and keep the baseline steady.";
  return "AI/cyber lane active: assess goal, context, data, risk, then protect identity, access, and secrets.";
}

function applyR18ABSurfaceContinuity(shaped, input, memory = {}) {
  const kind = r18ShortPromptKind(input);
  const active = r18ActiveLane(memory, shaped, input);
  if (!active) return shaped;
  const stale = /pacing, personality, and coherence|next, we run it longer|steady rhythm|keep the tone steady|baseline steady|same baseline/i.test(shaped.directReply || "");
  if (kind || stale || !shaped.r18AIDomainAdaptability && !shaped.r18CybersecurityProtectiveProtocol) shaped.directReply = r18SurfaceReply(kind || "domain");
  shaped.r18abSurfaceContinuity = true;
  shaped.activeFeatureLane = "ai_cyber";
  shaped.shortPromptLaneInheritance = true;
  shaped.r18AIDomainAdaptability = true;
  shaped.aiAssessmentFrame = "goal_context_data_risk_next_move";
  shaped.aiAdaptabilityMode = "applied_real_world_assessment";
  shaped.r18CybersecurityProtectiveProtocol = true;
  shaped.cybersecurityBoundary = "identity_access_secret_approval";
  shaped.protectiveBoundary = {
    macScoped: true,
    leastPrivilege: true,
    explicitConfirmationRequired: true,
    noCovertMonitoring: true,
    noAutonomousEnforcement: true,
    noPunitiveAction: true,
    secretRedaction: true
  };
  shaped.baselinePreserved = "r16m-r17c";
  shaped.currentObjective = "Keep AI adaptability and cybersecurity protection active without weakening R17C.";
  shaped.nextAction = "Validate AI assessment, then identity, access, secrets, and explicit approval.";
  return shaped;
}


function applyR17AContinuity(packet, input, memory = {}) {
  const shaped = ensurePacketShape(packet, { traceId: packet?.traceId });
  const prior = cleanText(memory?.lastTopic || memory?.currentObjective || "", 600);
  shaped.emotionalContinuity = r17aKind(`${input} ${shaped.directReply}`);
  shaped.naturalContinuation = Boolean(prior || input);
  shaped.responseVariation = true;
  const turns = Array.isArray(memory?.turns) ? memory.turns.length : 0;
  const joined = cleanText(`${input} ${shaped.directReply}`, 1200).toLowerCase();
  shaped.conversationPacing = /frustr|stuck|annoyed|tired/.test(joined) ? "slow_grounded" : /next|continue|keep going/.test(joined) ? "measured_forward" : /pass|good|held/.test(joined) ? "brief_confident" : "steady";
  shaped.microPersonality = "steady_mac_facing";
  shaped.longSessionCoherence = turns >= 8 ? "active" : "priming";
  shaped.turnRhythm = `${shaped.conversationPacing}:${turns}`;
  shaped.fullRegressionConsolidation = true;
  shaped.voiceTextParity = true;
  shaped.longSessionStressGuard = turns >= 12 ? "active" : "priming";
  shaped.finalBaseline = "r16m-r17b";
  shaped.contextSummary = cleanText(shaped.contextSummary || prior || "Conversation continuity is active.", 2000);
  shaped.currentObjective = cleanText(shaped.currentObjective || prior || "Keep Marion replies paced, natural, and coherent.", 1000);
  if (!shaped.nextAction || /review runtime|continue validation|inspect/i.test(shaped.nextAction)) shaped.nextAction = "Continue the same thread with steady pacing.";

  const r18 = r18DomainProfile(`${input} ${shaped.directReply} ${shaped.currentObjective} ${shaped.contextSummary}`);
  shaped.r18AIDomainAdaptability = Boolean(r18.ai);
  shaped.aiAssessmentFrame = r18.ai ? "goal_context_data_risk_next_move" : "baseline";
  shaped.aiAdaptabilityMode = r18.ai ? "applied_real_world_assessment" : "baseline_preserved";
  shaped.r18CybersecurityProtectiveProtocol = Boolean(r18.cyber);
  shaped.cybersecurityBoundary = r18.cyber ? "identity_access_secret_approval" : "baseline";
  shaped.protectiveBoundary = {
    macScoped: true,
    leastPrivilege: true,
    explicitConfirmationRequired: Boolean(r18.cyber),
    noCovertMonitoring: true,
    noAutonomousEnforcement: true,
    noPunitiveAction: true,
    secretRedaction: true
  };
  shaped.baselinePreserved = "r16m-r17c";
  if (r18.ai && /review runtime|continue validation|same thread/i.test(shaped.nextAction || "")) shaped.nextAction = "Assess the AI goal, context, data, risk, and next move.";
  if (r18.cyber) shaped.nextAction = "Verify identity, limit access, protect secrets, and request explicit approval before sensitive action.";
  return applyR18ABSurfaceContinuity(shaped, input, memory);
}

function createEmptyInputPacket({ guardian = DEFAULT_GUARDIAN, traceId = makeTraceId("marion") } = {}) {
  return ensurePacketShape({
    guardian,
    guardianMode: guardian,
    directReply: "I need a clean input before I can respond.",
    contextSummary: "The conversation controller rejected an empty input.",
    currentObjective: "Maintain Marion admin continuity.",
    systemState: "waiting",
    nextAction: "Enter a specific Marion instruction or question.",
    riskLevel: "low",
    approvalRequired: false,
    traceId,
    route: DEFAULT_ROUTE
  });
}

function createRuntimeClientMissingPacket({ guardian, traceId, route }) {
  return ensurePacketShape({
    guardian,
    guardianMode: guardian,
    directReply: "I can't complete that turn yet, Mac. The live line is not connected.",
    contextSummary: "The conversation controller needs a runtimeClient function to reach Marion's backend/runtime route.",
    currentObjective: "Wire Marion conversation flow to the runtime client.",
    systemState: "blocked",
    nextAction: "Reconnect the Marion runtime line before live turns.",
    riskLevel: "medium",
    approvalRequired: false,
    traceId,
    route
  });
}

export async function handleMarionConversation({
  input,
  session = {},
  runtimeClient,
  guardian = DEFAULT_GUARDIAN,
  mode = DEFAULT_MODE,
  route = DEFAULT_ROUTE,
  traceId = makeTraceId("marion"),
  source = "marion.conversation.controller",
  throwOnError = false
} = {}) {
  const activeGuardian = safeGuardian(guardian);
  const cleanInput = cleanText(input);
  const safeRoute = cleanText(route || DEFAULT_ROUTE, 120);

  if (!cleanInput) {
    const packet = createEmptyInputPacket({ guardian: activeGuardian, traceId });
    logGuardianEvent({ guardian: activeGuardian, type: "conversation_rejected", route: safeRoute, decision: packet.nextAction, riskLevel: packet.riskLevel, traceId: packet.traceId });
    return packet;
  }

  if (typeof runtimeClient !== "function") {
    const packet = createRuntimeClientMissingPacket({ guardian: activeGuardian, traceId, route: safeRoute });
    rememberTurn(activeGuardian, { input: cleanInput, reply: packet.directReply, nextAction: packet.nextAction, traceId: packet.traceId, riskLevel: packet.riskLevel, systemState: packet.systemState });
    logGuardianEvent({ guardian: activeGuardian, type: "conversation_blocked", input: cleanInput, reply: packet.directReply, decision: packet.nextAction, route: safeRoute, riskLevel: packet.riskLevel, traceId: packet.traceId });
    return packet;
  }

  const memory = getGuardianMemory(activeGuardian);
  const fallback = {
    guardian: activeGuardian,
    guardianMode: activeGuardian,
    currentObjective: memory?.currentObjective || "Maintain Marion admin continuity.",
    traceId,
    timestamp: nowIso(),
    route: safeRoute
  };

  try {
    const raw = await runtimeClient({
      guardian: activeGuardian,
      input: cleanInput,
      text: cleanInput,
      message: cleanInput,
      session,
      memory,
      mode: cleanText(mode || DEFAULT_MODE, 80),
      traceId,
      source
    });

    const packet = applyR17AContinuity(ensurePacketShape(adaptGuardianResponse(raw, fallback), fallback), cleanInput, memory);

    rememberTurn(activeGuardian, {
      input: cleanInput,
      reply: packet.directReply,
      nextAction: packet.nextAction,
      traceId: packet.traceId,
      riskLevel: packet.riskLevel,
      approvalRequired: packet.approvalRequired,
      systemState: packet.systemState,
      route: safeRoute
    });

    logGuardianEvent({
      guardian: activeGuardian,
      type: "conversation",
      input: cleanInput,
      reply: packet.directReply,
      decision: packet.nextAction,
      approvalRequired: packet.approvalRequired,
      route: safeRoute,
      riskLevel: packet.riskLevel,
      systemState: packet.systemState,
      traceId: packet.traceId
    });

    return packet;
  } catch (error) {
    const err = safeError(error);
    const packet = applyR17AContinuity(ensurePacketShape(adaptGuardianResponse({
      ok: false,
      guardian: activeGuardian,
      directReply: "That turn did not complete cleanly, Mac. I’ll keep the baseline steady while we inspect it.",
      contextSummary: "The conversation controller caught a runtime failure while processing Mac's input.",
      currentObjective: fallback.currentObjective,
      systemState: "degraded",
      nextAction: "Inspect the runtime route, backend response, and adapter output, then retry the turn.",
      riskLevel: "medium",
      approvalRequired: false,
      traceId,
      error: err
    }, fallback), fallback), cleanInput, memory);

    rememberTurn(activeGuardian, {
      input: cleanInput,
      reply: packet.directReply,
      nextAction: packet.nextAction,
      traceId: packet.traceId,
      riskLevel: packet.riskLevel,
      approvalRequired: packet.approvalRequired,
      systemState: packet.systemState,
      route: safeRoute,
      error: err
    });

    logGuardianEvent({
      guardian: activeGuardian,
      type: "conversation_error",
      input: cleanInput,
      reply: packet.directReply,
      decision: packet.nextAction,
      approvalRequired: false,
      route: safeRoute,
      riskLevel: packet.riskLevel,
      systemState: packet.systemState,
      traceId: packet.traceId,
      error: err
    });

    if (throwOnError) throw error;
    return packet;
  }
}

export function getMarionConversationControllerInfo() {
  return {
    name: "marion.conversation.controller",
    version: CONTROLLER_VERSION,
    defaultGuardian: DEFAULT_GUARDIAN,
    defaultMode: DEFAULT_MODE,
    maxInputLength: MAX_INPUT_LENGTH,
    r18AIDomainAdaptability: true,
    r18CybersecurityProtectiveProtocol: true,
    baselinePreserved: "r16m-r17c",
    r18abSurfaceContinuity: true,
    activeFeatureLane: "ai_cyber",
    shortPromptLaneInheritance: true
  };
}
