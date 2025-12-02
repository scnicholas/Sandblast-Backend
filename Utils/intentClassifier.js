// utils/intentClassifier.js

// 1. Normalize text: lowercase, trim, safe fallback
function normalize(text) {
  if (!text) return "";
  return String(text).toLowerCase().trim();
}

// 2. Helper: does the text match ANY of these patterns?
function matchesAny(text, patterns) {
  return patterns.some((pattern) => {
    if (pattern instanceof RegExp) {
      return pattern.test(text);
    }
    // treat string patterns as "includes"
    return text.includes(pattern.toLowerCase());
  });
}

/**
 * classifyIntent
 * --------------
 * Takes a raw user message and returns ONE of:
 * - "tv_video"
 * - "music_radio"
 * - "news_canada"
 * - "advertising"
 * - "ai_consulting"
 * - "general" (fallback)
 */
function classifyIntent(rawMessage) {
  const text = normalize(rawMessage);

  if (!text) {
    return "general";
  }

  // --- 1. TV & Video ---------------------------------
  if (
    matchesAny(text, [
      "tv",
      "television",
      "tv channel",
      "channel",
      "retro tv",
      "watch something",
      "watch tv",
      "movie",
      "movies",
      "film",
      "episode",
      "show me something to watch",
      /watch .*sandblast/,
      /sandblast tv/
    ])
  ) {
    return "tv_video";
  }

  // --- 2. Radio & Music ------------------------------
  if (
    matchesAny(text, [
      "radio",
      "live radio",
      "listen live",
      "audio stream",
      "music",
      "songs",
      "playlist",
      "dj nova",
      "nova mix",
      "gospel sunday",
      "gospel show",
      "play gospel",
      "play music",
      "what can i listen to",
      /sandblast radio/,
      /listen .*sandblast/
    ])
  ) {
    return "music_radio";
  }

  // --- 3. News Canada & Press ------------------------
  if (
    matchesAny(text, [
      "news canada",
      "news section",
      "latest news",
      "articles",
      "press release",
      "press releases",
      "news feature",
      "news content",
      /news .*sandblast/
    ])
  ) {
    return "news_canada";
  }

  // --- 4. Advertising / Promotions -------------------
  if (
    matchesAny(text, [
      "advertise",
      "advertising",
      "promotion",
      "promotions",
      "sponsor",
      "sponsorship",
      "rate card",
      "ad rates",
      "media kit",
      "run an ad",
      "promote my business",
      "place an ad",
      "commercial spot",
      /partner .*sandblast/,
      /campaign .*sandblast/
    ])
  ) {
    return "advertising";
  }

  // --- 5. AI Consulting & AI Help --------------------
  if (
    matchesAny(text, [
      "ai consulting",
      "ai help",
      "help with ai",
      "ai strategy",
      "automation",
      "agentic ai",
      "ai brain",
      "sandblast ai consulting",
      "prompt engineering",
      "chatgpt help",
      "build an ai",
      "ai workshop",
      "ai training",
      /work with you on ai/,
      /ai services/
    ])
  ) {
    return "ai_consulting";
  }

  // --- 6. Fallback -----------------------------------
  return "general";
}

module.exports = {
  classifyIntent
};
