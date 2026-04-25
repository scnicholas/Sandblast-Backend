"use strict";

/**
 * chatEngine.js
 *
 * Chat Engine v3.0.0 COORDINATOR-ONLY-MARION-FINAL
 * ------------------------------------------------------------
 * PURPOSE
 * - Act as a transport/coordinator only.
 * - Accept only Marion final replies.
 * - Never invent, recover, emotionally rewrite, or fallback-personality a reply.
 * - Return a blank error contract when Marion final reply is missing.
 *
 * HARD RULES
 * - No buildLoopRecoveryReply.
 * - No emotional fallback.
 * - No reply invention.
 * - No synthetic "I'm here..." recovery.
 * - No fallbackResponse/replySeed promotion unless it is part of a final Marion envelope.
 */

const VERSION = "ChatEngine v3.0.1 COORDINATOR-ONLY-MARION-FINAL + ACTIVE-SIGNATURE";
const CHAT_ENGINE_SIGNATURE = "CHATENGINE_COORDINATOR_ONLY_ACTIVE_2026_04_24";

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function safeObj(value) {
  return isPlainObject(value) ? value : {};
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstText() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = cleanText(arguments[i]);
    if (value) return value;
  }
  return "";
}

function clipText(value, max = 220) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function hashText(value) {
  const source = cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = ((hash << 5) - hash) + source.charCodeAt(i);
    hash |= 0;
  }
  return String(hash >>> 0);
}

const INTERNAL_BLOCKER_PATTERNS = [
  /marion input required before reply emission/i,
  /reply emission/i,
  /bridge rejected malformed marion output before nyx handoff/i,
  /bridge rejected/i,
  /authoritative_reply_missing/i,
  /packet_synthesis_reply_missing/i,
  /contract_missing/i,
  /packet_missing/i,
  /bridge_rejected/i,
  /marion_contract_invalid/i,
  /compose_marion_response_unavailable/i,
  /packet_invalid/i,
  /^done\.?$/i,
  /^ready\.?$/i,
  /^working\.?$/i
];

function isInternalBlockerText(value) {
  const text = cleanText(value);
  if (!text) return false;
  return INTERNAL_BLOCKER_PATTERNS.some((rx) => rx.test(text));
}

function isFinalEnvelope(source = {}) {
  const src = safeObj(source);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const marion = safeObj(src.marion);
  const contract = safeObj(src.marionContract);
  const packet = safeObj(src.packet || marion.packet);
  const packetMeta = safeObj(packet.meta);
  const synthesis = safeObj(packet.synthesis);

  return !!(
    src.final === true ||
    src.marionFinal === true ||
    src.handled === true ||
    src.marionHandled === true ||
    payload.final === true ||
    payload.marionFinal === true ||
    meta.final === true ||
    meta.marionFinal === true ||
    marion.final === true ||
    marion.marionFinal === true ||
    contract.final === true ||
    contract.marionFinal === true ||
    packet.final === true ||
    packet.marionFinal === true ||
    packetMeta.final === true ||
    packetMeta.marionFinal === true ||
    synthesis.final === true ||
    synthesis.marionFinal === true
  );
}

function extractMarionContract(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const marion = safeObj(src.marion || payload.marion || meta.marion);
  const contract = safeObj(
    src.marionContract ||
    payload.marionContract ||
    meta.marionContract ||
    marion.contract ||
    marion.marionContract ||
    {}
  );
  return contract;
}

function extractPacket(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const marion = safeObj(src.marion || payload.marion || meta.marion);
  return safeObj(src.packet || payload.packet || meta.packet || marion.packet || {});
}

function extractFinalReply(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const marion = safeObj(src.marion || payload.marion || meta.marion);
  const contract = extractMarionContract(src);
  const contractPayload = safeObj(contract.payload);
  const packet = extractPacket(src);
  const synthesis = safeObj(packet.synthesis);

  const reply = firstText(
    contract.reply,
    contract.text,
    contract.answer,
    contract.output,
    contract.response,
    contract.spokenText,
    contractPayload.reply,
    contractPayload.text,
    contractPayload.answer,
    contractPayload.output,
    marion.reply,
    marion.text,
    marion.answer,
    marion.output,
    marion.response,
    marion.spokenText,
    payload.reply,
    payload.text,
    payload.answer,
    payload.output,
    packet.reply,
    packet.text,
    packet.answer,
    packet.output,
    synthesis.reply,
    synthesis.text,
    synthesis.answer,
    synthesis.output,
    synthesis.spokenText
  );

  if (!reply || isInternalBlockerText(reply)) return "";
  return reply;
}

function extractIntent(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const contract = extractMarionContract(src);
  const packet = extractPacket(src);
  const routing = safeObj(packet.routing);
  const synthesis = safeObj(packet.synthesis);

  return firstText(
    src.intent,
    payload.intent,
    meta.intent,
    contract.intent,
    routing.intent,
    synthesis.intent,
    "general"
  ) || "general";
}

function extractDomain(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const contract = extractMarionContract(src);
  const packet = extractPacket(src);
  const routing = safeObj(packet.routing);
  const synthesis = safeObj(packet.synthesis);

  return firstText(
    src.domain,
    src.requestedDomain,
    payload.domain,
    meta.domain,
    meta.requestedDomain,
    contract.domain,
    routing.domain,
    synthesis.domain,
    "general"
  ) || "general";
}

function extractLane(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);

  return firstText(
    src.lane,
    src.laneId,
    src.sessionLane,
    payload.lane,
    payload.laneId,
    payload.sessionLane,
    meta.lane,
    meta.laneId,
    "general"
  ) || "general";
}

function extractTurnId(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);
  const packet = extractPacket(src);
  const packetMeta = safeObj(packet.meta);

  return firstText(
    src.turnId,
    src.requestId,
    src.traceId,
    src.id,
    payload.turnId,
    payload.requestId,
    payload.traceId,
    meta.turnId,
    meta.requestId,
    meta.traceId,
    packetMeta.turnId,
    packetMeta.requestId,
    packetMeta.traceId
  );
}

function extractUserText(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const meta = safeObj(src.meta);

  return firstText(
    src.userQuery,
    src.text,
    src.query,
    src.message,
    payload.userQuery,
    payload.text,
    payload.query,
    payload.message,
    meta.userQuery,
    meta.text,
    meta.query
  );
}

function extractFollowUps(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const contract = extractMarionContract(src);
  const packet = extractPacket(src);
  const synthesis = safeObj(packet.synthesis);

  return safeArray(
    src.followUpsStrings ||
    src.followUps ||
    payload.followUpsStrings ||
    payload.followUps ||
    contract.followUpsStrings ||
    contract.followUps ||
    synthesis.followUpsStrings ||
    synthesis.followUps ||
    []
  ).map(cleanText).filter(Boolean).slice(0, 4);
}

function extractSessionPatch(input = {}) {
  const src = safeObj(input);
  const payload = safeObj(src.payload);
  const contract = extractMarionContract(src);
  const packet = extractPacket(src);
  const synthesis = safeObj(packet.synthesis);

  return safeObj(
    src.sessionPatch ||
    src.memoryPatch ||
    payload.sessionPatch ||
    payload.memoryPatch ||
    contract.sessionPatch ||
    contract.memoryPatch ||
    packet.memoryPatch ||
    synthesis.memoryPatch ||
    {}
  );
}

function buildBlankErrorContract(reason, detail = {}, input = {}) {
  const lane = extractLane(input);
  const intent = extractIntent(input);
  const domain = extractDomain(input);
  const turnId = extractTurnId(input);
  const userQuery = extractUserText(input);

  return {
    ok: false,
    error: true,
    final: true,
    marionFinal: false,
    handled: true,
    status: "error",
    reason: cleanText(reason || "marion_final_reply_missing") || "marion_final_reply_missing",
    detail: safeObj(detail),

    reply: "",
    text: "",
    answer: "",
    output: "",
    spokenText: "",

    lane,
    laneId: lane,
    sessionLane: lane,
    domain,
    intent,
    userQuery,

    payload: {
      reply: "",
      text: "",
      answer: "",
      output: "",
      spokenText: "",
      final: true,
      error: true
    },

    followUps: [],
    followUpsStrings: [],
    sessionPatch: {},

    cog: {
      intent,
      mode: "coordinator_only_error",
      publicMode: true,
      decisionAuthority: "marion_required"
    },

    meta: {
      engineVersion: VERSION,
      chatEngineSignature: CHAT_ENGINE_SIGNATURE,
      coordinatorOnly: true,
      finalReplyAuthority: "marion",
      replyAuthority: "none",
      awaitingMarion: true,
      turnId,
      reason: cleanText(reason || "marion_final_reply_missing") || "marion_final_reply_missing",
      detail: safeObj(detail)
    },

    diagnostics: {
      engineVersion: VERSION,
      chatEngineSignature: CHAT_ENGINE_SIGNATURE,
      coordinatorOnly: true,
      error: true,
      reason: cleanText(reason || "marion_final_reply_missing") || "marion_final_reply_missing",
      detail: safeObj(detail)
    },

    speech: null
  };
}

function buildStructuredFinalReply(input = {}) {
  const reply = extractFinalReply(input);
  const lane = extractLane(input);
  const intent = extractIntent(input);
  const domain = extractDomain(input);
  const turnId = extractTurnId(input);
  const userQuery = extractUserText(input);
  const followUpsStrings = extractFollowUps(input);
  const sessionPatch = extractSessionPatch(input);
  const contract = extractMarionContract(input);
  const packet = extractPacket(input);
  const replySignature = firstText(
    input.replySignature,
    safeObj(input.meta).replySignature,
    safeObj(packet.meta).replySignature,
    hashText(reply)
  );

  return {
    ok: true,
    final: true,
    marionFinal: true,
    handled: true,
    status: "ok",

    reply,
    text: reply,
    answer: reply,
    output: reply,
    spokenText: firstText(input.spokenText, contract.spokenText, safeObj(packet.synthesis).spokenText, reply.replace(/\n+/g, " ")),

    lane,
    laneId: lane,
    sessionLane: lane,
    domain,
    intent,
    userQuery,

    payload: {
      reply,
      text: reply,
      message: reply,
      answer: reply,
      output: reply,
      response: reply,
      authoritativeReply: reply,
      spokenText: firstText(input.spokenText, contract.spokenText, safeObj(packet.synthesis).spokenText, reply.replace(/\n+/g, " ")),
      final: true,
      marionFinal: true
    },

    bridge: safeObj(input.marion) || null,
    packet: Object.keys(packet).length ? packet : undefined,
    contract: Object.keys(contract).length ? contract : undefined,

    ctx: {},
    ui: safeObj(input.ui),
    emotionalTurn: null,
    directives: [],
    followUps: followUpsStrings.map((text) => ({ label: text, text })),
    followUpsStrings,
    sessionPatch,

    cog: {
      intent,
      mode: "coordinator_only",
      publicMode: true,
      decisionAuthority: "marion"
    },

    meta: {
      ...safeObj(input.meta),
      engineVersion: VERSION,
      chatEngineSignature: CHAT_ENGINE_SIGNATURE,
      coordinatorOnly: true,
      finalReplyAuthority: "marion",
      replyAuthority: "marion_final",
      marionAuthorityLock: true,
      awaitingMarion: false,
      turnId,
      replySignature,
      source: "chatEngine_passthrough"
    },

    diagnostics: {
      ...safeObj(input.diagnostics),
      engineVersion: VERSION,
      chatEngineSignature: CHAT_ENGINE_SIGNATURE,
      coordinatorOnly: true,
      acceptedFinalEnvelope: true,
      replyPreview: clipText(reply, 160)
    },

    speech: input.speech || null
  };
}

class ChatEngine {
  constructor(options = {}) {
    this.state = {
      lastUserInput: "",
      memory: [],
      rejectionLog: [],
      pipelineTrace: []
    };

    this.config = {
      maxMemory: Number.isInteger(options.maxMemory) ? options.maxMemory : 12,
      maxRejectionLog: Number.isInteger(options.maxRejectionLog) ? options.maxRejectionLog : 200,
      maxPipelineTrace: Number.isInteger(options.maxPipelineTrace) ? options.maxPipelineTrace : 100
    };
  }

  processInput(input = {}) {
    const trace = {
      at: Date.now(),
      rawInputType: typeof input,
      rawInputPreview: typeof input === "string" ? input.slice(0, 120) : clipText(JSON.stringify(input || {}), 180),
      stages: [],
      accepted: false,
      responsePreview: "",
      errors: []
    };

    try {
      const src = typeof input === "string" ? { text: input } : safeObj(input);
      const finalEnvelope = isFinalEnvelope(src);
      const reply = extractFinalReply(src);

      trace.stages.push({ stage: "detectFinalEnvelope", ok: finalEnvelope });
      trace.stages.push({ stage: "extractFinalReply", ok: !!reply, replyPreview: clipText(reply, 120) });

      if (!finalEnvelope || !reply) {
        const errorContract = buildBlankErrorContract("marion_final_reply_missing", {
          finalEnvelope,
          replyPresent: !!reply
        }, src);

        this.pushRejectionLog({
          at: Date.now(),
          code: "marion_final_reply_missing",
          finalEnvelope,
          replyPresent: !!reply,
          turnId: extractTurnId(src)
        });

        trace.accepted = false;
        trace.responsePreview = "";
        this.pushPipelineTrace(trace);
        return errorContract;
      }

      const result = buildStructuredFinalReply(src);
      this.updateState(src, result);

      trace.accepted = true;
      trace.responsePreview = clipText(result.reply, 160);
      this.pushPipelineTrace(trace);

      return result;
    } catch (err) {
      const errorContract = buildBlankErrorContract("chat_engine_coordinator_fault", {
        message: this.safeError(err)
      }, isPlainObject(input) ? input : { text: input });

      trace.errors.push(this.safeError(err));
      trace.accepted = false;
      trace.responsePreview = "";
      this.pushPipelineTrace(trace);

      return errorContract;
    }
  }

  updateState(input = {}, result = {}) {
    const entry = {
      input: extractUserText(input),
      intent: extractIntent(result),
      domain: extractDomain(result),
      replyAuthority: "marion_final",
      reply: cleanText(result.reply || ""),
      replySignature: cleanText(result.meta && result.meta.replySignature || hashText(result.reply || "")),
      timestamp: Date.now()
    };

    this.state.lastUserInput = entry.input;
    this.state.memory.push(entry);

    if (this.state.memory.length > this.config.maxMemory) {
      this.state.memory.shift();
    }
  }

  pushPipelineTrace(trace) {
    this.state.pipelineTrace.push(trace);
    if (this.state.pipelineTrace.length > this.config.maxPipelineTrace) {
      this.state.pipelineTrace.shift();
    }
  }

  pushRejectionLog(entry) {
    this.state.rejectionLog.push(entry);
    if (this.state.rejectionLog.length > this.config.maxRejectionLog) {
      this.state.rejectionLog.shift();
    }
  }

  getRejectionLog() {
    return [...this.state.rejectionLog];
  }

  getPipelineTrace() {
    return [...this.state.pipelineTrace];
  }

  getMemorySnapshot() {
    return [...this.state.memory];
  }

  reset() {
    this.state.lastUserInput = "";
    this.state.memory = [];
    this.state.rejectionLog = [];
    this.state.pipelineTrace = [];
  }

  safeError(err) {
    if (!err) return "unknown_error";
    if (typeof err === "string") return err;
    if (err && typeof err.message === "string") return err.message;
    try {
      return JSON.stringify(err);
    } catch (_jsonErr) {
      return String(err);
    }
  }
}

let runtime = null;

function getRuntime() {
  if (!runtime) runtime = new ChatEngine();
  return runtime;
}

async function handleChat(input = {}) {
  const runtimeInstance = getRuntime();
  return runtimeInstance.processInput(input);
}

async function run(input = {}) {
  return handleChat(input);
}

async function chat(input = {}) {
  return handleChat(input);
}

async function handle(input = {}) {
  return handleChat(input);
}

async function reply(input = {}) {
  return handleChat(input);
}

function extractMarionFields(src = {}) {
  return {
    marionContract: extractMarionContract(src),
    marion: safeObj(src.marion),
    reply: extractFinalReply(src),
    intent: extractIntent(src),
    emotionalState: ""
  };
}

function shouldLockMarionAuthority(source = {}) {
  return isFinalEnvelope(source) && !!extractFinalReply(source);
}

if (typeof module !== "undefined") {
  module.exports = {
    VERSION,
    CHAT_ENGINE_SIGNATURE,
    ChatEngine,
    handleChat,
    run,
    chat,
    handle,
    reply,
    extractMarionFields,
    shouldLockMarionAuthority,
    _internal: {
      isFinalEnvelope,
      extractFinalReply,
      buildBlankErrorContract,
      buildStructuredFinalReply
    }
  };
}
