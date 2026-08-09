"use strict";

/**
 * Marion Layers 1–28 — Round 1 Baseline Certification
 * Supports baseline Layers 1–8, explicit Layers 9–26, and index-registered Layers 27–28.
 * Canonical path:
 * tests/marion/layers_1_28/round1/run_round1_certification.js
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const VERSION = "marion.layers1_28.round1Certification/2.2-canonical-metacognition-boundary";
const ROOT = path.resolve(__dirname, "../../../..");
const ROUND_DIR = __dirname;
const SELF = path.basename(__filename);
const WARNING_RE = /Accessing non-existent property|inside circular dependency/i;
const CONFLICT_RE = /^(?:<<<<<<<|=======|>>>>>>>)/m;
const GLOBAL_HARD_STOP_LAYER = 28;
const CONVERSATION_HARD_STOP_LAYER = 26;
const PHASE_A_HARD_STOP_LAYER = 24;
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
const METACOGNITION_REQUIRED = Object.freeze(
  METACOGNITION_FILES.map((name) => `${CANONICAL_METACOGNITION_ROOT}/${name}`)
);

const REQUIRED = Object.freeze([
  "package.json","manifest.json","index.js",
  "Data/marion/runtime/marionBridge.js",
  "Data/marion/runtime/composeMarionResponse.js",
  "utils/chatEngine.js","utils/stateSpine.js",
  ...METACOGNITION_REQUIRED
]);

const OPTIONAL = Object.freeze([
  "Data/marion/runtime/marionIntentRouter.js",
  "Data/marion/runtime/marionDomainRegistry.js",
  "Data/marion/runtime/marionFinalEnvelope.js",
  "Data/marion/runtime/marionLoopGuard.js",
  "Data/marion/runtime/marionCurrentTurnAuthority.js",
  "Data/marion/runtime/privateOperatorBoundaryLock.js",
  "Data/marion/runtime/publicIdentityQuestionRefinement.js",
  "Data/marion/runtime/voiceTextParityIdentityDriftHardlock.js",
  "Data/marion/runtime/supervision/marionCognitiveSupervisor.js",
  "utils/nyx_state_controller.js"
]);

function abs(file) { return path.resolve(ROOT, file); }
function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function ownFunction(target, name) {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return null;
  try {
    const d = Object.getOwnPropertyDescriptor(target, name);
    return d && typeof d.value === "function" ? d.value : null;
  } catch (_) { return null; }
}
function hasCallable(target, names) {
  return typeof target === "function" || names.some((name) => !!ownFunction(target, name));
}
function readText(file) {
  const full = abs(file);
  assert.ok(fs.existsSync(full), `Required file is missing: ${file}`);
  const text = fs.readFileSync(full, "utf8");
  assert.strictEqual(CONFLICT_RE.test(text), false, `Merge-conflict marker found: ${file}`);
  return text;
}
function readJson(file) {
  const text = readText(file);
  try { return JSON.parse(text); }
  catch (error) { assert.fail(`Invalid JSON in ${file}: ${error.message}`); }
}

function assertCanonicalMetacognitionPath() {
  const missing=METACOGNITION_REQUIRED.filter((relativePath)=>!fs.existsSync(abs(relativePath)));
  assert.deepStrictEqual(missing,[],`Canonical Layer 28 metacognition files are missing: ${missing.join(", ")}`);
  for(const relativePath of METACOGNITION_REQUIRED){
    const candidate=abs(relativePath),resolved=require.resolve(candidate);
    assert.strictEqual(path.normalize(resolved).toLowerCase(),path.normalize(candidate).toLowerCase(),
      `Layer 28 metacognition resolution drifted: ${relativePath}`);
  }
  const supervisor=readText("Data/marion/runtime/supervision/marionCognitiveSupervisor.js");
  assert.strictEqual(/path\.join\(\s*__dirname\s*,\s*["']metacognition["']\s*\)/m.test(supervisor),false,
    "Cognitive Supervisor still resolves stale supervision/metacognition.");
  assert.ok(/path\.join\(\s*__dirname\s*,\s*["']\.\.["']\s*,\s*["']metacognition["']\s*\)/m.test(supervisor),
    "Cognitive Supervisor does not resolve canonical runtime/metacognition.");
  return {root:CANONICAL_METACOGNITION_ROOT,files:[...METACOGNITION_REQUIRED]};
}

function syntaxCheck(file) {
  const r = childProcess.spawnSync(process.execPath, ["--check", file], {
    cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 30000,
    maxBuffer: 4 * 1024 * 1024
  });
  assert.strictEqual(r.error, undefined, r.error && r.error.message);
  assert.strictEqual(r.status, 0, [`Syntax check failed: ${path.relative(ROOT,file)}`, r.stdout || "", r.stderr || ""].join("\n"));
}
function runIsolated(name, source, timeout = 60000) {
  const r = childProcess.spawnSync(process.execPath, ["--trace-warnings", "-e", source], {
    cwd: ROOT,
    env: { ...process.env, NODE_OPTIONS: "", SB_TTS_LOG_ENABLED: "false" },
    encoding: "utf8", windowsHide: true, timeout, maxBuffer: 12 * 1024 * 1024
  });
  assert.strictEqual(r.error, undefined, r.error && r.error.message);
  const output = `${r.stdout || ""}\n${r.stderr || ""}`;
  assert.strictEqual(r.status, 0, [`Isolated case failed: ${name}`, output].join("\n"));
  assert.strictEqual(WARNING_RE.test(output), false, [`Circular warning detected: ${name}`, output].join("\n"));
  return { name, ok: true, warnings: 0, stdout: String(r.stdout || "").trim() };
}
function assertPackage() {
  const pkg = readJson("package.json");
  assert.ok(isObj(pkg.scripts), "package.json scripts are missing.");
  assert.strictEqual(pkg.scripts["test:marion-round1"], "node tests/marion/layers_1_28/round1/run_round1_certification.js", "Round 1 package path drifted.");
  assert.strictEqual(pkg.type, "commonjs", "CommonJS architecture changed.");
  assert.ok(isObj(pkg.engines) && typeof pkg.engines.node === "string" && pkg.engines.node.trim(), "Node engine declaration is missing.");
  return { name: String(pkg.name || ""), version: String(pkg.version || ""), node: pkg.engines.node };
}
function assertFiles() {
  const missing = REQUIRED.filter((file) => !fs.existsSync(abs(file)));
  assert.deepStrictEqual(missing, [], `Missing Round 1 core files: ${missing.join(", ")}`);
  return OPTIONAL.filter((file) => fs.existsSync(abs(file)));
}
function assertManifest() {
  const manifest = readJson("manifest.json");
  const indexText = readText("index.js");
  const summary = isObj(manifest.summary) ? manifest.summary : {};
  const architecture = isObj(manifest.architecture) ? manifest.architecture : {};
  const layers = Array.isArray(summary.conversationLayersIncluded)
    ? [...new Set(summary.conversationLayersIncluded.map(Number).filter(Number.isInteger))].sort((a,b)=>a-b)
    : [];

  const baselineFlag = summary.baselineLayers1to8ValidatedAsExistingRuntimeInvariants === true;
  const baselineExplicit = Array.from({length:8},(_,i)=>i+1).every((layer)=>layers.includes(layer));
  assert.ok(
    baselineFlag || baselineExplicit,
    "Layers 1–8 must be represented by the baseline-invariants flag or explicit manifest entries."
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

  const laterLayersExplicit = layers.includes(27) && layers.includes(28);
  const laterLayersRegistered =
    indexText.includes("MARION_LAYERS_27_28_INDEX_REGISTRY_V1_START") &&
    /hardStopLayer\s*:\s*28/.test(indexText);
  assert.ok(
    laterLayersExplicit || laterLayersRegistered,
    "Layers 27–28 must be explicit in the manifest or registered by the canonical index integration."
  );

  const summaryHardStop = Number(summary.hardStopLayer);
  const architectureHardStop = Number(architecture.hardStopLayer);
  assert.strictEqual(summaryHardStop,GLOBAL_HARD_STOP_LAYER,"Manifest summary hard stop must remain Layer 28.");
  assert.strictEqual(architectureHardStop,CONVERSATION_HARD_STOP_LAYER,"Conversation architecture hard stop must remain Layer 26.");
  assert.strictEqual(Number(architecture.phaseAHardStopLayer),PHASE_A_HARD_STOP_LAYER,"Phase A hard stop must remain Layer 24.");
  assert.strictEqual(layers.some((layer)=>layer>GLOBAL_HARD_STOP_LAYER),false,"Layer 29 or later must not be registered.");
  assert.strictEqual(summary.additionalLayerRecommended,false,"No additional Marion layer may be recommended.");
  assert.notStrictEqual(architecture.automaticExecutionAllowed,true,"Automatic execution must remain disabled.");
  assert.notStrictEqual(architecture.replyAuthorityReplaced,true,"Reply authority must not be replaced.");

  return {
    baselineLayers1to8: baselineFlag ? "baseline-invariants-flag" : "explicit-manifest-entries",
    conversationLayers9to26: layers.filter((n)=>n>=9&&n<=26),
    layers27to28: laterLayersExplicit ? "explicit-manifest-entries" : "canonical-index-registry",
    summaryHardStop,
    architectureHardStop,
    indexRegistryVerified: laterLayersRegistered
  };
}
function checkSyntax() {
  const files = [...REQUIRED, ...OPTIONAL]
    .filter((file) => file.endsWith(".js") && fs.existsSync(abs(file)))
    .map(abs);
  files.forEach(syntaxCheck);
  return files.map((file) => path.relative(ROOT, file));
}
function coreProbe(order) {
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
    assert.ok(has(state,["createState","hydrate","coerceState","finalizeTurn","normalizeStateForPipelineCohesion","default"]),"StateSpine has no callable entry point.");
    console.log(JSON.stringify({ok:true,order:${JSON.stringify(order)}}));
  `;
}
function loadChecks() {
  const order=["./Data/marion/runtime/marionBridge.js","./Data/marion/runtime/composeMarionResponse.js","./utils/chatEngine.js","./utils/stateSpine.js"];
  return [runIsolated("round1-canonical-core-load",coreProbe(order)),runIsolated("round1-reverse-core-load",coreProbe([...order].reverse()))];
}
function isRound1Test(name) {
  if (name === SELF || name.startsWith("_") || !name.endsWith(".js")) return false;
  if (/^run_round\d+_certification\.js$/i.test(name)) return false;
  return /(?:^|[_\-.])(?:test|certification)(?:[_\-.]|$)/i.test(name);
}
function discoverTests() {
  return fs.readdirSync(ROUND_DIR,{withFileTypes:true})
    .filter((e)=>e.isFile()&&isRound1Test(e.name))
    .map((e)=>path.join(ROUND_DIR,e.name))
    .sort((a,b)=>a.localeCompare(b));
}
function runTest(file) {
  syntaxCheck(file);
  const r=childProcess.spawnSync(process.execPath,["--trace-warnings",file],{
    cwd:ROOT,env:{...process.env,NODE_OPTIONS:"",SB_TTS_LOG_ENABLED:"false"},encoding:"utf8",windowsHide:true,timeout:90000,maxBuffer:16*1024*1024
  });
  assert.strictEqual(r.error,undefined,r.error&&r.error.message);
  const output=`${r.stdout||""}\n${r.stderr||""}`;
  assert.strictEqual(r.status,0,[`Round 1 test failed: ${path.basename(file)}`,output].join("\n"));
  assert.strictEqual(WARNING_RE.test(output),false,[`Circular warning in ${path.basename(file)}`,output].join("\n"));
  return {file:path.basename(file),ok:true,warnings:0,stdout:String(r.stdout||"").trim()};
}
function main() {
  const packageProfile=assertPackage();
  const optionalPresent=assertFiles();
  const manifest=assertManifest();
  const canonicalMetacognition=assertCanonicalMetacognitionPath();
  const syntaxChecks=checkSyntax();
  const isolatedLoadChecks=loadChecks();
  const discovered=discoverTests();
  assert.ok(discovered.length>0,"Round 1 companion certification inventory is empty; folder incomplete.");
  const executed=discovered.map(runTest);
  console.log(JSON.stringify({
    ok:true,certification:"marion-layers-1-28-round1",version:VERSION,backendRoot:ROOT,
    package:packageProfile,requiredCoreFiles:REQUIRED.length,optionalCohesionFilesPresent:optionalPresent,
    manifest,canonicalMetacognition,syntaxChecks,isolatedLoadChecks,discoveredRound1Tests:discovered.map((file)=>path.basename(file)),executedRound1Tests:executed,
    circularWarnings:0,failFast:true
  },null,2));
}
try { main(); }
catch (error) { console.error(error&&error.stack?error.stack:error); process.exitCode=1; }
