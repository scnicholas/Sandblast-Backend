"use strict";

/**
 * tests/marion/layers_1_28/round6/run_round6_certification.js
 *
 * Marion Layers 1–28 — Round 6 Final Consolidation Certification
 *
 * Round 6 is the terminal certification round. It does not create Layer 29.
 *
 * It certifies:
 * - Cohesion with Round 1 through Round 5.
 * - Exact package.json Round 6 pathway and inherited verification chain.
 * - Canonical Marion runtime/test authority paths.
 * - Final reply and transport authority preservation.
 * - Six-domain service cohesion.
 * - Fail-closed resilience and diagnostic isolation.
 * - Warning-free, bounded core service loading.
 * - Final hard stop at Layer 28.
 *
 * This runner is fail-fast. It does not start index.js or bind a port.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const {
  ROOT,
  ROUND_DIR,
  WARNING_RE,
  CONFLICT_RE,
  CORE_AUTHORITIES,
  abs,
  isObject,
  readJson,
  syntaxCheck,
  npmRunReferences,
  CANONICAL_METACOGNITION_ROOT,
  CANONICAL_METACOGNITION_FILES,
  PHASE_A_HARD_STOP_LAYER,
  CONVERSATION_HARD_STOP_LAYER,
  GLOBAL_HARD_STOP_LAYER,
  COGNITIVE_SUPERVISION_INTEGRATION_TEST,
  assertCanonicalMetacognitionTree,
  assertSupervisorUsesCanonicalMetacognitionPath,
  assertRound6CompanionInventory,
  assertNoRound6PathOrLayerDrift
} = require("./_round6_common.js");

const VERSION =
  "marion.layers1_28.round6Certification/1.1-freeze-ready-final-consolidation";

const PACKAGE_ROUND5 =
  "node tests/marion/layers_1_28/round5/run_round5_certification.js";

const PACKAGE_ROUND6 =
  "node tests/marion/layers_1_28/round6/run_round6_certification.js";

const EXPECTED_VERIFY_CHAIN =
  Object.freeze([
    "verify:marion-round5",
    "test:marion-round6"
  ]);

const EXPECTED_TESTS =
  Object.freeze([
    "round6_1_certification_chain_integrity.test.js",
    "round6_2_runtime_authority_path_integrity.test.js",
    "round6_3_end_to_end_authority_continuity.test.js",
    "round6_4_domain_service_cohesion.test.js",
    "round6_5_resilience_warning_performance.test.js",
    "round6_6_final_release_readiness.test.js"
  ]);

const REQUIRED_FILES =
  Object.freeze([
    "package.json",
    "manifest.json",
    "index.js",

    "tests/marion/layers_1_28/round1/run_round1_certification.js",
    "tests/marion/layers_1_28/round2/run_round2_certification.js",
    "tests/marion/layers_1_28/round3/run_round3_certification.js",
    "tests/marion/layers_1_28/round4/run_round4_certification.js",
    "tests/marion/layers_1_28/round5/run_round5_certification.js",

    "tests/marion/marionStrategicPlanner.test.js",
    "tests/marion/marionPriorityArbitrator.test.js",
    "tests/marion/marionLayer27Integration.test.js",
    "tests/marion/marionReasoningAuditor.test.js",
    "tests/marion/marionQualityCalibrator.test.js",
    "tests/marion/marionLayer28Integration.test.js",
    "tests/marion/marionLayers27_28Regression.test.js",
    COGNITIVE_SUPERVISION_INTEGRATION_TEST,

    ...CORE_AUTHORITIES,
    ...CANONICAL_METACOGNITION_FILES,

    "tests/marion/layers_1_28/round6/_round6_common.js",
    "tests/marion/layers_1_28/round6/round6_certification_manifest.json",

    ...EXPECTED_TESTS.map(
      (name) =>
        `tests/marion/layers_1_28/round6/${name}`
    )
  ]);

function assertPackageContract() {
  const pkg =
    readJson(
      "package.json"
    );

  assert.ok(
    isObject(
      pkg.scripts
    ),
    "package.json scripts object is missing."
  );

  assert.strictEqual(
    pkg.type,
    "commonjs",
    "CommonJS architecture changed."
  );

  assert.ok(
    isObject(pkg.engines) &&
    typeof pkg.engines.node === "string" &&
    pkg.engines.node.trim(),
    "Node engine declaration is missing."
  );

  assert.strictEqual(
    pkg.scripts["test:marion-round5"],
    PACKAGE_ROUND5,
    "Round 5 package path drifted."
  );

  assert.strictEqual(
    pkg.scripts["test:marion-round6"],
    PACKAGE_ROUND6,
    "Round 6 package path drifted."
  );

  const verification =
    npmRunReferences(
      pkg.scripts["verify:marion-round6"]
    );

  assert.deepStrictEqual(
    verification,
    EXPECTED_VERIFY_CHAIN,
    "verify:marion-round6 must run verify:marion-round5 before test:marion-round6."
  );

  return {
    name:
      String(
        pkg.name ||
        ""
      ),
    version:
      String(
        pkg.version ||
        ""
      ),
    node:
      pkg.engines &&
      pkg.engines.node
        ? String(pkg.engines.node)
        : "",
    verification
  };
}

function assertRequiredFiles() {
  const missing =
    REQUIRED_FILES.filter(
      (relativePath) =>
        !fs.existsSync(
          abs(relativePath)
        )
    );

  assert.deepStrictEqual(
    missing,
    [],
    `Round 6 required files are missing: ${missing.join(", ")}`
  );
}

function assertRound6Manifest() {
  const manifest =
    readJson(
      "tests/marion/layers_1_28/round6/round6_certification_manifest.json"
    );

  assert.strictEqual(
    manifest.round,
    6
  );

  assert.strictEqual(
    manifest.finalConsolidation,
    true
  );

  assert.strictEqual(
    manifest.phaseAHardStopLayer,
    PHASE_A_HARD_STOP_LAYER,
    "Round 6 manifest Phase A boundary drifted."
  );

  assert.strictEqual(
    manifest.conversationArchitectureHardStopLayer,
    CONVERSATION_HARD_STOP_LAYER,
    "Round 6 manifest conversation boundary drifted."
  );

  assert.strictEqual(
    manifest.hardStopLayer,
    GLOBAL_HARD_STOP_LAYER,
    "Round 6 manifest global hard stop drifted."
  );

  assert.strictEqual(
    manifest.layer29Present,
    false,
    "Round 6 manifest must explicitly reject Layer 29."
  );

  assert.strictEqual(
    manifest.automaticExecutionAllowed,
    false,
    "Round 6 manifest must not enable automatic execution."
  );

  assert.strictEqual(
    manifest.replyAuthorityPreserved,
    true,
    "Round 6 manifest must preserve established reply authority."
  );

  assert.strictEqual(
    manifest.canonicalPaths &&
    manifest.canonicalPaths.layer28Metacognition,
    CANONICAL_METACOGNITION_ROOT,
    "Round 6 canonical Layer 28 metacognition path drifted."
  );

  assert.strictEqual(
    manifest.canonicalPaths &&
    manifest.canonicalPaths.cognitiveSupervisor,
    "Data/marion/runtime/supervision/marionCognitiveSupervisor.js",
    "Round 6 Cognitive Supervisor path drifted."
  );

  assert.strictEqual(
    manifest.prerequisite,
    "verify:marion-round5"
  );

  const testFiles =
    Array.isArray(
      manifest.tests
    )
      ? manifest.tests.map(
          (entry) =>
            entry &&
            entry.file
        )
      : [];

  assert.deepStrictEqual(
    testFiles,
    EXPECTED_TESTS,
    "Round 6 certification manifest does not match the six expected tests."
  );

  return manifest;
}

function syntaxChecks() {
  const jsFiles =
    REQUIRED_FILES.filter(
      (relativePath) =>
        relativePath.endsWith(
          ".js"
        )
    );

  for (const relativePath of jsFiles) {
    const source =
      fs.readFileSync(
        abs(relativePath),
        "utf8"
      );

    assert.strictEqual(
      CONFLICT_RE.test(source),
      false,
      `Merge-conflict marker found: ${relativePath}`
    );

    syntaxCheck(
      abs(relativePath)
    );
  }

  return jsFiles;
}

function discoverTests() {
  const discovered =
    fs.readdirSync(
      ROUND_DIR,
      {
        withFileTypes: true
      }
    )
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".test.js")
      )
      .map(
        (entry) =>
          entry.name
      )
      .sort(
        (a, b) =>
          a.localeCompare(b)
      );

  assert.deepStrictEqual(
    discovered,
    [...EXPECTED_TESTS].sort(
      (a, b) =>
        a.localeCompare(b)
    ),
    "Round 6 test inventory drifted."
  );

  return discovered;
}

function runRound6Test(name) {
  const file =
    path.join(
      ROUND_DIR,
      name
    );

  const result =
    childProcess.spawnSync(
      process.execPath,
      [
        "--trace-warnings",
        "--test",
        file
      ],
      {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS: "",
          SB_TTS_LOG_ENABLED: "false"
        },
        encoding: "utf8",
        windowsHide: true,
        timeout: 90000,
        maxBuffer: 16 * 1024 * 1024
      }
    );

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
      `Round 6 test failed: ${name}`,
      output
    ].join("\n")
  );

  assert.strictEqual(
    WARNING_RE.test(output),
    false,
    [
      `Circular warning detected in ${name}`,
      output
    ].join("\n")
  );

  return {
    file: name,
    ok: true,
    warnings: 0
  };
}

function main() {
  const packageProfile =
    assertPackageContract();

  assertRequiredFiles();

  const certificationManifest =
    assertRound6Manifest();

  const companionInventory =
    assertRound6CompanionInventory();

  const canonicalMetacognition =
    assertCanonicalMetacognitionTree();

  assertSupervisorUsesCanonicalMetacognitionPath();

  assertNoRound6PathOrLayerDrift(
    [
      "tests/marion/layers_1_28/round6/run_round6_certification.js",
      ...EXPECTED_TESTS.map(
        (name) =>
          `tests/marion/layers_1_28/round6/${name}`
      )
    ]
  );

  const checked =
    syntaxChecks();

  const discovered =
    discoverTests();

  const executed =
    discovered.map(
      runRound6Test
    );

  console.log(
    JSON.stringify(
      {
        ok: true,
        certification:
          "marion-layers-1-28-round6",
        version: VERSION,
        title:
          "Final Consolidation and Release Readiness Certification",
        backendRoot: ROOT,
        package: packageProfile,
        prerequisite:
          "verify:marion-round5",
        phaseAHardStopLayer:
          PHASE_A_HARD_STOP_LAYER,
        conversationArchitectureHardStopLayer:
          CONVERSATION_HARD_STOP_LAYER,
        hardStopLayer:
          GLOBAL_HARD_STOP_LAYER,
        layer29Present:
          false,
        finalConsolidation:
          true,
        canonicalMetacognitionRoot:
          CANONICAL_METACOGNITION_ROOT,
        canonicalMetacognitionFiles:
          canonicalMetacognition,
        round6CompanionInventory:
          companionInventory,
        runtimeAuthorities:
          CORE_AUTHORITIES,
        certificationManifest,
        syntaxChecks: checked,
        discoveredRound6Tests:
          discovered,
        executedRound6Tests:
          executed,
        circularWarnings: 0,
        failFast: true
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(
    error &&
    error.stack
      ? error.stack
      : error
  );

  process.exitCode = 1;
}
