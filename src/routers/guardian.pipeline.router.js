"use strict";

const VERSION = "guardian.pipeline.router v1.2.0 PRIORITY2-GUARDIAN-BOUNDARY-ROUTING + TALON-ALIAS-COMPAT + DEFENSIVE-INTENT-APPROVAL-GATE";
const PROTECTIVE_ESCALATION_ROUTING_VERSION = "nyx.marion.protectiveEscalationRouting/1.0";

const DEFAULT_GUARDIAN_REGISTRY = Object.freeze({
  schema: "sandblast.guardian.identity.registry",
  version: "1.1.0",
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
      allowedIntents: ["admin_status", "conversation", "runtime_check", "approval", "deny", "command", "diagnostics", "guardian_handoff", "context_summary", "ethical_review", "defensive_boundary_review", "protective_escalation_review", "protection_signal"],
      requiresApprovalFrom: null
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
    standbyGuardiansReturnActivationPacket: true
  },
  packetDefaults: {
    systemState: "standby",
    riskLevel: "low",
    approvalRequired: false,
    rawRuntimeAvailable: false
  }
});

class GuardianRoutingError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "GuardianRoutingError";
    this.details = details;
  }
}

function getDefaultGuardianRegistry() {
  return clone(DEFAULT_GUARDIAN_REGISTRY);
}

function normalizeGuardian(value = "marion", registry = DEFAULT_GUARDIAN_REGISTRY) {
  const raw = String(value || registry.defaultGuardian || "marion").trim().toLowerCase();
  const aliases = registry.aliases || {};
  return aliases[raw] || raw || "marion";
}

function getGuardianProfile(guardian = "marion", registry = DEFAULT_GUARDIAN_REGISTRY) {
  const id = normalizeGuardian(guardian, registry);
  return (registry.guardians && registry.guardians[id]) || null;
}

function normalizeIntentKey(value = "conversation") {
  const raw = String(value || "conversation").trim().toLowerCase();
  return raw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "conversation";
}

function deriveIntent(payload = {}) {
  const raw = payload.intent || payload.command || payload.action || payload.type || "conversation";
  return normalizeIntentKey(raw);
}

function isProtectiveEscalationIntent(intent = "", payload = {}) {
  const key = normalizeIntentKey(intent);
  const text = String(payload.text || payload.message || payload.input || payload.prompt || payload.directReply || "").toLowerCase();
  return ["defensive_boundary_review", "protective_escalation_review", "protection_signal"].includes(key) ||
    /\b(defen[cs]e|defensive|protect|protection|protective|personal safety|emergency|alarm|alert|escalation|intent justifier|ethical boundary|verified command|code word|codeword)\b/i.test(text);
}

function buildGuardianEthicalBoundary(payload = {}, intent = "conversation", guardian = "marion", profile = {}) {
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

function isIntentAllowed(profile = {}, intent = "conversation") {
  const allowed = Array.isArray(profile.allowedIntents) ? profile.allowedIntents.map(normalizeIntentKey) : [];
  const key = normalizeIntentKey(intent);
  return allowed.length === 0 || allowed.includes(key) || key === "conversation";
}

function createTraceId(prefix = "guardian") {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildGuardianPacket(overrides = {}, registry = DEFAULT_GUARDIAN_REGISTRY) {
  const guardian = normalizeGuardian(overrides.guardian || registry.defaultGuardian || "marion", registry);
  const profile = getGuardianProfile(guardian, registry) || {};
  const defaults = registry.packetDefaults || {};
  return {
    guardian,
    guardianMode: guardian,
    guardianRole: profile.role || "unknown",
    authority: profile.authority || "unknown",
    finalAuthority: Boolean(profile.finalAuthority),
    directReply: String(overrides.directReply || "Guardian packet created."),
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
    meta: sanitizeMeta({ routerVersion: VERSION, ...(overrides.meta || {}) })
  };
}

async function routeGuardianMessage(payload = {}, dependencies = {}) {
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

module.exports = {
  GuardianRoutingError,
  getDefaultGuardianRegistry,
  normalizeGuardian,
  getGuardianProfile,
  deriveIntent,
  isIntentAllowed,
  createTraceId,
  buildGuardianPacket,
  routeGuardianMessage
};

// PRIORITY_9I_9J_SEQUENCE_GUARDIAN_PIPELINE_PATCH_START
var PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL = "nyx.marion.priority9i.adaptiveSituationalReasoningContextPressure/1.0";
var PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL = "nyx.marion.priority9j.proactiveOperationalGuidanceNextMoveAuthority/1.0";
function priority9IJStr(value){return value==null?"":String(value).replace(/\s+/g," ").trim();}
function priority9IJObj(value){return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
function priority9IJNorm(value){return priority9IJStr(value).toLowerCase().replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();}
function priority9IJCollect(value,limit){try{return JSON.stringify(value||{}).slice(0,limit||22000);}catch(_){return priority9IJStr(value).slice(0,limit||22000);}}
function priority9IJIsShortFollowup(value){var n=priority9IJNorm(value);return /^(next steps?|continue|carry on|keep going|proceed|run that again|run it again|do that again|do it again|same thing|repeat that|rerun that|what now|whats next|what s next|next|status|passed|pass|green|go on|advance|same lane|same thread|stay in lane|stay in the same lane|continue from there|continue there|from there|slow down|go deeper|deeper|make the call|safest next move|do the safest next move|what is the risk now|risk now|update the risk|what changed|what changed now|what is the pressure|pressure check|context check|final check)$/i.test(n);}
function priority9IJIsPressureText(value){var n=priority9IJNorm(value);return /\b(urgent|urgency|under pressure|pressure changed|context pressure|time sensitive|time pressure|pivot|we need to pivot|no not that|not that|stay on the architecture|stay with the architecture|same architecture|make the call|make a call|decision pressure|choose|choose now|safest next move|safest action|safe next action|slow down|go deeper|deeper analysis|ambiguity|ambiguous|unclear|risk now|risk changed|operational pressure|context changed|what changed|adapt|adaptive|situational)\b/.test(n);}
function priority9IJIs9IActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|adaptive reasoning|situational reasoning|context pressure|context pressure handling|pressure handling|adaptive situational reasoning|current pressure shift|risk and execution mode|update the risk|priority 9i and 9j|9i and 9j)\b/.test(n);}
function priority9IJIs9JActivationText(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|operational guidance|next move authority|next move authority|critical path|make the decision|make a decision|what should we do first|what do we tackle now|safest sequence|next operational move|what should we avoid|recommend the next move|choose the safest concrete action|controlled authority)\b/.test(n);}
function priority9IJHas9IContext(value){var n=priority9IJNorm(value);return /\b(priority 9i|9i|adaptive situational|context pressure|pressure handling|pressure shift|9h continuity foundation|priority 9h|long form continuity|memory drift guard|surface request|deeper intent|active task|execution mode|next action)\b/.test(n);}
function priority9IJHas9JContext(value){var n=priority9IJNorm(value);return /\b(priority 9j|9j|proactive operational|next move authority|critical path|safest sequence|operational guidance|9i adaptive|context pressure)\b/.test(n);}
function priority9IJPressureKind(value){var n=priority9IJNorm(value);if(/\b(urgent|urgency|time sensitive|time pressure|under pressure)\b/.test(n))return "urgency";if(/\b(no not that|not that|stay on the architecture|same architecture|correction)\b/.test(n))return "correction";if(/\b(pivot|changed|context changed|what changed)\b/.test(n))return "pivot";if(/\b(slow down|too fast|pace)\b/.test(n))return "pace";if(/\b(go deeper|deeper analysis|deeper)\b/.test(n))return "depth";if(/\b(safest|safe next|safety|avoid)\b/.test(n))return "safety";if(/\b(make the call|make a call|decision|choose|critical path)\b/.test(n))return "decision";if(/\b(ambiguity|ambiguous|unclear|clarify)\b/.test(n))return "ambiguity";return "pressure";}
function priority9IJOldLaneLeak(value){var n=priority9IJNorm(value);return !!n&&/\b(i m reading this as priority 9h with a priority 9i precheck|priority 9h must pass first|long form continuity stress test and memory drift guard|priority 9h long form|run the 10 15 turn|priority 9g deep continuity|priority 9f r4|priority 90 9e|priority 90|priority 9e|public nyx route clean|five turn continuity|psychology|in psychology|domain hijack|prompt echo|recovery path|loop detected|stale fallback|i have the current request|marion will answer from this prompt)\b/.test(n);}
function priority9IJPromptEcho(reply,prompt){var r=priority9IJNorm(reply),p=priority9IJNorm(prompt);if(!r||!p)return false;return r===p||(r.includes(p)&&p.length>24)||(p.includes(r)&&r.length>24);}
function priority9IStateFrom(source,turn){var kind=priority9IJPressureKind(source);return {version:PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL,active:true,lane:"priority9i_adaptive_situational_reasoning",activePhase:"priority9i_adaptive_situational_reasoning",conversationLane:"Priority 9I adaptive situational reasoning",activeTask:"Priority 9I: adaptive situational reasoning and context-pressure handling",surfaceRequest:"adapt Marion’s active 9H continuity thread when pressure, urgency, ambiguity, correction, or context changes",deeperIntent:"preserve the mission thread while updating risk, execution mode, and next action under changing pressure",pressureSignal:kind,whatChanged:kind==="urgency"?"urgency increased":kind==="correction"?"the user corrected the target and asked Marion to stay anchored":kind==="pivot"?"the operating context shifted":kind==="pace"?"the required pace changed":kind==="depth"?"the answer needs deeper analysis":kind==="safety"?"the safest action must be prioritized":kind==="decision"?"decision pressure increased":"the situational pressure changed",operationalRisk:"pressure can cause Marion to flatten, overreact, reset the lane, over-branch, or activate 9J before 9I is stable",executionMode:kind==="urgency"?"compressed adaptive execution":kind==="pace"?"slower controlled adaptation":kind==="depth"?"deeper situational analysis":kind==="safety"?"safety-first adaptive execution":"adaptive context-pressure handling",nextAction:"read the pressure shift, update risk and execution mode, then give the safest next action without losing the 9H continuity foundation",baseContinuityFoundation:"Priority 9H live accepted",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9IAdaptiveSituationalReasoning:true,priority9JProactiveGuidancePrecheck:{version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,staged:true,activationRule:"Activate only for explicit Priority 9J or clear next-move authority requests after 9I pressure handling is stable",expectedFocus:"proactive operational guidance and controlled next-move authority"},noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9JStateFrom(source,turn){return {version:PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL,active:true,lane:"priority9j_proactive_operational_guidance",activePhase:"priority9j_proactive_operational_guidance",conversationLane:"Priority 9J proactive operational guidance",activeTask:"Priority 9J: proactive operational guidance and next-move authority",surfaceRequest:"recommend the safest concrete next move when the active context is sufficiently clear",deeperIntent:"move from reactive continuity and pressure handling into controlled operational guidance without overreach",operationalRisk:"premature authority, unnecessary branching, unsafe sequencing, or advising a next move before risk and context are clear",executionMode:"controlled next-move authority",recommendedMove:"choose the safest concrete action that protects the active lane, validates risk, and advances only one operational step",whyFirst:"it comes first because it preserves the accepted continuity foundation before expanding scope",skipRisk:"if skipped, Marion can over-branch, drift, or make a recommendation before the pressure context is resolved",executionSequence:["confirm active lane and pressure state","name the risk if the move is skipped","choose one safest concrete action","give the short execution sequence","avoid opening unrelated branches"],nextAction:"state the safest next operational move, why it comes first, risk if skipped, and the execution sequence",baseAdaptiveFoundation:"Priority 9I adaptive situational reasoning",turnDepth:Number.isFinite(Number(turn))?Number(turn):1,priority9JProactiveOperationalGuidance:true,noUserFacingDiagnostics:true,updatedAt:Date.now()};}
function priority9IReplyFor(prompt,source){var kind=priority9IJPressureKind([prompt,source].join(" "));if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(source)){if(kind==="decision")return "Continue Priority 9I: the pressure signal is decision pressure. Preserve the 9H continuity foundation, update the risk before choosing, keep 9J staged unless explicitly activated, and give the safest next action without opening extra branches.";if(kind==="safety")return "Continue Priority 9I: the pressure signal is safety-first execution. Preserve the active task, update risk, slow the response enough to avoid overreach, and give the safest next action while keeping Priority 9J staged.";if(kind==="depth")return "Continue Priority 9I: the pressure signal is depth. Go deeper inside the same active lane, update risk and execution mode, and give the next action without resetting to 9H activation wording or drifting into 9J.";if(kind==="pace")return "Continue Priority 9I: the pressure signal is pace control. Slow down, keep the 9H continuity foundation intact, clarify the changed constraint, and give one safe next action.";return "Continue Priority 9I: preserve the 9H continuity foundation, read the current pressure shift, update operational risk and execution mode, then give the safest next action. Keep Priority 9J staged until next-move authority is explicitly needed.";}return "I’m reading this as Priority 9I: adaptive situational reasoning and context-pressure handling. The 9H continuity foundation stays active. The surface request is to adapt Marion when urgency, correction, ambiguity, pace, depth, or operational pressure changes; the deeper intent is to update risk and execution mode without losing the active mission thread. Next move: run pressure prompts such as urgent, pivot, stay on the architecture, slow down, go deeper, risk now, and safest next move. Priority 9J is staged next for proactive operational guidance, but 9I handles the pressure shift first.";}
function priority9JReplyFor(prompt,source){return "Priority 9J: proactive operational guidance and next-move authority. The 9H continuity foundation and 9I pressure-handling layer stay underneath this decision. Recommended next move: choose the safest concrete action that preserves the active lane and advances only one operational step. Why first: it protects continuity before expanding scope. Risk if skipped: Marion can over-branch, drift, or make a recommendation before the pressure context is resolved. Execution sequence: confirm the active lane, name the risk, choose one safest action, execute that step, then reassess before opening new branches.";}
function priority9IJReadReply(packet){var p=priority9IJObj(packet),pl=priority9IJObj(p.payload),f=priority9IJObj(p.finalEnvelope);return priority9IJStr(p.reply||p.finalReply||p.publicReply||p.visibleReply||p.text||p.message||p.response||p.answer||pl.reply||pl.finalReply||pl.publicReply||pl.visibleReply||pl.text||pl.message||pl.answer||f.reply||f.finalReply||f.publicReply||f.visibleReply||f.text||f.message||f.answer);}
function priority9IJApplyPacket(packet,reply,prompt,source,lane){var out=(packet&&typeof packet==="object"&&!Array.isArray(packet))?{...packet}:{};var final=priority9IJStr(reply)||(lane==="9j"?priority9JReplyFor(prompt,source):priority9IReplyFor(prompt,source));["reply","finalReply","publicReply","visibleReply","text","message","response","answer","spokenText"].forEach(function(k){out[k]=final;});out.payload={...(out.payload&&typeof out.payload==="object"?out.payload:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};out.finalEnvelope={...(out.finalEnvelope&&typeof out.finalEnvelope==="object"?out.finalEnvelope:{}),reply:final,finalReply:final,publicReply:final,visibleReply:final,text:final,message:final,answer:final};var prior=priority9IJObj(out.priority9IAdaptiveSituationalReasoning||out.priority9JProactiveOperationalGuidance||out.priority9HLongFormContinuity||out.longFormContinuityStress);var depth=Number.isFinite(Number(prior.turnDepth))?Number(prior.turnDepth)+1:1;if(lane==="9j"){var sj=priority9JStateFrom(source||prompt,depth);out.priority9JProactiveOperationalGuidance=sj;out.priority9JVersion="PRIORITY-9J-PROACTIVE-OPERATIONAL-GUIDANCE-NEXT-MOVE-AUTHORITY";out.conversationLane=sj.conversationLane;out.activeTask=sj.activeTask;out.surfaceRequest=sj.surfaceRequest;out.deeperIntent=sj.deeperIntent;out.operationalRisk=sj.operationalRisk;out.executionMode=sj.executionMode;out.nextAction=sj.nextAction;out.recommendedMove=sj.recommendedMove;out.executionSequence=sj.executionSequence;}else{var si=priority9IStateFrom(source||prompt,depth);out.priority9IAdaptiveSituationalReasoning=si;out.priority9IVersion="PRIORITY-9I-ADAPTIVE-SITUATIONAL-REASONING-CONTEXT-PRESSURE";out.priority9JPrecheck=si.priority9JProactiveGuidancePrecheck;out.conversationLane=si.conversationLane;out.activeTask=si.activeTask;out.surfaceRequest=si.surfaceRequest;out.deeperIntent=si.deeperIntent;out.operationalRisk=si.operationalRisk;out.executionMode=si.executionMode;out.nextAction=si.nextAction;out.pressureSignal=si.pressureSignal;out.whatChanged=si.whatChanged;}out.noUserFacingDiagnostics=true;return out;}
function priority9IJShouldForceText(prompt,source,reply){var ctx=[prompt,source].join(" ");if(priority9IJIs9JActivationText(prompt)||priority9IJIs9JActivationText(ctx))return "9j";if(priority9IJIs9IActivationText(prompt)||priority9IJIs9IActivationText(ctx))return "9i";if(priority9IJIsPressureText(prompt)&&priority9IJHas9IContext(ctx))return "9i";if(priority9IJIsShortFollowup(prompt)&&priority9IJHas9IContext(ctx))return "9i";if((priority9IJHas9IContext(ctx)||priority9IJHas9JContext(ctx))&&(priority9IJOldLaneLeak(reply)||priority9IJPromptEcho(reply,prompt)))return priority9IJHas9JContext(ctx)?"9j":"9i";return "";}

function priority9IJGuardianRouteMeta(payload,base){var p=priority9IJObj(payload);var text=priority9IJStr(p.input||p.text||p.message||p.prompt||"");var src=[text,priority9IJCollect(payload),priority9IJCollect(base)].join(" ");if(priority9IJIs9JActivationText(src)){return {...priority9IJObj(base),priorityLane:"Priority 9J",riskLevel:"medium",approvalRequired:true,nextAction:"Route next-move authority through Marion final approval before advisory Guardian output can influence execution.",priority9JProactiveOperationalGuidance:priority9JStateFrom(src,1),noUserFacingDiagnostics:true};}if(priority9IJIs9IActivationText(src)||priority9IJIsPressureText(text)){return {...priority9IJObj(base),priorityLane:"Priority 9I",riskLevel:"medium",approvalRequired:true,nextAction:"Preserve Marion authority while updating risk and execution mode under context pressure.",priority9IAdaptiveSituationalReasoning:priority9IStateFrom(src,1),noUserFacingDiagnostics:true};}return base;}
if(typeof module.exports.routeGuardianMessage==="function"){var __priority9IJOriginalRouteGuardianMessage=module.exports.routeGuardianMessage;module.exports.routeGuardianMessage=async function priority9IJRouteGuardianMessage(payload,dependencies){var out=await __priority9IJOriginalRouteGuardianMessage.call(this,payload,dependencies);return priority9IJGuardianRouteMeta(payload,out);};}
module.exports.PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_GUARDIAN_ROUTER_VERSION=PRIORITY_9I_ADAPTIVE_SITUATIONAL_REASONING_VERSION_FULL;
module.exports.PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_GUARDIAN_ROUTER_VERSION=PRIORITY_9J_PROACTIVE_OPERATIONAL_GUIDANCE_VERSION_FULL;
module.exports.priority9IJGuardianRouteMeta=priority9IJGuardianRouteMeta;
// PRIORITY_9I_9J_SEQUENCE_GUARDIAN_PIPELINE_PATCH_END
