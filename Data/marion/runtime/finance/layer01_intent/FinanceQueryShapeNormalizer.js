"use strict";

/**
 * R18D Layer 01 — Finance Query Shape Normalizer
 * Normalizes user finance queries before intent classification.
 *
 * Surgical patch focus:
 * - percentage detection for compact values such as "30%"
 * - currency detection for prefix/suffix formats such as "CAD 50,000" and "50,000 CAD"
 * - finance-risk shape detection for survival, runway, revenue shock, and cash-pressure language
 * - duration/time-window detection for phrases such as "three months" and "90 days"
 * - defensive regex extraction guard against zero-width match loops
 *
 * No external dependencies.
 */

const DEFAULT_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "so", "to", "of", "in",
  "on", "for", "from", "with", "by", "at", "as", "is", "are", "was", "were",
  "be", "been", "being", "it", "this", "that", "these", "those", "we", "our",
  "us", "i", "me", "my", "you", "your", "they", "them", "their", "do", "does",
  "did", "can", "could", "would", "should", "will", "shall", "may", "might"
]);

const NUMBER_WORDS = [
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen", "twenty", "thirty", "sixty", "ninety"
];

function toSafeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeQuotes(value) {
  return value
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueArray(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function tokenize(matchText) {
  if (!matchText) return [];
  return matchText
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildNgrams(tokens, size) {
  const output = [];
  for (let i = 0; i <= tokens.length - size; i += 1) {
    output.push(tokens.slice(i, i + size).join(" "));
  }
  return output;
}

function toGlobalRegex(regex) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  return new RegExp(regex.source, flags);
}

function extractMatches(regex, value) {
  const input = toSafeString(value);
  const matches = [];
  const safeRegex = toGlobalRegex(regex);
  let match;

  while ((match = safeRegex.exec(input)) !== null) {
    matches.push(match[0]);

    /**
     * Defensive guard: if a future regex can match an empty string, advance
     * manually to prevent an infinite loop.
     */
    if (match[0] === "") {
      safeRegex.lastIndex += 1;
    }
  }

  return uniqueArray(matches.map((item) => normalizeWhitespace(item)));
}

function hasPattern(matchText, regex) {
  return regex.test(matchText);
}

class FinanceQueryShapeNormalizer {
  constructor(options = {}) {
    this.stopwords = options.stopwords instanceof Set
      ? options.stopwords
      : DEFAULT_STOPWORDS;
  }

  normalize(query, options = {}) {
    const originalQuery = toSafeString(query);
    const trimmedQuery = normalizeWhitespace(originalQuery);
    const lowerQuery = normalizeQuotes(trimmedQuery.toLowerCase());

    /**
     * matchText keeps important finance symbols and numbers while stripping
     * punctuation noise. Apostrophes and slashes are intentionally reduced
     * because Layer 1 routing is phrase/keyword driven, not exact prose.
     */
    const matchText = normalizeWhitespace(
      lowerQuery
        .replace(/[^a-z0-9\s.%$€£¥+\-]/g, " ")
        .replace(/\s+/g, " ")
    );

    const tokens = tokenize(matchText);
    const meaningfulTokens = tokens.filter((token) => !this.stopwords.has(token));

    const bigrams = buildNgrams(tokens, 2);
    const trigrams = buildNgrams(tokens, 3);

    const currencyAmounts = extractMatches(
      /(?:[$€£¥]\s?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:cad|usd|eur|gbp|jpy|cny))?|\b(?:cad|usd|eur|gbp|jpy|cny)\s?\d+(?:,\d{3})*(?:\.\d+)?|\b\d+(?:,\d{3})*(?:\.\d+)?\s?(?:cad|usd|eur|gbp|jpy|cny)\b)/gi,
      trimmedQuery
    );

    const percentages = extractMatches(
      /(?:\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?(?:percent|percentage point|percentage points|pct)\b)/gi,
      trimmedQuery
    );

    const yearMarkers = extractMatches(/\b(?:20|19)\d{2}\b/g, trimmedQuery);

    const relativeTimeMarkers = extractMatches(
      /\b(?:today|tomorrow|yesterday|this week|this month|this quarter|this year|current|currently|latest|recent|recently|still open|right now|updated)\b/gi,
      lowerQuery
    );

    const durationMarkers = extractMatches(
      new RegExp(`\\b(?:\\d+(?:\\.\\d+)?|${NUMBER_WORDS.join("|")})\\s?(?:day|days|week|weeks|month|months|quarter|quarters|year|years)\\b`, "gi"),
      lowerQuery
    );

    const genericNumbers = extractMatches(
      /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g,
      trimmedQuery
    );

    const survivalOrRevenueShock =
      hasPattern(
        matchText,
        /\b(survive|survival|runway|burn rate|cash pressure|cash crunch|cash shortfall|revenue drop|revenue drops|revenue decline|revenue shortfall|ad revenue drop|ad revenue drops|sales drop|income drop|liquidity pressure|margin compression)\b/
      ) ||
      (
        hasPattern(matchText, /\b(revenue|sales|income|ad revenue|cash|cashflow|cash flow)\b/) &&
        hasPattern(matchText, /\b(drop|drops|decline|declines|fall|falls|decrease|decreases|down|shortfall|pressure|crunch)\b/)
      );

    const shape = {
      isEmpty: trimmedQuery.length === 0,
      isQuestion: /^(what|why|how|when|where|who|which|can|could|should|would|will|is|are|do|does)\b/i.test(trimmedQuery) || trimmedQuery.endsWith("?"),
      asksForFramework: /\b(framework|breakdown|structure|layer|architecture|map|roadmap|model)\b/.test(matchText),
      asksForComparison: /\b(compare|versus|vs|better|worse|tradeoff|trade off|option|alternative)\b/.test(matchText),
      asksForRisk:
        /\b(risk|risks|exposure|downside|fragile|stress test|failure|collapse|red flag|pressure|uncertainty|sensitivity|dependency|default|liquidity|survive|survival|runway|burn rate|cash pressure|cash crunch|cash shortfall|revenue drop|revenue drops|revenue decline|revenue shortfall|ad revenue drop|ad revenue drops|sales drop|income drop|loss|losses|churn|margin compression)\b/.test(matchText) ||
        survivalOrRevenueShock,
      asksForCompliance: /\b(compliance|regulation|regulatory|legal|tax|securities|disclosure|eligible|eligibility|rules|licensed|filing|audit)\b/.test(matchText),
      asksForSources: /\b(source|sources|data|dataset|get information|verify|official|filing|filings|regulator|where would we get|where do we get|where can we get|what data|which source)\b/.test(matchText),
      asksForPrediction: /\b(predict|prediction|forecast|will happen|going to happen|will go up|will go down|crash|boom)\b/.test(matchText),
      asksForAction: /\b(should i|should we|do we|can we|would you|recommend|best|buy|sell|hold|choose)\b/.test(matchText),
      containsNumbers: genericNumbers.length > 0,
      containsCurrency: currencyAmounts.length > 0,
      containsPercentages: percentages.length > 0,
      containsTimeMarkers: relativeTimeMarkers.length > 0 || yearMarkers.length > 0 || durationMarkers.length > 0
    };

    return {
      originalQuery,
      trimmedQuery,
      normalizedQuery: lowerQuery,
      matchText,
      tokens,
      meaningfulTokens,
      bigrams,
      trigrams,
      numericSignals: {
        currencyAmounts,
        percentages,
        genericNumbers,
        yearMarkers
      },
      timeSignals: {
        relativeTimeMarkers,
        durationMarkers,
        yearMarkers
      },
      financeSignals: {
        survivalOrRevenueShock
      },
      shape,
      options
    };
  }

  static normalize(query, options = {}) {
    return new FinanceQueryShapeNormalizer(options).normalize(query, options);
  }
}

module.exports = {
  FinanceQueryShapeNormalizer
};
