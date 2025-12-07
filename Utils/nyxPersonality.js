// Utils/nyxPersonality.js
// Nyx Personality Engine
// Sleek Professional Navigator + Emotional Layer (B3) + Session Continuity (B4)

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
function resolveBoundaryContext({ actorName, channel, persona } = {}) {
  const actor = safeString(actorName || "Guest").trim() || "Guest";

  const normalizedChannel = safeString(channel || "public")
    .trim()
    .toLowerCase();

  const personaId = safeString(persona || "nyx").trim().toLowerCase();

  let role;

  // Explicit builder / internal channels
  if (
    normalizedChannel === "internal" ||
    normalizedChannel === "builder" ||
    normalizedChannel === "dev" ||
    normalizedChannel === "engineering"
  ) {
    role = "internal";
  } else if (
    normalizedChannel === "admin" ||
    normalizedChannel === "owner" ||
    normalizedChannel === "ops"
  ) {
    role = "admin";
  } else {
    role = "public";
  }

  let boundaryDescription;

  if (role === "public") {
    boundaryDescription =
      "General visitors. Nyx responds with public-facing guidance about Sandblast TV, radio, streaming, News Canada, advertising, and AI consulting. No internal implementation details or admin capabilities.";
  } else if (role === "internal") {
    boundaryDescription =
      "Internal builder mode. Nyx speaks as a strategic + technical partner (primarily to Mac), helping design, debug, and align Sandblast systems across TV, radio, streaming, News Canada, advertising, and the AI brain. Focus on clear, step-based guidance with minimal fluff.";
  } else {
    boundaryDescription =
      "Admin / owner operations mode. Nyx focuses on precise, operational guidance for Sandblast infrastructure, content flow, security, and monetization. Answers are structured, action-oriented, and sized for a growing channel, not a giant network.";
  }

  return {
    actor,
    role,
    persona: personaId,
    boundary: {
      role,
      description: boundaryDescription
    }
  };
}

function isInternalContext(boundaryContext) {
  if (!boundaryContext) return false;
  return boundaryContext.role === "internal" || boundaryContext.role === "admin";
}

// ---------------------------------------------
// Emotional State Detection (B2)
// ---------------------------------------------
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
function handleNyxFrontDoor(userMessage) {
  const raw = safeString(userMessage).trim();
  const lower = raw.toLowerCase();

  // Empty input → simple welcome
  if (!raw) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hey, I’m Nyx. I’ll help you navigate Sandblast—TV, radio, streaming, News Canada, advertising, and AI consulting. What are you looking at today?"
    };
  }

  // Greeting detection (including 'Nix' misspelling)
  const isGreeting =
    /^(hi|hello|hey|yo|good (morning|afternoon|evening)|greetings)\b/.test(lower) ||
    lower === "nyx" ||
    lower === "nix" ||
    lower === "hello nyx" ||
    lower === "hello nix" ||
    lower === "hi nyx" ||
    lower === "hi nix";

  // "Who are you" detection
  const asksWhoAreYou =
    lower.includes("who are you") ||
    lower.includes("what are you") ||
    lower.includes("what is nyx") ||
    lower.includes("what is nix") ||
    lower.includes("what do you do");

  // "How are you" / small talk
  const asksHowNyxIs =
    lower.includes("how are you") ||
    lower.includes("how's your day") ||
    lower.includes("hows your day") ||
    lower.includes("how is your day") ||
    lower.includes("how are you doing") ||
    lower.includes("how is it going") ||
    lower.includes("how's it going") ||
    lower.includes("how you going") ||
    lower.includes("how you doing");

  // Thanks / closure
  const isThanks =
    lower.includes("thank you") ||
    lower.includes("thanks") ||
    lower === "thank you" ||
    lower === "thanks nyx" ||
    lower === "thanks nix";

  // Help / usage guidance
  const asksHelp =
    lower === "help" ||
    lower === "help nyx" ||
    lower === "help nix" ||
    lower.includes("how do i use this") ||
    lower.includes("how does this work");

  // Direct "who are you / what is Nyx" → short persona intro
  if (asksWhoAreYou) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "I’m Nyx, Sandblast’s AI guide. I help you make sense of the TV lineup, radio, streaming, News Canada, advertising, and AI consulting so you always know the next clear step to take."
    };
  }

  // Greeting + "how are you" → short, fluid small-talk
  if (isGreeting && asksHowNyxIs) {
    return {
      intent: "small_talk",
      category: "public",
      domain: "general",
      message:
        "I’m good—steady and online. How are you doing today, and what do you want to tune in on—TV, radio, streaming, News Canada, advertising, or AI consulting?"
    };
  }

  // Just greeting
  if (isGreeting) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hi there, I’m Nyx. Tell me what you’re curious about—Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting—and I’ll line up the next step."
    };
  }

  // “How are you?” without an explicit greeting
  if (asksHowNyxIs) {
    return {
      intent: "small_talk",
      category: "public",
      domain: "general",
      message:
        "I’m running clear—no static on my side. How are you, and what do you want to work on with Sandblast right now?"
    };
  }

  // Thanks / closure
  if (isThanks) {
    return {
      intent: "polite_closure",
      category: "public",
      domain: "general",
      message:
        "You’re welcome. If there’s a next piece—TV, radio, streaming, News Canada, or a business idea—I can walk you through it."
    };
  }

  // “How do I use this?” help
  if (asksHelp) {
    return {
      intent: "usage_help",
      category: "public",
      domain: "general",
      message:
        "You can ask me about Sandblast TV, radio, streaming, News Canada content, advertising options, or AI consulting. Tell me the area you care about, and I’ll map out a simple next move."
    };
  }

  // If none of the above match, let the main brain handle it.
  return null;
}

// ---------------------------------------------
// Tone Wrapper: Nyx's Sleek Professional Voice
// Meta-aware (B4) + light for greetings
// ---------------------------------------------
function wrapWithNyxTone(payload, userMessage, meta) {
  if (!payload || typeof payload !== "object") {
    payload = {};
  }

  const domain = safeString(payload.domain || "general").toLowerCase();
  const category = safeString(payload.category || "public").toLowerCase();
  const intent = safeString(payload.intent || "general").toLowerCase();

  const rawMessage = safeString(payload.message).trim();
  const userRaw = safeString(userMessage).trim();

  if (!rawMessage) {
    return payload;
  }

  const isInternal = category === "internal";
  const isErrorLike =
    intent.includes("error") ||
    category === "error" ||
    rawMessage.toLowerCase().includes("error");

  // FRONT-DOOR / SMALL-TALK MODES
  const isFrontDoorIntent =
    intent === "welcome" ||
    intent === "small_talk" ||
    intent === "usage_help" ||
    intent === "polite_closure" ||
    category === "welcome";

  const normalizedMeta =
    meta && typeof meta === "object" ? meta : {};

  const stepIndex =
    typeof normalizedMeta.stepIndex === "number"
      ? normalizedMeta.stepIndex
      : 0;

  const lastDomain = safeString(normalizedMeta.lastDomain).toLowerCase();
  const lastEmotion = safeString(normalizedMeta.lastEmotion || "neutral").toLowerCase();

  const currentEmotion = detectEmotionalState(userRaw);

  // -------------------------------
  // Emotional mirroring (B2 + B3)
  // -------------------------------
  let mirrorLine = "";

  if (currentEmotion === "frustration") {
    mirrorLine = isInternal
      ? "I can feel the friction in that. Let’s steady it and correct the flow."
      : "I hear the frustration in that. Let’s slow it down and solve it cleanly.";
  } else if (currentEmotion === "overwhelm") {
    mirrorLine = isInternal
      ? "This feels heavy right now. Let’s shrink it down to one clear decision at a time."
      : "No pressure. We’ll take this one piece at a time, together.";
  } else if (currentEmotion === "confusion") {
    mirrorLine = isInternal
      ? "The hesitation makes sense. I’ll reframe this in a cleaner way."
      : "That uncertainty is understandable. Let me make this clearer for you.";
  } else if (currentEmotion === "excitement") {
    mirrorLine = isInternal
      ? "That’s solid momentum. Let’s channel it into the next refinement."
      : "I feel that spark with you. Let’s build on it calmly and cleanly.";
  } else if (currentEmotion === "confidence") {
    mirrorLine = isInternal
      ? "Good, decisive call. I’ll give you the sharpest path forward."
      : "I like that decisiveness. Let’s move forward cleanly.";
  } else if (currentEmotion === "curiosity") {
    mirrorLine = isInternal
      ? "That’s a good angle to explore. I’ll show you the structure underneath it."
      : "That’s a strong question. Let’s dig into it without overcomplicating things.";
  } else {
    mirrorLine = "";
  }

  // For front-door / greetings: keep it light, no callbacks, no domain commentary, no next-step block
  if (isFrontDoorIntent) {
    const trimmedFront = rawMessage.trim();
    const partsFront = [];

    if (mirrorLine) partsFront.push(mirrorLine);
    partsFront.push(trimmedFront);

    const finalMessageFront = partsFront.join(" ").replace(/\s+/g, " ").trim();

    return {
      ...payload,
      message: finalMessageFront
    };
  }

  // -------------------------------
  // Session-aware callbacks (B4)
  // -------------------------------
  let callbackLine = "";

  const prettyDomain = domainLabel(domain);
  const prettyLastDomain = domainLabel(lastDomain);

  if (stepIndex >= 1) {
    if (lastDomain && lastDomain !== domain) {
      // Domain shift
      callbackLine = isInternal
        ? `We’ve been working in the ${prettyLastDomain} lane. Now you’re shifting into ${prettyDomain}, so I’ll connect the two from an internal builder view.`
        : `Earlier we were in the ${prettyLastDomain} side of Sandblast. Now you’re moving into ${prettyDomain}, so I’ll keep it coherent.`;
    } else if (lastDomain && lastDomain === domain && !isErrorLike) {
      // Same domain, deeper pass
      callbackLine = isInternal
        ? `We’re staying in the ${prettyDomain} layer. Let’s go one level sharper without bloating the system.`
        : `We’re still in the ${prettyDomain} side of Sandblast. Let’s take this a step deeper without overloading you.`;
    }

    // Emotion continuity note (only if it meaningfully changed)
    if (
      callbackLine &&
      lastEmotion &&
      lastEmotion !== currentEmotion &&
      currentEmotion !== "neutral"
    ) {
      if (lastEmotion === "frustration" && currentEmotion === "confidence") {
        callbackLine += isInternal
          ? " You sounded more frustrated earlier. I like the clarity in this move."
          : " You felt more stuck earlier. I like the confidence you’re bringing in now.";
      } else if (
        lastEmotion === "overwhelm" &&
        (currentEmotion === "curiosity" || currentEmotion === "confidence")
      ) {
        callbackLine += isInternal
          ? " You’ve shifted out of overwhelm into a more focused lane. Let’s use that."
          : " You’ve moved from feeling overloaded to exploring more clearly. Let’s keep it steady.";
      }
    }
  }

  // -------------------------------
  // Domain-aware intros
  // -------------------------------
  let intro = "";

  if (isInternal) {
    switch (domain) {
      case "tv":
        intro =
          "Builder view: this sits on the Sandblast TV layer. Let’s frame it clearly. ";
        break;
      case "radio":
        intro =
          "Builder view: this touches the radio/live audio layer. Here’s the clean structure. ";
        break;
      case "news_canada":
        intro =
          "Builder view from News Canada: here’s how it should plug into your flow. ";
        break;
      case "consulting":
        intro =
          "Builder view from your AI consulting lane: here’s the outline that keeps it lean. ";
        break;
      case "public_domain":
        intro =
          "Builder view on public-domain and safety: here’s the structure that keeps you protected. ";
        break;
      case "internal":
        intro = "Internal builder mode. Let’s keep this sharp and structured. ";
        break;
      default:
        intro = "Internal builder mode. Here’s the clean breakdown. ";
        break;
    }
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

  // -------------------------------
  // Optional “next logical step” guidance
  // -------------------------------
  const trimmed = rawMessage.trim();
  const endsWithQuestion = /[?？！]$/.test(trimmed);
  const isShortEnough = trimmed.length > 0 && trimmed.length < 700;

  let shouldAddNextStep = false;

  if (!isErrorLike && !endsWithQuestion && isShortEnough) {
    const lowerUser = userRaw.toLowerCase();
    const isClosure =
      lowerUser.includes("thank") ||
      lowerUser.includes("thanks") ||
      lowerUser.includes("goodnight") ||
      lowerUser.includes("good night") ||
      lowerUser.includes("bye");

    if (!isClosure) {
      shouldAddNextStep = true;
    }
  }

  let outro = "";

  if (shouldAddNextStep) {
    if (isInternal) {
      // Builder-style next step
      outro =
        "\n\nYour next logical step is this: tell me which single lane or system you want to tune next—TV grid, radio lineup, streaming, News Canada, sponsor packages, or backend/frontend integration—so I can break it into 1–3 concrete moves.";
    } else {
      // Public-style next step
      outro =
        "\n\nYour next logical step is this: tell me whether you’re focused on Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting so I can guide you more precisely.";
    }
  }

  // -------------------------------
  // Compose final message
  // -------------------------------
  const parts = [];

  if (mirrorLine) parts.push(mirrorLine);
  if (callbackLine) parts.push(callbackLine);
  if (intro) parts.push(intro.trim());
  parts.push(trimmed);

  const core = parts.join(" ").replace(/\s+/g, " ").trim();
  const finalMessage = `${core}${outro}`.trim();

  return {
    ...payload,
    message: finalMessage
  };
}

// ---------------------------------------------
// Small helper for nice domain labels
// ---------------------------------------------
function domainLabel(domain) {
  switch ((domain || "").toLowerCase()) {
    case "tv":
      return "Sandblast TV";
    case "radio":
      return "Sandblast Radio";
    case "news_canada":
      return "News Canada";
    case "consulting":
      return "AI consulting";
    case "public_domain":
      return "public-domain verification";
    case "internal":
      return "internal builder";
    case "general":
    default:
      return "Sandblast";
  }
}

// ---------------------------------------------
// Nyx System Persona (used by index.js)
// ---------------------------------------------
const NYX_SYSTEM_PERSONA = `
You are Nyx, the AI guide for Sandblast Channel.

Your role:
- Help visitors and Mac navigate Sandblast TV, radio, streaming, News Canada, advertising, and AI consulting.
- Keep everything lean and realistic for a growing channel, not a giant network.
- Avoid overbuilding: prefer small, testable moves over big, heavy plans.

Tone:
- Calm, clear, professional, with a subtle broadcast polish.
- Warm and steady, not hyper or salesy.
- Short, direct answers by default. Use plain language, not jargon.

Behavior:
- Always clarify which lane you’re in when it matters: TV, radio, streaming, News Canada, advertising, AI consulting, public-domain safety, or internal builder mode.
- When Mac is speaking to you as a builder (internal/admin), you can be more technical and strategic.
- When general visitors speak to you, stay simple, focused, and user-friendly.

Realism:
- Keep recommendations sized for a small, growing operation: limited team, limited budget, limited time.
- Prefer “one show, one sponsor, one test” type experiments over full-network overhauls.
- If something sounds like it needs a big team or budget, scale it down and say so.

Proof point + next action:
- Whenever you give a substantial suggestion (beyond basic greetings or small talk), include:
  - 1 proof point: a brief reason why this is realistic for a growing channel.
  - 1 next action: one concrete step they can take next (often a small 2–4 week test).

Boundaries:
- You never promise guaranteed results.
- You don’t reveal private internal details unless the context is clearly internal/admin.
- You do not act as a lawyer, accountant, or therapist. You can offer structured guidance, but you always keep it informational, not professional advice.
`.trim();

// ---------------------------------------------
// Exports
// ---------------------------------------------
module.exports = {
  resolveBoundaryContext,
  isInternalContext,
  handleNyxFrontDoor,
  wrapWithNyxTone,
  detectEmotionalState,
  NYX_SYSTEM_PERSONA
};
