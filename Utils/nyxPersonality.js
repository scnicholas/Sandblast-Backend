// Utils/nyxPersonality.js
// Nyx personality + domain-level refinements for Sandblast
// This file sits on top of the core brain in index.js

// Small helper
function toLower(str) {
  return (str || "").toLowerCase();
}

// -----------------------------
// 1. Front-door response (optional override)
// -----------------------------
//
// This runs BEFORE the core OpenAI reply and can provide
// a short, conversational orientation when users ask
// "what can you do" / "what is Sandblast" / etc.
//
function getFrontDoorResponse(message, meta, classification) {
  const msg = toLower(message || "");
  const domain = classification?.domain || "general";
  const intent = classification?.intent || "statement";

  const aboutKeywords = [
    "what can you do",
    "how can you help",
    "what do you do",
    "who are you",
    "what is sandblast",
    "tell me about sandblast",
    "explain sandblast",
    "what is this channel",
    "what is sandblast channel",
    "what is sandblastgpt",
    "what is nyx"
  ];

  const isAboutNyxOrSandblast = aboutKeywords.some((k) => msg.includes(k));

  // Light greeting / orientation if they open with a greeting + no clear task
  const isGreetingOnly =
    ["greeting", "smalltalk"].includes(intent) &&
    !isAboutNyxOrSandblast &&
    msg.split(" ").length <= 8;

  if (isGreetingOnly) {
    return (
      `You’re tuned into Nyx, the AI brain behind Sandblast.\n\n` +
      `I’m here to help you shape TV blocks, radio shows, sponsor ideas, streaming plans, ` +
      `and even AI strategy and training for real-world organizations.\n\n` +
      `Tell me where you want to start: your content, your sponsors, or your AI questions.`
    );
  }

  if (!isAboutNyxOrSandblast) {
    // Let index.js + the model handle generic cases
    return null;
  }

  // Explicit “what are you / what is this” questions
  return (
    `You’re talking to Nyx — the AI broadcast brain wired into Sandblast.\n\n` +
    `Sandblast blends retro TV, radio, and streaming with practical AI so a growing channel can feel like a full broadcast operation without needing a giant network budget.\n\n` +
    `I can help you with programming ideas, sponsor packages, AI workshops, public-domain content, and day-to-day decisions.\n` +
    `Tell me what you’re working on right now — TV, radio, sponsors, or AI — and we’ll build from there.`
  );
}

// -----------------------------
// 2. Domain payloads / helpers
// -----------------------------
//
// These are NOT the main text replies; the model in index.js
// still handles the primary answer.
//
// Here we build structured “payloads” for the front-end and
// domain hints that can be used later for chips, side-panels, etc.
//

// ---- TV ----
function buildTvPayload(msg, meta) {
  const lower = toLower(msg || "");
  const payload = {
    type: "tv",
    suggestionChips: [
      "Plan a block",
      "Tune tonight’s lineup",
      "Promote a show"
    ],
    helperText: null
  };

  if (
    lower.includes("schedule") ||
    lower.includes("grid") ||
    lower.includes("lineup")
  ) {
    payload.helperText =
      `Think in blocks, not random shows: retro dramas, westerns, detective hours, themed nights.\n` +
      `Pick one block (e.g., “Weeknight detective hour”) and we’ll tune the time slot and flow.`;
  } else if (lower.includes("show") && lower.includes("promote")) {
    payload.helperText =
      `Combine on-air mentions, simple graphics, and 1–2 social posts with the same hook.\n` +
      `Have the show name, why someone should care, and when it airs — that’s enough to shape a promo.`;
  }

  return payload;
}

// ---- Radio / Nova ----
function buildRadioPayload(msg, meta) {
  const lower = toLower(msg || "");
  const payload = {
    type: "radio",
    mode: "standard",
    suggestionChips: ["Build a playlist", "Shape a block", "Use DJ Nova"],
    helperText: null
  };

  if (lower.includes("dj nova") || lower.includes("nova")) {
    payload.mode = "nova";
    payload.helperText =
      `DJ Nova works best when the block has a clear mood and purpose.\n` +
      `Decide the feeling (e.g., “late-night smooth”, “Sunday uplift”) and the rough length of the block — we can shape intros and flow from there.`;
  } else if (
    lower.includes("gospel sunday") ||
    lower.includes("gospel")
  ) {
    payload.helperText =
      `Treat Gospel Sunday as a weekly “appointment” block with a consistent emotional arc.\n` +
      `You can add sponsor mentions or short reflections between songs without breaking the flow.`;
  } else if (lower.includes("playlist") || lower.includes("mix")) {
    payload.helperText =
      `Think of the hour in arcs: strong open, steady groove, memorable landing.\n` +
      `Tell Nyx the mood and duration, and we can draft a simple structure.`;
  }

  return payload;
}

// ---- Sponsors / Advertising ----
function buildSponsorsPayload(msg, meta) {
  const lower = toLower(msg || "");
  const payload = {
    type: "sponsors",
    proofPoint:
      "Sandblast reaches nostalgia-driven viewers and listeners who actively choose retro content across TV, radio, and streaming.",
    nextAction:
      "Start with a 4-week test: combine a small TV presence with a few on-air mentions from DJ Nova.",
    suggestionChips: [
      "Draft a starter package",
      "Plan a 4-week test",
      "Design a sponsor pitch"
    ],
    helperText: null
  };

  if (
    lower.includes("package") ||
    lower.includes("media kit") ||
    lower.includes("rate card")
  ) {
    payload.helperText =
      `Keep packages in 2–3 tiers: starter, growth, flagship.\n` +
      `Each tier should state: number of spots, where they run (TV/radio/streaming), and the simple outcome you’re targeting.`;
  } else if (
    lower.includes("how do i advertise") ||
    lower.includes("place an ad") ||
    lower.includes("run my ad")
  ) {
    payload.helperText =
      `Flow: clarify the goal, match it to placements, and test for 4–6 weeks.\n` +
      `Local/regional sponsors respond well to clear, honest expectations — no fake “network” promises.`;
  }

  return payload;
}

// ---- Streaming / OTT ----
function buildStreamingPayload(msg, meta) {
  const lower = toLower(msg || "");
  const payload = {
    type: "streaming",
    suggestionChips: [
      "Plan OTT next step",
      "Group shows into collections",
      "Think about Roku / app later"
    ],
    helperText: null
  };

  if (lower.includes("roku") || lower.includes("ott") || lower.includes("app")) {
    payload.helperText =
      `At this stage, keep the stack lean: one or two reliable destinations are better than trying to be everywhere at once.\n` +
      `Make sure your content pipeline is stable before chasing more platforms.`;
  } else if (
    lower.includes("upload") ||
    lower.includes("watch online") ||
    lower.includes("on demand")
  ) {
    payload.helperText =
      `Group content into simple collections (westerns, detective, gospel, family) so people can browse by mood.\n` +
      `You can add more polish later once the basics work smoothly.`;
  }

  return payload;
}

// ---- News Canada ----
function buildNewsCanadaPayload(msg, meta) {
  const lower = toLower(msg || "");
  const payload = {
    type: "news_canada",
    suggestionChips: [
      "Place it between shows",
      "Match it to a sponsor",
      "Turn it into a themed block"
    ],
    helperText: null
  };

  if (lower.includes("where") && lower.includes("run")) {
    payload.helperText =
      `Use News Canada pieces as short editorial breaks between shows or inside a themed block.\n` +
      `Match topic to slot: health with wellness content, finance with business blocks, etc.`;
  } else if (
    lower.includes("sponsor") ||
    lower.includes("tie in") ||
    lower.includes("align")
  ) {
    payload.helperText =
      `Align sponsor type with the story theme.\n` +
      `Example: a bank or credit union with money pieces, a clinic or wellness brand with health clips.`;
  }

  return payload;
}

// ---- AI Consulting (including Employment Ontario) ----
function buildAiConsultingPayload(msg, meta) {
  const lower = toLower(msg || "");
  const mentionsEmploymentOntario =
    lower.includes("employment ontario") ||
    lower.includes("employment center") ||
    lower.includes("employment centre") ||
    lower.includes("job seekers") ||
    lower.includes("job-seekers") ||
    lower.includes("workforce") ||
    lower.includes("career centre") ||
    lower.includes("career center");

  const payload = {
    type: "ai_consulting",
    suggestionChips: [
      "Outline a workshop",
      "Draft a short demo",
      "Plan a simple roadmap"
    ],
    helperText: null,
    focus: mentionsEmploymentOntario ? "employment_ontario" : "general"
  };

  if (mentionsEmploymentOntario) {
    payload.helperText =
      `For Employment Ontario, keep AI grounded: resumes, cover letters, interview prep, and basic digital skills.\n` +
      `Frame it as support for staff and clients, not a replacement for humans.`;
  } else if (
    lower.includes("training") ||
    lower.includes("workshop") ||
    lower.includes("course") ||
    lower.includes("bootcamp")
  ) {
    payload.helperText =
      `A strong AI training flow: clarity (what AI is), safety (what to avoid), and hands-on practice (how to actually use it).\n` +
      `Session length and audience type decide how deep you go.`;
  } else if (
    lower.includes("strategy") ||
    lower.includes("roadmap") ||
    lower.includes("road map")
  ) {
    payload.helperText =
      `AI strategy doesn’t need a 60-page deck.\n` +
      `You need 3–5 prioritized use cases, realistic tools, and a training plan people can actually follow.`;
  }

  return payload;
}

// -----------------------------
// 3. Enricher – structured payload for index.js
// -----------------------------
//
// index.js calls this and expects a domainPayload-style object.
// The main reply still comes from the model; this is “extra context”
// for the UI or for future expansion.
//
function enrichDomainResponse(message, meta, classification, mode) {
  const domain = classification?.domain || "general";
  const msg = message || "";

  let payload = {};

  switch (domain) {
    case "tv":
      payload = { tv: buildTvPayload(msg, meta) };
      break;
    case "radio":
      payload = { radio: buildRadioPayload(msg, meta) };
      break;
    case "sponsors":
      payload = { sponsors: buildSponsorsPayload(msg, meta) };
      break;
    case "streaming":
      payload = { streaming: buildStreamingPayload(msg, meta) };
      break;
    case "news_canada":
      payload = { news_canada: buildNewsCanadaPayload(msg, meta) };
      break;
    case "ai_help":
    case "ai_consulting":
      payload = { ai_consulting: buildAiConsultingPayload(msg, meta) };
      break;
    default:
      payload = {};
  }

  return payload;
}

// -----------------------------
// 4. Tone wrapper – Nyx’s broadcast feel
// -----------------------------
//
// This runs AFTER the model reply and lets us gently steer tone,
// add sponsor proof point / next action, etc.
//
function wrapWithNyxTone(message, meta, classification, baseReply) {
  const domain = classification?.domain || "general";
  const intent = classification?.intent || "statement";
  const toneHint = meta?.toneHint || null;

  let opener = "";
  let closer = "";

  // Baseline emotional framing
  if (toneHint === "low") {
    opener = `Let’s take this one step at a time.\n\n`;
  } else if (toneHint === "excited") {
    opener = `Okay, I like the energy here.\n\n`;
  } else if (toneHint === "confused") {
    opener = `No problem — we’ll clear the static together.\n\n`;
  } else if (toneHint === "help_seeking") {
    opener = `You’re not bothering me — this is exactly what I’m here for.\n\n`;
  }

  // Domain-aware nudges
  if (domain === "tv") {
    closer =
      `\n\nRemember: you’re programming for real people with limited time. ` +
      `One solid block that runs consistently is worth more than a dozen half-formed ideas.`;
  } else if (domain === "radio") {
    closer =
      `\n\nTreat each block like a story with a beginning, middle, and end — ` +
      `it’ll make Nova and the music feel more intentional.`;
  } else if (domain === "streaming") {
    closer =
      `\n\nKeep the tech stack lean. A smooth, simple way to watch beats a messy attempt to be everywhere.`;
  } else if (domain === "ai_help" || domain === "ai_consulting") {
    closer =
      `\n\nStay practical: focus on a few repeatable use cases you can actually maintain, instead of chasing every AI trend.`;
  }

  // Sponsors: hard-wire proof point + next action
  if (domain === "sponsors") {
    const proofPoint =
      `Proof point: Sandblast can offer focused reach into nostalgia-driven viewers and listeners who deliberately choose retro content — they’re paying attention, not just scrolling past.`;
    const nextAction =
      `Next action: design a 4-week test with one clear outcome (awareness, traffic, or sign-ups) instead of promising “everything at once.”`;

    closer += `\n\n${proofPoint}\n${nextAction}`;
  }

  const replyWithTone = `${opener || ""}${baseReply}${closer || ""}`.trim();
  return replyWithTone;
}

module.exports = {
  getFrontDoorResponse,
  enrichDomainResponse,
  wrapWithNyxTone
};
