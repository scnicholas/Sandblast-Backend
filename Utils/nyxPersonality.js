// Utils/nyxPersonality.js
// Nyx Personality Engine v2.0
// Includes:
// - Front-door greetings
// - Emotional detection
// - Builder-mode logic
// - TV Show Micro-Script Engine (Phase 3)
// - Domain routing expansion
// - B3 tone wrapper + B4 session continuity

// ------------------------------------------------------
// Helper: Safe string
// ------------------------------------------------------
function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

// ------------------------------------------------------
// Boundary / Context Resolution
// ------------------------------------------------------
function resolveBoundaryContext({ actorName, channel, persona } = {}) {
  const actor = safeString(actorName || "Guest").trim() || "Guest";
  const normalizedChannel = safeString(channel || "public")
    .trim()
    .toLowerCase();
  const personaId = safeString(persona || "nyx").trim().toLowerCase();

  let role = "public";
  if (normalizedChannel === "internal") role = "internal";
  else if (normalizedChannel === "admin") role = "admin";

  let boundaryDescription = "";
  if (role === "public") {
    boundaryDescription =
      "General visitors. Nyx responds with public-facing guidance about Sandblast TV, radio, streaming, News Canada, advertising, and AI consulting. No internal or confidential details.";
  } else if (role === "internal") {
    boundaryDescription =
      "Internal builder mode. Nyx behaves like an operations and strategy partner for Sandblast: programming logic, TV/radio scheduling, streaming flow, News Canada alignment, backend UX, and monetization.";
  } else {
    boundaryDescription =
      "Admin mode. Nyx focuses on operational precision for Sandblast infrastructure.";
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

// ------------------------------------------------------
// Emotional State Detection
// ------------------------------------------------------
function detectEmotionalState(text) {
  const t = safeString(text).trim().toLowerCase();
  if (!t) return "neutral";

  if (
    t.includes("error") ||
    t.includes("not working") ||
    t.includes("broken") ||
    t.includes("still no") ||
    t.includes("annoying")
  )
    return "frustration";

  if (
    t.includes("overwhelmed") ||
    t.includes("too much") ||
    t.includes("i don't know") ||
    t.includes("lost")
  )
    return "overwhelm";

  if (
    t.includes("i'm not sure") ||
    t.includes("i dont understand") ||
    t.includes("confused")
  )
    return "confusion";

  if (
    t.includes("it's working") ||
    t.includes("awesome") ||
    t.includes("amazing") ||
    t.includes("finally")
  )
    return "excitement";

  if (
    t.includes("let's do it") ||
    t.includes("move to") ||
    t.includes("next step")
  )
    return "confidence";

  if (
    t.startsWith("how ") ||
    t.startsWith("what ") ||
    t.includes("can you explain")
  )
    return "curiosity";

  return "neutral";
}

// ------------------------------------------------------
// FRONT-DOOR: GREETINGS + SMALL TALK
// ------------------------------------------------------
function handleNyxFrontDoor(userMessage) {
  const raw = safeString(userMessage).trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hey, I’m Nyx. I’ll help you navigate Sandblast—TV, radio, streaming, News Canada, advertising, and AI consulting. What are you looking at today?",
    };
  }

  const isGreeting =
    /^(hi|hello|hey|yo|good (morning|afternoon|evening)|greetings)\b/.test(
      lower
    ) ||
    lower === "nyx" ||
    lower === "nix" ||
    lower === "hello nyx" ||
    lower === "hello nix" ||
    lower === "hi nyx" ||
    lower === "hi nix";

  const asksWho =
    lower.includes("who are you") ||
    lower.includes("what is nyx") ||
    lower.includes("what is nix") ||
    lower.includes("what do you do");

  const asksHow =
    lower.includes("how are you") ||
    lower.includes("how's your day") ||
    lower.includes("how you doing");

  const isThanks =
    lower.includes("thank") ||
    lower === "thanks nyx" ||
    lower === "thanks nix";

  const asksHelp =
    lower === "help" ||
    lower === "help nyx" ||
    lower === "help nix" ||
    lower.includes("how do i use this");

  if (asksWho) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "I’m Nyx, Sandblast’s AI guide. I help you make sense of the TV lineup, radio, streaming, News Canada, advertising, and AI consulting—always giving you the next clear step.",
    };
  }

  if (isGreeting && asksHow) {
    return {
      intent: "small_talk",
      category: "public",
      domain: "general",
      message:
        "I’m good—steady and online. How are you doing today, and what do you want to tune in on—TV, radio, streaming, News Canada, advertising, or AI consulting?",
    };
  }

  if (isGreeting) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hi there, I’m Nyx. Tell me what you’re curious about—TV, radio, streaming, News Canada, advertising, or AI consulting—and I’ll line up the next step.",
    };
  }

  if (asksHow) {
    return {
      intent: "small_talk",
      category: "public",
      domain: "general",
      message:
        "I’m running clear—no static on my side. How are you, and what do you want to work on with Sandblast right now?",
    };
  }

  if (isThanks) {
    return {
      intent: "polite_closure",
      category: "public",
      domain: "general",
      message:
        "You’re welcome. If there’s a next piece—TV, radio, streaming, News Canada, or a business idea—I can walk you through it.",
    };
  }

  if (asksHelp) {
    return {
      intent: "usage_help",
      category: "public",
      domain: "general",
      message:
        "You can ask me about TV, radio, streaming, News Canada content, advertising, or AI consulting. Tell me the area you care about and I’ll map out a simple next move.",
    };
  }

  return null;
}

// ------------------------------------------------------
// DOMAIN MATCHER → Detect TV-show micro-script intent
// ------------------------------------------------------
function detectTvShowIntent(text) {
  const lower = safeString(text).toLowerCase();

  const keywords = [
    "micro-script",
    "episode breakdown",
    "tv breakdown",
    "prepare episode",
    "script for",
    "tonight’s episode",
    "tonights episode",
    "show breakdown",
  ];

  return keywords.some((k) => lower.includes(k));
}

// ------------------------------------------------------
// TV MICRO-SCRIPT GENERATOR (GENERAL TEMPLATE)
// ------------------------------------------------------
function buildTvShowMicroScript(showName, episode, internalMode) {
  const epLabel = episode ? `Episode ${episode}` : "This story";

  const publicScript = `
[Episode Overview]
${epLabel} from ${showName} brings a clean retro pace—tight scenes, clear stakes, and classic storytelling.

[Why Sandblast Is Airing This Episode]
It fits the growing-channel identity: recognizable retro energy, simple pacing, and audience comfort. Easy to place in a nightly block without major production demands.

[Key Themes / Tone]
• Classic adventure / procedural rhythm  
• Straightforward pacing  
• Clean moral arc  

[Transition Lines]
• "Back on the trail…"  
• "Hold that thought — here comes the turn…"  
• "Let’s roll back into the action…"  

[Trivia]
A small slice of retro culture that keeps these shows fun without overwhelming the viewer.

[CTA]
"More classic stories every night on Sandblast TV — always curated, always intentional."
`.trim();

  if (!internalMode) return publicScript;

  // BUILDER MODE VERSION
  return `
Builder-view: this sits on the Sandblast TV layer. Let’s frame it clearly.

${publicScript}

[Programming Logic]
This episode fits an evening retro block because it has clean pacing and requires minimal prep time. Works well for consistent nightly scheduling.

[Audience Expectation]
Light, nostalgia-driven viewers who respond to comfort pacing and predictable structure.

[Sponsor Tie-in Suggestion]
Great for local businesses, auto shops, community services, or organizations comfortable with retro Americana themes.

[Proof Point]
Channels using retro programming blocks see strong viewer retention due to predictable pacing and nostalgic appeal.

[Next Action]
Test this episode or block for one night this week and measure viewer engagement or comments across your channels.
`.trim();
}

// ------------------------------------------------------
// TONE WRAPPER (B3 + B4)
// ------------------------------------------------------
function wrapWithNyxTone(payload, userMessage, meta) {
  if (!payload || typeof payload !== "object") return payload;
  const raw = safeString(payload.message).trim();
  if (!raw) return payload;

  const domain = safeString(payload.domain || "general").toLowerCase();
  const category = safeString(payload.category || "public");
  const intent = safeString(payload.intent || "general");
  const userRaw = safeString(userMessage);

  const emotion = detectEmotionalState(userRaw);
  const isInternal = category === "internal";
  const isErrorLike = raw.toLowerCase().includes("error");

  let mirrorLine = "";
  if (emotion === "frustration") {
    mirrorLine = isInternal
      ? "I can feel the friction in that. Let’s correct the flow."
      : "I hear the frustration. Let’s slow it down and fix it cleanly.";
  } else if (emotion === "overwhelm") {
    mirrorLine = isInternal
      ? "Feels heavy. Let’s shrink it into one clear decision."
      : "No pressure. We’ll take this piece by piece.";
  } else if (emotion === "confusion") {
    mirrorLine = isInternal
      ? "The hesitation makes sense. I’ll reframe it."
      : "That uncertainty is understandable. Let me clarify.";
  } else if (emotion === "excitement") {
    mirrorLine = isInternal
      ? "Good momentum. Let’s channel it."
      : "I feel the spark. Let’s build on it.";
  }

  let intro = "";
  if (isInternal) {
    intro = `Builder-view: this sits on the ${domainLabel(domain)} layer. `;
  } else {
    if (domain === "tv-show") intro = "Let’s anchor this on the Sandblast TV experience. ";
    else if (domain === "tv") intro = "Looking at this through the TV lens. ";
  }

  const combined = `${mirrorLine} ${intro} ${raw}`.trim();

  const withNextStep =
    isErrorLike || combined.length > 700
      ? combined
      : combined +
        `\n\nNext action: tell me the next show, episode, or lane you want to refine.`;

  return {
    ...payload,
    message: withNextStep,
  };
}

function domainLabel(domain) {
  switch (domain) {
    case "tv-show":
    case "tv":
      return "Sandblast TV";
    case "radio":
      return "Sandblast Radio";
    case "news_canada":
      return "News Canada";
    case "consulting":
      return "AI consulting";
    default:
      return "Sandblast";
  }
}

// ------------------------------------------------------
// EXPORTS
// ------------------------------------------------------
module.exports = {
  resolveBoundaryContext,
  isInternalContext,
  handleNyxFrontDoor,
  detectEmotionalState,
  detectTvShowIntent,
  buildTvShowMicroScript,
  wrapWithNyxTone,
};
