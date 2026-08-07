"use strict";

/**
 * tests/marion/layers_1_28/round4/run_round4_certification.js
 *
 * Marion Layers 1–28 — Round 4 Multi-Domain Integration Certification
 *
 * Scope:
 * - Confirms Round 1, Round 2, and Round 3 prerequisite runner paths.
 * - Confirms Layer 27, Layer 28, and cognitive-supervision prerequisites.
 * - Certifies the package.json Round 4 command and verification chain.
 * - Confirms the six-domain runtime foundation.
 * - Executes Round 4.1–4.5 fail-fast.
 * - Rejects merge-conflict markers and circular-export warnings.
 *
 * This runner does not start index.js or bind a network port.
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
  SIX_DOMAINS,
  abs,
  isObject,
  readText,
  readJson,
  syntaxCheck,
  assertSourceHasDomains
} = require("./_round4_common.js");

const VERSION =
  "marion.layers1_28.round4Certification/1.0-multidomain-integration";

const SELF =
  path.basename(
    __filename
  );

const PACKAGE_ROUND4 =
  "node tests/marion/layers_1_28/round4/run_round4_certification.js";

const EXPECTED_VERIFY_CHAIN =
  Object.freeze([
    "test:marion-round1",
    "test:marion-round2",
    "test:marion-round3",
    "test:marion-layer27",
    "test:marion-layer28",
    "test:marion-cognitive-supervision",
    "test:marion-round4"
  ]);

const EXPECTED_TESTS =
  Object.freeze([
    "round4_1_domain_routing_integrity.test.js",
    "round4_2_ai_cyber_performance.test.js",
    "round4_3_finance_law_boundary.test.js",
    "round4_4_english_psychology_nuance.test.js",
    "round4_5_six_domain_cohesion.test.js"
  ]);

const REQUIRED_FILES =
  Object.freeze([
    "package.json",
    "manifest.json",
    "index.js",

    "tests/marion/layers_1_28/round1/run_round1_certification.js",
    "tests/marion/layers_1_28/round2/run_round2_certification.js",
    "tests/marion/layers_1_28/round3/run_round3_certification.js",

    "tests/marion/marionStrategicPlanner.test.js",
    "tests/marion/marionPriorityArbitrator.test.js",
    "tests/marion/marionLayer27Integration.test.js",
    "tests/marion/marionReasoningAuditor.test.js",
    "tests/marion/marionQualityCalibrator.test.js",
    "tests/marion/marionLayer28Integration.test.js",
    "tests/marion/marionLayers27_28Regression.test.js",

    "Data/marion/runtime/marionBridge.js",
    "Data/marion/runtime/composeMarionResponse.js",
    "Data/marion/runtime/marionIntentRouter.js",
    "Data/marion/runtime/marionDomainRegistry.js",
    "Data/marion/runtime/supervision/marionCognitiveSupervisor.js",
    "utils/chatEngine.js",
    "utils/stateSpine.js",

    "tests/marion/layers_1_28/round4/_round4_common.js",
    "tests/marion/layers_1_28/round4/round4_certification_manifest.json",

    ...EXPECTED_TESTS.map(
      (name) =>
        `tests/marion/layers_1_28/round4/${name}`
    )
  ]);

function npmRunReferences(command) {
  return [
    ...String(
      command ||
      ""
    ).matchAll(
      /\bnpm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/g
    )
  ].map(
    (match) =>
      match[1]
  );
}

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
    pkg.scripts[
      "test:marion-round4"
    ],
    PACKAGE_ROUND4,
    "Round 4 package path drifted."
  );

  const chain =
    npmRunReferences(
      pkg.scripts[
        "verify:marion-round4"
      ]
    );

  assert.deepStrictEqual(
    chain,
    EXPECTED_VERIFY_CHAIN,
    "verify:marion-round4 prerequisite chain is incomplete or out of order."
  );

  assert.strictEqual(
    pkg.type,
    "commonjs",
    "CommonJS architecture changed."
  );

  assert.ok(
    isObject(
      pkg.engines
    ) &&
    typeof pkg.engines.node ===
      "string" &&
    pkg.engines.node.trim(),
    "Node engine declaration is missing."
  );

  return {
    package:
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
      pkg.engines.node,
    verification:
      chain
  };
}

function assertRequiredFiles() {
  const missing =
    REQUIRED_FILES.filter(
      (relativePath) =>
        !fs.existsSync(
          abs(
            relativePath
          )
        )
    );

  assert.deepStrictEqual(
    missing,
    [],
    `Round 4 required files are missing: ${missing.join(", ")}`
  );
}

function assertRound4Manifest() {
  const manifest =
    readJson(
      "tests/marion/layers_1_28/round4/round4_certification_manifest.json"
    );

  assert.strictEqual(
    manifest.round,
    4
  );

  assert.strictEqual(
    manifest.hardStopLayer,
    28
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
    "Round 4 certification manifest does not match the five expected tests."
  );

  return manifest;
}

function assertDomainFoundation() {
  assertSourceHasDomains(
    "Data/marion/runtime/marionDomainRegistry.js",
    SIX_DOMAINS
  );

  const router =
    readText(
      "Data/marion/runtime/marionIntentRouter.js"
    );

  assert.ok(
    /domain|intent|route|classif/i.test(
      router
    ),
    "Marion Intent Router does not expose a recognizable routing contract."
  );
}

function syntaxChecks() {
  const jsFiles =
    REQUIRED_FILES.filter(
      (relativePath) =>
        relativePath.endsWith(
          ".js"
        )
    );

  for (
    const relativePath
    of jsFiles
  ) {
    const source =
      fs.readFileSync(
        abs(
          relativePath
        ),
        "utf8"
      );

    assert.strictEqual(
      CONFLICT_RE.test(
        source
      ),
      false,
      `Merge-conflict marker found: ${relativePath}`
    );

    syntaxCheck(
      abs(
        relativePath
      )
    );
  }

  return jsFiles;
}

function discoverTests() {
  const discovered =
    fs.readdirSync(
      ROUND_DIR,
      {
        withFileTypes:
          true
      }
    )
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(
            ".test.js"
          )
      )
      .map(
        (entry) =>
          entry.name
      )
      .sort(
        (a, b) =>
          a.localeCompare(
            b
          )
      );

  assert.deepStrictEqual(
    discovered,
    [...EXPECTED_TESTS].sort(
      (a, b) =>
        a.localeCompare(
          b
        )
    ),
    "Round 4 test inventory drifted."
  );

  return discovered;
}

function runRound4Test(name) {
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
        cwd:
          ROOT,
        env: {
          ...process.env,
          NODE_OPTIONS:
            "",
          SB_TTS_LOG_ENABLED:
            "false"
        },
        encoding:
          "utf8",
        windowsHide:
          true,
        timeout:
          90000,
        maxBuffer:
          16 * 1024 * 1024
      }
    );

  assert.strictEqual(
    result.error,
    undefined,
    result.error &&
    result.error.message
  );

  const output =
    `${result.stdout || ""}\n${result.stderr || ""}`;

  assert.strictEqual(
    result.status,
    0,
    [
      `Round 4 test failed: ${name}`,
      output
    ].join("\n")
  );

  assert.strictEqual(
    WARNING_RE.test(
      output
    ),
    false,
    [
      `Circular warning detected in ${name}`,
      output
    ].join("\n")
  );

  return {
    file:
      name,
    ok:
      true,
    warnings:
      0
  };
}

function main() {
  const packageProfile =
    assertPackageContract();

  assertRequiredFiles();

  const certificationManifest =
    assertRound4Manifest();

  assertDomainFoundation();

  const checked =
    syntaxChecks();

  const discovered =
    discoverTests();

  const executed =
    discovered.map(
      runRound4Test
    );

  console.log(
    JSON.stringify(
      {
        ok:
          true,
        certification:
          "marion-layers-1-28-round4",
        version:
          VERSION,
        title:
          "Multi-Domain Integration Certification",
        backendRoot:
          ROOT,
        package:
          packageProfile,
        hardStopLayer:
          28,
        domains:
          SIX_DOMAINS,
        certificationManifest,
        syntaxChecks:
          checked,
        discoveredRound4Tests:
          discovered,
        executedRound4Tests:
          executed,
        circularWarnings:
          0,
        failFast:
          true
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

  process.exitCode =
    1;
}
