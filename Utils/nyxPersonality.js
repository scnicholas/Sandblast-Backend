// Utils/nyxPersonality.js
// Nyx personality helpers: front-door hints, domain payloads, and tone wrapping

function getFrontDoorResponse(message, meta, classification) {
  const intent = classification?.intent || "statement";
  const domain = classification?.domain || "general";

  // Keep this minimal – most of the work happens in the main reply.
  if (intent === "greeting") {
    return "Nyx is listening and ready to help when you are.";
  }

  if (intent === "smalltalk") {
    return "I’m right here with you on this.";
  }

  if (domain === "tv") {
    return "We can shape a simple TV block together.";
  }

  if (domain === "radio" || domain === "nova") {
    return "We can tune a clean radio mood block for Nova.";
  }

  if (domain === "sponsors") {
    return "We can sketch a light sponsor package, one step at a time.";
  }

  if (domain === "ai_help") {
    return "We can pick a few AI tasks that actually help you.";
  }

  if (domain === "tech_support") {
    return "We’ll tackle the tech one fix at a time.";
  }

  if (domain === "business_support") {
    return "We can give one project a clear next step.";

  }

  return null;
}

function enrichDomainResponse(message, meta, classification, mode) {
  const domain = classification?.domain || "general";

  // This is a simple, structured payload the UI *could* use later.
  switch (domain) {
    case "tv":
      return {
        domain: "tv",
        focus: "block_planning",
        suggestions: [
          "Choose one block (e.g. detectives, westerns, family).",
          "Set a consistent time slot.",
          "Group 2–3 shows that match the mood."
        ]
      };

    case "radio":
      return {
        domain: "radio",
        focus: "mood_block",
        suggestions: [
          "Pick a mood: late-night smooth, Gospel Sunday, or retro party.",
          "Decide how long the block runs.",
          "Let Nova carry short intros and transitions."
        ]
      };

    case "sponsors":
      return {
        domain: "sponsors",
        focus: "simple_package",
        suggestions: [
          "Anchor the offer around one block.",
          "Pair a few spots with a couple of mentions.",
          "Give the sponsor one clear call-to-action."
        ]
      };

    case "ai_help":
      return {
        domain: "ai_help",
        focus: "practical_use_cases",
        suggestions: [
          "Draft outreach or emails.",
          "Summarize longer content.",
          "Write show descriptions and social copy."
        ]
      };

    case "tech_support":
      return {
        domain: "tech_support",
        focus: "step_by_step_debugging",
        suggestions: [
          "Confirm /health responds.",
          "Confirm /api/sandblast-gpt responds.",
          "Check the widget is pointing to the right URL."
        ]
      };

    case "business_support":
      return {
        domain: "business_support",
        focus: "90_day_focus",
        suggestions: [
          "Pick one priority project.",
          "Choose one key metric.",
          "Commit to one weekly action."
        ]
      };

    case "nova":
      return {
        domain: "nova",
        focus: "voice_block",
        suggestions: [
          "Define the mood she carries.",
          "Decide the length of her block.",
          "Use short intros and clean handoffs."
        ]
      };

    default:
      return { domain: "general" };
  }
}

// Tone wrapper: keep answers warm, supportive, short, collaborative, forward-moving.
function wrapWithNyxTone(message, meta, classification, rawReply) {
  if (!rawReply || typeof rawReply !== "string") return rawReply;

  const domain = classification?.domain || "general";
  const intent = classification?.intent || "statement";

  let reply = rawReply.trim();

  // Light cleanup: collapse excessive whitespace
  reply = reply.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n");

  // Soft prefix / suffix depending on context – but stay brief.
  let prefix = "";
  let suffix = "";

  if (intent === "greeting") {
    // Local brain already handled the main greeting text; avoid duplication.
    prefix = "";
  } else if (intent === "smalltalk") {
    prefix = "";
  } else {
    // Domain-sensitive very light framing
    if (domain === "tv") {
      prefix = "Okay, let’s work with this.\n\n";
    } else if (domain === "radio" || domain === "nova") {
      prefix = "Alright, let’s tune this a bit.\n\n";
    } else if (domain === "sponsors") {
      prefix = "We can keep this straightforward.\n\n";
    } else if (domain === "ai_help") {
      prefix = "Let’s keep this useful for you.\n\n";
    } else if (domain === "tech_support") {
      prefix = "We’ll walk this through step by step.\n\n";
    } else if (domain === "business_support") {
      prefix = "Let’s give this a clear direction.\n\n";
    }
  }

  // Gentle forward-moving close, but only when it adds clarity.
  if (domain === "tv") {
    suffix = "\n\nWhen you’re ready, tell me the block you want to work on first.";
  } else if (domain === "radio" || domain === "nova") {
    suffix = "\n\nYou can tell me the mood next, and we’ll tighten the block.";
  } else if (domain === "sponsors") {
    suffix = "\n\nIf you’d like, tell me one sponsor you have in mind and we’ll shape a small offer for them.";
  } else if (domain === "ai_help") {
    suffix = "\n\nShare one situation where you’d like AI to help, and we’ll start there.";
  } else if (domain === "tech_support") {
    suffix = "\n\nLet me know which part is giving you trouble right now, and we’ll fix that first.";
  } else if (domain === "business_support") {
    suffix = "\n\nTell me which project you want to focus on and we’ll set the next step.";
  }

  let combined = prefix ? prefix + reply : reply;
  if (suffix) {
    combined = combined + suffix;
  }

  // Keep things from becoming walls of text:
  if (combined.length > 1200) {
    combined = combined.slice(0, 1100) + "\n\nWe can keep refining this together, step by step.";
  }

  return combined;
}

module.exports = {
  getFrontDoorResponse,
  enrichDomainResponse,
  wrapWithNyxTone
};
