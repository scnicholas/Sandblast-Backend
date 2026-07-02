"use strict";

/**
 * R18D Layer 03 — Finance Data Ingestion Controller
 * Orchestrates finance raw input extraction, metric detection, assumption capture,
 * missing-input resolution, and Layer 03 envelope creation.
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

const DEFAULT_PACK_DIR = path.resolve(__dirname, "../../../../Domains/finance/packs");

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return {
      __loadError: true,
      filePath,
      message: error.message,
      fallback
    };
  }
}

function normalize(value) {
  return String(value || "").toLowerCase().trim();
}

function uniqueArray(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
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

    this.extractor = options.extractor || new FinanceInputExtractor({
      defaultCurrency: options.defaultCurrency || null
    });

    this.metricDetector = options.metricDetector || new FinanceMetricDetector({
      packDir: this.packDir
    });

    this.assumptionCollector = options.assumptionCollector || new FinanceAssumptionCollector();

    this.missingInputResolver = options.missingInputResolver || new FinanceMissingInputResolver({
      packDir: this.packDir
    });
  }

  getLoadStatus() {
    return {
      packDir: this.packDir,
      ingestionSchemaLoaded: !this.schema.__loadError,
      sourceTypesLoaded: !this.sourceTypes.__loadError,
      metricDetector: this.metricDetector.getLoadStatus(),
      missingInputResolver: this.missingInputResolver.getLoadStatus(),
      errors: [
        this.schema.__loadError ? this.schema : null,
        this.sourceTypes.__loadError ? this.sourceTypes : null
      ].filter(Boolean)
    };
  }

  ingest(input = {}) {
    const normalizedInput = this.normalizeInput(input);

    const extracted = this.extractor.extract({
      text: normalizedInput.query,
      sourceType: "user_query",
      sourceLabel: "user_query",
      defaultCurrency: normalizedInput.defaultCurrency
    });

    const sourceExtracted = this.extractSourceSnippets(normalizedInput.sourceSnippets);
    const uploadedExtracted = this.extractUploadedInputs(normalizedInput.uploadedInputs);

    const rawInputs = [
      ...extracted.rawInputs,
      ...sourceExtracted.rawInputs,
      ...uploadedExtracted.rawInputs
    ];

    const entityInputs = this.mergeEntityInputs([
      extracted.entityInputs,
      sourceExtracted.entityInputs,
      uploadedExtracted.entityInputs,
      {
        jurisdictions: normalizedInput.intentContext.detectedJurisdictions || normalizedInput.intentContext.jurisdictions || []
      }
    ]);

    const detected = this.metricDetector.detect(rawInputs, {
      queryText: normalizedInput.query,
      originalQuery: normalizedInput.query,
      entityInputs,
      intentContext: normalizedInput.intentContext
    });

    const assumptions = this.assumptionCollector.collect({
      queryText: normalizedInput.query,
      rawInputs,
      metricInputs: detected.metricInputs
    });

    const claimTargets = detected.claimTargets;

    const missingInputs = this.missingInputResolver.resolve({
      queryText: normalizedInput.query,
      metricInputs: assumptions.metricInputs,
      claimTargets,
      entityInputs,
      intentContext: normalizedInput.intentContext
    });

    return FinanceIngestionEnvelope.create({
      originalQuery: normalizedInput.query,
      normalizedQuery: normalize(normalizedInput.query),
      primaryIntent: normalizedInput.intentContext.primaryIntent || normalizedInput.intentContext.intentId || null,
      secondaryIntents: normalizedInput.intentContext.secondaryIntents || [],
      jurisdictions: entityInputs.jurisdictions || [],
      requiresFreshData: Boolean(normalizedInput.intentContext.requiresFreshData),
      sourceAuthorityEnvelope: normalizedInput.sourceAuthorityEnvelope,

      claimTargets,
      rawInputs: assumptions.rawInputs,
      metricInputs: assumptions.metricInputs,
      entityInputs,
      assumptions: assumptions.assumptions,
      missingInputs,

      requiresSourceVerification:
        Boolean(normalizedInput.intentContext.requiresFreshData) ||
        missingInputs.some((item) => item.missingInput === "current_official_source")
    });
  }

  normalizeInput(input = {}) {
    if (typeof input === "string") {
      return {
        query: input,
        intentContext: {},
        sourceAuthorityEnvelope: null,
        sourceSnippets: [],
        uploadedInputs: [],
        defaultCurrency: null
      };
    }

    return {
      query: input.query || input.originalQuery || input.text || "",
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
      const text = typeof snippet === "string" ? snippet : snippet.text || snippet.content || "";
      if (!text) return;

      const sourceType = snippet.sourceType || "external_source";
      const sourceLabel = snippet.sourceLabel || snippet.sourceName || `external_source_${index + 1}`;
      const sourceReference = snippet.sourceReference || snippet.url || null;

      const extracted = this.extractor.extract({
        text,
        sourceType,
        sourceLabel,
        sourceReference
      });

      rawInputs.push(...extracted.rawInputs.map((item) => ({
        ...item,
        isUserSupplied: sourceType === "user_query" || sourceType === "user_uploaded_file",
        requiresVerification: true
      })));

      entityInputsList.push(extracted.entityInputs);
    });

    return {
      rawInputs,
      entityInputs: this.mergeEntityInputs(entityInputsList)
    };
  }

  extractUploadedInputs(uploadedInputs = []) {
    const rawInputs = [];
    const entityInputsList = [];

    uploadedInputs.forEach((item, index) => {
      const text = typeof item === "string" ? item : item.text || item.content || "";
      if (!text) return;

      const extracted = this.extractor.extract({
        text,
        sourceType: "user_uploaded_file",
        sourceLabel: item.sourceLabel || item.filename || `uploaded_file_${index + 1}`,
        sourceReference: item.sourceReference || item.filename || null
      });

      rawInputs.push(...extracted.rawInputs.map((raw) => ({
        ...raw,
        isUserSupplied: true,
        requiresVerification: true
      })));

      entityInputsList.push(extracted.entityInputs);
    });

    return {
      rawInputs,
      entityInputs: this.mergeEntityInputs(entityInputsList)
    };
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

  static ingest(input = {}, options = {}) {
    return new FinanceDataIngestionController(options).ingest(input);
  }
}

module.exports = {
  FinanceDataIngestionController
};
