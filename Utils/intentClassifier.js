// Utils/intentClassifier.js

/**
 * Simple, transparent intent + domain classifier for Nyx.
 * This is keyword-based by design so you can tune it quickly without retraining anything.
 */

function normalize(text) {
  return (text || "").toLowerCase().trim();
}

function detectIntent(message) {
  const msg = normalize(message);

  if (!msg) {
    return { intent: "unknown", confidence: 0.0 };
  }

  // Greetings / small talk
  if (/^(hi|hey|hello|good (morning|afternoon|evening)|what's up|wassup)/.test(msg)) {
    return { intent: "greeting", confidence: 0.9 };
  }

  if (/(how are you|how's it going|what are you doing)/.test(msg)) {
    return { intent: "smalltalk", confidence: 0.8 };
  }

  // Help / question patterns
  if (/(can you|could you|help me|i need help|show me|explain|walk me through|how do i|how to )/.test(msg)) {
    return { intent: "help_request", confidence: 0.9 };
  }

  if (msg.endsWith("?")) {
    return { intent: "question", confidence: 0.8 };
  }

  return { intent: "statement", confidence: 0.6 };
}

function detectDomain(message) {
  const msg = normalize(message);

  if (!msg) {
    return { domain: "general", confidence: 0.0 };
  }

  // TV / Streaming
  if (
    /(tv|television|channel|show|series|episode|programming|lineup|schedule|streaming|ott|roku|pluto|tubi)/.test(
      msg
    )
  ) {
    return { domain: "tv", confidence: 0.9 };
  }

  // Radio / Audio / DJ Nova
  if (
    /(radio|audio|dj nova|nova|mix show|playlist|song|music|airplay|rotation|spin|on air)/.test(
      msg
    )
  ) {
    return { domain: "radio", confidence: 0.9 };
  }

  // Sponsors / Advertising / Monetization
  if (
    /(sponsor|sponsorship|advertiser|advertising|ad package|media kit|rate card|campaign|brand deal|spot|pre-roll|mid-roll|post-roll)/.test(
      msg
    )
  ) {
    return { domain: "sponsors", confidence: 0.95 };
  }

  // AI help (consulting, strategy, prompts)
  if (
    /(ai|artificial intelligence|prompt|prompting|chatgpt|vera|nyx|sandbox gpt|sandblast gpt|ai brain|openai|model)/.test(
      msg
    )
  ) {
    return { domain: "ai_help", confidence: 0.85 };
  }

  // Tech support (backend / widget / render / webflow)
  if (
    /(error|bug|cannot get|404|500|deploy|render|webflow|backend|frontend|index\.js|script|api key|voice id|tts|endpoint)/.test(
      msg
    )
  ) {
    return { domain: "tech_support", confidence: 0.95 };
  }

  // Business support (grants, plans, pitching, operations)
  if (
    /(business plan|grant|pitch|proposal|funding|revenue|cashflow|operations|strategy|monetization|pricing|offer|client)/.test(
      msg
    )
  ) {
    return { domain: "business_support", confidence: 0.9 };
  }

  // Nova-specific
  if (/(dj nova|nova block|nova intro|radio persona)/.test(msg)) {
    return { domain: "nova", confidence: 0.9 };
  }

  // Public Domain Watchdog
  if (
    /(public domain|archive\.org|copyright|pd watchdog|renewal|lapsed|pd verification|blue racer|pow-wow)/.test(
      msg
    )
  ) {
    return { domain: "pd_watchdog", confidence: 0.95 };
  }

  return { domain: "general", confidence: 0.5 };
}

function classifyIntent(message) {
  const { intent, confidence: intentConfidence } = detectIntent(message);
  const { domain, confidence: domainConfidence } = detectDomain(message);

  // Simple combined confidence heuristic
  const confidence = Math.max(intentConfidence, domainConfidence);

  return {
    intent,
    domain,
    confidence
  };
}

module.exports = {
  classifyIntent
};
