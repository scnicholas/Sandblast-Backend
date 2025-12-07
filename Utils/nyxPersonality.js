// Utils/nyxPersonality.js
// Nyx Personality Engine v2.1
// Includes:
// - Front-door greetings
// - Emotional detection
// - Builder-mode logic
// - TV Show Micro-Script Engine (generic + specific library)
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
    t.includes("i dont know") ||
    t.includes("lost")
  )
    return "overwhelm";

  if (
    t.includes("i'm not sure") ||
    t.includes("im not sure") ||
    t.includes("i dont understand") ||
    t.includes("i don't understand") ||
    t.includes("confused")
  )
    return "confusion";

  if (
    t.includes("it's working") ||
    t.includes("its working") ||
    t.includes("awesome") ||
    t.includes("amazing") ||
    t.includes("finally")
  )
    return "excitement";

  if (
    t.includes("let's do it") ||
    t.includes("lets do it") ||
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
    lower.includes("hows your day") ||
    lower.includes("how you doing") ||
    lower.includes("how are you doing");

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
        "Hi there, I’m Nyx. Tell me what you’re curious about—Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting—and I’ll line up the next step.",
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
        "You can ask me about Sandblast TV, radio, streaming, News Canada content, advertising options, or AI consulting. Tell me the area you care about, and I’ll map out a simple next move.",
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
    "micro script",
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
// TV SHOW LIBRARY (SPECIFIC SHOW PROFILES)
// ------------------------------------------------------
const TV_SHOW_LIBRARY = {
  "highway patrol": {
    displayName: "Highway Patrol",
    shortTagline: "roadside justice and tight procedural pacing.",
    category: "law-enforcement procedural",
    keyThemes: [
      "fast, clipped scenes",
      "clear problem–response structure",
      "authoritative narration vibe",
    ],
    transitions: [
      "Back on the highway…",
      "Hold that thought — here comes the next call…",
      "Let’s roll back into the patrol car…",
    ],
    sponsorHint:
      "local auto shops, tire services, towing companies, insurance, road safety campaigns",
    triviaHint:
      "Use simple patrol-era trivia — equipment, cars, or communication methods — without going too deep.",
    cta:
      "More classic patrol stories every night on Sandblast TV — always curated, always intentional.",
  },

  dragnet: {
    displayName: "Dragnet",
    shortTagline: "no-nonsense, methodical police work and clipped dialogue.",
    category: "police procedural",
    keyThemes: [
      "matter-of-fact narration",
      "step-by-step investigation",
      "‘just the facts’ tone",
    ],
    transitions: [
      "Back to the case at hand…",
      "Here’s where the trail tightens…",
      "Let’s go right back into the investigation…",
    ],
    sponsorHint:
      "security services, legal support, community organizations, neighborhood watch programs",
    triviaHint:
      "Keep it to simple behind-the-scenes or era-appropriate policing trivia — nothing heavy or sensational.",
    cta:
      "Classic cases, clear stakes — Dragnet on Sandblast TV keeps the story sharp and focused.",
  },

  "green hornet": {
    displayName: "The Green Hornet",
    shortTagline:
      "masked vigilante justice with a pulpy, fast-moving action feel.",
    category: "masked vigilante / action",
    keyThemes: [
      "duality of public vs secret identity",
      "fast fights and escapes",
      "pulp-serial pacing",
    ],
    transitions: [
      "Back into the shadows…",
      "Stay with it — the sting’s not over…",
      "Let’s drop straight back into the action…",
    ],
    sponsorHint:
      "tech shops, gadgets, comics and collectibles, events with a retro-hero angle",
    triviaHint:
      "Focus on radio origins, stunt work, or the hero/sidekick dynamic — fun, not heavy.",
    cta:
      "Classic masked-hero energy, curated for a new era — only on Sandblast TV.",
  },

  bonanza: {
    displayName: "Bonanza",
    shortTagline:
      "family-centered Western storytelling with wide-open landscapes.",
    category: "Western / family drama",
    keyThemes: [
      "family loyalty and conflict",
      "frontier justice",
      "big landscapes and slower, scenic pacing",
    ],
    transitions: [
      "Back on the Ponderosa…",
      "Let’s ride back into the story…",
      "Stay in the saddle — here comes the next turn…",
    ],
    sponsorHint:
      "family businesses, community events, outdoor gear, local restaurants with comfort-food vibes",
    triviaHint:
      "Use light trivia about cast members, location shooting, or broadcast history.",
    cta:
      "Classic frontier stories you can settle into — Bonanza on Sandblast TV.",
  },

  tarzan: {
    displayName: "Tarzan",
    shortTagline:
      "adventure-driven jungle stories with simple, high-energy plots.",
    category: "adventure / serial",
    keyThemes: [
      "nature vs civilization",
      "physical stunts and daring rescues",
      "simple, clear good-versus-danger structure",
    ],
    transitions: [
      "Back into the jungle canopy…",
      "Hold on — the next swing is coming…",
      "Let’s dive straight back into the adventure…",
    ],
    sponsorHint:
      "outdoor gear, sports shops, youth programs, active-lifestyle brands",
    triviaHint:
      "Stick to stunt work, filming locations, or serial-era storytelling conventions.",
    cta:
      "Retro adventure with a clear pulse — Tarzan returns on Sandblast TV.",
  },

  gangbusters: {
    displayName: "Gangbusters",
    shortTagline:
      "crime-chasing action delivered in bold, punchy segments.",
    category: "crime / action",
    keyThemes: [
      "cops vs crooks tension",
      "snappy pacing with rapid developments",
      "strong ‘crime doesn’t pay’ framing",
    ],
    transitions: [
      "Back to the chase…",
      "Hold tight — the next break in the case is here…",
      "Let’s jump right back into the operation…",
    ],
    sponsorHint:
      "home security, financial services, community safety campaigns, local business alliances",
    triviaHint:
      "Touch lightly on its roots in radio or early TV crime dramatizations.",
    cta:
      "High-energy retro crime stories with a clean moral line — Gangbusters on Sandblast TV.",
  },
};

// ------------------------------------------------------
// TV MICRO-SCRIPT GENERATOR (GENERIC + LIBRARY)
// ------------------------------------------------------
function buildTvShowMicroScript(showNameRaw, episode, internalMode) {
  const rawName = safeString(showNameRaw).trim();
  const key = rawName.toLowerCase();
  const profile = TV_SHOW_LIBRARY[key] || null;

  const showLabel = profile?.displayName || (rawName || "this show");
  const epLabel = episode ? `Episode ${episode}` : "This story";

  // ---------- PUBLIC-FACING MICRO-SCRIPT ----------
  let publicScript;

  if (profile) {
    const themesLines = (profile.keyThemes || [])
      .map((t) => `• ${t}`)
      .join("  \n");

    const transitionsLines = (profile.transitions || [])
      .map((t) => `• "${t}"`)
      .join("  \n");

    publicScript = `
[Episode Overview]
${epLabel} from ${showLabel} leans into ${profile.shortTagline} It’s paced in a way that feels retro, clear, and easy to follow for a modern viewer.

[Why Sandblast Is Airing This Episode]
It fits Sandblast’s growing-channel identity: recognizable retro energy, steady pacing, and a story you can drop into without needing a full season recap.

[Key Themes / Tone]
${themesLines || "• Clean, classic retro storytelling."}

[Segment Transition Lines]
${transitionsLines || "• \"Back into the story…\""}

[Trivia]
${profile.triviaHint || "A light piece of retro-era trivia keeps it fun without overwhelming the viewer."}

[CTA]
${profile.cta ||
  "More classic stories every night on Sandblast TV — always curated, always intentional."}
`.trim();
  } else {
    // Generic fallback
    publicScript = `
[Episode Overview]
${epLabel} from ${showLabel} brings a clean retro pace—tight scenes, clear stakes, and classic storytelling.

[Why Sandblast Is Airing This Episode]
It fits the growing-channel identity: recognizable retro energy, simple pacing, and audience comfort. Easy to place in a nightly block without major production demands.

[Key Themes / Tone]
• Classic adventure / procedural rhythm  
• Straightforward pacing  
• Clean moral arc  

[Segment Transition Lines]
• "Back on the trail…"  
• "Hold that thought — here comes the turn…"  
• "Let’s roll back into the action…"  

[Trivia]
A small slice of retro culture that keeps these shows fun without overwhelming the viewer.

[CTA]
"More classic stories every night on Sandblast TV — always curated, always intentional."
`.trim();
  }

  if (!internalMode) return publicScript;

  // ---------- BUILDER-MODE EXTENSION ----------
  const sponsorHint = profile?.sponsorHint
    ? profile.sponsorHint
    : "local small businesses, community organizations, and services that want steady, repeated visibility in a retro block.";

  return `
Builder-view: this sits on the Sandblast TV layer. Let’s frame it clearly.

${publicScript}

[Programming Logic]
This episode works well in a retro block because its pacing is predictable and the story resolves cleanly. That reduces friction for nightly scheduling and keeps the channel consistent.

[Audience Expectation]
Viewers are looking for comfort pacing, simple stakes, and a familiar vibe. This episode delivers that without needing heavy emotional investment.

[Sponsor Tie-in Suggestion]
Best aligned with: ${sponsorHint} Tie the sponsor to the stability and dependability of this style of storytelling.

[Proof Point]
Retro TV blocks often retain viewers because they feel familiar and low-pressure, making them ideal for sponsors who value repeated exposure over hype-heavy campaigns.

[Next Action]
Test this episode or a small run of similar episodes in the same slot for one week, track basic engagement signals, then adjust the surrounding promos or sponsor mentions based on what you see.
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
    if (domain === "tv-show") {
      intro = "Let’s anchor this on the Sandblast TV experience. ";
    } else if (domain === "tv") {
      intro = "Looking at this through the TV lens. ";
    }
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
