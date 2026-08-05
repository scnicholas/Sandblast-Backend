"use strict";

/**
 * tests/marion/phase_b_index_manifest_package_contract_test.js
 *
 * Phase B control-plane certification.
 *
 * It verifies that:
 * - index.js retains the diagnostic-only Phase B health boundary;
 * - manifest.json still includes Layers 25–26 and Phase B safeguards;
 * - package.json retains CommonJS, the Node engine, and the complete
 *   Phase B verification graph;
 * - repository-wide Layers 27–28 do not invalidate Phase B's local
 *   hard stop at layer 26.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const VERSION =
  "marion.phaseB.indexManifestPackageContract/2.0";

const ROOT =
  path.resolve(__dirname, "../..");

const PHASE_A_HARD_STOP = 24;
const PHASE_B_HARD_STOP = 26;

const REQUIRED_PHASE_B_LAYERS =
  Object.freeze([25, 26]);

const REQUIRED_PHASE_B_STEPS =
  Object.freeze([
    "test:marion-phase-b-core",
    "test:marion-phase-b-batch1",
    "test:marion-phase-b-state",
    "test:marion-phase-b-transport",
    "test:marion-phase-b-control",
    "verify:marion-phase-b-part2-batch2"
  ]);

const CONFLICT_RE =
  /^(?:<<<<<<<|=======|>>>>>>>)/m;

function absolute(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function readText(relativePath) {
  const file = absolute(relativePath);

  assert.ok(
    fs.existsSync(file),
    `Required file is missing: ${relativePath}`
  );

  const text = fs.readFileSync(file, "utf8");

  assert.strictEqual(
    CONFLICT_RE.test(text),
    false,
    `Unresolved merge-conflict marker found: ${relativePath}`
  );

  return text;
}

function readJson(relativePath) {
  const text = readText(relativePath);

  try {
    return JSON.parse(text);
  } catch (error) {
    assert.fail(
      `Invalid JSON in ${relativePath}: ${
        error && error.message ? error.message : error
      }`
    );
  }
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function integer(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function npmRunReferences(command) {
  return [
    ...String(command || "").matchAll(
      /\bnpm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/g
    )
  ].map((match) => match[1]);
}

function phaseBBoundarySource(indexText) {
  const startMarker =
    "MARION_NUANCE_PHASE_B_INDEX_DIAGNOSTIC_BOUNDARY_V1_START";
  const endMarker =
    "MARION_NUANCE_PHASE_B_INDEX_DIAGNOSTIC_BOUNDARY_V1_END";

  const start = indexText.indexOf(startMarker);

  assert.ok(
    start >= 0,
    "Index Phase B diagnostic-boundary marker is missing."
  );

  const end = indexText.indexOf(endMarker, start);

  return end >= 0
    ? indexText.slice(start, end + endMarker.length)
    : indexText.slice(start, start + 12000);
}

function assertIndexContract(indexText) {
  const boundary = phaseBBoundarySource(indexText);

  assert.match(
    boundary,
    /semanticAnalysisPerformed\s*:\s*false/,
    "Index Phase B health boundary must remain diagnostic-only."
  );

  assert.doesNotMatch(
    boundary,
    /semanticAnalysisPerformed\s*:\s*true/,
    "Index Phase B health boundary must not perform semantic analysis."
  );

  assert.ok(
    boundary.includes("/api/marion/nuance/phase-b/health"),
    "Phase B health route is missing from the diagnostic boundary."
  );
}

function assertManifestContract(manifest) {
  assert.ok(
    isObject(manifest),
    "manifest.json must contain an object."
  );

  const summary = isObject(manifest.summary)
    ? manifest.summary
    : {};

  const architecture = isObject(manifest.architecture)
    ? manifest.architecture
    : {};

  const phaseB = isObject(manifest.phaseBNuanceIntegration)
    ? manifest.phaseBNuanceIntegration
    : null;

  assert.ok(
    phaseB,
    "Phase B manifest section is missing."
  );

  const layers = Array.isArray(summary.conversationLayersIncluded)
    ? summary.conversationLayersIncluded
        .map(integer)
        .filter((value) => value !== null)
    : [];

  for (const layer of REQUIRED_PHASE_B_LAYERS) {
    assert.ok(
      layers.includes(layer),
      `Layer ${layer} is missing from the manifest.`
    );
  }

  const summaryHardStop = integer(summary.hardStopLayer);
  const architectureHardStop = integer(architecture.hardStopLayer);

  assert.ok(
    summaryHardStop !== null,
    "Manifest summary hard-stop layer must be an integer."
  );

  assert.ok(
    architectureHardStop !== null,
    "Manifest architecture hard-stop layer must be an integer."
  );

  assert.ok(
    summaryHardStop >= PHASE_B_HARD_STOP,
    "Manifest summary hard stop cannot be below Phase B layer 26."
  );

  assert.ok(
    architectureHardStop >= PHASE_B_HARD_STOP,
    "Manifest architecture hard stop cannot be below Phase B layer 26."
  );

  const phaseBHardStop = integer(
    phaseB.hardStopLayer ??
    phaseB.layerHardStop ??
    phaseB.maxLayer
  );

  if (phaseBHardStop !== null) {
    assert.strictEqual(
      phaseBHardStop,
      PHASE_B_HARD_STOP,
      "The dedicated Phase B hard stop must remain layer 26."
    );
  }

  const phaseAHardStop = integer(
    phaseB.phaseAHardStopLayer ??
    phaseB.phaseAEndLayer
  );

  if (phaseAHardStop !== null) {
    assert.strictEqual(
      phaseAHardStop,
      PHASE_A_HARD_STOP,
      "The Phase A boundary inside Phase B must remain layer 24."
    );
  }

  assert.strictEqual(
    phaseB.literalIntentPreserved,
    true,
    "Literal-intent preservation is missing."
  );

  assert.strictEqual(
    phaseB.automaticExecutionAllowed,
    false,
    "Phase B automatic execution must remain disabled."
  );

  if (
    Object.prototype.hasOwnProperty.call(
      phaseB,
      "semanticAnalysisPerformed"
    )
  ) {
    assert.strictEqual(
      phaseB.semanticAnalysisPerformed,
      false,
      "Phase B control-plane diagnostics must not perform semantic analysis."
    );
  }

  return {
    summaryHardStop,
    architectureHardStop,
    phaseBHardStop:
      phaseBHardStop === null
        ? PHASE_B_HARD_STOP
        : phaseBHardStop,
    layers
  };
}

function assertPackageContract(pkg) {
  assert.ok(
    isObject(pkg),
    "package.json must contain an object."
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

  assert.ok(
    isObject(pkg.scripts),
    "package.json scripts object is missing."
  );

  const scripts = pkg.scripts;
  const aggregate = scripts["verify:marion-phase-b"];

  assert.ok(
    typeof aggregate === "string" && aggregate.trim(),
    "Phase B verification script is missing."
  );

  assert.ok(
    typeof scripts["verify:marion-phase-b-part2-batch2"] === "string" &&
    scripts["verify:marion-phase-b-part2-batch2"].trim(),
    "Phase B Batch 2 verification script is missing."
  );

  const references = npmRunReferences(aggregate);

  for (const required of REQUIRED_PHASE_B_STEPS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(scripts, required),
      `Required Phase B package script is missing: ${required}`
    );

    assert.ok(
      references.includes(required),
      `verify:marion-phase-b does not execute ${required}.`
    );
  }

  assert.strictEqual(
    new Set(references).size,
    references.length,
    "verify:marion-phase-b contains duplicate npm steps."
  );

  assert.strictEqual(
    scripts["test:marion-phase-b-control"],
    "node tests/marion/phase_b_index_manifest_package_contract_test.js",
    "Phase B control script does not target the canonical test."
  );

  return {
    packageVersion: String(pkg.version || ""),
    nodeEngine: pkg.engines.node,
    phaseBSteps: references
  };
}

function main() {
  const indexText = readText("index.js");
  const manifest = readJson("manifest.json");
  const pkg = readJson("package.json");

  assertIndexContract(indexText);

  const manifestStatus =
    assertManifestContract(manifest);

  const packageStatus =
    assertPackageContract(pkg);

  console.log(
    JSON.stringify(
      {
        ok: true,
        certification:
          "phase-b-index-manifest-package-contract",
        version: VERSION,
        phaseAHardStop: PHASE_A_HARD_STOP,
        phaseBHardStop: PHASE_B_HARD_STOP,
        manifestSummaryHardStop:
          manifestStatus.summaryHardStop,
        manifestArchitectureHardStop:
          manifestStatus.architectureHardStop,
        laterLayersInstalled:
          Math.max(
            manifestStatus.summaryHardStop,
            manifestStatus.architectureHardStop
          ) > PHASE_B_HARD_STOP,
        conversationLayersIncluded:
          manifestStatus.layers,
        packageVersion:
          packageStatus.packageVersion,
        nodeEngine:
          packageStatus.nodeEngine,
        phaseBVerificationSteps:
          packageStatus.phaseBSteps,
        commonjsPreserved: true,
        diagnosticOnlyBoundary: true
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
    error && error.stack
      ? error.stack
      : error
  );

  process.exitCode = 1;
}
