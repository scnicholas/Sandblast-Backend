"use strict";

// Chat Engine vFinal++
// Marion authority-compatible build
// Added:
// 1) Structured handleChat/run/chat/handle/reply exports for index.js compatibility
// 2) Marion authority lock and direct-answer obedience
// 3) Continuity stitching with previous-turn + contract continuity support
// 4) Safe effect modulation that never rewrites locked Marion replies

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
  return Array.from(new Set((Array.isArray(items) ? items : []).map((item) => cleanText(item)).filter(Boolean)));
}

function marionReplyFromSource(src) {
  const source = isPlainObject(src) ? src : {};
  const contract = isPlainObject(source.marionContract) ? source.marionContract : {};
  const marion = isPlainObject(source.marion) ? source.marion : {};
  const payload = isPlainObject(marion.payload) ? marion.payload : {};
  const packet = isPlainObject(marion.packet) ? marion.packet : {};
  const synthesis = isPlainObject(packet.synthesis) ? packet.synthesis : {};
  return cleanText(
    source.overrideReply ||
    contract.response ||
    marion.reply ||
    marion.text ||
    marion.output ||
    marion.answer ||
    marion.spokenText ||
    payload.reply ||
    payload.text ||
    payload.message ||
    payload.spokenText ||
    synthesis.reply ||
    synthesis.answer ||
    ""
  );
}

function shouldLockMarionAuthority(source) {
  const src = isPlainObject(source) ? source : {};
  if (src.forceDirect === true && marionReplyFromSource(src)) return true;
  const contract = isPlainObject(src.marionContract) ? src.marionContract : null;
  if (contract && cleanText(contract.status || "success") === "success" && cleanText(contract.response || "")) return true;
  return !!marionReplyFromSource(src);
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
      maxRejectionLog: Number.isInteger(options.maxRejectionLog) ? options.maxRejectionLog : 200
    };

    this.effectEngine = options.effectEngine || null;
  }

  setEffectEngine(effectEngine) {
    this.effectEngine = effectEngine || null;
  }

  processInput(input, meta = {}) {
    const trace = {
      at: Date.now(),
      rawInputType: typeof input,
      rawInputPreview: typeof input === "string" ? input.slice(0, 120) : String(input),
      stages: [],
      accepted: false,
      responsePreview: "",
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

      const normalized = this.normalize(input);
      trace.stages.push({ stage: "normalize", value: normalized });

      const intent = this.detectIntent(normalized, meta);
      trace.stages.push({ stage: "detectIntent", value: intent });

      const emotion = this.detectEmotion(normalized, meta);
      trace.stages.push({ stage: "detectEmotion", value: emotion });

      const continuity = this.buildContinuityContext(normalized, intent, emotion, meta);
      trace.stages.push({
        stage: "buildContinuityContext",
        value: {
          previousTurns: continuity.previousTurns.length,
          carryIntent: continuity.carryIntent,
          carryEmotion: continuity.carryEmotion,
          topicEchoes: continuity.topicEchoes
        }
      });

      this.updateState(normalized, intent, emotion, meta);

      let response = this.generateResponse({
        input: normalized,
        intent,
        emotion,
        continuity,
        meta
      });

      response = this.applyEffectTone({
        response,
        emotion,
        intent,
        continuity,
        meta
      });

      trace.accepted = true;
      trace.responsePreview = response.slice(0, 160);

      this.logPipeline({
        input: normalized,
        intent,
        emotion,
        continuity,
        response
      });

      this.pushPipelineTrace(trace);
      return response;
    } catch (err) {
      trace.errors.push(this.safeError(err));
      this.pushPipelineTrace(trace);
      console.error("ChatEngine Error:", err);
      return "Something went wrong in the response pipeline. Give me that again and I’ll recover cleanly.";
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
        check: (value) => value === undefined || value === null || this.isPlainObject(value),
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
    return `I couldn’t process that cleanly because ${primary.message}`;
  }

  normalize(input) {
    if (typeof input !== "string") return "";
    return input
      .replace(/\s+/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();
  }

  detectIntent(input, meta = {}) {
    if (meta && typeof meta.forcedIntent === "string" && meta.forcedIntent.trim()) {
      return meta.forcedIntent.trim();
    }

    const text = lower(input);
    if (!text) return "general";
    if (/(one\s+direct\s+answer|answer\s+this\s+in\s+one\s+sentence|answer\s+directly|just\s+answer|direct\s+answer|give\s+me\s+the\s+answer)/.test(text)) return "direct_answer";
    if (/(define|what\s+is|what\s+are|explain\s+briefly)/.test(text)) return "direct_answer";
    if (/(hi|hello|hey|good morning|good evening)/.test(text)) return "greeting";
    if (/(help|assist|support|fix|repair)/.test(text)) return "help";
    if (/(music|song|radio|playlist|artist)/.test(text)) return "music";
    if (/(feel|feeling|sad|depressed|happy|angry|upset|anxious)/.test(text)) return "emotional_checkin";
    if (/(continue|again|next|keep going|follow up)/.test(text)) return "continuation";
    return "general";
  }

  detectEmotion(input, meta = {}) {
    if (meta && typeof meta.forcedEmotion === "string" && meta.forcedEmotion.trim()) {
      return meta.forcedEmotion.trim();
    }

    const text = lower(input);
    if (!text) return "neutral";
    if (/(sad|depressed|down|hurt|lonely|tired|broken)/.test(text)) return "low";
    if (/(angry|mad|furious|annoyed|frustrated)/.test(text)) return "agitated";
    if (/(happy|great|good|excited|amazing|strong)/.test(text)) return "high";
    if (/(anxious|nervous|worried|uneasy)/.test(text)) return "anxious";
    return "neutral";
  }

  buildContinuityContext(input, intent, emotion, meta = {}) {
    const previousTurns = this.state.memory.slice(-this.config.continuityWindow);
    const priorIntents = previousTurns.map((entry) => entry.intent).filter(Boolean);
    const priorEmotions = previousTurns.map((entry) => entry.emotion).filter(Boolean);
    const priorInputs = previousTurns.map((entry) => entry.input).filter(Boolean);

    const explicitPrevious = this.isPlainObject(meta.previousTurn) ? meta.previousTurn : null;
    if (explicitPrevious) {
      previousTurns.push({
        input: cleanText(explicitPrevious.userText || ""),
        intent: cleanText((meta.marionContract && meta.marionContract.intent) || explicitPrevious.replyAuthority || "general") || "general",
        emotion: cleanText(explicitPrevious.emotionLabel || "neutral") || "neutral"
      });
      priorIntents.push(cleanText((meta.marionContract && meta.marionContract.intent) || explicitPrevious.replyAuthority || ""));
      priorEmotions.push(cleanText(explicitPrevious.emotionLabel || ""));
      priorInputs.push(cleanText(explicitPrevious.userText || explicitPrevious.reply || ""));
    }

    const carryIntent = this.findDominant(priorIntents);
    const carryEmotion = this.findDominant(priorEmotions);

    const currentTokens = this.extractTopicTokens(input);
    const priorTokens = priorInputs.flatMap((entry) => this.extractTopicTokens(entry));
    const contractRefs = Array.isArray(meta.continuity && meta.continuity.references) ? meta.continuity.references.flatMap((entry) => this.extractTopicTokens(entry)) : [];
    const topicEchoes = uniqueStrings(currentTokens.filter((token) => priorTokens.includes(token)).concat(contractRefs)).slice(0, 6);

    const continuingSameIntent = !!(carryIntent && carryIntent === intent);
    const emotionalDrift = carryEmotion && carryEmotion !== emotion ? `${carryEmotion}_to_${emotion}` : null;

    return {
      previousTurns: previousTurns.slice(-this.config.continuityWindow),
      carryIntent: carryIntent || null,
      carryEmotion: carryEmotion || null,
      topicEchoes,
      continuingSameIntent,
      emotionalDrift,
      memoryThread: cleanText(meta.continuity && meta.continuity.memory_thread || "")
    };
  }

  updateState(input, intent, emotion, meta = {}) {
    this.state.lastUserInput = input;
    this.state.lastIntent = intent;
    this.state.emotionalState = emotion;

    this.state.memory.push({
      input,
      intent,
      emotion,
      meta: this.sanitizeMeta(meta),
      timestamp: Date.now()
    });

    if (this.state.memory.length > this.config.maxMemory) {
      this.state.memory.shift();
    }
  }

  generateResponse({ input, intent, emotion, continuity, meta }) {
    if (meta && meta.marionAuthorityLock && cleanText(meta.overrideReply || "")) {
      return cleanText(meta.overrideReply);
    }

    let response = "";
    response += this.buildEmotionPrefix(emotion, continuity, intent, meta);
    response += this.buildIntentResponse(input, intent, continuity, meta);
    response += this.buildContinuitySuffix(intent, continuity, meta);
    return this.cleanResponse(response);
  }

  buildEmotionPrefix(emotion, continuity, intent, meta) {
    if (meta && meta.marionAuthorityLock) return "";
    if (intent === "direct_answer") return "";
    switch (emotion) {
      case "low":
        return continuity.carryEmotion === "low"
          ? "I’m with you, and I can feel this has been sitting with you for more than a single turn. "
          : "I hear the weight in that. ";
      case "agitated":
        return "There’s friction in that, and I’m tracking it. ";
      case "anxious":
        return "I can feel the tension underneath that. ";
      case "high":
        return "That energy is alive. ";
      default:
        return "";
    }
  }

  buildIntentResponse(input, intent, continuity, meta) {
    switch (intent) {
      case "direct_answer":
        return this.directAnswerResponse(input, meta);
      case "greeting":
        return this.dynamicGreeting(continuity);
      case "help":
        return "Tell me the exact obstacle, and I’ll help you break it down cleanly.";
      case "music":
        return continuity.topicEchoes.includes("music") || continuity.topicEchoes.includes("radio")
          ? "We’re still in that sound lane, so let’s tighten it instead of starting over."
          : "Let’s find something that fits the mood and the moment.";
      case "emotional_checkin":
        return this.emotionalCheckInResponse(this.emotionFromContext(continuity, input));
      case "continuation":
        return this.continuationResponse(continuity, meta);
      default:
        return this.contextualResponse(input, continuity, meta);
    }
  }

  directAnswerResponse(input, meta = {}) {
    const locked = cleanText(meta.overrideReply || marionReplyFromSource(meta) || "");
    if (locked) return locked;
    const cleaned = cleanText(input);
    if (!cleaned) return "I need the exact question to answer directly.";
    return `Direct answer mode is on, but Marion did not provide a resolved reply for: ${clipText(cleaned, 120)}`;
  }

  emotionFromContext(ctx, text) {
    if (ctx && ctx.carryEmotion) return ctx.carryEmotion;
    if (/(sad|depressed|down|hurt)/.test(lower(text))) return "low";
    if (/(angry|mad|furious|annoyed)/.test(lower(text))) return "agitated";
    if (/(anxious|nervous|worried)/.test(lower(text))) return "anxious";
    if (/(happy|great|good|excited)/.test(lower(text))) return "high";
    return "neutral";
  }

  dynamicGreeting(continuity) {
    const greetings = continuity && continuity.previousTurns.length > 0
      ? [
          "Good to see you again. Let’s pick up where we left off.",
          "Hey. We’ve already got momentum, so let’s keep it moving.",
          "Hi. I’m with you. Where are we taking this next?"
        ]
      : [
          "Good to see you. What are we exploring today?",
          "Hey. Let’s make something interesting happen.",
          "Hi. Where do you want to go with this?"
        ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  emotionalCheckInResponse(contextEmotion) {
    switch (contextEmotion) {
      case "low":
        return "You don’t have to force your way through it all at once. Give me the sharpest part of it.";
      case "agitated":
        return "Let’s isolate what actually triggered the spike so we can answer the real problem.";
      case "anxious":
        return "Let’s slow the noise down and deal with the next decision, not the whole storm.";
      case "high":
        return "That’s a strong current. Let’s point it somewhere useful.";
      default:
        return "Tell me what the feeling is tied to, and I’ll work from there.";
    }
  }

  continuationResponse(continuity, meta = {}) {
    const locked = cleanText(meta.overrideReply || "");
    if (locked) return locked;
    if (!continuity || continuity.previousTurns.length === 0) {
      return "There’s nothing active in memory yet, so give me the thread you want continued.";
    }
    const lastTurn = continuity.previousTurns[continuity.previousTurns.length - 1];
    return `We can continue from the last thread: intent was ${lastTurn.intent || "general"} and the emotional tone was ${lastTurn.emotion || "neutral"}.`;
  }

  contextualResponse(input, continuity, meta = {}) {
    const locked = cleanText(meta.overrideReply || "");
    if (locked) return locked;
    const text = lower(input);
    const hasQuestion = /\?$/.test(text) || /(what|why|how|when|where|who|can|should|would|could)/.test(text);

    if (continuity && continuity.continuingSameIntent) {
      return "I’m following the thread, so push the next layer instead of restating the surface.";
    }

    if (continuity && continuity.topicEchoes.length > 0) {
      return `I can see the thread carrying through around ${continuity.topicEchoes.join(", ")}. Push a little deeper.`;
    }

    if (hasQuestion) {
      return "Ask the exact question you want answered, and I’ll stay direct.";
    }

    return "Expand on that a bit. I want to understand exactly where you're going.";
  }

  buildContinuitySuffix(intent, continuity, meta = {}) {
    if (meta && meta.marionAuthorityLock) return "";
    if (!continuity || continuity.previousTurns.length === 0) return "";
    if (intent === "greeting" || intent === "direct_answer") return "";

    const parts = [];
    if (continuity.continuingSameIntent) {
      parts.push("We’re not starting cold here.");
    }
    if (continuity.emotionalDrift) {
      parts.push(`I also see the emotional shift: ${continuity.emotionalDrift.replace(/_/g, " ")}.`);
    }
    return parts.length ? ` ${parts.join(" ")}` : "";
  }

  applyEffectTone({ response, emotion, intent, continuity, meta }) {
    if (meta && meta.marionAuthorityLock) return response;
    if (!this.effectEngine || typeof this.effectEngine.modulate !== "function") {
      return response;
    }

    try {
      const modulated = this.effectEngine.modulate({
        text: response,
        state: {
          emotion,
          intent,
          continuity,
          lastIntent: this.state.lastIntent,
          emotionalState: this.state.emotionalState
        },
        meta: this.sanitizeMeta(meta)
      });
      return typeof modulated === "string" && modulated.trim() ? modulated : response;
    } catch (err) {
      const rejection = {
        at: Date.now(),
        field: "effectEngine.modulate",
        code: "effect_engine_failure",
        message: "Effect engine modulation failed.",
        valuePreview: this.safeError(err)
      };
      this.pushRejectionLog(rejection);
      console.warn("Effect engine hook failed:", err);
      return response;
    }
  }

  logPipeline(payload) {
    console.log("PIPELINE TRACE:", {
      input: payload.input,
      intent: payload.intent,
      emotion: payload.emotion,
      continuity: {
        previousTurns: payload.continuity.previousTurns.length,
        carryIntent: payload.continuity.carryIntent,
        carryEmotion: payload.continuity.carryEmotion,
        topicEchoes: payload.continuity.topicEchoes
      },
      response: payload.response
    });
  }

  pushPipelineTrace(trace) {
    this.state.pipelineTrace.push(trace);
    if (this.state.pipelineTrace.length > 100) {
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

  isPlainObject(value) {
    return isPlainObject(value);
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
    if (!this.isPlainObject(meta)) return {};
    const clean = {};
    for (const [key, value] of Object.entries(meta)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
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

  cleanResponse(response) {
    return String(response || "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

class BasicEffectEngine {
  modulate({ text, state }) {
    if (!text || typeof text !== "string") return text;
    if (state && state.intent === "direct_answer") return text;
    if (state && state.emotion === "agitated") {
      return text.replace("Push a little deeper.", "Let’s get precise and cut through the noise.");
    }
    return text;
  }
}

let runtime = null;

function getRuntime() {
  if (!runtime) {
    runtime = new ChatEngine({
      effectEngine: new BasicEffectEngine()
    });
  }
  return runtime;
}

function buildHandleMeta(input) {
  const src = isPlainObject(input) ? input : {};
  const marionContract = isPlainObject(src.marionContract) ? src.marionContract : {};
  const overrideReply = marionReplyFromSource(src);
  const authority = shouldLockMarionAuthority(src);
  return {
    channel: "index",
    userId: cleanText(src.sessionId || ""),
    forcedIntent: cleanText(src.forcedIntent || marionContract.intent || src.intentHint || ""),
    forcedEmotion: cleanText(src.forcedEmotion || marionContract.emotional_state || src.emotionalHint || ""),
    overrideReply,
    marionAuthorityLock: authority,
    marionContract,
    marion: isPlainObject(src.marion) ? src.marion : {},
    continuity: isPlainObject(src.continuity) ? src.continuity : (isPlainObject(marionContract.continuity) ? marionContract.continuity : {}),
    previousTurn: isPlainObject(src.previousTurn) ? src.previousTurn : null,
    traceId: cleanText(src.traceId || "")
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
  return {
    ok: true,
    reply,
    payload: {
      reply,
      text: reply,
      message: reply,
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
      mode: meta.marionAuthorityLock ? "authoritative" : "engine",
      publicMode: true
    },
    meta: {
      engineVersion: "Chat Engine vFinal++ Marion Authority Locked",
      replyAuthority: meta.marionAuthorityLock ? "marion_locked" : "chat_engine",
      marionAuthorityLock: !!meta.marionAuthorityLock,
      marionIntent: cleanText(meta.marionContract && meta.marionContract.intent || ""),
      marionEmotionalState: cleanText(meta.marionContract && meta.marionContract.emotional_state || ""),
      traceId: cleanText(meta.traceId || "")
    },
    speech: null
  };
}

async function handleChat(input = {}) {
  const src = isPlainObject(input) ? input : { text: typeof input === "string" ? input : "" };
  const meta = buildHandleMeta(src);
  const runtimeInstance = getRuntime();
  const response = runtimeInstance.processInput(cleanText(src.text || src.payload && src.payload.text || ""), meta);
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
    BasicEffectEngine,
    handleChat,
    run,
    chat,
    handle,
    reply
  };
}
