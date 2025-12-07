// Utils/nyxPersonality.js
// Nyx Personality Engine v2.4
// Includes:
// - System persona (NYX_SYSTEM_PERSONA)
// - Front-door greetings
// - Emotional detection
// - Builder-mode logic
// - TV Show Micro-Script Engine (generic + specific library)
// - Sponsor-lane engine (advertising / revenue lane)
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
// Nyx System Persona (for GPT system prompt)
// ------------------------------------------------------
const NYX_SYSTEM_PERSONA = `
You are Nyx, the AI guide for Sandblast Channel. Sandblast is a growing multi-surface media channel
(TV, radio, streaming/OTT, News Canada, advertising, and AI consulting) — NOT a giant legacy network.

Core identity:
- Tone: calm, sleek, feminine, professional, lightly warm. No hype, no fluff.
- Role: program navigator + builder partner + sponsor/revenue co-pilot.
- Viewpoint: always optimize for what is realistic for a *growing* channel with limited staff and budget,
  not what a massive network with 200 employees would do.

Behavior rules:
1. Clarity first:
   - Give clean, structured answers.
   - Avoid long-winded theory unless explicitly asked.
   - Default to short sections, bullets, and plain language.

2. Sandblast context:
   - When relevant, anchor answers in Sandblast’s surfaces:
     Sandblast TV, Sandblast Radio, streaming/OTT, News Canada, advertising lanes, and AI consulting.
   - Never pretend Sandblast has huge ratings or a massive team.
   - Work with lean, test-and-iterate thinking.

3. Emotional intelligence:
   - If the user sounds frustrated, overwhelmed, or confused, steady the tone.
   - If they sound confident or excited, match the momentum but stay grounded.

4. Proof point + next action:
   - Whenever you give a concrete recommendation, include:
     • ONE proof point (why this is realistic or has worked in similar contexts).
     • ONE next action (a small, testable thing they can do in 1–4 weeks).

5. Builder mode (internal / admin channels):
   - When channel is "internal" or "admin", prioritize:
     • system design,
     • flows, lane definitions, grids, and checklists,
     • monetization logic, sponsor alignment, and realistic workload.
   - No marketing gloss. Talk like a calm operations lead mapping structure.

6. Public mode:
   - When channel is "public", keep it visitor-friendly:
     • introduce Sandblast surfaces clearly,
     • help them understand what they can watch/listen to/do,
     • avoid exposing internal operational detail unless asked explicitly.

7. Boundaries:
   - You are a professional AI assistant, not a romantic partner.
   - You respect Mac & Vera’s bond; stay supportive, not flirty.
`;

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
    lower.includes("how are you doing") ||
    lower.includes("how is your day");

  const isThanks =
    lower.includes("thank") ||
    lower === "thanks nyx" ||
    lower === "thanks nix";

  const asksHelp =
    lower === "help" ||
    lower === "help nyx" ||
    lower === "help nix" ||
    lower.includes("how do i use this") ||
    lower.includes("how does this work");

  // Direct "who are you / what is Nyx"
  if (asksWho) {
    return {
      intent: "welcome",
      category: "welcome",
      domain: "general",
      message:
        "I’m Nyx, Sandblast’s AI guide. I help you make sense of the TV lineup, radio, streaming, News Canada, advertising, and AI consulting so you always know the next clear step to take.",
    };
  }

  // Greeting + "how are you"
  if (isGreeting && asksHow) {
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
  if (asksHow) {
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

  // “How do I use this?” help
  if (asksHelp) {
    return {
      intent: "usage_help",
      category: "public",
      domain: "general",
      message:
        "You can ask me about Sandblast TV, radio, streaming, News Canada content, advertising options, or AI consulting. Tell me the area you care about, and I’ll map out a simple next move.",
    };
  }

  // Let main brain handle anything else
  return null;
}

// ------------------------------------------------------
// DOMAIN MATCHERS
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

// Builder-mode intent (for internal lane refinement)
function detectBuilderIntent(text) {
  const lower = safeString(text).toLowerCase();

  const keywords = [
    "outline this",
    "blueprint",
    "architecture",
    "structure this",
    "schedule this",
    "programming block",
    "grid",
    "lane",
    "flow",
    "backend",
    "front end",
    "front-end",
    "system design",
    "builder mode",
  ];

  return keywords.some((k) => lower.includes(k));
}

// Sponsor / advertising intent
function detectSponsorIntent(text) {
  const lower = safeString(text).toLowerCase();

  const keywords = [
    "sponsor",
    "sponsorship",
    "advertiser",
    "advertisers",
    "advertising",
    "ad package",
    "ad packages",
    "ad rates",
    "rate card",
    "commercial",
    "commercials",
    "spot",
    "spots",
    "cpm",
    "campaign",
    "brand partner",
    "brand deal",
  ];

  return keywords.some((k) => lower.includes(k));
}

// ------------------------------------------------------
// TV SHOW LIBRARY (SPECIFIC SHOW PROFILES)
// ------------------------------------------------------
const TV_SHOW_LIBRARY = {
  // Existing core set
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

  // -----------------------------
  // New additions
  // -----------------------------

  "dial 999": {
    displayName: "Dial 999",
    shortTagline:
      "British emergency-call cases with tight, grounded police storytelling.",
    category: "police procedural (UK)",
    keyThemes: [
      "case-of-the-week emergencies",
      "urban patrol and response",
      "grounded, procedural tension",
    ],
    transitions: [
      "Back on the streets of the city…",
      "Hold that thought — another call is coming through…",
      "Let’s swing back into the investigation…",
    ],
    sponsorHint:
      "local security firms, insurance brokers, community policing initiatives, neighborhood safety groups",
    triviaHint:
      "Lightly reference its UK origins or the way early TV handled emergency-call storytelling.",
    cta:
      "Cross-Atlantic patrol stories that still feel sharp — Dial 999 on Sandblast TV.",
  },

  "federal man": {
    displayName: "Federal Man",
    shortTagline:
      "federal agents chasing interstate crime with a clean moral line.",
    category: "federal crime procedural",
    keyThemes: [
      "federal vs local jurisdiction tension",
      "case files and investigations",
      "clear ‘law versus organized crime’ framing",
    ],
    transitions: [
      "Back to the federal case file…",
      "Here’s where the investigation tightens…",
      "Let’s get back into the operation…",
    ],
    sponsorHint:
      "financial services, legal advisors, security products, compliance and risk firms in a modern setting.",
    triviaHint:
      "Use simple references to early TV attempts at portraying federal agencies — nothing heavy, just context.",
    cta:
      "Classic federal-case storytelling with clean stakes — Federal Man on Sandblast TV.",
  },

  "federal operator 99": {
    displayName: "Federal Operator 99",
    shortTagline:
      "serial-style federal agent action with cliffhanger energy.",
    category: "serial crime / action",
    keyThemes: [
      "episodic cliffhangers",
      "federal pursuit of organized crime",
      "high-energy confrontations and escapes",
    ],
    transitions: [
      "Back into the operation…",
      "Stay with it — the case isn’t closed yet…",
      "Let’s jump back into the pursuit…",
    ],
    sponsorHint:
      "security systems, investigation services, B2B security, or local law-focused sponsors.",
    triviaHint:
      "Reference its serial roots and how episodes were structured around suspense and cliffhangers.",
    cta:
      "Old-school serial energy with a federal badge — Federal Operator 99 on Sandblast TV.",
  },

  "ghost squad": {
    displayName: "Ghost Squad",
    shortTagline:
      "covert operations and shadowy investigations with a cool, undercover tone.",
    category: "spy / covert ops",
    keyThemes: [
      "covert missions",
      "shadow organizations and secret teams",
      "tension between visibility and secrecy",
    ],
    transitions: [
      "Back into the shadows with the squad…",
      "Stay tight — the mission’s still live…",
      "Let’s slip back into the operation…",
    ],
    sponsorHint:
      "tech and cybersecurity firms, privacy tools, secure communications, or modern ‘stealth’ brands.",
    triviaHint:
      "Keep it to light nods about early TV espionage and how it handled secrecy on a small screen.",
    cta:
      "Shadow operations with retro charm — Ghost Squad returns on Sandblast TV.",
  },

  "hawaiian eye": {
    displayName: "Hawaiian Eye",
    shortTagline:
      "detective work with a tropical backdrop and smooth, stylish pacing.",
    category: "detective / island adventure",
    keyThemes: [
      "private-eye investigations",
      "exotic-but-comfortable island setting",
      "blend of mystery and lifestyle vibes",
    ],
    transitions: [
      "Back on the Honolulu streets…",
      "Let’s slip right back into the case…",
      "Stay with the investigation under the island lights…",
    ],
    sponsorHint:
      "travel, resorts, local restaurants, lifestyle brands, fashion and sunglasses — modern parallels to the island vibe.",
    triviaHint:
      "Use soft trivia around filming locations or the way the show blended mystery with resort-style visuals.",
    cta:
      "Tropical mysteries with a smooth retro feel — Hawaiian Eye on Sandblast TV.",
  },

  hawk: {
    displayName: "Hawk",
    shortTagline:
      "gritty investigative drama with a strong lead presence.",
    category: "crime drama",
    keyThemes: [
      "street-level investigations",
      "strong, grounded lead character",
      "grittier tone without going dark",
    ],
    transitions: [
      "Back on the hunt with Hawk…",
      "Stay close — the trail isn’t cold yet…",
      "Let’s drop straight back into the case…",
    ],
    sponsorHint:
      "community organizations, legal aid, local services that want to feel grounded and serious without being grim.",
    triviaHint:
      "Light nods to the era and the show’s lead performance are enough — keep it respectful and simple.",
    cta:
      "Harder-edged retro crime with a clear spine — Hawk on Sandblast TV.",
  },

  "green hornet serials": {
    displayName: "The Green Hornet Serials",
    shortTagline:
      "chapter-by-chapter heroics with pulpy cliffhangers.",
    category: "serial / masked vigilante",
    keyThemes: [
      "short chapter structure",
      "setup–cliffhanger–resolution rhythm",
      "vigilante justice with a pulp flavor",
    ],
    transitions: [
      "Back into this chapter of the serial…",
      "Stay with it — the sting continues…",
      "Let’s swing back into the Hornet’s next move…",
    ],
    sponsorHint:
      "comic shops, collectibles, fan events, and pop-culture themed partners.",
    triviaHint:
      "Reference the serial era and the way audiences once followed chapter-by-chapter stories at theaters and early TV.",
    cta:
      "Serial-style heroics with that pulp sting — The Green Hornet Serials on Sandblast TV.",
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
// SPONSOR-LANE ENGINE (ADVERTISING / REVENUE LANE)
// ------------------------------------------------------
function buildSponsorLaneResponse(userMessage, topic, internalMode) {
  const lower = safeString(userMessage).toLowerCase();
  const wantsRadio = lower.includes("radio");
  const wantsTv = lower.includes("tv") || lower.includes("television");
  const wantsStreaming =
    lower.includes("streaming") || lower.includes("ott") || lower.includes("roku");
  const wantsNews = lower.includes("news canada") || lower.includes("news");

  const laneSummary = [];
  if (wantsTv) laneSummary.push("TV blocks (retro programming)");
  if (wantsRadio) laneSummary.push("radio/live audio segments");
  if (wantsStreaming) laneSummary.push("streaming / OTT placements");
  if (wantsNews) laneSummary.push("News Canada placements");

  const lanes =
    laneSummary.length > 0
      ? laneSummary.join(", ")
      : "TV, radio, streaming, and News Canada surfaces";

  const core = `
[Channel Reality]
Sandblast is a growing channel, not a giant network. The ad strategy needs to stay lean: a few clear packages, consistent placements, and simple reporting instead of a big, complicated media kit.

[Base Sponsor Tiers]
• Bronze (entry): roughly $150–$300 per week.  
  Short spots or mentions in ${lanes}, plus basic on-screen or on-site logo exposure.  
• Silver (growth): roughly $300–$750 per week.  
  Branded segments, recurring mentions around key shows, and presence across two or more surfaces.  
• Gold (anchor): starting around $1,000+ per week.  
  Feature-level integration with a specific show, theme night, or “brought to you by” style positioning.

[Placement Ideas]
• TV: tie sponsors to specific retro blocks (e.g., patrol shows, westerns, family shows) and run 10–30 second spots plus simple bumpers.  
• Radio: live or pre-produced reads around music hours, talk segments, or theme shows.  
• Streaming / OTT: keep it light — bumpers at the start of a stream or small overlay mentions, not heavy ad breaks.  
• News Canada: sponsor lines on curated content, “presented by” tags, and newsletter-style mentions if you extend into email or social.

[Proof Point]
For a growing channel, simple, consistent sponsor placement builds more trust than one big, flashy campaign. Repetition across a few steady slots is more believable than pretending to have massive reach.

[Recommended Packages]
• Starter Sponsor: 1–2 shows or blocks, a few mentions per week, and basic visual presence.  
• Feature Sponsor: one signature block (e.g., patrol night, western night), heavier mentions, and light integration into intros and outros.  
• Anchor Sponsor: one category they “own” for a period (e.g., “Highway Patrol nights brought to you by…”), plus support across TV + radio + streaming.

[Next Action]
Draft one Bronze, one Silver, and one Gold package in plain language, attach real Sandblast slots and approximate prices, and test them with one potential sponsor for a four-week window.
`.trim();

  if (!internalMode) {
    // Public-facing (external-style sponsor explanation)
    return `
Here’s a lean sponsor view built for a growing Sandblast Channel, not a giant network.

${core}
`.trim();
  }

  // Internal builder-mode view (for you)
  return `
Builder-view: this sits on the Sandblast advertising and revenue lane. Let’s keep it sharp and realistic.

${core}
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
  const category = safeString(payload.category || "public").toLowerCase();
  const intent = safeString(payload.intent || "general").toLowerCase();
  const userRaw = safeString(userMessage);

  const emotion = detectEmotionalState(userRaw);
  const isInternal = category === "internal";
  const isErrorLike = raw.toLowerCase().includes("error");

  const builderIntent = isInternal && detectBuilderIntent(userRaw);

  const normalizedMeta =
    meta && typeof meta === "object" ? meta : {};
  const stepIndex =
    typeof normalizedMeta.stepIndex === "number"
      ? normalizedMeta.stepIndex
      : 0;
  const lastDomain = safeString(
    normalizedMeta.lastDomain || "general"
  ).toLowerCase();
  const lastEmotion = safeString(
    normalizedMeta.lastEmotion || "neutral"
  ).toLowerCase();

  // -------------------------------
  // Emotional mirroring
  // -------------------------------
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
  } else if (emotion === "confidence") {
    mirrorLine = isInternal
      ? "Solid call. I’ll keep the path sharp."
      : "I like that decisiveness. We’ll move cleanly from here.";
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

    // Emotion continuity note
    if (
      callbackLine &&
      lastEmotion &&
      lastEmotion !== emotion &&
      emotion !== "neutral"
    ) {
      if (lastEmotion === "frustration" && emotion === "confidence") {
        callbackLine += isInternal
          ? " You sounded more frustrated earlier. I like the clarity in this move."
          : " You felt more stuck earlier. I like the confidence you’re bringing in now.";
      } else if (
        lastEmotion === "overwhelm" &&
        (emotion === "curiosity" || emotion === "confidence")
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
    intro = `Builder-view: this sits on the ${domainLabel(domain)} layer. `;
    if (builderIntent) {
      intro += "I’ll keep this at the system and flow level, not noise or fluff. ";
    }
  } else {
    if (domain === "tv-show") {
      intro = "Let’s anchor this on the Sandblast TV experience. ";
    } else if (domain === "tv") {
      intro = "Looking at this through the TV lens. ";
    } else if (domain === "advertising") {
      intro = "Let’s look at this from the sponsor and revenue side. ";
    }
  }

  // -------------------------------
  // Compose final message
  // -------------------------------
  const parts = [];
  if (mirrorLine) parts.push(mirrorLine);
  if (callbackLine) parts.push(callbackLine);
  if (intro) parts.push(intro.trim());
  parts.push(raw);

  const core = parts.join(" ").replace(/\s+/g, " ").trim();

  // Optional extra next step (global)
  const isShortEnough = core.length > 0 && core.length < 700;
  const lowerUser = userRaw.toLowerCase();
  const isClosure =
    lowerUser.includes("thank") ||
    lowerUser.includes("thanks") ||
    lowerUser.includes("goodnight") ||
    lowerUser.includes("good night") ||
    lowerUser.includes("bye");

  let finalMessage = core;
  if (!isErrorLike && isShortEnough && !isClosure) {
    finalMessage +=
      "\n\nNext action: tell me the next show, sponsor idea, or lane you want to refine so we keep moving in small, realistic steps.";
  }

  return {
    ...payload,
    message: finalMessage.trim(),
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
    case "advertising":
      return "Sandblast advertising and sponsor lane";
    case "general":
    default:
      return "Sandblast";
  }
}

// ------------------------------------------------------
// EXPORTS
// ------------------------------------------------------
module.exports = {
  NYX_SYSTEM_PERSONA,
  resolveBoundaryContext,
  isInternalContext,
  handleNyxFrontDoor,
  detectEmotionalState,
  detectTvShowIntent,
  detectBuilderIntent,
  detectSponsorIntent,
  buildTvShowMicroScript,
  buildSponsorLaneResponse,
  wrapWithNyxTone,
};
