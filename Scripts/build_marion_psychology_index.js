"use strict";

/**
 * build_marion_psychology_index.js
 *
 * Builds:
 *   - Data/marion/compiled/psychology_compiled.json
 *
 * Reads:
 *   - Data/marion/manifests/psychology_manifest.json
 *   - Data/psychology/*.json
 *
 * Optional usage:
 *   node Scripts/build_marion_psychology_index.js
 *   node Scripts/build_marion_psychology_index.js --root "C:/path/to/project"
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_ROOT = process.cwd();

function parseArgs(argv) {
  const args = { root: DEFAULT_ROOT, verbose: true };
  for (let i = 2; i < argv.length; i++) {
    const a = String(argv[i] || "").trim();
    if (a === "--root" && argv[i + 1]) {
      args.root = path.resolve(String(argv[i + 1]));
      i++;
      continue;
    }
    if (a === "--quiet") {
      args.verbose = false;
      continue;
    }
  }
  return args;
}

function log(...parts) {
  console.log("[build_marion_psychology_index]", ...parts);
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  ensureDirSync(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalizeString(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeStringArray(v) {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => normalizeString(x)).filter(Boolean))];
}

function normalizeObject(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : {};
}

function normalizeRiskLevel(v) {
  const s = normalizeString(v).toLowerCase();
  if (["low", "moderate", "high", "critical"].includes(s)) return s;
  return "low";
}

function normalizeToneProfile(v) {
  const obj = normalizeObject(v);
  return {
    expressionStyle: normalizeString(obj.expressionStyle) || "plain_statement",
    deliveryTone: normalizeString(obj.deliveryTone) || "steadying",
    semanticFrame: normalizeString(obj.semanticFrame) || "clarity_building",
    followupStyle: normalizeString(obj.followupStyle) || "reflective",
    transitionReadiness: normalizeString(obj.transitionReadiness) || "medium",
    transitionTargets: normalizeStringArray(obj.transitionTargets)
  };
}

function normalizeSupportFlags(v) {
  const obj = normalizeObject(v);
  return {
    needsStabilization: !!obj.needsStabilization,
    needsContainment: !!obj.needsContainment,
    needsClarification: !!obj.needsClarification,
    needsConnection: !!obj.needsConnection,
    highDistress: !!obj.highDistress,
    crisis: !!obj.crisis,
    recoveryPresent: !!obj.recoveryPresent,
    positivePresent: !!obj.positivePresent
  };
}

function pickSummary(record) {
  return (
    normalizeString(record.summary) ||
    normalizeString(record.interpretation) ||
    normalizeString(record.title) ||
    "No summary provided."
  );
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
  const obj = normalizeObject(record);

  const normalized = {
    id: stableRecordId(obj, subdomain, index),
    domain: "psychology",
    subdomain: normalizeString(obj.subdomain) || subdomain,
    topic: normalizeString(obj.topic) || slugify(obj.title || `entry_${index + 1}`),
    title: normalizeString(obj.title) || `Untitled ${subdomain} record ${index + 1}`,
    summary: pickSummary(obj),
    signals: normalizeStringArray(obj.signals),
    keywords: normalizeStringArray(obj.keywords),
    interpretation: normalizeString(obj.interpretation),
    supportMode: normalizeString(obj.supportMode),
    routeBias: normalizeString(obj.routeBias),
    riskLevel: normalizeRiskLevel(obj.riskLevel),
    supportFlags: normalizeSupportFlags(obj.supportFlags),
    responseGuidance: normalizeStringArray(obj.responseGuidance),
    toneProfile: normalizeToneProfile(obj.toneProfile),
    contraindications: normalizeStringArray(obj.contraindications),
    triggers: normalizeStringArray(obj.triggers),
    responsePattern: normalizeStringArray(obj.responsePattern),
    tags: normalizeStringArray(obj.tags),
    sourceFile: sourcePath.replace(/\\/g, "/")
  };

  if (!normalized.tags.includes("psychology")) {
    normalized.tags.unshift("psychology");
  }
  if (!normalized.tags.includes(normalized.subdomain)) {
    normalized.tags.push(normalized.subdomain);
  }
  if (!normalized.supportMode) {
    normalized.supportMode = "clarify_and_sequence";
  }
  if (!normalized.routeBias) {
    normalized.routeBias = "clarify";
  }

  return normalized;
}

function dedupeRecords(records) {
  const byId = new Map();
  const byFallback = new Set();
  const out = [];

  for (const record of records) {
    if (byId.has(record.id)) {
      continue;
    }

    const fallbackKey = [
      record.subdomain,
      record.topic,
      record.title.toLowerCase()
    ].join("::");

    if (byFallback.has(fallbackKey)) {
      continue;
    }

    byId.set(record.id, true);
    byFallback.add(fallbackKey);
    out.push(record);
  }

  return out;
}

function buildSubdomainMeta(records, manifest) {
  const out = {};
  for (const src of manifest.sources) {
    if (!src.enabled) continue;
    const subdomain = src.subdomain;
    const count = records.filter((r) => r.subdomain === subdomain).length;
    out[subdomain] = {
      priority: Number(src.priority) || 999,
      description: normalizeString(src.purpose),
      recordCount: count
    };
  }
  return out;
}

function buildPriorityOrder(manifest) {
  return [...manifest.sources]
    .filter((s) => s.enabled)
    .sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999))
    .map((s) => s.subdomain);
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Manifest is not a valid object.");
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error("Manifest.sources is missing or empty.");
  }
  if (!manifest.outputs || typeof manifest.outputs !== "object") {
    throw new Error("Manifest.outputs is missing.");
  }
  if (!normalizeString(manifest.outputs.compiledIndex)) {
    throw new Error("Manifest.outputs.compiledIndex is missing.");
  }
}

function main() {
  const args = parseArgs(process.argv);
  const root = args.root;

  const manifestPath = path.join(root, "Data", "marion", "manifests", "psychology_manifest.json");
  if (!exists(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  validateManifestShape(manifest);

  const allRecords = [];
  const sourceFiles = [];

  for (const src of manifest.sources) {
    if (!src.enabled) continue;

    const relPath = normalizeString(src.path);
    const subdomain = normalizeString(src.subdomain);
    const sourcePath = path.join(root, relPath);

    if (!exists(sourcePath)) {
      if (src.critical) {
        throw new Error(`Critical source file missing: ${sourcePath}`);
      }
      continue;
    }

    const data = readJson(sourcePath);
    if (!Array.isArray(data)) {
      throw new Error(`Source file must be an array: ${sourcePath}`);
    }

    sourceFiles.push(relPath.replace(/\\/g, "/"));

    for (let i = 0; i < data.length; i++) {
      const normalized = normalizeRecord(data[i], subdomain, i, relPath);
      allRecords.push(normalized);
    }
  }

  const deduped = dedupeRecords(allRecords);

  const compiled = {
    version: normalizeString(manifest.version) || "1.0.0",
    domain: "psychology",
    compiledAt: new Date().toISOString(),
    description:
      "Compiled psychology knowledge index for Marion ingestion. Aggregates affect interpretation, attachment patterns, cognitive distortions, crisis flags, support strategies, and trauma sensitivity into a unified retrieval structure.",
    sourceFiles,
    priorityOrder: buildPriorityOrder(manifest),
    subdomains: buildSubdomainMeta(deduped, manifest),
    retrievalPolicy: {
      mode: "priority_then_relevance",
      maxPrimaryMatches: 3,
      maxSecondaryMatches: 4,
      preferCrisisFirst: true,
      preferSupportStrategyLast: true,
      requireSignalOrKeywordHit: true,
      allowSubdomainBlending: true
    },
    records: deduped
  };

  const outputPath = path.join(root, normalizeString(manifest.outputs.compiledIndex));
  writeJson(outputPath, compiled);

  if (args.verbose) {
    log(`Root: ${root}`);
    log(`Manifest: ${manifestPath}`);
    log(`Compiled output written: ${outputPath}`);
    log(`Sources loaded: ${sourceFiles.length}`);
    log(`Records written: ${deduped.length}`);
  }
}

try {
  main();
} catch (err) {
  console.error("[build_marion_psychology_index] ERROR:", err && err.message ? err.message : err);
  process.exit(1);
<<<<<<< HEAD
}
=======
}
>>>>>>> 078f7f11 (Add News Canada RSS service and rss-parser)
