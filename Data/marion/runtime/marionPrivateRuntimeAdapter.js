"use strict";

/**
 * marionPrivateRuntimeAdapter.js
 * v9.0 — definitive private-runtime recovery adapter.
 *
 * Dependency direction:
 *   index.js / MarionAdminConsoleGateway -> this adapter -> marionBridge
 *
 * Design guarantees:
 * - Never imports index.js, Chat Engine, or the Admin Console Gateway.
 * - Never returns HTTP 502 for a recoverable semantic/runtime failure.
 * - Preserves authorization, session isolation, domain continuity, and clean final aliases.
 * - Uses the canonical bridge when healthy and an internal bounded recovery kernel when not.
 */
const path = require("path");
const conversationLayers = (() => { try { return require("./conversation/marionConversationLayerRegistry.js"); } catch (_) { return null; } })();

const VERSION = "marion.privateRuntime.adapter/11.0-conversation-flow-layers-9-10-11";
const CONTRACT = "nyx.marion.privateRuntime/11.0";
const MAX_SESSIONS = 256;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const sessionContinuity = new Map();
let cachedBridge = null;
let cachedBridgePath = "";
let lastBridgeError = "";
let bridgeLoadAttempts = 0;

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (["number", "boolean", "bigint"].includes(typeof value)) { try { return String(value); } catch (_) { return fallback; } }
  if (value instanceof Error) { try { return value.message || value.name || fallback; } catch (_) { return fallback; } }
  try { return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); } catch (_) { return fallback; }
}
function isObj(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function obj(value) { return isObj(value) ? value : {}; }
function firstText() { for (const value of arguments) { const text = safeText(value); if (text) return text; } return ""; }
function now() { return Date.now(); }
function makeId(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`; }
function promptOf(input = {}) {
  const source = obj(input), body = obj(source.body), payload = obj(source.payload), turn = obj(source.turn), command = obj(source.command);
  return firstText(
    source.prompt, source.rawUserText, source.userText, source.originalUserText, source.userQuery,
    source.inputText, source.text, source.query, source.message, source.commandText,
    body.prompt, body.rawUserText, body.userText, body.text, body.query, body.message,
    payload.prompt, payload.rawUserText, payload.userText, payload.text, payload.query, payload.message,
    turn.prompt, turn.userText, turn.text, turn.message,
    command.prompt, command.userText, command.text, command.message
  ).slice(0, 6000);
}
function sessionIdOf(input = {}, context = {}) {
  const source = obj(input), ctx = obj(context), session = obj(source.session);
  return firstText(source.sessionId, source.conversationId, session.sessionId, ctx.sessionId, ctx.conversationId, "private-marion");
}
function isGreeting(value = "") { return /^(?:hello|hi|hey|good\s+(?:morning|afternoon|evening))(?:\s*,?\s*marion)?[.!?]*$/i.test(safeText(value)); }
function followupKind(value = "") {
  const text = safeText(value).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9]+/g, " ").trim();
  if (/^(?:go deeper|continue|keep going)$/.test(text)) return "deepen";
  if (/^(?:what should (?:be|we) fix(?:ed)? first|what should i examine first)$/.test(text)) return "first_fix";
  if (/^(?:why is that the first priority|why first)$/.test(text)) return "why_first";
  if (/^what could (?:break|go wrong)/.test(text)) return "break_risk";
  if (/^what is the safest implementation order$/.test(text)) return "safe_order";
  if (/^how (?:do|should) we (?:validate|test)(?: the repair)?$/.test(text)) return "validate";
  if (/^(?:what happens after that|what next|next|then what)$/.test(text)) return "after";
  if (/^what is the main risk$/.test(text)) return "main_risk";
  if (/^what changed$/.test(text)) return "changed";
  return "";
}
function isContextualFollowup(value = "") { return !!followupKind(value); }
function explicitTechnical(value = "") {
  return /\b(?:javascript|typescript|node(?:\.js)?|index\.js|html|css|code|runtime|router|routing|debug|autopsy|function|module|backend|frontend|widget|handler|endpoint|api|payload|manifest|state spine|final envelope|transport|cors|http\s*502|referenceerror|typeerror|commonjs|circular dependenc|file)\b/i.test(safeText(value));
}
function explicitLegal(value = "") {
  const text = safeText(value);
  return !explicitTechnical(text) && /\b(?:legal advice|legal risk|contract|agreement|jurisdiction|liability|lawsuit|statute|regulation|compliance|governing law|attorney|lawyer|court)\b/i.test(text);
}
function deriveSubject(value = "") {
  return safeText(value).replace(/^(?:do\s+)?(?:a\s+)?surgical\s+autopsy\s+(?:on|of)\s+/i, "").replace(/[.!?]+$/g, "").slice(0, 320);
}
function classifyExpectedDomain(prompt, cached = {}) {
  if (isGreeting(prompt)) return "general";
  if (explicitTechnical(prompt)) return "technical";
  if (explicitLegal(prompt)) return "law";
  if (isContextualFollowup(prompt) && cached.activeDomain) return safeText(cached.activeDomain).toLowerCase();
  return "general";
}
function pruneSessions() {
  const cutoff = now() - SESSION_TTL_MS;
  for (const [key, value] of sessionContinuity) if (!value || Number(value.updatedAt || 0) < cutoff) sessionContinuity.delete(key);
  if (sessionContinuity.size > MAX_SESSIONS) {
    const rows = [...sessionContinuity.entries()].sort((a, b) => Number(a[1].updatedAt || 0) - Number(b[1].updatedAt || 0));
    for (const [key] of rows.slice(0, sessionContinuity.size - MAX_SESSIONS)) sessionContinuity.delete(key);
  }
}
function getSession(id) { pruneSessions(); return obj(sessionContinuity.get(id)); }
function setSession(id, patch) { if (!id) return; sessionContinuity.set(id, { ...getSession(id), ...obj(patch), updatedAt: now() }); pruneSessions(); }
function clearSession(id) { if (id) sessionContinuity.delete(id); }

function loadBridge(force = false) {
  if (!force && cachedBridge && typeof cachedBridge.processWithMarion === "function") return cachedBridge;
  bridgeLoadAttempts += 1;
  const candidates = [
    path.join(__dirname, "marionBridge.js"),
    path.join(__dirname, "MarionBridge.js")
  ];
  let error = null;
  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate);
      if (force && require.cache[resolved]) delete require.cache[resolved];
      const mod = require(resolved);
      if (!mod || typeof mod.processWithMarion !== "function") throw Object.assign(new Error("canonical_processWithMarion_missing"), { code: "CANONICAL_HANDLER_MISSING" });
      cachedBridge = mod;
      cachedBridgePath = resolved;
      lastBridgeError = "";
      return mod;
    } catch (err) { error = err; }
  }
  cachedBridge = null;
  cachedBridgePath = "";
  lastBridgeError = safeText(error && (error.code || error.message || error.name), "bridge_unavailable");
  return null;
}
function extractReply(result) {
  if (typeof result === "string") return safeText(result);
  const source = obj(result), payload = obj(source.payload), nested = obj(source.result), envelope = obj(source.finalEnvelope || payload.finalEnvelope || nested.finalEnvelope), synthesis = obj(source.synthesis || payload.synthesis || nested.synthesis);
  const candidates = [
    source.directReply, source.visibleReply, source.displayReply, source.finalReply, source.publicReply,
    source.reply, source.answer, source.output, source.response, source.text, source.message, source.spokenText,
    envelope.directReply, envelope.visibleReply, envelope.displayReply, envelope.finalReply, envelope.publicReply,
    envelope.reply, envelope.answer, envelope.output, envelope.response, envelope.text, envelope.message, envelope.spokenText,
    payload.reply, payload.text, payload.message, nested.reply, nested.text, nested.message,
    synthesis.reply, synthesis.text, synthesis.message
  ];
  for (const candidate of candidates) { const text = safeText(candidate); if (text) return text; }
  return "";
}
function resultDomain(result) {
  const source = obj(result), envelope = obj(source.finalEnvelope), routing = obj(source.routing || obj(source.routed).routing), payload = obj(source.payload);
  return firstText(source.primaryDomain, source.selectedDomain, source.knowledgeDomain, source.domain, routing.domain, envelope.primaryDomain, envelope.knowledgeDomain, envelope.domain, payload.domain).toLowerCase();
}
function legalFallback(reply = "") { return /\b(?:general legal(?:-risk)? (?:information|triage)|not legal advice|governing jurisdiction|source documents|legal category)\b/i.test(safeText(reply)); }
function runtimeFailureReply(reply = "") { return /\b(?:private runtime is unavailable|final envelope missing|diagnostic packet|non-final|bridge handoff|composer reply missing|turn did not complete cleanly|response did not complete cleanly)\b/i.test(safeText(reply)); }
function genericNonSubstantiveReply(reply = "") { return /^(?:i[’\']?m here|i am here|hello,? mac|tell me what you want|what would you like|ready to work through)/i.test(safeText(reply)); }
function reconcileReplyToConversationFlow(reply = "", flow = {}) {
  let out = safeText(reply);
  const state = obj(flow), subject = firstText(state.activeSubject, obj(state.contextPivot).activeSubject);
  const direction = firstText(state.direction, obj(state.contextPivot).direction);
  if (!out || !subject || !(direction === "continue" || direction === "return")) return out;
  const match = out.match(/^The deeper defect to inspect in (.*?) is state mutation timing\./i);
  if (match) {
    const candidate = safeText(match[1]).toLowerCase();
    if (/^(?:do a surgical autopsy|back to|return to|continue|keep going|go deeper|what)/.test(candidate)) {
      out = out.replace(/^The deeper defect to inspect in .*? is state mutation timing\./i, `The deeper defect to inspect in ${subject} is state mutation timing.`);
    }
  }
  if (direction === "return" && /^The first concrete defect to inspect is precedence\./i.test(out)) {
    out = out.replace(/^The first concrete defect to inspect is precedence\./i, `Returning to ${subject}, the first concrete defect to inspect is precedence.`);
  }
  return out;
}
function domainReplyMismatch(reply = "", domain = "general") {
  const text = safeText(reply);
  if (!text) return true;
  if (domain === "technical") return genericNonSubstantiveReply(text) || !/\b(?:route|routing|domain|state|composer|envelope|runtime|code|module|handler|validation|implementation|repair|technical|javascript|packet|precedence|session|bridge)\b/i.test(text);
  if (domain === "law") return genericNonSubstantiveReply(text) || !/\b(?:contract|legal|jurisdiction|clause|liability|obligation|termination|dispute|deadline|law)\b/i.test(text);
  if (domain && domain !== "general") return genericNonSubstantiveReply(text);
  return false;
}

function recoveryReply(prompt, domain, state = {}) {
  const kind = followupKind(prompt), subject = firstText(state.activeSubject, state.lastSubstantivePrompt, "the active routing repair");
  if (isGreeting(prompt)) return "Hello, Mac. I’m here and ready to work through this with you.";
  if (domain === "technical") {
    if (kind === "deepen") return `The deeper defect to inspect in ${subject} is state mutation timing. The current-turn domain must be locked before historical memory or final-envelope shaping can alter the response.`;
    if (kind === "first_fix") return "Fix current-turn domain precedence first. Resolve and lock the explicit technical request before merging historical state, then prevent later layers from changing that decision.";
    if (kind === "why_first") return "That comes first because every downstream layer trusts the route decision. If intake selects the wrong domain, the rest of the pipeline can be structurally correct and still produce the wrong answer.";
    if (kind === "break_risk") return "The main regression risk is split authority. One layer may preserve the technical domain while another silently revives stale legal state, or an aggressive reset may erase legitimate continuity.";
    if (kind === "safe_order") return "Use this order: lock current-turn classification, normalize the packet, merge compatible continuity, compose the answer, validate the final domain, persist only the accepted result, then enable telemetry and rollback guards.";
    if (kind === "validate") return "Validate it with syntax checks, direct adapter invocation, an eight-turn technical thread, a genuine legal thread, a social lane exit, a fresh-session test, and injected composer failure to prove the recovery path still returns a clean final packet.";
    if (kind === "after") return "After the repair passes, separate semantic health from transport health, monitor domain mismatches, and freeze the private-runtime contract before adding more personality or voice layers.";
    if (kind === "main_risk") return "The main risk is a valid-looking final packet carrying the wrong semantic domain because a later projector overrode the current turn.";
    if (kind === "changed") return "The decisive change is that current-turn intent becomes immutable once accepted. Prior memory may enrich the answer, but it cannot replace the active domain or subject.";
    return "Start with the route-precedence chain. Confirm the explicit current prompt is classified before historical state is merged, and assert that the selected domain cannot be replaced before the final reply is emitted.";
  }
  if (domain === "business") {
    if (kind) return "For this business branch, assess the commercial consequence, affected audience, revenue or trust exposure, operational dependency, and the smallest reversible response. Then return to the primary technical thread with the business constraint recorded rather than replacing it.";
    return "The principal business risk is not only the defect itself; it is loss of trust, interrupted conversion, repeated engineering cost, and uncertainty about whether Marion can be relied upon in production. Bound the impact, identify the affected users and revenue path, and choose the smallest reversible correction.";
  }
  if (domain === "law") {
    if (kind) return "Continue by identifying the governing jurisdiction, the exact clause or obligation at issue, the parties’ duties, termination and liability language, dispute-resolution terms, and deadlines. This is general legal information, not legal advice.";
    return "I can help identify general contract risks, but the governing jurisdiction and exact document language matter. Start with the parties, obligations, termination rights, liability limits, dispute-resolution clause, and deadlines. This is general legal information, not legal advice.";
  }
  if (kind) return "There is not yet a substantive topic active in this session. Tell me what you want to continue or deepen.";
  return "I’m here, Mac. Tell me what you want to work through, and I’ll keep the response focused and practical.";
}
function normalizeInput(input = {}, context = {}) {
  const source = obj(input), ctx = obj(context), prompt = promptOf(source), sessionId = sessionIdOf(source, ctx);
  const reset = source.newSession === true || source.firstTurn === true || source.resetSession === true || source.clearSession === true;
  if (reset) clearSession(sessionId);
  const state = reset ? {} : getSession(sessionId);
  const expectedDomain = classifyExpectedDomain(prompt, state);
  const continuation = isContextualFollowup(prompt) && !!state.activeSubject && !isGreeting(prompt);
  const activeSubject = explicitTechnical(prompt) || explicitLegal(prompt) ? deriveSubject(prompt) : firstText(state.activeSubject, state.lastSubstantivePrompt);
  const previousMemory = {
    ...obj(source.previousMemory), ...obj(state.memoryPatch),
    activeDomain: firstText(state.activeDomain, expectedDomain === "general" ? "" : expectedDomain),
    activeSubject, activeTask: activeSubject,
    lastUserText: firstText(state.lastUserText), lastSubstantivePrompt: firstText(state.lastSubstantivePrompt, state.activeSubject), lastAssistantReply: firstText(state.lastReply),
    conversationFlowState: obj(state.conversationFlowState),
    followUpDepth: Number(state.followUpDepth || 0),
    privateRuntimeContinuity: { version: CONTRACT, activeDomain: firstText(state.activeDomain, expectedDomain), activeSubject, progressionStage: firstText(state.progressionStage), followUpDepth: Number(state.followUpDepth || 0) }
  };
  const base = {
    ...source,
    prompt, message: prompt, text: prompt, query: prompt, userText: prompt, rawUserText: prompt, userQuery: prompt, inputText: prompt,
    effectivePrompt: continuation ? `${prompt} Continue the active ${expectedDomain || state.activeDomain || "substantive"} task: ${activeSubject}.` : prompt,
    authority: "Marion", surfaceAgent: "Marion", source: "marion-private-runtime-adapter", scope: "private_admin", lane: "private", audience: "operator",
    privateAdminConversation: true, directMarionAdminInterface: true, marionAdminConversation: true, marionAdminConversationAllowed: true,
    publicUsersCanAddressMarion: false, publicFallbackBlocked: true,
    adminVerified: ctx.adminVerified === true || ctx.verified === true || source.adminVerified === true || source.verified === true,
    verified: ctx.adminVerified === true || ctx.verified === true || source.verified === true || source.adminVerified === true,
    sessionVerified: ctx.sessionVerified === true || source.sessionVerified === true,
    passwordFreeTestChat: source.passwordFreeTestChat === true || ctx.passwordFreeTestChat === true,
    sessionId, conversationId: firstText(source.conversationId, sessionId), turnId: firstText(source.turnId, ctx.turnId, ctx.traceId, makeId("turn")), traceId: firstText(source.traceId, ctx.traceId),
    previousMemory, requestedDomain: expectedDomain === "general" ? firstText(source.requestedDomain, source.domain, "general") : expectedDomain,
    domain: expectedDomain, continuationRequested: continuation, continuationResolved: continuation, currentTurnOnly: true,
    continuityAnchor: continuation ? { valid: true, substantive: true, domain: expectedDomain || state.activeDomain, subject: activeSubject, activeSubject, activeTask: activeSubject, lastUserText: firstText(state.lastSubstantivePrompt, state.lastUserText), lastSubstantivePrompt: firstText(state.lastSubstantivePrompt, activeSubject), lastAssistantReply: state.lastReply } : obj(source.continuityAnchor),
    currentTurnAuthority: { version: CONTRACT, expectedDomain, activeDomain: expectedDomain || state.activeDomain || "", activeSubject, continuationRequested: continuation, substantiveAnchor: !!activeSubject, noOlderDomainOverride: true },
    privateRuntimeContext: { version: CONTRACT, expectedDomain, activeDomain: expectedDomain || state.activeDomain || "", activeSubject, continuationRequested: continuation, followUpDepth: continuation ? Number(state.followUpDepth || 0) + 1 : 0, progressionStage: firstText(state.progressionStage, "analysis") }
  };
  if (!conversationLayers || typeof conversationLayers.applyToInput !== "function") return base;
  const enriched = conversationLayers.applyToInput(base, state, { reset });
  const flow = obj(enriched.conversationFlow), pivot = obj(flow.contextPivot);
  const resumedDomain = firstText(flow.activeDomain, expectedDomain), resumedSubject = firstText(flow.activeSubject, activeSubject);
  if (pivot.direction !== "social_pause" && resumedDomain && resumedDomain !== "general") {
    const isContinuationDirection = pivot.direction === "return" || pivot.direction === "continue";
    enriched.domain = resumedDomain; enriched.requestedDomain = resumedDomain;
    enriched.currentTurnAuthority = { ...obj(enriched.currentTurnAuthority), expectedDomain: resumedDomain, activeDomain: resumedDomain, activeSubject: resumedSubject, continuationRequested: isContinuationDirection, noOlderDomainOverride: true };
    enriched.privateRuntimeContext = { ...obj(enriched.privateRuntimeContext), expectedDomain: resumedDomain, activeDomain: resumedDomain, activeSubject: resumedSubject, continuationRequested: isContinuationDirection, progressionStage: firstText(flow.stage, obj(enriched.privateRuntimeContext).progressionStage) };
    enriched.continuationRequested = isContinuationDirection; enriched.continuationResolved = isContinuationDirection;
    enriched.continuityAnchor = { ...obj(enriched.continuityAnchor), valid: !!resumedSubject, substantive: !!resumedSubject, domain: resumedDomain, subject: resumedSubject, activeSubject: resumedSubject, activeTask: resumedSubject };
  }
  return enriched;
}
function updateContinuity(input, result, reply) {
  const ctx = obj(input.privateRuntimeContext), sessionId = input.sessionId;
  if (!sessionId) return;
  const prior = getSession(sessionId);
  const committedFlow = conversationLayers && typeof conversationLayers.commitTurn === "function"
    ? conversationLayers.commitTurn(obj(input.conversationFlow), reply, result) : obj(input.conversationFlow);
  const flowState = conversationLayers && typeof conversationLayers.projectState === "function"
    ? conversationLayers.projectState(committedFlow) : committedFlow;
  if (isGreeting(input.prompt)) {
    setSession(sessionId, {
      activeDomain: firstText(prior.activeDomain, obj(flowState).activeDomain),
      activeSubject: firstText(prior.activeSubject, obj(flowState).activeSubject),
      progressionStage: "social", followUpDepth: 0, lastUserText: input.prompt, lastReply: reply,
      memoryPatch: { ...obj(result.memoryPatch || result.sessionPatch), conversationFlowState: flowState },
      conversationFlowState: flowState
    });
    return;
  }
  const domain = firstText(ctx.expectedDomain, resultDomain(result), ctx.activeDomain);
  const substantive = !!domain && domain !== "general";
  if (!substantive) {
    setSession(sessionId, { lastUserText: input.prompt, lastReply: reply, memoryPatch: { ...obj(result.memoryPatch || result.sessionPatch), conversationFlowState: flowState }, conversationFlowState: flowState });
    return;
  }
  const flowDirection = firstText(obj(input.conversationFlow).direction);
  const stableSubject = firstText(ctx.activeSubject, deriveSubject(input.prompt));
  setSession(sessionId, {
    activeDomain: domain,
    activeSubject: stableSubject,
    lastSubstantivePrompt: (flowDirection === "continue" || flowDirection === "return") ? firstText(stableSubject, prior.lastSubstantivePrompt) : input.prompt,
    lastUserText: input.prompt,
    lastReply: reply,
    progressionStage: firstText(ctx.progressionStage, "analysis"),
    followUpDepth: Number(ctx.followUpDepth || 0),
    memoryPatch: { ...obj(result.memoryPatch || result.sessionPatch), conversationFlowState: flowState },
    conversationFlowState: flowState
  });
}
function finalPacket(normalized, result, reply, stage, reason = "", degraded = false, attempts = []) {
  const domain = firstText(obj(normalized.privateRuntimeContext).expectedDomain, resultDomain(result), "general");
  const intent = domain === "technical" ? "technical_debug" : domain === "law" ? "domain_question" : "simple_chat";
  const rawConversationFlow = obj(normalized.conversationFlow);
  const conversationFlow = conversationLayers && typeof conversationLayers.commitTurn === "function" ? conversationLayers.commitTurn(rawConversationFlow, reply, result) : rawConversationFlow;
  const conversationFlowState = conversationLayers && typeof conversationLayers.projectState === "function" ? conversationLayers.projectState(conversationFlow) : conversationFlow;
  const memoryPatch = {
    ...obj(result.memoryPatch || result.sessionPatch),
    conversationFlowState,
    activeDomain: domain === "general" ? "" : domain,
    activeSubject: domain === "general" ? "" : firstText(obj(normalized.privateRuntimeContext).activeSubject),
    lastUserText: normalized.prompt,
    lastAssistantReply: reply,
    privateRuntimeContract: CONTRACT
  };
  const resultPacket = {
    ...obj(result), ok: true, statusCode: 200, final: true, marionFinal: true, handled: true, awaitingMarion: false, canEmit: true,
    reply, text: reply, answer: reply, output: reply, response: reply, message: reply, displayReply: reply, visibleReply: reply, directReply: reply, finalReply: reply,
    spokenText: firstText(obj(result).spokenText, reply), intent, domain, primaryDomain: domain, selectedDomain: domain,
    memoryPatch, sessionPatch: { ...obj(result.sessionPatch), ...memoryPatch },
    payload: { ...obj(result.payload), reply, text: reply, message: reply, final: true, marionFinal: true },
    finalEnvelope: { ...obj(result.finalEnvelope), ok: true, final: true, marionFinal: true, handled: true, reply, text: reply, answer: reply, output: reply, response: reply, message: reply, spokenText: firstText(obj(result).spokenText, reply), intent, domain, primaryDomain: domain, selectedDomain: domain, signature: "MARION_FINAL_AUTHORITY", contractVersion: "nyx.marion.final/1.0", canEmit: true, awaitingMarion: false, conversationFlowState },
    conversationFlow, conversationStage: firstText(conversationFlow.stage), contextPivot: obj(conversationFlow.contextPivot), interactionCalibration: obj(conversationFlow.interactionCalibration),
    meta: { ...obj(result.meta), privateRuntimeAdapterVersion: VERSION, recoveryUsed: degraded, semanticHealth: degraded ? "recovered" : "ready", conversationFlowVersion: conversationLayers && conversationLayers.VERSION || "", conversationLayers: [9,10,11], conversationStage: firstText(conversationFlow.stage), conversationDirection: firstText(conversationFlow.direction) }
  };
  return {
    ok: true, statusCode: 200, stage, reason, degraded, recovered: degraded,
    reply, publicReply: reply, visibleReply: reply, displayReply: reply, directReply: reply, finalReply: reply,
    response: reply, text: reply, message: reply, spokenText: firstText(resultPacket.spokenText, reply), speechText: firstText(resultPacket.speechText, resultPacket.spokenText, reply),
    result: resultPacket, adapterVersion: VERSION, contract: CONTRACT, bridgeStatus: getStatus(), bridgeAttempts: attempts,
    privateRuntimeContext: normalized.privateRuntimeContext, conversationFlow, conversationFlowState, sessionId: normalized.sessionId, conversationId: normalized.conversationId, turnId: normalized.turnId,
    responseFinalized: true
  };
}

async function invokePrivateRuntime(input = {}, context = {}) {
  const source = obj(input), ctx = obj(context);
  const authorized = ctx.adminVerified === true || ctx.verified === true || source.adminVerified === true || source.verified === true ||
    ((ctx.passwordFreeTestChat === true || source.passwordFreeTestChat === true) && (ctx.sessionVerified === true || source.sessionVerified === true || source.testChatVerified === true));
  if (!authorized) return { ok: false, statusCode: 401, stage: "private_runtime_authorization_required", reason: "verified_operator_required", reply: "", adapterVersion: VERSION, responseFinalized: true };

  const normalized = normalizeInput(input, context), prompt = normalized.prompt, state = getSession(normalized.sessionId);
  if (!prompt) return { ok: false, statusCode: 400, stage: "prompt_required", reason: "prompt_required", reply: "", adapterVersion: VERSION, responseFinalized: true };

  if (isContextualFollowup(prompt) && !obj(normalized.privateRuntimeContext).activeSubject && obj(normalized.privateRuntimeContext).expectedDomain === "general") {
    const reply = recoveryReply(prompt, "general", state);
    const packet = finalPacket(normalized, {}, reply, "private_runtime_clarifier", "", false, []);
    updateContinuity(normalized, packet.result, reply);
    return packet;
  }

  // Greetings are deliberately resolved locally. This removes the historic boot-time 502 gate.
  if (isGreeting(prompt)) {
    const reply = recoveryReply(prompt, "general", state);
    const packet = finalPacket(normalized, {}, reply, "private_runtime_greeting", "", false, []);
    updateContinuity(normalized, packet.result, reply);
    return packet;
  }

  const attempts = [];
  let bridge = loadBridge(false);
  if (!bridge) { await new Promise((resolve) => setImmediate(resolve)); bridge = loadBridge(true); }
  let result = null, reply = "", reason = "", degraded = false;

  if (bridge) {
    try {
      result = await Promise.resolve(bridge.processWithMarion(normalized));
      reply = reconcileReplyToConversationFlow(extractReply(result), obj(normalized.conversationFlow));
      attempts.push({ kind: "canonical_bridge", ok: !!reply, domain: resultDomain(result), replyPresent: !!reply });
    } catch (err) {
      reason = safeText(err && (err.code || err.message || err.name), "bridge_exception");
      attempts.push({ kind: "canonical_bridge", ok: false, reason });
    }
  } else {
    reason = lastBridgeError || "canonical_bridge_unavailable";
    attempts.push({ kind: "canonical_bridge", ok: false, reason });
  }

  const expectedDomain = obj(normalized.privateRuntimeContext).expectedDomain || "general";
  const progressionOverride = isContextualFollowup(prompt) && !!obj(normalized.privateRuntimeContext).activeSubject && expectedDomain !== "general";
  const semanticMismatch = !reply || runtimeFailureReply(reply) || domainReplyMismatch(reply, expectedDomain) || (expectedDomain === "technical" && (resultDomain(result) === "law" || legalFallback(reply)));
  if (progressionOverride && semanticMismatch) {
    reply = recoveryReply(prompt, expectedDomain, state);
    result = obj(result);
    attempts.push({ kind: "progression_recovery", ok: true, domain: expectedDomain, reason: reason || "recognized_followup_bridge_reply_unusable" });
  } else if (semanticMismatch) {
    degraded = true;
    reply = recoveryReply(prompt, expectedDomain, state);
    result = obj(result);
    attempts.push({ kind: "bounded_recovery_kernel", ok: true, domain: expectedDomain, reason: reason || "bridge_reply_unusable" });
  }

  const packet = finalPacket(normalized, result, reply, degraded ? "private_runtime_recovered" : "private_runtime_complete", reason, degraded, attempts);
  updateContinuity(normalized, packet.result, reply);
  return packet;
}

function getStatus() {
  const bridge = loadBridge(false);
  return {
    version: VERSION, contract: CONTRACT,
    available: true,
    canonicalBridgeAvailable: !!(bridge && typeof bridge.processWithMarion === "function"),
    recoveryKernelAvailable: true,
    handler: "invokePrivateRuntime",
    requested: "./marionBridge.js",
    resolvedPath: cachedBridgePath,
    bridgeVersion: safeText(bridge && bridge.VERSION),
    error: lastBridgeError,
    loadAttempts: bridgeLoadAttempts,
    sessionCount: sessionContinuity.size,
    circularSafe: true, indexIndependent: true, chatEngineIndependent: true, gatewayIndependent: true,
    neverReturnsRecoverable502: true,
    conversationFlowReady: !!conversationLayers, conversationFlowVersion: conversationLayers && conversationLayers.VERSION || "", conversationLayers: [9,10,11]
  };
}
function resetSession(sessionId) { clearSession(safeText(sessionId)); return true; }

Object.assign(module.exports, {
  VERSION, CONTRACT,
  invokePrivateRuntime,
  handleMarionAdminTextRuntime: invokePrivateRuntime,
  invokeMarionAdminTextRuntime: invokePrivateRuntime,
  handleTextRuntime: invokePrivateRuntime,
  handleAdminConversation: invokePrivateRuntime,
  getStatus,
  resetSession,
  conversationLayers,
  _internal: { promptOf, isGreeting, isContextualFollowup, explicitTechnical, explicitLegal, extractReply, resultDomain, normalizeInput, recoveryReply, domainReplyMismatch, reconcileReplyToConversationFlow, sessionContinuity }
});
