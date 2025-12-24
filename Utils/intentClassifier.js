// Utils/intentClassifier.js
// Intent + domain classifier for Nyx (Layer 1 stabilized)
// Backward compatible: exports classifyIntent(message) AND classify(message, context)

"use strict";

/**
 * Normalize helper
 */
function norm(message) {
  if (!message || typeof message !== "string") return "";
  return message.trim().toLowerCase();
}

/**
 * Count pattern hits (substring-based) with a small guard against empty patterns
 */
function hitCount(text, patterns) {
  if (!text) return 0;
  return patterns.reduce((count, p) => {
    if (!p) return count;
    return text.includes(p) ? count + 1 : count;
  }, 0);
}

/**
 * Regex helper
 */
function rx(text, re) {
  if (!text) return false;
  return re.test(text);
}

// -------------------------
// MUSIC HISTORY DETECTOR (robust)
// -------------------------
function detectMusicHistoryIntent(t) {
  // Strong chart signals
  const hasChartSignals =
    rx(t, /\b(hot\s*100|billboard|top\s*40|top40|chart|charts|charting|hit\s*parade|weekly\s*chart|year[-\s]*end|top\s*10)\b/) ||
    rx(t, /\b(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1|no1)\b/) ||
    rx(t, /\b(weeks?\s+at\s+(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1))\b/) ||
    rx(t, /\b(peak|peaked|debut)\b/);

  // Continuation signals: only treat as music if user is already in a music-ish context
  const hasFollowupSignals =
    rx(t, /\b(another|next|one more|more like this|surprise|random|story|tell me more|behind it|keep going)\b/);

  // Light music hints (guard to avoid false positives)
  const hasLightMusicHints =
    rx(t, /\b(song|artist|single|album|track|lyrics|band)\b/) ||
    rx(t, /\b(198\d|199\d|197\d|200\d)\b/);

  return hasChartSignals || (hasFollowupSignals && hasLightMusicHints);
}

// -------------------------
// REPAIR / LOOP DETECTOR (NEW)
// -------------------------
function detectRepairIntent(t) {
  return (
    rx(t, /\b(still\s+loops?|looping|stuck|frozen|did(n't| not)\s+work|not\s+working|broken|bug|crash|error)\b/) ||
    rx(t, /\b(cannot\s+get|can\'t\s+get)\b/) ||
    rx(t, /\b(404|500|502|503|504)\b/) ||
    rx(t, /\/api\/(health|chat|debug\/last)\b/) ||
    rx(t, /\b(no\s+reply|not\s+responding|won\'t\s+send|can\'t\s+send)\b/)
  );
}

// -------------------------
// GREETING / SMALLTALK
// -------------------------
const GREETINGS = [
  "hi",
  "hello",
  "hey",
  "good morning",
  "good afternoon",
  "good evening",
  "greetings"
];

const SMALLTALK = [
  "how are you",
  "how's your day",
  "hows your day",
  "how is your day",
  "what's up",
  "whats up",
  "how you doing",
  "how are things",
  "how is it going",
  "how's it going"
];

// -------------------------
// PRIMARY INTENT (Layer 1 buckets)
// -------------------------
function classifyPrimaryIntent(text) {
  if (!text) {
    return { primaryIntent: "conversational", confidence: 0.35 };
  }

  // Repair dominates everything when present
  if (detectRepairIntent(text)) {
    return { primaryIntent: "repair", confidence: 0.92 };
  }

  // Music history as an explicit intent (kept for your flows)
  if (detectMusicHistoryIntent(text)) {
    // Consider music-history as exploratory unless it contains explicit directives
    const directiveSignals = rx(text, /\b(give me|show me|pull up|fetch|generate|run|test|update|resend|fix|deploy)\b/);
    return { primaryIntent: directiveSignals ? "directive" : "exploratory", confidence: 0.92 };
  }

  // Greetings / smalltalk
  const isGreeting =
    GREETINGS.some((w) => text === w || text.startsWith(w + " ")) ||
    (text.length <= 30 && GREETINGS.some((w) => text.includes(w)));

  if (isGreeting) {
    return { primaryIntent: "conversational", confidence: 0.9 };
  }

  if (SMALLTALK.some((p) => text.includes(p))) {
    return { primaryIntent: "conversational", confidence: 0.9 };
  }

  // Directive signals
  if (
    rx(text, /^\s*(help|fix|update|resend|deploy|build|create|generate|show)\b/) ||
    rx(text, /\b(can you|please)\b/) ||
    rx(text, /\b(update\s+index\.js|update\s+widget|resend\s+full|send\s+full)\b/)
  ) {
    return { primaryIntent: "directive", confidence: 0.78 };
  }

  // Questions default to exploratory
  if (text.endsWith("?") || rx(text, /^\s*(what|when|why|how|where|who)\b/)) {
    return { primaryIntent: "exploratory", confidence: 0.72 };
  }

  return { primaryIntent: "exploratory", confidence: 0.55 };
}

// -------------------------
// DOMAIN CLASSIFIER (improved)
// -------------------------
function classifyDomain(text, primaryIntent) {
  // Strongest signals
  const techSignals = [
    "error", "bug", "crash", "stack trace", "render.com", "render ",
    "webflow", "api", "endpoint", "index.js", "server", "deploy",
    "deployment", "cannot get", "cors", "timeout", "tts", "backend",
    "rebase", "git", "push", "pull", "commit"
  ];

  const aiSignals = [
    "ai", "artificial intelligence", "chatgpt", "prompt", "prompts",
    "openai", "model", "llm", "automation", "agent", "agents"
  ];

  const sponsorSignals = [
    "sponsor", "sponsorship", "sponsored", "advertiser", "advertising",
    "ad spot", "ad spots", "ad package", "ad packages", "rate card",
    "rates", "campaign"
  ];

  const tvSignals = [
    "tv", "television", "episode", "show", "series", "schedule",
    "programming", "lineup", "time slot", "timeslot", "block",
    "channel", "western", "detective", "sitcom"
  ];

  const radioSignals = [
    "radio", "dj nova", "dj", "playlist", "audio block",
    "music block", "rotation", "on air", "on-air"
  ];

  const businessSignals = [
    "grant", "funding", "revenue", "sales", "business plan",
    "cash flow", "cashflow", "pitch", "client", "proposal",
    "pricing", "monetize", "monetization", "roi", "growth"
  ];

  const novaSignals = ["nova", "dj nova", "nova intro", "nova voice"];

  const musicSignals = [
    "billboard", "hot 100", "top 40", "top40", "chart", "charts",
    "#1", "# 1", "number one", "number 1", "no. 1", "no 1", "no1",
    "peak", "debut", "weeks at", "year-end", "weekly chart", "hit parade",
    "song", "artist", "single", "album", "track"
  ];

  const techHits = hitCount(text, techSignals);
  const aiHits = hitCount(text, aiSignals);
  const sponsorHits = hitCount(text, sponsorSignals);
  const radioHits = hitCount(text, radioSignals);
  const tvHits = hitCount(text, tvSignals);
  const businessHits = hitCount(text, businessSignals);
  const novaHits = hitCount(text, novaSignals);
  const musicHits = hitCount(text, musicSignals);

  // Weighting rules
  // 1) Repair intent biases to tech_support unless clearly music-related
  if (primaryIntent === "repair" && techHits > 0) {
    return { domain: "tech_support", domainConfidence: 0.9 };
  }

  // 2) Tech wins if it has any meaningful signal
  if (techHits > 0) {
    return { domain: "tech_support", domainConfidence: Math.min(0.85 + techHits * 0.03, 0.95) };
  }

  // 3) Music wins if explicit
  if (musicHits > 0 || detectMusicHistoryIntent(text)) {
    return { domain: "music_history", domainConfidence: Math.min(0.86 + musicHits * 0.02, 0.95) };
  }

  // 4) AI help
  if (aiHits > 0) {
    return { domain: "ai_help", domainConfidence: Math.min(0.8 + aiHits * 0.03, 0.93) };
  }

  // 5) Sponsors
  if (sponsorHits > 0) {
    return { domain: "sponsors", domainConfidence: Math.min(0.8 + sponsorHits * 0.03, 0.93) };
  }

  // 6) Nova / Radio
  if (radioHits > 0 && novaHits > 0) {
    return { domain: "nova", domainConfidence: 0.85 };
  }
  if (radioHits > 0) {
    return { domain: "radio", domainConfidence: 0.78 };
  }
  if (novaHits > 0) {
    return { domain: "nova", domainConfidence: 0.65 };
  }

  // 7) TV
  if (tvHits > 0) {
    return { domain: "tv", domainConfidence: 0.78 };
  }

  // 8) Business support
  if (businessHits > 0) {
    return { domain: "business_support", domainConfidence: 0.72 };
  }

  return { domain: "general", domainConfidence: 0.25 };
}

// -------------------------
// NEEDS FOLLOW-UP (simple heuristic)
// -------------------------
function computeNeedsFollowUp(text, primaryIntent, domain) {
  if (!text) return true;

  // In repair/tech_support, we typically need concrete context unless provided
  if (primaryIntent === "repair" || domain === "tech_support") {
    const hasConcrete =
      rx(text, /\b(404|500|502|503|504|429)\b/) ||
      rx(text, /\/api\/[a-z0-9/_-]+/i) ||
      rx(text, /\b(render|webflow|cors|endpoint|index\.js|log|stack trace)\b/);

    return !hasConcrete;
  }

  // In music_history, if no anchor, ask for artist+year or title
  if (domain === "music_history") {
    const hasAnchor =
      rx(text, /\b(19[7-9]\d|200\d)\b/) ||
      rx(text, /\b(song|artist|title)\b/) ||
      rx(text, /\b(#1|number one|hot 100|billboard|top 40|top40)\b/);

    return !hasAnchor;
  }

  return false;
}

// -------------------------
// PUBLIC API
// -------------------------
function classifyIntent(message) {
  const text = norm(message);

  // Backward compatible "intent" labels
  // We'll still return your old "intent" field, but we compute the new primary intent first.
  const { primaryIntent, confidence: primaryConfidence } = classifyPrimaryIntent(text);

  // Old intent labels for existing flows
  let intent = "statement";
  let confidence = 0.5;

  if (!text) {
    intent = "statement";
    confidence = 0.3;
  } else if (primaryIntent === "repair") {
    intent = "repair";
    confidence = 0.92;
  } else if (detectMusicHistoryIntent(text)) {
    intent = "music_history";
    confidence = 0.92;
  } else if (primaryIntent === "conversational") {
    // Distinguish greeting vs smalltalk
    const isGreeting =
      GREETINGS.some((w) => text === w || text.startsWith(w + " ")) ||
      (text.length <= 30 && GREETINGS.some((w) => text.includes(w)));

    intent = isGreeting ? "greeting" : "smalltalk";
    confidence = 0.9;
  } else if (primaryIntent === "directive") {
    intent = "help_request";
    confidence = 0.75;
  } else if (text.endsWith("?")) {
    intent = "question";
    confidence = 0.65;
  } else {
    intent = "statement";
    confidence = 0.55;
  }

  const { domain, domainConfidence } = classifyDomain(text, primaryIntent);
  const needsFollowUp = computeNeedsFollowUp(text, primaryIntent, domain);

  return {
    // New (Layer 1)
    primaryIntent,
    primaryConfidence,

    // Existing fields (kept)
    domain,
    intent,
    confidence,
    domainConfidence,

    // Convenience for downstream logic
    needsFollowUp
  };
}

/**
 * New preferred entry point for index.js:
 * classify(message, context) -> { primary, confidence, domain, domainConfidence, needsFollowUp }
 */
function classify(message, context) {
  const out = classifyIntent(message);
  return {
    primary: out.primaryIntent,
    confidence: out.primaryConfidence,
    domain: out.domain,
    domainConfidence: out.domainConfidence,
    needsFollowUp: out.needsFollowUp,
    // keep some legacy signals handy if you want them
    legacyIntent: out.intent,
    legacyConfidence: out.confidence,
    context: context || null
  };
}

module.exports = {
  classifyIntent, // backward compatible
  classify        // new preferred API
};
