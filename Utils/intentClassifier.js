// Utils/intentClassifier.js
// Intent + domain classifier for Nyx (Layer 1 stabilized)
// Backward compatible: exports classifyIntent(message) AND classify(message, context)
//
// v1.1 (CHIP-AUTHORITATIVE + ACTION>YEAR PRIORITY + TOP10 vs STORY DISAMBIGUATION)
// Fixes:
/// ✅ CRITICAL: Hard-lock chart intents (top10/charts/#1) so they never collapse into “story”
/// ✅ CRITICAL: Year-only “story” followups no longer override explicit chart requests
/// ✅ NEW: Chip payloads (context/context.payload/context.routeHint) are treated as authoritative signals
/// ✅ NEW: Dedicated musicAction + musicYear extraction for downstream routing
/// ✅ SAFETY: Keep backward compatibility (intent/domain fields unchanged), add non-breaking extras

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

/**
 * Safe stringify-ish
 */
function safeStr(x) {
  return x === null || x === undefined ? "" : String(x);
}

/**
 * Extract a likely year (1950–2026-ish), returns number or null
 */
function extractYear(t) {
  if (!t) return null;
  const m = t.match(/\b(19[5-9]\d|20[0-2]\d|202[0-6])\b/);
  if (!m) return null;
  const y = Number(m[1]);
  return Number.isFinite(y) ? y : null;
}

/**
 * Pull signals from chip/context payloads so text classifier doesn't “guess” wrong.
 * We keep it forgiving because payload shapes vary (lane/action/year/mode/intent/label).
 */
function getContextSignals(context) {
  const ctx = context && typeof context === "object" ? context : {};
  const payload = ctx.payload && typeof ctx.payload === "object" ? ctx.payload : {};
  const client = ctx.client && typeof ctx.client === "object" ? ctx.client : {};

  // Common fields we’ve seen in your stack:
  const lane = safeStr(payload.lane || ctx.lane || ctx.domain || "").trim().toLowerCase();
  const action = safeStr(payload.action || payload.intent || payload.mode || ctx.action || ctx.intent || "").trim().toLowerCase();
  const label = safeStr(payload.label || ctx.label || "").trim().toLowerCase();
  const routeHint = safeStr(ctx.routeHint || client.routeHint || "").trim().toLowerCase();

  const year =
    Number(payload.year || ctx.year) ||
    extractYear(label) ||
    extractYear(action) ||
    extractYear(routeHint) ||
    null;

  // Build a single “signal string” to match against without fragile field-by-field logic.
  const signalText = norm([lane, action, label, routeHint, year ? String(year) : ""].filter(Boolean).join(" "));

  return {
    lane,
    action,
    label,
    routeHint,
    year: Number.isFinite(year) ? year : null,
    signalText
  };
}

// -------------------------
// MUSIC ACTION DETECTOR (NEW) — ACTION>YEAR priority
// -------------------------
function detectMusicAction(t, contextSignals) {
  const s = contextSignals && contextSignals.signalText ? contextSignals.signalText : "";
  const x = t || "";

  // Hard chart intents (must win over story)
  const wantsTop10 =
    rx(x, /\b(top\s*10|top10|ten\s+best)\b/) ||
    rx(s, /\b(top\s*10|top10)\b/);

  const wantsTop40 =
    rx(x, /\b(top\s*40|top40)\b/) ||
    rx(s, /\b(top\s*40|top40)\b/);

  const wantsYearEnd =
    rx(x, /\b(year[-\s]*end|yearend)\b/) ||
    rx(s, /\b(year[-\s]*end|yearend)\b/);

  const wantsCharts =
    rx(x, /\b(chart|charts|charting|hit\s*parade|weekly\s*chart|billboard|hot\s*100)\b/) ||
    rx(s, /\b(chart|charts|billboard|hot\s*100)\b/);

  const wantsNumberOne =
    rx(x, /\b(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1|no1)\b/) ||
    rx(s, /\b(#\s*1|#1|number\s*one|no\.\s*1|no\s*1|no1)\b/);

  // Story moment intent (must NOT override chart)
  const wantsStory =
    rx(x, /\b(story\s*moment|story|moment|what\s+was\s+happening|behind\s+it|tell\s+me\s+more)\b/) ||
    rx(s, /\b(story\s*moment|story|moment)\b/);

  // Decision: hard chart actions win over story
  if (wantsTop10) return "top10";
  if (wantsTop40) return "top40";
  if (wantsYearEnd) return "year_end";
  if (wantsNumberOne) return "number_one";
  if (wantsCharts) return "charts";
  if (wantsStory) return "story_moment";

  return null;
}

// -------------------------
// MUSIC HISTORY DETECTOR (robust) — updated to avoid “story” hijacking “top 10”
// -------------------------
function detectMusicHistoryIntent(t, contextSignals) {
  // Strong chart signals
  const hasChartSignals =
    rx(t, /\b(hot\s*100|billboard|top\s*40|top40|chart|charts|charting|hit\s*parade|weekly\s*chart|year[-\s]*end|top\s*10|top10)\b/) ||
    rx(t, /\b(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1|no1)\b/) ||
    rx(t, /\b(weeks?\s+at\s+(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1))\b/) ||
    rx(t, /\b(peak|peaked|debut)\b/);

  // Continuation signals: only treat as music if user is already in a music-ish context
  const hasFollowupSignals =
    rx(t, /\b(another|next|one more|more like this|surprise|random|tell me more|behind it|keep going)\b/);

  // Light music hints (guard to avoid false positives)
  const hasLightMusicHints =
    rx(t, /\b(song|artist|single|album|track|lyrics|band)\b/) ||
    rx(t, /\b(198\d|199\d|197\d|200\d|201\d|202\d)\b/);

  // Context can “prime” music if chip is music lane
  const cs = contextSignals && contextSignals.signalText ? contextSignals.signalText : "";
  const contextSuggestsMusic = rx(cs, /\b(music|chart|charts|top10|top\s*10|hot\s*100|billboard)\b/);

  return hasChartSignals || contextSuggestsMusic || (hasFollowupSignals && hasLightMusicHints);
}

// -------------------------
// REPAIR / LOOP DETECTOR
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
const GREETINGS = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "greetings"];

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
function classifyPrimaryIntent(text, contextSignals) {
  if (!text) {
    // If chip/context gives us an action, do NOT treat as conversational.
    const ctxAction = detectMusicAction("", contextSignals);
    if (ctxAction) return { primaryIntent: "exploratory", confidence: 0.75 };
    return { primaryIntent: "conversational", confidence: 0.35 };
  }

  // Repair dominates everything when present
  if (detectRepairIntent(text)) {
    return { primaryIntent: "repair", confidence: 0.92 };
  }

  // Music history as an explicit intent (kept for your flows)
  if (detectMusicHistoryIntent(text, contextSignals)) {
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
// DOMAIN CLASSIFIER (improved) — updated to honor chart actions
// -------------------------
function classifyDomain(text, primaryIntent, contextSignals, musicAction) {
  // Strongest signals
  const techSignals = [
    "error",
    "bug",
    "crash",
    "stack trace",
    "render.com",
    "render ",
    "webflow",
    "api",
    "endpoint",
    "index.js",
    "server",
    "deploy",
    "deployment",
    "cannot get",
    "cors",
    "timeout",
    "tts",
    "backend",
    "rebase",
    "git",
    "push",
    "pull",
    "commit"
  ];

  const aiSignals = ["ai", "artificial intelligence", "chatgpt", "prompt", "prompts", "openai", "model", "llm", "automation", "agent", "agents"];

  const sponsorSignals = [
    "sponsor",
    "sponsorship",
    "sponsored",
    "advertiser",
    "advertising",
    "ad spot",
    "ad spots",
    "ad package",
    "ad packages",
    "rate card",
    "rates",
    "campaign"
  ];

  const tvSignals = ["tv", "television", "episode", "show", "series", "schedule", "programming", "lineup", "time slot", "timeslot", "block", "channel", "western", "detective", "sitcom"];

  const radioSignals = ["radio", "dj nova", "dj", "playlist", "audio block", "music block", "rotation", "on air", "on-air"];

  const businessSignals = ["grant", "funding", "revenue", "sales", "business plan", "cash flow", "cashflow", "pitch", "client", "proposal", "pricing", "monetize", "monetization", "roi", "growth"];

  const novaSignals = ["nova", "dj nova", "nova intro", "nova voice"];

  const musicSignals = [
    "billboard",
    "hot 100",
    "top 40",
    "top40",
    "top 10",
    "top10",
    "chart",
    "charts",
    "#1",
    "# 1",
    "number one",
    "number 1",
    "no. 1",
    "no 1",
    "no1",
    "peak",
    "debut",
    "weeks at",
    "year-end",
    "year end",
    "weekly chart",
    "hit parade",
    "song",
    "artist",
    "single",
    "album",
    "track",
    "story moment"
  ];

  const techHits = hitCount(text, techSignals);
  const aiHits = hitCount(text, aiSignals);
  const sponsorHits = hitCount(text, sponsorSignals);
  const radioHits = hitCount(text, radioSignals);
  const tvHits = hitCount(text, tvSignals);
  const businessHits = hitCount(text, businessSignals);
  const novaHits = hitCount(text, novaSignals);
  const musicHits = hitCount(text, musicSignals);

  const cs = contextSignals && contextSignals.signalText ? contextSignals.signalText : "";
  const ctxMusicHits = cs ? hitCount(cs, musicSignals) : 0;

  // 1) Repair intent biases to tech_support unless clearly music-related
  if (primaryIntent === "repair" && techHits > 0) {
    return { domain: "tech_support", domainConfidence: 0.9 };
  }

  // 2) Tech wins if it has any meaningful signal
  if (techHits > 0) {
    return { domain: "tech_support", domainConfidence: Math.min(0.85 + techHits * 0.03, 0.95) };
  }

  // 3) Music wins if explicit OR context indicates music OR action indicates chart/story
  if (musicAction || musicHits > 0 || ctxMusicHits > 0 || detectMusicHistoryIntent(text, contextSignals)) {
    return { domain: "music_history", domainConfidence: Math.min(0.86 + (musicHits + ctxMusicHits) * 0.02, 0.95) };
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
// NEEDS FOLLOW-UP (simple heuristic) — updated for chart/story actions
// -------------------------
function computeNeedsFollowUp(text, primaryIntent, domain, musicAction, musicYear) {
  if (!text && !musicAction) return true;

  // In repair/tech_support, we typically need concrete context unless provided
  if (primaryIntent === "repair" || domain === "tech_support") {
    const hasConcrete =
      rx(text, /\b(404|500|502|503|504|429)\b/) ||
      rx(text, /\/api\/[a-z0-9/_-]+/i) ||
      rx(text, /\b(render|webflow|cors|endpoint|index\.js|log|stack trace)\b/);

    return !hasConcrete;
  }

  // In music_history:
  // - If action is chart/top10/etc: we NEED a year (or some anchor).
  // - If action is story_moment: year is strongly preferred but can fall back to artist/song.
  if (domain === "music_history") {
    if (musicAction && musicAction !== "story_moment") {
      return !musicYear;
    }

    const hasAnchor =
      !!musicYear ||
      rx(text, /\b(song|artist|title)\b/) ||
      rx(text, /\b(#1|number one|hot 100|billboard|top 40|top40|top 10|top10)\b/);

    return !hasAnchor;
  }

  return false;
}

// -------------------------
// PUBLIC API
// -------------------------
function classifyIntent(message) {
  const text = norm(message);

  // NEW: allow chip/context payloads
  // Backward compatible signature: if caller still passes a single string, context is absent.
  const contextSignals = getContextSignals(null);

  const musicYear = extractYear(text);
  const musicAction = detectMusicAction(text, contextSignals);

  // New primary intent first
  const { primaryIntent, confidence: primaryConfidence } = classifyPrimaryIntent(text, contextSignals);

  // Old intent labels for existing flows
  let intent = "statement";
  let confidence = 0.5;

  if (!text) {
    intent = "statement";
    confidence = 0.3;
  } else if (primaryIntent === "repair") {
    intent = "repair";
    confidence = 0.92;
  } else if (detectMusicHistoryIntent(text, contextSignals)) {
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

  // Domain uses action/context as well
  const { domain, domainConfidence } = classifyDomain(text, primaryIntent, contextSignals, musicAction);
  const needsFollowUp = computeNeedsFollowUp(text, primaryIntent, domain, musicAction, musicYear);

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
    needsFollowUp,

    // NEW (non-breaking extras)
    musicAction: musicAction || null,
    musicYear: musicYear || null
  };
}

/**
 * New preferred entry point for index.js:
 * classify(message, context) -> { primary, confidence, domain, domainConfidence, needsFollowUp, ... }
 *
 * NOTE: this is where chips/context become authoritative.
 */
function classify(message, context) {
  const text = norm(message);
  const contextSignals = getContextSignals(context);

  // If context contains authoritative action/year, prefer it.
  const textYear = extractYear(text);
  const ctxYear = contextSignals.year;

  // Determine action with hard priority:
  // 1) chip/context action
  // 2) text action
  const ctxAction = detectMusicAction("", contextSignals);
  const textAction = detectMusicAction(text, contextSignals);
  const musicAction = ctxAction || textAction || null;

  // Year priority: explicit in text beats context, but use context if text missing.
  const musicYear = textYear || ctxYear || null;

  const { primaryIntent, confidence: primaryConfidence } = classifyPrimaryIntent(text, contextSignals);

  // Legacy intent computed similarly but now respects musicAction
  let legacyIntent = "statement";
  let legacyConfidence = 0.5;

  if (!text && !musicAction) {
    legacyIntent = "statement";
    legacyConfidence = 0.3;
  } else if (primaryIntent === "repair") {
    legacyIntent = "repair";
    legacyConfidence = 0.92;
  } else if (detectMusicHistoryIntent(text, contextSignals) || !!musicAction) {
    legacyIntent = "music_history";
    legacyConfidence = 0.92;
  } else if (primaryIntent === "conversational") {
    const isGreeting =
      GREETINGS.some((w) => text === w || text.startsWith(w + " ")) ||
      (text.length <= 30 && GREETINGS.some((w) => text.includes(w)));
    legacyIntent = isGreeting ? "greeting" : "smalltalk";
    legacyConfidence = 0.9;
  } else if (primaryIntent === "directive") {
    legacyIntent = "help_request";
    legacyConfidence = 0.75;
  } else if (text.endsWith("?")) {
    legacyIntent = "question";
    legacyConfidence = 0.65;
  } else {
    legacyIntent = "statement";
    legacyConfidence = 0.55;
  }

  const { domain, domainConfidence } = classifyDomain(text, primaryIntent, contextSignals, musicAction);
  const needsFollowUp = computeNeedsFollowUp(text, primaryIntent, domain, musicAction, musicYear);

  return {
    primary: primaryIntent,
    confidence: primaryConfidence,
    domain,
    domainConfidence,
    needsFollowUp,

    // keep legacy signals handy
    legacyIntent,
    legacyConfidence,

    // NEW: routing helpers (this is what stops top10->story hijack)
    musicAction,
    musicYear,

    // expose signals for debugging without breaking callers
    context: context || null,
    contextSignals
  };
}

module.exports = {
  classifyIntent, // backward compatible
  classify // new preferred API
};
