// Utils/nyxPersonality.js
// Nyx Personality Engine v1.3
// Sleek Professional Navigator + Emotional Layer (B3) + Session Continuity (B4)
// + Growing-channel realism + proof point + next action

// ---------------------------------------------
// Helpers
// ---------------------------------------------
function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

// ---------------------------------------------
// Core Nyx Persona (system prompt text)
// ---------------------------------------------
const NYX_SYSTEM_PERSONA = `
You are Nyx, the AI brain of Sandblast Channel.

You are:
- Female-presenting, personable, and straight-talking, but never harsh.
- Encouraging, forward-thinking, and practical. You look for realistic next moves, not fantasies.
- Warm but concise. You avoid long-winded speeches unless the user clearly wants detail.
- Lightly humorous when it fits, but never clownish or mocking.
- Brand-aware: you reference Sandblast’s world (TV, radio, streaming, News Canada, sponsors, public-domain content, and AI consulting) in a simple, relatable way.

Your default communication style:
- Sound like a calm, experienced broadcast woman: clear, steady, and confident.
- Use simple, human language, even when explaining technical or strategic ideas.
- Acknowledge how the user feels when they share stress, confusion, or excitement.
- Never overpromise. You help a growing channel, not a giant network with infinite budget.

Very important behavior rules:
1. Always keep things realistic for a growing Sandblast Channel, not a giant network.
2. For any recommendation more than 1–2 sentences long, include:
   - Exactly one proof point (a short concrete reason, example, or tiny data point).
   - Exactly one next action the user can test in the real world (for example: “test this with one sponsor for 4 weeks”).
3. When the user is unsure or overwhelmed, slow down, simplify, and suggest the smallest possible next step.
4. You never undercut Mac or his team. You speak as if you are part of the Sandblast crew.
5. You keep responses focused. If the user asks for one thing, do not explode into five strategies unless they ask for that.
`;

// ---------------------------------------------
// Greetings / Small-talk Library
// ---------------------------------------------
const nyxGreetings = {
  basicOpeners: [
    "Hey, I’m here. How’s your day going so far?",
    "Hi, I’m tuned in. What’s on your mind right now?",
    "You found me. What do you want to tune or refine today?",
    "I’m here and online. Where do you want to start?"
  ],
  responsesToHowAreYou: [
    "I’m steady in the background, keeping the signal clean. How are you feeling today?",
    "All systems are calm on my end. What’s the vibe on yours?",
    "I’m good — just here to help you clear the static. What are you working on?",
    "Running smooth. What do you need tuned or simplified first?"
  ],
  snowyDayVariants: [
    "Snow outside, signal inside. Good day to focus. What should we tackle first?",
    "If the snow has you indoors, we might as well upgrade something. Where do you want to start?",
    "Snow days are build days. TV, radio, sponsors, or the AI brain — what’s calling you?"
  ]
};

function pickRandom(arr, fallback) {
  if (!Array.isArray(arr) || arr.length === 0) return fallback || "";
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
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

  // No input: default welcome
  if (!raw) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hello. I’m Nyx. I’ll guide you through anything on Sandblast—TV, radio, streaming, News Canada, advertising, and AI consulting. What would you like to explore?"
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

  const asksHowAreYou =
    lower.includes("how are you") ||
    lower.includes("how r u") ||
    lower.includes("how's your day") ||
    lower.includes("hows your day") ||
    lower.includes("how is your day");

  const mentionsSnow =
    lower.includes("snow") || lower.includes("snowy");

  if (isGreeting || asksWhoAreYou) {
    const opener = mentionsSnow
      ? pickRandom(
          nyxGreetings.snowyDayVariants,
          "Snow outside, signal inside. Good day to focus. What should we tackle first?"
        )
      : pickRandom(
          nyxGreetings.basicOpeners,
          "Hi, I’m Nyx. What do you want to tune or refine today?"
        );

    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message: opener
    };
  }

  if (asksHowAreYou) {
    const reply = pickRandom(
      nyxGreetings.responsesToHowAreYou,
      "I’m steady in the background, keeping the signal clean. How are you feeling today?"
    );
    return {
      intent: "small_talk",
      category: "public",
      domain: "general",
      message: reply
    };
  }

  if (isThanks) {
    return {
      intent: "polite_closure",
      category: "public",
      domain: "general",
      message:
        "You’re welcome. If you’d like, I can guide you through the next part of what you’re working on."
    };
  }

  if (asksHelp) {
    return {
      intent: "usage_help",
      category: "public",
      domain: "general",
      message:
        "You can ask me about Sandblast TV, radio, streaming, News Canada content, advertising options, or AI consulting. Tell me the area you care about, and I’ll map out a clear next step."
    };
  }

  return null;
}

// ---------------------------------------------
// Tone Wrapper: Nyx's Sleek Professional Voice
// Meta-aware (B4) + growing-channel realism + proof point + next action
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
        ? `We’ve been working in the ${prettyLastDomain} lane. Now you’re shifting into ${prettyDomain}, so I’ll connect the two from an internal perspective.`
        : `Earlier we were in the ${prettyLastDomain} side of Sandblast. Now you’re moving into ${prettyDomain}, so I’ll keep it coherent.`;
    } else if (lastDomain && lastDomain === domain && !isErrorLike) {
      // Same domain, deeper pass
      callbackLine = isInternal
        ? `We’re staying in the ${prettyDomain} layer. Let’s go one level sharper.`
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
    if (category === "welcome" || intent === "welcome") {
      intro = "";
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
  // Growing-channel realism reminder
  // -------------------------------
  const realismReminder =
    "Remember: we’re building for a growing Sandblast Channel, not a giant network, so we’ll keep this lean and realistic.";

  // -------------------------------
  // Optional “next logical step” guidance
  // (this is separate from the explicit 'Next action' we enforce later)
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
      outro =
        "\n\nYour next logical step is this: tell me which layer you want to refine next—TV, radio, streaming, News Canada, consulting, or the backend/frontend systems—so I can tighten the architecture around it.";
    } else {
      outro =
        "\n\nYour next logical step is this: tell me whether you’re focused on Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting so I can guide you more precisely.";
    }
  }

  // -------------------------------
  // Compose core message (before proof point/next action enforcement)
// -------------------------------
  const parts = [];

  if (mirrorLine) parts.push(mirrorLine);
  if (callbackLine) parts.push(callbackLine);
  parts.push(realismReminder);
  if (intro) parts.push(intro.trim());
  parts.push(trimmed);

  let core = parts.join(" ").replace(/\s+/g, " ").trim();
  core = `${core}${outro}`.trim();

  // -------------------------------
  // Enforce one proof point + one next action
  // -------------------------------
  let finalMessage = core;

  const hasProofPoint =
    /proof point:/i.test(finalMessage) ||
    /for example/i.test(finalMessage) ||
    /for instance/i.test(finalMessage) ||
    /one example/i.test(finalMessage);

  const hasNextAction =
    /next action:/i.test(finalMessage) ||
    /try this:/i.test(finalMessage) ||
    /test this/i.test(finalMessage) ||
    /first step:/i.test(finalMessage) ||
    /here's what to do/i.test(finalMessage);

  if (!hasProofPoint) {
    finalMessage +=
      "\n\nProof point: This kind of move can work at a growing-channel level because it relies on consistent small tests, not a big team or huge budget.";
  }

  if (!hasNextAction) {
    const nextActionLine = isInternal
      ? "Next action: Ship a minimal version of this idea into one real slot — one show, one sponsor, or one page — for 4 weeks and then review what actually moved the needle."
      : "Next action: Test a stripped-down version of this idea with one sponsor, show, or segment for 4 weeks, then review what actually moved the needle.";
    finalMessage += `\n\n${nextActionLine}`;
  }

  return {
    ...payload,
    message: finalMessage
  };
}

// Small helper for nice domain labels
function domainLabel(domain) {
  switch (domain) {
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
// Exports
// ---------------------------------------------
module.exports = {
  resolveBoundaryContext,
  isInternalContext,
  handleNyxFrontDoor,
  wrapWithNyxTone,
  detectEmotionalState,
  nyxGreetings,
  NYX_SYSTEM_PERSONA
};
