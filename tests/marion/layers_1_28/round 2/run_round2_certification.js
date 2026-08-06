"use strict";

/**
 * tests/marion/layers_1_28/round2/run_round2_certification.js
 *
 * Marion Layers 1–28 — Round 2 Adaptive Continuity Certification
 *
 * Scope:
 * - Confirms the Round 1 prerequisite and package-script chain.
 * - Certifies the active layered manifest schema.
 * - Verifies Round 2 continuity/adaptive markers in the current runtime.
 * - Loads bridge/composer/Chat Engine/State Spine in canonical and reverse order.
 * - Rejects circular-export warnings.
 * - Discovers and executes companion Round 2 tests fail-fast.
 *
 * This runner does not start index.js or bind a network port.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const VERSION = "marion.layers1_28.round2Certification/2.0-adaptive-continuity";
const ROOT = path.resolve(__dirname, "../../../..");
const ROUND_DIR = __dirname;
const SELF = path.basename(__filename);
const ROUND1_RUNNER = "tests/marion/layers_1_28/round1/run_round1_certification.js";
const PACKAGE_ROUND1 = "node tests/marion/layers_1_28/round1/run_round1_certification.js";
const PACKAGE_ROUND2 = "node tests/marion/layers_1_28/round2/run_round2_certification.js";
const WARNING_RE = /Accessing non-existent property|inside circular dependency/i;
const CONFLICT_RE = /^(?:<<<<<<<|=======|>>>>>>>)/m;

const REQUIRED_FILES = Object.freeze([
  "package.json",
  "manifest.json",
  "index.js",
  ROUND1_RUNNER,
  "Data/marion/runtime/marionBridge.js",
  "Data/marion/runtime/composeMarionResponse.js",
  "utils/chatEngine.js",
  "utils/stateSpine.js"
]);

const OPTIONAL_ROUND2_FILES = Object.freeze([
  "Data/marion/runtime/MarionConversationalDepth678.js",
  "Data/marion/runtime/marionConversationalDepth678.js",
  "Data/marion/runtime/marionCurrentTurnAuthority.js",
  "Data/marion/runtime/marionIntentRouter.js",
  "Data/marion/runtime/marionFinalEnvelope.js",
  "Data/marion/runtime/marionLoopGuard.js",
  "Data/marion/runtime/privateOperatorBoundaryLock.js",
  "Data/marion/runtime/publicIdentityQuestionRefinement.js",
  "Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js",
  "Data/marion/runtime/supervision/marionCognitiveSupervisor.js",
  "utils/nyx_state_controller.js"
]);

const ROUND2_MARKERS = Object.freeze([
  "MARION_ROUND2_2_TO_2_5_STATE_BOUNDARY_V1_START",
  "MARION_ROUND2_DEPTH_CONTINUITY_V1_START",
  "MARION_SESSION_CONTINUITY_R8_START",
  "MARION_E2E_CONTINUITY_COHESION_R9_START",
  "MARION_CONTINUITY_E2E_R10_START",
  "ROUND2"
]);

function absolute(relativePath) {
  return path.resolve(ROOT, relativePath);
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function ownFunction(target, name) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    return descriptor && typeof descriptor.value === "function" ? descriptor.value : null;
  } catch (_) {
    return null;
  }
}

function hasCallable(target, names) {
  if (typeof target === "function") return true;
  return names.some((name) => Boolean(ownFunction(target, name)));
}

function readText(relativePath) {
  const file = absolute(relativePath);
  assert.ok(fs.existsSync(file), `Required file is missing: ${relativePath}`);
  const source = fs.readFileSync(file, "utf8");
  assert.strictEqual(CONFLICT_RE.test(source), false, `Merge-conflict marker found: ${relativePath}`);
  return source;
}

function readJson(relativePath) {
  const source = readText(relativePath);
  try {
    return JSON.parse(source);
  } catch (error) {
    assert.fail(`Invalid JSON in ${relativePath}: ${error && error.message ? error.message : error}`);
  }
}

function npmRunReferences(command) {
  return [...String(command || "").matchAll(/\bnpm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/g)]
    .map((match) => match[1]);
}

function assertPackageContract() {
  const pkg = readJson("package.json");
  assert.ok(isObject(pkg.scripts), "package.json scripts object is missing.");
  assert.strictEqual(pkg.scripts["test:marion-round1"], PACKAGE_ROUND1, "Round 1 package path drifted.");
  assert.strictEqual(pkg.scripts["test:marion-round2"], PACKAGE_ROUND2, "Round 2 package path drifted.");

  const verification = npmRunReferences(pkg.scripts["verify:marion-round2"]);
  assert.deepStrictEqual(
    verification,
    ["test:marion-round1", "test:marion-round2"],
    "verify:marion-round2 must run Round 1 and then Round 2 exactly once."
  );

  assert.strictEqual(pkg.type, "commonjs", "CommonJS architecture changed.");
  assert.ok(
    isObject(pkg.engines) && typeof pkg.engines.node === "string" && pkg.engines.node.trim(),
    "Node engine declaration is missing."
  );

  return {
    name: String(pkg.name || ""),
    version: String(pkg.version || ""),
    node: pkg.engines.node,
    verification
  };
}

function assertFiles() {
  const missing = REQUIRED_FILES.filter((relativePath) => !fs.existsSync(absolute(relativePath)));
  assert.deepStrictEqual(missing, [], `Round 2 required files are missing: ${missing.join(", ")}`);
  return OPTIONAL_ROUND2_FILES.filter((relativePath) => fs.existsSync(absolute(relativePath)));
}

function assertManifestContract() {
  const manifest = readJson("manifest.json");
  const summary = isObject(manifest.summary) ? manifest.summary : {};
  const architecture = isObject(manifest.architecture) ? manifest.architecture : {};
  const layers = Array.isArray(summary.conversationLayersIncluded)
    ? [...new Set(summary.conversationLayersIncluded.map(Number).filter(Number.isInteger))].sort((a, b) => a - b)
    : [];

  const baselineFlag = summary.baselineLayers1to8ValidatedAsExistingRuntimeInvariants === true;
  const baselineExplicit = Array.from({ length: 8 }, (_, index) => index + 1)
    .every((layer) => layers.includes(layer));
  assert.ok(
    baselineFlag || baselineExplicit,
    "Layers 1–8 are not represented by baseline invariants or explicit entries."
  );

  const missingConversationLayers = [];
  for (let layer = 9; layer <= 26; layer += 1) {
    if (!layers.includes(layer)) missingConversationLayers.push(layer);
  }
  assert.deepStrictEqual(
    missingConversationLayers,
    [],
    `Manifest is missing conversation Layers 9–26: ${missingConversationLayers.join(", ")}`
  );

  const indexText = readText("index.js");
  const laterExplicit = layers.includes(27) && layers.includes(28);
  const laterRegistry =
    indexText.includes("MARION_LAYERS_27_28_INDEX_REGISTRY_V1_START") &&
    /hardStopLayer\s*:\s*28/.test(indexText);
  assert.ok(
    laterExplicit || laterRegistry,
    "Layers 27–28 are absent from both the manifest and canonical index registry."
  );

  const summaryHardStop = Number(summary.hardStopLayer);
  const architectureHardStop = Number(architecture.hardStopLayer);
  assert.ok(
    Number.isInteger(summaryHardStop) && summaryHardStop >= 26,
    "Manifest summary hard stop must include Phase B Layer 26."
  );
  assert.ok(
    Number.isInteger(architectureHardStop) && architectureHardStop >= 26,
    "Manifest architecture hard stop must include Phase B Layer 26."
  );

  return {
    baselineLayers1to8: baselineFlag ? "baseline-invariants-flag" : "explicit-manifest-entries",
    conversationLayers9to26: layers.filter((layer) => layer >= 9 && layer <= 26),
    layers27to28: laterExplicit ? "explicit-manifest-entries" : "canonical-index-registry",
    summaryHardStop,
    architectureHardStop
  };
}

function syntaxCheck(file) {
  const result = childProcess.spawnSync(process.execPath, ["--check", file], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024
  });
  assert.strictEqual(result.error, undefined, result.error && result.error.message);
  assert.strictEqual(
    result.status,
    0,
    [`Syntax check failed: ${path.relative(ROOT, file)}`, result.stdout || "", result.stderr || ""].join("\n")
  );
}

function runSyntaxChecks(optionalPresent) {
  const files = [...REQUIRED_FILES, ...optionalPresent]
    .filter((relativePath) => relativePath.endsWith(".js"))
    .map(absolute);
  files.forEach(syntaxCheck);
  return files.map((file) => path.relative(ROOT, file));
}

function assertRound2Markers(optionalPresent) {
  const candidates = [
    "Data/marion/runtime/composeMarionResponse.js",
    "utils/chatEngine.js",
    "utils/stateSpine.js",
    ...optionalPresent
  ];

  const evidence = [];
  for (const relativePath of candidates) {
    const source = readText(relativePath);
    const markers = ROUND2_MARKERS.filter((marker) => source.includes(marker));
    if (markers.length) evidence.push({ file: relativePath, markers });
  }

  assert.ok(
    evidence.some(
      (entry) => entry.file === "utils/stateSpine.js" && entry.markers.some((marker) => marker.includes("ROUND2"))
    ),
    "State Spine does not expose the Round 2 adaptive-state boundary."
  );
  assert.ok(evidence.length >= 2, "Round 2 continuity evidence is not present across enough runtime layers.");
  return evidence;
}

function runIsolated(name, source, timeout = 60000) {
  const result = childProcess.spawnSync(process.execPath, ["--trace-warnings", "-e", source], {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: "", SB_TTS_LOG_ENABLED: "false" },
    encoding: "utf8",
    windowsHide: true,
    timeout,
    maxBuffer: 12 * 1024 * 1024
  });

  assert.strictEqual(result.error, undefined, result.error && result.error.message);
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  assert.strictEqual(
    result.status,
    0,
    [`Round 2 isolated case failed: ${name}`, stdout, stderr].join("\n")
  );
  assert.strictEqual(
    WARNING_RE.test(`${stdout}\n${stderr}`),
    false,
    [`Circular dependency warning detected: ${name}`, stdout, stderr].join("\n")
  );
  return { name, ok: true, warnings: 0, stdout: stdout.trim() };
}

function coreLoadProbe(order) {
  return `
    "use strict";
    const assert=require("assert");
    function ownFunction(t,n){if(!t||(typeof t!=="object"&&typeof t!=="function"))return null;const d=Object.getOwnPropertyDescriptor(t,n);return d&&typeof d.value==="function"?d.value:null}
    function has(t,n){return typeof t==="function"||n.some(x=>!!ownFunction(t,x))}
    const loaded=new Map();
    for(const p of ${JSON.stringify(order)}) loaded.set(p,require(p));
    const bridge=loaded.get("./Data/marion/runtime/marionBridge.js")||require("./Data/marion/runtime/marionBridge.js");
    const composer=loaded.get("./Data/marion/runtime/composeMarionResponse.js")||require("./Data/marion/runtime/composeMarionResponse.js");
    const chat=loaded.get("./utils/chatEngine.js")||require("./utils/chatEngine.js");
    const state=loaded.get("./utils/stateSpine.js")||require("./utils/stateSpine.js");
    assert.ok(has(bridge,["processWithMarion","handleMarionAdminConversation","route","ask","handle","default"]),"MarionBridge has no callable entry point.");
    assert.ok(has(composer,["composeMarionResponse","compose","run","buildReply","default"]),"Composer has no callable entry point.");
    assert.ok(has(chat,["handleChat","processWithMarion","run","handle","route","default"]),"ChatEngine has no callable entry point.");
    assert.ok(has(state,["createState","hydrate","coerceState","finalizeTurn","normalizeStateForPipelineCohesion","buildStateSpine","default"]),"StateSpine has no callable entry point.");
    console.log(JSON.stringify({ok:true,order:${JSON.stringify(order)}}));
  `;
}

function runCoreLoadChecks() {
  const order = [
    "./Data/marion/runtime/marionBridge.js",
    "./Data/marion/runtime/composeMarionResponse.js",
    "./utils/chatEngine.js",
    "./utils/stateSpine.js"
  ];
  return [
    runIsolated("round2-canonical-core-load", coreLoadProbe(order)),
    runIsolated("round2-reverse-core-load", coreLoadProbe([...order].reverse()))
  ];
}

function isRound2Test(name) {
  if (name === SELF || name.startsWith("_") || !name.endsWith(".js")) return false;
  if (/^run_round\d+_certification\.js$/i.test(name)) return false;
  return /(?:^|[_\-.])(?:test|certification)(?:[_\-.]|$)/i.test(name);
}

function discoverTests() {
  return fs.readdirSync(ROUND_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isRound2Test(entry.name))
    .map((entry) => path.join(ROUND_DIR, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function runTest(file) {
  syntaxCheck(file);
  const result = childProcess.spawnSync(process.execPath, ["--trace-warnings", file], {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: "", SB_TTS_LOG_ENABLED: "false" },
    encoding: "utf8",
    windowsHide: true,
    timeout: 90000,
    maxBuffer: 16 * 1024 * 1024
  });

  assert.strictEqual(result.error, undefined, result.error && result.error.message);
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  assert.strictEqual(
    result.status,
    0,
    [`Round 2 test failed: ${path.basename(file)}`, stdout, stderr].join("\n")
  );
  assert.strictEqual(
    WARNING_RE.test(`${stdout}\n${stderr}`),
    false,
    [`Circular warning in ${path.basename(file)}`, stdout, stderr].join("\n")
  );
  return { file: path.basename(file), ok: true, warnings: 0, stdout: stdout.trim() };
}

function main() {
  const packageProfile = assertPackageContract();
  const optionalPresent = assertFiles();
  const manifest = assertManifestContract();
  const syntaxChecks = runSyntaxChecks(optionalPresent);
  const round2Markers = assertRound2Markers(optionalPresent);
  const isolatedLoadChecks = runCoreLoadChecks();
  const discovered = discoverTests();
  const executed = discovered.map(runTest);

  console.log(JSON.stringify({
    ok: true,
    certification: "marion-layers-1-28-round2",
    version: VERSION,
    backendRoot: ROOT,
    package: packageProfile,
    round1Prerequisite: ROUND1_RUNNER,
    manifest,
    optionalRound2FilesPresent: optionalPresent,
    round2RuntimeEvidence: round2Markers,
    syntaxChecks,
    isolatedLoadChecks,
    discoveredRound2Tests: discovered.map((file) => path.basename(file)),
    executedRound2Tests: executed,
    circularWarnings: 0,
    failFast: true
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
