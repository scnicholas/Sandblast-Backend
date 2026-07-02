"use strict";

/**
 * R18D Layer 03 — Finance Assumption Collector
 * Separates stated facts from assumptions, projections, scenarios, and inferred values.
 * Critical patch: broader input alias support, defensive annotation, and diagnostic output.
 *
 * No external dependencies.
 */

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function splitSentences(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  return normalized
    .split(/(?<=[.!?])\s+|;\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function containsAssumptionSignal(text) {
  return /\b(if|assuming|assume|let's say|suppose|scenario|expected|expect|projected|projection|forecast|estimate|estimated|plan to|planning to|could|might|would|pro forma|hypothetical)\b/i.test(text);
}

function safeIncludes(haystack, needle) {
  const left = normalize(haystack);
  const right = normalize(needle);
  if (!left || !right) return false;
  return left.includes(right);
}

class FinanceAssumptionCollector {
  collect(input = {}) {
    const queryText = typeof input === "string"
      ? input
      : input.queryText || input.originalQuery || input.query || input.text || input.userText || "";

    const rawInputs = Array.isArray(input.rawInputs) ? input.rawInputs : [];
    const metricInputs = Array.isArray(input.metricInputs) ? input.metricInputs : [];
    const sentences = splitSentences(queryText);
    const assumptions = [];
    let counter = 1;

    sentences.forEach((sentence) => {
      if (!containsAssumptionSignal(sentence)) return;

      assumptions.push({
        assumptionId: `fin_assumption_${counter++}`,
        statement: sentence,
        sourceType: "user_declared_assumption",
        confidence: this.scoreAssumption(sentence),
        requiresConfirmation: this.requiresConfirmation(sentence)
      });
    });

    const annotatedRawInputs = rawInputs.map((item = {}) => {
      const assumptionMatch = assumptions.some((assumption) => {
        return safeIncludes(assumption.statement, item.rawValue) ||
          safeIncludes(item.surroundingText, assumption.statement.slice(0, 40));
      });

      return {
        ...item,
        isAssumption: Boolean(item.isAssumption || assumptionMatch),
        notes: uniqueArray([...(item.notes || []), assumptionMatch ? "input_attached_to_assumption" : null])
      };
    });

    const annotatedMetricInputs = metricInputs.map((metric = {}) => {
      const assumptionMatch = assumptions.some((assumption) => {
        return safeIncludes(assumption.statement, metric.rawValue) ||
          safeIncludes(metric.surroundingText, assumption.statement.slice(0, 40));
      });

      return {
        ...metric,
        assumptionStatus: assumptionMatch ? "user_supplied_assumption" : metric.assumptionStatus || "stated_fact",
        notes: uniqueArray([...(metric.notes || []), assumptionMatch ? "metric_attached_to_assumption" : null])
      };
    });

    return {
      assumptions,
      rawInputs: annotatedRawInputs,
      metricInputs: annotatedMetricInputs,
      diagnostics: {
        ok: true,
        warnings: assumptions.some((item) => item.requiresConfirmation) ? ["assumption_confirmation_recommended"] : [],
        errors: [],
        assumptionCount: assumptions.length
      }
    };
  }

  scoreAssumption(sentence) {
    const text = normalize(sentence);

    if (/\bassum(e|ing)\b|let's say|suppose|scenario|hypothetical|pro forma/.test(text)) return 0.85;
    if (/\bexpected|projected|projection|forecast|estimate|estimated\b/.test(text)) return 0.72;
    if (/\bif\b/.test(text)) return 0.68;
    return 0.55;
  }

  requiresConfirmation(sentence) {
    const text = normalize(sentence);
    return /\bexpected|projected|projection|forecast|might|could|would|estimate|estimated|pro forma\b/.test(text);
  }

  process(input = {}) { return this.collect(input); }
  execute(input = {}) { return this.collect(input); }
  run(input = {}) { return this.collect(input); }

  static collect(input = {}, options = {}) {
    return new FinanceAssumptionCollector(options).collect(input);
  }
}

module.exports = {
  FinanceAssumptionCollector
};
