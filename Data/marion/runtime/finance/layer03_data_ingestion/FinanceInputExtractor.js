"use strict";

/**
 * R18D Layer 03 — Finance Input Extractor
 * Extracts raw finance inputs and entity hints from user/source text before normalization.
 * Critical patch: userText support, diagnostics, broader entity/date capture, and safer empty-input handling.
 *
 * No external dependencies.
 */

const WORD_NUMBERS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90
};

const JURISDICTION_PATTERNS = [
  { value: "ontario", regex: /\bontario\b/i },
  { value: "canada", regex: /\bcanada|canadian\b/i },
  { value: "united_states", regex: /\bunited states|u\.s\.|usa|american\b/i },
  { value: "united_kingdom", regex: /\bunited kingdom|u\.k\.|uk|britain|british\b/i },
  { value: "european_union", regex: /\beuropean union|\beu\b/i },
  { value: "global", regex: /\bglobal|international|worldwide\b/i }
];

const KNOWN_COMPANY_NAMES = [
  "Apple", "Microsoft", "Tesla", "Shopify", "Amazon", "Alphabet", "Google", "Meta", "Nvidia",
  "Netflix", "Roku", "Disney", "Comcast", "Warner Bros", "Paramount", "BlackBerry", "OpenAI",
  "Salesforce", "Oracle", "Adobe", "IBM", "Intel", "AMD", "PayPal", "Block", "Square", "Visa",
  "Mastercard", "Royal Bank", "TD Bank", "Scotiabank", "BMO", "CIBC"
];

function toSafeString(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function normalizeQuotes(value) {
  return toSafeString(value)
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-");
}

function normalizeWhitespace(value) {
  return toSafeString(value).replace(/\s+/g, " ").trim();
}

function normalizeLower(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function uniqueArray(values) {
  const seen = new Set();
  const output = [];

  (values || []).filter(Boolean).forEach((value) => {
    const marker = normalizeLower(value);
    if (seen.has(marker)) return;
    seen.add(marker);
    output.push(value);
  });

  return output;
}

function parseNumber(value) {
  const safe = toSafeString(value)
    .replace(/,/g, "")
    .replace(/[^\d.\-]/g, "");

  if (!safe) return null;

  const parsed = Number(safe);
  return Number.isNaN(parsed) ? null : parsed;
}

function wordToNumber(value) {
  const safe = normalizeLower(value);
  if (WORD_NUMBERS[safe] !== undefined) return WORD_NUMBERS[safe];
  return null;
}

function extractMatches(regex, value) {
  const matches = [];
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const safeRegex = new RegExp(regex.source, flags);
  let match;

  while ((match = safeRegex.exec(value)) !== null) {
    matches.push({
      raw: match[0],
      index: match.index,
      groups: match.slice(1)
    });

    if (match[0] === "") safeRegex.lastIndex += 1;
  }

  return matches;
}

function contextWindow(text, index, length, radius = 70) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  return text.slice(start, end).trim();
}

function inferCurrency(rawValue, defaultCurrency = null) {
  const raw = toSafeString(rawValue).toLowerCase();

  if (/\bcad\b|c\$/i.test(raw)) return "CAD";
  if (/\busd\b|us\$/i.test(raw)) return "USD";
  if (/\beur\b|€/i.test(raw)) return "EUR";
  if (/\bgbp\b|£/i.test(raw)) return "GBP";
  if (/\bjpy\b|¥/i.test(raw)) return "JPY";
  if (/\bcny\b/i.test(raw)) return "CNY";
  if (/\$/.test(raw)) return defaultCurrency || null;

  return null;
}

function makeInput(payload = {}) {
  return {
    inputId: payload.inputId,
    inputType: payload.inputType || "unknown",
    rawValue: payload.rawValue || "",
    detectedValue: payload.detectedValue ?? null,
    detectedUnit: payload.detectedUnit || null,
    detectedCurrency: payload.detectedCurrency || null,
    detectedMetric: payload.detectedMetric || null,
    sourceType: payload.sourceType || "user_query",
    sourceLabel: payload.sourceLabel || "user_query",
    sourceReference: payload.sourceReference || null,
    confidence: payload.confidence ?? 0.6,
    isAssumption: Boolean(payload.isAssumption),
    isUserSupplied: payload.isUserSupplied !== false,
    requiresNormalization: payload.requiresNormalization !== false,
    requiresVerification: Boolean(payload.requiresVerification),
    surroundingText: payload.surroundingText || "",
    notes: Array.isArray(payload.notes) ? payload.notes.filter(Boolean) : []
  };
}

class FinanceInputExtractor {
  constructor(options = {}) {
    this.defaultCurrency = options.defaultCurrency || null;
  }

  extract(input = {}) {
    const originalText = typeof input === "string"
      ? input
      : input.text || input.query || input.userText || input.originalQuery || input.prompt || input.message || "";

    const sourceType = input.sourceType || "user_query";
    const sourceLabel = input.sourceLabel || sourceType;
    const sourceReference = input.sourceReference || null;
    const defaultCurrency = input.defaultCurrency || this.defaultCurrency;

    const text = normalizeWhitespace(normalizeQuotes(originalText));
    const lowerText = text.toLowerCase();

    const rawInputs = [];
    const dates = [];
    const diagnostics = {
      ok: text.length > 0,
      valid: text.length > 0,
      errors: [],
      warnings: [],
      notes: []
    };

    const missingInputs = [];
    let counter = 1;
    const nextId = (prefix) => `fin_in_${prefix}_${counter++}`;

    if (!text) {
      diagnostics.errors.push({ code: "EMPTY_FINANCE_INPUT", message: "No finance input text was supplied." });
      missingInputs.push({
        missingInput: "query_text",
        reason: "Layer 03 ingestion requires user text, source text, or uploaded text.",
        severity: "required",
        blocksAnalysis: true,
        clarifyingQuestion: "What finance question or source text should be analyzed?"
      });

      return {
        originalText: "",
        normalizedText: "",
        text: "",
        rawInputs,
        entityInputs: {
          businessNames: [], programNames: [], companyNames: [], sourceNames: [], jurisdictions: [], dates: []
        },
        diagnostics,
        missingInputs,
        valid: false,
        ok: false
      };
    }

    const currencyRegex =
      /(?:\b(?:cad|usd|eur|gbp|jpy|cny)\s?\$?\s?\d+(?:,\d{3})*(?:\.\d+)?|\b(?:c\$|us\$|[$€£¥])\s?\d+(?:,\d{3})*(?:\.\d+)?|\b\d+(?:,\d{3})*(?:\.\d+)?\s?(?:cad|usd|eur|gbp|jpy|cny)\b)/gi;

    extractMatches(currencyRegex, text).forEach((match) => {
      rawInputs.push(makeInput({
        inputId: nextId("currency"),
        inputType: "currency_amount",
        rawValue: match.raw,
        detectedValue: parseNumber(match.raw),
        detectedUnit: "currency",
        detectedCurrency: inferCurrency(match.raw, defaultCurrency),
        sourceType,
        sourceLabel,
        sourceReference,
        confidence: 0.86,
        surroundingText: contextWindow(text, match.index, match.raw.length),
        notes: ["currency_amount_detected"]
      }));
    });

    const percentageRegex =
      /(?:\b\d+(?:\.\d+)?\s?%|\b\d+(?:\.\d+)?\s?(?:percent|pct|percentage point|percentage points)\b)/gi;

    extractMatches(percentageRegex, text).forEach((match) => {
      const lower = match.raw.toLowerCase();
      rawInputs.push(makeInput({
        inputId: nextId("percentage"),
        inputType: "percentage",
        rawValue: match.raw,
        detectedValue: parseNumber(match.raw),
        detectedUnit: lower.includes("percentage point") ? "percentage_points" : "percent",
        sourceType,
        sourceLabel,
        sourceReference,
        confidence: 0.9,
        surroundingText: contextWindow(text, match.index, match.raw.length),
        notes: ["percentage_detected"]
      }));
    });

    const durationRegex =
      /\b(?:(\d+(?:\.\d+)?)|(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))\s?(day|days|week|weeks|month|months|quarter|quarters|year|years)\b/gi;

    extractMatches(durationRegex, text).forEach((match) => {
      const numeric = match.groups[0] ? Number(match.groups[0]) : wordToNumber(match.groups[1]);
      const unit = match.groups[2] ? match.groups[2].toLowerCase() : null;

      rawInputs.push(makeInput({
        inputId: nextId("duration"),
        inputType: "duration",
        rawValue: match.raw,
        detectedValue: numeric,
        detectedUnit: unit,
        sourceType,
        sourceLabel,
        sourceReference,
        confidence: 0.85,
        surroundingText: contextWindow(text, match.index, match.raw.length),
        notes: ["duration_detected"]
      }));
    });

    const isoDateRegex = /\b(?:20|19)\d{2}[-/](?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])\b/g;
    extractMatches(isoDateRegex, text).forEach((match) => {
      dates.push(match.raw);
      rawInputs.push(makeInput({
        inputId: nextId("date"), inputType: "date", rawValue: match.raw, detectedValue: match.raw,
        detectedUnit: "date", sourceType, sourceLabel, sourceReference, confidence: 0.9,
        surroundingText: contextWindow(text, match.index, match.raw.length), notes: ["date_detected"]
      }));
    });

    const fiscalRegex = /\b(?:FY|fiscal year)\s?((?:20|19)\d{2})\b|\b(Q[1-4])\s?((?:20|19)\d{2})\b/gi;
    extractMatches(fiscalRegex, text).forEach((match) => {
      const year = match.groups[0] || match.groups[2];
      const quarter = match.groups[1] || null;
      const detected = quarter ? `${quarter.toUpperCase()} ${year}` : `FY${year}`;
      dates.push(detected);
      rawInputs.push(makeInput({
        inputId: nextId("period"), inputType: "date", rawValue: match.raw, detectedValue: detected,
        detectedUnit: quarter ? "quarter" : "fiscal_year", sourceType, sourceLabel, sourceReference,
        confidence: 0.83, surroundingText: contextWindow(text, match.index, match.raw.length),
        notes: [quarter ? "quarter_detected" : "fiscal_year_detected"]
      }));
    });

    const yearRegex = /\b(?:20|19)\d{2}\b/g;
    extractMatches(yearRegex, text).forEach((match) => {
      dates.push(match.raw);
      rawInputs.push(makeInput({
        inputId: nextId("year"), inputType: "date", rawValue: match.raw, detectedValue: match.raw,
        detectedUnit: "year", sourceType, sourceLabel, sourceReference, confidence: 0.72,
        surroundingText: contextWindow(text, match.index, match.raw.length), notes: ["year_detected"]
      }));
    });

    const countRegex = /\b\d+(?:,\d{3})*\s?(?:customers|subscribers|users|clients|employees|staff|seats)\b/gi;
    extractMatches(countRegex, text).forEach((match) => {
      rawInputs.push(makeInput({
        inputId: nextId("count"), inputType: "count", rawValue: match.raw, detectedValue: parseNumber(match.raw),
        detectedUnit: "count", sourceType, sourceLabel, sourceReference, confidence: 0.82,
        surroundingText: contextWindow(text, match.index, match.raw.length), notes: ["count_detected"]
      }));
    });

    const jurisdictions = JURISDICTION_PATTERNS
      .filter((item) => item.regex.test(text))
      .map((item) => item.value);

    const programNames = this.extractProgramNames(text);
    const companyNames = this.extractCompanyNames(text);
    const sourceNames = this.extractSourceNames(text);

    return {
      originalText: text,
      normalizedText: lowerText,
      text,
      rawInputs,
      entityInputs: {
        businessNames: [],
        programNames,
        companyNames,
        sourceNames,
        jurisdictions: uniqueArray(jurisdictions),
        dates: uniqueArray(dates)
      },
      diagnostics,
      missingInputs,
      valid: diagnostics.valid,
      ok: diagnostics.ok
    };
  }

  extractProgramNames(text) {
    const results = [];
    const patterns = [
      /\b([A-Z][A-Za-z0-9&,\- ]{2,80}?(?:Grant|Fund|Funding|Program|Stream|Loan|Credit))\b/g,
      /\b(?:program|grant|funding stream|loan program)\s+(?:called|named)?\s?["']([^"']+)["']/gi
    ];

    patterns.forEach((regex) => {
      extractMatches(regex, text).forEach((match) => results.push(match.groups[0] || match.raw));
    });

    return uniqueArray(results.map(normalizeWhitespace));
  }

  extractCompanyNames(text) {
    const results = [];
    const legalSuffixRegex = /\b([A-Z][A-Za-z0-9&.\- ]{2,70}?\s(?:Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LLC|Co\.?))\b/g;

    extractMatches(legalSuffixRegex, text).forEach((match) => results.push(match.groups[0] || match.raw));

    KNOWN_COMPANY_NAMES.forEach((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      if (regex.test(text)) results.push(name);
    });

    const tickerRegex = /\b(?:NYSE|NASDAQ|TSX|CSE|LSE)\s?:\s?([A-Z.]{1,6})\b|\$([A-Z]{1,6})\b/g;
    extractMatches(tickerRegex, text).forEach((match) => results.push(match.groups[0] || match.groups[1] || match.raw));

    return uniqueArray(results.map(normalizeWhitespace));
  }

  extractSourceNames(text) {
    const names = [];

    [
      "Bank of Canada", "Statistics Canada", "CRA", "SEDAR+", "SEC EDGAR", "Ontario Securities Commission",
      "Government of Ontario", "Government of Canada", "IMF", "World Bank", "OECD", "Financial Times",
      "Bloomberg", "Reuters", "Wall Street Journal", "annual filings", "10-K", "10-Q", "S-1"
    ].forEach((name) => {
      if (text.toLowerCase().includes(name.toLowerCase())) names.push(name);
    });

    return uniqueArray(names);
  }

  process(input = {}) { return this.extract(input); }
  execute(input = {}) { return this.extract(input); }
  run(input = {}) { return this.extract(input); }
  normalize(input = {}) { return this.extract(input); }

  static extract(input = {}, options = {}) {
    return new FinanceInputExtractor(options).extract(input);
  }
}

module.exports = {
  FinanceInputExtractor
};
