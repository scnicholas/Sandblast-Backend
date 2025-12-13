// Utils/intentClassifier.js
// Simple keyword-based intent + domain classifier for Nyx

function classifyIntent(message) {
  if (!message || typeof message !== "string") {
    return {
      domain: "general",
      intent: "statement",
      confidence: 0.3
    };
  }

  const text = message.trim().toLowerCase();

  // -------------------------
  // MUSIC HISTORY DETECTOR (UPDATED)
  // -------------------------
  function detectMusicHistoryIntent(t) {
    // Chart-specific signals (expanded)
    const hasChartSignals =
      /\b(hot\s*100|billboard|top\s*40|top40|chart|charts|charting|hit\s*parade|weekly\s*chart|year[-\s]*end|top\s*10)\b/.test(
        t
      ) ||
      /\b(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1|no1)\b/.test(t) ||
      /\b(weeks?\s+at\s+(#\s*1|#1|number\s*one|number\s*1|no\.\s*1|no\s*1))\b/.test(
        t
      ) ||
      /\b(peak|peaked|debut)\b/.test(t);

    // If it smells like chart talk, treat it as music history.
    // Nyx can ask ONE clarifying question (which chart / which year / which country) if needed.
    return hasChartSignals;
  }

  // -------------------------
  // INTENT
  // -------------------------
  let intent = "statement";
  let confidence = 0.4;

  const greetingWords = [
    "hi",
    "hello",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
    "greetings"
  ];

  const smallTalkPatterns = [
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

  // Music history intent gets priority before generic question handling
  if (detectMusicHistoryIntent(text)) {
    intent = "music_history";
    confidence = 0.92;
  }
  // Greeting: short, simple, greeting-like
  else if (
    greetingWords.some((w) => text === w || text.startsWith(w + " ")) ||
    (text.length <= 30 && greetingWords.some((w) => text.includes(w)))
  ) {
    intent = "greeting";
    confidence = 0.9;
  } else if (smallTalkPatterns.some((p) => text.includes(p))) {
    intent = "smalltalk";
    confidence = 0.9;
  } else if (text.startsWith("help ") || text.startsWith("can you")) {
    intent = "help_request";
    confidence = 0.7;
  } else if (text.endsWith("?")) {
    intent = "question";
    confidence = Math.max(confidence, 0.6);
  } else {
    intent = "statement";
    confidence = 0.5;
  }

  // -------------------------
  // DOMAIN
  // -------------------------
  let domain = "general";
  let domainConfidence = 0.3;

  const hitCount = (patterns) =>
    patterns.reduce((count, p) => (text.includes(p) ? count + 1 : count), 0);

  const tvHits = hitCount([
    "tv",
    "television",
    "episode",
    "show",
    "series",
    "schedule",
    "programming",
    "lineup",
    "time slot",
    "timeslot",
    "block",
    "channel",
    "western",
    "detective",
    "sitcom"
  ]);

  const radioHits = hitCount([
    "radio",
    "dj nova",
    "dj",
    "playlist",
    "audio block",
    "music block",
    "rotation",
    "on air",
    "on-air"
  ]);

  const sponsorHits = hitCount([
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
  ]);

  const aiHits = hitCount([
    "ai",
    "artificial intelligence",
    "chatgpt",
    "prompt",
    "prompts",
    "openai",
    "model",
    "llm",
    "automation",
    "agent",
    "agents"
  ]);

  const techHits = hitCount([
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
    "404",
    "500",
    "tts",
    "backend"
  ]);

  const businessHits = hitCount([
    "grant",
    "funding",
    "revenue",
    "sales",
    "business plan",
    "cash flow",
    "cashflow",
    "pitch",
    "client",
    "proposal",
    "pricing",
    "monetize",
    "monetization",
    "roi",
    "growth"
  ]);

  const novaHits = hitCount(["nova", "dj nova", "nova intro", "nova voice"]);

  // Music history domain hits (expanded)
  const musicHistoryHits = hitCount([
    "billboard",
    "hot 100",
    "top 40",
    "top40",
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
    "weekly chart",
    "hit parade"
  ]);

  // Priority ordering: tech > ai > music_history > sponsors > radio/nova > tv > business
  if (techHits > 0) {
    domain = "tech_support";
    domainConfidence = 0.85;
  } else if (aiHits > 0) {
    domain = "ai_help";
    domainConfidence = 0.8;
  } else if (intent === "music_history" || (musicHistoryHits > 0 && detectMusicHistoryIntent(text))) {
    domain = "music_history";
    domainConfidence = 0.88;
  } else if (sponsorHits > 0) {
    domain = "sponsors";
    domainConfidence = 0.8;
  } else if (radioHits > 0 && novaHits > 0) {
    domain = "nova";
    domainConfidence = 0.85;
  } else if (radioHits > 0) {
    domain = "radio";
    domainConfidence = 0.75;
  } else if (tvHits > 0) {
    domain = "tv";
    domainConfidence = 0.75;
  } else if (businessHits > 0) {
    domain = "business_support";
    domainConfidence = 0.7;
  } else if (novaHits > 0) {
    domain = "nova";
    domainConfidence = 0.6;
  } else {
    domain = "general";
    domainConfidence = 0.4;
  }

  // Merge confidences into a single rough confidence
  const combinedConfidence = Math.max(confidence, domainConfidence);

  return {
    domain,
    intent,
    confidence: combinedConfidence
  };
}

module.exports = {
  classifyIntent
};
