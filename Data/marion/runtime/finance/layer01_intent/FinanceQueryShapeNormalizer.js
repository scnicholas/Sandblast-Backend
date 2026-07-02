"use strict";

/**
 * R18D Layer 01 — Finance Query Shape Normalizer
 * Normalizes user finance queries before intent classification.
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

function extractMatches(regex, value) {
  const matches = [];
  let match;
  const safeRegex = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);

  while ((match = safeRegex.exec(value)) !== null) {
    matches.push(match[0]);
  }

  return uniqueArray(matches);
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
     * punctuation noise.
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
      /(?:[$€£¥]\s?\d+(?:,\d{3})*(?:\.\d+)?|\b\d+(?:,\d{3})*(?:\.\d+)?\s?(?:cad|usd|eur|gbp|jpy|cny)\b)/gi,
      trimmedQuery
    );

    const percentages = extractMatches(
      /\b\d+(?:\.\d+)?\s?(?:%|percent|percentage points?)\b/gi,
      trimmedQuery
    );

    const yearMarkers = extractMatches(/\b(?:20|19)\d{2}\b/g, trimmedQuery);

    const relativeTimeMarkers = extractMatches(
      /\b(?:today|tomorrow|yesterday|this week|this month|this quarter|this year|current|currently|latest|recent|recently|still open|right now|updated)\b/gi,
      lowerQuery
    );

    const genericNumbers = extractMatches(
      /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g,
      trimmedQuery
    );

    const shape = {
      isEmpty: trimmedQuery.length === 0,
      isQuestion: /^(what|why|how|when|where|who|which|can|could|should|would|will|is|are|do|does)\b/i.test(trimmedQuery) || trimmedQuery.endsWith("?"),
      asksForFramework: /\b(framework|breakdown|structure|layer|architecture|map|roadmap|model)\b/.test(matchText),
      asksForComparison: /\b(compare|versus|vs|better|worse|tradeoff|trade off|option|alternative)\b/.test(matchText),
      asksForRisk: /\b(risk|exposure|downside|fragile|stress test|failure|collapse|red flag|pressure|uncertainty)\b/.test(matchText),
      asksForCompliance: /\b(compliance|regulation|regulatory|legal|tax|securities|disclosure|eligible|eligibility|rules)\b/.test(matchText),
      asksForSources: /\b(source|sources|data|dataset|where|get information|verify|official|filing|filings|regulator)\b/.test(matchText),
      asksForPrediction: /\b(predict|prediction|forecast|will happen|going to happen|will go up|will go down|crash|boom)\b/.test(matchText),
      asksForAction: /\b(should i|should we|do we|can we|would you|recommend|best|buy|sell|hold|choose)\b/.test(matchText),
      containsNumbers: genericNumbers.length > 0,
      containsCurrency: currencyAmounts.length > 0,
      containsPercentages: percentages.length > 0,
      containsTimeMarkers: relativeTimeMarkers.length > 0 || yearMarkers.length > 0
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
        yearMarkers
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
