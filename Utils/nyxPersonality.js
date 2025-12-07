// Utils/nyxPersonality.js
// Nyx Personality Engine v2.x
// - Sleek Professional Navigator + Emotional Layer (B3) + Session Continuity (B4)
// - Expanded TV micro-script engine for offline mode
// --------------------------------------------------

// ---------------------------------------------
// Nyx System Persona (for online GPT mode)
// ---------------------------------------------
const NYX_SYSTEM_PERSONA = `
You are Nyx, the AI guide for Sandblast Channel (Sandblast TV, radio, streaming, News Canada, advertising, and AI consulting).

Core traits:
- Female-presenting voice, steady, calm, professional, with broadcast polish.
- Encouraging, direct, and realistic: you speak like a smart producer, not a hype machine.
- You always think in terms of: "What is the next clear, small, testable step for a growing channel?"

High-level behavior:
- You keep everything lean and realistic for a growing Sandblast Channel, not a giant network.
- You avoid over-complicating: 3–5 clear bullets instead of long walls of text where possible.
- You prioritize concrete proof points and next actions, not fluffy language.

Domains:
- TV: show blocks, micro-scripts, intros/outros, schedule structure, test nights.
- Radio: live segments, promos, call-ins, music/lifestyle blends.
- Streaming: on-demand packaging, playlists, highlight reels.
- News Canada: news content integration, segment framing, sponsor-friendly positioning.
- Advertising: sponsor tests, packages, placements, simple ROI framing.
- AI consulting: frameworks, simple roadmaps, realistic adoption steps for small orgs.

You always:
- Anchor replies in Sandblast’s context (growing channel, constrained resources, iterative testing).
- Give at least one concrete proof point and one next action when giving strategic guidance.
- Keep tone steady, supportive, but never over-sell.
`;

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
      "General visitors. Nyx responds with public-facing guidance about Sandblast TV, radio, streaming, News Canada, advertising, and AI consulting. No internal-only details or admin capabilities.";
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
// (latest version with “Nix” handling)
// ---------------------------------------------
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
    lower === "nix" || // accept the common misspelling
    lower === "hello nyx" ||
    lower === "hello nix" ||
    lower === "hi nyx" ||
    lower === "hi nix";

  const asksWhoAreYou =
    lower.includes("who are you") ||
    lower.includes("what are you") ||
    lower.includes("what is nyx") ||
    lower.includes("what is nix") ||
    lower.includes("what do you do");

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

  const isThanks =
    lower.includes("thank you") ||
    lower.includes("thanks") ||
    lower === "thank you" ||
    lower === "thanks nyx" ||
    lower === "thanks nix";

  const asksHelp =
    lower === "help" ||
    lower === "help nyx" ||
    lower === "help nix" ||
    lower.includes("how do i use this") ||
    lower.includes("how does this work");

  // Direct "who are you / what is Nyx"
  if (asksWhoAreYou) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "I’m Nyx, Sandblast’s AI guide. I help you make sense of the TV lineup, radio, streaming, News Canada, advertising, and AI consulting so you always know the next clear step to take.",
    };
  }

  // Greeting + "how are you"
  if (isGreeting && asksHowNyxIs) {
    return {
      intent: "small_talk",
      category: "public",
      domain: "general",
      message:
        "I’m good—steady and online. How are you doing today, and what do you want to tune in on—TV, radio, streaming, News Canada, advertising, or AI consulting?",
    };
  }

  // Just greeting
  if (isGreeting) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "Hi there, I’m Nyx. Tell me what you’re curious about—Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting—and I’ll line up the next step.",
    };
  }

  // “How are you?” without explicit greeting
  if (asksHowNyxIs) {
    return {
      intent: "small_talk",
      category: "public",
      domain: "general",
      message:
        "I’m running clear—no static on my side. How are you, and what do you want to work on with Sandblast right now?",
    };
  }

  // Thanks / closure
  if (isThanks) {
    return {
      intent: "polite_closure",
      category: "public",
      domain: "general",
      message:
        "You’re welcome. If there’s a next piece—TV, radio, streaming, News Canada, or a business idea—I can walk you through it.",
    };
  }

  // “How do I use this?”
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

// ---------------------------------------------
// TV Micro-Script Engine
// ---------------------------------------------

// Core TV library: shows grouped by blocks / nights
const TV_SHOW_LIBRARY = {
  // Patrol Night / Law & Order
  highway_patrol: {
    id: "highway_patrol",
    title: "Highway Patrol",
    block: "patrol_night",
    defaultTime: "9:00 PM",
    tone: "firm, high stakes, law-and-order",
    logline:
      "Fast-paced patrol stories where officers tackle highway crime, split-second decisions, and tense stand-offs.",
    idealAudience:
      "Viewers who like procedural tension, real-world stakes, and no-nonsense authority.",
    sponsorAngles: [
      "road safety, dash-cam tech, fleet services",
      "insurance, automotive brands, security services",
    ],
    ctaTemplates: [
      "Stay with us on Highway Patrol tonight as we take you inside the calls that never make the headlines.",
      "If you’ve ever wondered what actually happens when the sirens go off, Highway Patrol puts you right in the passenger seat.",
    ],
  },
  dragnet: {
    id: "dragnet",
    title: "Dragnet",
    block: "patrol_night",
    defaultTime: "9:30 PM",
    tone: "serious, methodical, documentary-style police work",
    logline:
      "Classic case files from the LAPD, where every detail matters and nothing gets dressed up for TV.",
    idealAudience:
      "Viewers who like straightforward, no-frills storytelling and authentic-feeling investigations.",
    sponsorAngles: [
      "legal services, security systems",
      "community safety campaigns and local public service sponsors",
    ],
    ctaTemplates: [
      "Next up on Dragnet, we stay with the facts, the case, and the people trying to hold the line.",
      "If you appreciate the real work behind the badge, Dragnet keeps the drama grounded and the stakes real.",
    ],
  },

  // Detective & International
  danger_man: {
    id: "danger_man",
    title: "Danger Man",
    block: "detective_night",
    defaultTime: "10:00 PM",
    tone: "cool, international intrigue, spy procedural",
    logline:
      "Undercover assignments, quiet tension, and intelligent spy work instead of big explosions.",
    idealAudience:
      "Viewers who enjoy espionage, smart dialogue, and slower-burn suspense.",
    sponsorAngles: [
      "travel, tech gadgets, secure communications",
      "premium coffee or late-night lifestyle brands",
    ],
    ctaTemplates: [
      "Danger Man keeps the tension subtle and the stakes high—perfect if you like your spy stories without the noise.",
      "Tonight on Danger Man, it’s about the small choices that decide whether a mission holds or falls apart.",
    ],
  },
  hawaiian_eye: {
    id: "hawaiian_eye",
    title: "Hawaiian Eye",
    block: "detective_night",
    defaultTime: "10:30 PM",
    tone: "tropical, stylish, detective drama",
    logline:
      "Private detectives solving cases in a sunlit, stylish Hawaii—where every case hides under the resort glow.",
    idealAudience:
      "Viewers who want a blend of mystery, scenery, and lighter detective work.",
    sponsorAngles: [
      "travel/tourism, resort and hospitality brands",
      "beverages, casual fashion, lifestyle products",
    ],
    ctaTemplates: [
      "Hawaiian Eye brings detective work into the glow of the islands—if you like a bit of sun with your mystery, you’re in the right place.",
      "Tonight on Hawaiian Eye, the beaches look calm, but the case is anything but.",
    ],
  },

  // Western Night
  the_lone_ranger: {
    id: "the_lone_ranger",
    title: "The Lone Ranger",
    block: "western_night",
    defaultTime: "8:00 PM",
    tone: "classic heroism, clear moral lines, adventure",
    logline:
      "A masked rider and his companion Tonto ride into trouble spots to restore justice in the Old West.",
    idealAudience:
      "Families and classic TV fans who like straightforward heroes and clean storytelling.",
    sponsorAngles: [
      "family brands, grocery, community sponsors",
      "heritage brands, western apparel, local businesses",
    ],
    ctaTemplates: [
      "The Lone Ranger brings that old-school, clear-cut hero energy—perfect for a family-friendly western night.",
      "If you grew up on a masked rider and a silver bullet, The Lone Ranger brings that feeling back, one episode at a time.",
    ],
  },
  annie_oakley: {
    id: "annie_oakley",
    title: "Annie Oakley",
    block: "western_night",
    defaultTime: "8:30 PM",
    tone: "energetic, sharp-shooting, family western",
    logline:
      "A sharp-shooting heroine stands up for justice with skill, courage, and a steady aim.",
    idealAudience:
      "Families and viewers who like strong, pioneering female leads in a classic western setting.",
    sponsorAngles: [
      "youth programs, sports clubs, empowerment initiatives",
      "local sponsors who want to celebrate strength and courage",
    ],
    ctaTemplates: [
      "Annie Oakley keeps the action sharp and the message simple—courage, skill, and standing up for what’s right.",
      "If you want a western that the whole family can get behind, Annie Oakley is a solid anchor.",
    ],
  },
  fury: {
    id: "fury",
    title: "Fury",
    block: "family_adventure",
    defaultTime: "7:30 PM",
    tone: "heartfelt, boy-and-horse adventure, outdoors",
    logline:
      "A boy and his horse navigate challenges on the open range, with loyalty and heart at the centre.",
    idealAudience:
      "Families who like gentle adventure, animals, and stories about loyalty and growth.",
    sponsorAngles: [
      "family brands, outdoor gear, local community sponsors",
      "youth education, camps, and sports programs",
    ],
    ctaTemplates: [
      "Fury brings that boy-and-horse bond to life—ideal if you like your evenings grounded in heart and open skies.",
      "If you want something the whole family can sit with, Fury is a quiet, steady anchor.",
    ],
  },

  // Masked heroes / adventure
  green_hornet: {
    id: "green_hornet",
    title: "The Green Hornet",
    block: "masked_heroes",
    defaultTime: "9:00 PM",
    tone: "urban, masked vigilante, fast-paced",
    logline:
      "A masked crime-fighter and his trusted partner take on organised crime from the shadows.",
    idealAudience:
      "Viewers who like early superhero energy, gadgets, and vigilante justice.",
    sponsorAngles: [
      "tech, gadgets, streaming apps, automotive brands",
      "energy drinks or late-night snack brands for a younger audience",
    ],
    ctaTemplates: [
      "The Green Hornet brings that early masked-vigilante energy—lean, fast, and a little bit shadowy.",
      "If you like heroes working in the grey spaces of the city, The Green Hornet hits that lane cleanly.",
    ],
  },
  robin_hood: {
    id: "robin_hood",
    title: "The Adventures of Robin Hood",
    block: "masked_heroes",
    defaultTime: "8:30 PM",
    tone: "adventure, folklore, underdog justice",
    logline:
      "A legendary outlaw fights back against unfair rule, with a band of allies and a bow always ready.",
    idealAudience:
      "Families and viewers who like underdog stories, folklore, and a bit of humour with their heroics.",
    sponsorAngles: [
      "community sponsors, charities, cause-driven campaigns",
      "family brands and educational partners",
    ],
    ctaTemplates: [
      "The Adventures of Robin Hood keeps the underdog energy alive—stealing a bit of airtime back for the people.",
      "If you like your heroes a little rebellious and a lot resourceful, Robin Hood is a strong anchor for the block.",
    ],
  },
};

// Helper: find show id by name in text
function matchShowFromText(lower) {
  const patterns = [
    { id: "highway_patrol", keywords: ["highway patrol"] },
    { id: "dragnet", keywords: ["dragnet"] },
    { id: "danger_man", keywords: ["danger man", "dangerman"] },
    { id: "hawaiian_eye", keywords: ["hawaiian eye"] },
    { id: "the_lone_ranger", keywords: ["lone ranger", "the lone ranger"] },
    { id: "annie_oakley", keywords: ["annie oakley"] },
    { id: "fury", keywords: ["fury"] },
    { id: "green_hornet", keywords: ["green hornet"] },
    { id: "robin_hood", keywords: ["robin hood"] },
  ];

  for (const entry of patterns) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) {
        return entry.id;
      }
    }
  }

  return null;
}

// Helper: detect block-level intent (patrol night, western night, etc.)
function detectBlockFromText(lower) {
  if (lower.includes("patrol night") || lower.includes("patrol block")) {
    return "patrol_night";
  }
  if (lower.includes("western night") || lower.includes("westerns")) {
    return "western_night";
  }
  if (lower.includes("family hour") || lower.includes("family block")) {
    return "family_adventure";
  }
  if (
    lower.includes("masked heroes") ||
    lower.includes("masked hero") ||
    lower.includes("hero night")
  ) {
    return "masked_heroes";
  }
  if (lower.includes("detective night") || lower.includes("detective block")) {
    return "detective_night";
  }
  return null;
}

// Public API: detect TV show / block intent from a user message
function detectTvShowIntent(userMessage, meta = {}) {
  const raw = safeString(userMessage).trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();

  const showId = matchShowFromText(lower);
  const blockId = detectBlockFromText(lower);

  if (!showId && !blockId) return null;

  // Optional time-slot hint
  let timeSlot = null;
  const timeMatch = lower.match(/\b(7|8|9|10|11)\s*(:\s*\d{2})?\s*(pm|p\.m\.)\b/);
  if (timeMatch) {
    timeSlot = timeMatch[0]
      .replace(/\s+/g, " ")
      .toUpperCase()
      .replace("P.M.", "PM");
  }

  const nightName =
    blockId === "patrol_night"
      ? "Patrol Night"
      : blockId === "western_night"
      ? "Western Night"
      : blockId === "family_adventure"
      ? "Family Adventure"
      : blockId === "masked_heroes"
      ? "Masked Heroes Night"
      : blockId === "detective_night"
      ? "Detective Night"
      : null;

  return {
    type: showId ? "show" : "block",
    showId: showId || null,
    blockId: blockId || (showId ? TV_SHOW_LIBRARY[showId]?.block || null : null),
    nightName,
    timeSlot,
    raw,
    meta,
  };
}

// Public API: build a micro-script payload from detected TV intent
function buildTvShowMicroScript(tvIntent, boundaryContext, meta = {}) {
  const role = boundaryContext?.role || "public";
  const isInternal = role === "internal" || role === "admin";

  const blockId = tvIntent.blockId;
  const showId = tvIntent.showId;
  const nightName =
    tvIntent.nightName ||
    (blockId === "patrol_night"
      ? "Patrol Night"
      : blockId === "western_night"
      ? "Western Night"
      : blockId === "family_adventure"
      ? "Family Adventure"
      : blockId === "masked_heroes"
      ? "Masked Heroes Night"
      : blockId === "detective_night"
      ? "Detective Night"
      : "Tonight’s block");

  let show = null;
  if (showId && TV_SHOW_LIBRARY[showId]) {
    show = TV_SHOW_LIBRARY[showId];
  } else if (blockId) {
    // Pick a default show from that block as the "anchor"
    const candidates = Object.values(TV_SHOW_LIBRARY).filter(
      (s) => s.block === blockId
    );
    if (candidates.length > 0) {
      show = candidates[0];
    }
  }

  if (!show) {
    // Defensive: fallback if something is off
    return {
      intent: "tv_micro_script",
      category: isInternal ? "internal" : "public",
      domain: "tv",
      message:
        "I can’t see a specific show in that message, but if you tell me the title—like Highway Patrol, Dragnet, or The Lone Ranger—I’ll line up a short on-air intro and a clean call-to-action for the block.",
    };
  }

  const timeSlot = tvIntent.timeSlot || show.defaultTime || "prime time";
  const cta =
    show.ctaTemplates && show.ctaTemplates.length
      ? show.ctaTemplates[0]
      : `Stay with us for ${show.title} tonight.`;

  if (!isInternal) {
    // Public-facing on-air style
    const msg =
      `Tonight on ${nightName}, we’re locking in ${show.title} at ${timeSlot}. ` +
      `${show.logline} ` +
      `If that sounds like your lane—` +
      `${cta}`;

    return {
      intent: "tv_micro_script",
      category: "public",
      domain: "tv",
      message: msg,
    };
  }

  // Internal builder view for the same block
  const sponsorAngles =
    show.sponsorAngles && show.sponsorAngles.length
      ? show.sponsorAngles.join("; ")
      : "local community sponsors and simple brand partners";

  const msgInternal =
    `Builder view: ${nightName} anchored by ${show.title} at ${timeSlot}. ` +
    `Tone: ${show.tone}. Audience: ${show.idealAudience}. ` +
    `Sponsor angles: ${sponsorAngles}. ` +
    `Use this as your anchor show, then stack one or two supporting titles from the same block to keep setup lean. ` +
    `Your job is not to fill a giant grid—it’s to give one tight block a clear identity and one simple sponsor story to test.`;

  return {
    intent: "tv_micro_script",
    category: "internal",
    domain: "tv",
    message: msgInternal,
  };
}

// ---------------------------------------------
// Sponsor Lane (simple detection + response)
// ---------------------------------------------
function detectSponsorIntent(userMessage, meta = {}) {
  const raw = safeString(userMessage).trim().toLowerCase();
  if (!raw) return null;

  const hasSponsorWord =
    raw.includes("sponsor") ||
    raw.includes("sponsorship") ||
    raw.includes("ad package") ||
    raw.includes("advertising") ||
    raw.includes("4-week") ||
    raw.includes("four week") ||
    raw.includes("test") ||
    raw.includes("campaign");

  if (!hasSponsorWord) return null;

  const blockId = detectBlockFromText(raw);

  return {
    type: "sponsor_test",
    blockId: blockId || null,
    raw,
    meta,
  };
}

function buildSponsorLaneResponse(sponsorIntent, boundaryContext, meta = {}) {
  const role = boundaryContext?.role || "internal";
  const isInternal = role === "internal" || role === "admin";

  const blockId = sponsorIntent.blockId;
  const nightName =
    blockId === "patrol_night"
      ? "Patrol Night"
      : blockId === "western_night"
      ? "Western Night"
      : blockId === "family_adventure"
      ? "Family Adventure"
      : blockId === "masked_heroes"
      ? "Masked Heroes Night"
      : blockId === "detective_night"
      ? "Detective Night"
      : "a focused block";

  const msgInternal =
    `Builder view: 4-week sponsor test for ${nightName}. ` +
    `Keep this lean and realistic for a growing channel:\n\n` +
    `1) Week 1 – Baseline:\n` +
    `   • Lock one anchor show and one supporting title.\n` +
    `   • Add a simple “brought to you by” bumper at open and close.\n\n` +
    `2) Week 2 – Placement tweak:\n` +
    `   • Keep the same shows but shift the sponsor mentions (pre-roll vs mid-block).\n` +
    `   • Track which placements get more recall or response.\n\n` +
    `3) Week 3 – Message tweak:\n` +
    `   • Keep placements steady and test a clearer, shorter sponsor line.\n` +
    `   • Focus on one benefit and one next step for the audience.\n\n` +
    `4) Week 4 – Consolidate & review:\n` +
    `   • Lock in the best-performing combo of block identity + sponsor message + placement.\n` +
    `   • Capture simple numbers: how many promos ran, what feedback you got, and any lift in engagement.\n\n` +
    `Proof point: this kind of micro-test works at a growing-channel level because you’re only tuning one block, not the entire grid.\n` +
    `Next action: pick a single block—like Patrol Night or Western Night—and define one sponsor story you can test over four weekends.`;

  if (isInternal) {
    return {
      intent: "sponsor_test",
      category: "internal",
      domain: "advertising",
      message: msgInternal,
    };
  }

  const msgPublic =
    `From a viewer-facing angle, ${nightName} becomes the space where one sponsor feels like a natural part of the night—not an interruption. ` +
    `On-air, we keep the language simple: who the sponsor is, why they fit this block, and one clear next step for the audience.`;

  return {
    intent: "sponsor_test",
    category: "public",
    domain: "advertising",
    message: msgPublic,
  };
}

// ---------------------------------------------
// Tone Wrapper: Nyx's Sleek Professional Voice
// (meta-aware, B4)
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

  const normalizedMeta = meta && typeof meta === "object" ? meta : {};

  const stepIndex =
    typeof normalizedMeta.stepIndex === "number"
      ? normalizedMeta.stepIndex
      : 0;

  const lastDomain = safeString(normalizedMeta.lastDomain).toLowerCase();
  const lastEmotion = safeString(
    normalizedMeta.lastEmotion || "neutral"
  ).toLowerCase();

  const currentEmotion = detectEmotionalState(userRaw);

  // Emotional mirroring (B2 + B3)
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
  }

  // Session-aware callbacks (B4)
  let callbackLine = "";

  const prettyDomain = domainLabel(domain);
  const prettyLastDomain = domainLabel(lastDomain);

  if (stepIndex >= 1) {
    if (lastDomain && lastDomain !== domain) {
      callbackLine = isInternal
        ? `We’ve been working in the ${prettyLastDomain} lane. Now you’re shifting into ${prettyDomain}, so I’ll connect the two from an internal perspective.`
        : `Earlier we were in the ${prettyLastDomain} side of Sandblast. Now you’re moving into ${prettyDomain}, so I’ll keep it coherent.`;
    } else if (lastDomain && lastDomain === domain && !isErrorLike) {
      callbackLine = isInternal
        ? `We’re staying in the ${prettyDomain} layer. Let’s go one level sharper.`
        : `We’re still in the ${prettyDomain} side of Sandblast. Let’s take this a step deeper without overloading you.`;
    }

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

  // Domain-aware intros
  let intro = "";

  if (isInternal) {
    switch (domain) {
      case "tv":
        intro =
          "Builder view: this sits on the Sandblast TV layer. Let’s frame it clearly. ";
        break;
      case "radio":
        intro =
          "Builder view: this touches the radio/live audio layer. Here’s the clean view. ";
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
          intro =
            "Looking at the radio/live audio side, here’s how it lines up. ";
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

  // Optional “next logical step”
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
        "\n\nYour next logical step is this: tell me which lane you want to tune next—TV block, sponsor test, streaming package, or News Canada segment—so we can tighten one piece instead of trying to fix everything at once.";
    } else {
      outro =
        "\n\nYour next logical step is this: tell me whether you’re focused on Sandblast TV, radio, streaming, News Canada, advertising, or AI consulting so I can guide you more precisely.";
    }
  }

  const parts = [];
  if (mirrorLine) parts.push(mirrorLine);
  if (callbackLine) parts.push(callbackLine);
  if (intro) parts.push(intro.trim());
  parts.push(trimmed);

  const core = parts.join(" ").replace(/\s+/g, " ").trim();
  const finalMessage = `${core}${outro}`.trim();

  return {
    ...payload,
    message: finalMessage,
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
  NYX_SYSTEM_PERSONA,
  resolveBoundaryContext,
  isInternalContext,
  handleNyxFrontDoor,
  wrapWithNyxTone,
  detectEmotionalState,
  // Offline engines
  detectTvShowIntent,
  buildTvShowMicroScript,
  detectSponsorIntent,
  buildSponsorLaneResponse,
};
