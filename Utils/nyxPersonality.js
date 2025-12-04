// Utils/nyxPersonality.js
// Nyx boundaries, front-door handling, and tone wrapping

// ---------------------------------------------
// Utility: safe string
// ---------------------------------------------
function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

// ---------------------------------------------
// Boundary / Role Resolution
// ---------------------------------------------
//
// We keep this simple but expandable:
// - channel: "public" | "admin" | "internal"
// - actorName: lets you treat Mac/admin differently later if you want
//

function resolveBoundaryContext({ actorName, channel, persona } = {}) {
  const cleanActor = safeString(actorName || "Guest").trim() || "Guest";
  const cleanChannel = safeString(channel || "public").toLowerCase();
  const cleanPersona = safeString(persona || "nyx").toLowerCase();

  let role = "public";
  let boundaryKey = "public";

  if (cleanChannel === "internal") {
    role = "internal";
    boundaryKey = "internal";
  } else if (cleanChannel === "admin") {
    role = "admin";
    boundaryKey = "internal"; // admin is allowed internal-style answers
  } else {
    role = "public";
    boundaryKey = "public";
  }

  const boundary = buildBoundaryDescription(boundaryKey, cleanPersona);

  return {
    actor: cleanActor,
    role,
    persona: cleanPersona,
    boundary,
  };
}

function buildBoundaryDescription(boundaryKey, persona) {
  const isNyx = persona === "nyx";

  if (boundaryKey === "internal") {
    return {
      key: "internal",
      description: isNyx
        ? "Internal mode. Nyx can speak candidly about operations, planning, debugging, and strategy, but still avoids exposing secrets like API keys or passwords."
        : "Internal mode. This assistant speaks more directly about operations and strategy.",
    };
  }

  return {
    key: "public",
    description: isNyx
      ? "General visitors. Nyx responds with public-facing guidance about Sandblast TV, radio, streaming, News Canada, advertising, and AI consulting. No internal details or admin capabilities."
      : "General visitors. This assistant responds with public-facing guidance only.",
  };
}

function isInternalContext(boundaryContext) {
  if (!boundaryContext) return false;
  const role = safeString(boundaryContext.role).toLowerCase();
  return role === "internal" || role === "admin";
}

// ---------------------------------------------
// Front Door: greetings, “who are you”, etc.
// ---------------------------------------------
//
// If this returns a payload, index.js sends it immediately as source: "front_door"
// If it returns null, the request falls through to the core logic.
// ---------------------------------------------

function handleNyxFrontDoor(userMessage) {
  const text = safeString(userMessage).trim();
  if (!text) return null;

  const lower = text.toLowerCase();

  const isGreeting =
    lower === "hi" ||
    lower === "hello" ||
    lower === "hey" ||
    lower.startsWith("hi ") ||
    lower.startsWith("hello ") ||
    lower.startsWith("hey ");

  const asksWhoNyxIs =
    lower.includes("who are you") ||
    lower.includes("what are you") ||
    lower.includes("what is nyx") ||
    lower.includes("who is nyx");

  const asksWhatCanYouDo =
    lower.includes("what can you do") ||
    lower.includes("how can you help") ||
    lower.includes("what do you do");

  // Simple greeting
  if (isGreeting && !asksWhoNyxIs && !asksWhatCanYouDo) {
    return {
      intent: "welcome",
      category: "welcome",
      echo: text,
      message:
        "Hi there. I’m Nyx, your Sandblast guide. Ask me about TV, radio, streaming, News Canada, advertising, or how we use AI to help businesses grow.",
    };
  }

  // Who/what is Nyx?
  if (asksWhoNyxIs) {
    return {
      intent: "about_nyx",
      category: "welcome",
      echo: text,
      message:
        "I’m Nyx, the AI brain for Sandblast. My job is to help you move through Sandblast TV, radio, streaming, News Canada, advertising, and AI consulting without friction. I translate the complex parts into straight, usable answers.",
    };
  }

  // What can you do?
  if (asksWhatCanYouDo) {
    return {
      intent: "capabilities",
      category: "welcome",
      echo: text,
      message:
        "I can explain what’s happening across Sandblast TV, radio, and streaming, walk you through News Canada content, outline advertising options, and show you where AI fits into your business. Ask me something specific and I’ll keep it clear and practical.",
    };
  }

  // No front-door shortcut
  return null;
}

// ---------------------------------------------
// Tone Wrapper: Nyx voice by domain + category
// ---------------------------------------------
//
// Input: payload from core logic,
//   e.g. { intent, category, message, domain? }
// Output: same shape, but message is wrapped
// in a consistent Nyx voice.
// ---------------------------------------------

function inferDomainFromIntent(intentRaw) {
  const intent = safeString(intentRaw).toLowerCase();

  if (intent.includes("tv")) return "tv";
  if (intent.includes("radio")) return "radio";
  if (intent.includes("news")) return "news_canada";
  if (intent.includes("consult")) return "consulting";
  if (intent.includes("pd")) return "public_domain";
  if (intent.includes("internal")) return "internal";

  return "general";
}

function wrapWithNyxTone(corePayload, userMessage) {
  if (!corePayload || typeof corePayload !== "object") {
    return {
      intent: "general",
      category: "public",
      message:
        "I’m online, but I received an empty response from the logic layer. Try asking about TV, radio, streaming, News Canada, advertising, or AI consulting.",
    };
  }

  const originalMessage = safeString(corePayload.message);
  const category = safeString(corePayload.category || "public").toLowerCase();
  const intent = safeString(corePayload.intent || "general");
  const domain =
    safeString(corePayload.domain) || inferDomainFromIntent(intent);

  // If the core already returned a strongly Nyx-shaped welcome, don’t over-wrap it.
  if (intent === "welcome" && category === "welcome") {
    return {
      ...corePayload,
      message: originalMessage,
    };
  }

  let prefix = "";
  let suffix = "";

  const isInternal = category === "internal";

  // Domain-specific framing
  switch (domain) {
    case "tv":
      prefix = isInternal
        ? "Let’s look at this from the Sandblast TV side, internally."
        : "Let me walk you through this from the Sandblast TV side.";
      break;

    case "radio":
      prefix = isInternal
        ? "This sits on the radio / live audio side of Sandblast, behind the scenes."
        : "This touches the Sandblast radio and live audio side.";
      break;

    case "news_canada":
      prefix = isInternal
        ? "This is tied to News Canada content inside the Sandblast ecosystem."
        : "This connects into the News Canada content you’ll see across Sandblast.";
      break;

    case "consulting":
      prefix = isInternal
        ? "This is in the AI consulting lane, where we shape offers, systems, and messaging."
        : "This is in the AI consulting lane—how we use AI to support real businesses.";
      break;

    case "public_domain":
      prefix = isInternal
        ? "This is a public-domain / rights-check question from the Sandblast PD Watchdog angle."
        : "This is about public-domain content and how Sandblast keeps things clean and compliant.";
      break;

    case "internal":
      prefix =
        "You’re in internal mode, so I’ll keep this direct and practical.";
      break;

    default:
      prefix = isInternal
        ? "I’ll give you a clean, internal view of this."
        : "I’ll keep this simple and focused so it’s easy to act on.";
      break;
  }

  // Subtle suffix for clarity (only in public mode so we don’t clutter internal)
  if (!isInternal) {
    suffix =
      "\n\nIf you want to zoom in further—TV, radio, News Canada, ads, or AI consulting—just say which lane you care about and I’ll narrow it down.";
  }

  const wrappedMessage = [prefix, originalMessage, suffix]
    .filter((part) => part && part.trim())
    .join("\n\n");

  return {
    ...corePayload,
    message: wrappedMessage,
  };
}

module.exports = {
  resolveBoundaryContext,
  isInternalContext,
  handleNyxFrontDoor,
  wrapWithNyxTone,
};
