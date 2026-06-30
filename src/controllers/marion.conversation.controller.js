import { adaptGuardianResponse } from "../adapters/guardian.response.adapter.js";
import { rememberTurn, getGuardianMemory } from "../memory/guardian.memory.bridge.js";
import { logGuardianEvent } from "../audit/guardian.audit.logger.js";

const CONTROLLER_VERSION = "1.2.0-r17a";
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
    message: cleanText(error.message || data?.message || data?.error || "Runtime call failed.", 500),
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
    controllerVersion: CONTROLLER_VERSION
  };
}


function r17aKind(input) {
  const t = cleanText(input, 600).toLowerCase();
  if (/frustr|stuck|annoyed|tired|not working/.test(t)) return "strained";
  if (/pass|good|held|works/.test(t)) return "positive";
  if (/still there|are you there|you there/.test(t)) return "presence";
  return "steady";
}
function applyR17AContinuity(packet, input, memory = {}) {
  const shaped = ensurePacketShape(packet, { traceId: packet?.traceId });
  const prior = cleanText(memory?.lastTopic || memory?.currentObjective || "", 600);
  shaped.emotionalContinuity = r17aKind(`${input} ${shaped.directReply}`);
  shaped.naturalContinuation = Boolean(prior || input);
  shaped.responseVariation = true;
  shaped.contextSummary = cleanText(shaped.contextSummary || prior || "Conversation continuity is active.", 2000);
  shaped.currentObjective = cleanText(shaped.currentObjective || prior || "Keep Marion replies clear and connected.", 1000);
  if (!shaped.nextAction || /review runtime|continue validation|inspect/i.test(shaped.nextAction)) shaped.nextAction = "Continue the same thread with a clear next reply.";
  return shaped;
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
    directReply: "Marion cannot complete the turn because no runtime client was supplied.",
    contextSummary: "The conversation controller needs a runtimeClient function to reach Marion's backend/runtime route.",
    currentObjective: "Wire Marion conversation flow to the runtime client.",
    systemState: "blocked",
    nextAction: "Pass a runtimeClient into handleMarionConversation before testing live turns.",
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
      directReply: "Marion runtime hit a controller or backend failure. Review Output diagnostics before continuing.",
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
    maxInputLength: MAX_INPUT_LENGTH
  };
}
