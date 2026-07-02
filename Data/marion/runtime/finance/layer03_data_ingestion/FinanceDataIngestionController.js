"use strict";

/**
 * R18D Layer 03 — Finance Data Ingestion Controller
 * Orchestrates finance raw input extraction, metric detection, assumption capture,
 * missing-input resolution, and Layer 03 envelope creation.
 * Critical patch: userText support, runtime pack-dir tolerance, diagnostic propagation, method aliases.
 *
 * No external dependencies.
 */

const fs = require("fs");
const path = require("path");

const { FinanceInputExtractor } = require("./FinanceInputExtractor");
const { FinanceMetricDetector } = require("./FinanceMetricDetector");
const { FinanceAssumptionCollector } = require("./FinanceAssumptionCollector");
const { FinanceMissingInputResolver } = require("./FinanceMissingInputResolver");
const { FinanceIngestionEnvelope } = require("./FinanceIngestionEnvelope");

function firstExistingDir(candidates = []) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const resolved = path.resolve(candidate);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
    } catch (_error) {
      // Ignore bad candidate.
    }
  }
  return path.resolve(__dirname, "../../../../Domains/finance/packs");
}

const DEFAULT_PACK_DIR = firstExistingDir([
  process.env.FINANCE_PACK_DIR,
  path.resolve(__dirname, "../packs"),
  path.resolve(__dirname, "../../packs"),
  path.resolve(__dirname, "../../../../Domains/finance/packs"),
  path.resolve(__dirname, "../../../../Data/Domains/finance/packs"),
  path.resolve(process.cwd(), "Data/marion/runtime/finance/packs"),
  path.resolve(process.cwd(), "Domains/finance/packs")
]);

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return { __loadError: true, filePath, message: error.message, fallback };
  }
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
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

function safeLoadStatus(component) {
  if (component && typeof component.getLoadStatus === "function") return component.getLoadStatus();
  return { loaded: Boolean(component), errors: [] };
}

class FinanceDataIngestionController {
  constructor(options = {}) {
    this.packDir = options.packDir ? path.resolve(options.packDir) : DEFAULT_PACK_DIR;

    this.schema = safeReadJson(
      path.join(this.packDir, "fin_data_ingestion_schema_v1.json"),
      { ingestionEnvelopeSchema: {}, claimTargetTypes: {} }
    );

    this.sourceTypes = safeReadJson(
      path.join(this.packDir, "fin_ingestion_source_types_v1.json"),
      { sourceTypes: {} }
    );

    this.extractor = options.extractor || new FinanceInputExtractor({ defaultCurrency: options.defaultCurrency || null });
    this.metricDetector = options.metricDetector || new FinanceMetricDetector({ packDir: this.packDir });
    this.assumptionCollector = options.assumptionCollector || new FinanceAssumptionCollector();
    this.missingInputResolver = options.missingInputResolver || new FinanceMissingInputResolver({ packDir: this.packDir });
  }

  getLoadStatus() {
    return {
      packDir: this.packDir,
      ingestionSchemaLoaded: !this.schema.__loadError,
      sourceTypesLoaded: !this.sourceTypes.__loadError,
      metricDetector: safeLoadStatus(this.metricDetector),
      missingInputResolver: safeLoadStatus(this.missingInputResolver),
      errors: [
        this.schema.__loadError ? this.schema : null,
        this.sourceTypes.__loadError ? this.sourceTypes : null
      ].filter(Boolean)
    };
  }

  ingest(input = {}) {
    const normalizedInput = this.normalizeInput(input);
    const loadStatus = this.getLoadStatus();

    const extracted = this.extractor.extract({
      text: normalizedInput.query,
      sourceType: normalizedInput.sourceType,
      sourceLabel: normalizedInput.sourceLabel,
      sourceReference: normalizedInput.sourceReference,
      defaultCurrency: normalizedInput.defaultCurrency
    });

    const sourceExtracted = this.extractSourceSnippets(normalizedInput.sourceSnippets);
    const uploadedExtracted = this.extractUploadedInputs(normalizedInput.uploadedInputs);

    const rawInputs = [
      ...(extracted.rawInputs || []),
      ...(sourceExtracted.rawInputs || []),
      ...(uploadedExtracted.rawInputs || [])
    ];

    const entityInputs = this.mergeEntityInputs([
      extracted.entityInputs,
      sourceExtracted.entityInputs,
      uploadedExtracted.entityInputs,
      {
        jurisdictions: normalizedInput.intentContext.detectedJurisdictions || normalizedInput.intentContext.jurisdictions || [],
        companyNames: normalizedInput.intentContext.companyNames || normalizedInput.intentContext.entities || [],
        dates: normalizedInput.intentContext.periods || normalizedInput.intentContext.dates || []
      }
    ]);

    const detected = this.metricDetector.detect(rawInputs, {
      queryText: normalizedInput.query,
      originalQuery: normalizedInput.query,
      sourceType: normalizedInput.sourceType,
      sourceLabel: normalizedInput.sourceLabel,
      entityInputs,
      intentContext: normalizedInput.intentContext
    });

    const assumptions = this.assumptionCollector.collect({
      queryText: normalizedInput.query,
      rawInputs,
      metricInputs: detected.metricInputs || []
    });

    const claimTargets = detected.claimTargets || [];

    const missingInputs = this.missingInputResolver.resolve({
      queryText: normalizedInput.query,
      metricInputs: assumptions.metricInputs || detected.metricInputs || [],
      claimTargets,
      entityInputs,
      intentContext: normalizedInput.intentContext
    });

    const requiresSourceVerification =
      Boolean(normalizedInput.intentContext.requiresFreshData) ||
      Array.from(missingInputs).some((item) => item.missingInput === "current_official_source");

    return FinanceIngestionEnvelope.create({
      requestId: normalizedInput.requestId,
      traceId: normalizedInput.traceId,
      originalQuery: normalizedInput.query,
      normalizedQuery: normalize(normalizedInput.query),
      sourceType: normalizedInput.sourceType,
      primaryIntent: normalizedInput.intentContext.primaryIntent || normalizedInput.intentContext.intentId || null,
      secondaryIntents: normalizedInput.intentContext.secondaryIntents || [],
      jurisdictions: entityInputs.jurisdictions || [],
      requiresFreshData: Boolean(normalizedInput.intentContext.requiresFreshData),
      sourceAuthorityEnvelope: normalizedInput.sourceAuthorityEnvelope,

      claimTargets,
      rawInputs: assumptions.rawInputs || rawInputs,
      metricInputs: assumptions.metricInputs || detected.metricInputs || [],
      entityInputs,
      assumptions: assumptions.assumptions || [],
      missingInputs: Array.from(missingInputs),
      requiresSourceVerification,
      loadStatus,
      extractionDiagnostics: extracted.diagnostics || null,
      metricDiagnostics: detected.diagnostics || null,
      missingInputDiagnostics: missingInputs.diagnostics || null,
      diagnostics: {
        controller: "FinanceDataIngestionController",
        ok: true,
        warnings: [],
        errors: []
      }
    });
  }

  normalizeInput(input = {}) {
    if (typeof input === "string") {
      return {
        query: input,
        requestId: null,
        traceId: null,
        sourceType: "user_query",
        sourceLabel: "user_query",
        sourceReference: null,
        intentContext: {},
        sourceAuthorityEnvelope: null,
        sourceSnippets: [],
        uploadedInputs: [],
        defaultCurrency: null
      };
    }

    const query = input.query || input.originalQuery || input.text || input.userText || input.prompt || input.message || input.rawInput || "";

    return {
      query,
      requestId: input.requestId || input.id || null,
      traceId: input.traceId || null,
      sourceType: input.sourceType || "user_query",
      sourceLabel: input.sourceLabel || input.sourceType || "user_query",
      sourceReference: input.sourceReference || null,
      intentContext: input.intentContext || {},
      sourceAuthorityEnvelope: input.sourceAuthorityEnvelope || null,
      sourceSnippets: Array.isArray(input.sourceSnippets) ? input.sourceSnippets : [],
      uploadedInputs: Array.isArray(input.uploadedInputs) ? input.uploadedInputs : [],
      defaultCurrency: input.defaultCurrency || null
    };
  }

  extractSourceSnippets(sourceSnippets = []) {
    const rawInputs = [];
    const entityInputsList = [];

    sourceSnippets.forEach((snippet, index) => {
      const text = typeof snippet === "string" ? snippet : snippet.text || snippet.content || snippet.body || "";
      if (!text) return;

      const sourceType = snippet.sourceType || "external_source";
      const sourceLabel = snippet.sourceLabel || snippet.sourceName || `external_source_${index + 1}`;
      const sourceReference = snippet.sourceReference || snippet.url || null;

      const extracted = this.extractor.extract({ text, sourceType, sourceLabel, sourceReference });

      rawInputs.push(...(extracted.rawInputs || []).map((item) => ({
        ...item,
        isUserSupplied: sourceType === "user_query" || sourceType === "user_uploaded_file",
        requiresVerification: true
      })));

      entityInputsList.push(extracted.entityInputs);
    });

    return { rawInputs, entityInputs: this.mergeEntityInputs(entityInputsList) };
  }

  extractUploadedInputs(uploadedInputs = []) {
    const rawInputs = [];
    const entityInputsList = [];

    uploadedInputs.forEach((item, index) => {
      const text = typeof item === "string" ? item : item.text || item.content || item.body || "";
      if (!text) return;

      const extracted = this.extractor.extract({
        text,
        sourceType: "user_uploaded_file",
        sourceLabel: item.sourceLabel || item.filename || `uploaded_file_${index + 1}`,
        sourceReference: item.sourceReference || item.filename || null
      });

      rawInputs.push(...(extracted.rawInputs || []).map((raw) => ({
        ...raw,
        isUserSupplied: true,
        requiresVerification: true
      })));

      entityInputsList.push(extracted.entityInputs);
    });

    return { rawInputs, entityInputs: this.mergeEntityInputs(entityInputsList) };
  }

  mergeEntityInputs(entityInputList = []) {
    const merged = {
      businessNames: [],
      programNames: [],
      companyNames: [],
      sourceNames: [],
      jurisdictions: [],
      dates: []
    };

    entityInputList.filter(Boolean).forEach((entityInputs) => {
      merged.businessNames.push(...(entityInputs.businessNames || []));
      merged.programNames.push(...(entityInputs.programNames || []));
      merged.companyNames.push(...(entityInputs.companyNames || []));
      merged.sourceNames.push(...(entityInputs.sourceNames || []));
      merged.jurisdictions.push(...(entityInputs.jurisdictions || []));
      merged.dates.push(...(entityInputs.dates || []));
    });

    return {
      businessNames: uniqueArray(merged.businessNames),
      programNames: uniqueArray(merged.programNames),
      companyNames: uniqueArray(merged.companyNames),
      sourceNames: uniqueArray(merged.sourceNames),
      jurisdictions: uniqueArray(merged.jurisdictions),
      dates: uniqueArray(merged.dates)
    };
  }

  process(input = {}) { return this.ingest(input); }
  execute(input = {}) { return this.ingest(input); }
  run(input = {}) { return this.ingest(input); }
  processInput(input = {}) { return this.ingest(input); }

  static ingest(input = {}, options = {}) {
    return new FinanceDataIngestionController(options).ingest(input);
  }
}

module.exports = {
  FinanceDataIngestionController
};
