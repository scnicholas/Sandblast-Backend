"use strict";

const VERSION = "guardian.pipeline.router v1.3.0 MARION-PERSONALITY-PRIORITY-R2 + PRIORITY2-GUARDIAN-BOUNDARY-ROUTING + TALON-ALIAS-COMPAT + DEFENSIVE-INTENT-APPROVAL-GATE";
const PROTECTIVE_ESCALATION_ROUTING_VERSION = "nyx.marion.protectiveEscalationRouting/1.0";

const DEFAULT_GUARDIAN_REGISTRY = Object.freeze({
  schema: "sandblast.guardian.identity.registry",
  version: "1.3.0-personality-priority-r2",
  defaultGuardian: "marion",
  activeGuardian: "marion",
  aliases: {
    marian: "marion",
    mariam: "marion",
    marion: "marion",
    "nyx-admin": "marion",
    aster: "aster",
    astro: "aster",
    thalon: "thalon",
    talon: "thalon",
    talon_guardian: "thalon",
    fallon: "thalon"
  },
  guardians: {
    marion: {
      id: "marion",
      name: "Marion",
      status: "active",
      role: "executive_orchestration",
      authority: "primary",
      finalAuthority: true,
      allowedIntents: ["admin_status", "conversation", "runtime_check", "approval", "deny", "command", "diagnostics", "guardian_handoff", "context_summary", "ethical_review", "defensive_boundary_review", "protective_escalation_review", "protection_signal", "personality_refinement", "conversation_layering", "response_shape", "real_world_observation"],
      requiresApprovalFrom: null,
      persona: {
        recipient: "Mac",
        stance: "professional_protective",
        tone: "casual_professional_human",
        canQuestionUserRequest: true,
        oneQuestionPerTurn: true,
        publicUsersCanAddressMarion: false
      }
    },
    aster: {
      id: "aster",
      name: "Aster",
      status: "standby",
      role: "analysis_layer",
      authority: "advisory",
      finalAuthority: false,
      allowedIntents: ["analyze_signal", "risk_review", "pattern_review", "analysis_summary", "ethical_review", "defensive_boundary_review", "protective_escalation_review", "protection_signal"],
      requiresApprovalFrom: "marion"
    },
    thalon: {
      id: "thalon",
      name: "Thalon",
      status: "standby",
      role: "strategic_layer",
      authority: "advisory",
      finalAuthority: false,
      allowedIntents: ["strategy_review", "scenario_planning", "ethical_review", "decision_support", "defensive_boundary_review", "protective_escalation_review", "protection_signal"],
      requiresApprovalFrom: "marion"
    }
  },
  rules: {
    marionFinalAuthority: true,
    preventIdentityBleed: true,
    advisoryGuardiansDoNotOverrideMarion: true,
    defensiveEscalationRequiresMarionApproval: true,
    advisoryGuardiansCannotEmitPhysicalAction: true,
    protectiveEscalationRequiresVerifiedIntent: true,
    unknownGuardianFallbackToMarion: true,
    singleAuthorityPerTurn: true,
    requireTraceId: true,
    standbyGuardiansReturnActivationPacket: true,
    macOnlyMarionDirectCommunication: true,
    marionPersonalityResponseShapeRequired: true,
    diagnosticsHiddenUnlessRequested: true,
    oneQuestionPerTurn: true
  },
  packetDefaults: {
    systemState: "standby",
    riskLevel: "low",
    approvalRequired: false,
    rawRuntimeAvailable: false
  }
});

export class GuardianRoutingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GuardianRoutingError";
    this.details = details;
  }
}

export function getDefaultGuardianRegistry() {
  return clone(DEFAULT_GUARDIAN_REGISTRY);
}

export function normalizeGuardian(value = "marion", registry = DEFAULT_GUARDIAN_REGISTRY) {
  const raw = String(value || registry.defaultGuardian || "marion").trim().toLowerCase();
  const aliases = registry.aliases || {};
  return aliases[raw] || raw || "marion";
}

export function getGuardianProfile(guardian = "marion", registry = DEFAULT_GUARDIAN_REGISTRY) {
  const id = normalizeGuardian(guardian, registry);
  return (registry.guardians && registry.guardians[id]) || null;
}

function normalizeIntentKey(value = "conversation") {
  const raw = String(value || "conversation").trim().toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "conversation";
}

export function deriveIntent(payload = {}) {
  const raw = payload.intent || payload.command || payload.action || payload.type || "conversation";
  return normalizeIntentKey(raw);
}

export function isProtectiveEscalationIntent(intent = "", payload = {}) {
  const key = normalizeIntentKey(intent);
  const text = String(payload.text || payload.message || payload.input || payload.prompt || payload.directReply || "").toLowerCase();
  return ["defensive_boundary_review", "protective_escalation_review", "protection_signal"].includes(key) ||
    /\b(defen[cs]e|defensive|protect|protection|protective|personal safety|emergency|alarm|alert|escalation|intent justifier|ethical boundary|verified command|code word|codeword)\b/i.test(text);
}

export function buildGuardianEthicalBoundary(payload = {}, intent = "conversation", guardian = "marion", profile = {}) {
  const protective = isProtectiveEscalationIntent(intent, payload);
  return {
    version: PROTECTIVE_ESCALATION_ROUTING_VERSION,
    active: protective,
    guardian,
    guardianRole: profile.role || "unknown",
    intent: normalizeIntentKey(intent),
    requiresMarionApproval: protective && guardian !== "marion",
    requiresVerifiedIntent: protective,
    protectivePurposeOnly: true,
    boundedOutputRequired: true,
    advisoryOnly: guardian !== "marion",
    noPhysicalActionFromAdvisoryGuardian: guardian !== "marion",
    noPunitiveUse: true,
    noCoerciveUse: true,
    noContinuousAlarm: true,
    reason: protective ? "protective_escalation_guardian_boundary" : "standard_guardian_route"
  };
}

export function isIntentAllowed(profile = {}, intent = "conversation") {
  const allowed = Array.isArray(profile.allowedIntents) ? profile.allowedIntents.map(normalizeIntentKey) : [];
  const key = normalizeIntentKey(intent);
  return allowed.length === 0 || allowed.includes(key) || key === "conversation";
}

export function createTraceId(prefix = "guardian") {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildGuardianPacket(overrides = {}, registry = DEFAULT_GUARDIAN_REGISTRY) {
  const guardian = normalizeGuardian(overrides.guardian || registry.defaultGuardian || "marion", registry);
  const profile = getGuardianProfile(guardian, registry) || {};
  const defaults = registry.packetDefaults || {};
  return {
    guardian,
    guardianMode: guardian,
    guardianRole: profile.role || "unknown",
    authority: profile.authority || "unknown",
    finalAuthority: Boolean(profile.finalAuthority),
    directReply: shapeMarionGuardianReply(overrides.directReply || "Guardian packet created.", { ...overrides, guardian, profile }),
    contextSummary: String(overrides.contextSummary || "No context summary provided."),
    currentObjective: String(overrides.currentObjective || "Maintain Guardian routing continuity."),
    systemState: String(overrides.systemState || defaults.systemState || "standby"),
    nextAction: String(overrides.nextAction || "Continue Guardian routing validation."),
    riskLevel: normalizeRisk(overrides.riskLevel || defaults.riskLevel || "low"),
    approvalRequired: Boolean(overrides.approvalRequired ?? defaults.approvalRequired),
    traceId: String(overrides.traceId || createTraceId(guardian)),
    timestamp: overrides.timestamp || new Date().toISOString(),
    rawRuntimeAvailable: Boolean(overrides.rawRuntimeAvailable ?? defaults.rawRuntimeAvailable),
    route: overrides.route || "guardian.pipeline.router",
    routerVersion: VERSION,
    ethicalBoundary: overrides.ethicalBoundary || null,
    persona: buildMarionPersonaBoundary({ ...overrides, guardian, profile }),
    meta: sanitizeMeta({ routerVersion: VERSION, personalityPriorityR2: true, marionRecipient: "Mac", ...(overrides.meta || {}) })
  };
}

export async function routeGuardianMessage(payload = {}, dependencies = {}) {
  const registry = dependencies.registry || payload.registry || DEFAULT_GUARDIAN_REGISTRY;
  const requested = payload.guardian || payload.guardianMode || payload.targetGuardian || registry.defaultGuardian || "marion";
  let guardian = normalizeGuardian(requested, registry);
  let profile = getGuardianProfile(guardian, registry);
  const rules = registry.rules || {};
  const traceId = String(payload.traceId || createTraceId(guardian));
  const intent = deriveIntent(payload);
  let ethicalBoundary = null;

  if (!profile) {
    if (rules.unknownGuardianFallbackToMarion) {
      guardian = "marion";
      profile = getGuardianProfile("marion", registry);
    } else {
      throw new GuardianRoutingError(`Unknown Guardian: ${requested}`, { requested, traceId });
    }
  }

  ethicalBoundary = buildGuardianEthicalBoundary(payload, intent, guardian, profile || {});

  if (!isIntentAllowed(profile, intent)) {
    const packet = buildGuardianPacket({
      guardian,
      traceId,
      systemState: "blocked",
      riskLevel: "medium",
      approvalRequired: true,
      directReply: `${profile.name || guardian} is registered, but this intent is not allowed for that Guardian lane.`,
      contextSummary: `Intent '${intent}' was blocked by Guardian identity rules.`,
      currentObjective: "Preserve Guardian authority boundaries.",
      nextAction: "Route this request through Marion for review.",
      ethicalBoundary,
      meta: { intent, requestedGuardian: requested, rule: "intent_not_allowed", ethicalBoundary }
    }, registry);
    await safeAudit(dependencies, packet, payload, "blocked_intent");
    return packet;
  }

  if (guardian === "marion") {
    const marionHandler = dependencies.marionHandler || dependencies.handlers?.marion || payload.marionHandler;
    if (typeof marionHandler !== "function") {
      const packet = buildGuardianPacket({
        guardian: "marion",
        traceId,
        systemState: "degraded",
        riskLevel: "medium",
        approvalRequired: false,
        directReply: "Marion is selected, but the Marion conversation controller is not connected to the pipeline router yet.",
        contextSummary: "The Guardian router resolved Marion correctly, but no marionHandler was provided.",
        currentObjective: "Connect guardian.pipeline.router.js to marion.conversation.controller.js.",
        nextAction: "Pass handleMarionConversation as dependencies.marionHandler during integration.",
        meta: { intent, requestedGuardian: requested, missing: "marionHandler" }
      }, registry);
      await safeAudit(dependencies, packet, payload, "missing_marion_handler");
      return packet;
    }

    const result = await marionHandler({ ...payload, guardian: "marion", guardianMode: "marion", intent, traceId });
    const packet = buildGuardianPacket({ ...result, guardian: "marion", guardianMode: "marion", traceId, ethicalBoundary, route: "guardian.pipeline.router:marion", meta: { ...(result && result.meta || {}), ethicalBoundary } }, registry);
    await safeAudit(dependencies, packet, payload, "marion_routed");
    return packet;
  }

  const handler = dependencies.handlers?.[guardian] || payload.guardianHandler;
  if (profile.status !== "active" || typeof handler !== "function") {
    const packet = buildGuardianPacket({
      guardian,
      traceId,
      systemState: profile.status || "standby",
      riskLevel: "low",
      approvalRequired: Boolean(profile.requiresApprovalFrom),
      directReply: `${profile.name || guardian} is registered but not fully activated yet.`,
      contextSummary: `${profile.name || guardian} exists in the Guardian registry as ${profile.authority || "advisory"} authority.`,
      currentObjective: "Keep advisory Guardians registered without letting them override Marion.",
      nextAction: ethicalBoundary && ethicalBoundary.active ? `Route ${profile.name || guardian} protective output to Marion for verified approval before any escalation.` : `Activate the ${profile.name || guardian} controller only after Marion's runtime pattern is stable.`,
      ethicalBoundary,
      meta: { intent, requestedGuardian: requested, requiresApprovalFrom: profile.requiresApprovalFrom || null, ethicalBoundary }
    }, registry);
    await safeAudit(dependencies, packet, payload, "guardian_standby");
    return packet;
  }

  const raw = await handler({ ...payload, guardian, guardianMode: guardian, intent, traceId });
  const packet = buildGuardianPacket({
    ...raw,
    guardian,
    guardianMode: guardian,
    traceId,
    approvalRequired: rules.advisoryGuardiansDoNotOverrideMarion || (ethicalBoundary && ethicalBoundary.active) ? true : Boolean(raw?.approvalRequired),
    ethicalBoundary,
    nextAction: ethicalBoundary && ethicalBoundary.active ? "Route protective advisory output to Marion for verified approval and bounded execution." : (raw?.nextAction || "Route advisory output to Marion for final authority."),
    route: `guardian.pipeline.router:${guardian}`,
    meta: { ...(raw && raw.meta || {}), ethicalBoundary }
  }, registry);
  await safeAudit(dependencies, packet, payload, "advisory_routed");
  return packet;
}

async function safeAudit(dependencies = {}, packet = {}, payload = {}, type = "route") {
  const audit = dependencies.auditLogger || dependencies.logGuardianEvent;
  if (typeof audit !== "function") return null;
  try {
    return await audit({
      guardian: packet.guardian,
      type,
      input: payload.input || payload.text || payload.message || "",
      reply: packet.directReply,
      decision: packet.nextAction,
      approvalRequired: packet.approvalRequired,
      riskLevel: packet.riskLevel,
      systemState: packet.systemState,
      route: packet.route,
      traceId: packet.traceId,
      meta: packet.meta
    });
  } catch (_) {
    return null;
  }
}

function normalizeRisk(value = "low") {
  const risk = String(value || "low").toLowerCase();
  return ["low", "medium", "high", "critical"].includes(risk) ? risk : "low";
}

function sanitizeMeta(meta = {}) {
  if (!meta || typeof meta !== "object") return {};
  const blocked = /token|secret|password|apikey|api_key|authorization|cookie|session/i;
  return Object.fromEntries(Object.entries(meta).map(([key, value]) => [key, blocked.test(key) ? "[REDACTED]" : value]));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
