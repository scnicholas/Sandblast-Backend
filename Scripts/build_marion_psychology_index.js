"use strict";

/**
 * Scripts/build_marion_psychology_index.js
 *
 * Builds Data/marion/compiled/psychology_compiled.json from the psychology
 * manifest and enabled source files. Manifest paths are constrained to the
 * supplied backend root.
 *
 * Usage:
 *   node Scripts/build_marion_psychology_index.js
 *   node Scripts/build_marion_psychology_index.js --root "C:/path/to/project"
 */

const fs = require("fs");
const path = require("path");

const VERSION = "marion.psychologyIndexBuilder/2.1-path-cohesion";
const DEFAULT_ROOT = process.cwd();

function parseArgs(argv = process.argv) {
  const args = { root: DEFAULT_ROOT, verbose: true };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = String(argv[index] || "").trim();
    if (argument === "--root" && argv[index + 1]) {
      args.root = path.resolve(String(argv[index + 1]));
      index += 1;
      continue;
    }
    if (argument === "--quiet") args.verbose = false;
  }

  return args;
}

function log(...parts) {
  console.log("[build_marion_psychology_index]", ...parts);
}

function ensureDirSync(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, data) {
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function resolveInsideRoot(root, relativePath, label = "path") {
  const resolvedRoot = path.resolve(root);
  const normalizedRelative = normalizeString(relativePath);
  if (!normalizedRelative) throw new Error(`${label} is missing.`);
  if (path.isAbsolute(normalizedRelative)) throw new Error(`${label} must be relative to the backend root: ${normalizedRelative}`);

  const resolved = path.resolve(resolvedRoot, normalizedRelative);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the backend root: ${normalizedRelative}`);
  }

  return resolved;
}

function normalizeRiskLevel(value) {
  const normalized = normalizeString(value).toLowerCase();
  return ["low", "moderate", "high", "critical"].includes(normalized)
    ? normalized
    : "low";
}

function normalizeToneProfile(value) {
  const source = normalizeObject(value);
  return {
    expressionStyle: normalizeString(source.expressionStyle) || "plain_statement",
    deliveryTone: normalizeString(source.deliveryTone) || "steadying",
    semanticFrame: normalizeString(source.semanticFrame) || "clarity_building",
    followupStyle: normalizeString(source.followupStyle) || "reflective",
    transitionReadiness: normalizeString(source.transitionReadiness) || "medium",
    transitionTargets: normalizeStringArray(source.transitionTargets)
  };
}

function normalizeSupportFlags(value) {
  const source = normalizeObject(value);
  return {
    needsStabilization: Boolean(source.needsStabilization),
    needsContainment: Boolean(source.needsContainment),
    needsClarification: Boolean(source.needsClarification),
    needsConnection: Boolean(source.needsConnection),
    highDistress: Boolean(source.highDistress),
    crisis: Boolean(source.crisis),
    recoveryPresent: Boolean(source.recoveryPresent),
    positivePresent: Boolean(source.positivePresent)
  };
}

function pickSummary(record) {
  return normalizeString(record.summary) ||
    normalizeString(record.interpretation) ||
    normalizeString(record.title) ||
    "No summary provided.";
}

function slugify(input) {
  return normalizeString(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function stableRecordId(record, subdomain, index) {
  const explicit = normalizeString(record.id);
  if (explicit) return explicit;
  const topic = normalizeString(record.topic) || normalizeString(record.title) || `entry_${index + 1}`;
  return `psy_${slugify(subdomain)}_${String(index + 1).padStart(3, "0")}_${slugify(topic)}`;
}

function normalizeRecord(record, subdomain, index, sourcePath) {
  const source = normalizeObject(record);
  const normalized = {
    id: stableRecordId(source, subdomain, index),
    domain: "psychology",
    subdomain: normalizeString(source.subdomain) || subdomain,
    topic: normalizeString(source.topic) || slugify(source.title || `entry_${index + 1}`),
    title: normalizeString(source.title) || `Untitled ${subdomain} record ${index + 1}`,
    summary: pickSummary(source),
    signals: normalizeStringArray(source.signals),
    keywords: normalizeStringArray(source.keywords),
    interpretation: normalizeString(source.interpretation),
    supportMode: normalizeString(source.supportMode) || "clarify_and_sequence",
    routeBias: normalizeString(source.routeBias) || "clarify",
    riskLevel: normalizeRiskLevel(source.riskLevel),
    supportFlags: normalizeSupportFlags(source.supportFlags),
    responseGuidance: normalizeStringArray(source.responseGuidance),
    toneProfile: normalizeToneProfile(source.toneProfile),
    contraindications: normalizeStringArray(source.contraindications),
    triggers: normalizeStringArray(source.triggers),
    responsePattern: normalizeStringArray(source.responsePattern),
    tags: normalizeStringArray(source.tags),
    sourceFile: sourcePath.replace(/\\/g, "/")
  };

  if (!normalized.tags.includes("psychology")) normalized.tags.unshift("psychology");
  if (!normalized.tags.includes(normalized.subdomain)) normalized.tags.push(normalized.subdomain);
  return normalized;
}

function dedupeRecords(records) {
  const ids = new Set();
  const fallbackKeys = new Set();
  const output = [];

  for (const record of records) {
    if (ids.has(record.id)) continue;
    const fallbackKey = [record.subdomain, record.topic, record.title.toLowerCase()].join("::");
    if (fallbackKeys.has(fallbackKey)) continue;
    ids.add(record.id);
    fallbackKeys.add(fallbackKey);
    output.push(record);
  }

  return output;
}

function buildSubdomainMeta(records, manifest) {
  const output = {};
  for (const source of manifest.sources) {
    if (!source.enabled) continue;
    const subdomain = normalizeString(source.subdomain);
    output[subdomain] = {
      priority: Number(source.priority) || 999,
      description: normalizeString(source.purpose),
      recordCount: records.filter((record) => record.subdomain === subdomain).length
    };
  }
  return output;
}

function buildPriorityOrder(manifest) {
  return [...manifest.sources]
    .filter((source) => source.enabled)
    .sort((left, right) => (Number(left.priority) || 999) - (Number(right.priority) || 999))
    .map((source) => normalizeString(source.subdomain))
    .filter(Boolean);
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Manifest is not a valid object.");
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error("Manifest.sources is missing or empty.");
  }
  if (!manifest.outputs || typeof manifest.outputs !== "object" || Array.isArray(manifest.outputs)) {
    throw new Error("Manifest.outputs is missing.");
  }
  if (!normalizeString(manifest.outputs.compiledIndex)) {
    throw new Error("Manifest.outputs.compiledIndex is missing.");
  }
}

function buildPsychologyIndex({ root = DEFAULT_ROOT, verbose = true } = {}) {
  const resolvedRoot = path.resolve(root);
  const manifestPath = resolveInsideRoot(
    resolvedRoot,
    path.join("Data", "marion", "manifests", "psychology_manifest.json"),
    "psychology manifest path"
  );

  if (!exists(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`);
  const manifest = readJson(manifestPath);
  validateManifestShape(manifest);

  const allRecords = [];
  const sourceFiles = [];

  for (const manifestSource of manifest.sources) {
    if (!manifestSource || manifestSource.enabled === false) continue;
    const relativePath = normalizeString(manifestSource.path);
    const subdomain = normalizeString(manifestSource.subdomain);
    if (!subdomain) throw new Error(`Manifest source is missing subdomain: ${relativePath || "(unknown)"}`);

    const sourcePath = resolveInsideRoot(resolvedRoot, relativePath, "psychology source path");
    if (!exists(sourcePath)) {
      if (manifestSource.critical) throw new Error(`Critical source file missing: ${sourcePath}`);
      continue;
    }

    const data = readJson(sourcePath);
    if (!Array.isArray(data)) throw new Error(`Source file must be an array: ${sourcePath}`);
    sourceFiles.push(relativePath.replace(/\\/g, "/"));

    for (let index = 0; index < data.length; index += 1) {
      allRecords.push(normalizeRecord(data[index], subdomain, index, relativePath));
    }
  }

  const records = dedupeRecords(allRecords);
  const compiled = {
    version: normalizeString(manifest.version) || "1.0.0",
    domain: "psychology",
    compiledAt: new Date().toISOString(),
    description: "Compiled psychology knowledge index for Marion ingestion. Aggregates affect interpretation, attachment patterns, cognitive distortions, crisis flags, support strategies, and trauma sensitivity into a unified retrieval structure.",
    sourceFiles,
    priorityOrder: buildPriorityOrder(manifest),
    subdomains: buildSubdomainMeta(records, manifest),
    retrievalPolicy: {
      mode: "priority_then_relevance",
      maxPrimaryMatches: 3,
      maxSecondaryMatches: 4,
      preferCrisisFirst: true,
      preferSupportStrategyLast: true,
      requireSignalOrKeywordHit: true,
      allowSubdomainBlending: true
    },
    records
  };

  const outputPath = resolveInsideRoot(resolvedRoot, manifest.outputs.compiledIndex, "compiled psychology output path");
  writeJson(outputPath, compiled);

  if (verbose) {
    log(`Root: ${resolvedRoot}`);
    log(`Manifest: ${manifestPath}`);
    log(`Compiled output written: ${outputPath}`);
    log(`Sources loaded: ${sourceFiles.length}`);
    log(`Records written: ${records.length}`);
  }

  return { root: resolvedRoot, manifestPath, outputPath, compiled };
}

function main(argv = process.argv) {
  const args = parseArgs(argv);
  return buildPsychologyIndex(args);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("[build_marion_psychology_index] ERROR:", error && error.message ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  VERSION,
  parseArgs,
  resolveInsideRoot,
  normalizeRecord,
  dedupeRecords,
  validateManifestShape,
  buildPsychologyIndex,
  main
};
