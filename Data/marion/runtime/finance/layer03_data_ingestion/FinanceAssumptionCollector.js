"use strict";

/**
 * R18D Layer 03 — Finance Assumption Collector
 * Separates stated facts from assumptions, projections, scenarios, and inferred values.
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
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+|;\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function containsAssumptionSignal(text) {
  return /\b(if|assuming|assume|let's say|suppose|scenario|expected|expect|projected|forecast|estimate|estimated|plan to|planning to|could|might|would)\b/i.test(text);
}

class FinanceAssumptionCollector {
  collect(input = {}) {
    const queryText = typeof input === "string" ? input : input.queryText || input.originalQuery || "";
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

    const annotatedRawInputs = rawInputs.map((item) => {
      const assumptionMatch = assumptions.some((assumption) => {
        return normalize(assumption.statement).includes(normalize(item.rawValue)) ||
          normalize(item.surroundingText).includes(normalize(assumption.statement).slice(0, 30));
      });

      return {
        ...item,
        isAssumption: item.isAssumption || assumptionMatch,
        notes: uniqueArray([
          ...(item.notes || []),
          assumptionMatch ? "input_attached_to_assumption" : null
        ])
      };
    });

    const annotatedMetricInputs = metricInputs.map((metric) => {
      const assumptionMatch = assumptions.some((assumption) => {
        return normalize(assumption.statement).includes(normalize(metric.rawValue)) ||
          normalize(metric.surroundingText).includes(normalize(assumption.statement).slice(0, 30));
      });

      return {
        ...metric,
        assumptionStatus: assumptionMatch ? "user_supplied_assumption" : metric.assumptionStatus || "stated_fact",
        notes: uniqueArray([
          ...(metric.notes || []),
          assumptionMatch ? "metric_attached_to_assumption" : null
        ])
      };
    });

    return {
      assumptions,
      rawInputs: annotatedRawInputs,
      metricInputs: annotatedMetricInputs
    };
  }

  scoreAssumption(sentence) {
    const text = normalize(sentence);

    if (/\bassum(e|ing)\b|let's say|suppose|scenario/.test(text)) return 0.85;
    if (/\bexpected|projected|forecast|estimate|estimated\b/.test(text)) return 0.72;
    if (/\bif\b/.test(text)) return 0.68;
    return 0.55;
  }

  requiresConfirmation(sentence) {
    const text = normalize(sentence);

    return /\bexpected|projected|forecast|might|could|would|estimate|estimated\b/.test(text);
  }

  static collect(input = {}, options = {}) {
    return new FinanceAssumptionCollector(options).collect(input);
  }
}

module.exports = {
  FinanceAssumptionCollector
};
