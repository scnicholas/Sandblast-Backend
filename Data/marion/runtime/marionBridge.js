"use strict";

/**
 * marionBridge.js
 * Clean reduced Marion bridge.
 *
 * Mission:
 * - validate inbound packet
 * - call marionIntentRouter
 * - call composeMarionResponse
 * - mark final
 * - return response
 *
 * Non-goals:
 * - no fallback personality
 * - no emotional interpretation
 * - no packet re-wrapping
 * - no legacy retriever orchestration
 */

const VERSION = "marionBridge v6.0.0 CLEAN-REDUCED-FINAL-HANDOFF";
const CANONICAL_ENDPOINT = "marion://routeMarion.primary";

let routeMarionIntent = null;
let composeMarionResponse = null;

try {
  ({ routeMarionIntent } = require("./marionIntentRouter"));
} catch (_err) {
  routeMarionIntent = null;
}

try {
  ({ composeMarionResponse } = require("./composeMarionResponse"));
} catch (_err) {
  composeMarionResponse = null;
}

function safeStr(value) {
  return value == null ? "" : String(value).trim();
}

function isObj(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function safeObj(value) {
  return isObj(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function lower(value) {
  return safeStr(value).toLowerCase();
}

function hashText(value) {
  const source = lower(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

function nowIso() {
  return new Date().toISOString();
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = safeStr(arguments[i]);
    if (value) return value;
  }
  return "";
}

function extractUserText(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const payload = safeObj(src.payload);
  const packet = safeObj(src.packet);
  const synthesis = safeObj(packet.synthesis);

  return firstText(
    src.userQuery,
    src.text,
    src.query,
    src.message,
    body.userQuery,
    body.text,
    body.query,
    body.message,
    payload.userQuery,
    payload.text,
    payload.query,
    payload.message,
    synthesis.userQuery,
    synthesis.text
  );
}

function extractLane(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const session = safeObj(src.session || body.session);
  const meta = safeObj(src.meta || body.meta);

  return firstText(
    src.lane,
    src.sessionLane,
    body.lane,
    body.sessionLane,
    session.lane,
    meta.lane,
    "general"
  ) || "general";
}

function extractTurnId(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const meta = safeObj(src.meta || body.meta);

  return firstText(
    src.turnId,
    src.requestId,
    src.traceId,
    src.id,
    body.turnId,
    body.requestId,
    body.traceId,
    meta.turnId,
    meta.requestId,
    meta.traceId
  );
}

function extractPreviousMemory(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const session = safeObj(src.session || body.session);
  const meta = safeObj(src.meta || body.meta);

  return safeObj(
    src.previousMemory ||
    src.turnMemory ||
    src.memory ||
    body.previousMemory ||
    body.turnMemory ||
    body.memory ||
    session.previousMemory ||
    session.turnMemory ||
    session.memory ||
    meta.previousMemory ||
    {}
  );
}

function extractMarionIntentPacket(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const session = safeObj(src.session || body.session);
  const meta = safeObj(src.meta || body.meta);

  return safeObj(
    src.marionIntent ||
    src.intentPacket ||
    body.marionIntent ||
    body.intentPacket ||
    session.marionIntent ||
    meta.marionIntent ||
    {}
  );
}

function extractRequestedDomain(input = {}) {
  const src = safeObj(input);
  const body = safeObj(src.body);
  const meta = safeObj(src.meta || body.meta);
  const packet = safeObj(src.packet);
  const routing = safeObj(packet.routing);

  return firstText(
    src.requestedDomain,
    src.domain,
    body.requestedDomain,
    body.domain,
    meta.requestedDomain,
    meta.domain,
    meta.preferredDomain,
    routing.domain,
    "general"
  ) || "general";
}

function isAlreadyFinal(input = {}) {
  const src = safeObj(input);
  const meta = safeObj(src.meta);
  const packet = safeObj(src.packet);
  const packetMeta = safeObj(packet.meta);

  return !!(
    src.final === true ||
    src.handled === true ||
    src.marionFinal === true ||
    src.marionHandled === true ||
    meta.final === true ||
    meta.marionFinal === true ||
    packet.final === true ||
    packet.marionFinal === true ||
    packetMeta.final === true ||
    packetMeta.marionFinal === true
  );
}

function normalizeInbound(input = {}) {
  const source = safeObj(input);
  const userQuery = extractUserText(source);
  const turnId = extractTurnId(source) || `marion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const lane = extractLane(source);
  const requestedDomain = extractRequestedDomain(source);
  const previousMemory = extractPreviousMemory(source);
  const marionIntent = extractMarionIntentPacket(source);

  const issues = [];
  if (!userQuery) issues.push("user_query_missing");

  return {
    ok: issues.length === 0,
    issues,
    original: source,
    userQuery,
    text: userQuery,
    query: userQuery,
    lane,
    requestedDomain,
    domain: requestedDomain,
    previousMemory,
    marionIntent,
    turnId,
    sessionId: firstText(source.sessionId, source.body && source.body.sessionId, source.meta && source.meta.sessionId, "public") || "public"
  };
}

function validateRouterResult(result = {}) {
  const src = safeObj(result);
  const routing = safeObj(src.routing);
  const marionIntent = safeObj(src.marionIntent);
  const issues = [];

  if (!src.ok) issues.push("router_not_ok");
  if (!safeStr(routing.intent || marionIntent.intent)) issues.push("intent_missing");
  if (!safeStr(routing.domain)) issues.push("domain_missing");
  if (!safeStr(routing.endpoint)) issues.push("endpoint_missing");

  return { ok: issues.length === 0, issues };
}

function extractReply(contract = {}) {
  const src = safeObj(contract);
  const synthesis = safeObj(src.synthesis);
  const payload = safeObj(src.payload);

  return firstText(
    src.reply,
    src.text,
    src.answer,
    src.output,
    src.response,
    src.message,
    src.spokenText,
    payload.reply,
    payload.text,
    payload.answer,
    payload.output,
    synthesis.reply,
    synthesis.text,
    synthesis.answer,
    synthesis.output,
    synthesis.spokenText
  );
}

function validateComposeResult(contract = {}) {
  const src = safeObj(contract);
  const issues = [];

  if (!Object.keys(src).length) issues.push("compose_contract_missing");
  if (src.ok === false) issues.push("compose_not_ok");
  if (!extractReply(src)) issues.push("compose_reply_missing");

  return { ok: issues.length === 0, issues };
}

function buildErrorResult(reason, detail = {}, input = {}) {
  const normalized = safeObj(input);
  const userQuery = safeStr(normalized.userQuery || normalized.text || normalized.query || "");
  const turnId = safeStr(normalized.turnId || "");
  const domain = safeStr(normalized.domain || normalized.requestedDomain || "general") || "general";
  const intent = safeStr(normalized.intent || "bridge_error") || "bridge_error";
  const reply = "";

  return markFinal({
    ok: false,
    error: true,
    status: "error",
    reason: safeStr(reason || "bridge_error") || "bridge_error",
    detail: safeObj(detail),
    userQuery,
    domain,
    intent,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    spokenText: reply,
    followUps: [],
    followUpsStrings: [],
    payload: { reply, text: reply, answer: reply, output: reply, spokenText: reply },
    diagnostics: {
      bridgeVersion: VERSION,
      bridgeError: true,
      reason: safeStr(reason || "bridge_error") || "bridge_error",
      detail: safeObj(detail)
    },
    meta: {
      version: VERSION,
      endpoint: CANONICAL_ENDPOINT,
      turnId,
      final: true,
      marionFinal: true,
      handled: true,
      finalizedBy: "marionBridge",
      bridgeReduced: true
    }
  }, normalized);
}

function buildPacket({ normalized, routed, contract, reply, replySignature }) {
  const routing = safeObj(routed.routing);
  const intent = safeStr(routing.intent || safeObj(routed.marionIntent).intent || contract.intent || "simple_chat") || "simple_chat";
  const domain = safeStr(routing.domain || contract.domain || normalized.domain || "general") || "general";
  const endpoint = safeStr(routing.endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT;
  const synthesis = safeObj(contract.synthesis);

  return {
    routing: { domain, intent, endpoint },
    synthesis: {
      ...synthesis,
      domain,
      intent,
      reply,
      text: reply,
      answer: reply,
      output: reply,
      spokenText: safeStr(contract.spokenText || synthesis.spokenText || reply.replace(/\n+/g, " ")) || reply
    },
    memoryPatch: safeObj(contract.memoryPatch),
    meta: {
      version: VERSION,
      endpoint,
      turnId: normalized.turnId,
      replySignature,
      final: true,
      marionFinal: true,
      handled: true,
      finalizedBy: "marionBridge",
      bridgeReduced: true,
      singleSourceOfTruth: true
    }
  };
}

function markFinal(result = {}, input = {}) {
  const src = safeObj(result);
  const normalized = safeObj(input);
  const reply = extractReply(src);
  const replySignature = safeStr(src.replySignature || hashText(reply));
  const spokenText = safeStr(src.spokenText || reply.replace(/\n+/g, " ")) || reply;

  const out = {
    ...src,
    ok: src.ok !== false,
    final: true,
    handled: true,
    marionFinal: true,
    marionHandled: true,
    composedOnce: true,
    finalizedBy: "marionBridge",
    replyAuthority: "composeMarionResponse",
    replySignature,
    endpoint: safeStr(src.endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT,
    userQuery: safeStr(src.userQuery || normalized.userQuery || normalized.text || ""),
    domain: safeStr(src.domain || normalized.domain || normalized.requestedDomain || "general") || "general",
    intent: safeStr(src.intent || normalized.intent || "simple_chat") || "simple_chat",
    reply,
    text: reply,
    answer: reply,
    output: reply,
    response: reply,
    message: reply,
    spokenText,
    followUps: safeArray(src.followUps),
    followUpsStrings: safeArray(src.followUpsStrings),
    payload: {
      ...safeObj(src.payload),
      reply,
      text: reply,
      answer: reply,
      output: reply,
      response: reply,
      message: reply,
      spokenText,
      final: true,
      marionFinal: true,
      handled: true
    },
    meta: {
      ...safeObj(src.meta),
      version: VERSION,
      endpoint: safeStr(src.endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT,
      turnId: safeStr(normalized.turnId || src.turnId || safeObj(src.meta).turnId || ""),
      final: true,
      marionFinal: true,
      handled: true,
      finalizedBy: "marionBridge",
      bridgeReduced: true,
      noFallbackPersonality: true,
      noRewrap: true,
      singleSourceOfTruth: true,
      replySignature
    }
  };

  if (!isObj(out.packet) || !Object.keys(out.packet).length) {
    out.packet = {
      routing: { domain: out.domain, intent: out.intent, endpoint: out.endpoint },
      synthesis: { reply, text: reply, answer: reply, output: reply, spokenText },
      memoryPatch: safeObj(out.memoryPatch),
      meta: out.meta
    };
  } else {
    out.packet = {
      ...out.packet,
      final: true,
      marionFinal: true,
      handled: true,
      routing: {
        ...safeObj(out.packet.routing),
        domain: safeStr(safeObj(out.packet.routing).domain || out.domain),
        intent: safeStr(safeObj(out.packet.routing).intent || out.intent),
        endpoint: safeStr(safeObj(out.packet.routing).endpoint || out.endpoint)
      },
      synthesis: {
        ...safeObj(out.packet.synthesis),
        reply,
        text: reply,
        answer: reply,
        output: reply,
        spokenText
      },
      meta: {
        ...safeObj(out.packet.meta),
        ...out.meta,
        final: true,
        marionFinal: true,
        handled: true,
        finalizedBy: "marionBridge"
      }
    };
  }

  return out;
}

function normalizeComposeInput(normalized, routed) {
  const routing = safeObj(routed.routing);
  const marionIntent = safeObj(routed.marionIntent);

  return {
    userQuery: normalized.userQuery,
    text: normalized.userQuery,
    query: normalized.userQuery,
    domain: safeStr(routing.domain || normalized.domain || "general") || "general",
    requestedDomain: safeStr(routing.domain || normalized.requestedDomain || "general") || "general",
    intent: safeStr(routing.intent || marionIntent.intent || "simple_chat") || "simple_chat",
    marionIntent,
    routing,
    previousMemory: normalized.previousMemory,
    lane: normalized.lane,
    sessionId: normalized.sessionId,
    turnId: normalized.turnId,
    sourceTurnId: normalized.turnId
  };
}

async function processWithMarion(input = {}) {
  if (isAlreadyFinal(input)) return markFinal(input, input);

  const normalized = normalizeInbound(input);
  if (!normalized.ok) {
    return buildErrorResult("input_invalid", { issues: normalized.issues }, normalized);
  }

  if (typeof routeMarionIntent !== "function") {
    return buildErrorResult("intent_router_unavailable", { dependency: "marionIntentRouter.routeMarionIntent" }, normalized);
  }

  if (typeof composeMarionResponse !== "function") {
    return buildErrorResult("composer_unavailable", { dependency: "composeMarionResponse.composeMarionResponse" }, normalized);
  }

  const routed = await Promise.resolve(routeMarionIntent({
    text: normalized.userQuery,
    query: normalized.userQuery,
    userQuery: normalized.userQuery,
    lane: normalized.lane,
    requestedDomain: normalized.requestedDomain,
    domain: normalized.domain,
    marionIntent: normalized.marionIntent,
    previousMemory: normalized.previousMemory,
    session: {
      lane: normalized.lane,
      previousMemory: normalized.previousMemory,
      marionIntent: normalized.marionIntent
    },
    turnId: normalized.turnId
  }));

  const routerValidation = validateRouterResult(routed);
  if (!routerValidation.ok) {
    return buildErrorResult("intent_router_invalid", { issues: routerValidation.issues, routed }, normalized);
  }

  const composeInput = normalizeComposeInput(normalized, routed);
  const contract = await Promise.resolve(composeMarionResponse({
    ...safeObj(routed),
    primaryDomain: safeStr(safeObj(routed.routing).domain || composeInput.domain),
    domain: safeStr(safeObj(routed.routing).domain || composeInput.domain),
    intent: safeStr(safeObj(routed.routing).intent || composeInput.intent),
    routing: safeObj(routed.routing),
    marionIntent: safeObj(routed.marionIntent)
  }, composeInput));

  const composeValidation = validateComposeResult(contract);
  if (!composeValidation.ok) {
    return buildErrorResult("composer_invalid", { issues: composeValidation.issues }, {
      ...normalized,
      intent: composeInput.intent,
      domain: composeInput.domain
    });
  }

  const reply = extractReply(contract);
  const replySignature = hashText(reply);
  const packet = buildPacket({ normalized: composeInput, routed, contract, reply, replySignature });

  return markFinal({
    ...safeObj(contract),
    ok: true,
    status: "ok",
    endpoint: safeStr(safeObj(routed.routing).endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT,
    userQuery: normalized.userQuery,
    domain: composeInput.domain,
    intent: composeInput.intent,
    reply,
    text: reply,
    answer: reply,
    output: reply,
    response: reply,
    message: reply,
    spokenText: safeStr(contract.spokenText || reply.replace(/\n+/g, " ")) || reply,
    replySignature,
    packet,
    payload: {
      ...safeObj(contract.payload),
      reply,
      text: reply,
      answer: reply,
      output: reply,
      response: reply,
      message: reply,
      spokenText: safeStr(contract.spokenText || reply.replace(/\n+/g, " ")) || reply
    },
    diagnostics: {
      ...safeObj(contract.diagnostics),
      bridgeVersion: VERSION,
      bridgeReduced: true,
      validatedPacket: true,
      routerCalled: true,
      composerCalled: true,
      finalMarked: true,
      noFallbackPersonality: true,
      noEmotionalInterpretation: true,
      noRewrap: true,
      routerVersion: safeStr(routed.routerVersion || routed.VERSION || ""),
      composerVersion: safeStr(contract.version || "")
    },
    meta: {
      ...safeObj(contract.meta),
      version: VERSION,
      endpoint: CANONICAL_ENDPOINT,
      turnId: normalized.turnId,
      routedIntent: composeInput.intent,
      routedDomain: composeInput.domain,
      final: true,
      marionFinal: true,
      handled: true,
      finalizedBy: "marionBridge",
      bridgeReduced: true,
      replySignature
    },
    routed
  }, composeInput);
}

async function retrieveLayer2Signals(input = {}) {
  const normalized = normalizeInbound(input);
  if (!normalized.ok) {
    return {
      ok: false,
      issues: normalized.issues,
      userQuery: normalized.userQuery,
      domain: normalized.domain,
      intent: "input_invalid",
      diagnostics: { bridgeReduced: true, noLegacyRetrievers: true }
    };
  }

  if (typeof routeMarionIntent !== "function") {
    return {
      ok: false,
      issues: ["intent_router_unavailable"],
      userQuery: normalized.userQuery,
      domain: normalized.domain,
      intent: "router_unavailable",
      diagnostics: { bridgeReduced: true, noLegacyRetrievers: true }
    };
  }

  const routed = await Promise.resolve(routeMarionIntent({
    text: normalized.userQuery,
    query: normalized.userQuery,
    userQuery: normalized.userQuery,
    lane: normalized.lane,
    requestedDomain: normalized.requestedDomain,
    domain: normalized.domain,
    marionIntent: normalized.marionIntent,
    previousMemory: normalized.previousMemory,
    turnId: normalized.turnId
  }));

  const routing = safeObj(routed.routing);
  return {
    ok: true,
    endpoint: safeStr(routing.endpoint || CANONICAL_ENDPOINT) || CANONICAL_ENDPOINT,
    userQuery: normalized.userQuery,
    domain: safeStr(routing.domain || normalized.domain || "general") || "general",
    intent: safeStr(routing.intent || safeObj(routed.marionIntent).intent || "simple_chat") || "simple_chat",
    routing,
    marionIntent: safeObj(routed.marionIntent),
    diagnostics: {
      bridgeReduced: true,
      noLegacyRetrievers: true,
      routerCalled: true,
      routerVersion: safeStr(routed.routerVersion || "")
    }
  };
}

function createMarionBridge(options = {}) {
  const memoryProvider = safeObj(options.memoryProvider);

  return {
    version: VERSION,
    canonicalEndpoint: CANONICAL_ENDPOINT,
    async maybeResolve(req = {}) {
      const meta = safeObj(req.meta);
      const previousMemory = typeof memoryProvider.getContext === "function"
        ? safeObj(await Promise.resolve(memoryProvider.getContext(req)))
        : safeObj(req.previousMemory || meta.previousMemory || req.session && req.session.previousMemory || {});

      const result = await processWithMarion({
        ...safeObj(req),
        userQuery: firstText(req.userQuery, req.text, req.query, safeObj(req.body).text, safeObj(req.body).query),
        requestedDomain: firstText(meta.preferredDomain, meta.domain, req.domain, req.requestedDomain, "general"),
        previousMemory,
        marionIntent: safeObj(req.marionIntent || meta.marionIntent || safeObj(req.session).marionIntent),
        turnId: firstText(meta.turnId, req.turnId, req.id, meta.requestId, req.requestId),
        sessionId: firstText(req.sessionId, meta.sessionId, "public"),
        lane: firstText(req.lane, meta.lane, safeObj(req.session).lane, "general")
      });

      return {
        usedBridge: result.ok !== false && !!safeStr(result.reply),
        packet: result.packet,
        response: result.reply,
        fallbackResponse: result.reply,
        replySeed: result.reply,
        message: result.reply,
        reply: result.reply,
        text: result.reply,
        answer: result.reply,
        output: result.reply,
        spokenText: result.spokenText,
        domain: result.domain,
        intent: result.intent,
        endpoint: result.endpoint,
        meta: result.meta,
        diagnostics: result.diagnostics,
        followUps: result.followUps,
        followUpsStrings: result.followUpsStrings,
        payload: result.payload,
        result
      };
    }
  };
}

async function route(input = {}) {
  return processWithMarion(input);
}

async function maybeResolve(input = {}) {
  const bridge = createMarionBridge();
  return bridge.maybeResolve(input);
}

const ask = route;
const handle = route;

module.exports = {
  VERSION,
  CANONICAL_ENDPOINT,
  retrieveLayer2Signals,
  processWithMarion,
  createMarionBridge,
  route,
  maybeResolve,
  ask,
  handle,
  default: route
};
