"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const { performance } = require("perf_hooks");

const ROOT = path.resolve(__dirname, "../../../..");
const ROUND_DIR = __dirname;

const PHASE_A_HARD_STOP_LAYER = 24;
const CONVERSATION_HARD_STOP_LAYER = 26;
const GLOBAL_HARD_STOP_LAYER = 28;
const COGNITIVE_SUPERVISION_INTEGRATION_TEST =
  "tests/marion/marionCognitiveSupervisionIntegration.test.js";

const WARNING_RE =
  /Accessing non-existent property|inside circular dependency/i;

const CONFLICT_RE =
  /^(?:<<<<<<<|=======|>>>>>>>)/m;

const DIAGNOSTIC_RE =
  /\b(?:TypeError|ReferenceError|SyntaxError|secret diagnostic|diagnostic packet|stack trace|recovery path engaged)\b/i;

const SIX_DOMAINS = Object.freeze([
  "psychology",
  "english",
  "ai",
  "cyber",
  "finance",
  "law"
]);

const CANONICAL_METACOGNITION_ROOT = "Data/marion/runtime/metacognition";
const METACOGNITION_FILES = Object.freeze([
  "marionMetaReasoner.js",
  "marionReflectionEngine.js",
  "marionConfidenceAnalyzer.js",
  "marionBiasDetector.js",
  "marionKnowledgeGapDetector.js",
  "marionReasoningAuditor.js",
  "marionResponseEvaluator.js",
  "marionQualityCalibrator.js",
  "marionLearningSignalCollector.js",
  "marionAdaptiveImprovementEngine.js",
  "marionMetaReasoningPolicy.js",
  "marionMetaTelemetry.js",
  "marionReflectionEnvelope.js"
]);
const CANONICAL_METACOGNITION_FILES = Object.freeze(
  METACOGNITION_FILES.map((name) => `${CANONICAL_METACOGNITION_ROOT}/${name}`)
);


const CORE_AUTHORITIES = Object.freeze([
  "Data/marion/runtime/marionBridge.js",
  "Data/marion/runtime/composeMarionResponse.js",
  "Data/marion/runtime/marionFinalEnvelope.js",
  "Data/marion/runtime/marionIntentRouter.js",
  "Data/marion/runtime/marionDomainRegistry.js",
  "Data/marion/runtime/supervision/marionCognitiveSupervisor.js",
  "utils/chatEngine.js",
  "utils/stateSpine.js"
]);

function abs(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function normalizePath(value) {
  return path.normalize(value).toLowerCase();
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeString(value) {
  try {
    return String(value == null ? "" : value);
  } catch (_) {
    return "";
  }
}

function readText(relativePath) {
  const file = abs(relativePath);

  assert.ok(
    fs.existsSync(file),
    `Required file is missing: ${relativePath}`
  );

  const source = fs.readFileSync(file, "utf8");

  assert.strictEqual(
    CONFLICT_RE.test(source),
    false,
    `Merge-conflict marker found: ${relativePath}`
  );

  return source;
}

function readJson(relativePath) {
  const source = readText(relativePath);

  try {
    return JSON.parse(source);
  } catch (error) {
    assert.fail(
      `Invalid JSON in ${relativePath}: ${
        error && error.message ? error.message : error
      }`
    );
  }
}

function resolveExact(relativePath) {
  const candidate = abs(relativePath);

  assert.ok(
    fs.existsSync(candidate),
    `Required module is missing: ${relativePath}`
  );

  const resolved = require.resolve(candidate);

  assert.strictEqual(
    normalizePath(resolved),
    normalizePath(candidate),
    `Module resolution drifted: ${relativePath}`
  );

  return resolved;
}

function loadExact(relativePath) {
  const resolved = resolveExact(relativePath);

  try {
    return require(resolved);
  } catch (error) {
    throw new Error(
      [
        `Module failed during loading: ${relativePath}`,
        `Resolved: ${resolved}`,
        `Cause: ${error && error.message ? error.message : error}`
      ].join("\n"),
      { cause: error }
    );
  }
}


function assertCanonicalMetacognitionTree() {
  const missing=CANONICAL_METACOGNITION_FILES.filter((relativePath)=>!fs.existsSync(abs(relativePath)));
  assert.deepStrictEqual(missing,[],`Canonical Layer 28 metacognition files are missing: ${missing.join(", ")}`);
  for(const relativePath of CANONICAL_METACOGNITION_FILES) resolveExact(relativePath);
  return [...CANONICAL_METACOGNITION_FILES];
}
function assertSupervisorUsesCanonicalMetacognitionPath() {
  const source=readText("Data/marion/runtime/supervision/marionCognitiveSupervisor.js");
  assert.strictEqual(/path\.join\(\s*__dirname\s*,\s*["']metacognition["']\s*\)/m.test(source),false,
    "Cognitive Supervisor still resolves stale supervision/metacognition.");
  assert.ok(/path\.join\(\s*__dirname\s*,\s*["']\.\.["']\s*,\s*["']metacognition["']\s*\)/m.test(source),
    "Cognitive Supervisor does not resolve canonical runtime/metacognition.");
  return true;
}

const EXPECTED_ROUND6_COMPANION_FILES = Object.freeze([
  "run_round6_certification.js",
  "round6_1_certification_chain_integrity.test.js",
  "round6_2_runtime_authority_path_integrity.test.js",
  "round6_3_end_to_end_authority_continuity.test.js",
  "round6_4_domain_service_cohesion.test.js",
  "round6_5_resilience_warning_performance.test.js",
  "round6_6_final_release_readiness.test.js",
  "round6_certification_manifest.json"
]);
function assertRound6CompanionInventory() {
  const missing=EXPECTED_ROUND6_COMPANION_FILES.filter((name)=>!fs.existsSync(path.join(ROUND_DIR,name)));
  assert.deepStrictEqual(missing,[],`Round 6 certification folder is incomplete: ${missing.join(", ")}`);
  return [...EXPECTED_ROUND6_COMPANION_FILES];
}


function assertNoRound6PathOrLayerDrift(relativePaths) {
  const paths =
    Array.isArray(relativePaths)
      ? relativePaths
      : [];

  for (const relativePath of paths) {
    const source =
      readText(relativePath);

    // Reject actual stale path construction/literals, not explanatory messages.
    assert.strictEqual(
      /path\.join\(\s*__dirname\s*,\s*["']metacognition["']\s*\)|Data[\\/]marion[\\/]runtime[\\/]supervision[\\/]metacognition/i.test(source),
      false,
      `Stale supervision/metacognition runtime path found: ${relativePath}`
    );

    // Reject actual authority declarations that advance past the certified stop.
    assert.strictEqual(
      /hardStopLayer\s*[:=]\s*(?:29|[3-9]\d)\b|layer29Present\s*[:=]\s*true\b|GLOBAL_HARD_STOP_LAYER\s*=\s*(?:29|[3-9]\d)\b/i.test(source),
      false,
      `Layer 29+ authority drift found: ${relativePath}`
    );
  }

  return true;
}

function ownFunction(target, name) {
  if (
    !target ||
    (
      typeof target !== "object" &&
      typeof target !== "function"
    )
  ) {
    return null;
  }

  try {
    const descriptor =
      Object.getOwnPropertyDescriptor(target, name);

    return descriptor &&
      typeof descriptor.value === "function"
      ? descriptor.value
      : null;
  } catch (_) {
    return null;
  }
}

function callable(target, names) {
  if (typeof target === "function") {
    return target;
  }

  for (const name of names) {
    const fn = ownFunction(target, name);
    if (fn) return fn.bind(target);
  }

  return null;
}

function assertCommonJsApi(api, label) {
  assert.ok(
    api &&
    (
      typeof api === "object" ||
      typeof api === "function"
    ),
    `${label} did not load as a CommonJS API.`
  );
}

function syntaxCheck(file) {
  const result =
    childProcess.spawnSync(
      process.execPath,
      ["--check", file],
      {
        cwd: ROOT,
        encoding: "utf8",
        windowsHide: true,
        timeout: 30000,
        maxBuffer: 4 * 1024 * 1024
      }
    );

  assert.strictEqual(
    result.error,
    undefined,
    result.error && result.error.message
  );

  assert.strictEqual(
    result.status,
    0,
    [
      `Syntax check failed: ${path.relative(ROOT, file)}`,
      result.stdout || "",
      result.stderr || ""
    ].join("\n")
  );
}

function runIsolated(name, source, timeout = 90000) {
  const started = performance.now();

  const result =
    childProcess.spawnSync(
      process.execPath,
      ["--trace-warnings", "-e", source],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          SB_TTS_LOG_ENABLED: "false"
        },
        encoding: "utf8",
        windowsHide: true,
        timeout,
        maxBuffer: 16 * 1024 * 1024
      }
    );

  const durationMs =
    performance.now() -
    started;

  assert.strictEqual(
    result.error,
    undefined,
    result.error && result.error.message
  );

  const output =
    `${result.stdout || ""}\n${result.stderr || ""}`;

  assert.strictEqual(
    result.status,
    0,
    [
      `Isolated case failed: ${name}`,
      output
    ].join("\n")
  );

  assert.strictEqual(
    WARNING_RE.test(output),
    false,
    [
      `Circular warning detected: ${name}`,
      output
    ].join("\n")
  );

  return {
    name,
    ok: true,
    warnings: 0,
    durationMs:
      Number(
        durationMs.toFixed(3)
      ),
    stdout:
      safeString(result.stdout).trim()
  };
}

function npmRunReferences(command) {
  return [
    ...String(command || "")
      .matchAll(
        /\bnpm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/g
      )
  ].map(
    (match) =>
      match[1]
  );
}

function assertSourceHasTerms(relativePath, terms) {
  const source =
    readText(relativePath)
      .toLowerCase();

  const missing =
    terms.filter(
      (term) =>
        !source.includes(
          String(term).toLowerCase()
        )
    );

  assert.deepStrictEqual(
    missing,
    [],
    `${relativePath} is missing expected terms: ${missing.join(", ")}`
  );
}

function assertNoVisibleDiagnostics(value) {
  assert.strictEqual(
    DIAGNOSTIC_RE.test(
      safeString(value)
    ),
    false,
    "User-facing output contains internal diagnostics."
  );
}

function byteLength(value) {
  return Buffer.byteLength(
    JSON.stringify(value),
    "utf8"
  );
}

module.exports = {
  ROOT,
  ROUND_DIR,
  WARNING_RE,
  CONFLICT_RE,
  DIAGNOSTIC_RE,
  SIX_DOMAINS,
  CORE_AUTHORITIES,
  abs,
  normalizePath,
  isObject,
  safeString,
  readText,
  readJson,
  resolveExact,
  loadExact,
  ownFunction,
  callable,
  assertCommonJsApi,
  syntaxCheck,
  runIsolated,
  npmRunReferences,
  assertSourceHasTerms,
  assertNoVisibleDiagnostics,
  byteLength,
  CANONICAL_METACOGNITION_ROOT,
  METACOGNITION_FILES,
  CANONICAL_METACOGNITION_FILES,
  assertCanonicalMetacognitionTree,
  assertSupervisorUsesCanonicalMetacognitionPath,
  EXPECTED_ROUND6_COMPANION_FILES,
  assertRound6CompanionInventory,
  PHASE_A_HARD_STOP_LAYER,
  CONVERSATION_HARD_STOP_LAYER,
  GLOBAL_HARD_STOP_LAYER,
  COGNITIVE_SUPERVISION_INTEGRATION_TEST,
  assertNoRound6PathOrLayerDrift
};
