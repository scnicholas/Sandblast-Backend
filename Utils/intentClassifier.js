// Utils/intentClassifier.js
// Rule-based intent classifier for Sandblast / Nyx
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

// Precompiled regex patterns for different signal clusters
const PATTERNS = {
  tv: /\b(tv|television|roku|ott|linear channel|channel lineup|epg)\b/,
  radio: /\b(radio|audio stream|live audio|sandblast radio|shoutcast)\b/,
  newsCanada: /\b(news canada|news content|content feed|editorial spots)\b/,
  consulting: /\b(ai consulting|consulting offer|ai strategy|prompt engineering|ai package|ai workshop|ai bootcamp|ai training)\b/,
  publicDomain: /\b(public domain|archive\.org|pd check|pd kit|copyright status|public\-domain)\b/,
  internalOps: /\b(backend|frontend|render\.com|webflow|widget|deployment|deploy|debug|logs|admin panel|internal only|server error|api endpoint|cors)\b/,
  monetization: /\b(ad slots?|ad inventory|advertis(?:ing|er|ers)|sponsorships?|sponsor\b|monetiz(?:e|ation)|pre\-roll|mid\-roll|post\-roll|ad break)\b/,
  streaming: /\b(streaming|stream|vod|on demand|on-demand|playlist|programming|schedule|lineup|grid)\b/,
  overview: /\b(sandblast|sandblast channel|how it works|what is this platform|explain sandblast|what is sandblast)\b/
};

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
  // Signal extraction
  // --------------------------------------------------
  const hasTv = PATTERNS.tv.test(t);
  const hasRadio = PATTERNS.radio.test(t);
  const hasNews = PATTERNS.newsCanada.test(t);
  const hasConsulting = PATTERNS.consulting.test(t);
  const hasPublicDomain = PATTERNS.publicDomain.test(t);
  const hasInternalOps = PATTERNS.internalOps.test(t);
  const hasMonetization = PATTERNS.monetization.test(t);
  const hasStreaming = PATTERNS.streaming.test(t);
  const hasOverview = PATTERNS.overview.test(t);

  // --------------------------------------------------
  // Highest-priority: combined monetization + channel
  // --------------------------------------------------

  if (hasMonetization && hasTv) {
    return {
      intent: "tv_monetization",
      domain: "tv",
      confidence: 0.92
    };
  }

  if (hasMonetization && hasRadio) {
    return {
      intent: "radio_monetization",
      domain: "radio",
      confidence: 0.92
    };
  }

  if (hasMonetization && (hasStreaming || hasOverview)) {
    // General platform monetization (Sandblast as a whole)
    return {
      intent: "sandblast_monetization",
      domain: "general",
      confidence: 0.8
    };
  }

  // --------------------------------------------------
  // High-confidence patterns (direct signals)
  // --------------------------------------------------

  if (hasTv) {
    return {
      intent: "sandblast_tv",
      domain: "tv",
      confidence: 0.9
    };
  }

  if (hasRadio) {
    return {
      intent: "sandblast_radio",
      domain: "radio",
      confidence: 0.9
    };
  }

  if (hasNews) {
    return {
      intent: "news_canada",
      domain: "news_canada",
      confidence: 0.9
    };
  }

  if (hasConsulting) {
    return {
      intent: "ai_consulting",
      domain: "consulting",
      confidence: 0.9
    };
  }

  if (hasPublicDomain) {
    return {
      intent: "pd_verification",
      domain: "public_domain",
      confidence: 0.9
    };
  }

  if (hasInternalOps) {
    // NOTE: Nyx boundary logic (owner/admin/public) lives in nyxPersonality/resolveBoundaryContext.
    // We only label it as internal_ops here; index.js + Nyx will decide how much to expose.
    return {
      intent: "internal_ops",
      domain: "internal",
      confidence: 0.85
    };
  }

  // --------------------------------------------------
  // Medium-confidence patterns (softer signals)
  // --------------------------------------------------

  if (hasMonetization) {
    // Monetization but no clear TV/Radio/streaming combo; let index.js heuristics refine domain.
    return {
      intent: "monetization",
      domain: "general",
      confidence: 0.65
    };
  }

  if (hasStreaming) {
    return {
      intent: "platform_programming",
      domain: "general",
      confidence: 0.6
    };
  }

  if (hasOverview) {
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
