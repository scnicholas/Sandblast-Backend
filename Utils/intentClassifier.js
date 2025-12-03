// Utils/intentClassifier.js
// Simple rule-based intent classifier for Sandblast / Nyx
// Returns: { intent, domain, confidence }

function safeString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalize(text) {
  return safeString(text)
    .trim()
    .toLowerCase();
}

/**
 * classifyIntent(text)
 *
 * @param {string} text - user message
 * @returns {Promise<{ intent: string, domain: string, confidence: number }>}
 */
async function classifyIntent(text) {
  const t = normalize(text);

  if (!t) {
    return {
      intent: "general",
      domain: "general",
      confidence: 0.2
    };
  }

  // --------------------------------------------------
  // High-confidence patterns (direct signals)
  // --------------------------------------------------

  // TV / Roku / channel structure
  if (
    /\b(tv|television|roku|ott|linear channel|channel lineup|epg)\b/.test(t)
  ) {
    return {
      intent: "sandblast_tv",
      domain: "tv",
      confidence: 0.9
    };
  }

  // Radio / audio stream
  if (
    /\b(radio|audio stream|live audio|sandblast radio|shoutcast)\b/.test(t)
  ) {
    return {
      intent: "sandblast_radio",
      domain: "radio",
      confidence: 0.9
    };
  }

  // News Canada content
  if (/\b(news canada|news content|content feed|editorial spots)\b/.test(t)) {
    return {
      intent: "news_canada",
      domain: "news_canada",
      confidence: 0.9
    };
  }

  // AI consulting / strategy / prompts
  if (
    /\b(ai consulting|consulting offer|ai strategy|prompt engineering|ai package|ai workshop)\b/.test(
      t
    )
  ) {
    return {
      intent: "ai_consulting",
      domain: "consulting",
      confidence: 0.9
    };
  }

  // Public domain / Archive.org / PD Kit
  if (
    /\b(public domain|archive\.org|pd check|pd kit|copyright status)\b/.test(t)
  ) {
    return {
      intent: "pd_verification",
      domain: "public_domain",
      confidence: 0.9
    };
  }

  // Internal ops / backend / admin
  if (
    /\b(backend|frontend|render\.com|webflow|widget|deployment|debug|logs|admin panel|internal only)\b/.test(
      t
    )
  ) {
    return {
      intent: "internal_ops",
      domain: "internal",
      confidence: 0.85
    };
  }

  // --------------------------------------------------
  // Medium-confidence patterns (softer signals)
  // --------------------------------------------------

  // Advertising / monetization around TV/radio
  if (
    /\b(ad slots|ad inventory|advertising|sponsorship|monetize|monetization)\b/.test(
      t
    )
  ) {
    // Let index.js map this via mapIntentToDomain if needed
    return {
      intent: "monetization",
      domain: "general",
      confidence: 0.6
    };
  }

  // General streaming/platform questions
  if (
    /\b(streaming|vod|on demand|playlist|programming|schedule)\b/.test(t)
  ) {
    return {
      intent: "platform_programming",
      domain: "general",
      confidence: 0.55
    };
  }

  // General “how does Sandblast work” questions
  if (
    /\b(sandblast|sandblast channel|how it works|what is this platform|explain sandblast)\b/.test(
      t
    )
  ) {
    return {
      intent: "sandblast_overview",
      domain: "general",
      confidence: 0.6
    };
  }

  // --------------------------------------------------
  // Default / fallback
  // --------------------------------------------------

  return {
    intent: "general",
    domain: "general",
    confidence: 0.4
  };
}

module.exports = {
  classifyIntent
};
