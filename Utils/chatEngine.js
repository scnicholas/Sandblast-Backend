"use strict";

/**
 * chatEngine.js
 *
 * Chat Engine vMarion-Coordinator LOOP-GUARD-HARDENED + AUTHORITY-CHAIN-RECOVERY
 * ------------------------------------------------------------
 * PURPOSE
 * - Act as a traffic coordinator only
 * - Preserve Marion as the sole cognitive authority
 * - Normalize inbound payloads, continuity, and diagnostics
 * - Never invent, elaborate, or emotionally rewrite replies
 */

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function cleanText(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function clipText(value, max = 220) {
  const text = cleanText(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function uniqueStrings(items) {
  return Array.from(
    new Set((Array.isArray(items) ? items : []).map((item) => cleanText(item)).filter(Boolean))
  );
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
  /packet_invalid/i
];
const LOOPING_FALLBACK_REPLY = "I am here with you, and I can stay with this clearly.";
const AWAITING_REPLY = "Marion input required before reply emission.";

function isInternalBlockerText(value) {
  const text = cleanText(value);
  if (!text) return false;
  return INTERNAL_BLOCKER_PATTERNS.some((rx) => rx.test(text));
}

function firstUsableReply() {
  for (const value of arguments) {
    const text = cleanText(value);
    if (!text) continue;
    if (isInternalBlockerText(text)) continue;
    if (/^done\.?$/i.test(text)) continue;
    return text;
  }
  return "";
}

function getMetaReply(meta = {}) {
  const marion = isPlainObject(meta.marion) ? meta.marion : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  const contract = isPlainObject(meta.marionContract) ? meta.marionContract : {};
  const contractPayload = isPlainObject(contract.payload) ? contract.payload : {};
  return firstUsableReply(
    meta.overrideReply,
    meta.replySeed,
    meta.fallbackResponse,
    meta.fallbackReply,
    contract.response,
    contract.reply,
    contract.output,
    contract.answer,
    contract.text,
    contract.spokenText,
    contractPayload.reply,
    contractPayload.text,
    contractPayload.message,
    marion.response,
    marion.reply,
    marion.text,
    marion.output,
    marion.answer,
    marion.spokenText,
    marion.message,
    marion.fallbackResponse,
    marion.replySeed,
    payload.reply,
    payload.text,
    payload.message,
    payload.spokenText,
    payload.response,
    payload.fallbackResponse,
    payload.replySeed,
    packet.reply,
    packet.answer,
    packet.output,
    packet.text,
    packet.response,
    packet.message,
    packet.fallbackResponse,
    packet.replySeed,
    synthesis.reply,
    synthesis.answer,
    synthesis.text,
    synthesis.output,
    synthesis.spokenText,
    synthesis.response,
    synthesis.message,
    synthesis.fallbackResponse,
    synthesis.replySeed
  );
}

function countRecentReplyRepeats(memory, reply, windowSize = 3) {
  const target = cleanText(reply).toLowerCase();
  if (!target) return 0;
  const recent = (Array.isArray(memory) ? memory : []).slice(-windowSize);
  let hits = 0;
  for (const entry of recent) {
    const candidate = cleanText(entry && entry.reply || "").toLowerCase();
    if (candidate && candidate === target) hits += 1;
  }
  return hits;
}

function isGreetingLike(text) {
  return /^(?:hi|hello|hey|yo|sup|howdy|hiya|good\s+(?:morning|afternoon|evening))(?:[\s,!?.]|$)+/i.test(cleanText(text));
}

function buildLoopRecoveryReply(input, continuity = {}, meta = {}) {
  const normalized = cleanText(input);
  const forcedEmotion = cleanText(meta.forcedEmotion || meta.marionEmotionalState || "neutral") || "neutral";
  const topicEcho = Array.isArray(continuity.topicEchoes) && continuity.topicEchoes.length
    ? continuity.topicEchoes.slice(0, 3).join(", ")
    : "";
  if (isGreetingLike(normalized)) {
    return "Hey. I’m here. What do you want to do?";
  }
  if (/\?$/.test(normalized) || /(how|what|why|when|where|who|can|could|would|should|do|does|did|is|are)/i.test(normalized)) {
    return "I’m here. Ask me the direct question again and I’ll answer it cleanly without looping.";
  }
  if (/sad|grief|hurt|overwhelm|anx|panic|fear|depress/i.test(forcedEmotion)) {
    return "I’m with you. Tell me the single part you want me to respond to first, and I’ll stay on that exact point.";
  }
  if (topicEcho) {
    return `I’m here. Stay with ${topicEcho}, and tell me the exact move you want next.`;
  }
  return "I’m here. Give me the exact point you want handled, and I’ll answer that directly.";
}

function extractMarionFields(src) {
  const source = isPlainObject(src) ? src : {};
  const marionContract = isPlainObject(source.marionContract) ? source.marionContract : {};
  const marion = isPlainObject(source.marion) ? source.marion : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  const contractPayload = isPlainObject(marionContract.payload) ? marionContract.payload : {};

  const reply = firstUsableReply(
    source.overrideReply,
    marionContract.response,
    marionContract.reply,
    marionContract.output,
    marionContract.answer,
    marionContract.text,
    marionContract.spokenText,
    contractPayload.reply,
    contractPayload.text,
    contractPayload.message,
    marion.response,
    marion.reply,
    marion.text,
    marion.output,
    marion.answer,
    marion.spokenText,
    marion.message,
    marion.fallbackResponse,
    marion.replySeed,
    payload.reply,
    payload.text,
    payload.message,
    payload.spokenText,
    payload.response,
    payload.fallbackResponse,
    packet.reply,
    packet.answer,
    packet.output,
    packet.text,
    packet.response,
    synthesis.reply,
    synthesis.answer,
    synthesis.text,
    synthesis.output,
    synthesis.spokenText,
    synthesis.response,
    synthesis.message
  );

  const intent = cleanText(
    source.forcedIntent ||
    marionContract.intent ||
    marion.intent ||
    payload.intent ||
    source.intentHint ||
    packet.intent ||
    synthesis.intent ||
    ""
  );

  const emotionalState = cleanText(
    source.forcedEmotion ||
    marionContract.emotional_state ||
    marion.emotional_state ||
    payload.emotional_state ||
    source.emotionalHint ||
    synthesis.emotional_state ||
    ""
  );

  return {
    marionContract,
    marion,
    reply,
    intent,
    emotionalState
  };
}

function shouldLockMarionAuthority(source) {
  const src = isPlainObject(source) ? source : {};
  const fields = extractMarionFields(src);
  if (src.forceDirect === true && fields.reply) return true;
  if (fields.marionContract && cleanText(fields.marionContract.status || "success") === "success" && fields.reply) {
    return true;
  }
  return !!fields.reply;
}

class ChatEngine {
  constructor(options = {}) {
    this.state = {
      lastUserInput: "",
      lastIntent: null,
      emotionalState: "neutral",
      memory: [],
      rejectionLog: [],
      pipelineTrace: []
    };

    this.config = {
      maxMemory: Number.isInteger(options.maxMemory) ? options.maxMemory : 12,
      continuityWindow: Number.isInteger(options.continuityWindow) ? options.continuityWindow : 3,
      maxRejectionLog: Number.isInteger(options.maxRejectionLog) ? options.maxRejectionLog : 200,
      maxPipelineTrace: Number.isInteger(options.maxPipelineTrace) ? options.maxPipelineTrace : 100
    };
  }

  processInput(input, meta = {}) {
    const trace = {
      at: Date.now(),
      rawInputType: typeof input,
      rawInputPreview: typeof input === "string" ? input.slice(0, 120) : String(input),
      stages: [],
      accepted: false,
      responsePreview: "",
      marionAuthorityLock: !!meta.marionAuthorityLock,
      marionPresent: !!cleanText(meta.overrideReply || ""),
      errors: []
    };

    try {
      const validation = this.validatePayload({ input, meta });
      trace.stages.push({ stage: "validatePayload", ok: validation.ok });

      if (!validation.ok) {
        const rejected = this.buildRejectedResponse(validation);
        trace.accepted = false;
        trace.responsePreview = rejected.slice(0, 160);
        this.pushPipelineTrace(trace);
        return rejected;
      }

      const normalizedInput = this.normalize(input);
      trace.stages.push({ stage: "normalize", value: clipText(normalizedInput, 160) });

      const continuity = this.buildContinuityContext(normalizedInput, meta);
      trace.stages.push({
        stage: "buildContinuityContext",
        value: {
          previousTurns: continuity.previousTurns.length,
          carryIntent: continuity.carryIntent,
          carryEmotion: continuity.carryEmotion,
          topicEchoes: continuity.topicEchoes
        }
      });

      const resolution = this.resolveResponse(normalizedInput, continuity, meta);
      trace.stages.push({
        stage: "resolveResponse",
        value: {
          authority: resolution.replyAuthority,
          awaitingMarion: resolution.awaitingMarion,
          replyPreview: clipText(resolution.reply, 160)
        }
      });

      this.updateState(normalizedInput, meta, continuity, resolution);

      trace.accepted = true;
      trace.responsePreview = resolution.reply.slice(0, 160);

      this.logPipeline({
        input: normalizedInput,
        continuity,
        resolution
      });

      this.pushPipelineTrace(trace);
      return resolution.reply;
    } catch (err) {
      trace.errors.push(this.safeError(err));
      this.pushPipelineTrace(trace);
      console.error("ChatEngine Error:", err);
      return "I hit a routing fault before Marion could complete the turn.";
    }
  }

  validatePayload(payload) {
    const matrix = [
      {
        field: "input",
        check: (value) => typeof value === "string",
        code: "input_type_invalid",
        message: "Input must be a string."
      },
      {
        field: "input",
        check: (value) => typeof value === "string" && value.trim().length > 0,
        code: "input_empty",
        message: "Input cannot be empty."
      },
      {
        field: "input",
        check: (value) => typeof value === "string" && value.trim().length <= 3000,
        code: "input_too_long",
        message: "Input exceeds maximum length."
      },
      {
        field: "meta",
        check: (value) => value === undefined || value === null || isPlainObject(value),
        code: "meta_invalid",
        message: "Meta must be an object when provided."
      }
    ];

    const failures = [];
    for (const rule of matrix) {
      const fieldValue = this.getFieldValue(payload, rule.field);
      const pass = rule.check(fieldValue, payload);
      if (!pass) {
        const rejection = {
          at: Date.now(),
          field: rule.field,
          code: rule.code,
          message: rule.message,
          valuePreview: this.previewValue(fieldValue)
        };
        failures.push(rejection);
        this.pushRejectionLog(rejection);
      }
    }

    return {
      ok: failures.length === 0,
      failures
    };
  }

  buildRejectedResponse(validation) {
    if (!validation || !Array.isArray(validation.failures) || validation.failures.length === 0) {
      return "The request did not pass validation.";
    }
    const primary = validation.failures[0];
    return `I couldn’t route that cleanly because ${primary.message}`;
  }

  normalize(input) {
    if (typeof input !== "string") return "";
    return input
      .replace(/\s+/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();
  }

  buildContinuityContext(input, meta = {}) {
    const previousTurns = this.state.memory.slice(-this.config.continuityWindow);
    const priorIntents = previousTurns.map((entry) => entry.intent).filter(Boolean);
    const priorEmotions = previousTurns.map((entry) => entry.emotion).filter(Boolean);
    const priorInputs = previousTurns.map((entry) => entry.input).filter(Boolean);

    const explicitPrevious = isPlainObject(meta.previousTurn) ? meta.previousTurn : null;
    if (explicitPrevious) {
      previousTurns.push({
        input: cleanText(explicitPrevious.userText || ""),
        intent: cleanText(
          (meta.marionContract && meta.marionContract.intent) ||
          explicitPrevious.replyAuthority ||
          "general"
        ) || "general",
        emotion: cleanText(explicitPrevious.emotionLabel || "neutral") || "neutral"
      });
      priorIntents.push(cleanText(
        (meta.marionContract && meta.marionContract.intent) ||
        explicitPrevious.replyAuthority ||
        ""
      ));
      priorEmotions.push(cleanText(explicitPrevious.emotionLabel || ""));
      priorInputs.push(cleanText(explicitPrevious.userText || explicitPrevious.reply || ""));
    }

    const carryIntent = this.findDominant(priorIntents);
    const carryEmotion = this.findDominant(priorEmotions);

    const currentTokens = this.extractTopicTokens(input);
    const priorTokens = priorInputs.flatMap((entry) => this.extractTopicTokens(entry));
    const contractRefs =
      Array.isArray(meta.continuity && meta.continuity.references)
        ? meta.continuity.references.flatMap((entry) => this.extractTopicTokens(entry))
        : [];

    const topicEchoes = uniqueStrings(
      currentTokens.filter((token) => priorTokens.includes(token)).concat(contractRefs)
    ).slice(0, 6);

    return {
      previousTurns: previousTurns.slice(-this.config.continuityWindow),
      carryIntent: carryIntent || null,
      carryEmotion: carryEmotion || null,
      topicEchoes,
      continuingSameIntent: !!(
        carryIntent &&
        cleanText(meta.forcedIntent || meta.marionIntent || "") &&
        carryIntent === cleanText(meta.forcedIntent || meta.marionIntent || "")
      ),
      memoryThread: cleanText(meta.continuity && meta.continuity.memory_thread || "")
    };
  }

  resolveResponse(input, continuity, meta = {}) {
    const marionReply = getMetaReply(meta);
    const forcedIntent = cleanText(meta.forcedIntent || meta.marionIntent || "");
    const forcedEmotion = cleanText(meta.forcedEmotion || meta.marionEmotionalState || "");

    const repeatedLoop = countRecentReplyRepeats(this.state.memory, LOOPING_FALLBACK_REPLY, 3) >= 1;
    const repeatedMarionReply = marionReply && countRecentReplyRepeats(this.state.memory, marionReply, 2) >= 1;

    if (marionReply && !(repeatedLoop && cleanText(marionReply) === LOOPING_FALLBACK_REPLY)) {
      return {
        reply: repeatedMarionReply && cleanText(marionReply) === LOOPING_FALLBACK_REPLY
          ? buildLoopRecoveryReply(input, continuity, meta)
          : marionReply,
        replyAuthority: meta.marionAuthorityLock ? "marion_locked" : (repeatedMarionReply ? "marion_recovered" : "marion_resolved"),
        awaitingMarion: false,
        intent: forcedIntent || "general",
        emotion: forcedEmotion || "neutral"
      };
    }

    const fallbackReply = firstUsableReply(meta.fallbackReply, meta.replySeed, meta.fallbackResponse);
    const repeatedFallback = fallbackReply && countRecentReplyRepeats(this.state.memory, fallbackReply, 2) >= 1;

    if (fallbackReply && !(repeatedLoop || repeatedFallback)) {
      return {
        reply: fallbackReply,
        replyAuthority: "bridge_fallback",
        awaitingMarion: false,
        intent: forcedIntent || "general",
        emotion: forcedEmotion || "neutral"
      };
    }

    const recoveredReply = buildLoopRecoveryReply(input, continuity, meta);
    return {
      reply: recoveredReply || AWAITING_REPLY,
      replyAuthority: recoveredReply ? "loop_recovery" : "awaiting_marion",
      awaitingMarion: !recoveredReply,
      intent: forcedIntent || "general",
      emotion: forcedEmotion || "neutral"
    };
  }

  updateState(input, meta = {}, continuity = {}, resolution = {}) {
    const intent = cleanText(resolution.intent || meta.forcedIntent || "general") || "general";
    const emotion = cleanText(resolution.emotion || meta.forcedEmotion || "neutral") || "neutral";

    this.state.lastUserInput = input;
    this.state.lastIntent = intent;
    this.state.emotionalState = emotion;

    this.state.memory.push({
      input,
      intent,
      emotion,
      meta: this.sanitizeMeta(meta),
      continuity: {
        topicEchoes: Array.isArray(continuity.topicEchoes) ? continuity.topicEchoes.slice(0, 6) : [],
        carryIntent: continuity.carryIntent || null,
        carryEmotion: continuity.carryEmotion || null
      },
      replyAuthority: resolution.replyAuthority || "unknown",
      reply: cleanText(resolution.reply || ""),
      timestamp: Date.now()
    });

    if (this.state.memory.length > this.config.maxMemory) {
      this.state.memory.shift();
    }
  }

  logPipeline(payload) {
    console.log("PIPELINE TRACE:", {
      input: payload.input,
      continuity: {
        previousTurns: payload.continuity.previousTurns.length,
        carryIntent: payload.continuity.carryIntent,
        carryEmotion: payload.continuity.carryEmotion,
        topicEchoes: payload.continuity.topicEchoes
      },
      resolution: {
        replyAuthority: payload.resolution.replyAuthority,
        awaitingMarion: payload.resolution.awaitingMarion,
        intent: payload.resolution.intent,
        emotion: payload.resolution.emotion,
        reply: payload.resolution.reply
      }
    });
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
    console.warn("REJECTION LOG:", entry);
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
    this.state.lastIntent = null;
    this.state.emotionalState = "neutral";
    this.state.memory = [];
    this.state.rejectionLog = [];
    this.state.pipelineTrace = [];
  }

  extractTopicTokens(input) {
    if (!input || typeof input !== "string") return [];
    const stopwords = new Set([
      "the", "a", "an", "and", "or", "but", "to", "for", "of", "in", "on", "at", "it", "is",
      "are", "was", "were", "be", "been", "being", "i", "you", "we", "they", "he", "she",
      "this", "that", "these", "those", "with", "from", "as", "by", "do", "does", "did",
      "have", "has", "had", "can", "could", "should", "would", "will", "just", "about"
    ]);

    return input
      .split(/[^a-z0-9_]+/i)
      .map((token) => token.trim().toLowerCase())
      .filter((token) => token && token.length > 2 && !stopwords.has(token))
      .slice(0, 20);
  }

  findDominant(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const counts = items.reduce((acc, item) => {
      const key = cleanText(item);
      if (key) acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    let dominant = null;
    let max = -1;
    for (const [key, count] of Object.entries(counts)) {
      if (count > max) {
        dominant = key;
        max = count;
      }
    }
    return dominant;
  }

  getFieldValue(obj, path) {
    if (!path) return undefined;
    const parts = path.split(".");
    let current = obj;
    for (const part of parts) {
      if (current == null || typeof current !== "object" || !(part in current)) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  previewValue(value) {
    if (typeof value === "string") return value.slice(0, 100);
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    try {
      return JSON.stringify(value).slice(0, 100);
    } catch (_err) {
      return String(value).slice(0, 100);
    }
  }

  sanitizeMeta(meta) {
    if (!isPlainObject(meta)) return {};
    const clean = {};
    for (const [key, value] of Object.entries(meta)) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        value === null
      ) {
        clean[key] = value;
      }
    }
    return clean;
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
  if (!runtime) {
    runtime = new ChatEngine();
  }
  return runtime;
}

function buildHandleMeta(input) {
  const src = isPlainObject(input) ? input : {};
  const fields = extractMarionFields(src);
  const authority = shouldLockMarionAuthority(src);

  return {
    channel: "index",
    userId: cleanText(src.sessionId || ""),
    forcedIntent: fields.intent,
    forcedEmotion: fields.emotionalState,
    marionIntent: cleanText(fields.marionContract.intent || fields.intent || ""),
    marionEmotionalState: cleanText(fields.marionContract.emotional_state || fields.emotionalState || ""),
    overrideReply: fields.reply,
    marionAuthorityLock: authority,
    marionContract: fields.marionContract,
    marion: fields.marion,
    continuity: isPlainObject(src.continuity)
      ? src.continuity
      : (isPlainObject(fields.marionContract.continuity) ? fields.marionContract.continuity : {}),
    previousTurn: isPlainObject(src.previousTurn) ? src.previousTurn : null,
    traceId: cleanText(src.traceId || ""),
    fallbackReply: firstUsableReply(src.fallbackReply, src.payload && src.payload.fallbackReply, src.marion && src.marion.fallbackResponse),
    fallbackResponse: firstUsableReply(src.fallbackResponse, src.payload && src.payload.fallbackResponse, src.marion && src.marion.fallbackResponse),
    replySeed: firstUsableReply(src.replySeed, src.payload && src.payload.replySeed, src.marion && src.marion.replySeed)
  };
}

function buildFollowUps(meta) {
  const contract = isPlainObject(meta.marionContract) ? meta.marionContract : {};
  const followUpsStrings = uniqueStrings([
    cleanText(contract.follow_up || "")
  ]).slice(0, 4);

  return {
    followUps: followUpsStrings.map((text) => ({ label: text, text })),
    followUpsStrings
  };
}

function buildStructuredEngineReply(response, input, meta) {
  const src = isPlainObject(input) ? input : {};
  const reply = cleanText(response);
  const lane = cleanText(src.lane || "general") || "general";
  const follow = buildFollowUps(meta);
  const awaitingMarion = reply === AWAITING_REPLY;

  return {
    ok: true,
    reply,
    payload: {
      reply,
      text: reply,
      message: reply,
      answer: reply,
      output: reply,
      response: reply,
      spokenText: reply,
      marionContract: isPlainObject(meta.marionContract) ? meta.marionContract : undefined,
      continuity: isPlainObject(meta.continuity) ? meta.continuity : undefined
    },
    lane,
    laneId: lane,
    sessionLane: lane,
    bridge: isPlainObject(src.marion) ? src.marion : null,
    ctx: {},
    ui: {},
    emotionalTurn: null,
    directives: [],
    followUps: follow.followUps,
    followUpsStrings: follow.followUpsStrings,
    sessionPatch: {},
    cog: {
      intent: cleanText(meta.forcedIntent || "general") || "general",
      mode: meta.marionAuthorityLock ? "authoritative" : "routing_only",
      publicMode: true,
      decisionAuthority: "marion"
    },
    meta: {
      engineVersion: "Chat Engine vMarion-Coordinator LOOP-GUARD-HARDENED + AUTHORITY-CHAIN-RECOVERY",
      replyAuthority: reply === AWAITING_REPLY ? "awaiting_marion" : (meta.marionAuthorityLock ? "marion_locked" : "resolved"),
      marionAuthorityLock: !!meta.marionAuthorityLock,
      marionIntent: cleanText((meta.marionContract && meta.marionContract.intent) || ""),
      marionEmotionalState: cleanText((meta.marionContract && meta.marionContract.emotional_state) || ""),
      traceId: cleanText(meta.traceId || ""),
      awaitingMarion
    },
    speech: null
  };
}

async function handleChat(input = {}) {
  const src = isPlainObject(input) ? input : { text: typeof input === "string" ? input : "" };
  const meta = buildHandleMeta(src);
  const runtimeInstance = getRuntime();
  const normalizedText = cleanText(src.text || (src.payload && src.payload.text) || "");
  const response = runtimeInstance.processInput(normalizedText, meta);
  return buildStructuredEngineReply(response, src, meta);
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

if (typeof module !== "undefined") {
  module.exports = {
    ChatEngine,
    handleChat,
    run,
    chat,
    handle,
    reply,
    extractMarionFields,
    shouldLockMarionAuthority
  };
}
