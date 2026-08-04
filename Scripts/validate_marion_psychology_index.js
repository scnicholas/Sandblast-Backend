"use strict";

/**
 * validate_marion_psychology_index.js
 *
 * Validates:
 * - Data/marion/manifests/psychology_manifest.json
 * - route/support/compiled outputs declared by the manifest
 * - enabled source files declared by the manifest
 *
 * Usage:
 *   node scripts/validate_marion_psychology_index.js
 *   node scripts/validate_marion_psychology_index.js --root "C:/project"
 */

const fs = require("fs");
const path = require("path");

const VERSION =
  "marion.psychologyIndexValidator/2.1-conflict-resolved-safe-paths";

const DEFAULT_ROOT = process.cwd();
const ALLOWED_RISK = new Set([
  "low",
  "moderate",
  "high",
  "critical"
]);

function parseArgs(argv) {
  const args = {
    root: DEFAULT_ROOT,
    verbose: true
  };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = String(argv[index] || "").trim();

    if (argument === "--root" && argv[index + 1]) {
      args.root = path.resolve(String(argv[index + 1]));
      index += 1;
      continue;
    }

    if (argument === "--quiet") {
      args.verbose = false;
    }
  }

  return args;
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
  const raw = fs
    .readFileSync(filePath, "utf8")
    .replace(/^\uFEFF/, "");

  return JSON.parse(raw);
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" &&
    value.trim().length > 0;
}

function addError(errors, message) {
  errors.push(message);
}

function addWarning(warnings, message) {
  warnings.push(message);
}

function validateManifest(manifest, errors, warnings) {
  if (!isObject(manifest)) {
    addError(errors, "Manifest is not an object.");
    return;
  }

  if (
    !Array.isArray(manifest.sources) ||
    manifest.sources.length === 0
  ) {
    addError(errors, "Manifest.sources is missing or empty.");
  }

  if (!isObject(manifest.outputs)) {
    addError(errors, "Manifest.outputs is missing.");
  } else {
    for (const key of [
      "compiledIndex",
      "routeMap",
      "supportMap"
    ]) {
      if (!isNonEmptyString(manifest.outputs[key])) {
        addError(
          errors,
          `Manifest.outputs.${key} is missing.`
        );
      }
    }
  }

  if (!Array.isArray(manifest.sources)) {
    return;
  }

  const seen = new Set();

  for (const source of manifest.sources) {
    if (!isObject(source)) {
      addError(
        errors,
        "Manifest source entry is not an object."
      );
      continue;
    }

    if (!isNonEmptyString(source.id)) {
      addError(errors, "A manifest source is missing id.");
    }

    if (!isNonEmptyString(source.name)) {
      addError(errors, "A manifest source is missing name.");
    }

    if (!isNonEmptyString(source.path)) {
      addError(
        errors,
        `Source ${source.name || "(unknown)"} missing path.`
      );
    }

    if (!isNonEmptyString(source.subdomain)) {
      addError(
        errors,
        `Source ${source.name || "(unknown)"} missing subdomain.`
      );
    }

    const key = `${source.id}::${source.subdomain}`;

    if (seen.has(key)) {
      addError(
        errors,
        `Duplicate manifest source key: ${key}`
      );
    }

    seen.add(key);

    if (typeof source.priority !== "number") {
      addWarning(
        warnings,
        `Source ${source.name || source.id} has non-numeric priority.`
      );
    }
  }
}

function validateSourceRecord(
  record,
  filePath,
  index,
  errors,
  warnings
) {
  const prefix = `${filePath} [${index}]`;

  if (!isObject(record)) {
    addError(errors, `${prefix} record is not an object.`);
    return;
  }

  const requiredStrings = [
    "id",
    "domain",
    "subdomain",
    "topic",
    "title",
    "summary",
    "supportMode",
    "routeBias"
  ];

  for (const key of requiredStrings) {
    if (!isNonEmptyString(record[key])) {
      addError(
        errors,
        `${prefix} missing required string field: ${key}`
      );
    }
  }

  if (record.domain !== "psychology") {
    addError(
      errors,
      `${prefix} domain must equal "psychology".`
    );
  }

  if (
    "riskLevel" in record &&
    !ALLOWED_RISK.has(
      String(record.riskLevel).trim().toLowerCase()
    )
  ) {
    addError(
      errors,
      `${prefix} invalid riskLevel: ${record.riskLevel}`
    );
  }

  for (const key of [
    "signals",
    "keywords",
    "responseGuidance",
    "contraindications",
    "tags",
    "triggers",
    "responsePattern"
  ]) {
    if (key in record && !Array.isArray(record[key])) {
      addError(
        errors,
        `${prefix} ${key} must be an array if present.`
      );
    }
  }

  if ("toneProfile" in record) {
    if (!isObject(record.toneProfile)) {
      addError(
        errors,
        `${prefix} toneProfile must be an object.`
      );
    } else {
      for (const key of [
        "expressionStyle",
        "deliveryTone",
        "semanticFrame",
        "followupStyle",
        "transitionReadiness"
      ]) {
        if (!isNonEmptyString(record.toneProfile[key])) {
          addWarning(
            warnings,
            `${prefix} toneProfile.${key} is missing or empty.`
          );
        }
      }

      if (
        "transitionTargets" in record.toneProfile &&
        !Array.isArray(record.toneProfile.transitionTargets)
      ) {
        addError(
          errors,
          `${prefix} toneProfile.transitionTargets must be an array.`
        );
      }
    }
  }

  if (
    "supportFlags" in record &&
    !isObject(record.supportFlags)
  ) {
    addError(
      errors,
      `${prefix} supportFlags must be an object.`
    );
  }
}

function validateSourceFiles(
  root,
  manifest,
  errors,
  warnings
) {
  if (!Array.isArray(manifest.sources)) return;

  for (const source of manifest.sources) {
    if (!isObject(source)) continue;

    // Undefined means enabled for backward compatibility.
    if (source.enabled === false) continue;

    if (!isNonEmptyString(source.path)) continue;

    const sourcePath = path.resolve(root, source.path);

    if (!exists(sourcePath)) {
      if (source.critical) {
        addError(
          errors,
          `Critical source file missing: ${sourcePath}`
        );
      } else {
        addWarning(
          warnings,
          `Optional source file missing: ${sourcePath}`
        );
      }
      continue;
    }

    let data;

    try {
      data = readJson(sourcePath);
    } catch (error) {
      addError(
        errors,
        `Failed to parse source file ${sourcePath}: ${error.message}`
      );
      continue;
    }

    if (!Array.isArray(data)) {
      addError(
        errors,
        `Source file must be an array: ${sourcePath}`
      );
      continue;
    }

    data.forEach((record, index) => {
      validateSourceRecord(
        record,
        sourcePath,
        index,
        errors,
        warnings
      );
    });
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
    addError(
      errors,
      "Route map routingRules must be an array."
    );
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
      addError(
        errors,
        `Duplicate route rule id: ${rule.id}`
      );
    } else {
      ids.add(rule.id);
    }

    if (!isObject(rule.when)) {
      addWarning(
        warnings,
        `Route rule ${rule.id || "(unknown)"} missing 'when' object.`
      );
    }

    if (!isObject(rule.routeTo)) {
      addError(
        errors,
        `Route rule ${rule.id || "(unknown)"} missing 'routeTo' object.`
      );
      continue;
    }

    if (
      !isNonEmptyString(
        rule.routeTo.primarySubdomain
      )
    ) {
      addError(
        errors,
        `Route rule ${rule.id || "(unknown)"} missing routeTo.primarySubdomain.`
      );
    }

    if (
      "secondarySubdomains" in rule.routeTo &&
      !Array.isArray(rule.routeTo.secondarySubdomains)
    ) {
      addError(
        errors,
        `Route rule ${rule.id || "(unknown)"} secondarySubdomains must be an array.`
      );
    }
  }
}

function validateSupportMap(
  supportMap,
  errors,
  warnings
) {
  if (!isObject(supportMap)) {
    addError(errors, "Support map is not an object.");
    return;
  }

  if (!isObject(supportMap.supportModes)) {
    addError(
      errors,
      "Support map supportModes is missing."
    );
    return;
  }

  const entries = Object.entries(
    supportMap.supportModes
  );

  if (!entries.length) {
    addError(
      errors,
      "Support map supportModes is empty."
    );
    return;
  }

  for (const [mode, config] of entries) {
    if (!isObject(config)) {
      addError(
        errors,
        `Support mode ${mode} must be an object.`
      );
      continue;
    }

    for (const key of [
      "semanticFrame",
      "deliveryTone",
      "expressionStyle",
      "followupStyle",
      "transitionReadiness"
    ]) {
      if (!isNonEmptyString(config[key])) {
        addWarning(
          warnings,
          `Support mode ${mode} missing ${key}.`
        );
      }
    }

    for (const key of [
      "transitionTargets",
      "responseShape",
      "constraints"
    ]) {
      if (key in config && !Array.isArray(config[key])) {
        addError(
          errors,
          `Support mode ${mode} field ${key} must be an array.`
        );
      }
    }
  }
}

function validateCompiledIndex(
  compiled,
  errors,
  warnings
) {
  if (!isObject(compiled)) {
    addError(
      errors,
      "Compiled index is not an object."
    );
    return;
  }

  if (
    !isNonEmptyString(compiled.domain) ||
    compiled.domain !== "psychology"
  ) {
    addError(
      errors,
      'Compiled index domain must equal "psychology".'
    );
  }

  if (!Array.isArray(compiled.records)) {
    addError(
      errors,
      "Compiled index records must be an array."
    );
    return;
  }

  const ids = new Set();

  compiled.records.forEach((record, index) => {
    validateSourceRecord(
      record,
      "compiled.records",
      index,
      errors,
      warnings
    );

    if (isObject(record) && isNonEmptyString(record.id)) {
      if (ids.has(record.id)) {
        addError(
          errors,
          `Duplicate compiled record id: ${record.id}`
        );
      }
      ids.add(record.id);
    }
  });

  if (!Array.isArray(compiled.priorityOrder)) {
    addWarning(
      warnings,
      "Compiled index priorityOrder is missing or not an array."
    );
  }

  if (!isObject(compiled.subdomains)) {
    addWarning(
      warnings,
      "Compiled index subdomains metadata is missing or invalid."
    );
  }

  if (!isObject(compiled.retrievalPolicy)) {
    addWarning(
      warnings,
      "Compiled index retrievalPolicy is missing or invalid."
    );
  }
}

function validateJsonFile({
  filePath,
  label,
  validate,
  errors,
  warnings
}) {
  if (!exists(filePath)) {
    addError(errors, `${label} missing: ${filePath}`);
    return;
  }

  try {
    validate(
      readJson(filePath),
      errors,
      warnings
    );
  } catch (error) {
    addError(
      errors,
      `Failed to parse ${label.toLowerCase()}: ${error.message}`
    );
  }
}

function validateRoot(rootPath) {
  const root = path.resolve(rootPath || DEFAULT_ROOT);
  const errors = [];
  const warnings = [];

  const manifestPath = path.join(
    root,
    "Data",
    "marion",
    "manifests",
    "psychology_manifest.json"
  );

  let manifest = null;

  if (!exists(manifestPath)) {
    addError(
      errors,
      `Manifest file missing: ${manifestPath}`
    );
  } else {
    try {
      manifest = readJson(manifestPath);
      validateManifest(
        manifest,
        errors,
        warnings
      );
    } catch (error) {
      addError(
        errors,
        `Failed to parse manifest: ${error.message}`
      );
    }
  }

  const outputs =
    manifest && isObject(manifest.outputs)
      ? manifest.outputs
      : null;

  if (manifest) {
    validateSourceFiles(
      root,
      manifest,
      errors,
      warnings
    );
  }

  if (
    outputs &&
    isNonEmptyString(outputs.routeMap)
  ) {
    validateJsonFile({
      filePath: path.resolve(root, outputs.routeMap),
      label: "Route map",
      validate: validateRouteMap,
      errors,
      warnings
    });
  }

  if (
    outputs &&
    isNonEmptyString(outputs.supportMap)
  ) {
    validateJsonFile({
      filePath: path.resolve(root, outputs.supportMap),
      label: "Support map",
      validate: validateSupportMap,
      errors,
      warnings
    });
  }

  if (
    outputs &&
    isNonEmptyString(outputs.compiledIndex)
  ) {
    validateJsonFile({
      filePath: path.resolve(root, outputs.compiledIndex),
      label: "Compiled index",
      validate: validateCompiledIndex,
      errors,
      warnings
    });
  }

  return {
    ok: errors.length === 0,
    version: VERSION,
    root,
    errors,
    warnings
  };
}

function printReport(report, verbose = true) {
  console.log(
    "\n[validate_marion_psychology_index] Validation Report"
  );
  console.log("Version:", report.version);
  console.log("Root:", report.root);
  console.log("Errors:", report.errors.length);
  console.log("Warnings:", report.warnings.length);

  if (verbose && report.warnings.length) {
    console.log("\nWarnings:");
    for (const warning of report.warnings) {
      console.log("  -", warning);
    }
  }

  if (report.errors.length) {
    console.log("\nErrors:");
    for (const error of report.errors) {
      console.log("  -", error);
    }
  } else {
    console.log("\nValidation passed.");
  }
}

function main() {
  const args = parseArgs(process.argv);
  const report = validateRoot(args.root);
  printReport(report, args.verbose);

  if (!report.ok) {
    process.exitCode = 1;
  }

  return report;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(
      "[validate_marion_psychology_index] ERROR:",
      error && error.message
        ? error.message
        : error
    );
    process.exitCode = 1;
  }
}

module.exports = {
  VERSION,
  parseArgs,
  readJson,
  validateManifest,
  validateSourceRecord,
  validateSourceFiles,
  validateRouteMap,
  validateSupportMap,
  validateCompiledIndex,
  validateRoot,
  printReport,
  main
};
