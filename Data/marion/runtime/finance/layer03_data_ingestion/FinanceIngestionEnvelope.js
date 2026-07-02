"use strict";

/**
 * R18D Layer 03 — Finance Ingestion Envelope
 * Creates the stable finance data-ingestion envelope for Layer 04 normalization.
 * Critical patch: alias payload support, top-level trace metadata, legacy compatibility fields, and safer handoff gates.
 *
 * No external dependencies.
 */

const ENVELOPE_VERSION = "1.0.1";
const ENVELOPE_LAYER = "R18D_layer03_data_ingestion";

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  if (Number.isNaN(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function stableSlug(value) {
  const slug = normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "unknown";
}

function uniqueArray(values) {
  const seen = new Set();
  const output = [];

  (values || []).filter(Boolean).forEach((value) => {
    const marker = typeof value === "string" ? normalize(value) : JSON.stringify(value);
    if (seen.has(marker)) return;
    seen.add(marker);
    output.push(value);
  });

  return output;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function generateTraceId(payload = {}) {
  const seed = payload.requestId || payload.traceId || payload.originalQuery || payload.normalizedQuery || Date.now();
  return `fin_l03_${stableSlug(seed).slice(0, 32)}_${Date.now().toString(36)}`;
}

function normalizeMissingInputs(value = []) {
  return safeArray(value).map((item) => {
    if (typeof item === "string") {
      return {
        missingInput: item,
        reason: "Required for this finance ingestion envelope.",
        severity: "recommended",
        blocksAnalysis: false,
        clarifyingQuestion: `Please provide ${item}.`
      };
    }

    if (item && typeof item === "object") {
      return {
        missingInput: item.missingInput || item.input || item.key || "unknown_missing_input",
        reason: item.reason || "Required for this finance ingestion envelope.",
        severity: item.severity || "recommended",
        blocksAnalysis: Boolean(item.blocksAnalysis),
        clarifyingQuestion: item.clarifyingQuestion || `Please provide ${item.missingInput || item.input || item.key || "the missing finance input"}.`,
        ...item
      };
    }

    return null;
  }).filter(Boolean);
}

function normalizeMetricInputs(payload = {}) {
  if (Array.isArray(payload.metricInputs) && payload.metricInputs.length > 0) return payload.metricInputs;

  const detected = payload.detectedMetrics || payload.metrics || payload.financialMetrics || [];
  return safeArray(detected).map((metric, index) => {
    if (typeof metric === "string") {
      return {
        metricId: `fin_metric_${stableSlug(metric)}_${index + 1}`,
        metric,
        rawValue: metric,
        value: null,
        unit: null,
        currency: null,
        period: null,
        sourceType: "user_query",
        sourceLabel: "user_query",
        confidence: 0.72,
        assumptionStatus: "stated_fact",
        normalizationRequired: true,
        verificationRequired: false,
        sourceInputId: null,
        surroundingText: payload.originalQuery || payload.normalizedQuery || "",
        notes: ["metric_alias_promoted_to_metric_input"]
      };
    }

    return metric;
  }).filter(Boolean);
}

function normalizeEntityInputs(payload = {}) {
  const entityInputs = payload.entityInputs || {};
  const entities = safeArray(payload.entities);
  const periods = safeArray(payload.periods);

  return {
    businessNames: uniqueArray(entityInputs.businessNames || []),
    programNames: uniqueArray(entityInputs.programNames || []),
    companyNames: uniqueArray([...(entityInputs.companyNames || []), ...entities]),
    sourceNames: uniqueArray(entityInputs.sourceNames || []),
    jurisdictions: uniqueArray(entityInputs.jurisdictions || payload.jurisdictions || []),
    dates: uniqueArray([...(entityInputs.dates || []), ...periods])
  };
}

function normalizePayload(payload = {}) {
  const normalizedInput = payload.normalizedInput || {};
  const queryText =
    payload.originalQuery ||
    payload.query ||
    payload.userText ||
    normalizedInput.text ||
    normalizedInput.rawText ||
    normalizedInput.normalizedText ||
    normalizedInput.input ||
    "";

  const normalizedQuery = payload.normalizedQuery || normalizedInput.normalizedText || normalize(queryText);
  const rawInputs = safeArray(payload.rawInputs);
  const metricInputs = normalizeMetricInputs({ ...payload, originalQuery: queryText, normalizedQuery });
  const missingInputs = normalizeMissingInputs(payload.missingInputs || payload.missing || []);
  const assumptions = safeArray(payload.assumptions);
  const claimTargets = safeArray(payload.claimTargets);
  const entityInputs = normalizeEntityInputs(payload);

  return {
    ...payload,
    requestId: payload.requestId || payload.id || null,
    traceId: payload.traceId || null,
    originalQuery: queryText,
    normalizedQuery,
    rawInputs,
    metricInputs,
    missingInputs,
    assumptions,
    claimTargets,
    entityInputs,
    diagnostics: payload.diagnostics || {},
    sourceType: payload.sourceType || (normalizedInput.sourceType || "user_query")
  };
}

function calculateQuality(payload = {}) {
  const normalized = normalizePayload(payload);
  const rawInputs = safeArray(normalized.rawInputs);
  const metricInputs = safeArray(normalized.metricInputs);
  const claimTargets = safeArray(normalized.claimTargets);
  const missingInputs = safeArray(normalized.missingInputs);
  const assumptions = safeArray(normalized.assumptions);
  const queryHasText = Boolean(normalized.originalQuery || normalized.normalizedQuery);

  const blockingMissing = missingInputs.filter((item) => item.blocksAnalysis === true);
  const requiredMissing = missingInputs.filter((item) => item.severity === "required");
  const ambiguousInputs = rawInputs.filter((item) => item.confidence < 0.5 || item.detectedMetric === "ambiguous");

  let score = 0;

  if (queryHasText) score += 0.14;
  if (rawInputs.length > 0) score += 0.18;
  if (metricInputs.length > 0) score += Math.min(0.38, metricInputs.length * 0.08);
  if (claimTargets.length > 0) score += 0.16;
  if (assumptions.length > 0) score += 0.04;

  if (normalized.entityInputs && safeArray(normalized.entityInputs.companyNames).length > 0) score += 0.06;
  if (normalized.entityInputs && safeArray(normalized.entityInputs.jurisdictions).length > 0) score += 0.06;
  if (normalized.entityInputs && safeArray(normalized.entityInputs.dates).length > 0) score += 0.06;
  if (normalized.sourceAuthorityEnvelope) score += 0.05;

  score -= Math.min(0.35, requiredMissing.length * 0.08);
  score -= Math.min(0.25, blockingMissing.length * 0.12);
  score -= Math.min(0.18, ambiguousInputs.length * 0.05);

  score = round(clamp(score), 3);

  let status = "partial";
  if (blockingMissing.length > 0 || !queryHasText || score < 0.35) {
    status = "insufficient";
  } else if (ambiguousInputs.length > 0) {
    status = "ambiguous";
  } else if (score >= 0.82 && requiredMissing.length === 0) {
    status = "complete";
  }

  return {
    status,
    score,
    blockingIssues: uniqueArray([
      ...blockingMissing.map((item) => item.missingInput),
      ...(normalized.blockingIssues || [])
    ]),
    warnings: uniqueArray([
      ...requiredMissing.map((item) => `missing_required:${item.missingInput}`),
      ...ambiguousInputs.map((item) => `ambiguous_input:${item.rawValue}`),
      ...(normalized.warnings || [])
    ])
  };
}

class FinanceIngestionEnvelope {
  constructor(payload = {}) {
    Object.assign(this, FinanceIngestionEnvelope.create(payload));
  }

  static create(payload = {}) {
    const normalized = normalizePayload(payload);
    const rawInputs = normalized.rawInputs;
    const metricInputs = normalized.metricInputs;
    const missingInputs = normalized.missingInputs;
    const assumptions = normalized.assumptions;
    const claimTargets = normalized.claimTargets;
    const entityInputs = normalized.entityInputs;
    const requestId = normalized.requestId || `fin_req_${Date.now().toString(36)}`;
    const traceId = normalized.traceId || generateTraceId({ ...normalized, requestId });

    const ingestionQuality = normalized.ingestionQuality || calculateQuality(normalized);

    const missingRequiredInputs = uniqueArray(
      missingInputs
        .filter((item) => item.severity === "required" || item.blocksAnalysis === true)
        .map((item) => item.missingInput)
    );

    const normalizationRequired =
      rawInputs.some((item) => item.requiresNormalization === true) ||
      metricInputs.some((item) => item.normalizationRequired === true);

    const queryContext = {
      originalQuery: normalized.originalQuery || "",
      normalizedQuery: normalized.normalizedQuery || "",
      primaryIntent: normalized.primaryIntent || null,
      secondaryIntents: safeArray(normalized.secondaryIntents),
      jurisdictions: uniqueArray(normalized.jurisdictions || entityInputs.jurisdictions || []),
      requiresFreshData: Boolean(normalized.requiresFreshData),
      sourceAuthorityEnvelope: normalized.sourceAuthorityEnvelope || null
    };

    const diagnostics = {
      ok: ingestionQuality.status !== "insufficient",
      valid: ingestionQuality.status !== "insufficient",
      loadStatus: normalized.loadStatus || null,
      extractionDiagnostics: normalized.extractionDiagnostics || null,
      metricDiagnostics: normalized.metricDiagnostics || null,
      missingInputDiagnostics: normalized.missingInputDiagnostics || null,
      warnings: ingestionQuality.warnings,
      errors: ingestionQuality.blockingIssues.map((item) => `blocking:${item}`),
      ...(normalized.diagnostics || {})
    };

    return {
      requestId,
      traceId,
      schemaVersion: ENVELOPE_VERSION,
      version: ENVELOPE_VERSION,
      envelopeVersion: ENVELOPE_VERSION,
      envelopeType: "finance_data_ingestion_envelope",
      domain: "finance",
      layer: ENVELOPE_LAYER,
      runtimeLayer: "layer03_data_ingestion",
      createdAt: new Date().toISOString(),

      input: {
        sourceType: normalized.sourceType,
        originalQuery: queryContext.originalQuery,
        normalizedQuery: queryContext.normalizedQuery
      },
      rawInput: queryContext.originalQuery,
      normalizedInput: {
        text: queryContext.originalQuery,
        normalizedText: queryContext.normalizedQuery,
        sourceType: normalized.sourceType
      },

      queryContext,
      claimTargets,
      rawInputs,
      metricInputs,
      metrics: uniqueArray(metricInputs.map((metric) => metric.metric)),
      detectedMetrics: uniqueArray(metricInputs.map((metric) => metric.metric)),
      financialMetrics: metricInputs,
      metricCandidates: metricInputs,
      entityInputs,
      entities: uniqueArray([...(entityInputs.companyNames || []), ...(entityInputs.businessNames || []), ...(entityInputs.programNames || [])]),
      periods: uniqueArray(entityInputs.dates || []),
      assumptions,
      missingInputs,
      missing: missingInputs,
      ingestionQuality,
      diagnostics,

      nextLayerHandoff: {
        canProceedToNormalization:
          ingestionQuality.status !== "insufficient" &&
          Boolean(queryContext.originalQuery || rawInputs.length > 0) &&
          metricInputs.length > 0,
        normalizationRequired,
        missingRequiredInputs,
        requiresUserClarification: missingRequiredInputs.length > 0 || ingestionQuality.status === "ambiguous",
        requiresSourceVerification:
          Boolean(normalized.requiresSourceVerification) ||
          rawInputs.some((item) => item.requiresVerification === true) ||
          metricInputs.some((item) => item.verificationRequired === true)
      }
    };
  }

  static build(payload = {}) { return FinanceIngestionEnvelope.create(payload); }
  static wrap(payload = {}) { return FinanceIngestionEnvelope.create(payload); }
  static compose(payload = {}) { return FinanceIngestionEnvelope.create(payload); }
  static toEnvelope(payload = {}) { return FinanceIngestionEnvelope.create(payload); }

  static validate(envelope = {}) {
    const errors = [];

    if (envelope.domain !== "finance") errors.push("Envelope domain must be finance.");
    if (envelope.layer !== ENVELOPE_LAYER) errors.push(`Envelope layer must be ${ENVELOPE_LAYER}.`);
    if (!envelope.queryContext || typeof envelope.queryContext !== "object") errors.push("Envelope queryContext is required.");
    if (!Array.isArray(envelope.rawInputs)) errors.push("Envelope rawInputs must be an array.");
    if (!Array.isArray(envelope.metricInputs)) errors.push("Envelope metricInputs must be an array.");
    if (!envelope.nextLayerHandoff || typeof envelope.nextLayerHandoff !== "object") errors.push("Envelope nextLayerHandoff is required.");
    if (!envelope.requestId) errors.push("Envelope requestId is required.");
    if (!envelope.traceId) errors.push("Envelope traceId is required.");

    return { valid: errors.length === 0, errors };
  }

  static calculateQuality(payload = {}) {
    return calculateQuality(payload);
  }
}

module.exports = {
  FinanceIngestionEnvelope
};
