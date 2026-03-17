"use strict";

/**
 * validate_marion_psychology_index.js
 *
 * Validates:
 *   - Data/marion/manifests/psychology_manifest.json
 *   - Data/marion/maps/psychology_route_map.json
 *   - Data/marion/maps/psychology_support_map.json
 *   - Data/marion/compiled/psychology_compiled.json
 *   - all source files declared in the manifest
 *
 * Usage:
 *   node Scripts/validate_marion_psychology_index.js
 *   node Scripts/validate_marion_psychology_index.js --root "C:/path/to/project"
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_ROOT = process.cwd();
const ALLOWED_RISK = new Set(["low", "moderate", "high", "critical"]);

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

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isArrayOfStrings(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function addError(errors, msg) {
  errors.push(msg);
}

function addWarn(warnings, msg) {
  warnings.push(msg);
}

function validateManifest(manifest, errors, warnings) {
  if (!isObject(manifest)) {
    addError(errors, "Manifest is not an object.");
    return;
  }

  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    addError(errors, "Manifest.sources is missing or empty.");
  }

  if (!isObject(manifest.outputs)) {
    addError(errors, "Manifest.outputs is missing.");
  } else {
    if (!isNonEmptyString(manifest.outputs.compiledIndex)) {
      addError(errors, "Manifest.outputs.compiledIndex is missing.");
    }
    if (!isNonEmptyString(manifest.outputs.routeMap)) {
      addError(errors, "Manifest.outputs.routeMap is missing.");
    }
    if (!isNonEmptyString(manifest.outputs.supportMap)) {
      addError(errors, "Manifest.outputs.supportMap is missing.");
    }
  }

  if (Array.isArray(manifest.sources)) {
    const seen = new Set();
    for (const src of manifest.sources) {
      if (!isObject(src)) {
        addError(errors, "Manifest source entry is not an object.");
        continue;
      }
      if (!isNonEmptyString(src.id)) addError(errors, "A manifest source is missing id.");
      if (!isNonEmptyString(src.name)) addError(errors, "A manifest source is missing name.");
      if (!isNonEmptyString(src.path)) addError(errors, `Source ${src.name || "(unknown)"} missing path.`);
      if (!isNonEmptyString(src.subdomain)) addError(errors, `Source ${src.name || "(unknown)"} missing subdomain.`);

      const key = `${src.id}::${src.subdomain}`;
      if (seen.has(key)) {
        addError(errors, `Duplicate manifest source key: ${key}`);
      }
      seen.add(key);

      if (typeof src.priority !== "number") {
        addWarn(warnings, `Source ${src.name || src.id} has non-numeric priority.`);
      }
    }
  }
}

function validateSourceRecord(record, filePath, index, errors, warnings) {
  const prefix = `${filePath} [${index}]`;

  if (!isObject(record)) {
    addError(errors, `${prefix} record is not an object.`);
    return;
  }

  const requiredStrings = ["id", "domain", "subdomain", "topic", "title", "summary", "supportMode", "routeBias"];
  for (const key of requiredStrings) {
    if (!isNonEmptyString(record[key])) {
      addError(errors, `${prefix} missing required string field: ${key}`);
    }
  }

  if (record.domain !== "psychology") {
    addError(errors, `${prefix} domain must equal "psychology".`);
  }

  if ("riskLevel" in record && !ALLOWED_RISK.has(String(record.riskLevel).trim().toLowerCase())) {
    addError(errors, `${prefix} invalid riskLevel: ${record.riskLevel}`);
  }

  const arraysToCheck = ["signals", "keywords", "responseGuidance", "contraindications", "tags", "triggers", "responsePattern"];
  for (const key of arraysToCheck) {
    if (key in record && !Array.isArray(record[key])) {
      addError(errors, `${prefix} ${key} must be an array if present.`);
    }
  }

  if ("toneProfile" in record) {
    if (!isObject(record.toneProfile)) {
      addError(errors, `${prefix} toneProfile must be an object.`);
    } else {
      const tp = record.toneProfile;
      const tpKeys = ["expressionStyle", "deliveryTone", "semanticFrame", "followupStyle", "transitionReadiness"];
      for (const key of tpKeys) {
        if (!isNonEmptyString(tp[key])) {
          addWarn(warnings, `${prefix} toneProfile.${key} is missing or empty.`);
        }
      }
      if ("transitionTargets" in tp && !Array.isArray(tp.transitionTargets)) {
        addError(errors, `${prefix} toneProfile.transitionTargets must be an array.`);
      }
    }
  }

  if ("supportFlags" in record && !isObject(record.supportFlags)) {
    addError(errors, `${prefix} supportFlags must be an object.`);
  }
}

function validateSourceFiles(root, manifest, errors, warnings) {
  if (!Array.isArray(manifest.sources)) return;

  for (const src of manifest.sources) {
    if (!src.enabled) continue;
    const sourcePath = path.join(root, src.path);

    if (!exists(sourcePath)) {
      if (src.critical) {
        addError(errors, `Critical source file missing: ${sourcePath}`);
      } else {
        addWarn(warnings, `Optional source file missing: ${sourcePath}`);
      }
      continue;
    }

    let data;
    try {
      data = readJson(sourcePath);
    } catch (err) {
      addError(errors, `Failed to parse source file ${sourcePath}: ${err.message}`);
      continue;
    }

    if (!Array.isArray(data)) {
      addError(errors, `Source file must be an array: ${sourcePath}`);
      continue;
    }

    data.forEach((record, idx) => validateSourceRecord(record, sourcePath, idx, errors, warnings));
  }
}

function validateRouteMap(routeMap, errors, warnings) {
  if (!isObject(routeMap)) {
    addError(errors, "Route map is not an object.");
    return;
  }

  if (!isObject(routeMap.defaultRoute)) {
    addError(errors, "Route map defaultRoute is missing.");
  }

  if (!Array.isArray(routeMap.routingRules)) {
    addError(errors, "Route map routingRules must be an array.");
    return;
  }

  const ids = new Set();
  for (const rule of routeMap.routingRules) {
    if (!isObject(rule)) {
      addError(errors, "A route rule is not an object.");
      continue;
    }
    if (!isNonEmptyString(rule.id)) {
      addError(errors, "A route rule is missing id.");
    } else if (ids.has(rule.id)) {
      addError(errors, `Duplicate route rule id: ${rule.id}`);
    } else {
      ids.add(rule.id);
    }
    if (!isObject(rule.when)) {
      addWarn(warnings, `Route rule ${rule.id || "(unknown)"} missing 'when' object.`);
    }
    if (!isObject(rule.routeTo)) {
      addError(errors, `Route rule ${rule.id || "(unknown)"} missing 'routeTo' object.`);
      continue;
    }
    if (!isNonEmptyString(rule.routeTo.primarySubdomain)) {
      addError(errors, `Route rule ${rule.id || "(unknown)"} missing routeTo.primarySubdomain.`);
    }
    if ("secondarySubdomains" in rule.routeTo && !Array.isArray(rule.routeTo.secondarySubdomains)) {
      addError(errors, `Route rule ${rule.id || "(unknown)"} secondarySubdomains must be an array.`);
    }
  }
}

function validateSupportMap(supportMap, errors, warnings) {
  if (!isObject(supportMap)) {
    addError(errors, "Support map is not an object.");
    return;
  }
  if (!isObject(supportMap.supportModes)) {
    addError(errors, "Support map supportModes is missing.");
    return;
  }

  const entries = Object.entries(supportMap.supportModes);
  if (entries.length === 0) {
    addError(errors, "Support map supportModes is empty.");
    return;
  }

  for (const [mode, cfg] of entries) {
    if (!isObject(cfg)) {
      addError(errors, `Support mode ${mode} must be an object.`);
      continue;
    }

    const requiredStrings = [
      "semanticFrame",
      "deliveryTone",
      "expressionStyle",
      "followupStyle",
      "transitionReadiness"
    ];

    for (const key of requiredStrings) {
      if (!isNonEmptyString(cfg[key])) {
        addWarn(warnings, `Support mode ${mode} missing ${key}.`);
      }
    }

    const arraysToCheck = ["transitionTargets", "responseShape", "constraints"];
    for (const key of arraysToCheck) {
      if (key in cfg && !Array.isArray(cfg[key])) {
        addError(errors, `Support mode ${mode} field ${key} must be an array.`);
      }
    }
  }
}

function validateCompiledIndex(compiled, errors, warnings) {
  if (!isObject(compiled)) {
    addError(errors, "Compiled index is not an object.");
    return;
  }

  if (!isNonEmptyString(compiled.domain) || compiled.domain !== "psychology") {
    addError(errors, `Compiled index domain must equal "psychology".`);
  }
  if (!Array.isArray(compiled.records)) {
    addError(errors, "Compiled index records must be an array.");
    return;
  }

  const ids = new Set();
  for (let i = 0; i < compiled.records.length; i++) {
    const rec = compiled.records[i];
    validateSourceRecord(rec, "compiled.records", i, errors, warnings);

    if (isObject(rec) && isNonEmptyString(rec.id)) {
      if (ids.has(rec.id)) {
        addError(errors, `Duplicate compiled record id: ${rec.id}`);
      }
      ids.add(rec.id);
    }
  }

  if (!Array.isArray(compiled.priorityOrder)) {
    addWarn(warnings, "Compiled index priorityOrder is missing or not an array.");
  }
  if (!isObject(compiled.subdomains)) {
    addWarn(warnings, "Compiled index subdomains metadata is missing or invalid.");
  }
  if (!isObject(compiled.retrievalPolicy)) {
    addWarn(warnings, "Compiled index retrievalPolicy is missing or invalid.");
  }
}

function main() {
  const args = parseArgs(process.argv);
  const root = args.root;
  const errors = [];
  const warnings = [];

  const manifestPath = path.join(root, "Data", "marion", "manifests", "psychology_manifest.json");
  if (!exists(manifestPath)) {
    addError(errors, `Manifest file missing: ${manifestPath}`);
  }

  let manifest = null;
  if (exists(manifestPath)) {
    try {
      manifest = readJson(manifestPath);
      validateManifest(manifest, errors, warnings);
    } catch (err) {
      addError(errors, `Failed to parse manifest: ${err.message}`);
    }
  }

  if (manifest) {
    validateSourceFiles(root, manifest, errors, warnings);

    const routeMapPath = path.join(root, manifest.outputs.routeMap);
    const supportMapPath = path.join(root, manifest.outputs.supportMap);
    const compiledPath = path.join(root, manifest.outputs.compiledIndex);

    if (!exists(routeMapPath)) {
      addError(errors, `Route map missing: ${routeMapPath}`);
    } else {
      try {
        const routeMap = readJson(routeMapPath);
        validateRouteMap(routeMap, errors, warnings);
      } catch (err) {
        addError(errors, `Failed to parse route map: ${err.message}`);
      }
    }

    if (!exists(supportMapPath)) {
      addError(errors, `Support map missing: ${supportMapPath}`);
    } else {
      try {
        const supportMap = readJson(supportMapPath);
        validateSupportMap(supportMap, errors, warnings);
      } catch (err) {
        addError(errors, `Failed to parse support map: ${err.message}`);
      }
    }

    if (!exists(compiledPath)) {
      addError(errors, `Compiled index missing: ${compiledPath}`);
    } else {
      try {
        const compiled = readJson(compiledPath);
        validateCompiledIndex(compiled, errors, warnings);
      } catch (err) {
        addError(errors, `Failed to parse compiled index: ${err.message}`);
      }
    }
  }

  console.log("\n[validate_marion_psychology_index] Validation Report");
  console.log("Root:", root);
  console.log("Errors:", errors.length);
  console.log("Warnings:", warnings.length);

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) {
      console.log("  -", w);
    }
  }

  if (errors.length) {
    console.log("\nErrors:");
    for (const e of errors) {
      console.log("  -", e);
    }
    process.exit(1);
  }

  console.log("\nValidation passed.");
}

try {
  main();
} catch (err) {
  console.error("[validate_marion_psychology_index] ERROR:", err && err.message ? err.message : err);
  process.exit(1);
}
