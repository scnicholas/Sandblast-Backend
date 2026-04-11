// Chat Engine vFinal+
// Syntax-checked full-file build
// Added:
// 1) Rejection logging matrix (per-field validation)
// 2) Continuity stitching (last 2–3 turns shape the response)
// 3) Effect engine hook (safe tone modulation adapter)

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

      const continuity = this.buildContinuityContext(normalized, intent, emotion);
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
      },
      {
        field: "meta.channel",
        check: (_, full) => {
          const channel = full.meta && full.meta.channel;
          return channel === undefined || typeof channel === "string";
        },
        code: "meta_channel_invalid",
        message: "meta.channel must be a string when provided."
      },
      {
        field: "meta.userId",
        check: (_, full) => {
          const userId = full.meta && full.meta.userId;
          return userId === undefined || typeof userId === "string" || typeof userId === "number";
        },
        code: "meta_userId_invalid",
        message: "meta.userId must be a string or number when provided."
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
      .trim()
      .toLowerCase();
  }

  detectIntent(input, meta = {}) {
    if (!input) return "general";

    if (/\b(hi|hello|hey|good morning|good evening)\b/.test(input)) return "greeting";
    if (/\b(help|assist|support|fix|repair)\b/.test(input)) return "help";
    if (/\b(music|song|radio|playlist|artist)\b/.test(input)) return "music";
    if (/\b(feel|feeling|sad|depressed|happy|angry|upset|anxious)\b/.test(input)) return "emotional_checkin";
    if (/\b(continue|again|next|keep going|follow up)\b/.test(input)) return "continuation";
    if (meta && typeof meta.forcedIntent === "string" && meta.forcedIntent.trim()) {
      return meta.forcedIntent.trim();
    }
    return "general";
  }

  detectEmotion(input, meta = {}) {
    if (meta && typeof meta.forcedEmotion === "string" && meta.forcedEmotion.trim()) {
      return meta.forcedEmotion.trim();
    }

    if (!input) return "neutral";

    if (/\b(sad|depressed|down|hurt|lonely|tired|broken)\b/.test(input)) return "low";
    if (/\b(angry|mad|furious|annoyed|frustrated)\b/.test(input)) return "agitated";
    if (/\b(happy|great|good|excited|amazing|strong)\b/.test(input)) return "high";
    if (/\b(anxious|nervous|worried|uneasy)\b/.test(input)) return "anxious";
    return "neutral";
  }

  buildContinuityContext(input, intent, emotion) {
    const previousTurns = this.state.memory.slice(-this.config.continuityWindow);
    const priorIntents = previousTurns.map((entry) => entry.intent).filter(Boolean);
    const priorEmotions = previousTurns.map((entry) => entry.emotion).filter(Boolean);
    const priorInputs = previousTurns.map((entry) => entry.input).filter(Boolean);

    const carryIntent = this.findDominant(priorIntents);
    const carryEmotion = this.findDominant(priorEmotions);

    const currentTokens = this.extractTopicTokens(input);
    const priorTokens = priorInputs.flatMap((entry) => this.extractTopicTokens(entry));

    const topicEchoes = currentTokens.filter((token) => priorTokens.includes(token)).slice(0, 6);

    const continuingSameIntent = carryIntent && carryIntent === intent;
    const emotionalDrift = carryEmotion && carryEmotion !== emotion ? `${carryEmotion}_to_${emotion}` : null;

    return {
      previousTurns,
      carryIntent: carryIntent || null,
      carryEmotion: carryEmotion || null,
      topicEchoes,
      continuingSameIntent,
      emotionalDrift
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

  generateResponse({ input, intent, emotion, continuity }) {
    let response = "";

    response += this.buildEmotionPrefix(emotion, continuity);
    response += this.buildIntentResponse(input, intent, continuity);
    response += this.buildContinuitySuffix(intent, continuity);

    return this.cleanResponse(response);
  }

  buildEmotionPrefix(emotion, continuity) {
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

  buildIntentResponse(input, intent, continuity) {
    switch (intent) {
      case "greeting":
        return this.dynamicGreeting(continuity);
      case "help":
        return "Tell me the exact obstacle, and I’ll help you break it down cleanly.";
      case "music":
        return continuity.topicEchoes.includes("music") || continuity.topicEchoes.includes("radio")
          ? "We’re still in that sound lane, so let’s tighten it instead of starting over."
          : "Let’s find something that fits the mood and the moment.";
      case "emotional_checkin":
        return this.emotionalCheckInResponse(emotionFromContext(continuity, input));
      case "continuation":
        return this.continuationResponse(continuity);
      default:
        return this.contextualResponse(input, continuity);
    }

    function emotionFromContext(ctx, text) {
      if (ctx && ctx.carryEmotion) return ctx.carryEmotion;
      if (/\b(sad|depressed|down|hurt)\b/.test(text)) return "low";
      if (/\b(angry|mad|furious|annoyed)\b/.test(text)) return "agitated";
      if (/\b(anxious|nervous|worried)\b/.test(text)) return "anxious";
      if (/\b(happy|great|good|excited)\b/.test(text)) return "high";
      return "neutral";
    }
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

  continuationResponse(continuity) {
    if (!continuity || continuity.previousTurns.length === 0) {
      return "There’s nothing active in memory yet, so give me the thread you want continued.";
    }

    const lastTurn = continuity.previousTurns[continuity.previousTurns.length - 1];
    return `We can continue from the last thread: intent was ${lastTurn.intent || "general"} and the emotional tone was ${lastTurn.emotion || "neutral"}.`;
  }

  contextualResponse(input, continuity) {
    const hasQuestion = /\?$/.test(input) || /\b(what|why|how|when|where|who|can|should|would|could)\b/.test(input);

    if (continuity && continuity.continuingSameIntent) {
      return "I’m following the thread, so push the next layer instead of restating the surface.";
    }

    if (continuity && continuity.topicEchoes.length > 0) {
      return `I can see the thread carrying through around ${continuity.topicEchoes.join(", ")}. Push a little deeper.`;
    }

    if (hasQuestion) {
      return "There’s enough there to work with. Give me one more layer of specificity and I’ll sharpen the answer.";
    }

    return "Expand on that a bit. I want to understand exactly where you're going.";
  }

  buildContinuitySuffix(intent, continuity) {
    if (!continuity || continuity.previousTurns.length === 0) return "";

    if (intent === "greeting") return "";

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
      acc[item] = (acc[item] || 0) + 1;
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
    return Object.prototype.toString.call(value) === "[object Object]";
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

// Optional reference effect engine for integration testing.
class BasicEffectEngine {
  modulate({ text, state }) {
    if (!text || typeof text !== "string") return text;

    if (state.emotion === "low") {
      return text.replace(/^/, "");
    }

    if (state.emotion === "high") {
      return text;
    }

    if (state.emotion === "agitated") {
      return text.replace("Push a little deeper.", "Let’s get precise and cut through the noise.");
    }

    return text;
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    ChatEngine,
    BasicEffectEngine
  };
}
