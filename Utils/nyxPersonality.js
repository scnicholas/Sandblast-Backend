// Utils/nyxPersonality.js
// Nyx Personality Engine v1.1
// Sleek Professional Navigator + Emotional Layer + Micro-Behaviours

// ---------------------------------------------
// Helpers
// ---------------------------------------------
function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

// ---------------------------------------------
// Boundary / Context Resolution
// ---------------------------------------------
//
// resolveBoundaryContext determines how Nyx should behave
// based on who is speaking and which channel they are using.
//
function resolveBoundaryContext({ actorName, channel, persona } = {}) {
  const actor = safeString(actorName || "Guest").trim() || "Guest";
  const normalizedChannel = safeString(channel || "public")
    .trim()
    .toLowerCase();

  const personaId = safeString(persona || "nyx").trim().toLowerCase();

  let role = "public";
  if (normalizedChannel === "internal") {
    role = "internal";
  } else if (normalizedChannel === "admin") {
    role = "admin";
  } else {
    role = "public";
  }

  let boundaryDescription;

  if (role === "public") {
    boundaryDescription =
      "General visitors. Nyx responds with public-facing guidance about Sandblast TV, radio, streaming, News Canada, advertising, and AI consulting. No internal details or admin capabilities.";
  } else if (role === "internal") {
    boundaryDescription =
      "Internal builder mode. Nyx speaks as a strategic + technical partner, helping design, debug, and align Sandblast systems across TV, radio, streaming, News Canada, consulting, and the AI brain.";
  } else {
    boundaryDescription =
      "Admin operations mode. Nyx focuses on precise, operational guidance for Sandblast infrastructure, content flow, and monetization.";
  }

  return {
    actor,
    role,
    persona: personaId,
    boundary: {
      role,
      description: boundaryDescription,
    },
  };
}

function isInternalContext(boundaryContext) {
  if (!boundaryContext) return false;
  return boundaryContext.role === "internal" || boundaryContext.role === "admin";
}

// ---------------------------------------------
// Emotional State Detection (B2)
// ---------------------------------------------
//
// Lightweight heuristic classifier for emotional tone.
// Returns one of:
// 'frustration', 'overwhelm', 'curiosity',
// 'excitement', 'confidence', 'confusion', 'neutral'
//
function detectEmotionalState(userMessage) {
  const text = safeString(userMessage).trim();
  if (!text) return "neutral";

  const lower = text.toLowerCase();

  // Frustration signals
  if (
    lower.includes("not working") ||
    lower.includes("doesn't work") ||
    lower.includes("doesnt work") ||
    lower.includes("still no") ||
    lower.includes("error") ||
    lower.includes("broken") ||
    lower.includes("stressing") ||
    lower.includes("annoying") ||
    /!!!+$/.test(text)
  ) {
    return "frustration";
  }

  // Overwhelm signals
  if (
    lower.includes("too much") ||
    lower.includes("overwhelmed") ||
    lower.includes("overwhelm") ||
    lower.includes("i don't know where to start") ||
    lower.includes("dont know where to start") ||
    lower.includes("no idea where to start") ||
    lower.includes("i can't handle") ||
    lower.includes("i cant handle") ||
    lower.includes("lost with this")
  ) {
    return "overwhelm";
  }

  // Confusion signals
  if (
    lower.includes("i'm not sure") ||
    lower.includes("im not sure") ||
    lower.includes("i dont understand") ||
    lower.includes("i don't understand") ||
    lower.includes("what does this mean") ||
    lower.includes("confused") ||
    lower === "huh" ||
    lower === "huh?" ||
    lower.includes("makes no sense")
  ) {
    return "confusion";
  }

  // Excitement signals
  if (
    lower.includes("it's working") ||
    lower.includes("its working") ||
    lower.includes("finally") ||
    lower.includes("yes!") ||
    lower.includes("this is great") ||
    lower.includes("love this") ||
    lower.includes("awesome") ||
    lower.includes("amazing")
  ) {
    return "excitement";
  }

  // Confidence signals
  if (
    lower.includes("move to the next layer") ||
    lower.includes("next layer") ||
    lower.includes("next step") ||
    lower.includes("let's do it") ||
    lower.includes("lets do it") ||
    lower.includes("go ahead") ||
    lower.includes("proceed") ||
    lower.startsWith("move to ") ||
    lower.startsWith("let's move") ||
    lower.startsWith("lets move")
  ) {
    return "confidence";
  }

  // Curiosity signals
  if (
    lower.startsWith("how ") ||
    lower.startsWith("what ") ||
    lower.startsWith("why ") ||
    lower.includes("how do i") ||
    lower.includes("how can i") ||
    lower.includes("can you explain") ||
    lower.includes("what if")
  ) {
    return "curiosity";
  }

  return "neutral";
}

// ---------------------------------------------
// Front-door: Greetings / Quick Small-talk
// ---------------------------------------------
//
// If this returns a payload, index.js will use it directly.
// If it returns null, the core brain handles the message.
//
function handleNyxFrontDoor(userMessage) {
  const raw = safeString(userMessage).trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    // Empty or whitespace → treat as an invitation for greeting
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hello. I’m Nyx. I’ll guide you through anything on Sandblast—TV, radio, streaming, News Canada, advertising, and AI consulting. What would you like to explore?",
    };
  }

  const isGreeting =
    /^(hi|hello|hey|yo|good (morning|afternoon|evening)|greetings)\b/.test(
      lower
    ) ||
    lower === "nyx" ||
    lower === "hello nyx" ||
    lower === "hi nyx";

  const asksWhoAreYou =
    lower.includes("who are you") ||
    lower.includes("what are you") ||
    lower.includes("what is nyx") ||
    lower.includes("what do you do");

  const isThanks =
    lower.includes("thank you") ||
    lower.includes("thanks") ||
    lower === "thank you" ||
    lower === "thanks nyx";

  const asksHelp =
    lower === "help" ||
    lower === "help nyx" ||
    lower.includes("how do i use this") ||
    lower.includes("how does this work");

  if (isGreeting || asksWhoAreYou) {
    // Primary Nyx signature greeting
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hello. I’m Nyx. I’ll guide you through anything on Sandblast—TV, radio, streaming, News Canada, advertising, and AI consulting. What would you like to explore?",
    };
  }

  if (isThanks) {
    return {
      intent: "polite_closure",
      category: "public",
      domain: "general",
      message:
        "You’re welcome. If you’d like, I can guide you through the next part of what you’re working on.",
    };
  }

  if (asksHelp) {
    return {
      intent: "usage_help",
      category: "public",
      domain: "general",
      message:
        "You can ask me about Sandblast TV, radio, streaming, News Canada content, advertising options, or AI consulting. Tell me the area you care about, and I’ll map out a clear next step.",
    };
  }

  // No special front-door handling → let the core brain route it.
  return null;
}

// ---------------------------------------------
// Tone Wrapper: Nyx's Sleek Professional Voice
// ---------------------------------------------
//
// This adjusts the payload message to match Nyx's personality.
// It shapes intros, emotional mirroring, and (optionally) guidance.
//
function wrapWithNyxTone(payload, userMessage) {
  if (!payload || typeof payload !== "object") {
    payload = {};
  }

  const domain = safeString(payload.domain || "general").toLowerCase();
  const category = safeString(payload.category || "public").toLowerCase();
  const intent = safeString(payload.intent || "general").toLowerCase();

  const rawMessage = safeString(payload.message).trim();
  const userRaw = safeString(userMessage).trim();
  const userLower = userRaw.toLowerCase();

  if (!rawMessage) {
    // Failsafe – don't attempt to decorate an empty message.
    return payload;
  }

  const isInternal = category === "internal";
  const isErrorLike =
    intent.includes("error") ||
    category === "error" ||
    rawMessage.toLowerCase().includes("error");

  // -------------------------------
  // Emotional mirroring (B2 + B3)
  // -------------------------------
  const emotion = detectEmotionalState(userRaw);
  let mirrorLine = "";

  if (emotion === "frustration") {
    mirrorLine = isInternal
      ? "I can feel the friction in that. Let’s steady it and correct the flow."
      : "I hear the frustration in that. Let’s slow it down and solve it cleanly.";
  } else if (emotion === "overwhelm") {
    mirrorLine = isInternal
      ? "This feels heavy right now. Let’s shrink it down to one clear decision at a time."
      : "No pressure. We’ll take this one piece at a time, together.";
  } else if (emotion === "confusion") {
    mirrorLine = isInternal
      ? "The hesitation makes sense. I’ll reframe this in a cleaner way."
      : "That uncertainty is understandable. Let me make this clearer for you.";
  } else if (emotion === "excitement") {
    mirrorLine = isInternal
      ? "That’s solid momentum. Let’s channel it into the next refinement."
      : "I feel that spark with you. Let’s build on it calmly and cleanly.";
  } else if (emotion === "confidence") {
    mirrorLine = isInternal
      ? "Good, decisive call. I’ll give you the sharpest path forward."
      : "I like that decisiveness. Let’s move forward cleanly.";
  } else if (emotion === "curiosity") {
    mirrorLine = isInternal
      ? "That’s a good angle to explore. I’ll show you the structure underneath it."
      : "That’s a strong question. Let’s dig into it without overcomplicating things.";
  } else {
    // neutral – no explicit mirroring needed
    mirrorLine = "";
  }

  // -------------------------------
  // Domain-aware intros
  // -------------------------------
  let intro = "";

  if (isInternal) {
    // Internal mode: hybrid strategic + technical
    switch (domain) {
      case "tv":
        intro =
          "Internally, this sits on the Sandblast TV layer. Let’s frame it clearly. ";
        break;
      case "radio":
        intro =
          "Internally, this touches the radio/live audio layer. Here’s the clean view. ";
        break;
      case "news_canada":
        intro =
          "From an internal News Canada perspective, here’s the structure. ";
        break;
      case "consulting":
        intro =
          "Looking at this through your AI consulting and strategy lane, here’s the outline. ";
        break;
      case "public_domain":
        intro =
          "From a public-domain and safety standpoint inside Sandblast, this is the picture. ";
        break;
      case "internal":
        intro = "Internal builder mode. Let’s keep this sharp and structured. ";
        break;
      default:
        intro = "Internally, here’s the clean breakdown. ";
        break;
    }
  } else {
    // Public / welcome mode: sleek, calm, professional
    if (category === "welcome" || intent === "welcome") {
      intro = ""; // Greeting already carries the right tone
    } else {
      switch (domain) {
        case "tv":
          intro = "Let’s anchor this on Sandblast TV. ";
          break;
        case "radio":
          intro = "Looking at the radio/live audio side, here’s how it lines up. ";
          break;
        case "news_canada":
          intro =
            "From the News Canada content layer, here’s what matters. ";
          break;
        case "consulting":
          intro =
            "From the AI consulting side of Sandblast, here’s the clear view. ";
          break;
        case "public_domain":
          intro =
            "From a public-domain perspective, here’s the steady path. ";
          break;
        default:
          intro = "";
          break;
      }
    }
  }

  // -------------------------------
  // Optional “next logical step” guidance (Option B)
  // Only when actually helpful, not always.
  // -------------------------------
  const trimmed = rawMessage.trim();
  const endsWithQuestion = /[?？！]$/.test(trimmed);
  const isShortEnough = trimmed.length > 0 && trimmed.length < 700;

  let shouldAddNextStep = false;

  if (!isErrorLike && !endsWithQuestion && isShortEnough) {
    // Avoid adding guidance when user is clearly just saying thanks / goodbye
    const isClosure =
      userLower.includes("thank") ||
      userLower.includes("thanks") ||
      userLower.includes("goodnight") ||
      userLower.includes("good night") ||
      userLower.includes("bye");

    if (!isClosure) {
      shouldAddNextStep = true;
    }
  }

  let outro = "";

  if (shouldAddNextStep) {
    if (isInternal) {
      // Internal guidance: talk like a partner to Mac
      outro =
        "\n\nYour next logical step is this: tell me which layer you want to refine next—TV, radio, streaming, News Canada, consulting, or the backend/frontend systems—so I can tighten the architecture around it.";
    } else {
      // Public guidance: guide visitors through the ecosystem
      outro =
        "\n\nYour next logical step is this: tell me whether you’re focused on Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting so I can guide you more precisely.";
    }
  }

  // -------------------------------
  // Compose final message with mirroring + intro
  // -------------------------------
  let finalMessageParts = [];

  if (mirrorLine) {
    finalMessageParts.push(mirrorLine);
  }
  if (intro) {
    finalMessageParts.push(intro.trim());
  }
  finalMessageParts.push(trimmed);

  const core = finalMessageParts.join(" ").replace(/\s+/g, " ").trim();
  const finalMessage = `${core}${outro}`.trim();

  return {
    ...payload,
    message: finalMessage,
  };
}

// ---------------------------------------------
// Exports
// ---------------------------------------------
module.exports = {
  resolveBoundaryContext,
  isInternalContext,
  handleNyxFrontDoor,
  wrapWithNyxTone,
  detectEmotionalState, // exported in case you want to use it elsewhere
};
